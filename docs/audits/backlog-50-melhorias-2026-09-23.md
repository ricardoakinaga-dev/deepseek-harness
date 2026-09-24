# Backlog de implementação das cinquenta melhorias — 2026-09-23

Este documento especifica o aceite de M01–M50 da [lista de melhorias](melhorias-50-2026-09-23.md). Ele não contém status vivo: a ação ativa, o responsável, as tentativas e o próximo passo permanecem no [backlog canônico](../../.agent/backlog.json), no [estado](../../.agent/state.json), no [ExecPlan](../../.agent/plans/deepseek-harness-aaa.md) e nos ledgers. O [plano executivo](plano-executivo-50-melhorias-2026-09-23.md) rege a execução.

## Resumo

Cada ID tem resultado verificável, pré-condição ou dependência, falha que deve ser rejeitada e documentação proprietária. M08 e M22 sobrepõem o trabalho ativo AAA-022; M11–M14 entram na qualificação AAA-023; M15 corresponde à auditoria AAA-024. O agente reutiliza essas identidades operacionais e liga os demais IDs sem abrir um programa paralelo.

## Regras comuns de aceite

1. Antes de editar, localizar o proprietário no código, consumidores, configuração, testes, README, página de subsistema e Agent Note atual; escolher um solutionType pela [política de melhoria](../customization/improvement-development-standard.md) e registrá-lo na política do fork quando a mudança for promovida.
2. Entregar implementação, documentação proprietária, pares bilíngues e artefatos gerados na mesma mudança. Um resultado model-visible exige log e snapshot pertinentes; uma mudança de Session exige tipos, histórico e SDKs pertinentes.
3. Cada proteção nova rejeita um caso inválido observado; lifecycle cobre sucesso, falha, cancelamento e descarte conforme risco. Checks são selecionados pelo procedimento pre-push e somente resultados executados podem fechar o item.
4. Um item condicional encerra como NÃO APLICÁVEL somente com evidência de que sua pré-condição não existe ou que a medição não justifica a mudança, incluindo gatilho de reabertura. Isso atende o ID sem criar comportamento especulativo.
5. Ao fechar cada item, registrar o ID seguinte e uma ação verificável no backlog canônico, manter o ExecPlan e o estado coerentes e informar ao usuário resultado, documentação, checks, risco residual e próxima etapa.

## Alta prioridade — M01 a M15

### M01 — Isolar credenciais de proxy de comandos do modelo

- Base: [guia de proxy](../user/guide/network-proxy.md) e subprocess/scrubbedParentEnv confirmam que URL autenticada chega ao shell escrito pelo modelo; relacionar com AUD-002 e REM-002.
- Execução: decidir o transporte de proxy autenticado e impedir que ambiente, argumentos, erros e saída observável do processo model-authored contenham usuário, senha ou URL autenticada, preservando roteamento autorizado.
- Aceite: comandos Bash, PowerShell, PTY e subprocessos relevantes não conseguem ler a credencial; proxy autenticado funciona pelo mecanismo escolhido; nenhum diagnóstico contém o segredo.
- Evidência e docs: exercitar casos com segredo sentinela e captura de ambiente/logs; atualizar READMEs de proxy, subprocess e shell, guia de rede e pares bilíngues.

### M02 — Redação segura em esquemas complexos de Settings

- Base: [redact.ts](../../packages/settings/settings/src/redact.ts) retorna o valor original para tipos de esquema não percorridos.
- Execução: definir suporte ou rejeição explícita para união, interseção e transformação que possam conter campos secretos; impedir retorno do valor sem inspeção.
- Aceite: cada esquema suportado remove o segredo; cada esquema não suportado falha antes de publicar o valor; o caso inválido não devolve o segredo pelo fio.
- Evidência e docs: testes de esquema e Remote, revisão da página de Settings e do README proprietário com o limite real.

### M03 — Chaves JSON especiais em Settings

