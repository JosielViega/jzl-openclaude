import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createMission,
  isMissionReady,
  validateMission,
} from '../src/mission.js'

function createValidMission(overrides = {}) {
  return {
    id: 'mission-0001',
    title: 'Preparar banco',
    objective: 'Criar a estrutura inicial do banco',
    status: 'pending',
    dependencies: [],
    ...overrides,
  }
}

test('valida uma Mission válida sem alterar a referência', () => {
  const mission = createValidMission()

  assert.strictEqual(validateMission(mission), mission)
})

test('rejeita containers inválidos de Mission', () => {
  for (const mission of [null, [], 'mission', 123]) {
    assert.throws(
      () => validateMission(mission),
      { message: 'Mission deve ser um objeto' },
    )
  }
})

test('valida presença e formato do id da Mission', () => {
  const missionWithoutId = createValidMission()
  delete missionWithoutId.id

  assert.throws(
    () => validateMission(missionWithoutId),
    { message: 'id da Mission é obrigatório' },
  )

  for (const id of ['mission-1', 'task-0001', 'Mission-0001', '']) {
    assert.throws(
      () => validateMission(createValidMission({ id })),
      { message: 'id da Mission é inválido' },
    )
  }
})

test('valida title da Mission', () => {
  const missionWithoutTitle = createValidMission()
  delete missionWithoutTitle.title

  assert.throws(
    () => validateMission(missionWithoutTitle),
    { message: 'title da Mission é obrigatório' },
  )
  assert.throws(
    () => validateMission(createValidMission({ title: 123 })),
    { message: 'title da Mission deve ser uma string' },
  )
  assert.throws(
    () => validateMission(createValidMission({ title: '   ' })),
    { message: 'title da Mission não pode ser vazio' },
  )
})

test('valida objective da Mission', () => {
  const missionWithoutObjective = createValidMission()
  delete missionWithoutObjective.objective

  assert.throws(
    () => validateMission(missionWithoutObjective),
    { message: 'objective da Mission é obrigatório' },
  )
  assert.throws(
    () => validateMission(createValidMission({ objective: 123 })),
    { message: 'objective da Mission deve ser uma string' },
  )
  assert.throws(
    () => validateMission(createValidMission({ objective: '   ' })),
    { message: 'objective da Mission não pode ser vazio' },
  )
})

test('valida status suportados da Mission', () => {
  const missionWithoutStatus = createValidMission()
  delete missionWithoutStatus.status

  assert.throws(
    () => validateMission(missionWithoutStatus),
    { message: 'status da Mission é obrigatório' },
  )
  assert.throws(
    () => validateMission(createValidMission({ status: 123 })),
    { message: 'status da Mission deve ser uma string' },
  )
  assert.throws(
    () => validateMission(createValidMission({ status: 'running' })),
    { message: 'status da Mission não é suportado' },
  )
  assert.strictEqual(
    validateMission(createValidMission({ status: 'pending' })).status,
    'pending',
  )
  assert.strictEqual(
    validateMission(createValidMission({ status: 'completed' })).status,
    'completed',
  )
})

test('valida dependencies da Mission', () => {
  const missionWithoutDependencies = createValidMission()
  delete missionWithoutDependencies.dependencies

  assert.throws(
    () => validateMission(missionWithoutDependencies),
    { message: 'dependencies da Mission é obrigatório' },
  )
  assert.throws(
    () => validateMission(createValidMission({ dependencies: 'mission-0002' })),
    { message: 'dependencies da Mission deve ser um array' },
  )
  assert.throws(
    () => validateMission(createValidMission({ dependencies: ['task-0001'] })),
    { message: 'dependência da Mission possui id inválido' },
  )
})

test('rejeita dependência duplicada e auto-dependência', () => {
  assert.throws(
    () => validateMission(createValidMission({
      dependencies: ['mission-0002', 'mission-0002'],
    })),
    { message: 'dependências da Mission não podem ser duplicadas' },
  )
  assert.throws(
    () => validateMission(createValidMission({
      dependencies: ['mission-0001'],
    })),
    { message: 'Mission não pode depender de si mesma' },
  )
})

