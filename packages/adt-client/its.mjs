// its.mjs — WebGUI (SAP GUI for HTML) por HTTP PURO: o protocolo do ITS falado pelo `fetch` do Node,
// sem navegador nenhum.
//
// É a SEGUNDA VIA do canal WebGUI. A primeira (`webgui.mjs`) sobe um Chrome headless e dirige a tela
// por CDP; esta fala direto com o ITS: um GET abre a sessão, um POST de boot monta a dynpro, e cada
// POST seguinte leva um BATCH de comandos (`value/<SID>`, `action/3/<SID>`, `vkey/0/ses[0]`) e volta
// o `<delta-update>` da tela nova. Os endereços são os SIDs do GUI Scripting
// (`wnd[0]/usr/txtMAX_SEL`, `wnd[0]/tbar[1]/btn[8]`) — estáveis, não id de DOM.
//
// Por que módulo PRÓPRIO e não `{ via: 'http' }` dentro do webgui.mjs: a sessão é outra (jar de
// cookie + action + moin, em vez de WebSocket do CDP), o endereço é outro (SID, em vez de id/rect
// de DOM) e o gesto é outro (batch JSON, em vez de mouse/teclado sintético). Pôr as duas vias na
// mesma função faria cada uma virar um `if` de duas pernas testadas em separado. O que é comum —
// a URL, o Basic, a sonda, o mapa `OKCODES`, o `okcodeDe`, o `campoDoSid` — vem IMPORTADO do
// webgui.mjs, e o VOCABULÁRIO é o mesmo (`abrir`/`abrirTransacao`, `preencher`, `acionar`,
// `comandar`, `fechar`), para trocar de via ser trocar o import.
//
// Medido no s4h 758, mandante 250, em 04/09/2026 (fila adt-client, itens 7, 8 e 20;
// docs/receita-webgui.md § O protocolo do ITS por HTTP puro):
//   • SE16 na T000, `txtMAX_SEL` de 200 → 2, `btn[8]` acionado: o título voltou
//     "Data Browser: Tabela T000  2 acertos" — o valor CHEGOU ao ABAP e mudou o resultado;
//   • OK-code por `value/okcd` + `vkey/0/ses[0]`: `/nSE16`, `ONLI`, `/8`, `/nSE38`, `/n`, `/nex`;
//   • custo: GET + boot + ação ≈ 0,95 s (341 + 423 + 190 ms), contra ~9 s do Chrome na mesma tela.
//
// ⚠️ Cinco regras MEDIDAS, todas embutidas aqui:
//   1. o COOKIE de sessão é obrigatório (sem ele: HTTP 400 em 48 ms) — daí o jar;
//   2. o PRIMEIRO POST é o boot (`[{"get":"state/ur"}]`) e AÇÃO NELE É PERDIDA — `abrir` boota
//      sempre, antes de qualquer comando;
//   3. o status HTTP é 200 nos dois desfechos; quem diz se a ação PEGOU é a FORMA da resposta:
//      `text/xml` com `<delta-update>` = pegou; `multipart/mixed` com `X-Code` = não pegou, e o
//      `X-Status` diz por quê (`-101 failed to fire action: not supported`);
//   4. o `Authorization: Basic` vai em TODA requisição — o ICF não desafia, devolve a página de
//      logon com 200 (a mesma regra do `autorizacao()` do webgui.mjs);
//   5. `/nex` encerra a sessão (200 `text/html` "logoff"); o POST seguinte volta 400
//      `Session Timed Out`. Quem abre fecha: `fechar` manda o `/nex`.
//
// ⚠️ O que esta via NÃO tem, e o navegador tem: print de tela e leitura por DOM. A tela aqui é o
// XML — os SIDs saem do `lsdata` de cada controle (`sids`); o modelo completo da tela
// (`lerTela` com campos/rótulos/botões/mensagem por `montarTela`) é o item 21 da fila.

