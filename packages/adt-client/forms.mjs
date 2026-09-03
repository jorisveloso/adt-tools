// forms.mjs — Smart Forms (R3TR SSFO) e Adobe Forms (SFPF + SFPI): RENDERIZAÇÃO COMO ASSERT, por driver classrun.
//
// Nenhum dos dois se cria por ADT REST (medido 2026-08-30, S4H 758: o discovery não tem coleção de form; o
// layout é XFA/XDP editado fora do ABAP). O que a lib entrega é a prova de que o form ENTREGUE renderiza e
// traz os campos certos — sem SFP, sem SMARTFORMS, sem impressora (docs/receita-forms.md):
//   • Smart Form: `SSF_FUNCTION_MODULE_NAME` → FM gerado (`/1BCDWB/SF000000nn`, o número mora em
//     STXFADMI-FMNUMB) → CALL com `control_parameters-getotf = 'X'` + `no_dialog` → OTF em
//     `job_output_info-otfdata` → `CONVERT_OTF` para PDF (xstring, cabeçalho `%PDF-1.3`) e para ASCII (o
//     texto, linha a linha — é aí que se afirma "o campo X saiu"). Não depende de ADS. Medido: SF_EXAMPLE_01
//     → 270 linhas OTF, 1 página, PDF de 13.235 bytes, nome do cliente no texto.
//   • **O idioma do print, sem `control_parameters-langu` explícito (item 61/I77):** o SAP tenta o
//     `sy-langu` de quem imprime e, se o nó não tiver `<T_TEXT>` nesse idioma, cai para o `MASTERLANG`
//     do form — nunca para o `<TEXT>` "corrente" sem mais. Todo nó que a escada CONSTRÓI
//     (`xmlTextoSmartForm`/`xmlTabelaSmartForm`) só ganha `<T_TEXT>` no idioma de quem gravou (o SAP
//     auto-preenche na gravação, a lib não escreve isso), então essa cadeia só funciona se o
//     `MASTERLANG` do form for **esse mesmo idioma** — por isso `lo_res->header-masterlang = sy-langu`
//     no upload (abaixo) é o que faz um documento publicado em P imprimir certo mesmo por uma sessão
//     EN: sem ele o MASTERLANG herdava a ORIGEM do molde (`D` no `SF_EXAMPLE_01`) e a página saía em
//     branco, sem erro.
//   • Adobe Form: `FP_FUNCTION_MODULE_NAME` → FM (`/1BCDWB/SM000000nn`) → `FP_JOB_OPEN` (nodialog + getpdf)
//     → CALL com `/1bcdwb/docparams` + os parâmetros do form → `/1bcdwb/formoutput-pdf` → `FP_JOB_CLOSE`.
//     EXIGE ADS alcançável: no s4h a conexão `ADS` (RFCDES tipo G) existe mas não responde — `system_error`
//     subrc 2, `FP_GET_LAST_ADS_ERRSTR` = "SOAP Runtime Exception: CSoapExceptionTransport … (100.101)". A
//     via está inteira até o ADS; a prova final fica para um sistema com ADS vivo.
//   • A INTERFACE do Adobe Form é legível sem GUI: FPCONTEXT-INTERFACE aponta a SFPI, e FPINTERFACE-INTERFACE
//     guarda o asx-XML da CL_FP_INTERFACE_DATA — `<SFPIOPAR><NAME>TEXTLINES</NAME><TYPING>TYPE</TYPING>
//     <TYPENAME>TSFTEXT</TYPENAME><OPTIONAL></OPTIONAL>…`. O driver imprime os IMPORT_PARAMETERS; a lib devolve
//     `params` — é o checklist do que o chamador precisa passar (o `dataPreview` corta xstring em 255 hex, por
//     isso a leitura é no driver, com `cl_abap_codepage=>convert_from`).
//   • Os parâmetros do form são do form: quem chama escreve o ABAP que os prepara (`declaracoes` + `preparo`) e
//     diz o que vai em cada um (`exporting`/`tables` → `nome = variável`). Erro de parâmetro (faltando, tipo
//     errado) chega como exceção CX_SY_DYN_CALL_* capturada — a saída traz o texto, não dumpa.

import { readFile, writeFile } from 'node:fs/promises';
import { assertZY, deleteObject } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { readTable } from './rfc-soap.mjs';

