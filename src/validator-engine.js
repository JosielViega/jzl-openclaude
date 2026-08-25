import { spawnSync } from 'node:child_process'
import { isAbsolute } from 'node:path'

import { validateProjectRoot } from './project-root.js'
import { runMissionAcceptanceCriterion } from './acceptance-criterion-validator.js'
import {
  isMissionAcceptanceCriterionType,
  validateMissionAcceptanceCriterion,
} from './mission-acceptance-criterion.js'

function validateValidatorDefinition(validator) {
  if (validator === null || typeof validator !== 'object' || Array.isArray(validator)) {
    throw new Error('validator deve ser um objeto')
  }

  if (validator.id === undefined) {
    throw new Error('id do validator é obrigatório')
  }

  if (typeof validator.id !== 'string') {
    throw new Error('id do validator deve ser uma string')
  }

  if (validator.id.trim() === '') {
    throw new Error('id do validator não pode ser vazio')
  }

  if (validator.type === undefined) {
    throw new Error('type do validator é obrigatório')
  }

  if (typeof validator.type !== 'string') {
    throw new Error('type do validator deve ser uma string')
  }

  if (validator.type !== 'command') {
    if (!isMissionAcceptanceCriterionType(validator.type)) {
      throw new Error('type do validator não é suportado')
    }

    validateMissionAcceptanceCriterion(validator)
    return
  }

  if (validator.executable === undefined) {
    throw new Error('executable do validator é obrigatório')
  }

  if (typeof validator.executable !== 'string') {
    throw new Error('executable do validator deve ser uma string')
  }

  if (validator.executable.trim() === '') {
    throw new Error('executable do validator não pode ser vazio')
  }

  if (!isAbsolute(validator.executable)) {
    throw new Error('executable do validator deve ser um caminho absoluto')
  }

  if (validator.args === undefined) {
    throw new Error('args do validator é obrigatório')
  }

  if (!Array.isArray(validator.args)) {
    throw new Error('args do validator deve ser um array')
  }

  if (!validator.args.every((argument) => typeof argument === 'string')) {
    throw new Error('args do validator deve conter somente strings')
  }
}

function validateValidators(validators) {
  if (!Array.isArray(validators)) {
    throw new Error('validators deve ser um array')
  }

  if (validators.length === 0) {
    throw new Error('ao menos um validator é obrigatório')
  }

  const ids = new Set()

  for (const validator of validators) {
    validateValidatorDefinition(validator)

    if (ids.has(validator.id)) {
      throw new Error('ids dos validators não podem ser duplicados')
    }

    ids.add(validator.id)
  }
}

function normalizeOutput(output) {
  return typeof output === 'string' ? output : ''
}

function createErrorResult(validator, result, errorMessage) {
  return {
    id: validator.id,
    status: 'ERROR',
    evidence: {
      exitCode: Number.isInteger(result?.status) ? result.status : null,
      signal: typeof result?.signal === 'string' ? result.signal : null,
      stdout: normalizeOutput(result?.stdout),
      stderr: normalizeOutput(result?.stderr),
      errorMessage,
    },
  }
}

function runValidator(projectRoot, validator) {
  let result

  try {
    result = spawnSync(validator.executable, validator.args, {
      cwd: projectRoot,
      shell: false,
      encoding: 'utf8',
      windowsHide: true,
    })
  } catch (error) {
    return createErrorResult(
      validator,
      undefined,
      error instanceof Error ? error.message : String(error),
    )
  }

  if (result.error !== undefined) {
    return createErrorResult(validator, result, result.error.message)
  }

  if (result.signal !== null) {
    return createErrorResult(
      validator,
      result,
      `validator encerrado por sinal: ${result.signal}`,
    )
  }

  if (!Number.isInteger(result.status)) {
    return createErrorResult(
      validator,
      result,
      'validator não retornou exit code confiável',
    )
  }

  return {
    id: validator.id,
    status: result.status === 0 ? 'PASS' : 'FAIL',
    evidence: {
      exitCode: result.status,
      signal: null,
      stdout: normalizeOutput(result.stdout),
      stderr: normalizeOutput(result.stderr),
      errorMessage: null,
    },
  }
}

export function runProjectValidators(context, validators) {
  const projectRoot = validateProjectRoot(context?.projectRoot)

  validateValidators(validators)

  const results = validators.map((validator) => (
    validator.type === 'command'
      ? runValidator(projectRoot, validator)
      : runMissionAcceptanceCriterion(context, validator)
  ))
  let status = 'PASS'

  if (results.some((result) => result.status === 'ERROR')) {
    status = 'ERROR'
  } else if (results.some((result) => result.status === 'FAIL')) {
    status = 'FAIL'
  }

  return { status, results }
}
