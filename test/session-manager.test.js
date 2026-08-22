import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createMissionExecutionSession,
  validateMissionExecutionSession,
} from '../src/session-manager.js'

function mission(status = 'running') {
  return {
    id: 'mission-0001',
    title: 'Executar tarefa',
    objective: 'Alterar somente o necessário',
    status,
    dependencies: [],
  }
}

test('cria política fresh para Mission running sem mutar a Mission', () => {
  const runningMission = mission()
  const snapshot = structuredClone(runningMission)
  const session = createMissionExecutionSession(runningMission)

  assert.deepEqual(session, {
    responsibility: 'mission-execution',
    mode: 'fresh',
    missionId: 'mission-0001',
  })
  assert.deepEqual(Object.keys(session), ['responsibility', 'mode', 'missionId'])
  assert.notStrictEqual(session, runningMission)
  assert.deepEqual(runningMission, snapshot)
  assert.equal(Object.hasOwn(session, 'sessionId'), false)
})

test('cada criação retorna um novo descriptor', () => {
  const runningMission = mission()

  assert.notStrictEqual(
    createMissionExecutionSession(runningMission),
    createMissionExecutionSession(runningMission),
  )
})

for (const status of [
  'pending',
  'failed',
  'correction',
  'validation',
  'completed',
]) {
  test(`rejeita Mission ${status}`, () => {
    assert.throws(
      () => createMissionExecutionSession(mission(status)),
      { message: 'Mission deve estar running para criar sessão de execução' },
    )
  })
}

test('valida descriptor fresh e ignora campos extras sem usá-los', () => {
  const descriptor = {
    responsibility: 'mission-execution',
    mode: 'fresh',
    missionId: 'mission-0001',
    sessionId: 'não controlador',
    resume: true,
  }

  assert.strictEqual(validateMissionExecutionSession(descriptor), descriptor)
})

for (const [name, descriptor, message] of [
  ['container', null, 'sessão de execução deve ser um objeto'],
  ['responsibility', {
    responsibility: 'other', mode: 'fresh', missionId: 'mission-0001',
  }, 'responsabilidade da sessão de execução não é suportada'],
  ['mode', {
    responsibility: 'mission-execution', mode: 'resume', missionId: 'mission-0001',
  }, 'modo da sessão de execução não é suportado'],
  ['missionId', {
    responsibility: 'mission-execution', mode: 'fresh', missionId: 'mission-1',
  }, 'missionId da sessão de execução é inválido'],
]) {
  test(`rejeita descriptor inválido: ${name}`, () => {
    assert.throws(
      () => validateMissionExecutionSession(descriptor),
      { message },
    )
  })
}
