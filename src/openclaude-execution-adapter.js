import { spawnOpenClaudeWorker } from './openclaude-worker-process.js'
import { normalizeOpenClaudeWorkerResult } from './openclaude-worker-result.js'
import { validateMissionSession } from './session-manager.js'

export async function executeOpenClaudeText(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('entrada deve ser um objeto')
  }

  const { projectRoot, prompt, session } = input

  if (typeof prompt !== 'string') {
    throw new Error('prompt deve ser uma string')
  }

  const validatedPrompt = prompt.trim()

  if (validatedPrompt === '') {
    throw new Error('prompt não pode ser vazio')
  }

  validateMissionSession(session)

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

  child.stdin.end(JSON.stringify({
    prompt: validatedPrompt,
    sessionMode: session.mode,
    responsibility: session.responsibility,
  }))

  const { code, signal } = await workerClose

  return normalizeOpenClaudeWorkerResult({
    code,
    signal,
    stdout,
    stderr,
  })
}
