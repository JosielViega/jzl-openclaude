import { validateProjectRoot } from './project-root.js'

const [command, option, projectRoot, ...extraArguments] = process.argv.slice(2)

try {
  if (command === undefined) {
    throw new Error('comando é obrigatório')
  }

  if (command !== 'check-root') {
    throw new Error(`comando desconhecido: ${command}`)
  }

  if (option === undefined) {
    throw new Error('--project-root é obrigatório')
  }

  if (option !== '--project-root') {
    throw new Error(`argumento desconhecido: ${option}`)
  }

  if (projectRoot === undefined || projectRoot.startsWith('--')) {
    throw new Error('--project-root exige um valor')
  }

  if (extraArguments.length > 0) {
    throw new Error(`argumento desconhecido: ${extraArguments[0]}`)
  }

  const validatedProjectRoot = validateProjectRoot(projectRoot)

  console.log(`projectRoot válido: ${validatedProjectRoot}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
