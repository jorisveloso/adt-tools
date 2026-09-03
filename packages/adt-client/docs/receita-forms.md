# Receita: Smart Forms e Adobe Forms — renderização como assert, sem GUI

**Validado por POC: S4H release 758, mandante 250, 2026-08-30.** Forms padrão `SF_EXAMPLE_01` (Smart Form, pacote
SMART) e `FP_TEST_00` (Adobe Form, pacote SFPT); drivers `YJBV_POC_CL_FORMS*` / `Y_SF_*` / `Y_FP_*` em `$TMP`, todos
removidos ao final (TADIR sem `Y_SF_%`/`Y_FP_%` depois; 0 sessões do usuário em `TH_USER_LIST` antes e depois). Item
19 da fila (ideia I22). Na lib: `forms.mjs` — `renderSmartForm`, `renderAdobeForm`, `contemTexto`, `smartFormInfo`,
`adobeFormInfo`. Custom na moovi: SSFO 67 · SFPF 46 · SFPI 38 · SSST 37 (`cobertura-tadir.md`).

**O que a receita entrega:** a resposta a "o form entregue renderiza e traz os campos certos?" — sem abrir SFP ou
SMARTFORMS, sem impressora, sem spool; e, desde os itens 41 e 42, **copiar e alterar form sem GUI**: Adobe pela API
`CL_FP_WB_*` (§ Cópia de Adobe Form) e **Smart Form pelo XML** — cópia, poda, troca de texto, geração do FM e
exclusão (§ Smart Form SEM GUI, no fim). **O que ela não entrega:** criar form do zero, e criar por ADT REST — não
há coleção ADT para form (discovery do 758: nenhum `href` com form/sfp/smart além de `…/source/formatter`), e o
layout Adobe é XFA/XDP do LiveCycle Designer. A linha "form: só GUI" caiu; "form: só por driver classrun" ficou.

## Em qual sistema medir — **ADS só no SXD** (regra do Joris, 2026-08-31)

> Lista/janelas/VPN dos sistemas em `docs/landscape.md` (registro canônico). A janela do SXD é
> **09:00–24:00 SP** (atualizada 2026-09-03).

A bancada padrão é o **s4h** (758:250, sem VPN). **Forms é a exceção: tudo que depende do ADS mede no
SXD 816:100** (VPN da KART) — o s4h não tem ADS. Não é preferência: é o que os itens 19, 40 e 41
mediram, e a falha do lado errado chega **disfarçada**.

| o que | sistema | por quê (medido) |
|---|---|---|
| Smart Form inteiro — render, cópia, escada, `FB_GENERATE_FORM` | **s4h** | o PDF sai por `CONVERT_OTF`, **sem ADS** (item 42: 5 degraus, PDF olhado a cada um) |
| Anatomia por leitura — FPLAYOUT / FPCONTEXT / FPINTERFACE, `adobeFormInfo` | **s4h** | é `readTable`/`dataPreview`; o ADS não entra |
| Cópia da **INTERFACE** Adobe (SFPI) — `cl_fp_wb_interface=>copy` | **s4h** | passou no s4h no mesmo dia em que o FORM falhou (item 41) |
| Cópia/criação do **FORM** Adobe (SFPF) — `copiarAdobeForm`, I48 | **SXD** | no s4h levanta `CX_FP_API_INTERNAL` "erro interno em SAFP API", **sem `previous` e sem detalhe**; mesmo driver, `COPY ok` no SXD (item 41). ⚠️ item 53 isolou: no s4h a falha é na **ativação**, não na criação — a migração cria SFPF inativo sem reclamar |
| **Migração** SAPscript→SF→XFA e leitura do XDP (`FPLAYOUTT`) | **s4h** | é FM + class-method + `SELECT`; o ADS não entra (item 53, § Migração de forms sem GUI) |
| `renderAdobeForm` — `FP_JOB_OPEN` → FM → `FP_JOB_CLOSE` | **SXD** | no s4h: `CSoapExceptionTransport … communication_failure (100.101)` — ninguém atende (item 19) |
| Conversor XFA/XDP (fila 43) | **SXD** | herda os dois de cima |

⚠️ **No SXD o ADS está vivo mas ainda NÃO devolve PDF** — falta o destino `FP_ICF_DATA_SXD` no AS Java
(item 40, § Veredito do ADS; é infra). Até lá o teto medido do lado Adobe é **`FP_JOB_OPEN subrc=0`**,
não o `%PDF`. Quem escrever assert de Adobe Form antes disso está escrevendo assert que não pode passar.

E, antes de contar com o SXD: **sonde**. Ele esteve inalcançável em 29/08 e respondeu em 31/08
(`node scripts/canais.mjs sxd`) — alcance é do momento, não estado gravado.

## Smart Form — o caminho que funciona (medido, E2E pela lib, 4/4)

1. **`SSF_FUNCTION_MODULE_NAME`** (`formname`) → o FM gerado, `/1BCDWB/SF000000nn`; o número mora em
   `STXFADMI-FMNUMB` (`SF_EXAMPLE_01` → `00000030`; `ZDANFE` da moovi → `00000004`). Form inexistente = subrc 1,
   "Formulário X não existe" — sem dump.
2. **CALL do FM gerado** com `control_parameters` (`no_dialog = 'X'`, `getotf = 'X'`), `output_options`
   (`tddest = 'LP01'`, `tdnoprint = 'X'`), `user_settings = ' '` e **os parâmetros do form** (`SF_EXAMPLE_01`:
   `customer` SCUSTOM, `bookings` TY_BOOKINGS, `connections` TY_CONNECTIONS — tipos DDIC do pacote SMART). O OTF
   volta em `job_output_info-otfdata` (270 linhas; `EP` conta páginas = 1). Parâmetro faltando ou de tipo errado
   chega como `CX_SY_DYN_CALL_*` — o driver captura (`cx_root`) e imprime o texto.
3. **`CONVERT_OTF` format `PDF`** → `bin_file` xstring: 13.235 bytes, cabeçalho `25 50 44 46 2D 31 2E 33` =
   `%PDF-1.3`. É o assert "renderizou".
