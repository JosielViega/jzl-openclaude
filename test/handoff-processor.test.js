import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  resolveMissionCorrectionHandoff,
  resolveMissionPlanExecutionHandoff,
} from '../src/handoff-processor.js'
import {
  appendProjectEvent,
  initializeProjectEventStore,
  readProjectEventStore,
} from '../src/project-event-store.js'

function createContext(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-handoff-processor-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return createProjectContext(projectRoot)
}

function result(id, status = 'FAIL', text = `diagnóstico ${id}`) {
  return {
    id,
    status,
    evidence: {
      exitCode: status === 'PASS' ? 0 : 1,
      signal: null,
      stdout: text,
      stderr: '',
      errorMessage: null,
    },
  }
}

function appendValidation(context, {
  missionId = 'mission-0001',
  outcome = 'FAIL',
  results = [result('validator-1')],
} = {}) {
  return appendProjectEvent(context, {
    type: 'mission.validation.finished',
    missionId,
    data: {
      outcome,
      fromStatus: 'validation',
      toStatus: outcome === 'PASS' ? 'completed' : 'correction',
      results,
    },
  })
}

function appendExecution(context) {
  return appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: 'mission-0001',
    data: { outcome: 'SUCCESS', fromStatus: 'pending', toStatus: 'validation', sessionId: 'execution', result: 'ok' },
  })
}

function appendReview(context, verdict = 'CONCERNS') {
  return appendProjectEvent(context, {
    type: 'mission.review.finished', missionId: 'mission-0001',
    data: {
      sessionId: 'review', verdict, summary: verdict === 'PASS' ? 'ok' : 'problema',
      findings: verdict === 'PASS' ? [] : [{ severity: 'HIGH', title: 'Falha', detail: 'Detalhe', paths: ['index.php'] }],
    },
  })
}

function appendAuthorization(context, reviewEventId) {
  return appendProjectEvent(context, {
    type: 'mission.review.correction.requested', missionId: 'mission-0001',
    data: { reviewEventId, fromStatus: 'validation', toStatus: 'correction' },
  })
}

function appendPlan(context, summary = 'Plano A') {
  return appendProjectEvent(context, {
    type: 'mission.plan.finished', missionId: 'mission-0001',
    data: {
      sessionId: `session-${summary}`, model: 'planner-model', summary,
      steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['index.html'] }],
      risks: [], validation: [],
    },
  })
}

function appendPlanApproval(context, planEventId) {
  return appendProjectEvent(context, {
    type: 'mission.plan.approved', missionId: 'mission-0001',
    data: { planEventId },
  })
}

test('resolve o último FAIL compatível como Handoff canônico', (t) => {
  const context = createContext(t)
  appendValidation(context, { results: [result('antigo')] })
  appendValidation(context, { missionId: 'mission-0002', results: [result('outra')] })
  appendValidation(context, { outcome: 'PASS', results: [result('pass', 'PASS')] })
  const selected = appendValidation(context, {
    results: [result('primeiro'), result('ignorado-pass', 'PASS'), result('segundo')],
  })

  const handoff = resolveMissionCorrectionHandoff(context, 'mission-0001')

  assert.deepEqual(handoff, {
    schemaVersion: 1,
    type: 'mission-correction',
    missionId: 'mission-0001',
    source: {
      responsibility: 'mission-validation',
      eventId: selected.id,
    },
    target: { responsibility: 'mission-execution' },
    payload: { failedValidators: [result('primeiro'), result('segundo')] },
  })
})

test('Plan Handoff é opcional sem histórico, approval ou somente com plan', (t) => {
  const missing = createContext(t)
  assert.equal(resolveMissionPlanExecutionHandoff(missing, 'mission-0001'), null)
  const empty = createContext(t)
  initializeProjectEventStore(empty)
  assert.equal(resolveMissionPlanExecutionHandoff(empty, 'mission-0001'), null)
  appendPlan(empty)
  assert.equal(resolveMissionPlanExecutionHandoff(empty, 'mission-0001'), null)
})

