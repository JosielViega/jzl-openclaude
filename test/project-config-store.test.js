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
  initializeProjectConfigStore,
  readProjectConfigStore,
  writeProjectConfigStore,
} from '../src/project-config-store.js'

function createRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-project-config-store-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function minimumInput() {
  return { template: 'traditional-web' }
}

test('inicializa configuração mínima separada do State Store', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const configPath = join(root, '.jzl', 'config.json')
  const result = initializeProjectConfigStore(context, {
    ...minimumInput(),
    projectRoot: root,
  })

  assert.equal(result, realpathSync.native(configPath))
  assert.equal(readFileSync(configPath, 'utf8'), '{\n  "schemaVersion": 1,\n  "template": "traditional-web",\n  "standardsProfile": "traditional-web-v4",\n  "tools": {}\n}\n')
  assert.equal(existsSync(join(root, '.jzl', 'state.json')), false)
  assert.equal(readFileSync(configPath, 'utf8').includes('projectRoot'), false)
  assert.deepEqual(readdirSync(join(root, '.jzl')), ['config.json'])
})

test('inicializa configuração com PHP', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectConfigStore(context, {
    template: 'traditional-web',
    tools: { php: { executable: process.execPath } },
  })

  assert.deepEqual(readProjectConfigStore(context), {
    schemaVersion: 1,
    template: 'traditional-web',
    standardsProfile: 'traditional-web-v4',
    tools: { php: { executable: process.execPath, argsPrefix: [] } },
  })
})

test('não sobrescreve config existente', (t) => {
  const root = createRoot(t)
  const path = join(root, '.jzl', 'config.json')
  mkdirSync(join(root, '.jzl'))
  writeFileSync(path, 'preservar', 'utf8')

  assert.equal(initializeProjectConfigStore(createProjectContext(root), null), realpathSync.native(path))
  assert.equal(readFileSync(path, 'utf8'), 'preservar')
})

test('lê e escreve configuração preservando campos aditivos', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const config = {
    schemaVersion: 1,
    template: 'traditional-web',
    tools: {},
    metadata: { keep: true },
  }
  initializeProjectConfigStore(context, minimumInput())
  writeProjectConfigStore(context, config)

  assert.deepEqual(readProjectConfigStore(context), config)
  assert.equal(Object.hasOwn(readProjectConfigStore(context), 'standardsProfile'), false)
  assert.equal(readFileSync(join(root, '.jzl', 'config.json'), 'utf8').endsWith('\n'), true)
  assert.equal(readdirSync(join(root, '.jzl')).some((name) => name.endsWith('.tmp')), false)
})

test('lê e regrava config legacy sem adicionar standardsProfile', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const configPath = join(root, '.jzl', 'config.json')
  const legacy = { schemaVersion: 1, template: 'traditional-web', tools: {} }
  mkdirSync(join(root, '.jzl'))
  writeFileSync(configPath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8')

  const read = readProjectConfigStore(context)
  assert.deepEqual(read, legacy)
  assert.equal(Object.hasOwn(read, 'standardsProfile'), false)
  writeProjectConfigStore(context, read)
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), legacy)
  assert.equal(readFileSync(configPath, 'utf8').endsWith('\n'), true)
})

test('preserva profile explícito e rejeita profile inválido na leitura', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const configPath = join(root, '.jzl', 'config.json')
  mkdirSync(join(root, '.jzl'))
  const pinned = {
    schemaVersion: 1, template: 'traditional-web',
    standardsProfile: 'traditional-web-v1', tools: {},
  }
  writeFileSync(configPath, `${JSON.stringify(pinned, null, 2)}\n`, 'utf8')
  assert.deepEqual(readProjectConfigStore(context), pinned)
  writeProjectConfigStore(context, pinned)
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), pinned)

  writeFileSync(configPath, JSON.stringify({
    ...pinned, standardsProfile: 'traditional-web-unknown',
  }), 'utf8')
  assert.throws(() => readProjectConfigStore(context), {
    message: 'standardsProfile da configuração do projeto não é suportado para o template',
  })
})

