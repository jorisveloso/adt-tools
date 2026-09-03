// atc.test.mjs — os parsers e o construtor do ATC, sem SAP.
//
// As fixtures são RESPOSTAS REAIS capturadas no S4H rel. 758, mandante 250, em 2026-08-31, sobre as
// cobaias `YJBV_POC_CL_ATCB` (suja de propósito) e `YJBV_POC_CL_ATCG` (limpa), recortadas nos
// atributos que a lib lê. Ver docs/receita-atc.md.
//
//   npm test

import { test, expect } from 'vitest';
import { buildRunBody, parseFindingStats, parseWorklist, parseWorklistId, uriDoAlvo, formatarFindings } from './atc.mjs';

// O worklistRun do POST /atc/runs sobre a classe suja com ABAP_CLOUD_READINESS.
const XML_RUN = `<?xml version="1.0" encoding="utf-8"?><atcworklist:worklistRun xmlns:atcworklist="http://www.sap.com/adt/atc/worklist"><atcworklist:worklistId>00505683746F1FD1A9A821AD175C2000</atcworklist:worklistId><atcworklist:worklistTimestamp>2026-08-31T15:37:17Z</atcworklist:worklistTimestamp><atcworklist:infos><atcinfo:info xmlns:atcinfo="http://www.sap.com/adt/atc/info"><atcinfo:type>FINDING_STATS</atcinfo:type><atcinfo:description>6,0,0</atcinfo:description></atcinfo:info></atcworklist:infos></atcworklist:worklistRun>`;

// A worklist da classe suja: dois findings recortados dos seis (um por check).
const XML_SUJA = `<?xml version="1.0" encoding="utf-8"?><atcworklist:worklist atcworklist:id="00505683746F1FD1A9A821AD175C2000" atcworklist:timestamp="2026-08-31T15:37:17Z" xmlns:atcworklist="http://www.sap.com/adt/atc/worklist"><atcworklist:objectSets><atcworklist:objectSet atcworklist:name="99999999999999999999999999999999" atcworklist:title="Letzter Pr&#252;flauf" atcworklist:kind="LAST_RUN"/></atcworklist:objectSets><atcworklist:objects><atcobject:object adtcore:uri="/sap/bc/adt/atc/objects/R3TR/CLAS/YJBV_POC_CL_ATCB" adtcore:type="CLAS" adtcore:name="YJBV_POC_CL_ATCB" adtcore:packageName="$TMP" atcobject:author="MVJVELOSO" xmlns:atcobject="http://www.sap.com/adt/atc/object" xmlns:adtcore="http://www.sap.com/adt/core"><atcobject:findings><atcfinding:finding adtcore:uri="/sap/bc/adt/atc/findings/itemid/00505683746F1FD1A9A82273E585C000/index/405" atcfinding:location="/sap/bc/adt/oo/classes/yjbv_poc_cl_atcb/source/main#type=CLAS%2FOM;name=IF_OO_ADT_CLASSRUN%7eMAIN;start=6" atcfinding:processor="MVJVELOSO" atcfinding:priority="1" atcfinding:checkId="51B937545CCD6BD44D8879072AB810B3" atcfinding:checkTitle="Vers&#227;o de idioma ABAP (sintaxe)" atcfinding:messageId="2728" atcfinding:messageTitle="Erro de sintaxe em escopo de idioma restringido (Open SQL)" atcfinding:exemptionApproval="" atcfinding:exemptionKind="" atcfinding:quickfixInfo="atc:00505683746F1FD1A9A82273E585C000,405" atcfinding:noExemption="true" xmlns:atcfinding="http://www.sap.com/adt/atc/finding"><atom:link href="/sap/bc/adt/documentation/atc/documents/itemid/00505683746F1FD1A9A82273E585C000/index/405" rel="http://www.sap.com/adt/relations/documentation" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/></atcfinding:finding><atcfinding:finding adtcore:uri="/sap/bc/adt/atc/findings/itemid/00505683746F1FD1A9A82273E585C000/index/408" atcfinding:location="/sap/bc/adt/oo/classes/yjbv_poc_cl_atcb#start=2,0" atcfinding:priority="1" atcfinding:checkId="AAA" atcfinding:checkTitle="Usage of Released APIs" atcfinding:messageId="0011" atcfinding:messageTitle="Usage of not released ABAP Platform APIs." atcfinding:exemptionApproval="" atcfinding:quickfixInfo="atc:00505683746F1FD1A9A82273E585C000,408" xmlns:atcfinding="http://www.sap.com/adt/atc/finding"/></atcobject:findings></atcobject:object></atcworklist:objects><atcworklist:infos/></atcworklist:worklist>`;

