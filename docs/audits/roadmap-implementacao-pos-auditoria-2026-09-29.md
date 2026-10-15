# Roadmap de implementação após a auditoria da sessão DSH de 29/09/2026

## Resumo

Este roadmap transforma a [auditoria da implementação](auditoria-implementacao-dsh-2026-09-29.md) em uma sequência de entregas verificáveis. O [backlog associado](backlog-implementacao-pos-auditoria-2026-09-29.md) identifica as 20 pendências RA29 do RICK Intelligence e oito melhorias da execução pelo DeepSeek Harness. Os documentos são planejamento nesta pasta de auditorias; não mudam o estado canônico de nenhum dos dois projetos nem declaram uma correção pronta.

## Objetivo e divisão de responsabilidade

O resultado desejado é um candidato do RICK com integridade, segurança, gates locais, operação distribuída e revisão final comprovados, produzido por um DSH que mantenha escopo, evidência e estado de conclusão coerentes. O RICK possui código, testes, documentos de implementação e RA29-01…20. O DSH possui o comportamento de meta, subagentes, ferramentas, sessão Web e os itens DH29-01…08. As dependências entre os dois projetos não transferem autoridade de promoção ou implantação ao agente.

O ponto de partida observado é parcial: oito RA29 foram anunciados como implementados, nenhum conjunto completo de aceite foi demonstrado, a matriz Web terminou em 319/321 antes dos ajustes focados e a execução PostgreSQL live não ocorreu. Cinco subagentes novos concluíram suas delegações. A auditoria não mostrou falha de abertura de múltiplas janelas, gateway ou compactação nesta amostra; essas áreas precisam de ensaio específico antes de uma conclusão.

## Condições que valem em todas as fases

1. A revisão de cada candidato deve ser identificável por commit ou por manifesto de hashes que inclua mudanças ainda não commitadas; cada resultado registra comando, ambiente, código de saída, horário, artefato sanitizado e revisão exata.
2. `CODE_DONE`, `LOCAL_VERIFIED`, `LIVE_VERIFIED`, `BLOCKED_EXTERNAL` e `ACCEPTED` são estados distintos. Uma falha ou caso ignorado não vira PASS por uma repetição parcial. Uma meta só é `complete` quando todos os critérios exigidos por seu objetivo foram atendidos; uma redução de escopo precisa permanecer explícita e aceita pelo usuário.
3. Testes positivos e negativos demonstram a eficácia de constraints, autorização, versões e gates. A revisão independente examina o mesmo candidato que produziu as evidências.
4. Preparação local pode avançar. Para ações condicionadas por D01–D07, conferir primeiro decisões já registradas em `/home/ricardo/rick-intelligence/.agent/` e no plano executivo do RICK; solicitar somente a decisão ainda ausente para o efeito concreto.
5. O trabalho em DSH segue `custom/main`, o padrão de melhorias e a política `solutionType`; `master` permanece espelho upstream. O trabalho em RICK parte de um candidato isolado e preserva o estado existente.

## Fases e critérios de passagem

| Fase | Entregas | Critério de saída | Dependências |
|---|---|---|---|
| **F0 — Candidato e estado** | RA29-01/02; DH29-01/03/06 | Baseline reproduzível; inventário de dados e plano de migration; 28 IDs com estado/evidência; nenhum item silenciosamente omitido. | Nenhuma. |
| **F1 — Segurança e integridade** | RA29-03/04/05 | Seed sem afirmação falsa de hash; negação cross-scope em ambos os providers; migration com matriz positiva/negativa PostgreSQL e recuperação documentada. | F0; D01/D02 somente para ensaios que os requeiram. |
| **F2 — Qualidade local** | RA29-06…11; DH29-02/04/07/08 | Benchmark e `api15-full` verdes; 321/321 Web no candidato final; corrida de ingestão resolvida; gates negativos eficazes; warnings e coverage classificados. | F0 e correções F1 que afetem regressões. |
| **F3 — Reprodutibilidade e operação preparada** | RA29-12…15; DH29-05 | Versões e pins validados contra drift; credenciais de bootstrap e staging revisados; lanes de autoridade inequívocas; observabilidade/readiness demonstradas no laboratório aplicável; comportamento Web do DSH medido. | F2 para critério final; investigação DH29-05 pode começar em paralelo. |
| **F4 — Integração distribuída** | RA29-16/17 | Golden path completo, isolamento negativo e outbox sob indisponibilidade/restart no mesmo candidato. | F1–F3; D01–D04 pertinentes. |
| **F5 — Resiliência** | RA29-18/19 | RPO/RTO, capacidade, chaos e soak medidos com budgets autorizados e recuperação verificável. | F4; D01/D02/D03/D05 pertinentes. |
| **F6 — Revisão e decisão** | RA29-20; reconciliação DH29-01/06/08 | CI e revisão independentes sobre o mesmo SHA/tree; 20/20 RA29 com aceite ou bloqueio explícito; decisão Go/No-Go assinada pela autoridade definida. | F5; D07 para decisão final. |

## Sequência executiva

