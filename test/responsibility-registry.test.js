import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { validateProjectModelRoute } from '../src/model-router.js'
import { resolveOpenClaudeExecutionGuardrails } from '../src/openclaude-execution-guardrails.js'
import { createOpenClaudeToolPolicy } from '../src/openclaude-tool-policy.js'
import {
  isRegisteredResponsibility,
  listRegisteredResponsibilities,
  resolveResponsibilityDefinition,
} from '../src/responsibility-registry.js'

const expectedDefinitions = {
  'mission-execution': {
    responsibility: 'mission-execution',
    sessionMode: 'fresh',
    toolAccess: 'read-write',
    queryTimeoutMs: 600000,
    watchdogGraceMs: 5000,
    requiresModelRoute: true,
  },
  'mission-review': {
    responsibility: 'mission-review',
    sessionMode: 'fresh',
    toolAccess: 'read-only',
    queryTimeoutMs: 300000,
    watchdogGraceMs: 5000,
    requiresModelRoute: true,
  },
}

test('registra somente execution e review', () => {
  assert.equal(isRegisteredResponsibility('mission-execution'), true)
  assert.equal(isRegisteredResponsibility('mission-review'), true)

  for (const value of [undefined, null, 1, [], {}, 'other']) {
    assert.equal(isRegisteredResponsibility(value), false)
  }
})

test('resolve os dois contratos com shapes exatos', () => {
  for (const responsibility of listRegisteredResponsibilities()) {
    assert.deepEqual(
      resolveResponsibilityDefinition(responsibility),
      expectedDefinitions[responsibility],
    )
  }
})

test('rejeita resolução de responsibility não registrada', () => {
  assert.throws(() => resolveResponsibilityDefinition('other'), {
    message: 'responsabilidade JZL não é suportada',
  })
})

test('definitions retornadas são detached do Registry', () => {
  const definition = resolveResponsibilityDefinition('mission-execution')
  definition.sessionMode = 'resume'
  definition.queryTimeoutMs = 1

  assert.deepEqual(
    resolveResponsibilityDefinition('mission-execution'),
    expectedDefinitions['mission-execution'],
  )
})

test('lista é determinística e detached', () => {
  const responsibilities = listRegisteredResponsibilities()
  assert.deepEqual(responsibilities, ['mission-execution', 'mission-review'])
  responsibilities.reverse()
  responsibilities.push('other')
  assert.deepEqual(
    listRegisteredResponsibilities(),
    ['mission-execution', 'mission-review'],
  )
})

test('Registry permanece consistente com Guardrails, Model Router e Tool Policy', async (t) => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-responsibility-registry-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))

  for (const responsibility of listRegisteredResponsibilities()) {
    const definition = resolveResponsibilityDefinition(responsibility)
    const guardrails = resolveOpenClaudeExecutionGuardrails(responsibility)
    const route = { responsibility, model: 'model-a' }
    const canUseTool = createOpenClaudeToolPolicy(projectRoot, responsibility)
    const writeResult = await canUseTool('Write', {
      file_path: join(projectRoot, `${responsibility}.txt`),
      content: 'teste',
    })

    assert.strictEqual(validateProjectModelRoute(route), route)
    assert.equal(definition.requiresModelRoute, true)
    assert.equal(guardrails.queryTimeoutMs, definition.queryTimeoutMs)
    assert.equal(guardrails.watchdogGraceMs, definition.watchdogGraceMs)
    assert.equal(
      writeResult.behavior,
      definition.toolAccess === 'read-write' ? 'allow' : 'deny',
    )
  }
})
