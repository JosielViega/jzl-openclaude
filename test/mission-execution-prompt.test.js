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

function createStandards(overrides = {}) {
  return {
    id: 'traditional-web-v1',
    instructions: ['Primeira instrução.', 'Segunda instrução.'],
    executable: process.execPath,
    argsPrefix: ['fake-php.js'],
    schemaVersion: 1,
    ...overrides,
  }
}

test('constrói prompt mínimo e determinístico da Mission running', () => {
  const mission = createRunningMission()
  const standards = createStandards()
  const missionSnapshot = structuredClone(mission)
  const standardsSnapshot = structuredClone(standards)
  const prompt = buildMissionExecutionPrompt(mission, standards)

  assert.ok(prompt.includes(mission.id))
  assert.ok(prompt.includes(mission.title))
  assert.ok(prompt.includes(mission.objective))
  assert.ok(prompt.includes('.jzl, .git, .openclaude ou AGENTS.md'))
  assert.match(prompt, /Não tente executar shell, Git, npm, PHP, Composer/)
  assert.ok(prompt.includes('Padrões aplicáveis:'))
  assert.ok(prompt.indexOf('Primeira instrução.') < prompt.indexOf('Segunda instrução.'))
  assert.equal(prompt.includes('mission-9999'), false)
  assert.equal(prompt.includes(process.execPath), false)
  assert.equal(prompt.includes('argsPrefix'), false)
  assert.equal(prompt.includes('schemaVersion'), false)
  assert.deepEqual(mission, missionSnapshot)
  assert.deepEqual(standards, standardsSnapshot)
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
      () => buildMissionExecutionPrompt(
        createRunningMission({ status }),
        createStandards(),
      ),
      { message: 'Mission deve estar running para construir prompt de execução' },
    )
  }
})

for (const [name, standards, message] of [
  ['container', null, 'standards deve ser um objeto'],
  ['id', { id: '', instructions: ['ok'] }, 'id de standards deve ser uma string não vazia'],
  ['instructions vazias', { id: 'x', instructions: [] }, 'instructions de standards deve ser um array não vazio'],
  ['instruction vazia', { id: 'x', instructions: [' '] }, 'instructions de standards deve conter strings não vazias'],
]) {
  test(`rejeita standards inválidos: ${name}`, () => {
    assert.throws(
      () => buildMissionExecutionPrompt(createRunningMission(), standards),
      { message },
    )
  })
}
