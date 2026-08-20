import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { after, before, test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'

let temporaryDirectory

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-project-context-'))
})

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('cria contexto com o shape mínimo', () => {
  const context = createProjectContext(temporaryDirectory)

  assert.deepEqual(context, {
    projectRoot: normalize(temporaryDirectory),
  })
  assert.deepEqual(Object.keys(context), ['projectRoot'])
})

test('exige projectRoot explícito', () => {
  assert.throws(
    () => createProjectContext(),
    { message: 'projectRoot é obrigatório' },
  )
})

test('delega a validação de projectRoot', () => {
  assert.throws(
    () => createProjectContext('relative/path'),
    { message: 'projectRoot deve ser um caminho absoluto' },
  )
})
