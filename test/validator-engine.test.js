import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { runProjectValidators } from '../src/validator-engine.js'

function createTemporaryContext(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-validator-engine-'))

  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))

  return {
    context: createProjectContext(projectRoot),
    projectRoot,
  }
}

function createValidator(id, script, overrides = {}) {
  return {
    id,
    type: 'command',
    executable: process.execPath,
    args: ['-e', script],
    ...overrides,
  }
}

test('classifica PASS e normaliza evidence completa', (t) => {
  const { context } = createTemporaryContext(t)
  const validator = createValidator(
    'pass',
    'process.stdout.write("PASS_OUT"); process.stderr.write("PASS_ERR")',
  )
  const snapshot = structuredClone(validator)

  const validation = runProjectValidators(context, [validator])

  assert.deepEqual(validation, {
    status: 'PASS',
    results: [{
      id: 'pass',
      status: 'PASS',
      evidence: {
        exitCode: 0,
        signal: null,
        stdout: 'PASS_OUT',
        stderr: 'PASS_ERR',
        errorMessage: null,
      },
    }],
  })
  assert.deepEqual(validator, snapshot)
})

test('classifica exit code não zero como FAIL', (t) => {
  const { context } = createTemporaryContext(t)
  const validation = runProjectValidators(context, [
    createValidator('fail', 'process.exit(7)'),
  ])

  assert.equal(validation.status, 'FAIL')
  assert.equal(validation.results[0].status, 'FAIL')
  assert.equal(validation.results[0].evidence.exitCode, 7)
  assert.equal(validation.results[0].evidence.errorMessage, null)
})

test('classifica executable inexistente como ERROR sem lançar', (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const validation = runProjectValidators(context, [{
    id: 'error',
    type: 'command',
    executable: join(projectRoot, 'missing-validator.exe'),
    args: [],
  }])
  const result = validation.results[0]

  assert.equal(validation.status, 'ERROR')
  assert.equal(result.status, 'ERROR')
  assert.equal(result.evidence.exitCode, null)
  assert.equal(result.evidence.signal, null)
  assert.equal(result.evidence.stdout, '')
  assert.equal(result.evidence.stderr, '')
  assert.equal(typeof result.evidence.errorMessage, 'string')
  assert.ok(result.evidence.errorMessage.length > 0)
})

test('executa todos em ordem e agrega PASS, FAIL e ERROR por precedência', (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const missingExecutable = join(projectRoot, 'missing.exe')
  const cases = [
    {
      validators: [
        createValidator('pass-1', ''),
        createValidator('pass-2', ''),
      ],
      expected: 'PASS',
    },
    {
      validators: [
        createValidator('pass-1', ''),
        createValidator('fail', 'process.exit(2)'),
        createValidator('pass-2', ''),
      ],
      expected: 'FAIL',
    },
    {
      validators: [
        createValidator('fail', 'process.exit(2)'),
        {
          id: 'error',
          type: 'command',
          executable: missingExecutable,
          args: [],
        },
        createValidator('pass', ''),
      ],
      expected: 'ERROR',
    },
  ]

  for (const { validators, expected } of cases) {
    const validation = runProjectValidators(context, validators)

    assert.equal(validation.status, expected)
    assert.deepEqual(
      validation.results.map((result) => result.id),
      validators.map((validator) => validator.id),
    )
    assert.equal(validation.results.length, validators.length)
  }
})

test('executa command diretamente com cwd igual ao projectRoot', (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const validation = runProjectValidators(context, [
    createValidator('cwd', 'process.stdout.write(process.cwd())'),
  ])

  assert.equal(validation.status, 'PASS')
  assert.equal(
    normalize(validation.results[0].evidence.stdout),
    normalize(projectRoot),
  )
})

test('rejeita container e coleção vazia de validators', (t) => {
  const { context } = createTemporaryContext(t)

  assert.throws(
    () => runProjectValidators(context, {}),
    { message: 'validators deve ser um array' },
  )
  assert.throws(
    () => runProjectValidators(context, []),
    { message: 'ao menos um validator é obrigatório' },
  )
})

