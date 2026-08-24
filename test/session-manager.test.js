import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createMissionExecutionSession,
  createMissionReviewSession,
  createMissionPlanningSession,
  validateMissionExecutionSession,
  validateMissionReviewSession,
  validateMissionPlanningSession,
  validateMissionSession,
} from '../src/session-manager.js'
import { resolveResponsibilityDefinition } from '../src/responsibility-registry.js'

function mission(status = 'running') {
  return {
    id: 'mission-0001',
    title: 'Executar tarefa',
    objective: 'Alterar somente o necessário',
    status,
    dependencies: [],
  }
}

test('cria sessão fresh de revisão para Mission validation sem mutar', () => {
  const validationMission = mission('validation')
  const snapshot = structuredClone(validationMission)
  const session = createMissionReviewSession(validationMission)

  assert.deepEqual(session, {
    responsibility: 'mission-review',
    mode: 'fresh',
    missionId: 'mission-0001',
  })
  assert.deepEqual(validationMission, snapshot)
})

test('cria e valida sessão fresh de planejamento para Mission pending', () => {
  const pendingMission = mission('pending')
  const snapshot = structuredClone(pendingMission)
  const session = createMissionPlanningSession(pendingMission)
  assert.deepEqual(session, {
    responsibility: 'mission-planning', mode: 'fresh', missionId: 'mission-0001',
  })
  assert.strictEqual(validateMissionPlanningSession(session), session)
  assert.strictEqual(validateMissionSession(session), session)
  assert.deepEqual(pendingMission, snapshot)
})

for (const status of ['running', 'failed', 'correction', 'validation', 'completed']) {
  test(`rejeita Mission ${status} para sessão de planejamento`, () => {
    assert.throws(() => createMissionPlanningSession(mission(status)), {
      message: 'Mission deve estar pending para criar sessão de planejamento',
    })
  })
}

for (const [value, message] of [
  [null, 'sessão de planejamento deve ser um objeto'],
  [{ responsibility: 'mission-review', mode: 'fresh', missionId: 'mission-0001' }, 'responsabilidade da sessão de planejamento não é suportada'],
  [{ responsibility: 'mission-planning', mode: 'resume', missionId: 'mission-0001' }, 'modo da sessão de planejamento não é suportado'],
  [{ responsibility: 'mission-planning', mode: 'fresh', missionId: 'mission-1' }, 'missionId da sessão de planejamento é inválido'],
]) {
  test(`rejeita sessão de planejamento inválida: ${message}`, () => {
    assert.throws(() => validateMissionPlanningSession(value), { message })
  })
}

for (const status of ['pending', 'running', 'failed', 'correction', 'completed']) {
  test(`rejeita Mission ${status} para sessão de revisão`, () => {
    assert.throws(
      () => createMissionReviewSession(mission(status)),
      { message: 'Mission deve estar validation para criar sessão de revisão' },
    )
  })
}

test('validator genérico aceita execution, review e planning fresh', () => {
  const execution = createMissionExecutionSession(mission('running'))
  const review = createMissionReviewSession(mission('validation'))
  const planning = createMissionPlanningSession(mission('pending'))

  assert.strictEqual(validateMissionSession(execution), execution)
  assert.strictEqual(validateMissionSession(review), review)
  assert.strictEqual(validateMissionSession(planning), planning)
})

test('descriptors usam sessionMode do Registry sem vazar outros contratos', () => {
  const execution = createMissionExecutionSession(mission('running'))
  const review = createMissionReviewSession(mission('validation'))

  for (const session of [execution, review]) {
    const definition = resolveResponsibilityDefinition(session.responsibility)
    assert.equal(session.mode, definition.sessionMode)
    assert.deepEqual(Object.keys(session), ['responsibility', 'mode', 'missionId'])
    for (const field of [
      'sessionMode', 'toolAccess', 'queryTimeoutMs',
      'watchdogGraceMs', 'requiresModelRoute',
    ]) assert.equal(Object.hasOwn(session, field), false)
  }
})

test('validator genérico falha fechado para descriptors inválidos', () => {
  for (const [descriptor, message] of [
    [null, 'sessão de Mission deve ser um objeto'],
    [{ responsibility: 'other', mode: 'fresh', missionId: 'mission-0001' }, 'responsabilidade da sessão de Mission não é suportada'],
    [{ responsibility: 'mission-review', mode: 'resume', missionId: 'mission-0001' }, 'modo da sessão de Mission não é suportado'],
    [{ responsibility: 'mission-review', mode: 'fresh', missionId: 'mission-1' }, 'missionId da sessão de Mission é inválido'],
  ]) {
    assert.throws(() => validateMissionSession(descriptor), { message })
  }
})

test('validators especializados não confundem responsabilidades', () => {
  const execution = createMissionExecutionSession(mission('running'))
  const review = createMissionReviewSession(mission('validation'))

  assert.strictEqual(validateMissionExecutionSession(execution), execution)
  assert.strictEqual(validateMissionReviewSession(review), review)
  assert.throws(
    () => validateMissionExecutionSession(review),
    { message: 'responsabilidade da sessão de execução não é suportada' },
  )
  assert.throws(
    () => validateMissionReviewSession(execution),
    { message: 'responsabilidade da sessão de revisão não é suportada' },
  )
})

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
