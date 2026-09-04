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
//     ⚠ Limite DESTE MÓDULO, não do canal: medido no s4h 758/250 em 04/09/2026 que o ITS fala um
//     protocolo HTTP simples e o `fetch` do Node lê, ESCREVE e ACIONA a dynpro sem Chrome nenhum,
//     em ~0,95 s contra 9 s — docs/receita-webgui.md § O protocolo do ITS por HTTP puro.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { passo, detalhe } from './log.mjs';
import { encerrarSessao } from './sap-connection.mjs';

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

/**
 * O MAPA dos OK-codes da barra — o endereçamento ESTÁVEL deste canal.
 *
 * Medido no SXD 816/100 (03/09/2026, SE38 e Writer da J1B1N) e no s4h 758/250 (04/09/2026, SE16):
 * o WebGUI nomeia o botão da barra com o MESMO `btn[n]` do SAP GUI (o SID `wnd[0]/tbar[0]/btn[n]`),
 * num id de DOM tipo `M0:48::btn[8]`. O prefixo `M0:nn` MUDA por tela — na mesma sessão da SE38 os
 * botões saíram em `M0:48`, `M0:49`, `M0:55` e `M0:56`, e no Writer da J1B1N em `M0:50` — mas o
 * sufixo `::btn[n]` NÃO muda. Daí casar pelo FIM do id (`jsDoAlvo`), nunca pelo id inteiro.
 *
 * ⚠️ Isto é APELIDO, não whitelist: `{ okcode: 'btn[42]' }` continua valendo. Só entra aqui o que
 * foi LIDO de uma tela de verdade — o resto da convenção do SAP GUI fica de fora de propósito,
 * para o mapa não virar palpite com cara de medição.
 */
export const OKCODES = {
  'btn[0]': { nome: 'Enter', apelidos: ['Continuar'], tecla: 'Enter',
    medido: 's4h 758/250 04/09/2026 — SE16: acionado, a tela virou "Data Browser: tabela T000: tela de seleção"' },
  'btn[3]': { nome: 'Voltar', apelidos: [], tecla: 'F3',
    medido: 'SXD 816/100 03/09/2026 — SE38: id M0:56::btn[3]' },
  'btn[8]': { nome: 'Executar', apelidos: [], tecla: 'F8',
    medido: 'SXD 816/100 03/09/2026 — SE38: id M0:48::btn[8], title " (F8)", lsdata {"0":"Executar"}' },
  'btn[11]': { nome: 'Gravar', apelidos: [], tecla: 'Ctrl+S',
    medido: 'SXD 816/100 03/09/2026 — Writer da J1B1N: M0:50::btn[11] criou a NF 0000000082, confirmada em outra LUW' },
  'btn[12]': { nome: 'Cancelar', apelidos: [], tecla: 'Escape',
    medido: 'SXD 816/100 03/09/2026 — Writer: M0:50::btn[12]. ⚠️ posta e o programa REABRE a mesma dynpro' },
  'btn[15]': { nome: 'Encerrar', apelidos: ['Sair'], tecla: 'Shift+F3',
    medido: 'SXD 816/100 03/09/2026 — SE38: M0:55::btn[15]. ⚠️ sem via de saída neste canal (fila adt-client, item 13)' },
  'btn[71]': { nome: 'Procurar', apelidos: [], tecla: null,
    medido: 'SXD 816/100 03/09/2026 — SE38: id M0:49::btn[71]' },
  'btn[86]': { nome: 'Imprimir', apelidos: [], tecla: null,
    medido: 'SXD 816/100 03/09/2026 — SE38: id M0:49::btn[86]' },
};

/** PURO: dois nomes de botão são o mesmo? Caixa e acento não contam — o `nome` vem do texto
 * da tela, e "Gravar"/"gravar" têm de casar. */
const mesmoNome = (a, b) =>
  String(a).trim().localeCompare(String(b).trim(), 'pt', { sensitivity: 'base' }) === 0;

