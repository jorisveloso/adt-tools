# Receita — o assert "não dumpou" (ST22 por ADT REST)

**Validado por POC: S4H release 758, mandante 250, 2026-08-31.** Cobaias `YJBV_POC_CL_D28A/B/C/D` e
`YJBV_POC_FG_D28`/`YJBV_POC_FM_D28` em `$TMP`, todas removidas ao final (TADIR sem `YJBV_POC%D28%`;
1 sessão do usuário em `TH_USER_LIST` antes e depois). E2E pela lib: **21/21 PASS**. Item 28 da fila
(ideia I5). Na lib: [`dumps.mjs`](../dumps.mjs) (export `adt-client/dumps`).

**O que a receita entrega:** um E2E que REPROVA quando o código dumpa — inclusive quando o canal
respondeu 200 e o teste passaria. **O que ela não entrega:** impedir o dump; ela o vê depois.

---

## O problema: o dump não chega ao chamador

Medido, com o mesmo divisor zero em três lugares diferentes:

| canal | o que o chamador vê | dump na SNAP |
|---|---|---|
| classrun, dump direto | HTTP 500 + `<html>` "Application Server Error" (10 KB) | sim |
| classrun, `SUBMIT` (o 500 do item 7) | HTTP 500 + a mesma página | sim |
| `CALL FUNCTION … STARTING NEW TASK` | **HTTP 200, saída normal, `subrc=0`** | sim |

A página do 500 é do ICM e não diz **nada**: nem o erro, nem o programa, nem a linha. A terceira
linha é a pior: o driver escreve no console, o classrun devolve 200, o E2E fica verde — e há um dump
no sistema. É o caso do trabalho assíncrono (aRFC, update task, job): o erro acontece noutra sessão,
e a sessão que testa nunca fica sabendo.

```js
import { semDump } from 'adt-client/dumps';
import { runClass } from 'adt-client/classrun';

// reprova se o act deixou dump — mesmo que ele tenha "passado"
const r = await semDump(conexao, () => runClass(conexao, 'YJBV_POC_CL_X', { novaSessao: true }));
```

```
ErroDeDump: o act não falhou, mas DUMPOU (1 na ST22) — 200 não é sucesso:
  2026-08-31 13:32:00 MVJVELOSO — COMPUTE_INT_ZERODIVIDE (CX_SY_ZERODIVIDE) em SAPLYJBV_POC_FG_D28, <include>:<linha>
```

E quando o act **falha mudo**, o erro original sai com a causa anexada — é o valor imediato no
classrun, onde o 500 não explica nada:

```
ErroDeDump: classrun YJBV_POC_CL_D28A falhou (HTTP 500): <!DOCTYPE html>…
→ e o act DUMPOU (1):
  2026-08-31 13:31:58 MVJVELOSO — COMPUTE_INT_ZERODIVIDE (CX_SY_ZERODIVIDE) em YJBV_POC_CL_D28A==============CP, …CM001:5
```

**Ponto aberto do item 7 fechado:** o `SUBMIT` dentro de driver classrun dá HTTP 500 porque dumpa
**`DYNPRO_SEND_IN_BACKGROUND` em `SAPLKKBL`, linha 457** — o report tenta mandar dynpro e não há GUI.
A conclusão prática não muda (teste de report fica em aunit/SA38), mas agora tem causa medida.

---

## ⚠ O feed do ADT PERDE dumps — o assert é pela SNAP

Há duas vias, e **só uma serve de assert**:

| via | latência | completude |
|---|---|---|
| `SNAP` por `dataPreview` | **imediata** — dump visto na 1ª leitura, 491 ms depois do act | completa |
| feed `/sap/bc/adt/runtime/dumps` | variável: 11 s numa medição, > 7 min noutra | **incompleta** |

Medido no mesmo dia e mandante, ao fim do E2E: **a SNAP tinha 14 dumps do dia; o feed mostrava 7.**
Os sete ausentes eram todos meus, e não é só atraso — o dump das `13:16:27` continuava fora enquanto
o das `13:16:31` era listado, e o `self` do próprio feed declarava `from=…111631`: ele para num ponto
e ignora o que vem depois. **Causa não isolada.**

Consequência: um assert lido pelo feed dá verde falso, sem padrão que dê para contornar com espera.
`semDump` lê a SNAP; `feed()` existe para panorama (é o que o Eclipse mostra), com este aviso. Um
dump ausente do feed **continua legível** por `lerDump` — a chave vem da SNAP (medido).

## ⚠ A janela é hora do servidor — nunca o relógio local

A SNAP grava `DATUM`/`UZEIT` na hora do SO do app server. No s4h isso é **BRT** (medido: dump criado
às 16:07:34Z ficou gravado como `130734`), enquanto a `TTZCU` declara `CET`. O recurso ADT converte
pela TTZCU, e o resultado sai **5 h errado**:

```
systemDate="31.08.2026" systemTime="13:07:34"   ← a hora do servidor, igual à SNAP
datetime="2026-08-31T11:07:34Z"                 ← convertido pela TTZCU: 5 h atrás do real
```

