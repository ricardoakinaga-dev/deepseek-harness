# Especificação do backlog de remediação — 2026-09-21

Este documento é um artefato congelado do fork, escrito em português e excluído do pareamento bilíngue. Ele enumera integralmente o trabalho derivado da [auditoria profunda](auditoria-profunda-2026-09-21.md), mas não é um backlog vivo: estado, owner, tentativas e próxima ação pertencem a `.agent/backlog.json` e aos ledgers em `.agent/`.

## Resumo

Há 37 itens, um para cada achado `AUD-*`. Os IDs `REM-*` são estáveis e mantêm relação um para um com a auditoria. Antes da implementação, o agente deve reconciliar esta lista com itens já existentes em `.agent/backlog.json`, reutilizar o item canônico quando houver sobreposição e registrar o vínculo com o ID desta especificação.

## Conteúdo

1. [Regras de uso](#regras-de-uso)
2. [Itens P0](#itens-p0)
3. [Itens P1](#itens-p1)
4. [Itens P2](#itens-p2)
5. [Item P3](#item-p3)
6. [Matriz de cobertura](#matriz-de-cobertura)
7. [Nota para desenvolvimento](#nota-para-desenvolvimento)

## Regras de uso

1. `REM-027` é o pré-requisito operacional global: recuperar o estado e separar mudanças preexistentes antes de editar superfícies sobrepostas.
2. Cada item promovido recebe exatamente um `solutionType`; subdivisões podem usar outro tipo somente se forem melhorias independentes com registros próprios na política.
3. A aceitação exige comportamento ou gate demonstrado. Uma alteração textual ou de código sem evidência não encerra o item.
4. Decisões humanas identificadas no plano executivo devem ser registradas antes da implementação incompatível.
5. Os comandos concretos são escolhidos pelo procedimento de pre-push e registrados como executados, não como intenção.

## Itens P0

### 1. REM-001 — impedir forks em runners persistentes

- Achado: `AUD-001`.
- Impacto: alto; prioridade P0.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: todos os jobs e workflows capazes de executar código de contribuição externa.
- Entrega: condição central ou seleção de runner que garanta ambiente hosted ou efêmero para forks, acompanhada de verificador estático e fixtures positivas e negativas.
- Aceite: um workflow de fork que tente selecionar runner persistente é rejeitado; eventos internos autorizados continuam com o runner previsto; permissões e secrets permanecem mínimos.

### 2. REM-002 — retirar credenciais de proxy dos subprocessos model-authored

- Achado: `AUD-002`.
- Impacto: alto; prioridade P0.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027` e decisão sobre transporte de credenciais.
- Escopo: subprocess, instalação de proxy, configuração, redação de diagnósticos e documentação de rede.
- Entrega: mecanismo no qual comandos produzidos pelo modelo recebem somente os dados não secretos necessários; autenticação fica no componente proprietário do transporte.
- Aceite: testes inspecionam ambiente, argumentos, erros e logs e não encontram usuário, senha ou URL autenticada; proxy autenticado continua funcional pelo caminho aprovado.

### 3. REM-003 — corrigir sucesso falso do Plugin Manager

- Achado: `AUD-003`.
- Impacto: alto; prioridade P0.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027`.
- Escopo: `packages/boot/plugin-manager` e contratos de instalação apresentados ao usuário.
- Entrega: script de build ignorado produz erro ou resultado explicitamente não instalável, sem sinal de sucesso ou reinício indevido.
- Aceite: o teste próximo de `manager.spec.ts:236` passa isolado e na suite; causa, mensagem, estado instalado e `restartRequired` correspondem ao resultado real.

### 4. REM-005 — restaurar TypeScript e lint contratual

- Achado: `AUD-005`.
- Impacto: alto; prioridade P0.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: `scripts/audit-metrics.ts`, seu spec e `scripts/verify-readme-community-parity.ts`.
- Entrega: tipos estreitos, exports documentados e testes ajustados sem desabilitar regras.
- Aceite: `pnpm run typecheck` e `pnpm run lint:contracts-ready` passam; os testes focados dos scripts cobrem as ramificações corrigidas.

### 5. REM-013 — corrigir terminologia concreta da documentação

- Achado: `AUD-013`.
- Impacto: alto; prioridade P0.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: `docs/customization/repository-audit-2026-09-20.md` e verificador de prosa aplicável.
- Entrega: substituir o termo rejeitado por descrição concreta que preserve o fato.
- Aceite: o gate de termos concretos passa e nenhum novo uso proibido é introduzido.

### 6. REM-014 — tornar referências operacionais compatíveis com o gate

- Achado: `AUD-014`.
- Impacto: alto; prioridade P0.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: `.agent/execution-log.jsonl`, schema do ledger e gate de referências.
- Entrega: representar o SHA por campo ou formato aceito sem apagar o registro histórico; se o formato atual for intencional, corrigir o gate com teste estreito.
- Aceite: `test:docs` e o verificador de referências passam; o ledger continua válido e recuperável; a regressão cobre hash bruto inválido e formato permitido.

## Itens P1

### 7. REM-004 — reparar limpeza de spill local

- Achado: `AUD-004`.
- Impacto: alto; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027`.
- Escopo: composição e lifecycle de `packages/spill/spill-local`.
- Entrega: registrar e executar a limpeza conforme configuração em todos os caminhos de término.
- Aceite: o teste próximo de `loader-composition.spec.ts:72` passa isolado e em suite; sucesso, erro, abort e reload não deixam arquivo ou disposer pendente.

### 8. REM-006 — unificar política de extensões dinâmicas

- Achado: `AUD-006`.
- Impacto: alto; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027` e decisão sobre ambientes, consentimento, CSP e defaults.
- Escopo: runners host e client, instalação de extensão, configuração, UI de consentimento e documentação.
- Entrega: um modelo único de confiança que declara onde código dinâmico pode executar, quem consente e como CSP e defaults são aplicados.
- Aceite: host e cliente rejeitam instalação ou execução fora da política; defaults são seguros; testes cobrem opt-in, revogação e CSP; documentação não apresenta facade como sandbox.

### 9. REM-007 — adicionar admissão agregada de memória

- Achado: `AUD-007`.
- Impacto: alto; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027` e decisão sobre orçamento e backpressure.
- Escopo: ponte HTTP, host RPC, configuração e métricas operacionais.
- Entrega: orçamento agregado configurável e simétrico entre canais, com rejeição ou fila antes de alocar o corpo completo.
- Aceite: testes concorrentes respeitam o teto; cancelamento libera reserva; request individual e RPC seguem a mesma política documentada.

### 10. REM-008 — alinhar fechamento lógico e físico do WebSocket

- Achado: `AUD-008`.
- Impacto: alto; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027` e decisão de API.
- Escopo: `RemoteStreamMuxClient`, transporte WebSocket, callers e JSDoc.
- Entrega: `close()` aguarda o evento físico ou APIs distintas nomeiam explicitamente os dois estágios, com timeout e causa de erro.
- Aceite: testes com socket lento, socket preso, erro e chamada repetida comprovam resolução determinística e ausência de handles residuais.

### 11. REM-009 — fixar ações externas por SHA

- Achado: `AUD-009`.
- Impacto: alto; prioridade P1.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: 18 workflows com referências externas e automação de atualização.
- Entrega: todas as ações externas fixadas por SHA, com comentário de versão e verificador que rejeita tags mutáveis.
- Aceite: corpus de workflows contém somente referências permitidas; fixture negativa falha; mecanismo de atualização mantém revisão legível.

### 12. REM-010 — fixar imagens de build por digest

- Achado: `AUD-010`.
- Impacto: alto; prioridade P1.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: imagens Docker usadas em build, teste e publicação de artefatos.
- Entrega: referências por digest e arquitetura, com processo automatizado de atualização.
- Aceite: o mesmo SHA resolve as mesmas imagens; gate rejeita tag sem digest; builds de arquiteturas suportadas continuam funcionais.

### 13. REM-011 — zerar violações do domínio do cliente

- Achado: `AUD-011`.
- Impacto: alto; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027` e decisão de ownership e API documental.
- Escopo: 38 arestas reportadas, definitions, providers, consumers e faces do cliente.
- Entrega: mover API ou consumidores para o domínio proprietário sem criar barrel ou bypass privado.
- Aceite: `verify-client-domain-graph` reporta zero violações; typecheck de cada face e testes de integração passam; documentação de ownership é atualizada.

### 14. REM-012 — decidir e aplicar identidade de publicação

- Achado: `AUD-012`.
- Impacto: alto; prioridade P1.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027` e decisão explícita do mantenedor.
- Escopo: 293 manifestos, metadados de repositório, workflows, registries e política do fork.
- Entrega: impedir publicação, usar namespace próprio ou aplicar autorização upstream comprovada de modo uniforme.
- Aceite: dry run de publicação mostra apenas identidade permitida; gate rejeita pacote público ou URL incompatível; documentação e configuração concordam.

### 15. REM-015 — documentar pré-requisitos no README raiz

- Achado: `AUD-015`.
- Impacto: alto; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-027`.
- Escopo: README raiz e fontes canônicas de engines e package manager.
- Entrega: requisitos de Node, pnpm e Corepack com comando de bootstrap.
- Aceite: valores coincidem com manifestos ou são derivados por teste; links e paridade linguística aplicável passam.

### 16. REM-016 — estabilizar a suite sob carga

- Achado: `AUD-016`.
- Impacto: médio; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-003`, `REM-004`, `REM-005`.
- Escopo: nove arquivos inicialmente falhos, listeners, relógios, portas, estado global e teardown assíncrono.
- Entrega: diagnóstico por classe de falha e correções de isolamento sem apenas elevar timeout.
- Aceite: repetições concorrentes e a suite relevante passam sem `MaxListeners`; testes continuam sensíveis ao defeito original.

### 17. REM-017 — alinhar exports de fonte com tarballs

- Achado: `AUD-017`.
- Impacto: médio; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-012` e decisão sobre publicação de `src`.
- Escopo: 279 manifestos e geradores compartilhados.
- Entrega: publicar os arquivos exportados ou remover `./src/*` de modo consistente.
- Aceite: `publint` não reporta `EXPORTS_GLOB_NO_MATCHED_FILES`; smoke externo importa todos os caminhos públicos; gerador impede regressão.

### 18. REM-018 — atualizar o grafo de módulos

- Achado: `AUD-018`.
- Impacto: médio; prioridade P1.
- `solutionType`: `repository-automation`.
- Dependências: `REM-011`.
- Escopo: fonte canônica, gerador e três entradas desatualizadas.
- Entrega: regenerar o grafo depois da correção de ownership e esclarecer o mecanismo de atualização.
- Aceite: `verify-module-graph` passa em árvore limpa e uma fixture alterada demonstra o freshness-gate.

### 19. REM-019 — ativar idade mínima de releases

- Achado: `AUD-019`.
- Impacto: médio; prioridade P1.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: configuração do package manager, exclusões e documentação de dependências.
- Entrega: `minimumReleaseAge` explícito com exceções justificadas e expiradas quando possível.
- Aceite: instalação congelada respeita a idade; pacote recente de fixture é rejeitado; exceções existentes são necessárias e documentadas.

### 20. REM-020 — reativar testes negativos do gerador Cordis

- Achado: `AUD-020`.
- Impacto: médio; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-005`.
- Escopo: 28 testes negativos ignorados, fixtures e validação do gerador Cordis.
- Entrega: restaurar rejeição explícita das entradas inválidas ou atualizar fixtures cuja premissa deixou de existir.
- Aceite: os 28 casos executam; cada caso demonstra uma regra distinta; nenhum skip incondicional permanece.

### 21. REM-021 — habilitar E2E de busca DeepSeek quando houver ambiente

- Achado: `AUD-021`.
- Impacto: médio; prioridade P1.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-005`.
- Escopo: cenário E2E, detecção de credencial e job proprietário.
- Entrega: substituir `it.skip` incondicional por condição baseada no ambiente suportado e motivo observável.
- Aceite: com credencial o cenário executa; sem credencial ele informa skip esperado; CI dono do sinal vincula o resultado ao candidato.

### 22. REM-022 — incluir Windows no veredito agregado

- Achado: `AUD-022`.
- Impacto: médio; prioridade P1.
- `solutionType`: `repository-automation`.
- Dependências: `REM-016`.
- Escopo: workflows de Windows, job agregador e regras de branch ou release.
- Entrega: o job final depende do sinal de Windows suportado e distingue skip permitido de ausência inesperada.
- Aceite: fixture ou teste do workflow mostra que uma falha Windows torna o agregado vermelho; diagnóstico local por Wine continua reservado a falha conhecida.

### 27. REM-027 — formar baseline reproduzível

- Achado: `AUD-027`.
- Impacto: médio; prioridade P1.
- `solutionType`: `repository-automation`.
- Dependências: nenhuma.
- Escopo: estado em `.agent/`, working tree, owners, SHA, versões e registros de execução.
- Entrega: recuperar a sessão existente, classificar mudanças sem apagá-las e registrar um candidato atribuível.
- Aceite: plano, backlog, ledgers e árvore concordam; mudanças preexistentes têm owner ou isolamento; todo resultado posterior aponta para SHA e comando exatos.

## Itens P2

### 23. REM-023 — tornar a afirmação de cobertura fiel ao corpus

- Achado: `AUD-023`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-016` e inventário das superfícies excluídas.
- Escopo: packages excluídos, apps, scripts, Python, native, mensagem do gate e política de exceção.
- Entrega: ampliar a medição ou renomear a promessa, com metas por runtime e exceções de owner definido.
- Aceite: relatório lista arquivos incluídos e excluídos; mensagem não afirma 100% além do corpus; fixture impede exclusão silenciosa de nova árvore crítica.

### 24. REM-024 — adicionar gate de vulnerabilidades

- Achado: `AUD-024`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-019`.
- Escopo: ecossistemas Node, Python, imagens e Rust quando publicado.
- Entrega: scanner reproduzível, política de severidade e registro de exceção com owner e expiração.
- Aceite: dependência vulnerável de fixture falha; ausência de banco externo produz resultado explícito; exceção expirada falha.

### 25. REM-025 — publicar SBOM e attestations

- Achado: `AUD-025`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-009`, `REM-010`, `REM-012` e decisão de publicação.
- Escopo: npm, PyPI, imagens, artefatos nativos e release workflow.
- Entrega: SBOM por artefato e attestations suportadas que liguem conteúdo, commit e workflow.
- Aceite: verificação independente resolve o SHA e componentes do artefato; release sem SBOM ou attestation obrigatória é rejeitada.

### 26. REM-026 — definir timeouts em todos os jobs executáveis

- Achado: `AUD-026`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: 28 jobs sem `timeout-minutes` e verificador de workflows.
- Entrega: limites proporcionais por classe de job e exceção estreita quando tecnicamente necessária.
- Aceite: gate rejeita job executável sem limite; tempos acomodam p95 observado sem ocultar deadlock.

### 28. REM-028 — migrar leitores síncronos de Session

- Achado: `AUD-028`.
- Impacto: médio; prioridade P2.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-011` para consumidores afetados pelo domínio e reconhecimento de mudança persistida quando aplicável.
- Escopo: 79 exceções em 54 arquivos de produção e APIs `eventAt`, `snapshotEvents` e `ownEvents`.
- Entrega: ondas por package owner usando leitores assíncronos e preservando ordem, erro, cancelamento e reconstrução.
- Aceite: cada onda remove exceções correspondentes, mantém snapshots e testes; ao final não restam chamadas de produção proibidas.

### 29. REM-029 — aplicar estrutura documental por audiência

- Achado: `AUD-029`.
- Impacto: médio; prioridade P1 no relatório, executado na frente documental após estabilização dos contratos.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-011`, `REM-012`, `REM-015` e `REM-030` para fatos compartilhados.
- Escopo: páginas aplicáveis do corpus amostrado, começando por documentação pública e de alto tráfego.
- Entrega: resumo, navegação e nota de desenvolvimento conforme tipo documental, sem duplicar fatos nem ultrapassar budgets por expansão automática.
- Aceite: gate calibrado ao corpus aplicável passa; páginas preservam uma linha física por parágrafo; pares linguísticos são atualizados juntos quando exigidos.

### 30. REM-030 — completar três READMEs públicos

- Achado: `AUD-030`.
- Impacto: médio; prioridade P1 no relatório.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-011` para decisões de ownership relacionadas.
- Escopo: `packages/client/store`, `packages/client/ui-approval` e `packages/client/ui-session`, além do JSDoc público correspondente.
- Entrega: contratos de definição, provider, consumer, lifecycle, falhas, descarte e invariante quando aplicável.
- Aceite: verificador de contratos de README passa; JSDoc e README descrevem o mesmo comportamento; exemplos usam launch e imports suportados.

### 31. REM-031 — normalizar ordem das seções de README

- Achado: `AUD-031`.
- Impacto: médio; prioridade P2.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-030`.
- Escopo: 101 READMEs em que `Runtime invariant` aparece depois de `Development note`.
- Entrega: mover seções sem reescrever conteúdo não relacionado e proteger a ordem no verificador.
- Aceite: todos os READMEs aplicáveis seguem o template; gate falha em fixture com ordem invertida; budgets não aumentam sem necessidade.

### 32. REM-032 — documentar a exceção de i18n para auditorias

- Achado: `AUD-032`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: política de i18n, manifesto de pairing e ownership de `docs/audits/`.
- Entrega: explicação explícita de que auditorias do fork podem permanecer em português, com limites e owner da exceção.
- Aceite: política e manifesto concordam; gate impede que outra árvore use a exceção sem declaração própria.

### 33. REM-033 — reconciliar orçamento documental e manifesto

- Achado: `AUD-033`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-029`.
- Escopo: política de budgets, manifesto, ceilings e verificador.
- Entrega: uma fonte canônica para exceções e justificativa explícita para aumento de teto.
- Aceite: budget gate passa; divergência de fixture falha; relatório mostra headroom e crescimento por documento.

### 34. REM-034 — migrar títulos legados em Agent Notes ativas

- Achado: `AUD-034`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-027`.
- Escopo: quatro notas implementadas ativas com `## Risks`; arquivos arquivados ficam fora do escopo.
- Entrega: título e conteúdo ajustados ao template atual sem narrar revisão.
- Aceite: verificador não encontra título legado em notas ativas; hashes de arquivos arquivados permanecem inalterados.

### 35. REM-035 — governar dívida estática por owner

- Achado: `AUD-035`.
- Impacto: médio; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-005`, `REM-016` e definição do corpus.
- Escopo: deprecações, suppressions, `any`, marcadores e skips.
- Entrega: métricas canônicas por pacote e regra, baseline, budgets não crescentes e plano de redução por risco.
- Aceite: gate rejeita crescimento não autorizado; exceções têm owner; números são reproduzíveis; reduções de runtime usam itens próprios quando necessário.

### 36. REM-036 — remover resíduo de planejamento de notas ativas

- Achado: `AUD-036`.
- Impacto: baixo; prioridade P2.
- `solutionType`: `repository-automation`.
- Dependências: `REM-034`.
- Escopo: Agent Notes implementadas e ativas; notas arquivadas não podem ser editadas.
- Entrega: manter somente decisão, contexto durável, consequências e referências válidas.
- Aceite: revisão pelo padrão de prosa e pelo verificador de vazamento não encontra narração de plano, stack ou review; arquivos congelados permanecem idênticos.

## Item P3

### 37. REM-037 — corrigir comentário de módulo do client store

- Achado: `AUD-037`.
- Impacto: baixo; prioridade P3.
- `solutionType`: `upstream-package-change`.
- Dependências: `REM-030` para evitar duas edições conflitantes no mesmo pacote.
- Escopo: comentário de módulo em `packages/client/store/src/index.ts`.
- Entrega: substituir `uSES` e `NO selector hook` por contrato conciso e direto.
- Aceite: JSDoc e gates de prosa aplicáveis passam; comentário concorda com README e comportamento.

## Matriz de cobertura

| Faixa | Itens | Quantidade |
|---|---|---:|
| P0 | `REM-001`, `REM-002`, `REM-003`, `REM-005`, `REM-013`, `REM-014` | 6 |
| P1 | `REM-004`, `REM-006` a `REM-012`, `REM-015` a `REM-022`, `REM-027`, `REM-029`, `REM-030` | 19 |
| P2 | `REM-023` a `REM-026`, `REM-028`, `REM-031` a `REM-036` | 11 |
| P3 | `REM-037` | 1 |
| Total | `REM-001` a `REM-037` | 37 |

## Nota para desenvolvimento

A ordem numérica preserva o vínculo com a auditoria, por isso `REM-027` aparece na seção P1 antes dos itens P2. A prioridade do item é a registrada na auditoria, mesmo quando o roadmap agenda a execução depois de uma dependência. O prompt pronto para iniciar o programa está em [prompt-codex-remediacao-2026-09-21.md](prompt-codex-remediacao-2026-09-21.md).
