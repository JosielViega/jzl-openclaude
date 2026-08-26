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

import { initializeManagedProject } from '../src/managed-project.js'
import { createProjectContext } from '../src/project-context.js'
import { readProjectConfigStore } from '../src/project-config-store.js'
import {
  appendProjectEvent,
  readProjectEventStore,
} from '../src/project-event-store.js'
import { readProjectStateStore } from '../src/project-state-store.js'

function createProject(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-managed-project-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return { context: createProjectContext(projectRoot), projectRoot }
}

test('inicializa projeto traditional-web com config e state separados', (t) => {
  const { context, projectRoot } = createProject(t)
  const result = initializeManagedProject(context, {
    template: 'traditional-web',
  })

  assert.deepEqual(result, {
    projectRoot,
    config: {
      schemaVersion: 1,
      template: 'traditional-web',
      standardsProfile: 'traditional-web-v1',
      tools: {},
    },
    state: { schemaVersion: 1 },
  })
  assert.deepEqual(result.config, readProjectConfigStore(context))
  assert.deepEqual(result.state, readProjectStateStore(context))
  assert.equal(existsSync(join(projectRoot, '.jzl', 'config.json')), true)
  assert.equal(existsSync(join(projectRoot, '.jzl', 'state.json')), true)
  assert.equal(existsSync(join(projectRoot, '.jzl', 'events.json')), true)
  assert.deepEqual(readProjectEventStore(context), {
    schemaVersion: 1,
    events: [],
  })
  for (const path of [
    'public', 'public/assets', 'public/assets/css', 'public/assets/js',
    'public/assets/images', 'src',
  ]) assert.equal(existsSync(join(projectRoot, ...path.split('/'))), true)
  assert.equal(existsSync(join(projectRoot, 'database')), false)
  assert.equal(JSON.stringify(result.config).includes('projectRoot'), false)
  assert.equal(JSON.stringify(result.state).includes('projectRoot'), false)
  assert.notEqual(
    readFileSync(join(projectRoot, '.jzl', 'config.json'), 'utf8'),
    readFileSync(join(projectRoot, '.jzl', 'state.json'), 'utf8'),
  )
  assert.notEqual(
    readFileSync(join(projectRoot, '.jzl', 'events.json'), 'utf8'),
    readFileSync(join(projectRoot, '.jzl', 'state.json'), 'utf8'),
  )
})

test('inicializa projeto com PHP configurado', (t) => {
  const { context } = createProject(t)
  const result = initializeManagedProject(context, {
    template: 'traditional-web',
    tools: { php: { executable: process.execPath } },
  })

  assert.deepEqual(result.config.tools.php, {
    executable: process.execPath,
    argsPrefix: [],
  })
})

test('rerun é idempotente e não sobrescreve stores existentes', (t) => {
  const { context, projectRoot } = createProject(t)
  initializeManagedProject(context, {
    template: 'traditional-web',
    tools: { php: { executable: process.execPath } },
  })
  const configPath = join(projectRoot, '.jzl', 'config.json')
  const statePath = join(projectRoot, '.jzl', 'state.json')
  const eventsPath = join(projectRoot, '.jzl', 'events.json')
  appendProjectEvent(context, {
    type: 'mission.validation.unavailable',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'preservar' },
  })
  const configBefore = readFileSync(configPath, 'utf8')
  const stateBefore = readFileSync(statePath, 'utf8')
  const eventsBefore = readFileSync(eventsPath, 'utf8')
  rmSync(join(projectRoot, 'public', 'assets', 'images'), { recursive: true })

  const result = initializeManagedProject(context, {
    template: 'traditional-web',
    tools: { php: { executable: join(projectRoot, 'other-php.exe') } },
  })

  assert.equal(readFileSync(configPath, 'utf8'), configBefore)
  assert.equal(readFileSync(statePath, 'utf8'), stateBefore)
  assert.equal(readFileSync(eventsPath, 'utf8'), eventsBefore)
  assert.equal(result.config.tools.php.executable, process.execPath)
  assert.equal(existsSync(join(projectRoot, 'public', 'assets', 'images')), true)
})

test('rerun de projeto legacy preserva config sem standardsProfile', (t) => {
  const { context, projectRoot } = createProject(t)
  const configDirectory = join(projectRoot, '.jzl')
  const configPath = join(configDirectory, 'config.json')
  const legacyContent = '{\n  "schemaVersion": 1,\n  "template": "traditional-web",\n  "tools": {}\n}\n'
  mkdirSync(configDirectory)
  writeFileSync(configPath, legacyContent, 'utf8')

  const result = initializeManagedProject(context, { template: 'traditional-web' })

  assert.equal(readFileSync(configPath, 'utf8'), legacyContent)
  assert.deepEqual(result.config, {
    schemaVersion: 1, template: 'traditional-web', tools: {},
  })
  assert.equal(Object.hasOwn(result.config, 'standardsProfile'), false)
  assert.equal(existsSync(join(projectRoot, 'public', 'assets', 'images')), true)
  assert.equal(existsSync(join(projectRoot, '.jzl', 'state.json')), true)
  assert.equal(existsSync(join(projectRoot, '.jzl', 'events.json')), true)
})

test('input inválido falha antes de criar State Store', (t) => {
  const { context, projectRoot } = createProject(t)

  assert.throws(() => initializeManagedProject(context, {
    template: 'unsupported',
  }), { message: 'template da configuração do projeto não é suportado' })
  assert.equal(existsSync(join(projectRoot, '.jzl', 'state.json')), false)
  assert.equal(existsSync(join(projectRoot, '.jzl', 'config.json')), false)
  assert.equal(existsSync(join(projectRoot, 'public')), false)
  assert.equal(existsSync(join(projectRoot, 'src')), false)
})

test('conflito estrutural falha antes de Stores ou scaffold restante', (t) => {
  const { context, projectRoot } = createProject(t)
  writeFileSync(join(projectRoot, 'public'), 'preservar')

  assert.throws(() => initializeManagedProject(context, {
    template: 'traditional-web',
  }), { message: 'estrutura traditional-web requer diretório real: public' })
  assert.equal(readFileSync(join(projectRoot, 'public'), 'utf8'), 'preservar')
  assert.equal(existsSync(join(projectRoot, '.jzl')), false)
  assert.equal(existsSync(join(projectRoot, 'src')), false)
})

test('init não move arquivos existentes nem cria placeholders', (t) => {
  const { context, projectRoot } = createProject(t)
  writeFileSync(join(projectRoot, 'index.php'), '<?php')
  initializeManagedProject(context, { template: 'traditional-web' })
  assert.equal(readFileSync(join(projectRoot, 'index.php'), 'utf8'), '<?php')
  assert.equal(existsSync(join(projectRoot, 'public', 'index.php')), false)
  assert.equal(existsSync(join(projectRoot, 'public', 'assets', 'js', 'app.js')), false)
})
