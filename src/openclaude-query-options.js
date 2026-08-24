import { createOpenClaudeToolPolicy } from './openclaude-tool-policy.js'
import { validateProjectRoot } from './project-root.js'

export function createOpenClaudeQueryOptions(
  projectRoot,
  responsibility,
  abortController,
  model,
) {
  const validatedProjectRoot = validateProjectRoot(projectRoot)

  if (!(abortController instanceof AbortController)) {
    throw new Error('abortController OpenClaude é inválido')
  }

  if (typeof model !== 'string' || model.trim() === '') {
    throw new Error('model OpenClaude deve ser uma string não vazia')
  }

  return {
    cwd: validatedProjectRoot,
    canUseTool: createOpenClaudeToolPolicy(validatedProjectRoot, responsibility),
    abortController,
    model: model.trim(),
  }
}
