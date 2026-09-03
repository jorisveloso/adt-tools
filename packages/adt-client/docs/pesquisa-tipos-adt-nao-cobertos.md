# Pesquisa: tipos de objeto ABAP ainda NÃO cobertos pela lib — o que o ADT REST oferece

**Data:** 2026-08-28 · **Método:** leitura do CÓDIGO de clientes ADT open source e do guia SAP de
configuração do back-end (prefixos de `S_ADT_RES`); nada de memória. **Estado:** pesquisa, não
medição — nenhuma linha abaixo foi provada contra um sistema. O passo seguinte é o
`scripts/spike-discovery.mjs` no sistema-alvo, e depois spike de create no `$TMP`.

Os 16 tipos já cobertos (`tipos/*.mjs`) estão fora desta lista.

## Fontes

| Sigla | Fonte | Versão lida |
|---|---|---|
| [AA] | `marcellourbani/abap-adt-api` — `src/api/objectcreator.ts`, `objectcontents.ts`, `objectstructure.ts`, `discovery.ts`, testes | commit `b73a0a1e` (2026-08-04) |
| [RFS] | `marcellourbani/vscode_abap_remote_fs` — `modules/abapObject/src/registry.ts`, `AbapObject.ts`, `objectTypes/AbapXml.ts`, `client/src/adt/operations/AdtObjectCreator.ts` | commit `b7defbbe` (2026-08-26) |
| [SC] | `jfilak/sapcli` — `sap/adt/transaction.py`, `package.py`, `enhancement_implementation.py`, `function.py`, `authorization_field.py`, `objects.py`, fixtures | commit `cb05a8ec` (2026-08-10) |
| [CG] | SAP *Configuring the ABAP Back-end for ADT* 7.57 FPS00, §2.1.1 "URI Prefixes for S_ADT_RES" — https://help.sap.com/doc/2e65ad9a26c84878b1413009f8ac07c3/202210.000/en-US/config_guide_system_backend_abap_development_tools.pdf | 2022-10 |
| [OUX] | `SAP/open-ux-tools` — `ui5-abap-repository-service.ts`, `filestore-service.ts` | main, 2026-08-28 |

Sem nada relevante: `pacroy/abap-ci-postman` (só abapunit/atc/coverage), `mario-andreschak/mcp-abap-adt`, `abaplint`.

Convenção: **criável** = existe POST na coleção em código de cliente; **só legível** = só GET;
**não encontrado** = nenhuma fonte primária confirma.

## Resumo

