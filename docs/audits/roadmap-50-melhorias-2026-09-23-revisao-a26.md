# Roadmap revisado após A26 — 2026-09-23

Esta é a revisão do [roadmap inicial](roadmap-50-melhorias-2026-09-23.md) após a [auditoria A26](auditoria-a26-resultado-2026-09-23.md) e a [nova auditoria do sistema](relatorio-sistema-2026-09-23-revisao-a26.md). Ela conserva os 50 IDs e os aceites do [backlog integral](backlog-50-melhorias-2026-09-23.md). Para status vivo e autoridade de edição, consultar [estado](../../.agent/state.json), [backlog operacional](../../.agent/backlog.json) e [ExecPlan](../../.agent/plans/deepseek-harness-aaa.md).

## Ponto de partida

`AAA-022:A26` concluiu seu escopo de três testes; o lote de 12 arquivos passou 341/341. `AAA-022` está `BLOCKED`, com `AAA-022:A27-AGGREGATE-SCOPE` como ação seguinte. `AAA-023` está `IN_PROGRESS`, aguardando `AAA-022`, mas sua descrição de espera ainda aponta para A16 concluída; corrigir esse ponteiro no controle operacional antes de usá-lo para decidir o candidato sucessor. `AAA-024` continua `TODO`. O grafo de módulos passa hoje, enquanto o medidor, a política global, o verificador de estado e seis gates de `doc-sync` ainda falham.

## Marcos revisados

| Marco | Escopo M01–M50 | Saída verificável e regra de passagem |
|---|---|---|
| R0 — decidir e sincronizar controle | A27; mapeamento M01–M50; M12 em ensaio | Registrar os cinco caminhos e 10 diagnósticos de tipos, inventariar 302 caminhos da política, atribuir owner proposto por delta e registrar decisão de autoridade para cada escopo futuro. Atualizar o ponteiro de espera de AAA-023 e tratar os 359 achados por classes, com transação e check de estado. Nenhuma mudança de código fora de escopo aprovado. |
| R1 — restaurar base verificável | M08, M09, M10, M22 | Concluir as ondas autorizadas de leitores e consumidores; fazer `audit:metrics` passar sem ignorar ausência real; manter `verify-module-graph` verde no candidato após imports finais. Separar tipos host e ownership do fork em lotes autorizados. Corrigir pela fonte o grafo de eventos e os catálogos de ferramentas, configuração e persistência, incluindo histórico de tipos; executar `doc-sync` completo. |
| R2 — proteger entradas e decisões | M01–M07 | Isolar segredos, preservar dados de Settings, encerrar Stop/continue conforme decisão e limitar leitura agregada; verificar casos negativos e atualizar owners documentais pareados. |
| R3 — fechar lifecycle e recursos | M16–M21, M32 | Exercitar sucesso, falha, cancelamento, corrida e descarte pertinentes; registrar decisão fundamentada para itens condicionais. |
| R4 — reduzir dívida medida | M23–M31 | Medir supressões, `any`, skips, cobertura, carga e desempenho por owner; cada regra nova tem disposição explícita e rejeita caso inválido sem relaxamento global. |
| R5 — consolidar documentação e UI local | M33–M41 | Revisar amostras bilíngues, navegação e informações operacionais; concluir simplificações locais com pares e apresentação atualizados. |
| R6 — dispor propostas condicionais | M42–M50 | Implementar somente com consumidor ou medição demonstrada; caso contrário registrar não aplicabilidade e gatilho de reabertura no backlog vivo. |
| R7 — integrar e qualificar | M11–M15; encerramento de M12 | Construir um sucessor limpo e imutável; vincular checks locais, plataformas, provedores e ensaio upstream ao mesmo commit; submeter o pacote à crítica independente. |

R2–R6 admitem mudanças independentes quando seus owners, formatos e gates não se sobrepõem. A evidência do candidato A28 não é herdada automaticamente pelo sucessor. Uma alteração de código, configuração ou documento que pertença ao pacote qualificado exige comparar o fingerprint e repetir os checks afetados.

## Sequência imediata detalhada

1. **A27, sem editar código:** consolidar a lista dos cinco testes com erro TypeScript e os 302 caminhos da política em artefato verificável. Classificar os 283 sem owner e os 19 com owners múltiplos. Propor conjuntos de caminhos exatos, solução e aceite, e registrar aprovação ou adiamento antes de abrir um gate de implementação.
2. **Transação operacional:** corrigir o alvo obsoleto A16 da ação `AAA-023:A38` e reconciliar a dependência de `AAA-022` com os registros de estado. Preservar histórico append-only, corrigir referências e validar o checker; contagem estável de 359 não é critério de saída.
3. **Se o escopo de tipos for autorizado:** corrigir somente os cinco testes donos dos 10 erros, depois executar `pnpm run doc-typecheck` completo. A aprovação do verificador isolado de blocos não substitui o build host.
4. **Se o escopo de ownership for autorizado:** atribuir exatamente um improvement owner a cada delta pertinente, conferir o `solutionType` e executar a política sobre a árvore completa; uma exclusão nova exige justificativa e aceite próprios.
5. **Retomar M08/M22 e M09:** fechar os leitores restantes e o medidor na árvore real; repetir testes, SDKs, snapshots, catálogos, docs e grafo conforme os owners afetados. O PASS atual do grafo de módulos só vale para a árvore atual. Diagnosticar a montagem do plugin-manager no gerador do tool catalog antes de regenerar; os demais artefatos gerados seguem seus geradores proprietários.
6. **Avançar R2–R6:** entregar uma frente completa por vez, com implementação, documentação e evidência; ao terminar, informar a próxima ação concreta.
7. **Selar R7:** criar candidato sucessor, executar matriz local proporcional e obter lanes externas e crítica final no mesmo commit. Sem esses sinais, manter veredito de release pendente.

## Critérios de atualização contínua

Após cada etapa, atualizar primeiro o documento owner e sua tradução, depois os artefatos gerados, o backlog operacional, os ledgers e o estado por transação válida. O [backlog revisado](backlog-50-melhorias-2026-09-23-revisao-a26.md) é um mapa de pendências nesta data, não um espelho de status vivo. O agente entrega em cada checkpoint o resultado, os checks realmente executados, o risco residual e a próxima etapa identificada por ID.
