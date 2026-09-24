# Plano executivo das cinquenta melhorias — 2026-09-23

Este plano organiza a execução da [lista M01–M50](melhorias-50-2026-09-23.md) sem substituir o [ExecPlan ativo](../../.agent/plans/deepseek-harness-aaa.md), o [backlog operacional](../../.agent/backlog.json) ou o [estado atual](../../.agent/state.json). O [roadmap](roadmap-50-melhorias-2026-09-23.md) ordena os marcos; o [backlog de implementação](backlog-50-melhorias-2026-09-23.md) define o resultado e o aceite de cada item.

## Resumo

O programa deve atribuir uma disposição verificável a todos os cinquenta IDs e implementar cada melhoria aplicável com sua documentação proprietária. Segurança, integridade de dados, verificadores obrigatórios e contratos de lifecycle vêm antes de simplificações condicionais. Um item cujo pressuposto não se confirme é encerrado por evidência de não aplicabilidade, sem acrescentar código especulativo.

## Conteúdo

1. [Resultado e fontes de verdade](#resultado-e-fontes-de-verdade)
2. [Situação inicial e sequência](#situação-inicial-e-sequência)
3. [Unidade de execução](#unidade-de-execução)
4. [Documentação em toda mudança](#documentação-em-toda-mudança)
5. [Verificação e fechamento](#verificação-e-fechamento)
6. [Decisões e riscos](#decisões-e-riscos)
7. [Entrega contínua da próxima etapa](#entrega-contínua-da-próxima-etapa)

## Resultado e fontes de verdade

O resultado desejado é um fork atualizável, seguro e qualificável, com os itens aplicáveis M01–M50 implementados, os condicionais decididos por evidência e as obrigações de Session, SDK, empacotamento, tradução, plataforma e release preservadas. Nenhuma nota média substitui um requisito crítico sem evidência.

| Informação | Fonte proprietária |
|---|---|
| Arquitetura e comportamento atual | Código, testes, [arquitetura](../architecture.md), páginas de subsistema e READMEs dos pacotes |
| Regras de melhoria do fork | [Padrão de desenvolvimento](../customization/improvement-development-standard.md) e política de customização |
| Status, responsável, dependências e ação seguinte | [.agent/backlog.json](../../.agent/backlog.json) |
| Ação ativa | [.agent/state.json](../../.agent/state.json) |
| Desenho, decisões e recuperação da execução | [ExecPlan ativo](../../.agent/plans/deepseek-harness-aaa.md) |
| Observações congeladas | [Relatório desta auditoria](relatorio-sistema-2026-09-23.md) e seus antecessores |
| Aceite planejado para M01–M50 | [Backlog desta proposta](backlog-50-melhorias-2026-09-23.md) |

Antes de iniciar cada ID, o agente confronta a proposta com o estado canônico, o código atual e o histórico de implementação. Ele reutiliza o item operacional existente quando houver sobreposição, registra o vínculo Mxx, define exatamente um solutionType e um responsável e só então inicia trabalho dependente. O fechamento de um ID não reescreve relatórios congelados; nova evidência operacional entra nos ledgers e a documentação de produto descreve o comportamento presente.

## Situação inicial e sequência

Em 2026-09-23, AAA-022 está em andamento na ação A16, AAA-023 espera a disposição dos leitores de Session e AAA-024 ainda não começou. O candidato local anterior passou sua matriz local, mas a árvore de trabalho atual difere dele. Os comandos audit:metrics e verify-module-graph falharam na árvore atual; o primeiro procura o caminho antigo de ContextMeter.tsx e o segundo aponta o grafo de módulos desatualizado.

A sequência de execução é: recuperar e concluir AAA-022:A16; completar a migração M08 sem duplicar AAA-022; reparar M09 e M10 no candidato que receberá as alterações; resolver os riscos de segurança e dados M01–M07; implementar as frentes independentes por proprietário; concluir a qualificação M11–M15 sobre um único candidato. M12 exige uma simulação antecipada para planejar os 233 conflitos, seguida de verificação final após a integração. O [roadmap](roadmap-50-melhorias-2026-09-23.md) define dependências mais finas.

Os itens de média e baixa prioridade podem avançar somente quando sua base não disputa a ação ativa ou invalida uma verificação ainda necessária. Cada lote deve ser pequeno o bastante para ter um comportamento, um conjunto de documentação e uma regressão verificável. Mudanças de API atualizam todos os consumidores no mesmo lote; mudanças model-visible atualizam log, snapshots e as duas SDKs quando aplicável.

## Unidade de execução

1. **Descobrir.** Ler as instruções aplicáveis, o arquivo proprietário, os consumidores, testes, configuração, documentação e decisão existente. Distinguir defeito observado, TODO de implementação e proposta condicional.
2. **Especificar.** Registrar comportamento atual, resultado observável, falha, escopo, solutionType, dependências, compatibilidade, risco e evidência que rejeitaria uma implementação incorreta. Toda decisão material usa o proprietário de política e o mecanismo de autorização já vigente.
3. **Implementar.** Fazer a menor mudança completa nas funções de Service Definition, Provider e Consumer quando houver uma capability seam. Preservar gerações de Session lançadas e cumprir a política de launch por perfil.
4. **Documentar.** Atualizar README proprietário, JSDoc e página de subsistema afetada no mesmo lote; atualizar o par chinês e o registro de pareamento de todo documento coberto; regenerar catálogos, grafos e exemplos pelo gerador proprietário. Decisão durável ganha ou atualiza Agent Note quando seus critérios se aplicam.
5. **Verificar.** Selecionar os checks proporcionais pelo [procedimento pre-push](../../.agents/skills/dsh-pre-push-checks/SKILL.md). Um caso inválido deve demonstrar cada proteção nova; lifecycle inclui erro, cancelamento e descarte; segurança inclui ausência de segredo; pacote público inclui caminho empacotado; modelo inclui snapshot ou E2E pertinente.
6. **Fechar e entregar.** Registrar comando, resultado, commit ou árvore, limites e risco residual; atualizar backlog, ExecPlan e estado em ordem canônica; indicar a próxima ação concreta com ID e sinal de conclusão.

## Documentação em toda mudança

O documento proprietário descreve o comportamento já implementado, suas falhas, limites, momento de efeito e recuperação. Planos, hipóteses e histórico ficam no ExecPlan, em Agent Notes apropriadas ou em novo relatório datado. Documentos gerados não recebem edição manual. Toda página bilíngue alterada recebe contraparte semanticamente alinhada e registro de pareamento atualizado.

Ao concluir cada item, o agente confere a seção de documentação da entrada correspondente no backlog desta proposta, atualiza os vínculos de navegação e executa as verificações documentais aplicáveis. Se a implementação não exige documentação nova, registra qual página atual já cobre o contrato e por que nenhuma frase mudou. O agente não usa uma nota de desenvolvimento para esconder comportamento presente ou pendência de segurança.

## Verificação e fechamento

Há três níveis: check focado da mudança; conjunto proporcional da frente; qualificação integrada sobre um commit imutável. O conjunto final precisa relacionar cada Mxx aplicável aos resultados exatos, à documentação e ao commit. M13 e M14 dependem de plataformas ou credenciais que não existem neste host; ausência de execução permanece pendência explícita, nunca aprovação presumida. M15 só começa depois que o pacote de evidências e a identidade do candidato estiverem completos.

Um item termina como IMPLEMENTADO quando o aceite foi observado no código e no caminho público pertinente. Um item condicional termina como NÃO APLICÁVEL somente com busca de consumidores ou medição registrada e uma condição de reabertura. Um item BLOQUEADO mantém proprietário, dependência e próxima ação. O agente não marca release pronto enquanto houver critério crítico aberto ou evidência de candidato anterior sendo aplicada a uma árvore posterior.

## Decisões e riscos

M01 exige decisão sobre transporte de proxy autenticado e proteção de segredo sem quebrar CLI legítima. M02–M04 alteram serialização, redação ou concorrência de Settings e devem seguir os limites de confiança e testes de falha do pacote. M05–M06 podem mudar o significado dos hooks e precisam de compatibilidade explícita. M08 obedece à política de formatos lançados. M12 exige uma estratégia revisável para os 233 conflitos e ownership de cada mudança do fork. M13–M15 dependem de resultados externos e de uma autoridade de publicação ou release já registrada; este plano não a inventa.

Itens M25–M27 e outros experimentos de manutenção começam com um diagnóstico restrito. A adoção global de regra de lint ou padrão do compilador depende da decisão prevista no estado operacional; o diagnóstico não altera a política. Itens condicionais de baixa prioridade podem ser rejeitados quando a medição mostrar que a mudança adicionaria mais manutenção do que removeria.

## Entrega contínua da próxima etapa

Cada resposta de implementação deve informar: ID concluído ou bloqueado; alteração e documentação proprietária; comandos realmente executados e resultados; risco residual; ID seguinte, arquivo ou serviço a abrir e condição concreta de conclusão. O agente registra a mesma próxima ação em .agent/backlog.json e mantém .agent/state.json coerente com o ExecPlan. O roadmap nunca substitui esse ponteiro vivo.

**Próxima etapa agora: AAA-022:A16.** Concluir o desenho dos leitores históricos restantes de session-telemetry e session-title, com decisão para cada consumidor, corte fixo, ordem, cancelamento e veto, e preparar o sucessor de implementação sem ciclo de dependências. A conclusão dessa ação libera a próxima onda de M08 e a reconstrução posterior de M11; nenhum outro ID deve ser anunciado como a ação ativa enquanto A16 permanecer aberta.