test('cria a primeira Mission com shape exato', () => {
  const mission = createMission([], {
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
  })

  assert.deepEqual(mission, {
    id: 'mission-0001',
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
    status: 'pending',
    dependencies: [],
  })
  assert.deepEqual(Object.keys(mission), [
    'id',
    'title',
    'objective',
    'status',
    'dependencies',
  ])
})

test('gera id após o maior id existente', () => {
  const existingMissions = [
    createValidMission({ id: 'mission-0001' }),
    createValidMission({ id: 'mission-0003' }),
  ]

  const mission = createMission(existingMissions, {
    title: 'Nova',
    objective: 'Executar nova tarefa',
  })

  assert.equal(mission.id, 'mission-0004')
})

test('criação não muta Missions existentes', () => {
  const first = createValidMission()
  const existingMissions = [first]
  const originalMissions = [...existingMissions]

  createMission(existingMissions, {
    title: 'Nova',
    objective: 'Executar nova tarefa',
  })

  assert.deepEqual(existingMissions, originalMissions)
  assert.equal(existingMissions.length, 1)
  assert.strictEqual(existingMissions[0], first)
})

test('criação copia o array de dependencies', () => {
  const existingMissions = [createValidMission()]
  const dependencies = ['mission-0001']

  const mission = createMission(existingMissions, {
    title: 'Nova',
    objective: 'Executar nova tarefa',
    dependencies,
  })

  assert.deepEqual(mission.dependencies, dependencies)
  assert.notStrictEqual(mission.dependencies, dependencies)

  dependencies.push('mission-0002')

  assert.deepEqual(mission.dependencies, ['mission-0001'])
})

test('cria Mission com dependência existente', () => {
  const existingMissions = [createValidMission()]

  const mission = createMission(existingMissions, {
    title: 'Segunda',
    objective: 'Executar segunda tarefa',
    dependencies: ['mission-0001'],
  })

  assert.deepEqual(mission.dependencies, ['mission-0001'])
  assert.equal(mission.status, 'pending')
})

test('criação rejeita dependência ausente e duplicada', () => {
  const existingMissions = [createValidMission()]
  const input = {
    title: 'Segunda',
    objective: 'Executar segunda tarefa',
  }

  assert.throws(
    () => createMission(existingMissions, {
      ...input,
      dependencies: ['mission-9999'],
    }),
    { message: 'dependência da Mission não existe' },
  )
  assert.throws(
    () => createMission(existingMissions, {
      ...input,
      dependencies: ['mission-0001', 'mission-0001'],
    }),
    { message: 'dependências da Mission não podem ser duplicadas' },
  )
})

test('criação mantém id e status sob controle do JZL', () => {
  const input = {
    title: 'Primeira',
    objective: 'Executar primeira tarefa',
  }

  assert.throws(
    () => createMission([], { ...input, id: 'mission-0001' }),
    { message: 'id da nova Mission é controlado pelo JZL' },
  )
  assert.throws(
    () => createMission([], { ...input, status: 'pending' }),
    { message: 'status inicial da nova Mission é controlado pelo JZL' },
  )
})

test('deriva readiness sem dependências pelo status', () => {
  assert.equal(isMissionReady(createValidMission(), []), true)
  assert.equal(
    isMissionReady(createValidMission({ status: 'completed' }), []),
    false,
  )
})

test('deriva readiness pelo status das dependências', () => {
  const mission = createValidMission({
    id: 'mission-0002',
    dependencies: ['mission-0001'],
  })
  const pendingDependency = createValidMission()
  const completedDependency = createValidMission({ status: 'completed' })

  assert.equal(isMissionReady(mission, [pendingDependency]), false)
  assert.equal(isMissionReady(mission, [completedDependency]), true)
  assert.equal(mission.status, 'pending')
  assert.deepEqual(mission.dependencies, ['mission-0001'])
})

test('readiness rejeita estado inconsistente', () => {
  const missionWithMissingDependency = createValidMission({
    id: 'mission-0002',
    dependencies: ['mission-9999'],
  })
  const mission = createValidMission({ id: 'mission-0002' })
  const duplicate = createValidMission()

  assert.throws(
    () => isMissionReady(missionWithMissingDependency, []),
    { message: 'dependência da Mission não existe' },
  )
  assert.throws(
    () => isMissionReady(mission, [duplicate, { ...duplicate }]),
    { message: 'ids das Missions existentes não podem ser duplicados' },
  )
})
