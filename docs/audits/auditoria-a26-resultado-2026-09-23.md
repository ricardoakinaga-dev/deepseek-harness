# Auditoria do resultado A26 — 2026-09-23

Esta auditoria avalia a entrega de testes consumidores de `AAA-022:A26` na árvore `custom/main` observada em 2026-09-23. O [relatório revisado do sistema](relatorio-sistema-2026-09-23-revisao-a26.md) avalia o restante do repositório; o [estado operacional](../../.agent/state.json) continua a fonte de status vivo.

## Resumo

**Veredito para o escopo A26: aprovado com ressalva de integração.** Os três arquivos autorizados têm os hashes finais registrados, os cinco consumidores reservados à verificação conservam os hashes iniciais, e a repetição independente do lote executou **341/341 testes em 12 arquivos**. A conclusão de `AAA-022` permanece bloqueada por falhas agregadas fora do escopo A26; este resultado não qualifica o candidato de release.

## Escopo e método

Comparei a [autorização](../../.agent/evidence/AAA-022/a26-consumer-test-scope-authorization-20260923.json), o [fingerprint inicial](../../.agent/evidence/AAA-022/a26-consumer-test-gate-fingerprint-20260923.json), a [evidência de execução](../../.agent/evidence/AAA-022/a26-consumer-test-verification-20260923.json), o diff dos três testes e os hashes dos oito consumidores. Reexecutei o lote Vitest, TypeScript e Oxlint por pacote, `git diff --check` nos três arquivos, a política de customização, o medidor, o grafo, o verificador de tipos da documentação e o verificador de estado. Os resultados abaixo pertencem à árvore atual; a matriz do [candidato A28](../../.agent/evidence/AAA-023/candidate-identity-a68.json) pertence a outro commit.

| Critério | Resultado | Evidência e limite |
|---|---|---|
| Escopo autorizado | PASS | Os três hashes finais coincidem com A26; os cinco hashes de verificação coincidem com o fingerprint anterior. O diff local dos três arquivos contém apenas testes. |
| Comportamento local | PASS | Repetição de 12 arquivos e 341 testes aprovada; Vitest emitiu `MaxListenersExceededWarning` não fatal. |
| Tipos, lint e whitespace locais | PASS | TypeScript dos oito projetos, Oxlint dos caminhos declarados e `git diff --check` dos três testes terminaram com código zero. |
| Política de customização global | FAIL | 302 diagnósticos: 283 caminhos sem responsável e 19 com múltiplos responsáveis; nenhum nomeia os três arquivos A26 ou `interaction-session-reader-invariants`. |
| Documentação e medição agregadas | PARCIAL | `verify-module-graph` passou com três artefatos atuais e `doc-typecheck:contracts-ready` passou; `doc-typecheck` completo falhou na compilação host com 10 erros em cinco testes, e `audit:metrics` falhou por um caminho antigo de `ContextMeter.tsx`. O `doc-sync` teve seis falhas agregadas fora dos novos relatórios após a correção focada de uma referência criada nesta auditoria. |
| Integridade do estado do programa | FAIL | O verificador reproduziu 359 achados, iguais à base A25. Igualdade de contagem significa ausência de novos achados nessa comparação, não aprovação dos registros. |

## Revisão do conteúdo dos testes

Os testes de permission presets passaram a criar sessões registradas no `SessionStore` quando exercitam projeções, e a medir eventos relativos ao baseline da criação. Casos que constroem uma semente histórica continuam usando uma Session isolada. O caso de sessão já existente sem baseline exato agora afirma a rejeição e a ausência de publicação de serviço, em concordância com a semântica estrita implementada antes de A26.

Os testes de plan mode montam `SessionStore` antes do registro das projeções e obtêm a sessão pelo store quando ele está disponível. Os testes de Bash substituem a sessão fictícia por uma sessão do store, observam eventos publicados pelo contexto e preservam as asserções de escalonamento e cancelamento. Essas mudanças fazem os fixtures seguirem o ciclo de vida usado pela implementação. A revisão não encontrou alteração de produção ou documentação atribuída a A26.

## Achados e limites

1. **A26-01 — bloqueio de integração, alto:** o comando completo de tipos da documentação continua com 10 diagnósticos em `agent-instructions.spec.ts` (5), nos dois testes de `time-context` (3), em `agent-loop/resume.spec.ts` (1) e em `session-projection-cache/fixtures.spec.ts` (1). O próximo escopo deve usar os cinco caminhos exatos e a saída da compilação, sem atribuir o erro aos três testes A26.
2. **A26-02 — ownership global, alto:** os 302 diagnósticos da política pertencem à árvore ampla. A atribuição deve distinguir 283 caminhos sem owner e 19 com múltiplos owners, preservando o critério de um responsável por delta.
3. **A26-03 — observabilidade do estado, médio:** os 359 achados do verificador de estado continuam presentes. O backlog de `AAA-023` ainda descreve `A16` como alvo de sua ação de espera, apesar de `A16` estar concluída e `AAA-022:A27-AGGREGATE-SCOPE` ser a ação ativa. A sincronização desse ponteiro exige uma transação operacional própria.
4. **A26-04 — aviso de teste, baixo:** a repetição emitiu `MaxListenersExceededWarning` para listeners de `process.exit`; não houve falha. Identificar o proprietário do listener se o aviso se repetir sob a mesma carga, sem elevar o limite global para mascará-lo.
5. **A26-05 — documentação gerada, médio:** além dos tipos host, `doc-sync` encontrou grafo de eventos, catálogos de configuração e persistência e histórico de tipos persistidos desatualizados. O catálogo de ferramentas falhou porque `@deepseek-ai/dsh-plugin-manager` iniciou sem registrar ferramenta; diagnosticar montagem e serviços requeridos antes de regenerar. O comando agregado terminou com 36 gates aprovados e 7 falhos; uma dessas falhas era uma referência a caminho antigo escrita neste relatório e foi corrigida, seguida de `verify-package-paths` PASS em 5.180 arquivos. Os seis demais gates continuam sem PASS agregado.

A relação `AAA-022` bloqueada / `AAA-023` em andamento com dependência de `AAA-022` também aparece entre os achados do verificador. O relatório não classifica os 359 registros como falhas do produto nem os elimina por comparação com a base.

## Próxima etapa

Executar a decisão `AAA-022:A27-AGGREGATE-SCOPE`: registrar uma proposta de escopo exato para os cinco arquivos com 10 erros, produzir o inventário de 302 caminhos e seus owners, e obter a decisão de autoridade antes de editar caminhos adicionais. O [roadmap revisado](roadmap-50-melhorias-2026-09-23-revisao-a26.md) define a passagem seguinte.
