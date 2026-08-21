import {
  closeSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'

import {
  resolveExistingProjectPath,
  resolveProjectPathForCreate,
} from './project-path.js'
import { createInitialProjectState } from './project-state.js'
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
