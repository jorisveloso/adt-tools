// tipos.test.mjs — trava o registro de tipos e os XML de create/body.
//
//   npm test
//
// Os snapshots abaixo foram CAPTURADOS do código anterior à migração para tipos/<libKey>.mjs
// (adt-client.mjs, registro TYPES + defaultCreateBody + build*Body, 2026-08-28), com
// name='ZX_SNAP', pkg='$TMP', description='Desc & <x> "y"' (exercita o escape XML). Cada string aqui
// é uma receita validada por spike contra SAP: o módulo de tipo tem de reproduzi-la BYTE A BYTE.
// Não "corrija" um snapshot para o teste passar — corrija o módulo.

import { test, expect } from 'vitest';
import { TYPES, defaultCreateBody, buildDataElementBody, buildDomainBody, buildMessageClassBody } from './adt-client.mjs';

const N = 'ZX_SNAP', P = '$TMP', D = 'Desc & <x> "y"';

export const TYPES_ANTES = {
  "dataElement": {
    "coll": "/sap/bc/adt/ddic/dataelements",
    "ct": "application/vnd.sap.adt.dataelements.v2+xml",
    "source": false
  },
  "table": {
    "coll": "/sap/bc/adt/ddic/tables",
    "ct": "application/vnd.sap.adt.tables.v2+xml",
    "source": true
  },
  "cds": {
    "coll": "/sap/bc/adt/ddic/ddl/sources",
    "ct": "application/vnd.sap.adt.ddlSource+xml",
    "source": true
  },
  "class": {
    "coll": "/sap/bc/adt/oo/classes",
    "ct": "application/vnd.sap.adt.oo.classes.v4+xml",
    "source": true
  },
  "interface": {
    "coll": "/sap/bc/adt/oo/interfaces",
    "ct": "application/vnd.sap.adt.oo.interfaces.v2+xml",
    "accept": "application/*",
    "source": true
  },
  "msag": {
    "coll": "/sap/bc/adt/messageclass",
    "ct": "application/xml",
    "accept": "application/*",
    "source": false
  },
  "prog": {
    "coll": "/sap/bc/adt/programs/programs",
    "ct": "application/vnd.sap.adt.programs.programs.v2+xml",
    "source": true
  },
  "include": {
    "coll": "/sap/bc/adt/programs/includes",
    "ct": "application/vnd.sap.adt.programs.includes.v2+xml",
    "source": true
  },
  "domain": {
    "coll": "/sap/bc/adt/ddic/domains",
    "ct": "application/vnd.sap.adt.domains.v2+xml",
    "source": false
  },
  "structure": {
    "coll": "/sap/bc/adt/ddic/structures",
    "ct": "application/vnd.sap.adt.structures.v2+xml",
    "source": true
  },
  "behaviorDefinition": {
    "coll": "/sap/bc/adt/bo/behaviordefinitions",
    "ct": "application/vnd.sap.adt.blues.v1+xml",
    "source": true
  },
  "serviceDefinition": {
    "coll": "/sap/bc/adt/ddic/srvd/sources",
    "ct": "application/vnd.sap.adt.ddic.srvd.v1+xml",
    "source": true
  },
  "serviceBinding": {
    "coll": "/sap/bc/adt/businessservices/bindings",
    "ct": "application/vnd.sap.adt.businessservices.servicebinding.v2+xml",
    "source": false
  },
  "metadataExtension": {
    "coll": "/sap/bc/adt/ddic/ddlx/sources",
    "ct": "application/vnd.sap.adt.ddic.ddlx.v1+xml",
    "source": true
  },
  "functionGroup": {
    "coll": "/sap/bc/adt/functions/groups",
    "ct": "application/vnd.sap.adt.functions.groups.v3+xml",
    "source": false
  },
  "functionModule": {
    "coll": "/sap/bc/adt/functions/groups",
    "ct": "application/vnd.sap.adt.functions.fmodules.v3+xml",
    "source": true
  }
};

