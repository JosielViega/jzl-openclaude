import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { requestMissionReviewCorrection } from '../src/mission-review-correction.js'
import { createProjectContext } from '../src/project-context.js'
import { appendProjectEvent, readProjectEventStore } from '../src/project-event-store.js'
import { initializeProjectStateStore, readProjectStateStore, writeProjectStateStore } from '../src/project-state-store.js'

function setup(t, status = 'validation') {
  const root = mkdtempSync(join(tmpdir(), 'jzl-review-correction-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  initializeProjectStateStore(context)
  writeProjectStateStore(context, {
    schemaVersion: 1,
    missions: [{ id: 'mission-0001', title: 'A', objective: 'A', status, dependencies: [] }],
  })
  return context
}

function execution(context) {
  return appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: 'mission-0001',
    data: { outcome: 'SUCCESS', fromStatus: 'pending', toStatus: 'validation', sessionId: 'execution-session', result: 'ok' },
  })
}

function review(context, verdict = 'CONCERNS') {
  return appendProjectEvent(context, {
    type: 'mission.review.finished', missionId: 'mission-0001',
    data: {
      sessionId: `review-${verdict}`,
      verdict,
      summary: verdict === 'PASS' ? 'Tudo certo' : 'Há problema',
      findings: verdict === 'PASS' ? [] : [{ severity: 'HIGH', title: 'Falha', detail: 'Corrigir', paths: ['index.php'] }],
    },
  })
}

test('autoriza CONCERNS atual somente após persistir correction', (t) => {
  const context = setup(t)
  execution(context)
  const source = review(context)

  const output = requestMissionReviewCorrection(context, 'mission-0001', source.id)

  assert.equal(output.mission.status, 'correction')
  assert.deepEqual(output.authorizationEvent.data, {
    reviewEventId: source.id, fromStatus: 'validation', toStatus: 'correction',
  })
  assert.deepEqual(Object.keys(output.authorizationEvent.data), ['reviewEventId', 'fromStatus', 'toStatus'])
  assert.equal(readProjectStateStore(context).missions[0].status, 'correction')
})

for (const status of ['pending', 'running', 'failed', 'correction', 'completed']) {
  test(`rejeita Mission ${status} sem criar evento`, (t) => {
    const context = setup(t, status)
    assert.throws(
      () => requestMissionReviewCorrection(context, 'mission-0001', 'event-000001'),
      { message: 'Mission deve estar validation para solicitar correção de revisão' },
    )
    assert.equal(readProjectStateStore(context).missions[0].status, status)
  })
}

test('rejeita reviewEventId inválido e evento inexistente', (t) => {
  const context = setup(t)
  assert.throws(() => requestMissionReviewCorrection(context, 'mission-0001', 'event-1'), {
    message: 'reviewEventId de revisão é inválido',
  })
  execution(context)
  assert.throws(() => requestMissionReviewCorrection(context, 'mission-0001', 'event-999999'), {
    message: 'evento de revisão não está disponível para a Mission',
  })
})

test('rejeita evento que não seja review e review PASS sem mudar State', (t) => {
  const context = setup(t)
  const executionEvent = execution(context)
  assert.throws(() => requestMissionReviewCorrection(context, 'mission-0001', executionEvent.id), {
    message: 'evento informado não é uma revisão concluída',
  })
  const pass = review(context, 'PASS')
  assert.throws(() => requestMissionReviewCorrection(context, 'mission-0001', pass.id), {
    message: 'revisão não possui CONCERNS para correção',
  })
  assert.equal(readProjectStateStore(context).missions[0].status, 'validation')
})

test('aceita somente a review.finished mais recente', (t) => {
  const context = setup(t)
  execution(context)
  const old = review(context)
  review(context)
  assert.throws(() => requestMissionReviewCorrection(context, 'mission-0001', old.id), {
    message: 'evento de revisão não é a revisão concluída mais recente da Mission',
  })
})

test('rejeita review stale e ausência de execution SUCCESS', (t) => {
  const context = setup(t)
  const stale = review(context)
  execution(context)
  assert.throws(() => requestMissionReviewCorrection(context, 'mission-0001', stale.id), {
    message: 'revisão não pertence ao ciclo atual de execução da Mission',
  })

  const other = setup(t)
  const source = review(other)
  assert.throws(() => requestMissionReviewCorrection(other, 'mission-0001', source.id), {
    message: 'revisão não pertence ao ciclo atual de execução da Mission',
  })
})

test('review.unavailable não substitui a última review concluída', (t) => {
  const context = setup(t)
  execution(context)
  const source = review(context)
  appendProjectEvent(context, {
    type: 'mission.review.unavailable', missionId: 'mission-0001',
    data: { sessionId: null, errorMessage: 'indisponível' },
  })
  const output = requestMissionReviewCorrection(context, 'mission-0001', source.id)
  assert.equal(output.mission.status, 'correction')
  assert.equal(readProjectEventStore(context).events.at(-1).data.reviewEventId, source.id)
})