| Tipo | adtType | Coleção `/sap/bc/adt/…` | Content-Type create / Accept GET | source-based | Criável por ADT? | Fonte |
|---|---|---|---|---|---|---|
| DCLS access control | `DCLS/DL` | `acm/dcl/sources` (validação `acm/dcl/validation`) | create `application/*`; GET `application/vnd.sap.adt.dclSource+xml` | sim (`source/main` text/plain) | **sim (POST)** | [AA] [SC] [CG ≥ 7.40 SP10] |
| DEVC pacote | `DEVC/K` | `packages` (validação `packages/validation`) | create **`packages.v2+xml`** (o v1 dá 415 — medido); GET `v2`/`v1` | não — XML `pak:package` | **sim (POST)** — medido, LOCAL e TRANSPORTÁVEL | [AA] [SC] [CG ≥ 7.31 SP04] + spike fila 10 |
| FUGR include | **`FUGR/I`** | `functions/groups/<grp>/includes` | create `application/*`; GET `functions.fincludes.v2+xml` | sim | **sim (POST)** | [AA] [SC] |
| AUTH campo de autorização | `AUTH` (sem subtipo — o RIS devolve `AUTH` nu) | `aps/iam/auth` (validação `…/validation`) | create **`blues.v1+xml`** (o `application/*` também passa); GET idem | não — XML `auth:auth` (sem `source/main`: 404) | **sim (POST)** — medido, e **ALTERA** por lock+PUT | [AA] [SC] + spike fila 13 |
| SUSO objeto de autorização | `SUSO/B` | `aps/iam/suso` | create **`blues.v1+xml`**; GET idem | não — XML `suso:suso` (sem `source/main`: 404) | **sim (POST)** — medido, e altera por lock+PUT | [AA] + spike fila 13 |
| TRAN transação | `TRAN/T` | **`aps/iam/tran`** [SC]; `vit/wb/object_type/trant/…` [AA] (só propriedades) | GET `blues.v2+xml`; source `application/json` | sim — `source/main` em **JSON** | **sim (POST)** segundo [SC] — release desconhecido | [SC] |
| TTYP table type | `TTYP/DA`, `TTYP/TT` | ~~só `vit/wb/object_type/ttypda/…`~~ → **`ddic/tabletypes`** (medido 2026-08-28, S4H 758) | `tabletype.v1+xml` (singular) | não — XML | **sim (POST)** — medido | [RFS] + spike fila 8 |
| SHLP search help | `SHLP/DH` | — | — | — | **não encontrado** | [RFS] |
| ENQU lock object | `ENQU/DL` | ~~só `vit/wb/object_type/enqudl/…`~~ → **`ddic/lockobjects/sources`** (medido 2026-08-29, S4H 758; ao lado `lockmodes`, `tables`, `adjustment`, `validation`) | `lockobjects.v1+xml` create e GET | não — XML `enqu:lockobject` (sem `source/main`: 404) | **sim (POST)** — medido, altera por lock+PUT, a ativação gera os FMs | [RFS] + spike fila 12 |
| VIEW view DDIC | `VIEW/DV`, `VIEW/V` | `ddic/views/{name}` **existe, mas é a view EXTERNA (HANA)**: GET de view clássica (D/C/E) → 500 `ASSERTION_FAILED` em `CL_DDIC_WB_XVIEW_PERSIST`; único accept que o 406 nomeia: `application/vnd.sap.ddic.view+xml`; POST exige `view:view` ns `adt/ddic/view` com `qualifiedHanaViewName` | — | — | **não para view clássica** (medido 2026-08-29, S4H 758) — só SE11 | [RFS] + spike fila 12 |
| XSLT transformação | `XSLT/VT`, `XSLT/XT` | `xslt/transformations` **existe e CRIA** (medido 2026-08-30, S4H 758): POST `trans:transformation` com `trans:transformationType` XSLTProgram \| SimpleTransformation, PUT `/source/main`, ativação genérica, DELETE | `application/vnd.sap.adt.transformations+xml` | sim — módulo `tipos/transformation.mjs` | **cria** (pesquisa desmentida) | [CG] [RFS] + spike fila 20 |
| ENHO/ENHS enhancement | `ENHO/XHB`, `ENHO/XHH`, `ENHS/XSB` | `enhancements/enhoxhb/<n>`, `enhoxhh/<n>/source/main`, `enhsxsb/<n>` | GET `enh.enhoxhb.v4+xml` | XHB: PUT (shortText/active) e DELETE **medidos** 2026-08-30; XHH: source (leitura) | **POST não cria no 758** (400 `I::000` + órfã TADIR, medido); create é pela API `cl_enh_factory` em driver — `enho.mjs` | [SC] [AA] [CG ≥ 7.31 SP11] + spike fila 20 |
| WAPA BSP / app UI5 | — | ADT só `filestore/ui5-bsp/*` (GET); deploy é OData `UI5/ABAP_REPOSITORY_SRV` | — | — | **não por ADT** (OData) | [OUX] [SC] |
| NROB number range | `NROB/NR` | — | — | — | **não encontrado** | [RFS] |
| PARA parâmetro SET/GET | `PARA/R` | — (RFS: só GUI) | — | — | **não encontrado** | [RFS] |
| SMIM MIME | — | — | — | — | **não encontrado** | — |
| TABL append / customizing | — | — | — | — | **não encontrado** | — |
| DDLS extend view | `DDLS/DF` | `ddic/ddl/sources` (nenhum cliente diferencia *extend*) | idem DDLS | sim | sem caso próprio | [AA] [SC] |

