import assert from 'node:assert/strict'
import { test } from 'node:test'

import { executeOpenClaudeText } from '../src/openclaude-execution-adapter.js'

const invalidInputCases = [
  {
    name: 'rejeita input null',
    input: null,
    expectedError: 'entrada deve ser um objeto',
  },
  {
    name: 'rejeita input que não seja objeto',
    input: 'texto',
    expectedError: 'entrada deve ser um objeto',
  },
  {
    name: 'rejeita input array',
    input: [],
    expectedError: 'entrada deve ser um objeto',
  },
  {
    name: 'rejeita prompt que não seja string antes do projectRoot',
    input: {
      projectRoot: 'qualquer-coisa',
      prompt: 123,
    },
    expectedError: 'prompt deve ser uma string',
  },
  {
    name: 'rejeita prompt vazio antes do projectRoot',
    input: {
      projectRoot: 'qualquer-coisa',
      prompt: '   ',
    },
    expectedError: 'prompt não pode ser vazio',
  },
  {
    name: 'rejeita projectRoot relativo',
    input: {
      projectRoot: 'relative/path',
      prompt: 'teste',
    },
    expectedError: 'projectRoot deve ser um caminho absoluto',
  },
]

for (const { name, input, expectedError } of invalidInputCases) {
  test(name, async () => {
    await assert.rejects(
      executeOpenClaudeText(input),
      { message: expectedError },
    )
  })
}
