import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { buildMissionExecutionContext } from '../src/context-builder.js'

function createContext(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-context-builder-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return { projectRoot }
}

function mission(overrides = {}) {
  return {
    id: 'mission-0001',
    title: 'Corrigir aplicação',
    objective: 'Aplicação válida',
    status: 'running',
    dependencies: [],
    ...overrides,
  }
}

function standards(overrides = {}) {
  return {
    id: 'traditional-web-v1',
    instructions: ['Preserve a estrutura existente.'],
    ...overrides,
  }
}

function validator(id = 'php-syntax:index.php', text = 'falha') {
  return {
    id,
    status: 'FAIL',
    evidence: {
      exitCode: 1,
      signal: null,
      stdout: text,
      stderr: '',
      errorMessage: null,
    },
  }
}

function handoff(overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'mission-correction',
    missionId: 'mission-0001',
    source: {
      responsibility: 'mission-validation',
      eventId: 'event-000123',
    },
    target: { responsibility: 'mission-execution' },
    payload: { failedValidators: [validator()] },
    ...overrides,
  }
}

function reviewHandoff(context, overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'mission-review-correction',
    missionId: 'mission-0001',
    source: { responsibility: 'mission-review', eventId: 'event-000123' },
    authorization: { eventId: 'event-000124' },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: `Problema em ${context.projectRoot}\\index.php`,
      findings: [{
        severity: 'HIGH',
        title: `Falha em ${context.projectRoot}`,
        detail: `Detalhe ${context.projectRoot.replaceAll('\\', '/')}/index.php`,
        paths: [`${context.projectRoot}\\index.php`],
      }],
    },
    ...overrides,
  }
}

function planHandoff(context, overrides = {}) {
  return {
    schemaVersion: 1,
    type: 'mission-plan-execution',
    missionId: 'mission-0001',
    source: { responsibility: 'mission-planning', eventId: 'event-000123' },
    authorization: { eventId: 'event-000124' },
    target: { responsibility: 'mission-execution' },
    payload: {
      summary: `Plano em ${context.projectRoot}`,
      steps: [{
        title: `Título ${context.projectRoot}`,
        detail: `Detalhe ${context.projectRoot.replaceAll('\\', '/')}`,
        paths: [`${context.projectRoot}\\index.html`],
      }],
      risks: [`Risco ${context.projectRoot}`],
      validation: [`Validar ${context.projectRoot}`],
    },
    ...overrides,
  }
}

test('constrói contexto mínimo sem Handoff', (t) => {
  const context = createContext(t)
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: null,
  })

  assert.deepEqual(built, {
    mission: mission(), standards: standards(), handoff: null,
  })
  assert.deepEqual(Object.keys(built), ['mission', 'standards', 'handoff'])
})

test('constrói contexto com Handoff canônico para a mesma Mission', (t) => {
  const context = createContext(t)
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: handoff(),
  })

  assert.deepEqual(built.handoff, {
    ...handoff(),
    payload: { failedValidators: [validator()], omittedCount: 0 },
  })
})

test('constrói Plan Handoff redigido preservando envelope e clone defensivo', (t) => {
  const context = createContext(t)
  const raw = planHandoff(context)
  const before = structuredClone(raw)
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })
  assert.deepEqual({
    schemaVersion: built.handoff.schemaVersion,
    type: built.handoff.type,
    missionId: built.handoff.missionId,
    source: built.handoff.source,
    authorization: built.handoff.authorization,
    target: built.handoff.target,
  }, {
    schemaVersion: 1, type: 'mission-plan-execution', missionId: 'mission-0001',
    source: { responsibility: 'mission-planning', eventId: 'event-000123' },
    authorization: { eventId: 'event-000124' },
    target: { responsibility: 'mission-execution' },
  })
  const serialized = JSON.stringify(built.handoff.payload)
  assert.equal(serialized.includes(context.projectRoot), false)
  assert.equal(serialized.includes(context.projectRoot.replaceAll('\\', '/')), false)
  for (const value of [
    built.handoff.payload.summary,
    built.handoff.payload.steps[0].title,
    built.handoff.payload.steps[0].detail,
    built.handoff.payload.steps[0].paths[0],
    built.handoff.payload.risks[0],
    built.handoff.payload.validation[0],
  ]) assert.ok(value.includes('<projectRoot>'))
  built.handoff.payload.steps[0].title = 'mutado'
  assert.deepEqual(raw, before)
})

