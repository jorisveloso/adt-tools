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
      // A saída depende de QUAL dos três é: CA desconhecida se resolve declarando a CA (`ca` no
      // sistemas.json → ca.mjs); nome que não bate, não — nenhuma CA faz `awskartsxd01` valer por
      // um certificado emitido para outro nome. Aí é usar o host que está no certificado.
      const nomeNaoBate = /ALTNAME/i.test(String(erro));
      return { ok: false, causa: 'certificado', status: null, bytes: 0, cookies: [],
        motivo: `o ICM respondeu, mas o Node recusou o certificado (${erro}) — ` +
          (nomeNaoBate
            ? 'o certificado é de OUTRO nome. Declarar a CA não cobre isto: use na `url` o host que consta no certificado (leia-o com spkiDoHost).'
            : 'CA interna que esta máquina não conhece. Declare a CA do cliente em sistemas.json: ' +
              '{ "<alias>": { "ca": "C:/caminho/ca-interna.pem" } } — ou "sistema", se ela já estiver no store do Windows.') +
          ' A opção `certificado` é do CHROME e NÃO cobre este `fetch`: são dois validadores (ver ca.mjs e receita-webgui.md § HTTPS com certificado interno).' };
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
//
// ⚠ As duas peças são das DUAS vias do canal, não só do navegador (fila `adt-client` item 66): o
// código aqui é PURO — só compõe callbacks, não toca CDP nem HTTP — e por isso o `its.mjs` o
// IMPORTA em vez de ter o seu (o mesmo arranjo do `montarTela`). O que é por via é a INSTÂNCIA e o
// momento de rodá-la: no navegador a pilha corre antes do `Browser.close` (o descarte é um clique,
// precisa da página); na via HTTP, antes do `/nex` (o descarte é um POST, precisa da sessão ITS
// viva). Sessão morta = descarte impossível pelas duas vias — daí o aviso alto, com o rótulo.

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

/** O prefixo de log da via desta sessão — a sessão do `its.mjs` se marca com `via: 'http'`. */
const viaDa = (sessao) => (sessao?.via === 'http' ? 'its' : 'webgui');

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
  if (!sessao?.desfazer) throw new Error('transacional: a sessão não tem pilha de desfazer (use a de `abrirNavegador` ou a do `its.abrir`)');
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
      passo(`${viaDa(sessao)}: descartando "${rotulo}" — o formulário já tinha criado`);
      try {
        await descartar();
        baixa();
      } catch (e) {
        detalhe(`${viaDa(sessao)}: descarte de "${rotulo}" falhou (${e.message}) — fica na pilha para o fechar`);
      }
    }
  }
}

/**
 * Espera o Chrome apagar do disco o perfil temporário — o `rmSync` de uma tentativa só falha
 * enquanto algum processo do grupo ainda segura arquivo lá dentro. Devolve `true` se saiu.
 */
async function apagarPerfil(perfil, { tentativas = 10, intervaloMs = 200 } = {}) {
  for (let i = 0; i < tentativas; i++) {
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* ainda segurado */ }
    if (!fs.existsSync(perfil)) return true;
    await espera(intervaloMs);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// A porta do CDP: EFÊMERA, e lida do arquivo que o Chrome escreve NO NOSSO PERFIL
// ─────────────────────────────────────────────────────────────────────────────
//
// **Medido em 05/09/2026** (fila `adt-client` item 65, `sap-accelerate/work/POC_webgui_porta/`):
// com a porta FIXA em 9222 e um Chrome anterior ainda vivo, o Chrome novo **falha o bind e morre**,
// mas o `GET /json/list` responde — do Chrome ANTIGO. A sessão "nova" se anexava à página VELHA sem
// aviso nenhum: `window.__marca = 'SESSAO_A'` escrita na primeira sessão era lida pela segunda
// (`anexouNaSessaoAntiga: true`, `medicoes/raw/porta-presa-antes.txt`). Duas "sessões" na MESMA
// dynpro é pior que o erro que o item relatava: o `CDP não respondeu na porta 9222` só aparece
// quando o antigo já fechou o listener; enquanto ele está de pé, a corrupção é silenciosa.
//
// A porta 0 tira a corrida da mesa: o SO dá uma porta livre e o Chrome escreve a porta REAL em
// `<perfil>/DevToolsActivePort` (medido: 668 ms; dois Chromes simultâneos ganham 58176 e 58177, e
// cada um enxerga só o próprio target). E como o arquivo é do NOSSO perfil, ele é a prova de que
// quem subiu foi o NOSSO processo — se o Chrome morreu no bind, o arquivo não aparece e o erro sai
// nomeando a porta ocupada, em vez de anexar na sessão de outro.
const ARQUIVO_PORTA = 'DevToolsActivePort';

/** Sonda `<perfil>/DevToolsActivePort` até o Chrome escrevê-lo por inteiro; devolve a porta real. */
async function esperarPortaDoPerfil(perfil, { ate, saiu }) {
  const arquivo = path.join(perfil, ARQUIVO_PORTA);
  while (Date.now() < ate) {
    try {
      const txt = fs.readFileSync(arquivo, 'utf8');
      // o Chrome escreve DUAS linhas (porta, caminho do ws) — sem a quebra, ainda está escrevendo
      if (txt.includes('\n')) {
        const p = Number(txt.split('\n')[0].trim());
        if (Number.isInteger(p) && p > 0) return p;
      }
    } catch { /* ainda subindo */ }
    if (saiu()) return null; // morreu antes de escrever: bind recusado ou Chrome que não sobe
    await espera(100);
  }
  return null;
}

/**
 * Sobe o Chrome headless e devolve a sessão CDP `{ cfg, cmd, eventos, desfazer, fechar, porta }` já
 * autenticada no `cfg` e com o polyfill armado. Quem abre FECHA (o `fechar` desfaz o que ficou
 * pendente, fecha o navegador e some com o perfil).
 *
 * `porta: 0` (o default) pede uma porta EFÊMERA ao SO — é o que faz várias sessões em série, ou
 * duas ao mesmo tempo, não se atropelarem; ver o bloco acima. Passe um número só quando alguém de
 * fora precisar se anexar num endereço conhecido, sabendo que aí a porta ocupada vira erro.
 */
export async function abrirNavegador(cfg, { porta = 0, largura = 1600, altura = 1000, tetoMs = 30000, navegador, origemSegura = true, certificado = cfg?.certificado ?? null } = {}) {
  const chrome = acharNavegador({ navegador });
  const cabecalho = autorizacao(cfg); // recusa ANTES de subir navegador nenhum
  const bandeirasCert = bandeirasDeCertificado(certificado); // recusa pino torto aqui, não na navegação
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'jbv-webgui-'));
  passo(`webgui: subindo ${path.basename(chrome)} headless (porta ${porta || 'efêmera'})`);
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    ...(origemSegura ? bandeirasDeOrigemSegura(cfg.base) : []),
    ...bandeirasCert,
    `--window-size=${largura},${altura}`, 'about:blank',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();
  let saiu = false;
  proc.on('exit', () => { saiu = true; });

  const ate = Date.now() + tetoMs;
  // a porta REAL sai do arquivo do NOSSO perfil — nunca de `/json/list`, que pode ser de outro Chrome
  const portaReal = await esperarPortaDoPerfil(perfil, { ate, saiu: () => saiu });
  if (!portaReal) {
    try { proc.kill(); } catch { /* já morreu */ }
    await apagarPerfil(perfil);
    throw new Error(saiu
      ? `webgui: o Chrome saiu sem abrir o CDP${porta ? ` — a porta ${porta} já está ocupada (outro Chrome ainda a segura); use a porta 0 (default), que pede uma livre ao SO` : ''}`
      : `webgui: o Chrome não escreveu ${ARQUIVO_PORTA} no perfil em ${tetoMs} ms`);
  }

  // o listener já está de pé; falta a aba aparecer no /json/list
  let alvo = null;
  while (Date.now() < ate && !alvo) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${portaReal}/json/list`)).json();
      alvo = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* ainda subindo */ }
    if (!alvo) await espera(100);
  }
  if (!alvo) {
    try { proc.kill(); } catch { /* já morreu */ }
    await apagarPerfil(perfil);
    throw new Error(`webgui: CDP não respondeu na porta ${portaReal} em ${tetoMs} ms`);
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
    // Fechar o NAVEGADOR, não a aba: medido em 05/09/2026 que o `proc.kill()` puro deixava
    // renderer órfão segurando o perfil (84 pastas `jbv-webgui-*` no tmp e 3 chrome.exe vivos de
    // sessões de horas antes). O `Browser.close` derruba o grupo inteiro — e NÃO responde, o
    // navegador morre antes do retorno; o que volta pelo ws é `Inspector.detached`. Por isso o
    // comando vai sem `await` e quem espera é o `exit` do processo.
    cmd('Browser.close').catch(() => {});
    const morreu = Date.now() + 3000;
    while (!saiu && Date.now() < morreu) await espera(100);
    try { ws.close(); } catch { /* já fechado */ }
    try { proc.kill(); } catch { /* já morreu */ }
    if (!await apagarPerfil(perfil)) {
      aviso(`webgui: o perfil temporário ${perfil} NÃO saiu do disco — algum processo do Chrome ainda o segura. Apague à mão.`);
    }
    return { desfeito };
  };
  return { cfg, cmd, eventos, desfazer, fechar, porta: portaReal, perfil };
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

/** PURO: este POST é a TELEMETRIA do WebGUI (FESR), não o round-trip da dynpro. Medido no s4h
 * 758/250 em 06/09/2026: um gesto pode disparar DOIS POSTs, e o segundo é
 * `…/sap/bc/gui/sap/its;sap-fesr-only/webgui` — contá-lo faria a espera achar que o ABAP
 * respondeu antes de ter respondido. */
export const ehTelemetria = (url) => /sap-fesr-only/.test(String(url ?? ''));

/**
 * PURO: os round-trips do renderer nos eventos CDP a partir de `desde` — `{ enviados, respondidos }`,
 * já sem a telemetria. **É O SINAL QUE O CARIMBO NÃO DÁ**: houve conversa com o ABAP.
 */
export function roundTrips(eventos = [], desde = 0) {
  const novos = eventos.slice(desde);
  const ids = new Set();
  for (const e of novos) {
    if (e.method === 'Network.requestWillBeSent' && e.params?.request?.method === 'POST'
      && !ehTelemetria(e.params?.request?.url)) ids.add(e.params.requestId);
  }
  const respondidos = new Set();
  for (const e of novos) {
    if ((e.method === 'Network.responseReceived' || e.method === 'Network.loadingFinished')
      && ids.has(e.params?.requestId)) respondidos.add(e.params.requestId);
  }
  return { enviados: ids.size, respondidos: respondidos.size };
}

/**
 * Espera o gesto FECHAR: o round-trip com o ABAP **ou** a tela trocar — o que vier primeiro — e só
 * então deixa o DOM assentar. Devolve `{ respondeu, mudou, ms }`, e são coisas DIFERENTES.
 *
 * ⚠️ **O carimbo sozinho é cego, e o preço é o teto inteiro.** Medido no s4h 758/250 em 06/09/2026
 * (item 80, `sap-accelerate/work/POC_webgui_grid_edit/medicoes/item80-carimbo-repaint.md`), cinco
 * gestos numa tela com ALV editável, cada um com UM round-trip completo — em **três** deles o
 * carimbo ficou idêntico:
 *
 * | gesto | round-trip | carimbo | por quê |
 * |---|---|---|---|
 * | FC01 (1ª vez, statusbar ganha msg) | 1 POST, 396 ms | mudou | `nEl` 873→874 |
 * | FC01 de novo (repaint idêntico) | 1 POST, 183 ms | **igual** | gravou o mesmo, tela igual |
 * | escrever + FC01 (o valor já está no DOM) | 1 POST, 2072 ms | mudou | `nEl` 874→879 |
 * | FCZZ (fcode que a dynpro não tem) | 1 POST, 186 ms | **igual** | o servidor recebeu e ignorou |
 * | FC03 (muda só a mensagem) | 1 POST, 374 ms | **igual** | a statusbar está DEPOIS dos 300 chars |
 *
 * O carimbo lê `title + nº de elementos + 300 chars do innerText` — e esses 300 chars são o
 * CABEÇALHO (título, menu, botões), que um repaint de grid não toca. Quando ele salvou, salvou pela
 * contagem de elementos, por acaso. É essa cegueira que explica os 4,2 s × 42,8 s do item 47
 * (mesmo `comandar('FC01')`, mesma sessão): **não é intermitência** — quando o repaint confirma o
 * que já estava no DOM, o carimbo não muda e a espera antiga pagava o teto inteiro.
 *
 * ⚠️ **`respondeu: true` NÃO quer dizer "o comando pegou".** O FCZZ acima prova: fcode inexistente
 * também faz round-trip, o ABAP só o ignora. O que `respondeu` separa é o que antes se confundia
 * num `mudou: false` só — *nenhuma conversa aconteceu* (`respondeu: false`) × *houve conversa e a
 * tela ficou igual* (`respondeu: true, mudou: false`). Se o comando teve EFEITO, quem diz é a
 * mensagem (`lerTela(s).mensagem`) ou o dado.
 */
export async function esperarTroca(sessao, antes, { desde = 0, tetoMs = 25000, quietoMs = 1200 } = {}) {
  const t0 = Date.now();
  const ate = t0 + tetoMs;
  let respondeu = false;
  while (Date.now() < ate) {
    await espera(200);
    if (roundTrips(sessao.eventos, desde).respondidos > 0) { respondeu = true; break; }
    if (antes != null && await carimbo(sessao) !== antes) break;
  }
  // Assentar SEMPRE, e só depois julgar: a resposta chega ANTES do repaint (medido: resposta em
  // 183 ms, DOM repintado em ~400 ms). Ler o carimbo no instante da resposta diria "não mudou"
  // para tela que estava justamente trocando.
  let c = await carimbo(sessao);
  let vistos = sessao.eventos.length;
  let ultimo = Date.now();
  const limite = Date.now() + tetoMs;
  while (Date.now() - ultimo < quietoMs && Date.now() < limite) {
    await espera(200);
    const d = await carimbo(sessao);
    if (d !== c || sessao.eventos.length > vistos) { c = d; vistos = sessao.eventos.length; ultimo = Date.now(); }
  }
  return { respondeu, mudou: antes != null && c !== antes, ms: Date.now() - t0 };
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
 * PURO: um BOTÃO (`ct="B"`) está habilitado? — do `lsdata[5]`, **o mesmo índice do item de menu**.
 *
 * Medido no item 81 (s4h 758/250, 06/09/2026) com irmãos no laboratório `ZJBV_BTN81`: dois
 * pushbuttons na MESMA tela de seleção, um normal e outro com `SCREEN-INPUT = 0`. Os `lsdata`
 * diferem em UM índice, e é o `5`:
 *
 * ```
 * BT_ON  {"0":"BTN ON", "3":"100%",            "17":"B","20":true,"21":true,"27":{…}}
 * BT_OFF {"0":"BTN OFF","3":"100%","5":false,  "17":"B","20":true,"21":true,"27":{…}}
 * ```
 *
 * Com o `5` vêm sempre juntos `aria-disabled="true"`, `tabindex="-1"`, `hidefocus="true"`, a classe
 * `lsButton--disabled` (e a saída de `lsButton--active`/`--focusable`), `opacity: 0.4` e
 * `cursor: default`. Habilitado OMITE o `5` — o `lsdata` só transporta o que difere do default,
 * como no menu (item 48).
 *
 * ⚠️ **A regra é por PAPEL, não geral.** No campo de entrada (`ct="CBS"`) o `lsdata[5]` é o
 * **valor** digitado (`"ativo"`), não flag nenhuma. Ler o `5` de qualquer controle mente.
 * ⚠️ **O `lsevents` NÃO distingue**: o `Press` continua declarado no botão cinza, idêntico ao do
 * irmão. Quem lê pela via HTTP também precisa do `lsdata[5]`.
 * ⚠️ **`el.disabled` é sempre `false`** — o botão é um `<div>`, e a propriedade DOM nem existe
 * nele. Era isso que o despejo lia antes deste item: 390 botões medidos, `false` em 390.
 */
export function habilitadoDoBotao(lsdata, ariaDesabilitado = null) {
  return !(lsdata?.['5'] === false || ariaDesabilitado === 'true');
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
      // ⚠️ quem carrega a verdade aqui é o `somenteLeitura` (`el.readOnly`), não o `desabilitado`:
      // medido no item 81 (P_ON × P_OFF com `SCREEN-INPUT = 0`) que o campo bloqueado sai
      // `readOnly: true` e `disabled: false`. O `lsdata[5]` do campo é o VALOR, não a habilitação.
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
        tecla: teclaDoBotao(d), accesskey: bruto.accesskey ?? null,
        habilitado: habilitadoDoBotao(d, bruto.ariaDesabilitado) };
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
    // o botão da BARRA (tem `btn[n]` no fim do SID) e o PUSHBUTTON DA DYNPRO (`wnd[n]/usr/…`, sem
    // okcode, acionado pelo id). Sem o segundo, o `habilitado` seria inalcançável: medido no item
    // 81 que a barra não acinzenta (o `EXCLUDING` do PF-STATUS REMOVE o botão) — o cinza é do
    // pushbutton de tela. O que sobra de fora é o shell do ITS (`sysInfoAreaToggle` e afins).
    botoes: vis(dePapel('botao')).filter((b) => b.okcode || /^wnd\[\d+\]\/usr\//.test(b.sid ?? '')),
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
    ariaDesabilitado: el.getAttribute('aria-disabled'),
    accesskey: el.getAttribute('data-sap-ls-accesskey'),
    // ⚠️ \`el.disabled\` só existe em \`<input>\`: no \`<div ct="B">\` do botão é sempre \`false\` (390
    // botões medidos no item 81, o cinza inclusive). A habilitação do BOTÃO sai do \`lsdata[5]\`.
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
 *
 * `habilitado` sai do `lsdata[5]` (item 81), NÃO de `el.disabled` — ver `habilitadoDoBotao`.
 * ⚠️ Medido: botão de BARRA cinza é raro a ponto de não ter aparecido em 390 botões de 27 estados;
 * o `EXCLUDING` do PF-STATUS **remove** o botão em vez de acinzentá-lo. Quem fica cinza é o
 * pushbutton da dynpro — e esse não tem `::btn[n]` no id, então é o `lerTela` que o traz.
 */
export async function botoes(sessao) {
  return anotarBotoes(await avaliar(sessao, `[...document.querySelectorAll('*')]
    .filter(e => (e.offsetWidth || e.offsetHeight) && e.id && e.id.indexOf('::btn') > 0 &&
                 e.id.charAt(e.id.length - 1) === ']')
    .map(e => { let d = null; try { d = JSON.parse(e.getAttribute('lsdata') || 'null'); } catch (x) {}
      return { okcode: e.id.split('::').pop(), title: e.title, texto: (e.innerText||'').trim().slice(0,30),
               habilitado: !(d && d['5'] === false || e.getAttribute('aria-disabled') === 'true') }; })`));
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
// ⚠️ **Passar do bloco ROLANDO não é trabalho deste módulo.** Medido (fases C e J): clique
// sintético e PageDown não movem a janela nem geram requisição; quem move é a RODA
// (`Input.dispatchMouseEvent` type `mouseWheel`), e ao chegar perto do fim do bloco o próprio ITS
// dispara um `action/710` (`fragments=166,173;`) que acrescenta 28 linhas. Mas é o MESMO pedido que
// a via HTTP faz, ao mesmo preço — 8,97 KB gzipados por 28 linhas nos dois canais (fase K) — só que
// em fatias de 28 e a ~2,9 s por rodada: **~222 rodadas, ~11 min** para as 1617 linhas.
// Rolar por roda para ler não vale — **quem lê a tabela inteira é o `lerGridInteiro` (§ abaixo)**,
// que posta o mesmo `action/710` DENTRO desta sessão e traz as 1617 em ~1,9 s.

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
 * que o bloco (`bloco.ate < total`) — as que faltam não estão no DOM e esta função não vai buscá-las
 * (§ acima). Para a tabela inteira NESTA MESMA sessão: `lerGridInteiro`.
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

// ---------- o ALV INTEIRO, sem segunda sessão (item 74) ----------
//
// O `lerGrid` acima só alcança o bloco; o `its.lerGrid` alcança tudo mas **numa OUTRA sessão**, que
// não vê o filtro, o drill-down nem a linha selecionada desta tela. Esta seção junta os dois: a
// página **já tem** as duas peças do POST — o `action` (o token da sessão, no `<form
// id="webguiform0">`) e o `moin` —, e o cookie de sessão viaja sozinho num `fetch` same-origin. Um
// POST em `<action>batch/json` de DENTRO da página fala com a MESMA sessão que a tela.
//
// Medido no s4h 758/250 em 05/09/2026 (`sap-accelerate/work/POC_webgui_fragmento`, fases A-E,
// lista do RSPARAM, 1617 × 5):
//
//   • **as três peças estão na página** (fase A): `action` com o token, `moin` como `var` global, e
//     o `SAP_SESSIONID` é HttpOnly — não aparece no `document.cookie` e não precisa: o `fetch`
//     same-origin o manda. O `Authorization` também sai sozinho (é o `Network.setExtraHTTPHeaders`
//     do `abrirNavegador`). Nada de credencial nova, nada de segunda sessão.
//   • **o `moin` NÃO é contador de sequência** (fases A e C): ele não muda entre a tela de seleção e
//     a lista, e o POST que o PRÓPRIO framework manda ao rolar leva exatamente o mesmo valor que o
//     `window.moin`. Não há nada a incrementar, e por isso não há o que dessincronizar.
//   • **o POST traz a tabela inteira**: 1617/1617 linhas, 1 pedido, 11,9 MB de corpo em ~1,9 s de
//     rede + ~48 ms de parse NA PÁGINA (só as células voltam pelo CDP). As 830 células que o bloco
//     do DOM já tinha batem campo a campo com as do POST — 0 divergência (fase B).
//   • **e a tela SOBREVIVE** (fase D, com positiva de controle antes e depois): rolando até o
//     framework pedir sozinho, ele pediu antes (bloco 166→194) e continuou pedindo depois do nosso
//     POST (194→222, em 3 rodadas); o round-trip `btn[3]` trocou a tela e trouxe a de seleção viva.
//
// ⚠️ **O header `moin` é OBRIGATÓRIO, e omiti-lo MATA A SESSÃO.** Medido na fase C: o mesmo POST
// sem o header devolveu **HTTP 500 `Application Server Error`** (9,8 KB de HTML), e daí em diante a
// sessão virou casca — a roda ainda POSTAVA (`fragments=194,203;`) mas o bloco não crescia mais, e
// o `btn[3]` trocou a tela por uma VAZIA (título `""`, 0 campo, 0 grid). Não é "degradou": é a
// sessão perdida, sem aviso na tela. Por isso o `lerGridInteiro` estoura ANTES de postar quando a
// página não tem `moin` — falhar cedo é mais barato que ressuscitar sessão.