- Base: [cópia de Settings](../../packages/settings/settings/src/index.ts) atribui propriedades a objeto comum e registra perda de chaves como __proto__.
- Execução: construir objetos de dados com propriedades próprias seguras tanto na cópia quanto em mergeLayers, mantendo semântica JSON.
- Aceite: __proto__, constructor e outras chaves válidas sobrevivem à gravação/leitura sem alterar protótipos nem outras propriedades.
- Evidência e docs: casos negativos no parser e na persistência; atualizar README/JSDoc se a representação pública mudar.

### M04 — Ressincronização após troca de registro de Settings

- Base: [commit de Settings](../../packages/settings/settings/src/index.ts) pode persistir uma escrita do registro anterior enquanto o substituto mantém cache antigo.
- Execução: após persistência, resolver novamente o registro que é proprietário atual do namespace e publicar sua revisão na ordem correta.
- Aceite: uma gravação antiga que termina depois da substituição deixa storage, cache e observadores concordantes; cancelamento ou descarte não notifica o registro retirado.
- Evidência e docs: teste de interleaving controlado e contrato de timing no README e JSDoc.

### M05 — Limite de continuações por hook Stop

- Base: [hooks-codex](../../packages/hooks/hooks-codex/src/index.ts) e hooks-claude-code registram que um bloqueio incondicional pode continuar indefinidamente.
- Execução: definir orçamento configurável ou mecanismo de loop guard que reconheça a continuação causada pelo Stop e finalize com causa observável.
- Aceite: hook que sempre bloqueia termina no limite sem novo ciclo infinito; hook que libera permite parada normal; o limite não elimina uma continuação legítima antes de sua cota.
- Evidência e docs: testes de turnos e snapshots model-visible quando aplicável; atualizar READMEs dos dois conectores e semântica de Stop.

### M06 — Resultado continue: false de hooks

- Base: os dois [conectores de hooks](../../packages/hooks/hooks-codex/src/index.ts) registram o resultado stop sem mecanismo de parada de execução.
- Execução: decidir o significado por ponto de hook, mapear o resultado a uma parada de run/turn suportada e registrar o fato durável necessário.
- Aceite: continue: false interrompe apenas o escopo declarado; o log e a resposta do chamador mostram a causa; outputs que não pedem parada continuam funcionando.
- Evidência e docs: testes por dialeto e pontos de hook afetados, snapshots da saída e atualização dos dois READMEs.

### M07 — Orçamento agregado de leitura de instruções

- Base: [files.ts](../../packages/context/agent-instructions/src/files.ts) limita cada arquivo, mas lê todos antes do limite de renderização.
- Execução: validar e aplicar orçamento agregado por lote de baseline ou reconciliação, inclusive com muitos arquivos pequenos e stream remoto.
- Aceite: o lote para ou rejeita antes de ultrapassar o limite configurado; cancelamento libera streams; a decisão de omissão é observável e não cria entrada model-visible sem log.
- Evidência e docs: testes com múltiplos arquivos sob tamanho individual, configuração e README/página de instruções atualizados.

### M08 — Migração completa dos leitores históricos de Session

- Base: AAA-022 está em andamento na ação A16; leitores restantes exigem decisão de ownership, corte e cancelamento.
- Execução: completar as ondas aprovadas sem leitor síncrono novo, atualizar cada consumidor, preservar exceções de compatibilidade explicitamente mantidas e preparar o sucessor de candidato.
- Aceite: cada chamada migrada lê prefixo correto em criação, retomada e fork; erro, cancelamento e veto mantêm a ordem; a contagem canônica diminui sem violar formatos lançados.
- Evidência e docs: testes dos pacotes proprietários, snapshots Session/modelo, saídas das duas SDKs quando afetadas, catálogo e páginas de Session/README pareados.
- Dependência: concluir AAA-022:A16 antes da implementação dependente; M22 é a medição por proprietário desta mesma frente, não uma migração concorrente.

### M09 — Medidor canônico de dívida na árvore atual

- Base: audit:metrics em 2026-09-23 falhou ao abrir o caminho antigo de ContextMeter.tsx, ausente na árvore em edição.
- Execução: representar o movimento de arquivo e os novos caminhos na árvore candidata completa; manter o corpus e a política de medição explícitos.
- Aceite: audit:metrics lê todos os caminhos selecionados e passa sem ignorar arquivo ausente indevidamente; um arquivo rastreado ausente por erro ainda provoca falha.
- Evidência e docs: executar o verificador na árvore candidata, registrar digest do corpus e atualizar a documentação do medidor somente se sua semântica mudar.

