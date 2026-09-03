// tipos/functionGroup.test.mjs — teste irmão de functionGroup.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './functionGroup.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('functionGroup: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.createBody('zx_fg', P, D), "body do create").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<group:abapFunctionGroup xmlns:group=\"http://www.sap.com/adt/functions/groups\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_FG\" adtcore:type=\"FUGR/F\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></group:abapFunctionGroup>");
});

