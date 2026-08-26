import { evaluateTraditionalWebSourceText } from './traditional-web-source-text.js'

const VALIDATOR_ID = 'traditional-web:source-text'
const VALIDATOR_TYPE = 'traditional-web-source-text'

function evidence(overrides = {}) {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage: null,
    standardType: 'source-text',
    issues: [],
    ...overrides,
  }
}

export function validateTraditionalWebSourceTextValidator(validator) {
  if (validator === null || typeof validator !== 'object' || Array.isArray(validator)) {
    throw new Error('validator de source text traditional-web deve ser um objeto')
  }
  if (validator.id !== VALIDATOR_ID || validator.type !== VALIDATOR_TYPE) {
    throw new Error('validator de source text traditional-web não é suportado')
  }
  return validator
}

export function runTraditionalWebSourceTextValidator(context, validator) {
  validateTraditionalWebSourceTextValidator(validator)
  try {
    const issues = evaluateTraditionalWebSourceText(context)
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
