import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  evaluateTraditionalWebSourceText,
  validateTraditionalWebSourceTextIssue,
} from '../src/traditional-web-source-text.js'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-source-text-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

function writeProjectFile(root, projectPath, content) {
  const target = join(root, ...projectPath.split('/'))
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content)
}

test('valida issue pela mesma referência com Unicode e campos aditivos', () => {
  const issue = { path: 'public/ação.php', reason: 'invalid-utf8', extra: true }
  assert.strictEqual(validateTraditionalWebSourceTextIssue(issue), issue)
  assert.deepEqual(issue, { path: 'public/ação.php', reason: 'invalid-utf8', extra: true })
})

for (const path of [
  '', '/absolute.js', 'C:/absolute.js', 'a\\b.js', 'a/', 'a//b.js',
  'a/./b.js', 'a/../b.js', 'a\nb.js', `${'a'.repeat(501)}.js`,
]) {
  test(`rejeita path de issue inválido: ${JSON.stringify(path)}`, () => {
    assert.throws(
      () => validateTraditionalWebSourceTextIssue({ path, reason: 'invalid-utf8' }),
      /path do issue de source text traditional-web é inválido/,
    )
  })
}

test('rejeita issue e reason inválidos', () => {
  for (const issue of [null, [], 'issue']) {
    assert.throws(() => validateTraditionalWebSourceTextIssue(issue), /deve ser um objeto/)
  }
  assert.throws(
    () => validateTraditionalWebSourceTextIssue({ path: 'app.js', reason: 'bom' }),
    /reason do issue de source text traditional-web não é suportado/,
  )
})

test('aceita UTF-8, Unicode, BOM e line endings variados nas extensões cobertas', (t) => {
  const { root, context } = fixture(t)
  writeProjectFile(root, 'public/index.php', Buffer.from('\ufeffOlá usuário\r\nlinha\n', 'utf8'))
  writeProjectFile(root, 'public/assets/js/app.Js', 'const ação = true\n')
  writeProjectFile(root, 'public/assets/css/app.CSS', '/* ação */\r\n')
  writeProjectFile(root, 'public/page.HTML', '<p>ação</p>')
  writeProjectFile(root, 'database/schema.SQL', 'SELECT 1;')
  assert.deepEqual(evaluateTraditionalWebSourceText(context), [])
})

test('reporta UTF-8 inválido somente nas extensões cobertas, case-insensitive', (t) => {
  const { root, context } = fixture(t)
  const paths = [
    'public/a.php', 'public/assets/js/b.JS', 'public/assets/css/c.Css',
    'public/d.HTML', 'database/e.sQl',
  ]
  for (const path of paths) writeProjectFile(root, path, Buffer.from([0xff]))
  for (const path of ['image.png', 'README.md', 'note.txt', 'data.json', 'vector.svg']) {
    writeProjectFile(root, path, Buffer.from([0xff]))
  }
  assert.deepEqual(evaluateTraditionalWebSourceText(context), paths
    .map((path) => ({ path, reason: 'invalid-utf8' }))
    .sort((left, right) => left.path.localeCompare(right.path)))
})

test('decodifica sequência multibyte dividida no limite de 64 KiB', (t) => {
  const { root, context } = fixture(t)
  const prefix = Buffer.alloc((64 * 1024) - 1, 0x61)
  writeProjectFile(root, 'public/assets/css/app.css', Buffer.concat([
    prefix, Buffer.from('é', 'utf8'), Buffer.from('\n'),
  ]))
  assert.deepEqual(evaluateTraditionalWebSourceText(context), [])

  writeProjectFile(root, 'public/assets/css/app.css', Buffer.concat([
    prefix, Buffer.from([0xc3, 0x28]),
  ]))
  assert.deepEqual(evaluateTraditionalWebSourceText(context), [{
    path: 'public/assets/css/app.css', reason: 'invalid-utf8',
  }])
})

test('ignora diretórios reservados e não segue symlink ou junction', (t) => {
  const { root, context } = fixture(t)
  for (const name of ['.jzl', '.git', '.openclaude', 'vendor', 'node_modules']) {
    writeProjectFile(root, `${name}/bad.js`, Buffer.from([0xff]))
  }
  const external = mkdtempSync(join(tmpdir(), 'jzl-source-text-external-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  writeFileSync(join(external, 'bad.js'), Buffer.from([0xff]))
  try {
    symlinkSync(external, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    t.diagnostic(`link indisponível: ${error.code}`)
  }
  assert.deepEqual(evaluateTraditionalWebSourceText(context), [])
})

test('erro de filesystem é sanitizado e preserva cause', (t) => {
  const { root, context } = fixture(t)
  writeProjectFile(root, 'app.js', '')
  rmSync(root, { recursive: true, force: true })
  assert.throws(() => evaluateTraditionalWebSourceText(context), (error) => {
    assert.equal(error.message.includes(root), false)
    assert.ok(error.cause instanceof Error)
    return true
  })
})
