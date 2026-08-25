import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderMissionAcceptanceCriteria } from '../src/mission-acceptance-prompt.js'

test('não renderiza criteria ausentes ou vazios', () => {
  assert.equal(renderMissionAcceptanceCriteria(), '')
  assert.equal(renderMissionAcceptanceCriteria([]), '')
  assert.throws(
    () => renderMissionAcceptanceCriteria(''),
    { message: 'acceptance criteria deve ser um array' },
  )
})

test('renderiza quatro tipos em ordem sem mutar', () => {
  const criteria = [
    { id: 'criterion-0001', type: 'file-exists', path: 'a.txt' },
    { id: 'criterion-0002', type: 'file-not-exists', path: 'b.txt' },
    { id: 'criterion-0003', type: 'file-contains', path: 'c.txt', text: 'linha 1\nlinha 2' },
    { id: 'criterion-0004', type: 'file-not-contains', path: 'd.txt', text: 'proibido' },
  ]
  const snapshot = structuredClone(criteria)
  const output = renderMissionAcceptanceCriteria(criteria)
  for (const value of ['criterion-0001', 'file-exists', 'a.txt', 'criterion-0004', 'file-not-contains', 'proibido']) {
    assert.ok(output.includes(value))
  }
  assert.ok(output.includes('--- início texto ---\nlinha 1\nlinha 2\n--- fim texto ---'))
  assert.equal((output.match(/Texto:/g) ?? []).length, 2)
  assert.ok(output.indexOf('criterion-0001') < output.indexOf('criterion-0004'))
  assert.deepEqual(criteria, snapshot)
})
