import { lstatSync, readdirSync } from 'node:fs'
import { join, posix } from 'node:path'

import { resolveExistingProjectPath } from './project-path.js'
import { validateProjectRoot } from './project-root.js'

const controlNames = new Set(['.jzl', '.git', '.openclaude'])
const dependencyNames = new Set(['vendor', 'node_modules'])
const manifestNames = new Set([
  'composer.json', 'composer.lock', 'package.json', 'package-lock.json',
])
const supportedReasons = new Set([
  'control-path-publicly-exposed',
  'dependency-path-publicly-exposed',
  'environment-path-publicly-exposed',
  'dependency-manifest-publicly-exposed',
])

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

function comparableName(name) {
  return process.platform === 'win32' ? name.toLowerCase() : name
}

function classify(parentPath, name, stats) {
  const comparable = comparableName(name)
  if (controlNames.has(comparable)) return 'control-path-publicly-exposed'
  if (dependencyNames.has(comparable)) return 'dependency-path-publicly-exposed'
  if (comparable === '.env' || comparable.startsWith('.env.')) {
    return 'environment-path-publicly-exposed'
  }
  if (
    parentPath === 'public'
    && manifestNames.has(comparable)
    && (stats.isFile() || stats.isSymbolicLink())
  ) {
    return 'dependency-manifest-publicly-exposed'
  }
  return null
}

function inspectPublicRoot(projectRoot) {
  try {
    return lstatSync(join(projectRoot, 'public'), { throwIfNoEntry: false })
  } catch (error) {
    throw new Error('não foi possível inspecionar public traditional-web', {
      cause: error,
    })
  }
}

function listDirectory(directoryPath, projectPath) {
  try {
    return readdirSync(directoryPath).sort()
  } catch (error) {
    throw new Error(
      `não foi possível listar public traditional-web: ${projectPath}`,
      { cause: error },
    )
  }
}

function inspectEntry(directoryPath, name, projectPath) {
  try {
    return lstatSync(join(directoryPath, name))
  } catch (error) {
    throw new Error(
      `não foi possível inspecionar public traditional-web: ${projectPath}`,
      { cause: error },
    )
  }
}

export function validateTraditionalWebPublicExposureIssue(issue) {
  if (!isObject(issue)) {
    throw new Error('issue de public exposure traditional-web deve ser um objeto')
  }
  if (!isValidIssuePath(issue.path)) {
    throw new Error('path do issue de public exposure traditional-web é inválido')
  }
  if (!supportedReasons.has(issue.reason)) {
    throw new Error('reason do issue de public exposure traditional-web não é suportado')
  }
  return issue
}

export function evaluateTraditionalWebPublicExposure(context) {
  const projectRoot = validateProjectRoot(context?.projectRoot)
  const publicStats = inspectPublicRoot(projectRoot)
  if (
    publicStats === undefined
    || publicStats.isSymbolicLink()
    || !publicStats.isDirectory()
  ) return []

  let publicPath
  try {
    publicPath = resolveExistingProjectPath(context, 'public')
  } catch (error) {
    throw new Error('não foi possível inspecionar public traditional-web', {
      cause: error,
    })
  }

  const issues = []

  function visit(directoryPath, directoryProjectPath) {
    for (const name of listDirectory(directoryPath, directoryProjectPath)) {
      const projectPath = `${directoryProjectPath}/${name}`
      const stats = inspectEntry(directoryPath, name, projectPath)
      const reason = classify(directoryProjectPath, name, stats)
      if (reason !== null) {
        issues.push({ path: projectPath, reason })
        continue
      }
      if (stats.isSymbolicLink() || !stats.isDirectory()) continue

      let childPath
      try {
        childPath = resolveExistingProjectPath(context, projectPath)
      } catch (error) {
        throw new Error(
          `não foi possível inspecionar public traditional-web: ${projectPath}`,
          { cause: error },
        )
      }
      visit(childPath, projectPath)
    }
  }

  visit(publicPath, 'public')
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
  for (const issue of uniqueIssues) validateTraditionalWebPublicExposureIssue(issue)
  return uniqueIssues
}
