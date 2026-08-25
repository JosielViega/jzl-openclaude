import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMissionReviewPrompt } from '../src/mission-review-prompt.js'

function context() {
  return {
    mission: {
      id: 'mission-0001', title: 'Revisar login', objective: 'Login seguro',
      status: 'validation', dependencies: [],
    },
    standards: { id: 'traditional-web-v1', instructions: ['Sem frameworks.'] },
  }
}

test('renderiza identidade, Mission e standards da revisão', () => {
  const prompt = buildMissionReviewPrompt(context())
  for (const text of [
    'mission-review', 'mission-0001', 'Revisar login', 'Login seguro',
    'Sem frameworks.',
  ]) assert.ok(prompt.includes(text))
})

test('explicita revisão consultiva read-only e autoridade do Validator Engine', () => {
  const prompt = buildMissionReviewPrompt(context())
  for (const text of [
    'A revisão é consultiva.', 'Não altere nenhum arquivo.',
    'Não tente executar shell, Git, npm, PHP, Composer',
    'Não use .jzl, .git ou .openclaude',
    'Validator Engine do JZL continuará decidindo a validação autoritativa',
  ]) assert.ok(prompt.includes(text))
})

test('exige JSON puro e apresenta shapes PASS e CONCERNS', () => {
  const prompt = buildMissionReviewPrompt(context())
  assert.ok(prompt.includes('Retorne SOMENTE um objeto JSON válido'))
  assert.ok(prompt.includes('"verdict": "PASS"'))
  assert.ok(prompt.includes('"verdict": "CONCERNS"'))
  assert.ok(prompt.includes('"findings": []'))
  assert.ok(prompt.includes('caminhos relativos ao projeto'))
})

test('não inclui histórico de execução, Handoff ou transcript e não muta contexto', () => {
  const value = context()
  value.executionResult = 'segredo-execution'
  value.handoff = 'segredo-handoff'
  value.sessionId = 'segredo-session'
  const snapshot = structuredClone(value)
  const prompt = buildMissionReviewPrompt(value)

  assert.equal(prompt.includes('segredo-execution'), false)
  assert.equal(prompt.includes('segredo-handoff'), false)
  assert.equal(prompt.includes('segredo-session'), false)
  assert.deepEqual(value, snapshot)
})

test('review recebe criteria como contexto sem autoridade determinística', () => {
  const value = context()
  value.mission.acceptanceCriteria = [{
    id: 'criterion-0001', type: 'file-exists', path: 'index.html',
  }]
  const prompt = buildMissionReviewPrompt(value)
  for (const value of [
    'criterion-0001', 'file-exists', 'condições determinísticas',
    'reviewer não decide', 'Validator Engine mantém essa autoridade',
  ]) assert.ok(prompt.includes(value))
})
