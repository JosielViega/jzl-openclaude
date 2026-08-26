import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
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
import { ensureTraditionalWebProjectStructure } from '../src/traditional-web-structure.js'

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
  ensureTraditionalWebProjectStructure(context)
  mkdirSync(join(root, 'node_modules'))
  const fakePhpPath = join(root, 'node_modules', 'fake-php.js')
  const phpPath = join(root, 'public', 'index.php')
  const mission = {
    id: 'mission-0001',
    title: 'Validar PHP',
    objective: 'Validar sintaxe',
    status: 'validation',
    dependencies: [],
    acceptanceCriteria: [{
      id: 'criterion-0001',
      type: 'file-exists',
      path: 'public/index.php',
    }],
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

test('check-standards retorna PASS ou FAIL com exit zero sem criar State/Event Store', (t) => {
  const root = createRoot(t)
  initializeProjectConfigStore(createProjectContext(root), {
    template: 'traditional-web',
    tools: {},
  })
  ensureTraditionalWebProjectStructure(createProjectContext(root))
  writeFileSync(join(root, 'public', 'assets', 'js', 'index.js'), 'export const value = 1\n')

  const passed = runJsonCli(['check-standards', '--project-root', root])
  assert.equal(passed.output.standard, 'traditional-web-v2')
  assert.equal(passed.output.status, 'PASS')

  writeFileSync(join(root, 'public', 'assets', 'js', 'index.js'), 'const =')
  const failed = runJsonCli(['check-standards', '--project-root', root])
  assert.equal(failed.output.status, 'FAIL')
  assert.equal(existsSync(join(root, '.jzl', 'state.json')), false)
  assert.equal(existsSync(join(root, '.jzl', 'events.json')), false)
})

test('check-standards reporta path Unicode como FAIL com exit zero', (t) => {
  const root = createRoot(t)
  initializeProjectConfigStore(createProjectContext(root), {
    template: 'traditional-web',
    tools: {},
  })
  ensureTraditionalWebProjectStructure(createProjectContext(root))
  writeFileSync(join(root, 'public', 'assets', 'js', 'ação.js'), 'export const value = 1\n')

  const { output } = runJsonCli(['check-standards', '--project-root', root])
  assert.equal(output.status, 'FAIL')
  assert.deepEqual(
    output.results.find(({ id }) => id === 'traditional-web:ascii-paths').evidence.violations,
    ['public/assets/js/ação.js'],
  )
})

test('check-standards valida opções e falha na preparação sem PHP configurado', (t) => {
  for (const [argumentsList, message] of [
    [['check-standards'], '--project-root é obrigatório'],
    [[
      'check-standards', '--project-root', 'a', '--project-root', 'b',
    ], 'opção duplicada: --project-root'],
    [[
      'check-standards', '--project-root', 'a', '--other', 'b',
    ], 'argumento desconhecido: --other'],
  ]) {
    const result = runCli(argumentsList)
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim(), message)
  }

  const root = createRoot(t)
  initializeProjectConfigStore(createProjectContext(root), {
    template: 'traditional-web', tools: {},
  })
  writeFileSync(join(root, 'index.php'), '<?php')
  const missingPhp = runCli(['check-standards', '--project-root', root])
  assert.equal(missingPhp.status, 1)
  assert.equal(
    missingPhp.stderr.trim(),
    'executable PHP não configurado para traditional-web',
  )
})

test('init-project mínimo retorna um único JSON e persiste stores', (t) => {
  const root = createRoot(t)
  const { result, output } = runJsonCli([
    'init-project', '--project-root', root, '--template', 'traditional-web',
  ])

  assert.deepEqual(output, {
    projectRoot: root,
    config: {
      schemaVersion: 1,
      template: 'traditional-web',
      standardsProfile: 'traditional-web-v2',
      tools: {},
    },
    state: { schemaVersion: 1 },
  })
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1)
  for (const projectPath of [
    'public', 'public/assets', 'public/assets/css', 'public/assets/js',
    'public/assets/images', 'src',
  ]) {
    assert.equal(existsSync(join(root, ...projectPath.split('/'))), true)
  }
  assert.equal(existsSync(join(root, 'database')), false)
  assert.equal(existsSync(join(root, 'public', 'index.php')), false)

  const storePaths = ['config.json', 'state.json', 'events.json']
  const storesBefore = storePaths.map((name) => readFileSync(join(root, '.jzl', name)))
  rmSync(join(root, 'public', 'assets', 'images'), { recursive: true })
  const rerun = runCli([
    'init-project', '--project-root', root, '--template', 'traditional-web',
  ])
  assert.equal(rerun.status, 0)
  assert.equal(existsSync(join(root, 'public', 'assets', 'images')), true)
  assert.deepEqual(
    storePaths.map((name) => readFileSync(join(root, '.jzl', name))),
    storesBefore,
  )
})

