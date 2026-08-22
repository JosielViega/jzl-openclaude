import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { resolveMissionCorrectionHandoff } from '../src/handoff-processor.js'
import {
  appendProjectEvent,
  initializeProjectEventStore,
  readProjectEventStore,
} from '../src/project-event-store.js'

function createContext(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-handoff-processor-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return createProjectContext(projectRoot)
}

function result(id, status = 'FAIL', text = `diagnóstico ${id}`) {
  return {
    id,
    status,
    evidence: {
      exitCode: status === 'PASS' ? 0 : 1,
      signal: null,
      stdout: text,
      stderr: '',
      errorMessage: null,
    },
  }
}

function appendValidation(context, {
  missionId = 'mission-0001',
  outcome = 'FAIL',
  results = [result('validator-1')],
} = {}) {
  return appendProjectEvent(context, {
    type: 'mission.validation.finished',
    missionId,
    data: {
      outcome,
      fromStatus: 'validation',
      toStatus: outcome === 'PASS' ? 'completed' : 'correction',
      results,
    },
  })
}

test('resolve o último FAIL compatível como Handoff canônico', (t) => {
  const context = createContext(t)
  appendValidation(context, { results: [result('antigo')] })
  appendValidation(context, { missionId: 'mission-0002', results: [result('outra')] })
  appendValidation(context, { outcome: 'PASS', results: [result('pass', 'PASS')] })
  const selected = appendValidation(context, {
    results: [result('primeiro'), result('ignorado-pass', 'PASS'), result('segundo')],
  })

  const handoff = resolveMissionCorrectionHandoff(context, 'mission-0001')

  assert.deepEqual(handoff, {
    schemaVersion: 1,
    type: 'mission-correction',
    missionId: 'mission-0001',
    source: {
      responsibility: 'mission-validation',
      eventId: selected.id,
    },
    target: { responsibility: 'mission-execution' },
    payload: { failedValidators: [result('primeiro'), result('segundo')] },
  })
})

test('preserva todos os validators, ordem e evidence sem sanitizar', (t) => {
  const context = createContext(t)
  const longText = `${context.projectRoot}:${'x'.repeat(5000)}`
  const results = Array.from({ length: 25 }, (_, index) => (
    result(`validator-${index}`, 'FAIL', longText)
  ))
  appendValidation(context, { results })

  const handoff = resolveMissionCorrectionHandoff(context, 'mission-0001')

  assert.equal(handoff.payload.failedValidators.length, 25)
  assert.deepEqual(
    handoff.payload.failedValidators.map(({ id }) => id),
    results.map(({ id }) => id),
  )
  assert.equal(handoff.payload.failedValidators[0].evidence.stdout, longText)
})

test('não compartilha referências com o Event Store', (t) => {
  const context = createContext(t)
  appendValidation(context)
  const before = readProjectEventStore(context)
  const handoff = resolveMissionCorrectionHandoff(context, 'mission-0001')

  handoff.payload.failedValidators[0].evidence.stdout = 'mutado'

  assert.deepEqual(readProjectEventStore(context), before)
})

test('converte somente histórico ausente em Handoff indisponível', (t) => {
  const context = createContext(t)

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'handoff de correção da Mission não está disponível' },
  )
})

test('rejeita histórico sem FAIL compatível', (t) => {
  const context = createContext(t)
  appendValidation(context, { outcome: 'PASS', results: [result('pass', 'PASS')] })
  appendProjectEvent(context, {
    type: 'mission.validation.unavailable',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'indisponível' },
  })
  appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: 'mission-0001',
    data: {
      outcome: 'ERROR', fromStatus: 'pending', toStatus: 'failed',
      errorMessage: 'falha técnica',
    },
  })

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'handoff de correção da Mission não está disponível' },
  )
})

test('falha fechado quando evento FAIL não possui resultado FAIL', (t) => {
  const context = createContext(t)
  appendValidation(context, {
    outcome: 'FAIL',
    results: [result('resultado-pass', 'PASS')],
  })

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'handoff de correção da Mission não está disponível' },
  )
})

test('propaga corrupção JSON do Event Store', (t) => {
  const context = createContext(t)
  const eventStorePath = initializeProjectEventStore(context)
  writeFileSync(eventStorePath, '{', 'utf8')

  assert.throws(
    () => resolveMissionCorrectionHandoff(context, 'mission-0001'),
    { message: 'arquivo de histórico do projeto contém JSON inválido' },
  )
})

test('não altera bytes do projeto durante a resolução', (t) => {
  const context = createContext(t)
  const protectedPath = join(context.projectRoot, 'AGENTS.md')
  writeFileSync(protectedPath, 'conteúdo autoritativo\n', 'utf8')
  const before = readFileSync(protectedPath)
  appendValidation(context)

  resolveMissionCorrectionHandoff(context, 'mission-0001')

  assert.deepEqual(readFileSync(protectedPath), before)
})
