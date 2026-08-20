# Visao do produto

## Proposito

JZL OpenClaude sera um orquestrador local cujo objetivo principal e fazer projetos desenvolvidos por IA seguirem padroes previsiveis de estrutura, codigo e decisoes tecnicas. Essa padronizacao deve facilitar a revisao e a manutencao humanas entre varios projetos.

A prioridade nao e criar algo revolucionario. A prioridade e simplicidade, previsibilidade, padronizacao e facilidade de revisao. A orquestracao e o meio para atingir esse objetivo.

## Modelo de responsabilidade

O fluxo fundamental e:

**JZL controla -> OpenClaude executa -> modelo raciocina**

- O JZL controla estado, escopo, dependencias, criterios e workflow.
- O OpenClaude recebe a delegacao, executa o trabalho e reporta resultados.
- O modelo raciocina e produz conteudo dentro do contexto e da responsabilidade atribuidos.

O JZL nao tera um provider proprio de IA. A execucao sera delegada ao OpenClaude. Inicialmente, Qwen3.5-9B sera o modelo principal, com a possibilidade de usar outros modelos conforme a complexidade da tarefa.

## Principios

- Fornecer somente o contexto minimo necessario.
- Isolar sessoes por responsabilidade.
- Comunicar responsabilidades por Handoffs estruturados.
- Nao compartilhar transcripts automaticamente.
- Nao confiar no modelo para validar o proprio trabalho.
- Validar deterministicamente estado, escopo, dependencias e criterios.
- Preferir operacoes pequenas, verificaveis, resumiveis e idempotentes.
- Derivar caminhos criticos de um `projectRoot` explicito.
- Permitir que a IA decida e produza conteudo, enquanto codigo deterministico controla filesystem e workflow.
- Evitar abstracoes prematuras.
- Manter o codigo simples, explicito, previsivel e facil de revisar.
- Aplicar controle deterministico por fora e inteligencia probabilistica por dentro.

## Stack prioritaria dos projetos gerenciados

- PHP
- MySQL
- JavaScript
- HTML
- CSS

Frameworks, runtimes e dependencias adicionais devem ser evitados quando nao houver necessidade real.
