import { lstatSync, mkdirSync } from 'node:fs'
import { join, posix } from 'node:path'

import { discoverTraditionalWebProjectEntries } from './traditional-web-project-discovery.js'
import { resolveProjectPathForCreate } from './project-path.js'
import { validateProjectRoot } from './project-root.js'

const requiredDirectories = [
  'public',
  'public/assets',
  'public/assets/css',
  'public/assets/js',
  'public/assets/images',
  'src',
]

const reasons = {
  requiredMissing: 'required-directory-missing',
  requiredInvalid: 'required-directory-invalid',
  optionalInvalid: 'optional-directory-invalid',
  phpOutside: 'php-outside-public-or-src',
  javascriptOutside: 'javascript-outside-public-assets-js',
  cssOutside: 'css-outside-public-assets-css',
  htmlOutside: 'html-outside-public',
  sqlOutside: 'sql-outside-database',
}

const supportedReasons = new Set(Object.values(reasons))

const placementRules = new Map([
  ['.php', { prefixes: [['public'], ['src']], reason: reasons.phpOutside }],
  ['.js', { prefixes: [['public', 'assets', 'js']], reason: reasons.javascriptOutside }],
  ['.css', { prefixes: [['public', 'assets', 'css']], reason: reasons.cssOutside }],
  ['.html', { prefixes: [['public']], reason: reasons.htmlOutside }],
  ['.sql', { prefixes: [['database']], reason: reasons.sqlOutside }],
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

function inspectStructurePath(projectRoot, projectPath) {
  try {
    return lstatSync(join(projectRoot, ...projectPath.split('/')), {
      throwIfNoEntry: false,
    })
  } catch (error) {
    throw new Error(
      `não foi possível inspecionar estrutura traditional-web: ${projectPath}`,
      { cause: error },
    )
  }
}

function assertRealDirectory(projectRoot, projectPath) {
  const stats = inspectStructurePath(projectRoot, projectPath)
  if (stats !== undefined && !stats.isDirectory()) {
    throw new Error(`estrutura traditional-web requer diretório real: ${projectPath}`)
  }
  return stats
}

function comparableSegment(segment) {
  return process.platform === 'win32' ? segment.toLowerCase() : segment
}

function isBelowPrefix(projectPath, prefix) {
  const segments = projectPath.split('/').map(comparableSegment)
  const comparablePrefix = prefix.map(comparableSegment)
  return segments.length > comparablePrefix.length
    && comparablePrefix.every((segment, index) => segments[index] === segment)
}

function placementIssue(projectPath) {
  const name = projectPath.split('/').at(-1)
  const dot = name.lastIndexOf('.')
  const extension = dot === -1 ? '' : name.slice(dot).toLowerCase()
  const rule = placementRules.get(extension)
  if (rule === undefined || rule.prefixes.some((prefix) => isBelowPrefix(projectPath, prefix))) {
    return null
  }
  return { path: projectPath, reason: rule.reason }
}

export function listTraditionalWebRequiredDirectories() {
  return [...requiredDirectories]
}

export function validateTraditionalWebStructureIssue(issue) {
  if (!isObject(issue)) {
    throw new Error('issue structural traditional-web deve ser um objeto')
  }
  if (!isValidIssuePath(issue.path)) {
    throw new Error('path do issue structural traditional-web é inválido')
  }
  if (!supportedReasons.has(issue.reason)) {
    throw new Error('reason do issue structural traditional-web não é suportado')
  }
  return issue
}

export function preflightTraditionalWebProjectStructure(context) {
  const projectRoot = validateProjectRoot(context?.projectRoot)
  for (const projectPath of requiredDirectories) {
    assertRealDirectory(projectRoot, projectPath)
  }
}

export function ensureTraditionalWebProjectStructure(context) {
  const projectRoot = validateProjectRoot(context?.projectRoot)
  preflightTraditionalWebProjectStructure(context)

  for (const projectPath of requiredDirectories) {
    if (assertRealDirectory(projectRoot, projectPath) !== undefined) continue
    let targetPath
    try {
      targetPath = resolveProjectPathForCreate(context, projectPath)
      mkdirSync(targetPath)
    } catch (error) {
      throw new Error(
        `não foi possível criar diretório traditional-web: ${projectPath}`,
        { cause: error },
      )
    }
  }
}

export function evaluateTraditionalWebProjectStructure(context) {
  const projectRoot = validateProjectRoot(context?.projectRoot)
  const issues = []

  for (const projectPath of requiredDirectories) {
    const stats = inspectStructurePath(projectRoot, projectPath)
    if (stats === undefined) {
      issues.push({ path: projectPath, reason: reasons.requiredMissing })
    } else if (!stats.isDirectory()) {
      issues.push({ path: projectPath, reason: reasons.requiredInvalid })
    }
  }

  const databaseStats = inspectStructurePath(projectRoot, 'database')
  if (databaseStats !== undefined && !databaseStats.isDirectory()) {
    issues.push({ path: 'database', reason: reasons.optionalInvalid })
  }

  for (const entry of discoverTraditionalWebProjectEntries(context)) {
    if (entry.kind !== 'file') continue
    const issue = placementIssue(entry.path)
    if (issue !== null) issues.push(issue)
  }

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
  for (const issue of uniqueIssues) validateTraditionalWebStructureIssue(issue)
  return uniqueIssues
}
