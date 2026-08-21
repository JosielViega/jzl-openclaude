import { createMission } from './mission.js'
import {
  readProjectStateStore,
  writeProjectStateStore,
} from './project-state-store.js'

export function createProjectMission(context, input) {
  const state = readProjectStateStore(context)
  let existingMissions

  if (state.missions === undefined) {
    existingMissions = []
  } else if (Array.isArray(state.missions)) {
    existingMissions = state.missions
  } else {
    throw new Error('missions do estado do projeto deve ser um array')
  }

  const createdMission = createMission(existingMissions, input)
  const newState = {
    ...state,
    missions: [
      ...existingMissions,
      createdMission,
    ],
  }

  writeProjectStateStore(context, newState)

  return createdMission
}
