// tipos/functionModule.test.mjs — teste irmão de functionModule.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './functionModule.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('functionModule: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.body('zx_fm', P, D, { group: 'zx_fg', rfc: true }), "metadata rfc").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<fmodule:abapFunctionModule xmlns:fmodule=\"http://www.sap.com/adt/functions/fmodules\" xmlns:adtcore=\"http://www.sap.com/adt/core\" fmodule:processingType=\"rfc\" adtcore:name=\"ZX_FM\" adtcore:type=\"FUGR/FF\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\"><adtcore:containerRef adtcore:uri=\"/sap/bc/adt/functions/groups/zx_fg\" adtcore:type=\"FUGR/F\" adtcore:name=\"ZX_FG\"/></fmodule:abapFunctionModule>");
  expect(mod.body('zx_fm', P, D, { group: 'zx_fg', rfc: false }), "metadata normal").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<fmodule:abapFunctionModule xmlns:fmodule=\"http://www.sap.com/adt/functions/fmodules\" xmlns:adtcore=\"http://www.sap.com/adt/core\" fmodule:processingType=\"normal\" adtcore:name=\"ZX_FM\" adtcore:type=\"FUGR/FF\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\"><adtcore:containerRef adtcore:uri=\"/sap/bc/adt/functions/groups/zx_fg\" adtcore:type=\"FUGR/F\" adtcore:name=\"ZX_FG\"/></fmodule:abapFunctionModule>");
});

test('functionModule: path aninhado exige group; validar recusa sem group; prova é a TFDIR medida', () => {
  expect(mod.path('Z_X', { group: 'ZG' })).toBe('/sap/bc/adt/functions/groups/zg/fmodules/z_x');
  expect(() => mod.path('Z_X')).toThrow(/group/);
  expect(() => mod.validar({ name: 'Z_X' })).toThrow(/group/);
  const p = mod.prova(mod.exemplo.opts.name);
  expect(p.tabela).toBe('TFDIR'); expect(p.medido).toBe(true);
  expect(mod.body(mod.exemplo.opts.name, P, D, mod.exemplo.opts)).toContain('fmodule:processingType="rfc"');
});
