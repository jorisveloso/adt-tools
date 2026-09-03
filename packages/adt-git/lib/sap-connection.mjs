// sap-connection.mjs — como se fala com o ICM. O transporte, e só ele.
//
// Esta camada não sabe o que é tabela, classe ou CDS: sabe abrir sessão, carregar o token CSRF,
// guardar o cookie e mandar uma requisição. O vocabulário ADT (tipos, lock, activate, deploy) mora
// em `adt-client.mjs`, que fala com o SAP ATRAVÉS daqui. Quem quiser trocar o transporte (outro
// esquema de logon, um proxy, um mock de teste) mexe só neste arquivo.
//
// ---------------------------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE (o bug que ele conserta)
//
// Havia DOIS jeitos de abrir conexão convivendo na mesma lib:
//
//   • o do CLI daqui — `connect` pergunta a senha, pega cookie + token, grava SÓ ISSO em
//     `.sessao.json` e DESCARTA a senha. `list`/`checkout` reaproveitam esse cookie.
//   • o herdado do maestro — cada função de alto nível fazia `newSession(cfg)` + `fetchToken(s)`
//     por dentro, abrindo um LOGON NOVO a cada chamada. Lá isso funciona: o `cfg` vem de um `.env`
//     onde a senha está sempre presente.
//
// Aqui o segundo jeito não funciona, e falha calado: `newSession(cfg)` nasce com `cookie: ''`, e
// sem senha o `Authorization` não é enviado (de propósito — Basic com senha vazia faz o ICF cuspir
// 401 antes de olhar o cookie). Resultado: requisição ANÔNIMA. Medido contra um ICM de mentira:
//
//     [sessão cacheada]  Authorization: (nenhum)   Cookie: SAP_SESSIONID_D01_100=…   ✅
//     [newSession(cfg)]  Authorization: (nenhum)   Cookie: (nenhum)                  ❌ 401
//
// A `conexao` abaixo é a resposta: UM lugar que sabe de onde vem uma sessão autenticada, seja ela
// o cookie cacheado do `connect` ou um logon novo com senha em mãos.
// ---------------------------------------------------------------------------------------------
//
// O `cfg` é o contrato entre esta camada e quem configura:
//   { base, user, pass, client, lang }   — `lib/config.mjs` monta a partir do alias do `connect`.
// `lang` é o idioma de LOGON: é ele que define o `masterLanguage` do objeto criado. O atributo
// adtcore:masterLanguage do body é IGNORADO pelo SAP.

import { http as logHttp, corpo as logCorpo, detalhe, nomesDeHeader } from './log.mjs';

