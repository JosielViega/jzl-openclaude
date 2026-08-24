import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  parseMissionPlanningResult,
  validateMissionPlanningResult,
} from '../src/mission-planning-result.js'

function plan(overrides = {}) {
  return {
    summary: 'Plano mínimo.',
    steps: [{ title: 'Alterar', detail: 'Aplicar mudança mínima.', paths: ['src/app.js'] }],
    risks: ['Regressão visual.'],
    validation: ['Executar npm test.'],
    ...overrides,
  }
}

test('parseia shape canônico, remove extras e não muta a origem', () => {
  const raw = plan({ extra: true })
  raw.steps[0].extra = true
  const snapshot = structuredClone(raw)
  assert.deepEqual(parseMissionPlanningResult(JSON.stringify(raw)), plan())
  assert.deepEqual(raw, snapshot)
})

for (const [name, input, message] of [
  ['tipo', null, 'resultado do planejamento deve ser uma string'],
  ['vazio', ' ', 'resultado do planejamento não pode ser vazio'],
  ['JSON', '{', 'resultado do planejamento não é JSON válido'],
  ['fence', '```json\n{}\n```', 'resultado do planejamento não é JSON válido'],
  ['prosa', `${JSON.stringify(plan())} fim`, 'resultado do planejamento não é JSON válido'],
  ['raiz', '[]', 'resultado do planejamento deve ser um objeto'],
]) test(`rejeita ${name} inválido`, () => assert.throws(() => parseMissionPlanningResult(input), { message }))

for (const [name, value, message] of [
  ['summary', plan({ summary: '' }), 'summary do planejamento é inválido'],
  ['steps vazio', plan({ steps: [] }), 'steps do planejamento deve ser um array não vazio'],
  ['step', plan({ steps: [null] }), 'step do planejamento deve ser um objeto'],
  ['title', plan({ steps: [{ title: '', detail: 'x', paths: [] }] }), 'title do step do planejamento é inválido'],
  ['detail', plan({ steps: [{ title: 'x', detail: 1, paths: [] }] }), 'detail do step do planejamento é inválido'],
  ['paths', plan({ steps: [{ title: 'x', detail: 'x', paths: null }] }), 'paths do step do planejamento deve ser um array válido'],
  ['path', plan({ steps: [{ title: 'x', detail: 'x', paths: [''] }] }), 'path do step do planejamento é inválido'],
  ['risks', plan({ risks: null }), 'risks do planejamento deve ser um array'],
  ['risk', plan({ risks: [''] }), 'risk do planejamento é inválido'],
  ['validation', plan({ validation: null }), 'validation do planejamento deve ser um array'],
  ['validation item', plan({ validation: [''] }), 'item de validation do planejamento é inválido'],
]) test(`rejeita ${name}`, () => assert.throws(
  () => parseMissionPlanningResult(JSON.stringify(value)), { message },
))

test('limita coleções, trunca textos e preserva ordem', () => {
  const parsed = parseMissionPlanningResult(JSON.stringify(plan({
    summary: 's'.repeat(4100),
    steps: Array.from({ length: 25 }, (_, index) => ({
      title: `${index}-${'t'.repeat(250)}`, detail: 'd'.repeat(4100),
      paths: Array.from({ length: 25 }, (__, pathIndex) => `${pathIndex}-${'p'.repeat(550)}`),
    })),
    risks: Array.from({ length: 25 }, (_, index) => `${index}-${'r'.repeat(2100)}`),
    validation: Array.from({ length: 25 }, (_, index) => `${index}-${'v'.repeat(2100)}`),
  })))
  assert.equal(parsed.summary.length, 4000)
  assert.equal(parsed.steps.length, 20)
  assert.equal(parsed.steps[0].title.length, 200)
  assert.equal(parsed.steps[0].detail.length, 4000)
  assert.equal(parsed.steps[0].paths.length, 20)
  assert.equal(parsed.steps[0].paths[0].length, 500)
  assert.equal(parsed.risks.length, 20)
  assert.equal(parsed.risks[0].length, 2000)
  assert.equal(parsed.validation.length, 20)
  assert.equal(parsed.validation[0].length, 2000)
  assert.ok(parsed.summary.includes('[conteúdo truncado pelo JZL]'))
  assert.ok(parsed.steps[0].title.startsWith('0-'))
})

test('validator retorna a mesma referência e exige limites finais', () => {
  const value = plan()
  const snapshot = structuredClone(value)
  assert.strictEqual(validateMissionPlanningResult(value), value)
  assert.deepEqual(value, snapshot)
  assert.throws(() => validateMissionPlanningResult(plan({ summary: 'x'.repeat(4001) })), {
    message: 'summary do planejamento é inválido',
  })
})
