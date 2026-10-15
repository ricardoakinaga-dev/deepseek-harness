# Propostas de correção da auditoria de sessão DSH de 2026-10-12

Este documento registra os desenhos da [auditoria de sessão](auditoria-sessao-dsh-2026-10-12.md) e as decisões de implementação no branch `custom/session-audit-fixes-20261012`. Os mecanismos descritos como base pertencem à revisão auditada; o estado da implementação está na tabela seguinte. A implementação passou nas verificações locais descritas abaixo, e o comando `dsh` usa o worktree recompilado. Push e merge em `custom/main` não foram feitos.

## Estado da implementação

| Item | Decisão e alcance |
|---|---|
| Corpus e política | Corrigida a sobreposição de donos e atualizados os schemas de `goal`; replay das interfaces concluído: 191 testes passaram e dois foram ignorados. |
| P1-3 | Descritor e evento `sandbox/environment`, contexto antes da ação, `/tmp` com modo 1777 e probe dos argumentos reais. Diretório temporário compartilhado por sessão permanece proposto; persistência, donos e grupos não foram corrigidos por essa mudança. |
| P1-4 | Parâmetros opcionais `sandboxMode` e `toolFilter` só estreitam a autoridade efetiva. Aprovação permanece `never` na delegação. O cartão usa a observação `subagent/authority`, sem tratar argumentos pedidos como autoridade confirmada. |
| P1-5 | Bash usa uma janela limitada de início/fim; leitores incrementais e LSP mantêm a semântica de cauda. A política de spill unifica o aviso e o caminho de recuperação. |
| P1-6 | `runtime/audit` registra identidade do launcher, perfil, bundles e valores resolvidos marcados com `audit: true`; recargas registram mudanças. Gate e validador recusam seleção de segredos. O hash não identifica os bytes de todas as dependências. |
| P1-7 | Todos os arquivos regulares apresentados, inclusive internos ao workspace, são capturados até `maxFileBytes` (padrão 20 MiB). Arquivos maiores recebem estado explícito. O exportador reconhece as novas referências e a UI oferece o download autenticado da cópia. |
| P2-8 | Projeção identifica corpos íntegros de chamadas diretas de `skill`; repetição retorna referência curta e remoção por compactação permite recarga. A UI informa caracteres carregados, sem afirmar contagem exata de tokens atualmente ativos. |
| P2-9 | Segunda listagem respeita regras de ignore; arquivos não ignorados vêm primeiro. A marca inclui `.gitignore` e `.ignore`, sem confundir isso com rastreamento pelo Git. |
| P2-10 | Igualdade exata com a última mensagem efetivamente entregue ao pai na mesma ativação. O encerramento mantém seu status e referencia a mensagem; `outputSchema` continua opcional. |
| P2-11 | `developmentContext: auto/always/never` separa o contexto de desenvolvimento da orientação da GUI. O usuário escolheu manter o título automático somente da primeira mensagem. |

Os eventos novos são registros ordinários reconhecidos pelo leitor atual, não eventos `ignorable`; leitores anteriores podem recusá-los. O [reconhecimento de persistência](../persistence-changes/2026-10-12-session-audit-facts.md) documenta essa compatibilidade. A criação dos registros de runtime ocorre na publicação do agente, depois dos observadores que estabelecem a política inicial da sessão.

## Pré-requisito comum: corpus de snapshots

A reprodução inicial encontrou 118 de 140 cenários headless com falha, principalmente pelo schema de `goal` sem atualização dos arquivos de referência. A política tinha cerca de 376 erros, quase todos sobreposições envolvendo `goal-required-task-completion`. A rodada atual corrige esses donos e atualiza os pins pelos runners oficiais. Snapshots antigos de formatos históricos são preservados; o resultado final requer replay sem escrita, não apenas refresh.

## P1-3 — Semântica da sandbox Linux

