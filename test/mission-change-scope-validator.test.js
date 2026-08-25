import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createMissionChangeScopeValidator,
  runMissionChangeScopeValidator,
  validateMissionChangeScopeValidator,
} from '../src/mission-change-scope-validator.js'
import { validateProjectEvent } from '../src/project-event.js'
import { validateHandoff } from '../src/handoff.js'

const scope = { allowedPaths: ['a.txt', 'b.txt'] }
const empty = { created: [], modified: [], deleted: [] }

test('creator canônico clona inputs e validator retorna mesma referência', () => {
  const definition = createMissionChangeScopeValidator(scope, empty)
  assert.deepEqual(definition, {
    id: 'mission-change-scope', type: 'mission-change-scope',
    scope, changeSet: empty,
  })
  assert.notStrictEqual(definition.scope, scope)
  assert.notStrictEqual(definition.changeSet, empty)
  assert.strictEqual(validateMissionChangeScopeValidator(definition), definition)
})

test('Change Set ausente produz ERROR sem conteúdo sensível', () => {
  const result = runMissionChangeScopeValidator(createMissionChangeScopeValidator(scope, null))
  assert.equal(result.status, 'ERROR')
  assert.match(result.evidence.errorMessage, /não está disponível/)
  assert.deepEqual(result.evidence.violations, [])
  assert.equal(Object.hasOwn(result.evidence, 'allowedPaths'), false)
})

test('Change Set vazio produz PASS inclusive para scope vazio', () => {
  for (const value of [scope, { allowedPaths: [] }]) {
    const result = runMissionChangeScopeValidator(createMissionChangeScopeValidator(value, empty))
    assert.equal(result.status, 'PASS')
    assert.deepEqual(result.evidence.violations, [])
  }
})

test('created, modified e deleted autorizados produzem PASS', () => {
  const changeSet = { created: ['a.txt'], modified: ['b.txt'], deleted: [] }
  assert.equal(runMissionChangeScopeValidator(
    createMissionChangeScopeValidator(scope, changeSet),
  ).status, 'PASS')
})

test('paths fora do scope produzem FAIL único e ordenado', () => {
  const changeSet = {
    created: ['z.txt'], modified: ['a.txt', 'x.txt'], deleted: ['c.txt'],
  }
  const result = runMissionChangeScopeValidator(
    createMissionChangeScopeValidator(scope, changeSet),
  )
  assert.equal(result.status, 'FAIL')
  assert.deepEqual(result.evidence.violations, ['c.txt', 'x.txt', 'z.txt'])
  assert.equal(result.evidence.errorMessage, null)
})

test('scope vazio reprova qualquer mudança e AGENTS.md é violation', () => {
  const changeSet = { created: [], modified: ['AGENTS.md'], deleted: [] }
  const result = runMissionChangeScopeValidator(
    createMissionChangeScopeValidator({ allowedPaths: [] }, changeSet),
  )
  assert.equal(result.status, 'FAIL')
  assert.deepEqual(result.evidence.violations, ['AGENTS.md'])
})

test('matching não usa prefixo', () => {
  const changeSet = { created: ['a.txt.backup'], modified: [], deleted: [] }
  assert.equal(runMissionChangeScopeValidator(
    createMissionChangeScopeValidator(scope, changeSet),
  ).status, 'FAIL')
})

test('evidence de evento aceita Scope FAIL e rejeita metadata ambígua', () => {
  const result = runMissionChangeScopeValidator(createMissionChangeScopeValidator(
    scope,
    { created: ['outside.txt'], modified: [], deleted: [] },
  ))
  const event = {
    id: 'event-000001', type: 'mission.validation.finished',
    occurredAt: '2026-01-01T00:00:00.000Z', missionId: 'mission-0001',
    data: { fromStatus: 'validation', toStatus: 'correction', outcome: 'FAIL', results: [result] },
  }
  assert.strictEqual(validateProjectEvent(event), event)
  assert.throws(() => validateProjectEvent(structuredClone({
    ...event,
    data: {
      ...event.data,
      results: [{
        ...result,
        evidence: { ...result.evidence, criterionType: 'file-exists', path: 'x', satisfied: false },
      }],
    },
  })), /ambígua/)
})

test('correction Handoff transporta somente Scope FAIL com violations', () => {
  const result = runMissionChangeScopeValidator(createMissionChangeScopeValidator(
    scope,
    { created: ['outside.txt'], modified: [], deleted: [] },
  ))
  const handoff = {
    schemaVersion: 1, type: 'mission-correction', missionId: 'mission-0001',
    source: { responsibility: 'mission-validation', eventId: 'event-000001' },
    target: { responsibility: 'mission-execution' },
    payload: { failedValidators: [result] },
  }
  assert.strictEqual(validateHandoff(handoff), handoff)
  const invalid = structuredClone(handoff)
  invalid.payload.failedValidators[0].status = 'ERROR'
  assert.throws(() => validateHandoff(invalid), /status.*FAIL/)
})
