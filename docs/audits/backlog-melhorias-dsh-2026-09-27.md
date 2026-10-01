# Backlog de melhorias, correções e implementações do DSH — 27/09/2026

## Resumo

Este documento de referência detalha **44 entregas propostas**, cobrindo os 11 achados e as 20 áreas da auditoria técnica e operacional de 27/09/2026. Cada entrega possui resultado esperado, dependências, responsável sugerido, esforço relativo, tipo de solução proposto e critérios verificáveis. O [roadmap](roadmap-melhorias-dsh-2026-09-27.md) define fases, sequência e condições de homologação.

Este backlog especifica trabalho futuro. Nenhum item DSH-001 a DSH-044 foi executado por sua criação. O status inicial de todos é **PROPOSTO**, exceto DSH-024, DSH-033 e DSH-036, que são **CONDICIONAIS**. Uma falha confirmada na auditoria continua sendo evidência histórica até a reprodução na base escolhida para implementação; uma lacuna de evidência não é um defeito comprovado.

## Sumário

- [Fontes e resultados de origem](#fontes)
- [Regras de execução e encerramento](#regras)
- [Mapa dos 11 achados](#achados)
- [F0 — Base e reconciliação](#f0)
- [F1 — Recuperação e disponibilidade](#f1)
- [F2 — Correções confirmadas](#f2)
- [F3 — Integração e publicação](#f3)
- [F4 — Segurança e confiança](#f4)
- [F5 — Qualidade e experiência](#f5)
- [F6 — Operação observável e homologação](#f6)
- [Continuidade M01–M50 e REM](#legado)
- [Verificações e registro de entrega](#verificacao)

<a id="fontes"></a>
## Fontes e resultados de origem

**E-AUD:** auditoria técnica e operacional de 27/09/2026, versão observada `0.1.7-rc.2`, nota 73,5/100. O conjunto original fica em `~/.local/state/deepseek-harness/audits/`, no subdiretório de 27/09/2026 identificado por `scope.json`. Contém `relatorio-auditoria-dsh.md`, `scores.json`, `evidence-index.json`, `manifest.json`, `runtime.json`, `remote-evidence.json`, `architecture.md`, `security.md` e os logs nomeados abaixo. Esses artefatos são locais e não acompanham automaticamente um clone Git; DSH-001 prepara uma cópia sanitizada portátil e registra a revisão exata no controle de evidências apropriado.

| Fonte do conjunto E-AUD | Resultado histórico utilizado neste planejamento |
|---|---|
| `runtime.json` | Unidade temporária, `Restart=no`, listener local na porta 3080; restauração e rotina específica de backup não comprovadas. |
| `dependency-online.log`, `dependency-policy.log` | Um aviso alto em `sharp` e um moderado em `uuid`; gate de severidade reprovado. `dependency-prod.log` retornou zero avisos no conjunto classificado como produção. |
| `hygiene.log` | 18 verificações aprovadas e uma falha de constraints por três exports `./src/*`. |
| `session-replay.log` | Snapshot de compactação com projeção esperada de 7.158 tokens e observada de 5.404; causa não estabelecida. |
| `remote-evidence.json` | No último commit consultado, somente `Customization policy` executou remotamente; branches protegidas, detalhes de exigências não auditados. |
| `metrics.json` | 5.366 arquivos no corpus; 1.864 linhas com token `any` e dez com skips selecionados; excesso global e por owner. Padrões contados não equivalem a defeitos individuais. |
| `architecture.md`, `security.md` | Lacuna semântica na compactação; limites de leitura/rede e confiança MCP; revogação exige substituição do segredo e reativação; limpeza incompleta em falha antecipada de um teste. |
| `evidence-index.json` | 1.484 casos Vitest aprovados, um reprovado, 132 fora do filtro, em 45 arquivos selecionados; tipagem, lint e 44 verificações documentais aprovados. Não houve medição integral de cobertura. |
| `built-persistence.log` | Dois testes compilados aprovados, sem skip: a lacuna de execução do worker de migração foi fechada nesse recorte. |

As fontes históricas adicionais são [E-M50: backlog de cinquenta melhorias](backlog-50-melhorias-2026-09-23.md), [E-A26: revisão posterior](backlog-50-melhorias-2026-09-23-revisao-a26.md) e [E-REM: backlog de remediação](backlog-remediacao-2026-09-21.md). Seus resultados e prioridades pertencem às respectivas datas; o cruzamento ao final preserva os IDs e evita tratá-los como fatos atuais sem nova evidência.

<a id="regras"></a>
## Regras de execução e encerramento

**Prioridade:** P1 precede a homologação local contínua; P2 fecha lacunas relevantes; P3 trata melhoria localizada ou dependente de medição. **Esforço:** P = localizado, M = pacote/fluxo, G = múltiplos componentes ou operação. São tamanhos relativos, não prazos. **Responsáveis:** TL = responsável técnico, DEV = desenvolvimento, QA = testes, OPS = operação, SEC = segurança, DOC = documentação; são atribuições sugeridas.

O campo `solutionType` é uma escolha inicial para discussão segundo o [padrão do fork](../customization/improvement-development-standard.md), não um registro já promovido. Antes de editar produto, confirmar mecanismo existente, consumidores, paths e owner único na [política de customização](../../.agents/customization-policy.json). Se a solução precisar de outro tipo, justificar e dividir a entrega por proprietário; não usar um plugin para duplicar comportamento já pertencente a outro pacote.

Os IDs DSH descrevem entregas de planejamento. O status vivo, a autorização, as tentativas e a evidência permanecem no [backlog operacional](../../.agent/backlog.json), no [estado](../../.agent/state.json), no [ExecPlan](../../.agent/plans/deepseek-harness-aaa.md) e nos ledgers. DSH-002 decide a associação com tarefas existentes antes da promoção. A criação deste documento não altera aqueles registros nem inicia ações antigas.

Uma entrega só encerra com implementação ou decisão aplicável, critérios de aceite demonstrados, testes pertinentes, documentação proprietária atualizada e evidência vinculada ao candidato. Mudanças model-visible exigem log e snapshot pertinente; mudanças de Session respeitam gerações lançadas e consumidores das duas SDKs. Manter `master` como espelho e usar branches de trabalho a partir de `custom/main`.

Não apagar histórico, relaxar thresholds, ignorar erros, atualizar snapshots cegamente ou transformar teste não executado em PASS. Propostas condicionais podem ser adiadas ou julgadas não aplicáveis apenas com justificativa, evidência e gatilho de reabertura. A condição de segurança/dados necessária ao escopo homologado não pode ser dispensada por pontuação média.

As validações abaixo são **planejadas**. A preparação desta documentação não as executa em produção. Ensaios destrutivos usam dados descartáveis; cópias de dados reais, rotação de credenciais, reinício de uso diário, destinos externos e publicação respeitam a autorização aplicável. Nenhum segredo integra logs, exemplos, capturas ou commits.

<a id="achados"></a>
## Mapa dos 11 achados

Os IDs da auditoria são preservados. Subdividir uma correção não multiplica a quantidade de achados.

| Achado | Trabalho principal | Prova necessária |
|---|---|---|
| DSH-AUD-01 — serviço temporário | [DSH-006](#dsh-006), [DSH-007](#dsh-007), [DSH-008](#dsh-008) | Persistência, instância correta, recuperação e sessões preservadas. |
| DSH-AUD-02 — dependências | [DSH-009](#dsh-009), [DSH-010](#dsh-010), [DSH-016](#dsh-016) | Atualização compatível, consumidores testados e scanner/gate aprovados. |
| DSH-AUD-03 — exports proibidos | [DSH-011](#dsh-011) | Manifestos e consumidores conformes; constraints/hygiene aprovados. |
| DSH-AUD-04 — snapshot divergente | [DSH-012](#dsh-012) | Causa explicada e replay fiel ao comportamento pretendido. |
| DSH-AUD-05 — CI insuficiente | [DSH-014](#dsh-014), [DSH-015](#dsh-015) | Checks requeridos presentes no candidato publicado e exigidos para integrar. |
| DSH-AUD-06 — restauração não comprovada | [DSH-003](#dsh-003), [DSH-004](#dsh-004), [DSH-005](#dsh-005) | Cópia recuperada em instalação isolada, integridade e RPO/RTO medidos. |
| DSH-AUD-07 — orçamento de manutenção | [DSH-029](#dsh-029), [DSH-030](#dsh-030), [DSH-031](#dsh-031) | Corpus e ocorrências classificados; política e correções justificadas. |
| DSH-AUD-08 — fidelidade da compactação | [DSH-025](#dsh-025) | Resumo e próxima ação preservam fatos e restrições sintéticos. |
| DSH-AUD-09 — limites de isolamento | [DSH-019](#dsh-019), [DSH-020](#dsh-020), [DSH-021](#dsh-021), [DSH-023](#dsh-023) | Privilégios efetivos correspondem ao modelo de confiança declarado. |
| DSH-AUD-10 — revogação de cookies | [DSH-022](#dsh-022) | Cookie anterior recusado em todas as instâncias após revogação completa. |
| DSH-AUD-11 — limpeza de filho em teste | [DSH-013](#dsh-013) | Processo encerrado antes de remover o diretório, inclusive após erro antecipado. |

<a id="f0"></a>
## F0 — Base e reconciliação

Estas entregas estabelecem o candidato e a continuidade do trabalho, sem presumir que os estados antigos representam a instalação atual.

<a id="dsh-001"></a>
### DSH-001 — Fixar a base de implementação e tornar a evidência portátil

**Prioridade:** P1. **Esforço:** P. **Responsável:** TL/QA. **solutionType proposto:** `repository-automation`. **Dependências:** nenhuma.

**Origem e escopo:** E-AUD e áreas 11/14. Repositório, diferenças locais, referências remotas, serviço e conjunto de evidências. O pacote original contém revisão e hashes fora de `docs`.

**Entrega:** manifesto sanitizado com revisão, árvore/configuração pertinentes, comandos e resultados originais; cópia portátil dos relatórios necessários, sem credenciais ou conteúdo de conversas. Conferir upstream sem mover branches nem sobrescrever trabalho local.

**Aceite:** qualquer executor identifica a base, as alterações concorrentes e a origem de cada achado; checks históricos e atuais ficam separados. O documento de auditoria preexistente e arquivos de outros trabalhos permanecem intactos.

**Validação planejada:** comparar Git local/remoto por leitura, hashes do conjunto original e modos dos arquivos; conferir amostra de vínculos evidência→achado. Registrar impedimentos de acesso em vez de contorná-los.

<a id="dsh-002"></a>
### DSH-002 — Reconciliar tarefas atuais e planejamentos anteriores

**Prioridade:** P1. **Esforço:** M. **Responsável:** TL. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-001.

**Origem e escopo:** E-M50, E-A26, E-REM e área 14. [Controle do programa](../../.agent/backlog.json), [estado](../../.agent/state.json) e [mapa legado](#legado).

**Entrega:** para cada M/REM, registrar tarefa proprietária, evidência atual e disposição: coberto, ainda reproduzível, não revalidado, adiado ou não aplicável. Corrigir apontadores antigos apenas no controle proprietário e com histórico preservado.

**Aceite:** nenhum item histórico desaparece ou ganha conclusão sem prova; não há dois executores corrigindo o mesmo owner. AAA-022, AAA-023 e AAA-024 são conciliados com o objetivo atual, sem retomar automaticamente A16/A27 por texto datado.

**Validação planejada:** conferir integridade de IDs, dependências e referências nos ledgers; executar o verificador existente do programa após identificar sua entrada suportada. Pendências de autoridade ficam explícitas e não impedem a preparação independente de documentos.

<a id="f1"></a>
## F1 — Recuperação e disponibilidade

O ensaio de restauração é pré-condição da mudança na instalação diária. Objetivos e destinos ainda precisam ser definidos na execução.

<a id="dsh-003"></a>
### DSH-003 — Definir política de backup e objetivos de recuperação

**Prioridade:** P1. **Esforço:** M. **Responsável:** OPS/SEC. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-001.

**Origem e escopo:** DSH-AUD-06; sessões, anexos, configuração, perfis e material indispensável à recuperação. Consultar [persistência](../../packages/session/session-persistence-jsonl/README.md).

**Entrega:** inventário do que copiar e excluir, destino fora do disco original, retenção, criptografia, gestão da chave, consistência durante cópia e procedimento de retorno. Tratar separadamente credenciais e dados de conversas.

**Aceite:** RPO (perda máxima tolerada) e RTO (tempo máximo de recuperação) são definidos; 24 horas/60 minutos são apenas hipóteses iniciais do roadmap. Espaço, proprietário do destino e recuperação da chave estão comprovados. A existência de Timeshift não encerra o item.

**Validação planejada:** comparar inventário com dados sintéticos de sessão/anexo/configuração; simular ausência da instalação original no plano de recuperação. Nenhuma cópia externa ou aquisição de serviço é pressuposta.

<a id="dsh-004"></a>
### DSH-004 — Implementar e agendar a cópia recuperável

**Prioridade:** P1. **Esforço:** G. **Responsável:** OPS/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-003.

**Origem e escopo:** DSH-AUD-06. Automação operacional e configuração local escolhidas após inventariar mecanismos já existentes.

**Entrega:** backup consistente, execução serializada, agendamento persistente, retenção controlada e resultado observável. Preferir ferramenta mantida já adequada ao ambiente; scripts versionados recebem referências de segredos, nunca seus valores.

**Aceite:** uma falha, interrupção, destino cheio ou chave ausente produz erro verificável; não se apaga a última cópia válida. A frequência cumpre o RPO e uma cópia no mesmo disco não é a única recuperação. Confirmar política de cópia de sessões abertas sem alterar gerações lançadas.

**Validação planejada:** ensaios sintéticos de sucesso, execução concorrente, interrupção, retenção e falha de destino; conferir bytes recuperáveis e última execução válida. Acesso a dados reais ocorre só dentro da autorização e destino definidos.

<a id="dsh-005"></a>
### DSH-005 — Demonstrar restauração isolada de sessões e anexos

**Prioridade:** P1. **Esforço:** G. **Responsável:** OPS/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-004.

**Origem e escopo:** DSH-AUD-06; armazenamento, anexos, perfis e [launcher por perfil](../../apps/cli/README.md).

**Entrega:** restauração em diretório/instância isolados, com destino e porta próprios, artefato compatível e comparação de integridade. Começar por dados sintéticos; usar amostra real apenas se autorizada e necessária.

**Aceite:** sessões restauradas abrem, anexos referenciados estão presentes e íntegros, configurações e permissões correspondem ao inventário; RPO/RTO são medidos. A instância original não é sobrescrita e a cópia não inicia trabalhos ou uploads reais inadvertidamente.

**Validação planejada:** comparar hashes/contagens de arquivos selecionados e abrir uma conversa sintética restaurada pelo perfil `dsh`; testar backup incompleto e chave inválida. Documentar reconstrução de índices e limites que não foram ensaiados.

<a id="dsh-006"></a>
### DSH-006 — Tornar o serviço local persistente e recuperável

**Prioridade:** P1. **Esforço:** M. **Responsável:** OPS/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-001, DSH-005.

**Origem e escopo:** DSH-AUD-01; unidade de usuário e instalação, com referência ao [perfil Web](../../apps/cli/README.md). A auditoria observou `transient` e `Restart=no`.

**Entrega:** unidade persistente revisada, lançamento pelo CLI/perfil suportado, caminho de runtime definido, reinício com intervalo e limite, drenagem no encerramento e logs privados. Preservar home, diretório de trabalho, perfil e endpoint efetivos.

**Aceite:** serviço tem configuração persistente e retorna de falha conforme política; comportamento antes/depois do login e no boot é documentado e testado. Não depender tacitamente de um shell interativo ou de seleção de Node pelo terminal. Retorno à configuração anterior está disponível.

**Validação planejada:** validar unidade e realizar início/parada em ambiente controlado; comparar configuração anterior e nova. Alterar inicialização sem login ou reiniciar uso diário somente quando esse escopo operacional estiver autorizado.

<a id="dsh-007"></a>
### DSH-007 — Identificar a instância, o endpoint e o artefato em uso

**Prioridade:** P1. **Esforço:** M. **Responsável:** OPS/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-006.

**Origem e escopo:** área 17 e incidente anterior de duas instâncias nas portas 3000/3080. Launcher e diagnóstico da instalação.

**Entrega:** procedimento idempotente que identifica processo, porta, perfil, home e revisão/artefato antes de atualizar. Reutilizar metadados existentes; acrescentar diagnóstico apenas onde necessário.

**Aceite:** abrir ou atualizar o programa aponta para a instância pretendida; processo antigo não é confundido com o serviço novo. Instâncias intencionais em homes/portas distintos continuam permitidas. Detectar duplicação não autoriza encerrar processos alheios.

**Validação planejada:** ensaiar serviço ativo, ausente, porta ocupada e duas instâncias controladas; verificar URL de destino e artefato carregado. Não registrar tokens de autenticação de lançamento.

<a id="dsh-008"></a>
### DSH-008 — Ensaiar boot, falha e atualização com preservação de dados

**Prioridade:** P1. **Esforço:** G. **Responsável:** OPS/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-005, DSH-006, DSH-007.

**Origem e escopo:** DSH-AUD-01/06 e áreas 2/6/17. Serviço, drenagem de sessões e atualização/retorno operacional.

**Entrega:** ensaios de encerramento gracioso, falha de processo, perda da conexão do navegador e reboot em ambiente separado. Atualização usa candidato conhecido e plano de retorno compatível com o formato de dados.

**Aceite:** endpoint volta dentro do objetivo definido, existe uma instância esperada e o último estado persistido é legível; não há duas posses de escrita da mesma sessão. Não presumir downgrade de gerações de Session nem apagar versões históricas para retornar código.

**Validação planejada:** sessões sintéticas com turnos e anexos, erro de startup e crash durante operação; conferir estado final e logs. Reboot da máquina compartilhada não é um passo automático deste ensaio.

<a id="f2"></a>
## F2 — Correções confirmadas

As observações desta fase foram registradas na auditoria. Cada implementação reproduz seu problema na base corrente antes de escolher a mudança.

<a id="dsh-009"></a>
### DSH-009 — Atualizar sharp e verificar consumidores de build/teste

**Prioridade:** P1. **Esforço:** M. **Responsável:** DEV/SEC. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-001.

**Origem e escopo:** DSH-AUD-02. [Desktop](../../apps/desktop/package.json), [spill-policy](../../packages/spill/spill-policy/package.json) e lockfile. E-AUD registrou `sharp 0.35.3` e correção indicada a partir de `0.35.4`.

**Entrega:** conferir o aviso vigente no momento da execução e atualizar para uma versão compatível corrigida, com revisão do lockfile e dependências nativas. Os imports observados pertenciam a teste e geração de ícone; não presumir exploração no Web.

**Aceite:** aviso alto eliminado ou tratado por disposição explícita permitida pela política; gate de dependências passa; geração de ícone e teste multimodal conservam o resultado. Não criar exceção apenas para obter saída zero.

**Validação planejada:** `pnpm audit --json`, `pnpm run verify-dependency-audit`, teste multimodal proprietário e geração de ícone na plataforma aplicável; registrar diferenças entre dependências de desenvolvimento, produção e artefato final.

<a id="dsh-010"></a>
### DSH-010 — Resolver uuid transitivo sem forçar incompatibilidade

**Prioridade:** P2. **Esforço:** M. **Responsável:** DEV/SEC. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-001.

**Origem e escopo:** DSH-AUD-02. [Prévia de documentos](../../packages/client/ui-sidebar-documentpreview/package.json), FortuneSheet/ExcelJS e lockfile. O aviso moderado histórico envolveu `uuid 8.3.2`.

**Entrega:** traçar uso das APIs afetadas e atualizar os consumidores transitivos por caminho suportado. Avaliar compatibilidade antes de qualquer override; manter a distinção entre nome do método e versão do pacote.

**Aceite:** decisão e alcance do aviso documentados; dependências corrigidas quando compatíveis; abrir, editar e exportar planilha continua funcional. Não promover uma troca major global sem testes dos consumidores.

**Validação planejada:** scanner completo e de produção, grafo da dependência e casos de prévia/edição/exportação com arquivos sintéticos; confirmar requisitos nativos ou de browser do artefato resultante.

<a id="dsh-011"></a>
### DSH-011 — Alinhar os três exports ao contrato de publicação

**Prioridade:** P1. **Esforço:** M. **Responsável:** DEV. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-001.

**Origem e escopo:** DSH-AUD-03. [product-analytics](../../packages/client/product-analytics/package.json), [schedule-bundle](../../packages/experimental/schedule-bundle/package.json), [otel](../../packages/telemetry/otel/package.json) e seus consumidores.

**Entrega:** remover ou substituir `./src/*` por entradas públicas suportadas, após mapear imports e conteúdo do pacote. Preservar resolução da fonte nos testes e dos artefatos nos consumidores publicados.

**Aceite:** os três manifestos cumprem [constraints](../../scripts/check-workspace-constraints.ts), consumidores instalam/resolvem as entradas e nenhum teste passa por resíduo de build. Não ampliar exceção global do verificador.

**Validação planejada:** `pnpm run constraints`, `pnpm run hygiene`, build e smoke de consumo dos pacotes afetados; caso negativo continua rejeitando export indevido.

<a id="dsh-012"></a>
### DSH-012 — Diagnosticar e corrigir o snapshot de compactação

**Prioridade:** P1. **Esforço:** G. **Responsável:** DEV/QA. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-001.

**Origem e escopo:** DSH-AUD-04. [Cenário](../../snapshots/session/resilient-compaction-timeout/snapshot.yml), [runner](../../snapshots/session/headless.snapshot.ts), composição, prompt e medidor de tokens.

**Entrega:** explicar a projeção esperada de 7.158 e observada de 5.404 tokens; distinguir mudança legítima de composição/tokenização de regressão no cálculo, reserva ou janela. Corrigir a fonte responsável.

**Aceite:** teste volta a passar com motivo verificável; recusa de contexto inválido permanece correta. Alterar esperado só após provar a intenção; respeitar a política de gerações imutáveis e de atualização das fixtures.

**Validação planejada:** `pnpm run test:snapshot snapshots/session/headless.snapshot.ts -t 'tool-call-turn|resilient-compaction-timeout'`, inspeção dos logs e testes de limites pertinentes. Explicar filtros/skips e atualizar saídas das SDKs somente quando afetadas.

<a id="dsh-013"></a>
### DSH-013 — Aguardar a saída do processo no teste de lease

**Prioridade:** P3. **Esforço:** P. **Responsável:** DEV/QA. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-001.

**Origem e escopo:** DSH-AUD-11; [lease.two-process.e2e.ts](../../packages/session/session-persistence-jsonl/tests/lease.two-process.e2e.ts). O `finally` inspecionado mata o filho sem esperar a saída após falha antecipada.

**Entrega:** teardown que aguarda o filho também na falha, trata erro de spawn e não deixa promise de saída pendurada. Preservar posse e isolamento dos recursos do teste.

**Aceite:** falha injetada depois de criar o filho comprova encerramento antes de remover o diretório; caminho normal mantém exclusão do segundo escritor e takeover após crash. Não alegar flakiness já reproduzida sem medição.

**Validação planejada:** teste de lease compilado, controle negativo de falha antecipada e inspeção de descendentes residuais. Seguir [confiabilidade dos testes](../../.agents/skills/dsh-ci-test-reliability/SKILL.md).

<a id="f3"></a>
## F3 — Integração e publicação

O fluxo remoto deve provar o candidato que integra as melhorias. Um workflow de política bem-sucedido não substitui validação funcional.

<a id="dsh-014"></a>
### DSH-014 — Executar CI funcional na integração de custom/main

**Prioridade:** P1. **Esforço:** G. **Responsável:** DEV/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-009, DSH-011, DSH-012.

**Origem e escopo:** DSH-AUD-05; [CI](../../.github/workflows/ci.yml), [política de customização](../../.github/workflows/customization-policy.yml) e [seleção de checks](../../.agents/skills/dsh-pre-push-checks/SKILL.md).

**Entrega:** fluxo de PR ou push que inclua tipos, lint, docs, higiene, dependências e testes/snapshots do escopo, com cobertura e lanes de plataforma apropriadas. Reusar a infraestrutura existente e não duplicar a suíte inteira por hábito.

**Aceite:** PR/commit válido executa os checks exigidos; fixture com falha é recusada; filtros de paths não pulam silenciosamente mudanças relevantes. Forks não recebem segredos nem runners persistentes indevidos. Logs identificam o candidato e distinguem skip de aprovação.

**Validação planejada:** casos de gatilho e escopo, checks locais correspondentes e uma execução real autorizada do fluxo remoto. A inspeção estática do YAML sozinha não encerra o item.

<a id="dsh-015"></a>
### DSH-015 — Verificar regras de integração e proteção das branches

**Prioridade:** P1. **Esforço:** P. **Responsável:** TL/mantenedor. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-014.

**Origem e escopo:** DSH-AUD-05 e área 14. Regras remotas e [governança upstream](../customization/upstream-safe-customization.md).

**Entrega:** verificar nomes dos checks obrigatórios, revisão exigida, bypass e caminhos de integração; configurar o fluxo aprovado preservando o espelho upstream.

**Aceite:** evidência remota mostra quais condições bloqueiam uma integração; check ausente/vermelho não equivale a pronto. `master` permanece dedicada ao espelho e a branch de melhorias conserva histórico. Não usar force-push irrestrito.

**Validação planejada:** leitura das regras e ensaio não destrutivo em PR/branch de teste autorizado; comparar refs após integração. Um indicador genérico `protected: true` não comprova todas as exigências.

<a id="dsh-016"></a>
### DSH-016 — Manter dependências e artefatos de publicação verificáveis

**Prioridade:** P2. **Esforço:** M. **Responsável:** DEV/SEC. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-009, DSH-010, DSH-014.

**Origem e escopo:** DSH-AUD-02/05 e E-REM. [Scanner](../../scripts/verify-dependency-audit.ts), [política pnpm](../../scripts/verify-pnpm-supply-chain.ts), [cadeia de publicação](../../scripts/verify-release-supply-chain.ts).

**Entrega:** atualização revisável de lockfile/pins, origem e atualidade da base de avisos, tratamento de scan indisponível, SBOM e attestations quando a release as exigir. Verificar imagens, ações, scripts de instalação e timeouts dos jobs.

**Aceite:** um scan offline não é anunciado como consulta atual sem prova da base; exceção possui owner, validade e razão. Artefatos correspondem ao lockfile/candidato e uma violação sintética é recusada. Não ignorar dependência de build só porque `--prod` retorna zero.

**Validação planejada:** verificadores existentes de dependências, pins, imagens, cadeia de release e timeouts; comparar SBOM ao artefato preparado. Não publicar pacotes como efeito do teste.

<a id="dsh-017"></a>
### DSH-017 — Ensaiar atualização upstream e retirada de patches absorvidos

**Prioridade:** P2. **Esforço:** M. **Responsável:** TL/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-002, DSH-014, DSH-015.

**Origem e escopo:** área 14, M12 e [política do fork](../../.agents/customization-policy.json).

**Entrega:** ensaio em checkout isolado que atualize o espelho, integre a base à branch personalizada e identifique conflitos/patches já incorporados upstream. Registrar caminhos e owner de cada delta.

**Aceite:** nenhuma melhoria se perde; testes pertinentes passam na integração; cada caminho possui um proprietário. Patch absorvido só é removido após comparar comportamento e consumidores. Ausência de atualização disponível produz ensaio documentado, não commit vazio.

**Validação planejada:** leitura/fetch de refs atuais, ensaio de merge, checks do escopo e `node scripts/verify-customization-policy.mjs --base master`; conferir que o checkout diário não foi alterado pelo ensaio.

<a id="dsh-018"></a>
### DSH-018 — Qualificar as plataformas e runtimes declarados

**Prioridade:** P2. **Esforço:** G. **Responsável:** QA/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-011, DSH-014; DSH-042 para a comprovação final do candidato.

**Origem e escopo:** área 12/13, M13 e REM-022. Manifestos, CLI, componentes nativos, Windows/macOS/Linux e SDK Python conforme suporte declarado.

**Entrega:** matriz explícita de plataforma, arquitetura, versão de Node/Python, artefato e suite. Preparar o fluxo nesta fase e executar a qualificação final sobre o artefato de DSH-042.

**Aceite:** cada plataforma anunciada tem resultado não ambíguo no candidato; faltas de runner, PowerShell ou runtime aparecem como não verificado. Não substituir teste nativo por resultado Linux nem afirmar cobertura de todas as versões permitidas pelo manifesto.

**Validação planejada:** lanes existentes de instalação, startup, persistência, SDKs e sandbox da matriz escolhida; registrar skips e limites. Não executar Wine sem a condição específica exigida pelo projeto.

<a id="f4"></a>
## F4 — Segurança e confiança

Esta fase testa os privilégios efetivos em instalações sintéticas. Endurecimento deve corresponder ao uso escolhido, sem chamar a proteção de escrita de isolamento completo.

<a id="dsh-019"></a>
### DSH-019 — Definir matriz de permissões por perfil e ferramenta

**Prioridade:** P2. **Esforço:** M. **Responsável:** SEC/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-001.

**Origem e escopo:** áreas 3/7/8/9 e DSH-AUD-09. [Ferramentas](../../packages/core/tools/README.md), [aprovação](../../packages/interaction/user-approval/README.md) e perfis reais, inspecionados sem publicar segredos.

**Entrega:** matriz de leitura, escrita, subprocesso, rede, MCP, instalação e escalada: permitido, negado ou sujeito a aprovação. Associar cada regra ao enforcement real, não só ao prompt.

**Aceite:** operações legítimas funcionam e proibidas falham antes do efeito; aprovação ausente, recusada, inválida e cancelada não amplia privilégio. Chamadores alternativos e perfis sobrepostos não removem a regra.

**Validação planejada:** testes de ferramenta/escopo, aprovação e contenção com arquivos e credenciais sentinela; conferir configuração efetiva com valores sensíveis ocultos.

<a id="dsh-020"></a>
### DSH-020 — Aplicar o modelo de isolamento escolhido para leitura e rede

**Prioridade:** P2. **Esforço:** G. **Responsável:** SEC/OPS/DEV. **solutionType proposto:** `profile-patch`. **Dependências:** DSH-019.

**Origem e escopo:** DSH-AUD-09; [sandbox local](../../packages/sandbox/sandbox-local/README.md) e [perfis](../../packages/sandbox/sandbox-local/src/profiles.ts).

**Entrega:** decidir ameaça e dados acessíveis; compor os provedores/políticas existentes para o escopo escolhido. Se for necessário usuário/container ou mecanismo novo além de composição, abrir subentrega de infraestrutura ou implementação com tipo e owner próprios antes de alterar runtime.

**Aceite:** leitura e rede permitidas/negadas correspondem à política; executor indisponível falha explicitamente. Uso local confiável tem limitações documentadas; um requisito de executar código não confiável permanece aberto até haver isolamento adicional comprovado.

**Validação planejada:** tentar ler sentinela fora dos caminhos autorizados e acessar destinos controlados; conferir comportamento sob falha do runner. Não usar dados privados reais nem declarar segurança geral a partir de um teste de escrita.

<a id="dsh-021"></a>
### DSH-021 — Governar servidores MCP, plugins e extensões dinâmicas

**Prioridade:** P2. **Esforço:** G. **Responsável:** SEC/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-019, DSH-020.

**Origem e escopo:** DSH-AUD-09; [MCP](../../packages/mcp/mcp-client/README.md), [Plugin Manager](../../packages/boot/plugin-manager/README.md) e extensões instaladas.

**Entrega:** inventário de origem, versão, comando, privilégios e proprietário; critérios de aprovação/atualização/remoção e verificação do confinamento efetivo de cada transport. Revalidar sucesso de instalação quando scripts de build não rodam.

**Aceite:** extensão desconhecida não entra por decisão implícita; configuração secreta não aparece no inventário; falha de instalação não é sucesso; descarte remove processos e registros. Opt-ins de execução dinâmica mantêm consentimento e limites documentados.

**Validação planejada:** servidor MCP sintético, instalação com build recusado, reconexão e descarte durante negociação; verificar host e cliente conforme a política. Um stdio MCP não é considerado confinado apenas porque Bash é.

<a id="dsh-022"></a>
### DSH-022 — Documentar e testar revogação de cookies e credenciais

**Prioridade:** P2. **Esforço:** M. **Responsável:** SEC/OPS. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-019.

**Origem e escopo:** DSH-AUD-10; [autenticação](../../packages/client/connection/src/browser-auth.ts) e [teste de cookies](../../packages/client/connection/tests/browser-auth.host.spec.ts).

**Entrega:** procedimento que substitui o material de assinatura e reativa todas as instâncias afetadas, com confirmação de revogação. Cobrir credenciais de provedores e resposta a comprometimento sem expor os valores.

**Aceite:** cookie anterior é recusado por todas as instâncias de teste; novo acesso autorizado funciona; falha parcial indica instância ainda não revogada. Apagar o registro isoladamente ou reiniciar mantendo o mesmo segredo não é prova de revogação.

**Validação planejada:** duas instâncias e armazenamento descartáveis; cookies sintéticos antes/depois, troca incompleta e retorno de serviço. Revogação instantânea em processo exige decisão de requisito e subentrega específica, caso necessária.

<a id="dsh-023"></a>
### DSH-023 — Verificar segredos em subprocessos, Settings e diagnósticos

**Prioridade:** P2. **Esforço:** G. **Responsável:** SEC/DEV. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-019, DSH-020.

**Origem e escopo:** área 7, DSH-AUD-09 e revalidação M01/M02/M36. [Credenciais](../../packages/credentials/credentials-local/README.md), [Settings](../../packages/settings/settings/src/redact.ts) e [proxy](../user/guide/network-proxy.md).

**Entrega:** testar transporte de proxy autenticado, máscaras em esquemas complexos, ambiente/argumentos e erros/logs. Corrigir apenas vazamento reproduzível no owner; preservar serviço legítimo e referências de credenciais.

**Aceite:** segredos sentinela não aparecem nos canais que a política proíbe; Settings não devolve campo secreto por união/interseção/transformação; código com mesmo usuário não é falsamente anunciado como isolado por `chmod 600`. Guia e comportamento concordam.

**Validação planejada:** sentinelas em Bash/PowerShell/PTY quando aplicáveis, respostas Remote e arquivos de diagnóstico; dados inválidos falham de forma segura. Varredura de histórico, quando autorizada, relata local e categoria sem imprimir segredo.

<a id="dsh-024"></a>
### DSH-024 — Qualificar HTTPS, cookies e origem para acesso remoto

**Status:** CONDICIONAL. **Prioridade:** P2. **Esforço:** G. **Responsável:** SEC/OPS/DEV. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-019, DSH-022.

**Origem e escopo:** condição de transporte em E-AUD; [Connection](../../packages/client/connection/README.md). O ambiente auditado era loopback; não houve exploração remota comprovada.

**Gatilho e entrega:** necessidade aprovada de acesso fora do loopback. Definir TLS/túnel, proxy confiável, autoridades, esquema de origem, política de cookie `Secure` e headers do documento autenticado; corrigir o owner apenas onde o requisito exigir.

**Aceite:** transporte não expõe cookie/token, requisição com autoridade/origem não permitida é recusada mesmo com contexto sintético autenticado e headers de proxy não concedem confiança por si. Não inferir CSP do documento por uma resposta de erro sem autenticação.

**Validação planejada:** proxy isolado e credenciais sintéticas; fluxo HTTP/HTTPS, downgrade, origem inválida e retorno ao uso local. Sem gatilho, registrar implantação local e condição de reabertura; não publicar interface para testar.

<a id="f5"></a>
## F5 — Qualidade de comportamento e experiência

Os testes desta fase ampliam a evidência por cenário. Otimização e simplificação exigem problema demonstrado, e a interface é validada pela composição que o usuário realmente executa.

<a id="dsh-025"></a>
### DSH-025 — Avaliar fidelidade semântica após compactação

**Prioridade:** P2. **Esforço:** G. **Responsável:** QA/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-012, DSH-019.

**Origem e escopo:** DSH-AUD-08; [summarizer](../../packages/compaction/compaction-basic/src/summarizer.ts) e [contrato de compactação](../../packages/compaction/compaction-basic/README.md).

**Entrega:** conjunto sintético com objetivo, correções do usuário, proibições, identificadores exatos, efeitos já realizados e trabalho pendente; avaliar resumo e próxima ação após retomada. Decidir se estrutura de seções é obrigatória ou orientação.

**Aceite:** restrições obrigatórias, identidade e estado do trabalho permanecem corretos; controle negativo com resumo que omite proibição é reprovado. Texto não vazio e redução de tokens não bastam. Critérios, amostra e limites são fixados antes da execução.

**Validação planejada:** replay determinístico para mecanismo e avaliações delimitadas com provedores autorizados para conteúdo semântico; verificar efeitos externos sintéticos, não apenas a autoavaliação do modelo. Falha real gera correção no pacote proprietário.

<a id="dsh-026"></a>
### DSH-026 — Ampliar testes reais e de falha dos provedores utilizados

**Prioridade:** P2. **Esforço:** G. **Responsável:** QA/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-009, DSH-014, DSH-019.

**Origem e escopo:** área 4; [pi-ai](../../packages/llm/llm-pi-ai/README.md) e perfis suportados. A correção do OpenCode já foi implementada; esta entrega mantém e amplia sua comprovação.

**Entrega:** matriz das rotas efetivamente usadas: streaming, ferramenta, retomada, cancelamento, limite/cota, autenticação inválida, timeout e imagem/raciocínio quando a rota suportar. Usar `dsh` e credenciais existentes sem expor valores.

**Aceite:** OpenCode recebe ID real estável por conversa e distinto entre conversas, inclusive repetição/concorrência; outras rotas preservam headers. Falha distingue causa útil e não duplica efeitos; saída legítima é confirmada por log/estado. Modelos não testados ficam identificados.

**Validação planejada:** suíte `llm-pi-ai`, fixtures HTTP de falha e chamadas reais pequenas com orçamento/autorização definidos; manter o endereço e a instância corretos, sem repetir tarefas reais do usuário.

<a id="dsh-027"></a>
### DSH-027 — Exercitar concorrência, cancelamento e descarte sob carga

**Prioridade:** P2. **Esforço:** G. **Responsável:** DEV/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-013, DSH-014.

**Origem e escopo:** áreas 2/3/9/10 e M29/M32. [Agent loop](../../packages/core/agent-loop/README.md), jobs, filas, streams, PTY, MCP e watchers.

**Entrega:** carga controlada com falha, timeout, reconexão, cancelamento durante await e descarte repetido; medir filas, listeners, memória, descritores e processos próprios. Incluir backpressure/admissão antes da alocação excessiva.

**Aceite:** nenhuma publicação após descarte ou execução duplicada indevida; tarefas terminam ou cancelam com causa; recursos retornam ao patamar definido. Um warning é investigado antes de ser chamado de vazamento; um teste que só passa sozinho não encerra o item.

**Validação planejada:** fixtures sincronizadas e portas/diretórios próprios, carga e duração definidas previamente, perfil compilado e inspeção de descendentes. Não aplicar teste de estresse ao serviço diário.

<a id="dsh-028"></a>
### DSH-028 — Preservar regressões de Session, migração e SDKs

**Prioridade:** P2. **Esforço:** G. **Responsável:** DEV/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-011, DSH-012, DSH-014.

**Origem e escopo:** áreas 2/4/6/11; [política de testes](../testing.md), [formatos](../session-format-status.md), snapshots Session/SDK/ACP e persistência compilada.

**Entrega:** matriz de criação, retomada, fork, cancelamento, veto e falha parcial; manter não-skipped os smokes de worker/migração e lease. Atualizar saídas TypeScript/Python quando a mudança afetar o loop ou eventos.

**Aceite:** chamadas model-visible são reconstruíveis do log, sucessores de formato preservam gerações lançadas e cenários inválidos são recusados. Os dois testes compilados já aprovados em E-AUD são regressões a manter, não corrupção a corrigir.

**Validação planejada:** snapshots por perfil, worker compilado e lease entre processos, leitura de fixtures históricas suportadas e saídas das SDKs no mesmo candidato. Não regravar gerações comprometidas no Git.

<a id="dsh-029"></a>
### DSH-029 — Auditar cobertura, skips e seleção dos testes

**Prioridade:** P2. **Esforço:** M. **Responsável:** QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-014.

**Origem e escopo:** áreas 11/20, DSH-AUD-07, M28/M30 e REM-020/023. [Configuração Vitest](../../vitest.config.ts) e [política](../testing.md).

**Entrega:** inventário de exclusões, ignores e skips com owner, razão, condição de execução e gatilho; separar medição de cobertura de quantidade de testes aprovados. Revisar controles negativos ignorados.

**Aceite:** relatório informa corpus, testes selecionados, executados e não executados; exclusão não mascara código produtivo alterado. Uma suite sem infraestrutura necessária permanece não verificada. Manter threshold existente salvo revisão justificada da regra, nunca para ocultar falha.

**Validação planejada:** cobertura dos owners alterados com seleção explícita de fonte/testes; corpus integral pela lane responsável quando necessário à qualificação. Reativar controle negativo somente com precondições suportadas.

<a id="dsh-030"></a>
### DSH-030 — Classificar a dívida e revisar a comparabilidade das métricas

**Prioridade:** P2. **Esforço:** M. **Responsável:** TL/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-002, DSH-029.

**Origem e escopo:** DSH-AUD-07; [audit-metrics](../../scripts/audit-metrics.ts). O corpus histórico cresceu de 4.436 para 5.366 arquivos.

**Entrega:** classificação por owner, produção/teste, linha/padrão e risco; distinguir mudança de corpus, dívida nova e migração. Manter uma base reproduzível, orçamentos locais e disposição para excedentes.

**Aceite:** cada excesso relevante possui interpretação e ação; uma linha contendo `any` não é automaticamente bug. Arquivo selecionado realmente ausente continua sendo erro. Revisar metodologia exige justificativa e comparação anterior/nova, preservando os resultados reprovados.

**Validação planejada:** `pnpm run audit:metrics` e testes do medidor com caso inválido; conferir hashes do corpus e amostra por owner antes de aprovar orçamento novo.

<a id="dsh-031"></a>
### DSH-031 — Reduzir dívida de tipos e leitores em lotes por proprietário

**Prioridade:** P2. **Esforço:** G. **Responsável:** DEV. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-028, DSH-030.

**Origem e escopo:** DSH-AUD-07, M08/M22/M23/M24 e REM-028/035. Owners priorizados pela classificação, sem refatoração indiscriminada.

**Entrega:** remover `any` arriscado, leitor obsoleto e supressão dispensável com consumidores e contratos atualizados. Revalidar opções mais estritas do compilador/lint em experimentos separados antes de mudar globalmente.

**Aceite:** melhoria mensurável no owner, sem cast novo para `unknown`, perda de compatibilidade de Session ou redução de verificação. Supressões ainda necessárias têm justificativa local; cada lote conserva comportamento e saídas das SDKs afetadas.

**Validação planejada:** tipos/lint, métrica por owner, testes e snapshots do consumidor; configurações mais estritas só avançam com custo e ruído medidos. Não converter queda de contagem em alegação de qualidade sem revisão.

<a id="dsh-032"></a>
### DSH-032 — Medir sessões longas e recursos com carga representativa

**Prioridade:** P2. **Esforço:** G. **Responsável:** QA/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-008, DSH-027.

**Origem e escopo:** área 15, M29/M31; [benchmarks e regras](../testing.md) e `benchmarks/`.

**Entrega:** linha de base de abertura/retomada, tempo até primeiro token, latência de ferramenta, memória, filas e recuperação em sessões longas. Separar tempo do modelo/rede do overhead do harness e recursos do serviço dos de outros processos.

**Aceite:** carga, duração, amostra, concorrência e limites são definidos antes do resultado; p50/p95 e consumo têm método e ambiente registrados. Comparações usam o mesmo cenário; ausência de benchmark não é atribuída a lentidão.

**Validação planejada:** selecionar benchmarks existentes e cenários sintéticos adicionais somente para lacunas; executar artefatos compilados, medir repouso e carga e verificar ruído do host. Fixar limites antes de avaliar regressão.

<a id="dsh-033"></a>
### DSH-033 — Otimizar apenas gargalos medidos

**Status:** CONDICIONAL. **Prioridade:** P3. **Esforço:** G. **Responsável:** DEV/QA. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-032.

**Origem e escopo:** área 15 e M46. Owner do gargalo demonstrado em DSH-032.

**Gatilho e entrega:** limite predefinido violado ou ganho operacional material demonstrável. Corrigir consulta/projeção, retenção, fila ou caminho da última resposta somente após identificar seu custo.

**Aceite:** melhoria antes/depois no mesmo benchmark e saída semanticamente idêntica; cancelar/descarregar continua liberando recursos. Sem gargalo, registrar não aplicabilidade e gatilho mensurável, sem introduzir cache especulativo.

**Validação planejada:** benchmark comparativo repetível, testes de invalidação e regressão do owner e controle de memória sob carga. Resultados isolados com host distinto não sustentam ganho anunciado.

<a id="dsh-034"></a>
### DSH-034 — Validar as jornadas Web completas e recuperação de conexão

**Prioridade:** P2. **Esforço:** G. **Responsável:** QA/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-014, DSH-026.

**Origem e escopo:** área 16; [testes Web](../../apps/web/tests/default-model.e2e.ts), onboarding e composição real via `dsh`.

**Entrega:** criação de sessão, seleção/persistência de modelo, anexos, streaming, parar/retomar, falha de provedor e reconexão. Isolar home/dados e usar o [seletor de diretório de testes](../../apps/web/tests/pin-browse-picker.overlay.yml) quando a automação precisar dele.

**Aceite:** interface e log/estado concordam; atualização reconecta ao endpoint certo e não duplica envio; estados de erro são acionáveis; credenciais e tokens não aparecem na evidência. Teste real anterior do OpenCode não é anunciado como execução nova.

**Validação planejada:** Playwright sobre perfil suportado, falhas sintéticas e confirmação de eventos persistidos; chamada real somente no escopo autorizado. Correção GUI descoberta é entregue com evidência visual e requisitos de snapshot do projeto.

<a id="dsh-035"></a>
### DSH-035 — Avaliar e corrigir acessibilidade e layouts menores

**Prioridade:** P2. **Esforço:** G. **Responsável:** QA/DEV. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-034.

**Origem e escopo:** área 16; jornadas centrais e componentes de UI proprietários, seguindo [padrão de interface](../../.agents/skills/dsh-client-ui-ux/SKILL.md).

**Entrega:** avaliação por teclado, foco de modais/menus, nomes acessíveis, leitor de tela, contraste, zoom e larguras menores; correções localizadas com textos nas traduções já suportadas.

**Aceite:** tarefas principais são concluídas sem mouse, foco não fica preso/perdido, erros são identificáveis e conteúdo não impede operação por overflow. Critérios e ferramentas usados ficam registrados; não declarar certificação integral com uma varredura automática.

**Validação planejada:** checagem automatizada mais revisão manual em amostra declarada, cenários de abertura/fechamento, erro e loading; screenshots/GIF exigidos para PR de comportamento GUI e gate de i18n pertinente.

<a id="dsh-036"></a>
### DSH-036 — Simplificar APIs, UI e caches quando houver necessidade

**Status:** CONDICIONAL. **Prioridade:** P3. **Esforço:** M. **Responsável:** TL/DEV. **solutionType proposto:** `upstream-package-change`. **Dependências:** DSH-002, DSH-032, DSH-034.

**Origem e escopo:** M37–M44/M46/M49/M50, conforme [mapa legado](#legado). A lista anterior não prova que cada mudança ainda seja necessária.

**Gatilho e entrega:** consumidor real, duplicação relevante, contrato enganoso ou custo medido. Tratar em lotes separados por owner: parâmetros não usados, `namespace`, prévias, DisclosureRow, cache de identidade, watchers e grafos.

**Aceite:** proposta elimina código/ambiguidade ou corrige comportamento demonstrado; todos os consumidores e docs são atualizados; API genérica não cresce por uma necessidade de um único chamador. Ausência do gatilho gera disposição explícita.

**Validação planejada:** busca de consumidores, medição quando cabível, teste de contrato/lifecycle e evidência GUI para mudanças visíveis. Cada subitem conserva o aceite original M correspondente.

<a id="f6"></a>
## F6 — Operação observável e homologação

Os itens desta fase podem começar quando suas dependências estiverem prontas. A criação do candidato e a reauditoria são os últimos passos.

<a id="dsh-037"></a>
### DSH-037 — Consolidar diagnóstico de saúde e identidade da instalação

**Prioridade:** P2. **Esforço:** M. **Responsável:** OPS/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-007, DSH-014.

**Origem e escopo:** áreas 17/18. Serviço, endereço, artefato, permissões e storage; reusar diagnóstico existente antes de adicionar endpoint ou pacote.

**Entrega:** relatório operacional de processo, perfil, home, versão, porta, disponibilidade e estado das dependências locais; estados saudável/degradado/indisponível com causa acionável.

**Aceite:** prova local usa a mesma instância do usuário; erro de configuração ou storage aparece sem segredo. Health check não executa ferramenta do modelo nem consome cota por padrão; prontidão de provedor real é verificação separada.

**Validação planejada:** serviço ausente, porta incorreta, perfil inválido e storage sem acesso em instalação sintética; confirmar diagnóstico e códigos de saída. Não considerar `401` sem autenticação uma queda por si só.

<a id="dsh-038"></a>
### DSH-038 — Alertar falhas e controlar retenção de logs e disco

**Prioridade:** P2. **Esforço:** M. **Responsável:** OPS. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-004, DSH-037.

**Origem e escopo:** áreas 17/18/19; disponibilidade, backup, espaço e logs locais.

**Entrega:** limites definidos para indisponibilidade, backup atrasado/falho, armazenamento e crescimento de logs; deduplicação de alertas e canal/destinatário escolhido. Sessões não entram na rotação de logs comuns.

**Aceite:** falha sintética gera alerta e recuperação é reconhecida; entrega é observada no receptor autorizado, não só na fila local. Logs não crescem sem limite nem contêm segredos; a última cópia válida não é apagada pela retenção.

**Validação planejada:** indisponibilidade e backup falho isolados, alerta suprimido/repetido e falha do próprio canal. Sem autorização de envio externo, validar coletor local e registrar pendência de entrega externa.

<a id="dsh-039"></a>
### DSH-039 — Verificar privacidade e entrega da telemetria

**Prioridade:** P2. **Esforço:** M. **Responsável:** SEC/OPS/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-019, DSH-037.

**Origem e escopo:** área 18; [telemetria de sessão](../../packages/session/session-telemetry-otel/README.md) e [telemetria de produto](../../packages/host/product-telemetry-otel/README.md).

**Entrega:** inventário do que é coletado, gatilho de autorização, destino, redação, retenção e modo desativado; ensaio com coletor controlado. Não confundir emissão local com entrega confirmada.

**Aceite:** nenhum conteúdo de conversa sai por ativação automática indevida; modo desativado não constrói envio; feedback/consentimento e limites correspondem ao contrato. Fila cheia, timeout e shutdown têm resultado e perda possíveis documentados.

**Validação planejada:** payloads sintéticos capturados em coletor local, recusa sem autorização, disabled e falha de rede; verificar egress. Não enviar sessões reais como amostra nem afirmar apagamento remoto por um evento de retirada.

<a id="dsh-040"></a>
### DSH-040 — Entregar manuais operacionais de incidente e recuperação

**Prioridade:** P2. **Esforço:** M. **Responsável:** OPS/DOC. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-008, DSH-022, DSH-038.

**Origem e escopo:** áreas 17/18/19/20. Inicialização, instância errada, provedor indisponível, backup/restore, atualização, retorno e credencial comprometida.

**Entrega:** procedimentos curtos com pré-requisito, comando suportado, saída esperada, diagnóstico, limite e escalonamento. Um proprietário por fato; usar links para detalhes de pacote.

**Aceite:** outra pessoa consegue executar o procedimento em ambiente isolado e reconhecer sucesso/falha; retorno não pressupõe downgrade de dados. Comandos que dependem de credencial ou privilégio declaram isso sem incluí-los no texto.

**Validação planejada:** ensaio independente dos procedimentos com dados sintéticos, checagem de links e validação documental. Passos ainda não reproduzidos ficam marcados como não verificados, não como instrução garantida.

<a id="dsh-041"></a>
### DSH-041 — Revisar documentação semântica, navegação e contratos

**Prioridade:** P2. **Esforço:** M. **Responsável:** DOC/DEV. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-002, DSH-040.

**Origem e escopo:** área 20, M33/M34/M35 e E-REM documental. [Norma](../AGENTS.md), READMEs e páginas afetadas pelos lotes.

**Entrega:** revisar significado dos pares, contratos de configuração/erro e navegação de páginas extensas; corrigir apontadores obsoletos e notas ativas sem reescrever arquivos de notas arquivadas. Gerados são atualizados pelo owner.

**Aceite:** documentação descreve comportamento comprovado e cada fato tem lugar único; pareamento mecânico é acompanhado de revisão semântica. Auditorias em português permanecem em `docs/audits/`, sem ampliar a exceção de i18n.

**Validação planejada:** `pnpm run test:docs`, `pnpm run doc-sync`, lint pertinente e build do site quando páginas publicadas forem alteradas; revisar integralmente o diff e testar operações documentadas.

<a id="dsh-042"></a>
### DSH-042 — Preparar um candidato reproduzível e verificável

**Prioridade:** P1. **Esforço:** G. **Responsável:** TL/QA/OPS. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-008, DSH-015, DSH-016, DSH-017, DSH-021, DSH-023, DSH-025, DSH-026, DSH-027, DSH-028, DSH-029, DSH-031, DSH-034, DSH-035, DSH-038, DSH-039, DSH-041, DSH-043.

**Origem e escopo:** áreas 11/12/13/17, M11/M15. Candidato de código, artefato e configuração de implantação. Dependências fora do escopo de homologação escolhido exigem disposição documentada em DSH-001/002, nunca exclusão silenciosa.

**Entrega:** construir em checkout isolado do candidato, executar checks exigidos e smoke de instalação pelo perfil suportado; fixar artefato, lockfile, configuração e evidências. Incluir DSH-024/033/036 quando seus gatilhos integrarem o escopo.

**Aceite:** nenhuma alteração alheia é apagada para obter árvore limpa; evidências e artefatos identificam o candidato. Reprovações obrigatórias impedem homologação. Mudança posterior invalida os checks afetados. Este item prepara a release, não publica ou faz merge automaticamente.

**Validação planejada:** build, tipos, lint, docs, higiene, política, scanner, snapshots e smokes proporcionais; checks externos reais no candidato; passar a identidade final a DSH-018. Registrar qualquer execução ausente.

<a id="dsh-043"></a>
### DSH-043 — Revalidar regressões históricas de Settings, hooks e recursos

**Prioridade:** P2. **Esforço:** G. **Responsável:** DEV/QA. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-002, DSH-014, DSH-019.

**Origem e escopo:** E-M50/E-REM; especialmente Settings, hooks, instruções, presets, spill, jobs, PTY e protocolo. Cada subcaso mantém seu ID legado e aceite original.

**Entrega:** matriz de revalidação por owner: chaves JSON especiais, corrida de registro/watchers, Stop/`continue: false`, orçamento e raiz de instruções, gerações de preset, erro de infraestrutura, lease/fechamento e catálogos. Registrar resolvido com evidência, ainda reproduzível ou não aplicável.

**Aceite:** todos os IDs do [mapa legado](#legado) têm disposição verificável; verde agregado de outra área não encerra requisito específico. Falha reproduzida vira subentrega de correção no owner com `solutionType` e teste negativos adequados, sem iniciar refatoração de todo o subsistema.

**Validação planejada:** cenários do backlog proprietário, com relógio/barreiras determinísticos e recursos sintéticos; documentação e consumidores nas correções promovidas. O esforço G cobre a revalidação; correções adicionais são estimadas depois de diagnosticadas.

<a id="dsh-044"></a>
### DSH-044 — Reauditar e recalcular as 20 notas com evidência atual

**Prioridade:** P2. **Esforço:** G. **Responsável:** QA/revisor independente. **solutionType proposto:** `repository-automation`. **Dependências:** DSH-042, DSH-018.

**Origem e escopo:** E-AUD e todas as áreas. O revisor recebe critérios, candidato, ambiente e evidências, sem nota de aprovação predefinida.

**Entrega:** novo relatório com as mesmas 20 áreas e componentes I/F/P/O de até 25 pontos, média simples, confiança, riscos residuais e comparação com 73,5/100. Separar uso local, publicação e acesso remoto conforme escopo.

**Aceite:** cada mudança de nota tem prova nova; itens não executados ou condicionais são explícitos; um risco crítico não é neutralizado pela média. Todos os achados originais mantêm ID e histórico. Falta de acesso/revisor independente é registrada, não substituída por alegação de certificação.

**Validação planejada:** reproduzir amostra dos aceites, recalcular somas/média e verificar identidade e integridade dos artefatos. O relatório informa exatamente o que está apto, pendente ou fora do escopo.

<a id="legado"></a>
## Continuidade dos planejamentos anteriores

As tabelas preservam todos os 50 IDs M e os 37 IDs REM encontrados. São referências de escopo, não 87 novos defeitos. Os aceites detalhados continuam nos documentos proprietários; DSH-002 evita duplicação e DSH-043 revalida o que não possui evidência suficiente. Salvo observação expressa de E-AUD, o status corrente é **a revalidar**. Um checker verde do agregado não comprova individualmente cada requisito antigo.

### M01–M50

| ID | Assunto preservado do backlog proprietário | Entrega de destino e disposição |
|---|---|---|
| M01 | Segredos de proxy em comandos | DSH-023; revalidar ambiente, argumentos, saída e transporte autorizado. |
| M02 | Redação de Settings em esquemas complexos | DSH-023; testar tipos suportados e rejeição segura dos demais. |
| M03 | Chaves JSON especiais em Settings | DSH-043; preservar dados sem alterar protótipos. |
| M04 | Registro substituto de Settings e escrita antiga | DSH-043; provar storage/cache/observadores consistentes. |
| M05 | Continuação ilimitada por hook Stop | DSH-043; revalidar limite e continuação legítima nos conectores. |
| M06 | Semântica de `continue: false` | DSH-043; definir/validar parada, escopo e causa registrada. |
| M07 | Orçamento agregado de instruções | DSH-043; rejeitar excesso antes de leitura ilimitada e registrar omissão. |
| M08 | Migração de leitores históricos de Session | DSH-028, DSH-031; preservar o vínculo com AAA-022 sem retomar ação antiga automaticamente. |
| M09 | Medidor de dívida e caminhos atuais | DSH-030; E-AUD executou o medidor, mas o orçamento continuou reprovado. |
| M10 | Grafo de módulos gerado | DSH-041; revalidar no candidato e regenerar pelo owner quando necessário. |
| M11 | Candidato único e limpo | DSH-042; usar checkout isolado e identidade comum das evidências. |
| M12 | Atualização upstream | DSH-017; sincronização histórica aprovada não substitui ensaio futuro. |
| M13 | Plataformas e runtimes | DSH-018; resultado por plataforma declarada. |
| M14 | Provedores reais | DSH-026; teste anterior do OpenCode cobre somente sua execução específica. |
| M15 | Revisão independente final | DSH-044; evidências do candidato e veredito próprio. |
| M16 | Durabilidade de escrita atômica | DSH-005, DSH-028; distinguir flush lógico, fsync e falha física. |
| M17 | Descarte de watchers de Settings | DSH-027, DSH-043; nenhum callback depois do término. |
| M18 | Recuperação de gerações de presets | DSH-043; não liberar geração com consumidor vivo. |
| M19 | Raiz estável de instruções | DSH-043; mudança de marcador não reinterpreta escopos de sessão indevidamente. |
| M20 | Falha de infraestrutura em jobs de shell | DSH-027, DSH-043; causa distinguível, limpeza e cancelamento. |
| M21 | Hooks locais por Session | DSH-043; condicional a consumidor suportado. |
| M22 | Leitores obsoletos por owner | DSH-030, DSH-031; mesma frente de M08, sem segunda migração concorrente. |
| M23 | Supressões de lint | DSH-030, DSH-031; orçamento e necessidade por owner. |
| M24 | Usos de `any` | DSH-030, DSH-031; priorizar risco sem converter contagem textual em bugs. |
| M25 | Categoria correctness do lint | DSH-031; experimento condicionado a ganho e ruído medidos. |
| M26 | `skipLibCheck` mais estrito | DSH-031; experimentar por face antes de decidir globalmente. |
| M27 | `verbatimModuleSyntax` por face | DSH-031; medir impacto nos consumidores e build. |
| M28 | Skips com proprietário | DSH-029; razão, condição e gatilho de reativação. |
| M29 | Concorrência e descarte sob carga | DSH-027, DSH-032; investigar warnings e recursos com medição. |
| M30 | Exclusões de cobertura | DSH-029; corpus declarado e nenhum aumento oculto. |
| M31 | Desempenho de sessões longas | DSH-032, DSH-033; benchmark antes de otimizar. |
| M32 | Estado de envio de PTY | DSH-027, DSH-043; sucesso, erro, cancelamento e descarte. |
| M33 | Revisão semântica bilíngue | DSH-041; pareamento não comprova significado sozinho. |
| M34 | Navegação da documentação | DSH-040, DSH-041; entrada curta, detalhes no owner e links válidos. |
| M35 | Apontador do programa AAA | DSH-002, DSH-041; apontador reconciliado, não substituição de histórico. |
| M36 | Precisão do guia de proxy | DSH-023, DSH-041; documentação corresponde ao alcance real do segredo. |
| M37 | Parâmetro `title` de Workspace.create | DSH-036; remover somente se ausência de consumidor for comprovada. |
| M38 | Separador de caminho no seletor | DSH-034, DSH-043; diferenças de plataforma testadas. |
| M39 | Cabeçalhos de prévias | DSH-036; compartilhamento condicionado a semântica equivalente. |
| M40 | DisclosureRow no Bash | DSH-036; preservar comportamento visual/acessibilidade. |
| M41 | `namespace` em Settings | DSH-036; atualização conjunta de API, consumidores e docs se necessária. |
| M42 | Cache de identidade de pacote | DSH-007, DSH-036; invalidação somente para troca em processo suportada. |
| M43 | Serviço comum de watchers | DSH-036; extração exige consumidores e redução real de manutenção. |
| M44 | Campos por época do cache LLM | DSH-026, DSH-036; corrigir somente divergência demonstrada. |
| M45 | Causas estruturadas de erro pi-ai | DSH-026; depender da API efetivamente oferecida pela versão instalada. |
| M46 | Seleção da última resposta de subagente | DSH-032, DSH-033; otimização condicionada ao custo. |
| M47 | Replay de filhos concorrentes | DSH-027, DSH-028, DSH-043; reproduzir ambiguidade antes de mudar protocolo. |
| M48 | Catálogo ShellEnv | DSH-037, DSH-043; listar o que resolve sem divulgar segredos nem prometer exaustividade falsa. |
| M49 | Face Client no gerador de grafos | DSH-036, DSH-041; demonstrar aresta omitida antes de ampliar o programa. |
| M50 | Resultado de rede de Session direta/obsoleta | DSH-036, DSH-039; confirmar uso suportado antes de ampliar API. |

### REM-001–REM-037

O [backlog REM original](backlog-remediacao-2026-09-21.md) conserva impacto, pré-condições e aceites de cada entrada. Esta tabela não reduz sua prioridade histórica; a prioridade atual depende da revalidação da mesma ameaça e configuração.

| ID | Assunto preservado | Entrega de destino |
|---|---|---|
| REM-001 | Forks e runners persistentes | DSH-014, DSH-016 |
| REM-002 | Credenciais de proxy em subprocessos | DSH-023 |
| REM-003 | Sucesso falso do Plugin Manager | DSH-021, DSH-043 |
| REM-004 | Limpeza de spill local | DSH-027, DSH-043 |
| REM-005 | Tipagem e lint | DSH-011, DSH-042; agregados aprovados em E-AUD, aceites específicos a conferir. |
| REM-006 | Política de extensões dinâmicas | DSH-020, DSH-021 |
| REM-007 | Admissão agregada de memória HTTP | DSH-019, DSH-027 |
| REM-008 | Fechamento lógico/físico de WebSocket | DSH-027, DSH-034, DSH-043 |
| REM-009 | Pins de ações externas | DSH-016; verificador aprovado em E-AUD, manter no candidato. |
| REM-010 | Pins de imagens de build | DSH-016 |
| REM-011 | Grafo de domínios do Client | DSH-011, DSH-041 |
| REM-012 | Identidade de publicação | DSH-007, DSH-042 |
| REM-013 | Terminologia concreta | DSH-041 |
| REM-014 | Referências operacionais aceitas pelo gate | DSH-002, DSH-041 |
| REM-015 | Pré-requisitos do README raiz | DSH-040, DSH-041 |
| REM-016 | Estabilidade da suíte sob carga | DSH-027 |
| REM-017 | Exports e conteúdo de tarballs | DSH-011, DSH-042 |
| REM-018 | Grafo de módulos | DSH-041 |
| REM-019 | Idade mínima de releases | DSH-016 |
| REM-020 | Testes negativos do gerador Cordis | DSH-029, DSH-043 |
| REM-021 | E2E de busca DeepSeek | DSH-026; executar apenas com ambiente e autorização aplicáveis. |
| REM-022 | Windows no veredito da plataforma | DSH-018 |
| REM-023 | Afirmação de cobertura fiel ao corpus | DSH-029 |
| REM-024 | Gate de vulnerabilidades | DSH-009, DSH-010, DSH-016; gate já executou e reprovou em E-AUD. |
| REM-025 | SBOM e attestations | DSH-016, DSH-042 |
| REM-026 | Timeouts de workflows | DSH-016 |
| REM-027 | Base reproduzível | DSH-001, DSH-002, DSH-042 |
| REM-028 | Leitores síncronos de Session | DSH-028, DSH-031 |
| REM-029 | Estrutura documental por público | DSH-041 |
| REM-030 | Contratos dos três READMEs públicos | DSH-041 |
| REM-031 | Ordem de seções de README | DSH-041 |
| REM-032 | Exceção de i18n das auditorias | DSH-041; exceção existente localizada, não ampliar seu alcance. |
| REM-033 | Orçamento documental e manifesto | DSH-041 |
| REM-034 | Títulos de notas ativas | DSH-041 |
| REM-035 | Dívida por owner | DSH-030, DSH-031 |
| REM-036 | Resíduo de planejamento em notas ativas | DSH-041 |
| REM-037 | Comentário de módulo do client store | DSH-041 |

<a id="verificacao"></a>
## Verificações e registro de entrega

Selecionar checks pelo [procedimento pre-push](../../.agents/skills/dsh-pre-push-checks/SKILL.md), pela [política de testes](../testing.md) e pelo diff completo do lote. A tabela é um mapa de comandos existentes ou procedimentos a selecionar; não é registro de execução desta documentação e não manda rodar toda a suíte a cada alteração.

| Trabalho | Verificação planejada |
|---|---|
| Dependências | `pnpm audit --json`; `pnpm audit --prod --json`; `pnpm run verify-dependency-audit`; consumidores afetados. |
| Manifestos/publicação | `pnpm run constraints`; `pnpm run hygiene`; build e smoke de consumo do artefato. |
| Tipos e lint | `pnpm run typecheck`; `pnpm run lint:contracts-ready` após pré-requisitos, ou `pnpm run lint` quando eles ainda forem necessários. |
| Compactação | Replay exato indicado em DSH-012 e testes de compactação; avaliação semântica separada em DSH-025. |
| Provedores | `pnpm exec vitest run packages/llm/llm-pi-ai/tests`; perfil real delimitado para as rotas usadas. |
| Persistência compilada | `pnpm run test:e2e packages/session/session-persistence-jsonl/tests/built-migration-worker.e2e.ts packages/session/session-persistence-jsonl/tests/lease.two-process.e2e.ts`; exigir que os dois executem. |
| Interface | `pnpm run test:web:built apps/web/tests/default-model.e2e.ts apps/web/tests/onboarding-usable-provider.e2e.ts` após build, mais jornadas dos owners alterados. |
| Política e manutenção | `node scripts/verify-customization-policy.mjs --base master`; `pnpm run audit:metrics`; corpus e base explicitados. |
| Documentação | `pnpm run test:docs`; `pnpm run doc-sync`; revisão semântica/links; `git diff --check`. |
| Backup, serviço e alertas | Procedimentos de DSH-005/008/038 em ambiente isolado com RPO/RTO e receptor observados. |
| Desempenho | Cenários de `benchmarks/` selecionados após DSH-032 definir carga e critério; ambiente compilado e recursos próprios. |

### Registro mínimo para promover e encerrar

| Campo | Conteúdo requerido |
|---|---|
| Identidade | ID DSH, IDs DSH-AUD/M/REM relacionados e tarefa operacional proprietária. |
| Escopo | Revisão/base, diferenças locais, paths, `solutionType` confirmado e owner da política. |
| Disposição | Proposto, em execução, bloqueado por condição concreta, verificado, adiado ou não aplicável; mapear aos estados existentes do programa sem criar enum paralelo. |
| Evidência | Comando/procedimento exato, ambiente, horário, retorno, log sanitizado e hash; resultado observado e limitações. |
| Aceite | Critérios atendidos/pendentes e controle negativo pertinente; revisor quando necessário. |
| Operação | Implantação ou publicação realmente realizada, ou pendente; mecanismo de retorno e risco residual. |
| Continuidade | Próxima ação por ID, dependências liberadas e gatilho de reauditoria. |

## Dev Note

As escolhas de ferramentas de backup, destino, isolamento, transporte remoto, capacidade de CI, limites de desempenho e escopo de release permanecem propostas até decisão e ensaio. Os 44 IDs organizam o planejamento; não substituem o histórico do programa nem permitem elevar notas pela criação de documentação.
