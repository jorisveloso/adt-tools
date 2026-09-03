// enho.test.mjs — parte pura do módulo de enhancement: validação, fonte dos drivers e parse das saídas/XML medidos no s4h.
import { test, expect } from 'vitest';
import { buildBadiImplDriverSource, buildEnhDeleteSource, buildTadirDeleteSource, parseEnhOutput, parseEnhancement, validarBadiImplementation, COLL, CT } from './enho.mjs';

const OPTS = { enhancement: 'yjbv_poc_enho2', spot: 'ES_J1B_TAX_SITN', badi: 'badi_j1b_tax_sitn', implClass: 'YJBV_POC_CL_BADI', implName: 'YJBV_POC_BADI_IMPL2', text: "POC d'água" };

test('enho: validação — Z/Y no enhancement e na classe, spot/badi/classe obrigatórios, 30 chars', () => {
  expect(() => validarBadiImplementation(OPTS)).not.toThrow();
  expect(() => validarBadiImplementation({ ...OPTS, enhancement: 'SAP_ENHO' })).toThrow(/GUARD-RAIL/);
  expect(() => validarBadiImplementation({ ...OPTS, implClass: 'CL_SAP' })).toThrow(/GUARD-RAIL/);
  expect(() => validarBadiImplementation({ ...OPTS, badi: '' })).toThrow(/exige \{ spot \}/);
  expect(() => validarBadiImplementation({ ...OPTS, enhancement: 'Y'.repeat(31) })).toThrow(/30 caracteres/);
  expect(COLL).toBe('/sap/bc/adt/enhancements/enhoxhb'); expect(CT).toBe('application/vnd.sap.adt.enh.enhoxhb.v4+xml');
});

test('enho: driver de create — a via do abapGit (cl_enh_factory + cl_enh_tool_badi_impl), save/activate/unlock, linhas ≤ 255', () => {
  const s = buildBadiImplDriverSource('y_enh_x', OPTS);
  expect(s).toContain('CLASS y_enh_x DEFINITION');
  expect(s).toContain("lv_name TYPE enhname VALUE 'YJBV_POC_ENHO2', lv_pkg TYPE devclass VALUE '$TMP'");
  expect(s).toContain('cl_enh_factory=>create_enhancement( EXPORTING enhname = lv_name enhtype = cl_abstract_enh_tool_redef=>credefinition');
  expect(s).toContain('enhtooltype = cl_enh_tool_badi_impl=>tooltype');
  expect(s).toContain("lo_badi->set_spot_name( 'ES_J1B_TAX_SITN' ).");
  expect(s).toContain("if_enh_object_docu~set_shorttext( 'POC d''água' )");
  expect(s).toContain("ls_impl-impl_name = 'YJBV_POC_BADI_IMPL2'. ls_impl-badi_name = 'BADI_J1B_TAX_SITN'. ls_impl-impl_class = 'YJBV_POC_CL_BADI'. ls_impl-active = 'X'.");
  expect(s).toContain('if_enh_object~save( run_dark = abap_true )');
  expect(s).toContain('if_enh_object~activate( run_dark = abap_true )');
  expect(s).toContain('if_enh_object~unlock( )');
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
  const inativa = buildBadiImplDriverSource('y_enh_y', { ...OPTS, implName: undefined, active: false });
  expect(inativa).toContain("ls_impl-impl_name = 'YJBV_POC_ENHO2'.");
  expect(inativa).toContain("ls_impl-active = ''.");
});

test('enho: drivers de delete (API) e de TADIR órfã recusam nome fora de Z/Y', () => {
  const d = buildEnhDeleteSource('y_enhd', ['yjbv_poc_enho', 'YJBV_POC_ENHO2']);
  expect(d.match(/cl_enh_factory=>get_enhancement/g)).toHaveLength(2);
  expect(d).toContain("enhancement_id = 'YJBV_POC_ENHO' lock = abap_true");
  expect(d).toContain('delete( nevertheless_delete = abap_true run_dark = abap_true )');
  expect(() => buildEnhDeleteSource('y_enhd', 'SAP_ENHO')).toThrow(/GUARD-RAIL/);
  const t = buildTadirDeleteSource('y_tadird', { object: 'enho', objName: 'yjbv_poc_enho' });
  expect(t).toContain("CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_delete_tadir_entry = 'X' wi_test_modus = ' '");
  expect(t).toContain("wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'ENHO' wi_tadir_obj_name = 'YJBV_POC_ENHO'");
  expect(() => buildTadirDeleteSource('y_tadird', { object: 'ENHO', objName: 'SAP_X' })).toThrow(/GUARD-RAIL/);
});

