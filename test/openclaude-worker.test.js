import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const workerPath = join(testDirectory, '..', 'src', 'openclaude-worker.js')

function assertInvalidWorkerInput(input, expectedError) {
  const parentCwd = process.cwd()
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-openclaude-worker-'))

  try {
    assert.deepEqual(readdirSync(temporaryDirectory), [])

    const result = spawnSync(process.execPath, [workerPath], {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      input,
    })

    assert.equal(result.status, 1)
    assert.equal(result.signal, null)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.trim(), expectedError)
    assert.equal(process.cwd(), parentCwd)
    assert.deepEqual(readdirSync(temporaryDirectory), [])
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

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

const invalidInputCases = [
  {
    name: 'rejeita stdin vazio',
    input: '',
    expectedError: 'entrada do worker não pode ser vazia',
  },
  {
    name: 'rejeita JSON inválido',
    input: '{',
    expectedError: 'entrada do worker deve ser JSON válido',
  },
  {
    name: 'rejeita solicitação que não seja objeto',
    input: '[]',
    expectedError: 'solicitação do worker deve ser um objeto',
  },
  {
    name: 'rejeita ausência de prompt',
    input: '{}',
    expectedError: 'prompt é obrigatório',
  },
  {
    name: 'rejeita prompt que não seja string',
    input: JSON.stringify({ prompt: 123 }),
    expectedError: 'prompt deve ser uma string',
  },
  {
    name: 'rejeita prompt vazio após trim',
    input: JSON.stringify({ prompt: '   ' }),
    expectedError: 'prompt não pode ser vazio',
  },
]

for (const { name, input, expectedError } of invalidInputCases) {
  test(name, () => {
    assertInvalidWorkerInput(input, expectedError)
  })
}