test('Plan Handoff preserva limites contextuais finais e ordem', (t) => {
  const context = createContext(t)
  const summary = 's'.repeat(4000)
  const title = 't'.repeat(200)
  const detail = 'd'.repeat(4000)
  const path = 'p'.repeat(500)
  const risk = 'r'.repeat(2000)
  const validation = 'v'.repeat(2000)
  const raw = planHandoff(context, {
    payload: {
      summary,
      steps: Array.from({ length: 20 }, () => ({
        title, detail, paths: Array.from({ length: 20 }, () => path),
      })),
      risks: Array.from({ length: 20 }, () => risk),
      validation: Array.from({ length: 20 }, () => validation),
    },
  })
  const before = structuredClone(raw)
  const payload = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  }).handoff.payload
  assert.equal(payload.summary.length, 4000)
  assert.equal(payload.steps.length, 20)
  assert.equal(payload.steps[0].title.length, 200)
  assert.equal(payload.steps[0].detail.length, 4000)
  assert.equal(payload.steps[0].paths.length, 20)
  assert.equal(payload.steps[0].paths[0].length, 500)
  assert.equal(payload.risks[0].length, 2000)
  assert.equal(payload.validation[0].length, 2000)
  assert.equal(payload.summary, summary)
  assert.equal(payload.steps[0].title, title)
  assert.equal(payload.risks[0], risk)
  assert.equal(payload.validation[0], validation)
  assert.deepEqual(raw, before)
})

test('rejeita Plan Handoff de outra Mission', (t) => {
  const context = createContext(t)
  assert.throws(() => buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(),
    handoff: planHandoff(context, { missionId: 'mission-0002' }),
  }), { message: 'handoff não pertence à Mission de execução' })
})

test('rejeita Handoff de outra Mission', (t) => {
  const context = createContext(t)

  assert.throws(() => buildMissionExecutionContext(context, {
    mission: mission(),
    standards: standards(),
    handoff: handoff({ missionId: 'mission-0002' }),
  }), { message: 'handoff não pertence à Mission de execução' })
})

test('delega validação do Handoff', (t) => {
  const context = createContext(t)

  assert.throws(() => buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: {},
  }), { message: 'schemaVersion do handoff é obrigatório' })
})

test('limita 25 validators a 20 e informa omittedCount sem mutar o Handoff', (t) => {
  const context = createContext(t)
  const raw = handoff({
    payload: {
      failedValidators: Array.from(
        { length: 25 },
        (_, index) => validator(`validator-${index}`),
      ),
    },
  })
  const before = structuredClone(raw)
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })

  assert.equal(built.handoff.payload.failedValidators.length, 20)
  assert.equal(built.handoff.payload.omittedCount, 5)
  assert.deepEqual(
    built.handoff.payload.failedValidators.map(({ id }) => id),
    before.payload.failedValidators.slice(0, 20).map(({ id }) => id),
  )
  assert.deepEqual(raw, before)
})

test('redige projectRoot antes de truncar e preserva o Handoff bruto', (t) => {
  const context = createContext(t)
  const longText = `${context.projectRoot}\\index.php ${'x'.repeat(5000)}`
  const raw = handoff({
    payload: { failedValidators: [validator('long', longText)] },
  })
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })
  const sanitized = built.handoff.payload.failedValidators[0].evidence.stdout

  assert.equal(sanitized.length, 4000)
  assert.ok(sanitized.startsWith('<projectRoot>\\index.php'))
  assert.ok(sanitized.endsWith('[conteúdo truncado pelo JZL]'))
  assert.equal(raw.payload.failedValidators[0].evidence.stdout, longText)
})

test('redige variantes de separador do projectRoot', (t) => {
  const context = createContext(t)
  const slashRoot = context.projectRoot.replaceAll('\\', '/')
  const raw = handoff({
    payload: { failedValidators: [validator('paths', `${context.projectRoot}\\a ${slashRoot}/b`)] },
  })
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })

  assert.equal(
    built.handoff.payload.failedValidators[0].evidence.stdout,
    '<projectRoot>\\a <projectRoot>/b',
  )
})

test('redige também o projectRoot canônico', (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'jzl-context-canonical-'))
  const physicalRoot = mkdtempSync(join(parent, 'physical-'))
  const linkedRoot = join(parent, 'linked-root')
  symlinkSync(physicalRoot, linkedRoot, 'junction')
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const raw = handoff({
    payload: {
      failedValidators: [validator('canonical', `${physicalRoot}\\index.php`)],
    },
  })

  const built = buildMissionExecutionContext({ projectRoot: linkedRoot }, {
    mission: mission(), standards: standards(), handoff: raw,
  })

  assert.equal(
    built.handoff.payload.failedValidators[0].evidence.stdout,
    '<projectRoot>\\index.php',
  )
})

test('não redige caminho externo que apenas compartilha prefixo', (t) => {
  const context = createContext(t)
  const text = `${context.projectRoot}-externo\\arquivo`
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(),
    handoff: handoff({ payload: { failedValidators: [validator('prefix', text)] } }),
  })

  assert.equal(built.handoff.payload.failedValidators[0].evidence.stdout, text)
})

