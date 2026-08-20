import { existsSync, statSync } from 'node:fs'
import { isAbsolute, normalize } from 'node:path'

export function validateProjectRoot(projectRoot) {
  if (projectRoot === undefined) {
    throw new Error('projectRoot é obrigatório')
  }

  if (typeof projectRoot !== 'string') {
    throw new Error('projectRoot deve ser uma string')
  }

  const trimmedProjectRoot = projectRoot.trim()

  if (trimmedProjectRoot === '') {
    throw new Error('projectRoot não pode ser vazio')
  }

  if (!isAbsolute(trimmedProjectRoot)) {
    throw new Error('projectRoot deve ser um caminho absoluto')
  }

  const normalizedProjectRoot = normalize(trimmedProjectRoot)

  if (!existsSync(normalizedProjectRoot)) {
    throw new Error('projectRoot não existe')
  }

  if (!statSync(normalizedProjectRoot).isDirectory()) {
    throw new Error('projectRoot não é um diretório')
  }

  return normalizedProjectRoot
}
