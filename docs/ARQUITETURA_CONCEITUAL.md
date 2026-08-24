# Arquitetura conceitual

Este documento descreve os limites conceituais do JZL OpenClaude. Os componentes ainda não estão implementados.

## Fundamentos

1. Um `projectRoot` explícito será a raiz autoritativa de todas as operações sobre um projeto gerenciado. Caminhos críticos serão derivados dele.
2. O estado de workflow será estruturado. Markdown poderá servir à leitura humana, mas não será fonte autoritativa de estado.
3. Somente o Mission Engine poderá realizar transições autoritativas de workflow.
4. O OpenClaude Execution Adapter delegará a execução e reportará resultados, mas não controlará o workflow.
5. Futuramente, cada projeto gerenciado terá um diretório `.jzl/` com configuração e estado persistentes.
6. Componentes inteligentes poderão propor decisões e produzir artefatos. Componentes determinísticos controlarão estado e regras verificáveis.
7. O runtime do OpenClaude será isolado do processo principal do JZL em um processo worker iniciado com `cwd` igual ao `projectRoot` explícito e validado.

## Componentes

### Project Context

Representa a identidade e os limites do projeto gerenciado, incluindo seu `projectRoot` explícito. Fornece a referência autoritativa para resolver caminhos e impedir operações fora do escopo.

### State Store

Persiste configuração e estado estruturado do workflow. Será a fonte autoritativa de estado; documentos Markdown poderão apresentar informações para humanos, mas não substituí-lo.

### Mission Engine

Coordena o ciclo de vida das Missions e é o único componente autorizado a efetuar transições de workflow. Aplica pré-condições, dependências, critérios e resultados antes de alterar o estado.

### Standards Resolver

Determina os padrões aplicáveis ao projeto e a uma Mission, de forma previsível e rastreável. Evita que cada sessão reinvente convenções de estrutura, código e decisões técnicas.

### Context Builder

Constrói o contexto mínimo necessário para uma responsabilidade. Seleciona instruções, padrões, estado e artefatos relevantes sem compartilhar transcripts automaticamente.

### Session Manager

Cria e acompanha sessões isoladas por responsabilidade. Mantém seus limites e encaminha a comunicação entre responsabilidades por Handoffs estruturados.

### Model Router

O JZL seleciona explicitamente um modelo por responsabilidade a partir do Project Config e registra essa escolha no Event Log. O OpenClaude continua responsável pelo provider e por sua mecânica de execução. No v1 não há seleção automática nem fallback, e cada Session permanece fresh e independente do modelo escolhido.

### OpenClaude Execution Adapter

Representa a fronteira do JZL com o worker OpenClaude. O processo principal não inicializa o SDK diretamente: delega ao worker a execução no contexto do `projectRoot` e normaliza o resultado reportado. Não decide nem altera o estado autoritativo do workflow.

### OpenClaude Worker

Processo isolado que inicia com `cwd` igual ao `projectRoot` antes de inicializar o runtime do OpenClaude. Inicialmente, será descartável por execução e terminará após entregar seu resultado. Não possui autoridade para alterar o estado autoritativo do workflow.

### Execution Guardrails

Sessões probabilísticas possuem um budget temporal determinístico definido pelo JZL. O worker usa `AbortController` para cancelamento cooperativo da Query, enquanto o processo principal mantém um watchdog independente que encerra o worker caso necessário. Timeout é tratado como erro técnico pelo workflow existente e nunca provoca retry automático.

### Validator Engine

Executa verificações determinísticas de estado, escopo, dependências, critérios e artefatos. Uma afirmação do modelo de que o trabalho terminou não constitui validação.

### Handoff Processor

Valida e processa Handoffs estruturados entre responsabilidades. Transfere resultados e informações resumíveis sem depender do compartilhamento automático de transcripts.

### Mission Review

A Mission Review é consultiva e não possui autoridade sobre o workflow. Um resultado `CONCERNS` só pode originar uma transição para correção após autorização explícita do Host/JZL; a execução seguinte recebe um Handoff estruturado, sem compartilhamento de transcript.

### Execution History / Event Log

Registra eventos e resultados relevantes da execução para auditoria, diagnóstico e rastreabilidade. O histórico explica o que ocorreu, mas não substitui o estado autoritativo do State Store.

## Fluxo conceitual

1. O Project Context delimita o projeto e seu `projectRoot`.
2. O Mission Engine consulta estado, dependências e padrões aplicáveis.
3. O Context Builder prepara o contexto mínimo da responsabilidade.
4. O Session Manager isola a sessão, e o Model Router seleciona o modelo.
5. A execução segue `JZL -> OpenClaude Execution Adapter -> OpenClaude Worker -> OpenClaude SDK -> modelo`, e o resultado retorna normalizado pelo adapter.
6. O Validator Engine verifica deterministicamente os critérios aplicáveis.
7. O Handoff Processor trata a comunicação estruturada quando outra responsabilidade precisa continuar o trabalho.
8. O Mission Engine decide qualquer transição autoritativa, enquanto o Execution History / Event Log registra os eventos relevantes.

Esse desenho mantém controle determinístico por fora e inteligência probabilística por dentro.
