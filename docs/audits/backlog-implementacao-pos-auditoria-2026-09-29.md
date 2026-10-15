# Backlog de implementação após a auditoria da sessão DSH de 29/09/2026

## Resumo e uso

Este backlog cobre todos os achados da [auditoria](auditoria-implementacao-dsh-2026-09-29.md) e dá execução ao [roadmap](roadmap-implementacao-pos-auditoria-2026-09-29.md). RA29-01…20 pertencem ao RICK Intelligence e preservam os IDs do backlog daquele projeto; DH29-01…08 são melhorias propostas para o DeepSeek Harness. O estado abaixo é uma leitura de 29/09/2026, não a fonte canônica de progresso. Conferir `/home/ricardo/rick-intelligence/.agent/` e a árvore de ambos os projetos antes de trabalhar em qualquer item.

## Estados e aceite comum

`PENDENTE` significa entrega ou prova ainda não apresentada; `PARCIAL` significa alteração ou teste focado existente sem todos os critérios de aceite; `BLOQUEADO_EXTERNO` identifica somente o efeito dependente de decisão, ambiente ou recurso externo. Nenhum dos 28 IDs é marcado `ACEITO` apenas pelos logs examinados. Os donos abaixo são papéis propostos, não pessoas atribuídas.

Cada entrega fecha com: candidato identificável, arquivos/diff, comando e exit code, artefato sanitizado, casos positivo e negativo proporcionais ao risco, revisão, limitações e recuperação. `NOT_RUN`, skipped e bloqueio permanecem distintos de PASS. Evidência do RICK fica no repositório RICK; evidência de funcionamento do DSH fica no repositório DSH. Uma alteração de documentação não substitui mudança de código exigida pelo aceite.

## F0 — Baseline, migração e rastreabilidade

| ID | Dono e prioridade | Estado inicial | Entrega e aceite verificável |
|---|---|---|---|
| **RA29-01** | RICK · QA/lead · P0 | PENDENTE | Congelar commit/tree ou manifesto de hashes da árvore suja; registrar comandos, ambiente e artefatos do benchmark, Web e ingestão. Cada falha tem reprodução ou três tentativas documentadas de não reprodução, sem enfraquecer critérios. |
| **RA29-02** | RICK · dados/backend · P0 | PENDENTE | Inventariar linhas incompatíveis, writers e consultas de chunks, jobs, collections, conversations e messages; especificar preflight, reconciliação, sequência de migration, rollback/recuperação e testes negativos antes da aplicação. Dados inválidos não são apagados nem mascarados. |
| **DH29-01** | DSH · core/goal · P0 | PENDENTE | Registrar objetivo original, critérios e IDs obrigatórios antes de delegar; recusar `complete` se algum ID estiver `PENDENTE`, `PARCIAL` ou `BLOQUEADO_EXTERNO`. Uma mudança de escopo aparece explicitamente ao usuário e não é inferida de uma síntese final. Demonstrar sessão com 20 IDs em que uma pendência impede conclusão. |
| **DH29-03** | DSH · sessão/evidência · P0 | PENDENTE | Capturar revisão ou fingerprint da árvore suja antes/depois e vincular cada check, subagente e artefato ao candidato observado; sinalizar divergência de árvore antes de declarar um resultado como evidência final. O manifesto permite reconstruir o conjunto sem expor segredos. |
| **DH29-06** | DSH · documentação/relato · P1 | PENDENTE | Gerar ou exigir uma matriz completa de IDs e critérios na entrega final: `CODE_DONE`, `LOCAL_VERIFIED`, `LIVE_VERIFIED`, `BLOCKED_EXTERNAL` e `ACCEPTED` aparecem separadamente. Relato que omite RA29-01/02 ou chama 319/321 de aceite integral é rejeitado no cenário de regressão. |

## F1 — Integridade e segurança no RICK

| ID | Dono e prioridade | Estado inicial | Entrega e aceite verificável |
|---|---|---|---|
| **RA29-03** | RICK · dados/backend · P0 | PARCIAL | Aplicar a migration `0008` primeiro em PostgreSQL descartável sobre estados válidos e inválidos inventariados; provar rejeição cross-tenant/workspace/collection/document/conversation, leitura/escrita válidas e recuperação. A execução em ambiente instalado exige D02; checksums e testes estáticos já passam, mas 68 testes live foram ignorados. |
| **RA29-04** | RICK · identidade · P0 | PARCIAL | Remover `password_plain` incondicional de `_seed_demo_users()` quando o verificador não for `PlainTestVerifier`; provar seed, login, criação e reset em modo efêmero e não efêmero, e ausência de senha reversível em stores persistentes. Atualizar a afirmação absoluta no relatório. |
| **RA29-05** | RICK · API/identidade · P0 | PARCIAL | Validar explicitamente o escopo do usuário alvo nas rotas administrativas e preservar a verificação atômica dos providers; cobrir PATCH, desativação e reset contra alvo de outro tenant/workspace nos providers in-memory e PostgreSQL. Resposta negativa segura, nenhuma mutação e nenhum evento de conclusão indevido. Prova externa depende de D02 quando aplicável. |