test('valida todos os campos da definition command', (t) => {
  const { context } = createTemporaryContext(t)
  const base = createValidator('valid', '')
  const cases = [
    [null, 'validator deve ser um objeto'],
    [{ ...base, id: undefined }, 'id do validator é obrigatório'],
    [{ ...base, id: 1 }, 'id do validator deve ser uma string'],
    [{ ...base, id: '   ' }, 'id do validator não pode ser vazio'],
    [{ ...base, type: undefined }, 'type do validator é obrigatório'],
    [{ ...base, type: 1 }, 'type do validator deve ser uma string'],
    [{ ...base, type: 'script' }, 'type do validator não é suportado'],
    [{ ...base, executable: undefined }, 'executable do validator é obrigatório'],
    [{ ...base, executable: 1 }, 'executable do validator deve ser uma string'],
    [{ ...base, executable: '   ' }, 'executable do validator não pode ser vazio'],
    [{ ...base, executable: 'node' }, 'executable do validator deve ser um caminho absoluto'],
    [{ ...base, args: undefined }, 'args do validator é obrigatório'],
    [{ ...base, args: '-e' }, 'args do validator deve ser um array'],
    [{ ...base, args: [1] }, 'args do validator deve conter somente strings'],
  ]

  for (const [validator, message] of cases) {
    assert.throws(
      () => runProjectValidators(context, [validator]),
      { message },
    )
  }

  assert.throws(
    () => runProjectValidators(context, [base, { ...base }]),
    { message: 'ids dos validators não podem ser duplicados' },
  )
})

test('valida toda configuração antes de iniciar qualquer processo', (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  const sentinelPath = join(projectRoot, 'sentinel.txt')
  const script = (
    `import { writeFileSync } from 'node:fs'; `
    + `writeFileSync(${JSON.stringify(sentinelPath)}, 'executed')`
  )
  const first = createValidator('first', script, {
    args: ['--input-type=module', '-e', script],
  })
  const invalid = createValidator('invalid', '', { executable: 'node' })

  assert.throws(
    () => runProjectValidators(context, [first, invalid]),
    { message: 'executable do validator deve ser um caminho absoluto' },
  )
  assert.equal(existsSync(sentinelPath), false)
})

test('executa criteria e command no mesmo engine preservando ordem', (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  writeFileSync(join(projectRoot, 'index.html'), 'AFTER')
  const validators = [
    { id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' },
    createValidator('command-pass', ''),
  ]
  const validation = runProjectValidators(context, validators)
  assert.equal(validation.status, 'PASS')
  assert.deepEqual(validation.results.map(({ id }) => id), ['criterion-0001', 'command-pass'])
})

test('agrega criteria com ERROR acima de FAIL e executa todos', (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  writeFileSync(join(projectRoot, 'index.html'), 'BEFORE')
  writeFileSync(join(projectRoot, 'invalid.bin'), Buffer.from([0xff]))
  const validation = runProjectValidators(context, [
    { id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' },
    { id: 'criterion-0002', type: 'file-contains', path: 'invalid.bin', text: 'x' },
    createValidator('command-pass', ''),
  ])
  assert.equal(validation.status, 'ERROR')
  assert.deepEqual(validation.results.map(({ status }) => status), ['FAIL', 'ERROR', 'PASS'])
})

test('agrega FAIL entre criterion e command nos dois sentidos', (t) => {
  const first = createTemporaryContext(t)
  writeFileSync(join(first.projectRoot, 'index.html'), 'BEFORE')
  const criterionFail = runProjectValidators(first.context, [
    { id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' },
    createValidator('command-pass', ''),
  ])
  assert.equal(criterionFail.status, 'FAIL')
  assert.deepEqual(criterionFail.results.map(({ status }) => status), ['FAIL', 'PASS'])

  const second = createTemporaryContext(t)
  writeFileSync(join(second.projectRoot, 'index.html'), 'AFTER')
  const commandFail = runProjectValidators(second.context, [
    { id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER' },
    createValidator('command-fail', 'process.exit(1)'),
  ])
  assert.equal(commandFail.status, 'FAIL')
  assert.deepEqual(commandFail.results.map(({ status }) => status), ['PASS', 'FAIL'])
})

test('rejeita IDs duplicados entre criterion e command', (t) => {
  const { context } = createTemporaryContext(t)
  assert.throws(() => runProjectValidators(context, [
    { id: 'criterion-0001', type: 'file-not-exists', path: 'missing.txt' },
    createValidator('criterion-0001', ''),
  ]), { message: 'ids dos validators não podem ser duplicados' })
})

test('executa standard ASCII no mesmo engine e preserva ordem', (t) => {
  const { context, projectRoot } = createTemporaryContext(t)
  writeFileSync(join(projectRoot, 'ação.js'), '')
  const validation = runProjectValidators(context, [
    { id: 'traditional-web:ascii-paths', type: 'traditional-web-ascii-paths' },
    createValidator('command-pass', ''),
  ])

  assert.equal(validation.status, 'FAIL')
  assert.deepEqual(validation.results.map(({ id }) => id), [
    'traditional-web:ascii-paths',
    'command-pass',
  ])
})
