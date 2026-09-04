// webgui.mjs — SAP GUI for HTML (WebGUI) dirigido por Chrome headless falando CDP cru.
//
// É o canal que ENXERGA e DIRIGE a dynpro SEM SAP GUI instalado e SEM ninguém na frente da tela —
// o buraco que o `gui.mjs` (GUI Scripting) deixa. Roda no MESMO ICM da porta 8000 que o ADT já
// usa (`/sap/bc/gui/sap/its/webgui`), autenticado por Basic no header. Zero dependência nova: o
// Chrome que já está na máquina e o `WebSocket` nativo do Node — sem playwright, sem puppeteer.
//
// Lugar na ordem do arsenal (docs/receita-webgui.md § ordem):
//   ADT → SOAP RFC → classrun → BDC → **WebGUI** → GUI Scripting.
// Acima do BDC porque LÊ a tela (o BDC é cego); antes do GUI Scripting porque custa menos — não
// exige SAP GUI instalado nem sessão de diálogo visível. O GUI Scripting fica para o que o WebGUI
// não alcança (a saída, e o ALV/table control como objeto).
//
// Medido no SXD 816, mandante 100, em 03/09/2026 (POC 4029823, `tu-item7-webgui.md`): o canal
// abriu a J1B1N preenchida por URL de transação, leu os campos, preencheu duas datas e ACIONOU o
// Gravar — nota fiscal 0000000082 criada, confirmada em OUTRA LUW por dataPreview.
// Porte para a lib medido no s4h 758, mandante 250, em 04/09/2026 — docs/receita-webgui.md § porte.
//
// ⚠️ Três coisas que este canal NÃO faz, todas medidas:
//   • **não tem via de SAÍDA** — `btn[15]` (Sair), `btn[12]` (Cancelar) e `Shift+F3` postam e o
//     programa reabre a MESMA dynpro; a caixa de OK-code (`ToolbarOkCode`) é invisível (rect 0×0)
//     e não recebe digitação. Fluxo que precisa sair sem gravar ainda é GUI Scripting.
//   • **statusbar e print NÃO são assert** — a tela pode aceitar tudo e não gravar nada (o mesmo
//     desmentido do GUI Scripting). O assert é `readTable`/`dataPreview` em OUTRA LUW.
//   • **não roda sem navegador**: exige um Chrome instalado NESTA máquina (é headless, não remoto).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { passo, detalhe } from './log.mjs';

/** Onde o Chrome costuma estar no Windows. `{ navegador }` sobrepõe; `JBV_CHROME` também. */
export const CAMINHOS_CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
];

/**
 * ⚠️ SEM ISTO A TELA FICA MORTA. O WebGUI é servido por HTTP puro (ICM 8000) e
 * `crypto.randomUUID` SÓ EXISTE EM CONTEXTO SEGURO (https ou localhost). O boot do ITS quebra em
 * cascata (`randomUUID is not a function` → `testAPCCapability` de undefined → `b.GetOption is not
 * a function`), nenhum controle ganha listener e a página fica **pintada e inerte**: clique, F8 e
 * Enter não geram POST nenhum. Medido no SXD 816/100 em 03/09/2026 por
 * `DOMDebugger.getEventListeners` — com o polyfill os 4 erros de boot zeram e o clique passa a
 * postar (HTTP 200 + `<delta-update>` aplicado na tela).
 */
export const POLYFILL_RANDOMUUID = `if (window.crypto && typeof window.crypto.randomUUID !== 'function') {
  window.crypto.randomUUID = function () {
    const b = new Uint8Array(16); window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
    return h.slice(0,4).join('') + '-' + h.slice(4,6).join('') + '-' + h.slice(6,8).join('') +
           '-' + h.slice(8,10).join('') + '-' + h.slice(10,16).join('');
  };
}`;