export const SHELLS_ANTES = {
  "class": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<class:abapClass xmlns:class=\"http://www.sap.com/adt/oo/classes\" xmlns:adtcore=\"http://www.sap.com/adt/core\" class:final=\"true\" class:visibility=\"public\" class:category=\"generalObjectType\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"CLAS/OC\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></class:abapClass>",
  "interface": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<intf:abapInterface xmlns:intf=\"http://www.sap.com/adt/oo/interfaces\" xmlns:adtcore=\"http://www.sap.com/adt/core\" intf:modeled=\"false\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"INTF/OI\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></intf:abapInterface>",
  "table": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<blue:blueSource xmlns:blue=\"http://www.sap.com/wbobj/blue\" xmlns:abapsource=\"http://www.sap.com/adt/abapsource\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"TABL/DT\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></blue:blueSource>",
  "structure": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<blue:blueSource xmlns:blue=\"http://www.sap.com/wbobj/blue\" xmlns:abapsource=\"http://www.sap.com/adt/abapsource\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"TABL/DS\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></blue:blueSource>",
  "cds": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ddl:ddlSource xmlns:ddl=\"http://www.sap.com/adt/ddic/ddlsources\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DDLS/DF\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></ddl:ddlSource>",
  "behaviorDefinition": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<blue:blueSource xmlns:blue=\"http://www.sap.com/wbobj/blue\" xmlns:abapsource=\"http://www.sap.com/adt/abapsource\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"BDEF/BDO\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></blue:blueSource>",
  "metadataExtension": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ddlx:ddlxSource xmlns:ddlx=\"http://www.sap.com/adt/ddic/ddlxsources\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DDLX/EX\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></ddlx:ddlxSource>",
  "serviceDefinition": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<srvd:srvdSource xmlns:srvd=\"http://www.sap.com/adt/ddic/srvdsources\" xmlns:adtcore=\"http://www.sap.com/adt/core\" srvd:srvdSourceType=\"S\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"SRVD/SRV\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></srvd:srvdSource>",
  "prog": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<program:abapProgram xmlns:program=\"http://www.sap.com/adt/programs/programs\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:type=\"PROG/P\" adtcore:name=\"ZX_SNAP\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></program:abapProgram>",
  "include": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<progInclude:abapInclude xmlns:progInclude=\"http://www.sap.com/adt/programs/includes\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:type=\"PROG/I\" adtcore:name=\"ZX_SNAP\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></progInclude:abapInclude>"
};

