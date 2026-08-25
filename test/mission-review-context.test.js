import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { buildMissionReviewContext } from '../src/mission-review-context.js'

function setup(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jzl-review-context-'))
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }))
  return { projectRoot }
}

const mission = (status = 'validation') => ({
  id: 'mission-0001', title: 'Revisar', objective: 'Código correto',
  status, dependencies: [],
})
const standards = () => ({ id: 'traditional-web-v1', instructions: ['Seja simples.'] })

test('constrói contexto mínimo clonado para Mission validation', (t) => {
  const context = setup(t)
  const input = { mission: mission(), standards: standards() }
  const built = buildMissionReviewContext(context, input)

  assert.deepEqual(built, input)
  assert.deepEqual(Object.keys(built), ['mission', 'standards'])
  built.mission.title = 'mutado'
  built.standards.instructions[0] = 'mutado'
  assert.equal(input.mission.title, 'Revisar')
  assert.equal(input.standards.instructions[0], 'Seja simples.')
})

test('inclui Change Set válido como clone e normaliza null explícito', (t) => {
  const context = setup(t)
  const changeSet = {
    created: ['created.txt'], modified: ['modified.txt'], deleted: ['deleted.txt'],
  }
  const built = buildMissionReviewContext(context, {
    mission: mission(), standards: standards(), changeSet,
  })
  assert.deepEqual(built.changeSet, changeSet)
  assert.notStrictEqual(built.changeSet, changeSet)
  built.changeSet.created[0] = 'mutado.txt'
  assert.equal(changeSet.created[0], 'created.txt')

  assert.equal(buildMissionReviewContext(context, {
    mission: mission(), standards: standards(), changeSet: null,
  }).changeSet, null)
  assert.throws(() => buildMissionReviewContext(context, {
    mission: mission(), standards: standards(), changeSet: { created: [], modified: [] },
  }), { message: 'deleted do Change Set deve ser um array' })
})

test('rejeita status diferente de validation', (t) => {
  assert.throws(() => buildMissionReviewContext(setup(t), {
    mission: mission('running'), standards: standards(),
  }), { message: 'Mission deve estar validation para construir contexto de revisão' })
})

test('rejeita standards inválidos', (t) => {
  const context = setup(t)
  for (const value of [null, { id: '', instructions: ['x'] }, { id: 'x', instructions: [] }, { id: 'x', instructions: [''] }]) {
    assert.throws(() => buildMissionReviewContext(context, {
      mission: mission(), standards: value,
    }))
  }
})

test('valida projectRoot sem expô-lo no retorno', () => {
  assert.throws(() => buildMissionReviewContext({ projectRoot: 'relative' }, {
    mission: mission(), standards: standards(),
  }), /caminho absoluto/)
})
