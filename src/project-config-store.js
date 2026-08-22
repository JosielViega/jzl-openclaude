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

import {
  createProjectConfig,
  validateProjectConfig,
} from './project-config.js'
import { PROJECT_CONFIG_FILE_PROJECT_PATH } from './project-config-store-paths.js'
import {
  resolveExistingProjectPath,
  resolveProjectPathForCreate,
} from './project-path.js'
import { JZL_DIRECTORY_PROJECT_PATH } from './project-state-store-paths.js'

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

function assertConfigPathIsFile(configPath) {
  if (!statSync(configPath).isFile()) {
    throw new Error('arquivo de configuração do projeto não é um arquivo')
  }
}

function serializeConfig(config) {
  let serializedConfig

  try {
    serializedConfig = JSON.stringify(config, null, 2)
  } catch {
    throw new Error('configuração do projeto não pode ser serializada como JSON')
  }

  if (typeof serializedConfig !== 'string') {
    throw new Error('configuração do projeto não pode ser serializada como JSON')
  }

  return `${serializedConfig}\n`
}

function createTemporaryConfigPath(context) {
  return resolveProjectPathForCreate(
    context,
    `${JZL_DIRECTORY_PROJECT_PATH}/.config-${randomUUID()}.tmp`,
  )
}

export function initializeProjectConfigStore(context, input) {
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

  const existingConfigPath = resolveExistingPathIfPresent(
    context,
    PROJECT_CONFIG_FILE_PROJECT_PATH,
  )

  if (existingConfigPath !== undefined) {
    assertConfigPathIsFile(existingConfigPath)
    return existingConfigPath
  }

  const config = createProjectConfig(input)
  const content = serializeConfig(config)
  const configPath = resolveProjectPathForCreate(
    context,
    PROJECT_CONFIG_FILE_PROJECT_PATH,
  )
  const temporaryPath = createTemporaryConfigPath(context)
  let temporaryCreated = false

  try {
    const descriptor = openSync(temporaryPath, 'wx')
    temporaryCreated = true

    try {
      writeFileSync(descriptor, content, { encoding: 'utf8' })
    } finally {
      closeSync(descriptor)
    }

    const concurrentConfigPath = resolveExistingPathIfPresent(
      context,
      PROJECT_CONFIG_FILE_PROJECT_PATH,
    )

    if (concurrentConfigPath !== undefined) {
      assertConfigPathIsFile(concurrentConfigPath)
      return concurrentConfigPath
    }

    renameSync(temporaryPath, configPath)
    temporaryCreated = false

    return resolveExistingProjectPath(context, PROJECT_CONFIG_FILE_PROJECT_PATH)
  } finally {
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true })
    }
  }
}

export function readProjectConfigStore(context) {
  const configPath = resolveExistingPathIfPresent(
    context,
    PROJECT_CONFIG_FILE_PROJECT_PATH,
  )

  if (configPath === undefined) {
    throw new Error('arquivo de configuração do projeto não existe')
  }

  assertConfigPathIsFile(configPath)

  const bytes = readFileSync(configPath)
  let content

  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('arquivo de configuração do projeto não é UTF-8 válido')
  }

  let config

  try {
    config = JSON.parse(content)
  } catch {
    throw new Error('arquivo de configuração do projeto contém JSON inválido')
  }

  return validateProjectConfig(config)
}

export function writeProjectConfigStore(context, config) {
  const validatedConfig = validateProjectConfig(config)
  const content = serializeConfig(validatedConfig)
  const configPath = resolveExistingPathIfPresent(
    context,
    PROJECT_CONFIG_FILE_PROJECT_PATH,
  )

  if (configPath === undefined) {
    throw new Error('arquivo de configuração do projeto não existe')
  }

  assertConfigPathIsFile(configPath)

  const temporaryPath = createTemporaryConfigPath(context)
  let temporaryCreated = false

  try {
    const descriptor = openSync(temporaryPath, 'wx')
    temporaryCreated = true

    try {
      writeFileSync(descriptor, content, { encoding: 'utf8' })
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporaryPath, configPath)
    temporaryCreated = false

    return resolveExistingProjectPath(context, PROJECT_CONFIG_FILE_PROJECT_PATH)
  } finally {
    if (temporaryCreated) {
      rmSync(temporaryPath, { force: true })
    }
  }
}
