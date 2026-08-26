import { readProjectConfigStore } from './project-config-store.js'
import { resolveExistingProjectPath } from './project-path.js'
import { discoverTraditionalWebProjectEntries } from './traditional-web-project-discovery.js'
import { resolveConfiguredStandardsProfile } from './standards-profile.js'

const traditionalWebV1Instructions = [
  'Use PHP, MySQL, JavaScript, HTML e CSS como stack principal do projeto.',
  'Não adicione frameworks, runtimes ou dependências extras sem necessidade explícita da Mission ou dos padrões do projeto.',
  'Prefira código simples, explícito e fácil de revisar.',
  'Preserve a estrutura e as convenções já existentes do projeto.',
  'Use somente caracteres ASCII em nomes de arquivos e diretórios.',
  'Arquivos JavaScript de primeira parte devem possuir sintaxe válida.',
  'Arquivos PHP de primeira parte devem possuir sintaxe válida.',
  'Use a estrutura traditional-web canônica: public/ para conteúdo web, src/ para código PHP interno e database/ para SQL quando necessário.',
  'Mantenha JavaScript em public/assets/js/, CSS em public/assets/css/, HTML em public/ e PHP em public/ ou src/.',
]

function assertImplementedProfile(profile) {
  if (profile !== 'traditional-web-v1') {
    throw new Error('standardsProfile não possui implementação no Standards Resolver')
  }
}

export function resolveProjectStandards(context) {
  const config = readProjectConfigStore(context)
  const profile = resolveConfiguredStandardsProfile(config)
  assertImplementedProfile(profile)

  return {
    id: profile,
    template: config.template,
    instructions: [...traditionalWebV1Instructions],
  }
}

export function resolveProjectValidators(context) {
  const config = readProjectConfigStore(context)
  const profile = resolveConfiguredStandardsProfile(config)
  assertImplementedProfile(profile)
  const files = discoverTraditionalWebProjectEntries(context)
    .filter((entry) => entry.kind === 'file')
  const javascriptFiles = files.filter((entry) => entry.path.toLowerCase().endsWith('.js'))
  const phpFiles = files.filter((entry) => entry.path.toLowerCase().endsWith('.php'))

  if (phpFiles.length > 0 && config.tools.php === undefined) {
    throw new Error('executable PHP não configurado para traditional-web')
  }

  return [
    { id: 'traditional-web:structure', type: 'traditional-web-structure' },
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
