// sm30.test.mjs — parte pura do gerador de SM30: fonte do driver e parse da saída.
import { test, expect } from 'vitest';
import { buildSm30GeneratorSource, parseSm30Output } from './sm30.mjs';

test('sm30: o driver carrega o SAPMSVIM, preenche os globais e chama OBJ_GENERATE + start_gen_viewmaint_tool', () => {
  const s = buildSm30GeneratorSource('y_sm30_x', { table: 'yjbv_poc_tsm30', group: 'yjbv_poc_fgsm30', description: "Desc d'água" });
  expect(s).toContain('CLASS y_sm30_x DEFINITION');
  expect(s).toContain("iv_objectname = 'YJBV_POC_TSM30' iv_objecttype = 'S' iv_maint_mode = 'I'");
  expect(s).toContain("iv_objecttext = 'Desc d''água'");
  expect(s).toContain('PERFORM init_const_tabs IN PROGRAM sapmsvim.');
  expect(s).toContain("ASSIGN ('(SAPMSVIM)TVDIR') TO <tvdir>.");
  expect(s).toContain("ls_tvdir-area = 'YJBV_POC_FGSM30'");
  expect(s).toContain("<tddat>-cclass = '&NC&'");
  expect(s).toContain('MODIFY tddat FROM ls_tddat.');
  expect(s).toContain('PERFORM start_gen_viewmaint_tool IN PROGRAM sapmsvim USING ls_tvdir ls_gencb lv_mode lv_trace lv_sim.');
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
});

test('sm30: parse da saída medida no s4h', () => {
  const p = parseSm30Output('OBJ_GENERATE subrc=0 \nGEN_RESULT tvdir=C pool=A ffunc=C pfunc=C dynp1=C\n');
  expect(p).toEqual({ ok: true, objGenerate: { subrc: 0, msg: '' }, gencb: { tvdir: 'C', pool: 'A', ffunc: 'C', pfunc: 'C', dynp1: 'C' }, erro: null });
  const e = parseSm30Output('OBJ_GENERATE subrc=0 \nGEN_ERROR Message E FL 019 cannot be processed in plugin mode HTTP\n');
  expect(e.ok).toBe(false); expect(e.erro).toMatch(/FL 019/);
});