/**
 * PURO: a expressão JS que pede um FRAGMENTO do ALV **de dentro da página** e devolve as células já
 * extraídas — `{ status, tipo, bytes, ms, celulas, nLinhas, ehDelta, inicio }`.
 *
 * É o mesmo batch do `batchFragmento` do `its.mjs` (`action/710` com `position`+`fragments`, mais o
 * `get state/ur`), postado na URL do `action` da própria página. `de`/`ate` são 0-BASED (é o que o
 * protocolo usa); o `lsMatrixRowIndex` que volta nas células é 1-based.
 *
 * ⚠️ O corpo tem MEGABYTES (11,9 MB para 1617 linhas) e **não atravessa o CDP**: a extração das
 * células acontece aqui, na página, e só a matriz volta. Trazer o corpo seria trocar 48 ms por uma
 * serialização de 11,9 MB no WebSocket.
 */
export const jsFragmentoDoGrid = (sid, cid, de, ate, { tetoMs = 180000 } = {}) => `(async () => {
  const t0 = performance.now();
  const form = document.getElementById('webguiform0');
  if (!form) return { erro: 'a página não tem o form webguiform0 — não há para onde postar' };
  if (typeof window.moin !== 'string' || !window.moin) return { erro: 'a página não tem o moin' };
  const batch = [
    { post: 'action/710/' + ${JSON.stringify(String(sid))}, content: 'position=${Number(de)}&fragments=${Number(de)},${Number(ate)};' },
    { get: 'state/ur/' + ${JSON.stringify(String(sid))} },
  ];
  let res, corpo;
  try {
    res = await fetch(form.getAttribute('action') + 'batch/json?~RG_WEBGUI=X&', {
      method: 'POST', credentials: 'same-origin', body: JSON.stringify(batch),
      signal: AbortSignal.timeout(${Number(tetoMs)}),
      headers: { 'Content-Type': 'application/json;charset=UTF-8', Accept: 'multipart/mixed', moin: window.moin },
    });
    corpo = await res.text();
  } catch (e) { return { erro: 'o POST falhou — ' + String((e && e.message) || e) }; }
  const ms = Math.round(performance.now() - t0);
  const re = new RegExp('id="grid#' + ${JSON.stringify(String(cid))} + '#([0-9]+),([0-9]+)#if"[^>]*lsdata=\\'([^\\']*)\\'', 'g');
  // ⚠ o corpo é XML CRU: o \`lsdata\` vem com entidade (\`&#39;\`, \`&lt;\`), que o DOM decodificaria
  // sozinho e aqui ninguém decodifica. Sem isto 28 das 8085 células saíam com "&#39;" no valor.
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const decodificar = (t) => t.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (s, e) => {
    if (e.charAt(0) !== '#') return ENT[e.toLowerCase()] || s;
    const hex = e.charAt(1) === 'x' || e.charAt(1) === 'X';
    return String.fromCodePoint(parseInt(hex ? e.slice(2) : e.slice(1), hex ? 16 : 10));
  });
  const celulas = {};
  let m;
  while ((m = re.exec(corpo))) {
    const c = Number(m[2]);
    if (c < 1) continue;                                  // coluna 0 = caixa de seleção da linha
    let d = null;
    // decodificado primeiro; cru como reserva (entidade que vira aspa quebra o JSON) — o mesmo
    // par do \`jsonDoAtributo\` do its.mjs
    try { d = JSON.parse(decodificar(m[3])); } catch (x) { try { d = JSON.parse(m[3]); } catch (y) { d = null; } }
    const v = d && Object.values(d).find((x) => x && typeof x === 'object' && 'value' in x);
    (celulas[m[1]] = celulas[m[1]] || {})[c] = v ? String(v.value) : '';
  }
  const linhas = Object.keys(celulas).map(Number).sort((a, b) => a - b);
  return { status: res.status, tipo: res.headers.get('content-type'), bytes: corpo.length, ms,
    ehDelta: corpo.indexOf('<delta-update') >= 0, nLinhas: linhas.length,
    primeira: linhas[0] ?? null, ultima: linhas[linhas.length - 1] ?? null,
    inicio: corpo.slice(0, 240), celulas };
})()`;

/** PURO: o próximo `de` (1-based) que a faixa ainda não cobre, ou `null` quando ela está inteira. */
export function faltaNaFaixaDoBloco(celulas = {}, de = 1, ate = 0) {
  for (let i = de; i <= ate; i++) if (!celulas[String(i)]) return i;
  return null;
}

/**
 * Lê o ALV **INTEIRO** desta tela — o alcance do `its.lerGrid` sem abrir uma segunda sessão.
 *
 * O que muda em relação ao `lerGrid`: este posta. Ele pede ao servidor os fragmentos que faltam,
 * pelo `action` e pelo `moin` que a própria página carrega, e por isso enxerga **esta** sessão —
 * com o filtro aplicado, o drill-down aberto e a linha selecionada que uma sessão HTTP paralela não
 * veria. Não mexe no DOM: a tela continua com o bloco que tinha (medido: carimbo igual, e o
 * framework segue pedindo fragmento sozinho ao rolar).
 *
 * `alvo` escolhe o grid como no `lerGrid`; `de`/`ate` são 1-based e inclusivos (o 0-based do
 * protocolo fica aqui dentro); sem `ate`, vai até o `total` que o grid declara. `lote` é o tamanho
 * do pedido — o servidor devolve NO MÍNIMO uma janela, então o avanço é pelo que FALTA, não por
 * aritmética.
 *
 * Devolve `{ id, sid, colunas, total, de, ate, linhas, pedidos, bytes, ms, truncado }`, com cada
 * linha `{ _linha, <ColumnID>: valor, … }` — a mesma forma do `its.lerGrid` e do `lerGrid`.
 *
 * ⚠️ `truncado: true` = um pedido não trouxe nenhuma linha nova e o laço parou; a faixa devolvida
 * está incompleta. É informação, não erro.
 */
