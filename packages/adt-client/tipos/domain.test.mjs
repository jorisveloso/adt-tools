// tipos/domain.test.mjs — teste irmão de domain.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './domain.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('domain: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.body(N, P, D, { dataType: 'CHAR', length: 2, fixValues: [{ low: 'A', text: 'Alfa' }, { low: 'B', high: 'C', text: 'Beta & Gama' }] }), "body com valores fixos").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<doma:domain xmlns:doma=\"http://www.sap.com/dictionary/domain\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DOMA/DD\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><doma:content><doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>000002</doma:length><doma:decimals>000000</doma:decimals></doma:typeInformation><doma:outputInformation><doma:length>000002</doma:length><doma:style>00</doma:style><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>false</doma:lowercase><doma:ampmFormat>false</doma:ampmFormat></doma:outputInformation><doma:valueInformation><doma:valueTableRef/><doma:appendExists>false</doma:appendExists><doma:fixValues><doma:fixValue><doma:position>0001</doma:position><doma:low>A</doma:low><doma:high></doma:high><doma:text>Alfa</doma:text></doma:fixValue><doma:fixValue><doma:position>0002</doma:position><doma:low>B</doma:low><doma:high>C</doma:high><doma:text>Beta &amp; Gama</doma:text></doma:fixValue></doma:fixValues></doma:valueInformation></doma:content></doma:domain>");
  expect(mod.body(N, P, D), "body default").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<doma:domain xmlns:doma=\"http://www.sap.com/dictionary/domain\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DOMA/DD\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><doma:content><doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>000001</doma:length><doma:decimals>000000</doma:decimals></doma:typeInformation><doma:outputInformation><doma:length>000001</doma:length><doma:style>00</doma:style><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>false</doma:lowercase><doma:ampmFormat>false</doma:ampmFormat></doma:outputInformation><doma:valueInformation><doma:valueTableRef/><doma:appendExists>false</doma:appendExists><doma:fixValues></doma:fixValues></doma:valueInformation></doma:content></doma:domain>");
});

test('domain: o body do exemplo carrega os valores fixos (a parte que o create descarta)', () => {
  const xml = mod.body(mod.exemplo.opts.name, P, mod.exemplo.opts.description, mod.exemplo.opts.def);
  expect(xml).toContain('<doma:low>AB</doma:low>'); expect(xml).toContain('<doma:position>0002</doma:position>');
});
