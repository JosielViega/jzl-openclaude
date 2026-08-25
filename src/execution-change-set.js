import { validateProjectFilesystemSnapshot } from './project-filesystem-snapshot.js'

const categories = ['created', 'modified', 'deleted']
const controlDirectories = new Set(['.jzl', '.git', '.openclaude'])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedControlName(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function validateChangeSetPath(projectPath) {
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
    throw new Error('path do Change Set não é relativo e normalizado')
  }

  if (projectPath.length > 500) {
    throw new Error('path do Change Set excede o limite permitido')
  }

  if (controlDirectories.has(normalizedControlName(projectPath.split('/')[0]))) {
    throw new Error('path do Change Set pertence a namespace de controle')
  }
}

export function validateExecutionChangeSet(changeSet) {
  if (!isObject(changeSet)) {
    throw new Error('Change Set deve ser um objeto')
  }

  const allPaths = new Set()

  for (const category of categories) {
    const paths = changeSet[category]

    if (!Array.isArray(paths)) {
      throw new Error(`${category} do Change Set deve ser um array`)
    }

    let previousPath = null

    for (const projectPath of paths) {
      validateChangeSetPath(projectPath)

      if (previousPath !== null && comparePaths(previousPath, projectPath) >= 0) {
        throw new Error(`${category} do Change Set deve possuir paths únicos e ordenados`)
      }

      if (allPaths.has(projectPath)) {
        throw new Error('path do Change Set aparece em múltiplas categorias')
      }

      allPaths.add(projectPath)
      previousPath = projectPath
    }
  }

  return changeSet
}

export function createExecutionChangeSet(beforeSnapshot, afterSnapshot) {
  validateProjectFilesystemSnapshot(beforeSnapshot)
  validateProjectFilesystemSnapshot(afterSnapshot)

  const beforeEntries = new Map(
    beforeSnapshot.entries.map((entry) => [entry.path, entry]),
  )
  const afterEntries = new Map(
    afterSnapshot.entries.map((entry) => [entry.path, entry]),
  )
  const changeSet = { created: [], modified: [], deleted: [] }
  const projectPaths = [...new Set([
    ...beforeEntries.keys(),
    ...afterEntries.keys(),
  ])].sort(comparePaths)

  for (const projectPath of projectPaths) {
    const before = beforeEntries.get(projectPath)
    const after = afterEntries.get(projectPath)

    if (before === undefined) {
      changeSet.created.push(projectPath)
    } else if (after === undefined) {
      changeSet.deleted.push(projectPath)
    } else if (before.kind !== after.kind || before.digest !== after.digest) {
      changeSet.modified.push(projectPath)
    }
  }

  return validateExecutionChangeSet(changeSet)
}
