import { listProjectHistory } from './execution-history.js'
import { getProjectMission } from './mission-engine.js'

function readMissionHistoryOrEmpty(context, missionId) {
  try {
    return listProjectHistory(context, missionId)
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'arquivo de histórico do projeto não existe'
    ) {
      return []
    }

    throw error
  }
}

function createEventReport(event, kind) {
  return {
    ...structuredClone(event.data),
    eventId: event.id,
    occurredAt: event.occurredAt,
    ...(kind === undefined ? {} : { kind }),
  }
}

function findLastEventIndex(events, predicate) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) return index
  }

  return -1
}

function findLastEventAfter(events, startIndex, types) {
  let index = -1

  for (let current = events.length - 1; current > startIndex; current -= 1) {
    if (types.has(events[current].type)) {
      index = current
      break
    }
  }

  return index === -1 ? null : events[index]
}

export function buildMissionAuditReport(context, missionId) {
  const mission = structuredClone(getProjectMission(context, missionId))
  const events = readMissionHistoryOrEmpty(context, missionId)
  const planIndex = findLastEventIndex(
    events,
    event => event.type === 'mission.plan.finished',
  )
  const approvalIndex = findLastEventIndex(
    events,
    event => event.type === 'mission.plan.approved',
  )
  const executionIndex = findLastEventIndex(
    events,
    event => event.type === 'mission.execution.finished',
  )
  const currentCycle = {
    execution: null,
    validation: null,
    review: null,
    reviewCorrection: null,
  }

  if (executionIndex !== -1) {
    const executionEvent = events[executionIndex]
    currentCycle.execution = createEventReport(executionEvent)

    if (executionEvent.data.outcome === 'SUCCESS') {
      if (executionEvent.data.toStatus === 'validation') {
        const validationEvent = findLastEventAfter(
          events,
          executionIndex,
          new Set([
            'mission.validation.finished',
            'mission.validation.unavailable',
          ]),
        )

        if (validationEvent !== null) {
          currentCycle.validation = createEventReport(
            validationEvent,
            validationEvent.type === 'mission.validation.finished'
              ? 'finished'
              : 'unavailable',
          )
        }
      }

      const reviewEvent = findLastEventAfter(
        events,
        executionIndex,
        new Set(['mission.review.finished', 'mission.review.unavailable']),
      )
      const correctionEvent = findLastEventAfter(
        events,
        executionIndex,
        new Set(['mission.review.correction.requested']),
      )

      if (reviewEvent !== null) {
        currentCycle.review = createEventReport(
          reviewEvent,
          reviewEvent.type === 'mission.review.finished'
            ? 'finished'
            : 'unavailable',
        )
      }

      if (correctionEvent !== null) {
        currentCycle.reviewCorrection = createEventReport(correctionEvent)
      }
    }
  }

  return {
    mission,
    planning: {
      plan: planIndex === -1 ? null : createEventReport(events[planIndex]),
      approval: approvalIndex === -1
        ? null
        : createEventReport(events[approvalIndex]),
    },
    currentCycle,
  }
}
