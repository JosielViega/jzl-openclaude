import { validateMissionReviewResult } from './mission-review-result.js'
import { validateMissionPlanningResult } from './mission-planning-result.js'

const eventIdPattern = /^event-\d{6,}$/
const missionIdPattern = /^mission-\d{4,}$/
const supportedTypes = new Set([
  'mission.execution.finished',
  'mission.validation.finished',
  'mission.validation.unavailable',
  'mission.review.finished',
  'mission.review.unavailable',
  'mission.review.correction.requested',
  'mission.plan.finished',
  'mission.plan.unavailable',
  'mission.plan.approved',
])
const executionFromStatuses = new Set(['pending', 'failed', 'correction'])
const validationOutcomes = new Set(['PASS', 'FAIL', 'ERROR'])
const validatorStatuses = new Set(['PASS', 'FAIL', 'ERROR'])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function validateIsoTimestamp(value) {
  if (typeof value !== 'string') {
    return false
  }

  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function validateExecutionData(data) {
  if (!['SUCCESS', 'ERROR'].includes(data.outcome)) {
    throw new Error('outcome do evento de execução não é suportado')
  }

  if (!executionFromStatuses.has(data.fromStatus)) {
    throw new Error('fromStatus do evento de execução é inválido')
  }

  if (data.outcome === 'SUCCESS') {
    if (data.toStatus !== 'validation') {
      throw new Error('mapeamento do evento de execução é incoerente')
    }

    if (!isNonEmptyString(data.sessionId)) {
      throw new Error('sessionId do evento de execução é inválido')
    }

    if (typeof data.result !== 'string') {
      throw new Error('result do evento de execução deve ser uma string')
    }

    if (Object.hasOwn(data, 'model') && !isNonEmptyString(data.model)) {
      throw new Error('model do evento de execução é inválido')
    }
  } else {
    if (data.toStatus !== 'failed') {
      throw new Error('mapeamento do evento de execução é incoerente')
    }

    if (!isNonEmptyString(data.errorMessage)) {
      throw new Error('errorMessage do evento de execução é inválido')
    }

    if (
      Object.hasOwn(data, 'sessionId')
      && data.sessionId !== null
      && !isNonEmptyString(data.sessionId)
    ) {
      throw new Error('sessionId do evento de execução é inválido')
    }

    if (
      Object.hasOwn(data, 'model')
      && data.model !== null
      && !isNonEmptyString(data.model)
    ) {
      throw new Error('model do evento de execução é inválido')
    }
  }
}

function validateEvidence(evidence) {
  if (!isObject(evidence)) {
    throw new Error('evidence do resultado de validação deve ser um objeto')
  }

  if (evidence.exitCode !== null && !Number.isInteger(evidence.exitCode)) {
    throw new Error('exitCode da evidence deve ser inteiro ou null')
  }

  if (evidence.signal !== null && typeof evidence.signal !== 'string') {
    throw new Error('signal da evidence deve ser string ou null')
  }

  if (typeof evidence.stdout !== 'string') {
    throw new Error('stdout da evidence deve ser uma string')
  }

  if (typeof evidence.stderr !== 'string') {
    throw new Error('stderr da evidence deve ser uma string')
  }

  if (
    evidence.errorMessage !== null
    && typeof evidence.errorMessage !== 'string'
  ) {
    throw new Error('errorMessage da evidence deve ser string ou null')
  }
}

function validateValidationResult(result) {
  if (!isObject(result)) {
    throw new Error('resultado de validação deve ser um objeto')
  }

  if (!isNonEmptyString(result.id)) {
    throw new Error('id do resultado de validação é inválido')
  }

  if (!validatorStatuses.has(result.status)) {
    throw new Error('status do resultado de validação não é suportado')
  }

  validateEvidence(result.evidence)
}

function validateValidationData(data) {
  const expectedToStatus = {
    PASS: 'completed',
    FAIL: 'correction',
    ERROR: 'validation',
  }[data.outcome]

  if (!validationOutcomes.has(data.outcome)) {
    throw new Error('outcome do evento de validação não é suportado')
  }

  if (data.fromStatus !== 'validation' || data.toStatus !== expectedToStatus) {
    throw new Error('mapeamento do evento de validação é incoerente')
  }

  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error('results do evento de validação deve ser um array não vazio')
  }

  for (const result of data.results) {
    validateValidationResult(result)
  }
}

function validateUnavailableData(data) {
  if (data.status !== 'validation') {
    throw new Error('status do evento de validação indisponível é inválido')
  }

  if (!isNonEmptyString(data.errorMessage)) {
    throw new Error('errorMessage do evento de validação é inválido')
  }
}

function validateReviewFinishedData(data) {
  if (!isNonEmptyString(data.sessionId)) {
    throw new Error('sessionId do evento de revisão é inválido')
  }

  if (Object.hasOwn(data, 'model') && !isNonEmptyString(data.model)) {
    throw new Error('model do evento de revisão é inválido')
  }

  validateMissionReviewResult({
    verdict: data.verdict,
    summary: data.summary,
    findings: data.findings,
  })
}

