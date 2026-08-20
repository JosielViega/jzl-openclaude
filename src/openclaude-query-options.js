import { validateProjectRoot } from './project-root.js'

export function createOpenClaudeQueryOptions(projectRoot) {
  const validatedProjectRoot = validateProjectRoot(projectRoot)

  return {
    cwd: validatedProjectRoot,
    canUseTool: async () => ({
      behavior: 'deny',
      message: 'O JZL ainda não autorizou o uso de ferramentas',
    }),
  }
}
