import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateHandoff } from '../src/handoff.js'

function failedValidator(overrides = {}) {
  return {
    id: 'php-syntax:index.php',
    status: 'FAIL',
    evidence: {
      exitCode: 1,
      signal: null,
      stdout: '',
      stderr: 'erro',
      errorMessage: null,
    },
    ...overrides,
  }
}

function validHandoff(overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'mission-correction',
    missionId: 'mission-0001',
    source: {
      responsibility: 'mission-validation',
      eventId: 'event-000123',
    },
    target: { responsibility: 'mission-execution' },
    payload: { failedValidators: [failedValidator()] },
    ...overrides,
  }
}

function validReviewHandoff(overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'mission-review-correction',
    missionId: 'mission-0001',
    source: { responsibility: 'mission-review', eventId: 'event-000123' },
    authorization: { eventId: 'event-000124' },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: 'Há problema',
      findings: [{ severity: 'HIGH', title: 'Falha', detail: 'Detalhe', paths: ['index.php'] }],
    },
    ...overrides,
  }
}

function validPlanHandoff(overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'mission-plan-execution',
    missionId: 'mission-0001',
    source: { responsibility: 'mission-planning', eventId: 'event-000123' },
    authorization: { eventId: 'event-000124' },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: 'Plano aprovado',
      steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['index.html'] }],
      risks: [], validation: [],
    },
    ...overrides,
  }
}

test('valida Handoff canônico e retorna a mesma referência', () => {
  const handoff = validHandoff()

  assert.strictEqual(validateHandoff(handoff), handoff)
})

test('valida Handoff de review correction sem mutar payload', () => {
  const handoff = validReviewHandoff()
  const before = structuredClone(handoff)
  assert.strictEqual(validateHandoff(handoff), handoff)
  assert.deepEqual(handoff, before)
  assert.equal(Object.hasOwn(handoff, 'sessionId'), false)
})

test('valida Plan Handoff v1 pela mesma referência sem identidade probabilística', () => {
  const handoff = validPlanHandoff({ extra: true })
  handoff.payload.extra = true
  const before = structuredClone(handoff)
  assert.strictEqual(validateHandoff(handoff), handoff)
  assert.deepEqual(handoff, before)
  assert.equal(Object.hasOwn(handoff, 'sessionId'), false)
  assert.equal(Object.hasOwn(handoff, 'model'), false)
})

for (const [name, override, message] of [
  ['source', { source: { responsibility: 'mission-review', eventId: 'event-000123' } }, 'responsabilidade de origem do handoff não é suportada'],
  ['authorization ausente', { authorization: undefined }, 'authorization do handoff deve ser um objeto'],
  ['authorization inválida', { authorization: { eventId: 'event-1' } }, 'eventId de autorização do handoff é inválido'],
  ['eventos iguais', { authorization: { eventId: 'event-000123' } }, 'eventos de origem e autorização do handoff devem ser diferentes'],
  ['target', { target: { responsibility: 'mission-review' } }, 'responsabilidade de destino do handoff não é suportada'],
  ['summary', { payload: { ...validPlanHandoff().payload, summary: '' } }, 'summary do planejamento é inválido'],
  ['steps', { payload: { ...validPlanHandoff().payload, steps: [] } }, 'steps do planejamento deve ser um array não vazio'],
  ['risks', { payload: { ...validPlanHandoff().payload, risks: null } }, 'risks do planejamento deve ser um array'],
  ['validation', { payload: { ...validPlanHandoff().payload, validation: null } }, 'validation do planejamento deve ser um array'],
]) {
  test(`rejeita Plan Handoff com ${name}`, () => {
    assert.throws(() => validateHandoff(validPlanHandoff(override)), { message })
  })
}

for (const [name, override, message] of [
  ['source', { source: { responsibility: 'mission-validation', eventId: 'event-000123' } }, 'responsabilidade de origem do handoff não é suportada'],
  ['authorization ausente', { authorization: undefined }, 'authorization do handoff deve ser um objeto'],
  ['authorization inválida', { authorization: [] }, 'authorization do handoff deve ser um objeto'],
  ['authorization eventId', { authorization: { eventId: 'event-1' } }, 'eventId de autorização do handoff é inválido'],
  ['referências iguais', { authorization: { eventId: 'event-000123' } }, 'eventos de origem e autorização do handoff devem ser diferentes'],
  ['summary', { payload: { summary: '', findings: [{ severity: 'HIGH', title: 'x', detail: 'x', paths: [] }] } }, 'summary da revisão é inválido'],
  ['findings vazio', { payload: { summary: 'x', findings: [] } }, 'mapeamento do resultado da revisão é incoerente'],
]) {
  test(`rejeita review correction com ${name}`, () => {
    assert.throws(() => validateHandoff(validReviewHandoff(override)), { message })
  })
}

