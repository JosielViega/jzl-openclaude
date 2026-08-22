import assert from 'node:assert/strict'
import { test } from 'node:test'

import { executeOpenClaudeQuery } from '../src/openclaude-worker-execution.js'

test('rejeita modo de sessão diferente de fresh antes de criar query', async () => {
  await assert.rejects(
    executeOpenClaudeQuery({
      projectRoot: 'qualquer-coisa',
      prompt: 'teste',
      sessionMode: 'resume',
    }),
    { message: 'modo de sessão OpenClaude não é suportado' },
  )
})