// A worklist da classe LIMPA na MESMA variante: o objeto aparece, com `<atcobject:findings/>` vazio.
// É este XML que separa "checado e limpo" de "não checado".
const XML_LIMPA = `<?xml version="1.0" encoding="utf-8"?><atcworklist:worklist atcworklist:id="00505683746F1FD1A9A822D5CEB92000" xmlns:atcworklist="http://www.sap.com/adt/atc/worklist"><atcworklist:objects><atcobject:object adtcore:uri="/sap/bc/adt/atc/objects/R3TR/CLAS/YJBV_POC_CL_ATCG" adtcore:type="CLAS" adtcore:name="YJBV_POC_CL_ATCG" adtcore:packageName="$TMP" atcobject:author="MVJVELOSO" xmlns:atcobject="http://www.sap.com/adt/atc/object" xmlns:adtcore="http://www.sap.com/adt/core"><atcobject:findings/></atcobject:object></atcworklist:objects><atcworklist:infos/></atcworklist:worklist>`;

// A worklist do objeto que NÃO EXISTE: nenhum `atcobject:object`. HTTP 200, zero findings — e não é verde.
const XML_INEXISTENTE = `<?xml version="1.0" encoding="utf-8"?><atcworklist:worklist atcworklist:id="00505683746F1FD1A9A82C1A06946000" xmlns:atcworklist="http://www.sap.com/adt/atc/worklist"><atcworklist:objects/><atcworklist:infos/></atcworklist:worklist>`;

// ---------- FINDING_STATS ----------

test('FINDING_STATS "6,0,0" vira contagem por prioridade', () => {
  expect(parseFindingStats(XML_RUN)).toEqual({ 1: 6, 2: 0, 3: 0, total: 6 });
});

test('FINDING_STATS "0,0,1" — o P3 de ambiente da variante DEFAULT do s4h', () => {
  const xml = XML_RUN.replace('6,0,0', '0,0,1');
  expect(parseFindingStats(xml)).toEqual({ 1: 0, 2: 0, 3: 1, total: 1 });
});

test('run sem FINDING_STATS não inventa número', () => {
  expect(parseFindingStats('<atcworklist:worklistRun/>')).toEqual({ 1: 0, 2: 0, 3: 0, total: 0 });
});

test('o worklistId sai do texto puro do POST e do XML do run', () => {
  expect(parseWorklistId('00505683746F1FD1A9A801DA59A48000\n')).toBe('00505683746F1FD1A9A801DA59A48000');
  expect(parseWorklistId(XML_RUN)).toBe('00505683746F1FD1A9A821AD175C2000');
});

// ---------- worklist ----------

test('worklist da classe suja: objeto, findings, prioridade, check e LINHA', () => {
  const objetos = parseWorklist(XML_SUJA);
  expect(objetos).toHaveLength(1);
  const [o] = objetos;
  expect(o.tipo).toBe('CLAS');
  expect(o.nome).toBe('YJBV_POC_CL_ATCB');
  expect(o.pacote).toBe('$TMP');
  expect(o.autor).toBe('MVJVELOSO');
  expect(o.findings).toHaveLength(2);

  // location dentro do método: `…/source/main#type=CLAS%2FOM;name=…;start=6`
  expect(o.findings[0]).toMatchObject({
    prioridade: 1, linha: 6, messageId: '2728', checkId: '51B937545CCD6BD44D8879072AB810B3',
    check: 'Versão de idioma ABAP (sintaxe)',            // &#227; desescapado
    mensagem: 'Erro de sintaxe em escopo de idioma restringido (Open SQL)',
  });
  expect(o.findings[0].uri).toBe('/sap/bc/adt/atc/findings/itemid/00505683746F1FD1A9A82273E585C000/index/405');

  // location no objeto: `…/oo/classes/x#start=2,0` — e o finding é auto-fechado (`/>`)
  expect(o.findings[1]).toMatchObject({ prioridade: 1, linha: 2, check: 'Usage of Released APIs' });
});

