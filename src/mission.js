import {
  createMissionAcceptanceCriteria,
  validateMissionAcceptanceCriteria,
} from './mission-acceptance-criterion.js'
import {
  createMissionChangeScope,
  validateMissionChangeScope,
} from './mission-change-scope.js'

const missionIdPattern = /^mission-\d{4,}$/

function validateMissionTextField(mission, fieldName) {
  const value = mission[fieldName]

  if (value === undefined) {
    throw new Error(`${fieldName} da Mission é obrigatório`)
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} da Mission deve ser uma string`)
  }

  if (value.trim() === '') {
    throw new Error(`${fieldName} da Mission não pode ser vazio`)
  }
}

function validateMissionDependencies(dependencies, missionId) {
  if (dependencies === undefined) {
    throw new Error('dependencies da Mission é obrigatório')
  }

  if (!Array.isArray(dependencies)) {
    throw new Error('dependencies da Mission deve ser um array')
  }

  for (const dependencyId of dependencies) {
    if (
      typeof dependencyId !== 'string'
      || !missionIdPattern.test(dependencyId)
    ) {
      throw new Error('dependência da Mission possui id inválido')
    }
  }

  if (new Set(dependencies).size !== dependencies.length) {
    throw new Error('dependências da Mission não podem ser duplicadas')
  }

  if (missionId !== undefined && dependencies.includes(missionId)) {
    throw new Error('Mission não pode depender de si mesma')
  }
}

function validateExistingMissions(existingMissions) {
  if (!Array.isArray(existingMissions)) {
    throw new Error('existingMissions deve ser um array')
  }

  const missionsById = new Map()

  for (const mission of existingMissions) {
    validateMission(mission)

    if (missionsById.has(mission.id)) {
      throw new Error('ids das Missions existentes não podem ser duplicados')
    }

    missionsById.set(mission.id, mission)
  }

  return missionsById
}

function assertMissionDependenciesExist(mission, missionsById) {
  for (const dependencyId of mission.dependencies) {
    if (!missionsById.has(dependencyId)) {
      throw new Error('dependência da Mission não existe')
    }
  }
}

function assertMissionDependenciesCompleted(mission, missionsById) {
  if (!mission.dependencies.every(
    (dependencyId) => missionsById.get(dependencyId).status === 'completed',
  )) {
    throw new Error('Mission não está pronta para nova execução')
  }
}

function getMissionForTransition(existingMissions, missionId) {
  const missionsById = validateExistingMissions(existingMissions)

  if (missionId === undefined) {
    throw new Error('missionId é obrigatório')
  }

  if (typeof missionId !== 'string' || !missionIdPattern.test(missionId)) {
    throw new Error('missionId é inválido')
  }

  const mission = missionsById.get(missionId)

  if (mission === undefined) {
    throw new Error('Mission não existe')
  }

  assertMissionDependenciesExist(mission, missionsById)

  return { mission, missionsById }
}

export function validateMission(mission) {
  if (
    mission === null
    || typeof mission !== 'object'
    || Array.isArray(mission)
  ) {
    throw new Error('Mission deve ser um objeto')
  }

  if (mission.id === undefined) {
    throw new Error('id da Mission é obrigatório')
  }

  if (typeof mission.id !== 'string' || !missionIdPattern.test(mission.id)) {
    throw new Error('id da Mission é inválido')
  }

  validateMissionTextField(mission, 'title')
  validateMissionTextField(mission, 'objective')

  if (mission.status === undefined) {
    throw new Error('status da Mission é obrigatório')
  }

  if (typeof mission.status !== 'string') {
    throw new Error('status da Mission deve ser uma string')
  }

  if (
    mission.status !== 'pending'
    && mission.status !== 'running'
    && mission.status !== 'validation'
    && mission.status !== 'completed'
    && mission.status !== 'failed'
    && mission.status !== 'correction'
  ) {
    throw new Error('status da Mission não é suportado')
  }

  validateMissionDependencies(mission.dependencies, mission.id)

  if (Object.hasOwn(mission, 'acceptanceCriteria')) {
    validateMissionAcceptanceCriteria(mission.acceptanceCriteria)
  }

  if (Object.hasOwn(mission, 'changeScope')) {
    validateMissionChangeScope(mission.changeScope)
  }

  return mission
}

export function createMission(existingMissions, input) {
  const missionsById = validateExistingMissions(existingMissions)

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('dados da nova Mission devem ser um objeto')
  }

  if (Object.hasOwn(input, 'id')) {
    throw new Error('id da nova Mission é controlado pelo JZL')
  }

  if (Object.hasOwn(input, 'status')) {
    throw new Error('status inicial da nova Mission é controlado pelo JZL')
  }

  validateMissionTextField(input, 'title')
  validateMissionTextField(input, 'objective')

  const dependencies = input.dependencies === undefined
    ? []
    : input.dependencies

  validateMissionDependencies(dependencies)
  const acceptanceCriteria = createMissionAcceptanceCriteria(
    input.acceptanceCriteria,
  )
  const changeScope = createMissionChangeScope(input.changeScope)

  for (const dependencyId of dependencies) {
    if (!missionsById.has(dependencyId)) {
      throw new Error('dependência da Mission não existe')
    }
  }

  let greatestMissionNumber = 0n

  for (const mission of existingMissions) {
    const missionNumber = BigInt(mission.id.slice('mission-'.length))

    if (missionNumber > greatestMissionNumber) {
      greatestMissionNumber = missionNumber
    }
  }

  const generatedId = (
    `mission-${String(greatestMissionNumber + 1n).padStart(4, '0')}`
  )

  return {
    id: generatedId,
    title: input.title,
    objective: input.objective,
    status: 'pending',
    dependencies: [...dependencies],
    acceptanceCriteria,
    ...(changeScope === undefined ? {} : { changeScope }),
  }
}

export function isMissionReady(mission, existingMissions) {
  validateMission(mission)
  const missionsById = validateExistingMissions(existingMissions)

  assertMissionDependenciesExist(mission, missionsById)

  return mission.status === 'pending' && mission.dependencies.every(
    (dependencyId) => missionsById.get(dependencyId).status === 'completed',
  )
}

export function startMission(existingMissions, missionId) {
  const { mission } = getMissionForTransition(existingMissions, missionId)

  if (mission.status !== 'pending') {
    throw new Error('Mission não pode ser iniciada no status atual')
  }

  if (!isMissionReady(mission, existingMissions)) {
    throw new Error('Mission não está pronta para iniciar')
  }

  return {
    ...mission,
    status: 'running',
  }
}

export function submitMissionForValidation(existingMissions, missionId) {
  const { mission } = getMissionForTransition(existingMissions, missionId)

  if (mission.status !== 'running') {
    throw new Error('Mission não pode entrar em validação no status atual')
  }

  return {
    ...mission,
    status: 'validation',
  }
}

export function completeMission(existingMissions, missionId) {
  const { mission } = getMissionForTransition(existingMissions, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission não pode ser concluída no status atual')
  }

  return {
    ...mission,
    status: 'completed',
  }
}

export function failMission(existingMissions, missionId) {
  const { mission } = getMissionForTransition(existingMissions, missionId)

  if (mission.status !== 'running') {
    throw new Error('Mission não pode falhar no status atual')
  }

  return {
    ...mission,
    status: 'failed',
  }
}

export function retryMission(existingMissions, missionId) {
  const { mission, missionsById } = getMissionForTransition(
    existingMissions,
    missionId,
  )

  if (mission.status !== 'failed') {
    throw new Error('Mission não pode ser reexecutada no status atual')
  }

  assertMissionDependenciesCompleted(mission, missionsById)

  return {
    ...mission,
    status: 'running',
  }
}

export function requestMissionCorrection(existingMissions, missionId) {
  const { mission } = getMissionForTransition(existingMissions, missionId)

  if (mission.status !== 'validation') {
    throw new Error('Mission não pode entrar em correção no status atual')
  }

  return {
    ...mission,
    status: 'correction',
  }
}

export function retryMissionCorrection(existingMissions, missionId) {
  const { mission, missionsById } = getMissionForTransition(
    existingMissions,
    missionId,
  )

  if (mission.status !== 'correction') {
    throw new Error('Mission não pode reexecutar correção no status atual')
  }

  assertMissionDependenciesCompleted(mission, missionsById)

  return {
    ...mission,
    status: 'running',
  }
}

export function prepareMissionExecution(existingMissions, missionId) {
  const { mission } = getMissionForTransition(existingMissions, missionId)

  if (mission.status === 'pending') {
    return startMission(existingMissions, missionId)
  }

  if (mission.status === 'failed') {
    return retryMission(existingMissions, missionId)
  }

  if (mission.status === 'correction') {
    return retryMissionCorrection(existingMissions, missionId)
  }

  throw new Error('Mission não pode ser executada no status atual')
}

export function getMissionById(existingMissions, missionId) {
  return getMissionForTransition(existingMissions, missionId).mission
}

export function listReadyMissions(existingMissions) {
  validateExistingMissions(existingMissions)

  return existingMissions.filter(
    (mission) => isMissionReady(mission, existingMissions),
  )
}
