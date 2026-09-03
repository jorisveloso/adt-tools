// tipos/transformation.test.mjs — teste irmão de transformation.mjs: contrato comum + o XML PROVADO por spike
// (S4H 758, 2026-08-30) + a dedução do subtipo pelo fonte. Não "corrija" o snapshot para o teste passar.
import { test, expect } from 'vitest';
import mod, { tipoDeTransformacao, TIPOS_TRANSFORMACAO } from './transformation.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('transformation: XML byte-idêntico ao snapshot do spike, nos dois subtipos', () => {
  expect(mod.createBody(N, P, D), 'shell XSLTProgram (default)').toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<trans:transformation xmlns:trans=\"http://www.sap.com/adt/transformation\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"XSLT/VT\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\" trans:transformationType=\"XSLTProgram\"><adtcore:packageRef adtcore:name=\"$TMP\"/></trans:transformation>");
  expect(mod.createBody(N, P, D, { transformationType: 'SimpleTransformation' })).toContain('trans:transformationType="SimpleTransformation"');
});

test('transformation: o subtipo sai do fonte — prólogo sap.transform simple é ST, o resto é XSLT', () => {
  expect(TIPOS_TRANSFORMACAO).toEqual(['XSLTProgram', 'SimpleTransformation']);
  expect(tipoDeTransformacao(mod.exemplo.opts.source)).toBe('XSLTProgram');
  expect(tipoDeTransformacao('<?sap.transform simple?>\n<tt:transform xmlns:tt="http://www.sap.com/transformation-templates"/>')).toBe('SimpleTransformation');
  expect(tipoDeTransformacao('')).toBe('XSLTProgram');
  expect(() => mod.validar({ name: 'YJBV_POC_XSLT' })).toThrow(/exige \{ source \}/);
  expect(() => mod.validar({ name: 'YJBV_POC_XSLT', source: '<x/>', transformationType: 'Foo' })).toThrow(/XSLTProgram \| SimpleTransformation/);
  expect(() => mod.validar(mod.exemplo.opts)).not.toThrow();
});

test('transformation: o exemplo é um XSLT que escreve o elemento POC (o que o driver medido leu)', () => {
  expect(mod.exemplo.opts.source).toContain('xmlns:xsl="http://www.w3.org/1999/XSL/Transform"');
  expect(mod.exemplo.opts.source).toContain('<POC>');
  expect(mod.testes[0].assert.console).toContain('<POC>abc-JBV</POC>');
});
