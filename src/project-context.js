import { validateProjectRoot } from './project-root.js'

export function createProjectContext(projectRoot) {
  const validatedProjectRoot = validateProjectRoot(projectRoot)

  return {
    projectRoot: validatedProjectRoot,
  }
}
