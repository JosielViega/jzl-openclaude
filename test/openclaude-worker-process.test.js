import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { spawnOpenClaudeWorker } from '../src/openclaude-worker-process.js'

test('inicia o worker com o projectRoot como cwd', async () => {
  const parentCwd = process.cwd()
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-worker-process-'))

  try {
    assert.deepEqual(readdirSync(temporaryDirectory), [])

    const child = spawnOpenClaudeWorker(temporaryDirectory)

    assert.notEqual(child.stdin, null)
    assert.notEqual(child.stdout, null)
    assert.notEqual(child.stderr, null)

    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })

    child.stdin.end(JSON.stringify({ prompt: 'JZL_TEST' }))

    const result = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => {
        resolve({ code, signal })
      })
    })

    assert.equal(result.code, 0)
    assert.equal(result.signal, null)
    assert.deepEqual(JSON.parse(stdout), { prompt: 'JZL_TEST' })
    assert.equal(stderr, '')
    assert.equal(process.cwd(), parentCwd)
    assert.deepEqual(readdirSync(temporaryDirectory), [])
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
})

test('rejeita projectRoot relativo de forma síncrona', () => {
  assert.throws(
    () => spawnOpenClaudeWorker('relative/path'),
    /caminho absoluto/,
  )
})
