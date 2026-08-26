import { validateMissionReviewResult } from './mission-review-result.js'
import { validateMissionPlanningResult } from './mission-planning-result.js'
import { isMissionAcceptanceCriterionType } from './mission-acceptance-criterion.js'
import { validateExecutionChangeSet } from './execution-change-set.js'
import { validateTraditionalWebStructureIssue } from './traditional-web-structure.js'
import { validateTraditionalWebSourceTextIssue } from './traditional-web-source-text.js'
import { validateTraditionalWebPublicExposureIssue } from './traditional-web-public-exposure.js'

const missionIdPattern = /^mission-\d{4,}$/
const eventIdPattern = /^event-\d{6,}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStandardViolationPath(value) {
  return typeof value === 'string'
    && value !== ''
    && value.length <= 500
    && !value.startsWith('/')
    && !value.includes('\\')
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/^[A-Za-z]:/u.test(value)
    && value.split('/').every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..'
    )
}

function validateEvidence(validator) {
  const { evidence } = validator
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

  const fields = ['criterionType', 'path', 'satisfied']
  const present = fields.filter((field) => Object.hasOwn(evidence, field))

  const scopeFields = ['scopeType', 'violations']
  const scopePresent = Object.hasOwn(evidence, 'scopeType')
    ? scopeFields.filter(field => Object.hasOwn(evidence, field))
    : []
  const standardPresent = Object.hasOwn(evidence, 'standardType')

  if (
    [present.length > 0, scopePresent.length > 0, standardPresent]
      .filter(Boolean).length > 1
  ) {
    throw new Error('metadata de validator na evidence é ambígua')
  }

  if (standardPresent) {
    if (
      validator.status !== 'FAIL'
      || evidence.exitCode !== null
      || evidence.signal !== null
      || evidence.stdout !== ''
      || evidence.stderr !== ''
      || evidence.errorMessage !== null
    ) {
      throw new Error('evidence do standard do handoff é inválida')
    }

    if (evidence.standardType === 'ascii-paths') {
      if (
        validator.id !== 'traditional-web:ascii-paths'
        || Object.hasOwn(evidence, 'issues')
        || !Array.isArray(evidence.violations)
        || evidence.violations.length === 0
        || !evidence.violations.every(isStandardViolationPath)
        || new Set(evidence.violations).size !== evidence.violations.length
        || [...evidence.violations].sort().some(
          (path, index) => path !== evidence.violations[index]
        )
      ) {
        throw new Error('evidence do standard do handoff é inválida')
      }
      return
    }

    const issueValidator = evidence.standardType === 'structure'
      ? validateTraditionalWebStructureIssue
      : evidence.standardType === 'source-text'
        ? validateTraditionalWebSourceTextIssue
        : evidence.standardType === 'public-exposure'
          ? validateTraditionalWebPublicExposureIssue
        : null
    const expectedId = evidence.standardType === 'structure'
      ? 'traditional-web:structure'
      : evidence.standardType === 'source-text'
        ? 'traditional-web:source-text'
        : evidence.standardType === 'public-exposure'
          ? 'traditional-web:public-exposure'
        : null
    if (
      issueValidator === null
      || validator.id !== expectedId
      || Object.hasOwn(evidence, 'violations')
      || !Array.isArray(evidence.issues)
      || evidence.issues.length === 0
    ) {
      throw new Error('evidence do standard do handoff é inválida')
    }
    for (const issue of evidence.issues) issueValidator(issue)
    const keys = evidence.issues.map(({ path, reason }) => `${path}\u0000${reason}`)
    if (
      new Set(keys).size !== keys.length
      || [...keys].sort().some((key, index) => key !== keys[index])
    ) {
      throw new Error('evidence do standard do handoff é inválida')
    }
    return
  }

  if (scopePresent.length > 0) {
    if (
      scopePresent.length !== scopeFields.length
      || validator.id !== 'mission-change-scope'
      || validator.status !== 'FAIL'
      || evidence.scopeType !== 'allowed-paths'
      || evidence.exitCode !== null
      || evidence.signal !== null
      || evidence.stdout !== ''
      || evidence.stderr !== ''
      || evidence.errorMessage !== null
      || !Array.isArray(evidence.violations)
      || evidence.violations.length === 0
    ) {
      throw new Error('evidence do Change Scope do handoff é inválida')
    }

    validateExecutionChangeSet({
      created: evidence.violations,
      modified: [],
      deleted: [],
    })
    return
  }

  if (present.length === 0) {
    if (validator.id === 'mission-change-scope') {
      throw new Error('metadata do Change Scope no handoff é incompleta')
    }
    if (validator.id === 'traditional-web:ascii-paths') {
      throw new Error('metadata do standard no handoff é incompleta')
    }
    if ([
      'traditional-web:structure',
      'traditional-web:source-text',
      'traditional-web:public-exposure',
    ].includes(validator.id)) {
      throw new Error('metadata do standard no handoff é incompleta')
    }
    return
  }

  if (present.length !== fields.length) {
    throw new Error('metadata do acceptance criterion no handoff é incompleta')
  }

  if (!/^criterion-\d{4,}$/.test(validator.id)) {
    throw new Error('id do acceptance criterion do handoff é inválido')
  }

  if (
    !isMissionAcceptanceCriterionType(evidence.criterionType)
    || typeof evidence.path !== 'string'
    || evidence.path === ''
    || evidence.satisfied !== false
    || evidence.exitCode !== null
    || evidence.signal !== null
    || evidence.stdout !== ''
    || evidence.stderr !== ''
    || evidence.errorMessage !== null
  ) {
    throw new Error('evidence do acceptance criterion do handoff é inválida')
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

  if (![
    'mission-correction',
    'mission-review-correction',
    'mission-plan-execution',
  ].includes(handoff.type)) {
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

  const expectedSourceResponsibility = {
    'mission-correction': 'mission-validation',
    'mission-review-correction': 'mission-review',
    'mission-plan-execution': 'mission-planning',
  }[handoff.type]

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

  if (handoff.type !== 'mission-correction') {
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

  if (handoff.type === 'mission-plan-execution') {
    validateMissionPlanningResult({
      summary: handoff.payload.summary,
      steps: handoff.payload.steps,
      risks: handoff.payload.risks,
      validation: handoff.payload.validation,
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

    validateEvidence(validator)
  }

  return handoff
}
