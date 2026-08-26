import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { initializeProjectConfigStore } from '../src/project-config-store.js'
import { readProjectEventStore } from '../src/project-event-store.js'
import {
  listReadyProjectMissions,
  retryProjectMissionCorrection,
} from '../src/mission-engine.js'
import {
  validateConfiguredProjectMission,
  validateProjectMission,
} from '../src/mission-validation.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'
import { recordMissionExecutionSuccess } from '../src/execution-history.js'
import { resolveMissionCorrectionHandoff } from '../src/handoff-processor.js'
import { buildMissionExecutionContext } from '../src/context-builder.js'
import { buildMissionExecutionPrompt } from '../src/mission-execution-prompt.js'

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

function recordScopedExecution(context, missionId, changeSet) {
  recordMissionExecutionSuccess(context, {
    missionId,
    fromStatus: 'pending',
    execution: {
      sessionId: 'session-scope', result: 'ok', model: 'model-a', changeSet,
    },
  })
}

test('Scope Validator roda primeiro e FAIL envia Mission para correction', async (t) => {
  const { context } = createTemporaryContext(t)
  const mission = createMission('mission-0001', 'validation', {
    changeScope: { allowedPaths: ['index.html'] },
  })
  initializeMissions(context, [mission])
  recordScopedExecution(context, mission.id, {
    created: [], modified: ['config.php', 'index.html'], deleted: [],
  })

  const result = await validateProjectMission(context, mission.id, [])
  assert.equal(result.mission.status, 'correction')
  assert.equal(result.validation.status, 'FAIL')
  assert.equal(result.validation.results[0].id, 'mission-change-scope')
  assert.deepEqual(result.validation.results[0].evidence.violations, ['config.php'])

  const handoff = resolveMissionCorrectionHandoff(context, mission.id)
  assert.deepEqual(handoff.payload.failedValidators[0].evidence.violations, ['config.php'])
  const executionContext = buildMissionExecutionContext(context, {
    mission: retryProjectMissionCorrection(context, mission.id),
    standards: { id: 'test', instructions: ['Preserve o projeto.'] },
    handoff,
  })
  const prompt = buildMissionExecutionPrompt(executionContext)
  assert.match(prompt, /Change Scope determinístico definido pelo JZL/)
  assert.match(prompt, /index\.html/)
  assert.match(prompt, /config\.php/)
})