**Resultado esperado.** O modelo sabe, antes de agir, como `/tmp`, donos de arquivos e grupos se comportam no runner ativo, e o log registra qual runner executou cada sessão. Arquivos temporários trocados entre bash, jobs e ferramentas de arquivo deixam de sumir.

**Base auditada e mecanismos disponíveis.**

- `sandbox-policy` monta o texto de contexto de runtime sem conhecer o runner (`renderPolicyContext` em `packages/sandbox/sandbox-policy/src/index.ts`, com o comentário "Render the policy without claiming which capabilities are mounted").
- `sandbox-local` escolhe o runner por plataforma e probe, e `confine()` devolve só `enforcement`.
- O `/tmp` efêmero por chamada é uma garantia documentada (`packages/sandbox/sandbox-local/README.md:75`) e testada.

**Proposta em quatro partes independentes:**

1. **Fatos do runner no contrato do provedor.** O provedor de sandbox passa a publicar um descritor do mundo de execução: runner, enforcement, `/tmp` persistente ou efêmero, compartilhado ou não com as ferramentas de arquivo, e mapeamento de identidade (donos de root e grupos suplementares vistos como 65534). O renderizador de contexto consome esse descritor quando ele existe e mantém o texto atual quando não existe. Tipo: `upstream-package-change` na seam de sandbox, porque a fronteira atual proíbe a política de presumir o provedor.
2. **Runner no log.** O evento reconhecido `sandbox/environment` registra o descritor na primeira resolução de cada sessão. Exige atualizar `SessionEventMap`, o catálogo de persistência, o reconhecimento de tipos e as projeções dos dois SDKs.
3. **`--perms 1777`.** Restaura o modo do host, mas não corrige os testes que dependem de dono root ou de grupos mapeados. A opção exige bubblewrap 0.5 ou mais recente; o probe do runner precisa usar os mesmos argumentos do perfil `workspace-write`, para que uma versão antiga caia para Landlock em vez de falhar na execução.
4. **Diretório temporário por sessão.** Monta um diretório do host, criado por sessão com modo 1777, como `/tmp` de toda chamada bash e job da sessão. Também exporta `TMPDIR` para ele e faz as ferramentas de arquivo resolverem `/tmp` para o mesmo diretório quando o provedor isola `/tmp`. Exige Agent Note de arquitetura, porque substitui a garantia documentada.

**Decisões em aberto:**

- Se subagentes compartilham o diretório do pai ou recebem o próprio.
- O que acontece com o diretório na retomada da sessão: recriado vazio ou preservado.
- O momento da limpeza e o limite de espaço.
- Como as ferramentas de arquivo distinguem o `/tmp` do host do `/tmp` da sessão em Landlock e Seatbelt, onde hoje são o mesmo.

**Aceite.**

- Um e2e bwrap cobre `write` seguido de bash, job em segundo plano seguido de bash, e `stat` de `/tmp`.
- O texto de contexto e o evento identificam o runner.
- O teste que verifica que o `/tmp` do host fica intacto continua passando.
- Os snapshots `workspace-write` são regenerados.

## P1-4 — Estreitamento de autoridade por delegação

**Resultado esperado.** O agente principal pede um filho somente leitura, e a sandbox, não o texto do prompt, garante isso.

**Base auditada e mecanismos disponíveis.**

- `ResolvedSubagentStartRequest.toolFilter` já aceita filtro de ferramentas por início de filho (`packages/subagent/subagent/src/types.ts`), e o provedor `spawn` declara `toolFilter: true`.
- A ferramenta `subagent` só expõe `toolFilter` na configuração da implantação, igual para todos os filhos.
- O modo de sandbox do filho é copiado do override do pai (`overrideOf(parent.session)` em `packages/subagent/subagent/src/child-agent.ts:253`) e registrado com `source: 'delegation'`.

**Proposta.**

