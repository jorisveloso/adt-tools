# Receita: NROB — objeto de numeração (SNRO) sem GUI

**Validado por POC: S4H release 758, mandante 250, 2026-09-01.** Objetos `YJBV_POC_A`…`YJBV_POC_D` e drivers
`Y_NRIV*` / `YJBV_POC_CL_NR44*`, todos `$TMP`, todos removidos ao final (TNRO, TADIR e NRIV vazias por
readTable). Item 44 da fila (ideia I55). Na lib, em **dois arquivos**, porque são duas coisas diferentes:

| O quê | O que é no SAP | Via | Onde |
|---|---|---|---|
| **objeto** (R3TR NROB) | objeto de repositório — a linha da **TNRO** | ADT REST | `tipos/numberRangeObject.mjs` → `deploy(conexao, 'numberRangeObject', …)` |
| **intervalo** | **dado de mandante** — a linha da **NRIV**, sem TADIR e sem versão | driver classrun | `nrob.mjs` → `deployIntervalos` / `lerIntervalos` / `apagarIntervalos` |

A divisão não é estética: **nenhum `NUMBER_RANGE_*` é RFC** (medido na fila 38 — o espelho do FMODE dizia que
sim), então o intervalo não sai por SOAP; e o objeto **sai por ADT REST**, desmentindo a pesquisa, que dava
NROB como "driver classrun + intervalo por SOAP". 46 NROB custom na moovi.

## O objeto — o segundo tipo "blue" (AFF) da lib

O fluxo é o do `applicationLogObject` (fila 29), com **dois desvios que custaram spike**:

1. **o shell do create leva `adtcore:version="inactive"`.** Com `"active"` — que é o que o APLO pede — o create
   devolve **400 `NR 870 "O objeto não existe"` E CRIA O OBJETO ASSIM MESMO**: TADIR gravada, `GET` 200
   `inactive`, e lock/PUT/activate seguem funcionando normalmente. O 400 é o handler tentando ler a *versão
   ativa*, que só nasce na ativação. Medido nos dois sentidos: com `inactive`, e com o body sem `version`
   nenhum, o create é **201** limpo. **Quem trata o 400 como falha deixa objeto órfão para trás.**
2. **ele ATIVA — e é a ativação que grava a TNRO.** O APLO nasce ativo e o PUT do fonte já persiste; aqui o PUT
   devolve 200 com o JSON de volta e a **TNRO segue vazia** até o `activate`.

O que é da família AFF, não deste tipo: create em `application/vnd.sap.adt.blues.v1+xml` (plural — e o **415 do
ct errado NÃO nomeia o suportado**, ao contrário do 415 do FUGR/include da fila 11) e PUT de `/source/main` em
`application/json`.

```js
import { deploy } from 'adt-client';

await deploy(conexao, 'numberRangeObject', {
  name: 'YJBV_POC_A', pkg: '$TMP', description: 'POC fila 44 - number range object',
  dominio: 'NUM10',        // DOMÍNIO (NUMC/CHAR, 1..20) — não data element. É ele que dá o comprimento.
  percentual: 10.0,        // aviso de esgotamento; 0.1..99.9 (o schema recusa fora)
  buffering: 'none',       // mainBuffer | parallel | none
});
```

### O que o sistema serve sozinho

O 758 publica o contrato inteiro no discovery (workspace **"Number Range Management"**):

| Recurso | Serve |
|---|---|
| `/sap/bc/adt/numberranges/objects` | a coleção. `app:accept` = `blues.v1+xml`, categoria `nrobnro` |
| `…/objects/{object_name}` | metadados `blue:blueSource` (`{?corrNr,lockHandle,version,accessMode,_action}`) |
| `…/objects/{object_name}/source/main` | o fonte **JSON** (`{?corrNr,lockHandle,version}`) |
| `…/objects/$schema` | o **`nrob-v1.json` do `SAP/abap-file-formats`**, servido pelo próprio sistema |
| `…/objects/$configuration` | o layout do editor — e o **tipo de cada campo**: `numberLengthDomain` é `DOMA/DD`, `subType` é `DTEL/DE` |
| `…/objects/validation` | só POST (o GET dá 405) |

O fonte, na forma do schema (`formatVersion`, `header`, `interval`, `configuration` — todos obrigatórios,
`additionalProperties: false`):

```json
{
  "formatVersion": "1",
  "header": { "description": "…", "originalLanguage": "pt" },
  "interval": { "numberLengthDomain": "NUM10", "percentWarning": 10, "subType": "",
                "untilYear": false, "rolling": false, "prefix": false },
  "configuration": { "buffering": "none", "bufferedNumbers": 0 }
}
```

`originalLanguage` é **minúsculo** (`^[a-z]+$`), como no APLO. `transactionId` é opcional e só entra quando
informado. Molde real conferido em `RV_BELEG` (`subType: "SD_NRRANGE_PREFIX"`, `prefix: true`,
`buffering: "parallel"`) e `YD01_SNRO`.

**Assert:** `readTable TNRO` (`OBJECT`, `DOMLEN`, `PERCENTAGE`, `BUFFER`, `NOIVBUFFER`) em outra LUW — a linha
só existe **depois do activate**; a TADIR (`R3TR NROB`) existe desde o create. O `buffering` chega na TNRO como
`BUFFER` (`''` none · `'X'` mainBuffer · `'S'` parallel) + `NOIVBUFFER`.

## O intervalo — o ciclo, e os três silêncios

```js
import { deployIntervalos, lerIntervalos, apagarIntervalos } from 'adt-client/nrob';

const r = await deployIntervalos(conexao, {
  objeto: 'YJBV_POC_A',
  intervalos: [{ nr: '01', de: '0000000001', ate: '0000009999' }],
  proximoDe: '01',                       // pede um NUMBER_GET_NEXT no fim — a prova de que ficou usável
});
r.ok;          // true só se o CLOSE gravou
r.proximo;     // { subrc: 0, numero: '0000000001' }
```

