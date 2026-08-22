import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  buildMissionExecutionContext,
  resolveMissionCorrectionFeedback,
} from '../src/context-builder.js'
import { createProjectContext } from '../src/project-context.js'
import {
  appendProjectEvent,
  initializeProjectEventStore,
  readProjectEventStore,
} from '../src/project-event-store.js'

function createContext(t, prefix = 'jzl-context-builder-') {
  const projectRoot = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return createProjectContext(projectRoot)
}

function evidence(overrides = {}) {
  return {
    exitCode: 1,
    signal: null,
    stdout: '',
    stderr: 'falha',
    errorMessage: null,
    ...overrides,
  }
}

function result(id, status = 'FAIL', evidenceOverrides = {}) {
  return { id, status, evidence: evidence(evidenceOverrides) }
}

function appendValidation(context, {
  missionId = 'mission-0001',
  outcome = 'FAIL',
  results = [result('php-syntax:index.php')],
} = {}) {
  const toStatus = {
    PASS: 'completed',
    FAIL: 'correction',
    ERROR: 'validation',
  }[outcome]

  return appendProjectEvent(context, {
    type: 'mission.validation.finished',
    missionId,
    data: { outcome, fromStatus: 'validation', toStatus, results },
  })
}

function runningMission(overrides = {}) {
  return {
    id: 'mission-0001',
    title: 'Corrigir arquivo',
    objective: 'Corrigir o problema encontrado',
    status: 'running',
    dependencies: [],
    ...overrides,
  }
}

function standards(overrides = {}) {
  return {
    id: 'traditional-web-v1',
    instructions: ['Primeira regra.', 'Segunda regra.'],
    ...overrides,
  }
}

function feedback(overrides = {}) {
  return {
    eventId: 'event-000001',
    failedValidators: [result('php-syntax:index.php')],
    omittedCount: 0,
    ...overrides,
  }
}

test('seleciona somente o último FAIL compatível da Mission', (t) => {
  const context = createContext(t)
  appendValidation(context, { results: [result('fail-antigo')] })
  appendValidation(context, { outcome: 'PASS', results: [result('pass', 'PASS')] })
  appendProjectEvent(context, {
    type: 'mission.validation.unavailable',
    missionId: 'mission-0001',
    data: { status: 'validation', errorMessage: 'indisponível' },
  })
  appendValidation(context, {
    missionId: 'mission-0002',
    results: [result('outra-mission')],
  })
  const newest = appendValidation(context, {
    results: [
      result('pass-ignorado', 'PASS'),
      result('fail-novo', 'FAIL', { stderr: 'novo' }),
      result('error-ignorado', 'ERROR'),
    ],
  })
  const storeSnapshot = readProjectEventStore(context)

  const resolved = resolveMissionCorrectionFeedback(context, 'mission-0001')

  assert.equal(resolved.eventId, newest.id)
  assert.deepEqual(resolved.failedValidators.map(({ id }) => id), ['fail-novo'])
  assert.equal(resolved.failedValidators[0].evidence.stderr, 'novo')
  assert.equal(resolved.omittedCount, 0)
  assert.equal(JSON.stringify(resolved).includes('fail-antigo'), false)
  assert.equal(JSON.stringify(resolved).includes('pass-ignorado'), false)
  assert.equal(JSON.stringify(resolved).includes('error-ignorado'), false)
  assert.deepEqual(readProjectEventStore(context), storeSnapshot)
})

test('ignora eventos não FAIL e falha quando não existe feedback compatível', (t) => {
  const context = createContext(t)
  appendProjectEvent(context, {
    type: 'mission.execution.finished',
    missionId: 'mission-0001',
    data: {
      outcome: 'ERROR',
      fromStatus: 'pending',
      toStatus: 'failed',
      errorMessage: 'provider indisponível',
    },
  })
  appendValidation(context, { outcome: 'PASS', results: [result('pass', 'PASS')] })
  appendValidation(context, { outcome: 'ERROR', results: [result('error', 'ERROR')] })

  assert.throws(
    () => resolveMissionCorrectionFeedback(context, 'mission-0001'),
    { message: 'feedback de correção da Mission não está disponível' },
  )
})

test('converte somente Event Store ausente em feedback indisponível', (t) => {
  const context = createContext(t)

  assert.throws(
    () => resolveMissionCorrectionFeedback(context, 'mission-0001'),
    { message: 'feedback de correção da Mission não está disponível' },
  )
  assert.equal(existsSync(join(context.projectRoot, '.jzl')), false)
})