const esc = (v) => String(v).replace(/'/g, "''");
const HEAD = (name) => `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.`;
const TAIL = `  ENDMETHOD.
ENDCLASS.`;
const MSG = `IF sy-subrc <> 0. MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg. ENDIF.`;
const PDF_MAGIC = '25504446'; // "%PDF"
// Pedaço de base64 por linha de `out->write` — o fonte ABAP não passa de 255 caracteres por linha, e a
// saída do classrun é texto: 200 mantém a linha do driver e a do log longe do teto.
const B64_CHUNK = 200;
// TDLINE é CHAR 132: o que passa disso é gravado truncado, sem aviso (medido no degrau 3).
const TDLINE_MAX = 132;

const nomeForm = (form) => {
  const F = String(form ?? '').toUpperCase().trim();
  if (!F) throw new Error('forms: informe { form } (nome do Smart Form / Adobe Form)');
  if (F.length > 30) throw new Error(`forms: "${F}" tem mais de 30 caracteres`);
  return F;
};
const bindings = (obj) => Object.entries(obj ?? {}).map(([k, v]) => `${String(k).toLowerCase()} = ${v}`).join(' ');

/**
 * Fonte do driver que renderiza um Smart Form e imprime PDF (tamanho, cabeçalho) e texto (CONVERT_OTF ASCII).
 * Puro. `declaracoes` (DATA …) e `preparo` (SELECTs, preenchimento) são ABAP do chamador; `exporting`/`tables`
 * mapeiam parâmetro do form → variável. `maxTexto` limita as linhas de texto impressas.
 */
export function buildSmartFormDriverSource(name, { form, declaracoes = '', preparo = '', exporting = {}, tables = {}, dest = 'LP01', maxTexto = 400, pdfBase64 = false } = {}) {
  const F = nomeForm(form);
  const exp = bindings(exporting);
  const tab = Object.keys(tables ?? {}).length ? `TABLES ${bindings(tables)}` : '';
  return `${HEAD(name)}
    DATA: lv_fm TYPE rs38l_fnam, lv_msg TYPE string, ls_ctrl TYPE ssfctrlop, ls_out TYPE ssfcompop, ls_job TYPE ssfcrescl,
          lt_lines TYPE TABLE OF tline, lt_txt TYPE TABLE OF tline, lv_size TYPE i, lv_pdf TYPE xstring, lv_pages TYPE i${pdfBase64 ? `,
          lv_b64 TYPE string, lv_off TYPE i, lv_cut TYPE i` : ''}.
${declaracoes}
    CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME' EXPORTING formname = '${esc(F)}' IMPORTING fm_name = lv_fm
      EXCEPTIONS no_form = 1 no_function_module = 2 OTHERS = 3.
    ${MSG}
    out->write( |SF_FM ${F} subrc={ sy-subrc } fm={ lv_fm } { lv_msg }| ).
    IF sy-subrc = 0.
${preparo}
      ls_ctrl-no_dialog = 'X'. ls_ctrl-getotf = 'X'. ls_out-tddest = '${esc(dest)}'. ls_out-tdnoprint = 'X'.
      CLEAR lv_msg.
      TRY.
          CALL FUNCTION lv_fm
            EXPORTING control_parameters = ls_ctrl output_options = ls_out user_settings = ' ' ${exp}
            IMPORTING job_output_info = ls_job
            ${tab}
            EXCEPTIONS formatting_error = 1 internal_error = 2 send_error = 3 user_canceled = 4 OTHERS = 5.
          ${MSG}
          out->write( |SF_CALL subrc={ sy-subrc } otf_lines={ lines( ls_job-otfdata ) } { lv_msg }| ).
        CATCH cx_root INTO DATA(lx).
          out->write( |SF_CALL exc { lx->get_text( ) }| ).
      ENDTRY.
      IF ls_job-otfdata IS NOT INITIAL.
        LOOP AT ls_job-otfdata TRANSPORTING NO FIELDS WHERE tdprintcom = 'EP'. lv_pages = lv_pages + 1. ENDLOOP.
        CLEAR lv_msg.
        CALL FUNCTION 'CONVERT_OTF' EXPORTING format = 'PDF' max_linewidth = 132
          IMPORTING bin_filesize = lv_size bin_file = lv_pdf TABLES otf = ls_job-otfdata lines = lt_lines
          EXCEPTIONS err_max_linewidth = 1 err_format = 2 err_conv_not_possible = 3 err_bad_otf = 4 OTHERS = 5.
        ${MSG}
        IF xstrlen( lv_pdf ) >= 8.
          out->write( |SF_PDF subrc={ sy-subrc } pages={ lv_pages } size={ lv_size } xlen={ xstrlen( lv_pdf ) } head={ lv_pdf(8) } { lv_msg }| ).
        ELSE.
          out->write( |SF_PDF subrc={ sy-subrc } pages={ lv_pages } size={ lv_size } xlen={ xstrlen( lv_pdf ) } head= { lv_msg }| ).
        ENDIF.
${pdfBase64 ? `        IF lv_pdf IS NOT INITIAL.
          lv_b64 = cl_web_http_utility=>encode_x_base64( lv_pdf ).
          out->write( |SF_B64_LEN { strlen( lv_b64 ) }| ).
          CLEAR lv_off.
          WHILE lv_off < strlen( lv_b64 ).
            lv_cut = strlen( lv_b64 ) - lv_off.
            IF lv_cut > ${B64_CHUNK}. lv_cut = ${B64_CHUNK}. ENDIF.
            out->write( |SF_B64 { lv_b64+lv_off(lv_cut) }| ).
            lv_off = lv_off + lv_cut.
          ENDWHILE.
        ENDIF.
` : ''}        CLEAR lv_msg.
        CALL FUNCTION 'CONVERT_OTF' EXPORTING format = 'ASCII' max_linewidth = 132
          IMPORTING bin_filesize = lv_size TABLES otf = ls_job-otfdata lines = lt_txt EXCEPTIONS OTHERS = 1.
        ${MSG}
        out->write( |SF_TXT_RC subrc={ sy-subrc } lines={ lines( lt_txt ) } { lv_msg }| ).
        LOOP AT lt_txt INTO DATA(ls_txt).
          IF sy-tabix > ${Number(maxTexto) || 400}. EXIT. ENDIF.
          IF ls_txt-tdline IS NOT INITIAL. out->write( |SF_TXT { ls_txt-tdline }| ). ENDIF.
        ENDLOOP.
      ENDIF.
    ENDIF.
${TAIL}`;
}

/**
 * Fonte do driver que lê a interface de um Adobe Form (FPCONTEXT → FPINTERFACE) e o renderiza pelo ADS.
 * Puro. `langu`/`country` vão em /1bcdwb/docparams; `connection` sobrescreve o destino ADS default.
 */
export function buildAdobeFormDriverSource(name, { form, declaracoes = '', preparo = '', exporting = {}, langu = 'E', country = 'US', dest = 'LP01', connection = '', fillable = false } = {}) {
  const F = nomeForm(form);
  const exp = bindings(exporting);
  return `${HEAD(name)}
    DATA: lv_msg TYPE string, ls_outp TYPE sfpoutputparams, ls_docp TYPE sfpdocparams, ls_fout TYPE fpformoutput,
          lv_ads TYPE string, lv_fm TYPE funcname, lv_fn TYPE funcname, lv_ifn TYPE fpcontext-interface, lv_ifx TYPE xstring,
          lv_ifs TYPE string, lv_a TYPE i, lv_b TYPE i.
${declaracoes}
    SELECT SINGLE interface FROM fpcontext INTO lv_ifn WHERE name = '${esc(F)}' AND state = 'A'.
    out->write( |FP_IF ${F} subrc={ sy-subrc } interface={ lv_ifn }| ).
    IF sy-subrc = 0.
      SELECT SINGLE interface FROM fpinterface INTO lv_ifx WHERE name = lv_ifn AND state = 'A'.
      IF sy-subrc = 0.
        lv_ifs = cl_abap_codepage=>convert_from( lv_ifx ).
        FIND '<IMPORT_PARAMETERS>' IN lv_ifs MATCH OFFSET lv_a.
        FIND '</IMPORT_PARAMETERS>' IN lv_ifs MATCH OFFSET lv_b.
        IF lv_a > 0 AND lv_b > lv_a. lv_b = lv_b - lv_a. out->write( |FP_IF_PARAMS { lv_ifs+lv_a(lv_b) }| ). ENDIF.
      ENDIF.
    ENDIF.
    CLEAR lv_msg.
    CALL FUNCTION 'FP_FUNCTION_MODULE_NAME' EXPORTING i_name = '${esc(F)}' IMPORTING e_funcname = lv_fm EXCEPTIONS OTHERS = 1.
    ${MSG}
    out->write( |FP_FM ${F} subrc={ sy-subrc } fm={ lv_fm } { lv_msg }| ).
    IF sy-subrc = 0.
${preparo}
      ls_outp-nodialog = 'X'. ls_outp-getpdf = 'X'. ls_outp-dest = '${esc(dest)}'.${connection ? ` ls_outp-connection = '${esc(connection)}'.` : ''}
      CLEAR lv_msg.
      CALL FUNCTION 'FP_JOB_OPEN' CHANGING ie_outputparams = ls_outp
        EXCEPTIONS cancel = 1 usage_error = 2 system_error = 3 internal_error = 4 OTHERS = 5.
      ${MSG}
      out->write( |FP_JOB_OPEN subrc={ sy-subrc } connection={ ls_outp-connection } { lv_msg }| ).
      IF sy-subrc = 0.
        ls_docp-langu = '${esc(langu)}'. ls_docp-country = '${esc(country)}'.${fillable ? " ls_docp-fillable = 'X'." : ''}
        CLEAR lv_msg.
        TRY.
            CALL FUNCTION lv_fm EXPORTING /1bcdwb/docparams = ls_docp ${exp}
              IMPORTING /1bcdwb/formoutput = ls_fout
              EXCEPTIONS usage_error = 1 system_error = 2 internal_error = 3 OTHERS = 4.
            ${MSG}
            IF xstrlen( ls_fout-pdf ) >= 8.
              out->write( |FP_CALL subrc={ sy-subrc } pages={ ls_fout-pages } xlen={ xstrlen( ls_fout-pdf ) } head={ ls_fout-pdf(8) } { lv_msg }| ).
            ELSE.
              out->write( |FP_CALL subrc={ sy-subrc } pages={ ls_fout-pages } xlen={ xstrlen( ls_fout-pdf ) } head= { lv_msg }| ).
            ENDIF.
          CATCH cx_root INTO DATA(lx).
            out->write( |FP_CALL exc { lx->get_text( ) }| ).
        ENDTRY.
        lv_fn = 'FP_GET_LAST_ADS_ERRSTR'.
        TRY. CALL FUNCTION lv_fn IMPORTING e_adserrstr = lv_ads. CATCH cx_root. ENDTRY.
        IF lv_ads IS NOT INITIAL. out->write( |FP_ADS_ERR { lv_ads }| ). ENDIF.
        CALL FUNCTION 'FP_JOB_CLOSE' EXCEPTIONS OTHERS = 1.
        out->write( |FP_JOB_CLOSE subrc={ sy-subrc }| ).
      ENDIF.
    ENDIF.
${TAIL}`;
}

const pdfDe = (m) => {
  if (!m) return null;
  const head = m.groups.head ?? '';
  return { pages: Number(m.groups.pages), size: Number(m.groups.xlen), head, isPdf: head.toUpperCase().startsWith(PDF_MAGIC) };
};

/** Interpreta a saída do driver de Smart Form. Puro. `ok` = FM achado, CALL subrc 0 e PDF com cabeçalho %PDF. */
export function parseSmartFormOutput(saida) {
  const s = String(saida);
  const fm = s.match(/SF_FM (\S+) subrc=(\d+) fm=(\S*)[ \t]*([^\n]*)/);
  const call = s.match(/SF_CALL subrc=(\d+) otf_lines=(\d+)[ \t]*([^\n]*)/);
  const exc = s.match(/SF_CALL exc ([^\n]*)/)?.[1]?.trim() ?? null;
  const pdf = pdfDe(s.match(/SF_PDF subrc=(?<rc>\d+) pages=(?<pages>\d+) size=\d+ xlen=(?<xlen>\d+) head=(?<head>\S*)/));
  const txtRc = s.match(/SF_TXT_RC subrc=(\d+) lines=(\d+)/);
  const texto = [...s.matchAll(/^SF_TXT (.*)$/gm)].map((m) => m[1].replace(/\s+$/, ''));
  const subrc = call ? Number(call[1]) : null;
  return {
    ok: fm?.[2] === '0' && subrc === 0 && !!pdf?.isPdf,
    form: fm?.[1] ?? null, fm: fm?.[3] || null, fmSubrc: fm ? Number(fm[2]) : null,
    subrc, msg: (call?.[3] ?? fm?.[4] ?? '').trim() || null, exc,
    otfLines: call ? Number(call[2]) : 0, pdf, textoLinhas: txtRc ? Number(txtRc[2]) : 0, texto,
    pdfBase64: juntarBase64(s, 'SF_B64'),
  };
}

/**
 * Junta os pedaços `<TAG> <base64>` da saída de um driver e confere o total contra `<TAG>_LEN`. Puro.
 * Devolve `null` quando o driver não emitiu base64; lança quando emitiu truncado (saída cortada).
 */
export function juntarBase64(saida, tag) {
  const s = String(saida ?? '');
  const decl = s.match(new RegExp(`^${tag}_LEN (\\d+)`, 'm'));
  const partes = [...s.matchAll(new RegExp(`^${tag} (\\S+)$`, 'gm'))].map((m) => m[1]);
  if (!decl && !partes.length) return null;
  const b64 = partes.join('');
  if (decl && b64.length !== Number(decl[1])) {
    throw new Error(`forms: base64 ${tag} veio truncado — o driver anunciou ${decl[1]} caracteres e chegaram ${b64.length}`);
  }
  return b64 || null;
}

/** Os IMPORT_PARAMETERS do asx-XML da interface (SFPIOPAR) → [{ name, typing, typename, optional }]. Puro. */
export function parseAdobeInterfaceParams(xml) {
  return [...String(xml ?? '').matchAll(/<SFPIOPAR>([\s\S]*?)<\/SFPIOPAR>/g)].map((m) => {
    const campo = (t) => m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '';
    return { name: campo('NAME'), typing: campo('TYPING'), typename: campo('TYPENAME'), optional: campo('OPTIONAL') === 'X' };
  });
}

/** Interpreta a saída do driver de Adobe Form. Puro. `ok` = CALL subrc 0 e PDF com cabeçalho %PDF (exige ADS). */
export function parseAdobeFormOutput(saida) {
  const s = String(saida);
  const ifc = s.match(/FP_IF (\S+) subrc=(\d+) interface=(\S*)/);
  const fm = s.match(/FP_FM (\S+) subrc=(\d+) fm=(\S*)[ \t]*([^\n]*)/);
  const open = s.match(/FP_JOB_OPEN subrc=(\d+) connection=(\S*)[ \t]*([^\n]*)/);
  const call = s.match(/FP_CALL subrc=(?<rc>\d+) pages=(?<pages>\d+) xlen=(?<xlen>\d+) head=(?<head>\S*)[ \t]*(?<msg>[^\n]*)/);
  const exc = s.match(/FP_CALL exc ([^\n]*)/)?.[1]?.trim() ?? null;
  const adsErr = s.match(/FP_ADS_ERR ([^\n]*)/)?.[1]?.trim() ?? null;
  const close = s.match(/FP_JOB_CLOSE subrc=(\d+)/);
  const subrc = call ? Number(call.groups.rc) : null;
  const pdf = pdfDe(call);
  return {
    ok: subrc === 0 && !!pdf?.isPdf,
    form: fm?.[1] ?? ifc?.[1] ?? null, fm: fm?.[3] || null, fmSubrc: fm ? Number(fm[2]) : null,
    interface: ifc?.[3] || null, params: parseAdobeInterfaceParams(s.match(/FP_IF_PARAMS ([^\n]*)/)?.[1]),
    jobOpen: open ? { subrc: Number(open[1]), connection: open[2], msg: open[3].trim() || null } : null,
    subrc, msg: (call?.groups.msg ?? fm?.[4] ?? '').trim() || null, exc, adsErr, pdf,
    jobClose: close ? Number(close[1]) : null,
  };
}

/**
 * O texto renderizado contém a string? (case-insensitive, espaços colapsados). Puro.
 *
 * ⚠ **O canal ASCII do `CONVERT_OTF` escapa o `&` como `&amp;`** (medido no item 48: o papel imprime
 * `P&D`, o texto do assert traz `P&amp;D`; `<` e `>` vêm crus). Sem desescapar, um documento correto
 * REPROVA — o falso negativo simétrico dos dois falsos positivos do item 46.
 */
export function contemTexto(resultado, trecho) {
  const norm = (t) => String(t).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase();
  const alvo = norm(trecho);
  return (resultado?.texto ?? []).some((l) => norm(l).includes(alvo)) || norm((resultado?.texto ?? []).join(' ')).includes(alvo);
}

/** O que o Smart Form é no banco, em outra LUW: STXFADM (admin) + STXFADMI (número do FM gerado). */
export async function smartFormInfo(cfg, form) {
  const F = nomeForm(form);
  const [adm, admi] = await Promise.all([
    readTable(cfg, 'STXFADM', { where: [`FORMNAME = '${F}'`] }),
    readTable(cfg, 'STXFADMI', { where: [`FORMNAME = '${F}'`] }),
  ]);
  return { exists: adm.length === 1, adm: adm[0] ?? null, fmNumb: admi[0]?.FMNUMB ?? null, fm: admi[0]?.FMNUMB ? `/1BCDWB/SF${admi[0].FMNUMB}` : null };
}

/** O que o Adobe Form é no banco, em outra LUW: FPLAYOUT + FPCONTEXT (→ interface) + FPINTERFACE (sem os xstrings). */
export async function adobeFormInfo(cfg, form) {
  const F = nomeForm(form);
  const [layout, context] = await Promise.all([
    readTable(cfg, 'FPLAYOUT', { campos: ['NAME', 'STATE', 'LASTUSER', 'LASTDATE', 'FORMTECH', 'TYPE'], where: [`NAME = '${F}'`] }),
    readTable(cfg, 'FPCONTEXT', { campos: ['NAME', 'STATE', 'INTERFACE', 'LASTUSER', 'LASTDATE'], where: [`NAME = '${F}'`] }),
  ]);
  const ifn = context.find((c) => c.STATE === 'A')?.INTERFACE ?? context[0]?.INTERFACE ?? null;
  const iface = ifn ? await readTable(cfg, 'FPINTERFACE', { campos: ['NAME', 'STATE', 'INTERFACE_TYPE', 'LASTUSER', 'LASTDATE'], where: [`NAME = '${ifn}'`] }) : [];
  return { exists: layout.length > 0, active: layout.some((l) => l.STATE === 'A'), layout, context, interface: ifn, interfaceRows: iface };
}

const driverDe = (prefixo, form) => `${prefixo}${String(form).toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 30 - prefixo.length)}`;

/**
 * Renderiza o Smart Form pelo driver e devolve { ok, fm, pages, pdf: { size, head, isPdf }, texto[], … , banco, saida }.
 * O driver fica em `pkg` (`keepDriver: false` apaga ao final). Exige senha no cfg (classrun em sessão nova).
 */
export async function renderSmartForm(conexao, { form, driver = driverDe('Y_SF_', form), keepDriver = false, pkg = '$TMP', salvarPdfEm, ...opts }) {
  const F = nomeForm(form); assertZY(driver);
  const source = buildSmartFormDriverSource(driver, { form: F, pdfBase64: !!salvarPdfEm || !!opts.pdfBase64, ...opts });
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: renderiza Smart Form ${F}`, source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  const p = r.ok ? parseSmartFormOutput(r.saida) : { ...parseSmartFormOutput(''), ok: false, msg: r.erro };
  if (salvarPdfEm && p.pdfBase64) await writeFile(salvarPdfEm, Buffer.from(p.pdfBase64, 'base64'));
  const banco = await smartFormInfo(conexao.cfg, F).catch(() => ({ exists: false }));
  return { ...p, banco, arquivo: salvarPdfEm && p.pdfBase64 ? salvarPdfEm : null, saida: r.saida };
}

/**
 * Renderiza o Adobe Form pelo ADS e devolve { ok, fm, params[], jobOpen, pdf, adsErr, …, banco, saida }.
 * `params` vem mesmo quando o ADS falha — é o checklist do que o form exige. Exige senha no cfg.
 */
export async function renderAdobeForm(conexao, { form, driver = driverDe('Y_FP_', form), keepDriver = false, pkg = '$TMP', ...opts }) {
  const F = nomeForm(form); assertZY(driver);
  const source = buildAdobeFormDriverSource(driver, { form: F, ...opts });
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: renderiza Adobe Form ${F}`, source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  const p = r.ok ? parseAdobeFormOutput(r.saida) : { ...parseAdobeFormOutput(''), ok: false, msg: r.erro };
  const banco = await adobeFormInfo(conexao.cfg, F).catch(() => ({ exists: false }));
  return { ...p, banco, saida: r.saida };
}

// ---------------------------------------------------------------------------------------------
// CÓPIA SEM GUI — a metade da linha "form: só GUI" que caiu (item 41, medido 2026-08-31)
//
// A SFP copia um Adobe Form por dois FMs que **abrem dynpro**: `FP_FB_INTERFACE_COPY` e
// `FP_FB_FORM_COPY` são UI do Form Builder e, no classrun, devolvem (capturável)
// "Envio da tela SAPLFPUIFB 1210 impossível: nenh.tipo de sistema Windows indicado".
//
// Por baixo deles está a API que serve aqui:
//
//   cl_fp_wb_interface=>copy( i_source i_name i_devclass [i_ordernum] )      ← SEM i_dark
//   cl_fp_wb_form=>copy(      i_source i_name i_devclass [i_ordernum] i_dark = 'X' )
//   cl_fp_wb_helper=>interface_activate( i_name ) · form_activate( i_name i_language )
//   cl_fp_wb_form=>delete( i_name i_dark ) · cl_fp_wb_interface=>delete( i_name )
//
// `I_DARK` é o "sem UI" e **só existe no FORM** — passá-lo à interface é erro de compilação
// ("The formal parameter I_DARK does not exist"). O `i_devclass = '$TMP'` evita o popup de pacote.
//
// ⚠️ **A cópia do FORM exige ADS alcançável; a da INTERFACE não.** Medido no mesmo dia, com o mesmo
// driver, nos dois sistemas: no SXD (ADS respondendo) `COPY ok`, FPLAYOUT e TADIR gravados; no s4h
// (ADS que não responde) a mesma chamada levanta `CX_FP_API_INTERNAL` — "Ocorreu um erro interno em
// SAFP API", sem `previous` e sem detalhe. A interface copiou nos DOIS. Se a cópia do form falhar
// com essa exceção opaca, olhe o ADS antes de olhar o código.
//
// Outros dois desvios medidos:
//   • `cl_fp_wb_helper=>form_exists`/`form_layout_exists` sinalizam ao CONTRÁRIO do que o nome
//     sugere: levantam `CX_FP_API_REPOSITORY` "O objeto X já existe" quando ele EXISTE — são check de
//     nome livre, não "existe?". Para saber se existe, leia FPLAYOUT/FPINTERFACE (`adobeFormInfo`).
//   • o clone NÃO passa a apontar para a interface clonada: `FPCONTEXT-INTERFACE` do novo form
//     continua sendo a interface da ORIGEM (medido: `Y_FP_F41` → `FP_TEST_00`). Trocar a referência
//     é outro passo, não medido.
//
// O clone é um form de verdade: ganha FM próprio (`/1BCDWB/SM00000020` ao lado do `…07` da origem) e
// `renderAdobeForm` roda sobre ele até a porta do ADS.

const blocoTry = (rot, chamada) => {
  const v = `lx_${rot.toLowerCase()}`;
  return `    TRY.
        ${chamada}
        out->write( |${rot} ok| ).
      CATCH cx_root INTO DATA(${v}).
        out->write( |${rot} EXC { cl_abap_classdescr=>get_class_name( ${v} ) }: { ${v}->get_text( ) }| ).
    ENDTRY.`;
};

/** Fonte do driver que copia interface e/ou form Adobe (puro). */
export function buildAdobeCopySource(name, { origem, form, interfaceNova, origemInterface, pkg = '$TMP', corrNr = '', ativar = true } = {}) {
  const O = nomeForm(origem);
  const ordem = corrNr ? ` i_ordernum = '${esc(corrNr)}'` : '';
  const passos = [];
  if (interfaceNova) {
    const I = nomeForm(interfaceNova); assertZY(I);
    const src = esc(origemInterface ? nomeForm(origemInterface) : O);
    passos.push(blocoTry('IF_COPY', `cl_fp_wb_interface=>copy( i_source = '${src}' i_name = '${I}' i_devclass = '${esc(pkg)}'${ordem} ).`));
    if (ativar) passos.push(blocoTry('IF_ACT', `cl_fp_wb_helper=>interface_activate( i_name = '${I}' ).`));
  }
  if (form) {
    const F = nomeForm(form); assertZY(F);
    passos.push(blocoTry('FORM_COPY', `cl_fp_wb_form=>copy( i_source = '${O}' i_name = '${F}' i_devclass = '${esc(pkg)}'${ordem} i_dark = 'X' ).`));
    if (ativar) passos.push(blocoTry('FORM_ACT', `cl_fp_wb_helper=>form_activate( i_name = '${F}' i_language = sy-langu ).`));
  }
  if (!passos.length) throw new Error('forms: copiarAdobeForm exige { form } e/ou { interfaceNova }');
  return `${HEAD(name)}\n${passos.join('\n')}\n${TAIL}`;
}

/** Fonte do driver que APAGA o form e/ou a interface Adobe (puro). */
export function buildAdobeDeleteSource(name, { form, interfaceNome, corrNr = '' } = {}) {
  const ordem = corrNr ? ` i_ordernum = '${esc(corrNr)}'` : '';
  const passos = [];
  // o FORM sai antes da INTERFACE — ele a referencia
  if (form) { const F = nomeForm(form); assertZY(F); passos.push(blocoTry('DEL_FORM', `cl_fp_wb_form=>delete( i_name = '${F}'${ordem} i_dark = 'X' ).`)); }
  if (interfaceNome) { const I = nomeForm(interfaceNome); assertZY(I); passos.push(blocoTry('DEL_IF', `cl_fp_wb_interface=>delete( i_name = '${I}'${ordem} ).`)); }
  if (!passos.length) throw new Error('forms: apagarAdobeForm exige { form } e/ou { interfaceNome }');
  return `${HEAD(name)}\n${passos.join('\n')}\n${TAIL}`;
}

/** Os `ROTULO ok` / `ROTULO EXC …` de um driver viram `{ ok, passos: [{ passo, ok, erro }] }`. Puro. */
export function parsePassos(saida) {
  const passos = [];
  for (const l of String(saida ?? '').split('\n')) {
    const m = l.trim().match(/^([A-Z_0-9]+) (ok|EXC (.*))$/);
    if (m) passos.push({ passo: m[1], ok: m[2] === 'ok', erro: m[3] ?? null });
  }
  return { ok: passos.length > 0 && passos.every((p) => p.ok), passos };
}

/** A saída dos drivers de cópia/exclusão vira `{ ok, passos: [{ passo, ok, erro }] }` (puro). */
export const parseAdobeCopyOutput = parsePassos;

/**
 * Copia um Adobe Form (SFPF) e/ou sua interface (SFPI) — **sem GUI**.
 *
 * ```js
 * await copiarAdobeForm(cx, { origem: 'FP_TEST_00', form: 'Y_FP_CLONE', interfaceNova: 'Y_FP_CLONE_IF' });
 * ```
 * Deixa a classe `driver` em `$TMP` só durante a execução (apagada no fim, como `renderAdobeForm`).
 * ⚠️ A cópia do FORM exige ADS alcançável (ver o cabeçalho desta seção).
 */
export async function copiarAdobeForm(conexao, { driver = 'YJBV_FP_COPY', keepDriver = false, ...opts }) {
  const source = buildAdobeCopySource(driver, opts);
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg: '$TMP', description: 'driver: copia Adobe Form', source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  const p = parseAdobeCopyOutput(r.ok ? r.saida : '');
  if (!p.ok) {
    const falha = p.passos.find((x) => !x.ok);
    const dica = /CX_FP_API_INTERNAL/.test(falha?.erro ?? '')
      ? '\n→ causa provável: ADS inalcançável — a cópia do FORM exige ADS vivo (a da interface não). Medido 2026-08-31: mesma chamada, ok no SXD e CX_FP_API_INTERNAL no s4h.'
      : '';
    throw new Error(`forms: cópia falhou em ${falha?.passo ?? '?'}: ${falha?.erro ?? r.erro}${dica}`);
  }
  return { ...p, saida: r.saida };
}

/** Apaga o form e/ou a interface Adobe. Destrutivo: exige `confirm: true`. */
export async function apagarAdobeForm(conexao, { driver = 'YJBV_FP_DEL', keepDriver = false, confirm = false, ...opts }) {
  if (confirm !== true) throw new Error('GUARD-RAIL: apagarAdobeForm exige confirm:true (remoção de form é irreversível).');
  const source = buildAdobeDeleteSource(driver, opts);
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg: '$TMP', description: 'driver: apaga Adobe Form', source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  return { ...parseAdobeCopyOutput(r.ok ? r.saida : ''), saida: r.saida };
}

// ---------------------------------------------------------------------------------------------
// SUBSTITUIR O LAYOUT (XDP) DE UM FORM EXISTENTE — o passo manual de nota SAP (item 59, medido
// 2026-09-01, S4H 758:250)
//
// "SFP → form → substituir o layout pelo XML anexo → salvar" sai sem GUI:
//
//   cl_fp_wb_form=>load( i_name i_mode = if_fp_wb_object=>c_mode_write [i_language] [i_ordernum] )
//   CAST if_fp_form( lo_wb->get_object( ) )->get_layout( )->set_layout_data(
//     i_layout_data = <XDP xstring> i_set_xliff_ids = abap_false )
//   lo_wb->save( ) → free( ) → COMMIT WORK AND WAIT
//
// Fatos medidos (fecham o que o item 41 deixou aberto):
//   • os valores aceitos de `i_mode` são `READ`, `WRITE` e `TOGGLE` (IF_FP_WB_OBJECT=>C_MODE_*,
//     case-insensitive; internamente viram SHOW/MODIFY) — `'SHOW'` direto cai no WHEN OTHERS e é o
//     CX_FP_API_USAGE "parâmetro I_MODE não é válido" que o item 41 mediu;
//   • load READ (o default) + set + save é RECUSADO com `CX_FP_API_USAGE` — o modo de escrita é WRITE;
//   • com `i_set_xliff_ids = abap_false` a FPLAYOUTT guarda o XDP **byte a byte** (sha1 igual ao
//     arquivo), state `I`, no idioma do load — inclusive um XDP "nascido fora" (escrito à mão,
//     namespace xfa-template 2.8), sem validação nenhuma contra a interface/contexto do form;
//   • ⚠️ o DEFAULT do SAP (`i_set_xliff_ids = abap_true`) NÃO é fiel: re-serializa o XDP inteiro
//     (atributos reordenados, header reescrito) e injeta o bloco `<tags>` xfa-xliff + um
//     `xft-xliff:id` em cada `<text>` (666 → 871 bytes na POC) — por isso o default DA LIB é false;
//   • o save não valida o XDP (item 57) — quem confere que o arquivo É um template XFA é o
//     guard-rail local, antes da rede.
//
// O layout entra na versão INATIVA (state `I`) — **ativar é outro passo e exige ADS** (item 53);
// em sistema sem ADS o form fica gravado esperando ativação. E o XDP é POR IDIOMA (item 53): o
// load sem `idioma` escreve no idioma de logon da sessão.

/** Fonte do driver que substitui o layout de um Adobe Form existente por um XDP (puro). */
export function buildLayoutReplaceSource(name, { form, xdpBase64, xliffIds = false, idioma = '', corrNr = '' } = {}) {
  const F = nomeForm(form); assertZY(F);
  if (!xdpBase64) throw new Error('forms: substituirLayoutAdobe exige o XDP ({ xdp } ou { arquivo })');
  const ordem = corrNr ? ` i_ordernum = '${esc(corrNr)}'` : '';
  const lang = idioma ? ` i_language = '${esc(String(idioma).toUpperCase())}'` : '';
  const langSel = idioma ? `'${esc(String(idioma).toUpperCase())}'` : 'sy-langu';
  const partes = [];
  const b64 = String(xdpBase64);
  for (let i = 0; i < b64.length; i += B64_CHUNK) partes.push(b64.slice(i, i + B64_CHUNK));
  return `${HEAD(name)}
    DATA lt_b64 TYPE TABLE OF string.
    DATA lv_b64 TYPE string.
${partes.map((p) => `    APPEND '${p}' TO lt_b64.`).join('\n')}
    CONCATENATE LINES OF lt_b64 INTO lv_b64.
    DATA(lv_xdp) = cl_web_http_utility=>decode_x_base64( lv_b64 ).
    TRY.
        " READ (default) recusa o save com CX_FP_API_USAGE — o modo de escrita é WRITE (medido 2026-09-01)
        DATA(lo_wb) = cl_fp_wb_form=>load( i_name = '${F}' i_mode = if_fp_wb_object=>c_mode_write${lang}${ordem} ).
        DATA(lo_form) = CAST if_fp_form( lo_wb->get_object( ) ).
        lo_form->get_layout( )->set_layout_data( i_layout_data = lv_xdp i_set_xliff_ids = ${xliffIds ? 'abap_true' : 'abap_false'} ).
        lo_wb->save( ).
        lo_wb->free( ).
        COMMIT WORK AND WAIT.
        out->write( |LAYOUT_PUT ok| ).
      CATCH cx_root INTO DATA(lx_put).
        out->write( |LAYOUT_PUT EXC { cl_abap_classdescr=>get_class_name( lx_put ) }: { lx_put->get_text( ) }| ).
    ENDTRY.
    SELECT SINGLE layout FROM fplayoutt
      WHERE name = '${F}' AND state = 'I' AND language = @${langSel}
      INTO @DATA(lv_gravado).
    DATA lv_hash TYPE string.
    cl_abap_message_digest=>calculate_hash_for_raw( EXPORTING if_data = lv_gravado IMPORTING ef_hashstring = lv_hash ).
    out->write( |LAYOUT_LIDO len={ xstrlen( lv_gravado ) } sha1={ lv_hash } igual={ xsdbool( lv_gravado = lv_xdp ) }| ).
${TAIL}`;
}

/** A saída do driver de substituição vira `{ ok, erro, len, sha1, igual }`. Puro. */
export function parseLayoutReplaceOutput(saida) {
  const s = String(saida ?? '');
  const put = s.match(/LAYOUT_PUT (ok|EXC (.*))/);
  const lido = s.match(/LAYOUT_LIDO len=(\d+) sha1=(\S+) igual=(X?)/);
  return {
    ok: put?.[1] === 'ok',
    erro: put?.[2] ?? (put ? null : 'driver não reportou LAYOUT_PUT'),
    len: lido ? Number(lido[1]) : null,
    sha1: lido?.[2] ?? null,
    igual: lido ? lido[3] === 'X' : null,
  };
}

/**
 * Substitui o layout (XDP) de um Adobe Form EXISTENTE — o passo manual "substituir o layout pelo
 * XML anexo" de nota SAP, sem GUI.
 *
 * ```js
 * await substituirLayoutAdobe(cx, { form: 'Y_FP_DOC', arquivo: 'anexo-da-nota.xdp' });
 * ```
 *
 * O XDP entra **byte a byte** na versão INATIVA (`FPLAYOUTT` state `I`), no idioma da sessão
 * (ou `idioma`). Ativar é outro passo e exige ADS. `xliffIds: true` liga o default do SAP
 * (`i_set_xliff_ids`), que re-serializa o XDP e injeta ids de tradução — aí `igual` volta false
 * por construção. Devolve `{ form, state: 'I', len, sha1, igual }`.
 */
export async function substituirLayoutAdobe(conexao, {
  form, xdp, arquivo, xliffIds = false, idioma = '', corrNr = '',
  driver = 'YJBV_FP_LAYX', keepDriver = false,
} = {}) {
  let conteudo = xdp;
  if (conteudo == null && arquivo) conteudo = await readFile(arquivo);
  if (conteudo == null) throw new Error('forms: substituirLayoutAdobe exige { xdp } (string/Buffer) ou { arquivo }');
  const buf = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo), 'utf8');
  // o save do SAP aceita QUALQUER xstring sem validar (item 57) — a conferência é daqui, antes da rede
  const inicio = buf.toString('utf8', 0, Math.min(buf.length, 2000));
  if (!/xfa-template/.test(inicio)) {
    throw new Error('GUARD-RAIL: o conteúdo não parece um template XFA (sem namespace xfa-template nos primeiros 2000 bytes) — o save do SAP gravaria QUALQUER byte sem reclamar, e o erro só apareceria no render.');
  }
  const source = buildLayoutReplaceSource(driver, { form, xdpBase64: buf.toString('base64'), xliffIds, idioma, corrNr });
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg: '$TMP', description: 'driver: substitui layout de Adobe Form', source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  const p = parseLayoutReplaceOutput(r.ok ? r.saida : '');
  if (!p.ok) throw new Error(`forms: substituirLayoutAdobe falhou em ${nomeForm(form)}: ${p.erro ?? r.erro}`);
  if (!xliffIds && !p.igual) {
    throw new Error(`forms: o XDP gravado NÃO é byte a byte o enviado (len ${p.len} × ${buf.length}) — com xliffIds:false isso não deveria acontecer; confira idioma/state na FPLAYOUTT.`);
  }
  return { form: nomeForm(form), state: 'I', len: p.len, sha1: p.sha1, igual: p.igual, saida: r.saida };
}

// ---------------------------------------------------------------------------------------------
// SMART FORM SEM GUI — copiar, baixar o XML, subir o XML, apagar (item 42, medido 2026-08-31, S4H 758)
//
// A via é `CL_SSF_FB_SMART_FORM` (a mesma do abapGit) num driver classrun:
//
//   lo_sf->load( im_formname im_language )                        ← lê o form (ativo)
//   lo_sf->xml_download( EXPORTING parent = doc CHANGING document = doc )
//   lo_new->enqueue( formname mode = 'INSERT' suppress_corr_check master_language )
//   lo_new->xml_upload( EXPORTING dom formname language CHANGING sform = lo_res )
//   lo_res->store( im_formname im_language im_active = 'X' )      ← grava a versão ATIVA
//   lo_new->dequeue( formname )
//   CALL FUNCTION 'FB_GENERATE_FORM' ( i_formname )               ← só aqui nasce o FM
//
// ⚠️ **O GOTCHA QUE DECIDE TUDO: o DOM do `xml_download` não serve direto para o `xml_upload`.**
// Medido nas duas formas, no mesmo dia: passando `document->get_root_element( )` do próprio download,
// o `xml_upload` devolve `ok` e o `store` grava — mas só o CABEÇALHO (STXFCONT 1 linha de 344 bytes,
// STXFOBJT e STXFTXT ZERADAS) e a geração morre em `generation_error` (subrc 5, "Erro ao gerar
// formulário"), sem dizer que o form está vazio. O que falta é o **RE-PARSE**: renderizar o documento
// para string (`create_renderer` + `create_ostream_cstring`) e parseá-la de volta
// (`create_parser` + `create_istream_cstring`) antes do upload — aí STXFOBJT vai a 255 linhas,
// STXFTXT a 82 e `FB_GENERATE_FORM` devolve subrc 0 com o FM `/1BCDWB/SF…`. O abapGit não esbarra
// nisso porque passa por arquivo (serialize grava, deserialize lê) — lá o re-parse sai de graça.
// Antes de renderizar, as duas declarações de namespace do abapGit vão no root (`xmlns:sf` e `xmlns`).
//
// Outros pontos medidos:
//   • **A geração é um passo à parte.** `store( im_active = 'X' )` deixa o form ativo em STXFADM mas
//     SEM FM: `SSF_FUNCTION_MODULE_NAME` devolve subrc 2 e o render falha em "Não foi possível gerar
//     formulário". `FB_GENERATE_FORM` (SAPLSTXB, não RFC) é quem cria a entrada STXFADMI/FMNUMB.
//   • **`FB_DELETE_FORM` apaga sem GUI**: `i_with_dialog = ' '` + `i_with_confirm_dialog = ' '`.
//   • A TADIR é nossa: `TR_TADIR_INTERFACE` antes do enqueue (o abapGit faz o mesmo `tadir_insert`),
//     senão o form nasce sem entrada no repositório.
//   • O clone nasce com o MASTERLANG da sessão (P), não o da origem (D), e VERSION `00000`.
//   ⚠️ **CORREÇÃO (item 61/I77, 2026-09-01): essa frase valia só para o `copiarSmartForm` isolado.**
//     `lo_new->enqueue( master_language = sy-langu )` NÃO gruda: quem manda é o `<MASTERLANG>` que já
//     vem DENTRO do DOM enviado ao `xml_upload`, e a escada (`baixarSmartFormXml` → poda/troca →
//     `subirSmartFormXml`) nunca toca esse campo do HEADER — o upload final grava o MASTERLANG DA
//     ORIGEM (D, herdado do `SF_EXAMPLE_01`), não o da sessão que escreveu o texto. Medido: um form
//     publicado por `publicarMarkdown` em sessão P saiu com STXFADM-MASTERLANG = D, FIRSTUSER/
//     LASTUSER = SAP, datas de 1999/2004 — tudo copiado do molde. Como o texto CONSTRUÍDO só existe
//     no idioma de quem gravou (I77), um MASTERLANG mentiroso quebra qualquer default que confie nele
//     (`renderSmartForm`, a migração do item 53 — "migre no masterlang do form" também dependia disso
//     estar certo). Fix: `lo_res->header-masterlang = sy-langu.` entre o `xml_upload` e o `store`,
//     sobrescrevendo o valor herdado do DOM — feito no `BLOCO_UPLOAD`, vale para cópia E upload.
//
// O XML é o material da escada: `baixarSmartFormXml` traz o documento inteiro (SF_EXAMPLE_01: 108.869
// caracteres) para o disco, onde ele é editável, e `subirSmartFormXml` devolve o XML editado como form
// novo. Nas duas pontas o transporte é **base64 de UTF-8** — no download, pedaços `SFX_B64` na saída do
// classrun; no upload, literais no fonte do driver (o fonte ABAP não passa de 255 caracteres por linha).

