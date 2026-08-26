const supportedProfiles = new Map([
  ['traditional-web', new Set(['traditional-web-v1'])],
])

const initialProfiles = new Map([
  ['traditional-web', 'traditional-web-v1'],
])

const legacyProfiles = new Map([
  ['traditional-web', 'traditional-web-v1'],
])

export function isStandardsProfileSupported(template, standardsProfile) {
  return supportedProfiles.get(template)?.has(standardsProfile) ?? false
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
