# Roadmap de remediação — auditoria de 2026-09-21

Este roadmap é um artefato congelado do fork, escrito em português e excluído do pareamento bilíngue. Ele ordena o trabalho descrito no [plano executivo](plano-executivo-remediacao-2026-09-21.md) e não contém status operacional.

## Resumo

A sequência recomendada possui nove marcos, `M0` a `M8`. `M0` recupera o estado e forma uma baseline confiável; `M1` remove bloqueadores P0; `M2` e `M3` fecham riscos de runtime e cadeia de fornecimento; `M4` resolve arquitetura e publicação; `M5` torna o sinal de testes confiável; `M6` corrige documentação; `M7` reduz dívida com orçamento; e `M8` qualifica um candidato imutável.

## Conteúdo

1. [Dependências do programa](#dependências-do-programa)
2. [Marcos](#marcos)
3. [Ondas recomendadas](#ondas-recomendadas)
4. [Paralelismo seguro](#paralelismo-seguro)
5. [Regras de promoção](#regras-de-promoção)
6. [Nota para desenvolvimento](#nota-para-desenvolvimento)

## Dependências do programa

```text
M0 Recuperação e baseline
 ├─> M1 Bloqueadores P0 ───────────────┐
 ├─> M2 Runtime e segurança ───────────┤
 ├─> M3 CI e cadeia de fornecimento ───┤
 └─> M4 Arquitetura e publicação ──┐   │
                                   ├─> M5 Testes e cobertura ──┐
M1 ────────────────────────────────┘                           │
M4 ─────────────────────────────────────> M6 Documentação ─────┤
M5 ─────────────────────────────────────> M7 Dívida estática ───┤
M2 + M3 + M4 + M5 + M6 + M7 ────────────────────────────────> M8
```

`M0` é pré-requisito para qualquer escrita porque o working tree observado já contém trabalho em andamento. `M1` não precisa esperar decisões de identidade pública. `M2`, `M3` e a parte independente de `M4` podem avançar em paralelo depois da baseline. `M8` depende de todos os marcos anteriores e de sinais externos associados ao mesmo commit.

## Marcos

### M0 — recuperar estado e promover o programa

- Itens: `REM-027` e promoção de `REM-001` a `REM-037`.
- Saída: ownership das mudanças existentes, baseline registrada, backlog canônico reconciliado e plano ativo apontando para a próxima ação real.
- Aceite: nenhum arquivo preexistente foi sobrescrito; cada item promovido tem `solutionType`, owner, dependências, próxima ação e critério de aceite; o SHA de referência e as versões de ferramenta estão registrados.
- Portão: se a árvore mistura trabalho de owners desconhecidos, continuar somente em arquivos não sobrepostos e pedir a classificação necessária.

### M1 — remover bloqueadores imediatos

- Itens: `REM-001`, `REM-002`, `REM-003`, `REM-004`, `REM-005`, `REM-013`, `REM-014`.
- Saída: forks isolados, credenciais de proxy protegidas, regressões determinísticas corrigidas e gates fundamentais verdes.
- Aceite: testes negativos demonstram as proteções; falhas do Plugin Manager e spill passam isoladas e em suite; TypeScript, lint contratual e gates documentais afetados passam.
- Portão: qualquer mudança de política de runner ou segredo requer revisão explícita da decisão antes da integração.

### M2 — fechar riscos de runtime e lifecycle

- Itens: `REM-006`, `REM-007`, `REM-008`.
- Saída: modelo suportado de extensões, limite agregado de memória e semântica completa de fechamento do cliente remoto.
- Aceite: documentação e configuração descrevem defaults; testes cobrem carga concorrente, CSP/consentimento, timeout, abort e teardown; nenhum handle ou listener permanece depois do fechamento confirmado.
- Portão: decisões de produto e segurança são registradas antes da implementação incompatível.

### M3 — endurecer CI e cadeia de fornecimento

- Itens: `REM-009`, `REM-010`, `REM-019`, `REM-022`, `REM-024`, `REM-025`, `REM-026`.
- Saída: referências externas imutáveis, política de dependência ativa, scanner, SBOM, attestations, timeouts e veredito multiplataforma.
- Aceite: gate estático rejeita tag ou imagem mutável; instalação congelada respeita idade mínima; vulnerabilidades e exceções têm política; Windows alimenta o agregado; artefatos se vinculam ao SHA.
- Portão: disponibilidade ou custo de runner externo pode alterar o desenho, não o requisito de sinal equivalente.

### M4 — alinhar arquitetura e publicação

- Itens: `REM-011`, `REM-012`, `REM-017`, `REM-018`, primeira onda de `REM-028`.
- Saída: ownership de domínio resolvido, identidade de publicação explícita, exports reais e grafo documental atual.
- Aceite: grafos passam; tarballs contêm todo caminho exportado; metadados refletem a identidade escolhida; consumidores da primeira onda deixam de usar leitores síncronos.
- Portão: namespace, permissão de publicação e política de `src` exigem decisão do mantenedor.

### M5 — tornar os testes determinísticos e a cobertura honesta

- Itens: `REM-016`, `REM-020`, `REM-021`, parte de validação de `REM-022` e `REM-023`.
- Saída: suite estável sob concorrência, testes negativos ativos, E2E corretamente condicionado e relatório de cobertura com corpus explícito.
- Aceite: repetições controladas não geram `MaxListeners`; skips restantes têm condição e owner; o job agregado inclui plataformas suportadas; a mensagem do gate corresponde aos arquivos medidos.
- Portão: testes de API real podem depender de segredo externo, mas devem produzir skip rastreável quando o segredo estiver ausente.

### M6 — completar documentação e onboarding

- Itens: `REM-015`, `REM-029`, `REM-030`, `REM-031`, `REM-032`, `REM-033`, `REM-034`, `REM-036`, `REM-037`.
- Saída: pré-requisitos, contratos, estrutura, ordem, i18n, orçamento e prosa coerentes.
- Aceite: páginas aplicáveis têm resumo, navegação e nota de desenvolvimento; READMEs e JSDoc concordam; notas arquivadas permanecem intocadas; `test:docs`, `doc-sync`, links, pairing e budgets passam.
- Portão: migração em massa deve preservar uma linha física por parágrafo e não duplicar fatos normativos.

### M7 — reduzir dívida estática por owner

- Itens: ondas restantes de `REM-028` e `REM-035`.
- Saída: leitores síncronos migrados, contadores canônicos e orçamentos não crescentes para deprecações, suppressions, `any`, marcadores e skips.
- Aceite: cada redução mantém comportamento e testes; nenhuma exceção cresce; toda exceção residual tem justificativa local ou registro durável apropriado.
- Portão: a redução é orientada por risco e pacote, não por substituição global.

### M8 — selar e qualificar o candidato

- Itens: fechamento integrado de `REM-001` a `REM-037`.
- Saída: commit imutável, árvore limpa, matriz de checks concluída, relatório final e recomendação de release.
- Aceite: nenhum item P0/P1 aberto; P2/P3 encerrados ou excepcionalmente aprovados com owner e prazo; sinais externos vinculados ao mesmo SHA; reauditoria recalcula as notas.
- Portão: qualquer mudança após o selo invalida a qualificação e cria novo candidato.

## Ondas recomendadas

| Onda | Foco | Itens | Motivo da ordem |
|---|---|---|---|
| 1 | Estado e gates quebrados | `REM-027`, `REM-005`, `REM-013`, `REM-014` | Restabelece uma base observável e feedback confiável. |
| 2 | Segurança crítica e regressões | `REM-001` a `REM-004` | Remove risco imediato e falhas determinísticas. |
| 3 | Runtime | `REM-006` a `REM-008` | Fecha recursos e políticas antes de ampliar testes. |
| 4 | Supply chain | `REM-009`, `REM-010`, `REM-019`, `REM-024` a `REM-026` | Torna a produção de artefatos repetível. |
| 5 | Arquitetura/publicação | `REM-011`, `REM-012`, `REM-017`, `REM-018` | Depende de decisões humanas e afeta muitos consumidores. |
| 6 | Testes/plataformas | `REM-016`, `REM-020` a `REM-023` | Mede corretamente o sistema já estabilizado. |
| 7 | Docs e contratos | `REM-015`, `REM-029` a `REM-034`, `REM-036`, `REM-037` | Consolida a configuração e os contratos escolhidos. |
| 8 | Dívida estrutural | `REM-028`, `REM-035` | Executa migração em ondas sobre a arquitetura estabilizada. |
| 9 | Qualificação | Todos | Reúne evidência no mesmo candidato imutável. |

## Paralelismo seguro

Depois de `M0`, podem avançar em paralelo: correções de Plugin Manager e spill; fixação de ações e imagens; análise de extensões, memória e WebSocket; e revisão documental sem sobreposição. Não devem avançar em paralelo sem coordenação: decisão de domínio e regeneração do grafo; identidade de publicação e exports de `src`; migração de Session e testes de cobertura; alterações simultâneas nos agregadores de CI.

Cada lane paralela deve ter arquivos de responsabilidade definidos, checks próprios e ponto de integração. O agente coordenador resolve conflitos sem apagar mudanças alheias e reexecuta verificações da interseção depois do merge local.

## Regras de promoção

1. Promover apenas itens cuja descrição e aceite cabem numa unidade revisável; dividir o trabalho sem perder o vínculo `REM-*` e `AUD-*` quando necessário.
2. Registrar dependências reais, não uma ordenação total artificial.
3. Não marcar concluído por edição de arquivo; exigir evidência do comportamento ou gate.
4. Não iniciar `M8` com decisão humana pendente que afete segurança, publicação ou suporte de plataforma.
5. Se um achado estiver incorreto, registrar contraevidência reproduzível e encerrar como invalidado no backlog canônico; não remover o ID desta especificação.

## Nota para desenvolvimento

O roadmap descreve ordem e dependências. Estados como `ready`, `active`, `blocked` ou `done` pertencem exclusivamente ao backlog vivo em `.agent/`. A especificação atômica de cada item está em [backlog-remediacao-2026-09-21.md](backlog-remediacao-2026-09-21.md).
