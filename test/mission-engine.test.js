import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  completeProjectMission,
  createProjectMission,
  failProjectMission,
  listReadyProjectMissions,
  prepareProjectMissionExecution,
  requestProjectMissionCorrection,
  retryProjectMission,
  retryProjectMissionCorrection,
  startProjectMission,
  submitProjectMissionForValidation,
} from '../src/mission-engine.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

function createTemporaryProject(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-mission-engine-'))

  t.after(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  return {
    context: createProjectContext(projectRoot),
    projectRoot,
  }
}

function createExistingMission(id, overrides = {}) {
  return {
    id,
    title: `Mission ${id}`,
    objective: `Executar ${id}`,
    status: 'pending',
    dependencies: [],
    ...overrides,
  }
}

test('persiste a primeira Mission do projeto', (t) => {
  const { context } = createTemporaryProject(t)
  const expectedMission = {
    id: 'mission-0001',
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
    status: 'pending',
    dependencies: [],
  }

  initializeProjectStateStore(context)

  const mission = createProjectMission(context, {
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
  })

  assert.deepEqual(mission, expectedMission)
  assert.deepEqual(readProjectStateStore(context), {
    schemaVersion: 1,
    missions: [expectedMission],
  })
})

test('persiste a segunda Mission com o próximo id', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  const first = createProjectMission(context, {
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
  })
  const second = createProjectMission(context, {
    title: 'Segunda',
    objective: 'Executar segunda tarefa',
  })

  assert.equal(second.id, 'mission-0002')
  assert.deepEqual(
    readProjectStateStore(context).missions.map((mission) => mission.id),
    [first.id, second.id],
  )
})

test('persiste dependência e preserva a Mission existente', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  const first = createProjectMission(context, {
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
  })
  const second = createProjectMission(context, {
    title: 'Segunda',
    objective: 'Executar segunda tarefa',
    dependencies: ['mission-0001'],
  })
  const state = readProjectStateStore(context)

  assert.equal(second.id, 'mission-0002')
  assert.deepEqual(second.dependencies, ['mission-0001'])
  assert.deepEqual(state.missions[0], first)
  assert.deepEqual(state.missions[1], second)
})

test('dependência inexistente não altera o estado', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)

  assert.throws(
    () => createProjectMission(context, {
      title: 'Inválida',
      objective: 'Não persistir',
      dependencies: ['mission-9999'],
    }),
    { message: 'dependência da Mission não existe' },
  )

  const state = readProjectStateStore(context)

  assert.deepEqual(state, { schemaVersion: 1 })
  assert.equal(Object.hasOwn(state, 'missions'), false)
})

test('preserva campos aditivos do estado', (t) => {
  const { context } = createTemporaryProject(t)
  const customField = { keep: true }

  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    customField,
  })

  const mission = createProjectMission(context, {
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
  })
  const state = readProjectStateStore(context)

  assert.deepEqual(state.customField, customField)
  assert.deepEqual(state.missions, [mission])
})

test('preserva Missions já presentes ao criar outra', (t) => {
  const { context } = createTemporaryProject(t)
  const existingMission = createExistingMission('mission-0001', {
    title: 'Existente',
    objective: 'Preservar',
  })
  const originalMission = structuredClone(existingMission)

  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [existingMission],
  })

  const createdMission = createProjectMission(context, {
    title: 'Nova',
    objective: 'Adicionar sem mutar',
  })
  const state = readProjectStateStore(context)

  assert.equal(createdMission.id, 'mission-0002')
  assert.deepEqual(state.missions[0], originalMission)
  assert.deepEqual(state.missions[1], createdMission)
})

test('rejeita missions do estado com tipo inválido sem reescrever', (t) => {
  const { context, projectRoot } = createTemporaryProject(t)
  const statePath = join(projectRoot, '.jzl', 'state.json')

  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: {},
  })
  const originalContent = readFileSync(statePath, 'utf8')

  assert.throws(
    () => createProjectMission(context, {
      title: 'Inválida',
      objective: 'Não persistir',
    }),
    { message: 'missions do estado do projeto deve ser um array' },
  )
  assert.equal(readFileSync(statePath, 'utf8'), originalContent)
})