4. **`CONVERT_OTF` format `ASCII`** → `lines` (TLINE): 71 linhas, 24 com texto — o assert "campos certos"
   (`contemTexto(r, 'SAP AG')`, número do cliente). Texto em colunas cai na **mesma linha** ("Firma … Nosso
   responsável"): compare por trecho, não por linha inteira. Alternativa medida: os comandos `ST` do OTF trazem
   7 caracteres de largura e depois o texto (`0230432Exmos. Senhores,`) — a via ASCII é mais limpa.
5. **Sem ADS.** Smart Form não passa pelo Adobe Document Services; roda em qualquer sistema com `LP01`.

## Adobe Form — a via inteira até o ADS (medido; 4/5, o render exige ADS vivo)

1. **A interface é legível sem GUI.** `FPCONTEXT-INTERFACE` (state `A`) aponta a SFPI; `FPINTERFACE-INTERFACE` é um
   xstring com o asx-XML da `CL_FP_INTERFACE_DATA` (1.951 bytes no FP_TEST_00). Os `IMPORT_PARAMETERS` vêm como
   `<SFPIOPAR><NAME>TEXTLINES</NAME><TYPING>TYPE</TYPING><TYPENAME>TSFTEXT</TYPENAME><OPTIONAL></OPTIONAL>…`. O
   driver lê (`SELECT SINGLE` + `cl_abap_codepage=>convert_from`) e a lib devolve `params` — o checklist do que
   passar. **`dataPreview` não serve**: corta xstring em 255 hex.
2. **`FP_FUNCTION_MODULE_NAME`** (`i_name`) → `/1BCDWB/SM000000nn` (`FP_TEST_00` → `SM00000007`).
3. **`FP_JOB_OPEN`** com `sfpoutputparams` (`nodialog`, `getpdf`, `dest`) → subrc 0, `connection = ADS` (o destino
   default; `RFCDES` tem `ADS` tipo G no s4h).
4. **CALL do FM** com `/1bcdwb/docparams` (`langu`, `country`; `fillable` opcional) + os parâmetros do form
   (`textlines TYPE tsftext` — TSFTEXT é tabela de TDLINE, e **TDLINE é elemento de dados CHAR 132, não
   estrutura**). Saída em `/1bcdwb/formoutput`: componentes medidos por RTTI `PDF PDL XML PAGES LANGU`.
5. **No s4h o ADS não responde**: subrc 2 (`system_error`), "Serviços de documentação Adobe: SOAP Runtime Exception:
   CSoapExceptionTransport : (100101)"; `FP_GET_LAST_ADS_ERRSTR` = "HTTP receive failed with exception
   communication_failure (100.101)"; `FP_JOB_CLOSE` subrc 1 depois da falha. A lib devolve `ok: false` com
   `adsErr`, `msg`, `params` e `jobOpen` preenchidos — dá para distinguir "form errado" de "ADS fora". **A prova
   final (PDF com `%PDF`) fica para um sistema com ADS configurado** — o parser já aceita (`FP_CALL subrc=0 … head=2550…`).
   **Veredito 2026-08-31 (fila 40): ADS morto nos DOIS ambientes alcançáveis, e o problema é o AS Java, não a
   configuração.** s4h: destino `ADS` → `http://10.128.204.25:50100/AdobeDocumentServices/Config?style=rpc`, alvo mudo.
   SXD:100 (816): destino mais completo (`awskartpo001:50000`, usuário ADSUSER + senha, basic auth), `FP_TEST_00`
   ativo, a via inteira da lib rodou (interface, FM `/1BCDWB/SM00000007`, `FP_JOB_OPEN` ok) e caiu no mesmo
   `communication_failure 100.101`. Gotcha de sonda: a linha da `RFCDES` estoura o `RFC_READ_TABLE`
   (`DATA_BUFFER_EXCEEDED`) — ler por `dataPreview`; host/porta moram em `H=`/`I=` do `RFCOPTIONS`. O Joris pediu
   para levantarem o ambiente do ADS — quando subir, a prova é re-rodar o `renderAdobeForm FP_TEST_00`.
6. `SFPOUTPUTPARAMS` (RTTI) também tem `GETPDL`, `GETXML`, `NOPDF`, `XDCNAME`, `PDFVERSION`, `PDFTAGGED` — `getxml`
   é a via para o XML de dados em vez do PDF, não medida.

## Anatomia — onde o form mora (medido por readTable/dataPreview)

| Objeto | TADIR | Tabelas com linhas para o form medido |
|---|---|---|
| Smart Form `SF_EXAMPLE_01` | `R3TR SSFO` | `STXFADM` 1 (MASTERLANG, DEVCLASS, VERSION, quem/quando) · `STXFADMI` 1 (**FMNUMB**, INTVERS) · `STXFADMT` 3 (descrições) · `STXFCONT` 5 (o conteúdo, por idioma/versão) · `STXFOBJT` 322 · `STXFTXT` 97 · `STXFTXTA` 45 · `STXFVAR`/`STXFVARI`/`STXFVART` 1 · `STXFCONTV`/`STXFIMP`/`STXFTXTV` 0 |
| Smart Style | `R3TR SSST` | não medido (37 custom na moovi) |
| Adobe Form `FP_TEST_00` | `R3TR SFPF` | `FPLAYOUT` 1 (STATE A, **LAYOUT** = asx-XML da `CL_FP_LAYOUT`, ~633 bytes — **não é o XFA**) · **`FPLAYOUTT`** n (**uma linha por IDIOMA; `LAYOUT` = o XDP/XFA de verdade**) · `FPCONTEXT` 1 (**INTERFACE** = nome da SFPI, **TYPE** ' '/`M`, **CONTEXT** xstring XML) · `FPCONTEXTI`/`FPCONTEXTR` 1 · `FPCONTEXTT` 9 |
| Adobe interface `FP_TEST_00` | `R3TR SFPI` | `FPINTERFACE` 1 (**INTERFACE** xstring asx-XML com parâmetros, globais, coding) · `FPINTERFACET` 3 |

- Form Adobe tem **versão ativa e inativa lado a lado** (`STATE` A/I): `ZADOBE_FORM` da moovi tem as duas, com
  `LASTDATE` diferentes — `adobeFormInfo` devolve `active` e as linhas.
- ⚠️ **Correção 2026-09-01 (item 53): o XFA NÃO está na `FPLAYOUT`.** A `FPLAYOUT-LAYOUT` guarda a serialização
  asx da instância `CL_FP_LAYOUT` (`TRANSLATION_TYPE`/`CACHE_INFO`/`LAYOUT_TYPE`/`FORM_TECH`) — 541 bytes num form
  recém-migrado, 633 no `FP_TEST_00`; começa com `<?xml …?><asx:abap`, o que fez a leitura anterior confundir. O
  **XDP** mora em **`FPLAYOUTT`** (`NAME`/`STATE`/`LANGUAGE`/`LAYOUT`), uma linha por idioma — é a persistência de
  `CL_FP_LAYOUT->M_LAYOUT_DATAT` (`TFPLAYOUTT`), lida/escrita por `if_fp_layout~get_layout_data`/`set_layout_data`.
  Quem quiser o XFA lê `FPLAYOUTT` **filtrando o idioma**, não a `FPLAYOUT`.
- **TR**: na E071 o form é entrada inteira, `R3TR SSFO|SFPF|SFPI <nome>`. No s4h os forms custom que estão em TR
  aparecem só na `SAPKCCD758` (a request de cópia de cliente, 28.784 objetos) — nenhuma TR de desenvolvimento
  com form Z; a anatomia por chave (`E071K`) de um form não foi medida por falta de exemplar. `cts.anatomia`
  funciona sobre a `SAPKCCD758` (vias ADT e tabelas concordam), mas não é o que a ideia queria.

## Gotchas medidos

- **Parâmetros do form são do form.** Não há CALL genérico: quem chama escreve o ABAP que prepara os dados
  (`declaracoes` + `preparo`) e o mapa `exporting`/`tables` → variável. A lib só garante o ciclo, o parse e a limpeza.
- `LOOP AT … FROM 1 TO n` não existe para `INTO`; o corte de linhas de texto é por `sy-tabix`.
- Substring com expressão (`str+a(b - a)`) não compila — calcule o tamanho antes.
- **Driver órfão**: `renderSmartForm`/`renderAdobeForm` apagam o driver em `finally` — inclusive quando a ativação
  falha (aconteceu na POC: `TDLINE` como estrutura deixou `YJBV_POC_CL_FORMS2` inativo em `$TMP` até a rodada
  seguinte). É o caso da ideia I32.
- Sessões: cada render = 1 `deployAndRun` (sessão nova stateless, encerrada) + 1 `deleteObject`; `TH_USER_LIST`
  0 → 0 em todas as rodadas com `conexao.encerrar()` no `finally`.

## Uso pela lib

```js
import { renderSmartForm, renderAdobeForm, contemTexto, smartFormInfo, adobeFormInfo } from 'adt-client/forms';

const sf = await renderSmartForm(conexao, {
  form: 'SF_EXAMPLE_01',
  declaracoes: '    DATA: ls_cust TYPE scustom, lt_book TYPE ty_bookings, lt_conn TYPE ty_connections.',
  preparo: `      SELECT * FROM scustom INTO ls_cust UP TO 1 ROWS WHERE id = '00000001'. ENDSELECT.
      SELECT * FROM sbook INTO TABLE lt_book UP TO 5 ROWS WHERE customid = ls_cust-id.`,
  exporting: { customer: 'ls_cust', bookings: 'lt_book', connections: 'lt_conn' },
});
// sf.ok · sf.fm · sf.pdf { pages, size, head, isPdf } · sf.texto[] · sf.banco.fm
contemTexto(sf, 'SAP AG');                       // true — o campo saiu

const fp = await renderAdobeForm(conexao, {
  form: 'FP_TEST_00',
  declaracoes: '    DATA: lt_text TYPE tsftext, ls_line TYPE tdline.',
  preparo: "      ls_line = 'linha 1'. APPEND ls_line TO lt_text.",
  exporting: { textlines: 'lt_text' }, langu: 'P', country: 'BR',
});
// fp.params → [{ name: 'TEXTLINES', typename: 'TSFTEXT', optional: false }]  (mesmo sem ADS)
// fp.ok só com ADS vivo; senão fp.adsErr / fp.msg dizem por quê

await smartFormInfo(conexao.cfg, 'ZDANFE');      // { exists, adm, fmNumb, fm }
await adobeFormInfo(conexao.cfg, 'ZADOBE_FORM'); // { exists, active, layout[], context[], interface, interfaceRows[] }
await conexao.encerrar();
```

Drivers `Y_SF_<form>` / `Y_FP_<form>` em `$TMP`, apagados ao final (`keepDriver: true` mantém). Exige senha no cfg
(classrun em sessão nova stateless).

---

## ⚖️ Veredito do ADS — **VIVO, e ainda sem PDF** (SXD 816:100, 2026-08-31)

Item 40 da fila. Medição de hoje, com a VPN da KART de pé e depois de o ambiente do ADS ser
levantado. **Só leitura** no que importa; o driver de render nasce e morre em `$TMP` (nenhum resto:
TADIR sem `Y_FP_*`/`Y_SF_*`).

### O ADS está vivo — a prova é a MUDANÇA do erro

| quando | onde | o que o ADS respondeu |
|---|---|---|
| 2026-08-30 | s4h 250 · SXD 100 | `CSoapExceptionTransport … communication_failure (100.101)` — **ninguém atendeu** |
| 2026-08-31 | SXD 100 | `com.adobe.ProcessingException … (200.101)` — **atendeu e processou** |

O `FP_JOB_OPEN` devolve `subrc=0 connection=ADS`, e a `FPCONNECT` do SXD guarda a versão que só é
gravada quando o handshake acontece:

```
FPCONNECT: DESTINATION=ADS  ADSVERSION=1190.20230809095430.911550
RFCDES ADS (tipo G): H=awskartpo001, I=50000, D=ADSUSER, N=/AdobeDocumentServices/Config?style=rpc
```

### O que ainda falta — e é do lado JAVA

```
FP_ADS_ERR ADS: com.adobe.ProcessingException: com.adobe.ProcessingException:
           Destination exception during destination lookup: FP_ICF_DATA_SXD(200.101).
```

O ADS precisa **chamar de volta o ABAP** por um destino próprio, `FP_ICF_DATA_<SID>` — aqui,
`FP_ICF_DATA_SXD` — e esse destino não resolve no AS Java. **O lado ABAP está pronto**: o nó ICF
`/sap/bc/fp` responde **200** com credencial (`/sap/bc/fpads` e `/sap/bc/fp/form` são 404 — não é
onde o destino aponta).

**Para a infra (opus-idc / Basis da KART), o que falta prover:**

1. o destino **`FP_ICF_DATA_SXD`** no AS Java (NWA → Configuration → Destinations, tipo HTTP),
   apontando para o ICF do SXD (`http://172.31.28.129:8000/sap/bc/fp`, mandante 100), com usuário de
   serviço e senha válidos;
2. conferir depois pelos próprios reports do sistema, que existem no SXD:
   `FP_CHECK_DESTINATION_SERVICE`, `FP_CHECK_HTTP_DATA_TRANSFER` e `FP_ADS_CONNECTIVITY_CHECK`
   (⚠ os três são report — rodam na SE38/SA38, **não** por classrun: `SUBMIT` dentro do driver dumpa
   `DYNPRO_SEND_IN_BACKGROUND`, medido no item 28).

Enquanto isso não existir, **todo render Adobe falha** — a via da lib está inteira e para na porta.

### Gotcha novo: o parâmetro obrigatório da interface

Antes de chegar ao ADS, o FM gerado cobra os parâmetros que a interface do form declara. Sem eles:

```
FP_CALL exc A chamada da função /1BCDWB/SM00000007 fracassou:
            O parâmetro obrigatório TEXTLINES não está preenchido.
```

O `renderAdobeForm` já lê a interface e imprime (`FP_IF_PARAMS`) — use isso para saber o que passar:

```js
await renderAdobeForm(cx, {
  form: 'FP_TEST_00',
  declaracoes: '    DATA lt_text TYPE tsftext.',
  preparo: "      lt_text = VALUE #( ( tdformat = '*' tdline = 'linha' ) ).",
  exporting: { textlines: 'lt_text' },
});
```

### Gotcha de leitura: a RFCDES

`SELECT … rfchost, rfcservice …` dá **400 "Unknown column name"** — o destino mora todo no campo
`RFCOPTIONS` (string com `H=`/`I=`/`D=`/`N=`). E `RFC_READ_TABLE` estoura nessa tabela
(`DATA_BUFFER_EXCEEDED`): leia por `dataPreview`, escolhendo as colunas.

---

## ✂️ Cópia de Adobe Form SEM GUI (item 41)

**Medido 2026-08-31.** E2E pela lib **7/7 PASS** no **SXD 816:100**; cobaias `Y_FP_F41` (SFPF) e
`Y_FP_IF41` (SFPI) em `$TMP`, apagadas ao final (TADIR e FPLAYOUT vazias). A mesma medição rodou no
s4h e **falhou** — é o achado principal.

### A via: `CL_FP_WB_*`, não os FMs do Form Builder

A SFP copia por `FP_FB_INTERFACE_COPY` / `FP_FB_FORM_COPY`, mas os dois são **UI**: no classrun
devolvem, capturável, `Envio da tela SAPLFPUIFB 1210 impossível: nenh.tipo de sistema Windows
indicado`. Por baixo deles está a API que serve:

```abap
cl_fp_wb_interface=>copy( i_source = 'FP_TEST_00' i_name = 'Y_FP_IF41' i_devclass = '$TMP' ).
cl_fp_wb_helper=>interface_activate( i_name = 'Y_FP_IF41' ).
cl_fp_wb_form=>copy( i_source = 'FP_TEST_00' i_name = 'Y_FP_F41' i_devclass = '$TMP' i_dark = 'X' ).
cl_fp_wb_helper=>form_activate( i_name = 'Y_FP_F41' i_language = sy-langu ).
```

Pela lib:

```js
import { copiarAdobeForm, apagarAdobeForm } from 'adt-client/forms';

await copiarAdobeForm(cx, { origem: 'FP_TEST_00', form: 'Y_FP_CLONE', interfaceNova: 'Y_FP_CLONE_IF' });
await apagarAdobeForm(cx, { form: 'Y_FP_CLONE', interfaceNome: 'Y_FP_CLONE_IF', confirm: true });
```

### ⚠️ A cópia do FORM exige ADS; a da INTERFACE não

O mesmo driver, no mesmo dia, nos dois sistemas:

| sistema | ADS | `cl_fp_wb_interface=>copy` | `cl_fp_wb_form=>copy` |
|---|---|---|---|
| SXD 816 | responde | **ok** | **ok** — FPLAYOUT ativo, TADIR SFPF em `$TMP` |
| S4H 758 | não responde | **ok** | `CX_FP_API_INTERNAL` — "Ocorreu um erro interno em SAFP API" |

A exceção do s4h é **opaca**: sem `previous`, sem detalhe, sem número. Se a cópia do form falhar
assim, **olhe o ADS antes de olhar o código** — a lib anexa essa dica ao erro.

### Gotchas medidos

| o quê | o que acontece |
|---|---|
| `I_DARK` (o "sem UI") | **só existe no FORM**. Na interface é erro de compilação: `The formal parameter "I_DARK" does not exist` |
| `i_devclass = '$TMP'` | evita o popup de pacote — sem ele o `copy` cai na UI |
| `form_exists` / `form_layout_exists` | sinalizam **ao contrário**: levantam `CX_FP_API_REPOSITORY` "O objeto X **já existe**" quando ele existe. São check de nome LIVRE, não "existe?" — para saber se existe, use `adobeFormInfo` (FPLAYOUT/FPINTERFACE) |
| a referência de interface do clone | **não** é redirecionada: `FPCONTEXT-INTERFACE` do novo form continua sendo a da ORIGEM (`Y_FP_F41` → `FP_TEST_00`) |
| `cl_fp_wb_form=>load( i_mode = 'SHOW' )` | `CX_FP_API_USAGE` "O parâmetro I_MODE não é válido" — **resolvido no item 59**: os valores aceitos são `READ`/`WRITE`/`TOGGLE` (`IF_FP_WB_OBJECT=>C_MODE_*`; internamente viram SHOW/MODIFY — `'SHOW'` cru cai no `WHEN OTHERS`). Ver § Substituir o layout |
| ordem | a INTERFACE entra primeiro e sai por último — o form a referencia |

### O clone é um form de verdade

Ganha **FM próprio** — `/1BCDWB/SM00000020`, ao lado do `…07` da origem — e o `renderAdobeForm` roda
sobre ele, lê a interface (`FP_IF_PARAMS`) e chega ao `FP_JOB_OPEN subrc=0 connection=ADS`. O PDF
ainda não sai por causa do destino `FP_ICF_DATA_SXD` (ver § Veredito do ADS), não por causa do clone.

---

## 🪜 Smart Form SEM GUI — cópia, escada e o começo do vocabulário (item 42)

**Medido 2026-08-31, S4H 758 mandante 250, E2E pela lib LOCAL.** Origem `SF_EXAMPLE_01`; cobaias `Y_SF_C42`
(clone) e `Y_SF_D1`…`Y_SF_D5` (os degraus) em `$TMP`, todas apagadas ao final (STXFADM, TADIR SSFO e TADIR
CLAS vazias; 0 sessões antes e depois). **A linha "Smart Form: só SMARTFORMS" caiu** — a lib copia, altera,
gera o FM, renderiza e apaga um Smart Form sem abrir a GUI.

### A via — `CL_SSF_FB_SMART_FORM` num driver classrun

```abap
lo_sf->load( im_formname = 'SF_EXAMPLE_01' im_language = '' )   " lê o form ativo
lo_sf->xml_download( EXPORTING parent = doc CHANGING document = doc )
"  ⇩ render para string + RE-PARSE (ver o gotcha abaixo)
lo_new->enqueue( formname mode = 'INSERT' suppress_corr_check = space master_language = sy-langu )
lo_new->xml_upload( EXPORTING dom formname language CHANGING sform = lo_res )
lo_res->store( im_formname = lo_res->header-formname im_language = sy-langu im_active = 'X' )
lo_new->dequeue( formname )
CALL FUNCTION 'FB_GENERATE_FORM' EXPORTING i_formname = …       " só aqui nasce o FM
```

**⚠️ O gotcha que decide tudo: o DOM do `xml_download` não serve direto para o `xml_upload`.** Medido nas
duas formas no mesmo dia: passando `document->get_root_element( )` do próprio download, o `xml_upload`
devolve ok e o `store` grava — mas **só o cabeçalho** (`STXFCONT` 1 linha de 344 bytes contra 2.886 da
origem; `STXFOBJT` e `STXFTXT` ZERADAS) e a geração morre em `generation_error` (subrc 5, "Erro ao gerar
formulário"), sem dizer que o form está vazio. Falta o **RE-PARSE**: renderizar o documento para string
(`create_renderer` + `create_ostream_cstring`) e parseá-la de volta (`create_parser` +
`create_istream_cstring`). Com ele: `STXFOBJT` 255, `STXFTXT` 82, `FB_GENERATE_FORM` subrc 0 e FM
`/1BCDWB/SF00000189`. O abapGit não esbarra nisso porque passa por arquivo — lá o re-parse sai de graça.
Antes de renderizar, as duas declarações de namespace do abapGit vão no root (`xmlns:sf` e `xmlns`).

Outros pontos medidos:

- **A geração é passo à parte.** `store( im_active = 'X' )` deixa o form ativo em `STXFADM` mas SEM FM:
  `SSF_FUNCTION_MODULE_NAME` devolve subrc 2 e o render falha com "Não foi possível gerar formulário".
  `FB_GENERATE_FORM` (SAPLSTXB, **não** RFC → driver) é quem grava `STXFADMI`/`FMNUMB`.
- **`FB_DELETE_FORM` apaga sem GUI** (`i_with_dialog = ' '`, `i_with_confirm_dialog = ' '`) e leva a TADIR
  junto (`TADIR SSFO Y_SF_%` vazia depois). Form inexistente = subrc 2, sem dump.
- A TADIR do form novo é nossa: `TR_TADIR_INTERFACE` antes do enqueue (o abapGit faz o mesmo `tadir_insert`).
- O clone nasce com o `MASTERLANG` da SESSÃO (P), não o da origem (D), e `VERSION 00000`.
- `FB_CREATE_FORM` (com `i_template`) e `FB_GENERATE_FORM` são a dupla que a SMARTFORMS usa; o gerador
  "de verdade" (`SSFCOMP_GENERATE_SMART_FORM`) fica abaixo dela e não precisou ser chamado.

### O XML como material — download, edição local, upload

`baixarSmartFormXml` traz o documento inteiro para o disco (SF_EXAMPLE_01: **108.869 caracteres**) e
`subirSmartFormXml` devolve o XML editado como form novo. Nas duas pontas o transporte é **base64 de
UTF-8**: no download, pedaços `SFX_B64` na saída do classrun; no upload, literais `APPEND '…' TO lt_b64`
no fonte do driver (o fonte ABAP não passa de 255 caracteres por linha). O mesmo mecanismo traz o **PDF**:
`renderSmartForm(cx, { form, salvarPdfEm: 'x.pdf' })` grava o arquivo local — é o que torna possível
**olhar** o resultado, não só afirmar que ele tem `%PDF` (para ver a página: `fitz`/PyMuPDF já instalado na
máquina do Joris → `d[0].get_pixmap(dpi=110).save('x.png')`).

Anatomia do documento (medida):

```
sf:SMARTFORM
  HEADER · INTERFACE · GTYPES · GDATA · GCODING · FCODING
  VARHEADER/item (PAGEFORMAT=DINA4 · CPI · LPI · STDSTYLE=SF_STYLE_01 · PAGETREE)
    sf:NODE NODETYPE=RP                          ← raiz
      sf:SUCC/sf:item/sf:NODE NODETYPE=PA        ← página  (sf:OBJ/sf:PAGE, NEXTPAGE)
        … WI                                     ← janela  (sf:OBJ/sf:WINDOW; WTYPE M=main)
          sf:PROC_CTRL/sf:NODE ID="834 " RC      ← container da janela — **vem com ATRIBUTO**
            sf:SUCC/sf:item/sf:NODE TI           ← TEXTO   (sf:OBJ/sf:TEXT)
            … GR gráfico · SE seção · EV evento · CO código
```

⚠️ **O nó `RC` vem como `<sf:NODE ID="834 ">`.** Uma varredura que só case `<sf:NODE>` fecha a pilha no
`</sf:NODE>` dele e corta o XML no lugar errado — o `xml_upload` engole, o parse do SAP devolve
`num_errors = 1` e nada disso vira erro em lugar nenhum. `arvoreSmartForm` casa nó com atributo.

### A escada — cinco degraus, cada um com o PDF na tela

| # | O que mudou no XML | O PDF mostrou |
|---|---|---|
| 0 | cópia inteira (`copiarSmartForm`) | a fatura do IDES completa: logo, endereço, caixa "Fatura", carta, tabela, rodapé — 13.230 bytes |
| 1 | poda até `PA FIRST → WI MAIN → TI INTRODUCTION` + interface limpa + texto trocado | **uma linha**, itálico, a 2 cm da esquerda e 10 cm do topo — 1.776 bytes |
| 2 | o nó de texto clonado como irmão (`clonarNoSmartForm`) | duas linhas, uma sob a outra, na ordem do XML |
| 3 | um `TI` com quatro itens: `TH`, `AS`, `*`, `/` | título itálico, parágrafo com quebra automática na largura da janela, e as duas quebras |
| 4 | mesma coisa, janela movida para 8/3 cm e estreitada para 9 cm | o bloco inteiro andou e **re-quebrou** nas novas medidas |
| 5 | texto de 235 caracteres, fatiado pela lib | a frase inteira (no degrau 3, o mesmo texto saía cortado) |

**`TDLINE` é CHAR 132**: linha maior é gravada truncada, sem erro nenhum — o PDF do degrau 3 saiu com a
frase pela metade ("…quebrar a linha sozinh"). `trocarTextoSmartForm` fatia sozinho (`fatiarTdline`), e os
pedaços seguintes entram com `TDFORMAT *`.

### O vocabulário fechado — o que já está medido

`TDFORMAT` é o **parágrafo do Smart Style** (`STDSTYLE`, aqui `SF_STYLE_01`): é o parente do seletor CSS —
`<h1>` não vira "negrito", vira um formato do estilo. Os que o `SF_EXAMPLE_01` usa: `AS` 41 · `TH` 24 ·
`TB` 6 · `*` 4 · `/` 8.

| Elemento HTML | Nó / campo SSFO | PDF visto (degrau) |
|---|---|---|
| `<h3>` (título de seção) | `TI` com `TDFORMAT TH` | itálico monoespaçado, leve indentação (D1) |
| `<p>` | `TI` com `TDFORMAT AS` | corpo normal, quebra automática na largura da janela (D3) |
| `<br>` | outro `<item>` com `TDFORMAT /` | nova linha dentro do parágrafo (D3) |
| continuação do mesmo parágrafo | `TDFORMAT *` | **quebra a linha** — não emenda no fim da anterior (D5) |
| dois blocos em sequência | dois nós `TI` irmãos | um abaixo do outro, na ordem do XML (D2) |
| bloco posicionado (`position:absolute`) | janela `WI` + `WLEFT/WTOP/WWIDTH/WHEIGHT` (CM) no `sf:OUTATTR` | o bloco anda e re-quebra (D4) |
| célula de tabela | `SE SECTTYPE=E` dentro de `SE R` / `EV` | **construída no item 49** — a coluna é a ORDEM da célula |
| imagem | nó `GR` (`sf:GRAPHIC`, `GTYPE B`, chave BDS) | visto na cópia (o logo mySAP.com), não construído |
| campo com dado | parâmetro da `<INTERFACE>` + `&VAR&` no texto | **medido no item 48** — o valor sai no papel, e o mesmo form imprime dois |
| — | `TDLINE` CHAR 132 | acima disso o texto some sem aviso (D3 → D5) |
| — | caractere fora do device | vira `#` (o travessão `—` do D3) |

**Limite honesto do que foi provado:** o vocabulário tem hoje texto, parágrafo, quebra, sequência,
posicionamento, **campo com dado** (item 48) e **tabela** (item 49). A imagem continua sendo *cópia* do que já
existe, não *construção*.

### Uso pela lib

```js
import {
  copiarSmartForm, baixarSmartFormXml, subirSmartFormXml, apagarSmartForm, renderSmartForm,
  podarSmartForm, limparInterfaceSmartForm, trocarTextoSmartForm, clonarNoSmartForm,
  posicionarJanelaSmartForm, nosDoSmartForm,
} from 'adt-client/forms';

await copiarSmartForm(cx, { origem: 'SF_EXAMPLE_01', form: 'Y_SF_C42' });   // { ok, fm: '/1BCDWB/SF…' }
const { xml } = await baixarSmartFormXml(cx, { form: 'Y_SF_C42', salvarEm: 'clone.xml' });

let novo = podarSmartForm(xml, { manter: ['FIRST', 'MAIN', 'INTRODUCTION'] });
novo = limparInterfaceSmartForm(novo);                       // form estático: renderiza sem parâmetro
novo = trocarTextoSmartForm(novo, 'INTRODUCTION', [
  { formato: 'TH', linha: 'TITULO' },
  { formato: 'AS', linha: 'Um parágrafo do corpo.' },
]);
novo = posicionarJanelaSmartForm(novo, 'MAIN', { left: 8, top: 3, width: 9 });

await subirSmartFormXml(cx, { form: 'Y_SF_D1', xml: novo });  // apaga o homônimo, sobe, gera o FM
const pdf = await renderSmartForm(cx, { form: 'Y_SF_D1', salvarPdfEm: 'd1.pdf' });
await apagarSmartForm(cx, { form: 'Y_SF_D1', confirm: true });
```

As funções de XML são **puras** (string → string) e testadas offline sobre uma fixture recortada do
documento real; só `copiar`/`baixar`/`subir`/`apagar`/`render` tocam o sistema, cada uma com um driver em
`$TMP` apagado no `finally`.

## 📝 Markdown → Smart Form (item 46 — medido 2026-09-01, S4H 758)

O item 42 provou a metade de baixo (copiar, podar, trocar texto, gerar, renderizar). Esta é a de
cima: **quem lê o documento e decide os nós**. Módulo `markdown.mjs`, export
`adt-client/markdown`.

```js
import { publicarMarkdown } from 'adt-client/markdown';

const r = await publicarMarkdown(cx, {
  markdown: '# Fatura 4711\n\nPrezado cliente, segue o **resumo** do período.\n\n1. Consultoria\n2. Licença\n',
  form: 'Y_SF_FATURA',
  salvarPdfEm: 'fatura.pdf',
});
r.linhas;  // [{ formato:'TH', linha:'Fatura 4711' }, { formato:'AS', linha:'…<B>resumo</>…' }, …]
```

### A AST no meio, e por que ela existe

```
markdown → parseMarkdown() → AST → emitirSmartForm() → [{formato, linha}] → trocarTextoSmartForm
                                ↘ (item 43) emitirXfa() → XDP/XFA, pelo ADS
```

O parser não sabe o que é `TDFORMAT`; o emissor não sabe o que é `##`. Um conversor que cuspisse
XML de Smart Form direto faria o item 43 (Adobe) recomeçar do zero — é essa a razão de a AST
existir, e é o que faz este item ser preparação para o Adobe em vez de um beco.

### O vocabulário sai do Smart Style — leia-o ANTES de escrever conversor

`TDFORMAT` é o parágrafo do estilo, não um estilo inventável. O `SF_STYLE_01` (o que o
`SF_EXAMPLE_01` usa — conferido no `<STDSTYLE>` do XML) tem, medido em `STXSPARA`/`STXSCHAR`:

| parágrafo | fonte / tamanho | entrelinha | recuo | serve para |
|---|---|---|---|---|
| `AS` | COURIER 12 | 1,00 LN | 0 | corpo **e bloco de código** |
| `TH` | negrito + itálico | 1,00 LN | 2 MM | título |
| `N1` | herda | 12 PT (+6 PT topo) | **2 CM** | lista numerada — `TDNUMBERIN='A'`, numera sozinho |
| `TB` | herda | 1,00 LN | **2 MM** | bloco "indentado" — o recuo é imperceptível |
| `C` | herda, centralizado | 1,00 LN | 0 | (não usado ainda) |
| `UL` | COURIER 12 | **0,50 LN** | 0 | ⚠ **sobrepõe a linha anterior** — inútil para bloco |

| caractere | efeito | usado em |
|---|---|---|
| `B` | negrito | `**forte**` |
| `I` | itálico | `_ênfase_` |
| `S` | HELVE 8 (menor) | `` `código` `` |

**A boa notícia do degrau 0:** ênfase inline e lista numerada **já existem**. Não foi preciso criar
Smart Style — o que teria batido no `SSST` "só GUI" da cobertura e virado um item inteiro.

### As tags de formatação FUNCIONAM

`<B>negrito</>` dentro do `TDLINE` sai **negrito** no PDF, e a tag **some** do texto: o Smart Form
a interpreta, não a imprime. O mesmo para `<I>` e `<S>`. É a forma do SAPscript: abre com o código
do formato de caractere, fecha com `</>`.

### ⚠ O device é Latin-1 — acima de U+00FF sai `#`, em silêncio

Medido com 13 caracteres num PDF só:

| passam | viram `#` |
|---|---|
| `-` `*` `o` `+` `.` `=` `_` `>` e `·` (U+00B7) | `•` (U+2022) · `─` (U+2500) · `—` (U+2014) · `◆` (U+25C6) |

É a mesma armadilha do travessão no item 42, agora com a regra isolada: **o corte é U+00FF**.
Acentuação portuguesa é Latin-1 e passa intacta (`ação, coração, ÊNFASE`). Por isso o marcador e a
régua da lib são ASCII, e por isso `paraLatin1` **recusa** o que não tem equivalente, com o code
point na mensagem — os trocáveis comuns de editor moderno (`—`, `“ ”`, `…`, `→`) são transliterados;
`transliterar: false` recusa tudo.

### O que o PDF olhado pegou e o `contemTexto` não

Duas vezes neste item o assert de texto passou verde com o papel errado:

1. **`•` e `─` viraram `#`** — `contemTexto` não procura o que não deveria estar lá.
2. **A primeira linha do bloco de código SOBREPÔS a última da lista**, porque o `UL` tem entrelinha
   de meia linha. O texto estava no PDF (teste verde), um por cima do outro. Trocado para `AS`.

É o argumento da **I50** (assert visual de PDF) ganhando um segundo caso concreto.

### Vocabulário FECHADO: fora dele é erro duro

`parseMarkdown` recusa, com a **linha** e o porquê: imagem embutida, link, citação (`>`), tabela
(`|`) e HTML embutido. Nenhum deles tem parágrafo ou nó construível hoje — tabela e imagem existem
no SSFO só como *cópia*, nunca *construção* (item 42). Um documento que imprime diferente do que o
autor viu é pior que um que recusa.

### O que ficou fora

- **Recuo da lista com marcador**: não sai. Nem pelo parágrafo (`TB` = 2 MM) nem por espaço à
  esquerda (comido). Ficaria com um Smart Style próprio — que é o beco do SSST.
- **Níveis de título**: `#`, `##` e `###` mapeiam todos para `TH` — o estilo só tem um.
- **Quebra de página, cabeçalho e rodapé**: o documento inteiro vai num nó de texto da janela MAIN.
- **Campo com dado** era desta lista — saiu no degrau 1, abaixo.

## 🔤 Degrau 1: campo com dado (item 48 — medido 2026-09-01, S4H 758, E2E 23/23)

O que separa "documento impresso" de "formulário": uma fatura precisa do número da fatura.

```js
import { publicarMarkdown, imprimirMarkdown } from 'adt-client/markdown';

const r = await publicarMarkdown(cx, {
  markdown: '# Fatura {{NUMERO}}\n\nPrezado **{{CLIENTE}}**…',
  form: 'Y_SF_FATURA',
  variaveis: { NUMERO: '4711', CLIENTE: 'ACME Industria Ltda' },
  salvarPdfEm: 'a.pdf',
});
r.variaveis;   // ['NUMERO', 'CLIENTE'] — o documento é quem manda

// o MESMO form, outros valores, sem republicar nada:
await imprimirMarkdown(cx, { form: 'Y_SF_FATURA', variaveis: { NUMERO: '9902', CLIENTE: 'GLOBEX SA' }, salvarPdfEm: 'b.pdf' });
```

As três peças, e onde cada uma foi medida:

| peça | o que é | medido |
|---|---|---|
| `{{NOME}}` no Markdown | nó `variavel` na AST → `&NOME&` no `TDLINE` | o Smart Form **substitui**: o PDF traz `Fatura 4711`, não `Fatura &NUMERO&` |
| `acrescentarInterfaceSmartForm` | o **oposto** do `limparInterfaceSmartForm`: `<item><IOTYPE>I</IOTYPE><NAME>NUMERO</NAME><TYPING>TYPE</TYPING><TYPENAME>STRING</TYPENAME><BYVALUE>X</BYVALUE></item>` no fim da `<INTERFACE>` | o FM gerado ganha o parâmetro: `FUPARAREF` = `I:NUMERO:STRING` (4/4) |
| `prepararVariaveis` | valor → `DATA`/atribuição/`exporting` do driver | dois PDFs do mesmo form (`4711 ACME` × `9902 GLOBEX`), mesmo `/1BCDWB/SF…` |

**Sem `<STANDARD>X</STANDARD>`** — é essa marca que distingue o que é do Smart Form (control_parameters,
output_options, as quatro exceções) do que é do FORM. Se o parâmetro nascesse com ela, o
`limparInterfaceSmartForm` o levaria embora na publicação seguinte.

### As duas pontas que reclamam — e por que a lib recusa antes da rede

| situação | quem reclama | mensagem |
|---|---|---|
| `{{X}}` no texto sem valor em `variaveis` | **a lib**, antes de criar objeto no SAP | "o documento usa {{X}} mas nenhum valor foi passado" |
| campo `&X&` no texto **sem parâmetro na interface** (o que aconteceria sem o guard-rail) | **a geração do FM**, tarde e MUDO | `FB_GENERATE_FORM` subrc **5**, "Erro ao gerar formulário Y_SF_…" — não diz qual campo |
| parâmetro na interface e valor não passado no CALL | o **runtime** (`CX_SY_DYN_CALL_PARAM_MISSING`) | "O parâmetro obrigatório CLIENTE não está preenchido" |

É a razão de o erro ser duro e cedo: a ponta do servidor sabe que falhou, mas não sabe dizer por quê.

### ⚠ O canal ASCII do assert escapa o `&`; o papel não

Terceira vez que o `contemTexto` engana neste caminho — e a primeira ao CONTRÁRIO (falso negativo).
Medido com quatro linhas num PDF só:

| escrito no TDLINE | `CONVERT_OTF` ASCII (o assert) | PDF (o papel) |
|---|---|---|
| `P&D` | `P&amp;D` | **`P&D`** |
| `P&&D` | `P&amp;&amp;D` | **`P&&D`** |
| `menor < maior >` | `menor < maior >` | `menor < maior >` |

Só o `&` é escapado, e só no canal de texto. `contemTexto` passou a desescapar `&amp;` — sem isso, um
documento correto reprova. O `<`/`>` do XML continua sendo assunto do `trocarTextoSmartForm`, que
escapa na gravação e o parser do SSFO desescapa (é por isso que `<B>x</>` sai negrito).

### Limites deste degrau

- **um tipo só, `STRING`, sem formatação** neste degrau — número, data e moeda formatados (`&VAR(10CR)&`)
  são o item 66, logo abaixo;
- **valor até 200 caracteres** — acima disso não cabe na linha do fonte do driver (o ABAP corta em
  255); recusado com o número na mensagem;
- **o valor também é Latin-1**: passa pelo `paraLatin1`, com a mesma transliteração do texto;
- `imprimirMarkdown` exige as MESMAS variáveis do documento — ele não lê o form para descobri-las
  (`parametrosDaInterface(xml)` faz isso, se um dia for preciso).

## 🔢 Campo FORMATADO — `{{NOME:FMT}}` e tipo real (item 66 — I66 — medido 2026-09-02, S4H 758, mandante 250)

O degrau 1 só media `STRING`: quem queria valor numérico alinhado passava a string já formatada em
JS, e o form imprimia texto, não número. `prepararVariaveis` já aceitava `tipo`, mas nada além de
`STRING` tinha sido medido — e a forma `&VAR(10CR)&` do `SF_EXAMPLE_01` (largura + opções) não tinha
sintaxe nenhuma no Markdown.

### A sintaxe: `:` depois do nome

```
Total: {{TOTAL:10CR}}
```

`variavelDeInline` (`markdown.mjs`) separa pelo `:`: o que vem antes é o nome de sempre
(`nomeDeVariavel`), o que vem depois é `formatoDeVariavel` — `LARGURA[.CASAS][opções]`, as opções
vindas de `C R T Z` (a gramática medida no `SF_EXAMPLE_01`, item 46). Sem `:`, o nó nasce idêntico ao
de antes do item 66 (sem a chave `formato`) — retrocompatível de propósito. O emissor (`textoDoInline`/
`inlineParaTdline`) só acrescenta `(FMT)` quando ele existe: `&TOTAL(10CR)&`. A mesma sintaxe vale para
campo de SISTEMA (`{{PAGINA:3Z}}` → `&SFSY-PAGE(3Z)&`) — é o mesmo mecanismo, sem caso especial.

`prepararVariaveis` não mudou: `tipo` já virava `DATA lv TYPE <tipo>.` + atribuição do literal — o que
faltava medir era se isso REALMENTE produz um campo numérico que o `(FMT)` sabe formatar, e é isso que
este item mediu.

### A medição — um documento, quatro campos, `Y_SF_MD66POC` em `$TMP`

```js
await publicarMarkdown(cx, {
  markdown: 'Total: {{TOTAL:10CR}}\nEstreito: {{ESTREITO:5}}\nData: {{DTA:10}}\nQuantidade: {{QTD:8.3}}\nSem formato: {{PADRAO}}\n',
  form: 'Y_SF_MD66POC',
  variaveis: {
    TOTAL: { valor: '1234.56', tipo: 'WERTV8' },       // CURR, 2 casas
    ESTREITO: { valor: '123456.78', tipo: 'WERTV8' },  // largura 5, valor bem maior — contra-prova
    DTA: { valor: '20260902', tipo: 'DATS' },          // data, built-in
    QTD: { valor: '5.500', tipo: 'MENGV13' },          // QUAN, 3 casas
    PADRAO: { valor: 'controle', tipo: 'STRING' },     // baseline do item 48, sem `:` no Markdown
  },
});
```

PDF (2.307 bytes) e ASCII bateram, byte a byte:

```
Total:   1.234,56 Estreito: *6,78 Data: 02.09.2026 Quantidade: 5,500  Sem formato: controle
```

| campo | tipo | valor ABAP | formato | saiu | o que prova |
|---|---|---|---|---|---|
| `TOTAL` | `WERTV8` (CURR) | `1234.56` | `10CR` | `1.234,56` | separador de milhar `.` e decimal `,` — moeda de verdade, não texto |
| `ESTREITO` | `WERTV8` | `123456.78` | `5` (sem opção) | `*6,78` | **largura menor que o valor: SAP NÃO trunca calado** — troca os dígitos que não cabem por `*` à esquerda, mantendo as casas decimais; a saída tem exatamente 5 caracteres |
| `DTA` | `DATS` | `20260902` | `10` | `02.09.2026` | data no formato do usuário (`DD.MM.AAAA`), sem parâmetro nenhum de formatação de data |
| `QTD` | `MENGV13` (QUAN) | `5.500` | `8.3` | `5,500` | quantidade com as 3 casas decimais pedidas, vírgula decimal |
| `PADRAO` | `STRING` | `controle` | — | `controle` | baseline do item 48 intacta — `{{NOME}}` sem `:` não muda de comportamento |

### O que a `C`/`R` do `10CR` realmente fizeram

`TOTAL` saiu `  1.234,56` (dois espaços antes, dentro da largura 10: `1.234,56` tem 8 caracteres) —
**alinhado à direita** (`R`) dentro do campo; o `C` (comprime espaços) é o que evita um padding maior
ainda por zeros/brancos à esquerda do próprio número. Consistente com o cabeçalho do arquivo (medido
no `SF_EXAMPLE_01`, item 46): `C` comprime, `R` alinha à direita.

### A moeda/decimal segue o KERNEL, não o USR01 deste usuário

`readTable(cfg, 'USR01', { campos: ['DCPFM'], where: ["BNAME = '<usuário>'"] })` devolveu `DCPFM`
**vazio** para o usuário da medição — ou seja, o separador `,`/`.` que saiu no PDF **não veio de uma
preferência pessoal** (USR01-DCPFM em branco = "usa o formato-padrão"), veio do default do
kernel/mandante. A pergunta original ("segue o mandante ou o `docparams`?") fica parcialmente
respondida: comprovadamente NÃO é override de USR01 neste usuário; se é T005/mandante ou um default
fixo do kernel independente de configuração não foi isolado — exigiria comparar dois usuários com
DCPFM setado diferente, o que é uma medição própria (fica como ponto aberto, não bloqueia o item).

### Limites deste degrau

- a gramática do formato (`LARGURA[.CASAS][C R T Z]`) é validada no CLIENTE antes da rede — opção fora
  de `C R T Z` é erro duro com a mensagem completa, mas o vocabulário É o do SAPscript, então não há
  "opção inexistente que a SAP aceitasse e a lib recusasse" para medir por contra-prova: a gramática da
  lib É a gramática que o `SF_EXAMPLE_01` usa;
- `tipo` continua sendo o nome do tipo ABAP cru (`DATA lv TYPE <tipo>.`) — a lib não valida se ele
  existe na DDIC; um `tipo` inventado só falha tarde, na geração do driver (mesma fronteira do item 48);
- overflow (`*`) foi medido só para CURR — DATS/QUAN com largura menor que o valor não foram medidos
  neste item.

## 📊 Degrau 2: TABELA (item 49 — medido 2026-09-01, S4H 758, E2E 21/21)

`| a | b |` era **erro duro** desde o item 46, com o argumento de que a seção de tabela do SSFO só
existia como cópia. Caiu: **a tabela ESTÁTICA existe**, e a lib a constrói.

```js
await publicarMarkdown(cx, {
  form: 'Y_SF_PEDIDO',
  markdown: `# Pedido de compra

| Item | Descricao | Qtd | Valor |
| --- | --- | :---: | --- |
| 10 | Parafuso sextavado M8 | 100 | 45,00 |
| 20 | Porca M8 | 100 | 12,50 |

Total: 57,50.`,
  salvarPdfEm: 'pedido.pdf',
});
```

### A anatomia: `SECTTYPE` é quem decide o papel do nó

O risco que o item nomeou — "se a seção de tabela for inseparável do loop, o degrau estático não
existe" — **não se realizou**. O loop mora em campos OPCIONAIS da tabela:

```
SE SECTTYPE=C   a TABELA        DYNLINES (tipos de linha) · CELLS (largura por tipo × coluna) · OTABTYPE
  EV EVTYPE=H     cabeçalho     ┐ o EVENTO é onde a linha entra no papel
  EV EVTYPE=B     corpo         ├ (no molde: H=cabeçalho, B=principal, F=rodapé)
  EV EVTYPE=F     rodapé        ┘
    SE SECTTYPE=R   a LINHA     sf:OUTATTR/T_LINETYPE aponta o tipo de linha do DYNLINES
      SE SECTTYPE=E   a CÉLULA  **a coluna é a ORDEM entre as irmãs** — não há campo de coluna
        TI              o texto
SE SECTTYPE=L   o LOOP          DATATYPE=L + TABNAME/TABHTYPE/TABHEADER — o que a tabela NÃO precisa ter
```

No `SF_EXAMPLE_01` a tabela `TABLE` tem `DATATYPE L` + `TABNAME BOOKINGS`; tirando esses campos e
pondo as linhas no XML, ela imprime o que está escrito. É todo o degrau.

### ⚠️ `OTABTYPE`: o campo que falta cobra em dois lugares diferentes

Bisseção a partir de uma tabela que renderiza (uma variável por rodada, PDF por rodada):

| variante | resultado |
|---|---|
| sem `<OTABTYPE>` | o form **GERA** (`FB_GENERATE_FORM` subrc 0) e o **RUNTIME** recusa: subrc 2, *"Definição de tabela TBL_POC não conhecida"* |
| sem `<OTABHEADER>` | tudo responde ok e **o cabeçalho NÃO SAI NO PAPEL** — o evento `H` é ignorado em silêncio |
| sem `<PATTERN>` | PDF idêntico — **dispensável** |
| sem `<T_TEXT>` no `TI` da célula | PDF idêntico — **dispensável** (o texto do papel sai do `<TEXT>`) |
| sem `<BORDERS>` nas `CELLS` | tabela sem filete nenhum (61 → 42 linhas de OTF) |

O primeiro é o erro clássico deste caminho: **a geração não valida a tabela, o runtime valida.** O
segundo é pior, porque não erra: é o quarto caso nesta receita em que só o **PDF olhado** pega.

### ⚠️ A borda de TOPO da primeira linha invade o parágrafo anterior

Com `CTOP USED=X` — a forma do molde — o filete superior da linha de cabeçalho **cortou a última
linha do texto de cima** no papel. Por isso o padrão da lib é `borda: 'baixo'` (só `CBOTTOM`), que
desenha um filete sob cada linha e não encosta no que veio antes. `'caixa'` e `'nenhuma'` existem
para quem quiser o resto. `<SB>` (espaço antes) no nó da tabela **não** resolveu — foi medido.

### O que o Markdown decide, o que a lib decide

| decisão | quem | como |
|---|---|---|
| colunas e alinhamento | o autor | `\| --- \| :---: \|` |
| **largura** de cada coluna | a lib | `larguraDasColunas`: proporcional ao texto impresso, mínimo 1,5 cm, somando 16 cm (a janela MAIN) |
| formato da célula | o estilo | cabeçalho `TH`, corpo `AS`, centro `C` |
| onde a tabela entra | a ordem do documento | um nó por bloco, pendurado na MAIN em sequência |

**Alinhamento à DIREITA é erro duro.** Medido na STXSPARA do `SF_STYLE_01` (`TDPJUSTIFY`): `AS`,
`N1`, `TB`, `TH`, `UL` = `LEFT`, `C` = `CENTER` — **nenhum** `RIGHT`. Sair alinhado à esquerda
calado seria o pior desfecho; o item 52 (Smart Style próprio) é quem destrava.

### O emissor passou a devolver BLOCOS

A tabela não é linha de TDLINE — é nó. Então:

```js
emitirBlocosSmartForm(ast) // → [{ tipo:'texto', linhas }, { tipo:'tabela', colunas, cabecalho, linhas }, …]
emitirSmartForm(ast)       // segue valendo para documento SEM tabela; com tabela, lança apontando o outro
```

`publicarMarkdown` põe o **primeiro** bloco de texto no nó do molde (`INTRODUCTION`, que é a âncora
da inserção e não pode ser podado) e constrói os demais com `xmlTextoSmartForm` /
`xmlTabelaSmartForm` + `inserirNoSmartForm`. Documento que COMEÇA por tabela deixa uma linha vazia
no topo — o preço de manter a âncora.

### O que o PDF mostrou (e o `contemTexto` não mostraria)

- filete sob o cabeçalho e sob cada linha, sem encostar no parágrafo de cima;
- colunas proporcionais ao conteúdo (`Descricao` larga, `Item` estreita), na ordem certa;
- célula longa **quebra dentro da coluna** e a linha inteira cresce em altura, com as vizinhas
  alinhadas ao topo e o filete descendo junto;
- `C` centraliza **dentro da célula**, não na janela;
- dois PDFs do MESMO form com tabelas de conteúdo diferente (`{{VAR}}` dentro de célula + `imprimirMarkdown`).

### Limites deste degrau

- **célula acima de 132 caracteres** ganha uma quebra dura a mais: o `TDLINE` é CHAR 132 e o pedaço
  seguinte entra com `TDFORMAT *`, que quebra a linha em vez de emendar (item 42);
- **tabela DINÂMICA** (loop sobre tabela interna) fica fora: o Markdown não tem como dizer "itere
  sobre `LT_ITENS`" — o vocabulário é de documento, não de programa;
- **sem alinhamento vertical** — não tem sintaxe em Markdown, e não foi medido;
- **rodapé, mesclagem e cor de fundo existem** desde o item 63 (abaixo), mas só pelo CHAMADOR
  (`xmlTabelaSmartForm`) — nenhum `|` do Markdown pede nada disso, o vocabulário de tabela do
  documento continua o mesmo;
- **largura fixa em 16 cm**: é a janela MAIN do molde; muda pelo `estilo.larguraTabela`, mas
  posicionar/estreitar a janela continua sendo `posicionarJanelaSmartForm`.

## 🎨 Acabamento de tabela: SHADING, mesclagem e rodapé (item 63 — I84 — medido 2026-09-01, S4H 758, 621/621)

Os três "sem" do degrau 2 fecharam — mas o primeiro palpite (o campo `SHADING`) estava errado, e foi
medição, não leitura de schema, que corrigiu.

### ⚠️ `SHADING` (o campo isolado de `CELLS`/`DYNLINES`) é inerte

Bisseção: uma tabela com 4 linhas, `SHADING` em 000/030/060/100, uma por linha — **nenhuma pintou**
no PDF. Quem pinta é `BORDERS/item` `INTENSITY` (0–100) + `FILLCOLOR` — o par que já existia em
`bordaCelula`, sempre hardcoded em `000`/preto. Com `INTENSITY` variando (030/060/100, mesma
`FILLCOLOR` preta) as três linhas saíram cinza-claro, cinza-escuro e **preto sólido — o texto
desaparece dentro da própria pintura, em silêncio** (sem erro, sem aviso: só o PDF olhado pega).
Contraprova: `INTENSITY` pinta a célula INTEIRA mesmo com a borda só de BAIXO (`borda: 'baixo'`, o
padrão da lib desde o item 49) — não precisa da caixa fechada (`borda: 'caixa'`), então o novo
`sombreado` não reabre o bug do item 49 (filete de topo invadindo o parágrafo anterior).

### Mesclagem: não existe campo — existe um `T_LINETYPE` com menos colunas

A anatomia não tem `COLSPAN`/`ROWSPAN`. A célula mesclada sai de uma linha usando um tipo de linha
PRÓPRIO cujo `CELLS` tem uma entrada a menos que o normal, com a largura das colunas que ela substitui
SOMADA (ex.: 3 colunas de 4/8/4 cm → um rodapé com 2 "colunas" de 4/12 cm). Medido: a célula larga
ocupa exatamente o espaço das duas colunas originais, sem sobra nem sobreposição — a coluna seguinte
da tabela (a borda direita da célula mesclada) alinha com a borda direita da ÚLTIMA coluna substituída.
`xmlTabelaSmartForm` gera esse `T_LINETYPE` sozinho (`LTX1`, `LTX2`, …) quando uma célula pede
`colspan`, e reaproveita o mesmo tipo entre linhas com o MESMO desenho (dedup por largura × sombreado).

### `EVTYPE F` (rodapé) não repete por página — `EVTYPE H` (cabeçalho) repete

Medido forçando 2 páginas (45 linhas de enchimento): o cabeçalho (`OTABHEADER='A'`) saiu no TOPO das
DUAS páginas; o rodapé (`OTABFOOTER='E'`) saiu **uma vez só, no fim real da tabela** (página 2). `A` e
`E` já estavam na lib desde o item 49 (sem essa leitura) — dá pra ler como "All pages" × "End". Para
uma linha de TOTAIS isso é o comportamento CERTO (não faz sentido "Total:" no meio da tabela); um
rodapé que precisasse repetir por página (tipo "continua…") não foi medido — outro valor de
`OTABFOOTER`, ou nenhum, dependendo do que o SAP aceitar ali.

### A superfície: o chamador configura, o Markdown não pede

Mesma régua do degrau 2 ("o que o Markdown decide, o que a lib decide"): não existe sintaxe de `| a |
b |` para cor de fundo, célula mesclada ou "isto é o rodapé" — por isso os três entraram só em
`xmlTabelaSmartForm`, não no emissor de Markdown:

```js
xmlTabelaSmartForm({
  iname: 'TBL1', colunas: [4, 8, 4],
  cabecalho: ['Item', 'Descrição', 'Valor'],
  linhas: [
    ['10', 'Parafuso M8', '45,00'],
    [{ conteudo: '20', sombreado: 15 }, { conteudo: 'Porca M8', sombreado: 15 }, { conteudo: '12,50', sombreado: 15 }],
  ],
  rodape: [{ conteudo: 'Total:' }, { conteudo: '57,50', colspan: 2 }],
});
```

Uma célula continua aceitando string/`{ formato, linha }`/array (como sempre); o wrapper `{ conteudo,
colspan, sombreado }` só entra quando a célula PRECISA de um dos dois — sem ele, a tabela gera o MESMO
XML de antes do item 63, byte a byte (os 48 testes do degrau 2 continuam verdes sem alteração).

## 📄 Degrau 3: PÁGINAS, cabeçalho e rodapé (item 50 — medido 2026-09-01, S4H 758, E2E 24/24)

O degrau em que o documento deixa de caber num nó só — e o que descobriu que ele **nunca coubera**:
todo documento publicado até aqui quebrava se passasse de uma página.

### O erro que estava esperando o primeiro documento longo

```
SF_CALL subrc=2  "Nenhuma página seguinte definida"     ← zero OTF, zero PDF
```

O molde manda `FIRST → NEXT`, e a poda (`manter: ['FIRST','MAIN','INTRODUCTION']`) leva a página
`NEXT` embora: a `FIRST` fica apontando para o que não existe. **Enquanto o texto coube, ninguém
viu.** Um `# título` com 45 parágrafos bastou para o documento não sair.

A correção é uma linha, e vale para TODO documento — `publicarMarkdown` a aplica sempre:

```js
apontarProximaPagina(xml, { pagina: 'FIRST', proxima: 'FIRST' });  // a página aponta para SI MESMA
```

Medido: **9 páginas** de um nó de texto só, `subrc 0`. Não é preciso construir a página seguinte — o
SAP repete a mesma página, com as janelas que ela tem. É isso que faz cabeçalho e rodapé aparecerem
em todas elas.

### Anatomia da janela — o conteúdo NÃO fica no `sf:SUCC` dela

```
sf:NODE WI
  sf:OBJ/sf:WINDOW ID="7719 "   ← NAME/INAME · CAPTION · WTYPE
    sf:PROC_CTRL/sf:NODE RC     ← M principal · T secundária · G gráfico · L numeração
      sf:SUCC/sf:item/…         ← ⚠️ o conteúdo mora AQUI
  sf:OUTATTR/sf:OUTATTR         ← WLEFT/WWIDTH/WTOP/WHEIGHT + unidade
  sf:SUCC/                      ← vazio
```

⚠️ **`ID`/`IDREF` são do SAP.** A página `NEXT` do molde não repete as janelas — ela as
**referencia** (`<sf:WINDOW IDREF="786 "/>`) com um `sf:OUTATTR` próprio. Janela construída por
`xmlJanelaSmartForm` nasce SEM `ID` e por isso não é referenciável; com a página apontando para si
mesma isso não custa nada. (`clonarNoSmartForm` já removia o `ID` do clone — mesma razão.)

### Numeração: campo de sistema, não parâmetro

`&SFSY-PAGE&` e `&SFSY-FORMPAGES&` num `TDLINE` de janela construída imprimem **"Pagina 1 de 3"**,
**"Pagina 2 de 3"**… sem nada na `<INTERFACE>`. No Markdown eles têm nome próprio:

| no documento | vira | quem preenche |
|---|---|---|
| `{{PAGINA}}` | `&SFSY-PAGE&` | o Smart Form |
| `{{PAGINAS}}` | `&SFSY-FORMPAGES&` | o Smart Form |
| `{{DATA}}` / `{{HORA}}` | `&SY-DATUM&` / `&SY-UZEIT&` | o runtime ABAP |
| `{{QUALQUER_OUTRO}}` | `&QUALQUER_OUTRO&` | **o chamador** — vira parâmetro de import (degrau 1) |

`variaveisDoMarkdown` deixa os campos de sistema de fora: pedir valor para eles seria pedir o que
ninguém tem como dar.

### Front-matter — a identidade do documento

```markdown
---
titulo: Relatorio mensal
cabecalho: Relatorio mensal - {{EMPRESA}}
rodape: Pagina {{PAGINA}} de {{PAGINAS}} - {{DATA}}
formato: letter
orientacao: paisagem
margem: 2.5
---
# Vendas do mes
```

| chave | efeito | onde |
|---|---|---|
| `titulo` | descrição do form | `<CAPTION>` do `HEADER` |
| `cabecalho` | janela repetida no topo de toda página | `WI` construída, `WTYPE T` |
| `rodape` | idem, no pé | idem |
| `logo` | o timbre: `NOME` ou `NOME alinhamento` (item 67) | nó `GR` dentro da janela do cabeçalho |
| `formato` | `DINA4` (padrão) · `DINA5` · `DINA3` · `LETTER` · `LEGAL` | `<PAGEFORMAT>` do VARHEADER |
| `orientacao` | `retrato` (padrão) · `paisagem` | `<PAGEORTN>` do nó `PA` |
| `margem` | CM nas quatro bordas (padrão **2,5**) | a geometria das janelas |

Chave desconhecida, linha torta, chave repetida, formato inventado e margem que não cabe são **erro
duro antes da rede** — medido: três documentos recusados, zero forms criados no sistema.

⚠️ **`---` é front-matter E régua horizontal.** A ambiguidade é real e a posição sozinha não a
resolve — um documento pode começar por uma régua. A regra tem TRÊS partes: primeira linha, bloco
**fechado** por outro `---`, e forma `chave: valor` na primeira linha de dentro. Falhando qualquer
uma, aquilo é régua e o documento segue inteiro (`markdownParaSmartForm('---\n')` continua
imprimindo a régua, como antes do item 50).

### A geometria, e a margem que não foi escolhida por gosto

`geometriaDoDocumento(layout, { cabecalho, rodape })` é PURA e devolve as quatro janelas em CM:

```
A4 21 × 29,7, margem 2,5, com cabeçalho e rodapé:
  cabecalho  left 2,5  top  2,5   width 16  height 1,2
  main       left 2,5  top  4,0   width 16  height 21,7     ← 2,5 + 1,2 + 0,3 de folga
  rodape     left 2,5  top 26,0   width 16  height 1,2
```

**A margem padrão é 2,5 cm porque em A4 ela deixa a área útil em exatamente 16 cm** — a mesma
`estilo.larguraTabela` do degrau 2, que é a largura da janela MAIN do molde. Margem diferente sem
mexer na tabela faz a tabela desencostar de uma das bordas.

⚠️ **Mudança de comportamento visível**: a janela MAIN deixou de ficar onde o molde de carta do IDES
a punha (`WTOP` 10 cm) e passou a ocupar a área útil. Os PDFs dos degraus 0–2 mudam de aparência —
o documento começa no topo, e não a um terço da página.

### O que o PDF olhado mostrou

- cabeçalho e rodapé nas **três** páginas, com a numeração certa em cada uma;
- **a tabela atravessa a quebra de página e o SAP REPETE O CABEÇALHO DELA** na página seguinte — de
  graça, pelo `OTABHEADER A` que o degrau 2 já punha; o texto que vem depois da tabela sai depois;
- `LETTER` deitado muda o papel de verdade: `27,9 × 21,5 cm` no PDF contra `27,94 × 21,59` da conta
  da lib (a diferença é o arredondamento do mediabox);
- o `·` (U+00B7) do rodapé passou intacto e o `—` (U+2014) do cabeçalho saiu como `-`: o texto do
  front-matter passa pelo mesmo `paraLatin1` do corpo. Na POC, montando o `TDLINE` à mão sem ele, o
  mesmo travessão saiu `#` no papel — a armadilha do device vale para cabeçalho e rodapé também.

### Limites deste degrau

- **uma página só se repetindo**: não há "primeira página diferente" (capa, carta com timbre). O
  molde tem `FIRST` e `NEXT` distintas e a lib usa uma; layout por página exigiria construir o nó
  `PA` e resolver o `IDREF` da MAIN — não medido;
- **quebra de página explícita** (o `\pagebreak` do Markdown) não existe: quem quebra é o
  transbordo. O nó `CO`/comando com `NEXTPAGE` está no molde e não foi construído;
- **cabeçalho/rodapé são uma linha de texto** — sem tabela, sem várias linhas; o **cabeçalho** ganhou
  imagem (`logo`, item 67) — o **rodapé** segue só texto;
- **altura de cabeçalho/rodapé é fixa** (1,2 cm, `LAYOUT_PADRAO`) só enquanto for TEXTO. ⚠️
  **Desmentido no item 67**: a `WHEIGHT` da janela não recorta nada — ver a seção do timbre logo
  abaixo. O que continua não medido é texto de MAIS de uma linha estourando o parágrafo;
- `NUMB_MODE`/`NUMB_TYPE` (reiniciar a contagem, romanos) ficam como estão no molde.

## 🎫 Timbre: gráfico no cabeçalho (item 67 — I70 — medido 2026-09-02, S4H 758, mandante 250)

Cobaias `Y_SF_I70*` (forms) e `Y_SF_I70_BAIXO`/`Y_SF_I70_ALTO`/`Y_SF_I70E_LOGO` (gráficos sintéticos,
gerados em memória — BMP 24-bit sem compressão, com o DPI declarado no header) em `$TMP`/BDS, **todas
apagadas** ao final (STXBITMAPS e SSFO conferidas por `graficoInfo`/tentativa de leitura). A pergunta
do item 51 ("timbre no alto de toda página") tinha DUAS hipóteses — a `GR` funcionar dentro da janela
`T` de cabeçalho, e a altura fixa de 1,2 cm cortar o gráfico — e a segunda saiu **desmentida**.

### O desmentido: a janela não recorta nada

`xmlJanelaSmartForm` já aceitava qualquer nó em `filhos` — hangar um `GR` ao lado do `TI` do
cabeçalho não pedia XML novo, só ordem certa. O que a POC mediu (raw XML, `Y_SF_I70T1..T7`) foi outra
coisa: **a `WHEIGHT` declarada na janela é cosmética — ela não recorta nem redimensiona o que está
dentro**, do mesmo jeito que o `GR` já não se posicionava sozinho dentro da MAIN (item 51). Um gráfico
de 4,57 cm dentro de uma janela declarada com 1,2 cm imprimiu os 4,57 cm **inteiros**, avançando por
cima da janela seguinte — no caso, a MAIN, cujo texto ficou parcialmente ilegível atrás do gráfico
(`Y_SF_I70T2`/`T3`, mesmo resultado com a janela em 1,2 cm e em 4,57 cm — a altura declarada não fez
NENHUMA diferença no papel). **O que evita a invasão não é a altura da janela do cabeçalho — é a
posição em que a MAIN começa.** Reposicionando a MAIN para `2,5 + alturaReal do logo + folga`
(`Y_SF_I70T5`), o corpo saiu limpo, sem sobreposição — e o mesmo com corpo longo o bastante para duas
páginas (`Y_SF_I70T6`): o cabeçalho (com o logo) repetiu nas DUAS, a MAIN nunca invadida.

Texto e logo **convivem na mesma janela**, empilhados na ordem do XML — o texto primeiro, com a
mesma quebra `TDFORMAT /` que o item 51 já usava para o `GR` não subir sobre a última linha
(`Y_SF_I70T4`/`T7`): a altura segura medida foi `1,2 cm (texto, a mesma do item 50) + 0,3 cm de folga
+ altura real do logo`.

### O vocabulário: `logo` no front-matter

```markdown
---
cabecalho: ACME Ltda — {{EMPRESA}}
logo: ZLOGO_ACME centro
---
# Relatório
```

`logo: NOME` ou `logo: NOME alinhamento` (`esquerda` padrão, `centro`, `direita` — o mesmo vocabulário
de `![alt](NOME "alinhamento")`). O NOME é o mesmo canal da imagem no corpo — `graficoInfo` confere a
existência **antes** de criar o form (o erro do runtime não diz qual gráfico faltou, item 51), e
`imagens` sobe o arquivo no mesmo passo se precisar: `{ imagens: { ZLOGO_ACME: 'logo.bmp' } }`.

`geometriaDoDocumento` ganhou `logoAlturaCm`: com `logo` e sem `cabecalho` (texto), a altura da janela
passa a ser a do gráfico (`graficoInfo(...).alturaCm`) — o **timbre puro**, o caso do item 51 que
faltava. Com os dois juntos, soma-se o texto (1,2 cm) + a folga + o logo. Sem `logo`, o comportamento
é **idêntico** ao do item 50 (1,2 cm fixo) — retrocompatível, testado (`markdown.test.mjs`).

E2E pela lib (`publicarMarkdown`, LOCAL, sem escrever XML à mão): logo sozinho, centralizado, sem
sobrepor o corpo; cabeçalho de texto + logo + rodapé com `{{PAGINA}}`, corpo de 50 linhas forçando
duas páginas — o timbre repetiu nas duas, `{{EMPRESA}}` interpolou, nada sobreposto. Confirma a
pergunta do item: "parecer do cliente" (a frase que abriu o item 51) se resolve inteira pelo
documento.

### Limites deste degrau

- **só no cabeçalho** — o rodapé continua só texto (não medido; a mecânica seria a mesma);
- **sem tabela na mesma janela** — texto e logo, só os dois tipos de nó já usados no corpo;
- a altura do texto no caso combinado é a constante de 1,2 cm do item 50 (não recalculada por
  parágrafo/estilo) — um Smart Style com título muito maior que isso ainda não foi medido aqui;
- o que vale para a imagem SOLTA (item 51) segue valendo: só BMP/TIFF, sem redimensionar por
  parâmetro (o tamanho vem do DPI do arquivo), sem legenda.

## 🖼️ Degrau 4: IMAGEM (item 51 — medido 2026-09-01, S4H 758, E2E pela lib LOCAL 26/26)

Cobaias `Y_SF_MD51*` (forms) e `YJBV_POC_G51*` (gráficos) em `$TMP`/BDS, **todas apagadas** ao final
(STXFADM e STXBITMAPS vazias, conferidas em outra LUW). O degrau tinha dois níveis de custo e **os
dois saíram**: o nó por referência, e a imagem NOVA entrando no sistema sem GUI.

### O nó `GR`, construído

```
sf:NODE GR
  sf:OBJ/sf:GRAPHIC  NAME/INAME · CAPTION · GTYPE B (bitmap)
    GKEYBDS          OBJECT=GRAPHICS · NAME=<o gráfico> · ID=BMAP · BTYPE=BCOL|BMON
    APPMODE B · RELMODE W · ALIGNMENT L|C|R
  sf:SUCC/           vazio — gráfico não tem filho
```

Duas coisas que a anatomia decide, e que o Markdown herda:

- **o nó não tem `sf:OUTATTR`** — ele não se posiciona nem se redimensiona. Dentro da MAIN a imagem
  flui com o texto; dentro de uma janela `WTYPE=G` ela fica onde a janela está (as duas medidas);
- **o tamanho impresso vem do DPI da IMAGEM**, não do nó: o mesmo BMP de 168×104 px sai com
  **2.419 twips (4,27 cm)** a 100 dpi e **806 twips (1,42 cm)** a 300 dpi. Redimensionar é
  reprocessar o arquivo — não há como pedir "5 cm" no documento.

⚠️ **Gráfico inexistente é erro TARDIO E MUDO**: o form GERA (`FB_GENERATE_FORM` ok) e o runtime
devolve `subrc 1, "A saída de gráfico não é possível"`, **sem PDF e sem dizer qual nome falhou**.
Por isso `graficoInfo` existe e `publicarMarkdown` confere cada gráfico na STXBITMAPS **antes** de
criar o form (medido: com o gráfico ausente, o form nem chega a nascer).

⚠️ **O `GR` não avança a linha — e isso só o PDF pega.** Sem uma quebra explícita ele começa na
posição corrente e **sobe sobre a última linha do parágrafo anterior**, cortando o texto ao meio;
acontece com qualquer alinhamento (medido nos quatro casos: texto+GR direita sobrepõe, texto+GR
esquerda sobrepõe, texto terminado em `TDFORMAT /` não sobrepõe, nó de texto vazio também não). O
emissor passou a fechar o bloco de texto anterior com um item `/` — uma linha, e o assert numérico
(bbox da imagem × bbox do texto no PDF) entrou no E2E.

### A outra ponta: a imagem entrando no sistema (a via do SE78, sem a dynpro)

`SAPSCRIPT_IMPORT_GRAPHIC_BDS` é o FM da SE78 e **abre tela** (`CALL SCREEN 4001`) — inútil no
classrun, o mesmo carimbo do item 41. A receita real está no fonte por trás dela (`LSTXBITMAPSF05`,
form `IMPORT_BITMAP_BDS`), e é reproduzível inteira num driver trocando o `GUI_UPLOAD` por base64 no
próprio fonte:

```abap
ENQUEUE_ESSGRABDS                          " o lock que a SE78 toma
SAPSCRIPT_CONVERT_BITMAP_BDS               " BMP/TIFF → conteúdo BDS; devolve pix, twips e DPI
cl_bds_document_set->create_with_table     " classname DEVC_STXD_BITMAP, classtype OT
INSERT INTO stxbitmaps                     " o DOCID sai da signature do BDS
change_properties( DESCRIPTION )           " o texto que a SE78 mostra
DEQUEUE_ESSGRABDS + COMMIT WORK AND WAIT
```

**Só BMP e TIFF entram** — medido caso a caso, e cada um com sua mensagem:

| conteúdo | `format` declarado | resultado |
|---|---|---|
| BMP | `BMP` | ok — `pix=168x104 tw=806x499 dpi=300` |
| BMP | `TIF` | `tifferr_invalid_format` (8): "File TIFF: formato TIF incorreto" |
| PNG | `BMP` | `no_bmp_file` (2): 'início de file <> "BM"' |
| PNG | `PNG` | `format_not_supported` (1): "O formato PNG não é suportado" |
| BMP | `JPG` | `format_not_supported` (1): "O formato JPG não é suportado" |

Por isso `subirGrafico` lê os primeiros bytes (`formatoDaImagem`) e recusa **antes da rede** o que o
FM não converteria, dizendo o que fazer. `apagarGrafico` usa `SAPSCRIPT_DELETE_GRAPHIC_BDS` com
`dialog = space` (sem GUI) e some com a linha da STXBITMAPS.

### Uso pela lib

```js
import { subirGrafico, graficoInfo, apagarGrafico, xmlGraficoSmartForm } from 'adt-client/forms';
import { publicarMarkdown } from 'adt-client/markdown';

await subirGrafico(cx, { nome: 'ZLOGO_ACME', arquivo: 'logo.bmp', descricao: 'logo da ACME' });
await graficoInfo(cx.cfg, 'ZLOGO_ACME');   // { existe, btype, larguraCm, alturaCm, dpi, … }

await publicarMarkdown(cx, {
  markdown: '# Nota\n\n![Logo](ZLOGO_ACME "centro")\n',
  form: 'Y_SF_NOTA', salvarPdfEm: 'nota.pdf',
  imagens: { ZLOGO_ACME: 'logo.bmp' },     // sobe e referencia no mesmo passo (opcional)
});
```

No Markdown o `src` **não é um arquivo**: é a chave do gráfico no sistema. Caminho ou URL é erro
duro, com a explicação — é o engano mais provável de quem escreve o documento. O título entre aspas
é o **alinhamento** (`esquerda`/`centro`/`direita`, medido no papel: x = 2,5 · 9,8 · 14,9→18,5 cm),
não uma legenda: o Smart Form não tem legenda de gráfico.

### Limites deste degrau

- **PNG e JPG não entram** — é limite do FM do SAP. Converter para BMP/TIFF é trabalho de quem
  chama (a lib não carrega conversor de imagem);
- **sem tamanho no documento**: quem manda é o DPI do arquivo;
- imagem **não flui ao lado do texto** (não há "float"), e não existe legenda;
- `RESIDENT`/`AUTOHEIGHT`/compressão ficam nos defaults da SE78 (`autoheight = 'X'`, sem compressão
  em BCOL) — o efeito de cada um no papel não foi medido;
- gráfico **não tem TADIR**: mora em STXBITMAPS + BDS, então não entra em TR pelo caminho normal e
  não tem "objeto" para o CTS. Transporte de gráfico ficou fora;
- observado sem causa isolada: o branco puro do BMP saiu **cinza muito claro** no PDF (visível como
  um retângulo em volta do desenho). Não afeta o texto nem a posição, e não foi investigado.

## 🎨 Degrau 5: SMART STYLE PRÓPRIO (item 52 — medido 2026-09-01, S4H 758)

Os quatro degraus anteriores esbarravam na mesma frase: **`TDFORMAT` é o parágrafo do Smart Style, e
o emissor só pode usar o que o estilo do form já tem.** O `SF_STYLE_01` foi generoso (ênfase inline e
lista numerada já existiam), mas ele fecha o teto:

| o que o documento queria | o que o `SF_STYLE_01` dava |
|---|---|
| `#` `##` `###` em tamanhos distintos | um parágrafo de título só (`TH`) — os três iguais |
| bullet recuado | `TB` recua **2 MM**; espaço à esquerda do TDLINE é comido |
| parágrafo de código | `AS` (o mesmo do corpo); o `UL` sobrepõe (entrelinha 0,5 LN) |
| citação (`>`) | não existe — era recusa do parser |
| coluna alinhada à direita (`\| ---: \|`) | nenhum `TDPJUSTIFY = RIGHT` na STXSPARA |

A cobertura marcava **`SSST` como "só GUI"**. É essa linha que este degrau apaga.

### A via: três FMs, e as três armadilhas

```
TR_TADIR_INTERFACE ($TMP)  →  SSF_SAVE_STYLE  →  SSF_ACTIVATE_STYLE
```

Todos do grupo **`SAPLSTXBS`**, nenhum RFC (`TFDIR-FMODE` vazio) → **driver classrun**. O caminho
inteiro saiu do fonte deles, lido pelo ADT — o mesmo método do item 51 com o `LSTXBITMAPSF05`.

1. **`SSF_CREATE_STYLE` e `SSF_CHANGE_STYLE` NÃO servem.** O corpo das duas é `perform
   style_builder` — o editor da SMARTSTYLES. Quem grava no banco é **`SSF_SAVE_STYLE`**, que não tem
   diálogo nenhum. (Para ler: `SSF_READ_STYLE` devolve header + parágrafos + caracteres + tabuladores.)
2. **`SSF_ACTIVATE_STYLE` exige `redirect_error_msg = 'X'`.** Ele chama `SSF_CHECK_STYLE`
   repassando o parâmetro, e o check com `redirect_error_msg = space` faz `call screen
   c_scr_list_check`. Em classrun isso é **`DYNPRO_SEND_IN_BACKGROUND`**. Com `'X'`, os erros do
   check voltam na tabela `error_msg` (é de lá que sai `ST_ERR` na saída do driver).
3. **A TADIR tem de existir ANTES do save.** O `SSF_SAVE_STYLE` chama `RS_CORR_INSERT` (macro
   `corr_insert`, `LSTXBSF00`) com `global_lock = 'X'`; sem entrada de diretório ele abre a dynpro
   do **`SAPLSTRD`** e o driver dumpa — foi o primeiro `DYNPRO_SEND_IN_BACKGROUND` desta POC, e ele
   *não* aparece como erro na saída: o classrun devolve HTTP 500 e só a ST22 conta o porquê. Uma
   `TR_TADIR_INTERFACE` em `$TMP` antes da chamada resolve.

Dois detalhes do próprio `SSF_SAVE_STYLE`, medidos:

- ele **grava sempre INATIVO** (`iadm-active = c_status_inactive`) — quem promove é o activate, que
  APAGA a versão ativa e faz `UPDATE … SET active = 'A'` tabela a tabela;
- **a versão vem do HEADER, não do banco**: `ADD 1 TO iadm-version` opera sobre o que o chamador
  passou. Republicar com um header montado do zero regravaria a versão **1** para sempre. A lib faz
  `SELECT SINGLE version FROM stxsadm` antes de chamar — por isso republicar é UPDATE e a versão sobe.

### ⚠️ O `LOOP AT` sobre tabela vazia sobrescreve o `sy-subrc`

Custou uma rodada do E2E: o `LOOP AT lt_err` que imprime os erros do check roda **depois** do
`CALL FUNCTION` e, com a tabela vazia (o caso BOM), deixa `sy-subrc = 4`. O activate bem-sucedido
saía como `ST_ACT EXC subrc=4 status=A` — falha relatada em cima de um sucesso. O `subrc` passou a
ser guardado numa variável antes do loop.

### Anatomia do SSST

| tabela | o que guarda |
|---|---|
| `STXSADM` / `STXSADMT` | catálogo (nome, `MASTERLANG`, `VERSION`) e a descrição por idioma |
| `STXSHEAD` | header: parágrafo default (`TDFIRSTPAR`), CPI/LPI, fonte-base |
| `STXSPARA` | os parágrafos — **`TDPARGRAPH` é CHAR 2** (o SAP trunca sem avisar) |
| `STXSCHAR` | os formatos de caractere (`TDSTRING`, também CHAR 2) |
| `STXSTAB` | tabuladores · `STXSOBJT` as descrições de cada parágrafo/caractere, por idioma |
| `STXSVAR` | variantes — a principal é `VARI = space` (o `%MAIN` é só nome de tela) |

`TDBOLD`/`TDITALIC`/`TDUNDERLIN` têm **três** estados: `'X'` liga, `' '` desliga, **`'*'` herda**. É
o `'*'` que deixa `<B>x</>` funcionar dentro do parágrafo — `validarSmartStyle` põe `*` no que o
estilo não disser, que é o que a GUI grava.

### ⚠️ `TDNUMBERIN` SOZINHO não numera nada

A primeira versão do `N1` tinha `TDNUMBERIN = 'A'` (a mesma do `SF_STYLE_01`) e a lista saiu no PDF
**sem os números** — sem erro, sem aviso. A diferença estava em dois campos que ninguém olha:

| campo | `SF_STYLE_01` | o que faz |
|---|---|---|
| `TDLFIRSTPA` | `N1` | o parágrafo que ABRE a cadeia de estrutura (aqui, ele mesmo) |
| `TDLDEPTH` | `01` | o NÍVEL dele nessa cadeia |

Sem os dois o parágrafo não é uma "lista" para o SAPscript: `TDNUMBERIN` diz só o *tipo* de
numeração (A = arábico). Com eles, o número sai em `TDNUMLEFT` e o texto em `TDPLEFT` — medido no
papel: `1` em x = 2,70 cm e `primeiro numerado` em 3,30.

### ⚠️ `TDHEIGHT` fora da `TFO02` não é recusado — imprime em OUTRO tamanho

`TFO02` é a tabela de tamanhos por família de fonte. O que ela não tem, o SAP **não recusa**:
escolhe. Medido neste s4h:

| pedido | saiu no papel |
|---|---|
| `HELVE 080` · `100` · `140` · `180` | 8,0 · 10,0 · 14,0 · 18,0 pt — exato |
| `COURIER 120` | 12,0 pt — exato |
| `COURIER 090` (**não está na TFO02**) | **8,5 pt** |
| `COURIER 080` (está na TFO02) | **8,5 pt** — observado, sem causa isolada |

`COURIER` tem `060 080 100 120 140 160 180 200 220 240 260 280 360 480 720`; `HELVE` tem os mesmos
mais `070` e `075`. `publicarSmartStyle` confere cada (família, tamanho) contra a `TFO02` do sistema
antes de gravar, e `tamanhosDeFonte(cfg, familia)` devolve a lista. O caso do `COURIER 080` mostra
que a conferência **não é suficiente**: ela pega o tamanho inexistente, não a diferença entre o
tamanho pedido e o impresso numa família de largura fixa. Fica aberto.

### O estilo da lib: `ESTILO_MARKDOWN` × `ESTILO_JBV`

São **dois objetos, um contrato**: `ESTILO_MARKDOWN` (forms.mjs) é o SSST que vai para o sistema;
`ESTILO_JBV` (markdown.mjs) é o vocabulário que aponta para os códigos dele. Um teste puro amarra os
dois — código citado no vocabulário que não exista no estilo imprimiria com o parágrafo default,
calado.

| parágrafo | serve para | o que tem |
|---|---|---|
| `AS` | corpo (e `TDFIRSTPAR`) | HELVE 10, 3 pt abaixo |
| `H1` `H2` `H3` | `#` `##` `###` | HELVE **18 / 14 / 12** pt, negrito (o H3 também itálico) |
| `LI` | item com marcador | recuo 0,8 CM com a 1ª linha voltando **−0,4 CM** (pendurado) |
| `N1` | lista numerada | recuo 0,8 CM, `TDNUMBERIN='A'` (numera sozinho) |
| `CO` | bloco de código | **COURIER 9**, recuado 0,5 CM |
| `QU` | citação | HELVE 10 itálico, entre margens de 1 CM |
| `R` / `C` | coluna à direita / centro | `TDPJUSTIFY = RIGHT` / `CENTER` |
| `TH` / `TB` | célula de cabeçalho / de corpo | HELVE 10, negrito no `TH` |

Caracteres: `B` negrito · `I` itálico · `S` **COURIER 8** (o código inline deixou de ser HELVE 8).

O recuo negativo é aceito: `TDPENTRY = '-0.40'` volta da tabela como `0.40-` (sinal à direita, é DEC).

O vocabulário ganhou `cabecalho` e `rodape`: até o item 50 o cabeçalho usava `titulo[0]`, e com
`H1 = 18 pt` ele **estourava a janela de 1,2 cm** (que corta sem avisar — limite do degrau 3). Os
dois caem em `AS`; `estilo.cabecalho ?? estilo.titulo[0]` mantém o comportamento antigo de quem
passa um mapa próprio.

### O papel, em coordenadas (A4, margem 2,5 cm)

| o que | onde saiu | o que prova |
|---|---|---|
| `# Titulo` | Helvetica-**Bold 18,0 pt** | o `H1` existe e é maior que o corpo |
| `## / ###` | Bold **14,0** / BoldOblique **12,0** | os três níveis são distintos |
| corpo | Helvetica 10,0 pt, x = 2,50 | margem limpa |
| `**x**` `_x_` `` `x` `` | Helvetica-Bold · -Oblique · **Courier** | as tags de caractere valem no estilo novo |
| citação | Helvetica-Oblique, **x = 3,50** | 2,50 + o recuo de 1,00 CM do `QU` |
| bullet | marcador em **x = 2,90**, continuação em **3,30** | 2,5 + 0,8 − 0,4 e 2,5 + 0,8 — o pendurado |
| lista numerada | `1` em 2,70, texto em 3,30 | `TDLFIRSTPA`+`TDLDEPTH` numerando |
| bloco de código | Courier, x = 3,00 | 2,5 + o recuo de 0,50 CM do `CO` |
| coluna `\| ---: \|` | `9.600,00` e `4.200,00` terminando no MESMO x = 16,93 | o `RIGHT` alinha de verdade |

No mesmo documento pelo `SF_STYLE_01`, tudo sai **Courier 12** (só o `S` é Helvetica 8), os três
títulos em Courier-Oblique 12 e o bullet sem recuo: 6.448 bytes de PDF contra 11.337.

### A citação mudou de lado — e a mudança é o desenho

`>` deixou de ser recusa do **parser**: vira um bloco `citacao` na AST sempre, e quem recusa é o
**emissor**, quando o estilo não tem parágrafo para ela. É a divisão que a AST existe para manter —
o documento diz o que **é**, o backend diz o que sabe imprimir. Efeito colateral que interessa ao
item 43: o emissor XFA herda a citação sem herdar o teto do `SF_STYLE_01`.

Linhas `>` contíguas viram **um** bloco. Só texto inline dentro: lista ou tabela dentro de citação
não existe no vocabulário.

### ⚠️ O quarto erro mudo deste caminho: estilo que não existe

Form apontando para um `<STDSTYLE>` inexistente **gera e imprime** — com o parágrafo default do
device, sem uma mensagem sequer. É o mesmo desenho do gráfico ausente (item 51), e a resposta é a
mesma: `publicarMarkdown` confere na STXSADM **antes** de criar o form, e confere também que todo
`TDFORMAT` do vocabulário existe no estilo **ativo**.

### Uso pela lib

```js
import { publicarSmartStyle, apagarSmartStyle, smartStyleInfo, ESTILO_MARKDOWN } from 'adt-client/forms';
import { publicarMarkdown, ESTILO_JBV } from 'adt-client/markdown';

await publicarSmartStyle(cx, { estilo: ESTILO_MARKDOWN });   // { ok, versao, paragrafos: 12, caracteres: 3 }
await smartStyleInfo(cx.cfg, 'Y_SF_MD');                     // { existe, ativo, paragrafos: ['AS','H1',…] }

await publicarMarkdown(cx, {
  markdown: '# Titulo\n\n> uma citação\n\n| a | b |\n| --- | ---: |\n| x | 9,90 |\n',
  form: 'Y_SF_DOC', estilo: ESTILO_JBV, salvarPdfEm: 'doc.pdf',
});

await apagarSmartStyle(cx, { nome: 'Y_SF_MD', confirm: true });
```

`ESTILO_MARKDOWN` é **dado**, não código: trocar fonte, tamanho ou recuo é editar aquele objeto e
republicar. O que ele NÃO pode é citar um código que o vocabulário não conheça — aí o parágrafo
existe no SAP e ninguém o usa.

### Limites deste degrau

- **um estilo, uma variante** (`VARI = space`). Variantes por idioma/dispositivo (`STXSVAR`) ficam
  fora — a lib nem as cria nem as lê;
- **tabuladores (`STXSTAB`) ficam vazios**: o Markdown não tem sintaxe de tabulação;
- `TDNUMOUTL`/`TDLFIRSTC` (numeração encadeada, `1.1`, `1.1.1`) **não foram medidos** — só o `N1`
  simples, que numera sozinho;
- barcode, super/subscrito e cor (`RED`/`GREEN`/`BLUE`) existem no SSST e **não** têm sintaxe
  Markdown: nascem nos defaults;
- **o tamanho impresso de uma família de largura fixa não bate com o pedido**: `COURIER 080` sai
  8,5 pt, e a conferência da `TFO02` não pega isso (ver acima). Aberto;
- transporte: o estilo nasce em `$TMP` como todo objeto de POC. Em pacote transportável ele entra
  pela mesma `TR_TADIR_INTERFACE`, mas isso **não foi medido**.

## 🔄 Migração de forms SEM GUI — SAPscript → Smart Form → Adobe/XFA (item 53 — medido 2026-09-01, S4H 758)

**A pergunta era "a importação SAPscript da SFP traz layout ou só a interface?". A resposta é que
essa importação NÃO EXISTE** — e o que existe é melhor: duas migrações que **compõem em cadeia**, as
duas chamáveis de driver classrun, e a segunda produz o XFA a partir do **Smart Form**, não do
SAPscript.

| via | quem faz | onde | GUI? |
|---|---|---|---|
| SAPscript → **Smart Form** | FM **`FB_MIGRATE_FORM`** (`SAPLSTXB`) | menu da SMARTFORMS / report `SF_MIGRATE` | **não**, com `i_with_dialog = ' '` e `i_with_form_builder = ' '` |
| Smart Form → **Adobe Form (XFA)** | **`cl_ssf_migration=>migrate( )`** (class-method) | FMs `FB_MIGRATE_FORM_FP_DEF` / `_FP_CUST` | **não** — o diálogo está nos FMs, não na classe |
| SAPscript → Adobe direto | **não existe no 758** | — | — |

Como se fecha que a via direta não existe (busca, não impressão): nenhum dos **53 includes** do
`FUGR FPUIFB`/`FPUIFBFORM` (a UI do Form Builder) cita SAPscript; não há FM `FP*`/`SFP*` de migração
(`FB_MIGRATE_FORM*` são os três, todos do lado Smart Forms); as transações `SFP*` são só `SFP` e
`SFP_ZCI_UPDATE`. O rastro do que existe está no dado: `FPCONTEXT-TYPE` tem o valor **`M` = "Created
by Migration"** (29 forms padrão no s4h) e `FPINTERFACE-INTERFACE_TYPE` tem **`S` = "Smart
Forms-Compatible Interface"** — a migração se assina no objeto que cria.

### A receita medida (E2E em driver classrun, s4h 758:250, tudo em `$TMP`, tudo apagado ao final)

```abap
" 1) TADIR ANTES — sem ela o RS_CORR_INSERT abre a dynpro do SAPLSTRD e o driver morre
CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = ' '
  wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'SSFO'   " e depois SFPI, e depois SFPF
  wi_tadir_obj_name = 'YJBV_POC_SF_MIG' wi_tadir_devclass = '$TMP' EXCEPTIONS OTHERS = 1.

" 2) SAPscript → Smart Form
CALL FUNCTION 'FB_MIGRATE_FORM'
  EXPORTING i_formname_sapscript = 'QM_LABEL' i_language_sapscript = 'D'
            i_formname_smartform = 'YJBV_POC_SF_MIG'
            i_with_dialog = ' ' i_with_form_builder = ' ' i_check_forms_are_ok = 'X'
  IMPORTING o_formname_smartform = lv_sf
  EXCEPTIONS no_name = 1 no_language = 2 no_form = 3 form_exists = 4
             no_access_permission = 5 illegal_language = 6 illegal_name = 7 no_success = 8.
" medido: subrc 0 → STXFADM YJBV_POC_SF_MIG, MASTERLANG D, DEVCLASS $TMP, VERSION 00001

" 3) Smart Form → Adobe Form (XFA)
DATA(ls_opt) = cl_ssf_migration=>set_default_migrating_options( ).
DATA(lo_wb)  = cl_ssf_migration=>migrate( sf_name           = 'SF_EXAMPLE_01'
                                          fp_form_name      = 'YJBV_POC_MIG_F'
                                          fp_interface_name = 'YJBV_POC_MIG_I'
                                          options           = ls_opt ).
" medido: cria SFPF + SFPI INATIVOS; FPCONTEXT TYPE='M', FPINTERFACE INTERFACE_TYPE='S'

" 4) o XFA sai da FPLAYOUTT, filtrando o IDIOMA
SELECT SINGLE layout FROM fplayoutt
  WHERE name = 'YJBV_POC_MIG_F' AND state = 'I' AND language = 'D' INTO @DATA(lv_xdp).
```

`set_default_migrating_options( )` devolve (medido): `INTERFACE CONTEXT LAYOUT TEMPLATE TEXT
TEXT_PLACEHOLDER WINDOW ADDRESS GRAPHIC FOLDER COMMAND_PAGEBREAK` = `X`; e **`TABLE`, `CONDITION_*`,
`ALTERNATIVE_*`, `OUTPUT_OPTION`, `HEADER_FOOTER`, `CODING` = vazio** — ou seja, no default a tabela
do Smart Form **não** é migrada (o `TEMPLATE`, sim). Quem quiser tabela liga `options-table` na mão.

### Veredito: o layout VEM, e não é prancheta burra

`SF_EXAMPLE_01` migrado → **17.540 bytes** de XDP em `FPLAYOUTT`, cabeçalho
`<?xfa generator="SAP_SmartForms" APIVersion="R700.SP0.N0"?>`. Contagem de elementos: **18
`subform` · 18 `draw` · 6 `field` (todos com `bind ref="$record.<JANELA>.<CAMPO>"`) · 2 `image` ·
2 `pageArea` (FIRST/NEXT) com `medium stock="a4"` · 2 `contentArea` com x/y/w/h em cm · `proto` +
`use` para reaproveitar as janelas · `border`/`edge`/`fill`/`color` · `keep intact="contentArea"`**.
Há fluxo de verdade (`layout="tb"`, `layout="lr-tb"`), não só posição absoluta — o risco que a fila
54 nomeou ("o XFA migrado pode ser burro") **não se confirmou**.

O texto formatado **não vira nós XFA: vira XHTML** dentro de
`<value><exData contentType="text/html">`, com `<div style="font-family: 'Courier New'; font-size:
12pt; line-height: 4.23mm; text-align: left; …">`. É o mesmo material que a `CL_SSF_XFA_XHTML`
("ITF→XHTML") produz — e é o formato que o emissor XFA da fila 43 tem de gerar.

### Gotchas medidos

- ⚠️ **A migração usa o IDIOMA DA SESSÃO, e o que falta sai VAZIO — em silêncio.** O mesmo
  `YJBV_POC_SF_MIG` (masterlang `D`) migrado numa sessão `P` deu `MIGRATE ok`, `FPLAYOUTT` com
  `LANGUAGE = P` e **1.177 bytes** cujos `<draw>` têm `exData` com `<div/>` vazio; na sessão `D`,
  **9.473 bytes** com o texto (`GESPERRT`) e os estilos. Sem contraprova de tamanho, um layout sem
  texto passa por layout bom. **Migre no masterlang do form** (`STXFADM-MASTERLANG`).
- **TADIR antes, sempre** — para `SSFO`, `SFPI` e `SFPF`. Sem ela: `CX_SY_SEND_DYNPRO_NO_RECEIVER
  … SAPLSTRD 0100` (dump `DYNPRO_SEND_IN_BACKGROUND`, `LSTRDU18`), o mesmo que a fila 52 mediu no SSST.
- **O form migrado nasce INATIVO, e no s4h não ativa**: `cl_fp_wb_helper=>form_activate` →
  `CX_FP_API_INTERNAL` "Ocorreu um erro interno em SAFP API". É a **mesma assinatura** que o item 41
  atribuiu à cópia do FORM — agora isolada: no s4h o que falha é a **ativação** (que precisa do ADS),
  **não a criação**. `interface_activate` (SFPI), esse, passa. Desmentido útil: **criar SFPF no s4h é
  possível** pela via da migração.
- **Form inativo é form inexistente para o runtime**: `FP_FUNCTION_MODULE_NAME` sobre ele levanta
  `CX_FP_API_REPOSITORY` "O objeto X não existe" — não é "sem FM gerado".
- **Ler o XFA não precisa de ADS nem de ativação** — `FPLAYOUTT` está gravada logo após o `migrate`.
  Por isso a Pedra de Roseta (fila 54) roda inteira no **s4h**, e só o render fica para o SXD.
- Limpeza: `apagarAdobeForm({ form, interfaceNome, confirm: true })` e `apagarSmartForm` da lib dão
  conta dos três objetos (TADIR vazia depois, `TH_USER_LIST` 0 sessões antes e depois).
- Observado sem causa isolada: um driver que fazia `interface_activate` + `form_activate` + selects
  numa `deployAndRun` devolveu **HTTP 500 sem dump** (duas vezes); os mesmos passos, com o deploy e o
  run separados (classe já ativa, `POST …/classrun` em sessão nova), devolveram 200 e a exceção
  legível. Quando o classrun der 500 mudo, separe deploy e run antes de culpar o passo.

## 🗿 Pedra de Roseta SSFO × XFA — o dicionário que a própria SAP escreve (item 54 — medido 2026-09-01, S4H 758)

O item 53 mostrou que `cl_ssf_migration=>migrate( )` roda sem GUI e devolve XFA de verdade. Este
item usa isso como **tradutor**: em vez de inventar o emissor XFA da fila 43 nó a nó, fabrica-se um
Smart Form com conteúdo CONHECIDO (a escada MD→SF dos itens 46/48–52), migra-se, e lê-se o que a SAP
escreveu do outro lado. O corpus é alinhado por construção — os dois lados são o MESMO documento.

**Corpus medido (s4h 758:250, tudo em `$TMP`, tudo apagado; 45/45 asserts):** quatro documentos
Markdown → `publicarMarkdown` (estilo `Y_SF_MD`, o SSST do item 52) → `baixarSmartFormXml` (lado
SSFO) → driver classrun com `migrate( )` → `FPLAYOUTT`/`FPCONTEXT`/`FPINTERFACE` em base64 (lado
XFA): **TXT** (títulos, ênfase, listas, citação, código, régua, cabeçalho/rodapé) · **VAR**
(`{{VARIAVEL}}`) · **TAB** (tabela com três alinhamentos) · **IMG** (gráfico da STXBITMAPS).

### O mapa, construto a construto

| Smart Form (SSFO) | XFA (XDP) |
|---|---|
| página, nó `PA` (`FIRST`) | `<pageArea name="FIRST">` dentro de `<pageSet>` |
| formato `DINA4`/retrato | `<medium short="210mm" long="297mm" orientation="portrait" stock="a4"/>` |
| janela `MAIN` (geometria em cm) | `<contentArea x= y= w= h=>` no pageArea **+** `<subform name="MAIN" layout="lr-tb">` no corpo, com `<keep intact="contentArea"/>` |
| janela irmã (cabeçalho/rodapé) | `<proto><subform name="FIRST_MDCABEC" x= y= w= h=>` + `<subform use="#FIRST_MDCABEC"/>` no pageArea |
| nó `TI` (texto) | **UM** `<draw>` com `<value><exData contentType="text/html">` — o texto inteiro é XHTML |
| linha do texto (`TDFORMAT`+`TDLINE`) | **um `<div style="…">` por linha**, na MESMA ordem (13 ↔ 13 medido) |
| formato de caractere `<B>`/`<I>`/`<S>` | `<span style="font-weight : bold">` · `font-style : italic` · `font-family : 'Courier New'` |
| nó `SE` (tabela) | `<subform layout="tb">` com `<break overflowLeader="#…">` |
| nó `EV` de cabeçalho da tabela | `<proto><subform name="…EVH-header" layout="position">` — é o `overflowLeader`, repete na quebra |
| linha da tabela (`SECTTYPE=R`) | `<subform layout="table">` contendo `<subform name="layout_row" layout="row">` |
| célula (`SECTTYPE=E`, largura em cm) | `<subform layout="lr-tb" w="3.20cm">` + `<draw>` com o XHTML da célula |
| borda `baixo` da célula | três `<edge presence="hidden"/>` + um `<edge thickness="0.26mm">` |
| nó `GR` (gráfico) | `<field access="nonInteractive" w= h=>` com `<image contentType="image/bmp" href="/sap/bc/fp/graphics/public/graphics/bmap/bcol/<nome>.bmp"/>` |
| alinhamento do gráfico | `<subform name="…-hAlign" hAlign="center">` em volta do campo |
| `&VAR&` no texto (com `TEXT_BINDING`) | `<field name="VAR" presence="hidden"><bind ref="$record.MAIN.<NÓ>.VAR" match="dataRef"/>` + `<span xfa:embed="VAR"/>` no XHTML |
| janela/nó na árvore | `CL_FP_FOLDER` no **CONTEXT** (`FPCONTEXT-CONTEXT`, asx de `CL_FP_CONTEXT`); variável = `CL_FP_DATA` |

### O parágrafo do Smart Style vira CSS — e é uma tradução direta

Medido com o `Y_SF_MD` (item 52), alinhando linha a linha. **É este o dicionário que o emissor da
fila 43 precisa**: onde o Smart Form aponta um `TDFORMAT`, o XFA carrega o estilo INLINE.

| campo do SSST (`STXSPARA`) | CSS no `<div>` |
|---|---|
| `TDFAMILY` HELVE · COURIER | `font-family : 'Arial'` · `'Courier New'` |
| `TDHEIGHT` 180 · 140 · 120 · 100 · 080 | `font-size : 18pt · 14pt · 12pt · 10pt · 8pt` |
| `TDBOLD='X'` (e a ausência dele) | `font-weight : bold` · `font-weight : normal` |
| `TDITALIC='X'` | `font-style : italic` |
| `TDPJUSTIFY` LEFT/CENTER/RIGHT | `text-align : left/center/right` |
| `TDPLDIST` 1,00 LN (a 6 LPI) | `line-height : 4.23mm` |
| `TDPTOP`/`TDPBOT` em PT | `margin-top`/`margin-bottom` em **mm** (8 pt → 2.82mm) |
| `TDPLEFT`/`TDPRIGHT` em CM | `margin-left`/`margin-right` em mm (0,80 cm → 8.01mm) |
| (sempre) | `text-decoration : none` e `clear : both` em todo `<div>` |

### O que NÃO viaja — e é aqui que o emissor da 43 tem trabalho

- ⚠️ **`TDPENTRY` (o recuo pendurado) some.** O `LI` do `Y_SF_MD` tem `TDPLEFT 0,80` com
  `TDPENTRY -0,40`: no XFA sai só `margin-left : 8.01mm`, **sem `text-indent`** — o bullet perde o
  pendurado que o item 52 mediu no papel;
- ⚠️ **a numeração automática vira número literal.** O `TDNUMBERIN` do `N1` não vira lista XFA: o
  XHTML recebe `1<span style="xfa-tab-count : 1 ;"/>passo um`. O número é TEXTO;
- ⚠️ **campo de sistema não vira campo** — NO CORPO. `&SFSY-PAGE&` num nó da MAIN sai como o texto
  `{SFSY-PAGE}`. **Correção do item 58 (2026-09-01):** em JANELA construída (cabeçalho/rodapé) e
  com `text_binding='X'`, a migração FAZ a ponte — `<subform name="SFSY">` com campos hidden,
  `<event ref="$layout">` + `xfa.layout.page(this)`/`pageCount()`, e `xfa:embed="SFSY.PAGE"` no
  XHTML (ver § O emissor da AST);
- cor, `TDUNDERLINE` e tabulações fora da lista não foram exercitados por este corpus.

### As opções da migração: o default entrega documento ERRADO, sem erro

`set_default_migrating_options( )` devolve `X` em `INTERFACE CONTEXT LAYOUT TEMPLATE TEXT
TEXT_PLACEHOLDER WINDOW ADDRESS GRAPHIC FOLDER COMMAND_PAGEBREAK` e **vazio** em
`TABLE · TEXT_APPEND · TEXT_BINDING · CONDITION_DATA · CONDITION_LAYOUT · ALTERNATIVE_ALL ·
ALTERNATIVE_TRUE · OUTPUT_OPTION · HEADER_FOOTER · COMMAND_REST · CODING`. Os nomes são esses —
`CONDITION_TEXT`, `ALTERNATIVE_TEXT` e afins **não existem** na estrutura, e um `ASSIGN COMPONENT`
neles falha calado. (O `OUTPUT_OPTION` estava do lado errado nesta linha até o item 55 medir os 22
campos por RTTI: ele nasce **vazio**.)

- ⚠️ **`TABLE` desligada não OMITE a tabela: ela a ACHATA.** Medido no mesmo form: com `TABLE='X'`,
  26 `subform`, 4 `layout="table"`, 4 `layout="row"`, 48 `<edge>`, cabeçalho com `overflowLeader`
  (11.085 bytes); no default, **os mesmos 14 `<draw>`**, todos `w="16cm"`, empilhados em coluna
  única, zero borda e zero cabeçalho repetido (7.140 bytes). A migração diz `ok` nos dois casos;
- ⚠️ **sem `TEXT_BINDING` o campo perde o dado.** No default, `&CLIENTE&` sai como o texto
  `{CLIENTE}` — e, da **segunda ocorrência em diante da mesma variável**, como
  `<span xfa:embed="CLIENTE"/>` **sem nenhum `<field>` que o defina**: um embed que não resolve.
  Com `TEXT_BINDING='X'`, todas as ocorrências viram `xfa:embed`, cada variável ganha um
  `<field presence="hidden">` com `bind ref="$record.…"`, o nó de texto vira `<subform>` com o campo
  de controle `append_mode__`, e o CONTEXT ganha um `CL_FP_DATA` por variável;
- **o preço do `TEXT_BINDING`**: a migração injeta **17.546 bytes de JavaScript XFA** em
  `<event ref="$form" activity="ready">` (o runtime da SAP para embed/append/condições) — o XDP do
  mesmo documento salta de 1.886 para 20.628 bytes.

### ⚠️ O idioma: o nó CONSTRUÍDO pela lib é MONOLÍNGUE

O gotcha do item 53 ("migre no masterlang") estava incompleto. O que decide não é o `MASTERLANG` —
é **em que idioma o TEXTO existe**. Os forms da escada MD→SF nascem com `MASTERLANG = D` (herdado do
molde `SF_EXAMPLE_01`) e migram **perfeitamente em P**, porque é em P que o texto foi gravado.

O contrário é que dói, e é da LIB, não da migração: `xmlTextoSmartForm` emite só `<TEXT>`, sem
`<T_TEXT>` por idioma (decisão do item 42: "o texto saiu no PDF sem ele"). Medido agora:

| documento | migrado em P | migrado em D |
|---|---|---|
| TXT | 15 textos (corpo + cabeçalho + rodapé) | **13** — o corpo vem (é o nó do molde, que tem `<T_TEXT>` em D) e cabeçalho/rodapé saem VAZIOS |
| TAB | 14 `<draw>`, todos com texto | 14 `<draw>` — **estrutura inteira**, tabela, cabeçalho, bordas — e **um** texto: só o nó do molde |

Ou seja: **todo nó que a lib constrói (texto, célula de tabela, cabeçalho, rodapé) só existe no
idioma da sessão que gravou o form.** Imprimir em outro idioma, ou migrar em outro idioma, devolve o
documento com a forma certa e sem palavra nenhuma — sem erro, sem aviso. Virou a **I77**.

### ✅ Correção (item 61, 2026-09-01): o `MASTERLANG = D` acima era BUG, não característica

A frase "os forms da escada nascem com `MASTERLANG = D`" nesta receita e o comentário do item 42 em
`forms.mjs` ("o clone nasce com o MASTERLANG da sessão") **se contradiziam**, e quem estava certo era o
item 42 — só que a promessa não se cumpria. `copiarSmartForm` até faz `enqueue( master_language = sy-langu )`,
mas isso não gruda: quem decide o `STXFADM-MASTERLANG` final é o `<HEADER>` do **DOM enviado ao
`xml_upload`**, e a escada (`baixarSmartFormXml` → poda/troca de texto → `subirSmartFormXml`) nunca tocava
esse campo — o upload final persistia o MASTERLANG da ORIGEM (`D`, do `SF_EXAMPLE_01`), não o da sessão que
escreveu o texto. Medido: um form publicado por `publicarMarkdown` em sessão P saiu com STXFADM-MASTERLANG
`D` e até FIRSTUSER/LASTUSER `SAP` com datas de 1999/2004 — tudo herdado do molde.

Isso importa porque o **print** (não só a migração) segue a mesma regra: sem `control_parameters-langu`
explícito, o SAP tenta o `sy-langu` de quem imprime e cai para o `MASTERLANG` do form quando o nó não tem
`<T_TEXT>` nesse idioma — nunca para o `<TEXT>` cru. Com o `MASTERLANG` errado (`D`, sem `<T_TEXT>` nos nós
construídos), um documento publicado em P e impresso por uma sessão EN saía com o nó do molde (que tem
`<T_TEXT>` em D/E/P, herdados do `SF_EXAMPLE_01` e reescritos pelo `trocarTextoSmartForm`) e **em branco**
tudo que a lib construiu — exatamente o cenário que a I77 media.

**Fix, em `BLOCO_UPLOAD` (`forms.mjs`, usado por `copiarSmartForm` E `subirSmartFormXml`):**
```abap
lo_new->xml_upload( EXPORTING dom = li_doc2->get_root_element( ) formname = '...' language = sy-langu CHANGING sform = lo_res ).
lo_res->header-masterlang = sy-langu.               " <- sobrescreve o que o DOM trouxe da origem
lo_res->store( im_formname = lo_res->header-formname im_language = sy-langu im_active = 'X' ).
```
Com o `MASTERLANG` correto, o fallback nativo do SAP resolve sozinho — imprimir em QUALQUER idioma de
logon dá o mesmo PDF de quem escreveu. **Nenhuma mudança em `xmlTextoSmartForm`/`renderSmartForm` foi
necessária**; a I77 apontava para o lugar errado (a lib não precisa aprender a escrever texto
multi-idioma — precisa só não mentir sobre em qual idioma escreveu).

**Impacto no gotcha do item 53/54 acima:** "migre no idioma em que o texto existe, não no `MASTERLANG`"
deixa de ser necessário para forms publicados DEPOIS do item 61 — `MASTERLANG` volta a ser a fonte de
verdade, como o item 42 sempre pretendeu. Forms publicados ANTES do fix mantêm o `MASTERLANG` velho (é
metadado gravado, não recalculado); a tabela acima registra a MEDIÇÃO do estado antigo, não uma regra
válida para sempre.

### O que este mapa entrega para a fila 43

O emissor XFA não precisa inventar: para cada bloco da AST do `markdown.mjs` existe um padrão
medido — `draw`+`exData`/XHTML para texto (um `<div>` por linha, com o CSS do parágrafo),
`subform layout="tb"/"table"/"row"/"lr-tb"` para tabela, `field`+`image` com URL do ICF para
gráfico, `field presence="hidden"`+`bind`+`xfa:embed` para variável, `proto`+`use` para
cabeçalho/rodapé. O risco que a fila 54 nomeava ("o XFA migrado pode ser burro") **não se
confirmou** em nenhum degrau: tudo é fluxo (`layout="tb"`/`"lr-tb"`), não posicionamento absoluto.

### Como refazer a medição

```js
// 1) o lado SSFO: a escada MD→SF já fabrica o corpus (§ degraus 1–5 acima)
await publicarMarkdown(cx, { markdown, form: 'YJBV_POC_RS_TAB', estilo: ESTILO_JBV });
const { xml } = await baixarSmartFormXml(cx, { form: 'YJBV_POC_RS_TAB' });
```

```abap
" 2) o lado XFA, em driver classrun: TADIR (SFPI e SFPF) → migrate → FPLAYOUTT em base64
DATA(ls_opt) = cl_ssf_migration=>set_default_migrating_options( ).
ls_opt-table = 'X'. ls_opt-header_footer = 'X'. ls_opt-text_binding = 'X'.  " senão sai errado, calado
cl_ssf_migration=>migrate( sf_name = 'YJBV_POC_RS_TAB' fp_form_name = 'YJBV_RS_TAB_F'
                           fp_interface_name = 'YJBV_RS_TAB_I' options = ls_opt ).
SELECT name, language, state, layout FROM fplayoutt WHERE name = 'YJBV_RS_TAB_F' INTO TABLE @DATA(lt).
" LAYOUT é RSTR (xstring): cl_web_http_utility=>encode_x_base64( ) e a saída sai em pedaços de 200
```

3) alinhar: **a n-ésima linha do nó `TI` é o n-ésimo `<div>` do `<draw>` de mesmo nome** — é essa
correspondência posicional que transforma o par em dicionário.

## 🔁 A migração como OPERAÇÃO da lib (item 55 — medido 2026-09-01, S4H 758, E2E pela lib LOCAL 30/30)

O item 53 respondeu a pergunta ("a via é chamável sem GUI?" — sim) e o item 54 leu o resultado
construto a construto. Este item **escreve a operação**: `migrarSmartFormParaAdobe` em `forms.mjs`.

```js
import { migrarSmartFormParaAdobe } from 'adt-client/forms';

const r = await migrarSmartFormParaAdobe(cx, {
  smartForm: 'YJBV_POC_M55', form: 'YJBV_POC_M55_F', interfaceNome: 'YJBV_POC_M55_I',
  substituir: true,            // apaga um par de mesmo nome antes (tolerante a "não existia")
  // opcoes: { table:false }   // sobreposição ao default da SAP — o resto fica com o do sistema
  // idioma: 'D'               // só a LEITURA do XDP; quem migra é a sessão
  salvarEm: 'doc.xdp',
});
// r.ok · r.xdp (string) · r.anatomia · r.avisos · r.masterlang/sessao/idioma · r.tadir · r.passos
```

### O que a função carrega — e por que cada pedaço existe

| passo | por quê (medido) |
|---|---|
| `SELECT masterlang FROM stxfadm` antes de tudo | Smart Form inexistente falharia dentro do `migrate` com exceção genérica |
| `TR_TADIR_INTERFACE` para **SFPI e SFPF** | sem ela o `RS_CORR_INSERT` abre a dynpro do `SAPLSTRD` e o driver dumpa (`DYNPRO_SEND_IN_BACKGROUND`) |
| `set_default_migrating_options( )` + **sobreposição** | o que ninguém cita fica com o default do SISTEMA — campo novo em outro release não vira invenção nossa |
| `table` · `text_binding` · `header_footer` **ligados** | o default da SAP achata a tabela, perde o dado do campo e não leva cabeçalho/rodapé — dizendo `ok` (item 54) |
| `SELECT layout FROM fplayoutt … state = 'I' AND language = @lv_lang` | o XDP mora na `FPLAYOUTT`, **por idioma**; a `FPLAYOUT` guarda só metadados |
| **não** chama `form_activate` | ativar exige ADS (`CX_FP_API_INTERNAL` no s4h); ler o XDP não exige nem ADS nem ativação |

### Os 22 campos de `SSFMEXPROPERTIES` — a lista, medida por RTTI (não copiada de lugar nenhum)

```
X  → INTERFACE CONTEXT LAYOUT TEMPLATE TEXT TEXT_PLACEHOLDER WINDOW ADDRESS GRAPHIC FOLDER
     COMMAND_PAGEBREAK
'' → CONDITION_DATA CONDITION_LAYOUT ALTERNATIVE_ALL ALTERNATIVE_TRUE TABLE TEXT_APPEND
     TEXT_BINDING OUTPUT_OPTION HEADER_FOOTER COMMAND_REST CODING
```

⚠️ **Correção do § anterior (item 54):** `OUTPUT_OPTION` está na lista dos **VAZIOS**, não na dos
`X` — medido agora componente a componente (`cl_abap_structdescr` + `ASSIGN COMPONENT`), e é o que o
item 53 já dizia. Nome fora desses 22 (`CONDITION_TEXT`, `ALTERNATIVE_TEXT`) não existe na estrutura
e um `ASSIGN COMPONENT` nele falha calado — por isso `validarOpcoesMigracao` recusa **antes da rede**.

### A contra-prova, no MESMO documento (é o assert do item)

Um documento da escada MD→SF com título, parágrafo, **tabela**, `{{CLIENTE}}` e cabeçalho/rodapé,
migrado duas vezes:

| | padrão da LIB | default da SAP |
|---|---|---|
| `layout="table"` | **3** | **0** — a tabela foi ACHATADA |
| `xfa:embed` / `<field>` | **4 / 4** | **0** — `{CLIENTE}` sai como TEXTO no XHTML |
| bytes do XDP | **10.224** | **7.856** |
| o que a migração diz | `ok` | `ok` |

O silêncio tem tamanho, não mensagem: é por isso que a lib devolve `anatomia` (contagem de
`subform`/`draw`/`field`/`image`/`edge`/`layout="table"`/`xfa:embed`/`<div>`) e **avisa** quando uma
dessas três opções é desligada de propósito.

- observado, sem causa isolada: com o `SF_STYLE_01` (`ESTILO_PADRAO`) o XDP saiu com **zero
  `<edge>`** nas DUAS migrações, enquanto o corpus do item 54 (Smart Style próprio `Y_SF_MD`) tinha
  48. A borda de célula é a mesma opção da lib (`bordaTabela: 'baixo'`) nos dois casos → **I79**.

### O aviso de idioma, e o erro que ele evita

O nó que a lib constrói é MONOLÍNGUE (I77): migrar fora do idioma em que o texto foi gravado devolve
a forma inteira e **nenhuma palavra**. A função lê o XDP de volta e conta `<div>` contra `<div/>`
vazios — se não sobrou texto, entra em `r.avisos` com o idioma da sessão no texto. E pedir o XDP num
idioma que a `FPLAYOUTT` não tem é **erro**, não silêncio:

```
forms: migração falhou em MIG_XFA: sem XDP (subrc 4, len 0)
→ o migrate passou e a FPLAYOUTT não tem linha no idioma D: o XDP é gravado POR IDIOMA …
```

### Onde isto para

No objeto gerado: SFPF + SFPI inativos, com `FPCONTEXT-TYPE = 'M'` e `FPINTERFACE-INTERFACE_TYPE =
'S'` (a migração se assina). **Render é a fila 43**, e depende do ADS — que no s4h não existe e no
SXD ainda não resolve o destino `FP_ICF_DATA_SXD` (§ Veredito do ADS).

## 🏗️ A API que CONSTRÓI XFA — `CL_SXFT_*` (item 57 — medido 2026-09-01, S4H 758:250)

A hipótese da I74 confirmou inteira: o migrador SF→Adobe não escreve XML — ele monta uma árvore de
objetos desta família e chama `render( )`. A API é pública, roda em driver classrun, e **o que ela
devolve é um XDP completo com a MESMA assinatura da migração**
(`<?xfa generator="SAP_SmartForms" APIVersion="R700.SP0.N0"?><xdp:xdp><template
xmlns="…/xfa-template/2.2/">`) — o emissor XFA da fila 43 pode nascer pendurado nela em vez de
concatenar tags. Família no s4h: **100 objetos TADIR `*SXFT*`** (29 CLAS + 56 INTF + 7 PROG +
4 TABL); o manual de uso é o fonte de **`CL_SXFT_API_DEMO`** (23 KB, cobre campo/botão/choicelist/
radiobutton/script — nem tudo interessa a impressão).

### A gramática (mínimo que rende, 562 bytes)

```abap
DATA lr_t TYPE REF TO if_sxft_template.
CREATE OBJECT lr_t TYPE cl_sxft_template.            " não há create_ na factory para o template
DATA(lo_f)    = lr_t->get_factory( ).                " 31 métodos create_*
DATA(lo_form) = lo_f->create_subform( name = 'data' ).  lr_t->append_child( lo_form ).
DATA(lo_ps)   = lo_f->create_pageset( ).                lo_form->set_pageset( lo_ps ).
DATA(lo_pa)   = lo_f->create_pagearea( name = 'FIRST' ).
lo_pa->set_medium( long = '297mm' short = '210mm' orientation = 'portrait' stock = 'a4' ).
lo_ps->append_child( lo_pa ).
DATA(lo_ca)   = lo_f->create_contentarea( name = 'contentarea' ).
lo_ca->set_position( x = '25mm' y = '25mm' ).  lo_ca->set_size( w = '160mm' h = '247mm' ).
lo_pa->append_child( lo_ca ).
DATA(lo_main) = lo_f->create_subform( name = 'MAIN' ).
lo_main->if_sxft_measurement~set_layout( 'tb' ).        " fluxo, como a migração
lo_form->append_child( lo_main ).
DATA(lo_draw) = lo_f->create_draw( name = 'TX1' ).  lo_draw->set_size( w = '160mm' h = '10mm' ).
DATA(lo_tx)   = lo_f->create_text( ).  lo_tx->set_content( 'texto' ).
lo_draw->set_value( content = lo_tx ).  lo_main->if_sxft_node~append_child( lo_draw ).
DATA(l_ixml) = cl_ixml=>create( ).  DATA lv_out TYPE xstring.
DATA(l_os) = l_ixml->create_stream_factory( )->create_ostream_xstring( lv_out ).
lr_t->render( l_os ).                                " lv_out = o XDP inteiro
```

Tudo que a Pedra de Roseta (item 54) mapeou tem `create_*`: `exdata` (o XHTML do texto), `field` +
`set_bind`/`set_binditems` (variável), `image` (gráfico), `caption`, `border`/`edge`/`fill`,
`para`/`font`, `items`, `variables` (script). E o template implementa **`IF_SXFT_PROTOTYPE`**
(`insert_as_prototype`/`get_prototype_by_id`) — o `proto`+`use` do cabeçalho/rodapé migrado.

### ⚠️ `SET_CONTENT_AS_XSTRING` do exData é um STUB que a SAP nunca terminou

O corpo do método (758) é uma escada de comentários `TODO:` e uma chamada a `set_content_as_dom`
com o nó **inicial** → `CX_SY_REF_IS_INITIAL` em toda chamada. **O caminho vivo é
`SET_CONTENT_AS_DOM`**: parsear o XHTML com iXML e entregar o elemento raiz —

```abap
DATA(lo_ex) = lo_f->create_exdata( ).  lo_ex->set_content_type( 'text/html' ).
DATA(l_doc) = l_ixml->create_document( ).
DATA(l_ist) = l_sf->create_istream_string( lv_xhtml ).   " <body xmlns=…><div style="…">…</div></body>
l_ixml->create_parser( document = l_doc istream = l_ist stream_factory = l_sf )->parse( ).
lo_ex->set_content_as_dom( l_doc->get_root_element( ) ). " cross-document: aceito, medido
lo_draw->set_value( content = lo_ex ).
```

(No `content_image` o `set_content_as_xstring` é implementado — codifica base64 via
`SCMS_BASE64_ENCODE_STR`.) O stub custou a POC uma rodada: a exceção não declarada escapando de um
método com `RAISING` estreito virou **HTTP 500 mudo do classrun** — a SNAP não tinha dump com o
programa do driver, e a causa só apareceu bissecando com `CATCH cx_root` no `main`. Quando o 500
mudo não deixar dump, bisseque antes de culpar o canal.

### O xstring entra num SFPF real — e byte a byte

`cl_ssf_migration=>migrate( )` **devolve o objeto do workbench** (`IF_FP_WB_FORM`) — não precisa do
`load` (que o item 41 mediu falhando com `i_mode`). Sobre um scaffold migrado de qualquer Smart Form:

```abap
DATA(lo_form) = CAST if_fp_form( lo_wb->get_object( ) ).
lo_form->get_layout( )->set_layout_data( i_layout_data = lv_out i_set_xliff_ids = abap_false ).
lo_wb->save( ).  lo_wb->free( ).  COMMIT WORK AND WAIT.
```

Medido: a `FPLAYOUTT` (state `I`, idioma da sessão) passou de 17.540 bytes (scaffold) para os
**813 bytes do render, idênticos byte a byte** — relidos em OUTRA LUW. O `save` **não validou** o
layout contra a interface/contexto do form (os dois draws da POC não têm relação com o
`SF_EXAMPLE_01`): aceita XDP arbitrário — meio caminho da I82 medido de graça. Com
`i_set_xliff_ids = abap_true` (default) o SAP injetaria ids de tradução — não medido.

### O custo, medido

| medição | valor |
|---|---|
| esqueleto + 2 draws (texto + exData), montar+render | 1,5 ms |
| 100 draws exData, **com 100 parses de XHTML** | 33,8 ms · 24.261 bytes |
| chamadas de API por bloco de texto | ~11 (draw, size, exdata, content_type, doc, istream, parser, parse, dom, value, append) |

Contra emitir string: a string custa ~zero chamadas, mas recompra escape, namespaces e a estrutura
que a API garante. 34 ms num documento de 100 blocos é ruído perto da rede e do render — **custo não
é argumento contra a API**. A decisão do emissor (fila 43) está registrada na **I85**.

### Curiosidade que reforça a I77

O `SF_EXAMPLE_01` migrou **inteiro em sessão P** (17.540 bytes, com texto) — masterlang D. O gotcha
"migrar fora do idioma sai vazio" é dos nossos forms monolíngues (`<TEXT>` sem `<T_TEXT>`), não do
form padrão, que tem `<T_TEXT>` por idioma.

### Como refazer

Cobaias `YJBV_POC_CL_XFT1/2/3` + `YJBV_POC_X57_F/I` em `$TMP`, tudo apagado ao final (TADIR e
FPLAYOUTT vazias, confirmado). Fontes lidos por `getSource` (class/interface): `CL_SXFT_API_DEMO`,
`IF_SXFT_FACTORY`, `IF_SXFT_CONTENT_EXDATA`, `CL_SXFT_CONTENT_ELEMENT`, `IF_FP_LAYOUT`,
`IF_FP_WB_FORM`.

## ✒️ O emissor da AST — `astParaXfa` (item 58 — medido 2026-09-01, S4H 758:250)

A I85 fechada em código: a MESMA AST do `markdown.mjs` vira XDP pela `CL_SXFT_*`, **sem o Smart
Form no meio** — módulo `xfa.mjs` (`adt-client/xfa`). O driver é gerado por documento (como
`publicarMarkdown` faz com o SF-XML); o XHTML dos exData viaja em **base64 dentro do fonte** e o
driver só decodifica, parseia com iXML e pendura por `set_content_as_dom`.

```js
import { astParaXfa } from 'adt-client/xfa';
const r = await astParaXfa(cx, {
  markdown, nome: 'Y_FP_DOC', salvarEm: 'doc.xdp',
  // gravarEm: { scaffold: 'Y_SF_QUALQUER', form: 'Y_FP_DOC_F', interfaceNome: 'Y_FP_DOC_I' },
});
// r.xdp · r.anatomia · r.sha1 · r.variaveis · r.gravacao
```

### O assert do item — mesmo documento, duas vias, mesma contagem

Um documento com título+variável, parágrafo com os três inlines, lista, tabela 3×2 com três
alinhamentos, imagem centrada, citação e cabeçalho/rodapé com `{{PAGINA}}`/`{{PAGINAS}}`, pelas
duas vias no MESMO dia:

| | migração (gabarito) | emissor `astParaXfa` |
|---|---|---|
| subform · draw · field | 28 · 13 · 4 | **28 · 13 · 4** |
| image · `layout="table"` · embed | 1 · 3 · 3 | **1 · 3 · 3** |
| `<div>` (vazios) | 29 (0) | **29 (0)** |
| bytes | 11.051 | 11.040 (nomes/atributos) |

O **CSS dos `<div>` saiu byte a byte igual** ao da migração — inclusive o arredondamento: a SAP
converte a medida para **twips inteiros** antes dos mm, então `TDPLEFT 0,80 cm` vira
`margin-left : 8.01mm` (453,54 tw → 454 → 8,0088), não 8.00. `mmDeTwips`/`twipsDe` reproduzem isso.

E a gravação (via do item 57, `gravarEm`): migrate de um scaffold → `set_layout_data` → `save`,
sha1 da FPLAYOUTT **relido em outra LUW = sha1 do render** (6.452 = 6.452 bytes, hash igual).

### Dois fatos novos que o gabarito entregou

- ✅ **`&SFSY-PAGE&`/`&SFSY-FORMPAGES&` em janela construída VIRAM campo XFA** — a migração (com
  `text_binding='X'`) cria `<subform name="SFSY">` com campos hidden e
  `<event activity="ready" ref="$layout">` + `xfa.layout.page(this)`/`pageCount()`, e o texto
  embeda `SFSY.PAGE`. **Corrige a Pedra de Roseta** ("campo de sistema não vira campo" — vale para
  o CORPO; na janela com text_binding a ponte existe). O emissor faz igual para
  `{{PAGINA}}`/`{{PAGINAS}}`; `{{DATA}}`/`{{HORA}}` seguem sem equivalente medido → erro duro.
- ⚠️ **`append_child( as_ref )` fora da árvore é ENGOLIDO em silêncio**: o `use=` do cabeçalho de
  tabela só sai se o subform-pai JÁ estiver pendurado na árvore quando o `append_child( new_child =
  … as_ref = cxfa_true )` roda — fora dela, rc sem exceção e o `<subform use>` simplesmente não
  aparece no render (27 subforms em vez de 28, sem erro). No pageArea (que já estava na árvore) o
  mesmo padrão funciona. O emissor pendura `lo_tab` na MAIN ANTES do as_ref; há teste de regressão.

### O que o emissor faz DIFERENTE da migração — de propósito

- **largura de célula real** (`larguraDasColunas`): a migração escreve `w="0"` nas células;
- **sem transliteração Latin-1**: exData é XML UTF-8 — o `#` mudo é do device do Smart Form;
- **o texto vive no XDP**: o documento emitido não tem o nó monolíngue (I77) — a FPLAYOUTT continua
  por idioma, mas o conteúdo viaja inteiro no layout;
- lista numerada como a migração escreve: número literal + `<span style="xfa-tab-count : 1 ;"/>`.

### Limites (v1) e observações

- **render em PDF é a fila 43 (ADS)** — o teto daqui é o mesmo do item 54: estrutura no XDP, e o
  par de `gravarEm` nasce INATIVO;
- o recuo pendurado do `LI` (TDPENTRY) fica de fora como na migração; TIF não medido (BMP é o que a
  escada sobe); variável comum em cabeçalho/rodapé é recusada (o bind medido aponta a MAIN);
- **I79, dado novo**: o gabarito deste item saiu com **zero `<edge>`** mesmo com o `Y_SF_MD` recém-
  publicado (o corpus do item 54 tinha 48 com o MESMO estilo) — a borda perdida não é só "qual
  Smart Style"; algo mais decide, segue sem causa isolada (**resolvido no item 62**: é a opção
  `OUTPUT_OPTION` da migração, não o estilo — ver § abaixo);
