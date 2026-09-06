// session.mjs — conexão e sessão ADT.
//
// REGRA INEGOCIÁVEL: a senha é perguntada na hora, vive em memória enquanto o processo roda, e NUNCA
// toca o disco. O que é cacheado é só o par (cookie de sessão + token CSRF), que expira sozinho.
//
// Por que cachear: cada comando é um processo novo. Sem cache, `connect` abriria uma sessão que
// morreria antes do `list` começar.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { RAIZ } from './config.mjs';
import { confiarNaCA } from './ca.mjs';
import { newSession, fetchToken, criarConexao, erroSessaoMorta } from './sap-connection.mjs';
import { passo, detalhe } from './log.mjs';

const ARQ_SESSAO = path.join(RAIZ, '.sessao.json');
const TTL_MIN_PADRAO = 30;

// ---------- senha ----------
// Lê do terminal sem eco. Node não expõe isso direto: desliga o modo "linha" do stdin e ecoa nada.
export function perguntarSenha(prompt = 'Senha SAP: ') {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('sem terminal interativo para pedir a senha — rode `connect` num terminal de verdade'));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      // reescreve o prompt sem os caracteres digitados, a cada tecla
      if (!['\n', '\r', ''].includes(String(char))) {
        readline.moveCursor(process.stdout, -1000, 0);
        readline.clearLine(process.stdout, 1);
        process.stdout.write(prompt);
      }
    };
    process.stdin.on('data', onData);
    rl.question(prompt, (senha) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(senha);
    });
  });
}

export function perguntar(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (r) => { rl.close(); resolve(r.trim()); }));
}

// ---------- usuário ----------
// O usuário SAP é PERGUNTADO, como a senha. Não sai do login do Windows (que é outro nome — e pode
// nem ser um usuário SAP válido: o SAP aceita no máximo 12 caracteres) e não mora em `sistemas.json`,
// que é versionado. A única memória é o `.sessao.json` local, e só como sugestão.
function ultimoUsuario(alias) {
  try {
    const d = JSON.parse(fs.readFileSync(ARQ_SESSAO, 'utf8'));
    return d.alias === alias && d.user ? d.user : null;
  } catch { return null; } // sem sessão anterior, ou ilegível — segue sem sugestão
}

export async function perguntarUsuario(alias) {
  if (!process.stdin.isTTY) {
    throw new Error('sem terminal interativo para pedir o usuário — rode `connect` num terminal de verdade');
  }
  const sugerido = ultimoUsuario(alias);
  const digitado = await perguntar(`Usuário SAP em ${alias.toUpperCase()}${sugerido ? ` [${sugerido}]` : ''}: `);
  const user = digitado || sugerido;
  if (!user) throw new Error('nenhum usuário informado — o connect precisa do usuário SAP.');
  return user;
}

// ---------- cache de sessão ----------
// Guarda cookie + token + a identificação do alvo. NUNCA a senha.
function gravarSessao(cfg, session, ttlMin) {
  const dados = {
    alias: cfg.alias, cliente: cfg.cliente, descricao: cfg.descricao || '', base: cfg.base,
    client: cfg.client, lang: cfg.lang, user: cfg.user,
    cookie: session.cookie, token: session.token,
    // Como cada comando é um processo NOVO, o que o `connect` resolveu sobre certificado tem que
    // viajar junto: sem isto o canal webgui perde o pino e o canal do Node volta a recusar a CA
    // interna no primeiro fetch. Nenhum dos dois é segredo — são um hash público e um caminho.
    certificado: cfg.certificado ?? null, ca: cfg.ca ?? null,
    expiraEm: new Date(Date.now() + ttlMin * 60_000).toISOString(),
  };
  fs.writeFileSync(ARQ_SESSAO, JSON.stringify(dados, null, 2));
  detalhe(`sessão gravada em ${ARQ_SESSAO} (TTL ${ttlMin}min, expira ${dados.expiraEm})`);
  // Melhor esforço: no Windows o modo POSIX é aproximado, mas não custa nada tentar.
  try { fs.chmodSync(ARQ_SESSAO, 0o600); } catch { /* ignorado de propósito */ }
  return dados;
}

/** Abre a sessão: pede usuário e senha, busca token CSRF + cookie, cacheia. A senha é descartada ao sair. */
export async function conectar(cfg, { ttlMin = TTL_MIN_PADRAO, usuario, senha } = {}) {
  cfg.user = usuario || cfg.user || await perguntarUsuario(cfg.alias);
  cfg.pass = senha ?? await perguntarSenha(`Senha de ${cfg.user} em ${cfg.alias.toUpperCase()}: `);

  const s = newSession(cfg);
  await fetchToken(s);

  if (!s.token) throw new Error(porQueFalhou(cfg, s.status));
  // Token NÃO é veredito (item 87). No teto de sessões HTTP o logon responde 200 COM token, mas o
  // cookie vem sem SAP_SESSIONID — e cachear isso é o pior desfecho possível: o `connect` diz "ok",
  // some com a senha, e todo comando seguinte (processo novo, lendo o cache) morre em
  // 400 "Service nicht erreichbar", sem passar por `porQueFalhou`. O critério é o mesmo do item 52 —
  // a sessão já chega marcada por `fetchToken` — e aqui ele vale ANTES do `gravarSessao`.
  if (s.nasceuMorta) throw erroSessaoMorta(s);

  const dados = gravarSessao(cfg, s, ttlMin);
  cfg.pass = null; // some da memória do processo
  return dados;
}

