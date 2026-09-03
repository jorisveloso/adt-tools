# Cobertura pela TADIR — o que o sistema tem × o que a lib cria

**Medido: S4H release 758, mandante 250, 2026-08-29, somente leitura** (`node scripts/cobertura-tadir.mjs s4h --tudo`;
nenhum objeto criado, alterado ou apagado). Item 15 da fila, nascido da ideia I24. **A pendência do SXD
fechou em 2026-09-01** (sonda ✅ às 16:41 São Paulo, dentro da janela): o mesmo script rodou no **SXD 816,
mandante 100** — a lista do cliente, que era o motivo do item, está na seção "Resultado — SXD (KART)".
**Complemento (item 25, 2026-08-31):** o eixo de *composição* — o que coexiste num pacote de solução real —
está em `composicao-solucoes.md`, medido com o recorte novo `--pacote P1[,P2…] [--sub]` deste script.

## Como se mede (e o que se descobriu medindo)

- **`dataPreview` agrega.** `SELECT pgmid, object, COUNT(*) AS n FROM tadir GROUP BY … ORDER BY n DESCENDING`
  passa pelo `/sap/bc/adt/datapreview/freestyle` — com JOIN (`a~campo`) inclusive. A ideia previa driver
  classrun "porque readTable não agrega"; não precisou: **zero objetos no sistema**, o que torna a medição
  segura num sistema de cliente. Gotcha medido: o freestyle **corta a instrução em ~72 colunas** — um
  `ORDER BY n DESCENDING` no fim de uma linha longa devolve 400 `"DESCENDIN" is not allowed here`; quebrar
  a instrução antes de cada cláusula resolve (o script faz).
- **Descrição do tipo: `EUOBJALL`** (ID = código TADIR, `STEXT` por `SPRAS`, 264 tipos, PT incluído;
  797 linhas) e `WBOBJECTTYPES_T` (574). O que sobra vem do RIS
  (`GET repository/informationsystem/objecttypes?maxItemCount=999&name=*&data=usedByProvider` → 324 itens,
  descrição no idioma de logon, `data=type:CODE/SUB`). **`KO100` é estrutura**, não tabela (é o que o FM
  `TR_OBJECT_TABLE` devolve — e ele **não é RFC**: SOAP Fault); `TROBJT` não existe. 22 códigos do
  recorte custom ficam sem texto em fonte alguma (SPFL, VCLS, W3MI, IDOC, SHI8…).
- **O recorte "custom" esconde o lock object**: `obj_name LIKE 'Z%'` não pega `EZ…`/`EY…` (medido: 11
  ENQU custom fora do `$TMP`). O script inclui `ENQU` + `EZ/EY` à parte. Namespaces `/…/` de
  autor não-SAP existem, mas são poucos (95 DDLS, 87 STOB, 68 TABL…) e ficam fora.
- **`GENFLAG` importa**: sem o filtro, STOB 10.408 e VIEW 4.470 gerados (CDS → entidade e view SQL)
  entrariam como custom.
- **Um recorte alternativo, por `SRCSYSTEM = 'S4H'`** (o que nasceu neste sistema), bate com o Z/Y nos
  tipos de desenvolvimento e diverge nos GERADOS de nome SAP: SUSH 5.683 (vs 569), SPRX 3.787, SICF 2.613,
  SMIM 350 — é o que SU22/proxies/registro de serviço produzem sozinhos.
- **PGMID**: 605 dos 607 tipos são `R3TR`; `LIMU COMM` (684) e `HEAD SYST` (1) são o resto.
  **TADIR mede o que EXISTE, não o que roda** — é proxy de "o que se cria por aqui".

## Resultado — s4h

TADIR inteira: 6204995 objetos. Recorte custom (Z/Y + EZ/EY de ENQU, fora do `$TMP`, `GENFLAG` vazio): **85304 objetos em 121 tipos**; o catálogo (23 módulos, 19 códigos) cobre 19 tipos = **64929 objetos (76%)**.

Leitura: os 19 códigos do catálogo cobrem **três quartos dos objetos custom** e todos os 7 tipos mais
frequentes. O quarto que falta se concentra numa família só — **SEGW / Gateway V2** (IWMO, IWSV, IWVB, IWSG,
IWOM, IWPR: **13.632 objetos, 16%**) mais o SICF que ela gera (1.269) — **fechada no mesmo dia pelo item
16**: cinco dos seis tipos nascem por efeito do `serviceBinding` V2 (ver "O que muda na fila"). Depois vêm TRAN (1.254, I18 — **fechado pelo item 18**, `tran.mjs`), TOBJ
(644 — gerador de atualização de tabela, que ninguém tinha notado), SUSH (569), WEBI (457), G4BA (359 —
**já coberto por efeito**: o publish do `serviceBinding` cria) e uma cauda longa de 90 tipos com menos de
350 cada.

### Custom — por tipo (121 tipos, ordem de frequência)

