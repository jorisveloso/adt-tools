// tipos/authorizationField.test.mjs — teste irmão de authorizationField.mjs: contrato comum + o XML
// PROVADO por spike, byte a byte. Snapshot capturado do spike de 2026-08-29 (S4H 758). Não "corrija"
// o snapshot para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod, { buildAuthorizationFieldBody } from './authorizationField.mjs';
import { testesComuns, D } from './_teste.mjs';

testesComuns(mod);

test('authorizationField: XML byte-idêntico ao snapshot do spike', () => {
  expect(buildAuthorizationFieldBody('YX_SNAP', '$TMP', D, { rollName: 'bukrs', checkTable: 't001' }))
    .toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<auth:auth xmlns:auth=\"http://www.sap.com/iam/auth\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"YX_SNAP\" adtcore:type=\"AUTH\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><auth:content><auth:fieldName>YX_SNAP</auth:fieldName><auth:rollName>BUKRS</auth:rollName><auth:checkTable>T001</auth:checkTable><auth:exitFB></auth:exitFB><auth:search>false</auth:search><auth:objexit>false</auth:objexit></auth:content></auth:auth>");
});

test('authorizationField: nome e data element sobem em MAIÚSCULAS, opcionais viram vazio/false', () => {
  const xml = buildAuthorizationFieldBody('yx_snap', '$TMP', 'x', { rollName: 'werks_d' });
  expect(xml).toContain('adtcore:name="YX_SNAP"');
  expect(xml).toContain('<auth:fieldName>YX_SNAP</auth:fieldName>');
  expect(xml).toContain('<auth:rollName>WERKS_D</auth:rollName>');
  expect(xml).toContain('<auth:checkTable></auth:checkTable>');
  expect(xml).toContain('<auth:search>false</auth:search>');
  expect(buildAuthorizationFieldBody('YX_SNAP', '$TMP', 'x', { rollName: 'BUKRS', search: true, objexit: true }))
    .toContain('<auth:search>true</auth:search><auth:objexit>true</auth:objexit>');
});

test('authorizationField: sem rollName é recusado antes da rede', () => {
  expect(() => mod.validar({ name: 'YX_SNAP' })).toThrow(/GUARD-RAIL.*rollName/s);
  expect(() => mod.validar({ name: 'YX_SNAP', def: { rollName: 'BUKRS' } })).not.toThrow();
});

test('authorizationField: o limite de 10 é o ÚTIL (TOBJ-FIEL*), não o do create', () => {
  // O create do AUTH aceita 11 (medido); quem recusa é o SUSO. Por isso `nomeacao.max` é 10 e a
  // fonte registra as duas medições — o guard-rail corta antes de a incompatibilidade aparecer longe.
  expect(mod.nomeacao.max).toBe(10);
  expect(mod.nomeacao.fonte).toMatch(/TOBJ-FIEL/);
});
