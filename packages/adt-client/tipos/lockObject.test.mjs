// tipos/lockObject.test.mjs — teste irmão de lockObject.mjs: contrato comum + o XML PROVADO por spike,
// byte a byte. Snapshot capturado do spike de 2026-08-29 (S4H 758). Não "corrija" o snapshot para o
// teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod, { buildLockObjectBody, MODOS } from './lockObject.mjs';
import { testesComuns, D } from './_teste.mjs';

testesComuns(mod);

test('lockObject: XML byte-idêntico ao snapshot do spike (create de EYJBV_POC_L1)', () => {
  expect(buildLockObjectBody('EYJBV_POC_L1', '$TMP', 'POC lock object', { table: 'YJBV_POC_LK_T', parameters: ['MANDT', 'ID'] }))
    .toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<enqu:lockobject xmlns:enqu=\"http://www.sap.com/adt/ddic/enqu\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"EYJBV_POC_L1\" adtcore:type=\"ENQU/DL\" adtcore:description=\"POC lock object\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><enqu:content><enqu:allowRFC>false</enqu:allowRFC><enqu:primaryTable><enqu:tableName>YJBV_POC_LK_T</enqu:tableName><enqu:lockMode>E</enqu:lockMode></enqu:primaryTable><enqu:secondaryTables></enqu:secondaryTables><enqu:lockParameters><enqu:lockParameter><enqu:parameterWanted>true</enqu:parameterWanted><enqu:parameterName>MANDT</enqu:parameterName><enqu:tableName>YJBV_POC_LK_T</enqu:tableName><enqu:fieldName>MANDT</enqu:fieldName></enqu:lockParameter><enqu:lockParameter><enqu:parameterWanted>true</enqu:parameterWanted><enqu:parameterName>ID</enqu:parameterName><enqu:tableName>YJBV_POC_LK_T</enqu:tableName><enqu:fieldName>ID</enqu:fieldName></enqu:lockParameter></enqu:lockParameters></enqu:content></enqu:lockobject>");
});

test('lockObject: secundária, RFC e parâmetro de outra tabela — a forma do PUT que persistiu (T2 com FK)', () => {
  const xml = buildLockObjectBody('eyjbv_poc_l1', '$TMP', D, {
    table: 'yjbv_poc_lk_t', lockMode: 'e', allowRFC: true,
    secondaryTables: [{ table: 'yjbv_poc_lk_t2', lockMode: 's' }],
    parameters: ['mandt', { name: 'ID2', table: 'yjbv_poc_lk_t2', field: 'id', wanted: false }],
  });
  expect(xml).toContain('adtcore:name="EYJBV_POC_L1"');
  expect(xml).toContain('<enqu:allowRFC>true</enqu:allowRFC>');
  expect(xml).toContain('<enqu:secondaryTables><enqu:secondaryTable><enqu:tableName>YJBV_POC_LK_T2</enqu:tableName><enqu:lockMode>S</enqu:lockMode></enqu:secondaryTable></enqu:secondaryTables>');
  expect(xml).toContain('<enqu:lockParameter><enqu:parameterWanted>false</enqu:parameterWanted><enqu:parameterName>ID2</enqu:parameterName><enqu:tableName>YJBV_POC_LK_T2</enqu:tableName><enqu:fieldName>ID</enqu:fieldName></enqu:lockParameter>');
  expect(xml).toContain('<enqu:parameterName>MANDT</enqu:parameterName><enqu:tableName>YJBV_POC_LK_T</enqu:tableName><enqu:fieldName>MANDT</enqu:fieldName>');
});

test('lockObject: o prefixo E é do SAP e o Z/Y roda depois dele', () => {
  expect(mod.nomeacao.prefixo).toBe('E');
  expect(mod.nomeacao.max).toBe(16);
  expect(mod.exemplo.opts.name).toMatch(/^E[YZ]/);
});

test('lockObject: guard-rails recusam antes da rede', () => {
  expect(() => mod.validar({ name: 'EYX', def: { parameters: ['ID'] } })).toThrow(/GUARD-RAIL.*def\.table/s);
  expect(() => mod.validar({ name: 'EYX', def: { table: 'YT' } })).toThrow(/GUARD-RAIL.*def\.parameters/s);
  expect(() => mod.validar({ name: 'EYX', def: { table: 'YT', parameters: ['ID'], lockMode: 'Q' } })).toThrow(/lockMode "Q"/);
  expect(() => mod.validar({ name: 'EYX', def: { table: 'YT', parameters: ['ID'], secondaryTables: [{ lockMode: 'S' }] } })).toThrow(/secondaryTables/);
  expect(() => mod.validar({ name: 'EYX', def: { table: 'YT', parameters: ['ID'], secondaryTables: [{ table: 'YT2' }] } })).not.toThrow();
  expect(MODOS).toContain('E');
});