## F2 — Qualidade local e regressão

| ID | Dono e prioridade | Estado inicial | Entrega e aceite verificável |
|---|---|---|---|
| **RA29-06** | RICK · RAG/QA · P1 | PARCIAL | Preservar os thresholds do benchmark, demonstrar caso aprovado e casos sem fonte/cobertura reprovados; `api15-benchmark` e `api15-full` verdes no candidato final. Identificar e revisar o artefato gerado `docs/progress/phase-1.5-perf.json` antes de vinculá-lo à evidência. |
| **RA29-07** | RICK · Web/QA · P1 | PARCIAL | Reexecutar os 321 casos Playwright após o ajuste final em build/porta correspondentes; obter 321/321 nas larguras configuradas, sem erro de axe/timeout e com traces e capturas sanitizados. Os 2 casos tablet passaram isolados, mas a matriz final ainda não foi repetida. |
| **RA29-08** | RICK · worker/API · P1 | PENDENTE | Reproduzir ou classificar a intermitência `worker.ingestion.published`; corrigir a ordem/espera/publicação responsável, documentar limite e ordem dos eventos e provar execução isolada, repetida e paralela mais `api16-full` verde. |
| **RA29-09** | RICK · build/CI · P1 | PARCIAL | Manter gates raiz para Web, API e worker; introduzir falha representativa em cada superfície e mostrar que o comando raiz e a lane CI rejeitam o mesmo caso. Registrar os resultados da versão restaurada. |
| **RA29-10** | RICK · API/dependências · P2 | PENDENTE | Inventariar os 424 warnings observados, atualizar usos deprecados ou registrar dono/versão alvo para cada grupo; não usar filtro global para escondê-los; manter a suíte verde. |
| **RA29-11** | RICK · QA/toolchain · P2 | PENDENTE | Fixar thresholds de coverage por suíte, demonstrar que cobertura abaixo do limite falha, produzir relatório sanitizado e alinhar instalação Python local/CI com lock/hashes quando aplicável. Exclusões têm justificativa revisada. |
| **DH29-02** | DSH · subagent/session · P1 | PENDENTE | Solicitar resultados estruturados de cada subagente com escopo, arquivos, comandos, exit code, `PASS`/`FAIL`/`NOT_RUN`, artefato e limite. Reconciliar resultado do filho com a saída real; preservar falhas e skips no resumo do pai. Um filho que falha por import não é contado como verificado. |
| **DH29-04** | DSH · jobs/ferramentas · P2 | PENDENTE | Evitar polling repetido sem nova informação e registrar estado de job, último progresso e próxima espera; uma sessão longa não gera avisos de chamada idêntica nem perde a conclusão do job. Medir chamadas e tempo contra o comportamento observado. |
| **DH29-07** | DSH · contexto/ferramentas · P2 | PENDENTE | Retornar resumos limitados de logs e resultados grandes com caminho/ID para leitura seletiva, preservando erro, exit code e truncamento visível. Comparar tokens, novas leituras e qualidade do diagnóstico com o baseline; não ocultar informação necessária. |
| **DH29-08** | DSH · QA/avaliação · P1 | PENDENTE | Reproduzir uma tarefa longa com cinco filhos, matriz parcial, testes ignorados e decisão externa pendente; provar que o sistema entrega estado parcial, mantém a meta aberta ou bloqueada conforme regra aplicável, e não transforma escopo reduzido em “todas as melhorias”. |

## F3 — Reprodutibilidade, operação e Web do DSH