test('enho: parse das saídas medidas no s4h — create ok, create com exceção, delete, TADIR', () => {
  const ok = parseEnhOutput('ENH_SAVE YJBV_POC_ENHO2 ok\nENH_ACTIVATE YJBV_POC_ENHO2 ok\n');
  expect(ok).toMatchObject({ saved: true, activated: true, exc: null, deletes: [], tadirDelete: null });
  const exc = parseEnhOutput('ENH_CREATE YJBV_POC_ENHO2 exc Enhancement já existe\n');
  expect(exc).toMatchObject({ saved: false, activated: false, exc: 'Enhancement já existe' });
  const semAtivar = parseEnhOutput('ENH_SAVE X ok\nENH_ACTIVATE X exc classe não ativa\n');
  expect(semAtivar).toMatchObject({ saved: true, activated: false, exc: 'classe não ativa' });
  const del = parseEnhOutput('ENH_DELETE YJBV_POC_ENHO2 ok\nENH_DELETE YJBV_POC_ENHO exc não existe\n');
  expect(del.deletes).toEqual([{ name: 'YJBV_POC_ENHO2', ok: true, msg: null }, { name: 'YJBV_POC_ENHO', ok: false, msg: 'não existe' }]);
  expect(parseEnhOutput('TADIR_DELETE ENHO YJBV_POC_ENHO subrc=0\n').tadirDelete).toEqual({ object: 'ENHO', name: 'YJBV_POC_ENHO', subrc: 0 });
});

test('enho: parse do XML v4 medido (GET de YJBV_POC_ENHO2 criado pela API)', () => {
  const xml = '<?xml version="1.0" encoding="utf-8"?><enho:objectData adtcore:responsible="MVJVELOSO" adtcore:masterLanguage="PT" adtcore:name="YJBV_POC_ENHO2" adtcore:type="ENHO/XHB" adtcore:changedAt="2026-08-30T13:10:00Z" adtcore:version="active" adtcore:description="POC impl pela API" xmlns:enho="http://www.sap.com/adt/enhancements/enho" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/%24tmp" adtcore:type="DEVC/K" adtcore:name="$TMP"/><enho:contentCommon enho:toolType="BADI_IMPL" enho:adjustmentStatus="adjusted"><enho:usages/></enho:contentCommon><enho:contentSpecific><enho:badiTechnology><enho:badiImplementations><enho:badiImplementation enho:name="YJBV_POC_BADI_IMPL2" enho:shortText="" enho:example="false" enho:default="false" enho:active="true" enho:customizingLock="" enho:runtimeBehaviorShorttext="Implementação não será chamada"><enho:enhancementSpot adtcore:uri="/sap/bc/adt/enhancements/enhsxsb/es_j1b_tax_sitn" adtcore:type="ENHS/XSB" adtcore:name="ES_J1B_TAX_SITN"/><enho:badiDefinition adtcore:uri="/sap/bc/adt/enhancements/enhsxsb/es_j1b_tax_sitn#type=enhs%2fxb;name=badi_j1b_tax_sitn" adtcore:type="ENHS/XB" adtcore:name="BADI_J1B_TAX_SITN"/><enho:implementingClass adtcore:uri="/sap/bc/adt/oo/classes/yjbv_poc_cl_badi" adtcore:type="CLAS/OC" adtcore:name="YJBV_POC_CL_BADI"/></enho:badiImplementation></enho:badiImplementations></enho:badiTechnology></enho:contentSpecific></enho:objectData>';
  const r = parseEnhancement(xml);
  expect(r).toMatchObject({ name: 'YJBV_POC_ENHO2', type: 'ENHO/XHB', version: 'active', description: 'POC impl pela API', package: '$TMP', toolType: 'BADI_IMPL' });
  expect(r.implementations).toEqual([{ name: 'YJBV_POC_BADI_IMPL2', shortText: '', active: true, example: false, default: false, customizingLock: false, runtimeBehavior: 'Implementação não será chamada', spot: 'ES_J1B_TAX_SITN', badi: 'BADI_J1B_TAX_SITN', implClass: 'YJBV_POC_CL_BADI' }]);
  expect(parseEnhancement('').implementations).toEqual([]);
});