export const BUILDERS_ANTES = {
  "dataElementPredefined": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<blue:wbobj xmlns:blue=\"http://www.sap.com/wbobj/dictionary/dtel\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DTEL/DE\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><dtel:dataElement xmlns:dtel=\"http://www.sap.com/adt/dictionary/dataelements\"><dtel:typeKind>predefinedAbapType</dtel:typeKind><dtel:typeName></dtel:typeName><dtel:dataType>CHAR</dtel:dataType><dtel:dataTypeLength>000010</dtel:dataTypeLength><dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals><dtel:shortFieldLabel>Desc &amp; &lt;x&gt; &quot;y&quot;</dtel:shortFieldLabel><dtel:shortFieldLength>10</dtel:shortFieldLength><dtel:shortFieldMaxLength>10</dtel:shortFieldMaxLength><dtel:mediumFieldLabel>Desc &amp; &lt;x&gt; &quot;y&quot;</dtel:mediumFieldLabel><dtel:mediumFieldLength>20</dtel:mediumFieldLength><dtel:mediumFieldMaxLength>20</dtel:mediumFieldMaxLength><dtel:longFieldLabel>Desc &amp; &lt;x&gt; &quot;y&quot;</dtel:longFieldLabel><dtel:longFieldLength>40</dtel:longFieldLength><dtel:longFieldMaxLength>40</dtel:longFieldMaxLength><dtel:headingFieldLabel>Desc &amp; &lt;x&gt; &quot;y&quot;</dtel:headingFieldLabel><dtel:headingFieldLength>55</dtel:headingFieldLength><dtel:headingFieldMaxLength>55</dtel:headingFieldMaxLength><dtel:searchHelp/><dtel:searchHelpParameter/><dtel:setGetParameter/><dtel:defaultComponentName/><dtel:deactivateInputHistory>false</dtel:deactivateInputHistory><dtel:changeDocument>false</dtel:changeDocument><dtel:leftToRightDirection>false</dtel:leftToRightDirection><dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering></dtel:dataElement></blue:wbobj>",
  "dataElementDomain": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<blue:wbobj xmlns:blue=\"http://www.sap.com/wbobj/dictionary/dtel\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DTEL/DE\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><dtel:dataElement xmlns:dtel=\"http://www.sap.com/adt/dictionary/dataelements\"><dtel:typeKind>domain</dtel:typeKind><dtel:typeName>ZDOM</dtel:typeName><dtel:dataType></dtel:dataType><dtel:dataTypeLength>000000</dtel:dataTypeLength><dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals><dtel:shortFieldLabel>S</dtel:shortFieldLabel><dtel:shortFieldLength>10</dtel:shortFieldLength><dtel:shortFieldMaxLength>10</dtel:shortFieldMaxLength><dtel:mediumFieldLabel>M</dtel:mediumFieldLabel><dtel:mediumFieldLength>20</dtel:mediumFieldLength><dtel:mediumFieldMaxLength>20</dtel:mediumFieldMaxLength><dtel:longFieldLabel>L</dtel:longFieldLabel><dtel:longFieldLength>40</dtel:longFieldLength><dtel:longFieldMaxLength>40</dtel:longFieldMaxLength><dtel:headingFieldLabel>H</dtel:headingFieldLabel><dtel:headingFieldLength>55</dtel:headingFieldLength><dtel:headingFieldMaxLength>55</dtel:headingFieldMaxLength><dtel:searchHelp/><dtel:searchHelpParameter/><dtel:setGetParameter/><dtel:defaultComponentName/><dtel:deactivateInputHistory>false</dtel:deactivateInputHistory><dtel:changeDocument>false</dtel:changeDocument><dtel:leftToRightDirection>false</dtel:leftToRightDirection><dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering></dtel:dataElement></blue:wbobj>",
  "domain": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<doma:domain xmlns:doma=\"http://www.sap.com/dictionary/domain\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DOMA/DD\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><doma:content><doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>000002</doma:length><doma:decimals>000000</doma:decimals></doma:typeInformation><doma:outputInformation><doma:length>000002</doma:length><doma:style>00</doma:style><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>false</doma:lowercase><doma:ampmFormat>false</doma:ampmFormat></doma:outputInformation><doma:valueInformation><doma:valueTableRef/><doma:appendExists>false</doma:appendExists><doma:fixValues><doma:fixValue><doma:position>0001</doma:position><doma:low>A</doma:low><doma:high></doma:high><doma:text>Alfa</doma:text></doma:fixValue><doma:fixValue><doma:position>0002</doma:position><doma:low>B</doma:low><doma:high>C</doma:high><doma:text>Beta &amp; Gama</doma:text></doma:fixValue></doma:fixValues></doma:valueInformation></doma:content></doma:domain>",
  "domainDefault": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<doma:domain xmlns:doma=\"http://www.sap.com/dictionary/domain\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"DOMA/DD\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><doma:content><doma:typeInformation><doma:datatype>CHAR</doma:datatype><doma:length>000001</doma:length><doma:decimals>000000</doma:decimals></doma:typeInformation><doma:outputInformation><doma:length>000001</doma:length><doma:style>00</doma:style><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>false</doma:lowercase><doma:ampmFormat>false</doma:ampmFormat></doma:outputInformation><doma:valueInformation><doma:valueTableRef/><doma:appendExists>false</doma:appendExists><doma:fixValues></doma:fixValues></doma:valueInformation></doma:content></doma:domain>",
  "msag": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mc:messageClass xmlns:mc=\"http://www.sap.com/adt/MessageClass\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"MSAG/N\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><mc:messages mc:msgno=\"001\" mc:msgtext=\"Texto com &amp;1\" mc:selfexplainatory=\"false\" mc:documented=\"false\" adtcore:name=\"\"/><mc:messages mc:msgno=\"002\" mc:msgtext=\"Auto &lt;x&gt;\" mc:selfexplainatory=\"true\" mc:documented=\"false\" adtcore:name=\"\"/></mc:messageClass>",
  "msagVazio": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mc:messageClass xmlns:mc=\"http://www.sap.com/adt/MessageClass\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"MSAG/N\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></mc:messageClass>"
};