test('Scope Validator PASS sem prova específica mantém validation', async (t) => {
  const { context } = createTemporaryContext(t)
  const mission = createMission('mission-0001', 'validation', {
    changeScope: { allowedPaths: ['index.html'] },
  })
  initializeMissions(context, [mission])
  recordScopedExecution(context, mission.id, {
    created: [], modified: ['index.html'], deleted: [],
  })
  await assert.rejects(validateProjectMission(context, mission.id, []), {
    message: 'Mission não possui validação específica suficiente para comprovar o objetivo',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  assert.equal(readProjectEventStore(context).events.at(-1).type, 'mission.validation.unavailable')
})

test('scope sem Change Set produz ERROR e mantém Mission validation', async (t) => {
  const { context } = createTemporaryContext(t)
  const mission = createMission('mission-0001', 'validation', {
    changeScope: { allowedPaths: [] },
  })
  initializeMissions(context, [mission])
  const result = await validateProjectMission(context, mission.id, [])
  assert.equal(result.validation.status, 'ERROR')
  assert.equal(result.mission.status, 'validation')
  assert.equal(result.validation.results[0].status, 'ERROR')
})

test('ordena Scope, Acceptance Criteria e validators configurados', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  writeFileSync(join(projectRoot, 'index.html'), '<h1>ok</h1>')
  const mission = createMission('mission-0001', 'validation', {
    changeScope: { allowedPaths: ['index.html'] },
    acceptanceCriteria: [{
      id: 'criterion-0001', type: 'file-exists', path: 'index.html',
    }],
  })
  initializeMissions(context, [mission])
  recordScopedExecution(context, mission.id, {
    created: [], modified: [], deleted: [],
  })

  const result = await validateProjectMission(context, mission.id, [
    createValidator('configured'),
  ])
  assert.deepEqual(
    result.validation.results.map(({ id }) => id),
    ['mission-change-scope', 'criterion-0001', 'configured'],
  )
  assert.equal(result.validation.status, 'PASS')
})

function initializeConfiguredValidation(
  context,
  projectRoot,
  missions,
  { invalidMarker, executable = process.execPath } = {},
) {
  const fakePhpPath = join(projectRoot, 'fake-php.js')
  const markerCheck = invalidMarker === undefined
    ? ''
    : `if (content.includes(${JSON.stringify(invalidMarker)})) process.exit(1);`
  const script = (
    "const fs = require('node:fs'); "
    + "const target = process.argv.at(-1); "
    + "const content = fs.readFileSync(target, 'utf8'); "
    + markerCheck
  )

  writeFileSync(fakePhpPath, script, 'utf8')
  initializeMissions(context, missions)
  initializeProjectConfigStore(context, {
    template: 'traditional-web',
    tools: {
      php: {
        executable,
        argsPrefix: [fakePhpPath],
      },
    },
  })

  return fakePhpPath
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
  const [event] = readProjectEventStore(context).events
  assert.equal(event.type, 'mission.validation.finished')
  assert.equal(event.data.outcome, 'PASS')
  assert.equal(event.data.fromStatus, 'validation')
  assert.equal(event.data.toStatus, 'completed')
  assert.deepEqual(event.data.results, result.validation.results)
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
  const [event] = readProjectEventStore(context).events
  assert.equal(event.data.outcome, 'FAIL')
  assert.equal(event.data.toStatus, 'correction')
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
  const [event] = readProjectEventStore(context).events
  assert.equal(event.data.outcome, 'ERROR')
  assert.equal(event.data.toStatus, 'validation')
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
  const [event] = readProjectEventStore(context).events
  assert.equal(event.type, 'mission.validation.unavailable')
  assert.equal(event.data.errorMessage, 'ao menos um validator é obrigatório')
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
    assert.equal(existsSync(join(projectRoot, '.jzl', 'events.json')), false)
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
  assert.equal(
    existsSync(join(initialized.projectRoot, '.jzl', 'events.json')),
    false,
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
  assert.equal(readProjectEventStore(context).events[0].data.outcome, 'ERROR')
})

test('validação configurada PHP PASS conclui e libera dependente', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const missionA = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-exists', path: 'index.php' }],
  })
  const missionB = createMission('mission-0002', 'pending', {
    dependencies: [missionA.id],
  })
  writeFileSync(join(projectRoot, 'index.php'), '<?php echo "ok";', 'utf8')
  initializeConfiguredValidation(context, projectRoot, [missionA, missionB])

  const result = await validateConfiguredProjectMission(context, missionA.id)
  const state = readProjectStateStore(context)

  assert.equal(result.validation.status, 'PASS')
  assert.equal(result.mission.status, 'completed')
  assert.deepEqual(listReadyProjectMissions(context).map(({ id }) => id), [missionB.id])
  assertEvidenceNotPersisted(state)
})

test('validação configurada PHP FAIL solicita correction e bloqueia dependente', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const missionA = createMission('mission-0001')
  const missionB = createMission('mission-0002', 'pending', {
    dependencies: [missionA.id],
  })
  writeFileSync(join(projectRoot, 'index.php'), 'INVALID_PHP_FOR_TEST', 'utf8')
  initializeConfiguredValidation(context, projectRoot, [missionA, missionB], {
    invalidMarker: 'INVALID_PHP_FOR_TEST',
  })

  const result = await validateConfiguredProjectMission(context, missionA.id)
  const state = readProjectStateStore(context)

  assert.equal(result.validation.status, 'FAIL')
  assert.equal(result.mission.status, 'correction')
  assert.deepEqual(listReadyProjectMissions(context), [])
  assertEvidenceNotPersisted(state)
})

test('validação configurada PHP ERROR mantém Mission validation', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  const dependent = createMission('mission-0002', 'pending', {
    dependencies: [mission.id],
  })
  writeFileSync(join(projectRoot, 'index.php'), '<?php', 'utf8')
  initializeConfiguredValidation(context, projectRoot, [mission, dependent], {
    executable: join(projectRoot, 'missing-php.exe'),
  })

  const result = await validateConfiguredProjectMission(context, mission.id)

  assert.equal(result.validation.status, 'ERROR')
  assert.equal(result.mission.status, 'validation')
  assert.deepEqual(listReadyProjectMissions(context), [])
  assertEvidenceNotPersisted(readProjectStateStore(context))
})

