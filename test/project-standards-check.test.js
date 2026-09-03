import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  assert.equal(result.standard, 'traditional-web-v4')
  assert.equal(result.status, 'FAIL')
  assert.deepEqual(result.results.map(({ id }) => id), [
    'traditional-web:structure',
    'traditional-web:public-exposure',
    'traditional-web:technology-boundary',
    'traditional-web:ascii-paths',
    'traditional-web:source-text',
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
    standard: 'traditional-web-v4',
    status: 'PASS',
    results: [{
      id: 'traditional-web:structure',
      status: 'PASS',
      evidence: {
        exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
        standardType: 'structure', issues: [],
      },
    }, {
      id: 'traditional-web:public-exposure',
      status: 'PASS',
      evidence: {
        exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
        standardType: 'public-exposure', issues: [],
      },
    }, {
      id: 'traditional-web:technology-boundary',
      status: 'PASS',
      evidence: {
        exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
        standardType: 'technology-boundary', issues: [],
      },
    }, {
      id: 'traditional-web:ascii-paths',
      status: 'PASS',
      evidence: {
        exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
        standardType: 'ascii-paths', violations: [],
      },
    }, {
      id: 'traditional-web:source-text',
      status: 'PASS',
      evidence: {
        exitCode: null, signal: null, stdout: '', stderr: '', errorMessage: null,
        standardType: 'source-text', issues: [],
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

test('legacy e pinned são equivalentes e profile inválido falha sem mutação', (t) => {
  const roots = ['legacy', 'pinned'].map((kind) => {
    const root = mkdtempSync(join(tmpdir(), `jzl-project-standards-${kind}-`))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const context = createProjectContext(root)
    if (kind === 'legacy') {
      mkdirSync(join(root, '.jzl'))
      writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
        schemaVersion: 1, template: 'traditional-web', tools: {},
      }, null, 2) + '\n')
    } else {
      mkdirSync(join(root, '.jzl'))
      writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
        schemaVersion: 1, template: 'traditional-web',
        standardsProfile: 'traditional-web-v1', tools: {},
      }, null, 2) + '\n')
    }
    ensureTraditionalWebProjectStructure(context)
    return { root, context }
  })
  const legacyPath = join(roots[0].root, '.jzl', 'config.json')
  const legacyBytes = readFileSync(legacyPath)
  assert.deepEqual(
    checkProjectStandards(roots[0].context),
    checkProjectStandards(roots[1].context),
  )
  assert.deepEqual(readFileSync(legacyPath), legacyBytes)

  const invalidPath = join(roots[1].root, '.jzl', 'config.json')
  writeFileSync(invalidPath, JSON.stringify({
    schemaVersion: 1, template: 'traditional-web',
    standardsProfile: 'traditional-web-unknown', tools: {},
  }))
  const invalidBytes = readFileSync(invalidPath)
  assert.throws(() => checkProjectStandards(roots[1].context), {
    message: 'standardsProfile da configuração do projeto não é suportado para o template',
  })
  assert.deepEqual(readFileSync(invalidPath), invalidBytes)
})

test('pinning mantém UTF-8 inválido fora do v1 e aplica Source Text somente no v2', (t) => {
  const projects = ['legacy', 'v1', 'v2'].map((profile) => {
    const root = mkdtempSync(join(tmpdir(), `jzl-source-profile-${profile}-`))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const context = createProjectContext(root)
    mkdirSync(join(root, '.jzl'))
    writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
      schemaVersion: 1,
      template: 'traditional-web',
      ...(profile === 'legacy' ? {} : { standardsProfile: `traditional-web-${profile}` }),
      tools: {},
    }, null, 2) + '\n')
    ensureTraditionalWebProjectStructure(context)
    writeFileSync(join(root, 'public', 'assets', 'css', 'app.css'), Buffer.from([0xff]))
    return { profile, root, context }
  })

  for (const project of projects.slice(0, 2)) {
    const result = checkProjectStandards(project.context)
    assert.equal(result.standard, 'traditional-web-v1')
    assert.equal(result.status, 'PASS')
    assert.equal(result.results.some(({ id }) => id === 'traditional-web:source-text'), false)
  }

  const v2 = checkProjectStandards(projects[2].context)
  assert.equal(v2.standard, 'traditional-web-v2')
  assert.equal(v2.status, 'FAIL')
  assert.deepEqual(v2.results.find(({ id }) => id === 'traditional-web:source-text').evidence.issues, [{
    path: 'public/assets/css/app.css', reason: 'invalid-utf8',
  }])

  writeFileSync(join(projects[2].root, 'public', 'assets', 'css', 'app.css'), '/* ação */\r\n')
  assert.equal(
    checkProjectStandards(projects[2].context).results
      .find(({ id }) => id === 'traditional-web:source-text').status,
    'PASS',
  )
})

