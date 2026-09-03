// enho.mjs — ENHO/XHB (BAdI implementation, o "enhancement implementation" do novo BAdI) criado SEM GUI:
// pela API ABAP `cl_enh_factory` + `cl_enh_tool_badi_impl` num driver classrun (a via do abapGit), e
// lido/alterado/apagado pelo ADT (`enhancements/enhoxhb`, v4).
//
// Medido 2026-08-30, S4H 758 (docs/receita-xslt-enho.md):
//   • O POST do ADT em `enhancements/enhoxhb` NÃO cria no 758: 400 `I::000` (ExceptionResourceCreationFailure)
//     com o XML moldado byte a byte no GET de uma implementação real — e deixa uma entrada ÓRFÃ na TADIR
//     (R3TR ENHO em $TMP, sem ENHHEADER; GET 404; DELETE ADT 400 "Parâmetro LSM … configuração PCT").
//     `customizingLock` é CHAR ('X'/''): "false" dá erro de desserialização (ST_ENH_ADT_ENHO_BADI).
//   • `cl_enh_factory=>create_enhancement( enhname, enhtype = cl_abstract_enh_tool_redef=>credefinition,
//     enhtooltype = cl_enh_tool_badi_impl=>tooltype, CHANGING devclass )` → `set_spot_name`,
//     `if_enh_object_docu~set_shorttext`, `add_implementation( enh_badi_impl_data{impl_name, badi_name,
//     impl_class, active} )`, `if_enh_object~save( run_dark )`, `if_enh_object~activate( run_dark )`,
//     `~unlock` → ENHHEADER VERSION=A, TADIR ENHO, GET ADT `adtcore:version="active"` com a badiImplementation.
//   • Sobre o objeto criado pela API o ADT funciona: PUT (lock → PUT v4 → unlock → activate) trocou o
//     shortText; DELETE com lockHandle apagou (200; ENHHEADER e TADIR vazias).
//   • `enho:runtimeBehaviorShorttext` veio "Implementação não será chamada" na POC (impl em $TMP com classe de
//     método vazio) contra "Implementação será chamada" na Z da moovi — PONTO ABERTO: a lib devolve o texto
//     (`runtimeBehavior`), não interpreta.
//   • Entrada TADIR órfã (o que o POST do ADT deixa) sai por `TR_TADIR_INTERFACE wi_delete_tadir_entry` num
//     driver (subrc 0) — `removerTadirOrfa`, só Z/Y.

import { assertZY, call, deleteObject, lockPath, unlockPath, activationMessages } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { readTable } from './rfc-soap.mjs';

