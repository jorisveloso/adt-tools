# Receita: VIEW clássica (SE11) sem GUI — a que o item 12 declarou impossível

**Validado por POC: S4H release 758, mandante 250, 2026-09-01.** Tabelas `YJBV_POC_V45_A`/`_B`, views
`YJBV_POC_V45_V` (banco) e `YJBV_POC_V45_M` (manutenção), drivers `YJBV_POC_CL_V45*`, todos `$TMP`.
Item 45 da fila (ideia I57). Na lib: **`view.mjs`** — módulo de **canal**, não de tipo, porque o create
não é ADT-shaped: é FM num driver classrun, como o `sm30.mjs` e o `tran.mjs`.

O item 12 mediu que **`ddic/views` do ADT é o recurso de view EXTERNA (HANA)** — GET de view clássica
dumpa `ASSERTION_FAILED` em `CL_DDIC_WB_XVIEW_PERSIST`, POST exige `qualifiedHanaViewName`. Isso
**continua verdade**. O que mudou é que existe outra via, e ela não é a que a fila apostava.

## O desmentido que custou metade da POC: `RPY_VIEW_INSERT` não serve

A ideia I57 apostava nele porque a fila 38 mediu que `RPY_VIEW_INSERT`/`_READ`/`_UPDATE`/`_DELETE` são
todos **`FMODE='R'`** (chamáveis por SOAP) — "uma chamada, sem driver". O FMODE está certo; a conclusão
não. **O INSERT dumpa em qualquer canal sem GUI:**

```
RPY_VIEW_INSERT (LSIFDU38:113)
  → RS_CORR_INSERT (LSEUQU04:261)
    → TRINT_CORR_INSERT → TRINT_OBJECTS_CHECK_AND_INSERT (LSTRDU50:2270)
      → TRINT_TADIR_POPUP → DYNPRO_SEND_IN_BACKGROUND
```

A causa está no `RS_CORR_INSERT` (LSEUQU04:218-259): o caminho mudo exige `devclass(1)='$'` **e**
`activation_call`, **ou** `genflag`; sem um desses ele chama `TRINT_CORR_INSERT` com `iv_dialog='X'`.
E o `RPY_VIEW_INSERT` chama o `RS_CORR_INSERT` **sem `suppress_dialog`, sem `activation_call` e sem
`genflag`** — não há parâmetro por onde calar o popup. Medido nos DOIS canais:

| Canal | Resultado |
|---|---|
| SOAP RFC puro | SOAP Fault `Internal Server Error`; dump `DYNPRO_SEND_IN_BACKGROUND` |
| driver classrun | HTTP 500; o mesmo dump |

Passar `DEVELOPMENT_CLASS = '$TMP'` **não evita** — no dump, `WI_MESSAGE_ENTER_DEVCLASS='X'` e
`WI_NO_TADIR='X'`. `$TMP` só escapa quando vem acompanhado de `activation_call` ou `genflag`, e o
`RPY_VIEW_INSERT` não passa nenhum dos dois.

**Consequência para a lib:** `RPY_VIEW_INSERT` fica fora. O `RPY_VIEW_DELETE`, não — ver abaixo.

## A via que funciona: DDIF, num driver

Três FMs, nenhuma delas RFC (`TFDIR.FMODE=''`), logo **driver classrun**:

1. **`DDIF_VIEW_PUT`** — grava a view (DD25V header + DD26V tabelas + DD27P campos + DD28J join).
2. **`TR_TADIR_INTERFACE`** — a linha da TADIR, que o PUT **não** escreve.
3. **`DDIF_VIEW_ACTIVATE`** — ativa. `rc=0` limpo, `rc=4` **aviso** (a view fica ativa), `rc>=8` falhou.

```js
import { deployView, readView, deleteView } from 'adt-client/view';

const r = await deployView(conexao, {
  name: 'YJBV_POC_V45_V',
  description: 'view de banco A x B',
  viewClass: 'database',              // 'database' (D) | 'maintenance' (C)
  viewGrant: 'R',                     // R = só leitura (o da V_USR_NAME)
  tables: ['YJBV_POC_V45_A', 'YJBV_POC_V45_B'],   // a 1ª é a raiz, salvo `rootTable`
  fields: [
    { name: 'MANDT',  table: 'YJBV_POC_V45_A', field: 'MANDT',  key: true },
    { name: 'ID',     table: 'YJBV_POC_V45_A', field: 'ID',     key: true },
    { name: 'SEQ',    table: 'YJBV_POC_V45_B', field: 'SEQ',    key: true },
    { name: 'TITULO', table: 'YJBV_POC_V45_A', field: 'TITULO' },
    { name: 'VALOR',  table: 'YJBV_POC_V45_B', field: 'VALOR' },
  ],
  joins: [                            // vira DD28J; sem isto, duas tabelas = produto cartesiano
    { leftTable: 'YJBV_POC_V45_A', leftField: 'MANDT', rightTable: 'YJBV_POC_V45_B', rightField: 'MANDT' },
    { leftTable: 'YJBV_POC_V45_A', leftField: 'ID',    rightTable: 'YJBV_POC_V45_B', rightField: 'ID' },
  ],
});
// r.ok, r.aviso (rc=4), r.banco.{dd25l,tabelas,campos,tadir,texto}
```

O mesmo `deployView` **altera a view ATIVA** — não há "update" separado: o PUT sobrescreve e o
ACTIVATE republica (medido tirando um campo e trocando o texto).

