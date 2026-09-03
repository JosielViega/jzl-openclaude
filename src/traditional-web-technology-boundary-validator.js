import {
  evaluateTraditionalWebTechnologyBoundary,
} from './traditional-web-technology-boundary.js'

const VALIDATOR_ID = 'traditional-web:technology-boundary'
const VALIDATOR_TYPE = 'traditional-web-technology-boundary'

function evidence(overrides = {}) {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage: null,
    standardType: 'technology-boundary',
    issues: [],
    ...overrides,
  }
}

export function validateTraditionalWebTechnologyBoundaryValidator(validator) {
  if (validator === null || typeof validator !== 'object' || Array.isArray(validator)) {
    throw new Error('validator de technology boundary traditional-web deve ser um objeto')
  }
  if (validator.id !== VALIDATOR_ID || validator.type !== VALIDATOR_TYPE) {
    throw new Error('validator de technology boundary traditional-web não é suportado')
  }
  return validator
}

export function runTraditionalWebTechnologyBoundaryValidator(context, validator) {
  validateTraditionalWebTechnologyBoundaryValidator(validator)
  try {
    const issues = evaluateTraditionalWebTechnologyBoundary(context)
    return {
      id: validator.id,
      status: issues.length === 0 ? 'PASS' : 'FAIL',
      evidence: evidence({ issues }),
    }
  } catch (error) {
    return {
      id: validator.id,
      status: 'ERROR',
      evidence: evidence({
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    }
  }
}