test('init-project preserva bytes e ausência de profile em config legacy', (t) => {
  const root = createRoot(t)
  const configDirectory = join(root, '.jzl')
  const configPath = join(configDirectory, 'config.json')
  const legacyContent = '{\n  "schemaVersion": 1,\n  "template": "traditional-web",\n  "tools": {}\n}\n'
  mkdirSync(configDirectory)
  writeFileSync(configPath, legacyContent, 'utf8')

  const { output } = runJsonCli([
    'init-project', '--project-root', root, '--template', 'traditional-web',
  ])

  assert.equal(readFileSync(configPath, 'utf8'), legacyContent)
  assert.equal(Object.hasOwn(output.config, 'standardsProfile'), false)
  assert.equal(existsSync(join(root, 'public', 'assets', 'images')), true)
})

test('check-standards rejeita profile inválido sem modificar config', (t) => {
  const root = createRoot(t)
  const configDirectory = join(root, '.jzl')
  const configPath = join(configDirectory, 'config.json')
  mkdirSync(configDirectory)
  const content = JSON.stringify({
    schemaVersion: 1,
    template: 'traditional-web',
    standardsProfile: 'traditional-web-v3',
    tools: {},
  }, null, 2) + '\n'
  writeFileSync(configPath, content, 'utf8')

  const result = runCli(['check-standards', '--project-root', root])

  assert.equal(result.status, 1)
  assert.equal(
    result.stderr.trim(),
    'standardsProfile da configuração do projeto não é suportado para o template',
  )
  assert.equal(readFileSync(configPath, 'utf8'), content)
  assert.equal(existsSync(join(root, 'public')), false)
})

test('init-project rejeita conflito estrutural antes de criar Stores', (t) => {
  const root = createRoot(t)
  writeFileSync(join(root, 'public'), '')

  const result = runCli([
    'init-project', '--project-root', root, '--template', 'traditional-web',
  ])

  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), 'estrutura traditional-web requer diretório real: public')
  assert.equal(existsSync(join(root, '.jzl')), false)
  assert.equal(existsSync(join(root, 'src')), false)
})

test('check-standards reporta scaffold ausente sem modificar o projeto', (t) => {
  const root = createRoot(t)
  initializeProjectConfigStore(createProjectContext(root), {
    template: 'traditional-web', tools: {},
  })
  const before = readFileSync(join(root, '.jzl', 'config.json'))

  const { result, output } = runJsonCli(['check-standards', '--project-root', root])

  assert.equal(result.status, 0)
  assert.equal(output.status, 'FAIL')
  assert.equal(output.results[0].id, 'traditional-web:structure')
  assert.equal(output.results[0].status, 'FAIL')
  assert.equal(existsSync(join(root, 'public')), false)
  assert.deepEqual(readFileSync(join(root, '.jzl', 'config.json')), before)
})