const IXML_DATA = `    DATA: lo_sf TYPE REF TO cl_ssf_fb_smart_form, lo_new TYPE REF TO cl_ssf_fb_smart_form,
          lo_res TYPE REF TO cl_ssf_fb_smart_form, li_ixml TYPE REF TO if_ixml,
          li_doc TYPE REF TO if_ixml_document, li_doc2 TYPE REF TO if_ixml_document,
          li_root TYPE REF TO if_ixml_element, li_sfac TYPE REF TO if_ixml_stream_factory,
          li_ost TYPE REF TO if_ixml_ostream, li_ist TYPE REF TO if_ixml_istream,
          li_parser TYPE REF TO if_ixml_parser, li_rend TYPE REF TO if_ixml_renderer,
          lv_xml TYPE string, lv_x TYPE xstring, lv_b64 TYPE string, lv_off TYPE i, lv_cut TYPE i,
          lv_msg TYPE string, lv_fm TYPE rs38l_fnam, lv_o TYPE tdsfname.`;

/** LOAD + XML_DOWNLOAD + namespaces + render → `lv_xml`. Trecho ABAP; `RETURN` se o load falhar. */
const BLOCO_DOWNLOAD = (F) => `    li_ixml = cl_ixml=>create( ).
    li_doc = li_ixml->create_document( ).
    li_sfac = li_ixml->create_stream_factory( ).
    CREATE OBJECT lo_sf.
    TRY.
        lo_sf->load( im_formname = '${esc(F)}' im_language = '' ).
        out->write( |SF_LOAD ok| ).
      CATCH cx_root INTO DATA(lx_load).
        out->write( |SF_LOAD EXC { cl_abap_classdescr=>get_class_name( lx_load ) }: { lx_load->get_text( ) }| ).
        RETURN.
    ENDTRY.
    lo_sf->xml_download( EXPORTING parent = li_doc CHANGING document = li_doc ).
    li_root = li_doc->get_root_element( ).
    li_root->set_attribute( name = 'sf' namespace = 'xmlns' value = 'urn:sap-com:SmartForms:2000:internal-structure' ).
    li_root->set_attribute( name = 'xmlns' value = 'urn:sap-com:sdixml-ifr:2000' ).
    li_ost = li_sfac->create_ostream_cstring( string = lv_xml ).
    li_rend = li_ixml->create_renderer( document = li_doc ostream = li_ost ).
    li_rend->render( ).`;

/** RE-PARSE de `lv_xml` para `li_doc2` — o passo sem o qual o form sobe vazio. Trecho ABAP. */
const BLOCO_REPARSE = `    IF li_ixml IS INITIAL.
      li_ixml = cl_ixml=>create( ).
      li_sfac = li_ixml->create_stream_factory( ).
    ENDIF.
    li_doc2 = li_ixml->create_document( ).
    li_ist = li_sfac->create_istream_cstring( string = lv_xml ).
    li_parser = li_ixml->create_parser( stream_factory = li_sfac istream = li_ist document = li_doc2 ).
    li_parser->parse( ).
    IF li_parser->num_errors( ) = 0.
      out->write( |SF_PARSE ok| ).
    ELSE.
      out->write( |SF_PARSE EXC { li_parser->num_errors( ) } erros de parse no XML| ).
      RETURN.
    ENDIF.
    out->write( |SF_XML len={ strlen( lv_xml ) } root={ li_doc2->get_root_element( )->get_name( ) }| ).`;

/** TADIR + ENQUEUE + XML_UPLOAD + STORE ativo + DEQUEUE + FB_GENERATE_FORM + FM. Trecho ABAP. */
const BLOCO_UPLOAD = (C, pkg, corrNr) => `    CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = ' '
      wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'SSFO' wi_tadir_obj_name = '${esc(C)}'
      wi_tadir_devclass = '${esc(pkg)}'${corrNr ? ` wi_order = '${esc(corrNr)}'` : ''} EXCEPTIONS OTHERS = 1.
    out->write( |SF_TADIR subrc={ sy-subrc }| ).
    CREATE OBJECT lo_new.
    TRY.
        lo_new->enqueue( suppress_corr_check = space master_language = sy-langu
                         mode = 'INSERT' formname = '${esc(C)}' ).
        lo_new->xml_upload( EXPORTING dom = li_doc2->get_root_element( ) formname = '${esc(C)}'
                            language = sy-langu CHANGING sform = lo_res ).
        lo_res->header-masterlang = sy-langu.
        lo_res->store( im_formname = lo_res->header-formname im_language = sy-langu im_active = 'X' ).
        out->write( |SF_STORE ok| ).
      CATCH cx_root INTO DATA(lx_up).
        out->write( |SF_STORE EXC { cl_abap_classdescr=>get_class_name( lx_up ) }: { lx_up->get_text( ) }| ).
    ENDTRY.
    TRY.
        lo_new->dequeue( formname = '${esc(C)}' ).
      CATCH cx_root.
    ENDTRY.
    COMMIT WORK AND WAIT.
    CLEAR lv_msg.
    CALL FUNCTION 'FB_GENERATE_FORM' EXPORTING i_formname = '${esc(C)}'
      EXCEPTIONS no_form = 1 no_name = 2 no_active_source = 3 illegal_formtype = 4 generation_error = 5 OTHERS = 6.
    IF sy-subrc = 0.
      out->write( |SF_GEN ok| ).
    ELSE.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg.
      out->write( |SF_GEN EXC subrc={ sy-subrc } { lv_msg }| ).
    ENDIF.
    COMMIT WORK AND WAIT.
    CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME' EXPORTING formname = '${esc(C)}' IMPORTING fm_name = lv_fm
      EXCEPTIONS no_form = 1 no_function_module = 2 OTHERS = 3.
    out->write( |SF_NEW_FM subrc={ sy-subrc } fm={ lv_fm }| ).`;

/** FB_DELETE_FORM sem diálogo. Trecho ABAP; `tolerante` transforma "não existe" (subrc 2) em ok. */
const BLOCO_DELETE = (F, tolerante) => `    CLEAR lv_msg.
    CALL FUNCTION 'FB_DELETE_FORM' EXPORTING i_formname = '${esc(F)}'
      i_with_dialog = ' ' i_with_confirm_dialog = ' ' IMPORTING o_formname = lv_o
      EXCEPTIONS no_name = 1 no_form = 2 form_locked = 3 no_access_permission = 4
      illegal_language = 5 illegal_formtype = 6 OTHERS = 7.
    IF sy-subrc = 0${tolerante ? ' OR sy-subrc = 2' : ''}.
      out->write( |SF_DEL ok| ).
    ELSE.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg.
      out->write( |SF_DEL EXC subrc={ sy-subrc } { lv_msg }| ).
    ENDIF.
    COMMIT WORK AND WAIT.`;

/** Emite uma xstring como pedaços de base64 na saída do classrun. Trecho ABAP. */
const BLOCO_B64 = (tag, expr) => `    lv_x = ${expr}.
    lv_b64 = cl_web_http_utility=>encode_x_base64( lv_x ).
    out->write( |${tag}_LEN { strlen( lv_b64 ) }| ).
    CLEAR lv_off.
    WHILE lv_off < strlen( lv_b64 ).
      lv_cut = strlen( lv_b64 ) - lv_off.
      IF lv_cut > ${B64_CHUNK}. lv_cut = ${B64_CHUNK}. ENDIF.
      out->write( |${tag} { lv_b64+lv_off(lv_cut) }| ).
      lv_off = lv_off + lv_cut.
    ENDWHILE.`;

/** Literais ABAP com o base64 do XML, montados numa string. Trecho ABAP; pedaços de `B64_CHUNK`. */
const BLOCO_B64_LITERAL = (b64) => {
  const partes = [];
  for (let i = 0; i < b64.length; i += B64_CHUNK) partes.push(b64.slice(i, i + B64_CHUNK));
  return `    DATA lt_b64 TYPE TABLE OF string.
${partes.map((p) => `    APPEND '${p}' TO lt_b64.`).join('\n')}
    CONCATENATE LINES OF lt_b64 INTO lv_b64.
    lv_x = cl_web_http_utility=>decode_x_base64( lv_b64 ).
    lv_xml = cl_abap_codepage=>convert_from( lv_x ).`;
};

/** Fonte do driver que COPIA um Smart Form (download → re-parse → upload → generate). Puro. */
export function buildSmartFormCopySource(name, { origem, form, pkg = '$TMP', corrNr = '', substituir = false } = {}) {
  const O = nomeForm(origem); const C = nomeForm(form); assertZY(C);
  return `${HEAD(name)}
${IXML_DATA}
${substituir ? `${BLOCO_DELETE(C, true)}\n` : ''}${BLOCO_DOWNLOAD(O)}
${BLOCO_REPARSE}
${BLOCO_UPLOAD(C, pkg, corrNr)}
${TAIL}`;
}

/** Fonte do driver que BAIXA o XML de um Smart Form (base64 de UTF-8, em pedaços `SFX_B64`). Puro. */
export function buildSmartFormXmlDownloadSource(name, { form } = {}) {
  const F = nomeForm(form);
  return `${HEAD(name)}
${IXML_DATA}
${BLOCO_DOWNLOAD(F)}
${BLOCO_B64('SFX_B64', 'cl_abap_codepage=>convert_to( lv_xml )')}
${TAIL}`;
}

/** Fonte do driver que SOBE um XML como Smart Form (base64 no próprio fonte → re-parse → upload). Puro. */
export function buildSmartFormXmlUploadSource(name, { form, xml, pkg = '$TMP', corrNr = '', substituir = true } = {}) {
  const C = nomeForm(form); assertZY(C);
  if (!xml || typeof xml !== 'string') throw new Error('forms: subirSmartFormXml exige { xml } (o documento como string)');
  return `${HEAD(name)}
${IXML_DATA}
${BLOCO_B64_LITERAL(Buffer.from(xml, 'utf8').toString('base64'))}
${substituir ? `${BLOCO_DELETE(C, true)}\n` : ''}${BLOCO_REPARSE}
${BLOCO_UPLOAD(C, pkg, corrNr)}
${TAIL}`;
}

/** Fonte do driver que APAGA um Smart Form sem diálogo (FB_DELETE_FORM). Puro; só Z/Y. */
export function buildSmartFormDeleteSource(name, { form, tolerante = false } = {}) {
  const F = nomeForm(form); assertZY(F);
  return `${HEAD(name)}
${IXML_DATA}
${BLOCO_DELETE(F, tolerante)}
${TAIL}`;
}

/** A saída dos drivers de cópia/upload: passos + o FM gerado + o tamanho do XML. Puro. */
export function parseSmartFormCopyOutput(saida) {
  const s = String(saida);
  const p = parsePassos(s);
  const fm = s.match(/SF_NEW_FM subrc=(\d+) fm=(\S*)/);
  const xml = s.match(/SF_XML len=(\d+) root=(\S*)/);
  return {
    ...p,
    ok: p.ok && fm?.[1] === '0',
    fm: fm?.[2] || null, fmSubrc: fm ? Number(fm[1]) : null,
    xmlLen: xml ? Number(xml[1]) : null, root: xml?.[2] ?? null,
    tadir: Number(s.match(/SF_TADIR subrc=(\d+)/)?.[1] ?? -1),
  };
}

const rodarDriver = async (conexao, driver, source, descricao, keepDriver) => {
  assertZY(driver);
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg: '$TMP', description: descricao, source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  if (!r.ok) throw new Error(`forms: driver ${driver} falhou: ${r.erro ?? r.saida}`);
  return r;
};

/**
 * Copia um Smart Form (SSFO) — **sem GUI**, com o FM gerado no fim.
 *
 * ```js
 * await copiarSmartForm(cx, { origem: 'SF_EXAMPLE_01', form: 'Y_SF_C42' });
 * // { ok, fm: '/1BCDWB/SF00000189', passos: [{ passo: 'SF_LOAD', ok: true }, …] }
 * ```
 */
export async function copiarSmartForm(conexao, { driver = 'YJBV_SF_COPY', keepDriver = false, ...opts }) {
  const source = buildSmartFormCopySource(driver, opts);
  const r = await rodarDriver(conexao, driver, source, `driver: copia Smart Form ${nomeForm(opts.origem)}`, keepDriver);
  const p = parseSmartFormCopyOutput(r.saida);
  if (!p.ok) {
    const falha = p.passos.find((x) => !x.ok);
    throw new Error(`forms: cópia falhou em ${falha?.passo ?? 'SF_NEW_FM'}: ${falha?.erro ?? `sem FM gerado (subrc ${p.fmSubrc})`}`);
  }
  return { ...p, saida: r.saida };
}

/** Baixa o XML de um Smart Form (o material da escada). Grava em `salvarEm` quando informado. */
export async function baixarSmartFormXml(conexao, { form, driver = 'YJBV_SF_XML', keepDriver = false, salvarEm } = {}) {
  const F = nomeForm(form);
  const source = buildSmartFormXmlDownloadSource(driver, { form: F });
  const r = await rodarDriver(conexao, driver, source, `driver: baixa o XML do Smart Form ${F}`, keepDriver);
  const b64 = juntarBase64(r.saida, 'SFX_B64');
  const p = parsePassos(r.saida);
  if (!b64) throw new Error(`forms: o XML de ${F} não veio: ${p.passos.find((x) => !x.ok)?.erro ?? String(r.saida).slice(0, 300)}`);
  const xml = Buffer.from(b64, 'base64').toString('utf8');
  if (salvarEm) await writeFile(salvarEm, xml, 'utf8');
  return { ok: true, form: F, xml, arquivo: salvarEm ?? null, passos: p.passos };
}

/**
 * Sobe um XML como Smart Form (cria/substitui) e gera o FM — a outra ponta da escada.
 * `substituir: true` (default) apaga um form de mesmo nome antes, tolerando "não existe".
 */
export async function subirSmartFormXml(conexao, { driver = 'YJBV_SF_PUT', keepDriver = false, ...opts }) {
  const source = buildSmartFormXmlUploadSource(driver, opts);
  const r = await rodarDriver(conexao, driver, source, `driver: sobe XML como Smart Form ${nomeForm(opts.form)}`, keepDriver);
  const p = parseSmartFormCopyOutput(r.saida);
  if (!p.ok) {
    const falha = p.passos.find((x) => !x.ok);
    throw new Error(`forms: upload falhou em ${falha?.passo ?? 'SF_NEW_FM'}: ${falha?.erro ?? `sem FM gerado (subrc ${p.fmSubrc})`}`);
  }
  return { ...p, saida: r.saida };
}

/** Apaga um Smart Form sem diálogo. Destrutivo: exige `confirm: true`. */
export async function apagarSmartForm(conexao, { form, driver = 'YJBV_SF_DEL', keepDriver = false, confirm = false, tolerante = false } = {}) {
  if (confirm !== true) throw new Error('GUARD-RAIL: apagarSmartForm exige confirm:true (remoção de form é irreversível).');
  const source = buildSmartFormDeleteSource(driver, { form, tolerante });
  const r = await rodarDriver(conexao, driver, source, `driver: apaga Smart Form ${nomeForm(form)}`, keepDriver);
  return { ...parsePassos(r.saida), saida: r.saida };
}

// ---------------------------------------------------------------------------------------------
// A ESCADA — o XML do Smart Form como material editável (item 42)
//
// Anatomia medida do documento (`SF_EXAMPLE_01`, 108.869 caracteres):
//
//   sf:SMARTFORM
//     HEADER (FORMNAME CAPTION MASTERLANG DEVCLASS VERSION …) · INTERFACE · GTYPES · GDATA
//     GCODING · FCODING
//     VARHEADER/item (PAGEFORMAT=DINA4 CPI LPI STDSTYLE=SF_STYLE_01 PAGETREE)
//       sf:NODE NODETYPE=RP                      ← raiz da árvore de páginas
//         sf:SUCC/sf:item/sf:NODE NODETYPE=PA    ← página (sf:OBJ/sf:PAGE: NAME/INAME, NEXTPAGE)
//           … NODETYPE=WI                        ← janela (sf:OBJ/sf:WINDOW, WTYPE G=gráfica/MAIN)
//             … NODETYPE=TI                      ← TEXTO (sf:OBJ/sf:TEXT)
//             … GR gráfico · SE seção de tabela · EV evento (cabeçalho/main/rodapé) · CO código
//
// **O nó de texto é o átomo do vocabulário.** Um `TI` carrega:
//   <TEXT><item><TDFORMAT>TH</TDFORMAT><TDLINE>Ttl</TDLINE></item></TEXT>   ← o texto do idioma corrente
//   <T_TEXT><item><SPRAS>D</SPRAS><TXTYPE>F</TXTYPE><FORMNAME>…</FORMNAME>
//           <INAME>…</INAME><LINENR>000001</LINENR><TDFORMAT>TH</TDFORMAT>
//           <TDLINE>Ges</TDLINE></item>…</T_TEXT>                           ← o mesmo texto por idioma
// `TDFORMAT` é o **parágrafo do Smart Style** (`STDSTYLE`, aqui `SF_STYLE_01`) — é ele que decide
// tamanho, peso e alinhamento. É o parente do seletor CSS: `<h1>` não vira "negrito", vira um
// TDFORMAT do estilo. Um `*` em TDFORMAT significa "continua o parágrafo anterior".
//
// A poda e a troca de texto abaixo são **puras** (string → string): é nelas que a escada sobe um
// degrau por vez, e é sobre elas que o conversor da prancheta HTML vai ser escrito.

const NOME_NO = 'sf:NODE';

/** Todos os `<sf:NODE>` do XML, com tipo, nome, caption, posição e filhos. Puro. */
export function arvoreSmartForm(xml) {
  const s = String(xml);
  // ⚠️ o nó pode vir com atributo (`<sf:NODE ID="834 ">`, o container RC de dentro de uma janela):
  // uma regex que só casasse `<sf:NODE>` fecharia a pilha no `</sf:NODE>` dele e cortaria errado.
  const marcas = [...s.matchAll(/<sf:NODE(?:\s[^>]*?)?\/>|<sf:NODE(?:\s[^>]*?)?>|<\/sf:NODE>/g)];
  const raiz = [];
  const pilha = [];
  for (let i = 0; i < marcas.length; i++) {
    const m = marcas[i];
    if (m[0] === '</sf:NODE>') {
      const no = pilha.pop();
      if (no) no.fim = m.index + m[0].length;
      continue;
    }
    // o cabeçalho do nó vai até o próximo <sf:NODE> — sem esse corte, o INAME lido seria o do filho
    const limite = marcas[i + 1] ? marcas[i + 1].index : s.length;
    const cab = s.slice(m.index, limite);
    const campo = (t) => cab.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '';
    const no = {
      tipo: campo('NODETYPE'),
      iname: campo('INAME'),
      caption: campo('CAPTION'),
      obj: cab.match(/<sf:OBJ><(sf:[A-Z_]+)/)?.[1]?.slice(3) ?? null,
      inicio: m.index,
      fim: m[0].endsWith('/>') ? m.index + m[0].length : null,
      profundidade: pilha.length,
      filhos: [],
    };
    (pilha.length ? pilha[pilha.length - 1].filhos : raiz).push(no);
    if (!m[0].endsWith('/>')) pilha.push(no);
  }
  return raiz;
}

/** A árvore achatada, na ordem do documento. Puro. */
export function nosDoSmartForm(xml) {
  const saida = [];
  const desce = (ns) => ns.forEach((n) => { saida.push(n); desce(n.filhos); });
  desce(arvoreSmartForm(xml));
  return saida;
}

/**
 * PODA: fica só com os nós de `manter` (por INAME) e os ancestrais deles; o resto sai do XML —
 * inclusive o `<sf:item>` que embrulha cada nó dentro de um `<sf:SUCC>`. Nó sem INAME é estrutural
 * (a raiz `RP`) e nunca é removido. Puro.
 */
export function podarSmartForm(xml, { manter = [] } = {}) {
  const alvo = new Set(manter.map((n) => String(n).toUpperCase()));
  // 1ª passagem, de baixo para cima: quem vive. Todo filho é visitado (nada de curto-circuito) —
  // um nó mantido NÃO salva os filhos que ninguém pediu: é isso que faz a poda ser explícita.
  const vivo = new Map();
  const marca = (no) => {
    const filhoVivo = no.filhos.map(marca).some(Boolean);
    // nó sem INAME é estrutural (a raiz `RP`, o container `RC` de dentro de uma janela): vive por
    // causa do que carrega, nunca por si — senão a janela que só tem um RC vazio sobreviveria.
    const v = alvo.has(no.iname.toUpperCase()) || filhoVivo || no.profundidade === 0;
    vivo.set(no, v);
    return v;
  };
  // 2ª passagem, de cima para baixo: corta o nó morto MAIS ALTO e não desce nele (os descendentes
  // saem junto — registrá-los também faria cortar posições que já não existem).
  const fora = [];
  const colhe = (no) => (vivo.get(no) ? no.filhos.forEach(colhe) : fora.push(no));
  const raiz = arvoreSmartForm(xml);
  raiz.forEach(marca);
  raiz.forEach(colhe);
  let s = String(xml);
  // de trás para a frente: cortar por posição não invalida as posições anteriores
  for (const no of fora.sort((a, b) => b.inicio - a.inicio)) {
    let ini = no.inicio; let fim = no.fim ?? no.inicio;
    const antes = s.slice(Math.max(0, ini - 10), ini);
    if (antes.endsWith('<sf:item>') && s.slice(fim, fim + 10).startsWith('</sf:item>')) {
      ini -= '<sf:item>'.length; fim += '</sf:item>'.length;
    }
    s = s.slice(0, ini) + s.slice(fim);
  }
  return s;
}

