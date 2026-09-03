// tipos/interface.test.mjs — teste irmão de interface.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './interface.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('interface: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.createBody(N, P, D), "shell de create").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<intf:abapInterface xmlns:intf=\"http://www.sap.com/adt/oo/interfaces\" xmlns:adtcore=\"http://www.sap.com/adt/core\" intf:modeled=\"false\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"INTF/OI\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></intf:abapInterface>");
});

