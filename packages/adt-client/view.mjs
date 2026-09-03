// view.mjs — VIEW clássica do dicionário (R3TR VIEW, a SE11) criada SEM GUI.
//
// Medido 2026-09-01, S4H 758 (docs/receita-view-classica.md). O item 12 tinha fechado
// "VIEW/DV é impossível por ADT REST" — continua verdade, e a via nova NÃO é a que a fila apostava:
//
//   • `RPY_VIEW_INSERT` é `FMODE='R'` (chamável por SOAP), mas **DUMPA em qualquer canal sem GUI**:
//     ele chama `RS_CORR_INSERT` sem `suppress_dialog`/`activation_call`/`genflag`, e o caminho mudo
//     do RS_CORR_INSERT (LSEUQU04:218) exige um desses três. Sem eles vai a `TRINT_CORR_INSERT` com
//     `iv_dialog='X'` → `TRINT_TADIR_POPUP` → `DYNPRO_SEND_IN_BACKGROUND`. Medido por SOAP E por
//     classrun: os dois dumpam. A FM é da era da SE11 e não tem por onde calar o popup.
//   • A via que funciona é a **DDIF**, num driver classrun: `DDIF_VIEW_PUT` + `TR_TADIR_INTERFACE`
//     (a TADIR, que o PUT não escreve) + `DDIF_VIEW_ACTIVATE`. Nenhuma das três é RFC.
//   • **`RPY_VIEW_DELETE`, ao contrário do INSERT, roda por SOAP puro** — apaga a view e a linha da
//     TADIR sem driver e sem popup. É por isso que `deleteView` só precisa do `cfg`.
//
// Gotchas medidos (todos custaram rodada):
//   • `dd28j_tab` e `dd28v_tab` vão JUNTAS ou nenhuma: passar só uma levanta `view_inconsistent`
//     (subrc 3), e a exceção não diz qual. O join de view de banco mora na **DD28J** (LTAB/LFIELD/
//     RTAB/RFIELD, SOURCE='S'); a DD28V é a condição de seleção, e vai vazia quando não há uma.
//   • `DD25V-GLOBALFLAG` (o status de manutenção da SE11) é **descartado em silêncio** pelo PUT —
//     ver `naoGravavel` em `erros`.
//   • Depois de ALTERAR a view, `SELECT` dela na MESMA sessão do driver roda o load antigo e dumpa
//     (HTTP 500). Ler é em sessão nova — `readView`/`readTable`/`dataPreview` já são outra LUW.
//   • Campo de tabela com tipo built-in (`abap.numc(4)`) entra sem `ROLLNAME` e ativa igual.

import { assertZY, deleteObject } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { readTable, callFunction } from './rfc-soap.mjs';

