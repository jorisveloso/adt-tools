// parsers.test.mjs — cobre o que dá para testar SEM VPN: os parsers de XML e o vocabulário de tipos.
//
//   npm test
//
// O resto (rede, sessão, gravação) só é exercitável contra um SAP de verdade — ver README.

import { test, expect } from 'vitest';
import { parseObjectReferences, parseUsageReferences } from './search.mjs';
import { montarMeta } from './layout.mjs';
import { resolverTipo, codigoDaLibKey, normalizar } from './tipos/index.mjs';
import {
  parseUnitResult, parseDataPreview, parseCoverage, activationMessages, assertReadOnly, assertZY,
} from './adt-client.mjs';

// Resposta típica do information system search.
const XML_BUSCA = `<?xml version="1.0" encoding="utf-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/tables/ztb_pedido" adtcore:type="TABL/DT" adtcore:name="ZTB_PEDIDO" adtcore:packageName="ZPACOTE1" adtcore:description="Cabeçalho de pedido"/>
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/zcl_pedido" adtcore:type="CLAS/OC" adtcore:name="ZCL_PEDIDO" adtcore:packageName="ZPACOTE1" adtcore:description="Regras de pedido"/>
</adtcore:objectReferences>`;

// GET de um objeto. O PACOTE está no filho packageRef — nunca na raiz. É a armadilha deste parser.
const XML_OBJETO = `<?xml version="1.0" encoding="UTF-8"?>
<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:responsible="TESTUSER" adtcore:masterLanguage="PT" adtcore:name="ZTB_PEDIDO" adtcore:type="TABL/DT"
  adtcore:changedAt="2026-07-30T12:00:00Z" adtcore:version="active" adtcore:createdAt="2026-07-01T00:00:00Z"
  adtcore:changedBy="TESTUSER" adtcore:createdBy="TESTUSER" adtcore:description="Cabeçalho de pedido">
  <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/zpacote1" adtcore:type="DEVC/K" adtcore:name="ZPACOTE1"/>
</blue:blueSource>`;

test('busca: extrai cada objectReference', () => {
  const itens = parseObjectReferences(XML_BUSCA);
  expect(itens.length).toBe(2);
  expect(itens[0]).toEqual({
    nome: 'ZTB_PEDIDO', tipo: 'TABL/DT', pacote: 'ZPACOTE1',
    descricao: 'Cabeçalho de pedido', uri: '/sap/bc/adt/ddic/tables/ztb_pedido',
  });
});

test('busca: resposta vazia não quebra', () => {
  expect(parseObjectReferences('<adtcore:objectReferences/>')).toEqual([]);
});

