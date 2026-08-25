import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { initializeProjectConfigStore } from '../src/project-config-store.js'
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

function appendPlan(context, summary = 'Plano') {
  return appendProjectEvent(context, {
    type: 'mission.plan.finished', missionId: 'mission-0001',
    data: {
      sessionId: 'plan-session', model: 'plan-model', summary,
      steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['index.html'] }],
      risks: [], validation: [],
    },
  })
}

function appendPlanApproval(context, planEventId) {
  return appendProjectEvent(context, {
    type: 'mission.plan.approved', missionId: 'mission-0001',
    data: { planEventId },
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

test('falha no snapshot BEFORE preserva pending e não cria execution event', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  const mission = createProjectMission(context, { title: 'A', objective: 'A' })
  const longSegments = Array.from({ length: 6 }, (_, index) => (
    `${index}-${'x'.repeat(87)}`
  ))
  mkdirSync(join(context.projectRoot, ...longSegments), { recursive: true })

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'path do snapshot excede o limite permitido',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
  assert.equal(existsSync(join(context.projectRoot, '.jzl', 'events.json')), false)
})

test('pending com plan.finished sem approval continua execução normal', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'A' })
  appendPlan(context)
  await assert.rejects(executeProjectMission(context, 'mission-0001'), {
    message: 'arquivo de configuração do projeto não existe',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  assert.equal(readProjectEventStore(context).events.at(-1).type, 'mission.execution.finished')
})

test('pending com approval stale falha antes de running e de execução', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'A' })
  const planA = appendPlan(context, 'A')
  appendPlanApproval(context, planA.id)
  appendPlan(context, 'B')
  const before = readProjectEventStore(context)
  await assert.rejects(executeProjectMission(context, 'mission-0001'), {
    message: 'handoff de plano da Mission não está disponível',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
  assert.deepEqual(readProjectEventStore(context), before)
})

test('pending com latest approval relacionalmente inválido falha fechado', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  createProjectMission(context, { title: 'A', objective: 'A' })
  appendPlanApproval(context, 'event-999999')
  await assert.rejects(executeProjectMission(context, 'mission-0001'), {
    message: 'handoff de plano da Mission não está disponível',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
  assert.equal(readProjectEventStore(context).events.length, 1)
})

test('correction ignora plan approval antigo e usa Handoff de correção', async (t) => {
  const context = createTemporaryContext(t)
  const correctionMission = {
    id: 'mission-0001', title: 'A', objective: 'A', status: 'correction', dependencies: [],
  }
  initializeProjectStateStore(context)
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  writeProjectStateStore(context, { schemaVersion: 1, missions: [correctionMission] })
  const plan = appendPlan(context)
  appendPlanApproval(context, plan.id)
  appendValidationFailure(context)
  await assert.rejects(executeProjectMission(context, 'mission-0001'), /modelo não configurado/)
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  assert.equal(readProjectEventStore(context).events.at(-1).data.fromStatus, 'correction')
})

test('failed retry ignora plan approval antigo', async (t) => {
  const context = createTemporaryContext(t)
  const failedMission = {
    id: 'mission-0001', title: 'A', objective: 'A', status: 'failed', dependencies: [],
  }
  initializeProjectStateStore(context)
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  writeProjectStateStore(context, { schemaVersion: 1, missions: [failedMission] })
  const plan = appendPlan(context)
  appendPlanApproval(context, plan.id)
  await assert.rejects(executeProjectMission(context, 'mission-0001'), /modelo não configurado/)
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  assert.equal(readProjectEventStore(context).events.at(-1).data.fromStatus, 'failed')
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
    model: null,
    errorMessage: 'arquivo de configuração do projeto não existe',
    changeSet: { created: [], modified: [], deleted: [] },
  })
})

test('modelo de execution ausente falha fechada com audit model null', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  const mission = createProjectMission(context, { title: 'A', objective: 'Executar A' })

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'modelo não configurado para responsabilidade mission-execution',
  })

  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  assert.deepEqual(readProjectEventStore(context).events[0].data, {
    outcome: 'ERROR',
    fromStatus: 'pending',
    toStatus: 'failed',
    sessionId: null,
    model: null,
    errorMessage: 'modelo não configurado para responsabilidade mission-execution',
    changeSet: { created: [], modified: [], deleted: [] },
  })
})

test('retry failed sem modelo volta a failed com audit model null', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [{
      id: 'mission-0001', title: 'A', objective: 'A', status: 'failed', dependencies: [],
    }],
  })

  await assert.rejects(executeProjectMission(context, 'mission-0001'), {
    message: 'modelo não configurado para responsabilidade mission-execution',
  })

  const event = readProjectEventStore(context).events[0]
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  assert.equal(event.data.fromStatus, 'failed')
  assert.equal(event.data.model, null)
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
    message: 'handoff de correção da Mission não está disponível',
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
    message: 'handoff de correção da Mission não está disponível',
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
    message: 'handoff de correção da Mission não está disponível',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'correction')
  assert.deepEqual(readProjectEventStore(context), before)
})

test('correction rejeita evento FAIL sem resultado FAIL no preflight', async (t) => {
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
      outcome: 'FAIL', fromStatus: 'validation', toStatus: 'correction',
      results: [validationResult('pass', 'PASS')],
    },
  })
  const before = readProjectEventStore(context)

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'handoff de correção da Mission não está disponível',
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
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  appendValidationFailure(context, mission.id)

  await assert.rejects(executeProjectMission(context, mission.id), {
    message: 'modelo não configurado para responsabilidade mission-execution',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'failed')
  const event = readProjectEventStore(context).events.at(-1)
  assert.equal(event.type, 'mission.execution.finished')
  assert.deepEqual(event.data, {
    outcome: 'ERROR',
    fromStatus: 'correction',
    toStatus: 'failed',
    sessionId: null,
    model: null,
    errorMessage: 'modelo não configurado para responsabilidade mission-execution',
    changeSet: { created: [], modified: [], deleted: [] },
  })
})

test('falha de history após failed preserva estado e ambos os erros', async (t) => {
  const context = createTemporaryContext(t)
  initializeProjectStateStore(context)
  const mission = createProjectMission(context, { title: 'A', objective: 'A' })
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [{ ...mission, status: 'failed' }],
  })
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