export const COLL = '/sap/bc/adt/enhancements/enhoxhb';
export const CT = 'application/vnd.sap.adt.enh.enhoxhb.v4+xml';
const esc = (v) => String(v).replace(/'/g, "''");
const up = (v) => String(v ?? '').toUpperCase();
const pathDe = (name) => `${COLL}/${String(name).toLowerCase()}`;
const HEAD = (name) => `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.`;
const TAIL = `  ENDMETHOD.
ENDCLASS.`;
const driverDe = (prefixo, nome) => `${prefixo}${up(nome).replace(/[^A-Z0-9_]/g, '_').slice(0, 30 - prefixo.length)}`;

/** Confere o que a API exige. Puro; lança com a razão. */
export function validarBadiImplementation({ enhancement, spot, badi, implClass, implName }) {
  assertZY(enhancement);
  if (up(enhancement).length > 30) throw new Error(`enhancement "${enhancement}": nome tem no máximo 30 caracteres (ENHNAME)`);
  if (!spot || !badi || !implClass) throw new Error(`enhancement "${enhancement}": exige { spot } (enhancement spot), { badi } (definição) e { implClass } (classe Z/Y que implementa a interface do BAdI)`);
  assertZY(implClass);
  if (implName) assertZY(implName);
}

/**
 * Fonte do driver que cria a BAdI implementation pela API (cl_enh_factory / cl_enh_tool_badi_impl), salva,
 * ativa e destrava. Puro. `implName` é o nome da implementação dentro do enhancement (default: o próprio nome).
 */
export function buildBadiImplDriverSource(name, { enhancement, spot, badi, implClass, implName, text = '', active = true, pkg = '$TMP' }) {
  validarBadiImplementation({ enhancement, spot, badi, implClass, implName });
  const E = up(enhancement), I = up(implName || enhancement);
  return `${HEAD(name)}
    DATA: lv_name TYPE enhname VALUE '${E}', lv_pkg TYPE devclass VALUE '${esc(pkg)}', li_tool TYPE REF TO if_enh_tool,
          lo_badi TYPE REF TO cl_enh_tool_badi_impl, ls_impl TYPE enh_badi_impl_data.
    TRY.
        cl_enh_factory=>create_enhancement( EXPORTING enhname = lv_name enhtype = cl_abstract_enh_tool_redef=>credefinition
                                                      enhtooltype = cl_enh_tool_badi_impl=>tooltype
                                            IMPORTING enhancement = li_tool CHANGING devclass = lv_pkg ).
        lo_badi ?= li_tool.
        lo_badi->set_spot_name( '${esc(up(spot))}' ).
        lo_badi->if_enh_object_docu~set_shorttext( '${esc(String(text).slice(0, 255))}' ).
        ls_impl-impl_name = '${I}'. ls_impl-badi_name = '${esc(up(badi))}'. ls_impl-impl_class = '${esc(up(implClass))}'. ls_impl-active = '${active ? 'X' : ''}'.
        lo_badi->add_implementation( ls_impl ).
        lo_badi->if_enh_object~save( run_dark = abap_true ).
        out->write( |ENH_SAVE ${E} ok| ).
        TRY. lo_badi->if_enh_object~activate( run_dark = abap_true ). out->write( |ENH_ACTIVATE ${E} ok| ).
          CATCH cx_root INTO DATA(lxa). out->write( |ENH_ACTIVATE ${E} exc { lxa->get_text( ) }| ). ENDTRY.
        lo_badi->if_enh_object~unlock( ).
        COMMIT WORK AND WAIT.
      CATCH cx_root INTO DATA(lx).
        out->write( |ENH_CREATE ${E} exc { lx->get_text( ) }| ).
    ENDTRY.
${TAIL}`;
}

/** Fonte do driver que apaga enhancements pela API (get_enhancement lock → delete nevertheless/run_dark → unlock). Puro. */
export function buildEnhDeleteSource(name, enhancements) {
  const lista = [].concat(enhancements).map(up);
  lista.forEach(assertZY);
  return `${HEAD(name)}
${lista.map((E) => `    TRY.
        DATA(li_${E.toLowerCase().replace(/[^a-z0-9_]/g, '_')}) = cl_enh_factory=>get_enhancement( enhancement_id = '${E}' lock = abap_true ).
        li_${E.toLowerCase().replace(/[^a-z0-9_]/g, '_')}->delete( nevertheless_delete = abap_true run_dark = abap_true ).
        li_${E.toLowerCase().replace(/[^a-z0-9_]/g, '_')}->unlock( ).
        out->write( |ENH_DELETE ${E} ok| ).
      CATCH cx_root INTO DATA(lx_${E.toLowerCase().replace(/[^a-z0-9_]/g, '_')}). out->write( |ENH_DELETE ${E} exc { lx_${E.toLowerCase().replace(/[^a-z0-9_]/g, '_')}->get_text( ) }| ).
    ENDTRY.`).join('\n')}
${TAIL}`;
}

/** Fonte do driver que remove uma entrada TADIR órfã (TR_TADIR_INTERFACE, delete). Puro; só Z/Y. */
export function buildTadirDeleteSource(name, { object, objName, pgmid = 'R3TR' }) {
  assertZY(objName);
  return `${HEAD(name)}
    CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_delete_tadir_entry = 'X' wi_test_modus = ' '
      wi_tadir_pgmid = '${esc(up(pgmid))}' wi_tadir_object = '${esc(up(object))}' wi_tadir_obj_name = '${esc(up(objName))}' EXCEPTIONS OTHERS = 1.
    out->write( |TADIR_DELETE ${up(object)} ${up(objName)} subrc={ sy-subrc }| ).
    COMMIT WORK AND WAIT.
${TAIL}`;
}

/** Interpreta a saída dos drivers. Puro. */
export function parseEnhOutput(saida) {
  const s = String(saida);
  const save = s.match(/ENH_SAVE (\S+) (ok|exc[^\n]*)/);
  const act = s.match(/ENH_ACTIVATE (\S+) (ok|exc[^\n]*)/);
  const create = s.match(/ENH_CREATE (\S+) exc ([^\n]*)/);
  const deletes = [...s.matchAll(/ENH_DELETE (\S+) (ok|exc[^\n]*)/g)].map((m) => ({ name: m[1], ok: m[2] === 'ok', msg: m[2] === 'ok' ? null : m[2].replace(/^exc\s*/, '').trim() }));
  const tadir = s.match(/TADIR_DELETE (\S+) (\S+) subrc=(\d+)/);
  return {
    saved: save?.[2] === 'ok', activated: act?.[2] === 'ok',
    exc: create?.[2]?.trim() ?? (save && save[2] !== 'ok' ? save[2].replace(/^exc\s*/, '').trim() : null) ?? (act && act[2] !== 'ok' ? act[2].replace(/^exc\s*/, '').trim() : null),
    deletes, tadirDelete: tadir ? { object: tadir[1], name: tadir[2], subrc: Number(tadir[3]) } : null,
  };
}

/** O XML v4 de `enhancements/enhoxhb/<nome>` → objeto. Puro. */
export function parseEnhancement(xml) {
  const t = String(xml ?? '');
  const a = (re) => t.match(re)?.[1] ?? null;
  const impls = [...t.matchAll(/<enho:badiImplementation\b([^>]*)>([\s\S]*?)<\/enho:badiImplementation>/g)].map(([, attrs, inner]) => {
    const at = (n) => attrs.match(new RegExp(`enho:${n}="([^"]*)"`))?.[1] ?? null;
    const ref = (el) => inner.match(new RegExp(`<enho:${el}[^>]*adtcore:name="([^"]*)"`))?.[1] ?? null;
    return { name: at('name'), shortText: at('shortText'), active: at('active') === 'true', example: at('example') === 'true', default: at('default') === 'true', customizingLock: at('customizingLock') === 'X', runtimeBehavior: at('runtimeBehaviorShorttext'), spot: ref('enhancementSpot'), badi: ref('badiDefinition'), implClass: ref('implementingClass') };
  });
  return {
    name: a(/adtcore:name="([^"]*)"/), type: a(/adtcore:type="([^"]*)"/), version: a(/adtcore:version="([^"]*)"/), description: a(/adtcore:description="([^"]*)"/),
    package: a(/<adtcore:packageRef[^>]*adtcore:name="([^"]*)"/), toolType: a(/enho:toolType="([^"]*)"/), changedAt: a(/adtcore:changedAt="([^"]*)"/),
    implementations: impls,
  };
}

