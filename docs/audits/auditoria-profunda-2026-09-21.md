# Auditoria profunda do repositório — 2026-09-21

Este relatório é um artefato do fork, escrito em português e excluído do pareamento bilíngue por `scripts/translation-pairing.manifest.json`. Ele registra o estado observado do repositório e não substitui os documentos normativos nem o estado operacional em `.agent/`.

## Resumo

O candidato auditado recebeu **63/100** e o veredito **FAIL para merge ou release**. A arquitetura, os formatos persistidos, a composição Cordis e os mecanismos de descarte continuam fortes, mas a árvore observada tinha 54 arquivos modificados e 50 não rastreados, os gates centrais estavam vermelhos e havia riscos P0 em CI de forks, exposição de credenciais de proxy a comandos produzidos pelo modelo e tratamento incorreto de falhas no Plugin Manager.

A auditoria encontrou **37 problemas distintos**: 15 de alto impacto, 20 de médio impacto e 2 de baixo impacto. Os itens `AUD-001`, `AUD-002`, `AUD-003`, `AUD-005`, `AUD-013` e `AUD-014` têm prioridade P0. Este documento congela o diagnóstico; o plano de execução está em [plano-executivo-remediacao-2026-09-21.md](plano-executivo-remediacao-2026-09-21.md), a sequência em [roadmap-remediacao-2026-09-21.md](roadmap-remediacao-2026-09-21.md), a especificação integral do trabalho em [backlog-remediacao-2026-09-21.md](backlog-remediacao-2026-09-21.md) e a instrução pronta para outro Codex em [prompt-codex-remediacao-2026-09-21.md](prompt-codex-remediacao-2026-09-21.md).

## Conteúdo

