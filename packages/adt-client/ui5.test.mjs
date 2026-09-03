// ui5.test.mjs — as partes PURAS do módulo de apps UI5. As fixtures são recortes dos
// `manifest.json` REAIS servidos pelo s4h 758 em 2026-08-31 (fila 33): `ZBSP_VENDAS` (List Report
// com ResponsiveTable) e `ZNFMRP02` (List Report com AnalyticalTable) — os dois apps custom que o
// harness wdi5 dirigiu.
//
//   npm test

import { test, expect } from 'vitest';
import { urlDoApp, resumoDoManifest, controleDaTabela } from './ui5.mjs';

const CFG = { base: 'http://ndc-srvhana.opus-idc.com.br:8000', client: '250' };

// ---------- URL ----------

test('urlDoApp: nome em minúsculas, sap-client e o arquivo pedido', () => {
  expect(urlDoApp(CFG, 'ZBSP_VENDAS')).toBe(
    'http://ndc-srvhana.opus-idc.com.br:8000/sap/bc/ui5_ui5/sap/zbsp_vendas/index.html?sap-client=250');
  expect(urlDoApp(CFG, 'ZBSP_VENDAS', { arquivo: 'manifest.json', lang: 'en' })).toBe(
    'http://ndc-srvhana.opus-idc.com.br:8000/sap/bc/ui5_ui5/sap/zbsp_vendas/manifest.json?sap-client=250&sap-language=EN');
});

test('urlDoApp: barra final da base não duplica; sem mandante não sobra "?"', () => {
  expect(urlDoApp({ base: 'http://h:8000/' }, 'ZAPP')).toBe('http://h:8000/sap/bc/ui5_ui5/sap/zapp/index.html');
});

test('urlDoApp: recusa cfg sem base e app vazio', () => {
  expect(() => urlDoApp({}, 'ZAPP')).toThrow(/sem `base`/);
  expect(() => urlDoApp(CFG, '')).toThrow(/BSP application/);
});

// ---------- manifest: List Report com ResponsiveTable (ZBSP_VENDAS) ----------

const VENDAS = {
  'sap.app': {
    id: 'vnd.vendas',
    type: 'application',
    title: '{{appTitle}}',
    sourceTemplate: { id: '@sap/generator-fiori:lrop', version: '1.26.0' },
    dataSources: {
      ZDD_VENDAS_CDS_VAN: { uri: "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/Annotations(TechnicalName='ZDD_VENDAS_CDS_VAN',Version='0001')/$value/", type: 'ODataAnnotation' },
      mainService: { uri: '/sap/opu/odata/sap/ZDD_VENDAS_CDS/', type: 'OData', settings: { odataVersion: '2.0' } },
    },
  },
  'sap.ui5': {
    dependencies: {
      minUI5Version: '1.114.0',
      libs: { 'sap.m': {}, 'sap.ui.core': {}, 'sap.ui.generic.app': {}, 'sap.suite.ui.generic.template': {} },
    },
  },
  'sap.ui.generic.app': {
    pages: {
      'ListReport|ZDD_VENDAS': {
        entitySet: 'ZDD_VENDAS',
        component: {
          name: 'sap.suite.ui.generic.template.ListReport',
          list: true,
          settings: { tableSettings: { type: 'ResponsiveTable' } },
        },
        pages: { 'ObjectPage|ZDD_VENDAS': { entitySet: 'ZDD_VENDAS', component: { name: 'sap.suite.ui.generic.template.ObjectPage' } } },
      },
    },
  },
};

test('resumoDoManifest: List Report V2 — serviço, entity set e tipo de tabela', () => {
  expect(resumoDoManifest(VENDAS)).toEqual({
    id: 'vnd.vendas',
    titulo: '{{appTitle}}',
    tipo: 'application',
    template: 'fiori-elements-v2',
    origem: '@sap/generator-fiori:lrop',
    servico: '/sap/opu/odata/sap/ZDD_VENDAS_CDS/',
    odataVersion: '2.0',
    entitySet: 'ZDD_VENDAS',
    pagina: 'ListReport|ZDD_VENDAS',
    componente: 'sap.suite.ui.generic.template.ListReport',
    tabela: 'ResponsiveTable',
    minUI5: '1.114.0',
    libs: ['sap.m', 'sap.ui.core', 'sap.ui.generic.app', 'sap.suite.ui.generic.template'],
  });
});

test('resumoDoManifest: o mesmo template com AnalyticalTable (ZNFMRP02) muda só a tabela', () => {
  const nfm = structuredClone(VENDAS);
  nfm['sap.ui.generic.app'].pages['ListReport|ZDD_VENDAS'].component.settings.tableSettings =
    { type: 'AnalyticalTable', multiSelect: true };
  expect(resumoDoManifest(nfm).tabela).toBe('AnalyticalTable');
  expect(resumoDoManifest(nfm).template).toBe('fiori-elements-v2');
});

test('resumoDoManifest: app freestyle (sem sap.ui.generic.app) não tem página nem tabela', () => {
  const free = { 'sap.app': { id: 'z.free', dataSources: { mainService: { uri: '/sap/opu/odata/sap/ZX_SRV/', type: 'OData' } } }, 'sap.ui5': {} };
  const r = resumoDoManifest(free);
  expect(r.template).toBe('freestyle');
  expect(r.entitySet).toBe(null);
  expect(r.tabela).toBe(null);
  expect(r.servico).toBe('/sap/opu/odata/sap/ZX_SRV/');
});

test('resumoDoManifest: sem mainService cai no primeiro dataSource OData (a anotação não conta)', () => {
  const m = { 'sap.app': { dataSources: {
    anot: { uri: '/x/anot.xml', type: 'ODataAnnotation' },
    servico: { uri: '/sap/opu/odata/sap/ZY_SRV/', type: 'OData' },
  } } };
  expect(resumoDoManifest(m).servico).toBe('/sap/opu/odata/sap/ZY_SRV/');
});

test('resumoDoManifest: manifest vazio não quebra', () => {
  expect(resumoDoManifest({}).template).toBe('freestyle');
  expect(resumoDoManifest(null).id).toBe(null);
});

// ---------- o seletor do spec sai do tipo de tabela ----------

test('controleDaTabela: ResponsiveTable é sap.m.Table; Analytical/Grid/Tree são sap.ui.table.Table', () => {
  expect(controleDaTabela('ResponsiveTable')).toBe('sap.m.Table');
  expect(controleDaTabela('AnalyticalTable')).toBe('sap.ui.table.Table');
  expect(controleDaTabela('GridTable')).toBe('sap.ui.table.Table');
  expect(controleDaTabela('TreeTable')).toBe('sap.ui.table.Table');
  expect(controleDaTabela(null)).toBe(null);
  expect(controleDaTabela('QualquerOutra')).toBe(null);
});
