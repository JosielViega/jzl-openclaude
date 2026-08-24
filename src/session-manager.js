import { validateMission } from './mission.js'
import {
  isRegisteredResponsibility,
  resolveResponsibilityDefinition,
} from './responsibility-registry.js'

const missionIdPattern = /^mission-\d{4,}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateMissionSession(session) {
  if (!isObject(session)) {
    throw new Error('sessão de Mission deve ser um objeto')
  }

  if (!isRegisteredResponsibility(session.responsibility)) {
    throw new Error('responsabilidade da sessão de Mission não é suportada')
  }

  const definition = resolveResponsibilityDefinition(session.responsibility)

  if (session.mode !== definition.sessionMode) {
    throw new Error('modo da sessão de Mission não é suportado')
  }

  if (
    typeof session.missionId !== 'string'
    || !missionIdPattern.test(session.missionId)
  ) {
    throw new Error('missionId da sessão de Mission é inválido')
  }

  return session
}

export function validateMissionExecutionSession(session) {
  if (!isObject(session)) {
    throw new Error('sessão de execução deve ser um objeto')
  }

  if (session.responsibility !== 'mission-execution') {
    throw new Error('responsabilidade da sessão de execução não é suportada')
  }

  const definition = resolveResponsibilityDefinition('mission-execution')

  if (session.mode !== definition.sessionMode) {
    throw new Error('modo da sessão de execução não é suportado')
  }

  if (
    typeof session.missionId !== 'string'
    || !missionIdPattern.test(session.missionId)
  ) {
    throw new Error('missionId da sessão de execução é inválido')
  }

  return session
}

export function validateMissionReviewSession(session) {
  if (!isObject(session)) {
    throw new Error('sessão de revisão deve ser um objeto')
  }

  if (session.responsibility !== 'mission-review') {
    throw new Error('responsabilidade da sessão de revisão não é suportada')
  }

  const definition = resolveResponsibilityDefinition('mission-review')

  if (session.mode !== definition.sessionMode) {
    throw new Error('modo da sessão de revisão não é suportado')
  }

  if (
    typeof session.missionId !== 'string'
    || !missionIdPattern.test(session.missionId)
  ) {
    throw new Error('missionId da sessão de revisão é inválido')
  }

  return session
}

export function createMissionExecutionSession(mission) {
  validateMission(mission)

  if (mission.status !== 'running') {
    throw new Error('Mission deve estar running para criar sessão de execução')
  }

  const definition = resolveResponsibilityDefinition('mission-execution')

  return {
    responsibility: 'mission-execution',
    mode: definition.sessionMode,
    missionId: mission.id,
  }
}

export function createMissionReviewSession(mission) {
  validateMission(mission)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para criar sessão de revisão')
  }

  const definition = resolveResponsibilityDefinition('mission-review')

  return {
    responsibility: 'mission-review',
    mode: definition.sessionMode,
    missionId: mission.id,
  }
}