- custo: já medido no item 57 (100 blocos ≈ 34 ms) — ruído.

### Como refazer

Sonda → gabarito (`publicarMarkdown` + `migrarSmartFormParaAdobe` do mesmo doc) → `astParaXfa` →
`anatomiaXfa` lado a lado → `gravarEm` + releitura por hash em driver novo. Cobaias
`YJBV_POC_X58*` (SF, par migrado, par do emissor, gráfico, drivers) em `$TMP`, tudo apagado;
TADIR/FPLAYOUT/STXBITMAPS/STXSADM confirmadas vazias por readTable.

## 🧱 Por que a borda da tabela some no XFA — I79 (item 62 — medido 2026-09-01, S4H 758:250)

A I79 abriu com um paradoxo: o corpus do item 54 media **48 `<edge>`** numa tabela migrada com
`Y_SF_MD`, mas o item 58 repetiu a MESMA receita (mesmo estilo, recém-publicado) e mediu **zero**.
A hipótese "é o Smart Style" caiu por completo neste item — **causa raiz isolada por eliminação e
depois confirmada por reprodução positiva**, tudo em `$TMP`:

| variável testada | resultado |
|---|---|
| estilo `SF_STYLE_01` vs `Y_SF_MD` (recém-publicado na mesma sessão) | **zero `<edge>` nos dois** |
| `bordaTabela: 'baixo'` vs `'caixa'` (todos os lados) | **zero `<edge>` nos dois** |
| remigrar o MESMO Smart Form duas vezes seguidas | **zero `<edge>` nas duas** |
| documento maior (cabeçalho/rodapé, tabela de 3 colunas com alinhamentos) | **zero `<edge>`** |
| réplica byte a byte da estrutura do item 54 (título H1 direto → tabela, `MDTAB1`, cabeçalho + 3 linhas, 3 colunas) | **zero `<edge>`** |

