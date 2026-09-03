# Receita — o assert por LOG DE APLICAÇÃO (BAL / SLG1)

**Validado por POC: S4H release 758, mandante 250, 2026-08-31.** Cobaias `YJBV_POC_LOG29` (objeto de
log) e as classes `YJBV_POC_CL_BAL29*` / `YJBV_BAL_*` em `$TMP`, todas removidas ao final (TADIR,
BALOBJ, BALSUB e BALHDR vazias para o nome da POC; nenhuma sessão do usuário em `TH_USER_LIST` ao
final). E2E pela lib: **15/15 PASS**. Item 29 da fila (ideia I6). Na lib:
[`bal.mjs`](../bal.mjs) (export `adt-client/bal`) e
[`tipos/applicationLogObject.mjs`](../tipos/applicationLogObject.mjs).

**O que a receita entrega:** cobrar do log de aplicação o que o código DISSE que fez — inclusive
quando o canal respondeu 200 e o teste passaria. **O que ela não entrega:** ler log de arquivo
(`BAL_ARCHIVE_*`, fora de escopo) nem a árvore de contexto/parâmetros da mensagem.

---

## O terceiro assert

| pergunta | quem responde |
|---|---|
| o act morreu? | [`dumps.mjs`](receita-dumps-st22.md) — a ST22 |
| o dado mudou? | `readTable` em outra LUW — [ciclo escrita/verificação](receita-ciclo-escrita-verificacao.md) |
| **o que o código DISSE?** | **este módulo — a SLG1** |

Processo SAP de verdade — carga, interface, job, BAdI — **não devolve erro ao chamador**: escreve no
log de aplicação e segue com `subrc = 0`. Sem ler o log, o E2E fica verde sobre uma carga que
rejeitou metade das linhas.

---

## Por que um módulo, e não um `readTable`

Duas medições fecham o caminho fácil:

1. **Nenhum FM `BAL_*` é RFC.** Os 100+ do grupo — `BAL_DB_SEARCH`, `BAL_DB_LOAD`,
   `BAL_LOG_MSG_READ`, `BAL_DB_SAVE`, `BAL_DB_DELETE` — têm `TFDIR-FMODE` **vazio**. O canal SOAP
   RFC não alcança nenhum; sobra o classrun.
2. **O cabeçalho é SQL; a mensagem não é.** A `BALHDR` é transparente (172.824 linhas no s4h) e o
   `dataPreview` a lê inteira. As mensagens *deveriam* estar na `BALM` — que tem **0 linhas**: elas
   moram comprimidas na **`BALDAT`** (`CLUSTD`, LRAW 512, um cluster INDX com 683.289 linhas), que o
   `dataPreview` recusa com 400 e o `RFC_READ_TABLE` não decodifica. **Só o BAL lê o BAL.**

Daí a divisão, que é a economia do módulo:

| o que você quer saber | como | custo |
|---|---|---|
| houve log? quantas mensagens? quantos erros? | `logsDesde` — `dataPreview` na BALHDR (`MSG_CNT_E/W/I/S/A`) | 1 consulta, nada criado |
| o TEXTO da mensagem | `lerMensagens` — driver classrun com `BAL_DB_LOAD` + `BAL_LOG_MSG_READ` | 1 classe em `$TMP` |

`comLog` só roda o driver quando o `espera` pede texto (`contem`). Um assert de "não logou erro" é
SQL puro e não deixa nada no sistema.

---

## ⚠ Três formas de "logou" sem log

Todas medidas, todas com `subrc = 0` na cara do programador:

| caso | o que o ABAP vê | o que acontece |
|---|---|---|
| `BAL_LOG_CREATE` com `object` VAZIO | create **0**, add **0** | `BAL_DB_SAVE` recusa: `save_not_allowed` (subrc 2). Nada persiste. |
| `BAL_LOG_MSG_ADD` com handle inicial | add **0** | a mensagem vai para OUTRO log em memória — medido: duas mensagens de casos distintos foram parar num terceiro log |
| sem `BAL_DB_SAVE` | tudo **0** | o log fica só na memória… |

