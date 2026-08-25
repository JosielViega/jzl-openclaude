import { statSync } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'

import { createProjectContext } from './project-context.js'
import {
  resolveExistingProjectPath,
  resolveProjectPathForCreate,
  toProjectPath,
} from './project-path.js'
import {
  isRegisteredResponsibility,
  resolveResponsibilityDefinition,
} from './responsibility-registry.js'
import {
  isMissionChangeScopePathAllowed,
  validateMissionChangeScope,
} from './mission-change-scope.js'

const allowedToolsByAccess = new Map([
  ['read-write', new Set(['Read', 'Glob', 'Grep', 'Write', 'Edit'])],
  ['read-only', new Set(['Read', 'Glob', 'Grep'])],
])
const protectedDirectoryNames = new Set(['.jzl', '.git', '.openclaude'])

function deny(message) {
  return {
    behavior: 'deny',
    message,
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeProtectedName(name) {
  return process.platform === 'win32' ? name.toLowerCase() : name
}

function isPathInsideOrEqual(rootPath, targetPath) {
  const relativePath = relative(rootPath, targetPath)

  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath)
  )
}

function isLexicallyProtected(projectPath) {
  const segments = projectPath.split(/[\\/]+/).filter(Boolean)

  if (segments.length === 0) {
    return false
  }

  const firstSegment = normalizeProtectedName(segments[0])
  const protectedDirectories = new Set(
    [...protectedDirectoryNames].map(normalizeProtectedName),
  )

  return protectedDirectories.has(firstSegment) || (
    segments.length === 1
    && firstSegment === normalizeProtectedName('AGENTS.md')
  )
}

function hasUnsafeGlobPath(pattern) {
  return isAbsolute(pattern) || pattern.split(/[\\/]+/).includes('..')
}

function collectCanonicalProtectedPaths(context) {
  const paths = []

  for (const projectPath of ['.jzl', '.git', '.openclaude', 'AGENTS.md']) {
    try {
      paths.push({
        path: resolveExistingProjectPath(context, projectPath),
        directory: projectPath !== 'AGENTS.md',
      })
    } catch {
      // Áreas ainda inexistentes continuam protegidas lexicalmente.
    }
  }

  return paths
}

function isCanonicallyProtected(targetPath, protectedPaths) {
  return protectedPaths.some(({ path, directory }) => (
    directory
      ? isPathInsideOrEqual(path, targetPath)
      : relative(path, targetPath) === ''
  ))
}

function resolveAbsoluteExistingFile(context, absolutePath) {
  const projectPath = toProjectPath(context, absolutePath)
  const targetPath = resolveExistingProjectPath(context, projectPath)

  if (!statSync(targetPath).isFile()) {
    throw new Error('target não é arquivo')
  }

  return { projectPath, targetPath }
}

function assertWritableFileHasSingleLink(targetPath) {
  if (statSync(targetPath).nlink > 1) {
    throw new Error('arquivo possui múltiplos hard links')
  }
}

function resolveWritableFile(context, absolutePath) {
  const projectPath = toProjectPath(context, absolutePath)

  if (isLexicallyProtected(projectPath)) {
    throw new Error('path protegido')
  }

  try {
    const targetPath = resolveExistingProjectPath(context, projectPath)

    if (!statSync(targetPath).isFile()) {
      throw new Error('target não é arquivo')
    }

    assertWritableFileHasSingleLink(targetPath)

    return targetPath
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'projectPath não existe') {
      throw error
    }

    return resolveProjectPathForCreate(context, projectPath)
  }
}

function resolveSearchBase(context, path, requireDirectory) {
  let projectPath = '.'

  if (path !== undefined) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new Error('path inválido')
    }

    projectPath = isAbsolute(path) ? toProjectPath(context, path) : path
  }

  const targetPath = resolveExistingProjectPath(context, projectPath)

  if (requireDirectory && !statSync(targetPath).isDirectory()) {
    throw new Error('base não é diretório')
  }

  return targetPath
}

export function createOpenClaudeToolPolicy(projectRoot, responsibility, changeScope) {
  if (!isRegisteredResponsibility(responsibility)) {
    throw new Error('responsabilidade OpenClaude não é suportada')
  }

  const definition = resolveResponsibilityDefinition(responsibility)
  const allowedTools = allowedToolsByAccess.get(definition.toolAccess)

  if (allowedTools === undefined) {
    throw new Error('perfil de ferramentas OpenClaude não é suportado')
  }

  if (changeScope !== undefined) {
    if (responsibility !== 'mission-execution') {
      throw new Error('Change Scope OpenClaude só é suportado para mission-execution')
    }
    validateMissionChangeScope(changeScope)
  }

  const context = createProjectContext(projectRoot)
  const protectedPaths = collectCanonicalProtectedPaths(context)

  return async function canUseTool(name, input) {
    if (!allowedTools.has(name)) {
      return deny('O JZL não autorizou esta ferramenta')
    }

    if (!isObject(input)) {
      return deny('O JZL rejeitou uma chamada de ferramenta inválida')
    }

    try {
      if (name === 'Read') {
        if (typeof input.file_path !== 'string' || !isAbsolute(input.file_path)) {
          throw new Error('file_path inválido')
        }

        resolveAbsoluteExistingFile(context, input.file_path)
        return { behavior: 'allow' }
      }

      if (name === 'Write') {
        if (
          typeof input.file_path !== 'string'
          || !isAbsolute(input.file_path)
          || typeof input.content !== 'string'
        ) {
          throw new Error('Write inválido')
        }

        const targetPath = resolveWritableFile(context, input.file_path)

        if (isCanonicallyProtected(targetPath, protectedPaths)) {
          throw new Error('path protegido')
        }

        if (
          changeScope !== undefined
          && !isMissionChangeScopePathAllowed(
            changeScope,
            toProjectPath(context, targetPath).replaceAll('\\', '/'),
          )
        ) {
          return deny('O JZL não autorizou alteração fora do Change Scope da Mission')
        }

        return { behavior: 'allow' }
      }

      if (name === 'Edit') {
        if (typeof input.file_path !== 'string' || !isAbsolute(input.file_path)) {
          throw new Error('file_path inválido')
        }

        const { projectPath, targetPath } = resolveAbsoluteExistingFile(
          context,
          input.file_path,
        )

        if (
          isLexicallyProtected(projectPath)
          || isCanonicallyProtected(targetPath, protectedPaths)
        ) {
          throw new Error('path protegido')
        }

        assertWritableFileHasSingleLink(targetPath)

        if (
          changeScope !== undefined
          && !isMissionChangeScopePathAllowed(
            changeScope,
            toProjectPath(context, targetPath).replaceAll('\\', '/'),
          )
        ) {
          return deny('O JZL não autorizou alteração fora do Change Scope da Mission')
        }

        return { behavior: 'allow' }
      }

      if (name === 'Glob') {
        if (
          typeof input.pattern !== 'string'
          || input.pattern.trim() === ''
          || hasUnsafeGlobPath(input.pattern)
        ) {
          throw new Error('pattern inválido')
        }

        resolveSearchBase(context, input.path, true)
        return { behavior: 'allow' }
      }

      if (
        typeof input.pattern !== 'string'
        || input.pattern.trim() === ''
        || (
          input.glob !== undefined
          && (
            typeof input.glob !== 'string'
            || hasUnsafeGlobPath(input.glob)
          )
        )
      ) {
        throw new Error('Grep inválido')
      }

      resolveSearchBase(context, input.path, false)
      return { behavior: 'allow' }
    } catch {
      return deny('O JZL rejeitou o caminho ou os dados desta ferramenta')
    }
  }
}
