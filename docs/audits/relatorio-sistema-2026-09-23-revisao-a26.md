# Nova auditoria do sistema após A26 — 2026-09-23

Este relatório atualiza a avaliação de [2026-09-23](relatorio-sistema-2026-09-23.md) com a [auditoria focada de A26](auditoria-a26-resultado-2026-09-23.md). A revisão inspeciona a árvore atual e as evidências registradas; não substitui a qualificação de candidato `AAA-023` nem a crítica final `AAA-024`.

## Resumo e veredito

**Nota indicativa: 77/100, média aritmética arredondada de quinze dimensões. Veredito para merge ou release: não aprovado.** A26 melhorou a evidência dos consumidores de Session no escopo local. O comando completo de tipos da documentação, a política de customização, o medidor canônico e a consistência dos registros operacionais continuam falhando. O grafo de módulos agora passa. Os resultados de plataforma, provedores com credenciais, atualização upstream e crítico final ainda não estão vinculados a um candidato sucessor.

## Método e alcance

Reexecutei o lote A26 de 12 arquivos, TypeScript e Oxlint por pacote, o diff dos três arquivos, `verify-module-graph`, `audit:metrics`, `doc-typecheck:contracts-ready`, `doc-typecheck` completo, `doc-sync`, a política de customização e o verificador de estado. Conferi hashes dos três testes alterados e dos cinco reservados à verificação. Para as demais dimensões, usei inspeção dirigida dos owners e evidências existentes; não repeti a matriz local completa, cobertura, build empacotado, E2E credenciado ou plataformas externas nesta revisão. A árvore `custom/main` contém trabalho amplo ainda não selado; a [identidade A28](../../.agent/evidence/AAA-023/candidate-identity-a68.json) é histórica para esse commit limpo.

## Notas por dimensão

| Dimensão | Nota | Evidência atual e limite |
|---|---:|---|
| Entradas de aplicação | 96 | Perfis `dsh` são a entrada suportada; nenhuma mudança A26 nessa superfície. |
| Persistência e formatos de Session | 86 | Migração de leitores e consumidores avança; AAA-022 segue bloqueada. |
| Eventos, efeitos e descarte | 88 | Contratos de lifecycle existentes permanecem; A26 exercitou eventos reais do store nos testes afetados. |
| Arquitetura e composição | 85 | `verify-module-graph` passou com três artefatos atuais; outras mudanças da árvore ainda exigem candidato sucessor. |
| APIs e consumidores | 82 | Três fixtures consumidores passaram a usar SessionStore e projeções reais; os demais contratos não foram requalificados globalmente. |
| Documentação e tradução | 78 | Blocos TypeScript e grafo de módulos passaram isoladamente; `doc-sync` registrou falhas de tipos host, grafo de eventos e catálogos. |
| Dependências e empacotamento | 86 | Instalação empacotada passou no candidato A28; a árvore atual difere dele. |
| Concorrência e recursos | 84 | Proteções existentes e checks locais; não houve nova rodada de carga ou plataformas. |
| Manutenibilidade e dívida estática | 60 | `audit:metrics` ainda falha ao abrir o caminho antigo de `ContextMeter.tsx`. |
| Testes unitários e confiabilidade | 82 | A26 repetiu 341/341 testes em 12 arquivos; houve aviso não fatal de listeners. |
| Cobertura, E2E e plataformas | 68 | Cobertura e E2E locais pertencem ao candidato anterior; faltam carriers e provedores requeridos. |
| Segurança e limites de confiança | 60 | A exposição documentada de senha de proxy a comandos model-authored segue sem correção comprovada. |
| CI e cadeia de fornecimento | 90 | Verificadores locais anteriores fortes; os sinais externos de um candidato sucessor permanecem ausentes. |
| Build, TypeScript e lint | 72 | Escopo A26 passou, mas o build host do `doc-typecheck` falhou em 10 erros de cinco testes. |
| Release e reprodutibilidade | 40 | Candidato A28 não contém todas as mudanças atuais; ensaio upstream teve 233 conflitos; AAA-024 não ocorreu. |