### M10 — Grafo de módulos gerado

- Base: verify-module-graph em 2026-09-23 apontou os dois Markdown e o registro de pareamento como desatualizados.
- Execução: concluir primeiro os imports de M08 e regenerar o grafo pelo gerador proprietário; revisar a contraparte chinesa antes de confirmar o par.
- Aceite: verify-module-graph, pairing e links passam; o grafo representa os imports reais da árvore qualificada.
- Evidência e docs: registrar comando do gerador e checks; não editar manualmente o catálogo gerado.
- Dependência: M08 ou outra mudança de imports que altere o grafo deve estar estável.

### M11 — Candidato único e limpo

- Base: o [candidato A28](../../.agent/evidence/AAA-023/candidate-identity-a68.json) está limpo, mas não inclui todas as alterações atuais.
- Execução: formar sucessor imutável com melhorias aplicáveis, política do fork atribuída e árvore limpa; registrar commit, tree, versão de ferramentas e índice de evidência.
- Aceite: mesma identidade é usada nos checks locais, artefatos empacotados e sinais externos; alteração posterior invalida apenas evidência afetada e gera novo candidato.
- Evidência e docs: seguir AAA-023 e sua barra de qualidade, incluindo cobertura, snapshots, build oficial, consumer install, benchmarks e documentação do candidato.
- Dependência: R1–R6 aplicáveis concluídos e M12 preparado.

### M12 — Atualização em relação ao upstream

- Base: a [simulação anterior](../../.agent/evidence/AAA-023/upstream-rehearsal-a64.json) encontrou 233 conflitos e terminou com abort limpo.
- Execução: classificar cada conflito por proprietário, resolver em trabalho descartável ou sucessor autorizado e manter a separação de master oficial e custom/main.
- Aceite: a atualização oficial de referência é reproduzível sem conflito pendente, perda de mudanças ou caminho sem ownership; checks afetados passam no resultado integrado.
- Evidência e docs: registrar refs exatas, mapa de conflitos, decisões, verificador de política e procedimento de recuperação no ExecPlan e na documentação de customização quando seu contrato mudar.
- Dependência: ensaio inicial em R0; integração final após mudanças aplicáveis e antes de M11 definitivo.

### M13 — Plataformas e versões suportadas

- Base: a [evidência externa](../../.agent/evidence/AAA-023/external-lane-status-a72.json) não cobre Windows, macOS, ARM64 ou a matriz hospedada de Node para o candidato.
- Execução: acionar os jobs proprietários disponíveis e relacionar cada resultado ao commit de M11, sem usar Wine ou host substituto como prova de outra plataforma.
- Aceite: gates obrigatórios passam em cada plataforma e versão exigida, ou o bloqueio externo fica explícito e impede qualificação final.
- Evidência e docs: guardar job, ambiente, artefato, SHA, resultado e limitação na matriz AAA-023; atualizar documentação de suporte se o comportamento real divergir.
- Dependência: M11.

### M14 — Provedores reais

- Base: a matriz keyless não comprova chamadas com DeepSeek ou provedores opcionais cujo segredo está ausente neste host.
- Execução: executar cenários com credenciais em ambiente autorizado, incluindo chamada, ferramenta, cancelamento e falha pertinente ao provedor.
- Aceite: cada provedor exigido demonstra request/response real no commit M11; logs e artefatos não contêm o segredo; skip é registrado como ausência de evidência.
- Evidência e docs: vincular CI ou E2E do provedor ao SHA e atualizar README/guia somente para comportamento observado.
- Dependência: M01 quando o cenário usa proxy autenticado; M11 e ambiente com credenciais.

### M15 — Auditoria independente final

