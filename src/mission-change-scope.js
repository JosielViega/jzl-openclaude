const maximumAllowedPaths = 50
const maximumPathLength = 500
const protectedDirectories = new Set(['.jzl', '.git', '.openclaude'])

function normalizeForComparison(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function validateAllowedPath(projectPath) {
  if (typeof projectPath !== 'string' || projectPath === '') {
    throw new Error('allowedPath do Change Scope deve ser relativo e normalizado')
  }

  if (projectPath.length > maximumPathLength) {
    throw new Error('allowedPath do Change Scope excede o limite permitido')
  }

  if (/[*?[\]]/.test(projectPath)) {
    throw new Error('allowedPath do Change Scope não pode conter glob')
  }

  if (
    projectPath.includes('\\')
    || projectPath.startsWith('/')
    || projectPath.endsWith('/')
    || /^[A-Za-z]:/.test(projectPath)
    || /^\\\\/.test(projectPath)
    || /[\r\n\0]/.test(projectPath)
    || projectPath.split('/').some(
      segment => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('allowedPath do Change Scope deve ser relativo e normalizado')
  }

  const segments = projectPath.split('/')
  const first = normalizeForComparison(segments[0])

  if (
    protectedDirectories.has(first)
    || (segments.length === 1 && first === normalizeForComparison('AGENTS.md'))
  ) {
    throw new Error('allowedPath do Change Scope é protegido')
  }
}

export function validateMissionChangeScope(changeScope) {
  if (
    changeScope === null
    || typeof changeScope !== 'object'
    || Array.isArray(changeScope)
  ) {
    throw new Error('Change Scope da Mission deve ser um objeto')
  }

  if (!Array.isArray(changeScope.allowedPaths)) {
    throw new Error('allowedPaths do Change Scope deve ser um array')
  }

  if (changeScope.allowedPaths.length > maximumAllowedPaths) {
    throw new Error('Change Scope pode possuir no máximo 50 allowedPaths')
  }

  const paths = new Set()

  for (const projectPath of changeScope.allowedPaths) {
    validateAllowedPath(projectPath)
    const comparablePath = normalizeForComparison(projectPath)

    if (paths.has(comparablePath)) {
      throw new Error('allowedPaths do Change Scope não podem ser duplicados')
    }

    paths.add(comparablePath)
  }

  return changeScope
}

export function createMissionChangeScope(input) {
  if (input === undefined) {
    return undefined
  }

  validateMissionChangeScope(input)
  return { allowedPaths: [...input.allowedPaths] }
}

export function isMissionChangeScopePathAllowed(changeScope, projectPath) {
  validateMissionChangeScope(changeScope)
  if (typeof projectPath !== 'string') {
    return false
  }
  const comparablePath = normalizeForComparison(projectPath)

  return changeScope.allowedPaths.some(
    allowedPath => normalizeForComparison(allowedPath) === comparablePath,
  )
}
