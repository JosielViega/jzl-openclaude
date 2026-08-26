import {
  completeProjectMission,
  getProjectMission,
  requestProjectMissionCorrection,
} from './mission-engine.js'
import {
  recordMissionValidationFinished,
  recordMissionValidationUnavailable,
  resolveLatestMissionExecutionChangeSet,
} from './execution-history.js'
import { createMissionChangeScopeValidator } from './mission-change-scope-validator.js'
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

async function validateMission(context, missionId, validators, configured) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para validação')
  }

  let validation
  const acceptanceValidators = structuredClone(
    mission.acceptanceCriteria ?? [],
  )

  try {
    const scopeValidators = Object.hasOwn(mission, 'changeScope')
      ? [createMissionChangeScopeValidator(
          mission.changeScope,
          resolveLatestMissionExecutionChangeSet(context, missionId),
        )]
      : []
    validation = runProjectValidators(context, [
      ...scopeValidators,
      ...acceptanceValidators,
      ...validators,
    ])
  } catch (error) {
    recordUnavailableAndThrow(context, missionId, error)
  }

  const hasObjectiveProof = acceptanceValidators.length > 0
    || (!configured && validators.length > 0)

  if (validation.status === 'PASS' && !hasObjectiveProof) {
    recordUnavailableAndThrow(
      context,
      missionId,
      new Error('Mission não possui validação específica suficiente para comprovar o objetivo'),
    )
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

export async function validateProjectMission(context, missionId, validators) {
  return validateMission(context, missionId, validators, false)
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

  return validateMission(context, missionId, validators, true)
}
