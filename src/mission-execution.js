import { executeOpenClaudeText } from './openclaude-execution-adapter.js'
import {
  buildMissionExecutionContext,
  resolveMissionCorrectionFeedback,
} from './context-builder.js'
import {
  recordMissionExecutionError,
  recordMissionExecutionSuccess,
} from './execution-history.js'
import {
  failProjectMission,
  getProjectMission,
  prepareProjectMissionExecution,
  submitProjectMissionForValidation,
} from './mission-engine.js'
import { buildMissionExecutionPrompt } from './mission-execution-prompt.js'
import { resolveProjectStandards } from './standards-resolver.js'

function persistTechnicalFailure(context, missionId, fromStatus, executionError) {
  try {
    failProjectMission(context, missionId)
  } catch (stateError) {
    throw new AggregateError(
      [executionError, stateError],
      'A execução falhou e o status failed não pôde ser persistido',
    )
  }

  try {
    recordMissionExecutionError(context, {
      missionId,
      fromStatus,
      error: executionError,
    })
  } catch (historyError) {
    throw new AggregateError(
      [executionError, historyError],
      'A execução falhou e o histórico não pôde ser persistido',
    )
  }

  throw executionError
}

export async function executeProjectMission(context, missionId) {
  const initialMission = getProjectMission(context, missionId)
  const fromStatus = initialMission.status
  const correctionFeedback = fromStatus === 'correction'
    ? resolveMissionCorrectionFeedback(context, missionId)
    : null
  const runningMission = prepareProjectMissionExecution(context, missionId)
  let prompt
  let execution

  try {
    const standards = resolveProjectStandards(context)
    const executionContext = buildMissionExecutionContext(context, {
      mission: runningMission,
      standards,
      correctionFeedback,
    })

    prompt = buildMissionExecutionPrompt(executionContext)
    execution = await executeOpenClaudeText({
      projectRoot: context.projectRoot,
      prompt,
    })
  } catch (error) {
    persistTechnicalFailure(context, missionId, fromStatus, error)
  }

  const validationMission = submitProjectMissionForValidation(
    context,
    missionId,
  )

  recordMissionExecutionSuccess(context, {
    missionId,
    fromStatus,
    execution,
  })

  return {
    mission: validationMission,
    execution,
  }
}
