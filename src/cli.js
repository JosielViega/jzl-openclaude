import { executeOpenClaudeText } from './openclaude-execution-adapter.js'
import { validateProjectRoot } from './project-root.js'

const [command, ...argumentsList] = process.argv.slice(2)

try {
  if (command === undefined) {
    throw new Error('comando é obrigatório')
  }

  if (command === 'check-root') {
    const [option, projectRoot, ...extraArguments] = argumentsList

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
  } else if (command === 'run') {
    const [
      projectRootOption,
      projectRoot,
      promptOption,
      prompt,
      ...extraArguments
    ] = argumentsList

    if (projectRootOption === undefined) {
      throw new Error('--project-root é obrigatório')
    }

    if (projectRootOption !== '--project-root') {
      throw new Error(`argumento desconhecido: ${projectRootOption}`)
    }

    if (projectRoot === undefined || projectRoot.startsWith('--')) {
      throw new Error('--project-root exige um valor')
    }

    if (promptOption === undefined) {
      throw new Error('--prompt é obrigatório')
    }

    if (promptOption !== '--prompt') {
      throw new Error(`argumento desconhecido: ${promptOption}`)
    }

    if (prompt === undefined || prompt.startsWith('--')) {
      throw new Error('--prompt exige um valor')
    }

    if (extraArguments.length > 0) {
      throw new Error(`argumento desconhecido: ${extraArguments[0]}`)
    }

    const execution = await executeOpenClaudeText({
      projectRoot,
      prompt,
    })

    console.log(JSON.stringify(execution))
  } else {
    throw new Error(`comando desconhecido: ${command}`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
