# Receita: BDC dirigido pelo agente via classrun (sem GUI, sem RFC SDK)

**Validado por POC: S4H release 758, mandante 250, 2026-08-26.** Classe `YJBV_POC_CL_BDC` ($TMP),
transação VA03 (exibição — risco zero), documento inexistente de propósito.

## O padrão

Classe driver `if_oo_adt_classrun` criada/ativada pelo agente via `deploySource` e executada
pelo canal classrun (ver `canal-classrun.md`):

```abap
METHOD if_oo_adt_classrun~main.
  DATA lt_bdc   TYPE TABLE OF bdcdata.
  DATA lt_msgs  TYPE TABLE OF bdcmsgcoll.
  DATA lv_text  TYPE string.

  lt_bdc = VALUE #(
    ( program = 'SAPMV45A' dynpro = '0102' dynbegin = 'X' )
    ( fnam = 'VBAK-VBELN' fval = '9999999999' )
    ( fnam = 'BDC_OKCODE' fval = '/00' ) ).

  CALL TRANSACTION 'VA03' WITH AUTHORITY-CHECK
       USING lt_bdc MODE 'N' UPDATE 'S'
       MESSAGES INTO lt_msgs.

  out->write( |BDC_RESULT subrc={ sy-subrc } msgs={ lines( lt_msgs ) }| ).
  LOOP AT lt_msgs INTO DATA(ls_m).
    MESSAGE ID ls_m-msgid TYPE 'S' NUMBER ls_m-msgnr
      WITH ls_m-msgv1 ls_m-msgv2 ls_m-msgv3 ls_m-msgv4 INTO lv_text.
    out->write( |MSG { ls_m-msgtyp } { ls_m-msgid } { ls_m-msgnr } dynpro={ ls_m-dyname },{ ls_m-dynumb } · { lv_text }| ).
  ENDLOOP.
ENDMETHOD.
```

`MODE 'N'` = sem GUI. `MESSAGES INTO` devolve a BDCMSGCOLL completa; o `MESSAGE ... TYPE 'S' ... INTO`
resolve o texto sem emitir nada.

## O loop se autocorrige (medido)

1ª rodada com `dynpro = '0101'` (chute errado): `subrc=1001`, msg `S 00 344` —
*"Dados de batch input para a tela SAPMV45A **0102** não existem, SAPMV45A 0101 previsto"* —
**a mensagem de erro diz qual é a tela certa.** Corrigido para `0102`: `subrc=1001`, msg
`E V1 302` — *"O documento SD 9999999999 não existe"* — a mensagem de NEGÓCIO esperada,
provando o fluxo inteiro (tela aceita → campo preenchido → ENTER processado → erro de negócio
estruturado de volta). O agente lê `msgtyp/msgid/msgnr/texto` e decide sozinho.

## Gotchas

- Tela inicial da VA03 no S/4 758: `SAPMV45A 0102` (não 0101, como em receitas antigas da internet).
- Retry pós-deploy do classrun pode precisar de MAIS de 1s (medido: uma rodada precisou de ~2 retries
  de 3s). Loop de retry com backoff enquanto o body começar com `Error:`.
- `WITH AUTHORITY-CHECK` explícito — a forma sem cláusula é obsoleta em ABAP moderno.
- Limite intrínseco de BDC: telas com controles (ALV Grid etc.) não são alcançáveis — validar
  transação a transação.
- BDC só existe on-premise (BTP ABAP Environment não tem dynpro).