/**
 * Troca o texto de um nó `TI`: `linhas` é `[{ formato, linha }]` (`formato` = TDFORMAT do Smart
 * Style; `*` continua o parágrafo anterior). Reescreve `<TEXT>` e o `<T_TEXT>` de todos os idiomas,
 * para o texto não depender do idioma de logon. Puro; lança se o nó não existir.
 */
export function trocarTextoSmartForm(xml, iname, linhas) {
  const s = String(xml);
  const I = String(iname).toUpperCase();
  const no = nosDoSmartForm(s).find((n) => n.iname.toUpperCase() === I && n.tipo === 'TI');
  if (!no) throw new Error(`forms: nó de texto "${iname}" não existe neste Smart Form`);
  const bloco = s.slice(no.inicio, no.fim ?? s.length);
  const itens = (linhas.length ? linhas : [{ formato: '*', linha: '' }])
    .flatMap(({ formato = '*', linha = '' }) => fatiarTdline(linha).map((p, i) => ({ formato: i ? '*' : formato, linha: escXml(p) })));
  const texto = `<TEXT>${itens.map((l) => `<item><TDFORMAT>${l.formato}</TDFORMAT><TDLINE>${l.linha}</TDLINE></item>`).join('')}</TEXT>`;
  const idiomas = [...new Set([...bloco.matchAll(/<T_TEXT>[\s\S]*?<\/T_TEXT>/g)].flatMap((m) => [...m[0].matchAll(/<SPRAS>([^<]*)<\/SPRAS>/g)].map((x) => x[1])))];
  const formName = bloco.match(/<FORMNAME>([^<]*)<\/FORMNAME>/)?.[1] ?? '';
  const tTexto = `<T_TEXT>${idiomas.map((sp) => itens.map((l, i) => `<item><SPRAS>${sp}</SPRAS><TXTYPE>F</TXTYPE><FORMNAME>${formName}</FORMNAME><INAME>${I}</INAME><LINENR>${String(i + 1).padStart(6, '0')}</LINENR><TDFORMAT>${l.formato}</TDFORMAT><TDLINE>${l.linha}</TDLINE></item>`).join('')).join('')}</T_TEXT>`;
  const novo = bloco
    .replace(/<TEXT>[\s\S]*?<\/TEXT>/, texto)
    .replace(/<T_TEXT>[\s\S]*?<\/T_TEXT>/, tTexto);
  return s.slice(0, no.inicio) + novo + s.slice(no.fim ?? s.length);
}

const escXml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Troca o valor de um campo simples do HEADER/VARHEADER (ex.: `NEXTPAGE`/`INAME`, `CAPTION`). Puro. */
export function trocarCampoSmartForm(xml, tag, valor, { ocorrencia = 1 } = {}) {
  let n = 0;
  return String(xml).replace(new RegExp(`<${tag}>[^<]*</${tag}>`, 'g'), (m) => (++n === ocorrencia ? `<${tag}>${escXml(valor)}</${tag}>` : m));
}

/**
 * Tira da `<INTERFACE>` os parâmetros que são do FORM, mantendo só os do Smart Form padrão
 * (`<STANDARD>X</STANDARD>` — control_parameters, output_options, as quatro exceções…). É o que
 * transforma um form copiado em form ESTÁTICO, que renderiza sem o chamador preparar dado nenhum.
 * Medido: sem isso, o clone podado exige `BOOKINGS` e o CALL levanta CX_SY_DYN_CALL_PARAM_MISSING.
 * Puro.
 */
export function limparInterfaceSmartForm(xml) {
  return String(xml).replace(/<INTERFACE>([\s\S]*?)<\/INTERFACE>/, (todo, dentro) => {
    const itens = [...dentro.matchAll(/<item>[\s\S]*?<\/item>|<item\/>/g)].map((m) => m[0]);
    return `<INTERFACE>${itens.filter((i) => i.includes('<STANDARD>X</STANDARD>')).join('')}</INTERFACE>`;
  });
}

/**
 * O OPOSTO do `limparInterfaceSmartForm`: acrescenta parâmetros de IMPORT à `<INTERFACE>` — é o que
 * transforma o form estático em FORMULÁRIO, com `&VAR&` no texto valendo o dado do chamador.
 *
 * Cada parâmetro é `{ nome, tipo = 'STRING', typing = 'TYPE', opcional = false, ioType = 'I' }`, e sai
 * na forma medida no `SF_EXAMPLE_01` (item 48):
 *   `<item><IOTYPE>I</IOTYPE><NAME>CUSTOMER</NAME><TYPING>TYPE</TYPING><TYPENAME>SCUSTOM</TYPENAME><BYVALUE>X</BYVALUE></item>`
 * — sem `<STANDARD>X</STANDARD>`, que é a marca do que é do Smart Form e não do form. Entram no FIM,
 * como os do molde. Puro; recusa nome repetido, nome inválido e form sem `<INTERFACE>`.
 */
export function acrescentarInterfaceSmartForm(xml, parametros = []) {
  const s = String(xml);
  if (!/<INTERFACE>[\s\S]*?<\/INTERFACE>/.test(s)) throw new Error('forms: este XML não tem <INTERFACE> — não é um Smart Form.');
  const lista = (Array.isArray(parametros) ? parametros : [parametros]).map((p) => (typeof p === 'string' ? { nome: p } : p));
  if (!lista.length) return s;
  const jaTem = new Set([...s.match(/<INTERFACE>[\s\S]*?<\/INTERFACE>/)[0].matchAll(/<NAME>([^<]*)<\/NAME>/g)].map((m) => m[1].toUpperCase()));
  const novos = lista.map(({ nome, tipo = 'STRING', typing = 'TYPE', opcional = false, ioType = 'I' }) => {
    const N = String(nome ?? '').toUpperCase().trim();
    if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(N)) throw new Error(`forms: "${nome}" não serve como parâmetro de interface (letra inicial, A-Z 0-9 _, até 30).`);
    if (jaTem.has(N)) throw new Error(`forms: o parâmetro "${N}" já existe na interface deste form.`);
    jaTem.add(N);
    return `<item><IOTYPE>${ioType}</IOTYPE><NAME>${N}</NAME><TYPING>${typing}</TYPING><TYPENAME>${escXml(tipo).toUpperCase()}</TYPENAME>${opcional ? '<OPTIONAL>X</OPTIONAL>' : ''}<BYVALUE>X</BYVALUE></item>`;
  }).join('');
  return s.replace('</INTERFACE>', `${novos}</INTERFACE>`);
}

/** Os parâmetros da `<INTERFACE>`, com a marca de quem é do Smart Form padrão. Puro. */
export function parametrosDaInterface(xml) {
  const dentro = String(xml).match(/<INTERFACE>([\s\S]*?)<\/INTERFACE>/)?.[1] ?? '';
  return [...dentro.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => ({
    nome: m[0].match(/<NAME>([^<]*)<\/NAME>/)?.[1] ?? '',
    ioType: m[0].match(/<IOTYPE>([^<]*)<\/IOTYPE>/)?.[1] ?? '',
    tipo: m[0].match(/<TYPENAME>([^<]*)<\/TYPENAME>/)?.[1] ?? '',
    opcional: m[0].includes('<OPTIONAL>X</OPTIONAL>'),
    padrao: m[0].includes('<STANDARD>X</STANDARD>'),
  }));
}

/**
 * Move/redimensiona uma janela: os quatro pares `WLEFT/WWIDTH/WTOP/WHEIGHT` + unidade vivem no
 * `sf:OUTATTR` do nó `WI` (medido: `MAIN` = 2/16/10/16 CM, e é isso que o PDF mostra). Valores em
 * centímetros, com duas casas — só os informados mudam. Puro.
 */
export function posicionarJanelaSmartForm(xml, iname, { left, top, width, height, unidade = 'CM' } = {}) {
  const s = String(xml);
  const I = String(iname).toUpperCase();
  const no = nosDoSmartForm(s).find((n) => n.iname.toUpperCase() === I && n.tipo === 'WI');
  if (!no) throw new Error(`forms: janela "${iname}" não existe neste Smart Form`);
  const cm = (v) => Number(v).toFixed(2);
  let bloco = s.slice(no.inicio, no.fim ?? s.length);
  for (const [campo, valor] of [['WLEFT', left], ['WTOP', top], ['WWIDTH', width], ['WHEIGHT', height]]) {
    if (valor === undefined || valor === null) continue;
    bloco = bloco.replace(new RegExp(`<${campo}>[^<]*</${campo}><U_${campo}>[^<]*</U_${campo}>`),
      `<${campo}>${cm(valor)}</${campo}><U_${campo}>${unidade}</U_${campo}>`);
  }
  return s.slice(0, no.inicio) + bloco + s.slice(no.fim ?? s.length);
}

/**
 * Para qual página o SAP vira quando a janela MAIN transborda: o `<NEXTPAGE>` do nó `PA`.
 *
 * ⚠️ **Sem ele o documento longo NÃO sai** (medido, item 50): o form GERA, e o runtime devolve
 * `subrc 2, "Nenhuma página seguinte definida"` — zero OTF, zero PDF. É o que acontecia com todo
 * documento podado a uma página só, porque o molde manda `FIRST → NEXT` e a poda leva a `NEXT`
 * embora. Apontar a página para SI MESMA (`FIRST → FIRST`) basta: o texto transborda quantas
 * páginas precisar, com o mesmo layout (medido: 9 páginas de um nó de texto só). Puro.
 */
export function apontarProximaPagina(xml, { pagina, proxima } = {}) {
  const s = String(xml);
  const P = String(pagina).toUpperCase(); const N = String(proxima).toUpperCase();
  const no = nosDoSmartForm(s).find((x) => x.iname.toUpperCase() === P && x.tipo === 'PA');
  if (!no) throw new Error(`forms: página "${pagina}" não existe neste Smart Form`);
  const fim = no.fim ?? s.length;
  const bloco = s.slice(no.inicio, fim);
  const novo = bloco.replace(/<NEXTPAGE><INAME>[^<]*<\/INAME><\/NEXTPAGE>/, `<NEXTPAGE><INAME>${N}</INAME></NEXTPAGE>`);
  if (novo === bloco) throw new Error(`forms: a página "${pagina}" não tem <NEXTPAGE> — não dá para dizer para onde ela transborda`);
  return s.slice(0, no.inicio) + novo + s.slice(fim);
}

/** Formatos de página conhecidos do `PAGEFORMAT`, com a medida em CM (largura × altura). */
export const FORMATOS_PAGINA = {
  DINA4: [21.0, 29.7], DINA5: [14.8, 21.0], DINA3: [29.7, 42.0],
  LETTER: [21.59, 27.94], LEGAL: [21.59, 35.56],
};

/**
 * O formato do papel (`PAGEFORMAT` do VARHEADER) e a orientação (`PAGEORTN` do nó `PA`: `P`
 * retrato, `L` paisagem). Só o informado muda. Puro.
 */
export function definirFormatoSmartForm(xml, { formato, orientacao } = {}) {
  let s = String(xml);
  if (formato) {
    const F = String(formato).toUpperCase();
    if (!FORMATOS_PAGINA[F]) throw new Error(`forms: formato de página "${formato}" desconhecido — conhecidos: ${Object.keys(FORMATOS_PAGINA).join(', ')}.`);
    if (!/<PAGEFORMAT>[^<]*<\/PAGEFORMAT>/.test(s)) throw new Error('forms: este XML não tem <PAGEFORMAT> — não é um Smart Form.');
    s = s.replace(/<PAGEFORMAT>[^<]*<\/PAGEFORMAT>/g, `<PAGEFORMAT>${F}</PAGEFORMAT>`);
  }
  if (orientacao) {
    const O = String(orientacao).toUpperCase();
    if (O !== 'P' && O !== 'L') throw new Error(`forms: orientação "${orientacao}" não existe — use "P" (retrato) ou "L" (paisagem).`);
    s = s.replace(/<PAGEORTN>[^<]*<\/PAGEORTN>/g, `<PAGEORTN>${O}</PAGEORTN>`);
  }
  return s;
}

/**
 * Duplica um nó como irmão seguinte, com outro INAME — é assim que a escada ganha "mais um
 * elemento" sem inventar XML do zero. As opções de saída internas (`%OUTATTRIB<n>`) são renomeadas
 * junto, para dois nós não disputarem o mesmo nome. Puro.
 */
export function clonarNoSmartForm(xml, { de, para } = {}) {
  const s = String(xml);
  const DE = String(de).toUpperCase(); const PARA = String(para).toUpperCase();
  if (PARA.length > 30) throw new Error(`forms: "${PARA}" tem mais de 30 caracteres`);
  const no = nosDoSmartForm(s).find((n) => n.iname.toUpperCase() === DE);
  if (!no) throw new Error(`forms: nó "${de}" não existe neste Smart Form`);
  const fim = no.fim ?? s.length;
  const sufixo = PARA.replace(/[^A-Z0-9]/g, '').slice(-6) || 'X';
  const clone = s.slice(no.inicio, fim)
    .replace(new RegExp(`<INAME>${DE}</INAME>`, 'g'), `<INAME>${PARA}</INAME>`)
    .replace(/<INAME>%OUTATTRIB(\d+)<\/INAME>/g, (_, n) => `<INAME>%OA${sufixo}${n}</INAME>`)
    .replace(/ ID="\d+\s*"/g, '');
  const embrulhado = s.slice(Math.max(0, no.inicio - 9), no.inicio).endsWith('<sf:item>')
    && s.slice(fim, fim + 10).startsWith('</sf:item>');
  const corte = embrulhado ? fim + '</sf:item>'.length : fim;
  const novo = embrulhado ? `<sf:item>${clone}</sf:item>` : clone;
  return s.slice(0, corte) + novo + s.slice(corte);
}

// ---------------------------------------------------------------------------------------------
// CONSTRUÇÃO DE NÓ — texto e TABELA nascendo do nada (item 49)
//
// Até aqui a escada só sabia PODAR e TROCAR o que já existia no molde. A tabela quebrou isso: o
// `SF_EXAMPLE_01` tem uma, mas ela é o item de fatura do IDES, presa a `BOOKINGS` e a um loop. Para
// o Markdown emitir `| a | b |` foi preciso construir o nó do zero — e a anatomia diz como.
//
// **`SECTTYPE` é quem decide o papel do nó `SE`** (medido no molde, s4h 758, 2026-09-01):
//   C  a TABELA (container)   R  a LINHA        E  a CÉLULA        L  o LOOP
// O loop mora em campos OPCIONAIS da tabela (`DATATYPE`/`TABNAME`/`TABHTYPE`/`TABHEADER`) — é por
// isso que a **tabela ESTÁTICA existe**: sem eles, a tabela imprime as linhas que estão no XML.
// Era o risco nomeado no item 49, e ele não se realizou.
//
//   SE C (tabela)  ← DYNLINES (os tipos de linha) + CELLS (largura por tipo × coluna) + OTABTYPE
//     EV H (cabeçalho) ┐
//     EV B (corpo)     ├ evento: onde a linha entra no papel
//     EV F (rodapé)    ┘
//       SE R (linha)   ← sf:OUTATTR/T_LINETYPE aponta o tipo de linha do DYNLINES
//         SE E (célula) × N  ← a coluna é a ORDEM entre as irmãs (não há campo de coluna na célula)
//           TI (texto)
//
// ⚠️ **`OTABTYPE` é obrigatório, e o que ele falta cobra em dois lugares diferentes** (bisseção):
//   • sem `<OTABTYPE>`: o form GERA (FB_GENERATE_FORM subrc 0) e o RUNTIME recusa —
//     `subrc 2, "Definição de tabela <nome> não conhecida"`. Tarde, mas com o nome do nó.
//   • sem `<OTABHEADER>`: tudo responde ok e **o cabeçalho SIMPLESMENTE NÃO SAI NO PAPEL** — o
//     evento `H` é ignorado em silêncio. Só o PDF olhado pega. (`OTABFOOTER`: idem para o `F`.)
// `PATTERN` e `T_TEXT`, ao contrário, são dispensáveis: sem eles o PDF sai igual.
//
// ⚠️ **A borda de topo da primeira linha invade o parágrafo ANTERIOR** (visto no PDF, não no
// `contemTexto`): com `CTOP USED=X` — a forma do molde — o filete cortou a última linha do texto de
// cima. Por isso o padrão daqui é `borda: 'baixo'`, que só desenha `CBOTTOM`.

const U_SEC = '<U_FHEIGHT>CM</U_FHEIGHT><U_WIDTH>CM</U_WIDTH><U_LEFT>CM</U_LEFT><U_TOP>CM</U_TOP><U_SB>CM</U_SB><U_SA>CM</U_SA>';
const U_OA = '<U_WFRAME>PT</U_WFRAME><U_WBOXV>CM</U_WBOXV><U_WBOXH>CM</U_WBOXH><U_WLEFT>CM</U_WLEFT><U_WWIDTH>CM</U_WWIDTH><U_WTOP>CM</U_WTOP><U_WHEIGHT>CM</U_WHEIGHT>';
const PRETO = '<RED>000</RED><GREEN>000</GREEN><BLUE>000</BLUE>';
const ESPESSURA = '15.00'; // TW (twips) — a espessura do filete do molde

/** Largura de janela MAIN medida no molde (item 42): 16 CM. É o teto natural de uma tabela. */
export const LARGURA_MAIN_CM = 16;

const inameValido = (n, oque) => {
  const N = String(n ?? '').toUpperCase().trim();
  if (!/^[A-Z%][A-Z0-9_%]{0,29}$/.test(N)) throw new Error(`forms: "${n}" não serve como ${oque} (letra inicial, A-Z 0-9 _, até 30).`);
  return N;
};

/** Os `<item>` de `<TEXT>` de um nó TI, já fatiados em 132 e escapados. Puro. */
const itensDeTexto = (linhas) => (linhas.length ? linhas : [{ formato: '*', linha: '' }])
  .flatMap(({ formato = '*', linha = '' }) => fatiarTdline(linha).map((p, i) => ({ formato: i ? '*' : formato, linha: escXml(p) })));

/**
 * O XML de um nó `TI` (texto) NOVO — não uma cópia. `linhas` é `[{ formato, linha }]`, o mesmo
 * contrato do `trocarTextoSmartForm`. Sai só com `<TEXT>`: o `<T_TEXT>` por idioma é dispensável
 * (medido — o texto saiu no PDF sem ele). Puro.
 */
export function xmlTextoSmartForm({ iname, linhas = [], caption } = {}) {
  const I = inameValido(iname, 'nome de nó de texto');
  const itens = itensDeTexto(linhas).map((l) => `<item><TDFORMAT>${l.formato}</TDFORMAT><TDLINE>${l.linha}</TDLINE></item>`).join('');
  return `<sf:NODE><NODETYPE>TI</NODETYPE><sf:OBJ><sf:TEXT><NAME><INAME>${I}</INAME></NAME>`
    + `<CAPTION>${escXml(caption ?? I)}</CAPTION><APPMODE>P</APPMODE><TEXT>${itens}</TEXT>`
    + `</sf:TEXT></sf:OBJ><sf:SUCC/></sf:NODE>`;
}

// ⚠️ **`SHADING`** (o campo isolado de `CELLS`/`DYNLINES`) **é inerte** — medido no item 63 (I84,
// S4H 758): valores 020 a 100 não pintaram nada no PDF. Quem pinta o fundo é `BORDERS/item`
// `INTENSITY` + `FILLCOLOR`, e pinta a célula INTEIRA mesmo com a borda só de BAIXO (não precisa da
// caixa fechada) — por isso `sombreado` (abaixo) modula a `INTENSITY` da borda, não o `SHADING`. Com
// `FILLCOLOR` preto, 100 imprime a célula toda preta e **engole o texto em silêncio** (sem aviso).
const bordaCelula = (borda, intensidade = '000') => {
  if (borda === 'nenhuma') return '';
  const caixa = borda === 'caixa';
  const usa = (lado) => `<C${lado}>${PRETO}${(caixa || lado === 'BOTTOM') ? '<USED>X</USED>' : ''}</C${lado}>`;
  return '<BORDERS><item><IDX>001</IDX>' + `<INTENSITY>${intensidade}</INTENSITY>`
    + `<LLEFT>${caixa ? ESPESSURA : '0.00'}</LLEFT><LLEFT_U>TW</LLEFT_U>`
    + `<LTOP>${caixa ? ESPESSURA : '0.00'}</LTOP><LTOP_U>TW</LTOP_U>`
    + `<LRIGHT>${caixa ? ESPESSURA : '0.00'}</LRIGHT><LRIGHT_U>TW</LRIGHT_U>`
    + `<LBOTTOM>${ESPESSURA}</LBOTTOM><LBOTTOM_U>TW</LBOTTOM_U>`
    + `<FILLCOLOR>${PRETO}</FILLCOLOR><CLEFT>${PRETO}</CLEFT>${usa('TOP')}<CRIGHT>${PRETO}</CRIGHT>${usa('BOTTOM')}`
    + '</item></BORDERS>';
};

/** `sombreado` (0–100) → o `INTENSITY` de 3 dígitos que a borda espera. Puro. */
const intensidadeStr = (n) => String(Math.max(0, Math.min(100, Math.round(Number(n) || 0)))).padStart(3, '0');

