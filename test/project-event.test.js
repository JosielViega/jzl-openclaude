import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createProjectEvent, validateProjectEvent } from '../src/project-event.js'

const occurredAt = '2026-08-22T12:34:56.789Z'

function evidence(overrides = {}) {
  return {
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage: null,
    ...overrides,
  }
}

function event(type, data, overrides = {}) {
  return {
    id: 'event-000001',
    type,
    occurredAt,
    missionId: 'mission-0001',
    data,
    ...overrides,
  }
}

function executionSuccess(overrides = {}) {
  return event('mission.execution.finished', {
    outcome: 'SUCCESS',
    fromStatus: 'pending',
    toStatus: 'validation',
    sessionId: 'session-1',
    result: '',
    ...overrides,
  })
}

function executionError(overrides = {}) {
  return event('mission.execution.finished', {
    outcome: 'ERROR',
    fromStatus: 'failed',
    toStatus: 'failed',
    errorMessage: 'falha técnica',
    ...overrides,
  })
}

function validation(outcome, toStatus, overrides = {}) {
  return event('mission.validation.finished', {
    outcome,
    fromStatus: 'validation',
    toStatus,
    results: [{ id: 'php-syntax:index.php', status: outcome, evidence: evidence() }],
    ...overrides,
  })
}

test('aceita eventos de execução SUCCESS e ERROR', () => {
  const success = executionSuccess()
  const error = executionError()
  assert.strictEqual(validateProjectEvent(success), success)
  assert.strictEqual(validateProjectEvent(error), error)
})

test('aceita execution ERROR legacy e sessionId string ou null', () => {
  const legacy = executionError()
  const identified = executionError({ sessionId: 'session-1' })
  const unidentified = executionError({ sessionId: null })

  assert.strictEqual(validateProjectEvent(legacy), legacy)
  assert.strictEqual(validateProjectEvent(identified), identified)
  assert.strictEqual(validateProjectEvent(unidentified), unidentified)
})

test('rejeita sessionId inválido em execution ERROR', () => {
  for (const sessionId of [123, '']) {
    assert.throws(
      () => validateProjectEvent(executionError({ sessionId })),
      { message: 'sessionId do evento de execução é inválido' },
    )
  }
})

test('aceita validation PASS, FAIL e ERROR coerentes', () => {
  for (const [outcome, toStatus] of [
    ['PASS', 'completed'],
    ['FAIL', 'correction'],
    ['ERROR', 'validation'],
  ]) {
    const value = validation(outcome, toStatus)
    assert.strictEqual(validateProjectEvent(value), value)
  }
})

test('aceita validation unavailable', () => {
  const value = event('mission.validation.unavailable', {
    status: 'validation',
    errorMessage: 'config ausente',
  })
  assert.strictEqual(validateProjectEvent(value), value)
})

test('valida shape de validation unavailable', () => {
  assert.throws(() => validateProjectEvent(event(
    'mission.validation.unavailable',
    { status: 'failed', errorMessage: 'x' },
  )), /status/)
  assert.throws(() => validateProjectEvent(event(
    'mission.validation.unavailable',
    { status: 'validation', errorMessage: '' },
  )), /errorMessage/)
})

for (const [name, value, message] of [
  ['container null', null, 'evento deve ser um objeto'],
  ['id ausente', { ...executionSuccess(), id: undefined }, 'id do evento é obrigatório'],
  ['id inválido', { ...executionSuccess(), id: 'event-1' }, 'id do evento é inválido'],
  ['type ausente', { ...executionSuccess(), type: undefined }, 'type do evento é obrigatório'],
  ['type não string', { ...executionSuccess(), type: 1 }, 'type do evento deve ser uma string'],
  ['type desconhecido', { ...executionSuccess(), type: 'other' }, 'type do evento não é suportado'],
  ['occurredAt ausente', { ...executionSuccess(), occurredAt: undefined }, 'occurredAt do evento é obrigatório'],
  ['occurredAt inválido', { ...executionSuccess(), occurredAt: '2026-08-22' }, 'occurredAt do evento é inválido'],
  ['missionId ausente', { ...executionSuccess(), missionId: undefined }, 'missionId do evento é obrigatório'],
  ['missionId inválido', { ...executionSuccess(), missionId: 'mission-1' }, 'missionId do evento é inválido'],
  ['data ausente', { ...executionSuccess(), data: undefined }, 'data do evento é obrigatório'],
  ['data inválida', { ...executionSuccess(), data: [] }, 'data do evento deve ser um objeto'],
]) {
  test(`rejeita ${name}`, () => {
    assert.throws(() => validateProjectEvent(value), { message })
  })
}

