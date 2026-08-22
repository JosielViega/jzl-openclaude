import { validateMission } from './mission.js'

const missionIdPattern = /^mission-\d{4,}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