/** GET v4 do enhancement pelo ADT. Devolve { exists, status, raw, ...parseEnhancement }. */
export async function readEnhancement(conexao, name) {
  const s = await conexao.sessao();
  const r = await call(s, { path: pathDe(name), accept: CT });
  if (r.status === 404) return { exists: false, status: 404, raw: r.text };
  if (r.status >= 400) throw new Error(`readEnhancement ${name} falhou (${r.status}): ${r.text.slice(0, 200)}`);
  return { exists: true, status: r.status, raw: r.text, ...parseEnhancement(r.text) };
}

/** O que o enhancement é no banco, em outra LUW: ENHHEADER (versão, ferramenta) + TADIR. */
export async function readEnhancementBanco(cfg, name) {
  const E = up(name);
  const [header, tadir] = await Promise.all([
    readTable(cfg, 'ENHHEADER', { campos: ['ENHNAME', 'VERSION', 'ENHTOOLTYPE'], where: [`ENHNAME = '${E}'`] }),
    readTable(cfg, 'TADIR', { campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS', 'AUTHOR'], where: [`PGMID = 'R3TR' AND OBJECT = 'ENHO'`, `AND OBJ_NAME = '${E}'`] }),
  ]);
  return { exists: header.length > 0, active: header.some((h) => h.VERSION === 'A'), header, tadir: tadir[0] ?? null, orfa: header.length === 0 && tadir.length > 0 };
}

/**
 * Cria a BAdI implementation pela API (driver classrun) e prova por ADT (GET v4) e readTable (ENHHEADER/TADIR).
 * Devolve { ok, created, saved, activated, exc, adt, banco, saida }. A classe `implClass` precisa existir e estar
 * ativa (deploy(conexao, 'class', …) antes). Exige senha no cfg (classrun em sessão nova).
 */
export async function deployBadiImplementation(conexao, { enhancement, driver = driverDe('Y_ENH_', enhancement), keepDriver = false, ...opts }) {
  const E = up(enhancement); const pkg = opts.pkg ?? '$TMP';
  const antes = await readEnhancement(conexao, E);
  if (antes.exists) {
    const banco = await readEnhancementBanco(conexao.cfg, E).catch(() => ({ exists: false }));
    return { ok: antes.version === 'active', created: false, existed: true, saved: false, activated: antes.version === 'active', exc: null, adt: antes, banco, saida: '' };
  }
  const source = buildBadiImplDriverSource(driver, { enhancement: E, ...opts, pkg });
  let r;
  try { r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: BAdI impl ${E}`, source }); }
  finally { if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {}); }
  const p = r.ok ? parseEnhOutput(r.saida) : { saved: false, activated: false, exc: r.erro, deletes: [] };
  const adt = await readEnhancement(conexao, E).catch(() => ({ exists: false }));
  const banco = await readEnhancementBanco(conexao.cfg, E).catch(() => ({ exists: false }));
  const impl = adt.implementations?.[0];
  const bate = !!impl && impl.badi === up(opts.badi) && impl.implClass === up(opts.implClass);
  return { ok: p.saved && p.activated && adt.exists && adt.version === 'active' && banco.active && bate, created: p.saved, existed: false, ...p, adt, banco, saida: r.saida };
}

/**
 * Altera propriedades da implementação pelo ADT (GET → PUT v4 com lock → activate): `shortText` e/ou `active`.
 * Devolve { ok, put, activate, adt }. Medido: shortText trocou e o objeto seguiu ativo.
 */
export async function setEnhancementProperties(conexao, { name, shortText, active }) {
  const E = up(name); assertZY(E);
  const s = await conexao.sessao();
  const cur = await readEnhancement(conexao, E);
  if (!cur.exists) throw new Error(`setEnhancementProperties: ${E} não existe`);
  let body = cur.raw.replace(/<atom:link[^>]*\/>/g, '');
  if (shortText !== undefined) body = body.replace(/enho:shortText="[^"]*"/, `enho:shortText="${String(shortText).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`);
  if (active !== undefined) body = body.replace(/enho:active="(true|false)"/, `enho:active="${active ? 'true' : 'false'}"`);
  const path = pathDe(E);
  const h = await lockPath(s, path);
  let put;
  try { put = await call(s, { method: 'PUT', path: `${path}?lockHandle=${h}`, accept: CT, contentType: CT, body }); }
  finally { await unlockPath(s, path, h); }
  if (put.status >= 400) throw new Error(`PUT ${E} falhou (${put.status}): ${put.text.slice(0, 200)}`);
  const act = await ativarPath(s, path, E);
  const adt = await readEnhancement(conexao, E);
  return { ok: put.status < 400 && act.ok && adt.exists && adt.version === 'active', put: put.status, activate: act, adt };
}

// Ativação por PATH (o enhancement não é módulo de tipo, então não passa por objPath/activateMany).
async function ativarPath(session, path, name) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:uri="${path}" adtcore:name="${name}"/></adtcore:objectReferences>`;
  const r = await call(session, { method: 'POST', path: '/sap/bc/adt/activation?method=activate&preauditRequests=false', accept: 'application/xml', contentType: 'application/xml', body });
  const messages = activationMessages(r.text);
  return { status: r.status, ok: /activationExecuted="true"/.test(r.text) && !messages.some((m) => m.type === 'E'), messages };
}

/**
 * Apaga o enhancement: ADT (lock → DELETE) e, se o ADT recusar, a API (driver `cl_enh_factory`); se sobrar só a
 * entrada TADIR (órfã do POST do ADT), `removerTadirOrfa`. Exige confirm:true. Devolve { ok, via, banco, saida }.
 */
export async function deleteEnhancement(conexao, { name, confirm = false, pkg = '$TMP', driver = driverDe('Y_ENHD_', name), keepDriver = false }) {
  const E = up(name); assertZY(E);
  if (confirm !== true) throw new Error(`GUARD-RAIL: deleteEnhancement exige confirm:true (remoção de "${E}" é irreversível).`);
  const s = await conexao.sessao();
  const path = pathDe(E);
  let via = null, saida = '', detalhe = null;
  const adt = await readEnhancement(conexao, E);
  if (adt.exists) {
    try {
      const h = await lockPath(s, path);
      const d = await call(s, { method: 'DELETE', path: `${path}?lockHandle=${h}`, accept: 'application/*' });
      if (d.status < 400) via = 'adt'; else { detalhe = `ADT ${d.status}: ${d.text.slice(0, 200)}`; await unlockPath(s, path, h).catch(() => {}); }
    } catch (e) { detalhe = e.message.slice(0, 200); }
    if (!via) {
      let r;
      try { r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: apaga enhancement ${E}`, source: buildEnhDeleteSource(driver, E) }); }
      finally { if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {}); }
      saida = r.saida; if (r.ok && parseEnhOutput(r.saida).deletes[0]?.ok) via = 'api';
    }
  }
  let banco = await readEnhancementBanco(conexao.cfg, E).catch(() => ({ exists: false, orfa: false }));
  if (banco.orfa) {
    const t = await removerTadirOrfa(conexao, { object: 'ENHO', objName: E, pkg, keepDriver });
    saida += t.saida; via = via ?? 'tadir'; detalhe = detalhe ?? `órfã TADIR removida subrc=${t.subrc}`;
    banco = await readEnhancementBanco(conexao.cfg, E).catch(() => ({ exists: false, orfa: false }));
  }
  return { ok: !banco.exists && !banco.tadir, via, detalhe, banco, saida };
}

/** Remove uma entrada TADIR órfã (sem objeto por trás) por `TR_TADIR_INTERFACE` num driver. Só Z/Y. Devolve { subrc, saida }. */
export async function removerTadirOrfa(conexao, { object, objName, pgmid = 'R3TR', pkg = '$TMP', driver = driverDe('Y_TADIRD_', objName), keepDriver = false }) {
  const source = buildTadirDeleteSource(driver, { object, objName, pgmid });
  let r;
  try { r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: remove TADIR órfã ${up(object)} ${up(objName)}`, source }); }
  finally { if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {}); }
  const p = r.ok ? parseEnhOutput(r.saida) : { tadirDelete: null };
  return { subrc: p.tadirDelete?.subrc ?? null, ok: p.tadirDelete?.subrc === 0, saida: r.saida };
}