/**
 * PURO: normaliza o que se pede da barra em `btn[n]`. Aceita o próprio `btn[11]`, só o número
 * (`11`, `'11'`) e o apelido MEDIDO (`'Gravar'`, `'gravar'`, `'Sair'`). Apelido desconhecido
 * estoura AQUI, com a lista — errar o nome não pode virar "não está na tela" 20 s depois.
 */
export function okcodeDe(alvo) {
  if (alvo === null || alvo === undefined || alvo === '') {
    throw new Error('okcodeDe: informe o btn[n], o número ou o apelido (ex. "btn[11]", 11, "Gravar")');
  }
  const bruto = String(alvo).trim();
  if (/^btn\[\d+\]$/i.test(bruto)) return bruto.toLowerCase();
  if (/^\d+$/.test(bruto)) return `btn[${Number(bruto)}]`;
  const achado = Object.entries(OKCODES).find(([, v]) =>
    mesmoNome(v.nome, bruto) || (v.apelidos ?? []).some((a) => mesmoNome(a, bruto)));
  if (achado) return achado[0];
  const conhecidos = Object.entries(OKCODES).map(([k, v]) => `${v.nome}=${k}`).join(', ');
  throw new Error(`okcodeDe: "${bruto}" não é btn[n] nem apelido conhecido — tenho ${conhecidos}`);
}

/** PURO: junta ao que a tela devolveu o apelido conhecido do OK-code (`nome`, `tecla`). Botão fora
 * do mapa sai com `nome: null` — é botão da tela, não erro. */
