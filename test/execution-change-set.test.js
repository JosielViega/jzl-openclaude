import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createExecutionChangeSet,
  validateExecutionChangeSet,
} from '../src/execution-change-set.js'

const digest = (character) => character.repeat(64)
const entry = (path, value = 'a', kind = 'file') => ({
  path, kind, digest: digest(value),
})
const snapshot = (...entries) => ({ entries })

test('cria Change Set vazio sem mutar snapshots', () => {
  const before = snapshot(entry('same.txt'))
  const after = structuredClone(before)
  const beforeCopy = structuredClone(before)
  const afterCopy = structuredClone(after)
  assert.deepEqual(createExecutionChangeSet(before, after), {
    created: [], modified: [], deleted: [],
  })
  assert.deepEqual(before, beforeCopy)
  assert.deepEqual(after, afterCopy)
})

test('classifica created, modified e deleted em ordem determinística', () => {
  const before = snapshot(
    entry('delete.txt'), entry('modify.txt'), entry('same.txt'),
  )
  const after = snapshot(
    entry('a-created.txt'), entry('modify.txt', 'b'), entry('same.txt'), entry('z-created.txt'),
  )
  assert.deepEqual(createExecutionChangeSet(before, after), {
    created: ['a-created.txt', 'z-created.txt'],
    modified: ['modify.txt'],
    deleted: ['delete.txt'],
  })
})

test('mudança file/symlink é modified', () => {
  assert.deepEqual(createExecutionChangeSet(
    snapshot(entry('alias', 'a', 'file')),
    snapshot(entry('alias', 'a', 'symlink')),
  ), { created: [], modified: ['alias'], deleted: [] })
})

test('representa file e empty directory conforme limitação v1', () => {
  assert.deepEqual(createExecutionChangeSet(
    snapshot(entry('value')),
    snapshot(),
  ), { created: [], modified: [], deleted: ['value'] })
  assert.deepEqual(createExecutionChangeSet(
    snapshot(),
    snapshot(entry('value')),
  ), { created: ['value'], modified: [], deleted: [] })
  assert.deepEqual(createExecutionChangeSet(snapshot(), snapshot()), {
    created: [], modified: [], deleted: [],
  })
})

test('validator aceita campos aditivos e retorna a mesma referência', () => {
  const value = {
    created: ['a.txt'], modified: ['b.txt'], deleted: ['c.txt'], extra: true,
  }
  const copy = structuredClone(value)
  assert.strictEqual(validateExecutionChangeSet(value), value)
  assert.deepEqual(value, copy)
})

test('validator rejeita containers, arrays ausentes e paths desordenados', () => {
  for (const value of [null, [], 'x']) {
    assert.throws(() => validateExecutionChangeSet(value), {
      message: 'Change Set deve ser um objeto',
    })
  }
  assert.throws(() => validateExecutionChangeSet({ modified: [], deleted: [] }), {
    message: 'created do Change Set deve ser um array',
  })
  assert.throws(() => validateExecutionChangeSet({
    created: ['b', 'a'], modified: [], deleted: [],
  }), { message: 'created do Change Set deve possuir paths únicos e ordenados' })
  assert.throws(() => validateExecutionChangeSet({
    created: ['a', 'a'], modified: [], deleted: [],
  }), { message: 'created do Change Set deve possuir paths únicos e ordenados' })
})

test('rejeita path repetido entre categorias', () => {
  assert.throws(() => validateExecutionChangeSet({
    created: ['a'], modified: ['a'], deleted: [],
  }), { message: 'path do Change Set aparece em múltiplas categorias' })
})

test('rejeita paths não normalizados, control paths e limites', () => {
  for (const path of [
    '/x', 'C:/x', 'a\\b', './a', 'a/../b', 'a//b', 'a/',
    'a\nb', 'a\rb', `a${String.fromCharCode(0)}b`, '.jzl/x', '.git/x',
    '.openclaude/x', 'a'.repeat(501),
  ]) {
    assert.throws(() => validateExecutionChangeSet({
      created: [path], modified: [], deleted: [],
    }))
  }

  const maximum = { created: ['a'.repeat(500)], modified: [], deleted: [] }
  assert.strictEqual(validateExecutionChangeSet(maximum), maximum)

  if (process.platform === 'win32') {
    assert.throws(() => validateExecutionChangeSet({
      created: ['.GIT/config'], modified: [], deleted: [],
    }), { message: 'path do Change Set pertence a namespace de controle' })
  }
})

test('resultado contém somente categorias e paths, sem fingerprints', () => {
  const value = createExecutionChangeSet(
    snapshot(entry('before.txt', 'a')),
    snapshot(entry('after.txt', 'b')),
  )
  assert.deepEqual(Object.keys(value), ['created', 'modified', 'deleted'])
  for (const forbidden of ['digest', 'hash', 'content', 'sha256']) {
    assert.equal(JSON.stringify(value).includes(forbidden), false)
  }
})