/** As teclas com código virtual conhecido. `modificadores`: 2 = Ctrl, 8 = Shift (bitmask do CDP). */
export const TECLAS = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  F1: { key: 'F1', code: 'F1', vk: 112 },
  F3: { key: 'F3', code: 'F3', vk: 114 },
  F4: { key: 'F4', code: 'F4', vk: 115 },
  F8: { key: 'F8', code: 'F8', vk: 119 },
  F11: { key: 'F11', code: 'F11', vk: 122 },
  F12: { key: 'F12', code: 'F12', vk: 123 },
};

// ---------- parte PURA (o teste irmão cobre esta metade sem abrir navegador nenhum) ----------

/**
 * PURO: a expressão `~transaction` do ITS — a via de entrar numa tela JÁ PREENCHIDA, sem clicar.
 * `*TCODE campo=valor;campo=valor` com `DYNP_OKCODE` fechando é o que pula a tela de entrada
 * (medido: `*YJBV4029823 P_DOCNUM=71;DYNP_OKCODE=ONLI` abre a J1B1N com os dois itens montados).
 * Sem `parametros` nem `okcode` é a transação crua, e o `*` não entra.
 */
export function expressaoTransacao(tcode, { parametros = {}, okcode = null } = {}) {
  if (!tcode) throw new Error('expressaoTransacao: informe o tcode');
  const pares = Object.entries(parametros).map(([k, v]) => `${k}=${v}`);
  if (okcode) pares.push(`DYNP_OKCODE=${okcode}`);
  if (!pares.length) return String(tcode).toUpperCase();
  return `*${String(tcode).toUpperCase()} ${pares.join(';')}`;
}

/** PURO: a URL do WebGUI para o `cfg` da lib ({ base, client, idioma }). */
export function urlWebgui(cfg, { transacao = null, parametros = {}, okcode = null } = {}) {
  if (!cfg?.base) throw new Error('urlWebgui: cfg sem { base }');
  const q = new URLSearchParams();
  if (cfg.client) q.set('sap-client', cfg.client);
  if (cfg.idioma) q.set('sap-language', cfg.idioma);
  if (transacao) q.set('~transaction', expressaoTransacao(transacao, { parametros, okcode }));
  return `${cfg.base}/sap/bc/gui/sap/its/webgui?${q}`;
}

/**
 * PURO: a expressão JS que ACHA um elemento na tela. Três formas de apontar:
 *   `{ id }`      — `getElementById` (os ids do WebGUI têm `:` e `[]`, que quebram seletor CSS);
 *   `{ seletor }` — `querySelector`;
 *   `{ okcode }`  — o botão da barra pelo OK-code do SAP GUI (`btn[11]` Gravar, `btn[8]` Executar,
 *                   `btn[3]` Voltar). Medido: o WebGUI nomeia o botão com o MESMO `btn[n]`, num id
 *                   tipo `M0:50::btn[11]` — o prefixo muda por tela, o sufixo não, daí casar pelo
 *                   FIM do id. ⚠️ o container `::btn[n]` engloba texto oculto e o centro dele cai
 *                   FORA do botão (medido: o clique foi parar no grid de itens); quem tem o rect
 *                   certo é o filho `-cnt`.
 */
export function jsDoAlvo(alvo) {
  if (typeof alvo === 'string') return jsDoAlvo({ id: alvo });
  if (alvo?.id) return `document.getElementById(${JSON.stringify(alvo.id)})`;
  if (alvo?.seletor) return `document.querySelector(${JSON.stringify(alvo.seletor)})`;
  if (alvo?.okcode) {
    return `(() => {
      const cont = [...document.querySelectorAll('*')].find(e =>
        e.id && e.id.endsWith(${JSON.stringify('::' + alvo.okcode)}) && (e.offsetWidth || e.offsetHeight));
      if (!cont) return null;
      return document.getElementById(cont.id + '-cnt') || cont;
    })()`;
  }
  throw new Error('alvo: informe { id }, { seletor } ou { okcode } (ex. { okcode: "btn[11]" })');
}

/** PURO: como descrever o alvo numa mensagem de erro. */
export const nomeDoAlvo = (alvo) =>
  typeof alvo === 'string' ? `id ${alvo}`
    : alvo?.id ? `id ${alvo.id}`
    : alvo?.seletor ? `seletor ${alvo.seletor}`
    : `okcode ${alvo?.okcode}`;

