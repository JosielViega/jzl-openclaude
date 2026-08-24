import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

import { waitForOpenClaudeWorkerClose } from '../src/openclaude-worker-watchdog.js'

class FakeChild extends EventEmitter {
  constructor(killResult = true) {
    super()
    this.exitCode = null
    this.signalCode = null
    this.killResult = killResult
    this.killSignals = []
  }

  kill(signal) {
    this.killSignals.push(signal)
    return this.killResult
  }
}

test('rejeita timeout inválido do watchdog', () => {
  for (const value of [undefined, 0, -1, 1.5, '1']) {
    assert.throws(() => waitForOpenClaudeWorkerClose(new FakeChild(), value), {
      message: 'timeoutMs do watchdog deve ser um inteiro positivo',
    })
  }
})

test('close normal limpa o timer e não mata o worker', async () => {
  const child = new FakeChild()
  const closed = waitForOpenClaudeWorkerClose(child, 20)
  child.emit('close', 0, null)
  assert.deepEqual(await closed, { code: 0, signal: null, timedOut: false })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(child.killSignals, [])
  assert.equal(child.listenerCount('close'), 0)
  assert.equal(child.listenerCount('error'), 0)
})

test('error normal rejeita sem matar o worker', async () => {
  const child = new FakeChild()
  const expected = new Error('spawn falhou')
  const closed = waitForOpenClaudeWorkerClose(child, 20)
  child.emit('error', expected)
  await assert.rejects(closed, expected)
  assert.deepEqual(child.killSignals, [])
})

test('deadline mata com SIGKILL e resolve timedOut após close', async () => {
  const child = new FakeChild()
  const closed = waitForOpenClaudeWorkerClose(child, 10)
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.deepEqual(child.killSignals, ['SIGKILL'])
  child.signalCode = 'SIGKILL'
  child.emit('close', null, 'SIGKILL')
  assert.deepEqual(await closed, {
    code: null, signal: 'SIGKILL', timedOut: true,
  })
})

test('close anterior na corrida impede kill indevido', async () => {
  const child = new FakeChild()
  const closed = waitForOpenClaudeWorkerClose(child, 15)
  setTimeout(() => child.emit('close', 0, null), 5)
  assert.deepEqual(await closed, { code: 0, signal: null, timedOut: false })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(child.killSignals, [])
})

test('kill sem close rejeita no settle deadline', async () => {
  const child = new FakeChild(false)
  const startedAt = Date.now()
  await assert.rejects(
    waitForOpenClaudeWorkerClose(child, 5),
    { message: 'OpenClaude worker não encerrou após o watchdog' },
  )
  assert.deepEqual(child.killSignals, ['SIGKILL'])
  assert.ok(Date.now() - startedAt < 3000)
})
