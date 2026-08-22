import { readdirSync } from 'node:fs'

import { readProjectConfigStore } from './project-config-store.js'
import { resolveExistingProjectPath } from './project-path.js'

const traditionalWebInstructions = [
  'Use PHP, MySQL, JavaScript, HTML e CSS como stack principal do projeto.',
  'Não adicione frameworks, runtimes ou dependências extras sem necessidade explícita da Mission ou dos padrões do projeto.',
  'Prefira código simples, explícito e fácil de revisar.',
  'Preserve a estrutura e as convenções já existentes do projeto.',
  'Use somente caracteres ASCII em nomes de arquivos e diretórios.',
]

const ignoredDirectoryNames = new Set([
  '.jzl',
  '.git',
  '.openclaude',
  'vendor',
  'node_modules',
])

function isIgnoredDirectory(name) {
  return ignoredDirectoryNames.has(
    process.platform === 'win32' ? name.toLowerCase() : name,
  )
}

function discoverPhpFiles(context) {
  const files = []

  function visit(projectDirectoryPath) {
    const directoryPath = resolveExistingProjectPath(
      context,
      projectDirectoryPath,
    )
    const entries = readdirSync(directoryPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }

      const projectPath = projectDirectoryPath === '.'
        ? entry.name
        : `${projectDirectoryPath}/${entry.name}`

      if (entry.isDirectory()) {
        if (!isIgnoredDirectory(entry.name)) {
          visit(projectPath)
        }

        continue
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.php')) {
        files.push({
          projectPath,
          absolutePath: resolveExistingProjectPath(context, projectPath),
        })
      }
    }
  }

  visit('.')

  return files.sort((left, right) => (
    left.projectPath < right.projectPath
      ? -1
      : left.projectPath > right.projectPath ? 1 : 0
  ))
}

export function resolveProjectStandards(context) {
  const config = readProjectConfigStore(context)

  return {
    id: 'traditional-web-v1',
    template: config.template,
    instructions: [...traditionalWebInstructions],
  }
}

export function resolveProjectValidators(context) {
  const config = readProjectConfigStore(context)
  const phpFiles = discoverPhpFiles(context)

  if (phpFiles.length === 0) {
    return []
  }

  if (config.tools.php === undefined) {
    throw new Error('executable PHP não configurado para traditional-web')
  }

  return phpFiles.map(({ projectPath, absolutePath }) => ({
    id: `php-syntax:${projectPath}`,
    type: 'command',
    executable: config.tools.php.executable,
    args: [...config.tools.php.argsPrefix, '-l', absolutePath],
  }))
}