/**
 * PURO: a expressão que diz se a dynpro TERMINOU de montar.
 *
 * ⚠️ NÃO exigir `document.title`: medido no SXD 816/100 em 03/09/2026 que a tela chamada por
 * `~transaction=*TCODE …;DYNP_OKCODE=ONLI` monta INTEIRA — 3.063 elementos com `ct` e 10 inputs
 * visíveis em 3 s — com o título VAZIO (ele só é preenchido depois). Com o título na condição a
 * espera estourava o teto de 60 s e o script lia uma tela pronta como se tivesse zero campo.
 * O sinal certo é contagem de controles do Unified Renderer (`[ct]`) + campos de entrada VISÍVEIS.
 */
export function jsTelaPronta({ minimoTexto = 200, minimoControles = 5, minimoCampos = 0 } = {}) {
  return `document.readyState === 'complete' &&
    !!document.body && (document.body.innerText || '').length >= ${minimoTexto} &&
    document.querySelectorAll('[ct]').length > ${minimoControles} &&
    [...document.querySelectorAll('input')].filter(e => e.offsetWidth || e.offsetHeight).length > ${minimoCampos}`;
}

/** PURO: o carimbo barato da tela — é ele que prova que ela TROCOU (rede quieta não prova nada). */
export const JS_CARIMBO = `document.title + '|' + document.querySelectorAll('*').length + '|' +
  ((document.body && document.body.innerText) || '').slice(0, 300)`;

/**
 * PURO: o header Basic do `cfg`. ⚠️ O ICF NÃO devolve 401 com `WWW-Authenticate` — devolve a
 * PÁGINA DE LOGON (título `Logon`), então nenhum mecanismo de desafio do navegador (nem o
 * `httpCredentials` do Playwright) autentica aqui: a credencial vai em TODA requisição, por header.
 */
export function autorizacao(cfg) {
  if (!cfg?.user || !cfg?.pass) throw new Error('webgui: cfg sem { user, pass } — o ICF não desafia, o Basic vai em todo request');
  return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64');
}

// ---------- navegador ----------

/** O Chrome desta máquina. `{ navegador }` ou `JBV_CHROME` apontam outro binário (o Edge é
 * Chromium e fala o mesmo CDP, mas NÃO foi medido com o WebGUI — se apontar, meça). */
export function acharNavegador({ navegador = process.env.JBV_CHROME } = {}) {
  const candidatos = navegador ? [navegador] : CAMINHOS_CHROME;
  const achado = candidatos.find((c) => fs.existsSync(c));
  if (!achado) throw new Error(`webgui: Chrome não achado — procurei em ${candidatos.join(', ')}. Aponte com { navegador } ou JBV_CHROME.`);
  return achado;
}

/**
 * PURO: as bandeiras que fazem o Chrome tratar um ICM em HTTP puro como ORIGEM SEGURA.
 *
 * ⚠️ Sem isto o canal morre em sistema que marca o cookie de sessão com `secure` — e é medição,
 * não teoria: no s4h 758/250 (2026-09-04) o `SAP_SESSIONID_S4H_250` vem `; secure; HttpOnly` sobre
 * `http://…:8000`; o Chrome DESCARTA o cookie (o `fetch` do Node não, por isso o mesmo GET parece
 * 200 feliz fora do navegador), a requisição seguinte sai sem sessão e a tela vira
 * **"400 Session not found"** numa URL `/sap(cz1TSUQ%3aANON%3a…)` — sessão ANÔNIMA. Aconteceu com
 * e sem `~transaction`, com Basic em toda requisição e só na primeira: é o cookie, não a URL.
 * No SXD 816/100 o mesmo canal roda porque lá o cookie NÃO vem `secure`.
 *
 * De quebra, a origem segura dá `crypto.randomUUID` NATIVO — mas o `POLYFILL_RANDOMUUID` continua
 * armado, porque quem desliga esta opção (`origemSegura: false`) cai no cadáver bonito.
 */