O ciclo do driver é **`NUMBER_RANGE_ENQUEUE` → `NUMBER_RANGE_UPDATE_INIT` → `NUMBER_RANGE_INTERVAL_UPDATE` →
`NUMBER_RANGE_UPDATE_CLOSE(commit)` → `NUMBER_RANGE_DEQUEUE`**. Sem o INIT, o CLOSE devolve
`OBJECT_NOT_INITIALIZED`.

**Os três silêncios — e o que denuncia cada um:**

| Silêncio | O que se vê | O que é |
|---|---|---|
| `INRIV-PROCIND` vazio | `INTERVAL_UPDATE subrc=0`, sem erro, **e nada muda** | o PROCIND (`I`/`U`/`D`) é obrigatório. Quem denuncia é o **CLOSE**, com `NO_CHANGES_MADE` (subrc 1) |
| apagar com o `NRLEVEL` gravado | `UPDATE subrc=0` mas `error_occured='X'` | `INRER` = `MSGNR 210`, `TABLENAME INTERVAL`, `FIELDNAME NRLEVEL` — *"ao eliminar, o status do número deve ser inicial"*. **Zere o `nrlevel` no payload** |
| `acao: 'alterar'` sem `nivel` | tudo verde, e **o contador volta a zero** | o INTERVAL_UPDATE grava a **linha inteira**. Medido: `NRLEVEL` 10000 → 0, sem erro nenhum. Por isso a lib **exige `nivel` explícito** em `alterar` — leia o atual com `lerIntervalos`, ou passe `nivel: 0` de propósito |

> ⚠ **Não medido**: o *conserto* do terceiro silêncio. Que passar `nivel` no `alterar` **preserva** o contador é
> inferência do mesmo mecanismo que zerou (a linha inteira é gravada), não medição — o ADT stateful do s4h caiu
> antes de rodar essa passagem (ver "Ambiente" no fim). O guard-rail que **recusa** `alterar` sem `nivel` está
> medido e é o que protege hoje; a passagem `nivel` → `NRLEVEL` preservado fica para a próxima janela.

Estruturas, contra o que a intuição sugere: **`INRIV` não tem `OBJECT`** (o objeto vai só no EXPORTING; tem
`SUBOBJECT`), e **`INRER` não tem `ERRORNUMBER`** — é `MSGNR`/`TABLENAME`/`FIELDNAME`/`TABIX`. O parâmetro
`ERROR_IV` é `TABLE OF INRIV` (os intervalos **recusados**), não de INRER.

**Prova de uso (medida):** intervalo `01` de 1 a 9999 → `NUMBER_GET_NEXT` devolveu `0000000001` e, na chamada
seguinte, `0000000002`; `readTable NRIV` em outra LUW mostrou o `NRLEVEL` andado. **Contrafactual:** com um
objeto que não existe, o `ENQUEUE`/`UPDATE_INIT` já devolvem `OBJECT_NOT_FOUND` — o intervalo não é aceito.

## Desfazer — e a ordem importa

**O DELETE do objeto pelo ADT devolve 400 `NR 874` ("Existem intervalos para o objeto") enquanto houver NRIV.**
A ordem é:

```js
await apagarIntervalos(conexao, { objeto: 'YJBV_POC_A', confirm: true });  // lê pelo INTERVAL_LIST, zera o nível, PROCIND 'D'
await deleteObject(conexao, { type: 'numberRangeObject', name: 'YJBV_POC_A', confirm: true });
```

`apagarIntervalos` exige `confirm: true` (o `NRLEVEL` se perde) e trata "objeto sem intervalo" como sucesso.
Depois do DELETE: TNRO, TADIR e NRIV vazias — confirmado por readTable.

## O que ficou fora

- **subobjetos** (`interval.subType` apontando um data element com check table) — o campo entra no fonte, mas o
  ciclo com `SUBOBJECT` preenchido não foi medido.
- **intervalo externo** (`externind = 'X'`) — a flag existe no build; não medida.
- **`untilYear` / `rolling` / `prefix`** — vão no fonte e chegam à TNRO, mas o comportamento em runtime não foi
  exercitado.
- **transporte**: o `corrNr` é aceito pelo create/PUT/activate como em qualquer tipo, mas um NROB transportável
  não foi medido; o intervalo, sendo dado de mandante, não entra em TR por esta via.
- **`alterar` preservando o contador** — ver o aviso acima.

## Ambiente (2026-09-01)

O E2E pela lib rodou **28/29 PASS** (a única falha foi um assert do próprio script, que truncava a mensagem
antes do `874`). Depois disso, por volta das 04:2x, **a via ADT STATEFUL do s4h passou a responder 400
`Service nicht erreichbar` (HTML) a tudo** — o mesmo sintoma da fila 21, e de novo **sem relação com contagem
de sessões**: havia 9 no sistema, 2 minhas. SOAP RFC e o ADT **stateless** (`fetch` com Basic Auth) seguiram
**200** o tempo todo, inclusive o `GET` do NROB. Como todo create/lock/PUT é stateful, nada de escrita rodou
nessa janela; três tentativas deixaram **4 sessões 202 órfãs** minhas (o logoff devolve 400 nesse estado —
SM04/`TH_DELETE_USER` é do Joris). A sonda de "voltou?" foi por SOAP (`TH_USER_LIST`) e por GET stateless,
nunca abrindo sessão stateful nova. Nada ficou no sistema: TNRO, TADIR `NROB` e NRIV vazias, zero classes
driver.
