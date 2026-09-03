// tipos/tableType.test.mjs — teste irmão de tableType.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do spike de 2026-08-28 (S4H 758). Não "corrija" o snapshot para o teste passar —
// se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './tableType.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('tableType: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.body(N, P, D, { rowType: 'ZX_LINHA' }), 'linha de dicionário, standard').toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ttyp:tableType xmlns:ttyp=\"http://www.sap.com/dictionary/tabletype\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"TTYP/DA\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><ttyp:rowType><ttyp:typeKind>dictionaryType</ttyp:typeKind><ttyp:typeName>ZX_LINHA</ttyp:typeName><ttyp:builtInType><ttyp:dataType>STRU</ttyp:dataType><ttyp:length>000000</ttyp:length><ttyp:decimals>000000</ttyp:decimals></ttyp:builtInType><ttyp:rangeType/></ttyp:rowType><ttyp:initialRowCount>00000</ttyp:initialRowCount><ttyp:accessType>standard</ttyp:accessType><ttyp:primaryKey><ttyp:definition>standard</ttyp:definition><ttyp:kind>nonUnique</ttyp:kind><ttyp:components/><ttyp:alias/></ttyp:primaryKey><ttyp:secondaryKeys><ttyp:allowed>notSpecified</ttyp:allowed></ttyp:secondaryKeys></ttyp:tableType>");
  expect(mod.body(N, P, D, { rowType: 'zx_linha', accessType: 'sorted', keyComponents: ['id'] }), 'sorted, chave única por componente').toContain('<ttyp:accessType>sorted</ttyp:accessType><ttyp:primaryKey><ttyp:definition>keyComponents</ttyp:definition><ttyp:kind>unique</ttyp:kind><ttyp:components><ttyp:component ttyp:name="ID"/></ttyp:components><ttyp:alias/></ttyp:primaryKey>');
  expect(mod.body(N, P, D), 'default = tabela de strings').toContain('<ttyp:typeKind>predefinedAbapType</ttyp:typeKind><ttyp:typeName></ttyp:typeName><ttyp:builtInType><ttyp:dataType>STRING</ttyp:dataType>');
});
