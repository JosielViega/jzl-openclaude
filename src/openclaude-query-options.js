import { createOpenClaudeToolPolicy } from './openclaude-tool-policy.js'
import { validateProjectRoot } from './project-root.js'

export function createOpenClaudeQueryOptions(
  projectRoot,
  responsibility,
  abortController,
) {
  const validatedProjectRoot = validateProjectRoot(projectRoot)

  if (!(abortController instanceof AbortController)) {
    throw new Error('abortController OpenClaude é inválido')
  }

  return {
    cwd: validatedProjectRoot,
    canUseTool: createOpenClaudeToolPolicy(validatedProjectRoot, responsibility),
    abortController,
  }
}
