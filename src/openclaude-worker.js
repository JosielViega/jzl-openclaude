import { parseOpenClaudeWorkerRequest } from './openclaude-worker-request.js'

async function main() {
  process.stdin.setEncoding('utf8')

  let input = ''

  for await (const chunk of process.stdin) {
    input += chunk
  }

  const request = parseOpenClaudeWorkerRequest(input)

  console.log(JSON.stringify(request))
}

try {
  await main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
