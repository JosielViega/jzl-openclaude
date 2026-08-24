const guardrailsByResponsibility = {
  'mission-review': {
    queryTimeoutMs: 300000,
    watchdogGraceMs: 5000,
    workerTimeoutMs: 305000,
  },
  'mission-execution': {
    queryTimeoutMs: 600000,
    watchdogGraceMs: 5000,
    workerTimeoutMs: 605000,
  },
}

export function resolveOpenClaudeExecutionGuardrails(responsibility) {
  const guardrails = guardrailsByResponsibility[responsibility]

  if (guardrails === undefined) {
    throw new Error('responsabilidade OpenClaude não é suportada')
  }

  return { ...guardrails }
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
