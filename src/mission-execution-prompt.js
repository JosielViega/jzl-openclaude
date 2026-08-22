import { validateMission } from './mission.js'

export function buildMissionExecutionPrompt(mission, standards) {
  validateMission(mission)

  if (mission.status !== 'running') {
    throw new Error('Mission deve estar running para construir prompt de execução')
  }

  if (
    standards === null
    || typeof standards !== 'object'
    || Array.isArray(standards)
  ) {
    throw new Error('standards deve ser um objeto')
  }

  if (typeof standards.id !== 'string' || standards.id.trim() === '') {
    throw new Error('id de standards deve ser uma string não vazia')
  }

  if (
    !Array.isArray(standards.instructions)
    || standards.instructions.length === 0
  ) {
    throw new Error('instructions de standards deve ser um array não vazio')
  }

  if (!standards.instructions.every(
    (instruction) => typeof instruction === 'string' && instruction.trim() !== '',
  )) {
    throw new Error('instructions de standards deve conter strings não vazias')
  }

  const standardsList = standards.instructions
    .map((instruction) => `- ${instruction}`)
    .join('\n')

  return `Você está executando uma Mission controlada pelo JZL.

Mission:
${mission.id}

Título:
${mission.title}

Objetivo:
${mission.objective}

Padrões aplicáveis:
${standardsList}

Regras obrigatórias:
- Trabalhe somente dentro do projeto atual.
- Siga AGENTS.md e as regras existentes do projeto.
- Faça somente as alterações necessárias para cumprir esta Mission.
- Você pode usar somente as ferramentas autorizadas pelo JZL.
- Não altere .jzl, .git, .openclaude ou AGENTS.md.
- Não tente executar shell, Git, npm, PHP, Composer ou comandos externos.
- Ao terminar, responda com um resumo curto das alterações realizadas.`
}
