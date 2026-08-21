import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { validateProjectRoot } from './project-root.js'

function isPathInsideOrEqual(rootPath, targetPath) {
  const relativePath = relative(rootPath, targetPath)

  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath)
  )
}

export function toProjectPath(context, absolutePath) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('contexto de projeto deve ser um objeto')
  }

  const projectRoot = validateProjectRoot(context.projectRoot)

  if (absolutePath === undefined) {
    throw new Error('caminho absoluto é obrigatório')
  }

  if (typeof absolutePath !== 'string') {
    throw new Error('caminho absoluto deve ser uma string')
  }

  const trimmedAbsolutePath = absolutePath.trim()

  if (trimmedAbsolutePath === '') {
    throw new Error('caminho absoluto não pode ser vazio')
  }

  if (!isAbsolute(trimmedAbsolutePath)) {
    throw new Error('caminho deve ser absoluto')
  }

  const canonicalProjectRoot = realpathSync.native(projectRoot)
  let relativePath

  if (isPathInsideOrEqual(projectRoot, trimmedAbsolutePath)) {
    relativePath = relative(projectRoot, trimmedAbsolutePath)
  } else if (isPathInsideOrEqual(canonicalProjectRoot, trimmedAbsolutePath)) {
    relativePath = relative(canonicalProjectRoot, trimmedAbsolutePath)
  } else {
    throw new Error('caminho absoluto está fora do projectRoot')
  }

  return relativePath === '' ? '.' : relativePath
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

export function resolveProjectPathForCreate(context, projectPath) {
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

  if (lstatSync(resolvedPath, { throwIfNoEntry: false }) !== undefined) {
    throw new Error('projectPath já existe')
  }

  let existingAncestor = dirname(resolvedPath)
  let existingAncestorStats

  while (isPathInsideOrEqual(projectRoot, existingAncestor)) {
    existingAncestorStats = lstatSync(existingAncestor, {
      throwIfNoEntry: false,
    })

    if (existingAncestorStats !== undefined) {
      break
    }

    if (existingAncestor === projectRoot) {
      break
    }

    existingAncestor = dirname(existingAncestor)
  }

  if (existingAncestorStats === undefined) {
    throw new Error(
      'não foi possível localizar ancestral existente dentro do projectRoot',
    )
  }

  const canonicalProjectRoot = realpathSync.native(projectRoot)
  let canonicalExistingAncestor

  try {
    canonicalExistingAncestor = realpathSync.native(existingAncestor)
  } catch {
    throw new Error('ancestral existente de projectPath não pode ser resolvido')
  }

  if (!isPathInsideOrEqual(canonicalProjectRoot, canonicalExistingAncestor)) {
    throw new Error('projectPath resolve para fora do projectRoot')
  }

  if (!statSync(canonicalExistingAncestor).isDirectory()) {
    throw new Error('ancestral existente de projectPath não é um diretório')
  }

  const unresolvedSuffix = relative(existingAncestor, resolvedPath)

  return resolve(canonicalExistingAncestor, unresolvedSuffix)
}