test('create-mission aceita Change Scope JSON estrito inclusive vazio', (t) => {
  const root = createRoot(t)
  initProject(root)
  const { output } = runJsonCli([
    'create-mission', '--project-root', root,
    '--title', 'Scoped', '--objective', 'Alterar somente o autorizado',
    '--change-scope', '{"allowedPaths":[]}',
  ])
  assert.deepEqual(output.changeScope, { allowedPaths: [] })
  assert.deepEqual(readProjectStateStore(createProjectContext(root)).missions[0].changeScope, {
    allowedPaths: [],
  })

  const invalid = runCli([
    'create-mission', '--project-root', root,
    '--title', 'Invalid', '--objective', 'Invalid', '--change-scope', '{',
  ])
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /--change-scope deve conter JSON válido/)
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
    acceptanceCriteria: [],
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

test('create-mission aceita JSON repeatable de acceptance criteria', (t) => {
  const root = createRoot(t)
  initProject(root)
  const { output } = runJsonCli([
    'create-mission', '--project-root', root,
    '--title', 'Aceitar', '--objective', 'Validar',
    '--acceptance', JSON.stringify({ type: 'file-exists', path: 'index.html' }),
    '--acceptance', JSON.stringify({ type: 'file-contains', path: 'index.html', text: 'AFTER' }),
  ])
  assert.deepEqual(output.acceptanceCriteria, [
    { id: 'criterion-0001', type: 'file-exists', path: 'index.html' },
    { id: 'criterion-0002', type: 'file-contains', path: 'index.html', text: 'AFTER' },
  ])
})

test('create-mission rejeita acceptance inválido sem ambiguidade', (t) => {
  const root = createRoot(t)
  initProject(root)
  for (const [value, message] of [
    ['{', '--acceptance deve conter JSON válido'],
    ['[]', 'acceptance criterion deve ser um objeto'],
    [JSON.stringify({ type: 'other', path: 'index.html' }), 'type do acceptance criterion não é suportado'],
    [JSON.stringify({ type: 'file-exists', path: '.jzl/state.json' }), 'path do acceptance criterion é protegido'],
  ]) {
    const result = runCli([
      'create-mission', '--project-root', root,
      '--title', 'Inválida', '--objective', 'Não criar', '--acceptance', value,
    ])
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim(), message)
  }
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

test('mission-report legacy sem history retorna um JSON e não cria Event Store', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const mission = {
    id: 'mission-0001', title: 'Legacy', objective: 'Auditar',
    status: 'pending', dependencies: [],
  }
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })

  const { result, output } = runJsonCli([
    'mission-report', '--project-root', root, '--mission', mission.id,
  ])
  assert.deepEqual(output, {
    mission,
    planning: { plan: null, approval: null },
    currentCycle: {
      execution: null, validation: null, review: null, reviewCorrection: null,
    },
  })
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1)
  assert.equal(existsSync(join(root, '.jzl', 'events.json')), false)
})

test('mission-report mostra ciclo completed persistido', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  const mission = {
    id: 'mission-0001', title: 'Completed', objective: 'Auditar',
    status: 'completed', dependencies: [], acceptanceCriteria: [],
  }
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  const execution = appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: mission.id,
    data: {
      outcome: 'SUCCESS', fromStatus: 'pending', toStatus: 'validation',
      sessionId: 'session-cli-report', model: 'synthetic', result: 'ok',
      changeSet: { created: [], modified: [], deleted: [] },
    },
  })
  const validation = appendProjectEvent(context, {
    type: 'mission.validation.finished', missionId: mission.id,
    data: {
      outcome: 'PASS', fromStatus: 'validation', toStatus: 'completed',
      results: [{ id: 'validator', status: 'PASS', evidence: {
        exitCode: 0, signal: null, stdout: '', stderr: '', errorMessage: null,
      } }],
    },
  })

  const { output } = runJsonCli([
    'mission-report', '--project-root', root, '--mission', mission.id,
  ])
  assert.equal(output.mission.status, 'completed')
  assert.equal(output.currentCycle.execution.eventId, execution.id)
  assert.equal(output.currentCycle.validation.eventId, validation.id)
  assert.equal(output.currentCycle.validation.kind, 'finished')
})

test('mission-report exige flags singulares e rejeita desconhecidas', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [{
    id: 'mission-0001', title: 'Mission', objective: 'Audit',
    status: 'pending', dependencies: [],
  }] })

  for (const [args, message] of [
    [['mission-report', '--project-root', root], '--mission é obrigatório'],
    [[
      'mission-report', '--project-root', root,
      '--mission', 'mission-0001', '--mission', 'mission-0001',
    ], 'opção duplicada: --mission'],
    [[
      'mission-report', '--project-root', root,
      '--mission', 'mission-0001', '--extra', 'x',
    ], 'argumento desconhecido: --extra'],
  ]) {
    const result = runCli(args)
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim(), message)
  }
})

test('mission-report rejeita Mission inexistente', (t) => {
  const root = createRoot(t)
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  const result = runCli([
    'mission-report', '--project-root', root, '--mission', 'mission-9999',
  ])
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), 'Mission não existe')
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