test('Acceptance Criteria são incorporados antes dos validators fornecidos', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  writeFileSync(join(projectRoot, 'index.html'), 'AFTER')
  const mission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [
      { id: 'criterion-0001', type: 'file-exists', path: 'index.html' },
      { id: 'criterion-0002', type: 'file-contains', path: 'index.html', text: 'AFTER' },
    ],
  })
  const snapshot = structuredClone(mission.acceptanceCriteria)
  initializeMissions(context, [mission])
  const output = await validateProjectMission(context, mission.id, [createValidator('command')])
  assert.equal(output.validation.status, 'PASS')
  assert.equal(output.mission.status, 'completed')
  assert.deepEqual(output.validation.results.map(({ id }) => id), [
    'criterion-0001', 'criterion-0002', 'command',
  ])
  assert.deepEqual(mission.acceptanceCriteria, snapshot)
})

test('criterion FAIL envia para correction e ERROR mantém validation', async (t) => {
  const failProject = createTemporaryContext(t)
  writeFileSync(join(failProject.projectRoot, 'index.html'), 'BEFORE')
  const failMission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' }],
  })
  initializeMissions(failProject.context, [failMission])
  const failed = await validateProjectMission(failProject.context, failMission.id, [])
  assert.equal(failed.validation.status, 'FAIL')
  assert.equal(failed.mission.status, 'correction')

  const errorProject = createTemporaryContext(t)
  writeFileSync(join(errorProject.projectRoot, 'invalid.bin'), Buffer.from([0xff]))
  const errorMission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-contains', path: 'invalid.bin', text: 'x' }],
  })
  initializeMissions(errorProject.context, [errorMission])
  const errored = await validateProjectMission(errorProject.context, errorMission.id, [])
  assert.equal(errored.validation.status, 'ERROR')
  assert.equal(errored.mission.status, 'validation')
})

test('combina criteria e command com FAIL e ERROR na Mission Validation', async (t) => {
  const criterionFailProject = createTemporaryContext(t)
  writeFileSync(join(criterionFailProject.projectRoot, 'index.html'), 'BEFORE')
  const criterionFailMission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' }],
  })
  initializeMissions(criterionFailProject.context, [criterionFailMission])
  const criterionFail = await validateProjectMission(
    criterionFailProject.context,
    criterionFailMission.id,
    [createValidator('command-pass')],
  )
  assert.equal(criterionFail.validation.status, 'FAIL')
  assert.equal(criterionFail.mission.status, 'correction')
  assert.deepEqual(criterionFail.validation.results.map(({ status }) => status), ['FAIL', 'PASS'])

  const commandFailProject = createTemporaryContext(t)
  writeFileSync(join(commandFailProject.projectRoot, 'index.html'), 'AFTER')
  const commandFailMission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' }],
  })
  initializeMissions(commandFailProject.context, [commandFailMission])
  const commandFail = await validateProjectMission(
    commandFailProject.context,
    commandFailMission.id,
    [createValidator('command-fail', 1)],
  )
  assert.equal(commandFail.validation.status, 'FAIL')
  assert.equal(commandFail.mission.status, 'correction')
  assert.deepEqual(commandFail.validation.results.map(({ status }) => status), ['PASS', 'FAIL'])

  const commandErrorProject = createTemporaryContext(t)
  writeFileSync(join(commandErrorProject.projectRoot, 'index.html'), 'BEFORE')
  const commandErrorMission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' }],
  })
  initializeMissions(commandErrorProject.context, [commandErrorMission])
  const commandError = await validateProjectMission(
    commandErrorProject.context,
    commandErrorMission.id,
    [createMissingValidator(commandErrorProject.projectRoot)],
  )
  assert.equal(commandError.validation.status, 'ERROR')
  assert.equal(commandError.mission.status, 'validation')
  assert.deepEqual(commandError.validation.results.map(({ status }) => status), ['FAIL', 'ERROR'])
})

