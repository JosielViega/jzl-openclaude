export function normalizeOpenClaudeWorkerResult(input) {
  const { code, signal, stdout, stderr } = input

  if (signal !== null) {
    throw new Error(`OpenClaude worker encerrado por sinal: ${signal}`)
  }

  if (code !== 0) {
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

  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    throw new Error('OpenClaude worker retornou resposta inválida')
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