test('copia somente campos conhecidos e não compartilha estruturas mutáveis', (t) => {
  const context = createContext(t)
  const raw = handoff({
    extra: 'não propagar',
    source: {
      responsibility: 'mission-validation', eventId: 'event-000123', extra: true,
    },
    payload: { failedValidators: [{ ...validator(), extra: true }], extra: true },
  })
  const input = { mission: mission(), standards: standards(), handoff: raw }
  const built = buildMissionExecutionContext(context, input)

  assert.equal(Object.hasOwn(built.handoff, 'extra'), false)
  assert.equal(Object.hasOwn(built.handoff.source, 'extra'), false)
  assert.equal(Object.hasOwn(built.handoff.payload, 'extra'), false)
  assert.equal(Object.hasOwn(built.handoff.payload.failedValidators[0], 'extra'), false)

  built.mission.title = 'mutado'
  built.standards.instructions[0] = 'mutado'
  built.handoff.payload.failedValidators[0].evidence.stderr = 'mutado'
  assert.equal(input.mission.title, 'Corrigir aplicação')
  assert.equal(input.standards.instructions[0], 'Preserve a estrutura existente.')
  assert.equal(raw.payload.failedValidators[0].evidence.stderr, '')
})

test('preserva validações existentes de Mission e standards', (t) => {
  const context = createContext(t)

  assert.throws(() => buildMissionExecutionContext(context, {
    mission: mission({ status: 'pending' }), standards: standards(), handoff: null,
  }), { message: 'Mission deve estar running para construir contexto de execução' })
  assert.throws(() => buildMissionExecutionContext(context, {
    mission: mission(), standards: null, handoff: null,
  }), { message: 'standards deve ser um objeto' })
})

test('constrói Review Handoff redigido com envelope conhecido e sem mutação', (t) => {
  const context = createContext(t)
  const raw = reviewHandoff(context)
  const snapshot = structuredClone(raw)
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })

  assert.deepEqual(Object.keys(built.handoff), [
    'schemaVersion', 'type', 'missionId', 'source', 'authorization', 'target', 'payload',
  ])
  assert.equal(built.handoff.type, 'mission-review-correction')
  assert.deepEqual(built.handoff.source, raw.source)
  assert.deepEqual(built.handoff.authorization, raw.authorization)
  assert.deepEqual(built.handoff.target, raw.target)
  assert.equal(JSON.stringify(built.handoff.payload).includes(context.projectRoot), false)
  assert.equal(JSON.stringify(built.handoff.payload).includes(context.projectRoot.replaceAll('\\', '/')), false)
  assert.match(built.handoff.payload.summary, /<projectRoot>/)
  assert.match(built.handoff.payload.findings[0].title, /<projectRoot>/)
  assert.match(built.handoff.payload.findings[0].detail, /<projectRoot>/)
  assert.match(built.handoff.payload.findings[0].paths[0], /<projectRoot>/)
  assert.deepEqual(raw, snapshot)
})

test('Review Handoff contextual não compartilha findings nem propaga campos extras', (t) => {
  const context = createContext(t)
  const raw = reviewHandoff(context, { extra: true })
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })
  built.handoff.payload.findings[0].detail = 'mutado'
  assert.notEqual(raw.payload.findings[0].detail, 'mutado')
  assert.equal(Object.hasOwn(built.handoff, 'extra'), false)
  assert.equal(Object.hasOwn(built.handoff.payload, 'omittedCount'), false)
})

test('preserva metadata compacta de failed criterion sem compartilhar Handoff', (t) => {
  const context = createContext(t)
  const raw = handoff({ payload: { failedValidators: [{
    id: 'criterion-0001', status: 'FAIL',
    evidence: {
      exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
      criterionType: 'file-not-contains', path: 'index.html', satisfied: false,
    },
  }] } })
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })
  assert.deepEqual(built.handoff.payload.failedValidators[0].evidence, {
    exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
    criterionType: 'file-not-contains', path: 'index.html', satisfied: false,
  })
  built.handoff.payload.failedValidators[0].evidence.path = 'changed'
  assert.equal(raw.payload.failedValidators[0].evidence.path, 'index.html')
})

test('preserva evidence do standard ASCII como clone contextual', (t) => {
  const context = createContext(t)
  const standardValidator = {
    id: 'traditional-web:ascii-paths',
    status: 'FAIL',
    evidence: {
      exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
      standardType: 'ascii-paths', violations: ['ação.js'],
    },
  }
  const raw = handoff({ payload: { failedValidators: [standardValidator] } })
  const built = buildMissionExecutionContext(context, {
    mission: mission(), standards: standards(), handoff: raw,
  })
  assert.deepEqual(built.handoff.payload.failedValidators[0].evidence, standardValidator.evidence)
  assert.notStrictEqual(
    built.handoff.payload.failedValidators[0].evidence.violations,
    standardValidator.evidence.violations,
  )
})
