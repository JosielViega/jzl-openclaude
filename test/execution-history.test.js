import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  listProjectHistory,
  recordMissionExecutionError,
  recordMissionExecutionSuccess,
  recordMissionReviewFinished,
  recordMissionReviewCorrectionRequested,
  recordMissionReviewUnavailable,
  recordMissionPlanFinished,
  recordMissionPlanUnavailable,
  recordMissionValidationFinished,
  recordMissionValidationUnavailable,
} from '../src/execution-history.js'
import { createProjectContext } from '../src/project-context.js'

function createContext(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-execution-history-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return createProjectContext(root)
}

function validation(status = 'PASS') {
  return {
    status,
    results: [{
      id: 'php-syntax:index.php',
      status,
      evidence: {
        exitCode: status === 'PASS' ? 0 : 1,
        signal: null,
        stdout: '',
        stderr: '',
        errorMessage: null,
      },
    }],
  }
}

test('registra execution SUCCESS sem prompt ou projectRoot', (t) => {
  const context = createContext(t)
  const created = recordMissionExecutionSuccess(context, {
    missionId: 'mission-0001',
    fromStatus: 'pending',
    execution: { sessionId: 'session-1', model: 'model-a', result: 'resultado' },
  })

  assert.deepEqual(created.data, {
    outcome: 'SUCCESS',
    fromStatus: 'pending',
    toStatus: 'validation',
    sessionId: 'session-1',
    model: 'model-a',
    result: 'resultado',
  })
  assert.equal(JSON.stringify(created).includes('prompt'), false)
  assert.equal(JSON.stringify(created).includes(context.projectRoot), false)
})

test('registra execution ERROR normalizando somente a mensagem', (t) => {
  const context = createContext(t)
  const created = recordMissionExecutionError(context, {
    missionId: 'mission-0001',
    fromStatus: 'correction',
    error: new Error('falha técnica'),
    sessionId: null,
    model: null,
  })

  assert.deepEqual(created.data, {
    outcome: 'ERROR',
    fromStatus: 'correction',
    toStatus: 'failed',
    sessionId: null,
    model: null,
    errorMessage: 'falha técnica',
  })
  assert.equal(Object.hasOwn(created.data, 'stack'), false)
})

test('registra sessionId retornado em execution ERROR', (t) => {
  const context = createContext(t)
  const created = recordMissionExecutionError(context, {
    missionId: 'mission-0001',
    fromStatus: 'pending',
    error: new Error('provider falhou'),
    sessionId: 'session-openclaude',
    model: 'model-a',
  })

  assert.equal(created.data.sessionId, 'session-openclaude')
  assert.equal(created.data.errorMessage, 'provider falhou')
})

test('registra validation finished e unavailable', (t) => {
  const context = createContext(t)
  const finished = recordMissionValidationFinished(context, {
    missionId: 'mission-0001',
    validation: validation('PASS'),
    toStatus: 'completed',
  })
  const unavailable = recordMissionValidationUnavailable(context, {
    missionId: 'mission-0002',
    error: 'sem validators',
  })

  assert.equal(finished.type, 'mission.validation.finished')
  assert.equal(finished.data.outcome, 'PASS')
  assert.equal(finished.data.toStatus, 'completed')
  assert.equal(unavailable.type, 'mission.validation.unavailable')
  assert.equal(unavailable.data.errorMessage, 'sem validators')
})

test('lista novo array em ordem e filtra sem consultar State Store', (t) => {
  const context = createContext(t)
  recordMissionValidationUnavailable(context, {
    missionId: 'mission-0002', error: 'primeiro',
  })
  recordMissionValidationUnavailable(context, {
    missionId: 'mission-0001', error: 'segundo',
  })
  recordMissionValidationUnavailable(context, {
    missionId: 'mission-0002', error: 'terceiro',
  })

  const all = listProjectHistory(context)
  const filtered = listProjectHistory(context, 'mission-0002')

  assert.deepEqual(all.map(({ id }) => id), ['event-000001', 'event-000002', 'event-000003'])
  assert.deepEqual(filtered.map(({ id }) => id), ['event-000001', 'event-000003'])
  assert.notStrictEqual(all, listProjectHistory(context))
  all[0].data.errorMessage = 'mutado'
  assert.equal(listProjectHistory(context)[0].data.errorMessage, 'primeiro')
  assert.deepEqual(listProjectHistory(context, 'mission-9999'), [])
})

