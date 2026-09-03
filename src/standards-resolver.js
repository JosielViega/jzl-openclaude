import { readProjectConfigStore } from './project-config-store.js'
import { resolveExistingProjectPath } from './project-path.js'
import { discoverTraditionalWebProjectEntries } from './traditional-web-project-discovery.js'
import {
  isStandardsProfileSupported,
  resolveConfiguredStandardsProfile,
} from './standards-profile.js'

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

const traditionalWebV2Instructions = [
  ...traditionalWebV1Instructions,
  'Arquivos fonte PHP, JavaScript, CSS, HTML e SQL de primeira parte devem possuir UTF-8 válido.',
]

const traditionalWebV3Instructions = [
  ...traditionalWebV2Instructions,
  'Não exponha em public/ artefatos de controle, diretórios de dependências, arquivos de ambiente ou manifests de dependências definidos pelo Public Exposure Contract.',
]

const traditionalWebV4Instructions = [
  ...traditionalWebV3Instructions,
  'Use somente PHP, SQL, JavaScript, HTML e CSS como tecnologias fonte first-party do traditional-web.',
]

function assertImplementedProfile(profile) {
  if (!['traditional-web-v1', 'traditional-web-v2', 'traditional-web-v3', 'traditional-web-v4'].includes(profile)) {
    throw new Error('standardsProfile não possui implementação no Standards Resolver')
  }
}

function instructionsForProfile(profile) {
  if (profile === 'traditional-web-v1') return traditionalWebV1Instructions
  if (profile === 'traditional-web-v2') return traditionalWebV2Instructions
  if (profile === 'traditional-web-v3') return traditionalWebV3Instructions
  if (profile === 'traditional-web-v4') return traditionalWebV4Instructions
  throw new Error('standardsProfile não possui implementação no Standards Resolver')
}

export function resolveProjectStandards(context) {
  const config = readProjectConfigStore(context)
  const profile = resolveConfiguredStandardsProfile(config)
  assertImplementedProfile(profile)

  return {
    id: profile,
    template: config.template,
    instructions: [...instructionsForProfile(profile)],
  }
}

export function resolveProjectValidators(context) {
  const config = readProjectConfigStore(context)
  const profile = resolveConfiguredStandardsProfile(config)
  return createProjectValidatorsForProfile(context, config, profile)
}

function createProjectValidatorsForProfile(context, config, profile) {
  assertImplementedProfile(profile)
  const files = discoverTraditionalWebProjectEntries(context)
    .filter((entry) => entry.kind === 'file')
  const javascriptFiles = files.filter((entry) => entry.path.toLowerCase().endsWith('.js'))
  const phpFiles = files.filter((entry) => entry.path.toLowerCase().endsWith('.php'))

  if (phpFiles.length > 0 && config.tools.php === undefined) {
    throw new Error('executable PHP não configurado para traditional-web')
  }

  const publicExposureValidators = ['traditional-web-v3', 'traditional-web-v4'].includes(profile)
    ? [{
        id: 'traditional-web:public-exposure',
        type: 'traditional-web-public-exposure',
      }]
    : []
  const technologyBoundaryValidators = profile === 'traditional-web-v4'
    ? [{
        id: 'traditional-web:technology-boundary',
        type: 'traditional-web-technology-boundary',
      }]
    : []
  const sourceTextValidators = ['traditional-web-v2', 'traditional-web-v3', 'traditional-web-v4'].includes(profile)
    ? [{ id: 'traditional-web:source-text', type: 'traditional-web-source-text' }]
    : []

  return [
    { id: 'traditional-web:structure', type: 'traditional-web-structure' },
    ...publicExposureValidators,
    ...technologyBoundaryValidators,
    { id: 'traditional-web:ascii-paths', type: 'traditional-web-ascii-paths' },
    ...sourceTextValidators,
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

export function resolveProjectValidatorsForProfile(context, standardsProfile) {
  const config = readProjectConfigStore(context)
  if (!isStandardsProfileSupported(config.template, standardsProfile)) {
    throw new Error('standardsProfile alvo não é suportado para o template')
  }
  return createProjectValidatorsForProfile(context, config, standardsProfile)
}
