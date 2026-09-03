// tipos/package.test.mjs — teste irmão de package.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do spike de 2026-08-28 (S4H 758). Não "corrija" o snapshot para o teste passar —
// se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod, { buildPackageBody, ehLocal } from './package.mjs';
import { testesComuns, D } from './_teste.mjs';

testesComuns(mod);

test('package: XML byte-idêntico ao snapshot do spike', () => {
  expect(buildPackageBody('$ZX_SNAP', { description: D, responsible: 'mvjveloso' }), 'pacote local').toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<pak:package xmlns:pak=\"http://www.sap.com/adt/packages\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"$ZX_SNAP\" adtcore:type=\"DEVC/K\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\" adtcore:responsible=\"MVJVELOSO\"><adtcore:packageRef adtcore:name=\"$ZX_SNAP\"/><pak:attributes pak:packageType=\"development\"/><pak:superPackage/><pak:applicationComponent/><pak:transport><pak:softwareComponent pak:name=\"LOCAL\"/><pak:transportLayer pak:name=\"\"/></pak:transport><pak:useAccesses/><pak:packageInterfaces/><pak:subPackages/></pak:package>");
  expect(buildPackageBody('ZX_SNAP', { description: D, responsible: 'MVJVELOSO', transportLayer: 'ZS4H' }), 'transportável: HOME + layer')
    .toContain('<pak:transport><pak:softwareComponent pak:name="HOME"/><pak:transportLayer pak:name="ZS4H"/></pak:transport>');
  expect(buildPackageBody('$ZX_SUB', { responsible: 'X', superPackage: '$zx_snap' }), 'sub-pacote')
    .toContain('<pak:superPackage adtcore:name="$ZX_SNAP"/>');
});

test('package: o `$` do nome decide o regime, não uma opção', () => {
  expect(ehLocal('$YJBV_POC_PKG')).toBe(true);
  expect(ehLocal('YJBV_POC_PKGT')).toBe(false);
  // transportLayer informado num pacote local é IGNORADO (o SAP grava PDEVCLASS vazio)
  expect(buildPackageBody('$ZX_SNAP', { responsible: 'X', transportLayer: 'ZS4H' })).toContain('<pak:transportLayer pak:name=""/>');
});

test('package: pacote transportável sem transportLayer é recusado antes da rede', () => {
  expect(() => mod.validar({ name: 'ZX_SNAP' })).toThrow(/GUARD-RAIL.*transportLayer/s);
  expect(() => mod.validar({ name: 'ZX_SNAP', transportLayer: 'ZS4H' })).not.toThrow();
  expect(() => mod.validar({ name: '$ZX_SNAP' })).not.toThrow();
});
