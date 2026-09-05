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
//     ⚠ Limite DESTE MÓDULO, não do canal: a MESMA dynpro se dirige por HTTP puro, sem Chrome, em
//     `its.mjs` (export `adt-client/its`) — mesmo vocabulário (`abrirTransacao`/`preencher`/
//     `acionar`/`comandar`/`fechar`), endereço por SID, ~0,65 s até a tela contra ~9 s daqui.
//     O que só ESTE módulo tem: `print`. A leitura (`lerTela`, `campos`, `botoes`) as duas têm — o
//     `montarTela` daqui roda sobre o DOM aqui e sobre o XML do delta-update lá (fila 21).

import { spawn } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { passo, detalhe, aviso } from './log.mjs';
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
    medido: `SXD 816/100 03/09/2026 — SE38: id M0:48::btn[8], title " (F8)", lsdata {"0":"Executar"}. s4h 758/250 05/09/2026 (fila 36) — tela de seleção do RSPARAM, id M0:50::btn[8]: executou o report em 10 de 10 sessões, 1,0-1,5 s até a lista ALV (85 -> 960 ct), com e sem esperarResposta` },
  'btn[11]': { nome: 'Gravar', apelidos: [], tecla: 'Ctrl+S',
    medido: 'SXD 816/100 03/09/2026 — Writer da J1B1N: M0:50::btn[11] criou a NF 0000000082, confirmada em outra LUW' },
  'btn[12]': { nome: 'Cancelar', apelidos: [], tecla: 'Escape',
    medido: 'SXD 816/100 03/09/2026 — Writer: M0:50::btn[12]. ⚠️ posta e o programa REABRE a mesma dynpro' },
  'btn[15]': { nome: 'Encerrar', apelidos: ['Sair'], tecla: 'Shift+F3',
    medido: `SXD 816/100 03/09/2026 — SE38: M0:55::btn[15]. ⚠️ o clique posta e o programa REABRE a dynpro; a saída deste canal é o OK-code — comandar(s, "/3"), (s, "/n"), (s, "/nex"). Medido no s4h 04/09/2026: /15 no menu abre a pergunta de logoff e trava a wnd[0]` },
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
 *
 * ⚠️ NÃO exigir campo de entrada visível: medido no s4h 758/250 em 04/09/2026 (fila 19,
 * `POC_webgui_lsdata/medicoes/tela-pronta.json`) que a tela de seleção do RSPARAM (um checkbox), a
 * lista ALV dele (960 controles) e o SAP Easy Access têm ZERO `<input>` visível — com `inputs > 0`
 * na condição a espera rodava até o teto de 60 s e só então lia a tela (certa). E o casco da página
 * (menu + barra, 47 `[ct]`, 3.574 chars) chega ANTES da dynpro e já satisfaz texto e `[ct]`, então
 * tirar a condição sem pôr outra declararia pronto cedo demais.
 *
 * O sinal certo é a DYNPRO PRESENTE: algum controle cujo SID mora na área do usuário
 * (`wnd[n]/usr/…`) ou na barra de aplicação (`wnd[n]/tbar[1]/…`). Medido: o casco tem 0 dos dois;
 * SE38 fecha junto com o 1º input (12,3 s nessa rodada), a seleção do RSPARAM 325 ms depois do
 * casco, o menu em 1,4 s. `minimoCampos` continua como PISO opcional (`>=`; 0 = não exige).
 */
/** PURO: o SID que só uma DYNPRO tem — área do usuário ou barra de aplicação (o casco só tem `tbar[0]` e `wnd[0]`). */
export const RE_SID_DA_DYNPRO = /"SID":"wnd\[\d+\]\/(usr|tbar\[1\])\//;
export const JS_DYNPRO_PRESENTE = `[...document.querySelectorAll('[lsdata]')]
    .some(e => ${RE_SID_DA_DYNPRO}.test(e.getAttribute('lsdata') || ''))`;

