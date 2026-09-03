import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  evaluateTraditionalWebTechnologyBoundary,
  validateTraditionalWebTechnologyBoundaryIssue,
} from '../src/traditional-web-technology-boundary.js'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-technology-boundary-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

test('valida issue Unicode pela mesma referência sem mutação e com campos aditivos', () => {
  const issue = { path: 'src/ação.py', reason: 'technology-not-authorized', extra: true }
  const before = structuredClone(issue)
  assert.strictEqual(validateTraditionalWebTechnologyBoundaryIssue(issue), issue)
  assert.deepEqual(issue, before)
})

test('rejeita issue, path e reason inválidos', () => {
  for (const issue of [null, [], 'issue', {}, { path: 'src/app.py' }]) {
    assert.throws(() => validateTraditionalWebTechnologyBoundaryIssue(issue))
  }
  for (const path of [
    '', '/absolute.py', 'C:/file.py', 'a\\b.py', 'a/', 'a//b',
    '.', '..', 'a/./b', 'a/../b', 'a\r', 'a\n', 'a\0', 'a\u007f', 'a'.repeat(501),
  ]) assert.throws(() => validateTraditionalWebTechnologyBoundaryIssue({
    path, reason: 'technology-not-authorized',
  }), /path do issue/)
  assert.throws(() => validateTraditionalWebTechnologyBoundaryIssue({
    path: 'src/app.py', reason: 'other',
  }), /reason do issue/)
})

for (const extension of ['ts', 'tsx', 'jsx', 'vue', 'svelte', 'py', 'go', 'java', 'cs', 'rb']) {
  test(`detecta .${extension} e uppercase sem conteúdo`, (t) => {
    const { root, context } = fixture(t)
    for (const path of [`a.${extension}`, `b.${extension.toUpperCase()}`]) {
      writeFileSync(join(root, path), 'DO_NOT_LEAK_TECHNOLOGY_CONTENT')
    }
    assert.deepEqual(evaluateTraditionalWebTechnologyBoundary(context), [
      { path: `a.${extension}`, reason: 'technology-not-authorized' },
      { path: `b.${extension.toUpperCase()}`, reason: 'technology-not-authorized' },
    ])
  })
}

test('permite fontes baseline, arquivos neutros e diretórios com extensão proibida', (t) => {
  const { root, context } = fixture(t)
  for (const path of [
    'app.php', 'app.js', 'app.css', 'app.html', 'app.sql', 'data.json', 'README.md',
    'text.txt', 'data.xml', 'image.svg', 'image.png', 'image.jpg', 'image.webp',
    'favicon.ico', 'composer.lock', '.env', 'extensionless', 'app.py.txt',
  ]) writeFileSync(join(root, path), Buffer.from([0xff]))
  mkdirSync(join(root, 'directory.py'))
  assert.deepEqual(evaluateTraditionalWebTechnologyBoundary(context), [])
})

test('usa discovery ignorando controle e dependências em qualquer profundidade', (t) => {
  const { root, context } = fixture(t)
  for (const name of ['.jzl', '.git', '.openclaude', 'vendor', 'node_modules']) {
    for (const prefix of ['', 'nested']) {
      const directory = join(root, prefix, name)
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'ignored.py'), 'DO_NOT_LEAK')
    }
  }
  assert.deepEqual(evaluateTraditionalWebTechnologyBoundary(context), [])
})

test('não segue symlink ou junction externo', (t) => {
  const { root, context } = fixture(t)
  const external = fixture(t)
  writeFileSync(join(external.root, 'ignored.py'), 'DO_NOT_LEAK')
  try {
    symlinkSync(external.root, join(root, 'linked.py'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error
    t.skip(`link indisponível: ${error.code}`)
    return
  }
  assert.deepEqual(evaluateTraditionalWebTechnologyBoundary(context), [])
})

test('mantém issues únicos e ordenados e context intacto', (t) => {
  const { root, context } = fixture(t)
  mkdirSync(join(root, 'src'))
  for (const name of ['z.py', 'a.ts', 'ação.rb']) writeFileSync(join(root, 'src', name), '')
  const before = structuredClone(context)
  const issues = evaluateTraditionalWebTechnologyBoundary(context)
  assert.deepEqual(issues.map(({ path }) => path), ['src/a.ts', 'src/ação.rb', 'src/z.py'])
  assert.equal(new Set(issues.map(({ path, reason }) => `${path}:${reason}`)).size, issues.length)
  assert.deepEqual(context, before)
})

test('sanitiza erro de filesystem sem root absoluto', (t) => {
  const { root, context } = fixture(t)
  rmSync(root, { recursive: true, force: true })
  assert.throws(() => evaluateTraditionalWebTechnologyBoundary(context), (error) => {
    assert.equal(error.message.includes(root), false)
    assert.ok(error.cause)
    return true
  })
})
