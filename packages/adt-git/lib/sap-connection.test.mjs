// sap-connection.test.mjs — a camada de transporte, contra um ICM de mentira em 127.0.0.1.
//
//   npm test
//
// Não precisa de VPN nem de SAP: sobe um servidor HTTP local e olha o que a lib REALMENTE manda na
// rede. É a única forma de testar "o header saiu?" sem um sistema de verdade.

import { test, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { criarConexao, newSession, call } from './sap-connection.mjs';

let srv, base, recebidos;

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    recebidos.push({
      url: req.url,
      metodo: req.method,
      auth: req.headers.authorization ?? null,
      cookie: req.headers.cookie ?? null,
      csrf: req.headers['x-csrf-token'] ?? null,
      sessiontype: req.headers['x-sap-adt-sessiontype'] ?? null,
    });
    res.setHeader('x-csrf-token', 'TOKEN-NOVO');
    res.setHeader('set-cookie', ['SAP_SESSIONID_D01_100=novo123; path=/']);
    res.end('<ok/>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});

afterAll(() => srv.close());

const cfgSemSenha = () => ({ base, user: 'TESTUSER', pass: '', client: '100', lang: 'PT' });
const cfgComSenha = () => ({ base, user: 'TESTUSER', pass: 's3nh4', client: '100', lang: 'PT' });
const sessaoDoConnect = (cfg) => ({ cfg, cookie: 'SAP_SESSIONID_D01_100=abc; MYSAPSSO2=xyz', token: 'TOKEN-DO-CONNECT', status: null });

// ---------- A REGRESSÃO ----------
// O bug: os orquestradores faziam `newSession(cfg)` por dentro. Como o `connect` descarta a senha, a
// sessão nova nascia sem cookie E sem Authorization — requisição anônima, 401 garantido.
test('regressão: newSession(cfg) NÃO carrega o cookie do connect (era daqui que vinha o 401)', () => {
  expect(newSession(cfgSemSenha()).cookie).toBe('');
});

test('conexao.sessao() reaproveita a sessão do connect — cookie vai junto, sem Authorization', async () => {
  recebidos = [];
  const cfg = cfgSemSenha();
  const conexao = criarConexao(cfg, { sessaoAberta: sessaoDoConnect(cfg) });

  const s = await conexao.sessao();
  await call(s, { path: '/sap/bc/adt/ddic/tables/ztb_pedido' });

  expect(recebidos.length).toBe(1); // sem logon extra: a sessão já estava aberta
  expect(recebidos[0].cookie).toContain('SAP_SESSIONID_D01_100=abc');
  expect(recebidos[0].auth).toBe(null); // Basic com senha vazia daria 401 antes de olhar o cookie
  expect(recebidos[0].csrf).toBe('TOKEN-DO-CONNECT');
});

test('conexao.sessao() é a MESMA sessão em chamadas seguidas — não reloga a cada função', async () => {
  recebidos = [];
  const cfg = cfgSemSenha();
  const conexao = criarConexao(cfg, { sessaoAberta: sessaoDoConnect(cfg) });
  expect(await conexao.sessao()).toBe(await conexao.sessao());
  expect(recebidos.length).toBe(0);
});

// ---------- o limite honesto: sem senha não há logon novo ----------
test('conexao.sessaoNova() sem senha LANÇA — não finge que deu certo', async () => {
  const cfg = cfgSemSenha();
  const conexao = criarConexao(cfg, { sessaoAberta: sessaoDoConnect(cfg) });
  await expect(conexao.sessaoNova()).rejects.toThrow(/sessão SAP NOVA/);
  expect(conexao.podeAbrirLogon()).toBe(false);
});

test('conexao.sessao() sem senha E sem sessão aberta também lança — nada de requisição anônima', async () => {
  await expect(criarConexao(cfgSemSenha()).sessao()).rejects.toThrow(/sessão SAP NOVA/);
});

// ---------- com senha (o modo do maestro, e o que a fase 2 vai querer) ----------
test('com senha: sessao() abre o logon, manda Basic e captura o cookie da resposta', async () => {
  recebidos = [];
  const conexao = criarConexao(cfgComSenha());
  expect(conexao.podeAbrirLogon()).toBe(true);

  const s = await conexao.sessao();

  expect(recebidos.length).toBe(1);
  expect(recebidos[0].url).toContain('/sap/bc/adt/core/discovery');
  expect(recebidos[0].auth).toBe('Basic ' + Buffer.from('TESTUSER:s3nh4').toString('base64'));
  expect(recebidos[0].sessiontype).toBe('stateful');
  expect(s.token).toBe('TOKEN-NOVO');
  expect(s.cookie).toContain('SAP_SESSIONID_D01_100=novo123'); // veio do set-cookie
});

test('com senha: sessaoNova() abre OUTRO logon, com cookie próprio (é o que o activate exige)', async () => {
  recebidos = [];
  const conexao = criarConexao(cfgComSenha());
  const a = await conexao.sessao();
  const b = await conexao.sessaoNova();
  expect(b).not.toBe(a);
  expect(recebidos.length).toBe(2);
});

test('com senha: sessaoNova({stateless}) omite o header stateful (create de MSAG depende disso)', async () => {
  recebidos = [];
  await criarConexao(cfgComSenha()).sessaoNova({ stateless: true });
  expect(recebidos[0].sessiontype).toBe(null);
});

// ---------- token sobre sessão já autenticada ----------
// MEDIDO no sistema de dev (2026-08-05): sem isto, pedir um token novo com só o cookie sai anônimo e volta 401.
test('sem senha: sessaoStateless() herda o cookie e omite o header stateful', async () => {
  recebidos = [];
  const cfg = cfgSemSenha();
  const conexao = criarConexao(cfg, { sessaoAberta: sessaoDoConnect(cfg) });

  const s = await conexao.sessaoStateless();

  expect(recebidos.length).toBe(1);
  expect(recebidos[0].url).toContain('/sap/bc/adt/core/discovery');
  expect(recebidos[0].cookie).toContain('SAP_SESSIONID_D01_100=abc'); // o cookie do connect foi junto
  expect(recebidos[0].auth).toBe(null);
  expect(recebidos[0].sessiontype).toBe(null); // stateless: sem o header
  expect(s.token).toBe('TOKEN-NOVO');
});

// ---------- mandante ----------
test('o mandante entra em TODA requisição — sem ele o ICM loga no client default dele', async () => {
  recebidos = [];
  const cfg = cfgSemSenha();
  const s = sessaoDoConnect(cfg);
  await call(s, { path: '/sap/bc/adt/ddic/tables/x' });
  await call(s, { path: '/sap/bc/adt/repository/informationsystem/search?query=Z*' });
  expect(recebidos[0].url).toContain('?sap-client=100');
  expect(recebidos[1].url).toContain('&sap-client=100'); // já tinha `?` — vira `&`, não um segundo `?`
});

test('sem mandante configurado, nada é anexado', async () => {
  recebidos = [];
  const cfg = { ...cfgSemSenha(), client: null };
  await call({ cfg, cookie: 'x=1', token: 't', status: null }, { path: '/sap/bc/adt/x' });
  expect(recebidos[0].url).toBe('/sap/bc/adt/x');
});
