import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { initializeProjectConfigStore } from '../src/project-config-store.js'
import { readProjectEventStore } from '../src/project-event-store.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'
import { reviewProjectMission } from '../src/mission-review.js'

function createContext(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-mission-review-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return createProjectContext(projectRoot)
}

function persistMission(context, status = 'validation') {
  const mission = {
    id: 'mission-0001', title: 'Revisar', objective: 'Código correto',
    status, dependencies: [],
  }
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  return mission
}

test('Mission inexistente não cria review event', async (t) => {
  const context = createContext(t)
  initializeProjectStateStore(context)

  await assert.rejects(reviewProjectMission(context, 'mission-9999'), {
    message: 'Mission não existe',
  })
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

for (const status of ['pending', 'running', 'failed', 'correction', 'completed']) {
  test(`Mission ${status} rejeita review antes de Standards`, async (t) => {
    const context = createContext(t)
    const mission = persistMission(context, status)

    await assert.rejects(reviewProjectMission(context, mission.id), {
      message: 'Mission deve estar validation para revisão',
    })
    assert.equal(readProjectStateStore(context).missions[0].status, status)
    assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
  })
}

test('Config ausente registra review unavailable e preserva validation', async (t) => {
  const context = createContext(t)
  const mission = persistMission(context)

  await assert.rejects(reviewProjectMission(context, mission.id), {
    message: 'arquivo de configuração do projeto não existe',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  const events = readProjectEventStore(context).events
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'mission.review.unavailable')
  assert.deepEqual(events[0].data, {
    sessionId: null,
    model: null,
    errorMessage: 'arquivo de configuração do projeto não existe',
  })
})

test('modelo de review ausente registra unavailable com audit model null', async (t) => {
  const context = createContext(t)
  const mission = persistMission(context)
  initializeProjectConfigStore(context, { template: 'traditional-web' })

  await assert.rejects(reviewProjectMission(context, mission.id), {
    message: 'modelo não configurado para responsabilidade mission-review',
  })

  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
  assert.deepEqual(readProjectEventStore(context).events[0].data, {
    sessionId: null,
    model: null,
    errorMessage: 'modelo não configurado para responsabilidade mission-review',
  })
})

test('falha ao registrar unavailable agrega erros sem alterar Mission', async (t) => {
  const context = createContext(t)
  const mission = persistMission(context)
  mkdirSync(join(context.projectRoot, '.jzl', 'events.json'))

  await assert.rejects(reviewProjectMission(context, mission.id), (error) => {
    assert.ok(error instanceof AggregateError)
    assert.equal(error.message, 'A revisão falhou e o histórico não pôde ser persistido')
    assert.deepEqual(error.errors.map(({ message }) => message), [
      'arquivo de configuração do projeto não existe',
      'arquivo de histórico do projeto não é um arquivo',
    ])
    return true
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
})
