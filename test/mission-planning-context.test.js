import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { buildMissionPlanningContext } from '../src/mission-planning-context.js'

function setup(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-planning-context-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return { projectRoot }
}

const mission = (status = 'pending') => ({
  id: 'mission-0001', title: 'Planejar', objective: 'Mudança segura', status,
  dependencies: ['mission-0000'],
})
const standards = () => ({ id: 'traditional-web-v1', instructions: ['Seja simples.'] })

test('constrói contexto mínimo clonado para Mission pending', (t) => {
  const context = setup(t)
  const input = { mission: mission(), standards: standards() }
  const built = buildMissionPlanningContext(context, input)
  assert.deepEqual(built, input)
  assert.deepEqual(Object.keys(built), ['mission', 'standards'])
  built.mission.title = 'mutado'
  built.standards.instructions[0] = 'mutado'
  assert.equal(input.mission.title, 'Planejar')
  assert.equal(input.standards.instructions[0], 'Seja simples.')
})

test('rejeita status diferente de pending', (t) => {
  assert.throws(() => buildMissionPlanningContext(setup(t), {
    mission: mission('running'), standards: standards(),
  }), { message: 'Mission deve estar pending para construir contexto de planejamento' })
})

test('preserva o contrato de standards da revisão', (t) => {
  const context = setup(t)
  for (const [value, message] of [
    [null, 'standards deve ser um objeto'],
    [{ id: '', instructions: ['x'] }, 'id de standards deve ser uma string não vazia'],
    [{ id: 'x', instructions: [] }, 'instructions de standards deve ser um array não vazio'],
    [{ id: 'x', instructions: [''] }, 'instructions de standards deve conter strings não vazias'],
  ]) assert.throws(() => buildMissionPlanningContext(context, {
    mission: mission(), standards: value,
  }), { message })
})

test('valida projectRoot sem expô-lo no retorno', () => {
  assert.throws(() => buildMissionPlanningContext({ projectRoot: 'relative' }, {
    mission: mission(), standards: standards(),
  }), /caminho absoluto/)
})