Em toda medição, o **lado do Smart Form** (`STXSDINF`/`CELLS`/`BORDERS`) veio com o `<BORDERS>`
certo — `LBOTTOM=15.00 TW` + `CBOTTOM USED=X` para `'baixo'`; os quatro lados `USED=X` para
`'caixa'` — **igual nas duas migrações**. A perda é sempre do lado da MIGRAÇÃO, nunca da geração
do Smart Form: `bordaCelula` (forms.mjs) não depende do estilo, e não deveria — e não dependia.

### A pista veio de disco, não de teoria

O item 54 salvou os três `driver.abap` que rodou naquela sessão (`corpus/TAB.driver.abap`,
`TAB.D0.driver.abap`, `TAB.DE.X.driver.abap` — sobreviveram no scratchpad de sessões antigas).
Cruzando os três com a contagem de `<edge>` do XDP correspondente:

| variante | opções ligadas ALÉM do default | `<edge>` |
|---|---|---|
| `TAB.D0` | nenhuma (`set_default_migrating_options` puro) | 0 |
| `TAB.DE.X` | `TABLE`, `HEADER_FOOTER` (o que a lib liga hoje) | 0 |
| `TAB` (a medição original) | `TABLE`, `HEADER_FOOTER`, **`OUTPUT_OPTION`**, + três nomes que não existem na estrutura (`CONDITION_TEXT`/`CONDITION_TEMPLATE`/`ALTERNATIVE_TEXT` — confirmado pelo item 55: não estão nos 22 campos de `SSFMEXPROPERTIES`, então o `ASSIGN COMPONENT` falha calado e não fazem nada) | **48** |

