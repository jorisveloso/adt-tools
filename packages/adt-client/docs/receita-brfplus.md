# Receita — BRF+ pela anatomia da change request

**Medido em 2026-08-30, S4H rel. 758, mandante 250. Somente leitura, só SOAP RFC** (o ADT stateful do s4h
estava em "Session not found"): nenhum objeto criado, alterado ou apagado. Item 23 da fila (ideia I21).

BRF+ **não tem coleção ADT** (a workbench é Web Dynpro; o repositório FDT é API ABAP, `cl_fdt_factory`) —
e não precisa dela para LEITURA: o repositório inteiro é uma família de tabelas `FDT_*` legível por
`readTable`, e o transporte é por **chave** (E071K), que o item 21 (`fatiarChaves`) corta limpo. Não entrou
código novo na lib: `cts.anatomia`/`lerRequestPorTabelas` + `readTable` já cobrem tudo daqui.

## O catálogo: FDT_ADMN_0000

Uma linha por objeto BRF+, em todo mandante. É a resposta a "o que compõe uma aplicação":

```
ID              CHAR 32 — o GUID do objeto (a identidade real; nome é atributo)
OBJECT_TYPE     AP aplicação · FU função · RS ruleset · EX expressão (decision table…) · DO data object
NAME            o nome legível (expressão pode não ter)
APPLICATION_ID  o ID da aplicação dona — é o agrupador
CR_USER / LOCAL_OBJECT / DELETED / OSYSID / TRANSPORTED
```

Medido no s4h: 123 aplicações, **26 criadas no próprio S4H** (usuários `MV*`, `YCANO`) — a suposição da
cobertura ("FDT0 zero no custom") não significava "não há BRF+ custom": significava que o custom de lá
**não passa pela TADIR** (abaixo). Composição de uma app real (`OPD_EF_PURCHASE_CONTRACT`, YCANO):
**76 objetos = 1 AP + 38 DO + 23 EX + 7 FU + 7 RS** — `readTable FDT_ADMN_0000 WHERE APPLICATION_ID = <id>`.

## As DUAS vias de transporte (as duas medidas)

| | workbench (sistema) | customizing (mandante) |
|---|---|---|
| TADIR | `R3TR FDT0 <NOME da app>` | **nada** — invisível à TADIR |
| entrada de conteúdo | `R3TR TDAT FDT0001` | `R3TR TDAT FDT0000` |
| chaves E071K sobre | tabelas-SOMBRA `FDT_*S` | tabelas normais `FDT_*` |
| TABKEY | `ID(32) [+VERSION(6)] [+LANGU*]` | **`CLIENT(3)` +** `ID(32) [+VERSION(6)] [+LANGU*]` |
| medido em | `SAPKA70208`: `FDT0 BRFPLUS_SYSTEM_BRF` + 251 chaves de 15 IDs | `S4HK900330` (999+ chaves, 133 IDs, "MM - Output Management") e `S4HK901218` (2 IDs) |

- O nome do `FDT0` na TADIR é o **NOME da aplicação** (`FKK_EVENT_SAMPLE`, `BRF_SPLEDGER_DOCS`…), não GUID —
  a nota da `cobertura-tadir.md` estava errada nisso. A ponte nome → GUID é a **`FDT_APPL_TADIR`**
  (`NAME`, `TABLE_TYPE = 'S'`, `ID`), que é também a tabela primária do objeto lógico `FDT0` na `OBJSL`.
- **Todo o custom do s4h é da via customizing**: nenhuma das 26 apps locais tem linha na `FDT_APPL_TADIR`
  nem na TADIR. Quem procurar BRF+ de cliente pela TADIR não acha — procurar por
  `FDT_ADMN_0000 WHERE OSYSID = '<SID>'` (ou `CR_USER`).
- `OBJH`: `FDT0` e `BRF0` são objeto lógico tipo `L` (transporte por chave). `BRF0` é o **BRF clássico**
  (tabelas `TBRF*`), outra ferramenta — 42 na TADIR, tudo SAP; não confundir com BRF+ (`FDT*`).
- Os IDs das TRs de ENTREGA SAP (`SAPKA70208`: `0000AAAB04…`) não existem na `FDT_ADMN_0000` do 250 —
  placeholder de release antigo; para anatomia de verdade, usar TR local.

## O caminho de leitura (tudo já na lib)

```js
import { lerRequestPorTabelas, fatiarChaves } from 'adt-client/cts';
import { readTable } from 'adt-client/rfc-soap';

// 1. a TR: chaves já fatiadas — CLIENT/ID/VERSION nomeados (item 21)
const t = await lerRequestPorTabelas(cfg, 'S4HK900330', { fatiar: true });
t.consolidado.chaves[0];   // { OBJNAME: 'FDT_ADMN_0001', TABKEY: '250005056B2532A1ED5B5B22162956F26BE',
                           //   campos: { CLIENT: '250', ID: '005056B2532A1ED5B5B22162956F26BE' }, completo: true }

// 2. cada ID → o que é, de quem, de qual aplicação
await readTable(cfg, 'FDT_ADMN_0000', { where: [`ID = '005056B2532A1ED5B5B22162956F26BE'`] });
//   → OBJECT_TYPE 'DO', NAME 'APOC_S_BRF_DT_EMAIL_SENDER', APPLICATION_ID …, CR_USER 'YCANO'

// 3. a aplicação inteira (a "anatomia" sem TR): todos os objetos dela
await readTable(cfg, 'FDT_ADMN_0000', { where: [`APPLICATION_ID = '<id da app>'`], linhas: 999 });

// 4. o conteúdo de cada peça: readTable da própria FDT_* apontada pela chave (whereDaChave/lerLinhaDaChave)
```

