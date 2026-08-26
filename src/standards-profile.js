const supportedProfiles = new Map([
  ['traditional-web', new Set([
    'traditional-web-v1', 'traditional-web-v2', 'traditional-web-v3',
  ])],
])

const initialProfiles = new Map([
  ['traditional-web', 'traditional-web-v3'],
])

const legacyProfiles = new Map([
  ['traditional-web', 'traditional-web-v1'],
])

const upgradeTransitions = new Map([
  ['traditional-web', new Map([
    ['traditional-web-v1', new Set(['traditional-web-v2'])],
    ['traditional-web-v2', new Set(['traditional-web-v3'])],
  ])],
])

export function isStandardsProfileSupported(template, standardsProfile) {
  return supportedProfiles.get(template)?.has(standardsProfile) ?? false
}

export function isStandardsProfileUpgradeSupported(template, fromProfile, toProfile) {
  return upgradeTransitions.get(template)?.get(fromProfile)?.has(toProfile) ?? false
}

export function resolveInitialStandardsProfile(template) {
  const standardsProfile = initialProfiles.get(template)
  if (standardsProfile === undefined) {
    throw new Error('template não possui standardsProfile inicial registrado')
  }
  return standardsProfile
}

export function resolveLegacyStandardsProfile(template) {
  const standardsProfile = legacyProfiles.get(template)
  if (standardsProfile === undefined) {
    throw new Error('template não possui standardsProfile legacy registrado')
  }
  return standardsProfile
}

export function resolveConfiguredStandardsProfile(config) {
  if (!Object.hasOwn(config, 'standardsProfile')) {
    return resolveLegacyStandardsProfile(config.template)
  }
  if (!isStandardsProfileSupported(config.template, config.standardsProfile)) {
    throw new Error('standardsProfile configurado não é suportado para o template')
  }
  return config.standardsProfile
}