test('configured HTML-only usa criteria e legacy vazio mantém unavailable', async (t) => {
  const acceptedProject = createTemporaryContext(t)
  writeFileSync(join(acceptedProject.projectRoot, 'index.html'), 'ok')
  const acceptedMission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-exists', path: 'index.html' }],
  })
  initializeMissions(acceptedProject.context, [acceptedMission])
  initializeProjectConfigStore(acceptedProject.context, { template: 'traditional-web', tools: {} })
  const accepted = await validateConfiguredProjectMission(acceptedProject.context, acceptedMission.id)
  assert.equal(accepted.validation.status, 'PASS')
  assert.equal(accepted.mission.status, 'completed')
  assert.deepEqual(accepted.validation.results.map(({ id }) => id), [
    'criterion-0001', 'traditional-web:ascii-paths',
  ])

  const legacyProject = createTemporaryContext(t)
  const legacyMission = createMission('mission-0001')
  initializeMissions(legacyProject.context, [legacyMission])
  initializeProjectConfigStore(legacyProject.context, { template: 'traditional-web', tools: {} })
  await assert.rejects(
    validateConfiguredProjectMission(legacyProject.context, legacyMission.id),
    { message: 'Mission não possui validação específica suficiente para comprovar o objetivo' },
  )
  assert.equal(readProjectStateStore(legacyProject.context).missions[0].status, 'validation')
  assert.equal(readProjectEventStore(legacyProject.context).events[0].type, 'mission.validation.unavailable')
})

test('standard ASCII FAIL sem prova solicita correction e alimenta Handoff', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  writeFileSync(join(projectRoot, 'usuários.html'), '')
  initializeMissions(context, [mission])
  initializeProjectConfigStore(context, { template: 'traditional-web', tools: {} })

  const result = await validateConfiguredProjectMission(context, mission.id)
  assert.equal(result.validation.status, 'FAIL')
  assert.equal(result.mission.status, 'correction')
  assert.equal(readProjectEventStore(context).events.at(-1).type, 'mission.validation.finished')

  const handoff = resolveMissionCorrectionHandoff(context, mission.id)
  assert.equal(handoff.payload.failedValidators[0].id, 'traditional-web:ascii-paths')
  assert.deepEqual(handoff.payload.failedValidators[0].evidence.violations, ['usuários.html'])
  const executionContext = buildMissionExecutionContext(context, {
    mission: retryProjectMissionCorrection(context, mission.id),
    standards: { id: 'traditional-web-v1', instructions: ['Preserve o projeto.'] },
    handoff,
  })
  assert.match(buildMissionExecutionPrompt(executionContext), /Traditional Web Standard:/)
})

test('PHP configurado PASS sem Acceptance não comprova objetivo', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  writeFileSync(join(projectRoot, 'index.php'), '<?php', 'utf8')
  initializeConfiguredValidation(context, projectRoot, [mission])

  await assert.rejects(validateConfiguredProjectMission(context, mission.id), {
    message: 'Mission não possui validação específica suficiente para comprovar o objetivo',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
})

test('validação configurada executa todos os PHP de primeira parte', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-exists', path: 'a.php' }],
  })
  const logPath = join(projectRoot, 'executed.txt')
  const fakePhpPath = join(projectRoot, 'fake-php.js')
  writeFileSync(join(projectRoot, 'a.php'), '<?php', 'utf8')
  writeFileSync(join(projectRoot, 'b.php'), '<?php', 'utf8')
  initializeMissions(context, [mission])
  writeFileSync(fakePhpPath, (
    "const fs = require('node:fs'); const path = require('node:path'); "
    + `fs.appendFileSync(${JSON.stringify(logPath)}, path.basename(process.argv.at(-1)) + '\\n');`
  ), 'utf8')
  initializeProjectConfigStore(context, {
    template: 'traditional-web',
    tools: { php: { executable: process.execPath, argsPrefix: [fakePhpPath] } },
  })

  const result = await validateConfiguredProjectMission(context, mission.id)

  assert.equal(result.validation.status, 'PASS')
  assert.deepEqual(readFileSync(logPath, 'utf8').trim().split(/\r?\n/), ['a.php', 'b.php'])
})

