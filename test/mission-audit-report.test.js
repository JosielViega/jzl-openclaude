import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  recordMissionExecutionError,
  recordMissionExecutionSuccess,
  recordMissionPlanApproved,
  recordMissionPlanFinished,
  recordMissionPlanUnavailable,
  recordMissionReviewCorrectionRequested,
  recordMissionReviewFinished,
  recordMissionReviewUnavailable,
  recordMissionValidationFinished,
  recordMissionValidationUnavailable,
} from '../src/execution-history.js'
import { buildMissionAuditReport } from '../src/mission-audit-report.js'
import { createProjectContext } from '../src/project-context.js'
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
import { initializeProjectConfigStore } from '../src/project-config-store.js'
import {
  createProjectMission,
  prepareProjectMissionExecution,
  retryProjectMissionCorrection,
  submitProjectMissionForValidation,
} from '../src/mission-engine.js'
import { approveMissionPlan } from '../src/mission-plan-approval.js'
import { validateConfiguredProjectMission } from '../src/mission-validation.js'
import { ensureTraditionalWebProjectStructure } from '../src/traditional-web-structure.js'

function createMission(overrides = {}) {
  return {
    id: 'mission-0001',
    title: 'Mission auditável',
    objective: 'Produzir fatos auditáveis',
    status: 'pending',
    dependencies: [],
    ...overrides,
  }
}

function createFixture(t, mission = createMission()) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-mission-report-'))
  const context = createProjectContext(projectRoot)
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  initializeProjectStateStore(context)
  writeProjectStateStore(context, { schemaVersion: 1, missions: [mission] })
  return { context, projectRoot, mission }
}

function emptyCycle() {
  return {
    execution: null,
    validation: null,
    review: null,
    reviewCorrection: null,
  }
}

function recordPlan(context, suffix = 'one') {
  return recordMissionPlanFinished(context, {
    missionId: 'mission-0001',
    plan: {
      sessionId: `session-plan-${suffix}`,
      model: `model-plan-${suffix}`,
      summary: `Plano ${suffix}`,
      steps: [{ title: 'Passo', detail: `Detalhe ${suffix}`, paths: ['index.html'] }],
      risks: [],
      validation: ['Validar resultado'],
    },
  })
}

function recordSuccess(context, suffix, changeSet = {
  created: [], modified: ['index.html'], deleted: [],
}) {
  return recordMissionExecutionSuccess(context, {
    missionId: 'mission-0001',
    fromStatus: suffix === 'old' ? 'pending' : 'correction',
    execution: {
      sessionId: `session-execution-${suffix}`,
      model: 'synthetic-executor',
      result: `${suffix} execution`,
      changeSet,
    },
  })
}

test('Mission pending sem history retorna shape exato e não cria Event Store', (t) => {
  const { context, projectRoot, mission } = createFixture(t)
  const stateBefore = readFileSync(join(projectRoot, '.jzl', 'state.json'))
  const report = buildMissionAuditReport(context, mission.id)

  assert.deepEqual(Object.keys(report), ['mission', 'planning', 'currentCycle'])
  assert.deepEqual(report, {
    mission,
    planning: { plan: null, approval: null },
    currentCycle: emptyCycle(),
  })
  assert.equal(existsSync(join(projectRoot, '.jzl', 'events.json')), false)
  assert.deepEqual(readFileSync(join(projectRoot, '.jzl', 'state.json')), stateBefore)
})

test('Event Store vazio produz o mesmo relatório', (t) => {
  const { context, mission } = createFixture(t)
  initializeProjectEventStore(context)
  assert.deepEqual(buildMissionAuditReport(context, mission.id), {
    mission,
    planning: { plan: null, approval: null },
    currentCycle: emptyCycle(),
  })
})