### Primeiro lote: tornar o trabalho auditável

Congelar a árvore do RICK e levantar seu estado canônico antes de novas alterações; registrar o baseline dos testes e o inventário das linhas que podem violar a migration `0008`. Publicar um ledger RA29-01…20 com o estado inicial da [auditoria](auditoria-implementacao-dsh-2026-09-29.md). No DSH, definir como o estado de tarefas e a evidência dos subagentes chegam à decisão de conclusão, sem presumir que um novo mecanismo de runtime seja necessário antes de inspecionar os pontos de extensão existentes.

### Segundo lote: corrigir afirmações e riscos imediatos

No RICK, corrigir o seed de credenciais para respeitar verificadores não efêmeros, atribuir corretamente a validação de escopo da administração e cobrir ambos os providers. Desenhar reconciliação de dados, preflight e recuperação da migration antes de executá-la contra PostgreSQL. Ajustar a documentação de implementação no mesmo conjunto de mudanças; não manter “implementado e verificado” onde o aceite ainda depende de prova live.

### Terceiro lote: fechar regressões locais

Reexecutar a matriz Web inteira após o último ajuste, resolver a corrida de telemetria e tornar observáveis as falhas negativas dos gates raiz, da verificação de pins e do comparador de versões. Classificar os 424 warnings observados e estabelecer cobertura mínima e dependências Python reproduzíveis. O DSH deve consumir resultados estruturados dos subagentes e distinguir execução focada, matriz completa e casos ignorados na síntese.

### Quarto lote: ensaio operacional e promoção

Preparar composição, observabilidade, autoridade e cenários herméticos independentemente das decisões externas. Quando as decisões pertinentes já existirem, executar o golden path, o outbox sob falha, restore, capacidade, chaos e soak em ambiente identificado. Encerrar com revisão independente, reauditoria dos 26 critérios do RICK e decisão explícita; nenhum resultado local substitui autorização ou evidência distribuída.

## Dependências e paralelismo

RA29-01 precede RA29-02; RA29-02 precede a prova final de RA29-03. RA29-04/05 podem receber correções locais em paralelo ao desenho de dados, mas seu aceite exige o mesmo candidato. RA29-07 e RA29-08 podem ser investigados em paralelo depois do baseline; checks pesados que escrevem artefatos não compartilham um worktree ativo. RA29-12/13 e DH29-05 podem começar após F0, sem declarar F3 concluída antes de F2. RA29-16 depende de RA29-03/14/15; RA29-18 depende de RA29-16; RA29-19 depende de RA29-18; RA29-20 depende de ambos. DH29-01/03/06 devem estar em uso antes da nova rodada de implementação, para que a evidência não precise ser reconstruída depois.

## Decisões externas

| Decisão | Uso neste roadmap |
|---|---|
| D01 | Dados, tenants, isolamento e retenção dos ensaios integrados. |
| D02 | Ambiente, credenciais, bootstrap, TLS e confiança dos artefatos. |
| D03 | Provider, modelo, endpoint, custo e interrupção. |
| D04 | Política de domínio, corpus, direitos de uso, rótulos e limiares. |
| D05 | SLO, RPO/RTO, cargas, amostras e janelas. |
| D06 | Reconciliação com a execução histórica Q17. |
| D07 | Revisão final, assinatura e eventual implantação. |

Essas definições seguem o plano executivo do RICK consultado em 29/09/2026. O estado de cada decisão deve ser lido novamente antes do efeito dependente; uma decisão já concedida não precisa ser solicitada de novo.

## Medidas de progresso e saída

- **Cobertura do backlog:** 28/28 IDs com dono, estado, dependência, evidência e próximo passo; 20/20 RA29 aceitos para encerrar o objetivo do RICK. Um bloqueio externo é visível, mas não conta como aceite.
- **Qualidade local:** matriz Web completa 321/321 no candidato final; API e benchmark verdes; warnings classificados; coverage abaixo do limite faz o gate falhar; verificações de versão, pins e gate raiz rejeitam exemplos inválidos.
- **Segurança e dados:** tentativas cross-scope negativas em PostgreSQL e in-memory, writes válidos preservados, dados incompatíveis inventariados e plano de recuperação exercitado conforme ambiente autorizado.
- **Operação:** golden path, outbox, restore, capacidade e observabilidade com evidência do mesmo candidato; RPO/RTO e SLO comparados aos limites definidos em D05.
- **DSH:** nenhuma meta encerrada com IDs obrigatórios sem aceite; nenhuma síntese de subagente perde `FAIL`, `NOT_RUN` ou `BLOCKED_EXTERNAL`; o ensaio Web registra instância, porta, janela, gateway e encerramento observáveis.

## Acompanhamento

O backlog operacional do RICK e `.agent/` continuam a fonte de estado de execução daquele projeto. Este roadmap e o backlog associado servem de referência da auditoria, com estado inicial datado. A cada entrega, o responsável atualiza primeiro o registro canônico do projeto dono e deixa neste plano apenas um link ou uma nova revisão auditável, sem sobrescrever o diagnóstico histórico.
