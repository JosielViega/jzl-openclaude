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
import { randomUUID } from 'node:crypto'
import { TextDecoder } from 'node:util'

import {
  resolveExistingProjectPath,
  resolveProjectPathForCreate,
} from './project-path.js'
import {
  createInitialProjectState,
  validateProjectState,
} from './project-state.js'
import {
  JZL_DIRECTORY_PROJECT_PATH,
  PROJECT_STATE_FILE_PROJECT_PATH,
} from './project-state-store-paths.js'

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

function assertStatePathIsFile(statePath) {
  if (!statSync(statePath).isFile()) {
    throw new Error('arquivo de estado do projeto não é um arquivo')
  }
}

export function initializeProjectStateStore(context) {
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

  const existingStatePath = resolveExistingPathIfPresent(
    context,
    PROJECT_STATE_FILE_PROJECT_PATH,
  )

  if (existingStatePath !== undefined) {
    assertStatePathIsFile(existingStatePath)
    return existingStatePath
  }

  const statePath = resolveProjectPathForCreate(
    context,
    PROJECT_STATE_FILE_PROJECT_PATH,
  )
  const temporaryProjectPath = (
    `${JZL_DIRECTORY_PROJECT_PATH}/.state-${randomUUID()}.tmp`
  )
  const temporaryPath = resolveProjectPathForCreate(
    context,
    temporaryProjectPath,
  )
  const content = `${JSON.stringify(createInitialProjectState(), null, 2)}\n`
  let temporaryCreated = false

  try {
    const temporaryFileDescriptor = openSync(temporaryPath, 'wx')
    temporaryCreated = true

    try {
      writeFileSync(temporaryFileDescriptor, content, { encoding: 'utf8' })
    } finally {
      closeSync(temporaryFileDescriptor)
    }

    const concurrentStatePath = resolveExistingPathIfPresent(
      context,
      PROJECT_STATE_FILE_PROJECT_PATH,
    )

    if (concurrentStatePath !== undefined) {
      assertStatePathIsFile(concurrentStatePath)
      return concurrentStatePath
    }

    renameSync(temporaryPath, statePath)
    temporaryCreated = false

    return resolveExistingProjectPath(
      context,
      PROJECT_STATE_FILE_PROJECT_PATH,
    )
  } finally {
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true })
    }
  }
}

export function readProjectStateStore(context) {
  const statePath = resolveExistingPathIfPresent(
    context,
    PROJECT_STATE_FILE_PROJECT_PATH,
  )

  if (statePath === undefined) {
    throw new Error('arquivo de estado do projeto não existe')
  }

  assertStatePathIsFile(statePath)

  const stateBytes = readFileSync(statePath)
  let content

  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(stateBytes)
  } catch {
    throw new Error('arquivo de estado do projeto não é UTF-8 válido')
  }

  let parsedState

  try {
    parsedState = JSON.parse(content)
  } catch {
    throw new Error('arquivo de estado do projeto contém JSON inválido')
  }

  return validateProjectState(parsedState)
}

export function writeProjectStateStore(context, state) {
  const validatedState = validateProjectState(state)
  let serializedState

  try {
    serializedState = JSON.stringify(validatedState, null, 2)
  } catch {
    throw new Error('estado do projeto não pode ser serializado como JSON')
  }

  if (typeof serializedState !== 'string') {
    throw new Error('estado do projeto não pode ser serializado como JSON')
  }

  const statePath = resolveExistingPathIfPresent(
    context,
    PROJECT_STATE_FILE_PROJECT_PATH,
  )

  if (statePath === undefined) {
    throw new Error('arquivo de estado do projeto não existe')
  }

  assertStatePathIsFile(statePath)

  const temporaryProjectPath = (
    `${JZL_DIRECTORY_PROJECT_PATH}/.state-${randomUUID()}.tmp`
  )
  const temporaryPath = resolveProjectPathForCreate(
    context,
    temporaryProjectPath,
  )
  let temporaryCreated = false

  try {
    const temporaryFileDescriptor = openSync(temporaryPath, 'wx')
    temporaryCreated = true

    try {
      writeFileSync(
        temporaryFileDescriptor,
        `${serializedState}\n`,
        { encoding: 'utf8' },
      )
    } finally {
      closeSync(temporaryFileDescriptor)
    }

    renameSync(temporaryPath, statePath)
    temporaryCreated = false

    return resolveExistingProjectPath(
      context,
      PROJECT_STATE_FILE_PROJECT_PATH,
    )
  } finally {
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true })
    }
  }
}
