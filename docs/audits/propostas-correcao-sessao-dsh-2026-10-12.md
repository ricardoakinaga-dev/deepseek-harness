# Propostas de correção da auditoria de sessão DSH de 2026-10-12

Este documento detalha as correções da [auditoria de sessão de 2026-10-12](auditoria-sessao-dsh-2026-10-12.md) que exigem decisão de desenho antes do código. Os itens P0-1, P0-2 e a isenção de ferramentas na poda (parte do P2-8) já foram implementados no branch `custom/session-audit-fixes-20261012`, com registros próprios em `.agents/customization-policy.json`. Para cada item restante, a proposta segue a sequência do [padrão de melhorias](../customization/improvement-development-standard.md): resultado esperado, dono atual, mecanismos existentes, tipo de solução, obrigações de compatibilidade, decisões em aberto e evidência de aceite.

## Pré-requisito comum: corpus de snapshots

Em `custom/main`, 118 de 140 cenários headless falham no replay. A causa principal é a mudança do schema da ferramenta `goal` (`required_tasks`, `task_status`) do registro `goal-required-task-completion`, que está como `proposed`: os arquivos de referência de schema dos cenários-pin não foram regenerados. O verificador da política de customização também acusa cerca de 376 erros, quase todos arquivos com mais de um dono envolvendo esse mesmo registro.

Todas as propostas abaixo que mudam texto, schema ou transcrição visível ao modelo dependem de um corpus de snapshots verde para produzir evidência limpa. Regenerar esses snapshots cabe ao dono do registro `goal-required-task-completion`. Até lá, cada mudança pode registrar o próprio cenário, mas o replay continuará falhando na verificação de header herdada.

## P1-3 — Semântica da sandbox Linux

**Resultado esperado.** O modelo sabe, antes de agir, como `/tmp`, donos de arquivos e grupos se comportam no runner ativo, e o log registra qual runner executou cada sessão. Arquivos temporários trocados entre bash, jobs e ferramentas de arquivo deixam de sumir.

**Dono e mecanismos existentes.**

- `sandbox-policy` monta o texto de contexto de runtime sem conhecer o runner (`renderPolicyContext` em `packages/sandbox/sandbox-policy/src/index.ts`, com o comentário "Render the policy without claiming which capabilities are mounted").
- `sandbox-local` escolhe o runner por plataforma e probe, e `confine()` devolve só `enforcement`.
- O `/tmp` efêmero por chamada é uma garantia documentada (`packages/sandbox/sandbox-local/README.md:75`) e testada.

**Proposta em quatro partes independentes:**

1. **Fatos do runner no contrato do provedor.** O provedor de sandbox passa a publicar um descritor do mundo de execução: runner, enforcement, `/tmp` persistente ou efêmero, compartilhado ou não com as ferramentas de arquivo, e mapeamento de identidade (donos de root e grupos suplementares vistos como 65534). O renderizador de contexto consome esse descritor quando ele existe e mantém o texto atual quando não existe. Tipo: `upstream-package-change` na seam de sandbox, porque a fronteira atual proíbe a política de presumir o provedor.
2. **Runner no log.** Um evento `ignorable: true` registra o descritor na primeira resolução de cada sessão. Exige atualizar `SessionEventMap`, o catálogo de persistência, o reconhecimento de tipos e as projeções dos dois SDKs.
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

**Dono e mecanismos existentes.**

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

**Decisões em aberto.** Preset nomeado ou parâmetros livres; se `read-only` também força aprovação `never` ou herda a do pai.

**Aceite.**

- Um filho criado como somente leitura tem a escrita via bash negada pela sandbox.
- Um pedido que amplia a autoridade é rejeitado na partida.
- Os snapshots de SDK refletem o schema.

## P1-5 — Retenção e aviso único da saída do bash

**Resultado esperado.** A saída longa do bash preserva início e fim, e o modelo recebe um único aviso de truncamento com um único caminho para a saída completa.

**Dono e mecanismos existentes.**

