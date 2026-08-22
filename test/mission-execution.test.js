import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { executeProjectMission } from '../src/mission-execution.js'
import { createProjectMission } from '../src/mission-engine.js'
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
})

test('rejeita Mission inexistente antes de executar OpenClaude', async (t) => {
  const context = createTemporaryContext(t)

  initializeProjectStateStore(context)

  await assert.rejects(
    executeProjectMission(context, 'mission-9999'),
    { message: 'Mission não existe' },
  )
  assert.deepEqual(readProjectStateStore(context), { schemaVersion: 1 })
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
})
