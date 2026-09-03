# Pesquisa: APIs SAP para fechar as lacunas da TADIR — candidatas a receita (cookbook)

**Data:** 2026-08-30 · **Método:** leitura de fontes primárias (help.sap.com e seu espelho oficial `SAP-docs` no
GitHub, `SAP/abap-file-formats`, KBA SAP, código-fonte do abapGit e dos clientes ADT open source) mais espelhos
públicos de metadados do repositório ABAP (sapdatasheet.org, se80.co.uk — assinaturas de FM/classe e a flag
"Remote-Enabled"). **Estado:** pesquisa **carimbada** — em **2026-08-31 (fila 38)** cada peça citada (FM, classe,
coleção ADT, serviço OData, componente) foi conferida contra o **s4h 758, mandante 250, SÓ LEITURA**, e o veredito
está em **§ Carimbo no s4h 758** e numa linha `**Carimbo…**` por seção. O que a lib já provou por spike vem marcado
**[medido]** e aponta para `cobertura-tadir.md` / `pesquisa-tipos-adt-nao-cobertos.md`.
O passo seguinte de cada seção está em "o que medir".

> **Leia o carimbo antes da seção.** "Existe" ≠ "chamável do jeito que a fonte diz": o espelho erra a flag
> Remote-Enabled **nos dois sentidos**, e três seções mudaram de canal por causa disso.

Escopo: as lacunas **medidas** em `cobertura-tadir.md` (recorte custom Z/Y do s4h 758, 2026-08-29), na ordem de
volume × viabilidade sem GUI. O que `ideias.md`/`fila.md` já decidiram não se repete: TRAN (item 18), TOBJ/SM30
(item 17), família SEGW V2 por efeito (item 16), AUTH/SUSO/ENQU/TTYP/DEVC/DCLS (itens 8–13), VIEW clássica "só
SE11" por ADT e SHLP "sem coleção" (item 12) — aqui o que entra é **a segunda via** desses dois (FM/classe por
classrun ou SOAP RFC), não a via ADT já desmentida.

## Como ler as etiquetas de fonte

| Etiqueta | O que é | Peso |
|---|---|---|
| **[SAP-help]** | help.sap.com, ou o espelho oficial `github.com/SAP-docs` (mesmo texto, legível sem JavaScript) | primária |
| **[SAP-gh]** | repositórios oficiais SAP no GitHub (`SAP/abap-file-formats`) | primária |
| **[KBA]** | SAP Knowledge Base Article / Note (só o resumo público) | primária |
| **[abapGit]** | código-fonte `abapGit/abapGit` (`src/objects/zcl_abapgit_object_<tipo>.clas.abap`) — é a melhor evidência pública de *como se cria X sem GUI*, mas não é SAP | primária para "a API existe e é assim chamada"; a lib ainda mede |
| **[espelho]** | sapdatasheet.org / se80.co.uk — metadados de FM/classe (parâmetros, grupo, "Remote-Enabled") extraídos de um sistema SAP de release antigo | terceiro; assinatura e flag RFC **a confirmar na TFDIR (`FMODE='R'`) do 758** |
| **[comunidade]** | SAP Community / snippet de busca | secundária — só orienta |
| **[medido]** | já provado pela lib no s4h 758 | fato |

Convenção do texto: **encontrado** = há fonte primária para "existe e é chamado assim"; **inferido** = deduzido
(ex.: "se o FM não é RFC, o canal é classrun"); **a medir** = a hipótese que o spike prova ou desmente.

## Carimbo no s4h 758 (2026-08-31, fila 38)

**Método.** `readTable` (SOAP RFC) em `TFDIR`, `SEOCLASS`, `CVERS`, `TNRO`, `TADIR`, `USOBHASH`, `TRDIR` + `GET`
com Basic Auth no discovery ADT, nas coleções e nos serviços OData citados. **Zero escrita, zero sessão stateful**
(nenhuma sonda abriu logon: SOAP RFC e `fetch` com Basic não deixam sessão órfã). Sistema: S4H 758, mandante 250.

**Existência (49 FMs, 41 classes/interfaces).** Existem **47/49** FMs e **39/41** classes. As ausências:

| Peça | Seção | Veredito |
|---|---|---|
| `/UI5/UI5_REPOSITORY_LOAD`, `/UI5/UI5_REPOSITORY_LOAD_HTTPN` | 4 | **não são FM** — são REPORT (`TRDIR SUBC='1'`), como a própria doc SAP diz. Não desmentem nada; só não servem de canal (`SUBMIT` no classrun dumpa, item 7). |
| `CL_SUI_UIAD_DB_ACCESS`, `IF_SUI_UIAD_DB_ACCESS` | 15 | **não existem no 758** — a via específica de UIAD do abapGit não roda aqui. UIAD fica sem caminho (o handler AFF genérico existe, mas o acesso de UIAD não). |

**O `FMODE` do espelho erra nos DOIS sentidos** — este é o achado que muda canal de seção. `TFDIR-FMODE = 'R'` é
o único preditor confiável de "chamável por SOAP RFC":

| FM | Espelho dizia | TFDIR do 758 | Efeito |
|---|---|---|---|
| `RPY_VIEW_INSERT` | não RFC | **`R`** | seção 7 fica MAIS barata: criar view clássica por SOAP RFC puro, sem driver |
| `STREE_HIERARCHY_SAVE` | não RFC | **`R`** | SHI3 sem driver |
| `DDIF_SHLP_PUT` / `_GET`, `F4IF_GET_SHLP_DESCR` | Remote-Enabled | **vazio** | seção 6 inteira vira classrun — inclusive o assert |
| `SSF_ACTIVATE_STYLE`, `SSF_READ_FORM` | Remote-Enabled | **vazio** | SSST não tem "perna RFC" |
| `NUMBER_RANGE_OBJECT_READ`/`_INIT`, `NUMBER_RANGE_ENQUEUE`, `NUMBER_RANGE_INTERVAL_UPDATE` | Remote-Enabled | **vazio** | some a via "intervalo por SOAP RFC" da seção 10 |
| `RS_CORR_INSERT`, `RS_TREE_OBJECT_PLACEMENT` | Remote-Enabled | **vazio** | TADIR/transporte só por driver (é o que `tran.mjs`/`enho.mjs` já fazem) |
| `SXO_IMPL_ACTIVE`, `STREE_EXTERNAL_DELETE`, `S_CUS_ACTIVITY_SAVE` | Remote-Enabled | **vazio** | some o "ativar por RFC barato" da 13/14 |
| `HTTP_ACTIVATE_NODE`, `RPY_VIEW_READ`, `/UI5/UI5_REPOSITORY_LOAD_HTTP`, `/UI5/REPO_LOAD_FROM_ZIP_URL`, `STREE_HIERARCHY_READ`, `STREE_STRUCTURE_READ` | Remote-Enabled | **`R`** | confirmados |

**Contra-prova do `FMODE`** (a medição não é só a coluna): `RPY_VIEW_READ` (`R`) chamado por SOAP RFC **respondeu**
(721 bytes); `NUMBER_RANGE_OBJECT_READ` e `F4IF_GET_SHLP_DESCR` (`FMODE` vazio) devolveram **SOAP Fault "Internal
Server Error"**. O `FMODE` prediz; o espelho não.

**Componentes (`CVERS`).** `SAP_BASIS 758`, **`SAP_UI 758`** (o pré-requisito "≥ 753" da seção 4 está atendido),
`SAP_GWFND 758`, `SAP_ABA 75I`, `S4CORE 108`.

**Discovery ADT (648 coleções) — o que a seção B mandava sondar por nome:**

| Procurado | No 758 |
|---|---|
| `nrob`/`numberrange*` | ✅ **`/sap/bc/adt/numberranges/objects`** (+ `$schema`, `$configuration`, `validation`, `source/formatter`) |
| `sprv` | ✅ **`/sap/bc/adt/businessservices/servprovs`** ("SOAP Provider Model", `blues.v2+xml`, com `$new/schema|configuration|content`) |
| `ddic/typegroups` | ✅ existe (`typegroups.v2+xml` e `v3+xml`) |
| `http`/`aps/http*` | ⚠ só `/sap/bc/adt/ucon/httpservices` (UCON) — **nó SICF clássico não tem coleção** |
| `srvc`, `para`/`setget*`, `shlp`, `shi3`/`areamenu*`, `forms`/`sfp*`, `uiad`/`launchpad*`, `wapa` | ❌ não existem |

**Leitura por ADT REST provada nesta sonda (GET 200):**
- **SUSH** — `GET aps/iam/sush/<nome>` com `application/vnd.sap.adt.blues.v1+xml` → `sush:sush`. O nome é
  **posicional**: `OBJ_NAME` da TADIR = NOME em 30 posições + `TYPE` (`SD_RFC_CUSTOMER_GET           RF`), a mesma
  forma do `LIMU METH` do item 14 — usar o `OBJ_NAME` cru, sem "arrumar" os espaços.
- **NROB** — `GET numberranges/objects/<obj>` com `blues.v1+xml` → `blue:blueSource adtcore:type="NROB/NRO"`, e
  **`GET .../source/main` com `application/json` → 200 com o `nrob-v1.json` do AFF** (`formatVersion`, `header`,
  `interval{numberLengthDomain,percentWarning,subType,untilYear,rolling,prefix}`, `configuration{buffering,
  bufferedNumbers}`). O sistema serve o **próprio schema** em `$schema` e o layout do editor em `$configuration`.
  46 NROB custom na TNRO. O templateLink traz `{?corrNr,lockHandle,version,accessMode,_action}` — o ciclo de
  escrita da lib (lock → PUT → unlock) tem onde encaixar.
- **TYPE** — `GET ddic/typegroups/<nome>` com `typegroups.v3+xml` → `atypgr:abapTypeGroup` com `sourceUri="source/main"`.

**A família AFF/JSON do ADT existe no 758: 27 coleções declaram `$schema`** — `numberranges/objects`,
`businessservices/servprovs`, `applicationjob/{catalogs,templates}`, `applicationlog/objects`, `archivingobjects`,
`businessobjects/{nontnot,rontrot}`, `businessservices/{eeecevc,evtbevb}`, `changedocuments/objects`,
`customfields/objects`, `databrowser/objects`, `ddic/{db/indexes,dsfi,extensionindexes}`, `destructionobjects`,
`metricproviders`, `predefinedfields`, `sfw/featuretoggles`, `sit/sitotyp`, `transportobject/objects`,
`wbobj/apictyp`, `wmpc/applications`, `abapdaemons/applications`, `bct/{scp1bcs,smbctyp}`. Cada uma serve o schema
do `SAP/abap-file-formats` pelo próprio sistema — **é a via transversal da seção A, só que pelo ADT REST em vez do
driver `CL_AFF_OBJECT_HANDLER_FACTORY`** (que também existe, com `CL_AFF_FILE`/`CL_AFF_FILES_CONTAINER`/`CL_AFF_OBJ`).
E **essa via já está provada em um dos 27**: a fila 29 criou `APLO/TYP` por ela (`applicationlog/objects` —
create em `blues.v1+xml` PLURAL, PUT do fonte em `application/json`, nasce ativo, `tipos/applicationLogObject.mjs`).
O que o item 38 acrescenta é o **tamanho da família** e o segundo candidato com leitura provada (NROB).

**OData citados.** `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/` → **200** (e `$metadata` 200): o serviço da seção 4
está ativo. `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection/$count` → **200 com 4.885** serviços: a via
pública e só-leitura da seção C funciona e é mais barata que `readTable /IWFND/I_MED_SRH`.

**Gotchas da própria sonda** (custaram tentativa): (1) nome com namespace quebra a URI —
`numberranges/objects//ACCGO/ACC` dá 404 "No suitable resource found"; escolher objeto sem `/` ou encodar; (2) o
**406 do NROB NÃO nomeia o media type** (ao contrário do 415 do FM include, item 11) — o accept sai do
`<app:accept>` da `<app:collection>` no discovery, nunca de palpite (cinco palpites, cinco 406); (3) `USOBHASH`
começa por nomes com namespace e o filtro ingênuo (`NAME LIKE 'SE38%'`) volta vazio — o nome de SUSH vem da TADIR.

## Resumo — prioridade (volume medido × viabilidade sem GUI)

**Reordenada por FATO em 2026-08-31** (fila 38): a ordem agora é *o que o 758 tem*, não *o que a fonte promete*.
Volumes: recorte custom do s4h 758 (`cobertura-tadir.md`). A ordem antiga (por volume × plausibilidade) está
preservada na coluna `#` — o número é identidade da seção e não muda.