export function jsTelaPronta({ minimoTexto = 200, minimoControles = 5, minimoCampos = 0 } = {}) {
  return `document.readyState === 'complete' &&
    !!document.body && (document.body.innerText || '').length >= ${minimoTexto} &&
    document.querySelectorAll('[ct]').length > ${minimoControles} &&
    ${JS_DYNPRO_PRESENTE} &&
    [...document.querySelectorAll('input')].filter(e => e.offsetWidth || e.offsetHeight).length >= ${minimoCampos}`;
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
  if (erro) {
    // ⚠ certificado recusado NÃO é "sem resposta do ICM" — o ICM está de pé, quem recusou foi o
    // Node. Empilhar isso em `sem-icm` manda procurar rede/host, que é o lugar errado.
    // Os três códigos medidos em laboratório local em 05/09/2026 (POC_https_cert):
    //   `DEPTH_ZERO_SELF_SIGNED_CERT`    — o certificado do host é a própria raiz;
    //   `UNABLE_TO_VERIFY_LEAF_SIGNATURE`— assinado por CA interna que esta máquina não conhece;
    //   `ERR_TLS_CERT_ALTNAME_INVALID`   — a CA confia, mas o nome do certificado não é o do host.
    if (/CERT|SELF_SIGNED|LEAF_SIGNATURE/i.test(String(erro))) {
      return { ok: false, causa: 'certificado', status: null, bytes: 0, cookies: [],
        motivo: `o ICM respondeu, mas o Node recusou o certificado (${erro}) — CA interna que esta máquina não conhece. ` +
          'A opção `certificado` do `abrirNavegador` é do CHROME e NÃO cobre este `fetch`; ver receita-webgui.md § HTTPS com certificado interno.' };
    }
    return { ok: false, causa: 'sem-icm', motivo: `sem resposta do ICM: ${erro}`, status: null };
  }
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
  // 404 tem MAIS de uma causa e o HTTP não separa nenhuma: nó ausente, nó existente e ATIVO mas sem
  // handler (nó de pasta — medido no /sap/bc/gui/sap/its/test), e desativado na SICF. Quem separa é o
  // ABAP: `cl_icf_tree=>is_service_active( url )` (ver receita-webgui.md § O 404 não é veredito de estado).
  if (status === 404) return { ...base, ok: false, causa: 'sem-no', motivo: `${rotulo} — o nó não atende: ausente, sem handler (nó de pasta) ou desativado na SICF; o HTTP não distingue os três` };
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
 * ⚠️ **QUEM SONDA FECHA — e agora com número (item 28).** O GET bem-sucedido não é leitura inócua:
 * ele ABRE uma sessão de diálogo no servidor (é o `SAP_SESSIONID` que prova o sucesso), exatamente
 * uma por GET, e o logoff derruba exatamente uma (medido no s4h 758/250 em 04/09/2026: 10 GETs
 * levaram 4 → 14 sessões; 10 logoffs, 14 → 4). A causa foi ISOLADA por rampa: com ~150 sessões do
 * mesmo usuário (144 ainda passavam, 154 não) o canal stateful inteiro cai — e o que cai não é o nó
 * do ADT, é a sessão, que passa a nascer sem `SAP_SESSIONID` e faz QUALQUER requisição com aquele
 * cookie responder `400 Service nicht erreichbar`, `/sap/public/ping` incluído
 * (ver `sessaoNasceuMorta` em sap-connection.mjs).
 *
 * O logoff daqui é PREVENTIVO, não curativo: passado o teto, o próprio logoff responde 400 e a
 * sessão fica — resta esperar `http/security_session_timeout` (1800 s no s4h). Uma varredura de 120
 * GETs sem logoff chega perto do teto; duas chegam. O logoff sai daqui sempre que houve cookie.
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

// ─────────────────────────────────────────────────────────────────────────────
// HTTPS com certificado que ESTA máquina não confia — o ICM interno
// ─────────────────────────────────────────────────────────────────────────────
//
// O outro lado do gotcha da origem segura: onde o ICM só atende por HTTPS e o certificado vem de
// uma CA INTERNA do cliente, o Chrome barra a navegação ANTES de qualquer byte de SAP chegar.
// Medido no SXD 816/100 em 04/09/2026: `/UI2/FLPD_CUST` redireciona para
// `https://awskartsxd01.acclab.com:44300/` e a tela só abre depois de mandar
// `Security.setIgnoreCertificateErrors`.
//
// Reproduzido em laboratório LOCAL em 05/09/2026 (sem VPN — servidor HTTPS na 44399 com
// certificado auto-assinado, `sap-accelerate/work/POC_https_cert/medicoes/item41-cert.md`), que é
// onde os números abaixo saíram. Os cinco cenários, mesmo Chrome, mesmo minuto:
//
// | como se sobe o Chrome                                     | `Page.navigate` devolve       | tela      |
// |-----------------------------------------------------------|-------------------------------|-----------|
// | nada (o default)                                          | `net::ERR_CERT_AUTHORITY_INVALID` | "Erro de privacidade", `chrome-error://chromewebdata/` |
// | `Security.setIgnoreCertificateErrors` (SEM `Security.enable`) | —                          | abriu     |
// | `Security.enable` + `setIgnoreCertificateErrors`           | —                             | abriu     |
// | `--ignore-certificate-errors`                              | —                             | abriu     |
// | `--ignore-certificate-errors-spki-list=<pino DESTE cert>`  | —                             | abriu     |
// | `--ignore-certificate-errors-spki-list=<pino de OUTRO>`    | `net::ERR_CERT_AUTHORITY_INVALID` | barrou |
//
// Três coisas que a medição decide, e por isso são o desenho daqui:
//
//   • **`Security.enable` NÃO é pré-requisito** — `setIgnoreCertificateErrors` sozinho já vale.
//   • **`Page.navigate` DEVOLVE `errorText`.** Sem olhar para ele, o erro de certificado vira
//     silêncio caro: o `ir` fica esperando `jsTelaPronta` numa `chrome-error://` até estourar os
//     60 s do teto e só então diz "não achei campo". Daí o `ir` passar a ler o `errorText`.
//   • **o pino RESTRINGE de verdade** — com o hash de outro certificado o Chrome barrou. É a
//     diferença entre "aceito o certificado daquele ICM" e "aceito qualquer certificado quebrado
//     desta sessão", e é o que faz o modo pinado ser o recomendado, não uma formalidade.
//
// Por isso o default é `certificado: null` — **não ignorar nada**. Quem tem ICM interno declara,
// de preferência com o pino (`sistemas.json`: `"certificado": "sha256/…"`), que se lê uma vez com
// `spkiDoHost(base)`. `certificado: true` continua existindo para quem não quer pinar, e AVISA
// alto — é a sessão inteira sem validação de certificado.

/** PURO: normaliza o pino — o SHA-256 do SubjectPublicKeyInfo em base64. Aceita o `sha256/…` do
 * HPKP (que é como as ferramentas cospem), o base64 nu, e vários (o Chrome aceita lista). */
export const RE_PINO_SPKI = /^[A-Za-z0-9+/]{43}=$/;
export function pinosDeCertificado(certificado) {
  const lista = Array.isArray(certificado) ? certificado : [certificado];
  return lista.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim().replace(/^sha256\//i, ''));
}

/**
 * PURO: as bandeiras que dizem ao Chrome QUAL certificado inválido ele aceita.
 *
 * Só o modo pinado vira bandeira: `certificado: true` (ignorar tudo) não tem bandeira de linha de
 * comando aqui de propósito — é mandado pelo CDP, no `abrirNavegador`, junto do aviso.
 */
export function bandeirasDeCertificado(certificado) {
  if (!certificado || certificado === true) return [];
  const pinos = pinosDeCertificado(certificado);
  if (!pinos.length) return [];
  const torto = pinos.find((p) => !RE_PINO_SPKI.test(p));
  if (torto) {
    throw new Error(
      `webgui: "${torto}" não é um pino de certificado — espera-se o SHA-256 do SubjectPublicKeyInfo ` +
      'em base64 (44 caracteres terminados em "="), com ou sem o prefixo "sha256/".\n' +
      'Leia o do seu ICM com:  node -e "import(\'adt-client/webgui\').then(m => m.spkiDoHost(\'https://host:44300\').then(r => console.log(r.pino, r.subject)))"',
    );
  }
  return [`--ignore-certificate-errors-spki-list=${pinos.join(',')}`];
}

/**
 * O pino do certificado que ESTE host apresenta — para colar no `sistemas.json` uma vez e nunca
 * mais ignorar certificado às cegas.
 *
 * ⚠️ Isto é **trust on first use**: pinar o que o host mostrou AGORA não prova que ele é quem diz
 * ser. O que o pino compra é o resto — a partir dele o Chrome volta a barrar QUALQUER outro
 * certificado inválido da sessão (medido: pino de outro cert → `ERR_CERT_AUTHORITY_INVALID`).
 * Quem quiser a garantia inteira confere o `subject`/`issuer`/`validade` devolvidos aqui contra o
 * que a área de infra do cliente diz — é justamente para isso que eles saem junto.
 */
export async function spkiDoHost(base, { tetoMs = 10000 } = {}) {
  const url = new URL(String(base));
  if (url.protocol !== 'https:') throw new Error(`webgui: spkiDoHost só faz sentido em https — "${base}" é ${url.protocol}`);
  const porta = Number(url.port) || 443;
  passo(`webgui: lendo o certificado de ${url.hostname}:${porta}`);
  const bruto = await new Promise((ok, err) => {
    const s = tls.connect(
      { host: url.hostname, port: porta, servername: url.hostname, rejectUnauthorized: false, timeout: tetoMs },
      () => { const c = s.getPeerCertificate(false); s.destroy(); ok(c); },
    );
    s.on('timeout', () => { s.destroy(); err(new Error(`webgui: ${url.hostname}:${porta} não respondeu ao TLS em ${tetoMs} ms`)); });
    s.on('error', (e) => err(new Error(`webgui: TLS com ${url.hostname}:${porta} falhou — ${e.message}`)));
  });
  if (!bruto?.raw) throw new Error(`webgui: ${url.hostname}:${porta} não apresentou certificado`);
  const x = new X509Certificate(bruto.raw);
  const pino = createHash('sha256').update(x.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  detalhe(`webgui: ${x.subject} (emitido por ${x.issuer}) → sha256/${pino}`);
  return { pino, sha256: `sha256/${pino}`, subject: x.subject, issuer: x.issuer, validoDe: x.validFrom, validoAte: x.validTo, autoAssinado: x.subject === x.issuer };
}

/** PURO: o `errorText` do `Page.navigate` que é problema de CERTIFICADO, virado em instrução.
 * Devolve `null` para o que não é — quem chama decide se avisa ou deixa passar. */
export function explicarErroDeNavegacao(errorText, { base = '', certificado = null } = {}) {
  const texto = String(errorText || '');
  if (!/^net::ERR_(CERT|SSL)_/.test(texto)) return null;
  const jaTentou = certificado
    ? `\nO cfg já pede ${certificado === true ? 'ignorar erros de certificado' : `o pino ${pinosDeCertificado(certificado).join(', ')}`} e MESMO ASSIM barrou — ` +
      (certificado === true ? 'o erro não é de confiança na CA (veja o código acima).' : 'o certificado do host provavelmente mudou; releia o pino com spkiDoHost.')
    : '\nO Chrome não confia na CA que assinou o certificado deste host — típico de ICM com certificado interno.\n' +
      'Não se ignora certificado por default. Para liberar ESTE sistema, em sistemas.json:\n' +
      `  1. leia o pino:  spkiDoHost(${JSON.stringify(base || 'https://host:44300')})  → confira subject/issuer com a infra do cliente\n` +
      '  2. grave:        { "<alias>": { "certificado": "sha256/<pino>" } }\n' +
      'Alternativa larga (a sessão inteira sem validar certificado, e ela avisa): "certificado": true';
  return `webgui: a navegação para ${base || 'a URL'} falhou com ${texto}.${jaTentou}`;
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Criar é mutação IMEDIATA — a pilha de desfazer
// ─────────────────────────────────────────────────────────────────────────────
//
// **Medido no SXD 816, mandante 100, em 04/09/2026** (POC 4029823, fila `adt-client` item 38):
// no FLP Designer (`/sap/bc/ui5_ui5/sap/arsrvc_upb_admn`), só **ABRIR** o formulário "Criar
// atribuição de destino" (`AdminPage--createNewTM`) já **persiste** a linha. Quatro inspeções que
// abriram o formulário, leram os campos e fecharam a sessão deixaram QUATRO target mappings
// vazios no catálogo YJBV_POC_4029823, tipo de navegação "Outro" — e foi preciso um script de
// limpeza para tirá-los (`medicoes/flpd-tabela-mappings.png`, `flpd-mappings-limpos.png`).
//
// A lição vale além daquela tela: **fechar o navegador não é rollback.** O `finally { s.fechar() }`
// que todo script tem mata o Chrome — o que o servidor já gravou fica. Numa tela em que "Novo"
// abre um rascunho antes de qualquer Gravar, o gesto que desfaz (Cancelar, Excluir) é tão
// obrigatório quanto o unlock do ADT, e pela mesma razão: quem mutou tem de saber desfazer.
//
// Duas peças, uma em cima da outra:
//   • `sessao.desfazer` — a pilha LIFO da sessão; o `fechar` a executa **com o navegador ainda
//     vivo** (descartar é um clique, precisa da página de pé) e AVISA alto o que não conseguiu;
//   • `transacional(sessao, { abrir, corpo, descartar })` — o corpo de um formulário que cria ao
//     abrir: arma o descarte no instante da criação e o dispara no `finally`, a menos que o corpo
//     tenha CONFIRMADO (o Gravar de verdade).

/**
 * A pilha de desfazer de uma sessão. LIFO: desfaz-se na ordem inversa da criação, porque o que
 * foi criado por último costuma ser filho do anterior.
 *
 * `registrar` devolve a **baixa** — chamá-la tira a ação da pilha (é o que "confirmar" faz: o
 * rascunho virou registro de verdade, não há mais o que desfazer).
 *
 * `executar` é à prova de falha individual: uma ação que estoura NÃO impede as demais, e sai no
 * relatório como `{ ok: false, erro }`. A pilha esvazia sempre — executar duas vezes não repete
 * gesto destrutivo.
 */
export function criarPilhaDeDesfazer() {
  const acoes = [];
  return {
    tamanho: () => acoes.length,
    pendentes: () => acoes.map((a) => a.rotulo),
    registrar(rotulo, fn) {
      if (typeof fn !== 'function') throw new Error('desfazer: registrar exige uma função — o GESTO que desfaz');
      const acao = { rotulo: String(rotulo), fn };
      acoes.push(acao);
      return () => {
        const i = acoes.indexOf(acao);
        if (i < 0) return false;
        acoes.splice(i, 1);
        return true;
      };
    },
    async executar() {
      const relatorio = [];
      while (acoes.length) {
        const { rotulo, fn } = acoes.pop();
        try {
          await fn();
          relatorio.push({ rotulo, ok: true });
        } catch (e) {
          relatorio.push({ rotulo, ok: false, erro: e?.message ?? String(e) });
        }
      }
      return relatorio;
    },
  };
}

/**
 * Corpo de um formulário que **cria ao abrir**. `abrir` faz a mutação; a partir dali `descartar`
 * está armado e roda no `finally` — a menos que o corpo tenha chamado `confirmar`.
 *
 * ```js
 * await transacional(s, {
 *   rotulo: 'target mapping do YJBV_POC_4029823',
 *   abrir:     () => clicar(s, { id: 'AdminPage--createNewTM' }),
 *   descartar: () => clicar(s, { id: 'AdminPage--cancelTileDetailsButton' }),
 *   corpo: async ({ confirmar }) => {
 *     await preencher(s, { id: '__xmlview9--semantic_objectInput-inner' }, 'YJBVNotaFiscal');
 *     await confirmar(() => clicar(s, { id: 'AdminPage--saveTileDetailsButton' }));
 *   },
 * });
 * ```
 *
 * ⚠ `confirmar(fn)` só dá a criação por boa se `fn` **resolver**: Gravar que estoura deixa o
 * descarte armado. E `confirmar` não é assert — que a linha ficou gravada se prova lendo em outra
 * LUW, como todo o resto deste canal.
 *
 * Se o próprio descarte falhar, a ação **fica na pilha da sessão** e o `fechar` tenta de novo; o
 * que nem assim sair vira aviso em stderr, com o rótulo — para o lixo ter nome.
 */
export async function transacional(sessao, { rotulo = 'rascunho', abrir, corpo, descartar } = {}) {
  if (!sessao?.desfazer) throw new Error('transacional: a sessão não tem pilha de desfazer (use a de `abrirNavegador`)');
  if (typeof abrir !== 'function') throw new Error('transacional: informe { abrir } — o gesto que CRIA');
  if (typeof descartar !== 'function') throw new Error(`transacional: informe { descartar } — criar é mutação imediata, e "${rotulo}" precisa saber se desfazer`);
  if (typeof corpo !== 'function') throw new Error('transacional: informe { corpo }');

  const aberto = await abrir();
  const baixa = sessao.desfazer.registrar(rotulo, descartar);
  let confirmado = false;
  const confirmar = async (fn) => {
    const r = typeof fn === 'function' ? await fn() : undefined;
    confirmado = true;
    baixa();
    return r;
  };
  try {
    return await corpo({ confirmar, aberto });
  } finally {
    if (!confirmado) {
      passo(`webgui: descartando "${rotulo}" — o formulário já tinha criado`);
      try {
        await descartar();
        baixa();
      } catch (e) {
        detalhe(`webgui: descarte de "${rotulo}" falhou (${e.message}) — fica na pilha para o fechar`);
      }
    }
  }
}

/**
 * Sobe o Chrome headless e devolve a sessão CDP `{ cfg, cmd, eventos, desfazer, fechar }` já
 * autenticada no `cfg` e com o polyfill armado. Quem abre FECHA (o `fechar` desfaz o que ficou
 * pendente, mata o processo e some com o perfil).
 */
export async function abrirNavegador(cfg, { porta = 9222, largura = 1600, altura = 1000, tetoMs = 30000, navegador, origemSegura = true, certificado = cfg?.certificado ?? null } = {}) {
  const chrome = acharNavegador({ navegador });
  const cabecalho = autorizacao(cfg); // recusa ANTES de subir navegador nenhum
  const bandeirasCert = bandeirasDeCertificado(certificado); // recusa pino torto aqui, não na navegação
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'jbv-webgui-'));
  passo(`webgui: subindo ${path.basename(chrome)} headless na porta ${porta}`);
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    ...(origemSegura ? bandeirasDeOrigemSegura(cfg.base) : []),
    ...bandeirasCert,
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
  if (certificado === true) {
    // medido: vale sem `Security.enable`. E é a sessão INTEIRA sem validar certificado — o modo
    // pinado (`certificado: 'sha256/…'`) não passa por aqui, ele é bandeira e continua barrando o resto.
    aviso(`webgui: certificado: true — esta sessão do Chrome NÃO valida certificado nenhum. Prefira o pino (spkiDoHost("${cfg.base}")).`);
    await cmd('Security.setIgnoreCertificateErrors', { ignore: true });
  } else if (bandeirasCert.length) {
    detalhe(`webgui: aceitando só o certificado pinado (${pinosDeCertificado(certificado).join(', ')})`);
  }
  await cmd('Network.setExtraHTTPHeaders', { headers: { Authorization: cabecalho } });
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: POLYFILL_RANDOMUUID });
  // Cinta de segurança, NÃO pré-requisito — e o `.catch` é seguro por isso. Medido no s4h 758/250
  // em 05/09/2026 (fila 64, `sap-accelerate/work/POC_webgui_foco/medicoes/item64-foco.md`):
  //  • o headless novo já entrega a página FOCADA numa aba só — desligar a emulação não tira o
  //    foco (`document.hasFocus()` continua `true`);
  //  • a página só perde o foco com OUTRA aba trazida à frente (`Page.bringToFront` nela) — e aí,
  //    com `hasFocus: false` e `visibilityState: 'hidden'`, o clique POSTOU MESMO ASSIM, 4/4. O
  //    `Input.dispatchMouseEvent` entra pelo CDP no target endereçado, não pela fila de eventos da
  //    janela; o Unified Renderer NÃO exige página focada (a justificativa antiga daqui era falsa);
  //  • o que a chamada faz de fato, isolado nesse mesmo par: com ela a aba de trás segue
  //    `visible`/focada, sem ela cai para `hidden`. Vale por causa do throttling de background.
  await cmd('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await cmd('Page.bringToFront').catch(() => {});

  const desfazer = criarPilhaDeDesfazer();

  const fechar = async () => {
    // ⚠ A ORDEM importa e não é negociável: desfazer é um CLIQUE, precisa da página de pé. Matar o
    // Chrome primeiro não é rollback — o que o servidor gravou ao ABRIR o formulário fica lá.
    const desfeito = await desfazer.executar();
    for (const { rotulo, erro } of desfeito.filter((d) => !d.ok)) {
      aviso(`webgui: NÃO consegui desfazer "${rotulo}" — sobrou no sistema (${erro})`);
    }
    try { ws.close(); } catch { /* já fechado */ }
    try { await fetch(`http://127.0.0.1:${porta}/json/close/${alvo.id}`); } catch { /* já foi */ }
    try { proc.kill(); } catch { /* já morreu */ }
    await espera(300);
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* o Chrome ainda segura */ }
    return { desfeito };
  };
  return { cfg, cmd, eventos, desfazer, fechar, porta, perfil };
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
  const nav = await sessao.cmd('Page.navigate', { url });
  // ⚠ o `Page.navigate` DEVOLVE `errorText` (medido: `net::ERR_CERT_AUTHORITY_INVALID` em HTTPS com
  // CA interna). Sem olhar aqui, a espera abaixo roda os 60 s inteiros contra uma `chrome-error://`
  // e o erro sai como "tela sem campo" — a causa errada. Só se LANÇA no que foi medido (certificado
  // e SSL); o resto vira aviso, porque `ERR_ABORTED` também aparece em navegação substituída.
  if (nav?.errorText) {
    const explicado = explicarErroDeNavegacao(nav.errorText, { base: url, certificado: sessao.cfg?.certificado ?? null });
    if (explicado) throw new Error(explicado);
    aviso(`webgui: Page.navigate para ${url} devolveu ${nav.errorText} — seguindo, mas a tela pode não vir`);
  }
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

/**
 * PURO: a JANELA dona de um SID — `wnd[1]/tbar[0]/btn[0]` → `wnd[1]`. Sem prefixo de janela,
 * `null`. É o que separa a barra do popup da barra da tela de trás, que vêm juntas na mesma
 * leitura (fila 42).
 */
export const janelaDoSid = (sid) => /^(wnd\[\d+\])/.exec(String(sid ?? ''))?.[1] ?? null;

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
    campo: campoDoSid(sid?.SID), janela: janelaDoSid(sid?.SID), visivel: !!bruto.visivel,
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
    rotulos: vis(dePapel('rotulo')).filter((r) => r.texto), // o texto legível da tela (o que não é campo)
    okcode: dePapel('okcode')[0] ?? null,                 // invisível (rect 0×0), mas está lá
  };
}

