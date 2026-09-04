// canais.test.mjs — cobre o que dá para testar SEM SAP nos canais rfc-soap e classrun:
// montagem de envelope e parsers. As fixtures são RESPOSTAS REAIS capturadas nos spikes de
// 2026-08-26 no S4H rel. 758 (docs/canal-soap-rfc.md, docs/canal-classrun.md).
//
//   npm test

import { test, expect } from 'vitest';
import { buildEnvelope, xmlField, xmlItems } from './rfc-soap.mjs';
import { interpretarSaida } from './classrun.mjs';
import { classrunDisponivel, montarResumo } from './probe.mjs';
import { chaveDe, entradaDaMedicao, mesclarRegistro, idadeEmDias, tabelaMarkdown } from './canais.mjs';

// ---------- envelope ----------

test('envelope: escalar, tabela e estrutura seguem a gramática do ICF', () => {
  const xml = buildEnvelope('rfc_read_table', {
    QUERY_TABLE: 'T000',
    ROWCOUNT: 5,
    FIELDS: [{ FIELDNAME: 'MANDT' }, { FIELDNAME: 'MTEXT' }],
    OPTIONS: [{ TEXT: "MANDT = '250'" }],
    DATA: [],
  });
  expect(xml).toContain('<urn:RFC_READ_TABLE xmlns:urn="urn:sap-com:document:sap:rfc:functions">');
  expect(xml).toContain('<QUERY_TABLE>T000</QUERY_TABLE>');
  expect(xml).toContain('<FIELDS><item><FIELDNAME>MANDT</FIELDNAME></item><item><FIELDNAME>MTEXT</FIELDNAME></item></FIELDS>');
  expect(xml).toContain('<DATA></DATA>'); // tabela vazia PRECISA aparecer como elemento vazio
});

test('envelope: valores são escapados (& < >)', () => {
  const xml = buildEnvelope('STFC_CONNECTION', { REQUTEXT: 'a & b <c>' });
  expect(xml).toContain('<REQUTEXT>a &amp; b &lt;c&gt;</REQUTEXT>');
});

// ---------- resposta do STFC_CONNECTION (fixture real do spike) ----------