const esc = (v) => String(v).replace(/'/g, "''");
const pos = (n) => String(n).padStart(4, '0');

/** VIEWCLASS medido: D = view de banco (database view), C = view de manutenção. */
export const CLASSES_VIEW = { database: 'D', maintenance: 'C' };

/**
 * Confere a forma da view antes da rede. Puro; lança com a razão.
 * `tables` é [nome…] (a primeira é a raiz, salvo `rootTable`), `fields` é [{ name, table, field, key }],
 * `joins` é [{ leftTable, leftField, rightTable, rightField, operator }].
 */
export function validarView({ name, viewClass = 'database', tables = [], fields = [], joins = [], rootTable } = {}) {
  assertZY(name);
  const C = CLASSES_VIEW[viewClass];
  if (!C) throw new Error(`view "${name}": viewClass "${viewClass}" desconhecido — use ${Object.keys(CLASSES_VIEW).join('|')}`);
  if (!tables.length) throw new Error(`view "${name}": exige ao menos uma tabela base em { tables }`);
  if (!fields.length) throw new Error(`view "${name}": exige ao menos um campo em { fields } [{ name, table, field, key }]`);
  const raiz = String(rootTable ?? tables[0]).toUpperCase();
  const conhecidas = tables.map((t) => String(t).toUpperCase());
  if (!conhecidas.includes(raiz)) throw new Error(`view "${name}": rootTable "${raiz}" não está em { tables }`);
  for (const f of fields) {
    if (!f?.name || !f?.table || !f?.field) throw new Error(`view "${name}": campos são { name, table, field, key? }`);
    if (!conhecidas.includes(String(f.table).toUpperCase())) {
      throw new Error(`view "${name}": campo "${f.name}" aponta para a tabela "${f.table}", que não está em { tables }`);
    }
  }
  // Medido: com duas ou mais tabelas e sem join a view ativa, mas o produto cartesiano não é o que
  // ninguém quer — e a DD28J é o único lugar onde a condição existe.
  if (conhecidas.length > 1 && !joins.length) {
    throw new Error(`view "${name}": ${conhecidas.length} tabelas e nenhum join — informe { joins } [{ leftTable, leftField, rightTable, rightField }]`);
  }
  for (const j of joins) {
    if (!j?.leftTable || !j?.leftField || !j?.rightTable || !j?.rightField) {
      throw new Error(`view "${name}": joins são { leftTable, leftField, rightTable, rightField, operator? }`);
    }
  }
  return { C, raiz };
}

/**
 * Fonte do driver classrun que cria/altera a view (DDIF_VIEW_PUT), garante a TADIR
 * (TR_TADIR_INTERFACE) e ativa (DDIF_VIEW_ACTIVATE). Puro.
 *
 * ⚠️ De propósito o driver NÃO lê a view: depois da ativação, a mesma sessão roda o load antigo e
 * dumpa. O assert é sempre em outra LUW (`readView`).
 */
export function buildViewDriverSource(name, opts) {
  const { name: viewName, description = '', viewClass = 'database', tables = [], fields = [], joins = [],
    rootTable, pkg = '$TMP', language = 'E', viewGrant = '', transport = '' } = opts;
  const { C, raiz } = validarView(opts);
  const V = String(viewName).toUpperCase();
  const L = String(language).toUpperCase();

  const linhas26 = tables.map((t, i) => {
    const T = String(t).toUpperCase();
    return `      ( tabname = '${T}' tabpos = '${pos(i + 1)}'${T === raiz ? ` fortabname = '${T}'` : ''} )`;
  }).join('\n');

  const linhas27 = fields.map((f, i) =>
    `      ( objpos = '${pos(i + 1)}' viewfield = '${esc(String(f.name).toUpperCase())}'`
    + ` tabname = '${esc(String(f.table).toUpperCase())}' fieldname = '${esc(String(f.field).toUpperCase())}'`
    + ` keyflag = '${f.key ? 'X' : ''}' )`).join('\n');

  const linhas28j = joins.map((j) =>
    `      ( ltab = '${esc(String(j.leftTable).toUpperCase())}' lfield = '${esc(String(j.leftField).toUpperCase())}'`
    + ` rtab = '${esc(String(j.rightTable).toUpperCase())}' rfield = '${esc(String(j.rightField).toUpperCase())}'`
    + ` operator = '${esc(String(j.operator ?? 'EQ').toUpperCase())}' )`).join('\n');

  // As duas tabelas de condição andam em par — sozinha, cada uma dá `view_inconsistent`.
  const comJoin = joins.length > 0;
  const declara28 = comJoin ? `,\n          lt_28j TYPE TABLE OF dd28j, lt_28 TYPE TABLE OF dd28v` : '';
  const monta28 = comJoin ? `    lt_28j = VALUE #( viewname = '${V}' source = 'S'\n${linhas28j} ).\n` : '';
  const passa28 = comJoin ? ' dd28j_tab = lt_28j dd28v_tab = lt_28' : '';

  return `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA: ls_25 TYPE dd25v, lt_26 TYPE TABLE OF dd26v, lt_27 TYPE TABLE OF dd27p,
          lv_rc TYPE sy-subrc, lv_msg TYPE string${declara28}.
    ls_25 = VALUE #( viewname = '${V}' ddlanguage = '${L}' aggtype = 'V' roottab = '${raiz}'
                     ddtext = '${esc(description).slice(0, 60)}' viewclass = '${C}' masterlang = '${L}'
                     viewgrant = '${esc(viewGrant)}' authclass = '00' ).
    lt_26 = VALUE #( ddlanguage = '${L}' viewname = '${V}'
${linhas26} ).
    lt_27 = VALUE #( viewname = '${V}' ddlanguage = '${L}'
${linhas27} ).
${monta28}    CALL FUNCTION 'DDIF_VIEW_PUT'
      EXPORTING name = '${V}' dd25v_wa = ls_25
      TABLES dd26v_tab = lt_26 dd27p_tab = lt_27${passa28}
      EXCEPTIONS view_not_found = 1 name_inconsistent = 2 view_inconsistent = 3 put_failure = 4
                 put_refused = 5 OTHERS = 6.
    IF sy-subrc <> 0. MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg. ENDIF.
    out->write( |VIEW_PUT ${V} subrc={ sy-subrc } { lv_msg }| ).
    COMMIT WORK AND WAIT.
    CLEAR lv_msg.
    CALL FUNCTION 'TR_TADIR_INTERFACE'
      EXPORTING wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'VIEW' wi_tadir_obj_name = '${V}'
                wi_tadir_devclass = '${esc(pkg)}' wi_tadir_korrnum = '${esc(transport)}' wi_test_modus = space
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0. MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg. ENDIF.
    out->write( |VIEW_TADIR ${V} subrc={ sy-subrc } { lv_msg }| ).
    COMMIT WORK AND WAIT.
    CLEAR lv_msg.
    CALL FUNCTION 'DDIF_VIEW_ACTIVATE' EXPORTING name = '${V}' auth_chk = space
      IMPORTING rc = lv_rc EXCEPTIONS not_found = 1 put_failure = 2 OTHERS = 3.
    IF sy-subrc <> 0 OR lv_rc <> 0. MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg. ENDIF.
    out->write( |VIEW_ACTIVATE ${V} subrc={ sy-subrc } rc={ lv_rc } { lv_msg }| ).
    COMMIT WORK AND WAIT.
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * Interpreta a saída do driver. Puro.
 * `rc` da ativação: 0 = ativa limpa, 4 = ativa COM AVISO (medido na view de manutenção), ≥8 = falhou.
 */
export function parseViewOutput(saida) {
  const s = String(saida);
  const put = s.match(/VIEW_PUT (\S+) subrc=(\d+)[ \t]*([^\n]*)/);
  const tadir = s.match(/VIEW_TADIR (\S+) subrc=(\d+)[ \t]*([^\n]*)/);
  const act = s.match(/VIEW_ACTIVATE (\S+) subrc=(\d+) rc=(-?\d+)[ \t]*([^\n]*)/);
  const rc = act ? Number(act[3]) : null;
  return {
    ok: put?.[2] === '0' && tadir?.[2] === '0' && act?.[2] === '0' && rc !== null && rc < 8,
    put: put ? { subrc: Number(put[2]), msg: put[3].trim() } : null,
    tadir: tadir ? { subrc: Number(tadir[2]), msg: tadir[3].trim() } : null,
    ativacao: act ? { subrc: Number(act[2]), rc, msg: act[4].trim() } : null,
    aviso: rc === 4,
  };
}

/** O que a view é no banco, em outra LUW (readTable). Nunca na sessão que acabou de ativá-la. */
export async function readView(cfg, name) {
  const V = String(name).toUpperCase();
  const [dd25l, dd25t, dd26s, dd27s, tadir] = await Promise.all([
    readTable(cfg, 'DD25L', { campos: ['VIEWNAME', 'AS4LOCAL', 'AGGTYPE', 'ROOTTAB', 'VIEWCLASS', 'AUTHCLASS', 'VIEWGRANT', 'GLOBALFLAG'], where: [`VIEWNAME = '${V}' AND AS4LOCAL = 'A'`] }),
    readTable(cfg, 'DD25T', { campos: ['DDLANGUAGE', 'VIEWNAME', 'DDTEXT'], where: [`VIEWNAME = '${V}' AND AS4LOCAL = 'A'`] }),
    readTable(cfg, 'DD26S', { campos: ['VIEWNAME', 'TABNAME', 'TABPOS', 'FORTABNAME'], where: [`VIEWNAME = '${V}' AND AS4LOCAL = 'A'`] }),
    readTable(cfg, 'DD27S', { campos: ['VIEWFIELD', 'TABNAME', 'FIELDNAME', 'KEYFLAG', 'OBJPOS'], where: [`VIEWNAME = '${V}' AND AS4LOCAL = 'A'`], linhas: 200 }),
    readTable(cfg, 'TADIR', { campos: ['OBJECT', 'OBJ_NAME', 'DEVCLASS', 'DELFLAG'], where: [`PGMID = 'R3TR' AND OBJECT = 'VIEW'`, `AND OBJ_NAME = '${V}'`] }),
  ]);
  return {
    exists: dd25l.length === 1,
    ativa: dd25l[0]?.AS4LOCAL === 'A',
    dd25l: dd25l[0] ?? null,
    texto: dd25t[0]?.DDTEXT ?? null,
    tabelas: dd26s,
    campos: dd27s,
    tadir: tadir[0] ?? null,
  };
}

/**
 * Cria (ou altera) a view pelo driver e prova por readTable em outra LUW.
 * Devolve { ok, aviso, put, tadir, ativacao, banco, saida }. Exige senha no cfg (classrun em sessão nova).
 */
export async function deployView(conexao, { driver, keepDriver = false, ...opts } = {}) {
  const V = String(opts.name).toUpperCase();
  const pkg = opts.pkg ?? '$TMP';
  const nomeDriver = driver ?? `Y_VIEW_${V.slice(0, 22)}`;
  const source = buildViewDriverSource(nomeDriver, { ...opts, name: V, pkg });
  const r = await deployAndRun(conexao, { name: nomeDriver, pkg, description: `driver: view ${V}`, source });
  const p = r.ok ? parseViewOutput(r.saida)
    : { ok: false, put: null, tadir: null, ativacao: null, aviso: false, erro: r.erro };
  const banco = await readView(conexao.cfg, V).catch(() => ({ exists: false }));
  if (!keepDriver) await deleteObject(conexao, { type: 'class', name: nomeDriver, confirm: true }).catch(() => {});
  return { ...p, ok: p.ok && banco.exists && banco.ativa, banco, saida: r.saida };
}

/**
 * Apaga a view — `RPY_VIEW_DELETE` por SOAP puro, sem driver e sem sessão ADT (medido: some da DD25L
 * E da TADIR). Confirma a ausência por readTable. Devolve { ok, msg, banco }.
 */
export async function deleteView(cfg, name, { transport = '' } = {}) {
  const V = String(name).toUpperCase();
  assertZY(V);
  let msg = null;
  try {
    await callFunction(cfg, 'RPY_VIEW_DELETE', { VIEW_NAME: V, TRANSPORT_NUMBER: transport });
  } catch (e) { msg = e.message; }
  const banco = await readView(cfg, V).catch(() => ({ exists: true }));
  return { ok: !banco.exists && !banco.tadir, msg, banco };
}