test('rejeita missionId de histórico inválida', (t) => {
  const context = createContext(t)
  assert.throws(() => listProjectHistory(context, 'mission-1'), {
    message: 'missionId de histórico é inválido',
  })
})

test('registra review finished PASS e CONCERNS sem transição', (t) => {
  const context = createContext(t)
  const pass = recordMissionReviewFinished(context, {
    missionId: 'mission-0001',
    review: {
      sessionId: 'review-1', model: 'review-model', verdict: 'PASS',
      summary: 'ok', findings: [],
    },
  })
  const concerns = recordMissionReviewFinished(context, {
    missionId: 'mission-0002',
    review: {
      sessionId: 'review-2', model: 'review-model', verdict: 'CONCERNS', summary: 'problema',
      findings: [{ severity: 'LOW', title: 'x', detail: 'y', paths: [] }],
    },
  })

  assert.equal(pass.type, 'mission.review.finished')
  assert.equal(pass.data.model, 'review-model')
  assert.equal(concerns.data.verdict, 'CONCERNS')
  assert.equal(Object.hasOwn(pass.data, 'fromStatus'), false)
  assert.equal(Object.hasOwn(pass.data, 'toStatus'), false)
})

test('registra review unavailable com ou sem sessionId sem persistir Error', (t) => {
  const context = createContext(t)
  const error = new Error('review falhou')
  error.cause = new Error('segredo')
  const unidentified = recordMissionReviewUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null, error,
  })
  const identified = recordMissionReviewUnavailable(context, {
    missionId: 'mission-0001', sessionId: 'review-session', model: 'review-model',
    error: 'inválido',
  })

  assert.deepEqual(unidentified.data, {
    sessionId: null, model: null, errorMessage: 'review falhou',
  })
  assert.deepEqual(identified.data, {
    sessionId: 'review-session', model: 'review-model', errorMessage: 'inválido',
  })
  assert.equal(JSON.stringify(unidentified).includes('stack'), false)
  assert.equal(JSON.stringify(unidentified).includes('segredo'), false)
})

test('registra autorização de correção por revisão sem alterar State', (t) => {
  const context = createContext(t)
  const event = recordMissionReviewCorrectionRequested(context, {
    missionId: 'mission-0001', reviewEventId: 'event-000123',
  })
  assert.equal(event.type, 'mission.review.correction.requested')
  assert.deepEqual(event.data, {
    reviewEventId: 'event-000123', fromStatus: 'validation', toStatus: 'correction',
  })
})

test('registra planejamento finished sem transição de workflow', (t) => {
  const context = createContext(t)
  const event = recordMissionPlanFinished(context, {
    missionId: 'mission-0001',
    plan: {
      sessionId: 'plan-session', model: 'plan-model', summary: 'Plano.',
      steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['src/app.js'] }],
      risks: [], validation: ['npm test'],
    },
  })
  assert.equal(event.type, 'mission.plan.finished')
  assert.equal(event.data.model, 'plan-model')
  assert.equal(Object.hasOwn(event.data, 'fromStatus'), false)
  assert.equal(Object.hasOwn(event.data, 'toStatus'), false)
})

test('registra planejamento unavailable normalizando somente a mensagem', (t) => {
  const context = createContext(t)
  const error = new Error('planejamento falhou')
  error.cause = new Error('segredo')
  const event = recordMissionPlanUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null, error,
  })
  assert.deepEqual(event.data, {
    sessionId: null, model: null, errorMessage: 'planejamento falhou',
  })
  assert.equal(JSON.stringify(event).includes('stack'), false)
  assert.equal(JSON.stringify(event).includes('segredo'), false)
})

test('planning unavailable audita model e session conhecidos', (t) => {
  const context = createContext(t)
  const event = recordMissionPlanUnavailable(context, {
    missionId: 'mission-0001', sessionId: 'plan-session', model: 'plan-model',
    error: 'timeout',
  })
  assert.deepEqual(event.data, {
    sessionId: 'plan-session', model: 'plan-model', errorMessage: 'timeout',
  })
})