test('rejeita State Store não inicializado sem criar diretório', (t) => {
  const { context, projectRoot } = createTemporaryProject(t)

  assert.throws(
    () => createProjectMission(context, {
      title: 'Primeira',
      objective: 'Executar primeira tarefa',
    }),
    { message: 'arquivo de estado do projeto não existe' },
  )
  assert.equal(existsSync(join(projectRoot, '.jzl')), false)
})

test('não reutiliza gaps de IDs persistidos', (t) => {
  const { context } = createTemporaryProject(t)
  const first = createExistingMission('mission-0001')
  const third = createExistingMission('mission-0003')

  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [first, third],
  })

  const createdMission = createProjectMission(context, {
    title: 'Depois do gap',
    objective: 'Usar o maior id',
  })

  assert.equal(createdMission.id, 'mission-0004')
  assert.deepEqual(
    readProjectStateStore(context).missions.map((mission) => mission.id),
    ['mission-0001', 'mission-0003', 'mission-0004'],
  )
})

test('lista vazio para projeto sem Missions sem persistir ready', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)

  assert.deepEqual(listReadyProjectMissions(context), [])
  assert.deepEqual(readProjectStateStore(context), { schemaVersion: 1 })
})

test('lista somente Mission pronta quando há dependência pending', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })
  createProjectMission(context, {
    title: 'B',
    objective: 'Executar B',
    dependencies: ['mission-0001'],
  })

  assert.deepEqual(
    listReadyProjectMissions(context).map((mission) => mission.id),
    ['mission-0001'],
  )
})

test('persiste lifecycle completo e libera dependente somente após conclusão', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })
  createProjectMission(context, {
    title: 'B',
    objective: 'Executar B',
    dependencies: ['mission-0001'],
  })

  assert.deepEqual(
    listReadyProjectMissions(context).map((mission) => mission.id),
    ['mission-0001'],
  )

  const runningMission = startProjectMission(context, 'mission-0001')

  assert.equal(runningMission.status, 'running')
  assert.equal(readProjectStateStore(context).missions[0].status, 'running')
  assert.deepEqual(listReadyProjectMissions(context), [])

  const validationMission = submitProjectMissionForValidation(
    context,
    'mission-0001',
  )

  assert.equal(validationMission.status, 'validation')
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  assert.deepEqual(listReadyProjectMissions(context), [])

  const completedMission = completeProjectMission(context, 'mission-0001')
  const state = readProjectStateStore(context)

  assert.equal(completedMission.status, 'completed')
  assert.deepEqual(
    listReadyProjectMissions(context).map((mission) => mission.id),
    ['mission-0002'],
  )
  assert.deepEqual(
    state.missions.map((mission) => mission.status),
    ['completed', 'pending'],
  )
  assert.equal(state.missions.some((mission) => mission.status === 'ready'), false)

  for (const field of ['ready', 'readyMissions', 'currentMission', 'nextMission']) {
    assert.equal(Object.hasOwn(state, field), false)
  }
})

test('não inicia Mission bloqueada por dependência pending', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })
  createProjectMission(context, {
    title: 'B',
    objective: 'Executar B',
    dependencies: ['mission-0001'],
  })

  assert.throws(
    () => startProjectMission(context, 'mission-0002'),
    { message: 'Mission não está pronta para iniciar' },
  )
  assert.deepEqual(
    readProjectStateStore(context).missions.map((mission) => mission.status),
    ['pending', 'pending'],
  )
})