// Where-used real do SXD 816 (04/09/2026), reduzido: um container de estrutura com o campo dentro
// (a ocorrência), um FM que veio COLAPSADO e um pacote. É o formato que o parser tem de aguentar —
// nós aninhados, e nome/tipo/pacote só no filho adtObject.
const XML_USOS = `<?xml version="1.0" encoding="utf-8"?><usagereferences:usageReferenceResult numberOfResults="12" resultDescription="[SXD] Verwendungsnachweis: J_1BNFNUM_UTILITIES (Data Element)" referencedObjectIdentifier="" xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:scope><usagereferences:objectIdentifier displayName="J_1BNFNUM_UTILITIES (Data Element)" globalType="DTEL/DE"/></usagereferences:scope><usagereferences:referencedObjects><usagereferences:referencedObject uri="/sap/bc/adt/ddic/structures/bapi_j_1bnfdoc" parentUri="/sap/bc/adt/packages/j1ba" isResult="false" canHaveChildren="false"><usagereferences:adtObject adtcore:responsible="SAP" adtcore:name="BAPI_J_1BNFDOC" adtcore:type="TABL/DS" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/j1ba" adtcore:type="DEVC/K" adtcore:name="J1BA"/></usagereferences:adtObject></usagereferences:referencedObject><usagereferences:referencedObject uri="/sap/bc/adt/ddic/structures/bapi_j_1bnfdoc/source/main#type=TABL%2FDSF;name=NFNUM_UTILITIES" parentUri="/sap/bc/adt/ddic/structures/bapi_j_1bnfdoc" isResult="true" canHaveChildren="false" usageInformation="gradeDirect,includeProductive"><usagereferences:adtObject adtcore:name="NFNUM_UTILITIES" adtcore:type="TABL/DSF" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/j1ba" adtcore:type="DEVC/K" adtcore:name="J1BA"/></usagereferences:adtObject></usagereferences:referencedObject><usagereferences:referencedObject uri="/sap/bc/adt/functions/groups/j1bb2/fmodules/j_1b_nf_unique_for_vendor" parentUri="/sap/bc/adt/functions/groups/j1bb2" isResult="false" canHaveChildren="true" usageInformation="gradeDirect,includeProductive"><usagereferences:adtObject adtcore:name="J_1B_NF_UNIQUE_FOR_VENDOR" adtcore:type="FUGR/FF" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/j1ba" adtcore:type="DEVC/K" adtcore:name="J1BA"/></usagereferences:adtObject></usagereferences:referencedObject></usagereferences:referencedObjects></usagereferences:usageReferenceResult>`;

test('where-used: nome, tipo e pacote vêm do adtObject filho, não da tag de fora', () => {
  const r = parseUsageReferences(XML_USOS);
  expect(r.refs.length).toBe(3);
  expect(r.refs[1]).toEqual({
    uri: '/sap/bc/adt/ddic/structures/bapi_j_1bnfdoc/source/main#type=TABL%2FDSF;name=NFNUM_UTILITIES',
    uriPai: '/sap/bc/adt/ddic/structures/bapi_j_1bnfdoc',
    nome: 'NFNUM_UTILITIES', tipo: 'TABL/DSF', pacote: 'J1BA', responsavel: '',
    ocorrencia: true, temFilhos: false, uso: 'gradeDirect,includeProductive',
  });
});

test('where-used: container não é uso — só o isResult="true" conta', () => {
  const r = parseUsageReferences(XML_USOS);
  const usos = r.refs.filter((x) => x.ocorrencia);
  expect(usos.length).toBe(1);
  expect(r.refs[0].nome).toBe('BAPI_J_1BNFDOC');
  expect(r.refs[0].ocorrencia).toBe(false);
});

// O que faz uma lista incompleta parecer completa: o servidor anuncia 12 e manda 1 expandido,
// porque o resto está atrás de nós canHaveChildren que ele não abriu.
test('where-used: nó colapsado é sinalizado, e o total anunciado não é o que veio', () => {
  const r = parseUsageReferences(XML_USOS);
  expect(r.total).toBe(12);
  const colapsados = r.refs.filter((x) => x.temFilhos);
  expect(colapsados.map((x) => x.nome)).toEqual(['J_1B_NF_UNIQUE_FOR_VENDOR']);
  expect(r.total).toBeGreaterThan(r.refs.filter((x) => x.ocorrencia).length);
});

test('where-used: escopo diz sobre qual objeto é o resultado', () => {
  const r = parseUsageReferences(XML_USOS);
  expect(r.escopo).toEqual({ nome: 'J_1BNFNUM_UTILITIES (Data Element)', globalType: 'DTEL/DE' });
});

test('where-used: resposta sem usos não quebra', () => {
  const r = parseUsageReferences('<usagereferences:usageReferenceResult numberOfResults="0"/>');
  expect(r.refs).toEqual([]);
  expect(r.total).toBe(0);
});


