import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  runTraditionalWebAsciiPathsValidator,
  validateTraditionalWebAsciiPathsValidator,
} from '../src/traditional-web-ascii-validator.js'

const validator = { id: 'traditional-web:ascii-paths', type: 'traditional-web-ascii-paths' }

test('classifica paths ASCII como PASS e Unicode como FAIL', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-ascii-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)

  assert.equal(runTraditionalWebAsciiPathsValidator(context, validator).status, 'PASS')
  writeFileSync(join(root, 'ação.js'), '')
  const result = runTraditionalWebAsciiPathsValidator(context, validator)
  assert.equal(result.status, 'FAIL')
  assert.deepEqual(result.evidence.violations, ['ação.js'])
  assert.equal(result.evidence.standardType, 'ascii-paths')
})

test('ordena múltiplas violações, ignora controles e não lê conteúdo', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-ascii-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'código'))
  writeFileSync(join(root, 'código', 'z.js'), Buffer.from([0xff]))
  writeFileSync(join(root, 'ação.js'), Buffer.from([0xff]))
  mkdirSync(join(root, 'vendor'))
  writeFileSync(join(root, 'vendor', 'ícone.js'), '')
  const result = runTraditionalWebAsciiPathsValidator(createProjectContext(root), validator)
  assert.deepEqual(result.evidence.violations, ['ação.js', 'código', 'código/z.js'])
  assert.equal(JSON.stringify(result).includes(root), false)
})

test('definition aceita campos aditivos pela mesma referência', () => {
  const value = { ...validator, extra: true }
  assert.strictEqual(validateTraditionalWebAsciiPathsValidator(value), value)
  assert.throws(() => validateTraditionalWebAsciiPathsValidator({ ...value, id: 'other' }))
})

test('falha de discovery vira ERROR sanitizado', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-traditional-ascii-'))
  const context = createProjectContext(root)
  rmSync(root, { recursive: true, force: true })
  const result = runTraditionalWebAsciiPathsValidator(context, validator)
  assert.equal(result.status, 'ERROR')
  assert.equal(result.evidence.violations.length, 0)
  assert.equal(typeof result.evidence.errorMessage, 'string')
  assert.equal(result.evidence.errorMessage.includes(root), false)
  t.after(() => rmSync(root, { recursive: true, force: true }))
})
