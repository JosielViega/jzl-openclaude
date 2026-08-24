const definitions = Object.freeze({
  'mission-execution': Object.freeze({
    responsibility: 'mission-execution',
    sessionMode: 'fresh',
    toolAccess: 'read-write',
    queryTimeoutMs: 600000,
    watchdogGraceMs: 5000,
    requiresModelRoute: true,
  }),
  'mission-review': Object.freeze({
    responsibility: 'mission-review',
    sessionMode: 'fresh',
    toolAccess: 'read-only',
    queryTimeoutMs: 300000,
    watchdogGraceMs: 5000,
    requiresModelRoute: true,
  }),
  'mission-planning': Object.freeze({
    responsibility: 'mission-planning',
    sessionMode: 'fresh',
    toolAccess: 'read-only',
    queryTimeoutMs: 300000,
    watchdogGraceMs: 5000,
    requiresModelRoute: true,
  }),
})

export function isRegisteredResponsibility(value) {
  return typeof value === 'string'
    && Object.hasOwn(definitions, value)
}

export function resolveResponsibilityDefinition(responsibility) {
  if (!isRegisteredResponsibility(responsibility)) {
    throw new Error('responsabilidade JZL não é suportada')
  }

  return { ...definitions[responsibility] }
}

export function listRegisteredResponsibilities() {
  return Object.keys(definitions)
}