// A MESMA resposta, do s4h 758 (recorte real do where-used de MATNR, 04/09/2026): o prefixo do
// namespace vem em camelCase, e cada nó traz um <objectIdentifier> SEM prefixo. Prender o parser ao
// prefixo do SXD lia 41.226 usos como zero, com status 200 — o teste existe para isso não voltar.
const XML_USOS_CAMEL = `<?xml version="1.0" encoding="utf-8"?><usageReferences:usageReferenceResult numberOfResults="41226" resultDescription="[S4H] Verwendungsnachweis: MATNR (Elemento de dados)" referencedObjectIdentifier="" xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences"><usageReferences:referencedObjects><usageReferences:referencedObject uri="/sap/bc/adt/aps/iam/auth/%2faccgo%2fmat" parentUri="/sap/bc/adt/packages/%2faccgo%2fcommon" isResult="false" canHaveChildren="true" usageInformation="gradeDirect,includeProductive"><usageReferences:adtObject adtcore:responsible="SAP" adtcore:name="/ACCGO/MAT" adtcore:type="AUTH" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/%2faccgo%2fcommon" adtcore:type="DEVC/K" adtcore:name="/ACCGO/COMMON"/></usageReferences:adtObject><objectIdentifier>BlueAUTH;/ACCGO/MAT;\DTEL/DE:MATNR;2</objectIdentifier></usageReferences:referencedObject></usageReferences:referencedObjects></usageReferences:usageReferenceResult>`;

test('where-used: o prefixo do namespace muda por sistema — o parser lê pelo nome local', () => {
  const r = parseUsageReferences(XML_USOS_CAMEL);
  expect(r.total).toBe(41226);
  expect(r.refs.length).toBe(1);
  expect(r.refs[0].nome).toBe('/ACCGO/MAT');
  expect(r.refs[0].tipo).toBe('AUTH');
  expect(r.refs[0].pacote).toBe('/ACCGO/COMMON');
  expect(r.refs[0].temFilhos).toBe(true);
});

// O <objectIdentifier> sem prefixo é do NÓ, não do escopo: casar com ele daria um escopo inventado.
test('where-used: objectIdentifier sem prefixo não vira escopo', () => {
  expect(parseUsageReferences(XML_USOS_CAMEL).escopo).toEqual({ nome: '', globalType: '' });
});

test('meta: pacote vem do packageRef, NÃO do nome da raiz', () => {
  const m = montarMeta({ nome: 'ztb_pedido', codigo: 'TABL', libKey: 'table', xml: XML_OBJETO, temFonte: true });
  expect(m.pacote).toBe('ZPACOTE1');
  expect(m.pacote).not.toBe('ZTB_PEDIDO');
});

test('meta: adtType é o da raiz, não o DEVC/K do packageRef', () => {
  const m = montarMeta({ nome: 'ztb_pedido', codigo: 'TABL', libKey: 'table', xml: XML_OBJETO, temFonte: true });
  expect(m.adtType).toBe('TABL/DT');
});

test('meta: nome sempre em maiúsculas, e os campos de auditoria vêm juntos', () => {
  const m = montarMeta({ nome: 'ztb_pedido', codigo: 'TABL', libKey: 'table', xml: XML_OBJETO, temFonte: true });
  expect(m.nome).toBe('ZTB_PEDIDO');
  expect(m.descricao).toBe('Cabeçalho de pedido');
  expect(m.masterLanguage).toBe('PT');
  expect(m.responsavel).toBe('TESTUSER');
  expect(m.versao).toBe('active');
});

test('meta: objeto SEM fonte guarda o XML cru — é o único registro que sobra dele', () => {
  const comFonte = montarMeta({ nome: 'x', codigo: 'TABL', libKey: 'table', xml: XML_OBJETO, temFonte: true });
  const semFonte = montarMeta({ nome: 'x', codigo: 'DTEL', libKey: 'dataElement', xml: XML_OBJETO, temFonte: false });
  expect(comFonte.xmlAdt).toBe(undefined);
  expect(semFonte.xmlAdt).toBe(XML_OBJETO);
});