A única opção real de diferença é `OUTPUT_OPTION`. Testado isolado (`opcoes: { output_option:
true }`) sobre um documento NOVO, sem nenhuma outra mudança: **reproduz os 48 `<edge>` exatos** do
item 54 (12 células × 4 = 48). Repetido com `SF_STYLE_01` e uma tabela de 2 colunas diferente:
**24 `<edge>`** (6 células × 4) — confirma que não é amarrado a um estilo nem a um documento.

### O que `OUTPUT_OPTION` realmente controla

Não é só a borda: é a **formatação de saída da célula** — sem ela, `TABLE='X'` migra a
GEOMETRIA da tabela (linhas, colunas, `layout="table"`) mas larga a formatação por célula pelo
caminho, borda incluída, e a migração continua dizendo `ok`. É o mesmo padrão de silêncio que
`TABLE`/`TEXT_BINDING`/`HEADER_FOOTER` já tinham (item 54) — só que documentado incompleto: o
item 54 media com `OUTPUT_OPTION` ligado sem saber que ERA a variável, porque nunca testou
sem ela isoladamente.

### Correção aplicada

`OPCOES_MIGRACAO_PADRAO` (`forms.mjs`) passou a ligar `output_option: true` — quarta opção além
do default da SAP. `migrarSmartFormParaAdobe` avisa se alguém desligar de propósito
(`opcoes: { output_option: false }`), como já fazia para as outras três. 615/615 testes
(`forms.test.mjs` cobre o ABAP gerado e o `OPCOES_MIGRACAO_PADRAO` atualizado).