As tabelas vistas nas TRs medidas: `FDT_ADMN_*` (administração/textos), `FDT_APPL_*` (aplicação),
`FDT_DOBJ_*` (data objects), `FDT_EXPR_*` (expressões — decision table etc.), `FDT_EXTY_*` (tipos de
expressão), `FDT_FNCT_*` (funções), `FDT_ACTN_*` (ações), `FDT_DDBV_*` (DB lookup) — sufixo `S` = sombra
de transporte da via workbench. A regra de chave é uniforme: `[CLIENT +] ID + [VERSION] + [LANGU]`.

## Limites e decisões

- **`R3TR TDAT <obj>` no `cts.diff`**: `TDAT` é objeto LÓGICO (nome = `FDT0000`, vive na `OBJH`, não na
  TADIR) — a entrada de objeto sai `sem-medida` no diff; o juízo real está nas **chaves** (`por-chave`),
  que o diff já cobre.
- **Escrita nas `FDT_*` à mão: nunca** (versionamento + vínculos por GUID). O caminho pela API
  `cl_fdt_factory` foi medido e virou `brf.mjs` — ver a seção **Criar, executar e apagar** abaixo (item 37).
- Versões (`FDT_ADMN_0010` etc. têm `VERSION`) e o significado fino de cada `FDT_EXPR_*` não foram
  destrinchados — leitura suficiente para anatomia e diff, não para reconstruir a semântica da regra.

## Criar, executar e apagar (item 37 — medido 2026-08-30, S4H 758)

`brf.mjs` — o padrão dos módulos por driver (`enho.mjs`, `tran.mjs`): a lib gera o fonte ABAP, o
`deployAndRun` cria a classe no `$TMP`, executa em sessão nova stateless e apaga o driver no fim.
A **cobaia da assinatura** foram os demos que a SAP entrega no próprio sistema — `FDT_DEMO_REPORT_DECISION_TABLE`,
`FDT_DEMO_REPORT_APPLICATION`, `FDT_DEMO_QUERY_OBJECTS` (21 `FDT_DEMO%` na TRDIR do 758), lidos por
`getSource` stateless: é o código que comprovadamente compila no release, não doc de versão errada.

```js
import { deployDecisionTable, executarFuncao, deleteAplicacao } from 'adt-client/brf';

// cria app LOCAL + elementos TEXT + decision table + função — e TESTA dentro do driver
const p = await deployDecisionTable(conexao, {
  app: 'YJBV_POC_APP2',
  contexto: ['TIPO', 'CANAL'],
  resultado: 'PARECER',
  regras: [
    { quando: { TIPO: 'A', CANAL: 'WEB' }, entao: 'APROVADO' },
    { quando: { TIPO: 'A' }, entao: 'MANUAL' },              // célula sem valor = CURINGA
    { quando: { TIPO: 'B', CANAL: 'LOJA' }, entao: 'REJEITADO' },
  ],
  testes: [{ TIPO: 'A', CANAL: 'WEB' }, { TIPO: 'C', CANAL: 'WEB' }],
});
p.resultados;   // { '1': 'APROVADO', '2': 'SEM_CONCORDANCIA' } — appId/dtId/funcId também voltam

// executa uma função EXISTENTE por nome (o caso real: chamar a regra do cliente)
await executarFuncao(conexao, { funcao: 'YJBV_POC_APP2_FN', valores: { TIPO: 'B', CANAL: 'LOJA' } });
// → { funcId, resultado: 'REJEITADO' }

// apaga a aplicação COM tudo dentro (destrutivo: confirm obrigatório)
await deleteAplicacao(conexao, { app: 'YJBV_POC_APP2', confirm: true });   // { deletado: 'logico' }
```

**O fluxo que a API exige (medido, E2E 6/6):** aplicação primeiro (`create_local_application` →
activate → save → dequeue), depois `cl_fdt_factory=>get_instance( app_id )`; elementos por
`cl_fdt_convenience=>create_element` com `iv_activate = abap_false`; decision table
(`get_expression( gc_exty_decision_table )` → `enqueue( abap_true )` → `set_columns` →
`set_table_data`); função (`set_context_data_objects` + `set_expression`); **activate DEEP na
função** ativa DT e elementos juntos; `save( iv_deep )` + `dequeue( iv_deep )`; execução por
`get_process_context` → `set_value` → `process`.

Gotchas medidos:

- **Descrição da classe driver ≤ 60 caracteres** — o create do ADT recusa acima (400 ExceptionInvalidData).
- **Célula de condição sem range = sempre verdadeira** (curinga) — é como o demo trata `*`. Medido:
  `TIPO='A', CANAL='FONE'` caiu na linha 2 (`CANAL` vazio) → `MANUAL`.
- **Entrada sem linha que case levanta `cx_fdt`** ("Não foram encontradas concordâncias") — comportamento,
  não erro; o driver devolve `SEM_CONCORDANCIA`.
- **Nome de elemento não precisa ser único no sistema** — `TIPO`/`CANAL`/`PARECER` conviveram com o
  resto do 250; nome de **função/aplicação** a lib resolve por `if_fdt_query` (categoria: system +
  customizing + masterdata ligados) e exige match único.
- **Delete é LÓGICO em app local com versões**: `delete_incl_assigned_object( gc_delete_option_del_or_mark )`
  marca `DELETED='X'` na `FDT_ADMN_0000` (app + elementos + DT + função, tudo junto). Delete físico é
  outra opção/relatório — não medido.
- Só **elementos TEXT** e condição de **igualdade** foram medidos — outros tipos (number/amount/boolean),
  operadores de range e mais de uma expressão ficam para caso real.