/**
 * O XML de um nó `SE` de TABELA ESTÁTICA — linhas fixas, sem loop e sem tabela interna.
 *
 * ```js
 * xmlTabelaSmartForm({
 *   iname: 'TBL1',
 *   colunas: [{ largura: 5 }, { largura: 4 }, { largura: 6 }],   // CM; ou só [5, 4, 6]
 *   cabecalho: ['Item', 'Descrição', 'Valor'],                    // opcional
 *   linhas: [['1', 'Parafuso', '10,00'], ['2', 'Porca', '2,50']],
 *   rodape: [{ conteudo: 'Total:', colspan: 2 }, '57,50'],         // opcional — EVTYPE F
 * });
 * ```
 *
 * Cada célula (em `cabecalho`, `linhas[i]` ou `rodape`) é uma string, `[{ formato, linha }]`,
 * `{ formato, linha }` — o `formato` é o parágrafo do Smart Style (o `C` do `SF_STYLE_01`
 * centraliza DENTRO da célula, medido) — **ou** `{ conteudo, colspan, sombreado }`, onde `conteudo`
 * é uma das formas acima e:
 *
 * - `colspan` (padrão 1) mescla essa célula com as `colspan - 1` colunas seguintes — medido (item
 *   63, I84): não existe campo "mesclar" na anatomia; o efeito sai de uma linha ter uma coluna a
 *   MENOS com a largura somada, e cada combinação distinta de colspans vira um `T_LINETYPE` próprio
 *   (a soma dos colspans de uma linha pode ser menor que o nº de colunas — sobra fica em branco,
 *   como já era — mas não maior).
 * - `sombreado` (0–100, padrão 0) pinta o fundo da célula (preto nessa intensidade — 100 é PRETO
 *   SÓLIDO e apaga o texto em silêncio). É a `INTENSITY` da borda, não o `SHADING` da `CELLS`
 *   (inerte, medido) — e pinta mesmo com a borda só de BAIXO (o padrão `borda: 'baixo'` continua
 *   seguro, não precisa de `'caixa'`).
 *
 * Texto mais largo que a coluna QUEBRA dentro dela e a linha inteira cresce em altura (medido).
 *
 * ⚠️ Acima de **132 caracteres** a célula ganha uma quebra a mais do que a largura pediria: o
 * `TDLINE` é CHAR 132, o `fatiarTdline` corta, e o pedaço seguinte entra com `TDFORMAT *` — que
 * **quebra a linha** em vez de emendar (medido no item 42). Visível no PDF como uma linha curta no
 * meio do parágrafo da célula.
 *
 * `rodape`: um `EVTYPE F` — imprime **uma vez, no fim real da tabela**, não a cada página (medido:
 * o cabeçalho de `cabecalho`, por `OTABHEADER='A'`, repete em toda página que a tabela ocupa; o
 * rodapé, por `OTABFOOTER='E'`, não — é o comportamento certo para uma linha de totais).
 *
 * `borda`: `'baixo'` (padrão, filete sob cada linha) · `'caixa'` · `'nenhuma'`. Puro.
 */
export function xmlTabelaSmartForm({
  iname, colunas, cabecalho = null, linhas = [], caption, borda = 'baixo',
  formatoCabecalho = 'TH', formatoCelula = 'AS', rodape = null,
} = {}) {
  const I = inameValido(iname, 'nome de tabela');
  const cols = (Array.isArray(colunas) ? colunas : []).map((c) => (typeof c === 'object' ? c : { largura: c }));
  if (!cols.length) throw new Error('forms: tabela sem coluna nenhuma — passe `colunas` com pelo menos uma largura.');
  if (cols.some((c) => !(Number(c.largura) > 0))) throw new Error('forms: cada coluna precisa de `largura` em centímetros, maior que zero.');
  const LT_CAB = 'LTCAB'; const LT_COR = 'LTCORPO';
  // o INAME dos nós internos sai do nome da tabela — curto, para caber nos 30 caracteres com sufixo
  const base = I.replace(/[^A-Z0-9]/g, '').slice(0, 18) || 'TBL';
  const n = (sufixo) => `${base}${sufixo}`;

  const celula = (conteudo, id, formatoPadrao) => {
    const linhasTxt = typeof conteudo === 'string' ? [{ formato: formatoPadrao, linha: conteudo }]
      : Array.isArray(conteudo) ? conteudo : [{ formato: formatoPadrao, ...conteudo }];
    return `<sf:NODE><NODETYPE>SE</NODETYPE><sf:OBJ><sf:SECTION><NAME><INAME>${n(id)}</INAME></NAME>`
      + `<CAPTION>${n(id)}</CAPTION><SECTTYPE>E</SECTTYPE>${U_SEC}</sf:SECTION></sf:OBJ>`
      + `<sf:OUTATTR><sf:OUTATTR><NAME><INAME>%OA${n(id)}</INAME></NAME>${U_OA}</sf:OUTATTR></sf:OUTATTR>`
      + `<sf:SUCC><sf:item>${xmlTextoSmartForm({ iname: n(`T${id}`), linhas: linhasTxt })}</sf:item></sf:SUCC></sf:NODE>`;
  };

  // string/array/{formato,linha} continuam "uma célula normal, 1 coluna, sem fundo" — só o wrapper
  // `{ conteudo, … }` pede colspan/sombreado, então uma tabela sem eles gera o MESMO XML de sempre.
  const metaCelula = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) && 'conteudo' in raw)
    ? { conteudo: raw.conteudo, colspan: Number(raw.colspan) || 1, sombreado: Number(raw.sombreado) || 0 }
    : { conteudo: raw, colspan: 1, sombreado: 0 };

  // um T_LINETYPE por combinação distinta de (larguras após mesclar × sombreados) — fora do caminho
  // padrão (LTCAB/LTCORPO), que segue byte a byte igual ao de antes do item 63.
  const tiposCustom = new Map();
  let proxCustom = 0;
  const larguraDoGrupo = (colspans) => {
    let offset = 0;
    return colspans.map((span) => {
      const grupo = cols.slice(offset, offset + span);
      offset += span;
      return grupo.reduce((a, c) => a + Number(c.largura), 0);
    });
  };
  const resolverTipo = (itens, padrao) => {
    if (!itens.some((it) => it.colspan !== 1 || it.sombreado)) return padrao;
    const larguras = larguraDoGrupo(itens.map((it) => it.colspan));
    const sombreados = itens.map((it) => intensidadeStr(it.sombreado));
    const chave = JSON.stringify({ larguras, sombreados });
    if (!tiposCustom.has(chave)) tiposCustom.set(chave, { nome: `LTX${++proxCustom}`, larguras, sombreados });
    return tiposCustom.get(chave).nome;
  };

  const linhaDe = (celulasRaw, id, formatoPadrao, padrao) => {
    const itens = celulasRaw.map(metaCelula);
    const soma = itens.reduce((a, it) => a + it.colspan, 0);
    if (soma > cols.length) throw new Error(`forms: a linha ${id} da tabela ${I} tem ${celulasRaw.length} células e a tabela tem ${cols.length} colunas — a coluna é a ORDEM da célula, então sobra não tem onde entrar.`);
    const tipoLinha = resolverTipo(itens, padrao);
    const filhos = itens.map((it, i) => `<sf:item>${celula(it.conteudo, `${id}C${i + 1}`, formatoPadrao)}</sf:item>`).join('');
    return `<sf:NODE><NODETYPE>SE</NODETYPE><sf:OBJ><sf:SECTION><NAME><INAME>${n(id)}</INAME></NAME>`
      + `<CAPTION>${n(id)}</CAPTION><SECTTYPE>R</SECTTYPE>${U_SEC}</sf:SECTION></sf:OBJ>`
      + `<sf:OUTATTR><sf:OUTATTR><NAME><INAME>%OA${n(id)}</INAME></NAME><T_LINETYPE>${tipoLinha}</T_LINETYPE>${U_OA}</sf:OUTATTR></sf:OUTATTR>`
      + `<sf:SUCC>${filhos}</sf:SUCC></sf:NODE>`;
  };
  const evento = (id, evtype, filhos) =>
    `<sf:NODE><NODETYPE>EV</NODETYPE><sf:OBJ><sf:EVENT><NAME><INAME>%${n(id)}</INAME></NAME>`
    + `<CAPTION>${n(id)}</CAPTION><EVTYPE>${evtype}</EVTYPE></sf:EVENT></sf:OBJ>`
    + `<sf:SUCC>${filhos.map((f) => `<sf:item>${f}</sf:item>`).join('')}</sf:SUCC></sf:NODE>`;

  const tipos = cabecalho ? [LT_CAB, LT_COR] : [LT_COR];
  const cellsBase = tipos.flatMap((t) => cols.map((c, i) =>
    `<item><NAME>${t}</NAME><COLUMNNR>${String(i + 1).padStart(3, '0')}</COLUMNNR>`
    + `<CWIDTH>${Number(c.largura).toFixed(2)}</CWIDTH><U_CWIDTH>CM</U_CWIDTH><SHADING>000</SHADING>${bordaCelula(borda)}</item>`)).join('');
  const dynlinesBase = tipos.map((t) => `<item><NAME>${t}</NAME>${t === LT_COR ? '<DEFAULTVAL>X</DEFAULTVAL>' : ''}<SHADING>000</SHADING></item>`).join('');

  const eventos = [];
  if (cabecalho) eventos.push(evento('EVH', 'H', [linhaDe(cabecalho, 'LH', formatoCabecalho, LT_CAB)]));
  eventos.push(evento('EVB', 'B', linhas.map((l, i) => linhaDe(l, `L${i + 1}`, formatoCelula, LT_COR))));
  if (rodape) eventos.push(evento('EVF', 'F', [linhaDe(rodape, 'LF', formatoCelula, LT_COR)]));

  // as combinações NOVAS (mesclagem/sombreado) entram DEPOIS da base — a base sai idêntica a antes.
  const cellsCustom = [...tiposCustom.values()].map(({ nome, larguras, sombreados }) => larguras.map((w, i) =>
    `<item><NAME>${nome}</NAME><COLUMNNR>${String(i + 1).padStart(3, '0')}</COLUMNNR>`
    + `<CWIDTH>${w.toFixed(2)}</CWIDTH><U_CWIDTH>CM</U_CWIDTH><SHADING>000</SHADING>${bordaCelula(borda, sombreados[i])}</item>`).join('')).join('');
  const dynlinesCustom = [...tiposCustom.values()].map(({ nome }) => `<item><NAME>${nome}</NAME><SHADING>000</SHADING></item>`).join('');

  const largura = cols.reduce((a, c) => a + Number(c.largura), 0);
  return `<sf:NODE><NODETYPE>SE</NODETYPE><sf:OBJ><sf:SECTION><NAME><INAME>${I}</INAME></NAME>`
    + `<CAPTION>${escXml(caption ?? I)}</CAPTION><SECTTYPE>C</SECTTYPE>`
    // OTABTYPE: sem ele o runtime não conhece a definição; OTABHEADER/FOOTER: sem eles o evento
    // correspondente não sai no papel, em silêncio (medido)
    + '<OTABTYPE>D</OTABTYPE><OTABHEADER>A</OTABHEADER><OTABFOOTER>E</OTABFOOTER>'
    + `<FHEIGHT>1.00</FHEIGHT><U_FHEIGHT>CM</U_FHEIGHT>${borda === 'nenhuma' ? '' : '<USEBORDER>X</USEBORDER>'}`
    + `<WIDTH>${largura.toFixed(2)}</WIDTH><U_WIDTH>CM</U_WIDTH><APPMODE>C</APPMODE>`
    + '<U_LEFT>CM</U_LEFT><U_TOP>CM</U_TOP><U_SB>CM</U_SB><U_SA>CM</U_SA>'
    + `<DYNLINES>${dynlinesBase}${dynlinesCustom}</DYNLINES><CELLS>${cellsBase}${cellsCustom}</CELLS>`
    + `</sf:SECTION></sf:OBJ><sf:SUCC>${eventos.map((e) => `<sf:item>${e}</sf:item>`).join('')}</sf:SUCC></sf:NODE>`;
}

// ---------------------------------------------------------------------------------------------
// JANELA — cabeçalho e rodapé nascendo do nada (item 50)
//
// Até o item 49 o documento inteiro morava na janela MAIN de UMA página. Cabeçalho e rodapé são
// outra coisa: janelas SECUNDÁRIAS, que o SAP repete em cada página enquanto a MAIN flui. A
// anatomia, medida no molde:
//
//   sf:NODE WI
//     sf:OBJ/sf:WINDOW ID="7719 "  ← NAME/INAME · CAPTION · WTYPE (M=main · T=secundária ·
//       sf:PROC_CTRL/sf:NODE RC       G=gráfico · L=numeração de página, a do molde)
//         sf:SUCC/sf:item/…        ← ⚠️ o CONTEÚDO da janela mora AQUI, não no sf:SUCC do WI
//     sf:OUTATTR/sf:OUTATTR        ← WLEFT/WWIDTH/WTOP/WHEIGHT + unidade: a posição na página
//     sf:SUCC/                     ← vazio na janela do molde
//
// ⚠️ **`ID`/`IDREF` são do SAP, não nossos**: a página seguinte do molde não repete a janela, ela
// a REFERENCIA (`<sf:WINDOW IDREF="786 "/>`) com um `sf:OUTATTR` próprio. Janela construída aqui
// nasce SEM `ID` — e por isso não é referenciável. Não é limitação prática: com a página apontando
// para si mesma (`apontarProximaPagina`), a mesma página se repete e leva as janelas junto —
// medido: cabeçalho e rodapé saíram nas DUAS páginas, e `&SFSY-PAGE&`/`&SFSY-FORMPAGES&` no
// `TDLINE` imprimiram "Pagina 1 de 2" e "Pagina 2 de 2" **sem parâmetro de interface nenhum**.

/**
 * O XML de um nó `WI` (janela) NOVO. `filhos` são XMLs de nó (`xmlTextoSmartForm`, …) e entram no
 * container `RC` de dentro da janela. Medidas em centímetros.
 *
 * `tipo`: `'T'` secundária (o padrão — é o que cabeçalho e rodapé são) · `'M'` principal ·
 * `'G'` gráfico · `'L'` numeração de página. Puro.
 */
export function xmlJanelaSmartForm({ iname, tipo = 'T', caption, left = 2, top = 1, width = 16, height = 1.5, filhos = [] } = {}) {
  const I = inameValido(iname, 'nome de janela');
  const T = String(tipo).toUpperCase();
  if (!'MTGL'.includes(T) || T.length !== 1) throw new Error(`forms: tipo de janela "${tipo}" não existe — M (principal), T (secundária), G (gráfico) ou L (numeração).`);
  for (const [nome, v] of [['left', left], ['top', top], ['width', width], ['height', height]]) {
    // `null` não vira 0 aqui: medida ausente é engano do chamador, e um `Number(null)` calado
    // colocaria a janela no canto da página sem ninguém notar.
    if (v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0) {
      throw new Error(`forms: a janela ${I} precisa de \`${nome}\` em centímetros (recebeu ${v}).`);
    }
  }
  const cm = (c, v) => `<${c}>${Number(v).toFixed(2)}</${c}><U_${c}>CM</U_${c}>`;
  const dentro = (Array.isArray(filhos) ? filhos : [filhos]).map((f) => `<sf:item>${f}</sf:item>`).join('');
  return `<sf:NODE><NODETYPE>WI</NODETYPE><sf:OBJ><sf:WINDOW><NAME><INAME>${I}</INAME></NAME>`
    + `<CAPTION>${escXml(caption ?? I)}</CAPTION><WTYPE>${T}</WTYPE>`
    + `<sf:PROC_CTRL><sf:NODE><NODETYPE>RC</NODETYPE><sf:SUCC>${dentro}</sf:SUCC></sf:NODE></sf:PROC_CTRL>`
    + '</sf:WINDOW></sf:OBJ>'
    + `<sf:OUTATTR><sf:OUTATTR><NAME><INAME>%OA${I.replace(/[^A-Z0-9]/g, '').slice(0, 26)}</INAME></NAME>`
    + `<CAPTION>${escXml(caption ?? I)}</CAPTION>${cm('WLEFT', left)}${cm('WWIDTH', width)}${cm('WTOP', top)}${cm('WHEIGHT', height)}`
    + '</sf:OUTATTR></sf:OUTATTR><sf:SUCC/></sf:NODE>';
}

/**
 * Insere um nó (o XML devolvido por `xmlTextoSmartForm`/`xmlTabelaSmartForm`) como irmão SEGUINTE
 * do nó `apos` — a mesma posição em que `clonarNoSmartForm` põe o clone, e o que faz o documento
 * sair na ordem em que foi escrito. Puro; lança se a âncora não existir.
 */
export function inserirNoSmartForm(xml, { apos, no } = {}) {
  const s = String(xml);
  const A = String(apos).toUpperCase();
  const ancora = nosDoSmartForm(s).find((x) => x.iname.toUpperCase() === A);
  if (!ancora) throw new Error(`forms: nó "${apos}" não existe neste Smart Form — não há onde ancorar a inserção`);
  const fim = ancora.fim ?? s.length;
  const embrulhado = s.slice(Math.max(0, ancora.inicio - 9), ancora.inicio).endsWith('<sf:item>')
    && s.slice(fim, fim + 10).startsWith('</sf:item>');
  const corte = embrulhado ? fim + '</sf:item>'.length : fim;
  return s.slice(0, corte) + (embrulhado ? `<sf:item>${no}</sf:item>` : String(no)) + s.slice(corte);
}

// ---------------------------------------------------------------------------------------------
// GRÁFICO — o nó `GR`, e a imagem entrando no sistema sem GUI (item 51)
//
// O nó estava no molde desde o começo (o logo mySAP.com do `SF_EXAMPLE_01`) e nunca tinha sido
// construído. A anatomia, medida:
//
//   sf:NODE GR
//     sf:OBJ/sf:GRAPHIC  NAME/INAME · CAPTION · GTYPE B (bitmap)
//       GKEYBDS          OBJECT=GRAPHICS · NAME=<o gráfico> · ID=BMAP · BTYPE=BCOL|BMON
//       APPMODE B · RELMODE W · ALIGNMENT L|C|R
//     sf:SUCC/           vazio — o gráfico não tem filho
//
// **O nó não tem `sf:OUTATTR`**: ele não se posiciona nem se redimensiona. Onde ele sai depende de
// onde está pendurado — dentro da MAIN flui com o texto (medido), dentro de uma janela `G` fica
// onde a janela está —, e o TAMANHO impresso vem do **DPI gravado na imagem**, não do nó: o mesmo
// BMP a 100 dpi mede 2.419 twips de largura e a 300 dpi mede 806 (medido, e visto no PDF).
//
// ⚠️ **Gráfico inexistente é erro TARDIO**: o form GERA e o runtime devolve `subrc 1, "A saída de
// gráfico não é possível"`, sem PDF — nada aponta o nome errado. Por isso `graficoInfo` existe e
// `publicarMarkdown` confere antes de criar o form.
//
// A OUTRA ponta — pôr uma imagem NOVA no sistema — é o SE78, e o SE78 é dynpro (`CALL SCREEN 4001`
// dentro de `SAPSCRIPT_IMPORT_GRAPHIC_BDS`). A receita saiu do fonte dele (`LSTXBITMAPSF05`, form
// `IMPORT_BITMAP_BDS`), com o `GUI_UPLOAD` trocado pelo base64 no fonte do driver:
//
//   ENQUEUE_ESSGRABDS → SAPSCRIPT_CONVERT_BITMAP_BDS → cl_bds_document_set->create_with_table
//   → INSERT stxbitmaps (o DOCID sai da signature) → change_properties (DESCRIPTION) → DEQUEUE
//
// ⚠️ **Só BMP e TIFF entram** (medido, uma mensagem por caso): PNG e JPG param no
// `format_not_supported` ("O formato PNG não é suportado"), conteúdo que não bate com o formato
// declarado para em `no_bmp_file`/`tifferr_invalid_format`. É limite do FM do SAP, não da lib.

/** Como o nó `GR` alinha a imagem na largura de que dispõe. */
export const ALINHAMENTOS_GRAFICO = { esquerda: 'L', centro: 'C', direita: 'R' };
/** Os formatos que o `SAPSCRIPT_CONVERT_BITMAP_BDS` aceita (medido: PNG e JPG não entram). */
export const FORMATOS_IMAGEM = ['BMP', 'TIF'];
const TWIP_CM = 2.54 / 1440;

/**
 * O XML de um nó `GR` (gráfico) NOVO, apontando para um gráfico que já está no sistema (SE78/BDS).
 *
 * ```js
 * xmlGraficoSmartForm({ iname: 'LOGO', grafico: 'ZLOGO_ACME', btype: 'BCOL', alinhamento: 'centro' });
 * ```
 * `btype`: `BCOL` (cor) ou `BMON` (preto e branco) — é parte da CHAVE do gráfico, não um efeito.
 * Puro; não confere se o gráfico existe (ver `graficoInfo` — o erro do runtime é mudo).
 */
export function xmlGraficoSmartForm({ iname, grafico, btype = 'BCOL', id = 'BMAP', objeto = 'GRAPHICS', caption, alinhamento = 'esquerda' } = {}) {
  const I = inameValido(iname, 'nome de nó de gráfico');
  const G = String(grafico ?? '').toUpperCase().trim();
  if (!G) throw new Error('forms: xmlGraficoSmartForm exige { grafico } (o nome do gráfico na SE78/BDS).');
  if (G.length > 70) throw new Error(`forms: "${G}" tem mais de 70 caracteres (STXBITMAPS-TDNAME é CHAR 70).`);
  const B = String(btype).toUpperCase();
  if (B !== 'BCOL' && B !== 'BMON') throw new Error(`forms: btype "${btype}" não existe — BCOL (cor) ou BMON (preto e branco).`);
  const A = ALINHAMENTOS_GRAFICO[String(alinhamento).toLowerCase()] ?? (['L', 'C', 'R'].includes(String(alinhamento).toUpperCase()) ? String(alinhamento).toUpperCase() : null);
  if (!A) throw new Error(`forms: alinhamento "${alinhamento}" não existe — ${Object.keys(ALINHAMENTOS_GRAFICO).join(', ')}.`);
  return `<sf:NODE><NODETYPE>GR</NODETYPE><sf:OBJ><sf:GRAPHIC><NAME><INAME>${I}</INAME></NAME>`
    + `<CAPTION>${escXml(caption ?? I)}</CAPTION><GTYPE>B</GTYPE>`
    + `<GKEYBDS><OBJECT>${escXml(String(objeto).toUpperCase())}</OBJECT><NAME>${escXml(G)}</NAME>`
    + `<ID>${escXml(String(id).toUpperCase())}</ID><BTYPE>${B}</BTYPE></GKEYBDS>`
    + `<APPMODE>B</APPMODE><RELMODE>W</RELMODE><ALIGNMENT>${A}</ALIGNMENT>`
    + '</sf:GRAPHIC></sf:OBJ><sf:SUCC/></sf:NODE>';
}

/** O formato da imagem pelos primeiros bytes — `BMP`, `TIF`, ou o que ela é para o erro dizer. Puro. */
export function formatoDaImagem(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? []);
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'BMP';
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a))) return 'TIF';
  if (b.length >= 8 && b.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'PNG';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'JPG';
  if (b.length >= 4 && b.slice(0, 4).toString('utf8') === '%PDF') return 'PDF';
  return null;
}

const nomeGrafico = (nome) => {
  const N = String(nome ?? '').toUpperCase().trim();
  if (!N) throw new Error('forms: informe { nome } (o nome do gráfico na SE78/BDS)');
  if (N.length > 70) throw new Error(`forms: "${N}" tem mais de 70 caracteres (STXBITMAPS-TDNAME é CHAR 70).`);
  if (/\s/.test(N)) throw new Error(`forms: "${N}" tem espaço — o nome do gráfico entra em Markdown como \`![alt](NOME)\`, e espaço ali é ambíguo.`);
  return N;
};

