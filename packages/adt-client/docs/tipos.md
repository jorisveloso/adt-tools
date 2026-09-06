# Catálogo de tipos de objeto

> **GERADO** por `npm run catalogo` a partir de `tipos/*.mjs` — não editar à mão. Fonte de cada linha é o
> módulo de tipo; mudou o módulo, rode o script (o teste `catalogo.test.mjs` falha se este arquivo ficar para trás).

27 tipos de objeto tratados. Vocabulário em [CONTEXT.md](../CONTEXT.md); decisão de um arquivo por tipo em
[ADR 0001](adr/0001-modulo-por-tipo-descoberto-por-pasta.md).

**Legenda de medição.** *spike* = quando/onde o create+activate foi provado; *medido* num teste = o teste rodou
contra aquele sistema. Vazio = escrito, ainda não provado — não é o mesmo que provado. Os nomes de exemplo
são os objetos `$TMP` das POCs quando havia; os demais estão marcados como reconstituídos/ilustrativos na nota.

## Resumo

| libKey | TADIR | adtType | descrição | forma | source | nome ≤ | spike | releases medidos | canais | contêiner |
|---|---|---|---|---|---|---|---|---|---|---|
| `accessControl` | DCLS | `DCLS/DL` | access control (DCL) | source | sim | 40 | 2026-08-28 · S4H 758 | 758 | adt, classrun |  |
| `applicationJobCatalog` | SAJC | `SAJC` | entrada do catálogo de application job | json | sim | 40 | 2026-09-01 · S4H 758 | 758 | adt, classrun |  |
| `applicationLogObject` | APLO | `APLO/TYP` | objeto do log de aplicação (SLG0) | json | sim | 20 | 2026-08-31 · S4H 758 | 758 | adt, classrun |  |
| `authorizationField` | AUTH | `AUTH` | campo de autorização | xml | não | 10 | 2026-08-29 · S4H 758 | 758 | adt, soapRfc |  |
| `authorizationObject` | SUSO | `SUSO/B` | objeto de autorização | xml | não | 10 | 2026-08-29 · S4H 758 | 758 | adt, classrun, soapRfc |  |
| `behaviorDefinition` | BDEF | `BDEF/BDO` | behavior definition | source | sim | 30 | 2026-07-27 · DEV | 758 | adt, classrun, odata |  |
| `cds` | DDLS | `DDLS/DF` | CDS view | source | sim | 30 | s/ data · DEV | 758 | adt, classrun, odata |  |
| `class` | CLAS | `CLAS/OC` | classe | custom | sim | 30 | 2026-07-19 · DEV | 758, 816 | adt, classrun, aunit |  |
| `dataElement` | DTEL | `DTEL/DE` | data element | xml | não | 30 | s/ data · DEV | 758 | adt, classrun, soapRfc |  |
| `domain` | DOMA | `DOMA/DD` | domínio | xml | não | 30 | 2026-07-27 · DEV | 758 | adt, classrun, soapRfc |  |
| `functionGroup` | FUGR | `FUGR/F` | grupo de funções | custom | não | 26 | 2026-08-26 · S4H 758 | 758, 816 | adt, soapRfc |  |
| `functionGroupInclude` | FUGR | `FUGR/I` | include de grupo de funções | custom | sim | 30 | 2026-08-29 · S4H 758 | 758 | adt, soapRfc | `functionGroup` |
| `functionModule` | FUGR | `FUGR/FF` | function module | custom | sim | 30 | 2026-08-26 · S4H 758 | 758, 816 | adt, soapRfc, aunit | `functionGroup` |
| `include` | PROG | `PROG/I` | include | source | sim | 40 | 2026-07-19 · DEV | 758 | adt, classrun |  |
| `interface` | INTF | `INTF/OI` | interface | source | sim | 30 | 2026-07-19 · DEV | 758 | adt, classrun |  |
| `lockObject` | ENQU | `ENQU/DL` | lock object | xml | não | 16 | 2026-08-29 · S4H 758 | 758 | adt, classrun, soapRfc |  |
| `metadataExtension` | DDLX | `DDLX/EX` | metadata extension | source | sim | 40 | 2026-08-05 · DEV | — | adt, odata, wdi5 |  |
| `msag` | MSAG | `MSAG/N` | classe de mensagens | custom | não | 20 | 2026-07-19 · DEV | 758 | adt, classrun |  |
| `numberRangeObject` | NROB | `NROB/NRO` | objeto de numeração (SNRO) | json | sim | 10 | 2026-09-01 · S4H 758 | 758 | adt, classrun |  |
| `package` | DEVC | `DEVC/K` | pacote | custom | não | 30 | 2026-08-28 · S4H 758 | 758 | adt |  |
| `prog` | PROG | `PROG/P` | programa | source | sim | 40 | 2026-07-19 · DEV | 758 | adt, classrun, aunit |  |
| `serviceBinding` | SRVB | `SRVB/SVB` | service binding | custom | não | 40 | 2026-07-27 · DEV | 758 | adt, odata, wdi5 |  |
| `serviceDefinition` | SRVD | `SRVD/SRV` | service definition | source | sim | 40 | 2026-07-27 · DEV | 758 | adt, odata |  |
| `structure` | TABL | `TABL/DS` | estrutura | source | sim | 30 | 2026-07-27 · DEV | 758 | adt, classrun |  |
| `table` | TABL | `TABL/DT` | tabela | source | sim | 16 | s/ data · DEV | 758, 816 | adt, classrun, soapRfc |  |
| `tableType` | TTYP | `TTYP/DA` | table type | xml | não | 30 | 2026-08-28 · S4H 758 | 758 | adt, classrun, soapRfc |  |
| `transformation` | XSLT | `XSLT/VT` | transformação (XSLT / simple transformation) | custom | sim | 30 | 2026-08-30 · S4H 758 | 758 | adt, classrun |  |

Formas de deploy (o que a lib faz com cada uma):

- **source** — create shell → lock → PUT /source/main → unlock → activate (deploySource genérico)
- **xml** — a definição É o body: create(body) se faltar → lock → PUT(body) SEMPRE → unlock → activate (deployBody genérico)
- **custom** — fluxo próprio no gancho `deploy(ctx, conexao, opts)`, montado só com primitivas do ctx
- **json** — família "blue"/AFF (I56): create shell (createBody) → lock → PUT /source/main em application/json SEMPRE → unlock → ativa conforme `ativacaoJson` (deployJson genérico). O content-type do PUT é o único ponto que se repetiu nos três tipos medidos (APLO/NROB/SAJC) — a ativação NÃO: cada um mede a própria.

Entrada única: `deploy(conexao, '<libKey>', { name, … })` — os nomes antigos (`deploySource`, `deployDataElement`,
`deployClassWithTests`, `deployFunctionModule`, …) continuam exportados como atalhos sobre ela. Um erro em qualquer
fluxo sai com a dica do módulo anexada (`→ causa provável / → correção`), vinda dos `erros` do tipo e dos transversais.

## Por tipo

### `accessControl` — access control (DCL) (DCLS/DL)

**O que faz.** Access control (DCLS): a role DCL que restringe o SELECT numa CDS — `define role … grant select on <view> where …`, por literal ou por `aspect pfcg_auth`. É a peça que faltava para a lib montar uma superfície RAP com autorização de dados; o filtro vale para todo SELECT ABAP na view (e, por consequência, para o OData da SRVB — este não medido).

**Como a lib trata.** Shell `dcl:dclSource type="DCLS/DL"` → lock → PUT /source/main com o `define role` → unlock → activate (deploySource genérico, o mesmo fluxo da CDS). Alterar a role ATIVA é o mesmo deploy: o PUT + activate troca o filtro na hora (medido).

- Forma: `source`
- ADT: coleção `/sap/bc/adt/acm/dcl/sources` · Content-Type `application/vnd.sap.adt.dclSource+xml` · /source/main: sim
- Nome: até 40 caracteres (typestructure do s4h 758 (OBJNAME_MAXLENGTH 40, fila 26) — o maxLen 30 do abap-adt-api estava a menor; não medido por rejeição)
- Entrada aceita: `dcls`, `accesscontrol`, `dcl`, `access control`, `controle de acesso`, `dcl source`, `role dcl` (plural com "s" também vale)
- Spike: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `createBody`
- Origem: spike 2026-08-28 (fila item 9): discovery do s4h + GET de I_CADOCUMENTGLITEM/SHSM_DFKKOP · docs/pesquisa-tipos-adt-nao-cobertos.md § DCLS · docs/ideias.md I14
- Depende de:
  - `cds` — a view do `grant select on` — precisa existir e estar ativa antes
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - `@MappingRole: true` é OBRIGATÓRIO: sem ele a ATIVAÇÃO falha (E ACM_SYNTAX 130) — não é "role ativa que não é aplicada"
  - o nome da role no fonte tem de ser o nome do objeto DCLS (`define role <objeto>`)
  - os campos da condição são os ELEMENTOS da view (alias do select), não os campos da tabela base
  - DCL não cria dado nem autorização: quem prova o filtro é um SELECT no driver; `WITH PRIVILEGED ACCESS` é o contrafactual (ignora a role) — medido 2/3 filtrado vs 3/3 privilegiado

**Exemplo de uso.** Role do spike (S4H 758, 2026-08-28) sobre a CDS YJBV_POC_DCL_C (view entity sobre a tabela YJBV_POC_DCL_T, elementos Id/Kind/Texto; 3 linhas, 2 com kind=A). Condição por LITERAL — a forma `where ( CompanyCode ) = aspect pfcg_auth( F_KKKO_BUK, BUKRS, ACTVT = '03' )` é a dos objetos padrão e não foi medida aqui (exige perfil PFCG).

```js
await deploy(conexao, 'accessControl', {
  name: "YJBV_POC_DCL",
  pkg: "$TMP",
  description: "POC access control",
  source: `@EndUserText.label: 'POC access control'
@MappingRole: true
define role YJBV_POC_DCL {
  grant select on YJBV_POC_DCL_C
    where Kind = 'A';
}`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'DCLS'","AND OBJ_NAME = 'YJBV_POC_DCL'"] })` → 1 linha (PGMID='R3TR', DEVCLASS do pacote). Estado ativo: getObject → adtcore:version="active". Efeito: SELECT na view protegida pelo driver, contra WITH PRIVILEGED ACCESS. *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — driver lê a view três vezes — com a role, ignorando a role (WITH PRIVILEGED ACCESS) e na tabela base. A DIFERENÇA é o assert: o filtro veio da DCL, não do dado *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_dclr DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_dclr IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       SELECT FROM yjbv_poc_dcl_c FIELDS Id, Kind INTO TABLE @DATA(lt).
       SELECT FROM yjbv_poc_dcl_c WITH PRIVILEGED ACCESS FIELDS Id INTO TABLE @DATA(lp).
       SELECT FROM yjbv_poc_dcl_t FIELDS id INTO TABLE @DATA(lb).
       out->write( |R dcl={ lines( lt ) } privileged={ lines( lp ) } base={ lines( lb ) }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"R dcl=2 privileged=3 base=3","espera":"com a role `where Kind = 'A'` ativa: 2 de 3. Trocando a role para `Kind = 'B'` pelo mesmo deploy: dcl=1 (medido). ANTES de existir DCL alguma, a mesma view #CHECK devolve dcl=3 — ausência de role não bloqueia."}`

2. **`readTable`** — a role existe no diretório de objetos, visto de outra LUW (SOAP RFC) *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TADIR","campos":["PGMID","OBJECT","OBJ_NAME","DEVCLASS"],"where":["OBJECT = 'DCLS'","AND OBJ_NAME = 'YJBV_POC_DCL'"]},"espera":"1 linha: PGMID='R3TR', OBJECT='DCLS', DEVCLASS='$TMP' (medido). Estado ativo: getObject → adtcore:version=\"active\"."}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| `MappingRole` | o fonte não tem `@MappingRole: true` — ACM_SYNTAX 130 "Zugriffsrollen müssen Annotation @MappingRole haben", com W EU 202 e activationExecuted="false" | anotar `@MappingRole: true` acima do `define role`. A versão ativa anterior continua valendo até a ativação passar (medido 2026-08-28) |
| `grant select on` | a view do `grant select on` não existe, não está ativa, ou o campo da condição não é elemento dela | ativar a CDS primeiro (dependência) e usar os nomes dos ELEMENTOS da view, não os campos da tabela base |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| CDS com `@AccessControl.authorizationCheck: #CHECK` e nenhuma DCL não devolve linha nenhuma | devolve TUDO: a view #CHECK sem role alguma leu 3 de 3 linhas (mesmo driver que, com a role, leu 2). Ausência de DCL não é negação — quem não tem role não é filtrado | 2026-08-28 · S4H |
| `#NOT_REQUIRED` na CDS desliga a DCL | não desliga: com a mesma role ativa, a view reativada como #NOT_REQUIRED continuou filtrando 2 de 3. O que a anotação muda é a exigência de haver role, não a aplicação de uma que exista | 2026-08-28 · S4H |

### `applicationJobCatalog` — entrada do catálogo de application job (SAJC)

**O que faz.** Cria/altera a entrada do catálogo de application job: a ligação entre a classe executora (IF_APJ_DT_EXEC_OBJECT + IF_APJ_RT_EXEC_OBJECT) e o framework de jobs. Sem ela, era SJOBREPO/GUI — e sem ela o template (SAJT) não tem a que se referir.

**Como a lib trata.** create `blue:blueSource` com ct `blues.v2+xml` e version="inactive" → lock → PUT /source/main em application/json (o fonte AFF; é ele que grava a APJ_W_JCE_ROOT e lê os parâmetros da classe) → unlock → ACTIVATE **em sessão NOVA** (na sessão do PUT o activate falha dizendo que a classe não existe).

- Forma: `json`
- ADT: coleção `/sap/bc/adt/applicationjob/catalogs` · Content-Type `application/vnd.sap.adt.blues.v2+xml` · Accept do GET `application/*` · /source/main: sim
- Nome: até 40 caracteres (APJ_JOB_CATALOG_ENTRY_NAME / CL_APJ_DT_CREATE_CONTENT=>TY_CATALOG_NAME (c length 40, medido 2026-09-01))
- Entrada aceita: `sajc`, `applicationjobcatalog`, `job catalog`, `catalogo de job`, `application job catalog`, `entrada de catalogo de job` (plural com "s" também vale)
- Spike: 2026-09-01 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `validar`, `createBody`, `body`
- Origem: spike fila 47 (2026-09-01, S4H 758) · discovery: workspace do Application Job → coleções applicationjob/catalogs e applicationjob/templates · $schema servido pelo sistema (sajc-v1.json) · moldes lidos no s4h: ZPFG_JOB_CATALOG, ZPRODUCTS_CATALOG_V5, SAP_CMD_MMPV · docs/receita-application-job.md
- Depende de:
  - `class` — classe executora (IF_APJ_DT_EXEC_OBJECT + IF_APJ_RT_EXEC_OBJECT)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - create só com `application/vnd.sap.adt.blues.v2+xml` — o v1 (o do APLO/NROB) dá 415
  - ATIVE EM SESSÃO NOVA: na sessão que fez o create/PUT o activate devolve activationExecuted="false" e erra o diagnóstico ("Report ou classe  inválida", com o nome VAZIO)
  - a classe executora tem de existir e estar ATIVA antes — ela implementa IF_APJ_DT_EXEC_OBJECT (parâmetros) e IF_APJ_RT_EXEC_OBJECT (execute)
  - PUT do /source/main em `application/json`; `text/plain` não é o media type do fonte AFF
  - os parâmetros do job NÃO vêm no fonte: o PUT chama GET_PARAMETERS da classe e grava a APJ_W_JCE_PAR. Mudou a assinatura na classe? Refaça catálogo e template (a própria SAP avisa isso em CL_APJ_DT_CREATE_CONTENT)
  - o TEMPLATE (SAJT) não sai por ADT REST — o POST da coleção `applicationjob/templates` dá 500 e não cria nada; use `deployJobTemplate` do `adt-client/job`
  - job abortado (status A) com o log de aplicação VAZIO e sem dump na ST22: leia o log do JOB (`lerJobLog`) — e desconfie do "Erro ao instanciar", que aparece mesmo depois de "Class successfully instantiated"

**Exemplo de uso.** o fonte JSON pode vir pronto em `source`; `classe` é o atalho que o monta. O template que aponta para esta entrada sai por `deployJobTemplate` (job.mjs).

