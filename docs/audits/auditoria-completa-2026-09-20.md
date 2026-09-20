# Auditoria completa — fork `deepseek-harness`

Relatório de auditoria independente do fork, produzido em 2026-09-20 sobre `custom/main` (base upstream na release `dsh-0.1.6-alpha.2`, +2 commits de customização). Este documento é um artefato de fork, em português, excluído do pareamento bilíngue; não descreve comportamento do produto upstream.

## 1. Escopo e confiabilidade da evidência

Método: inspeção direta do repositório, execução local dos gates indicados e verificação adversarial por crítico independente em contexto limpo (nível de independência I1 — mesma família de modelo, sem herdar o raciocínio do auditor).

Rótulos usados neste relatório: **EXECUTADO** (comando rodou nesta máquina, com exit code e saída citados); **INSPECIONADO** (lido no disco, sem execução); **INFERIDO** (julgamento de engenharia, não verificável mecanicamente); **NÃO EXECUTADO** (o gate existe, mas não rodou aqui — não conta como evidência).

Executado: `build:lib` (exit 0), `publint` (exit 0 após build completo), `hygiene` (15 pass / 1 fail), `constraints` (falha reproduzida), `lint` (exit 0), `test:docs` (20/20), `duplication` (0 clones), `verify-md-links` (1.535 arquivos), `verify-doc-budgets` (8/8), `vitest` focado em `core/agent-loop` + `core/session` (40 arquivos, 923 testes, 17,6s).

Não executado: `test:coverage`, `doc-sync`, `test:e2e`, `test:web`, `test:snapshot`, `test:bench`, `check:windows-wine`. Nenhuma nota abaixo presume esses resultados.

## 2. Estado do repositório

Fork com governança própria: `.agents/customization-policy.json`, `docs/customization/` (política, topologia de branches, procedimento de update), 2 commits de customização sobre o espelho upstream. Árvore limpa; `custom/main` = `origin/custom/main`; `master` espelha upstream.

Pacotes: 293 (era 267 em `0.1.5-alpha.1`). Apps: 4. Vendors: 9. Workflows: 21. Cenários `snapshot.yml`: 189. Agent Notes em inglês: 1.108.

Código: 5.968 arquivos `.ts`; 1.762 em `src/`; 313.938 linhas de produção contra 362.810 linhas de teste (mais teste que código); 1.546 specs.

Dívida declarada: 81 linhas `TODO/FIXME/XXX`, 66 linhas com `any`, 0 `@ts-*` em `src/`, 205 `oxlint-disable` (189 `next-line`).

## 3. Notas 0–100

| # | Dimensão | Nota | Base |
|---|---|---|---|
| 1 | Arquitetura (Cordis, capability seams, composição) | 92 | INSPECIONADO |
| 2 | Documentação (tiers, um-dono-por-fato, budgets) | 94 | EXECUTADO (`test:docs` 20/20) |
| 3 | Integridade de links e cross-references | 96 | EXECUTADO (1.535 arquivos, 0 mortos) |
| 4 | Paridade bilíngue EN/ZH | 90 | EXECUTADO + manifesto de pairing |
| 5 | Tipos (rigor do TypeScript) | 90 | EXECUTADO (`typecheck`/`lint` exit 0; 0 `@ts-` em src) |
| 6 | Lint e regras estáticas | 82 | EXECUTADO + INSPECIONADO (205 supressões; `correctness: off`) |
| 7 | Testes (volume, política, composição real) | 93 | EXECUTADO parcial (923 testes) |
| 8 | Cobertura 100%/arquivo (gate de CI) | 78 | NÃO EXECUTADO |
| 9 | Gates/CI e automação de verificação | 88 | EXECUTADO (`hygiene` 15/16) |
| 10 | Duplicação de código | 99 | EXECUTADO (0 clones / 1.663 arquivos / 1,86M tokens) |
| 11 | Higiene do worktree e artefatos | 72 | EXECUTADO (`constraints` vermelho; resíduo) |
| 12 | Supply chain, catálogos e dependências | 76 | EXECUTADO + INSPECIONADO (dependência fantasma) |
| 13 | Segurança (sandbox, approval, credenciais) | 86 | INSPECIONADO (sem pentest independente) |
| 14 | Performance e benchmarks | 84 | NÃO EXECUTADO |
| 15 | Governança (Agent Notes, postmortems, PRs) | 82 | INSPECIONADO (1.108 notas = custo alto) |
| 16 | DX / loops de feedback | 78 | EXECUTADO (build antes de publint/lint/typecheck) |
| 17 | Conformidade com a política de fork | 90 | EXECUTADO (`custom/main` limpo, 2 commits) |
| | **Composição (média das 17)** | **86/100** | Intrínseco ao código ≈ 91; ambiente/artefatos puxam para 86 |