// ---------- headers ----------
// Só manda `Authorization: Basic` quando HÁ senha. Sem ela, quem identifica é o COOKIE — e um Basic
// com senha vazia faria o ICF responder 401 antes mesmo de olhar o cookie.
const basic = (cfg) => (cfg.pass ? 'Basic ' + Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64') : null);
const comAuth = (cfg, headers) => { const a = basic(cfg); if (a) headers.Authorization = a; return headers; };

// O mandante NÃO é opcional: sem `sap-client` o ICM loga no cliente default dele. Quando o default
// coincide com o pedido isso passa despercebido; quando não coincide, o `connect` diz "mandante 200"
// e a sessão abre no 100 em silêncio. Anexa como query, respeitando quem já tem `?` no path.
const comClient = (cfg, p) =>
  (cfg.client ? `${p}${p.includes('?') ? '&' : '?'}sap-client=${encodeURIComponent(cfg.client)}` : p);

function captureCookies(session, res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (!sc || !sc.length) return;
  const jar = {};
  for (const c of (session.cookie ? session.cookie.split('; ') : [])) { const i = c.indexOf('='); if (i > 0) jar[c.slice(0, i)] = c.slice(i + 1); }
  for (const line of sc) { const first = line.split(';')[0]; const i = first.indexOf('='); if (i > 0) jar[first.slice(0, i)] = first.slice(i + 1); }
  session.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ---------- sessão (primitivas) ----------
export function newSession(cfg) { return { cfg, cookie: '', token: '', status: null }; }

// `stateless: true` → a sessão NUNCA envia o header stateful (nem no token). Necessário para o create
// de MSAG: basta o token ter sido pedido em sessão stateful para o servidor prender o objeto em edição.
export async function fetchToken(session, { stateless = false, lang } = {}) {
  const headers = comAuth(session.cfg, { 'X-CSRF-Token': 'Fetch', Accept: 'application/*' });
  if (!stateless) headers['X-sap-adt-sessiontype'] = 'stateful';
  // Cookie quando já existe: é o que permite pedir um token NOVO sobre uma sessão já autenticada,
  // sem senha. Com senha o Basic bastaria — sem ela, sem isto, o pedido sai anônimo e volta 401.
  if (session.cookie) headers['Cookie'] = session.cookie;
  // `sap-language` no LOGON define o masterLanguage dos objetos criados nesta sessão.
  const L = lang || session.cfg.lang;
  // O mandante liga NO LOGON (aqui): é o sap-client desta requisição que fixa o client da sessão.
  const p = comClient(session.cfg, `/sap/bc/adt/core/discovery${L ? `?sap-language=${encodeURIComponent(L)}` : ''}`);
  const url = `${session.cfg.base}${p}`;
  detalhe(`token: headers ${nomesDeHeader(headers)}${headers.Authorization ? ' (Basic com senha)' : ' (sem Authorization — só cookie)'}`);
  const t = Date.now();
  const res = await fetch(url, { headers });
  session.status = res.status; // guardado para o diagnóstico do connect: 401 ≠ 403 ≠ 404.
  session.token = res.headers.get('x-csrf-token') || '';
  captureCookies(session, res);
  logHttp('GET', url, res.status, Date.now() - t, 0);
  // O que o connect precisa saber sem ver o corpo: veio token? veio cookie?
  detalhe(`token ${session.token ? `recebido (${session.token.length} chars)` : 'AUSENTE'} · cookie ${session.cookie ? `${session.cookie.split('; ').length} chave(s)` : 'nenhum'}`);
  return session.token;
}

// `stateless: true` OMITE o header de sessão stateful. Necessário no create de MSAG: com stateful, o
// próprio POST deixa o objeto "em edição" e o lock seguinte falha com 403 (ver SPIKE MSAG).
export async function call(session, { method = 'GET', path: p, accept = 'application/*', contentType, body, stateless = false } = {}) {
  const headers = comAuth(session.cfg, { Accept: accept });
  if (!stateless) headers['X-sap-adt-sessiontype'] = 'stateful';
  if (session.token) headers['X-CSRF-Token'] = session.token;
  if (session.cookie) headers['Cookie'] = session.cookie;
  if (contentType) headers['Content-Type'] = contentType;
  const url = `${session.cfg.base}${comClient(session.cfg, p)}`;
  const t = Date.now();
  const res = await fetch(url, { method, headers, body });
  session.status = res.status;
  captureCookies(session, res);
  const text = await res.text();
  logHttp(method, url, res.status, Date.now() - t, text.length);
  // Accept errado devolve 406, autorização faltando devolve 403 — e os dois chegam ao usuário como
  // "não encontrado" se ninguém olhar o corpo. Por isso o corpo do erro entra no log.
  if (res.status >= 400) { detalhe(`accept: ${accept}`); logCorpo(text); }
  return { status: res.status, text, headers: res.headers };
}

// ---------- conexão ----------
// De onde vem uma sessão autenticada. Duas origens, uma interface:
//   • COOKIE  — `criarConexao(cfg, { sessaoAberta })` com a sessão que o `connect` cacheou. Sem senha.
//   • SENHA   — `criarConexao(cfg)` com `cfg.pass` preenchido: abre o logon na hora, quantas vezes
//               precisar. É o modo do maestro (`.env`) e é o que a fase 2 vai querer.

async function abrirLogon(cfg, { stateless = false } = {}) {
  if (!cfg.pass) throw new Error(SEM_SENHA);
  const s = newSession(cfg);
  await fetchToken(s, { stateless });
  if (!s.token) throw new Error(`logon em ${cfg.base} não devolveu token CSRF (HTTP ${s.status ?? 'sem resposta'}).`);
  return s;
}

const SEM_SENHA =
  'não dá para abrir uma sessão SAP NOVA: o `connect` pergunta a senha, guarda só o cookie e descarta a senha.\n' +
  'A sessão cacheada continua servindo para ler (`conexao.sessao()`) — o que não dá é fazer um logon novo.\n' +
  'Se você chegou aqui pelo `activate`/`deployMessageClass`, é a fase 2 batendo na porta: ver PONTO ABERTO abaixo.';

/**
 * @param cfg                    { base, user, pass, client, lang }
 * @param {object} sessaoAberta  sessão já autenticada (o cookie do `connect`), quando houver
 */
export function criarConexao(cfg, { sessaoAberta } = {}) {
  let atual = sessaoAberta ?? null;
  return {
    cfg,
    /** A sessão de trabalho. Reaproveitada — é a do `connect` quando ela existe. */
    async sessao() {
      if (!atual) atual = await abrirLogon(cfg);
      return atual;
    },
    /**
     * Um LOGON NOVO, com cookie próprio. Só é possível com senha em mãos.
     *
     * ✅ PONTO ABERTO RESOLVIDO — medido no DEV:100 em 2026-08-05. O `activate` NÃO precisa de sessão
     * nova: rodado na MESMA sessão cacheada (só cookie, sem senha) devolveu HTTP 200,
     * `activationExecuted="true"` e zero mensagens, e o objeto ficou `version: active`.
     * O "currently editing" do maestro só morde enquanto o objeto está TRAVADO — e todos os `deploy*`
     * fazem `unlock` no `finally` antes de ativar. Por isso `activateMany` usa `sessao()`, não isto.
     * Restou útil para quem TEM senha e quer isolamento de verdade.
     */
    async sessaoNova({ stateless = false } = {}) {
      return abrirLogon(cfg, { stateless });
    },

    /**
     * Sessão com token pedido em modo STATELESS, reaproveitando a autenticação atual. É o que o
     * create de MSAG exige: basta o token ter sido pedido em sessão stateful para o servidor prender
     * o objeto em edição e o lock seguinte dar 403.
     * Com senha, é um logon novo. Sem senha, herda o cookie e só pede outro token.
     */
    async sessaoStateless() {
      if (cfg.pass) return abrirLogon(cfg, { stateless: true });
      if (!atual) atual = await abrirLogon(cfg); // sem cookie e sem senha: lança com a mensagem certa
      const s = newSession(cfg);
      s.cookie = atual.cookie;
      await fetchToken(s, { stateless: true });
      return s;
    },
    /** Só para diagnóstico: esta conexão consegue abrir logon novo? */
    podeAbrirLogon: () => Boolean(cfg.pass),
  };
}
