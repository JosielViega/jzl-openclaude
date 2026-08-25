import assert from 'node:assert/strict'
import { test } from 'node:test'

import { executeOpenClaudeText } from '../src/openclaude-execution-adapter.js'

const invalidInputCases = [
  {
    name: 'rejeita input null',
    input: null,
    expectedError: 'entrada deve ser um objeto',
  },
  {
    name: 'rejeita input que não seja objeto',
    input: 'texto',
    expectedError: 'entrada deve ser um objeto',
  },
  {
    name: 'rejeita input array',
    input: [],
    expectedError: 'entrada deve ser um objeto',
  },
  {
    name: 'rejeita prompt que não seja string antes do projectRoot',
    input: {
      projectRoot: 'qualquer-coisa',
      prompt: 123,
    },
    expectedError: 'prompt deve ser uma string',
  },
  {
    name: 'rejeita prompt vazio antes do projectRoot',
    input: {
      projectRoot: 'qualquer-coisa',
      prompt: '   ',
    },
    expectedError: 'prompt não pode ser vazio',
  },
  {
    name: 'rejeita projectRoot relativo',
    input: {
      projectRoot: 'relative/path',
      prompt: 'teste',
      session: {
        responsibility: 'mission-execution',
        mode: 'fresh',
        missionId: 'mission-0001',
      },
      modelRoute: { responsibility: 'mission-execution', model: 'model-a' },
    },
    expectedError: 'projectRoot deve ser um caminho absoluto',
  },
]

for (const { name, input, expectedError } of invalidInputCases) {
  test(name, async () => {
    await assert.rejects(
      executeOpenClaudeText(input),
      { message: expectedError },
    )
  })
}

test('rejeita descriptor de sessão antes de criar worker', async () => {
  await assert.rejects(
    executeOpenClaudeText({
      projectRoot: 'qualquer-coisa',
      prompt: 'teste',
      session: {
        responsibility: 'mission-execution',
        mode: 'resume',
        missionId: 'mission-0001',
      },
      modelRoute: { responsibility: 'mission-execution', model: 'model-a' },
    }),
    { message: 'modo da sessão de Mission não é suportado' },
  )
})

test('aceita descriptor mission-review e valida projectRoot antes do worker', async () => {
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path',
    prompt: 'revisar',
    session: {
      responsibility: 'mission-review', mode: 'fresh', missionId: 'mission-0001',
    },
    modelRoute: { responsibility: 'mission-review', model: 'model-review' },
  }), { message: 'projectRoot deve ser um caminho absoluto' })
})

test('Change Scope é aceito somente para sessão mission-execution', async () => {
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'executar',
    session: { responsibility: 'mission-execution', mode: 'fresh', missionId: 'mission-0001' },
    modelRoute: { responsibility: 'mission-execution', model: 'model-a' },
    changeScope: { allowedPaths: [] },
  }), { message: 'projectRoot deve ser um caminho absoluto' })

  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'revisar',
    session: { responsibility: 'mission-review', mode: 'fresh', missionId: 'mission-0001' },
    modelRoute: { responsibility: 'mission-review', model: 'model-a' },
    changeScope: { allowedPaths: [] },
  }), { message: 'Change Scope OpenClaude só é suportado para mission-execution' })
})

test('aceita descriptor mission-planning e rota correspondente antes do worker', async () => {
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'planejar',
    session: {
      responsibility: 'mission-planning', mode: 'fresh', missionId: 'mission-0001',
    },
    modelRoute: { responsibility: 'mission-planning', model: 'model-plan' },
  }), { message: 'projectRoot deve ser um caminho absoluto' })
})

test('valida rota de modelo e vínculo com responsabilidade antes do worker', async () => {
  const session = {
    responsibility: 'mission-execution', mode: 'fresh', missionId: 'mission-0001',
  }
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'teste', session,
    modelRoute: { responsibility: 'mission-review', model: 'review-model' },
  }), { message: 'rota de modelo não corresponde à responsabilidade da sessão' })
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'teste',
    session: { ...session, responsibility: 'mission-review' },
    modelRoute: { responsibility: 'mission-execution', model: 'execution-model' },
  }), { message: 'rota de modelo não corresponde à responsabilidade da sessão' })
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'teste', session, modelRoute: null,
  }), { message: 'rota de modelo deve ser um objeto' })
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'teste', session,
    modelRoute: { responsibility: 'mission-execution', model: '  model  ' },
  }), { message: 'modelo da rota deve ser uma string não vazia' })
  await assert.rejects(executeOpenClaudeText({
    projectRoot: 'relative/path', prompt: 'teste', session, model: 'model-solto',
  }), { message: 'rota de modelo deve ser um objeto' })
})
