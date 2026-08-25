import { spawnOpenClaudeWorker } from './openclaude-worker-process.js'
import {
  normalizeOpenClaudeWorkerResult,
  OpenClaudeWorkerExecutionError,
  readOpenClaudeWorkerErrorEnvelope,
} from './openclaude-worker-result.js'
import {
  openClaudeExecutionTimeoutMessage,
  resolveOpenClaudeExecutionGuardrails,
} from './openclaude-execution-guardrails.js'
import { waitForOpenClaudeWorkerClose } from './openclaude-worker-watchdog.js'
import { validateProjectRoot } from './project-root.js'
import { validateMissionSession } from './session-manager.js'
import { validateProjectModelRoute } from './model-router.js'
import { validateMissionChangeScope } from './mission-change-scope.js'

export async function executeOpenClaudeText(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('entrada deve ser um objeto')
  }

  const { projectRoot, prompt, session, modelRoute } = input

  if (typeof prompt !== 'string') {
    throw new Error('prompt deve ser uma string')
  }

  const validatedPrompt = prompt.trim()

  if (validatedPrompt === '') {
    throw new Error('prompt não pode ser vazio')
  }

  validateMissionSession(session)
  validateProjectModelRoute(modelRoute)

  if (modelRoute.responsibility !== session.responsibility) {
    throw new Error('rota de modelo não corresponde à responsabilidade da sessão')
  }

  if (Object.hasOwn(input, 'changeScope')) {
    if (session.responsibility !== 'mission-execution') {
      throw new Error('Change Scope OpenClaude só é suportado para mission-execution')
    }
    validateMissionChangeScope(input.changeScope)
  }

  const validatedProjectRoot = validateProjectRoot(projectRoot)
  const guardrails = resolveOpenClaudeExecutionGuardrails(
    session.responsibility,
  )

  const child = spawnOpenClaudeWorker(validatedProjectRoot)

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

  const workerClose = waitForOpenClaudeWorkerClose(
    child,
    guardrails.workerTimeoutMs,
  )

  child.stdin.end(JSON.stringify({
    prompt: validatedPrompt,
    sessionMode: session.mode,
    responsibility: session.responsibility,
    model: modelRoute.model,
    ...(Object.hasOwn(input, 'changeScope')
      ? { changeScope: structuredClone(input.changeScope) }
      : {}),
  }))

  const { code, signal, timedOut } = await workerClose

  if (timedOut) {
    const envelope = readOpenClaudeWorkerErrorEnvelope(stdout)
    throw new OpenClaudeWorkerExecutionError(
      openClaudeExecutionTimeoutMessage(session.responsibility),
      envelope?.sessionId ?? null,
    )
  }

  const execution = normalizeOpenClaudeWorkerResult({
    code,
    signal,
    stdout,
    stderr,
  })

  return {
    ...execution,
    model: modelRoute.model,
  }
}
