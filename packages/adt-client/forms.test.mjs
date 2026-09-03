// forms.test.mjs — parte pura do módulo de forms: fonte dos drivers e parse das saídas medidas no s4h.
import { test, expect } from 'vitest';
import {
  buildSmartFormDriverSource,
  buildAdobeFormDriverSource,
  parseSmartFormOutput,
  parseAdobeFormOutput,
  parseAdobeInterfaceParams,
  contemTexto,
  buildAdobeCopySource,
  buildAdobeDeleteSource,
  parseAdobeCopyOutput,
  buildLayoutReplaceSource,
  parseLayoutReplaceOutput,
  xmlTextoSmartForm,
  xmlTabelaSmartForm,
  inserirNoSmartForm,
  buildSmartFormCopySource,
  buildSmartFormXmlDownloadSource,
  buildSmartFormXmlUploadSource,
  buildSmartFormDeleteSource,
  parseSmartFormCopyOutput,
  juntarBase64,
  acrescentarInterfaceSmartForm,
  parametrosDaInterface,
  nosDoSmartForm,
  apontarProximaPagina,
  definirFormatoSmartForm,
  xmlJanelaSmartForm,
  podarSmartForm,
  limparInterfaceSmartForm,
  trocarTextoSmartForm,
  fatiarTdline,
  posicionarJanelaSmartForm,
  clonarNoSmartForm,
  xmlGraficoSmartForm,
  formatoDaImagem,
  buildGraphicUploadSource,
  buildGraphicDeleteSource,
  parseGraphicUploadOutput,
  urlGraficoHttp,
  buildGraphicPublishSource,
  ESTILO_MARKDOWN,
  validarSmartStyle,
  buildSmartStyleSource,
  buildSmartStyleDeleteSource,
  parseSmartStyleOutput,
  definirEstiloSmartForm,
  OPCOES_MIGRACAO,
  OPCOES_MIGRACAO_PADRAO,
  validarOpcoesMigracao,
  buildMigracaoAdobeSource,
  parseMigracaoOutput,
  anatomiaXfa,
} from './forms.mjs';

test('forms: driver de Smart Form — FM por SSF_FUNCTION_MODULE_NAME, getotf, CONVERT_OTF PDF + ASCII, bindings do chamador', () => {
  const s = buildSmartFormDriverSource('y_sf_x', { form: 'sf_example_01', declaracoes: '    DATA ls_cust TYPE scustom.', preparo: "      SELECT SINGLE * FROM scustom INTO ls_cust WHERE id = '00000001'.",
    exporting: { CUSTOMER: 'ls_cust', bookings: 'lt_book' }, tables: { itens: 'lt_itens' }, maxTexto: 50 });
  expect(s).toContain('CLASS y_sf_x DEFINITION');
  expect(s).toContain("CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME' EXPORTING formname = 'SF_EXAMPLE_01'");
  expect(s).toContain('DATA ls_cust TYPE scustom.');
  expect(s).toContain("SELECT SINGLE * FROM scustom INTO ls_cust WHERE id = '00000001'.");
  expect(s).toContain("ls_ctrl-no_dialog = 'X'. ls_ctrl-getotf = 'X'. ls_out-tddest = 'LP01'.");
  expect(s).toContain("user_settings = ' ' customer = ls_cust bookings = lt_book");
  expect(s).toContain('TABLES itens = lt_itens');
  expect(s).toContain("CALL FUNCTION 'CONVERT_OTF' EXPORTING format = 'PDF'");
  expect(s).toContain("CALL FUNCTION 'CONVERT_OTF' EXPORTING format = 'ASCII'");
  expect(s).toContain('IF sy-tabix > 50. EXIT. ENDIF.');
  expect(s).toContain('CATCH cx_root INTO DATA(lx).');
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
  const semTables = buildSmartFormDriverSource('y_sf_y', { form: 'SF_EXAMPLE_01' });
  expect(semTables).not.toMatch(/IMPORTING job_output_info = ls_job\n\s+TABLES /);
  expect(() => buildSmartFormDriverSource('y_sf_z', {})).toThrow(/informe \{ form \}/);
});

test('forms: driver de Adobe Form — interface por FPCONTEXT→FPINTERFACE, FP_JOB_OPEN/CLOSE, docparams, ADS', () => {
  const s = buildAdobeFormDriverSource('y_fp_x', { form: 'FP_TEST_00', declaracoes: '    DATA lt_text TYPE tsftext.', exporting: { textlines: 'lt_text' }, langu: 'P', country: 'BR', connection: 'ADS2', fillable: true });
  expect(s).toContain("SELECT SINGLE interface FROM fpcontext INTO lv_ifn WHERE name = 'FP_TEST_00' AND state = 'A'.");
  expect(s).toContain('SELECT SINGLE interface FROM fpinterface INTO lv_ifx WHERE name = lv_ifn');
  expect(s).toContain('cl_abap_codepage=>convert_from( lv_ifx )');
  expect(s).toContain("CALL FUNCTION 'FP_FUNCTION_MODULE_NAME' EXPORTING i_name = 'FP_TEST_00'");
  expect(s).toContain("ls_outp-nodialog = 'X'. ls_outp-getpdf = 'X'. ls_outp-dest = 'LP01'. ls_outp-connection = 'ADS2'.");
  expect(s).toContain("ls_docp-langu = 'P'. ls_docp-country = 'BR'. ls_docp-fillable = 'X'.");
  expect(s).toContain('CALL FUNCTION lv_fm EXPORTING /1bcdwb/docparams = ls_docp textlines = lt_text');
  expect(s).toContain("CALL FUNCTION 'FP_JOB_CLOSE'");
  expect(s).toContain("lv_fn = 'FP_GET_LAST_ADS_ERRSTR'.");
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
  const d = buildAdobeFormDriverSource('y_fp_y', { form: 'FP_TEST_00' });
  expect(d).not.toContain("ls_outp-connection = '");
  expect(d).not.toContain('fillable');
  expect(d).toContain("ls_docp-langu = 'E'. ls_docp-country = 'US'.");
});

test('forms: parse do Smart Form medido no s4h (SF_EXAMPLE_01 → PDF 13.235 bytes, %PDF-1.3, texto)', () => {
  const saida = 'SF_FM SF_EXAMPLE_01 subrc=0 fm=/1BCDWB/SF00000030 \nSF_CALL subrc=0 otf_lines=270 \nSF_PDF subrc=0 pages=1 size=13235 xlen=13235 head=255044462D312E33 \nSF_TXT_RC subrc=0 lines=60 \nSF_TXT Exmos. Senhores,\nSF_TXT SAP AG   \nSF_TXT Número do cliente 00000001\n';
  const r = parseSmartFormOutput(saida);
  expect(r.ok).toBe(true);
  expect(r).toMatchObject({ form: 'SF_EXAMPLE_01', fm: '/1BCDWB/SF00000030', fmSubrc: 0, subrc: 0, msg: null, exc: null, otfLines: 270, textoLinhas: 60 });
  expect(r.pdf).toEqual({ pages: 1, size: 13235, head: '255044462D312E33', isPdf: true });
  expect(r.texto).toEqual(['Exmos. Senhores,', 'SAP AG', 'Número do cliente 00000001']);
  expect(contemTexto(r, 'sap ag')).toBe(true);
  expect(contemTexto(r, 'Senhores, SAP')).toBe(true);
  expect(contemTexto(r, 'cliente 00000002')).toBe(false);
  const semForm = parseSmartFormOutput('SF_FM YJBV_NAO_EXISTE subrc=1 fm= O formulário YJBV_NAO_EXISTE não existe\n');
  expect(semForm.ok).toBe(false); expect(semForm.fm).toBeNull(); expect(semForm.fmSubrc).toBe(1); expect(semForm.msg).toMatch(/não existe/);
  const exc = parseSmartFormOutput('SF_FM SF_EXAMPLE_01 subrc=0 fm=/1BCDWB/SF00000030 \nSF_CALL exc O parâmetro obrigatório CUSTOMER não está preenchido.\n');
  expect(exc.ok).toBe(false); expect(exc.exc).toMatch(/CUSTOMER/); expect(exc.pdf).toBeNull();
});

