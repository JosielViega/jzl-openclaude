import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderMissionChangeScope } from '../src/mission-change-scope-prompt.js'
import { buildMissionExecutionPrompt } from '../src/mission-execution-prompt.js'
import { buildMissionPlanningPrompt } from '../src/mission-planning-prompt.js'
import { buildMissionReviewPrompt } from '../src/mission-review-prompt.js'

test('scope ausente não altera prompts legados', () => {
  assert.equal(renderMissionChangeScope(undefined), '')
})

test('renderiza scope vazio sem semântica implícita', () => {
  const output = renderMissionChangeScope({ allowedPaths: [] })
  assert.match(output, /\(nenhum\)/)
  assert.match(output, /não globs nem diretórios implícitos/)
})

test('renderiza paths exatos em ordem sem mutar input', () => {
  const scope = { allowedPaths: ['index.html', 'css/app.css'] }
  const before = structuredClone(scope)
  const output = renderMissionChangeScope(scope)
  assert.ok(output.indexOf('index.html') < output.indexOf('css/app.css'))
  assert.deepEqual(scope, before)
})

test('execution, planning e review renderizam a mesma autoridade sem alterá-la', () => {
  const mission = {
    id: 'mission-0001', title: 'Scoped', objective: 'Alterar index',
    status: 'running', dependencies: [], acceptanceCriteria: [],
    changeScope: { allowedPaths: ['index.html'] },
  }
  const standards = { id: 'test', instructions: ['Preserve o projeto.'] }
  const before = structuredClone(mission)
  const execution = buildMissionExecutionPrompt({ mission, standards, handoff: null })
  const planning = buildMissionPlanningPrompt({ mission: { ...mission, status: 'pending' }, standards })
  const review = buildMissionReviewPrompt({ mission: { ...mission, status: 'validation' }, standards, changeSet: { created: [], modified: ['index.html'], deleted: [] } })

  for (const prompt of [execution, planning, review]) assert.match(prompt, /index\.html/)
  assert.match(execution, /não crie, modifique ou remova paths fora dele/i)
  assert.match(planning, /não pode alterar nem ampliar o Change Scope/)
  assert.match(review, /Change Set abaixo mostra o observado/)
  assert.deepEqual(mission, before)
})
