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

  return execution
}

function writeLine(stream, line) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject)
    stream.write(`${line}\n`, error => {
      if (error) reject(error)
      else resolve()
    })
  })
}

let payload
let errorMessage
let exitCode = 0

try {
  payload = await main()
} catch (error) {
  errorMessage = error instanceof Error ? error.message : String(error)
  const sessionId = (
    error !== null
    && typeof error === 'object'
    && typeof error.sessionId === 'string'
    && error.sessionId.trim() !== ''
  ) ? error.sessionId : null

  payload = { error: errorMessage, sessionId }
  exitCode = 1
}

try {
  await writeLine(process.stdout, JSON.stringify(payload))
  if (exitCode === 1) await writeLine(process.stderr, errorMessage)
} catch {
  exitCode = 1
}

// O worker single-shot não depende dos handles restantes do SDK para terminar.
process.exit(exitCode)
