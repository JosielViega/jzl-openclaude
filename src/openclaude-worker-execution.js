import { query } from '@gitlawb/openclaude/sdk'

import { createOpenClaudeQueryOptions } from './openclaude-query-options.js'

export async function executeOpenClaudeQuery(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('entrada deve ser um objeto')
  }

  const { projectRoot, prompt } = input

  if (typeof prompt !== 'string') {
    throw new Error('prompt deve ser uma string')
  }

  const validatedPrompt = prompt.trim()

  if (validatedPrompt === '') {
    throw new Error('prompt não pode ser vazio')
  }

  const options = createOpenClaudeQueryOptions(projectRoot)
  const execution = query({
    prompt: validatedPrompt,
    options,
  })

  try {
    for await (const message of execution) {
      if (message.type === 'result' && message.subtype === 'success') {
        return {
          sessionId: message.session_id,
          result: message.result,
        }
      }
    }

    throw new Error('OpenClaude não retornou resultado de sucesso')
  } finally {
    execution.close()
  }
}
