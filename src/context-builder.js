import { realpathSync } from 'node:fs'

import { listProjectHistory } from './execution-history.js'
import { validateMission } from './mission.js'
import { validateProjectRoot } from './project-root.js'

const MAX_CORRECTION_VALIDATORS = 20
const MAX_DIAGNOSTIC_TEXT_LENGTH = 4000
const TRUNCATION_MARKER = '[conteúdo truncado pelo JZL]'
const eventIdPattern = /^event-\d{6,}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createProjectRootRedactor(context) {
  const projectRoot = validateProjectRoot(context.projectRoot)
  const canonicalProjectRoot = realpathSync.native(projectRoot)
  const variants = new Set()

  for (const root of [projectRoot, canonicalProjectRoot]) {
    variants.add(root)
    variants.add(root.replaceAll('\\', '/'))
    variants.add(root.replaceAll('/', '\\'))
  }

  const orderedVariants = [...variants]
    .filter((root) => root !== '')
    .sort((left, right) => right.length - left.length)
  const flags = process.platform === 'win32' ? 'giu' : 'gu'
  const pattern = new RegExp(
    `(?:${orderedVariants.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_.-])`,
    flags,
  )

  return (text) => text.replace(pattern, '<projectRoot>')
}

function truncateDiagnosticText(text) {
  if (text.length <= MAX_DIAGNOSTIC_TEXT_LENGTH) {
    return text
  }

  const suffix = `\n${TRUNCATION_MARKER}`

  return `${text.slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH - suffix.length)}${suffix}`
}

function sanitizeDiagnosticText(text, redactProjectRoot) {
  return truncateDiagnosticText(redactProjectRoot(text))
}

function cloneFailedValidator(result, redactProjectRoot) {
  return {
    id: result.id,
    status: result.status,
    evidence: {
      exitCode: result.evidence.exitCode,
      signal: result.evidence.signal,
      stdout: sanitizeDiagnosticText(result.evidence.stdout, redactProjectRoot),
      stderr: sanitizeDiagnosticText(result.evidence.stderr, redactProjectRoot),
      errorMessage: typeof result.evidence.errorMessage === 'string'
        ? sanitizeDiagnosticText(
          result.evidence.errorMessage,
          redactProjectRoot,
        )
        : null,
    },
  }
}

function validateStandards(standards) {
  if (!isObject(standards)) {
    throw new Error('standards deve ser um objeto')
  }

  if (typeof standards.id !== 'string' || standards.id.trim() === '') {
    throw new Error('id de standards deve ser uma string não vazia')
  }

  if (
    !Array.isArray(standards.instructions)
    || standards.instructions.length === 0
  ) {
    throw new Error('instructions de standards deve ser um array não vazio')
  }

  if (!standards.instructions.every(
    (instruction) => typeof instruction === 'string' && instruction.trim() !== '',
  )) {
    throw new Error('instructions de standards deve conter strings não vazias')
  }
}

function validateEvidence(evidence) {
  if (!isObject(evidence)) {
    throw new Error('evidence do feedback de correção deve ser um objeto')
  }

  if (!Number.isInteger(evidence.exitCode) && evidence.exitCode !== null) {
    throw new Error('exitCode do feedback de correção é inválido')
  }

  if (evidence.signal !== null && typeof evidence.signal !== 'string') {
    throw new Error('signal do feedback de correção é inválido')
  }

  if (typeof evidence.stdout !== 'string') {
    throw new Error('stdout do feedback de correção deve ser uma string')
  }

  if (evidence.stdout.length > MAX_DIAGNOSTIC_TEXT_LENGTH) {
    throw new Error('stdout do feedback de correção excede o limite')
  }

  if (typeof evidence.stderr !== 'string') {
    throw new Error('stderr do feedback de correção deve ser uma string')
  }

  if (evidence.stderr.length > MAX_DIAGNOSTIC_TEXT_LENGTH) {
    throw new Error('stderr do feedback de correção excede o limite')
  }

  if (
    evidence.errorMessage !== null
    && typeof evidence.errorMessage !== 'string'
  ) {
    throw new Error('errorMessage do feedback de correção é inválido')
  }

  if (
    typeof evidence.errorMessage === 'string'
    && evidence.errorMessage.length > MAX_DIAGNOSTIC_TEXT_LENGTH
  ) {
    throw new Error('errorMessage do feedback de correção excede o limite')
  }
}

function validateCorrectionFeedback(correctionFeedback) {
  if (correctionFeedback === null) {
    return
  }

  if (!isObject(correctionFeedback)) {
    throw new Error('feedback de correção deve ser um objeto ou null')
  }

  if (
    typeof correctionFeedback.eventId !== 'string'
    || !eventIdPattern.test(correctionFeedback.eventId)
  ) {
    throw new Error('eventId do feedback de correção é inválido')
  }

  if (
    !Array.isArray(correctionFeedback.failedValidators)
    || correctionFeedback.failedValidators.length === 0
    || correctionFeedback.failedValidators.length > MAX_CORRECTION_VALIDATORS
  ) {
    throw new Error('failedValidators do feedback de correção é inválido')
  }

  for (const validator of correctionFeedback.failedValidators) {
    if (!isObject(validator)) {
      throw new Error('validator do feedback de correção deve ser um objeto')
    }

    if (typeof validator.id !== 'string' || validator.id.trim() === '') {
      throw new Error('id do validator do feedback de correção é inválido')
    }

    if (validator.status !== 'FAIL') {
      throw new Error('status do validator do feedback de correção deve ser FAIL')
    }

    validateEvidence(validator.evidence)
  }

  if (
    !Number.isInteger(correctionFeedback.omittedCount)
    || correctionFeedback.omittedCount < 0
  ) {
    throw new Error('omittedCount do feedback de correção é inválido')
  }
}

export function resolveMissionCorrectionFeedback(context, missionId) {
  let events

  try {
    events = listProjectHistory(context, missionId)
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'arquivo de histórico do projeto não existe'
    ) {
      throw new Error('feedback de correção da Mission não está disponível')
    }

    throw error
  }

  const event = events.findLast((candidate) => (
    candidate.type === 'mission.validation.finished'
    && candidate.data.outcome === 'FAIL'
    && candidate.data.fromStatus === 'validation'
    && candidate.data.toStatus === 'correction'
  ))

  if (event === undefined) {
    throw new Error('feedback de correção da Mission não está disponível')
  }

  const failedResults = event.data.results.filter(
    (result) => result.status === 'FAIL',
  )

  if (failedResults.length === 0) {
    throw new Error('feedback de correção da Mission não está disponível')
  }

  const selectedResults = failedResults.slice(0, MAX_CORRECTION_VALIDATORS)
  const redactProjectRoot = createProjectRootRedactor(context)

  return {
    eventId: event.id,
    failedValidators: selectedResults.map(
      (result) => cloneFailedValidator(result, redactProjectRoot),
    ),
    omittedCount: failedResults.length - selectedResults.length,
  }
}

export function buildMissionExecutionContext(context, input) {
  if (!isObject(input)) {
    throw new Error('dados do contexto de execução devem ser um objeto')
  }

  validateMission(input.mission)

  if (input.mission.status !== 'running') {
    throw new Error('Mission deve estar running para construir contexto de execução')
  }

  validateStandards(input.standards)
  validateCorrectionFeedback(input.correctionFeedback)
  validateProjectRoot(context.projectRoot)

  return {
    mission: structuredClone(input.mission),
    standards: structuredClone(input.standards),
    correctionFeedback: input.correctionFeedback === null
      ? null
      : structuredClone(input.correctionFeedback),
  }
}
