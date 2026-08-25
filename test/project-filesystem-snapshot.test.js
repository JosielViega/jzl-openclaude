import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  createProjectFilesystemSnapshot,
  validateProjectFilesystemSnapshot,
} from '../src/project-filesystem-snapshot.js'

function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-filesystem-snapshot-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

function digestFor(snapshot, path) {
  return snapshot.entries.find((entry) => entry.path === path)?.digest
}

test('snapshot vazio possui shape canônico', (t) => {
  const { context } = project(t)
  assert.deepEqual(createProjectFilesystemSnapshot(context), { entries: [] })
})

test('hash considera bytes exatos, binário, nesting e ordem determinística', (t) => {
  const { root, context } = project(t)
  mkdirSync(join(root, 'z'))
  mkdirSync(join(root, 'a'))
  writeFileSync(join(root, 'z', 'same.txt'), 'mesmos bytes')
  writeFileSync(join(root, 'a', 'binary.bin'), Buffer.from([0, 255, 10]))
  writeFileSync(join(root, 'middle.txt'), 'conteúdo não persistido')

  const snapshot = createProjectFilesystemSnapshot(context)
  assert.deepEqual(snapshot.entries.map(({ path }) => path), [
    'a/binary.bin', 'middle.txt', 'z/same.txt',
  ])
  assert.ok(snapshot.entries.every(({ kind }) => kind === 'file'))
  assert.ok(snapshot.entries.every(({ digest }) => /^[0-9a-f]{64}$/.test(digest)))
  assert.equal(JSON.stringify(snapshot).includes('conteúdo não persistido'), false)
})

test('digest muda apenas quando bytes mudam, inclusive com mesmo tamanho', (t) => {
  const { root, context } = project(t)
  const path = join(root, 'value.txt')
  writeFileSync(path, 'AAAA')
  const first = createProjectFilesystemSnapshot(context)
  const firstDigest = digestFor(first, 'value.txt')

  utimesSync(path, new Date(1_000_000), new Date(1_000_000))
  assert.equal(digestFor(createProjectFilesystemSnapshot(context), 'value.txt'), firstDigest)

  writeFileSync(path, 'BBBB')
  assert.notEqual(digestFor(createProjectFilesystemSnapshot(context), 'value.txt'), firstDigest)
})

test('ignora namespaces de controle e observa aplicação, dependencies e AGENTS', (t) => {
  const { root, context } = project(t)
  for (const directory of ['.jzl', '.git', '.openclaude']) {
    mkdirSync(join(root, directory))
    writeFileSync(join(root, directory, 'ignored.txt'), 'ignorar')
  }
  mkdirSync(join(root, 'node_modules'))
  mkdirSync(join(root, 'vendor'))
  writeFileSync(join(root, 'node_modules', 'example.txt'), 'node')
  writeFileSync(join(root, 'vendor', 'example.php'), '<?php')
  writeFileSync(join(root, 'AGENTS.md'), 'regras')

  const paths = createProjectFilesystemSnapshot(context).entries.map(({ path }) => path)
  assert.deepEqual(paths, [
    'AGENTS.md', 'node_modules/example.txt', 'vendor/example.php',
  ])
})

