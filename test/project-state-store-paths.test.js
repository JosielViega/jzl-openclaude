import assert from 'node:assert/strict'
import { isAbsolute } from 'node:path'
import { test } from 'node:test'

import {
  JZL_DIRECTORY_PROJECT_PATH,
  PROJECT_STATE_FILE_PROJECT_PATH,
} from '../src/project-state-store-paths.js'

test('define o diretório JZL como projectPath relativo', () => {
  assert.equal(JZL_DIRECTORY_PROJECT_PATH, '.jzl')
  assert.equal(typeof JZL_DIRECTORY_PROJECT_PATH, 'string')
  assert.equal(isAbsolute(JZL_DIRECTORY_PROJECT_PATH), false)
})

test('define o arquivo de estado como projectPath relativo', () => {
  assert.equal(PROJECT_STATE_FILE_PROJECT_PATH, '.jzl/state.json')
  assert.equal(typeof PROJECT_STATE_FILE_PROJECT_PATH, 'string')
  assert.equal(isAbsolute(PROJECT_STATE_FILE_PROJECT_PATH), false)
})

test('preserva a representação estável do arquivo de estado', () => {
  assert.equal(
    PROJECT_STATE_FILE_PROJECT_PATH.startsWith(
      `${JZL_DIRECTORY_PROJECT_PATH}/`,
    ),
    true,
  )
  assert.equal(PROJECT_STATE_FILE_PROJECT_PATH.endsWith('/state.json'), true)
})
