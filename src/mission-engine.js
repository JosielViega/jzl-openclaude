import {
  completeMission,
  createMission,
  listReadyMissions,
  startMission,
  submitMissionForValidation,
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

function applyProjectMissionTransition(context, missionId, transition) {
  const state = readProjectStateStore(context)
  const existingMissions = getProjectStateMissions(state)
  const transitionedMission = transition(existingMissions, missionId)
  const newState = {
    ...state,
    missions: existingMissions.map((mission) => (
      mission.id === transitionedMission.id ? transitionedMission : mission
    )),
  }

  writeProjectStateStore(context, newState)

  return transitionedMission
}

export function startProjectMission(context, missionId) {
  return applyProjectMissionTransition(context, missionId, startMission)
}

export function submitProjectMissionForValidation(context, missionId) {
  return applyProjectMissionTransition(
    context,
    missionId,
    submitMissionForValidation,
  )
}

export function completeProjectMission(context, missionId) {
  return applyProjectMissionTransition(context, missionId, completeMission)
}
