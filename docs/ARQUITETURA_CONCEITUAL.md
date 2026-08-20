# Arquitetura conceitual

Este documento descreve os limites conceituais do JZL OpenClaude. Os componentes ainda nao estao implementados.

## Fundamentos

1. Um `projectRoot` explicito sera a raiz autoritativa de todas as operacoes sobre um projeto gerenciado. Caminhos criticos serao derivados dele.
2. O estado de workflow sera estruturado. Markdown podera servir a leitura humana, mas nao sera fonte autoritativa de estado.
3. Somente o Mission Engine podera realizar transicoes autoritativas de workflow.
4. O OpenClaude Execution Adapter executara trabalho e reportara resultados, mas nao controlara o workflow.
5. Futuramente, cada projeto gerenciado tera um diretorio `.jzl/` com configuracao e estado persistentes.
6. Componentes inteligentes poderao propor decisoes e produzir artefatos. Componentes deterministicos controlarao estado e regras verificaveis.

## Componentes

### Project Context

Representa a identidade e os limites do projeto gerenciado, incluindo seu `projectRoot` explicito. Fornece a referencia autoritativa para resolver caminhos e impedir operacoes fora do escopo.

### State Store

Persiste configuracao e estado estruturado do workflow. Sera a fonte autoritativa de estado; documentos Markdown poderao apresentar informacoes para humanos, mas nao substitui-lo.

### Mission Engine

Coordena o ciclo de vida das Missions e e o unico componente autorizado a efetuar transicoes de workflow. Aplica pre-condicoes, dependencias, criterios e resultados antes de alterar o estado.

### Standards Resolver

Determina os padroes aplicaveis ao projeto e a uma Mission, de forma previsivel e rastreavel. Evita que cada sessao reinvente convencoes de estrutura, codigo e decisoes tecnicas.

### Context Builder

Constroi o contexto minimo necessario para uma responsabilidade. Seleciona instrucoes, padroes, estado e artefatos relevantes sem compartilhar transcripts automaticamente.

### Session Manager

Cria e acompanha sessoes isoladas por responsabilidade. Mantem seus limites e encaminha a comunicacao entre responsabilidades por Handoffs estruturados.

### Model Router

Seleciona o modelo adequado conforme a complexidade e as regras aplicaveis. Qwen3.5-9B sera inicialmente o modelo principal, sem impedir o uso de outros modelos quando necessario.

### OpenClaude Execution Adapter

Encapsula a delegacao de execucao ao OpenClaude e normaliza os resultados reportados. Nao decide nem altera o estado autoritativo do workflow.

### Validator Engine

Executa verificacoes deterministicas de estado, escopo, dependencias, criterios e artefatos. Uma afirmacao do modelo de que o trabalho terminou nao constitui validacao.

### Handoff Processor

Valida e processa Handoffs estruturados entre responsabilidades. Transfere resultados e informacoes resumiveis sem depender do compartilhamento automatico de transcripts.

### Execution History / Event Log

Registra eventos e resultados relevantes da execucao para auditoria, diagnostico e rastreabilidade. O historico explica o que ocorreu, mas nao substitui o estado autoritativo do State Store.

## Fluxo conceitual

1. O Project Context delimita o projeto e seu `projectRoot`.
2. O Mission Engine consulta estado, dependencias e padroes aplicaveis.
3. O Context Builder prepara o contexto minimo da responsabilidade.
4. O Session Manager isola a sessao, e o Model Router seleciona o modelo.
5. O OpenClaude Execution Adapter delega a execucao e coleta o resultado.
6. O Validator Engine verifica deterministicamente os criterios aplicaveis.
7. O Handoff Processor trata a comunicacao estruturada quando outra responsabilidade precisa continuar o trabalho.
8. O Mission Engine decide qualquer transicao autoritativa, enquanto o Execution History / Event Log registra os eventos relevantes.

Esse desenho mantem controle deterministico por fora e inteligencia probabilistica por dentro.
