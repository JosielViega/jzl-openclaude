import { randomUUID } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { TextDecoder } from 'node:util'

import { createProjectEvent, validateProjectEvent } from './project-event.js'
import { PROJECT_EVENT_STORE_FILE_PROJECT_PATH } from './project-event-store-paths.js'
import {
  resolveExistingProjectPath,
  resolveProjectPathForCreate,
} from './project-path.js'
import { JZL_DIRECTORY_PROJECT_PATH } from './project-state-store-paths.js'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveExistingPathIfPresent(context, projectPath) {
  try {
    return resolveExistingProjectPath(context, projectPath)
  } catch (error) {
    if (error instanceof Error && error.message === 'projectPath não existe') {
      return undefined
    }

    throw error
  }
}

function assertEventStorePathIsFile(eventStorePath) {
  if (!statSync(eventStorePath).isFile()) {
    throw new Error('arquivo de histórico do projeto não é um arquivo')
  }
}

function assertUniqueEventIds(events) {
  const ids = new Set()

  for (const event of events) {
    validateProjectEvent(event)

    if (ids.has(event.id)) {
      throw new Error('ids dos eventos não podem ser duplicados')
    }

    ids.add(event.id)
  }
}

export function validateProjectEventStore(store) {
  if (!isObject(store)) {
    throw new Error('histórico do projeto deve ser um objeto')
  }

  if (store.schemaVersion === undefined) {
    throw new Error('schemaVersion do histórico do projeto é obrigatório')
  }

  if (!Number.isInteger(store.schemaVersion) || store.schemaVersion <= 0) {
    throw new Error(
      'schemaVersion do histórico do projeto deve ser um inteiro positivo',
    )
  }

  if (store.schemaVersion !== 1) {
    throw new Error('schemaVersion do histórico do projeto não é suportado')
  }

  if (store.events === undefined) {
    throw new Error('events do histórico do projeto é obrigatório')
  }

  if (!Array.isArray(store.events)) {
    throw new Error('events do histórico do projeto deve ser um array')
  }

  assertUniqueEventIds(store.events)

  return store
}

function serializeEventStore(store) {
  let serializedStore

  try {
    serializedStore = JSON.stringify(store, null, 2)
  } catch {
    throw new Error('histórico do projeto não pode ser serializado como JSON')
  }

  if (typeof serializedStore !== 'string') {
    throw new Error('histórico do projeto não pode ser serializado como JSON')
  }

  return `${serializedStore}\n`
}

function writeEventStoreAtomically(context, eventStorePath, store) {
  const content = serializeEventStore(store)
  const temporaryPath = resolveProjectPathForCreate(
    context,
    `${JZL_DIRECTORY_PROJECT_PATH}/.events-${randomUUID()}.tmp`,
  )
  let temporaryCreated = false

  try {
    const descriptor = openSync(temporaryPath, 'wx')
    temporaryCreated = true

    try {
      writeFileSync(descriptor, content, { encoding: 'utf8' })
    } finally {
      closeSync(descriptor)
    }

    renameSync(temporaryPath, eventStorePath)
    temporaryCreated = false
  } finally {
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true })
    }
  }
}

export function initializeProjectEventStore(context) {
  let jzlDirectoryPath = resolveExistingPathIfPresent(
    context,
    JZL_DIRECTORY_PROJECT_PATH,
  )

  if (jzlDirectoryPath === undefined) {
    jzlDirectoryPath = resolveProjectPathForCreate(
      context,
      JZL_DIRECTORY_PROJECT_PATH,
    )
    mkdirSync(jzlDirectoryPath)
  } else if (!statSync(jzlDirectoryPath).isDirectory()) {
    throw new Error('diretório JZL não é um diretório')
  }

  const existingEventStorePath = resolveExistingPathIfPresent(
    context,
    PROJECT_EVENT_STORE_FILE_PROJECT_PATH,
  )

  if (existingEventStorePath !== undefined) {
    assertEventStorePathIsFile(existingEventStorePath)
    return existingEventStorePath
  }

  const eventStorePath = resolveProjectPathForCreate(
    context,
    PROJECT_EVENT_STORE_FILE_PROJECT_PATH,
  )
  const temporaryPath = resolveProjectPathForCreate(
    context,
    `${JZL_DIRECTORY_PROJECT_PATH}/.events-${randomUUID()}.tmp`,
  )
  const content = serializeEventStore({ schemaVersion: 1, events: [] })
  let temporaryCreated = false

  try {
    const descriptor = openSync(temporaryPath, 'wx')
    temporaryCreated = true

    try {
      writeFileSync(descriptor, content, { encoding: 'utf8' })
    } finally {
      closeSync(descriptor)
    }

    const concurrentEventStorePath = resolveExistingPathIfPresent(
      context,
      PROJECT_EVENT_STORE_FILE_PROJECT_PATH,
    )

    if (concurrentEventStorePath !== undefined) {
      assertEventStorePathIsFile(concurrentEventStorePath)
      return concurrentEventStorePath
    }

    renameSync(temporaryPath, eventStorePath)
    temporaryCreated = false

    return resolveExistingProjectPath(
      context,
      PROJECT_EVENT_STORE_FILE_PROJECT_PATH,
    )
  } finally {
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true })
    }
  }
}

export function readProjectEventStore(context) {
  const eventStorePath = resolveExistingPathIfPresent(
    context,
    PROJECT_EVENT_STORE_FILE_PROJECT_PATH,
  )

  if (eventStorePath === undefined) {
    throw new Error('arquivo de histórico do projeto não existe')
  }

  assertEventStorePathIsFile(eventStorePath)

  const bytes = readFileSync(eventStorePath)
  let content

  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('arquivo de histórico do projeto não é UTF-8 válido')
  }

  let store

  try {
    store = JSON.parse(content)
  } catch {
    throw new Error('arquivo de histórico do projeto contém JSON inválido')
  }

  return validateProjectEventStore(store)
}

export function appendProjectEvent(context, input) {
  initializeProjectEventStore(context)

  const store = readProjectEventStore(context)
  const createdEvent = createProjectEvent(store.events, input)
  const newStore = {
    ...store,
    events: [...store.events, createdEvent],
  }
  const eventStorePath = resolveExistingProjectPath(
    context,
    PROJECT_EVENT_STORE_FILE_PROJECT_PATH,
  )

  validateProjectEventStore(newStore)
  writeEventStoreAtomically(context, eventStorePath, newStore)

  return createdEvent
}
