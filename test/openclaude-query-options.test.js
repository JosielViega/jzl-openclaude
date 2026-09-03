import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { after, before, test } from 'node:test'

import { createOpenClaudeQueryOptions } from '../src/openclaude-query-options.js'
import { resolveOpenClaudeDisallowedTools } from '../src/openclaude-tool-policy.js'

let temporaryDirectory
let externalDirectory
let abortController

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-options-'))
  externalDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-external-'))
  writeFileSync(join(temporaryDirectory, 'inside.txt'), 'inside')
  writeFileSync(join(temporaryDirectory, 'outside-scope.txt'), 'outside')
  writeFileSync(join(externalDirectory, 'outside.txt'), 'outside')
  abortController = new AbortController()
})

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
  rmSync(externalDirectory, { recursive: true, force: true })
})

test('usa o projectRoot validado e normalizado como cwd', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', abortController, 'model-a')

  assert.equal(options.cwd, normalize(temporaryDirectory))
})

test('retorna somente as opções mínimas autorizadas', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', abortController, 'model-a')

  assert.deepEqual(Object.keys(options).sort(), ['abortController', 'canUseTool', 'cwd', 'disallowedTools', 'model'])
  assert.strictEqual(options.abortController, abortController)
  assert.equal(options.model, 'model-a')
  assert.equal(options.sessionId, undefined)
  assert.equal(options.resume, undefined)
  assert.equal(options.continue, undefined)
  assert.equal(options.fork, undefined)
  assert.equal(options.forkSession, undefined)
})

test('Change Scope chega somente ao canUseTool e não é exposto nas QueryOptions', async () => {
  const options = createOpenClaudeQueryOptions(
    temporaryDirectory,
    'mission-execution',
    abortController,
    'model-a',
    { allowedPaths: [] },
  )
  assert.deepEqual(Object.keys(options).sort(), ['abortController', 'canUseTool', 'cwd', 'disallowedTools', 'model'])
  assert.equal(Object.hasOwn(options, 'changeScope'), false)
  assert.equal((await options.canUseTool('Write', {
    file_path: join(temporaryDirectory, 'new-scoped.txt'), content: 'x',
  })).behavior, 'deny')
})

test('inclui exatamente a denylist calculada para cada responsabilidade', () => {
  for (const responsibility of ['mission-planning', 'mission-review', 'mission-execution']) {
    const options = createOpenClaudeQueryOptions(
      temporaryDirectory, responsibility, abortController, 'model-a',
    )
    assert.deepEqual(options.disallowedTools, resolveOpenClaudeDisallowedTools(responsibility))
    assert.equal(typeof options.canUseTool, 'function')
  }
})

test('visibilidade de Write/Edit não amplia a autorização do Change Scope', async () => {
  const options = createOpenClaudeQueryOptions(
    temporaryDirectory, 'mission-execution', abortController, 'model-a',
    { allowedPaths: ['inside.txt'] },
  )
  for (const tool of ['Write', 'Edit']) {
    assert.equal(options.disallowedTools.includes(tool), false)
    assert.equal((await options.canUseTool(tool, {
      file_path: join(temporaryDirectory, 'inside.txt'), content: 'x',
      old_string: 'inside', new_string: 'x',
    })).behavior, 'allow')
    const denied = await options.canUseTool(tool, {
      file_path: join(temporaryDirectory, 'outside-scope.txt'), content: 'x',
      old_string: 'outside', new_string: 'x',
    })
    assert.equal(denied.behavior, 'deny')
    assert.match(denied.message, /Change Scope/)
  }
})

test('QueryOptions continua rejeitando responsabilidade inválida', () => {
  assert.throws(() => createOpenClaudeQueryOptions(
    temporaryDirectory, 'unknown', abortController, 'model-a',
  ), { message: 'responsabilidade OpenClaude não é suportada' })
})

test('expõe canUseTool como função', () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', abortController, 'model-a')

  assert.equal(typeof options.canUseTool, 'function')
})

test('autoriza Read interno válido', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', abortController, 'model-a')
  const result = await options.canUseTool('Read', {
    file_path: join(temporaryDirectory, 'inside.txt'),
  })

  assert.deepEqual(result, { behavior: 'allow' })
})

test('autoriza Write interno válido', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', abortController, 'model-a')
  const result = await options.canUseTool('Write', {
    file_path: join(temporaryDirectory, 'new.txt'),
    content: 'example',
  })

  assert.deepEqual(result, { behavior: 'allow' })
})

test('nega Read e Write externos', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', abortController, 'model-a')
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
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', abortController, 'model-a')
  const result = await options.canUseTool('Bash', { command: 'echo no' })

  assert.equal(result.behavior, 'deny')
  assert.ok(result.message.includes('JZL'))
})

test('rejeita projectRoot relativo', () => {
  assert.throws(
    () => createOpenClaudeQueryOptions('relative/path', 'mission-execution', abortController, 'model-a'),
    /caminho absoluto/,
  )
})

test('review mantém QueryOptions mínimas e nega Write', async () => {
  const options = createOpenClaudeQueryOptions(temporaryDirectory, 'mission-review', abortController, 'model-review')

  assert.deepEqual(Object.keys(options).sort(), ['abortController', 'canUseTool', 'cwd', 'disallowedTools', 'model'])
  for (const key of ['sessionId', 'resume', 'continue', 'fork', 'forkSession']) {
    assert.equal(options[key], undefined)
  }
  assert.equal((await options.canUseTool('Write', {
    file_path: join(temporaryDirectory, 'new.txt'), content: 'x',
  })).behavior, 'deny')
})

test('planning mantém QueryOptions mínimas e read-only', async () => {
  const options = createOpenClaudeQueryOptions(
    temporaryDirectory, 'mission-planning', abortController, 'model-plan',
  )
  assert.deepEqual(Object.keys(options).sort(), ['abortController', 'canUseTool', 'cwd', 'disallowedTools', 'model'])
  assert.equal((await options.canUseTool('Read', {
    file_path: join(temporaryDirectory, 'inside.txt'),
  })).behavior, 'allow')
  for (const [tool, input] of [
    ['Write', { file_path: join(temporaryDirectory, 'new.txt'), content: 'x' }],
    ['Edit', { file_path: join(temporaryDirectory, 'inside.txt'), old_string: 'x', new_string: 'y' }],
    ['Bash', { command: 'echo no' }],
    ['Agent', {}],
    ['Unknown', {}],
  ]) assert.equal((await options.canUseTool(tool, input)).behavior, 'deny')
})

test('rejeita AbortController ausente ou inválido', () => {
  for (const value of [undefined, null, {}, new AbortController().signal]) {
    assert.throws(
      () => createOpenClaudeQueryOptions(temporaryDirectory, 'mission-execution', value, 'model-a'),
      { message: 'abortController OpenClaude é inválido' },
    )
  }
})

test('rejeita model ausente, vazio ou não string', () => {
  for (const model of [undefined, null, 1, '   ']) {
    assert.throws(
      () => createOpenClaudeQueryOptions(
        temporaryDirectory, 'mission-execution', abortController, model,
      ),
      { message: 'model OpenClaude deve ser uma string não vazia' },
    )
  }
})