| ID | Dono e prioridade | Estado inicial | Entrega e aceite verificável |
|---|---|---|---|
| **RA29-12** | RICK · plataforma/CI · P2 | PARCIAL | Definir uma fonte realmente consumida ou um validador de drift para versões Qdrant/Redis em `toolchain.json`, Compose e CI. Um desvio intencional da workflow histórica `phase-0.6.yml` é documentado como exceção; um desvio não autorizado faz o check falhar. |
| **RA29-13** | RICK · CI/operações · P2 | PARCIAL | Scan estático rejeita Action não pinada por SHA; bootstrap MinIO não recebe credenciais root; secrets de staging e persistência efêmera do Jaeger têm comportamento e limites verificados. Demonstrar um caso inválido para pins e configuração. |
| **RA29-14** | RICK · operações/observabilidade · P1 | PENDENTE | Em laboratório identificado, provar readiness/shutdown da API e correlação de erro, fila, latência e trace entre API e worker; verificar entrega de alertas e SLO definidos. Preparação local antecede decisões operacionais; nenhuma prova local é chamada produção. |
| **RA29-15** | RICK · governança/release · P1 | PENDENTE | Substituir ambiguidade de `command=None` nas lanes obrigatórias por executor real ou processo humano com dono, formato, validade e origem. `triple-aaa-verify` rejeita ausência, stale e tampered. D07 é registrado antes de uma decisão final de autoridade. |
| **DH29-05** | DSH · host/Web/session · P1 | PENDENTE | Instrumentar ensaio de duas janelas com processo/PID, porta, instância, gateway, persistência de mensagens e fechamento. Provar a preferência já expressa pelo usuário: cada nova janela cria instância independente e fechá-la encerra apenas a sua instância. Reproduzir compactação longa separadamente. Corrigir falha observada antes de declarar esta área resolvida. |

## F4 e F5 — Runtime e resiliência no RICK

| ID | Dono e prioridade | Estado inicial | Entrega e aceite verificável |
|---|---|---|---|
| **RA29-16** | RICK · integração/RAG · P1 | BLOQUEADO_EXTERNO para execução | Exercitar upload → objeto → job → worker → índice → retrieval → evidence → resposta citada → histórico, incluindo acesso negado, fonte insuficiente, idempotência e isolamento. Preparar cenários herméticos agora; execução integrada requer D01–D04 pertinentes e versões/linhagem do mesmo candidato. |
| **RA29-17** | RICK · backend/operações · P1 | BLOQUEADO_EXTERNO para execução | Verificar outbox com sink indisponível, restart, concorrência, retry/backoff e dead-letter; provar estado visível da API e ausência de perda/duplicação silenciosa. Depende da integração RA29-16 e ambiente aplicável. |
| **RA29-18** | RICK · dados/operações · P1 | BLOQUEADO_EXTERNO para execução | Seed → backup → destruição controlada → restore → digests e permissões; medir RPO/RTO e registrar falhas/recuperação. Depende de RA29-16 e D01/D02/D05 pertinentes. |
| **RA29-19** | RICK · performance/operações · P1 | BLOQUEADO_EXTERNO para execução | Medir p50/p95/p99, throughput, primeiro token, memória e filas; executar chaos e soak com janela e carga autorizadas; comparar aos budgets D03/D05 e reabrir bloqueadores se houver corrupção/duplicação. Depende de RA29-18. |

## F6 — Revisão e encerramento

| ID | Dono e prioridade | Estado inicial | Entrega e aceite verificável |
|---|---|---|---|
| **RA29-20** | RICK · revisão independente/release · P0 | BLOQUEADO_EXTERNO para decisão | Reexecutar CI same-SHA, revisar evidências e as 26 áreas, conferir artefatos íntegros/não expirados e registrar Go/No-Go pela autoridade D07. Não há promoção automática por nota média; qualquer gate alto aberto impede aceite. |

## Ordem prática e dependências

Começar por RA29-01/02 e DH29-01/03/06. Corrigir RA29-04/05 enquanto o inventário de dados é concluído; RA29-03 só recebe aceite após a matriz PostgreSQL. RA29-07/08 e RA29-09…13 podem progredir em frentes isoladas; não compartilhar artefatos gerados por checks paralelos sem isolamento. DH29-02/04/07/08 entram antes da próxima implementação longa. DH29-05 tem ensaio próprio e não depende de corrigir o RICK. RA29-14/15 precedem RA29-16; RA29-16 precede RA29-17/18; RA29-18 precede RA29-19; RA29-20 encerra apenas após todas as provas necessárias e D07.

O registro canônico de status do RICK continua em `.agent/`, e as decisões D01–D07 devem ser consultadas antes de cada efeito externo. Para alterações no DSH, ler a arquitetura e as regras de ciclo de vida aplicáveis, escolher `solutionType` na política de customização e trabalhar a partir de `custom/main`. Este backlog conserva a fotografia da auditoria; resultados futuros entram nos registros dos projetos donos e em uma nova revisão auditável.
