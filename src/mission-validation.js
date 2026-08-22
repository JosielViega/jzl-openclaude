import {
  completeProjectMission,
  getProjectMission,
  requestProjectMissionCorrection,
} from './mission-engine.js'
import { runProjectValidators } from './validator-engine.js'

export async function validateProjectMission(context, missionId, validators) {
  const mission = getProjectMission(context, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission deve estar validation para validação')
  }

  const validation = runProjectValidators(context, validators)

  if (validation.status === 'PASS') {
    return {
      mission: completeProjectMission(context, missionId),
      validation,
    }
  }

  if (validation.status === 'FAIL') {
    return {
      mission: requestProjectMissionCorrection(context, missionId),
      validation,
    }
  }

  return {
    mission: getProjectMission(context, missionId),
    validation,
  }
}
