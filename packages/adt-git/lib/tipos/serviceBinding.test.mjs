// tipos/serviceBinding.test.mjs — teste irmão de serviceBinding.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './serviceBinding.mjs';
import { odataV4RuntimeUrl } from './serviceBinding.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('serviceBinding: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.createBody('zx_snap', P, D, { srvd: 'ZX_SRVD', category: '0' }), "body do create (categoria 0)").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<srvb:serviceBinding srvb:contract=\"C1\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"SRVB/SVB\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" xmlns:srvb=\"http://www.sap.com/adt/ddic/ServiceBindings\" xmlns:adtcore=\"http://www.sap.com/adt/core\"><adtcore:packageRef adtcore:name=\"$TMP\"/><srvb:services srvb:name=\"ZX_SNAP\"><srvb:content srvb:version=\"0001\" srvb:releaseState=\"NOT_RELEASED\"><srvb:serviceDefinition adtcore:uri=\"/sap/bc/adt/ddic/srvd/sources/zx_srvd\" adtcore:type=\"SRVD/SRV\" adtcore:name=\"ZX_SRVD\"/><srvb:bindingTypeData><adtcore:content adtcore:encoding=\"base64\"/></srvb:bindingTypeData></srvb:content></srvb:services><srvb:binding srvb:type=\"ODATA\" srvb:version=\"V4\" srvb:category=\"0\"><srvb:implementation adtcore:name=\"ZX_SNAP\"/></srvb:binding></srvb:serviceBinding>");
});

test('serviceBinding: validar exige description; runtime URL por categoria; antesDeApagar existe', () => {
  expect(() => mod.validar({ name: 'Z_X' })).toThrow(/description/);
  expect(odataV4RuntimeUrl('ZB', 'ZS', { category: '0' })).toBe('/sap/opu/odata4/sap/zb/srvd/sap/zs/0001/');
  expect(odataV4RuntimeUrl('ZB', 'ZS', { category: '1' })).toBe('/sap/opu/odata4/sap/zb/srvd_a2x/sap/zs/0001/');
  expect(typeof mod.antesDeApagar).toBe('function');
  expect(mod.createBody(mod.exemplo.opts.name, P, D, mod.exemplo.opts)).toContain('srvb:category="0"');
});