| Ordem | # seção | TADIR (custom) | Carimbo no 758 (2026-08-31) | Canal que sobrou | Próximo passo |
|---|---|---|---|---|---|
| 1º | **10 NROB** | 49 | ✅ coleção ADT `numberranges/objects` + `$schema`/`$configuration`; GET 200 em `blues.v1+xml` e **`source/main` em JSON (AFF `nrob-v1`)**; templateLink com `corrNr`/`lockHandle` | **ADT REST** (não driver: a via da tabela antiga estava errada) — é o mesmo fluxo "blue" que a lib já roda no `APLO/TYP` (fila 29) | spike de create/alter pelo molde do `applicationLogObject`; intervalo (`NRIV`) segue driver — nenhum `NUMBER_RANGE_*` é RFC |
| 2º | **3 SUSH** | 569 | ✅ `aps/iam/sush` com 14 sub-recursos; **GET 200** (`sush:sush`, nome POSICIONAL 30+TYPE); `CL_SU22_ADT_OBJECT`/`IF_…` existem | ADT REST (leitura provada); driver de reserva | PUT com um objeto de autorização a mais; `USOBT_C` como assert |
| 3º | **7 VIEW** | 179 | ✅ **`RPY_VIEW_INSERT` é `FMODE='R'`** (o espelho dizia que não) e `RPY_VIEW_READ` também; `DDIF_VIEW_*` existem, nenhum é RFC | **SOAP RFC puro** — sem driver | `RPY_VIEW_READ` de `V_T001` para o formato → `RPY_VIEW_INSERT` de view Z no `$TMP` |
| 4º | **4 WAPA/UI5** | 273 | ✅ `SAP_UI 758` (≥753) e `/UI5/ABAP_REPOSITORY_SRV/` **200** (`$metadata` 200); `/UI5/REPO_LOAD_FROM_ZIP_URL` e `_LOAD_HTTP` são RFC; `/UI5/CL_UI5_REP_DT` existe | OData V2 (canal já na lib) | POST de zip mínimo com `TestMode=TRUE`; depois real; KBA 3602806 (nó SICF) cruza com a seção 1 |
| 5º | **1 SICF** | 1.269 | ⚠ **sem coleção ADT** para o nó clássico (só `ucon/httpservices`); `CL_ICF_TREE`/`IF_ICF_TREE` e `/IWFND/CL_MGW_ACTIVATION_API` existem; **`HTTP_ACTIVATE_NODE` é RFC** | classrun (insert) + SOAP RFC (activate) | driver `INSERT_NODE` em `/sap/bc/yjbv_poc`; `ICFSERVICE`; GET HTTP como efeito |
| 6º | **6 SHLP** | 187 | ⚠ sem coleção ADT; as 6 FMs existem mas **nenhuma é RFC** (`DDIF_SHLP_PUT`/`_GET`/`F4IF_GET_SHLP_DESCR` desmentidos) | **classrun só** — some a perna SOAP | driver: `DDIF_SHLP_GET(H_T001)` para o formato → PUT + `DDIF_SHLP_ACTIVATE` → `DD30L` |
| 7º | **5 WEBI/SPRV** | 457 | ✅ `CL_WS_MD_FACTORY`/`CL_WS_MD_VIF_ROOT` existem; **coleção ADT `businessservices/servprovs` EXISTE** (`blues.v2+xml`, `$new/schema`) — 0 objetos SPRV no sistema; `CL_SRT_WSP_CONFIG_RT` existe (métodos privados) | classrun (WEBI) · ADT (SPRV, a medir) | `GET servprovs/$new/schema`; driver `GENERATE_WEB_SERVICE` sobre FM RFC Z; SOAMANAGER segue sem API |
| 8º | **8 ENHO** | 113+6+1 | ✅ `CL_ENH_FACTORY` e os 4 tools existem — **já resolvido no item 20** (`enho.mjs`: API cria, ADT altera/apaga; POST ADT desmentido) | classrun (create) + ADT (alter/delete) | só hook/class enhancement, se cliente pedir |
| 9º | **9 Forms** | 67+46+38+37 | ✅ as 4 classes existem — **resolvido nos itens 19/41/42** (`forms.mjs`: Smart Form cópia+poda+render; Adobe cópia; render Adobe depende do ADS) | classrun | SSST (estilo) segue sem receita; `SSF_ACTIVATE_STYLE` **não** é RFC |
| 10º | **2 IWPR** | 1.346 | ✅ todas as 8 classes `/IWBEP/*` existem (incl. `CL_MGW_MED_REG_API`) | classrun | decisão mantida: **não criar IWPR**; anatomia (`OBJH`/`OBJSL`) + registro V2 sem SEGW |
| 11º | **12 XSLT** | 9 | ✅ **resolvido no item 20** — POST ADT em `xslt/transformations` cria (`tipos/transformation.mjs`) | ADT REST | — |
| 12º | **11 PARA** | 12 | ⚠ sem coleção ADT; **`RS_CORR_INSERT` NÃO é RFC** (desmentido) | classrun | driver de 3 linhas, se puxado por cliente |
| 13º | **13 CMOD/SXCI** | 15+15 | ⚠ as 6 FMs existem; **`SXO_IMPL_ACTIVE` não é RFC** (desmentido) | classrun | só sob demanda |
| 14º | **14 cauda** | 2/1/2/2 | ✅ **`ddic/typegroups` existe no ADT** (GET 200, `v3+xml`) e **`STREE_HIERARCHY_SAVE`/`_READ`/`STREE_STRUCTURE_READ` são RFC**; `STREE_EXTERNAL_DELETE` e `S_CUS_ACTIVITY_SAVE` **não** são | ADT (TYPE) · SOAP RFC (SHI3 save/read) | volume não justifica; assinaturas carimbadas |
| 15º | **15 UIAC/UIAD** | 2 | ❌ **`CL_SUI_UIAD_DB_ACCESS`/`IF_…` NÃO existem no 758** — a via do abapGit não roda aqui; UIAC nunca teve | nenhum | fechado por ora |
| — | **A AFF** | transversal | ✅ `CL_AFF_OBJECT_HANDLER_FACTORY`, `IF_AFF_OBJECT_HANDLER(_FACTORY)`, `CL_AFF_FILE`, `CL_AFF_FILES_CONTAINER`, `CL_AFF_OBJ`, `CL_BLUE_AFF_WB_ACCESS` existem — **e 27 coleções ADT já servem `$schema`**, uma delas (`applicationlog/objects`) já criada pela lib na fila 29 | ADT REST (preferível) ou driver | é o "prêmio": um caminho, N tipos — o 2º é o NROB (1º da tabela) |
| — | **C catálogo** | transversal | ✅ `CATALOGSERVICE;v=2` → **4.885 serviços**, GET público | OData V2 | trocar o `readTable /IWFND/I_MED_SRH` do item 16 por ele |
| — | **G SMIM** | transversal | ✅ `CL_MIME_REPOSITORY_API` existe | classrun | só como dependência de UI5/BSP |

<details>
<summary>Tabela original da pesquisa (2026-08-30) — a promessa das fontes, antes do carimbo</summary>

Volumes: recorte custom do s4h 758 (`cobertura-tadir.md`). "On-prem 758?" diz se a fonte primária prova que o
mecanismo existe **on-premise** (não só cloud); "?" = a fonte não diz o release.

| # | TADIR (custom) | API / serviço candidato | Canal da lib | On-prem 758? | Próxima medição |
|---|---|---|---|---|---|
| 1 | **SICF** 1.269 | `CL_ICF_TREE=>IF_ICF_TREE~INSERT_NODE` (+ `icfactive`) [abapGit]; `/IWFND/CL_MGW_ACTIVATION_API` `CREATE_ICF_NODE`/`ACTIVATE_ICF_NODE` [SAP-help]; FM `HTTP_ACTIVATE_NODE` (RFC) [espelho] | classrun; SOAP RFC para ativar | sim (classe do SHTTP, presente desde NW) — ativação por RFC a confirmar | driver `insert_node` em `/sap/bc/yjbv_poc` no `$TMP`, `readTable ICFSERVICE`, GET HTTP no nó como efeito |
| 2 | **IWPR** 1.346 | Domain Model API do SEGW: `/IWBEP/CL_SBDM=>GET_FACTORY/GET_MANAGER`, `IF_SBDM_FACTORY~CREATE_PROJECT`, `IF_SBDM_FILE_HANDLER~CREATE_IMPORT_REQUEST` (EDMX), `IF_SBDM_GEN_MANAGER~GENERATE` [espelho] [abapGit #75]; registro sem SEGW: `/IWBEP/CL_MGW_MED_REG_API` `CREATE_MODEL`/`CREATE_SERVICE` [espelho] | classrun | classes do SAP_GWFND (on-prem) — versão exata a medir | **não criar IWPR**; medir a anatomia (`OBJSL` de `IWPR`) e a via "MPC/DPC à mão + MED_REG_API + ACTIVATION_API" para legado V2 sem SEGW |
| 3 | **SUSH** 569 | ADT `aps/iam/sush` **[medido: existe no 758]**; classe `CL_SU22_ADT_OBJECT` / `IF_SU22_ADT_OBJECT` (`CREATE`, `UPDATE`, `CHECK`, `SELECT`, `DELETE`), chave `USOBKEY` (`NAME`,`TYPE`), tabela `USOBHASH` [abapGit] | ADT REST primeiro; classrun como reserva | sim (abapGit chama dinamicamente; a coleção ADT já está no 758) | GET `aps/iam/sush/<nome>` com `blues.v1+xml` num objeto padrão; POST no `$TMP`; se 405, driver com `IF_SU22_ADT_OBJECT` |
| 4 | **WAPA** 273 (+ app UI5) | OData V2 `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` (SAP_UI ≥ 753; entidade `Repository`; `ZipArchive` base64; `TestMode`/`TransportRequest`/`CodePage`/`SafeMode`) [SAP-help]; FM RFC `/UI5/UI5_REPOSITORY_LOAD_HTTP` [espelho] e `/UI5/REPO_LOAD_FROM_ZIP_URL` [SAP-help]; `/UI5/CL_UI5_REP_DT` (`IF_UI5_REP_DT~CREATE_REPOSITORY`, `PUT_FILE`) [espelho] | OData V2 (canal já existente) | sim — condição é o componente **SAP_UI ≥ 753** (medir `CVERS`) | `CVERS` SAP_UI; SICF do serviço ativo?; POST zip mínimo com `TestMode=true` e depois real; GET `/sap/bc/ui5_ui5/sap/<app>/` como efeito; **KBA 3602806**: o nó SICF do app não nasce por este serviço → combinar com a receita 1 |
| 5 | **WEBI** 457 | `CL_WS_MD_FACTORY=>GET_VIF_ROOT` → `CREATE_VIRTUAL_INTERFACE`, `CREATE_FUNCTION`, `CREATE_ENDPOINT_REFERENCE`, `IF_WS_MD_LOCKABLE_OBJECT~SAVE` [abapGit]; `CL_WS_MD_FACTORY=>GENERATE_WEB_SERVICE` [espelho] | classrun | sim (pacote SEWS) — configuração SOAMANAGER **sem API pública achada** | driver criando WEBI de um FM RFC já existente; `readTable VEPHEADER`; a *configuração* (endpoint) fica como anatomia de TR |
| 6 | **SHLP** 187 | `DDIF_SHLP_PUT` (`DD30V`, `DD31V`, `DD32P`, `DD33V`) + `DDIF_SHLP_ACTIVATE`; delete `RS_DD_DELETE_OBJ` objtype `'H'` [abapGit] [espelho] | SOAP RFC (PUT, se `FMODE='R'` se confirmar) + classrun (activate) | sim (grupo SDIF, base) | `TFDIR` das 3 FMs; PUT+activate de uma search help elementar sobre tabela Z no `$TMP`; `F4IF_GET_SHLP_DESCR` (RFC) como efeito |
| 7 | **VIEW** 179 | `DDIF_VIEW_PUT` (`DD25V`, `DD09L`, `DD26V`, `DD27P`, `DD28J`, `DD28V`) + `DDIF_VIEW_ACTIVATE` [abapGit] [espelho]; alternativa `RPY_VIEW_INSERT` (`RPY_VIHD`, `RPY_VIFD_U`, `RPY_VISC`, `RPY_VITB`; mesma família da `RPY_TRANSACTION_INSERT` já usada) [espelho]; leitura `RPY_VIEW_READ` (RFC) | classrun | sim (SDIF / SEUK) | driver PUT+activate de view de banco sobre 2 tabelas Z; `readTable DD25L`; SELECT na view pelo driver como efeito |
| 8 | **ENHO** 113 · ENHS 6 · ENHC 1 | `CL_ENH_FACTORY=>CREATE_ENHANCEMENT( enhname, enhtooltype = CL_ENH_TOOL_BADI_IMPL=>TOOLTYPE )` → `SET_SPOT_NAME`, `ADD_IMPLEMENTATION`, `IF_ENH_OBJECT~SAVE( run_dark )`, `~UNLOCK` [abapGit]; hook `CL_ENH_TOOL_HOOK_IMPL` (`SET_ORIGINAL_OBJECT`, `ADD_HOOK_IMPL`); classe `CL_ENH_TOOL_CLASS`; spot `CREATE_ENHANCEMENT_SPOT`; composto `CREATE_ENHANCEMENT_COMPOSITE` [abapGit] [espelho]; ADT `enhancements/enhoxhb` **[medido: existe no 758, só GET/PUT vistos]**; AFF `enho` (só BAdI) [SAP-gh] | ADT (POST a medir) → classrun | sim (SEEF_BASE) | POST em `enhancements/enhoxhb` com o XML de um GET; se não, driver BAdI-impl de um spot padrão; ativação e `readTable ENHHEADER` |
| 9 | **SSFO** 67 · SFPF 46 · SFPI 38 · SSST 37 | SSFO: `CL_SSF_FB_SMART_FORM` `ENQUEUE(mode='INSERT')` → `XML_UPLOAD(dom)` → `STORE(im_active)` → `DEQUEUE` [abapGit] [espelho]; SFPF: `CL_FP_HELPER=>CONVERT_XSTRING_TO_FORM` + `CL_FP_WB_FORM=>CREATE(i_name,i_form,i_ordernum,i_dark)` → `SAVE`/`FREE`; SFPI: `CL_FP_WB_INTERFACE=>CREATE`; SSST: `SSF_SAVE_STYLE` + `SSF_ACTIVATE_STYLE` (RFC) [abapGit] [espelho] | classrun (SSFO/SFPF/SFPI); SOAP RFC possível para SSST | sim (SMART / SAFPAPI) | complementa o item 19 da fila (render por `FP_JOB_OPEN`, RFC): criar cópia de um form padrão por XML/xstring no `$TMP` e renderizar |
| 10 | **NROB** 49 | `NUMBER_RANGE_OBJECT_UPDATE( indicator='I', TNRO, TNROT )` + `NUMBER_RANGE_OBJECT_CLOSE` (não RFC); intervalos `NUMBER_RANGE_ENQUEUE` (RFC) → `NUMBER_RANGE_INTERVAL_UPDATE` (RFC) → `NUMBER_RANGE_UPDATE_CLOSE` (não RFC) → `DEQUEUE`; leitura `NUMBER_RANGE_OBJECT_READ` (RFC) [abapGit] [espelho]; AFF `nrob` = mapa de campos da TNRO [SAP-gh]; editor ADT desde 3.24 [comunidade] | classrun (objeto) + SOAP RFC (intervalo) | FMs do SNR* (base); a **coleção ADT** para NROB no 758 é o que falta medir | discovery por `nrob`/`numberrange`; driver cria objeto + intervalo `01`; `NUMBER_GET_NEXT` (RFC) devolve o 1º número como efeito |
| 11 | **PARA** 12 | sem API: abapGit grava `TPARA`/`TPARAT` direto + `RS_CORR_INSERT( object_class='PARA' )` [abapGit]; AFF `para` só tem `header.description` (o objeto é id + texto) [SAP-gh] | classrun | sim (é tabela) | driver `MODIFY TPARA/TPARAT` + `RS_CORR_INSERT`; efeito: programa com `SET PARAMETER ID` compila |
| 12 | **XSLT** 9 (34.803 SAP) | `CL_O2_API_XSLTDESC=>CREATE_NEW_FROM_STRING( p_source, p_attr{xsltdesc, devclass} )` → `SAVE` → ativação (`RS_WORKING_OBJECTS_ACTIVATE`) [abapGit] [espelho]; ADT `xslt/transformations` **[medido: existe no 758]**; AFF `xslt` (`xsltProgram`/`simpleTransformation`, arquivos `.xslt.json` + `.xslt.xml`) [SAP-gh] | ADT (POST a medir) → classrun | sim (SXSLT_TOOL) | POST em `xslt/transformations`; senão driver; efeito: `CALL TRANSFORMATION` no driver |
| 13 | **CMOD** 15 · SXCI 15 | CMOD: `MODACT`/`MODTEXT`/`MODATTR` + `MOD_KUN_ACTIVATE` (não RFC) [abapGit] [espelho]; SXCI: `SXO_IMPL_SAVE` (não RFC), `SXO_IMPL_ACTIVE` (RFC), `SXO_IMPL_DELETE`, `SXO_BADI_READ` [abapGit] [espelho] | classrun | sim (SECE) — legado | só se a lista do cliente puxar: driver de implementação de BAdI clássica num BAdI padrão com filtro |
| 14 | **TYPE** 2 · SHI3 1 · CUS0 2 · CUS1 2 | TYPE: `RS_DD_TYGR_INSERT_SOURCES` (não RFC), leitura `TYPD_GET_OBJECT`; SHI3: `STREE_HIERARCHY_SAVE` (não RFC), delete `STREE_EXTERNAL_DELETE` (RFC); CUS0: `S_CUS_IMG_ACTIVITY_SAVE` (não RFC); CUS1: `S_CUS_ACTIVITY_SAVE` (RFC) [abapGit] [espelho] | classrun | sim (base) | volume não justifica agora; ficam registradas as assinaturas |
| 15 | **UIAC** 2 · UIAD — | UIAD: AFF `uiad` (v2) + `CL_SUI_UIAD_DB_ACCESS` e o handler AFF `CL_AFF_OBJECT_HANDLER_FACTORY` [abapGit] [SAP-gh]; UIAC: **nenhuma API achada** — abapGit desistiu de UIAC [abapGit #5958] | classrun via AFF (se existir no 758) | ? — classes `CL_AFF_*`/`CL_SUI_UIAD_*` não aparecem nos espelhos (release antigo): **existência no 758 a medir** | `readTable SEOCLASS` para `CL_AFF_OBJECT_HANDLER_FACTORY`, `CL_SUI_UIAD_DB_ACCESS`; se existirem, é a via transversal AFF (abaixo) |

Leitura rápida: **1, 3, 4 e 6/7** são receitas de um spike cada, com FM/classe conhecida e volume relevante. **2**
não deve virar create — vira anatomia + a via "registro sem SEGW". **5** cria a definição, mas a *configuração*
SOAMANAGER (que é o que dá o endpoint) não tem API pública encontrada. O resto é cauda.

</details>

---

## 1. SICF — nós ICF (1.269 custom; 434 Z em `/default_host/sap/opu/odata/sap/<serviço>`)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** `CL_ICF_TREE` ✅ e `IF_ICF_TREE` ✅ existem; `/IWFND/CL_MGW_ACTIVATION_API` ✅ e `/IWFND/CL_ICF_ACCESS` ✅ também. **`HTTP_ACTIVATE_NODE` é `FMODE='R'`** (grupo `SAPLHTTPTREE`) — a ativação por SOAP RFC direto está confirmada. **Não há coleção ADT para o nó SICF clássico**: a única coisa com "http" no discovery é `/sap/bc/adt/ucon/httpservices` (UCON, outra coisa). A hipótese "o objeto HTTP do AFF é cloud" fica de pé. Via: driver para `INSERT_NODE` + SOAP RFC para ativar.

**Encontrado.**
- `CL_ICF_TREE=>IF_ICF_TREE~INSERT_NODE( icf_name, icfparguid, icfdocu, doculang, icfhandlst, package, application,
  icfserdesc, icfactive ) IMPORTING icfnodguid` — é como o abapGit cria um nó, com `icfactive = abap_true` e **sem
  chamada separada de ativação**; o pai vem de `IF_ICF_TREE~SERVICE_FROM_URL( url, hostnumber = 0 )`; a lista de
  handlers é `STANDARD TABLE OF icfhandler`. Delete: `IF_ICF_TREE~DELETE_NODE( icfparguid, icf_name )`; leitura:
  `GET_INFO_FROM_SERV`. Fonte: https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_sicf.clas.abap
- Gotcha documentado no abapGit: `DELETE_NODE` não apaga a linha de `ICFAPPLCUST` (logon específico do serviço) —
  o abapGit apaga à mão (https://github.com/abapGit/abapGit/issues/1649); e "SAP standard does not support deleting
  root nodes via the API" (mesmo issue).
- Métodos da interface `IF_ICF_TREE` (todos estáticos): `INSERT_NODE`, `CHANGE_NODE`, `DELETE_NODE`,
  `CHECK_SERVICE_ACTIVE`, `GET_INFO_FROM_SERV`, `SERVICE_FROM_URL`, `INSERT_EXT_ALIAS`, `INSERT_VIRT_HOST`… [espelho]
  https://www.sapdatasheet.org/abap/intf/if_icf_tree.html · classe `CL_ICF_TREE` (pacote SHTTP; tem também
  `IS_SERVICE_ACTIVE`, `SET_INSTACT_GROUP_ACTIVE`) https://www.sapdatasheet.org/abap/clas/cl_icf_tree.html
- Ativação por RFC: FM `HTTP_ACTIVATE_NODE( NODEGUID, URL, HOSTNAME='DEFAULT_HOST', EXPAND='X' )`, marcado
  **Remote-Enabled** no espelho https://www.sapdatasheet.org/abap/func/http_activate_node.html — candidato a
  SOAP RFC direto (sem driver) para ligar/desligar um nó existente.
- Para nós de **serviço OData** (o caso dos 434 Z): `/IWFND/CL_MGW_ACTIVATION_API` tem `CREATE_ICF_NODE`,
  `ACTIVATE_ICF_NODE`, `CHECK_ICF_NODE` além de `ACTIVATE_SERVICE`/`IS_ACTIVE` [espelho]
  https://www.sapdatasheet.org/abap/clas//iwfnd/cl_mgw_activation_api.html; a documentação SAP da classe
  ("central service activation API", `GET_INSTANCE`, `ACTIVATE_SERVICE( IV_SERVICE_NAME, IV_SERVICE_VERSION,
  IV_PREFIX, IV_SYSTEM_ALIAS, IV_PACKAGE, IV_TRANSPORT, IV_SUPPRESS_DIALOG ) → EV_SRG_IDENTIFIER`, com a limitação
  "Create without ICF node" não suportada) está em
  https://help.sap.com/doc/saphelp_ssb/1.0/en-US/a8/f89752db226656e10000000a445394/content.htm [SAP-help — doc de
  produto antigo (SSB 1.0); o release do 758 é o que se mede]. Também `/IWFND/CL_ICF_ACCESS`
  (`CREATE_GW_SERVICE_ICF_NODE`, `DELETE_…`, `IS_SERVICE_ACTIVE_BY_NODEGUID`) [espelho]
  https://www.sapdatasheet.org/abap/clas//iwfnd/cl_icf_access.html
- Tabela: `ICFSERVICE` (`ICF_NAME` 15, `ICFPARGUID`, `ICFNODGUID`, `ICFACTIVE`…), pacote SHTTP [espelho]
  https://www.sapdatasheet.org/abap/tabl/icfservice.html
- ADT: `SAP/abap-file-formats` tem o tipo **`http`** ("HTTP Service", `generalInformation.handlerClass`, `url`)
  https://github.com/SAP/abap-file-formats/tree/main/file-formats/http — é o objeto HTTP do ABAP Cloud (handler
  `IF_HTTP_SERVICE_EXTENSION`), não o nó SICF clássico. Resposta na SAP Community (2021): "HTTP Service is currently
  only available for SAP Cloud Platform ABAP … not possible (yet) to create an HTTP service from ADT in on-premise";
  o workaround é criar o nó na SICF e o handler `IF_HTTP_EXTENSION` [comunidade]
  https://community.sap.com/t5/application-development-discussions/abap-developer-tools-adt-can-t-create-http-service-from-eclipse/td-p/12277370

