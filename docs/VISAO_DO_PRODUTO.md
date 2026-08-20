# Visão do produto

## Propósito

JZL OpenClaude será um orquestrador local cujo objetivo principal é fazer projetos desenvolvidos por IA seguirem padrões previsíveis de estrutura, código e decisões técnicas. Essa padronização deve facilitar a revisão e a manutenção humanas entre vários projetos.

A prioridade não é criar algo revolucionário. A prioridade é simplicidade, previsibilidade, padronização e facilidade de revisão. A orquestração é o meio para atingir esse objetivo.

## Modelo de responsabilidade

O fluxo fundamental é:

**JZL controla -> OpenClaude executa -> modelo raciocina**

- O JZL controla estado, escopo, dependências, critérios e workflow.
- O OpenClaude recebe a delegação, executa o trabalho e reporta resultados.
- O modelo raciocina e produz conteúdo dentro do contexto e da responsabilidade atribuídos.

O JZL não terá um provider próprio de IA. A execução será delegada ao OpenClaude. Inicialmente, Qwen3.5-9B será o modelo principal, com a possibilidade de usar outros modelos conforme a complexidade da tarefa.

## Princípios

- Fornecer somente o contexto mínimo necessário.
- Isolar sessões por responsabilidade.
- Comunicar responsabilidades por Handoffs estruturados.
- Não compartilhar transcripts automaticamente.
- Não confiar no modelo para validar o próprio trabalho.
- Validar deterministicamente estado, escopo, dependências e critérios.
- Preferir operações pequenas, verificáveis, resumíveis e idempotentes.
- Derivar caminhos críticos de um `projectRoot` explícito.
- Permitir que a IA decida e produza conteúdo, enquanto código determinístico controla filesystem e workflow.
- Evitar abstrações prematuras.
- Manter o código simples, explícito, previsível e fácil de revisar.
- Aplicar controle determinístico por fora e inteligência probabilística por dentro.

## Stack prioritária dos projetos gerenciados

- PHP
- MySQL
- JavaScript
- HTML
- CSS

Frameworks, runtimes e dependências adicionais devem ser evitados quando não houver necessidade real.
