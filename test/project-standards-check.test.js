import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { initializeProjectConfigStore } from '../src/project-config-store.js'
import { checkProjectStandards } from '../src/project-standards-check.js'
import { ensureTraditionalWebProjectStructure } from '../src/traditional-web-structure.js'

test('verifica standards sem persistir estado e detecta JavaScript inválido', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-project-standards-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  initializeProjectConfigStore(context, { template: 'traditional-web', tools: {} })
  ensureTraditionalWebProjectStructure(context)
  writeFileSync(join(root, 'public', 'assets', 'js', 'invalid.js'), 'const =')

  const result = checkProjectStandards(context)
  assert.equal(result.standard, 'traditional-web-v1')
  assert.equal(result.status, 'FAIL')
  assert.deepEqual(result.results.map(({ id }) => id), [
    'traditional-web:structure',
    'traditional-web:ascii-paths',
    'js-syntax:public/assets/js/invalid.js',
  ])
})

test('projeto vazio passa somente pelo standard ASCII sem exigir State', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-project-standards-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  initializeProjectConfigStore(context, { template: 'traditional-web', tools: {} })
  ensureTraditionalWebProjectStructure(context)
  assert.deepEqual(checkProjectStandards(context), {
    standard: 'traditional-web-v1',
    status: 'PASS',
    results: [{
      id: 'traditional-web:structure',
      status: 'PASS',
      evidence: {
        exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
        standardType: 'structure', issues: [],
      },
    }, {
      id: 'traditional-web:ascii-paths',
      status: 'PASS',
      evidence: {
        exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
        standardType: 'ascii-paths', violations: [],
      },
    }],
  })
})

test('preserva PHP configurado e agrega sintaxe válida ou inválida', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-project-standards-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  const ignoredDirectory = join(root, 'node_modules')
  mkdirSync(ignoredDirectory)
  const fakePhp = join(ignoredDirectory, 'fake-php.js')
  writeFileSync(fakePhp, (
    "const fs = require('node:fs'); "
    + "if (fs.readFileSync(process.argv.at(-1), 'utf8').includes('INVALID')) process.exit(1);"
  ))
  initializeProjectConfigStore(context, {
    template: 'traditional-web',
    tools: { php: { executable: process.execPath, argsPrefix: [fakePhp] } },
  })
  ensureTraditionalWebProjectStructure(context)
  writeFileSync(join(root, 'public', 'index.php'), '<?php')
  assert.equal(checkProjectStandards(context).status, 'PASS')
  writeFileSync(join(root, 'public', 'index.php'), 'INVALID')
  const failed = checkProjectStandards(context)
  assert.equal(failed.status, 'FAIL')
  assert.equal(failed.results.at(-1).id, 'php-syntax:public/index.php')
})
