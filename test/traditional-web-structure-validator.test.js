import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { ensureTraditionalWebProjectStructure } from '../src/traditional-web-structure.js'
import {
  runTraditionalWebStructureValidator,
  validateTraditionalWebStructureValidator,
} from '../src/traditional-web-structure-validator.js'

const validator = { id: 'traditional-web:structure', type: 'traditional-web-structure' }

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-structure-validator-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

test('retorna PASS canônico para scaffold válido', (t) => {
  const { context } = fixture(t)
  ensureTraditionalWebProjectStructure(context)
  assert.deepEqual(runTraditionalWebStructureValidator(context, validator), {
    id: 'traditional-web:structure', status: 'PASS',
    evidence: {
      exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
      standardType: 'structure', issues: [],
    },
  })
})

test('retorna FAIL com issues ordenados sem conteúdo ou root absoluto', (t) => {
  const { root, context } = fixture(t)
  ensureTraditionalWebProjectStructure(context)
  writeFileSync(join(root, 'z.js'), 'SECRET')
  writeFileSync(join(root, 'a.php'), 'SECRET')
  const result = runTraditionalWebStructureValidator(context, validator)
  assert.equal(result.status, 'FAIL')
  assert.deepEqual(result.evidence.issues, [
    { path: 'a.php', reason: 'php-outside-public-or-src' },
    { path: 'z.js', reason: 'javascript-outside-public-assets-js' },
  ])
  assert.equal(JSON.stringify(result).includes(root), false)
  assert.equal(JSON.stringify(result).includes('SECRET'), false)
})

test('falha de filesystem retorna ERROR sanitizado', (t) => {
  const { root, context } = fixture(t)
  rmSync(root, { recursive: true, force: true })
  const result = runTraditionalWebStructureValidator(context, validator)
  assert.equal(result.status, 'ERROR')
  assert.deepEqual(result.evidence.issues, [])
  assert.equal(typeof result.evidence.errorMessage, 'string')
  assert.equal(result.evidence.errorMessage.includes(root), false)
})

test('definition aceita campos aditivos pela mesma referência', () => {
  const value = { ...validator, extra: true }
  assert.strictEqual(validateTraditionalWebStructureValidator(value), value)
  assert.throws(() => validateTraditionalWebStructureValidator({ ...value, id: 'other' }))
})
