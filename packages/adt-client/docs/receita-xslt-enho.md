# Receita: XSLT (transformação) e ENHO (BAdI implementation) sem GUI

**Validado por POC: S4H release 758, mandante 250, 2026-08-30.** Objetos `YJBV_POC_XSLT`, `YJBV_POC_ST` (XSLT/VT),
`YJBV_POC_ENHO`/`YJBV_POC_ENHO2` (ENHO/XHB sobre `ES_J1B_TAX_SITN` / `BADI_J1B_TAX_SITN`), classe `YJBV_POC_CL_BADI`,
drivers `YJBV_POC_CL_*` / `Y_ENH_*` / `Y_TADIRD_*`, todos `$TMP` e todos removidos (TADIR vazia; 0 sessões do usuário em
`TH_USER_LIST` antes e depois de cada rodada). Item 20 da fila (ideia I19). Na lib: `tipos/transformation.mjs`
(forma `custom`, entra pelo `deploy`/`deleteObject` genéricos) e `enho.mjs` (`deployBadiImplementation`,
`setEnhancementProperties`, `deleteEnhancement`, `readEnhancement`, `readEnhancementBanco`, `removerTadirOrfa`).
E2E pela lib 13/13. Custom na moovi: ENHO 113 · XSLT 9 · ENHS 6 · ENHC 1 (`cobertura-tadir.md`).

## XSLT — o ADT cria (desmente a pesquisa)

A pesquisa de 2026-08-28 só tinha achado leitura/PUT via `sourceUri` do nodestructure. Medido no s4h:

1. **Discovery**: `/sap/bc/adt/xslt/transformations`, accept/content-type `application/vnd.sap.adt.transformations+xml`,
   templates `formatter`/`navigation`/`validation`. GET de `ID` (identity, pacote SAP) → `trans:transformation`
   (`xmlns:trans="http://www.sap.com/adt/transformation"`), `adtcore:type="XSLT/VT"`,
   `trans:transformationType="XSLTProgram"`, `abapsource:sourceUri="source/main"`.
2. **POST** do mesmo shell com `adtcore:name`, `adtcore:description`, `adtcore:masterLanguage="PT"`,
   `trans:transformationType` e `adtcore:packageRef` → **200**, objeto `inactive`. Os dois subtipos criam:
   `XSLTProgram` e `SimpleTransformation`.
3. **PUT `/source/main`** (text/plain, com lockHandle) com o documento XML inteiro → 200. ST precisa do prólogo
   `<?sap.transform simple?>`; a lib deduz o subtipo por ele (`tipoDeTransformacao`) e o fixa no create.
4. **Ativação genérica** (`/sap/bc/adt/activation`, `objectReference` com o uri da coleção) → `activationExecuted`,
   zero mensagens; GET devolve `adtcore:version="active"` e o subtipo.
5. **Prova de uso** por driver classrun: `CALL TRANSFORMATION yjbv_poc_xslt SOURCE root = 'abc' RESULT XML lv` →
   `<?xml version="1.0" encoding="utf-16"?><POC>abc-JBV</POC>` (o RESULT XML em string vem com BOM + prólogo
   utf-16); a ST irmã (`tt:root name="ROOT"` + `tt:value ref="ROOT"`) → `<POC>abc</POC>`.
6. **Re-deploy** do mesmo nome: não recria, PUT + activate trocam o fonte (o driver leu `abc-LIB2` depois).
7. **DELETE** com lockHandle → 200; TADIR sem a entrada. O `deleteObject` genérico da lib serve.
8. Banco: `TADIR R3TR XSLT` em `$TMP`. `O2XSLTDESC` por readTable **sem `campos`** estoura
   (`DATA_BUFFER_EXCEEDED`) — a prova por tabela do módulo é a TADIR.

## ENHO (BAdI implementation) — o ADT lê, altera e apaga; quem cria é a API ABAP

### O que o ADT faz no 758 (medido)