test('v2 separa encoding de sintaxe JavaScript', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jzl-source-syntax-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  initializeProjectConfigStore(context, { template: 'traditional-web' })
  ensureTraditionalWebProjectStructure(context)
  const target = join(root, 'public', 'assets', 'js', 'app.js')
  writeFileSync(target, 'const = ação\n', 'utf8')
  let result = checkProjectStandards(context)
  assert.equal(result.results.find(({ id }) => id === 'traditional-web:source-text').status, 'PASS')
  assert.equal(result.results.find(({ id }) => id.endsWith('app.js')).status, 'FAIL')

  writeFileSync(target, Buffer.from([0xff]))
  result = checkProjectStandards(context)
  assert.equal(result.results.find(({ id }) => id === 'traditional-web:source-text').status, 'FAIL')
})

test('Public Exposure pertence somente ao v3 e preserva v1 e v2 congelados', (t) => {
  for (const profile of ['traditional-web-v1', 'traditional-web-v2', 'traditional-web-v3']) {
    const root = mkdtempSync(join(tmpdir(), `jzl-exposure-pinning-${profile}-`))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const context = createProjectContext(root)
    mkdirSync(join(root, '.jzl'))
    writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
      schemaVersion: 1, template: 'traditional-web', standardsProfile: profile, tools: {},
    }, null, 2) + '\n')
    ensureTraditionalWebProjectStructure(context)
    writeFileSync(join(root, 'public', '.env'), 'DO_NOT_LEAK')

    const result = checkProjectStandards(context)
    const exposure = result.results.find(({ id }) => id === 'traditional-web:public-exposure')
    if (profile === 'traditional-web-v3') {
      assert.equal(result.status, 'FAIL')
      assert.deepEqual(exposure.evidence.issues, [{
        path: 'public/.env', reason: 'environment-path-publicly-exposed',
      }])
    } else {
      assert.equal(result.status, 'PASS')
      assert.equal(exposure, undefined)
    }
  }
})

test('public ausente ou inválido mantém Exposure PASS e aggregate Structure FAIL', (t) => {
  for (const mode of ['missing', 'file']) {
    const root = mkdtempSync(join(tmpdir(), `jzl-exposure-root-${mode}-`))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const context = createProjectContext(root)
    mkdirSync(join(root, '.jzl'))
    writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
      schemaVersion: 1, template: 'traditional-web',
      standardsProfile: 'traditional-web-v3', tools: {},
    }, null, 2) + '\n')
    if (mode === 'file') writeFileSync(join(root, 'public'), '')
    const result = checkProjectStandards(context)
    assert.equal(result.status, 'FAIL')
    assert.equal(result.results[0].id, 'traditional-web:structure')
    assert.equal(result.results[0].status, 'FAIL')
    assert.equal(result.results[1].id, 'traditional-web:public-exposure')
    assert.equal(result.results[1].status, 'PASS')
  }
})

test('Technology Boundary pertence somente ao v4 e preserva v1, v2 e v3 congelados', (t) => {
  for (const profile of ['traditional-web-v1', 'traditional-web-v2', 'traditional-web-v3', 'traditional-web-v4']) {
    const root = mkdtempSync(join(tmpdir(), `jzl-boundary-pinning-${profile}-`))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const context = createProjectContext(root)
    mkdirSync(join(root, '.jzl'))
    writeFileSync(join(root, '.jzl', 'config.json'), JSON.stringify({
      schemaVersion: 1, template: 'traditional-web', standardsProfile: profile, tools: {},
    }, null, 2) + '\n')
    ensureTraditionalWebProjectStructure(context)
    writeFileSync(join(root, 'src', 'tool.py'), 'DO_NOT_LEAK')

    const result = checkProjectStandards(context)
    const boundary = result.results.find(({ id }) => id === 'traditional-web:technology-boundary')
    if (profile === 'traditional-web-v4') {
      assert.equal(result.status, 'FAIL')
      assert.deepEqual(boundary.evidence.issues, [{
        path: 'src/tool.py', reason: 'technology-not-authorized',
      }])
    } else {
      assert.equal(result.status, 'PASS')
      assert.equal(boundary, undefined)
    }
  }
})
