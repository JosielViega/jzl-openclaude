import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  executeOpenClaudeQuery,
  OpenClaudeQueryExecutionError,
} from '../src/openclaude-worker-execution.js'

test('rejeita modo de sessão diferente de fresh antes de criar query', async () => {
  await assert.rejects(
    executeOpenClaudeQuery({
      projectRoot: 'qualquer-coisa',
      prompt: 'teste',
      sessionMode: 'resume',
      responsibility: 'mission-execution',
    }),
    { message: 'modo de sessão OpenClaude não é suportado' },
  )
})

test('rejeita responsabilidade inválida antes de criar query', async () => {
  await assert.rejects(executeOpenClaudeQuery({
    projectRoot: 'qualquer-coisa',
    prompt: 'teste',
    sessionMode: 'fresh',
    responsibility: 'other',
  }), { message: 'responsabilidade OpenClaude não é suportada' })
})

test('limpa deadline quando a preparação falha antes de query', async () => {
  await assert.rejects(executeOpenClaudeQuery({
    projectRoot: 'relative/path',
    prompt: 'teste',
    sessionMode: 'fresh',
    responsibility: 'mission-review',
    model: 'model-review',
  }), (error) => {
    assert.ok(error instanceof OpenClaudeQueryExecutionError)
    assert.equal(error.message, 'projectRoot deve ser um caminho absoluto')
    assert.equal(error.sessionId, null)
    return true
  })
})

test('planning é reconhecido antes da validação determinística de projectRoot', async () => {
  await assert.rejects(executeOpenClaudeQuery({
    projectRoot: 'relative/path', prompt: 'planejar', sessionMode: 'fresh',
    responsibility: 'mission-planning', model: 'model-plan',
  }), (error) => {
    assert.ok(error instanceof OpenClaudeQueryExecutionError)
    assert.equal(error.message, 'projectRoot deve ser um caminho absoluto')
    return true
  })
})

test('rejeita model OpenClaude inválido antes de query', async () => {
  for (const model of [undefined, null, 1, '   ']) {
    await assert.rejects(executeOpenClaudeQuery({
      projectRoot: 'qualquer-coisa', prompt: 'teste', sessionMode: 'fresh',
      responsibility: 'mission-execution', model,
    }), { message: 'model OpenClaude deve ser uma string não vazia' })
  }
})
