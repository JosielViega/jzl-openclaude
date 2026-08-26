import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { initializeProjectConfigStore } from '../src/project-config-store.js'
import {
  resolveProjectStandards,
  resolveProjectValidators,
} from '../src/standards-resolver.js'
import { ensureTraditionalWebProjectStructure } from '../src/traditional-web-structure.js'

function createProject(t, tools = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-standards-resolver-'))
  const context = createProjectContext(root)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  initializeProjectConfigStore(context, { template: 'traditional-web', tools })
  ensureTraditionalWebProjectStructure(context)
  return { context, root }
}

function createLegacyProject(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-standards-resolver-legacy-'))
  const context = createProjectContext(root)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '.jzl'))
  writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
    schemaVersion: 1, template: 'traditional-web', tools: {},
  }, null, 2) + '\n', 'utf8')
  ensureTraditionalWebProjectStructure(context)
  return { context, root }
}

function createPinnedV1Project(t) {
  const project = createLegacyProject(t)
  const configPath = join(project.root, '.jzl', 'config.json')
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1, template: 'traditional-web',
    standardsProfile: 'traditional-web-v1', tools: {},
  }, null, 2) + '\n', 'utf8')
  return project
}

function phpTool(argsPrefix = []) {
  return { php: { executable: process.execPath, argsPrefix } }
}

test('resolve novo profile traditional-web-v2 com instruções do JZL', (t) => {
  const { context } = createProject(t)
  const first = resolveProjectStandards(context)
  const second = resolveProjectStandards(context)

  assert.deepEqual(first, {
    id: 'traditional-web-v2',
    template: 'traditional-web',
    instructions: [
      'Use PHP, MySQL, JavaScript, HTML e CSS como stack principal do projeto.',
      'Não adicione frameworks, runtimes ou dependências extras sem necessidade explícita da Mission ou dos padrões do projeto.',
      'Prefira código simples, explícito e fácil de revisar.',
      'Preserve a estrutura e as convenções já existentes do projeto.',
      'Use somente caracteres ASCII em nomes de arquivos e diretórios.',
      'Arquivos JavaScript de primeira parte devem possuir sintaxe válida.',
      'Arquivos PHP de primeira parte devem possuir sintaxe válida.',
      'Use a estrutura traditional-web canônica: public/ para conteúdo web, src/ para código PHP interno e database/ para SQL quando necessário.',
      'Mantenha JavaScript em public/assets/js/, CSS em public/assets/css/, HTML em public/ e PHP em public/ ou src/.',
      'Arquivos fonte PHP, JavaScript, CSS, HTML e SQL de primeira parte devem possuir UTF-8 válido.',
    ],
  })
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first.instructions, second.instructions)
})

test('config legacy e pinned resolvem o mesmo profile e validators v1', (t) => {
  const pinned = createPinnedV1Project(t)
  const legacy = createLegacyProject(t)
  const legacyConfigPath = join(legacy.root, '.jzl', 'config.json')
  const legacyBytes = readFileSync(legacyConfigPath)

  assert.deepEqual(resolveProjectStandards(legacy.context), resolveProjectStandards(pinned.context))
  assert.deepEqual(
    resolveProjectValidators(legacy.context).map(({ id }) => id),
    resolveProjectValidators(pinned.context).map(({ id }) => id),
  )
  assert.deepEqual(readFileSync(legacyConfigPath), legacyBytes)
})

test('um PHP gera validator com executable e argsPrefix configurados', (t) => {
  const fakeCli = join(tmpdir(), 'fake-php.js')
  const { context, root } = createProject(t, phpTool([fakeCli]))
  writeFileSync(join(root, 'index.php'), '<?php', 'utf8')

  assert.deepEqual(resolveProjectValidators(context), [{
    id: 'traditional-web:structure',
    type: 'traditional-web-structure',
  }, {
    id: 'traditional-web:ascii-paths',
    type: 'traditional-web-ascii-paths',
  }, {
    id: 'traditional-web:source-text',
    type: 'traditional-web-source-text',
  }, {
    id: 'php-syntax:index.php',
    type: 'command',
    executable: process.execPath,
    args: [fakeCli, '-l', normalize(join(root, 'index.php'))],
  }])
})

test('ordena múltiplos PHP por projectPath e usa barra no ID', (t) => {
  const { context, root } = createProject(t, phpTool())
  mkdirSync(join(root, 'app'))
  writeFileSync(join(root, 'z.PHP'), '', 'utf8')
  writeFileSync(join(root, 'app', 'b.php'), '', 'utf8')
  writeFileSync(join(root, 'app', 'a.php'), '', 'utf8')

  assert.deepEqual(
    resolveProjectValidators(context).map((validator) => validator.id),
    ['traditional-web:structure', 'traditional-web:ascii-paths', 'traditional-web:source-text', 'php-syntax:app/a.php', 'php-syntax:app/b.php', 'php-syntax:z.PHP'],
  )
})

