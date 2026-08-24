const KILL_SETTLE_TIMEOUT_MS = 2000
const watchdogSettleError = 'OpenClaude worker não encerrou após o watchdog'

export function waitForOpenClaudeWorkerClose(child, timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs do watchdog deve ser um inteiro positivo')
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let timedOut = false
    let settleTimer = null

    const cleanup = () => {
      clearTimeout(watchdogTimer)
      if (settleTimer !== null) {
        clearTimeout(settleTimer)
      }
      child.removeListener('close', onClose)
      child.removeListener('error', onError)
    }

    const finish = (callback, value) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback(value)
    }

    const onClose = (code, signal) => {
      finish(resolve, { code, signal, timedOut })
    }

    const onError = (error) => {
      finish(reject, error)
    }

    const startSettleDeadline = () => {
      settleTimer = setTimeout(() => {
        finish(reject, new Error(watchdogSettleError))
      }, KILL_SETTLE_TIMEOUT_MS)
    }

    child.once('close', onClose)
    child.once('error', onError)

    const watchdogTimer = setTimeout(() => {
      if (settled) {
        return
      }

      if (child.exitCode !== null || child.signalCode !== null) {
        startSettleDeadline()
        return
      }

      timedOut = true

      try {
        child.kill('SIGKILL')
      } catch {
        // O settle deadline produz um erro determinístico se close não chegar.
      }

      startSettleDeadline()
    }, timeoutMs)
  })
}