export async function lerGridInteiro(sessao, alvo = null, { de = 1, ate = null, lote = 500, tetoMs = 180000 } = {}) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'lerGridInteiro');
  const b = await avaliar(sessao, jsBlocoDoGrid(g.id));
  if (!b) throw new Error(`webgui: lerGridInteiro — o grid ${g.id} sumiu do DOM entre a leitura da tela e o despejo`);
  const sid = b.sid ?? g.sid;
  if (!sid) throw new Error(`webgui: lerGridInteiro — o grid ${g.id} não declara SID; sem ele não há como pedir fragmento`);
  const total = Number(b.total || 0);
  const ini = Math.max(1, Number(de) || 1);
  const fim = Math.min(Number(ate ?? total) || 0, total);
  const celulas = {};
  let pedidos = 0, bytes = 0, truncado = false;
  for (let proximo = ini; proximo !== null && proximo <= fim;) {
    const antes = Object.keys(celulas).length;
    const ultima = Math.min(proximo + lote - 1, fim);
    const r = await avaliar(sessao, jsFragmentoDoGrid(sid, g.id, proximo - 1, ultima - 1, { tetoMs }));
    if (r?.erro) throw new Error(`webgui: lerGridInteiro — ${r.erro}`);
    pedidos++; bytes += Number(r.bytes || 0);
    // ⚠ o 500 do POST sem `moin` MATA a sessão (§ acima) — qualquer resposta que não seja delta
    // para o laço aqui, com o começo do corpo, em vez de virar "0 linha" sem causa.
    if (r.status !== 200 || !r.ehDelta) {
      throw new Error(`webgui: lerGridInteiro — o ITS respondeu ${r.status} ${r.tipo} (${r.bytes} B), não um delta: ${String(r.inicio).replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    for (const [linha, cels] of Object.entries(r.celulas || {})) if (!celulas[linha]) celulas[linha] = cels;
    if (Object.keys(celulas).length === antes) { truncado = true; break; }
    proximo = faltaNaFaixaDoBloco(celulas, ini, fim);
  }
  const linhas = linhasDoBloco(celulas, b.colunas ?? [], { de: ini, ate: fim });
  detalhe(`webgui: lerGridInteiro ${g.id} — ${linhas.length} linha(s) de ${total} em ${pedidos} pedido(s), ${bytes} B, na sessão da tela`);
  return { id: g.id, sid, colunas: b.colunas ?? [], total, de: ini, ate: fim, linhas,
    pedidos, bytes, ms: Date.now() - t0, truncado };
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
 *
 * ⚠️ **Uma célula por vez.** Para VÁRIAS de uma vez, `colarBloco` — medido (item 79) que as mesmas 6
 * células custam 9748 ms aqui e 2578 ms num round-trip só lá.
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
      'Este módulo escreve no que a tela já trouxe; chegar a linha distante é navegação: `posicionarGrid(sessao, alvo, linha)`.');
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

// ---------- COLAR UM BLOCO no ALV, num gesto só (item 79) ----------
//
// Medido no s4h 758/250 em 06/09/2026 (fila `adt-client`, item 79; bruto e leitura em
// `sap-accelerate/work/POC_webgui_grid_paste/`), no mesmo laboratório do item 47
// (`ZJBV_ALV47_EDIT`: ALV editável que PERSISTE).
//
// A célula editável declara `"ClipboardTablePaste":[{},{"0":"GuiTextField","1":"action/25",…}]` —
// e aqui **o `lsevents` MENTE**: colar não posta `action/25` nenhum. O que sai é
//
//   focus/<SID do shell>                       ← só quando o foco ainda não estava no grid
//   action/50/<SID>   top_left_column_index=<c>&top_left_row_index=<r>&bottom_right_…&reference_…
//   action/53/<SID>   row_index=<r>&column_index=<c>          ← a célula CORRENTE: a ÂNCORA
//   action/770/<SID>  c0=<v>&c1=<v>…&curColIdx=<c 1-based>&curRowIdx=<n 0-based, RELATIVO à âncora>
//   … um `action/770` POR LINHA colada …
//   state/ur
//
// tudo num POST só, e o `content` sai URL-encoded (`a;b` → `a%3Bb`). O separador de coluna é o TAB
// e o de linha é a quebra — `\n` e `\r\n` deram o MESMO batch (fase B, casos 3 e 4), que é o que
// faz o TSV do Excel servir direto.
//
// **É round-trip IMEDIATO**, ao contrário do `escreverCelula` (que fica pendente no navegador até
// o gesto seguinte): 2×2 = 4 células numa requisição, ~2,5 s com o clique da âncora incluído.
//
// ⚠️ **A âncora é a célula CORRENTE do ALV, não o elemento em que o `paste` cai.** Medido (fase C,
// caso `a`): disparar o evento no span da célula 3,NOME **sem clicar nela antes** colou na (1,1) —
// a corrente do ALV — com `curColIdx=1`: "REP79" foi para o ID (truncado a "REP", maxlen 3) e
// "931" para o NOME. Por isso `colarBloco` CLICA na âncora e exige o campo de entrada aberto.
//
// ⚠️ **Texto sem TAB e sem quebra não é colagem de tabela** (fase B caso 1, fase C caso `b`): o
// handler nem chama `preventDefault`, 0 requisição, nada muda — e calado. Uma célula é
// `escreverCelula`.
//
// ⚠️ **Coluna que estoura à direita some SEM AVISO** (fase B caso 6): ancorado na última coluna,
// `c0=601&c1=X&c2=Y` foi postado inteiro, o ALV aplicou o `601` e descartou `X` e `Y` em silêncio.
//
// ⚠️ **Linha que estoura embaixo o ALV ANEXA** (fase B caso 5): entre os `action/770` entra um
// `action/771 curRowIdx=0&pasteOption=Append` e o total foi de 3 para 5. Mas a linha nova nasce
// VAZIA fora do bloco — o renderer manda `c1=&c2=` —, então a chave que não veio no bloco fica em
// branco. É o `anexadas` do retorno.
//
// ⚠️ **A tela depois do paste NÃO é prova.** Fase C caso `d`: colar `ABC` na coluna numérica `QTD`
// deixou `ABC` no grid, o `FC01` respondeu *"ITEM47 GRAVOU subrc=0 n=3"* e o banco ficou com o
// valor ANTIGO (815) — sem mensagem e sem a tela se corrigir. (Neste laboratório o
// `check_changed_data( )` é chamado sem ler `e_valid`; outro programa reagiria.) A prova é ler em
// outra LUW.
//
// ⚠️ **Colar não grava.** Contra-prova pareada da fase C: colar 2×2 e fechar a sessão SEM o fcode
// deixou o banco IDÊNTICO; o mesmo bloco com `FC01` gravou (`931`, `ITEM79B`, `ITEM79C`). O
// round-trip do paste entrega o dado ao ALV, não ao banco.
//
// A via medida do gesto é o `ClipboardEvent` sintético com `DataTransfer`. O paste NATIVO do CDP
// (`Input.dispatchKeyEvent{ commands: ['paste'] }` depois de `navigator.clipboard.writeText`)
// produziu **o mesmo batch** (fase A) — mas passa pelo clipboard do SISTEMA, que é da máquina
// inteira e do usuário; por isso a lib usa o sintético.

/**
 * PURO: a matriz vira o TSV que o Excel põe no clipboard — TAB entre colunas, quebra entre linhas.
 * Aceita também o TSV já pronto (o `\r\n` do Excel é normalizado). Recusa TAB ou quebra DENTRO de
 * um valor — ali o renderer partiria a célula em duas sem avisar — e recusa o bloco de UMA célula,
 * que o renderer ignora em silêncio (§ acima).
 * Devolve `{ tsv, linhas, colunas, celulas, matriz }`.
 */
export function tsvDoBloco(valores) {
  const bruta = typeof valores === 'string'
    ? String(valores).replace(/\r\n?/g, '\n').split('\n').map((l) => l.split('\t'))
    : valores;
  if (!Array.isArray(bruta) || !bruta.length) {
    throw new Error('webgui: colarBloco — `valores` é o bloco: array de linhas (cada uma array de células) ou o TSV pronto; '
      + `veio ${Array.isArray(bruta) ? 'um array vazio' : JSON.stringify(valores)}`);
  }
  const matriz = bruta.map((l, i) => {
    const cels = Array.isArray(l) ? l : [l];
    if (!cels.length) throw new Error(`webgui: colarBloco — a linha ${i + 1} do bloco não tem célula nenhuma`);
    return cels.map((v, j) => {
      const s = v === null || v === undefined ? '' : String(v);
      if (/[\t\r\n]/.test(s)) {
        throw new Error(`webgui: colarBloco — o valor da linha ${i + 1}, coluna ${j + 1} tem TAB ou quebra `
          + `(${JSON.stringify(s)}): são os separadores do bloco, e o renderer partiria a célula em duas sem avisar`);
      }
      return s;
    });
  });
  const colunas = Math.max(...matriz.map((l) => l.length));
  const celulas = matriz.reduce((n, l) => n + l.length, 0);
  if (matriz.length === 1 && colunas === 1) {
    throw new Error('webgui: colarBloco — um bloco de UMA célula não é colagem de tabela: medido que sem TAB e sem '
      + 'quebra o renderer ignora o paste (0 requisição, nada muda, em silêncio). Para uma célula: `escreverCelula`.');
  }
  return { tsv: matriz.map((l) => l.join('\t')).join('\n'), linhas: matriz.length, colunas, celulas, matriz };
}

/** PURO: o gesto de colar — o `paste` com um `DataTransfer` de texto sobre o elemento `id`.
 * `tratado: true` (o `preventDefault` do renderer) é o sinal de que virou colagem de TABELA. */
export const jsColarNoGrid = (id, tsv) => `(() => {
  const el = document.getElementById(${JSON.stringify(String(id))});
  if (!el) return { erro: 'a célula ' + ${JSON.stringify(String(id))} + ' sumiu do DOM antes do paste' };
  const dt = new DataTransfer();
  dt.setData('text/plain', ${JSON.stringify(String(tsv))});
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return { tag: el.tagName, foco: document.activeElement === el, tratado: ev.defaultPrevented };
})()`;

/**
 * Cola um BLOCO no ALV **desta** tela a partir da célula (`linha`, `coluna`) — o gesto que troca N
 * `escreverCelula` por um round-trip só. `alvo` escolhe o grid como no `lerGrid`; `linha` é o
 * índice ABSOLUTO (o `_linha` do `lerGrid`) e `coluna` é o nome do `ColumnIDs` ou o índice 1-based;
 * `valores` é `[['a', 1], ['b', 2]]` ou o TSV pronto.
 *
 * ⚠️ **MANDA ao servidor na hora** (`pendente: false`) — o contrário do `escreverCelula`. Mas
 * mandar não é GRAVAR: quem grava é o programa ABAP, no fcode seguinte (`comandar(sessao, 'FC01')`),
 * e a prova é ler em outra LUW (§ acima).
 *
 * Devolve `{ id, sid, linha, coluna, nomeColuna, nLinhas, nColunas, celulas, total, anexadas,
 * divergentes, pendente, ms }`. `anexadas` > 0 quando o bloco passou do fim e o ALV criou linha;
 * `divergentes` lista o que a tela NÃO mostrou como pedido (a coluna que recusa o valor não avisa).
 */
export async function colarBloco(sessao, alvo = null, { linha, coluna, valores, tetoMs = 30000 } = {}) {
  const t0 = Date.now();
  const bloco = tsvDoBloco(valores);
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'colarBloco');
  const b = await avaliar(sessao, jsBlocoDoGrid(g.id));
  if (!b) throw new Error(`webgui: colarBloco — o grid ${g.id} sumiu do DOM entre a leitura da tela e o despejo`);
  if (b.editavel !== true) {
    throw new Error(`webgui: colarBloco — o grid ${g.id} não é editável (o lsdata dele diz editable=${b.editavel}). `
      + 'ALV somente-leitura não tem campo de entrada: o clique na âncora não abre input e nada seria colado.');
  }
  const c = indiceDaColuna(b.colunas, coluna);
  const n = Number(linha);
  const presentes = Object.keys(b.celulas).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!b.celulas[String(n)]) {
    throw new Error(`webgui: colarBloco — a linha âncora ${linha} não está no bloco carregado `
      + `(${presentes[0] ?? '-'}..${presentes[presentes.length - 1] ?? '-'} de ${b.total}). `
      + 'Chegar a linha distante é navegação: `posicionarGrid(sessao, alvo, linha)`.');
  }
  const nCols = b.colunas?.length ?? 0;
  if (nCols && c + bloco.colunas - 1 > nCols) {
    throw new Error(`webgui: colarBloco — o bloco tem ${bloco.colunas} coluna(s) a partir de `
      + `${b.colunas[c - 1]} (${c}) e o grid só tem ${nCols}: as ${c + bloco.colunas - 1 - nCols} que sobram seriam `
      + 'DESCARTADAS em silêncio (medido). Ancore mais à esquerda ou corte o bloco.');
  }
  const id = `grid#${g.id}#${n},${c}#if`;
  const p = await apontar(sessao, { id }, { descer: false });
  if (!p) throw new Error(`webgui: colarBloco — a célula âncora ${id} não está apontável na tela`);
  await clique(sessao, p);
  await esperarQuieto(sessao, { quietoMs: 800, tetoMs: 8000 });
  const foco = await avaliar(sessao, `(() => { const a = document.activeElement; return a && a.id === ${JSON.stringify(id)} && 'value' in a ? a.tagName : (a && a.id) || null; })()`);
  if (foco !== 'INPUT') {
    throw new Error(`webgui: colarBloco — o clique na âncora ${id} não abriu campo de entrada (o foco ficou em `
      + `${foco ?? 'nada'}). Sem a âncora o ALV cola na célula CORRENTE dele, que é outra (medido): a célula está `
      + 'protegida, ou o ALV está em "editável e não pronto para entrada" (o botão Exibir/Modificar alterna isso).');
  }
  const antes = Number(b.total || 0);
  const r = await avaliar(sessao, jsColarNoGrid(id, bloco.tsv));
  if (r?.erro) throw new Error(`webgui: colarBloco — ${r.erro}`);
  if (r?.tratado !== true) {
    throw new Error('webgui: colarBloco — o renderer não tratou o paste (nenhum `preventDefault`): o gesto NÃO virou '
      + 'colagem de tabela e nada foi mandado. É o modo de falha silencioso do bloco sem TAB e sem quebra.');
  }
  await esperarQuieto(sessao, { quietoMs: 1200, tetoMs });
  const d = await avaliar(sessao, jsBlocoDoGrid(g.id));
  const divergentes = [];
  bloco.matriz.forEach((ls, i) => ls.forEach((v, j) => {
    const lin = n + i, col = c + j;
    const ficou = d?.celulas?.[String(lin)]?.[String(col)] ?? null;
    if (String(ficou ?? '').trim() !== v.trim()) {
      divergentes.push({ linha: lin, coluna: col, nomeColuna: d?.colunas?.[col - 1] ?? null, pedi: v, ficou });
    }
  }));
  const anexadas = Number(d?.total || 0) - antes;
  detalhe(`webgui: colarBloco ${g.id} — ${bloco.linhas}×${bloco.colunas} (${bloco.celulas} células) a partir de `
    + `${n},${b.colunas?.[c - 1] ?? c} num round-trip`
    + (anexadas > 0 ? `; ${anexadas} linha(s) ANEXADA(s) pelo ALV, vazias fora do bloco` : '')
    + (divergentes.length ? `; ⚠ ${divergentes.length} célula(s) NÃO ficaram como pedido: ${divergentes.map((x) => `${x.linha},${x.nomeColuna ?? x.coluna} "${x.pedi}"→"${x.ficou}"`).join(', ')}` : ''));
  return { id, sid: b.sid ?? g.sid, linha: n, coluna: c, nomeColuna: b.colunas?.[c - 1] ?? null,
    nLinhas: bloco.linhas, nColunas: bloco.colunas, celulas: bloco.celulas,
    total: Number(d?.total || 0), anexadas, divergentes, pendente: false, ms: Date.now() - t0 };
}

// ---------- posicionar o ALV numa linha DISTANTE (item 75) ----------
//
// Medido no s4h 758/250 em 05/09/2026 (`sap-accelerate/work/POC_webgui_grid`, fases M–M7, lista do
// RSPARAM, 1617 linhas): para CLICAR numa linha que está fora do bloco carregado, o gesto é
// **arrastar o thumb do scrollbar vertical do grid** — `<cid>_vscroll-hdl` (`acf=Hndl`), dentro do
// trilho `<cid>_vscroll-bar`.
//
//   • **um arrasto põe a linha na tela em ~1 s e 1 requisição.** 12 de 13 alvos (1..1617) acertaram
//     no primeiro arrasto. A roda do mouse — o único gesto medido antes (item 46, fase J) — anda 10
//     linhas por rodada a ~2,9 s: a linha 900 custaria ~90 rodadas, ~4 min. É a diferença entre
//     navegar e empurrar.
//   • **o framework publica o gesto ao SOLTAR**, num batch só: `action/61` (VerticalScroll)
//     `position=<0-based>` com `logic:ignore`, seguido do `action/710`
//     `position=<0-based>&fragments=<de>,<ate>;` — o MESMO par que o `lerGridInteiro` posta. Voltar
//     para uma faixa já carregada não gera requisição nenhuma.
//   • **e o servidor entende a linha nova**: depois de posicionar em 900, o duplo clique na célula
//     mandou `action/53 row_index=900` (1-BASED aqui, ao contrário do `position`) e a tela virou o
//     popup do `login/fails_to_user_lock` — que é, de fato, a linha 900 da lista.
//
// ⚠️ **O `lsdata` do scrollbar NÃO acompanha a rolagem**, nem o `firstVisibleRow` do grid: ficam
// parados em `1` e `0` o tempo todo, porque o delta que volta é PARCIAL e ninguém o aplica no DOM.
// Quem diz onde a janela está é o `iidx` das `<tr>` com altura > 0 — é por ele que esta função
// confere o resultado, nunca pelo estado publicado. Confiar no `lsdata` seria ler sempre "linha 1".
//
// Duas correções que a medição impôs ao desenho (fases M5 e M6):
//
//   1. **mirar a linha no MEIO da janela, não no topo.** O trilho tem 647 px para 1591 posições —
//      1 px vale ~2,5 linhas — e o arrasto erra de 0 a +3 linhas. Mirando o topo, um erro de +1 já
//      deixa o alvo ACIMA da janela (medido nos alvos 777, 1234 e 1500); mirando o meio, ±3 linhas
//      cabem folgadas numa janela de 27.
//   2. **arrasto CURTO não move.** Pedir a linha 1617 com o thumb já em 1586 é um deslocamento de
//      2 px: três arrastos seguidos não mudaram nada (46 s perdidos). Abaixo de `LIMIAR_ARRASTO_PX`
//      o ajuste sai pela RODA — e refinar por pixel não adiantaria, uma linha vale 0,4 px.

/** Abaixo disto o arrasto não move o thumb (medido: 2 px = nada, três vezes seguidas). */
export const LIMIAR_ARRASTO_PX = 4;
/** Quanto uma rodada de roda anda no ALV — 4 × `deltaY: 250` ≈ 10 linhas (item 46, fase J). */
export const LINHAS_POR_RODADA = 10;

/**
 * PURO: o `lsdata` do `<cid>_vscroll` (`ct="SCB"`) em nomes.
 * ⚠️ `posicao` é o que o SERVIDOR publicou, e ele não acompanha a rolagem: fica `1`. Serve para
 * `maximo`, `janela` e `total` — não para saber onde a janela está.
 */
export function estadoDoScrollbar(lsdata = {}) {
  const n = (k) => { const v = Number(lsdata?.[k]); return Number.isFinite(v) ? v : null; };
  return { posicao: n('0'), maximo: n('1'), passo: n('2'), janela: n('3'),
    dono: lsdata?.['6'] ?? null, ativo: lsdata?.['7'] === true, total: n('10') };
}

/**
 * PURO: onde soltar o thumb para a `linha` cair no MEIO da janela.
 * Devolve `{ desejada, fracao, y, pxPorLinha }` — `desejada` é a primeira linha visível que se pede
 * (1-based, limitada ao `maximo` do scrollbar) e `y` é o centro do thumb no destino.
 */
export function miraDoScrollbar(linha, { scb = {}, bar, hdl } = {}) {
  const e = estadoDoScrollbar(scb);
  const maximo = Math.max(e.maximo || 1, 1);
  const janela = Math.max(e.janela || 1, 1);
  const desejada = Math.min(Math.max(Number(linha) - Math.floor((janela - 1) / 2), 1), maximo);
  const fracao = maximo > 1 ? (desejada - 1) / (maximo - 1) : 0;
  const curso = bar.h - hdl.h;
  return { desejada, fracao, y: bar.topo + hdl.h / 2 + fracao * curso,
    pxPorLinha: maximo > 1 ? curso / (maximo - 1) : 0 };
}

/**
 * PURO: a expressão JS que diz onde a JANELA do grid está agora — `{ cid, scb, janela, hdl, bar,
 * centro }`, com `janela` em linhas 1-based (o `iidx` da `<tr>` é 0-based).
 */
export const jsJanelaDoGrid = (cid) => `(() => {
  const p = (s) => { try { return s ? JSON.parse(s) : null; } catch (x) { return null; } };
  const cid = ${JSON.stringify(String(cid))};
  const grid = document.getElementById(cid);
  if (!grid) return null;
  const sb = document.getElementById(cid + '_vscroll');
  const vis = [];
  for (const tr of document.querySelectorAll('tr[iidx]')) {
    if (!tr.id.startsWith(cid + '-mrss-cont-none-')) continue;
    if (tr.offsetHeight > 0) vis.push(Number(tr.getAttribute('iidx')));
  }
  vis.sort((a, b) => a - b);
  const r = (id) => { const el = document.getElementById(id); if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, yc: b.top + b.height / 2, h: b.height, topo: b.top }; };
  const bg = grid.getBoundingClientRect();
  return { cid, scb: sb ? p(sb.getAttribute('lsdata')) : null,
    janela: vis.length ? { de: vis[0] + 1, ate: vis[vis.length - 1] + 1, n: vis.length } : { de: null, ate: null, n: 0 },
    hdl: r(cid + '_vscroll-hdl'), bar: r(cid + '_vscroll-bar'),
    centro: { x: bg.left + bg.width / 2, y: bg.top + Math.min(bg.height, innerHeight) / 2 } };
})()`;

/** PURO: a linha 1-based está na janela pintada? */
export const naJanela = (janela, linha) => !!janela?.n && janela.de <= linha && linha <= janela.ate;

/** Arrasta o thumb de onde ele está até `y`, com o mouse de verdade (press → moved × n → release). */
async function arrastarThumb(sessao, y, { hdl }, passos = 8) {
  const x = hdl.x;
  const y0 = hdl.yc;
  await sessao.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0, buttons: 0 });
  await sessao.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: y0, button: 'left', buttons: 1, clickCount: 1 });
  await espera(60);
  for (let i = 1; i <= passos; i++) {
    await sessao.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0 + (y - y0) * (i / passos), button: 'left', buttons: 1 });
    await espera(50);
  }
  await sessao.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

