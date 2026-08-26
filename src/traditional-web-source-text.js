import { closeSync, openSync, readSync } from 'node:fs'
import { posix } from 'node:path'
import { TextDecoder } from 'node:util'

import { resolveExistingProjectPath } from './project-path.js'
import { discoverTraditionalWebProjectEntries } from './traditional-web-project-discovery.js'

const coveredExtensions = new Set(['.php', '.js', '.css', '.html', '.sql'])
const chunkSize = 64 * 1024

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidIssuePath(value) {
  return typeof value === 'string'
    && value !== ''
    && value.length <= 500
    && !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:/u.test(value)
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && posix.normalize(value) === value
    && value.split('/').every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..'
    )
}

function isCoveredSourceFile(projectPath) {
  return coveredExtensions.has(posix.extname(projectPath).toLowerCase())
}

function hasValidUtf8(context, projectPath) {
  let descriptor
  try {
    const targetPath = resolveExistingProjectPath(context, projectPath)
    descriptor = openSync(targetPath, 'r')
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const chunk = new Uint8Array(chunkSize)

    while (true) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      try {
        decoder.decode(chunk.subarray(0, bytesRead), { stream: true })
      } catch {
        return false
      }
    }

    try {
      decoder.decode()
      return true
    } catch {
      return false
    }
  } catch (error) {
    throw new Error(
      `não foi possível validar source text traditional-web: ${projectPath}`,
      { cause: error },
    )
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch (error) {
        throw new Error(
          `não foi possível validar source text traditional-web: ${projectPath}`,
          { cause: error },
        )
      }
    }
  }
}

export function validateTraditionalWebSourceTextIssue(issue) {
  if (!isObject(issue)) {
    throw new Error('issue de source text traditional-web deve ser um objeto')
  }
  if (!isValidIssuePath(issue.path)) {
    throw new Error('path do issue de source text traditional-web é inválido')
  }
  if (issue.reason !== 'invalid-utf8') {
    throw new Error('reason do issue de source text traditional-web não é suportado')
  }
  return issue
}

export function evaluateTraditionalWebSourceText(context) {
  const issues = discoverTraditionalWebProjectEntries(context)
    .filter((entry) => entry.kind === 'file' && isCoveredSourceFile(entry.path))
    .filter((entry) => !hasValidUtf8(context, entry.path))
    .map((entry) => ({ path: entry.path, reason: 'invalid-utf8' }))

  const uniqueIssues = [...new Map(
    issues.map((issue) => [`${issue.path}\u0000${issue.reason}`, issue]),
  ).values()]
  uniqueIssues.sort((left, right) => (
    left.path < right.path
      ? -1
      : left.path > right.path
        ? 1
        : left.reason < right.reason ? -1 : left.reason > right.reason ? 1 : 0
  ))
  for (const issue of uniqueIssues) validateTraditionalWebSourceTextIssue(issue)
  return uniqueIssues
}
