# Auditoria da sessão DSH de 2026-10-12

Este relatório examina a sessão principal e os sete subagentes que, em 2026-10-12 (horário de São Paulo), auditaram `/mnt/dados/projetos/repositorios-containers/rick-intelligence` e produziram roadmap e backlog de produção. O objeto da análise é o comportamento do DeepSeek Harness, não a qualidade do RICK Intelligence. A sessão usou o perfil `web`, a rota `openai-codex/gpt-6.1-sol` (conta ChatGPT), sandbox `workspace-write` e aprovação `ask`. Esta análise leu os JSONL, o código do Harness citado e os arquivos locais de perfil, e reproduziu no host o ambiente da sandbox para os testes afetados. Não reexecutou a sessão, não iniciou serviços e não alterou o projeto auditado.

## Resumo executivo

**Veredito: entrega concluída; a sessão evidencia impedimentos à qualificação Triple-A.** O usuário recebeu o relatório de auditoria, o roadmap e o backlog, e o log está íntegro. Este relatório é evidência de incidentes de uma sessão, não uma avaliação da [barra de qualidade AAA](#relação-com-a-barra-de-qualidade-aaa). Os três achados de maior prioridade têm custos de correção muito diferentes:

1. **P0-1: a compactação automática falhou 18 de 18 vezes.** A falha foi observada. O bundle `resilient-compaction`, exclusivo do fork, força o esforço de raciocínio `off`, que a rota `openai-codex/gpt-6.1-sol` não aceita. O mecanismo upstream de compaction repetiu a tentativa a cada step, sem disjuntor. O contexto chegou a 80,8% da janela sem resumo; o estouro não ocorreu. A correção da configuração é pequena; o disjuntor no upstream é médio.
2. **P0-2: uma queda transitória do WebSocket (código 1012, *Service Restart*) encerrou um turno sem retry.** A interrupção foi observada e o usuário retomou manualmente com `continue`. A causa é um classificador upstream que não reconhece a mensagem. A correção é pequena.
3. **P1-3: a sandbox Linux diverge do ambiente das ferramentas de arquivo e do host.** Há três problemas distintos. O `/tmp` do bash é efêmero por chamada e diferente do `/tmp` visto por `write`/`read`, o que fez perder o manifesto de hashes da auditoria. O `/tmp` aparece com modo `0755`. E, no user namespace sem privilégio, arquivos e grupos do host aparecem como 65534. A execução comparativa confirmou que o ambiente causou as cinco falhas de teste e mostrou causas distintas: o modo de `/tmp`, o dono do tmpfs, o dono dos arquivos do root do host e grupos suplementares não mapeados. Corrigir só o modo não basta, porque expõe a recusa pelo dono do tmpfs. Declarar essa semântica ao modelo é pequeno. Um diretório temporário por sessão exige desenho próprio.

Há também lacunas de privilégio mínimo na delegação (autoridade excessiva, sem violação identificada nas verificações realizadas), na saída de ferramentas, na rastreabilidade do runtime e na eficiência de contexto. Desde a auditoria de 28/09, houve melhorias no processo: revisão independente da síntese, checks pesados centralizados no agente principal, código de saída estruturado e nenhuma tentativa de exceder a profundidade de delegação.

## Fontes e método

Os caminhos são locais e externos a este repositório. Os hashes SHA-256 identificam os arquivos examinados caso sejam movidos; os logs brutos não foram copiados para `docs/`. As referências `principal:L929`, `seguranca:L3` etc. usam a numeração física de linhas de cada JSONL.

| Rótulo | Fonte | Linhas | SHA-256 |
|---|---|---:|---|
| principal | `/home/ricardo/Downloads/log202610120126/session.v4.jsonl` | 932 | `0cba7d392e7d49856379eb43f04d42a292871eee6324ad5f2bee3d8dc5081bbc` |
| seguranca | `subagents/e808872c-e83c-474b-85fb-63b137a4afa6/session.v4.jsonl` | 169 | `a7606ee3d259c89e91a6c17567881433136fb775be0fa64982c03a90cac2fe3c` |
| dominios | `subagents/f11ee86a-b488-461d-b5dd-0eef90697e83/session.v4.jsonl` | 226 | `e5b38f05c8b2e8bfeadcad1ec7d66b02f2b5162755bd609bb5d641e9ddb25fe6` |
| frontend | `subagents/e260a85a-aaa9-4dc0-983f-7552ab8d5f72/session.v4.jsonl` | 226 | `234f2a494e9fddab88ff31ee088731bebcb6f169900c043ce8e37a5d8af6f646` |
| revisao-relatorio | `subagents/81bd38da-6f15-4ed9-a439-58621ae74ea1/session.v4.jsonl` | 124 | `c0c697518820c8750e68b9364aee64ccd7de6332bac69ebcb5ad686c112b04aa` |
| gates | `subagents/3c14f309-9e65-4669-ade2-e216f240aea5/session.v4.jsonl` | 137 | `5b5d71f45d3fc969072ba77811f42d769c757f3b47c276f5612b83c763552d6b` |
| backlog | `subagents/d1fd5f64-f6d8-415c-b687-897ea4b31f25/session.v4.jsonl` | 62 | `76169d7ec0b9f37f409151b03da0f0b502ba324786699d54098f1027a0cfb666` |
| revisao-plano | `subagents/43acc0ff-1ab9-404a-a4bc-f36127ff785b/session.v4.jsonl` | 123 | `2632ce341a095c93c40c182a5e8d57d839c3c96a538ec55678cd2ef3ce06c8c0` |
| export | `dsh-session-session-69e2186a-0011-48d8-8da9-56dedd88b65f.zip` | — | `c6798943a82ba8df50075d5feafac7ab4fcfd26195c7da13d9e09ed8eaf39a1c` |

Os caminhos dos subagentes são relativos a `/home/ricardo/Downloads/log202610120126/`. O método foi analisar cada linha JSON e conferir `seq`, o pareamento de chamada e resultado, o início e o fim de steps e turnos, o uso registrado, a latência por step, os eventos de compactação e poda e as mensagens entre agentes. Depois, cada anomalia foi confrontada com o código do Harness, com `~/.dsh/profiles/web/cordis.patch.yml` e com `.agents/customization-policy.json`, este último para separar o código do fork do código upstream. O checkout que serviu a sessão (`custom/main` em `deepseek-harness-audit-evidence`) tem código idêntico ao deste branch nos arquivos citados nos achados P0. A verificação no host confirmou quais arquivos de `/tmp` sobreviveram.

A atribuição das falhas de teste ao ambiente foi verificada por execução comparativa no projeto auditado, na mesma revisão da sessão. Rodaram os seis testes que falharam e suas parametrizações, 17 casos no total, sem cache do pytest e sem bytecode. Os ambientes foram três: o host; o `bwrap` 0.9.0 com os argumentos exatos de `bwrapProfileArgs` para `workspace-write`; e esses mesmos argumentos com `--perms 1777` antes de `--tmpfs /tmp`. O estado Git e o digest do diff do projeto auditado ficaram iguais antes e depois.

| Pacote de evidência | Conteúdo | SHA-256 do manifesto |
|---|---|---|
| `/home/ricardo/Downloads/dsh-auditoria-2026-10-12-execucao-comparativa/manifest.json` | Script usado (`comparative.py`), argv completo, código de saída, duração, sondagem de `stat`/`id` e log bruto por ambiente, com SHA-256 de cada arquivo; hashes dos arquivos de teste; estado Git antes e depois | `15061711b9063bea71d688f4dd91762a591d1310edcce21f0b6e92deb864a6ee` |
| `/home/ricardo/Downloads/dsh-auditoria-critica-2026-10-12-rodada2-mwqzd7h1/manifest.json` | Reprodução independente pela revisão crítica, com os mesmos três ambientes e resultados | `b317ebdd1bd1bec448408bdb22d977f205b3cb4ba40695b45c2d78a87c03f434` |

## Integridade e execução

| Indicador | Resultado observado |
|---|---:|
| Registros JSON válidos | 1.999/1.999 nos oito arquivos |
| `seq` contínuo | 8/8 arquivos |
| Steps com início e fim | 82/82 no principal; 122/122 nos filhos |
| Chamadas de ferramenta com resultado | 219/219 no principal; 283/283 nos filhos |
| Resultados de ferramenta com erro | 1 no principal (`read` de arquivo inexistente); 1 nos filhos (`grep` em caminho inexistente) |
| Subagentes iniciados e concluídos | 7/7 |
| Turnos do principal | 3 `completed`, 1 `error` (WebSocket 1012) |
| Duração dos turnos de trabalho | Auditoria 15 min 09 s; roadmap/backlog 21 min 06 s até a falha; retomada 1 min |
| Tokens registrados | 18.481.309 no total: 17.242.880 `cacheReadTokens`, 1.148.612 de entrada sem cache, 89.817 de saída |
| Participação do cache na entrada | 93,8% |
| Maior prompt | 219.644 tokens em janela de 272.000 (`principal:L929`, `principal:L14`) |
| Compactações | 0/18 concluídas; 34 podas de resultado concluídas, somando 124.392 tokens |

O principal tem 253 eventos `tool/result` para 219 chamadas. Os 34 excedentes são substituições da poda, cada uma precedida pelo seu evento `compaction/prune`, e não resultados órfãos. Os filhos registram `parentSession` igual à sessão principal. Dois revisores foram retomados por `send_message`, o que explica as dez notificações `subagent-settled` para sete filhos. A participação do cache mede a reutilização da entrada; não mede a relevância do contexto nem a qualidade dos resultados.

## Evolução desde a auditoria de 2026-09-28

| Recomendação de 28/09 | Estado nesta sessão | Evidência |
|---|---|---|
| Revisão independente da síntese | Atendida | `revisao-relatorio` aprovou o relatório; `revisao-plano` rejeitou um gate circular e aprovou após a correção (`principal:L801-L887`) |
| Checks pesados em um único agente | Atendida | O principal executou a suíte ampla (7.713 aprovados, 6 falhas, 221 ignorados); os filhos executaram apenas checks focais |
| Congelar estado e hashes antes da auditoria | Tentada, perdida pelo Harness | O manifesto foi gravado em `/tmp` dentro da sandbox e desapareceu (P1-3) |
| Código de saída legível por máquina | Atendida parcialmente | `meta.exitCode` existe; `isError` continua `false` para saída ≠ 0 (`principal:L414`) |
| Coletar sessão longa que acione compactação | Exercitada; falhou | 18 eventos `compaction/end` com erro (`principal:L778-L927`) |
| Profundidade de delegação | Sem violação | Nenhum filho chamou `subagent` |

## Classificação

A prioridade combina três fatores: o impacto observado nesta sessão, o risco potencial e a confiança na causa. O custo da correção define a ordem de execução, não a prioridade. Os critérios são:

- **P0**: a sessão mostrou um mecanismo de proteção desativado ou um turno interrompido que exigiu ação humana, e a causa tem alta confiança.
- **P1**: houve perda observada de evidência ou resultado incorreto, ou há um risco de segurança ou de rastreabilidade sem incidente.
- **P2**: o achado afeta eficiência ou experiência.

A coluna Origem indica onde está o código a corrigir. "Fork" significa um pacote declarado exclusivo do fork em `.agents/customization-policy.json`. "Upstream" significa um arquivo idêntico ou funcionalmente idêntico ao do `master`.

| Achado | Impacto observado | Risco potencial | Confiança na causa | Origem | Custo |
|---|---|---|---|---|---|
| P0-1 Compactação | 18/18 falhas; contexto em 80,8% sem resumo | Estouro da janela em sessão mais longa | Alta (mensagem explícita e caminho no código) | Fork (configuração) e upstream (disjuntor) | Pequeno e médio |
| P0-2 Transporte | 1 turno interrompido; retomada manual após 58 s | Perda de steps longos | Alta para a mensagem observada | Upstream | Pequeno |
| P1-3 Sandbox Linux | Manifesto de hashes e JUnit perdidos; 5 falsos negativos de teste | Diagnóstico errado de testes legítimos | Alta (reprodução comparativa) | Upstream | Pequeno (declaração) a grande (diretório por sessão) |
| P1-4 Delegação | Nenhuma escrita identificada nas verificações; autoridade excessiva | Escrita sem aprovação humana | Alta | Upstream | Médio |
| P1-5 Truncamento do bash | Saída inicial perdida; comando repetido | Decisões tomadas sem o início da saída | Alta | Upstream | Pequeno a médio |
| P1-6 Identidade do runtime | Causa do P0-1 só identificada fora do log | Auditorias não reproduzíveis | Alta | Upstream | Médio |
| P1-7 Entregáveis | Relatório apresentado de `/tmp`; ausente do export | Perda do entregável | Alta | Upstream | Médio |

## Achados

### P0-1 — Compactação automática inoperante por esforço de raciocínio incompatível

**Evidência.** Entre `principal:L778` e `principal:L927` há 18 pares `compaction/start`/`compaction/end`, um por step a partir de 01:17:53. Todos falharam com `provider "openai-codex" model "gpt-6.1-sol" does not support reasoning effort "off"`. Nenhum resumo foi produzido; só a poda determinística reduziu o contexto.

**Impacto observado.** Na primeira tentativa o prompt tinha cerca de 203 mil tokens e depois chegou a 219,6 mil (80,8% da janela) sem nenhum resumo. A sinalização foi um aviso de log e um evento de erro, sem diagnóstico visível ao usuário. O estouro da janela não ocorreu nesta sessão.

**Risco potencial.** A recuperação por estouro de contexto passa pela mesma compactação. Numa sessão mais longa, quando a poda deixasse de aliviar o contexto, o resultado provável seria `CONTEXT_WINDOW_EXCEEDED`.

**Causa no fork.** O bundle `resilient-compaction` e a política `compaction-resilience-policy` são declarados exclusivos do fork (registro `resilient-compaction`, `solutionType: plugin-and-bundle`, e `packages/bundle/resilient-compaction/README.md:12`). O bundle fixa `compactionReasoningEffort: 'off'` (`packages/bundle/resilient-compaction/cordis.patch.yml:10`), um valor pensado para modelos locais, e o exemplo mínimo do README da política repete esse valor. O README informa que nenhum perfil distribuído inclui o bundle automaticamente. Foi a composição local do perfil `web` que o combinou com a rota padrão `openai-codex/gpt-6.1-sol`, e o patch do usuário repete `'off'`. A política sobrescreve o esforço sem consultar a rota (`packages/compaction/compaction-resilience-policy/src/index.ts:189`). A validação de carga só exige uma string não vazia (`index.ts:109`). O registro LLM rejeita a requisição antes de I/O (`packages/llm/llm/src/index.ts:914`).

**Causa no upstream.** A compactação entre steps captura o erro, registra `continuing the turn` e tenta de novo no step seguinte, sem distinguir erros determinísticos (`packages/compaction/compaction-basic/src/index.ts:158-172`). Esse comportamento é do upstream; o fork só altera marcadores de cobertura nesse arquivo.

**Correção no fork.** (a) Tornar o esforço de compactação dependente da rota: um mapa por provedor/modelo ou um valor explícito como `'route-minimum'`, resolvido no passo `resolve()` da política, sem ajuste implícito. (b) Validar na carga quando a rota padrão é conhecida e, em todo caso, no primeiro ponto em que a rota da sessão é resolvida, emitindo diagnóstico visível ao usuário. (c) Remover `'off'` do padrão do bundle e do exemplo do README, ou condicioná-lo às rotas que anunciam esse esforço.

**Melhoria no upstream.** (d) Tratar `UNSUPPORTED_REASONING_EFFORT` e outros erros determinísticos de requisição como não repetíveis na compactação entre steps: suspender novas tentativas para a combinação sessão/rota/configuração até que a rota ou a configuração mude. A proposta vale para o mecanismo geral, independentemente do bundle do fork.

**Aceite.** Uma sessão com `openai-codex/gpt-6.1-sol` e o bundle ativo registra `compaction/end` bem-sucedido. Uma configuração incompatível explícita produz um único diagnóstico visível e nenhuma tentativa repetida. Um teste unitário cobre o disjuntor, e um snapshot gravado cobre a rota sem `off`.

### P0-2 — Fechamento transitório do WebSocket encerra o turno sem retry

**Evidência.** Em `principal:L888`, o `assistant/attempt` do step 27 recebeu 9,7 s de raciocínio e terminou com `WebSocket closed 1012`, código `PI_AI_ERROR`. O turno terminou em erro (`principal:L890`), e o usuário retomou com `continue` 58 s depois (`principal:L898`).

**Impacto observado.** Um turno autônomo foi interrompido e exigiu ação humana. Perdeu-se uma tentativa com 9,7 s de raciocínio. O turno de retomada concluiu em 1 min.

**Risco potencial.** Todo reinício de servidor do provedor durante um stream derruba o turno. O step mais longo da sessão durou 8 min 16 s para emitir 15.109 tokens (`principal:L743`). Um fechamento nesse step perderia esse trabalho; esse cenário não ocorreu.

**Causa.** `classifyPiAiError` (`packages/llm/llm-pi-ai/src/stream.ts:42-67`) reconhece apenas `WebSocket closed unexpectedly`. `WebSocket` não satisfaz `\bsocket\b`, e `1012` não satisfaz `\b5\d\d\b`. O erro cai em `PI_AI_ERROR`, que não está em `DEFAULT_RETRYABLE_CODES` (`packages/llm/llm/src/retry-policy.ts:18`). Os dois arquivos são idênticos aos do `master`. O pi-ai já cria `WebSocketCloseError` com o código de fechamento, mas o adaptador recebe só o texto.

**Correção.** Classificar 1012 como `TRANSPORT`. A classificação dos demais códigos é uma política do DSH apoiada no significado registrado, sem ocorrência nesta sessão. RFC 6455 §7.4.1 define 1001 (*going away*), 1006 (fechamento anormal, só reportado localmente) e 1011 (erro interno); o registro IANA de códigos de fechamento acrescenta 1012 (*service restart*), 1013 (*try again later*) e 1014 (*bad gateway*). O DSH os repete como `TRANSPORT`. Para 1009 (*message too big*), reenviar a mesma requisição não pode dar certo, e o DSH a classifica como `INVALID_REQUEST`. RFC 6455 §7.4.2 reserva 4000–4999 para uso privado e não define sua interpretação; não repetir esses códigos, nem 1008 ou códigos desconhecidos, é uma decisão conservadora do DSH, não uma propriedade dos códigos. A documentação do provedor sobre os códigos que ele usa não foi verificada. Quando o pi-ai passar a encaminhar o `WebSocketCloseError`, usar o código estruturado, e registrar a pendência no comentário `XXX(pi-ai upstream)` já existente.

**Aceite.** Testes unitários do adaptador cobrem cada código classificado e falham sem a correção. Um snapshot de sessão mostra `assistant/attempt` com `WebSocket closed 1012` classificado como `TRANSPORT`, seguido de `llm/retry` e turno `completed`. O snapshot reproduz a falha já classificada, porque o `llm-replay` não executa o adaptador pi-ai; a classificação em si fica nos testes do adaptador.

### P1-3 — Sandbox Linux diverge das ferramentas de arquivo e do host

**Evidência.** O `write` criou `/tmp/rick-audit-reproductions.py` (`principal:L408-L409`), mas o bash seguinte respondeu `No such file or directory` (`principal:L413-L414`). O JUnit XML gravado por um job em segundo plano também sumiu (`principal:L418-L419`). No host, os arquivos criados pelas ferramentas de arquivo existem e os criados pelo bash (`rick-audit-before.json`, `rick-audit-pytest.xml`) não. Dentro da sandbox, `/tmp` tinha modo `0755`, `/usr` e `/proc` pertenciam ao uid 65534 e os grupos suplementares apareciam como 65534 (`principal:L446-L447`). Cinco das seis falhas da suíte do projeto (`principal:L432`) envolvem `/tmp`, dono de arquivos em `/usr` e grupos.

**Execução comparativa.** Os testes rodaram nos três ambientes descritos em [Fontes e método](#fontes-e-método):

| Ambiente | Aprovados | Falhas | Sondagem |
|---|---:|---:|---|
| Host, sem sandbox | 16 | 1 | `/tmp` 1777 de uid 0; `/usr/lib/os-release` de uid 0 |
| `bwrapProfileArgs` de `workspace-write` | 11 | 6 | `/tmp` 755 de uid 1000; `/` e `/usr/lib/os-release` de uid 65534; grupos `1000`, `65534(nogroup)` |
| O mesmo perfil com `--perms 1777` | 11 | 6 | `/tmp` 1777 de uid 1000; demais iguais ao perfil |

O teste de inventário de manifests falha nos três ambientes, por defeito do próprio projeto. Os outros cinco casos falham só sob bwrap, por causas distintas:

| Teste | Perfil DSH | Perfil com `--perms 1777` | Causa ambiental |
|---|---|---|---|
| `test_sticky_tmp_parent_and_private_child_are_supported` | Falha na asserção do bit *sticky* (`test_rework2.py:47`) | `unprotected input parent` (`contracts.py:81`) | Primeiro o modo `0755`; corrigido o modo, o tmpfs pertence ao uid 1000, e a verificação exige `/tmp` de root com bit *sticky* |
| `test_cli_public_metadata_key_never_reaches_operation_effects` (2 casos) | `unprotected input parent` | Igual | `/usr` pertence ao root do host, que aparece como uid 65534 |
| `test_output_rejected_before_any_retained_snapshot[gid]` e `test_opened_output_rechecked_before_snapshot[gid]` | `OSError` EINVAL no `chown` (`test_vps_production_rework9.py:55`) | Igual | O teste escolhe um grupo suplementar alternativo; sob bwrap, os grupos do host aparecem como 65534 não mapeado, e `chown` para um gid não mapeado retorna EINVAL em vez de `PermissionError` |

A reprodução confirma que o ambiente bwrap causou as cinco falhas. A mesma contagem de falhas com `--perms 1777` não significa a mesma causa: corrigir o modo é insuficiente e expõe a recusa pelo dono do tmpfs.

**Três problemas distintos.**

- (a) *Persistência e coerência de `/tmp`.* O perfil bwrap monta `--tmpfs /tmp` a cada comando (`packages/sandbox/sandbox-local/src/profiles.ts:19`). Já a cerca de arquivos em processo autoriza o `/tmp` do host (`packages/sandbox/sandbox/src/roots.ts:54`), e os perfis Landlock e Seatbelt usam o `/tmp` do host. O `/tmp` efêmero é comportamento documentado (`packages/sandbox/sandbox-local/README.md:75`) e testado. O texto entregue ao modelo, porém, diz apenas `Some platform temporary areas may also be writable` (`packages/sandbox/sandbox-policy/src/index.ts:47`).
- (b) *Modo de `/tmp`.* O tmpfs do bwrap nasce com `0755`, o que causa a primeira falha do teste de `/tmp`. `--perms 1777` restaura o modo do host, mas sozinho não faz o teste passar.
- (c) *Propriedade e grupos sob user namespace sem privilégio.* Num user namespace sem privilégio só o uid e o gid do usuário são mapeados, e o uid 0 do host nunca pode ser mapeado. Por isso, arquivos de root aparecem como 65534, o tmpfs pertence ao usuário e os grupos suplementares aparecem como 65534 sem mapeamento. Isso decorre do uso de bwrap sem privilégio, não de uma opção de mapeamento esquecida.

**Correção.** Aplicar em ordem de custo crescente:

1. Declarar ao modelo a semântica exata de cada provedor no texto de contexto de runtime: `/tmp` efêmero por chamada e separado do `/tmp` das ferramentas de arquivo, arquivos de root vistos como 65534 e grupos suplementares sem mapeamento.
2. Registrar no log o runner selecionado (`bwrap`, `landlock`, `seatbelt`, `windows-acl`) e o nível de enforcement.
3. Adotar `--perms 1777` para fidelidade de modo, sabendo que isso sozinho não corrige os testes que dependem de dono root ou de grupos mapeados.
4. Desenhar à parte um armazenamento temporário por sessão compartilhado entre bash, jobs e ferramentas de arquivo. O desenho exige uma Agent Note de arquitetura, porque altera a garantia documentada. Precisa definir o isolamento entre sessões, o acesso de subagentes e jobs, a limpeza, a retomada, a resolução de caminhos pelas ferramentas de arquivo e a paridade com Landlock e Seatbelt.

**Aceite.** O texto de contexto de runtime e o log identificam o runner e a semântica de `/tmp`. Um e2e bwrap verifica `stat` de `/tmp` com bit *sticky* após `--perms 1777`. O teste existente, que verifica que o `/tmp` do host fica intacto, continua passando. O armazenamento por sessão tem aceite próprio, definido na Agent Note.

### P1-4 — Delegação não estreita a autoridade dos subagentes

**Evidência.** Os sete filhos registram `sandbox/mode` `workspace-write` e `approval/policy` `never`, ambos com `source: delegation` (por exemplo `seguranca:L3-L4`). O catálogo de ferramentas dos filhos inclui `write`, `edit`, `bash`, `subagent` e `subagent_fork`. A restrição "SOMENTE LEITURA, não redelegar" existia só no texto do prompt. O schema de `subagent` visível ao modelo aceita apenas `description`, `prompt` e `run_in_background` (`principal:L13`).

**Impacto observado.** Nenhuma violação identificada nas verificações realizadas. Os filhos fizeram 283 chamadas, nenhuma de `write`, `edit`, `subagent` ou `subagent_fork`. Os 12 comandos bash foram 10 leituras de diretório e estado Git, um script Python inline com `PYTHONDONTWRITEBYTECODE=1` e uma execução de pytest com essa variável e `-p no:cacheprovider` (`dominios:L147`, `dominios:L172`). Essas opções desligam dois mecanismos específicos de escrita, mas não tornam testes e importações somente leitura. O `git status` igual no início e no fim não detecta alterações em arquivos ignorados, em temporários ou alterações revertidas. O achado é de autoridade excessiva para a tarefa; não há evidência de violação efetiva.

**Controle existente.** `tool-subagent` aceita `toolFilter` na configuração do plugin (`packages/subagent/tool-subagent/src/index.ts:87`). Ele remove ferramentas do prompt de todos os filhos e rejeita sua execução, desde que o provedor tenha essa capacidade. O perfil `web` não o configura; no repositório, ele aparece apenas no snapshot `snapshots/session/subagent-tool-filter/`. Esse controle vale para a implantação inteira e não para cada delegação, e remover `write`/`edit` não impede escrita via `bash` com `workspace-write`.

**Correção.** Adicionar ao `subagent` parâmetros que só estreitam a autoridade de cada delegação: `sandbox: 'read-only' | 'workspace-write'` e uma lista de ferramentas permitidas, ou presets nomeados como `reviewer`/`explorer`. A proposta preserva a regra de que a autoridade do filho é fixada na criação e nunca ampliada. Mostrar a autoridade efetiva no cartão do subagente na UI. Até lá, uma implantação pode usar `toolFilter` para remover `subagent` e `subagent_fork` dos filhos.

**Aceite.** Um filho criado com `read-only` tem a escrita via `bash` negada pela sandbox, e o evento `sandbox/mode` registra o estreitamento. Os snapshots dos SDKs TypeScript e Python refletem o novo schema.

### P1-5 — Truncamento da saída do bash descarta o início e emite dois avisos

**Evidência.** O primeiro comando, `pwd; git status --short; git ls-files`, retornou 49.931 caracteres começando no meio de um caminho (`ation-q24-…`, `principal:L37`). As saídas de `pwd` e `git status` se perderam, e o agente repetiu os comandos (`principal:L66`). O mesmo resultado traz dois avisos com caminhos diferentes: `[output truncated; full output: /tmp/dsh-subprocess-…]` e `(Omitted 14375 bytes… /tmp/dsh-spill-…)`.

**Causa.** A retenção guarda só o fim (descrição da ferramenta em `packages/shell/tool-bash/src/index.ts:94`, idêntica ao `master`). As camadas de subprocesso e de spill truncam de forma independente. O registro `persistent-shell-diagnostics` do fork cobre só os shells persistentes.

**Correção.** Reter início e fim (por exemplo, 20% iniciais e 80% finais), cortar em fronteira de linha e emitir um único marcador com a faixa omitida e um único caminho canônico da saída completa.

**Aceite.** Um teste com saída grande preserva a primeira e a última linha e exibe um só aviso. Os snapshots de transcrição foram atualizados.

### P1-6 — O log não identifica o runtime nem a configuração efetiva

**Evidência.** O cabeçalho `session` registra versão do formato, id, cwd e preset. Não registra a versão do DSH, o commit de build, o estado sujo, os bundles ativos nem a configuração das políticas que alteram requisições ao modelo ou a execução de ferramentas. Para diagnosticar o P0-1 foi preciso ler o perfil local fora do log. O checkout que serviu a sessão tinha 113 arquivos modificados sem commit. O patch do perfil `web` recarrega ao vivo, então a configuração pode mudar durante a sessão.

**Correção.** Emitir no início da sessão um evento `ignorable: true` com a versão, o commit de build, o indicador de árvore suja, o perfil e a lista de bundles. O evento traz também os **valores efetivos** de uma lista explícita de campos sem segredo que afetam requisições e ferramentas: esforço e limites da política de compactação, política de retry, rota e esforço do provedor, runner e enforcement da sandbox, filtro de ferramentas dos subagentes. A cada recarga ao vivo, emitir um evento com os caminhos alterados e os novos valores. Um digest da configuração completa pode acompanhar esses dados para comparação, mas não os substitui. Atualizar `SessionEventMap`, a documentação e os snapshots dos dois SDKs na mesma mudança.

**Aceite.** A partir apenas do JSONL exportado, um auditor encontra `compactionReasoningEffort: 'off'` e o momento em que esse valor passou a vigorar. Nenhum segredo aparece no evento.

### P1-7 — Entregáveis fora do workspace e export incompleto

**Evidência.** O relatório de auditoria foi apresentado a partir de `/tmp/relatorio-auditoria-rick-intelligence-2026-10-12.md` (`principal:L530`), local sujeito a limpeza. O ZIP de export contém apenas os oito JSONL. O evento `workspace/changes` registra só o número do turno, e o resumo de alterações é servido apenas enquanto a sessão vive (`packages/client/ui-deliverables/src/changes.ts:8`).

**Correção.** No momento da apresentação, copiar o conteúdo de cada entregável para o armazenamento durável da sessão, endereçado pelo hash. Com limite de tamanho configurável, registrar explicitamente quando um arquivo excede o limite e não foi capturado. O evento `deliverables/presented` passa a referenciar o hash e o tamanho capturados. O export inclui os bytes capturados e o resumo de alterações por turno, e não relê o arquivo original. A UI avisa quando um arquivo apresentado está fora do workspace.

**Aceite.** Depois da apresentação, apagar ou alterar o arquivo original não muda o export, que reproduz os bytes apresentados com hash conferível em outra máquina.

### P2-8 — A poda alcança instruções de skill ativas

**Evidência.** As 34 podas incluem os resultados das skills `engineering-framework` e `gauntlet-loop` (`principal:L575`, `principal:L577`), que continuavam orientando o trabalho. A skill `engineering-framework` foi carregada duas vezes (`principal:L27`, `principal:L543`), com mais 13 mil caracteres na segunda carga. Antes da primeira delegação, o principal leu cerca de 104.700 caracteres de skills e referências metodológicas, e o prompt chegou a 42 mil tokens no quarto step, quando do projeto só o README havia sido lido.

**Correção.** Adicionar ao `compaction-tool-result-pruner` uma lista configurável de ferramentas isentas (padrão `['skill']`) ou substituir o conteúdo podado de skill por um marcador de recarga. Fazer o `skill` responder com referência curta quando a mesma skill já está ativa e não podada. Mostrar na UI o custo de contexto por skill carregada.

### P2-9 — `glob` devolve arquivos ignorados sem marcação

**Evidência.** `glob` com padrão `AGENTS.md` devolveu apenas `.runtime/legacy-reference/cvg-master-rag-v2/AGENTS.md`, que é ignorado pelo Git (`principal:L42`). `**/conftest.py` devolveu arquivos de `site-packages` e de cache do `uv` (`principal:L140`). A opção `--no-ignore --hidden` é deliberada (`packages/fs/tool-fs-search/src/glob.ts:94`).

**Correção.** Manter a descoberta de arquivos ignorados, mas marcar cada entrada ignorada e ordenar os arquivos rastreados primeiro. Assim, o modelo não confunde instruções de diretórios legados com as do projeto.

### P2-10 — Resultados de subagentes duplicados no contexto do principal

**Evidência.** O principal recebeu 20 `agent-message` (55.313 caracteres) e 10 `subagent-settled` (9.454 caracteres). Os relatórios finais chegaram por `send_message` e foram repetidos em parte na mensagem de encerramento. O principal precisou pedir três vezes que filhos finalizassem (`principal:L311`, `principal:L337`, `principal:L507`).

**Correção.** Definir um único canal canônico para o resultado: a notificação de encerramento referencia a última mensagem em vez de repeti-la. Oferecer um formato estruturado de retorno, com achados, escopo, status `PASS`/`FAIL`/`NOT_RUN`, evidência e limites, como recomendou a auditoria de 28/09.

### P2-11 — Contexto irrelevante e título desatualizado

**Evidência.** O system prompt inclui o bloco de desenvolvimento do próprio DSH (caminho do checkout, HMR, reconstrução da GUI Web), embora o cwd fosse outro projeto (`principal:L9`, origem em `packages/boot/app-boot/src/index.ts:1074`). O título ficou `Saudação inicial em português`, gerado a partir de `ola` e nunca atualizado (`principal:L20`).

**Correção.** Injetar o bloco de desenvolvimento do DSH apenas quando o cwd estiver no checkout do DSH ou quando o usuário pedir. Regenerar o título no primeiro pedido substantivo, como o primeiro turno com uso de ferramentas.

## Relação com a barra de qualidade AAA

A barra canônica é `.agent/plans/deepseek-harness-aaa-quality-bar.json`, versão `AAA-QB-v1.4`. Seus 14 critérios qualificam o repositório: checks integrados, cobertura, replay, arquitetura, segurança de pontos específicos, governança upstream, build, documentação, benchmarks, release e qualificação final. Nenhum critério exige que uma sessão real com provedor sobreviva a compactação, falha de transporte ou troca de arquivos sob sandbox. A relação dos achados com a barra é a seguinte:

| Critério | Relação com esta sessão |
|---|---|
| AAA-QB-03 (replay de entradas visíveis ao modelo) | P1-6: configuração que altera requisições não é reconstruível pelo log. Toda correção que mude transcrição exige snapshot |
| AAA-QB-05 (segurança e confiabilidade de runtime) | O alvo enumera pontos específicos (fechamento do WebSocket do host, contenção de arquivos estáticos, limites do bridge HTTP, extensões dinâmicas), e o WebSocket do P0-2 é o do provedor, não o do host. A condição do critério, porém, vale para qualquer risco residual: risco alto ou crítico aceito exige autoridade humana explícita e impede veredito AAA incondicional (`.agent/plans/deepseek-harness-aaa-quality-bar.json:182`) |
| AAA-QB-06 (governança upstream) | A correção de configuração do P0-1 pertence ao registro `resilient-compaction`. As demais alteram arquivos upstream e exigem registro próprio com `solutionType` antes do código |
| AAA-QB-10 (desempenho e resiliência operacional) | A dimensão abrange P0-1 e P0-2, mas o alvo é o benchmark de CI e os limites de recursos |
| AAA-QB-12 (compatibilidade de Session e SDKs) | P1-4, P1-6 e P1-7 alteram schema ou `SessionEventMap` e exigem os snapshots dos dois SDKs |
| AAA-QB-14 (qualificação final independente) | Exige veredito PASS sem lacuna material não resolvida (`.agent/plans/deepseek-harness-aaa-quality-bar.json:345`), e `CONDITIONAL_PASS` ou risco alto residual aceito impede a qualificação (`:353`). Os achados P0 desta sessão são lacunas materiais conhecidas. Este relatório é evidência de uma sessão; não substitui a evidência determinística nem o crítico final |

Esta sessão, portanto, não permite concluir o estado global AAA, mas a barra v1.4 já impede uma qualificação diante dos defeitos materiais aqui documentados, pelas condições do AAA-QB-05 e do AAA-QB-14. O que falta é um cenário integrado que exercite esses mecanismos: uma sessão longa com provedor real, compactação bem-sucedida, injeção de falha de transporte e troca de arquivos sob sandbox, registrada com hashes. Acrescentá-lo numa revisão versionada da barra melhora a cobertura, mas não é pré-requisito para considerar estes incidentes na qualificação.

## Estado por área nesta amostra

| Área | Estado | Limite |
|---|---|---|
| Integridade do log e pareamento de eventos | Atende | Uma sessão não comprova ausência de falhas futuras |
| Delegação paralela, jobs em segundo plano e notificações | Atende | Sem medição de concorrência sob carga |
| Revisão independente e centralização de checks | Atende | Processo dependente das skills do usuário |
| Compactação resiliente | Falha (P0-1) | A poda funcionou; o resumo nunca rodou |
| Resiliência de transporte do provedor | Falha (P0-2) | Observado um único fechamento |
| Fidelidade e consistência da sandbox Linux | Falha (P1-3) | Reproduzida com os argumentos do perfil; o log não registra o runner |
| Privilégio mínimo de subagentes | Parcial (P1-4) | Sem violação identificada nas verificações feitas; o filtro existe só por implantação |
| Saída de ferramentas | Parcial (P1-5, P2-9) | — |
| Rastreabilidade de runtime e export | Parcial (P1-6, P1-7) | — |
| Eficiência de contexto | Parcial (P2-8, P2-10) | O cache mede reutilização da entrada, não relevância do contexto |

## Sequência recomendada

1. **Mitigação local do P0-1 (aplicada em 2026-10-12, validação pendente):** remover `compactionReasoningEffort: 'off'` de `~/.dsh/profiles/web/cordis.patch.yml`. O patch do usuário substitui a configuração inteira do plugin, sem mesclagem profunda (`packages/boot/app-boot/README.md:205`). Com a chave ausente, a política deixa de sobrescrever o esforço da compactação. A mitigação remove a incompatibilidade identificada; a confirmação exige um `compaction/end` bem-sucedido numa sessão longa após a mudança.
2. **P0-1 no fork:** esforço por rota, validação e padrão do bundle, sob o registro `resilient-compaction`.
3. **P0-2:** classificação de fechamentos WebSocket em `llm-pi-ai`, com novo registro `upstream-package-change` e testes unitários e snapshot.
4. **P1-3, partes declarativas:** texto de contexto de runtime, runner no log e `--perms 1777`. O armazenamento temporário por sessão segue em desenho próprio com Agent Note.
5. **P0-1 no upstream:** disjuntor de erros determinísticos em `compaction-basic`, com proposta upstream.
6. **P1-4, P1-6 e P1-7:** mudanças de schema e de `SessionEventMap`, com snapshots dos SDKs TypeScript e Python.
7. **P1-5 e os itens P2**, agrupados por pacote.

Depois dos passos 1 a 3, coletar uma nova sessão longa na mesma rota. A sessão deve acionar compactação, incluir troca de arquivos via `/tmp` entre ferramentas e, se possível, um reinício do provedor. Anexar os JSONL com hashes, como neste relatório.

## Encaminhamento para o programa AAA

Os achados ainda não constam em `.agent/backlog.json`. Conforme o fluxo do programa, o registro nos ledgers canônicos cabe ao Codex, e este relatório é o canal de hand-off. Antes de registrar as correções como tarefas prontas para implementação, convém revisar cada proposta conforme a [política de customização](../customization/improvement-development-standard.md): a origem (fork ou upstream), o `solutionType` e, nos itens upstream, a proposta ao projeto oficial. O desenho do armazenamento temporário por sessão (P1-3) e o estreitamento por delegação (P1-4) precisam de proposta antes do código.

As correções do P0-1 (no fork e no `compaction-basic`), do P0-2 e da isenção de `skill` na poda (P2-8) estão no branch `custom/session-audit-fixes-20261012`, cada uma com registro `upstream-patch` ou de extensão em `.agents/customization-policy.json`. Os demais itens exigem decisão de desenho e estão detalhados em [propostas de correção](propostas-correcao-sessao-dsh-2026-10-12.md). A validação dessas correções encontrou falhas que já existiam em `custom/main`: 118 de 140 snapshots headless falham pela mudança de schema da ferramenta `goal` sem regeneração dos arquivos de referência, e o verificador da política de customização acusa cerca de 376 erros de dono múltiplo. Ambos pertencem ao registro `goal-required-task-completion` e bloqueiam evidência limpa para qualquer mudança visível ao modelo.

## Limites desta auditoria

A seleção de `bwrap` não está registrada no log. Ela é inferida pelo código, que prefere `bwrap` no Linux quando o probe passa, e pela reprodução, que obteve os mesmos sintomas com os argumentos do perfil (pacote de evidência em [Fontes e método](#fontes-e-método)). O comportamento sob Landlock não foi testado. A classificação dos códigos WebSocket além de 1012 é política do DSH apoiada no significado registrado, não em ocorrência observada nem em documentação do provedor. A relação entre `/tmp` e `grep`/`glob` em caminhos de spill é hipótese a testar. A mitigação local foi aplicada, mas ainda não foi validada por uma compactação bem-sucedida. Os achados sobre o RICK Intelligence (logout, rate limiting, shutdown do worker, snapshot versionado em `.runtime/`, inventário de manifests) pertencem a esse projeto e não foram reavaliados aqui. A falha de `make validate` por raiz de repositório divergente (`/home/ricardo/rick-intelligence` é um link simbólico para o caminho em `/mnt/dados`) não foi atribuída ao Harness.