A média arredondada permanece 77 porque o avanço focado de A26 e do grafo não resolve as falhas de agregação. Uma nota numérica não converte um gate obrigatório vermelho em aceite de release.

## Achados atuais por urgência

| Prioridade | Achado | Próxima prova requerida |
|---|---|---|
| Alta | `M01`: credencial de proxy em variável herdada por shell model-authored | Corrigir transporte/isolamento e testar Bash, PowerShell e processos pertinentes com segredo sentinela. |
| Alta | `M08` e `M22`: AAA-022 permanece bloqueada após A26 | Dispor A27, concluir a migração restante e medir redução canônica por owner. |
| Alta | Build host de documentação: 10 erros em cinco testes | Corrigir os tipos no escopo exato aprovado e reexecutar `pnpm run doc-typecheck`. |
| Alta | `doc-sync`: seis gates ainda sem PASS após correção de referência local | Corrigir geradores/owners de grafo de eventos, tool catalog, config catalog e persistência; repetir checks afetados e agregado. |
| Alta | Política do fork: 302 diagnósticos | Atribuir 283 caminhos sem owner e desambiguar 19 com owners múltiplos, sem ocultar deltas. |
| Alta | `M09`: medidor canônico falha por caminho movido | Corrigir a origem da lista e verificar que um arquivo verdadeiramente ausente ainda falha. |
| Alta | `M11`–`M15`: candidato e evidências finais incompletos | Construir sucessor único após mudanças, resolver upstream, plataformas, provedores e crítica independente. |
| Média | Estado operacional: 359 achados e ponteiro de espera de AAA-023 ainda em A16 | Reparar registros e ponteiro por transação auditável; repetir o verificador até PASS antes de atestar conclusão. |
| Baixa | Aviso `MaxListenersExceededWarning` repetido em Vitest | Identificar o listener e seu owner em teste de carga reproduzível; não elevar limite global como correção. |

Os 359 achados incluem erros de referência, transição, enumeração, gate e reconciliação de registros; eles não são 359 defeitos independentes do produto. O número igual ao baseline A25 confirma estabilidade da contagem, não integridade do ledger. A contagem de 302 pertence à validação da política sobre a árvore ampla, e nenhum diagnóstico nomeou os três testes A26.

## Checks observados nesta revisão

| Check | Resultado |
|---|---|
| Vitest A26 | PASS: 12 arquivos, 341 testes; aviso de listeners não fatal. |
| TypeScript dos oito projetos A26; Oxlint do escopo; diff dos três testes | PASS. |
| `pnpm run verify-module-graph` | PASS: três artefatos atuais. |
| `pnpm run doc-typecheck:contracts-ready` | PASS: 84 blocos compilados. |
| `pnpm run doc-typecheck` | FAIL: 10 erros TypeScript host em cinco arquivos de teste. |
| `pnpm run doc-sync` | FAIL: 36 PASS, 7 FAIL na execução; a falha de package paths foi criada por este relatório, corrigida e revalidada isoladamente. Restam seis gates sem PASS agregado: doc-typecheck, doc graphs, tool catalog, config catalog, persistence catalog e persistence type history. |
| `pnpm run verify-package-paths` após correção | PASS: 5.180 arquivos verificados. |
| `pnpm run audit:metrics` | FAIL: `ENOENT` no caminho antigo de `ContextMeter.tsx` sob `ui-conversation/src/client/skeleton`. |
| `node scripts/verify-customization-policy.mjs --base master` | FAIL: 302 diagnósticos, 283 sem owner e 19 com múltiplos owners. |
| Verificador de estado do engineering-framework | FAIL: 359 achados, a mesma contagem da evidência A26. |

## Próxima etapa

O próximo ato do programa continua sendo `AAA-022:A27-AGGREGATE-SCOPE`: aprovar ou adiar um escopo exato para os cinco testes com 10 erros e classificar os 302 caminhos da política. A [nova rodada do roadmap](roadmap-50-melhorias-2026-09-23-revisao-a26.md) e do [backlog](backlog-50-melhorias-2026-09-23-revisao-a26.md) preserva os 50 IDs e separa essa decisão da implementação futura.
