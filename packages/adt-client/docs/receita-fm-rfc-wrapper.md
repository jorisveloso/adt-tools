# Receita: criar FM RFC por ADT REST e chamá-lo por SOAP RFC (escrita sem classrun)

**Validado por POC: S4H release 758, mandante 250, 2026-08-26.** Objetos `YJBV_POC_FG*` /
`YJBV_POC_FM_BDC*` ($TMP, criados e apagados na POC).
**Re-validado em sistema de cliente: SXD (KART) release 816, mandante 100, 2026-08-26** —
`deployFunctionModule` + wrapper BDC: FMODE='R' confirmado na TFDIR, VA03 com doc inexistente
devolveu `EV_SUBRC=1001` e msg `E V1 302` por SOAP, igual ao laboratório. É o canal de **escrita** para sistemas
**sem classrun** (basis < 7.52): um function module remote-enabled criado pela lib vira chamável
por HTTP puro (`rfc-soap.callFunction`), sem SDK, sem Eclipse.

## O fluxo (`deployFunctionModule` em `adt-client.mjs`)

```js
import { criarConexao, deployFunctionModule, buildBdcWrapperSource } from 'adt-client';
import { callFunction, xmlField, xmlItems } from 'adt-client/rfc-soap';

await deployFunctionModule(conexao, {
  group: 'YJBV_FG_X', name: 'YJBV_FM_BDC', source: buildBdcWrapperSource('YJBV_FM_BDC'),
  description: 'wrapper BDC', // rfc: true por default
});
// depois, chamada por SOAP RFC (outra requisição/LUW):
const { xml } = await callFunction(cfg, 'YJBV_FM_BDC', {
  IV_TCODE: 'VA03', IV_MODE: 'N',
  IT_BDCDATA: [ { PROGRAM:'SAPMV45A', DYNPRO:'0102', DYNBEGIN:'X' },
                { FNAM:'VBAK-VBELN', FVAL:'9999999999' }, { FNAM:'BDC_OKCODE', FVAL:'/00' } ],
  ET_MSGS: [],
});
xmlField(xml, 'EV_SUBRC');        // '1001'
xmlItems(xml, 'ET_MSGS');         // [{ MSGTYP:'E', MSGID:'V1', MSGNR:'302', MSGV1:'9999999999', … }]
```

`deployFunctionModule` cria o FUGR se faltar, cria/atualiza o FM, ativa **pela URI do FM**, e
devolve `{ created, activated, rfc, activate }`. Idempotente. Nunca deleta.

## Os três gotchas — todos de falha SILENCIOSA

1. **`processingType="rfc"` do create shell é DESCARTADO.** O POST de create grava o FM como
   `"normal"` (FMODE vazio na `TFDIR`) e ignora o RFC do body — igual ao DE/domínio, onde o create
   só grava a parte técnica. **Só um PUT do METADATA com lock persiste o RFC**, e ele tem que vir
   **antes** do PUT do source. Sintoma se esquecer: a chamada SOAP dá **HTTP 500 "XML kernel
   processor cannot prepare function call (kernel rc=9)"** — exatamente o erro de FM **não**-RFC.
   Confirmar com `readTable(cfg,'TFDIR',{campos:['FUNCNAME','FMODE'],where:["FUNCNAME='<FM>'"]})`
   → `FMODE = 'R'`.
2. **Assinatura source-based sem ponto após o nome.** `FUNCTION nome` (sem ponto) seguido de
   `IMPORTING … EXPORTING … TABLES … .` com o ponto só depois do **último** parâmetro. Com
   `FUNCTION nome.` os params não registram (quebra só em runtime: `CX_SY_DYN_CALL_PARAM_NOT_FOUND`).
   Parâmetro TABLES declara-se com **`LIKE <estrutura>`**, não `STRUCTURE` — um
   `it_bdcdata STRUCTURE bdcdata` no PUT dá `400 … "Parameter IT_BDCDATA deklariert keinen Typen"`.
   (Molde: o source do `RFC_READ_TABLE` usa `tables options like rfc_db_opt`.)
3. **Ativar pela URI do FM, não do FUGR.** Referenciando o FUGR: `activationExecuted="false"`,
   no-op silencioso. `deployFunctionModule` já ativa o FM.

## Gotcha de ambiente: lock preso de um create que morreu

Se um script morre entre o `lock` do FM e o `unlock` (ex.: PUT deu 400 e `process.exit`), o
ENQUEUE fica preso e o próximo `lock` dá `403 "Usuário … já está processando <FM>"`. `ENQUE_DELETE`
**não é RFC-enabled** (dá o mesmo kernel rc=9 pelo SOAP), então libera-se por **classrun**, com
`CALL FUNCTION 'ENQUEUE_READ'` + `'ENQUE_DELETE'` **locais** (CALL FUNCTION local não exige RFC):
filtrar o `SEQG3` por `GARG` = nome do objeto e devolver a linha ao `ENQUE_DELETE`. Medido
`subrc=0`. (Em sistema sem classrun, o mesmo se faz na SM12.)

## Por que isto importa no arsenal

O canal SOAP RFC lê e chama BAPI, mas **BAPI de escrita por ele não persiste** (cada POST é uma LUW
própria — ver `receita-ciclo-escrita-verificacao.md`). O wrapper RFC resolve os dois casos onde não
há classrun: **BDC** (`CALL TRANSACTION` dentro do FM) e **BAPI+COMMIT numa LUW única** (basta o
wrapper chamar a BAPI e o `BAPI_TRANSACTION_COMMIT` no próprio corpo). O FM roda tudo numa LUW só,
e o COMMIT persiste.
