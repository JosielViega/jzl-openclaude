import { validateMissionChangeScope } from './mission-change-scope.js'

export function renderMissionChangeScope(changeScope) {
  if (changeScope === undefined) {
    return ''
  }

  validateMissionChangeScope(changeScope)
  const paths = changeScope.allowedPaths.length === 0
    ? '(nenhum)'
    : changeScope.allowedPaths.map(path => `- ${path}`).join('\n')

  return `Change Scope determinístico definido pelo JZL:

Paths exatos autorizados para mudanças de filesystem:
${paths}

Os paths são autorizações exatas, não globs nem diretórios implícitos.`
}
