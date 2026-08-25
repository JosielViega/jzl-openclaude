import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, normalize } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createProjectContext } from '../src/project-context.js'
import { initializeProjectConfigStore } from '../src/project-config-store.js'
import {
  appendProjectEvent,
  readProjectEventStore,
} from '../src/project-event-store.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const cliPath = join(testDirectory, '..', 'src', 'cli.js')

function createRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-cli-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function runCli(argumentsList) {
  return spawnSync(process.execPath, [cliPath, ...argumentsList], {
    encoding: 'utf8',
  })
}

function runJsonCli(argumentsList) {
  const result = runCli(argumentsList)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.signal, null)
  assert.equal(result.stderr, '')
  return { result, output: JSON.parse(result.stdout) }
}

function initProject(root, extraArguments = []) {
  return runJsonCli([
    'init-project',
    '--project-root', root,
    '--template', 'traditional-web',
    ...extraArguments,
  ]).output
}

function createValidationProject(t, mode) {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const fakePhpPath = join(root, 'fake-php.js')
  const phpPath = join(root, 'index.php')
  const mission = {
    id: 'mission-0001',
    title: 'Validar PHP',
    objective: 'Validar sintaxe',
    status: 'validation',
    dependencies: [],
  }

  writeFileSync(fakePhpPath, (
    "const fs = require('node:fs'); "
    + "const content = fs.readFileSync(process.argv.at(-1), 'utf8'); "
    + "if (content.includes('INVALID_PHP_FOR_TEST')) process.exit(1);"
  ), 'utf8')
  writeFileSync(
    phpPath,
    mode === 'FAIL' ? 'INVALID_PHP_FOR_TEST' : '<?php echo "ok";',
    'utf8',
  )
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  initializeProjectConfigStore(context, {
    template: 'traditional-web',
    tools: {
      php: {
        executable: mode === 'ERROR'
          ? join(root, 'missing-php.exe')
          : process.execPath,
        argsPrefix: [fakePhpPath],
      },
    },
  })

  return root
}

test('check-root preserva saída textual', (t) => {
  const root = createRoot(t)
  const result = runCli(['check-root', '--project-root', root])

  assert.equal(result.status, 0)
  assert.match(result.stdout, /projectRoot válido/)
  assert.ok(result.stdout.includes(normalize(root)))
  assert.equal(result.stderr, '')
})

test('init-project mínimo retorna um único JSON e persiste stores', (t) => {
  const root = createRoot(t)
  const { result, output } = runJsonCli([
    'init-project', '--project-root', root, '--template', 'traditional-web',
  ])

  assert.deepEqual(output, {
    projectRoot: root,
    config: { schemaVersion: 1, template: 'traditional-web', tools: {} },
    state: { schemaVersion: 1 },
  })
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1)
})

test('init-project persiste --php absoluto', (t) => {
  const root = createRoot(t)
  const output = initProject(root, ['--php', process.execPath])

  assert.deepEqual(output.config.tools.php, {
    executable: process.execPath,
    argsPrefix: [],
  })
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, '.jzl', 'config.json'), 'utf8')),
    output.config,
  )
})

test('create-mission retorna Mission criada', (t) => {
  const root = createRoot(t)
  initProject(root)
  const { output } = runJsonCli([
    'create-mission', '--project-root', root,
    '--title', 'Mission A', '--objective', 'Executar A',
  ])

  assert.deepEqual(output, {
    id: 'mission-0001',
    title: 'Mission A',
    objective: 'Executar A',
    status: 'pending',
    dependencies: [],
  })
})

test('create-mission aceita --depends-on repetido e preserva ordem', (t) => {
  const root = createRoot(t)
  initProject(root)
  runJsonCli(['create-mission', '--project-root', root, '--title', 'A', '--objective', 'A'])
  runJsonCli(['create-mission', '--project-root', root, '--title', 'B', '--objective', 'B'])
  const { output } = runJsonCli([
    'create-mission', '--project-root', root,
    '--title', 'C', '--objective', 'C',
    '--depends-on', 'mission-0002',
    '--depends-on', 'mission-0001',
  ])

  assert.deepEqual(output.dependencies, ['mission-0002', 'mission-0001'])
})