- **GET** `enhancements/enhoxhb/<nome>` accept `application/vnd.sap.adt.enh.enhoxhb.v4+xml` → `enho:objectData`
  (`ENHO/XHB`), `enho:contentCommon` (`toolType="BADI_IMPL"`, `usages` com a classe USEO, o spot EXTO e a
  interface USEO), `enho:contentSpecific/badiTechnology/badiImplementations/badiImplementation` com `name`,
  `shortText`, `example`, `default`, `active` (booleanos), `customizingLock` (**CHAR: `X`/vazio**),
  `runtimeBehaviorShorttext`, e os filhos `enhancementSpot`, `badiDefinition` (uri
  `enhsxsb/<spot>#type=enhs%2fxb;name=<badi>`), `implementingClass`. `parseEnhancement` devolve isso.
- **POST não cria.** Três tentativas: (a) XML próprio com `customizingLock="false"` → 400 erro de desserialização
  em `ST_ENH_ADT_ENHO_BADI` (o campo é CHAR); (b) `contentSpecific` copiado byte a byte de uma implementação Z
  real, só nomes trocados → 400 `I::000` (`ExceptionResourceCreationFailure`, mensagem vazia); (c) igual a (a)
  com `customizingLock=""` → o mesmo `I::000`. **E cada 400 deixa uma entrada órfã** `R3TR ENHO` na TADIR
  (`$TMP`), sem `ENHHEADER`: GET 404, DELETE do ADT 400 "Parâmetro LSM não está contido na versão 0009 da
  configuração PCT". Sai por `TR_TADIR_INTERFACE` (`wi_delete_tadir_entry = 'X'`) num driver — subrc 0.
- **PUT funciona** sobre um enhancement que existe de verdade: lock → PUT v4 (o XML do GET sem os `atom:link`,
  com `shortText`/`active` trocados) → unlock → ativação genérica (200, zero mensagens) → GET com o texto novo
  e `active="false"`.
- **DELETE funciona** sobre um enhancement que existe: lock → DELETE?lockHandle → 200; `ENHHEADER` e `TADIR`
  vazias.

### A via que cria: `cl_enh_factory` (a do abapGit), por driver classrun

```abap
cl_enh_factory=>create_enhancement( EXPORTING enhname = 'YJBV_POC_ENHO' enhtype = cl_abstract_enh_tool_redef=>credefinition
                                              enhtooltype = cl_enh_tool_badi_impl=>tooltype
                                    IMPORTING enhancement = li_tool CHANGING devclass = lv_pkg ).   " '$TMP'
lo_badi ?= li_tool.
lo_badi->set_spot_name( 'ES_J1B_TAX_SITN' ).
lo_badi->if_enh_object_docu~set_shorttext( 'POC' ).
ls_impl-impl_name = 'YJBV_POC_BADI_IMPL'. ls_impl-badi_name = 'BADI_J1B_TAX_SITN'.
ls_impl-impl_class = 'YJBV_POC_CL_BADI'. ls_impl-active = 'X'.           " enh_badi_impl_data
lo_badi->add_implementation( ls_impl ).
lo_badi->if_enh_object~save( run_dark = abap_true ).
lo_badi->if_enh_object~activate( run_dark = abap_true ).
lo_badi->if_enh_object~unlock( ). COMMIT WORK AND WAIT.
```

Resultado medido: `ENHHEADER` `VERSION=A`, `ENHTOOLTYPE=BADI_IMPL`; `TADIR R3TR ENHO $TMP`; GET ADT 200
`adtcore:version="active"` com a `badiImplementation` (spot, badi, classe). A classe implementadora precisa
existir e estar ativa antes — `deploy(conexao, 'class', …)` com `INTERFACES if_badi_interface` + a interface do
BAdI (`enhs:interface` no GET do spot `enhsxsb/<spot>` v2, ou o `usages` de uma implementação existente);
método não implementado é **aviso** na ativação da classe, não erro. Delete pela API:
`cl_enh_factory=>get_enhancement( enhancement_id lock = abap_true )` → `->delete( nevertheless_delete = abap_true
run_dark = abap_true )` → `->unlock( )` (é o fallback de `deleteEnhancement`; no E2E o ADT bastou).