| tipo | descrição | quantos | catálogo | situação |
|---|---|---|---|---|
| R3TR DDLS | Definições de dados | 12144 | `cds` | módulo |
| R3TR CLAS | Classes | 10837 | `class` | módulo |
| R3TR TABL | Tabelas de banco de dados | 10031 | `structure`, `table` | módulo |
| R3TR PROG | Programas | 8175 | `include`, `prog` | módulo |
| R3TR DTEL | Elementos de dados | 5996 | `dataElement` | módulo |
| R3TR DEVC | Pacotes | 4215 | `package` | módulo |
| R3TR DOMA | Domínios | 3967 | `domain` | módulo |
| R3TR IWMO | Gateway Service Model V2 | 3261 | — | **coberto por efeito** (item 16, medido 2026-08-29): o `serviceBinding` **V2** gera no activate |
| R3TR IWSV | Gateway Service | 3256 | — | **coberto por efeito** (item 16, medido 2026-08-29): o `serviceBinding` **V2** gera no activate |
| R3TR IWVB | Gateway Vocabulary Annotation V2 | 1973 | — | **coberto por efeito** (item 16, medido 2026-08-29): o `serviceBinding` **V2** gera no activate (`<nome>_VAN`) |
| R3TR IWSG | SAP Gateway: Service Groups Metadata | 1899 | — | **coberto por efeito** (item 16): o `serviceBinding` **V2** gera no publish (`<nome>_0001`; 3.010 em `$TMP`) |
| R3TR IWOM | SAP Gateway: Model Metadata | 1897 | — | **coberto por efeito** (item 16): o `serviceBinding` **V2** gera no publish (`<nome>_0001_BE`; 3.007 em `$TMP`) |
| R3TR BDEF | Behavior Definition | 1818 | `behaviorDefinition` | módulo |
| R3TR SRVB | Service Binding | 1436 | `serviceBinding` | módulo |
| R3TR SRVD | Service Definition | 1378 | `serviceDefinition` | módulo |
| R3TR TTYP | Categorias de tabela | 1351 | `tableType` | módulo |
| R3TR IWPR | GW Service Builder Project | 1346 | — | **NADA — o único da família que não nasce do SRVB** (é a SEGW; legado fica para a anatomia por CTS) |
| R3TR SICF | ICF Service | 1269 | — | **NADA — mas não é do RAP**: os 434 nós Z vivem em `/default_host/sap/opu/odata/sap/<serviço>` e nascem do registro SEGW (/IWFND/MAINT_SERVICE); o SRVB V2 publicado NÃO cria nó (medido, item 16) |
| R3TR TRAN | Transações | 1254 | `tran.mjs` (driver classrun, fora do catálogo de tipos) | **fechado pelo item 18** (2026-08-29): `deployTransaction` por `RPY_TRANSACTION_INSERT` — report/dialog/parâmetro/variante; ADT não cria (`aps/iam/tran` é 404 no 758). Ver `receita-tran.md` |
| R3TR DDLX | Metadata Extension | 1217 | `metadataExtension` | módulo |
| R3TR FUGR | Grupos de funções | 1001 | `functionGroup`, `functionGroupInclude`, `functionModule` | módulo |
| R3TR INTF | Interfaces | 689 | `interface` | módulo |
| R3TR TOBJ | Definição de objeto de transporte | 644 | `sm30.mjs` | **fila 17** — `deployTableMaintenance`: OBJ_GENERATE + gerador da SE54 por driver classrun (ADT só lê TOBJ no 758); nome = tabela + `S`/`V` |
| R3TR SUSH | Authorization Default Values | 569 | — | fora de alcance (pesquisa 2026-08-28) — e **nasce sozinho**: 5.683 por `SRCSYSTEM=S4H`, 346 em `$TMP` |
| R3TR WEBI | Definições de serviço | 457 | — | NADA — web service SOAMANAGER (487 em `$TMP`) |
| R3TR G4BA | Gateway V4 Service Group | 359 | — | **coberto por efeito** — o `publish` do `serviceBinding` V4 cria o G4BA de mesmo nome (medido: `YJBV_POC_WDI5_SB` em `$TMP`) |
| R3TR DCLS | Access Control | 336 | `accessControl` | módulo |
| R3TR SOTR | Todos os textos breves OTR no pacote | 306 | — | NADA — textos OTR, nascem junto de WAPA/classe |
| R3TR BOBF | BOPF Business Object | 291 | — | NADA — BOPF (antecessor do RAP) |
| R3TR WAPA | Aplicações BSP | 273 | — | fora de alcance por ADT (pesquisa 2026-08-28: deploy é OData `UI5/ABAP_REPOSITORY_SRV`); item 38 (2026-08-31): `SAP_UI 758` e o serviço responde **200** — o pré-requisito está atendido |
| R3TR MSAG | Classes de mensagens | 213 | `msag` | módulo |
| R3TR SHLP | Ajudas para pesquisa | 187 | — | **só SE11** por ADT — sem coleção no discovery (I2, medido 2026-08-28); item 38 (2026-08-31): as `DDIF_SHLP_*` existem e **nenhuma é RFC** → via candidata é driver classrun |
| R3TR VIEW | Visões | 179 | `view.mjs` | **COBERTO 2026-09-01 (item 45)**: `DDIF_VIEW_PUT` + `TR_TADIR_INTERFACE` + `DDIF_VIEW_ACTIVATE` em driver classrun cria/altera view de banco (D) e de manutenção (C); delete por `RPY_VIEW_DELETE` em SOAP puro. Segue **fora do ADT** (`ddic/views` é a view externa HANA, I2); e o `RPY_VIEW_INSERT` da I57 **dumpa em todo canal sem GUI**. Ver `receita-view-classica.md` |
| R3TR ENHO | Enhancement Implementation | 113 | `enho.mjs` | **BAdI implementation pela API `cl_enh_factory` em driver** (ADT lê/PUT/DELETE, POST não cria no 758) — item 20, medido 2026-08-30; hook/CLASENH só leitura |
| R3TR WDCC | Configurações componente | 77 | — | NADA — Web Dynpro (config) |
| R3TR SUSO | Authorization Object | 73 | `authorizationObject` | módulo |
| R3TR SSFO | SAP Smart Forms | 67 | `forms.mjs` | **render como assert** — `renderSmartForm` (item 19); **cria sem GUI** pelo XML (`subirSmartFormXml`, item 42) e pelo Markdown (`publicarMarkdown`, itens 46/48–52); **item 53**: `FB_MIGRATE_FORM` (`i_with_dialog=' '`) cria o SSFO a partir de um form **SAPscript** em driver classrun |
| R3TR CFDF | Custom Field | 58 | — | NADA — key user (custom field); pacote `TEST_YY_KEY_USER_LOCAL` tem 1.324 objetos |
| R3TR NROB | Obj.interv.numer. | 49 | `tipos/numberRangeObject.mjs` + `nrob.mjs` | **COBERTO 2026-09-01 (item 44)**: create/altera/ativa/apaga por `/sap/bc/adt/numberranges/objects` (`blues.v1+xml`, shell `version="inactive"`, fonte JSON do AFF `nrob-v1`, e é o ACTIVATE que grava a TNRO); intervalo (NRIV) por driver classrun. Ver `receita-nrob.md` |
| R3TR SFPF | Formulários | 46 | `forms.mjs` | **render como assert** — `renderAdobeForm`, exige ADS (no s4h não responde; item 19); **item 53**: `cl_ssf_migration=>migrate` CRIA o SFPF (com o XDP na `FPLAYOUTT`) a partir de um Smart Form, em driver classrun e **sem ADS** — o que exige ADS é **ativar** (`form_activate` → `CX_FP_API_INTERNAL` no s4h) |
| R3TR AUTH | Authorization Field | 41 | `authorizationField` | módulo |
| R3TR SFPI | Interfaces | 38 | `forms.mjs` | interface legível — `renderAdobeForm().params` / `adobeFormInfo` (item 19); cópia por `cl_fp_wb_interface=>copy` (item 41); **item 53**: a migração cria a SFPI (tipo `S`, Smart Forms-compatible) e ela **ativa no s4h** |
| R3TR SSST | SAP Smart Styles | 37 | `forms.mjs` | **item 52**: `publicarSmartStyle` cria e ativa sem GUI (`TR_TADIR_INTERFACE` → `SSF_SAVE_STYLE` → `SSF_ACTIVATE_STYLE`, driver classrun) |
| R3TR SPFL |  | 32 | — | NADA |
| R3TR APIS | Status de liberação de API de objetos | 30 | — | NADA |
| R3TR LRCC | Layered repository content | 29 | — | NADA |
| R3TR SCBO | Custom Business Object | 26 | — | NADA — key user (custom business object) |
| R3TR VCLS |  | 22 | — | NADA |
| R3TR W3MI |  | 16 | — | NADA |
| R3TR SKTD | Knowledge Transfer Document | 16 | — | NADA |
| R3TR SBLE | Customer Extension of Business Logic with restricted ABAP | 15 | — | NADA |
| R3TR CMOD | Projetos de ampliação | 15 | — | NADA — projeto de ampliação (user exit) |
| R3TR SXCI | Business Add-Ins (impl.) | 15 | — | NADA — BAdI clássica (impl.) |
| R3TR OA2S | Escopo OAuth 2.0 | 14 | — | **coberto por efeito** (item 16): o `serviceBinding` **V2** gera no publish (`<nome>_0001`) |
| R3TR ADVC | Application Variant | 13 | — | NADA |
| R3TR PARA | Parâmetros SET/GET | 12 | — | fora de alcance (pesquisa 2026-08-28) |
| R3TR ENQU | Objetos de bloqueio | 11 | `lockObject` | módulo |
| R3TR CHDO | Objeto de documento de modificação | 10 | — | NADA |
| R3TR SUSC | Classe do objeto de autorização | 10 | — | NADA |
| R3TR DTEB | Entity Buffer | 9 | — | NADA |
| R3TR XSLT | Transformações | 9 | `transformation` | módulo — o ADT CRIA (XSLTProgram e SimpleTransformation), pesquisa desmentida (item 20, medido 2026-08-30) |
| R3TR WDYA | Aplicações Web Dynpro | 9 | — | NADA — Web Dynpro |
| R3TR DRTY | Type | 9 | — | NADA |
| R3TR IDOC |  | 9 | — | NADA |
| R3TR WDYN | Componente Web Dynpro / interface | 9 | — | NADA — Web Dynpro |
| R3TR EVTB | Event Binding | 8 | — | NADA |
| R3TR SCCV | Visão CDS personalizada | 8 | — | NADA — key user (CDS view custom) |
| R3TR G4BS | Gateway OData V4 Service | 7 | — | NADA |
| R3TR SOBJ | Tipos de business object | 6 | — | NADA |
| R3TR ENHS | BAdI-Definition | 6 | — | só leitura medida (`enhsxsb` v2); create não tentado — API `cl_enh_factory=>create_enhancement_spot` (item 20) |
| R3TR CHKV | Check Variant | 5 | — | NADA |
| R3TR SHI8 |  | 5 | — | NADA |
| R3TR SAPC | Aplicação ABAP Push Channel | 5 | — | NADA |
| R3TR SOTS | Todas as cadeias OTR no pacote | 4 | — | NADA |
| R3TR SMBC | Maintenance Object | 4 | — | NADA |
| R3TR SHIP |  | 4 | — | NADA |
| R3TR CFDE | Data Source Extension | 4 | — | NADA |
| R3TR CDBO | Objeto Data Browser do cliente | 4 | — | NADA |
| R3TR INA1 | InA Service | 3 | — | NADA |
| R3TR IEXT |  | 3 | — | NADA |
| R3TR APLO | Objeto do log de aplicação | 3 | `applicationLogObject` | **COBERTO** (item 29, 2026-08-31) |
| R3TR ICFA |  | 3 | — | NADA |
| R3TR EEEC | Event Consumption Model | 3 | — | NADA |
| R3TR SAJT | Application Job Template | 3 | `job.mjs` | **COBERTO 2026-09-01 (item 47)**: NÃO sai por ADT REST (o POST de `applicationjob/templates` dá 500 "referência NULL" e não cria nada) — a via é `CL_APJ_DT_CREATE_CONTENT` em driver (`deployJobTemplate`/`apagarJob`/`existeJob`), com a TADIR gravada por `TR_TADIR_INTERFACE`. Ver `receita-application-job.md` |
| R3TR SAJC | Application Job Catalog Entry | 3 | `tipos/applicationJobCatalog.mjs` | **COBERTO 2026-09-01 (item 47)**: create/altera/ativa/apaga por `/sap/bc/adt/applicationjob/catalogs` (`blues.v2+xml`, shell `version="inactive"`, fonte JSON AFF `sajc-v1`; **o activate exige sessão NOVA**). Agendar e provar a execução: `job.mjs` (`agendarJob`/`esperarJob`/`lerJobLog`). Ver `receita-application-job.md` |
| R3TR PRAG | ABAP Pragma | 3 | — | NADA |
| R3TR PMKS |  | 3 | — | NADA |
| R3TR UIAC | Catálogo técnico para SAP Fiori Launchpad | 2 | — | NADA |
| R3TR TYPE | Grupos de tipos | 2 | — | NADA |
| R3TR SLEI |  | 2 | — | NADA |
| R3TR CUS1 |  | 2 | — | NADA |
| R3TR SAMC | ABAP Messaging Channel | 2 | — | NADA |
| R3TR RPDF | Definições de report | 2 | — | NADA |
| R3TR CUS0 | Atividade de customizing | 2 | — | NADA |
| R3TR DTF1 | Função de data | 2 | — | NADA |
| R3TR PINF | Interfaces de pacote | 2 | — | NADA |
| R3TR PFCS |  | 2 | — | NADA |
| R3TR OA2P | Perfil de cliente OAuth 2.0 | 1 | — | NADA |
| R3TR DSFI | Scalar Function Implementation | 1 | — | NADA |
| R3TR DSFD | Scalar Function Definition | 1 | — | NADA |
| R3TR IWNG |  | 1 | — | NADA |
| R3TR DOCT |  | 1 | — | NADA |
| R3TR SPRJ |  | 1 | — | NADA |
| R3TR DMON | ABAP Daemon | 1 | — | NADA |
| R3TR CHKO | Check | 1 | — | NADA |
| R3TR SMTG | E-mail de mensagem | 1 | — | NADA |
| R3TR HTTP | HTTP Service | 1 | — | NADA |
| R3TR SHI5 |  | 1 | — | NADA |
| R3TR SHI3 | Menu de área | 1 | — | NADA |
| R3TR SHDS |  | 1 | — | NADA |
| R3TR SCRL | Reuse Library personalizado | 1 | — | NADA |
| R3TR FORM |  | 1 | — | NADA |
| R3TR DCRW |  | 1 | — | NADA |
| R3TR ENHC | Implementação de ampliação composta | 1 | — | não medido (item 20 cobriu ENHO BADI_IMPL e XSLT) |
| R3TR PROJ |  | 1 | — | NADA |
| R3TR POCS |  | 1 | — | NADA |
| R3TR ECTC | Configurações de teste | 1 | — | NADA |
| R3TR ECAT | Scripts de teste | 1 | — | NADA |
| R3TR CTCT |  | 1 | — | NADA |
| R3TR CCAC | CDM Catalog | 1 | — | NADA |
| R3TR BOBX | BOPF Enhancement Object | 1 | — | NADA |

