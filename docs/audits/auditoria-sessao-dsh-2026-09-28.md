# Auditoria da sessão DSH de 2026-09-28

Este relatório examina a sessão principal e três subagentes que auditaram `/home/ricardo/rick-intelligence` em 2026-09-28, horário de São Paulo. Ele avalia o comportamento observado do DeepSeek Harness e a confiabilidade da auditoria produzida. Os logs demonstram uma execução concluída, mas não exercitam todas as melhorias do Harness. Esta análise leu os arquivos e o schema citado; não reexecutou testes, iniciou serviços nem alterou o projeto auditado.

## Resumo executivo

**Veredito: resultado parcial.** O Harness concluiu a sessão principal, três delegações e a entrega de um relatório; as falhas dos checks foram registradas sem promover o projeto auditado. A comparação publicada de 79 para 80 pontos não demonstra melhoria: a tabela anterior soma 2.185 pontos e tem média 84,04, embora seu texto declare 2.049 pontos e média 79. A tabela nova soma corretamente 2.076 pontos e tem média 79,85. O estado não commitado do projeto e a diferença de método entre as auditorias impedem atribuir a variação a uma mudança específica.

Os quatro JSONL não incluem diagnóstico de inicialização Web, telemetria do navegador, ciclo de vida de janelas ou evento de compaction. Eles não validam as correções dessas áreas.

## Fontes e método

Os caminhos abaixo são locais e externos a este repositório. Os hashes SHA-256 identificam os arquivos examinados caso sejam movidos ou substituídos; os logs brutos não foram copiados para `docs/`.

| Fonte | Caminho | SHA-256 |
|---|---|---|
| Sessão principal | `/home/ricardo/Downloads/log260928/session.v4.jsonl` | `d822ce0ab815401c335db22da27ff78a108aa8a9248867c8684548855ed463c4` |
| Segurança e dados | `/home/ricardo/Downloads/log260928/subagents/40ad7263-0cff-4765-b921-5013cc14a064/session.v4.jsonl` | `44163a7f9c70a1ae2e42cb3728fccb82ee7342b807003267dae7ecf3404fedce` |
| Arquitetura e operação | `/home/ricardo/Downloads/log260928/subagents/46fa9c52-395c-4eff-afa8-82a50c28dbc4/session.v4.jsonl` | `5cc999623d0caa694852374b7b4f18bbbcc93f7e01108427c95b22385aa33a6a` |
| Qualidade e testes | `/home/ricardo/Downloads/log260928/subagents/d640e679-a8d9-4ffb-bfb4-feee12899a56/session.v4.jsonl` | `ad0a44192922afad3e64d231e4b38b9fdd05d5411c113e67a7bca32cae71a919` |

O relatório comparado de 27/09 está em `/home/ricardo/rick-intelligence/docs/reports/relatorio-auditoria-geral-2026-09-27.md`, SHA-256 `26aec7470c4177b89c8094381c6d8028600056a801fc4d1fac5c1928dd337132`. O relatório produzido nesta sessão está em `/home/ricardo/rick-intelligence/docs/reports/relatorio-auditoria-geral-2026-09-29.md`, SHA-256 `4c49ffbf06665f27de199f59de14ae2ee96286313ec051213db3359de7634399`.

O método foi analisar cada linha JSON, conferir sequência de eventos, pareamento de chamadas e resultados, estados de conclusão, uso registrado, comandos e respectivas saídas, mensagens dos subagentes e aritmética das 26 notas de cada relatório. As referências `principal:L131` e `segurança:L33`, por exemplo, usam a numeração física de linhas dos JSONL acima.

## Integridade e execução

| Indicador | Resultado observado |
|---|---:|
| Registros JSON válidos | 625/625 |
| Etapas com início e fim | 77/77 |
| Chamadas de ferramenta com resultado | 148/148 |
| Subagentes iniciados e concluídos | 3/3 |
| Turnos encerrados com `completed` | 5/5, incluindo o cumprimento inicial |
| Duração do pedido de auditoria | Aproximadamente 10 minutos e 58 segundos |
| Tokens totais registrados | 3.213.164, dos quais 2.873.856 são `cacheReadTokens` |

