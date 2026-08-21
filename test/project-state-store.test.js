import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { initializeProjectStateStore } from '../src/project-state-store.js'

const initialStateContent = '{\n  "schemaVersion": 1\n}\n'

function createTemporaryRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-project-state-store-'))

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  return root
}

test('inicializa o State Store em projeto novo', (t) => {
  const root = createTemporaryRoot(t)
  const context = createProjectContext(root)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')

  const result = initializeProjectStateStore(context)
  const content = readFileSync(statePath, 'utf8')
  const entries = readdirSync(jzlDirectoryPath)

  assert.equal(statSync(jzlDirectoryPath).isDirectory(), true)
  assert.equal(statSync(statePath).isFile(), true)
  assert.equal(result, realpathSync.native(statePath))
  assert.equal(content, initialStateContent)
  assert.deepEqual(JSON.parse(content), { schemaVersion: 1 })
  assert.deepEqual(entries, ['state.json'])
  assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false)
})

test('inicializa quando o diretório JZL já existe', (t) => {
  const root = createTemporaryRoot(t)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')

  mkdirSync(jzlDirectoryPath)

  const result = initializeProjectStateStore(createProjectContext(root))

  assert.equal(result, realpathSync.native(statePath))
  assert.equal(readFileSync(statePath, 'utf8'), initialStateContent)
  assert.deepEqual(readdirSync(jzlDirectoryPath), ['state.json'])
})

test('preserva state.json existente sem sobrescrever', (t) => {
  const root = createTemporaryRoot(t)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')
  const existingContent = '{"schemaVersion":1}'

  mkdirSync(jzlDirectoryPath)
  writeFileSync(statePath, existingContent, 'utf8')

  const result = initializeProjectStateStore(createProjectContext(root))

  assert.equal(result, realpathSync.native(statePath))
  assert.equal(readFileSync(statePath, 'utf8'), existingContent)
})

test('rejeita diretório JZL que seja arquivo', (t) => {
  const root = createTemporaryRoot(t)
  const jzlDirectoryPath = join(root, '.jzl')
  const existingContent = 'preservar'

  writeFileSync(jzlDirectoryPath, existingContent, 'utf8')

  assert.throws(
    () => initializeProjectStateStore(createProjectContext(root)),
    { message: 'diretório JZL não é um diretório' },
  )
  assert.equal(readFileSync(jzlDirectoryPath, 'utf8'), existingContent)
})

test('rejeita state.json que seja diretório', (t) => {
  const root = createTemporaryRoot(t)
  const statePath = join(root, '.jzl', 'state.json')

  mkdirSync(statePath, { recursive: true })

  assert.throws(
    () => initializeProjectStateStore(createProjectContext(root)),
    { message: 'arquivo de estado do projeto não é um arquivo' },
  )
  assert.equal(statSync(statePath).isDirectory(), true)
})

test('inicializa com projectRoot que seja junction', (t) => {
  const temporaryBase = createTemporaryRoot(t)
  const root = join(temporaryBase, 'root')
  const rootLink = join(temporaryBase, 'root-link')
  const statePath = join(root, '.jzl', 'state.json')
  const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir'

  mkdirSync(root)
  symlinkSync(root, rootLink, directoryLinkType)

  const result = initializeProjectStateStore(createProjectContext(rootLink))

  assert.equal(result, realpathSync.native(statePath))
  assert.equal(statSync(statePath).isFile(), true)
  assert.ok(!result.includes('root-link'))
})

test('rejeita diretório JZL que seja junction externa', (t) => {
  const temporaryBase = createTemporaryRoot(t)
  const root = join(temporaryBase, 'root')
  const external = join(temporaryBase, 'external')
  const externalStatePath = join(external, 'state.json')
  const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir'

  mkdirSync(root)
  mkdirSync(external)
  symlinkSync(external, join(root, '.jzl'), directoryLinkType)

  assert.throws(
    () => initializeProjectStateStore(createProjectContext(root)),
    { message: 'projectPath resolve para fora do projectRoot' },
  )
  assert.equal(
    readdirSync(external).includes('state.json'),
    false,
  )
  assert.equal(
    statSync(external).isDirectory(),
    true,
  )
  assert.throws(() => statSync(externalStatePath))
})
