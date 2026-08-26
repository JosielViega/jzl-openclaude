import { resolveProjectStandards, resolveProjectValidators } from './standards-resolver.js'
import { runProjectValidators } from './validator-engine.js'

export function checkProjectStandards(context) {
  const standards = resolveProjectStandards(context)
  const validation = runProjectValidators(context, resolveProjectValidators(context))

  return {
    standard: standards.id,
    status: validation.status,
    results: validation.results,
  }
}