/** Gira a roda sobre o grid — o ajuste fino, ~10 linhas por rodada; `sinal` `+1` desce. */
async function rodar(sessao, { x, y }, rodadas, sinal) {
  await sessao.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
  for (let r = 0; r < rodadas; r++) {
    for (let k = 0; k < 4; k++) {
      await sessao.cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: 250 * sinal, buttons: 0 });
      await espera(120);
    }
    await espera(400);
  }
}

/**
 * Põe a `linha` (1-based, ABSOLUTA) **na tela** — o gesto que torna clicável uma linha que está
 * fora do bloco carregado. É NAVEGAÇÃO: para LER a tabela inteira a via é `lerGridInteiro` (nesta
 * mesma sessão) ou `its.lerGrid` (em outra).
 *
 * ```js
 * await posicionarGrid(s, null, 900);              // a linha 900 passa a estar na janela
 * await clicar(s, { id: 'grid#C102#900,1#if' });   // e agora dá para clicar nela
 * ```
 *
 * `alvo` escolhe o grid como em `lerGrid` (índice, `{ id }`, `{ sid }`). Devolve
 * `{ id, linha, janela, gestos, pedidos, ms }` — `janela` é a faixa 1-based que ficou na tela e
 * `gestos` diz o que foi preciso (`[]` quando a linha já estava visível).
 *
 * ⚠️ Estoura quando a linha não entra na janela dentro das `tentativas`, dizendo onde ela ficou.
 * Um `posicionarGrid` que "quase" chega e volta calado faria o clique seguinte cair na linha
 * ERRADA — o modo de falha caro deste gesto.
 */
export async function posicionarGrid(sessao, alvo = null, linha, { tetoMs = 15000, tentativas = 3 } = {}) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'posicionarGrid');
  const n = Number(linha);
  let e = await avaliar(sessao, jsJanelaDoGrid(g.id));
  if (!e) throw new Error(`webgui: posicionarGrid — o grid ${g.id} sumiu do DOM entre a leitura da tela e o despejo`);
  const scb = estadoDoScrollbar(e.scb ?? {});
  if (!Number.isInteger(n) || n < 1 || (scb.total && n > scb.total)) {
    throw new Error(`webgui: posicionarGrid — a linha ${linha} está fora do ALV (ele tem ${scb.total ?? '?'} linha(s), 1-based)`);
  }
  const pedidos = () => sessao.eventos.filter((x) => x.method === 'Network.requestWillBeSent').length;
  const p0 = pedidos();
  const gestos = [];
  if (naJanela(e.janela, n)) {
    detalhe(`webgui: posicionarGrid ${g.id} — a linha ${n} já está na janela ${e.janela.de}..${e.janela.ate}, sem gesto`);
    return { id: g.id, linha: n, janela: e.janela, gestos, pedidos: 0, ms: Date.now() - t0 };
  }
  if (!e.hdl || !e.bar) {
    throw new Error(`webgui: posicionarGrid — o grid ${g.id} não tem scrollbar vertical (${g.id}_vscroll-hdl), ` +
      `e a linha ${n} não está na janela ${e.janela.de ?? '-'}..${e.janela.ate ?? '-'}. Sem trilho não há o que arrastar.`);
  }
  for (let i = 1; i <= tentativas && !naJanela(e.janela, n); i++) {
    const mira = miraDoScrollbar(n, e);
    const dy = mira.y - e.hdl.yc;
    if (Math.abs(dy) >= LIMIAR_ARRASTO_PX) {
      await arrastarThumb(sessao, mira.y, e);
      gestos.push({ gesto: 'arrasto', dy: Math.round(dy), desejada: mira.desejada });
    } else {
      // ajuste fino: o arrasto não move tão pouco (§ acima) — quem anda de 10 em 10 é a roda
      const falta = n - (e.janela.de ?? 1);
      const rodadas = Math.max(1, Math.ceil(Math.abs(falta) / LINHAS_POR_RODADA));
      await rodar(sessao, e.centro, rodadas, falta >= 0 ? 1 : -1);
      gestos.push({ gesto: 'roda', rodadas, sentido: falta >= 0 ? 'baixo' : 'cima' });
    }
    // espera por CONDIÇÃO: a janela PINTADA conter a linha (tempo fixo pega o repinte no meio)
    const ate = Date.now() + tetoMs;
    do {
      await espera(200);
      e = await avaliar(sessao, jsJanelaDoGrid(g.id));
    } while (Date.now() < ate && !naJanela(e?.janela, n));
  }
  if (!naJanela(e.janela, n)) {
    throw new Error(`webgui: posicionarGrid — pedi a linha ${n} e a janela ficou em ` +
      `${e.janela.de ?? '-'}..${e.janela.ate ?? '-'} depois de ${gestos.length} gesto(s) ` +
      `(${gestos.map((x) => x.gesto).join(', ')}). O ALV tem ${scb.total} linha(s).`);
  }
  detalhe(`webgui: posicionarGrid ${g.id} — linha ${n} na janela ${e.janela.de}..${e.janela.ate} com ${gestos.length} gesto(s)`);
  return { id: g.id, linha: n, janela: e.janela, gestos, pedidos: pedidos() - p0, ms: Date.now() - t0 };
}

// ---------- SELECIONAR linha e célula no ALV (item 76) ----------
//
// Medido no s4h 758/250 em 05/09/2026 (`sap-accelerate/work/POC_webgui_grid_sel`, fases A–F, no
// laboratório `ZJBV_ALV47_EDIT` do item 47, que ganhou o fcode `FC02` para despejar
// `get_selected_rows`/`get_selected_columns`/`get_selected_cells`/`get_current_cell`):
//
//   • **a caixa de seleção da linha é `grid#<cid>#<n>,0`** — um `<td subct="SC">` de tipo
//     `SAPTABLECSSELECTIONCELL`, e ele NÃO tem o sufixo `#if` das células de dado. Ele vive num
//     `<tr>` diferente das células: a faixa CONGELADA (`<cid>-mrss-cont-left-Row-<n-1>`), enquanto
//     o dado está em `-cont-none-Row-<n-1>`. Procurar a coluna 0 no `<tr>` do dado não acha nada.
//   • **os três gestos do ALV do SAP GUI valem aqui**: clique simples SUBSTITUI a seleção,
//     `ctrl`+clique ACRESCENTA, `shift`+clique fecha a FAIXA a partir da última âncora.
//   • **o gesto é 100% CLIENTE: 5 gestos, ZERO requisição.** Nada de seleção sai na rede na hora —
//     nem depois do `delayedChangedSelectionTimeout` (1500 ms) que o `lsdata` anuncia.
//   • **e o ABAP a enxerga no round-trip seguinte**, provado pelo `FC02` do laboratório:
//
//     | pintado no DOM | o que o batch levou | o que o ABAP respondeu |
//     |---|---|---|
//     | nenhuma (contra-prova) | — | `rows=0: cells=1 cur=1/1/ID` |
//     | linha 2 | `action/47 rows=;2;` | `rows=1:0000000002` |
//     | linhas 1 e 3 (ctrl) | `action/47 rows=;1;3;` | `rows=2:0000000001,0000000003` |
//     | linhas 1..3 (shift) | `action/47 rows=;1-3;` | `rows=3:…1,…2,…3` |
//     | clique numa CÉLULA | `action/50` + `action/53`, sem `action/47` | `rows=0: cells=1 cur=2/3/QTD` |
//
//     `action/47` é a seleção de LINHAS (e ela compacta faixa: `;1-3;`), `action/48` a de células,
//     `action/50` o bloco e `action/53` a célula corrente. Clicar numa célula **não** seleciona
//     linha: sai `cells=1`, e `get_selected_rows` volta vazio.
//
// ⚠️ **O `selectedRows` do `lsdata` está sempre UM ROUND-TRIP ATRASADO.** Ele é o que o SERVIDOR
// publicou: com as linhas 1 e 3 pintadas na tela, ele ainda dizia `";2;"` (a seleção do round-trip
// anterior), e só virou `";1;3;"` DEPOIS do `FC02`. Quem sabe a verdade é a CLASSE da caixa
// (`urSTRowSelIcon`) — é por ela que `lerSelecao` responde, e o `publicado` sai à parte, com
// `defasado: true` quando os dois divergem. É o mesmo modo de falha do scrollbar no item 75:
// confiar no estado publicado seria ler sempre a seleção passada.

/** O id da caixa de seleção de uma linha — sem o `#if` que a célula de dado tem. */
export const idDaCaixa = (cid, linha) => `grid#${cid}#${Number(linha)},0`;

/**
 * PURO: o `selectedRows` do `lsdata` (`";1;3;"`, `";1-3;"`, `";"`) vira lista de linhas 1-based.
 * O framework COMPACTA faixa contígua com `-` (medido: 1,2,3 selecionadas saem como `";1-3;"`),
 * então quem só fizesse `split(';')` leria "a linha 1-3" e perderia duas linhas.
 */
export function interpretarSelectedRows(texto) {
  const out = [];
  for (const p of String(texto ?? '').split(';')) {
    const t = p.trim();
    if (!t) continue;
    const m = /^(\d+)-(\d+)$/.exec(t);
    if (m) { for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i); continue; }
    if (/^\d+$/.test(t)) out.push(Number(t));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * PURO: a expressão JS que lê a seleção do grid — `{ cid, pintadas, caixas, publicado,
 * celulaCorrente, … }`. `pintadas` sai da CLASSE da caixa (o estado do cliente, que é a verdade);
 * `publicado` sai do `lsdata` (o do servidor, atrasado).
 */
export const jsSelecaoDoGrid = (cid) => `(() => {
  const p = (s) => { try { return s ? JSON.parse(s) : null; } catch (x) { return null; } };
  const cid = ${JSON.stringify(String(cid))};
  const grid = document.getElementById(cid);
  if (!grid) return null;
  const d = p(grid.getAttribute('lsdata')) || {};
  const sid = Object.values(d).find((v) => v && typeof v === 'object' && v.Type === 'GuiGridView') || {};
  const pintadas = [];
  const caixas = [];
  for (const td of document.querySelectorAll('td[subct="SC"]')) {
    const q = td.id.split('#');
    if (q.length !== 3 || q[1] !== cid) continue;
    const n = Number(q[2].split(',')[0]);
    if (!Number.isFinite(n) || n < 1) continue;
    const div = td.querySelector('div[role="gridcell"]');
    if (div && /urSTRowSelIcon|urST4LbSelIcon/.test(div.className)) pintadas.push(n);
    caixas.push(n);
  }
  pintadas.sort((a, b) => a - b);
  caixas.sort((a, b) => a - b);
  return { cid, pintadas, caixas,
    publicado: { linhas: sid.selectedRows ?? null, celulas: sid.selectedCells ?? null,
      colunas: sid.selectedColumns ?? null, bloco: sid.selectedBlock ?? null },
    celulaCorrente: { linha: sid.currentCellRow ?? null, coluna: sid.currentCellColumn ?? null },
    temColunaDeSelecao: sid.hasSelectionColumn === true,
    modo: sid.selectionMode ?? null, total: sid.totalRows || 0 };
})()`;

/**
 * Lê a seleção do ALV **do que a tela mostra** — sem tocar a rede.
 *
 * ```js
 * const sel = await lerSelecao(s);
 * sel.linhas       // [1, 3] — as linhas pintadas AGORA (1-based, absolutas)
 * sel.publicado    // { linhas: [2], texto: ';2;' } — o que o SERVIDOR sabe, um round-trip atrás
 * sel.defasado     // true: o servidor ainda não viu o que está pintado
 * ```
 *
 * `alvo` escolhe o grid como em `lerGrid` (índice, `{ id }`, `{ sid }`). Devolve
 * `{ id, sid, linhas, publicado, defasado, celulaCorrente, bloco, total, modo, ms }`.
 *
 * ⚠️ **`linhas` só enxerga o BLOCO carregado** — `bloco` diz que faixa de caixas existe. O bloco
 * só CRESCE (medido no RSPARAM: 166 caixas na abertura, 247 depois de rolar até a linha 900, e a
 * caixa da 900 continuou lá ao voltar para o topo), então a seleção não se perde ao rolar; o que
 * nunca esteve na tela é que não tem caixa. Quem quiser a seleção que o ABAP vê, com bloco ou sem,
 * pergunta ao ABAP (um fcode que despeje `get_selected_rows`).
 */
export async function lerSelecao(sessao, alvo = null) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'lerSelecao');
  const b = await avaliar(sessao, jsSelecaoDoGrid(g.id));
  if (!b) throw new Error(`webgui: lerSelecao — o grid ${g.id} sumiu do DOM entre a leitura da tela e o despejo`);
  const publicadas = interpretarSelectedRows(b.publicado?.linhas);
  const linhas = b.pintadas ?? [];
  const caixas = b.caixas ?? [];
  const defasado = linhas.join(',') !== publicadas.join(',');
  detalhe(`webgui: lerSelecao ${g.id} — ${linhas.length} linha(s) pintada(s) [${linhas.join(', ')}], ` +
    `o servidor sabe [${publicadas.join(', ')}]${defasado ? ' (DEFASADO)' : ''}`);
  return { id: g.id, sid: g.sid, linhas,
    publicado: { linhas: publicadas, texto: b.publicado?.linhas ?? null, celulas: b.publicado?.celulas ?? null,
      colunas: b.publicado?.colunas ?? null, bloco: b.publicado?.bloco ?? null },
    defasado, celulaCorrente: b.celulaCorrente ?? null,
    bloco: { de: caixas[0] ?? null, ate: caixas[caixas.length - 1] ?? null, n: caixas.length },
    total: b.total ?? 0, modo: b.modo ?? null, ms: Date.now() - t0 };
}

/**
 * SELECIONA linhas do ALV pela caixa da coluna 0 — o mesmo gesto de quem usa o SAP GUI.
 *
 * ```js
 * await selecionarLinhas(s, null, [2]);                        // só a linha 2
 * await selecionarLinhas(s, null, [1, 3]);                     // 1 e 3 (ctrl no resto)
 * await selecionarLinhas(s, null, [1, 3], { faixa: true });    // 1..3 de uma vez (shift)
 * await selecionarLinhas(s, null, [5], { acrescentar: true }); // sem desfazer o que já estava
 * await comandar(s, 'FC02');                                   // e AGORA o ABAP a vê
 * ```
 *
 * `alvo` escolhe o grid como em `lerGrid`. `faixa: true` usa `shift` no ÚLTIMO clique, fechando
 * tudo entre a primeira e a última (aí `linhas` são as duas pontas). `acrescentar: true` não
 * substitui a seleção existente — o primeiro clique também vai com `ctrl`.
 *
 * ⚠️ **NÃO manda nada ao servidor** — por isso devolve `pendente: true`, como o `escreverCelula`.
 * A seleção viaja como `action/47` no próximo round-trip (`comandar`, `acionar`), e antes disso o
 * ABAP não a enxerga. Um `get_selected_rows` sem round-trip no meio devolve a seleção ANTERIOR.
 *
 * ⚠️ Estoura quando a linha não tem caixa no DOM (rolou para fora do bloco): chegar até ela é
 * navegação — `posicionarGrid(sessao, alvo, linha)` primeiro.
 */
export async function selecionarLinhas(sessao, alvo = null, linhas = [], { acrescentar = false, faixa = false } = {}) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'selecionarLinhas');
  const b = await avaliar(sessao, jsSelecaoDoGrid(g.id));
  if (!b) throw new Error(`webgui: selecionarLinhas — o grid ${g.id} sumiu do DOM entre a leitura da tela e o despejo`);
  if (b.temColunaDeSelecao !== true) {
    throw new Error(`webgui: selecionarLinhas — o grid ${g.id} não tem coluna de seleção ` +
      `(o lsdata dele diz hasSelectionColumn=${b.temColunaDeSelecao}). Sem a caixa da coluna 0 não há o que clicar; ` +
      'mover a célula corrente ainda dá, clicando na célula de dado.');
  }
  const pedidas = [...new Set((linhas ?? []).map(Number))].sort((x, y) => x - y);
  if (!pedidas.length) throw new Error('webgui: selecionarLinhas — nenhuma linha pedida');
  if (faixa && pedidas.length !== 2) {
    throw new Error(`webgui: selecionarLinhas — com { faixa: true } são exatamente 2 linhas (as pontas da faixa), e vieram ${pedidas.length}`);
  }
  const caixas = new Set(b.caixas ?? []);
  const fora = pedidas.filter((n) => !caixas.has(n));
  if (fora.length) {
    const c = b.caixas ?? [];
    throw new Error(`webgui: selecionarLinhas — a(s) linha(s) ${fora.join(', ')} não tem caixa no bloco carregado ` +
      `(${c[0] ?? '-'}..${c[c.length - 1] ?? '-'} de ${b.total}). ` +
      'Chegar a uma linha distante é navegação: `posicionarGrid(sessao, alvo, linha)`.');
  }
  const gestos = [];
  for (let i = 0; i < pedidas.length; i++) {
    const n = pedidas[i];
    const id = idDaCaixa(g.id, n);
    const p = await apontar(sessao, { id }, { descer: false });
    if (!p) throw new Error(`webgui: selecionarLinhas — a caixa ${id} não está apontável na tela`);
    const ultimo = i === pedidas.length - 1;
    const modificadores = (i === 0 && !acrescentar) ? 0 : (faixa && ultimo ? MOD.shift : MOD.ctrl);
    await clique(sessao, p, { modificadores });
    gestos.push({ linha: n, modificadores });
    await espera(250);
  }
  const d = await avaliar(sessao, jsSelecaoDoGrid(g.id));
  const pintadas = d?.pintadas ?? [];
  const esperadas = faixa ? Array.from({ length: pedidas[1] - pedidas[0] + 1 }, (_, k) => pedidas[0] + k) : pedidas;
  if (!acrescentar && pintadas.join(',') !== esperadas.join(',')) {
    throw new Error(`webgui: selecionarLinhas — pedi [${esperadas.join(', ')}] e a tela ficou com [${pintadas.join(', ')}] pintada(s). ` +
      `O modo de seleção deste grid é ${JSON.stringify(d?.modo ?? null)} — um ALV de seleção ÚNICA recusa a segunda linha.`);
  }
  detalhe(`webgui: selecionarLinhas ${g.id} — [${pintadas.join(', ')}] pintada(s) com ${gestos.length} clique(s), PENDENTE de round-trip`);
  return { id: g.id, sid: g.sid, linhas: pintadas, pedidas, gestos, pendente: true, ms: Date.now() - t0 };
}


