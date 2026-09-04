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
  // Sessão aberta stateless FICA stateless: `call` nunca manda o header nela, mesmo sem pedir. Senão um
  // `getObject(s)` qualquer viraria a sessão em contexto stateful no servidor — e órfã (medido 2026-08-30).
  if (stateless) session.stateless = true;
  if (!stateless && !session.stateless) headers['X-sap-adt-sessiontype'] = 'stateful';
  // Cookie quando já existe: é o que permite pedir um token NOVO sobre uma sessão já autenticada,
  // sem senha. Com senha o Basic bastaria — sem ela, sem isto, o pedido sai anônimo e volta 401.
  if (session.cookie) headers['Cookie'] = session.cookie;
  // `sap-language` no LOGON define o masterLanguage dos objetos criados nesta sessão. Sem ele o
  // LOGOFF dumpa (`TEXTENV_UNICODE_LANGU_INVALID` em `CL_HTTP_EXT_LOGOFF`, medido no item 64/I76:
  // PT e EN fecham limpo com HTTP 200, o idioma OMITIDO dumpa com HTTP 500) — por isso o default.
  const L = lang || session.cfg.lang || 'PT';
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
  // Token sem SAP_SESSIONID = sessão nasceu morta (item 28). O 200 aqui engana: quem quebra é a
  // requisição SEGUINTE, com 400 `Service nicht erreichbar` em qualquer path. Avisar no logon é o
  // único lugar barato de pegar — depois o sintoma aponta para SICF e manda procurar no lugar errado.
  if (!stateless && sessaoNasceuMorta(session)) {
    detalhe('⚠ logon 200 com token mas cookie SEM SAP_SESSIONID — a sessão NASCEU MORTA (servidor no teto de sessões HTTP). Toda requisição com este cookie vai dar 400 "Service nicht erreichbar". Não insista: retry só soma sessão que não sai.');
  }
  return session.token;
}