### Custom — onde e de quem

pacotes: ZFIORIF 1973 · ZNM202410 1369 · TEST_YY_KEY_USER_LOCAL 1324 · (vazio) 1165 · ZDEV 925 · ZCORE_DFE 729 · ZPARADIGMAWBC 658 · ZVERBAS 467 · Z_PK_TESTE 442 · Z001 410 · Z_RXGACIK 358 · ZPVO2_MOOVITR 347 · ZPCKG_MVDOUGLAS 282 · ZDZYON 281 · ZEBG 275

autores: RXDOUGLAS 2986 · MVDMARTINS 2307 · MVMFONTES 1733 · MVRMOTTA 1627 · MVLPORTELA 1362 · MVTNASCIMENT 1131 · MVMCARNEIRO 951 · MVPCHAVES 911 · MVJDAVEL 855 · MVDOUGLAS 781 · MVLSANTOS 724 · MVPOLIVEIRA3 720 · MVLFREITAS 679 · MVEEMERSON 673 · MVCNASCIMEN2 598

`$TMP` (Z/Y): TABL 7359 · PROG 5526 · DTEL 3315 · DOMA 3068 · IWSG 3010 · IWOM 3007 · CLAS 2057 · OA2S 949 · TOBJ 808 · FUGR 648 · WEBI 487 · INTF 460 · TTYP 389 · SUSH 346 · WEBS 321

