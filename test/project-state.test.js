import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createInitialProjectState,
  validateProjectState,
} from '../src/project-state.js'

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

test('valida estado com schemaVersion suportado', () => {
  const state = { schemaVersion: 1 }

  assert.strictEqual(validateProjectState(state), state)
})

test('preserva campos aditivos do estado', () => {
  const state = {
    schemaVersion: 1,
    missions: [],
  }

  const result = validateProjectState(state)

  assert.strictEqual(result, state)
  assert.strictEqual(result.missions, state.missions)
})

test('rejeita containers de estado inválidos', () => {
  for (const state of [null, [], 'state', 123]) {
    assert.throws(
      () => validateProjectState(state),
      { message: 'estado do projeto deve ser um objeto' },
    )
  }
})

test('rejeita schemaVersion ausente', () => {
  assert.throws(
    () => validateProjectState({}),
    { message: 'schemaVersion do estado do projeto é obrigatório' },
  )
})

test('rejeita formatos inválidos de schemaVersion', () => {
  for (const schemaVersion of ['1', 0, -1, 1.5, NaN]) {
    assert.throws(
      () => validateProjectState({ schemaVersion }),
      {
        message: (
          'schemaVersion do estado do projeto deve ser um inteiro positivo'
        ),
      },
    )
  }
})

test('rejeita schemaVersion não suportado', () => {
  assert.throws(
    () => validateProjectState({ schemaVersion: 2 }),
    { message: 'schemaVersion do estado do projeto não é suportado' },
  )
})
