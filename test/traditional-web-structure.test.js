import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  ensureTraditionalWebProjectStructure,
  evaluateTraditionalWebProjectStructure,
  listTraditionalWebRequiredDirectories,
  preflightTraditionalWebProjectStructure,
  validateTraditionalWebStructureIssue,
} from '../src/traditional-web-structure.js'

const required = [
  'public', 'public/assets', 'public/assets/css', 'public/assets/js',
  'public/assets/images', 'src',
]

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-structure-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

test('lista required directories em ordem com arrays independentes', () => {
  const first = listTraditionalWebRequiredDirectories()
  const second = listTraditionalWebRequiredDirectories()
  assert.deepEqual(first, required)
  assert.notStrictEqual(first, second)
  first.push('database')
  assert.deepEqual(second, required)
})

test('preflight é read-only e ensure cria somente seis diretórios', (t) => {
  const { root, context } = fixture(t)
  preflightTraditionalWebProjectStructure(context)
  assert.deepEqual(readdirSync(root), [])
  ensureTraditionalWebProjectStructure(context)
  for (const path of required) assert.equal(lstatSync(join(root, ...path.split('/'))).isDirectory(), true)
  assert.equal(existsSync(join(root, 'database')), false)
  assert.deepEqual(
    readdirSync(root, { recursive: true }).filter((path) => !lstatSync(join(root, path)).isDirectory()),
    [],
  )
})

test('ensure é idempotente e preserva diretórios reais existentes', (t) => {
  const { root, context } = fixture(t)
  mkdirSync(join(root, 'public'))
  const before = lstatSync(join(root, 'public')).birthtimeMs
  ensureTraditionalWebProjectStructure(context)
  ensureTraditionalWebProjectStructure(context)
  assert.equal(lstatSync(join(root, 'public')).birthtimeMs, before)
})

for (const path of ['public', 'src']) {
  test(`preflight rejeita ${path} como arquivo sem criar scaffold`, (t) => {
    const { root, context } = fixture(t)
    writeFileSync(join(root, path), '')
    assert.throws(() => preflightTraditionalWebProjectStructure(context), {
      message: `estrutura traditional-web requer diretório real: ${path}`,
    })
    assert.equal(existsSync(join(root, path === 'public' ? 'src' : 'public')), false)
  })
}

test('required junction não satisfaz contrato', (t) => {
  const { root, context } = fixture(t)
  const external = mkdtempSync(join(tmpdir(), 'jzl-structure-external-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  try {
    symlinkSync(external, join(root, 'public'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    t.skip(`link indisponível: ${error.code}`)
    return
  }
  assert.throws(() => preflightTraditionalWebProjectStructure(context), {
    message: 'estrutura traditional-web requer diretório real: public',
  })
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context).find(
    ({ path }) => path === 'public'
  ), { path: 'public', reason: 'required-directory-invalid' })
})

test('avalia scaffold, database opcional e database inválido', (t) => {
  const { root, context } = fixture(t)
  ensureTraditionalWebProjectStructure(context)
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context), [])
  mkdirSync(join(root, 'database'))
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context), [])
  rmSync(join(root, 'database'), { recursive: true })
  writeFileSync(join(root, 'database'), '')
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context), [{
    path: 'database', reason: 'optional-directory-invalid',
  }])
})

test('reporta cada required directory ausente deterministicamente', (t) => {
  const { context } = fixture(t)
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context), required
    .map((path) => ({ path, reason: 'required-directory-missing' }))
    .sort((left, right) => left.path.localeCompare(right.path)))
})

test('aplica placement aprovado e ignora extensões neutras', (t) => {
  const { root, context } = fixture(t)
  ensureTraditionalWebProjectStructure(context)
  mkdirSync(join(root, 'database'))
  for (const path of [
    'public/index.php', 'public/page.HTML', 'public/assets/js/app.JS',
    'public/assets/js/admin.js', 'public/assets/css/app.CSS', 'src/Auth.PHP',
    'database/schema.SQL', 'README.md', 'public/assets/images/logo.svg',
  ]) writeFileSync(join(root, ...path.split('/')), '')
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context), [])

  for (const path of [
    'index.php', 'lib/Auth.php', 'app.js', 'public/app.js', 'src/app.js',
    'style.css', 'private/page.html', 'schema.sql', 'publicity/index.php',
    'src2/Auth.php', 'public/assets/javascript/app.js',
  ]) {
    const parent = path.split('/').slice(0, -1)
    if (parent.length > 0) mkdirSync(join(root, ...parent), { recursive: true })
    writeFileSync(join(root, ...path.split('/')), '')
  }
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context), [
    { path: 'app.js', reason: 'javascript-outside-public-assets-js' },
    { path: 'index.php', reason: 'php-outside-public-or-src' },
    { path: 'lib/Auth.php', reason: 'php-outside-public-or-src' },
    { path: 'private/page.html', reason: 'html-outside-public' },
    { path: 'public/app.js', reason: 'javascript-outside-public-assets-js' },
    { path: 'public/assets/javascript/app.js', reason: 'javascript-outside-public-assets-js' },
    { path: 'publicity/index.php', reason: 'php-outside-public-or-src' },
    { path: 'schema.sql', reason: 'sql-outside-database' },
    { path: 'src/app.js', reason: 'javascript-outside-public-assets-js' },
    { path: 'src2/Auth.php', reason: 'php-outside-public-or-src' },
    { path: 'style.css', reason: 'css-outside-public-assets-css' },
  ])
})

test('placement ignora vendor e node_modules e preserva contexto', (t) => {
  const { root, context } = fixture(t)
  ensureTraditionalWebProjectStructure(context)
  for (const name of ['vendor', 'node_modules']) {
    mkdirSync(join(root, name))
    writeFileSync(join(root, name, 'bad.php'), '')
  }
  const before = structuredClone(context)
  assert.deepEqual(evaluateTraditionalWebProjectStructure(context), [])
  assert.deepEqual(context, before)
})

test('valida issue pela mesma referência, Unicode e campos aditivos', () => {
  const issue = {
    path: 'src/usuários.php', reason: 'php-outside-public-or-src', extra: true,
  }
  assert.strictEqual(validateTraditionalWebStructureIssue(issue), issue)
  assert.throws(() => validateTraditionalWebStructureIssue({ ...issue, path: '../fora.php' }))
  assert.throws(() => validateTraditionalWebStructureIssue({ ...issue, reason: 'other' }), {
    message: 'reason do issue structural traditional-web não é suportado',
  })
})
