import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeOpenClaudeWorkerResult } from '../src/openclaude-worker-result.js'

test('normaliza um resultado de sucesso', () => {
  const result = normalizeOpenClaudeWorkerResult({
    code: 0,
    signal: null,
    stdout: JSON.stringify({
      sessionId: 'session-1',
      result: 'OK',
    }),
    stderr: '',
  })

  assert.deepEqual(result, {
    sessionId: 'session-1',
    result: 'OK',
  })
})

test('preserva o contrato de sucesso', () => {
  const result = normalizeOpenClaudeWorkerResult({
    code: 0,
    signal: null,
    stdout: JSON.stringify({
      sessionId: '  session-2  ',
      result: '',
      extra: 'ignorar',
    }),
    stderr: 'diagnóstico qualquer',
  })

  assert.deepEqual(result, {
    sessionId: '  session-2  ',
    result: '',
  })
})

const errorCases = [
  {
    name: 'prioriza signal sobre exit code e stderr',
    input: {
      code: 1,
      signal: 'SIGTERM',
      stdout: '',
      stderr: 'erro do worker',
    },
    expectedError: 'OpenClaude worker encerrado por sinal: SIGTERM',
  },
  {
    name: 'usa stderr com trim para exit code não zero',
    input: {
      code: 1,
      signal: null,
      stdout: '',
      stderr: '  falha real do worker  \n',
    },
    expectedError: 'falha real do worker',
  },
  {
    name: 'reporta exit code quando stderr está vazio',
    input: {
      code: 7,
      signal: null,
      stdout: '',
      stderr: '   ',
    },
    expectedError: 'OpenClaude worker encerrou com código 7',
  },
  {
    name: 'rejeita stdout vazio',
    input: {
      code: 0,
      signal: null,
      stdout: '   \n',
      stderr: '',
    },
    expectedError: 'OpenClaude worker não retornou resposta',
  },
  {
    name: 'rejeita JSON inválido',
    input: {
      code: 0,
      signal: null,
      stdout: '{',
      stderr: '',
    },
    expectedError: 'OpenClaude worker retornou JSON inválido',
  },
  {
    name: 'rejeita resposta que não seja objeto',
    input: {
      code: 0,
      signal: null,
      stdout: '[]',
      stderr: '',
    },
    expectedError: 'OpenClaude worker retornou resposta inválida',
  },
  {
    name: 'rejeita sessionId que não seja string',
    input: {
      code: 0,
      signal: null,
      stdout: JSON.stringify({
        sessionId: 123,
        result: 'OK',
      }),
      stderr: '',
    },
    expectedError: 'OpenClaude worker retornou sessionId inválido',
  },
  {
    name: 'rejeita sessionId vazio',
    input: {
      code: 0,
      signal: null,
      stdout: JSON.stringify({
        sessionId: '   ',
        result: 'OK',
      }),
      stderr: '',
    },
    expectedError: 'OpenClaude worker retornou sessionId inválido',
  },
  {
    name: 'rejeita result que não seja string',
    input: {
      code: 0,
      signal: null,
      stdout: JSON.stringify({
        sessionId: 'session-1',
        result: 123,
      }),
      stderr: '',
    },
    expectedError: 'OpenClaude worker retornou result inválido',
  },
]

for (const { name, input, expectedError } of errorCases) {
  test(name, () => {
    assert.throws(
      () => normalizeOpenClaudeWorkerResult(input),
      { message: expectedError },
    )
  })
}
