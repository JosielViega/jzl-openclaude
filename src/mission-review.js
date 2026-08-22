import {
  recordMissionReviewFinished,
  recordMissionReviewUnavailable,
} from './execution-history.js'
import { getProjectMission } from './mission-engine.js'
import { buildMissionReviewContext } from './mission-review-context.js'
import { buildMissionReviewPrompt } from './mission-review-prompt.js'
import { parseMissionReviewResult } from './mission-review-result.js'
import { executeOpenClaudeText } from './openclaude-execution-adapter.js'
import { createMissionReviewSession } from './session-manager.js'
import { resolveProjectStandards } from './standards-resolver.js'

function validSessionId(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function unavailableSessionId(execution, error) {
  if (execution !== undefined) {
    return validSessionId(execution.sessionId)
  }

  return validSessionId(error?.sessionId)
}

export async function reviewProjectMission(context, missionId) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para revisão')
  }

  let execution
  let review

  try {
    const standards = resolveProjectStandards(context)
    const reviewContext = buildMissionReviewContext(context, {
      mission,
      standards,
    })
    const prompt = buildMissionReviewPrompt(reviewContext)
    const session = createMissionReviewSession(mission)

    execution = await executeOpenClaudeText({
      projectRoot: context.projectRoot,
      prompt,
      session,
    })

    review = {
      sessionId: execution.sessionId,
      ...parseMissionReviewResult(execution.result),
    }
  } catch (error) {
    try {
      recordMissionReviewUnavailable(context, {
        missionId,
        sessionId: unavailableSessionId(execution, error),
        error,
      })
    } catch (historyError) {
      throw new AggregateError(
        [error, historyError],
        'A revisão falhou e o histórico não pôde ser persistido',
      )
    }

    throw error
  }

  recordMissionReviewFinished(context, { missionId, review })

  return {
    mission: getProjectMission(context, missionId),
    review,
  }
}
