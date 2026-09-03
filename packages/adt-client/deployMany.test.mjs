// deployMany.test.mjs — unidade de ativação, sem SAP: o transporte (`call`) é dublado e registra
// cada requisição. O que se prova: ordem de gravação por dependência (instância e tipo), NENHUMA
// ativação durante a gravação, UMA ativação no fim com todas as URIs, guard-rails antes da rede.

import { test, expect, vi, beforeEach } from 'vitest';

const chamadas = [];
vi.mock('./sap-connection.mjs', () => ({
  call: vi.fn(async (session, { method = 'GET', path, body }) => {
    chamadas.push({ method, path, body });
    if (path.includes('/activation')) return { status: 200, text: '<chkl:messages/><x activationExecuted="true"/>' };
    if (path.includes('_action=LOCK')) return { status: 200, text: '<LOCK_HANDLE>h1</LOCK_HANDLE>' };
    if (method === 'GET') return { status: 404, text: '' };
    return { status: 200, text: '' };
  }),
  newSession: () => ({}), fetchToken: async () => ({}), criarConexao: () => ({}),
  encerrarSessao: async () => ({ status: null, encerrada: false }),
}));

const { deployMany, ordenarUnidade, deploy } = await import('./adt-client.mjs');
const conexao = { sessao: async () => ({ cfg: {} }), sessaoStateless: async () => ({ cfg: {} }) };

beforeEach(() => { chamadas.length = 0; });

test('ordenarUnidade: dependeDe (instância) e dependencias (tipo) mandam; ciclo lança', () => {
  const ordem = ordenarUnidade([
    { type: 'behaviorDefinition', name: 'ZBO', dependeDe: ['class:zbp_zbo'] },
    { type: 'class', name: 'ZBP_ZBO' },
  ]);
  expect(ordem.map((o) => o.name)).toEqual(['ZBP_ZBO', 'ZBO']);

  const rap = ordenarUnidade([
    { type: 'serviceBinding', name: 'ZB', srvd: 'ZS', description: 'x' },
    { type: 'cds', name: 'ZC' },
    { type: 'serviceDefinition', name: 'ZS' },
  ]);
  expect(rap.map((o) => o.type)).toEqual(['cds', 'serviceDefinition', 'serviceBinding']);

  expect(() => ordenarUnidade([
    { type: 'class', name: 'ZA', dependeDe: ['interface:ZI'] },
    { type: 'interface', name: 'ZI', dependeDe: ['class:ZA'] },
  ])).toThrow(/circular/);

  // dependência fora da unidade é ignorada (já está no sistema)
  expect(ordenarUnidade([{ type: 'class', name: 'ZA', dependeDe: ['interface:ZFORA'] }]).map((o) => o.name)).toEqual(['ZA']);
});

test('deployMany: grava na ordem, não ativa no meio, ativa todos JUNTOS no fim', async () => {
  const r = await deployMany(conexao, [
    { type: 'behaviorDefinition', name: 'ZBO', source: 'managed;', dependeDe: ['class:ZBP_ZBO'] },
    { type: 'class', name: 'ZBP_ZBO', source: 'CLASS zbp_zbo DEFINITION.' },
  ]);
  const ativacoes = chamadas.filter((c) => c.path.includes('/activation'));
  expect(ativacoes).toHaveLength(1);
  expect(ativacoes[0].body).toContain('/sap/bc/adt/oo/classes/zbp_zbo');
  expect(ativacoes[0].body).toContain('/sap/bc/adt/bo/behaviordefinitions/zbo');
  // a classe (dependência) foi criada ANTES do BDEF, e a ativação é a ÚLTIMA requisição
  const idx = (frag) => chamadas.findIndex((c) => c.method === 'POST' && c.path === frag);
  expect(idx('/sap/bc/adt/oo/classes')).toBeLessThan(idx('/sap/bc/adt/bo/behaviordefinitions'));
  expect(chamadas.at(-1).path).toContain('/activation');
  expect(r.objetos.map((o) => o.name)).toEqual(['ZBP_ZBO', 'ZBO']);
  expect(r.activated).toBe(true);
  expect(r.objetos.every((o) => o.created)).toBe(true);
});

test('deployMany: forma xml + custom (FM) também adiam a ativação; FM com group na referência', async () => {
  await deployMany(conexao, [
    { type: 'dataElement', name: 'ZDE_X', def: { dataType: 'CHAR', length: 2 } },
    { type: 'functionModule', name: 'Z_FM_X', group: 'ZFG_X', source: 'FUNCTION z_fm_x.' },
  ]);
  const ativacoes = chamadas.filter((c) => c.path.includes('/activation'));
  expect(ativacoes).toHaveLength(1);
  expect(ativacoes[0].body).toContain('/sap/bc/adt/ddic/dataelements/zde_x');
  expect(ativacoes[0].body).toContain('/sap/bc/adt/functions/groups/zfg_x/fmodules/z_fm_x');
});

test('deployMany: guard-rail de QUALQUER objeto falha antes de qualquer rede', async () => {
  await expect(deployMany(conexao, [
    { type: 'class', name: 'ZOK', source: '' },
    { type: 'table', name: 'SAPTAB', source: '' },
  ])).rejects.toThrow(/GUARD-RAIL/);
  expect(chamadas).toHaveLength(0);
  await expect(deployMany(conexao, [])).rejects.toThrow(/ao menos um/);
});

test('deploy simples continua ativando na hora (comportamento antigo intacto)', async () => {
  await deploy(conexao, 'table', { name: 'ZTB_X', source: 'define table ztb_x {}' });
  expect(chamadas.filter((c) => c.path.includes('/activation'))).toHaveLength(1);
  expect(chamadas.at(-1).path).toContain('/activation');
});
