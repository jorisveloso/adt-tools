// tipos/prog.test.mjs — teste irmão de prog.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './prog.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('prog: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.createBody(N, P, D), "shell de create").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<program:abapProgram xmlns:program=\"http://www.sap.com/adt/programs/programs\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:type=\"PROG/P\" adtcore:name=\"ZX_SNAP\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></program:abapProgram>");
});

