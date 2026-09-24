# Roadmap das cinquenta melhorias — 2026-09-23

Este roadmap ordena os IDs da [lista](melhorias-50-2026-09-23.md) por dependência e risco. O [plano executivo](plano-executivo-50-melhorias-2026-09-23.md) define as regras de execução, e o [backlog detalhado](backlog-50-melhorias-2026-09-23.md) define o aceite. O estado e a ação ativa pertencem a .agent, não a este arquivo.

## Resumo

O trabalho é dividido em oito marcos, R0–R7. A prioridade da lista define urgência; a ordem abaixo respeita dependências. A qualificação final reúne os resultados no mesmo commit após as mudanças de segurança, dados, documentação e manutenção aplicáveis.

## Conteúdo

1. [Dependências principais](#dependências-principais)
2. [Marcos e saídas](#marcos-e-saídas)
3. [Regras de passagem](#regras-de-passagem)
4. [Próxima etapa](#próxima-etapa)

## Dependências principais

R0 conclui a ação ativa AAA-022:A16 e reconcilia M01–M50 com o backlog canônico. R1 fecha a migração M08 e restaura os verificadores M09–M10. R2 trata segredos, integridade de Settings, hooks e limites de instruções. R3 trata recursos, processos e lifecycle. R4 reduz dívida e valida alterações de ferramentas. R5 corrige documentação e melhorias locais. R6 decide as propostas condicionais com medição ou consumidores concretos. R7 integra a atualização upstream e qualifica o candidato final. O ensaio de M12 começa em R0 para informar conflitos; sua conclusão pertence a R7.

## Marcos e saídas

| Marco | Itens | Entrega observável | Dependência para saída |
|---|---|---|---|
| R0 — recuperar e decidir | Ação AAA-022:A16; inventário M01–M50; ensaio inicial de M12 | IDs ligados a itens operacionais, decisões de ownership e próxima ação única; conflitos upstream classificados | Estado, código e política reconciliados sem alterar trabalho existente |
| R1 — restaurar base verificável | M08, M09, M10 | Leitores de Session completados; medidor e grafo passam na árvore candidata | Contratos de Session, SDK e documentação sincronizados |
| R2 — proteger entradas e decisões | M01–M07 | Segredos, Settings, hooks e arquivos de instruções têm semântica segura observada | Testes negativos, limites e documentação proprietária atualizados |
| R3 — fechar lifecycle e recursos | M16–M21, M32 | Durabilidade decidida; watchers, presets, shell e PTY encerram ou falham corretamente | Sucesso, erro, cancelamento, corrida e descarte observados |
| R4 — reduzir dívida medida | M22–M31 | Métricas canônicas não crescem; exceções e corpus de testes têm responsáveis | Medições e verificadores por área passam sem relaxamento global tácito |
| R5 — melhorar documentação e UI local | M33–M41 | Revisão semântica amostral, navegação, status e simplificações locais entregues | Pares, links, tipos, catálogo e apresentação pertinente verificados |
| R6 — decidir capacidades condicionais | M42–M50 | Cada proposta implementada com consumidor real ou encerrada como não aplicável | Pré-condição, resultado da busca ou medição e gatilho de reabertura registrados |
| R7 — integrar e qualificar | M11–M15; conclusão de M12 | Candidato imutável com update upstream resolvido, matriz local e externa e auditoria independente | Todo critério obrigatório vinculado ao mesmo commit |

R2–R6 podem ser repartidos em mudanças independentes depois que R0 e os contratos compartilhados de R1 estiverem estáveis. A independência deve ser demonstrada pela ausência de arquivos proprietários, formatos persistidos e verificações concorrentes em comum. O uso de uma frente não reduz o aceite de outra.

## Regras de passagem

1. Um marco só passa com suas entradas aplicáveis fechadas no backlog canônico, evidência atual e documentação proprietária sincronizada.
2. Uma falha de verificador é tratada na fonte; o agente não altera o verificador para ocultar o defeito que ele demonstra.
3. Mudança de Session ou de modelo leva suas projeções, snapshots e consumidores na mesma etapa.
4. Uma proposta condicional pode sair por não aplicabilidade demonstrada; o agente registra o consumidor ausente, a medição ou a decisão e uma condição concreta para reabrir.
5. Depois de selar R7, qualquer alteração de código ou configuração cria um novo candidato e exige repetir a evidência afetada.
6. Todo checkpoint termina com o ID seguinte, a ação concreta, o proprietário e a condição observável de conclusão.

## Próxima etapa

Executar a ação já ativa AAA-022:A16. O agente deve entregar a decisão de desenho para session-telemetry e session-title, incorporá-la ao ExecPlan e ao backlog canônico e então nomear o sucessor de implementação de M08. A lista de M01–M50 começa a ser promovida sem interromper ou duplicar essa ação.
