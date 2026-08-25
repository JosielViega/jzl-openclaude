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

import { runMissionAcceptanceCriterion } from '../src/acceptance-criterion-validator.js'
import { createProjectContext } from '../src/project-context.js'

function project(t) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-criterion-validator-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, context: createProjectContext(root) }
}

function criterion(type, path = 'index.html', text) {
  return {
    id: 'criterion-0001', type, path,
    ...(text === undefined ? {} : { text }),
  }
}

function assertResult(value, status, satisfied) {
  assert.equal(value.status, status)
  assert.deepEqual(value.evidence, {
    exitCode: null, signal: null, stdout: '', stderr: '',
    errorMessage: status === 'ERROR' ? value.evidence.errorMessage : null,
    criterionType: value.evidence.criterionType,
    path: value.evidence.path,
    satisfied,
  })
}

test('avalia file-exists para arquivo, missing e diretório', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'index.html'), 'ok')
  mkdirSync(join(root, 'dir'))
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-exists')), 'PASS', true)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-exists', 'missing')), 'FAIL', false)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-exists', 'dir')), 'FAIL', false)
})

test('avalia file-not-exists exigindo ausência real', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'index.html'), 'ok')
  mkdirSync(join(root, 'dir'))
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-exists', 'missing')), 'PASS', true)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-exists')), 'FAIL', false)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-exists', 'dir')), 'FAIL', false)
})

test('avalia contains literalmente e com case sensitivity', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'index.html'), 'Alpha BEFORE')
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-contains', 'index.html', 'BEFORE')), 'PASS', true)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-contains', 'index.html', 'before')), 'FAIL', false)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-contains', 'missing', 'x')), 'FAIL', false)
  mkdirSync(join(root, 'dir'))
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-contains', 'dir', 'x')), 'FAIL', false)
})

test('file-not-contains exige arquivo e texto ausente', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'index.html'), 'Alpha BEFORE')
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-contains', 'index.html', 'AFTER')), 'PASS', true)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-contains', 'index.html', 'BEFORE')), 'FAIL', false)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-contains', 'missing', 'x')), 'FAIL', false)
  mkdirSync(join(root, 'dir'))
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-contains', 'dir', 'x')), 'FAIL', false)
})

test('UTF-8 inválido produz ERROR sem conteúdo em evidence', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'index.html'), Buffer.from([0xff, 0xfe]))
  const value = runMissionAcceptanceCriterion(context, criterion('file-contains', 'index.html', 'segredo'))
  assertResult(value, 'ERROR', null)
  assert.equal(value.evidence.errorMessage, 'arquivo do acceptance criterion não é UTF-8 válido')
  assert.equal(JSON.stringify(value).includes('segredo'), false)
  assert.equal(value.evidence.path, 'index.html')
})

test('input permanece intacto e evidence não contém texto nem arquivo', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'index.html'), 'conteúdo secreto')
  const input = criterion('file-contains', 'index.html', 'conteúdo secreto')
  const snapshot = structuredClone(input)
  const value = runMissionAcceptanceCriterion(context, input)
  assert.deepEqual(input, snapshot)
  assert.equal(Object.hasOwn(value.evidence, 'text'), false)
  assert.equal(JSON.stringify(value).includes('conteúdo secreto'), false)
})

test('alias interno normal é permitido e aliases protegidos falham fechado', (t) => {
  const { root, context } = project(t)
  writeFileSync(join(root, 'target.txt'), 'ok')
  mkdirSync(join(root, '.jzl'))
  writeFileSync(join(root, '.jzl', 'state.json'), '{}')
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, '.git', 'config'), 'git')
  mkdirSync(join(root, '.openclaude'))
  writeFileSync(join(root, '.openclaude', 'settings.json'), '{}')
  writeFileSync(join(root, 'AGENTS.md'), 'regras')
  try {
    symlinkSync(join(root, 'target.txt'), join(root, 'alias.txt'), 'file')
    symlinkSync(join(root, '.jzl', 'state.json'), join(root, 'state-alias.json'), 'file')
    symlinkSync(join(root, '.git', 'config'), join(root, 'git-alias.txt'), 'file')
    symlinkSync(join(root, '.openclaude', 'settings.json'), join(root, 'openclaude-alias.json'), 'file')
    symlinkSync(join(root, 'AGENTS.md'), join(root, 'agents-alias.md'), 'file')
    symlinkSync(
      join(root, '.jzl'),
      join(root, 'jzl-directory-alias'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  } catch (error) {
    if (error?.code === 'EPERM') return t.skip('symlink indisponível')
    throw error
  }
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-contains', 'alias.txt', 'ok')), 'PASS', true)
  for (const path of [
    'state-alias.json',
    'git-alias.txt',
    'openclaude-alias.json',
    'agents-alias.md',
    'jzl-directory-alias/state.json',
  ]) {
    assertResult(runMissionAcceptanceCriterion(context, criterion('file-exists', path)), 'ERROR', null)
  }
})

test('alias de diretório protegido com target ausente produz ERROR sem vazamento', (t) => {
  const { root, context } = project(t)
  const protectedDirectories = ['.jzl', '.git', '.openclaude']

  for (const directory of protectedDirectories) {
    mkdirSync(join(root, directory))

    try {
      symlinkSync(
        join(root, directory),
        join(root, `${directory.slice(1)}-protected-alias`),
        process.platform === 'win32' ? 'junction' : 'dir',
      )
    } catch (error) {
      if (error?.code === 'EPERM') return t.skip('alias de diretório indisponível')
      throw error
    }
  }

  for (const type of [
    'file-exists',
    'file-not-exists',
    'file-contains',
    'file-not-contains',
  ]) {
    const input = criterion(
      type,
      'jzl-protected-alias/missing.json',
      type.includes('contains') ? 'texto secreto' : undefined,
    )
    const value = runMissionAcceptanceCriterion(context, input)
    const serialized = JSON.stringify(value)

    assertResult(value, 'ERROR', null)
    assert.equal(value.evidence.path, input.path)
    assert.ok(value.evidence.errorMessage.length > 0)
    assert.equal(serialized.includes(root), false)
    assert.equal(serialized.includes(join(root, '.jzl', 'missing.json')), false)
    assert.equal(serialized.includes('texto secreto'), false)
  }

  for (const alias of ['git-protected-alias', 'openclaude-protected-alias']) {
    assertResult(
      runMissionAcceptanceCriterion(
        context,
        criterion('file-not-exists', `${alias}/missing.json`),
      ),
      'ERROR',
      null,
    )
  }
})

test('symlink externo e quebrado produzem ERROR', (t) => {
  const { root, context } = project(t)
  const external = mkdtempSync(join(tmpdir(), 'jzl-criterion-external-'))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  writeFileSync(join(external, 'outside.txt'), 'outside')
  try {
    symlinkSync(join(external, 'outside.txt'), join(root, 'external.txt'), 'file')
    symlinkSync(join(root, 'missing-target.txt'), join(root, 'broken.txt'), 'file')
  } catch (error) {
    if (error?.code === 'EPERM') return t.skip('symlink indisponível')
    throw error
  }
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-exists', 'external.txt')), 'ERROR', null)
  assertResult(runMissionAcceptanceCriterion(context, criterion('file-not-exists', 'broken.txt')), 'ERROR', null)
})