export function bandeirasDeOrigemSegura(base) {
  if (!base || !/^http:\/\//i.test(base)) return [];
  const origem = new URL(base).origin;
  return [
    `--unsafely-treat-insecure-origin-as-secure=${origem}`,
    '--test-type', // sem isto o Chrome ignora a bandeira acima e ainda avisa na barra
  ];
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Sobe o Chrome headless e devolve a sessão CDP `{ cfg, cmd, eventos, fechar }` já autenticada no
 * `cfg` e com o polyfill armado. Quem abre FECHA (o `fechar` mata o processo e some com o perfil).
 */
export async function abrirNavegador(cfg, { porta = 9222, largura = 1600, altura = 1000, tetoMs = 30000, navegador, origemSegura = true } = {}) {
  const chrome = acharNavegador({ navegador });
  const cabecalho = autorizacao(cfg); // recusa ANTES de subir navegador nenhum
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'jbv-webgui-'));
  passo(`webgui: subindo ${path.basename(chrome)} headless na porta ${porta}`);
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    ...(origemSegura ? bandeirasDeOrigemSegura(cfg.base) : []),
    `--window-size=${largura},${altura}`, 'about:blank',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();

  // o CDP só responde depois que o listener sobe — sondar, em vez de dormir um número mágico
  let alvo = null;
  const ate = Date.now() + tetoMs;
  while (Date.now() < ate && !alvo) {
    await espera(500);
    try {
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
      alvo = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* ainda subindo */ }
  }
  if (!alvo) {
    try { proc.kill(); } catch { /* já morreu */ }
    throw new Error(`webgui: CDP não respondeu na porta ${porta} em ${tetoMs} ms`);
  }

  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = () => err(new Error('webgui: WebSocket do CDP falhou')); });

  let seq = 0;
  const pendentes = new Map();
  const eventos = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) {
      const { ok, err } = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? err(new Error(`${m.error.message} (${JSON.stringify(m.error.data ?? '')})`)) : ok(m.result);
    } else if (m.method) eventos.push(m);
  };
  const cmd = (method, params = {}) => new Promise((ok, err) => {
    const id = ++seq;
    pendentes.set(id, { ok, err });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await cmd('Page.enable');
  await cmd('Network.enable');
  await cmd('Runtime.enable');
  await cmd('Network.setExtraHTTPHeaders', { headers: { Authorization: cabecalho } });
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: POLYFILL_RANDOMUUID });
  // headless não tem janela em foco, e o Unified Renderer só reage a evento em página focada
  await cmd('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await cmd('Page.bringToFront').catch(() => {});

  const fechar = async () => {
    try { ws.close(); } catch { /* já fechado */ }
    try { await fetch(`http://127.0.0.1:${porta}/json/close/${alvo.id}`); } catch { /* já foi */ }
    try { proc.kill(); } catch { /* já morreu */ }
    await espera(300);
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o Chrome ainda segura */ }
  };
  return { cfg, cmd, eventos, fechar, porta, perfil };
}

// ---------- ler a tela ----------

/** Roda JS na página e devolve o valor. É por aqui que se LÊ o que a dynpro mostra. */
export async function avaliar(sessao, expressao) {
  const r = await sessao.cmd('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(`webgui: JS falhou — ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
  }
  return r.result?.value;
}

export const titulo = (sessao) => avaliar(sessao, 'document.title');

/** O carimbo da tela agora — comparar dois é o que prova que ela trocou. */
export const carimbo = (sessao) => avaliar(sessao, JS_CARIMBO);

/** Espera a tela parar de mexer (o WebGUI troca de dynpro por XHR, sem `load`). */
export async function esperarQuieto(sessao, { quietoMs = 2000, tetoMs = 30000 } = {}) {
  const ate = Date.now() + tetoMs;
  let ultimo = Date.now();
  let visto = sessao.eventos.length;
  while (Date.now() < ate) {
    await espera(200);
    if (sessao.eventos.length > visto) { visto = sessao.eventos.length; ultimo = Date.now(); }
    if (Date.now() - ultimo > quietoMs) return true;
  }
  return false;
}