## Detalhes por tipo (evidência)

### DCLS — access control
[AA] `objectcreator.ts` L447-454: `{ creationPath: "acm/dcl/sources", nameSpace: 'xmlns:dcl="http://www.sap.com/adt/acm/dclsources"', rootName: "dcl:dclSource", typeId: "DCLS/DL", validationPath: "acm/dcl/validation", maxLen: 30 }`; create L323-328: POST com `Content-Type: application/*`, `qs.corrNr`. [SC] `objects.py` L1564-1573: `ADTObjectType('DCLS/DL', 'acm/dcl/sources', …, 'application/vnd.sap.adt.dclSource+xml', {'text/plain': 'source/main'}, 'dclSource')`. [AA] testes criam/apagam `zadttestcdsaccon`. Gotcha: o tipo é `DCLS/DL`, não `DCLS/DF`; [RFS] usa o mesmo fluxo da CDS (`creatorClass: "AbapCds"`).
**MEDIDO 2026-08-28 (S4H 758, fila item 9)** → módulo `tipos/accessControl.mjs`: a pesquisa estava certa em tudo — coleção `acm/dcl/sources` no discovery (accept `application/vnd.sap.adt.dclSource+xml`, templates de `{object_name}` e `/source/main`), create+PUT+activate pelo `deploySource` genérico. O que a pesquisa não previa: `@MappingRole: true` é exigência de ATIVAÇÃO (ACM_SYNTAX 130), e a anotação `#CHECK`/`#NOT_REQUIRED` da CDS não liga nem desliga a role (ver desmentidos do módulo).

### DEVC — pacote
[AA] `objectcreator.ts` L473-481 e corpo `createBodyPackage` L145-168: `<pak:package … adtcore:type="DEVC/K"><adtcore:packageRef …/><pak:attributes pak:packageType="…"/><pak:superPackage adtcore:name="…"/><pak:applicationComponent/><pak:transport><pak:softwareComponent pak:name="…"/><pak:transportLayer pak:name="…"/></pak:transport>…`. Validação por query string em `POST packages/validation` (`objname, description, objtype, packagename, swcomp, packagetype, transportLayer`). [SC] `package.py` L36-44: accepts `packages.v2+xml`/`v1+xml`, sem `source/main`; `doc/commands/package.md`: "Creates non-transportable packages"; `pak:recordChanges` não editável depois. [SC] fixture do discovery: `<app:collection href="/sap/bc/adt/packages">` com `<atom:category term="devck" scheme="http://www.sap.com/wbobj/packages"/>`. Gotchas: [AA] hardcoda `packageRef YMU_RAP` no corpo (não copiar); pacote não tem `loadStructure` pós-create ([RFS] `AdtObjectCreator.ts` L147).