test('propaga corrupção JSON do Event Store', (t) => {
  const context = createContext(t)
  mkdirSync(join(context.projectRoot, '.jzl'))
  writeFileSync(join(context.projectRoot, '.jzl', 'events.json'), '{', 'utf8')

  assert.throws(
    () => resolveMissionCorrectionFeedback(context, 'mission-0001'),
    { message: 'arquivo de histórico do projeto contém JSON inválido' },
  )
})

test('falha fechado quando outcome FAIL não possui result FAIL', (t) => {
  const context = createContext(t)
  appendValidation(context, { results: [result('pass', 'PASS')] })

  assert.throws(
    () => resolveMissionCorrectionFeedback(context, 'mission-0001'),
    { message: 'feedback de correção da Mission não está disponível' },
  )
})

test('limita validators aos primeiros 20 e informa omittedCount', (t) => {
  const context = createContext(t)
  appendValidation(context, {
    results: Array.from(
      { length: 25 },
      (_, index) => result(`validator-${String(index + 1).padStart(2, '0')}`),
    ),
  })

  const resolved = resolveMissionCorrectionFeedback(context, 'mission-0001')

  assert.equal(resolved.failedValidators.length, 20)
  assert.deepEqual(
    resolved.failedValidators.map(({ id }) => id),
    Array.from(
      { length: 20 },
      (_, index) => `validator-${String(index + 1).padStart(2, '0')}`,
    ),
  )
  assert.equal(resolved.omittedCount, 5)
})

test('exatamente 20 validators não produz omissão', (t) => {
  const context = createContext(t)
  appendValidation(context, {
    results: Array.from({ length: 20 }, (_, index) => result(`validator-${index}`)),
  })

  const resolved = resolveMissionCorrectionFeedback(context, 'mission-0001')

  assert.equal(resolved.failedValidators.length, 20)
  assert.equal(resolved.omittedCount, 0)
})

test('redige roots explícito e canônico antes de truncar diagnostics', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'jzl-context-builder-link-'))
  const physicalRoot = join(base, 'physical-root')
  const linkedRoot = join(base, 'linked-root')
  mkdirSync(physicalRoot)
  symlinkSync(
    physicalRoot,
    linkedRoot,
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const context = createProjectContext(linkedRoot)
  const explicitSlash = linkedRoot.replaceAll('\\', '/')
  const canonicalRoot = realpathSync.native(physicalRoot)
  const casingVariant = process.platform === 'win32'
    ? linkedRoot.toUpperCase()
    : linkedRoot
  const longText = `${linkedRoot} ${'x'.repeat(5000)}`
  const originalEvidence = evidence({
    stdout: `${explicitSlash}/index.php`,
    stderr: `${canonicalRoot} ${casingVariant}`,
    errorMessage: longText,
  })
  appendValidation(context, {
    results: [{ id: 'validator-lógico', status: 'FAIL', evidence: originalEvidence }],
  })

  const resolved = resolveMissionCorrectionFeedback(context, 'mission-0001')
  const sanitized = resolved.failedValidators[0].evidence

  assert.equal(sanitized.stdout, '<projectRoot>/index.php')
  assert.equal(sanitized.stderr, '<projectRoot> <projectRoot>')
  assert.ok(sanitized.errorMessage.startsWith('<projectRoot>'))
  assert.equal(sanitized.errorMessage.length, 4000)
  assert.ok(sanitized.errorMessage.endsWith('[conteúdo truncado pelo JZL]'))
  assert.equal(resolved.failedValidators[0].id, 'validator-lógico')
  assert.deepEqual(originalEvidence, evidence({
    stdout: `${explicitSlash}/index.php`,
    stderr: `${canonicalRoot} ${casingVariant}`,
    errorMessage: longText,
  }))
})

test('trunca stdout, stderr e errorMessage de modo independente', (t) => {
  const context = createContext(t)
  appendValidation(context, {
    results: [result('validator', 'FAIL', {
      stdout: 'a'.repeat(4001),
      stderr: 'b'.repeat(4001),
      errorMessage: 'c'.repeat(5000),
    })],
  })

  const { evidence: sanitized } = resolveMissionCorrectionFeedback(
    context,
    'mission-0001',
  ).failedValidators[0]

  assert.equal(sanitized.stdout.length, 4000)
  assert.equal(sanitized.stderr.length, 4000)
  assert.equal(sanitized.errorMessage.length, 4000)
  assert.ok(sanitized.stdout.endsWith('[conteúdo truncado pelo JZL]'))
  assert.ok(sanitized.stderr.endsWith('[conteúdo truncado pelo JZL]'))
  assert.ok(sanitized.errorMessage.endsWith('[conteúdo truncado pelo JZL]'))
})

