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

## O segundo wrapper: curar a sessão de segurança envenenada (item 89)

**Medido no S4H 758/250 em 2026-09-06.** Objetos `YJBV_POC_FG_SEC` / `YJBV_POC_FM_SECCURA` ($TMP,
**mantidos de propósito** — ver a nota no fim).

O item 28 mediu que, passado o teto de sessões de segurança HTTP **não usadas** por usuário, o canal
stateful para de nascer com `SAP_SESSIONID` e toda requisição com esse cookie dá 400 — e que quem
cura é o tempo (30 min). O item 53 achou o botão de cura instantânea
(`ABORT_SECURITY_SESSION` filtrado por `userid = sy-uname` **e** `timeout_check = 2`), mas só o
provou por **classrun** — que é ADT, que é stateful, que é justo o canal que morre. Este wrapper põe
o mesmo botão atrás de um FM RFC, e o SOAP (o único canal que sobrevive, M6 do item 28) o alcança.

```js
import { criarConexao, deployFunctionModule, buildSecuritySessionCureSource } from 'adt-client';
import { curarSessoesDeSeguranca } from 'adt-client/rfc-soap';

// UMA VEZ, com o canal ainda SAUDÁVEL (o deploy vai por ADT):
await deployFunctionModule(conexao, {
  group: 'YJBV_POC_FG_SEC', name: 'YJBV_POC_FM_SECCURA',
  source: buildSecuritySessionCureSource('YJBV_POC_FM_SECCURA'),
  description: 'cura stateless de sessões de segurança não usadas',
});

// DEPOIS, quantas vezes quiser — inclusive com o ADT morto:
const c = await curarSessoesDeSeguranca(cfg, { fm: 'YJBV_POC_FM_SECCURA' });
// { antes:20, antesNaoUsadas:15, alvos:15, abortadas:15, erros:0, depois:5, depoisNaoUsadas:0, ok:true }
await curarSessoesDeSeguranca(cfg, { fm, dryRun: true });   // só conta os alvos, não aborta
```

### Regra 1 — o FM tem que existir ANTES da quebra

`deployFunctionModule` vai por **ADT**, que é stateful. No estado doente ele não pode ser criado —
é exatamente o canal que morreu. **O wrapper é um extintor: instala-se com o prédio de pé.** Por
isso o par `YJBV_POC_FG_SEC` / `YJBV_POC_FM_SECCURA` fica no laboratório em vez de ser apagado no
fim da POC.

### Regra 2 — por SOAP, o requisitante é uma sessão NÃO USADA (por classrun, não era)

É a diferença que muda o filtro. Toda requisição stateless autenticada cria 1 sessão *não usada*
(M-c do item 53), então a chamada da cura **entra na própria lista de alvos** — situação que o
classrun do item 53 nunca viu, porque lá o requisitante é *usada*. Daí `GET_CURRENT_SESSION_CONTEXT`
no wrapper e o parâmetro `pouparCorrente`.

**Medido que abortar o próprio contexto é inofensivo:** HTTP 200, resposta completa, 287 ms, e a
requisição seguinte entra normal — o contexto já foi consumido na autenticação e o resto da
requisição não depende mais dele. Por isso o default é `pouparCorrente: false`: limpa 100%
(`depoisNaoUsadas = 0`), sem resíduo. Com `true` sobra 1 (a da própria chamada), que expira sozinha.

### A aritmética fecha exata — use-a como controle da medição

Cada leitura por SOAP **também** custa 1 não usada, e é isso que torna a conta verificável:

| passo | não usadas | por quê |
|---|---|---|
| conta antes | 7 | inclui a própria leitura |
| 12 pings SOAP | 20 | +12 pings +1 da leitura |
| cura (`ev_antes_nu`) | 21 | +1: a própria chamada da cura |
| `ev_alvos` / `ev_ok` | 20 / 20 | poupando a corrente; **0 erros** |
| conta depois | 2 | a corrente poupada + a própria leitura |

Se a conta não fechar, a medição é que está errada — não o SAP.

### Custo

**422–629 ms** por cura, contra os **30 min** de espera do `http/security_session_timeout`. É o que
faz a bisseção do teto (item 53) deixar de custar uma janela combinada e virar uma rodada de segundos.

### O que este wrapper NÃO prova

Que o **SOAP sobrevive ao teto estourado**. O M6 do item 28 mediu que o Basic sem cookie responde
200 no estado doente, mas a chamada SOAP autenticada precisa **criar** uma sessão de segurança — e
se o kernel recusar criá-la no teto, a cura não entra. Isso só se mede envenenando até o teto, que é
o item 53. **Primeira coisa a tentar quando o canal quebrar**, antes de esperar os 30 min.