- Base: AAA-024 está TODO e a qualificação de AAA-023 permanece parcial.
- Execução: entregar candidato selado, barra congelada e índice de evidência a crítico independente; registrar achados sem alterar o candidato durante a revisão.
- Aceite: cada requisito obrigatório recebe evidência atual, nenhum risco alto sem disposição autorizada permanece, o fingerprint do candidato não muda e a atestação documental nomeia commit e digest do índice.
- Evidência e docs: relatório datado de reauditoria, vínculo com M01–M50 e notas recalculadas; qualquer reparo abre novo candidato e nova revisão.
- Dependência: M11–M14 e todos os itens aplicáveis fechados.

## Média prioridade — M16 a M35

### M16 — Durabilidade de gravação atômica

- Base: [atomic-write](../../packages/util/atomic-write/src/index.ts) declara que fsync está fora do comportamento atual.
- Execução: medir o requisito de durabilidade de Settings e escolher escrita com sincronização de arquivo e diretório ou registrar o limite como aceito pelo proprietário.
- Aceite: se adotado, uma gravação confirmada mantém permissões e sobrevive ao cenário de interrupção suportado; falhas de fsync não retornam sucesso.
- Evidência e docs: testes de falha, Windows e README/JSDoc da utilidade e dos consumidores; não prometer resistência a crash sem execução adequada.

### M17 — Quiescência dos watchers de Settings

- Base: [Settings.register](../../packages/settings/settings/src/index.ts) não aguarda a cauda de callbacks no descarte.
- Execução: desativar watchers e aguardar callbacks iniciados antes de remover o registro, com tratamento explícito de erro e cancelamento.
- Aceite: nenhuma callback de registro retirado roda após seu descarte confirmado; troca de registro e gravação concorrentes não vazam notificação.
- Evidência e docs: testes de corrida/teardown e README/JSDoc do lifecycle.
- Dependência: coordenar com M04 para usar um único modelo de ownership.

### M18 — Recuperar gerações de presets

- Base: [agent-presets](../../packages/preset/agent-presets/src/index.ts) retém gerações substituídas enquanto agentes antigos podem usá-las.
- Execução: contar agentes associados por geração e descartar a antiga quando o último escopo termina, sem encerrar agentes vivos.
- Aceite: edições repetidas não acumulam watchers ou fibras inativas; agentes ainda associados preservam a composição até terminar.
- Evidência e docs: teste de duas gerações, corrida de join/dispose e README de presets.

### M19 — Raiz estável das instruções do projeto

- Base: [reconciliação de instruções](../../packages/context/agent-instructions/src/state.ts) pode redescobrir a raiz depois de edições em marcadores.
- Execução: armazenar a raiz escolhida para a vida do loop/Session segundo o contrato do proprietário.
- Aceite: uma edição de marcador não reinterpreta escopos relativos já registrados; nova Session pode escolher raiz nova.
- Evidência e docs: teste de mudança de marcador, log model-visible quando houver contexto alterado e README do pacote.

### M20 — Falha de infraestrutura em jobs de shell

- Base: [background Bash](../../packages/shell/tool-bash/src/background.ts) e seu par PowerShell equiparam algumas falhas de spawn/runner a kill ou saída comum.
- Execução: acrescentar resultado estruturado de falha de infraestrutura ao processo e projetá-lo como job failed, preservando saída não zero de comando como completed.
- Aceite: spawn recusado, runner quebrado, kill e exit não zero produzem quatro resultados distintos em ambos os shells.
- Evidência e docs: testes dos dois providers, snapshots da apresentação do tool/job e READMEs de shell/jobs.

### M21 — Hooks locais por Session

- Base: [hooks-codex](../../packages/hooks/hooks-codex/src/index.ts) e hooks-claude-code registram descoberta local por Session como trabalho pendente.
- Execução: confirmar a regra de confiança e escopo do projeto, depois implementar descoberta por Session se o produto a exigir.
- Aceite: hook de um projeto não aparece em Session de outro; mudança durante a Session segue a política definida; configuração malformada falha no ponto documentado.
- Evidência e docs: casos de dois projetos, cancelamento e READMEs de ambos os conectores; se não houver requisito, registrar não aplicabilidade.

### M22 — Leitores obsoletos por proprietário