test('Mission completa moderna é clonada e legacy permanece sem campos inventados', (t) => {
  const modern = createMission({
    status: 'completed', custom: { keep: true },
    acceptanceCriteria: [{ id: 'criterion-0001', type: 'file-exists', path: 'index.html' }],
    changeScope: { allowedPaths: ['index.html'] },
  })
  const { context } = createFixture(t, modern)
  const report = buildMissionAuditReport(context, modern.id)
  assert.deepEqual(report.mission, modern)
  report.mission.custom.keep = false
  report.mission.acceptanceCriteria[0].path = 'changed.html'
  assert.deepEqual(readProjectStateStore(context).missions[0], modern)

  const legacy = createMission()
  writeProjectStateStore(context, { schemaVersion: 1, missions: [legacy] })
  const legacyReport = buildMissionAuditReport(context, legacy.id)
  assert.equal(Object.hasOwn(legacyReport.mission, 'acceptanceCriteria'), false)
  assert.equal(Object.hasOwn(legacyReport.mission, 'changeScope'), false)
})

test('planning seleciona latest finished, ignora unavailable e mostra latest approval como fato', (t) => {
  const { context } = createFixture(t)
  const first = recordPlan(context, 'first')
  const firstApproval = recordMissionPlanApproved(context, {
    missionId: 'mission-0001', planEventId: first.id,
  })
  const second = recordPlan(context, 'second')
  recordMissionPlanUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null,
    error: new Error('indisponível'),
  })
  const lastApproval = recordMissionPlanApproved(context, {
    missionId: 'mission-0001', planEventId: first.id,
  })

  const report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.planning.plan.eventId, second.id)
  assert.equal(report.planning.plan.summary, 'Plano second')
  assert.equal(report.planning.approval.eventId, lastApproval.id)
  assert.equal(report.planning.approval.planEventId, firstApproval.data.planEventId)
  assert.equal(Object.hasOwn(report.planning.plan, 'type'), false)
})

test('execution SUCCESS moderna preserva dados, Change Set e metadata do envelope', (t) => {
  const { context } = createFixture(t)
  const execution = recordSuccess(context, 'current')
  const report = buildMissionAuditReport(context, 'mission-0001')

  assert.deepEqual(report.currentCycle.execution, {
    ...execution.data,
    eventId: execution.id,
    occurredAt: execution.occurredAt,
  })
  assert.deepEqual(report.currentCycle.execution.changeSet.modified, ['index.html'])
})

test('append order vence occurredAt e metadata do envelope não pode ser sobrescrita', (t) => {
  const { context, projectRoot } = createFixture(t)
  appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: 'mission-0001',
    data: {
      outcome: 'SUCCESS', fromStatus: 'pending', toStatus: 'validation',
      sessionId: 'session-first', result: 'first',
    },
  })
  const second = appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: 'mission-0001',
    data: {
      outcome: 'SUCCESS', fromStatus: 'correction', toStatus: 'validation',
      sessionId: 'session-second', result: 'second', additive: { keep: true },
      eventId: 'spoofed-event', occurredAt: 'spoofed-time',
    },
  })
  const eventsPath = join(projectRoot, '.jzl', 'events.json')
  const store = readProjectEventStore(context)
  store.events[0].occurredAt = '2099-01-01T00:00:00.000Z'
  store.events[1].occurredAt = '2000-01-01T00:00:00.000Z'
  writeFileSync(eventsPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')

  const execution = buildMissionAuditReport(context, 'mission-0001').currentCycle.execution
  assert.equal(execution.sessionId, 'session-second')
  assert.deepEqual(execution.additive, { keep: true })
  assert.equal(execution.eventId, second.id)
  assert.equal(execution.occurredAt, '2000-01-01T00:00:00.000Z')
})

