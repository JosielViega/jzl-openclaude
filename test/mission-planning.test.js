import assert from 'node:assert/strict'
import fs from 'node:fs'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { initializeProjectConfigStore } from '../src/project-config-store.js'
import { createProjectContext } from '../src/project-context.js'
import { readProjectEventStore } from '../src/project-event-store.js'
import { planProjectMission } from '../src/mission-planning.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

function setup(t, missions) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-mission-planning-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions })
  return context
}

function mission(status = 'pending', dependencies = []) {
  return {
    id: 'mission-0001', title: 'Planejar', objective: 'Mudança segura',
    status, dependencies,
  }
}

test('Mission inexistente não cria evento de planejamento', async (t) => {
  const context = setup(t, [])
  await assert.rejects(planProjectMission(context, 'mission-9999'), { message: 'Mission não existe' })
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

for (const status of ['running', 'failed', 'correction', 'validation', 'completed']) {
  test(`Mission ${status} rejeita planejamento antes do modelo`, async (t) => {
    const context = setup(t, [mission(status)])
    await assert.rejects(planProjectMission(context, 'mission-0001'), {
      message: 'Mission deve estar pending para planejamento',
    })
    assert.equal(readProjectStateStore(context).missions[0].status, status)
    assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
  })
}

test('Mission pending bloqueada rejeita antes do modelo e sem evento', async (t) => {
  const blocker = { ...mission('pending'), id: 'mission-0002' }
  const blocked = mission('pending', ['mission-0002'])
  const context = setup(t, [blocked, blocker])
  await assert.rejects(planProjectMission(context, blocked.id), {
    message: 'Mission deve estar pronta para planejamento',
  })
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

test('modelo ausente registra unavailable null/null e preserva pending', async (t) => {
  const context = setup(t, [mission()])
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  await assert.rejects(planProjectMission(context, 'mission-0001'), {
    message: 'modelo não configurado para responsabilidade mission-planning',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
  assert.deepEqual(readProjectEventStore(context).events[0].data, {
    sessionId: null,
    model: null,
    errorMessage: 'modelo não configurado para responsabilidade mission-planning',
  })
})

test('erro de Standards após rota conhecida audita model e sessionId null', async (t) => {
  const context = setup(t, [mission()])
  initializeProjectConfigStore(context, {
    template: 'traditional-web', models: { 'mission-planning': 'model-plan' },
  })
  const configPath = join(context.projectRoot, '.jzl', 'config.json')
  const originalReadFileSync = fs.readFileSync
  let configReads = 0
  fs.readFileSync = function (path, ...args) {
    if (String(path) === configPath && ++configReads === 2) {
      throw new Error('standards indisponíveis')
    }
    return originalReadFileSync.call(this, path, ...args)
  }
  syncBuiltinESMExports()
  try {
    await assert.rejects(planProjectMission(context, 'mission-0001'), {
      message: 'standards indisponíveis',
    })
  } finally {
    fs.readFileSync = originalReadFileSync
    syncBuiltinESMExports()
  }
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
  assert.deepEqual(readProjectEventStore(context).events[0].data, {
    sessionId: null, model: 'model-plan', errorMessage: 'standards indisponíveis',
  })
})

test('falha ao registrar unavailable produz AggregateError e preserva Mission', async (t) => {
  const context = setup(t, [mission()])
  mkdirSync(join(context.projectRoot, '.jzl', 'events.json'))
  await assert.rejects(planProjectMission(context, 'mission-0001'), (error) => {
    assert.ok(error instanceof AggregateError)
    assert.equal(error.message, 'O planejamento falhou e o histórico não pôde ser persistido')
    assert.deepEqual(error.errors.map(({ message }) => message), [
      'arquivo de configuração do projeto não existe',
      'arquivo de histórico do projeto não é um arquivo',
    ])
    return true
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
})

test('pré-condições podem ser consultadas repetidamente sem transição', async (t) => {
  const context = setup(t, [mission()])
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(planProjectMission(context, 'mission-0001'), /modelo não configurado/)
  }
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
  assert.equal(readProjectEventStore(context).events.length, 2)
})