…**e o inverso também morde**: um `BAL_DB_SAVE` com `i_save_all = abap_true` em qualquer ponto do
programa salva **todos** os logs em memória, inclusive os que ninguém mandou salvar (medido: 2
lognumbers de uma chamada só). Por isso `gravarLog` usa `i_save_all = abap_false` e para antes do
`MSG_ADD` quando o handle está vazio.

Objeto ou subobjeto **inexistente**, ao contrário, é recusado na porta: `BAL_LOG_CREATE` devolve
subrc 1 (`log_header_inconsistent`). É a prova de que o objeto de log existe de verdade.

`COMMIT WORK` **não** é o que decide: no classrun, log salvo sem commit explícito apareceu em outra
LUW mesmo assim (commit implícito do fim do request ICF). Para assert de LUW, use o ciclo da
[receita de escrita/verificação](receita-ciclo-escrita-verificacao.md).

---

## A janela é o LOGNUMBER, não o relógio

`BALHDR-LOGNUMBER` é NUMC 20 atribuído **no SAVE** por number range, crescente (medido). A marca
d'água é `MAX(lognumber)` lido imediatamente antes do act — nenhum fuso entra na conta, e o fuso do
s4h é torto (ver [dumps](receita-dumps-st22.md) e o item 22 da fila).

**Limite medido:** log **acrescentado** — `BAL_DB_LOAD` + `MSG_ADD` + `SAVE` sobre um log que já
existe — **mantém o lognumber** (`e_new_lognumbers` volta vazio) e o contador do cabeçalho sobe.
A marca d'água não o vê como novo. Para esse caso: filtre por `extnumber` e compare o `total`
do cabeçalho antes e depois (`logsDesde(cx, '0', { extnumber })`).

**Não há filtro de mandante:** `BALHDR-MANDANT` é campo CLIENTE (CLNT) e o `dataPreview` o recusa no
WHERE (`The client field "MANDANT" cannot be specified…`, 400) — ele já lê no mandante do logon. (Na
`SNAP` dos dumps o `MANDT` é campo comum e *entra* no WHERE; a diferença é essa.)

---

## O objeto de log (SLG0) agora se cria por ADT REST

Achado da mesma POC, e o pré-requisito de tudo acima: `APLO/TYP` é uma coleção do discovery
(`/sap/bc/adt/applicationlog/objects`, workspace "Others"). É o primeiro tipo **"blue" (ABAP File
Formats)** da lib — o fonte é **JSON**, e o próprio sistema serve o JSON Schema em `…/objects/$schema`
(`aplo-v1.json`).

```js
import { deploy } from 'adt-client';

await deploy(cx, 'applicationLogObject', {
  name: 'YJBV_POC_LOG29', description: 'POC — application log',
  subobjetos: [{ nome: 'POC', descricao: 'Subobjeto da POC' }],
});
```

Três desvios do fluxo `source` genérico, todos medidos:

1. o create é **`application/vnd.sap.adt.blues.v1+xml`** — PLURAL. Os palpites óbvios
   (`…applicationlog.objects.v1+xml`, `…aplo.v1+xml`, `…blue.v1+xml`, `application/xml`) dão **415**,
   e o corpo do 415 **não nomeia** o suportado; quem nomeia é o `app:accept` do discovery.
2. o PUT de `/source/main` é **`application/json`** (o `setSource` genérico manda `text/plain`).
3. **não ativa**: nasce `version="active"` e o PUT já grava `BALOBJ`/`BALSUB` — como o pacote.

`GET` na coleção sem nome dá 400 `uriMappingError`: ela só aceita POST.

---

## As chamadas