test('execution legacy preserva ausência de model e changeSet', (t) => {
  const { context } = createFixture(t)
  const execution = appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: 'mission-0001',
    data: {
      outcome: 'SUCCESS', fromStatus: 'pending', toStatus: 'validation',
      sessionId: 'session-legacy', result: 'legacy',
    },
  })
  const report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.execution.eventId, execution.id)
  assert.equal(Object.hasOwn(report.currentCycle.execution, 'model'), false)
  assert.equal(Object.hasOwn(report.currentCycle.execution, 'changeSet'), false)
})

test('execution ERROR moderna ou legacy zera seções downstream', (t) => {
  const { context } = createFixture(t, createMission({ status: 'failed' }))
  recordSuccess(context, 'old')
  recordMissionValidationFinished(context, {
    missionId: 'mission-0001', toStatus: 'correction',
    validation: { status: 'FAIL', results: [{
      id: 'command', status: 'FAIL', evidence: {
        exitCode: 1, signal: null, stdout: '', stderr: '', errorMessage: null,
      },
    }] },
  })
  const errorEvent = recordMissionExecutionError(context, {
    missionId: 'mission-0001', fromStatus: 'correction',
    sessionId: 'session-error', model: 'synthetic-executor',
    error: new Error('falha sintética'), changeSet: null,
  })
  recordMissionValidationUnavailable(context, {
    missionId: 'mission-0001', error: new Error('evento artificial'),
  })
  recordMissionReviewUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null,
    error: new Error('review artificial'),
  })

  const report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.execution.eventId, errorEvent.id)
  assert.equal(report.currentCycle.execution.errorMessage, 'falha sintética')
  assert.equal(report.currentCycle.execution.changeSet, null)
  assert.deepEqual({
    validation: report.currentCycle.validation,
    review: report.currentCycle.review,
    reviewCorrection: report.currentCycle.reviewCorrection,
  }, { validation: null, review: null, reviewCorrection: null })
})

test('execution ERROR legacy preserva campos opcionais ausentes', (t) => {
  const { context } = createFixture(t, createMission({ status: 'failed' }))
  appendProjectEvent(context, {
    type: 'mission.execution.finished', missionId: 'mission-0001',
    data: {
      outcome: 'ERROR', fromStatus: 'pending', toStatus: 'failed',
      sessionId: null, errorMessage: 'legacy error',
    },
  })
  const execution = buildMissionAuditReport(context, 'mission-0001').currentCycle.execution
  assert.equal(execution.errorMessage, 'legacy error')
  assert.equal(Object.hasOwn(execution, 'model'), false)
  assert.equal(Object.hasOwn(execution, 'changeSet'), false)
})

test('eventos downstream sem execution anchor não formam current cycle', (t) => {
  const { context } = createFixture(t)
  recordMissionValidationUnavailable(context, {
    missionId: 'mission-0001', error: new Error('sem anchor'),
  })
  recordMissionReviewUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null,
    error: new Error('sem anchor'),
  })
  assert.deepEqual(buildMissionAuditReport(context, 'mission-0001').currentCycle, emptyCycle())
})

test('latest validation attempt após SUCCESS recebe kind e evidence intacta', (t) => {
  const { context } = createFixture(t)
  recordSuccess(context, 'current')
  recordMissionValidationUnavailable(context, {
    missionId: 'mission-0001', error: new Error('primeira tentativa'),
  })
  const validation = recordMissionValidationFinished(context, {
    missionId: 'mission-0001', toStatus: 'correction',
    validation: {
      status: 'FAIL',
      results: [
        { id: 'command', status: 'FAIL', evidence: {
          exitCode: 1, signal: null, stdout: 'out', stderr: 'err', errorMessage: null,
        } },
        { id: 'criterion-0001', status: 'FAIL', evidence: {
          exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
          criterionType: 'file-exists', path: 'index.html', satisfied: false,
        } },
        { id: 'mission-change-scope', status: 'FAIL', evidence: {
          exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
          scopeType: 'allowed-paths', violations: ['outside.txt'],
        } },
      ],
    },
  })
  const report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.validation.kind, 'finished')
  assert.equal(report.currentCycle.validation.eventId, validation.id)
  assert.deepEqual(report.currentCycle.validation.results, validation.data.results)
})