```js
await deploy(conexao, 'applicationJobCatalog', {
  name: "YJBV_POC_JOBC",
  pkg: "$TMP",
  description: "POC fila 47 - job catalog entry",
  classe: "YJBV_POC_CL_JOB"
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'APJ_W_JCE_ROOT', { campos: ["JOB_CATALOG_ENTRY_NAME","JOB_CATALOG_ENTRY_VERSION","REPORT_NAME","JOB_TYPE_C"], where: ["JOB_CATALOG_ENTRY_NAME = 'YJBV_POC_JOBC'"] })` → 1 linha, REPORT_NAME = a classe executora e JOB_TYPE_C = 'A' (class based). A linha aparece já no PUT do fonte — o activate é o que dá a versão ativa. Os parâmetros da classe ficam na APJ_W_JCE_PAR. *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — o job agendado a partir do template desta entrada roda e deixa rastro em outra LUW (tabela + log de aplicação) *(medido: 2026-09-01 · S4H 758)*

   ```abap
   // pela lib, não à mão — job.mjs monta os drivers com os gotchas dentro:
   import { deployJobTemplate, agendarJob, esperarJob } from 'adt-client/job';
   await deployJobTemplate(conexao, { template: 'YJBV_POC_JOBTM', catalogo: 'YJBV_POC_JOBC',
     texto: 'POC fila 47', parametros: [{ nome: 'P_FATOR', valor: '7' }] });
   const j = await agendarJob(conexao, { template: 'YJBV_POC_JOBTM', texto: 'POC fila 47' });
   await esperarJob(conexao, j);   // poll de CL_APJ_RT_API=>GET_JOB_STATUS até F/A
   ```

   Assert: `{"console":"AGENDADO jobname=… jobcount=… e depois status=F (finished)","espera":"readTable da tabela que o executor grava, em outra LUW; e o log de aplicação pelo bal.mjs (comLog) desde a marca d’água. Contra-prova: parâmetro que o executor recusa → status A, log com E, nenhuma linha"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 415 | content-type do create diferente de `blues.v2+xml` (o v1 do APLO/NROB não serve aqui) | use `application/vnd.sap.adt.blues.v2+xml` — o media type que o discovery declara na coleção |
| `Report ou classe` | activate rodado na MESMA sessão do create/PUT: o check lê a versão ativa (inexistente) e reclama de uma classe com nome VAZIO | ative em sessão nova (`conexao.sessaoNova()`) — é o que `ativacaoJson: "sessaoNova"` faz sozinho pelo `deployJson` genérico; chamando à mão, encerre a sessão no finally |
| HTTP 406 · `source/main` | GET/PUT do fonte com text/plain ou com um vnd.sap.adt.* inventado | application/json (ou application/*) — o fonte é AFF/JSON |
| HTTP 500 · `NULL` | POST na coleção `applicationjob/templates` (SAJT) — o handler do create do TEMPLATE derreferencia nulo e nada é criado | template não sai por ADT REST: `deployJobTemplate` do `adt-client/job` (driver com CL_APJ_DT_CREATE_CONTENT) |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| os dois tipos do Application Job (SAJC e SAJT) saem por ADT REST, já que o discovery publica as DUAS coleções com $schema, $configuration e source/formatter | só o SAJC sai. O create do SAJT responde 500 "Anular referência da referência NULL" (sem dump ST22) e não grava TADIR nem APJ_W_JT_ROOT — em v1 e v2, com version inactive/active/ausente e com relatedObjectUri. Coleção publicada não é create funcionando | 2026-09-01 · S4H 758 |
| os parâmetros do job são declarados no fonte do catálogo (é o que o $schema sugere: só className) | o fonte não tem parâmetro nenhum — quem os declara é a CLASSE, em IF_APJ_DT_EXEC_OBJECT~GET_PARAMETERS, e o PUT do fonte é que os copia para a APJ_W_JCE_PAR (medido: P_FATOR com MANDATORY_IND=X apareceu lá sem nunca ter sido escrito no JSON) | 2026-09-01 · S4H 758 |

### `applicationLogObject` — objeto do log de aplicação (SLG0) (APLO/TYP)

**O que faz.** Cria/altera o objeto de log de aplicação e seus subobjetos — as chaves que BAL_LOG_CREATE exige e que a SLG1 filtra. Sem ele, era SLG0 (GUI).

**Como a lib trata.** create `blue:blueSource` com ct `blues.v1+xml` → lock → PUT /source/main em application/json (o fonte AFF) → unlock. NÃO ativa: nasce ativo e o PUT já grava BALOBJ/BALSUB.

- Forma: `json`
- ADT: coleção `/sap/bc/adt/applicationlog/objects` · Content-Type `application/vnd.sap.adt.blues.v1+xml` · Accept do GET `application/*` · /source/main: sim
- Nome: até 20 caracteres (OBJNAME_MAXLENGTH do repository/typestructure (medido 2026-08-31) = BALOBJ-OBJECT CHAR 20)
- Entrada aceita: `aplo`, `applicationlogobject`, `slg0`, `objeto de log`, `log de aplicacao` (plural com "s" também vale)
- Spike: 2026-08-31 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `validar`, `createBody`, `body`
- Origem: spike fila 29 (2026-08-31, S4H 758) · discovery: workspace "Others" → coleção applicationlog/objects · $schema servido pelo sistema (aplo-v1.json)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - create só com `application/vnd.sap.adt.blues.v1+xml` (plural) — os outros dão 415 sem nomear o suportado
  - PUT do /source/main em `application/json`; `text/plain` não é o media type do fonte AFF
  - não chame activate: o objeto nasce ativo e o PUT persiste direto (BALOBJ/BALSUB)
  - subobjeto é NOME dentro do objeto, máx. 20 (BALSUBOBJ) — não é objeto de repositório e não tem TADIR própria

**Exemplo de uso.** o fonte JSON pode vir pronto em `source`; `subobjetos` é o atalho que o monta.

```js
await deploy(conexao, 'applicationLogObject', {
  name: "YJBV_POC_LOG29",
  pkg: "$TMP",
  description: "POC fila 29 — application log",
  subobjetos: [
    {
      nome: "POC",
      descricao: "Subobjeto da POC do assert por SLG1"
    }
  ]
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'BALOBJ', { campos: ["OBJECT"], where: ["OBJECT = 'YJBV_POC_LOG29'"] })` → 1 linha. Os subobjetos aparecem na BALSUB (OBJECT + SUBOBJECT); a TADIR tem R3TR APLO <nome>. *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — driver grava um log no objeto criado (BAL_LOG_CREATE + MSG_ADD + DB_SAVE) — o objeto só é "real" se o BAL o aceitar *(medido: 2026-08-31 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_bal29w DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_bal29w IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA ls_log TYPE bal_s_log.
       DATA lv_handle TYPE balloghndl.
       ls_log-object = 'YJBV_POC_LOG29'. ls_log-subobject = 'POC'.
       ls_log-extnumber = 'FILA29-GRAVA'.
       CALL FUNCTION 'BAL_LOG_CREATE'
         EXPORTING i_s_log = ls_log IMPORTING e_log_handle = lv_handle
         EXCEPTIONS OTHERS = 1.
       out->write( |CREATE subrc={ sy-subrc }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"CREATE subrc=0","espera":"subrc 0 prova que objeto+subobjeto existem na BALOBJ/BALSUB; com nome inventado o subrc é 1 (log_header_inconsistent)"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 415 | content-type do create diferente de `blues.v1+xml` | use o media type que o discovery declara na coleção — o corpo do 415 não o nomeia |
| HTTP 406 · `source/main` | GET/PUT do fonte com text/plain ou com um vnd.sap.adt.* inventado | application/json (ou application/*) — o fonte é AFF/JSON |
| HTTP 400 · `uriMappingError` | GET na coleção sem nome de objeto | a coleção só aceita POST; leitura é por objeto (…/objects/<nome>) |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| objeto de log de aplicação só se cria na SLG0 (GUI) ou inserindo em BALOBJ/BALSUB à mão | o ADT REST cria: POST `blues.v1+xml` → 201 já `version="active"`, e o PUT do fonte JSON grava objeto e subobjetos na BALOBJ/BALSUB | 2026-08-31 · S4H 758 |

### `authorizationField` — campo de autorização (AUTH)

**O que faz.** Campo de autorização (AUTH, SU20): o nome que aparece como `ID` num AUTHORITY-CHECK. Carrega o data element que lhe dá tipo e domínio e, opcionalmente, a tabela de verificação que alimenta o help de valores na PFCG. Sozinho não protege nada — só vale dentro de um objeto de autorização (authorizationObject).

**Como a lib trata.** XML puro `auth:auth`, sem /source/main (404): create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody genérico). A ativação é NO-OP (o campo nasce ativo, como o pacote); a chamada fica só para o fluxo ser o mesmo dos outros XML-body. A descrição do objeto é DERIVADA do data element do `rollName` — o `adtcore:description` que você manda é descartado.

- Forma: `xml`
- ADT: coleção `/sap/bc/adt/aps/iam/auth` · Content-Type `application/vnd.sap.adt.blues.v1+xml` · /source/main: não
- Nome: até 10 caracteres (medido 2026-08-29 (S4H 758): AUTHX-FIELDNAME é CHAR 30 e o create ACEITA 11, mas TOBJ-FIEL* é XUFIELD CHAR 10 e o create do SUSO recusa o campo de 11 (400 ST SUSO) — 10 é o limite ÚTIL, não o do create)
- Entrada aceita: `auth`, `authorizationfield`, `campo de autorizacao`, `authorization field`, `authfield`, `su20` (plural com "s" também vale)
- Spike: 2026-08-29 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `soapRfc`
- Ganchos: `validar`, `body`
- Origem: spike 2026-08-29 (fila item 13): discovery do s4h + GET de BUKRS com accept blues.v1+xml · docs/pesquisa-tipos-adt-nao-cobertos.md § AUTH / SUSO · docs/ideias.md I17
- Depende de:
  - `dataElement` — o `rollName` — dá tipo e domínio ao campo; pode ser um data element padrão
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - `def.rollName` é obrigatório: é o data element que dá tipo e domínio ao campo (sem ele o campo nasce sem tipo)
  - nome com mais de 10 caracteres é ACEITO pelo create do AUTH e inutiliza o campo: o SUSO recusa (400 "erro na deserialização … ST SUSO") porque TOBJ-FIEL* é CHAR 10 — o guard-rail de nomeação corta antes da rede
  - ativação é no-op (activationExecuted="false"): o campo nasce ativo — não espere mensagem de ativação
  - a descrição vem do data element, não do `adtcore:description` — para mudar o texto, mude o data element
  - ACTVT é o campo de atividade padrão do SAP e não se recria: use o nome nu na lista de campos do objeto

**Exemplo de uso.** Nome com 10 caracteres de propósito: 11 passa no create do AUTH e depois quebra o create do objeto. O par medido no spike é este campo + o objeto YJBV_POC_O (authorizationObject).

```js
await deploy(conexao, 'authorizationField', {
  name: "YJBV_POC_F",
  pkg: "$TMP",
  description: "POC campo de autorizacao",
  def: {
    rollName: "BUKRS",
    checkTable: "T001"
  }
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'AUTHX', { campos: ["FIELDNAME","ROLLNAME","CHECKTABLE","EXIT_FB","ACTVT_FLAG"], where: ["FIELDNAME = 'YJBV_POC_F'"] })` → 1 linha, ROLLNAME = o data element do `def.rollName` e CHECKTABLE = `def.checkTable`. AUTHX não tem coluna de versão: o campo nasce ativo. *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o campo existe com o data element e a tabela de verificação pedidos? readTable em AUTHX *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"readTable":{"tabela":"AUTHX","campos":["FIELDNAME","ROLLNAME","CHECKTABLE","EXIT_FB","ACTVT_FLAG"],"where":["FIELDNAME = 'YJBV_POC_F'"]},"espera":"1 linha, ROLLNAME='BUKRS', CHECKTABLE='T001' (medido). Depois de alterar pelo mesmo deploy para { rollName: 'WERKS_D', checkTable: 'T001W' }: ROLLNAME='WERKS_D', CHECKTABLE='T001W'"}`

2. **`readTable`** — o campo chegou ao objeto que o usa? readTable em TOBJ — é o elo que prova que o nome coube nos 10 chars do XUFIELD *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TOBJ","campos":["OBJCT","FIEL1","FIEL2"],"where":["OBJCT = 'YJBV_POC_O'"]},"espera":"FIEL1='YJBV_POC_F' (medido). O mesmo elo pelo lado ADT: GET /sap/bc/adt/aps/iam/auth/$authobjects?name=YJBV_POC_F devolve <auth:objectName>YJBV_POC_O</auth:objectName>"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `deserializa` | no create do OBJETO: um nome de campo acima de 10 caracteres não cabe em TOBJ-FIEL* (XUFIELD) | renomear o campo para 10 caracteres ou menos — o AUTH aceita mais, o SUSO não |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| campo de autorização não é alterável por ADT REST (o sapcli declara AUTH sem alteração) | lock → PUT → unlock troca a definição de um campo ATIVO: rollName BUKRS→WERKS_D e checkTable T001→T001W chegaram à AUTHX pelo mesmo deploy da lib, HTTP 200 | 2026-08-29 · S4H |
| o nome de um campo de autorização tem no máximo 10 caracteres (maxLen 10 do abap-adt-api) | AUTHX-FIELDNAME é CHAR 30 e o create de AUTH aceita 11 caracteres (201). O limite de 10 vem de OUTRA tabela — TOBJ-FIEL* (XUFIELD, CHAR 10) — e só aparece quando o campo é posto num objeto: 400 na deserialização do ST SUSO | 2026-08-29 · S4H |

### `authorizationObject` — objeto de autorização (SUSO/B)

**O que faz.** Objeto de autorização (SUSO, SU21): o par (classe, lista de campos) que o AUTHORITY-CHECK cita. É o que a PFCG oferece para preencher com valores e o que o kernel avalia em tempo de execução. Sem ele, um campo de autorização (authorizationField) não protege nada.

**Como a lib trata.** XML puro `suso:suso`, sem /source/main (404): create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody genérico). A ativação é NO-OP (o objeto nasce ativo: a linha da TOBJ já existe depois do 201). Alterar campos, atividades ou descrição de um objeto ATIVO é o mesmo deploy.

- Forma: `xml`
- ADT: coleção `/sap/bc/adt/aps/iam/suso` · Content-Type `application/vnd.sap.adt.blues.v1+xml` · /source/main: não
- Nome: até 10 caracteres (medido 2026-08-29 (S4H 758): TOBJ-OBJCT é XUOBJECT CHAR 10 e um nome de 11 é recusado no create com 400 "erro na deserialização … ST SUSO")
- Entrada aceita: `suso`, `authorizationobject`, `objeto de autorizacao`, `authorization object`, `authobject`, `su21` (plural com "s" também vale)
- Spike: 2026-08-29 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `soapRfc`
- Ganchos: `validar`, `body`
- Origem: spike 2026-08-29 (fila item 13): discovery do s4h + GET de F_BKPF_BUK com accept blues.v1+xml · docs/pesquisa-tipos-adt-nao-cobertos.md § AUTH / SUSO · docs/ideias.md I17
- Depende de:
  - `authorizationField` — cada nome de `def.fields` — o campo precisa existir na AUTHX antes do create do objeto
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - `def.objectClass` e `def.fields` são obrigatórios: a classe tem de existir na TOBC (value help em /sap/bc/adt/aps/iam/suso/objectclass/listvalues) e os campos têm de existir na AUTHX ANTES do create
  - no máximo 10 campos, cada um com no máximo 10 caracteres: a TOBJ guarda os campos em FIEL1..FIEL9+FIEL0, todos XUFIELD CHAR 10 (medido por DD03L) — nome de campo maior derruba o create com 400 na deserialização do ST SUSO
  - ativação é no-op (activationExecuted="false"): o objeto nasce ativo — a prova é a TOBJ, não uma mensagem de ativação
  - AUTHORITY-CHECK NÃO prova que o objeto existe: sem autorização no usuário, objeto existente e objeto inexistente devolvem os dois sy-subrc=12 (medido). Para provar pelo efeito é preciso um usuário com perfil que contenha o objeto — e aí subrc=0
  - no `AUTHORITY-CHECK … FOR USER`, um literal de usuário tem de ter os 12 caracteres do SY-UNAME: literal mais curto é ERRO DE SINTAXE ("must be compatible with the type(s) of SY-UNAME") — use uma variável tipada

**Exemplo de uso.** YJBV_POC_F é criado antes pelo módulo authorizationField; ACTVT é o campo de atividade padrão do SAP. Classe TEST existe na TOBC do s4h.

```js
await deploy(conexao, 'authorizationObject', {
  name: "YJBV_POC_O",
  pkg: "$TMP",
  description: "POC objeto de autorizacao",
  def: {
    objectClass: "TEST",
    fields: [
      "YJBV_POC_F",
      "ACTVT"
    ],
    activities: [
      "01",
      "02",
      "03"
    ]
  }
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TOBJ', { campos: ["OBJCT","FIEL1","FIEL2","OCLSS","BNAME"], where: ["OBJCT = 'YJBV_POC_O'"] })` → 1 linha, OCLSS = a classe do `def.objectClass` e FIEL1..FIEL0 = os campos na ordem de `def.fields`. TOBJ não tem coluna de versão: o objeto nasce ativo. *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o objeto existe com a classe e os campos pedidos? readTable em TOBJ (os campos são colunas, não linhas) *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TOBJ","campos":["OBJCT","FIEL1","FIEL2","OCLSS","BNAME"],"where":["OBJCT = 'YJBV_POC_O'"]},"espera":"1 linha, FIEL1='YJBV_POC_F', FIEL2='ACTVT', OCLSS='TEST', BNAME = o usuário do create (medido)"}`

2. **`classrun`** — o objeto GOVERNA acesso? driver faz AUTHORITY-CHECK FOR USER contra um usuário de referência que tem perfil com a autorização (YJBV_POC_F=1000, ACTVT=03) e escreve o sy-subrc de quatro variantes *(medido: 2026-08-29 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_ck DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_ck IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'
         ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '03'.
       out->write( |1 permitido      subrc={ sy-subrc }| ).
       AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'
         ID 'YJBV_POC_F' FIELD '2000' ID 'ACTVT' FIELD '03'.
       out->write( |2 valor fora     subrc={ sy-subrc }| ).
       AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'
         ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '01'.
       out->write( |3 atividade fora subrc={ sy-subrc }| ).
       AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'
         ID 'YJBV_POC_F' FIELD '1000'.
       out->write( |4 campo omitido  subrc={ sy-subrc }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"1 permitido subrc=0 · 2 valor fora subrc=4 · 3 atividade fora subrc=4 · 4 campo omitido subrc=0","espera":"o valor autorizado passa (0), valor e atividade fora do autorizado batem (4) e um campo NÃO citado no check simplesmente não é checado (0) — medido"}`

3. **`classrun`** — contrafactual: o MESMO check contra objeto inexistente e contra usuário sem o perfil — é o que mostra que sy-subrc sozinho não prova existência *(medido: 2026-08-29 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_ck2 DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_ck2 IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA(lv_eu) = CONV sy-uname( 'MVJVELOSO' ).
       AUTHORITY-CHECK OBJECT 'YJBV_POC_N' FOR USER 'YJBV_POC_USR'
         ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '03'.
       out->write( |5 objeto inexistente subrc={ sy-subrc }| ).
       AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER lv_eu
         ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '03'.
       out->write( |6 usuario sem perfil subrc={ sy-subrc }| ).
       AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'
         ID 'ZZ_NAO_EX' FIELD '1000' ID 'ACTVT' FIELD '03'.
       out->write( |7 ID inexistente     subrc={ sy-subrc }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"5 objeto inexistente subrc=12 · 6 usuario sem perfil subrc=12 · 7 ID inexistente subrc=4","espera":"objeto inexistente e usuário sem perfil são INDISTINGUÍVEIS (12); um ID que não existe no objeto cai em 4, não em erro — medido"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `deserializa` | nome do objeto ou de um campo acima de 10 caracteres — não cabe em TOBJ-OBJCT/FIEL* (a mensagem é "Ocorreu um erro na deserialização em o programa ST SUSO" e não diz qual campo) | encurtar para 10 caracteres; se o objeto tem 10 e ainda falha, o excesso está num nome de campo |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| o check de sintaxe do ABAP valida o AUTHORITY-CHECK contra a TOBJ — objeto ou ID inexistente dá erro de sintaxe | não valida nada: driver com objeto inexistente e driver com ID inexistente ATIVARAM sem mensagem, e só divergiram no sy-subrc de execução (12 e 4) | 2026-08-29 · S4H |
| sy-subrc do AUTHORITY-CHECK serve de prova de que o objeto de autorização foi criado | sem autorização no usuário, o objeto RECÉM-CRIADO e um nome que nunca existiu devolvem os dois 12. A discriminação só aparece com um usuário que tenha perfil com a autorização: 0 no valor autorizado, 4 fora dele | 2026-08-29 · S4H |
| o AUTHORITY-CHECK precisa citar todos os campos do objeto, senão falha | campo não citado simplesmente não é checado: o check com só um dos dois campos devolveu 0 para o usuário autorizado | 2026-08-29 · S4H |

### `behaviorDefinition` — behavior definition (BDEF/BDO)

**O que faz.** Behavior definition RAP (BDEF): o DSL `managed implementation in class … define behavior for …` que torna uma CDS transacional.

**Como a lib trata.** Shell `blue:blueSource type="BDEF/BDO"` (formato blues) → lock → PUT /source/main com o DSL → unlock → activate (deploySource). Ativa junto da behavior pool class.

- Forma: `source`
- ADT: coleção `/sap/bc/adt/bo/behaviordefinitions` · Content-Type `application/vnd.sap.adt.blues.v1+xml` · /source/main: sim
- Nome: até 30 caracteres (typestructure do s4h 758 (OBJNAME_MAXLENGTH 30, fila 26); não medido por rejeição)
- Entrada aceita: `bdef`, `behaviordefinition`, `behavior definition`, `behavior`, `comportamento` (plural com "s" também vale)
- Spike: 2026-07-27 · DEV · revalidado: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `odata`
- Ganchos: `createBody`
- Origem: skill adt-objetos § BDEF/BDO — behavior definition · skill adt-objetos § RAP — a cadeia inteira
- Depende de:
  - `cds` — root view entity com o MESMO nome do BDEF
  - `class` — behavior pool (CLASS … FOR BEHAVIOR OF <root>) — BDEF sozinho não ativa, pool sozinha não ativa **(ativar na mesma requisição)**
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - o nome do BDEF É o nome da root view entity (DDLS e BDEF coexistem com o mesmo nome)
  - ativa junto da behavior pool class (CLASS … FOR BEHAVIOR OF) — na mesma requisição (activateMany); managed non-strict ativa com pool vazia
  - strict(2) exige authorization master em toda entidade; com ( global ) o método de autorização tem de CONCEDER, vazio dumpa UNCAUGHT_EXCEPTION
  - chave gravável no create precisa de field ( readonly : update ) — com readonly puro o create grava 0

**Exemplo de uso.** Nome = nome da root view entity (regra medida). Managed não-estrito ativa com pool vazia (aviso "should be flagged as strict"); `strict(2)` exigiria authorization master. Com nomes de campo diferentes da tabela, `mapping for <tabela> { … }` é obrigatório. BDEF e pool são UMA unidade de ativação — deployMany medido 2026-08-28 S4H 758 (uma ativação, EML create+commit, linha vista em outra LUW): use deployMany(conexao, [{ type: "behaviorDefinition", name, source, dependeDe: ["class:YBP_JBV_POC_BO_ROOT"] }, { type: "class", name: "YBP_JBV_POC_BO_ROOT", source: "CLASS ybp_jbv_poc_bo_root DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF yjbv_poc_bo_root. ENDCLASS. CLASS ybp_jbv_poc_bo_root IMPLEMENTATION. ENDCLASS." }]).

```js
await deploy(conexao, 'behaviorDefinition', {
  name: "YJBV_POC_BO_ROOT",
  pkg: "$TMP",
  description: "POC behavior managed",
  source: `managed implementation in class ybp_jbv_poc_bo_root unique;
define behavior for YJBV_POC_BO_ROOT alias Root
  persistent table yjbv_poc_tb_log
  lock master
{
  create; update; delete;
  field ( readonly : update ) Id;
}`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'BDEF'","OBJ_NAME = 'YJBV_POC_BO_ROOT'"] })` → 1 linha (existe). Estado ativo: getObject → adtcore:version="active". Comportamento: EML no driver + readTable na tabela persistente. *(tabela por documentação; não medido)*

**Como testar no ABAP.**

1. **`classrun`** — driver com EML: MODIFY ENTITIES … CREATE + COMMIT ENTITIES, depois READ; prova BDEF + pool ativos e o BO respondendo — o assert de persistência é readTable na tabela persistente, em outra LUW *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_bo DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_bo IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       MODIFY ENTITIES OF yjbv_poc_bo_root
         ENTITY Root CREATE FIELDS ( Id Texto ) WITH VALUE #( ( %cid = 'c1' Id = '0000000002' Texto = 'via EML' ) )
         MAPPED DATA(mapped) FAILED DATA(failed) REPORTED DATA(reported).
       COMMIT ENTITIES RESPONSE OF yjbv_poc_bo_root FAILED DATA(cf) REPORTED DATA(cr).
       out->write( |EML failed={ lines( failed-root ) } commit_failed={ lines( cf-root ) }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"EML failed=0 commit_failed=0","readTable":{"tabela":"YJBV_POC_TB_LOG","where":["ID = '0000000002'"]},"espera":"1 linha na tabela persistente, em outra LUW"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 415 | media type específico (vnd.sap.adt.behaviordefinitions.*) | usar o genérico blues.v1+xml |
| `There is no behavior definition for` | o BDEF tem nome diferente da root view entity | o BDEF se chama exatamente como a root view |
| `Type` | BDEF ativado sozinho (falta a pool) ou pool sozinha (falta o BDEF) | activateMany([bdef, classe pool]) na mesma requisição |
| `UNCAUGHT_EXCEPTION` | authorization master ( global ) com método de autorização vazio | conceder: result-%create/%update/%delete = if_abap_behv=>auth-allowed; ou usar ( instance ) |
| `use create` | BDEF de projeção: dentro de use association escreve-se create;, não use create; | trocar por create; |

### `cds` — CDS view (DDLS/DF)

**O que faz.** CDS view entity / DDL source (DDLS). A lib cria/altera o DDL completo (`define view entity …`) e ativa; é a base das superfícies RAP (SRVD → SRVB).

**Como a lib trata.** Shell `ddl:ddlSource type="DDLS/DF"` → lock → PUT /source/main com o DDL → unlock → activate (deploySource).

- Forma: `source`
- ADT: coleção `/sap/bc/adt/ddic/ddl/sources` · Content-Type `application/vnd.sap.adt.ddlSource+xml` · /source/main: sim
- Nome: até 30 caracteres (documentação SAP (nome de DDLS); não medido)
- Entrada aceita: `ddls`, `cds`, `cds view`, `view cds`, `ddl` (plural com "s" também vale)
- Spike: s/ data · DEV · revalidado: 2026-08-26 · S4H 758; 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `odata`
- Ganchos: `createBody`
- Origem: skill adt-objetos § DDLS/DF — CDS view · docs/receita-wdi5-fiori.md (superfície YJBV_POC_WDI5_*) · docs/fila.md item 6
- Depende de:
  - `table` — fonte do select (tabela ou outra CDS)
  - `behaviorDefinition` — só para projeção transacional (as projection on) — o BDEF vem ANTES
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - media type SEM versão: ddlSource.v1+xml dá 415
  - define view entity não leva sqlViewName (isso é da sintaxe antiga define view)
  - as projection on solto não ativa: crie o BDEF primeiro; read-only expõe a interface view direto na SRVD
  - para OData V4 (A2X): sem conversion exit nos campos (cast para abap.char), chave não pode ser só o mandante, CHAR1 "flag" não-booleano estoura a serialização

**Exemplo de uso.** Reconstituído do spike wdi5 (S4H 758, 2026-08-26): CDS read-only sobre DD02L, exposta por SRVD + SRVB categoria 0. Os sufixos exatos YJBV_POC_WDI5_* não foram preservados na receita. Sem `key mandt` e sem CHAR1 flag: os dois quebram o modelo V4 (medido).

```js
await deploy(conexao, 'cds', {
  name: "YJBV_POC_WDI5_C",
  pkg: "$TMP",
  description: "POC CDS read-only sobre DD02L",
  source: `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'POC tabelas do dicionário'
define view entity YJBV_POC_WDI5_C as select from dd02l {
  key tabname  as TableName,
      tabclass as TableClass,
      as4local as Status
}`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'DDLS'","OBJ_NAME = 'YJBV_POC_WDI5_C'"] })` → 1 linha (existe no diretório de objetos). Estado ativo: getObject → adtcore:version="active". Dados: SELECT no driver ou OData. *(tabela por documentação; não medido)*

**Como testar no ABAP.**

1. **`classrun`** — driver faz SELECT na view (prova ativação e leitura) e escreve a contagem *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_cds DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_cds IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       SELECT FROM yjbv_poc_wdi5_c FIELDS TableName INTO TABLE @DATA(lt) UP TO 5 ROWS.
       out->write( |CDS rows={ lines( lt ) }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"CDS rows=<n>","espera":"o driver ativa contra a view (existe, está ativa) e o SELECT roda — medido com root view entity sobre tabela $TMP vazia: rows=0"}`

2. **`odata`** — pela SRVB publicada: GET $metadata (200, entidade presente) e GET da entidade (linhas) — foi assim que o spike wdi5 provou a CDS *(medido: 2026-08-26 · S4H 758)*
   Assert: `{"http":"GET <odataV4RuntimeUrl>/$metadata → 200; GET <entidade>?$top=3 → 3 linhas","espera":"entidade no $metadata e linhas no OData V4"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 415 | media type com versão (ddlSource.v1+xml) | usar application/vnd.sap.adt.ddlSource+xml (sem versão) |
| `Transactional projection view must be part of a Business Object` | `as projection on` sem BDEF | criar o BDEF da root primeiro; para read-only, expor a interface view direto na SRVD |
| `ROOT keyword missing` | interface é root view entity mas a projeção não | define root view entity na projeção também |
| `CX_SADL_GW_V4_MODEL_EXCEPTION` | campo com conversion exit (MATNR→MATN1, BELNR_D→ALPHA…) dumpa a geração do modelo V4 | cast( campo as abap.char(n) ) na interface view — só para CHAR (UNIT/QUAN/CURR não podem) |
| HTTP 500 · `Metadata_Error` | a única chave da view é o mandante — o runtime A2X remove o campo cliente e a entidade fica sem chave | usar fonte com chave de verdade (medido 2026-08-26) |
| `CX_PARAMETER_INVALID_RANGE` | CHAR1 mapeado como Edm.Boolean e uma linha tem valor fora de X/vazio | não expor CHAR1 flag não-booleano, ou fazer cast (medido 2026-08-26) |

### `class` — classe (CLAS/OC)

**O que faz.** Classe ABAP OO global (CLAS), com os includes locais (definitions/implementations/macros) e a classe de teste ABAP Unit. É o driver dos canais classrun e do BDC dirigido pelo agente.

**Como a lib trata.** create com o include de teste DECLARADO no shell (o CCAU só nasce junto) → lock → PUT dos includes locais (definitions antes do main) → PUT /source/main → PUT testclasses → unlock → activate. `deploySource` continua servindo para classe sem testes.

- Forma: `custom`
- ADT: coleção `/sap/bc/adt/oo/classes` · Content-Type `application/vnd.sap.adt.oo.classes.v4+xml` · /source/main: sim
- Nome: até 30 caracteres (documentação SAP (nome de objeto OO); não medido)
- Entrada aceita: `clas`, `class`, `classe`, `cl` (plural com "s" também vale)
- Spike: 2026-07-19 · DEV · revalidado: 2026-08-26 · S4H 758; 2026-08-26 · SXD 816; 2026-08-28 · S4H 758
- Releases medidos: 758, 816
- Canais: `adt`, `classrun`, `aunit`
- Ganchos: `createBody`, `deploy`
- Origem: docs/canal-classrun.md · docs/receita-ciclo-escrita-verificacao.md · docs/receita-e2e-classe-entregue.md · skill adt-objetos § CLAS/OC — classe (e o include de teste)
- Depende de:
  - `interface` — interfaces implementadas (opcional) — criar ANTES da classe
  - `table` — tabelas que a classe usa (opcional)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - o include testclasses (CCAU) só nasce declarado no create — não dá para acrescentar depois (PUT responde 500 "Não existem versões inativas")
  - PUT de include exige Content-Type text/plain; charset=utf-8
  - ordem: definitions → implementations → macros → main → testclasses, todos com o lockHandle da CLASSE
  - ABAP que só falha na ATIVAÇÃO: RETURNING com tipo de tabela genérico; CHANGING com resultado de método; constante CHAR de tamanho ≠ do parâmetro; método dentro de Open SQL
  - classrun: executar em sessão NOVA depois do deploy (deployAndRun já faz — ver desmentidos)

**Exemplo de uso.** YJBV_POC_CL_WRITE é o driver da POC do ciclo (S4H 758 + SXD 816, 2026-08-26). O source aqui é reconstituído da receita (INSERT + COMMIT WORK AND WAIT + WRITE_RESULT); o teste ABAP Unit é ilustrativo.

```js
await deploy(conexao, 'class', {
  name: "YJBV_POC_CL_WRITE",
  pkg: "$TMP",
  description: "POC driver de escrita",
  source: `CLASS yjbv_poc_cl_write DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    METHODS gravar IMPORTING iv_texto TYPE csequence RETURNING VALUE(rv_id) TYPE numc10.
ENDCLASS.
CLASS yjbv_poc_cl_write IMPLEMENTATION.
  METHOD gravar.
    SELECT MAX( id ) FROM yjbv_poc_tb_log INTO @DATA(lv_max).
    rv_id = lv_max + 1.
    INSERT yjbv_poc_tb_log FROM @( VALUE #( mandt = sy-mandt id = rv_id texto = iv_texto datum = sy-datum uzeit = sy-uzeit ) ).
  ENDMETHOD.
  METHOD if_oo_adt_classrun~main.
    DATA(lv_id) = gravar( 'escrito pelo agente via classrun' ).
    COMMIT WORK AND WAIT.
    out->write( |WRITE_RESULT subrc={ sy-subrc } id={ lv_id }| ).
  ENDMETHOD.
ENDCLASS.`,
  testSource: `*"* use this source file for your ABAP unit test classes
CLASS ltc_yjbv_poc_cl_write DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS gravar_devolve_id FOR TESTING RAISING cx_static_check.
ENDCLASS.
CLASS ltc_yjbv_poc_cl_write IMPLEMENTATION.
  METHOD gravar_devolve_id.
    DATA(lo) = NEW yjbv_poc_cl_write( ).
    DATA(lv_id) = lo->gravar( 'unit' ).
    ROLLBACK WORK.
    cl_abap_unit_assert=>assert_differs( act = lv_id exp = 0 ).
  ENDMETHOD.
ENDCLASS.`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'SEOCLASS', { campos: ["CLSNAME","CLSTYPE"], where: ["CLSNAME = 'YJBV_POC_CL_WRITE'"] })` → 1 linha, CLSTYPE = '0' (classe). Estado ativo: getObject → adtcore:version="active". Comportamento: aunit / classrun. *(tabela por documentação; não medido)*

**Como testar no ABAP.**

1. **`aunit`** — runUnitTestsWithCoverage: a classe de teste (include testclasses) roda pelo ADT; executed=0 NUNCA é sucesso *(medido: 2026-07-19 · DEV; 2026-08-28 · S4H 758)*

   ```abap
   *"* use this source file for your ABAP unit test classes
   CLASS ltc_yjbv_poc_cl_write DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
     PRIVATE SECTION.
       METHODS gravar_devolve_id FOR TESTING RAISING cx_static_check.
   ENDCLASS.
   CLASS ltc_yjbv_poc_cl_write IMPLEMENTATION.
     METHOD gravar_devolve_id.
       DATA(lo) = NEW yjbv_poc_cl_write( ).
       DATA(lv_id) = lo->gravar( 'unit' ).
       ROLLBACK WORK.
       cl_abap_unit_assert=>assert_differs( act = lv_id exp = 0 ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"unit":"executed > 0 && failed === 0; statement coverage ≥ threshold","espera":"testes verdes com cobertura medida (2026-08-28: executed=1, failed=0, statement=50%)"}`

2. **`classrun`** — a própria classe implementa if_oo_adt_classrun: deployAndRun executa em sessão nova e lê WRITE_RESULT; assert por readTable em outra LUW *(medido: 2026-08-26 · S4H 758; 2026-08-26 · SXD 816; 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_write DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION.
       INTERFACES if_oo_adt_classrun.
       METHODS gravar IMPORTING iv_texto TYPE csequence RETURNING VALUE(rv_id) TYPE numc10.
   ENDCLASS.
   CLASS yjbv_poc_cl_write IMPLEMENTATION.
     METHOD gravar.
       SELECT MAX( id ) FROM yjbv_poc_tb_log INTO @DATA(lv_max).
       rv_id = lv_max + 1.
       INSERT yjbv_poc_tb_log FROM @( VALUE #( mandt = sy-mandt id = rv_id texto = iv_texto datum = sy-datum uzeit = sy-uzeit ) ).
     ENDMETHOD.
     METHOD if_oo_adt_classrun~main.
       DATA(lv_id) = gravar( 'escrito pelo agente via classrun' ).
       COMMIT WORK AND WAIT.
       out->write( |WRITE_RESULT subrc={ sy-subrc } id={ lv_id }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"WRITE_RESULT subrc=0 id=<id>","readTable":{"tabela":"YJBV_POC_TB_LOG","where":["ID = '<id>'"]},"espera":"linha gravada, vista de outra LUW"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 500 · `CCAU` | PUT em includes/testclasses de uma classe que nasceu SEM o include declarado — o PUT só atualiza | não há caminho REST: deletar e recriar com deployClassWithTests (include declarado no create) |
| HTTP 404 · `testclasses` | a classe existe sem o include de teste | idem — recriar com o include declarado |
| `does not implement if_oo_adt_classrun` | classrun rodando o load ANTIGO, preso à sessão do deploy (ou a classe não implementa a interface) | executar em sessão nova (deployAndRun / runClass novaSessao); conferir INTERFACES if_oo_adt_classrun |
| `must be separated using commas` | chamada de método dentro de Open SQL fora do modo estrito | pré-calcular numa variável |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| o 500 ao gravar o include testclasses é problema de charset, ou de ordem de ativação | nem um nem outro (as duas hipóteses custaram 7 tentativas). A causa é o <class:include> de testclasses FALTANDO no create — a classe já existia sem ele, e o PUT só atualiza include que existe. Não há caminho REST para acrescentá-lo depois. | 2026-07-19 · DEV |
| depois do activate, o classrun executa o código novo — é só esperar/repetir | o load antigo fica preso à sessão STATEFUL que fez o deploy: 5 retries de 3s na mesma sessão não convergiram; uma sessão NOVA executou o load novo de primeira. Não é questão de tempo. | 2026-08-26 · S4H 758 |

### `dataElement` — data element (DTEL/DE)

**O que faz.** Elemento de dados do dicionário (DTEL): tipo técnico (predefinido ou por domínio) + os 4 field labels que viram cabeçalho de coluna no ALV.

**Como a lib trata.** Não tem /source/main — o XML é a definição. create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody). O porquê do PUT sempre está em guardRails.

- Forma: `xml`
- ADT: coleção `/sap/bc/adt/ddic/dataelements` · Content-Type `application/vnd.sap.adt.dataelements.v2+xml` · /source/main: não
- Nome: até 30 caracteres (documentação SAP (DDIC); não medido)
- Entrada aceita: `dtel`, `dataelement`, `elemento de dados`, `data element`, `de` (plural com "s" também vale)
- Spike: s/ data · DEV · revalidado: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `soapRfc`
- Ganchos: `body`
- Origem: skill adt-objetos § DTEL/DE — data element · skill adt-objetos § O POST de create grava só a parte TÉCNICA
- Depende de:
  - `domain` — quando kind = domain
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - PUT do body roda sempre, inclusive logo após o create — senão o DE nasce sem descrição e sem labels (falha silenciosa: 201 e ativa; já contaminou 16 DEs)
  - alterar DE usado como campo-CHAVE de tabela ativa exige conversão (EU(899)/EU(886)) — feche tipo e tamanho ANTES de criar as tabelas

**Exemplo de uso.** Os labels são a parte que o create descarta — o teste deles (DD04T) é o que pega a falha silenciosa.

```js
await deploy(conexao, 'dataElement', {
  name: "YJBV_POC_DE_STATUS",
  pkg: "$TMP",
  description: "Status POC",
  def: {
    kind: "predefined",
    dataType: "CHAR",
    length: 2,
    labels: {
      short: "Status",
      medium: "Status POC",
      long: "Status do registro POC",
      heading: "Status"
    }
  }
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'DD04L', { campos: ["ROLLNAME","AS4LOCAL","DATATYPE","LENG","DOMNAME"], where: ["ROLLNAME = 'YJBV_POC_DE_STATUS'"] })` → 1 linha, AS4LOCAL = 'A', DATATYPE/LENG do exemplo. Labels: DD04T (ver testes). *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — os 4 labels persistiram? readTable em DD04T (textos do DE) no idioma da sessão — é o assert que pega o create-sem-PUT *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"DD04T","campos":["ROLLNAME","DDLANGUAGE","SCRTEXT_S","SCRTEXT_M","SCRTEXT_L","REPTEXT"],"where":["ROLLNAME = 'YJBV_POC_DE_STATUS'"]},"espera":"SCRTEXT_S/M/L e REPTEXT preenchidos com os labels do exemplo, DDLANGUAGE = 'P' (medido — o idioma da sessão chegou ao DE, ao contrário da MSAG)"}`

2. **`classrun`** — driver declara variável do tipo do DE e descreve tipo/tamanho (prova ativação e a parte técnica) *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_de DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_de IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA lv TYPE yjbv_poc_de_status.
       DESCRIBE FIELD lv TYPE DATA(lv_tipo) LENGTH DATA(lv_len) IN CHARACTER MODE.
       out->write( |DE tipo={ lv_tipo } len={ lv_len }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"DE tipo=C len=2","espera":"tipo e tamanho do exemplo"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| `EU(899)` | DE usado como campo-chave de tabela ativa mudou de tamanho/tipo — exige conversão da tabela | quickfix "Activate and adjust dependent objects" (Eclipse/SE14); por ADT, POST /refactorings exige o parâmetro step. Evitar: fechar o DE antes das tabelas |
| `must be converted` | idem EU(886): tabela dependente precisa de conversão | idem |

### `domain` — domínio (DOMA/DD)

**O que faz.** Domínio do dicionário (DOMA): tipo técnico, tamanho, saída e valores fixos — o que um data element referencia.

**Como a lib trata.** XML puro: create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody). O porquê do PUT sempre está em guardRails.

- Forma: `xml`
- ADT: coleção `/sap/bc/adt/ddic/domains` · Content-Type `application/vnd.sap.adt.domains.v2+xml` · /source/main: não
- Nome: até 30 caracteres (documentação SAP (DDIC); não medido)
- Entrada aceita: `doma`, `domain`, `dominio`, `dom` (plural com "s" também vale)
- Spike: 2026-07-27 · DEV · revalidado: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `soapRfc`
- Ganchos: `body`
- Origem: skill adt-objetos § DOMA/DD — domínio
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - PUT do body roda sempre — o create descarta descrição e valores fixos
  - comprimentos zero-padded: 6 dígitos (length/decimals/output), 4 na position dos valores fixos

**Exemplo de uso.** Os valores fixos são a parte que o create descarta — o teste deles (DD07L/DD07T) pega a falha silenciosa.

```js
await deploy(conexao, 'domain', {
  name: "YJBV_POC_DO_STATUS",
  pkg: "$TMP",
  description: "Status POC",
  def: {
    dataType: "CHAR",
    length: 2,
    fixValues: [
      {
        low: "AB",
        text: "Aberto"
      },
      {
        low: "FE",
        text: "Fechado"
      }
    ]
  }
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'DD01L', { campos: ["DOMNAME","AS4LOCAL","DATATYPE","LENG"], where: ["DOMNAME = 'YJBV_POC_DO_STATUS'"] })` → 1 linha, AS4LOCAL = 'A', DATATYPE/LENG do exemplo. Valores fixos: DD07L (ver testes). *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — os valores fixos persistiram? readTable em DD07L (valores) — pega o create-sem-PUT *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"DD07L","campos":["DOMNAME","VALPOS","DOMVALUE_L","DOMVALUE_H"],"where":["DOMNAME = 'YJBV_POC_DO_STATUS'"]},"espera":"2 linhas: AB e FE"}`

2. **`classrun`** — driver lê os textos dos valores fixos (DD07T) no idioma da sessão e escreve *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_do DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_do IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       SELECT domvalue_l, ddtext FROM dd07t WHERE domname = 'YJBV_POC_DO_STATUS' AND ddlanguage = @sy-langu
         INTO TABLE @DATA(lt).
       LOOP AT lt INTO DATA(ls). out->write( |DO { ls-domvalue_l }={ ls-ddtext }| ). ENDLOOP.
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"DO AB=Aberto / DO FE=Fechado","espera":"textos dos valores fixos no idioma da sessão (medido: os textos dos valores fixos chegaram em sy-langu=P)"}`

### `functionGroup` — grupo de funções (FUGR/F)

**O que faz.** Grupo de funções (FUGR, SE80): o contêiner dos function modules. A lib só o cria quando falta, como pré-requisito do FM.

**Como a lib trata.** GET coll/<fg>: 200 = já existe, nada a fazer. Senão POST do shell com Accept application/*. Sem lock, sem activate. Idempotente.

- Forma: `custom`
- ADT: coleção `/sap/bc/adt/functions/groups` · Content-Type `application/vnd.sap.adt.functions.groups.v3+xml` · /source/main: não
- Nome: até 26 caracteres (documentação SAP (nome de grupo de funções); não medido)
- Entrada aceita: `functiongroup`, `grupo de funcoes`, `grupo de funcao`, `function group`, `fg` · para todos os alvos de FUGR: `fugr` (plural com "s" também vale)
- Spike: 2026-08-26 · S4H 758 · revalidado: 2026-08-26 · SXD 816; 2026-08-28 · S4H 758
- Releases medidos: 758, 816
- Canais: `adt`, `soapRfc`
- Ganchos: `createBody`, `deploy`
- Origem: docs/receita-fm-rfc-wrapper.md · skill adt-objetos § FUGR/FF — function module (RFC)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - não ativa — o FUGR nasce ativo; ativar pela URI do FUGR é no-op silencioso (activationExecuted="false")
  - deleteObject do FUGR logo após o delete do FM pode dar 403 "já está processando" (ENQUEUE no SAPL<fg> na TRDIR) — medido 2026-08-28; liberarLocks (classrun) resolve

**Exemplo de uso.** Grupo da POC do wrapper RFC (S4H 758 + SXD 816, 2026-08-26). Normalmente não se chama direto: deploy do functionModule cria o grupo se faltar.

```js
await deploy(conexao, 'functionGroup', {
  name: "YJBV_POC_FG",
  pkg: "$TMP",
  description: "POC grupo do wrapper BDC"
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'FUGR'","OBJ_NAME = 'YJBV_POC_FG'"] })` → 1 linha (existe). FMs do grupo: TFDIR por PNAME = SAPL<grupo>. *(tabela por documentação; não medido)*

**Como testar no ABAP.**

1. **`soapRfc`** — o grupo prova-se pelo FM dentro dele: deployFunctionModule({ group: "YJBV_POC_FG", … }) + callFunction por SOAP RFC (ver functionModule) *(medido: 2026-08-26 · S4H 758; 2026-08-26 · SXD 816; 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TFDIR","campos":["FUNCNAME","FMODE","PNAME"],"where":["PNAME = 'SAPLYJBV_POC_FG'"]},"espera":"os FMs do grupo listados (PNAME = SAPL<grupo>)"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| `activationExecuted="false"` | ativação referenciando o FUGR em vez do FM | ativar pela URI do FM (deploy do functionModule já faz) |

### `functionGroupInclude` — include de grupo de funções (FUGR/I)

**O que faz.** Include de um grupo de funções (FUGR/I): onde moram as declarações globais (L<GRUPO>TOP) e as FORMs que os FMs do grupo chamam por PERFORM. É o que faz um FUGR virar um programa de verdade, e não uma coleção de FMs isolados.

**Como a lib trata.** Cria o FUGR se faltar → POST do metadata em groups/<fg>/includes (fincludes.v2) se o include não existe → lock por path → PUT /source/main → unlock → ativa o POOL SAPL<GRUPO> e o include na MESMA requisição (gotcha 2).

- Forma: `custom` · aninhado em `functionGroup` (parâmetro `group`)
- ADT: coleção `/sap/bc/adt/functions/groups` · Content-Type `application/vnd.sap.adt.functions.fincludes.v2+xml` · /source/main: sim
- Nome: até 30 caracteres (typestructure do s4h 758 (OBJNAME_MAXLENGTH 30, fila 26) — mais restrito que o TRDIR-NAME 40 da doc; não medido por rejeição. O nome é derivado do grupo)
- Entrada aceita: `functiongroupinclude`, `include de grupo de funcoes`, `include de fugr`, `fugr include`, `finclude`, `include de funcao` · para todos os alvos de FUGR: `fugr` (plural com "s" também vale)
- Spike: 2026-08-29 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `soapRfc`
- Ganchos: `validar`, `body`, `path`, `deploy`
- Origem: POC do item 11 da fila (2026-08-29, S4H 758) · docs/receita-fm-rfc-wrapper.md
- Depende de:
  - `functionGroup` — contêiner (criado pelo deploy se faltar)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - exige { group } — o path é aninhado (groups/<fg>/includes/<inc>); coll/<name> não existe
  - o nome é L<GRUPO><SUFIXO> e quem passa pelo Z/Y é o GRUPO (zyPeloContainer) — o include LYJBV_… não começa com Z/Y
  - o ADT aceita include cujo nome NÃO corresponde ao grupo (medido: LZOUTROGRUPOF01 dentro de YJBV_POC_I_FG → 200); a convenção é guard-rail nosso, antes da rede
  - ativar o include SOZINHO não basta: a linha INCLUDE fica no pool INATIVO — o deploy ativa SAPL<GRUPO> + include juntos, senão o PERFORM de outro objeto falha com "contém erros de sintaxe"
  - ativa na hora (activateMany com o pool): não participa da ativação diferida do deployMany
  - não é source-based para deploySource (forma custom) — use deploy(conexao, "functionGroupInclude", …)

**Exemplo de uso.** POC do item 11 (S4H 758, 2026-08-29): a FORM vive no include e o FM do grupo a chama por PERFORM — provado por SOAP RFC (EV_R = 42). `name` aceita o sufixo ("F01") ou o nome pronto ("LYJBV_POC_I_FGF01").

```js
await deploy(conexao, 'functionGroupInclude', {
  group: "YJBV_POC_I_FG",
  name: "F01",
  pkg: "$TMP",
  description: "POC 11 include de FORM",
  source: `FORM yjbv_poc_soma USING iv_a TYPE i iv_b TYPE i CHANGING cv_r TYPE i.
  cv_r = iv_a + iv_b.
ENDFORM.`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TRDIR', { campos: ["NAME","SUBC"], where: ["NAME = 'LYJBV_POC_I_FGF01'"] })` → 1 linha; SUBC = 'I' (include) *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o include existe como programa? TRDIR por NAME (o nome completo L<GRUPO><SUFIXO>) *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TRDIR","campos":["NAME","SUBC"],"where":["NAME = 'LYJBV_POC_I_FGF01'"]},"espera":"1 linha; SUBC = 'I' (include)"}`

2. **`soapRfc`** — a FORM do include resolve? FM RFC do mesmo grupo faz PERFORM dela e devolve o resultado — se o include não estivesse no pool ativo, o FM nem ativaria *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"callFunction":{"fm":"YJBV_POC_FM_INC","params":{"IV_A":17,"IV_B":25}},"espera":"EV_R = 42"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 415 · `fincludes` | create com fincludes.v3+xml (o media type do FM) | usar fincludes.v2+xml — a própria resposta do 415 lista o suportado |
| HTTP 500 · `Características para programa` | nome do include sem o L inicial (ex.: YJBV_POC_I_FGX01) | nome L<GRUPO><SUFIXO> — o validar do módulo já recusa antes da rede |
| `contém erros de sintaxe` | o pool SAPL<GRUPO> ATIVO ainda não tem a linha INCLUDE (ela ficou na versão inativa) — quem faz PERFORM da FORM não ativa | ativar SAPL<GRUPO> junto do include (o deploy do módulo já faz); em objeto de terceiro, incluir o pool na unidade de ativação |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| o nome do include de FUGR é um sufixo de 3 caracteres | o sufixo é da SE80. No ADT o create e a URI usam o NOME COMPLETO (L<GRUPO><SUFIXO>): /functions/groups/<fg>/includes/lyjbv_poc_i_fgf01. A lib aceita o sufixo por conveniência e monta o nome. | 2026-08-29 · S4H |
| o ADT garante que o include pertence ao grupo em que é criado | não garante: LZOUTROGRUPOF01 foi criado dentro de YJBV_POC_I_FG com 200. O único filtro do servidor é o L inicial (sem ele, 500). Include órfão é problema de quem cria. | 2026-08-29 · S4H |

### `functionModule` — function module (FUGR/FF)

**O que faz.** Function module (FUGR/FF), em especial remote-enabled (RFC): a porta de escrita por SOAP RFC em sistemas sem classrun — wrapper de BDC, chamada de BAPI + COMMIT na mesma LUW.

**Como a lib trata.** Cria o FUGR se faltar → POST do metadata em groups/<fg>/fmodules se o FM não existe → lock por path → PUT metadata (persiste RFC) → PUT /source/main → unlock → activate pela URI do FM (lança se hasError).

- Forma: `custom` · aninhado em `functionGroup` (parâmetro `group`)
- ADT: coleção `/sap/bc/adt/functions/groups` · Content-Type `application/vnd.sap.adt.functions.fmodules.v3+xml` · /source/main: sim
- Nome: até 30 caracteres (documentação SAP (FUNCNAME); não medido)
- Entrada aceita: `functionmodule`, `function module`, `modulo de funcao`, `funcao`, `funcoes`, `fm` · para todos os alvos de FUGR: `fugr` (plural com "s" também vale)
- Spike: 2026-08-26 · S4H 758 · revalidado: 2026-08-26 · SXD 816; 2026-08-28 · S4H 758
- Releases medidos: 758, 816
- Canais: `adt`, `soapRfc`, `aunit`
- Ganchos: `validar`, `body`, `path`, `deploy`
- Origem: docs/receita-fm-rfc-wrapper.md · docs/canal-soap-rfc.md · skill adt-objetos § FUGR/FF — function module (RFC)
- Depende de:
  - `functionGroup` — contêiner (criado pelo deploy se faltar)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - exige { group } — o path é aninhado (groups/<fg>/fmodules/<fm>); coll/<name> não existe (deleteObject também recebe { group })
  - RFC só persiste com PUT do metadata (com lock) ANTES do PUT do source — o create descarta processingType="rfc"
  - assinatura sem ponto após o nome: `FUNCTION nome` … ponto só depois do último parâmetro; TABLES com LIKE
  - ativar pela URI do FM, não do FUGR (FUGR → no-op silencioso)
  - não é source-based para deploySource (forma custom) — use deploy(conexao, "functionModule", …) / deployFunctionModule
  - antes de chamar uma FM padrão, conferir a interface na FUPARAREF (obrigatório = OPTIONAL e DEFAULTVAL em branco) — faltar dumpa CALL_FUNCTION_PARM_MISSING em runtime

**Exemplo de uso.** Wrapper de BDC da POC (S4H 758 + SXD 816, 2026-08-26): igual a buildBdcWrapperSource("YJBV_POC_FM_BDC").

```js
await deploy(conexao, 'functionModule', {
  group: "YJBV_POC_FG",
  name: "YJBV_POC_FM_BDC",
  pkg: "$TMP",
  description: "wrapper BDC",
  source: `FUNCTION yjbv_poc_fm_bdc
  IMPORTING
    VALUE(iv_tcode) TYPE tcode
    VALUE(iv_mode) TYPE char1 DEFAULT 'N'
  EXPORTING
    VALUE(ev_subrc) TYPE sysubrc
  TABLES
    it_bdcdata LIKE bdcdata
    et_msgs LIKE bdcmsgcoll.

  CALL TRANSACTION iv_tcode WITH AUTHORITY-CHECK
       USING it_bdcdata[] MODE iv_mode UPDATE 'S'
       MESSAGES INTO et_msgs[].
  ev_subrc = sy-subrc.

ENDFUNCTION.`,
  rfc: true
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TFDIR', { campos: ["FUNCNAME","FMODE","PNAME"], where: ["FUNCNAME = 'YJBV_POC_FM_BDC'"] })` → 1 linha; FMODE = 'R' quando rfc: true (é o assert que pega o create-sem-PUT-de-metadata) *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o RFC persistiu? readTable TFDIR: FMODE = R — é o assert do gotcha 1 (create descarta o rfc) *(medido: 2026-08-26 · S4H 758; 2026-08-26 · SXD 816; 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TFDIR","campos":["FUNCNAME","FMODE"],"where":["FUNCNAME = 'YJBV_POC_FM_BDC'"]},"espera":"FMODE = 'R'"}`

2. **`soapRfc`** — callFunction por SOAP RFC com BDC de VA03 e documento inexistente: prova que o FM é chamável remoto e que a transação rodou (mensagem de negócio de volta) *(medido: 2026-08-26 · S4H 758; 2026-08-26 · SXD 816; 2026-08-28 · S4H 758)*
   Assert: `{"callFunction":{"fm":"YJBV_POC_FM_BDC","params":{"IV_TCODE":"VA03","IV_MODE":"N","IT_BDCDATA":[{"PROGRAM":"SAPMV45A","DYNPRO":"0102","DYNBEGIN":"X"},{"FNAM":"VBAK-VBELN","FVAL":"9999999999"},{"FNAM":"BDC_OKCODE","FVAL":"/00"}],"ET_MSGS":[]}},"espera":"EV_SUBRC = '1001'; ET_MSGS com MSGTYP E, MSGID V1, MSGNR 302"}`

3. **`aunit`** — validar sem executar a transação: classe de teste com CALL FUNCTION local prova ativação + assinatura + parâmetros, sem efeito colateral *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS ltc_yjbv_poc_fm_bdc DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
     PRIVATE SECTION. METHODS assinatura FOR TESTING RAISING cx_static_check.
   ENDCLASS.
   CLASS ltc_yjbv_poc_fm_bdc IMPLEMENTATION.
     METHOD assinatura.
       DATA lt_bdc TYPE STANDARD TABLE OF bdcdata. DATA lt_msg TYPE STANDARD TABLE OF bdcmsgcoll. DATA lv_subrc TYPE sysubrc.
       CALL FUNCTION 'YJBV_POC_FM_BDC' EXPORTING iv_tcode = 'SESSION_MANAGER' iv_mode = 'N'
         IMPORTING ev_subrc = lv_subrc TABLES it_bdcdata = lt_bdc et_msgs = lt_msg.
       " SESSION_MANAGER com BDCDATA vazio devolve subrc 0 (medido): o que se prova é que a chamada resolve a assinatura
       cl_abap_unit_assert=>assert_equals( act = lv_subrc exp = 0 ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"unit":"executed = 1, failed = 0 (CALL FUNCTION resolve os parâmetros — se a assinatura tiver o ponto errado, CX_SY_DYN_CALL_PARAM_NOT_FOUND)","espera":"teste verde"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 500 · `kernel rc=9` | o FM não é RFC (FMODE vazio): o create descartou processingType="rfc" | PUT do metadata com lock antes do source (o deploy do módulo já faz); confirmar TFDIR.FMODE = R |
| HTTP 400 · `ExceptionInvalidData` | processingType inválido no create (ex.: "remoteEnabled") | usar "rfc" ou "normal" |
| HTTP 400 · `deklariert keinen Typen` | parâmetro TABLES declarado com STRUCTURE | declarar com LIKE <estrutura> |
| `CX_SY_DYN_CALL_PARAM_NOT_FOUND` | assinatura com ponto logo após o nome (FUNCTION nome.) — os parâmetros não registraram | FUNCTION nome (sem ponto) … ponto só depois do último parâmetro |
| HTTP 403 · `já está processando` | lock preso de um create/PUT que morreu antes do unlock | liberar por classrun com ENQUEUE_READ + ENQUE_DELETE locais (ENQUE_DELETE não é RFC), ou SM12 |
| `CALL_FUNCTION_PARM_MISSING` | parâmetro obrigatório não informado na chamada | conferir FUPARAREF (OPTIONAL e DEFAULTVAL em branco = obrigatório) |
| `activationExecuted="false"` | ativação referenciando o FUGR | ativar pela URI do FM (o módulo já faz) |

### `include` — include (PROG/I)

**O que faz.** Include de programa ABAP (PROG/I). Código reutilizável que um report puxa com INCLUDE.

**Como a lib trata.** Shell `progInclude:abapInclude type="PROG/I"` → lock → PUT /source/main → unlock → activate (deploySource). Include de um programa EXISTENTE exige `context=` (URI do programa) e `corrNr=` no PUT — o setSource genérico não manda.

- Forma: `source`
- ADT: coleção `/sap/bc/adt/programs/includes` · Content-Type `application/vnd.sap.adt.programs.includes.v2+xml` · /source/main: sim
- Nome: até 40 caracteres (documentação SAP (nome de programa); não medido)
- Entrada aceita: `include`, `inc` · para todos os alvos de PROG: `prog`, `programa`, `program` (plural com "s" também vale)
- Spike: 2026-07-19 · DEV · revalidado: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `createBody`
- Origem: skill adt-objetos § PROG/P e PROG/I — programa e include
- Depende de:
  - `prog` — programa mestre (context= no PUT); ativar o par [include, programa] juntos **(ativar na mesma requisição)**
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - alterar include de programa existente exige context=<uri do report> e corrNr= no PUT (400 ExceptionParameterNotFound / "Parameter corrNr" sem eles)
  - a ativação tem de referenciar o INCLUDE — ativar só o report é no-op silencioso (activationExecuted="false")

**Exemplo de uso.** Include avulso (sem programa mestre) cria e ativa pelo fluxo genérico; o caso com mestre exige context=/corrNr= — ver guardRails.

```js
await deploy(conexao, 'include', {
  name: "YJBV_POC_INC",
  pkg: "$TMP",
  description: "POC include",
  source: `*&---- include YJBV_POC_INC ----*
FORM yjbv_poc_escreve USING iv_txt TYPE csequence.
  WRITE: / iv_txt.
ENDFORM.`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TRDIR', { campos: ["NAME","SUBC"], where: ["NAME = 'YJBV_POC_INC'"] })` → 1 linha, SUBC = 'I' (include). Estado ativo: getObject → adtcore:version="active". *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o include prova-se pelo report que o INCLUDE: com o report YJBV_POC_REPORT (INCLUDE yjbv_poc_inc + PERFORM) criado e ATIVO depois do include, o par existe na TRDIR — se a FORM não resolvesse, o report não ativaria. (SUBMIT de dentro de um driver classrun devolve HTTP 500 — ver guardRails do prog) *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TRDIR","campos":["NAME","SUBC"],"where":["NAME IN ('YJBV_POC_REPORT','YJBV_POC_INC')"]},"espera":"2 linhas: include SUBC = 'I', report SUBC = '1'"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `ExceptionParameterNotFound` | PUT de include de programa existente sem context= | context=/sap/bc/adt/programs/programs/<report> no PUT |
| HTTP 400 · `corrNr` | PUT de include de programa existente sem corrNr= | informar a transport request no PUT |
| `activationExecuted="false"` | ativou o report em vez do include que recebeu o PUT | ativar a URI do include (ou o par na mesma requisição) |

### `interface` — interface (INTF/OI)

**O que faz.** Interface ABAP OO (INTF). A lib cria/altera o source completo (`INTERFACE … PUBLIC. … ENDINTERFACE.`) e ativa.

**Como a lib trata.** Shell `intf:abapInterface` → lock → PUT /source/main → unlock → activate (deploySource). GET com Accept `application/*` — o media type do create devolve 406 na leitura.

- Forma: `source`
- ADT: coleção `/sap/bc/adt/oo/interfaces` · Content-Type `application/vnd.sap.adt.oo.interfaces.v2+xml` · Accept do GET `application/*` · /source/main: sim
- Nome: até 30 caracteres (documentação SAP (nome de objeto OO); não medido)
- Entrada aceita: `intf`, `interface`, `if` (plural com "s" também vale)
- Spike: 2026-07-19 · DEV · revalidado: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `createBody`
- Origem: skill adt-objetos § INTF/OI — interface
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - GET exige Accept application/* (ou v5); o ct do create dá 406 na leitura — o objeto "some" depois de criado
  - interface não tem includes (…/includes/… dá 404); crie a interface ANTES da classe que a implementa

**Exemplo de uso.**

```js
await deploy(conexao, 'interface', {
  name: "YJBV_POC_IF_X",
  pkg: "$TMP",
  description: "POC interface",
  source: `INTERFACE yjbv_poc_if_x PUBLIC.
  METHODS executar RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDINTERFACE.`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'SEOCLASS', { campos: ["CLSNAME","CLSTYPE"], where: ["CLSNAME = 'YJBV_POC_IF_X'"] })` → 1 linha, CLSTYPE = '1' (interface). Estado ativo: getObject → adtcore:version="active". *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — driver com classe local que implementa a interface e chama o método (prova ativação + assinatura) *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_if DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS lcl_impl DEFINITION. PUBLIC SECTION. INTERFACES yjbv_poc_if_x. ENDCLASS.
   CLASS lcl_impl IMPLEMENTATION. METHOD yjbv_poc_if_x~executar. rv_ok = abap_true. ENDMETHOD. ENDCLASS.
   CLASS yjbv_poc_cl_if IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA(lo) = NEW lcl_impl( ).
       out->write( |IF ok={ lo->yjbv_poc_if_x~executar( ) }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"IF ok=X","espera":"a classe local compila contra a interface e o método responde"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 406 | GET com o media type do create (interfaces.v2+xml) | Accept application/* (ou v5) — o módulo já usa; create OK não prova nada sobre o GET |
| HTTP 404 · `includes` | interface não tem includes | não há o que gravar em …/includes/… |

### `lockObject` — lock object (ENQU/DL)

**O que faz.** Objeto de bloqueio do dicionário (ENQU, SE11): a partir de uma tabela primária, modo e parâmetros (campos de chave), a ativação GERA os function modules ENQUEUE_<nome>/DEQUEUE_<nome> no grupo /1BCDWBEN/*. É o que um programa chama para travar uma chave no servidor de enqueue (SM12) antes de escrever.

**Como a lib trata.** XML puro `enqu:lockobject`, sem /source/main (404): create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody genérico). Nasce INATIVO e é a ativação que gera os FMs (TFDIR). Alterar modo, RFC ou tabelas de um objeto ATIVO é o mesmo deploy; a alteração da tabela-base deixa uma versão L na DD25L até a próxima ativação.

- Forma: `xml`
- ADT: coleção `/sap/bc/adt/ddic/lockobjects/sources` · Content-Type `application/vnd.sap.adt.lockobjects.v1+xml` · /source/main: não
- Nome: até 16 caracteres (typestructure do s4h 758 (OBJNAME_MAXLENGTH 16); prefixo E medido por 409 no create de YJBV_POC_L1)
- Entrada aceita: `enqu`, `lockobject`, `lock object`, `objeto de bloqueio`, `objetodebloqueio`, `enqueue` (plural com "s" também vale)
- Spike: 2026-08-29 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `soapRfc`
- Ganchos: `validar`, `body`
- Origem: spike 2026-08-29 (fila item 12): discovery do s4h + GET de EMMARAE/E_TABLE/EVVBAKE//ACCGO/E_DPQS com accept lockobjects.v1+xml · docs/pesquisa-tipos-adt-nao-cobertos.md § ENQU · docs/ideias.md I2
- Depende de:
  - `table` — tabela primária (e secundárias) — precisam estar ATIVAS na ativação do lock object
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - o nome começa por E (EY…/EZ…): sem o E o create devolve 409 "objetos de teste em conjuntos de nomes externos" — o guard-rail recusa antes da rede
  - `def.table` e `def.parameters` são obrigatórios: os parâmetros são campos de CHAVE da tabela primária (MANDT inclusive quando a tabela depende de mandante) e viram a assinatura do ENQUEUE_/DEQUEUE_
  - o create NÃO valida a tabela: com tabela inexistente o POST devolve 201 (inativo) e só a ATIVAÇÃO falha, com "Tabela de base … do objeto de bloqueio não existente ativa" (D0 408) — medido
  - tabela secundária SEM chave estrangeira para a primária é DESCARTADA EM SILÊNCIO: PUT 200, ativação 200, e a DD26S só tem a primária. Com FK (`with foreign key` no DDL da secundária — que exige campo com data element, E2 181) ela persiste (TABPOS 0002, ENQMODE na DD27S) — medido
  - `allowRFC: true` é o que torna os FMs remote-enabled (TFDIR FMODE='R'): é pré-requisito para chamá-los por SOAP RFC ou por `DESTINATION 'NONE'` no driver
  - mudar o TIPO de um campo da tabela primária com o lock object ativo deixa uma versão AS4LOCAL='L' na DD25L ao lado da ativa — o próximo deploy do lock object a resolve
  - lock tomado num driver classrun por DESTINATION 'NONE' ou com _scope=2 SOBREVIVE ao fim do main (a sessão ADT stateful continua viva) e ao DELETE do lock object — a execução seguinte acha FOREIGN_LOCK numa chave que ninguém usa. O driver termina com DEQUEUE_ALL nos dois contextos; lock que ficou se solta com classrun.liberarLocks(cx, "<garg>") — medido

**Exemplo de uso.** YJBV_POC_LK_T (key mandt, key id numc10) criada antes pelo módulo table. Variante com secundária: def.secondaryTables: [{ table: "YJBV_POC_LK_T2", lockMode: "S" }] — só persiste se T2 tem FK para T.

```js
await deploy(conexao, 'lockObject', {
  name: "EYJBV_POC_LK",
  pkg: "$TMP",
  description: "POC lock object",
  def: {
    table: "YJBV_POC_LK_T",
    lockMode: "E",
    parameters: [
      "MANDT",
      "ID"
    ],
    allowRFC: true
  }
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'DD25L', { campos: ["VIEWNAME","AS4LOCAL","AGGTYPE","ROOTTAB"], where: ["VIEWNAME = 'EYJBV_POC_LK'"] })` → 1 linha AS4LOCAL='A', AGGTYPE='E', ROOTTAB = def.table. Os FMs gerados estão na TFDIR (ENQUEUE_<nome>, DEQUEUE_<nome>; FMODE='R' se allowRFC); as tabelas na DD26S e os parâmetros na DD27S. *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o lock object está ativo e gerou os FMs? readTable em DD25L (AGGTYPE E) e TFDIR (ENQUEUE_/DEQUEUE_, FMODE R quando allowRFC) *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TFDIR","campos":["FUNCNAME","PNAME","FMODE"],"where":["FUNCNAME LIKE '%EYJBV_POC_LK'"]},"espera":"2 linhas, ENQUEUE_EYJBV_POC_LK e DEQUEUE_EYJBV_POC_LK, PNAME /1BCDWBEN/SAPLTEN0000, FMODE='R' com allowRFC (vazio sem) — medido. DD25L: VIEWNAME, AS4LOCAL='A', AGGTYPE='E', ROOTTAB = a tabela; DD26S: uma linha por tabela (TABPOS); DD27S: parâmetros com KEYFLAG X e uma linha FIELDNAME='*' por tabela com o ENQMODE"}`

2. **`classrun`** — o bloqueio EXCLUI outra sessão? driver trava a chave, tenta a mesma chave por DESTINATION NONE (outro contexto/owner) e lê FOREIGN_LOCK; outra chave passa; depois do DEQUEUE a mesma chave passa — o contrafactual é o que prova *(medido: 2026-08-29 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_lk DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_lk IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA lt TYPE STANDARD TABLE OF seqg3.
       DATA(lv_id) = CONV numc10( '0000000007' ).
       CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' EXPORTING mandt = sy-mandt id = lv_id
         EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
       out->write( |1 enqueue local subrc={ sy-subrc }| ).
       CALL FUNCTION 'ENQUEUE_READ' EXPORTING gclient = sy-mandt guname = sy-uname TABLES enq = lt EXCEPTIONS OTHERS = 1.
       LOOP AT lt INTO DATA(ls) WHERE gname = 'YJBV_POC_LK_T'.
         out->write( |2 sm12 garg={ ls-garg } gmode={ ls-gmode }| ).
       ENDLOOP.
       CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = lv_id
         EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
       out->write( |3 mesma chave, outro contexto subrc={ sy-subrc }| ).
       CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = CONV numc10( '0000000008' )
         EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
       out->write( |4 outra chave, outro contexto subrc={ sy-subrc }| ).
       CALL FUNCTION 'DEQUEUE_EYJBV_POC_LK' EXPORTING mandt = sy-mandt id = lv_id.
       CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = lv_id
         EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
       out->write( |5 mesma chave apos dequeue subrc={ sy-subrc }| ).
       " os locks do contexto NONE (e de _scope=2) SOBREVIVEM ao fim do main — a sessão ADT continua viva.
       " Sem isto a próxima execução acha FOREIGN_LOCK numa chave que ninguém mais usa (medido).
       " DEQUEUE_ALL não é RFC (DESTINATION NONE dumpa): solta-se pelo DEQUEUE_ gerado, chave a chave.
       CALL FUNCTION 'DEQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = lv_id.
       CALL FUNCTION 'DEQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = CONV numc10( '0000000008' ).
       CALL FUNCTION 'DEQUEUE_ALL'.
       CLEAR lt.
       CALL FUNCTION 'ENQUEUE_READ' EXPORTING gclient = sy-mandt guname = sy-uname TABLES enq = lt EXCEPTIONS OTHERS = 1.
       DELETE lt WHERE gname <> 'YJBV_POC_LK_T'.
       out->write( |6 sm12 apos dequeue_all locks={ lines( lt ) }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"1 enqueue local subrc=0 · 2 sm12 garg=250<id> gmode=E · 3 mesma chave, outro contexto subrc=1 · 4 outra chave, outro contexto subrc=0 · 5 mesma chave apos dequeue subrc=0 · 6 sm12 apos dequeue_all locks=0","espera":"a chave travada bate em FOREIGN_LOCK (1) de outro contexto e só ela; liberada, passa (0); e o driver deixa a SM12 limpa. Exige allowRFC (DESTINATION NONE só chama FM remote-enabled)"}`

3. **`soapRfc`** — com allowRFC o ENQUEUE_ é chamável de fora: callFunction(cfg, "ENQUEUE_EYJBV_POC_LK", { MANDT, ID }) responde sem SOAP Fault (o lock morre com a LUW da chamada) *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"http":"ENQUEUE_EYJBV_POC_LK.Response sem Fault","espera":"resposta vazia sem fault = FM RFC gerado e executável; sem allowRFC a chamada falha (FM não é remote-enabled)"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 409 · `conjuntos de nomes externos` | nome sem o E inicial (YJBV_…): para o SAP, lock object fora do prefixo E é "conjunto de nomes externo" | nomear EY…/EZ… (a lib recusa antes da rede pelo nomeacao.prefixo) |
| `não existente ativa` | a tabela primária (ou secundária) não existe/não está ativa — o create aceitou (201) e a ativação recusou (D0 408) | criar/ativar a tabela antes (dependencias: table); depois repetir o deploy |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| ENQU não é criável por ADT REST — só aparece sob o wrapper /vit/ e o vscode_abap_remote_fs o marca unsupported | o s4h 758 tem a coleção nativa /sap/bc/adt/ddic/lockobjects/sources (accept lockobjects.v1+xml, categoria enqudl): POST 201, PUT altera o ativo, activate gera os FMs, DELETE 200 | 2026-08-29 · S4H |
| PUT 200 + ativação sem mensagem = a definição inteira foi gravada | a tabela secundária sem chave estrangeira para a primária sai do XML gravado sem erro nenhum (secondaryTables vazio no GET, DD26S só com a primária); o assert é a DD26S, não o status | 2026-08-29 · S4H |
| dois ENQUEUE do mesmo usuário na mesma sessão com owners diferentes (_scope 1 e 2) colidem | não colidem: ENQUEUE com _scope=2 sobre a chave já travada pelo owner de diálogo devolveu subrc=0; a colisão (FOREIGN_LOCK) só apareceu de OUTRO contexto (DESTINATION NONE) | 2026-08-29 · S4H |

### `metadataExtension` — metadata extension (DDLX/EX)

**O que faz.** Metadata extension (DDLX): anotações @UI sobre uma CDS (`annotate entity …`), separadas da view. É o que desenha o app Fiori Elements.

**Como a lib trata.** Shell `ddlx:ddlxSource type="DDLX/EX"` → lock → PUT /source/main com o `annotate entity` → unlock → activate (deploySource).

- Forma: `source`
- ADT: coleção `/sap/bc/adt/ddic/ddlx/sources` · Content-Type `application/vnd.sap.adt.ddic.ddlx.v1+xml` · /source/main: sim
- Nome: até 40 caracteres (typestructure do s4h 758 (OBJNAME_MAXLENGTH 40, fila 26); não medido por rejeição)
- Entrada aceita: `ddlx`, `metadataextension`, `metadata extension`, `extensao de metadados` (plural com "s" também vale)
- Spike: 2026-08-05 · DEV
- Releases medidos: nenhum registrado
- Canais: `adt`, `odata`, `wdi5`
- Ganchos: `createBody`
- Origem: skill adt-objetos § DDLX/EX — metadata extension · skill adt-objetos § App de manutenção tipo SM30
- Depende de:
  - `cds` — a entidade anotada (com @Metadata.allowExtensions: true)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - a CDS anotada precisa de @Metadata.allowExtensions: true

**Exemplo de uso.** Ilustrativo sobre a CDS do spike wdi5. Anotações @UI só têm efeito num app (categoria 0) — o assert é visual/wdi5, não por tabela.

```js
await deploy(conexao, 'metadataExtension', {
  name: "YJBV_POC_WDI5_X",
  pkg: "$TMP",
  description: "POC anotações UI",
  source: `@Metadata.layer: #CUSTOMER
annotate entity YJBV_POC_WDI5_C with {
  @UI.lineItem: [{ position: 10 }] @UI.selectionField: [{ position: 10 }]
  TableName;
  @UI.lineItem: [{ position: 20 }]
  TableClass;
}`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'DDLX'","OBJ_NAME = 'YJBV_POC_WDI5_X'"] })` → 1 linha (existe). Estado ativo: getObject → adtcore:version="active". Efeito: $metadata / app. *(tabela por documentação; não medido)*

**Como testar no ABAP.**

1. **`wdi5`** — não tem teste isolado: prova-se pelo app — no preview FE (…/odatav4/feap) as colunas anotadas aparecem na tabela e o campo de seleção no FilterBar (harness em examples/wdi5) *(ainda não provado)*
   Assert: `{"wdi5":"FilterBar com o campo anotado; tabela com as colunas na ordem das positions","espera":"as anotações chegaram ao app"}`

2. **`odata`** — o $metadata da SRVB traz as anotações UI da DDLX no bloco <Annotations> *(ainda não provado)*
   Assert: `{"http":"GET $metadata → contém UI.LineItem para a entidade","espera":"anotação presente"}`

### `msag` — classe de mensagens (MSAG/N)

**O que faz.** Classe de mensagens (MSAG, SE91): as mensagens numeradas que o código emite com MESSAGE … TYPE. As mensagens vão inline no XML.

**Como a lib trata.** create(body sem mensagens) numa sessão 100% STATELESS se faltar → lock → PUT(body com mensagens) → unlock → re-GET. Nasce ativo: não há activate. Devolve as mensagens gravadas.

- Forma: `custom`
- ADT: coleção `/sap/bc/adt/messageclass` · Content-Type `application/xml` · Accept do GET `application/*` · /source/main: não
- Nome: até 20 caracteres (documentação SAP (ARBGB, SE91); não medido)
- Entrada aceita: `msag`, `classe de mensagens`, `message class`, `mensagens` (plural com "s" também vale)
- Spike: 2026-07-19 · DEV · revalidado: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `body`, `deploy`
- Origem: skill adt-objetos § MSAG/N — classe de mensagens · skill adt-objetos § Pontos abertos (MSAG stateless)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - create exige sessão stateless (conexao.sessaoStateless()) — stateful prende o objeto e o lock dá 403 "currently editing"; o spike mediu que nem sempre basta (ponto aberto na skill)
  - body do create é diferente do body do PUT (create sem mensagens) — o POST ignora as <mc:messages> inline
  - não chamar activate: nasce ativo
  - GET só com Accept application/*
  - IDIOMA: a classe nasce com T100A.MASTERLANG vazio e as mensagens com T100.SPRSL vazio (o GET do ADT diz masterLanguage="PT", a tabela não) — MESSAGE … INTO em sy-langu=P devolve a forma técnica "I:CLASSE:001 4711", não o texto. Medido 2026-08-28 S4H 758. PONTO ABERTO: o body precisa declarar o idioma de outro jeito, ou o texto exige PUT em sessão com sap-language

**Exemplo de uso.** As mensagens são a parte que o POST ignora — o teste (MESSAGE … INTO) pega o create-sem-PUT.

```js
await deploy(conexao, 'msag', {
  name: "YJBV_POC_MSG",
  pkg: "$TMP",
  description: "Mensagens POC",
  messages: [
    {
      no: "001",
      text: "Registro &1 processado pelo agente"
    },
    {
      no: "002",
      text: "Nada a fazer",
      selfExplanatory: true
    }
  ]
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'T100A', { campos: ["ARBGB","STEXT","MASTERLANG"], where: ["ARBGB = 'YJBV_POC_MSG'"] })` → 1 linha (cabeçalho da classe) — MASTERLANG vem VAZIO (medido). Mensagens: T100 por ARBGB, SPRSL também vazio (ver testes). *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — as mensagens persistiram? T100 por ARBGB (sem filtrar SPRSL — hoje ele fica VAZIO) e T100A (MASTERLANG também vazio). É o assert do PUT-sem-o-qual-o-POST-descarta, e o que revelou o problema de idioma *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"T100","campos":["SPRSL","MSGNR","TEXT"],"where":["ARBGB = 'YJBV_POC_MSG'"]},"espera":"2 linhas com os textos; SPRSL = '' (ponto aberto de idioma)"}`

2. **`classrun`** — driver emite a mensagem com MESSAGE … INTO — HOJE devolve a forma técnica ("I:YJBV_POC_MSG:001 4711") porque o texto está em SPRSL vazio, não em sy-langu. Quando o idioma for resolvido, o assert passa a ser o texto *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_msg DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_msg IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       MESSAGE i001(yjbv_poc_msg) WITH '4711' INTO DATA(lv_txt).
       out->write( |langu={ sy-langu } MSG 001={ lv_txt }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"langu=P MSG 001=I:YJBV_POC_MSG:001 4711 (medido; o desejado é \"Registro 4711 processado pelo agente\")","espera":"a classe existe e a mensagem é referenciável; o TEXTO só resolve quando SPRSL for o da sessão"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| `:001` | MESSAGE … INTO devolveu "I:CLASSE:001 …" (forma técnica): o texto não existe no idioma da sessão — a lib grava as mensagens com SPRSL vazio | ponto aberto (2026-08-28): conferir T100.SPRSL; enquanto isso, texto de mensagem criado pela lib não resolve em runtime |
| HTTP 403 · `EU510` | o create prendeu o objeto em ENQUEUE (sessão stateful) e o lock seguinte é recusado | create em sessão stateless (o módulo já faz); se persistir, esperar o timeout / SM12 — ponto aberto medido |
| HTTP 406 | GET com media type vnd.sap.adt.messageclass.* | Accept application/* |

### `numberRangeObject` — objeto de numeração (SNRO) (NROB/NRO)

**O que faz.** Cria/altera o objeto de numeração — a linha da TNRO que NUMBER_RANGE_INTERVAL_UPDATE exige para aceitar intervalos e que NUMBER_GET_NEXT consulta. Sem ele, era SNRO (GUI).

**Como a lib trata.** create `blue:blueSource` com ct `blues.v1+xml` e **version="inactive"** → lock → PUT /source/main em application/json (o fonte AFF) → unlock → ACTIVATE (é a ativação que grava a TNRO).

- Forma: `json`
- ADT: coleção `/sap/bc/adt/numberranges/objects` · Content-Type `application/vnd.sap.adt.blues.v1+xml` · Accept do GET `application/*` · /source/main: sim
- Nome: até 10 caracteres (TNRO-OBJECT CHAR 10 (DD03L, medido 2026-09-01))
- Entrada aceita: `nrob`, `numberrangeobject`, `snro`, `objeto de numeracao`, `number range`, `range de numeracao` (plural com "s" também vale)
- Spike: 2026-09-01 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `validar`, `createBody`, `body`
- Origem: spike fila 44 (2026-09-01, S4H 758) · discovery: workspace "Number Range Management" → coleção numberranges/objects · $schema servido pelo sistema (nrob-v1.json) · item 38: o desmentido de "NROB não tem coleção no on-prem"
- Depende de:
  - `domain` — numberLengthDomain — dá o comprimento do número
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - o shell do create leva `adtcore:version="inactive"` — com "active" o create devolve 400 (NR 870 "O objeto não existe") e CRIA o objeto assim mesmo, deixando órfão para quem tratar o 400 como falha
  - create só com `application/vnd.sap.adt.blues.v1+xml` (plural) — o 415 do ct errado NÃO nomeia o suportado
  - PUT do /source/main em `application/json`; `text/plain` não é o media type do fonte AFF
  - ATIVE: ao contrário do APLO, o PUT sozinho não grava a TNRO — só o activate
  - nome máximo 10 (TNRO-OBJECT); `numberLengthDomain` é um DOMÍNIO (NUMC/CHAR, 1 a 20), não um data element
  - intervalo NÃO vem no objeto: é dado de mandante (NRIV) e vai por driver — `nrob.mjs` (`deployIntervalos`/`apagarIntervalos`), porque nenhum NUMBER_RANGE_* é RFC
  - antes de apagar o objeto, apague os intervalos (`apagarIntervalos`): com NRIV o DELETE dá 400 NR 874

**Exemplo de uso.** o fonte JSON pode vir pronto em `source`; `dominio`/`percentual`/`buffering` são o atalho que o monta.

```js
await deploy(conexao, 'numberRangeObject', {
  name: "YJBV_POC_A",
  pkg: "$TMP",
  description: "POC fila 44 - number range object",
  dominio: "NUM10",
  percentual: 10,
  buffering: "none"
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TNRO', { campos: ["OBJECT","DOMLEN","PERCENTAGE","BUFFER","NOIVBUFFER"], where: ["OBJECT = 'YJBV_POC_A'"] })` → 1 linha, DOMLEN = o domínio do fonte. A linha só aparece DEPOIS do activate; a TADIR (R3TR NROB) já existe desde o create. *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — o intervalo 01 gravado por `deployIntervalos` (nrob.mjs) e dois números tirados — o objeto só é "real" se o NUMBER_GET_NEXT andar *(medido: 2026-09-01 · S4H 758)*

   ```abap
   // pela lib, não à mão — `buildIntervalosSource` monta o driver com os gotchas dentro:
   import { deployIntervalos } from 'adt-client/nrob';
   await deployIntervalos(conexao, {
     objeto: 'YJBV_POC_A',
     intervalos: [{ nr: '01', de: '0000000001', ate: '0000009999' }],
     proximoDe: '01',
   });
   // o ciclo do driver: ENQUEUE → UPDATE_INIT → INTERVAL_UPDATE (com INRIV-PROCIND!) →
   // UPDATE_CLOSE(commit) → DEQUEUE → NUMBER_GET_NEXT.
   ```

   Assert: `{"console":"NEXT subrc=0 num=0000000001 (e 0000000002 na 2ª chamada)","espera":"readTable NRIV em outra LUW: intervalo 01 com NRLEVEL andado. Com objeto inexistente o UPDATE_INIT devolve OBJECT_NOT_FOUND (subrc 1)"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `NR` | shell do create com `adtcore:version="active"` — o handler tenta ler a versão ativa (a TNRO), que só nasce na ativação | mande `version="inactive"` (ou omita). ATENÇÃO: o objeto FOI criado mesmo com o 400 — confira/limpe antes de recriar |
| HTTP 415 | content-type do create diferente de `blues.v1+xml` | use o media type que o discovery declara na coleção — o corpo do 415 não o nomeia |
| HTTP 406 · `source/main` | GET/PUT do fonte com text/plain ou com um vnd.sap.adt.* inventado | application/json (ou application/*) — o fonte é AFF/JSON |
| HTTP 400 · `874` | DELETE do objeto que ainda tem intervalo na NRIV (NR 874 "Existem intervalos para o objeto") | apague os intervalos antes: `apagarIntervalos(conexao, { objeto, confirm: true })` do `adt-client/nrob` |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| objeto de numeração só se cria na SNRO (GUI), ou por driver com `NUMBER_RANGE_OBJECT_*` (que a pesquisa dava como o caminho) | o ADT REST cria: POST `blues.v1+xml` → 201 inativo, PUT do fonte JSON, activate → linha na TNRO. E nenhum `NUMBER_RANGE_*` é RFC (item 38), então a via antiga era pior do que se pensava | 2026-09-01 · S4H 758 |
| HTTP 400 no create quer dizer que nada foi criado | com `version="active"` no shell o create devolve 400 NR 870 "O objeto não existe" E o objeto existe (TADIR gravada, GET 200 inactive, lock/PUT/activate funcionam). O 400 fala da versão ativa que ainda não há, não do create | 2026-09-01 · S4H 758 |

### `package` — pacote (DEVC/K)

**O que faz.** Pacote de desenvolvimento (DEVC, SE21/SE80): o contêiner onde todo objeto ABAP nasce e o que decide se ele é transportável. Para a lib é o que faltava para um objeto nascer com NOME DEFINITIVO no lugar certo — a regra "tudo em $TMP" existia porque o ADT não move objeto de pacote.

**Como a lib trata.** create: POST no body completo (v2+xml) → 201 já ATIVO, sem activate. Alterar: lock → PUT(body) → unlock, também sem activate. O `$` do nome decide o regime (local vs transportável) e `responsible` é obrigatório em MAIÚSCULAS.

- Forma: `custom`
- ADT: coleção `/sap/bc/adt/packages` · Content-Type `application/vnd.sap.adt.packages.v2+xml` · /source/main: não
- Nome: até 30 caracteres (TDEVC-DEVCLASS é CHAR30; não medido por rejeição)
- Entrada aceita: `devc`, `package`, `pacote`, `pacote de desenvolvimento`, `development package` (plural com "s" também vale)
- Spike: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`
- Ganchos: `validar`, `deploy`
- Origem: spike 2026-08-28 (fila item 10): discovery do s4h + GET de $TMP e SABAPDEMOS · docs/pesquisa-tipos-adt-nao-cobertos.md § DEVC · docs/ideias.md I15
- Depende de:
  - `package` — o `superPackage`, quando houver — precisa existir antes (vira TDEVC-PARENTCL)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - `adtcore:responsible` é OBRIGATÓRIO e em MAIÚSCULAS — em minúsculas dá 400 PAK 049 "Indicar um usuário válido"; o módulo usa `conexao.cfg.user` quando o chamador não informa
  - NÃO chamar activate: o pacote nasce ativo (ver desmentidos)
  - nome com `$` = LOCAL (DLVUNIT LOCAL, KORRFLAG vazio, sem linha na TADIR); nome sem `$` = TRANSPORTÁVEL. SEM `corrNr` o create gera uma TR de workbench + tarefa NOVAS no sistema (medido: S4HK912769/770); COM `corrNr` a ordem informada é honrada — a tarefa do usuário nasce NELA no primeiro uso (medido 2026-08-31, fila 24; `cts.criarRequest` fornece o número). Desfazer o ciclo inteiro tem via medida: `cts.destravarRequest`/`desmancharRequest` + `removerTadirOrfa` (receita-change-request § Ciclo de vida). Pacote transportável segue decisão de gente
  - pacote transportável exige `transportLayer` que exista — ler /sap/bc/adt/packages/valuehelps/transportlayers (layer inventada dá 400 TR 609)
  - depois de criar um pacote TRANSPORTÁVEL, todo deploy dentro dele exige `corrNr` (400 ExceptionParameterNotFound "Parameter corrNr") — o pacote local não exige nada
  - create só com Content-Type v2+xml (o v1+xml dá 415)
  - UMA modificação por sessão: o unlock não solta o pacote dentro da sessão que o modificou (2º lock devolve o mesmo handle e o PUT dá 400 "já está bloqueado"). O `deploy` já abre sessão própria; quem chamar as primitivas à mão precisa fazer o mesmo

**Exemplo de uso.** Pacote LOCAL do spike (S4H 758, 2026-08-28): sem `transportLayer`, sem TR, e a tabela YJBV_POC_PKG_T criada com `pkg: '$YJBV_POC_PKG'` nasceu com TADIR-DEVCLASS = $YJBV_POC_PKG. O transportável é o mesmo deploy sem o `$` e com `transportLayer` (ex.: { name: 'YJBV_POC_PKGT', transportLayer: 'ZS4H' }) — mas gera TR no sistema.

```js
await deploy(conexao, 'package', {
  name: "$YJBV_POC_PKG",
  description: "POC pacote local"
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TDEVC', { campos: ["DEVCLASS","PARENTCL","DLVUNIT","KORRFLAG","PDEVCLASS"], where: ["DEVCLASS = '$YJBV_POC_PKG'"] })` → 1 linha. Local: DLVUNIT='LOCAL', KORRFLAG=''. Transportável: DLVUNIT='HOME', KORRFLAG='X', PDEVCLASS=<transportLayer>. PARENTCL = superPackage. Efeito: um objeto deployado com `pkg` = este nome sai com TADIR-DEVCLASS igual a ele. *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o pacote existe no diretório de pacotes, visto de outra LUW (SOAP RFC) — e os campos dizem o regime *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TDEVC","campos":["DEVCLASS","PARENTCL","DLVUNIT","KORRFLAG","PDEVCLASS"],"where":["DEVCLASS = '$YJBV_POC_PKG'"]},"espera":"1 linha. LOCAL: DLVUNIT='LOCAL', KORRFLAG='' (medido). TRANSPORTÁVEL (YJBV_POC_PKGT): DLVUNIT='HOME', KORRFLAG='X', PDEVCLASS=<transportLayer> (medido). Sub-pacote: PARENTCL = o superPackage (medido)."}`

2. **`readTable`** — a prova que interessa: um objeto com nome definitivo NASCE dentro do pacote — é o que o `$TMP` obrigatório impedia *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TADIR","campos":["PGMID","OBJECT","OBJ_NAME","DEVCLASS"],"where":["OBJECT = 'TABL'","AND OBJ_NAME = 'YJBV_POC_PKG_T'"]},"espera":"1 linha com DEVCLASS = '$YJBV_POC_PKG' (medido: deploy de table com pkg = o pacote novo, created+activated, DD02L AS4LOCAL='A')."}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `responsável` | `adtcore:responsible` vazio ou em minúsculas (PAK 049 "Indicar um usuário válido como responsável pelo pacote em vez de <user>") | passar `responsible` em MAIÚSCULAS — ou deixar o módulo usar `conexao.cfg.user` (que ele já sobe para maiúsculas) |
| HTTP 400 · `esperado` | o body não traz todos os elementos do schema, na ordem (attributes, superPackage, applicationComponent, transport, useAccesses, packageInterfaces, subPackages) — o servidor reclama de um por vez | usar `buildPackageBody` (monta os sete, vazios quando não há conteúdo) |
| HTTP 400 · `Nível de transporte` | o `transportLayer` do pacote transportável não existe no sistema (TR 609) | ler GET /sap/bc/adt/packages/valuehelps/transportlayers e usar um dos nomes de lá (no s4h 758: SAP, ZS4H) |
| HTTP 400 · `corrNr` | não é o pacote que falhou: é um objeto sendo criado DENTRO de um pacote transportável sem `corrNr` (ExceptionParameterNotFound "Parameter corrNr wurde nicht gefunden") | passar `corrNr` no deploy do objeto (`cts.criarRequest` cria a ordem) — ou usar um pacote LOCAL (`$…`), que não exige TR |
| HTTP 415 | create com Content-Type application/vnd.sap.adt.packages.v1+xml — só o v2 é aceito na criação (o GET aceita os dois) | usar v2+xml (o `ct` do módulo) |
| HTTP 409 · `já está bloqueado na ordem` | DELETE de pacote transportável com o corrNr da TAREFA — o lock CTS aponta a ORDEM pai. A entrada do pacote nasce na E071 da TAREFA, não na da ordem (medido 2026-08-29: E071 de S4HK912769 = 0 linhas, E071 de S4HK912770 = R3TR DEVC YJBV_POC_PKGT com LOCKFLAG=X) — `cts.lerRequestPorTabelas` mostra os dois lados | usar como corrNr a ordem PAI (E070-STRKORR da tarefa): com ela o DELETE saiu 200 (medido). Depois disso a TR fica com a entrada e o DELETE da própria TR sai 400 "contém objetos bloqueados" — desde a fila 24 a limpeza tem via medida: `cts.desmancharRequest` (unlock + TR_DELETE_COMM por driver) e `removerTadirOrfa` para a linha TADIR DELFLAG=X (receita-change-request § Ciclo de vida) |
| HTTP 400 · `já está bloqueado` | segunda modificação do MESMO pacote na MESMA sessão: o create/PUT anterior prendeu o objeto e o unlock não o soltou (o lock seguinte devolve o mesmo handle). Não confundir com o 500 "já está bloqueado na ORDEM", que é lock de CTS | abrir sessão nova para cada modificação (é o que o `deploy` do módulo faz); sem senha em mãos, só a primeira modificação da sessão passa |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| pacote ativa como todo objeto: create → activate | nasce ativo. O POST devolve 201 e o GET já traz adtcore:version="active"; o POST em /sap/bc/adt/activation com a URI do pacote responde HTTP 200 com activationExecuted="false" e generationExecuted="true" — no-op. Aqui `activationExecuted="false"` NÃO é o erro transversal de "ativei a URI errada" | 2026-08-28 · S4H |
| o ADT REST só cria pacote não-transportável (é o que o sapcli documenta) | cria transportável: o POST de YJBV_POC_PKGT com softwareComponent HOME + transportLayer ZS4H devolveu 201 com recordChanges="true", KORRFLAG='X'. E sem `corrNr`: o próprio SAP gerou a TR de workbench e a tarefa ("Ordem gerada p/registro de modificações") — o pacote entrou NA TAREFA sozinho (`cts.lerRequest` mostra a ordem já com o objeto consolidado; `cts.lerRequestPorTabelas` mostra que a E071 da ordem está vazia) | 2026-08-28 · S4H |
| todo objeto criado prova-se pela TADIR | pacote LOCAL não tem linha na TADIR (readTable OBJECT='DEVC' devolveu 0 linhas para $YJBV_POC_PKG, enquanto o transportável YJBV_POC_PKGT devolveu 1). A prova de pacote é a TDEVC — que também diz o regime | 2026-08-28 · S4H |

### `prog` — programa (PROG/P)

**O que faz.** Programa executável ABAP (report, SE38). A lib cria/altera o source completo e ativa.

**Como a lib trata.** Shell `program:abapProgram type="PROG/P"` → lock → PUT /source/main → unlock → activate (deploySource).

- Forma: `source`
- ADT: coleção `/sap/bc/adt/programs/programs` · Content-Type `application/vnd.sap.adt.programs.programs.v2+xml` · /source/main: sim
- Nome: até 40 caracteres (documentação SAP (nome de programa); não medido)
- Entrada aceita: `report`, `relatorio`, `executavel` · para todos os alvos de PROG: `prog`, `programa`, `program` (plural com "s" também vale)
- Spike: 2026-07-19 · DEV · revalidado: 2026-08-17 · DEV; 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `aunit`
- Ganchos: `createBody`
- Origem: skill adt-objetos § PROG/P e PROG/I — programa e include
- Depende de:
  - `include` — includes do report (opcional); ativar o par [include, programa] na mesma requisição **(ativar na mesma requisição)**
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - SELECTION-SCREEN … WITH FRAME TITLE <var> já DECLARA <var>: um DATA <var> antes aborta a ativação ("was already declared") e o report fica criado e inativo — atribua o texto em INITIALIZATION
  - o ADT não grava text elements: título/label em português saem por variável implícita e %_campo_%_app_%-text em INITIALIZATION
  - NÃO testar report por SUBMIT dentro de um driver classrun: o endpoint responde HTTP 500 (página "Application Server Error") — medido 2026-08-28 S4H 758 com `SUBMIT … AND RETURN` e com `EXPORTING LIST TO MEMORY`; causa não lida (ST22). Prova de execução de report fica para aunit ou SA38

**Exemplo de uso.**

```js
await deploy(conexao, 'prog', {
  name: "YJBV_POC_REPORT",
  pkg: "$TMP",
  description: "POC report",
  source: `REPORT yjbv_poc_report.
PARAMETERS p_txt TYPE char20 DEFAULT 'agente'.
START-OF-SELECTION.
  WRITE: / |POC report { p_txt }|.`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TRDIR', { campos: ["NAME","SUBC"], where: ["NAME = 'YJBV_POC_REPORT'"] })` → 1 linha, SUBC = '1' (executável). Estado ativo: getObject → adtcore:version="active". *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — existência e tipo: TRDIR por NAME (report SUBC=1; include SUBC=I) — o report do exemplo, com INCLUDE yjbv_poc_inc e PERFORM, criou e ativou *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TRDIR","campos":["NAME","SUBC"],"where":["NAME = 'YJBV_POC_REPORT'"]},"espera":"1 linha, SUBC = '1'"}`

2. **`aunit`** — runUnitTests({ type: "prog", name }) roda as classes de teste que ficam num include do próprio report *(ainda não provado)*
   Assert: `{"unit":"executed > 0 && failed === 0","espera":"executed=0 NUNCA é sucesso"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| `was already declared` | DATA de uma variável que SELECTION-SCREEN … TITLE já declara | remover o DATA; só atribuir em INITIALIZATION |
| `activationExecuted="false"` | ativou o programa, mas a versão inativa está no include que recebeu o PUT | ativar o include, ou o par [include, programa] na mesma requisição |

### `serviceBinding` — service binding (SRVB/SVB)

**O que faz.** Service binding RAP (SRVB): liga uma service definition a um protocolo (OData V2/V4, UI ou Web API) e, publicado, vira o serviço chamável em /sap/opu/odata4/… (V4) ou /sap/opu/odata/sap/<binding>/ (V2). O binding V2 gera POR EFEITO a família SEGW/Gateway V2 na TADIR: IWMO/IWSV/IWVB no activate, IWSG/IWOM/OA2S no publish.

**Como a lib trata.** Objeto de CONFIG: POST do body (sem lock, sem source) se faltar → activate. Publicar é ação à parte (`publish`, passe `version` = a do binding), lida em <SEVERITY>; `unpublish` é pré-requisito para deletar (deleteObject chama `antesDeApagar` — passe `version: "V2"` no delete de um binding V2, senão o unpublish vai no job V4 e o serviço fica no ar). `odataV4RuntimeUrl`/`odataV2RuntimeUrl` montam a URL de runtime.

- Forma: `custom`
- ADT: coleção `/sap/bc/adt/businessservices/bindings` · Content-Type `application/vnd.sap.adt.businessservices.servicebinding.v2+xml` · /source/main: não
- Nome: até 40 caracteres (typestructure do s4h 758 (OBJNAME_MAXLENGTH 40, fila 26); não medido por rejeição)
- Entrada aceita: `srvb`, `servicebinding`, `service binding`, `binding` (plural com "s" também vale)
- Spike: 2026-07-27 · DEV · revalidado: 2026-08-05 · DEV; 2026-08-26 · S4H 758; 2026-08-28 · S4H 758; 2026-08-29 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `odata`, `wdi5`
- Ganchos: `validar`, `createBody`, `deploy`, `antesDeApagar`
- Origem: skill adt-objetos § SRVB/SVB — service binding + publish · skill adt-objetos § Consumir o OData V4 gerado · docs/receita-wdi5-fiori.md
- Depende de:
  - `serviceDefinition` — a SRVD ligada (uri no body do create)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - description é obrigatória (create dá 400 "Falta a descrição")
  - activate ≠ publish: ativar cria o binding; publicar é POST em odatav4/publishjobs com Accept vnd.sap.as+xml e <SEVERITY>OK
  - unpublish antes de deletar — SRVB publicado não pode ser removido
  - categoria decide tudo: 0 = UI (app Fiori), 1 = Web API (consumo externo); binding UI consumido como API dumpa UNCAUGHT_EXCEPTION no service document
  - runtime URL: use odataV4RuntimeUrl(binding, srvd, { category }) — o segmento depende da categoria (ver desmentidos)
  - o CSRF do runtime OData é DO SERVIÇO (o do ADT não vale); o cookie rotaciona a cada resposta (ver desmentidos)
  - V2: `version: "V2"` no deploy E no publish/unpublish/delete — o job V2 leva servicename/serviceversion na URL do job (jobRequest); com a forma do V4 o publish "erra" publicando e o unpublish "erra" sem fazer nada
  - V2 não cria nó SICF próprio para o binding RAP (medido: ICFSERVICE sem YJBV_POC_V2_SB) — os 434 nós Z em /default_host/sap/opu/odata/sap/ do s4h são do registro de serviço SEGW (/IWFND/MAINT_SERVICE), não do SRVB

**Exemplo de uso.** Reconstituído do spike wdi5 (S4H 758, 2026-08-26): binding OData V4 categoria 0 (UI), publicado, servido pelo preview FE do ADT. Depois do deploy: publishServiceBinding; URL: odataV4RuntimeUrl(name, srvd, { category: "0" }).

```js
await deploy(conexao, 'serviceBinding', {
  name: "YJBV_POC_WDI5_B",
  pkg: "$TMP",
  description: "POC binding OData V4 UI",
  srvd: "YJBV_POC_WDI5_S",
  category: "0"
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'SRVB'","OBJ_NAME = 'YJBV_POC_WDI5_B'"] })` → 1 linha (existe). Publicado: getObject → published=true / allowedAction=UNPUBLISH; runtime: $metadata 200. *(tabela por documentação; não medido)*

**Como testar no ABAP.**

1. **`odata`** — depois de publish: GET <odataV4RuntimeUrl>/$metadata → 200 com a entidade; GET da entidade com $top → linhas. Sessão do runtime: cookie rotaciona a cada resposta, CSRF do serviço *(medido: 2026-08-05 · DEV; 2026-08-26 · S4H 758; 2026-08-28 · S4H 758)*
   Assert: `{"http":"$metadata 200 + EntitySet; entidade ?$top=3 → 3 linhas","espera":"serviço publicado e respondendo (2026-08-28: deployMany SRVD+SRVB → publish \"published locally\" → $metadata 200 com a entidade → unpublish → delete, tudo pela lib)"}`

2. **`odata`** — binding V2: depois de publish V2, GET /sap/opu/odata/sap/<BINDING>/$metadata → 200 (edmx V1.0); TADIR por obj_name LIKE "<binding>%" mostra IWMO/IWSV/IWVB (activate) + IWSG/IWOM/OA2S (publish); /IWFND/I_MED_SRH IS_ACTIVE=A. Contrafactual: unpublish → $metadata 403 e IWSG/IWOM/OA2S somem; delete → IWMO/IWSV/IWVB somem *(medido: 2026-08-29 · S4H 758)*
   Assert: `{"http":"$metadata 200 publicado / 403 (/IWFND/MED/170) antes e depois do unpublish","tadir":"7 entradas YJBV_POC_V2% publicado → 4 após unpublish → 0 após delete","espera":"família Gateway V2 inteira (menos IWPR) nascendo e morrendo com o binding"}`

3. **`wdi5`** — preview Fiori Elements servido pelo ADT (…/odatav4/feap) dirigido por wdi5 headless com injeção de cookie: FilterBar → Go → linhas do OData V4 *(medido: 2026-08-26 · S4H 758)*
   Assert: `{"wdi5":"examples/wdi5/test/specs/preview.test.js 3/3 verdes","espera":"app renderiza e lista linhas"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `Falta a descrição` | create sem adtcore:description | informar description (validar do módulo já recusa antes da rede) |
| HTTP 406 · `publish` | publish com Accept diferente de application/vnd.sap.as+xml | o módulo já manda o Accept certo; conferir chamada manual |
| HTTP 400 · `Fim de elemento esperado` | & cru na uri do objectReference do publish | escapar como &amp; (o módulo já faz) |
| HTTP 403 · `não atribuído` | segmento da runtime URL não bate com a categoria (srvd vs srvd_a2x) | odataV4RuntimeUrl(binding, srvd, { category }) com a categoria real; na dúvida, sondar as duas |
| HTTP 405 · `Creating operations` | binding read-only (view entity sem BDEF) recebeu escrita | esperado: read-only recusa escrita; para CRUD, BDEF + projections |
| `UNCAUGHT_EXCEPTION` | binding categoria 0 (UI) consumido como Web API — o service document espera anotações @UI | consumidor externo usa categoria 1 |
| `CL_SADL_GW_V4_MODEL_PROPERTY` | a geração do modelo engasgou numa propriedade/associação | pegar o campo exato na ST22 (GET /sap/bc/adt/runtime/dumps) antes de podar a projeção |
| HTTP 403 · `EU510` | lock órfão no nome do binding após unpublish → delete → create | esperar ou limpar na SM12 |
| HTTP 200 · `Parameter servicename wurde nicht gefunden` | job V2 (publish/unpublish) com servicename/serviceversion na uri do objectReference (a forma do V4) — o publish ainda publica, o unpublish NÃO despublica | parâmetros na URL do job (jobRequest já faz para version V2); conferir `srvb:published` no GET e o $metadata depois |
| HTTP 403 · `/IWFND/MED/170` | runtime V2 chamado antes do publish, depois do unpublish, ou com sufixo _SRV (que é da SEGW) | publicar com version V2 e usar odataV2RuntimeUrl(binding) — sem _SRV |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| a URL de runtime OData V4 é sempre /sap/opu/odata4/sap/<binding>/srvd_a2x/… | depende da categoria: 1 (Web API) → srvd_a2x; 0 (UI) → srvd. O valor fixo vinha de um spike com categoria 1 e quebrava calado para UI (403 "repositório não atribuído"). Na dúvida, sondar as duas e usar a que responder 200. | 2026-08-05 · DEV |
| o 400 "Session Timed Out or Not Found" do runtime OData é o header stateful | é o COOKIE, que o runtime rotaciona a cada resposta — quem guarda o cookie antigo leva 400 na chamada seguinte. Três tentativas perdidas no diagnóstico errado. | 2026-08-05 · DEV |
| publish e unpublish V2 usam o mesmo body do V4, só trocando odatav4 por odatav2 | o job V2 lê servicename/serviceversion da URL do job, não da uri do objectReference. Com o body do V4: HTTP 200 + SEVERITY ERROR "Parameter servicename wurde nicht gefunden" — mas o publish publica assim mesmo (published=true, $metadata 200) e o unpublish não despublica. Com os parâmetros na URL: SEVERITY OK nos dois e o unpublish derruba (403 no $metadata). | 2026-08-29 · S4H 758 |
| a família SEGW/Gateway V2 (IWMO/IWSV/IWVB/IWSG/IWOM) só nasce pela SEGW + /IWFND/MAINT_SERVICE | um SRVB OData V2 do RAP gera as cinco (mais OA2S) sozinho: IWMO/IWSV/IWVB no activate, IWSG/IWOM/OA2S no publish, todas no pacote do binding. Só o IWPR (projeto SEGW) e o nó SICF por serviço não nascem. Medido no s4h 758, onde a família é 16% do custom. | 2026-08-29 · S4H 758 |

### `serviceDefinition` — service definition (SRVD/SRV)

**O que faz.** Service definition RAP (SRVD): `define service X { expose <cds>; }` — o que o service binding publica como OData.

**Como a lib trata.** Shell `srvd:srvdSource srvdSourceType="S"` → lock → PUT /source/main → unlock → activate (deploySource).

- Forma: `source`
- ADT: coleção `/sap/bc/adt/ddic/srvd/sources` · Content-Type `application/vnd.sap.adt.ddic.srvd.v1+xml` · /source/main: sim
- Nome: até 40 caracteres (typestructure do s4h 758 (OBJNAME_MAXLENGTH 40, fila 26); não medido por rejeição)
- Entrada aceita: `srvd`, `servicedefinition`, `service definition`, `definicao de servico` (plural com "s" também vale)
- Spike: 2026-07-27 · DEV · revalidado: 2026-08-26 · S4H 758; 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `odata`
- Ganchos: `createBody`
- Origem: skill adt-objetos § SRVD/SRV — service definition · docs/receita-wdi5-fiori.md
- Depende de:
  - `cds` — a(s) entidade(s) expostas
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - srvd:srvdSourceType="S" é obrigatório no shell (senão 400 "Service-Definitionstyp vazio")
  - write (CRUD) expõe as projections; read-only expõe a interface view entity direto — sem projection, sem BDEF

**Exemplo de uso.** Reconstituído do spike wdi5 (S4H 758, 2026-08-26): SRVD read-only sobre a CDS, publicada por SRVB categoria 0. Sufixos exatos não preservados.

```js
await deploy(conexao, 'serviceDefinition', {
  name: "YJBV_POC_WDI5_S",
  pkg: "$TMP",
  description: "POC service definition read-only",
  source: `@EndUserText.label: 'POC tabelas do dicionário'
define service YJBV_POC_WDI5_S {
  expose YJBV_POC_WDI5_C as Tables;
}`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'SRVD'","OBJ_NAME = 'YJBV_POC_WDI5_S'"] })` → 1 linha (existe). Estado ativo: getObject → adtcore:version="active". Função: $metadata pela SRVB. *(tabela por documentação; não medido)*

**Como testar no ABAP.**

1. **`odata`** — não tem teste isolado: prova-se pelo consumidor — SRVB publicada sobre ela responde $metadata com a entidade exposta (Tables) *(medido: 2026-08-26 · S4H 758; 2026-08-28 · S4H 758)*
   Assert: `{"http":"GET <odataV4RuntimeUrl>/$metadata → 200 com EntityType Tables","espera":"a entidade exposta aparece no modelo"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `Service-Definitionstyp` | shell sem srvd:srvdSourceType="S" | o createBody do módulo já manda o "S"; conferir se um body customizado o omitiu |

### `structure` — estrutura (TABL/DS)

**O que faz.** Estrutura do dicionário ABAP (TABL/DS) — tipo de linha sem tabela de banco. A lib cria/altera pelo DDL `define structure { … }`.

**Como a lib trata.** Mesmo shell `blue:blueSource` da tabela, com type="TABL/DS"; create → lock → PUT /source/main → unlock → activate (deploySource).

- Forma: `source`
- ADT: coleção `/sap/bc/adt/ddic/structures` · Content-Type `application/vnd.sap.adt.structures.v2+xml` · /source/main: sim
- Nome: até 30 caracteres (documentação SAP (DDIC); não medido — estrutura de 21 caracteres passou no mesmo deploy em que a tabela de 19 foi recusada)
- Entrada aceita: `structure`, `estrutura`, `struct` · para todos os alvos de TABL: `tabl` (plural com "s" também vale)
- Spike: 2026-07-27 · DEV · revalidado: 2026-08-27 · DEV; 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `createBody`
- Origem: skill adt-objetos § TABL/DS — estrutura
- Depende de:
  - `dataElement` — tipos dos campos, quando não são built-in
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - @AbapCatalog.enhancement.category é OBRIGATÓRIA no DDL — sem ela o PUT dá 400 enganoso (ExceptionResourceAlreadyExists = erro de sintaxe)
  - comentário // dentro do define structure derruba o PUT com o mesmo 400 (o editor blue source não aceita; o de CDS aceita)

**Exemplo de uso.** Nome e DDL ilustrativos no padrão da POC; a anotação obrigatória e a ausência de // são os pontos medidos.

```js
await deploy(conexao, 'structure', {
  name: "YJBV_POC_ST_LINHA",
  pkg: "$TMP",
  description: "POC estrutura",
  source: `@EndUserText.label : 'POC estrutura'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
define structure yjbv_poc_st_linha {
  id    : abap.numc(10);
  texto : abap.char(80);
}`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'DD02L', { campos: ["TABNAME","AS4LOCAL","TABCLASS"], where: ["TABNAME = 'YJBV_POC_ST_LINHA'"] })` → 1 linha, AS4LOCAL = 'A', TABCLASS = 'INTTAB' (estrutura) *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — driver declara uma variável do tipo da estrutura (prova ativação em compile) e escreve os componentes *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_st DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_st IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA(ls) = VALUE yjbv_poc_st_linha( id = '0000000001' texto = 'estrutura ativa' ).
       out->write( |ST id={ ls-id } texto={ ls-texto }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"ST id=0000000001 texto=estrutura ativa","espera":"driver ativa (a estrutura existe e está ativa) e escreve os componentes"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 400 · `ExceptionResourceAlreadyExists` | NÃO é objeto duplicado: erro de sintaxe no DDL — falta @AbapCatalog.enhancement.category ou há comentário // no corpo | acrescentar a anotação; remover os //; ler "Kein Sichern wegen Fehler in Quelle" no corpo |

### `table` — tabela (TABL/DT)

**O que faz.** Tabela transparente do dicionário ABAP (SE11). A lib cria/altera pelo DDL `define table { … }` e ativa.

**Como a lib trata.** Shell `blue:blueSource type="TABL/DT"` no create → lock → PUT /source/main com o DDL → unlock → activate. Fluxo source-based genérico (deploySource).

- Forma: `source`
- ADT: coleção `/sap/bc/adt/ddic/tables` · Content-Type `application/vnd.sap.adt.tables.v2+xml` · /source/main: sim
- Nome: até 16 caracteres (medido: 422 ExceptionUnprocessableEntity / AD(102) ao estourar — só a tabela transparente tem esse teto (nome físico no banco); inclui o namespace)
- Entrada aceita: `table`, `tabela`, `tab` · para todos os alvos de TABL: `tabl` (plural com "s" também vale)
- Spike: s/ data · DEV · revalidado: 2026-08-26 · S4H 758; 2026-08-26 · SXD 816; 2026-08-28 · S4H 758
- Releases medidos: 758, 816
- Canais: `adt`, `classrun`, `soapRfc`
- Ganchos: `createBody`
- Origem: docs/receita-ciclo-escrita-verificacao.md · skill adt-objetos § TABL/DT — tabela
- Depende de:
  - `dataElement` — tipos dos campos, quando não são built-in (abap.char…)
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - nome ≤ 16 caracteres com namespace (estrutura, DE, classe… aceitam mais — o erro parece incoerente)
  - palavra reservada em nome de campo falha a ativação com DT(205): IS, DATA, DATE, MESSAGE (confirmados); TABLE, TYPE, VALUE, LINE, KEY, TIME (prováveis)
  - CURR/QUAN exigem campo de referência (WAERS/MEINS) + @Semantics.amount.currencyCode
  - deploySource sobrescreve sem avisar: script antigo com DDL velho REVERTE a tabela e derruba as classes dependentes

**Exemplo de uso.** Objeto da POC do ciclo (S4H 758 e SXD 816, 2026-08-26). Campos ID/TEXTO/DATUM/UZEIT são os medidos; o texto exato do DDL não foi preservado na receita — este é reconstituído.

```js
await deploy(conexao, 'table', {
  name: "YJBV_POC_TB_LOG",
  pkg: "$TMP",
  description: "POC log — ciclo arrange→act→assert",
  source: `@EndUserText.label : 'POC log do agente'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table yjbv_poc_tb_log {
  key mandt : mandt not null;
  key id    : abap.numc(10) not null;
  texto     : abap.char(80);
  datum     : abap.dats;
  uzeit     : abap.tims;
}`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'DD02L', { campos: ["TABNAME","AS4LOCAL","TABCLASS"], where: ["TABNAME = 'YJBV_POC_TB_LOG'"] })` → 1 linha, AS4LOCAL = 'A' (ativa), TABCLASS = 'TRANSP'. Conteúdo: readTable na própria tabela (medido no ciclo). *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — ARRANGE deploySource da tabela → ACT driver classrun faz INSERT + COMMIT WORK AND WAIT e escreve subrc + chave → ASSERT readTable em OUTRA LUW acha a linha exata *(medido: 2026-08-26 · S4H 758; 2026-08-26 · SXD 816; 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_write DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_write IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA(ls_linha) = VALUE yjbv_poc_tb_log( mandt = sy-mandt id = '0000000001'
                                               texto = 'escrito pelo agente via classrun' datum = sy-datum uzeit = sy-uzeit ).
       INSERT yjbv_poc_tb_log FROM @ls_linha.
       DATA(lv_subrc) = sy-subrc.
       COMMIT WORK AND WAIT.
       out->write( |WRITE_RESULT subrc={ lv_subrc } id={ ls_linha-id }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"WRITE_RESULT subrc=0 id=<id>","readTable":{"tabela":"YJBV_POC_TB_LOG","where":["ID = '<id>'"]},"espera":"1 linha com TEXTO/DATUM/UZEIT do driver — em outra requisição/LUW, senão o SELECT veria a linha não comitada"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 422 · `AD(102)` | nome da tabela acima de 16 caracteres (com namespace) | encurtar o descritor, nunca o namespace; fechar o nome no desenho — renomear depois cascateia |
| `DT(205)` | palavra reservada em nome de campo (IS, DATA, DATE, MESSAGE…) | renomear o campo e validar por deploy — o "conserto" também pode ser reservado (DATA → DATE) |
| HTTP 400 · `Kein Sichern wegen Fehler in Quelle` | erro de sintaxe no DDL (a exceção ExceptionResourceAlreadyExists engana) | ler o corpo inteiro do erro e corrigir o DDL |
| `does not have component` | a tabela foi REVERTIDA por um deploy com DDL antigo e as classes dependentes quebraram | rodar o script autoritativo (DDL mais recente) e reativar as classes dependentes |

### `tableType` — table type (TTYP/DA)

**O que faz.** Tipo de tabela do dicionário (TTYP): tabela interna tipada — linha (estrutura/DE ou tipo predefinido), acesso (standard/sorted/hashed) e chave. É o que assinaturas de FM/classe e parâmetros TABLES tipados referenciam.

**Como a lib trata.** XML puro `ttyp:tableType`: create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody). Linha de dicionário = typeKind dictionaryType + typeName + dataType STRU; tipo predefinido = predefinedAbapType + dataType (STRING…); chave por componentes = definition keyComponents + lista de ttyp:component.

- Forma: `xml`
- ADT: coleção `/sap/bc/adt/ddic/tabletypes` · Content-Type `application/vnd.sap.adt.tabletype.v1+xml` · /source/main: não
- Nome: até 30 caracteres (documentação SAP (DDIC); não medido)
- Entrada aceita: `ttyp`, `tabletype`, `table type`, `tipo de tabela`, `tipotabela` (plural com "s" também vale)
- Spike: 2026-08-28 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`, `soapRfc`
- Ganchos: `body`
- Origem: spike 2026-08-28 (fila item 8): discovery do s4h + GET de STRING_TABLE/BAPIRET2_T/FINST_PRED_VBAK1/ZEXAME_T_CUST · docs/pesquisa-tipos-adt-nao-cobertos.md § TTYP (nenhum cliente open source cria TTYP)
- Depende de:
  - `structure` — tipo de linha, quando é estrutura do dicionário
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - Accept/Content-Type é application/vnd.sap.adt.tabletype.v1+xml (SINGULAR) — o plural "tabletypes" dá 406 e parece objeto inexistente
  - não tem /source/main (404): a definição é o XML; PUT do body roda sempre, como nos outros XML-body
  - comprimentos zero-padded: 6 dígitos (length/decimals), 5 no initialRowCount
  - alterar acesso/chave de um table type ATIVO funciona pelo mesmo deploy (PUT sobre o existente): standard → sorted + keyComponents ativou sem mensagem — medido 2026-08-28

**Exemplo de uso.** Linha = estrutura YJBV_POC_TT_LINHA (id numc(10), texto char(80)) criada antes pelo módulo structure. Variante sorted com chave: def { rowType, accessType: "sorted", keyComponents: ["ID"] }.

```js
await deploy(conexao, 'tableType', {
  name: "YJBV_POC_TT",
  pkg: "$TMP",
  description: "POC table type",
  def: {
    rowType: "YJBV_POC_TT_LINHA",
    accessType: "standard"
  }
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'DD40L', { campos: ["TYPENAME","AS4LOCAL","ROWTYPE","ROWKIND","ACCESSMODE","KEYDEF","KEYKIND"], where: ["TYPENAME = 'YJBV_POC_TT'"] })` → 1 linha, AS4LOCAL = 'A', ROWTYPE = a estrutura (ROWKIND 'S') e ACCESSMODE do def: standard = 'T', sorted = 'S', hashed = 'H'. Linha de tipo predefinido: ROWTYPE/ROWKIND VAZIOS e DATATYPE com o código curto ('STRG' para STRING). *(medido)*

**Como testar no ABAP.**

1. **`readTable`** — o table type está ativo com a linha e o acesso pedidos? readTable em DD40L (ROWTYPE, ACCESSMODE, KEYDEF, KEYKIND) *(medido: 2026-08-28 · S4H 758)*
   Assert: `{"readTable":{"tabela":"DD40L","campos":["TYPENAME","AS4LOCAL","ROWTYPE","ROWKIND","ACCESSMODE","KEYDEF","KEYKIND"],"where":["TYPENAME = 'YJBV_POC_TT'"]},"espera":"1 linha, AS4LOCAL='A', ROWTYPE='YJBV_POC_TT_LINHA', ROWKIND='S', ACCESSMODE='T', KEYDEF='D', KEYKIND='N' (medido). Depois de alterar para sorted+keyComponents: ACCESSMODE='S', KEYDEF='K', KEYKIND='U', e DD42S traz KEYFDPOS='0001' KEYFIELD='ID'"}`

2. **`classrun`** — driver declara uma tabela interna do tipo (prova ativação em compile), faz APPEND e escreve lines() *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_tt DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_tt IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA lt TYPE yjbv_poc_tt.
       APPEND VALUE #( id = '0000000001' texto = 'um' ) TO lt.
       APPEND VALUE #( id = '0000000002' texto = 'dois' ) TO lt.
       out->write( |TT lines={ lines( lt ) } first={ lt[ 1 ]-texto }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"TT lines=2 first=um","espera":"driver ativa (o table type existe, está ativo e a linha é a estrutura) e escreve a contagem"}`

3. **`classrun`** — variante sorted com chave: READ TABLE … WITH TABLE KEY só compila se a chave declarada existe no tipo — é o assert de que keyComponents chegou *(medido: 2026-08-28 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_tt2 DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_tt2 IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA lt TYPE yjbv_poc_tt.
       INSERT VALUE #( id = '0000000002' texto = 'dois' ) INTO TABLE lt.
       INSERT VALUE #( id = '0000000001' texto = 'um' ) INTO TABLE lt.
       READ TABLE lt INTO DATA(ls) WITH TABLE KEY id = '0000000002'.
       out->write( |TT2 lines={ lines( lt ) } primeiro={ lt[ 1 ]-id } achado={ ls-texto } subrc={ sy-subrc }| ).
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"TT2 lines=2 primeiro=0000000001 achado=dois subrc=0","espera":"sorted ordena por ID no INSERT (primeiro=0000000001) e a chave única acha a linha — medido"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 406 | Accept "tabletypes" (plural) ou v2 — o media type real é application/vnd.sap.adt.tabletype.v1+xml | usar o ct do módulo; ler o discovery (coleção ddic/tabletypes, accept tabletype.v1+xml) |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| TTYP não é criável por ADT REST — só aparece sob o wrapper /vit/ nos clientes open source | o s4h 758 tem a coleção nativa /sap/bc/adt/ddic/tabletypes (+ /validation), category ttypda, e o GET devolve ttyp:tableType — os clientes open source é que nunca a implementaram | 2026-08-28 · S4H |

### `transformation` — transformação (XSLT / simple transformation) (XSLT/VT)

**O que faz.** Transformação (XSLT/VT, a STRANS): o programa XSLT ou a Simple Transformation que `CALL TRANSFORMATION` executa entre ABAP e XML — serialização, desserialização, mapeamento. Um objeto, dois subtipos, escolhidos no create.

**Como a lib trata.** Deduz o subtipo pelo fonte (`<?sap.transform simple?>` → SimpleTransformation; senão XSLTProgram) e o fixa no shell `trans:transformation` (`trans:transformationType`) → lock → PUT /source/main text/plain com o XML → unlock → activate. Idempotente: existente só recebe PUT + activate. A prova de uso é `CALL TRANSFORMATION <nome> SOURCE root = … RESULT XML …` num driver classrun.

- Forma: `custom`
- ADT: coleção `/sap/bc/adt/xslt/transformations` · Content-Type `application/vnd.sap.adt.transformations+xml` · /source/main: sim
- Nome: até 30 caracteres (O2XSLTDESC-XSLTDESC CHAR 30; limite não medido por 4xx)
- Entrada aceita: `xslt`, `transformation`, `transformacao`, `simple transformation`, `st`, `xslt program`, `xsl` (plural com "s" também vale)
- Spike: 2026-08-30 · S4H 758
- Releases medidos: 758
- Canais: `adt`, `classrun`
- Ganchos: `validar`, `createBody`, `deploy`
- Origem: spike 2026-08-30 (fila item 20): GET de ID (identity) no s4h 758 + create/PUT/activate/CALL TRANSFORMATION/delete de YJBV_POC_XSLT e YJBV_POC_ST · docs/receita-xslt-enho.md · docs/pesquisa-tipos-adt-nao-cobertos.md § XSLT (desmentida) · docs/ideias.md I19
- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):
  - o subtipo mora no CREATE (`trans:transformationType`): passe `transformationType` para forçar, senão a lib deduz do fonte — um fonte ST num objeto criado como XSLTProgram é erro de ativação, não de create
  - o fonte é o documento XML inteiro (PUT text/plain); ST precisa do prólogo `<?sap.transform simple?>`
  - readTable de O2XSLTDESC SEM `campos` estoura o RFC_READ_TABLE (DATA_BUFFER_EXCEEDED) — a prova por tabela é a TADIR

**Exemplo de uso.** Transformação do spike (S4H 758, 2026-08-30): `CALL TRANSFORMATION yjbv_poc_xslt SOURCE root = 'abc' RESULT XML lv` → `<POC>abc-JBV</POC>`. A ST irmã (`<?sap.transform simple?>` + `tt:root name="ROOT"` + `tt:value ref="ROOT"`) devolveu `<POC>abc</POC>` pelo mesmo caminho.

```js
await deploy(conexao, 'transformation', {
  name: "YJBV_POC_XSLT",
  pkg: "$TMP",
  description: "POC XSLTProgram",
  source: `<xsl:transform version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:strip-space elements="*"/>
  <xsl:template match="/">
    <POC><xsl:value-of select="//ROOT"/>-JBV</POC>
  </xsl:template>
</xsl:transform>`
});
```

**Prova de existência (outra LUW).** `readTable(cfg, 'TADIR', { campos: ["PGMID","OBJECT","OBJ_NAME","DEVCLASS"], where: ["OBJECT = 'XSLT'","AND OBJ_NAME = 'YJBV_POC_XSLT'"] })` → 1 linha (R3TR XSLT, DEVCLASS do pacote). Estado ativo: getObject → adtcore:version="active". Efeito: CALL TRANSFORMATION no driver. *(medido)*

**Como testar no ABAP.**

1. **`classrun`** — driver executa a transformação criada — o resultado XML é o assert; exceção de transformação vem capturada, sem dump *(medido: 2026-08-30 · S4H 758)*

   ```abap
   CLASS yjbv_poc_cl_xslt DEFINITION PUBLIC FINAL CREATE PUBLIC.
     PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
   ENDCLASS.
   CLASS yjbv_poc_cl_xslt IMPLEMENTATION.
     METHOD if_oo_adt_classrun~main.
       DATA: lv_in TYPE string VALUE 'abc', lv_x TYPE string.
       TRY. CALL TRANSFORMATION yjbv_poc_xslt SOURCE root = lv_in RESULT XML lv_x. out->write( |XSLT_OUT { lv_x }| ).
         CATCH cx_root INTO DATA(lx). out->write( |XSLT_EXC { lx->get_text( ) }| ). ENDTRY.
     ENDMETHOD.
   ENDCLASS.
   ```

   Assert: `{"console":"XSLT_OUT <?xml version=\"1.0\" encoding=\"utf-16\"?><POC>abc-JBV</POC>","espera":"o RESULT XML string vem com prólogo utf-16 (e BOM) e o elemento gerado pelo template (medido)"}`

2. **`readTable`** — a transformação existe no diretório de objetos, vista de outra LUW *(medido: 2026-08-30 · S4H 758)*
   Assert: `{"readTable":{"tabela":"TADIR","campos":["PGMID","OBJECT","OBJ_NAME","DEVCLASS"],"where":["OBJECT = 'XSLT'","AND OBJ_NAME = 'YJBV_POC_XSLT'"]},"espera":"1 linha R3TR XSLT em $TMP (medido); getObject → adtcore:version=\"active\" e trans:transformationType do create"}`

**Quando falhar.**

| Sintoma | Causa | Correção |
|---|---|---|
| `DATA_BUFFER_EXCEEDED` | readTable de O2XSLTDESC sem `campos` — a linha passa dos 512 bytes do RFC_READ_TABLE | pedir campos (XSLTDESC, …) ou provar pela TADIR (OBJECT = XSLT) |
| `transformationType` | valor fora de XSLTProgram \| SimpleTransformation no create | deixar a lib deduzir do fonte, ou passar um dos dois valores |

**Não é assim** (parecia certo; medido o contrário).

| Crença | Fato | Medido |
|---|---|---|
| XSLT não é criável por ADT REST — só leitura/PUT pelo sourceUri do nodestructure (pesquisa 2026-08-28) | POST em /sap/bc/adt/xslt/transformations com trans:transformation cria (200), nos dois subtipos; PUT do fonte, ativação genérica e CALL TRANSFORMATION funcionam; DELETE com lockHandle apaga (200, TADIR vazia) | 2026-08-30 · S4H |

## Erros transversais (valem para todo tipo)

| Sintoma | Causa | Correção |
|---|---|---|
| HTTP 404 | o recurso não existe | conferir path/nome; 404 ≠ 406 — não procure objeto que está lá |
| HTTP 406 | o recurso existe, o Accept está errado | usar o accept do módulo (ou application/*); ler 406 como 404 é o erro clássico |
| HTTP 415 | o recurso existe, o Content-Type está errado | usar o ct do módulo — media type vem do /sap/bc/adt/discovery, não de memória |
| HTTP 405 | o recurso existe, o método está errado | trocar o método (ex.: cobertura é POST; GET dá 405 e parece inacessível) |
| HTTP 428 | o recurso exige requisição condicional | mandar If-Match (etag) |
| HTTP 400 · `descri` | adtcore:description acima de 60 caracteres ("Descrição demasiado longa" / "description") | encurtar a descrição (vale para todo tipo) — medido 2026-08-28 S4H 758 |
| HTTP 403 · `EU510` | lock órfão — sessão stateful que morreu sem unlock, ou ENQUEUE preso de um create | esperar o timeout, SM12, ou liberar por classrun (classrun.liberarLocks: ENQUEUE_READ + ENQUE_DELETE locais) |
| HTTP 403 · `já está processando` | ENQUEUE preso no nome: create do mesmo nome logo após um delete (ou create/PUT que morreu antes do unlock) | classrun.liberarLocks(conexao, "<prefixo>") — medido 2026-08-28 S4H 758: delete → create do mesmo nome dá 403 em CDS, MSAG, SRVD, PROG/INC; 9 ENQUEUEs (TRDIR, T100, RSDEO, WBS_ENQUEUE_STRU) liberados com subrc=0 |
| HTTP 403 · `currently editing` | o objeto está travado por outra sessão | unlock no finally do fluxo anterior; para MSAG, create em sessão stateless |
| HTTP 500 · `já está bloqueado na ordem` | lock CTS: o objeto está em tarefa de TR aberta (status D) e não aceita outra TR | usar como corrNr a TR onde o objeto já está, ou liberar a TR antiga (decisão humana) |
| `activationExecuted="false"` | ativação no-op: a URI referenciada não é a que tem a versão inativa (pai em vez de include/FM) | ativar a URI de quem recebeu o PUT (include, FM), ou o par na mesma requisição |
| HTTP 400 · `Service nicht erreichbar` | a SESSÃO nasceu morta — não o nó. Passado o teto de sessões HTTP do MESMO usuário (~150 medidas no s4h 758 em 04/09/2026: 144 passavam, 154 não), o logon responde 200 com token mas o cookie vem SEM SAP_SESSIONID, e aí QUALQUER requisição com esse cookie dá este 400 — inclusive /sap/public/ping | testar a MESMA URL só com Basic, sem cookie: se responder 200, é sessão e não SICF. Fechar depois NÃO cura (no estado doente o próprio logoff dá 400 e a sessão fica) — resta esperar http/security_session_timeout (1800s). Prevenir: logoff em toda sessão aberta; contar por SOAP RFC TH_USER_LIST com USRLIST: []. A lib não insiste mais (item 52): o logon marca a sessão e `call` RECUSA a requisição antes do fetch, lançando `SessaoNasceuMorta` (code SESSAO_NASCEU_MORTA; teste com ehSessaoMorta(e)) — o laço para na primeira. E o `connect` não CACHEIA mais esse estado (item 87): antes bastava vir token para gravar o `.sessao.json`, e o cookie inútil ia para o disco — cada comando seguinte é processo NOVO, lê o cache e dá 400 sem passar pelo diagnóstico do connect; agora `conectar` lança o mesmo erro ANTES de gravar |
| HTTP 400 | a exceção do 400 pode apontar para o lugar errado (ex.: ExceptionResourceAlreadyExists = erro de sintaxe no fonte) | ler o corpo inteiro da resposta, não o tipo da exceção |

## Não é assim — transversais

Crenças que parecem certas para qualquer tipo e foram desmentidas por medição. Folclore se regenera sozinho; por isso cada uma leva a data.

| Crença | Fato | Medido |
|---|---|---|
| `activate` exige sessão NOVA, senão "currently editing" | a mesma sessão cacheada (só cookie, sem senha) ativa: HTTP 200, activationExecuted="true", version active. O que morde é o LOCK — o unlock no finally já resolve. Exceção conhecida: o create de MSAG. | 2026-08-05 · DEV |
| `adtcore:masterLanguage` no XML define o idioma master do objeto | o atributo é ignorado; quem decide é o `sap-language` da requisição do token. Sem informar, cai no default do sistema (normalmente EN) e o objeto nasce master EN com texto em português — e não muda por PUT (conserto manual, SE03). Já contaminou 29 objetos de uma vez. | s/ data · DEV |

## Como adicionar um tipo

1. **Spike primeiro.** Prove o create/activate no `$TMP` de um sistema real (coleção e media type vêm do
   `/sap/bc/adt/discovery` daquele sistema, não de memória). Sem spike, não entra.
2. Crie `tipos/<libKey>.mjs` exportando (default) um objeto com **todos** os campos obrigatórios abaixo —
   anote `/** @type {import('./_esquema.mjs').ModuloDeTipo} */` para o editor completar e checar.
   O `libKey` é o nome do arquivo. Não importe `adt-client.mjs` de dentro do módulo.
3. Crie o teste irmão `tipos/<libKey>.test.mjs`: `testesComuns(mod)` de `_teste.mjs` + o snapshot do XML
   que o spike provou. Sem teste irmão, `npm test` falha.
4. Não há índice a editar: a pasta é lida no carregamento. Um módulo inválido derruba o import da lib
   com a mensagem dizendo o arquivo e o campo — rode `npm test`.
5. `npm run catalogo` para regravar este arquivo, e commite os três.

| Campo | Obrigatório | Tipo | O que é |
|---|---|---|---|
| `libKey` | sim | string | Identidade do módulo; igual ao nome do arquivo (sem .mjs); chave de TYPES. |
| `codigo` | sim | string | Código TADIR de 4 letras maiúsculas (TABL, CLAS…) — o mesmo da SE09 e da pasta no checkout. |
| `adtType` | sim | string | Tipo ADT com subtipo (TABL/DT). Único entre os módulos; é o que o RIS devolve e o shell de create declara. |
| `descricao` | sim | string | Nome curto, minúsculo ("tabela"). |
| `sinonimos` | sim | array | Entradas de usuário que resolvem SÓ para este módulo ("tabela", "tab"). O libKey normalizado entra sozinho. Plural com "s" é automático. |
| `sinonimosDoCodigo` | não | array | Entradas que resolvem para TODOS os módulos do mesmo código TADIR ("programa" → prog + include). O código normalizado entra sozinho. |
| `coll` | sim | string | Coleção ADT (/sap/bc/adt/…), como aparece no /sap/bc/adt/discovery. Para tipo aninhado, a coleção do contêiner. |
| `ct` | sim | string | Content-Type do create. |
| `accept` | não | string | Accept do GET, só quando difere do ct (INTF exige v5/application/*; MSAG só application/*). |
| `source` | sim | boolean | Tem /source/main (o checkout baixa fonte). Semântica do TYPES antigo, mantida para o CLI. |
| `forma` | sim | string | Como a lib despacha o deploy: source \| xml \| custom \| json. |
| `ativacaoJson` | não | string | Só para forma 'json': 'nenhuma' (nasce ativo, o PUT já persiste — APLO) \| 'mesmaSessao' (activate normal — NROB) \| 'sessaoNova' (activate na sessão que fez o PUT falha — SAJC). Medido por tipo (I56): NÃO é decorável a partir da família. |
| `container` | não | object | { libKey, param } — tipo aninhado dentro de outro (FM dentro do FUGR). Exige o gancho `path`; sai de todasAsLibKeys(). |
| `zyPeloContainer` | não | boolean | O nome do objeto é IMPOSTO pelo SAP a partir do contêiner (include de FUGR: L<GRUPO><SUFIXO>) e não começa com Z/Y. Com isto, o guard-rail transversal Z/Y roda sobre o CONTÊINER (opts[container.param]), não sobre o name — o dono do namespace é ele. Exige `container`. |
| `nomeacao` | não | object | { max, fonte, prefixo? } — tamanho máximo do nome (com namespace). `deploy` recusa antes da rede. `fonte` diz se foi medido ou vem de documentação. `prefixo` é uma letra que o SAP IMPÕE ao nome (lock object: E) — o guard-rail Z/Y roda sobre o que vem DEPOIS dele (EY…/EZ… é nosso). |
| `oQueFaz` | sim | string | 1-3 frases: o que o objeto é no SAP e para que a lib o usa. |
| `comoTrata` | sim | string | 1-3 frases: o fluxo em palavras, com os desvios que custaram spike. |
| `spike` | sim | object | { data: "YYYY-MM-DD"\|null, sistema, release?, revalidacoes?: [{data, sistema, release?}] } — quando e onde o CREATE/ACTIVATE foi provado. Não inventar: data null = validado sem data registrada. |
| `releases` | sim | object | { medidos: ["758","816"], minimo?: "750" } — releases SAP onde foi medido (têm de constar em spike/revalidacoes); minimo só quando documentado. |
| `guardRails` | sim | array | O que este tipo exige ALÉM dos transversais (só Z/Y, unlock em finally, activate depois do unlock). Pode ser []. |
| `canais` | sim | array | Canais do arsenal que agem sobre o objeto: adt \| classrun \| soapRfc \| odata \| wdi5 \| aunit. Liga o tipo à matriz da skill sap-testes. |
| `origem` | sim | array | De onde a receita veio: docs/receita-*.md, seção da skill, commit. Para quem for conferir a fonte. |
| `dependencias` | sim | array | [{ tipo, papel, ativarJunto }] — o que precisa existir (ou ativar na MESMA requisição) para este objeto ativar. Pode ser []. |
| `exemplo` | sim | object | { opts, nota? } — as opções REAIS de um `deploy(conexao, libKey, opts)` (nome $TMP do spike). O teste do tipo roda a parte pura (validar, createBody/body/path) sobre ele; o catálogo o imprime. |
| `testes` | sim | array | [{ canal, descricao, abap?, assert, medido: [{data, sistema, release?}] }] — como PROVAR no lado ABAP que o objeto funciona: canal (aunit \| classrun \| soapRfc \| odata \| wdi5 \| readTable), o driver/teste em ABAP quando houver, e o assert (readTable em outra LUW, saída do console, HTTP). medido vazio = escrito, ainda não provado. |
| `erros` | sim | array | [{ status?, contem?, causa, correcao }] — falhas conhecidas DESTE tipo e o conserto. A lib anexa a dica ao erro na hora da falha; os transversais (406/415/EU510…) ficam em ERROS_TRANSVERSAIS. |
| `desmentidos` | sim | array | [{ crenca, fato, medido: {data, sistema} }] — o que PARECE certo sobre este tipo e foi desmentido por medição. Sem medição não entra (seria folclore ao contrário). Os que valem para todo tipo ficam em DESMENTIDOS_TRANSVERSAIS. Regra: cada fato mora num campo só — guardRails diz o que fazer, erros diz como ler a falha, desmentidos diz o que não acreditar. |
| `prova` | sim | function | (name, extra?) → { tabela, campos, where, espera, medido } — como verificar por readTable (outra LUW) que o objeto existe/está ativo. Alimenta o script de re-validação e a skill sap-testes. |
| `validar` | não | function | (opts) → lança se as opções do deploy não servem. Roda depois de assertZY(name) e ANTES de qualquer rede. |
| `createBody` | não | function | (name, pkg, description, extra?) → XML do shell de create. Obrigatório na forma source. |
| `body` | não | function | (name, pkg, description, def) → XML completo do objeto (a definição É o body) na forma xml, ou o fonte JSON (AFF) na forma json. Obrigatório nas duas. |
| `path` | não | function | (name, extra) → path ADT do objeto quando não é coll/<name> (tipo aninhado). Obrigatório com `container`. |
| `deploy` | não | function | (ctx, conexao, opts) → resultado. Obrigatório na forma custom. Só usa primitivas do ctx — nunca importa adt-client.mjs. |
| `antesDeApagar` | não | function | (ctx, conexao, { name, …extra }) → o que tem de acontecer antes do DELETE (SRVB: unpublish). `deleteObject` chama. |

