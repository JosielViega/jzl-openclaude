import {
  readProjectConfigStore,
  writeProjectConfigStore,
} from './project-config-store.js'
import {
  isStandardsProfileUpgradeSupported,
  resolveConfiguredStandardsProfile,
} from './standards-profile.js'
import { resolveProjectValidatorsForProfile } from './standards-resolver.js'
import { runProjectValidators } from './validator-engine.js'

function validateInput(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('upgrade de standards deve ser um objeto')
  }
  if (!Object.hasOwn(input, 'to')) {
    throw new Error('to do upgrade de standards é obrigatório')
  }
  if (typeof input.to !== 'string' || input.to.trim() === '') {
    throw new Error('to do upgrade de standards deve ser uma string não vazia')
  }
  if (Object.hasOwn(input, 'dryRun') && typeof input.dryRun !== 'boolean') {
    throw new Error('dryRun do upgrade de standards deve ser boolean')
  }
}

export function upgradeProjectStandards(context, input) {
  validateInput(input)
  const config = readProjectConfigStore(context)
  const from = resolveConfiguredStandardsProfile(config)

  if (!isStandardsProfileUpgradeSupported(config.template, from, input.to)) {
    throw new Error('transição de standardsProfile não é suportada')
  }

  const targetValidators = resolveProjectValidatorsForProfile(context, input.to)
  const validation = runProjectValidators(context, targetValidators)
  const result = {
    from,
    to: input.to,
    status: validation.status,
    upgraded: false,
    results: validation.results,
  }

  if (validation.status !== 'PASS' || input.dryRun === true) {
    return result
  }

  const updatedConfig = structuredClone(config)
  updatedConfig.standardsProfile = input.to
  writeProjectConfigStore(context, updatedConfig)

  return { ...result, upgraded: true }
}
