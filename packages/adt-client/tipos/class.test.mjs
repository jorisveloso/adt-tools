// tipos/class.test.mjs — teste irmão de class.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './class.mjs';
import { createBodyComTestes, includePath } from './class.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('class: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.createBody(N, P, D), "shell de create (sem testes)").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<class:abapClass xmlns:class=\"http://www.sap.com/adt/oo/classes\" xmlns:adtcore=\"http://www.sap.com/adt/core\" class:final=\"true\" class:visibility=\"public\" class:category=\"generalObjectType\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"CLAS/OC\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></class:abapClass>");
  expect(createBodyComTestes(N, P, D), "shell com include de teste declarado").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<class:abapClass xmlns:class=\"http://www.sap.com/adt/oo/classes\" xmlns:abapsource=\"http://www.sap.com/adt/abapsource\" xmlns:adtcore=\"http://www.sap.com/adt/core\" class:final=\"true\" class:visibility=\"public\" class:category=\"generalObjectType\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"CLAS/OC\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><class:include class:includeType=\"testclasses\" abapsource:sourceUri=\"includes/testclasses\" adtcore:name=\"\" adtcore:type=\"CLAS/I\"/></class:abapClass>");
});

test('class: includePath e o exemplo com testSource', () => {
  expect(includePath('ZCL_X', 'testclasses')).toBe('/sap/bc/adt/oo/classes/zcl_x/includes/testclasses');
  expect(mod.exemplo.opts.testSource).toContain('FOR TESTING');
  expect(createBodyComTestes(N, P, D)).toContain('class:includeType="testclasses"');
  expect(createBodyComTestes(N, P, D)).toContain('xmlns:abapsource=');
});
