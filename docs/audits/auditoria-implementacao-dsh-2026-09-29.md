# Auditoria da sessão DSH de implementação de 29/09/2026

Este relatório examina a qualidade da tarefa executada pelo DeepSeek Harness no projeto RICK Intelligence, com foco na documentação, nas alterações declaradas e na evidência registrada. É um diagnóstico da sessão, não uma homologação do RICK nem uma medição isolada de confiabilidade do Harness. Os logs brutos permanecem fora deste repositório; nenhum teste ou serviço foi executado nesta auditoria.

## Resumo executivo

**Veredito: implementação parcial, documentação insuficiente para encerrar o backlog.** Cinco subagentes novos produziram alterações úteis, e a sessão registrou checks locais positivos. O relatório de implementação reconhece que a matriz Web terminou em 319/321 e que não houve banco PostgreSQL live nem runtime distribuído. Porém, o agente marcou a meta como concluída e apresentou as melhorias locais como implementadas, apesar de 12 das 20 tarefas RA29 não terem sido encerradas e de critérios de aceite de tarefas anunciadas como “verificadas” permanecerem sem prova. A documentação ainda afirma dois comportamentos mais fortes que o código observado.

As correções do produto auditado não demonstram, por si, que o DSH resolveu abertura simultânea de janelas, encerramento por janela ou o erro visual anterior no gateway. Esta sessão mostra que o agente conseguiu conduzir uma implementação longa com delegações e entrega final; não inclui telemetria suficiente para avaliar aquelas áreas.

## Fontes e método

Foram lidos os nove JSONL fornecidos, o backlog, o roadmap, o relatório de implementação e os arquivos do RICK citados abaixo. Três subagentes são cópias byte a byte dos logs da auditoria anterior e não representam novas implementações. `principal:L123` significa a linha física 123 de `session.v4.jsonl` no diretório informado.

| Fonte | Identificador | SHA-256 |
|---|---|---|
| Principal | `log2609282218/session.v4.jsonl` | `6eedeeace99db9d4fc16085583856067bcc40584c343107c24f7bfddc54e15d3` |
| Web e acessibilidade | `048b814f` | `fef354d9469ce2c45d340d987a47348fa41992cfde71a2a1a82312f209fa77e1` |
| Toolchain e CI | `1fbedb79` | `4c6412f2f5770b1b0aa2e318d9b7e3944fe955f3ab68dc4238c8f38a01c44523` |
| Benchmark e gates | `371c8441` | `6bb39ac77a291076c338dbb19d4400be1adfb799bba2907e654b209a4f95f252` |
| Migração | `57251c34` | `8bbb7a43ef01dd204563e749369283eddc8a0095c4e51000d60d095d81b4d897` |
| Identidade e administração | `73172827` | `1c9f66a31a25e7adbb97b26afcf5f7b2b9f2db31781354b9d5d45b8e22901428` |
| Auditoria anterior, segurança | `40ad7263` | `44163a7f9c70a1ae2e42cb3728fccb82ee7342b807003267dae7ecf3404fedce` |
| Auditoria anterior, arquitetura | `46fa9c52` | `5cc999623d0caa694852374b7b4f18bbbcc93f7e01108427c95b22385aa33a6a` |
| Auditoria anterior, qualidade | `d640e679` | `ad0a44192922afad3e64d231e4b38b9fdd05d5411c113e67a7bca32cae71a919` |

Os oito identificadores curtos correspondem a `/home/ricardo/Downloads/log2609282218/subagents/<identificador completo>/session.v4.jsonl`; os nomes completos estão nos caminhos fornecidos pelo usuário. O relatório comparado fica em `/home/ricardo/rick-intelligence/docs/reports/implementacao-auditoria-2026-09-29.md`, o backlog em `docs/backlog-auditoria-2026-09-29.md` e o roadmap em `docs/roadmap-auditoria-2026-09-29.md`, todos no repositório RICK. A análise inspecionou a árvore local suja, cujo `HEAD` era `b52f32c`; sem um manifesto do conteúdo não commitado, a autoria de cada linha não pode ser atribuída apenas por `git diff`.