- Acrescentar a `ResolvedSubagentStartRequest` um `sandboxMode` que só estreita, com capacidade de provedor declarada e rejeição na partida quando o pedido amplia a autoridade do pai.
- Expor na ferramenta `subagent` um parâmetro opcional que mapeia para esse campo e para `toolFilter`, ou presets nomeados (`reviewer`, `explorer`) definidos na configuração.
- Mostrar a autoridade efetiva no cartão do subagente.

Tipo: `upstream-package-change` em `subagent` e `tool-subagent`.

**Obrigações.** O schema da ferramenta é visível ao modelo; mudam os arquivos de referência de schema dos snapshots e as projeções dos dois SDKs. O evento `sandbox/mode` com `source: 'delegation'` já registra o modo efetivo do filho.

**Medida provisória por configuração.** Um `toolFilter` de implantação pode remover `subagent` e `subagent_fork` de todos os filhos. Ele não impede escrita via bash.

**Decisão.** Parâmetros opcionais por chamada; filtros são intersectados com as ferramentas efetivas do pai e da implantação. A delegação não concede aprovação interativa.

**Aceite.**

- Um filho criado como somente leitura tem a escrita via bash negada pela sandbox.
- Um pedido que amplia a autoridade é rejeitado na partida.
- Os snapshots de SDK refletem o schema.

## P1-5 — Retenção e aviso único da saída do bash

**Resultado esperado.** A saída longa do bash preserva início e fim, e o modelo recebe um único aviso de truncamento com um único caminho para a saída completa.

**Base auditada e mecanismos disponíveis.**

- `OutputCollector` (`packages/subprocess/subprocess-local/src/output.ts`) guarda só a cauda em memória, por decisão documentada no próprio código: erros e resultados finais se concentram no fim. O arquivo de spill cobre o início.
- O coletor é compartilhado por bash, pwsh, jobs e stderr de servidores de linguagem.
- `tool-bash` acrescenta `[output truncated; full output: …]` (`packages/shell/tool-bash/src/render.ts`), e a `spill-policy` aplica depois o próprio orçamento, com outro aviso e outro arquivo.
- `dsh-output-retention` já oferece `TextRetainer` com estratégia `headTail`.

**Proposta.**

- Tornar a estratégia do coletor configurável por consumidor, mantendo a cauda como padrão para diagnósticos de servidor de linguagem.
- Usar início e fim no bash, por exemplo 20% e 80% do limite, com corte em fronteira de linha.
- Para o aviso único, a `spill-policy` reconhece o resultado já truncado pelo subprocesso e reaproveita o caminho existente em vez de criar um segundo arquivo, ou o `tool-bash` deixa o aviso final a cargo da `spill-policy`.

Tipo: `upstream-package-change` em `subprocess-local`, `tool-bash` e `spill-policy`. Exige atualizar a justificativa registrada no código e, se a decisão for durável, uma Agent Note.

**Decisão.** O consumidor bash configura a parcela inicial da janela; o padrão preserva aproximadamente 20% de início. A política de spill é dona do orçamento final e reaproveita a recuperação completa existente.

**Aceite.**

- Um teste com saída grande preserva a primeira e a última linha e emite um único aviso.
- O stderr de servidor de linguagem continua guardando só a cauda.
- Os snapshots `bash-spill` e semelhantes são regenerados.

## P1-6 — Identidade do runtime e configuração efetiva no log

**Resultado esperado.** Um auditor encontra no JSONL exportado a versão, o build, o estado da árvore, o perfil, os bundles e os valores efetivos das configurações que alteram requisições e ferramentas, inclusive mudanças durante a sessão. Nenhum segredo entra no log.

**Base auditada e mecanismos disponíveis.** `app-boot` conhece perfil, bundles e raiz do checkout. O loader aplica as recargas ao vivo de patch (`patchReload: live`). O cabeçalho `session` registra só formato, id, cwd e preset.

**Proposta.**

