// tran.mjs — transação (R3TR TRAN, a SE93) criada SEM GUI: RPY_TRANSACTION_INSERT num driver classrun.
//
// Medido 2026-08-29, S4H 758 (docs/receita-tran.md):
//   • ADT não cria: `aps/iam/tran` (a via do sapcli) é 404 no 758 e o `/vit/wb/object_type/trant` só lê.
//   • `RPY_TRANSACTION_INSERT` (SAPLSEUK, NÃO é RFC → driver classrun) grava TSTC + TSTCT + TSTCC (+ TSTCP
//     para parâmetro/variante) e a TADIR TRAN no `development_class` via RS_CORR_INSERT — em $TMP sem popup.
//     Tipos (`ststc_c_type_*`): D dialog (program+dynpro), R report (program; dynpro fixa 1000), P parâmetro
//     (called_transaction + param_values → TSTCP `/*SM30 VIEWNAME=..;UPDATE=X;`), V variante. Não há tipo OO.
//   • Não há "update": transação existente devolve ALREADY_EXIST (subrc 2, "já foi criado"). Alterar é
//     RPY_TRANSACTION_DELETE + INSERT — é o que `replace: true` faz, no mesmo driver.
//   • Prova de uso: `CALL TRANSACTION` da transação de parâmetro pulou a tela inicial e caiu no diálogo da
//     view chamada (S 00 344 "no batch input data for screen SAPL0ORG 0040" — a tela da V_T001).
//   • RFC_READ_TABLE trunca TSTC-CINFO (RAW 1) para um caractere ('8' = x'80' report, '0' = dialog/parâmetro);
//     o valor inteiro vem do RPY_TRANSACTION_READ, que o driver imprime.

import { assertZY, deleteObject } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { readTable } from './rfc-soap.mjs';