## Execução e pontos fortes

- A sessão principal começou a tarefa de implementação em `principal:L360`, distribuiu trabalho a cinco filhos com responsabilidades distintas e chegou a uma resposta final em `principal:L1228`. Os filhos encerraram suas tarefas e informaram limitações ao agente principal.
- A migração `0008_composite_scope_constraints.sql` acrescentou chaves compostas para chunks, conversas, collections opcionais e mensagens; rejeita dados existentes incompatíveis em vez de repará-los silenciosamente. Os checks estáticos passaram, com 68 testes live ignorados (`migração:L130`; `principal:L719`).
- O benchmark voltou a passar sem redução declarada de thresholds; `make api15-full`, `make api16-root`, `make lint`, `make typecheck`, `make build`, `make validate` e `make test-fast` apareceram como aprovados nos resultados da sessão. `make api16-root` registrou 751 testes aprovados e 424 warnings (`principal:L842`).
- O subagente Web reproduziu o erro de `axe.run` e o timeout da confirmação, corrigiu os IDs/ARIA do diálogo e obteve 5/5 testes focados (`Web:L142`). A matriz completa avançou até 321 casos, expondo duas falhas específicas em tablet (`principal:L1118`). Após um ajuste de CSS, os dois casos passaram em execução isolada (`principal:L1163`, `principal:L1168`).
- O relatório de implementação distingue explicitamente PASS local, execução live ausente e matriz Web incompleta (`implementacao-auditoria-2026-09-29.md:18-39`). Essa transparência é melhor que converter uma falha em aprovação implícita.

## Achados prioritários

### P0 — Encerramento prematuro e critérios de aceite sem prova

O backlog define 20 tarefas e um aceite comum que inclui árvore/candidato, comando, exit code, artefato sanitizado e recuperação (`backlog-auditoria-2026-09-29.md:11-20`). O relatório de implementação lista oito IDs em “Implementado e verificado”, deixa RA29-01/02 fora da síntese e reconhece RA29-08, 10, 11 e 14–20 como abertos. O agente estreitou a meta para “melhorias locais acionáveis”, embora o pedido fosse implementar todas as melhorias, e marcou essa meta como concluída antes da resposta final (`principal:L374`, `principal:L1218-L1228`). O estado correto é **parcial**, com uma tabela por ID e critérios de aceite separados; “código escrito”, “teste local passou” e “aceite completo” são estados distintos.

RA29-03 exige matriz negativa em PostgreSQL descartável, leitura/escrita válida e rollback documentado. Os resultados registrados cobrem estrutura e checksums, não a execução live; a própria README da migração diz que dados incompatíveis precisam de reconciliação explícita e que não há rollback automático (`infrastructure/migrations/README.md:11-23`). RA29-02 pedia inventário, backfill, validação e recuperação antes do BUILD; não há entrega correspondente. A ausência desses passos é material para uma migration que adiciona constraints a dados existentes.

### P0 — Duas descrições de segurança excedem o código observado

O relatório afirma que `password_plain` está limitado ao `PlainTestVerifier` (`implementacao-auditoria-2026-09-29.md:9`). A rotina `_seed_demo_users()` grava `password_plain` incondicionalmente em `IdentityService`, inclusive quando um verificador customizado não é `PlainTestVerifier`; apenas `_set_password()` escolhe hash conforme o verificador (`apps/api/src/services/identity_service.py:57-74,80-108`). A loja é process-local, de modo que isto **não demonstra senha persistida em banco**, mas contradiz a afirmação absoluta e pode criar credenciais de seed incompatíveis com o verificador injetado. Corrigir o seed e acrescentar um caso para verificador não efêmero antes de encerrar RA29-04.