// Tipos acrescentados DEPOIS da migração (cada um com seu spike). O snapshot TYPES_ANTES continua
// congelado nos 16 originais — o que este teste trava é que nenhum deles mudou por tabela.
export const DEPOIS_DA_MIGRACAO = {
  tableType: { coll: '/sap/bc/adt/ddic/tabletypes', ct: 'application/vnd.sap.adt.tabletype.v1+xml', source: false },
  accessControl: { coll: '/sap/bc/adt/acm/dcl/sources', ct: 'application/vnd.sap.adt.dclSource+xml', source: true },
  package: { coll: '/sap/bc/adt/packages', ct: 'application/vnd.sap.adt.packages.v2+xml', source: false },
  functionGroupInclude: { coll: '/sap/bc/adt/functions/groups', ct: 'application/vnd.sap.adt.functions.fincludes.v2+xml', source: true },
  authorizationField: { coll: '/sap/bc/adt/aps/iam/auth', ct: 'application/vnd.sap.adt.blues.v1+xml', source: false },
  authorizationObject: { coll: '/sap/bc/adt/aps/iam/suso', ct: 'application/vnd.sap.adt.blues.v1+xml', source: false },
  lockObject: { coll: '/sap/bc/adt/ddic/lockobjects/sources', ct: 'application/vnd.sap.adt.lockobjects.v1+xml', source: false },
  transformation: { coll: '/sap/bc/adt/xslt/transformations', ct: 'application/vnd.sap.adt.transformations+xml', source: true },
  applicationLogObject: { coll: '/sap/bc/adt/applicationlog/objects', ct: 'application/vnd.sap.adt.blues.v1+xml', accept: 'application/*', source: true },
  numberRangeObject: { coll: '/sap/bc/adt/numberranges/objects', ct: 'application/vnd.sap.adt.blues.v1+xml', accept: 'application/*', source: true },
  applicationJobCatalog: { coll: '/sap/bc/adt/applicationjob/catalogs', ct: 'application/vnd.sap.adt.blues.v2+xml', accept: 'application/*', source: true },
};

test('TYPES: os 16 de antes da migração intactos, mais os acrescentados depois', () => {
  expect(Object.keys(TYPES).sort()).toEqual([...Object.keys(TYPES_ANTES), ...Object.keys(DEPOIS_DA_MIGRACAO)].sort());
  for (const [k, v] of Object.entries(TYPES_ANTES)) expect(TYPES[k], k).toEqual(v);
  for (const [k, v] of Object.entries(DEPOIS_DA_MIGRACAO)) expect(TYPES[k], k).toEqual(v);
});

test('defaultCreateBody: os 10 shells são byte-idênticos ao snapshot', () => {
  for (const [t, xml] of Object.entries(SHELLS_ANTES)) expect(defaultCreateBody(t, N, P, D), t).toBe(xml);
});

test('defaultCreateBody: tipo sem shell lança', () => {
  expect(() => defaultCreateBody('dataElement', N, P, D)).toThrow(/sem body default/);
});

test('builders XML-body: DE, domínio e MSAG byte-idênticos ao snapshot', () => {
  expect(buildDataElementBody(N, P, D, { kind: 'predefined', dataType: 'CHAR', length: 10 })).toBe(BUILDERS_ANTES.dataElementPredefined);
  expect(buildDataElementBody(N, P, D, { kind: 'domain', domain: 'ZDOM', labels: { short: 'S', medium: 'M', long: 'L', heading: 'H' } })).toBe(BUILDERS_ANTES.dataElementDomain);
  expect(buildDomainBody(N, P, D, { dataType: 'CHAR', length: 2, fixValues: [{ low: 'A', text: 'Alfa' }, { low: 'B', high: 'C', text: 'Beta & Gama' }] })).toBe(BUILDERS_ANTES.domain);
  expect(buildDomainBody(N, P, D)).toBe(BUILDERS_ANTES.domainDefault);
  expect(buildMessageClassBody(N, P, D, [{ no: '001', text: 'Texto com &1' }, { no: '002', text: 'Auto <x>', selfExplanatory: true }])).toBe(BUILDERS_ANTES.msag);
  expect(buildMessageClassBody(N, P, D, [])).toBe(BUILDERS_ANTES.msagVazio);
});