// Sem token, o STATUS diz qual das causas é. Listar as três de uma vez (como esta mensagem fazia)
// manda procurar VPN e SICF quando o servidor já respondeu 401 dizendo que era credencial.
function porQueFalhou(cfg, status) {
  const alvo = `${cfg.base}/sap/bc/adt/core/discovery?sap-client=${cfg.client}`;
  const curl = `Teste direto:  curl -u ${cfg.user} -i "${alvo}"`;
  if (status === 401) {
    return `${cfg.alias.toUpperCase()} recusou o usuário "${cfg.user}" (HTTP 401).\n` +
      'O servidor está no ar e o nó /sap/bc/adt está ativo — o que ele rejeitou foi a credencial:\n' +
      'usuário errado, senha errada, ou usuário bloqueado/expirado.\n' +
      `⚠️  "${cfg.user}" tem ${cfg.user.length} caracteres` +
      (cfg.user.length > 12 ? ' — usuário SAP tem no MÁXIMO 12, então esse nome não existe no sistema.\n' : '.\n') +
      curl;
  }
  if (status === 403) {
    return `${cfg.alias.toUpperCase()} autenticou "${cfg.user}" mas negou o discovery (HTTP 403).\n` +
      'Credencial ok; falta autorização (S_DEVELOP / S_ADT_RES) ou o nó SICF está restrito.\n' + curl;
  }
  if (status === 404) {
    return `${cfg.base} respondeu 404 no discovery.\n` +
      'O nó SICF /sap/bc/adt está inativo, ou a URL aponta para um ICM que não é o deste sistema.\n' +
      'Ative em SICF: /sap/bc/adt (botão direito → Ativar Serviço).\n' + curl;
  }
  return `não veio token CSRF de ${cfg.base} (HTTP ${status ?? 'sem resposta'}).\n` +
    'O servidor respondeu, mas sem o header x-csrf-token.\n' + curl;
}

/** Recupera a sessão cacheada, pronta para o adt-client. Erro claro (e acionável) se não houver. */
export function sessaoAtual() {
  passo('sessão: lendo cache');
  if (!fs.existsSync(ARQ_SESSAO)) {
    throw new Error('nenhuma sessão aberta. Rode primeiro:  connect <alias>:<mandante>:<idioma>');
  }
  const d = JSON.parse(fs.readFileSync(ARQ_SESSAO, 'utf8'));
  const restamMin = Math.round((new Date(d.expiraEm) - new Date()) / 60_000);
  detalhe(`${d.alias.toUpperCase()} mandante ${d.client} usuário ${d.user} cliente "${d.cliente}" · expira em ${restamMin}min`);
  if (new Date(d.expiraEm) < new Date()) {
    throw new Error(`sessão de ${d.alias.toUpperCase()} expirou em ${d.expiraEm}. Rode connect de novo.`);
  }
  // Sem a senha, quem sustenta a sessão é o COOKIE. Por isso `pass` fica vazio — e o adt-client, nesse
  // caso, omite o header Authorization (ver a nota "MUDANÇA 2" no topo de adt-client.mjs): mandar um
  // Basic com senha vazia faria o ICF responder 401 antes mesmo de olhar o cookie.
  const cfg = {
    base: d.base, user: d.user, pass: '', client: d.client, lang: d.lang, alias: d.alias, cliente: d.cliente,
    certificado: d.certificado ?? null, ca: d.ca ?? null,
  };
  // Processo novo, confiança zerada: a CA do cliente é declarada de novo AQUI, antes que qualquer
  // canal use o cookie — o `fetch` recusaria o handshake antes de olhar para ele.
  if (cfg.ca) confiarNaCA(cfg.ca, { rotulo: cfg.alias.toUpperCase(), raiz: RAIZ });
  return { cfg, session: { cfg, cookie: d.cookie, token: d.token, status: null }, info: d };
}

/**
 * A sessão cacheada embrulhada numa `conexao` — é o que os orquestradores do adt-client pedem
 * (`deploy*`, `activate*`, `dataPreview`, `runUnitTests`…). Sem isto eles abririam um logon anônimo.
 *
 * A conexão nasce SEM senha: `conexao.sessao()` devolve a sessão do `connect` e funciona, mas
 * `conexao.sessaoNova()` lança — não dá para abrir um logon novo só com o cookie. Ver sap-connection.mjs.
 */
export function conexaoAtual() {
  const { cfg, session, info } = sessaoAtual();
  return { conexao: criarConexao(cfg, { sessaoAberta: session }), cfg, session, info };
}

export function encerrarSessao() {
  if (fs.existsSync(ARQ_SESSAO)) { fs.unlinkSync(ARQ_SESSAO); return true; }
  return false;
}
