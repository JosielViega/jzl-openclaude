import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizeOpenClaudeWorkerResult,
  OpenClaudeWorkerExecutionError,
  readOpenClaudeWorkerErrorEnvelope,
} from '../src/openclaude-worker-result.js'

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

test('preserva sessionId do envelope de erro do worker', () => {
  assert.throws(
    () => normalizeOpenClaudeWorkerResult({
      code: 1,
      signal: null,
      stdout: JSON.stringify({ error: 'provider falhou', sessionId: 'session-1' }),
      stderr: 'diagnóstico',
    }),
    (error) => {
      assert.ok(error instanceof OpenClaudeWorkerExecutionError)
      assert.equal(error.message, 'provider falhou')
      assert.equal(error.sessionId, 'session-1')
      return true
    },
  )
})

test('preserva sessionId null do envelope de erro do worker', () => {
  assert.throws(
    () => normalizeOpenClaudeWorkerResult({
      code: 1,
      signal: null,
      stdout: JSON.stringify({ error: 'query não iniciou', sessionId: null }),
      stderr: '',
    }),
    (error) => {
      assert.ok(error instanceof OpenClaudeWorkerExecutionError)
      assert.equal(error.message, 'query não iniciou')
      assert.equal(error.sessionId, null)
      return true
    },
  )
})

test('envelope de erro malformado usa fallback de stderr', () => {
  assert.throws(
    () => normalizeOpenClaudeWorkerResult({
      code: 1,
      signal: null,
      stdout: JSON.stringify({ error: '', sessionId: 123 }),
      stderr: '  erro de fallback  ',
    }),
    { message: 'erro de fallback' },
  )
})

test('não aceita envelope de erro com código zero', () => {
  assert.throws(
    () => normalizeOpenClaudeWorkerResult({
      code: 0,
      signal: null,
      stdout: JSON.stringify({ error: 'falha', sessionId: null }),
      stderr: '',
    }),
    { message: 'OpenClaude worker retornou erro com código zero' },
  )
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

test('lê somente error envelope completo para auditoria de sessionId', () => {
  assert.deepEqual(
    readOpenClaudeWorkerErrorEnvelope(JSON.stringify({
      error: 'timeout interno', sessionId: 'session-1', extra: true,
    })),
    { error: 'timeout interno', sessionId: 'session-1' },
  )
  assert.deepEqual(
    readOpenClaudeWorkerErrorEnvelope(JSON.stringify({ error: 'x', sessionId: null })),
    { error: 'x', sessionId: null },
  )
  for (const stdout of [
    '', '{', '[]',
    JSON.stringify({ sessionId: 'session-1', result: 'OK' }),
    JSON.stringify({ error: 'x', sessionId: 123 }),
  ]) assert.equal(readOpenClaudeWorkerErrorEnvelope(stdout), null)
})