import { passo, detalhe, http as logHttp } from './log.mjs';
import { encerrarSessao } from './sap-connection.mjs';
import { urlWebgui, autorizacao, interpretarSonda, okcodeDe, campoDoSid, OKCODES } from './webgui.mjs';

// ---------- o vocabulário do protocolo (PURO) ----------

/** O SID da caixa de comando — o mesmo em toda tela medida (`GuiOKCodeField`). */
export const OKCD = 'wnd[0]/tbar[0]/okcd';
/** Fecha todo batch: pede o estado da tela. */
export const ESTADO = { get: 'state/ur' };
/** O boot — o primeiro POST, que monta a dynpro. ⚠ ação nele é PERDIDA. */
export const BOOT = [ESTADO];
/** `vkey/0/ses[0]` é o Enter — o que SUBMETE o OK-code e o que avança a dynpro. Só o 0 está medido
 * (o mapa do `vkey/<n>` é o item 22 da fila). */
export const ENTER = { post: 'vkey/0/ses[0]' };

/** PURO: escrever num campo — `focus` antes (o renderer manda assim) e `value` com o conteúdo. */
export const batchPreencher = (sid, valor) => [
  { post: `focus/${sid}`, logic: 'ignore' },
  { post: `value/${sid}`, content: String(valor ?? '') },
];
/** PURO: acionar um botão — o `Press` do renderer é `action/3/<SID>`. */
export const batchAcionar = (sid) => [{ post: `action/3/${sid}` }];
/** PURO: o OK-code — escrever no `okcd` e disparar o Enter. Medido: `okcode/ses[0]` e `focus` são
 * dispensáveis; `action/3/…/okcd` devolve `-101 not supported`. */
export function batchComandar(okcode) {
  const v = String(okcode ?? '').trim();
  if (!v) throw new Error('its: informe o OK-code (ex. "/nSE16", "ONLI", "/8", "/n", "/nex")');
  return [{ post: `value/${OKCD}`, content: v }, ENTER];
}
/** PURO: a tecla virtual `vkey/<n>/ses[0]`. ⚠ Só `0` (Enter) está medido — fila 22. */
export const batchVkey = (n) => [{ post: `vkey/${Number(n)}/ses[0]` }];

// ---------- ler o que o ITS devolve (PURO) ----------

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** PURO: as entidades HTML que o ITS usa nos atributos (`N&#xba;&#x20;m&#xe1;ximo`). */
export const decodificarEntidades = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10));
  return ENTIDADES[e.toLowerCase()] ?? m;
});

/**
 * PURO: as duas peças do shell que o GET devolve — o `action` do `<form id="webguiform0">`, que
 * carrega o TOKEN de sessão (`/sap(cz1TSUQ…)/bc/gui/sap/its/webgui/`), e o `var moin`. Sem o
 * `action` não há para onde postar — e é o que a página de logon não tem.
 */
export function cabecalhoDoShell(html) {
  const s = String(html ?? '');
  const action = /<form[^>]*id="webguiform0"[^>]*\saction="([^"]+)"/i.exec(s)?.[1]
    ?? /\saction="(\/sap\([^"]*\)\/bc\/gui\/sap\/its\/webgui\/)"/i.exec(s)?.[1] ?? null;
  const moin = /var\s+moin\s*=\s*"([^"]+)"/i.exec(s)?.[1] ?? null;
  return { action, moin };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * PURO: um parâmetro dos `sap.its.aParams` / `arrSystemParams` do `<start-script>` — eles saem
 * como `nome:'valor'` (chave sem aspas, ou `'t-code':'SE16'` com aspas quando tem hífen).
 */
