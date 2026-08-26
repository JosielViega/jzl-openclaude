import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createProjectContext } from '../src/project-context.js'
import { readProjectConfigStore } from '../src/project-config-store.js'
import { checkProjectStandards } from '../src/project-standards-check.js'
import { upgradeProjectStandards } from '../src/standards-profile-upgrade.js'
import { ensureTraditionalWebProjectStructure } from '../src/traditional-web-structure.js'

function createProject(t, { profile = 'traditional-web-v1', legacy = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jzl-profile-upgrade-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const context = createProjectContext(root)
  mkdirSync(join(root, '.jzl'))
  const config = {
    schemaVersion: 1,
    template: 'traditional-web',
    ...(legacy ? {} : { standardsProfile: profile }),
    tools: {},
  }
  writeFileSync(join(root, '.jzl', 'config.json'), `${JSON.stringify(config, null, 2)}\n`)
  ensureTraditionalWebProjectStructure(context)
  return { root, context, configPath: join(root, '.jzl', 'config.json') }
}

test('valida input sem mutar e rejeita shapes inválidos', (t) => {
  const { context } = createProject(t)
  for (const [input, message] of [
    [null, 'upgrade de standards deve ser um objeto'],
    [[], 'upgrade de standards deve ser um objeto'],
    [{}, 'to do upgrade de standards é obrigatório'],
    [{ to: null }, 'to do upgrade de standards deve ser uma string não vazia'],
    [{ to: '' }, 'to do upgrade de standards deve ser uma string não vazia'],
    [{ to: '   ' }, 'to do upgrade de standards deve ser uma string não vazia'],
    [{ to: 'traditional-web-v2', dryRun: 'true' }, 'dryRun do upgrade de standards deve ser boolean'],
  ]) assert.throws(() => upgradeProjectStandards(context, input), { message })

  const input = { to: 'traditional-web-v2', dryRun: true, extra: true }
  const before = structuredClone(input)
  upgradeProjectStandards(context, input)
  assert.deepEqual(input, before)
})

test('pinned v1 só muda após PASS real do target v2', (t) => {
  const { root, context, configPath } = createProject(t)
  const cssPath = join(root, 'public', 'assets', 'css', 'app.css')
  writeFileSync(cssPath, Buffer.from([0xff]))
  const statePath = join(root, '.jzl', 'state.json')
  const eventsPath = join(root, '.jzl', 'events.json')
  writeFileSync(statePath, '{"state":"untouched"}\n')
  writeFileSync(eventsPath, '{"events":"untouched"}\n')
  const originalBytes = readFileSync(configPath)
  const storeBytes = [statePath, eventsPath].map((path) => readFileSync(path))

  const current = checkProjectStandards(context)
  assert.equal(current.standard, 'traditional-web-v1')
  assert.equal(current.status, 'PASS')
  assert.equal(current.results.some(({ id }) => id === 'traditional-web:source-text'), false)

  for (const dryRun of [true, false]) {
    const failed = upgradeProjectStandards(context, {
      to: 'traditional-web-v2', dryRun,
    })
    assert.deepEqual(Object.keys(failed), ['from', 'to', 'status', 'upgraded', 'results'])
    assert.equal(failed.from, 'traditional-web-v1')
    assert.equal(failed.to, 'traditional-web-v2')
    assert.equal(failed.status, 'FAIL')
    assert.equal(failed.upgraded, false)
    assert.deepEqual(
      failed.results.find(({ id }) => id === 'traditional-web:source-text').evidence.issues,
      [{ path: 'public/assets/css/app.css', reason: 'invalid-utf8' }],
    )
    assert.deepEqual(readFileSync(configPath), originalBytes)
    assert.deepEqual([statePath, eventsPath].map((path) => readFileSync(path)), storeBytes)
  }

  writeFileSync(cssPath, '/* ação */\r\n', 'utf8')
  const preview = upgradeProjectStandards(context, {
    to: 'traditional-web-v2', dryRun: true,
  })
  assert.equal(preview.status, 'PASS')
  assert.equal(preview.upgraded, false)
  assert.deepEqual(readFileSync(configPath), originalBytes)
  assert.deepEqual([statePath, eventsPath].map((path) => readFileSync(path)), storeBytes)

  preview.results[0].evidence.issues.push({ path: 'mutated', reason: 'invalid-utf8' })
  assert.equal(readProjectConfigStore(context).standardsProfile, 'traditional-web-v1')

  const upgraded = upgradeProjectStandards(context, { to: 'traditional-web-v2' })
  assert.equal(upgraded.status, 'PASS')
  assert.equal(upgraded.upgraded, true)
  assert.equal(readProjectConfigStore(context).standardsProfile, 'traditional-web-v2')
  assert.deepEqual([statePath, eventsPath].map((path) => readFileSync(path)), storeBytes)
  const after = checkProjectStandards(context)
  assert.equal(after.standard, 'traditional-web-v2')
  assert.equal(after.status, 'PASS')
  assert.equal(after.results.some(({ id }) => id === 'traditional-web:source-text'), true)
})

test('legacy dry-run preserva bytes e PASS real adiciona somente profile', (t) => {
  const { root, context, configPath } = createProject(t, { legacy: true })
  const original = {
    schemaVersion: 1,
    template: 'traditional-web',
    tools: {},
    models: { 'mission-execution': 'local-model' },
    metadata: { owner: 'JZL', tags: ['legacy'] },
  }
  writeFileSync(configPath, `${JSON.stringify(original, null, 2)}\n`)
  const statePath = join(root, '.jzl', 'state.json')
  const eventsPath = join(root, '.jzl', 'events.json')
  writeFileSync(statePath, '{"state":"untouched"}\n')
  writeFileSync(eventsPath, '{"events":"untouched"}\n')
  const before = [configPath, statePath, eventsPath].map((path) => readFileSync(path))

  const preview = upgradeProjectStandards(context, {
    to: 'traditional-web-v2', dryRun: true,
  })
  assert.equal(preview.status, 'PASS')
  assert.equal(preview.upgraded, false)
  assert.equal(Object.hasOwn(readProjectConfigStore(context), 'standardsProfile'), false)
  assert.deepEqual([configPath, statePath, eventsPath].map((path) => readFileSync(path)), before)

  const result = upgradeProjectStandards(context, { to: 'traditional-web-v2' })
  assert.equal(result.upgraded, true)
  assert.deepEqual(readProjectConfigStore(context), {
    ...original, standardsProfile: 'traditional-web-v2',
  })
  assert.deepEqual(readFileSync(statePath), before[1])
  assert.deepEqual(readFileSync(eventsPath), before[2])
})

test('upgrade funciona sem State ou Event Store e não os inicializa', (t) => {
  const { root, context } = createProject(t)
  const result = upgradeProjectStandards(context, { to: 'traditional-web-v2' })
  assert.equal(result.upgraded, true)
  assert.equal(existsSync(join(root, '.jzl', 'state.json')), false)
  assert.equal(existsSync(join(root, '.jzl', 'events.json')), false)
})

test('rejeita downgrade, same-profile, target desconhecido e espaço sem escrever', (t) => {
  for (const [profile, to] of [
    ['traditional-web-v2', 'traditional-web-v1'],
    ['traditional-web-v2', 'traditional-web-v2'],
    ['traditional-web-v1', 'traditional-web-v1'],
    ['traditional-web-v1', 'traditional-web-v3'],
    ['traditional-web-v1', ' traditional-web-v2'],
  ]) {
    const project = createProject(t, { profile })
    const before = readFileSync(project.configPath)
    assert.throws(
      () => upgradeProjectStandards(project.context, { to }),
      { message: 'transição de standardsProfile não é suportada' },
    )
    assert.deepEqual(readFileSync(project.configPath), before)
  }
})

test('falha de preparação PHP preserva Config byte a byte', (t) => {
  const { root, context, configPath } = createProject(t)
  writeFileSync(join(root, 'src', 'App.php'), '<?php', 'utf8')
  const before = readFileSync(configPath)
  assert.throws(
    () => upgradeProjectStandards(context, { to: 'traditional-web-v2' }),
    { message: 'executable PHP não configurado para traditional-web' },
  )
  assert.deepEqual(readFileSync(configPath), before)
})

test('aggregate ERROR do target retorna resultado e preserva Config', (t) => {
  const { root, context, configPath } = createProject(t)
  const config = readProjectConfigStore(context)
  config.tools.php = {
    executable: join(root, 'missing-php.exe'), argsPrefix: [],
  }
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  writeFileSync(join(root, 'src', 'App.php'), '<?php', 'utf8')
  const before = readFileSync(configPath)
  const result = upgradeProjectStandards(context, { to: 'traditional-web-v2' })
  assert.equal(result.status, 'ERROR')
  assert.equal(result.upgraded, false)
  assert.equal(result.results.at(-1).status, 'ERROR')
  assert.deepEqual(readFileSync(configPath), before)
})

test('v2 adota v3 somente após Public Exposure PASS e v1 não faz auto-chain', (t) => {
  const project = createProject(t, { profile: 'traditional-web-v2' })
  const envPath = join(project.root, 'public', '.env')
  writeFileSync(envPath, 'DO_NOT_LEAK')
  const before = readFileSync(project.configPath)
  assert.equal(checkProjectStandards(project.context).standard, 'traditional-web-v2')
  assert.equal(checkProjectStandards(project.context).status, 'PASS')

  for (const dryRun of [true, false]) {
    const result = upgradeProjectStandards(project.context, {
      to: 'traditional-web-v3', dryRun,
    })
    assert.equal(result.status, 'FAIL')
    assert.equal(result.upgraded, false)
    assert.deepEqual(
      result.results.find(({ id }) => id === 'traditional-web:public-exposure')
        .evidence.issues,
      [{ path: 'public/.env', reason: 'environment-path-publicly-exposed' }],
    )
    assert.deepEqual(readFileSync(project.configPath), before)
  }

  rmSync(envPath)
  const preview = upgradeProjectStandards(project.context, {
    to: 'traditional-web-v3', dryRun: true,
  })
  assert.equal(preview.status, 'PASS')
  assert.equal(preview.upgraded, false)
  assert.deepEqual(readFileSync(project.configPath), before)
  const upgraded = upgradeProjectStandards(project.context, { to: 'traditional-web-v3' })
  assert.equal(upgraded.status, 'PASS')
  assert.equal(upgraded.upgraded, true)
  assert.equal(readProjectConfigStore(project.context).standardsProfile, 'traditional-web-v3')
  const checked = checkProjectStandards(project.context)
  assert.equal(checked.standard, 'traditional-web-v3')
  assert.equal(checked.results.find(
    ({ id }) => id === 'traditional-web:public-exposure'
  ).status, 'PASS')

  const v1 = createProject(t, { profile: 'traditional-web-v1' })
  const v1Bytes = readFileSync(v1.configPath)
  assert.throws(
    () => upgradeProjectStandards(v1.context, { to: 'traditional-web-v3' }),
    { message: 'transição de standardsProfile não é suportada' },
  )
  assert.deepEqual(readFileSync(v1.configPath), v1Bytes)
})