const XML_STFC = `<SOAP-ENV:Envelope><SOAP-ENV:Body><urn:STFC_CONNECTION.Response>
<ECHOTEXT>spike jbv soap-rfc</ECHOTEXT>
<RESPTEXT>SAP R/3 Rel. 758   Sysid: S4H      Date: 20260826   Time: 091615   Logon_Data: 250/MVJVELOSO/E</RESPTEXT>
</urn:STFC_CONNECTION.Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

test('xmlField: extrai ECHOTEXT e RESPTEXT da resposta real', () => {
  expect(xmlField(XML_STFC, 'ECHOTEXT')).toBe('spike jbv soap-rfc');
  expect(xmlField(XML_STFC, 'RESPTEXT')).toContain('Rel. 758');
});

// ---------- resposta do RFC_READ_TABLE (fixture real, resumida) ----------

const XML_T000 = `<urn:RFC_READ_TABLE.Response>
<DATA><item><WA>000|SAP AG                   |S</WA></item>
<item><WA>250|Neduca                   |T</WA></item></DATA>
<FIELDS><item><FIELDNAME>MANDT</FIELDNAME><OFFSET>000000</OFFSET></item>
<item><FIELDNAME>MTEXT</FIELDNAME><OFFSET>000004</OFFSET></item>
<item><FIELDNAME>CCCATEGORY</FIELDNAME><OFFSET>000030</OFFSET></item></FIELDS>
</urn:RFC_READ_TABLE.Response>`;

test('xmlItems: FIELDS e DATA saem como objetos, sem misturar as tabelas', () => {
  const fields = xmlItems(XML_T000, 'FIELDS');
  expect(fields.map((f) => f.FIELDNAME)).toEqual(['MANDT', 'MTEXT', 'CCCATEGORY']);
  const data = xmlItems(XML_T000, 'DATA');
  expect(data.length).toBe(2);
  expect(data[1].WA).toContain('Neduca');
});

test('xmlItems: tabela ausente devolve lista vazia, não explode', () => {
  expect(xmlItems(XML_T000, 'NAO_EXISTE')).toEqual([]);
});

// ---------- classrun: o contrato "200 não é sucesso" ----------

test('classrun: saída normal é ok', () => {
  const r = interpretarSaida('BDC_RESULT subrc=1001 msgs=1\nMSG E V1 302 …');
  expect(r.ok).toBe(true);
  expect(r.erro).toBeNull();
});

test('classrun: "Error:" no body é FALHA mesmo com HTTP 200 (gotcha medido)', () => {
  const r = interpretarSaida('Error: Class does not implement if_oo_adt_classrun~main method!');
  expect(r.ok).toBe(false);
  expect(r.erro).toContain('does not implement');
});

// ---------- probe: a decisão de roteamento por sistema ----------

test('probe: classrun exige release ≥ 7.52', () => {
  expect(classrunDisponivel('758')).toBe(true);
  expect(classrunDisponivel('752')).toBe(true);
  expect(classrunDisponivel('751')).toBe(false);
  expect(classrunDisponivel(null)).toBe(false);
  expect(classrunDisponivel('')).toBe(false);
});

test('probe: sistema moderno completo — tudo ok', () => {
  const r = montarResumo({ ok: true }, { ok: true, release: '758', sysid: 'S4H', mandante: '250', usuario: 'U' });
  expect(r.adt.ok).toBe(true);
  expect(r.soapRfc.ok).toBe(true);
  expect(r.classrun.ok).toBe(true);
  expect(r.release).toBe('758');
});

test('probe: sistema antigo — SOAP RFC sim, classrun não (release < 7.52)', () => {
  const r = montarResumo({ ok: true }, { ok: true, release: '731', sysid: 'ECC', mandante: '100', usuario: 'U' });
  expect(r.soapRfc.ok).toBe(true);
  expect(r.classrun.ok).toBe(false);
  expect(r.classrun.motivo).toContain('731');
});

test('probe: falhas são independentes e explicadas', () => {
  const r = montarResumo({ ok: false, motivo: 'HTTP 404 no discovery' }, { ok: false, motivo: 'sem resposta' });
  expect(r.adt.ok).toBe(false);
  expect(r.soapRfc.motivo).toBe('sem resposta');
  expect(r.classrun.motivo).toBe('sem ADT');
  expect(r.release).toBeNull();
  expect(r.webgui).toBeUndefined(); // chamador antigo, sem a 3ª sonda: não medido ≠ falhou
});

// Fila adt-client 14: o WebGUI entra no probe com o veredito do sondarWebgui (webgui.mjs) — nó ativo
// com esta credencial, e se o cookie de sessão vem `secure` (a bandeira do Chrome). Medido:
// s4h 758/250 em 04/09/2026 cookieSeguro=true; SXD 816/100 em 03/09/2026 cookieSeguro=false.
test('probe: WebGUI ok leva só ok, causa e cookieSeguro — o resto da sonda é ruído no resumo', () => {
  const sonda = { ok: true, causa: 'ok', motivo: 'nó ativo e logon aceito', sid: 'S4H', mandante: '250', cookieSeguro: true, status: 200, bytes: 35216, cookies: ['SAP_SESSIONID_S4H_250'], url: 'x', ms: 423 };
  const r = montarResumo({ ok: true }, { ok: true, release: '758' }, sonda);
  expect(r.webgui).toEqual({ ok: true, causa: 'ok', cookieSeguro: true });

  const semSecure = montarResumo({ ok: true }, { ok: true, release: '816' }, { ...sonda, cookieSeguro: false });
  expect(semSecure.webgui.cookieSeguro).toBe(false);
});

test('probe: WebGUI que falhou carrega a causa e o motivo da sonda — 404 é "sem-no", logon é "credencial"', () => {
  const r = montarResumo({ ok: true }, { ok: true, release: '758' },
    { ok: false, causa: 'sem-no', motivo: '404 Not Found — nó ICF ausente OU desativado na SICF (o ICF não distingue os dois)' });
  expect(r.webgui.ok).toBe(false);
  expect(r.webgui.causa).toBe('sem-no');
  expect(r.webgui.motivo).toContain('SICF');
  expect(r.webgui.cookieSeguro).toBeUndefined();
  // e o WebGUI não derruba os outros canais: é independente
  expect(r.adt.ok).toBe(true);
  expect(r.classrun.ok).toBe(true);
});

// ---------- registro das medições (canais.mjs) — REGISTRO, não cache ----------

const AGORA = new Date('2026-08-31T12:00:00Z');
const CFG_S4H = { alias: 's4h', client: '250', base: 'http://host:8000', cliente: 'moovi', descricao: 'S4H dev' };
const WEBGUI_OK = { ok: true, causa: 'ok', motivo: 'nó ativo e logon aceito', cookieSeguro: true };
const OK = montarResumo({ ok: true }, { ok: true, release: '758', sysid: 'S4H', mandante: '250', usuario: 'MVJVELOSO' }, WEBGUI_OK);

test('canais: a chave é o par sistema+mandante — o mesmo host em outro mandante é outro alvo', () => {
  expect(chaveDe(CFG_S4H)).toBe('s4h:250');
  expect(chaveDe({ alias: 'S4H', client: '100' })).toBe('s4h:100');
  expect(chaveDe({ alias: 'sxd' })).toBe('sxd:(default)');
});

test('canais: a entrada carrega o que é do SISTEMA e a data — e o usuário de quem mediu', () => {
  const e = entradaDaMedicao(CFG_S4H, OK, { agora: AGORA });
  expect(e).toMatchObject({
    alias: 's4h', mandante: '250', cliente: 'moovi', sysid: 'S4H', release: '758',
    medidoEm: '2026-08-31T12:00:00.000Z', medidoPor: 'MVJVELOSO',
    canais: { adt: true, soapRfc: true, classrun: true, webgui: true },
    cookieSeguro: true,
  });
  expect(e.motivos).toBeUndefined(); // nada falhou: motivo seria ruído
  expect(e.tipos).toBeUndefined();   // discovery não foi medido nesta rodada
});

test('canais: só o canal que FALHOU grava motivo — é o que explica depois', () => {
  const caiu = montarResumo({ ok: false, motivo: 'sem resposta: fetch failed' }, { ok: false, motivo: 'sem resposta' },
    { ok: false, causa: 'sem-icm', motivo: 'sem resposta do ICM: ENOTFOUND' });
  const e = entradaDaMedicao({ alias: 'sxd', client: '100' }, caiu, { agora: AGORA });
  expect(e.canais).toEqual({ adt: false, soapRfc: false, classrun: false, webgui: false });
  expect(e.motivos.adt).toContain('fetch failed');
  expect(e.motivos.classrun).toBe('sem ADT');
  expect(e.motivos.webgui).toContain('ENOTFOUND');
  expect(e.cookieSeguro).toBeUndefined(); // sem cookie de sessão não há o que dizer sobre `secure`
  expect(e.release).toBeNull();
});

test('canais: resultado de probe SEM a sonda do WebGUI (registro antigo) não inventa coluna', () => {
  const antigo = { adt: { ok: true }, soapRfc: { ok: true }, classrun: { ok: true }, release: '758', sysid: 'S4H' };
  const e = entradaDaMedicao(CFG_S4H, antigo, { agora: AGORA });
  expect(e.canais).toEqual({ adt: true, soapRfc: true, classrun: true });
  expect(e.cookieSeguro).toBeUndefined();
  expect(e.motivos).toBeUndefined();
});

test('canais: os tipos entram só quando o discovery foi medido, com a lista do que falta', () => {
  const tipos = { table: { ok: true }, cds: { ok: true }, behaviorDefinition: { ok: false, motivo: 'sem coleção' } };
  const e = entradaDaMedicao(CFG_S4H, OK, { tipos, agora: AGORA });
  expect(e.tipos).toEqual({ medidos: 3, comColecao: 2, faltando: ['behaviorDefinition'] });
});

test('canais: mesclar não perde a medição dos outros sistemas', () => {
  const r1 = mesclarRegistro({}, entradaDaMedicao(CFG_S4H, OK, { agora: AGORA }));
  const r2 = mesclarRegistro(r1, entradaDaMedicao({ alias: 'sxd', client: '100' }, OK, { agora: AGORA }));
  expect(Object.keys(r2.medicoes).sort()).toEqual(['s4h:250', 'sxd:100']);

  // e a mesma chave é SUBSTITUÍDA, não duplicada
  const depois = new Date('2026-09-02T12:00:00Z');
  const r3 = mesclarRegistro(r2, entradaDaMedicao(CFG_S4H, OK, { agora: depois }));
  expect(Object.keys(r3.medicoes).length).toBe(2);
  expect(r3.medicoes['s4h:250'].medidoEm).toBe('2026-09-02T12:00:00.000Z');
});

test('canais: a idade da medição é em dias, e data ilegível não explode', () => {
  expect(idadeEmDias('2026-08-31T00:00:00Z', AGORA)).toBe(0);
  expect(idadeEmDias('2026-08-29T00:00:00Z', AGORA)).toBe(2);
  expect(idadeEmDias(undefined, AGORA)).toBeNull();
});

test('canais: a tabela mostra a IDADE — é ela que impede de ler o mapa como estado de agora', () => {
  const velho = entradaDaMedicao({ alias: 'sxd', client: '100' },
    montarResumo({ ok: false, motivo: 'sem resposta: VPN' }, { ok: false, motivo: 'sem resposta' }),
    { agora: new Date('2026-08-29T12:00:00Z') });
  const registro = mesclarRegistro(mesclarRegistro({}, entradaDaMedicao(CFG_S4H, OK, { agora: AGORA })), velho);
  const md = tabelaMarkdown(registro, { agora: AGORA });

  expect(md).toContain('| alvo | sysid | release | ADT | SOAP RFC | classrun | WebGUI | medido |');
  expect(md).toContain('| s4h:250 (moovi) | S4H | 758 | ✅ | ✅ | ✅ | ✅ 🔒 | hoje |');
  expect(md).toContain('| sxd:100 | ? | ? | ❌ | ❌ | ❌ | — | 2 d |'); // sem a 3ª sonda: não medido ≠ falhou
  expect(md).toContain('`sxd:100` · adt: sem resposta: VPN');
  expect(md).toContain('🔒 = o cookie de sessão do WebGUI vem `secure`'); // a legenda só aparece quando há 🔒
});

test('canais: WebGUI na tabela — ✅ sem 🔒 quando o cookie não vem secure, ❌ com motivo quando o nó não respondeu', () => {
  const sxd = entradaDaMedicao({ alias: 'sxd', client: '100' },
    montarResumo({ ok: true }, { ok: true, release: '816', sysid: 'SXD' }, { ...WEBGUI_OK, cookieSeguro: false }), { agora: AGORA });
  const semNo = entradaDaMedicao({ alias: 'd01', client: '100' },
    montarResumo({ ok: true }, { ok: true, release: '750', sysid: 'D01' }, { ok: false, causa: 'sem-no', motivo: '404 — nó ICF ausente OU desativado' }), { agora: AGORA });
  const md = tabelaMarkdown(mesclarRegistro(mesclarRegistro({}, sxd), semNo), { agora: AGORA });

  expect(md).toContain('| sxd:100 | SXD | 816 | ✅ | ✅ | ✅ | ✅ | hoje |');
  expect(md).toContain('| d01:100 | D01 | 750 | ✅ | ✅ | ❌ | ❌ | hoje |');
  expect(md).toContain('`d01:100` · webgui: 404 — nó ICF ausente OU desativado');
  expect(md).not.toContain('🔒 =');
});

test('canais: registro vazio não vira tabela vazia sem explicação', () => {
  expect(tabelaMarkdown({ medicoes: {} })).toBe('_nenhuma medição registrada._');
});