- Na publicação de cada agente, emitir o evento reconhecido `runtime/audit` com a identidade do runtime.
- Emitir também os valores de uma lista explícita de campos auditáveis, declarada pelo dono de cada plugin no schema de configuração. Exemplos: `compactionReasoningEffort`, `compactionReasoningEffortByRoute`, `retryPolicy`, `exemptTools` e `toolFilter`.
- A cada recarga ao vivo que altere um campo auditável, emitir um evento com o caminho e o valor novo.
- O digest acompanha somente os valores declarados auditáveis; o hash do launcher identifica esse artefato, sem afirmar identidade de toda a árvore compilada.

Tipo: `upstream-package-change` em `app-boot`, no loader e no schema de configuração.

**Obrigações.** Novos membros em `SessionEventMap` com reconhecimento na leitura, entradas no catálogo de persistência, projeções dos dois SDKs e snapshots. A marcação de campo auditável precisa de um gate que rejeite campos com segredo.

**Decisão.** A marca `audit: true` pertence ao schema do plugin. Cada agente publicado registra sua identidade corrente, incluindo filhos e retomadas.

**Aceite.** A partir apenas do export, um teste encontra `compactionReasoningEffortByRoute` e o momento em que mudou. Um campo de credencial nunca aparece.

## P1-7 — Captura durável dos entregáveis apresentados

**Resultado esperado.** O conteúdo apresentado ao usuário sobrevive à limpeza de `/tmp` e chega ao export, com hash conferível.

**Base auditada e mecanismos disponíveis.**

- `deliverables/presented` registra só caminho e descrição (`packages/deliverables/tool-present/src/types.ts`).
- O export dispõe de leitura de anexos genéricos, mas enumera explicitamente os tipos de evento e precisa reconhecer cada nova referência (`packages/session-query/session-log-export/src/archive.ts`).

**Proposta.**

- No momento da apresentação, copiar cada arquivo para o armazenamento de anexos como anexo genérico endereçado por conteúdo.
- Acrescentar ao `PresentedFile` uma referência opcional ao anexo, com tamanho e SHA-256.
- Respeitar um limite de tamanho configurável: um arquivo maior é registrado como não capturado, com o motivo.
- O exportador recebe reconhecimento explícito das referências em `deliverables/presented` e inclui seus bytes.
- A UI avisa quando um arquivo apresentado está fora do workspace.

Tipo: `upstream-package-change` em `tool-present`, `session-log-export` e `ui-deliverables`.

**Obrigações.** O campo novo é uma mudança de tipo persistido e exige o reconhecimento descrito no [cookbook de tipos persistidos](../cookbook/reviewing-persistence-type-changes.md), além das projeções dos SDKs e de snapshots.

**Decisão.** Limite padrão de 20 MiB por arquivo, configurável, com captura também dentro do workspace.

**Aceite.** Apagar o arquivo original depois da apresentação não altera o export, que reproduz os bytes com o hash registrado.

## P2-8 (restante) — Recarga de skill e custo de contexto

A isenção de `skill` na poda e as duas partes seguintes estão implementadas:

- **Recarga de skill já ativa.** A ferramenta `skill` responde com uma referência curta quando a mesma skill já está ativa e não podada. Exige uma projeção de sessão das skills carregadas, porque a Agent Note de leituras síncronas proíbe procurar no histórico.
- **Tamanho da carga de skill.** A UI mostra os caracteres do texto completo carregado, incluindo sua moldura. Não é uma medida de tokens nem do saldo atual após compactações posteriores.

Tipo: `upstream-package-change` em `tool-skill` e no cliente. A referência curta remete ao corpo ainda íntegro; uma nova chamada retorna o corpo completo quando a projeção identifica que ele foi removido.

## P2-9 — Arquivos ignorados no `glob`

**Base auditada e mecanismos disponíveis.** `glob` usa `rg --files --no-ignore --hidden` por decisão deliberada (`packages/fs/tool-fs-search/src/glob.ts`).

