import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { resolveExistingProjectPath } from '../src/project-path.js'

let temporaryBase
let root
let external
let rootLink
let context
let linkedRootContext

before(() => {
  temporaryBase = mkdtempSync(join(tmpdir(), 'jzl-project-path-'))
  root = join(temporaryBase, 'root')
  external = join(temporaryBase, 'external')
  rootLink = join(temporaryBase, 'root-link')

  const internal = join(root, 'internal')
  const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir'

  mkdirSync(internal, { recursive: true })
  mkdirSync(external)
  writeFileSync(join(root, 'file.txt'), '')
  writeFileSync(join(internal, 'inside.txt'), '')
  writeFileSync(join(external, 'outside.txt'), '')
  symlinkSync(internal, join(root, 'internal-link'), directoryLinkType)
  symlinkSync(external, join(root, 'external-link'), directoryLinkType)
  symlinkSync(root, rootLink, directoryLinkType)

  context = createProjectContext(root)
  linkedRootContext = createProjectContext(rootLink)
})

after(() => {
  rmSync(temporaryBase, { recursive: true, force: true })
})

test('rejeita context null', () => {
  assert.throws(
    () => resolveExistingProjectPath(null, 'file.txt'),
    { message: 'contexto de projeto deve ser um objeto' },
  )
})

test('rejeita context que não seja objeto', () => {
  assert.throws(
    () => resolveExistingProjectPath('contexto', 'file.txt'),
    { message: 'contexto de projeto deve ser um objeto' },
  )
})

test('rejeita context array', () => {
  assert.throws(
    () => resolveExistingProjectPath([], 'file.txt'),
    { message: 'contexto de projeto deve ser um objeto' },
  )
})

test('delega a validação de projectRoot ausente', () => {
  assert.throws(
    () => resolveExistingProjectPath({}, 'file.txt'),
    { message: 'projectRoot é obrigatório' },
  )
})

test('rejeita projectPath ausente', () => {
  assert.throws(
    () => resolveExistingProjectPath(context),
    { message: 'projectPath é obrigatório' },
  )
})

test('rejeita projectPath que não seja string', () => {
  assert.throws(
    () => resolveExistingProjectPath(context, 123),
    { message: 'projectPath deve ser uma string' },
  )
})

test('rejeita projectPath vazio', () => {
  assert.throws(
    () => resolveExistingProjectPath(context, '   '),
    { message: 'projectPath não pode ser vazio' },
  )
})

test('rejeita projectPath absoluto', () => {
  assert.throws(
    () => resolveExistingProjectPath(context, join(root, 'file.txt')),
    { message: 'projectPath deve ser relativo ao projectRoot' },
  )
})

test('rejeita escape lexical para arquivo externo existente', () => {
  assert.throws(
    () => resolveExistingProjectPath(context, '../external/outside.txt'),
    { message: 'projectPath escapa do projectRoot' },
  )
})

test('rejeita path interno inexistente', () => {
  assert.throws(
    () => resolveExistingProjectPath(context, 'missing.txt'),
    { message: 'projectPath não existe' },
  )
})

test('retorna arquivo normal como path canônico', () => {
  const result = resolveExistingProjectPath(context, 'file.txt')

  assert.equal(typeof result, 'string')
  assert.equal(result, realpathSync.native(join(root, 'file.txt')))
})

test('permite o próprio projectRoot', () => {
  assert.equal(
    resolveExistingProjectPath(context, '.'),
    realpathSync.native(root),
  )
})

test('resolve link interno para o target canônico', () => {
  const result = resolveExistingProjectPath(context, 'internal-link/inside.txt')

  assert.equal(result, realpathSync.native(join(root, 'internal', 'inside.txt')))
  assert.ok(!result.includes('internal-link'))
})

test('rejeita link externo pela contenção canônica', () => {
  assert.throws(
    () => resolveExistingProjectPath(context, 'external-link/outside.txt'),
    { message: 'projectPath resolve para fora do projectRoot' },
  )
})

test('permite projectRoot que seja link', () => {
  assert.equal(
    resolveExistingProjectPath(linkedRootContext, 'file.txt'),
    realpathSync.native(join(root, 'file.txt')),
  )
})