**Inferido.** `CL_ICF_TREE` é do SAP_BASIS (SHTTP) — existe em qualquer 758. O `INSERT_NODE` não é RFC (é método):
canal **classrun**. `HTTP_ACTIVATE_NODE` por SOAP RFC seria a forma mais barata de ativar/desativar sem driver.

**O que medir (s4h, `$TMP`).** (1) discovery: existe coleção `http`/`aps/http` no 758? (provavelmente não — o
objeto HTTP é cloud); (2) driver classrun: `INSERT_NODE` em `/sap/bc/yjbv_poc` com handler classe Z
(`IF_HTTP_EXTENSION`), `readTable ICFSERVICE`/`ICFHANDLER`; (3) `HTTP_ACTIVATE_NODE` por SOAP RFC — `TFDIR.FMODE`;
(4) efeito: GET HTTP na URL do nó (200 com o handler; 403/404 inativo); (5) delete e conferir `ICFAPPLCUST`.
Objetivo secundário: a receita fecha o "nó SICF por serviço" que o item 16 deixou aberto — ou por
`/IWFND/CL_MGW_ACTIVATION_API=>CREATE_ICF_NODE`, ou por `INSERT_NODE` sob `/sap/opu/odata/sap/`.

## 2. IWPR — projeto SEGW (1.346 custom) e registro de serviço V2 fora do SEGW

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** as oito peças existem no 758: `/IWBEP/CL_SBDM` ✅, `IF_SBDM_FACTORY` ✅, `IF_SBDM_MANAGER` ✅, `IF_SBDM_PROJECT` ✅, `IF_SBDM_GEN_MANAGER` ✅, `IF_SBDM_FILE_HANDLER` ✅, `CL_SB_GEN_GENERATOR` ✅, `/IWBEP/CL_MGW_MED_REG_API` ✅. Ou seja: a via "registro V2 sem SEGW" tem todas as peças — o que a mantém fora da fila é a decisão (não criar IWPR), não a ausência de API.

**Encontrado.**
- abapGit trata IWPR pelo **serializador genérico de objeto lógico** (tabelas do piece list em `OBJSL`, cabeçalho
  `OBJH`): `zcl_abapgit_object_iwpr` só delega a `zcl_abapgit_objects_generic`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_iwpr.clas.abap ·
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_objects_generic.clas.abap
  (lê `OBJH`, `OBJSL WHERE tobject='TABU'`, apaga/insere nas tabelas do piece list, `RS_CORR_INSERT`). `OBJSL` tem
  `OBJECTNAME`, `TOBJ_NAME` (tabela), `TOBJKEY` (regra de chave), `PRIM_TABLE` [espelho]
  https://www.sapdatasheet.org/abap/tabl/objsl.html
- Histórico do issue #75 do abapGit (2015–2019): larshp apontou `/IWBEP/CL_SB_GEN_GENERATOR` e
  `/IWBEP/CL_SBDM_MANAGER`, pacote `/IWBEP/SB_DM_BASE`, `IF_SBDM_FILE_HANDLER~CREATE_IMPORT_REQUEST/EXPORT`;
  jfilak (2019): `/IWBEP/I_SBD_AT` guarda anexos binários (SADL XML, `GENERATED_METHODS_RDS`) "not readable when
  serialized"; IWMO/IWSV não iam junto — precisou de suporte próprio (PR #2444/#2771)
  https://api.github.com/repos/abapGit/abapGit/issues/75/comments. Importar IWPR entre sistemas deu
  `DBSQL_DUPLICATE_KEY_ERROR` em `/IWBEP/I_SBD_SE`/`_SET`/`_MAP` (nós têm `NODE_UUID`)
  https://github.com/abapGit/abapGit/issues/2652 · https://github.com/abapGit/abapGit-Plugins/issues/25