gerados (`GENFLAG`, Z/Y): STOB 10408 · VIEW 4470 · FUGR 13 · TABL 11 · CLAS 8 · PROG 3 · IDOC 3 · INTF 2 · DDLS 2

O laboratório é um sistema de treinamento: 1.973 objetos em `ZFIORIF`, 1.324 em `TEST_YY_KEY_USER_LOCAL`
(key user), 15 autores com 600+ objetos cada. É distribuição de curso, não de cliente — mais um motivo
para a lista do SXD.

### TADIR inteira — top 40 de 607 tipos (o que a SAP entrega)

| tipo | descrição | quantos | catálogo | situação |
|---|---|---|---|---|
| R3TR AVAS | Classificação | 854213 | — | NADA |
| R3TR DTEL | Elementos de dados | 738330 | `dataElement` | módulo |
| R3TR TABL | Tabelas de banco de dados | 726847 | `structure`, `table` | módulo |
| R3TR CLAS | Classes | 449428 | `class` | módulo |
| R3TR PROG | Programas | 392438 | `include`, `prog` | módulo |
| R3TR TTYP | Categorias de tabela | 270308 | `tableType` | módulo |
| R3TR SMIM | Objetos Mime | 193902 | — | NADA |
| R3TR DOMA | Domínios | 177593 | `domain` | módulo |
| R3TR TRAN | Transações | 173614 | `tran.mjs` | item 18 (2026-08-29) |
| R3TR SPRX | Enterprise Services | 154783 | — | NADA |
| R3TR VIEW | Visões | 149971 | — | **só SE11** |
| R3TR DDLS | Definições de dados | 115545 | `cds` | módulo |
| R3TR INTF | Interfaces | 113686 | `interface` | módulo |
| R3TR STOB | Entität anzeigen | 113105 | — | NADA |
| R3TR DSYS |  | 112083 | — | NADA |
| R3TR CUS0 | Atividade de customizing | 94199 | — | NADA |
| R3TR CUS2 | Tipo de objeto CUS2 | 84467 | — | NADA |
| R3TR CUS1 |  | 83075 | — | NADA |
| R3TR FUGR | Grupos de funções | 81128 | `functionGroup`, `functionGroupInclude`, `functionModule` | módulo |
| R3TR TOBJ | Definição de objeto de transporte | 80804 | — | ideia **I29** |
| R3TR DOCT |  | 64142 | — | NADA |
| R3TR DEVC | Pacotes | 52666 | `package` | módulo |
| R3TR DELM |  | 51871 | — | NADA |
| R3TR DCLS | Access Control | 43767 | `accessControl` | módulo |
| R3TR WDCC | Configurações componente | 38063 | — | NADA |
| R3TR SHI3 | Menu de área | 37327 | — | NADA |
| R3TR DOCV |  | 36737 | — | NADA |
| R3TR XSLT | Transformações | 34803 | — | ideia **I19** |
| R3TR SHLP | Ajudas para pesquisa | 34552 | — | **só SE11** |
| R3TR SUSH | Authorization Default Values | 31876 | — | fora de alcance (pesquisa 2026-08-28) |
| R3TR APIS | Status de liberação de API de objetos | 31256 | — | NADA |
| R3TR ENHO | Enhancement Implementation | 26565 | — | ideia **I19** |
| R3TR PINF | Interfaces de pacote | 26312 | — | NADA |
| R3TR MSAG | Classes de mensagens | 18361 | `msag` | módulo |
| R3TR UIAD | TLOGO para App Descriptor Mass Maintenance | 18315 | — | NADA |
| R3TR SICF | ICF Service | 17549 | — | NADA (registro SEGW, não RAP) |
| R3TR ENHS | BAdI-Definition | 17493 | — | ideia **I19** |
| R3TR SCP2 | CCN switch | 15006 | — | NADA |
| R3TR PARA | Parâmetros SET/GET | 14045 | — | fora de alcance (pesquisa 2026-08-28) |
| R3TR SHI8 |  | 13660 | — | NADA |