/** Espera a tela deixar de ser a de `antes`. `false` = nada mudou dentro do teto (a ação não pegou). */
export async function esperarMudanca(sessao, antes, { tetoMs = 30000, quietoMs = 1200 } = {}) {
  const ate = Date.now() + tetoMs;
  while (Date.now() < ate) {
    await espera(250);
    if (await carimbo(sessao) !== antes) {
      // trocou: deixar assentar (o Unified Renderer ainda pinta) antes de ler ou printar
      let c = await carimbo(sessao);
      const fim = Date.now() + quietoMs;
      while (Date.now() < fim) {
        await espera(250);
        const d = await carimbo(sessao);
        if (d !== c) c = d;
      }
      return true;
    }
  }
  return false;
}

/**
 * Navega e espera a dynpro montar.
 * ⚠️ "rede quieta" NÃO serve como sinal de pronto: se o servidor demora a COMEÇAR a responder, a
 * página ainda está em `about:blank` e o silêncio é lido como tela pronta. Espera-se CONTEÚDO
 * (`jsTelaPronta`) e só depois se deixa assentar.
 */
export async function ir(sessao, url, { tetoMs = 60000, ...pronta } = {}) {
  detalhe(`webgui: ir ${url}`);
  await sessao.cmd('Page.navigate', { url });
  const expressao = jsTelaPronta(pronta);
  const ate = Date.now() + tetoMs;
  while (Date.now() < ate) {
    await espera(300);
    if (await avaliar(sessao, expressao).catch(() => false)) break;
  }
  await esperarQuieto(sessao, { quietoMs: 1500, tetoMs: 20000 });
  return await titulo(sessao);
}

/** Abre uma transação — já preenchida, quando `parametros`/`okcode` são dados. */
export async function abrirTransacao(sessao, tcode, { parametros, okcode, ...opts } = {}) {
  return await ir(sessao, urlWebgui(sessao.cfg, { transacao: tcode, parametros, okcode }), opts);
}

/** O que a tela mostra agora: título, statusbar e os campos PREENCHIDOS. */
export function lerTela(sessao) {
  return avaliar(sessao, `(() => {
    const campos = [...document.querySelectorAll('input,textarea')]
      .filter(e => (e.offsetWidth || e.offsetHeight) && e.value)
      .map(e => ({ id: e.id, titulo: e.title, valor: e.value }));
    const barra = [...document.querySelectorAll('[id*="sapMsg"],[class*="urMsgBar"],[class*="lsMessageBar"],[role="status"]')]
      .map(e => e.innerText.trim()).filter(Boolean);
    return { titulo: document.title, statusbar: barra, campos };
  })()`);
}

/**
 * Os campos de entrada da dynpro atual (fora a caixa de OK-code da barra).
 * ⚠️ O `title` vem do DATA ELEMENT, não do texto do parâmetro na tela — medido: `P_DOCNUM` aparece
 * como "Nº documento", não como o texto do parâmetro no report.
 */
export function campos(sessao) {
  return avaliar(sessao, `[...document.querySelectorAll('input,textarea')]
    .filter(e => (e.offsetWidth || e.offsetHeight) && e.id && e.id !== 'ToolbarOkCode')
    .map(e => ({ id: e.id, title: e.title, value: e.value }))`);
}

/** Os `btn[n]` que ESTA tela oferece — o que dá para acionar, antes de tentar. */
export function botoes(sessao) {
  return avaliar(sessao, `[...document.querySelectorAll('*')]
    .filter(e => (e.offsetWidth || e.offsetHeight) && e.id && e.id.indexOf('::btn') > 0 &&
                 e.id.charAt(e.id.length - 1) === ']')
    .map(e => ({ okcode: e.id.split('::').pop(), title: e.title, texto: (e.innerText||'').trim().slice(0,30) }))`);
}

export async function print(sessao, arquivo) {
  const r = await sessao.cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(arquivo, Buffer.from(r.data, 'base64'));
  detalhe(`webgui: print em ${arquivo}`);
  return arquivo;
}