| o que | chamada | canal |
|---|---|---|
| marca d'água | `marcaDagua(cx)` | `dataPreview` (BALHDR) |
| cabeçalhos novos | `logsDesde(cx, marca, { objeto, subobjeto, extnumber, usuario, programa })` | `dataPreview` |
| texto das mensagens | `lerMensagens(cx, logs)` | classrun |
| tudo junto | `lerLogs(cx, marca, filtros)` | os dois |
| gravar um log (arrange) | `gravarLog(cx, { objeto, subobjeto, extnumber, mensagens })` | classrun |
| apagar logs (SLG2) | `apagarLogs(cx, logs, { confirm: true })` | classrun |
| **o assert** | `comLog(cx, act, { objeto, espera })` / `semErroNoLog(cx, act, { objeto })` | conforme o `espera` |

`mensagens` aceita `{ tipo, texto }` — o texto é partido nos quatro `&` da mensagem `00`/`398`
(`&1&2&3&4`, 50 caracteres cada) — ou os campos crus (`msgty`, `msgid`, `msgno`, `msgv1..4`).

`espera`: `minimo` (default 1), `semErro` (nenhum A/E), `tipos` (`{ E: 0, S: 1 }`, contagem exata
somada) e `contem` (texto — o único que exige o driver).

---

## Uso pela lib

```js
import { comLog, semErroNoLog } from 'adt-client/bal';
import { runClass } from 'adt-client/classrun';

// o act "passou" (HTTP 200) — mas o log reprova
await comLog(cx, () => runClass(cx, 'YCL_CARGA', { novaSessao: true }), {
  objeto: 'ZCARGA', espera: { semErro: true, tipos: { S: 1 }, contem: 'carga concluida' },
});

// nem todo processo loga; este só cobra que NÃO tenha erro
await semErroNoLog(cx, () => runClass(cx, 'YCL_X', { novaSessao: true }), { objeto: 'ZCARGA' });
```

Falha sai como `ErroDeLog`, com as falhas e o log formatado:

```
o act "passou", mas o log de aplicação reprova (1):
  ✗ log com erro: E=1 A=0
  2026-08-31 13:50:34 YJBV_POC_LOG29/POC "E2E-ACT-ERRO" MVJVELOSO — 1 msg (E:1) [00000000000048985217]
```

Quando o act **falha**, o erro original sai com o log anexado — é o que o HTTP não conta.

---

## `BAL_DB_LOAD` é tudo-ou-nada

Medido: um lognumber inexistente na lista faz `log_not_found` (subrc 2) e devolve **zero** logs — os
que existiam não vêm. Por isso a lista sempre sai da própria BALHDR (`logsDesde`), nunca de palpite.

E o **segundo** `BAL_DB_LOAD` do mesmo log na mesma sessão devolve `subrc 0` com **0 logs e 0
mensagens** (mesmo com `i_exception_if_already_loaded = abap_false`): silencioso. Por isso o driver
faz **um** LOAD por execução. A leitura usa `i_lock_handling = 0` — assert não tranca log.

---

## Regras de laboratório

- **Objeto de log próprio.** Gravar num objeto do cliente suja o log dele; crie `Y…` por
  `deploy(cx, 'applicationLogObject', …)` e apague no fim.
- **`extnumber` distintivo.** É o campo livre de 100 caracteres do cabeçalho e o melhor filtro de
  um caso de teste — melhor que usuário ou programa.
- **Limpeza é `apagarLogs`** (`BAL_DB_DELETE` com commit; `confirm: true` obrigatório). Apagar o
  objeto APLO sem apagar os logs deixa cabeçalho apontando para objeto que não existe mais.
- ⚠ **E2E longo satura a sessão**: o `dataPreview` gera um subprograma por consulta freestyle e, após
  algumas dezenas na MESMA sessão, o servidor dumpa `GENERATE_SUBPOOL_DIR_FULL` em
  `CL_ADT_DP_OPEN_SQL_HANDLER` — o sintoma é um HTTP 500 com a página do ICM num `dataPreview` que
  antes funcionava. Medido nesta POC (e diagnosticado pelo `dumps.mjs`). A saída é uma conexão nova
  para o trecho final.