test('list-ready retorna somente Missions prontas sem persistir ready', (t) => {
  const root = createRoot(t)
  initProject(root)
  const first = runJsonCli([
    'create-mission', '--project-root', root, '--title', 'A', '--objective', 'A',
  ]).output
  runJsonCli([
    'create-mission', '--project-root', root, '--title', 'B', '--objective', 'B',
    '--depends-on', first.id,
  ])
  const { output } = runJsonCli(['list-ready', '--project-root', root])

  assert.deepEqual(output.missions.map(({ id }) => id), [first.id])
  assert.equal(readFileSync(join(root, '.jzl', 'state.json'), 'utf8').includes('ready'), false)
})

test('set-model persiste rotas explícitas por responsabilidade', (t) => {
  const root = createRoot(t)
  initProject(root)

  const execution = runJsonCli([
    'set-model', '--project-root', root,
    '--responsibility', 'mission-execution', '--model', '  model-a  ',
  ]).output
  const review = runJsonCli([
    'set-model', '--project-root', root,
    '--responsibility', 'mission-review', '--model', 'model-b',
  ]).output
  const planning = runJsonCli([
    'set-model', '--project-root', root,
    '--responsibility', 'mission-planning', '--model', 'model-c',
  ]).output

  assert.deepEqual(execution, {
    responsibility: 'mission-execution', model: 'model-a',
  })
  assert.deepEqual(review, {
    responsibility: 'mission-review', model: 'model-b',
  })
  assert.deepEqual(planning, {
    responsibility: 'mission-planning', model: 'model-c',
  })
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, '.jzl', 'config.json'), 'utf8')).models,
    { 'mission-execution': 'model-a', 'mission-review': 'model-b', 'mission-planning': 'model-c' },
  )
})

test('set-model exige flags singulares e responsabilidade suportada', (t) => {
  const root = createRoot(t)
  initProject(root)

  for (const [argumentsList, message] of [
    [['set-model', '--project-root', root, '--model', 'x'], '--responsibility é obrigatório'],
    [['set-model', '--project-root', root, '--responsibility', 'mission-review'], '--model é obrigatório'],
    [[
      'set-model', '--project-root', root, '--responsibility', 'other', '--model', 'x',
    ], 'responsabilidade de modelo não é suportada'],
    [[
      'set-model', '--project-root', root, '--responsibility', 'mission-review',
      '--model', 'x', '--model', 'y',
    ], 'opção duplicada: --model'],
  ]) {
    const result = runCli(argumentsList)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
  }
})

for (const mode of ['PASS', 'FAIL', 'ERROR']) {
  test(`validate-mission retorna outcome ${mode} com exit code zero`, (t) => {
    const root = createValidationProject(t, mode)
    const { result, output } = runJsonCli([
      'validate-mission', '--project-root', root, '--mission', 'mission-0001',
    ])
    const expectedMissionStatus = {
      PASS: 'completed',
      FAIL: 'correction',
      ERROR: 'validation',
    }[mode]

    assert.equal(result.status, 0)
    assert.equal(output.validation.status, mode)
    assert.equal(output.mission.status, expectedMissionStatus)
  })
}

test('execute-mission bloqueada falha antes de OpenClaude', (t) => {
  const root = createRoot(t)
  initProject(root)
  const first = runJsonCli([
    'create-mission', '--project-root', root, '--title', 'A', '--objective', 'A',
  ]).output
  const second = runJsonCli([
    'create-mission', '--project-root', root, '--title', 'B', '--objective', 'B',
    '--depends-on', first.id,
  ]).output
  const result = runCli([
    'execute-mission', '--project-root', root, '--mission', second.id,
  ])

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr.trim(), 'Mission não está pronta para iniciar')
})

