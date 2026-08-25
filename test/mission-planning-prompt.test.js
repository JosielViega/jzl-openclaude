import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMissionPlanningPrompt } from '../src/mission-planning-prompt.js'

function context(dependencies = []) {
  return {
    mission: {
      id: 'mission-0001', title: 'Planejar status', objective: 'Adicionar status visual',
      status: 'pending', dependencies,
    },
    standards: { id: 'traditional-web-v1', instructions: ['Sem frameworks.'] },
  }
}

test('renderiza identidade, Mission, dependências e standards', () => {
  const prompt = buildMissionPlanningPrompt(context(['mission-0000']))
  for (const text of [
    'mission-planning', 'mission-0001', 'Planejar status', 'Adicionar status visual',
    '- mission-0000', 'Sem frameworks.',
  ]) assert.ok(prompt.includes(text))
  assert.ok(buildMissionPlanningPrompt(context()).includes('(nenhuma)'))
})

test('explicita planejamento consultivo, read-only e sem autorização', () => {
  const prompt = buildMissionPlanningPrompt(context())
  for (const text of [
    'planejamento é consultivo', 'não autoriza execução', 'Não altere arquivos',
    'não implemente a Mission', 'Não tente executar shell, Git, npm, PHP, Composer',
    'Não use .jzl, .git ou .openclaude', 'mínimo necessário',
    'sem frameworks, dependências ou abstrações desnecessárias',
    'Validator Engine do JZL',
  ]) assert.ok(prompt.includes(text))
})

test('exige JSON puro com shape canônico de planejamento', () => {
  const prompt = buildMissionPlanningPrompt(context())
  assert.ok(prompt.includes('Retorne SOMENTE um objeto JSON válido'))
  for (const field of ['"summary"', '"steps"', '"title"', '"detail"', '"paths"', '"risks"', '"validation"']) {
    assert.ok(prompt.includes(field))
  }
  assert.equal(prompt.includes('"verdict"'), false)
})

test('não inclui campos externos e não muta o contexto', () => {
  const value = context()
  value.sessionId = 'segredo-session'
  value.history = 'segredo-history'
  value.handoff = 'segredo-handoff'
  value.provider = 'segredo-provider'
  const snapshot = structuredClone(value)
  const prompt = buildMissionPlanningPrompt(value)
  for (const secret of ['segredo-session', 'segredo-history', 'segredo-handoff', 'segredo-provider']) {
    assert.equal(prompt.includes(secret), false)
  }
  assert.deepEqual(value, snapshot)
})

test('planning vê criteria sem poder criá-los e mantém validation consultivo', () => {
  const value = context()
  value.mission.acceptanceCriteria = [{
    id: 'criterion-0001', type: 'file-contains', path: 'index.html', text: 'AFTER',
  }]
  const prompt = buildMissionPlanningPrompt(value)
  for (const value of [
    'criterion-0001', 'AFTER', 'sem alterá-los ou reinterpretá-los',
    'validation[] produzido pelo planejamento é consultivo',
    'não cria novos Acceptance Criteria',
  ]) assert.ok(prompt.includes(value))
})
