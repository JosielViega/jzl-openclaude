import {
  listProjectHistory,
  recordMissionPlanApproved,
} from './execution-history.js'
import {
  getProjectMission,
  listReadyProjectMissions,
} from './mission-engine.js'

const eventIdPattern = /^event-\d{6,}$/

export function approveMissionPlan(context, missionId, planEventId) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'pending') {
    throw new Error('Mission deve estar pending para aprovação de plano')
  }

  if (!listReadyProjectMissions(context).some(({ id }) => id === missionId)) {
    throw new Error('Mission deve estar pronta para aprovação de plano')
  }

  if (typeof planEventId !== 'string' || !eventIdPattern.test(planEventId)) {
    throw new Error('planEventId de planejamento é inválido')
  }

  const events = listProjectHistory(context, missionId)
  const planIndex = events.findIndex(({ id }) => id === planEventId)

  if (planIndex === -1) {
    throw new Error('evento de planejamento não está disponível para a Mission')
  }

  if (events[planIndex].type !== 'mission.plan.finished') {
    throw new Error('evento informado não é um planejamento concluído')
  }

  const latestPlanIndex = events.findLastIndex(
    ({ type }) => type === 'mission.plan.finished',
  )

  if (latestPlanIndex !== planIndex) {
    throw new Error('evento de planejamento não é o planejamento concluído mais recente da Mission')
  }

  const approvalEvent = recordMissionPlanApproved(context, {
    missionId,
    planEventId,
  })

  return {
    mission: getProjectMission(context, missionId),
    approvalEvent,
  }
}