/** PURO: o despejo bruto de TODO controle com `ct` — o insumo do `montarTela`. */
export const JS_DESPEJO_CONTROLES = `[...document.querySelectorAll('[ct]')].map((el) => {
  let lsdata = null; try { lsdata = JSON.parse(el.getAttribute('lsdata') || 'null'); } catch (x) {}
  let lsevents = null; try { lsevents = JSON.parse(el.getAttribute('lsevents') || 'null'); } catch (x) {}
  return { id: el.id || null, ct: el.getAttribute('ct'), lsdata, lsevents,
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
 * PURO: a resposta para "qual o parâmetro certo para a URL `~transaction` desta tela" — um por
 * campo de entrada visível: `{ id, title, sid, campo, rotulo }`. É a peça do item 18 da fila,
 * recortada do `lerTela`: `campo` já vem sem `wnd[0]/usr/` e sem o prefixo de tipo (`ctxt`, `txt`,
 * `cmb`, `chk`), e é exatamente o nome que `abrirTransacao(s, tcode, { parametros })` quer. A caixa
 * de OK-code (`wnd[0]/tbar[0]/okcd`) fica de fora: ela não é parâmetro de dynpro.
 *
 * ⚠️ Modo de falha CALADO que isto previne (item 6): nome errado no `~transaction` não preenche
 * nada e não avisa — e com `DYNP_OKCODE` junto o fcode dispara com a dynpro vazia.
 */
export const sidsDaTela = (tela) => (tela?.campos ?? []).map(({ id, dica, sid, campo, rotulo }) =>
  ({ id, title: dica ?? null, sid, campo, rotulo: rotulo ?? null }));

/** Os SIDs dos campos da dynpro atual — `sidsDaTela(await lerTela(sessao))`. */
export const sids = async (sessao) => sidsDaTela(await lerTela(sessao));

/**
 * Os campos de entrada da dynpro atual (fora a caixa de OK-code da barra).
 * ⚠️ Heurística de DOM, SEM o SID — para saber o nome do parâmetro use `sids`/`lerTela`.
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

// ---------- o ALV (grid): o BLOCO que a tela JÁ tem ----------
//
// O par navegador do `lerGrid` do `its.mjs` — e o alcance é OUTRO, de propósito. Medido no s4h
// 758/250 em 04-05/09/2026 (`POC_webgui_grid`, fases A-C e I-K, lista do RSPARAM, 1617 × 5):
//
//   • **o DOM guarda um BLOCO, não a janela.** A tela mostra 27 linhas e o DOM tem **166** —
//     `grid#C102#1,1` até `#166,5`; só 27 `<tr>` têm altura, as outras 139 estão lá com o texto e
//     altura zero. É o `scrolling: "client"` + `clientCellThreshold: 10000` do `lsdata`.
//   • **ler esse bloco é de graça:** 166 linhas / 830 células em **19 ms** na página, 58 ms com o
//     CDP, 21,8 KB de valor e **zero requisição**. A mesma faixa pela via HTTP custou 1 pedido,
//     1,28 MB de corpo (41 KB gzipados na rede) e 246 ms.
//   • **o dado é o MESMO:** 830 de 830 células batem, campo a campo, com o `its.lerGrid` da mesma
//     faixa; e o `lsdata.value` do span bate com o `innerText` nas 830 (fase I).
//   • **o bloco CRESCE com a navegação, não desliza:** 30 rodadas de roda do mouse levaram o DOM de
//     `1..166` a `1..362`, contíguo, sem perder o começo (fase J). Então este `lerGrid` devolve
//     tudo o que a sessão já trouxe, não só o que está à vista.
//
// ⚠️ **Passar do bloco NÃO é trabalho deste módulo.** Medido (fases C e J): clique sintético e
// PageDown não movem a janela nem geram requisição; quem move é a RODA (`Input.dispatchMouseEvent`
// type `mouseWheel`), e ao chegar perto do fim do bloco o próprio ITS dispara um `action/710`
// (`fragments=166,173;`) que acrescenta 28 linhas. Mas é o MESMO pedido que a via HTTP faz, ao
// mesmo preço — 8,97 KB gzipados por 28 linhas nos dois canais (fase K) — só que em fatias de 28 e
// a ~2,9 s por rodada: **~222 rodadas, ~11 min** para as 1617 linhas, contra 4 pedidos e **2,3 s**
// do `its.lerGrid`. Rolar por roda para ler não vale: para a tabela INTEIRA, use `its.mjs`.

