import { executeOpenClaudeText } from './openclaude-execution-adapter.js'
import { createExecutionChangeSet } from './execution-change-set.js'
import { buildMissionExecutionContext } from './context-builder.js'
import {
  recordMissionExecutionError,
  recordMissionExecutionSuccess,
} from './execution-history.js'
import {
  failProjectMission,
  getProjectMission,
  prepareProjectMissionExecution,
  submitProjectMissionForValidation,
  validateProjectMissionExecutionPreconditions,
} from './mission-engine.js'
import { buildMissionExecutionPrompt } from './mission-execution-prompt.js'
import {
  resolveMissionCorrectionHandoff,
  resolveMissionPlanExecutionHandoff,
} from './handoff-processor.js'
import { resolveProjectModelRoute } from './model-router.js'
import { createProjectFilesystemSnapshot } from './project-filesystem-snapshot.js'
import { createMissionExecutionSession } from './session-manager.js'
import { resolveProjectStandards } from './standards-resolver.js'

function errorSessionId(error) {
  return (
    error !== null
    && typeof error === 'object'
    && typeof error.sessionId === 'string'
    && error.sessionId.trim() !== ''
  ) ? error.sessionId : null
}

function persistTechnicalFailure(
  context,
  missionId,
  fromStatus,
  model,
  sessionId,
  changeSet,
  executionError,
) {
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
      sessionId: sessionId ?? errorSessionId(executionError),
      model,
      changeSet,
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
  let handoff = null

  if (fromStatus === 'correction') {
    handoff = resolveMissionCorrectionHandoff(context, missionId)
  } else if (fromStatus === 'pending') {
    handoff = resolveMissionPlanExecutionHandoff(context, missionId)
  }

  validateProjectMissionExecutionPreconditions(context, missionId)
  const beforeSnapshot = createProjectFilesystemSnapshot(context)
  const runningMission = prepareProjectMissionExecution(context, missionId)
  let prompt
  let execution
  let modelRoute = null

  try {
    modelRoute = resolveProjectModelRoute(context, 'mission-execution')
    const standards = resolveProjectStandards(context)
    const executionContext = buildMissionExecutionContext(context, {
      mission: runningMission,
      standards,
      handoff,
    })

    prompt = buildMissionExecutionPrompt(executionContext)
    const session = createMissionExecutionSession(runningMission)
    execution = await executeOpenClaudeText({
      projectRoot: context.projectRoot,
      prompt,
      session,
      modelRoute,
    })
  } catch (error) {
    let changeSet = null
    let executionError = error

    try {
      const afterSnapshot = createProjectFilesystemSnapshot(context)
      changeSet = createExecutionChangeSet(beforeSnapshot, afterSnapshot)
    } catch (snapshotError) {
      executionError = new AggregateError(
        [error, snapshotError],
        'A execução falhou e o Change Set não pôde ser calculado',
      )
    }

    persistTechnicalFailure(
      context,
      missionId,
      fromStatus,
      modelRoute?.model ?? null,
      errorSessionId(error),
      changeSet,
      executionError,
    )
  }

  let changeSet

  try {
    const afterSnapshot = createProjectFilesystemSnapshot(context)
    changeSet = createExecutionChangeSet(beforeSnapshot, afterSnapshot)
  } catch (snapshotError) {
    persistTechnicalFailure(
      context,
      missionId,
      fromStatus,
      execution.model,
      execution.sessionId,
      null,
      snapshotError,
    )
  }

  const auditedExecution = {
    ...execution,
    changeSet,
  }

  const validationMission = submitProjectMissionForValidation(
    context,
    missionId,
  )

  recordMissionExecutionSuccess(context, {
    missionId,
    fromStatus,
    execution: auditedExecution,
  })

  return {
    mission: validationMission,
    execution: auditedExecution,
  }
}
