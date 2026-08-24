import {
  listProjectHistory,
  recordMissionReviewCorrectionRequested,
} from './execution-history.js'
import {
  getProjectMission,
  requestProjectMissionCorrection,
} from './mission-engine.js'

const eventIdPattern = /^event-\d{6,}$/

export function requestMissionReviewCorrection(
  context,
  missionId,
  reviewEventId,
) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para solicitar correção de revisão')
  }

  if (typeof reviewEventId !== 'string' || !eventIdPattern.test(reviewEventId)) {
    throw new Error('reviewEventId de revisão é inválido')
  }

  const events = listProjectHistory(context, missionId)
  const reviewIndex = events.findIndex((event) => event.id === reviewEventId)

  if (reviewIndex === -1) {
    throw new Error('evento de revisão não está disponível para a Mission')
  }

  const reviewEvent = events[reviewIndex]

  if (reviewEvent.type !== 'mission.review.finished') {
    throw new Error('evento informado não é uma revisão concluída')
  }

  if (reviewEvent.data.verdict !== 'CONCERNS') {
    throw new Error('revisão não possui CONCERNS para correção')
  }

  const latestReviewIndex = events.findLastIndex(
    (event) => event.type === 'mission.review.finished',
  )

  if (latestReviewIndex !== reviewIndex) {
    throw new Error('evento de revisão não é a revisão concluída mais recente da Mission')
  }

  const latestExecutionSuccessIndex = events.findLastIndex((event) => (
    event.type === 'mission.execution.finished'
    && event.data.outcome === 'SUCCESS'
    && event.data.toStatus === 'validation'
  ))

  if (
    latestExecutionSuccessIndex === -1
    || reviewIndex <= latestExecutionSuccessIndex
  ) {
    throw new Error('revisão não pertence ao ciclo atual de execução da Mission')
  }

  const correctionMission = requestProjectMissionCorrection(context, missionId)
  const authorizationEvent = recordMissionReviewCorrectionRequested(context, {
    missionId,
    reviewEventId,
  })

  return {
    mission: correctionMission,
    authorizationEvent,
  }
}