test('latest validation unavailable vence finished anterior', (t) => {
  const { context } = createFixture(t)
  recordSuccess(context, 'current')
  recordMissionValidationFinished(context, {
    missionId: 'mission-0001', toStatus: 'completed',
    validation: { status: 'PASS', results: [{
      id: 'command', status: 'PASS', evidence: {
        exitCode: 0, signal: null, stdout: '', stderr: '', errorMessage: null,
      },
    }] },
  })
  const unavailable = recordMissionValidationUnavailable(context, {
    missionId: 'mission-0001', error: new Error('latest unavailable'),
  })
  const report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.validation.kind, 'unavailable')
  assert.equal(report.currentCycle.validation.eventId, unavailable.id)
  assert.equal(report.currentCycle.validation.errorMessage, 'latest unavailable')
})

test('review usa latest attempt após anchor e exclui review do ciclo antigo', (t) => {
  const { context } = createFixture(t)
  recordSuccess(context, 'old')
  recordMissionReviewFinished(context, {
    missionId: 'mission-0001', review: {
      sessionId: 'session-review-old', model: 'reviewer', verdict: 'PASS',
      summary: 'old review', findings: [],
    },
  })
  recordSuccess(context, 'current')
  recordMissionReviewFinished(context, {
    missionId: 'mission-0001', review: {
      sessionId: 'session-review-current', model: 'reviewer', verdict: 'PASS',
      summary: 'current review', findings: [],
    },
  })
  const unavailable = recordMissionReviewUnavailable(context, {
    missionId: 'mission-0001', sessionId: null, model: null,
    error: new Error('latest review unavailable'),
  })
  const report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.review.kind, 'unavailable')
  assert.equal(report.currentCycle.review.eventId, unavailable.id)
  assert.equal(JSON.stringify(report.currentCycle).includes('session-review-old'), false)
})

test('review correction aparece somente depois da current execution', (t) => {
  const { context } = createFixture(t)
  const oldExecution = recordSuccess(context, 'old')
  const oldReview = recordMissionReviewFinished(context, {
    missionId: 'mission-0001', review: {
      sessionId: 'review-old', model: 'reviewer', verdict: 'CONCERNS',
      summary: 'old', findings: [{ severity: 'HIGH', title: 'Old', detail: 'Old', paths: [] }],
    },
  })
  recordMissionReviewCorrectionRequested(context, {
    missionId: 'mission-0001', reviewEventId: oldReview.id,
  })
  recordSuccess(context, 'current')
  let report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.reviewCorrection, null)
  const currentReview = recordMissionReviewFinished(context, {
    missionId: 'mission-0001', review: {
      sessionId: 'review-current', model: 'reviewer', verdict: 'CONCERNS',
      summary: 'current', findings: [{ severity: 'LOW', title: 'Current', detail: 'Current', paths: [] }],
    },
  })
  const correction = recordMissionReviewCorrectionRequested(context, {
    missionId: 'mission-0001', reviewEventId: currentReview.id,
  })
  report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.reviewCorrection.eventId, correction.id)
  assert.equal(report.currentCycle.reviewCorrection.reviewEventId, currentReview.id)
  assert.notEqual(report.currentCycle.execution.eventId, oldExecution.id)
})

