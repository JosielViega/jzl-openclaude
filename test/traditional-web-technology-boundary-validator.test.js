import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  runTraditionalWebTechnologyBoundaryValidator,
  validateTraditionalWebTechnologyBoundaryValidator,
} from '../src/traditional-web-technology-boundary-validator.js'

const validator = {
  id: 'traditional-web:technology-boundary', type: 'traditional-web-technology-boundary',
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-technology-validator-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

function evidence(issues = [], errorMessage = null) {
  return {
    exitCode: null, signal: null, stdout: '', stderr: '', errorMessage,
    standardType: 'technology-boundary', issues,
  }
}

test('definition valida identidade exata, campos aditivos e mesma referência', () => {
  const value = { ...validator, extra: true }
  assert.strictEqual(validateTraditionalWebTechnologyBoundaryValidator(value), value)
  for (const invalid of [null, [], {}, { ...validator, id: 'other' }, { ...validator, type: 'other' }]) {
    assert.throws(() => validateTraditionalWebTechnologyBoundaryValidator(invalid))
  }
})

test('retorna PASS canônico sem mutar inputs', (t) => {
  const { context } = fixture(t)
  const before = structuredClone({ context, validator })
  assert.deepEqual(runTraditionalWebTechnologyBoundaryValidator(context, validator), {
    id: validator.id, status: 'PASS', evidence: evidence(),
  })
  assert.deepEqual({ context, validator }, before)
})

test('retorna FAIL canônico ordenado sem conteúdo ou root', (t) => {
  const { root, context } = fixture(t)
  writeFileSync(join(root, 'z.py'), 'DO_NOT_LEAK')
  writeFileSync(join(root, 'a.ts'), 'DO_NOT_LEAK')
  const result = runTraditionalWebTechnologyBoundaryValidator(context, validator)
  assert.deepEqual(result, {
    id: validator.id, status: 'FAIL', evidence: evidence([
      { path: 'a.ts', reason: 'technology-not-authorized' },
      { path: 'z.py', reason: 'technology-not-authorized' },
    ]),
  })
  assert.equal(JSON.stringify(result).includes(root), false)
  assert.equal(JSON.stringify(result).includes('DO_NOT_LEAK'), false)
})

test('retorna ERROR sanitizado de filesystem', (t) => {
  const { root, context } = fixture(t)
  rmSync(root, { recursive: true, force: true })
  const result = runTraditionalWebTechnologyBoundaryValidator(context, validator)
  assert.equal(result.status, 'ERROR')
  assert.ok(result.evidence.errorMessage)
  assert.equal(result.evidence.errorMessage.includes(root), false)
  assert.deepEqual(result.evidence, evidence([], result.evidence.errorMessage))
})