export const anotarBotoes = (lista = []) => lista.map((b) => ({
  ...b, nome: OKCODES[b.okcode]?.nome ?? null, tecla: OKCODES[b.okcode]?.tecla ?? null,
}));

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
    const okcode = okcodeDe(alvo.okcode); // 'Gravar', 11 e 'btn[11]' chegam no mesmo lugar
    return `(() => {
      const cont = [...document.querySelectorAll('*')].find(e =>
        e.id && e.id.endsWith(${JSON.stringify('::' + okcode)}) && (e.offsetWidth || e.offsetHeight));
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
    : `okcode ${(() => { try { return okcodeDe(alvo?.okcode); } catch { return alvo?.okcode; } })()}`;

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

// ---------- disponibilidade do canal ----------

/**
 * PURO: o veredito da sonda, a partir do que o ICM devolveu ao GET do nó do WebGUI.
 *
 * ⚠️ **O STATUS SOZINHO MENTE, e mente para o lado perigoso.** Medido no s4h 758/250 em
 * 04/09/2026: com credencial ERRADA (usuário inexistente) e SEM credencial nenhuma, o nó responde
 * **200 OK** com 23 KB da PÁGINA DE LOGON (`<title>Logon</title>`, cookie `sap-login-XSRF_S4H`) —
 * não 401, não `WWW-Authenticate`. Uma sonda que olhasse só o `res.status` diria "WebGUI ok" e o
 * Chrome subiria para encalhar numa tela de logon. O que separa os dois casos é o COOKIE: só o
 * logon aceito devolve `SAP_SESSIONID_<SID>_<MANDANTE>` (35 KB de tela, em 423 ms).
 *
 * Os quatro casos, todos medidos no mesmo sistema e no mesmo dia:
 *
 * | caso                         | o que volta                                                    |
 * |------------------------------|----------------------------------------------------------------|
 * | nó ativo, credencial aceita  | 200 + `SAP_SESSIONID_S4H_250` (35 216 bytes, 423 ms)           |
 * | credencial errada/ausente    | **200** + `sap-login-XSRF_S4H`, `<title>Logon</title>` (23 246) |
 * | nó ausente OU desativado     | 404 `Service cannot be reached` (9 314 bytes, ~60 ms)          |
 * | ICM fora do ar               | nenhuma resposta HTTP (`ENOTFOUND`, timeout)                   |
 *
 * ⚠️ **Ausente e desativado são o MESMO 404** — o ICF não os separa, de propósito. Medido: o path
 * inventado `/sap/bc/gui/sap/its/webgui_jbv_naoexiste` e o nó `/sap/bc/gui/sap/its/test` — que
 * EXISTE na `ICFSERVICE`, irmão do `webgui` — devolvem byte a byte a mesma página de 9 314 bytes.
 * Daí a causa `sem-no` não prometer qual dos dois é: só a SICF do sistema responde isso.
 * (Fica aberto: que o `test` esteja 404 por DESATIVAÇÃO não foi lido do sistema — a leitura do
 * estado do nó por classrun não rodou; o que está medido é que existir na ICFSERVICE não muda o 404.)
 *
 * Ainda medidos, no mesmo varrimento: 403 `Forbidden - SSL required` (nó que exige HTTPS, ex.
 * `/sap/bc/ui2/start_up`), 401 `Logon failed` (nó que DESAFIA em vez de mostrar formulário, ex.
 * `/sap/bc/srt/lsc`) e 500 `Application Server Error`. Cada um vira uma causa própria: o que a
 * sonda não pode fazer é empilhar tudo em "não deu".
 */
export function interpretarSonda({ status = null, statusText = '', cookies = [], corpo = '', erro = null } = {}) {
  if (erro) return { ok: false, causa: 'sem-icm', motivo: `sem resposta do ICM: ${erro}`, status: null };
  const nomes = cookies.map((c) => c.split('=')[0].trim());
  const sessao = cookies.find((c) => /^SAP_SESSIONID_/i.test(c));
  const base = { status, bytes: corpo.length, cookies: nomes };
  const rotulo = `${status}${statusText ? ` ${statusText}` : ''}`;

  if (status === 200 && sessao) {
    const [, sid = null, mandante = null] = sessao.split('=')[0].match(/^SAP_SESSIONID_([^_]+)_(.+)$/i) || [];
    // o `secure` sobre HTTP puro é o que decide a bandeira do Chrome (ver bandeirasDeOrigemSegura)
    return { ...base, ok: true, causa: 'ok', motivo: 'nó ativo e logon aceito', sid, mandante, cookieSeguro: /;\s*secure/i.test(sessao) };
  }
  if (status === 200) {
    const logon = nomes.some((n) => /^sap-login-XSRF/i.test(n)) || /<title>\s*Logon\s*<\/title>/i.test(corpo);
    return logon
      ? { ...base, ok: false, causa: 'credencial', motivo: '200, mas a resposta é a PÁGINA DE LOGON — o ICF não desafia, ele devolve formulário' }
      : { ...base, ok: false, causa: 'inesperado', motivo: '200 sem cookie de sessão e sem página de logon' };
  }
  if (status === 401) return { ...base, ok: false, causa: 'credencial', motivo: `${rotulo} — o nó desafia por Basic e a credencial não passou` };
  if (status === 404) return { ...base, ok: false, causa: 'sem-no', motivo: `${rotulo} — nó ICF ausente OU desativado na SICF (o ICF não distingue os dois)` };
  if (status === 403) {
    const ssl = /SSL required/i.test(statusText) || /SSL required/i.test(corpo);
    return { ...base, ok: false, causa: ssl ? 'ssl' : 'proibido', motivo: ssl ? `${rotulo} — o nó só atende por HTTPS` : `${rotulo} — o ICF recusou o acesso` };
  }
  if (status >= 500) return { ...base, ok: false, causa: 'erro-servidor', motivo: `${rotulo} — o servidor de aplicação falhou ao atender o nó` };
  return { ...base, ok: false, causa: 'inesperado', motivo: `${rotulo} — resposta não prevista` };
}

/**
 * Dá para usar o WebGUI NESTE sistema? Um GET no nó, e o veredito do `interpretarSonda`.
 *
 * É a pergunta que se faz ANTES de subir Chrome nenhum: o nó `/sap/bc/gui/sap/its/webgui` roda no
 * MESMO ICM da porta 8000 e com a MESMA credencial Basic do ADT (não há setup adicional), mas num
 * sistema de cliente ele costuma estar desativado na SICF — e aí o canal simplesmente não existe
 * lá. Mesma função que o `verificarScriptingNoServidor` faz para o GUI Scripting, mais barata:
 * só um GET, nada de deploy.
 *
 * ⚠️ **QUEM SONDA FECHA.** O GET bem-sucedido não é leitura inócua: ele ABRE uma sessão de diálogo
 * no servidor (é o `SAP_SESSIONID` que prova o sucesso). Medido em 04/09/2026: uma varredura de
 * ~120 GETs sem logoff foi seguida de o POST do ADT do MESMO usuário passar a responder
 * `Service nicht erreichbar` — a atribuição causal não foi isolada, mas a regra da lib já era
 * "quem abre fecha" e aqui ela tem dente. O logoff sai daqui sempre que houve cookie.
 */
export async function sondarWebgui(cfg, { tetoMs = 15000 } = {}) {
  const url = urlWebgui(cfg);
  const cabecalho = autorizacao(cfg); // recusa cfg sem credencial ANTES de tocar a rede
  passo(`webgui: sondando ${url}`);
  const t = Date.now();
  let res, corpo;
  try {
    res = await fetch(url, { headers: { Authorization: cabecalho }, redirect: 'manual', signal: AbortSignal.timeout(tetoMs) });
    corpo = await res.text();
  } catch (e) {
    const r = { ...interpretarSonda({ erro: e.cause?.code || e.name }), url, ms: Date.now() - t };
    detalhe(`webgui: ${r.causa} — ${r.motivo}`);
    return r;
  }
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const r = { ...interpretarSonda({ status: res.status, statusText: res.statusText, cookies, corpo }), url, ms: Date.now() - t };
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  if (cookie) await encerrarSessao({ cfg, cookie }).catch((e) => detalhe(`webgui: logoff da sonda falhou (${e.message})`));
  detalhe(`webgui: ${r.causa} — ${r.motivo}`);
  return r;
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

// ---------- ler a tela pelo que ELA declara (lsdata), não por heurística de DOM ----------
//
// Todo controle do Unified Renderer carrega três atributos que são um MODELO da dynpro, não pixel:
//   `ct`       — o tipo do controle (`CBS` campo, `B` botão, `R_standards` radio, `C_standards`
//                checkbox, `STCS` grid ALV, `MB` barra de mensagem, `PL` janela, `L` rótulo);
//   `lsdata`   — um JSON de índices NUMÉRICOS com rótulo, tooltip, tecla, SID e flags;
//   `lsevents` — os eventos que ele publica (`{"Press":[{},{"1":"action/3"}]}`).
//
// Medido no s4h 758/250 em 04/09/2026 sobre 7 telas (menu, SE38, SE16, SE11, SM30, tela de seleção
// do RSPARAM e a lista ALV do RSPARAM), bruto e agregado em
// `sap-accelerate/work/POC_webgui_lsdata/medicoes/` — 49 `ct` distintos, 37 com `lsdata`.
//
// ⚠️ **O ÍNDICE NÃO É ESTÁVEL ENTRE TIPOS.** O SID mora em `27` no botão, `21` no campo, `19` no
// rótulo, `13` no radio, `14` no checkbox, `12` no box, `11` na barra de mensagem, `34` no grid e
// `1` na janela. Hard-codear `lsdata['21']` acerta o campo e MENTE para todo o resto — daí tudo
// aqui endereçar por CONTEÚDO (o valor que tem `.SID`), nunca por posição.
//
// ⚠️ **`lsdata` é o estado que o SERVIDOR mandou, não o que está na tela agora.** Medido: clicar no
// checkbox `chkALSOUSUB` da tela de seleção do RSPARAM não mexeu UM byte do `lsdata` — quem virou
// foi `aria-checked` (`false` → `true`) e a classe (`lsCheckBox--unchecked` → `--checked`). Então
// marcação de radio/checkbox sai do ARIA; identidade, rótulo, tecla e SID saem do `lsdata`.

/** PURO: o SID do SAP GUI de um `lsdata` — pelo VALOR que o carrega, não pelo índice. */
export function sidDoLsdata(lsdata) {
  if (!lsdata || typeof lsdata !== 'object') return null;
  for (const [indice, v] of Object.entries(lsdata)) {
    if (v && typeof v === 'object' && typeof v.SID === 'string') return { ...v, indice };
  }
  return null;
}

/**
 * PURO: o nome do campo que a URL `~transaction` quer, a partir do SID (a peça do item 18).
 * `wnd[0]/usr/ctxtRS38M-PROGRAMM` → `RS38M-PROGRAMM`. Os prefixos são os do SAP GUI: `ctxt` campo
 * com busca, `txt` texto, `rad` radio, `chk` checkbox, `cmb` combo, `lbl` rótulo, `box` box.
 */
export function campoDoSid(sid) {
  if (!sid) return null;
  const folha = String(sid).split('/').pop();
  const m = /^(ctxt|txt|rad|chk|cmb|lbl|box|tbl|sub)(.+)$/.exec(folha);
  return m ? m[2] : folha;
}

/** PURO: o papel de um controle, pelo `Type` que o PRÓPRIO SAP põe no SID. */
export const PAPEL_POR_TIPO = {
  GuiCTextField: 'campo', GuiTextField: 'campo', GuiPasswordField: 'campo', GuiComboBox: 'campo',
  GuiOKCodeField: 'okcode', GuiRadioButton: 'radio', GuiCheckBox: 'checkbox', GuiButton: 'botao',
  GuiGridView: 'grid', GuiMainWindow: 'janela', GuiModalWindow: 'janela', MESSAGEBAR: 'mensagem',
  GuiLabel: 'rotulo', GuiBox: 'grupo',
};

/**
 * PURO: a tecla de atalho de um botão — a CONSTANTE (`F8`, `CTRL_F2`, `SHIFT_F9`), não o tooltip.
 * Medido: ela é o único valor do `lsdata` com essa forma; o tooltip é `"Executar (F8)"`.
 */
export function teclaDoBotao(lsdata = {}) {
  return Object.values(lsdata).find((v) => typeof v === 'string' &&
    /^(F\d{1,2}|(CTRL|SHIFT|ALT)(_(CTRL|SHIFT|ALT))*_(F\d{1,2}|[A-Z0-9]))$/.test(v)) ?? null;
}

/**
 * PURO: o rótulo LEGÍVEL de um controle — a primeira linha do texto; na falta dela, o tooltip sem
 * a tecla no fim.
 *
 * ⚠️ Duas coisas medidas, as duas produzindo lixo se ignoradas: (1) o `innerText` do botão traz
 * texto OCULTO do tema colado por `\n` (`btn[8]` sai `"Executar\n Destacado"` — "Destacado" é a
 * pista ARIA do design `EMPHASIZED`); (2) botão da `tbar[0]` NÃO tem texto nenhum, e cair no
 * primeiro valor string do `lsdata` devolve a CONSTANTE DE DESIGN (`btn[3]` → `"TRANSPARENT"`, não
 * `"Voltar"`). O tooltip é quem sabe: `"Voltar (F3)"`, `"Verificar (Ctrl+F2)"`.
 */
export function rotuloLimpo(texto, dica) {
  const primeira = String(texto || '').split('\n')[0].trim();
  if (primeira) return primeira;
  const semTecla = String(dica || '').replace(/\s*\((?:Ctrl|Shift|Alt|F\d)[^)]*\)\s*$/i, '').trim();
  return semTecla || null;
}

/**
 * PURO: um controle bruto (id/ct/lsdata/aria/DOM) virando peça de tela.
 *
 * O `rotulo` sai do `lsdata` do próprio controle quando ele tem um (botão, radio, checkbox); o
 * campo de entrada NÃO tem — o texto dele está no `L` ao lado, e é o `montarTela` que costura.
 * ⚠️ O `title` do campo vem do DATA ELEMENT, não do texto na tela: na SE38 o title é
 * "Nome do programa ABAP" e o rótulo da tela é "Programa". Por isso `dica` ≠ `rotulo`.
 */
export function interpretarControle(bruto) {
  const sid = sidDoLsdata(bruto.lsdata);
  const papel = PAPEL_POR_TIPO[sid?.Type] ?? null;
  const d = bruto.lsdata || {};
  const textos = Object.values(d).filter((v) => typeof v === 'string');  // só a mensagem usa
  const base = {
    id: bruto.id, ct: bruto.ct, papel, sid: sid?.SID ?? null, tipoGui: sid?.Type ?? null,
    campo: campoDoSid(sid?.SID), visivel: !!bruto.visivel,
  };
  switch (papel) {
    case 'campo': case 'okcode':
      return { ...base, valor: bruto.valor ?? '', dica: bruto.title ?? null,
        maxlen: sid?.maxlen ?? null, editavel: !(bruto.desabilitado || bruto.somenteLeitura) };
    case 'radio':
      // o grupo é o `%RBGnnnn` — o mesmo valor no lsdata do controle e no `group` do SID
      return { ...base, grupo: sid?.group ?? null, rotulo: rotuloLimpo(bruto.texto, bruto.title),
        dica: bruto.title ?? null, selecionado: bruto.aria === 'true' };
    case 'checkbox':
      // o innerText vem com o `:` do layout CHECKBOXLAST grudado na frente
      return { ...base, rotulo: rotuloLimpo((bruto.texto || '').replace(/^:\s*/, ''), bruto.title),
        dica: bruto.title ?? null, marcado: bruto.aria === 'true' };
    case 'botao': {
      // o `btn[n]` é o OK-code — e ele está no FIM do SID (`wnd[0]/tbar[1]/btn[8]`)
      const okcode = /\/(btn\[\d+\])$/.exec(sid?.SID || '')?.[1] ?? null;
      return { ...base, okcode, rotulo: rotuloLimpo(bruto.texto, bruto.title), dica: bruto.title ?? null,
        tecla: teclaDoBotao(d), accesskey: bruto.accesskey ?? null };
    }
    case 'grid':
      return { ...base, colunas: sid?.ColumnIDs ?? null, linhas: sid?.totalRows ?? null,
        editavel: sid?.editable ?? null };
    case 'janela':
      return { ...base, principal: sid?.Type === 'GuiMainWindow' };
    case 'mensagem':
      // sem mensagem o lsdata fica `{"1":"TEXT","3":"NONE"}` e o applicationText vazio; COM
      // mensagem entram o texto e a CONSTANTE do tipo (`ERROR`) — o `messageType` do SID vem
      // TRADUZIDO ("Erro"), então quem serve de chave é a constante.
      return { ...base, tipo: sid?.applicationText ? textos.find((t) => /^[A-Z_]+$/.test(t)) ?? null : null,
        texto: sid?.applicationText || null };
    case 'rotulo':
      return { ...base, texto: bruto.texto || null };
    default:
      return base;
  }
}

/**
 * PURO: os controles interpretados viram UMA tela.
 *
 * O rótulo de cada campo é costurado aqui: o `L` guarda, em algum índice, o **id do campo que ele
 * rotula** — e o índice varia, então o casamento é por conteúdo (o valor string que É um id da
 * tela), a mesma regra do SID.
 */
export function montarTela(brutos, { titulo = null } = {}) {
  const controles = brutos.map(interpretarControle);
  const ids = new Set(brutos.map((b) => b.id).filter(Boolean));
  const rotuloDoId = new Map();
  for (const b of brutos) {
    if (PAPEL_POR_TIPO[sidDoLsdata(b.lsdata)?.Type] !== 'rotulo') continue;
    const alvo = Object.values(b.lsdata || {}).find((v) => typeof v === 'string' && v !== b.id && ids.has(v));
    const texto = (b.texto || '').trim();
    if (alvo && texto) rotuloDoId.set(alvo, texto);
  }
  const dePapel = (p) => controles.filter((c) => c.papel === p);
  const vis = (lista) => lista.filter((c) => c.visivel);
  const mensagem = dePapel('mensagem').find((m) => m.texto) ?? null;
  return {
    titulo,
    janela: dePapel('janela')[0] ?? null,
    mensagem: mensagem ? { tipo: mensagem.tipo, texto: mensagem.texto } : null,
    statusbar: mensagem ? [mensagem.texto] : [],          // compat com o `lerTela` antigo
    campos: vis(dePapel('campo')).map((c) => ({ ...c, rotulo: rotuloDoId.get(c.id) ?? null })),
    radios: vis(dePapel('radio')),
    checkboxes: vis(dePapel('checkbox')),
    botoes: vis(dePapel('botao')).filter((b) => b.okcode),
    grids: vis(dePapel('grid')),
    okcode: dePapel('okcode')[0] ?? null,                 // invisível (rect 0×0), mas está lá
  };
}

/** PURO: o despejo bruto de TODO controle com `ct` — o insumo do `montarTela`. */
export const JS_DESPEJO_CONTROLES = `[...document.querySelectorAll('[ct]')].map((el) => {
  let lsdata = null; try { lsdata = JSON.parse(el.getAttribute('lsdata') || 'null'); } catch (x) {}
  return { id: el.id || null, ct: el.getAttribute('ct'), lsdata,
    title: el.title || null, aria: el.getAttribute('aria-checked'),
    accesskey: el.getAttribute('data-sap-ls-accesskey'),
    valor: 'value' in el ? el.value : null, desabilitado: !!el.disabled, somenteLeitura: !!el.readOnly,
    texto: (el.innerText || '').trim().slice(0, 120) || null,
    visivel: !!(el.offsetWidth || el.offsetHeight) };
})`;

/**
 * O que a tela É agora — o modelo, não o innerText: `{ titulo, janela, mensagem, statusbar,
 * campos, radios, checkboxes, botoes, grids, okcode }`. Cada peça traz o **SID** (o endereço do
 * SAP GUI) e o **campo** (o nome que a URL `~transaction` quer), então dá para responder "qual o
 * parâmetro certo para esta tela" sem adivinhar nome nenhum.
 *
 * `janela.principal === false` é POPUP (`wnd[1]`), e `mensagem.tipo` é a constante do SAP
 * (`ERROR`, `WARNING`, `SUCCESS`…) — medido: `ERROR` + "O programa ZZNAOEXISTE9 não existe".
 */
export async function lerTela(sessao) {
  const [brutos, titulo] = await Promise.all([
    avaliar(sessao, JS_DESPEJO_CONTROLES),
    avaliar(sessao, 'document.title'),
  ]);
  return montarTela(brutos, { titulo });
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

/**
 * Os `btn[n]` que ESTA tela oferece — o que dá para acionar, antes de tentar. Casa pelo sufixo
 * `::btn[n]` (o prefixo `M0:nn` muda por tela, § OKCODES) e anota o apelido MEDIDO de cada um:
 * `{ okcode: 'btn[11]', title: 'Gravar (Ctrl+S)', nome: 'Gravar', tecla: 'Ctrl+S' }`. Botão fora do
 * mapa sai com `nome: null` — é botão da tela, não erro.
 */
export async function botoes(sessao) {
  return anotarBotoes(await avaliar(sessao, `[...document.querySelectorAll('*')]
    .filter(e => (e.offsetWidth || e.offsetHeight) && e.id && e.id.indexOf('::btn') > 0 &&
                 e.id.charAt(e.id.length - 1) === ']')
    .map(e => ({ okcode: e.id.split('::').pop(), title: e.title, texto: (e.innerText||'').trim().slice(0,30) }))`));
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

/**
 * Aciona um botão da barra pelo OK-code do SAP GUI e espera a resposta do ABAP. Aceita as três
 * formas do `okcodeDe`: `acionar(s, 'btn[11]')`, `acionar(s, 11)` e `acionar(s, 'Gravar')`.
 * ⚠️ `mudou: false` é INFORMAÇÃO: a tela ficou igual, a ação não pegou (é assim que `btn[15]` e
 * `btn[12]` se denunciam neste canal).
 */
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