test('rejeita transições repetidas sem alterar estado', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })
  startProjectMission(context, 'mission-0001')
  const runningState = readProjectStateStore(context)

  assert.throws(
    () => startProjectMission(context, 'mission-0001'),
    { message: 'Mission não pode ser iniciada no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), runningState)

  submitProjectMissionForValidation(context, 'mission-0001')
  const validationState = readProjectStateStore(context)

  assert.throws(
    () => submitProjectMissionForValidation(context, 'mission-0001'),
    { message: 'Mission não pode entrar em validação no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), validationState)

  completeProjectMission(context, 'mission-0001')
  const completedState = readProjectStateStore(context)

  assert.throws(
    () => completeProjectMission(context, 'mission-0001'),
    { message: 'Mission não pode ser concluída no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), completedState)
})

test('rejeita avanço direto sem alterar o estado persistido', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })
  const pendingState = readProjectStateStore(context)

  assert.throws(
    () => submitProjectMissionForValidation(context, 'mission-0001'),
    { message: 'Mission não pode entrar em validação no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), pendingState)

  assert.throws(
    () => completeProjectMission(context, 'mission-0001'),
    { message: 'Mission não pode ser concluída no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), pendingState)

  startProjectMission(context, 'mission-0001')
  const runningState = readProjectStateStore(context)

  assert.throws(
    () => completeProjectMission(context, 'mission-0001'),
    { message: 'Mission não pode ser concluída no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), runningState)
})

test('Mission inexistente nas novas operações não altera estado', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  const mission = createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })
  const persistedState = readProjectStateStore(context)

  for (const transition of [
    startProjectMission,
    submitProjectMissionForValidation,
    completeProjectMission,
    failProjectMission,
    retryProjectMission,
    requestProjectMissionCorrection,
    retryProjectMissionCorrection,
  ]) {
    assert.throws(
      () => transition(context, 'mission-9999'),
      { message: 'Mission não existe' },
    )
    assert.deepEqual(readProjectStateStore(context), persistedState)
  }

  assert.deepEqual(readProjectStateStore(context).missions, [mission])
})

test('lifecycle preserva campos aditivos do estado e da Mission', (t) => {
  const { context } = createTemporaryProject(t)
  const customField = { keep: true }
  const metadata = { keep: true }
  const mission = {
    id: 'mission-0001',
    title: 'Primeira',
    objective: 'Concluir',
    status: 'pending',
    dependencies: [],
    metadata,
  }

  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    customField,
    missions: [mission],
  })

  const runningMission = startProjectMission(context, 'mission-0001')
  const validationMission = submitProjectMissionForValidation(
    context,
    'mission-0001',
  )
  const completedMission = completeProjectMission(context, 'mission-0001')
  const state = readProjectStateStore(context)

  assert.deepEqual(state.customField, customField)
  assert.deepEqual(runningMission.metadata, metadata)
  assert.deepEqual(validationMission.metadata, metadata)
  assert.deepEqual(completedMission.metadata, metadata)
  assert.deepEqual(state.missions[0], {
    ...mission,
    status: 'completed',
  })
  assert.deepEqual(listReadyProjectMissions(context), [])
})

function assertReadyContract(context, expectedIds) {
  const state = readProjectStateStore(context)

  assert.deepEqual(
    listReadyProjectMissions(context).map((mission) => mission.id),
    expectedIds,
  )
  assert.equal(state.missions.some((mission) => mission.status === 'ready'), false)

  for (const field of ['ready', 'readyMissions', 'currentMission', 'nextMission']) {
    assert.equal(Object.hasOwn(state, field), false)
  }
}

test('persiste falha técnica e libera dependente somente após recuperação completa', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'Executar A' })
  createProjectMission(context, {
    title: 'B',
    objective: 'Executar B',
    dependencies: ['mission-0001'],
  })

  assertReadyContract(context, ['mission-0001'])

  assert.equal(startProjectMission(context, 'mission-0001').status, 'running')
  assert.equal(readProjectStateStore(context).missions[0].status, 'running')
  assertReadyContract(context, [])

  assert.equal(failProjectMission(context, 'mission-0001').status, 'failed')
  assert.deepEqual(
    readProjectStateStore(context).missions.map((mission) => mission.status),
    ['failed', 'pending'],
  )
  assertReadyContract(context, [])

  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  assertReadyContract(context, [])
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')

  assert.equal(retryProjectMission(context, 'mission-0001').status, 'running')
  assert.equal(readProjectStateStore(context).missions[0].status, 'running')
  assertReadyContract(context, [])

  assert.equal(
    submitProjectMissionForValidation(context, 'mission-0001').status,
    'validation',
  )
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  assertReadyContract(context, [])

  assert.equal(completeProjectMission(context, 'mission-0001').status, 'completed')
  assert.equal(readProjectStateStore(context).missions[0].status, 'completed')
  assertReadyContract(context, ['mission-0002'])
})