// ---------- ORDENAR e FILTRAR o ALV (item 77) ----------
//
// Os dois gestos que faltavam do ALV, e eles são o MESMO gesto em duas metades: **marcar a coluna
// no cabeçalho** (cliente puro, como a caixa da linha do item 76) e **acionar o botão da barra do
// ALV** (round-trip). Medido no s4h 758/250 em 05-06/09/2026 (`POC_webgui_grid_ord`, fases A-J,
// laboratório `ZJBV_ALV47_EDIT` com o FC03 que despeja o conteúdo da linha selecionada):
//
//   • **a barra do ALV é endereçável pelo SID**: cada botão dela traz
//     `"SID":"<sid do grid>/tbar/btn&SORT_ASC"` (ou `dbtn&MB_FILTER`) no `lsdata`. O id do DOM
//     (`C102_toolbar_btn15`) é POSICIONAL e não sobrevive a tela com outra barra — o SID sim.
//   • **sem coluna marcada o botão de sort abre o DIÁLOGO "Ordenação"** (`SAPLSALV_CUL_…`), em vez
//     de ordenar. ⚠️ E ele NÃO é `wnd[1]`: o `lerTela` continua dizendo `janela.principal: true`,
//     então um clique seguinte cai ATRÁS do modal e sai calado (foi o que cegou a fase B inteira).
//   • **a marca da coluna se perde a cada round-trip** — marcar e ordenar têm de ser o mesmo gesto.
//   • **ordenar REORDENA A TABELA INTERNA DO ABAP**: com o ALV em NOME desc, `gt_tab[1]-nome` virou
//     `tres`, e `get_selected_rows` da "linha 1" respondeu `0000000001=tres`. DOM e ABAP juntos.
//   • **filtrar NÃO**: com `NOME = E2E-776551` a tela mostra 1 linha e a chama de `_linha: 1`, mas
//     o ABAP respondeu `0000000002=E2E-776551` (`n=3`, `gt_tab[1]` intacto). O framework TRADUZ o
//     índice visual para o da outtab — a LINHA é a mesma nos dois lados, o NÚMERO não.
//
// ⚠️ **É por isso que `_linha` é sempre "a n-ésima linha VISÍVEL agora"** — nunca uma identidade.
// Um `_linha` guardado antes de ordenar/filtrar aponta para outro dado depois, e sob filtro ele nem
// é o número que o ABAP usa. Quem precisa da identidade guarda a CHAVE da linha e a reencontra.

/** PURO: o `<th>` do cabeçalho de uma coluna — a linha 0 do grid (`grid#<cid>#0,<c>`). */
export const idDoCabecalho = (cid, coluna) => `grid#${cid}#0,${Number(coluna)}`;

/**
 * PURO: o estado de uma coluna, lido do NOME do PNG que o `<th>` mostra. Medido (fase J) que o nome
 * é composicional — `head<ordem>o<filtro>.png`:
 *
 * | ícone | ordem | filtrada |
 * |---|---|---|
 * | (nenhum) | `null` | `false` |
 * | `headaoo.png` / `headdoo.png` | `asc` / `desc` | `false` |
 * | `headoof.png` | `null` | `true` |
 * | `headaof.png` / `headdof.png` | `asc` / `desc` | `true` |
 */
export function estadoDoCabecalho(icone) {
  const m = /head([ado])([ado])([fo])/.exec(String(icone ?? ''));
  if (!m) return { ordem: null, filtrada: false };
  return { ordem: m[1] === 'a' ? 'asc' : m[1] === 'd' ? 'desc' : null, filtrada: m[3] === 'f' };
}

/** PURO: a expressão JS que despeja o cabeçalho do grid — um `{ coluna, icone }` por `<th>`. */
export const jsCabecalhoDoGrid = (cid) => `[...document.querySelectorAll('[id^="grid#${cid}#0,"]')]
  .filter((e) => e.tagName === 'TH')
  .map((e) => ({ coluna: Number(e.id.split(',').pop()),
    icone: ([...e.querySelectorAll('img')].map((i) => (i.getAttribute('src') || '').split('/').pop())[0]) || null }))`;

/** PURO: a expressão JS que acha um botão da barra DAQUELE grid pelo fcode do ALV (`SORT_ASC`,
 * `MB_FILTER`) — casando o SID (`<sid>/tbar/btn&<fcode>` ou `dbtn&`), não o id posicional. */
export const jsBotaoDaBarra = (sid, fcode) => `(() => {
  const alvos = [${JSON.stringify(`"SID":"${sid}/tbar/btn&${fcode}"`)},
                 ${JSON.stringify(`"SID":"${sid}/tbar/dbtn&${fcode}"`)}];
  for (const el of document.querySelectorAll('[ct="B"]')) {
    const d = el.getAttribute('lsdata') || '';
    if (alvos.some((a) => d.indexOf(a) >= 0))
      return { id: el.id, title: el.title || null, visivel: !!(el.offsetWidth || el.offsetHeight) };
  }
  return null;
})()`;

/** PURO: os fcodes que a barra dos ALVs desta tela oferece — o que dizer quando o pedido não está lá. */
export const JS_FCODES_DA_BARRA = `[...document.querySelectorAll('[ct="B"]')]
  .map((e) => (/"SID":"[^"]*\\/tbar\\/d?btn&([^"]+)"/.exec(e.getAttribute('lsdata') || '') || [])[1])
  .filter(Boolean)`;

/** PURO: o diálogo que o ALV abre quando o gesto não tinha coluna — ele não é `wnd[1]` e o
 * `lerTela` não o vê (§ acima), então quem o detecta é este seletor. */
export const JS_MODAL_DO_ALV = `[...document.querySelectorAll('[ct^="PW"]')]
  .filter((e) => e.offsetWidth || e.offsetHeight)
  .map((e) => ({ id: e.id, titulo: (e.innerText || '').trim().split(String.fromCharCode(10))[0].slice(0, 60) }))`;

/** PURO: um campo/botão pelo SID (`%%DYN001-LOW`, `wnd[1]/tbar[0]/btn[0]`) — no diálogo de filtro
 * o id do DOM (`M1:46:1::1:34`) é posicional e não se pode escrever à mão. */
export const jsPorSid = (parte) => `(() => {
  for (const el of document.querySelectorAll('[lsdata]')) {
    if ((el.getAttribute('lsdata') || '').indexOf(${JSON.stringify(String(parte))}) >= 0
        && (el.offsetWidth || el.offsetHeight)) return { id: el.id, tag: el.tagName };
  }
  return null;
})()`;

/** O botão da barra do ALV, ou um erro que diz o que aquela barra TEM. */
async function botaoDaBarra(sessao, g, fcode) {
  const b = await avaliar(sessao, jsBotaoDaBarra(g.sid, fcode));
  if (b?.visivel) return b;
  const tem = await avaliar(sessao, JS_FCODES_DA_BARRA);
  throw new Error(`webgui: o ALV ${g.id} não tem o botão "${fcode}" na barra`
    + (tem?.length ? ` — a barra desta tela tem: ${tem.join(', ')}` : ' — esta tela não tem barra de ALV nenhuma'));
}

/**
 * MARCA uma coluna do ALV pelo cabeçalho — o par do `selecionarLinhas`, e igualmente 100% CLIENTE.
 *
 * `coluna` é o número 1-based ou o nome do `ColumnIDs` (`'NOME'`). Devolve
 * `{ id, sid, coluna, nome, pendente: true, ms }`.
 *
 * ⚠️ **Não manda nada ao servidor, e a marca MORRE no próximo round-trip.** Ela viaja como
 * `action/46 columns=;2;` junto do gesto seguinte — por isso `ordenarGrid` e `filtrarGrid` marcam a
 * coluna eles mesmos, em vez de pedir que você marque antes.
 */
export async function marcarColuna(sessao, alvo = null, coluna) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'marcarColuna');
  const b = await avaliar(sessao, jsBlocoDoGrid(g.id));
  const i = indiceDaColuna(b?.colunas ?? [], coluna);
  const id = idDoCabecalho(g.id, i);
  const p = await apontar(sessao, { id }, { descer: false });
  if (!p) throw new Error(`webgui: marcarColuna — o cabeçalho ${id} não está apontável na tela`);
  await clique(sessao, p);
  await espera(250);
  const nome = (b?.colunas ?? [])[i - 1] ?? null;
  detalhe(`webgui: marcarColuna ${g.id} — coluna ${i} (${nome ?? '?'}) marcada, PENDENTE de round-trip`);
  return { id: g.id, sid: b?.sid ?? g.sid, coluna: i, nome, pendente: true, ms: Date.now() - t0 };
}

/**
 * ORDENA o ALV por uma coluna — marca o cabeçalho e aciona `SORT_ASC`/`SORT_DSC` da barra.
 *
 * ```js
 * await ordenarGrid(s, null, 'NOME');                    // crescente
 * await ordenarGrid(s, null, 'NOME', { ordem: 'desc' }); // decrescente
 * ```
 *
 * Devolve `{ id, coluna, nome, ordem, total, linhas, ms }` — `linhas` já é a tabela NA ORDEM NOVA
 * (o bloco que a tela tem).
 *
 * ⚠️ **Ordenar por outra coluna SUBSTITUI o critério** (medido: com a coluna 2 em `desc`, ordenar a
 * 3 zerou o ícone da 2). Vários critérios de uma vez só pelo diálogo "Ordenação", que é outro gesto.
 * ⚠️ **O `_linha` passa a apontar para outro dado** — e aqui o ABAP acompanha: a ordenação reordena
 * a tabela interna do programa (§ acima).
 * ⚠️ Estoura quando o ALV abre o diálogo em vez de ordenar (a marca da coluna não pegou).
 */
export async function ordenarGrid(sessao, alvo = null, coluna, { ordem = 'asc', tetoMs = 30000 } = {}) {
  const t0 = Date.now();
  const dir = String(ordem).toLowerCase();
  if (dir !== 'asc' && dir !== 'desc') throw new Error(`webgui: ordenarGrid — ordem "${ordem}" não existe (é 'asc' ou 'desc')`);
  const m = await marcarColuna(sessao, alvo, coluna);
  const b = await botaoDaBarra(sessao, m, dir === 'desc' ? 'SORT_DSC' : 'SORT_ASC');
  const antes = await carimbo(sessao);
  await clicar(sessao, { id: b.id });
  await esperarMudanca(sessao, antes, { tetoMs });
  const modal = await avaliar(sessao, JS_MODAL_DO_ALV);
  if (modal?.length) throw new Error(`webgui: ordenarGrid — o ALV abriu o diálogo "${modal[0].titulo}" (${modal[0].id}) em vez de ordenar: `
    + 'a coluna não chegou marcada ao servidor. Esse diálogo NÃO é wnd[1] e o lerTela não o vê — feche-o antes de qualquer outro gesto.');
  const est = estadoDoCabecalho((await avaliar(sessao, jsCabecalhoDoGrid(m.id)) ?? []).find((h) => h.coluna === m.coluna)?.icone);
  if (est.ordem !== dir) throw new Error(`webgui: ordenarGrid — pedi ${dir} na coluna ${m.coluna} (${m.nome}) e o cabeçalho ficou ${JSON.stringify(est)}`);
  const t = await lerGrid(sessao, { id: m.id });
  detalhe(`webgui: ordenarGrid ${m.id} — coluna ${m.coluna} (${m.nome}) em ${dir}, ${t.total} linha(s)`);
  return { id: m.id, sid: m.sid, coluna: m.coluna, nome: m.nome, ordem: dir, total: t.total, linhas: t.linhas, ms: Date.now() - t0 };
}

/**
 * FILTRA o ALV por uma coluna — marca o cabeçalho, aciona `MB_FILTER` e preenche o diálogo
 * "Determinar valores para critérios filtro" (esse SIM é uma dynpro `wnd[1]` de verdade).
 *
 * ```js
 * await filtrarGrid(s, null, 'NOME', { de: 'E2E-776551' });     // igual a
 * await filtrarGrid(s, null, 'QTD',  { de: '1', ate: '100' });  // intervalo
 * await filtrarGrid(s, null, 'NOME', { de: '' });               // LIMPA o filtro da coluna
 * ```
 *
 * Devolve `{ id, coluna, nome, de, ate, filtrada, total, linhas, ms }`.
 *
 * ⚠️ **O campo do diálogo é um `ctxt` e CONVERTE PARA MAIÚSCULAS** — medido: filtrar `tres` (que
 * existe, em minúsculas) devolveu **0 linhas** sem erro nenhum. Valor minúsculo em coluna
 * case-sensitive não casa, e o ALV não avisa.
 * ⚠️ **`total: 0` é resposta, não erro** — o ALV fica com o corpo vazio e `totalRows: 0`.
 * ⚠️ **O `_linha` sob filtro NÃO é o índice que o ABAP usa** (§ acima): a linha é a mesma, o número
 * não. Quem for casar com `get_selected_rows` conta com essa diferença.
 */
export async function filtrarGrid(sessao, alvo = null, coluna, { de = '', ate = '', tetoMs = 30000 } = {}) {
  const t0 = Date.now();
  const m = await marcarColuna(sessao, alvo, coluna);
  const b = await botaoDaBarra(sessao, m, 'MB_FILTER');
  let antes = await carimbo(sessao);
  await clicar(sessao, { id: b.id });
  await esperarMudanca(sessao, antes, { tetoMs });
  const low = await avaliar(sessao, jsPorSid('DYN001-LOW'));
  if (!low) {
    const modal = await avaliar(sessao, JS_MODAL_DO_ALV);
    throw new Error('webgui: filtrarGrid — o diálogo de filtro não abriu'
      + (modal?.length ? ` (o que abriu foi "${modal[0].titulo}", ${modal[0].id})` : ' (nenhum modal na tela)'));
  }
  await preencher(sessao, { id: low.id }, String(de ?? ''));
  // ⚠️ o "até" é ESCRITO SEMPRE que existe, inclusive vazio: o diálogo reabre com o filtro
  // ANTERIOR preenchido, e deixar o HIGH intacto ao limpar mantinha o filtro de pé (medido na fase
  // K, caso 8: QTD 1..100 "limpo" com de: '' continuou em 2 linhas, porque o 100 ficou lá).
  const high = await avaliar(sessao, jsPorSid('DYN001-HIGH'));
  if (!high && ate !== '' && ate !== null && ate !== undefined)
    throw new Error('webgui: filtrarGrid — o diálogo não tem o campo "até" (DYN001-HIGH) para o intervalo pedido');
  if (high) await preencher(sessao, { id: high.id }, String(ate ?? ''));
  const ok = await avaliar(sessao, jsPorSid('wnd[1]/tbar[0]/btn[0]'));
  if (!ok) throw new Error('webgui: filtrarGrid — o diálogo de filtro não tem o botão Executar (wnd[1]/tbar[0]/btn[0])');
  antes = await carimbo(sessao);
  await clicar(sessao, { id: ok.id });
  await esperarMudanca(sessao, antes, { tetoMs });
  const est = estadoDoCabecalho((await avaliar(sessao, jsCabecalhoDoGrid(m.id)) ?? []).find((h) => h.coluna === m.coluna)?.icone);
  const t = await lerGrid(sessao, { id: m.id });
  detalhe(`webgui: filtrarGrid ${m.id} — coluna ${m.coluna} (${m.nome}) ${de === '' ? 'LIMPA' : `= ${de}${ate === '' ? '' : `..${ate}`}`}, ${t.total} linha(s)`);
  return { id: m.id, sid: m.sid, coluna: m.coluna, nome: m.nome, de, ate, filtrada: est.filtrada,
    total: t.total, linhas: t.linhas, ms: Date.now() - t0 };
}

/**
 * O que cada coluna do ALV mostra AGORA — nome, ordenação e filtro —, lido do cabeçalho e sem tocar
 * a rede: `[{ coluna, nome, ordem, filtrada }]`, com a coluna 0 (a caixa de seleção) de fora.
 *
 * ```js
 * (await lerColunas(s)).filter((c) => c.filtrada)   // que colunas estão filtrando a tela
 * ```
 */