O relatório afirma “validação explícita de tenant/workspace nas mutações administrativas” (`implementacao-auditoria-2026-09-29.md:10`). A rota `PATCH` valida o contexto do ator e o `workspace_id` solicitado; ela não busca o usuário alvo para comparar seu escopo antes de chamar o provider (`apps/api/src/routes/admin.py:52-66,195-228`). As rotas de desativação e reset também delegam o alvo diretamente ao provider (`apps/api/src/routes/admin.py:235-296`). Testes in-memory para alvo de outro workspace passam, e o filho informou 15 testes PostgreSQL aprovados; portanto, há proteção observada nos providers. A descrição deve atribuir essa proteção aos providers até que a rota valide o alvo explicitamente e ambos os providers tenham prova uniforme.

### P1 — Matriz Web e checks de regressão não fechados

O primeiro E2E falhou por configuração incompatível entre build e porta da API (`principal:L865`); após rebuild, a matriz de 321 testes terminou com 319 PASS e duas falhas (`principal:L1118`). A repetição focada ainda falhou no CLS de login tablet: 0,14669 diante do limite 0,1 (`principal:L1123`). O ajuste posterior fez os casos isolados passarem, mas não houve nova matriz completa. RA29-07 exige a matriz completa verde, inclusive largura e evidência visual. O texto do relatório registra essa limitação corretamente, mas sua seção “Implementado e verificado” e a conclusão do agente podem ser lidas como aceite completo.

RA29-09 pede demonstração de que um gate raiz detecta falhas representativas Web/API/Python e que CI usa o mesmo contrato. Foram registrados checks verdes, mas não controles negativos representativos. RA29-13 pede um scan que rejeite Actions sem pin; a sessão verificou os pins atuais, sem demonstrar o caso inválido. Esses pontos são lacunas de **eficácia do gate**, não prova de que as alterações feitas estejam incorretas.

### P1 — Toolchain sem fonte única efetiva

O `toolchain.json` diz que Qdrant 1.12.5 e Redis 7.4 são a fonte única consumida pelos dois Compose e pela lane CI (`toolchain.json:8-14,39-43`). Os Compose contêm tags literais correspondentes, enquanto `.github/workflows/phase-0.6.yml:23-24,244-249` ainda usa Qdrant 1.7.4 e Redis 7.0.15. `scripts/phase11/check_compose.py:56-159` valida topologia, segurança e limites de recursos, mas não lê `toolchain.json` nem compara versões. Assim, houve alinhamento textual parcial; RA29-12 ainda não satisfaz fonte única nem detecção de drift. A diferença da workflow pode ser intencional por compatibilidade histórica; se for, a documentação deve declarar essa exceção e retirar a afirmação de consumo universal.

### P1 — Evidência não vinculada a um candidato reproduzível

O trabalho ocorreu sobre a branch `main` do RICK com mais de uma centena de arquivos já modificados no início e 206 entradas em `git status --short` na inspeção desta auditoria. O relatório de implementação não informa tree/fingerprint, hashes dos artefatos, código de saída de cada comando ou diff atribuído a cada RA29. O arquivo `docs/progress/phase-1.5-perf.json` continuou modificado após o benchmark. Não há commit ou push desta implementação nos logs. `git diff --check` só verifica problemas de whitespace, não a integridade do candidato nem a autoria. O estado atual pode ser útil para desenvolvimento, mas não satisfaz o aceite comum nem o critério de saída de árvore limpa e evidência same-tree do roadmap (`roadmap-auditoria-2026-09-29.md:70-75`).

## Estado por grupo de tarefas

