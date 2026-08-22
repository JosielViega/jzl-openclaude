import {
  completeProjectMission,
  getProjectMission,
  requestProjectMissionCorrection,
} from './mission-engine.js'
import {
  recordMissionValidationFinished,
  recordMissionValidationUnavailable,
} from './execution-history.js'
import { runProjectValidators } from './validator-engine.js'
import { resolveProjectValidators } from './standards-resolver.js'

function recordUnavailableAndThrow(context, missionId, validationError) {
  try {
    recordMissionValidationUnavailable(context, {
      missionId,
      error: validationError,
    })
  } catch (historyError) {
    throw new AggregateError(
      [validationError, historyError],
      'A validação não pôde ser preparada e o histórico não pôde ser persistido',
    )
  }

  throw validationError
}

export async function validateProjectMission(context, missionId, validators) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para validação')
  }

  let validation

  try {
    validation = runProjectValidators(context, validators)
  } catch (error) {
    recordUnavailableAndThrow(context, missionId, error)
  }

  let finalMission

  if (validation.status === 'PASS') {
    finalMission = completeProjectMission(context, missionId)
  } else if (validation.status === 'FAIL') {
    finalMission = requestProjectMissionCorrection(context, missionId)
  } else {
    finalMission = getProjectMission(context, missionId)
  }

  recordMissionValidationFinished(context, {
    missionId,
    validation,
    toStatus: finalMission.status,
  })

  return {
    mission: finalMission,
    validation,
  }
}

export async function validateConfiguredProjectMission(context, missionId) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para validação')
  }

  let validators

  try {
    validators = resolveProjectValidators(context)
  } catch (error) {
    recordUnavailableAndThrow(context, missionId, error)
  }

  return validateProjectMission(context, missionId, validators)
}
