// classrun.test.mjs — o canal classrun sem SAP: o transporte (`call`/`deploySource`) é dublado.
// O que se prova aqui é o item 52: o laço de retry do `deployAndRun` serve ao LOAD ANTIGO da classe
// e a mais nada — quando a sessão nasceu morta, ele para na PRIMEIRA tentativa, porque insistir no
// estado doente soma uma sessão por tentativa e o logoff (400) não remove nenhuma.

import { test, expect, vi, beforeEach } from 'vitest';
import { erroSessaoMorta, ehSessaoMorta } from './sap-connection.mjs';

let respostaDoCall;
const chamadas = [];
vi.mock('./adt-client.mjs', () => ({
  call: vi.fn(async (session, opts) => { chamadas.push(opts); return respostaDoCall(); }),
  deploySource: vi.fn(async () => ({ created: true, activated: true, activate: { hasError: false, messages: [] } })),
}));

const { deployAndRun, interpretarSaida } = await import('./classrun.mjs');

// Conexão SEM senha: é o caminho do retry (com senha, a execução vai numa sessão nova, sem laço).
const conexao = { cfg: { base: 'http://icm', pass: '' }, sessao: async () => ({ cfg: { base: 'http://icm' } }) };
const classe = { name: 'YJBV_X', source: 'CLASS x DEFINITION. ENDCLASS.' };

beforeEach(() => { chamadas.length = 0; });

test('interpretarSaida: 200 com "Error:" no body é FALHA — quem decide é o body', () => {
  expect(interpretarSaida('tudo certo').ok).toBe(true);
  expect(interpretarSaida('Error: Class does not implement …').ok).toBe(false);
});

test('sessão morta: o laço para na PRIMEIRA — 5 tentativas seriam 5 sessões a mais', async () => {
  respostaDoCall = () => { throw erroSessaoMorta({ cfg: { base: 'http://icm' } }); };
  const e = await deployAndRun(conexao, classe).then(() => null, (x) => x);
  expect(ehSessaoMorta(e)).toBe(true);
  expect(chamadas.length).toBe(1); // era 5 antes do item 52
});

test('load antigo (o motivo do laço) continua tentando as 5 vezes', async () => {
  respostaDoCall = () => ({ status: 200, text: 'Error: Class does not implement IF_OO_ADT_CLASSRUN' });
  const r = await deployAndRun(conexao, classe, { tentativas: 5, esperaMs: 0 });
  expect(r.ok).toBe(false);
  expect(r.tentativa).toBe(5);
  expect(chamadas.length).toBe(5);
});
