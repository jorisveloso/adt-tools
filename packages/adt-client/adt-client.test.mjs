// adt-client.test.mjs — deleteObject contra um ICM de mentira em 127.0.0.1 (item 80/I99).
//
//   npm test
//
// O que está em teste é a REGRA "apagado é provado, não presumido": a versão antiga respondia
// `{ deleted:false, status:404, reason:'não existe' }` quando o ADT stateful estava CAÍDO (todo GET
// responde 400 HTML) — sem lançar, com status forjado e sem nunca mandar o DELETE. Foi assim que o
// teardown do item 78 "apagou" um pacote que ficou no s4h. Reproduzido aqui com os dois cenários
// medidos na POC 80 (2026-09-02): o stateful caído e o DELETE 200-mudo que não efetiva.

import { test, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { criarConexao } from './sap-connection.mjs';
import { deleteObject } from './adt-client.mjs';

const HTML_CAIDO = '<html><head><title>Service nicht erreichbar</title></head><body><h1>400 Service nicht erreichbar</h1></body></html>';
const XML_OBJETO = '<ddic:domain xmlns:ddic="x" xmlns:adtcore="y" adtcore:version="active" adtcore:description="poc"/>';

let srv, base, recebidos;
// O comportamento do "SAP" é trocado por teste: cada cenário é uma função (req, res) => bool (tratou?).
let cenario;

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    recebidos.push({ metodo: req.method, url: req.url, sessiontype: req.headers['x-sap-adt-sessiontype'] ?? null });
    res.setHeader('x-csrf-token', 'TOKEN-FAKE');
    res.setHeader('set-cookie', ['SAP_SESSIONID_S4H_250=fake; path=/']);
    if (req.url.includes('/core/discovery')) return res.end('<app/>');
    if (req.url.includes('/icf/logoff')) return res.end('');
    cenario(req, res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});

afterAll(() => srv.close());

const conexao = () => criarConexao({ base, user: 'TESTUSER', pass: 'x', client: '250', lang: 'PT' });
const caido = (req, res) => { res.statusCode = 400; res.setHeader('content-type', 'text/html'); res.end(HTML_CAIDO); };
// "Funciona": GET devolve o objeto, lock devolve handle, DELETE aceita — o pós-delete é por cenário.
const vivo = (posDelete) => (req, res) => {
  if (req.url.includes('_action=LOCK')) return res.end('<asx><LOCK_HANDLE>H1</LOCK_HANDLE></asx>');
  if (req.url.includes('_action=UNLOCK')) return res.end('<ok/>');
  if (req.method === 'DELETE') return res.end('');
  // GET do objeto: antes do DELETE existe; depois, o que o cenário mandar.
  if (recebidos.some((r) => r.metodo === 'DELETE')) return posDelete(req, res);
  res.setHeader('content-type', 'application/xml');
  res.end(XML_OBJETO);
};
const some = (req, res) => { res.statusCode = 404; res.end('<exc:exception/>'); };
const persiste = (req, res) => { res.setHeader('content-type', 'application/xml'); res.end(XML_OBJETO); };

test('stateful caído (400 a tudo): LANÇA — não vira "não existe" com 404 forjado', async () => {
  recebidos = []; cenario = caido;
  const cx = conexao();
  try {
    await expect(deleteObject(cx, { type: 'domain', name: 'YJBV_POC80_DOM', confirm: true }))
      .rejects.toThrow(/GET respondeu 400.*nada foi apagado/s);
    // e o DELETE nunca saiu na rede — falhou ANTES de destravar qualquer coisa
    expect(recebidos.some((r) => r.metodo === 'DELETE')).toBe(false);
  } finally { await cx.encerrar(); }
});

test('DELETE 200-mudo (objeto continua existindo): a conferência de ausência pega e LANÇA', async () => {
  recebidos = []; cenario = vivo(persiste);
  const cx = conexao();
  try {
    await expect(deleteObject(cx, { type: 'domain', name: 'YJBV_POC80_DOM', confirm: true }))
      .rejects.toThrow(/AINDA EXISTE/);
  } finally { await cx.encerrar(); }
});

test('caminho feliz: DELETE + GET pós-delete 404 → { deleted:true, verificado:true }, conferência STATELESS', async () => {
  recebidos = []; cenario = vivo(some);
  const cx = conexao();
  try {
    const r = await deleteObject(cx, { type: 'domain', name: 'YJBV_POC80_DOM', confirm: true });
    expect(r).toEqual({ deleted: true, status: 200, verificado: true });
    // a conferência é o último GET antes do logoff — e sai SEM o header stateful (sobrevive ao stateful caído)
    const pos = recebidos.filter((x) => x.metodo === 'GET' && !x.url.includes('logoff')).at(-1);
    expect(pos.sessiontype).toBe(null);
  } finally { await cx.encerrar(); }
});

test('objeto que não existe (404 EXPLÍCITO): deleted:false sem drama — o único caso que não lança', async () => {
  recebidos = []; cenario = some;
  const cx = conexao();
  try {
    const r = await deleteObject(cx, { type: 'domain', name: 'YJBV_POC80_DOM', confirm: true });
    expect(r).toEqual({ deleted: false, status: 404, reason: 'não existe' });
  } finally { await cx.encerrar(); }
});

test('verificar:false pula a conferência e diz isso no retorno (verificado:false)', async () => {
  recebidos = []; cenario = vivo(persiste); // o pós-delete MENTIRIA — mas ninguém pergunta
  const cx = conexao();
  try {
    const r = await deleteObject(cx, { type: 'domain', name: 'YJBV_POC80_DOM', confirm: true, verificar: false });
    expect(r).toEqual({ deleted: true, status: 200, verificado: false });
    // nenhum GET depois do DELETE (fora o logoff)
    const iDel = recebidos.findIndex((x) => x.metodo === 'DELETE');
    expect(recebidos.slice(iDel + 1).filter((x) => x.metodo === 'GET' && !x.url.includes('logoff')).length).toBe(0);
  } finally { await cx.encerrar(); }
});
