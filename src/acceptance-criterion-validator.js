import {
  lstatSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { TextDecoder } from 'node:util'

import { validateMissionAcceptanceCriterion } from './mission-acceptance-criterion.js'
import {
  resolveExistingProjectPath,
  resolveProjectPathForCreate,
  toProjectPath,
} from './project-path.js'
import { createProjectContext } from './project-context.js'

function evidence(criterion, satisfied, errorMessage = null) {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    errorMessage,
    criterionType: criterion.type,
    path: criterion.path,
    satisfied,
  }
}

function result(criterion, status, satisfied, errorMessage = null) {
  return {
    id: criterion.id,
    status,
    evidence: evidence(criterion, satisfied, errorMessage),
  }
}

function runtimeError(criterion, error) {
  return result(
    criterion,
    'ERROR',
    null,
    error instanceof Error ? error.message : String(error),
  )
}

function resolveTarget(context, criterion) {
  const lexicalPath = resolve(context.projectRoot, criterion.path)
  const entry = lstatSync(lexicalPath, { throwIfNoEntry: false })

  if (entry === undefined) {
    resolveProjectPathForCreate(context, criterion.path)
    return { exists: false, path: null }
  }

  const targetPath = resolveExistingProjectPath(context, criterion.path)
  const canonicalProjectPath = toProjectPath(context, targetPath).replaceAll('\\', '/')
  validateMissionAcceptanceCriterion({
    ...criterion,
    path: canonicalProjectPath,
  })

  return { exists: true, path: targetPath }
}

function readUtf8(path) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path))
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('arquivo do acceptance criterion não é UTF-8 válido')
    }

    throw error
  }
}

export function runMissionAcceptanceCriterion(context, criterion) {
  validateMissionAcceptanceCriterion(criterion)
  const projectContext = createProjectContext(context?.projectRoot)
  let target

  try {
    target = resolveTarget(projectContext, criterion)
  } catch (error) {
    return runtimeError(criterion, error)
  }

  if (!target.exists) {
    const satisfied = criterion.type === 'file-not-exists'
    return result(criterion, satisfied ? 'PASS' : 'FAIL', satisfied)
  }

  let isFile

  try {
    isFile = statSync(target.path).isFile()
  } catch (error) {
    return runtimeError(criterion, error)
  }

  if (!isFile) {
    return result(criterion, 'FAIL', false)
  }

  if (criterion.type === 'file-exists') {
    return result(criterion, 'PASS', true)
  }

  if (criterion.type === 'file-not-exists') {
    return result(criterion, 'FAIL', false)
  }

  let fileText

  try {
    fileText = readUtf8(target.path)
  } catch (error) {
    return runtimeError(criterion, error)
  }

  const contains = fileText.includes(criterion.text)
  const satisfied = criterion.type === 'file-contains' ? contains : !contains

  return result(criterion, satisfied ? 'PASS' : 'FAIL', satisfied)
}