1. [Escopo e método](#escopo-e-método)
2. [Veredito e nota geral](#veredito-e-nota-geral)
3. [Notas por dimensão](#notas-por-dimensão)
4. [Resultados dos gates](#resultados-dos-gates)
5. [Ranking por impacto](#ranking-por-impacto)
6. [Lista completa de problemas](#lista-completa-de-problemas)
7. [Pontos fortes preservados](#pontos-fortes-preservados)
8. [Limitações](#limitações)
9. [Nota para desenvolvimento](#nota-para-desenvolvimento)

## Escopo e método

A inspeção cobriu arquitetura e composição, contratos públicos, persistência de Session, lifecycle e concorrência, segurança, dependências e publicação, CI e cadeia de fornecimento, testes, cobertura, documentação, internacionalização, manutenção estática e reprodutibilidade de release. A base observada era o `HEAD` registrado no ledger operacional da auditoria, com 54 arquivos modificados e 50 arquivos não rastreados.

As evidências combinaram leitura direta de código, manifestos, documentação e workflows; execução de gates do repositório; repetição focada de falhas; e contagens sobre arquivos rastreados e presentes no disco. Uma falha do conjunto completo só foi classificada como determinística quando também falhou isoladamente. Um resultado verde local não foi promovido a evidência de release quando dependia da árvore suja.

Escala de prioridade: P0 bloqueia segurança, integridade do resultado ou qualquer promoção do candidato; P1 bloqueia o marco associado e deve ser resolvido antes da qualificação final; P2 é dívida material com orçamento e responsável explícitos; P3 é correção localizada de baixo risco.

## Veredito e nota geral

**Nota ponderada: 63/100. Veredito: FAIL.**

O candidato não estava qualificado para merge ou release. O resultado decorre da combinação de gates obrigatórios vermelhos, falhas determinísticas de comportamento, exposição potencial de segredos, lacunas de isolamento em CI, dependências e imagens mutáveis e ausência de uma evidência reproduzível sobre árvore limpa. A nota não nega as qualidades estruturais do projeto; ela mede o estado do candidato observado.

## Notas por dimensão

| # | Dimensão | Nota | Diagnóstico resumido |
|---|---|---:|---|
| 1 | Entrypoints de aplicações | 100 | Os lançamentos suportados permanecem concentrados nos perfis `dsh`; os validadores associados passaram. |
| 2 | Persistência e formatos de Session | 95 | Gerações v0–v3, migrações e catálogos passaram; nenhuma violação destrutiva foi observada. |
| 3 | Waterfalls, efeitos e descarte | 91 | Uso consistente de `next()`, `ctx.effect()` e disposers; há riscos residuais em fechamento físico de conexão e limpeza de spill. |
| 4 | Arquitetura e composição | 84 | Capability seams e composição Cordis são fortes, mas o grafo de domínios do cliente e a documentação do grafo estão divergentes. |
| 5 | Contratos públicos e consumidores | 80 | Contratos centrais são explícitos; exports de `src`, READMEs incompletos e leitores síncronos obsoletos reduzem a nota. |
| 6 | Mecânica documental e i18n | 79 | Pareamento mecânico e vários gates passaram, mas estrutura, referências e terminologia ainda falham. |
| 7 | Dependências e empacotamento | 70 | Catálogos e constraints passaram, porém há política de idade inativa, exports inconsistentes e identidade de publicação sem decisão. |
| 8 | Lifecycle, concorrência e recursos | 68 | Os padrões defensivos são amplos, mas há fechamento de WebSocket incompleto, pressão agregada de memória e limpeza de spill quebrada. |
| 9 | Manutenibilidade e dívida estática | 65 | Sem clones detectados, porém com volume elevado de `any`, supressões, deprecações e marcadores de dívida. |
| 10 | Testes unitários e confiabilidade | 58 | Grande volume de testes, mas 18 falhas no conjunto completo e sinais de sensibilidade à carga. |
| 11 | Cobertura, E2E e plataformas | 55 | O gate nominal de cobertura não cobre toda a superfície; E2E e Windows têm lacunas de agregação. |
| 12 | Segurança e limites de confiança | 55 | Há boas proteções locais, mas segredos de proxy, extensões dinâmicas e admissão de memória exigem correção. |
| 13 | CI e cadeia de fornecimento | 45 | Forks podem alcançar runner persistente, ações e imagens são mutáveis e faltam scanner e atestado público de artefatos. |
| 14 | Build, TypeScript e lint | 35 | `typecheck` e `lint:contracts-ready` falharam no candidato. |
| 15 | Release e reprodutibilidade | 32 | Árvore suja, identidade de publicação indefinida e evidência não reproduzível impedem qualificação. |
| | **Nota geral ponderada** | **63** | **Candidato não qualificável no estado observado.** |

## Resultados dos gates

| Comando ou verificador | Resultado observado | Evidência |
|---|---|---|
| `pnpm run typecheck` | FAIL | Quatro erros TypeScript em `scripts/audit-metrics.ts` nas linhas 228, 233, 271 e 276. |
| `pnpm run lint:contracts-ready` | FAIL | Seis diagnósticos em `scripts/audit-metrics.ts`, `scripts/audit-metrics.spec.ts` e `scripts/verify-readme-community-parity.ts`. |
| `pnpm run test` | FAIL | 18 falhas em nove arquivos; 26.176 testes passaram e 181 foram ignorados. |
| `pnpm run test:docs` | FAIL | 19 verificações passaram e duas falharam. |
| `pnpm run doc-sync` | FAIL | 39 verificações passaram e três falharam. |
| `verify-client-domain-graph` | FAIL | 38 violações de domínio do cliente. |
| `verify-module-graph` | FAIL | Três registros de documentação desatualizados. |
| `pnpm run constraints` | PASS | Restrições do workspace satisfeitas. |
| `pnpm run duplication` | PASS | Zero clones reportados. |
| `pnpm run audit:metrics` | PASS | 4.436 arquivos incluídos no corpus declarado. |
| Verificação de diff | PASS | Nenhum erro de whitespace no conjunto avaliado. |
| Pareamento de traduções | PASS | 1.027 pares reconhecidos pelo manifesto. |

As repetições focadas confirmaram como determinísticas a falha do Plugin Manager e a falha de limpeza de spill local. Os casos de timeout, workspace e política de spill que falharam no conjunto completo passaram isoladamente, portanto foram classificados como sensíveis à carga até existir diagnóstico mais preciso.

Também passaram os validadores de entrypoints de aplicação, alterações e releases de persistência, formatos e catálogos de Session, eventos com escopo, invariantes de pacote e configurações Cordis.

## Ranking por impacto

### Alto impacto

1. `AUD-001` — forks podem alcançar runner persistente.
2. `AUD-002` — credenciais de proxy podem chegar a comandos produzidos pelo modelo.
3. `AUD-003` — Plugin Manager informa sucesso quando o script de build foi ignorado.
4. `AUD-005` — candidato não compila nem satisfaz lint obrigatório.
5. `AUD-013` — gate de termos concretos da documentação falha.
6. `AUD-014` — gate de referências do repositório falha.
7. `AUD-004` — limpeza configurada de spill falha deterministicamente.
8. `AUD-006` — extensões dinâmicas não têm política uniforme de consentimento e CSP.
9. `AUD-007` — ponte HTTP admite requisições grandes sem limite agregado de memória.
10. `AUD-008` — fechamento lógico do cliente WebSocket antecede o fechamento físico.
11. `AUD-009` — ações de CI referenciadas por tags mutáveis.
12. `AUD-010` — imagens Docker mutáveis participam da produção de artefatos.
13. `AUD-011` — 38 violações do grafo de domínios do cliente.
14. `AUD-012` — identidade de publicação do fork não está decidida.
15. `AUD-015` — README raiz não informa versões mínimas nem Corepack.

### Médio impacto

1. `AUD-016` — suíte unitária completa é sensível à carga.
2. `AUD-017` — 279 pacotes exportam `./src/*` sem publicar `src`.
3. `AUD-018` — documentação do grafo de módulos está desatualizada.
4. `AUD-019` — política de idade mínima de releases está declarada, mas inativa.
5. `AUD-020` — 28 testes negativos do gerador Cordis estão ignorados.
6. `AUD-021` — E2E de busca DeepSeek está permanentemente ignorado.
7. `AUD-022` — sinal de Windows não entra no veredito agregado.
8. `AUD-023` — cobertura por arquivo exclui superfícies extensas.
9. `AUD-024` — não há gate de vulnerabilidades.
10. `AUD-025` — artefatos publicados não expõem atestado de origem nem SBOM.
11. `AUD-026` — 28 de 49 jobs executáveis não têm limite de tempo.
12. `AUD-027` — evidência atual depende de árvore suja.
13. `AUD-028` — 79 exceções de leitura síncrona de Session permanecem em produção.
14. `AUD-029` — estrutura documental exigida quase não foi aplicada ao corpus amostrado.
15. `AUD-030` — três READMEs públicos não descrevem o contrato completo.
16. `AUD-031` — 101 READMEs colocam a seção de invariante depois da nota de desenvolvimento.
17. `AUD-032` — exclusão de `docs/audits/` do pareamento não está explicada na política de i18n.
18. `AUD-033` — orçamento documental e manifesto divergem e têm pouca margem.
19. `AUD-034` — quatro Agent Notes implementadas ainda usam o título legado `## Risks`.
20. `AUD-035` — dívida estática não tem orçamento por responsável e prazo.

### Baixo impacto

1. `AUD-036` — Agent Notes implementadas ainda contêm resíduo de planejamento.
2. `AUD-037` — comentário de módulo em `packages/client/store/src/index.ts` contém texto quebrado.

## Lista completa de problemas

### Alto impacto

#### AUD-001 — runners persistentes acessíveis por forks

- Prioridade: P0.
- Evidência: `.github/workflows/ci.yml` restringe Dependabot em jobs iniciais, mas não aplica a mesma restrição de origem usada pelo job `node-compat` próximo da linha 369.
- Risco: código de fork pode alcançar ambiente persistente, ampliar acesso a estado residual e aumentar o impacto de uma contribuição não confiável.
- Correção requerida: impedir que eventos de fork usem runners persistentes; adicionar verificador estático e teste de workflow cobrindo todos os jobs aplicáveis.

#### AUD-002 — credenciais de proxy chegam a subprocessos model-authored

- Prioridade: P0.
- Evidência: `packages/subprocess/subprocess/src/index.ts`, próximo da linha 66, e `packages/util/http-proxy/src/install.ts`, próximo da linha 262, propagam URL de proxy; a documentação de rede admite credenciais na URL.
- Risco: usuário e senha podem aparecer no ambiente ou na linha de execução de comandos produzidos pelo modelo e em diagnósticos associados.
- Correção requerida: separar destino de proxy de material secreto, aplicar a credencial apenas no transporte que a consome, redigir logs e acrescentar testes de não propagação.

#### AUD-003 — Plugin Manager aceita build ignorado como sucesso

- Prioridade: P0.
- Evidência: falha isolada e repetível em `packages/boot/plugin-manager/tests/manager.spec.ts`, próximo da linha 236.
- Risco: uma instalação pode ser apresentada como concluída e exigir reinício apesar de o gerenciador ter ignorado o script necessário para tornar o plugin utilizável.
- Correção requerida: classificar script ignorado como resultado não instalável ou como erro explícito, preservar a causa e testar mensagens e estado final.

#### AUD-004 — limpeza configurada de spill não funciona

- Prioridade: P1.
- Evidência: falha isolada e repetível em `packages/spill/spill-local/tests/loader-composition.spec.ts`, próximo da linha 72.
- Risco: arquivos temporários podem sobreviver ao lifecycle configurado, consumir disco ou manter dados além do período esperado.
- Correção requerida: reparar composição e descarte do loader, provar limpeza em sucesso, erro, cancelamento e reload.

#### AUD-005 — build de tipos e lint obrigatórios estão vermelhos

- Prioridade: P0.
- Evidência: erros TypeScript em `scripts/audit-metrics.ts` nas linhas 228, 233, 271 e 276; diagnósticos de lint adicionais nas linhas 186 e 239, em `scripts/audit-metrics.spec.ts:53` e `scripts/verify-readme-community-parity.ts:47-48`.
- Risco: o candidato não atende os gates mínimos de compilação e contratos.
- Correção requerida: corrigir tipos e contratos sem relaxar configuração, adicionar casos de regressão e executar novamente os gates focados.

#### AUD-006 — política incompleta para extensões dinâmicas

- Prioridade: P1.
- Evidência: o runner de cliente usa `new Function`, o caminho host-only não exige a mesma aprovação do cliente, a facade não constitui isolamento de segurança e extensões externas podem ser habilitadas por padrão.
- Risco: execução de código model-authored ou externo com consentimento desigual, incompatibilidade com CSP e expectativa incorreta de isolamento.
- Correção requerida: decidir os ambientes suportados, definir consentimento uniforme, política CSP, defaults e limites de confiança; aplicar no host, cliente, configuração e documentação.

#### AUD-007 — ausência de admissão agregada de memória na ponte HTTP

- Prioridade: P1.
- Evidência: `packages/client/connection/src/http-bridge.ts` admite até 300 MiB por requisição, enquanto `rpc-host.ts` não aplica a mesma configuração ao canal RPC.
- Risco: requisições concorrentes podem exceder a memória disponível mesmo quando cada requisição respeita seu limite individual.
- Correção requerida: introduzir orçamento agregado configurável, backpressure ou rejeição precoce e simular concorrência e cancelamento em testes.

#### AUD-008 — `RemoteStreamMuxClient.close()` não aguarda fechamento físico

- Prioridade: P1.
- Evidência: `packages/api/gateway/src/client/stream-client.ts`, próximo da linha 127, resolve o fechamento antes do evento físico do WebSocket.
- Risco: recursos e callbacks permanecem vivos depois de o chamador acreditar que o cliente terminou; teardown e reconexão podem disputar o mesmo transporte.
- Correção requerida: separar ou alinhar semântica de fechamento lógico e físico, documentar timeout e erro e testar conexões lentas ou que não encerram.

#### AUD-009 — ações de CI usam referências mutáveis

- Prioridade: P1.
- Evidência: 152 referências externas por tags em 18 workflows e apenas seis referências fixadas por SHA.
- Risco: uma tag alterada modifica a execução de CI sem mudança correspondente no repositório.
- Correção requerida: fixar ações por SHA, manter comentários com versão legível e automatizar atualização e validação.

#### AUD-010 — imagens Docker mutáveis produzem artefatos de release

- Prioridade: P1.
- Evidência: workflows de build usam tags de imagem sem digest imutável.
- Risco: reconstruções do mesmo commit podem usar bases diferentes e produzir artefatos distintos.
- Correção requerida: fixar imagens por digest, registrar arquitetura e atualizar por automação revisável.

#### AUD-011 — violações do domínio do cliente

- Prioridade: P1.
- Evidência: `verify-client-domain-graph` reportou 38 violações.
- Risco: dependências atravessam ownership e camadas, dificultam evolução independente e podem carregar código indevido para outra face.
- Correção requerida: obter decisão sobre ownership do domínio e localização da API documental compartilhada, então mover interfaces ou consumidores e zerar o gate.

#### AUD-012 — identidade de publicação do fork indefinida

- Prioridade: P1.
- Evidência: 293 manifestos estão públicos sob `@deepseek-ai/dsh-*` e apontam para o repositório oficial, embora o candidato seja um fork customizado.
- Risco: publicação acidental sob identidade upstream, metadados enganosos e colisão de versões.
- Correção requerida: decisão humana entre não publicar, usar namespace próprio ou manter identidade mediante autorização; codificar a decisão em manifestos, workflows e gates.

#### AUD-013 — gate de termos concretos falha

- Prioridade: P0.
- Evidência: `docs/customization/repository-audit-2026-09-20.md`, próximo da linha 140, contém termo vetado pelo padrão de prosa.
- Risco: `doc-sync` permanece vermelho e a documentação viola a terminologia normativa.
- Correção requerida: substituir o termo por descrição concreta e executar o verificador correspondente.

#### AUD-014 — referência crua a commit quebra gate

- Prioridade: P0.
- Evidência: `.agent/execution-log.jsonl:1` contém hash bruto rejeitado pelo gate de referências do repositório.
- Risco: `test:docs` e `doc-sync` não qualificam o candidato; referências operacionais não seguem o formato aceito.
- Correção requerida: ajustar o registro pelo mecanismo permitido pelo schema ou gate, sem apagar histórico, e adicionar regressão se o formato atual for válido por design.

#### AUD-015 — pré-requisitos ausentes no README raiz

- Prioridade: P1.
- Evidência: o README raiz não informa a versão mínima de Node, a versão de pnpm nem o uso de Corepack.
- Risco: onboarding e automação falham tarde com runtime incompatível.
- Correção requerida: documentar os requisitos canônicos e manter os valores derivados ou verificados contra os manifestos.

### Médio impacto

#### AUD-016 — suíte completa sensível à carga

- Prioridade: P1.
- Evidência: `pnpm run test` teve 18 falhas em nove arquivos e emitiu avisos `MaxListeners`; alguns casos de timeout, workspace e spill passaram isoladamente.
- Risco: CI não determinística, falso negativo e teardown incompleto mascarado por repetição.
- Correção requerida: reproduzir sob concorrência controlada, eliminar estado global e listeners vazados, e criar testes de estresse proporcionais ao risco.

#### AUD-017 — exports de fonte sem arquivos publicados

- Prioridade: P1.
- Evidência: 279 pacotes declaram `./src/*` nos exports, mas o campo `files` não inclui `src`.
- Risco: consumidores recebem caminhos declarados que não existem no pacote publicado.
- Correção requerida: decidir se fonte é API publicada; publicar `src` ou remover o export em todos os pacotes e acrescentar gate de consistência.

#### AUD-018 — grafo de módulos documentado está desatualizado

- Prioridade: P1.
- Evidência: `verify-module-graph` reportou três entradas antigas.
- Risco: documentação orienta dependências e ownership incorretos.
- Correção requerida: regenerar ou corrigir a fonte canônica depois da decisão de domínio e manter freshness-gate verde.

#### AUD-019 — idade mínima de dependências inativa

- Prioridade: P1.
- Evidência: existem exclusões relacionadas a idade, mas nenhuma configuração efetiva de `minimumReleaseAge`.
- Risco: versões recém-publicadas podem entrar antes do período de observação pretendido.
- Correção requerida: ativar a política com valor explícito, justificar exceções e testar instalação congelada.

#### AUD-020 — testes negativos do gerador Cordis ignorados

- Prioridade: P1.
- Evidência: 28 casos negativos do gerador estão marcados como ignorados.
- Risco: entradas inválidas podem deixar de ser rejeitadas sem sinal em CI.
- Correção requerida: reativar os testes, corrigir fixtures ou gerador e manter somente exceções de plataforma justificadas.

#### AUD-021 — E2E de busca DeepSeek permanentemente ignorado

- Prioridade: P1.
- Evidência: o cenário usa `it.skip` incondicional.
- Risco: regressões no caminho real de busca não são detectadas mesmo quando credenciais estão disponíveis.
- Correção requerida: condicionar apenas à ausência de chave ou ambiente, registrar skip explícito e executar no job proprietário.

#### AUD-022 — Windows ausente do veredito agregado

- Prioridade: P1.
- Evidência: o resultado de cobertura ou compatibilidade Windows não participa do agregado que qualifica o candidato.
- Risco: release pode ser declarada apta apesar de falhar numa plataforma suportada.
- Correção requerida: integrar o sinal de CI de Windows ao job de conclusão sem transformar o diagnóstico local por Wine em requisito padrão.

#### AUD-023 — cobertura nominal exclui superfícies extensas

- Prioridade: P2.
- Evidência: pelo menos 158 arquivos e 42.846 linhas em cinco árvores excluídas, além de `apps/`, `scripts/`, `python/` e `native/`, não participam da afirmação de 100% por arquivo.
- Risco: a mensagem do gate é mais ampla que a medição e áreas críticas ficam sem orçamento explícito.
- Correção requerida: renomear a promessa ou ampliar o corpus; criar metas e exceções com dono para cada runtime.

#### AUD-024 — ausência de scanner de vulnerabilidades

- Prioridade: P2.
- Evidência: nenhum gate dedicado examina vulnerabilidades conhecidas dos ecossistemas publicados.
- Risco: uma dependência vulnerável pode atravessar constraints, lint e testes funcionais.
- Correção requerida: adicionar scanner adequado a Node, Python, imagens e, quando aplicável, Rust, com política de severidade e exceção expirada.

#### AUD-025 — artefatos sem atestado público e SBOM

- Prioridade: P2.
- Evidência: publicação npm não habilita atestado de origem, PyPI desabilita attestations e não há SBOM público associado à release.
- Risco: consumidores não conseguem verificar de forma padronizada como o artefato foi produzido nem quais componentes contém.
- Correção requerida: gerar SBOM, habilitar attestations suportadas e validar vínculo entre commit, workflow e artefato.

#### AUD-026 — jobs sem limite de tempo

- Prioridade: P2.
- Evidência: 28 de 49 jobs executáveis não declaram `timeout-minutes`.
- Risco: deadlocks e indisponibilidade externa podem consumir runners indefinidamente.
- Correção requerida: definir limites por classe de job e testar o verificador de workflow.

#### AUD-027 — evidência não reproduzível em árvore suja

- Prioridade: P1.
- Evidência: 54 arquivos modificados e 50 não rastreados no início da auditoria.
- Risco: resultados não podem ser atribuídos a um commit imutável e mudanças de origens diferentes podem se misturar.
- Correção requerida: recuperar o estado operacional, classificar ownership de cada mudança, formar candidato limpo e registrar exatamente commit, ferramentas e comandos.

#### AUD-028 — leitores síncronos obsoletos de Session

- Prioridade: P2.
- Evidência: 79 exceções de depreciação em 54 arquivos de produção usam leitores síncronos cujo uso novo é proibido.
- Risco: bloqueio do event store, APIs paralelas e custo crescente de migração.
- Correção requerida: migrar consumidores em ondas com testes de comportamento e remover cada exceção somente após equivalência observável.

#### AUD-029 — estrutura documental incompleta

- Prioridade: P1.
- Evidência: numa amostra de 125 páginas, 113 não tinham resumo, 115 não tinham conteúdo navegável e 117 não tinham nota para desenvolvimento.
- Risco: leitores não identificam propósito, navegação nem implicações de manutenção de forma consistente.
- Correção requerida: aplicar a estrutura por audiência e tipo documental em ondas, começando por páginas públicas e de alto tráfego, com gate calibrado ao corpus aplicável.

#### AUD-030 — READMEs públicos com contrato incompleto

- Prioridade: P1.
- Evidência: `packages/client/store`, `packages/client/ui-approval` e `packages/client/ui-session` não descrevem integralmente uso, ownership e integração.
- Risco: consumidores dependem de leitura do código e podem usar serviços fora do lifecycle esperado.
- Correção requerida: completar README e JSDoc juntos, incluindo provider, consumer, descarte, falhas e invariante quando houver.

#### AUD-031 — ordem inconsistente nos READMEs

- Prioridade: P2.
- Evidência: 101 READMEs posicionam `Runtime invariant` depois de `Development note`.
- Risco: contratos operacionais ficam abaixo de informação interna e o template deixa de ser previsível.
- Correção requerida: reordenar mecanicamente onde aplicável e proteger a ordem no gate documental.

#### AUD-032 — exceção de i18n não documentada

- Prioridade: P2.
- Evidência: `docs/audits/` está excluído do manifesto de pareamento, mas a política de i18n não explica o motivo e os limites da exceção.
- Risco: novos documentos podem usar a exclusão como precedente indevido.
- Correção requerida: documentar que auditorias do fork são artefatos locais em português, definir ownership e impedir expansão silenciosa da exceção.

#### AUD-033 — orçamento documental divergente

- Prioridade: P2.
- Evidência: política e manifesto de orçamento não descrevem o mesmo conjunto de exceções e vários limites têm pouca margem.
- Risco: edições necessárias falham sem critério claro ou incentivam aumento contínuo de teto.
- Correção requerida: reconciliar a fonte canônica, medir crescimento e exigir justificativa explícita para qualquer aumento.

#### AUD-034 — título legado em Agent Notes implementadas

- Prioridade: P2.
- Evidência: quatro notas ativas usam `## Risks` em vez do título atual prescrito.
- Risco: inconsistência estrutural e falha futura de ferramentas que dependam do vocabulário atual.
- Correção requerida: migrar somente notas ativas e não tocar arquivos arquivados congelados.

#### AUD-035 — dívida estática sem orçamento por responsável

- Prioridade: P2.
- Evidência: 90 linhas de depreciação, 263 supressões de lint, 53 marcadores `TODO`/`FIXME`/`XXX`, 1.625 usos explícitos de `any` e sete testes ignorados no corpus medido.
- Risco: a dívida cresce sem indicar concentração, urgência ou limite aceitável por owner.
- Correção requerida: definir contadores canônicos, orçamentos não crescentes e ondas de redução; não converter contagem em substituição mecânica sem análise de limite tipado.

### Baixo impacto

#### AUD-036 — resíduo de planejamento em Agent Notes

- Prioridade: P2.
- Evidência: notas implementadas preservam trechos que narram plano ou revisão em vez da decisão durável.
- Risco: a autoridade normativa fica misturada a histórico transitório.
- Correção requerida: revisar notas ativas com o padrão de prosa e de vazamento de raciocínio; não editar o arquivo congelado de notas arquivadas.

#### AUD-037 — comentário de módulo quebrado

- Prioridade: P3.
- Evidência: comentário em `packages/client/store/src/index.ts` contém `uSES` e `NO selector hook`.
- Risco: baixa clareza e aparência de texto não revisado numa superfície pública.
- Correção requerida: reescrever a frase em linguagem direta e executar os gates de JSDoc e prosa aplicáveis.

## Pontos fortes preservados

1. O verificador de entrypoints confirmou que aplicações suportadas continuam iniciadas pelos perfis `dsh`.
2. Formatos de Session v0–v3, migrações, releases e catálogos passaram os validadores dedicados.
3. Waterfalls inspecionados delegam com `next()` e registros de lifecycle usam efeitos ou listeners descartáveis.
4. Os 39 companions de invariantes e cerca de 200 configurações Cordis avaliadas passaram.
5. A proteção contra escape por symlink no servidor estático está presente.
6. Constraints, catálogos e paths TypeScript estavam atuais nos verificadores correspondentes.
7. O detector de duplicação reportou zero clones.
8. O manifesto reconheceu 1.027 pares bilíngues.
9. Workflows declaram permissões e a instalação usa lockfile congelado.

## Limitações

Este relatório mede o estado observado em 2026-09-21 e não afirma que cada falha pertence ao mesmo autor ou mudança. A árvore suja impede atribuição perfeita a um commit. Testes de API real que dependem de credenciais, sinais de plataformas externas e publicação real não foram usados para converter o veredito em aprovação. Os itens sensíveis à carga exigem repetição controlada antes de qualquer correção especulativa.

## Nota para desenvolvimento

O pacote de remediação mantém os IDs `AUD-001` a `AUD-037` imutáveis. O estado vivo, responsáveis, próxima ação, tentativas e evidências devem permanecer em `.agent/state.json`, `.agent/backlog.json`, `.agent/plans/` e nos ledgers definidos pelo framework de engenharia; este documento não é uma segunda fonte de status.
