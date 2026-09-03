# Receita — o mesmo objeto em dois sistemas ("o QA é o DEV?")

Medido em **2026-09-01**, `s4h` 758 (moovi, mandante 250) × `sxd` 816 (KART, mandante 100).
E2E 27/27 pela lib local. Módulo: [`diff.mjs`](../diff.mjs) (`adt-client/diff`).

A pergunta operacional é sempre a mesma: **o objeto que está no sistema A é o que está no B?** A via
é ler os dois pelo ADT e comparar. Nada é escrito: `diff.mjs` é o único módulo da lib sem caminho de
escrita — só `GET`.

```js
import { criarConexao } from 'adt-client';
import { compararObjetos, relatorioMarkdown } from 'adt-client/diff';

const r = await compararObjetos(criarConexao(cfgDev), criarConexao(cfgQas), [
  { tipo: 'class', nome: 'ZCL_PEDIDO' },
  { tipo: 'table', nome: 'ZTPEDIDO' },
  { tipo: 'dataElement', nome: 'ZDE_PEDIDO' },
]);
console.log(relatorioMarkdown(r));
```

Veredito por objeto: `igual` · `difere` · `soEmA` · `soEmB` · `ausente` (não existe em nenhum dos
dois — **nunca** `igual`).

## O que a comparação lê, por tipo

| Tipo | O que é comparado | Por quê |
|---|---|---|
| classe (CLAS) | `/source/main` **+ os 4 includes** (`definitions`, `implementations`, `macros`, `testclasses`) | o `main` não traz os includes locais — ver o silêncio abaixo |
| demais tipos com fonte (TABL, DDLS, INTF, PROG, SRVD…) | `/source/main` | é onde a definição mora |
| tipos de forma `xml` (DTEL, DOMA, TTYP, AUTH, SUSO, ENQU) | o **XML do objeto**, limpo, atributo a atributo | não têm `/source/main` — ele responde 404 |

`partesDoTipo(tipo)` é quem decide, a partir do campo `source` do módulo de tipo. Tipo novo entra
sozinho na comparação.

## Os três silêncios do `getSource` (medidos)

Todos os três dão **"igual"** para objetos que não foram comparados:

1. **Tipo sem fonte.** `GET .../dataelements/bukrs/source/main` → **404** com o corpo
   `Nenhum recurso adequado encontrado` (34 bytes) — o MESMO texto nos dois sistemas. Comparar os
   dois corpos de erro devolve "idênticos".
2. **Parte de classe ausente.** `includes/testclasses` de uma classe sem teste → 404 com o mesmo XML
   de exceção nos dois (576 bytes).
3. **O `main` da classe não é a classe.** Medido no experimento controlado: `YJBV_POC_DIFF` com o
   mesmo `main` (255 bytes, byte a byte igual nos dois) e classes de teste diferentes
   (`exp = 2` × `exp = 99`) — o `/source/main` sozinho diz **IGUAL**; a comparação por partes acusa
   `testclasses = difere`.

**Guard-rail da lib:** só entra na comparação a parte que veio **200 dos dois lados**. 404 nos dois
= `ausente` (não conta como conteúdo); 200 × 404 = a parte só existe num sistema, e o objeto difere.

## O XML não é comparável cru

Para o **mesmo** objeto padrão, o XML difere sempre — e nunca por conteúdo:

| Ruído | Medição |
|---|---|
| `adtcore:changedAt` | DTEL `BUKRS`: `2018-01-26T11:33:42Z` (s4h) × `14:33:42Z` (sxd) |
| lista de `<atom:link>` | 4 links no 758 × 5 no 816 (DTEL/DOMA `BUKRS`), 4 × 6 (DTEL `MATNR`) |

`limparXmlVolatil` remove os `<atom:link>` e os atributos `changedAt`/`createdAt`/`version`/`etag`.
Depois disso, **os três objetos ficam idênticos byte a byte**. A comparação do que sobra é feita
atributo a atributo (`diffAtributos`), que é o que dá uma saída legível — um diff de texto do XML
diria só "a linha 1 mudou".

### O carimbo de data não responde à pergunta

O `changedAt` sai **no fuso do servidor**, e o deslocamento **varia com a data gravada**:

| Objeto | s4h | sxd | diferença |
|---|---|---|---|
| `INTF IF_OO_ADT_CLASSRUN` | 2018-01-26T14:13:26Z | 17:13:26Z | 3 h |
| `DTEL BUKRS` | 2018-01-26T11:33:42Z | 14:33:42Z | 3 h |
| `TABL TADIR` | 2019-11-08T07:20:12Z | 11:20:12Z | 4 h |
| `DOMA BUKRS` | 1998-02-17T11:25:01Z | 15:25:01Z | 4 h |

É o mesmo fuso torto dos itens 22 e 28 (TTZCU em `CET`, SO em BRT). Como o deslocamento não é
constante, **não dá nem para corrigir por offset fixo**: "mudou depois" entre dois sistemas é
indecidível pelo carimbo. Por isso ele sai como **aviso** no relatório e nunca como veredito.

## Normalização: o que é ruído e o que é conteúdo

O default normaliza **só** quebra de linha e espaço no fim — e isso não é opcional: o `/source/main`
devolve **CRLF** em ABAP (classe, interface) e **LF puro** no DDL de tabela, no mesmo sistema.

`ignorarEspaco` e `ignorarCaixa` são decisões declaradas de quem compara. O quanto elas mudam foi
medido no corpus 758 × 816 (linhas divergentes, `só em A`/`só em B`):

| Objeto | cru | + espaço | + caixa |
|---|---|---|---|
| `CL_SALV_TABLE` | 197/175 | 175/153 | **74/52** |
| `CL_ABAP_TYPEDESCR` | 15/4 | 13/2 | 13/2 |
| `IF_HTTP_CLIENT` | 1/22 | 1/22 | 1/22 |
| `CL_GUI_FRONTEND_SERVICES` | 1/5 | 1/5 | 1/5 |
| `I_COMPANYCODE` (CDS) | 0/1 | 0/1 | 0/1 |
| `TADIR` | 0/0 | 0/0 | 0/0 |

Em `CL_SALV_TABLE`, **62% do "difere" era pretty-print** (`CLASS cl_salv_table DEFINITION` ×
`class CL_SALV_TABLE definition`); nos outros cinco a normalização não mudou nada. Ou seja: ligar
`ignorarCaixa` por padrão esconderia pouco ruído e muita informação.

`ignorarCaixa` **nunca** toca literal (`'…'`, `` `…` ``, `|…|`) nem comentário (`*` na coluna 1, `"`
até o fim da linha): ABAP é case-insensitive no código e case-**sensitive** no texto — `WRITE 'abc'`
e `WRITE 'ABC'` são programas diferentes.

## Guard-rail: dois mandantes do mesmo sistema não provam nada

O repositório ABAP é **cross-client**. Comparar `s4h:250` com `s4h:200` devolveria "igual" sempre —
não porque os sistemas estão iguais, mas porque é o mesmo repositório. `compararObjetos` recusa antes
da rede quando as duas conexões apontam para a mesma `base`.

## Sessão

`compararObjetos` abre **uma sessão stateless por sistema** e a encerra no `finally`. Leitura não
precisa de stateful, e sessão órfã derruba o ADT (ver `sap-connection.mjs`).

## O que a lib entrega, e o que fica fora

Entrega: veredito por objeto, diff unificado por parte (com número de linha dos dois lados e a linha
**como ela é no sistema**, mesmo quando a comparação rodou normalizada), diff atributo a atributo
para tipo sem fonte, e `relatorioMarkdown` — a saída que se cola num ticket.

Fica fora (não medido, não implementado):

- **descobrir** o que comparar (varrer um pacote, uma TR ou um padrão de nome nos dois sistemas): a
  lista de objetos vem de quem chama. O `search.mjs` e o `cts.mjs` são os insumos óbvios.
- **versão inativa**: a comparação lê a versão ativa (o que o `GET` devolve).
- tipos cujo conteúdo não está nem no fonte nem no XML do ADT (SM30/TOBJ, intervalos de numeração,
  conteúdo de tabela) — para esses, quem responde é a leitura por SOAP/driver do módulo do tipo.
- o **diff em disco**: continua sendo o checkout do `jbv-abapgit` + git.

## Por que na lib, e não no `jbv-abapgit`

Decisão do item 35, com o fato ao lado: o CLI compara **checkouts** — precisa de destino em disco, de
um tipo que ele saiba baixar, e de duas passadas completas antes de responder qualquer coisa. Aqui a
comparação é leitura direta, objeto a objeto, e alcança **todo tipo do registro** — inclusive os de
forma `xml`, que o checkout não escreve em disco. As duas coisas convivem: quem quer histórico
versiona o checkout; quem quer a resposta chama `compararObjetos`.
