// tipos/authorizationObject.test.mjs — teste irmão de authorizationObject.mjs: contrato comum + o XML
// PROVADO por spike, byte a byte. Snapshot capturado do spike de 2026-08-29 (S4H 758). Não "corrija"
// o snapshot para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod, { buildAuthorizationObjectBody, MAX_CAMPOS } from './authorizationObject.mjs';
import { testesComuns, D } from './_teste.mjs';

testesComuns(mod);

test('authorizationObject: XML byte-idêntico ao snapshot do spike', () => {
  expect(buildAuthorizationObjectBody('YX_SNAP', '$TMP', D, { objectClass: 'test', fields: ['yx_f', 'ACTVT'], activities: ['01', '03'] }))
    .toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<suso:suso xmlns:suso=\"http://www.sap.com/iam/suso\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"YX_SNAP\" adtcore:type=\"SUSO/B\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><suso:content><suso:objectClassName>TEST</suso:objectClassName><suso:criticality>N</suso:criticality><suso:privileged>A</suso:privileged><suso:ownContext>A</suso:ownContext><suso:authFields><suso:authField><suso:name>YX_F</suso:name></suso:authField><suso:authField><suso:name>ACTVT</suso:name></suso:authField></suso:authFields><suso:activities><suso:activity><suso:code>01</suso:code></suso:activity><suso:activity><suso:code>03</suso:code></suso:activity></suso:activities></suso:content></suso:suso>");
});

test('authorizationObject: sem atividades a seção sai vazia (objeto sem ACTVT é legítimo)', () => {
  const xml = buildAuthorizationObjectBody('YX_SNAP', '$TMP', 'x', { objectClass: 'TEST', fields: ['YX_F'] });
  expect(xml).toContain('<suso:activities></suso:activities>');
  expect(xml).toContain('<suso:criticality>N</suso:criticality><suso:privileged>A</suso:privileged><suso:ownContext>A</suso:ownContext>');
});

test('authorizationObject: classe e campos são obrigatórios, antes da rede', () => {
  expect(() => mod.validar({ name: 'YX_SNAP', def: { fields: ['YX_F'] } })).toThrow(/GUARD-RAIL.*objectClass/s);
  expect(() => mod.validar({ name: 'YX_SNAP', def: { objectClass: 'TEST' } })).toThrow(/GUARD-RAIL.*fields/s);
  expect(() => mod.validar({ name: 'YX_SNAP', def: { objectClass: 'TEST', fields: ['YX_F'] } })).not.toThrow();
});

test('authorizationObject: os dois limites da TOBJ são recusados antes da rede', () => {
  // 10 colunas FIEL* (DD03L) e XUFIELD CHAR 10 — medido 2026-08-29; sem isto a falha chega como
  // um 400 "erro na deserialização … ST SUSO" que não diz qual campo estourou.
  const muitos = Array.from({ length: MAX_CAMPOS + 1 }, (_, i) => `YX_F${i}`);
  expect(() => mod.validar({ name: 'YX_SNAP', def: { objectClass: 'TEST', fields: muitos } })).toThrow(/GUARD-RAIL.*FIEL/s);
  expect(() => mod.validar({ name: 'YX_SNAP', def: { objectClass: 'TEST', fields: ['YJBV_POC_AF'] } })).toThrow(/GUARD-RAIL.*CHAR 10/s);
});