/**
 * Fonte do driver que grava uma imagem no BDS como gráfico SAPscript (a via do SE78, sem a dynpro).
 * `conteudo` é o base64 da imagem. Puro; só Z/Y (é gravação nova no sistema).
 */
export function buildGraphicUploadSource(name, { nome, conteudo, formato = 'BMP', cor = true, descricao = '', resident = false, autoheight = true, substituir = false } = {}) {
  const N = nomeGrafico(nome);
  assertZY(N);
  const F = String(formato).toUpperCase();
  if (!FORMATOS_IMAGEM.includes(F)) {
    throw new Error(`forms: formato "${formato}" não entra no BDS — o SAPSCRIPT_CONVERT_BITMAP_BDS aceita ${FORMATOS_IMAGEM.join(' e ')} (medido: PNG e JPG param em "formato não suportado"). Converta a imagem antes.`);
  }
  if (!conteudo) throw new Error('forms: subirGrafico exige { arquivo } ou { conteudo } (a imagem).');
  const btype = cor ? 'BCOL' : 'BMON';
  const partes = [];
  for (let i = 0; i < conteudo.length; i += B64_CHUNK) partes.push(conteudo.slice(i, i + B64_CHUNK));
  return `${HEAD(name)}
    TYPES: BEGIN OF ty_lin, l(64) TYPE x, END OF ty_lin.
    DATA: lt_bitmap TYPE STANDARD TABLE OF ty_lin, ls_lin TYPE ty_lin, lt_b64 TYPE TABLE OF string,
          lv_b64 TYPE string, lv_x TYPE xstring, lv_len TYPE i, lv_off TYPE i, lv_cut TYPE i, lv_msg TYPE string,
          lv_width_tw TYPE stxbitmaps-widthtw, lv_height_tw TYPE stxbitmaps-heighttw,
          lv_width_pix TYPE stxbitmaps-widthpix, lv_height_pix TYPE stxbitmaps-heightpix,
          lv_dpi TYPE stxbitmaps-resolution, lv_bds TYPE i, lv_ja TYPE c LENGTH 1,
          lo_bds TYPE REF TO cl_bds_document_set, lt_content TYPE sbdst_content,
          lt_comp TYPE sbdst_components, ls_comp TYPE LINE OF sbdst_components,
          lt_sig TYPE sbdst_signature, ls_sig TYPE LINE OF sbdst_signature,
          lt_prop TYPE sbdst_properties, ls_prop TYPE LINE OF sbdst_properties,
          lv_key TYPE sbdst_object_key, ls_bm TYPE stxbitmaps.

    SELECT SINGLE @abap_true FROM stxbitmaps INTO @lv_ja
      WHERE tdobject = 'GRAPHICS' AND tdid = 'BMAP' AND tdname = '${esc(N)}' AND tdbtype = '${btype}'.
    IF lv_ja = abap_true.
${substituir ? `      CALL FUNCTION 'SAPSCRIPT_DELETE_GRAPHIC_BDS'
        EXPORTING i_object = 'GRAPHICS' i_name = '${esc(N)}' i_id = 'BMAP' i_btype = '${btype}' dialog = space
        EXCEPTIONS OTHERS = 1.
      out->write( |GR_DEL subrc={ sy-subrc }| ).` : `      out->write( |GR_UP EXC o gráfico ${N} (${btype}) já existe — use substituir:true| ).
      RETURN.`}
    ENDIF.

    CALL FUNCTION 'ENQUEUE_ESSGRABDS' EXPORTING tdobject = 'GRAPHICS' tdname = '${esc(N)}' tdid = 'BMAP'
      tdbtype = '${btype}' EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
    IF sy-subrc <> 0. out->write( |GR_UP EXC enqueue subrc={ sy-subrc }| ). RETURN. ENDIF.

${partes.map((p) => `    APPEND '${p}' TO lt_b64.`).join('\n')}
    CONCATENATE LINES OF lt_b64 INTO lv_b64.
    lv_x = cl_web_http_utility=>decode_x_base64( lv_b64 ).
    lv_len = xstrlen( lv_x ).
    WHILE lv_off < lv_len.
      lv_cut = lv_len - lv_off.
      IF lv_cut > 64. lv_cut = 64. ENDIF.
      CLEAR ls_lin.
      ls_lin-l(lv_cut) = lv_x+lv_off(lv_cut).
      APPEND ls_lin TO lt_bitmap.
      lv_off = lv_off + lv_cut.
    ENDWHILE.
    out->write( |GR_BYTES { lv_len }| ).

    CALL FUNCTION 'SAPSCRIPT_CONVERT_BITMAP_BDS'
      EXPORTING color = '${cor ? 'X' : ' '}' format = '${F}' resident = '${resident ? 'X' : ' '}'
                bitmap_bytecount = lv_len compress_bitmap = space
      IMPORTING width_tw = lv_width_tw height_tw = lv_height_tw width_pix = lv_width_pix
                height_pix = lv_height_pix dpi = lv_dpi bds_bytecount = lv_bds
      TABLES    bitmap_file = lt_bitmap bitmap_file_bds = lt_content
      EXCEPTIONS format_not_supported = 1 no_bmp_file = 2 bmperr_invalid_format = 3
                 bmperr_no_colortable = 4 bmperr_unsup_compression = 5 bmperr_corrupt_rle_data = 6
                 tifferr_invalid_format = 8 tifferr_no_colortable = 9 tifferr_unsup_compression = 10
                 bmperr_eof = 11 OTHERS = 7.
    ${MSG}
    IF sy-subrc <> 0.
      out->write( |GR_UP EXC conversão subrc={ sy-subrc } { lv_msg }| ).
      CALL FUNCTION 'DEQUEUE_ESSGRABDS' EXPORTING tdobject = 'GRAPHICS' tdname = '${esc(N)}' tdid = 'BMAP' tdbtype = '${btype}'.
      RETURN.
    ENDIF.
    out->write( |GR_CONV pix={ lv_width_pix }x{ lv_height_pix } tw={ lv_width_tw }x{ lv_height_tw } dpi={ lv_dpi } bds={ lv_bds }| ).

    CREATE OBJECT lo_bds.
    ls_comp-doc_count = '1'. ls_comp-comp_count = '1'.
    ls_comp-mimetype = 'application/octet-stream'. ls_comp-comp_size = lv_bds.
    APPEND ls_comp TO lt_comp.
    ls_sig-doc_count = '1'. APPEND ls_sig TO lt_sig.
    CALL METHOD lo_bds->create_with_table
      EXPORTING classname = 'DEVC_STXD_BITMAP' classtype = 'OT' components = lt_comp content = lt_content
      CHANGING signature = lt_sig object_key = lv_key EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      out->write( |GR_UP EXC BDS create subrc={ sy-subrc }| ).
      CALL FUNCTION 'DEQUEUE_ESSGRABDS' EXPORTING tdobject = 'GRAPHICS' tdname = '${esc(N)}' tdid = 'BMAP' tdbtype = '${btype}'.
      RETURN.
    ENDIF.
    READ TABLE lt_sig INDEX 1 INTO ls_sig.
    out->write( |GR_BDS docid={ ls_sig-doc_id }| ).

    ls_bm-tdname = '${esc(N)}'. ls_bm-tdobject = 'GRAPHICS'. ls_bm-tdid = 'BMAP'. ls_bm-tdbtype = '${btype}'.
    ls_bm-docid = ls_sig-doc_id.
    ls_bm-widthpix = lv_width_pix. ls_bm-heightpix = lv_height_pix.
    ls_bm-widthtw = lv_width_tw. ls_bm-heighttw = lv_height_tw.
    ls_bm-resolution = lv_dpi. ls_bm-resident = '${resident ? 'X' : ' '}'.
    ls_bm-autoheight = '${autoheight ? 'X' : ' '}'. ls_bm-bmcomp = space.
    INSERT INTO stxbitmaps VALUES ls_bm.
    IF sy-subrc <> 0. UPDATE stxbitmaps FROM ls_bm. ENDIF.
    out->write( |GR_TAB subrc={ sy-subrc }| ).

    ls_prop-prop_name = 'DESCRIPTION'. ls_prop-prop_value = '${esc(descricao || N)}'.
    APPEND ls_prop TO lt_prop.
    CALL METHOD lo_bds->change_properties
      EXPORTING classname = 'DEVC_STXD_BITMAP' classtype = 'OT' object_key = lv_key
                doc_id = ls_sig-doc_id doc_ver_no = '1' doc_var_id = '1'
      CHANGING properties = lt_prop EXCEPTIONS OTHERS = 1.
    COMMIT WORK AND WAIT.
    CALL FUNCTION 'DEQUEUE_ESSGRABDS' EXPORTING tdobject = 'GRAPHICS' tdname = '${esc(N)}' tdid = 'BMAP' tdbtype = '${btype}'.
    out->write( |GR_UP ok| ).
${TAIL}`;
}

/** Fonte do driver que apaga um gráfico do BDS (`SAPSCRIPT_DELETE_GRAPHIC_BDS`, sem diálogo). Puro; só Z/Y. */
export function buildGraphicDeleteSource(name, { nome, cor = true, tolerante = false } = {}) {
  const N = nomeGrafico(nome);
  assertZY(N);
  return `${HEAD(name)}
    DATA lv_msg TYPE string.
    CALL FUNCTION 'SAPSCRIPT_DELETE_GRAPHIC_BDS'
      EXPORTING i_object = 'GRAPHICS' i_name = '${esc(N)}' i_id = 'BMAP' i_btype = '${cor ? 'BCOL' : 'BMON'}' dialog = space
      EXCEPTIONS enqueue_failed = 1 not_found = 2 canceled = 3 delete_failed = 4 OTHERS = 5.
    ${MSG}
    IF sy-subrc = 0${tolerante ? ' OR sy-subrc = 2' : ''}.
      COMMIT WORK AND WAIT.
      out->write( |GR_DEL ok| ).
    ELSE.
      out->write( |GR_DEL EXC subrc={ sy-subrc } { lv_msg }| ).
    ENDIF.
${TAIL}`;
}

/** A saída do driver de upload: passos + as medidas que a conversão devolveu. Puro. */
export function parseGraphicUploadOutput(saida) {
  const s = String(saida);
  const conv = s.match(/GR_CONV pix=(\d+)x(\d+) tw=(\d+)x(\d+) dpi=(\d+) bds=(\d+)/);
  return {
    ...parsePassos(s),
    bytes: Number(s.match(/GR_BYTES (\d+)/)?.[1] ?? 0) || null,
    docId: s.match(/GR_BDS docid=(\S+(?: \S+)?)/)?.[1]?.trim() ?? null,
    medidas: conv ? {
      larguraPix: Number(conv[1]), alturaPix: Number(conv[2]),
      larguraTw: Number(conv[3]), alturaTw: Number(conv[4]),
      larguraCm: Math.round(Number(conv[3]) * TWIP_CM * 100) / 100,
      alturaCm: Math.round(Number(conv[4]) * TWIP_CM * 100) / 100,
      dpi: Number(conv[5]), bytesBds: Number(conv[6]),
    } : null,
  };
}

/**
 * Põe uma imagem no sistema como gráfico SAPscript (o que a SE78 faz pela GUI), pronta para o nó `GR`.
 *
 * ```js
 * await subirGrafico(cx, { nome: 'ZLOGO_ACME', arquivo: 'logo.bmp', descricao: 'logo da ACME' });
 * ```
 * **Só BMP e TIFF** (limite do FM do SAP, medido). O TAMANHO impresso sai do DPI do arquivo: o mesmo
 * BMP a 100 dpi sai três vezes maior que a 300 dpi. `cor: false` grava a variante `BMON`.
 */
export async function subirGrafico(conexao, { nome, arquivo, conteudo, formato, driver = 'YJBV_GR_UP', keepDriver = false, ...opts } = {}) {
  let buf = conteudo;
  if (arquivo) buf = await (await import('node:fs/promises')).readFile(arquivo);
  if (!buf) throw new Error('forms: subirGrafico exige { arquivo } (caminho) ou { conteudo } (Buffer da imagem).');
  const bin = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const detectado = formatoDaImagem(bin);
  const F = String(formato ?? detectado ?? '').toUpperCase();
  if (!FORMATOS_IMAGEM.includes(F)) {
    throw new Error(`forms: ${arquivo ? `"${arquivo}"` : 'o conteúdo'} é ${detectado ?? 'de formato desconhecido'}, e o BDS só recebe ${FORMATOS_IMAGEM.join(' e ')} (medido: PNG e JPG param em "formato não suportado" no SAPSCRIPT_CONVERT_BITMAP_BDS). Converta antes de subir.`);
  }
  const source = buildGraphicUploadSource(driver, { nome, conteudo: bin.toString('base64'), formato: F, ...opts });
  const r = await rodarDriver(conexao, driver, source, `driver: sobe o gráfico ${nomeGrafico(nome)}`, keepDriver);
  const p = parseGraphicUploadOutput(r.saida);
  if (!p.ok) throw new Error(`forms: upload do gráfico falhou: ${p.passos.find((x) => !x.ok)?.erro ?? String(r.saida).slice(0, 300)}`);
  return { ...p, nome: nomeGrafico(nome), formato: F, saida: r.saida };
}

/** Apaga um gráfico do BDS. Destrutivo: exige `confirm: true`. */
export async function apagarGrafico(conexao, { nome, cor = true, tolerante = false, driver = 'YJBV_GR_DEL', keepDriver = false, confirm = false } = {}) {
  if (confirm !== true) throw new Error('GUARD-RAIL: apagarGrafico exige confirm:true (remoção de gráfico é irreversível).');
  const source = buildGraphicDeleteSource(driver, { nome, cor, tolerante });
  const r = await rodarDriver(conexao, driver, source, `driver: apaga o gráfico ${nomeGrafico(nome)}`, keepDriver);
  return { ...parsePassos(r.saida), saida: r.saida };
}

/**
 * O que o gráfico é no banco, em outra LUW (STXBITMAPS) — com o tamanho que ele terá no papel.
 *
 * É o antídoto do erro mudo: gráfico que não existe só reclama na hora de RENDERIZAR (`subrc 1,
 * "A saída de gráfico não é possível"`), sem dizer qual nome falhou.
 */
export async function graficoInfo(cfg, nome, { cor = null, id = 'BMAP', objeto = 'GRAPHICS' } = {}) {
  const N = nomeGrafico(nome);
  const linhas = await readTable(cfg, 'STXBITMAPS', {
    campos: ['TDNAME', 'TDOBJECT', 'TDID', 'TDBTYPE', 'DOCID', 'WIDTHPIX', 'HEIGHTPIX', 'WIDTHTW', 'HEIGHTTW', 'RESOLUTION', 'AUTOHEIGHT', 'BMCOMP'],
    where: [`TDNAME = '${N}'`, `AND TDOBJECT = '${String(objeto).toUpperCase()}'`, `AND TDID = '${String(id).toUpperCase()}'`],
    linhas: 10,
  });
  const btypeAlvo = cor === null ? null : (cor ? 'BCOL' : 'BMON');
  const usa = btypeAlvo ? linhas.filter((l) => l.TDBTYPE === btypeAlvo) : linhas;
  const l = usa[0] ?? null;
  return {
    nome: N, existe: Boolean(l), btype: l?.TDBTYPE ?? null, cor: l ? l.TDBTYPE === 'BCOL' : null,
    variantes: linhas.map((x) => x.TDBTYPE), docId: l?.DOCID ?? null,
    larguraPix: l ? Number(l.WIDTHPIX) : null, alturaPix: l ? Number(l.HEIGHTPIX) : null,
    larguraCm: l ? Math.round(Number(l.WIDTHTW) * TWIP_CM * 100) / 100 : null,
    alturaCm: l ? Math.round(Number(l.HEIGHTTW) * TWIP_CM * 100) / 100 : null,
    dpi: l ? Number(l.RESOLUTION) : null, linha: l,
  };
}

// ---------------------------------------------------------------------------------------------
// GRÁFICO POR URL HTTP — publicar no MIME Repository (item 73, I86)
//
// O href que a migração SSFO→XFA gera para um gráfico estático é
// `/sap/bc/fp/graphics/public/graphics/<object>/<id>/<btype>/<nome>.bmp` (montado por
// `CL_SSF_XSF_UTILITIES=>MIME_URL_FOR_BDS_GRAPHIC`, tudo em minúsculo). Quem ATENDE essa URL é o
// nó SICF `/sap/bc/fp`, handler `CL_HTTP_EXT_WEBDAV_SKWF` — o WebDAV do KPro, que lê o **MIME
// Repository** (`IF_MR_API`), NÃO o BDS. O gráfico do SE78 vive no BDS (`STXBITMAPS`); a URL só
// resolve depois que ele é COPIADO para o MIME — o que o report `RSXFT_MIGRATE_BDS_GRAPHICS` faz
// por `CL_SSF_MIGRATION=>MIGRATE_GRAPHIC_BDS_TO_MIME` (get_bds_graphic_as_bmp → mr_api->put).
//
// Por isso o item 65 mediu 404 em TODA variação, em s4h e SXD: o MIME estava vazio (ninguém migrou),
// e — a segunda causa — **o ICM guarda o 404 em cache por 24 h** (`sap-cache-control: +86400`), então
// cada nova sonda à MESMA URL reforçava o cache negativo e não teria como passar. Medido 2026-09-02
// (S4H 758, POC I86): com o gráfico no MIME a URL devolve 200 + o BMP, é case-INSENSITIVE (minúsculo
// e maiúsculo resolvem num nome fresco), responde até anônima (o nó `public` tem usuário de serviço),
// e some (404) depois do delete. Não depende de ADS — o item 65 já tinha descartado isso pelo SXD.

const GRAPHIC_BASE_URL = '/sap/bc/fp/graphics/public';

/**
 * A URL HTTP do gráfico — a MESMA que `MIME_URL_FOR_BDS_GRAPHIC` monta (e que o XFA migrado
 * referencia): base + object + id + btype + nome.bmp, tudo minúsculo. Puro.
 */
export function urlGraficoHttp({ nome, cor = true, id = 'BMAP', objeto = 'GRAPHICS' } = {}) {
  const N = nomeGrafico(nome);
  const btype = cor ? 'BCOL' : 'BMON';
  return `${GRAPHIC_BASE_URL}/${String(objeto)}/${String(id)}/${btype}/${N}.bmp`.toLowerCase();
}

/**
 * Fonte do driver que COPIA o gráfico do BDS para o MIME Repository (a via do
 * `MIGRATE_GRAPHIC_BDS_TO_MIME`), tornando-o servível pela URL HTTP. `apagar` inverte (delete do
 * MIME). Puro; só Z/Y. O `$TMP` como pacote e os `suppress` evitam qualquer dynpro no classrun.
 */
export function buildGraphicPublishSource(name, { nome, cor = true, id = 'BMAP', objeto = 'GRAPHICS', descricao = '', apagar = false } = {}) {
  const N = nomeGrafico(nome);
  assertZY(N);
  const btype = cor ? 'BCOL' : 'BMON';
  const url = urlGraficoHttp({ nome: N, cor, id, objeto });
  const corpo = apagar
    ? `    lo_mr->delete( EXPORTING i_url = '${url}' i_suppress_dialogs = 'X'
                   EXCEPTIONS parameter_missing = 1 error_occured = 2 cancelled = 3 permission_failure = 4 not_found = 5 OTHERS = 6 ).
    out->write( |GR_MIME_DEL subrc={ sy-subrc }| ).
    IF sy-subrc <> 0. out->write( |GR_MIME EXC delete subrc={ sy-subrc }| ). RETURN. ENDIF.
    COMMIT WORK AND WAIT.`
    : `    DATA lv_content TYPE xstring.
    cl_ssf_xsf_utilities=>get_bds_graphic_as_bmp(
      EXPORTING p_object = '${esc(String(objeto).toUpperCase())}' p_name = '${esc(N)}' p_id = '${esc(String(id).toUpperCase())}' p_btype = '${btype}'
      RECEIVING p_bmp = lv_content EXCEPTIONS OTHERS = 1 ).
    out->write( |GR_BDS subrc={ sy-subrc } len={ xstrlen( lv_content ) }| ).
    IF sy-subrc <> 0 OR xstrlen( lv_content ) = 0.
      out->write( |GR_MIME EXC grafico ausente no BDS| ). RETURN.
    ENDIF.
    lo_mr->put( EXPORTING i_url = '${url}' i_content = lv_content i_description = '${esc(descricao || N)}'
                          i_suppress_package_dialog = 'X' i_dev_package = '$TMP' i_suppress_dialogs = 'X'
                EXCEPTIONS parameter_missing = 1 error_occured = 2 cancelled = 3 permission_failure = 4
                           data_inconsistency = 5 new_loio_already_exists = 6 is_folder = 7 OTHERS = 8 ).
    out->write( |GR_MIME_PUT subrc={ sy-subrc }| ).
    IF sy-subrc <> 0. out->write( |GR_MIME EXC put subrc={ sy-subrc }| ). RETURN. ENDIF.
    COMMIT WORK AND WAIT.`;
  return `${HEAD(name)}
    DATA lo_mr TYPE REF TO if_mr_api.
    lo_mr = cl_mime_repository_api=>get_api( ).
${corpo}
    out->write( |GR_MIME ok| ).
${TAIL}`;
}

/**
 * Publica um gráfico do BDS (SE78) no MIME Repository, para que a URL HTTP que o XFA migrado
 * referencia passe a resolver.
 *
 * ```js
 * const { url } = await publicarGraficoHttp(cx, { nome: 'ZLOGO_ACME' });
 * // url === '/sap/bc/fp/graphics/public/graphics/bmap/bcol/zlogo_acme.bmp'
 * ```
 * Devolve `{ ok, url, bytes, passos }`. O gráfico tem de existir no BDS (`subirGrafico`/SE78) —
 * ausência vira erro claro. ⚠️ Uma vez servida, a URL entra em cache no ICM (`+86400`): se ela já
 * tiver sido pedida quando o MIME estava vazio, o 404 pode persistir ~24 h.
 */
export async function publicarGraficoHttp(conexao, { nome, cor = true, id = 'BMAP', objeto = 'GRAPHICS', descricao = '', driver = 'YJBV_GR_MIME', keepDriver = false } = {}) {
  const url = urlGraficoHttp({ nome, cor, id, objeto });
  const source = buildGraphicPublishSource(driver, { nome, cor, id, objeto, descricao });
  const r = await rodarDriver(conexao, driver, source, `driver: publica ${nomeGrafico(nome)} no MIME`, keepDriver);
  const p = parsePassos(r.saida);
  const bds = r.saida.match(/GR_BDS subrc=(\d+) len=(\d+)/);
  if (/GR_MIME EXC grafico ausente no BDS/.test(r.saida) || (bds && (Number(bds[1]) !== 0 || Number(bds[2]) === 0))) {
    throw new Error(`forms: publicarGraficoHttp: gráfico ${nomeGrafico(nome)} não existe no BDS (suba com subirGrafico ou pela SE78 antes).`);
  }
  return { ...p, url, bytes: bds ? Number(bds[2]) : null, saida: r.saida };
}

