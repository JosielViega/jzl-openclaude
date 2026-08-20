import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseOpenClaudeWorkerRequest } from '../src/openclaude-worker-request.js'

test('normaliza uma solicitação válida', () => {
  const request = parseOpenClaudeWorkerRequest(
    JSON.stringify({ prompt: '  JZL_TEST  ' }),
  )

  assert.deepEqual(request, { prompt: 'JZL_TEST' })
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
