import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, normalize } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const cliPath = join(testDirectory, '..', 'src', 'cli.js')

let temporaryDirectory

before(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'jzl-cli-'))
})

after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

function runCli(argumentsList) {
  return spawnSync(process.execPath, [cliPath, ...argumentsList], {
    encoding: 'utf8',
  })
}

test('valida projectRoot absoluto', () => {
  const result = runCli(['check-root', '--project-root', temporaryDirectory])

  assert.equal(result.status, 0)
  assert.match(result.stdout, /projectRoot válido/)
  assert.ok(result.stdout.includes(normalize(temporaryDirectory)))
  assert.equal(result.stderr, '')
})

test('rejeita comando ausente', () => {
  const result = runCli([])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /comando é obrigatório/)
})

test('rejeita comando desconhecido', () => {
  const result = runCli(['desconhecido', '--project-root', temporaryDirectory])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /comando desconhecido/)
})

test('rejeita ausência de --project-root', () => {
  const result = runCli(['check-root'])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--project-root é obrigatório/)
})

test('rejeita --project-root sem valor', () => {
  const result = runCli(['check-root', '--project-root'])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /exige um valor/)
})

test('rejeita argumento diferente de --project-root', () => {
  const result = runCli(['check-root', '--outro', temporaryDirectory])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /argumento desconhecido/)
})

test('rejeita caminho relativo', () => {
  const result = runCli(['check-root', '--project-root', 'relative/path'])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /caminho absoluto/)
})

test('rejeita caminho absoluto inexistente', () => {
  const missingDirectory = join(temporaryDirectory, 'missing')
  const result = runCli(['check-root', '--project-root', missingDirectory])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /projectRoot não existe/)
})

test('rejeita argumento extra após projectRoot', () => {
  const result = runCli([
    'check-root',
    '--project-root',
    temporaryDirectory,
    '--extra',
  ])

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /argumento desconhecido/)
})
