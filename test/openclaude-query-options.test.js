import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { after, before, test } from 'node:test'

import { createOpenClaudeQueryOptions } from '../src/openclaude-query-options.js'

let temporaryDirectory

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-options-'))
})

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('usa o projectRoot validado e normalizado como cwd', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory)

  assert.equal(options.cwd, normalize(temporaryDirectory))
})

test('retorna somente as opções mínimas autorizadas', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory)

  assert.deepEqual(Object.keys(options).sort(), ['canUseTool', 'cwd'])
})

test('expõe canUseTool como função', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory)

  assert.equal(typeof options.canUseTool, 'function')
})

test('nega uso da ferramenta Read', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory)
  const result = await options.canUseTool('Read', { path: 'file.txt' })

  assert.equal(result.behavior, 'deny')
  assert.ok(result.message.length > 0)
})

test('nega uso da ferramenta Write', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory)
  const result = await options.canUseTool('Write', { content: 'example' })

  assert.equal(result.behavior, 'deny')
  assert.ok(result.message.includes('JZL'))
})

test('rejeita projectRoot relativo', () => {
  assert.throws(
    () => createOpenClaudeQueryOptions('relative/path'),
    /caminho absoluto/,
  )
})