export async function lerColunas(sessao, alvo = null) {
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'lerColunas');
  const b = await avaliar(sessao, jsBlocoDoGrid(g.id));
  const hdr = (await avaliar(sessao, jsCabecalhoDoGrid(g.id))) ?? [];
  return hdr.filter((h) => h.coluna >= 1).sort((a, x) => a.coluna - x.coluna)
    .map((h) => ({ coluna: h.coluna, nome: (b?.colunas ?? [])[h.coluna - 1] ?? null, ...estadoDoCabecalho(h.icone) }));
}

// ---------- INSERIR e APAGAR linha do ALV (item 78) ----------
//
// O terceiro par de gestos do ALV editável, e o que separa este dos dois anteriores é **quando o
// servidor fica sabendo**. Medido no s4h 758/250 em 06/09/2026 (`POC_webgui_grid_linha`, fases A-F,
// laboratório `ZJBV_ALV47_EDIT`):
//
//   • **os quatro botões existem, e só num ALV editável**: com `layout-edit = 'X'` a barra publica
//     `LOCAL&APPEND` ("Anexar linha"), `LOCAL&INSERT_ROW` ("Inserir linha"), `LOCAL&DELETE_ROW`
//     ("Eliminar linha") e `LOCAL&COPY_ROW` ("Duplicar a linha") — endereçáveis pelo SID, como o
//     `SORT_ASC` do item 77. O `lsdata` do grid ainda anuncia `hasRowInsertAllowed: true`.
//   • **`APPEND` vai para o FIM, sempre** — com a célula corrente na linha 1 a linha nova nasceu na
//     6 de 6. Seleção e célula corrente não o desviam.
//   • **`INSERT_ROW` entra ANTES** da linha selecionada (ou, sem seleção, da CORRENTE): com a 2
//     selecionada, a nova ficou na 2 e a antiga 2 virou 3.
//   • **`DELETE_ROW` apaga TODAS as selecionadas** de uma vez (com 1 e 3 marcadas, sobraram 3 de 5),
//     e **sem seleção apaga a CORRENTE** — que é o modo de falha caro: um clique numa célula move a
//     corrente, e o botão apaga aquela linha sem perguntar. Daí `apagarLinhas` exigir a lista.
//   • **o `_linha` das demais RENUMERA na hora** (apagada a 2, o que era 3 virou 2).
//
// ⚠️ **O gesto FAZ round-trip (`action/3`) e mesmo assim NÃO GRAVA.** É o contrário do
// `escreverCelula` (que fica pendente no cliente) e mais traiçoeiro: a tabela interna do ABAP muda
// na hora, a tela volta com uma linha a mais ou a menos, e nada disso vai ao banco. Contra-prova
// pareada, mesmo laboratório, mesma sequência, só o gesto de gravar mudando:
//
// | | inserir + apagar | `FC01` | `ZJBV_ALV47` em OUTRA LUW |
// |---|---|---|---|
// | **NEGATIVA** | feito, `action/3` nos dois | **não mandado** | **inalterada** (as 3 linhas de antes) |
// | **POSITIVA** | idem | mandado | linha nova gravada, apagada some |
//
// (O `MODIFY` sozinho do laboratório do item 47 **nunca apagaria** — o `FC01` dele virou
// `DELETE FROM` + `MODIFY`, uma sincronização, para que "apagou" fosse falseável.)
//
// ⚠️ **A linha nova nasce com os campos INICIAIS, chave incluída.** Medido: inserida sem preencher
// o `ID` (`numc(3)`), ela chegou ao banco como `ID = '000'`. Duas linhas novas sem chave colidem —
// quem insere preenche a chave.

/** PURO: os fcodes de linha da barra do ALV editável — os nomes MEDIDOS, não a convenção. */
export const FCODES_DE_LINHA = {
  anexar: 'LOCAL&APPEND',
  inserir: 'LOCAL&INSERT_ROW',
  apagar: 'LOCAL&DELETE_ROW',
  duplicar: 'LOCAL&COPY_ROW',
};

/** O gesto de linha: aciona o botão da barra e espera a tela voltar. Devolve o bloco depois. */
async function gestoDeLinha(sessao, g, fcode, tetoMs) {
  const b = await botaoDaBarra(sessao, g, fcode);
  const antes = await carimbo(sessao);
  await clicar(sessao, { id: b.id });
  await esperarMudanca(sessao, antes, { tetoMs });
  const modal = await avaliar(sessao, JS_MODAL_DO_ALV);
  if (modal?.length) throw new Error(`webgui: o ALV abriu o diálogo "${modal[0].titulo}" (${modal[0].id}) em vez de executar "${fcode}". `
    + 'Esse diálogo NÃO é wnd[1] e o lerTela não o vê — feche-o antes de qualquer outro gesto.');
  return lerGrid(sessao, { id: g.id });
}

/**
 * INSERE uma linha no ALV editável — no fim (`LOCAL&APPEND`) ou antes de uma linha
 * (`LOCAL&INSERT_ROW`), e opcionalmente já preenche as células dela.
 *
 * ```js
 * await inserirLinha(s);                                              // linha vazia no fim
 * await inserirLinha(s, null, { valores: { ID: '004', NOME: 'x' } }); // no fim, preenchida
 * await inserirLinha(s, null, { antesDe: 2 });                        // empurra a 2 para baixo
 * ```
 *
 * Devolve `{ id, sid, linha, modo, total, linhas, valores, pendente, ms }` — `linha` é onde ela
 * ficou (o fim, ou o próprio `antesDe`) e `linhas` é o bloco já com ela.
 *
 * ⚠️ **Isto NÃO grava** (§ acima): a linha existe na tabela interna do ABAP e em lugar nenhum do
 * banco até o programa gravar — `comandar(s, '<fcode de gravar>')`.
 * ⚠️ `valores` sai por `escreverCelula`, então fica **pendente no navegador** (`pendente: true`):
 * ele viaja no próximo round-trip, junto do gesto de gravar.
 * ⚠️ A chave é sua: sem `valores` a linha nasce inicial, e duas assim colidem.
 */
export async function inserirLinha(sessao, alvo = null, { antesDe = null, valores = null, tetoMs = 30000 } = {}) {
  const t0 = Date.now();
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'inserirLinha');
  const b = await lerGrid(sessao, { id: g.id });
  const n = b.total;
  let modo = 'anexar';
  let linha = n + 1;
  if (antesDe !== null && antesDe !== undefined) {
    const k = Number(antesDe);
    if (!Number.isInteger(k) || k < 1) throw new Error(`webgui: inserirLinha — antesDe "${antesDe}" não é uma linha (inteiro >= 1)`);
    await selecionarLinhas(sessao, { id: g.id }, [k]);
    modo = 'antes';
    linha = k;
  }
  const alvoDaBarra = { id: g.id, sid: b.sid ?? g.sid };
  const d = await gestoDeLinha(sessao, alvoDaBarra, modo === 'antes' ? FCODES_DE_LINHA.inserir : FCODES_DE_LINHA.anexar, tetoMs);
  if (d.total !== n + 1) throw new Error(`webgui: inserirLinha — o ALV ${g.id} tinha ${n} linha(s) e ficou com ${d.total}, não ${n + 1}. `
    + 'O programa recusou a inserção (ou o botão fez outra coisa).');
  const escritos = {};
  for (const [coluna, valor] of Object.entries(valores ?? {})) {
    await escreverCelula(sessao, { id: g.id }, { linha, coluna, valor });
    escritos[coluna] = valor;
  }
  const fim = valores ? await lerGrid(sessao, { id: g.id }) : d;
  detalhe(`webgui: inserirLinha ${g.id} — linha ${linha} (${modo}), ${n} → ${d.total} linha(s)`
    + `${valores ? `, ${Object.keys(escritos).length} célula(s) PENDENTE(s)` : ''}; NADA GRAVADO ainda`);
  return { id: g.id, sid: alvoDaBarra.sid, linha, modo, total: d.total, linhas: fim.linhas,
    valores: escritos, pendente: !!valores, ms: Date.now() - t0 };
}

/**
 * APAGA linhas do ALV editável — marca as caixas e aciona `LOCAL&DELETE_ROW`.
 *
 * ```js
 * await apagarLinhas(s, null, [2]);
 * await apagarLinhas(s, null, [1, 3]);   // as duas de uma vez
 * ```
 *
 * Devolve `{ id, sid, pedidas, antes, total, linhas, ms }`, com `linhas` já renumerado.
 *
 * ⚠️ **Isto NÃO grava** (§ acima) — a linha só sai do banco quando o programa gravar, e só se ele
 * fizer `DELETE`: um `MODIFY FROM TABLE` deixa a linha apagada no banco, calado.
 * ⚠️ **A lista é obrigatória de propósito.** `LOCAL&DELETE_ROW` sem seleção apaga a linha CORRENTE,
 * que qualquer clique anterior pode ter movido — apagar "a que estiver marcada" não é endereço.
 * ⚠️ **O `_linha` das que sobram RENUMERA.** Apagar [1, 3] em duas chamadas apaga a linha errada na
 * segunda: passe as duas de uma vez, ou releia o bloco entre uma e outra.
 */