test('run-mission bloqueada falha antes de OpenClaude', (t) => {
  const root = createRoot(t)
  initProject(root)
  const first = runJsonCli([
    'create-mission', '--project-root', root, '--title', 'A', '--objective', 'A',
  ]).output
  const second = runJsonCli([
    'create-mission', '--project-root', root, '--title', 'B', '--objective', 'B',
    '--depends-on', first.id,
  ]).output
  const result = runCli([
    'run-mission', '--project-root', root, '--mission', second.id,
  ])

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr.trim(), 'Mission não está pronta para iniciar')
})

test('run-mission completed rejeita antes de OpenClaude', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [{
      id: 'mission-0001',
      title: 'A',
      objective: 'A',
      status: 'completed',
      dependencies: [],
    }],
  })
  const result = runCli([
    'run-mission', '--project-root', root, '--mission', 'mission-0001',
  ])

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr.trim(), 'Mission não pode ser executada no status atual')
})

test('run raw é comando desconhecido e não aceita prompt livre', (t) => {
  const root = createRoot(t)
  const result = runCli([
    'run', '--project-root', root, '--prompt', 'prompt livre',
  ])

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr.trim(), 'comando desconhecido: run')
})

test('history retorna eventos em ordem em um único JSON', (t) => {
  const root = createRoot(t)
  initProject(root)
  const context = createProjectContext(root)
  for (const [missionId, errorMessage] of [
    ['mission-0002', 'primeiro'],
    ['mission-0001', 'segundo'],
    ['mission-0002', 'terceiro'],
  ]) {
    appendProjectEvent(context, {
      type: 'mission.validation.unavailable',
      missionId,
      data: { status: 'validation', errorMessage },
    })
  }

  const { result, output } = runJsonCli(['history', '--project-root', root])

  assert.deepEqual(output.events.map(({ id }) => id), [
    'event-000001',
    'event-000002',
    'event-000003',
  ])
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1)
})

test('history filtra por Mission e retorna vazio para Mission sem eventos', (t) => {
  const root = createRoot(t)
  initProject(root)
  const context = createProjectContext(root)
  for (const missionId of ['mission-0001', 'mission-0002', 'mission-0001']) {
    appendProjectEvent(context, {
      type: 'mission.validation.unavailable',
      missionId,
      data: { status: 'validation', errorMessage: missionId },
    })
  }

  const filtered = runJsonCli([
    'history', '--project-root', root, '--mission', 'mission-0001',
  ]).output
  const empty = runJsonCli([
    'history', '--project-root', root, '--mission', 'mission-9999',
  ]).output

  assert.deepEqual(filtered.events.map(({ id }) => id), ['event-000001', 'event-000003'])
  assert.deepEqual(empty, { events: [] })
})

for (const [name, argumentsList, message] of [
  ['mission inválida', ['history', '--project-root', 'ROOT', '--mission', 'mission-1'], 'missionId de histórico é inválido'],
  ['mission duplicada', ['history', '--project-root', 'ROOT', '--mission', 'mission-0001', '--mission', 'mission-0002'], 'opção duplicada: --mission'],
  ['flag desconhecida', ['history', '--project-root', 'ROOT', '--other', 'x'], 'argumento desconhecido: --other'],
]) {
  test(`history rejeita ${name}`, (t) => {
    const root = createRoot(t)
    initProject(root)
    const result = runCli(argumentsList.map((value) => value === 'ROOT' ? root : value))

    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
  })
}

test('review-mission exige flags e rejeita opções inválidas', () => {
  for (const [argumentsList, message] of [
    [['review-mission', '--mission', 'mission-0001'], '--project-root é obrigatório'],
    [['review-mission', '--project-root', 'root'], '--mission é obrigatório'],
    [[
      'review-mission', '--project-root', 'root',
      '--mission', 'mission-0001', '--other', 'x',
    ], 'argumento desconhecido: --other'],
    [[
      'review-mission', '--project-root', 'root', '--mission', 'mission-0001',
      '--mission', 'mission-0002',
    ], 'opção duplicada: --mission'],
  ]) {
    const result = runCli(argumentsList)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
  }
})