test('ignora diretórios reservados e de dependências em qualquer nível', (t) => {
  const { context, root } = createProject(t, phpTool())
  const ignored = ['.jzl', '.git', '.openclaude', 'vendor', 'node_modules']

  writeFileSync(join(root, 'index.php'), '', 'utf8')
  for (const name of ignored) {
    const directory = join(root, name, 'nested')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'ignored.php'), '', 'utf8')
  }

  mkdirSync(join(root, 'app', 'vendor'), { recursive: true })
  writeFileSync(join(root, 'app', 'vendor', 'ignored.php'), '', 'utf8')

  assert.deepEqual(
    resolveProjectValidators(context).map((validator) => validator.id),
    ['traditional-web:structure', 'traditional-web:ascii-paths', 'traditional-web:source-text', 'php-syntax:index.php'],
  )
})

test('não segue diretório symlink ou junction', (t) => {
  const { context, root } = createProject(t, phpTool())
  const external = mkdtempSync(join(tmpdir(), 'jzl-standards-external-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  writeFileSync(join(external, 'ignored.php'), '', 'utf8')
  symlinkSync(
    external,
    join(root, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )

  assert.deepEqual(resolveProjectValidators(context), [{
    id: 'traditional-web:structure',
    type: 'traditional-web-structure',
  }, {
    id: 'traditional-web:ascii-paths',
    type: 'traditional-web-ascii-paths',
  }, {
    id: 'traditional-web:source-text',
    type: 'traditional-web-source-text',
  }])
})

test('retorna validator ASCII quando não há PHP de primeira parte', (t) => {
  const { context, root } = createProject(t)
  writeFileSync(join(root, 'index.html'), '', 'utf8')
  assert.deepEqual(resolveProjectValidators(context), [{
    id: 'traditional-web:structure',
    type: 'traditional-web-structure',
  }, {
    id: 'traditional-web:ascii-paths',
    type: 'traditional-web-ascii-paths',
  }, {
    id: 'traditional-web:source-text',
    type: 'traditional-web-source-text',
  }])
})

test('ordena JavaScript antes de PHP e usa paths relativos no node check', (t) => {
  const { context, root } = createProject(t, phpTool())
  writeFileSync(join(root, 'z.js'), 'export const z = 1\n', 'utf8')
  writeFileSync(join(root, 'a.JS'), 'export const a = 1\n', 'utf8')
  writeFileSync(join(root, 'index.php'), '', 'utf8')

  const validators = resolveProjectValidators(context)
  assert.deepEqual(validators.map(({ id }) => id), [
    'traditional-web:structure',
    'traditional-web:ascii-paths',
    'traditional-web:source-text',
    'js-syntax:a.JS',
    'js-syntax:z.js',
    'php-syntax:index.php',
  ])
  assert.deepEqual(validators[3], {
    id: 'js-syntax:a.JS',
    type: 'command',
    executable: process.execPath,
    args: ['--check', 'a.JS'],
  })
})

test('inclui somente extensão JavaScript .js case-insensitive', (t) => {
  const { context, root } = createProject(t)
  for (const name of ['app.js', 'upper.JS', 'module.mjs', 'common.cjs', 'code.ts', 'view.tsx']) {
    writeFileSync(join(root, name), '', 'utf8')
  }
  assert.deepEqual(resolveProjectValidators(context).map(({ id }) => id), [
    'traditional-web:structure',
    'traditional-web:ascii-paths',
    'traditional-web:source-text',
    'js-syntax:app.js',
    'js-syntax:upper.JS',
  ])
})

test('rejeita PHP sem executable configurado', (t) => {
  const { context, root } = createProject(t)
  writeFileSync(join(root, 'index.php'), '', 'utf8')
  assert.throws(() => resolveProjectValidators(context), {
    message: 'executable PHP não configurado para traditional-web',
  })
})

test('propaga Config Store ausente e configuração inválida', (t) => {
  const missingRoot = mkdtempSync(join(tmpdir(), 'jzl-standards-missing-'))
  t.after(() => rmSync(missingRoot, { recursive: true, force: true }))
  assert.throws(() => resolveProjectStandards(createProjectContext(missingRoot)), {
    message: 'arquivo de configuração do projeto não existe',
  })

  const { context, root } = createProject(t)
  writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
    schemaVersion: 2,
    template: 'traditional-web',
    tools: {},
  }), 'utf8')
  assert.throws(() => resolveProjectValidators(context), {
    message: 'schemaVersion da configuração do projeto não é suportado',
  })

  writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
    schemaVersion: 1,
    template: 'traditional-web',
    standardsProfile: 'traditional-web-v3',
    tools: {},
  }), 'utf8')
  assert.throws(() => resolveProjectStandards(context), {
    message: 'standardsProfile da configuração do projeto não é suportado para o template',
  })
})