Fato do sistema, não da lib (o mesmo fuso torto que o item 22 encontrou no `changedAt` e que o ATC
denuncia como P3 de ambiente). Por isso a marca d'água **não vem de relógio nenhum**: é o
`MAX(DATUM||UZEIT)` da própria SNAP, lido imediatamente antes do act. Compara-se a SNAP com ela
mesma e nenhum fuso entra na conta — e SNAP vazia devolve zeros, o que é o correto (nada existia
antes).

---

## Anatomia: o cabeçalho mora no `FLIST`

A linha `SEQNO = '000'` da SNAP é o cabeçalho do dump; `FLIST`…`FLIST08` são um fluxo de
**`TAG(2) + LEN(3) + valor`**, com o que interessa logo no começo:

```
FC022COMPUTE_INT_ZERODIVIDE AP032YJBV_POC_CL_DUMPA=============CP AI035…CM001 AL0015 XC016CX_SY_ZERODIVIDE
└ erro                      └ programa terminado                  └ include  └ linha 5 └ classe de exceção
```

`parseFlist` decodifica isso (`AL0015` = `AL` + `001` + `"5"` → linha 5; `AL003457` → linha 457).
Ler o FLIST é **uma consulta** para todos os dumps da janela; ler o dump é uma requisição por dump.
As duas vias foram cruzadas e concordam — `error`/`exception`/`terminatedProgram` do `<dump:dump>`
são iguais a `FC`/`XC`/`AP` do FLIST.

A **chave** do dump no recurso ADT é a chave da SNAP concatenada e posicional:

```
DATUM+UZEIT (14) · AHOST (32) · UNAME (12) · MANDT (3) · MODNO (9, à direita)
"20260830130245ndc-s4hana_S4H_00               MVJVELOSO   250        7"
```

`chaveDoDump` monta isso e o resultado bate byte a byte com a `atom:link rel="self"` do feed.

---

## As chamadas

| # | chamada | responde |
|---|---|---|
| 1 | `dataPreview` `SELECT … FROM snap WHERE seqno = '000' AND (datum/uzeit > marca)` | a janela inteira, com o FLIST |
| 2 | `GET /sap/bc/adt/runtime/dump/<chave>` · `Accept: application/*` | `<dump:dump>` com erro, exceção, programa, `systemTime` |
| 3 | `GET /sap/bc/adt/runtime/dump/<chave>/formatted` · `Accept: text/plain` | o texto que a ST22 mostra (~50 KB) |
| 4 | `GET /sap/bc/adt/runtime/dumps?from=…&to=…` · `Accept: application/atom+xml;type=feed` | o feed — panorama, **não assert** |

Gotchas de protocolo medidos:

- o feed **só** aceita `application/atom+xml;type=feed`; qualquer outro Accept (o `application/*`
  inclusive) dá 406 nomeando esse;
- o dump individual **não** aceita `text/plain` na URI base (406) — o texto é o sub-recurso
  `/formatted`; `application/*` e `text/html` respondem 200 na base;
- o feed usa namespace **prefixado** (`<atom:entry>`): um parser que procure `<entry>` volta vazio
  com HTTP 200 — verde silencioso de parser;
- `from`/`to` são `AAAAMMDDHHMMSS` na escala **do ADT** (a convertida), não na da SNAP. Não cruze as
  duas por tempo; cruze por chave.

## Uso pela lib

```js
import { semDump, marcaDagua, dumpsDesde, lerDump, feed, formatarDumps } from 'adt-client/dumps';

// o assert, em volta de qualquer act
await semDump(conexao, () => runClass(conexao, 'YJBV_POC_CL_X', { novaSessao: true }));

// à mão, quando o act é uma sequência inteira
const marca = await marcaDagua(conexao);
await ...;                                       // arrange → act
const dumps = await dumpsDesde(conexao, marca);  // default: só os do usuário do logon
if (dumps.length) console.log(formatarDumps(dumps));

// o detalhe, quando um dump apareceu
const resumo = await lerDump(conexao, dumps[0]);                     // erro/exceção/programa
const texto  = await lerDump(conexao, dumps[0], { formato: 'texto' }); // o que a ST22 mostra
```

Opções de `dumpsDesde`/`semDump`: `usuario` (default o do logon; `'*'` traz de todos — **o dump de
um job de background roda com o usuário do step, não com o seu**), `programa` (filtro `LIKE` no
programa terminado), `doMandante` (default true, filtra `MANDT`), `limite`, e `lancar: false` em
`semDump` para receber `{ ok, dumps }` em vez de exceção.

## Regras de laboratório

- Só leitura: `dumps.mjs` não cria, não altera e não apaga nada — a SNAP é lida por `dataPreview`
  (que já é read-only por guard-rail) e o recurso ADT por GET. Roda em sistema de cliente.
- Ciclo inteiro **stateless** (`sessaoDeLeitura`, a mesma regra do `cts.mjs` e do `atc.mjs`).
- `semDump` faz duas consultas extras por act (a marca e a janela). Em suíte grande, chame
  `marcaDagua` uma vez e `dumpsDesde` no fim.
- O que **não** foi medido: dump em **update task** (`IN UPDATE TASK` + `COMMIT WORK`) e em job de
  background — a via assíncrona medida foi `STARTING NEW TASK`. Update task falhada tem uma segunda
  evidência que a SNAP não dá (VBHDR/VBERROR, a SM13); ver `docs/ideias.md`.