test('rejeita mappings incoerentes de execução', () => {
  assert.throws(() => validateProjectEvent(executionSuccess({ toStatus: 'failed' })), {
    message: 'mapeamento do evento de execução é incoerente',
  })
  assert.throws(() => validateProjectEvent(executionError({ toStatus: 'validation' })), {
    message: 'mapeamento do evento de execução é incoerente',
  })
})

test('valida campos específicos de execução', () => {
  assert.throws(() => validateProjectEvent(executionSuccess({ fromStatus: 'running' })), /fromStatus/)
  assert.throws(() => validateProjectEvent(executionSuccess({ sessionId: '' })), /sessionId/)
  assert.throws(() => validateProjectEvent(executionSuccess({ result: 1 })), /result/)
  assert.throws(() => validateProjectEvent(executionError({ errorMessage: '' })), /errorMessage/)
})

test('rejeita mappings incoerentes de validação', () => {
  for (const value of [
    validation('PASS', 'correction'),
    validation('FAIL', 'completed'),
    validation('ERROR', 'failed'),
    validation('PASS', 'completed', { fromStatus: 'running' }),
  ]) {
    assert.throws(() => validateProjectEvent(value), /mapeamento/)
  }
})

test('valida results e evidence de validação', () => {
  assert.throws(() => validateProjectEvent(validation('PASS', 'completed', { results: [] })), /array não vazio/)
  assert.throws(() => validateProjectEvent(validation('PASS', 'completed', { results: [null] })), /resultado de validação/)
  assert.throws(() => validateProjectEvent(validation('PASS', 'completed', { results: [{ id: '', status: 'PASS', evidence: evidence() }] })), /id do resultado/)
  assert.throws(() => validateProjectEvent(validation('PASS', 'completed', { results: [{ id: 'x', status: 'OTHER', evidence: evidence() }] })), /status do resultado/)
  assert.throws(() => validateProjectEvent(validation('PASS', 'completed', { results: [{ id: 'x', status: 'PASS', evidence: null }] })), /evidence/)

  for (const invalidEvidence of [
    evidence({ exitCode: '0' }),
    evidence({ signal: 1 }),
    evidence({ stdout: null }),
    evidence({ stderr: null }),
    evidence({ errorMessage: 1 }),
  ]) {
    assert.throws(() => validateProjectEvent(validation('PASS', 'completed', {
      results: [{ id: 'x', status: 'PASS', evidence: invalidEvidence }],
    })))
  }
})

test('preserva campos aditivos e retorna a mesma referência', () => {
  const value = validation('PASS', 'completed')
  value.extra = true
  value.data.extra = true
  value.data.results[0].extra = true
  value.data.results[0].evidence.extra = true

  assert.strictEqual(validateProjectEvent(value), value)
  assert.equal(value.data.results[0].evidence.extra, true)
})

test('create gera ID inicial e timestamp ISO sem mutar entradas', () => {
  const existing = []
  const input = {
    type: 'mission.validation.unavailable',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'indisponível' },
    metadata: { keep: true },
  }
  const inputSnapshot = structuredClone(input)
  const before = Date.now()
  const created = createProjectEvent(existing, input)
  const after = Date.now()

  assert.equal(created.id, 'event-000001')
  assert.ok(Date.parse(created.occurredAt) >= before)
  assert.ok(Date.parse(created.occurredAt) <= after)
  assert.deepEqual(input, inputSnapshot)
  assert.deepEqual(existing, [])
  assert.deepEqual(created.metadata, { keep: true })
})

test('create usa max + 1, preserva gaps e suporta BigInt', () => {
  const first = { ...executionSuccess(), id: 'event-000001' }
  const large = { ...executionError(), id: 'event-100000000000000000000' }
  const input = {
    type: 'mission.validation.unavailable',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'x' },
  }

  assert.equal(
    createProjectEvent([first, { ...executionError(), id: 'event-000005' }], input).id,
    'event-000006',
  )
  assert.equal(
    createProjectEvent([large], input).id,
    'event-100000000000000000001',
  )
})

test('create rejeita controle externo e coleção existente inválida', () => {
  const input = {
    type: 'mission.validation.unavailable',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'x' },
  }
  assert.throws(() => createProjectEvent({}, input), { message: 'events deve ser um array' })
  assert.throws(() => createProjectEvent([], { ...input, id: 'event-000001' }), { message: 'id do evento é controlado pelo JZL' })
  assert.throws(() => createProjectEvent([], { ...input, occurredAt }), { message: 'occurredAt do evento é controlado pelo JZL' })
  const duplicate = executionSuccess()
  assert.throws(() => createProjectEvent([duplicate, { ...duplicate }], input), { message: 'ids dos eventos não podem ser duplicados' })
})