test('resolve Plan Handoff autorizado com payload clonado e sem session/model', (t) => {
  const context = createContext(t)
  const plan = appendPlan(context)
  const approval = appendPlanApproval(context, plan.id)
  const before = readProjectEventStore(context)
  const handoff = resolveMissionPlanExecutionHandoff(context, 'mission-0001')
  assert.deepEqual(handoff, {
    schemaVersion: 1, type: 'mission-plan-execution', missionId: 'mission-0001',
    source: { responsibility: 'mission-planning', eventId: plan.id },
    authorization: { eventId: approval.id },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: 'Plano A',
      steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['index.html'] }],
      risks: [], validation: [],
    },
  })
  assert.equal(Object.hasOwn(handoff, 'sessionId'), false)
  assert.equal(Object.hasOwn(handoff, 'model'), false)
  handoff.payload.steps[0].title = 'mutado'
  assert.deepEqual(readProjectEventStore(context), before)
})

test('Plan Handoff falha fechado para source ausente, tipo incorreto ou posterior', (t) => {
  const missing = createContext(t)
  appendPlanApproval(missing, 'event-999999')
  assert.throws(() => resolveMissionPlanExecutionHandoff(missing, 'mission-0001'), /não está disponível/)

  const wrong = createContext(t)
  appendProjectEvent(wrong, {
    type: 'mission.plan.unavailable', missionId: 'mission-0001',
    data: { sessionId: null, model: null, errorMessage: 'x' },
  })
  appendPlanApproval(wrong, 'event-000001')
  assert.throws(() => resolveMissionPlanExecutionHandoff(wrong, 'mission-0001'), /não está disponível/)

  const posterior = createContext(t)
  appendPlanApproval(posterior, 'event-000002')
  appendPlan(posterior)
  assert.throws(() => resolveMissionPlanExecutionHandoff(posterior, 'mission-0001'), /não está disponível/)
})

test('protege latest plan antes e depois da aprovação', (t) => {
  const before = createContext(t)
  const planA = appendPlan(before, 'A')
  appendPlan(before, 'B')
  appendPlanApproval(before, planA.id)
  assert.throws(() => resolveMissionPlanExecutionHandoff(before, 'mission-0001'), /não está disponível/)

  const after = createContext(t)
  const selected = appendPlan(after, 'A')
  appendPlanApproval(after, selected.id)
  appendPlan(after, 'B')
  assert.throws(() => resolveMissionPlanExecutionHandoff(after, 'mission-0001'), /não está disponível/)
})

test('plan.unavailable posterior não invalida e aprovação repetida usa a latest', (t) => {
  const context = createContext(t)
  const plan = appendPlan(context)
  appendPlanApproval(context, plan.id)
  appendProjectEvent(context, {
    type: 'mission.plan.unavailable', missionId: 'mission-0001',
    data: { sessionId: null, model: null, errorMessage: 'x' },
  })
  const latest = appendPlanApproval(context, plan.id)
  const handoff = resolveMissionPlanExecutionHandoff(context, 'mission-0001')
  assert.equal(handoff.source.eventId, plan.id)
  assert.equal(handoff.authorization.eventId, latest.id)
})

test('novo plan aprovado substitui stale anterior', (t) => {
  const context = createContext(t)
  const planA = appendPlan(context, 'A')
  appendPlanApproval(context, planA.id)
  const planB = appendPlan(context, 'B')
  const approvalB = appendPlanApproval(context, planB.id)
  const handoff = resolveMissionPlanExecutionHandoff(context, 'mission-0001')
  assert.equal(handoff.source.eventId, planB.id)
  assert.equal(handoff.authorization.eventId, approvalB.id)
})

test('execution posterior ou latest approval inválido não faz fallback', (t) => {
  const executed = createContext(t)
  const plan = appendPlan(executed)
  appendPlanApproval(executed, plan.id)
  appendExecution(executed)
  assert.throws(() => resolveMissionPlanExecutionHandoff(executed, 'mission-0001'), /não está disponível/)

  const invalidLatest = createContext(t)
  const validPlan = appendPlan(invalidLatest)
  appendPlanApproval(invalidLatest, validPlan.id)
  appendPlanApproval(invalidLatest, 'event-999999')
  assert.throws(() => resolveMissionPlanExecutionHandoff(invalidLatest, 'mission-0001'), /não está disponível/)
})

