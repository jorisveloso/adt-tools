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
// ⚠️ O que esta via NÃO tem, e o navegador tem: print de tela. A LEITURA ela tem: o `delta-update`
// carrega a tela inteira como HTML dentro de CDATA, e `controlesDoDelta` o varre sem DOM, produzindo
// o MESMO despejo que o `JS_DESPEJO_CONTROLES` do navegador — daí o `montarTela` do webgui.mjs
// servir às duas vias, e `lerTela(sessao)` devolver o mesmo modelo (fila 21, § abaixo).

import { passo, detalhe, http as logHttp } from './log.mjs';
import { encerrarSessao } from './sap-connection.mjs';
import {
  urlWebgui, autorizacao, interpretarSonda, okcodeDe, campoDoSid, OKCODES,
  montarTela, sidDoLsdata, rotuloLimpo, teclaDoBotao, sidsDaTela,
} from './webgui.mjs';

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

// ---------- a tela do delta-update (PURO) ----------
//
// O `delta-update` é a tela inteira como HTML dentro de `<![CDATA[…]]>`, um bloco por região
// (`cuaarea` = barras, `steploop0` = a dynpro, `msgarea` = a barra de mensagens, `webguiPopups` =
// o popup). Medido no s4h 758/250 em 04/09/2026 (sap-accelerate/work/POC_webgui_okcode e
// POC_webgui_its_lib, medicoes/raw/*): TODO POST que volta `delta` traz a tela inteira — o boot
// (288 KB), um `enviar` só com `focus`+`value` (288 KB), o `/nSE38` (246 KB) — não um diff.
//
// ⚠️ A EXCEÇÃO, medida com `/nend` e `/o`: com POPUP aberto o `steploop0` vem VAZIO
// (`<div id="steploop0" ct="PLP"></div>`) e a `wnd[0]/usr` SOME do delta — 0 SIDs, contra 48 do
// mesmo menu sem popup; um `state/ur` posterior devolve a mesma coisa. Quem lê a tela com popup
// aberto lê o popup: os campos da `wnd[0]` não estão lá para serem lidos.
//
// O que a via HTTP NÃO tem e o navegador tem: LAYOUT. `visivel` aqui é "não marcado invisível no
// markup" (`lsControl--invisible`, `lsElement--invisible`, `display:none`, o `<xmp>` que embrulha os
// menus) — o campo 0×0 do navegador (o `okcd`) sai `visivel: true` por esta via. A marcação de
// radio/checkbox vem do `aria-checked` do markup, como no DOM (fila 9: o `lsdata` não muda).

