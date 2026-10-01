# Verificação da integração upstream 0.1.7-rc.2 — 2026-09-27

Este relatório é um artefato congelado do fork, escrito em português e excluído do pareamento bilíngue. Ele registra a verificação independente feita por um segundo agente enquanto o Codex conduz o merge de `master` (upstream 0.1.7-rc.2, 1963 commits) em `custom/main` no checkpoint local anterior à integração. Ele não substitui o backlog canônico, o ExecPlan nem os ledgers em `.agent/`; o Codex deve absorver cada achado neles antes de selar o merge.

## Resumo

A árvore com o merge ainda não commitado passa `typecheck`, `lint` e `doc-sync` (44/44) e os 857 testes do pacote `schedule`. O merge quebrou a preservação dos marcadores de cobertura em 41 arquivos vindos do upstream; a correção estrutural já está aplicada e verificada nesta árvore. Dezenove caminhos com delta customizado voltaram à versão upstream; a maioria é obsoleta ou já foi tratada pelo Codex, mas o patch `schedule-session-projection-readers` em `src/index.ts`, `src/runtime.ts` e `src/tools.ts` precisa de disposição explícita. Um ramo customizado em `plugin-manager` ficou inalcançável. O verificador da política não roda no meio do merge, e os ledgers de `.agent/` não registram a integração upstream.

## Estado dos gates nesta árvore

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | 0 erros, saída 0 |
| `pnpm run lint:contracts-ready` | saída 0 |
| `pnpm run doc-sync` | 44 aprovados, 0 falhas, 0 pulados |
| `vitest run packages/schedule/schedule` | 20 arquivos, 857 testes aprovados |
| `git diff --check` (índice e árvore) | sem espaços residuais |
| `node scripts/verify-customization-policy.mjs` | não executa: `master` não é ancestral de `HEAD` durante o merge |

## Achado 1 — marcadores de cobertura do upstream perdidos no esbuild

O fork exige `/*! v8 ignore` porque o esbuild remove comentários comuns antes do remapeamento de cobertura; o upstream continua escrevendo `/* v8 ignore`. Após o merge, 41 arquivos em `packages/` e `apps/` carregam a grafia comum: 27 são arquivos novos do upstream e 14 misturam as duas grafias. A cobertura focada de `packages/boot/plugin-manager` confirmou a perda: as linhas descobertas 195, 459, 568, 578, 650, 690 e 697 de `src/index.ts` seguem exatamente cada marcador comum.

Correção aplicada: `scripts/coverage-ignore-comments.ts` fornece um transform `pre` que promove `/* v8 ignore` à grafia legal antes do esbuild e o transform `post` já existente que restaura a grafia do parser; `vitest.config.ts` importa ambos nos três conjuntos de plugins. `scripts/coverage-ignore-comments.spec.ts` cobre promoção, restauração, ausência de dupla marcação e ordem. `docs/testing.md`, `docs/testing.zh.md` e a nota `2026-06-11-quality-gates` descrevem as duas grafias; o registro `coverage-marker-preservation` na política lista os dois arquivos novos. Após a correção, `plugin-manager`, `tool-workflow` e `ui-jobs` não têm mais declaração descoberta por marcador. A consequência prática é que futuros merges deixam de exigir a reescrita dos marcadores em cada arquivo upstream.

## Achado 2 — deltas customizados substituídos pela versão upstream

O merge deixou dezenove caminhos, fora pares `.zh.md` e `.i18n.yaml`, idênticos ao upstream embora `custom/main` os tivesse alterado:

