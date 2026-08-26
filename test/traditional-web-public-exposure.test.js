import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import {
  evaluateTraditionalWebPublicExposure,
  validateTraditionalWebPublicExposureIssue,
} from '../src/traditional-web-public-exposure.js'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-public-exposure-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

function createEntry(root, projectPath, directory = false) {
  const target = join(root, ...projectPath.split('/'))
  if (directory) mkdirSync(target, { recursive: true })
  else {
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, 'DO_NOT_LEAK_PUBLIC_EXPOSURE_CONTENT')
  }
}

test('valida issue Unicode pela mesma referência com campos aditivos', () => {
  const issue = {
    path: 'public/área/.env',
    reason: 'environment-path-publicly-exposed',
    extra: true,
  }
  assert.strictEqual(validateTraditionalWebPublicExposureIssue(issue), issue)
})

test('rejeita issue, path e reason inválidos', () => {
  for (const issue of [null, [], 'issue']) {
    assert.throws(() => validateTraditionalWebPublicExposureIssue(issue), /deve ser um objeto/)
  }
  for (const path of [
    '', '/public/.env', 'C:/public/.env', 'public\\.env', 'public/',
    'public//.env', 'public/./.env', 'public/../.env', 'public/.env\n',
    'a'.repeat(501),
  ]) assert.throws(() => validateTraditionalWebPublicExposureIssue({
    path, reason: 'environment-path-publicly-exposed',
  }), /path do issue de public exposure traditional-web é inválido/)
  assert.throws(() => validateTraditionalWebPublicExposureIssue({
    path: 'public/.env', reason: 'secret-found',
  }), /reason do issue de public exposure traditional-web não é suportado/)
})

test('public ausente, arquivo ou link não gera issue de exposure', (t) => {
  const missing = fixture(t)
  assert.deepEqual(evaluateTraditionalWebPublicExposure(missing.context), [])

  const file = fixture(t)
  writeFileSync(join(file.root, 'public'), '')
  assert.deepEqual(evaluateTraditionalWebPublicExposure(file.context), [])

  const linked = fixture(t)
  const external = mkdtempSync(join(tmpdir(), 'jzl-public-root-external-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  createEntry(external, '.env')
  try {
    symlinkSync(external, join(linked.root, 'public'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    t.diagnostic(`link indisponível: ${error.code}`)
    return
  }
  assert.deepEqual(evaluateTraditionalWebPublicExposure(linked.context), [])
})

test('permite assets, dotfiles genéricos, well-known e manifests nested', (t) => {
  const { root, context } = fixture(t)
  for (const path of [
    'public/manifest.json', 'public/robots.txt', 'public/.gitignore',
    'public/.environment', 'public/.envrc', 'public/env', 'public/my.env',
    'public/assets/data.json', 'public/assets/package.json',
    'public/examples/composer.json', 'public/.well-known/acme-challenge/token',
  ]) createEntry(root, path)
  createEntry(root, 'public/package.json/nested.txt')
  assert.deepEqual(evaluateTraditionalWebPublicExposure(context), [])
})

test('detecta control path quando a entry é arquivo regular', (t) => {
  const { root, context } = fixture(t)
  createEntry(root, 'public/config/.git')
  assert.deepEqual(evaluateTraditionalWebPublicExposure(context), [{
    path: 'public/config/.git',
    reason: 'control-path-publicly-exposed',
  }])
})

test('detecta control, dependencies, environment e manifests root-only ordenados', (t) => {
  const { root, context } = fixture(t)
  for (const path of [
    'public/.git', 'public/admin/.git', 'public/assets/.jzl',
    'public/foo/.openclaude', 'public/vendor', 'public/app/vendor',
    'public/node_modules', 'public/assets/node_modules', 'public/.env',
    'public/.env.local', 'public/.env.production', 'public/.env.example',
    'public/config/.env.testing.local', 'public/composer.json',
    'public/composer.lock', 'public/package.json', 'public/package-lock.json',
  ]) createEntry(root, path, !path.includes('.env') && !path.endsWith('.json') && !path.endsWith('.lock'))
  const issues = evaluateTraditionalWebPublicExposure(context)
  assert.equal(issues.length, 17)
  assert.deepEqual(issues, [...issues].sort((left, right) => (
    left.path.localeCompare(right.path) || left.reason.localeCompare(right.reason)
  )))
  assert.deepEqual(issues.find(({ path }) => path === 'public/.env'), {
    path: 'public/.env', reason: 'environment-path-publicly-exposed',
  })
  assert.deepEqual(issues.find(({ path }) => path === 'public/vendor'), {
    path: 'public/vendor', reason: 'dependency-path-publicly-exposed',
  })
  assert.deepEqual(issues.find(({ path }) => path === 'public/.git'), {
    path: 'public/.git', reason: 'control-path-publicly-exposed',
  })
  assert.deepEqual(issues.find(({ path }) => path === 'public/package.json'), {
    path: 'public/package.json', reason: 'dependency-manifest-publicly-exposed',
  })
  assert.equal(JSON.stringify(issues).includes('DO_NOT_LEAK'), false)
})

test('classificação especial respeita casing da plataforma', (t) => {
  const { root, context } = fixture(t)
  for (const path of ['public/VENDOR', 'public/.ENV', 'public/PACKAGE.JSON']) {
    createEntry(root, path)
  }
  const issues = evaluateTraditionalWebPublicExposure(context)
  assert.equal(issues.length, process.platform === 'win32' ? 3 : 0)
})

test('detecta link proibido e não segue links permitidos ou targets externos', (t) => {
  const { root, context } = fixture(t)
  mkdirSync(join(root, 'public', 'assets'), { recursive: true })
  const external = mkdtempSync(join(tmpdir(), 'jzl-public-external-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  createEntry(external, '.env')
  try {
    symlinkSync(join(external, '.env'), join(root, 'public', '.env'), 'file')
    symlinkSync(external, join(root, 'public', 'assets', 'current'), process.platform === 'win32' ? 'junction' : 'dir')
    symlinkSync(external, join(root, 'public', 'vendor'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    t.diagnostic(`link indisponível: ${error.code}`)
    return
  }
  assert.deepEqual(evaluateTraditionalWebPublicExposure(context), [
    { path: 'public/.env', reason: 'environment-path-publicly-exposed' },
    { path: 'public/vendor', reason: 'dependency-path-publicly-exposed' },
  ])
})

test('não muta context e sanitiza erro de filesystem', (t) => {
  const { root, context } = fixture(t)
  mkdirSync(join(root, 'public'))
  const before = structuredClone(context)
  assert.deepEqual(evaluateTraditionalWebPublicExposure(context), [])
  assert.deepEqual(context, before)
  rmSync(root, { recursive: true, force: true })
  assert.throws(() => evaluateTraditionalWebPublicExposure(context), (error) => {
    assert.equal(error.message.includes(root), false)
    return true
  })
})
