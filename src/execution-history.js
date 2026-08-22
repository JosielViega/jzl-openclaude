import { appendProjectEvent, readProjectEventStore } from './project-event-store.js'

const missionIdPattern = /^mission-\d{4,}$/

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export function recordMissionExecutionSuccess(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: input.missionId,
    data: {
      outcome: 'SUCCESS',
      fromStatus: input.fromStatus,
      toStatus: 'validation',
      sessionId: input.execution.sessionId,
      result: input.execution.result,
    },
  })
}

export function recordMissionExecutionError(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: input.missionId,
    data: {
      outcome: 'ERROR',
      fromStatus: input.fromStatus,
      toStatus: 'failed',
      sessionId: input.sessionId,
      errorMessage: errorMessage(input.error),
    },
  })
}

export function recordMissionValidationFinished(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.validation.finished',
    missionId: input.missionId,
    data: {
      outcome: input.validation.status,
      fromStatus: 'validation',
      toStatus: input.toStatus,
      results: input.validation.results,
    },
  })
}

export function recordMissionValidationUnavailable(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.validation.unavailable',
    missionId: input.missionId,
    data: {
      status: 'validation',
      errorMessage: errorMessage(input.error),
    },
  })
}

export function recordMissionReviewFinished(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.review.finished',
    missionId: input.missionId,
    data: {
      sessionId: input.review.sessionId,
      verdict: input.review.verdict,
      summary: input.review.summary,
      findings: input.review.findings,
    },
  })
}

export function recordMissionReviewUnavailable(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.review.unavailable',
    missionId: input.missionId,
    data: {
      sessionId: input.sessionId,
      errorMessage: errorMessage(input.error),
    },
  })
}

export function listProjectHistory(context, missionId) {
  if (
    missionId !== undefined
    && (typeof missionId !== 'string' || !missionIdPattern.test(missionId))
  ) {
    throw new Error('missionId de histórico é inválido')
  }

  const events = readProjectEventStore(context).events

  return events
    .filter((event) => missionId === undefined || event.missionId === missionId)
    .map((event) => structuredClone(event))
}
