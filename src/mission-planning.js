import {
  recordMissionPlanFinished,
  recordMissionPlanUnavailable,
} from './execution-history.js'
import {
  getProjectMission,
  listReadyProjectMissions,
} from './mission-engine.js'
import { buildMissionPlanningContext } from './mission-planning-context.js'
import { buildMissionPlanningPrompt } from './mission-planning-prompt.js'
import { parseMissionPlanningResult } from './mission-planning-result.js'
import { resolveProjectModelRoute } from './model-router.js'
import { executeOpenClaudeText } from './openclaude-execution-adapter.js'
import { createMissionPlanningSession } from './session-manager.js'
import { resolveProjectStandards } from './standards-resolver.js'

function validSessionId(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function unavailableSessionId(execution, error) {
  if (execution !== undefined) return validSessionId(execution.sessionId)
  return validSessionId(error?.sessionId)
}

export async function planProjectMission(context, missionId) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'pending') {
    throw new Error('Mission deve estar pending para planejamento')
  }

  if (!listReadyProjectMissions(context).some(({ id }) => id === missionId)) {
    throw new Error('Mission deve estar pronta para planejamento')
  }

  let execution
  let plan
  let modelRoute = null

  try {
    modelRoute = resolveProjectModelRoute(context, 'mission-planning')
    const standards = resolveProjectStandards(context)
    const planningContext = buildMissionPlanningContext(context, { mission, standards })
    const prompt = buildMissionPlanningPrompt(planningContext)
    const session = createMissionPlanningSession(mission)

    execution = await executeOpenClaudeText({
      projectRoot: context.projectRoot,
      prompt,
      session,
      modelRoute,
    })

    plan = {
      sessionId: execution.sessionId,
      model: execution.model,
      ...parseMissionPlanningResult(execution.result),
    }
  } catch (error) {
    try {
      recordMissionPlanUnavailable(context, {
        missionId,
        sessionId: unavailableSessionId(execution, error),
        model: modelRoute?.model ?? null,
        error,
      })
    } catch (historyError) {
      throw new AggregateError(
        [error, historyError],
        'O planejamento falhou e o histórico não pôde ser persistido',
      )
    }
    throw error
  }

  recordMissionPlanFinished(context, { missionId, plan })

  return {
    mission: getProjectMission(context, missionId),
    plan,
  }
}