### Ponto aberto

`enho:runtimeBehaviorShorttext` veio **"Implementação não será chamada"** na POC (impl ativa, em `$TMP`, classe com
método vazio) contra **"Implementação será chamada"** na `ZBADI_J1B_TAX_SITN` da moovi. Não medido o porquê
(candidatos: pacote local, switch/adjustment, filtro). A lib devolve o texto em `implementations[].runtimeBehavior`
e não o interpreta; a prova de que a implementação É chamada (CALL BADI num driver) fica para quem precisar.

## ENHS e o resto da família (só leitura, medido na sessão anterior)

- `enhsxsb/<spot>` v2 GET 200 (3,9 KB no `ES_J1B_TAX_SITN`; 87 KB no `ES_BADI_O2C_POWL_FEEDER`): `enhs:badiDefinition`
  com `singleUse`, `useFallbackClass`, `filterLimitation`, `contextMode`, `enhs:interface`, `enhs:sampleClasses`.
  Create de spot não foi tentado (6 custom na moovi; a API é `cl_enh_factory=>create_enhancement_spot`, não medida).
- `ENHO/XHH` (hook, `enhoxhh` v3 + `source/main` = `ENHANCEMENT 1 … ENDENHANCEMENT`) e `ENHO/XH` (CLASENH, GET v1 →
  500 "Anular referência da referência NULL") ficam como leitura; `ENHHEADER` ativas no s4h: BADI_IMPL 17.767,
  HOOK_IMPL 6.747, CLASENH 1.639, FUGRENH 238.

## Gotchas medidos

- `readTable` com linha de `OPTIONS` acima de 72 caracteres → `OPTION_NOT_VALID` (de novo). Quebrar o where.
- `ENHHEADER` por readTable: pedir `ENHNAME, VERSION, ENHTOOLTYPE` — `ENHCOMPOSITE` faz o FM falhar.
- `objectstructure` da interface (`oo/interfaces/<n>/objectstructure`) não listou os métodos como `INTF/OO`; para
  descobrir o que implementar, a ativação da classe diz (`Implementation missing for method "IF~M"`, aviso).
- Órfã só-TADIR não é apagável pelo ADT; `removerTadirOrfa` (só Z/Y) é a saída — mesma família da I32.

## Uso pela lib

```js
import { criarConexao, deploy, deleteObject } from 'adt-client';
import { deployBadiImplementation, setEnhancementProperties, deleteEnhancement, readEnhancement } from 'adt-client/enho';

// transformação: o subtipo sai do fonte (<?sap.transform simple?> → ST)
await deploy(conexao, 'transformation', { name: 'ZMINHA_XSLT', pkg: 'ZPKG', source: xsltXml });
await deleteObject(conexao, { type: 'transformation', name: 'ZMINHA_XSLT', confirm: true });

// BAdI implementation: classe primeiro, depois o enhancement pela API
await deploy(conexao, 'class', { name: 'ZCL_MINHA_BADI', pkg: 'ZPKG', source: classeQueImplementaAInterfaceDoBadi });
const r = await deployBadiImplementation(conexao, { enhancement: 'ZENH_MINHA', spot: 'ES_J1B_TAX_SITN',
  badi: 'BADI_J1B_TAX_SITN', implClass: 'ZCL_MINHA_BADI', text: 'Minha implementação', pkg: 'ZPKG' });
// r.ok · r.adt.implementations[0] { active, runtimeBehavior, spot, badi, implClass } · r.banco.header
await setEnhancementProperties(conexao, { name: 'ZENH_MINHA', shortText: 'novo texto', active: false });
await deleteEnhancement(conexao, { name: 'ZENH_MINHA', confirm: true });   // ADT → API → TADIR órfã
await conexao.encerrar();
```

Drivers `Y_ENH_<nome>` / `Y_ENHD_<nome>` / `Y_TADIRD_<nome>` em `$TMP`, apagados em `finally` (`keepDriver: true`
mantém). Exige senha no cfg (classrun em sessão nova stateless).