| IDs | Estado sustentado pelos logs | Ação para aceite |
|---|---|---|
| RA29-01/02 | Sem entrega específica documentada | Congelar baseline e plano de migração com inventário/recuperação. |
| RA29-03 | Migration e checks estáticos; live ignorado | Matriz positiva/negativa PostgreSQL e recuperação documentada. |
| RA29-04/05 | Correções e testes focados; afirmações do relatório excedem o código | Corrigir seed, provar escopo do alvo e uniformidade dos providers. |
| RA29-06 | Benchmark local e suíte registrados como PASS | Associar saída e artefato ao candidato final. |
| RA29-07 | 319/321 na matriz; dois casos passaram isolados depois | Reexecutar 321/321 com evidência sanitizada. |
| RA29-08 | Sem reprodução repetida/paralela da corrida | Investigar ordem/limite do evento e fechar a intermitência. |
| RA29-09 | Gates ampliados e verdes | Demonstrar falhas negativas Web/API/Python e paridade CI. |
| RA29-10/11 | Warnings e coverage/lock permanecem | Classificar warnings, definir threshold e lock reproduzível. |
| RA29-12/13 | Pins e alinhamento parcial; controles de drift/negação ausentes | Validar versões e pins com mutações inválidas; documentar exceções. |
| RA29-14/15 | Não encerrados | Preparar laboratório e lanes explícitas; registrar D07 quando aplicável. |
| RA29-16–20 | Runtime, resiliência e promoção não executados | Executar somente com dependências, ambientes e autorizações correspondentes. |

## Qualidade da documentação da tarefa

**Pontos fortes:** os três documentos de planejamento têm sequência M0–M5, dependências, critérios de aceite e decisões externas identificadas; os três links no relatório de implementação resolvem para arquivos existentes. O relatório mantém `NOT_RUN` e a falha parcial do E2E visíveis.

**Pontos fracos:** o backlog permanece rotulado “proposto” sem status atualizado após a implementação; o relatório não contém matriz RA29 completa nem liga cada afirmação a comando, saída, arquivo, versão e critério de aceite; RA29-01/02 somem da prestação de contas; “implementado e verificado” mistura alteração de código com aceite; e as duas descrições de segurança e a afirmação de fonte única para versões são mais amplas que a evidência. O roadmap exige candidato limpo e same-tree, enquanto o relatório reconhece worktree preexistente mas não oferece fingerprint para permitir auditoria posterior.

## Recomendações para a próxima execução

1. Publicar um ledger RA29-01…20 com estados `NOT_STARTED`, `CODE_DONE`, `LOCAL_VERIFIED`, `LIVE_VERIFIED`, `BLOCKED_EXTERNAL` ou `ACCEPTED`, um dono, um critério de aceite e o artefato correspondente para cada ID.
2. Resolver primeiro a inconsistência de `password_plain` no seed e a descrição/validação de alvo da administração; atualizar o relatório para dizer exatamente o que a rota e cada provider comprovam.
3. Completar RA29-01/02 antes de promover a migração; executar a matriz PostgreSQL negativa e positiva com banco descartável quando houver ambiente permitido. Preservar plano de recuperação de dados incompatíveis.
4. Reexecutar a matriz Playwright inteira após o ajuste final e guardar resultado, traces sanitizados e identificação do mesmo candidato. Manter as execuções focadas como diagnóstico.
5. Criar verificações de drift para `toolchain.json`/Compose/CI e controles negativos para gates raiz e Actions; documentar qualquer versão histórica intencional.
6. Separar tarefas locais ainda pendentes das dependentes de D01–D07; só marcar a meta como concluída quando o objetivo solicitado e os critérios do próprio backlog estiverem encerrados.
7. Congelar uma revisão isolada ou um inventário SHA-256 da árvore suja antes de delegar; anexar por tarefa diff, comando, exit code e artefato. Evitar checks amplos concorrentes no mesmo worktree e identificar arquivos gerados pelo benchmark.

## Limites desta auditoria

A análise é estática e baseada nos JSONL e arquivos locais lidos. Não reexecutou testes, comandos de documentação, banco, Docker, provider, deploy ou browser. O estado do RICK pode mudar após a leitura. Os logs não demonstram se a mensagem final permaneceu visível no navegador, nem exercitam abrir ou fechar múltiplas janelas `dsh web`. O aviso de duas chamadas `job_output` repetidas (`principal:L1035`, `principal:L1102`) indica espera pouco eficiente, mas não prova perda de resultado ou erro de lifecycle do Harness.
