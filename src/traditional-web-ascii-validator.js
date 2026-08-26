import { discoverTraditionalWebProjectEntries } from './traditional-web-project-discovery.js'

const VALIDATOR_ID = 'traditional-web:ascii-paths'
const VALIDATOR_TYPE = 'traditional-web-ascii-paths'

function evidence(overrides = {}) {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage: null,
    standardType: 'ascii-paths',
    violations: [],
    ...overrides,
  }
}

function limitViolationPath(path) {
  let limited = path.slice(0, 500)
  while (limited.endsWith('/')) limited = limited.slice(0, -1)
  return limited
}

export function validateTraditionalWebAsciiPathsValidator(validator) {
  if (validator === null || typeof validator !== 'object' || Array.isArray(validator)) {
    throw new Error('validator de paths ASCII deve ser um objeto')
  }
  if (validator.id !== VALIDATOR_ID || validator.type !== VALIDATOR_TYPE) {
    throw new Error('validator de paths ASCII não é suportado')
  }
  return validator
}

export function runTraditionalWebAsciiPathsValidator(context, validator) {
  validateTraditionalWebAsciiPathsValidator(validator)

  try {
    const violations = discoverTraditionalWebProjectEntries(context)
      .map((entry) => entry.path)
      .filter((path) => (
        [...path].some((character) => character.codePointAt(0) > 0x7f)
      ))
      .map(limitViolationPath)
    const normalizedViolations = [...new Set(violations)].sort()

    return {
      id: validator.id,
      status: normalizedViolations.length === 0 ? 'PASS' : 'FAIL',
      evidence: evidence({ violations: normalizedViolations }),
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