/** Remove o gráfico do MIME Repository (a URL volta a 404). Destrutivo: exige `confirm: true`. */
export async function despublicarGraficoHttp(conexao, { nome, cor = true, id = 'BMAP', objeto = 'GRAPHICS', driver = 'YJBV_GR_MIME_DEL', keepDriver = false, confirm = false } = {}) {
  if (confirm !== true) throw new Error('GUARD-RAIL: despublicarGraficoHttp exige confirm:true (remoção do MIME é irreversível).');
  const url = urlGraficoHttp({ nome, cor, id, objeto });
  const source = buildGraphicPublishSource(driver, { nome, cor, id, objeto, apagar: true });
  const r = await rodarDriver(conexao, driver, source, `driver: remove ${nomeGrafico(nome)} do MIME`, keepDriver);
  return { ...parsePassos(r.saida), url, saida: r.saida };
}

// ---------------------------------------------------------------------------------------------
// SMART STYLE (R3TR SSST) — o vocabulário, criado SEM GUI (item 52)
//
// Até aqui o documento era refém do estilo que o MOLDE tinha: `TDFORMAT` é o parágrafo do Smart
// Style, e o `SF_STYLE_01` só tem UM parágrafo de título, nenhum de citação ou código, e nenhum
// alinhado à direita. A cobertura marcava `SSST` como "só GUI". É esta seção que desmente isso.
//
// **A via é API pura, e sai inteira do fonte do `SAPLSTXBS`** (medido 2026-09-01, S4H 758):
//
//   TR_TADIR_INTERFACE ($TMP)  →  SSF_SAVE_STYLE  →  SSF_ACTIVATE_STYLE
//
// Três armadilhas, as três medidas e as três fechadas aqui:
//
//   1. **`SSF_CREATE_STYLE` e `SSF_CHANGE_STYLE` NÃO servem** — o corpo delas é `perform
//      style_builder`, o editor da SMARTSTYLES. Quem escreve no banco é `SSF_SAVE_STYLE`, e ele não
//      tem diálogo nenhum. `SSF_READ_STYLE` lê (header + parágrafos + caracteres + tabuladores).
//   2. **`SSF_ACTIVATE_STYLE` exige `redirect_error_msg = 'X'`.** Ele chama `SSF_CHECK_STYLE`
//      repassando o parâmetro, e o check com `redirect_error_msg = space` faz `CALL SCREEN` — em
//      classrun isso é `DYNPRO_SEND_IN_BACKGROUND`. Com `'X'` os erros voltam na tabela `error_msg`.
//   3. **A TADIR tem de existir ANTES.** O `SSF_SAVE_STYLE` chama `RS_CORR_INSERT` (macro
//      `corr_insert`) com `global_lock = 'X'`; sem entrada de diretório ele abre a dynpro do
//      `SAPLSTRD` e o driver dumpa — foi o primeiro `DYNPRO_SEND_IN_BACKGROUND` desta POC. Uma
//      `TR_TADIR_INTERFACE` em `$TMP` antes da chamada resolve, e o `devclass` do header manda.
//
// O estilo nasce INATIVO (`SSF_SAVE_STYLE` força `ACTIVE = 'I'` e soma 1 na versão); a ativação
// APAGA a versão ativa e promove a inativa, tabela a tabela (STXSHEAD/STXSPARA/STXSCHAR/STXSTAB).
//
// Anatomia (a mesma do `SF_STYLE_01`, lido campo a campo):
//   STXSADM   catálogo (nome, masterlang, versão)      STXSADMT  descrição do estilo
//   STXSHEAD  header: parágrafo default, CPI/LPI, fonte-base
//   STXSPARA  parágrafos — `TDPARGRAPH` é CHAR **2**   STXSCHAR  formatos de caractere (`TDSTRING`)
//   STXSTAB   tabuladores                             STXSOBJT  as descrições, por idioma
//   STXSVAR   variantes — a principal é `VARI = space` (`%MAIN` é só o nome de tela)
//
// `TDBOLD`/`TDITALIC`/`TDUNDERLIN` valem `'X'` (liga), `' '` (desliga) ou `'*'` (**herda** do
// header/do formato de caractere) — é o `'*'` que deixa `<B>x</>` funcionar dentro do parágrafo.

/** As unidades de medida que os campos `…U` aceitam (as do SAPscript). */
export const UNIDADES_ESTILO = ['CM', 'MM', 'PT', 'IN', 'LN', 'CH', 'TW'];

/** Os três estados de um atributo de fonte no Smart Style. `*` = herda — o default de tudo aqui. */
export const HERDA = '*';

/**
 * O Smart Style que o `markdown.mjs` usa — o vocabulário do MD→SF deixando de ser refém do molde.
 *
 * Cada linha daqui vira uma linha de STXSPARA/STXSCHAR, com os nomes de campo do SAP de propósito:
 * o que está escrito é o que se lê na tabela depois. Os códigos são CHAR 2 (limite de `TDPARGRAPH`).
 */
export const ESTILO_MARKDOWN = {
  nome: 'Y_SF_MD',
  caption: 'Estilo do Markdown (adt-client)',
  // o header é a fonte-base e o parágrafo default; tudo que os parágrafos não dizem, herdam daqui
  header: { tdfirstpar: 'AS', cpi: '10.00', lpi: '6.00', tdtabdist: '1.00', tdtabdistu: 'CM', tdfamily: 'HELVE', tdheight: '100' },
  paragrafos: [
    { tdpargraph: 'AS', caption: 'Corpo', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdpbot: '3.00', tdpbotu: 'PT', tdfamily: 'HELVE', tdheight: '100' },
    { tdpargraph: 'H1', caption: 'Titulo 1', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdptop: '8.00', tdptopu: 'PT', tdpbot: '4.00', tdpbotu: 'PT', tdfamily: 'HELVE', tdheight: '180', tdbold: 'X' },
    { tdpargraph: 'H2', caption: 'Titulo 2', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdptop: '6.00', tdptopu: 'PT', tdpbot: '3.00', tdpbotu: 'PT', tdfamily: 'HELVE', tdheight: '140', tdbold: 'X' },
    { tdpargraph: 'H3', caption: 'Titulo 3', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdptop: '5.00', tdptopu: 'PT', tdpbot: '2.00', tdpbotu: 'PT', tdfamily: 'HELVE', tdheight: '120', tdbold: 'X', tditalic: 'X' },
    // o recuo que o `TB` do SF_STYLE_01 não dava: 0,8 cm de parágrafo com a 1ª linha voltando 0,4 —
    // é o pendurado clássico, e é ele que põe o marcador na margem e o texto alinhado depois dele
    { tdpargraph: 'LI', caption: 'Item de lista', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdpbot: '2.00', tdpbotu: 'PT', tdpleft: '0.80', tdpleftu: 'CM', tdpentry: '-0.40', tdpentryu: 'CM', tdfamily: 'HELVE', tdheight: '100' },
    // `TDNUMBERIN` SOZINHO não numera nada — o número só sai com o parágrafo declarado como
    // estrutura: `TDLFIRSTPA` (o primeiro da cadeia, aqui ele mesmo) + `TDLDEPTH` (o nível).
    // Medido pelo PDF: sem os dois a lista sai sem "1." e sem "2.", sem erro nenhum.
    { tdpargraph: 'N1', caption: 'Lista numerada', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdpbot: '2.00', tdpbotu: 'PT', tdpleft: '0.80', tdpleftu: 'CM', tdnumberin: 'A', tdnumleft: '0.20', tdnumleftu: 'CM', tdlfirstpa: 'N1', tdldepth: '01', tdfamily: 'HELVE', tdheight: '100' },
    { tdpargraph: 'CO', caption: 'Codigo', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdptop: '2.00', tdptopu: 'PT', tdpbot: '2.00', tdpbotu: 'PT', tdpleft: '0.50', tdpleftu: 'CM', tdfamily: 'COURIER', tdheight: '080' },
    { tdpargraph: 'QU', caption: 'Citacao', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdptop: '3.00', tdptopu: 'PT', tdpbot: '3.00', tdpbotu: 'PT', tdpleft: '1.00', tdpleftu: 'CM', tdpright: '1.00', tdprightu: 'CM', tdfamily: 'HELVE', tdheight: '100', tditalic: 'X' },
    { tdpargraph: 'R', caption: 'Alinhado a direita', tdpjustify: 'RIGHT', tdpldist: '1.00', tdpldistu: 'LN', tdfamily: 'HELVE', tdheight: '100' },
    { tdpargraph: 'C', caption: 'Centralizado', tdpjustify: 'CENTER', tdpldist: '1.00', tdpldistu: 'LN', tdfamily: 'HELVE', tdheight: '100' },
    { tdpargraph: 'TH', caption: 'Celula de cabecalho', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdfamily: 'HELVE', tdheight: '100', tdbold: 'X' },
    { tdpargraph: 'TB', caption: 'Celula de tabela', tdpjustify: 'LEFT', tdpldist: '1.00', tdpldistu: 'LN', tdfamily: 'HELVE', tdheight: '100' },
  ],
  caracteres: [
    { tdstring: 'B', caption: 'Negrito', tdbold: 'X' },
    { tdstring: 'I', caption: 'Italico', tditalic: 'X' },
    { tdstring: 'S', caption: 'Codigo inline', tdfamily: 'COURIER', tdheight: '080' },
  ],
};

const nomeEstilo = (nome) => {
  const N = String(nome ?? '').toUpperCase().trim();
  if (!N) throw new Error('forms: informe { nome } (o Smart Style)');
  if (N.length > 30) throw new Error(`forms: "${N}" tem mais de 30 caracteres — TDSSNAME é CHAR 30.`);
  return N;
};

/**
 * Confere o estilo ANTES da rede e devolve a forma normalizada (fonte herdada onde não foi dita).
 * Puro. O que ele recusa aqui, o SAP recusaria tarde — ou pior, aceitaria calado:
 * `TDPARGRAPH` acima de 2 caracteres é truncado, e parágrafo default ausente deixa o estilo mudo.
 */
export function validarSmartStyle(estilo = {}) {
  const nome = nomeEstilo(estilo.nome);
  assertZY(nome);
  const paragrafos = estilo.paragrafos ?? [];
  const caracteres = estilo.caracteres ?? [];
  if (!paragrafos.length) throw new Error(`forms: o Smart Style ${nome} não tem parágrafo nenhum — sem STXSPARA nada tem TDFORMAT para apontar.`);
  const codigo = (v, campo, tam) => {
    const C = String(v ?? '').toUpperCase().trim();
    if (!C || C.length > tam) throw new Error(`forms: "${v}" não serve de ${campo} — o campo é CHAR ${tam} (e o SAP TRUNCA sem avisar).`);
    return C;
  };
  const fonte = (o) => ({
    tdfamily: String(o.tdfamily ?? '').toUpperCase(), tdheight: o.tdheight ?? '000',
    tdbold: o.tdbold ?? HERDA, tditalic: o.tditalic ?? HERDA, tdunderlin: o.tdunderlin ?? HERDA,
  });
  const ps = paragrafos.map((p) => ({ ...p, ...fonte(p), tdpargraph: codigo(p.tdpargraph, 'TDPARGRAPH', 2) }));
  const cs = caracteres.map((c) => ({ ...c, ...fonte(c), tdstring: codigo(c.tdstring, 'TDSTRING', 2) }));
  const dup = (lista, campo) => {
    const vistos = new Set();
    for (const x of lista) { if (vistos.has(x[campo])) throw new Error(`forms: o Smart Style ${nome} declara "${x[campo]}" duas vezes em ${campo} — a chave da tabela é essa, e a segunda linha SUBSTITUIRIA a primeira.`); vistos.add(x[campo]); }
  };
  dup(ps, 'tdpargraph'); dup(cs, 'tdstring');
  const primeiro = String(estilo.header?.tdfirstpar ?? '').toUpperCase();
  if (!ps.some((p) => p.tdpargraph === primeiro)) {
    throw new Error(`forms: o parágrafo default do header é "${primeiro}" e ele não está entre os parágrafos (${ps.map((p) => p.tdpargraph).join(', ')}) — o TDFIRSTPAR é o que o Smart Form usa quando o TDFORMAT não diz nada.`);
  }
  for (const p of [...ps, ...cs]) {
    for (const [campo, valor] of Object.entries(p)) {
      if (/u$/.test(campo) && valor && !UNIDADES_ESTILO.includes(String(valor).toUpperCase())) {
        throw new Error(`forms: "${valor}" não é unidade conhecida em ${campo} (${UNIDADES_ESTILO.join(', ')}) — e a UNIDADE é quem decide se 2 é dois milímetros ou dois centímetros.`);
      }
    }
  }
  return { ...estilo, nome, paragrafos: ps, caracteres: cs };
}

const CAMPOS_ESTILO = (wa, o, pula = []) => Object.entries(o)
  .filter(([k, v]) => v !== undefined && v !== null && !pula.includes(k))
  .map(([k, v]) => `    ${wa}-${k.toLowerCase()} = '${esc(v)}'.`).join('\n');

/**
 * Fonte do driver que CRIA/ATUALIZA um Smart Style — TADIR + `SSF_SAVE_STYLE` + `SSF_ACTIVATE_STYLE`.
 * Puro; só Z/Y. Ver o cabeçalho da seção para as três armadilhas que ele desvia.
 */
export function buildSmartStyleSource(name, { estilo, pkg = '$TMP', idioma = null } = {}) {
  const e = validarSmartStyle(estilo);
  const N = e.nome;
  const langu = idioma ? `'${esc(String(idioma).toUpperCase())}'` : 'sy-langu';
  const linha = (wa, tipo, o, extra) => `    CLEAR ${wa}.
    ${wa}-stylename = '${esc(N)}'. ${wa}-vari = space. ${wa}-langu = ${langu}.
${CAMPOS_ESTILO(wa, o, extra)}
    APPEND ${wa} TO ${tipo}.`;
  return `${HEAD(name)}
    DATA: ls_head TYPE ssfcats, ls_out TYPE ssfcats,
          lt_para TYPE STANDARD TABLE OF ssfparas, ls_p TYPE ssfparas,
          lt_char TYPE STANDARD TABLE OF ssfstrings, ls_c TYPE ssfstrings,
          lt_tab TYPE STANDARD TABLE OF stxstab,
          lt_err TYPE STANDARD TABLE OF tline, ls_err TYPE tline,
          lv_name TYPE tdssname, lv_status TYPE tdactivate, lv_msg TYPE string.

    ls_head-stylename = '${esc(N)}'. ls_head-vari = space.
    ls_head-masterlang = ${langu}. ls_head-langu = ${langu}.
    ls_head-caption = '${esc(e.caption ?? N)}'. ls_head-devclass = '${esc(pkg)}'.
${CAMPOS_ESTILO('ls_head', e.header ?? {})}
    " o SSF_SAVE_STYLE faz ADD 1 TO iadm-version sobre o que vem NO HEADER, não sobre o banco:
    " sem ler a versão corrente, toda republicação voltaria a gravar a versão 1 (medido).
    SELECT SINGLE version FROM stxsadm INTO @ls_head-version WHERE stylename = '${esc(N)}'.

${e.paragrafos.map((p) => linha('ls_p', 'lt_para', p)).join('\n')}

${e.caracteres.map((c) => linha('ls_c', 'lt_char', c)).join('\n')}

    " a TADIR TEM de existir antes: o corr_insert de dentro do SSF_SAVE_STYLE é RS_CORR_INSERT com
    " global_lock='X', e sem entrada de diretório ele abre a dynpro do SAPLSTRD (medido: dump
    " DYNPRO_SEND_IN_BACKGROUND no classrun).
    CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = ' '
      wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'SSST' wi_tadir_obj_name = '${esc(N)}'
      wi_tadir_devclass = '${esc(pkg)}' EXCEPTIONS OTHERS = 1.
    out->write( |ST_TADIR subrc={ sy-subrc }| ).

    CALL FUNCTION 'SSF_SAVE_STYLE'
      EXPORTING i_header = ls_head i_lock_style = 'X'
      IMPORTING e_header = ls_out
      TABLES    i_paragraphs = lt_para i_strings = lt_char i_tabstops = lt_tab.
    out->write( |ST_SAVE subrc={ sy-subrc } version={ ls_out-version } devclass={ ls_out-devclass } active={ ls_out-active }| ).

    " redirect_error_msg = 'X' é OBRIGATÓRIO: sem ele o SSF_CHECK_STYLE por baixo faz CALL SCREEN
    CALL FUNCTION 'SSF_ACTIVATE_STYLE'
      EXPORTING i_stylename = '${esc(N)}' i_with_dialog = space redirect_error_msg = 'X'
      IMPORTING o_stylename = lv_name o_status = lv_status
      TABLES    error_msg = lt_err
      EXCEPTIONS no_name = 1 no_style = 2 cancelled = 3 no_access_permission = 4 illegal_language = 5 OTHERS = 6.
    ${MSG}
    " o subrc TEM de ser guardado agora: o LOOP abaixo o sobrescreve com 4 quando a tabela está
    " vazia — e "vazia" é exatamente o caso bom (medido: activate ok virava EXC subrc=4)
    DATA(lv_rc) = sy-subrc.
    LOOP AT lt_err INTO ls_err. out->write( |ST_ERR { ls_err-tdline }| ). ENDLOOP.
    IF lv_rc = 0 AND lv_status = 'A'.
      COMMIT WORK AND WAIT.
      out->write( |ST_ACT ok status={ lv_status } paras=${e.paragrafos.length} chars=${e.caracteres.length}| ).
    ELSE.
      out->write( |ST_ACT EXC subrc={ lv_rc } status={ lv_status } { lv_msg }| ).
    ENDIF.
${TAIL}`;
}

/** Fonte do driver que APAGA um Smart Style sem diálogo (`SSF_DELETE_STYLE`). Puro; só Z/Y. */
export function buildSmartStyleDeleteSource(name, { nome, tolerante = false } = {}) {
  const N = nomeEstilo(nome); assertZY(N);
  return `${HEAD(name)}
    DATA: lv_name TYPE tdssname, lv_msg TYPE string.
    CALL FUNCTION 'SSF_DELETE_STYLE'
      EXPORTING i_stylename = '${esc(N)}' i_with_dialog = space i_with_confirm_dialog = space
      IMPORTING o_stylename = lv_name
      EXCEPTIONS no_name = 1 no_style = 2 style_locked = 3 cancelled = 4
                 no_access_permission = 5 illegal_language = 6 OTHERS = 7.
    ${MSG}
    IF sy-subrc = 0${tolerante ? ' OR sy-subrc = 2' : ''}.
      COMMIT WORK AND WAIT.
      out->write( |ST_DEL ok| ).
    ELSE.
      out->write( |ST_DEL EXC subrc={ sy-subrc } { lv_msg }| ).
    ENDIF.
${TAIL}`;
}

/** A saída dos drivers de Smart Style: passos + o que o SAP devolveu do save/activate. Puro. */
export function parseSmartStyleOutput(saida) {
  const s = String(saida);
  const save = s.match(/ST_SAVE subrc=(\d+) version=(\S+) devclass=(\S*) active=(\S*)/);
  const act = s.match(/ST_ACT ok status=(\S+) paras=(\d+) chars=(\d+)/);
  return {
    ...parsePassos(s),
    ok: Boolean(act) && save?.[1] === '0',
    tadirSubrc: Number(s.match(/ST_TADIR subrc=(\d+)/)?.[1] ?? -1),
    versao: save?.[2] ?? null, devclass: save?.[3] ?? null,
    salvoComo: save?.[4] ?? null, status: act?.[1] ?? null,
    paragrafos: act ? Number(act[2]) : null, caracteres: act ? Number(act[3]) : null,
    erros: [...s.matchAll(/^ST_ERR (.*)$/gm)].map((m) => m[1].trim()).filter(Boolean),
  };
}

/** As duplas (família, tamanho) que o estilo pede — do header, dos parágrafos e dos caracteres. Puro. */
const fontesDoEstilo = (estilo) => {
  const e = validarSmartStyle(estilo);
  const pares = new Map();
  for (const o of [e.header ?? {}, ...e.paragrafos, ...e.caracteres]) {
    const fam = String(o.tdfamily ?? '').toUpperCase();
    const alt = String(o.tdheight ?? '').padStart(3, '0');
    if (fam && alt !== '000') pares.set(`${fam} ${alt}`, [fam, alt]);
  }
  return [...pares.values()];
};

/** Confere as fontes do estilo contra a TFO02 do sistema. Lança com o que existe de verdade. */
async function conferirFontesDoEstilo(cfg, estilo) {
  const porFamilia = new Map();
  for (const [fam, alt] of fontesDoEstilo(estilo)) {
    if (!porFamilia.has(fam)) porFamilia.set(fam, await tamanhosDeFonte(cfg, fam));
    const tem = porFamilia.get(fam);
    if (!tem.length) throw new Error(`forms: a família de fonte "${fam}" não está na TFO02 deste sistema — o Smart Style imprimiria com outra fonte, sem avisar.`);
    if (!tem.includes(alt)) {
      throw new Error(`forms: ${fam} não tem o tamanho ${alt} neste sistema (TFO02 tem ${tem.join(', ')}) — o SAP NÃO recusa: imprime no tamanho que achar (medido: COURIER 090 saiu 8,5 pt no papel). Escolha um da lista.`);
    }
  }
}

/**
 * Os tamanhos que uma família de fonte REALMENTE tem no sistema (`TFO02`), em décimos de ponto.
 *
 * É o antídoto de um silêncio medido: `TDHEIGHT` fora da tabela **não** dá erro — o SAP imprime no
 * tamanho que encontra. `COURIER 090` (9 pt) saiu no papel como **8,5 pt**, e nada avisou.
 */
export async function tamanhosDeFonte(cfg, familia) {
  const linhas = await readTable(cfg, 'TFO02', { campos: ['TDFONTSIZE'], where: [`TDFAMILY = '${esc(String(familia).toUpperCase())}'`], linhas: 500 });
  return [...new Set(linhas.map((l) => l.TDFONTSIZE))].sort();
}