Cada arquivo tem `seq` contínuo, chamadas de ferramenta únicas com resultado correspondente, e contagens iguais de `step/start`/`step/end` e `turn/start`/`turn/end`. Os três filhos possuem `parentSession` correspondente à sessão principal. O principal criou a meta, acompanhou tarefas e apresentou o relatório antes de terminar (`principal:L36`, `principal:L245`, `principal:L251`, `principal:L259`). Esses fatos sustentam estabilidade desta execução, não disponibilidade geral do serviço.

Os subagentes trabalharam em arquitetura/operação, segurança/dados e qualidade/testes. Suas mensagens foram entregues ao pai; as três sessões terminaram normalmente. O filho de segurança tentou duas delegações adicionais e recebeu `subagent depth 2 exceeds maxDepth 1` (`segurança:L31-L34`). A proteção de profundidade funcionou e o filho continuou, mas o planejamento fez duas chamadas que já eram incompatíveis com o limite.

## Qualidade das verificações

O agente principal registrou `make validate`, `make test-fast`, `make lint`, `make typecheck` e `make compose-static ops-static` com resultados positivos. `make api15-full` chegou a 751 testes de API aprovados, mas terminou com falha no benchmark `benchmark fixture did not produce approved evidence` (`principal:L131-L137`). A repetição direta do benchmark voltou a falhar (`principal:L179-L180`).

`make api16-full` registrou 281 testes aprovados e 5 ignorados no pacote Knowledge, 116 aprovados no Worker e 750 aprovados com uma falha na API; a falha ocorreu em `test_root_ingestion_publishes_only_bounded_worker_events` (`principal:L138-L142`). A repetição isolada desse teste passou (`principal:L177-L178`). Isso demonstra variabilidade observada, mas não identifica sua causa. O subagente de qualidade executou `make api16-root` e relatou 751 aprovados; houve, portanto, verificação sobreposta entre agentes. Os resultados positivos de uma execução não anulam a falha da outra.

`make web-validate` aprovou lint, typecheck e build, mas a matriz Playwright de 321 casos apresentou `axe.run arguments are invalid` e timeout de confirmação/teclado (`principal:L143-L144`, `principal:L189-L190`). O principal cancelou o job; a resposta posterior confirmou `killed`, sinal `SIGTERM`, após saída até o caso 131 (`principal:L219-L225`). O relatório tratou a matriz como inconclusiva, em vez de atribuir aprovação aos 321 casos.

O subagente de segurança não conseguiu executar seus testes focados: o primeiro interpretador não tinha `pytest` e a segunda tentativa não resolveu os imports necessários (`segurança:L99-L105`). O relatório consolidado não distingue claramente essa verificação focada indisponível das suítes amplas executadas por outros agentes. Também houve uma tentativa inicial do subagente de qualidade com `python` ausente; ele corrigiu para `python3` e prosseguiu (`qualidade:L65-L80`). O preflight de interpretador, dependências e ambiente precisa ocorrer antes de distribuir comandos.

Alguns resultados `bash` que continham `[exit code: 1]` ou `[exit code: 2]` tinham `message.isError: false`, inclusive o benchmark. O agente leu os códigos de saída e classificou as falhas corretamente; uma consolidação automatizada que leia somente `isError` não terá o mesmo resultado (`principal:L137`, `principal:L180`). Isso é uma observação sobre a representação do resultado, não prova isolada de defeito no contrato da ferramenta.

## Comparação das notas

| Medida | Relatório de 27/09 | Relatório de 29/09 |
|---|---:|---:|
| Nota geral publicada | 79 | 80 |
| Soma publicada das 26 notas | 2.049 | 2.076 |
| Soma recalculada das 26 linhas da tabela | 2.185 | 2.076 |
| Média recalculada | 84,04 | 79,85 |

Das 26 áreas, 21 notas da tabela nova são menores que as da tabela anterior, 5 são iguais e nenhuma é maior. A diferença de médias tabulares é −4,19 pontos. A nota anterior de 79 e seu total de 2.049 não correspondem à sua tabela (`relatorio-auditoria-geral-2026-09-27.md:5,16,24-49`); a nota nova corresponde à sua tabela (`relatorio-auditoria-geral-2026-09-29.md:9,31-56`). O aparente avanço de um ponto resulta de comparar uma nota anterior inconsistente com uma nota nova aritmeticamente correta.