test('segundo ciclo substitui execution e validation do primeiro', (t) => {
  const { context } = createFixture(t, createMission({ status: 'completed' }))
  const oldExecution = recordSuccess(context, 'old')
  recordMissionValidationFinished(context, {
    missionId: 'mission-0001', toStatus: 'correction',
    validation: { status: 'FAIL', results: [{
      id: 'old', status: 'FAIL', evidence: {
        exitCode: 1, signal: null, stdout: '', stderr: '', errorMessage: null,
      },
    }] },
  })
  const currentExecution = recordSuccess(context, 'current')
  const currentValidation = recordMissionValidationFinished(context, {
    missionId: 'mission-0001', toStatus: 'completed',
    validation: { status: 'PASS', results: [{
      id: 'current', status: 'PASS', evidence: {
        exitCode: 0, signal: null, stdout: '', stderr: '', errorMessage: null,
      },
    }] },
  })
  const report = buildMissionAuditReport(context, 'mission-0001')
  assert.equal(report.currentCycle.execution.eventId, currentExecution.id)
  assert.equal(report.currentCycle.validation.eventId, currentValidation.id)
  assert.equal(JSON.stringify(report.currentCycle).includes(oldExecution.id), false)
  assert.equal(JSON.stringify(report.currentCycle).includes('old execution'), false)
})

test('report detached e chamada isolada preserva bytes de State e Event Store', (t) => {
  const { context, projectRoot } = createFixture(t, createMission({
    changeScope: { allowedPaths: ['index.html'] },
  }))
  const plan = recordPlan(context, 'detached')
  recordSuccess(context, 'current')
  recordMissionReviewFinished(context, {
    missionId: 'mission-0001', review: {
      sessionId: 'review-detached', model: 'reviewer', verdict: 'PASS',
      summary: 'ok', findings: [],
    },
  })
  const statePath = join(projectRoot, '.jzl', 'state.json')
  const eventsPath = join(projectRoot, '.jzl', 'events.json')
  const stateBefore = readFileSync(statePath)
  const eventsBefore = readFileSync(eventsPath)
  const report = buildMissionAuditReport(context, 'mission-0001')
  report.mission.title = 'mutated'
  report.planning.plan.steps.push({ title: 'x', detail: 'x', paths: [] })
  report.currentCycle.execution.changeSet.modified.push('mutated.txt')
  report.currentCycle.review.findings.push({ severity: 'LOW', title: 'x', detail: 'x', paths: [] })

  assert.deepEqual(readFileSync(statePath), stateBefore)
  assert.deepEqual(readFileSync(eventsPath), eventsBefore)
  assert.equal(readProjectStateStore(context).missions[0].title, 'Mission auditável')
  assert.equal(readProjectEventStore(context).events.find(({ id }) => id === plan.id).data.steps.length, 1)
})

test('history corrompido e Mission inexistente propagam erros existentes', (t) => {
  const { context, projectRoot } = createFixture(t)
  writeFileSync(join(projectRoot, '.jzl', 'events.json'), '{', 'utf8')
  assert.throws(
    () => buildMissionAuditReport(context, 'mission-0001'),
    { message: 'arquivo de histórico do projeto contém JSON inválido' },
  )
  assert.throws(
    () => buildMissionAuditReport(context, 'mission-9999'),
    { message: 'Mission não existe' },
  )
})

