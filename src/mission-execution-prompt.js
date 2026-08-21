import { validateMission } from './mission.js'

export function buildMissionExecutionPrompt(mission) {
  validateMission(mission)

  if (mission.status !== 'running') {
    throw new Error('Mission deve estar running para construir prompt de execução')
  }

  return `Você está executando uma Mission controlada pelo JZL.

Mission:
${mission.id}

Título:
${mission.title}

Objetivo:
${mission.objective}

Regras obrigatórias:
- Trabalhe somente dentro do projeto atual.
- Siga AGENTS.md e as regras existentes do projeto.
- Faça somente as alterações necessárias para cumprir esta Mission.
- Você pode usar somente as ferramentas autorizadas pelo JZL.
- Não altere .jzl, .git, .openclaude ou AGENTS.md.
- Não tente executar shell, Git, npm, PHP, Composer ou comandos externos.
- Ao terminar, responda com um resumo curto das alterações realizadas.`
}