test('forms: parse do Adobe Form medido no s4h (interface legível; ADS do laboratório não responde)', () => {
  const saida = 'FP_IF FP_TEST_00 subrc=0 interface=FP_TEST_00\nFP_IF_PARAMS <IMPORT_PARAMETERS><SFPIOPAR><NAME>TEXTLINES</NAME><TYPING>TYPE</TYPING><TYPENAME>TSFTEXT</TYPENAME><OPTIONAL></OPTIONAL><BYVALUE></BYVALUE></SFPIOPAR><SFPIOPAR><NAME>TITLE</NAME><TYPING>TYPE</TYPING><TYPENAME>STRING</TYPENAME><OPTIONAL>X</OPTIONAL></SFPIOPAR>\n'
    + 'FP_FM FP_TEST_00 subrc=0 fm=/1BCDWB/SM00000007 \nFP_JOB_OPEN subrc=0 connection=ADS \nFP_CALL subrc=2 pages=0 xlen=0 head= Serviços de documentação Adobe: SOAP Runtime Exception: CSoapExceptionTransport : (100101)\n'
    + 'FP_ADS_ERR SOAP Framework error: SOAP Runtime Exception: CSoapExceptionTransport : HTTP receive failed with exception communication_failure  (100.101).\nFP_JOB_CLOSE subrc=1\n';
  const r = parseAdobeFormOutput(saida);
  expect(r.ok).toBe(false);
  expect(r).toMatchObject({ form: 'FP_TEST_00', fm: '/1BCDWB/SM00000007', interface: 'FP_TEST_00', subrc: 2, jobClose: 1 });
  expect(r.params).toEqual([{ name: 'TEXTLINES', typing: 'TYPE', typename: 'TSFTEXT', optional: false }, { name: 'TITLE', typing: 'TYPE', typename: 'STRING', optional: true }]);
  expect(r.jobOpen).toEqual({ subrc: 0, connection: 'ADS', msg: null });
  expect(r.msg).toMatch(/CSoapExceptionTransport/);
  expect(r.adsErr).toMatch(/communication_failure/);
  expect(r.pdf).toEqual({ pages: 0, size: 0, head: '', isPdf: false });
  const ok = parseAdobeFormOutput('FP_IF FP_TEST_00 subrc=0 interface=FP_TEST_00\nFP_FM FP_TEST_00 subrc=0 fm=/1BCDWB/SM00000007 \nFP_JOB_OPEN subrc=0 connection=ADS \nFP_CALL subrc=0 pages=1 xlen=20480 head=255044462D312E37 \nFP_JOB_CLOSE subrc=0\n');
  expect(ok.ok).toBe(true); expect(ok.pdf).toEqual({ pages: 1, size: 20480, head: '255044462D312E37', isPdf: true }); expect(ok.adsErr).toBeNull();
  expect(parseAdobeInterfaceParams('')).toEqual([]);
});

// ---------- cópia sem GUI (item 41, medido 2026-08-31 no SXD 816) ----------

test('forms: o driver de cópia usa a API do workbench, com I_DARK só no FORM', () => {
  const src = buildAdobeCopySource('YJBV_FP_COPY', { origem: 'FP_TEST_00', form: 'Y_FP_F41', interfaceNova: 'Y_FP_IF41' });
  // a interface vem primeiro — o form a referencia
  expect(src.indexOf('cl_fp_wb_interface=>copy')).toBeLessThan(src.indexOf('cl_fp_wb_form=>copy'));
  expect(src).toContain("cl_fp_wb_interface=>copy( i_source = 'FP_TEST_00' i_name = 'Y_FP_IF41' i_devclass = '$TMP' )");
  // I_DARK (o "sem UI") existe só no form: passá-lo à interface é erro de compilação
  expect(src).toContain("cl_fp_wb_form=>copy( i_source = 'FP_TEST_00' i_name = 'Y_FP_F41' i_devclass = '$TMP' i_dark = 'X' )");
  expect(src.match(/i_dark/g)).toHaveLength(1);
  expect(src).toContain("cl_fp_wb_helper=>interface_activate( i_name = 'Y_FP_IF41' )");
  expect(src).toContain("cl_fp_wb_helper=>form_activate( i_name = 'Y_FP_F41' i_language = sy-langu )");
});

test('forms: cópia só da interface, e a ordem de exclusão é a inversa (form antes)', () => {
  const soIf = buildAdobeCopySource('X', { origem: 'FP_TEST_00', interfaceNova: 'Y_FP_IF41' });
  expect(soIf).not.toContain('cl_fp_wb_form=>copy');
  const del = buildAdobeDeleteSource('X', { form: 'Y_FP_F41', interfaceNome: 'Y_FP_IF41' });
  expect(del.indexOf('cl_fp_wb_form=>delete')).toBeLessThan(del.indexOf('cl_fp_wb_interface=>delete'));
  expect(buildAdobeCopySource('X', { origem: 'FP_TEST_00', form: 'Y_FP_F41', ativar: false })).not.toContain('form_activate');
  const comTr = buildAdobeCopySource('X', { origem: 'FP_TEST_00', form: 'Y_FP_F41', pkg: '$YJBV', corrNr: 'S4HK900001' });
  expect(comTr).toContain("i_devclass = '$YJBV' i_ordernum = 'S4HK900001'");
});

test('forms: guard-rails da cópia, antes da rede', () => {
  expect(() => buildAdobeCopySource('X', { origem: 'FP_TEST_00', form: 'FP_OUTRO' })).toThrow(/não é objeto Z\/Y/);
  expect(() => buildAdobeCopySource('X', { origem: 'FP_TEST_00', interfaceNova: 'SAP_IF' })).toThrow(/não é objeto Z\/Y/);
  expect(() => buildAdobeCopySource('X', { origem: 'FP_TEST_00' })).toThrow(/exige \{ form \}/);
  expect(() => buildAdobeDeleteSource('X', {})).toThrow(/exige \{ form \}/);
  expect(() => buildAdobeCopySource('X', { form: 'Y_FP_X' })).toThrow(/informe \{ form \}/);
});

test('forms: parse da saída de cópia — a medida real do SXD, e a falha opaca do s4h', () => {
  const bom = parseAdobeCopyOutput('IF_COPY ok\nIF_ACT ok\nFORM_COPY ok\nFORM_ACT ok\n');
  expect(bom.ok).toBe(true);
  expect(bom.passos.map((p) => p.passo)).toEqual(['IF_COPY', 'IF_ACT', 'FORM_COPY', 'FORM_ACT']);
  // s4h (ADS que não responde): a interface copia, o FORM não — e a exceção não diz por quê
  const ruim = parseAdobeCopyOutput('IF_COPY ok\nIF_ACT ok\nFORM_COPY EXC \\CLASS=CX_FP_API_INTERNAL: Ocorreu um erro interno em SAFP API\n');
  expect(ruim.ok).toBe(false);
  expect(ruim.passos.at(-1)).toEqual({ passo: 'FORM_COPY', ok: false, erro: '\\CLASS=CX_FP_API_INTERNAL: Ocorreu um erro interno em SAFP API' });
  expect(parseAdobeCopyOutput('')).toEqual({ ok: false, passos: [] });
});

// ---------- substituir o layout por XDP de arquivo (item 59, medido 2026-09-01 no s4h 758) ----------

