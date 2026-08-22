import assert from 'node:assert/strict'
import { test } from 'node:test'

import { executeOpenClaudeQuery } from '../src/openclaude-worker-execution.js'

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
