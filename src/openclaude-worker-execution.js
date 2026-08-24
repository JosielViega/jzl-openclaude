import { query } from '@gitlawb/openclaude/sdk'

import {
  createOpenClaudeQueryDeadline,
  openClaudeExecutionTimeoutMessage,
  resolveOpenClaudeExecutionGuardrails,
} from './openclaude-execution-guardrails.js'
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

  const { projectRoot, prompt, sessionMode, responsibility, model } = input

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

  if (!['mission-execution', 'mission-review'].includes(responsibility)) {
    throw new Error('responsabilidade OpenClaude não é suportada')
  }

  if (typeof model !== 'string' || model.trim() === '') {
    throw new Error('model OpenClaude deve ser uma string não vazia')
  }

  const validatedModel = model.trim()

  const guardrails = resolveOpenClaudeExecutionGuardrails(responsibility)
  const deadline = createOpenClaudeQueryDeadline(guardrails.queryTimeoutMs)
  let execution
  let sessionId = null

  try {
    const options = createOpenClaudeQueryOptions(
      projectRoot,
      responsibility,
      deadline.abortController,
      validatedModel,
    )
    execution = query({
      prompt: validatedPrompt,
      options,
    })
    sessionId = (
      typeof execution.sessionId === 'string'
      && execution.sessionId.trim() !== ''
    ) ? execution.sessionId : null

    if (sessionId === null) {
      throw new Error('OpenClaude não forneceu sessionId para a sessão')
    }

    for await (const message of execution) {
      if (message.type === 'result' && message.subtype === 'success') {
        if (deadline.hasTimedOut()) {
          throw new Error(openClaudeExecutionTimeoutMessage(responsibility))
        }

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
    const message = deadline.hasTimedOut()
      ? openClaudeExecutionTimeoutMessage(responsibility)
      : errorMessage(error)

    throw new OpenClaudeQueryExecutionError(message, sessionId)
  } finally {
    deadline.clear()
    if (execution !== undefined) {
      execution.close()
    }
  }
}
