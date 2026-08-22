import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { executeProjectMission } from '../src/mission-execution.js'
import { createProjectMission } from '../src/mission-engine.js'
import { readProjectEventStore } from '../src/project-event-store.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

function createTemporaryContext(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-mission-execution-'))

  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))

  return createProjectContext(projectRoot)
}

test('rejeita State Store inexistente antes de executar OpenClaude', async (t) => {
  const context = createTemporaryContext(t)

  await assert.rejects(
    executeProjectMission(context, 'mission-0001'),
    { message: 'arquivo de estado do projeto não existe' },
  )
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

test('rejeita Mission inexistente antes de executar OpenClaude', async (t) => {
  const context = createTemporaryContext(t)

  initializeProjectStateStore(context)

  await assert.rejects(
    executeProjectMission(context, 'mission-9999'),
    { message: 'Mission não existe' },
  )
  assert.deepEqual(readProjectStateStore(context), { schemaVersion: 1 })
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

test('rejeita dependency bloqueada sem iniciar execução', async (t) => {
  const context = createTemporaryContext(t)

  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'Executar A' })
  createProjectMission(context, {
    title: 'B',
    objective: 'Executar B',
    dependencies: ['mission-0001'],
  })

  await assert.rejects(
    executeProjectMission(context, 'mission-0002'),
    { message: 'Mission não está pronta para iniciar' },
  )
  assert.deepEqual(
    readProjectStateStore(context).missions.map((mission) => mission.status),
    ['pending', 'pending'],
  )
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

test('rejeita statuses não executáveis sem reescrever estado', async (t) => {
  for (const status of ['running', 'validation', 'completed']) {
    const context = createTemporaryContext(t)
    const state = {
      schemaVersion: 1,
      missions: [{
        id: 'mission-0001',
        title: 'A',
        objective: 'Executar A',
        status,
        dependencies: [],
      }],
    }

    initializeProjectStateStore(context)
    writeProjectStateStore(context, state)

    await assert.rejects(
      executeProjectMission(context, 'mission-0001'),
      { message: 'Mission não pode ser executada no status atual' },
    )
    assert.deepEqual(readProjectStateStore(context), state)
    assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
  }
})

test('config ausente falha Mission running antes de executar OpenClaude', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  const mission = createProjectMission(context, {
    title: 'A',
    objective: 'Executar A',
  })

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'arquivo de configuração do projeto não existe',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  const [event] = readProjectEventStore(context).events
  assert.equal(event.type, 'mission.execution.finished')
  assert.deepEqual(event.data, {
    outcome: 'ERROR',
    fromStatus: 'pending',
    toStatus: 'failed',
    errorMessage: 'arquivo de configuração do projeto não existe',
  })
})

for (const fromStatus of ['failed', 'correction']) {
  test(`erro técnico registra execução partindo de ${fromStatus}`, async (t) => {
    const context = createTemporaryContext(t)
    const mission = {
      id: 'mission-0001',
      title: 'A',
      objective: 'Executar A',
      status: fromStatus,
      dependencies: [],
    }
    initializeProjectStateStore(context)
    writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })

    await assert.rejects(executeProjectMission(context, mission.id), {
      message: 'arquivo de configuração do projeto não existe',
    })
    const [event] = readProjectEventStore(context).events
    assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
    assert.equal(event.data.fromStatus, fromStatus)
    assert.equal(event.data.toStatus, 'failed')
  })
}

test('falha de history após failed preserva estado e ambos os erros', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  const mission = createProjectMission(context, { title: 'A', objective: 'A' })
  mkdirSync(join(context.projectRoot, '.jzl', 'events.json'))

  await assert.rejects(
    executeProjectMission(context, mission.id),
    (error) => {
      assert.ok(error instanceof AggregateError)
      assert.equal(
        error.message,
        'A execução falhou e o histórico não pôde ser persistido',
      )
      assert.deepEqual(error.errors.map(({ message }) => message), [
        'arquivo de configuração do projeto não existe',
        'arquivo de histórico do projeto não é um arquivo',
      ])
      return true
    },
  )
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
})
