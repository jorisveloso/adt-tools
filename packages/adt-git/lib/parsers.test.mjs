// parsers.test.mjs — cobre o que dá para testar SEM VPN: os parsers de XML e o vocabulário de tipos.
//
//   npm test
//
// O resto (rede, sessão, gravação) só é exercitável contra um SAP de verdade — ver README.

import { test, expect } from 'vitest';
import { parseObjectReferences } from './search.mjs';
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
