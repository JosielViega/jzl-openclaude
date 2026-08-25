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

test('audita model opcional em eventos de execução sem quebrar legacy', () => {
  for (const value of [
    executionSuccess(),
    executionSuccess({ model: 'model-a' }),
    executionError(),
    executionError({ model: null }),
    executionError({ model: 'model-a' }),
  ]) assert.strictEqual(validateProjectEvent(value), value)

  for (const value of [
    executionSuccess({ model: '' }),
    executionError({ model: '' }),
    executionError({ model: 1 }),
  ]) assert.throws(() => validateProjectEvent(value), {
    message: 'model do evento de execução é inválido',
  })
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

test('aceita review PASS e CONCERNS sem transição de workflow', () => {
  for (const data of [
    { sessionId: 'session-review-1', verdict: 'PASS', summary: 'Tudo certo.', findings: [] },
    {
      sessionId: 'session-review-2', verdict: 'CONCERNS', summary: 'Há problema.',
      findings: [{ severity: 'HIGH', title: 'Falha', detail: 'Detalhe', paths: ['index.php'] }],
    },
  ]) {
    const value = event('mission.review.finished', data)
    assert.strictEqual(validateProjectEvent(value), value)
    assert.equal(Object.hasOwn(value.data, 'fromStatus'), false)
    assert.equal(Object.hasOwn(value.data, 'toStatus'), false)
  }
})

test('valida review finished e coerência de findings', () => {
  const base = { sessionId: 'session-review', verdict: 'PASS', summary: 'ok', findings: [] }
  assert.throws(() => validateProjectEvent(event('mission.review.finished', {
    ...base, sessionId: '',
  })), /sessionId/)
  assert.throws(() => validateProjectEvent(event('mission.review.finished', {
    ...base, verdict: 'OTHER',
  })), /verdict/)
  assert.throws(() => validateProjectEvent(event('mission.review.finished', {
    ...base, findings: [{ severity: 'LOW', title: 'x', detail: 'x', paths: [] }],
  })), /incoerente/)
})

test('aceita review unavailable com sessionId null ou identificado', () => {
  for (const sessionId of [null, 'session-review']) {
    const value = event('mission.review.unavailable', {
      sessionId, errorMessage: 'provider indisponível',
    })
    assert.strictEqual(validateProjectEvent(value), value)
  }
})

test('audita model opcional em eventos de revisão sem quebrar legacy', () => {
  const finishedBase = {
    sessionId: 'session-review', verdict: 'PASS', summary: 'ok', findings: [],
  }
  for (const data of [finishedBase, { ...finishedBase, model: 'review-model' }]) {
    const value = event('mission.review.finished', data)
    assert.strictEqual(validateProjectEvent(value), value)
  }
  for (const model of [null, 'review-model']) {
    const value = event('mission.review.unavailable', {
      sessionId: null, model, errorMessage: 'indisponível',
    })
    assert.strictEqual(validateProjectEvent(value), value)
  }
  assert.throws(() => validateProjectEvent(event('mission.review.finished', {
    ...finishedBase, model: '',
  })), { message: 'model do evento de revisão é inválido' })
  assert.throws(() => validateProjectEvent(event('mission.review.unavailable', {
    sessionId: null, model: '', errorMessage: 'indisponível',
  })), { message: 'model do evento de revisão é inválido' })
})

test('valida review unavailable e preserva campos aditivos', () => {
  assert.throws(() => validateProjectEvent(event('mission.review.unavailable', {
    sessionId: '', errorMessage: 'x',
  })), /sessionId/)
  assert.throws(() => validateProjectEvent(event('mission.review.unavailable', {
    sessionId: null, errorMessage: '',
  })), /errorMessage/)
  const value = event('mission.review.unavailable', {
    sessionId: null, errorMessage: 'x', extra: true,
  }, { extra: true })
  assert.strictEqual(validateProjectEvent(value), value)
  assert.equal(value.data.extra, true)
})

test('aceita eventos canônicos de planejamento sem transição', () => {
  const finished = event('mission.plan.finished', {
    sessionId: 'plan-session', model: 'plan-model', summary: 'Plano.',
    steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['src/app.js'] }],
    risks: [], validation: ['npm test'], extra: true,
  })
  const unavailable = event('mission.plan.unavailable', {
    sessionId: null, model: null, errorMessage: 'indisponível', extra: true,
  })
  assert.strictEqual(validateProjectEvent(finished), finished)
  assert.strictEqual(validateProjectEvent(unavailable), unavailable)
  assert.equal(Object.hasOwn(finished.data, 'fromStatus'), false)
  assert.equal(Object.hasOwn(finished.data, 'toStatus'), false)
})