test('forms: o driver de substituição carrega em WRITE (READ recusa o save) e grava sem xliff por default', () => {
  const b64 = Buffer.from('<template xmlns="http://www.xfa.org/schema/xfa-template/2.8/"/>').toString('base64');
  const src = buildLayoutReplaceSource('YJBV_FP_LAYX', { form: 'Y_FP_DOC', xdpBase64: b64 });
  expect(src).toContain("cl_fp_wb_form=>load( i_name = 'Y_FP_DOC' i_mode = if_fp_wb_object=>c_mode_write )");
  expect(src).toContain('set_layout_data( i_layout_data = lv_xdp i_set_xliff_ids = abap_false )');
  expect(src).toContain('COMMIT WORK AND WAIT');
  expect(src).toContain("state = 'I' AND language = @sy-langu");
  for (const l of src.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
  const comTudo = buildLayoutReplaceSource('X', { form: 'Y_FP_DOC', xdpBase64: b64, xliffIds: true, idioma: 'p', corrNr: 'S4HK900001' });
  expect(comTudo).toContain('i_set_xliff_ids = abap_true');
  expect(comTudo).toContain("i_language = 'P' i_ordernum = 'S4HK900001'");
  expect(comTudo).toContain("language = @'P'");
});

test('forms: guard-rails da substituição, antes da rede', () => {
  expect(() => buildLayoutReplaceSource('X', { form: 'FP_TEST_00', xdpBase64: 'AA==' })).toThrow(/não é objeto Z\/Y/);
  expect(() => buildLayoutReplaceSource('X', { form: 'Y_FP_DOC' })).toThrow(/exige o XDP/);
  expect(() => buildLayoutReplaceSource('X', { xdpBase64: 'AA==' })).toThrow(/informe \{ form \}/);
});

test('forms: parse da substituição — a medida real do s4h (byte a byte com xliff=false; READ com CX_FP_API_USAGE)', () => {
  const bom = parseLayoutReplaceOutput('LAYOUT_PUT ok\nLAYOUT_LIDO len=666 sha1=5D631BAC62DAA62CDFE2EB5E856191E176EDF165 igual=X\n');
  expect(bom).toEqual({ ok: true, erro: null, len: 666, sha1: '5D631BAC62DAA62CDFE2EB5E856191E176EDF165', igual: true });
  // com o default do SAP (xliff ids) os bytes MUDAM: 666 → 871 na POC — igual= sai vazio
  const xliff = parseLayoutReplaceOutput('LAYOUT_PUT ok\nLAYOUT_LIDO len=871 sha1=CB37096E1A30840AC7761BE27D6EFA7C7EEDB87B igual=\n');
  expect(xliff.ok).toBe(true); expect(xliff.igual).toBe(false); expect(xliff.len).toBe(871);
  // o contrafactual medido: load READ + set + save → CX_FP_API_USAGE
  const read = parseLayoutReplaceOutput('LAYOUT_PUT EXC \\CLASS=CX_FP_API_USAGE: Ocorreu um erro durante a chamada de SAFP API\n');
  expect(read.ok).toBe(false); expect(read.erro).toMatch(/CX_FP_API_USAGE/);
  expect(parseLayoutReplaceOutput('').ok).toBe(false);
});

// ------------------------------------------------------------------------------------------
// Smart Form SEM GUI e a escada (item 42) — fixture recortada do XML real do SF_EXAMPLE_01
// (`xml_download` no S4H 758): nó `RC` COM ATRIBUTO, filhos embrulhados em `<sf:item>`,
// INTERFACE com e sem `<STANDARD>X</STANDARD>`, TEXT/T_TEXT por idioma e a posição no OUTATTR.

const XML = '<?xml version="1.0" encoding="utf-16"?><sf:SMARTFORM xmlns:sf="urn:sap-com:SmartForms:2000:internal-structure" xmlns="urn:sap-com:sdixml-ifr:2000">'
  + '<HEADER><FORMNAME>Y_SF_C42</FORMNAME></HEADER>'
  + '<INTERFACE><item><IOTYPE>I</IOTYPE><NAME>CONTROL_PARAMETERS</NAME><STANDARD>X</STANDARD></item>'
  + '<item><IOTYPE>I</IOTYPE><NAME>BOOKINGS</NAME><TYPENAME>TY_BOOKINGS</TYPENAME></item></INTERFACE>'
  + '<VARHEADER><item><PAGEFORMAT>DINA4</PAGEFORMAT><sf:PAGETREE><sf:NODE><NODETYPE>RP</NODETYPE><sf:SUCC>'
  + '<sf:item><sf:NODE><NODETYPE>PA</NODETYPE><sf:OBJ><sf:PAGE><NAME><INAME>FIRST</INAME></NAME><CAPTION>Página inicial</CAPTION>'
  + '<NEXTPAGE><INAME>NEXT</INAME></NEXTPAGE><NUMB_MODE>I</NUMB_MODE><NUMB_TYPE>A</NUMB_TYPE><PAGEORTN>P</PAGEORTN></sf:PAGE></sf:OBJ><sf:SUCC>'
  + '<sf:item><sf:NODE><NODETYPE>WI</NODETYPE><sf:OBJ><sf:WINDOW ID="786 "><NAME><INAME>MAIN</INAME></NAME><CAPTION>Janela principal</CAPTION>'
  + '<sf:PROC_CTRL><sf:NODE ID="834 "><NODETYPE>RC</NODETYPE><sf:SUCC>'
  + '<sf:item><sf:NODE><NODETYPE>TI</NODETYPE><sf:OBJ><sf:TEXT><NAME><INAME>INTRODUCTION</INAME></NAME><CAPTION>Carta</CAPTION>'
  + '<TEXT><item><TDFORMAT>AS</TDFORMAT><TDLINE>Exmos. Senhores,</TDLINE></item></TEXT>'
  + '<T_TEXT><item><SPRAS>D</SPRAS><TXTYPE>F</TXTYPE><FORMNAME>Y_SF_C42</FORMNAME><INAME>INTRODUCTION</INAME><LINENR>000001</LINENR><TDFORMAT>AS</TDFORMAT><TDLINE>Sehr geehrte</TDLINE></item>'
  + '<item><SPRAS>P</SPRAS><TXTYPE>F</TXTYPE><FORMNAME>Y_SF_C42</FORMNAME><INAME>INTRODUCTION</INAME><LINENR>000001</LINENR><TDFORMAT>AS</TDFORMAT><TDLINE>Exmos. Senhores,</TDLINE></item></T_TEXT>'
  + '</sf:TEXT></sf:OBJ><sf:OUTATTR><sf:OUTATTR><NAME><INAME>%OUTATTRIB10</INAME></NAME></sf:OUTATTR></sf:OUTATTR><sf:SUCC/></sf:NODE></sf:item>'
  + '</sf:SUCC></sf:NODE></sf:PROC_CTRL></sf:WINDOW></sf:OBJ>'
  + '<sf:OUTATTR><sf:OUTATTR><NAME><INAME>%OUTATTRIB1</INAME></NAME><WLEFT>2.00</WLEFT><U_WLEFT>CM</U_WLEFT><WWIDTH>16.00</WWIDTH><U_WWIDTH>CM</U_WWIDTH>'
  + '<WTOP>10.00</WTOP><U_WTOP>CM</U_WTOP><WHEIGHT>16.00</WHEIGHT><U_WHEIGHT>CM</U_WHEIGHT></sf:OUTATTR></sf:OUTATTR></sf:NODE></sf:item>'
  + '<sf:item><sf:NODE><NODETYPE>WI</NODETYPE><sf:OBJ><sf:WINDOW><NAME><INAME>FOOTER</INAME></NAME></sf:WINDOW></sf:OBJ>'
  + '<sf:PROC_CTRL><sf:NODE ID="900 "><NODETYPE>RC</NODETYPE><sf:SUCC/></sf:NODE></sf:PROC_CTRL><sf:SUCC/></sf:NODE></sf:item>'
  + '</sf:SUCC></sf:NODE></sf:item></sf:SUCC></sf:NODE></sf:PAGETREE></item></VARHEADER></sf:SMARTFORM>';

test('forms: driver de cópia de Smart Form — download, RE-PARSE (o passo que decide) e geração do FM', () => {
  const s = buildSmartFormCopySource('y_sf_copy', { origem: 'sf_example_01', form: 'y_sf_c42' });
  expect(s).toContain("lo_sf->load( im_formname = 'SF_EXAMPLE_01' im_language = '' )");
  expect(s).toContain('lo_sf->xml_download( EXPORTING parent = li_doc CHANGING document = li_doc )');
  // sem estes dois o form sobe só com o cabeçalho e a geração morre em generation_error
  expect(s).toContain("value = 'urn:sap-com:SmartForms:2000:internal-structure'");
  expect(s).toContain('li_parser = li_ixml->create_parser( stream_factory = li_sfac istream = li_ist document = li_doc2 )');
  expect(s.indexOf('li_rend->render( )')).toBeLessThan(s.indexOf('li_parser->parse( )'));
  expect(s).toContain("wi_tadir_object = 'SSFO' wi_tadir_obj_name = 'Y_SF_C42'");
  expect(s).toContain("mode = 'INSERT' formname = 'Y_SF_C42'");
  // item 61/I77: sem isto o MASTERLANG persistido é o do DOM enviado (a ORIGEM), não o da sessão —
  // `master_language = sy-langu` do enqueue não gruda, quem manda é o header do xml_upload.
  expect(s.indexOf('lo_res->header-masterlang = sy-langu.')).toBeLessThan(s.indexOf('lo_res->store('));
  expect(s).toContain("lo_res->store( im_formname = lo_res->header-formname im_language = sy-langu im_active = 'X' )");
  expect(s).toContain("CALL FUNCTION 'FB_GENERATE_FORM' EXPORTING i_formname = 'Y_SF_C42'");
  expect(s).not.toContain("CALL FUNCTION 'FB_DELETE_FORM'"); // substituir: false é o default da cópia
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
  expect(() => buildSmartFormCopySource('x', { origem: 'SF_EXAMPLE_01', form: 'SF_OUTRO' })).toThrow(/não é objeto Z\/Y/);
});

test('forms: XML do form vai e volta em base64 — chunks na saída, literais no fonte', () => {
  const dl = buildSmartFormXmlDownloadSource('y_sf_xml', { form: 'Y_SF_C42' });
  expect(dl).toContain('lv_x = cl_abap_codepage=>convert_to( lv_xml ).');
  expect(dl).toContain('lv_b64 = cl_web_http_utility=>encode_x_base64( lv_x ).');
  expect(dl).toContain('out->write( |SFX_B64 { lv_b64+lv_off(lv_cut) }| ).');
  const up = buildSmartFormXmlUploadSource('y_sf_put', { form: 'Y_SF_D1', xml: XML });
  expect(up).toContain('lv_x = cl_web_http_utility=>decode_x_base64( lv_b64 ).');
  expect(up).toContain('lv_xml = cl_abap_codepage=>convert_from( lv_x ).');
  expect(up).toContain("CALL FUNCTION 'FB_DELETE_FORM'"); // substituir: true é o default do upload
  // o reparse cria o ixml quando o bloco de download não rodou (sem isso: OBJECTS_OBJREF_NOT_ASSIGNED)
  expect(up).toContain('IF li_ixml IS INITIAL.');
  const b64 = [...up.matchAll(/APPEND '([^']*)' TO lt_b64\./g)].map((m) => m[1]);
  expect(Buffer.from(b64.join(''), 'base64').toString('utf8')).toBe(XML);
  for (const l of up.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
  expect(() => buildSmartFormXmlUploadSource('x', { form: 'Y_SF_D1' })).toThrow(/exige \{ xml \}/);
});

test('forms: base64 partido em pedaços volta inteiro — e recusa saída truncada', () => {
  expect(juntarBase64('SF_B64_LEN 8\nSF_B64 QUJD\nSF_B64 REVG\n', 'SF_B64')).toBe('QUJDREVG');
  expect(juntarBase64('SF_PDF subrc=0\n', 'SF_B64')).toBe(null);
  expect(() => juntarBase64('SF_B64_LEN 12\nSF_B64 QUJD\n', 'SF_B64')).toThrow(/truncado/);
});

test('forms: a árvore do form — nó com atributo, tipo, INAME do PRÓPRIO nó e hierarquia', () => {
  const nos = nosDoSmartForm(XML);
  expect(nos.map((n) => `${n.tipo}:${n.iname}`)).toEqual(['RP:', 'PA:FIRST', 'WI:MAIN', 'RC:', 'TI:INTRODUCTION', 'WI:FOOTER', 'RC:']);
  expect(nos[2].obj).toBe('WINDOW');
  expect(nos[4].caption).toBe('Carta');
  expect(nos[1].profundidade).toBe(1);
});

test('forms: poda — só o caminho até o que se pede fica, e o <sf:item> do nó vai junto', () => {
  const podado = podarSmartForm(XML, { manter: ['FIRST', 'MAIN', 'INTRODUCTION'] });
  expect(nosDoSmartForm(podado).map((n) => `${n.tipo}:${n.iname}`)).toEqual(['RP:', 'PA:FIRST', 'WI:MAIN', 'RC:', 'TI:INTRODUCTION']);
  expect(podado).not.toContain('FOOTER');
  expect(podado.match(/<sf:item>/g).length).toBe(podado.match(/<\/sf:item>/g).length);
  // janela que sobra sem conteúdo não sobrevive: o RC vazio é estrutural, não é motivo para viver
  const soPagina = podarSmartForm(XML, { manter: ['FIRST'] });
  expect(nosDoSmartForm(soPagina).map((n) => n.tipo)).toEqual(['RP', 'PA']);
});

test('forms: interface limpa deixa só o que é do Smart Form padrão', () => {
  const limpo = limparInterfaceSmartForm(XML);
  expect(limpo).toContain('CONTROL_PARAMETERS');
  expect(limpo).not.toContain('BOOKINGS');
});

test('forms: a interface GANHA parâmetro — o form estático vira formulário (item 48)', () => {
  const com = acrescentarInterfaceSmartForm(limparInterfaceSmartForm(XML), [{ nome: 'numero' }, { nome: 'TOTAL', tipo: 'string', opcional: true }]);
  expect(com).toContain('<item><IOTYPE>I</IOTYPE><NAME>NUMERO</NAME><TYPING>TYPE</TYPING><TYPENAME>STRING</TYPENAME><BYVALUE>X</BYVALUE></item>');
  expect(com).toContain('<NAME>TOTAL</NAME><TYPING>TYPE</TYPING><TYPENAME>STRING</TYPENAME><OPTIONAL>X</OPTIONAL>');
  // o parâmetro do form NÃO é do Smart Form padrão: sem <STANDARD>, senão o limpar o levaria embora
  expect(limparInterfaceSmartForm(com)).not.toContain('NUMERO');
  const lidos = parametrosDaInterface(com);
  expect(lidos.map((p) => p.nome)).toEqual(['CONTROL_PARAMETERS', 'NUMERO', 'TOTAL']);
  expect(lidos[0].padrao).toBe(true);
  expect(lidos[1]).toMatchObject({ ioType: 'I', tipo: 'STRING', opcional: false, padrao: false });
  // nome repetido é engano de quem chama, e o SAP só reclamaria na geração
  expect(() => acrescentarInterfaceSmartForm(XML, ['BOOKINGS'])).toThrow(/já existe/);
  expect(() => acrescentarInterfaceSmartForm(XML, ['1NOTA'])).toThrow(/não serve como parâmetro/);
  expect(() => acrescentarInterfaceSmartForm('<sf:SMARTFORM/>', ['X'])).toThrow(/não tem <INTERFACE>/);
  expect(acrescentarInterfaceSmartForm(XML, [])).toBe(XML);
});

test('forms: o assert de texto desescapa o & que o CONVERT_OTF ASCII escapa (medido no item 48)', () => {
  // o papel imprime `P&D`; o canal ASCII do assert traz `P&amp;D` — sem isto, documento certo REPROVA
  expect(contemTexto({ texto: ['Marcador: P&amp;D 100% &amp; fim.'] }, 'P&D 100% & fim')).toBe(true);
  expect(contemTexto({ texto: ['A3 menor < maior > fim'] }, 'menor < maior >')).toBe(true);
});

test('forms: troca de texto reescreve TEXT e T_TEXT (todos os idiomas) e fatia em 132', () => {
  const s = trocarTextoSmartForm(XML, 'introduction', [{ formato: 'TH', linha: 'UM TITULO' }]);
  expect(s).toContain('<TEXT><item><TDFORMAT>TH</TDFORMAT><TDLINE>UM TITULO</TDLINE></item></TEXT>');
  expect(s.match(/<TDLINE>UM TITULO<\/TDLINE>/g).length).toBe(3); // TEXT + D + P
  expect(s).toContain('<LINENR>000001</LINENR>');
  const longo = 'a'.repeat(200);
  const fatiado = trocarTextoSmartForm(XML, 'INTRODUCTION', [{ formato: 'AS', linha: longo }]);
  const itens = fatiado.match(/<TEXT>[\s\S]*?<\/TEXT>/)[0];
  expect(itens.match(/<item>/g).length).toBe(2);
  expect(itens).toContain('<TDFORMAT>*</TDFORMAT>'); // a continuação
  expect(fatiarTdline('curto')).toEqual(['curto']);
  expect(trocarTextoSmartForm(XML, 'INTRODUCTION', [{ formato: 'AS', linha: 'a & b < c' }])).toContain('a &amp; b &lt; c');
  expect(() => trocarTextoSmartForm(XML, 'NAO_EXISTE', [])).toThrow(/não existe/);
});

test('forms: janela posicionada em centímetros, e nó clonado como irmão', () => {
  const movida = posicionarJanelaSmartForm(XML, 'MAIN', { left: 8, top: 3, width: 9 });
  expect(movida).toContain('<WLEFT>8.00</WLEFT><U_WLEFT>CM</U_WLEFT>');
  expect(movida).toContain('<WTOP>3.00</WTOP><U_WTOP>CM</U_WTOP>');
  expect(movida).toContain('<WHEIGHT>16.00</WHEIGHT>'); // o que não foi pedido não muda
  expect(() => posicionarJanelaSmartForm(XML, 'INTRODUCTION', { left: 1 })).toThrow(/não existe/);

  const dois = clonarNoSmartForm(XML, { de: 'INTRODUCTION', para: 'TITULO2' });
  expect(nosDoSmartForm(dois).map((n) => `${n.tipo}:${n.iname}`)).toEqual(['RP:', 'PA:FIRST', 'WI:MAIN', 'RC:', 'TI:INTRODUCTION', 'TI:TITULO2', 'WI:FOOTER', 'RC:']);
  expect(dois).toContain('<INAME>%OAITULO210</INAME>'); // a opção de saída também é renomeada
  expect(dois.match(/<sf:item>/g).length).toBe(dois.match(/<\/sf:item>/g).length);
  expect(() => clonarNoSmartForm(XML, { de: 'NAO_EXISTE', para: 'X' })).toThrow(/não existe/);
});

test('forms: parse da saída de cópia/upload — passos, FM gerado e o XML medido', () => {
  const saida = 'SF_LOAD ok\nSF_PARSE ok\nSF_XML len=108869 root=SMARTFORM\nSF_TADIR subrc=0\nSF_STORE ok\nSF_GEN ok\nSF_NEW_FM subrc=0 fm=/1BCDWB/SF00000189\n';
  const r = parseSmartFormCopyOutput(saida);
  expect(r.ok).toBe(true);
  expect(r.fm).toBe('/1BCDWB/SF00000189');
  expect(r.xmlLen).toBe(108869);
  expect(r.root).toBe('SMARTFORM');
  expect(r.tadir).toBe(0);
  // o form que sobe vazio: store diz ok, a GERAÇÃO é que denuncia
  const vazio = parseSmartFormCopyOutput('SF_LOAD ok\nSF_PARSE ok\nSF_STORE ok\nSF_GEN EXC subrc=5 Erro ao gerar formulário Y_SF_C42\nSF_NEW_FM subrc=2 fm=\n');
  expect(vazio.ok).toBe(false);
  expect(vazio.passos.at(-1).erro).toContain('subrc=5');
  expect(vazio.fm).toBe(null);
});

test('forms: driver de exclusão sem GUI, e o guard-rail do apagar', () => {
  const s = buildSmartFormDeleteSource('y_sf_del', { form: 'Y_SF_C42' });
  expect(s).toContain("CALL FUNCTION 'FB_DELETE_FORM' EXPORTING i_formname = 'Y_SF_C42'");
  expect(s).toContain("i_with_dialog = ' ' i_with_confirm_dialog = ' '");
  expect(s).toContain('IF sy-subrc = 0.');
  expect(buildSmartFormDeleteSource('x', { form: 'Y_SF_C42', tolerante: true })).toContain('IF sy-subrc = 0 OR sy-subrc = 2.');
  expect(() => buildSmartFormDeleteSource('x', { form: 'SF_EXAMPLE_01' })).toThrow(/não é objeto Z\/Y/);
});

test('forms: PDF do Smart Form em base64 só quando pedido', () => {
  const semB64 = buildSmartFormDriverSource('y_sf_x', { form: 'SF_EXAMPLE_01' });
  expect(semB64).not.toContain('SF_B64');
  const comB64 = buildSmartFormDriverSource('y_sf_x', { form: 'SF_EXAMPLE_01', pdfBase64: true });
  expect(comB64).toContain('lv_b64 = cl_web_http_utility=>encode_x_base64( lv_pdf ).');
  expect(comB64).toContain('out->write( |SF_B64 { lv_b64+lv_off(lv_cut) }| ).');
  expect(parseSmartFormOutput('SF_B64_LEN 8\nSF_B64 QUJDREVG\n').pdfBase64).toBe('QUJDREVG');
});

// ---------- construção de nó: texto e TABELA nascendo do nada (item 49) ----------

test('forms: xmlTextoSmartForm constrói um nó TI novo — só <TEXT>, que é o que o papel usa', () => {
  const no = xmlTextoSmartForm({ iname: 'MDTXT1', linhas: [{ formato: 'TH', linha: 'Título' }, { formato: 'AS', linha: 'corpo' }] });
  expect(no).toContain('<NODETYPE>TI</NODETYPE>');
  expect(no).toContain('<INAME>MDTXT1</INAME>');
  expect(no).toContain('<item><TDFORMAT>TH</TDFORMAT><TDLINE>Título</TDLINE></item>');
  expect(no).not.toContain('<T_TEXT>');           // dispensável — medido: o texto sai sem ele
  expect(no.endsWith('<sf:SUCC/></sf:NODE>')).toBe(true);
  // o que vai no TDLINE é escapado, e a linha longa é fatiada em 132 com continuação `*`
  expect(xmlTextoSmartForm({ iname: 'X', linhas: [{ formato: 'AS', linha: 'a < b & c' }] })).toContain('a &lt; b &amp; c');
  const fatiado = xmlTextoSmartForm({ iname: 'X', linhas: [{ formato: 'AS', linha: 'palavra '.repeat(30) }] });
  expect((fatiado.match(/<TDFORMAT>\*<\/TDFORMAT>/g) ?? []).length).toBeGreaterThan(0);
  expect(() => xmlTextoSmartForm({ iname: '1X' })).toThrow(/não serve como nome/);
});

test('forms: xmlTabelaSmartForm monta SE C → EV → SE R → SE E → TI, com OTABTYPE e OTABHEADER', () => {
  const t = xmlTabelaSmartForm({
    iname: 'TBL1',
    colunas: [{ largura: 5 }, { largura: 4 }],
    cabecalho: ['Item', 'Valor'],
    linhas: [['1', '10,00'], ['2', '2,50']],
  });
  expect(t).toContain('<SECTTYPE>C</SECTTYPE>');
  // sem OTABTYPE o runtime não conhece a definição; sem OTABHEADER o cabeçalho some do papel
  expect(t).toContain('<OTABTYPE>D</OTABTYPE><OTABHEADER>A</OTABHEADER><OTABFOOTER>E</OTABFOOTER>');
  expect(t).toContain('<WIDTH>9.00</WIDTH>');
  expect(t).toContain('<EVTYPE>H</EVTYPE>');
  expect(t).toContain('<EVTYPE>B</EVTYPE>');
  expect((t.match(/<SECTTYPE>R<\/SECTTYPE>/g) ?? []).length).toBe(3);  // 1 de cabeçalho + 2 de corpo
  expect((t.match(/<SECTTYPE>E<\/SECTTYPE>/g) ?? []).length).toBe(6);  // 3 linhas × 2 colunas
  // a largura é por (tipo de linha × coluna), e o tipo da linha aponta o DYNLINES
  expect(t).toContain('<NAME>LTCAB</NAME><COLUMNNR>001</COLUMNNR><CWIDTH>5.00</CWIDTH>');
  expect(t).toContain('<NAME>LTCORPO</NAME><COLUMNNR>002</COLUMNNR><CWIDTH>4.00</CWIDTH>');
  expect(t).toContain('<T_LINETYPE>LTCAB</T_LINETYPE>');
  expect(t).toContain('<TDFORMAT>TH</TDFORMAT><TDLINE>Item</TDLINE>');
  expect(t).toContain('<TDFORMAT>AS</TDFORMAT><TDLINE>10,00</TDLINE>');
});

test('forms: a borda padrão é só a de BAIXO — a de topo invade o parágrafo anterior (medido)', () => {
  const baixo = xmlTabelaSmartForm({ iname: 'T', colunas: [3], linhas: [['a']] });
  expect(baixo).toContain('<CBOTTOM><RED>000</RED><GREEN>000</GREEN><BLUE>000</BLUE><USED>X</USED></CBOTTOM>');
  expect(baixo).not.toContain('<CTOP><RED>000</RED><GREEN>000</GREEN><BLUE>000</BLUE><USED>X</USED></CTOP>');
  const caixa = xmlTabelaSmartForm({ iname: 'T', colunas: [3], linhas: [['a']], borda: 'caixa' });
  expect(caixa).toContain('<CTOP><RED>000</RED><GREEN>000</GREEN><BLUE>000</BLUE><USED>X</USED></CTOP>');
  const nenhuma = xmlTabelaSmartForm({ iname: 'T', colunas: [3], linhas: [['a']], borda: 'nenhuma' });
  expect(nenhuma).not.toContain('<BORDERS>');
  expect(nenhuma).not.toContain('<USEBORDER>');
});

test('forms: tabela sem cabeçalho não emite o evento H, e célula a mais é erro antes da rede', () => {
  const t = xmlTabelaSmartForm({ iname: 'T', colunas: [3, 3], linhas: [['a', 'b']] });
  expect(t).not.toContain('<EVTYPE>H</EVTYPE>');
  expect(t).not.toContain('LTCAB');
  expect(() => xmlTabelaSmartForm({ iname: 'T', colunas: [3], linhas: [['a', 'b']] })).toThrow(/2 células e a tabela tem 1 colunas/);
  expect(() => xmlTabelaSmartForm({ iname: 'T', colunas: [] })).toThrow(/sem coluna nenhuma/);
  expect(() => xmlTabelaSmartForm({ iname: 'T', colunas: [0] })).toThrow(/largura/);
});

// item 63 (I84) — SHADING é inerte (medido no s4h); quem pinta é BORDERS/INTENSITY+FILLCOLOR, e
// mesclagem não tem campo próprio: sai de um T_LINETYPE com menos colunas, largura somada.
test('forms: xmlTabelaSmartForm sem colspan/sombreado gera exatamente o XML de antes do item 63', () => {
  const antes = xmlTabelaSmartForm({
    iname: 'TBL1', colunas: [5, 4], cabecalho: ['Item', 'Valor'], linhas: [['1', '10,00']],
  });
  expect(antes).not.toContain('LTX1');
  expect(antes).toContain('<INTENSITY>000</INTENSITY>');
  expect(antes).not.toMatch(/<INTENSITY>(?!000<\/INTENSITY>)/);
});

test('forms: `colspan` mescla colunas — um T_LINETYPE próprio com a largura somada, sem campo COLSPAN', () => {
  const t = xmlTabelaSmartForm({
    iname: 'TBL2',
    colunas: [4, 8, 4],
    linhas: [[{ conteudo: 'Total:' }, { conteudo: '60,50', colspan: 2 }]],
  });
  expect(t).toContain('<NAME>LTX1</NAME><COLUMNNR>001</COLUMNNR><CWIDTH>4.00</CWIDTH>');
  expect(t).toContain('<NAME>LTX1</NAME><COLUMNNR>002</COLUMNNR><CWIDTH>12.00</CWIDTH>');
  expect(t).toContain('<T_LINETYPE>LTX1</T_LINETYPE>');
  // a linha padrão (sem colspan) continua LTCORPO, byte a byte
  const normal = xmlTabelaSmartForm({ iname: 'TBL2', colunas: [4, 8, 4], linhas: [['a', 'b', 'c']] });
  expect(normal).toContain('<T_LINETYPE>LTCORPO</T_LINETYPE>');
  expect(normal).not.toContain('LTX1');
});

test('forms: `sombreado` vira INTENSITY (não SHADING — medido inerte) na borda da célula', () => {
  const t = xmlTabelaSmartForm({
    iname: 'TBL3', colunas: [4, 4],
    linhas: [[{ conteudo: 'a', sombreado: 30 }, { conteudo: 'b', sombreado: 30 }]],
  });
  expect(t).toContain('<INTENSITY>030</INTENSITY>');
  expect(t).toContain('<SHADING>000</SHADING>'); // o campo SHADING continua sempre 000 — é inerte
});

test('forms: duas linhas com o MESMO desenho (colspan+sombreado) compartilham o mesmo T_LINETYPE', () => {
  const linha = () => [{ conteudo: 'x', colspan: 2, sombreado: 20 }, { conteudo: 'y' }];
  const t = xmlTabelaSmartForm({ iname: 'TBL4', colunas: [4, 4, 4], linhas: [linha(), linha()] });
  expect((t.match(/<NAME>LTX1<\/NAME>/g) ?? []).length).toBeGreaterThan(1);
  expect(t).not.toContain('LTX2');
});

test('forms: `rodape` emite EVTYPE F uma vez, sem repetir por página (OTABFOOTER=E, medido)', () => {
  const semRodape = xmlTabelaSmartForm({ iname: 'T', colunas: [4], linhas: [['a']] });
  expect(semRodape).not.toContain('<EVTYPE>F</EVTYPE>');
  const comRodape = xmlTabelaSmartForm({
    iname: 'T', colunas: [4, 4], linhas: [['a', 'b']],
    rodape: [{ conteudo: 'Total:' }, '99,00'],
  });
  expect(comRodape).toContain('<EVTYPE>F</EVTYPE>');
  expect(comRodape).toContain('<TDLINE>Total:</TDLINE>');
});

test('forms: colspan somando mais que as colunas continua erro antes da rede', () => {
  expect(() => xmlTabelaSmartForm({
    iname: 'T', colunas: [3, 3], linhas: [[{ conteudo: 'a', colspan: 2 }, { conteudo: 'b' }]],
  })).toThrow(/2 células e a tabela tem 2 colunas/);
});

test('forms: inserirNoSmartForm põe o nó como irmão SEGUINTE, respeitando o <sf:item>', () => {
  const novo = inserirNoSmartForm(XML, { apos: 'INTRODUCTION', no: xmlTextoSmartForm({ iname: 'MDTXT1', linhas: [{ formato: 'AS', linha: 'depois' }] }) });
  const nomes = nosDoSmartForm(novo).map((n) => n.iname);
  expect(nomes.indexOf('MDTXT1')).toBe(nomes.indexOf('INTRODUCTION') + 1);
  expect(novo).toContain('<sf:item><sf:NODE><NODETYPE>TI</NODETYPE>');
  // e a árvore continua íntegra: o nó novo é irmão, não filho
  const introducao = nosDoSmartForm(novo).find((n) => n.iname === 'INTRODUCTION');
  expect(introducao.filhos).toHaveLength(0);
  expect(() => inserirNoSmartForm(XML, { apos: 'NAO_EXISTE', no: '<x/>' })).toThrow(/não existe/);
});

// ---------- degrau 3: página, janela e formato (item 50) ----------

test('forms: apontarProximaPagina troca o NEXTPAGE da página — é o que faz o documento transbordar', () => {
  const novo = apontarProximaPagina(XML, { pagina: 'FIRST', proxima: 'FIRST' });
  expect(novo).toContain('<NEXTPAGE><INAME>FIRST</INAME></NEXTPAGE>');
  expect(novo).not.toContain('<NEXTPAGE><INAME>NEXT</INAME></NEXTPAGE>');
  // o resto da página fica intacto
  expect(novo).toContain('<NUMB_MODE>I</NUMB_MODE>');
  expect(nosDoSmartForm(novo).map((n) => n.iname)).toEqual(nosDoSmartForm(XML).map((n) => n.iname));
  expect(() => apontarProximaPagina(XML, { pagina: 'NAO_EXISTE', proxima: 'FIRST' })).toThrow(/não existe/);
});

test('forms: definirFormatoSmartForm troca papel e orientação, e recusa o que não existe', () => {
  const novo = definirFormatoSmartForm(XML, { formato: 'letter', orientacao: 'L' });
  expect(novo).toContain('<PAGEFORMAT>LETTER</PAGEFORMAT>');
  expect(novo).toContain('<PAGEORTN>L</PAGEORTN>');
  expect(definirFormatoSmartForm(XML, {})).toBe(XML);
  expect(() => definirFormatoSmartForm(XML, { formato: 'A4' })).toThrow(/formato de página "A4" desconhecido/);
  expect(() => definirFormatoSmartForm(XML, { orientacao: 'X' })).toThrow(/orientação "X" não existe/);
});

test('forms: xmlJanelaSmartForm põe o conteúdo no RC de dentro, não no sf:SUCC da janela', () => {
  const j = xmlJanelaSmartForm({
    iname: 'MDRODAPE', caption: 'rodape', left: 2.5, top: 26, width: 16, height: 1.2,
    filhos: [xmlTextoSmartForm({ iname: 'MDRODAPET', linhas: [{ formato: 'AS', linha: 'Pagina &SFSY-PAGE&' }] })],
  });
  expect(j).toContain('<WTYPE>T</WTYPE>');
  expect(j).toContain('<sf:PROC_CTRL><sf:NODE><NODETYPE>RC</NODETYPE><sf:SUCC><sf:item><sf:NODE><NODETYPE>TI</NODETYPE>');
  expect(j).toContain('<WTOP>26.00</WTOP><U_WTOP>CM</U_WTOP>');
  expect(j.endsWith('<sf:SUCC/></sf:NODE>')).toBe(true);
  // janela construída não tem ID: quem dá ID é o SAP, e sem ele ela não é referenciável por IDREF
  expect(j).not.toContain('ID="');
  // pendurada na página, a árvore a vê como janela irmã da MAIN, com o texto dentro
  const arvore = nosDoSmartForm(inserirNoSmartForm(XML, { apos: 'MAIN', no: j }));
  const janela = arvore.find((n) => n.iname === 'MDRODAPE');
  expect(janela.tipo).toBe('WI');
  expect(arvore.find((n) => n.iname === 'MDRODAPET').tipo).toBe('TI');
});

test('forms: janela recusa antes da rede o tipo inventado e a medida que não é medida', () => {
  expect(() => xmlJanelaSmartForm({ iname: 'X', tipo: 'Z' })).toThrow(/tipo de janela "Z" não existe/);
  expect(() => xmlJanelaSmartForm({ iname: 'X', top: null })).toThrow(/precisa de `top` em centímetros/);
  expect(() => xmlJanelaSmartForm({ iname: '1X' })).toThrow(/não serve como nome de janela/);
});

// ---------- gráfico: o nó GR e as duas pontas da imagem (item 51) ----------

test('forms: xmlGraficoSmartForm monta a chave BDS do gráfico, e o nó não tem posição nenhuma', () => {
  const g = xmlGraficoSmartForm({ iname: 'MDIMG1', grafico: 'zlogo_acme', btype: 'BCOL', alinhamento: 'centro', caption: 'Logo' });
  expect(g).toContain('<NODETYPE>GR</NODETYPE>');
  expect(g).toContain('<GKEYBDS><OBJECT>GRAPHICS</OBJECT><NAME>ZLOGO_ACME</NAME><ID>BMAP</ID><BTYPE>BCOL</BTYPE></GKEYBDS>');
  expect(g).toContain('<GTYPE>B</GTYPE>');
  expect(g).toContain('<ALIGNMENT>C</ALIGNMENT>');
  // o tamanho não mora no nó: quem decide é o DPI do arquivo (medido no item 51)
  expect(g).not.toContain('OUTATTR');
  expect(g).not.toContain('WIDTH');
  // pendurado no molde, a árvore o vê como nó GR irmão do texto
  const no = nosDoSmartForm(inserirNoSmartForm(XML, { apos: 'INTRODUCTION', no: g })).find((n) => n.iname === 'MDIMG1');
  expect(no.tipo).toBe('GR');
  expect(no.obj).toBe('GRAPHIC');
});

test('forms: o nó de gráfico recusa antes da rede o que o SAP só reclamaria no render', () => {
  expect(() => xmlGraficoSmartForm({ iname: 'X' })).toThrow(/exige { grafico }/);
  expect(() => xmlGraficoSmartForm({ iname: 'X', grafico: 'Z', btype: 'RGB' })).toThrow(/btype "RGB" não existe/);
  expect(() => xmlGraficoSmartForm({ iname: 'X', grafico: 'Z', alinhamento: 'meio' })).toThrow(/alinhamento "meio" não existe/);
  expect(() => xmlGraficoSmartForm({ iname: 'X', grafico: 'Z'.repeat(71) })).toThrow(/mais de 70 caracteres/);
});

test('forms: formatoDaImagem lê os primeiros bytes — e é o que separa o que entra do que não entra', () => {
  expect(formatoDaImagem(Buffer.from('424d3600', 'hex'))).toBe('BMP');
  expect(formatoDaImagem(Buffer.from('49492a00', 'hex'))).toBe('TIF');
  expect(formatoDaImagem(Buffer.from('89504e470d0a1a0a', 'hex'))).toBe('PNG');
  expect(formatoDaImagem(Buffer.from('ffd8ffe0', 'hex'))).toBe('JPG');
  expect(formatoDaImagem(Buffer.from('nada'))).toBeNull();
});

test('forms: o driver de upload é a via do SE78 sem a dynpro — converte, grava no BDS e na STXBITMAPS', () => {
  const s = buildGraphicUploadSource('y_gr_up', { nome: 'ZLOGO_ACME', conteudo: 'Qk0=', formato: 'BMP', descricao: 'logo' });
  expect(s).toContain("CALL FUNCTION 'ENQUEUE_ESSGRABDS'");
  expect(s).toContain("CALL FUNCTION 'SAPSCRIPT_CONVERT_BITMAP_BDS'");
  expect(s).toContain("EXPORTING classname = 'DEVC_STXD_BITMAP' classtype = 'OT'");
  expect(s).toContain('INSERT INTO stxbitmaps VALUES ls_bm.');
  expect(s).toContain("APPEND 'Qk0=' TO lt_b64.");
  expect(s).toContain('COMMIT WORK AND WAIT.');
  expect(s).toContain("CALL FUNCTION 'DEQUEUE_ESSGRABDS'");
  // sem `substituir`, gráfico que já existe não é sobrescrito em silêncio
  expect(s).toContain('já existe — use substituir:true');
  expect(buildGraphicUploadSource('y_gr_up', { nome: 'ZLOGO_ACME', conteudo: 'Qk0=', substituir: true }))
    .toContain("CALL FUNCTION 'SAPSCRIPT_DELETE_GRAPHIC_BDS'");
});

test('forms: o upload recusa formato que o FM do SAP não converte, e nome que não é nosso', () => {
  expect(() => buildGraphicUploadSource('y_gr_up', { nome: 'ZLOGO', conteudo: 'x', formato: 'PNG' })).toThrow(/aceita BMP e TIF/);
  expect(() => buildGraphicUploadSource('y_gr_up', { nome: 'SAP_LOGO', conteudo: 'x' })).toThrow();
  expect(() => buildGraphicUploadSource('y_gr_up', { nome: 'ZLOGO' })).toThrow(/exige { arquivo } ou { conteudo }/);
  expect(() => buildGraphicUploadSource('y_gr_up', { nome: 'Z LOGO', conteudo: 'x' })).toThrow(/tem espaço/);
});

test('forms: o delete do gráfico é sem diálogo, e o parse da saída traz as medidas do papel', () => {
  expect(buildGraphicDeleteSource('y_gr_del', { nome: 'ZLOGO' })).toContain("i_btype = 'BCOL' dialog = space");
  const p = parseGraphicUploadOutput([
    'GR_BYTES 52470', 'GR_CONV pix=168x104 tw=2419x1498 dpi=100 bds=19140',
    'GR_BDS docid=BDS_LOC3  00505683', 'GR_TAB subrc=0', 'GR_UP ok',
  ].join('\n'));
  expect(p.ok).toBe(true);
  expect(p.bytes).toBe(52470);
  expect(p.medidas.dpi).toBe(100);
  // 2419 twips = 4,27 cm — é o tamanho que a imagem terá no papel (medido)
  expect(p.medidas.larguraCm).toBe(4.27);
  expect(p.medidas.alturaCm).toBe(2.64);
  expect(parseGraphicUploadOutput('GR_UP EXC conversão subrc=1 O formato PNG não é suportado').ok).toBe(false);
});

// ---------- gráfico por URL HTTP: publicar no MIME (item 73, I86) ----------

test('forms: urlGraficoHttp monta a MESMA URL da migração (mime_url_for_bds_graphic), toda minúscula', () => {
  // /sap/bc/fp/graphics/public + /object/id/btype/nome.bmp, tudo lower — o href que o XFA referencia
  expect(urlGraficoHttp({ nome: 'ZLOGO_ACME' }))
    .toBe('/sap/bc/fp/graphics/public/graphics/bmap/bcol/zlogo_acme.bmp');
  // BMON quando cor:false (o btype é parte da CHAVE, não efeito)
  expect(urlGraficoHttp({ nome: 'ZLOGO_ACME', cor: false }))
    .toBe('/sap/bc/fp/graphics/public/graphics/bmap/bmon/zlogo_acme.bmp');
  expect(() => urlGraficoHttp({ nome: 'Z LOGO' })).toThrow(/tem espaço/);
});

test('forms: o driver de publicação copia BDS→MIME (get_bds_graphic_as_bmp → mr_api->put), e o delete inverte', () => {
  const s = buildGraphicPublishSource('yjbv_gr_mime', { nome: 'ZLOGO_ACME', descricao: 'logo' });
  expect(s).toContain('cl_mime_repository_api=>get_api( )');
  expect(s).toContain('cl_ssf_xsf_utilities=>get_bds_graphic_as_bmp');
  expect(s).toContain("p_object = 'GRAPHICS' p_name = 'ZLOGO_ACME' p_id = 'BMAP' p_btype = 'BCOL'");
  expect(s).toContain("lo_mr->put( EXPORTING i_url = '/sap/bc/fp/graphics/public/graphics/bmap/bcol/zlogo_acme.bmp'");
  expect(s).toContain("i_dev_package = '$TMP' i_suppress_dialogs = 'X'");
  expect(s).toContain('COMMIT WORK AND WAIT.');
  // o sentinela de sucesso não pode sair quando o put falha — só depois do subrc=0
  expect(s).toContain('IF sy-subrc <> 0. out->write( |GR_MIME EXC put subrc={ sy-subrc }| ). RETURN. ENDIF.');
  // apagar: só o delete, sem tocar o BDS
  const d = buildGraphicPublishSource('yjbv_gr_mime', { nome: 'ZLOGO_ACME', apagar: true });
  expect(d).toContain("lo_mr->delete( EXPORTING i_url = '/sap/bc/fp/graphics/public/graphics/bmap/bcol/zlogo_acme.bmp'");
  expect(d).not.toContain('get_bds_graphic_as_bmp');
  expect(() => buildGraphicPublishSource('yjbv_gr_mime', { nome: 'SAP_LOGO' })).toThrow();
});

// ---------- degrau 5: Smart Style próprio (item 52) ----------

test('forms: o driver do Smart Style desvia das TRÊS armadilhas medidas', () => {
  const s = buildSmartStyleSource('yjbv_st_put', { estilo: ESTILO_MARKDOWN });
  // 1. quem escreve é SSF_SAVE_STYLE — o CREATE/CHANGE é o Style Builder (dynpro)
  expect(s).toContain("CALL FUNCTION 'SSF_SAVE_STYLE'");
  expect(s).not.toContain('SSF_CREATE_STYLE');
  // 2. sem redirect_error_msg='X' o SSF_CHECK_STYLE por baixo faz CALL SCREEN → dump no classrun
  expect(s).toContain("i_with_dialog = space redirect_error_msg = 'X'");
  // 3. sem TADIR prévia o RS_CORR_INSERT abre a dynpro do SAPLSTRD (medido: DYNPRO_SEND_IN_BACKGROUND)
  expect(s.indexOf("CALL FUNCTION 'TR_TADIR_INTERFACE'")).toBeLessThan(s.indexOf("CALL FUNCTION 'SSF_SAVE_STYLE'"));
  expect(s).toContain("wi_tadir_object = 'SSST'");
  expect(s).toContain("wi_tadir_devclass = '$TMP'");
  // o vocabulário inteiro entra como linha de STXSPARA/STXSCHAR
  expect(s).toContain("ls_p-tdpargraph = 'H1'.");
  expect(s).toContain("ls_p-tdpjustify = 'RIGHT'.");   // o alinhamento que o SF_STYLE_01 não tem
  expect(s).toContain("ls_p-tdpentry = '-0.40'.");     // o pendurado do bullet
  expect(s).toContain("ls_c-tdstring = 'S'.");
});

test('forms: o que o estilo não diz de fonte é HERDADO (`*`), não desligado', () => {
  const e = validarSmartStyle(ESTILO_MARKDOWN);
  const corpo = e.paragrafos.find((p) => p.tdpargraph === 'AS');
  expect(corpo.tdbold).toBe('*');
  expect(corpo.tditalic).toBe('*');
  // e o que foi dito continua dito
  expect(e.paragrafos.find((p) => p.tdpargraph === 'H1').tdbold).toBe('X');
});

test('forms: o Smart Style é conferido ANTES da rede — e cada recusa diz o que o SAP faria calado', () => {
  const com = (mudanca) => validarSmartStyle({ ...ESTILO_MARKDOWN, ...mudanca });
  expect(() => com({ nome: 'SF_STYLE_01' })).toThrow();                       // não é nosso
  expect(() => com({ paragrafos: [] })).toThrow(/não tem parágrafo nenhum/);
  // TDPARGRAPH é CHAR 2: o SAP TRUNCA "COD" para "CO" sem dizer nada
  expect(() => com({ paragrafos: [{ tdpargraph: 'COD' }] })).toThrow(/CHAR 2/);
  // parágrafo default que não existe deixa o form sem o que usar quando o TDFORMAT não diz
  expect(() => com({ header: { tdfirstpar: 'ZZ' } })).toThrow(/parágrafo default/);
  // a UNIDADE é quem decide se 2 é milímetro ou centímetro (o engano do item 46)
  expect(() => com({ paragrafos: [{ tdpargraph: 'AS', tdpleft: '2.00', tdpleftu: 'KM' }], header: { tdfirstpar: 'AS' } })).toThrow(/unidade/);
  // chave repetida: a segunda linha substituiria a primeira na tabela
  expect(() => com({ paragrafos: [{ tdpargraph: 'AS' }, { tdpargraph: 'AS' }], header: { tdfirstpar: 'AS' } })).toThrow(/duas vezes/);
});

test('forms: o delete do estilo é sem diálogo NENHUM, e o parse lê save + activate', () => {
  const d = buildSmartStyleDeleteSource('yjbv_st_del', { nome: 'Y_SF_MD' });
  expect(d).toContain('i_with_dialog = space i_with_confirm_dialog = space');
  const p = parseSmartStyleOutput([
    'ST_TADIR subrc=0',
    'ST_SAVE subrc=0 version=00001 devclass=$TMP active=I',
    'ST_ACT ok status=A paras=12 chars=3',
  ].join('\n'));
  expect(p.ok).toBe(true);
  expect(p.salvoComo).toBe('I');      // o save grava INATIVO; quem promove é o activate
  expect(p.status).toBe('A');
  expect(p.paragrafos).toBe(12);
  const ruim = parseSmartStyleOutput('ST_SAVE subrc=0 version=00001 devclass=$TMP active=I\nST_ERR Absatzformat XX fehlt\nST_ACT EXC subrc=0 status=I');
  expect(ruim.ok).toBe(false);
  expect(ruim.erros).toEqual(['Absatzformat XX fehlt']);
});

test('forms: definirEstiloSmartForm troca TODAS as ocorrências de STDSTYLE', () => {
  const xml = '<VARHEADER><item><STDSTYLE>SF_STYLE_01</STDSTYLE></item></VARHEADER><X><STDSTYLE>SF_STYLE_01</STDSTYLE></X>';
  expect(definirEstiloSmartForm(xml, 'Y_SF_MD')).toBe(
    '<VARHEADER><item><STDSTYLE>Y_SF_MD</STDSTYLE></item></VARHEADER><X><STDSTYLE>Y_SF_MD</STDSTYLE></X>');
  expect(() => definirEstiloSmartForm('<HEADER/>', 'Y_SF_MD')).toThrow(/não tem <STDSTYLE>/);
});

// ---------- migração Smart Form → Adobe Form (item 55) ----------

test('forms: o driver da migração desvia dos silêncios medidos — TADIR antes, opções explícitas, XDP por idioma', () => {
  const s = buildMigracaoAdobeSource('yjbv_fp_mig', { smartForm: 'y_sf_doc', form: 'y_fp_doc', interfaceNome: 'y_fp_doc_if' });
  // 1. TADIR das DUAS (SFPI e SFPF) ANTES do migrate — senão o RS_CORR_INSERT abre a dynpro do SAPLSTRD
  expect(s.indexOf("wi_tadir_object = 'SFPI'")).toBeLessThan(s.indexOf('cl_ssf_migration=>migrate'));
  expect(s.indexOf("wi_tadir_object = 'SFPF'")).toBeLessThan(s.indexOf('cl_ssf_migration=>migrate'));
  // 2. o default da SAP é a base, e os 22 campos vão EXPLÍCITOS por cima
  expect(s).toContain('ls_opt = cl_ssf_migration=>set_default_migrating_options( ).');
  expect(s).toContain("ls_opt-table = 'X'.");          // sem isto a tabela é ACHATADA, sem erro
  expect(s).toContain("ls_opt-text_binding = 'X'.");   // sem isto `&VAR&` vira o texto `{VAR}`
  expect(s).toContain("ls_opt-header_footer = 'X'.");
  expect(s).toContain("ls_opt-output_option = 'X'.");   // sem isto a borda da CÉLULA some do XFA (I79)
  // o que ninguém cita fica com o default do SISTEMA — a lib não reescreve os 22 campos de cabeça
  expect(s).not.toContain('ls_opt-coding');
  expect(buildMigracaoAdobeSource('y', { smartForm: 'S', form: 'y_f', interfaceNome: 'y_i', opcoes: { coding: true } })).toContain("ls_opt-coding = 'X'.");
  // 3. o XDP mora na FPLAYOUTT, POR IDIOMA (a FPLAYOUT só tem metadados) e o par nasce INATIVO
  expect(s).toContain('SELECT SINGLE layout FROM fplayoutt');
  expect(s).toContain("AND state = 'I' AND language = @lv_lang");
  expect(s).toContain('lv_lang = sy-langu.');
  // 4. nada de ativar: form_activate exige ADS (CX_FP_API_INTERNAL no s4h)
  expect(s).not.toContain('form_activate');
  // sem `substituir` não se apaga nada
  expect(s).not.toContain('cl_fp_wb_form=>delete');
  expect(buildMigracaoAdobeSource('y', { smartForm: 'S', form: 'y_f', interfaceNome: 'y_i', substituir: true, idioma: 'd' }))
    .toContain("cl_fp_wb_form=>delete( i_name = 'Y_F' i_dark = 'X' )");
  expect(buildMigracaoAdobeSource('y', { smartForm: 'S', form: 'y_f', interfaceNome: 'y_i', idioma: 'd' })).toContain("lv_lang = 'D'.");
});

test('forms: as opções da migração são conferidas ANTES da rede — nome fora da estrutura é ignorado calado pelo SAP', () => {
  // o default da lib NÃO é o default da SAP: quatro opções ligadas por cima (itens 54/62 — sem
  // OUTPUT_OPTION a borda da célula some do XFA mesmo com TABLE ligado, I79)
  expect(validarOpcoesMigracao().TABLE).toBe('X');
  expect(validarOpcoesMigracao().TEXT_BINDING).toBe('X');
  expect(validarOpcoesMigracao().HEADER_FOOTER).toBe('X');
  expect(validarOpcoesMigracao().OUTPUT_OPTION).toBe('X');
  expect(OPCOES_MIGRACAO_PADRAO).toEqual({ table: true, text_binding: true, header_footer: true, output_option: true });
  expect(validarOpcoesMigracao({ table: false }).TABLE).toBe('');
  expect(validarOpcoesMigracao({ coding: true }).CODING).toBe('X');
  // CONDITION_TEXT / ALTERNATIVE_TEXT parecem existir e NÃO existem: ASSIGN COMPONENT falha calado
  expect(() => validarOpcoesMigracao({ condition_text: true })).toThrow(/desconhecida: condition_text/);
  expect(() => validarOpcoesMigracao({ table: 'X' })).toThrow(/true\/false/);
  // guard-rails de nome: só Z/Y, e form ≠ interface (são dois objetos)
  expect(() => buildMigracaoAdobeSource('y', { smartForm: 'S', form: 'SF_TESTE', interfaceNome: 'y_i' })).toThrow();
  expect(() => buildMigracaoAdobeSource('y', { smartForm: 'S', form: 'y_f', interfaceNome: 'y_f' })).toThrow(/mesmo nome/);
  expect(() => buildMigracaoAdobeSource('y', { smartForm: 'S', form: 'y_f', interfaceNome: 'y_i', idioma: 'PT' })).toThrow(/um caractere/);
});

test('forms: o parse da migração lê o idioma, o tamanho do XDP e as duas TADIR', () => {
  const p = parseMigracaoOutput([
    'MIG_SF masterlang=D sessao=P leitura=P',
    'MIG_TADIR_SFPI subrc=0', 'MIG_TADIR_SFPF subrc=0',
    'MIGRATE ok', 'MIG_XFA subrc=0 len=20628 lang=P',
  ].join('\n'));
  expect(p.ok).toBe(true);
  expect(p.masterlang).toBe('D');
  expect(p.sessao).toBe('P');
  expect(p.len).toBe(20628);
  expect(p.tadir).toEqual({ SFPI: 0, SFPF: 0 });
  // migrate ok e FPLAYOUTT sem linha no idioma pedido: NÃO é sucesso
  expect(parseMigracaoOutput('MIGRATE ok\nMIG_XFA subrc=4 len=0 lang=E').ok).toBe(false);
  expect(parseMigracaoOutput('MIGRATE EXC CX_SY_ITAB_LINE_NOT_FOUND: x').ok).toBe(false);
});

test('forms: a anatomia do XDP é a contra-prova de tamanho — o documento sem texto tem a forma inteira', () => {
  const comTexto = '<subform layout="tb"><draw><exData contentType="text/html"><body><div style="x">olá</div></body></exData></draw></subform>';
  const a = anatomiaXfa(`<?xfa generator="SAP_SmartForms" APIVersion="R700.SP0.N0"?>${comTexto}`);
  expect(a.temTexto).toBe(true);
  expect(a.gerador).toBe('SAP_SmartForms');
  expect(a.subform).toBe(1);
  expect(a.draw).toBe(1);
  // mesma forma, texto nenhum: é o que a migração devolve fora do idioma em que o texto existe
  const vazio = anatomiaXfa('<subform layout="tb"><draw><exData><div/></exData></draw><draw><exData><div></div></exData></draw></subform>');
  expect(vazio.divs).toBe(2);
  expect(vazio.divsVazios).toBe(2);
  expect(vazio.temTexto).toBe(false);
});