- `OutputCollector` (`packages/subprocess/subprocess-local/src/output.ts`) guarda só a cauda em memória, por decisão documentada no próprio código: erros e resultados finais se concentram no fim. O arquivo de spill cobre o início.
- O coletor é compartilhado por bash, pwsh, jobs e stderr de servidores de linguagem.
- `tool-bash` acrescenta `[output truncated; full output: …]` (`packages/shell/tool-bash/src/render.ts`), e a `spill-policy` aplica depois o próprio orçamento, com outro aviso e outro arquivo.
- `dsh-output-retention` já oferece `TextRetainer` com estratégia `headTail`.

**Proposta.**

- Tornar a estratégia do coletor configurável por consumidor, mantendo a cauda como padrão para diagnósticos de servidor de linguagem.
- Usar início e fim no bash, por exemplo 20% e 80% do limite, com corte em fronteira de linha.
- Para o aviso único, a `spill-policy` reconhece o resultado já truncado pelo subprocesso e reaproveita o caminho existente em vez de criar um segundo arquivo, ou o `tool-bash` deixa o aviso final a cargo da `spill-policy`.

Tipo: `upstream-package-change` em `subprocess-local`, `tool-bash` e `spill-policy`. Exige atualizar a justificativa registrada no código e, se a decisão for durável, uma Agent Note.

**Decisões em aberto.** A proporção entre início e fim; qual camada fica dona do aviso único.

**Aceite.**

- Um teste com saída grande preserva a primeira e a última linha e emite um único aviso.
- O stderr de servidor de linguagem continua guardando só a cauda.
- Os snapshots `bash-spill` e semelhantes são regenerados.

## P1-6 — Identidade do runtime e configuração efetiva no log

**Resultado esperado.** Um auditor encontra no JSONL exportado a versão, o build, o estado da árvore, o perfil, os bundles e os valores efetivos das configurações que alteram requisições e ferramentas, inclusive mudanças durante a sessão. Nenhum segredo entra no log.

**Dono e mecanismos existentes.** `app-boot` conhece perfil, bundles e raiz do checkout. O loader aplica as recargas ao vivo de patch (`patchReload: live`). O cabeçalho `session` registra só formato, id, cwd e preset.

**Proposta.**

- Na criação da sessão, emitir um evento `ignorable: true` com a identidade do runtime.
- Emitir também os valores de uma lista explícita de campos auditáveis, declarada pelo dono de cada plugin no schema de configuração. Exemplos: `compactionReasoningEffort`, `compactionReasoningEffortByRoute`, `retryPolicy`, `exemptTools` e `toolFilter`.
- A cada recarga ao vivo que altere um campo auditável, emitir um evento com o caminho e o valor novo.
- Um digest da configuração completa pode acompanhar os valores para comparação.

Tipo: `upstream-package-change` em `app-boot`, no loader e no schema de configuração.

**Obrigações.** Novos membros em `SessionEventMap` com reconhecimento na leitura, entradas no catálogo de persistência, projeções dos dois SDKs e snapshots. A marcação de campo auditável precisa de um gate que rejeite campos com segredo.

**Decisões em aberto.** Como declarar um campo auditável; se sessões filhas repetem a identidade ou herdam a do pai.

**Aceite.** A partir apenas do export, um teste encontra `compactionReasoningEffortByRoute` e o momento em que mudou. Um campo de credencial nunca aparece.

## P1-7 — Captura durável dos entregáveis apresentados

**Resultado esperado.** O conteúdo apresentado ao usuário sobrevive à limpeza de `/tmp` e chega ao export, com hash conferível.

**Dono e mecanismos existentes.**

- `deliverables/presented` registra só caminho e descrição (`packages/deliverables/tool-present/src/types.ts`).
- O export já inclui todo anexo referenciado pelos logs, com arquivos genéricos lidos do armazenamento de anexos (`packages/session-query/session-log-export/src/archive.ts`).

**Proposta.**

- No momento da apresentação, copiar cada arquivo para o armazenamento de anexos como anexo genérico endereçado por conteúdo.
- Acrescentar ao `PresentedFile` uma referência opcional ao anexo, com tamanho e SHA-256.
- Respeitar um limite de tamanho configurável: um arquivo maior é registrado como não capturado, com o motivo.
- O export passa a incluir os bytes sem mudança no exportador, porque já segue anexos referenciados.
- A UI avisa quando um arquivo apresentado está fora do workspace.

Tipo: `upstream-package-change` em `tool-present`.