O que a SAP entrega em massa e a lib não cria: AVAS (classificação, 854 mil), SMIM (mime, 194 mil), TRAN
(174 mil), SPRX (proxies, 155 mil), VIEW (150 mil), STOB (113 mil, gerado da CDS), CUS0/CUS1/CUS2
(customizing IMG, 262 mil). Nada disso é o que um projeto Z escreve — o recorte custom é o que conta.

## Resultado — SXD (KART)

**Medido: SXD release 816, mandante 100, 2026-09-01, somente leitura** (`node scripts/cobertura-tadir.mjs
sxd --tudo`; nenhum objeto criado, alterado ou apagado — sonda de canais ✅ antes de rodar).

TADIR inteira: 6771234 objetos em 638 tipos. Recorte custom (Z/Y + EZ/EY de ENQU, fora do `$TMP`, `GENFLAG` vazio): **7067 objetos em 86 tipos**; o catálogo (27 módulos, 23 códigos) cobre 22 tipos = **4385 objetos (62%)**.

Leitura — o que a lista do cliente diz e a do laboratório não dizia:

- **O custom é 12× menor que o do s4h** (7.067 × 85.304) e distribuído como projeto de verdade: CLAS no
  topo (991), TABL/DTEL/DDLS/PROG na sequência, sem pacote de curso inflando tipo nenhum. É esta lista
  que valida a aposta do catálogo — e ela confirma: dos 10 tipos mais frequentes, 8 são módulo.
