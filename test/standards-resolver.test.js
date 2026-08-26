import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
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

function createProject(t, tools = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-standards-resolver-'))
  const context = createProjectContext(root)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  initializeProjectConfigStore(context, { template: 'traditional-web', tools })
  return { context, root }
}

function phpTool(argsPrefix = []) {
  return { php: { executable: process.execPath, argsPrefix } }
}

test('resolve novo profile traditional-web-v1 com instruções do JZL', (t) => {
  const { context } = createProject(t)
  const first = resolveProjectStandards(context)
  const second = resolveProjectStandards(context)

  assert.deepEqual(first, {
    id: 'traditional-web-v1',
    template: 'traditional-web',
    instructions: [
      'Use PHP, MySQL, JavaScript, HTML e CSS como stack principal do projeto.',
      'Não adicione frameworks, runtimes ou dependências extras sem necessidade explícita da Mission ou dos padrões do projeto.',
      'Prefira código simples, explícito e fácil de revisar.',
      'Preserve a estrutura e as convenções já existentes do projeto.',
      'Use somente caracteres ASCII em nomes de arquivos e diretórios.',
      'Arquivos JavaScript de primeira parte devem possuir sintaxe válida.',
      'Arquivos PHP de primeira parte devem possuir sintaxe válida.',
    ],
  })
  assert.notStrictEqual(first, second)
  assert.notStrictEqual(first.instructions, second.instructions)
})

test('um PHP gera validator com executable e argsPrefix configurados', (t) => {
  const fakeCli = join(tmpdir(), 'fake-php.js')
  const { context, root } = createProject(t, phpTool([fakeCli]))
  writeFileSync(join(root, 'index.php'), '<?php', 'utf8')

  assert.deepEqual(resolveProjectValidators(context), [{
    id: 'traditional-web:ascii-paths',
    type: 'traditional-web-ascii-paths',
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
    ['traditional-web:ascii-paths', 'php-syntax:app/a.php', 'php-syntax:app/b.php', 'php-syntax:z.PHP'],
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
    ['traditional-web:ascii-paths', 'php-syntax:index.php'],
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
    id: 'traditional-web:ascii-paths',
    type: 'traditional-web-ascii-paths',
  }])
})

test('retorna validator ASCII quando não há PHP de primeira parte', (t) => {
  const { context, root } = createProject(t)
  writeFileSync(join(root, 'index.html'), '', 'utf8')
  assert.deepEqual(resolveProjectValidators(context), [{
    id: 'traditional-web:ascii-paths',
    type: 'traditional-web-ascii-paths',
  }])
})

test('ordena JavaScript antes de PHP e usa paths relativos no node check', (t) => {
  const { context, root } = createProject(t, phpTool())
  writeFileSync(join(root, 'z.js'), 'export const z = 1\n', 'utf8')
  writeFileSync(join(root, 'a.JS'), 'export const a = 1\n', 'utf8')
  writeFileSync(join(root, 'index.php'), '', 'utf8')

  const validators = resolveProjectValidators(context)
  assert.deepEqual(validators.map(({ id }) => id), [
    'traditional-web:ascii-paths',
    'js-syntax:a.JS',
    'js-syntax:z.js',
    'php-syntax:index.php',
  ])
  assert.deepEqual(validators[1], {
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
    'traditional-web:ascii-paths',
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
})