/** As tags HTML sem fechamento — não entram na pilha. */
const TAGS_VAZIAS = new Set(['input', 'img', 'br', 'hr', 'col', 'meta', 'link', 'area', 'base', 'wbr', 'source', 'embed', 'param', 'track']);
/** As tags que quebram linha no `innerText` — o resto é inline e cola (`<span class="urAccessKey">P</span>rograma` = "Programa"). */
const TAGS_DE_BLOCO = new Set(['div', 'p', 'br', 'hr', 'tr', 'li', 'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'section', 'article', 'form', 'fieldset', 'xmp', 'pre']);
const COM_VALUE = new Set(['input', 'textarea', 'select', 'button']);
// `pseudoHidden` é a dica de leitor de tela (" Destacado" no btn[0]) — fora da tela e fora do rótulo
const RE_INVISIVEL = /\b(lsControl--invisible|lsElement--invisible|lsControl--hidden|lsControl--pseudoHidden)\b/;

/** PURO: os atributos de uma tag (`id="…"`, `lsdata='…'`, `disabled`), sem decodificar. */
export function atributosDe(tag) {
  const attrs = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

function lsdataDe(bruto) {
  if (!bruto) return null;
  try { return JSON.parse(decodificarEntidades(bruto)); } catch { /* entidade que virou aspa */ }
  try { return JSON.parse(bruto); } catch { return null; }
}

/**
 * PURO: os controles de um trecho de HTML do ITS — todo elemento com `ct`, no MESMO formato que o
 * `JS_DESPEJO_CONTROLES` do webgui.mjs despeja do DOM: `{ id, ct, lsdata, title, aria, accesskey,
 * valor, desabilitado, somenteLeitura, texto, visivel }`. É um scanner de tags com pilha (não um
 * parser de HTML): `texto` é o que o `innerText` seria — os nós de texto do elemento e dos filhos,
 * inline colado e bloco em linha nova, sem o que está em subárvore invisível, cortado em 120 — e
 * `visivel` é a ausência de marca de invisível nele ou acima.
 *
 * Medido (SE38 por HTTP, c4-nse38.txt): a letra de atalho vem num `<span class="urAccessKey">`
 * SEPARADO do resto (`<span>P</span>rograma`) — quem põe separador entre nós de texto lê
 * "P\nrograma" e o rótulo vira "P". Só tag de BLOCO quebra linha.
 */
export function controlesDoHtml(html) {
  const s = String(html ?? '');
  const brutos = [];
  const pilha = [];   // { nome, indice (em brutos) | -1, texto: '', invisivel }
  const invisivelAcima = () => (pilha.length ? pilha[pilha.length - 1].invisivel : false);
  let i = 0;
  const texto = (t) => {
    if (invisivelAcima()) return;                    // o innerText não traz o que não é renderizado
    const limpo = decodificarEntidades(t).replace(/\s+/g, ' ');
    if (!limpo.trim()) return;
    for (const f of pilha) f.texto += limpo;
  };
  const quebra = () => { for (const f of pilha) f.texto += '\n'; };
  const fechar = (nome) => {
    // fecha até a tag de mesmo nome (o markup do ITS é bem formado; tag solta só encosta na pilha)
    const k = pilha.map((f) => f.nome).lastIndexOf(nome);
    if (k < 0) return;
    while (pilha.length > k) {
      const f = pilha.pop();
      if (TAGS_DE_BLOCO.has(f.nome)) quebra();
      if (f.indice >= 0) {
        brutos[f.indice].texto = f.texto.split('\n').map((l) => l.trim()).filter(Boolean).join('\n').slice(0, 120) || null;
      }
    }
  };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { texto(s.slice(i)); break; }
    if (lt > i) texto(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) { const fim = s.indexOf('-->', lt); i = fim < 0 ? s.length : fim + 3; continue; }
    if (s[lt + 1] === '/') {
      const gt = s.indexOf('>', lt);
      fechar(s.slice(lt + 2, gt < 0 ? s.length : gt).trim().toLowerCase());
      i = gt < 0 ? s.length : gt + 1;
      continue;
    }
    // tag de abertura: acha o `>` respeitando aspas (o lsdata é JSON entre aspas simples)
    let k = lt + 1, aspas = null;
    while (k < s.length) {
      const c = s[k];
      if (aspas) { if (c === aspas) aspas = null; }
      else if (c === '"' || c === "'") aspas = c;
      else if (c === '>') break;
      k++;
    }
    const tag = s.slice(lt + 1, k);
    i = k + 1;
    const nome = (/^[a-zA-Z][\w:-]*/.exec(tag)?.[0] ?? '').toLowerCase();
    if (!nome) continue;
    if (nome === 'script' || nome === 'style') {   // conteúdo não é innerText
      const fim = s.indexOf(`</${nome}`, i);
      i = fim < 0 ? s.length : fim;
      continue;
    }
    const attrs = atributosDe(tag.slice(nome.length));
    const invisivel = invisivelAcima() || RE_INVISIVEL.test(attrs.class ?? '') ||
      /display\s*:\s*none/i.test(attrs['data-sap-ls-style'] ?? attrs.style ?? '');
    let indice = -1;
    if ('ct' in attrs) {
      indice = brutos.length;
      brutos.push({
        id: attrs.id ? decodificarEntidades(attrs.id) : null, ct: attrs.ct,
        lsdata: lsdataDe(attrs.lsdata),
        title: attrs.title ? decodificarEntidades(attrs.title) : null,
        aria: attrs['aria-checked'] ?? null,
        accesskey: attrs['data-sap-ls-accesskey'] ?? null,
        valor: COM_VALUE.has(nome) ? decodificarEntidades(attrs.value ?? '') : null,
        desabilitado: 'disabled' in attrs, somenteLeitura: 'readonly' in attrs,
        texto: null, visivel: !invisivel,
      });
    }
    const fechada = /\/\s*$/.test(tag) || TAGS_VAZIAS.has(nome);
    if (TAGS_DE_BLOCO.has(nome)) quebra();
    if (!fechada) pilha.push({ nome, indice, texto: '', invisivel });
  }
  while (pilha.length) fechar(pilha[0].nome);
  return brutos;
}

/**
 * PURO: os controles de um `delta-update` inteiro — os blocos CDATA de cada `<control-update>`,
 * na ordem do documento (`cuaarea` antes de `steploop0`; o `msgarea` no fim). Os `<start-script>`
 * (JS, não HTML) ficam de fora.
 */
export function controlesDoDelta(corpo) {
  const s = String(corpo ?? '');
  const brutos = [];
  const re = /<control-update\b[^>]*>\s*<content>\s*<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let m;
  while ((m = re.exec(s))) brutos.push(...controlesDoHtml(m[1]));
  return brutos;
}

/**
 * PURO: o POPUP (`wnd[1]`, `GuiModalWindow`) que o delta trouxe — ou `null`. O título é a primeira
 * linha do texto da janela (o `header` é o primeiro filho); `textos` são os rótulos da `wnd[1]`
 * (`txtSPOP-TEXTLINE1` "Os dados não gravados serão perdidos."); `botoes` são os da `wnd[1]` PELO
 * SID (`wnd[1]/usr/btnSPOP-OPTION1` "Sim") — ⚠ eles NÃO são `btn[n]`, então não entram em
 * `tela.botoes` e `acionar(s, 'Sim')` não os acha: é `acionar(s, { sid })`, e responder ao popup
 * por esta via ainda não está medido (fila 23).
 */
export function popupDaTela(brutos = []) {
  const controles = brutos.map((b) => ({ b, sid: sidDoLsdata(b.lsdata) }));
  const janela = controles.find((c) => c.sid?.Type === 'GuiModalWindow');
  if (!janela) return null;
  const raiz = janela.sid.SID;                                       // wnd[1]
  const dentro = controles.filter((c) => c.sid?.SID?.startsWith(`${raiz}/`));
  return {
    sid: raiz, id: janela.b.id ?? null,
    titulo: rotuloLimpo(janela.b.texto, janela.b.title),
    textos: dentro.filter((c) => c.sid.Type === 'GuiLabel' && (c.b.texto || c.b.title))
      .map((c) => ({ sid: c.sid.SID, texto: c.b.texto || c.b.title })),
    botoes: dentro.filter((c) => c.sid.Type === 'GuiButton')
      .map((c) => ({ sid: c.sid.SID, rotulo: rotuloLimpo(c.b.texto, c.b.title), tecla: teclaDoBotao(c.b.lsdata), accesskey: c.b.accesskey ?? null })),
    campos: dentro.filter((c) => TIPOS_DE_ENTRADA.has(c.sid.Type))
      .map((c) => ({ sid: c.sid.SID, campo: campoDoSid(c.sid.SID), valor: c.b.valor ?? '', dica: c.b.title ?? null })),
  };
}

/**
 * PURO: o MODELO da tela a partir de um `delta-update` — o `montarTela` do webgui.mjs sobre os
 * controles do XML, mais o que só o XML sabe (`screenId`, `dynpro`, `tcode`, `dnum`) e o `popup`.
 * É o mesmo modelo do `lerTela` do navegador: `{ titulo, janela, mensagem, statusbar, campos
 * (com rótulo costurado), radios, checkboxes, botoes, grids, rotulos, okcode }`. Corpo sem
 * `<delta-update>` (multipart, logoff) devolve `null` — não há tela ali.
 *
 * Cruzado em 04/09/2026 contra o despejo DOM da MESMA SE38 (POC_webgui_lsdata/raw/se38.json ×
 * POC_webgui_okcode/raw/c4-nse38.txt): campos, rótulos, dica, radios, checkboxes, botões (okcode,
 * rótulo, tecla) e mensagem IGUAIS pelas duas vias — ver its.test.mjs.
 */
export function telaDoDelta(corpo) {
  const s = String(corpo ?? '');
  if (!/<delta-update/i.test(s)) return null;
  const brutos = controlesDoDelta(s);
  const tela = montarTela(brutos, { titulo: paramDe(s, 'cuatitle') });
  const popup = popupDaTela(brutos);
  return {
    ...tela,
    screenId: paramDe(s, 'ScreenId'), dynpro: paramDe(s, 'dynpro'), tcode: paramDe(s, 't-code'), dnum: paramDe(s, 'd-num'),
    popup,
    // com popup aberto a wnd[0]/usr NÃO vem no delta — quem lê `campos` vazio precisa saber por quê
    aviso: popup && !tela.campos.length ? `popup ${popup.sid} aberto — a wnd[0]/usr não vem no delta enquanto ele estiver aberto` : null,
  };
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
    sids: [], delta: null, ultimo: null, titulo: null, fila: [], aberta: true, tempos: { get: ms, boot: null },
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
 * Atualiza o `moin`, o jar, os `sids`, o `titulo` e o `delta` da sessão quando veio `delta`; marca a sessão
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
    sessao.delta = corpo;   // a última tela — é dela que `lerTela` lê (multipart não a substitui)
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
 * O que a tela É agora — o MESMO modelo do `lerTela` do webgui.mjs, lido do último `delta` sem
 * tocar a rede: `{ titulo, janela, mensagem, statusbar, campos, radios, checkboxes, botoes, grids,
 * rotulos, okcode, screenId, dynpro, tcode, dnum, popup, aviso }`. Cada campo traz `sid`, `campo`
 * (o parâmetro da URL `~transaction`), `rotulo` (costurado pelo label), `dica` (o data element) e
 * `valor`. ⚠ `popup` não nulo = `wnd[1]` aberta, e aí `campos` vem vazio (o delta não traz a
 * `wnd[0]/usr`) — o `aviso` diz isso.
 */
export function lerTela(sessao) {
  if (!sessao?.delta) throw new Error('its: sem delta para ler — abra a sessão (o boot traz a primeira tela)');
  return telaDoDelta(sessao.delta);
}

/** Os parâmetros da URL `~transaction` desta tela — `{ id, title, sid, campo, rotulo }` por campo
 * visível (o `sidsDaTela` do webgui.mjs sobre o `lerTela` daqui). */
export const parametrosDaTela = (sessao) => sidsDaTela(lerTela(sessao));

/**
 * Os SIDs da tela atual — `{ sid, tipo, campo, okcode, … }` por controle, do último `delta`.
 * É o endereçamento desta via: `campo` é o nome que `abrirTransacao(…, { parametros })` quer e
 * `okcode` é o `btn[n]` que `acionar` aceita. Só endereços (e o que o `lsdata` carrega); o MODELO
 * da tela, com rótulo e mensagem, é `lerTela`.
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
