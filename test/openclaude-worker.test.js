import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const workerPath = join(testDirectory, '..', 'src', 'openclaude-worker.js')

test('reporta erro do parser para JSON inválido', () => {
  const parentCwd = process.cwd()
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-worker-'))

  try {
    assert.deepEqual(readdirSync(temporaryDirectory), [])

    const result = spawnSync(process.execPath, [workerPath], {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      input: '{',
    })

    assert.equal(result.status, 1)
    assert.equal(result.signal, null)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), 'entrada do worker deve ser JSON válido')
    assert.equal(process.cwd(), parentCwd)
    assert.deepEqual(readdirSync(temporaryDirectory), [])
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
})