- `packages/schedule/schedule/src/index.ts`, `src/runtime.ts`, `src/tools.ts` e os três specs `plugin`, `runtime` e `tools`: o patch `schedule-session-projection-readers` (331 linhas) caiu porque o upstream reescreveu o pacote (3809 inserções, 2013 remoções) e apagou `src/projection.ts`. A árvore mantém `projection.ts` e `invariant.ts` customizados, que o Codex está adaptando aos novos tipos. O registro da política precisa refletir a disposição final: readaptar o patch, retirá-lo ou reduzi-lo aos caminhos ainda customizados.
- `packages/schedule/schedule/README.md`, `docs/subsystems/schedule.md` e a nota `2026-08-05-durable-web-schedule.md`: a documentação do patch acima voltou ao texto upstream; deve acompanhar a disposição escolhida.
- `packages/boot/app-boot/src/profile-resolution/legacy-links.ts`, `packages/client/ui-chat/src/client/chat/ChatView.tsx` e `packages/llm/llm-deepseek/src/adapter.ts`: o delta era só a grafia `/*!` e o upstream removeu esses marcadores; nada a fazer.
- `packages/client/ui-agent-preset/tests/*.client.spec.*`: mesmo caso de grafia de marcador em testes; com o Achado 1 corrigido, nada a fazer.
- `apps/desktop/scripts/prepare-primary-runtime.ts` e `apps/desktop/tests/primary-runtime-preparation.spec.ts`: o upstream moveu o script para `scripts/primary-runtime/`, que já usa `safeExtractZip`; o Codex já adicionou os caminhos novos à política.
- `scripts/install-lefthook.spec.ts`: o fork trocava `import.meta.resolve` por `createRequire`; o upstream manteve `import.meta.resolve` e o spec passa no runner atual, então o patch pode ser retirado do registro `runtime-resolution-and-ci-fixtures`.
- `packages/client/ui-sidebar-documentpreview/src/client/pdf/LazyPdfBody.tsx`: o fork apontava o import de CSS para `document-preview.module.css`; o upstream removeu esse import, e nenhum arquivo da árvore importa mais `TextPreview.module.css`, então nada a fazer.
- A nota `2026-09-09-plugin-management-in-the-web-sidebar.md`: o fork reescrevia uma frase de rejeição; o texto upstream volta a valer.

Dezessete caminhos listados na política não existem mais na árvore; os principais são o antigo pacote `agent-presets` (renomeado para `agent-preset`), o pacote `settings-file`, o antigo diretório de protocolos do DeepSeek e o antigo script de extração do desktop. Os registros `coverage-marker-preservation`, `dependency-security-remediation`, `package-source-export-policy`, `runtime-resolution-and-ci-fixtures` e `schedule-session-projection-readers` precisam ser atualizados antes de o verificador rodar.

## Achado 3 — ramo customizado inalcançável em `plugin-manager`

Em `packages/boot/plugin-manager/src/index.ts`, o código customizado de `allowedPublishers` chama `this.publisherRefusal(named.name ?? parsed.name, latest)` logo após uma linha upstream que garante `named.name`. O braço `?? parsed.name` não executa em nenhum teste, e a cobertura por arquivo permanece em 98,54% de ramos mesmo com o Achado 1 corrigido. Remover o `??` ou cobrir o caso resolve o gate.

## Achado 4 — governança do merge

`.agent/state.json`, `backlog.json` e `execution-log.jsonl` param em 2026-09-24 (`AAA-022:A24`); a integração upstream não tem evento, ação nem evidência registrada, embora o Quality Bar exija um ensaio de atualização upstream para `AAA-023`. Antes de commitar o merge, o Codex deve registrar a ação, executar `node scripts/verify-customization-policy.mjs` com a política atualizada assim que `master` voltar a ser ancestral, e rodar `pnpm run test:coverage` completo, pois a cobertura focada desta verificação não substitui o gate.

## Arquivos alterados por esta verificação

- `scripts/coverage-ignore-comments.ts` e `scripts/coverage-ignore-comments.spec.ts` (novos)
- `vitest.config.ts`
- `docs/testing.md`, `docs/testing.zh.md`, `docs/testing.i18n.yaml`
- `.agents/notes/implemented/process/2026-06-11-quality-gates.md`, `.zh.md`, `.i18n.yaml`
- `.agents/customization-policy.json` (dois caminhos no registro `coverage-marker-preservation`)
- este relatório
