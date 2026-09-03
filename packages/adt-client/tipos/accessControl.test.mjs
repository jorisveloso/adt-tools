// tipos/accessControl.test.mjs — teste irmão de accessControl.mjs: contrato comum + o XML PROVADO
// por spike, byte a byte. Snapshot capturado do spike de 2026-08-28 (S4H 758). Não "corrija" o
// snapshot para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './accessControl.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('accessControl: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.createBody(N, P, D), 'shell de create').toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<dcl:dclSource xmlns:dcl=\"http://www.sap.com/adt/acm/dclsources\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DCLS/DL\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></dcl:dclSource>");
});

test('accessControl: o fonte do exemplo carrega as duas exigências medidas (@MappingRole e role = nome do objeto)', () => {
  const { name, source } = mod.exemplo.opts;
  expect(source, '@MappingRole: true é o que a ativação exige (ACM_SYNTAX 130)').toContain('@MappingRole: true');
  expect(source, 'define role tem de usar o nome do objeto').toContain(`define role ${name}`);
  expect(source).toContain('grant select on');
});
