# Receita — ATC (ABAP Test Cockpit) por ADT REST

O gate de qualidade que o Eclipse aplica no *Run As → ABAP Test Cockpit*, pela mesma via REST —
disparar a verificação num objeto (ou num pacote) e ler os findings com prioridade, check, mensagem
e linha. Módulo: [`atc.mjs`](../atc.mjs) (export `adt-client/atc`).

**Tudo aqui foi medido no S4H rel. 758, mandante 250, em 2026-08-31** (item 27 da fila), com as
cobaias `YJBV_POC_CL_ATCB` (suja de propósito) e `YJBV_POC_CL_ATCG` (limpa) em `$TMP`, ambas
apagadas ao final. E2E pela lib: 13/13 PASS; 0 sessões antes e depois.

O ATC **não altera o objeto verificado**. O que ele grava é a *worklist* — um resultado com id GUID,
do usuário. Nada de `$TMP` é exigido: rodar ATC num objeto de cliente é leitura.

---

## O ciclo, em três chamadas

| # | chamada | responde |
|---|---|---|
| 1 | `POST /sap/bc/adt/atc/worklists?checkVariant=<V>` | 200, corpo = o **worklistId em texto puro** |
| 2 | `POST /sap/bc/adt/atc/runs?worklistId=<id>` + `<atc:run>` | 200, `<atcworklist:worklistRun>` com `FINDING_STATS` = `"p1,p2,p3"` |
| 3 | `GET /sap/bc/adt/atc/worklists/<id>?includeExemptedFindings=false` | 200, um `<atcobject:object>` por objeto verificado |

O passo 3 exige `Accept: application/atc.worklist.v1+xml` (sem ele o XML vem sem os findings).
O passo 2 é **síncrono e não é barato**: 5 a 10 s por classe, ~90 s por pacote.

O corpo do run é um `objectSet kind="inclusive"` com uma `adtcore:objectReference` por alvo:

```xml
<atc:run xmlns:atc="http://www.sap.com/adt/atc" maximumVerdicts="100">
  <objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
        <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/yjbv_poc_cl_atcb"/>
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>
```

Pela lib, as três chamadas são uma:

```js
import { verificar, formatarFindings } from 'adt-client/atc';

const r = await verificar(conexao, {
  objetos: { type: 'class', name: 'YJBV_POC_CL_ATCB' },
  variante: 'ABAP_CLOUD_READINESS',
});
console.log(formatarFindings(r));
// ATC ABAP_CLOUD_READINESS: 1 objeto(s), 6 finding(s) (P1 6 · P2 0 · P3 0) — REPROVOU em 6 (até P2)
//   P1 YJBV_POC_CL_ATCB:6 — Versão de idioma ABAP (sintaxe): Erro de sintaxe em escopo de idioma restringido (Open SQL)
//   …
if (!r.ok) process.exit(1);
```

`objetos` aceita três formas: `{ type, name }` (resolvido pelo `objPath` — vale para qualquer tipo
do catálogo), `{ pacote: 'J1BNFE' }` e a URI ADT crua. Uma lista roda tudo num objectSet só.

---

## ⚠ Os três verdes que não são sucesso

**Este é o motivo de o módulo existir.** O ATC devolve **200 com zero findings** em três situações
completamente diferentes, e a REST não distingue nenhuma delas por status. Medido com a MESMA
classe suja, no mesmo minuto:

| situação | HTTP | `FINDING_STATS` | objetos na worklist |
|---|---|---|---|
| limpo de verdade | 200 | `0,0,0` | 1, com `<atcobject:findings/>` |
| variante que **não existe** (ou vazia) | 200 | `0,0,1` | 1 |
| objeto que **não existe** | 200 | `0,0,0` | **0** |

1. **Variante inexistente não dá erro.** `POST /atc/worklists?checkVariant=NAO_EXISTE_XYZ` devolve
   200 e um worklistId normal; o run cai num conjunto de checks default e responde como a variante
   `DEFAULT` responderia. Na cobaia, **6 findings de prioridade 1 viraram zero em silêncio**. O SAP
   não confere o nome — quem confere é a lib (`conferirVariante`, ligado por default, contra a
   `SCICHKV_HD`).
2. **Objeto inexistente devolve worklist sem objeto.** É o `executed === 0` do ABAP Unit: `verificar`
   **lança** em vez de devolver verde. O distinguidor é `checados` — um objeto realmente limpo
   *aparece* na worklist com a lista de findings vazia; um objeto não verificado não aparece.

---

## A variante é a verificação inteira

"Rodar o ATC" não quer dizer nada sem dizer **qual variante**. Na mesma classe suja, no mesmo
sistema:

| variante | resultado |
|---|---|
| `ABAP_CLOUD_READINESS` | **6 findings P1** — Open SQL fora do escopo restrito (host var sem `@`), API não liberada |
| `PERFORMANCE_DB` | **2 findings P2** — `DB-Operation SELECT für T000/T100 gefunden` (o `SELECT` dentro do `LOOP`) |
| `DEFAULT` | 1 finding P3 — **e é do ambiente, não do código** (ver abaixo) |
| `ZATC_PROXY_MIGRATION` | **0** — e é a variante configurada NESTE sistema |

```js
const c  = await customizing(conexao);   // { variante, propriedades, motivosDeIsencao }
const vs = await variantes(conexao);     // 197 no s4h: 195 globais + 2 de usuário
```

`customizing().variante` é a `systemCheckVariant` — a que o Eclipse usa quando ninguém escolhe
outra, e a que `verificar` assume quando `variante` é omitida. **No s4h ela aponta para
`ZATC_PROXY_MIGRATION`, uma variante de migração de proxy que não pega nada.** Descobrir isso é
metade do valor de rodar o ATC por aqui: o gate default do sistema está mudo.

