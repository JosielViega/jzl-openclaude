import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  parseMissionReviewResult,
  validateMissionReviewResult,
} from '../src/mission-review-result.js'

function finding(overrides = {}) {
  return {
    severity: 'HIGH',
    title: 'Problema observável',
    detail: 'O código atual possui um problema.',
    paths: ['index.php'],
    ...overrides,
  }
}

test('parseia PASS canônico estritamente', () => {
  assert.deepEqual(parseMissionReviewResult(JSON.stringify({
    verdict: 'PASS', summary: 'Implementação adequada.', findings: [], extra: true,
  })), {
    verdict: 'PASS', summary: 'Implementação adequada.', findings: [],
  })
})

test('parseia CONCERNS canônico removendo campos extras', () => {
  const review = parseMissionReviewResult(JSON.stringify({
    verdict: 'CONCERNS', summary: 'Há um problema.',
    findings: [{ ...finding(), extra: true }], extra: true,
  }))

  assert.deepEqual(review, {
    verdict: 'CONCERNS', summary: 'Há um problema.', findings: [finding()],
  })
})

for (const [name, input, message] of [
  ['tipo não string', null, 'resultado da revisão deve ser uma string'],
  ['texto vazio', '   ', 'resultado da revisão não pode ser vazio'],
  ['JSON inválido', '{', 'resultado da revisão não é JSON válido'],
  ['Markdown fence', '```json\n{}\n```', 'resultado da revisão não é JSON válido'],
  ['prosa adicional', '{"verdict":"PASS","summary":"x","findings":[]} fim', 'resultado da revisão não é JSON válido'],
  ['container array', '[]', 'resultado da revisão deve ser um objeto'],
]) {
  test(`rejeita ${name}`, () => {
    assert.throws(() => parseMissionReviewResult(input), { message })
  })
}

for (const [name, value, message] of [
  ['verdict inválido', { verdict: 'OTHER', summary: 'x', findings: [] }, 'verdict da revisão não é suportado'],
  ['summary inválido', { verdict: 'PASS', summary: ' ', findings: [] }, 'summary da revisão é inválido'],
  ['findings não array', { verdict: 'PASS', summary: 'x', findings: null }, 'findings da revisão deve ser um array'],
  ['PASS com finding', { verdict: 'PASS', summary: 'x', findings: [finding()] }, 'mapeamento do resultado da revisão é incoerente'],
  ['CONCERNS vazio', { verdict: 'CONCERNS', summary: 'x', findings: [] }, 'mapeamento do resultado da revisão é incoerente'],
  ['finding inválido', { verdict: 'CONCERNS', summary: 'x', findings: [null] }, 'finding da revisão deve ser um objeto'],
  ['severity inválida', { verdict: 'CONCERNS', summary: 'x', findings: [finding({ severity: 'CRITICAL' })] }, 'severity do finding da revisão não é suportada'],
  ['title inválido', { verdict: 'CONCERNS', summary: 'x', findings: [finding({ title: '' })] }, 'title do finding da revisão é inválido'],
  ['detail inválido', { verdict: 'CONCERNS', summary: 'x', findings: [finding({ detail: 1 })] }, 'detail do finding da revisão é inválido'],
  ['paths não array', { verdict: 'CONCERNS', summary: 'x', findings: [finding({ paths: null })] }, 'paths do finding da revisão deve ser um array válido'],
  ['path inválido', { verdict: 'CONCERNS', summary: 'x', findings: [finding({ paths: [''] })] }, 'path do finding da revisão é inválido'],
]) {
  test(`rejeita ${name}`, () => {
    assert.throws(() => parseMissionReviewResult(JSON.stringify(value)), { message })
  })
}

test('limita findings e paths preservando ordem', () => {
  const raw = {
    verdict: 'CONCERNS', summary: 'muitos',
    findings: Array.from({ length: 25 }, (_, index) => finding({
      title: `finding-${index}`,
      paths: Array.from({ length: 25 }, (__, pathIndex) => `p-${pathIndex}`),
    })),
  }
  const review = parseMissionReviewResult(JSON.stringify(raw))

  assert.equal(review.findings.length, 20)
  assert.equal(review.findings[0].title, 'finding-0')
  assert.equal(review.findings[19].title, 'finding-19')
  assert.equal(review.findings[0].paths.length, 20)
  assert.deepEqual(review.findings[0].paths, raw.findings[0].paths.slice(0, 20))
})

test('trunca todos os textos com marcador e respeita limites finais', () => {
  const review = parseMissionReviewResult(JSON.stringify({
    verdict: 'CONCERNS', summary: 's'.repeat(4100),
    findings: [finding({
      title: 't'.repeat(300), detail: 'd'.repeat(4100), paths: ['p'.repeat(600)],
    })],
  }))
  const normalizedFinding = review.findings[0]

  assert.equal(review.summary.length, 4000)
  assert.equal(normalizedFinding.title.length, 200)
  assert.equal(normalizedFinding.detail.length, 4000)
  assert.equal(normalizedFinding.paths[0].length, 500)
  for (const value of [
    review.summary, normalizedFinding.title,
    normalizedFinding.detail, normalizedFinding.paths[0],
  ]) assert.ok(value.includes('[conteúdo truncado pelo JZL]'))
})

test('validate retorna mesma referência, não muta e exige limites normalizados', () => {
  const review = { verdict: 'CONCERNS', summary: 'x', findings: [finding()] }
  const snapshot = structuredClone(review)

  assert.strictEqual(validateMissionReviewResult(review), review)
  assert.deepEqual(review, snapshot)
  assert.throws(() => validateMissionReviewResult({
    ...review, summary: 'x'.repeat(4001),
  }), { message: 'summary da revisão é inválido' })
  assert.throws(() => validateMissionReviewResult({
    ...review, findings: Array.from({ length: 21 }, () => finding()),
  }), { message: 'findings da revisão deve ser um array' })
})
