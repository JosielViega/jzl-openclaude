import { posix } from 'node:path'

import { discoverTraditionalWebProjectEntries } from './traditional-web-project-discovery.js'

const unauthorizedExtensions = new Set([
  '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.py', '.go', '.java', '.cs', '.rb',
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidIssuePath(value) {
  return typeof value === 'string'
    && value !== ''
    && value.length <= 500
    && !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:/u.test(value)
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && posix.normalize(value) === value
    && value.split('/').every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..'
    )
}

export function validateTraditionalWebTechnologyBoundaryIssue(issue) {
  if (!isObject(issue)) {
    throw new Error('issue de technology boundary traditional-web deve ser um objeto')
  }
  if (!isValidIssuePath(issue.path)) {
    throw new Error('path do issue de technology boundary traditional-web é inválido')
  }
  if (issue.reason !== 'technology-not-authorized') {
    throw new Error('reason do issue de technology boundary traditional-web não é suportado')
  }
  return issue
}

export function evaluateTraditionalWebTechnologyBoundary(context) {
  const issues = discoverTraditionalWebProjectEntries(context)
    .filter((entry) => entry.kind === 'file'
      && unauthorizedExtensions.has(posix.extname(entry.path).toLowerCase()))
    .map((entry) => ({ path: entry.path, reason: 'technology-not-authorized' }))

  for (const issue of issues) validateTraditionalWebTechnologyBoundaryIssue(issue)
  return issues
}