**As variantes moram na `SCICHKV_HD`, não no ADT.** `GET /sap/bc/adt/atc/variants` devolve
`totalItemCount 0` neste release — com e sem `maxItemCount`/`data`, os dois parâmetros que o
template do discovery anuncia. Por isso `variantes()` lê a tabela. A chave é `CHECKVNAME + CIUSER`:
`CIUSER` vazio = variante **global**, preenchido = variante **daquele usuário** (as duas podem ter
o mesmo nome — no s4h `ZATC_PROXY_MIGRATION` existe nas duas formas). `HIDDEN='X'` são as fixtures
internas do Code Inspector (as ~150 `VERI_*`), fora da lista por default.

### Finding de ambiente ≠ finding de código

Na variante `DEFAULT` do s4h, **toda** classe — a limpa inclusive — recebe um P3
*"Pré-requisitos para a atualização ampliada de tabelas (SLIN)"*, cujo texto fala de inconsistência
na configuração de fusos horários (`TTZCU`) **do sistema**, não do código verificado. (É a mesma
TTZCU que o item 22 já tinha medido para converter `changedAt`.)

Duas consequências, e as duas estão no módulo:

- `ok` reprova até **P2** por default (`reprovaAte`) — "zero findings" não é critério utilizável
  num sistema que injeta P3 de infraestrutura em todo objeto;
- **o contrafactual é obrigatório.** Rodar a mesma variante numa cobaia limpa é o que separa achado
  de código de ruído de sistema. Foi assim que este ruído apareceu.

---

## O que um finding traz

```js
{
  prioridade: 1,                    // 1 erro · 2 warning · 3 informação
  check: 'Versão de idioma ABAP (sintaxe)',
  checkId: '51B937545CCD6BD44D8879072AB810B3',
  mensagem: 'Erro de sintaxe em escopo de idioma restringido (Open SQL)',
  messageId: '2728',
  linha: 6,
  local: '/sap/bc/adt/oo/classes/yjbv_poc_cl_atcb/source/main#type=CLAS%2FOM;name=IF_OO_ADT_CLASSRUN%7eMAIN;start=6',
  uri: '/sap/bc/adt/atc/findings/itemid/00505.../index/405',
  quickfix: 'atc:00505...,405',
  objeto: 'YJBV_POC_CL_ATCB', tipoObjeto: 'CLAS',
}
```

A **linha** sai do `atcfinding:location`, que vem em duas formas: dentro do método
(`…/source/main#type=CLAS%2FOM;name=…;start=6`) e no objeto (`…/oo/classes/x#start=1,0`) — o parser
trata as duas. Os acentos vêm como entidade **numérica** (`Vers&#227;o`) e são desescapados.

**A mensagem do finding é genérica; o detalhe concreto está na documentação.** `messageTitle` diz
*"Erro de sintaxe em escopo de idioma restringido (Open SQL)"*; a documentação diz *"todas as
variáveis host devem ser mascaradas mediante @. **A variável LS_T100 não está mascarada**"*, mais o
componente (`BC-ABA-LA-EPC`) e a classe de check (`CL_CI_TEST_EXTENDED_CHECK_VERS`):

```js
const doc = await documentacaoDoFinding(conexao, r.findings[0]);   // { html, texto }
```

A URI é a do finding com `atc/findings` trocado por `documentation/atc/documents`. O Accept é
**`application/vnd.sap.adt.docu.v1+html`** e só ele: `text/html` e `application/*` dão 406 — e o
corpo do 406 nomeia o aceito.

---

## Gotchas medidos

- **`maximumVerdicts` não limita nada** neste release. Com `maximumVerdicts="1"` a mesma classe
  devolveu os 6 findings. O atributo é mantido porque é o que o Eclipse manda; quem quiser cortar,
  corta no consumidor.
- **Leitura stateless.** Todo o ciclo passa por `sessaoStateless()` — nada fica vivo no servidor
  depois da resposta (regra das sessões, `receita-tobj-sm30.md`). Medido: 0 sessões antes e depois
  do E2E inteiro.
- **`GET /sap/bc/adt/atc/runs` dá 405** (só POST); `GET /sap/bc/adt/atc/worklists` sem id dá 400
  `Parameter worklistId wurde nicht gefunden`; `/sap/bc/adt/atc` e `/atc/objectsets` não existem.
- **Pacote como alvo funciona**, e é o gate de verdade: `{ pacote: '$TMP' }` → 35 objetos / 222
  findings em 91 s; `{ pacote: 'J1BNFE' }` → 18 objetos / 11 findings em 116 s. Quantos objetos de
  um pacote grande entram na worklist não foi isolado (o J1BNFE tem 2.538 objetos e apareceram 18)
  — **não trate a contagem de um pacote grande como cobertura completa** sem medir de novo.

## O que ficou de fora

- **Isenções** (`atc/exemptions/apply`, `atc/checkexemptionsview`): pedir e aprovar isenção de
  finding tem coleção no discovery, não foi medido. `verificar({ incluirIsentos: true })` só muda o
  filtro da leitura.
- **Quickfix**: o finding traz `quickfixInfo` e existe `/sap/bc/adt/quickfixes/evaluation` no
  discovery — aplicar correção automática não foi medido.
- **`/sap/bc/adt/checkruns`** (+ `checkruns/reporters`) é outro recurso, do *syntax check* do
  Eclipse — não é ATC, e não foi medido.
- **Criar variante** de check por REST: não procurado. Hoje a variante nasce na SCI/ATC do GUI.