test('smoke determinístico deriva plan e somente o segundo ciclo concluído', async (t) => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-mission-report-smoke-'))
  const context = createProjectContext(projectRoot)
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  ensureTraditionalWebProjectStructure(context)
  initializeProjectStateStore(context)
  writeFileSync(join(projectRoot, 'AGENTS.md'), '# Regras\n', 'utf8')
  writeFileSync(join(projectRoot, 'public', 'index.html'), '<h1>BEFORE</h1>\n', 'utf8')
  writeFileSync(join(projectRoot, 'src', 'config.php'), '<?php return [];\n', 'utf8')
  const fakePhp = join(projectRoot, '.jzl', 'fake-php.js')
  writeFileSync(fakePhp, 'process.exit(0)\n', 'utf8')
  initializeProjectConfigStore(context, {
    template: 'traditional-web',
    tools: { php: { executable: process.execPath, argsPrefix: [fakePhp] } },
  })
  const mission = createProjectMission(context, {
    title: 'Report smoke', objective: 'Alterar somente public/index.html',
    acceptanceCriteria: [{
      type: 'file-contains', path: 'public/index.html', text: 'AFTER_REPORT_SMOKE',
    }],
    changeScope: { allowedPaths: ['public/index.html'] },
  })
  const planEvent = recordMissionPlanFinished(context, {
    missionId: mission.id,
    plan: {
      sessionId: 'session-plan-report-smoke', model: 'synthetic-planner',
      summary: 'Alterar public/index.html',
      steps: [{ title: 'Alterar', detail: 'Atualizar index', paths: ['public/index.html'] }],
      risks: [], validation: ['Validar conteúdo'],
    },
  })
  const approvalEvent = approveMissionPlan(
    context,
    mission.id,
    planEvent.id,
  ).approvalEvent

  prepareProjectMissionExecution(context, mission.id)
  const oldExecution = recordMissionExecutionSuccess(context, {
    missionId: mission.id, fromStatus: 'pending',
    execution: {
      sessionId: 'session-execution-old', model: 'synthetic-executor',
      result: 'old execution',
      changeSet: { created: [], modified: ['public/index.html'], deleted: [] },
    },
  })
  submitProjectMissionForValidation(context, mission.id)
  const firstValidation = await validateConfiguredProjectMission(context, mission.id)
  assert.equal(firstValidation.mission.status, 'correction')

  retryProjectMissionCorrection(context, mission.id)
  writeFileSync(join(projectRoot, 'public', 'index.html'), '<h1>AFTER_REPORT_SMOKE</h1>\n', 'utf8')
  const currentExecution = recordMissionExecutionSuccess(context, {
    missionId: mission.id, fromStatus: 'correction',
    execution: {
      sessionId: 'session-execution-current', model: 'synthetic-executor',
      result: 'current execution',
      changeSet: { created: [], modified: ['public/index.html'], deleted: [] },
    },
  })
  submitProjectMissionForValidation(context, mission.id)
  const reviewEvent = recordMissionReviewFinished(context, {
    missionId: mission.id,
    review: {
      sessionId: 'session-review-current', model: 'synthetic-reviewer',
      verdict: 'PASS', summary: 'Revisão sintética do ciclo atual.', findings: [],
    },
  })
  const finalValidation = await validateConfiguredProjectMission(context, mission.id)
  assert.equal(finalValidation.mission.status, 'completed')

  const statePath = join(projectRoot, '.jzl', 'state.json')
  const eventsPath = join(projectRoot, '.jzl', 'events.json')
  const stateBefore = readFileSync(statePath)
  const eventsBefore = readFileSync(eventsPath)
  const report = buildMissionAuditReport(context, mission.id)
  assert.equal(report.mission.status, 'completed')
  assert.equal(report.planning.plan.eventId, planEvent.id)
  assert.equal(report.planning.approval.eventId, approvalEvent.id)
  assert.equal(report.currentCycle.execution.eventId, currentExecution.id)
  assert.equal(report.currentCycle.execution.sessionId, 'session-execution-current')
  assert.deepEqual(report.currentCycle.execution.changeSet.modified, ['public/index.html'])
  assert.equal(report.currentCycle.validation.outcome, 'PASS')
  assert.equal(report.currentCycle.review.eventId, reviewEvent.id)
  assert.equal(report.currentCycle.review.sessionId, 'session-review-current')
  assert.equal(report.currentCycle.review.kind, 'finished')
  assert.equal(report.currentCycle.reviewCorrection, null)
  assert.equal(JSON.stringify(report.currentCycle).includes(oldExecution.id), false)
  assert.equal(JSON.stringify(report.currentCycle).includes('session-execution-old'), false)
  assert.equal(JSON.stringify(report.currentCycle).includes('old execution'), false)
  assert.deepEqual(readFileSync(statePath), stateBefore)
  assert.deepEqual(readFileSync(eventsPath), eventsBefore)
})
