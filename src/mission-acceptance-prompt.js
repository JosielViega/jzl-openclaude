import { validateMissionAcceptanceCriteria } from './mission-acceptance-criterion.js'

function renderCriterion(criterion) {
  const text = Object.hasOwn(criterion, 'text')
    ? `\n\nTexto:\n--- início texto ---\n${criterion.text}\n--- fim texto ---`
    : ''

  return `Criterion:
${criterion.id}

Tipo:
${criterion.type}

Path:
${criterion.path}${text}`
}

export function renderMissionAcceptanceCriteria(criteria) {
  if (criteria === undefined) {
    return ''
  }

  validateMissionAcceptanceCriteria(criteria)

  if (criteria.length === 0) {
    return ''
  }

  return `Critérios de aceitação determinísticos definidos pelo JZL:

${criteria.map(renderCriterion).join('\n\n')}`
}
