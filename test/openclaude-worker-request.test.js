import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseOpenClaudeWorkerRequest } from '../src/openclaude-worker-request.js'

test('normaliza uma solicitação válida', () => {
  const request = parseOpenClaudeWorkerRequest(
    JSON.stringify({
      prompt: '  JZL_TEST  ',
      sessionMode: 'fresh',
      responsibility: 'mission-execution',
      model: '  model/a:b  ',
    }),
  )

  assert.deepEqual(request, {
    prompt: 'JZL_TEST',
    sessionMode: 'fresh',
    responsibility: 'mission-execution',
    model: 'model/a:b',
  })
})

test('preserva Change Scope canônico somente em mission-execution', () => {
  const scope = { allowedPaths: ['index.html'], extra: true }
  const request = parseOpenClaudeWorkerRequest(JSON.stringify({
    prompt: 'executar', sessionMode: 'fresh', responsibility: 'mission-execution',
    model: 'model-a', changeScope: scope,
  }))
  assert.deepEqual(request.changeScope, scope)
  assert.notStrictEqual(request.changeScope, scope)

  for (const responsibility of ['mission-review', 'mission-planning']) {
    assert.throws(() => parseOpenClaudeWorkerRequest(JSON.stringify({
      prompt: 'x', sessionMode: 'fresh', responsibility,
      model: 'model-a', changeScope: { allowedPaths: [] },
    })), /só é suportado para mission-execution/)
  }
})

const invalidRequestCases = [
  {
    name: 'rejeita input vazio',
    input: '',
    expectedError: 'entrada do worker não pode ser vazia',
  },
  {
    name: 'rejeita JSON inválido',
    input: '{',
    expectedError: 'entrada do worker deve ser JSON válido',
  },
  {
    name: 'rejeita solicitação que não seja objeto',
    input: '[]',
    expectedError: 'solicitação do worker deve ser um objeto',
  },
  {
    name: 'rejeita ausência de prompt',
    input: '{}',
    expectedError: 'prompt é obrigatório',
  },
  {
    name: 'rejeita prompt que não seja string',
    input: JSON.stringify({ prompt: 123 }),
    expectedError: 'prompt deve ser uma string',
  },
  {
    name: 'rejeita prompt vazio após trim',
    input: JSON.stringify({ prompt: '   ' }),
    expectedError: 'prompt não pode ser vazio',
  },
]

for (const { name, input, expectedError } of invalidRequestCases) {
  test(name, () => {
    assert.throws(
      () => parseOpenClaudeWorkerRequest(input),
      { message: expectedError },
    )
  })
}

for (const [name, request, expectedError] of [
  [
    'rejeita ausência de sessionMode',
    { prompt: 'teste' },
    'sessionMode é obrigatório',
  ],
  [
    'rejeita sessionMode que não seja string',
    { prompt: 'teste', sessionMode: 1 },
    'sessionMode deve ser uma string',
  ],
  [
    'rejeita sessionMode desconhecido',
    {
      prompt: 'teste', sessionMode: 'resume',
      responsibility: 'mission-execution',
    },
    'sessionMode do worker não é suportado',
  ],
]) {
  test(name, () => {
    assert.throws(
      () => parseOpenClaudeWorkerRequest(JSON.stringify(request)),
      { message: expectedError },
    )
  })
}

test('aceita responsibility mission-review', () => {
  assert.deepEqual(parseOpenClaudeWorkerRequest(JSON.stringify({
    prompt: 'revisar', sessionMode: 'fresh', responsibility: 'mission-review', model: 'review-model',
  })), {
    prompt: 'revisar', sessionMode: 'fresh', responsibility: 'mission-review', model: 'review-model',
  })
})

test('aceita responsibility mission-planning em sessão fresh', () => {
  assert.deepEqual(parseOpenClaudeWorkerRequest(JSON.stringify({
    prompt: 'planejar', sessionMode: 'fresh', responsibility: 'mission-planning', model: 'plan-model',
  })), {
    prompt: 'planejar', sessionMode: 'fresh', responsibility: 'mission-planning', model: 'plan-model',
  })
})

for (const [name, responsibility, message] of [
  ['ausente', undefined, 'responsibility é obrigatório'],
  ['não string', 1, 'responsibility deve ser uma string'],
  ['desconhecida', 'other', 'responsibility do worker não é suportada'],
]) {
  test(`rejeita responsibility ${name}`, () => {
    const request = { prompt: 'teste', sessionMode: 'fresh', model: 'model-a' }
    if (responsibility !== undefined) request.responsibility = responsibility
    assert.throws(
      () => parseOpenClaudeWorkerRequest(JSON.stringify(request)),
      { message },
    )
  })
}

for (const [name, model, message] of [
  ['ausente', undefined, 'model é obrigatório'],
  ['não string', 1, 'model deve ser uma string'],
  ['vazio', '   ', 'model não pode ser vazio'],
]) {
  test(`rejeita model ${name}`, () => {
    const request = {
      prompt: 'teste', sessionMode: 'fresh', responsibility: 'mission-execution',
    }
    if (model !== undefined) request.model = model
    assert.throws(() => parseOpenClaudeWorkerRequest(JSON.stringify(request)), {
      message,
    })
  })
}
