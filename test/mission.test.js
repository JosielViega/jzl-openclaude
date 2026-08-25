import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  completeMission,
  createMission,
  failMission,
  getMissionById,
  isMissionReady,
  listReadyMissions,
  prepareMissionExecution,
  requestMissionCorrection,
  retryMission,
  retryMissionCorrection,
  startMission,
  submitMissionForValidation,
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
  for (const status of [
    'pending',
    'running',
    'validation',
    'completed',
    'failed',
    'correction',
  ]) {
    assert.strictEqual(
      validateMission(createValidMission({ status })).status,
      status,
    )
  }

  for (const status of ['ready', 'unknown']) {
    assert.throws(
      () => validateMission(createValidMission({ status })),
      { message: 'status da Mission não é suportado' },
    )
  }
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
    acceptanceCriteria: [],
  })
  assert.deepEqual(Object.keys(mission), [
    'id',
    'title',
    'objective',
    'status',
    'dependencies',
    'acceptanceCriteria',
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

test('aceita Mission legacy e valida acceptanceCriteria quando presente', () => {
  const legacy = createValidMission()
  assert.equal(Object.hasOwn(legacy, 'acceptanceCriteria'), false)
  assert.strictEqual(validateMission(legacy), legacy)
  const withCriteria = createValidMission({ acceptanceCriteria: [{
    id: 'criterion-0001', type: 'file-exists', path: 'index.html',
  }] })
  assert.strictEqual(validateMission(withCriteria), withCriteria)
  assert.throws(
    () => validateMission(createValidMission({ acceptanceCriteria: [{}] })),
    { message: 'id do acceptance criterion é inválido' },
  )
})

test('cria criteria canônicos e transitions os preservam', () => {
  const inputs = [{ type: 'file-contains', path: 'index.html', text: 'AFTER' }]
  const snapshot = structuredClone(inputs)
  const pending = createMission([], {
    title: 'Atualizar', objective: 'Trocar marcador', acceptanceCriteria: inputs,
  })
  assert.deepEqual(pending.acceptanceCriteria, [{
    id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER',
  }])
  const running = startMission([pending], pending.id)
  const validation = submitMissionForValidation([running], running.id)
  const correction = requestMissionCorrection([validation], validation.id)
  const retried = retryMissionCorrection([correction], correction.id)
  const failed = failMission([retried], retried.id)
  const retriedFailure = retryMission([failed], failed.id)
  const validationAgain = submitMissionForValidation([retriedFailure], retriedFailure.id)
  const completed = completeMission([validationAgain], validationAgain.id)
  for (const mission of [running, validation, correction, retried, failed, retriedFailure, completed]) {
    assert.deepEqual(mission.acceptanceCriteria, pending.acceptanceCriteria)
  }
  assert.deepEqual(inputs, snapshot)
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

test('inicia Mission pronta sem mutar a original', () => {
  const metadata = { keep: true }
  const mission = createValidMission({ metadata })
  const existingMissions = [mission]

  const runningMission = startMission(existingMissions, 'mission-0001')

  assert.equal(runningMission.status, 'running')
  assert.notStrictEqual(runningMission, mission)
  assert.equal(mission.status, 'pending')
  assert.deepEqual(existingMissions, [mission])
  assert.strictEqual(runningMission.dependencies, mission.dependencies)
  assert.strictEqual(runningMission.metadata, metadata)
})

test('não inicia Mission com dependência pending', () => {
  const dependency = createValidMission()
  const mission = createValidMission({
    id: 'mission-0002',
    dependencies: ['mission-0001'],
  })
  const existingMissions = [dependency, mission]
  const originalMissions = structuredClone(existingMissions)

  assert.throws(
    () => startMission(existingMissions, 'mission-0002'),
    { message: 'Mission não está pronta para iniciar' },
  )
  assert.deepEqual(existingMissions, originalMissions)
})

test('inicia Mission quando dependência está completed', () => {
  const dependency = createValidMission({ status: 'completed' })
  const mission = createValidMission({
    id: 'mission-0002',
    dependencies: ['mission-0001'],
  })

  const runningMission = startMission([dependency, mission], 'mission-0002')

  assert.equal(runningMission.status, 'running')
  assert.equal(dependency.status, 'completed')
  assert.equal(mission.status, 'pending')
})

test('rejeita início fora do status pending', () => {
  for (const status of ['running', 'validation', 'completed']) {
    const mission = createValidMission({ status })

    assert.throws(
      () => startMission([mission], mission.id),
      { message: 'Mission não pode ser iniciada no status atual' },
    )
  }
})

test('envia Mission running para validação sem mutar a original', () => {
  const metadata = { keep: true }
  const mission = createValidMission({ status: 'running', metadata })

  const validationMission = submitMissionForValidation([mission], mission.id)

  assert.equal(validationMission.status, 'validation')
  assert.notStrictEqual(validationMission, mission)
  assert.equal(mission.status, 'running')
  assert.strictEqual(validationMission.dependencies, mission.dependencies)
  assert.strictEqual(validationMission.metadata, metadata)
})

test('rejeita validação fora do status running', () => {
  for (const status of ['pending', 'validation', 'completed']) {
    const mission = createValidMission({ status })

    assert.throws(
      () => submitMissionForValidation([mission], mission.id),
      { message: 'Mission não pode entrar em validação no status atual' },
    )
  }
})

test('conclui Mission em validação sem mutar a original', () => {
  const metadata = { keep: true }
  const mission = createValidMission({ status: 'validation', metadata })

  const completedMission = completeMission([mission], mission.id)

  assert.equal(completedMission.status, 'completed')
  assert.notStrictEqual(completedMission, mission)
  assert.equal(mission.status, 'validation')
  assert.strictEqual(completedMission.dependencies, mission.dependencies)
  assert.strictEqual(completedMission.metadata, metadata)
})

test('rejeita conclusão fora do status validation', () => {
  for (const status of ['pending', 'running', 'completed']) {
    const mission = createValidMission({ status })

    assert.throws(
      () => completeMission([mission], mission.id),
      { message: 'Mission não pode ser concluída no status atual' },
    )
  }
})

test('executa lifecycle puro completo preservando dados e estados anteriores', () => {
  const metadata = { keep: true }
  const pendingMission = createValidMission({ metadata })

  const runningMission = startMission([pendingMission], pendingMission.id)
  const validationMission = submitMissionForValidation(
    [runningMission],
    runningMission.id,
  )
  const completedMission = completeMission(
    [validationMission],
    validationMission.id,
  )

  assert.deepEqual(
    [pendingMission.status, runningMission.status, validationMission.status, completedMission.status],
    ['pending', 'running', 'validation', 'completed'],
  )
  assert.notStrictEqual(runningMission, pendingMission)
  assert.notStrictEqual(validationMission, runningMission)
  assert.notStrictEqual(completedMission, validationMission)
  assert.strictEqual(completedMission.dependencies, pendingMission.dependencies)
  assert.strictEqual(completedMission.metadata, metadata)
})

test('transições rejeitam dependência inexistente', () => {
  const transitions = [
    [startMission, 'pending'],
    [submitMissionForValidation, 'running'],
    [completeMission, 'validation'],
  ]

  for (const [transition, status] of transitions) {
    const mission = createValidMission({
      id: 'mission-0002',
      status,
      dependencies: ['mission-9999'],
    })

    assert.throws(
      () => transition([mission], mission.id),
      { message: 'dependência da Mission não existe' },
    )
  }
})

test('valida missionId e existência do alvo nas transições', () => {
  const pendingMission = createValidMission()

  assert.throws(
    () => startMission([pendingMission], 'mission-9999'),
    { message: 'Mission não existe' },
  )
  assert.throws(
    () => submitMissionForValidation([pendingMission]),
    { message: 'missionId é obrigatório' },
  )
  assert.throws(
    () => completeMission([pendingMission], 'mission-1'),
    { message: 'missionId é inválido' },
  )
})

test('lista Missions prontas sem persistir ou mutar estado', () => {
  const missionA = createValidMission()
  const missionB = createValidMission({
    id: 'mission-0002',
    dependencies: ['mission-0001'],
  })
  const missionC = createValidMission({
    id: 'mission-0003',
    status: 'running',
  })
  const missionD = createValidMission({
    id: 'mission-0004',
    status: 'validation',
  })
  const missionE = createValidMission({
    id: 'mission-0005',
    status: 'completed',
  })
  const missionF = createValidMission({
    id: 'mission-0006',
    status: 'failed',
  })
  const missionG = createValidMission({
    id: 'mission-0007',
    status: 'correction',
  })
  const initialMissions = [
    missionA,
    missionB,
    missionC,
    missionD,
    missionE,
    missionF,
    missionG,
  ]
  const initialSnapshot = structuredClone(initialMissions)

  const initiallyReady = listReadyMissions(initialMissions)

  assert.deepEqual(initiallyReady, [missionA])
  assert.notStrictEqual(initiallyReady, initialMissions)
  assert.strictEqual(initiallyReady[0], missionA)
  assert.deepEqual(initialMissions, initialSnapshot)

  const completedA = { ...missionA, status: 'completed' }
  const updatedMissions = [
    completedA,
    missionB,
    missionC,
    missionD,
    missionE,
    missionF,
    missionG,
  ]
  const updatedSnapshot = structuredClone(updatedMissions)
  const subsequentlyReady = listReadyMissions(updatedMissions)

  assert.deepEqual(subsequentlyReady, [missionB])
  assert.strictEqual(subsequentlyReady[0], missionB)
  assert.deepEqual(updatedMissions, updatedSnapshot)
})

test('falha Mission running sem mutar a original', () => {
  const metadata = { keep: true }
  const mission = createValidMission({ status: 'running', metadata })

  const failedMission = failMission([mission], mission.id)

  assert.equal(failedMission.status, 'failed')
  assert.notStrictEqual(failedMission, mission)
  assert.equal(mission.status, 'running')
  assert.strictEqual(failedMission.dependencies, mission.dependencies)
  assert.strictEqual(failedMission.metadata, metadata)
})

test('rejeita falha fora do status running', () => {
  for (const status of [
    'pending',
    'validation',
    'failed',
    'correction',
    'completed',
  ]) {
    const mission = createValidMission({ status })

    assert.throws(
      () => failMission([mission], mission.id),
      { message: 'Mission não pode falhar no status atual' },
    )
  }
})

test('reexecuta Mission failed quando dependências continuam completed', () => {
  const dependency = createValidMission({ status: 'completed' })
  const metadata = { keep: true }
  const mission = createValidMission({
    id: 'mission-0002',
    status: 'failed',
    dependencies: ['mission-0001'],
    metadata,
  })

  const runningMission = retryMission([dependency, mission], mission.id)

  assert.equal(runningMission.status, 'running')
  assert.notStrictEqual(runningMission, mission)
  assert.equal(mission.status, 'failed')
  assert.strictEqual(runningMission.dependencies, mission.dependencies)
  assert.strictEqual(runningMission.metadata, metadata)
})

test('rejeita retry técnico fora do status failed', () => {
  for (const status of [
    'pending',
    'running',
    'validation',
    'correction',
    'completed',
  ]) {
    const mission = createValidMission({ status })

    assert.throws(
      () => retryMission([mission], mission.id),
      { message: 'Mission não pode ser reexecutada no status atual' },
    )
  }
})

test('retry técnico exige dependências completed', () => {
  const dependency = createValidMission()
  const mission = createValidMission({
    id: 'mission-0002',
    status: 'failed',
    dependencies: ['mission-0001'],
  })

  assert.throws(
    () => retryMission([dependency, mission], mission.id),
    { message: 'Mission não está pronta para nova execução' },
  )
})

test('solicita correção de Mission em validation', () => {
  const metadata = { keep: true }
  const mission = createValidMission({ status: 'validation', metadata })

  const correctionMission = requestMissionCorrection([mission], mission.id)

  assert.equal(correctionMission.status, 'correction')
  assert.notStrictEqual(correctionMission, mission)
  assert.equal(mission.status, 'validation')
  assert.strictEqual(correctionMission.dependencies, mission.dependencies)
  assert.strictEqual(correctionMission.metadata, metadata)
})

test('rejeita solicitação de correção fora do status validation', () => {
  for (const status of [
    'pending',
    'running',
    'failed',
    'correction',
    'completed',
  ]) {
    const mission = createValidMission({ status })

    assert.throws(
      () => requestMissionCorrection([mission], mission.id),
      { message: 'Mission não pode entrar em correção no status atual' },
    )
  }
})

test('reexecuta correção quando dependências continuam completed', () => {
  const dependency = createValidMission({ status: 'completed' })
  const metadata = { keep: true }
  const mission = createValidMission({
    id: 'mission-0002',
    status: 'correction',
    dependencies: ['mission-0001'],
    metadata,
  })

  const runningMission = retryMissionCorrection(
    [dependency, mission],
    mission.id,
  )

  assert.equal(runningMission.status, 'running')
  assert.notStrictEqual(runningMission, mission)
  assert.equal(mission.status, 'correction')
  assert.strictEqual(runningMission.dependencies, mission.dependencies)
  assert.strictEqual(runningMission.metadata, metadata)
})

test('rejeita retry de correção fora do status correction', () => {
  for (const status of [
    'pending',
    'running',
    'validation',
    'failed',
    'completed',
  ]) {
    const mission = createValidMission({ status })

    assert.throws(
      () => retryMissionCorrection([mission], mission.id),
      { message: 'Mission não pode reexecutar correção no status atual' },
    )
  }
})

test('retry de correção exige dependências completed', () => {
  const dependency = createValidMission({ status: 'failed' })
  const mission = createValidMission({
    id: 'mission-0002',
    status: 'correction',
    dependencies: ['mission-0001'],
  })

  assert.throws(
    () => retryMissionCorrection([dependency, mission], mission.id),
    { message: 'Mission não está pronta para nova execução' },
  )
})

test('executa lifecycle técnico completo sem mutação ou perda de campos', () => {
  const metadata = { keep: true }
  const pending = createValidMission({ metadata })
  const running = startMission([pending], pending.id)
  const failed = failMission([running], running.id)
  const retried = retryMission([failed], failed.id)
  const validation = submitMissionForValidation([retried], retried.id)
  const completed = completeMission([validation], validation.id)
  const lifecycle = [pending, running, failed, retried, validation, completed]

  assert.deepEqual(
    lifecycle.map((mission) => mission.status),
    ['pending', 'running', 'failed', 'running', 'validation', 'completed'],
  )

  for (let index = 1; index < lifecycle.length; index += 1) {
    assert.notStrictEqual(lifecycle[index], lifecycle[index - 1])
    assert.strictEqual(lifecycle[index].dependencies, pending.dependencies)
    assert.strictEqual(lifecycle[index].metadata, metadata)
  }
})

test('executa lifecycle de correção completo sem mutação', () => {
  const metadata = { keep: true }
  const pending = createValidMission({ metadata })
  const running = startMission([pending], pending.id)
  const validation = submitMissionForValidation([running], running.id)
  const correction = requestMissionCorrection([validation], validation.id)
  const retried = retryMissionCorrection([correction], correction.id)
  const revalidation = submitMissionForValidation([retried], retried.id)
  const completed = completeMission([revalidation], revalidation.id)
  const lifecycle = [
    pending,
    running,
    validation,
    correction,
    retried,
    revalidation,
    completed,
  ]

  assert.deepEqual(
    lifecycle.map((mission) => mission.status),
    [
      'pending',
      'running',
      'validation',
      'correction',
      'running',
      'validation',
      'completed',
    ],
  )

  for (let index = 1; index < lifecycle.length; index += 1) {
    assert.notStrictEqual(lifecycle[index], lifecycle[index - 1])
    assert.strictEqual(lifecycle[index].metadata, metadata)
  }
})

test('dependências failed e correction não liberam Mission dependente', () => {
  const dependent = createValidMission({
    id: 'mission-0002',
    dependencies: ['mission-0001'],
  })

  for (const status of ['failed', 'correction']) {
    const dependency = createValidMission({ status })

    assert.equal(isMissionReady(dependent, [dependency]), false)
    assert.deepEqual(listReadyMissions([dependency, dependent]), [])
  }
})

test('prepara execução de Mission pending pronta sem mutação', () => {
  const metadata = { keep: true }
  const mission = createValidMission({ metadata })

  const runningMission = prepareMissionExecution([mission], mission.id)

  assert.equal(runningMission.status, 'running')
  assert.notStrictEqual(runningMission, mission)
  assert.equal(mission.status, 'pending')
  assert.strictEqual(runningMission.dependencies, mission.dependencies)
  assert.strictEqual(runningMission.metadata, metadata)
})

test('prepara execução de Mission failed e correction', () => {
  for (const status of ['failed', 'correction']) {
    const dependency = createValidMission({ status: 'completed' })
    const mission = createValidMission({
      id: 'mission-0002',
      status,
      dependencies: ['mission-0001'],
    })

    const runningMission = prepareMissionExecution(
      [dependency, mission],
      mission.id,
    )

    assert.equal(runningMission.status, 'running')
    assert.notStrictEqual(runningMission, mission)
    assert.equal(mission.status, status)
  }
})

test('preparação rejeita statuses não executáveis', () => {
  for (const status of ['running', 'validation', 'completed']) {
    const mission = createValidMission({ status })

    assert.throws(
      () => prepareMissionExecution([mission], mission.id),
      { message: 'Mission não pode ser executada no status atual' },
    )
  }
})

test('preparação falha fechada quando dependency não está completed', () => {
  const dependency = createValidMission()

  for (const status of ['pending', 'failed', 'correction']) {
    const mission = createValidMission({
      id: 'mission-0002',
      status,
      dependencies: ['mission-0001'],
    })

    assert.throws(
      () => prepareMissionExecution([dependency, mission], mission.id),
      /Mission não está pronta/,
    )
    assert.equal(mission.status, status)
  }
})

test('consulta Mission existente pela mesma referência sem mutação', () => {
  const mission = createValidMission()
  const existingMissions = [mission]
  const snapshot = structuredClone(existingMissions)

  assert.strictEqual(getMissionById(existingMissions, mission.id), mission)
  assert.deepEqual(existingMissions, snapshot)
})

test('consulta de Mission valida coleção, alvo e dependências', () => {
  const mission = createValidMission()
  const missingDependency = createValidMission({
    id: 'mission-0002',
    dependencies: ['mission-9999'],
  })

  assert.throws(
    () => getMissionById([mission], 'mission-9999'),
    { message: 'Mission não existe' },
  )
  assert.throws(
    () => getMissionById([mission, { ...mission }], mission.id),
    { message: 'ids das Missions existentes não podem ser duplicados' },
  )
  assert.throws(
    () => getMissionById([missingDependency], missingDependency.id),
    { message: 'dependência da Mission não existe' },
  )
})