for (const status of ['pending', 'completed']) {
  test(`review-mission rejeita Mission ${status} antes do modelo`, (t) => {
    const root = createRoot(t)
    const context = createProjectContext(root)
    initializeProjectStateStore(context)
    writeProjectStateStore(context, {
      schemaVersion: 1,
      missions: [{
        id: 'mission-0001', title: 'A', objective: 'A', status, dependencies: [],
      }],
    })

    const result = runCli([
      'review-mission', '--project-root', root, '--mission', 'mission-0001',
    ])

    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), 'Mission deve estar validation para revisão')
    assert.equal(readProjectStateStore(context).missions[0].status, status)
  })
}

test('review-mission registra unavailable quando Config está ausente', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [{
      id: 'mission-0001', title: 'A', objective: 'A',
      status: 'validation', dependencies: [],
    }],
  })

  const result = runCli([
    'review-mission', '--project-root', root, '--mission', 'mission-0001',
  ])

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr.trim(), 'arquivo de configuração do projeto não existe')
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  const [event] = readProjectEventStore(context).events
  assert.equal(event.type, 'mission.review.unavailable')
  assert.equal(event.data.sessionId, null)
})

test('plan-mission exige flags singulares e rejeita opções desconhecidas', () => {
  for (const [argumentsList, message] of [
    [['plan-mission', '--mission', 'mission-0001'], '--project-root é obrigatório'],
    [['plan-mission', '--project-root', 'root'], '--mission é obrigatório'],
    [['plan-mission', '--project-root', 'root', '--mission', 'mission-0001', '--other', 'x'], 'argumento desconhecido: --other'],
    [['plan-mission', '--project-root', 'root', '--mission', 'mission-0001', '--mission', 'mission-0002'], 'opção duplicada: --mission'],
  ]) {
    const result = runCli(argumentsList)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
  }
})

test('plan-mission rejeita status não pending antes do modelo', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [{ id: 'mission-0001', title: 'A', objective: 'A', status: 'running', dependencies: [] }],
  })
  const result = runCli(['plan-mission', '--project-root', root, '--mission', 'mission-0001'])
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), 'Mission deve estar pending para planejamento')
})

test('plan-mission rejeita Mission bloqueada sem criar evento', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [
      { id: 'mission-0001', title: 'A', objective: 'A', status: 'pending', dependencies: ['mission-0002'] },
      { id: 'mission-0002', title: 'B', objective: 'B', status: 'pending', dependencies: [] },
    ],
  })
  const result = runCli(['plan-mission', '--project-root', root, '--mission', 'mission-0001'])
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), 'Mission deve estar pronta para planejamento')
  assert.equal(existsSync(join(root, '.jzl', 'events.json')), false)
})

test('plan-mission pronta sem modelo registra unavailable e preserva pending', (t) => {
  const root = createRoot(t)
  initProject(root)
  const mission = runJsonCli([
    'create-mission', '--project-root', root, '--title', 'A', '--objective', 'A',
  ]).output
  const result = runCli(['plan-mission', '--project-root', root, '--mission', mission.id])
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr.trim(), 'modelo não configurado para responsabilidade mission-planning')
  const context = createProjectContext(root)
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
  assert.equal(readProjectEventStore(context).events[0].type, 'mission.plan.unavailable')
})

test('approve-plan exige flags singulares e rejeita opções desconhecidas', () => {
  for (const [argumentsList, message] of [
    [['approve-plan', '--project-root', 'root', '--plan-event', 'event-000001'], '--mission é obrigatório'],
    [['approve-plan', '--project-root', 'root', '--mission', 'mission-0001'], '--plan-event é obrigatório'],
    [['approve-plan', '--project-root', 'root', '--mission', 'mission-0001', '--plan-event', 'event-000001', '--plan-event', 'event-000002'], 'opção duplicada: --plan-event'],
    [['approve-plan', '--project-root', 'root', '--mission', 'mission-0001', '--plan-event', 'event-000001', '--other', 'x'], 'argumento desconhecido: --other'],
  ]) {
    const result = runCli(argumentsList)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
  }
})

