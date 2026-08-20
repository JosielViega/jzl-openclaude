import { spawnOpenClaudeWorker } from './openclaude-worker-process.js'

export async function executeOpenClaudeText(input) {
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

  const child = spawnOpenClaudeWorker(projectRoot)

  if (child.stdin === null || child.stdout === null || child.stderr === null) {
    throw new Error('OpenClaude worker não disponibilizou canais de processo')
  }

  let stdout = ''
  let stderr = ''

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  const workerClose = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      resolve({ code, signal })
    })
  })

  child.stdin.end(JSON.stringify({ prompt: validatedPrompt }))

  const { code, signal } = await workerClose

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