// ---------- dirigir a tela ----------
//
// Mouse e teclado DE VERDADE (`Input.dispatch*`), nunca `.value =` ou `.click()`: o Unified
// Renderer escuta o evento NATIVO, e um value setado na marra não chega ao programa ABAP.

/**
 * Onde clicar, de verdade. Duas coisas medidas que fazem o clique cair no vazio:
 *  1. `scrollIntoView` é ASSÍNCRONO — ler o `getBoundingClientRect` no mesmo tick devolve o rect
 *     ANTIGO (medido: rect em y=873 e clique enviado para y=452);
 *  2. o alvo pode estar COBERTO — daí conferir com `elementFromPoint` quem está no ponto.
 */
export async function apontar(sessao, alvo) {
  const js = jsDoAlvo(alvo);
  const rolou = await avaliar(sessao, `(() => {
    const e = ${js};
    if (!e) return false;
    const b = e.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) { e.scrollIntoView({ block: 'center' }); return true; }
    return false;
  })()`);
  if (rolou) await espera(300);
  return await avaliar(sessao, `(() => {
    const e = ${js};
    if (!e) return null;
    const b = e.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    const no = document.elementFromPoint(x, y);
    return { id: e.id, title: e.title, x, y, noPonto: no ? (no.id || no.tagName) : null,
             coberto: !(no === e || e.contains(no) || (no && no.contains(e))) };
  })()`);
}

/** O gesto de mouse INTEIRO. Medido: press+release sem `buttons` e sem o `mouseMoved` antes não
 * aciona o Unified Renderer. */
export async function clique(sessao, p) {
  await sessao.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0 });
  await sessao.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  await sessao.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
}

/**
 * Clica um alvo (`{ id }`, `{ seletor }` ou `{ okcode }`). Com `{ esperarResposta: true }` devolve
 * `mudou: false` quando a tela ficou IGUAL — que é como se descobre que a ação não pegou (é assim
 * que `btn[15]` e `btn[12]` se denunciam neste canal).
 */
export async function clicar(sessao, alvo, { tetoMs = 20000, esperarResposta = false } = {}) {
  const ate = Date.now() + tetoMs;
  let p = null;
  while (Date.now() < ate && !p) {
    p = await apontar(sessao, alvo);
    if (!p) await espera(400);
  }
  if (!p) throw new Error(`webgui: clicar — ${nomeDoAlvo(alvo)} não está na tela (${tetoMs} ms)`);
  const antes = esperarResposta ? await carimbo(sessao) : null;
  await clique(sessao, p);
  if (esperarResposta) p.mudou = await esperarMudanca(sessao, antes);
  return p;
}

/** Aciona um botão da barra pelo OK-code do SAP GUI e espera a resposta do ABAP. */
export const acionar = (sessao, okcode, opts = {}) => clicar(sessao, { okcode }, { ...opts, esperarResposta: true });

export const digitar = (sessao, texto) => sessao.cmd('Input.insertText', { text: String(texto) });

export async function tecla(sessao, nome, { modificadores = 0, assentar = true } = {}) {
  const t = TECLAS[nome];
  if (!t) throw new Error(`webgui: tecla desconhecida "${nome}" — tenho ${Object.keys(TECLAS).join(', ')}`);
  const base = { key: t.key, code: t.code, windowsVirtualKeyCode: t.vk, nativeVirtualKeyCode: t.vk, modifiers: modificadores };
  await sessao.cmd('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await sessao.cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  if (assentar) await esperarQuieto(sessao);
}

/** Preenche um campo: clica nele, seleciona o que estiver lá, apaga e digita. Devolve o que ficou. */
export async function preencher(sessao, alvo, valor) {
  const js = jsDoAlvo(alvo);
  await clicar(sessao, alvo);
  await avaliar(sessao, `(() => { const e = ${js}; if (e && e.select) e.select(); })()`);
  await tecla(sessao, 'Delete', { assentar: false });
  await digitar(sessao, valor);
  return await avaliar(sessao, `(${js} || {}).value`);
}
