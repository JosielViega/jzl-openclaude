import { validateExecutionChangeSet } from './execution-change-set.js'
import {
  isMissionChangeScopePathAllowed,
  validateMissionChangeScope,
} from './mission-change-scope.js'

const validatorId = 'mission-change-scope'

function validateChangeSet(changeSet) {
  if (changeSet !== null) validateExecutionChangeSet(changeSet)
}

export function createMissionChangeScopeValidator(changeScope, changeSet) {
  validateMissionChangeScope(changeScope)
  validateChangeSet(changeSet)

  return {
    id: validatorId,
    type: validatorId,
    scope: structuredClone(changeScope),
    changeSet: changeSet === null ? null : structuredClone(changeSet),
  }
}

export function validateMissionChangeScopeValidator(validator) {
  if (validator === null || typeof validator !== 'object' || Array.isArray(validator)) {
    throw new Error('validator de Change Scope deve ser um objeto')
  }

  if (validator.id !== validatorId || validator.type !== validatorId) {
    throw new Error('validator de Change Scope é inválido')
  }

  validateMissionChangeScope(validator.scope)
  validateChangeSet(validator.changeSet)
  return validator
}

function evidence(errorMessage, violations = []) {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage,
    scopeType: 'allowed-paths',
    violations,
  }
}

export function runMissionChangeScopeValidator(validator) {
  validateMissionChangeScopeValidator(validator)

  if (validator.changeSet === null) {
    return {
      id: validatorId,
      status: 'ERROR',
      evidence: evidence(
        'Change Set da execução não está disponível para validar o Change Scope',
      ),
    }
  }

  const violations = [...new Set([
    ...validator.changeSet.created,
    ...validator.changeSet.modified,
    ...validator.changeSet.deleted,
  ].filter(path => !isMissionChangeScopePathAllowed(validator.scope, path)))]
    .sort()

  return {
    id: validatorId,
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    evidence: evidence(null, violations),
  }
}