/**
 * PURO: a expressão JS que despeja o BLOCO de um grid — `{ cid, sid, colunas, total, celulas }`,
 * com `celulas[linha][coluna]` 1-based e ABSOLUTO (é o `lsMatrixRowIndex`, não a posição na tela).
 *
 * O valor sai do `lsdata` do span `grid#<CID>#<r>,<c>#if` — o mesmo campo que a via HTTP lê —, com
 * o `innerText` como reserva. A coluna 0 fica de fora: é a caixa de seleção da linha
 * (`SAPTABLECSSELECTIONCELL`), não é dado; a linha 0 é o cabeçalho e não tem span `#if`.
 *
 * ⚠️ **A célula EM EDIÇÃO tem outra forma, e ignorá-la fazia o `lerGrid` devolver `''` calado.**
 * Medido no s4h 758/250 em 05/09/2026 (item 47, `POC_webgui_grid_edit/medicoes/raw/d-escrever-*.json`):
 * clicar numa célula de grid editável troca o `<span ct="CBS">` por um **`<input>` DE MESMO ID**, e
 * nele o `lsdata[21]` deixa de ser objeto e vira **string JSON** — a busca por "valor de objeto"
 * não acha nada, o `innerText` de um `<input>` é vazio, e a coluna saía em branco como se o dado
 * não existisse. Daí as duas reservas aqui: o `21` re-parseado, e o `el.value` (que é o que a tela
 * MOSTRA — inclusive o que foi digitado e ainda não publicado). Só a célula com FOCO vira `<input>`,
 * então é no máximo uma por grid, e ela sai identificada em `editando`.
 */
export const jsBlocoDoGrid = (cid) => `(() => {
  const p = (s) => { try { return s ? JSON.parse(s) : null; } catch (x) { return null; } };
  const cid = ${JSON.stringify(String(cid))};
  const grid = document.getElementById(cid);
  if (!grid) return null;
  const d = p(grid.getAttribute('lsdata')) || {};
  const sid = Object.values(d).find((v) => v && typeof v === 'object' && v.Type === 'GuiGridView') || {};
  const celulas = {};
  let editando = null;
  for (const el of document.querySelectorAll('[id^="grid#"]')) {
    const partes = el.id.split('#');
    if (partes.length !== 4 || partes[1] !== cid || partes[3] !== 'if') continue;
    const rc = partes[2].split(',');
    if (rc.length !== 2 || !/^[0-9]+$/.test(rc[0]) || !/^[0-9]+$/.test(rc[1])) continue;
    if (Number(rc[0]) < 1 || Number(rc[1]) < 1) continue;
    const ls = p(el.getAttribute('lsdata'));
    let v = ls && Object.values(ls).find((x) => x && typeof x === 'object' && 'value' in x);
    if (!v && ls) {                       // célula em edição: o 21 vira STRING JSON
      for (const x of Object.values(ls)) {
        if (typeof x !== 'string' || x.charAt(0) !== '{') continue;
        const o = p(x);
        if (o && 'value' in o) { v = o; break; }
      }
    }
    const emEdicao = 'value' in el;       // <input> — só a célula com foco
    if (emEdicao) editando = { linha: Number(rc[0]), coluna: Number(rc[1]),
      digitado: String(el.value), servidor: v ? String(v.value) : null };
    (celulas[rc[0]] = celulas[rc[0]] || {})[rc[1]] =
      emEdicao ? String(el.value) : (v ? String(v.value) : (el.innerText || '').trim());
  }
  return { cid, sid: sid.SID || null, colunas: sid.ColumnIDs || [], total: sid.totalRows || 0,
    visiveis: sid.visibleRows || 0, primeiraVisivel: sid.firstVisibleRow, editavel: sid.editable === true,
    celulas, editando };
})()`;

/**
 * PURO: qual dos grids da tela é o alvo — índice (`0`), `{ id }`, `{ sid }`, ou o primeiro.
 * Estoura dizendo **o que a tela TEM**: "não achei" sem a lista manda adivinhar.
 */
export function escolherGrid(grids = [], alvo = null, rotulo = 'grid') {
  const g = typeof alvo === 'number' ? grids[alvo]
    : alvo?.sid ? grids.find((x) => x.sid === alvo.sid)
    : alvo?.id ? grids.find((x) => x.id === alvo.id)
    : grids[0];
  if (!g) throw new Error(`webgui: ${rotulo} — a tela não tem esse grid (tem ${grids.length}: ${grids.map((x) => x.id).join(', ') || 'nenhum'})`);
  return g;
}

/**
 * PURO: a coluna vira ÍNDICE 1-based. Aceita o número (que passa direto) ou o **nome do
 * `ColumnIDs`** (`'SEATSMAX'`) — que é como o próprio protocolo endereça a escrita
 * (`action/622 … column_id=SEATSMAX`). Nome fora da lista estoura com a lista inteira.
 */
export function indiceDaColuna(colunas = [], coluna) {
  if (typeof coluna === 'number') {
    if (!Number.isInteger(coluna) || coluna < 1) throw new Error(`webgui: coluna ${coluna} inválida — o índice é 1-based (a coluna 0 é a caixa de seleção da linha)`);
    return coluna;
  }
  const nome = String(coluna ?? '').toUpperCase();
  const i = colunas.findIndex((c) => String(c).toUpperCase() === nome);
  if (i < 0) throw new Error(`webgui: o grid não tem a coluna "${coluna}" (tem ${colunas.length}: ${colunas.join(', ') || 'nenhuma'})`);
  return i + 1;
}

/**
 * PURO: as células do bloco viram LINHAS, com os `ColumnIDs` do grid como chave e `_linha` com o
 * índice absoluto. Coluna sem célula sai `''`; sem `colunas`, a chave é o número da coluna.
 * O mesmo contrato do `linhasDoGrid` do `its.mjs` — as duas vias devolvem a mesma forma de linha.
 */