- **O furo que o s4h escondia: `SHIP`, 817 objetos — o 2º maior tipo custom (12%)**, sem descrição em
  EUOBJALL, WBOBJECTTYPES_T nem RIS. No s4h eram **4** e ficaram na cauda "NADA". O que é, de quem é e
  se cabe à lib virou a **I83** — antes dela, nenhuma afirmação.
- **Cobertura efetiva ≈ 78%**: além dos 62% do catálogo, o SXD tem 861 objetos da família Gateway V2
  (IWOM 284 + IWSG 283 + IWMO 123 + IWSV 109 + IWVB 62 — coberta por efeito do `serviceBinding` V2,
  item 16), TRAN 81 (`tran.mjs`), ENHO 70 (`enho.mjs`, BAdI impl.), TOBJ 62 (`sm30.mjs`), VIEW 17
  (`view.mjs`), forms SSFO 5 + SFPF 5 + SFPI 5 + SSST 2 (`forms.mjs`) e SAJT 2 (`job.mjs`). O que sobra
  de verdade: SHIP (817), SICF (350), IWPR (41), WAPA (30) e a cauda de ~60 tipos com ≤ 30 cada.
- **Os tipos recém-cobertos existem no cliente**: NROB 6, SAJC 2, SAJT 2, XSLT 2 — nenhum spike foi em
  tipo que o cliente não usa. APLO é o único código do catálogo ausente no custom do SXD.
- **abapGit está instalado no cliente** (`ZLS_GIT` 152 + `ZLS_ABAPGIT_OBJECTS` 152) e o maior pacote é
  `YS_KB_SOLOTUONS_CORE` (325). Autores: ALAVIERI 1.613, SAP 1.278 (custom de autor "SAP" existe aos
  centos), JVELOSO 411.
- **O padrão de `$TMP` e de gerados é o mesmo do s4h**: IWSG/IWOM aos milhares em `$TMP` (1.251/1.248 —
  registro gerado por API) e STOB 520 + VIEW 192 no `GENFLAG` (CDS → entidade/view SQL).

### Custom — por tipo (86 tipos, ordem de frequência)

