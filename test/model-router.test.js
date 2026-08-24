import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  configureProjectModel,
  resolveProjectModelRoute,
  validateProjectModelRoute,
} from '../src/model-router.js'
import { createProjectContext } from '../src/project-context.js'
import {
  initializeProjectConfigStore,
  readProjectConfigStore,
  writeProjectConfigStore,
} from '../src/project-config-store.js'

function setup(t, input = { template: 'traditional-web' }) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-model-router-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  initializeProjectConfigStore(context, input)
  return context
}

test('valida rotas execution e review pela mesma referência', () => {
  for (const responsibility of ['mission-execution', 'mission-review']) {
    const route = { responsibility, model: 'provider/model:tag?x=y', extra: true }
    assert.strictEqual(validateProjectModelRoute(route), route)
  }
})

test('rejeita shape inválido de rota', () => {
  for (const route of [null, []]) {
    assert.throws(() => validateProjectModelRoute(route), {
      message: 'rota de modelo deve ser um objeto',
    })
  }
  assert.throws(() => validateProjectModelRoute({ responsibility: 'other', model: 'x' }), {
    message: 'responsabilidade da rota de modelo não é suportada',
  })
  for (const model of [null, '', ' ', ' model', 'model ']) {
    assert.throws(() => validateProjectModelRoute({
      responsibility: 'mission-review', model,
    }), { message: 'modelo da rota deve ser uma string não vazia' })
  }
})

test('resolve rotas parciais e retorna objetos detached', (t) => {
  const context = setup(t, {
    template: 'traditional-web',
    models: { 'mission-execution': 'model-a', 'mission-review': 'model-b' },
  })
  const execution = resolveProjectModelRoute(context, 'mission-execution')
  const review = resolveProjectModelRoute(context, 'mission-review')
  assert.deepEqual(execution, { responsibility: 'mission-execution', model: 'model-a' })
  assert.deepEqual(review, { responsibility: 'mission-review', model: 'model-b' })
  execution.model = 'changed'
  assert.equal(readProjectConfigStore(context).models['mission-execution'], 'model-a')
  assert.throws(() => resolveProjectModelRoute(context, 'other'), {
    message: 'responsabilidade de modelo não é suportada',
  })
})

test('falha fechado sem models ou responsabilidade configurada, mesmo com env', (t) => {
  const legacy = setup(t)
  const partial = setup(t, {
    template: 'traditional-web', models: { 'mission-execution': 'model-a' },
  })
  const previous = process.env.OPENAI_MODEL
  process.env.OPENAI_MODEL = 'env-model'
  try {
    assert.throws(() => resolveProjectModelRoute(legacy, 'mission-execution'), {
      message: 'modelo não configurado para responsabilidade mission-execution',
    })
    assert.throws(() => resolveProjectModelRoute(partial, 'mission-review'), {
      message: 'modelo não configurado para responsabilidade mission-review',
    })
  } finally {
    if (previous === undefined) delete process.env.OPENAI_MODEL
    else process.env.OPENAI_MODEL = previous
  }
})

test('configure persiste trim e preserva outra rota, tools e campos aditivos', (t) => {
  const php = { executable: process.execPath, argsPrefix: ['fake.js'] }
  const context = setup(t, {
    template: 'traditional-web', tools: { php },
    models: { 'mission-execution': 'model-a' },
  })
  writeProjectConfigStore(context, {
    ...readProjectConfigStore(context),
    additive: { keep: true },
  })
  const input = { responsibility: 'mission-review', model: '  model-b  ' }
  const snapshot = structuredClone(input)
  assert.deepEqual(configureProjectModel(context, input), {
    responsibility: 'mission-review', model: 'model-b',
  })
  const config = readProjectConfigStore(context)
  assert.deepEqual(config.models, {
    'mission-execution': 'model-a', 'mission-review': 'model-b',
  })
  assert.deepEqual(config.tools.php, php)
  assert.deepEqual(config.additive, { keep: true })
  assert.deepEqual(input, snapshot)

  assert.deepEqual(configureProjectModel(context, {
    responsibility: 'mission-execution', model: 'model-c',
  }), { responsibility: 'mission-execution', model: 'model-c' })
  assert.equal(readProjectConfigStore(context).models['mission-review'], 'model-b')
})

test('configure inválido e Store ausente falham sem inicialização', (t) => {
  const context = setup(t)
  const before = structuredClone(readProjectConfigStore(context))
  for (const input of [null, { responsibility: 'other', model: 'x' }, {
    responsibility: 'mission-review', model: ' ',
  }]) assert.throws(() => configureProjectModel(context, input))
  assert.deepEqual(readProjectConfigStore(context), before)

  const missingRoot = mkdtempSync(join(tmpdir(), 'jzl-model-router-missing-'))
  t.after(() => rmSync(missingRoot, { recursive: true, force: true }))
  assert.throws(() => configureProjectModel(createProjectContext(missingRoot), {
    responsibility: 'mission-review', model: 'model',
  }), { message: 'arquivo de configuração do projeto não existe' })
})