test('CONTRAFACTUAL: classe limpa aparece na worklist COM zero findings', () => {
  const objetos = parseWorklist(XML_LIMPA);
  expect(objetos).toHaveLength(1);
  expect(objetos[0].nome).toBe('YJBV_POC_CL_ATCG');
  expect(objetos[0].findings).toEqual([]);
});

test('objeto inexistente: worklist SEM objeto — o que `verificar` transforma em erro', () => {
  expect(parseWorklist(XML_INEXISTENTE)).toEqual([]);
});

// ---------- corpo do run ----------

test('buildRunBody põe uma objectReference por alvo', () => {
  const body = buildRunBody(['/sap/bc/adt/oo/classes/a', '/sap/bc/adt/oo/classes/b'], { maximumVerdicts: 50 });
  expect(body).toContain('maximumVerdicts="50"');
  expect(body).toContain('<adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/a"/>');
  expect(body).toContain('<adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/b"/>');
  expect([...body.matchAll(/<adtcore:objectReference\b/g)]).toHaveLength(2);
  expect(body).toContain('<objectSet kind="inclusive">');
});

test('buildRunBody: 100 verdicts é o default (e não limita nada neste release — ver módulo)', () => {
  expect(buildRunBody(['/x'])).toContain('maximumVerdicts="100"');
});

// ---------- alvos ----------

test('uriDoAlvo aceita as três formas', () => {
  expect(uriDoAlvo({ type: 'class', name: 'YJBV_POC_CL_ATCB' })).toBe('/sap/bc/adt/oo/classes/yjbv_poc_cl_atcb');
  expect(uriDoAlvo({ pacote: 'J1BNFE' })).toBe('/sap/bc/adt/packages/j1bnfe');
  expect(uriDoAlvo('/sap/bc/adt/oo/classes/x')).toBe('/sap/bc/adt/oo/classes/x');
});

test('uriDoAlvo recusa alvo sem forma conhecida', () => {
  expect(() => uriDoAlvo({ nome: 'X' })).toThrow(/alvo inválido/);
});

// ---------- formatação ----------

test('formatarFindings ordena por prioridade e diz se passou', () => {
  const objetos = parseWorklist(XML_SUJA);
  const findings = objetos.flatMap((o) => o.findings.map((f) => ({ ...f, objeto: o.nome, tipoObjeto: o.tipo })));
  const texto = formatarFindings({
    variante: 'ABAP_CLOUD_READINESS', checados: 1, findings, reprovaAte: 2,
    reprovam: findings, ok: false, porPrioridade: { 1: 6, 2: 0, 3: 0, total: 6 },
  });
  expect(texto).toContain('ATC ABAP_CLOUD_READINESS: 1 objeto(s), 2 finding(s) (P1 6 · P2 0 · P3 0)');
  expect(texto).toContain('REPROVOU em 2 (até P2)');
  expect(texto).toContain('P1 YJBV_POC_CL_ATCB:6 — Versão de idioma ABAP (sintaxe)');
});

test('formatarFindings de um resultado limpo diz PASSOU', () => {
  const texto = formatarFindings({
    variante: 'ABAP_CLOUD_READINESS', checados: 1, findings: [], reprovam: [], ok: true,
    reprovaAte: 2, porPrioridade: { 1: 0, 2: 0, 3: 0, total: 0 },
  });
  expect(texto).toBe('ATC ABAP_CLOUD_READINESS: 1 objeto(s), 0 finding(s) (P1 0 · P2 0 · P3 0) — PASSOU');
});