### Lição de processo

O `driver.abap`/`.xdp.xml` que uma sessão salva em `salvarEm`/scratchpad **sobrevive entre
sessões** (não é limpo automaticamente) — foi ele, não a memória nem o `receita-forms.md`, que
resolveu a I79. Quando um achado antigo não reproduz, vale procurar o material bruto da medição
original antes de reabrir a investigação do zero.

## 🔁 Substituir o layout de um Adobe Form EXISTENTE (item 59 — medido 2026-09-01, S4H 758:250)

Demanda real do sap-note (nota 3751960): "SFP → form → substituir o layout pelo XDP anexo →
salvar". O item 57 já media metade — `set_layout_data` + `save` byte a byte — mas sobre o `wb`
devolvido pelo `migrate`, nunca sobre um `load` de form EXISTENTE. Fecha aqui, em `forms.mjs`
(`substituirLayoutAdobe`), sobre um **clone** do item 41 — nunca sobre form standard.

```js
import { substituirLayoutAdobe } from 'adt-client/forms';
const r = await substituirLayoutAdobe(cx, { form: 'Y_FP_DOC', arquivo: 'anexo-da-nota.xdp' });
// r.state === 'I' · r.len · r.sha1 · r.igual
```

### A receita medida

```
cl_fp_wb_form=>load( i_name i_mode = if_fp_wb_object=>c_mode_write [i_language] [i_ordernum] )
CAST if_fp_form( lo_wb->get_object( ) )->get_layout( )->set_layout_data(
  i_layout_data = <XDP xstring> i_set_xliff_ids = abap_false )
lo_wb->save( ) → free( ) → COMMIT WORK AND WAIT
```

