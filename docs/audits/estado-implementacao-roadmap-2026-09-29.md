# Estado da implementação do roadmap de 29/09/2026

Este registro acompanha o [backlog](backlog-implementacao-pos-auditoria-2026-09-29.md) e o [roadmap](roadmap-implementacao-pos-auditoria-2026-09-29.md). A execução ocorreu no RICK Intelligence em `/home/ricardo/rick-intelligence` e em um worktree isolado do Harness em `/home/ricardo/deepseek-harness-impl-20260929`. A árvore RICK já estava suja antes desta execução; o estado canônico de release em `.agent/` permaneceu em andamento. Os resultados abaixo são provas locais por área, sem aceite global nem promoção.

Um snapshot RICK observado em `b52f32c141916a2ea3af1a6b913bd91f380606e0` registrou fingerprint da árvore suja `416d395d20767c60e91034aecc26589c70d16c217a75570025620a48cfa14535` e 2.888 entradas em `git status`; o manifesto sanitizado ficou em `.runtime/ra29-final-checkout.json` do RICK. A árvore continuou mudando depois desse registro, portanto ele não é um candidato congelado e não reatribui checks anteriores à mesma revisão. O Harness terminou em `custom/main`, com a revisão local também confirmada em `origin/custom/main`.

## Resultados verificados

| Área | Resultado e limite |
|---|---|
| Web RICK | Build de produção e matriz Playwright: **321/321**. O ajuste de altura da página de login em tablet substituiu o resultado anterior de 319/321. |
| API RICK | `make api-coverage`: **755/755**, um warning, cobertura de statements **75,67%**, piso de 75%. Um teste focado aprovado com 15,22% de cobertura fez o mesmo piso falhar, como esperado. O ambiente de testes é instalado por `requirements/test.lock` com hashes. |
| Migração RICK | PostgreSQL 16 em container descartável identificado: **115/115** no arquivo `test_migrate.py`, incluindo aplicação de `0008`, escrita válida, rejeição de referências cruzadas, rollback, histórico e escopo de usuário administrador. A `0008` passou a reconhecer a constraint única já validada pela `0004`, evitando duplicá-la. Nenhuma base instalada foi acessada. |
| Qualidade RICK | `make api15-full`, `make validate`, `make compose-static` e 26 testes focados de Compose, toolchain e Actions passaram. O benchmark local mantém cenários externos como `NOT_RUN`. |
| Harness | Validador separado de entrega por IDs e candidato: 7 testes; parsing de inicialização Web: 5 testes; `pnpm run doc-sync`: **44/44** na revisão final; política de customização, pares bilíngues, links Markdown e typecheck do hook de push passaram. Em ensaio real, dois processos Web obtiveram portas distintas e o segundo permaneceu acessível após encerrar o primeiro. O comando local instalado, que usa um wrapper fora do repositório, também encerrou a primeira instância quando seu processo Chrome terminou em display virtual; a segunda continuou respondendo HTTP 200. |

## Matriz de 28 itens

Os estados `LOCAL`, `PARCIAL` e `BLOQUEADO` descrevem apenas a evidência observada nesta execução. `LOCAL` não significa `ACCEPTED` do backlog: falta congelar um candidato único, revisar a diferença completa e cumprir os critérios externos onde exigidos.

