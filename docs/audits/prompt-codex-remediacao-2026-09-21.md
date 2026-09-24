# Prompt para execução integral pelo Codex

Este documento é um artefato congelado do fork, escrito em português e excluído do pareamento bilíngue. O bloco abaixo pode ser copiado como uma única mensagem para um agente Codex aberto na raiz `/home/ricardo/deepseek-harness`.

## Resumo

O prompt define objetivo, contexto, fontes de verdade, restrições, sequência, decisões humanas, verificação e formato de entrega. Ele manda implementar e comprovar todos os 37 itens, não apenas produzir outro plano.

## Prompt para copiar e colar

```text
Quero que você execute integralmente o programa de remediação da auditoria deste repositório. Não pare na análise nem crie apenas um novo plano: implemente, teste, documente e encerre todos os itens REM-001 a REM-037 com evidência reproduzível.

Workspace e branch de trabalho:
- Repositório: /home/ricardo/deepseek-harness
- Linha de customização: custom/main
- Nunca implemente a customização diretamente em master; master é apenas o espelho upstream.

Objetivo final:
- Transformar o candidato auditado, atualmente 63/100 e FAIL, em um candidato limpo, reproduzível e qualificável.
- Resolver todos os achados AUD-001 a AUD-037 e todos os itens REM-001 a REM-037.
- Terminar somente quando cada item tiver implementação ou contraevidência válida, documentação, teste/gate proporcional e registro na fonte operacional canônica.
- Entregar uma reauditoria final com notas 0–100 nas 15 dimensões e veredito PASS ou CONDITIONAL PASS com condições externas explícitas. FAIL não conclui o objetivo.

Leia completamente, antes de editar:
1. AGENTS.md da raiz e qualquer AGENTS.md aplicável aos arquivos que tocar.
2. docs/architecture.md, docs/testing.md e docs/defensive-patterns.md.
3. docs/customization/improvement-development-standard.md e docs/customization/upstream-safe-customization.md.
4. docs/audits/auditoria-profunda-2026-09-21.md.
5. docs/audits/plano-executivo-remediacao-2026-09-21.md.
6. docs/audits/roadmap-remediacao-2026-09-21.md.
7. docs/audits/backlog-remediacao-2026-09-21.md.
8. .agent/PLANS.md, .agent/state.json, o plano ativo em .agent/plans/, .agent/backlog.json e os ledgers existentes.
9. Para mudanças de Session ou tipos persistidos, docs/session-format-status.md e docs/cookbook/reviewing-persistence-type-changes.md.

Recupere o estado antes de agir:
- A árvore já contém trabalho em andamento. Preserve toda mudança preexistente e não use reset, checkout destrutivo, clean destrutivo ou sobrescrita para obter uma árvore limpa.
- Siga a ordem de recuperação: .agent/state.json -> plano ativo -> backlog -> ledgers -> working tree.
- O plano e o backlog em .agent/ são as únicas fontes vivas de status. Os arquivos em docs/audits/ são diagnóstico e especificação congelados.
- Reconcilie REM-001 a REM-037 com itens já existentes no backlog. Reutilize o item canônico quando houver sobreposição e registre os vínculos REM-* e AUD-*; não crie inventário concorrente.
- Promova o programa numa transação coerente: estado, plano, backlog e ledgers devem apontar para a mesma próxima ação.
- Confirme que a melhoria ativa em .agents/customization-policy.json cobre os caminhos. Para qualquer superfície nova, siga o padrão de melhoria e escolha exatamente um solutionType antes de implementar.

Modo de execução:
- Siga M0 a M8 do roadmap e mantenha dependências reais.
- Comece por REM-027 e pelos gates quebrados REM-005, REM-013 e REM-014; depois resolva os bloqueadores críticos REM-001 a REM-004.
- Continue trabalho independente enquanto uma decisão humana estiver pendente. Não escolha silenciosamente política pública, de segurança ou de publicação.
- Divida itens amplos em unidades revisáveis no backlog canônico, preservando rastreabilidade para o REM-* original.
- Corrija causas. Não desabilite regras, não aumente timeouts sem diagnóstico, não remova testes e não transforme falha em skip para obter verde.
- Atualize todos os consumers de APIs pre-stable. Quando uma capability seam mudar, trate Service Definition, Service Provider e Consumer como unidade.
- Novos comportamentos ficam em pontos de extensão documentados. Uma mudança necessária no comportamento oficial usa upstream-package-change e atualiza todos os consumidores e testes.
- Tudo que chega ao modelo deve ser reconstruível pelo Session log. Mudança model-visible exige evento e snapshot keyless.
- Mudanças em loop, lifecycle ou SessionEventMap atualizam os SDKs TypeScript e Python e seus expected outputs.
- Nunca mova, sobrescreva ou apague gerações persistidas já lançadas. SQLite usa SCHEMA_VERSION monotônico.
- Registros e listeners são efeitos descartáveis. Mudanças de lifecycle devem cobrir sucesso, falha, abort, timeout, reload e teardown.
- Texto de UI do cliente pertence aos dicionários de locale.
- Documentação acompanha código e JSDoc. Mantenha pares EN/ZH quando a política exigir; docs/audits/ é a exceção local em português que REM-032 deve documentar.
- Não edite Agent Notes arquivadas. Em notas ativas, preserve apenas decisão durável e contexto necessário.
- Se houver mudança visual de GUI, grave o GIF obrigatório a partir do servidor e fluxo reais da mudança.

Decisões que exigem confirmação humana antes da implementação incompatível:
1. Política definitiva de runners para forks: hosted somente ou ambiente efêmero equivalente.
2. Transporte de credenciais de proxy sem exposição a subprocessos produzidos pelo modelo.
3. Ambientes suportados, consentimento, CSP e defaults para extensões dinâmicas.
4. Orçamento agregado e comportamento de backpressure/rejeição na ponte HTTP e RPC.
5. Se RemoteStreamMuxClient.close() aguarda fechamento físico ou se haverá APIs separadas.
6. Ownership do domínio do cliente e localização da API documental compartilhada.
7. Identidade de publicação do fork e se ./src/* é API publicada.

Quando chegar ao primeiro desses portões, apresente um único pacote de decisão contendo recomendação, alternativas, impacto, reversibilidade, compatibilidade e arquivos afetados. Continue as frentes independentes enquanto aguarda. Não faça push, merge, publicação ou release sem autorização explícita.

Requisitos mínimos por grupo:
- REM-001: forks nunca selecionam runner persistente; adicione teste estático negativo.
- REM-002: segredo de proxy não aparece em env, argv, logs ou erros de subprocessos model-authored.
- REM-003 e REM-004: reproduza primeiro as falhas isoladas, corrija e prove também em suite.
- REM-005, REM-013 e REM-014: restaure typecheck, lint contratual, test:docs e doc-sync sem relaxar gates.
- REM-006 a REM-008: documente semântica e teste consentimento/CSP, concorrência, memória, close físico, abort e handles residuais.
- REM-009 e REM-010: fixe ações por SHA e imagens por digest; um verificador deve rejeitar referências mutáveis.
- REM-011 e REM-018: zere os grafos somente após a decisão de ownership; não esconda arestas.
- REM-012 e REM-017: valide o conteúdo real dos tarballs e a identidade de todos os pacotes.
- REM-016: investigue estado global, clocks, listeners, portas, subprocessos e teardown conforme a skill de confiabilidade de CI; não trate aumento de timeout como correção.
- REM-019, REM-024 e REM-025: idade mínima, scanner, SBOM e attestations devem ter política de exceção explícita.
- REM-020 e REM-021: remova skips incondicionais; ausência legítima de ambiente deve produzir skip rastreável.
- REM-022 e REM-026: o agregador deve falhar quando o sinal Windows falhar e todo job executável deve ter timeout proporcional.
- REM-023: a mensagem de cobertura deve corresponder exatamente ao corpus medido.
- REM-028: migre leitores síncronos de Session em ondas por owner, com equivalência observável.
- REM-029 a REM-037: aplique o padrão documental sem duplicar fatos, sem editar arquivo congelado e sem criar narração de raciocínio.

Verificação:
- Antes de cada frente, defina os testes que demonstram o defeito e a correção.
- Durante a implementação, rode o menor conjunto focado que cobre a mudança.
- Antes de qualquer push ou afirmação de checks verdes, leia e aplique .agents/skills/dsh-pre-push-checks/SKILL.md.
- Use dsh-ci-test-reliability para testes com concorrência, relógios, estado global, subprocessos, rede ou teardown.
- Use dsh-doc e dsh-prose-standard para toda alteração documental; execute os gates indicados por essas skills.
- Use dsh-archive-agent-notes ao tocar notas e dsh-trim-cot-leakage ao revisar prosa de decisão.
- Não rode a suíte completa repetidamente. Rode a matriz ampla somente no candidato integrado e selado, salvo diagnóstico que realmente exija o agregado.
- Registre somente comandos realmente executados, exit code e artefatos. Nunca diga que um gate passou por inferência.
- Testes reais dependentes de credenciais podem se autoignorar segundo a política, mas o skip deve ser explícito e o sinal externo de CI deve ficar ligado ao mesmo SHA do candidato.
- Depois de integrar todas as frentes, forme árvore limpa e commit imutável, selecione a matriz final proporcional e relacione cada resultado a REM-* e AUD-*.

Comunicação e recuperação:
- Envie atualizações curtas e regulares com marco atual, itens fechados, evidência e bloqueios reais.
- Registre toda tentativa longa no ledger. Se a mesma causa falhar três vezes, atualize a hipótese e replaneje ou escale; não repita mecanicamente.
- Se for interrompido, deixe .agent/state.json, plano, backlog e ledgers suficientes para outro agente retomar sem reconstruir o raciocínio.
- Um item só fica concluído quando implementação, documentação, teste/gate e evidência estiverem presentes. Edição de arquivo isolada não é conclusão.

Entrega final obrigatória:
1. Tabela REM-001 a REM-037 com resultado e evidência.
2. Lista de arquivos alterados por frente.
3. Decisões humanas registradas e consequências.
4. Comandos executados, resultados e sinais externos pendentes.
5. Riscos residuais e exceções com owner e prazo.
6. Reauditoria das 15 dimensões com nota 0–100 e comparação com a baseline 63/100.
7. Veredito final e SHA exato do candidato.

Comece agora pela recuperação M0. Não sobrescreva o plano ativo nem o backlog existente; reconcilie-os e avance até o resultado final, pedindo somente as decisões humanas que realmente mudam segurança, identidade pública ou compatibilidade.
```

## Nota para desenvolvimento

Se o ambiente Codex oferecer objetivos persistentes, o usuário pode cadastrar o objetivo final antes de colar o prompt. O conteúdo não depende desse recurso: a recuperação em `.agent/` continua obrigatória e suficiente para retomada.