| tipo | descrição | quantos | catálogo |
|---|---|---|---|
| R3TR CLAS | Classes | 991 | `class` |
| R3TR SHIP |  | 817 | — (**I83**) |
| R3TR TABL | Tabelas de banco de dados | 569 | `structure`, `table` |
| R3TR DTEL | Elementos de dados | 556 | `dataElement` |
| R3TR DDLS | Definições de dados | 489 | `cds` |
| R3TR PROG | Programas | 412 | `include`, `prog` |
| R3TR SICF | ICF Service | 350 | — |
| R3TR DEVC | Pacotes | 336 | `package` |
| R3TR IWOM | SAP Gateway: Model Metadata | 284 | — (efeito, item 16) |
| R3TR IWSG | SAP Gateway: Service Groups Metadata | 283 | — (efeito, item 16) |
| R3TR INTF | Interfaces | 247 | `interface` |
| R3TR DOMA | Domínios | 210 | `domain` |
| R3TR TTYP | Categorias de tabela | 182 | `tableType` |
| R3TR IWMO | Gateway Service Model V2 | 123 | — (efeito, item 16) |
| R3TR IWSV | Gateway Service | 109 | — (efeito, item 16) |
| R3TR FUGR | Grupos de funções | 93 | `functionGroup`, `functionGroupInclude`, `functionModule` |
| R3TR BDEF | Behavior Definition | 91 | `behaviorDefinition` |
| R3TR TRAN | Transações | 81 | `tran.mjs` |
| R3TR ENHO | Enhancement Implementation | 70 | `enho.mjs` (BAdI impl.) |
| R3TR TOBJ | Definição de objeto de transporte | 62 | `sm30.mjs` |
| R3TR IWVB | Gateway Vocabulary Annotation V2 | 62 | — (efeito, item 16) |
| R3TR SRVB | Service Binding | 42 | `serviceBinding` |
| R3TR SRVD | Service Definition | 42 | `serviceDefinition` |
| R3TR IWPR | GW Service Builder Project | 41 | — |
| R3TR MSAG | Classes de mensagens | 36 | `msag` |
| R3TR DDLX | Metadata Extension | 34 | `metadataExtension` |
| R3TR G4BA | Gateway V4 Service Group | 33 | — (efeito, publish V4) |
| R3TR WAPA | Aplicações BSP | 30 | — |
| R3TR SPFL |  | 29 | — |
| R3TR LRCC | Layered repository content | 26 | — |
| R3TR SUSO | Authorization Object | 24 | `authorizationObject` |
| R3TR SVIM |  | 22 | — |
| R3TR DOCT |  | 22 | — |
| R3TR SOTR | Todos os textos breves OTR no pacote | 21 | — |
| R3TR SUSH | Authorization Default (TADIR) | 18 | — (leitura provada, I58) |
| R3TR SCP1 | CCN clássico | 17 | — |
| R3TR VIEW | Visões | 17 | `view.mjs` |
| R3TR WDCC | Configurações componente | 17 | — |
| R3TR ADVC | Application Variant | 13 | — |
| R3TR AUTH | Authorization Field | 11 | `authorizationField` |
| R3TR W3MI |  | 9 | — |
| R3TR SXCI | Business Add-Ins (impl.) | 9 | — |
| R3TR SPPF |  | 9 | — |
| R3TR SHLP | Ajudas para pesquisa | 8 | — |
| R3TR DCLS | Access Control | 8 | `accessControl` |
| R3TR CFDF | Custom Field | 7 | — |
| R3TR ENHS | BAdI Definition | 7 | — |
| R3TR NROB | Obj.interv.numer. | 6 | `numberRangeObject` |
| R3TR SHI8 |  | 5 | — |
| R3TR SFPI | Interfaces | 5 | `forms.mjs` |
| R3TR SFPF | Formulários | 5 | `forms.mjs` |
| R3TR VCLS |  | 5 | — |
| R3TR SSFO | SAP Smart Forms | 5 | `forms.mjs` + `markdown.mjs` |
| R3TR PMKS |  | 4 | — |
| R3TR SUSC | Classe do objeto de autorização | 4 | — |
| R3TR CMOD | Projetos de ampliação | 4 | — |
| R3TR SOBJ | Tipos de business object | 3 | — |
| R3TR SMTG | E-mail de mensagem | 3 | — |
| R3TR SMBC | Business Configuration Maintenance Object | 3 | — |
| R3TR APIS | Status de liberação de API de objetos | 3 | — |
| R3TR ICFA |  | 3 | — |
| R3TR OA2S | Escopo OAuth 2.0 | 3 | — (efeito, item 16) |
| R3TR BOBF | BOPF Business Object | 3 | — |
| R3TR DXLW |  | 3 | — |
| R3TR SLEI |  | 2 | — |
| R3TR SCBO | Custom Business Object | 2 | — |
| R3TR SAJT | Application Job Template | 2 | `job.mjs` |
| R3TR ENQU | Objetos de bloqueio | 2 | `lockObject` |
| R3TR SAJC | Application Job Catalog Entry | 2 | `applicationJobCatalog` |
| R3TR XSLT | Transformações | 2 | `transformation` |
| R3TR OA2P | Perfil de cliente OAuth 2.0 | 2 | — |
| R3TR DTF1 | Função de data | 2 | — |
| R3TR SSST | SAP Smart Styles | 2 | `forms.mjs` (item 52) |
| R3TR SHMA | Objetos compartilhados classe da área | 1 | — |
| R3TR IEXT |  | 1 | — |
| R3TR SHDS |  | 1 | — |
| R3TR FDT0 | FDT/BRFplus: aplicação de sistema | 1 | — (`brf.mjs` cria app LOCAL, fora da TADIR — item 23) |
| R3TR ENSC | Ponto de ampliação composta | 1 | — |
| R3TR DISG |  | 1 | — |
| R3TR POCS |  | 1 | — |
| R3TR PFCS |  | 1 | — |
| R3TR SUCU | Grupo de autorizações (TBRG_AUTH) | 1 | — |
| R3TR SPLO |  | 1 | — |
| R3TR DRTY | Type | 1 | — |
| R3TR DCRW |  | 1 | — |
| R3TR CHDO | Objeto de documento de modificação | 1 | — |

### Custom — onde e de quem (SXD)

