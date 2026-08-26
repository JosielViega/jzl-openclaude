import { readProjectConfigStore } from './project-config-store.js'
import { resolveExistingProjectPath } from './project-path.js'
import { discoverTraditionalWebProjectEntries } from './traditional-web-project-discovery.js'

const traditionalWebInstructions = [
  'Use PHP, MySQL, JavaScript, HTML e CSS como stack principal do projeto.',
  'Não adicione frameworks, runtimes ou dependências extras sem necessidade explícita da Mission ou dos padrões do projeto.',
  'Prefira código simples, explícito e fácil de revisar.',
  'Preserve a estrutura e as convenções já existentes do projeto.',
  'Use somente caracteres ASCII em nomes de arquivos e diretórios.',
  'Arquivos JavaScript de primeira parte devem possuir sintaxe válida.',
  'Arquivos PHP de primeira parte devem possuir sintaxe válida.',
]

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
  const files = discoverTraditionalWebProjectEntries(context)
    .filter((entry) => entry.kind === 'file')
  const javascriptFiles = files.filter((entry) => entry.path.toLowerCase().endsWith('.js'))
  const phpFiles = files.filter((entry) => entry.path.toLowerCase().endsWith('.php'))

  if (phpFiles.length > 0 && config.tools.php === undefined) {
    throw new Error('executable PHP não configurado para traditional-web')
  }

  return [
    { id: 'traditional-web:ascii-paths', type: 'traditional-web-ascii-paths' },
    ...javascriptFiles.map(({ path }) => ({
      id: `js-syntax:${path}`,
      type: 'command',
      executable: process.execPath,
      args: ['--check', path],
    })),
    ...phpFiles.map(({ path }) => ({
      id: `php-syntax:${path}`,
      type: 'command',
      executable: config.tools.php.executable,
      args: [
        ...config.tools.php.argsPrefix,
        '-l',
        resolveExistingProjectPath(context, path),
      ],
    })),
  ]
}