test('tipos: sinônimo, acento e caixa caem no mesmo código', () => {
  for (const e of ['TABL', 'tabela', 'Table', 'TAB']) {
    expect(resolverTipo(e).codigo).toBe('TABL');
  }
  expect(normalizar('Relatório')).toBe('relatorio');
});

test('tipos: PROG abre em dois alvos; REPORT e INCLUDE recortam um só', () => {
  expect(resolverTipo('prog').alvos.length).toBe(2);
  expect(resolverTipo('report').alvos).toEqual([{ libKey: 'prog', adtType: 'PROG/P' }]);
  expect(resolverTipo('include').alvos).toEqual([{ libKey: 'include', adtType: 'PROG/I' }]);
  // recorte não muda o código canônico — report e include moram na MESMA pasta PROG
  expect(resolverTipo('report').codigo).toBe('PROG');
  expect(resolverTipo('include').codigo).toBe('PROG');
});

test('tipos: desconhecido falha listando os aceitos, nunca busca no escuro', () => {
  expect(() => resolverTipo('bolacha')).toThrow(/não reconhecido[\s\S]*TABL/);
});

test('tipos: caminho inverso libKey → código', () => {
  expect(codigoDaLibKey('table')).toBe('TABL');
  expect(codigoDaLibKey('include')).toBe('PROG');
  expect(codigoDaLibKey('inexistente')).toBe(null);
});

// ---------- adt-client: parsers puros e guard-rails ----------
// Vieram do maestro na fusão do adt-client. Os dois primeiros cobrem BUGS que a versão anterior tinha.

// Dois métodos passaram (auto-fechados) e um falhou. O regex guloso de antes fundia o primeiro
// <testMethod/> com o </testMethod> do terceiro e contava 1 método em vez de 3.
const XML_AUNIT = `<?xml version="1.0" encoding="utf-8"?>
<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit">
  <program adtcore:name="ZCL_X" xmlns:adtcore="http://www.sap.com/adt/core">
    <testClasses>
      <testClass adtcore:name="LTC_X" xmlns:adtcore="http://www.sap.com/adt/core">
        <testMethods>
          <testMethod adtcore:uri="/sap/bc/adt/oo/classes/zcl_x#type=CLAS%2FOLD;name=LTC_X;testclass=LTC_X" adtcore:name="PRIMEIRO" xmlns:adtcore="http://www.sap.com/adt/core"/>
          <testMethod adtcore:uri="/sap/bc/adt/oo/classes/zcl_x#testclass=LTC_X" adtcore:name="SEGUNDO" xmlns:adtcore="http://www.sap.com/adt/core"/>
          <testMethod adtcore:uri="/sap/bc/adt/oo/classes/zcl_x#testclass=LTC_X" adtcore:name="TERCEIRO" xmlns:adtcore="http://www.sap.com/adt/core">
            <alert kind="failedAssertion" severity="critical">
              <title>Critical Assertion Error: 'Esperado 3'</title>
              <detail text="Esperado [3] mas veio [2]"/>
              <stack><stackEntry adtcore:uri="/sap/bc/adt/oo/classes/zcl_x#start=42"/></stack>
            </alert>
          </testMethod>
        </testMethods>
      </testClass>
    </testClasses>
  </program>
</aunit:runResult>`;

test('aunit: <testMethod/> auto-fechado conta como método (regex lazy, não guloso)', () => {
  const r = parseUnitResult(XML_AUNIT);
  expect(r.executed).toBe(3);
  expect(r.passed).toBe(2);
  expect(r.failed).toBe(1);
  expect(r.methods.map((m) => m.name)).toEqual(['PRIMEIRO', 'SEGUNDO', 'TERCEIRO']);
});

