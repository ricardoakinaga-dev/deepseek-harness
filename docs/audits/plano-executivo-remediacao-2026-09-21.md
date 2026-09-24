# Plano executivo de remediação — auditoria de 2026-09-21

Este plano é um artefato congelado do fork, escrito em português e excluído do pareamento bilíngue. Ele transforma o diagnóstico de [auditoria-profunda-2026-09-21.md](auditoria-profunda-2026-09-21.md) em um programa executável, mas não substitui o ExecPlan ativo nem o backlog canônico em `.agent/`.

## Resumo

O programa tem como objetivo levar o repositório de **63/100 e FAIL** para um candidato limpo, reproduzível e qualificável, com todos os 37 achados encerrados por evidência. A execução é dividida em nove marcos: recuperação do estado, bloqueadores imediatos, runtime e segurança, cadeia de fornecimento, arquitetura e publicação, testes e cobertura, documentação, dívida estática e qualificação final.

O trabalho começa pela recuperação das fontes operacionais já existentes em `.agent/`, não por criar um segundo plano vivo. Cada item desta proposta deve ser promovido para o backlog canônico com owner, estado, próxima ação e critério de aceitação. Decisões humanas que mudam identidade pública, topologia de segurança ou suporte do produto bloqueiam apenas a frente dependente; as demais frentes continuam.

## Conteúdo