- Base: [métrica canônica](../../scripts/audit-metrics.ts) registra leitores deprecated e AAA-022 mantém ondas por pacote.
- Execução: atribuir cada exceção restante a um proprietário, migrar o consumidor ao leitor assíncrono/projeção adequado e não criar wrapper síncrono novo.
- Aceite: a contagem diminui por onda; exceções retidas têm motivo e condição de remoção; comportamento de fork, resume e histórico completo permanece.
- Evidência e docs: métrica no candidato, testes proprietários e documentação de Session; executar como parte de M08/AAA-022, sem duplicar implementação.

### M23 — Supressões de lint

- Base: a métrica canônica conta supressões e o programa AAA-022 mantém orçamento não crescente.
- Execução: priorizar exceções ligadas a limites de confiança, async e tipos persistidos; remover a necessidade ou justificar localmente cada retenção.
- Aceite: contagem por pacote cai sem desabilitar regra global e sem perder caso inválido antes rejeitado.
- Evidência e docs: lint focado, métrica canônica e README/JSDoc quando o contrato alterado for público.

### M24 — Usos explícitos de any

- Base: o candidato registrou mais de mil usos explícitos de any no corpus canônico.
- Execução: selecionar fronteiras de wire, processo e persistência e substituir any por tipos ou validação na entrada externa; não validar de novo valores tipados do mesmo processo.
- Aceite: redução mensurável por pacote e typecheck dos consumidores, sem converter erro real em cast opaco.
- Evidência e docs: métrica, typecheck, caso externo inválido e declaração pública atualizada quando necessário.

### M25 — Categoria correctness do lint

- Base: [.oxlintrc.json](../../.oxlintrc.json) mantém a categoria desativada.
- Execução: executar diagnóstico em fatias, classificar falsos positivos e correções reais, e propor adoção somente com autoridade da política vigente.
- Aceite: decisão registra custo, regras específicas e corpus; qualquer regra ativada rejeita caso inválido sem supressão global.
- Evidência e docs: resultados comparativos, fixtures do verificador e guia de contribuição se o padrão mudar.

### M26 — skipLibCheck mais estrito

- Base: [tsconfig.base.json](../../tsconfig.base.json) usa skipLibCheck.
- Execução: experimentar false no consumidor de artefato e nas faces Host/Client, classificar erros de dependência e custo antes de mudar o padrão.
- Aceite: ou o check proposto passa nos artefatos e fica mantido, ou a limitação e critério de reabertura ficam registrados sem alterar o default.
- Evidência e docs: comandos e tempos reais, erros atribuídos e guia de desenvolvimento se houver mudança.

### M27 — verbatimModuleSyntax por face

- Base: [tsconfig.base.json](../../tsconfig.base.json) mantém verbatimModuleSyntax desativado.
- Execução: testar Host e Client separadamente, corrigir imports de tipo onde necessário e conferir source launch e NodeNext.
- Aceite: cada face afetada compila e o bundle preserva os exports públicos; mudança global exige decisão explícita.
- Evidência e docs: typecheck, build, consumer smoke e guia de desenvolvimento se o contrato de imports mudar.

### M28 — Testes ignorados com responsável

- Base: o corpus contém skips condicionados por plataforma, artefato e credencial; a métrica canônica conta um subconjunto selecionado.
- Execução: classificar cada skip incondicional e cada condição que possa ficar sempre falsa, associar job proprietário e remover os obsoletos.
- Aceite: caso suportado executa no job dono; ausência de pré-requisito informa motivo observável; nenhum skip é contado como aprovação do comportamento.
- Evidência e docs: inventário com fonte e job, execução no ambiente disponível e política de testes atualizada se necessário.

### M29 — Concorrência e descarte sob carga

- Base: a [política de testes](../testing.md) alerta que suites isoladas podem passar enquanto processos, portas ou listeners vazam sob concorrência.
- Execução: escolher os cenários de Session, Settings, hooks, subprocesso e Web com recursos compartilhados e repetir em concorrência controlada.
- Aceite: o mesmo cenário falha por defeito real e passa repetidamente após correção; teardown deixa portas, diretórios e listeners sem dono residual.
- Evidência e docs: seed, concorrência, resultados e limite da amostra; aplicar o guia de confiabilidade de CI.

