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

No perfil `traditional-web-v1`, o JZL usa o Validator Engine para verificar deterministicamente nomes ASCII de arquivos e diretórios, sintaxe JavaScript pelo runtime Node atual e sintaxe PHP pelo executável configurado. Esse contrato permanece congelado, inclusive para configurações legacy sem `standardsProfile`. Diretórios de controle e dependências (`.jzl`, `.git`, `.openclaude`, `vendor` e `node_modules`) são ignorados, e links simbólicos e junctions não são percorridos. Um `FAIL` pode solicitar correção, mas conformidade do projeto não equivale a cumprimento da Mission: somente Acceptance Criteria ou validators específicos fornecidos explicitamente comprovam seu objetivo; Change Scope representa autorização, não prova. A verificação ampla `check-standards` é somente leitura e não depende de Mission.

O perfil `traditional-web-v2` inclui integralmente o contrato v1 e acrescenta o Source Text Contract v1: arquivos PHP, JavaScript, CSS, HTML e SQL de primeira parte devem conter UTF-8 válido. Conteúdo Unicode é permitido; BOM e line endings não são policiados por esse standard.

O Traditional Web Structure Contract v1 exige os diretórios reais `public/`, `public/assets/`, `public/assets/css/`, `public/assets/js/`, `public/assets/images/` e `src/`; `database/` é opcional. PHP de primeira parte pertence a `public/` ou `src/`, JavaScript a `public/assets/js/`, CSS a `public/assets/css/`, HTML a `public/` e SQL a `database/`. Arquivos de extensões neutras não recebem regra de placement. Links simbólicos e junctions não satisfazem diretórios estruturais obrigatórios.

`init-project` garante somente esse scaffold de diretórios e pode restaurar diretórios obrigatórios ausentes em nova execução, sem criar placeholders ou mover arquivos da aplicação. `check-standards` apenas observa e reporta a estrutura. Mesmo quando o Structure Standard passa, a conclusão de uma Mission continua exigindo prova específica de seu objetivo.

O Project Config separa a família `template` do contrato versionado `standardsProfile`. Novos projetos `traditional-web` são explicitamente pinned no profile inicial `traditional-web-v2`; configurações legacy sem o campo permanecem válidas e resolvem permanentemente para o profile legacy `traditional-web-v1`, nunca para um conceito de “latest”. A criação do v2 demonstra que profiles pinned não são alterados pela evolução do JZL.

Atualizar o JZL não altera implicitamente o contrato de standards de um projeto. Não há migração automática nem comando de upgrade nesta versão: reruns de `init-project` preservam configurações legacy sem adicionar o campo, e `check-standards` usa o profile efetivo do projeto de forma somente leitura.

### Context Builder

Constrói o contexto mínimo necessário para uma responsabilidade. Seleciona instruções, padrões, estado e artefatos relevantes sem compartilhar transcripts automaticamente.

### Responsibility Registry

Mantém os contratos determinísticos das responsabilidades suportadas — execução, revisão e planejamento de Mission — incluindo modo de sessão, classe de acesso a ferramentas, budget temporal e necessidade de rota de modelo. Evita que diferentes componentes mantenham listas independentes de responsabilidades. Não executa Missions, não escolhe modelos, não controla o filesystem e não cria Sessions.

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

### Mission Acceptance Criteria

OpenClaude `SUCCESS` técnico não equivale a Mission concluída. Acceptance Criteria são condições determinísticas definidas pelo Host/JZL, persistidas de forma imutável na Mission e avaliadas pelo Validator Engine sem derivação a partir do modelo. O v1 suporta `file-exists`, `file-not-exists`, `file-contains` e `file-not-contains`; esses critérios entram na mesma agregação dos validators configurados, onde `PASS` permite conclusão, `FAIL` solicita correção e `ERROR` mantém validação. Conteúdo de arquivo não é persistido como evidence, e `planning.validation[]` permanece apenas consultivo.

### Execution Change Set

Observa deterministicamente o efeito de cada tentativa de execução no filesystem. Snapshots before/after e seus SHA-256 internos não são persistidos; o Event Log recebe somente paths `created`, `modified` e `deleted`, excluindo `.jzl`, `.git` e `.openclaude` e sem percorrer symlinks ou junctions. O Change Set não determina `PASS` ou `FAIL`: um conjunto vazio não significa falha, e Acceptance Criteria e Validators continuam sendo a autoridade. Erros técnicos podem registrar um Change Set quando a observação final for possível, e Mission Review recebe somente o Change Set da última execução `SUCCESS` como contexto, sem transcript.

### Mission Change Scope

Autoriza deterministicamente os paths exatos que uma Mission pode alterar. É opcional, definido pelo Host/JZL e imutável no v1: sua ausência preserva o comportamento legado, enquanto `allowedPaths: []` proíbe qualquer mutação. A Tool Policy aplica o scope ao target canônico real de `Write` e `Edit`, sem restringir leitura, e o Change Set verifica posteriormente o efeito observado por meio de um Scope Validator. Esse validator roda antes de Acceptance Criteria e validators configurados; `FAIL` solicita correção, `ERROR` mantém a Mission em validação e um Change Set vazio pode resultar em `PASS`. O scope restringe autoridade, mas não comprova que o objetivo foi cumprido, e o Planner não pode criá-lo nem ampliá-lo.

### Handoff Processor

Valida e processa Handoffs estruturados entre responsabilidades. Transfere resultados e informações resumíveis sem depender do compartilhamento automático de transcripts.

### Mission Review

A Mission Review é consultiva e não possui autoridade sobre o workflow. Um resultado `CONCERNS` só pode originar uma transição para correção após autorização explícita do Host/JZL; a execução seguinte recebe um Handoff estruturado, sem compartilhamento de transcript.

### Mission Planning

O Mission Planning é uma responsabilidade probabilística consultiva que produz um plano estruturado para uma Mission `pending` e pronta, em sessão fresh e somente leitura. Planning continua opcional e não altera o workflow. Um plano só entra na execução após autorização explícita do Host/JZL, auditada como `mission.plan.approved`, por meio de um Handoff `mission-plan-execution`. O source probabilístico e a autorização determinística permanecem separados; um novo `mission.plan.finished` torna a aprovação anterior stale. Nenhum transcript é compartilhado.

### Execution History / Event Log

Registra eventos e resultados relevantes da execução para auditoria, diagnóstico e rastreabilidade. O histórico explica o que ocorreu, mas não substitui o estado autoritativo do State Store.

### Mission Audit Report

Oferece uma visão derivada e somente leitura da Mission atual no State e dos fatos auditados no Event Log, sem Store próprio, novo Event ou chamada a modelo. Planejamento aparece separadamente, enquanto o ciclo atual é ancorado pela última tentativa de execução, seja `SUCCESS` ou `ERROR`, sem misturar validation ou review anteriores. O relatório não recalcula Change Set, não revalida a Mission e não recomenda a próxima ação; o comando `history` continua sendo a timeline completa.

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