test('aunit: a falha traz título, detalhe e linha; e o testclass sai da uri', () => {
  const { failures, methods } = parseUnitResult(XML_AUNIT);
  expect(failures.length).toBe(1);
  expect(failures[0].name).toBe('TERCEIRO');
  expect(failures[0].alerts[0].title).toMatch(/Esperado 3/);
  expect(failures[0].alerts[0].details).toEqual(['Esperado [3] mas veio [2]']);
  expect(failures[0].alerts[0].at).toBe('42');
  expect(methods[0].testClass).toBe('LTC_X');
});

test('aunit: nenhum testMethod → executed 0 (que NUNCA é sucesso, ver runUnitTests)', () => {
  expect(parseUnitResult('<aunit:runResult/>').executed).toBe(0);
});

// `activationExecuted="true"` convive com erro E — era isso que passava como "ativado".
test('activation: mensagem type="E" é extraída (é ela que derruba o ok do activateMany)', () => {
  const xml = `<chkl:messages xmlns:chkl="http://www.sap.com/adt/checklist">
    <msg objDescr="ZTB_X" type="E" line="0"><shortText><txt>Ativação cancelada</txt></shortText></msg>
    <msg objDescr="ZTB_X" type="W" line="0"><shortText><txt>Campo sem elemento de dados</txt></shortText></msg>
  </chkl:messages>`;
  const msgs = activationMessages(xml);
  expect(msgs).toEqual([
    { type: 'E', text: 'Ativação cancelada' },
    { type: 'W', text: 'Campo sem elemento de dados' },
  ]);
  expect(msgs.some((m) => m.type === 'E')).toBe(true);
});

// A resposta do datapreview é COLUMN-oriented: N colunas, cada uma com suas células na ordem das linhas.
const XML_PREVIEW = `<?xml version="1.0" encoding="utf-8"?>
<dataPreview:tableData xmlns:dataPreview="http://www.sap.com/adt/dataPreview">
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="MANDT" dataPreview:type="C"/>
    <dataPreview:dataSet><dataPreview:data>100</dataPreview:data><dataPreview:data>100</dataPreview:data></dataPreview:dataSet>
  </dataPreview:columns>
  <dataPreview:columns>
    <dataPreview:metadata dataPreview:name="DESCR" dataPreview:type="C"/>
    <dataPreview:dataSet><dataPreview:data>Pedido &amp; entrega</dataPreview:data><dataPreview:data/></dataPreview:dataSet>
  </dataPreview:columns>
</dataPreview:tableData>`;

test('dataPreview: transpõe colunas em linhas, decodifica entidade e trata célula vazia', () => {
  const { columns, rows } = parseDataPreview(XML_PREVIEW);
  expect(columns).toEqual(['MANDT', 'DESCR']);
  expect(rows).toEqual([
    { MANDT: '100', DESCR: 'Pedido & entrega' },
    { MANDT: '100', DESCR: '' },
  ]);
});

test('dataPreview: resultado sem linhas não quebra', () => {
  expect(parseDataPreview('<dataPreview:tableData/>')).toEqual({ columns: [], rows: [] });
});

