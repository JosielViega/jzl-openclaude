import { parseOpenClaudeWorkerRequest } from './openclaude-worker-request.js'

async function main() {
  process.stdin.setEncoding('utf8')

  let input = ''

  for await (const chunk of process.stdin) {
    input += chunk
  }

  const request = parseOpenClaudeWorkerRequest(input)
  const { executeOpenClaudeQuery } = await import(
    './openclaude-worker-execution.js'
  )
  const execution = await executeOpenClaudeQuery({
    projectRoot: process.cwd(),
    prompt: request.prompt,
    sessionMode: request.sessionMode,
    responsibility: request.responsibility,
    model: request.model,
    ...(Object.hasOwn(request, 'changeScope')
      ? { changeScope: request.changeScope }
      : {}),
  })

  console.log(JSON.stringify(execution))
}

try {
  await main()
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const sessionId = (
    error !== null
    && typeof error === 'object'
    && typeof error.sessionId === 'string'
    && error.sessionId.trim() !== ''
  ) ? error.sessionId : null

  console.log(JSON.stringify({ error: errorMessage, sessionId }))
  console.error(errorMessage)
  process.exitCode = 1
}
