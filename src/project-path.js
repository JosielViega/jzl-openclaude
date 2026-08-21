import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { validateProjectRoot } from './project-root.js'

function isPathInsideOrEqual(rootPath, targetPath) {
  const relativePath = relative(rootPath, targetPath)

  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath)
  )
}

export function resolveExistingProjectPath(context, projectPath) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('contexto de projeto deve ser um objeto')
  }

  const projectRoot = validateProjectRoot(context.projectRoot)

  if (projectPath === undefined) {
    throw new Error('projectPath é obrigatório')
  }

  if (typeof projectPath !== 'string') {
    throw new Error('projectPath deve ser uma string')
  }

  if (projectPath.trim() === '') {
    throw new Error('projectPath não pode ser vazio')
  }

  if (isAbsolute(projectPath)) {
    throw new Error('projectPath deve ser relativo ao projectRoot')
  }

  const resolvedPath = resolve(projectRoot, projectPath)

  if (!isPathInsideOrEqual(projectRoot, resolvedPath)) {
    throw new Error('projectPath escapa do projectRoot')
  }

  if (!existsSync(resolvedPath)) {
    throw new Error('projectPath não existe')
  }

  const canonicalProjectRoot = realpathSync.native(projectRoot)
  const canonicalTarget = realpathSync.native(resolvedPath)

  if (!isPathInsideOrEqual(canonicalProjectRoot, canonicalTarget)) {
    throw new Error('projectPath resolve para fora do projectRoot')
  }

  return canonicalTarget
}