### M30 — Exclusões da cobertura

- Base: o [gate de cobertura](../testing.md) mede por arquivo no corpus declarado com exceções de plataforma e artefato.
- Execução: inventariar exclusões, dono, motivo e sinal alternativo, incluindo os arquivos pulados por falta de Pwsh ou build.
- Aceite: relatório explicita corpus e exceções; uma exclusão sem dono falha ou é removida; percentual não é apresentado como cobertura de código fora do corpus.
- Evidência e docs: configuração Vitest, gate de cobertura e política de testes coerentes.

### M31 — Desempenho de Sessions longas

- Base: o Harness mantém benchmarks, mas a proposta precisa de carga representativa antes de alteração.
- Execução: medir latência de turnos, memória e custo de projeções em logs longos, sessões retomadas e chamadas numerosas de ferramenta.
- Aceite: regressão reproduzível ou ausência de gargalo registrada; qualquer otimização preserva eventos e saída model-visible e melhora métrica definida.
- Evidência e docs: benchmark determinístico, perfil e documentação de desempenho; nenhuma alteração de comportamento só por hipótese.

### M32 — Estado de envio da PTY

- Base: [terminal-bash](../../packages/terminal/terminal-bash/src/session.ts) mantém vários campos paralelos de envio, timeout e polling.
- Execução: desenhar um proprietário para cada operação de envio e consolidar flags cuja relação é sempre a mesma.
- Aceite: prompt, sinal tardio, abort, timeout, erro e fechamento mantêm a saída prevista; nenhum timer ou promessa fica ativo depois do término.
- Evidência e docs: testes de interleaving e README/JSDoc da sessão terminal.

### M33 — Revisão semântica bilíngue

- Base: o [contrato de tradução](../i18n/README.md) diz que hashes e estrutura não demonstram equivalência de significado.
- Execução: amostrar páginas de maior risco, incluindo segurança, Session, lançamento e release; revisar atores, condições, negações e links contra o comportamento atual.
- Aceite: divergência encontrada é corrigida no par e regravada, ou a amostra registra concordância e escopo; alterações no texto não mudam código sem decisão.
- Evidência e docs: lista de pares, critérios e verificador de pairing após cada correção.

### M34 — Caminhos de entrada da documentação

- Base: o [padrão documental](../AGENTS.md) exige escopo proprietário e navegação por camadas; páginas extensas elevam custo de busca.
- Execução: medir entrada, seção maior e fatos duplicados nas páginas de subsistema mais usadas; mover detalhe ao proprietário e deixar links úteis.
- Aceite: leitor encontra a tarefa ou contrato em três a cinco páginas ligadas, links passam e informação normativa não é duplicada.
- Evidência e docs: amostra antes/depois, links, orçamento e pairing; não cortar falhas ou limitações para reduzir palavras.

### M35 — Apontador do programa AAA

- Base: a [página do programa](../customization/aaa-quality-program.md) ainda nomeia AAA-008:A02 como ação atual enquanto o estado canônico aponta AAA-022:A16.
- Execução: remover o apontador datado ou substituí-lo por vínculo direto à fonte operacional, mantendo a página como charter e roteiro.
- Aceite: a página não declara status mutável divergente; links resolvem e seu par chinês diz a mesma coisa.
- Evidência e docs: diff do par, pairing e verificador de links.

## Baixa prioridade — M36 a M50

### M36 — Precisão do guia de proxy

- Base: o [guia](../user/guide/network-proxy.md) afirma que a senha não aparece em lugar algum e depois explica que um comando pode imprimi-la.
- Execução: restringir a promessa ao diagnóstico controlado pelo Harness e descrever a exposição de ambiente de forma consistente.
- Aceite: as duas passagens concordam e o par chinês preserva a mesma condição; não afirmar proteção inexistente.
- Evidência e docs: revisão do par e pairing; coordenar com M01 quando seu comportamento mudar.

### M37 — Parâmetro title de Workspace.create