- API do modelo de domínio (SAP_GWFND) [espelho]: `/IWBEP/CL_SBDM` (`GET_FACTORY`, `GET_MANAGER`)
  https://www.sapdatasheet.org/abap/clas//iwbep/cl_sbdm.html; `/IWBEP/IF_SBDM_FACTORY` (`CREATE_PROJECT( name,
  description )`, `CREATE_MODEL( mpc, namespace, technical name, version )`, `CREATE_SERVICE( dpc, external name,
  technical name, version )`, `CREATE_GEN_ARTIFACT`, `CREATE_ATTACHMENT`)
  https://www.sapdatasheet.org/abap/intf//iwbep/if_sbdm_factory.html; `/IWBEP/IF_SBDM_MANAGER` (`FIND_PROJECTS`,
  `GET_PERSIST_HANDLER`, `GET_GENERATION_MANAGER`, `CREATE_DELETION_REQUEST`, `GET_AVAILABLE_TRANSPORTS`)
  https://www.sapdatasheet.org/abap/intf//iwbep/if_sbdm_manager.html; `/IWBEP/IF_SBDM_PROJECT` (23 métodos:
  `GET_MODEL`, `GET_SERVICE`, `SET_PACKAGE`, `INSERT_CHILD`, `IS_PERSISTENT`…)
  https://www.sapdatasheet.org/abap/intf//iwbep/if_sbdm_project.html; `/IWBEP/IF_SBDM_GEN_MANAGER~GENERATE(
  requestor, projects ) → status por projeto` (implementado por `/IWBEP/CL_SBDM_MANAGER`)
  https://www.sapdatasheet.org/abap/intf//iwbep/if_sbdm_gen_manager.html; `/IWBEP/IF_SBDM_FILE_HANDLER`
  (`CREATE_IMPORT_REQUEST( xml, target dm, overwrite )` — o "Import → Data Model from File" EDMX)
  https://www.sapdatasheet.org/abap/intf//iwbep/if_sbdm_file_handler.html; gerador
  `/IWBEP/CL_SB_GEN_GENERATOR` (`GENERATE_MPC`, `GENERATE_DPC`, `REGISTER_MODEL_AND_SERVICE`, `GET_TRANSPORTS`)
  https://www.sapdatasheet.org/abap/clas//iwbep/cl_sb_gen_generator.html. Tabelas: `/IWBEP/I_SBD_PR` (projeto:
  `PROJECT`, `NODE_UUID`, `PLUGIN`, `STRAT_NAME`, `PROJECT_TYPE`) e `/IWBEP/I_SBD_GA` (artefato gerado: `PGMID`,
  `TROBJ_TYPE`, `TROBJ_NAME`, `GEN_ART_TYPE`, `HASH`)
  https://www.sapdatasheet.org/abap/tabl//iwbep/i_sbd_pr.html · https://www.sapdatasheet.org/abap/tabl//iwbep/i_sbd_ga.html
- **Registro V2 sem SEGW**: `/IWBEP/CL_MGW_MED_REG_API` (estático) — `CREATE_MODEL`, `CREATE_SERVICE`,
  `ASSIGN_MODEL_TO_SERVICE`, `VOCAB_CREATE`/`VOCAN_ASSIGN`, `DELETE_*`, "with transport request integration"
  (pacote `/IWBEP/MGW_MED_PERSISTENCY`) [espelho] https://www.sapdatasheet.org/abap/clas//iwbep/cl_mgw_med_reg_api.html.
  Tabelas `/IWBEP/I_MGW_SRH` (serviço backend: `TECHNICAL_NAME`, `VERSION`, `CLASS_NAME` = DPC)
  https://www.sapdatasheet.org/abap/tabl//iwbep/i_mgw_srh.html e `/IWFND/I_MED_SRH` (hub: `SRV_IDENTIFIER`,
  `IS_ACTIVE`) https://www.sapdatasheet.org/abap/tabl//iwfnd/i_med_srh.html — a segunda a lib já lê [medido, item 16].
  A publicação no hub é a `/IWFND/CL_MGW_ACTIVATION_API=>ACTIVATE_SERVICE` da seção 1; o relatório da
  `/IWFND/MAINT_SERVICE` é `/IWFND/R_MGW_REGISTRATION` (pacote `/IWFND/MGW_REGISTRATION`) [espelho]
  https://www.sapdatasheet.org/abap/prog//iwfnd/r_mgw_registration.html
- Documentação SAP: SEGW é transação SAP GUI; a integração com Eclipse é só abrir o GUI de dentro do ADT [comunidade,
  blog SAP] https://community.sap.com/t5/technology-blog-posts-by-sap/using-segw-and-abap-in-eclipse/ba-p/13219106.
  Importar EDMX no SEGW: "Import → Data Model from File", só `.xml`/`.edmx` [SAP-help]
  https://help.sap.com/doc/saphelp_nw75/7.5.5/en-US/f7/dc22512c312314e10000000a44176d/content.htm

**Inferido.** Criar IWPR pela lib é reproduzir o SEGW: nós com `NODE_UUID`, anexos binários, estratégia de geração —
alto custo, e a lib já cobre 12.286/13.632 da família por efeito do SRVB V2 (item 16). O valor está em (a)
**anatomia** — `OBJSL WHERE objectname='IWPR'` dá a lista de tabelas para o `cts.anatomia`/diff (fila 22/23) — e
(b) a via **"MPC/DPC escritos pela lib + `MED_REG_API` + `ACTIVATION_API`"**, que produz IWMO/IWSV/IWSG/IWOM +
nó SICF para um V2 legado sem SEGW e sem RAP (só se um cliente exigir V2 fora do RAP).

**O que medir.** (1) `readTable OBJH/OBJSL` de `IWPR`, `IWSV`, `IWMO`, `IWSG` — piece list real do 758; (2) numa
classe classrun: `/IWBEP/CL_MGW_MED_REG_API=>CREATE_MODEL/CREATE_SERVICE` com um MPC/DPC mínimos herdando
`/IWBEP/CL_MGW_ABS_MODEL`/`_ABS_DATA` no `$TMP`, depois `/IWFND/CL_MGW_ACTIVATION_API=>ACTIVATE_SERVICE`; conferir
`$metadata` 200 e `IS_ACTIVE`; (3) `IF_SBDM_FILE_HANDLER~CREATE_IMPORT_REQUEST` com um EDMX pequeno **só se** (2)
não bastar — e aí medir se `GENERATE` cria classes e IWPR na TADIR.

## 3. SUSH — authorization default values / SU22 (569 custom; 5.683 por `SRCSYSTEM`)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** `CL_SU22_ADT_OBJECT` ✅, `IF_SU22_ADT_OBJECT` ✅ e `CL_SU22_APPL` ✅ existem — o "há releases em que o objeto não é suportado" do changelog do abapGit **não vale para o 758**. E a leitura por ADT está **provada**: `GET aps/iam/sush/<nome>` com `blues.v1+xml` → **200** com `sush:sush`. Gotcha do nome: é **posicional** (30 posições + `TYPE`, como o `LIMU METH` do item 14) — passe o `OBJ_NAME` da TADIR cru, com os espaços. A coleção tem 14 sub-recursos (`su22authobject/values`, `sush/synchronize`, `validation`…). Falta só medir o PUT/POST.

**Encontrado.**
- abapGit (`zcl_abapgit_object_sush`, implementado no PR #4324, jan/2021 —
  https://api.github.com/repos/abapGit/abapGit/issues/1582/comments): `CREATE OBJECT lo_su22 TYPE
  ('CL_SU22_ADT_OBJECT')`; se não existe, `IF_SU22_ADT_OBJECT~CREATE( iv_new_key = ls_usobhash )`; existe →
  `~CHECK( CHANGING cs_head )` e `~UPDATE( is_head, usobx, usobt )`; leitura `~SELECT( iv_key )`; apagar `~DELETE`;
  chave `ms_key TYPE usobkey` (`NAME`, `TYPE`); existência por `SELECT SINGLE * FROM usobhash WHERE name = … AND type
  = …`; tipos `IF_SU22_ADT_OBJECT=>TS_SU2X_HEAD`, `TT_SU2X_X`, `TT_SU2X_T`; `CL_SU22_APPL->GET_DATA( is_key )`;
  `corr_insert` exceto `TYPE = 'TR'`. Comentário do fonte: "This serializer is re-used by zcl_abapgit_object_tran
  for SU22 data because transaction don't generate a separate SUSH object"
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_sush.clas.abap
- Changelog do abapGit: "SUSH: fix error when using transportable package (#7716)" (v1.134.0, 2026-07-10); "Fix 'lead
  application does not exist' (#7495)" (v1.133.0); "Improve error message for SUSH objects not being supported
  (#6916)" (v1.129.0) https://raw.githubusercontent.com/abapGit/abapGit/main/changelog.txt — há releases em que o
  objeto **não é suportado** (a classe `CL_SU22_ADT_OBJECT` não existe): é o que a medição tem de checar primeiro.
- O próprio nome da classe (`…_ADT_OBJECT`) e a coleção `aps/iam/sush` **[medido: presente no discovery do s4h 758]**
  (`pesquisa-tipos-adt-nao-cobertos.md` § AUTH/SUSO) dizem que o editor ADT de default values existe no 758; o
  vscode_abap_remote_fs registra `SUSH` com creator `AbapXml` (mesmo grupo de `AUTH`, `SUSO/B`, `HTTP`, `SRVB/SVB`)
  https://raw.githubusercontent.com/marcellourbani/vscode_abap_remote_fs/master/modules/abapObject/src/registry.ts
- Tabelas: `USOBHASH` ("Authorization Trace for Services: Hash Values": `NAME`, `TYPE`, `PGMID`, `OBJECT`,
  `OBJ_NAME`, `SERVICE_TYPE`, `SERVICE`; pacote S_PROFGEN) https://www.sapdatasheet.org/abap/tabl/usobhash.html;
  `USOBT`/`USOBT_C` (`NAME`, `TYPE`, `OBJECT`, `FIELD`, `LOW`, `HIGH`)
  https://www.sapdatasheet.org/abap/tabl/usobt.html. SU22 roda `SU2X_MAINTAIN_DEFAULT` (pacote SUSR)
  https://www.sapdatasheet.org/abap/tran/su22.html. Doc SAP "Editing Authorization Defaults for Development Data
  (SU22)": https://help.sap.com/docs/ABAP_PLATFORM_NEW/ad77b44570314f6d8c3a8a807273084c/9c6a76e9725b4b12a11064bd0d083b00.html
  [SAP-help — página não legível sem JavaScript aqui; título/URL confirmados por busca]
- `CL_SU22_ADT_OBJECT`/`IF_SU22_ADT_OBJECT` **não existem nos espelhos** (404 em sapdatasheet) — consistente com
  classe de release recente. Nenhum cliente ADT open source faz POST em `aps/iam/sush` (abap-adt-api, sapcli).
- SUSH nasce sozinho ao publicar serviço (5.683 por `SRCSYSTEM=S4H`, 346 em `$TMP` [medido]) — a receita útil é
  **alterar** (acrescentar objeto/valores à default do serviço/transação), não criar do zero.

**Inferido.** Duas vias: ADT (`GET/POST/PUT aps/iam/sush/<nome>` com `blues.v1+xml`, mesmo padrão de AUTH/SUSO já
medido) e classrun com `IF_SU22_ADT_OBJECT`. `TYPE` da chave codifica o tipo de aplicação (transação, RFC, serviço
OData, ICF…) — o valor exato para cada um é o que o `SELECT` de um SUSH padrão mostra.

**O que medir.** (1) GET `aps/iam/sush/<SUSH de um serviço Z gerado pelo item 16>` — accept `blues.v1+xml`;
`?_action=…`? (typestructure, fila 26); (2) PUT com um objeto de autorização a mais; `readTable USOBT_C/USOBX_C`
como prova em outra LUW; (3) POST para um serviço sem SUSH; (4) se ADT recusar, driver `IF_SU22_ADT_OBJECT~UPDATE`.

## 4. WAPA / repositório UI5 (273 WAPA custom; app UI5 = BSP)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** **pré-requisito atendido**: `CVERS` diz `SAP_UI 758` (a doc pede ≥ 753). `GET /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/` → **200**, `$metadata` → **200** (3.816 bytes): o serviço está ativo, sem precisar mexer na SICF. `/UI5/REPO_LOAD_FROM_ZIP_URL` ✅ e `/UI5/UI5_REPOSITORY_LOAD_HTTP` ✅ são **RFC** (`FMODE='R'`); `/UI5/UI5_REPOSITORY_LOAD` e `_HTTPN` **não são FM** — são REPORT (`TRDIR SUBC='1'`), como a doc dizia. `/UI5/CL_UI5_REP_DT` ✅, `/UI5/IF_UI5_REP_DT` ✅, `/UI5/CL_UI5_UPLOAD_TO_MIME` ✅, `CL_O2_API_APPLICATION` ✅, `CL_O2_API_PAGES` ✅. Nenhuma coleção ADT com "wapa"/"bsp" além de `filestore/ui5-bsp/*` (leitura).

**Encontrado [SAP-help].** "Using an OData Service to Load Data to the SAPUI5 ABAP Repository":
`/UI5/ABAP_REPOSITORY_SRV` "is available as of SAP_UI 753"; caminho padrão `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV`;
entidade `Repository` com GET/CREATE/UPDATE/DELETE; sobe "a zip file … into a BSP application that is created or
updated during the upload"; propriedade `ZipArchive` = "base64-encoded zip archive"; parâmetros de URL `CodePage`
(ex.: `'UTF8'`), `TestMode` (`TRUE` mostra o que faria), `TransportRequest`, `SafeMode` (default false; viola →
HTTP 412), `CondenseMessagesInHttpResponseHeader=X`, `DetailMessagesInHttpResponseHeaderUpTo=<n>`; pré-requisitos:
ativar o serviço e "In transaction SICF, check for /UI5/ABAP_REPOSITORY_SRV that the ui5 service is activated";
autorização `S_DEVELOP`. Espelho oficial do texto:
https://raw.githubusercontent.com/SAP-docs/sapui5/main/docs/05_Developing_Apps/using-an-odata-service-to-load-data-to-the-sapui5-abap-repository-a883327.md
(página: https://help.sap.com/docs/ABAP_PLATFORM_NEW/468a97775123488ab3345a0c48cadd8f/a883327a82ef4cc792f3c1e7b7a48de8.html).
O cenário de comunicação `SAP_COM_0B28` citado nessa página é **cloud** (não vale para o 758).
- Relatórios [SAP-help, mesmo espelho]: `/UI5/UI5_REPOSITORY_LOAD` (um app, do file system local — exige GUI),
  `/UI5/UI5_REPOSITORY_LOAD_HTTP` (zip por URL), `_HTTPN` (vários); "The functions of the reports are also available
  in the RFC-enabled function module `/UI5/REPO_LOAD_FROM_ZIP_URL` … called remotely, for example, from Maven
  builds"; parâmetros também via arquivo `.Ui5RepositoryUploadParameters` no zip; modos delta e teste; subir só o
  conteúdo de `webapp`/`dist`
  https://raw.githubusercontent.com/SAP-docs/sapui5/main/docs/05_Developing_Apps/deploying-sapui5-applications-to-the-sapui5-abap-repository-a560bd6.md
- FM `/UI5/UI5_REPOSITORY_LOAD_HTTP` [espelho]: `IV_URL`, `IV_SAPUI5_APPLICATION_NAME`, `IV_PACKAGE`,
  `IV_WORKBENCH_REQUEST`, `IV_EXTERNAL_CODE_PAGE`, `IV_ACCEPT_UNIX_STYLE_EOL`, `IV_DELTA_MODE`, `IV_TEST_MODE` →
  `EV_SUCCESS` (S/W/E), `EV_LOG_MESSAGES`; **Remote-Enabled**
  https://www.sapdatasheet.org/abap/func//ui5/ui5_repository_load_http.html (o `/UI5/REPO_LOAD_FROM_ZIP_URL` da
  doc não está no espelho — é mais novo; medir os dois na TFDIR). Ambos precisam de uma **URL alcançável pelo SAP**
  (o zip tem de estar num HTTP que o servidor veja) — o OData recebe o zip no body e não tem essa exigência.
- API de classe [espelho]: `/UI5/IF_UI5_REP_DT` (`GET_API`, `CREATE_REPOSITORY`, `PUT_FILE`, `CREATE_FOLDER`,
  `DELETE`, `LOCK`/`UNLOCK`, `GET_TRANSPORT_INFO`) https://www.sapdatasheet.org/abap/intf//ui5/if_ui5_rep_dt.html;
  `/UI5/CL_UI5_REP_DT` (pacote `/UI5/UI5_INFRA_APP`) https://www.sapdatasheet.org/abap/clas//ui5/cl_ui5_rep_dt.html;
  `/UI5/CL_UI5_UPLOAD_TO_MIME` (`LOAD_FILE_TO_MIME( xstring )`) https://www.sapdatasheet.org/abap/clas//ui5/cl_ui5_upload_to_mime.html
- BSP puro (WAPA sem UI5): `CL_O2_API_APPLICATION=>CREATE_NEW( p_application_data, p_nodes, p_navgraph ) → SAVE →
  ACTIVATE`, páginas por `CL_O2_API_PAGES=>CREATE_NEW_PAGE` + `SET_PAGE`/`SAVE` [abapGit]
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_wapa.clas.abap;
  classe `CL_O2_API_APPLICATION` (pacote SO2_DBLAYER) https://www.sapdatasheet.org/abap/clas/cl_o2_api_application.html;
  atributos `O2APPLATTR` https://www.sapdatasheet.org/abap/tabl/o2applattr.html
- **KBA 3602806** "ICF node not created when using OData service /UI5/ABAP_REPOSITORY_SRV to deploy UI5 app, even
  though the app is deployed as BSP application properly" — S/4HANA all versions, componente CA-UI5-ABA-SAR
  https://userapps.support.sap.com/sap/support/knowledge/en/3602806 [KBA — só o resumo é público]. Ou seja: o app
  sobe, mas o nó `/sap/bc/ui5_ui5/sap/<app>` pode não nascer → a receita 1 (SICF) fecha.
- Clientes de referência (não SAP, mas mostram o contrato em uso): `SAP/open-ux-tools` `ui5-abap-repository-service.ts`
  (`testMode`, `safeMode`) https://github.com/SAP/open-ux-tools/blob/main/packages/axios-extension/src/abap/ui5-abap-repository-service.ts
  — `SAP/open-ux-tools` é repositório oficial SAP [SAP-gh].
- ADT só lê: `filestore/ui5-bsp/*` (GET) [pesquisa anterior]; a coluna "SAP Notes 2046730/2047506" que aparece em
  blogs é para releases antigos (seleção de pacote no deploy) [comunidade, não lidos] — irrelevante para SAP_UI 758.

**Inferido.** O canal é o **OData V2 já existente na lib** (CSRF + `POST Repositories` com `ZipArchive` base64;
`PUT Repositories('<app>')` para atualizar). A versão do SAP_UI do s4h decide (o release 758 do ABAP não garante
SAP_UI 758 — são componentes diferentes).

**O que medir.** (1) `readTable CVERS WHERE COMPONENT='SAP_UI'`; (2) GET `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV/`
(200? 404 = SICF inativo); (3) POST com zip de `index.html` + `manifest.json` mínimos, `TestMode=TRUE` e depois
real, no `$TMP`; ler `readTable TADIR (WAPA)` e `O2APPL`; (4) GET `/sap/bc/ui5_ui5/sap/<app>/index.html` — se 404,
é o KBA 3602806: criar o nó pela receita 1 e repetir; (5) DELETE `Repositories('<app>')`; (6) `TFDIR` de
`/UI5/REPO_LOAD_FROM_ZIP_URL` e `/UI5/UI5_REPOSITORY_LOAD_HTTP` para a via SOAP RFC (exige URL do zip visível pelo
SAP — provavelmente descartada por logística).

## 5. WEBI — definição de web service e SOAMANAGER (457 custom; 487 em `$TMP`)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** `CL_WS_MD_FACTORY` ✅, `CL_WS_MD_VIF_ROOT` ✅ e `CL_SRT_WSP_CONFIG_RT` ✅ existem. **Novidade que a pesquisa dava como não provada:** a coleção ADT **`/sap/bc/adt/businessservices/servprovs` ("SOAP Provider Model", `blues.v2+xml`) EXISTE no 758**, com `$new/schema`, `$new/configuration` e `$new/content` — o SPRV saiu de "não provado on-prem". Não há **nenhum** objeto SPRV na TADIR do s4h (0 linhas), então o próximo passo é `GET .../$new/schema`, não um GET de objeto.

**Encontrado.**
- Criação da definição [abapGit `zcl_abapgit_object_webi`]: `li_root = CL_WS_MD_FACTORY=>GET_VIF_ROOT( )`;
  `mi_vi = li_root->CREATE_VIRTUAL_INTERFACE( name, nameext = vepnameext )`; por função `mi_vi->CREATE_FUNCTION(
  funcname, mapped_name )`; `CREATE_ENDPOINT_REFERENCE( endpoint_type, service_def_startpoint, auto_generated,
  i_is_srvv )`; tipos `CREATE_TYPE_AS_ELEMENTARY/STRUCTURE/TABLE`; `CREATE_SOAP_EXTENSION_VIRTINFC( soap_appl_uri )`;
  `SET_SHORT_TEXT`; persistência `IF_WS_MD_LOCKABLE_OBJECT~LOCK/SAVE/UNLOCK`; existência
  `CL_WS_MD_VIF_ROOT=>CHECK_EXISTENCE_BY_VIF_NAME`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_webi.clas.abap. Gotcha
  registrado (issue #1974): perfil/segurança da interface vive em `WSSOAPPROP`
  https://github.com/abapGit/abapGit/issues/1974
- `CL_WS_MD_FACTORY` (pacote SEWS): `GENERATE_WEB_SERVICE` ("Generation of Web Service" — recebe `WSD_NAME`,
  `VI_NAME` e opções de deploy/perfil), `DELETE_WEB_SERVICE`, `WEB_SERVICE_EXISTS`, `GET_VIF_ROOT` ("only internal
  use") [espelho] https://www.sapdatasheet.org/abap/clas/cl_ws_md_factory.html · assinatura completa em
  https://se80.co.uk/oo-abap/c/cl_w/cl_ws_md_factory-generate_web_service.htm (403 nesta sessão; a lista de
  parâmetros veio do snippet de busca — **a confirmar no 758**). Tabela `VEPHEADER` (`VEPNAME`, `VERSION`,
  `VEPNAMEEXT`, `WSINT_VERSION`) https://www.sapdatasheet.org/abap/tabl/vepheader.html
- **Configuração de runtime (SOAMANAGER) — nenhuma API pública encontrada.** `CL_SRT_WSP_CONFIG_RT` (pacote
  SOAP_CONFIG) tem `ACTIVATE`, `ACTIVATE_ICF`, `ACTIVATE_HTTP`, `ACTIVATE_ABAP_DEST`, mas **privados**; `OPEN`/`OPEN_SCP`
  protegidos; só `REMOVE` é público [espelho] https://www.sapdatasheet.org/abap/clas/cl_srt_wsp_config_rt.html.
  `CL_SRT_WSP_API*`, `CL_SRT_WSP_API_CONFIG/REGISTRY`, FM `SRT_ADMIN_CREATE_ENDPOINT` — **não existem** (404 no
  espelho). O pacote SOAP_CONFIG lista tabelas e transações, sem classe "API"
  https://www.sapdatasheet.org/abap/devc/soap_config.html. `SRT_ADMIN` (setup técnico) e `WSS_SETUP` são reports de
  configuração de sistema, não de serviço https://www.sapdatasheet.org/abap/prog/srt_admin.html ·
  https://www.sapdatasheet.org/abap/prog/wss_setup.html
- ADT/AFF: existe o tipo **`sprv`** ("SOAP Provider Model") e **`srvc`** ("Service Consumption Model") em
  `SAP/abap-file-formats` https://github.com/SAP/abap-file-formats/tree/main/file-formats/sprv ·
  https://github.com/SAP/abap-file-formats/tree/main/file-formats/srvc, e o guia do ADT tem "Creating SOAP Service
  Providers" (New → Business Services → SOAP Provider Model)
  https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/creating-soap-service-providers [SAP-help;
  página não legível aqui; disponibilidade on-prem **não confirmada** — é o caminho ABAP Cloud, com WSDL no
  `SOAMANAGER` do lado].

**Inferido.** A definição WEBI sobre um FM RFC é criável por driver classrun (`GET_VIF_ROOT` é "internal use", mas
é o que o abapGit usa; `GENERATE_WEB_SERVICE` é o caminho oficial do wizard SE80/SE37). O que dá o endpoint
(`/sap/bc/srt/rfc/sap/<serviço>/<mandante>/<serviço>/<binding>`) é a configuração — sem API achada, resta
`cts.anatomia` de uma TR que carregue configuração (tabelas `SRT_CFG_*` são de customizing? a TR diz).

**O que medir.** (1) driver: `GENERATE_WEB_SERVICE` para um FM RFC Z existente no `$TMP`; `readTable VEPHEADER`
e TADIR (WEBI); (2) segunda via: `GET_VIF_ROOT` + `CREATE_VIRTUAL_INTERFACE` como o abapGit; (3) discovery do 758
por `sprv`/`businessservices/soap` — se existir, é a via ADT; (4) anatomia (fila 22/23): TR de um WEBI + sua
configuração, para saber que tabelas o SOAMANAGER escreve.

## 6. SHLP — search help (187 custom)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** as 6 FMs existem (`DDIF_SHLP_PUT`/`_GET`/`_ACTIVATE`, `RS_DD_DELETE_OBJ`, `DD_MASS_ACT_C3`, `F4IF_GET_SHLP_DESCR`), **mas nenhuma é RFC** — `FMODE` vazio em todas, incluindo as três que o espelho marcava "Remote-Enabled". Contra-prova: `F4IF_GET_SHLP_DESCR` por SOAP RFC devolve **SOAP Fault**. **A perna SOAP da seção morre**: PUT, ativação e assert ficam todos num driver classrun, numa LUW. Segue sem coleção ADT (`shlp`/`searchhelp` só aparece em `aps/iam/*`, que é de autorização).

**Encontrado.**
- abapGit: `corr_insert( 'DICT' )` → `DDIF_SHLP_PUT( name, dd30v_wa, dd31v_tab, dd32p_tab, dd33v_tab )` → ativação
  centralizada (`DD_MASS_ACT_C3` quando existe, senão `RS_WORKING_OBJECTS_ACTIVATE`); leitura `DDIF_SHLP_GET( name,
  state='A', langu )`; delete `RS_DD_DELETE_OBJ( objname, objtype='H' )`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_shlp.clas.abap ·
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/core/zcl_abapgit_objects_activation.clas.abap ·
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_objects_super.clas.abap
- Assinaturas [espelho]: `DDIF_SHLP_PUT` (exceções `SHLP_INCONSISTENT`, `PUT_FAILURE`, `PUT_REFUSED`; **marcado
  Remote-Enabled**) https://www.sapdatasheet.org/abap/func/ddif_shlp_put.html; `DDIF_SHLP_GET` (Remote-Enabled)
  https://www.sapdatasheet.org/abap/func/ddif_shlp_get.html; `DDIF_SHLP_ACTIVATE( name, prid ) → rc` (**não**
  RFC) https://www.sapdatasheet.org/abap/func/ddif_shlp_activate.html; `RS_DD_DELETE_OBJ` (não RFC)
  https://www.sapdatasheet.org/abap/func/rs_dd_delete_obj.html; `DD_MASS_ACT_C3` (não RFC)
  https://www.sapdatasheet.org/abap/func/dd_mass_act_c3.html. `DD30L` = cabeçalho (`SHLPNAME`, `ISSIMPLE`,
  `SELMETHOD`, `SELMTYPE`, `DIALOGTYPE`, `AUTOSUGGEST`, `FUZZY_SEARCH`) https://www.sapdatasheet.org/abap/tabl/dd30l.html
- Efeito por RFC: `F4IF_GET_SHLP_DESCR( shlpname, shlptype='SH' ) → SHLP_DESCR` (Remote-Enabled)
  https://www.sapdatasheet.org/abap/func/f4if_get_shlp_descr.html
- Família `RPY_*` para SHLP: **não achada** (`RPY_SEARCHHELP_INSERT`, `RPY_SHLP_READ`, `RPY_DD_SHLP_INSERT` → 404).
- ADT: `ddic/searchhelps` **não existe no 758 [medido]**; vscode_abap_remote_fs registra `SHLP/DH` sem creator
  (registry.ts acima); `SAP/abap-file-formats` **não tem `shlp`** (lista de 109 pastas:
  https://github.com/SAP/abap-file-formats/tree/main/file-formats) — sinal de que o ADT não o edita nem em cloud.

**Inferido.** Se `DDIF_SHLP_PUT` for mesmo `FMODE='R'` no 758, o PUT vai por **SOAP RFC** (padrão `receita-fm-rfc-wrapper`
não precisa) e só a ativação pede driver — ou tudo num driver classrun (mais simples: uma LUW). Search help elementar
sobre tabela (`SELMTYPE='T'`), com `DD32P` (parâmetros `IMPORT/EXPORT`) e `DD33V` vazio, é o caso mínimo.

**O que medir.** (1) `TFDIR` de `DDIF_SHLP_PUT`/`GET`/`ACTIVATE`; (2) `DDIF_SHLP_GET` de uma search help padrão
(ex.: `H_T001`) para copiar o formato das 4 estruturas; (3) PUT+activate de `YJBV_POC_SH` sobre tabela Z no `$TMP`;
`readTable DD30L (AS4LOCAL='A')`; (4) `F4IF_GET_SHLP_DESCR` por SOAP RFC como assert; (5) delete `'H'`.

## 7. VIEW — view clássica SE11 (179 custom; 149.971 SAP)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** **o desmentido mais barato da sonda: `RPY_VIEW_INSERT` é `FMODE='R'`** (grupo `SAPLSIFD`) — o espelho dizia que não é RFC. `RPY_VIEW_READ` ✅ também é RFC, e respondeu por SOAP nesta sonda (721 bytes, `V_T001`). Os `DDIF_VIEW_*` existem, nenhum é RFC. Ou seja: **view clássica pode nascer por SOAP RFC puro, sem driver** — a via mais barata de toda a pesquisa. `ddic/views` segue sendo a view externa HANA [medido, item 12].

**Encontrado.**
- abapGit: `corr_insert( 'DICT' )` → `DDIF_VIEW_PUT( name, dd25v_wa, dd09l_wa, dd26v_tab, dd27p_tab, dd28j_tab,
  dd28v_tab )` → ativação central; leitura `DDIF_VIEW_GET( name, state='A', langu )`; **sem** tratamento por
  `VIEWCLASS` (D/C/E/A)
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_view.clas.abap
- [espelho] `DDIF_VIEW_PUT` (não RFC) https://www.sapdatasheet.org/abap/func/ddif_view_put.html;
  `DDIF_VIEW_ACTIVATE( name, auth_chk='X', prid ) → rc` (não RFC) https://www.sapdatasheet.org/abap/func/ddif_view_activate.html;
  `RPY_VIEW_INSERT( view_name, view_head TYPE RPY_VIHD, view_fields RPY_VIFD_U, view_selconds RPY_VISC, view_tables
  RPY_VITB, development_class, transport_number )` (não RFC) https://www.sapdatasheet.org/abap/func/rpy_view_insert.html;
  `RPY_VIEW_READ` (**Remote-Enabled**) https://www.sapdatasheet.org/abap/func/rpy_view_read.html; `DD25L`
  (`VIEWNAME`, `AGGTYPE`, `ROOTTAB`, `VIEWCLASS`, pacote SDVI) https://www.sapdatasheet.org/abap/tabl/dd25l.html
- ADT `ddic/views` é a view **externa HANA** **[medido]**; `VIEW/DV` sem creator no vscode_abap_remote_fs; AFF sem
  `view`.

**Inferido.** Dois drivers possíveis; `RPY_VIEW_INSERT` é irmã da `RPY_TRANSACTION_INSERT` que a lib já usa
(`tran.mjs`) e traz `DEVELOPMENT_CLASS`/`TRANSPORT_NUMBER` no contrato — provavelmente o menos verboso. Para view de
manutenção (`VIEWCLASS='C'`) a receita cruza com o item 17 (SM30: o TOBJ nasce sobre a view).

**O que medir.** (1) `RPY_VIEW_READ` (RFC) de `V_T001` para o formato; (2) driver `RPY_VIEW_INSERT` de uma view de
banco (join de 2 tabelas Z do `$TMP`) + `DDIF_VIEW_ACTIVATE`; (3) `readTable DD25L`; `SELECT` na view pelo driver;
(4) segunda via `DDIF_VIEW_PUT` só se a RPY recusar; (5) delete `RS_DD_DELETE_OBJ 'V'`.

## 8. ENHO / ENHS / ENHC — enhancement framework (113 + 6 + 1 custom)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** `CL_ENH_FACTORY` ✅, `CL_ENH_TOOL_BADI_IMPL` ✅, `CL_ENH_TOOL_HOOK_IMPL` ✅, `CL_ENH_TOOL_CLASS` ✅, `CL_WDR_CFG_ENHANCEMENT` ✅. **Seção já executada** pelo item 20 da fila: o POST ADT em `enhoxhb` foi **desmentido** (400 `I::000`, e deixa órfã só-TADIR) e a via é `cl_enh_factory` em driver, com o ADT fazendo PUT/DELETE depois (`enho.mjs`).

**Encontrado.**
- BAdI implementation [abapGit `enh/zcl_abapgit_object_enho_badi`]: `('CL_ENH_FACTORY')=>CREATE_ENHANCEMENT(
  enhname, enhtooltype = CL_ENH_TOOL_BADI_IMPL=>TOOLTYPE )` → `?= lo_badi`; `SET_SPOT_NAME`;
  `IF_ENH_OBJECT_DOCU~SET_SHORTTEXT`; `ADD_IMPLEMENTATION( <impl> )` por implementação; `IF_ENH_OBJECT~SAVE( run_dark
  = abap_true )`; `~UNLOCK` https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/enh/zcl_abapgit_object_enho_badi.clas.abap.
  Hook (`enho_hook`): `enhtooltype = CL_ENH_TOOL_HOOK_IMPL=>TOOLTYPE`, `SET_ORIGINAL_OBJECT( pgmid, obj_name… )`,
  `ADD_HOOK_IMPL( overwrite, method, enhmode, full_name, source, spot… )`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/enh/zcl_abapgit_object_enho_hook.clas.abap.
  Classe (`enho_class`): `CL_ENH_TOOL_CLASS=>TOOLTYPE`, `SET_CLASS`, `SET_OWR_METHODS/SET_PRE_METHODS/SET_POST_METHODS(
  version='I' )` https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/enh/zcl_abapgit_object_enho_class.clas.abap.
  Subtipos que o abapGit trata: BADI, HOOK, CLASS, INTF, WDYN (`CL_WDR_CFG_ENHANCEMENT`), FUGRENH, WDYENH;
  leitura `CL_ENH_FACTORY=>GET_ENHANCEMENT( enhancement_id, run_dark, bypassing_buffer )`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_enho.clas.abap
- Spot: `CL_ENH_FACTORY=>CREATE_ENHANCEMENT_SPOT( spot_name, tooltype, dark = abap_false, compositename,
  abap_language_version )` https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_enhs.clas.abap;
  composto: `CREATE_ENHANCEMENT_COMPOSITE( name, run_dark ) → composite` + `ADD_ENH_CHILD`/`ADD_COMPOSITE_CHILD`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_enhc.clas.abap
- [espelho] `CL_ENH_FACTORY` (SEEF_BASE; `CREATE_ENHANCEMENT` "Read or Create Enhancement", exceções
  `CX_ENH_CREATE_ERROR`, `CX_ENH_IS_LOCKED`, `CX_ENH_PERMISSION_DENIED`) https://www.sapdatasheet.org/abap/clas/cl_enh_factory.html;
  `CL_ENH_TOOL_BADI_IMPL` (`TOOLTYPE = 'BADI_IMPL'`, `ADD_IMPLEMENTATION`, `SET_SPOT_NAME`, `CHECK_IMPLS`)
  https://www.sapdatasheet.org/abap/clas/cl_enh_tool_badi_impl.html; `ENHHEADER` (`ENHNAME`, `VERSION`,
  `ENHTOOLTYPE`, `STATE`) https://www.sapdatasheet.org/abap/tabl/enhheader.html
- ADT: coleções `enhancements/{enhoxh,enhoxhb,enhoxhh,enhsxs,enhsxsb}` **[medido: existem no 758]** — só GET e
  PUT vistos em cliente; `SAP/abap-file-formats` **tem `enho`** ("The current version of the file format covers
  BAdIs only": `generalInformation.enhancementSpot`, `badiImplementations[]{name, badiDefinition, implementingClass,
  isActiveImplementation, customizingSupport, filterValues}`) https://github.com/SAP/abap-file-formats/tree/main/file-formats/enho
  · https://github.com/SAP/abap-file-formats/blob/main/file-formats/enho/enho-v1.json e **`enhs`**
  https://github.com/SAP/abap-file-formats/tree/main/file-formats — ou seja, SAP escreve BAdI-impl e spot como arquivo
  (ADT/gCTS) → o create ADT existe em algum release; ADT em BTP cria spot/definição/implementação de BAdI "starting
  with SAP BTP ABAP Environment 2008 and ADT 3.12" [comunidade, blog SAP]
  https://community.sap.com/t5/application-development-and-automation-blog-posts/how-to-extend-sap-standard-using-abap-development-tools-for-eclipse-adt/ba-p/13486291

**Inferido.** No 758 a via ADT para **BAdI implementation** é plausível (coleção `enhoxhb` + AFF `enho` só BAdI); hook
e class enhancement ficam para o driver `CL_ENH_FACTORY`. Fecha a hipótese "fraca" do item 20 da fila com um POST
concreto para tentar.

**O que medir.** (1) GET `enhancements/enhoxhb/<ENHO padrão de BAdI>` (accept `enh.enhoxhb.v4+xml`) e POST do
mesmo XML com nome Z e spot padrão (ex.: um BAdI de teste); (2) se 405/400, driver `CREATE_ENHANCEMENT` BADI_IMPL
com classe implementadora Z criada antes pela lib (`class`); `readTable ENHHEADER`; (3) efeito: `GET BADI` +
`CALL BADI` no driver; (4) delete: `IF_ENH_OBJECT~DELETE`? (não visto — medir); (5) hook: só se a lista do cliente
pedir.

## 9. Forms — SSFO / SFPF / SFPI / SSST (67 + 46 + 38 + 37 custom)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** `CL_SSF_FB_SMART_FORM` ✅, `CL_FP_HELPER` ✅, `CL_FP_WB_FORM` ✅, `CL_FP_WB_INTERFACE` ✅. **`SSF_ACTIVATE_STYLE` NÃO é RFC** (o espelho dizia que sim) e `SSF_READ_FORM` também não — some a "perna RFC" do SSST. Seção majoritariamente executada pelos itens 19/41/42 (`forms.mjs`); SSST (Smart Style) segue sem receita. Sem coleção ADT para `sfp*`/`forms`.

**Encontrado.**
- Smart Forms [abapGit `zcl_abapgit_object_ssfo`]: `lo_sf->ENQUEUE( suppress_corr_check = space, master_language,
  mode = 'INSERT', formname )`; `lo_sf->XML_UPLOAD( dom = <root do XML>, formname, language CHANGING sform = lo_res )`;
  `lo_res->STORE( im_formname, im_language, im_active = abap_true )`; `lo_sf->DEQUEUE( formname )`; exceção
  `CX_SSF_FB`; leitura `SSF_READ_FORM`, `SSF_READ_OBJ_TEXT`, status `SSF_STATUS_INFO`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_ssfo.clas.abap. Classe
  `CL_SSF_FB_SMART_FORM` (pacote SMART): `XML_UPLOAD` "Imports form definition from XML", `XML_DOWNLOAD`, `ENQUEUE`,
  `STORE`, `LOAD` [espelho] https://www.sapdatasheet.org/abap/clas/cl_ssf_fb_smart_form.html; `SSF_READ_FORM`
  (Remote-Enabled) https://www.sapdatasheet.org/abap/func/ssf_read_form.html; `SSF_FUNCTION_MODULE_NAME` (**não**
  RFC — a render por Smart Form pede driver) https://www.sapdatasheet.org/abap/func/ssf_function_module_name.html;
  `STXFADM` https://www.sapdatasheet.org/abap/tabl/stxfadm.html
- Smart Styles [abapGit `zcl_abapgit_object_ssst`]: `SSF_SAVE_STYLE( i_header TYPE ssfcats, i_paragraphs ssfparas,
  i_strings ssfstrings, i_tabstops stxstab )` + `SSF_ACTIVATE_STYLE`; delete `SSF_DELETE_STYLE`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_ssst.clas.abap;
  `SSF_SAVE_STYLE` não RFC https://www.sapdatasheet.org/abap/func/ssf_save_style.html; `SSF_ACTIVATE_STYLE`
  **Remote-Enabled** https://www.sapdatasheet.org/abap/func/ssf_activate_style.html
- Adobe form [abapGit `zcl_abapgit_object_sfpf`]: `li_form = CL_FP_HELPER=>CONVERT_XSTRING_TO_FORM( xstr )`;
  `li_form->GET_LAYOUT( )->SET_LAYOUT_DATA( xdp )`; `CL_FP_WB_FORM=>CREATE( i_name, i_form, i_ordernum, i_dark )` →
  `SAVE`, `FREE`; delete `CL_FP_WB_FORM=>DELETE( i_name, i_ordernum, i_dark )`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_sfpf.clas.abap; interface
  [`zcl_abapgit_object_sfpi`]: `CONVERT_XSTRING_TO_INTERFACE` + `CL_FP_WB_INTERFACE=>CREATE( i_name, i_interface )`
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_sfpi.clas.abap; [espelho]
  `CL_FP_WB_FORM` (SAFPAPI: `ACTIVATE`, `CHECK`, `CREATE`, `DELETE`, `GENERATE`, `LOAD`)
  https://www.sapdatasheet.org/abap/clas/cl_fp_wb_form.html; `CL_FP_HELPER` https://www.sapdatasheet.org/abap/clas/cl_fp_helper.html;
  `FPCONTEXT` (`NAME`, `STATE`, `INTERFACE`) https://www.sapdatasheet.org/abap/tabl/fpcontext.html; `FP_JOB_OPEN`
  **Remote-Enabled** https://www.sapdatasheet.org/abap/func/fp_job_open.html (o item 19 da fila já prevê o ciclo
  `FP_JOB_*`)
- ADT/AFF: `SAP/abap-file-formats` **tem `sfpf`** (pasta na lista) — Adobe form vira arquivo em cloud; o guia do ADT
  tem "Editing Forms" https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/editing-forms [SAP-help,
  não legível aqui; é ABAP Cloud]. Não há `ssfo`/`sfpi`/`ssst` no AFF. SFPF/SSFO "not allowed in ABAP Cloud
  Development" [comunidade] https://community.sap.com/t5/enterprise-resource-planning-q-a/object-sfpf-adobe-form-is-not-allowed-in-abap-cloud-development-what-s-the/qaq-p/13957215

**Inferido.** Criar form "do zero" pela lib não faz sentido (layout XFA/XDP é obra de designer); a receita útil é
**copiar/renomear** (form padrão → `Y…` por `XML_DOWNLOAD`/`CONVERT_FORM_TO_XSTRING` + create) e **renderizar**
(item 19). Tudo classrun; só o estilo (SSST) tem uma perna RFC.

**O que medir.** Junto do item 19: (1) driver copia um Smart Form padrão por `XML_DOWNLOAD` → `XML_UPLOAD` no
`$TMP`, `readTable STXFADM`; (2) idem Adobe (`CONVERT_FORM_TO_XSTRING` → `CL_FP_WB_FORM=>CREATE`), `readTable
FPCONTEXT`; (3) render de ambos e assert `%PDF`; (4) delete.

## 10. NROB — number range object (49 custom)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** **a seção virou outra coisa.** O 758 tem a coleção ADT **`/sap/bc/adt/numberranges/objects`** (accept `blues.v1+xml`, categoria `nrobnro`), com `$schema`, `$configuration`, `validation` e `source/formatter`, e templateLinks com `{?corrNr,lockHandle,version,accessMode,_action}` + `/source/main`. Medido: `GET <obj>` → **200** `blue:blueSource adtcore:type="NROB/NRO"`; **`GET <obj>/source/main` com `application/json` → 200 e o corpo É o `nrob-v1.json` do AFF** (`interval{numberLengthDomain,percentWarning,subType,untilYear,rolling,prefix}`, `configuration{buffering,bufferedNumbers}`). O sistema serve o próprio schema — e o fluxo de escrita desse formato **a lib já roda** desde a fila 29
(`APLO/TYP`, `tipos/applicationLogObject.mjs`). **Some a hipótese "driver classrun"** para o objeto — e a perna "intervalo por SOAP RFC" também: `NUMBER_RANGE_ENQUEUE`, `_INTERVAL_UPDATE`, `_OBJECT_READ` e `_OBJECT_INIT` **não são RFC** no 758 (`FMODE` vazio; contra-prova: `NUMBER_RANGE_OBJECT_READ` por SOAP → SOAP Fault), ao contrário do que o espelho marcava. 46 NROB custom na TNRO.

**Encontrado.**
- abapGit: `NUMBER_RANGE_OBJECT_UPDATE( indicator = 'I', object_attributes TYPE tnro, object_text TYPE tnrot,
  TABLES errors )` (exceções `OBJECT_ALREADY_EXISTS`, `OBJECT_ATTRIBUTES_MISSING`, `OBJECT_TEXT_MISSING`) →
  `NUMBER_RANGE_OBJECT_CLOSE( object )`; `tadir_insert` + `corr_insert`; intervalos no delete:
  `NUMBER_RANGE_INTERVAL_LIST` → `NUMBER_RANGE_INTERVAL_UPDATE` → `NUMBER_RANGE_UPDATE_CLOSE`; delete
  `NUMBER_RANGE_OBJECT_DELETE`; leitura `NUMBER_RANGE_OBJECT_READ`; histórico `CHANGEDOCUMENT_READ_HEADERS(
  objectclass='NRKROBJ' )` https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_nrob.clas.abap
- [espelho] RFC: `NUMBER_RANGE_OBJECT_READ` (sim) https://www.sapdatasheet.org/abap/func/number_range_object_read.html;
  `NUMBER_RANGE_ENQUEUE` (sim) https://www.sapdatasheet.org/abap/func/number_range_enqueue.html;
  `NUMBER_RANGE_INTERVAL_UPDATE( object, TABLES interval TYPE inriv, error_iv; check_at_all_events )` (sim)
  https://www.sapdatasheet.org/abap/func/number_range_interval_update.html; `NUMBER_RANGE_OBJECT_INIT` (sim)
  https://www.sapdatasheet.org/abap/func/number_range_object_init.html. **Não** RFC: `NUMBER_RANGE_OBJECT_UPDATE`
  https://www.sapdatasheet.org/abap/func/number_range_object_update.html, `NUMBER_RANGE_OBJECT_CLOSE`
  https://www.sapdatasheet.org/abap/func/number_range_object_close.html, `NUMBER_RANGE_UPDATE_CLOSE`
  https://www.sapdatasheet.org/abap/func/number_range_update_close.html, `NUMBER_RANGE_OBJECT_DELETE`
  https://www.sapdatasheet.org/abap/func/number_range_object_delete.html, `NUMBER_RANGE_INTERVAL_LIST`
  https://www.sapdatasheet.org/abap/func/number_range_interval_list.html, `NUMBER_RANGE_OBJECT_MAINTAIN` (diálogo)
  https://www.sapdatasheet.org/abap/func/number_range_object_maintain.html. `TNRO` (`OBJECT`, `DOMLEN`,
  `PERCENTAGE`, `NRTAB`, `DTELSOBJ`, `YEARIND`, `BUFFER`, `NOIVBUFFER`, `NONRSWAP`, `CODE`)
  https://www.sapdatasheet.org/abap/tabl/tnro.html. Doc SAP das FMs de número: "Number range and group read and
  maintain services" https://help.sap.com/docs/SAP_NETWEAVER_702/fe143c646c5510148906c2564726e947/48d7a0b1a69d3e49e10000000a421937.html
  [SAP-help, NW 7.02 — descreve o padrão ENQUEUE → INTERVAL_UPDATE → UPDATE_CLOSE → DEQUEUE]
- AFF `nrob` [SAP-gh] é o mapa TNRO em JSON: `interval{numberLengthDomain, percentWarning, subType, untilYear,
  rolling, prefix}`, `configuration{transactionId, buffering: mainBuffer|parallel|none, bufferedNumbers}`
  https://raw.githubusercontent.com/SAP/abap-file-formats/main/file-formats/nrob/nrob-v1.json
- ADT: "In ADT version 3.24, a new form-based Number Range Object Editor was introduced" — snippet de busca da
  página de release notes https://help.sap.com/docs/abap-cloud/abap-development-tools-for-eclipse-release-notes/release-notes-of-abap-development-tools-3-24?version=sap_btp
  [SAP-help — página não legível aqui; a URL é da variante **BTP**; se vale on-prem e em que release, não está
  provado]. Nenhum cliente ADT open source tem coleção para NROB (`NROB/NR` sem creator no registry.ts).

**Inferido.** Objeto por driver classrun (`UPDATE` + `CLOSE` na mesma LUW); intervalo por **SOAP RFC** puro
(`ENQUEUE` → `INTERVAL_UPDATE` → `UPDATE_CLOSE`?) — o `UPDATE_CLOSE` não é RFC, logo o intervalo também vai no driver.
Prova pelo efeito: `NUMBER_GET_NEXT` (RFC, já conhecido) devolve `0000000001`.

**O que medir.** (1) discovery do 758 por `nrob`/`numberrange`; (2) driver: objeto `YJBV_POC_NR` com domínio Z
(`DOMLEN`) + intervalo `01` 1–999; `readTable TNRO/NRIV`; (3) `NUMBER_GET_NEXT` por SOAP RFC; (4) delete (intervalos
antes do objeto, como o abapGit).

## 11. PARA — SET/GET parameter (12 custom; 14.045 SAP)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** **`RS_CORR_INSERT` NÃO é RFC** no 758 (`FMODE` vazio) — o espelho marcava "Remote-Enabled"; idem `RS_TREE_OBJECT_PLACEMENT`. Como a via já era driver, nada muda aqui — mas a correção vale para toda a pesquisa: **TADIR/transporte por `RS_CORR_INSERT` só sai de dentro de um driver** (é o que `tran.mjs` e `enho.mjs` já fazem). Sem coleção ADT `para`/`setget`.

**Encontrado.** Não há API: abapGit faz `RS_CORR_INSERT( object, object_class = 'PARA', mode, global_lock,
devclass, master_language, suppress_dialog )` e `MODIFY tpara FROM ls_tpara. MODIFY tparat FROM ls_tparat.`; delete
`DELETE FROM tpara/tparat` + `RS_TREE_OBJECT_PLACEMENT( operation='DELETE', type='CR' )`
https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_para.clas.abap. `TPARA` =
`PARAMID` (20) + `PARTEXT` https://www.sapdatasheet.org/abap/tabl/tpara.html; `RS_CORR_INSERT` **Remote-Enabled**
https://www.sapdatasheet.org/abap/func/rs_corr_insert.html; `RS_TREE_OBJECT_PLACEMENT` Remote-Enabled
https://www.sapdatasheet.org/abap/func/rs_tree_object_placement.html. AFF `para` = só `header{description,
originalLanguage}` https://github.com/SAP/abap-file-formats/blob/main/file-formats/para/para-v1.json (confirma: o
objeto é o id + texto). `PARA/R` é "GUI-only" (`AbapSimple`) no registry.ts.

**Inferido.** Driver de 3 linhas (`RS_CORR_INSERT` + 2 `MODIFY` + `COMMIT`). Efeito: programa Z com `SET/GET
PARAMETER ID 'YJBV'` ativa (o check de sintaxe cita TPARA).

## 12. XSLT — transformações (9 custom; 34.803 SAP)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** `CL_O2_API_XSLTDESC` ✅ existe, e a seção **já foi resolvida pelo item 20**: o POST ADT em `xslt/transformations` **cria** nos dois subtipos (`tipos/transformation.mjs`). `XSLT_MAINTENANCE` e `RS_WORKING_OBJECTS_ACTIVATE` existem e **não são RFC** — irrelevante, a via ADT venceu.

**Encontrado.** abapGit: `CL_O2_API_XSLTDESC=>CREATE_NEW_FROM_STRING( p_source, p_attr TYPE o2xsltattr{xsltdesc,
devclass} ) → p_obj`; `SAVE`; `SET_CHANGEABLE( abap_false )`; ativação centralizada (`RS_WORKING_OBJECTS_ACTIVATE`);
delete `LOAD` → `SET_CHANGEABLE( abap_true )` → `DELETE` → `SAVE`
https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_xslt.clas.abap; issue: a
transformação tem de ativar **antes** do programa que a referencia https://github.com/abapGit/abapGit/issues/5262.
[espelho] `CL_O2_API_XSLTDESC` (SXSLT_TOOL: `CREATE_NEW`, `CREATE_NEW_FROM_STRING`, `EXISTS`, `LOAD`, `SAVE`,
`ACTIVATE`, `CHECK`, `SET_SOURCE`, `IS_SIMPLE_TRANSFORMATION`) https://www.sapdatasheet.org/abap/clas/cl_o2_api_xsltdesc.html;
`O2XSLTDESC` https://www.sapdatasheet.org/abap/tabl/o2xsltdesc.html; FM `XSLT_MAINTENANCE` (não RFC)
https://www.sapdatasheet.org/abap/func/xslt_maintenance.html; `RS_WORKING_OBJECTS_ACTIVATE` (não RFC)
https://www.sapdatasheet.org/abap/func/rs_working_objects_activate.html. ADT: `xslt/transformations` **[medido:
existe no 758]**; `XSLT/VT` com creator `AbapXml` e conteúdo por `sourceUri` (PUT) no vscode_abap_remote_fs;
AFF `xslt` (`generalInformation.transformationType: xsltProgram|simpleTransformation`, arquivos `.xslt.json` +
`.xslt.xml`) https://github.com/SAP/abap-file-formats/tree/main/file-formats/xslt.

**Inferido.** É o tipo com mais chance de POST ADT no 758 (coleção presente, AFF presente, cliente com PUT). Se não,
driver `CREATE_NEW_FROM_STRING` + `ACTIVATE`.

**O que medir.** (1) GET `xslt/transformations/<ST padrão>` (accept a descobrir pelo 406); (2) POST com um
`<xsl:transform>`/`tt:transform` mínimo no `$TMP`; ativação pela rota comum; (3) efeito: `CALL TRANSFORMATION`
no driver; (4) delete.

## 13. CMOD / SXCI — user exit clássico e BAdI clássica (15 + 15 custom)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** as 6 FMs existem. **`SXO_IMPL_ACTIVE` NÃO é RFC** no 758 (o espelho dizia que sim) — cai a ideia de "ativar implementação clássica por SOAP RFC barato como assert"; tudo por driver.

**Encontrado.** CMOD [abapGit]: `INSERT modact/modtext/modattr FROM TABLE` + `MOD_KUN_ACTIVATE( activate = abap_true,
modname )`; desativar `deactivate = abap_true`; delete `MOD_KUN_DELETE( modname, screen = abap_false )`
https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_cmod.clas.abap;
`MOD_KUN_ACTIVATE` não RFC https://www.sapdatasheet.org/abap/func/mod_kun_activate.html; `MODACT` (`NAME`,
`TYP`, `MEMBER`, `BADI_IMP`) https://www.sapdatasheet.org/abap/tabl/modact.html. SXCI [abapGit]: `SXO_BADI_READ`
→ `CREATE OBJECT … TYPE cl_badi_flt_values_alv` → `SXO_IMPL_SAVE( impl TYPE impl_data, flt_ext, filter_val_obj,
no_dialog, TABLES fcodes/cocos/intas/sscrs CHANGING korrnum, devclass )` → `SXO_IMPL_ACTIVE( imp_name, no_dialog )`;
delete `SXO_IMPL_DELETE` https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_sxci.clas.abap;
`SXO_IMPL_SAVE` não RFC https://www.sapdatasheet.org/abap/func/sxo_impl_save.html; `SXO_IMPL_ACTIVE`
**Remote-Enabled** https://www.sapdatasheet.org/abap/func/sxo_impl_active.html; `SXC_EXIT` (`IMP_NAME`,
`EXIT_NAME`, `FLT_VAL`) https://www.sapdatasheet.org/abap/tabl/sxc_exit.html.

**Inferido.** Legado; entra só puxado pela lista de um cliente. Ativar/desativar uma implementação clássica existente
por SOAP RFC (`SXO_IMPL_ACTIVE`) é barato e pode servir de assert em teste E2E.

## 14. TYPE / SHI3 / CUS0 / CUS1 — cauda (2 / 1 / 2 / 2 custom)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** dois desmentidos: (1) **existe coleção ADT `/sap/bc/adt/ddic/typegroups`** (`typegroups.v2+xml` e `v3+xml`) e o GET de um type group padrão devolve **200** (`atypgr:abapTypeGroup`, `sourceUri="source/main"`) — o tipo é obsoleto, mas *tem* via ADT; (2) **`STREE_HIERARCHY_SAVE`, `STREE_HIERARCHY_READ` e `STREE_STRUCTURE_READ` SÃO RFC** (o espelho dizia que o SAVE não era), enquanto **`STREE_EXTERNAL_DELETE` NÃO é** (dizia que era) e **`S_CUS_ACTIVITY_SAVE` NÃO é**. `RS_DD_TYGR_INSERT_SOURCES`, `TYPD_GET_OBJECT`, `S_CUS_IMG_ACTIVITY_SAVE/_DELETE`, `S_CUS_ACTIVITY_DELETE` existem, nenhum RFC.

- **TYPE**: `RS_DD_TYGR_INSERT_SOURCES( typegroupname, ddtext, corrnum, devclass, TABLES source )` (não RFC) +
  ativação; leitura `TYPD_GET_OBJECT( typdname, TABLES psource )`; delete `RS_DD_DELETE_OBJ 'G'` [abapGit]
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_type.clas.abap ·
  https://www.sapdatasheet.org/abap/func/rs_dd_tygr_insert_sources.html; AFF `type` (`.type.json` + `.type.abap`)
  https://github.com/SAP/abap-file-formats/tree/main/file-formats/type. Type groups são obsoletos desde 7.02
  (tipos globais em interfaces/classes) — não vale receita.
- **SHI3** (menu de área): `STREE_HIERARCHY_SAVE( structure_id, structure_type, structure_masterlanguage,
  structure_responsible, structure_buffermode, development_class, TABLES list_of_nodes hier_iface,
  list_of_references hier_ref, list_of_texts hier_texts, structure_descriptions ttreet )` (não RFC); leitura
  `STREE_STRUCTURE_READ`/`STREE_HIERARCHY_READ`; delete `STREE_EXTERNAL_DELETE` (**RFC**) [abapGit]
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_shi3.clas.abap ·
  https://www.sapdatasheet.org/abap/func/stree_hierarchy_save.html · https://www.sapdatasheet.org/abap/func/stree_external_delete.html;
  `TTREE` https://www.sapdatasheet.org/abap/tabl/ttree.html. Os `RS_TREE_*` do grupo SEUT (`RS_TREE_CONSTRUCT`,
  `RS_TREE_ADD_NODE`, `RS_TREE_LIST_DISPLAY`) são a árvore de **exibição** do SE80, não o SHI3 [espelho]
  https://www.se80.co.uk/sap-function-modules/?name=rs_tree_construct — descartar como via.
- **CUS0/CUS1** (IMG): `S_CUS_IMG_ACTIVITY_SAVE( img_activity, i_docu, i_attributes, i_activity, i_description,
  i_tcode )` (não RFC) https://www.sapdatasheet.org/abap/func/s_cus_img_activity_save.html; `S_CUS_ACTIVITY_SAVE(
  activity, activity_type, tcode, customer_exit…, TABLES activity_title, objects, objects_texts )` (**RFC**)
  https://www.sapdatasheet.org/abap/func/s_cus_activity_save.html; delete `S_CUS_IMG_ACTIVITY_DELETE` /
  `S_CUS_ACTIVITY_DELETE` [abapGit] https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_cus0.clas.abap
  · https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_cus1.clas.abap;
  `CUS_IMGACH` https://www.sapdatasheet.org/abap/tabl/cus_imgach.html. A árvore IMG em si (SIMGH) é outro objeto
  (SHI6/SHI7) — abapGit ainda discute https://github.com/abapGit/abapGit/issues/3077.

## 15. UIAC / UIAD — catálogos e app descriptor do Fiori launchpad (2 UIAC custom)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** **`CL_SUI_UIAD_DB_ACCESS` e `IF_SUI_UIAD_DB_ACCESS` NÃO existem no 758** (`SEOCLASS` vazia) — a via do abapGit para UIAD não roda aqui, e não há coleção ADT com `uiad`/`launchpad`/`ui2`. UIAC já não tinha nada. **A seção fecha por ausência de peça**, não por prioridade. O handler AFF genérico (§ A) existe, mas é o acesso específico do UIAD que falta.

**Encontrado.** UIAD [abapGit `aff/zcl_abapgit_object_uiad`]: herda do handler AFF comum e usa
`('CL_SUI_UIAD_DB_ACCESS')=>GET_INSTANCE` + `IF_SUI_UIAD_DB_ACCESS~READ_WB_METADATA` e `CL_BLUE_AFF_WB_ACCESS`
https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/aff/zcl_abapgit_object_uiad.clas.abap;
AFF `uiad` v2 (`generalInformation{applicationType, catalogId, fioriId}`, `navigation`, `tiles[]`, `ui5AppDetails`…)
https://github.com/SAP/abap-file-formats/tree/main/file-formats/uiad; **UIAC não tem handler nem AFF** — no issue
#5958 "Currently has been decided to support only UIAD objects. UIAC object is not in a focus anymore" (2024-07-15)
https://api.github.com/repos/abapGit/abapGit/issues/5958/comments. Ferramentas SAP: Launchpad App Manager
`/UI2/FLPAM` (S/4HANA 2020+) e Content Manager `/UI2/FLPCM_CUST`/`_CONF` [comunidade, blog SAP]
https://community.sap.com/t5/technology-blog-posts-by-sap/sap-fiori-launchpad-app-manager-tool-available-for-sap-s-4hana-2020/ba-p/13483977;
"you can define a Launchpad Configuration in the manifest.json and deploy it along" — o UIAD nasce do deploy do app
[SAP tutorial] https://developers.sap.com/tutorials/abap-environment-deploy-cf-production.html. Classes `/UI2/CL_FDM_*`
não achadas nos espelhos.

**Inferido.** Baixo volume e API só via AFF. Fica atrás da via transversal AFF (abaixo); se ela existir no 758,
UIAD vem de graça.

---

## Canais e endpoints transversais

### A. Handler AFF no servidor — um driver genérico para os tipos com JSON (a medir)

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** **as classes existem**: `CL_AFF_OBJECT_HANDLER_FACTORY` ✅, `IF_AFF_OBJECT_HANDLER_FACTORY` ✅, `IF_AFF_OBJECT_HANDLER` ✅, `CL_AFF_FILE` ✅, `CL_AFF_FILES_CONTAINER` ✅, `CL_AFF_OBJ` ✅, `CL_BLUE_AFF_WB_ACCESS` ✅ (só `CL_SUI_UIAD_DB_ACCESS` falta, e é do UIAD). **E há um caminho melhor que o driver:** 27 coleções do discovery declaram **`$schema`** e servem o JSON do `SAP/abap-file-formats` pelo próprio ADT REST — `numberranges/objects`, `businessservices/servprovs`, `applicationjob/{catalogs,templates}`, `applicationlog/objects`, `archivingobjects/objects`, `businessobjects/{nontnot,rontrot}`, `businessservices/{eeecevc,evtbevb}`, `changedocuments/objects`, `customfields/objects`, `databrowser/objects`, `ddic/{db/indexes,dsfi,extensionindexes}`, `destructionobjects/objects`, `metricproviders`, `predefinedfields/objects`, `sfw/featuretoggles`, `sit/sitotyp`, `transportobject/objects`, `wbobj/apictyp`, `wmpc/applications`, `abapdaemons/applications`, `bct/{scp1bcs,smbctyp}`. Um deles — `applicationlog/objects` — já foi **criado e alterado** pela lib (fila 29, `APLO/TYP`), o que
torna o padrão conhecido, não hipotético; o NROB (§ 10) é o próximo, com leitura já provada. O driver
`GET_OBJECT_HANDLER` vira **reserva** para tipo sem coleção.

abapGit cria UIAD/UIST/UIPG e mais 24 tipos por um único caminho: `CREATE OBJECT … TYPE ('CL_AFF_OBJECT_HANDLER_FACTORY')`
→ `IF_AFF_OBJECT_HANDLER_FACTORY~GET_OBJECT_HANDLER( object_type )` → `IF_AFF_OBJECT_HANDLER~DESERIALIZE(
files_container, log, settings )`, com o JSON embrulhado em `CL_AFF_FILE( name = '<obj>.<tipo>.json', content )`
dentro de `CL_AFF_FILES_CONTAINER( object = CL_AFF_OBJ )`; serialização por `~SERIALIZE` + `IF_AFF_FILE~GET_CONTENT`
https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/aff/zcl_abapgit_object_common_aff.clas.abap.
Tipos que o abapGit roteia por aí: APLO, BGQC, CDBO, CHKC, CHKO, CHKV, COTA, DESD, DRTY, DTEB, DSFI, DRAS, DSFD,
EVTB, EEEC, GSMP, SAJT, SAJC, SMBC, SWCR, NONT, RONT, UIAD, UIPG, UIST, DTSC, DTIX (+ DOMA/INTF experimentais)
https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/aff/zcl_abapgit_aff_registry.clas.abap.
`SAP/abap-file-formats` publica 109 formatos, entre eles **nrob, para, http, enho, enhs, xslt, type, uiad, uipg,
uist, smtg, sfpf, chdo, sprv, srvc, apis, dmon, evtb, sajc, sajt** https://github.com/SAP/abap-file-formats/tree/main/file-formats;
o README diz que SAP usa os formatos "whenever ABAP objects need to be written to files, e.g., in ADT and gCTS"
https://raw.githubusercontent.com/SAP/abap-file-formats/main/README.md. Nenhuma das classes `CL_AFF_*` aparece nos
espelhos (release antigo) — a existência no 758 é a pergunta. **Se existirem**, um driver classrun que recebe
`{tipo, nome, json}` cobre NROB, PARA, XSLT, TYPE, ENHO(BAdI), SMTG, UIAD… de uma vez, com o JSON validado pelos
schemas do repositório SAP. **Repare** que o abapGit *não* usa AFF para nrob/para/xslt/type/enho (usa as FMs
clássicas das seções acima) — indício de que esses handlers podem existir só em releases mais novos que o 7.5x que
o abapGit ainda suporta, não de que faltem no 758. Medir: `readTable SEOCLASS` (`CL_AFF_OBJECT_HANDLER_FACTORY`,
`CL_AFF_FILE`, `CL_AFF_FILES_CONTAINER`, `CL_AFF_OBJ`, `CL_SUI_UIAD_DB_ACCESS`); depois `GET_OBJECT_HANDLER('NROB')`.

### B. Discovery ADT — ~~o que ainda não foi sondado~~ **sondado em 2026-08-31 (fila 38)**

**Carimbo (2026-08-31, s4h 758, só leitura).** A sonda por nome foi feita: o discovery do 758 tem **648 coleções**.
Achado: **`numberranges/objects`** (§ 10), **`businessservices/servprovs`** (§ 5), **`ddic/typegroups`** (§ 14) e
**`ucon/httpservices`** (UCON, não SICF). Não existem: `srvc`, `para`/`setget*`, `shlp`, `shi3`/`areamenu*`,
`forms`/`sfp*`, `uiad`/`launchpad*`/`ui2`, `wapa`. **A varredura mais útil não foi por nome e sim por `$schema`:
27 coleções o declaram** — a família AFF/JSON do ADT (lista em § A). Fica de pé, para outro dia, a comparação com
`POST repository/typestructure` (fila 26), que já mostrou não ser confiável para "cria ou não cria".

Já medido antes: `aps/iam/sush` existe; `xslt/transformations` existe; `enhancements/{enhoxh,enhoxhb,enhoxhh,enhsxs,enhsxsb}`
existem; `ddic/views` é a view externa; `ddic/searchhelps` e `aps/iam/tran` não existem (`pesquisa-tipos-adt-nao-cobertos.md`,
`ideias.md`). A sonda
segunda (`POST repository/typestructure`, fila 26) devolve `CAPABILITIES CREATE` + `URI_TEMPLATE` por tipo e resolve
isso de uma vez [abap-adt-api `objectcreator.ts` L234-248, pesquisa anterior]. A lista de tipos criáveis do
abap-adt-api (21 entradas, nenhuma das lacunas acima) está em
https://raw.githubusercontent.com/marcellourbani/abap-adt-api/master/src/api/objectcreator.ts; o discovery é lido
em `app:service/app:workspace/app:collection` + `adtcomp:templateLink`, e há um `core/discovery` separado e o
`repository/informationsystem/objecttypes` (já usado pela `cobertura-tadir`)
https://raw.githubusercontent.com/marcellourbani/abap-adt-api/master/src/api/discovery.ts.

### C. `/IWFND/CATALOGSERVICE;v=2` — catálogo OData como assert de publicação

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** **funciona**: `GET /sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection/$count` → **200 com 4.885**; `?$top=3&$format=json` devolve os serviços (o primeiro do s4h é `ZMVEEMERSON_GW_SRV_0001`). É GET simples com Basic Auth — mais barato e mais público que `readTable /IWFND/I_MED_SRH`, e serve de assert de publicação para o item 16.

URL `http://<host>:<port>/sap/opu/odata/iwfnd/CATALOGSERVICE/` [SAP-help]
https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/7ca326519eff236ee10000000a445394.html
(página não legível aqui; conteúdo por snippet: coleções `ServiceCollection`, `EntitySets` ("cannot be
created/deleted/updated from the client"), `Tags`, `Annotations(TechnicalName,Version)/$value`; V2 em
`/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/ServiceCollection?$format=json`) — é a via **pública e só leitura** para
provar que um serviço V2 está publicado, em vez do `readTable /IWFND/I_MED_SRH` usado no item 16. Em S/4 há também
`RecommendedServiceCollection`/`ScopedServiceCollection` (serviços C2) [comunidade]
https://community.sap.com/t5/technology-q-a/odata-v4-service-catalog/qaq-p/12230553. Medir: GET no s4h e comparar
com `/IWFND/I_MED_SRH`.

### D. Registro e ativação de serviço OData sem SEGW e sem `/IWFND/MAINT_SERVICE`

`/IWBEP/CL_MGW_MED_REG_API` (backend: modelo/serviço/vocabulário) e `/IWFND/CL_MGW_ACTIVATION_API` (hub: `ACTIVATE_SERVICE`,
`IS_ACTIVE`, `CREATE_ICF_NODE`, `ACTIVATE_ICF_NODE`) — seções 1 e 2. Juntas fecham IWMO/IWSV/IWSG/IWOM/SICF para um
V2 escrito à mão; a doc SAP da activation API lista como não suportado "Create with OAuth", "Service metadata
load", "Create without ICF node" (SSB 1.0) — no 758 pode ser diferente; medir.

### E. Anatomia por objeto lógico (OBJH/OBJSL) — insumo para `cts.anatomia`

O serializador genérico do abapGit prova que **qualquer objeto lógico de transporte** (tipo `L` em `OBJH`) se
reproduz lendo `OBJSL` (tabelas + regra de chave `TOBJKEY`, `PRIM_TABLE`) e escrevendo nas tabelas +
`RS_CORR_INSERT` https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_objects_generic.clas.abap.
Para a lib isso é leitura: `OBJSL WHERE objectname IN ('IWPR','IWSV','IWMO','IWSG','IWOM','TOBJ','SUSH','WEBI'…)`
diz **que tabelas compõem cada tipo** — exatamente o que os itens 22/23 (diff TR × sistema, BRF+) precisam.
`OBJH` https://www.sapdatasheet.org/abap/tabl/objh.html · `OBJSL` https://www.sapdatasheet.org/abap/tabl/objsl.html.

### F. Ativação e transporte fora do ADT

- Ativação DDIC em massa: `DD_MASS_ACT_C3( ddmode='O', frcact, medium='T', TABLES gentab, deltab, cnvtab )` (não
  RFC) para DOMA/DTEL/TABL/TTYP/SHLP/VIEW/ENQU/CDS; workbench: `RS_WORKING_OBJECTS_ACTIVATE( TABLES objects TYPE
  dwinactiv, activate_ddic_objects, with_popup )` (não RFC) para o resto — é o par que o abapGit usa
  https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/core/zcl_abapgit_objects_activation.clas.abap.
  A lib ativa por ADT (`/activation`); para objetos sem coleção ADT (SHLP, VIEW, XSLT…) o driver chama esses.
- Transporte/TADIR: `RS_CORR_INSERT` (Remote-Enabled) — `OBJECT`, `OBJECT_CLASS` ('DICT', 'PARA', …), `DEVCLASS`,
  `KORRNUM`, `MODE='I'`, `SUPPRESS_DIALOG` https://www.sapdatasheet.org/abap/func/rs_corr_insert.html; `RS_DD_DELETE_OBJ(
  objname, objtype 'H'/'V'/'G', no_ask )` (não RFC) https://www.sapdatasheet.org/abap/func/rs_dd_delete_obj.html.

### G. Repositório MIME (SMIM) — dependência de UI5/BSP

**Carimbo (2026-08-31, s4h 758, só leitura — § Carimbo no s4h 758).** `CL_MIME_REPOSITORY_API` ✅ existe.

`CL_MIME_REPOSITORY_API=>IF_MR_API~GET_API( )` → `PUT( i_url, i_content, i_dev_package )`, `CREATE_FOLDER( i_url,
i_language, i_dev_package )` [abapGit] https://raw.githubusercontent.com/abapGit/abapGit/main/src/objects/zcl_abapgit_object_smim.clas.abap;
classe em SMIM_API https://www.sapdatasheet.org/abap/clas/cl_mime_repository_api.html. Não está no recorte custom
(SMIM nasce de nome SAP: 350 por `SRCSYSTEM` [medido]); serve para subir um arquivo estático usado por app/BSP.

### H. api.sap.com (SAP Business Accelerator Hub) — não é fonte para este cookbook

O hub cataloga APIs **de negócio** (OData/SOAP/BAPI sobre CDS de aplicação), com pacote on-premise próprio
("ODATA V2 API | SAP S/4HANA" https://api.sap.com/package/S4HANAOPAPI/odata e OData V4 on-prem por domínio
https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/529fe34b88c14b6283fcb9680c29e99c/c16ab45f3212497a9ae77a5c9dcb77ea.html)
[SAP-help/hub]. Nada ali cria objetos de repositório. O que aparece como "SAP S/4HANA Cloud" (cenários `SAP_COM_*`,
Developer Extensibility, IAM apps) é **cloud-only** e não vale para o 758 — a única API do hub relevante à lib seria
a de negócio para asserts E2E (item 25 da fila), fora deste escopo.

---

## Descartado e por quê

| Candidato | Motivo |
|---|---|
| Criar **IWPR** (projeto SEGW) pela lib | reproduzir o SEGW: nós com `NODE_UUID`, anexos binários em `/IWBEP/I_SBD_AT`, estratégia de geração; abapGit precisou de 4 anos e ainda importa com `DBSQL_DUPLICATE_KEY_ERROR` (#2652, #25). A família já está 90% coberta por efeito (item 16); o resto vira anatomia (E) ou registro à mão (D). |
| Configurar **SOAMANAGER** (endpoint/binding) por API | nenhuma classe/FM pública achada: `CL_SRT_WSP_CONFIG_RT` só tem métodos privados/protegidos; `CL_SRT_WSP_API*`, `SRT_ADMIN_CREATE_ENDPOINT` não existem. Resta anatomia de TR. |
| **UIAC** (catálogo técnico) | sem API nem AFF; abapGit desistiu (#5958, 2024). |
| `RS_TREE_*` para SHI3 | são a árvore de exibição do SE80 (grupo SEUT), não o menu de área (STREE_*). |
| FMs `RPY_*` para SHLP | não existem (`RPY_SEARCHHELP_INSERT`, `RPY_SHLP_READ`, `RPY_DD_SHLP_INSERT` → 404 no espelho); para VIEW existe (`RPY_VIEW_INSERT`). |
| `/UI5/UI5_REPOSITORY_LOAD_HTTP` / `/UI5/REPO_LOAD_FROM_ZIP_URL` por SOAP RFC | são RFC, mas exigem que o zip esteja numa **URL alcançável pelo servidor SAP**; o OData recebe o zip no body — mesma capacidade, sem a logística. Mantidos só como reserva. |
| HTTP service do ADT (`http` no AFF) no 758 | é o objeto ABAP Cloud (`IF_HTTP_SERVICE_EXTENSION`); SAP Community (2021): não criável por ADT on-premise — a via on-prem é o nó SICF (seção 1). |
| ~~SPRV / SRVC (SOAP provider/consumption model do ADT)~~ | ~~AFF existe, guia ADT existe; disponibilidade on-prem 758 **não provada**~~ — **corrigido em 2026-08-31**: `businessservices/servprovs` ("SOAP Provider Model", `blues.v2+xml`, com `$new/schema`) **existe no 758**. `srvc` continua sem coleção. Deixa de ser descarte: vira o próximo passo da § 5. |
| ~~Number Range editor do ADT (3.24)~~ | ~~evidência só por snippet de release notes da variante BTP; não há coleção em cliente algum~~ — **desmentido em 2026-08-31**: `numberranges/objects` existe no 758, lê em `blues.v1+xml` e serve o JSON do AFF em `source/main`. Virou a **1ª prioridade** da tabela. |
| TYPE (type group) | obsoleto; 2 custom. Assinaturas registradas, sem receita. |
| BOBF (291), SOTR (306), Web Dynpro (WDCC/WDYN/WDYA), key user (CFDF/SCBO/SCCV), BRF+ | fora do pedido desta pesquisa; BOBF é antecessor do RAP (abapGit não suporta, #165); BRF+ já tem o item 23. |
| Notas 2046730 / 2047506 (UI5 deploy) | citadas em blogs para releases antigos (seleção de pacote); com SAP_UI ≥ 753 e o serviço OData, irrelevantes. Não lidas. |

## Fontes lidas nesta pesquisa (além das citadas inline)

- Lista de tipos suportados pelo abapGit (todas as lacunas acima marcadas "Yes", exceto UIAC/SOTR/OA2S não listados
  e BOBF "No") https://docs.abapgit.org/user-guide/reference/supported.html
- Diretório `src/objects` do abapGit (classes por tipo) https://api.github.com/repos/abapGit/abapGit/contents/src/objects
  e `src/objects/aff` https://api.github.com/repos/abapGit/abapGit/contents/src/objects/aff
- Guia SAP de configuração do back-end para ADT (prefixos `S_ADT_RES`, já usado na pesquisa anterior)
  https://help.sap.com/doc/2e65ad9a26c84878b1413009f8ac07c3/202210.000/en-US/config_guide_system_backend_abap_development_tools.pdf
- `sapcli` `sap/adt/objects.py` (só INTF/CLAS/DDLS/DCLS genéricos; nada das lacunas)
  https://raw.githubusercontent.com/jfilak/sapcli/master/sap/adt/objects.py
- Release notes do ADT 3.46/3.48/3.54 https://help.sap.com/docs/abap-cloud/abap-development-tools-for-eclipse-release-notes/rn
  — páginas renderizadas por JavaScript, **não legíveis** nesta sessão; nada foi extraído delas.

Páginas do help.sap.com que não abriram aqui (só título): SU22, Catalog Service, ABAP_REPOSITORY_SRV (lida pelo
espelho `SAP-docs`), Creating SOAP Service Providers, Editing Forms, release notes do ADT. Onde a afirmação depende
delas, o texto acima diz "snippet" ou "não legível" — tratar como **inferido** até alguém ler a página inteira.
