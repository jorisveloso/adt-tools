# Receita: ciclo arrange → act → assert cruzando canais (teste de integração do arsenal)

**Validado por POC: S4H release 758, mandante 250, 2026-08-26.** Objetos `YJBV_POC_TB_LOG` e
`YJBV_POC_CL_WRITE` ($TMP).
**Re-validado em sistema de cliente: SXD (KART) release 816, mandante 100, 2026-08-26** — ciclo
completo (deploySource tabela → deployAndRun driver com INSERT+COMMIT → readTable em outra LUW
achou a linha exata); objetos $TMP apagados ao final. É o esqueleto de qualquer teste de integração dirigido pelo agente:
cada fase usa o canal mais adequado, e a verificação acontece em OUTRA LUW — o que ela enxerga
está de fato no banco.

## O ciclo

1. **ARRANGE — ADT**: `deploySource` cria/ativa a tabela ($TMP) com DDL `define table`.
   Gotchas de tabela (nomes reservados DATA/DATE/TIME, 16 chars) na recipe de tabela do consumidor.
2. **ACT — classrun**: `deployAndRun` sobe a classe driver que faz o trabalho e comita:
   ```abap
   INSERT yjbv_poc_tb_log FROM @ls_linha.
   DATA(lv_subrc) = sy-subrc.
   COMMIT WORK AND WAIT.
   out->write( |WRITE_RESULT subrc={ lv_subrc } id={ ls_linha-id }| ).
   ```
   A saída carrega o subrc E a chave gerada — é ela que a fase 3 procura.
3. **ASSERT — SOAP RFC**: `readTable(cfg, 'YJBV_POC_TB_LOG', { where: ["ID = '<id>'"] })`
   em outra requisição/LUW. Linha encontrada com os valores esperados = teste verde.

Resultado da POC: `subrc=0`, e o readTable devolveu exatamente a linha
(`TEXTO = "escrito pelo agente via classrun"`, DATUM/UZEIT do momento da escrita).

## Por que cruzar canais importa

- O assert por outra LUW prova que o COMMIT aconteceu — um SELECT dentro do próprio driver
  enxergaria a linha ainda não comitada.
- **✅ MEDIDO (S4H 758, 2026-08-26): BAPI de escrita + `BAPI_TRANSACTION_COMMIT` em DUAS
  chamadas SOAP RFC separadas NÃO persiste.** Experimento com `BAPI_FLBOOKING_CREATEFROMDATA`
  (objeto `YJBV_POC_CL_BAPI`, $TMP): a 1ª chamada devolveu booking `00007197` e RETURN limpo;
  a 2ª (`BAPI_TRANSACTION_COMMIT` com `WAIT=X`) devolveu ok — e o readTable no SBOOK achou
  ZERO linhas. Cada POST é um contexto/LUW próprio: o update task registrado morre com o
  contexto, e a armadilha é SILENCIOSA (todas as respostas dizem "ok").
- **✅ O caminho que funciona: BAPI + COMMIT dentro de UM driver classrun (uma LUW).** O mesmo
  experimento, no driver (`CALL FUNCTION 'BAPI_FLBOOKING_CREATEFROMDATA' …` seguido de
  `CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'`), persistiu: booking
  `00007198` encontrado pelo readTable em outra LUW, com todos os valores esperados.
  Em sistemas sem classrun (basis < 7.52), o equivalente é um wrapper Z único remote-enabled.

## O DELETE também se prova (item 80/I99 — medido 2026-09-02, S4H 758, mandante 250)

O "HTTP ok não é sucesso" alcança o delete, e a lib pagou para ver (item 78): com o ADT stateful
do s4h caído (todo GET responde **400 HTML** "Service nicht erreichbar"), o `deleteObject` antigo
lia o 400 do GET inicial como "não existe" e devolvia `{ deleted:false, status:404 }` — **sem
lançar, com status forjado e sem nunca mandar o DELETE**. O teardown só percebeu porque confere
tabelas. Reproduzido contra um ICM de mentira (127.0.0.1) e fechado na lib:

- **Só 404 explícito é "não existe".** GET inicial com qualquer outro status ≠ 200 → lança
  ("não deu para confirmar a existência"), antes de qualquer escrita.
- **Depois do DELETE, a ausência é conferida por GET STATELESS** (leitura stateless sobrevive ao
  stateful caído — medido 2026-08-30): 404 = apagado (`verificado:true`); 200 = o DELETE mentiu →
  lança "AINDA EXISTE"; outro status → lança "inconclusivo". Custo medido: **52–66 ms** por delete
  (domain, classe, pacote — caminho feliz).
- **O caso transportável não dá falso alarme**: delete de pacote com `corrNr` deixa
  `TADIR DELFLAG='X'` pendente de viajar, e mesmo assim o GET pós-delete devolve **404**
  (`verificado:true`) — a conferência lê o objeto, não a marca de transporte (medido com
  `YJBV_POC80T`, TR gerada e desfeita na mesma POC).
- `verificar: false` pula a conferência — e o retorno diz isso (`verificado:false`).

Testes: `adt-client.test.mjs` (os dois cenários da mentira + caminho feliz, contra ICM local).

## Gotchas da BAPI de voo (para reproduzir o experimento)

- `BAPISBONEW`: o campo é `CONNECTID` (não `CONNECTIONID`) — e o serializer SOAP IGNORA campo
  desconhecido em silêncio: a BAPI respondeu booking `00000000` com RETURN VAZIO, sem erro.
  Conferir os nomes contra a estrutura antes de culpar o canal.
- A BAPI exige voo com data FUTURA e `AGENCYNUM` (ou counter) válidos — senão RETURN tipo E
  ("Flight date … is in the past", "No travel agency or counter passed").

## Gotchas herdados

- `deployAndRun` roda a classe em SESSÃO NOVA (load antigo é preso à sessão do deploy —
  ver canal-classrun.md).
- Redeploy com fonte IDÊNTICO: o servidor não executa ativação (`activationExecuted="false"`,
  zero mensagens) e isso NÃO é erro — `deployAndRun` já trata.
