# Receita: TRAN — criar transação (SE93) sem GUI

**Validado por POC: S4H release 758, mandante 250, 2026-08-29.** Objetos `YJBV_POC_TR` (report), `YJBV_POC_TD`
(dialog), `YJBV_POC_TP` (parâmetro sobre SM30), drivers `YJBV_POC_CL_TRAN*` / `Y_TRAN_*`, todos `$TMP`, todos
removidos ao final (TSTC/TSTCT/TSTCP/TSTCC/TADIR vazios por readTable). Item 18 da fila (ideia I18). Na lib:
`tran.mjs` — `deployTransaction(conexao, { tcode, type, program, dynpro, called, params, … })` e
`deleteTransaction`. 1.254 TRAN custom na moovi (`cobertura-tadir.md`); a "SE93 manual" sai da tabela.

## O caminho que funciona (medido, E2E pela lib)

1. **Driver classrun** (`buildTransactionDriverSource`) chama **`RPY_TRANSACTION_INSERT`** (grupo `SEUK`, **não é
   RFC** — por isso driver, não SOAP): `transaction`, `shorttext` (≤ 36), `transaction_type`, `program`/`dynpro`,
   `development_class`, `called_transaction` + `called_transaction_skip` + `param_values` (tabela `RSPARAM`
   `FIELD`/`VALUE`), `html_enabled`/`wingui_enabled`/`java_enabled` (→ TSTCC), `transport_number`, `language`
   (default `SY-LANGU`). Em `$TMP` o `RS_CORR_INSERT` interno cria a **TADIR `R3TR TRAN`** sem popup. `COMMIT WORK`.
2. **`RPY_TRANSACTION_READ`** no mesmo driver devolve `TCODES` (TSTC) e `GUI_ATTRIBUTES` (TSTCC) — é o que dá o
   `CINFO` inteiro (`80` report, `00` dialog, `02` parâmetro/variante); o `RFC_READ_TABLE` trunca o RAW para um
   caractere (`8`/`0`).
3. **Assert em outra LUW** (`readTransaction`): `TSTC` (PGMNA, DYPNO, CINFO), `TSTCT` (SPRSL = idioma do logon,
   TTEXT), `TSTCP` (só parâmetro/variante: `/*SM30 VIEWNAME=V_T001;UPDATE=X;` — `/*` = pula tela inicial, `/N` não),
   `TSTCC` (S_WEBGUI `1`, S_WIN32 `X`), `TADIR` (DEVCLASS, AUTHOR, MASTERLANG).
4. **Prova de uso — a transação despacha**: `CALL TRANSACTION 'YJBV_POC_TP' … USING bdc MODE 'N'` com uma BDC
   deliberadamente errada devolveu `subrc=1001` e `S 00 344 "No batch input data for screen SAPL0ORG 0040"` — a
   tela de manutenção da `V_T001`: a transação de parâmetro entrou na SM30, pulou a tela inicial e chegou ao
   diálogo da view. Report (`RSPARAM 1000` + `/EE`) e dialog (`SAPMSVMA 0100` + `/EE`) responderam `subrc=0`.
5. **Desfazer**: **`RPY_TRANSACTION_DELETE`** (`transaction`; `suppress_*` opcionais) apaga TSTC/TSTCT/TSTCP/TSTCC e
   a TADIR (subrc 0; confirmado ausente por readTable). `deleteTransaction` faz isso e confirma.

## Tipos (constantes `ststc_c_type_*`, impressas pelo driver)

| `type` na lib | STSTC | O que a FM grava | Exige |
|---|---|---|---|
| `report` | `R` | TSTC PGMNA=programa, DYPNO **1000** (fixo), CINFO `80`; TSTCP só se `variant` | `program` |
| `dialog` | `D` | TSTC PGMNA/DYPNO como dados, CINFO `00` | `program`, `dynpro` |
| `parameter` | `P` | TSTC (PGMNA/DYPNO opcionais — a moovi deixa vazios), CINFO `02`, **TSTCP** `/*<called> F=V;…` | `called` (+ `params`, `skip`) |
| `variant` | `V` | TSTC CINFO `02`, TSTCP com a variante (`cl_independend` = variante independente de mandante) | `called`, `variant` |

Não há tipo **OO** (classe/método) nesta FM — a SE93 grava isso por outro caminho (`TSTCP` com
`\PROGRAM=…\OBJECT=…`); fica em aberto.

## Gotchas medidos

- **Não há update.** Transação existente → exceção `ALREADY_EXIST` (subrc 2, "O código de transação X já foi
  criado") e nada muda. A lib devolve `ok:true, existed:true` (a leitura confirma o que está lá) e **não** compara
  a definição; para trocar programa/parâmetros use `replace: true` — `RPY_TRANSACTION_DELETE` + INSERT no mesmo
  driver (medido: `YJBV_POC_TR` de RSPARAM para RSUSR000, `deletes[0].subrc=0`, TSTC com o programa novo).
- `shorttext` é TSTCT-TTEXT, **36 caracteres** — a lib corta.
- O idioma do texto e o `MASTERLANG` da TADIR seguem o **logon** (`P` com `SAP_S4H_LANGUAGE=PT`); passar
  `language: 'E'` grava em inglês.
- `RS_ACCESS_PERMISSION` com `authority_check` roda dentro da FM: sem `S_DEVELOP`/`S_TRANSPRT` para `TRAN` vem
  `PERMISSION_ERROR` (subrc 3) com a mensagem — não é o classrun falhando.
- **ADT não cria** (medido 2026-08-28/29): `aps/iam/tran` (sapcli) é **404** em todos os Accepts no 758 — a
  coleção é de release mais novo; `GET vit/wb/object_type/trant/object_name/SE93` responde 200 mas é o wrapper
  SAPGUI-integrado, só leitura de propriedades básicas. No SXD 816, quando voltar, medir se `aps/iam/tran`
  existe — seria a segunda via, sem driver.
- Where do `RFC_READ_TABLE` tem **72 caracteres por linha** — `TCODE IN (…)` longo dá `OPTION_NOT_VALID`; quebrar
  em várias linhas de `OPTIONS` (medido 2026-08-29).
- Sessões: o ciclo inteiro (4 `deployAndRun` + 2 `deleteObject` + `encerrar()`) deixou `TH_USER_LIST` em **0**
  sessões do usuário antes e depois — a regra das sessões (`receita-tobj-sm30.md`) segue valendo.

## Uso pela lib

```js
import { deployTransaction, deleteTransaction } from 'adt-client/tran';

// transação de parâmetro sobre a SM30 de uma tabela Z (o par natural do sm30.deployTableMaintenance)
const r = await deployTransaction(conexao, {
  tcode: 'ZMANT_MINHA', type: 'parameter', text: 'Manutenção da ZMINHA', called: 'SM30', skip: true,
  params: [{ field: 'VIEWNAME', value: 'ZMINHA' }, { field: 'UPDATE', value: 'X' }], pkg: 'ZPKG', transport: 'S4HK900123',
});
// r.ok · r.created / r.existed · r.tstc {pgmna,dypno,cinfo} · r.banco {tstc,tstct,tstcp,tadir}
await deployTransaction(conexao, { tcode: 'ZREL', type: 'report', program: 'ZREL_REPORT', replace: true });
await deleteTransaction(conexao, { tcode: 'ZMANT_MINHA' });
await conexao.encerrar();
```

O driver (`Y_TRAN_<tcode>`) é apagado ao final por default (`keepDriver: true` mantém). Exige senha no cfg
(classrun em sessão nova stateless).
