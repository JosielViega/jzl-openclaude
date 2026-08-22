import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { executeProjectMission } from '../src/mission-execution.js'
import { createProjectMission } from '../src/mission-engine.js'
import {
  appendProjectEvent,
  initializeProjectEventStore,
  readProjectEventStore,
} from '../src/project-event-store.js'
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

function validationResult(id = 'php-syntax:index.php', status = 'FAIL') {
  return {
    id,
    status,
    evidence: {
      exitCode: status === 'PASS' ? 0 : 1,
      signal: null,
      stdout: '',
      stderr: status === 'FAIL' ? 'falha de validação' : '',
      errorMessage: null,
    },
  }
}

function appendValidationFailure(context, missionId = 'mission-0001') {
  return appendProjectEvent(context, {
    type: 'mission.validation.finished',
    missionId,
    data: {
      outcome: 'FAIL',
      fromStatus: 'validation',
      toStatus: 'correction',
      results: [validationResult()],
    },
  })
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
    sessionId: null,
    errorMessage: 'arquivo de configuração do projeto não existe',
  })
})

test('erro técnico registra execução partindo de failed sem usar erro anterior', async (t) => {
    const context = createTemporaryContext(t)
    const mission = {
      id: 'mission-0001',
      title: 'A',
      objective: 'Executar A',
      status: 'failed',
      dependencies: [],
    }
    initializeProjectStateStore(context)
    writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
    appendProjectEvent(context, {
      type: 'mission.execution.finished',
      missionId: mission.id,
      data: {
        outcome: 'ERROR',
        fromStatus: 'pending',
        toStatus: 'failed',
        errorMessage: 'provider indisponível',
      },
    })

    await assert.rejects(executeProjectMission(context, mission.id), {
      message: 'arquivo de configuração do projeto não existe',
    })
    const events = readProjectEventStore(context).events
    const event = events.at(-1)
    assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
    assert.equal(event.data.fromStatus, 'failed')
  assert.equal(event.data.toStatus, 'failed')
    assert.equal(event.data.sessionId, null)
    assert.equal(events.length, 2)
})

test('correction sem Event Store falha no preflight sem transição ou evento', async (t) => {
  const context = createTemporaryContext(t)
  const mission = {
    id: 'mission-0001',
    title: 'A',
    objective: 'Executar A',
    status: 'correction',
    dependencies: [],
  }
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'feedback de correção da Mission não está disponível',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'correction')
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

test('correction com Event Store vazio falha sem transição ou novo evento', async (t) => {
  const context = createTemporaryContext(t)
  const mission = {
    id: 'mission-0001', title: 'A', objective: 'A', status: 'correction', dependencies: [],
  }
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  initializeProjectEventStore(context)

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'feedback de correção da Mission não está disponível',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'correction')
  assert.deepEqual(readProjectEventStore(context).events, [])
})

test('correction ignora histórico com apenas PASS e ERROR', async (t) => {
  const context = createTemporaryContext(t)
  const mission = {
    id: 'mission-0001', title: 'A', objective: 'A', status: 'correction', dependencies: [],
  }
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  appendProjectEvent(context, {
    type: 'mission.validation.finished',
    missionId: mission.id,
    data: {
      outcome: 'PASS', fromStatus: 'validation', toStatus: 'completed',
      results: [validationResult('pass', 'PASS')],
    },
  })
  appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: mission.id,
    data: {
      outcome: 'ERROR', fromStatus: 'pending', toStatus: 'failed',
      errorMessage: 'falha técnica',
    },
  })
  const before = readProjectEventStore(context)

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'feedback de correção da Mission não está disponível',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'correction')
  assert.deepEqual(readProjectEventStore(context), before)
})

test('correction com FAIL válido inicia e trata falha técnica normalmente', async (t) => {
  const context = createTemporaryContext(t)
  const mission = {
    id: 'mission-0001', title: 'A', objective: 'A', status: 'correction', dependencies: [],
  }
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  appendValidationFailure(context, mission.id)

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'arquivo de configuração do projeto não existe',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  const event = readProjectEventStore(context).events.at(-1)
  assert.equal(event.type, 'mission.execution.finished')
  assert.deepEqual(event.data, {
    outcome: 'ERROR',
    fromStatus: 'correction',
    toStatus: 'failed',
    sessionId: null,
    errorMessage: 'arquivo de configuração do projeto não existe',
  })
})

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
