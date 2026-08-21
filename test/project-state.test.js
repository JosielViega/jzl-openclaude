import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createInitialProjectState } from '../src/project-state.js'

test('cria o estado inicial com shape exato', () => {
  const state = createInitialProjectState()

  assert.deepEqual(state, {
    schemaVersion: 1,
  })
  assert.deepEqual(Object.keys(state), ['schemaVersion'])
})

test('define a versão numérica inicial do schema', () => {
  const state = createInitialProjectState()

  assert.equal(typeof state.schemaVersion, 'number')
  assert.equal(state.schemaVersion, 1)
})

test('cria instâncias independentes', () => {
  const first = createInitialProjectState()
  const second = createInitialProjectState()

  assert.notStrictEqual(first, second)

  first.schemaVersion = 999

  assert.equal(second.schemaVersion, 1)
})