test('rejeita configuração ausente sem inicializar', (t) => {
  const root = createRoot(t)
  assert.throws(() => readProjectConfigStore(createProjectContext(root)), {
    message: 'arquivo de configuração do projeto não existe',
  })
  assert.equal(existsSync(join(root, '.jzl')), false)
})

test('rejeita config.json que seja diretório', (t) => {
  const root = createRoot(t)
  mkdirSync(join(root, '.jzl', 'config.json'), { recursive: true })
  const context = createProjectContext(root)

  assert.throws(() => readProjectConfigStore(context), {
    message: 'arquivo de configuração do projeto não é um arquivo',
  })
  assert.throws(() => initializeProjectConfigStore(context, minimumInput()), {
    message: 'arquivo de configuração do projeto não é um arquivo',
  })
})

test('rejeita JSON inválido e UTF-8 inválido', (t) => {
  for (const [content, message] of [
    ['{', 'arquivo de configuração do projeto contém JSON inválido'],
    [Buffer.from([0xff]), 'arquivo de configuração do projeto não é UTF-8 válido'],
  ]) {
    const root = createRoot(t)
    mkdirSync(join(root, '.jzl'))
    writeFileSync(join(root, '.jzl', 'config.json'), content)
    assert.throws(() => readProjectConfigStore(createProjectContext(root)), { message })
  }
})

test('write exige store inicializado', (t) => {
  const root = createRoot(t)
  assert.throws(() => writeProjectConfigStore(createProjectContext(root), {
    schemaVersion: 1,
    template: 'traditional-web',
    tools: {},
  }), { message: 'arquivo de configuração do projeto não existe' })
})

test('write inválido e não serializável preservam conteúdo e não deixam temp', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const configPath = join(root, '.jzl', 'config.json')
  initializeProjectConfigStore(context, minimumInput())
  const original = readFileSync(configPath, 'utf8')

  assert.throws(() => writeProjectConfigStore(context, { schemaVersion: 2 }), {
    message: 'schemaVersion da configuração do projeto não é suportado',
  })
  assert.throws(() => writeProjectConfigStore(context, {
    schemaVersion: 1,
    template: 'traditional-web',
    tools: {},
    bigint: 1n,
  }), { message: 'configuração do projeto não pode ser serializada como JSON' })
  assert.equal(readFileSync(configPath, 'utf8'), original)
  assert.equal(readdirSync(join(root, '.jzl')).some((name) => name.endsWith('.tmp')), false)
})

test('aceita junction interna de .jzl', (t) => {
  const base = createRoot(t)
  const root = join(base, 'root')
  const internal = join(root, 'internal-jzl')
  mkdirSync(internal, { recursive: true })
  symlinkSync(internal, join(root, '.jzl'), process.platform === 'win32' ? 'junction' : 'dir')
  const context = createProjectContext(root)

  const result = initializeProjectConfigStore(context, minimumInput())
  assert.equal(result, realpathSync.native(join(internal, 'config.json')))
  assert.equal(statSync(join(internal, 'config.json')).isFile(), true)
  assert.equal(readdirSync(internal).some((name) => name.endsWith('.tmp')), false)
})

test('rejeita junction externa de .jzl sem resíduos', (t) => {
  const base = createRoot(t)
  const root = join(base, 'root')
  const external = join(base, 'external')
  mkdirSync(root)
  mkdirSync(external)
  symlinkSync(external, join(root, '.jzl'), process.platform === 'win32' ? 'junction' : 'dir')

  assert.throws(
    () => initializeProjectConfigStore(createProjectContext(root), minimumInput()),
    { message: 'projectPath resolve para fora do projectRoot' },
  )
  assert.deepEqual(readdirSync(external), [])
})
