import { createHash } from 'node:crypto'
import {
  closeSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  readlinkSync,
} from 'node:fs'
import { join } from 'node:path'

import { createProjectContext } from './project-context.js'

const controlDirectories = new Set(['.jzl', '.git', '.openclaude'])
const digestPattern = /^[0-9a-f]{64}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedControlName(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function isControlPath(projectPath) {
  return controlDirectories.has(normalizedControlName(projectPath.split('/')[0]))
}

function validateSnapshotPath(projectPath) {
  if (
    typeof projectPath !== 'string'
    || projectPath === ''
    || projectPath.includes('\\')
    || projectPath.startsWith('/')
    || projectPath.endsWith('/')
    || /^[A-Za-z]:/.test(projectPath)
    || /[\r\n\0]/.test(projectPath)
    || projectPath.split('/').some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('path do snapshot não é relativo e normalizado')
  }

  if (projectPath.length > 500) {
    throw new Error('path do snapshot excede o limite permitido')
  }

  if (isControlPath(projectPath)) {
    throw new Error('path do snapshot pertence a namespace de controle')
  }
}

function hashFile(absolutePath, projectPath) {
  let descriptor
  let readError = false

  try {
    descriptor = openSync(absolutePath, 'r')
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)

    while (true) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null)

      if (bytesRead === 0) {
        return hash.digest('hex')
      }

      hash.update(buffer.subarray(0, bytesRead))
    }
  } catch (cause) {
    readError = true
    throw new Error(`não foi possível ler arquivo do snapshot: ${projectPath}`, {
      cause,
    })
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch (cause) {
        if (!readError) {
          throw new Error(`não foi possível ler arquivo do snapshot: ${projectPath}`, {
            cause,
          })
        }
      }
    }
  }
}

function hashLink(absolutePath, projectPath) {
  try {
    return createHash('sha256').update(readlinkSync(absolutePath)).digest('hex')
  } catch (cause) {
    throw new Error(`não foi possível ler link do snapshot: ${projectPath}`, {
      cause,
    })
  }
}

function listDirectory(absolutePath, projectPath) {
  try {
    return readdirSync(absolutePath).sort(comparePaths)
  } catch (cause) {
    const message = projectPath === ''
      ? 'não foi possível listar projectRoot para snapshot'
      : `não foi possível listar diretório do snapshot: ${projectPath}`
    throw new Error(message, { cause })
  }
}

function collectEntries(rootPath, directoryPath = '', entries = []) {
  const absoluteDirectory = directoryPath === ''
    ? rootPath
    : join(rootPath, ...directoryPath.split('/'))

  for (const name of listDirectory(absoluteDirectory, directoryPath)) {
    const projectPath = directoryPath === '' ? name : `${directoryPath}/${name}`

    if (directoryPath === '' && isControlPath(projectPath)) {
      continue
    }

    validateSnapshotPath(projectPath)
    const absolutePath = join(absoluteDirectory, name)
    let stats

    try {
      stats = lstatSync(absolutePath)
    } catch (cause) {
      throw new Error(`não foi possível inspecionar entrada do snapshot: ${projectPath}`, {
        cause,
      })
    }

    if (stats.isSymbolicLink()) {
      entries.push({
        path: projectPath,
        kind: 'symlink',
        digest: hashLink(absolutePath, projectPath),
      })
    } else if (stats.isDirectory()) {
      collectEntries(rootPath, projectPath, entries)
    } else if (stats.isFile()) {
      entries.push({
        path: projectPath,
        kind: 'file',
        digest: hashFile(absolutePath, projectPath),
      })
    } else {
      throw new Error(`tipo de entrada do snapshot não é suportado: ${projectPath}`)
    }
  }

  return entries
}

export function validateProjectFilesystemSnapshot(snapshot) {
  if (!isObject(snapshot)) {
    throw new Error('snapshot do filesystem deve ser um objeto')
  }

  if (!Array.isArray(snapshot.entries)) {
    throw new Error('entries do snapshot deve ser um array')
  }

  let previousPath = null

  for (const entry of snapshot.entries) {
    if (!isObject(entry)) {
      throw new Error('entry do snapshot deve ser um objeto')
    }

    validateSnapshotPath(entry.path)

    if (previousPath !== null && comparePaths(previousPath, entry.path) >= 0) {
      throw new Error('entries do snapshot devem possuir paths únicos e ordenados')
    }

    if (!['file', 'symlink'].includes(entry.kind)) {
      throw new Error('kind da entry do snapshot não é suportado')
    }

    if (typeof entry.digest !== 'string' || !digestPattern.test(entry.digest)) {
      throw new Error('digest da entry do snapshot é inválido')
    }

    previousPath = entry.path
  }

  return snapshot
}

export function createProjectFilesystemSnapshot(context) {
  const projectContext = createProjectContext(context?.projectRoot)
  const snapshot = {
    entries: collectEntries(projectContext.projectRoot)
      .sort((left, right) => comparePaths(left.path, right.path)),
  }

  return validateProjectFilesystemSnapshot(snapshot)
}
