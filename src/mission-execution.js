import { executeOpenClaudeText } from './openclaude-execution-adapter.js'
import {
  failProjectMission,
  prepareProjectMissionExecution,
  submitProjectMissionForValidation,
} from './mission-engine.js'
import { buildMissionExecutionPrompt } from './mission-execution-prompt.js'

function persistTechnicalFailure(context, missionId, executionError) {
  try {
    failProjectMission(context, missionId)
  } catch (stateError) {
    throw new AggregateError(
      [executionError, stateError],
      'A execução falhou e o status failed não pôde ser persistido',
    )
  }

  throw executionError
}

export async function executeProjectMission(context, missionId) {
  const runningMission = prepareProjectMissionExecution(context, missionId)
  let prompt
  let execution

  try {
    prompt = buildMissionExecutionPrompt(runningMission)
    execution = await executeOpenClaudeText({
      projectRoot: context.projectRoot,
      prompt,
    })
  } catch (error) {
    persistTechnicalFailure(context, missionId, error)
  }

  const validationMission = submitProjectMissionForValidation(
    context,
    missionId,
  )

  return {
    mission: validationMission,
    execution,
  }
}
