# Backlog revisado das cinquenta melhorias após A26 — 2026-09-23

Esta revisão complementa o [backlog detalhado M01–M50](backlog-50-melhorias-2026-09-23.md) com evidência nova, ordem e próxima entrega. Os critérios completos de aceite e documentos proprietários permanecem no backlog original; status, autoridade, histórico e ação ativa pertencem ao [backlog operacional](../../.agent/backlog.json), ao [estado](../../.agent/state.json) e ao [ExecPlan](../../.agent/plans/deepseek-harness-aaa.md). O [roadmap revisado](roadmap-50-melhorias-2026-09-23-revisao-a26.md) ordena as frentes.

## Legenda de disposição

**Aberto confirmado** significa que a falha ou TODO foi observada nesta revisão. **Parcial** significa que houve implementação ou prova local, mas o aceite integral segue pendente. **Verde na árvore** significa PASS observado agora, sujeito a nova verificação no candidato sucessor. **A revalidar** significa que A26 não trouxe prova suficiente para encerrar o item. **Condicional** exige consumidor ou medição antes de implementar; ausência comprovada permite não aplicabilidade. Nenhum rótulo abaixo substitui o status vivo do programa.

## Bloqueadores incorporados à revisão

| ID operacional | Escopo observável | Critério antes de encerrar |
|---|---|---|
| `AAA-022:A27-TYPES` proposto | [agent-instructions.spec.ts](../../packages/context/agent-instructions/tests/agent-instructions.spec.ts): 5 erros; [invariant.spec.ts de time-context](../../packages/context/time-context/tests/invariant.spec.ts): 1; [time-context.spec.ts](../../packages/context/time-context/tests/time-context.spec.ts): 2; [resume.spec.ts](../../packages/core/agent-loop/tests/resume.spec.ts): 1; [fixtures.spec.ts](../../packages/session/session-projection-cache/tests/fixtures.spec.ts): 1. | Aprovar os cinco caminhos exatos, corrigir os 10 tipos sem mudar contratos para ocultá-los, e executar `pnpm run doc-typecheck` completo. |
| `AAA-022:A27-POLICY` proposto | Política global com 302 achados: 283 deltas sem improvement owner e 19 com owners múltiplos. Os três testes A26 e seu owner não aparecem. | Produzir inventário de caminhos e proposta de owner único por delta, aprovar escopo exato e executar `node scripts/verify-customization-policy.mjs --base master` até PASS. |
| `AAA-022:A27-STATE` proposto | Checker do programa: 359 achados, mesma contagem A25; inclui dependência de AAA-023 em AAA-022 não concluída e erros de referências, transições e gates. | Reparar classes de registros com correções append-only, reconciliar status e obter PASS; comparar contagens é apenas diagnóstico. |
| `AAA-023:A38` | Alvo da espera ainda cita A16 concluída, enquanto AAA-022 aponta A27. | Corrigir o ponteiro e sua transação operacional antes de decidir o sucessor de candidato; não transformar espera em qualificação aprovada. |
| `DOC-SYNC` observado | Seis gates ainda sem PASS agregado: tipos host, grafo de eventos, tool catalog, config catalog, persistence catalog e persistence type history. A falha adicional de package paths foi criada por esta revisão e corrigida; o check focado passou. | Corrigir artefatos gerados pelas fontes. Para tool catalog, investigar por que o plugin-manager não registra ferramenta na montagem do gerador; executar cada check afetado e `doc-sync` completo no candidato. |

Esses IDs `A27-*` são subentregas propostas desta revisão, não tarefas já abertas ou autorizadas no backlog operacional. `AAA-022:A27-AGGREGATE-SCOPE` permanece a ação canônica e decide sua promoção. Os cinco caminhos de tipos são testes fora da autorização A26; nenhum foi editado nesta revisão.

## Alta prioridade — M01 a M15