/**
 * Cria (ou regrava) um Smart Style e o ATIVA — sem GUI, sem SMARTSTYLES.
 *
 * ```js
 * await publicarSmartStyle(cx, { estilo: ESTILO_MARKDOWN });   // { ok, paragrafos: 12, versao }
 * ```
 * Chamar de novo com o mesmo nome regrava e soma uma versão — é UPDATE, não erro.
 *
 * Antes de gravar, confere cada (família, tamanho) contra a `TFO02` do sistema: tamanho que ela não
 * tem sai no papel em OUTRO tamanho, sem uma palavra (medido: `COURIER 090` → 8,5 pt).
 */
export async function publicarSmartStyle(conexao, { estilo = ESTILO_MARKDOWN, driver = 'YJBV_ST_PUT', keepDriver = false, conferirFontes = true, ...opts } = {}) {
  const source = buildSmartStyleSource(driver, { estilo, ...opts });
  if (conferirFontes) await conferirFontesDoEstilo(conexao.cfg, estilo);
  const r = await rodarDriver(conexao, driver, source, `driver: publica o Smart Style ${validarSmartStyle(estilo).nome}`, keepDriver);
  const p = parseSmartStyleOutput(r.saida);
  if (!p.ok) {
    throw new Error(`forms: o Smart Style ${validarSmartStyle(estilo).nome} não ativou: ${p.erros.join(' · ') || p.passos.find((x) => !x.ok)?.erro || String(r.saida).slice(0, 300)}`);
  }
  return { ...p, nome: validarSmartStyle(estilo).nome, saida: r.saida };
}

/** Apaga um Smart Style. Destrutivo: exige `confirm: true`. */
export async function apagarSmartStyle(conexao, { nome, tolerante = false, driver = 'YJBV_ST_DEL', keepDriver = false, confirm = false } = {}) {
  if (confirm !== true) throw new Error('GUARD-RAIL: apagarSmartStyle exige confirm:true (remoção de estilo é irreversível, e todo form que o aponta perde o vocabulário).');
  const source = buildSmartStyleDeleteSource(driver, { nome, tolerante });
  const r = await rodarDriver(conexao, driver, source, `driver: apaga o Smart Style ${nomeEstilo(nome)}`, keepDriver);
  return { ...parsePassos(r.saida), saida: r.saida };
}

/**
 * O que o Smart Style é no banco, em outra LUW — a versão ATIVA, que é a única que imprime.
 *
 * É o antídoto do erro mudo do degrau 5: form apontando para estilo inexistente **gera e imprime**,
 * só que com o parágrafo default do device — o papel sai errado sem uma mensagem sequer.
 */
export async function smartStyleInfo(cfg, nome, { ativo = true } = {}) {
  const N = nomeEstilo(nome);
  const A = ativo ? 'A' : 'I';
  const [adm, head, paras, chars] = await Promise.all([
    readTable(cfg, 'STXSADM', { campos: ['STYLENAME', 'MASTERLANG', 'VERSION', 'LASTUSER', 'LASTDATE'], where: [`STYLENAME = '${N}'`], linhas: 5 }),
    readTable(cfg, 'STXSHEAD', { campos: ['ACTIVE', 'TDFIRSTPAR', 'CPI', 'LPI', 'TDFAMILY', 'TDHEIGHT'], where: [`STYLENAME = '${N}' AND ACTIVE = '${A}'`], linhas: 5 }),
    readTable(cfg, 'STXSPARA', { campos: ['TDPARGRAPH', 'TDPJUSTIFY', 'TDPLEFT', 'TDPLEFTU', 'TDPENTRY', 'TDPENTRYU', 'TDFAMILY', 'TDHEIGHT', 'TDBOLD', 'TDITALIC'], where: [`STYLENAME = '${N}' AND ACTIVE = '${A}'`], linhas: 200 }),
    readTable(cfg, 'STXSCHAR', { campos: ['TDSTRING', 'TDFAMILY', 'TDHEIGHT', 'TDBOLD', 'TDITALIC'], where: [`STYLENAME = '${N}' AND ACTIVE = '${A}'`], linhas: 200 }),
  ]);
  return {
    nome: N, existe: Boolean(adm[0]), ativo: Boolean(head[0]),
    versao: adm[0]?.VERSION ?? null, masterlang: adm[0]?.MASTERLANG ?? null,
    primeiroParagrafo: head[0]?.TDFIRSTPAR ?? null, header: head[0] ?? null,
    paragrafos: paras.map((p) => p.TDPARGRAPH), caracteres: chars.map((c) => c.TDSTRING),
    linhasParagrafos: paras, linhasCaracteres: chars,
  };
}

/**
 * Aponta o Smart Form para outro Smart Style (`<STDSTYLE>` do VARHEADER). Puro.
 * Troca TODAS as ocorrências: um nó que sobrescreva o estilo do documento sairia com o vocabulário
 * do molde, e é justamente isso que o degrau 5 vem desfazer.
 */
export function definirEstiloSmartForm(xml, nome) {
  const N = nomeEstilo(nome);
  let n = 0;
  const novo = String(xml).replace(/<STDSTYLE>[^<]*<\/STDSTYLE>/g, () => { n++; return `<STDSTYLE>${escXml(N)}</STDSTYLE>`; });
  if (!n) throw new Error(`forms: o XML não tem <STDSTYLE> — sem ele não há onde apontar o Smart Style ${N} (confira se o molde veio inteiro do \`baixarSmartFormXml\`).`);
  return novo;
}

/**
 * Quebra um texto em pedaços de no máximo 132 caracteres (o tamanho de `TDLINE`), cortando em
 * espaço quando dá. **Medido**: uma linha de 170 caracteres num `<TDLINE>` é gravada TRUNCADA e o
 * PDF sai com a frase pela metade, sem erro nenhum — quem escreve tem de fatiar. Os pedaços
 * seguintes entram com `TDFORMAT *` (continuação do parágrafo). Puro.
 */
export function fatiarTdline(texto, largura = TDLINE_MAX) {
  const t = String(texto ?? '');
  if (t.length <= largura) return [t];
  const partes = [];
  let resto = t;
  while (resto.length > largura) {
    const corte = resto.lastIndexOf(' ', largura);
    const em = corte > largura / 2 ? corte : largura;
    partes.push(resto.slice(0, em));
    resto = resto.slice(em).replace(/^ /, '');
  }
  if (resto) partes.push(resto);
  return partes;
}

// ---------------------------------------------------------------------------------------------
// MIGRAÇÃO Smart Form → Adobe Form (XFA), SEM GUI (item 55 — a implementação da I75)
//
// A PERGUNTA já estava respondida antes desta função existir: o item 53 mediu que
// `cl_ssf_migration=>migrate( )` roda em driver classrun (o diálogo está nos FMs
// `FB_MIGRATE_FORM_FP_DEF`/`_FP_CUST`, não na classe), e o item 54 leu o XFA resultante construto a
// construto (`docs/receita-forms.md § Pedra de Roseta`). O que esta seção acrescenta é a OPERAÇÃO:
// três chamadas viram uma linha de JS, com os silêncios medidos virando guard-rail e aviso.
//
//   await migrarSmartFormParaAdobe(cx, { smartForm: 'Y_SF_DOC', form: 'Y_FP_DOC', interfaceNome: 'Y_FP_DOC_IF' });
//   // { ok, xdp, bytes, anatomia: { subform, draw, field, image, divs, temTexto }, avisos, passos }
//
// ⚠️ **O DEFAULT DA SAP ENTREGA DOCUMENTO ERRADO, SEM ERRO** — é o achado do item 54, e é por isso
// que esta função NÃO usa o default puro. `set_default_migrating_options( )` devolve (medido
// 2026-09-01 por RTTI sobre `SSFMEXPROPERTIES`, 22 campos, todos CHAR 1):
//   X  → INTERFACE CONTEXT LAYOUT TEMPLATE TEXT TEXT_PLACEHOLDER WINDOW ADDRESS GRAPHIC FOLDER
//        COMMAND_PAGEBREAK
//   '' → CONDITION_DATA CONDITION_LAYOUT ALTERNATIVE_ALL ALTERNATIVE_TRUE TABLE TEXT_APPEND
//        TEXT_BINDING OUTPUT_OPTION HEADER_FOOTER COMMAND_REST CODING
// Com esse default a migração diz `ok` e mesmo assim: a TABELA é ACHATADA (mesmos `<draw>`, todos
// `w="16cm"`, zero borda, zero cabeçalho repetido), o CAMPO perde o dado (`&VAR&` vira o texto
// `{VAR}` e, da 2ª ocorrência em diante, um `<span xfa:embed>` sem `<field>` que o defina) e o
// cabeçalho/rodapé não viajam. Por isso `OPCOES_MIGRACAO_PADRAO` liga `table`, `text_binding` e
// `header_footer` — desligá-los é escolha explícita, e sai avisada.
//
// ⚠️ **CAUSA RAIZ da I79 (item 62, medido 2026-09-01): com `table:true` a borda da CÉLULA some do
// XFA (zero `<edge>`) mesmo que a `STXSDINF` do Smart Form tenha o `<BORDERS>` certo — a migração
// ACHATA A FORMATAÇÃO da célula sem `OUTPUT_OPTION='X'`. Medido em 6 configurações (dois estilos,
// `bordaTabela` baixo/caixa, remigração do mesmo Smart Form, documento maior com cabeçalho/rodapé,
// réplica exata do corpus do item 54): zero `<edge>` em TODAS, até religar `output_option`
// — aí a mesma tabela sai com `<edge>` de novo (12 células × 4 = 48, reprodução exata do item 54).
// A pista veio do `driver.abap` que o item 54 salvou em disco: era o único dos três que ligava
// `OUTPUT_OPTION`, e os outros dois (`TAB.D0`/`TAB.DE.X`, sem essa opção) já tinham medido zero
// `<edge>` na hora — só não virou aviso porque ninguém cruzou os três na sessão. Por isso
// `OPCOES_MIGRACAO_PADRAO` liga `output_option` também.
//
// Outros pontos que a função carrega, todos medidos (itens 53/54):
//   • **TADIR ANTES, para SFPI e SFPF** — sem ela o `RS_CORR_INSERT` por baixo abre a dynpro do
//     `SAPLSTRD` e o driver morre com `DYNPRO_SEND_IN_BACKGROUND`;
//   • **o idioma é o da SESSÃO, e o que falta sai VAZIO, calado** — o nó que a lib CONSTRÓI é
//     monolíngue (I77): migrar fora do idioma em que o texto foi gravado devolve a forma inteira
//     (subform, tabela, bordas) sem palavra nenhuma. A função lê o XDP de volta e AVISA quando ele
//     veio sem texto — a contra-prova é de tamanho, não de erro;
//   • **o form nasce INATIVO e, no s4h, não ativa**: `form_activate` exige ADS
//     (`CX_FP_API_INTERNAL`). Ler o XDP não exige nem ADS nem ativação — a `FPLAYOUTT` está gravada
//     logo depois do `migrate`. Por isso esta função para no objeto gerado, e o render fica com a
//     fila 43;
//   • **o XDP mora na `FPLAYOUTT`, por idioma** (a `FPLAYOUT` guarda só metadados).

/** Os 22 campos de `SSFMEXPROPERTIES` (medido por RTTI, s4h 758). Nome desconhecido é recusado antes da rede. */
export const OPCOES_MIGRACAO = [
  'interface', 'context', 'layout', 'condition_data', 'condition_layout', 'alternative_all',
  'alternative_true', 'table', 'template', 'text', 'text_append', 'text_binding',
  'text_placeholder', 'window', 'address', 'graphic', 'folder', 'output_option', 'header_footer',
  'command_pagebreak', 'command_rest', 'coding',
];

/** O que a lib liga ALÉM do default da SAP — sem isto a tabela achata (e perde a borda), o campo perde o dado, calado. */
export const OPCOES_MIGRACAO_PADRAO = { table: true, text_binding: true, header_footer: true, output_option: true };

/**
 * Normaliza `{ table: true, coding: false }` em `{ TABLE: 'X', CODING: '' }` — as SOBREPOSIÇÕES ao
 * default da SAP, que o driver aplica depois do `set_default_migrating_options( )`. O que ninguém
 * cita fica com o default do sistema (assim um campo novo em outro release não vira invenção nossa).
 * Puro.
 *
 * O motivo do guard-rail: um `ASSIGN COMPONENT` num campo que não existe na estrutura **falha em
 * silêncio** — `CONDITION_TEXT` e `ALTERNATIVE_TEXT`, por exemplo, parecem existir e não existem.
 */
export function validarOpcoesMigracao(opcoes = {}) {
  const fora = Object.keys(opcoes).filter((k) => !OPCOES_MIGRACAO.includes(String(k).toLowerCase()));
  if (fora.length) {
    throw new Error(`forms: opção de migração desconhecida: ${fora.join(', ')} — a estrutura SSFMEXPROPERTIES tem ${OPCOES_MIGRACAO.join(', ')}. Nome fora dessa lista não é erro no SAP: é ignorado calado.`);
  }
  const todas = { ...OPCOES_MIGRACAO_PADRAO, ...opcoes };
  const out = {};
  for (const [k, v] of Object.entries(todas)) {
    if (typeof v !== 'boolean') throw new Error(`forms: a opção de migração ${k} tem de ser true/false (veio ${JSON.stringify(v)}).`);
    out[String(k).toUpperCase()] = v ? 'X' : '';
  }
  return out;
}

/**
 * Fonte do driver que MIGRA um Smart Form para Adobe Form (SFPF + SFPI) e devolve o XDP em base64.
 * Puro. `substituir` apaga um par de mesmo nome antes (tolerante a "não existe").
 */
export function buildMigracaoAdobeSource(name, {
  smartForm, form, interfaceNome, pkg = '$TMP', corrNr = '', opcoes = {}, idioma = '', substituir = false,
} = {}) {
  const S = nomeForm(smartForm);
  const F = nomeForm(form); assertZY(F);
  const I = nomeForm(interfaceNome); assertZY(I);
  if (F === I) throw new Error(`forms: o form e a interface não podem ter o mesmo nome (${F}) — são dois objetos, SFPF e SFPI.`);
  const opt = validarOpcoesMigracao(opcoes);
  const L = String(idioma ?? '').toUpperCase();
  if (L.length > 1) throw new Error(`forms: { idioma } é a letra SAP de um caractere (P, D, E…) — veio "${idioma}".`);
  const ordem = corrNr ? ` wi_order = '${esc(corrNr)}'` : '';
  const tadir = (obj, nome) => `    CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = ' '
      wi_tadir_pgmid = 'R3TR' wi_tadir_object = '${obj}' wi_tadir_obj_name = '${esc(nome)}'
      wi_tadir_devclass = '${esc(pkg)}'${ordem} EXCEPTIONS OTHERS = 1.
    out->write( |MIG_TADIR_${obj} subrc={ sy-subrc }| ).`;
  // o FORM sai antes da INTERFACE — ele a referencia; e as duas exclusões toleram "não existia"
  const limpar = `    TRY.
        cl_fp_wb_form=>delete( i_name = '${esc(F)}' i_dark = 'X' ).
      CATCH cx_root INTO DATA(lx_df).
    ENDTRY.
    TRY.
        cl_fp_wb_interface=>delete( i_name = '${esc(I)}' ).
      CATCH cx_root INTO DATA(lx_di).
    ENDTRY.
    out->write( |MIG_LIMPO ok| ).
    COMMIT WORK AND WAIT.`;
  return `${HEAD(name)}
    DATA: ls_opt TYPE ssfmexproperties, lv_ml TYPE stxfadm-masterlang, lv_xdp TYPE xstring,
          lv_lang TYPE sy-langu, lv_x TYPE xstring, lv_b64 TYPE string, lv_off TYPE i, lv_cut TYPE i.
    lv_lang = ${L ? `'${L}'` : 'sy-langu'}.
    SELECT SINGLE masterlang FROM stxfadm WHERE formname = '${esc(S)}' INTO @lv_ml.
    IF sy-subrc <> 0.
      out->write( |MIG_SF EXC o Smart Form ${esc(S)} nao esta na STXFADM| ).
      RETURN.
    ENDIF.
    out->write( |MIG_SF masterlang={ lv_ml } sessao={ sy-langu } leitura={ lv_lang }| ).
${substituir ? `${limpar}\n` : ''}${tadir('SFPI', I)}
${tadir('SFPF', F)}
    ls_opt = cl_ssf_migration=>set_default_migrating_options( ).
${Object.entries(opt).map(([o, v]) => `    ls_opt-${o.toLowerCase()} = '${v}'.`).join('\n')}
    TRY.
        DATA(lo_wb) = cl_ssf_migration=>migrate( sf_name = '${esc(S)}' fp_form_name = '${esc(F)}'
                                                 fp_interface_name = '${esc(I)}' options = ls_opt ).
        out->write( |MIGRATE ok| ).
      CATCH cx_root INTO DATA(lx_mig).
        out->write( |MIGRATE EXC { cl_abap_classdescr=>get_class_name( lx_mig ) }: { lx_mig->get_text( ) }| ).
        RETURN.
    ENDTRY.
    COMMIT WORK AND WAIT.
    SELECT SINGLE layout FROM fplayoutt
      WHERE name = '${esc(F)}' AND state = 'I' AND language = @lv_lang INTO @lv_xdp.
    out->write( |MIG_XFA subrc={ sy-subrc } len={ xstrlen( lv_xdp ) } lang={ lv_lang }| ).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
${BLOCO_B64('XFA_B64', 'lv_xdp')}
${TAIL}`;
}

/** O que o XDP TEM, contado no material — a contra-prova do item 54 é de estrutura e tamanho, não de erro. Puro. */
export function anatomiaXfa(xdp) {
  const s = String(xdp ?? '');
  const conta = (re) => (s.match(re) ?? []).length;
  const divs = conta(/<div\b/g);
  const vazios = conta(/<div\s*\/>/g) + conta(/<div[^>]*>\s*<\/div>/g);
  return {
    bytes: Buffer.byteLength(s, 'utf8'),
    subform: conta(/<subform\b/g), draw: conta(/<draw\b/g), field: conta(/<field\b/g),
    image: conta(/<image\b/g), pageArea: conta(/<pageArea\b/g), edge: conta(/<edge\b/g),
    table: conta(/layout="table"/g), embed: conta(/xfa:embed=/g),
    divs, divsVazios: vazios,
    temTexto: divs > vazios,
    gerador: s.match(/generator="([^"]+)"/)?.[1] ?? null,
  };
}

/** A saída do driver de migração: passos + o idioma lido + o tamanho do XDP. Puro. */
export function parseMigracaoOutput(saida) {
  const s = String(saida);
  const p = parsePassos(s);
  const sf = s.match(/MIG_SF masterlang=(\S*) sessao=(\S*) leitura=(\S*)/);
  const xfa = s.match(/MIG_XFA subrc=(\d+) len=(\d+) lang=(\S*)/);
  return {
    ...p,
    ok: p.ok && xfa?.[1] === '0' && Number(xfa?.[2] ?? 0) > 0,
    masterlang: sf?.[1] ?? null, sessao: sf?.[2] ?? null, idioma: sf?.[3] ?? xfa?.[3] ?? null,
    len: xfa ? Number(xfa[2]) : null, xfaSubrc: xfa ? Number(xfa[1]) : null,
    tadir: Object.fromEntries([...s.matchAll(/MIG_TADIR_(SFP[IF]) subrc=(\d+)/g)].map((m) => [m[1], Number(m[2])])),
  };
}

/**
 * Migra um Smart Form para Adobe Form (SFPF + SFPI) — **sem GUI** — e devolve o XDP gerado.
 *
 * ```js
 * const r = await migrarSmartFormParaAdobe(cx, {
 *   smartForm: 'Y_SF_DOC', form: 'Y_FP_DOC', interfaceNome: 'Y_FP_DOC_IF', salvarEm: 'doc.xdp',
 * });
 * // r.anatomia → { subform: 26, draw: 14, field: 3, table: 4, temTexto: true, … }
 * ```
 *
 * O par nasce INATIVO — ativar exige ADS, e é por isso que este caminho para no objeto gerado. Os
 * `avisos` são os silêncios medidos: XDP sem texto (idioma) e opção desligada que muda o documento.
 */
export async function migrarSmartFormParaAdobe(conexao, {
  driver = 'YJBV_FP_MIG', keepDriver = false, salvarEm, ...opts
} = {}) {
  const source = buildMigracaoAdobeSource(driver, opts);
  const S = nomeForm(opts.smartForm); const F = nomeForm(opts.form); const I = nomeForm(opts.interfaceNome);
  const r = await rodarDriver(conexao, driver, source, `driver: migra ${S} para Adobe Form ${F}`, keepDriver);
  const p = parseMigracaoOutput(r.saida);
  if (!p.ok) {
    const falha = p.passos.find((x) => !x.ok);
    const dica = p.xfaSubrc === 4
      ? `\n→ o migrate passou e a FPLAYOUTT não tem linha no idioma ${p.idioma}: o XDP é gravado POR IDIOMA (a FPLAYOUT guarda só metadados). Migre na sessão do idioma em que o texto do form existe, ou leia com { idioma }.`
      : '';
    throw new Error(`forms: migração falhou em ${falha?.passo ?? 'MIG_XFA'}: ${falha?.erro ?? `sem XDP (subrc ${p.xfaSubrc}, len ${p.len})`}${dica}`);
  }
  const b64 = juntarBase64(r.saida, 'XFA_B64');
  const xdp = Buffer.from(b64, 'base64').toString('utf8');
  const anatomia = anatomiaXfa(xdp);
  const avisos = [];
  if (!anatomia.temTexto) {
    avisos.push(`o XDP veio SEM TEXTO (${anatomia.divs} <div>, ${anatomia.divsVazios} vazios): o nó que a lib constrói é MONOLÍNGUE e a migração usa o idioma da sessão (${p.sessao}). Migre na sessão do idioma em que o texto foi gravado — a forma vem inteira de qualquer jeito, e o SAP não reclama.`);
  }
  const desligou = { table: 'a tabela sai ACHATADA (sem borda, sem cabeçalho repetido, tudo em coluna única)', text_binding: 'o campo `&VAR&` vira o TEXTO `{VAR}` e perde o dado', header_footer: 'cabeçalho e rodapé não viajam', output_option: 'a borda da CÉLULA some do XFA (zero `<edge>`), mesmo com `table:true` e o `<BORDERS>` certo no Smart Form (I79)' };
  for (const [o, efeito] of Object.entries(desligou)) {
    if (opts.opcoes?.[o] === false) avisos.push(`opção ${o} DESLIGADA: ${efeito} — e a migração devolve \`ok\` do mesmo jeito.`);
  }
  if (salvarEm) await writeFile(salvarEm, xdp, 'utf8');
  return { ...p, smartForm: S, form: F, interfaceNome: I, state: 'I', xdp, anatomia, avisos, arquivo: salvarEm ?? null, saida: r.saida };
}