const invalidCases = [
  ['container null', null, 'handoff deve ser um objeto'],
  ['container array', [], 'handoff deve ser um objeto'],
  ['schemaVersion ausente', { schemaVersion: undefined }, 'schemaVersion do handoff é obrigatório'],
  ['schemaVersion inválido', { schemaVersion: 0 }, 'schemaVersion do handoff deve ser um inteiro positivo'],
  ['schemaVersion não suportado', { schemaVersion: 2 }, 'schemaVersion do handoff não é suportado'],
  ['type ausente', { type: undefined }, 'type do handoff é obrigatório'],
  ['type não string', { type: 1 }, 'type do handoff deve ser uma string'],
  ['type não suportado', { type: 'outro' }, 'type do handoff não é suportado'],
  ['missionId ausente', { missionId: undefined }, 'missionId do handoff é obrigatório'],
  ['missionId inválido', { missionId: 'mission-1' }, 'missionId do handoff é inválido'],
  ['source ausente', { source: undefined }, 'source do handoff é obrigatório'],
  ['source inválido', { source: [] }, 'source do handoff deve ser um objeto'],
  ['responsabilidade de origem inválida', { source: { responsibility: 'outra', eventId: 'event-000123' } }, 'responsabilidade de origem do handoff não é suportada'],
  ['eventId ausente', { source: { responsibility: 'mission-validation' } }, 'eventId de origem do handoff é obrigatório'],
  ['eventId inválido', { source: { responsibility: 'mission-validation', eventId: 'event-1' } }, 'eventId de origem do handoff é inválido'],
  ['target ausente', { target: undefined }, 'target do handoff é obrigatório'],
  ['target inválido', { target: [] }, 'target do handoff deve ser um objeto'],
  ['responsabilidade de destino inválida', { target: { responsibility: 'outra' } }, 'responsabilidade de destino do handoff não é suportada'],
  ['payload ausente', { payload: undefined }, 'payload do handoff é obrigatório'],
  ['payload inválido', { payload: [] }, 'payload do handoff deve ser um objeto'],
  ['failedValidators vazio', { payload: { failedValidators: [] } }, 'failedValidators do handoff deve ser um array não vazio'],
]

for (const [name, override, message] of invalidCases) {
  test(`rejeita ${name}`, () => {
    const value = override === null || Array.isArray(override)
      ? override
      : validHandoff(override)

    assert.throws(() => validateHandoff(value), { message })
  })
}

const validatorCases = [
  ['validator inválido', null, 'validator do handoff deve ser um objeto'],
  ['id inválido', failedValidator({ id: ' ' }), 'id do validator do handoff é inválido'],
  ['status inválido', failedValidator({ status: 'PASS' }), 'status do validator do handoff deve ser FAIL'],
  ['evidence inválida', failedValidator({ evidence: null }), 'evidence do validator do handoff deve ser um objeto'],
  ['exitCode inválido', failedValidator({ evidence: { ...failedValidator().evidence, exitCode: '1' } }), 'exitCode da evidence do handoff é inválido'],
  ['signal inválido', failedValidator({ evidence: { ...failedValidator().evidence, signal: 1 } }), 'signal da evidence do handoff é inválido'],
  ['stdout inválido', failedValidator({ evidence: { ...failedValidator().evidence, stdout: null } }), 'stdout da evidence do handoff deve ser uma string'],
  ['stderr inválido', failedValidator({ evidence: { ...failedValidator().evidence, stderr: null } }), 'stderr da evidence do handoff deve ser uma string'],
  ['errorMessage inválido', failedValidator({ evidence: { ...failedValidator().evidence, errorMessage: 1 } }), 'errorMessage da evidence do handoff é inválido'],
]

for (const [name, validator, message] of validatorCases) {
  test(`rejeita ${name}`, () => {
    assert.throws(
      () => validateHandoff(validHandoff({
        payload: { failedValidators: [validator] },
      })),
      { message },
    )
  })
}

test('aceita todos os validators e diagnostics longos sem truncar', () => {
  const longText = 'x'.repeat(5000)
  const failedValidators = Array.from({ length: 30 }, (_, index) => (
    failedValidator({
      id: `validator-${index}`,
      evidence: { ...failedValidator().evidence, stdout: longText },
    })
  ))
  const handoff = validHandoff({ payload: { failedValidators } })

  validateHandoff(handoff)
  assert.equal(handoff.payload.failedValidators.length, 30)
  assert.equal(handoff.payload.failedValidators[0].evidence.stdout, longText)
})

test('preserva campos aditivos e conteúdo com projectRoot sem mutação', () => {
  const handoff = validHandoff({
    extra: { value: 'C:\\projeto' },
    payload: {
      failedValidators: [failedValidator({
        evidence: {
          ...failedValidator().evidence,
          stderr: 'falha em C:\\projeto\\index.php',
        },
      })],
    },
  })
  const before = structuredClone(handoff)

  validateHandoff(handoff)

  assert.deepEqual(handoff, before)
  assert.deepEqual(handoff.extra, { value: 'C:\\projeto' })
  assert.equal(
    handoff.payload.failedValidators[0].evidence.stderr,
    'falha em C:\\projeto\\index.php',
  )
})