const esc = (v) => String(v).replace(/'/g, "''");

/** Tipo da transação → constante do type pool STSTC (valor medido: D/R/P/V). */
export const TIPOS_TRANSACAO = { dialog: 'D', report: 'R', parameter: 'P', variant: 'V' };

/** Confere a combinação de campos que cada tipo exige (regras da própria FM). Puro; lança com a razão. */
export function validarTransacao({ tcode, type = 'report', program, dynpro, called, variant, params = [] }) {
  assertZY(tcode);
  if (String(tcode).length > 20) throw new Error(`transação "${tcode}": nome tem no máximo 20 caracteres (TSTC-TCODE)`);
  const T = TIPOS_TRANSACAO[type];
  if (!T) throw new Error(`transação "${tcode}": type "${type}" desconhecido — use ${Object.keys(TIPOS_TRANSACAO).join('|')}`);
  if (type === 'report' && !program) throw new Error(`transação "${tcode}" (report) exige { program }`);
  if (type === 'dialog' && !(program && dynpro)) throw new Error(`transação "${tcode}" (dialog) exige { program, dynpro }`);
  if (type === 'parameter' && !called) throw new Error(`transação "${tcode}" (parameter) exige { called } (a transação chamada, ex. SM30) e { params } [{ field, value }]`);
  if (type === 'variant' && !(called && variant)) throw new Error(`transação "${tcode}" (variant) exige { called, variant }`);
  for (const p of params) if (!p?.field) throw new Error(`transação "${tcode}": params[] são { field, value }`);
  return T;
}

const HEAD = (name) => `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA: lt_p TYPE TABLE OF rsparam, ls_p TYPE rsparam, lv_msg TYPE string,
          lt_tc TYPE TABLE OF tstc, lt_cc TYPE TABLE OF tstcc.`;
const TAIL = `  ENDMETHOD.
ENDCLASS.`;
const MSG = `IF sy-subrc <> 0. MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg. ENDIF.`;

const deleteAbap = (tcode) => `    CLEAR lv_msg.
    CALL FUNCTION 'RPY_TRANSACTION_DELETE' EXPORTING transaction = '${tcode}'
      EXCEPTIONS not_excecuted = 1 object_not_found = 2 OTHERS = 3.
    ${MSG}
    out->write( |TRAN_DELETE ${tcode} subrc={ sy-subrc } { lv_msg }| ).
    COMMIT WORK AND WAIT.`;

/**
 * Fonte do driver classrun que cria a transação (RPY_TRANSACTION_INSERT) e a lê de volta
 * (RPY_TRANSACTION_READ). Puro. Com `replace`, apaga antes (RPY_TRANSACTION_DELETE) — a FM não altera.
 * `params` é [{ field, value }] (RSPARAM) para o tipo parameter; `skip` pula a tela inicial da chamada.
 */
export function buildTransactionDriverSource(name, { tcode, text = '', type = 'report', program = '', dynpro = '', called = '', skip = true, params = [], variant = '', pkg = '$TMP', transport = '', language = '', gui = {}, replace = false }) {
  const T = validarTransacao({ tcode, type, program, dynpro, called, variant, params });
  const C = String(tcode).toUpperCase();
  const { html = true, win = true, java = false } = gui;
  const pv = params.map((p) => `ls_p-field = '${esc(String(p.field).toUpperCase())}'. ls_p-value = '${esc(p.value ?? '')}'. APPEND ls_p TO lt_p.`).join(' ');
  const lang = language ? `language = '${esc(String(language).toUpperCase())}'` : '';
  return `${HEAD(name)}
${replace ? deleteAbap(C) : ''}
    CLEAR: lt_p, lv_msg. ${pv}
    CALL FUNCTION 'RPY_TRANSACTION_INSERT'
      EXPORTING transaction = '${C}' shorttext = '${esc(text).slice(0, 36)}' transaction_type = '${T}'
                program = '${esc(String(program).toUpperCase())}' dynpro = '${esc(dynpro)}' variant = '${esc(variant)}'
                development_class = '${esc(pkg)}' transport_number = '${esc(transport)}' ${lang}
                called_transaction = '${esc(String(called).toUpperCase())}' called_transaction_skip = '${skip ? 'X' : ''}'
                html_enabled = '${html ? 'X' : ''}' wingui_enabled = '${win ? 'X' : ''}' java_enabled = '${java ? 'X' : ''}'
      TABLES param_values = lt_p
      EXCEPTIONS cancelled = 1 already_exist = 2 permission_error = 3 name_not_allowed = 4 name_conflict = 5
                 illegal_type = 6 object_inconsistent = 7 db_access_error = 8 OTHERS = 9.
    ${MSG}
    out->write( |TRAN_INSERT ${C} subrc={ sy-subrc } { lv_msg }| ).
    COMMIT WORK AND WAIT.
    CLEAR: lt_tc, lt_cc, lv_msg.
    CALL FUNCTION 'RPY_TRANSACTION_READ' EXPORTING transaction = '${C}' TABLES tcodes = lt_tc gui_attributes = lt_cc
      EXCEPTIONS permission_error = 1 not_found = 2 object_not_found = 3 cancelled = 4 OTHERS = 5.
    ${MSG}
    LOOP AT lt_tc INTO DATA(ls_tc).
      out->write( |TRAN_READ pgmna={ ls_tc-pgmna } dypno={ ls_tc-dypno } cinfo={ ls_tc-cinfo }| ).
    ENDLOOP.
    LOOP AT lt_cc INTO DATA(ls_cc).
      out->write( |TRAN_GUI webgui={ ls_cc-s_webgui } win32={ ls_cc-s_win32 } platin={ ls_cc-s_platin }| ).
    ENDLOOP.
    out->write( |TRAN_READ ${C} subrc={ sy-subrc } { lv_msg }| ).
${TAIL}`;
}

/** Fonte do driver que apaga uma ou mais transações (RPY_TRANSACTION_DELETE). Puro. */
export function buildTransactionDeleteSource(name, tcodes) {
  const lista = [].concat(tcodes).map((t) => String(t).toUpperCase());
  lista.forEach(assertZY);
  return `${HEAD(name)}
${lista.map(deleteAbap).join('\n')}
${TAIL}`;
}

/** Interpreta a saída do driver. Puro. subrc 2 = já existia (não é falha da FM, e a lib trata como `existed`). */
export function parseTransactionOutput(saida) {
  const s = String(saida);
  const ins = s.match(/TRAN_INSERT (\S+) subrc=(\d+)[ \t]*([^\n]*)/);
  const del = [...s.matchAll(/TRAN_DELETE (\S+) subrc=(\d+)[ \t]*([^\n]*)/g)].map((m) => ({ tcode: m[1], subrc: Number(m[2]), msg: m[3].trim() }));
  const rd = s.match(/TRAN_READ pgmna=(\S*) dypno=(\S*) cinfo=(\S*)/);
  const gui = s.match(/TRAN_GUI webgui=(\S*) win32=(\S*) platin=(\S*)/);
  const rdRc = s.match(/TRAN_READ \S+ subrc=(\d+)[ \t]*([^\n]*)/);
  const subrc = ins ? Number(ins[2]) : null;
  return {
    ok: !!ins && (subrc === 0 || subrc === 2) && !!rd && rdRc?.[1] === '0',
    subrc, existed: subrc === 2, msg: ins ? ins[3].trim() : null,
    tstc: rd ? { pgmna: rd[1], dypno: rd[2], cinfo: rd[3] } : null,
    gui: gui ? { webgui: gui[1], win32: gui[2], platin: gui[3] } : null,
    deletes: del,
  };
}

/** Lê o que a transação é no banco, em outra LUW (readTable). */
export async function readTransaction(cfg, tcode) {
  const C = String(tcode).toUpperCase();
  const [tstc, tstct, tstcp, tadir] = await Promise.all([
    readTable(cfg, 'TSTC', { where: [`TCODE = '${C}'`] }),
    readTable(cfg, 'TSTCT', { where: [`TCODE = '${C}'`] }),
    readTable(cfg, 'TSTCP', { where: [`TCODE = '${C}'`] }),
    readTable(cfg, 'TADIR', { campos: ['OBJECT', 'OBJ_NAME', 'DEVCLASS', 'AUTHOR', 'MASTERLANG'], where: [`PGMID = 'R3TR' AND OBJECT = 'TRAN'`, `AND OBJ_NAME = '${C}'`] }),
  ]);
  return { exists: tstc.length === 1, tstc: tstc[0] ?? null, tstct, tstcp: tstcp[0] ?? null, tadir: tadir[0] ?? null };
}

/**
 * Cria a transação pelo driver e prova por readTable (TSTC/TSTCT/TSTCP/TADIR) em outra LUW.
 * Devolve { ok, created, existed, subrc, msg, tstc, gui, banco, saida }. O driver fica em `pkg`
 * (`keepDriver: false` apaga ao final). Exige senha no cfg (classrun em sessão nova).
 */
export async function deployTransaction(conexao, { tcode, driver = `Y_TRAN_${String(tcode).toUpperCase().slice(0, 23)}`, keepDriver = false, ...opts }) {
  const C = String(tcode).toUpperCase(); const pkg = opts.pkg ?? '$TMP';
  const source = buildTransactionDriverSource(driver, { tcode: C, ...opts, pkg });
  const r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: transação ${C}`, source });
  const p = r.ok ? parseTransactionOutput(r.saida) : { ok: false, subrc: null, existed: false, msg: r.erro, tstc: null, gui: null, deletes: [] };
  const banco = await readTransaction(conexao.cfg, C).catch(() => ({ exists: false }));
  if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  const programOk = !opts.program || banco.tstc?.PGMNA === String(opts.program).toUpperCase();
  const pkgOk = !banco.tadir || banco.tadir.DEVCLASS === pkg;
  return { ...p, ok: p.ok && banco.exists && programOk && pkgOk, created: p.subrc === 0, banco, saida: r.saida };
}

/** Apaga a transação (RPY_TRANSACTION_DELETE) e confirma por readTable. Devolve { ok, deleted, banco, saida }. */
export async function deleteTransaction(conexao, { tcode, pkg = '$TMP', driver = `Y_TRAND_${String(tcode).toUpperCase().slice(0, 22)}`, keepDriver = false }) {
  const C = String(tcode).toUpperCase();
  const r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: apaga transação ${C}`, source: buildTransactionDeleteSource(driver, C) });
  const del = r.ok ? parseTransactionOutput(r.saida).deletes[0] : null;
  const banco = await readTransaction(conexao.cfg, C).catch(() => ({ exists: true }));
  if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  return { ok: !banco.exists, deleted: del?.subrc === 0, subrc: del?.subrc ?? null, msg: del?.msg ?? r.erro, banco, saida: r.saida };
}