## 4. Pontos fortes

1. Arquitetura de seams madura. Service Definition / Provider / Consumer tratados como unidade; trocar um provider move Bash, PTY e LSP juntos. A tabela de "onde vai comportamento novo" em `docs/architecture.md:137` é executável.
2. Invariante central forte — model-visible ⟺ logged — com migração de formato por gerações numeradas e sem sobrescrita destrutiva (`docs/architecture.md:115-121`).
3. Zero duplicação medida: 0 clones em 1.663 arquivos e 360.153 linhas (`pnpm run duplication`, EXECUTADO).
4. Documentação com mecanismo, não prosa: `test:docs` 20/20, 1.535 arquivos com links válidos, budgets por arquivo, `verify-md-wrap`, `verify-type-equiv` e catálogos gerados com freshness-gate.
5. Testes com composição real obrigatória, HMR-safety por registry e 362.810 linhas de teste contra 313.938 de produção; 189 cenários de snapshot.
6. Rigor de tipos incomum: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`; 0 `@ts-*` em `src/`.
7. Disciplina de cancelamento: 1.053 usos de `AbortSignal`, 123 `AbortController`; 307 `ctx.effect(` contra 260 `ctx.on(` (registros como efeitos).
8. Segurança por padrão: nenhum `shell: true` em `packages/**`; denylist de variáveis de ambiente no boot (`app-boot/src/index.ts:118-145`, incluindo `NODE_TLS_REJECT_UNAUTHORIZED`, `GIT_SSH_COMMAND` e proxies); `credentials-local` alerta arquivo legível além do dono; SSH com `rejectUnauthorized: true`; subagent Codex com default `never` para bypass.
9. Código gerado é gated: `api-catalog.ts` (506 KB) e `slot-catalog.ts` (168 KB) são gerados e verificados por `verify-cordis-catalog` / `verify-client-catalog`.
10. Governança de fork limpa: política declarada, topologia upstream-safe, 2 commits de customização, espelho `master` intacto.
11. Gates testados: 81 specs em `scripts/`; o gate `constraints` pegou um defeito real do ambiente.
12. Dependências da raiz: 0 de runtime, 38 de desenvolvimento — excelente isolamento de ferramental.

## 5. Pontos fracos

1. Resíduo de build quebra gate: 4 diretórios contêm apenas `lib/`, `node_modules/` e `.tsbuildinfo` de pacotes retirados ou renomeados upstream; `git status` fica limpo (gitignored), mas `constraints` falha ao varrer o filesystem.
2. Caminho morto em CI de aprovação ponderada: `blame-production.py:22` classifica como produção o caminho removido `experimental/code-runtime-python/py/` sob `packages/`; o pacote vivo é `ptc-runtime-python/py/`. Alterações no Python renomeado deixam de contar no placar de aprovação.
3. Dependência fantasma no catálogo publicado: `@deepseek-ai/dsh-workflow-worker-thread` permanece em `docs/dependency-catalog.json:3196` e `scripts/dependency-catalog/package-lock.json:684/1168/4317` sem nenhum manifesto no workspace.
4. 279 pacotes declaram `"./src/*": "./src/*"` sem publicar `src` (o campo `files` só inclui `lib/**`), gerando 279 warnings `EXPORTS_GLOB_NO_MATCHED_FILES`. Não falha o gate, mas é ruído sistemático: ou publica `src`, ou remove o export.
5. Dívida de depreciação real e concentrada: 85 supressões de `no-deprecated` em `src` para leitores síncronos de eventos da Session (`eventAt`/`snapshotEvents`/`ownEvents`, `core/session/src/index.ts:627/640/659`), marcados "new calls are prohibited" — cerca de 25 pacotes consumidores pendentes de migração.
6. Supressões de lint acima do esperado: 205 em `src`, com topo em `no-deprecated` 85, `no-non-null-assertion` 36, `no-unnecessary-condition` 22, `unbound-method` 13 e `no-misused-promises` 11.
7. `categories.correctness: off` no oxlint: o conjunto padrão de correção desligado, substituído por 104 entradas manuais (93 regras únicas) — lacunas silenciosas possíveis.
8. `skipLibCheck: true` e `verbatimModuleSyntax: false`: `typecheck` verde é sinal mais fraco para contratos públicos e declaration emit.
9. Fronteira de execução de código escrito por modelo não documentada como superfície de risco: `cordis-client-runner/src/client/evaluator.ts:180` executa plugin client no browser via `new Function`; `cordis-host-runner/src/sandbox.ts:217` faz o gate no host; o inspector CDP usa `eval`. É design deliberado de `extensions/`, mas sem análise de CSP e opt-in neste relatório.
10. Nome de gate divergente do banner gerado: `api-catalog.ts:3-4` cita `verify-cordis-api`; o gate executado é `verify-cordis-catalog`.
11. Pré-condição não sinalizada no agregado: `hygiene` roda `publint` sem `needs: build`; em árvore só com build host, 8 pacotes client falham `FILE_DOES_NOT_EXIST`. Está documentado em `docs/development.md:98`, mas o erro confunde.
12. Métricas sem definição canônica: workflows 21, snapshots 189, `no-deprecated` 85 e Agent Notes 1.108 divergem conforme o corpus, o que impede auditoria comparável entre execuções.
13. Loops de feedback caros: `lint`, `typecheck` e `doc-typecheck` exigem build host; `publint` exige `build:lib` completo; `test` exige build do addon nativo.
14. Superfície ampla para `0.1.6-alpha.2`: 293 pacotes, 4 apps, Electron desktop, Python SDK, ACP, SDK, Web e 9 vendors.
15. Ruído de snapshot e catálogo após renomeações upstream (`workflow-worker-thread`, `code-runtime-python`) — indica lacuna de higiene de renomeação no upstream, não no fork.

## 6. Problemas enumerados

| ID | Severidade | Problema | Evidência | Correção |
|---|---|---|---|---|
| P1 | Alto | `constraints` falha: 4 diretórios sem `package.json` | EXECUTADO: `packages/e2b/fs-e2b`, `packages/e2b/subprocess-e2b`, `packages/experimental/code-runtime-python`, `packages/workflow/workflow-worker-thread` | `pnpm run clean` (remove `lib/`, `node_modules/`, `.tsbuildinfo` órfãos) |
| P2 | Alto | Caminho morto no classificador de aprovação ponderada | `.github/review-ownership/blame-production.py:22` e `test_blame_production.py:69` apontam para pacote removido | Atualizar `SHIPPED_ROOTS` para `packages/experimental/ptc-runtime-python/py/` e o teste |
| P3 | Médio-alto | Dependência fantasma no catálogo publicado | `docs/dependency-catalog.json:3196`, `scripts/dependency-catalog/package-lock.json:684/1168/4317` | Regenerar catálogo e lock após a remoção, ou restaurar o pacote se a remoção foi indevida |
| P4 | Médio | 279 warnings `./src/*` não publicado | EXECUTADO: `publint` 0 erros, 279 warnings | Publicar `src` em `files` ou remover o export `./src/*` |
| P5 | Médio | 85 supressões `no-deprecated` (leitores síncronos de Session) | `core/session/src/index.ts:627/640/659` e cerca de 25 consumidores | Migrar para os leitores assíncronos ou congelar exceção documentada |
| P6 | Médio | 205 supressões de lint em `src` | EXECUTADO (grep) | Revisar `no-non-null-assertion` (36) e `unbound-method` (13) por pacote |
| P7 | Médio | `correctness: off` no linter | `.oxlintrc.json:4-10` | Ligar `correctness` e suprimir exceções nomeadas |
| P8 | Médio | `skipLibCheck` e `verbatimModuleSyntax` | `tsconfig.base.json:14,18` | Avaliar `skipLibCheck: false` no CI de artefatos |
| P9 | Médio | `publint` sem `needs: build` no agregado `hygiene` | `run-gates.ts:700`; 8 pacotes falham em árvore host-only | Adicionar `needs` ou aviso, ou documentar no erro |
| P10 | Médio | Fronteira de execução de código do modelo sem análise de risco | `extensions/cordis-client-runner/src/client/evaluator.ts:180`, `cordis-host-runner/src/sandbox.ts:217`, inspector CDP | Documentar opt-in, CSP e limites no README dos `extensions/*` |
| P11 | Baixo-médio | Nome de gate divergente no banner gerado | `extensions/tool-cordis/src/api-catalog.ts:3-4` | Corrigir o gerador para citar `verify-cordis-catalog` |
| P12 | Baixo-médio | Métricas não canônicas | Divergências entre auditor e crítico (workflows, snapshots, no-deprecated) | Adicionar script de métricas com corpus declarado |
| P13 | Baixo | 81 linhas `TODO/FIXME/XXX` e 66 `any` | EXECUTADO | Triagem por urgência (`FIXME` primeiro) |
| P14 | Baixo | 8 `.skip(` de runtime em specs | Contagem do crítico | Revisar skips que não sejam de plataforma ou chave |
| P15 | Baixo | Arquivos gerados grandes dentro de `src/` | `api-catalog.ts` 506 KB, `slot-catalog.ts` 168 KB | Manter gerado fora de `src/` ou aceitar com gate (já gated) |
| P16 | Baixo | Cobertura, e2e, web, bench e snapshot não executados aqui | NÃO EXECUTADO | Rodar os gates de CI antes de release do fork |

## 7. Verificação adversarial

O crítico independente confirmou: arquitetura e estado do fork; que `api-catalog.ts` é gerado e gated; que `no-deprecated` é dívida deliberada e documentada; que o bypass do Codex é config-time com default `never` (sem campo call-time); que o `dangerouslySetInnerHTML` do boot é DOM kernel-owned, não payload do host; e que os 4 diretórios são resíduo gitignored.

O crítico corrigiu: workflows são 21 (não 20); `no-deprecated` são 85 linhas (não 78); snapshots observáveis são pelo menos 180; `shell: true` existe em `scripts/install-lefthook.mjs:560` (a afirmação valia apenas para `packages/**`); e a release `dsh-0.1.6-alpha.2` é a base upstream, não commit de customização.

Achados novos incorporados a partir da revisão: P2 (caminho morto no approval), P3 (dependência fantasma), P10 (fronteira de execução), P11 (nome de gate) e P12 (métricas).

Limite declarado: independência I1 (mesma família de modelo, contexto novo); exit codes não são re-verificáveis pelo crítico sem execução.

## 8. Veredito

**CONDITIONAL PASS.** A base é excepcional em engenharia intrínseca (nota aproximada de 91): arquitetura de seams, invariante model-visible ⟺ logged, documentação mecanizada, zero duplicação, tipagem estrita e política de testes acima da média. O veredito não é `PASS` porque há 1 gate vermelho reproduzível (P1, resíduo local com correção de um comando), 2 defeitos reais de rastreabilidade (P2, caminho morto em CI de aprovação; P3, dependência fantasma no catálogo publicado) e 6 gates de CI não executados (P16), incluindo o gate de cobertura — o sinal central de qualidade do repositório.

Riscos residuais: P2 afeta silenciosamente o placar de aprovação de PRs no fork; P3 pode propagar um pacote inexistente na resolução npm publicada; P10 é design deliberado, mas sem documentação de risco.

Próximas ações, em ordem: executar `pnpm run clean && pnpm run hygiene` (deve ficar 16/16); corrigir `SHIPPED_ROOTS` em `.github/review-ownership/blame-production.py` e o teste correspondente; regenerar ou limpar as referências a `workflow-worker-thread` no catálogo de dependências; e rodar `test:coverage`, `doc-sync`, `test:e2e`, `test:web`, `test:snapshot` e `test:bench` antes de qualquer release do fork.