1. [Resultado pretendido](#resultado-pretendido)
2. [Princípios de execução](#princípios-de-execução)
3. [Fontes de verdade](#fontes-de-verdade)
4. [Frentes executivas](#frentes-executivas)
5. [Portões de decisão humana](#portões-de-decisão-humana)
6. [Estratégia de verificação](#estratégia-de-verificação)
7. [Gestão de risco e recuperação](#gestão-de-risco-e-recuperação)
8. [Critérios de conclusão](#critérios-de-conclusão)
9. [Nota para desenvolvimento](#nota-para-desenvolvimento)

## Resultado pretendido

Ao final do programa, o candidato deve satisfazer simultaneamente estas condições:

1. Nenhum evento de fork alcança runner persistente e nenhum segredo de proxy é exposto a comandos produzidos pelo modelo.
2. `typecheck`, lint contratual, testes focados, testes documentais, `doc-sync`, grafos e verificadores de supply chain passam sem enfraquecimento de regra.
3. As falhas determinísticas do Plugin Manager e da limpeza de spill têm correção e regressão cobrindo erro, cancelamento e descarte.
4. Extensões dinâmicas, admissão de memória e fechamento de WebSocket têm semântica decidida, documentada e testada.
5. Ações, imagens, dependências, scanners, attestations, SBOM, timeouts e sinal de Windows formam uma cadeia de release reproduzível.
6. Domínios do cliente, exports publicados, identidade do fork e grafo de módulos seguem decisões explícitas e verificáveis.
7. Testes sensíveis à carga, skips, E2E e cobertura têm escopo e responsabilidade claros.
8. Documentação pública cumpre estrutura, contratos, ordem, terminologia, orçamento e política de i18n.
9. Dívida estática tem corpus canônico, owner e orçamento não crescente; as migrações prioritárias estão concluídas.
10. A qualificação final roda sobre commit imutável e árvore limpa, com relatório que relaciona cada `AUD-*` à evidência correspondente.

## Princípios de execução

- Corrigir a causa, não tornar o gate mais permissivo.
- Preservar mudanças preexistentes até identificar owner e intenção; nenhuma limpeza destrutiva é permitida.
- Trabalhar a partir de `custom/main` e respeitar `.agents/customization-policy.json`.
- Escolher exatamente um `solutionType` para cada mudança promovida, conforme `docs/customization/improvement-development-standard.md`.
- Atualizar consumidor, provider, definição de serviço, documentação e testes juntos quando uma capability seam mudar.
- Tratar alterações persistidas conforme os reconhecimentos e gerações de Session; nunca reescrever formatos lançados.
- Executar primeiro o menor conjunto de verificações que cobre a mudança; reservar a matriz ampla para o candidato selado.
- Manter separadas as evidências reproduzíveis, as observações manuais e as decisões humanas.
- Não publicar, fazer push, merge ou release sem autorização explícita.

## Fontes de verdade

| Informação | Fonte canônica |
|---|---|
| Estado do programa e próxima ação | `.agent/state.json` |
| Plano vivo e decisões da execução | `.agent/plans/deepseek-harness-aaa.md` ou sucessor formalmente ativado |
| Itens executáveis, owner, estado e aceitação | `.agent/backlog.json` |
| Evidência e tentativas | Ledgers em `.agent/` definidos pelo framework |
| Regras do repositório | `AGENTS.md`, `packages/AGENTS.md`, `docs/AGENTS.md` e documentos normativos vinculados |
| Diagnóstico congelado | `docs/audits/auditoria-profunda-2026-09-21.md` |
| Especificação congelada dos 37 itens | `docs/audits/backlog-remediacao-2026-09-21.md` |

Antes de editar código, o agente deve recuperar o estado na ordem: `.agent/state.json`, plano ativo, backlog, ledgers e working tree. A promoção desta proposta deve ocorrer numa única transação coerente, preservando IDs operacionais existentes e acrescentando o vínculo com `AUD-*`.

## Frentes executivas

### Frente 0 — recuperação e baseline reproduzível

Objetivo: separar trabalho preexistente, confirmar o candidato e tornar a evidência atribuível. Abrange `AUD-027` e estabelece a base para todos os demais itens. Entregas: inventário de mudanças por owner, commit ou checkpoint identificável, comandos e versões registrados, e promoção dos itens ao backlog canônico.

### Frente 1 — bloqueadores P0 e regressões determinísticas

Objetivo: remover riscos que impedem qualquer integração. Abrange `AUD-001`, `AUD-002`, `AUD-003`, `AUD-004`, `AUD-005`, `AUD-013` e `AUD-014`. Entregas: isolamento de runners, tratamento seguro de proxy, resultado correto do Plugin Manager, descarte de spill, gates de tipos e contratos verdes e documentação novamente qualificável.

### Frente 2 — segurança e lifecycle de runtime

Objetivo: explicitar e aplicar semântica segura nos caminhos dinâmicos e de alto consumo. Abrange `AUD-006`, `AUD-007` e `AUD-008`. Entregas: política de extensão, consentimento e CSP; admissão agregada de memória; fechamento físico observável do WebSocket; testes de erro, timeout, cancelamento e teardown.

### Frente 3 — CI, dependências e cadeia de fornecimento

Objetivo: tornar builds repetíveis e reduzir confiança em referências externas mutáveis. Abrange `AUD-009`, `AUD-010`, `AUD-019`, `AUD-022`, `AUD-024`, `AUD-025` e `AUD-026`. Entregas: ações por SHA, imagens por digest, idade mínima ativa, sinal de Windows no agregado, scanners, SBOM, attestations e timeouts.

### Frente 4 — arquitetura, contratos publicados e identidade

Objetivo: restaurar ownership e alinhar o que os pacotes prometem com o que publicam. Abrange `AUD-011`, `AUD-012`, `AUD-017`, `AUD-018` e `AUD-028`. Entregas: grafo de domínios verde, decisão de namespace/publicação, exports válidos, grafo documental atual e migração dos leitores síncronos.

### Frente 5 — confiabilidade, E2E e cobertura

Objetivo: converter o conjunto de testes em sinal determinístico e honesto. Abrange `AUD-016`, `AUD-020`, `AUD-021`, `AUD-022` e `AUD-023`. Entregas: concorrência e teardown estabilizados, testes negativos reativados, E2E condicionado corretamente, matriz de plataforma agregada e política de cobertura com corpus explícito.

### Frente 6 — documentação e onboarding

Objetivo: completar contratos públicos e restaurar consistência editorial e de navegação. Abrange `AUD-015`, `AUD-029`, `AUD-030`, `AUD-031`, `AUD-032`, `AUD-033`, `AUD-034`, `AUD-036` e `AUD-037`. Entregas: pré-requisitos claros, estrutura por tipo de documento, READMEs completos, ordem canônica, exceção de i18n documentada, orçamento reconciliado e prosa ativa limpa.

### Frente 7 — dívida estática governada

Objetivo: transformar contagens difusas em redução controlada. Abrange `AUD-028` e `AUD-035`. Entregas: métricas canônicas, distribuição por owner, limites não crescentes e ondas de migração verificadas. A frente não autoriza substituições mecânicas de `any`, non-null assertions ou supressões sem compreensão do limite correspondente.

### Frente 8 — qualificação final

Objetivo: demonstrar que o conjunto integrado atende à barra congelada. Entregas: árvore limpa, commit imutável, checks selecionados pelo procedimento de pre-push, matriz ampla justificada, reauditoria dos 37 itens e veredito final sem exceção tácita.

## Portões de decisão humana

| Decisão | Itens afetados | Opções que precisam ser escolhidas | Trabalho que pode continuar enquanto aguarda |
|---|---|---|---|
| Política de runners para contribuições externas | `AUD-001` | Somente hosted para forks; ou ambiente efêmero equivalente com controles demonstráveis | Todos os itens fora de CI de fork |
| Transporte de credenciais de proxy | `AUD-002` | Credencial fora do ambiente do subprocesso; broker dedicado; ou outra solução com não propagação demonstrada | Correções de Plugin Manager, spill e gates |
| Modelo de extensões dinâmicas | `AUD-006` | Superfícies suportadas, opt-in, consentimento, CSP e defaults | Supply chain, testes e documentação independente |
| Admissão da ponte HTTP/RPC | `AUD-007` | Orçamento agregado, fila/backpressure e comportamento de rejeição | Fechamento WebSocket e demais runtimes |
| Semântica de `close()` | `AUD-008` | Aguardar fechamento físico; ou separar APIs lógica e física com nomes distintos | Demais frentes |
| Ownership do domínio do cliente | `AUD-011`, `AUD-018` | Domínio proprietário e localização da API documental compartilhada | Itens não dependentes do grafo |
| Identidade de publicação e política de fonte | `AUD-012`, `AUD-017` | Não publicar; namespace próprio; ou autorização upstream, além de publicar ou retirar `src` | Correções internas e documentação não vinculada |

O agente deve apresentar um único pacote de decisão com recomendação, impactos, reversibilidade e arquivos afetados. A ausência de uma decisão não justifica escolher silenciosamente uma política pública ou de segurança.

## Estratégia de verificação

### Camada 1 — checks por alteração

Cada mudança roda testes unitários e verificadores diretamente relacionados, incluindo ao menos um caso inválido que demonstre o gate ou comportamento reparado. Mudanças de lifecycle incluem sucesso, erro, cancelamento e descarte. Mudanças de concorrência incluem interleavings e teardown. Mudanças de workflow incluem teste estático do YAML ou do modelo intermediário.

### Camada 2 — checks por frente

Ao concluir uma frente, rodar os agregados proporcionais: contratos e TypeScript para scripts; suites dos pacotes para runtime; `test:docs` e `doc-sync` para documentação; constraints, hygiene e scanners para supply chain; snapshots e SDKs quando houver alteração model-visible ou de loop.

### Camada 3 — candidato integrado

Somente depois de integrar todas as frentes e selar árvore limpa, executar a matriz ampla necessária para release. A seleção concreta deve seguir `.agents/skills/dsh-pre-push-checks/SKILL.md`; a auditoria não autoriza afirmar que um comando passou sem executá-lo. Sinais externos, como Windows e E2E com chave, devem ser vinculados ao mesmo commit.

### Matriz mínima por categoria

| Categoria | Evidência mínima |
|---|---|
| Segurança de fork e supply chain | Verificadores estáticos, fixture negativa, ação ou imagem fixada e job agregado verde |
| Proxy e segredos | Teste que inspeciona ambiente, argumentos e logs e comprova ausência do segredo |
| Lifecycle | Testes de sucesso, falha, abort, timeout e descarte sem listener ou handle residual |
| Arquitetura | Grafos verde, imports esperados, documentação regenerada e consumer smoke |
| Publicação | Conteúdo real do tarball ou wheel, metadados e instalação por consumidor externo |
| Testes e cobertura | Repetição concorrente, skips justificados e relatório de corpus explícito |
| Documentação | `test:docs`, `doc-sync`, links, orçamento, pairing e JSDoc aplicáveis |
| Release | Commit imutável, árvore limpa, checks vinculados ao SHA e relatório final |

## Gestão de risco e recuperação

O programa deve ser retomável após interrupção. Toda ação longa registra tentativa, comando, resultado e artefato no ledger apropriado; o backlog registra somente o resumo operacional e a próxima ação. Se uma abordagem falhar, o agente atualiza a hipótese antes de repetir. Três falhas consecutivas pela mesma causa exigem replanejamento ou escalada, não repetição automática.

Mudanças em workflows, publicação, formatos persistidos, segurança de extensões e políticas de dependência têm blast radius alto e devem ser entregues em fatias reversíveis. O agente preserva checkpoints antes de rebase ou integração, não altera notas arquivadas e não apaga trabalho de terceiros para obter árvore limpa.

## Critérios de conclusão

O programa só está concluído quando:

1. Todos os itens `REM-001` a `REM-037` do backlog de remediação estão promovidos e encerrados na fonte canônica com evidência.
2. Cada item aponta para teste, gate, inspeção reproduzível ou decisão humana registrada.
3. Nenhum P0 ou P1 permanece aceito por silêncio; uma exceção só existe com owner, prazo, justificativa e aprovação explícita.
4. Não há regressão de formatos de Session, SDKs, snapshots, i18n, entrypoints ou invariantes de pacote.
5. A árvore final está limpa e o SHA qualificado é o mesmo avaliado por CI e pela reauditoria.
6. O relatório final recalcula as 15 notas e explica qualquer valor abaixo de 90.
7. O veredito final é `PASS` ou `CONDITIONAL PASS` com condições externas explícitas; `FAIL` não encerra o objetivo.

## Nota para desenvolvimento

Este documento define direção e qualidade, não status. O roteiro detalhado está em [roadmap-remediacao-2026-09-21.md](roadmap-remediacao-2026-09-21.md), e os critérios atômicos estão em [backlog-remediacao-2026-09-21.md](backlog-remediacao-2026-09-21.md). Qualquer divergência descoberta durante implementação deve ser registrada primeiro no plano vivo e refletida aqui apenas numa nova auditoria datada.
