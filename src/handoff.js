import { validateMissionReviewResult } from './mission-review-result.js'

const missionIdPattern = /^mission-\d{4,}$/
const eventIdPattern = /^event-\d{6,}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateEvidence(evidence) {
  if (!isObject(evidence)) {
    throw new Error('evidence do validator do handoff deve ser um objeto')
  }

  if (evidence.exitCode !== null && !Number.isInteger(evidence.exitCode)) {
    throw new Error('exitCode da evidence do handoff é inválido')
  }

  if (evidence.signal !== null && typeof evidence.signal !== 'string') {
    throw new Error('signal da evidence do handoff é inválido')
  }

  if (typeof evidence.stdout !== 'string') {
    throw new Error('stdout da evidence do handoff deve ser uma string')
  }

  if (typeof evidence.stderr !== 'string') {
    throw new Error('stderr da evidence do handoff deve ser uma string')
  }

  if (
    evidence.errorMessage !== null
    && typeof evidence.errorMessage !== 'string'
  ) {
    throw new Error('errorMessage da evidence do handoff é inválido')
  }
}

export function validateHandoff(handoff) {
  if (!isObject(handoff)) {
    throw new Error('handoff deve ser um objeto')
  }

  if (handoff.schemaVersion === undefined) {
    throw new Error('schemaVersion do handoff é obrigatório')
  }

  if (!Number.isInteger(handoff.schemaVersion) || handoff.schemaVersion <= 0) {
    throw new Error('schemaVersion do handoff deve ser um inteiro positivo')
  }

  if (handoff.schemaVersion !== 1) {
    throw new Error('schemaVersion do handoff não é suportado')
  }

  if (handoff.type === undefined) {
    throw new Error('type do handoff é obrigatório')
  }

  if (typeof handoff.type !== 'string') {
    throw new Error('type do handoff deve ser uma string')
  }

  if (!['mission-correction', 'mission-review-correction'].includes(handoff.type)) {
    throw new Error('type do handoff não é suportado')
  }

  if (handoff.missionId === undefined) {
    throw new Error('missionId do handoff é obrigatório')
  }

  if (
    typeof handoff.missionId !== 'string'
    || !missionIdPattern.test(handoff.missionId)
  ) {
    throw new Error('missionId do handoff é inválido')
  }

  if (handoff.source === undefined) {
    throw new Error('source do handoff é obrigatório')
  }

  if (!isObject(handoff.source)) {
    throw new Error('source do handoff deve ser um objeto')
  }

  const expectedSourceResponsibility = handoff.type === 'mission-correction'
    ? 'mission-validation'
    : 'mission-review'

  if (handoff.source.responsibility !== expectedSourceResponsibility) {
    throw new Error('responsabilidade de origem do handoff não é suportada')
  }

  if (handoff.source.eventId === undefined) {
    throw new Error('eventId de origem do handoff é obrigatório')
  }

  if (
    typeof handoff.source.eventId !== 'string'
    || !eventIdPattern.test(handoff.source.eventId)
  ) {
    throw new Error('eventId de origem do handoff é inválido')
  }

  if (handoff.type === 'mission-review-correction') {
    if (!isObject(handoff.authorization)) {
      throw new Error('authorization do handoff deve ser um objeto')
    }

    if (
      typeof handoff.authorization.eventId !== 'string'
      || !eventIdPattern.test(handoff.authorization.eventId)
    ) {
      throw new Error('eventId de autorização do handoff é inválido')
    }

    if (handoff.authorization.eventId === handoff.source.eventId) {
      throw new Error('eventos de origem e autorização do handoff devem ser diferentes')
    }
  }

  if (handoff.target === undefined) {
    throw new Error('target do handoff é obrigatório')
  }

  if (!isObject(handoff.target)) {
    throw new Error('target do handoff deve ser um objeto')
  }

  if (handoff.target.responsibility !== 'mission-execution') {
    throw new Error('responsabilidade de destino do handoff não é suportada')
  }

  if (handoff.payload === undefined) {
    throw new Error('payload do handoff é obrigatório')
  }

  if (!isObject(handoff.payload)) {
    throw new Error('payload do handoff deve ser um objeto')
  }

  if (handoff.type === 'mission-review-correction') {
    validateMissionReviewResult({
      verdict: 'CONCERNS',
      summary: handoff.payload.summary,
      findings: handoff.payload.findings,
    })

    return handoff
  }

  if (!Array.isArray(handoff.payload.failedValidators)
    || handoff.payload.failedValidators.length === 0) {
    throw new Error('failedValidators do handoff deve ser um array não vazio')
  }

  for (const validator of handoff.payload.failedValidators) {
    if (!isObject(validator)) {
      throw new Error('validator do handoff deve ser um objeto')
    }

    if (typeof validator.id !== 'string' || validator.id.trim() === '') {
      throw new Error('id do validator do handoff é inválido')
    }

    if (validator.status !== 'FAIL') {
      throw new Error('status do validator do handoff deve ser FAIL')
    }

    validateEvidence(validator.evidence)
  }

  return handoff
}
