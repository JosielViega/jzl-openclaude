import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { after, before, test } from 'node:test'

import { createOpenClaudeQueryOptions } from '../src/openclaude-query-options.js'

let temporaryDirectory
let externalDirectory

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-options-'))
  externalDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-external-'))
  writeFileSync(join(temporaryDirectory, 'inside.txt'), 'inside')
  writeFileSync(join(externalDirectory, 'outside.txt'), 'outside')
})

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
  rmSync(externalDirectory, { recursive: true, force: true })
})

test('usa o projectRoot validado e normalizado como cwd', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution')

  assert.equal(options.cwd, normalize(temporaryDirectory))
})

test('retorna somente as opções mínimas autorizadas', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution')

  assert.deepEqual(Object.keys(options).sort(), ['canUseTool', 'cwd'])
  assert.equal(options.sessionId, undefined)
  assert.equal(options.resume, undefined)
  assert.equal(options.continue, undefined)
  assert.equal(options.fork, undefined)
  assert.equal(options.forkSession, undefined)
})

test('expõe canUseTool como função', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution')

  assert.equal(typeof options.canUseTool, 'function')
})

test('autoriza Read interno válido', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution')
  const result = await options.canUseTool('Read', {
    file_path: join(temporaryDirectory, 'inside.txt'),
  })

  assert.deepEqual(result, { behavior: 'allow' })
})

test('autoriza Write interno válido', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution')
  const result = await options.canUseTool('Write', {
    file_path: join(temporaryDirectory, 'new.txt'),
    content: 'example',
  })

  assert.deepEqual(result, { behavior: 'allow' })
})

test('nega Read e Write externos', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution')
  const externalPath = join(externalDirectory, 'outside.txt')

  assert.equal(
    (await options.canUseTool('Read', { file_path: externalPath })).behavior,
    'deny',
  )
  assert.equal(
    (await options.canUseTool('Write', {
      file_path: externalPath,
      content: 'example',
    })).behavior,
    'deny',
  )
})

test('nega Bash', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution')
  const result = await options.canUseTool('Bash', { command: 'echo no' })

  assert.equal(result.behavior, 'deny')
  assert.ok(result.message.includes('JZL'))
})

test('rejeita projectRoot relativo', () => {
  assert.throws(
    () => createOpenClaudeQueryOptions('relative/path', 'mission-execution'),
    /caminho absoluto/,
  )
})

test('review mantém QueryOptions mínimas e nega Write', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-review')

  assert.deepEqual(Object.keys(options).sort(), ['canUseTool', 'cwd'])
  for (const key of ['sessionId', 'resume', 'continue', 'fork', 'forkSession']) {
    assert.equal(options[key], undefined)
  }
  assert.equal((await options.canUseTool('Write', {
    file_path: join(temporaryDirectory, 'new.txt'), content: 'x',
  })).behavior, 'deny')
})
