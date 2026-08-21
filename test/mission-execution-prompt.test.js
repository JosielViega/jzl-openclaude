import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMissionExecutionPrompt } from '../src/mission-execution-prompt.js'

function createRunningMission(overrides = {}) {
  return {
    id: 'mission-0001',
    title: 'Alterar arquivo de teste',
    objective: 'Trocar o conteúdo necessário',
    status: 'running',
    dependencies: [],
    ...overrides,
  }
}

test('constrói prompt mínimo e determinístico da Mission running', () => {
  const mission = createRunningMission()
  const snapshot = structuredClone(mission)
  const prompt = buildMissionExecutionPrompt(mission)

  assert.ok(prompt.includes(mission.id))
  assert.ok(prompt.includes(mission.title))
  assert.ok(prompt.includes(mission.objective))
  assert.ok(prompt.includes('.jzl, .git, .openclaude ou AGENTS.md'))
  assert.match(prompt, /Não tente executar shell, Git, npm, PHP, Composer/)
  assert.equal(prompt.includes('mission-9999'), false)
  assert.deepEqual(mission, snapshot)
})

test('rejeita Mission que não esteja running', () => {
  for (const status of [
    'pending',
    'validation',
    'completed',
    'failed',
    'correction',
  ]) {
    assert.throws(
      () => buildMissionExecutionPrompt(createRunningMission({ status })),
      { message: 'Mission deve estar running para construir prompt de execução' },
    )
  }
})
