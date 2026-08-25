import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createMissionChangeScope,
  isMissionChangeScopePathAllowed,
  validateMissionChangeScope,
} from '../src/mission-change-scope.js'

test('valida scope vazio, múltiplos paths, ordem e mesma referência', () => {
  const scope = { allowedPaths: ['index.html', 'css/app.css'], extra: true }
  assert.strictEqual(validateMissionChangeScope(scope), scope)
  assert.deepEqual(scope.allowedPaths, ['index.html', 'css/app.css'])
  assert.strictEqual(validateMissionChangeScope({ allowedPaths: [] }).allowedPaths.length, 0)
})

test('creator distingue ausência, canonicaliza e clona sem mutar', () => {
  const input = { allowedPaths: ['index.html'], extra: true }
  assert.equal(createMissionChangeScope(undefined), undefined)
  const created = createMissionChangeScope(input)
  assert.deepEqual(created, { allowedPaths: ['index.html'] })
  assert.notStrictEqual(created.allowedPaths, input.allowedPaths)
  assert.deepEqual(input, { allowedPaths: ['index.html'], extra: true })
})

test('aceita 50 paths e rejeita 51', () => {
  validateMissionChangeScope({ allowedPaths: Array.from({ length: 50 }, (_, i) => `file-${i}`) })
  assert.throws(
    () => validateMissionChangeScope({ allowedPaths: Array.from({ length: 51 }, (_, i) => `file-${i}`) }),
    { message: 'Change Scope pode possuir no máximo 50 allowedPaths' },
  )
})

test('rejeita container e allowedPaths ausente ou não array', () => {
  for (const value of [null, [], 'scope']) {
    assert.throws(() => validateMissionChangeScope(value), {
      message: 'Change Scope da Mission deve ser um objeto',
    })
  }
  for (const value of [{}, { allowedPaths: 'index.html' }]) {
    assert.throws(() => validateMissionChangeScope(value), {
      message: 'allowedPaths do Change Scope deve ser um array',
    })
  }
})

test('aplica limites de tamanho de path', () => {
  validateMissionChangeScope({ allowedPaths: ['a'.repeat(500)] })
  assert.throws(() => validateMissionChangeScope({ allowedPaths: ['a'.repeat(501)] }), {
    message: 'allowedPath do Change Scope excede o limite permitido',
  })
})

for (const projectPath of [
  '', '/etc/passwd', 'C:/temp/a', '\\\\server\\share', 'src\\app.js',
  '.', '..', './a', 'src/../a', 'src//a', 'src/a/', 'a\r', 'a\n', 'a\0',
]) {
  test(`rejeita allowedPath não normalizado: ${JSON.stringify(projectPath)}`, () => {
    assert.throws(() => validateMissionChangeScope({ allowedPaths: [projectPath] }), {
      message: 'allowedPath do Change Scope deve ser relativo e normalizado',
    })
  })
}

for (const character of ['*', '?', '[', ']']) {
  test(`rejeita metacaractere de glob ${character}`, () => {
    assert.throws(() => validateMissionChangeScope({ allowedPaths: [`src/${character}.js`] }), {
      message: 'allowedPath do Change Scope não pode conter glob',
    })
  })
}

for (const projectPath of ['.jzl', '.jzl/state.json', '.git/HEAD', '.openclaude/x', 'AGENTS.md']) {
  test(`rejeita path protegido ${projectPath}`, () => {
    assert.throws(() => validateMissionChangeScope({ allowedPaths: [projectPath] }), {
      message: 'allowedPath do Change Scope é protegido',
    })
  })
}

test('rejeita duplicados conforme casing da plataforma', () => {
  assert.throws(() => validateMissionChangeScope({ allowedPaths: ['a', 'a'] }), {
    message: 'allowedPaths do Change Scope não podem ser duplicados',
  })
  const differingCase = { allowedPaths: ['Index.html', 'index.html'] }
  if (process.platform === 'win32') {
    assert.throws(() => validateMissionChangeScope(differingCase), /duplicados/)
  } else {
    validateMissionChangeScope(differingCase)
  }
})

test('matching é exato, sem prefixo ou glob implícito', () => {
  const scope = { allowedPaths: ['src/app.js'] }
  assert.equal(isMissionChangeScopePathAllowed(scope, 'src/app.js'), true)
  assert.equal(isMissionChangeScopePathAllowed(scope, 'src/app.js.backup'), false)
  assert.equal(isMissionChangeScopePathAllowed(scope, 'src/app.js/child'), false)
})
