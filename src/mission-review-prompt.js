import { renderMissionAcceptanceCriteria } from './mission-acceptance-prompt.js'

export function buildMissionReviewPrompt(reviewContext) {
  const { mission, standards } = reviewContext
  const standardsList = standards.instructions
    .map((instruction) => `- ${instruction}`)
    .join('\n')
  const renderedCriteria = renderMissionAcceptanceCriteria(
    mission.acceptanceCriteria,
  )
  const acceptanceSection = renderedCriteria === '' ? '' : `

${renderedCriteria}

Esses critérios são condições determinísticas definidas pelo JZL e podem ser usados como contexto da revisão.
O reviewer não decide sua avaliação final; o Validator Engine mantém essa autoridade.`

  return `Você está revisando uma Mission controlada pelo JZL.

Responsabilidade:
mission-review

Mission:
${mission.id}

Título:
${mission.title}

Objetivo:
${mission.objective}${acceptanceSection}

Padrões aplicáveis:
${standardsList}

Regras obrigatórias:
- A revisão é consultiva.
- Não altere nenhum arquivo.
- Inspecione somente o necessário para avaliar a Mission.
- Não tente executar shell, Git, npm, PHP, Composer ou comandos externos.
- Não use .jzl, .git ou .openclaude como fonte de contexto da revisão.
- Avalie o código atual contra o objetivo da Mission e os padrões aplicáveis.
- Não invente problemas sem evidência observável no código atual.
- Priorize defeitos, regressões, falhas de segurança, inconsistências com a Mission e violações relevantes de standards.
- Não considere sua própria opinião como validação determinística.
- O Validator Engine do JZL continuará decidindo a validação autoritativa.

Retorne SOMENTE um objeto JSON válido, sem Markdown, cercas de código, texto antes ou texto depois.

Para PASS, use exatamente esta estrutura e somente quando não houver finding relevante:
{
  "verdict": "PASS",
  "summary": "...",
  "findings": []
}

Para CONCERNS, use ao menos um finding relevante:
{
  "verdict": "CONCERNS",
  "summary": "...",
  "findings": [
    {
      "severity": "HIGH",
      "title": "...",
      "detail": "...",
      "paths": ["app/Auth.php"]
    }
  ]
}

Use caminhos relativos ao projeto quando souber o arquivo relacionado. Se não houver path específico, use "paths": [].`
}