test('preserva todos os validators, ordem e evidence sem sanitizar', (t) => {
  const context = createContext(t)
  const longText = `${context.projectRoot}:${'x'.repeat(5000)}`
  const results = Array.from({ length: 25 }, (_, index) => (
    result(`validator-${index}`, 'FAIL', longText)
  ))
  appendValidation(context, { results })

  const handoff = resolveMissionCorrectionHandoff(context, 'mission-0001')

  assert.equal(handoff.payload.failedValidators.length, 25)
  assert.deepEqual(
    handoff.payload.failedValidators.map(({ id }) => id),
    results.map(({ id }) => id),
  )
  assert.equal(handoff.payload.failedValidators[0].evidence.stdout, longText)
})

test('não compartilha referências com o Event Store', (t) => {
  const context = createContext(t)
  appendValidation(context)
  const before = readProjectEventStore(context)
  const handoff = resolveMissionCorrectionHandoff(context, 'mission-0001')

  handoff.payload.failedValidators[0].evidence.stdout = 'mutado'

  assert.deepEqual(readProjectEventStore(context), before)
})

test('converte somente histórico ausente em Handoff indisponível', (t) => {
  const context = createContext(t)

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'handoff de correção da Mission não está disponível' },
  )
})

test('rejeita histórico sem FAIL compatível', (t) => {
  const context = createContext(t)
  appendValidation(context, { outcome: 'PASS', results: [result('pass', 'PASS')] })
  appendProjectEvent(context, {
    type: 'mission.validation.unavailable',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'indisponível' },
  })
  appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: 'mission-0001',
    data: {
      outcome: 'ERROR', fromStatus: 'pending', toStatus: 'failed',
      errorMessage: 'falha técnica',
    },
  })

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'handoff de correção da Mission não está disponível' },
  )
})

test('falha fechado quando evento FAIL não possui resultado FAIL', (t) => {
  const context = createContext(t)
  appendValidation(context, {
    outcome: 'FAIL',
    results: [result('resultado-pass', 'PASS')],
  })

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'handoff de correção da Mission não está disponível' },
  )
})

test('propaga corrupção JSON do Event Store', (t) => {
  const context = createContext(t)
  const eventStorePath = initializeProjectEventStore(context)
  writeFileSync(eventStorePath, '{', 'utf8')

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'arquivo de histórico do projeto contém JSON inválido' },
  )
})

test('não altera bytes do projeto durante a resolução', (t) => {
  const context = createContext(t)
  const protectedPath = join(context.projectRoot, 'AGENTS.md')
  writeFileSync(protectedPath, 'conteúdo autoritativo\n', 'utf8')
  const before = readFileSync(protectedPath)
  appendValidation(context)

  resolveMissionCorrectionHandoff(context, 'mission-0001')

  assert.deepEqual(readFileSync(protectedPath), before)
})

test('resolve Handoff causal de review autorizado sem sessionId', (t) => {
  const context = createContext(t)
  appendExecution(context)
  const review = appendReview(context)
  const authorization = appendAuthorization(context, review.id)
  const handoff = resolveMissionCorrectionHandoff(context, 'mission-0001')

  assert.deepEqual(handoff, {
    schemaVersion: 1,
    type: 'mission-review-correction',
    missionId: 'mission-0001',
    source: { responsibility: 'mission-review', eventId: review.id },
    authorization: { eventId: authorization.id },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: 'problema',
      findings: [{ severity: 'HIGH', title: 'Falha', detail: 'Detalhe', paths: ['index.php'] }],
    },
  })
  assert.equal(JSON.stringify(handoff).includes('sessionId'), false)
})

test('review sem autorização bloqueia fallback para FAIL antigo', (t) => {
  const context = createContext(t)
  appendValidation(context)
  appendExecution(context)
  appendReview(context)
  assert.throws(() => resolveMissionCorrectionHandoff(context, 'mission-0001'), {
    message: 'handoff de correção da Mission não está disponível',
  })
})

test('authorization incoerente falha fechado sem fallback antigo', (t) => {
  const context = createContext(t)
  appendValidation(context)
  appendExecution(context)
  const old = appendReview(context)
  appendReview(context)
  appendAuthorization(context, old.id)
  assert.throws(() => resolveMissionCorrectionHandoff(context, 'mission-0001'), {
    message: 'handoff de correção da Mission não está disponível',
  })
})
