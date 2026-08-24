const MAX_SUMMARY_LENGTH = 4000
const MAX_STEPS = 20
const MAX_STEP_TITLE_LENGTH = 200
const MAX_STEP_DETAIL_LENGTH = 4000
const MAX_STEP_PATHS = 20
const MAX_STEP_PATH_LENGTH = 500
const MAX_RISKS = 20
const MAX_RISK_LENGTH = 2000
const MAX_VALIDATION_ITEMS = 20
const MAX_VALIDATION_ITEM_LENGTH = 2000
const TRUNCATION_MARKER = '[conteúdo truncado pelo JZL]'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function truncate(value, maximumLength) {
  if (value.length <= maximumLength) return value
  const suffix = `\n${TRUNCATION_MARKER}`
  return `${value.slice(0, maximumLength - suffix.length)}${suffix}`
}

function validateStep(step, enforceLimits) {
  if (!isObject(step)) throw new Error('step do planejamento deve ser um objeto')
  if (!isNonEmptyString(step.title) || (enforceLimits && step.title.length > MAX_STEP_TITLE_LENGTH)) {
    throw new Error('title do step do planejamento é inválido')
  }
  if (!isNonEmptyString(step.detail) || (enforceLimits && step.detail.length > MAX_STEP_DETAIL_LENGTH)) {
    throw new Error('detail do step do planejamento é inválido')
  }
  if (!Array.isArray(step.paths) || (enforceLimits && step.paths.length > MAX_STEP_PATHS)) {
    throw new Error('paths do step do planejamento deve ser um array válido')
  }
  for (const path of step.paths) {
    if (!isNonEmptyString(path) || (enforceLimits && path.length > MAX_STEP_PATH_LENGTH)) {
      throw new Error('path do step do planejamento é inválido')
    }
  }
}

function validatePlan(plan, enforceLimits) {
  if (!isObject(plan)) throw new Error('resultado do planejamento deve ser um objeto')
  if (!isNonEmptyString(plan.summary) || (enforceLimits && plan.summary.length > MAX_SUMMARY_LENGTH)) {
    throw new Error('summary do planejamento é inválido')
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0 || (enforceLimits && plan.steps.length > MAX_STEPS)) {
    throw new Error('steps do planejamento deve ser um array não vazio')
  }
  for (const step of plan.steps) validateStep(step, enforceLimits)
  if (!Array.isArray(plan.risks) || (enforceLimits && plan.risks.length > MAX_RISKS)) {
    throw new Error('risks do planejamento deve ser um array')
  }
  for (const risk of plan.risks) {
    if (!isNonEmptyString(risk) || (enforceLimits && risk.length > MAX_RISK_LENGTH)) {
      throw new Error('risk do planejamento é inválido')
    }
  }
  if (!Array.isArray(plan.validation) || (enforceLimits && plan.validation.length > MAX_VALIDATION_ITEMS)) {
    throw new Error('validation do planejamento deve ser um array')
  }
  for (const item of plan.validation) {
    if (!isNonEmptyString(item) || (enforceLimits && item.length > MAX_VALIDATION_ITEM_LENGTH)) {
      throw new Error('item de validation do planejamento é inválido')
    }
  }
}

export function validateMissionPlanningResult(plan) {
  validatePlan(plan, true)
  return plan
}

export function parseMissionPlanningResult(resultText) {
  if (typeof resultText !== 'string') throw new Error('resultado do planejamento deve ser uma string')
  const trimmedResult = resultText.trim()
  if (trimmedResult === '') throw new Error('resultado do planejamento não pode ser vazio')

  let parsed
  try {
    parsed = JSON.parse(trimmedResult)
  } catch {
    throw new Error('resultado do planejamento não é JSON válido')
  }

  validatePlan(parsed, false)
  const plan = {
    summary: truncate(parsed.summary, MAX_SUMMARY_LENGTH),
    steps: parsed.steps.slice(0, MAX_STEPS).map((step) => ({
      title: truncate(step.title, MAX_STEP_TITLE_LENGTH),
      detail: truncate(step.detail, MAX_STEP_DETAIL_LENGTH),
      paths: step.paths.slice(0, MAX_STEP_PATHS).map((path) => truncate(path, MAX_STEP_PATH_LENGTH)),
    })),
    risks: parsed.risks.slice(0, MAX_RISKS).map((risk) => truncate(risk, MAX_RISK_LENGTH)),
    validation: parsed.validation.slice(0, MAX_VALIDATION_ITEMS).map(
      (item) => truncate(item, MAX_VALIDATION_ITEM_LENGTH),
    ),
  }

  return validateMissionPlanningResult(plan)
}