// `stateless: true` OMITE o header de sessão stateful. Necessário no create de MSAG: com stateful, o
// próprio POST deixa o objeto "em edição" e o lock seguinte falha com 403 (ver SPIKE MSAG).
export async function call(session, { method = 'GET', path: p, accept = 'application/*', contentType, body, stateless = false } = {}) {
  const headers = comAuth(session.cfg, { Accept: accept });
  if (!stateless && !session.stateless) headers['X-sap-adt-sessiontype'] = 'stateful';
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

/**
 * ENCERRA o contexto stateful de uma sessão no servidor — `GET /sap/public/bc/icf/logoff` com o cookie.
 * Medido 2026-08-29 (S4H 758): é a única das três vias que derruba a sessão (`TH_USER_LIST` cai);
 * `DELETE core/http/sessions` dá 405 e uma chamada stateless na mesma sessão não encerra nada. Sessão
 * viva depois do uso é erro do chamador: quem abre (`sessaoNova`, `sessao`) encerra, no `finally`. Sem
 * cookie não há o que encerrar.
 * ⚠ **Corrigido no item 64 (I76):** "o ICF responde 500 ao logoff bem-sucedido, não é erro" estava
 * ERRADO como regra geral — o 500 é o LOGOFF DUMPANDO (`TEXTENV_UNICODE_LANGU_INVALID` em
 * `CL_HTTP_EXT_LOGOFF`) porque a sessão logou sem `sap-language`. Com `fetchToken` sempre mandando um
 * idioma (default `'PT'`, ver ali), o logoff normal responde **200** — um 500 volta a significar erro.
 * ⚠ **`encerrada` é o que ACONTECEU, não o que foi tentado (item 28).** Antes esta função devolvia
 * `encerrada: true` sempre que havia cookie — e mentia no caso que mais importa: com o servidor no
 * teto de sessões, o logoff responde **400** e a sessão **continua na `TH_USER_LIST`** (medido no s4h
 * 758 em 04/09/2026: 24/50 antes do logoff, 24/50 depois). Quem confia no `true` acha que limpou.
 */
export async function encerrarSessao(session) {
  if (!session?.cookie) return { status: null, encerrada: false };
  const url = `${session.cfg.base}${comClient(session.cfg, '/sap/public/bc/icf/logoff')}`;
  const t = Date.now();
  const res = await fetch(url, { headers: { Cookie: session.cookie } });
  await res.text();
  logHttp('GET', url, res.status, Date.now() - t, 0);
  session.cookie = ''; session.token = '';
  const encerrada = res.status === 200;
  if (!encerrada) detalhe(`logoff respondeu ${res.status} — a sessão pode ter FICADO no servidor (ver sessaoNasceuMorta)`);
  return { status: res.status, encerrada };
}

/**
 * PURO: esta sessão nasceu MORTA? Logon que responde 200 **com token CSRF** mas devolve cookie **sem
 * `SAP_SESSIONID`** é o servidor no teto de sessões HTTP — o contexto stateful não foi criado.
 *
 * POR QUE ISTO EXISTE: a partir daí **toda** requisição que levar esse cookie responde
 * `400 Service nicht erreichbar`, em **qualquer** path — medido no s4h 758/250 em 04/09/2026,
 * inclusive `/sap/public/ping`, que respondia 200 na mesma janela quando chamado só com Basic.
 * A mensagem manda procurar SICF; o problema é sessão. E o veneno é AUTOALIMENTADO: no estado
 * doente o próprio logoff dá 400, então cada retry soma mais uma sessão que não sai.
 *
 * Piso medido para chegar lá: ~150 sessões do MESMO usuário (144 ainda passavam, 154 já não).
 * Uma varredura de 120 GETs sem logoff chega perto; duas chegam. Sai sozinho em
 * `http/security_session_timeout` (1800 s no s4h) — fechar depois não cura, o logoff é preventivo.
 */
export function sessaoNasceuMorta(session) {
  return Boolean(session?.token) && !/SAP_SESSIONID/i.test(session?.cookie || '');
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
  // Toda sessão de logon PRÓPRIO que esta conexão abrir entra aqui — e `encerrar()` fecha todas.
  // Antes o logoff era responsabilidade do chamador, e essa classe de erro reapareceu a cada POC
  // (14 órfãs na fila 39; 2 num sistema de CLIENTE na pendência do 15). Quem quiser a sessão viva
  // de propósito pede `{ manter: true }` — aí a responsabilidade volta para quem pediu.
  const abertas = new Set();
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
     *
     * ⚠️ É a ÚNICA origem de órfã medida (2026-09-01, S4H 758): a stateful fica viva no servidor até
     * alguém fazer logoff; a stateless morre sozinha ao fim da requisição. Por isso ela nasce
     * rastreada — `encerrar()` a fecha — salvo `{ manter: true }`.
     */
    async sessaoNova({ stateless = false, manter = false } = {}) {
      const s = await abrirLogon(cfg, { stateless });
      if (!manter) abertas.add(s);
      return s;
    },

    /**
     * Sessão com token pedido em modo STATELESS, reaproveitando a autenticação atual. É o que o
     * create de MSAG exige: basta o token ter sido pedido em sessão stateful para o servidor prender
     * o objeto em edição e o lock seguinte dar 403.
     * Com senha, é um logon novo (rastreado como o de `sessaoNova`). Sem senha, herda o cookie da
     * sessão de trabalho e só pede outro token — essa NUNCA é rastreada: o cookie é EMPRESTADO, e um
     * logoff nela derrubaria a sessão do CLI junto.
     */
    async sessaoStateless({ manter = false } = {}) {
      if (cfg.pass) {
        const s = await abrirLogon(cfg, { stateless: true });
        if (!manter) abertas.add(s);
        return s;
      }
      if (!atual) atual = await abrirLogon(cfg); // sem cookie e sem senha: lança com a mensagem certa
      const s = newSession(cfg);
      s.cookie = atual.cookie;
      await fetchToken(s, { stateless: true });
      return s;
    },
    /** Só para diagnóstico: esta conexão consegue abrir logon novo? */
    podeAbrirLogon: () => Boolean(cfg.pass),
    /**
     * Encerra no servidor (logoff ICF) TODAS as sessões que esta conexão abriu — a de trabalho e as
     * de `sessaoNova`/`sessaoStateless` sem `{ manter: true }` — e esquece os cookies. Chamar no
     * `finally` de todo script: sessão órfã ocupa contexto no servidor e, acumuladas, derrubam o ADT
     * stateful inteiro ("400 Session not found", medido 2026-08-29). Sessão já fechada por quem a
     * abriu (ex.: `runClass`) é pulada de graça — o logoff dela limpou o cookie. A sessão herdada do
     * `connect` (`sessaoAberta`) NÃO é encerrada aqui: ela é do CLI, que decide quando sair.
     * Devolve `{ status, encerrada }` da sessão de trabalho + `encerradas` (total de logoffs).
     */
    async encerrar() {
      let encerradas = 0;
      for (const s of abertas) {
        const x = await encerrarSessao(s).catch(() => null);
        if (x?.encerrada) encerradas++;
      }
      abertas.clear();
      let r = { status: null, encerrada: false };
      if (atual && atual !== sessaoAberta) {
        r = await encerrarSessao(atual).catch(() => ({ status: null, encerrada: false }));
        if (r.encerrada) encerradas++;
        atual = null;
      }
      return { ...r, encerradas };
    },
  };
}