pacotes: YS_KB_SOLOTUONS_CORE 325 · RS_BCT_CRM 156 · ZLS_GIT 152 · ZLS_ABAPGIT_OBJECTS 152 · ZLS_SHEALING 148 · ZFI_8903 146 · ZLS 144 · ZLS_GEN_AI 137 · ZLS_USER_PROJECTION 129 · ZDRC 125 · ZDEV 119 · ZDDMM 118 · Z_O2M_6741 117 · ZBESTPRACTICEPM 115 · RS_BCT_PSM_DFS 108

autores: ALAVIERI 1613 · SAP 1278 · JVELOSO 411 · ROGERIO 190 · RFRANCO 181 · GSANTANA 173 · DANIEL 142 · AARAUJO 141 · LANDRADE 136 · APAULA 131 · FCOSTA 122 · RUMEDA 115 · DHARADA 114 · DEVELOPER 108 · SMONTEIRO 89

`$TMP` (Z/Y): IWSG 1251 · IWOM 1248 · CLAS 175 · DDLS 147 · STOB 146 · PROG 115 · TABL 108 · VIEW 106 · IWMO 77 · IWVB 77 · IWSV 77 · SICF 69 · RULE 66 · TTYP 13 · BDEF 12

gerados (`GENFLAG`, Z/Y): STOB 520 · VIEW 192 · TABL 4 · DCLS 4 · IDOC 1 · FUGR 1

Na TADIR inteira do SXD (top 60 gravado no JSON da sessão) o topo é o mesmo do s4h — AVAS 886 mil, DTEL
775 mil, TABL 767 mil, CLAS 483 mil — com as mesmas conclusões; a diferença relevante toda está no
recorte custom acima.

## O que muda na fila

- **I28 → item 16, MEDIDO 2026-08-29 (S4H 758, `$TMP`, 15/15 PASS pela lib):** a família SEGW / Gateway
  V2 nasce **por efeito** de um `serviceBinding` OData **V2** — `activate` gera IWMO + IWSV + IWVB,
  `publish` gera IWSG + IWOM + OA2S (+ `/IWFND/I_MED_SRH` ativo, `$metadata` 200 em
  `/sap/opu/odata/sap/<binding>/`); `unpublish` e `delete` removem tudo, nada fica. Com isso **12.286 dos
  13.632** (IWMO/IWSV/IWVB/IWSG/IWOM) passam a cobertos, e a cobertura do custom vai de 76% para **~90%**.
  Ficam fora IWPR (o projeto SEGW, 1.346) e o nó SICF por serviço (registro SEGW, não RAP). Bug achado no
  caminho: o job V2 lê `servicename`/`serviceversion` na URL do job — com a forma do V4, o publish dava
  SEVERITY ERROR publicando e o unpublish dava ERROR sem despublicar (corrigido em
  `tipos/serviceBinding.mjs`, `jobRequest`).
- **I29** (nova): TOBJ — gerador de atualização de tabela (SM30), 644 objetos que a fila não previa.
- I18 (TRAN, 1.254), I22 (SFPF 46 + SFPI 38 + SSFO 67 + SSST 37 = 188), I19 (ENHO 113 + XSLT 9 + ENHS 6 +
  ENHC 1 = 129) ganharam número; a ordem entre elas agora é essa. I21 (BRF+): FDT0 306 / BRF0 42 na
  TADIR inteira, **zero** no custom Z/Y. ~~os objetos FDT têm nome GUID~~ — **corrigido pelo item 23
  (2026-08-30)**: o nome do FDT0 na TADIR é o NOME da aplicação; o custom do s4h (26 apps) simplesmente
  NÃO passa pela TADIR (via customizing `TDAT FDT0000`, mandante-dependente) — mora na `FDT_ADMN_0000`
  (`OSYSID = 'S4H'`). Ver `docs/receita-brfplus.md`.
- Cauda sem ideia (NADA, < 300 cada): SXCI/CMOD (BAdI clássica e user exit), WEBI, BOBF, SOTR, key user
  (CFDF/SCBO/SCCV), Web Dynpro (WDCC/WDYN/WDYA), ~~NROB~~, PARA. Ficam registrados aqui com o número; viram
  ideia quando a lista de um cliente os puxar para cima.
- **NROB saiu da cauda em 2026-08-31 (item 38) e virou tipo em 2026-09-01 (item 44)**: tem coleção ADT com
  schema AFF servido pelo próprio sistema, e agora módulo de tipo + canal de intervalos (`receita-nrob.md`).
  Com ele veio a família das **27 coleções com `$schema`** (I56) — ver
  `pesquisa-apis-sap-cookbook.md § Carimbo no s4h 758`. O item 44 é a segunda cobaia dessa família (a 1ª foi
  o APLO da fila 29), e mostrou que os desvios NÃO são todos da família: o `version` do shell e a ativação
  mudam de tipo para tipo.
- **A lista do SXD chegou (2026-09-01)** e mudou uma coisa só, mas grande: **SHIP é o 2º maior tipo custom
  do cliente (817, 12%)** e ninguém sabe o que ele é — virou a **I83** (investigar por leitura: exemplos na
  TADIR, pacotes, autores, RIS). O resto confirmou o catálogo: 62% direto, ~78% com efeito e drivers, e
  todos os tipos recém-cobertos (NROB, SAJC/SAJT, VIEW, TOBJ, forms) existem no custom do cliente.