**Proposta.** Rodar uma segunda listagem que respeita as regras de ignore, para marcar cada entrada ignorada e ordenar as não ignoradas primeiro. Tipo: `upstream-package-change`.

**Decisões em aberto.** O custo da segunda varredura em árvores grandes; o formato da marcação, por exemplo um grupo separado "ignorados pelo Git".

**Aceite.** Um teste com `.gitignore` marca a entrada ignorada, e os snapshots com `glob` são regenerados.

## P2-10 — Resultado duplicado de subagentes

**Base auditada e mecanismos disponíveis.** `createSettlementMessage` (`packages/subagent/subagent/src/continuation-messages.ts`) repete o texto de encerramento do filho no aviso de conclusão, mesmo quando o filho já entregou o relatório por `send_message`.

**Proposta.** Quando o texto de encerramento repete a última mensagem enviada ao pai, o aviso de conclusão a referencia em vez de repeti-la. Oferecer também um formato estruturado de retorno (achados, escopo, status `PASS`/`FAIL`/`NOT_RUN`, evidência e limites) pelo `outputSchema` que o provedor `spawn` já suporta. Tipo: `upstream-package-change`.

**Decisão.** Igualdade exata apenas dentro da mesma ativação e após entrega efetiva. O formato estruturado permanece opt-in.

**Aceite.** Um snapshot com `send_message` seguido de encerramento mostra o relatório uma única vez no contexto do pai.

## P2-11 — Contexto de desenvolvimento do DSH e título da sessão

**Contexto de desenvolvimento.** O bloco do checkout e a orientação de HMR vêm do `web-app` (`packages/bundle/web-app/src/index.ts:233-240`) quando `surfaceContext` está ligado. Desligar `surfaceContext` no perfil remove os dois blocos hoje, mas também remove a orientação "esta GUI". Proposta: separar a orientação da GUI do bloco de autodesenvolvimento e incluir este só quando o cwd estiver dentro do checkout do DSH, com override explícito em configuração. Tipo: `upstream-package-change` em `web-app`.

**Título.** O bundle base monta `session-title-first-prompt-llm`, que titula só o primeiro prompt. O provedor `session-title-all-prompts-llm` já regenera o título a cada novo prompt. Esse provedor exige uma chamada de título por prompt. O usuário escolheu manter o provedor da primeira mensagem; não há troca de configuração neste item. Tipo: `configuration`/`profile-patch`.

## Ordem sugerida

1. Regenerar o corpus de snapshots afetado pela ferramenta `goal`, pelo dono do registro correspondente.
2. P2-11, título por configuração, se o custo for aceito.
3. P1-7 e P1-4, que reaproveitam mecanismos existentes (anexos e `toolFilter`).
4. P1-6, que define a marcação de campos auditáveis usada depois pelas outras mudanças de configuração.
5. P1-3, partes 1 a 3; a parte 4 depende da Agent Note.
6. P1-5, P2-9, P2-10 e o restante do P2-8.

## Validação da implementação

O replay sem escrita passou em 191 testes, com dois ignorados; os 22 gates de documentação passaram. Passaram também o lint completo, os builds Host/Client/Web, 24 testes de navegador e os cenários empacotados de sessão avançada, recuperação e reinício do SDK Python. Os 62 testes do harness Python e controles negativos verificam preservação de configurações, eventos de recarga e relações entre identidades normalizadas. Gerações históricas já registradas no Git foram preservadas.

O perfil Web local usa os pacotes recompilados e respondeu HTTP 200 no smoke autenticado; o login Codex existente foi mantido. O pacote de evidências está em `~/Downloads/dsh-session-audit-fixes-2026-10-12/`, com manifesto SHA-256. A sessão longa com provedor real continua pendente; esses resultados não qualificam o repositório como AAA.
