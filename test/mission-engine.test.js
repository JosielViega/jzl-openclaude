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
  listReadyProjectMissions,
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

test('concluir dependência libera Mission dependente sem persistir ready', (t) => {
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

  const completedMission = completeProjectMission(context, 'mission-0001')
  const readyMissions = listReadyProjectMissions(context)
  const state = readProjectStateStore(context)

  assert.equal(completedMission.status, 'completed')
  assert.deepEqual(
    readyMissions.map((mission) => mission.id),
    ['mission-0002'],
  )
  assert.equal(state.missions[0].status, 'completed')
  assert.equal(state.missions[1].status, 'pending')
  assert.equal(
    state.missions.some((mission) => mission.status === 'ready'),
    false,
  )

  for (const field of ['ready', 'readyMissions', 'currentMission', 'nextMission']) {
    assert.equal(Object.hasOwn(state, field), false)
  }
})

test('não conclui Mission bloqueada por dependência pending', (t) => {
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
    () => completeProjectMission(context, 'mission-0002'),
    { message: 'Mission não está pronta para conclusão' },
  )
  assert.deepEqual(
    readProjectStateStore(context).missions.map((mission) => mission.status),
    ['pending', 'pending'],
  )
})

test('rejeita segunda conclusão sem alterar estado', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })
  completeProjectMission(context, 'mission-0001')
  const persistedState = readProjectStateStore(context)

  assert.throws(
    () => completeProjectMission(context, 'mission-0001'),
    { message: 'Mission não pode ser concluída no status atual' },
  )
  assert.deepEqual(readProjectStateStore(context), persistedState)
})

test('Mission inexistente não altera estado', (t) => {
  const { context } = createTemporaryProject(t)

  initializeProjectStateStore(context)
  const mission = createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })

  assert.throws(
    () => completeProjectMission(context, 'mission-9999'),
    { message: 'Mission não existe' },
  )
  assert.deepEqual(readProjectStateStore(context).missions, [mission])
})

test('conclusão preserva campos aditivos do estado e da Mission', (t) => {
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

  const completedMission = completeProjectMission(context, 'mission-0001')
  const state = readProjectStateStore(context)

  assert.deepEqual(state.customField, customField)
  assert.deepEqual(completedMission.metadata, metadata)
  assert.deepEqual(state.missions[0], {
    ...mission,
    status: 'completed',
  })
  assert.deepEqual(listReadyProjectMissions(context), [])
})
