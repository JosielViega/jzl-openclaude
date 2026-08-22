import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { createProjectMission } from '../src/mission-engine.js'
import { runProjectMission } from '../src/project-runner.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

function createProject(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-project-runner-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return createProjectContext(projectRoot)
}

function writeMission(context, status) {
  initializeProjectStateStore(context)
  const mission = {
    id: 'mission-0001',
    title: 'A',
    objective: 'Executar A',
    status,
    dependencies: [],
  }
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  return mission
}

test('rejeita Store inexistente antes de executar modelo', async (t) => {
  await assert.rejects(runProjectMission(createProject(t), 'mission-0001'), {
    message: 'arquivo de estado do projeto não existe',
  })
})

test('rejeita Mission inexistente antes de executar modelo', async (t) => {
  const context = createProject(t)
  initializeProjectStateStore(context)
  await assert.rejects(runProjectMission(context, 'mission-9999'), {
    message: 'Mission não existe',
  })
})

test('rejeita Mission bloqueada por dependency', async (t) => {
  const context = createProject(t)
  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'A' })
  const blocked = createProjectMission(context, {
    title: 'B',
    objective: 'B',
    dependencies: ['mission-0001'],
  })

  await assert.rejects(runProjectMission(context, blocked.id), {
    message: 'Mission não está pronta para iniciar',
  })
})

for (const status of ['running', 'validation', 'completed']) {
  test(`rejeita Mission ${status} antes de executar modelo`, async (t) => {
    const context = createProject(t)
    const mission = writeMission(context, status)

    await assert.rejects(runProjectMission(context, mission.id), {
      message: 'Mission não pode ser executada no status atual',
    })
    assert.deepEqual(readProjectStateStore(context).missions, [mission])
  })
}

test('config ausente transforma running em failed e propaga erro', async (t) => {
  const context = createProject(t)
  initializeProjectStateStore(context)
  const mission = createProjectMission(context, { title: 'A', objective: 'A' })

  await assert.rejects(runProjectMission(context, mission.id), {
    message: 'arquivo de configuração do projeto não existe',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
})