## Onde cada coisa mora (anatomia medida)

| Peça | Estrutura do PUT | Tabela ativa |
|---|---|---|
| cabeçalho | `DD25V` (`AGGTYPE='V'`, `VIEWCLASS`, `ROOTTAB`, `AUTHCLASS='00'`, `VIEWGRANT`) | `DD25L` + `DD25T` (texto) |
| tabelas base | `DD26V` (`TABPOS`; `FORTABNAME` só na raiz) | `DD26S` |
| campos | `DD27P` (`OBJPOS`, `VIEWFIELD`, `TABNAME`, `FIELDNAME`, `KEYFLAG`) | `DD27S` |
| **join** | **`DD28J`** (`LTAB`/`LFIELD`/`RTAB`/`RFIELD`, `OPERATOR`, `SOURCE='S'`) | `DD28J` |
| condição de seleção | `DD28V` (`CONDNAME` — não `VIEWNAME`) | `DD28S` |

**`DD28J` e `DD28V` andam em par.** No fonte do `DDIF_VIEW_PUT`: passar uma sem a outra levanta
`view_inconsistent` (subrc 3) — e a exceção não diz qual falta. O módulo passa as duas (a DD28V vazia)
quando há join, e **nenhuma** quando a view tem uma tabela só. A mesma regra vale para `DD35V`/`DD36M`.

A `RPY_VIEW_READ` (essa sim, útil por SOAP) devolve o join numa forma **diferente**: pares de linhas
`RPY_VISC` com `NEGATION='JL'`/`'JR'` consecutivos. É representação legada — quem escreve usa a DD28J.
E as tabelas de um FM chamado por SOAP só voltam preenchidas se o envelope as **declarar** (`VIEW_FIELDS: []`).

## Apagar: `RPY_VIEW_DELETE` por SOAP puro

Aqui a família RPY entrega o que prometia. **Ao contrário do INSERT, o DELETE não passa pelo popup** —
roda por SOAP RFC, sem driver e sem sessão ADT, e limpa **a view e a linha da TADIR**:

```js
const d = await deleteView(cfg, 'YJBV_POC_V45_V');   // só o cfg — não precisa de conexão ADT
```

Alternativa medida por driver: `RS_DD_DELETE_OBJ` com `objtype='V'`, `objname=<view>`, **`no_ask='X'`**
(subrc 0; view e TADIR somem). Ele tem exceção `dialog_needed`, ou seja é desenhado para modo mudo — mas
custa um driver, então só vale quando já se está dentro de um.

## Gotchas

- **Depois de ativar, não leia a view na mesma sessão.** `SELECT` dela no driver que acabou de reativá-la
  roda o **load antigo** e dumpa (HTTP 500) — o mesmo gotcha da classe recém-ativada. Isolado por
  contraprova: o mesmo driver sem o `SELECT` devolve 200. Ler é em outra LUW (`readView`, `readTable`,
  `dataPreview`), e é lá que o assert vale.
- **`DD25V-GLOBALFLAG` é descartado em silêncio** pelo `DDIF_VIEW_PUT`: passa `'X'`, a ativação é limpa,
  e a `DD25L` volta com o campo **vazio**. É o "status de manutenção" da SE11 — e é o que falta para a
  SM30 aceitar a view (ver abaixo).
- **Campo de tipo built-in entra sem `ROLLNAME`** (`abap.numc(4)`) e ativa igual — as views SAP têm
  `ROLLNAME` porque as tabelas delas usam data element, não porque a view exija.
- O nome da view **não** precisa começar por letra especial (ao contrário do lock object da fila 12, que
  exige `E`): `YJBV_POC_V45_V` foi aceito direto.

## O par com a fila 17 (SE11 → SE54 → SM30): metade fechada

A view de **manutenção** (`viewClass: 'maintenance'`) nasce e ativa (com `rc=4`, aviso). Sobre ela, o
`deployTableMaintenance` da fila 17 **gera o diálogo**: `TVDIR` (`AREA`, `TYPE=1`, `LISTE=0001`,
`BASTAB='X'`), `TDDAT`, pool e FMs — `GEN_RESULT tvdir=C pool=E ffunc=C pfunc=C dynp1=C`.

**Mas a SM30 recusa manter**: BDC de `SM30` sobre a view devolve `E SV 792` — *"View/table & can only be
displayed and maintained with restrictions"*. Descartado por medição que a causa fosse a tabela base:
com `@AbapCatalog.dataMaintenance : #ALLOWED` (`DD02L-MAINFLAG='X'`) a mensagem é a mesma. A diferença
que sobra contra uma view mantível de verdade (`V_T001`) é o **`GLOBALFLAG='X'`** — justamente o campo
que o `DDIF_VIEW_PUT` descarta. **Ponto aberto:** por onde se grava o status de manutenção sem GUI
(ideia I62). Até lá, a view de manutenção sai pela lib, mas quem a mantém é a SE11.

## O que ficou fora

- Condição de seleção (`DD28V` com constante) — a estrutura está no caminho, não foi exercitada.
- View de projeção, view de ajuda (`SHLP`) e view externa/HANA.
- View **transportável**: `transport` é repassado ao `TR_TADIR_INTERFACE`, mas só `$TMP` foi medido.
- Ativação com erro real (`rc>=8`) — o parser trata, não houve amostra.
