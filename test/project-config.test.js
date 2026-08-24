import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'

import {
  createProjectConfig,
  validateProjectConfig,
} from '../src/project-config.js'

const absolutePhp = resolve('tools/php')

test('cria configuração traditional-web mínima', () => {
  assert.deepEqual(createProjectConfig({ template: 'traditional-web' }), {
    schemaVersion: 1,
    template: 'traditional-web',
    tools: {},
  })
})

test('cria configuração com PHP e argsPrefix padrão', () => {
  assert.deepEqual(createProjectConfig({
    template: 'traditional-web',
    tools: { php: { executable: absolutePhp } },
  }), {
    schemaVersion: 1,
    template: 'traditional-web',
    tools: { php: { executable: absolutePhp, argsPrefix: [] } },
  })
})

test('não aceita schemaVersion inicial fornecido pelo chamador', () => {
  assert.throws(
    () => createProjectConfig({ schemaVersion: 1, template: 'traditional-web' }),
    { message: 'schemaVersion da configuração inicial é controlado pelo JZL' },
  )
})

for (const [name, config, message] of [
  ['container null', null, 'configuração do projeto deve ser um objeto'],
  ['container array', [], 'configuração do projeto deve ser um objeto'],
  ['schema ausente', { template: 'traditional-web', tools: {} }, 'schemaVersion da configuração do projeto é obrigatório'],
  ['schema inválido', { schemaVersion: 0, template: 'traditional-web', tools: {} }, 'schemaVersion da configuração do projeto deve ser um inteiro positivo'],
  ['schema não suportado', { schemaVersion: 2, template: 'traditional-web', tools: {} }, 'schemaVersion da configuração do projeto não é suportado'],
  ['template ausente', { schemaVersion: 1, tools: {} }, 'template da configuração do projeto é obrigatório'],
  ['template não string', { schemaVersion: 1, template: 1, tools: {} }, 'template da configuração do projeto deve ser uma string'],
  ['template vazio', { schemaVersion: 1, template: ' ', tools: {} }, 'template da configuração do projeto não pode ser vazio'],
  ['template desconhecido', { schemaVersion: 1, template: 'other', tools: {} }, 'template da configuração do projeto não é suportado'],
  ['tools ausente', { schemaVersion: 1, template: 'traditional-web' }, 'tools da configuração do projeto é obrigatório'],
  ['tools inválido', { schemaVersion: 1, template: 'traditional-web', tools: [] }, 'tools da configuração do projeto deve ser um objeto'],
  ['php inválido', { schemaVersion: 1, template: 'traditional-web', tools: { php: null } }, 'configuração da ferramenta PHP deve ser um objeto'],
  ['executable ausente', { schemaVersion: 1, template: 'traditional-web', tools: { php: { argsPrefix: [] } } }, 'executable PHP é obrigatório'],
  ['executable não string', { schemaVersion: 1, template: 'traditional-web', tools: { php: { executable: 1, argsPrefix: [] } } }, 'executable PHP deve ser uma string'],
  ['executable vazio', { schemaVersion: 1, template: 'traditional-web', tools: { php: { executable: ' ', argsPrefix: [] } } }, 'executable PHP não pode ser vazio'],
  ['executable relativo', { schemaVersion: 1, template: 'traditional-web', tools: { php: { executable: 'php', argsPrefix: [] } } }, 'executable PHP deve ser um caminho absoluto'],
  ['argsPrefix ausente', { schemaVersion: 1, template: 'traditional-web', tools: { php: { executable: absolutePhp } } }, 'argsPrefix PHP deve ser um array'],
  ['argsPrefix inválido', { schemaVersion: 1, template: 'traditional-web', tools: { php: { executable: absolutePhp, argsPrefix: 'x' } } }, 'argsPrefix PHP deve ser um array'],
  ['argsPrefix contém não string', { schemaVersion: 1, template: 'traditional-web', tools: { php: { executable: absolutePhp, argsPrefix: [1] } } }, 'argsPrefix PHP deve conter somente strings'],
]) {
  test(`rejeita ${name}`, () => {
    assert.throws(() => validateProjectConfig(config), { message })
  })
}

test('preserva campos aditivos e retorna a mesma referência', () => {
  const config = {
    schemaVersion: 1,
    template: 'traditional-web',
    tools: {
      extra: true,
      php: { executable: absolutePhp, argsPrefix: [], extra: true },
    },
    extra: { keep: true },
  }

  assert.strictEqual(validateProjectConfig(config), config)
  assert.equal(config.extra.keep, true)
  assert.equal(config.tools.extra, true)
  assert.equal(config.tools.php.extra, true)
})

test('createProjectConfig não muta input nem argsPrefix', () => {
  const argsPrefix = ['fake.php']
  const input = {
    template: 'traditional-web',
    tools: { php: { executable: absolutePhp, argsPrefix } },
  }
  const snapshot = structuredClone(input)
  const config = createProjectConfig(input)

  config.tools.php.argsPrefix.push('changed')
  assert.deepEqual(input, snapshot)
  assert.strictEqual(input.tools.php.argsPrefix, argsPrefix)
})

test('createProjectConfig preserva a validação de argsPrefix inválido', () => {
  assert.throws(() => createProjectConfig({
    template: 'traditional-web',
    tools: { php: { executable: absolutePhp, argsPrefix: 'invalid' } },
  }), { message: 'argsPrefix PHP deve ser um array' })
})

test('models opcional aceita vazio, parcial, completo e IDs opacos', () => {
  for (const models of [
    {},
    { 'mission-execution': 'qwen3.5-9b' },
    { 'mission-review': 'provider/model:tag?x=y' },
    { 'mission-execution': 'model-a', 'mission-review': 'model-b' },
  ]) {
    const config = { schemaVersion: 1, template: 'traditional-web', tools: {}, models }
    assert.strictEqual(validateProjectConfig(config), config)
  }
  assert.strictEqual(validateProjectConfig({
    schemaVersion: 1, template: 'traditional-web', tools: {},
  }).models, undefined)
})

test('rejeita models e rotas de Config inválidos', () => {
  const base = { schemaVersion: 1, template: 'traditional-web', tools: {} }
  for (const models of [null, []]) {
    assert.throws(() => validateProjectConfig({ ...base, models }), {
      message: 'models da configuração do projeto deve ser um objeto',
    })
  }
  assert.throws(() => validateProjectConfig({
    ...base, models: { 'mission-reveiw': 'model' },
  }), { message: 'responsabilidade de modelo da configuração não é suportada' })
  for (const model of [null, 1, '', '   ', ' model', 'model ']) {
    assert.throws(() => validateProjectConfig({
      ...base, models: { 'mission-review': model },
    }), { message: 'modelo da configuração do projeto deve ser uma string não vazia' })
  }
})

test('createProjectConfig omite models ausente e clona models presente', () => {
  const without = createProjectConfig({ template: 'traditional-web' })
  assert.equal(Object.hasOwn(without, 'models'), false)

  const models = { 'mission-execution': 'model-a' }
  const input = { template: 'traditional-web', models }
  const snapshot = structuredClone(input)
  const config = createProjectConfig(input)
  assert.deepEqual(config.models, models)
  assert.notStrictEqual(config.models, models)
  config.models['mission-execution'] = 'changed'
  assert.deepEqual(input, snapshot)
})
