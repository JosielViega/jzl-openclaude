import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { listReadyProjectMissions } from '../src/mission-engine.js'
import { validateProjectMission } from '../src/mission-validation.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

const evidenceFields = [
  'validation',
  'validationResults',
  'stdout',
  'stderr',
  'exitCode',
  'errorMessage',
]

function createTemporaryContext(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-mission-validation-'))

  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))

  return {
    context: createProjectContext(projectRoot),
    projectRoot,
  }
}

function createMission(id, status = 'validation', overrides = {}) {
  return {
    id,
    title: `Mission ${id}`,
    objective: `Validar ${id}`,
    status,
    dependencies: [],
    ...overrides,
  }
}

function createValidator(id, exitCode = 0) {
  return {
    id,
    type: 'command',
    executable: process.execPath,
    args: ['-e', `process.exit(${exitCode})`],
  }
}

function createMissingValidator(projectRoot, id = 'error') {
  return {
    id,
    type: 'command',
    executable: join(projectRoot, 'missing-validator.exe'),
    args: [],
  }
}

function initializeMissions(context, missions, extraState = {}) {
  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    ...extraState,
    missions,
  })
}

function assertEvidenceNotPersisted(state) {
  for (const field of evidenceFields) {
    assert.equal(Object.hasOwn(state, field), false)

    for (const mission of state.missions) {
      assert.equal(Object.hasOwn(mission, field), false)
    }
  }

  assert.equal(state.missions.some((mission) => mission.status === 'ready'), false)

  for (const field of ['ready', 'readyMissions', 'currentMission', 'nextMission']) {
    assert.equal(Object.hasOwn(state, field), false)
  }
}

test('PASS conclui Mission, preserva campos e libera dependente', async (t) => {
  const { context } = createTemporaryContext(t)
  const metadata = { keep: true }
  const customField = { keep: true }
  const missionA = createMission('mission-0001', 'validation', { metadata })
  const missionB = createMission('mission-0002', 'pending', {
    dependencies: ['mission-0001'],
  })

  initializeMissions(context, [missionA, missionB], { customField })
  assert.deepEqual(listReadyProjectMissions(context), [])

  const result = await validateProjectMission(
    context,
    missionA.id,
    [createValidator('pass')],
  )
  const state = readProjectStateStore(context)

  assert.equal(result.validation.status, 'PASS')
  assert.equal(result.mission.status, 'completed')
  assert.equal(state.missions[0].status, 'completed')
  assert.deepEqual(state.missions[0].metadata, metadata)
  assert.deepEqual(state.customField, customField)
  assert.deepEqual(
    listReadyProjectMissions(context).map((mission) => mission.id),
    ['mission-0002'],
  )
  assertEvidenceNotPersisted(state)
})

test('FAIL envia Mission para correction sem liberar dependente', async (t) => {
  const { context } = createTemporaryContext(t)
  const missionA = createMission('mission-0001')
  const missionB = createMission('mission-0002', 'pending', {
    dependencies: ['mission-0001'],
  })

  initializeMissions(context, [missionA, missionB])

  const result = await validateProjectMission(
    context,
    missionA.id,
    [createValidator('fail', 3)],
  )
  const state = readProjectStateStore(context)

  assert.equal(result.validation.status, 'FAIL')
  assert.equal(result.mission.status, 'correction')
  assert.equal(state.missions[0].status, 'correction')
  assert.deepEqual(listReadyProjectMissions(context), [])
  assertEvidenceNotPersisted(state)
})

test('ERROR mantém Mission em validation sem liberar dependente', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const missionA = createMission('mission-0001')
  const missionB = createMission('mission-0002', 'pending', {
    dependencies: ['mission-0001'],
  })

  initializeMissions(context, [missionA, missionB])

  const result = await validateProjectMission(
    context,
    missionA.id,
    [createMissingValidator(projectRoot)],
  )
  const state = readProjectStateStore(context)

  assert.equal(result.validation.status, 'ERROR')
  assert.equal(result.mission.status, 'validation')
  assert.equal(state.missions[0].status, 'validation')
  assert.deepEqual(listReadyProjectMissions(context), [])
  assertEvidenceNotPersisted(state)
})

test('zero validators falha sem alterar Mission validation', async (t) => {
  const { context } = createTemporaryContext(t)
  const mission = createMission('mission-0001')

  initializeMissions(context, [mission])

  await assert.rejects(
    validateProjectMission(context, mission.id, []),
    { message: 'ao menos um validator é obrigatório' },
  )
  assert.deepEqual(readProjectStateStore(context).missions, [mission])
})

test('status incorreto rejeita antes de executar validator', async (t) => {
  for (const status of [
    'pending',
    'running',
    'completed',
    'failed',
    'correction',
  ]) {
    const { context, projectRoot } = createTemporaryContext(t)
    const mission = createMission('mission-0001', status)
    const sentinelPath = join(projectRoot, 'sentinel.txt')
    const script = (
      `import { writeFileSync } from 'node:fs'; `
      + `writeFileSync(${JSON.stringify(sentinelPath)}, 'executed')`
    )
    const validator = {
      id: 'sentinel',
      type: 'command',
      executable: process.execPath,
      args: ['--input-type=module', '-e', script],
    }

    initializeMissions(context, [mission])

    await assert.rejects(
      validateProjectMission(context, mission.id, [validator]),
      { message: 'Mission deve estar validation para validação' },
    )
    assert.equal(existsSync(sentinelPath), false)
    assert.deepEqual(readProjectStateStore(context).missions, [mission])
  }
})

test('Mission e State Store inexistentes falham antes dos processos', async (t) => {
  const initialized = createTemporaryContext(t)

  initializeProjectStateStore(initialized.context)

  await assert.rejects(
    validateProjectMission(
      initialized.context,
      'mission-9999',
      [createValidator('pass')],
    ),
    { message: 'Mission não existe' },
  )

  const missingStore = createTemporaryContext(t)

  await assert.rejects(
    validateProjectMission(
      missingStore.context,
      'mission-0001',
      [createValidator('pass')],
    ),
    { message: 'arquivo de estado do projeto não existe' },
  )
})

test('PASS, FAIL, PASS executam todos e resultam em correction', async (t) => {
  const { context } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  const validators = [
    createValidator('pass-1'),
    createValidator('fail', 1),
    createValidator('pass-2'),
  ]

  initializeMissions(context, [mission])

  const result = await validateProjectMission(context, mission.id, validators)

  assert.equal(result.validation.status, 'FAIL')
  assert.deepEqual(
    result.validation.results.map((item) => item.id),
    ['pass-1', 'fail', 'pass-2'],
  )
  assert.equal(result.mission.status, 'correction')
})

test('ERROR prevalece sobre FAIL e mantém Mission em validation', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  const validators = [
    createValidator('fail', 1),
    createMissingValidator(projectRoot),
    createValidator('pass'),
  ]

  initializeMissions(context, [mission])

  const result = await validateProjectMission(context, mission.id, validators)

  assert.equal(result.validation.status, 'ERROR')
  assert.deepEqual(
    result.validation.results.map((item) => item.id),
    ['fail', 'error', 'pass'],
  )
  assert.equal(result.mission.status, 'validation')
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
})
