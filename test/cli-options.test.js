import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseCliOptions } from '../src/cli-options.js'

const definitions = {
  '--root': { required: true },
  '--tag': { repeatable: true },
  '--dry-run': { boolean: true },
}

test('preserva valued, required e repeatable existentes sem mutar input', () => {
  const input = ['--root', 'project', '--tag', 'a', '--tag', 'b']
  const before = [...input]
  assert.deepEqual(parseCliOptions(input, definitions), {
    '--root': 'project', '--tag': ['a', 'b'],
  })
  assert.deepEqual(input, before)
})

test('valida required, missing value, duplicate valued e unknown', () => {
  assert.throws(() => parseCliOptions([], definitions), /--root é obrigatório/)
  assert.throws(() => parseCliOptions(['--root'], definitions), /--root exige um valor/)
  assert.throws(
    () => parseCliOptions(['--root', 'a', '--root', 'b'], definitions),
    /opção duplicada: --root/,
  )
  assert.throws(
    () => parseCliOptions(['--root', 'a', '--root'], definitions),
    /--root exige um valor/,
  )
  assert.throws(
    () => parseCliOptions(['--root', 'a', '--other', 'b'], definitions),
    /argumento desconhecido: --other/,
  )
})

test('boolean presente consome somente a flag e ausente permanece undefined', () => {
  assert.deepEqual(
    parseCliOptions(['--dry-run', '--root', 'project'], definitions),
    { '--dry-run': true, '--root': 'project', '--tag': [] },
  )
  const after = parseCliOptions(['--root', 'project', '--dry-run'], definitions)
  assert.equal(after['--dry-run'], true)
  const absent = parseCliOptions(['--root', 'project'], definitions)
  assert.equal(Object.hasOwn(absent, '--dry-run'), false)
})

test('rejeita boolean duplicado e valor textual após boolean', () => {
  assert.throws(
    () => parseCliOptions(['--root', 'project', '--dry-run', '--dry-run'], definitions),
    /opção duplicada: --dry-run/,
  )
  assert.throws(
    () => parseCliOptions(['--root', 'project', '--dry-run', 'true'], definitions),
    /argumento desconhecido: true/,
  )
})