// ---------- o REGISTRO novo (tipos/index.mjs) contra os snapshots ----------
import { readdirSync, readFileSync } from 'node:fs';
import { MODULOS, TYPES as TYPES_REGISTRO, TIPOS, resolverTipo, alvoDoAdtType, todasAsLibKeys, moduloDe } from './tipos/index.mjs';
import { validarModulo } from './tipos/_registro.mjs';
import { CAMPOS_OBRIGATORIOS } from './tipos/_esquema.mjs';

test('registro: TYPES derivado dos módulos reproduz o de antes da migração (mais os acrescentados)', () => {
  expect(TYPES_REGISTRO).toEqual({ ...TYPES_ANTES, ...DEPOIS_DA_MIGRACAO });
});

test('registro: os 10 shells de create dos módulos são byte-idênticos ao snapshot', () => {
  for (const [t, xml] of Object.entries(SHELLS_ANTES)) expect(MODULOS[t].createBody(N, P, D), t).toBe(xml);
});

test('registro: builders XML-body dos módulos byte-idênticos ao snapshot', () => {
  expect(MODULOS.dataElement.body(N, P, D, { kind: 'predefined', dataType: 'CHAR', length: 10 })).toBe(BUILDERS_ANTES.dataElementPredefined);
  expect(MODULOS.dataElement.body(N, P, D, { kind: 'domain', domain: 'ZDOM', labels: { short: 'S', medium: 'M', long: 'L', heading: 'H' } })).toBe(BUILDERS_ANTES.dataElementDomain);
  expect(MODULOS.domain.body(N, P, D, { dataType: 'CHAR', length: 2, fixValues: [{ low: 'A', text: 'Alfa' }, { low: 'B', high: 'C', text: 'Beta & Gama' }] })).toBe(BUILDERS_ANTES.domain);
  expect(MODULOS.domain.body(N, P, D)).toBe(BUILDERS_ANTES.domainDefault);
  expect(MODULOS.msag.body(N, P, D, [{ no: '001', text: 'Texto com &1' }, { no: '002', text: 'Auto <x>', selfExplanatory: true }])).toBe(BUILDERS_ANTES.msag);
  expect(MODULOS.msag.body(N, P, D, [])).toBe(BUILDERS_ANTES.msagVazio);
});

// Os bodies que NÃO tinham função exportada antes (viviam inline nos deploy*): snapshot literal
// copiado à mão do adt-client.mjs anterior (deployServiceBinding / deployFunctionGroup / deployFunctionModule).
test('registro: bodies de SRVB, FUGR e FM reproduzem as strings inline de antes', () => {
  expect(MODULOS.serviceBinding.createBody('zx_snap', P, D, { srvd: 'ZX_SRVD', category: '0' })).toBe(
    `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<srvb:serviceBinding srvb:contract="C1" adtcore:name="ZX_SNAP" adtcore:type="SRVB/SVB" adtcore:description="Desc &amp; &lt;x&gt; &quot;y&quot;" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core">`
    + `<adtcore:packageRef adtcore:name="$TMP"/>`
    + `<srvb:services srvb:name="ZX_SNAP"><srvb:content srvb:version="0001" srvb:releaseState="NOT_RELEASED">`
    + `<srvb:serviceDefinition adtcore:uri="/sap/bc/adt/ddic/srvd/sources/zx_srvd" adtcore:type="SRVD/SRV" adtcore:name="ZX_SRVD"/>`
    + `<srvb:bindingTypeData><adtcore:content adtcore:encoding="base64"/></srvb:bindingTypeData>`
    + `</srvb:content></srvb:services>`
    + `<srvb:binding srvb:type="ODATA" srvb:version="V4" srvb:category="0"><srvb:implementation adtcore:name="ZX_SNAP"/></srvb:binding>`
    + `</srvb:serviceBinding>`);
  expect(MODULOS.functionGroup.createBody('zx_fg', P, D)).toBe(
    `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<group:abapFunctionGroup xmlns:group="http://www.sap.com/adt/functions/groups" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZX_FG" adtcore:type="FUGR/F" adtcore:description="Desc &amp; &lt;x&gt; &quot;y&quot;" adtcore:masterLanguage="PT"><adtcore:packageRef adtcore:name="$TMP"/></group:abapFunctionGroup>`);
  expect(MODULOS.functionModule.body('zx_fm', P, D, { group: 'zx_fg', rfc: true })).toBe(
    `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<fmodule:abapFunctionModule xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core" fmodule:processingType="rfc" adtcore:name="ZX_FM" adtcore:type="FUGR/FF" adtcore:description="Desc &amp; &lt;x&gt; &quot;y&quot;"><adtcore:containerRef adtcore:uri="/sap/bc/adt/functions/groups/zx_fg" adtcore:type="FUGR/F" adtcore:name="ZX_FG"/></fmodule:abapFunctionModule>`);
  expect(MODULOS.functionModule.body('zx_fm', P, D, { group: 'zx_fg', rfc: false })).toContain('fmodule:processingType="normal"');
  expect(MODULOS.functionModule.path('Z_X', { group: 'ZG' })).toBe('/sap/bc/adt/functions/groups/zg/fmodules/z_x');
  expect(() => MODULOS.functionModule.path('Z_X')).toThrow(/group/);
});

