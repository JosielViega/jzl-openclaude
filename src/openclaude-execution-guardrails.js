import {
  isRegisteredResponsibility,
  resolveResponsibilityDefinition,
} from './responsibility-registry.js'

export function resolveOpenClaudeExecutionGuardrails(responsibility) {
  if (!isRegisteredResponsibility(responsibility)) {
    throw new Error('responsabilidade OpenClaude não é suportada')
  }

  const definition = resolveResponsibilityDefinition(responsibility)

  return {
    queryTimeoutMs: definition.queryTimeoutMs,
    watchdogGraceMs: definition.watchdogGraceMs,
    workerTimeoutMs: definition.queryTimeoutMs + definition.watchdogGraceMs,
  }
}

export function openClaudeExecutionTimeoutMessage(responsibility) {
  resolveOpenClaudeExecutionGuardrails(responsibility)

  return `tempo limite da sessão ${responsibility} excedido`
}

export function createOpenClaudeQueryDeadline(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs deve ser um inteiro positivo')
  }

  const abortController = new AbortController()
  let timedOut = false
  let timer = setTimeout(() => {
    timedOut = true
    abortController.abort()
  }, timeoutMs)

  return {
    abortController,
    hasTimedOut() {
      return timedOut
    },
    clear() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
