import {
  evaluateTraditionalWebPublicExposure,
} from './traditional-web-public-exposure.js'

const VALIDATOR_ID = 'traditional-web:public-exposure'
const VALIDATOR_TYPE = 'traditional-web-public-exposure'

function evidence(overrides = {}) {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage: null,
    standardType: 'public-exposure',
    issues: [],
    ...overrides,
  }
}

export function validateTraditionalWebPublicExposureValidator(validator) {
  if (validator === null || typeof validator !== 'object' || Array.isArray(validator)) {
    throw new Error('validator de public exposure traditional-web deve ser um objeto')
  }
  if (validator.id !== VALIDATOR_ID || validator.type !== VALIDATOR_TYPE) {
    throw new Error('validator de public exposure traditional-web não é suportado')
  }
  return validator
}

export function runTraditionalWebPublicExposureValidator(context, validator) {
  validateTraditionalWebPublicExposureValidator(validator)
  try {
    const issues = evaluateTraditionalWebPublicExposure(context)
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
