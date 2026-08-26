import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { discoverTraditionalWebProjectEntries } from '../src/traditional-web-project-discovery.js'

test('projeto vazio retorna discovery vazia', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.deepEqual(discoverTraditionalWebProjectEntries(createProjectContext(root)), [])
})

test('descobre arquivos e diretórios vazios em ordem sem áreas ignoradas', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'app', 'empty'), { recursive: true })
  mkdirSync(join(root, '.jzl'))
  writeFileSync(join(root, 'app', 'index.js'), '')
  writeFileSync(join(root, '.jzl', 'state.json'), '{}')

  assert.deepEqual(discoverTraditionalWebProjectEntries(createProjectContext(root)), [
    { path: 'app', kind: 'directory' },
    { path: 'app/empty', kind: 'directory' },
    { path: 'app/index.js', kind: 'file' },
  ])
})

test('inclui arquivos normais e ignora diretórios reservados em qualquer nível', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ['AGENTS.md', 'index.php', 'app.js', 'index.html', 'app.css']) {
    writeFileSync(join(root, name), '')
  }
  for (const name of ['.jzl', '.git', '.openclaude', 'vendor', 'node_modules']) {
    mkdirSync(join(root, name), { recursive: true })
    writeFileSync(join(root, name, 'ignored.js'), '')
    mkdirSync(join(root, 'src', name), { recursive: true })
    writeFileSync(join(root, 'src', name, 'ignored.php'), '')
  }
  const paths = discoverTraditionalWebProjectEntries(createProjectContext(root))
    .map(({ path }) => path)
  assert.deepEqual(paths, [
    'AGENTS.md', 'app.css', 'app.js', 'index.html', 'index.php', 'src',
  ])
})

test('não retorna nem percorre junction ou symlink externo', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-discovery-'))
  const external = mkdtempSync(join(tmpdir(), 'jzl-traditional-external-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  writeFileSync(join(external, 'outside.js'), '')
  try {
    symlinkSync(external, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    t.skip(`link indisponível: ${error.code}`)
    return
  }
  assert.deepEqual(discoverTraditionalWebProjectEntries(createProjectContext(root)), [])
})

test('não muta o contexto e usa somente paths relativos com barra', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'a'))
  writeFileSync(join(root, 'a', 'b.js'), '')
  const context = createProjectContext(root)
  const before = structuredClone(context)
  const entries = discoverTraditionalWebProjectEntries(context)
  assert.deepEqual(context, before)
  assert.deepEqual(entries.at(-1), { path: 'a/b.js', kind: 'file' })
  assert.equal(entries.some(({ path }) => path.includes(root)), false)
})

test('sanitiza falha de resolução do projectRoot', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-discovery-'))
  const context = createProjectContext(root)
  rmSync(root, { recursive: true, force: true })
  assert.throws(() => discoverTraditionalWebProjectEntries(context), {
    message: 'não foi possível listar projectRoot traditional-web',
  })
  t.after(() => rmSync(root, { recursive: true, force: true }))
})
