// brf.test.mjs — as partes puras do brf.mjs, sem SAP. A saída-fixture é a REAL do E2E de 2026-08-30
// (S4H 758, YJBV_POC_APP2). npm test.

import { test, expect } from 'vitest';
import { validarDecisionTable, buildDecisionTableSource, parseSaidaBrf, buildRunFunctionSource, buildDeleteAppSource } from './brf.mjs';

const SPEC = {
  app: 'YJBV_POC_APP2',
  contexto: ['TIPO', 'CANAL'],
  resultado: 'PARECER',
  regras: [
    { quando: { TIPO: 'A', CANAL: 'WEB' }, entao: 'APROVADO' },
    { quando: { TIPO: 'A' }, entao: 'MANUAL' },
    { quando: { TIPO: 'B', CANAL: 'LOJA' }, entao: 'REJEITADO' },
  ],
  testes: [{ TIPO: 'A', CANAL: 'WEB' }, { TIPO: 'C', CANAL: 'WEB' }],
};

test('validarDecisionTable: guard-rails', () => {
  expect(() => validarDecisionTable({ ...SPEC, app: 'POC_APP' })).toThrow(/GUARD-RAIL/);
  expect(() => validarDecisionTable({ ...SPEC, contexto: [] })).toThrow(/ao menos um elemento/);
  expect(() => validarDecisionTable({ ...SPEC, regras: [{ quando: { OUTRO: 'X' }, entao: 'Y' }] })).toThrow(/não está no contexto/);
  expect(() => validarDecisionTable({ ...SPEC, regras: [{ quando: { TIPO: 'A' } }] })).toThrow(/falta "entao"/);
  expect(() => validarDecisionTable({ ...SPEC, testes: [{ NADA: '1' }] })).toThrow(/não está no contexto/);
  expect(() => validarDecisionTable(SPEC)).not.toThrow();
});

test('buildDecisionTableSource: o fluxo medido, com curinga e escape', () => {
  const s = buildDecisionTableSource('y_brf_x', { ...SPEC, regras: [...SPEC.regras, { quando: { TIPO: "O'HARA" }, entao: 'VIP' }] });
  expect(s).toContain('create_local_application( )');
  expect(s).toContain("set_name( 'YJBV_POC_APP2' )");
  expect(s).toContain('gc_exty_decision_table');
  expect(s).toContain('iv_deep = abap_true');
  // 3 colunas: TIPO, CANAL e o resultado PARECER
  expect(s.match(/INSERT ls_col INTO TABLE lts_col/g)).toHaveLength(3);
  // célula curinga: a regra 2 não põe range no CANAL — menos ranges que células de condição
  const ranges = s.match(/INSERT ls_range INTO TABLE ls_data-ts_range/g).length;
  expect(ranges).toBe(6); // 2 + 1(curinga) + 2 + 1
  expect(s).toContain("'O''HARA'"); // aspas escapadas no literal ABAP
  expect(s).toContain('SEM_CONCORDANCIA'); // cx_fdt no process = sem linha que case, não erro
});

test('parseSaidaBrf: a saída real do driver', () => {
  const p = parseSaidaBrf([
    'APP_ID=00505683746F1FD1A993A1EE9AE64000',
    'DT_ID=00505683746F1FD1A993A1EE9AE6C000',
    'FUNC_ID=00505683746F1FD1A993A1EE9AE70000',
    'RESULT_1=APROVADO', 'RESULT_2=MANUAL', 'RESULT_3=REJEITADO', 'RESULT_4=SEM_CONCORDANCIA',
    'FIM_OK',
  ].join('\n'));
  expect(p.appId).toBe('00505683746F1FD1A993A1EE9AE64000');
  expect(p.funcId).toBe('00505683746F1FD1A993A1EE9AE70000');
  expect(p.resultados).toEqual({ 1: 'APROVADO', 2: 'MANUAL', 3: 'REJEITADO', 4: 'SEM_CONCORDANCIA' });
  expect(p.fim).toBe(true);
  expect(parseSaidaBrf('Error: cx_fdt').fim).toBe(false);
});

test('buildRunFunctionSource: resolve função e elementos por NOME', () => {
  const s = buildRunFunctionSource('y_brfx_fn', { funcao: 'YJBV_POC_APP2_FN', valores: { TIPO: 'B', CANAL: 'LOJA' } });
  expect(s).toContain('gc_object_type_function');
  expect(s).toContain("ls_sel-low = 'YJBV_POC_APP2_FN'");
  expect(s).toContain('cl_fdt_convenience=>get_name'); // casa valor → elemento pelo nome
  expect(() => buildRunFunctionSource('y', { funcao: 'F1', valores: {} })).toThrow(/valores/);
});

test('buildDeleteAppSource: só Z/Y, e pela porta oficial', () => {
  const s = buildDeleteAppSource('y_brfd_x', { app: 'YJBV_POC_APP2' });
  expect(s).toContain('delete_incl_assigned_object');
  expect(s).toContain('gc_delete_option_del_or_mark');
  expect(() => buildDeleteAppSource('y', { app: 'FDT_DEMO' })).toThrow(/GUARD-RAIL/);
});