| ID | Disposição após A26 | Próxima entrega concreta e prova de saída |
|---|---|---|
| M01 | Aberto confirmado | Definir transporte de proxy autenticado que não exponha segredo ao shell; demonstrar com sentinela em Bash, PowerShell e subprocessos; atualizar guia e READMEs. |
| M02 | Aberto confirmado | Tratar união, interseção e transformação de Settings com redação segura ou rejeição explícita; provar que o valor secreto não sai pelo fio. |
| M03 | Aberto confirmado | Preservar `__proto__` e outras chaves JSON como dados em cópia e merge; provar ausência de alteração de protótipo. |
| M04 | Aberto confirmado | Ressincronizar registro de Settings substituto após escrita antiga; testar interleaving, observadores e descarte. |
| M05 | Aberto confirmado | Decidir limite de continuações Stop e provar término do hook que sempre bloqueia sem cortar uma continuação legítima. |
| M06 | Aberto confirmado | Definir o escopo de `continue: false` por hook e provar parada, log e retorno correspondentes. |
| M07 | Aberto confirmado | Aplicar orçamento total antes de ler todas as instruções; provar limite, cancelamento e omissão registrada. |
| M08 | Parcial, AAA-022 bloqueada | A26 comprovou três fixtures consumidores; concluir A27 e as ondas restantes de leitores, SDKs, snapshots e docs, com contagem canônica em queda. |
| M09 | Aberto confirmado | Atualizar a origem do caminho movido de ContextMeter e executar `audit:metrics`; arquivo rastreado realmente ausente ainda deve falhar. |
| M10 | Verde na árvore | `verify-module-graph` passou com três artefatos atuais; repetir gerador/check e pareamento após os imports finais do candidato, encerrando apenas com essa evidência. |
| M11 | Bloqueado por mudanças e gates | Criar candidato sucessor limpo depois de R1–R6, com política atribuída, commit/tree imutáveis e matriz local vinculada ao mesmo SHA. |
| M12 | Parcial | Classificar e resolver os 233 conflitos do ensaio upstream em atualização reproduzível, sem misturar o candidato A28 com a árvore atual. |
| M13 | Externo pendente | Obter Windows, macOS e ARM64 com identidade do candidato sucessor e outputs dos checks exigidos. |
| M14 | Externo pendente | Executar lanes de provedores reais com credenciais autorizadas e mesma identidade do candidato. |
| M15 | Bloqueado por M11–M14 | Entregar índice fechado ao crítico independente AAA-024; atestar apenas o veredito sustentado por evidência do mesmo commit. |

## Média prioridade — M16 a M35

| ID | Disposição após A26 | Próxima entrega concreta e prova de saída |
|---|---|---|
| M16 | A revalidar | Medir necessidade de `fsync` para gravações atômicas; documentar garantia real e decidir implementação por ameaça de perda. |
| M17 | A revalidar | Exercitar descarte durante watchers de Settings e provar que callbacks não publicam depois do encerramento. |
| M18 | A revalidar | Medir retenção de gerações de preset sem agente; recuperar apenas as que não têm consumidor e testar corridas. |
| M19 | A revalidar | Fixar origem das instruções durante a vida do agente e provar consistência sob mudança de diretório/raiz. |
| M20 | A revalidar | Fazer falha de infraestrutura em jobs Bash/PowerShell chegar como causa distinguível, com saída e limpeza verificadas. |
| M21 | Condicional | Demonstrar consumidor de descoberta de hooks por Session nos dois conectores; implementar ou registrar não aplicabilidade e gatilho. |
| M22 | Parcial, junto de M08 | Medir leitores obsoletos por pacote após A26; fechar cada waiver somente com prova do consumidor migrado. |
| M23 | A revalidar | Fixar orçamento e owner de supressões de lint por área; proibir aumento não justificado. |
| M24 | A revalidar | Priorizar `any` em interfaces de risco, remover em lotes com tipos e consumidores atualizados. |
| M25 | Condicional | Rodar probe da categoria correctness por owner, classificar ruído e decidir ativação sem mudança global tácita. |
| M26 | Condicional | Probar `skipLibCheck: false` nas faces publicadas e registrar custo e diagnósticos antes da decisão. |
| M27 | Condicional | Probar `verbatimModuleSyntax: true` por face e decidir com evidência de build/consumidor. |
| M28 | A revalidar | Inventariar skips com dono, motivo e gatilho de reativação; não contar skip como PASS. |
| M29 | Aberto para diagnóstico | Repetir cenários de Session, Settings, hooks, subprocesso e Web sob carga controlada; investigar também o aviso `MaxListenersExceededWarning`, identificando o listener antes de classificar vazamento. |
| M30 | A revalidar | Conferir exclusões de cobertura contra código executável e registrar exceções justificadas. |
| M31 | A revalidar | Medir latência e memória de Session longa em cenário representativo antes de otimizar. |
| M32 | A revalidar | Consolidar estado de envio PTY com prova de sucesso, erro, cancelamento e descarte. |
| M33 | A revalidar | Revisar amostra bilíngue semanticamente; pareamento mecânico não basta para equivalência. |
| M34 | A revalidar | Melhorar navegação de páginas extensas com hierarquia e links reais; validar saída do site. |
| M35 | Aberto confirmado | Remover o apontador datado da página do programa AAA ou ligá-la diretamente ao estado operacional; atualizar o par chinês e validar links e pareamento. A correção separada do alvo `AAA-023:A38` permanece na tabela de bloqueadores. |