test('valida identidade e resultado de planning finished', () => {
  const base = {
    sessionId: 'plan-session', model: 'plan-model', summary: 'Plano.',
    steps: [{ title: 'Passo', detail: 'Detalhe', paths: [] }], risks: [], validation: [],
  }
  for (const [data, message] of [
    [{ ...base, sessionId: '' }, 'sessionId do evento de planejamento é inválido'],
    [{ ...base, model: '' }, 'model do evento de planejamento é inválido'],
    [{ ...base, summary: '' }, 'summary do planejamento é inválido'],
    [{ ...base, steps: [] }, 'steps do planejamento deve ser um array não vazio'],
  ]) assert.throws(() => validateProjectEvent(event('mission.plan.finished', data)), { message })
})

test('planning unavailable exige propriedades nullable e mensagem', () => {
  for (const [data, message] of [
    [{ model: null, errorMessage: 'x' }, 'sessionId do evento de planejamento é inválido'],
    [{ sessionId: null, errorMessage: 'x' }, 'model do evento de planejamento é inválido'],
    [{ sessionId: '', model: null, errorMessage: 'x' }, 'sessionId do evento de planejamento é inválido'],
    [{ sessionId: null, model: '', errorMessage: 'x' }, 'model do evento de planejamento é inválido'],
    [{ sessionId: null, model: null, errorMessage: '' }, 'errorMessage do evento de planejamento é inválido'],
  ]) assert.throws(() => validateProjectEvent(event('mission.plan.unavailable', data)), { message })
})

test('aceita plan approved com campos aditivos', () => {
  const value = event('mission.plan.approved', {
    planEventId: 'event-000123', extra: true,
  })
  assert.strictEqual(validateProjectEvent(value), value)
})

test('plan approved exige planEventId válido', () => {
  for (const data of [{}, { planEventId: 'event-1' }, { planEventId: 1 }]) {
    assert.throws(() => validateProjectEvent(event('mission.plan.approved', data)), {
      message: 'planEventId do evento de aprovação de plano é inválido',
    })
  }
})

test('aceita pedido de correção por revisão e campos aditivos', () => {
  const value = event('mission.review.correction.requested', {
    reviewEventId: 'event-000123', fromStatus: 'validation',
    toStatus: 'correction', extra: true,
  })
  assert.strictEqual(validateProjectEvent(value), value)
})

test('valida referência e mapping do pedido de correção por revisão', () => {
  assert.throws(() => validateProjectEvent(event(
    'mission.review.correction.requested',
    { reviewEventId: 'event-1', fromStatus: 'validation', toStatus: 'correction' },
  )), { message: 'reviewEventId do pedido de correção por revisão é inválido' })
  for (const data of [
    { reviewEventId: 'event-000123', fromStatus: 'running', toStatus: 'correction' },
    { reviewEventId: 'event-000123', fromStatus: 'validation', toStatus: 'running' },
  ]) {
    assert.throws(() => validateProjectEvent(event(
      'mission.review.correction.requested', data,
    )), { message: 'mapeamento do pedido de correção por revisão é incoerente' })
  }
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