| ID | Estado | Evidência ou pendência principal |
|---|---|---|
| RA29-01 | PARCIAL | Fingerprint da árvore suja capturado ao final; não havia fingerprint anterior que vinculasse todas as execuções ao mesmo candidato. |
| RA29-02 | LOCAL | Preflight SQL de quatro relações e procedimento de reconciliação/recuperação escritos; inventário da base instalada pendente. |
| RA29-03 | LOCAL | `0008` testada contra estados válidos e inválidos em PostgreSQL descartável; aplicação instalada pendente. |
| RA29-04 | LOCAL | Seed usa hash fora de `PlainTestVerifier`; teste de login/seed e suíte API passaram. |
| RA29-05 | LOCAL | Rotas exigem escopo do alvo antes de auditoria; providers verificam na mutação; testes em memória e PostgreSQL passaram. |
| RA29-06 | LOCAL | `api15-full` e benchmark local passaram; carga/provider externo não executados. |
| RA29-07 | LOCAL | Build final e 321 testes Playwright passaram. |
| RA29-08 | LOCAL | Espera do evento de worker ajustada; teste focado repetido e suíte API passaram. |
| RA29-09 | PARCIAL | Gates raiz existentes preservados; ainda falta demonstrar mutação negativa em Web, API e worker contra a mesma lane CI. |
| RA29-10 | PARCIAL | Lock reduziu o inventário observado a um warning de `starlette.testclient`; atualização upstream compatível com `httpx2` pendente. |
| RA29-11 | LOCAL | Lock com hashes, gate de 75%, relatório JSON e negativo de cobertura insuficiente passaram para a suíte API; demais suítes ainda sem pisos próprios. |
| RA29-12 | LOCAL | Validador de drift entre `toolchain.json`, Compose e CI, com exceção histórica explícita e testes negativos. |
| RA29-13 | LOCAL | Actions por SHA; checks de credenciais e Jaeger no Compose, com casos inválidos. Sem prova de operação em staging real. |
| RA29-14 | PARCIAL | Check local de observabilidade passou em componentes, mas o agregador permaneceu FAIL por performance/chaos/soak `NOT_RUN` e runtime distribuído bloqueado. |
| RA29-15 | PARCIAL | Autoridade humana para lanes sem executor está documentada; decisão D07 de promoção ainda não foi concedida. |
| RA29-16 | PARCIAL | 13 testes do contrato golden sintético passaram; fluxo ponta a ponta com serviços reais e corpus aprovado não foi executado, conforme a opção do usuário por dados sintéticos. |
| RA29-17 | PARCIAL | 24 testes sintéticos de outbox cobriram retry, backoff e dead-letter; ensaio integrado com sink indisponível, reinício e concorrência no ambiente final ainda depende de RA29-16. |
| RA29-18 | PARCIAL | Sete testes locais de backup/restore passaram; restauração destrutiva controlada, RPO/RTO e permissões em ambiente integrado não foram executados. |
| RA29-19 | PARCIAL | Benchmark hermético `api15-full` passou; capacity, chaos e soak integrados com budgets e janela autorizados não foram medidos. |
| RA29-20 | BLOQUEADO | `make triple-aaa-verify` saiu com erro e classificou o candidato como `DEVELOPMENT`, `promotion_allowed=false`; lanes obrigatórias falharam ou ficaram bloqueadas. Revisão independente same-SHA e D07 continuam pendentes. |
| DH29-01 | PARCIAL | Validador externo recusa conclusão com ID pendente; o serviço `goal` ainda não impõe esse requisito no runtime. |
| DH29-02 | PARCIAL | `scripts/audit-evidence` já valida relatórios estruturados e reconcilia conflitos entre filhos e revisor; ainda não comprova automaticamente que o comando/exit code declarados por cada filho correspondem ao Session log real. |
| DH29-03 | PARCIAL | Requisitos revisados e observações exigem o mesmo SHA-256; o validador rejeita a reescrita unilateral de todas as referências. Ele não mede a árvore sozinho nem vincula logs de subagentes. |
| DH29-04 | PARCIAL | `tool-jobs` já orienta a evitar busy-poll e oferece espera limitada; a sessão auditada ainda repetiu chamadas sem progresso. Não há bloqueio automático ou nova medição desse padrão. |
| DH29-05 | PARCIAL | Duas instâncias independentes e encerramento isolado passaram no código fonte; o wrapper instalado encerrou a instância quando o Chrome da janela terminou. Esse wrapper não está versionado no Harness; persistência de mensagens, compactação longa e adaptação portável ainda faltam. |
| DH29-06 | PARCIAL | Ferramenta separada rejeita IDs ausentes e aceite falso; entrega final do agente não a invoca automaticamente. |
| DH29-07 | PARCIAL | O perfil de leitura limitada tem benchmark sintético anterior com 41,3% menos tokens de entrada sem cache; tokens totais aumentaram 22,2%, e não houve replay completo da sessão auditada. |
| DH29-08 | PARCIAL | Casos sintéticos cobrem matriz de 20 IDs e aceite parcial; replay longo com cinco filhos permanece pendente. |

## Evidência e próximos bloqueios

O laboratório autorizado pelo usuário usou containers locais novos, dados sintéticos e remoção limitada aos recursos criados pelos fixtures. O usuário escolheu continuar apenas com dados sintéticos; provider pago, corpus real, base instalada, deploy e promoção não foram autorizados. As decisões D03/D04 não foram fornecidas para evidência real, e D05/D07 continuam necessárias para metas operacionais e release. O fechamento exige um candidato congelado, revisão independente e reexecução same-SHA dos checks relevantes; os resultados desta página conservam seus limites locais.
