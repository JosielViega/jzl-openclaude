import assert from 'node:assert/strict'
import {
  existsSync,
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
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

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

test('lê estado válido inicializado', (t) => {
  const root = createTemporaryRoot(t)
  const context = createProjectContext(root)

  initializeProjectStateStore(context)

  assert.deepEqual(readProjectStateStore(context), { schemaVersion: 1 })
})

test('preserva campos adicionais durante a leitura', (t) => {
  const root = createTemporaryRoot(t)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')
  const content = '{\n  "schemaVersion": 1,\n  "missions": []\n}\n'

  mkdirSync(jzlDirectoryPath)
  writeFileSync(statePath, content, 'utf8')

  assert.deepEqual(readProjectStateStore(createProjectContext(root)), {
    schemaVersion: 1,
    missions: [],
  })
  assert.equal(readFileSync(statePath, 'utf8'), content)
})

test('rejeita arquivo de estado inexistente sem inicializar', (t) => {
  const root = createTemporaryRoot(t)

  assert.throws(
    () => readProjectStateStore(createProjectContext(root)),
    { message: 'arquivo de estado do projeto não existe' },
  )
  assert.equal(existsSync(join(root, '.jzl')), false)
})

test('leitura rejeita state.json que seja diretório', (t) => {
  const root = createTemporaryRoot(t)
  const statePath = join(root, '.jzl', 'state.json')

  mkdirSync(statePath, { recursive: true })

  assert.throws(
    () => readProjectStateStore(createProjectContext(root)),
    { message: 'arquivo de estado do projeto não é um arquivo' },
  )
})

test('rejeita arquivo de estado com UTF-8 inválido', (t) => {
  const root = createTemporaryRoot(t)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')

  mkdirSync(jzlDirectoryPath)
  writeFileSync(statePath, Buffer.from([0xff, 0xfe, 0xfd]))

  assert.throws(
    () => readProjectStateStore(createProjectContext(root)),
    { message: 'arquivo de estado do projeto não é UTF-8 válido' },
  )
})

test('rejeita arquivo de estado com JSON inválido', (t) => {
  const root = createTemporaryRoot(t)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')

  mkdirSync(jzlDirectoryPath)
  writeFileSync(statePath, '{"schemaVersion":', 'utf8')

  assert.throws(
    () => readProjectStateStore(createProjectContext(root)),
    { message: 'arquivo de estado do projeto contém JSON inválido' },
  )
})

test('escreve estado válido atomicamente', (t) => {
  const root = createTemporaryRoot(t)
  const context = createProjectContext(root)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')
  const state = {
    schemaVersion: 1,
    missions: [],
  }
  const expectedContent = (
    '{\n  "schemaVersion": 1,\n  "missions": []\n}\n'
  )

  initializeProjectStateStore(context)

  const result = writeProjectStateStore(context, state)
  const entries = readdirSync(jzlDirectoryPath)

  assert.equal(result, realpathSync.native(statePath))
  assert.equal(readFileSync(statePath, 'utf8'), expectedContent)
  assert.deepEqual(readProjectStateStore(context), state)
  assert.equal(entries.some((entry) => entry.endsWith('.tmp')), false)
})

test('não muta o estado recebido durante a escrita', (t) => {
  const root = createTemporaryRoot(t)
  const context = createProjectContext(root)
  const missions = []
  const state = {
    schemaVersion: 1,
    missions,
  }
  const originalState = {
    schemaVersion: 1,
    missions: [],
  }

  initializeProjectStateStore(context)
  writeProjectStateStore(context, state)

  assert.deepEqual(state, originalState)
  assert.strictEqual(state.missions, missions)
})

test('estado inválido não altera o arquivo autoritativo', (t) => {
  const root = createTemporaryRoot(t)
  const context = createProjectContext(root)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')

  initializeProjectStateStore(context)
  const originalContent = readFileSync(statePath, 'utf8')

  assert.throws(
    () => writeProjectStateStore(context, { schemaVersion: 2 }),
    { message: 'schemaVersion do estado do projeto não é suportado' },
  )
  assert.equal(readFileSync(statePath, 'utf8'), originalContent)
  assert.equal(
    readdirSync(jzlDirectoryPath).some((entry) => entry.endsWith('.tmp')),
    false,
  )
})

test('estado não serializável não altera o arquivo autoritativo', (t) => {
  const root = createTemporaryRoot(t)
  const context = createProjectContext(root)
  const jzlDirectoryPath = join(root, '.jzl')
  const statePath = join(jzlDirectoryPath, 'state.json')

  initializeProjectStateStore(context)
  const originalContent = readFileSync(statePath, 'utf8')

  assert.throws(
    () => writeProjectStateStore(context, {
      schemaVersion: 1,
      value: 1n,
    }),
    { message: 'estado do projeto não pode ser serializado como JSON' },
  )
  assert.equal(readFileSync(statePath, 'utf8'), originalContent)
  assert.equal(
    readdirSync(jzlDirectoryPath).some((entry) => entry.endsWith('.tmp')),
    false,
  )
})

test('escrita rejeita State Store não inicializado', (t) => {
  const root = createTemporaryRoot(t)

  assert.throws(
    () => writeProjectStateStore(
      createProjectContext(root),
      { schemaVersion: 1 },
    ),
    { message: 'arquivo de estado do projeto não existe' },
  )
  assert.equal(existsSync(join(root, '.jzl')), false)
})

test('escrita rejeita state.json que seja diretório', (t) => {
  const root = createTemporaryRoot(t)
  const statePath = join(root, '.jzl', 'state.json')

  mkdirSync(statePath, { recursive: true })

  assert.throws(
    () => writeProjectStateStore(
      createProjectContext(root),
      { schemaVersion: 1 },
    ),
    { message: 'arquivo de estado do projeto não é um arquivo' },
  )
  assert.equal(statSync(statePath).isDirectory(), true)
})

test('escreve estado com projectRoot que seja junction', (t) => {
  const temporaryBase = createTemporaryRoot(t)
  const root = join(temporaryBase, 'root')
  const rootLink = join(temporaryBase, 'root-link')
  const statePath = join(root, '.jzl', 'state.json')
  const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir'
  const state = {
    schemaVersion: 1,
    missions: [],
  }

  mkdirSync(root)
  symlinkSync(root, rootLink, directoryLinkType)

  const context = createProjectContext(rootLink)
  initializeProjectStateStore(context)

  const result = writeProjectStateStore(context, state)

  assert.equal(result, realpathSync.native(statePath))
  assert.ok(!result.includes('root-link'))
  assert.deepEqual(readProjectStateStore(context), state)
  assert.equal(
    readdirSync(join(root, '.jzl')).some((entry) => entry.endsWith('.tmp')),
    false,
  )
})

test('controla junction JZL interna e bloqueia externa', (t) => {
  const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir'
  const internalBase = createTemporaryRoot(t)
  const internalRoot = join(internalBase, 'root')
  const internalJzl = join(internalRoot, 'internal-jzl')
  const internalStatePath = join(internalJzl, 'state.json')
  const initialContent = '{\n  "schemaVersion": 1\n}\n'
  const state = {
    schemaVersion: 1,
    missions: [],
  }
  const updatedContent = (
    '{\n  "schemaVersion": 1,\n  "missions": []\n}\n'
  )

  mkdirSync(internalJzl, { recursive: true })
  writeFileSync(internalStatePath, initialContent, 'utf8')
  symlinkSync(internalJzl, join(internalRoot, '.jzl'), directoryLinkType)

  const internalResult = writeProjectStateStore(
    createProjectContext(internalRoot),
    state,
  )

  assert.equal(internalResult, realpathSync.native(internalStatePath))
  assert.equal(readFileSync(internalStatePath, 'utf8'), updatedContent)
  assert.equal(
    readdirSync(internalJzl).some((entry) => entry.endsWith('.tmp')),
    false,
  )

  const externalBase = createTemporaryRoot(t)
  const externalRoot = join(externalBase, 'root')
  const external = join(externalBase, 'external')
  const externalStatePath = join(external, 'state.json')
  const externalContent = '{"schemaVersion":1}'

  mkdirSync(externalRoot)
  mkdirSync(external)
  writeFileSync(externalStatePath, externalContent, 'utf8')
  symlinkSync(external, join(externalRoot, '.jzl'), directoryLinkType)

  assert.throws(
    () => writeProjectStateStore(
      createProjectContext(externalRoot),
      { schemaVersion: 1 },
    ),
    { message: 'projectPath resolve para fora do projectRoot' },
  )
  assert.equal(readFileSync(externalStatePath, 'utf8'), externalContent)
  assert.deepEqual(readdirSync(external), ['state.json'])
})
