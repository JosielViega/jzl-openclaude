import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  runTraditionalWebSourceTextValidator,
  validateTraditionalWebSourceTextValidator,
} from '../src/traditional-web-source-text-validator.js'

const validator = {
  id: 'traditional-web:source-text', type: 'traditional-web-source-text',
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-source-validator-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

test('definition aceita campos aditivos pela mesma referência', () => {
  const value = { ...validator, extra: true }
  assert.strictEqual(validateTraditionalWebSourceTextValidator(value), value)
  for (const invalid of [null, [], {}, { ...validator, id: 'other' }]) {
    assert.throws(() => validateTraditionalWebSourceTextValidator(invalid))
  }
})

test('retorna evidence canônica PASS', (t) => {
  const { root, context } = fixture(t)
  writeFileSync(join(root, 'app.js'), 'const ação = true\n', 'utf8')
  assert.deepEqual(runTraditionalWebSourceTextValidator(context, validator), {
    id: 'traditional-web:source-text', status: 'PASS',
    evidence: {
      exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
      standardType: 'source-text', issues: [],
    },
  })
})

test('retorna evidence canônica FAIL sem conteúdo', (t) => {
  const { root, context } = fixture(t)
  writeFileSync(join(root, 'app.js'), Buffer.from([0xff]))
  const result = runTraditionalWebSourceTextValidator(context, validator)
  assert.deepEqual(result, {
    id: 'traditional-web:source-text', status: 'FAIL',
    evidence: {
      exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
      standardType: 'source-text',
      issues: [{ path: 'app.js', reason: 'invalid-utf8' }],
    },
  })
  assert.equal(JSON.stringify(result).includes(root), false)
  assert.equal(JSON.stringify(result).includes('ff'), false)
})

test('converte falha de runtime em evidence canônica ERROR', (t) => {
  const { root, context } = fixture(t)
  rmSync(root, { recursive: true, force: true })
  const result = runTraditionalWebSourceTextValidator(context, validator)
  assert.equal(result.status, 'ERROR')
  assert.deepEqual(result.evidence.issues, [])
  assert.equal(result.evidence.exitCode, null)
  assert.equal(result.evidence.signal, null)
  assert.equal(result.evidence.stdout, '')
  assert.equal(result.evidence.stderr, '')
  assert.equal(typeof result.evidence.errorMessage, 'string')
  assert.equal(result.evidence.errorMessage.includes(root), false)
})
