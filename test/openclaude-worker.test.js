import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const workerPath = join(testDirectory, '..', 'src', 'openclaude-worker.js')

test('observa o cwd do processo filho sem alterar o cwd do pai', () => {
  const parentCwd = process.cwd()
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-worker-'))

  try {
    assert.deepEqual(readdirSync(temporaryDirectory), [])

    const result = spawnSync(process.execPath, [workerPath], {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      input: JSON.stringify({ prompt: '  JZL_TEST  ' }),
    })

    assert.equal(result.status, 0)
    assert.equal(result.signal, null)
    assert.equal(result.stderr, '')
    assert.deepEqual(JSON.parse(result.stdout), { prompt: 'JZL_TEST' })
    assert.equal(process.cwd(), parentCwd)
    assert.deepEqual(readdirSync(temporaryDirectory), [])
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
})