export function linhasDoBloco(celulas = {}, colunas = [], { de = 1, ate = null } = {}) {
  const chaves = Object.keys(celulas || {}).map(Number).filter((n) => Number.isFinite(n))
    .filter((n) => n >= de && (ate === null || n <= ate)).sort((a, b) => a - b);
  return chaves.map((n) => {
    const cels = celulas[String(n)] || {};
    const linha = { _linha: n };
    const nomes = colunas.length ? colunas : Object.keys(cels).map(Number).sort((a, b) => a - b).map(String);
    nomes.forEach((c, i) => { linha[c] = cels[String(i + 1)] ?? ''; });
    return linha;
  });
}

/**
 * Lê o ALV **do bloco que esta tela já carregou** — sem tocar a rede.
 *
 * `alvo` escolhe o grid quando a tela tem mais de um: índice (`0`), `{ id: 'C102' }` ou
 * `{ sid: 'wnd[0]/usr/cntlGRID1/shellcont/shell' }`. Sem alvo, o primeiro grid da tela.
 * `de`/`ate` são 1-based, inclusivos e ABSOLUTOS (o mesmo `_linha` que volta) — recortam o bloco,
 * não pedem nada a mais.
 *
 * Devolve `{ id, sid, colunas, total, bloco: { de, ate, n }, de, ate, linhas, parcial, editando, ms }`.
 * ⚠️ **`parcial: true` é a resposta normal, não erro:** significa que a tabela tem mais linhas do
 * que o bloco (`bloco.ate < total`) — as que faltam não estão no DOM e este módulo não vai buscá-las
 * (§ acima). Para a tabela inteira: `its.lerGrid` na via HTTP.
 * ⚠️ **`editando` ≠ `null` é aviso de dado NÃO PUBLICADO:** aquela célula está em campo de entrada
 * e o valor da leitura é o que está DIGITADO (`editando.digitado`), que pode divergir do que o
 * servidor tem (`editando.servidor`) até alguém publicá-lo (§ `escreverCelula`).
 */
export async function lerGrid(sessao, alvo = null, { de = 1, ate = null } = {}) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'lerGrid');
  const b = await avaliar(sessao, jsBlocoDoGrid(g.id));
  if (!b) throw new Error(`webgui: lerGrid — o grid ${g.id} sumiu do DOM entre a leitura da tela e o despejo`);
  const presentes = Object.keys(b.celulas).map(Number).filter((n) => Number.isFinite(n)).sort((a, x) => a - x);
  const bloco = { de: presentes[0] ?? null, ate: presentes[presentes.length - 1] ?? null, n: presentes.length };
  const total = Number(b.total || 0);
  const ini = Math.max(1, Number(de) || 1);
  const fim = ate === null ? (bloco.ate ?? 0) : Math.min(Number(ate) || 0, bloco.ate ?? 0);
  const linhas = linhasDoBloco(b.celulas, b.colunas, { de: ini, ate: fim });
  detalhe(`webgui: lerGrid ${g.id} — ${linhas.length} linha(s) do bloco ${bloco.de}..${bloco.ate} de ${total}, sem rede`);
  return { id: g.id, sid: b.sid ?? g.sid, colunas: b.colunas, total, bloco,
    de: ini, ate: fim, linhas, parcial: bloco.ate !== null && bloco.ate < total,
    editando: b.editando ?? null, ms: Date.now() - t0 };
}

// ---------- ESCREVER numa célula do ALV (item 47) ----------
//
// Medido no s4h 758/250 em 05/09/2026 (fila `adt-client`, item 47; bruto e leitura em
// `sap-accelerate/work/POC_webgui_grid_edit/`). O item 25 leu o ALV e o 46 leu o bloco do DOM; os
// dois pararam na leitura porque o `RSPARAM` é `editable: false`. Achar laboratório foi a fase A
// (14 programas sondados: `BCALV_EDIT_01/03..08`, `BCALV_GRID_EDIT`, `BCALV_TEST_GRID_EDIT*` são
// `editable: true`) e nenhum deles GRAVA em banco (fase B, pelo fonte: só tabela interna) — por
// isso o ciclo com LUW foi medido num laboratório próprio (`ZJBV_ALV47` + `ZJBV_ALV47_EDIT`, $TMP).
//
// **A célula editável não é um `<input>` até alguém clicar nela.** Em repouso ela é o mesmo
// `<span ct="CBS">` da leitura; o clique a troca por um `<input type="text">` **de mesmo id**
// (`grid#<CID>#<r>,<c>#if`). É por isso que o gesto é clicar → digitar, e não `.value =`.
//
// **Quem publica é o `blur`; quem MANDA é o round-trip seguinte.** O `Change` do `lsevents` da
// célula enfileira `action/622/<SID do grid>` com `content="row_index=<n>&column_id=<NOME>&value=<v>"`
// — note que a coluna vai pelo NOME (`ColumnIDs`), não pelo índice — e a fila só sai com o próximo
// post ao servidor (`vkey/0/ses[0]`, um OK-code, um botão). É o mesmo mecanismo do campo comum
// (item 31), e o `comandar` já dá o `blur` antes de mandar (`publicarValores`).
//
// ⚠️ **O modo de falha é SILENCIOSO e foi medido (fase H, `raw/h-contraprova.json`).** Digitar sem
// publicar e mandar o fcode de gravação:
//   • NEGATIVA — sem `blur` e com `comandar('FC01', { publicarValores: false })`: **0 `action/622`**
//     no batch, o ABAP rodou e devolveu a mensagem de sucesso *"ITEM47 GRAVOU subrc=0 n=3"*, e a
//     tabela lida em OUTRA LUW ficou **idêntica** — o valor nunca saiu do navegador.
//   • POSITIVA — o mesmo valor com `blur`: **1 `action/622`**, mesma mensagem, e a linha na outra
//     LUW passou a `CP-POSITIVA`.
// Ou seja: a mensagem de sucesso do programa NÃO é prova de que o que você digitou chegou. A prova
// é o `action/622` ter saído (é o que `publicado` devolve) e, depois, a leitura em outra LUW.
//
// ⚠️ **Digitar não valida nada.** O renderer aceita texto em QUALQUER célula do grid editável e
// monta o `action/622` mesmo para coluna que a tela pinta como protegida (medido no `BCALV_EDIT_01`
// com `PRICE`, cujo `lsdata` não tem as chaves `12`/`16` das demais). Quem recusa é o ABAP, na
// resposta — então a conferência é sempre depois do round-trip, nunca no DOM.

/**
 * Escreve numa célula do ALV **desta** tela e PUBLICA o valor (o `blur`), deixando-o na fila do
 * renderer. `alvo` escolhe o grid como no `lerGrid`; `linha` é o índice ABSOLUTO (o `_linha` que o
 * `lerGrid` devolve) e `coluna` é o nome do `ColumnIDs` ou o índice 1-based.
 *
 * ⚠️ **NÃO manda nada ao servidor** — por isso devolve `pendente: true`. O valor viaja no próximo
 * round-trip: `comandar(sessao, '<fcode de gravar>')` ou `acionar(sessao, 'btn[11]')`. Quem grava
 * é o programa ABAP, não este módulo; e a prova de que gravou é ler em outra LUW.
 *
 * Devolve `{ id, sid, linha, coluna, nomeColuna, de, para, publicado, pendente, ms }`.
 */
export async function escreverCelula(sessao, alvo = null, { linha, coluna, valor } = {}) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'escreverCelula');
  const b = await avaliar(sessao, jsBlocoDoGrid(g.id));
  if (!b) throw new Error(`webgui: escreverCelula — o grid ${g.id} sumiu do DOM entre a leitura da tela e o despejo`);
  if (b.editavel !== true) {
    throw new Error(`webgui: escreverCelula — o grid ${g.id} não é editável (o lsdata dele diz editable=${b.editavel}). ` +
      'ALV somente-leitura não tem campo de entrada nenhum: o clique não abre input e nada seria publicado.');
  }
  const c = indiceDaColuna(b.colunas, coluna);
  const presentes = Object.keys(b.celulas).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  const n = Number(linha);
  if (!b.celulas[String(n)]) {
    throw new Error(`webgui: escreverCelula — a linha ${linha} não está no bloco carregado ` +
      `(${presentes[0] ?? '-'}..${presentes[presentes.length - 1] ?? '-'} de ${b.total}). ` +
      'Este módulo escreve no que a tela já trouxe; chegar a linha distante é navegação (roda do mouse), não leitura.');
  }
  const id = `grid#${g.id}#${n},${c}#if`;
  const de = b.celulas[String(n)][String(c)] ?? '';
  const p = await apontar(sessao, { id }, { descer: false });
  if (!p) throw new Error(`webgui: escreverCelula — a célula ${id} não está apontável na tela`);
  await clique(sessao, p);
  await esperarQuieto(sessao, { quietoMs: 800, tetoMs: 8000 });
  const foco = await avaliar(sessao, `(() => { const a = document.activeElement; return a && a.id === ${JSON.stringify(id)} && 'value' in a ? a.tagName : (a && a.id) || null; })()`);
  if (foco !== 'INPUT') {
    throw new Error(`webgui: escreverCelula — o clique em ${id} não abriu campo de entrada (o foco ficou em ${foco ?? 'nada'}). ` +
      'A célula está protegida, ou o ALV está em "editável e não pronto para entrada" (o botão Exibir/Modificar do ALV alterna isso).');
  }
  await avaliar(sessao, `(() => { const a = document.activeElement; if (a && a.select) a.select(); return true; })()`);
  await tecla(sessao, 'Delete', { assentar: false });
  await digitar(sessao, valor);
  const para = await avaliar(sessao, `(document.activeElement || {}).value`);
  const publicado = await avaliar(sessao, JS_PUBLICAR_FOCO);
  detalhe(`webgui: escreverCelula ${id} (${b.colunas?.[c - 1] ?? c}) "${de}" → "${para}" — publicado, PENDENTE de round-trip`);
  return { id, sid: b.sid ?? g.sid, linha: n, coluna: c, nomeColuna: b.colunas?.[c - 1] ?? null,
    de, para, publicado: publicado ?? null, pendente: true, ms: Date.now() - t0 };
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