test('approve-plan rejeita status, readiness e evento inexistente', (t) => {
  const statusRoot = createRoot(t)
  const statusContext = createProjectContext(statusRoot)
  initializeProjectStateStore(statusContext)
  writeProjectStateStore(statusContext, {
    schemaVersion: 1,
    missions: [{ id: 'mission-0001', title: 'A', objective: 'A', status: 'running', dependencies: [] }],
  })
  let result = runCli(['approve-plan', '--project-root', statusRoot, '--mission', 'mission-0001', '--plan-event', 'event-000001'])
  assert.equal(result.stderr.trim(), 'Mission deve estar pending para aprovação de plano')

  const blockedRoot = createRoot(t)
  const blockedContext = createProjectContext(blockedRoot)
  initializeProjectStateStore(blockedContext)
  writeProjectStateStore(blockedContext, {
    schemaVersion: 1,
    missions: [
      { id: 'mission-0001', title: 'A', objective: 'A', status: 'pending', dependencies: ['mission-0002'] },
      { id: 'mission-0002', title: 'B', objective: 'B', status: 'pending', dependencies: [] },
    ],
  })
  result = runCli(['approve-plan', '--project-root', blockedRoot, '--mission', 'mission-0001', '--plan-event', 'event-000001'])
  assert.equal(result.stderr.trim(), 'Mission deve estar pronta para aprovação de plano')

  const missingRoot = createRoot(t)
  initProject(missingRoot)
  runJsonCli(['create-mission', '--project-root', missingRoot, '--title', 'A', '--objective', 'A'])
  result = runCli(['approve-plan', '--project-root', missingRoot, '--mission', 'mission-0001', '--plan-event', 'event-999999'])
  assert.equal(result.stderr.trim(), 'evento de planejamento não está disponível para a Mission')
})

test('approve-plan rejeita plan antigo e aprova latest em um único JSON', (t) => {
  const root = createRoot(t)
  initProject(root)
  runJsonCli(['create-mission', '--project-root', root, '--title', 'A', '--objective', 'A'])
  const context = createProjectContext(root)
  const appendPlan = (summary) => appendProjectEvent(context, {
    type: 'mission.plan.finished', missionId: 'mission-0001',
    data: {
      sessionId: `session-${summary}`, model: 'plan-model', summary,
      steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['index.html'] }],
      risks: [], validation: [],
    },
  })
  const planA = appendPlan('A')
  const planB = appendPlan('B')
  let result = runCli(['approve-plan', '--project-root', root, '--mission', 'mission-0001', '--plan-event', planA.id])
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), 'evento de planejamento não é o planejamento concluído mais recente da Mission')

  const { result: success, output } = runJsonCli([
    'approve-plan', '--project-root', root, '--mission', 'mission-0001', '--plan-event', planB.id,
  ])
  assert.equal(success.stdout.trim().split(/\r?\n/).length, 1)
  assert.equal(output.mission.status, 'pending')
  assert.equal(output.approvalEvent.type, 'mission.plan.approved')
  assert.deepEqual(output.approvalEvent.data, { planEventId: planB.id })
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
})

test('request-review-correction exige flags singulares', () => {
  for (const [argumentsList, message] of [
    [['request-review-correction', '--project-root', 'root', '--review-event', 'event-000001'], '--mission é obrigatório'],
    [['request-review-correction', '--project-root', 'root', '--mission', 'mission-0001'], '--review-event é obrigatório'],
    [['request-review-correction', '--project-root', 'root', '--mission', 'mission-0001', '--review-event', 'event-000001', '--review-event', 'event-000002'], 'opção duplicada: --review-event'],
    [['request-review-correction', '--project-root', 'root', '--mission', 'mission-0001', '--review-event', 'event-000001', '--other', 'x'], 'argumento desconhecido: --other'],
  ]) {
    const result = runCli(argumentsList)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
  }
})

