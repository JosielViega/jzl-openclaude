import {
  evaluateTraditionalWebProjectStructure,
} from './traditional-web-structure.js'

const VALIDATOR_ID = 'traditional-web:structure'
const VALIDATOR_TYPE = 'traditional-web-structure'

function evidence(overrides = {}) {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage: null,
    standardType: 'structure',
    issues: [],
    ...overrides,
  }
}

export function validateTraditionalWebStructureValidator(validator) {
  if (validator === null || typeof validator !== 'object' || Array.isArray(validator)) {
    throw new Error('validator de estrutura traditional-web deve ser um objeto')
  }
  if (validator.id !== VALIDATOR_ID || validator.type !== VALIDATOR_TYPE) {
    throw new Error('validator de estrutura traditional-web não é suportado')
  }
  return validator
}

export function runTraditionalWebStructureValidator(context, validator) {
  validateTraditionalWebStructureValidator(validator)
  try {
    const issues = evaluateTraditionalWebProjectStructure(context)
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
