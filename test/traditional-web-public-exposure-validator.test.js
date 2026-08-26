import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  runTraditionalWebPublicExposureValidator,
  validateTraditionalWebPublicExposureValidator,
} from '../src/traditional-web-public-exposure-validator.js'

const validator = {
  id: 'traditional-web:public-exposure', type: 'traditional-web-public-exposure',
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-public-validator-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

test('definition canônica aceita campos aditivos pela mesma referência', () => {
  const value = { ...validator, extra: true }
  assert.strictEqual(validateTraditionalWebPublicExposureValidator(value), value)
  for (const invalid of [null, [], {}, { ...validator, id: 'other' }]) {
    assert.throws(() => validateTraditionalWebPublicExposureValidator(invalid))
  }
})

test('retorna PASS para public ausente, inválido, vazio ou válido', (t) => {
  for (const mode of ['missing', 'file', 'empty', 'valid']) {
    const { root, context } = fixture(t)
    if (mode === 'file') writeFileSync(join(root, 'public'), '')
    if (['empty', 'valid'].includes(mode)) mkdirSync(join(root, 'public'))
    if (mode === 'valid') writeFileSync(join(root, 'public', 'robots.txt'), 'ok')
    const result = runTraditionalWebPublicExposureValidator(context, validator)
    assert.equal(result.status, 'PASS')
    assert.deepEqual(result.evidence.issues, [])
    assert.equal(result.evidence.standardType, 'public-exposure')
  }
})

test('retorna FAIL canônico ordenado sem conteúdo ou root absoluto', (t) => {
  const { root, context } = fixture(t)
  mkdirSync(join(root, 'public'))
  writeFileSync(join(root, 'public', 'package.json'), 'DO_NOT_LEAK')
  writeFileSync(join(root, 'public', '.env'), 'DO_NOT_LEAK')
  const result = runTraditionalWebPublicExposureValidator(context, validator)
  assert.deepEqual(result, {
    id: 'traditional-web:public-exposure', status: 'FAIL',
    evidence: {
      exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
      standardType: 'public-exposure',
      issues: [
        { path: 'public/.env', reason: 'environment-path-publicly-exposed' },
        { path: 'public/package.json', reason: 'dependency-manifest-publicly-exposed' },
      ],
    },
  })
  assert.equal(JSON.stringify(result).includes(root), false)
  assert.equal(JSON.stringify(result).includes('DO_NOT_LEAK'), false)
})

test('runtime filesystem vira ERROR canônico sanitizado', (t) => {
  const { root, context } = fixture(t)
  rmSync(root, { recursive: true, force: true })
  const result = runTraditionalWebPublicExposureValidator(context, validator)
  assert.equal(result.status, 'ERROR')
  assert.deepEqual(result.evidence.issues, [])
  assert.equal(typeof result.evidence.errorMessage, 'string')
  assert.equal(result.evidence.errorMessage.includes(root), false)
})
