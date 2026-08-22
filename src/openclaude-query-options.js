import { createOpenClaudeToolPolicy } from './openclaude-tool-policy.js'
import { validateProjectRoot } from './project-root.js'

export function createOpenClaudeQueryOptions(projectRoot, responsibility) {
  const validatedProjectRoot = validateProjectRoot(projectRoot)

  return {
    cwd: validatedProjectRoot,
    canUseTool: createOpenClaudeToolPolicy(validatedProjectRoot, responsibility),
  }
}
