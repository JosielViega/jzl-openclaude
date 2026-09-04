import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const workerPath = join(testDirectory, '..', 'src', 'openclaude-worker.js')

// Substituição restrita ao subprocesso de teste: o entrypoint e o parser são reais.
// Nenhum SDK/modelo é carregado. O timer simula um handle vivo da dependência.
function runWorkerLifecycle({ failure = false, failedStream = null } = {}) {
  const script = `
    import assert from 'node:assert/strict'
    import { registerHooks } from 'node:module'

    const failure = ${JSON.stringify(failure)}
    const failedStream = ${JSON.stringify(failedStream)}
    const executionUrl = ${JSON.stringify(pathToFileURL(join(testDirectory, '..', 'src', 'openclaude-worker-execution.js')).href)}
    registerHooks({
      load(url, context, nextLoad) {
        if (url !== executionUrl) return nextLoad(url, context)
        return {
          format: 'module',
          shortCircuit: true,
          source: \`export async function executeOpenClaudeQuery() {
            const text = 'resultado com acentuação '.repeat(8192)
            if (\${failure}) {
              throw Object.assign(new Error(text), { sessionId: 'session-test' })
            }
            return { sessionId: 'session-test', result: text }
          }\`,
        }
      },
    })

    let pending = 0
    let completed = 0
    for (const name of ['stdout', 'stderr']) {
      const stream = process[name]
      const originalWrite = stream.write.bind(stream)
      stream.write = (line, callback) => {
        pending++
        setTimeout(() => {
          const done = error => {
            pending--
            completed++
            callback(error)
          }
          if (failedStream === name) {
            const error = new Error('falha de escrita simulada')
            done(error)
            stream.emit('error', error)
          } else {
            originalWrite(line, done)
          }
        }, 25)
        return false
      }
    }
    const originalExit = process.exit.bind(process)
    process.exit = code => {
      assert.equal(pending, 0, 'exit deve aguardar os callbacks de escrita')
      assert.equal(completed, failedStream === 'stdout' ? 1 : failure ? 2 : 1)
      originalExit(code)
    }
    setInterval(() => {}, 1000)
    await import(${JSON.stringify(pathToFileURL(workerPath).href)})
  `

  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    input: JSON.stringify({
      prompt: 'teste',
      sessionMode: 'fresh',
      responsibility: 'mission-planning',
      model: 'test-model',
    }),
    // Limite somente do teste: detecta regressão sem deixar o subprocesso preso.
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
  })
}

test('sucesso descarrega JSON completo antes de exit 0 mesmo com handle ativo', () => {
  const result = runWorkerLifecycle()
  assert.equal(result.error, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), {
    sessionId: 'session-test',
    result: 'resultado com acentuação '.repeat(8192),
  })
})

test('erro descarrega envelope e stderr antes de exit 1 mesmo com handle ativo', () => {
  const result = runWorkerLifecycle({ failure: true })
  const message = 'resultado com acentuação '.repeat(8192)
  assert.equal(result.error, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.status, 1)
  assert.deepEqual(JSON.parse(result.stdout), { error: message, sessionId: 'session-test' })
  assert.equal(result.stderr, `${message}\n`)
})

test('falha ao descarregar sucesso muda exit para 1', () => {
  const result = runWorkerLifecycle({ failedStream: 'stdout' })
  assert.equal(result.error, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
})

for (const failedStream of ['stdout', 'stderr']) {
  test(`falha no flush de ${failedStream} encerra com exit 1 apesar de handle ativo`, () => {
    const result = runWorkerLifecycle({ failure: true, failedStream })
    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    assert.equal(result.status, 1)
    assert.equal(result.stderr, '')
    if (failedStream === 'stdout') {
      assert.equal(result.stdout, '')
    } else {
      assert.deepEqual(JSON.parse(result.stdout), {
        error: 'resultado com acentuação '.repeat(8192),
        sessionId: 'session-test',
      })
    }
  })
}

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
    assert.deepEqual(JSON.parse(result.stdout), {
      error: 'entrada do worker deve ser JSON válido',
      sessionId: null,
    })
    assert.equal(result.stderr.trim(), 'entrada do worker deve ser JSON válido')
    assert.equal(process.cwd(), parentCwd)
    assert.deepEqual(readdirSync(temporaryDirectory), [])
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
})