- Base: [Workspace.create](../../packages/workspace/workspace/src/index.ts) registra ausência de consumidor de produção para title.
- Execução: confirmar chamadas e remover parâmetro, documentação e testes exclusivos se a API não for exigida por consumidor publicado.
- Aceite: todos os consumidores compilam, a criação mantém título padrão e nenhum caminho público continua prometendo o parâmetro.
- Evidência e docs: busca de chamadas, typecheck de consumidores e README/JSDoc pareados.

### M38 — Separador de caminho no seletor

- Base: [DirectoryBrowser](../../packages/client/ui-directory-picker-browse/src/client/DirectoryBrowser.tsx) infere plataforma a partir do caminho home e registra caso POSIX com barra invertida.
- Execução: acrescentar separador explícito à listagem emitida pelo Host e consumir o campo no Client.
- Aceite: home POSIX contendo barra invertida e caminhos Windows usam separador correto; seleção e navegação continuam.
- Evidência e docs: teste Host/Client, apresentação da UI e README do seletor; GIF do fluxo real se a mudança for visível.

### M39 — Cabeçalho compartilhado de prévias

- Base: CSS de prévia de arquivos e documentos mantém cabeçalhos copiados para parecer uma única família.
- Execução: depois de estabilizar os contratos de artifact e slot, mover estrutura e estilo comum ao proprietário visual compartilhado.
- Aceite: os dois painéis mantêm medidas, foco, contraste e controles; o código compartilhado substitui as cópias.
- Evidência e docs: inspeção visual responsiva, captura/GIF se o produto mudar e README do componente.

### M40 — DisclosureRow na ferramenta Bash

- Base: [bash-sample.module.css](../../packages/client/ui-tool/src/client/tool/toolviews/bash-sample.module.css) registra estrutura e regra de ícone duplicadas.
- Execução: usar DisclosureRow com propriedades locais necessárias e apagar estrutura repetida.
- Aceite: abrir/fechar, estado, foco, ícone e leitura por tecnologia assistiva permanecem; regra duplicada some.
- Evidência e docs: inspeção do componente real, cobertura de interação necessária e README UI se o contrato público mudar.

### M41 — Nome namespace em Settings

- Base: [Settings](../../packages/settings/settings/src/index.ts) usa ns em API e implementação e registra possível renomeação.
- Execução: mapear consumidores e trocar nome apenas em uma alteração completa e compatível com a política de API pré-estável.
- Aceite: todos os consumidores compõem e nenhuma mensagem de erro conserva terminologia ambígua.
- Evidência e docs: busca de consumidores, typecheck e README/JSDoc.

### M42 — Cache de identidade de pacote

- Base: [plugin-package-inventory-deepseek](../../packages/llm/plugin-package-inventory-deepseek/src/index.ts) mantém cache por processo e só exigiria invalidação em upgrade em processo.
- Execução: confirmar se substituição de versão sem reinício é suportada; se sim, invalidar por identidade de instalação; se não, encerrar como não aplicável.
- Aceite: após troca suportada, o inventário retorna nova versão; sem suporte, a documentação não promete atualização em processo.
- Evidência e docs: teste de HMR/upgrade quando aplicável e README da capacidade.

### M43 — Serviço de observação de arquivos

- Base: [skill-filesystem](../../packages/skill/skill-filesystem/src/index.ts) concentra Chokidar e observação de raízes ausentes.
- Execução: medir consumidores adicionais e código líquido que uma extração removeria; criar serviço somente se houver ownership independente.
- Aceite: watchers continuam reagindo a ausência, criação, substituição e descarte; a extração elimina duplicação real ou é rejeitada por não aplicabilidade.
- Evidência e docs: mapa de consumidores, testes de lifecycle e README da nova capacidade se criada.

### M44 — Campos por época do cache LLM

- Base: [call-config](../../packages/llm/llm/src/call-config.ts) registra dúvida sobre campos estáveis por época.
- Execução: comparar cada campo com o cabeçalho durável e o comportamento de cache dos provedores; alterar somente divergência demonstrada.
- Aceite: troca de modelo, esforço ou opção que altera request inicia a época correta; opção invariável não perde cache sem motivo.
- Evidência e docs: teste de request/header e snapshot model-visible quando mudar, README dos adaptadores.

