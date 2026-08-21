import {
  completeMission,
  createMission,
  listReadyMissions,
} from './mission.js'
import {
  readProjectStateStore,
  writeProjectStateStore,
} from './project-state-store.js'

function getProjectStateMissions(state) {
  if (state.missions === undefined) {
    return []
  }

  if (!Array.isArray(state.missions)) {
    throw new Error('missions do estado do projeto deve ser um array')
  }

  return state.missions
}

export function createProjectMission(context, input) {
  const state = readProjectStateStore(context)
  const existingMissions = getProjectStateMissions(state)
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

export function listReadyProjectMissions(context) {
  const state = readProjectStateStore(context)
  const existingMissions = getProjectStateMissions(state)

  return listReadyMissions(existingMissions)
}

export function completeProjectMission(context, missionId) {
  const state = readProjectStateStore(context)
  const existingMissions = getProjectStateMissions(state)
  const completedMission = completeMission(existingMissions, missionId)
  const newState = {
    ...state,
    missions: existingMissions.map((mission) => (
      mission.id === completedMission.id ? completedMission : mission
    )),
  }

  writeProjectStateStore(context, newState)

  return completedMission
}