## Baixa prioridade — M36 a M50

| ID | Disposição após A26 | Próxima entrega concreta e prova de saída |
|---|---|---|
| M36 | Aberto confirmado | Corrigir a afirmação absoluta de que a URL de proxy nunca aparece, mantendo o aviso explícito de herança por comandos. |
| M37 | A revalidar | Confirmar ausência de consumidor de `Workspace.create(title)` e remover parâmetro em todos os consumidores afetados. |
| M38 | A revalidar | Transportar separador de caminho pelo protocolo do seletor e provar comportamento nas plataformas suportadas. |
| M39 | A revalidar | Unificar apresentação de cabeçalhos de prévia sem alterar conteúdo persistido ou acessibilidade. |
| M40 | A revalidar | Reusar `DisclosureRow` no Bash se comportamento e semântica visual coincidirem; verificar UI real. |
| M41 | A revalidar | Renomear `ns` para `namespace` em Settings com atualização de API, consumidores e docs. |
| M42 | Condicional | Demonstrar troca de pacote em processo; somente então invalidar cache de identidade, senão registrar não aplicabilidade. |
| M43 | Condicional | Demonstrar duplicação material de watchers; escolher serviço comum apenas se reduzir código e lifecycle. |
| M44 | Condicional | Mapear configurações por época do cache LLM e corrigir apenas divergência reproduzível. |
| M45 | Condicional | Verificar tipos atuais de erro em `pi-ai` e consumir código/causa somente se expostos estavelmente. |
| M46 | Condicional | Medir custo da seleção da última resposta de subagente; otimizar somente acima de limite definido. |
| M47 | Condicional | Reproduzir ordem incorreta de primeira chamada concorrente no replay antes de alterar o protocolo. |
| M48 | A revalidar | Conferir variáveis internas de `ShellEnv.list`; incluir as registradas antes de afirmar exaustividade. |
| M49 | Condicional | Probar inclusão da face Client no gerador de grafos e decidir por utilidade e custo de manutenção. |
| M50 | Condicional | Confirmar suporte a chamada direta ou Session obsoleta de log; definir resultado de rede apenas se o caminho existir. |

## Regra de entrega da próxima etapa

O próximo agente começa em `AAA-022:A27-AGGREGATE-SCOPE`, não em A16 nem em novo item paralelo. Cada subentrega registra caminhos aprovados, solução, aceites, documentação owner, checks executados e próximo ID operacional. Uma etapa só sai de parcial ou condicional após evidência vinculada à árvore pertinente; a revisão de documentação não altera sozinha o status do backlog canônico.