### M45 — Causa de erro pi-ai

- Base: [stream.ts](../../packages/llm/llm-pi-ai/src/stream.ts) registra que a dependência achata Error e obriga classificação por texto.
- Execução: verificar versão mantida e possibilidade de receber código/cause; adotar classificação estruturada se a API a fornecer.
- Aceite: falha de autenticação, limite e transporte mantém causa acionável sem depender de frase variável; se API não oferecer os dados, registrar condição de reabertura.
- Evidência e docs: testes com erros reais/estruturados e README do adaptador.

### M46 — Última resposta do subagente

- Base: [assistant-output](../../packages/subagent/subagent/src/assistant-output.ts) percorre todo o sufixo em cada settlement.
- Execução: medir custo em épocas continuáveis longas; se relevante, buscar de trás para frente preservando fallback por deltas.
- Aceite: saída final idêntica em mensagens, deltas e tentativas vazias, com melhora medida; sem custo relevante, não alterar.
- Evidência e docs: benchmark, testes de projeção e README se a semântica pública mudar.

### M47 — Ordem de replay de filhos concorrentes

- Base: [llm-replay](../../packages/test-support/llm-replay/src/index.ts) ordena por criação e ID, o que pode não refletir a primeira chamada concorrente.
- Execução: introduzir ordinal de primeira chamada se um snapshot com filhos simultâneos demonstrar ambiguidade.
- Aceite: replay reproduz a ordem gravada independentemente de empate de timestamp; fixtures antigas continuam decodificáveis ou seguem migração explícita.
- Evidência e docs: fixture concorrente e política de snapshots; ausência de caso real encerra como não aplicável.

### M48 — Catálogo ShellEnv completo

- Base: [ShellEnv.list](../../packages/shell/shell-env/src/index.ts) enumera apenas contribuições de plugins e avisa que built-ins não estão incluídos.
- Execução: acrescentar built-ins registrados antes que diagnóstico ou UI trate a lista como exaustiva, ou manter o nome/contrato parcial.
- Aceite: cada variável anunciada resolve; nenhuma variável nativa suportada falta em catálogo declarado completo.
- Evidência e docs: teste de registro, README e apresentação do catálogo quando houver consumidor.

### M49 — Face Client no gerador de grafos

- Base: [gen-doc-graphs](../../scripts/gen-doc-graphs.ts) registra que seu programa é iniciado somente pelo agregado Host.
- Execução: demonstrar arestas Client omitidas antes de ampliar o programa; incluir a face com ownership de compiler config quando necessário.
- Aceite: grafo novo inclui arestas verificadas sem duplicar entradas Host e o freshness check rejeita mudança de import Client.
- Evidência e docs: fixture negativa, regeneração de grafos e par chinês; sem omissão relevante, encerrar como não aplicável.

### M50 — Resultado de rede para Session direta ou obsoleta

- Base: [session-log-deepseek](../../packages/session/session-log-deepseek/src/index.ts) retorna ausência sem resultado explícito para chamada direta ou Session não encontrada.
- Execução: confirmar se esses usos são parte do produto suportado; se forem, definir resultado wire distinto e atualizar consumidor.
- Aceite: chamada suportada distingue ausência de Session, Session obsoleta e ausência legítima de contribuição; caminhos não suportados ficam documentados sem nova API.
- Evidência e docs: teste do protocolo, snapshot do request se model-visible e README da extensão.

## Próxima etapa operacional

O primeiro passo não é abrir M01 ou criar um segundo backlog. Concluir AAA-022:A16 no estado operacional atual: decidir os leitores históricos restantes de session-telemetry e session-title, registrar ownership e semântica de corte, ordem, cancelamento e veto e anunciar a ação de implementação sucessora de M08. Em seguida, promover os IDs ainda sem item canônico na ordem do [roadmap](roadmap-50-melhorias-2026-09-23.md), mantendo um único próximo passo por vez.