test('PHP inválido dentro de vendor é ignorado', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001', 'validation', {
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-exists', path: 'index.php' }],
  })
  writeFileSync(join(projectRoot, 'index.php'), '<?php', 'utf8')
  const vendor = join(projectRoot, 'vendor')
  mkdirSync(vendor)
  writeFileSync(join(vendor, 'invalid.php'), 'INVALID_PHP_FOR_TEST', 'utf8')
  initializeConfiguredValidation(context, projectRoot, [mission], {
    invalidMarker: 'INVALID_PHP_FOR_TEST',
  })

  const result = await validateConfiguredProjectMission(context, mission.id)
  assert.equal(result.validation.status, 'PASS')
})

test('PHP sem configuração mantém Mission validation', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  writeFileSync(join(projectRoot, 'index.php'), '<?php', 'utf8')
  initializeMissions(context, [mission])
  initializeProjectConfigStore(context, { template: 'traditional-web' })

  await assert.rejects(validateConfiguredProjectMission(context, mission.id), {
    message: 'executable PHP não configurado para traditional-web',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  const [event] = readProjectEventStore(context).events
  assert.equal(event.type, 'mission.validation.unavailable')
  assert.equal(event.data.errorMessage, 'executable PHP não configurado para traditional-web')
})

test('standards PASS sem prova mantém Mission validation', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  initializeConfiguredValidation(context, projectRoot, [mission])

  await assert.rejects(validateConfiguredProjectMission(context, mission.id), {
    message: 'Mission não possui validação específica suficiente para comprovar o objetivo',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  const events = readProjectEventStore(context).events
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'mission.validation.unavailable')
})

test('status errado precede resolução de config na validação configurada', async (t) => {
  const { context } = createTemporaryContext(t)
  const mission = createMission('mission-0001', 'pending')
  initializeMissions(context, [mission])

  await assert.rejects(validateConfiguredProjectMission(context, mission.id), {
    message: 'Mission deve estar validation para validação',
  })
  assert.deepEqual(readProjectStateStore(context).missions, [mission])
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

test('config ausente não altera Mission validation', async (t) => {
  const { context } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  initializeMissions(context, [mission])

  await assert.rejects(validateConfiguredProjectMission(context, mission.id), {
    message: 'arquivo de configuração do projeto não existe',
  })
  assert.deepEqual(readProjectStateStore(context).missions, [mission])
  const [event] = readProjectEventStore(context).events
  assert.equal(event.type, 'mission.validation.unavailable')
  assert.equal(event.data.errorMessage, 'arquivo de configuração do projeto não existe')
})

test('config inválida não altera Mission validation', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  initializeMissions(context, [mission])
  writeFileSync(join(projectRoot, '.jzl', 'config.json'), JSON.stringify({
    schemaVersion: 2,
    template: 'traditional-web',
    tools: {},
  }), 'utf8')

  await assert.rejects(validateConfiguredProjectMission(context, mission.id), {
    message: 'schemaVersion da configuração do projeto não é suportado',
  })
  assert.deepEqual(readProjectStateStore(context).missions, [mission])
  assert.equal(readProjectEventStore(context).events[0].type, 'mission.validation.unavailable')
})

test('falha de history após PASS não reverte Mission completed', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  initializeMissions(context, [mission])
  mkdirSync(join(projectRoot, '.jzl', 'events.json'))

  await assert.rejects(
    validateProjectMission(context, mission.id, [createValidator('pass')]),
    { message: 'arquivo de histórico do projeto não é um arquivo' },
  )
  assert.equal(readProjectStateStore(context).missions[0].status, 'completed')
})

test('falha original e falha de history em unavailable são agregadas', async (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const mission = createMission('mission-0001')
  initializeMissions(context, [mission])
  mkdirSync(join(projectRoot, '.jzl', 'events.json'))

  await assert.rejects(
    validateProjectMission(context, mission.id, []),
    (error) => {
      assert.ok(error instanceof AggregateError)
      assert.equal(
        error.message,
        'A validação não pôde ser preparada e o histórico não pôde ser persistido',
      )
      assert.deepEqual(error.errors.map(({ message }) => message), [
        'ao menos um validator é obrigatório',
        'arquivo de histórico do projeto não é um arquivo',
      ])
      return true
    },
  )
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
})
