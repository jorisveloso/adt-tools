# PLANO — v1 do sap-note (leitor + aplicador assistido de notas SAP)

## Objetivo
Conectar ao sistema onde as notas estão sendo aplicadas, ler do Note Assistant (SNOTE,
dentro do SAP) quais notas precisam de aplicação, e apoiar a aplicação — executando pela
lib jbv-adt-client os passos manuais onde o veredito é `AGENTE` (com assert por readTable);
onde `MANUAL (hoje)`, informar o usuário e registrar a lacuna como demanda na lib.

## Decisões travadas
- **Sistema-alvo: dado no uso** (alias SID via SAP GUI landscape + `sistemas.json`, senha
  perguntada na hora). Nada hardcoded. Reads sempre no sistema onde as notas serão aplicadas.
- Notas/status: Note Assistant do sistema-alvo (canal a medir no spike).
- Conteúdo dos passos manuais: diretório `sap-note/notas/` (PDF/texto da nota; `.md`
  estruturado quando útil). Hoje sem S-user; no futuro, portal SAP.
- Forma da entrega: (c) spike de leitura primeiro → decisão módulo `notes.mjs` na lib ×
  consumidor no sap-note sai da medição.
- Interface: mista — agent-driven primária (skills) + CLI de operação/verificação
  (estilo devops.mjs).
- Capacidade: skill `adt-capacidade` (em ~/.claude/skills; se não registrar, seguir o
  arquivo: C:\Users\joris.barrozo.veloso\.claude\skills\adt-capacidade\SKILL.md).
  Pergunta em linguagem natural fiel ao passo (incluindo "salvar e ativar" — gate
  escondido mora aí). Resposta: UMA linha por passo:
  AGENTE · AGENTE (não provado) · MANUAL (hoje) · MANUAL <limite>.
- Lacuna não coberta: **apender** em `jbv-adt-client\docs\demandas.md` (append-only,
  formato do cabeçalho do arquivo: nota · "passo fiel" · veredito · projeto/AAAA-MM-DD
  + linha "fontes:"). NÃO numerar I<n>, NÃO editar ideias.md/fila.md. Repetição da mesma
  lacuna = contagem de dor (apender de novo). Triagem é do fluxo da lib.
- Capacidade NUNCA mede/toca sistema SAP — só leitura das fontes da lib (docs/tipos.md,
  skill adt-objetos, cobertura-tadir.md, ideias.md/fila.md via grep de duplicata,
  docs/receita-*.md, módulos *.mjs).

## Etapas
1. **Spike de leitura do Note Assistant** (só leitura, dataPreview/readTable):
   mapear tabelas de fila e status de nota (proposta/aplicada) no sistema-alvo.
   Saída decide `notes.mjs` na lib × consumidor.
2. **Via de conteúdo**: ler a nota 3751960 de `sap-note\notas\NOTA_3751960_E_20260901.pdf`
   e extrair a seção Manual Activities.
3. **Decomposição → viabilidade**: por passo manual, consultar adt-capacidade
   (1 linha/veredito); não coberto → apender em demandas.md.
4. **Plano de aplicação**: montar plano (passos AGENTE + operação da lib + assert),
   apresentar ao usuário, aprovar, executar com guard-rails da lib
   (assertZY, unlock em finally, activate após unlock, readTable como assert).
5. **Caso de teste v1 = nota 3751960**: passo "SFP → substituir layout pelo XML anexo,
   salvar e ativar" → veredito esperado `MANUAL (hoje)` (já registrado em demandas.md,
   triagem → I82). A v1 demonstra o fluxo inteiro e a resposta honesta "ainda não executável".

## Ferramentas/skills que o sap-note consome
- adt-capacidade (veredito de passo)
- abapgit / adt-objetos (entrega de objeto SAP) — quando um passo for AGENTE via deploy
- sap-testes (prova por medição) — spike e assert
- todo (fila da lib, se aplicar à evolução da própria lib)
- jbv-adt-client (dependência; a lib é a fonte da capacidade)

## Não fazer
- Não fixar sistema-alvo no código/design.
- Não registrar lacuna em backlog do sap-note — lacuna vai para demandas.md da lib.
- Não numerar ideia na resposta da skill; o formato é 1 linha de veredito.
- Não medir sistema para responder capacidade.

## Status
- Aprovado pelo Joris em 2026-09-01.