export async function apagarLinhas(sessao, alvo = null, linhas = [], { tetoMs = 30000 } = {}) {
  const t0 = Date.now();
  const pedidas = [...new Set((linhas ?? []).map(Number))].sort((x, y) => x - y);
  if (!pedidas.length) throw new Error('webgui: apagarLinhas — nenhuma linha pedida. '
    + 'Sem lista o ALV apagaria a linha CORRENTE, e ela não é endereço.');
  const g = escolherGrid((await lerTela(sessao))?.grids ?? [], alvo, 'apagarLinhas');
  const b = await lerGrid(sessao, { id: g.id });
  const n = b.total;
  const s = await selecionarLinhas(sessao, { id: g.id }, pedidas);
  const d = await gestoDeLinha(sessao, { id: g.id, sid: s.sid ?? b.sid ?? g.sid }, FCODES_DE_LINHA.apagar, tetoMs);
  if (d.total !== n - pedidas.length) throw new Error(`webgui: apagarLinhas — pedi ${pedidas.length} linha(s) de ${n} e o ALV ${g.id} `
    + `ficou com ${d.total}, não ${n - pedidas.length}. O programa recusou a exclusão (ou o botão fez outra coisa).`);
  detalhe(`webgui: apagarLinhas ${g.id} — [${pedidas.join(', ')}] fora, ${n} → ${d.total} linha(s); NADA GRAVADO ainda`);
  return { id: g.id, sid: s.sid ?? g.sid, pedidas, antes: n, total: d.total, linhas: d.linhas, ms: Date.now() - t0 };
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
//
// ⚠️ **Com MAIS DE UM gesto lá dentro, o menor-por-caixa é chute — e chute que erra calado.** Medido
// no s4h 758/250 em 05/09/2026 (item 68, `POC_ui5_clicar_descendente/medicoes/item68-dois-gestos.md`):
// numa linha com o botão "Adicionar" (4012 px²) e o ícone "Detalhe" (224 px²), clicar a linha
// dispara SEMPRE o **Detalhe** — não é "não pegou", é o gesto ERRADO. Por isso `{ dentro: '<rótulo>' }`,
// que escolhe pelo `aria-label`/`title`/texto do descendente; e por isso o `clicar`, quando desce
// sem `dentro` havendo vários, DIZ que escolheu por tamanho e lista os rótulos.

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

/** PURO: as funções que o navegador usa para julgar um nó — visibilidade, marca de ação, caixa,
 * RÓTULO e como chamá-lo numa mensagem. `cursor: pointer` é a última via porque é a mais frouxa
 * (e HERDADA: o recheio de um ícone clicável também "parece" clicável).
 *
 * `rotulo` é o que torna o gesto ENDEREÇÁVEL. Medido no s4h 758/250 em 05/09/2026 (item 68,
 * UI5 1.114.0): um `sap.ui.core.Icon` com tooltip rende `aria-label="Adicionar"` no `<span>` do
 * controle e `title="Adicionar"` no recheio; um `sap.m.Button` não tem nem um nem outro — só o
 * `innerText`. O NOME do ícone (`sap-icon://add`) **não chega ao DOM**: fica em
 * `data-sap-ui-icon-content`, que é o CARACTERE da fonte SAP-icons, não o nome. Por isso a ordem é
 * aria-label → title → texto → value, e não há via por `sap-icon`.
 *
 * `externos` tira da lista quem está DENTRO de outro da própria lista: um `sap.m.Button` publica 4
 * nós acionáveis encaixados (button > inner > content > bdi, todos com o mesmo rótulo), e contá-los
 * como 4 gestos faria toda linha parecer ambígua. */
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
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase().replace(/\\s+/g, ' ').trim();
  const rotulo = (e) => {
    if (!e) return '';
    const at = (n) => (e.getAttribute ? e.getAttribute(n) : null) || '';
    return (at('aria-label') || at('title') || String(e.innerText || '').trim() || String(e.value || '')).trim();
  };
  const externos = (lista) => lista.filter((e) => !lista.some((o) => o !== e && o.contains && o.contains(e)));
  const casa = (e, alvo) => { const r = norm(rotulo(e)); return !!r && r.includes(norm(alvo)); };
  return { SEL, visivel, motivo, area, desc, norm, rotulo, externos, casa };
})()`;

/**
 * PURO: a expressão que resolve o nó que VAI receber o gesto. Alvo com marca de ação é o próprio
 * alvo — só quem não tem nenhuma desce. `{ descer: false }` devolve o alvo cru (é o que se usa para
 * medir o contrafactual: clicar no contêiner e ver que nada acontece).
 *
 * `{ dentro: '<rótulo>' }` escolhe o gesto pelo RÓTULO em vez do tamanho, e IMPLICA a descida. Ele
 * devolve `null` quando nenhum casa **ou** quando casa mais de um: escolher no empate seria o mesmo
 * chute que ele existe para evitar — quem chama recebe erro com a lista, não um gesto sorteado.
 */
export function jsAlvoEfetivo(js, { descer = true, dentro = null } = {}) {
  if (!descer && !dentro) return `(${js})`;
  return `(() => {
    const raiz = ${js};
    if (!raiz) return null;
    const H = ${JS_ACIONAVEL};
    const DENTRO = ${JSON.stringify(dentro)};
    if (!DENTRO && H.motivo(raiz)) return raiz;
    const cand = [...raiz.querySelectorAll('*')].filter((e) => H.motivo(e) && H.area(e) > 0);
    if (DENTRO) {
      const casaram = H.externos(cand.filter((e) => H.casa(e, DENTRO)));
      return casaram.length === 1 ? casaram[0] : null;
    }
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
 * `porQue` (a marca de ação que valeu), `candidatos` (os descendentes acionáveis que havia) e
 * `gestos` (os acionáveis INDEPENDENTES, com o rótulo de cada um — é a lista que se endereça com
 * `{ dentro }`). Com `{ dentro }` sem casamento único, volta com `recebeu: null` e `casaram`
 * preenchido — cabe a quem chama recusar; aqui não se sorteia alvo.
 */
export async function apontar(sessao, alvo, { descer = true, dentro = null } = {}) {
  const js = jsDoAlvo(alvo);
  const efetivo = jsAlvoEfetivo(js, { descer, dentro });
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
    if (!raiz) return null;
    const H = ${JS_ACIONAVEL};
    const cand = [...raiz.querySelectorAll('*')].filter((z) => H.motivo(z) && H.area(z) > 0)
      .sort((a, c) => H.area(a) - H.area(c));
    const gestos = H.externos(cand).map((z) => ({ nome: H.desc(z), rotulo: H.rotulo(z), porQue: H.motivo(z) }));
    if (!e) return { recebeu: null, de: H.desc(raiz), desceu: false, porQue: null, gestos,
                     dentro: ${JSON.stringify(dentro)},
                     casaram: H.externos(cand.filter((z) => H.casa(z, ${JSON.stringify(dentro)}))).map(H.desc),
                     candidatos: cand.slice(0, 8).map(H.desc) };
    const b = e.getBoundingClientRect();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    const no = document.elementFromPoint(x, y);
    const desceu = e !== raiz;
    return { id: e.id, title: e.title, x, y, noPonto: no ? (no.id || no.tagName) : null,
             coberto: !(no === e || e.contains(no) || (no && no.contains(e))),
             recebeu: H.desc(e), de: H.desc(raiz), desceu, porQue: H.motivo(e),
             gestos: desceu ? gestos : [],
             candidatos: desceu ? cand.slice(0, 8).map(H.desc) : [] };
  })()`);
}

/** PURO: como um gesto se chama numa mensagem — o rótulo é o que se digita em `{ dentro }`; o nome
 * do nó só entra quando não há rótulo (ícone sem tooltip existe). */
export const nomeDoGesto = (g) => (g?.rotulo ? `"${g.rotulo}"` : `<sem rótulo> (${g?.nome})`);

/** Os modificadores do CDP (`Input.dispatchMouseEvent.modifiers`), que são um mapa de bits. */
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/** O gesto de mouse INTEIRO. Medido: press+release sem `buttons` e sem o `mouseMoved` antes não
 * aciona o Unified Renderer.
 *
 * `modificadores` é o mapa de bits do `MOD` — `MOD.ctrl` para acrescentar à seleção do ALV,
 * `MOD.shift` para a faixa (§ "Selecionar linha e célula no ALV"). Sem ele, clique simples. */
export async function clique(sessao, p, { modificadores = 0 } = {}) {
  const m = { x: p.x, y: p.y, modifiers: modificadores };
  await sessao.cmd('Input.dispatchMouseEvent', { ...m, type: 'mouseMoved', buttons: 0 });
  await sessao.cmd('Input.dispatchMouseEvent', { ...m, type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1 });
  await sessao.cmd('Input.dispatchMouseEvent', { ...m, type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1 });
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
export async function clicar(sessao, alvo, { tetoMs = 20000, esperarResposta = false, descer = true, dentro = null } = {}) {
  const ate = Date.now() + tetoMs;
  let p = null;
  while (Date.now() < ate && !p) {
    p = await apontar(sessao, alvo, { descer, dentro });
    if (!p) await espera(400);
  }
  if (!p) throw new Error(`webgui: clicar — ${nomeDoAlvo(alvo)} não está na tela (${tetoMs} ms)`);
  if (!p.recebeu) {
    const lista = (p.gestos ?? []).map(nomeDoGesto).join(', ') || '(nenhum)';
    throw new Error(p.casaram?.length > 1
      ? `webgui: clicar — dentro de ${nomeDoAlvo(alvo)} o rótulo "${dentro}" casa com ${p.casaram.length} gestos (${p.casaram.join(', ')}) — seja mais específico ou endereçe o descendente direto`
      : `webgui: clicar — dentro de ${nomeDoAlvo(alvo)} nenhum gesto tem rótulo "${dentro}" — os gestos de lá são: ${lista}`);
  }
  if (p.desceu) {
    // Um gesto só: a descida é determinada (item 40). VÁRIOS: a escolha saiu do TAMANHO, que é
    // chute — medido no s4h em 05/09/2026 (item 68), a linha "Adicionar" (botão) + "Detalhe"
    // (ícone) sempre cai no DETALHE, porque o ícone é menor. Isso não pode passar calado.
    const varios = !dentro && (p.gestos ?? []).length > 1;
    detalhe(`webgui: ${nomeDoAlvo(alvo)} não aciona nada — o gesto foi no descendente ${p.recebeu} (${p.porQue})`
      + (varios ? `; havia ${p.gestos.length} gestos lá dentro e a escolha foi por TAMANHO — mande no certo com { dentro: '<rótulo>' }: ${p.gestos.map(nomeDoGesto).join(', ')}` : ''));
  }
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
 * Devolve `{ okcode, mudou, respondeu, ms, publicado }` — e `mudou` e `respondeu` são coisas
 * diferentes (§ `esperarTroca`): `respondeu: false` é "nenhuma conversa com o ABAP aconteceu" (o
 * gesto não saiu do navegador); `respondeu: true, mudou: false` é "houve round-trip e a tela ficou
 * igual" — o caso normal de um repaint de grid que confirma o que já estava no DOM, e que a espera
 * antiga (só carimbo) cobrava o TETO inteiro para descobrir. Se o comando teve EFEITO, quem diz é
 * a mensagem (`lerTela`) ou o dado, nunca esses dois sinais.
 *
 * ⚠ `/n` (e `/3`) **encerra a transação**, não vai ao menu: medido no s4h 758/250 em 05/09/2026
 * (item 37, pela via HTTP) que ele cai na tela de fundo da sessão — `SMEN` só quando a sessão já
 * carregou o menu, e `S000`/`SAPMSYST` quando não. Para ir ao menu: `/nSMEN`.
 */
export async function comandar(sessao, texto, { tetoMs = 25000, publicarValores = true } = {}) {
  const js = jsComando(texto);
  const publicado = publicarValores ? await avaliar(sessao, JS_PUBLICAR_FOCO) : null;
  const antes = await carimbo(sessao);
  const desde = sessao.eventos.length;
  const t0 = Date.now();
  const achou = await avaliar(sessao, js);
  if (!achou) throw new Error(`webgui: comandar — a tela não tem o campo ToolbarOkCode (${texto})`);
  const { mudou, respondeu } = await esperarTroca(sessao, antes, { desde, tetoMs });
  return { okcode: String(texto).trim(), mudou, respondeu, ms: Date.now() - t0, publicado: publicado ?? null };
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
// ⚠️ **"Não existe no DOM" era meia verdade — a ÁRVORE INTEIRA está lá, como TEXTO.** Medido no
// item 82 (s4h 758/250, 06/09/2026, `medicoes/item82-arvore-no-xmp.md`): elemento de menu não há
// mesmo — `querySelectorAll('[ct="POMNI"]')` SEM o filtro de visível devolve **0** da barra antes
// do clique. Mas o boot escreve a marcação de CADA popup dentro de um `<xmp>` inerte
// (`class="lsPopupMenu__metaData"`, um por popup, 28 na SE38), e ali estão os **146 `POMNI` de
// `wnd[0]/mbar` em quatro níveis** — os MESMOS 146 (e os mesmos 11 cinzas) que o boot da via HTTP
// devolve no delta (item 49). O renderer não descarta nem esconde: ele **guarda a marcação e INFLA
// sob demanda**, um popup por clique (o botão inflou os 7 do nível 0; "Sistema" inflou só os 12
// filhos DELE — a folha de nível 2 continuou não existindo).
//
// Daí a divisão de trabalho desta seção, e é ela que paga:
//  · **LER é de graça** — `arvoreDeMenu` interpreta os `<xmp>` em ~15 ms, ZERO clique, ZERO rede;
//    `navegarMenu({ acionar: false })` e as guardas (rótulo inexistente, item cinza) saem daí,
//    como na via HTTP. Antes isso custava a cascata inteira de cliques.
//  · **ACIONAR ainda é CASCATA** — a folha só vira elemento depois de o pai ser clicado, e clique
//    é em elemento. O que a árvore tira da cascata é a leitura entre os passos: o caminho já vem
//    resolvido por `id`, e `clicar` (que espera o alvo aparecer) basta.
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

/**
 * O despejo da ÁRVORE INTEIRA, lida da marcação que o boot guardou nos `<xmp>` — sem clicar em
 * nada (§ item 82 acima). Cada popup vem num `<xmp>` inerte; o `DOMParser` o transforma em
 * documento SOLTO (não entra no DOM da página) e daí saem os `POMNI` com `id` e `lsdata`.
 *
 * ⚠️ Os `<xmp>` trazem também os menus de CONTEXTO da área de trabalho (`wnd[0]/usr/mnu/…`, 39 na
 * SE38) — quem filtra a barra é o `arvoreDeMenu`, como já fazia o `itensDeMenu`.
 */
export const JS_ARVORE_DE_MENU = `[...document.querySelectorAll('xmp')]
  .filter((x) => (x.textContent || '').indexOf('POMNI') >= 0)
  .flatMap((x) => [...new DOMParser().parseFromString(x.textContent, 'text/html').querySelectorAll('[ct="POMNI"]')])
  .map((el) => { let d = null; try { d = JSON.parse(el.getAttribute('lsdata')); } catch { d = null; }
    return { id: el.id || null, lsdata: d, desabilitado: el.getAttribute('aria-disabled') }; })`;

/**
 * A árvore de menu INTEIRA da tela atual, já interpretada — **zero clique, zero rede** (~15 ms).
 * `nivel: 0` são os itens da barra; `submenu` diz quem tem filhos; `habilitado` já traz a guarda
 * do cinza (`lsdata[5]`, item 48) para o caminho todo, e não só para onde a cascata chegou.
 *
 * Medido na SE38 (146 itens, 4 níveis, 11 cinzas) e na SE16 (83 itens, 15 cinzas): a árvore é a da
 * tela do momento e acompanha a troca de tela sozinha — é lida do DOM, não guardada.
 */
export async function arvoreDeMenu(sessao) {
  const brutos = await avaliar(sessao, JS_ARVORE_DE_MENU);
  return (brutos ?? []).filter((b) => daBarraDeMenu(b.id)).map(interpretarItemDeMenu);
}

/**
 * PURO: desce a árvore por RÓTULO e devolve `{ caminho, passos, alvo, filhos }`. Os candidatos de
 * cada passo são só os filhos DIRETOS do nó anterior — dois menus podem ter o mesmo rótulo em
 * ramos diferentes, e casar por rótulo solto pega o errado (item 26).
 *
 * É o mesmo percurso das DUAS vias: o `its.mjs` o reexporta e roda sobre os itens do delta.
 */
export function acharCaminhoDeMenu(itens, caminho) {
  const partes = partirCaminhoDeMenu(caminho);
  const filhosDe = (sid) => (sid === null
    ? (itens ?? []).filter((i) => i.nivel === 0)
    : (itens ?? []).filter((i) => filhoDiretoDeMenu(sid, i.id)));
  let sid = null;
  const passos = [];
  for (const rotulo of partes) {
    const irmaos = filhosDe(sid);
    const alvo = acharItemDeMenu(irmaos, rotulo);
    if (!alvo) throw new Error(`menu: "${rotulo}" não está sob ${sid ?? 'wnd[0]/mbar'}. Tenho: ${irmaos.map((i) => i.rotulo).join(' | ')}`);
    passos.push(alvo);
    sid = alvo.sid ?? alvo.id;
  }
  return { caminho: partes, passos, alvo: passos[passos.length - 1], filhos: filhosDe(sid) };
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
 * O caminho é resolvido de UMA vez na `arvoreDeMenu` (zero clique) — rótulo inexistente e item
 * cinza denunciam ANTES de o menu sequer abrir, e `{ acionar: false }` devolve os `filhos` do
 * último nó sem tocar em nada: é assim que se DESCOBRE o menu de uma tela.
 *
 * ⚠️ O ACIONAMENTO continua CASCATA, e tem de ser: a folha só vira elemento depois de o pai ser
 * clicado (§ item 82), e abrir um irmão FECHA o submenu anterior. O que a árvore tirou daqui foi a
 * LEITURA entre os passos — cada nó já vem com o `id`, e o `clicar` espera o alvo aparecer, que é
 * a espera não-síncrona de que o submenu precisa.
 *
 * Devolve `{ caminho, passos, folha, mudou }`. `mudou: false` é INFORMAÇÃO, a mesma de `acionar`:
 * a folha foi clicada e a tela ficou igual.
 */
export async function navegarMenu(sessao, caminho, { acionar: aciona = true, tetoMs = 8000, tetoAcaoMs = 40000 } = {}) {
  const arvore = await arvoreDeMenu(sessao);
  if (!arvore.length) {
    throw new Error('webgui: navegarMenu — esta tela não publicou árvore de menu nenhuma nos `<xmp>` '
      + '(nenhum POMNI de wnd[n]/mbar); o menu da barra pode não existir aqui');
  }
  const { caminho: partes, passos, alvo, filhos } = acharCaminhoDeMenu(arvore, caminho);
  // ⚠️ item DESABILITADO: o clique é ENGOLIDO — medido no mesmo popup (SAP Easy Access,
  // "Processar"), o cinza deixa o menu ABERTO e o carimbo igual, enquanto o irmão habilitado
  // fecha o menu e muda a tela. Sem esta guarda a falha seria a mais silenciosa deste canal:
  // o percurso esperaria pelos filhos que nunca vêm. Agora vale para o caminho INTEIRO, e de
  // graça — a árvore traz o `lsdata[5]` de todos os níveis.
  const cinza = passos.find((p) => !p.habilitado);
  if (cinza) {
    throw new Error(`webgui: navegarMenu — "${cinza.rotulo}" está DESABILITADO nesta tela (${cinza.id}); o clique não faria nada`);
  }
  if (!aciona || alvo.submenu) return { caminho: partes, passos, folha: null, filhos, mudou: false };
  await abrirMenu(sessao);
  for (const passo of passos.slice(0, -1)) await clicar(sessao, passo.id, { tetoMs });
  const antes = await carimbo(sessao);
  await clicar(sessao, alvo.id, { tetoMs });
  const mudou = await esperarMudanca(sessao, antes, { tetoMs: tetoAcaoMs });
  return { caminho: partes, passos, folha: alvo, mudou };
}

// ---------- a ÁRVORE do SAP Easy Access pelo NAVEGADOR (item 86) ----------
//
// A mesma árvore que a via HTTP endereça por chave (§ `its.mjs`, item 50), aqui pelo DOM e por
// GESTO. Medido no s4h 758/250 em 06/09/2026 (`sap-accelerate/work/POC_webgui_arvore/`, bruto em
// `medicoes/raw/h-nav-arvore.json`, leitura em `medicoes/item86-arvore-navegador.md`).
//
// **A LEITURA é a mesma, e é de graça** — o boot do SMEN traz a árvore inteira no DOM, e as três
// fontes do item 50/84 estão todas lá: o `STCS` com o `nodeindexes` no `lsdata`, os `TV`
// (`tree#C105#<n>#1#1#i`) com o rótulo, e o `<td subct="HIC">` com o estado de expansão. Por isso
// as PURAS que cruzam as três (`indiceDoNo`, `containerDaArvore`, `arvoreDosBrutos`,
// `acharNoDaArvore`) moram AQUI e o `its.mjs` as importa: o que muda entre as vias é só de onde
// vêm os brutos — do delta HTTP lá, do DOM aqui.
//
// ⚠️ **O despejo por `[ct]` NÃO vê a flag de filhos**: o `<td subct="HIC">` não tem `ct` nenhum
// (item 84). Por isso `JS_ARVORE` varre `[subct="HIC"]` à parte — `lerTela` não a traz.
//
// **O GESTO é um só, e é TOGGLE.** Onde a via HTTP tem três comandos (`action/8` expandir,
// `action/9` colapsar, `action/2` acionar), aqui há o duplo clique sintético — e ele faz os três,
// pelo mesmo POST. Quatro braços, uma sessão (SMEN do s4h 758/250):
//
// | gesto | nó | efeito | tempo |
// |---|---|---|---|
// | duplo clique no `TV` | "Escritório" `COLLAPSED` | **EXPANDE** — 15 → 22 nós | 2,6 s |
// | duplo clique no `TV` | o MESMO nó, agora `EXPANDED` | **COLAPSA** — 22 → 15 nós | 252 ms |
// | duplo clique no **ícone** (`L`, `tree#C105#<n>#ni`) | `COLLAPSED` | **EXPANDE** — 15 → 22 nós | 272 ms |
// | duplo clique no `TV` | FOLHA `F00003` (favorito) | SMEN → **CO01** "Criar ordem de produção" | **54 s** |
//
// Os três primeiros postam exatamente o que o item 50 capturou (`action/41` da seleção + `action/2`
// `type=OnNodeDoubleClick&node_key=<chave>`) — o gesto do renderer e o POST da via HTTP são o
// MESMO protocolo, e por isso `expandirNo`/`colapsarNo` aqui são operações de ESTADO como lá: só
// gesticulam quando o nó ainda não está como se pede.
//
// ⚠️ **Aqui não existe o irmão IDEMPOTENTE.** Na via HTTP o `action/9` num nó já fechado é aceito e
// não faz nada (item 85); no navegador, repetir o duplo clique num nó fechado o REABRE. `colapsarNo`
// só gesticula em `EXPANDED`, e é isso que faz repetir ser seguro.
//
// ⚠️ **E a RAIZ não fecha por gesto** (`raw/h3-nav-colapsar.json`): o duplo clique em "Menu SAP"
// (`Root`) e em "Favoritos" (`Favo`) posta o mesmo `action/2`, o servidor responde, e a árvore fica
// idêntica — enquanto o nó de nível 1 fecha em 253 ms. É o único gesto da árvore que esta via NÃO
// alcança, e é justamente o que mais encolhe o delta (item 85: `Root` fechada = −29,5%). Para isso
// existe a via HTTP (`its.colapsarNo`, `action/9`), que fecha a raiz.
//
// ⚠️ **CORREÇÃO ao item 50**: "clicar no ícone (`L`) não expande" vale para o clique SIMPLES — o
// duplo clique no ícone expande igual ao do nó, com o mesmo POST. E o clique simples continua não
// postando nada (o `action/41` fica enfileirado no renderer e sai junto do próximo gesto que posta),
// o que é a razão de o veredito daqui sair da ÁRVORE (`assinaturaDaArvore`), e não do carimbo.
//
// ⚠️ **O acionamento é LENTO e mais lento que na via HTTP**: 54 s aqui contra 15,5 s no POST direto
// (mesma folha, transação fria). O teto de 30 s do `esperarMudanca` não bastaria — por isso
// `TETO_ARVORE`.

/** O teto do acionamento da árvore — medido 54 s numa folha pelo navegador, 15,5 s pelo POST. */
export const TETO_ARVORE = 120000;

/** PURO: `tree#C105#6#1#1#i` → `6`, o índice do nó no `nodeindexes`; `null` se não é nó de árvore. */
export const indiceDoNo = (id) => {
  const m = /^tree#[^#]+#([0-9]+)#1#1#i$/.exec(String(id ?? ''));
  return m ? Number(m[1]) : null;
};

/** PURO: o container da ÁRVORE (`GuiTree`) entre os brutos — `{ id, sid, nodeindexes }` ou `null`. */
export function containerDaArvore(brutos = []) {
  for (const c of brutos) {
    const d = sidDoLsdata(c?.lsdata);
    if (d?.Type === 'GuiTree' && Array.isArray(d.nodeindexes)) return { id: c.id ?? null, sid: d.SID, nodeindexes: d.nodeindexes };
  }
  return null;
}

/**
 * PURO: os nós VISÍVEIS da árvore, cruzando o `nodeindexes` do container com os `TV` dos brutos —
 * `{ sid, id, nodeindexes, nos: [{ n, id, chave, rotulo, pai, nivel, categoria }] }`. Sem árvore,
 * `{ sid: null, nos: [] }`.
 *
 * `pai` é o índice `n` do pai (`-1` na raiz) e `nivel` é a profundidade contada por ele.
 * `categoria` é o segundo campo do `nodeindexes` — vem `2` na raiz "Favoritos", `3` em cada
 * favorito, `0` na raiz "Menu SAP" e `1` em todo nó do menu. Medido (item 84): a categoria **não**
 * é a flag de filhos — folha e pasta do menu são as duas `1`.
 *
 * Com a `expansao` (`Map n → 'EXPANDED' | 'COLLAPSED' | 'INDENT'`) cada nó ganha `expansao` e
 * **`temFilhos`** — e é ele que poupa o gesto inócuo na folha.
 *
 * ⚠️ É a MESMA pura das duas vias: aqui os brutos vêm do DOM (`JS_ARVORE`), no `its.mjs` do delta.
 */
export function arvoreDosBrutos(brutos = [], expansao = null) {
  const cont = containerDaArvore(brutos);
  if (!cont) return { sid: null, id: null, nodeindexes: null, nos: [] };
  const nos = brutos
    .filter((c) => c.ct === 'TV' && indiceDoNo(c.id) !== null)
    .map((c) => {
      const n = indiceDoNo(c.id);
      const e = Array.isArray(cont.nodeindexes[n]) ? cont.nodeindexes[n] : [];
      return {
        n, id: c.id, chave: typeof e[0] === 'string' ? e[0] : null, categoria: e[1] ?? null,
        pai: typeof e[2] === 'number' ? e[2] : -1,
        rotulo: typeof c.lsdata?.['0'] === 'string' ? c.lsdata['0'] : (c.texto ?? null),
        expansao: expansao?.get(n) ?? null,
        temFilhos: expansao?.has(n) ? expansao.get(n) !== 'INDENT' : null,
      };
    })
    .filter((x) => x.chave !== null);
  const porN = new Map(nos.map((x) => [x.n, x]));
  for (const no of nos) {
    let nivel = 0;
    let p = no.pai;
    while (p > 0 && porN.has(p) && nivel < 64) { nivel += 1; p = porN.get(p).pai; }
    no.nivel = nivel;
  }
  return { ...cont, nos };
}

/** PURO: acha um nó por CHAVE (`'F00003'`), por rótulo (sem acento nem caixa) ou por `{ chave }`. */
export function acharNoDaArvore(nos = [], alvo) {
  const chave = alvo && typeof alvo === 'object' ? alvo.chave ?? null : String(alvo ?? '');
  const achado = nos.find((x) => x.chave === chave)
    ?? (alvo && typeof alvo === 'object' ? null : acharItemDeMenu(nos, chave));
  // sem prefixo de módulo de propósito: esta pura serve às DUAS vias (o `its.mjs` a importa)
  if (!achado) throw new Error(`a árvore não tem "${chave}". Tenho: ${nos.map((x) => `${x.rotulo} (${x.chave})`).join(' | ')}`);
  return achado;
}

/**
 * PURO: o estado da árvore numa string — quantos nós e como cada um está. É o veredito de
 * "o gesto pegou": o duplo clique numa pasta muda a ÁRVORE sem mudar o título, e o carimbo da tela
 * não separa isso do repintar do renderer.
 */
export const assinaturaDaArvore = (a) =>
  `${(a?.nos ?? []).length}|${(a?.nos ?? []).map((x) => `${x.chave}:${x.expansao}`).join(',')}`;

/**
 * O despejo CRU da árvore no DOM: `{ brutos, expansao }` — os `STCS`/`TV` no formato do
 * `JS_DESPEJO_CONTROLES` (é o que `arvoreDosBrutos` come) e os pares `[n, estado]` dos
 * `<td subct="HIC">`, que não têm `ct` e por isso não vêm no despejo normal (item 84).
 */
export const JS_ARVORE = `(() => {
  const j = (s) => { try { return JSON.parse(s); } catch (x) { return null; } };
  const brutos = [...document.querySelectorAll('[ct="STCS"],[ct="TV"]')].map((el) => ({
    id: el.id || null, ct: el.getAttribute('ct'), lsdata: j(el.getAttribute('lsdata')),
    texto: (el.innerText || '').trim().slice(0, 120) || null }));
  const expansao = [...document.querySelectorAll('td[subct="HIC"]')]
    .map((el) => ({ m: /^tree#[^#]+#([0-9]+)#1$/.exec(el.id || ''), d: j(el.getAttribute('lsdata')) }))
    .filter((x) => x.m && typeof (x.d || {})['5'] === 'string')
    .map((x) => [Number(x.m[1]), x.d['5']]);
  return { brutos, expansao };
})()`;

/**
 * A árvore da tela atual, lida do DOM — **zero rede**, ~30 ms. Cada nó traz `chave`, `rotulo`,
 * `pai`, `nivel`, `expansao` e `temFilhos`; sem `GuiTree` na tela vem `{ sid: null, nos: [] }`.
 */
export async function arvore(sessao) {
  const cru = await avaliar(sessao, JS_ARVORE);
  return arvoreDosBrutos(cru?.brutos ?? [], new Map(cru?.expansao ?? []));
}

/**
 * O DUPLO clique sintético num ponto — o gesto que a árvore entende. Mesma sequência do `clique`,
 * com o segundo par `clickCount: 2`: é isso que o renderer lê como `OnNodeDoubleClick` (medido no
 * item 50 pela captura do `postData`).
 */
export async function duploClique(sessao, p, { modificadores = 0 } = {}) {
  const m = { x: p.x, y: p.y, modifiers: modificadores };
  await sessao.cmd('Input.dispatchMouseEvent', { ...m, type: 'mouseMoved', buttons: 0 });
  for (const clickCount of [1, 2]) {
    await sessao.cmd('Input.dispatchMouseEvent', { ...m, type: 'mousePressed', button: 'left', buttons: 1, clickCount });
    await sessao.cmd('Input.dispatchMouseEvent', { ...m, type: 'mouseReleased', button: 'left', buttons: 0, clickCount });
  }
}

/**
 * O duplo clique NO NÓ (o `TV` com o rótulo), devolvendo `{ ponto, desde }` — o `desde` é a marca
 * nos eventos CDP de onde `esperarArvore` conta os round-trips.
 * ⚠️ `descer: false`: o gesto medido foi no próprio nó.
 */
async function gesticularNo(sessao, no) {
  const ponto = await apontar(sessao, { id: no.id }, { descer: false });
  if (typeof ponto?.x !== 'number') throw new Error(`webgui: a árvore tem "${no.rotulo}" (${no.chave}) mas ele não está apontável na tela (${no.id})`);
  const desde = sessao.eventos.length;
  await duploClique(sessao, ponto);
  return { ponto, desde };
}

/**
 * Espera a ÁRVORE deixar de ser a de `antes` — `{ mudou, respondeu, ms, arvore }`. `mudou: false`
 * com `respondeu: true` é INFORMAÇÃO: o POST foi e voltou, e a árvore ficou igual (é assim que a
 * RAIZ se denuncia, § `colapsarNo`, e que uma pasta declarada mas VAZIA se denunciaria).
 *
 * ⚠️ **O round-trip é o que impede pagar o teto inteiro** (a mesma lição do `esperarTroca`, item
 * 80): sem ele, "o gesto não fez nada" custaria os 30 s de teto — foi o que o E2E do item 86 pagou
 * duas vezes ao tentar colapsar a raiz. A resposta chega ANTES do repaint, então depois dela ainda
 * se espera `assentarMs` antes de julgar.
 */
export async function esperarArvore(sessao, antes, { desde = 0, tetoMs = 30000, assentarMs = 1500 } = {}) {
  const alvo = assinaturaDaArvore(antes);
  const t0 = Date.now();
  const ate = t0 + tetoMs;
  let atual = antes;
  const fim = (mudou) => ({ mudou, respondeu: roundTrips(sessao.eventos, desde).respondidos > 0,
                            ms: Date.now() - t0, arvore: atual });
  while (Date.now() < ate) {
    await espera(200);
    atual = await arvore(sessao);
    if (assinaturaDaArvore(atual) !== alvo) return fim(true);
    if (roundTrips(sessao.eventos, desde).respondidos > 0) {
      const limite = Math.min(Date.now() + assentarMs, ate);
      while (Date.now() < limite) {
        await espera(200);
        atual = await arvore(sessao);
        if (assinaturaDaArvore(atual) !== alvo) return fim(true);
      }
      return fim(false);
    }
  }
  return fim(false);
}

/**
 * EXPANDE um nó e devolve `{ no, abriu, filhos, mudou, ms, pulou }`. `abriu: false` sem `pulou` é
 * INFORMAÇÃO — o gesto pegou e a árvore ficou igual (a pasta é VAZIA).
 *
 * **Numa FOLHA não gesticula** (`temFilhos === false`): o duplo clique nela ACIONARIA a transação,
 * que é o oposto de "abrir" — aqui a guarda não é economia, é segurança. **Num nó já `EXPANDED`
 * também não**: o gesto é TOGGLE e o fecharia (medido, § acima). Sem a flag na tela
 * (`temFilhos === null`) o gesto sai.
 */
export async function expandirNo(sessao, alvo, { tetoMs = 30000 } = {}) {
  const antes = await arvore(sessao);
  if (!antes.sid) throw new Error('webgui: esta tela não tem árvore (nenhum GuiTree no DOM)');
  const no = acharNoDaArvore(antes.nos, alvo);
  if (no.temFilhos === false) return { pulou: true, no, abriu: false, mudou: false, filhos: [] };
  if (no.expansao === 'EXPANDED') {
    return { pulou: true, no, abriu: false, mudou: false, filhos: antes.nos.filter((x) => x.pai === no.n) };
  }
  const { desde } = await gesticularNo(sessao, no);
  const { mudou, respondeu, ms, arvore: depois } = await esperarArvore(sessao, antes, { desde, tetoMs });
  // ⚠️ o índice `n` é posicional e a expansão reindexa: reachar o nó pela CHAVE, sempre
  const agora = depois.nos.find((x) => x.chave === no.chave) ?? null;
  return { pulou: false, mudou, respondeu, ms, no, abriu: depois.nos.length > antes.nos.length,
           filhos: agora ? depois.nos.filter((x) => x.pai === agora.n) : [] };
}

/**
 * COLAPSA um nó — o MESMO duplo clique, contando com o toggle. Devolve `{ no, fechou, nosAntes,
 * nosDepois, mudou, respondeu, ms, pulou }`.
 *
 * **Só gesticula em `EXPANDED`.** Folha e `COLLAPSED` devolvem `{ pulou: true }` sem tocar em nada:
 * aqui não há o `action/9` idempotente da via HTTP (item 85) — repetir o gesto num nó fechado o
 * REABRIRIA, e numa folha ACIONARIA a transação.
 *
 * ⚠️ **A RAIZ não fecha por gesto — e este é o limite da via.** Medido (item 86, SMEN do s4h
 * 758/250, `raw/h3-nav-colapsar.json`): duplo clique em "Menu SAP" (`Root`) e em "Favoritos"
 * (`Favo`), as duas `EXPANDED`, **posta** (`action/2` `OnNodeDoubleClick`, o mesmo POST dos outros)
 * e a árvore fica IGUAL — 15 → 15 nós, ainda `EXPANDED`. O mesmo gesto num nó de nível 1
 * ("Escritório") fecha em 253 ms. Quem precisa encolher a árvore pela raiz — que é onde está o
 * ganho (29,5% do delta, item 85) — usa a via HTTP: lá o `action/9` fecha a `Root` (22 → 4 nós).
 * Aqui o resultado sai honesto e RÁPIDO: `{ fechou: false, respondeu: true }` em ~1,7 s, porque o
 * round-trip fecha a espera (§ `esperarArvore`).
 */
export async function colapsarNo(sessao, alvo, { tetoMs = 30000 } = {}) {
  const antes = await arvore(sessao);
  if (!antes.sid) throw new Error('webgui: esta tela não tem árvore (nenhum GuiTree no DOM)');
  const no = acharNoDaArvore(antes.nos, alvo);
  if (no.expansao !== 'EXPANDED') {
    return { pulou: true, no, fechou: false, mudou: false, nosAntes: antes.nos.length, nosDepois: antes.nos.length };
  }
  const { desde } = await gesticularNo(sessao, no);
  const { mudou, respondeu, ms, arvore: depois } = await esperarArvore(sessao, antes, { desde, tetoMs });
  const fechou = depois.nos.length < antes.nos.length;
  if (respondeu && !fechou) {
    detalhe(`webgui: colapsarNo — "${no.rotulo}" (${no.chave}) recebeu o duplo clique, o servidor respondeu e a árvore ficou igual`
      + (no.pai === -1 ? '; é uma RAIZ, e raiz não fecha por gesto nesta via — use o action/9 da via HTTP (its.colapsarNo)' : ''));
  }
  return { pulou: false, mudou, respondeu, ms, no, fechou,
           nosAntes: antes.nos.length, nosDepois: depois.nos.length };
}

/**
 * O duplo clique num nó: `{ no, mudou, ms }`. Numa FOLHA ele aciona — foi assim que o favorito
 * "Produção → … → Com material" levou o SMEN à CO01, em **54 s**; num nó com filhos ele expande (ou
 * fecha, se já estava aberto), e aí `mudou` também é `true` — a tela mexeu.
 *
 * ⚠️ O veredito aqui sai do CARIMBO da tela (é a troca de dynpro que interessa), com o teto em
 * `TETO_ARVORE`: 30 s não bastariam para a folha fria.
 */
export async function acionarNo(sessao, alvo, { tetoMs = TETO_ARVORE } = {}) {
  const a = await arvore(sessao);
  if (!a.sid) throw new Error('webgui: esta tela não tem árvore (nenhum GuiTree no DOM)');
  const no = acharNoDaArvore(a.nos, alvo);
  const antes = await carimbo(sessao);
  const t0 = Date.now();
  await gesticularNo(sessao, no);
  const mudou = await esperarMudanca(sessao, antes, { tetoMs });
  return { no, mudou, ms: Date.now() - t0 };
}

/**
 * Vai a uma tela pelo CAMINHO da árvore do SAP Easy Access — o caminho que o usuário funcional
 * descreve, e o único que enxerga os FAVORITOS:
 *
 * ```js
 * await navegarArvore(s, ['Menu SAP', 'Escritório', 'Agenda', 'Próprio']);
 * await navegarArvore(s, 'Menu SAP > Escritório', { acionar: false });   // só DESCOBRE os filhos
 * ```
 *
 * Ao contrário do menu da barra (`navegarMenu`), a árvore **não vem inteira**: cada nível fechado
 * custa um gesto (e um round-trip). O percurso se refaz por CHAVE a cada passo — o índice `n` é
 * posicional e a expansão reindexa tudo abaixo.
 *
 * ⚠️ **Rótulo com `>` dentro** (o favorito "Produção -> Controle de produção -> …"): o caminho em
 * string corta em `>`, então passe **array**.
 *
 * Devolve `{ caminho, passos, folha, expandidos, mudou }`; com `{ acionar: false }` devolve os
 * `filhos` do último nó, expandindo-o se ele ainda não tiver filhos visíveis.
 */
export async function navegarArvore(sessao, caminho, { acionar: aciona = true, tetoMs = 30000, tetoAcaoMs = TETO_ARVORE } = {}) {
  const partes = partirCaminhoDeMenu(caminho);
  const passos = [];
  const expandidos = [];
  const filhosDe = (a, pai) => (pai ? a.nos.filter((x) => x.pai === pai.n) : a.nos.filter((x) => x.pai === -1));
  let chave = null;
  for (const rotulo of partes) {
    let a = await arvore(sessao);
    if (!a.sid) throw new Error('webgui: esta tela não tem árvore (nenhum GuiTree no DOM) — o SAP Easy Access é o `/nSMEN`');
    let pai = chave === null ? null : a.nos.find((x) => x.chave === chave);
    let irmaos = filhosDe(a, pai);
    let alvo = acharItemDeMenu(irmaos, rotulo);
    if (!alvo && pai) {                       // o nó pode estar fechado: abrir UMA vez e reler
      const e = await expandirNo(sessao, { chave: pai.chave }, { tetoMs });
      if (!e.pulou) expandidos.push(pai.chave);
      a = await arvore(sessao);
      pai = a.nos.find((x) => x.chave === chave);
      irmaos = filhosDe(a, pai);
      alvo = acharItemDeMenu(irmaos, rotulo);
    }
    if (!alvo) throw new Error(`webgui: navegarArvore — "${rotulo}" não está sob ${chave ?? 'a raiz'}. Tenho: ${irmaos.map((x) => x.rotulo).join(' | ')}`);
    passos.push(alvo);
    chave = alvo.chave;
  }
  if (!aciona) {
    let a = await arvore(sessao);
    let folha = a.nos.find((x) => x.chave === chave);
    let filhos = filhosDe(a, folha);
    if (!filhos.length && folha?.temFilhos !== false) {   // um gesto — e a FOLHA não paga nenhum
      await expandirNo(sessao, { chave }, { tetoMs });
      expandidos.push(chave);
      a = await arvore(sessao);
      folha = a.nos.find((x) => x.chave === chave);
      filhos = folha ? filhosDe(a, folha) : [];
    }
    return { caminho: partes, passos, folha, filhos, expandidos, mudou: false };
  }
  const r = await acionarNo(sessao, { chave }, { tetoMs: tetoAcaoMs });
  return { ...r, caminho: partes, passos, folha: r.no, expandidos };
}
