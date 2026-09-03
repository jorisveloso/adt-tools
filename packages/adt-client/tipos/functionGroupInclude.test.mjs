// tipos/functionGroupInclude.test.mjs — teste irmão de functionGroupInclude.mjs: contrato comum + o XML
// PROVADO na POC do item 11 (2026-08-29, S4H 758), byte a byte. Não "corrija" o snapshot para o teste
// passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod, { nomeDoInclude, nomeDoPool } from './functionGroupInclude.mjs';
import { testesComuns, P, D } from './_teste.mjs';

testesComuns(mod);

test('functionGroupInclude: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.body('F01', P, D, { group: 'zx_fg' })).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<finclude:abapFunctionGroupInclude xmlns:finclude=\"http://www.sap.com/adt/functions/fincludes\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"LZX_FGF01\" adtcore:type=\"FUGR/I\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\"><adtcore:containerRef adtcore:uri=\"/sap/bc/adt/functions/groups/zx_fg\" adtcore:type=\"FUGR/F\" adtcore:name=\"ZX_FG\"/></finclude:abapFunctionGroupInclude>");
});

test('functionGroupInclude: o nome é L<GRUPO><SUFIXO> — sufixo ou nome pronto dão o mesmo', () => {
  expect(nomeDoInclude('ZX_FG', 'F01')).toBe('LZX_FGF01');
  expect(nomeDoInclude('zx_fg', 'lzx_fgf01')).toBe('LZX_FGF01');
  expect(nomeDoPool('zx_fg')).toBe('SAPLZX_FG');
  // o pool passa pela mesma função sem virar LZX_FGSAPLZX_FG (é ele que ativa junto — gotcha 2)
  expect(nomeDoInclude('ZX_FG', nomeDoPool('ZX_FG'))).toBe('SAPLZX_FG');
});

test('functionGroupInclude: path aninhado exige group; validar recusa include órfão; prova é a TRDIR medida', () => {
  expect(mod.path('F01', { group: 'ZX_FG' })).toBe('/sap/bc/adt/functions/groups/zx_fg/includes/lzx_fgf01');
  expect(mod.path(nomeDoPool('ZX_FG'), { group: 'ZX_FG' })).toBe('/sap/bc/adt/functions/groups/zx_fg/includes/saplzx_fg');
  expect(() => mod.path('F01')).toThrow(/group/);
  expect(() => mod.validar({ name: 'F01', source: 'x' })).toThrow(/group/);
  expect(() => mod.validar({ group: 'ZX_FG', name: 'F01' })).toThrow(/source/);
  // o ADT aceitaria (medido: 200) — quem recusa é o módulo, antes da rede
  expect(() => mod.validar({ group: 'ZX_FG', name: 'LZOUTROGRUPOF01', source: 'x' })).toThrow(/órfão/);
  const p = mod.prova('F01', { group: 'YJBV_POC_I_FG' });
  expect(p.tabela).toBe('TRDIR');
  expect(p.where[0]).toContain('LYJBV_POC_I_FGF01');
  expect(p.medido).toBe(true);
});

test('functionGroupInclude: o Z/Y é conferido no GRUPO, não no nome do include', () => {
  expect(mod.zyPeloContainer).toBe(true);
  expect(mod.container).toEqual({ libKey: 'functionGroup', param: 'group' });
});
