import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateProjectRoot } from './project-root.js'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const workerPath = join(moduleDirectory, 'openclaude-worker.js')

export function spawnOpenClaudeWorker(projectRoot) {
  const validatedProjectRoot = validateProjectRoot(projectRoot)

  return spawn(process.execPath, [workerPath], {
    cwd: validatedProjectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}
