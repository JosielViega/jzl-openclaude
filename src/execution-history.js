import { validateExecutionChangeSet } from './execution-change-set.js'
import { appendProjectEvent, readProjectEventStore } from './project-event-store.js'

const missionIdPattern = /^mission-\d{4,}$/

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export function recordMissionExecutionSuccess(context, input) {
  const changeSet = Object.hasOwn(input.execution, 'changeSet')
    ? { changeSet: structuredClone(input.execution.changeSet) }
    : {}

  return appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: input.missionId,
    data: {
      outcome: 'SUCCESS',
      fromStatus: input.fromStatus,
      toStatus: 'validation',
      sessionId: input.execution.sessionId,
      model: input.execution.model,
      result: input.execution.result,
      ...changeSet,
    },
  })
}

export function recordMissionExecutionError(context, input) {
  const changeSet = Object.hasOwn(input, 'changeSet')
    ? { changeSet: structuredClone(input.changeSet) }
    : {}

  return appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: input.missionId,
    data: {
      outcome: 'ERROR',
      fromStatus: input.fromStatus,
      toStatus: 'failed',
      sessionId: input.sessionId,
      model: input.model,
      errorMessage: errorMessage(input.error),
      ...changeSet,
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
      model: input.review.model,
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
      model: input.model,
      errorMessage: errorMessage(input.error),
    },
  })
}

export function recordMissionReviewCorrectionRequested(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.review.correction.requested',
    missionId: input.missionId,
    data: {
      reviewEventId: input.reviewEventId,
      fromStatus: 'validation',
      toStatus: 'correction',
    },
  })
}

export function recordMissionPlanFinished(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.plan.finished',
    missionId: input.missionId,
    data: {
      sessionId: input.plan.sessionId,
      model: input.plan.model,
      summary: input.plan.summary,
      steps: input.plan.steps,
      risks: input.plan.risks,
      validation: input.plan.validation,
    },
  })
}

export function recordMissionPlanUnavailable(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.plan.unavailable',
    missionId: input.missionId,
    data: {
      sessionId: input.sessionId,
      model: input.model,
      errorMessage: errorMessage(input.error),
    },
  })
}

export function recordMissionPlanApproved(context, input) {
  return appendProjectEvent(context, {
    type: 'mission.plan.approved',
    missionId: input.missionId,
    data: { planEventId: input.planEventId },
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

export function resolveLatestMissionExecutionChangeSet(context, missionId) {
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

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]

    if (
      event.type === 'mission.execution.finished'
      && event.data.outcome === 'SUCCESS'
      && event.data.toStatus === 'validation'
    ) {
      if (!Object.hasOwn(event.data, 'changeSet')) {
        return null
      }

      validateExecutionChangeSet(event.data.changeSet)
      return structuredClone(event.data.changeSet)
    }
  }

  return null
}