test('preserva stdout curto exatamente após a redação', (t) => {
  const context = createContext(t)
  const text = `diagnóstico em ${context.projectRoot}`
  appendValidation(context, {
    results: [result('validator', 'FAIL', { stdout: text })],
  })

  assert.equal(
    resolveMissionCorrectionFeedback(context, 'mission-0001')
      .failedValidators[0].evidence.stdout,
    'diagnóstico em <projectRoot>',
  )
})

test('redige antes de truncar', (t) => {
  const context = createContext(t)
  const repeatedRoot = Array(100).fill(context.projectRoot).join(' ')
  assert.ok(repeatedRoot.length > 4000)
  appendValidation(context, {
    results: [result('validator', 'FAIL', { stdout: repeatedRoot })],
  })

  const stdout = resolveMissionCorrectionFeedback(context, 'mission-0001')
    .failedValidators[0].evidence.stdout

  assert.equal(stdout, Array(100).fill('<projectRoot>').join(' '))
  assert.equal(stdout.includes('[conteúdo truncado pelo JZL]'), false)
})

test('não redige path externo que apenas compartilha o prefixo do projectRoot', (t) => {
  const context = createContext(t)
  const outside = `${context.projectRoot}-outside${join('', 'index.php')}`
  appendValidation(context, { results: [result('validator', 'FAIL', { stdout: outside })] })

  assert.equal(
    resolveMissionCorrectionFeedback(context, 'mission-0001')
      .failedValidators[0].evidence.stdout,
    outside,
  )
})

test('constrói contexto mínimo para Mission running sem feedback', (t) => {
  const context = createContext(t)
  const mission = runningMission()
  const projectStandards = standards()
  const built = buildMissionExecutionContext(context, {
    mission,
    standards: projectStandards,
    correctionFeedback: null,
  })

  assert.deepEqual(built, {
    mission,
    standards: projectStandards,
    correctionFeedback: null,
  })
  assert.deepEqual(Object.keys(built), ['mission', 'standards', 'correctionFeedback'])
  assert.equal(existsSync(join(context.projectRoot, '.jzl')), false)
})

test('rejeita Mission que não esteja running', (t) => {
  const context = createContext(t)

  assert.throws(
    () => buildMissionExecutionContext(context, {
      mission: runningMission({ status: 'correction' }),
      standards: standards(),
      correctionFeedback: null,
    }),
    { message: 'Mission deve estar running para construir contexto de execução' },
  )
})

for (const [name, value, message] of [
  ['container', null, 'standards deve ser um objeto'],
  ['id', { id: '', instructions: ['ok'] }, 'id de standards deve ser uma string não vazia'],
  ['instructions', { id: 'x', instructions: [] }, 'instructions de standards deve ser um array não vazio'],
  ['instruction', { id: 'x', instructions: [' '] }, 'instructions de standards deve conter strings não vazias'],
]) {
  test(`rejeita standards inválidos: ${name}`, (t) => {
    const context = createContext(t)
    assert.throws(
      () => buildMissionExecutionContext(context, {
        mission: runningMission(), standards: value, correctionFeedback: null,
      }),
      { message },
    )
  })
}

for (const [name, value] of [
  ['container', {}],
  ['eventId', feedback({ eventId: 'event-1' })],
  ['validators vazios', feedback({ failedValidators: [] })],
  ['validators demais', feedback({ failedValidators: Array(21).fill(result('x')) })],
  ['status', feedback({ failedValidators: [result('x', 'PASS')] })],
  ['evidence', feedback({ failedValidators: [{ id: 'x', status: 'FAIL', evidence: null }] })],
  ['diagnostic longo', feedback({
    failedValidators: [result('x', 'FAIL', { stdout: 'x'.repeat(4001) })],
  })],
  ['omittedCount', feedback({ omittedCount: -1 })],
]) {
  test(`rejeita feedback inválido: ${name}`, (t) => {
    const context = createContext(t)
    assert.throws(() => buildMissionExecutionContext(context, {
      mission: runningMission(), standards: standards(), correctionFeedback: value,
    }))
  })
}

test('retorno não compartilha estruturas mutáveis com input', (t) => {
  const context = createContext(t)
  const input = {
    mission: runningMission(),
    standards: standards(),
    correctionFeedback: feedback(),
  }
  const snapshot = structuredClone(input)
  const built = buildMissionExecutionContext(context, input)

  built.mission.dependencies.push('mission-9999')
  built.standards.instructions.push('Terceira regra.')
  built.correctionFeedback.failedValidators[0].evidence.stderr = 'mutado'

  assert.deepEqual(input, snapshot)
})
