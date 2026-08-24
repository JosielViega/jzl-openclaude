import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createOpenClaudeQueryDeadline,
  openClaudeExecutionTimeoutMessage,
  resolveOpenClaudeExecutionGuardrails,
} from '../src/openclaude-execution-guardrails.js'

test('resolve limites fixos de review e execution em objetos detached', () => {
  const review = resolveOpenClaudeExecutionGuardrails('mission-review')
  const execution = resolveOpenClaudeExecutionGuardrails('mission-execution')

  assert.deepEqual(review, {
    queryTimeoutMs: 300000, watchdogGraceMs: 5000, workerTimeoutMs: 305000,
  })
  assert.deepEqual(execution, {
    queryTimeoutMs: 600000, watchdogGraceMs: 5000, workerTimeoutMs: 605000,
  })
  assert.equal(review.workerTimeoutMs, review.queryTimeoutMs + review.watchdogGraceMs)
  assert.equal(execution.workerTimeoutMs, execution.queryTimeoutMs + execution.watchdogGraceMs)
  review.queryTimeoutMs = 1
  assert.equal(resolveOpenClaudeExecutionGuardrails('mission-review').queryTimeoutMs, 300000)
})

test('rejeita responsabilidade OpenClaude desconhecida', () => {
  assert.throws(
    () => resolveOpenClaudeExecutionGuardrails('other'),
    { message: 'responsabilidade OpenClaude não é suportada' },
  )
})

test('produz mensagens determinísticas por responsabilidade', () => {
  assert.equal(
    openClaudeExecutionTimeoutMessage('mission-review'),
    'tempo limite da sessão mission-review excedido',
  )
  assert.equal(
    openClaudeExecutionTimeoutMessage('mission-execution'),
    'tempo limite da sessão mission-execution excedido',
  )
})

test('deadline rejeita timeout inválido', () => {
  for (const value of [undefined, null, 0, -1, 1.5, '1']) {
    assert.throws(() => createOpenClaudeQueryDeadline(value), {
      message: 'timeoutMs deve ser um inteiro positivo',
    })
  }
})

test('deadline curto aborta e registra timeout', async () => {
  const deadline = createOpenClaudeQueryDeadline(10)
  try {
    assert.equal(deadline.hasTimedOut(), false)
    assert.equal(deadline.abortController.signal.aborted, false)
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(deadline.hasTimedOut(), true)
    assert.equal(deadline.abortController.signal.aborted, true)
  } finally {
    deadline.clear()
  }
})

test('clear idempotente antes do prazo impede abort', async () => {
  const deadline = createOpenClaudeQueryDeadline(20)
  deadline.clear()
  deadline.clear()
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(deadline.hasTimedOut(), false)
  assert.equal(deadline.abortController.signal.aborted, false)
})