test('contrato: todo módulo preenche TODOS os obrigatórios e passa na validação', () => {
  expect(Object.keys(MODULOS)).toHaveLength(27);
  for (const [k, m] of Object.entries(MODULOS)) {
    expect(() => validarModulo(m, `${k}.mjs`), k).not.toThrow();
    for (const c of CAMPOS_OBRIGATORIOS) expect(m[c], `${k}.${c}`).toBeDefined();
    expect(m.oQueFaz.length, `${k}.oQueFaz`).toBeGreaterThan(20);
    expect(m.comoTrata.length, `${k}.comoTrata`).toBeGreaterThan(20);
  }
  expect(() => moduloDe('bolacha')).toThrow(/desconhecido/);
});

test('isolamento: nenhum módulo de tipo importa adt-client.mjs (ciclo com top-level await)', () => {
  for (const f of readdirSync('tipos').filter((f) => f.endsWith('.mjs'))) {
    const src = readFileSync(`tipos/${f}`, 'utf8');
    expect(/from\s+['"][^'"]*adt-client\.mjs['"]/.test(src), f).toBe(false);
  }
});

test('todo módulo de tipo tem teste irmão e a anotação @type ModuloDeTipo', () => {
  const arquivos = readdirSync('tipos');
  const modulos = arquivos.filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'index.mjs' && !f.endsWith('.test.mjs'));
  expect(modulos).toHaveLength(27);
  for (const f of modulos) {
    const irmao = f.replace(/\.mjs$/, '.test.mjs');
    expect(arquivos.includes(irmao), `${f} sem ${irmao} — a prova viaja com o módulo`).toBe(true);
    const src = readFileSync(`tipos/${f}`, 'utf8');
    expect(src.includes("@type {import('./_esquema.mjs').ModuloDeTipo}"), `${f} sem @type ModuloDeTipo`).toBe(true);
  }
});

import { tiposNoDiscovery } from './probe.mjs';
test('tiposNoDiscovery: casa coll dos módulos com os href do discovery (path completo ou relativo)', () => {
  const xml = '<app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace>'
    + '<app:collection href="/sap/bc/adt/ddic/ddlx/sources"><app:accept>application/vnd.sap.adt.ddic.ddlx.v1+xml</app:accept></app:collection>'
    + '<app:collection href="/sap/bc/adt/ddic/tables"/><app:collection href="/sap/bc/adt/functions/groups"/>'
    + '</app:workspace></app:service>';
  const r = tiposNoDiscovery(xml);
  expect(r.metadataExtension.ok).toBe(true);
  expect(r.table.ok).toBe(true);
  expect(r.functionGroup.ok).toBe(true);
  expect(r.functionModule.ok).toBe(true);          // aninhado: responde pelo contêiner
  expect(r.serviceBinding.ok).toBe(false);         // ausente = o sistema não oferece o tipo
  expect(r.serviceBinding.motivo).toMatch(/businessservices/);
});

test('dicaDeErro chega ao chamador: deploy anexa a dica do módulo ao erro', async () => {
  await expect(deployServiceBinding(conexaoMuda, { name: 'Z_X', srvd: 'Z_S' })).rejects.toThrow(/exige description/);
  // um erro "(400) Falta a descrição" vindo do SAP ganharia a dica do módulo; aqui simulamos pelo dicaDeErro puro
  const { MODULOS: M } = await import('./tipos/index.mjs');
  const { dicaDeErro } = await import('./tipos/_registro.mjs');
  expect(dicaDeErro(M.serviceBinding, new Error('create binding Z_X falhou (400): Falta a descrição para Z_X'))).toMatch(/description/);
  expect(dicaDeErro(M.functionModule, new Error('callFunction falhou (500): kernel rc=9'))).toMatch(/PUT do metadata/);
  expect(dicaDeErro(M.table, new Error('create X falhou (422): AD(102)'))).toMatch(/16 caracteres/);
});