// ---------- descer até quem ACIONA ----------
//
// ⚠️ **O contêiner que se seleciona não é, necessariamente, o nó que aciona.** Medido no SXD
// 816/100 em 04/09/2026 (fila `adt-client`, item 40), no FLP Designer: clicar no `<li>` do template
// estático (`X-SAP-UI2-CHIP:/UI2/STATIC_APPLAUNCHER`) NÃO adicionou o tile; o clique no ícone de
// dentro (`AdminPage--universalCatalogView--X-SAP-UI2-CHIP:__UI2__STATIC_APPLAUNCHER-img`)
// adicionou. O `<li>` é só a caixa — quem tem o handler é o descendente.
//
// Daí o `apontar` DESCER quando o alvo não declara ação nenhuma: entre os descendentes visíveis com
// marca de ação, ele mira o de MENOR caixa e conta no retorno (`desceu`, `recebeu`, `porQue`,
// `candidatos`) qual nó recebeu o gesto — "não pegou" sem saber onde o mouse caiu não diz o que
// fazer em seguida.

/**
 * PURO: as marcas de ação que se LEEM no DOM, sem perguntar ao framework. As três primeiras linhas
 * são HTML/ARIA; `[lsevents]`/`[lsdata]`/`[ct]` são o Unified Renderer declarando o controle — é o
 * que mantém o canal WebGUI intacto (lá quase todo elemento endereçável já tem `ct`, então não há
 * o que descer).
 */
export const SELETOR_ACIONAVEL = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'summary', '[onclick]', '[href]',
  '[role=button]', '[role=link]', '[role=menuitem]', '[role=menuitemcheckbox]', '[role=menuitemradio]',
  '[role=option]', '[role=tab]', '[role=checkbox]', '[role=radio]', '[role=switch]',
  '[lsevents]', '[lsdata]', '[ct]',
].join(',');

/** PURO: as funções que o navegador usa para julgar um nó — visibilidade, marca de ação, caixa e
 * como chamá-lo numa mensagem. `cursor: pointer` é a última via porque é a mais frouxa (e HERDADA:
 * o recheio de um ícone clicável também "parece" clicável). */
export const JS_ACIONAVEL = `(() => {
  const SEL = ${JSON.stringify(SELETOR_ACIONAVEL)};
  const visivel = (e) => !!(e && e.nodeType === 1 && (e.offsetWidth || e.offsetHeight));
  const motivo = (e) => {
    if (!visivel(e)) return null;
    if (e.matches && e.matches(SEL)) return 'marcador';
    if (typeof e.onclick === 'function') return 'onclick';
    let cursor = null; try { cursor = getComputedStyle(e).cursor; } catch (x) { /* nó fora do documento */ }
    return cursor === 'pointer' ? 'cursor' : null;
  };
  const area = (e) => { const b = e.getBoundingClientRect(); return b.width * b.height; };
  const desc = (e) => !e ? null : (e.id || (e.tagName.toLowerCase() +
    (typeof e.className === 'string' && e.className.trim()
      ? '.' + e.className.trim().split(' ').filter(Boolean).slice(0, 2).join('.') : '')));
  return { SEL, visivel, motivo, area, desc };
})()`;

/**
 * PURO: a expressão que resolve o nó que VAI receber o gesto. Alvo com marca de ação é o próprio
 * alvo — só quem não tem nenhuma desce. `{ descer: false }` devolve o alvo cru (é o que se usa para
 * medir o contrafactual: clicar no contêiner e ver que nada acontece).
 */
export function jsAlvoEfetivo(js, { descer = true } = {}) {
  if (!descer) return `(${js})`;
  return `(() => {
    const raiz = ${js};
    if (!raiz) return null;
    const H = ${JS_ACIONAVEL};
    if (H.motivo(raiz)) return raiz;
    const cand = [...raiz.querySelectorAll('*')].filter((e) => H.motivo(e) && H.area(e) > 0);
    if (!cand.length) return raiz;
    let no = cand.reduce((a, b) => (H.area(b) < H.area(a) ? b : a));
    // \`cursor: pointer\` é HERDADO — o menor por área costuma ser o RECHEIO do nó clicável (o span
    // de dentro do ícone). Sobe enquanto o pai ocupa a MESMA caixa: o gesto sai no ícone inteiro.
    while (no.parentElement && no.parentElement !== raiz && H.motivo(no.parentElement) &&
           H.area(no.parentElement) <= H.area(no) * 1.02) no = no.parentElement;
    return no;
  })()`;
}

/**
 * Onde clicar, de verdade. Três coisas medidas que fazem o clique cair no vazio:
 *  1. `scrollIntoView` é ASSÍNCRONO — ler o `getBoundingClientRect` no mesmo tick devolve o rect
 *     ANTIGO (medido: rect em y=873 e clique enviado para y=452);
 *  2. o alvo pode estar COBERTO — daí conferir com `elementFromPoint` quem está no ponto;
 *  3. o alvo pode ser um CONTÊINER SEM AÇÃO, com o handler num descendente (o `<li>` do FLP
 *     Designer, item 40) — daí o rebaixamento, que o retorno sempre conta.
 *
 * Devolve, além do ponto: `recebeu` (quem leva o gesto), `de` (o que foi pedido), `desceu`,
 * `porQue` (a marca de ação que valeu) e `candidatos` (os descendentes acionáveis que havia).
 */