### O que o item 41 tinha deixado em aberto — fechado aqui

- **`i_mode` aceita `READ`/`WRITE`/`TOGGLE`** (`IF_FP_WB_OBJECT=>C_MODE_*`, case-insensitive;
  internamente viram SHOW/MODIFY) — `'SHOW'` cru cai no `WHEN OTHERS` e é exatamente o
  `CX_FP_API_USAGE` "O parâmetro I_MODE não é válido" que o item 41 mediu;
- **`load` em READ (o default) + `set` + `save` é RECUSADO** com o mesmo `CX_FP_API_USAGE` — o
  modo de escrita é WRITE, contra-prova medida no s4h.

### Gotchas medidos

- com `i_set_xliff_ids = abap_false` a FPLAYOUTT guarda o XDP **byte a byte** (sha1 igual ao
  arquivo enviado), state `I`, no idioma do `load` — inclusive um XDP "nascido fora" (escrito à
  mão, namespace `xfa-template` 2.8), **sem validação nenhuma** contra a interface/contexto do
  form;
- ⚠️ o **default do SAP** (`i_set_xliff_ids = abap_true`) **não é fiel**: re-serializa o XDP
  inteiro (atributos reordenados, header reescrito) e injeta o bloco `<tags>` xfa-xliff + um
  `xft-xliff:id` em cada `<text>` — 666 → 871 bytes no mesmo documento da POC. Por isso o default
  **da lib** é `xliffIds: false`;
