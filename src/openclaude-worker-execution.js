import { query } from '@gitlawb/openclaude/sdk'

import { createOpenClaudeQueryOptions } from './openclaude-query-options.js'

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export class OpenClaudeQueryExecutionError extends Error {
  constructor(message, sessionId) {
    super(message)
    this.name = 'OpenClaudeQueryExecutionError'
    this.sessionId = sessionId
  }
}

export async function executeOpenClaudeQuery(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('entrada deve ser um objeto')
  }

  const { projectRoot, prompt, sessionMode } = input

  if (typeof prompt !== 'string') {
    throw new Error('prompt deve ser uma string')
  }

  const validatedPrompt = prompt.trim()

  if (validatedPrompt === '') {
    throw new Error('prompt não pode ser vazio')
  }

  if (sessionMode !== 'fresh') {
    throw new Error('modo de sessão OpenClaude não é suportado')
  }

  const options = createOpenClaudeQueryOptions(projectRoot)
  const execution = query({
    prompt: validatedPrompt,
    options,
  })
  const sessionId = (
    typeof execution.sessionId === 'string'
    && execution.sessionId.trim() !== ''
  ) ? execution.sessionId : null

  try {
    if (sessionId === null) {
      throw new Error('OpenClaude não forneceu sessionId para a sessão')
    }

    for await (const message of execution) {
      if (message.type === 'result' && message.subtype === 'success') {
        if (message.session_id !== sessionId) {
          throw new Error(
            'sessão OpenClaude retornada não corresponde à sessão iniciada',
          )
        }

        return {
          sessionId,
          result: message.result,
        }
      }
    }

    throw new Error('OpenClaude não retornou resultado de sucesso')
  } catch (error) {
    throw new OpenClaudeQueryExecutionError(errorMessage(error), sessionId)
  } finally {
    execution.close()
  }
}
