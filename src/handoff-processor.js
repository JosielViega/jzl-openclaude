import { listProjectHistory } from './execution-history.js'
import { validateHandoff } from './handoff.js'

const unavailableMessage = 'handoff de correção da Mission não está disponível'

export function resolveMissionCorrectionHandoff(context, missionId) {
  let events

  try {
    events = listProjectHistory(context, missionId)
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'arquivo de histórico do projeto não existe'
    ) {
      throw new Error(unavailableMessage)
    }

    throw error
  }

  let event

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index]

    if (
      candidate.type === 'mission.validation.finished'
      && candidate.data.outcome === 'FAIL'
      && candidate.data.fromStatus === 'validation'
      && candidate.data.toStatus === 'correction'
    ) {
      event = candidate
      break
    }
  }

  if (event === undefined) {
    throw new Error(unavailableMessage)
  }

  const failedValidators = event.data.results
    .filter((result) => result.status === 'FAIL')
    .map((result) => structuredClone(result))

  if (failedValidators.length === 0) {
    throw new Error(unavailableMessage)
  }

  const handoff = {
    schemaVersion: 1,
    type: 'mission-correction',
    missionId,
    source: {
      responsibility: 'mission-validation',
      eventId: event.id,
    },
    target: {
      responsibility: 'mission-execution',
    },
    payload: {
      failedValidators,
    },
  }

  return validateHandoff(handoff)
}