export function paramDe(corpo, nome) {
  const re = new RegExp(`(?:^|[{,])\\s*'?${escapeRe(nome)}'?\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`);
  const m = re.exec(String(corpo ?? ''));
  return m ? m[1].replace(/\\'/g, "'") : null;
}

/** PURO: os passos do `multipart/mixed` — `X-Order`, `X-Code`, `X-Status` de cada comando. */
export function passosDoMultipart(corpo) {
  const passos = [];
  const re = /X-Order:\s*(\d+)\s*\r?\nX-Code:\s*(-?\d+)\s*\r?\nX-Status:\s*([^\r\n]*)/g;
  let m;
  while ((m = re.exec(String(corpo ?? '')))) passos.push({ ordem: Number(m[1]), codigo: Number(m[2]), status: m[3].trim() });
  return passos;
}

/**
 * PURO: os SIDs que a resposta carrega — o ENDEREÇO de cada controle da tela, tirado do `lsdata`
 * (`{"SID":"wnd[0]/usr/txtMAX_SEL","Type":"GuiTextField","value":"200 ","maxlen":11}`), sem
 * parser de DOM. Cada um sai com `sid`, `tipo` (o `Type` do SAP), o `campo` (o nome que a URL
 * `~transaction` quer) e, quando é botão, o `okcode` (`btn[8]`). A ordem é a do documento; SID
 * repetido (o mesmo controle em dois blocos) fica uma vez só.
 */
export function sidsDaResposta(corpo) {
  const s = String(corpo ?? '');
  const vistos = new Map();
  const marca = '"SID":"';
  let i = s.indexOf(marca);
  while (i >= 0) {
    const ini = s.lastIndexOf('{', i);
    // fecha o objeto: JSON raso (o único aninhado medido é o array `ColumnIDs` do grid)
    let prof = 0, fim = -1;
    for (let k = ini; k < s.length; k++) {
      const c = s[k];
      if (c === '{' || c === '[') prof++;
      else if (c === '}' || c === ']') { prof--; if (prof === 0) { fim = k; break; } }
    }
    if (ini >= 0 && fim > ini) {
      let obj = null;
      try { obj = JSON.parse(decodificarEntidades(s.slice(ini, fim + 1))); } catch { obj = null; }
      if (obj?.SID && !vistos.has(obj.SID)) {
        const { SID, Type, ...resto } = obj;
        vistos.set(SID, {
          sid: SID, tipo: Type ?? null, campo: campoDoSid(SID),
          okcode: Type === 'GuiButton' ? (/\/(btn\[\d+\])$/.exec(SID)?.[1] ?? null) : null,
          ...resto,
        });
      }
    }
    i = s.indexOf(marca, i + marca.length);
  }
  return [...vistos.values()];
}

/**
 * PURO: o que o ITS respondeu a um POST — a FORMA é o veredito, nunca o status HTTP (200 nos
 * dois desfechos):
 *   `delta`      — `text/xml` com `<delta-update>`: a tela mudou; `titulo`/`screenId`/`dynpro`/
 *                  `tcode`/`moin` saem dos `sap.its.aParams`;
 *   `multipart`  — `multipart/mixed` com `X-Code`: nada mudou, e `erros` diz por quê;
 *   `logoff`     — 200 `text/html` "logoff": o `/nex` encerrou a sessão;
 *   `sem-sessao` — 400 (`Session Timed Out`, `Session not found`): não há mais sessão;
 *   `outra`      — não previsto (o corpo vai junto para diagnóstico).
 * `pegou` = houve `delta` E nenhum `X-Code` diferente de zero.
 */
export function lerResposta({ status = null, tipo = '', corpo = '' } = {}) {
  const s = String(corpo ?? '');
  const t = String(tipo ?? '').toLowerCase();
  const passos = passosDoMultipart(s);
  const erros = passos.filter((p) => p.codigo !== 0);
  let forma;
  if (status === 200 && /<delta-update/i.test(s)) forma = 'delta';
  else if (t.includes('multipart/mixed') || passos.length) forma = 'multipart';
  else if (status === 200 && t.includes('text/html') && /logoff/i.test(s)) forma = 'logoff';
  else if (status === 400) forma = 'sem-sessao';
  else forma = 'outra';
  return {
    forma, pegou: forma === 'delta' && erros.length === 0, status, tipo: t.split(';')[0] || null, bytes: s.length,
    passos, erros,
    titulo: paramDe(s, 'cuatitle'), screenId: paramDe(s, 'ScreenId'), dynpro: paramDe(s, 'dynpro'),
    tcode: paramDe(s, 't-code'), dnum: paramDe(s, 'd-num'), moin: paramDe(s, 'moin'),
    popup: /"SID":"wnd\[[1-9]\d*\]"/.test(s),   // wnd[1] no mesmo delta-update (medido: /o, /nend)
    motivo: forma === 'delta' ? null
      : forma === 'multipart' ? (erros.map((e) => `${e.codigo} ${e.status}`).join('; ') || 'X-Code 0 em tudo — nada mudou')
      : forma === 'logoff' ? 'sessão encerrada pelo logoff'
      : `${status ?? '?'} ${s.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
  };
}

const TIPOS_DE_ENTRADA = new Set(['GuiCTextField', 'GuiTextField', 'GuiPasswordField', 'GuiComboBox', 'GuiCheckBox', 'GuiRadioButton']);

/**
 * PURO: o SID de um alvo, contra os SIDs da tela atual. Quatro formas:
 *   `'wnd[0]/usr/txtMAX_SEL'` ou `{ sid }` — o endereço, passa como está;
 *   `{ campo: 'MAX_SEL' }` ou `'MAX_SEL'`   — o nome do campo (o mesmo da URL `~transaction`);
 *   `{ okcode: 'btn[8]' }`, `'btn[8]'`, `8`, `'Executar'` — o botão pelo OK-code (as três
 *   formas do `okcodeDe`), casado pelo FIM do SID (`…/tbar[1]/btn[8]`) — a barra não se adivinha.
 * Não achar estoura AQUI, com o que a tela TEM — não vira `-101` sem explicação.
 */
export function sidDoAlvo(sids = [], alvo) {
  if (alvo === null || alvo === undefined || alvo === '') throw new Error('its: informe o alvo — SID, { campo }, ou { okcode }');
  if (typeof alvo === 'object' && alvo.sid) return alvo.sid;
  if (typeof alvo === 'string' && /^wnd\[\d+\]/.test(alvo)) return alvo;
  const campo = typeof alvo === 'object' ? alvo.campo : null;
  const okBruto = typeof alvo === 'object' ? alvo.okcode : null;

  if (campo) {
    const achado = sids.find((x) => TIPOS_DE_ENTRADA.has(x.tipo) && x.campo === campo);
    if (achado) return achado.sid;
    const tem = sids.filter((x) => TIPOS_DE_ENTRADA.has(x.tipo)).map((x) => x.campo).join(', ') || '(nenhum)';
    throw new Error(`its: campo "${campo}" não está na tela — tenho ${tem}`);
  }
  if (okBruto !== null && okBruto !== undefined) return sidDoBotao(sids, okBruto);
  if (typeof alvo === 'number' || /^btn\[\d+\]$/i.test(String(alvo))) return sidDoBotao(sids, alvo);
  // string solta: primeiro apelido de botão (Gravar, Executar…), senão nome de campo
  try { okcodeDe(alvo); return sidDoBotao(sids, alvo); } catch { /* não é botão conhecido */ }
  return sidDoAlvo(sids, { campo: String(alvo) });
}

function sidDoBotao(sids, alvo) {
  const okcode = okcodeDe(alvo);
  const botoes = sids.filter((x) => x.tipo === 'GuiButton' && x.okcode);
  const achado = botoes.find((x) => x.okcode === okcode);
  if (achado) return achado.sid;
  const tem = botoes.map((b) => `${b.okcode}${OKCODES[b.okcode] ? `=${OKCODES[b.okcode].nome}` : ''}`).join(', ') || '(nenhum)';
  throw new Error(`its: botão ${okcode} não está na tela — tenho ${tem}`);
}

// ---------- a sessão ----------

const cookieDoJar = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function guardarCookies(jar, setCookie = []) {
  for (const c of setCookie) {
    const [par] = c.split(';');
    const i = par.indexOf('=');
    if (i > 0) jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
}
const setCookieDe = (res) => (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []);
// o `action` carrega o token da sessão — no log ele sai mascarado
const urlNoLog = (url) => url.replace(/\/sap\([^)]*\)/, '/sap(…)');

/**
 * Abre a sessão do ITS: GET (cria a sessão, devolve o shell) + POST de boot (monta a dynpro). Com
 * `transacao`/`parametros`/`okcode` entra JÁ na tela certa pela expressão `~transaction` — as
 * mesmas regras do `abrirTransacao` do webgui.mjs (`*TCODE campo=valor;DYNP_OKCODE=ONLI`).
 *
 * A credencial vai por header em toda requisição; a resposta do GET passa pelo `interpretarSonda`
 * do webgui.mjs — página de logon com 200, nó 404, SSL 403 e ICM fora estouram aqui, com causa.
 * Devolve a sessão `{ via, cfg, jar, action, moin, sids, ultimo, titulo, fila, aberta, tempos }`.
 * Quem abre FECHA: `fechar(sessao)`.
 */
export async function abrir(cfg, { transacao = null, parametros = {}, okcode = null, boot = true, tetoMs = 30000 } = {}) {
  const url = urlWebgui(cfg, { transacao, parametros, okcode });
  const cabecalho = autorizacao(cfg);
  passo(`its: abrindo ${urlNoLog(url)}`);
  const t0 = Date.now();
  let res, html;
  try {
    res = await fetch(url, { headers: { Authorization: cabecalho }, redirect: 'follow', signal: AbortSignal.timeout(tetoMs) });
    html = await res.text();
  } catch (e) {
    const s = interpretarSonda({ erro: e.cause?.code || e.name });
    throw new Error(`its: ${s.motivo} (${urlNoLog(url)})`);
  }
  const ms = Date.now() - t0;
  logHttp('GET', urlNoLog(url), res.status, ms, html.length);
  const cookies = setCookieDe(res);
  const sonda = interpretarSonda({ status: res.status, statusText: res.statusText, cookies, corpo: html });
  if (!sonda.ok) {
    if (cookies.length) await encerrarSessao({ cfg, cookie: cookies.map((c) => c.split(';')[0]).join('; ') }).catch(() => {});
    throw new Error(`its: canal WebGUI indisponível — ${sonda.motivo}`);
  }
  const jar = new Map();
  guardarCookies(jar, cookies);
  const { action, moin } = cabecalhoDoShell(html);
  if (!action) {
    await encerrarSessao({ cfg, cookie: cookieDoJar(jar) }).catch(() => {});
    throw new Error('its: o shell veio sem o action do webguiform0 — não há para onde postar');
  }
  const sessao = {
    via: 'http', cfg, url, jar, action, moin, sysid: sonda.sid, mandante: sonda.mandante,
    sids: [], ultimo: null, titulo: null, fila: [], aberta: true, tempos: { get: ms, boot: null },
  };
  detalhe(`its: sessão ${sonda.sid}/${sonda.mandante} aberta em ${ms} ms (moin ${moin ?? '—'})`);
  if (boot) {
    const r = await postar(sessao, BOOT);
    sessao.tempos.boot = r.ms;
    if (r.forma !== 'delta') throw new Error(`its: o boot não montou a dynpro — ${r.forma}: ${r.motivo}`);
    detalhe(`its: boot em ${r.ms} ms — "${r.titulo}" (${r.tcode ?? '?'} ${r.dynpro ?? ''})`);
  }
  return sessao;
}

/** Abre a sessão JÁ numa transação — açúcar do `abrir` com o mesmo nome do webgui.mjs. */
export const abrirTransacao = (cfg, tcode, opts = {}) => abrir(cfg, { ...opts, transacao: tcode });

/**
 * O POST cru: manda o batch EXATAMENTE como veio e devolve o `lerResposta` (+ `ms`, `corpo`).
 * Atualiza o `moin`, o jar, os `sids` e o `titulo` da sessão quando veio `delta`; marca a sessão
 * encerrada quando veio `logoff` ou `sem-sessao`. As funções de cima (`acionar`, `comandar`…)
 * compõem o batch e fecham com `ESTADO`; esta não acrescenta nada.
 */
export async function postar(sessao, batch, { tetoMs = 30000 } = {}) {
  if (!sessao?.action) throw new Error('its: sessão sem action — abra com abrir(cfg)');
  if (!sessao.aberta) throw new Error('its: a sessão já foi encerrada (logoff) — abra outra');
  const url = `${sessao.cfg.base}${sessao.action}batch/json?~RG_WEBGUI=X&`;
  const headers = {
    Authorization: autorizacao(sessao.cfg),
    'Content-Type': 'application/json;charset=UTF-8',
    Accept: 'multipart/mixed',
    Cookie: cookieDoJar(sessao.jar),
  };
  if (sessao.moin) headers.moin = sessao.moin;
  detalhe(`its: POST ${batch.map((c) => c.post ?? `get ${c.get}`).join(' | ')}`);
  const t0 = Date.now();
  let res, corpo;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(batch), signal: AbortSignal.timeout(tetoMs) });
    corpo = await res.text();
  } catch (e) {
    throw new Error(`its: o POST falhou — ${e.cause?.code || e.name}: ${e.message}`);
  }
  const ms = Date.now() - t0;
  logHttp('POST', urlNoLog(url), res.status, ms, corpo.length);
  guardarCookies(sessao.jar, setCookieDe(res));
  const lida = { ...lerResposta({ status: res.status, tipo: res.headers.get('content-type'), corpo }), ms, corpo };
  if (lida.moin) sessao.moin = lida.moin;
  if (lida.forma === 'delta') {
    sessao.sids = sidsDaResposta(corpo);
    sessao.titulo = lida.titulo;
  }
  if (lida.forma === 'logoff' || lida.forma === 'sem-sessao') sessao.aberta = false;
  sessao.ultimo = lida;
  detalhe(`its: ${lida.forma} em ${ms} ms${lida.pegou ? ` — "${lida.titulo}"` : ` — ${lida.motivo}`}`);
  return lida;
}

/** Os comandos pendentes (`preencher`) + os de agora + `ESTADO`, num POST só. Esvazia a fila. */
async function despachar(sessao, comandos = [], opts) {
  const batch = [...sessao.fila, ...comandos, ESTADO];
  sessao.fila = [];
  return await postar(sessao, batch, opts);
}

// ---------- ler ----------

/** O título da dynpro atual (`cuatitle` do último `delta`). */
export const titulo = (sessao) => sessao.titulo;

/**
 * Os SIDs da tela atual — `{ sid, tipo, campo, okcode, … }` por controle, do último `delta`.
 * É o endereçamento desta via: `campo` é o nome que `abrirTransacao(…, { parametros })` quer e
 * `okcode` é o `btn[n]` que `acionar` aceita. Só endereços; o MODELO da tela (rótulo, valor
 * legível, mensagem) é o `lerTela` do item 21.
 */
export const sids = (sessao) => sessao.sids;
/** Só os campos de entrada da tela atual. */
export const campos = (sessao) => sessao.sids.filter((x) => TIPOS_DE_ENTRADA.has(x.tipo));
/** Só os botões (`btn[n]`) da tela atual, com o apelido medido quando há. */
export const botoes = (sessao) => sessao.sids.filter((x) => x.tipo === 'GuiButton' && x.okcode)
  .map((b) => ({ ...b, nome: OKCODES[b.okcode]?.nome ?? null }));

// ---------- dirigir ----------

/**
 * Escreve num campo. NÃO fala com o servidor: enfileira `focus`+`value` para ir NO MESMO batch da
 * próxima ação (`acionar`, `enter`, `enviar`) — é assim que o renderer manda, e é a forma medida
 * (`value/txtMAX_SEL` + `action/3/…/btn[8]` no mesmo POST → "2 acertos"). O alvo é resolvido AGORA
 * contra a tela atual (nome errado estoura aqui, não como `-101` depois). Devolve `{ sid, valor, pendentes }`.
 */
export function preencher(sessao, alvo, valor) {
  const sid = sidDoAlvo(sessao.sids, typeof alvo === 'string' && !/^wnd\[/.test(alvo) ? { campo: alvo } : alvo);
  sessao.fila.push(...batchPreencher(sid, valor));
  return { sid, valor: String(valor ?? ''), pendentes: sessao.fila.length / 2 };
}

/** Manda o que está enfileirado, sem ação nenhuma (só `ESTADO`). Devolve o `lerResposta`. */
export const enviar = (sessao, opts) => despachar(sessao, [], opts);

/**
 * Aciona um botão pelo OK-code (`'btn[8]'`, `8`, `'Executar'`) ou pelo SID inteiro, levando junto o
 * que foi `preencher`-ido. `pegou: false` é INFORMAÇÃO: veio `multipart`, e `motivo` traz o
 * `X-Code`/`X-Status` — a ação não pegou, e o protocolo disse por quê.
 */
export async function acionar(sessao, alvo, opts) {
  // objeto ({ sid }/{ okcode }) e SID cru passam como estão; o resto ('btn[8]', 8, 'Executar') é OK-code
  const alvoBotao = typeof alvo === 'object' || /^wnd\[/.test(String(alvo)) ? alvo : { okcode: alvo };
  const sid = sidDoAlvo(sessao.sids, alvoBotao);
  const r = await despachar(sessao, batchAcionar(sid), opts);
  return { ...r, sid };
}

/** O Enter da dynpro (`vkey/0/ses[0]`), levando junto o que foi preenchido. Medido: `T000` no
 * campo + Enter → tela de seleção da T000. */
export const enter = (sessao, opts) => despachar(sessao, [ENTER], opts);

/** Tecla virtual `vkey/<n>` — ⚠ só `0` medido (fila 22); use para MEDIR, não para afirmar. */
export const vkey = (sessao, n, opts) => despachar(sessao, batchVkey(n), opts);

/**
 * Manda um OK-code pela caixa de comando: `/nSE16` (de qualquer tela), `/n` (menu), `ONLI`/`/8`
 * (fcode e tecla da dynpro), `/nex` (encerra). ⚠ Recusa com valores pendentes: o OK-code levar o
 * que foi digitado NÃO está medido nesta via (no navegador está medido que NÃO leva — item 31);
 * acione com `acionar`/`enter`, ou descarte com `sessao.fila = []`.
 */
export async function comandar(sessao, okcode, opts) {
  if (sessao.fila.length) {
    throw new Error(`its: comandar com ${sessao.fila.length / 2} valor(es) pendente(s) — mande-os por acionar/enter/enviar antes (o OK-code levar valor não está medido)`);
  }
  const r = await postar(sessao, [...batchComandar(okcode), ESTADO], opts);
  return { ...r, okcode: String(okcode).trim() };
}

/**
 * Encerra: `/nex` (medido: 200 `text/html` "logoff", e o POST seguinte 400). Se a sessão não
 * aceitar o comando, cai no logoff do ICF pelo cookie (`encerrarSessao`), o mesmo da sonda.
 */
export async function fechar(sessao) {
  if (!sessao?.aberta) return { encerrada: false, motivo: 'já estava encerrada' };
  sessao.fila = [];
  try {
    const r = await comandar(sessao, '/nex');
    if (r.forma === 'logoff') return { encerrada: true, via: '/nex', ms: r.ms };
    detalhe(`its: /nex devolveu ${r.forma} — caindo no logoff do ICF`);
  } catch (e) {
    detalhe(`its: /nex falhou (${e.message}) — caindo no logoff do ICF`);
  }
  const r = await encerrarSessao({ cfg: sessao.cfg, cookie: cookieDoJar(sessao.jar) });
  sessao.aberta = false;
  return { encerrada: r.encerrada, via: 'icf-logoff', status: r.status };
}