test('request-review-correction autoriza CONCERNS atual e imprime um JSON', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [{ id: 'mission-0001', title: 'A', objective: 'A', status: 'validation', dependencies: [] }],
  })
  appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: 'mission-0001',
    data: { outcome: 'SUCCESS', fromStatus: 'pending', toStatus: 'validation', sessionId: 'execution', result: 'ok' },
  })
  const review = appendProjectEvent(context, {
    type: 'mission.review.finished', missionId: 'mission-0001',
    data: {
      sessionId: 'review', verdict: 'CONCERNS', summary: 'problema',
      findings: [{ severity: 'HIGH', title: 'Falha', detail: 'Detalhe', paths: ['index.php'] }],
    },
  })

  const { result, output } = runJsonCli([
    'request-review-correction', '--project-root', root,
    '--mission', 'mission-0001', '--review-event', review.id,
  ])
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1)
  assert.equal(output.mission.status, 'correction')
  assert.equal(output.authorizationEvent.data.reviewEventId, review.id)
})

for (const [name, verdict, stale, message] of [
  ['PASS', 'PASS', false, 'revisão não possui CONCERNS para correção'],
  ['review stale', 'CONCERNS', true, 'revisão não pertence ao ciclo atual de execução da Mission'],
]) {
  test(`request-review-correction rejeita ${name}`, (t) => {
    const root = createRoot(t)
    const context = createProjectContext(root)
    initializeProjectStateStore(context)
    writeProjectStateStore(context, {
      schemaVersion: 1,
      missions: [{ id: 'mission-0001', title: 'A', objective: 'A', status: 'validation', dependencies: [] }],
    })
    const appendExecution = () => appendProjectEvent(context, {
      type: 'mission.execution.finished', missionId: 'mission-0001',
      data: { outcome: 'SUCCESS', fromStatus: 'pending', toStatus: 'validation', sessionId: 'execution', result: 'ok' },
    })
    if (!stale) appendExecution()
    const review = appendProjectEvent(context, {
      type: 'mission.review.finished', missionId: 'mission-0001',
      data: {
        sessionId: 'review', verdict,
        summary: verdict === 'PASS' ? 'ok' : 'problema',
        findings: verdict === 'PASS' ? [] : [{ severity: 'HIGH', title: 'Falha', detail: 'Detalhe', paths: [] }],
      },
    })
    if (stale) appendExecution()

    const result = runCli([
      'request-review-correction', '--project-root', root,
      '--mission', 'mission-0001', '--review-event', review.id,
    ])
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
    assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  })
}

for (const [name, argumentsList, message] of [
  ['comando ausente', [], 'comando é obrigatório'],
  ['projectRoot ausente', ['list-ready'], '--project-root é obrigatório'],
  ['template ausente', ['init-project', '--project-root', 'root'], '--template é obrigatório'],
  ['title ausente', ['create-mission', '--project-root', 'root'], '--title é obrigatório'],
  ['objective ausente', ['create-mission', '--project-root', 'root', '--title', 'A'], '--objective é obrigatório'],
  ['mission ausente', ['validate-mission', '--project-root', 'root'], '--mission é obrigatório'],
  ['valor ausente', ['list-ready', '--project-root'], '--project-root exige um valor'],
  ['valor iniciado por flag', ['list-ready', '--project-root', '--other'], '--project-root exige um valor'],
  ['flag desconhecida', ['list-ready', '--project-root', 'root', '--other', 'x'], 'argumento desconhecido: --other'],
  ['flag singular duplicada', ['list-ready', '--project-root', 'a', '--project-root', 'b'], 'opção duplicada: --project-root'],
]) {
  test(`CLI rejeita ${name}`, () => {
    const result = runCli(argumentsList)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), message)
  })
}
