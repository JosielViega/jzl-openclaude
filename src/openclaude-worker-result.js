function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseResponse(stdout) {
  const trimmedStdout = stdout.trim()

  if (trimmedStdout === '') {
    return undefined
  }

  try {
    return JSON.parse(trimmedStdout)
  } catch {
    return undefined
  }
}

function isErrorEnvelope(response) {
  return isObject(response)
    && typeof response.error === 'string'
    && response.error.trim() !== ''
    && (
      response.sessionId === null
      || (
        typeof response.sessionId === 'string'
        && response.sessionId.trim() !== ''
      )
    )
}

export class OpenClaudeWorkerExecutionError extends Error {
  constructor(message, sessionId) {
    super(message)
    this.name = 'OpenClaudeWorkerExecutionError'
    this.sessionId = sessionId
  }
}

export function normalizeOpenClaudeWorkerResult(input) {
  const { code, signal, stdout, stderr } = input

  if (signal !== null) {
    throw new Error(`OpenClaude worker encerrado por sinal: ${signal}`)
  }

  if (code !== 0) {
    const response = parseResponse(stdout)

    if (isErrorEnvelope(response)) {
      throw new OpenClaudeWorkerExecutionError(
        response.error,
        response.sessionId,
      )
    }

    const workerError = stderr.trim()

    if (workerError !== '') {
      throw new Error(workerError)
    }

    throw new Error(`OpenClaude worker encerrou com código ${code}`)
  }

  const trimmedStdout = stdout.trim()

  if (trimmedStdout === '') {
    throw new Error('OpenClaude worker não retornou resposta')
  }

  let response

  try {
    response = JSON.parse(trimmedStdout)
  } catch {
    throw new Error('OpenClaude worker retornou JSON inválido')
  }

  if (!isObject(response)) {
    throw new Error('OpenClaude worker retornou resposta inválida')
  }

  if (isErrorEnvelope(response)) {
    throw new Error('OpenClaude worker retornou erro com código zero')
  }

  if (typeof response.sessionId !== 'string' || response.sessionId.trim() === '') {
    throw new Error('OpenClaude worker retornou sessionId inválido')
  }

  if (typeof response.result !== 'string') {
    throw new Error('OpenClaude worker retornou result inválido')
  }

  return {
    sessionId: response.sessionId,
    result: response.result,
  }
}