test('nomeacao: deploy recusa nome de tabela acima de 16 antes de qualquer rede', async () => {
  await expect(deploy(conexaoMuda, 'table', { name: 'ZTB_NOME_MUITO_COMPRIDO_X', source: '' })).rejects.toThrow(/aceita até 16/);
  await expect(deploySource(conexaoMuda, { type: 'table', name: 'ZTB_NOME_MUITO_COMPRIDO_X', source: '' })).rejects.toThrow(/aceita até 16/);
});

test('resolução cobre os 27 tipos (sinônimos em português, códigos, plural)', () => {
  const lk = (e) => resolverTipo(e).alvos.map((a) => a.libKey);
  expect(lk('estrutura')).toEqual(['structure']);
  expect(lk('tabl')).toEqual(['structure', 'table']);        // código TABL → os dois alvos (mudança medida)
  expect(lk('tabelas')).toEqual(['table']);
  expect(lk('domínio')).toEqual(['domain']);
  expect(lk('elemento de dados')).toEqual(['dataElement']);
  expect(lk('função')).toEqual(['functionModule']);
  expect(lk('funções')).toEqual(['functionModule']);
  expect(lk('fm')).toEqual(['functionModule']);
  expect(lk('grupo de funções')).toEqual(['functionGroup']);
  expect(lk('fugr')).toEqual(['functionGroup', 'functionGroupInclude', 'functionModule']);
  expect(lk('include de fugr')).toEqual(['functionGroupInclude']);
  expect(lk('finclude')).toEqual(['functionGroupInclude']);
  expect(lk('prog')).toEqual(['include', 'prog']);
  expect(lk('programa')).toEqual(['include', 'prog']);
  expect(lk('report')).toEqual(['prog']);
  expect(lk('include')).toEqual(['include']);
  expect(lk('srvb')).toEqual(['serviceBinding']);
  expect(lk('service binding')).toEqual(['serviceBinding']);
  expect(lk('srvd')).toEqual(['serviceDefinition']);
  expect(lk('ddlx')).toEqual(['metadataExtension']);
  expect(lk('metadata extension')).toEqual(['metadataExtension']);
  expect(lk('bdef')).toEqual(['behaviorDefinition']);
  expect(lk('cds')).toEqual(['cds']);
  expect(lk('classes')).toEqual(['class']);
  expect(lk('interfaces')).toEqual(['interface']);
  expect(lk('mensagens')).toEqual(['msag']);
  for (const m of Object.values(MODULOS)) expect(alvoDoAdtType(m.adtType)?.libKey, m.adtType).toBe(m.libKey);
  expect(lk('table type')).toEqual(['tableType']);
  expect(lk('ttyp')).toEqual(['tableType']);
  expect(lk('dcl')).toEqual(['accessControl']);
  expect(lk('access control')).toEqual(['accessControl']);
  expect(lk('controle de acesso')).toEqual(['accessControl']);
  expect(lk('pacote')).toEqual(['package']);
  expect(lk('pacotes')).toEqual(['package']);
  expect(lk('devc')).toEqual(['package']);
  expect(lk('lock object')).toEqual(['lockObject']);
  expect(lk('objeto de bloqueio')).toEqual(['lockObject']);
  expect(lk('enqu')).toEqual(['lockObject']);
  expect(lk('xslt')).toEqual(['transformation']);
  expect(lk('simple transformation')).toEqual(['transformation']);
  expect(lk('transformação')).toEqual(['transformation']);
  expect(lk('aplo')).toEqual(['applicationLogObject']);
  expect(lk('slg0')).toEqual(['applicationLogObject']);
  expect(lk('objeto de log')).toEqual(['applicationLogObject']);
  expect(lk('nrob')).toEqual(['numberRangeObject']);
  expect(lk('snro')).toEqual(['numberRangeObject']);
  expect(lk('objeto de numeração')).toEqual(['numberRangeObject']);
  expect(lk('sajc')).toEqual(['applicationJobCatalog']);
  expect(lk('job catalog')).toEqual(['applicationJobCatalog']);
  expect(lk('catálogo de job')).toEqual(['applicationJobCatalog']);
  expect(todasAsLibKeys()).toHaveLength(25);
  expect(todasAsLibKeys()).not.toContain('functionModule');
  expect(Object.keys(TIPOS).sort()).toEqual(['APLO', 'AUTH', 'BDEF', 'CLAS', 'DCLS', 'DDLS', 'DDLX', 'DEVC', 'DOMA', 'DTEL', 'ENQU', 'FUGR', 'INTF', 'MSAG', 'NROB', 'PROG', 'SAJC', 'SRVB', 'SRVD', 'SUSO', 'TABL', 'TTYP', 'XSLT']);
});

