import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isStandardsProfileSupported,
  isStandardsProfileUpgradeSupported,
  resolveConfiguredStandardsProfile,
  resolveInitialStandardsProfile,
  resolveLegacyStandardsProfile,
} from '../src/standards-profile.js'

test('registra explicitamente somente upgrades sequenciais traditional-web', () => {
  assert.equal(isStandardsProfileUpgradeSupported(
    'traditional-web', 'traditional-web-v1', 'traditional-web-v2'
  ), true)
  assert.equal(isStandardsProfileUpgradeSupported(
    'traditional-web', 'traditional-web-v2', 'traditional-web-v3'
  ), true)
  assert.equal(isStandardsProfileUpgradeSupported(
    'traditional-web', 'traditional-web-v3', 'traditional-web-v4'
  ), true)
  for (const [template, from, to] of [
    ['traditional-web', 'traditional-web-v1', 'traditional-web-v4'],
    ['traditional-web', 'traditional-web-v2', 'traditional-web-v4'],
    ['traditional-web', 'traditional-web-v4', 'traditional-web-v3'],
    ['traditional-web', 'traditional-web-v4', 'traditional-web-v4'],
    ['traditional-web', 'traditional-web-v2', 'traditional-web-v1'],
    ['traditional-web', 'traditional-web-v1', 'traditional-web-v1'],
    ['traditional-web', 'traditional-web-v2', 'traditional-web-v2'],
    ['traditional-web', 'traditional-web-v1', 'traditional-web-v3'],
    ['traditional-web', 'traditional-web-v3', 'traditional-web-v2'],
    ['traditional-web', 'traditional-web-v3', 'traditional-web-v3'],
    ['other', 'traditional-web-v1', 'traditional-web-v2'],
  ]) assert.equal(isStandardsProfileUpgradeSupported(template, from, to), false)
})

test('suporta somente os profiles traditional-web versionados conhecidos', () => {
  assert.equal(isStandardsProfileSupported('traditional-web', 'traditional-web-v1'), true)
  assert.equal(isStandardsProfileSupported('traditional-web', 'traditional-web-v2'), true)
  assert.equal(isStandardsProfileSupported('traditional-web', 'traditional-web-v3'), true)
  assert.equal(isStandardsProfileSupported('traditional-web', 'traditional-web-v4'), true)
  assert.equal(isStandardsProfileSupported('traditional-web', 'traditional-web-unknown'), false)
  assert.equal(isStandardsProfileSupported('traditional-web', 'traditional-web-v10'), false)
  assert.equal(isStandardsProfileSupported('other', 'traditional-web-v1'), false)
})

test('resolve o profile inicial de novos projetos', () => {
  assert.equal(resolveInitialStandardsProfile('traditional-web'), 'traditional-web-v4')
  assert.throws(() => resolveInitialStandardsProfile('other'), {
    message: 'template não possui standardsProfile inicial registrado',
  })
})

test('resolve separadamente o legacy pin permanente', () => {
  assert.equal(resolveLegacyStandardsProfile('traditional-web'), 'traditional-web-v1')
  assert.throws(() => resolveLegacyStandardsProfile('other'), {
    message: 'template não possui standardsProfile legacy registrado',
  })
  assert.notStrictEqual(resolveInitialStandardsProfile, resolveLegacyStandardsProfile)
})

test('resolve config explícita e config legacy sem mutar', () => {
  const explicit = {
    schemaVersion: 1, template: 'traditional-web',
    standardsProfile: 'traditional-web-v1', tools: {},
  }
  const legacy = { schemaVersion: 1, template: 'traditional-web', tools: {} }
  const explicitSnapshot = structuredClone(explicit)
  const legacySnapshot = structuredClone(legacy)

  assert.equal(resolveConfiguredStandardsProfile(explicit), 'traditional-web-v1')
  assert.equal(resolveConfiguredStandardsProfile(legacy), 'traditional-web-v1')
  assert.deepEqual(explicit, explicitSnapshot)
  assert.deepEqual(legacy, legacySnapshot)
  assert.equal(Object.hasOwn(legacy, 'standardsProfile'), false)
})

test('falha fechado para profile explícito não suportado', () => {
  assert.throws(() => resolveConfiguredStandardsProfile({
    template: 'traditional-web', standardsProfile: 'traditional-web-unknown',
  }), {
    message: 'standardsProfile configurado não é suportado para o template',
  })
})
