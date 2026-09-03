// tipos/include.test.mjs — teste irmão de include.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './include.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('include: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.createBody(N, P, D), "shell de create").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<progInclude:abapInclude xmlns:progInclude=\"http://www.sap.com/adt/programs/includes\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:type=\"PROG/I\" adtcore:name=\"ZX_SNAP\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></progInclude:abapInclude>");
});