// ---------- guard-rails ANTES da rede: a conexão falsa lança se alguém pedir sessão ----------
import { deploySource, deployBody, deploy, deployFunctionModule, deployServiceBinding, objPath } from './adt-client.mjs';

const conexaoMuda = { sessao: async () => { throw new Error('REDE: sessao() chamada antes do guard-rail'); }, sessaoStateless: async () => { throw new Error('REDE'); } };

test('objPath: genérico é coll/<name>; FM é aninhado e exige group', () => {
  expect(objPath('table', 'ZTB_X')).toBe('/sap/bc/adt/ddic/tables/ztb_x');
  expect(objPath('functionModule', 'z_x', { group: 'zg' })).toBe('/sap/bc/adt/functions/groups/zg/fmodules/z_x');
  expect(() => objPath('functionModule', 'z_x')).toThrow(/group/);
  expect(() => objPath('bolacha', 'z_x')).toThrow(/desconhecido/);
});

test('deploySource recusa tipo sem source e o FM (aninhado), sem tocar a rede', async () => {
  await expect(deploySource(conexaoMuda, { type: 'functionModule', name: 'Z_X', source: '' })).rejects.toThrow(/não é source-based/);
  await expect(deploySource(conexaoMuda, { type: 'dataElement', name: 'Z_X', source: '' })).rejects.toThrow(/não é source-based/);
  await expect(deploySource(conexaoMuda, { type: 'table', name: 'SAPTAB', source: '' })).rejects.toThrow(/GUARD-RAIL/);
  await expect(deployBody(conexaoMuda, { type: 'table', name: 'Z_X' })).rejects.toThrow(/não é XML-body/);
});

test('deploy: assertZY e validar do tipo rodam antes de qualquer rede', async () => {
  await expect(deploy(conexaoMuda, 'table', { name: 'TAB_SAP' })).rejects.toThrow(/GUARD-RAIL/);
  await expect(deployFunctionModule(conexaoMuda, { group: 'SAPL', name: 'Z_X', source: '' })).rejects.toThrow(/GUARD-RAIL: "SAPL"/);
  await expect(deployFunctionModule(conexaoMuda, { name: 'Z_X', source: '' })).rejects.toThrow(/exige \{ group \}/);
  await expect(deployServiceBinding(conexaoMuda, { name: 'Z_X', srvd: 'Z_S' })).rejects.toThrow(/exige description/);
  await expect(deploy(conexaoMuda, 'bolacha', { name: 'Z_X' })).rejects.toThrow(/desconhecido/);
  // lock object: o E é do SAP, o Z/Y vem depois — EMMARAE é padrão (recusado), YJBV_… não tem o E (recusado)
  await expect(deploy(conexaoMuda, 'lockObject', { name: 'EMMARAE', def: { table: 'MARA', parameters: ['MANDT'] } })).rejects.toThrow(/não é objeto Z\/Y/);
  await expect(deploy(conexaoMuda, 'lockObject', { name: 'YJBV_POC_LK', def: { table: 'YT', parameters: ['MANDT'] } })).rejects.toThrow(/precisa começar por E/);
  await expect(deploy(conexaoMuda, 'lockObject', { name: 'EYJBV_POC_LK_LONGO_DEMAIS', def: { table: 'YT', parameters: ['MANDT'] } })).rejects.toThrow(/aceita até 16/);
});