**MEDIDO 2026-08-28 (S4H 758, spike da fila 10 → `tipos/package.mjs`):** create é POST em
`/sap/bc/adt/packages` com **`packages.v2+xml`** (o `v1+xml` dá 415). O body precisa dos SETE
elementos do schema na ordem (`attributes, superPackage, applicationComponent, transport,
useAccesses, packageInterfaces, subPackages`) — falta um, 400 "Elem.'…' esperado", um por vez. E
`adtcore:responsible` é obrigatório **em maiúsculas** (400 PAK 049). Nasce ATIVO (201, version
active; o /activation responde `activationExecuted="false"` — no-op). Desmentido do [SC] ("cria só
não-transportáveis"): o transportável cria, **sem `corrNr`** — e o SAP gera TR + tarefa sozinho.

### FUGR/I — include de grupo de funções
[AA] L428-436: `{ creationPath: "functions/groups/%s/includes", nameSpace: 'xmlns:finclude="http://www.sap.com/adt/functions/fincludes"', rootName: "finclude:abapFunctionGroupInclude", typeId: "FUGR/I", validationPath: "functions/validation", maxLen: 3 }`; corpo com `<adtcore:containerRef adtcore:name="<grupo>" adtcore:type="FUGR/F" adtcore:uri="…"/>`; validação usa `fugrname`. [SC] `function.py` L429-438: accepts `functions.fincludes.v2+xml`/`+xml`, `source/main` text/plain, basepath com `groupname.lower()`. Gotcha: `maxLen: 3` — o nome é o sufixo de 3 caracteres. Encaixa no módulo `functionModule` existente (mesmo contêiner, `path` aninhado).

### AUTH / SUSO — autorização  (MEDIDO 2026-08-29, S4H 758 — fila 13)
[AA] L501-518: `aps/iam/auth` (typeId `AUTH`, `rootName: "auth:auth"`, ns `http://www.sap.com/iam/auth`, `maxLen: 10`) e `aps/iam/suso` (typeId `SUSO/B`, `rootName: "susob:suso"`, ns `http://www.sap.com/iam/suso`); corpo `createBodySimple`, `Content-Type: application/*`. [SC] `authorization_field.py`: AUTH com Accept `blues.v1+xml`, sem source, alteração não suportada. [RFS] também lista `SUSH` (`.sush.xml`) — sem coleção encontrada. Release mínimo de `aps/iam/*`: **ausente** da tabela 7.57 do [CG].

**O que o spike mediu, e onde a pesquisa errou:** as duas coleções criam (201) e **alteram** por lock → PUT → unlock — o "alteração não suportada" do [SC] está desmentido (rollName BUKRS→WERKS_D chegou à AUTHX). O `maxLen: 10` do [AA] está errado *para o create do AUTH*: AUTHX-FIELDNAME é CHAR 30 e o create aceita 11 (201); os 10 valem para **TOBJ-FIEL\*** (XUFIELD) e só mordem no create do SUSO — 400 "erro na deserialização … ST SUSO", que não diz qual campo estourou. `SUSO/B` tem subtipo, `AUTH` **não** (o RIS devolve `AUTH` nu — o validador do registro precisou aceitar isso). Ativação é **no-op** nos dois (`activationExecuted="false"`: nascem ativos). Nenhum dos dois tem `/source/main` (404). E o `aps/iam/sush` **existe** no discovery do s4h 758, ao contrário do que a pesquisa registrou — não medido além da presença.

### TRAN/T — transação (desmente "impossível por ADT REST", com ressalva)
[SC] `transaction.py` L164-176: `ADTObjectType('TRAN/T', 'aps/iam/tran', …, ['application/vnd.sap.adt.blues.v2+xml', 'application/vnd.sap.adt.blues.v1+xml'], {'application/json': 'source/main'}, 'blueSource', source_mimetype='application/json')`. Create L298-329: `POST /sap/bc/adt/aps/iam/tran` com `blue:blueSource` + `<blue:additionalCreationProperties><adtcore:content adtcore:encoding="base64" adtcore:type="application/vnd.sap.adt.serverdriven.content.v1+json">…</adtcore:content></blue:additionalCreationProperties>`; o JSON é plano: `transactionType` (`reportTransaction|parameterTransaction|dialogTransaction|ooTransaction|variantTransaction`), `reportName`, `reportDynnr`, `parParentTransactionCode`, `programName`, `className`, `methodName`, `updateMode`, `metadata{name,description,package}`. Fixture L3-43 aparenta resposta real (`adtcore:masterSystem="C50"`, `changedAt="2026-04-26"`). Commit `d7a6f2d2` (2026-04-27): "the ADT API requires the transaction specification as base64-encoded JSON … matching the Accept header pattern from captured HTTP traffic" — **não declara release/sistema**. Caminho antigo: [AA] `main.test.ts` L361-366 usa `/vit/wb/object_type/trant/…` com `eatResourceNotFound // for older systems`; [CG]: `/sap/bc/adt/vit/wb*` = "objetos sem editor nativo no ADT", 7.51. **Conclusão:** a skill descreve o estado de [AA]/[RFS]; o [SC] mostra coleção nativa `aps/iam/tran`. Em qual release ela existe é o que o spike precisa medir.

### ENQU e VIEW — o que o spike do item 12 mediu (2026-08-29, S4H 758)
**ENQU cria.** A coleção nativa é `ddic/lockobjects/sources` (categoria `enqudl`), media type `application/vnd.sap.adt.lockobjects.v1+xml` no create e no GET, XML `enqu:lockobject` com `allowRFC`, `primaryTable{tableName,lockMode}`, `secondaryTables`, `lockParameters{parameterWanted,parameterName,tableName,fieldName}` (molde: EMMARAE, E_TABLE, EVVBAKE, `/ACCGO/E_DPQS`); sem `source/main` (404). Nasce **inativo**; a ativação gera `ENQUEUE_<nome>`/`DEQUEUE_<nome>` em `/1BCDWBEN/SAPLTEN0000` (TFDIR, `FMODE='R'` com `allowRFC`). Três desvios que a pesquisa não previa: (1) o nome **tem de começar por E** — sem ele o POST devolve **409** "Não é possível criar objetos de teste em conjuntos de nomes externos" (a lib passou a ter `nomeacao.prefixo`, e o Z/Y roda depois do E); (2) o create **não valida a tabela** (201 com tabela inexistente; a ativação recusa com D0 408); (3) **tabela secundária sem chave estrangeira para a primária é descartada em silêncio** (PUT 200, ativação limpa, `secondaryTables` vazio no GET e DD26S só com a primária) — com FK no DDL (que exige campo com data element, E2 181) persiste. `OBJNAME_MAXLENGTH` 16 pelo typestructure. Prova pelo efeito: driver classrun trava a chave, `DESTINATION 'NONE'` na mesma chave → `FOREIGN_LOCK` (1), outra chave → 0, depois do DEQUEUE → 0. Gotcha do laboratório: lock tomado por `DESTINATION 'NONE'` ou `_scope=2` **sobrevive ao fim do driver e ao DELETE do lock object** (a sessão ADT continua viva) — o driver termina com `DEQUEUE_ALL` nos dois contextos.

**VIEW clássica não cria.** `ddic/views` está no discovery sem `app:accept`; o 406 nomeia `application/vnd.sap.ddic.view+xml` (namespace `ddic`, não `adt`); com ele, GET de `V_USR_NAME` (D), `V_TVKO` (C) e `ENT2180` (E) → **500 `ASSERTION_FAILED` em `CL_DDIC_WB_XVIEW_PERSIST`** (lido em `/sap/bc/adt/runtime/dumps`, accept `application/atom+xml;type=feed`); `application/*` dá o mesmo dump. O POST pede `view:view` no namespace `http://www.sap.com/adt/ddic/view` e, com ele, o atributo `qualifiedHanaViewName` — é o recurso de **view externa (HANA proxy)**, não da view de dicionário. `$validation` é POST com parâmetro `objname`. O `typestructure` diz `CAPABILITIES CREATE` para `VIEW/DV`, mas a `URI_TEMPLATE` é o `/vit/` (SAP GUI). Conclusão medida: view clássica é só SE11 no 758.

### TTYP, SHLP, ENQU, VIEW, NROB, PARA
Só o código de tipo nos filtros de busca do [RFS] (`registry.ts`: `TTYP/DA` L272, `SHLP/DH` L312, `ENQU/DL` L319, `VIEW/DV` L298, `NROB/NR` L333, `PARA/R` L370), todos sem `creatorClass`; TTYP e ENQU aparecem sob o wrapper `/vit/` (ENQU: teste "create unsupported object", `AbapObject.ts` L117-119 marca `/sap/bc/adt/vit` como não suportado). Nenhuma coleção `ddic/tabletypes`, `ddic/searchhelps`, `ddic/lockobjects`, `ddic/views` em código; `ddic/views/{name}` só em documentação de produto terceiro (ARC-1), leitura.

### XSLT
[CG]: prefixo `/sap/bc/adt/xslt/*  XSLT transformations`. [RFS] `registry.ts` L186-205: `XSLT/VT` (Simple Transformation, `creatorClass: "AbapXml"`), `XSLT/XT`, `STOB/ST`; `AbapXml.ts` L38-41: para `XSLT/VT` o conteúdo vai pelo `abapsource:sourceUri`, com PUT (`application/*` se o corpo começa com `<?xml`). Coleção exata e create não encontrados — o path vem do nodestructure, não é hardcoded.

### ENHO / ENHS
[SC] `enhancement_implementation.py` L145-154: `ENHO/XHB` em `enhancements/enhoxhb`, accepts `enh.enhoxhb.v4+xml`/`v3+xml`, `ADTObjectPropertyEditor` ("No code can be written"; alteração = PUT do XML com lockHandle). Fixture real referencia `enhancements/enhsxsb/<spot>` (`ENHS/XSB`) e `#type=enhs%2fxb` (`ENHS/XB`). [AA] `enhancements.ts` L137-188: `GET …/source/main/enhancements` (ECC) vs `…/enhancements/elements` (S/4). Nenhum POST de create em cliente algum.

### WAPA
[OUX] `ui5-abap-repository-service.ts`: deploy por OData `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` (`POST /Repositories`, `PUT /Repositories('app')`); ADT só `filestore/ui5-bsp/objects/<app>/content` (GET). [SC] `bsp.py` idem (OData). [CG]: `/sap/bc/adt/filestore/ui5-bsp/*  UI5 team provider  7.31 SP04`.

## Mecanismos para fechar o "não encontrado" sem inferir
- `GET /sap/bc/adt/discovery` → `app:collection` com `href`, `app:accept`, `atom:category` — o que o sistema REALMENTE oferece ([AA] `discovery.ts` L33-53). É o que `scripts/spike-discovery.mjs` lê.
- `POST /sap/bc/adt/repository/typestructure` → `SEU_ADT_OBJECT_TYPE_DESCRIPTOR` com `CAPABILITIES`, `URI_TEMPLATE`, `PARENT_OBJECT_TYPE`, `OBJNAME_MAXLENGTH` ([AA] `objectcreator.ts` L234-248; [RFS] `getObjectTypes()` L65-71). **MEDIDO 2026-08-31 (S4H 758, fila 26)** → modo `--tipos` do `spike-discovery.mjs`. POST **sem corpo**, Accept `application/*` → 200 com 651 descritores (+`USER_AUTHORIZATIONS`, o que ESTE usuário pode). A promessa "diz o que é criável" caiu: `CAPABILITIES` descreve o workbench CLÁSSICO — **nem necessário** (BDEF/DDLS/DDLX/SRVB/SRVD dizem "sem CREATE" e o ADT REST cria todos) **nem suficiente** (VIEW/DV diz CREATE e é só SE11) — e TODA `URI_TEMPLATE` é navegação `/vit/`. O que vale é o `OBJNAME_MAXLENGTH`: 6 correções nos módulos (DCLS 30→40, FUGR/I 40→30, e BDEF 30/DDLX 40/SRVB 40/SRVD 40 que não tinham `nomeacao`).

## Sem evidência primária
~~TTYP~~ (medido) · SHLP (tudo — e `ddic/searchhelps` não existe no 758) · ~~ENQU~~ (medido: cria) · ~~VIEW~~ (medido: `ddic/views` é view externa; clássica não cria) · ~~XSLT~~ (medido: cria) · SMIM (tudo) · ~~ENHO~~ (medido: ADT não cria, API cria) · ENHS (create) · WAPA (qualquer POST ADT) · SUSH (create — a coleção `aps/iam/sush` existe no s4h 758, medido) · NROB · PARA · TABL append/customizing · DDLS extend (tratamento distinto) · release mínimo de `aps/iam/*` (AUTH/SUSO medidos em 758; TRAN ausente em 758).
