import { validateMission } from './mission.js'

const missionIdPattern = /^mission-\d{4,}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateMissionSession(session) {
  if (!isObject(session)) {
    throw new Error('sessão de Mission deve ser um objeto')
  }

  if (!['mission-execution', 'mission-review'].includes(session.responsibility)) {
    throw new Error('responsabilidade da sessão de Mission não é suportada')
  }

  if (session.mode !== 'fresh') {
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

  if (session.mode !== 'fresh') {
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

  if (session.mode !== 'fresh') {
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

  return {
    responsibility: 'mission-execution',
    mode: 'fresh',
    missionId: mission.id,
  }
}

export function createMissionReviewSession(mission) {
  validateMission(mission)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para criar sessão de revisão')
  }

  return {
    responsibility: 'mission-review',
    mode: 'fresh',
    missionId: mission.id,
  }
}