export async function apontar(sessao, alvo, { descer = true } = {}) {
  const js = jsDoAlvo(alvo);
  const efetivo = jsAlvoEfetivo(js, { descer });
  const rolou = await avaliar(sessao, `(() => {
    const e = ${efetivo};
    if (!e) return false;
    const b = e.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) { e.scrollIntoView({ block: 'center' }); return true; }
    return false;
  })()`);
  if (rolou) await espera(300);
  return await avaliar(sessao, `(() => {
    const raiz = ${js};
    const e = ${efetivo};
    if (!e) return null;
    const H = ${JS_ACIONAVEL};
    const b = e.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    const no = document.elementFromPoint(x, y);
    const desceu = e !== raiz;
    return { id: e.id, title: e.title, x, y, noPonto: no ? (no.id || no.tagName) : null,
             coberto: !(no === e || e.contains(no) || (no && no.contains(e))),
             recebeu: H.desc(e), de: H.desc(raiz), desceu, porQue: H.motivo(e),
             candidatos: desceu ? [...raiz.querySelectorAll('*')]
               .filter((z) => H.motivo(z) && H.area(z) > 0)
               .sort((a, c) => H.area(a) - H.area(c)).slice(0, 8).map(H.desc) : [] };
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
 *
 * ⚠️ **Sem `esperarResposta` este clique não OLHA o resultado** — ele volta na hora, tenha a ação
 * pegado ou não. Medido (fila 36, s4h 758/250 05/09/2026): um `clicar` puro no `btn[8]` da tela de
 * seleção do RSPARAM ficou 65 s cego numa tela que o renderer não terminou de montar (sem o menu
 * suspenso, `document.title` vazio); com `acionar`, o `mudou: false` teria denunciado em 30 s.
 * Quem precisa SABER que a ação pegou usa `acionar` e lê o `mudou`.
 */
export async function clicar(sessao, alvo, { tetoMs = 20000, esperarResposta = false, descer = true } = {}) {
  const ate = Date.now() + tetoMs;
  let p = null;
  while (Date.now() < ate && !p) {
    p = await apontar(sessao, alvo, { descer });
    if (!p) await espera(400);
  }
  if (!p) throw new Error(`webgui: clicar — ${nomeDoAlvo(alvo)} não está na tela (${tetoMs} ms)`);
  if (p.desceu) detalhe(`webgui: ${nomeDoAlvo(alvo)} não aciona nada — o gesto foi no descendente ${p.recebeu} (${p.porQue})`);
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

// ---------- a caixa de comando (OK-code) pelo navegador ----------
//
// O campo de comando existe em TODA tela do WebGUI (`ToolbarOkCode`, SID `wnd[0]/tbar[0]/okcd`) e
// é INVISÍVEL: `rect` 0×0, `display: flex`. Por isso `click`/`fill` do Playwright o recusam por
// actionability e a digitação NATIVA (`Input.insertText` do CDP) não cai nele — medido no SXD
// 816/100 em 03/09/2026: o texto foi parar no campo da tela que tinha o cursor.
//
// O que resolve é NÃO usar gesto nativo: escrever no `value` por JS e despachar o `Enter` NO PRÓPRIO
// elemento — `dispatchEvent` não passa por actionability, e quem escuta é o Unified Renderer, não o
// navegador. O `lsevents` do campo declara o disparo: `"Enter":[{},{"1":"vkey/0/ses[0]","2":true}]`.
//
// Medido no s4h 758/250 em 04/09/2026 (sessões novas, com o batch do XHR gravado):
//   • o batch que sai é `[{post:"okcode/ses[0]",content:"/nSE16"},{post:"vkey/0/ses[0]"},{get:"state/ur"}]`
//     — o MESMO da via HTTP pura (item 8), montado pelo `submitOkCode` do próprio renderer;
//   • navegação numa sessão: `/nSE16` → `/3` → `/nSE38` → `/n`, 1,58-1,60 s por salto;
//   • CONTRA-PROVA: escrever o `value` e NÃO despachar o Enter não navega (fica na mesma tela, 0 POST).
//
// **O OK-code LEVA o que foi digitado — desde que o campo tenha PERDIDO O FOCO antes.** Medido no
// s4h 758/250 em 04/09/2026 (item 31, `sap-accelerate/work/POC_webgui_okcode_valores/`), na tela de
// seleção da SE16 sobre a T000, com o filtro MTEXT='Neduca' (1 das 5 linhas) e o batch lido do CDP:
//   • `preencher` + `comandar('ONLI')`            → "5 acertos" — o valor SE PERDEU (o limite antigo);
//   • `preencher` + **`blur`** + `comandar('ONLI')` → "1 acertos", com `value/…txtI1-LOW` e
//     `okcode/ses[0]` no MESMO post — o filtro foi aplicado E o fcode executou.
// Contrafactuais da mesma rodada: o OK-code sem valor traz a tabela inteira ("5 acertos"), e o
// valor com Enter mas SEM OK-code não executa (fica na tela de seleção); o controle positivo pelo
// botão (`acionar('btn[8]')`) dá o mesmo "1 acertos".
//
// A causa está no fonte: quem publica o valor é o `Change` do controle, que faz
// `addBatch({post:"value/"+SID})` — e `submitOkCode` enfileira na MESMA fila (`v.add`) antes de
// mandar. Faltava só o valor entrar nela: `Input.insertText` mexe no DOM e não dispara `Change`;
// o `blur` dispara. Um `change` sintético SEM `blur` não basta (medido) — o gatilho é o `blur`.
// Por isso `comandar` publica o campo em foco antes de mandar o OK-code (`publicarValores`).
// Preenchendo VÁRIOS campos isso já acontece sozinho: o clique no campo seguinte tira o foco do
// anterior — só o último fica pendente, e é dele que o `comandar` cuida.
//
// **E SÓ o `comandar` tinha esse problema.** Medido no s4h 758/250 em 05/09/2026 (item 55,
// `sap-accelerate/work/POC_webgui_gestos_valores/`), o MESMO ciclo da SE16/T000 com a linha de base
// repetida na rodada: `tecla('F8')`, `clicar` em outro campo, `clicar` num rótulo `<L>`, `clique`
// cru por coordenada em área inerte, `abrirMenu` e `navegarMenu` deram TODOS "1 acertos" — nenhum
// perde o valor, e por isso `publicarValores` não existe (nem precisa) em `clicar`/`tecla`.
// São dois mecanismos: o gesto de MOUSE tira o foco e o `blur` publica (vale até quando o foco vai
// ao `BODY`, e aí sai um POST isolado `[{post:"value/…",logic:"ignore"}]`); o gesto de TECLA NÃO
// blura (medido com listener no campo) e ainda assim leva, porque o `vkey` sai endereçado ao
// CONTROLE (`vkey/8/wnd[0]`) com o `value/` dele junto — ao contrário do `vkey/0/ses[0]` do
// `submitOkCode`, que é da SESSÃO. A razão de fundo: `comandar` é o único gesto do canal que NÃO
// é nativo — despacha um `KeyboardEvent` sintético NOUTRO elemento (o `ToolbarOkCode`, 0×0), então
// o campo preenchido não perde o foco nem recebe evento algum.
//
// ⚠️ **OK-code que abre POPUP trava a janela principal.** Medido: `/15` (Shift+F3) no menu abre a
// pergunta de logoff (`sap.its.getPopupCount()` 1) e daí o `okcd` de `wnd[0]` não responde mais —
// o `/nSE16` seguinte não postou nada. Dirigir popup é `wnd[1]` (fila adt-client, item 23).

/** PURO: a expressão que escreve o OK-code no campo invisível e dispara o `Enter` que o renderer
 * escuta. Devolve `false` quando a tela não tem o campo — nenhuma tela medida ficou sem ele. */
export function jsComando(texto) {
  const v = String(texto ?? '').trim();
  if (!v) throw new Error('jsComando: informe o OK-code (ex. "/nSE16", "ONLI", "/3", "/n")');
  return `(() => {
    const el = document.getElementById('ToolbarOkCode');
    if (!el) return false;
    el.value = ${JSON.stringify(v)};
    for (const tipo of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
    return true;
  })()`;
}

/** PURO: o `blur` no campo em foco — o gesto que faz o renderer PUBLICAR o valor digitado
 * (`addBatch({post:"value/"+SID})`), para o OK-code seguinte levá-lo no mesmo post. Devolve o `id`
 * do campo publicado, ou `null` quando não havia campo em foco (nada a publicar). */
export const JS_PUBLICAR_FOCO = `(() => {
  const e = document.activeElement;
  if (!e || e === document.body || !('value' in e) || e.id === 'ToolbarOkCode') return null;
  e.blur();
  return e.id || true;
})()`;

/**
 * Manda um OK-code pela caixa de comando e espera a resposta do ABAP. LEVA junto o que foi
 * `preencher`-ido: antes do OK-code, tira o foco do campo, que é o que faz o renderer publicar o
 * valor (§ acima). `publicarValores: false` volta ao gesto cru, sem o `blur`.
 * `mudou: false` é INFORMAÇÃO: a tela ficou igual, o comando não pegou (popup aberto, fcode que a
 * dynpro não tem, ou sessão encerrada por um `/nex` anterior).
 *
 * ⚠ `/n` (e `/3`) **encerra a transação**, não vai ao menu: medido no s4h 758/250 em 05/09/2026
 * (item 37, pela via HTTP) que ele cai na tela de fundo da sessão — `SMEN` só quando a sessão já
 * carregou o menu, e `S000`/`SAPMSYST` quando não. Para ir ao menu: `/nSMEN`.
 */
export async function comandar(sessao, texto, { tetoMs = 25000, publicarValores = true } = {}) {
  const js = jsComando(texto);
  const publicado = publicarValores ? await avaliar(sessao, JS_PUBLICAR_FOCO) : null;
  const antes = await carimbo(sessao);
  const t0 = Date.now();
  const achou = await avaliar(sessao, js);
  if (!achou) throw new Error(`webgui: comandar — a tela não tem o campo ToolbarOkCode (${texto})`);
  const mudou = await esperarMudanca(sessao, antes, { tetoMs });
  return { okcode: String(texto).trim(), mudou, ms: Date.now() - t0, publicado: publicado ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// O MENU DA BARRA — chegar numa tela por CAMINHO, sem saber o tcode
//
// Medido no s4h 758/250 em 2026-09-04 (fila `adt-client`, item 26; bruto e leitura em
// `sap-accelerate/work/POC_webgui_menu/`). O menu da barra NÃO existe no DOM antes de ser aberto:
// o botão `cua2sapmenu_btn` (SID `wnd[0]/tbar[0]/[0]`) é quem o materializa. Aberto, ele é o
// modelo mais legível deste canal — 121 itens varridos numa tela, e **o `id` de cada item É o
// caminho** (`wnd[0]/mbar/menu[5]/menu[3]/menu[0]`), igual ao SID do SAP GUI.
//
// ⚠️ TRÊS armadilhas, todas medidas, todas silenciosas:
//  1. **Há DOIS menus `POMNI` na tela.** O da barra (`wnd[0]/mbar/…`) e o de informação do sistema
//     (`sysInfoAreaMenuItem*`), que tem um item chamado **"Sistema"** — o mesmo rótulo do menu
//     `wnd[0]/mbar/menu[5]`. Casar por rótulo solto pega o errado e "aciona" nada.
//  2. **O botão Menu é TOGGLE** (`lsdata[25] === 'TOGGLE'`): com o menu já aberto, clicar FECHA.
//     Numa varredura, isso faz nós que abrem perfeitamente devolverem zero filho.
//  3. **`Escape` NÃO fecha o menu** — é o `ESCAPE` do SAP (o item "Cancelar" carrega
//     `lsdata[15] === 'ESCAPE'`) e CANCELA A TRANSAÇÃO: a tela sai da SE38 e o passo seguinte
//     falha com "não está na tela". Fechar o menu é usar o toggle sabendo o estado.

/** O botão que MATERIALIZA o menu — id fixo em toda tela medida (SID `wnd[0]/tbar[0]/[0]`). */
export const BOTAO_DE_MENU = 'cua2sapmenu_btn';

/** PURO: o `id` de um item de menu É o caminho — `id` é filho DIRETO de `prefixo`? */
export const filhoDiretoDeMenu = (prefixo, id) =>
  typeof id === 'string' && typeof prefixo === 'string'
  && id.startsWith(`${prefixo}/menu[`) && !id.slice(prefixo.length + 1).includes('/');

/** PURO: este `POMNI` é da BARRA (e não do menu de informação do sistema)? */
export const daBarraDeMenu = (id) => /^wnd\[\d+\]\/mbar\/menu\[\d+\]/.test(String(id ?? ''));

/**
 * PURO: o vocabulário `lsdata` do `POMNI`, medido em 121 itens (s4h 758/250, 04/09/2026) — sete
 * índices, e nenhum sobrando:
 *
 * | índice | o que é | cobertura |
 * |---|---|---|
 * | `1`  | o rótulo | 121/121 |
 * | `4`  | `true` = há uma linha SEPARADORA logo acima (início de grupo) | 14 |
 * | `5`  | `false` = item DESABILITADO — só aparece quando falso (item 48) | 7 em 279 |
 * | `6`  | `true` = tem submenu — bate 1:1 com `aria-haspopup` e com o índice `7` | 26 |
 * | `7`  | o id do popup FILHO (`mnu0_494`) — **volátil**, muda a cada render | 26 |
 * | `15` | o atalho (`F5`, `CTRL_F3`, `ESCAPE`) | 29 |
 * | `18` | `{ SID, Type: 'GuiMenu' }` — o SID é IGUAL ao `id` do DOM (121/121) | 121/121 |
 * | `19` | o rótulo de novo — igual ao `1` em 121/121 | 121/121 |
 *
 * ⚠️ O `POMNI` **não publica `lsevents`** (null em 121/121): quem publica o `Select` é o `POMN`
 * pai — `{"1":"action/4","2":true}`. Por isso o acionamento AQUI é CLIQUE; na via HTTP pura o
 * comando é esse `action/4` levando o SID do item, e aí não há menu a abrir (`its.navegarMenu`,
 * item 49) — este `interpretarItemDeMenu` serve às duas.
 */
export function interpretarItemDeMenu(bruto) {
  const l = bruto?.lsdata ?? {};
  const sid = sidDoLsdata(l);
  return {
    id: bruto?.id ?? null,
    sid: sid?.SID ?? null,
    rotulo: typeof l['1'] === 'string' ? l['1'] : null,
    atalho: typeof l['15'] === 'string' ? l['15'] : null,
    submenu: l['6'] === true,
    inicioDeGrupo: l['4'] === true,
    // A habilitação sai do `lsdata[5]`, NÃO do ARIA (item 48, s4h 758/250, 05/09/2026). Medido em
    // 279 itens de 5 telas: os 7 desabilitados trazem `5: false` + `aria-disabled="true"` +
    // classe `urMnuRowDsbl`; os 272 habilitados OMITEM o `5` — o `lsdata` só transporta o que
    // difere do default, como já fazia com `4` e `6`. Por isso "ausente" é habilitado, e não há
    // mais `null` aqui.
    // ⚠️ `aria-disabled="false"` NÃO quer dizer "habilitado": ele aparece só no item REALÇADO de
    // cada popup (`urMnuRowOn`), 47/47 nas 5 telas. Ler habilitação do ARIA era ler o realce.
    habilitado: !(l['5'] === false || bruto?.desabilitado === 'true'),
    nivel: String(bruto?.id ?? '').split('/menu[').length - 2,
  };
}

/** PURO: `'Sistema > Serviços > Reporting'` → `['Sistema', 'Serviços', 'Reporting']`. */
export function partirCaminhoDeMenu(caminho) {
  const partes = (Array.isArray(caminho) ? caminho : String(caminho ?? '').split('>'))
    .map((x) => String(x).trim()).filter(Boolean);
  if (!partes.length) throw new Error('menu: informe o caminho (ex. "Sistema > Serviços > Reporting")');
  return partes;
}

/** PURO: qual dos `irmaos` é o `rotulo` — exato primeiro, prefixo depois, sem acento nem caixa. */
export function acharItemDeMenu(irmaos, rotulo) {
  const norma = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alvo = norma(rotulo);
  return (irmaos ?? []).find((i) => norma(i.rotulo) === alvo)
    ?? (irmaos ?? []).find((i) => norma(i.rotulo).startsWith(alvo))
    ?? null;
}

/** O despejo dos `POMNI` VISÍVEIS — a filtragem por barra é do `itensDeMenu`. */
export const JS_ITENS_DE_MENU = `[...document.querySelectorAll('[ct="POMNI"]')]
  .filter((el) => el.offsetWidth || el.offsetHeight)
  .map((el) => { let d = null; try { d = JSON.parse(el.getAttribute('lsdata')); } catch { d = null; }
    return { id: el.id || null, lsdata: d, desabilitado: el.getAttribute('aria-disabled') }; })`;

/** Os itens de menu da BARRA visíveis agora, já interpretados. */
export async function itensDeMenu(sessao) {
  const brutos = await avaliar(sessao, JS_ITENS_DE_MENU);
  return (brutos ?? []).filter((b) => daBarraDeMenu(b.id)).map(interpretarItemDeMenu);
}

/** Fecha o menu da barra usando o TOGGLE. ⚠️ Nunca com `Escape` — ele cancela a TRANSAÇÃO. */
export async function fecharMenu(sessao, { tentativas = 3 } = {}) {
  for (let t = 0; t < tentativas; t += 1) {
    if (!(await itensDeMenu(sessao)).length) return true;
    await clicar(sessao, BOTAO_DE_MENU);
    const ate = Date.now() + 4000;
    while (Date.now() < ate && (await itensDeMenu(sessao)).length) await espera(300);
  }
  return !(await itensDeMenu(sessao)).length;
}

/**
 * Abre o menu da barra e devolve os itens de nível 0. Fecha antes (o botão é toggle) e espera o
 * item APARECER — a abertura não é síncrona, e um clique não pega sempre de primeira.
 */
export async function abrirMenu(sessao, { tetoMs = 6000, tentativas = 4 } = {}) {
  await fecharMenu(sessao);
  for (let t = 0; t < tentativas; t += 1) {
    await clicar(sessao, BOTAO_DE_MENU);
    const ate = Date.now() + tetoMs;
    while (Date.now() < ate) {
      const itens = await itensDeMenu(sessao);
      if (itens.length) return itens;
      await espera(300);
    }
  }
  throw new Error(`webgui: abrirMenu — o menu não abriu (${BOTAO_DE_MENU}, ${tentativas} tentativas)`);
}

/**
 * Desce o menu por CAMINHO e ACIONA a folha — a via que dispensa saber o tcode.
 *
 * ```js
 * await navegarMenu(s, 'Sistema > Serviços > Reporting');   // da SE38 chega na SA38
 * ```
 *
 * ⚠️ O percurso é CASCATA, e tem de ser: abrir um irmão FECHA o submenu anterior, então não dá
 * para varrer o nível inteiro e só depois descer. A cada passo os candidatos são só os filhos
 * DIRETOS do nó atual (`filhoDiretoDeMenu`) — nunca "todo item com este rótulo".
 *
 * Devolve `{ caminho, passos, folha, mudou }`. `mudou: false` é INFORMAÇÃO, a mesma de `acionar`:
 * a folha foi clicada e a tela ficou igual.
 *
 * Com `{ acionar: false }` para no último nó e devolve os `filhos` dele — é assim que se DESCOBRE
 * o menu de uma tela sem acionar nada.
 */
export async function navegarMenu(sessao, caminho, { acionar: aciona = true, tetoMs = 8000, tetoAcaoMs = 40000 } = {}) {
  const partes = partirCaminhoDeMenu(caminho);
  await abrirMenu(sessao);
  let prefixo = 'wnd[0]/mbar';
  const passos = [];
  for (let n = 0; n < partes.length; n += 1) {
    const rotulo = partes[n];
    const irmaos = (await itensDeMenu(sessao)).filter((i) => filhoDiretoDeMenu(prefixo, i.id));
    const alvo = acharItemDeMenu(irmaos, rotulo);
    if (!alvo) {
      throw new Error(`webgui: navegarMenu — "${rotulo}" não está sob ${prefixo}. Tenho: ${irmaos.map((i) => i.rotulo).join(' | ')}`);
    }
    // ⚠️ item DESABILITADO: o clique é ENGOLIDO — medido no mesmo popup (SAP Easy Access,
    // "Processar"), o cinza deixa o menu ABERTO e o carimbo igual, enquanto o irmão habilitado
    // fecha o menu e muda a tela. Sem esta guarda a falha seria a mais silenciosa deste canal:
    // o percurso esperaria 8 s por filhos que nunca vêm e devolveria "zero filhos".
    if (!alvo.habilitado) {
      throw new Error(`webgui: navegarMenu — "${alvo.rotulo}" está DESABILITADO nesta tela (${alvo.id}); o clique não faria nada`);
    }
    const ultimo = n === partes.length - 1;
    if (ultimo && !alvo.submenu && aciona) {
      const antes = await carimbo(sessao);
      await clicar(sessao, alvo.id);
      const mudou = await esperarMudanca(sessao, antes, { tetoMs: tetoAcaoMs });
      passos.push({ ...alvo, acionado: true });
      return { caminho: partes, passos, folha: alvo, mudou };
    }
    await clicar(sessao, alvo.id);
    // ⚠️ a abertura do submenu NÃO é síncrona: esperar o FILHO, nunca um tempo fixo. Com espera
    // fixa de 900 ms, "Serviços" devolvia 0 filhos ora sim ora não.
    const ate = Date.now() + tetoMs;
    let filhos = [];
    do {
      await espera(300);
      filhos = (await itensDeMenu(sessao)).filter((i) => filhoDiretoDeMenu(alvo.id, i.id));
    } while (Date.now() < ate && !filhos.length);
    passos.push({ ...alvo, filhos });
    prefixo = alvo.id;
    if (ultimo) return { caminho: partes, passos, folha: null, filhos, mudou: false };
  }
  return { caminho: partes, passos, folha: null, mudou: false };
}
