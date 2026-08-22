import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  listProjectHistory,
  recordMissionExecutionError,
  recordMissionExecutionSuccess,
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
    execution: { sessionId: 'session-1', result: 'resultado' },
  })

  assert.deepEqual(created.data, {
    outcome: 'SUCCESS',
    fromStatus: 'pending',
    toStatus: 'validation',
    sessionId: 'session-1',
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
  })

  assert.deepEqual(created.data, {
    outcome: 'ERROR',
    fromStatus: 'correction',
    toStatus: 'failed',
    errorMessage: 'falha técnica',
  })
  assert.equal(Object.hasOwn(created.data, 'stack'), false)
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
