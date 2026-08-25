import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  recordMissionPlanFinished,
  recordMissionPlanUnavailable,
} from '../src/execution-history.js'
import { approveMissionPlan } from '../src/mission-plan-approval.js'
import { createProjectContext } from '../src/project-context.js'
import { readProjectEventStore } from '../src/project-event-store.js'
import {
  initializeProjectStateStore,
  readProjectStateStore,
  writeProjectStateStore,
} from '../src/project-state-store.js'

function mission(status = 'pending', dependencies = []) {
  return {
    id: 'mission-0001', title: 'Aprovar plano', objective: 'Executar com contexto',
    status, dependencies,
  }
}

function setup(t, missions = [mission()]) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-plan-approval-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions })
  return context
}

function recordPlan(context, summary = 'Plano A') {
  return recordMissionPlanFinished(context, {
    missionId: 'mission-0001',
    plan: {
      sessionId: `session-${summary}`, model: 'planner-model', summary,
      steps: [{ title: 'Passo', detail: 'Detalhe', paths: ['index.html'] }],
      risks: [], validation: [],
    },
  })
}

test('aprova latest plan de Mission pending e ready sem alterar State', (t) => {
  const context = setup(t)
  const stateBefore = structuredClone(readProjectStateStore(context))
  const plan = recordPlan(context)
  const result = approveMissionPlan(context, 'mission-0001', plan.id)
  assert.equal(result.mission.status, 'pending')
  assert.equal(result.approvalEvent.type, 'mission.plan.approved')
  assert.deepEqual(result.approvalEvent.data, { planEventId: plan.id })
  assert.deepEqual(Object.keys(result.approvalEvent.data), ['planEventId'])
  assert.equal(JSON.stringify(result.approvalEvent).includes('session'), false)
  assert.equal(JSON.stringify(result.approvalEvent).includes('planner-model'), false)
  assert.deepEqual(readProjectStateStore(context), stateBefore)
})

for (const status of ['running', 'validation', 'completed', 'failed', 'correction']) {
  test(`rejeita Mission ${status} sem criar approval`, (t) => {
    const context = setup(t, [mission(status)])
    const plan = recordPlan(context)
    assert.throws(() => approveMissionPlan(context, 'mission-0001', plan.id), {
      message: 'Mission deve estar pending para aprovação de plano',
    })
    assert.equal(readProjectEventStore(context).events.length, 1)
  })
}

test('rejeita Mission pending bloqueada por readiness', (t) => {
  const context = setup(t, [
    mission('pending', ['mission-0002']),
    { ...mission(), id: 'mission-0002' },
  ])
  const plan = recordPlan(context)
  assert.throws(() => approveMissionPlan(context, 'mission-0001', plan.id), {
    message: 'Mission deve estar pronta para aprovação de plano',
  })
})

test('rejeita planEventId inválido, inexistente e tipo incorreto', (t) => {
  const context = setup(t)
  assert.throws(() => approveMissionPlan(context, 'mission-0001', 'event-1'), {
    message: 'planEventId de planejamento é inválido',
  })
  recordMissionPlanUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null, error: 'falha',
  })
  assert.throws(() => approveMissionPlan(context, 'mission-0001', 'event-999999'), {
    message: 'evento de planejamento não está disponível para a Mission',
  })
  assert.throws(() => approveMissionPlan(context, 'mission-0001', 'event-000001'), {
    message: 'evento informado não é um planejamento concluído',
  })
})

test('somente latest plan.finished pode ser aprovado', (t) => {
  const context = setup(t)
  const planA = recordPlan(context, 'Plano A')
  recordPlan(context, 'Plano B')
  assert.throws(() => approveMissionPlan(context, 'mission-0001', planA.id), {
    message: 'evento de planejamento não é o planejamento concluído mais recente da Mission',
  })
})

test('plan.unavailable não substitui latest plan.finished', (t) => {
  const context = setup(t)
  const plan = recordPlan(context)
  recordMissionPlanUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null, error: 'falha posterior',
  })
  assert.equal(approveMissionPlan(context, 'mission-0001', plan.id).approvalEvent.data.planEventId, plan.id)
})

test('aprovação repetida cria dois eventos e preserva Mission pending', (t) => {
  const context = setup(t)
  const plan = recordPlan(context)
  const first = approveMissionPlan(context, 'mission-0001', plan.id)
  const second = approveMissionPlan(context, 'mission-0001', plan.id)
  assert.notEqual(first.approvalEvent.id, second.approvalEvent.id)
  assert.deepEqual(
    readProjectEventStore(context).events.map(({ type }) => type),
    ['mission.plan.finished', 'mission.plan.approved', 'mission.plan.approved'],
  )
  assert.equal(readProjectStateStore(context).missions[0].status, 'pending')
})