**Obrigações.** O campo novo é uma mudança de tipo persistido e exige o reconhecimento descrito no [cookbook de tipos persistidos](../cookbook/reviewing-persistence-type-changes.md), além das projeções dos SDKs e de snapshots.

**Decisões em aberto.** Limite de tamanho padrão; se arquivos apresentados de dentro do workspace também são capturados ou se só o hash é registrado.

**Aceite.** Apagar o arquivo original depois da apresentação não altera o export, que reproduz os bytes com o hash registrado.

## P2-8 (restante) — Recarga de skill e custo de contexto

A isenção de `skill` na poda já foi implementada. Restam duas partes:

- **Recarga de skill já ativa.** A ferramenta `skill` responde com uma referência curta quando a mesma skill já está ativa e não podada. Exige uma projeção de sessão das skills carregadas, porque a Agent Note de leituras síncronas proíbe procurar no histórico.
- **Custo de contexto por skill.** A UI mostra quanto contexto cada skill carregada ocupa.

Tipo: `upstream-package-change` em `tool-skill` e no cliente. Decisão em aberto: a referência curta precisa repetir algum trecho da skill, ou o modelo deve recarregá-la explicitamente quando ela tiver saído do contexto.

## P2-9 — Arquivos ignorados no `glob`

**Dono e mecanismos existentes.** `glob` usa `rg --files --no-ignore --hidden` por decisão deliberada (`packages/fs/tool-fs-search/src/glob.ts`).

**Proposta.** Rodar uma segunda listagem que respeita as regras de ignore, para marcar cada entrada ignorada e ordenar as rastreadas primeiro. Tipo: `upstream-package-change`.

**Decisões em aberto.** O custo da segunda varredura em árvores grandes; o formato da marcação, por exemplo um grupo separado "ignorados pelo Git".

**Aceite.** Um teste com `.gitignore` marca a entrada ignorada, e os snapshots com `glob` são regenerados.

## P2-10 — Resultado duplicado de subagentes

**Dono e mecanismos existentes.** `createSettlementMessage` (`packages/subagent/subagent/src/continuation-messages.ts`) repete o texto de encerramento do filho no aviso de conclusão, mesmo quando o filho já entregou o relatório por `send_message`.

**Proposta.** Quando o texto de encerramento repete a última mensagem enviada ao pai, o aviso de conclusão a referencia em vez de repeti-la. Oferecer também um formato estruturado de retorno (achados, escopo, status `PASS`/`FAIL`/`NOT_RUN`, evidência e limites) pelo `outputSchema` que o provedor `spawn` já suporta. Tipo: `upstream-package-change`.

**Decisões em aberto.** O critério de igualdade entre as mensagens; se o formato estruturado passa a ser padrão para delegações de revisão.

**Aceite.** Um snapshot com `send_message` seguido de encerramento mostra o relatório uma única vez no contexto do pai.

## P2-11 — Contexto de desenvolvimento do DSH e título da sessão

**Contexto de desenvolvimento.** O bloco do checkout e a orientação de HMR vêm do `web-app` (`packages/bundle/web-app/src/index.ts:233-240`) quando `surfaceContext` está ligado. Desligar `surfaceContext` no perfil remove os dois blocos hoje, mas também remove a orientação "esta GUI". Proposta: separar a orientação da GUI do bloco de autodesenvolvimento e incluir este só quando o cwd estiver dentro do checkout do DSH, com override explícito em configuração. Tipo: `upstream-package-change` em `web-app`.

**Título.** O bundle base monta `session-title-first-prompt-llm`, que titula só o primeiro prompt. O provedor `session-title-all-prompts-llm` já regenera o título a cada novo prompt. Trocar o provedor no perfil resolve o caso da sessão; o custo é uma chamada de título por prompt. Tipo: `configuration`/`profile-patch`.

## Ordem sugerida

1. Regenerar o corpus de snapshots afetado pela ferramenta `goal`, pelo dono do registro correspondente.
2. P2-11, título por configuração, se o custo for aceito.
3. P1-7 e P1-4, que reaproveitam mecanismos existentes (anexos e `toolFilter`).
4. P1-6, que define a marcação de campos auditáveis usada depois pelas outras mudanças de configuração.
5. P1-3, partes 1 a 3; a parte 4 depende da Agent Note.
6. P1-5, P2-9, P2-10 e o restante do P2-8.
