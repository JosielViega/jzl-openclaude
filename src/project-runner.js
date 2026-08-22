import { executeProjectMission } from './mission-execution.js'
import { validateConfiguredProjectMission } from './mission-validation.js'

export async function runProjectMission(context, missionId) {
  const execution = await executeProjectMission(context, missionId)
  const validation = await validateConfiguredProjectMission(context, missionId)

  return {
    mission: validation.mission,
    execution: execution.execution,
    validation: validation.validation,
  }
}