// XML REAL da medição de cobertura (S4H 758, 2026-08-31, classe YJBV_POC_CL_COV31 com 2 dos 3
// métodos exercitados). É uma ÁRVORE: raiz → programa → métodos, e cada nível repete os números.
const COV_ARVORE = `<?xml version="1.0" encoding="utf-8"?><cov:result name="ADT_ROOT_NODE" xmlns:cov="http://www.sap.com/adt/cov"><nodes><node><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/yjbv_poc_cl_cov31/source/main#start=8,6" adtcore:type="CLAS/OCI" adtcore:name="YJBV_POC_CL_COV31=============CP" xmlns:adtcore="http://www.sap.com/adt/core"/><coverages><coverage type="branch" total="7" executed="4"/><coverage type="procedure" total="3" executed="2"/><coverage type="statement" total="12" executed="6"/></coverages><nodes><node><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/yjbv_poc_cl_cov31/source/main#start=8,6" adtcore:type="CLAS/OCI" adtcore:name="YJBV_POC_CL_COV31" xmlns:adtcore="http://www.sap.com/adt/core"/><coverages><coverage type="branch" total="7" executed="4"/><coverage type="procedure" total="3" executed="2"/><coverage type="statement" total="12" executed="6"/></coverages><nodes><node><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/yjbv_poc_cl_cov31/source/main#start=13,9" adtcore:type="CLAS/OM" adtcore:name="CLASSIFICAR" xmlns:adtcore="http://www.sap.com/adt/core"/><coverages><coverage type="branch" total="5" executed="3"/><coverage type="procedure" total="1" executed="1"/><coverage type="statement" total="6" executed="4"/></coverages></node><node><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/yjbv_poc_cl_cov31/source/main#start=23,9" adtcore:type="CLAS/OM" adtcore:name="NUNCA_CHAMADO" xmlns:adtcore="http://www.sap.com/adt/core"/><coverages><coverage type="branch" total="1" executed="0"/><coverage type="procedure" total="1" executed="0"/><coverage type="statement" total="4" executed="0"/></coverages></node><node><adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/yjbv_poc_cl_cov31/source/main#start=9,9" adtcore:type="CLAS/OM" adtcore:name="SOMAR" xmlns:adtcore="http://www.sap.com/adt/core"/><coverages><coverage type="branch" total="1" executed="1"/><coverage type="procedure" total="1" executed="1"/><coverage type="statement" total="2" executed="2"/></coverages></node></nodes></node></nodes></node></nodes></cov:result>`;
export { COV_ARVORE };

test('cobertura: soma os blocos por tipo e calcula o percentual', () => {
  const xml = `<cov:result xmlns:cov="http://www.sap.com/adt/cov">
    <coverage type="statement" total="80" executed="60"/>
    <coverage type="statement" total="20" executed="15"/>
    <coverage type="branch" total="0" executed="0"/>
  </cov:result>`;
  const c = parseCoverage(xml);
  expect(c.statement).toEqual({ total: 100, executed: 75, percent: 75 });
  expect(c.branch.percent).toBe(null); // total 0 → percentual não existe, e não é 0%
});

// A resposta REAL é uma ÁRVORE e cada nível repete os mesmos números (S4H 758, 2026-08-31):
// somar o XML inteiro contava cada statement 3× (12+12+12). O total certo é o da raiz.
test('cobertura: a árvore não é somada nível a nível — vale a raiz', () => {
  const c = parseCoverage(COV_ARVORE);
  expect(c.statement).toEqual({ total: 12, executed: 6, percent: 50 });
  expect(c.procedure).toEqual({ total: 3, executed: 2, percent: 66.67 });
});

test('guard-rail: dataPreview aceita SELECT/WITH e recusa escrita', () => {
  expect(assertReadOnly('  select * from ztb_pedido ')).toBe('select * from ztb_pedido');
  expect(assertReadOnly('WITH x AS (SELECT 1) SELECT * FROM x')).toMatch(/^WITH/);
  expect(() => assertReadOnly('DELETE FROM ztb_pedido')).toThrow(/só leitura/);
  expect(() => assertReadOnly('UPDATE ztb SET a = 1')).toThrow(/só leitura/);
  // começa com SELECT mas embute escrita — recusado pelo segundo teste, não pelo primeiro
  expect(() => assertReadOnly('SELECT * FROM t WHERE x = 1; DROP TABLE t')).toThrow(/escrita\/DDL/);
  expect(() => assertReadOnly('')).toThrow(/SELECT\/WITH/);
});

test('guard-rail: só Z/Y é aceito para criar ou alterar', () => {
  expect(() => assertZY('ZTB_PEDIDO')).not.toThrow();
  expect(() => assertZY('ycl_x')).not.toThrow();
  expect(() => assertZY('MARA')).toThrow(/GUARD-RAIL/);
});
