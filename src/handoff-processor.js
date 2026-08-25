import { listProjectHistory } from './execution-history.js'
import { validateHandoff } from './handoff.js'

const unavailableMessage = 'handoff de correção da Mission não está disponível'
const unavailablePlanMessage = 'handoff de plano da Mission não está disponível'

function unavailable() {
  throw new Error(unavailableMessage)
}

function unavailablePlan() {
  throw new Error(unavailablePlanMessage)
}

function buildValidationHandoff(event, missionId) {
  const failedValidators = event.data.results
    .filter((result) => result.status === 'FAIL')
    .map((result) => structuredClone(result))

  if (failedValidators.length === 0) {
    unavailable()
  }

  return validateHandoff({
    schemaVersion: 1,
    type: 'mission-correction',
    missionId,
    source: {
      responsibility: 'mission-validation',
      eventId: event.id,
    },
    target: { responsibility: 'mission-execution' },
    payload: { failedValidators },
  })
}

function buildReviewHandoff(events, authorizationIndex, missionId) {
  const authorizationEvent = events[authorizationIndex]
  const reviewIndex = events.findIndex(
    (event) => event.id === authorizationEvent.data.reviewEventId,
  )

  if (reviewIndex === -1 || reviewIndex >= authorizationIndex) {
    unavailable()
  }

  const reviewEvent = events[reviewIndex]

  if (
    reviewEvent.type !== 'mission.review.finished'
    || reviewEvent.data.verdict !== 'CONCERNS'
  ) {
    unavailable()
  }

  if (events.slice(reviewIndex + 1, authorizationIndex).some(
    (event) => event.type === 'mission.review.finished',
  )) {
    unavailable()
  }

  let executionIndex = -1

  for (let index = authorizationIndex - 1; index >= 0; index -= 1) {
    const event = events[index]

    if (
      event.type === 'mission.execution.finished'
      && event.data.outcome === 'SUCCESS'
      && event.data.toStatus === 'validation'
    ) {
      executionIndex = index
      break
    }
  }

  if (executionIndex === -1 || reviewIndex <= executionIndex) {
    unavailable()
  }

  return validateHandoff({
    schemaVersion: 1,
    type: 'mission-review-correction',
    missionId,
    source: {
      responsibility: 'mission-review',
      eventId: reviewEvent.id,
    },
    authorization: { eventId: authorizationEvent.id },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: reviewEvent.data.summary,
      findings: structuredClone(reviewEvent.data.findings),
    },
  })
}

export function resolveMissionCorrectionHandoff(context, missionId) {
  let events

  try {
    events = listProjectHistory(context, missionId)
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'arquivo de histórico do projeto não existe'
    ) {
      unavailable()
    }

    throw error
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]

    if (event.type === 'mission.review.correction.requested') {
      return buildReviewHandoff(events, index, missionId)
    }

    if (
      event.type === 'mission.validation.finished'
      && event.data.outcome === 'FAIL'
      && event.data.fromStatus === 'validation'
      && event.data.toStatus === 'correction'
    ) {
      return buildValidationHandoff(event, missionId)
    }

    if (event.type === 'mission.review.finished') {
      unavailable()
    }

    if (
      event.type === 'mission.execution.finished'
      && event.data.outcome === 'SUCCESS'
      && event.data.toStatus === 'validation'
    ) {
      unavailable()
    }
  }

  unavailable()
}

export function resolveMissionPlanExecutionHandoff(context, missionId) {
  let events

  try {
    events = listProjectHistory(context, missionId)
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'arquivo de histórico do projeto não existe'
    ) {
      return null
    }

    throw error
  }

  const approvalIndex = events.findLastIndex(
    ({ type }) => type === 'mission.plan.approved',
  )

  if (approvalIndex === -1) {
    return null
  }

  const approvalEvent = events[approvalIndex]
  const planIndex = events.findIndex(
    ({ id }) => id === approvalEvent.data.planEventId,
  )

  if (planIndex === -1 || planIndex >= approvalIndex) {
    unavailablePlan()
  }

  const planEvent = events[planIndex]

  if (planEvent.type !== 'mission.plan.finished') {
    unavailablePlan()
  }

  if (events.slice(planIndex + 1, approvalIndex).some(
    ({ type }) => type === 'mission.plan.finished',
  )) {
    unavailablePlan()
  }

  if (events.slice(approvalIndex + 1).some(({ type }) => (
    type === 'mission.plan.finished' || type === 'mission.execution.finished'
  ))) {
    unavailablePlan()
  }

  return validateHandoff({
    schemaVersion: 1,
    type: 'mission-plan-execution',
    missionId,
    source: {
      responsibility: 'mission-planning',
      eventId: planEvent.id,
    },
    authorization: { eventId: approvalEvent.id },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: planEvent.data.summary,
      steps: structuredClone(planEvent.data.steps),
      risks: structuredClone(planEvent.data.risks),
      validation: structuredClone(planEvent.data.validation),
    },
  })
}
