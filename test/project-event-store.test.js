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
  appendProjectEvent,
  initializeProjectEventStore,
  readProjectEventStore,
  validateProjectEventStore,
} from '../src/project-event-store.js'

function createRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-project-event-store-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function unavailableInput(missionId = 'mission-0001', extraData = {}) {
  return {
    type: 'mission.validation.unavailable',
    missionId,
    data: { status: 'validation', errorMessage: 'indisponível', ...extraData },
  }
}

test('inicializa Event Store vazio com formato estável', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const path = join(root, '.jzl', 'events.json')
  const result = initializeProjectEventStore(context)

  assert.equal(result, realpathSync.native(path))
  assert.equal(readFileSync(path, 'utf8'), '{\n  "schemaVersion": 1,\n  "events": []\n}\n')
  assert.deepEqual(readProjectEventStore(context), { schemaVersion: 1, events: [] })
  assert.deepEqual(readdirSync(join(root, '.jzl')), ['events.json'])
})

test('initialize é idempotente e não sobrescreve histórico', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectEventStore(context)
  appendProjectEvent(context, unavailableInput())
  const path = join(root, '.jzl', 'events.json')
  const before = readFileSync(path, 'utf8')

  assert.equal(initializeProjectEventStore(context), realpathSync.native(path))
  assert.equal(readFileSync(path, 'utf8'), before)
})

test('append inicializa store ausente e gera IDs sequenciais', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)

  const first = appendProjectEvent(context, unavailableInput('mission-0001'))
  const second = appendProjectEvent(context, unavailableInput('mission-0002'))

  assert.equal(first.id, 'event-000001')
  assert.equal(second.id, 'event-000002')
  assert.deepEqual(
    readProjectEventStore(context).events.map(({ id }) => id),
    ['event-000001', 'event-000002'],
  )
  assert.equal(JSON.stringify(readProjectEventStore(context)).includes('projectRoot'), false)
  assert.equal(readdirSync(join(root, '.jzl')).some((name) => name.endsWith('.tmp')), false)
})

test('append usa maior ID persistido e preserva campos aditivos', (t) => {
  const root = createRoot(t)
  const path = join(root, '.jzl', 'events.json')
  mkdirSync(join(root, '.jzl'))
  const baseEvent = {
    type: 'mission.validation.unavailable',
    occurredAt: '2026-08-22T12:34:56.789Z',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'x' },
  }
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    metadata: { keep: true },
    events: [
      { id: 'event-000001', ...baseEvent },
      { id: 'event-000005', ...baseEvent },
    ],
  }), 'utf8')

  const created = appendProjectEvent(createProjectContext(root), unavailableInput())
  const store = readProjectEventStore(createProjectContext(root))

  assert.equal(created.id, 'event-000006')
  assert.deepEqual(store.metadata, { keep: true })
})

test('read ausente não inicializa store', (t) => {
  const root = createRoot(t)
  assert.throws(() => readProjectEventStore(createProjectContext(root)), {
    message: 'arquivo de histórico do projeto não existe',
  })
  assert.equal(existsSync(join(root, '.jzl')), false)
})

test('rejeita events.json que seja diretório', (t) => {
  const root = createRoot(t)
  mkdirSync(join(root, '.jzl', 'events.json'), { recursive: true })
  const context = createProjectContext(root)
  assert.throws(() => initializeProjectEventStore(context), {
    message: 'arquivo de histórico do projeto não é um arquivo',
  })
  assert.throws(() => readProjectEventStore(context), {
    message: 'arquivo de histórico do projeto não é um arquivo',
  })
})

test('rejeita UTF-8 inválido, JSON inválido e evento inválido', (t) => {
  for (const [content, message] of [
    [Buffer.from([0xff]), 'arquivo de histórico do projeto não é UTF-8 válido'],
    ['{', 'arquivo de histórico do projeto contém JSON inválido'],
    [JSON.stringify({ schemaVersion: 1, events: [{}] }), 'id do evento é obrigatório'],
  ]) {
    const root = createRoot(t)
    mkdirSync(join(root, '.jzl'))
    writeFileSync(join(root, '.jzl', 'events.json'), content)
    assert.throws(() => readProjectEventStore(createProjectContext(root)), { message })
  }
})

test('rejeita IDs duplicados no arquivo', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectEventStore(context)
  appendProjectEvent(context, unavailableInput())
  const path = join(root, '.jzl', 'events.json')
  const store = readProjectEventStore(context)
  store.events.push({ ...store.events[0] })
  writeFileSync(path, JSON.stringify(store), 'utf8')

  assert.throws(() => readProjectEventStore(context), {
    message: 'ids dos eventos não podem ser duplicados',
  })
})

test('valida shape do Event Store e preserva referência aditiva', () => {
  for (const [store, message] of [
    [null, 'histórico do projeto deve ser um objeto'],
    [{ events: [] }, 'schemaVersion do histórico do projeto é obrigatório'],
    [{ schemaVersion: 0, events: [] }, 'schemaVersion do histórico do projeto deve ser um inteiro positivo'],
    [{ schemaVersion: 2, events: [] }, 'schemaVersion do histórico do projeto não é suportado'],
    [{ schemaVersion: 1 }, 'events do histórico do projeto é obrigatório'],
    [{ schemaVersion: 1, events: {} }, 'events do histórico do projeto deve ser um array'],
  ]) {
    assert.throws(() => validateProjectEventStore(store), { message })
  }
  const store = { schemaVersion: 1, events: [], metadata: true }
  assert.strictEqual(validateProjectEventStore(store), store)
})

test('erro de serialização preserva histórico e limpa temp', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectEventStore(context)
  const path = join(root, '.jzl', 'events.json')
  const before = readFileSync(path, 'utf8')

  assert.throws(() => appendProjectEvent(context, unavailableInput(
    'mission-0001',
    { value: 1n },
  )), { message: 'histórico do projeto não pode ser serializado como JSON' })
  assert.equal(readFileSync(path, 'utf8'), before)
  assert.equal(readdirSync(join(root, '.jzl')).some((name) => name.endsWith('.tmp')), false)
})

test('aceita junction interna de .jzl', (t) => {
  const base = createRoot(t)
  const root = join(base, 'root')
  const internal = join(root, 'internal-jzl')
  mkdirSync(internal, { recursive: true })
  symlinkSync(internal, join(root, '.jzl'), process.platform === 'win32' ? 'junction' : 'dir')
  const context = createProjectContext(root)

  const result = initializeProjectEventStore(context)
  appendProjectEvent(context, unavailableInput())

  assert.equal(result, realpathSync.native(join(internal, 'events.json')))
  assert.equal(statSync(join(internal, 'events.json')).isFile(), true)
  assert.equal(readProjectEventStore(context).events.length, 1)
})

test('rejeita junction externa de .jzl sem criar arquivos', (t) => {
  const base = createRoot(t)
  const root = join(base, 'root')
  const external = join(base, 'external')
  mkdirSync(root)
  mkdirSync(external)
  symlinkSync(external, join(root, '.jzl'), process.platform === 'win32' ? 'junction' : 'dir')

  assert.throws(
    () => initializeProjectEventStore(createProjectContext(root)),
    { message: 'projectPath resolve para fora do projectRoot' },
  )
  assert.deepEqual(readdirSync(external), [])
})