function validateReviewUnavailableData(data) {
  if (data.sessionId !== null && !isNonEmptyString(data.sessionId)) {
    throw new Error('sessionId do evento de revisão é inválido')
  }

  if (
    Object.hasOwn(data, 'model')
    && data.model !== null
    && !isNonEmptyString(data.model)
  ) {
    throw new Error('model do evento de revisão é inválido')
  }

  if (!isNonEmptyString(data.errorMessage)) {
    throw new Error('errorMessage do evento de revisão é inválido')
  }
}

function validateReviewCorrectionRequestedData(data) {
  if (
    typeof data.reviewEventId !== 'string'
    || !eventIdPattern.test(data.reviewEventId)
  ) {
    throw new Error('reviewEventId do pedido de correção por revisão é inválido')
  }

  if (data.fromStatus !== 'validation' || data.toStatus !== 'correction') {
    throw new Error('mapeamento do pedido de correção por revisão é incoerente')
  }
}

function validatePlanningIdentity(data) {
  if (!isNonEmptyString(data.sessionId)) {
    throw new Error('sessionId do evento de planejamento é inválido')
  }
  if (!isNonEmptyString(data.model)) {
    throw new Error('model do evento de planejamento é inválido')
  }
}

function validatePlanFinishedData(data) {
  validatePlanningIdentity(data)
  validateMissionPlanningResult({
    summary: data.summary,
    steps: data.steps,
    risks: data.risks,
    validation: data.validation,
  })
}

function validatePlanUnavailableData(data) {
  if (!Object.hasOwn(data, 'sessionId') || (data.sessionId !== null && !isNonEmptyString(data.sessionId))) {
    throw new Error('sessionId do evento de planejamento é inválido')
  }
  if (!Object.hasOwn(data, 'model') || (data.model !== null && !isNonEmptyString(data.model))) {
    throw new Error('model do evento de planejamento é inválido')
  }
  if (!isNonEmptyString(data.errorMessage)) {
    throw new Error('errorMessage do evento de planejamento é inválido')
  }
}

function validatePlanApprovedData(data) {
  if (
    typeof data.planEventId !== 'string'
    || !eventIdPattern.test(data.planEventId)
  ) {
    throw new Error('planEventId do evento de aprovação de plano é inválido')
  }
}

export function validateProjectEvent(event) {
  if (!isObject(event)) {
    throw new Error('evento deve ser um objeto')
  }

  if (event.id === undefined) {
    throw new Error('id do evento é obrigatório')
  }

  if (typeof event.id !== 'string' || !eventIdPattern.test(event.id)) {
    throw new Error('id do evento é inválido')
  }

  if (event.type === undefined) {
    throw new Error('type do evento é obrigatório')
  }

  if (typeof event.type !== 'string') {
    throw new Error('type do evento deve ser uma string')
  }

  if (!supportedTypes.has(event.type)) {
    throw new Error('type do evento não é suportado')
  }

  if (event.occurredAt === undefined) {
    throw new Error('occurredAt do evento é obrigatório')
  }

  if (!validateIsoTimestamp(event.occurredAt)) {
    throw new Error('occurredAt do evento é inválido')
  }

  if (event.missionId === undefined) {
    throw new Error('missionId do evento é obrigatório')
  }

  if (typeof event.missionId !== 'string' || !missionIdPattern.test(event.missionId)) {
    throw new Error('missionId do evento é inválido')
  }

  if (event.data === undefined) {
    throw new Error('data do evento é obrigatório')
  }

  if (!isObject(event.data)) {
    throw new Error('data do evento deve ser um objeto')
  }

  if (event.type === 'mission.execution.finished') {
    validateExecutionData(event.data)
  } else if (event.type === 'mission.validation.finished') {
    validateValidationData(event.data)
  } else if (event.type === 'mission.validation.unavailable') {
    validateUnavailableData(event.data)
  } else if (event.type === 'mission.review.finished') {
    validateReviewFinishedData(event.data)
  } else if (event.type === 'mission.review.unavailable') {
    validateReviewUnavailableData(event.data)
  } else if (event.type === 'mission.review.correction.requested') {
    validateReviewCorrectionRequestedData(event.data)
  } else if (event.type === 'mission.plan.finished') {
    validatePlanFinishedData(event.data)
  } else if (event.type === 'mission.plan.unavailable') {
    validatePlanUnavailableData(event.data)
  } else {
    validatePlanApprovedData(event.data)
  }

  return event
}

export function createProjectEvent(existingEvents, input) {
  if (!Array.isArray(existingEvents)) {
    throw new Error('events deve ser um array')
  }

  if (!isObject(input)) {
    throw new Error('evento deve ser um objeto')
  }

  if (Object.hasOwn(input, 'id')) {
    throw new Error('id do evento é controlado pelo JZL')
  }

  if (Object.hasOwn(input, 'occurredAt')) {
    throw new Error('occurredAt do evento é controlado pelo JZL')
  }

  const ids = new Set()
  let greatestId = 0n

  for (const event of existingEvents) {
    validateProjectEvent(event)

    if (ids.has(event.id)) {
      throw new Error('ids dos eventos não podem ser duplicados')
    }

    ids.add(event.id)
    const numericId = BigInt(event.id.slice('event-'.length))

    if (numericId > greatestId) {
      greatestId = numericId
    }
  }

  const event = {
    ...input,
    id: `event-${String(greatestId + 1n).padStart(6, '0')}`,
    occurredAt: new Date().toISOString(),
    data: isObject(input.data) ? { ...input.data } : input.data,
  }

  return validateProjectEvent(event)
}