Essas médias ainda não medem causalidade. O relatório antigo se baseou principalmente em inspeção estática; o novo executou checks que expuseram benchmark e E2E incompletos. Ambos mencionam o mesmo `HEAD` `b52f32c141916a2ea3af1a6b913bd91f380606e0`, mas o worktree estava sujo e não foi registrado um manifesto de hashes do conteúdo não commitado. Uma queda de nota pode refletir melhor detecção, mudanças no worktree ou critérios diferentes.

## Achados e limites da própria auditoria

1. **Alta prioridade — comparação inválida.** Corrigir a aritmética histórica antes de usar a série 79→80 como indicador de melhoria. Gerar total e média a partir das notas da tabela, e publicar uma errata sem apagar o registro anterior.
2. **Alta prioridade — revisão insuficiente da síntese.** Os três filhos auditam escopos distintos; não há evento de uma revisão nova que confira integralmente o relatório consolidado, as 26 notas e os achados conflitantes. As mensagens são em prosa livre, sem registros de evidência com status e revisão congelada.
3. **Média prioridade — verificações sobrepostas e ambiente não validado.** O principal e os filhos executaram checks amplos parcialmente duplicados. Um filho não conseguiu iniciar seus testes focados, mas a síntese não preservou essa ausência como resultado próprio.
4. **Média prioridade — estado não reproduzível.** `make validate` avisou `worktree=DIRTY`; não há inventário antes/depois dos arquivos afetados por build e E2E (`principal:L119`). `git diff --check` verificou whitespace, mas não demonstra que apenas o relatório foi criado.
5. **Média prioridade — volume de leitura.** As respostas das ferramentas somam aproximadamente 778 mil caracteres. Algumas leituras individuais excedem 20 mil caracteres. Limitar a saída e aprofundar por trechos relevantes melhora custo e verificabilidade.

O relatório final do RICK Intelligence encontrou um gap estático de integridade: `rick_chunks` e `rick_ingestion_jobs` têm referências independentes a documento e escopo, e `rick_messages` referencia a conversa sem uma FK composta que force igualdade dos campos de escopo. O schema consultado em `infrastructure/migrations/0002_product_schema.sql:115-201` sustenta a possibilidade de dados inconsistentes no banco. Isso não prova exploração ativa nem estabelece sozinho a severidade operacional. O benchmark, o E2E parcial e a ausência de runtime distribuído também permanecem resultados do projeto auditado, não defeitos demonstrados no Harness.

## Cobertura das melhorias do Harness

| Área | Estado nesta amostra | Limite |
|---|---|---|
| Continuidade da sessão e subagentes | Evidência positiva | Uma execução concluída não prova ausência de falhas futuras. |
| Gateway e modelo | Evidência parcial | Há respostas e artefato final, mas não há diagnóstico do transporte nem observação de persistência da mensagem no navegador. |
| Compaction resiliente | Não exercitada | Não há evento de compaction; a maior entrada de modelo observada foi de cerca de 67 mil tokens diante de uma janela registrada de 272 mil. |
| Múltiplas janelas e encerramento por janela | Não avaliada | Os JSONL não registram PID, porta, abertura ou fechamento das janelas. |
| Qualidade comparável das auditorias | Não estabelecida | A nota histórica tem erro aritmético e o estado não commitado não foi congelado. |

## Informações a coletar antes de implementar melhorias

1. Preservar estes quatro JSONL e os dois relatórios comparados com seus hashes; registrar se algum arquivo mudar de lugar.
2. Produzir uma errata da aritmética de 27/09 e definir uma rubrica estável, com cálculo automático das 26 notas e indicação das evidências que justificam cada alteração.
3. Na próxima auditoria, congelar `HEAD`, caminhos e hashes das alterações não commitadas, atribuir cada check pesado a um agente e guardar comando, ambiente, código de saída e artefatos gerados.
4. Exigir relatórios estruturados dos subagentes com achados, escopo, status `PASS`/`FAIL`/`NOT_RUN`, evidência e limitações; obter revisão independente da síntese e reconciliar contradições antes da nota final.
5. Para testar as correções Web, coletar logs de startup e gateway, PID/porta por janela, término do servidor após fechar a janela e evidência de navegador para mensagens que aparecem e somem. Para compaction, coletar uma sessão longa que de fato acione o mecanismo.

**Conclusão:** houve resultado operacional nesta sessão e a auditoria identificou falhas úteis. As correções de Web, gateway e compaction seguem sem comprovação pelos quatro arquivos. A série de notas precisa de correção antes de orientar uma implementação por suposta evolução de 79 para 80.
