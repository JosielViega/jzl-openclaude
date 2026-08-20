import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize, sep } from 'node:path'
import { after, before, test } from 'node:test'

import { validateProjectRoot } from '../src/project-root.js'

let temporaryDirectory
let temporaryFile

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-project-root-'))
  temporaryFile = join(temporaryDirectory, 'file.txt')
  writeFileSync(temporaryFile, '')
})

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('rejeita argumento ausente', () => {
  assert.throws(() => validateProjectRoot(), /obrigatório/)
})

test('rejeita valor que não seja string', () => {
  assert.throws(() => validateProjectRoot(null), /string/)
})

test('rejeita string vazia', () => {
  assert.throws(() => validateProjectRoot(''), /vazio/)
})

test('rejeita string contendo apenas espaços', () => {
  assert.throws(() => validateProjectRoot('   '), /vazio/)
})

test('rejeita caminho relativo', () => {
  assert.throws(() => validateProjectRoot('relative/path'), /caminho absoluto/)
})

test('rejeita caminho absoluto inexistente', () => {
  const missingDirectory = join(temporaryDirectory, 'missing')

  assert.throws(() => validateProjectRoot(missingDirectory), /não existe/)
})

test('rejeita caminho absoluto que aponta para arquivo', () => {
  assert.throws(() => validateProjectRoot(temporaryFile), /não é um diretório/)
})

test('retorna diretório absoluto válido normalizado', () => {
  assert.equal(validateProjectRoot(temporaryDirectory), normalize(temporaryDirectory))
})

test('normaliza uma representação absoluta válida', () => {
  const normalizablePath = `${temporaryDirectory}${sep}nested${sep}..`

  assert.equal(validateProjectRoot(normalizablePath), normalize(normalizablePath))
})
