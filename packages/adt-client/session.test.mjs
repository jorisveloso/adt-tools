// session.test.mjs — o que o `connect` GRAVA no cache, contra um ICM de mentira em 127.0.0.1.
//
//   npm test
//
// O que se testa aqui é uma decisão de disco: dado o que o logon respondeu, o `.sessao.json` deve
// existir ou não. Por isso o teste protege o `.sessao.json` REAL da lib (backup no `beforeAll`,
// restauração no `afterAll`) — rodar a suíte não pode derrubar a sessão de quem estava trabalhando.

import { test, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar } from './session.mjs';
import { ehSessaoMorta } from './sap-connection.mjs';

const ARQ_SESSAO = path.join(path.dirname(fileURLToPath(import.meta.url)), '.sessao.json');

let srv, base, noTeto = false, sessaoDoDono = null;

beforeAll(async () => {
  // A sessão de verdade sai da frente e volta no fim: estes testes escrevem e apagam este arquivo.
  if (fs.existsSync(ARQ_SESSAO)) { sessaoDoDono = fs.readFileSync(ARQ_SESSAO); fs.unlinkSync(ARQ_SESSAO); }

  srv = http.createServer((req, res) => {
    res.setHeader('x-csrf-token', 'TOKEN-NOVO');
    // `noTeto` imita o servidor no teto de sessões HTTP: o logon RESPONDE 200 e devolve token, mas o
    // cookie vem sem SAP_SESSIONID — o contexto stateful nunca foi criado.
    if (noTeto) {
      res.setHeader('set-cookie', ['sap-contextid=ctx1; path=/', 'sap-usercontext=sap-client=100; path=/']);
      if (!req.url.includes('/core/discovery')) { res.statusCode = 400; res.end('<html><head><title>Service nicht erreichbar</title></head></html>'); return; }
      res.end('<ok/>');
      return;
    }
    res.setHeader('set-cookie', ['SAP_SESSIONID_D01_100=novo123; path=/']);
    res.end('<ok/>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});

afterAll(() => {
  srv.close();
  if (fs.existsSync(ARQ_SESSAO)) fs.unlinkSync(ARQ_SESSAO);
  if (sessaoDoDono) fs.writeFileSync(ARQ_SESSAO, sessaoDoDono);
});

const cfgAlvo = () => ({ alias: 'tst', cliente: 'teste', descricao: '', base, client: '100', lang: 'PT', user: null, pass: null });
const credenciais = { usuario: 'TESTUSER', senha: 's3nh4' };

// ---------- item 87: o cache não pode receber uma sessão que nasceu morta ----------
// O bug: `conectar` só exigia TOKEN para gravar. No teto de sessões o token vem, o cookie não presta,
// e o `connect` respondia "ok" — cada comando seguinte é um processo NOVO que lê esse cookie do disco
// e morre em 400 "Service nicht erreichbar", sem nunca passar pelo diagnóstico do connect.

test('connect no teto de sessões LANÇA — o token não é veredito, o cookie é', async () => {
  noTeto = true;
  try {
    const e = await conectar(cfgAlvo(), credenciais).then(() => null, (x) => x);
    expect(ehSessaoMorta(e)).toBe(true);
    expect(e.name).toBe('SessaoNasceuMorta');
    // A mensagem tem que dizer o que fazer — esperar o timeout — e não mandar procurar SICF.
    expect(e.message).toMatch(/security_session_timeout/);
  } finally { noTeto = false; }
});

test('connect no teto NÃO grava .sessao.json — era daqui que vinha o cookie inútil', async () => {
  noTeto = true;
  try {
    await conectar(cfgAlvo(), credenciais).catch(() => {});
    expect(fs.existsSync(ARQ_SESSAO)).toBe(false);
  } finally { noTeto = false; }
});

test('connect no teto não sobrescreve a sessão BOA que já estava no cache', async () => {
  const boa = await conectar(cfgAlvo(), credenciais); // sessão saudável, cacheada
  noTeto = true;
  try {
    await conectar(cfgAlvo(), credenciais).catch(() => {});
    const d = JSON.parse(fs.readFileSync(ARQ_SESSAO, 'utf8'));
    expect(d.cookie).toBe(boa.cookie);
    expect(d.cookie).toMatch(/SAP_SESSIONID/);
  } finally { noTeto = false; fs.unlinkSync(ARQ_SESSAO); }
});

// ---------- o caminho feliz continua feliz ----------
test('connect normal grava cookie + token no cache, e NUNCA a senha', async () => {
  const cfg = cfgAlvo();
  const dados = await conectar(cfg, credenciais);
  expect(dados.cookie).toMatch(/SAP_SESSIONID/);
  expect(dados.token).toBe('TOKEN-NOVO');
  expect(cfg.pass).toBe(null); // some da memória do processo
  const gravado = fs.readFileSync(ARQ_SESSAO, 'utf8');
  expect(gravado).not.toMatch(/s3nh4/);
  fs.unlinkSync(ARQ_SESSAO);
});
