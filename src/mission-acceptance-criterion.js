const criterionIdPattern = /^criterion-\d{4,}$/
const supportedTypes = new Set([
  'file-exists',
  'file-not-exists',
  'file-contains',
  'file-not-contains',
])
const contentTypes = new Set(['file-contains', 'file-not-contains'])
const maximumCriteria = 20

export function isMissionAcceptanceCriterionType(type) {
  return supportedTypes.has(type)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeProtectedName(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function validateCriterionPath(path) {
  if (typeof path !== 'string' || path === '') {
    throw new Error('path do acceptance criterion deve ser relativo e normalizado')
  }

  if (path.length > 500) {
    throw new Error('path do acceptance criterion excede o limite permitido')
  }

  const segments = path.split('/')

  if (
    path.includes('\\')
    || path.startsWith('/')
    || path.endsWith('/')
    || /^[A-Za-z]:/.test(path)
    || path.startsWith('//')
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('path do acceptance criterion deve ser relativo e normalizado')
  }

  const first = normalizeProtectedName(segments[0])
  const protectedDirectories = new Set(
    ['.jzl', '.git', '.openclaude'].map(normalizeProtectedName),
  )

  if (
    protectedDirectories.has(first)
    || (segments.length === 1 && first === normalizeProtectedName('AGENTS.md'))
  ) {
    throw new Error('path do acceptance criterion é protegido')
  }
}

function validateCriterionFields(criterion, requireId) {
  if (!isObject(criterion)) {
    throw new Error('acceptance criterion deve ser um objeto')
  }

  if (requireId && (
    typeof criterion.id !== 'string'
    || !criterionIdPattern.test(criterion.id)
  )) {
    throw new Error('id do acceptance criterion é inválido')
  }

  if (
    typeof criterion.type !== 'string'
    || !isMissionAcceptanceCriterionType(criterion.type)
  ) {
    throw new Error('type do acceptance criterion não é suportado')
  }

  validateCriterionPath(criterion.path)

  if (contentTypes.has(criterion.type)) {
    if (typeof criterion.text !== 'string' || criterion.text.length === 0) {
      throw new Error('text do acceptance criterion é inválido')
    }

    if (criterion.text.length > 2000) {
      throw new Error('text do acceptance criterion excede o limite permitido')
    }
  }
}

export function validateMissionAcceptanceCriterion(criterion) {
  validateCriterionFields(criterion, true)
  return criterion
}

export function validateMissionAcceptanceCriteria(criteria) {
  if (!Array.isArray(criteria)) {
    throw new Error('acceptance criteria deve ser um array')
  }

  if (criteria.length > maximumCriteria) {
    throw new Error('Mission pode possuir no máximo 20 acceptance criteria')
  }

  const ids = new Set()

  for (const criterion of criteria) {
    validateMissionAcceptanceCriterion(criterion)

    if (ids.has(criterion.id)) {
      throw new Error('ids dos acceptance criteria não podem ser duplicados')
    }

    ids.add(criterion.id)
  }

  return criteria
}

export function createMissionAcceptanceCriteria(inputs) {
  if (inputs === undefined) {
    return []
  }

  if (!Array.isArray(inputs)) {
    throw new Error('acceptance criteria deve ser um array')
  }

  if (inputs.length > maximumCriteria) {
    throw new Error('Mission pode possuir no máximo 20 acceptance criteria')
  }

  return inputs.map((input, index) => {
    if (isObject(input) && Object.hasOwn(input, 'id')) {
      throw new Error('id do novo acceptance criterion é controlado pelo JZL')
    }

    validateCriterionFields(input, false)

    const criterion = {
      id: `criterion-${String(index + 1).padStart(4, '0')}`,
      type: input.type,
      path: input.path,
    }

    if (contentTypes.has(input.type)) {
      criterion.text = input.text
    }

    return criterion
  })
}
