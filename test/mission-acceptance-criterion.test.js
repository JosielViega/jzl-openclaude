import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createMissionAcceptanceCriteria,
  validateMissionAcceptanceCriteria,
  validateMissionAcceptanceCriterion,
} from '../src/mission-acceptance-criterion.js'

function criterion(overrides = {}) {
  return {
    id: 'criterion-0001',
    type: 'file-exists',
    path: 'index.html',
    ...overrides,
  }
}

for (const type of [
  'file-exists', 'file-not-exists', 'file-contains', 'file-not-contains',
]) {
  test(`valida type ${type}`, () => {
    const value = criterion({
      type,
      ...(type.includes('contains') ? { text: 'texto' } : {}),
    })
    assert.strictEqual(validateMissionAcceptanceCriterion(value), value)
  })
}

test('valida array vazio, vinte items, referência e IDs únicos', () => {
  const empty = []
  assert.strictEqual(validateMissionAcceptanceCriteria(empty), empty)
  const values = Array.from({ length: 20 }, (_, index) => criterion({
    id: `criterion-${String(index + 1).padStart(4, '0')}`,
  }))
  assert.strictEqual(validateMissionAcceptanceCriteria(values), values)
  assert.throws(
    () => validateMissionAcceptanceCriteria([...values, criterion({ id: 'criterion-0021' })]),
    { message: 'Mission pode possuir no máximo 20 acceptance criteria' },
  )
  assert.throws(
    () => validateMissionAcceptanceCriteria([criterion(), criterion()]),
    { message: 'ids dos acceptance criteria não podem ser duplicados' },
  )
})

test('rejeita containers e identidade inválidos', () => {
  for (const value of [null, [], 'x', 1]) {
    assert.throws(
      () => validateMissionAcceptanceCriterion(value),
      { message: 'acceptance criterion deve ser um objeto' },
    )
  }
  for (const id of [undefined, '', 'criterion-1', 'validator-0001']) {
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ id })),
      { message: 'id do acceptance criterion é inválido' },
    )
  }
  for (const type of [undefined, '', 'command', 'file-equals']) {
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ type })),
      { message: 'type do acceptance criterion não é suportado' },
    )
  }
})

for (const path of [
  '', '/etc/passwd', 'C:\\temp\\a.txt', '\\\\server\\share',
  '..\\secret.txt', '../secret.txt', 'src/../secret.txt', './index.html',
  'src//app.js', 'src\\app.js', 'src/app.js/',
]) {
  test(`rejeita path não normalizado: ${JSON.stringify(path)}`, () => {
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ path })),
      { message: 'path do acceptance criterion deve ser relativo e normalizado' },
    )
  })
}

test('aplica limite de path e permite paths portáteis', () => {
  const path500 = `${'a'.repeat(495)}.html`
  assert.strictEqual(validateMissionAcceptanceCriterion(criterion({ path: path500 })).path, path500)
  assert.throws(
    () => validateMissionAcceptanceCriterion(criterion({ path: `${'a'.repeat(496)}.html` })),
    { message: 'path do acceptance criterion excede o limite permitido' },
  )
  for (const path of ['index.html', 'src/app.js', 'public/css/app.css']) {
    assert.equal(validateMissionAcceptanceCriterion(criterion({ path })).path, path)
  }
})

for (const path of ['.jzl', '.jzl/state.json', '.git', '.git/HEAD', '.openclaude/x', 'AGENTS.md']) {
  test(`rejeita path protegido ${path}`, () => {
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ path })),
      { message: 'path do acceptance criterion é protegido' },
    )
  })
}

test('paths protegidos usam casing da plataforma', () => {
  if (process.platform === 'win32') {
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ path: '.JZL/state.json' })),
      { message: 'path do acceptance criterion é protegido' },
    )
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ path: 'agents.MD' })),
      { message: 'path do acceptance criterion é protegido' },
    )
  } else {
    assert.equal(validateMissionAcceptanceCriterion(criterion({ path: '.JZL/state.json' })).path, '.JZL/state.json')
  }
})

test('valida text literal e limites', () => {
  for (const type of ['file-contains', 'file-not-contains']) {
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ type })),
      { message: 'text do acceptance criterion é inválido' },
    )
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ type, text: '' })),
      { message: 'text do acceptance criterion é inválido' },
    )
    assert.equal(validateMissionAcceptanceCriterion(criterion({ type, text: ' ' })).text, ' ')
    assert.equal(validateMissionAcceptanceCriterion(criterion({ type, text: 'x'.repeat(2000) })).text.length, 2000)
    assert.throws(
      () => validateMissionAcceptanceCriterion(criterion({ type, text: 'x'.repeat(2001) })),
      { message: 'text do acceptance criterion excede o limite permitido' },
    )
  }
})

test('create gera shape canônico, IDs e ordem sem mutar inputs', () => {
  const inputs = [
    { type: 'file-exists', path: 'a.txt', text: 'ignorar', extra: true },
    { type: 'file-contains', path: 'b.txt', text: 'B', extra: true },
  ]
  const snapshot = structuredClone(inputs)
  const created = createMissionAcceptanceCriteria(inputs)
  assert.deepEqual(created, [
    { id: 'criterion-0001', type: 'file-exists', path: 'a.txt' },
    { id: 'criterion-0002', type: 'file-contains', path: 'b.txt', text: 'B' },
  ])
  assert.deepEqual(inputs, snapshot)
  assert.deepEqual(createMissionAcceptanceCriteria(), [])
  assert.throws(
    () => createMissionAcceptanceCriteria([{ ...inputs[0], id: 'criterion-0001' }]),
    { message: 'id do novo acceptance criterion é controlado pelo JZL' },
  )
})

test('validate aceita campos aditivos sem mutar', () => {
  const value = criterion({ metadata: { keep: true }, text: 'aditivo' })
  const snapshot = structuredClone(value)
  assert.strictEqual(validateMissionAcceptanceCriterion(value), value)
  assert.deepEqual(value, snapshot)
})
