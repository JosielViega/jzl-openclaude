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
  })

  console.log(JSON.stringify(execution))
}

try {
  await main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
