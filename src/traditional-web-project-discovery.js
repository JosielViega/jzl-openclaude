import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { resolveExistingProjectPath } from './project-path.js'

const ignoredDirectoryNames = new Set([
  '.jzl',
  '.git',
  '.openclaude',
  'vendor',
  'node_modules',
])

function isIgnoredDirectory(name) {
  const comparableName = process.platform === 'win32' ? name.toLowerCase() : name
  return ignoredDirectoryNames.has(comparableName)
}

function listDirectory(directoryPath, projectPath) {
  try {
    return readdirSync(directoryPath)
  } catch (error) {
    const message = projectPath === '.'
      ? 'não foi possível listar projectRoot traditional-web'
      : `não foi possível listar diretório traditional-web: ${projectPath}`
    throw new Error(message, { cause: error })
  }
}

function inspectEntry(context, directoryPath, name, projectPath) {
  try {
    const lexicalStats = lstatSync(join(directoryPath, name))
    if (lexicalStats.isSymbolicLink()) {
      return { stats: lexicalStats }
    }
    const absolutePath = resolveExistingProjectPath(context, projectPath)
    return {
      absolutePath,
      stats: lstatSync(absolutePath),
    }
  } catch (error) {
    throw new Error(
      `não foi possível inspecionar entrada traditional-web: ${projectPath}`,
      { cause: error },
    )
  }
}

export function discoverTraditionalWebProjectEntries(context) {
  let rootPath
  try {
    rootPath = resolveExistingProjectPath(context, '.')
  } catch (error) {
    throw new Error('não foi possível listar projectRoot traditional-web', {
      cause: error,
    })
  }
  const discovered = []

  function visit(directoryPath, directoryProjectPath) {
    for (const name of listDirectory(directoryPath, directoryProjectPath)) {
      const projectPath = directoryProjectPath === '.'
        ? name
        : `${directoryProjectPath}/${name}`
      const { absolutePath, stats } = inspectEntry(
        context,
        directoryPath,
        name,
        projectPath,
      )

      if (stats.isSymbolicLink()) {
        continue
      }

      if (stats.isDirectory()) {
        if (isIgnoredDirectory(name)) {
          continue
        }

        discovered.push({ path: projectPath, kind: 'directory' })
        visit(absolutePath, projectPath)
      } else if (stats.isFile()) {
        discovered.push({ path: projectPath, kind: 'file' })
      }
    }
  }

  visit(rootPath, '.')

  return discovered.sort((left, right) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  ))
}