test('persiste correção e mantém dependente bloqueada até completed', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'Executar A' })
  createProjectMission(context, {
    title: 'B',
    objective: 'Executar B',
    dependencies: ['mission-0001'],
  })

  startProjectMission(context, 'mission-0001')
  submitProjectMissionForValidation(context, 'mission-0001')
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')

  assert.equal(
    requestProjectMissionCorrection(context, 'mission-0001').status,
    'correction',
  )
  assert.deepEqual(
    readProjectStateStore(context).missions.map((mission) => mission.status),
    ['correction', 'pending'],
  )
  assertReadyContract(context, [])

  assert.equal(readProjectStateStore(context).missions[0].status, 'correction')
  assertReadyContract(context, [])
  assert.equal(readProjectStateStore(context).missions[0].status, 'correction')

  assert.equal(
    retryProjectMissionCorrection(context, 'mission-0001').status,
    'running',
  )
  assert.equal(readProjectStateStore(context).missions[0].status, 'running')
  assertReadyContract(context, [])

  submitProjectMissionForValidation(context, 'mission-0001')
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  assertReadyContract(context, [])

  completeProjectMission(context, 'mission-0001')
  assert.equal(readProjectStateStore(context).missions[0].status, 'completed')
  assertReadyContract(context, ['mission-0002'])
})

test('novas transições inválidas preservam o State Store', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'Executar A' })
  const pendingState = readProjectStateStore(context)

  for (const [transition, message] of [
    [failProjectMission, 'Mission não pode falhar no status atual'],
    [retryProjectMission, 'Mission não pode ser reexecutada no status atual'],
  ]) {
    assert.throws(
      () => transition(context, 'mission-0001'),
      { message },
    )
    assert.deepEqual(readProjectStateStore(context), pendingState)
  }

  startProjectMission(context, 'mission-0001')
  const runningState = readProjectStateStore(context)

  assert.throws(
    () => requestProjectMissionCorrection(context, 'mission-0001'),
    { message: 'Mission não pode entrar em correção no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), runningState)

  submitProjectMissionForValidation(context, 'mission-0001')
  const validationState = readProjectStateStore(context)

  assert.throws(
    () => retryProjectMissionCorrection(context, 'mission-0001'),
    { message: 'Mission não pode reexecutar correção no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), validationState)
})

test('falha e correção preservam campos aditivos em todo o lifecycle', (t) => {
  const { context } = createTemporaryProject(t)
  const customField = { keep: true }
  const metadata = { keep: true }
  const mission = createExistingMission('mission-0001', { metadata })

  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    customField,
    missions: [mission],
  })

  const transitions = [
    startProjectMission,
    failProjectMission,
    retryProjectMission,
    submitProjectMissionForValidation,
    requestProjectMissionCorrection,
    retryProjectMissionCorrection,
    submitProjectMissionForValidation,
    completeProjectMission,
  ]

  for (const transition of transitions) {
    const transitionedMission = transition(context, 'mission-0001')
    const state = readProjectStateStore(context)

    assert.deepEqual(transitionedMission.metadata, metadata)
    assert.deepEqual(state.missions[0].metadata, metadata)
    assert.deepEqual(state.customField, customField)
    assertReadyContract(context, [])
  }

  assert.equal(readProjectStateStore(context).missions[0].status, 'completed')
})

test('prepara execução persistida a partir de pending, failed e correction', (t) => {
  for (const status of ['pending', 'failed', 'correction']) {
    const { context } = createTemporaryProject(t)
    const mission = createExistingMission('mission-0001', { status })

    initializeProjectStateStore(context)
    writeProjectStateStore(context, {
      schemaVersion: 1,
      missions: [mission],
    })

    const runningMission = prepareProjectMissionExecution(
      context,
      mission.id,
    )

    assert.equal(runningMission.status, 'running')
    assert.equal(readProjectStateStore(context).missions[0].status, 'running')
  }
})

test('preparação inválida não reescreve o State Store', (t) => {
  for (const status of ['running', 'validation', 'completed']) {
    const { context, projectRoot } = createTemporaryProject(t)
    const mission = createExistingMission('mission-0001', { status })
    const statePath = join(projectRoot, '.jzl', 'state.json')

    initializeProjectStateStore(context)
    writeProjectStateStore(context, {
      schemaVersion: 1,
      missions: [mission],
    })
    const originalContent = readFileSync(statePath, 'utf8')

    assert.throws(
      () => prepareProjectMissionExecution(context, mission.id),
      { message: 'Mission não pode ser executada no status atual' },
    )
    assert.equal(readFileSync(statePath, 'utf8'), originalContent)
  }
})
