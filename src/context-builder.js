import { realpathSync } from 'node:fs'

import { validateHandoff } from './handoff.js'
import { validateMission } from './mission.js'
import { validateProjectRoot } from './project-root.js'

const MAX_CORRECTION_VALIDATORS = 20
const MAX_DIAGNOSTIC_TEXT_LENGTH = 4000
const TRUNCATION_MARKER = '[conteúdo truncado pelo JZL]'

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

function truncateText(text, maximumLength) {
  if (text.length <= maximumLength) {
    return text
  }

  const suffix = `\n${TRUNCATION_MARKER}`

  return `${text.slice(0, maximumLength - suffix.length)}${suffix}`
}

function sanitizeDiagnosticText(text, redactProjectRoot) {
  return truncateText(redactProjectRoot(text), MAX_DIAGNOSTIC_TEXT_LENGTH)
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
        ? sanitizeDiagnosticText(result.evidence.errorMessage, redactProjectRoot)
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

function buildValidationHandoff(context, handoff) {
  const selectedValidators = handoff.payload.failedValidators
    .slice(0, MAX_CORRECTION_VALIDATORS)
  const redactProjectRoot = createProjectRootRedactor(context)

  return {
    schemaVersion: handoff.schemaVersion,
    type: handoff.type,
    missionId: handoff.missionId,
    source: {
      responsibility: handoff.source.responsibility,
      eventId: handoff.source.eventId,
    },
    target: {
      responsibility: handoff.target.responsibility,
    },
    payload: {
      failedValidators: selectedValidators.map(
        (validator) => cloneFailedValidator(validator, redactProjectRoot),
      ),
      omittedCount: handoff.payload.failedValidators.length - selectedValidators.length,
    },
  }
}

function buildReviewHandoff(context, handoff) {
  const redactProjectRoot = createProjectRootRedactor(context)
  const sanitize = (text, maximumLength) => truncateText(
    redactProjectRoot(text),
    maximumLength,
  )

  return {
    schemaVersion: handoff.schemaVersion,
    type: handoff.type,
    missionId: handoff.missionId,
    source: {
      responsibility: handoff.source.responsibility,
      eventId: handoff.source.eventId,
    },
    authorization: { eventId: handoff.authorization.eventId },
    target: { responsibility: handoff.target.responsibility },
    payload: {
      summary: sanitize(handoff.payload.summary, 4000),
      findings: handoff.payload.findings.slice(0, 20).map((finding) => ({
        severity: finding.severity,
        title: sanitize(finding.title, 200),
        detail: sanitize(finding.detail, 4000),
        paths: finding.paths.slice(0, 20).map(
          (path) => sanitize(path, 500),
        ),
      })),
    },
  }
}

function buildPlanHandoff(context, handoff) {
  const redactProjectRoot = createProjectRootRedactor(context)
  const sanitize = (text, maximumLength) => truncateText(
    redactProjectRoot(text),
    maximumLength,
  )

  return {
    schemaVersion: handoff.schemaVersion,
    type: handoff.type,
    missionId: handoff.missionId,
    source: {
      responsibility: handoff.source.responsibility,
      eventId: handoff.source.eventId,
    },
    authorization: { eventId: handoff.authorization.eventId },
    target: { responsibility: handoff.target.responsibility },
    payload: {
      summary: sanitize(handoff.payload.summary, 4000),
      steps: handoff.payload.steps.slice(0, 20).map((step) => ({
        title: sanitize(step.title, 200),
        detail: sanitize(step.detail, 4000),
        paths: step.paths.slice(0, 20).map((path) => sanitize(path, 500)),
      })),
      risks: handoff.payload.risks.slice(0, 20).map(
        (risk) => sanitize(risk, 2000),
      ),
      validation: handoff.payload.validation.slice(0, 20).map(
        (item) => sanitize(item, 2000),
      ),
    },
  }
}

function buildHandoff(context, handoff) {
  if (handoff === null) {
    return null
  }

  if (handoff.type === 'mission-correction') {
    return buildValidationHandoff(context, handoff)
  }

  if (handoff.type === 'mission-review-correction') {
    return buildReviewHandoff(context, handoff)
  }

  return buildPlanHandoff(context, handoff)
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

  if (input.handoff !== null) {
    validateHandoff(input.handoff)

    if (input.handoff.missionId !== input.mission.id) {
      throw new Error('handoff não pertence à Mission de execução')
    }
  }

  validateProjectRoot(context.projectRoot)

  return {
    mission: structuredClone(input.mission),
    standards: structuredClone(input.standards),
    handoff: buildHandoff(context, input.handoff),
  }
}