test('links são entries únicas e targets internos ou externos não são percorridos', (t) => {
  const { root, context } = project(t)
  const external = mkdtempSync(join(tmpdir(), 'jzl-snapshot-external-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  writeFileSync(join(root, 'target.txt'), 'interno')
  mkdirSync(join(root, 'target-directory'))
  writeFileSync(join(root, 'target-directory', 'nested.txt'), 'nested')
  writeFileSync(join(external, 'secret.txt'), 'externo secreto')

  try {
    symlinkSync(join(root, 'target.txt'), join(root, 'file-link'), 'file')
    symlinkSync(
      join(root, 'target-directory'),
      join(root, 'directory-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    symlinkSync(
      external,
      join(root, 'external-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  } catch (error) {
    if (error?.code === 'EPERM') return t.skip('symlink de arquivo indisponível')
    throw error
  }

  const snapshot = createProjectFilesystemSnapshot(context)
  const links = snapshot.entries.filter(({ kind }) => kind === 'symlink')
  assert.deepEqual(links.map(({ path }) => path), [
    'directory-link', 'external-link', 'file-link',
  ])
  assert.equal(snapshot.entries.some(({ path }) => path.includes('secret.txt')), false)
  assert.equal(snapshot.entries.some(({ path }) => path === 'directory-link/nested.txt'), false)
})

test('junction de diretório é entry única e não percorre target externo', (t) => {
  const { root, context } = project(t)
  const external = mkdtempSync(join(tmpdir(), 'jzl-snapshot-junction-external-'))
  const secondExternal = mkdtempSync(join(tmpdir(), 'jzl-snapshot-junction-second-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  t.after(() => rmSync(secondExternal, { recursive: true, force: true }))
  writeFileSync(join(external, 'secret.txt'), 'externo secreto')
  mkdirSync(join(root, '.jzl'))
  writeFileSync(join(root, '.jzl', 'state.json'), 'estado protegido')

  try {
    symlinkSync(
      external,
      join(root, 'external-directory-alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    symlinkSync(
      join(root, '.jzl'),
      join(root, 'control-directory-alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  } catch (error) {
    if (error?.code === 'EPERM') return t.skip('alias de diretório indisponível')
    throw error
  }

  const snapshot = createProjectFilesystemSnapshot(context)
  assert.deepEqual(snapshot.entries.map(({ path, kind }) => ({ path, kind })), [
    { path: 'control-directory-alias', kind: 'symlink' },
    { path: 'external-directory-alias', kind: 'symlink' },
  ])
  assert.equal(JSON.stringify(snapshot).includes('secret.txt'), false)
  assert.equal(JSON.stringify(snapshot).includes('externo secreto'), false)
  assert.equal(JSON.stringify(snapshot).includes('state.json'), false)
  assert.equal(JSON.stringify(snapshot).includes('estado protegido'), false)

  const firstDigest = digestFor(snapshot, 'external-directory-alias')
  unlinkSync(join(root, 'external-directory-alias'))
  symlinkSync(
    secondExternal,
    join(root, 'external-directory-alias'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  assert.notEqual(
    digestFor(createProjectFilesystemSnapshot(context), 'external-directory-alias'),
    firstDigest,
  )
})

test('mudança no target textual do link altera digest', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'a.txt'), 'igual')
  writeFileSync(join(root, 'b.txt'), 'igual')

  try {
    symlinkSync(join(root, 'a.txt'), join(root, 'alias.txt'), 'file')
  } catch (error) {
    if (error?.code === 'EPERM') return t.skip('symlink indisponível')
    throw error
  }

  const firstDigest = digestFor(createProjectFilesystemSnapshot(context), 'alias.txt')
  unlinkSync(join(root, 'alias.txt'))
  symlinkSync(join(root, 'b.txt'), join(root, 'alias.txt'), 'file')
  assert.notEqual(digestFor(createProjectFilesystemSnapshot(context), 'alias.txt'), firstDigest)
})

test('valida shape, ordem, unicidade, path, control path e digest', () => {
  const valid = { entries: [{ path: 'index.html', kind: 'file', digest: 'a'.repeat(64) }] }
  assert.strictEqual(validateProjectFilesystemSnapshot(valid), valid)

  for (const [snapshot, message] of [
    [null, 'snapshot do filesystem deve ser um objeto'],
    [{}, 'entries do snapshot deve ser um array'],
    [{ entries: [null] }, 'entry do snapshot deve ser um objeto'],
    [{ entries: [{ ...valid.entries[0], path: '../x' }] }, 'path do snapshot não é relativo e normalizado'],
    [{ entries: [{ ...valid.entries[0], path: '.jzl/x' }] }, 'path do snapshot pertence a namespace de controle'],
    [{ entries: [{ ...valid.entries[0], kind: 'directory' }] }, 'kind da entry do snapshot não é suportado'],
    [{ entries: [{ ...valid.entries[0], digest: 'ABC' }] }, 'digest da entry do snapshot é inválido'],
    [{ entries: [valid.entries[0], { ...valid.entries[0] }] }, 'entries do snapshot devem possuir paths únicos e ordenados'],
  ]) {
    assert.throws(() => validateProjectFilesystemSnapshot(snapshot), { message })
  }
})

test('rejeita paths absolutos, backslash, segmentos e controles', () => {
  for (const path of [
    '/absolute', 'C:/absolute', 'a\\b', './a', 'a/../b', 'a//b',
    'a/', 'a\nb', 'a\rb', `a${String.fromCharCode(0)}b`, 'a'.repeat(501),
  ]) {
    assert.throws(() => validateProjectFilesystemSnapshot({
      entries: [{ path, kind: 'file', digest: 'a'.repeat(64) }],
    }))
  }

  const maximumPath = 'a'.repeat(500)
  const maximumSnapshot = {
    entries: [{ path: maximumPath, kind: 'file', digest: 'a'.repeat(64) }],
  }
  assert.strictEqual(
    validateProjectFilesystemSnapshot(maximumSnapshot),
    maximumSnapshot,
  )

  if (process.platform === 'win32') {
    assert.throws(() => validateProjectFilesystemSnapshot({
      entries: [{ path: '.JZL/x', kind: 'file', digest: 'a'.repeat(64) }],
    }), { message: 'path do snapshot pertence a namespace de controle' })
  }
})
