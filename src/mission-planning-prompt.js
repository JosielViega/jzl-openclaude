export function buildMissionPlanningPrompt(planningContext) {
  const { mission, standards } = planningContext
  const dependencies = mission.dependencies.length === 0
    ? '(nenhuma)'
    : mission.dependencies.map((dependency) => `- ${dependency}`).join('\n')
  const standardsList = standards.instructions.map((instruction) => `- ${instruction}`).join('\n')

  return `Você está planejando uma Mission controlada pelo JZL.

Responsabilidade:
mission-planning

Mission ID:
${mission.id}

Título:
${mission.title}

Objetivo:
${mission.objective}

Dependências:
${dependencies}

Padrões aplicáveis:
${standardsList}

Regras obrigatórias:
- O planejamento é consultivo e não autoriza execução.
- Não altere arquivos e não implemente a Mission.
- Inspecione somente o mínimo necessário para produzir um plano baseado em evidências.
- Não tente executar shell, Git, npm, PHP, Composer ou comandos externos.
- Não use .jzl, .git ou .openclaude como fonte de contexto do planejamento.
- Preserve a arquitetura e as convenções existentes.
- Proponha a solução mínima suficiente, sem frameworks, dependências ou abstrações desnecessárias.
- Produza passos concretos e use caminhos relativos ao projeto.
- Registre riscos somente quando houver evidência observável.
- Sugira validações; essa sugestão é consultiva e não substitui o Validator Engine do JZL.

Retorne SOMENTE um objeto JSON válido, sem Markdown, cercas de código, texto antes ou texto depois, com esta estrutura:
{
  "summary": "...",
  "steps": [
    {
      "title": "...",
      "detail": "...",
      "paths": ["src/exemplo.js"]
    }
  ],
  "risks": ["..."],
  "validation": ["..."]
}`
}
