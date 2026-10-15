# Roadmap de melhorias do DeepSeek Harness — 27/09/2026

## Resumo

Este documento de referência organiza a evolução do DSH em sete fases e 44 entregas propostas. O objetivo é tornar a instalação recuperável, fechar as reprovações conhecidas e ampliar a comprovação de segurança, comportamento e operação. O [backlog detalhado](backlog-melhorias-dsh-2026-09-27.md) é o proprietário dos itens, dependências, aceites e métodos de validação; este roadmap define sequência, marcos e decisões de planejamento.

A base é a auditoria técnica e operacional de 27/09/2026, com nota **73,5/100**, 20 áreas avaliadas e 11 achados `DSH-AUD-01` a `DSH-AUD-11`. Os resultados são históricos dessa auditoria, não uma nova homologação. Criar este plano não altera notas nem comprova que uma correção foi implementada. A localização da evidência original está no [catálogo de fontes](backlog-melhorias-dsh-2026-09-27.md#fontes).

## Sumário

- [Escopo e continuidade](#escopo)
- [Fases e marcos](#fases)
- [Sequência e dependências](#sequencia)
- [Capacidade e estimativas](#capacidade)
- [Decisões necessárias](#decisoes)
- [Cobertura das 20 áreas](#areas)
- [Condições de homologação](#homologacao)
- [Primeiro lote e acompanhamento](#acompanhamento)

<a id="escopo"></a>
## Escopo e continuidade

O plano abrange a instalação local, o harness, provedores, sessões e anexos, permissões, plugins/MCP, interface, manutenção, testes e integração com o upstream. As propostas complementam o [backlog M01–M50](backlog-50-melhorias-2026-09-23.md), sua [revisão A26](backlog-50-melhorias-2026-09-23-revisao-a26.md) e o [backlog REM](backlog-remediacao-2026-09-21.md). Os cruzamentos estão no [backlog novo](backlog-melhorias-dsh-2026-09-27.md#legado); um item antigo não é reaberto nem encerrado apenas por aparecer aqui.

Os documentos desta entrega são planejamento. O [backlog operacional](../../.agent/backlog.json), o [estado](../../.agent/state.json) e o [ExecPlan existente](../../.agent/plans/deepseek-harness-aaa.md) conservam a execução e o histórico do programa. Antes de promover uma entrega, DSH-002 reconcilia esses registros com a árvore e a autorização vigentes. Apontadores antigos de ações AAA não devem ser interpretados como instruções atuais sem essa verificação.

Os responsáveis são papéis sugeridos, ainda sem atribuição nominal. Prioridades, esforço e decisões futuras são propostas. Este plano não instala serviços, não modifica sessões ou credenciais, não ativa alertas externos e não publica alterações. Mudanças futuras seguem o [padrão de desenvolvimento](../customization/improvement-development-standard.md) e o [procedimento upstream](../customization/upstream-safe-customization.md): `master` espelha o upstream; melhorias partem de `custom/main` em branches de trabalho.

<a id="fases"></a>
## Fases e marcos

P1 indica requisito antes de homologar o uso local contínuo; P2 amplia robustez ou fecha lacunas importantes; P3 representa correção localizada ou otimização condicionada. A prioridade não é uma afirmação de severidade. DSH-001 pode elevar uma prioridade quando uma exposição real for demonstrada.

| Fase | Entregas no backlog | Resultado pretendido | Critério de saída |
|---|---|---|---|
| **F0 — Base e reconciliação** | [DSH-001](backlog-melhorias-dsh-2026-09-27.md#dsh-001), [DSH-002](backlog-melhorias-dsh-2026-09-27.md#dsh-002) | Base reproduzível e relação entre todos os achados e tarefas anteriores. | Revisão, diferenças locais, evidências e proprietário de cada entrega registrados; cada ID legado tem disposição sem apagar seu histórico. |
| **F1 — Recuperação e disponibilidade** | [DSH-003](backlog-melhorias-dsh-2026-09-27.md#dsh-003) a [DSH-008](backlog-melhorias-dsh-2026-09-27.md#dsh-008) | Backup recuperável, serviço persistente e uma instância corretamente identificada. | Restauração isolada aprovada; recuperação do serviço testada; endpoint, sessões e anexos conferidos; procedimento de retorno disponível. |
| **F2 — Correções confirmadas** | [DSH-009](backlog-melhorias-dsh-2026-09-27.md#dsh-009) a [DSH-013](backlog-melhorias-dsh-2026-09-27.md#dsh-013) | Dependências tratadas, manifestos conformes, snapshot explicado e teste com descarte completo. | Scans e checks pertinentes aprovados; diferença de tokens justificada; falha antecipada do teste não deixa processo vivo. |
| **F3 — Integração e publicação verificáveis** | [DSH-014](backlog-melhorias-dsh-2026-09-27.md#dsh-014) a [DSH-018](backlog-melhorias-dsh-2026-09-27.md#dsh-018) | CI efetivo para a branch personalizada, regras remotas e ensaio upstream. | Checks obrigatórios executam no candidato correto; atualização ensaiada; matriz das plataformas declaradas identificada. A confirmação final dessa matriz ocorre após F6 gerar o candidato. |
| **F4 — Permissões, segredos e confiança** | [DSH-019](backlog-melhorias-dsh-2026-09-27.md#dsh-019) a [DSH-024](backlog-melhorias-dsh-2026-09-27.md#dsh-024) | Privilégios explícitos, inventário de extensões e revogação comprovada. | Casos permitidos e negados verificados; isolamento corresponde à ameaça escolhida; credenciais sintéticas não vazam; acesso remoto depende de sua qualificação específica. |
| **F5 — Comportamento, desempenho e experiência** | [DSH-025](backlog-melhorias-dsh-2026-09-27.md#dsh-025) a [DSH-036](backlog-melhorias-dsh-2026-09-27.md#dsh-036) | Retomada semanticamente avaliada, testes representativos, dívida priorizada e interface validada. | Restrições preservadas após compactação; regressões, carga delimitada e jornadas Web verificadas; benchmarks e acessibilidade têm resultados e limites explícitos. |
| **F6 — Operação observável e reauditoria** | [DSH-037](backlog-melhorias-dsh-2026-09-27.md#dsh-037) a [DSH-044](backlog-melhorias-dsh-2026-09-27.md#dsh-044) | Diagnóstico, alertas, manuais, candidato reproduzível e novo parecer. | Evidências pertencem ao mesmo candidato/configuração; todos os itens obrigatórios têm disposição; nova auditoria recalcula as 20 notas sem transformar falta de prova em aprovação. |

DSH-024, DSH-033 e DSH-036 são condicionais: acesso remoto, otimização e simplificação só avançam quando seus gatilhos forem demonstrados. DSH-018 qualifica somente as plataformas que forem declaradas como suportadas pelo candidato. Uma qualificação Linux não é aprovação de Windows ou macOS.

<a id="sequencia"></a>
## Sequência e dependências

O número da fase agrupa o assunto; não obriga espera por toda a fase anterior. As dependências por item no backlog determinam quando uma entrega pode começar. Reunir evidências de inventário, desenhar CI ou preparar testes sintéticos pode ocorrer em paralelo ao trabalho de recuperação quando os recursos forem independentes.

| Caminho | Ordem principal | Condição de proteção |
|---|---|---|
| Recuperação | DSH-001 → DSH-003 → DSH-004 → DSH-005 → DSH-006 → DSH-007 → DSH-008 | A restauração isolada precede a troca do serviço usado diariamente. |
| Correção e CI | DSH-001 → DSH-009 / DSH-011 / DSH-012 → DSH-014 → DSH-015 | Reprovações conhecidas recebem diagnóstico; checks não são desabilitados para liberar a integração. |
| Dependências e upstream | DSH-009 / DSH-010 / DSH-014 → DSH-016; DSH-002 / DSH-014 / DSH-015 → DSH-017 | Atualização transitiva respeita consumidores; ensaio upstream usa checkout isolado. |
| Confiança | DSH-019 → DSH-020 → DSH-021 / DSH-023; DSH-019 → DSH-022 → DSH-024 | Segredos, leitura, rede e MCP têm testes próprios; transporte remoto permanece condicional. |
| Contexto e testes | DSH-012 / DSH-019 → DSH-025; DSH-014 → DSH-029 → DSH-030 → DSH-031 | Métricas e snapshots não substituem a comprovação de comportamento. |
| Recursos e experiência | DSH-013 / DSH-014 → DSH-027; DSH-008 / DSH-027 → DSH-032 → DSH-033; DSH-026 / DSH-014 → DSH-034 → DSH-035 | Definir carga, limites e casos de falha antes de medir ou otimizar. |
| Observação | DSH-007 / DSH-014 → DSH-037 → DSH-038 / DSH-039 → DSH-040 → DSH-041 | Health check não faz chamada paga a modelo; telemetria não exporta conversas por acidente. |
| Homologação | Entregas requeridas → DSH-042 → evidência final de DSH-018 → DSH-044 | Fonte, artefato, implantação e checks precisam identificar o mesmo candidato; o escopo de plataforma deve ser explícito. |

Não paralelizar edições nos mesmos manifestos, lockfiles, políticas, arquivos gerados ou configuração operacional. Cada trabalho mantém seus dados de teste e portas próprios. O serviço e as conversas em uso não são ambiente de injeção de falhas.

<a id="capacidade"></a>
## Capacidade e estimativas

O backlog usa esforço relativo: **P** é uma mudança localizada com check conhecido; **M** envolve um pacote ou fluxo com consumidores; **G** envolve múltiplos pacotes, operação ou medição adicional. Esses tamanhos não são promessas de horas nem de calendário. Depois de F0, estimar tempo a partir da equipe disponível, recursos de CI, destinos de backup e quantidade de regressões legadas ainda reproduzíveis.

Para uma pessoa, trabalhar em um lote de implementação por vez e manter apenas verificações independentes em paralelo. Com duas frentes, uma pode cuidar de F1 e outra de F2 após F0. F4 e a preparação de observabilidade podem avançar quando suas dependências estiverem satisfeitas. F6 só encerra depois das evidências obrigatórias; não existe data de conclusão assumida neste documento.

<a id="decisoes"></a>
## Decisões necessárias

As decisões abaixo são entradas para a execução futura. Não são pedidos de confirmação para salvar os documentos. Uma autorização existente continua válida dentro de seu escopo; não se exige confirmação repetida para inspeção ou tarefas reversíveis já autorizadas.

| Decisão | Antes de | Proposta de ponto de partida | Evidência ou responsável |
|---|---|---|---|
| Perda e tempo máximos toleráveis | DSH-003 | Avaliar RPO de 24 horas e RTO de 60 minutos como hipóteses iniciais; reduzir conforme o uso exigir. | Ricardo define necessidade; responsável de operação mede se a solução cumpre. |
| Destino, retenção e recuperação da chave | DSH-004 | Cópia fora do disco de origem, conteúdo sensível cifrado e chave recuperável separadamente; capacidade e destino ainda a definir. | Inventário de armazenamento e ensaio de recuperação; não pressupor nuvem contratada. |
| Escopo do serviço local | DSH-006 / DSH-008 | Perfil e porta atuais, usuário sem privilégios extras e política de reinício; decidir login/boot e janela para teste. | Operação confirma como o serviço deve voltar após saída da sessão ou reboot. |
| Fluxo de PR e checks exigidos | DSH-014 / DSH-015 | Branch de trabalho baseada em `custom/main`; impedir integração com check obrigatório ausente ou vermelho. | Mantenedor com acesso às regras remotas; preservar o papel da `master`. |
| Dados e rede acessíveis aos agentes | DSH-020 / DSH-021 | Começar pelo modelo de uso confiável local e documentar quando usuário/container isolado é necessário. | Responsável de segurança e operador; testes com sentinelas e destinos controlados. |
| Exposição por rede ou proxy | DSH-024 | Manter a implantação local até existir necessidade explícita e ensaio de transporte. | Decisão operacional; não publicar automaticamente o endpoint. |
| Provedores, cotas e plataformas do candidato | DSH-018 / DSH-026 | Linux local e rotas realmente usadas primeiro; chamadas com limite, dados sintéticos e autorização aplicável. | Responsável de QA registra ambiente, custos e itens não executados. |
| Limites de desempenho e notificações | DSH-032 / DSH-038 | Definir carga representativa e destinatário do alerta antes de classificar desempenho ou ativar envio externo. | Operação escolhe limiares; QA mede a linha de base. |

<a id="areas"></a>
## Cobertura das 20 áreas

As notas abaixo pertencem à auditoria original. A coluna de entregas mostra onde cada área recebe trabalho ou evidência adicional. Não há aumento de nota previsto automaticamente.

| Área | Nota de origem | Entregas principais |
|---|---:|---|
| Arquitetura e modularidade | 83/100 | DSH-011, DSH-014, DSH-017, DSH-036 |
| Ciclo de vida e orquestração | 89/100 | DSH-008, DSH-027, DSH-028, DSH-043 |
| Ferramentas e aprovação | 85/100 | DSH-019, DSH-021, DSH-027 |
| Provedores e roteamento | 85/100 | DSH-026, DSH-028, DSH-034 |
| Contexto, memória e compactação | 69/100 | DSH-012, DSH-025, DSH-028, DSH-043 |
| Persistência e migrações | 89/100 | DSH-005, DSH-008, DSH-013, DSH-028 |
| Credenciais e segredos | 81/100 | DSH-003, DSH-022, DSH-023 |
| Autenticação HTTP e origem | 82/100 | DSH-019, DSH-022, DSH-024, DSH-034 |
| Arquivos, subprocessos e sandbox | 71/100 | DSH-019, DSH-020, DSH-023, DSH-027 |
| MCP e plugins | 79/100 | DSH-021, DSH-027, DSH-043 |
| Testes e regressões | 77/100 | DSH-012, DSH-013, DSH-014, DSH-029, DSH-043 |
| Build, tipagem e lint | 77/100 | DSH-009, DSH-011, DSH-018, DSH-042 |
| CI, dependências e publicação | 62/100 | DSH-009, DSH-010, DSH-014, DSH-015, DSH-016, DSH-042 |
| Git e upstream | 90/100 | DSH-001, DSH-002, DSH-015, DSH-017 |
| Desempenho e recursos | 56/100 | DSH-027, DSH-032, DSH-033, DSH-037 |
| Interface e acessibilidade | 74/100 | DSH-034, DSH-035, DSH-036 |
| Implantação e disponibilidade | 48/100 | DSH-006, DSH-007, DSH-008, DSH-037, DSH-038 |
| Observabilidade e diagnóstico | 63/100 | DSH-037, DSH-038, DSH-039, DSH-040 |
| Backup e recuperação | 30/100 | DSH-003, DSH-004, DSH-005, DSH-038, DSH-040 |
| Documentação e manutenibilidade | 80/100 | DSH-002, DSH-030, DSH-031, DSH-040, DSH-041 |

<a id="homologacao"></a>
## Condições de homologação

**Uso local contínuo:** exigir recuperação do serviço e restauração comprovadas, fechamento dos P1, controles de confiança correspondentes ao uso declarado, checks exigidos aprovados e alertas de falhas relevantes demonstrados. Riscos de segurança ou dados não são compensados por média alta. P2/P3 não concluídos precisam de disposição explícita, responsável e gatilho de reavaliação quando estiverem fora do escopo homologado.

**Publicação de uma versão:** além dos critérios locais pertinentes, DSH-042 identifica um artefato reproduzível e DSH-018 fornece evidências do mesmo candidato para cada plataforma anunciada. Preparar um candidato não publica pacotes, não cria release nem altera o serviço automaticamente.

**Acesso remoto:** DSH-024 e o modelo de isolamento escolhido tornam-se requisitos do escopo. Um resultado de autenticação no loopback não comprova transporte remoto seguro.

**Reauditoria:** DSH-044 usa os quatro componentes de 0 a 25 da rubrica original e a mesma média das 20 áreas. Metas de qualidade são aceites observáveis; pontuações só mudam com resultados novos, confiança e limitações registradas.

<a id="acompanhamento"></a>
## Primeiro lote e acompanhamento

O primeiro lote de execução proposto é **DSH-001 e DSH-002**, seguido por **DSH-003 a DSH-005** para comprovar recuperação. Em paralelo, quando houver capacidade, diagnosticar **DSH-009, DSH-011 e DSH-012**. Essa ordem protege os dados antes de trocar a instalação diária e resolve os bloqueios conhecidos antes de exigir CI verde.

Cada entrega registra o que mudou, o resultado do teste que rejeitaria a regressão, os arquivos/documentos proprietários, a identidade do candidato, o risco restante e a próxima ação. Mudanças que afetem uma evidência invalidam seu uso como resultado atual até a revalidação pertinente. O detalhe de cada tarefa e a regra de promoção estão no [backlog](backlog-melhorias-dsh-2026-09-27.md#regras).

## Dev Note

Documento de planejamento em português, dentro da [exceção de auditorias do fork](../i18n/README.md#scope-and-exclusions). As decisões ainda abertas permanecem propostas; a edição deste arquivo não altera o controle operacional nem implementa nenhuma entrega.
