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

## O par `tran` + WebGUI — ver e DIRIGIR um objeto de diálogo sem GUI

**Provado ponta a ponta no SXD 816, mandante 100, em 2026-09-03** (POC 4029823, transação
`YJBV4029823` sobre o report `YJBV_POC_R_4029823_J1B1N`, `$TMP`). É a única combinação do arsenal
que **roda e mostra** um objeto de DIÁLOGO — dynpro, Writer, tela de seleção — sem SAP GUI
instalado e sem ninguém na frente da tela.

**Por que os outros canais não servem:** o classrun **dumpa** ao tentar mandar dynpro
(`DYNPRO_SEND_IN_BACKGROUND` — [receita-dumps-st22.md](receita-dumps-st22.md)); o BDC é cego (devolve
`BDCMSGCOLL`, não vê a tela); o GUI Scripting exige SAP GUI instalado e **sessão de diálogo já
logada e visível** ([receita-gui-scripting.md](receita-gui-scripting.md)). Sobra o WebGUI — e o
WebGUI só entra numa tela por **transação** (`~transaction`). Se o objeto não tem transação, esta
receita **cria uma, descartável**.

### O ciclo inteiro

```js
import { deployTransaction, deleteTransaction } from 'adt-client/tran';
import { abrirNavegador, abrirTransacao, lerTela, preencher, acionar, print } from 'adt-client/webgui';

const TCODE = 'YJBV4029823';                    // Y/Z obrigatório (assertZY), ≤ 20 caracteres

// 1. a transação descartável — TSTCC S_WEBGUI vem 1 pelo default `gui.html`
const t = await deployTransaction(conexao, {
  tcode: TCODE, type: 'report', program: 'YJBV_POC_R_4029823_J1B1N',
  text: 'POC 4029823 - copia NF pela J1B1N', pkg: '$TMP',
});
if (!t.ok) throw new Error(`transação não nasceu: ${t.msg}`);
// medido: t.tstc {pgmna:'YJBV_POC_R_4029823_J1B1N', dypno:'1000', cinfo:'80'} · t.gui.webgui '1'
// t.banco.tadir.DEVCLASS '$TMP' — readTransaction em OUTRA LUW

const s = await abrirNavegador(cfg);
try {
  // 2. entrar já na tela final: parâmetro da tela de seleção + fcode
  await abrirTransacao(s, TCODE, { parametros: { P_DOCNUM: 71 }, okcode: 'ONLI' });

  // 3. ler, preencher, acionar (§ receita-webgui.md)
  const tela = await lerTela(s);                 // cada campo traz `id`, `sid`, `campo` e `rotulo`
  const data = tela.campos.find((c) => c.rotulo === 'Data documento');   // o nome sai da TELA
  await preencher(s, { id: data.id }, '03.09.2026');
  const r = await acionar(s, 'Gravar');         // btn[11]
  if (!r.mudou) throw new Error('a tela não respondeu');
  await print(s, 'tela.png');
} finally {
  await s.fechar();                             // a saída do canal é FECHAR — não há fcode de saída
  await deleteTransaction(conexao, { tcode: TCODE });   // 4. a transação é OBJETO: não fica de lixo
}
```

**O assert não está aí:** statusbar e print não provam nada — no SXD a NF `0000000082` foi
confirmada em outra LUW por `dataPreview`
([receita-ciclo-escrita-verificacao.md](receita-ciclo-escrita-verificacao.md)).

### As cinco regras deste par (medidas)

1. **`type: 'report'` fixa `DYPNO 1000` e `CINFO 80`** — e o fcode da primeira tela de uma transação
   de report é **`ONLI`** (a tela de SELEÇÃO). Não é o fcode da SE38/SA38, que é `STRT`
   ([receita-webgui.md](receita-webgui.md) § *Entrar na tela já preenchida*).
2. **O nome do parâmetro na URL é o SID da dynpro, não o do código.** Nome errado é ignorado
   **calado** e, com `DYNP_OKCODE` junto, o fcode dispara com a tela vazia. Quem sabe o nome certo é
   `lerTela(s).campos[].campo`.
3. **`html_enabled` é o default da lib** (`gui = {}` → `html: true` → `TSTCC S_WEBGUI = 1`) e o
   driver imprime o que gravou (`t.gui.webgui`). ⚠ **Não medido**: a contraprova — se o ITS de fato
   **recusa** uma transação com `S_WEBGUI` desligado. Trate como pré-requisito a conferir, não como
   fato. (Item 29 da fila `adt-client`.)
4. **Não há via de saída pelo WebGUI** (`btn[15]`, `btn[12]`, `Shift+F3` postam e reabrem a mesma
   dynpro). A transação fica **aberta na sessão de diálogo** até o `s.fechar()`. Fluxo que precisa
   sair *sem gravar* é GUI Scripting.
5. **Apagar é parte da receita, não pós-venda.** `deleteTransaction` (`RPY_TRANSACTION_DELETE`)
   remove TSTC/TSTCT/TSTCP/TSTCC **e a TADIR**, e confirma a ausência por `readTable` (medido
   2026-08-29, S4H 758/250). O driver `Y_TRAN_*`/`Y_TRAND_*` também sai sozinho (`keepDriver: false`
   é o default). No sistema do cliente isto **não é opcional** — a transação é um objeto de repositório
   e fica visível na SE93 de todo mundo.

### O que este par NÃO resolve

- **Objeto que não é executável por transação** — não há tipo OO em `RPY_TRANSACTION_INSERT` (§ Tipos).
  Para um método, o caminho é embrulhar num report `$TMP` e apontar a transação para ele — foi o que a
  POC 4029823 fez (`YJBV_POC_R_4029823_J1B1N` chama `J_1B_NF_OBJECT_EDIT`).
- **Sistema sem o nó ICF do WebGUI ativo** — `sondarWebgui(cfg)` responde isso **antes** de subir
  Chrome nenhum, e ausente × desativado são o mesmo 404 ([receita-webgui.md](receita-webgui.md)).
- **Ambiente onde criar objeto custa caro** — o `$TMP` é o que torna a transação descartável barata (o
  `RS_CORR_INSERT` interno passa sem popup, medido). Fora dele entra `transport`, e a criação deixa de
  ser um detalhe do teste — o que acontece em pacote transportável **sem** `transport` não foi medido.