- o `save` **não valida** que o conteúdo é um XDP (item 57) — quem confere é o guard-rail local
  (`substituirLayoutAdobe` recusa antes da rede um arquivo sem o namespace `xfa-template` nos
  primeiros 2000 bytes);
- o layout entra na versão **INATIVA** (state `I`) — **ativar é outro passo e exige ADS** (item
  53); em sistema sem ADS o form fica gravado esperando ativação;
- o XDP é **por idioma** (gotcha do item 53): o `load` sem `idioma` escreve no idioma de logon da
  sessão — a lib aceita `idioma` explícito.

### Como refazer

Clone do item 41 (`copiarAdobeForm` sobre `FP_TEST_00`) → `substituirLayoutAdobe` com um XDP de
arquivo → SELECT na `FPLAYOUTT` (state `I`, idioma, sha1) comparado ao arquivo enviado →
contra-prova com `xliffIds: true` (bytes mudam) e com `i_mode` READ (recusa). Cobaia
`YJBV_POC_LAYX` em `$TMP`, apagada; ausência confirmada por readTable TADIR/FPLAYOUT.

## 🔌 Gráfico por URL HTTP — a investigação do item 65 (⚠ SUPERADO pelo item 73, § seguinte: a via EXISTE)

> **Histórico.** O item 65 concluiu "a via não existe"; o item 73 achou o handler e a causa e
> desmentiu isso. Leia esta seção como o caminho percorrido; o veredito atual está na § seguinte.


O XFA migrado referencia o bitmap por `href="/sap/bc/fp/graphics/public/graphics/bmap/bcol/<nome>.bmp"`
(ver o mapa do item 54, linha `nó GR`). A hipótese era simples: se o nó ICF existe, um `GET` nessa URL
devolve o BMP, e dá pra conferir/baixar um gráfico de cliente sem GUI e sem driver.

**A hipótese caiu nas DUAS pontas.** Primeiro medida no s4h (sem ADS): 404 em toda variação. A
suspeita óbvia era a mesma dependência do item 40/43 (ADS/AS Java) — então a mesma bateria rodou de
novo no **SXD** (que TEM ADS vivo, § Veredito do ADS acima), com um gráfico novo (`YJBV_POC_I78`,
BCOL, subido por `subirGrafico`/confirmado por `graficoInfo`, apagado ao final, ausência confirmada
por `graficoInfo` de novo): **o resultado foi IDÊNTICO ao s4h**, byte a byte.

| variação | s4h (sem ADS) | SXD (com ADS) |
|---|---|---|
| `…/bmap/bcol/<NOME>.bmp` (nome existente) | 404 | 404 |
| minúsculo, sem `.bmp`, `bmon` no lugar de `bcol`, nome inexistente | 404 | 404 |
| `…/bmap/bcol` (SEM nome) | 200 vazio | 200 vazio |
| `…/bmap` (um nível acima) | 200 vazio | 200 vazio |
| a mesma URL SEM `Authorization` (anônimo) | 404 (igual) | 404 (igual) |

**Isso desmente a hipótese do item 40/43**: a URL não resolver não é o ADS/AS Java faltando — o SXD
tem ADS e o comportamento é o mesmo. O nó ICF existe e está ativo (`bcol`/`bmap` respondem 200 vazio,
confirmados em `ICFSERVLOC`/`ICFHANDLER`), mas **qualquer coisa a mais no path dá 404**, existindo o
gráfico ou não — o 404 não distingue "não achei o gráfico" de "path errado", e por isso a pergunta de
autenticação ficou **indecidível nos dois sistemas**: o recurso nunca resolve, com ou sem credencial.

**Veredito (item 65):** a classe handler que de fato atende `/sap/bc/fp/graphics/bmap/<btype>/<nome>`
não foi identificada por busca ADT (as 3 candidatas — `CL_FP_GRAPHIC_URL`, `CL_FP_GRAPHIC_CONTENT`,
`CL_FP_GRAPHIC` — são o modelo de nó da INTERFACE do Adobe Form, não o serviço ICF). Sem achar essa
classe, a via HTTP parecia inviável, e achar o handler real virou ideia (I86).

## ✅ Gráfico por URL HTTP — a via EXISTE: o handler lê o MIME, e o 404 é MIME vazio + cache negativo (item 73 — I86 — medido 2026-09-02, S4H 758:250)

O item 73 achou o handler e a causa — e **desmentiu o veredito acima**: a via existe e funciona.
A árvore SICF foi decomposta por `readTable` (ICFSERVICE/ICFHANDLER, só leitura; ⚠ `ICF_NAME` é
gravado em MAIÚSCULA, e a linha inteira da ICFSERVICE estoura o `RFC_READ_TABLE` — peça só os campos
`ICF_NAME/ICFPARGUID/ICFNODGUID/ICFALIFLAG/ICFALIGUID`). O caminho até o gráfico é:

- **nó `/sap/bc/fp`**, com DOIS handlers em ordem: `01 CL_FP_WB_HTTP_EXT` (atende só `FORM/…`) e
  **`02 CL_HTTP_EXT_WEBDAV_SKWF`** — o WebDAV do KPro, que serve `graphics/…`.
- Esse handler lê do **MIME Repository** (`IF_MR_API`), **não do BDS**. O gráfico do SE78 vive no BDS
  (`STXBITMAPS`); a URL só resolve depois que ele é COPIADO para o MIME — o que o report
  `RSXFT_MIGRATE_BDS_GRAPHICS` faz por `CL_SSF_MIGRATION=>MIGRATE_GRAPHIC_BDS_TO_MIME`
  (`get_bds_graphic_as_bmp` → `mr_api->put`). O href é montado por
  `CL_SSF_XSF_UTILITIES=>MIME_URL_FOR_BDS_GRAPHIC` (base `/sap/bc/fp/graphics/public` + `object/id/
  btype/nome.bmp`, tudo minúsculo).

**Por que o item 65 mediu 404 em tudo — duas causas somadas, medidas por contra-prova:**

1. **O MIME estava vazio.** O item 65 subiu o gráfico no BDS e leu a URL — mas ninguém rodou o passo
   BDS→MIME. Sem o `put` no MIME, o WebDAV não tem o que servir → 404. (Provado: subir só no BDS
   mantém 404; após o `put` no MIME a MESMA URL dá 200 + o BMP.)
2. **O 404 é CACHEADO ~24h no servidor** (`sap-cache-control: +86400`). Uma vez que a URL 404, aquele
   404 fica cacheado — então cada nova sonda do item 65 à MESMA URL reforçava o cache e não teria como
   passar, existisse o gráfico ou não. **Leitura NEGATIVA é cacheada; leitura POSITIVA é ao vivo**
   (o `delete` volta a 404 na hora, e um nome fresco publicado resolve de primeira).

Com isso, dois "achados" do item 65 caem: **não é caixa** (num nome FRESCO, minúsculo e MAIÚSCULO
resolvem igual — o 404-só-em-minúsculo era o cache negativo herdado da sonda anterior), e **não é
ADS** (o item 65 já tinha descartado pelo SXD). Responde até **anônima** (o nó `public` tem usuário
de serviço). Regra de medição: **nunca sondar a URL principal ANTES de publicar** — o 404 cacheado
envenena o teste; use um nome-irmão para a contra-prova de "MIME vazio".

**A lib publica e despublica** (`forms.mjs`, item 73):

```js
const { url } = await publicarGraficoHttp(cx, { nome: 'ZLOGO_ACME' });
// copia BDS→MIME; url === '/sap/bc/fp/graphics/public/graphics/bmap/bcol/zlogo_acme.bmp'
// GET nessa URL → 200 + BMP (case-insensitive, até anônimo)
await despublicarGraficoHttp(cx, { nome: 'ZLOGO_ACME', confirm: true }); // remove do MIME → 404
```

`urlGraficoHttp({ nome, cor })` dá a URL sem tocar o sistema (a mesma que o XFA migrado referencia).
O gráfico tem de existir no BDS antes (`subirGrafico`/SE78) — ausência vira erro claro. Isso alimenta
o item 43: o ADS, ao renderizar o XFA, busca o gráfico nessa URL — que agora dá para popular sem GUI.
Sobrou a classe HTTP nomeada mas não decompilada em detalhe (o `crack_skwf_url` do WebDAV) → segue
sem impacto prático. **A lib segue lendo o gráfico do BDS por `graficoInfo`; a novidade é publicá-lo
por HTTP.**
