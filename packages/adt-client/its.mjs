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
// Medido no s4h 758, mandante 250, em 04/09/2026 (fila adt-client, itens 7, 8, 20 e 22;
// docs/receita-webgui.md § O protocolo do ITS por HTTP puro):
//   • SE16 na T000, `txtMAX_SEL` de 200 → 2, `btn[8]` acionado: o título voltou
//     "Data Browser: Tabela T000  2 acertos" — o valor CHEGOU ao ABAP e mudou o resultado;
//   • OK-code por `value/okcd` + `vkey/0/ses[0]`: `/nSE16`, `ONLI`, `/8`, `/nSE38`, `/n`, `/nex`;
//   • o TECLADO (item 22): `vkey/<n>/ses[0]` com o MESMO número de tecla do SAP GUI — `tecla(s, 'F8')`
//     dispensa o okcd, leva o que foi preenchido no mesmo POST, e o sufixo `/ses[0]` é obrigatório;
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

import { createHash } from 'node:crypto';
import { passo, detalhe, aviso, http as logHttp } from './log.mjs';
import { encerrarSessao } from './sap-connection.mjs';
import {
  urlWebgui, autorizacao, interpretarSonda, okcodeDe, campoDoSid, janelaDoSid, OKCODES,
  montarTela, sidDoLsdata, rotuloLimpo, teclaDoBotao, sidsDaTela,
  interpretarItemDeMenu, partirCaminhoDeMenu, acharItemDeMenu, filhoDiretoDeMenu, daBarraDeMenu,
  acharCaminhoDeMenu,
  TETO_ARVORE, indiceDoNo, containerDaArvore, arvoreDosBrutos, acharNoDaArvore, agregarMudou,
  criarPilhaDeDesfazer, transacional,
} from './webgui.mjs';

// A pilha de desfazer e o `transacional` são das DUAS vias e o código é UM só (fila `adt-client`
// item 66): eles só compõem callbacks — não sabem de CDP nem de HTTP —, então vêm importados do
// webgui.mjs como o `montarTela`, e são REEXPORTADOS aqui para trocar de via continuar sendo
// trocar o import. O que é por via é a instância (uma por sessão) e o MOMENTO de rodá-la: ver o
// `fechar` no fim deste arquivo.
export { janelaDoSid, criarPilhaDeDesfazer, transacional };

// As puras da ÁRVORE são das duas vias pelo mesmo motivo (item 86): elas só cruzam `nodeindexes`,
// `TV` e estado de expansão — não sabem de onde os brutos vieram. Ver a seção da árvore no fim
// deste arquivo (a via HTTP) e a do `webgui.mjs` (a via do navegador).
export { TETO_ARVORE, indiceDoNo, containerDaArvore, arvoreDosBrutos, acharNoDaArvore, agregarMudou };

// ---------- o vocabulário do protocolo (PURO) ----------

/** O SID da caixa de comando — o mesmo em toda tela medida (`GuiOKCodeField`). */
export const OKCD = 'wnd[0]/tbar[0]/okcd';
/** Fecha todo batch: pede o estado da tela. */
export const ESTADO = { get: 'state/ur' };
/** O boot — o primeiro POST, que monta a dynpro. ⚠ ação nele é PERDIDA. */
export const BOOT = [ESTADO];
/** `vkey/0/ses[0]` é o Enter — o que SUBMETE o OK-code e o que avança a dynpro (§ `VKEYS`). */
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
/**
 * O TECLADO deste canal — o `n` do `vkey/<n>` é o MESMO número de tecla de função do SAP GUI.
 *
 * Medido no s4h 758/250 em 04/09/2026 (fila adt-client, item 22; evidência em
 * `sap-accelerate/work/POC_webgui_vkey/medicoes/mapa-vkey.md`), cada tecla numa sessão nova, na
 * SE16 da T000. A tecla é o endereço mais ESTÁVEL do canal: não depende de `btn[n]` (que muda de
 * barra) nem do fcode da dynpro, e DISPENSA a caixa de comando — `vkey/8` sozinho executou a mesma
 * lista que `acionar('Executar')` e que o OK-code `/8`.
 *
 * ⚠️ Isto é o MEDIDO, não a convenção inteira do SAP GUI. Tecla fora daqui vai crua pelo número:
 * `vkey(s, 21)` — para MEDIR, não para afirmar.
 */
export const VKEYS = {
  Enter: { n: 0, apelidos: ['Continuar'], medido: 'submete o OK-code e avança a dynpro (item 8)' },
  F3: { n: 3, apelidos: ['Voltar'], medido: 'da lista ALV → tela de seleção; de novo → "Data Browser: 1ª tela"' },
  F4: { n: 4, apelidos: ['Ajuda de pesquisa'], medido: 'com o foco em DATABROWSE-TABLENAME abriu POPUP (wnd[1]) — é o `FieldHelpPress` que a própria tela declara' },
  F8: { n: 8, apelidos: ['Executar'], medido: 'na seleção da SE16 → "Data Browser: Tabela T000  5 acertos", igual ao botão Executar' },
  F11: { n: 11, apelidos: ['Gravar', 'Ctrl+S'], medido: 'na seleção da SE16 → "Atributos variante" (SAPLSVAR) — a função Gravar daquela tela' },
  F12: { n: 12, apelidos: ['Cancelar', 'Escape'], medido: 'da lista → tela de seleção; da seleção → "Data Browser: 1ª tela"' },
  'Shift+F3': { n: 15, apelidos: ['Encerrar', 'Sair'], medido: 'da seleção → "Data Browser: 1ª tela" NUM SALTO (F3 dali levaria dois)' },
};

/** PURO: o número da tecla. Número passa direto (inclusive o não medido); nome e apelido saem do
 * `VKEYS`, sem diferenciar caixa. Nome desconhecido estoura AQUI, com o que existe. */
export function numeroDaTecla(tecla) {
  if (typeof tecla === 'number' && Number.isInteger(tecla) && tecla >= 0) return tecla;
  const t = String(tecla ?? '').trim();
  if (/^\d+$/.test(t)) return Number(t);
  const chave = t.toLowerCase().replace(/\s+/g, '');
  for (const [nome, v] of Object.entries(VKEYS)) {
    if (nome.toLowerCase() === chave || v.apelidos.some((a) => a.toLowerCase() === chave)) return v.n;
  }
  throw new Error(`its: tecla desconhecida "${tecla}" — medidas: ${Object.keys(VKEYS).join(', ')} (número cru também vale: vkey(s, 21))`);
}

/** PURO: a tecla virtual `vkey/<n>/ses[0]`. ⚠ O sufixo `/ses[0]` é OBRIGATÓRIO — medido: `vkey/8`
 * sem ele volta `multipart -1002 <control-id> is expected`. */
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
 * `~transaction` quer), a `janela` dona (`wnd[0]`, `wnd[1]` — o delta traz as DUAS quando há
 * popup) e, quando é botão, o `okcode` (`btn[8]`). A ordem é a do documento; SID repetido (o
 * mesmo controle em dois blocos) fica uma vez só.
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
          sid: SID, tipo: Type ?? null, campo: campoDoSid(SID), janela: janelaDoSid(SID),
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
    // ⚠️ delta PARCIAL: só um controle mudou, e o corpo NÃO traz `sap.its.aParams` (nem `cuatitle`,
    // `ScreenId`, `dynpro`). É o que a resposta do `batchFragmento` do ALV é. Medido no s4h em
    // 04/09/2026: tomá-lo pela tela zera `sids`, `titulo` e `grids` para o resto da sessão —
    // o `postar` guarda esse corpo em `sessao.parcial` e não mexe na tela.
    parcial: forma === 'delta' && !/sap\.its\.aParams/.test(s),
    titulo: paramDe(s, 'cuatitle'), screenId: paramDe(s, 'ScreenId'), dynpro: paramDe(s, 'dynpro'),
    tcode: paramDe(s, 't-code'), dnum: paramDe(s, 'd-num'), moin: paramDe(s, 'moin'),
    // ⚠️ `temPopup` é um FAREJADOR do CORPO, não o estado da tela: "este delta-update declara
    // alguma `wnd[n>0]`". Custa ~0 ms (regex) contra os 8–17 ms de `controlesDoDelta` num delta de
    // 300 KB, e por isso fica aqui — mas ele MENTE por omissão em `multipart`, que não tem SIDs
    // nenhum: medido em 06/09/2026 (item 83) que um `action/4` recusado com a modal na frente volta
    // `temPopup: false` **com a modal ainda aberta**. Quem quer o estado da TELA lê `lerTela(s).popup`
    // (o objeto, com título e botões) ou o `janela` que o `postar` devolve.
    // Até 06/09/2026 isto se chamava `popup` — o mesmo nome do OBJETO do `lerTela`, e `r.popup?.sid`
    // dava `undefined` em silêncio. O nome mudou para a colisão não voltar.
    temPopup: /"SID":"wnd\[[1-9]\d*\]"/.test(s),   // wnd[1] no mesmo delta-update (medido: /o, /nend)
    motivo: forma === 'delta' ? null
      : forma === 'multipart' ? (erros.map((e) => `${e.codigo} ${e.status}`).join('; ') || 'X-Code 0 em tudo — nada mudou')
      : forma === 'logoff' ? 'sessão encerrada pelo logoff'
      : `${status ?? '?'} ${s.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
  };
}

/**
 * PURO: a BARRA DE MENSAGEM que os SIDs declaram — `{ tipo, texto }`, ou `null` quando a tela não
 * tem mensagem. O `tipo` é a CONSTANTE do SAP (`OK`, `ERROR`, `WARNING`), não o texto traduzido
 * que o `messageType` do lsdata às vezes traz.
 *
 * ⚠ O tipo NÃO é veredito. Medido no s4h 758/250 em 05/09/2026 (item 59, bruto
 * `POC_webgui_popup/medicoes/raw/h-vkey12.txt`): a recusa do F12 dentro do SPOP veio como
 * `messageType: "OK"` com o texto "Não se pode selecionar código de função" — tipo de SUCESSO
 * num texto de recusa. Quem diz se a tela mudou é o `carimbo`; a mensagem diz o que o ABAP teve
 * a comentar.
 */
export function mensagemDosSids(sids = []) {
  const m = sids.find((x) => x.tipo === 'MESSAGEBAR' && x.applicationText);
  return m ? { tipo: m.messageType || null, texto: m.applicationText } : null;
}

/**
 * PURO: o CARIMBO da tela — a assinatura que se compara ANTES × DEPOIS para saber se a ação MUDOU
 * alguma coisa. É o par desta via para o `carimbo` do webgui.mjs (lá é o DOM; aqui, o delta).
 * Legível na frente (`SE38/SAPLWBABAP/0100 wnd[1] "Editor ABAP: 1ª tela"`), hash dos SIDs atrás.
 *
 * Entra: a identidade da dynpro (`t-code`/`dynpro`/`d-num`/`cuatitle`), a JANELA ATIVA (é o que
 * denuncia popup aberto/fechado) e TODOS os SIDs com o `lsdata` que carregam — o valor de cada
 * campo, o rótulo, o estado de cada botão.
 *
 * **Fica de fora a BARRA DE MENSAGEM**, e isso é medido, não gosto. Nos brutos do item 23
 * (s4h 758/250, 05/09/2026), `f0-nend.txt` (SPOP "Efetuar logoff" aberto) × `h-vkey12.txt`
 * (F12 depois dele) têm os MESMOS 198 SIDs e a ÚNICA diferença de `lsdata` em toda a tela é
 * `wnd[0]/sbar_msg` — a mensagem é o comentário do ABAP sobre a ação, não a tela. Com ela dentro
 * do carimbo, "apareceu uma mensagem de recusa" contaria como "a tela mudou", que é exatamente o
 * falso positivo que este carimbo existe para desfazer.
 *
 * E o carimbo é ESTÁVEL: no controle da mesma medição (`i58-c-nse38-spop.txt` × `i58-d-estado.txt`,
 * dois POSTs na mesma tela) os 223 SIDs vieram byte a byte iguais — nenhum contador, nenhum
 * carimbo de tempo dentro do `lsdata`.
 */
export function carimboDosSids(sids = [], { dynpro = null, tcode = null, dnum = null, titulo = null } = {}) {
  const corpo = sids
    .filter((x) => x.tipo !== 'MESSAGEBAR')
    .map((x) => JSON.stringify(x))
    .sort()
    .join('\n');
  const h = createHash('sha1').update(corpo).digest('hex').slice(0, 16);
  return `${tcode ?? '?'}/${dynpro ?? '?'}/${dnum ?? '?'} ${janelaAtiva(sids)} "${titulo ?? ''}" #${h}`;
}

/**
 * PURO: o veredito de MUDANÇA da tela — `true`, `false` ou `null` (não dá para dizer), a partir da
 * FORMA da resposta e dos carimbos ANTES × DEPOIS:
 *
 *   `delta` inteiro      — o carimbo decide; sem carimbo ANTES (o boot) não há o que comparar → `null`
 *   `delta` parcial      — o fragmento do ALV NÃO é a tela → `null`
 *   `multipart`          — o protocolo recusou, nada mudou → `false`
 *   `logoff`             — a sessão acabou: mudou o máximo que dava → `true`
 *   `sem-sessao`/`outra` — não houve tela para comparar → `null`
 *
 * ⚠ **`mudou` NÃO é `pegou`.** `pegou` é o veredito do PROTOCOLO (a forma da resposta: o servidor
 * aceitou o POST?); `mudou` é o veredito da TELA (aconteceu alguma coisa?). Os dois discordam, e é
 * exatamente aí que mora o item 59: `pegou: true, mudou: false` é "o servidor aceitou e não fez
 * nada" — medido no s4h 758/250 em 05/09/2026 com o F12 dentro do SPOP "Efetuar logoff" (delta de
 * 226 KB, `pegou: true`, popup ainda lá). Quem precisa saber que a ação SURTIU EFEITO lê o `mudou`.
 */
export function mudouDaTela(lida, antes, depois) {
  if (lida.forma === 'multipart') return false;
  if (lida.forma === 'logoff') return true;
  if (lida.forma !== 'delta' || lida.parcial) return null;
  if (antes === null || antes === undefined) return null;   // o boot: não havia tela antes
  return depois !== antes;
}

/** PURO: o carimbo de um `delta-update` inteiro — o `carimboDosSids` sobre o corpo cru. */
export const carimboDoDelta = (corpo) => (/<delta-update/i.test(String(corpo ?? ''))
  ? carimboDosSids(sidsDaResposta(corpo), {
      dynpro: paramDe(corpo, 'dynpro'), tcode: paramDe(corpo, 't-code'),
      dnum: paramDe(corpo, 'd-num'), titulo: paramDe(corpo, 'cuatitle'),
    })
  : null);

const TIPOS_DE_ENTRADA = new Set(['GuiCTextField', 'GuiTextField', 'GuiPasswordField', 'GuiComboBox', 'GuiCheckBox', 'GuiRadioButton']);

/**
 * PURO: a janela ATIVA da tela — a `GuiModalWindow` de MAIOR índice que os SIDs declaram, ou
 * `wnd[0]` quando não há nenhuma.
 *
 * Medido em 04/09/2026 sobre os deltas do s4h 758/250 (POC_webgui_okcode/medicoes/raw/*): sem
 * popup NENHUMA janela se declara (a `wnd[0]`/`GuiMainWindow` mora no shell do GET, não no
 * delta), e cada modal aberta se declara com o próprio `wnd[n]`/`GuiModalWindow` — uma em
 * `d2-o.txt`, DUAS empilhadas (`wnd[1]` e `wnd[2]`) em `d2-ose16.txt`. Daí a regra ser o maior
 * índice declarado, e não "existe popup".
 */
export function janelaAtiva(sids = []) {
  let ativa = null, alto = -1;
  for (const x of sids) {
    if (x.tipo !== 'GuiModalWindow') continue;
    const n = indiceDaJanela(x.sid);
    if (n > alto) { alto = n; ativa = x.sid; }
  }
  return ativa ?? 'wnd[0]';
}

/**
 * PURO: o `n` de `wnd[n]` no começo de um SID — `-1` quando não há. Empilhar modal pede ORDEM, e a
 * ordem do MARKUP não é ela: no delta de duas modais a `wnd[1]` vem antes da `wnd[2]`, mas quem
 * manda na tela é a `wnd[2]`.
 */
const indiceDaJanela = (sid) => Number(/^wnd\[(\d+)\]/.exec(String(sid ?? ''))?.[1] ?? -1);

/**
 * PURO: o SID de um alvo, contra os SIDs da tela atual. Quatro formas:
 *   `'wnd[0]/usr/txtMAX_SEL'` ou `{ sid }` — o endereço, passa como está;
 *   `{ campo: 'MAX_SEL' }` ou `'MAX_SEL'`   — o nome do campo (o mesmo da URL `~transaction`);
 *   `{ okcode: 'btn[8]' }`, `'btn[8]'`, `8`, `'Executar'` — o botão pelo OK-code (as três
 *   formas do `okcodeDe`), casado pelo FIM do SID (`…/tbar[1]/btn[8]`) — a barra não se adivinha.
 * Não achar estoura AQUI, com o que a tela TEM — não vira `-101` sem explicação.
 *
 * ⚠ O alvo é resolvido DENTRO DE UMA JANELA. Com popup aberto o delta traz as duas barras — a da
 * `wnd[1]` E a da `wnd[0]`, que continua atrás do modal — e o mesmo `btn[n]` existe nas duas
 * (medido em `d2-o.txt`: 17 botões, 13 da `wnd[0]` e 4 da `wnd[1]`, `btn[0]` e `btn[14]` em
 * ambas). Sem escopo isso resolvia pelo PRIMEIRO da lista, isto é, pela ordem do markup
 * (`webguiPopups` antes de `cuaarea`) — acaso, não regra. Aqui vence a `janelaAtiva`; `{ janela:
 * 'wnd[0]' }` pede outra explicitamente, e o SID inteiro continua passando direto.
 */
export function sidDoAlvo(sids = [], alvo, { janela = null } = {}) {
  if (alvo === null || alvo === undefined || alvo === '') throw new Error('its: informe o alvo — SID, { campo }, ou { okcode }');
  if (typeof alvo === 'object' && alvo.sid) return alvo.sid;
  if (typeof alvo === 'string' && /^wnd\[\d+\]/.test(alvo)) return alvo;
  const campo = typeof alvo === 'object' ? alvo.campo : null;
  const okBruto = typeof alvo === 'object' ? alvo.okcode : null;

  if (campo) return sidDoCampo(sids, campo, janela);
  if (okBruto !== null && okBruto !== undefined) return sidDoBotao(sids, okBruto, janela);
  if (typeof alvo === 'number' || /^btn\[\d+\]$/i.test(String(alvo))) return sidDoBotao(sids, alvo, janela);
  // string solta: primeiro apelido de botão (Gravar, Executar…), senão nome de campo. ⚠ o `catch`
  // é só do `okcodeDe`: apelido conhecido que a tela não tem estoura como BOTÃO, com as janelas —
  // engolir isso devolvia `campo "Executar" não está na tela`, que manda procurar a coisa errada.
  let okApelido = null;
  try { okApelido = okcodeDe(alvo); } catch { /* não é botão conhecido — é nome de campo */ }
  if (okApelido) return sidDoBotao(sids, okApelido, janela);
  return sidDoAlvo(sids, { campo: String(alvo) }, { janela });
}

function sidDoCampo(sids, campo, janela) {
  const desses = sids.filter((x) => TIPOS_DE_ENTRADA.has(x.tipo));
  return escolherNaJanela(sids, desses, desses.filter((x) => x.campo === campo), janela, {
    alvo: `campo "${campo}"`, nomear: (x) => x.campo,
  });
}

function sidDoBotao(sids, alvo, janela) {
  const okcode = okcodeDe(alvo);
  const desses = sids.filter((x) => x.tipo === 'GuiButton' && x.okcode);
  return escolherNaJanela(sids, desses, desses.filter((x) => x.okcode === okcode), janela, {
    alvo: `botão ${okcode}`, nomear: (x) => `${x.okcode}${OKCODES[x.okcode] ? `=${OKCODES[x.okcode].nome}` : ''}`,
  });
}

/**
 * PURO: entre os candidatos de um alvo, o da JANELA certa — e, quando não dá para decidir, um erro
 * que mostra os candidatos janela a janela em vez de escolher no escuro.
 *   `janela` pedida → só ela conta (não achar ali é erro, mesmo que o alvo exista em outra);
 *   sem `janela`   → vence a `janelaAtiva`; candidato só FORA dela não é clicado por baixo do
 *                    modal — é erro que diz onde ele está e como pedi-lo.
 * Mais de um candidato na mesma janela (duas barras) também é erro: o SID inteiro desempata.
 * ⚠ `sids` é a tela INTEIRA (é dela que sai a janela ativa — a modal se declara fora do tipo do
 * alvo); `todos` são só os do tipo do alvo, e é o que a mensagem lista.
 */
function escolherNaJanela(sids, todos, candidatos, janela, { alvo, nomear }) {
  const ativa = janelaAtiva(sids);
  const pedida = janela ? (janelaDoSid(janela) ?? String(janela)) : null;
  const escopo = pedida ?? ativa;
  const dentro = candidatos.filter((x) => janelaDoSid(x.sid) === escopo);
  if (dentro.length === 1) return dentro[0].sid;
  const fora = candidatos.filter((x) => janelaDoSid(x.sid) !== escopo);
  const listar = (lista) => lista.map(nomear).join(', ') || '(nenhum)';
  if (dentro.length > 1) {
    throw new Error(`its: ${alvo} está ${dentro.length}× em ${escopo} — ${dentro.map((x) => x.sid).join(', ')}; enderece pelo SID inteiro`);
  }
  if (fora.length) {
    const onde = fora.map((x) => x.sid).join(', ');
    throw new Error(`its: ${alvo} não está em ${escopo}${pedida ? '' : ' (a janela ativa)'} — está em ${onde}; `
      + `${escopo} tem ${listar(todos.filter((x) => janelaDoSid(x.sid) === escopo))}. Se é a outra janela mesmo, peça { janela: '${janelaDoSid(fora[0].sid)}' }`);
  }
  const aqui = todos.filter((x) => janelaDoSid(x.sid) === escopo);
  const outras = todos.filter((x) => janelaDoSid(x.sid) !== escopo);
  throw new Error(`its: ${alvo} não está na tela — tenho ${listar(aqui)}`
    + (outras.length ? ` em ${escopo}, e ${listar(outras)} nas outras janelas (${[...new Set(outras.map((x) => janelaDoSid(x.sid)))].join(', ')})` : ''));
}

// ---------- a tela do delta-update (PURO) ----------
//
// O `delta-update` é a tela inteira como HTML dentro de `<![CDATA[…]]>`, um bloco por região
// (`cuaarea` = barras, `userpanel` = a dynpro (`wnd[0]/usr`), `msgarea` = a barra de mensagens,
// `webguiPopups` = o popup). Medido no s4h 758/250 em 04/09/2026 (sap-accelerate/work/POC_webgui_okcode
// e POC_webgui_its_lib, medicoes/raw/*): TODO POST que volta `delta` traz a tela inteira — o boot
// (288 KB), um `enviar` só com `focus`+`value` (288 KB), o `/nSE38` (246 KB) — não um diff.
//
// ⚠️ `steploop0` NÃO é a dynpro. Nos 12 brutos varridos (POC_webgui_okcode e POC_webgui_popup,
// medicoes/raw/*) ele é SEMPRE a MESMA casca de 119 bytes — `<div id="steploop0" ct="PLP"
// class="lsPagelayout__panel lsPagelayout__panel--end"></div>` — com popup e sem popup, na SE16, na
// SE38 e no SMEN. Ele não "esvazia": nunca teve nada. Os campos moram no `userpanel`.
//
// ⚠️ O POPUP NÃO tira a `wnd[0]/usr` do delta — a afirmação contrária, do item 21, caiu na medição
// do item 98 (06/09/2026), reprocessando os brutos com `telaDoDelta`, sem tocar a rede:
//   SE16/T000 com SPOP (`i58-b-nend.txt`) e com `/o` (`b-o.txt`) → 34 campos, e o `userpanel` traz
//   os MESMOS 85 SIDs `wnd[0]/usr` do sem-popup (`c2-t000.txt`, 34 campos);
//   SE38 com `/nend` (`f0-nend.txt`) e com F12 no SPOP (`h-vkey12.txt`) → 1 campo e 11 SIDs, como o
//   `c4-nse38.txt` sem popup.
// Quem lê a tela com popup aberto lê a `wnd[0]` ATRÁS do modal: `campos` é dela, `botoes` traz as
// duas barras, e o conteúdo da modal está em `popup`.
//
// O ÚNICO caso medido em que o bloco `userpanel` não veio no delta é o SMEN (SAP Easy Access) com
// popup (`d2-o.txt`, `d2-ose16.txt`, `d3-nend.txt`) — e ali isso não muda leitura nenhuma: o SMEN dá
// 0 campos COM e SEM popup (`c5-n.txt` e `c0-boot.txt` trazem o `userpanel`, 7 SIDs `wnd[0]/usr`,
// nenhum de entrada), porque o menu é árvore, não dynpro. Foi daí que veio a leitura de 0 do item
// 21. Por que o `userpanel` some no SMEN com popup: NÃO medido.
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

/** PURO: o JSON de um atributo do renderer (`lsdata`, `lsevents`) — ou `null` se não parsear. */
function jsonDoAtributo(bruto) {
  if (!bruto) return null;
  try { return JSON.parse(decodificarEntidades(bruto)); } catch { /* entidade que virou aspa */ }
  try { return JSON.parse(bruto); } catch { return null; }
}

/**
 * PURO: os controles de um trecho de HTML do ITS — todo elemento com `ct`, no MESMO formato que o
 * `JS_DESPEJO_CONTROLES` do webgui.mjs despeja do DOM: `{ id, ct, lsdata, lsevents, title, aria,
 * accesskey, valor, desabilitado, somenteLeitura, texto, visivel }`.
 *
 * O `lsdata` diz o que o controle É; o `lsevents` diz o que ele FAZ — evento a evento, o comando do
 * protocolo que o dispara (`{"Press":[{},{"1":"action/3",…}]}`, § De onde sai o COMANDO da receita).
 * Sai como JSON parseado, igual ao `lsdata`, e `null` quando o controle não publica nenhum — medido
 * (fila 44) em 334 de 1532 controles dos 4 raws do POC_webgui_its_lib, o MESMO total que o `grep` do
 * atributo no bruto acha (119/119, 48/48, 119/119, 48/48): a via HTTP não perde nenhum.
 *
 * É um scanner de tags com pilha (não um parser de HTML): `texto` é o que o `innerText` seria — os nós de texto do elemento e dos filhos,
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
        lsdata: jsonDoAtributo(attrs.lsdata),
        lsevents: jsonDoAtributo(attrs.lsevents),
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

// ---------- o COMBOBOX que a tela DECLARA (item 114) ----------
//
// O `ct="CB"` do ITS não é um `<select>`: é um `<input readonly>` que mostra o TEXTO da opção
// corrente, e a lista de opções vem SEPARADA — no MESMO delta, como um `<div ct="LIB_PS" id="…">`
// com um `<div ct="LIB_I" data-itemkey="…" data-itemvalue2="…">` por opção. O elo entre os dois é
// o `aria-controls` do input, que é o `id` da lista.
//
// Medido no s4h 758/250 em 06/09/2026 (item 114, `work/POC_webgui_combo/medicoes/item114-combo.md`),
// no combo `cmbGS_EXPORT-FORMAT` do popup *Export As* do `btn[43]` — que, ao contrário do combo da
// via `btn[45]`→radio do item 73, tem DUAS opções, e portanto escolha de verdade a fazer.
// **O que se posta em `value/<SID>` é a CHAVE (`data-itemkey`), nunca o texto:**
//   • `csv-LEAN-STANDARD`                    → `delta`, e o combo voltou com `lsdata[4]` = a chave
//     e `lsdata[5]`/`value` = "File separado por vírgula (*.csv)" — quem traduz é o SERVIDOR;
//   • "File separado por vírgula (*.csv)"    → `multipart` `-107 failed to set value: invalid value`;
//   • "BANANA"                               → o MESMO `-107`.
// O combo VALIDA do outro lado: só chave da lista passa, e o texto que a tela mostra é recusado
// igual a lixo. Daí `preencher` traduzir texto→chave AQUI (§ `preencher`).
//
// E a escolha CHEGA ao ABAP, não fica no eco da tela: com `csv-LEAN-STANDARD` no combo, o ITSDoc do
// "Exportar para..." virou `DefExt: 'csv'`, `Filter: 'csv file (*.csv)|*.csv|'`, e o arquivo saiu
// CSV UTF-8 com BOM (156 528 B) em vez do XLSX (assinatura `50 4b 03 04`, 88 061 B) do default.
//
// ⚠ Um `value` recusado derruba o batch INTEIRO: o `-107` veio como `multipart`, sem `delta` —
// o `focus`, o `value` e o `state/ur` do mesmo POST não produziram tela. Nada mudou, e a tela
// anterior continua valendo.
// ⚠ O `aria-activedescendant` da lista NÃO acompanha a escolha (medido: continuou no `xlsx` com o
// combo já em `csv`) — ele é o primeiro item, não o corrente. Quem diz o corrente é o `lsdata`.
// ⚠ **A opção corrente pode ser MEMÓRIA DO USUÁRIO, não constante da tela.** Medido na mesma POC:
// depois de EXPORTAR uma vez em `csv`, toda sessão nova abriu o Export As já em `csv` — e voltou a
// `xlsx` só depois de exportar em `xlsx` de novo (escolher sem exportar não gravou nada). Quem
// depende do default está dependendo do que aquele usuário fez por último naquele sistema; para ter
// formato certo, escolha-o (fila `adt-client` item 175).

const RE_INPUT_CB = /<input\b([^>]*\bct="CB"[^>]*)>/g;
const RE_DIV_LIB_I = /<div\b([^>]*\bct="LIB_I"[^>]*)>/g;

/**
 * PURO: as OPÇÕES de uma lista do renderer (`<div ct="LIB_PS" id="<lista>">`) — `{ indice, chave,
 * texto }` por `<div ct="LIB_I">` dentro dela, na ordem do markup. `null` quando o delta não trouxe
 * aquela lista. A `chave` é o `data-itemkey` (o que se posta); o `texto` é o `data-itemvalue2` (o
 * que a tela mostra).
 */
export function opcoesDaLista(corpo, lista) {
  const s = String(corpo ?? '');
  // as listas são IRMÃS no markup (uma por combo): a desta vai do fim da sua tag até a próxima
  const re = /<div\b([^>]*\bct="LIB_PS"[^>]*)>/g;
  let m, de = -1, ate = -1;
  while ((m = re.exec(s))) {
    if (de >= 0) { ate = m.index; break; }
    if (decodificarEntidades(atributosDe(m[1]).id ?? '') === lista) de = re.lastIndex;
  }
  if (de < 0) return null;
  const trecho = s.slice(de, ate < 0 ? s.length : ate);
  return [...trecho.matchAll(RE_DIV_LIB_I)].map((m) => {
    const a = atributosDe(m[1]);
    return { indice: Number(a['data-itemindex']), chave: decodificarEntidades(a['data-itemkey'] ?? ''),
             texto: decodificarEntidades(a['data-itemvalue2'] ?? '') };
  });
}

/**
 * PURO: os COMBOS de um delta — um por `<input ct="CB">`, com o que ele mostra AGORA e o cardápio
 * inteiro: `{ sid, id, lista, chave, texto, opcoes }`.
 *
 * O `texto` é o `value` do input (o que está escrito na caixa). A `chave` sai do `lsdata` **pelo
 * conteúdo, não por índice**: é o valor que também é `data-itemkey` de alguma opção da lista — a
 * mesma disciplina do `sidDoLsdata` (o índice do `lsdata` muda de tela para tela). Sem lista no
 * delta, `opcoes` e `chave` vêm `null`: sobra o texto, e escolher vira chute — que é o que este
 * item existe para tirar do caminho.
 */
export function combosDoDelta(corpo) {
  const s = String(corpo ?? '');
  return [...s.matchAll(RE_INPUT_CB)].map((m) => {
    const a = atributosDe(m[1]);
    const lista = a['aria-controls'] ? decodificarEntidades(a['aria-controls']) : null;
    const opcoes = lista ? opcoesDaLista(s, lista) : null;
    const chaves = new Set((opcoes ?? []).map((o) => o.chave));
    const ls = jsonDoAtributo(a.lsdata);
    return {
      sid: sidDoLsdata(ls)?.SID ?? null,
      id: a.id ? decodificarEntidades(a.id) : null,
      lista,
      chave: Object.values(ls ?? {}).find((v) => typeof v === 'string' && chaves.has(v)) ?? null,
      texto: decodificarEntidades(a.value ?? ''),
      opcoes,
    };
  });
}

/** PURO: o combo de um SID, entre os `combosDoDelta` — `null` quando aquele SID não é combo. */
export const comboDoSid = (combos = [], sid) => combos.find((c) => c.sid === sid) ?? null;

/**
 * PURO: **o que POSTAR** num combo para escolher `opcao` — sempre uma `chave` da lista.
 * Aceita a chave (`'csv-LEAN-STANDARD'`), o texto que a tela mostra (`'File separado por vírgula
 * (*.csv)'`, sem diferenciar caixa nem espaço de sobra) ou o índice (`1`).
 *
 * Fora da lista estoura AQUI, com o cardápio — em vez de virar o `-107 invalid value` mudo do outro
 * lado. Combo SEM lista no delta passa o valor cru: não há contra o que conferir, e recusar seria
 * afirmar mais do que se mediu.
 */
export function chaveDaOpcao(combo, opcao) {
  const opcoes = combo?.opcoes;
  const cru = String(opcao ?? '');
  if (!opcoes?.length) return cru;
  if (typeof opcao === 'number' && Number.isInteger(opcao)) {
    const porIndice = opcoes.find((o) => o.indice === opcao);
    if (porIndice) return porIndice.chave;
  }
  const normal = (t) => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const achada = opcoes.find((o) => o.chave === cru)
    ?? opcoes.find((o) => normal(o.texto) === normal(cru))
    ?? opcoes.find((o) => normal(o.chave) === normal(cru));
  if (achada) return achada.chave;
  const cardapio = opcoes.map((o) => `${o.indice}: ${o.chave} "${o.texto}"`).join(', ');
  throw new Error(`its: "${cru}" não é opção do combo ${combo.sid ?? combo.id ?? '?'} — as opções são ${cardapio}`
    + ' (o que se posta é a CHAVE; o texto da tela o servidor recusa com -107)');
}

// ---------- o DISPARO que a tela DECLARA (item 71) ----------
//
// O `batchAcionar` posta `action/3/<SID>` em TUDO: é o `Press` do botão, e só. Mas cada controle
// declara, no `lsevents`, o comando que cada um dos seus eventos dispara (`{"Press":[{},
// {"1":"action/3",…}]}`) — o item 44 mediu que a via HTTP lê esse mapa inteiro (334/334 atributos
// nos 4 raws) e que ele é IGUAL ao que o navegador lê (56/56 controles da mesma SE38). O que
// faltava era a COMPOSIÇÃO: virar o comando declarado em passos de batch.
//
// ⚠️ A composição é por FAMÍLIA, não por concatenação (item 24 + os achados desta medição):
//
//   | comando declarado          | vira                                          | medido em |
//   |----------------------------|-----------------------------------------------|-----------|
//   | `action/<n>`               | `action/<n>/<SID>`                            | itens 7, 49 |
//   | `value`                    | `focus/<SID>` + `value/<SID>` + `content`     | item 7 |
//   | `focus`                    | `focus/<SID>` + `logic: ignore`               | item 7 |
//   | `okcode/ses[0]`            | como está + `content`                          | item 8 |
//   | `vkey/<n>/ses[0]`          | como está                                      | item 8 |
//   | **`vkey/<n>` SEM sufixo**  | **`focus/<SID>` + `vkey/<n>/ses[0]`**          | item 22 |
//   | **`action/1/wnd[0]/sbar`** | **como está** (traz o alvo, e é OUTRO SID)     | item 44 |
//
// As duas últimas linhas são as que derrubam o executor ingênuo. `vkey/8` cru volta `-1002
// <control-id> is expected`: o alvo do teclado é a SESSÃO, e o campo entra pelo `focus` anterior no
// mesmo batch. E o `ActivateHelp` do `ct=MB` publica `action/1/wnd[0]/sbar` — já endereçado, e ao
// `wnd[0]/sbar`, não ao `wnd[0]/sbar_msg` do próprio elemento. Por isso a detecção de "já
// endereçado" (`/wnd[` no meio, ou `/ses[0]` no fim) vem ANTES de concatenar SID nenhum.
//
// ⚠️ **Nada aqui POSTA.** Estas funções são puras — bruto + nome do evento → passos do batch. A
// composição de `action/3`, `action/4`, `value`, `focus`, `okcode/ses[0]` e `vkey/*` está medida
// (acima); a dos demais `action/<n>` que o mapa traz (`1`, `2`, `25`, `64`–`68`) é PRESUMIDA pela
// família — nenhum deles foi postado. A contra-prova de execução é o item 43 da fila.

/**
 * PURO: o SID que um controle despejado carrega — o endereço dele no protocolo.
 *
 * ⚠ Não é o `id` do markup, e não é uma chave `SID` de topo: ele mora ANINHADO no `lsdata`, num
 * índice numérico que varia por tipo de controle (é o `sidDoLsdata` do webgui.mjs que o acha).
 *
 * Medido em 05/09/2026 (item 71) sobre os 5 raws de `POC_webgui_its_lib` e `POC_webgui_okcode`:
 * dos **392 controles que publicam `lsevents`, 387 trazem exatamente UM par aninhado**
 * `{ SID, Type }` — índice `27` no botão (`ct=B`), `21` no campo (`CBS`), `5` no menu (`POMN`),
 * `19` no rótulo (`L`), `13` no radio (`R_standards`), `11` na barra de mensagens (`MB`), `2` no
 * `ALT`, `4` no `RL`, `10` no `AL`. **Nenhum** dos 695 controles lidos tem dois — a busca é
 * determinística. Os 5 sem SID são todos o mesmo `sysInfoAreaToggle` (`GuiToggle`), que também não
 * publica comando de POST: é botão de UI do renderer.
 *
 * ⚠ E o `id` NÃO substitui: dos 392, **1** tinha `id` na forma de SID (o `wnd[0]/sbar_msg`); o
 * resto é `M0:56::btn[3]`, `ToolbarOkCode`, `mnu0_531`.
 */
export const sidDoControle = (controle) => sidDoLsdata(controle?.lsdata)?.SID ?? null;

/**
 * PURO: o controle da tela que responde por um SID — quem carrega o `lsevents` daquele endereço.
 *
 * ⚠ SID repetido EXISTE: medido (item 71) 18 a 26 por tela, e são sempre os do menu — o `POMNI`
 * (o item, `lsevents: null`) e o `POMN` (o submenu de mesmo SID, que publica o `action/4`) declaram
 * o MESMO `wnd[0]/mbar/menu[0]`. Mas **nunca dois com `lsevents`** nos 5 raws: entre os homônimos,
 * o que declara disparo é único, e é ele que este devolve.
 */
export function controleDoSid(brutos = [], sid) {
  const alvo = String(sid ?? '');
  const iguais = brutos.filter((b) => sidDoControle(b) === alvo);
  return iguais.find((b) => b.lsevents) ?? iguais[0] ?? null;
}

/** Comandos que o `lsevents` publica mas que NÃO são POST — são o roteador interno do renderer. */
const NAO_POSTAM = {
  receive: 'é a ponte de `postMessage` do renderer (ct=IHUBPOSTMESSAGE)',
  vkey: 'é `vkey` SEM número — o atalho do renderer, cujo número só existe em tempo de gesto; a tecla se manda por `tecla(sessao, \'F8\')`',
};

/**
 * PURO: os eventos deste controle que VIRAM POST, com o comando de cada um — o cardápio do que a
 * tela declara que aquele controle sabe fazer: `[{ evento: 'Press', comando: 'action/3' }, …]`.
 * Fora ficam os que o renderer trata sozinho (`ListAccess`, `Validate`, `DeleteItem` — sem índice
 * `1`), o `Select` do menu-raiz (que traz `JScript`, não comando) e os do `NAO_POSTAM`.
 */
export function eventosDoControle(controle) {
  const mapa = controle?.lsevents;
  if (!mapa || typeof mapa !== 'object') return [];
  return Object.entries(mapa)
    .map(([evento, par]) => ({ evento, comando: typeof par?.[1]?.['1'] === 'string' ? par[1]['1'] : null }))
    .filter((e) => e.comando && !(e.comando in NAO_POSTAM));
}

/**
 * PURO: **o bruto + o nome do evento → os passos do batch.** É a peça que troca o `action/3` fixo
 * do `batchAcionar` pelo que a TELA declara (§ o DISPARO que a tela DECLARA, acima).
 *
 * `valor` é para os comandos que levam conteúdo (`value`, `okcode/ses[0]`); `content` passa um
 * corpo cru (o `type=node&node_key=…` da árvore); `sid` sobrepõe o SID do próprio controle.
 *
 * Cada recusa é uma informação, não um acidente: evento não declarado lista os que existem, evento
 * sem comando diz que o renderer o trata sozinho, e comando fora das famílias medidas estoura AQUI
 * em vez de virar um `-101 not supported` do outro lado.
 *
 * Medido (item 71) sobre os 5 raws: dos 948 pares evento→comando, **709 são postáveis e 709
 * compõem**, sem família desconhecida; 51 deles (7,2%) NÃO são `comando + / + SID`.
 * ⚠ **Compor não é funcionar.** A tela declara o que o RENDERER faria; o servidor decide o que
 * aceita — o item 50 mediu `action/1` e `action/74` declarados e inexistentes no protocolo
 * (`-102 control not found`). Isto entrega o batch certo pela regra, não a garantia do desfecho.
 */
export function batchDoEvento(controle, evento, { valor = null, content = null, sid = null } = {}) {
  const nome = String(evento ?? '').trim();
  if (!nome) throw new Error('its: informe o evento (ex. "Press", "Change", "Select", "DoubleClick")');
  const quem = `${controle?.ct ?? '?'} ${controle?.id ?? '?'}`;
  const mapa = controle?.lsevents;
  if (!mapa || typeof mapa !== 'object') throw new Error(`its: o controle ${quem} não declara lsevents — não há disparo a compor`);
  if (!(nome in mapa)) {
    const posta = eventosDoControle(controle).map((e) => `${e.evento} (${e.comando})`).join(', ') || '(nenhum)';
    throw new Error(`its: ${quem} não declara o evento "${nome}" — declara ${Object.keys(mapa).join(', ')}; postam: ${posta}`);
  }
  const params = mapa[nome]?.[1] ?? {};
  const comando = typeof params['1'] === 'string' ? params['1'] : null;
  if (!comando) {
    throw new Error(`its: o evento "${nome}" de ${quem} não posta nada — `
      + (params.JScript ? `é gesto do renderer (JScript: ${params.JScript})`
        : 'não traz comando no índice 1 (é evento que o renderer trata sozinho — ListAccess, Validate, DeleteItem…)'));
  }
  if (comando in NAO_POSTAM) throw new Error(`its: "${nome}" de ${quem} publica \`${comando}\`, que ${NAO_POSTAM[comando]}`);

  // ⚠ ANTES de concatenar: o comando pode JÁ TRAZER o alvo — `/ses[0]` (a sessão) ou um `/wnd[…]`
  // que nem sempre é o SID do próprio controle (o `action/1/wnd[0]/sbar` do ct=MB, item 44).
  const jaEnderecado = comando.includes('/wnd[') || /\/ses\[0\]$/.test(comando);
  const familia = comando.split('/')[0];
  const alvo = sid ?? sidDoControle(controle);
  if (!jaEnderecado && !alvo) throw new Error(`its: ${quem} publica \`${comando}\`, que precisa de SID, e o controle não carrega nenhum — passe { sid }`);
  const corpo = content ?? (valor === null || valor === undefined ? null : String(valor));
  if ((familia === 'value' || familia === 'okcode') && corpo === null) {
    throw new Error(`its: "${nome}" de ${quem} posta \`${comando}\`, que leva conteúdo — informe o valor: { evento: '${nome}', valor: '…' }`);
  }
  const passoDe = (post) => (corpo === null ? { post } : { post, content: corpo });
  const foco = { post: `focus/${alvo}`, logic: 'ignore' };

  if (jaEnderecado) return [passoDe(comando)];
  if (familia === 'vkey') return [foco, { post: `${comando}/ses[0]` }];          // item 22: o alvo é a SESSÃO
  if (familia === 'value') return [foco, { post: `value/${alvo}`, content: corpo }];
  if (familia === 'focus') return [foco];
  if (familia === 'action') return [passoDe(`${comando}/${alvo}`)];
  throw new Error(`its: comando "${comando}" ("${nome}" de ${quem}) fora das famílias medidas — action, value, focus, vkey, okcode`);
}

/**
 * PURO: a PILHA de modais (`GuiModalWindow`) que o delta trouxe — da de BAIXO para a de CIMA
 * (`wnd[1]`, `wnd[2]`…), `[]` quando não há popup. Em cada uma: o título é a primeira linha do
 * texto da janela (o `header` é o primeiro filho); `textos` são os rótulos dela
 * (`txtSPOP-TEXTLINE1` "Os dados não gravados serão perdidos."); `botoes` são os dela PELO SID
 * (`wnd[1]/usr/btnSPOP-OPTION1` "Sim") — ⚠ eles NÃO são `btn[n]`, então não entram em
 * `tela.botoes` e `acionar(s, 'Sim')` não os acha: é `acionar(s, { sid })`, e responder ao popup
 * por esta via ainda não está medido (fila 23). `atras` são os SIDs das que ficaram embaixo.
 *
 * Medido em 05/09/2026 sobre POC_webgui_okcode/medicoes/raw/d2-ose16.txt: com DUAS modais o delta
 * declara as duas e traz os controles das duas — `wnd[1]` "Sessões ABAP" (4 botões, 7 rótulos) e
 * `wnd[2]` "Informação — Nº máximo de janelas GUI atingido" (2 botões). A de baixo continua no
 * markup, mas não é ela que responde.
 */
export function popupsDaTela(brutos = []) {
  const controles = brutos.map((b) => ({ b, sid: sidDoLsdata(b.lsdata) }));
  const janelas = controles.filter((c) => c.sid?.Type === 'GuiModalWindow')
    .sort((a, b) => indiceDaJanela(a.sid.SID) - indiceDaJanela(b.sid.SID));
  return janelas.map((janela, i) => {
    const raiz = janela.sid.SID;                                     // wnd[1], wnd[2]…
    const dentro = controles.filter((c) => c.sid?.SID?.startsWith(`${raiz}/`));
    return {
      sid: raiz, id: janela.b.id ?? null,
      atras: janelas.slice(0, i).map((j) => j.sid.SID),
      titulo: rotuloLimpo(janela.b.texto, janela.b.title),
      textos: dentro.filter((c) => c.sid.Type === 'GuiLabel' && (c.b.texto || c.b.title))
        .map((c) => ({ sid: c.sid.SID, texto: c.b.texto || c.b.title })),
      botoes: dentro.filter((c) => c.sid.Type === 'GuiButton')
        .map((c) => ({ sid: c.sid.SID, rotulo: rotuloLimpo(c.b.texto, c.b.title), tecla: teclaDoBotao(c.b.lsdata), accesskey: c.b.accesskey ?? null })),
      campos: dentro.filter((c) => TIPOS_DE_ENTRADA.has(c.sid.Type))
        .map((c) => ({ sid: c.sid.SID, campo: campoDoSid(c.sid.SID), valor: c.b.valor ?? '', dica: c.b.title ?? null })),
    };
  });
}

/**
 * PURO: o popup ATIVO — o TOPO da `popupsDaTela` (a modal de maior `wnd[n]`), ou `null`. É com ele
 * que se fala: as de baixo estão atrás do modal e só voltam quando ele fechar; `atras` lista os
 * SIDs delas, e quem precisar mesmo ler uma chama a `popupsDaTela`.
 *
 * ⚠ Até 05/09/2026 isto era `find(Type === 'GuiModalWindow')` — a PRIMEIRA do markup, que é a de
 * BAIXO. Medido sobre POC_webgui_okcode/medicoes/raw/d2-ose16.txt (`/o` e, sobre ele, o
 * "Nº máximo de janelas GUI atingido"): devolvia a `wnd[1]` "Sessões ABAP" com os 4 botões dela,
 * enquanto a tela pedia resposta à `wnd[2]` "Informação" — mesmo defeito de ordem-de-markup que o
 * item 42 corrigiu no endereçamento (`janelaAtiva`).
 */
export function popupDaTela(brutos = []) {
  return popupsDaTela(brutos).at(-1) ?? null;
}

/**
 * O popup ATIVO da SESSÃO — o `popupDaTela` sobre o último delta, ou `null` quando a tela está em
 * `wnd[0]`. É a forma barata de perguntar "tem modal na frente, e qual?".
 *
 * O atalho é o `janelaAtiva` sobre os SIDs que o `postar` já extraiu: sem modal declarada a
 * resposta seria `null` de qualquer jeito, e assim ela sai **sem** o parse dos controles — medido
 * em 06/09/2026 (item 83) que `controlesDoDelta` custa 8–17 ms num delta de 300 KB, contra ~0 ms
 * do farejador. Com modal, paga-se o parse uma vez e vem o objeto inteiro (título, botões, campos).
 */
export const popupDaSessao = (sessao) => (janelaAtiva(sessao?.sids ?? []) !== 'wnd[0]'
  ? popupDaTela(controlesDoDelta(sessao?.delta ?? ''))
  : null);

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
    // ⚠ o aviso é de ENDEREÇAMENTO, não de ausência: com modal aberta `campos`/`botoes` continuam
    // sendo a `wnd[0]` de trás (medido no item 98 — SE16 com SPOP dá os mesmos 34 campos do sem
    // popup). Dispara sempre que há popup; até 06/09/2026 dizia que a `wnd[0]/usr` sumia, e só não
    // era desmentido porque a condição era `campos.length === 0` — só telas sem campo o viam.
    aviso: popup
      ? `popup ${popup.sid} aberto${popup.atras.length ? ` (sobre ${popup.atras.join(', ')} — é a de cima que responde)` : ''}`
        + ' — campos e botoes são a wnd[0] ATRÁS do modal; o conteúdo da modal está em popup'
      : null,
  };
}

// ---------- o ALV (grid) ----------

/**
 * PURO: o batch que pede uma FAIXA de linhas de um grid ALV — o `RequestData` que o Unified
 * Renderer posta sozinho quando a rolagem passa do fim do bloco carregado.
 *
 * Medido no s4h 758/250 em 04/09/2026 (RSPARAM, 1617 linhas), capturando a rede do navegador ao
 * rolar com a roda do mouse. O batch que o renderer manda é:
 *   `action/53/<SID>`  `row_index=1&column_index=1`          (célula corrente — dispensável)
 *   `action/61/<SID>`  `position=<n>` `logic:'ignore'`       (VerticalScroll — dispensável)
 *   `action/710/<SID>` `position=<n>&fragments=<de>,<ate>;`  (RequestData — É ELE)
 *   `get state/ur/<SID>`
 * Medido que só o `710` + o `state/ur` bastam (sem o `61` a mesma faixa volta igual), e que
 * `position` é OBRIGATÓRIO: sem ele a resposta vem `multipart` de 185 B e nenhuma linha.
 *
 * ⚠️ `de`/`ate` aqui são 0-BASED (é o que o protocolo usa); o `lsMatrixRowIndex` que volta nas
 * células é 1-BASED. Pedir `0,29` devolve as linhas 1..30.
 * ⚠️ O `;` NÃO entrega faixas disjuntas: medido que `fragments=10,19;100,109;` devolveu 26 linhas
 * CONTÍGUAS (11..36) e ignorou a segunda faixa. Uma faixa por pedido.
 * ⚠️ Faixa além do total é segura: `0,5000` num grid de 1617 devolveu as 1617 linhas, sem erro.
 */
export const batchFragmento = (sid, de, ate) => [
  { post: `action/710/${sid}`, content: `position=${de}&fragments=${de},${ate};` },
  { get: `state/ur/${sid}` },
];

/**
 * PURO: as CÉLULAS de um grid no XML de `delta-update` — `Map<linha, { coluna: valor }>`, ambas
 * 1-based (a coluna 0 é a de seleção da linha, não é dado).
 *
 * Cada célula de dado é um `<span id="grid#<CID>#<linha>,<coluna>#if" ct="CBS" lsdata='…'>`, e o
 * valor mora no objeto do `lsdata` que tem `value` — o mesmo índice móvel de sempre, daí casar por
 * CONTEÚDO e não por posição. A linha do id é o `lsMatrixRowIndex` do `<td>` pai: o índice
 * ABSOLUTO no ALV inteiro, não a posição dentro do fragmento.
 */
export function celulasDoGrid(corpo, cid) {
  const linhas = new Map();
  const re = new RegExp(`id="grid#${cid}#([0-9]+),([0-9]+)#if"[^>]*lsdata='([^']*)'`, 'g');
  let m;
  while ((m = re.exec(String(corpo ?? '')))) {
    const linha = Number(m[1]);
    const coluna = Number(m[2]);
    if (coluna < 1) continue;
    const d = jsonDoAtributo(m[3]) ?? {};
    const cel = Object.values(d).find((x) => x && typeof x === 'object' && 'value' in x);
    if (!linhas.has(linha)) linhas.set(linha, {});
    linhas.get(linha)[coluna] = cel ? String(cel.value ?? '') : '';
  }
  return linhas;
}

/**
 * PURO: as células viram LINHAS, com os `ColumnIDs` do `lsdata` do grid como chave e `_linha` com o
 * índice absoluto. Coluna sem célula na resposta sai `''`.
 */
export function linhasDoGrid(celulas, colunas = []) {
  return [...celulas.entries()].sort((a, b) => a[0] - b[0]).map(([n, cels]) => {
    const linha = { _linha: n };
    colunas.forEach((c, i) => { linha[c] = cels[i + 1] ?? ''; });
    return linha;
  });
}

/** PURO: o próximo `de` (1-based) que falta cobrir na faixa, ou `null` quando ela está inteira. */
export function faltaNaFaixa(celulas, de, ate) {
  for (let i = de; i <= ate; i++) if (!celulas.has(i)) return i;
  return null;
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
 * Devolve a sessão `{ via, cfg, jar, action, moin, sids, ultimo, titulo, fila, aberta, desfazer, tempos }`.
 * Quem abre FECHA: `fechar(sessao)` — que roda a pilha `desfazer` ANTES do `/nex`.
 */
/** As causas da sonda em que o CANAL é mesmo o problema — as que fazem procurar o nó na SICF. */
const CAUSAS_DE_CANAL = new Set(['sem-no', 'ssl', 'proibido', 'erro-servidor', 'sem-icm', 'certificado']);

/**
 * PURO: como ABRIR a mensagem de recusa (item 88). Antes toda recusa saía como "canal WebGUI
 * indisponível" — inclusive a que só diz que **a sessão não nasceu**, e aí a frase manda procurar
 * o nó na SICF, que é o lugar errado (o nó respondeu a tela). O motivo vem do `interpretarSonda`;
 * daqui sai só a primeira linha, e ela tem de apontar para onde o problema está.
 */
export const prefixoDaRecusa = (causa) =>
  CAUSAS_DE_CANAL.has(causa) ? 'canal WebGUI indisponível'
    : causa === 'sem-sessao-nova' ? 'o nó do WebGUI ATENDEU, mas a sessão não nasceu'
    : causa === 'credencial' ? 'o WebGUI recusou a credencial'
    : 'resposta não prevista do WebGUI';

export async function abrir(cfg, { transacao = null, parametros = {}, okcode = null, limpar = [], boot = true, tetoMs = 30000 } = {}) {
  const url = urlWebgui(cfg, { transacao, parametros, okcode, limpar });
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
    throw new Error(`its: ${prefixoDaRecusa(sonda.causa)} — ${sonda.motivo}`);
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
    sids: [], delta: null, parcial: null, ultimo: null, titulo: null, carimbo: null, fila: [], aberta: true,
    desfazer: criarPilhaDeDesfazer(), tempos: { get: ms, boot: null },
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
  const antes = { carimbo: sessao.carimbo, janela: sessao.sids.length ? janelaAtiva(sessao.sids) : null };
  if (lida.forma === 'delta' && !lida.parcial) {
    sessao.sids = sidsDaResposta(corpo);
    sessao.titulo = lida.titulo;
    sessao.delta = corpo;   // a última tela — é dela que `lerTela` lê (multipart não a substitui)
    sessao.parcial = null;
    sessao.carimbo = carimboDosSids(sessao.sids, lida);
  } else if (lida.parcial) {
    sessao.parcial = corpo; // um controle só (o fragmento do ALV): NÃO é a tela, não substitui o delta
  }
  if (lida.forma === 'logoff' || lida.forma === 'sem-sessao') sessao.aberta = false;
  lida.carimbo = sessao.carimbo;
  // A janela ATIVA da TELA — `wnd[0]`, ou a modal de maior índice. Ao contrário do `temPopup` (que
  // fareja o CORPO da resposta), esta sobrevive ao `multipart`: um POST recusado não traz SID
  // nenhum, mas a modal que estava na frente continua lá. É o fato BARATO — os SIDs já foram
  // extraídos — que distingue "tem modal na frente" de "wnd[0] livre" (item 83). O `postar` já a
  // calculava para o aviso do item 59; agora ela sai no resultado.
  lida.janela = sessao.sids.length ? janelaAtiva(sessao.sids) : null;
  lida.mensagem = lida.forma === 'delta' && !lida.parcial ? mensagemDosSids(sessao.sids) : null;
  lida.mudou = mudouDaTela(lida, antes.carimbo, sessao.carimbo);
  sessao.ultimo = lida;
  detalhe(`its: ${lida.forma} em ${ms} ms${lida.pegou ? ` — "${lida.titulo}"` : ` — ${lida.motivo}`}${lida.mudou === false ? ' — a tela NÃO mudou' : ''}`);
  if (lida.mensagem) detalhe(`its: mensagem ${lida.mensagem.tipo ?? '?'}: "${lida.mensagem.texto}"`);
  // ⚠ o AVISO alto: a resposta veio boa, nada mudou e o popup continua lá — o falso positivo do item 59.
  const janela = lida.forma === 'delta' && !lida.parcial ? lida.janela : null;
  if (lida.pegou && lida.mudou === false && janela && janela !== 'wnd[0]' && antes.janela === janela) {
    aviso(`its: a ação não mudou NADA e o popup ${janela} continua aberto${lida.mensagem ? ` — "${lida.mensagem.texto}"` : ''}`
      + ' — popup se responde pelo SID do botão (lerTela(s).popup.botoes), não por tecla nem por apelido.');
  }
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
 * `valor`. ⚠ `popup` não nulo = modal aberta — e aí `campos` e `botoes` são a `wnd[0]` ATRÁS dela
 * (o popup NÃO tira a `wnd[0]/usr` do delta, item 98); o conteúdo da modal está em `popup`, e o
 * `aviso` repete isso.
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
/** A janela ATIVA da sessão — a modal mais alta que o último delta declarou, ou `wnd[0]`. */
export const ativa = (sessao) => janelaAtiva(sessao.sids);
/** Só os campos de entrada da tela atual — de TODAS as janelas, ou só da `janela` pedida. */
export const campos = (sessao, janela = null) => sessao.sids
  .filter((x) => TIPOS_DE_ENTRADA.has(x.tipo) && (!janela || x.janela === janelaDoSid(janela)));
/**
 * Só os botões (`btn[n]`) da tela atual, com o apelido medido quando há. ⚠ Com popup aberto isto
 * traz as DUAS barras (a da `wnd[1]` e a da `wnd[0]` atrás do modal) — o `janela` de cada botão
 * diz de quem ele é, e `botoes(s, ativa(s))` recorta só a de cima.
 */
export const botoes = (sessao, janela = null) => sessao.sids
  .filter((x) => x.tipo === 'GuiButton' && x.okcode && (!janela || x.janela === janelaDoSid(janela)))
  .map((b) => ({ ...b, nome: OKCODES[b.okcode]?.nome ?? null }));

/** O grid da tela que o `alvo` escolhe (índice, `{ id }` ou `{ sid }`; sem alvo, o primeiro). */
function escolherGrid(sessao, alvo, quem) {
  const grids = lerTela(sessao)?.grids ?? [];
  const g = typeof alvo === 'number' ? grids[alvo]
    : alvo?.sid ? grids.find((x) => x.sid === alvo.sid)
    : alvo?.id ? grids.find((x) => x.id === alvo.id)
    : grids[0];
  if (!g) throw new Error(`its: ${quem} — a tela não tem esse grid (tem ${grids.length}: ${grids.map((x) => x.id).join(', ') || 'nenhum'})`);
  return g;
}

/**
 * Lê o ALV da tela — as LINHAS, não só o cabeçalho que o `lsdata` já dava. É o par WebGUI do
 * `lerGrid` do GUI Scripting, e não varre célula na tela: pede o fragmento de linhas ao servidor
 * (`batchFragmento`) e extrai a matriz do XML de resposta.
 *
 * `alvo` escolhe o grid quando a tela tem mais de um: índice (`0`), `{ id: 'C102' }` ou
 * `{ sid: 'wnd[0]/usr/cntlGRID1/shellcont/shell' }`. Sem alvo, o primeiro grid da tela.
 * `de`/`ate` são 1-based e inclusivos, como o `_linha` que volta (o 0-based do protocolo fica aqui
 * dentro). Sem `ate`, vai até o `totalRows` que o grid declara.
 *
 * Devolve `{ id, sid, colunas, total, de, ate, linhas, pedidos, bytes, ms, truncado }`, com cada
 * linha `{ _linha, <ColumnID>: valor, … }`.
 *
 * Medido no s4h 758/250 em 04/09/2026 (RSPARAM, 1617 × 5): 1617/1617 linhas num pedido só, 12,4 MB
 * em 1,7 s de rede e 42 ms de parse; nenhuma linha faltando, nenhuma vazia. O custo é LINEAR e
 * caro — ~7,7 KB por linha (a resposta traz `lsdata` e `lsevents` de cada célula) — e por isso o
 * `lote` existe: 50→450 linhas/s, 500→661, 1617→939. O default de 500 (~3,8 MB por pedido) é o
 * meio-termo entre memória e viagens.
 *
 * ⚠️ O servidor devolve NO MÍNIMO uma janela: pedir 3 linhas trouxe 26 e 202 KB. Por isso a faixa
 * pedida é recortada no fim, e o avanço é pelo que FALTA (`faltaNaFaixa`), não por aritmética.
 * ⚠️ `truncado: true` = um pedido não trouxe nenhuma linha nova e o laço parou — a faixa devolvida
 * está incompleta, e é informação, não erro.
 */
export async function lerGrid(sessao, alvo = null, { de = 1, ate = null, lote = 500, tetoMs = 180000 } = {}) {
  const g = escolherGrid(sessao, alvo, 'lerGrid');
  const total = Number(g.linhas ?? 0);
  const fim = Math.min(Number(ate ?? total) || 0, total);
  const ini = Math.max(1, Number(de) || 1);
  const celulas = new Map();
  let pedidos = 0, bytes = 0, truncado = false;
  const t0 = Date.now();
  for (let proximo = ini; proximo !== null && proximo <= fim;) {
    const antes = celulas.size;
    const ultima = Math.min(proximo + lote - 1, fim);
    const r = await postar(sessao, batchFragmento(g.sid, proximo - 1, ultima - 1), { tetoMs });
    pedidos++; bytes += r.corpo.length;
    for (const [linha, cels] of celulasDoGrid(r.corpo, g.id)) if (!celulas.has(linha)) celulas.set(linha, cels);
    if (celulas.size === antes) { truncado = true; break; }
    proximo = faltaNaFaixa(celulas, ini, fim);
  }
  const dentro = new Map([...celulas].filter(([n]) => n >= ini && n <= fim));
  detalhe(`its: lerGrid ${g.id} — ${dentro.size} linha(s) de ${total} em ${pedidos} pedido(s), ${bytes} B`);
  return { id: g.id, sid: g.sid, colunas: g.colunas ?? [], total, de: ini, ate: fim,
    linhas: linhasDoGrid(dentro, g.colunas ?? []), pedidos, bytes, ms: Date.now() - t0, truncado };
}

// ---------- ORDENAR o ALV (item 115) ----------
//
// Medido no s4h 758/250 em 06/09/2026 (`work/POC_webgui_btn40/medicoes/item115-btn40.md`), na lista
// do `RSPARAM` (`SA38` → `btn[8]`, 1617 × 5, `SAPLSLVC_FULLSCREEN`), por HTTP puro.
//
// Ordenar é **um POST só, com DUAS metades**: a marca da coluna (`action/46 columns=;<n>;`, o irmão
// do `action/47 rows=;n;` da seleção de linha) e o botão de sort da barra (`action/3`). A marca
// morre no round-trip — as duas metades TÊM de ir no mesmo batch, e é por isso que `ordenarGrid`
// marca a coluna ele mesmo em vez de pedir que se marque antes.
//
// ⚠ **Sem marca válida o botão não ordena: abre o diálogo "Ordenação"** (`SAPLSALV_CUL_…`) e a
// sessão fica atrás de uma modal. Medido que caem aí: nenhum `action/46`, `columns=;0;` (a coluna 0
// é a caixa de seleção, não é dado) e uma coluna que não existe (`;9;` num grid de 5) — o servidor
// não recusa a marca inválida, ele a ignora. Neste canal a modal **é** `wnd[1]` de verdade
// (`popupDaSessao` a vê) — ao contrário do canal navegador, onde o diálogo não é `wnd[1]` e o
// `lerTela` do webgui.mjs fica cego (item 77).
//
// ⚠ **A ordem dos critérios é a das COLUNAS na tela, não a da string.** Medido: `;2;5;` e `;5;2;`
// deram o MESMO resultado — coluna 2 primária, 5 desempatando dentro do grupo empatado; e `;2;1;`
// ordenou por NAME (coluna 1) puro, porque a 1 vem antes. Empate sem desempate é ESTÁVEL: mantém a
// ordem em que a lista veio.
//
// ⚠ **Quem reordena é o SERVIDOR, não o fragmento.** Contra-prova: com a tela em NAME desc, o XLSX
// do `exportarPlanilha` saiu com `ztta/short_area` na primeira linha e `_CPARG0` na última — a mesma
// ordem da tela. Um `_linha` guardado antes de ordenar aponta para outro dado depois.
//
// ⚠ **A tela NÃO declara o que está ordenado.** Os cabeçalhos (`ct="CP"`) vieram iguais antes e
// depois do sort, e nenhum ícone de ordenação entra no delta. Quem quiser saber a ordem corrente lê
// os DADOS — não há estado para ler.

/** Os ícones que marcam os botões de ordenação da barra do ALV — a âncora que NÃO é traduzida. */
const ICONE_SORT = { asc: 's_b_srtu', desc: 's_b_srtd' };

/**
 * PURO: o botão de ORDENAÇÃO da barra, achado pelo ÍCONE (`lsdata[11]`), não pelo rótulo — que vem
 * traduzido ("Ordenar em ordem crescente" no PT, e outra coisa em cada idioma). Recebe os controles
 * de um delta (`controlesDoDelta`) e devolve `{ sid, rotulo, tecla, icone }`, ou `null`.
 *
 * Medido na barra da lista do RSPARAM: `btn[28]` = `s_b_srtu` (`CTRL_4`) e `btn[40]` = `s_b_srtd`
 * (`CTRL_SHIFT_F4`). Os NÚMEROS são do GUI status daquela tela e não valem como endereço fixo; o
 * ícone, sim. Um ALV dentro de container põe o mesmo botão em `<sid do grid>/tbar/btn&SORT_ASC` —
 * o SID muda, o ícone não.
 */
export function botaoDeOrdenacao(brutos = [], ordem = 'asc') {
  const icone = ICONE_SORT[String(ordem).toLowerCase()];
  if (!icone) throw new Error(`its: botaoDeOrdenacao — ordem "${ordem}" não existe (é 'asc' ou 'desc')`);
  for (const c of brutos) {
    const sid = c?.lsdata?.['27']?.SID;
    if (!sid || c.ct !== 'B' || c.visivel === false) continue;
    if (!String(c.lsdata?.['11'] ?? '').endsWith(`#${icone}`)) continue;
    return { sid, rotulo: c.title ?? c.lsdata?.['0'] ?? null, tecla: c.lsdata?.['18'] ?? null, icone };
  }
  return null;
}

/** PURO: o batch que ordena — a marca da coluna e o botão, no MESMO POST (separá-los não ordena). */
export const batchOrdenar = (sidGrid, colunas, sidBotao) => [
  { post: `action/46/${sidGrid}`, content: `columns=;${colunas.join(';')};` },
  { post: `action/3/${sidBotao}` },
];

/** PURO: o índice 1-based de uma coluna do grid, pelo número ou pelo `ColumnID` (`'NAME'`). */
export function indiceDaColuna(colunas = [], coluna) {
  if (typeof coluna === 'number') {
    if (!Number.isInteger(coluna) || coluna < 1) throw new Error(`its: coluna ${coluna} inválida — o índice é 1-based (a coluna 0 é a caixa de seleção da linha, e marcá-la abre o diálogo "Ordenação")`);
    return coluna;
  }
  const nome = String(coluna ?? '').toUpperCase();
  const i = colunas.findIndex((c) => String(c).toUpperCase() === nome);
  if (i < 0) throw new Error(`its: o grid não tem a coluna "${coluna}" (tem ${colunas.length}: ${colunas.join(', ') || 'nenhuma'})`);
  return i + 1;
}

/**
 * ORDENA o ALV da tela por uma ou mais colunas — a marca (`action/46`) e o botão de sort da barra
 * num POST só. É o par HTTP puro do `ordenarGrid` do webgui.mjs, e ao contrário dele **não devolve
 * as linhas**: neste canal ler o bloco é outra viagem, e cara (1617 linhas = 12 MB). Peça o
 * `lerGrid` depois, se quiser o dado.
 *
 * ```js
 * await ordenarGrid(s, null, 'NAME');                       // crescente
 * await ordenarGrid(s, null, 'NAME', { ordem: 'desc' });    // decrescente
 * await ordenarGrid(s, null, ['USER_VALUE', 'DESCR']);      // dois critérios
 * ```
 *
 * `coluna` é o número 1-based, o `ColumnID`, ou um array deles. Devolve
 * `{ id, sid, colunas, nomes, ordem, botao, tecla, total, ms }`.
 *
 * ⚠ Estoura — e CANCELA o diálogo, para não deixar a sessão presa atrás da modal — quando a marca
 * não pega e o ALV abre a "Ordenação" em vez de ordenar (§ acima).
 */
export async function ordenarGrid(sessao, alvo = null, coluna, { ordem = 'asc', tetoMs = 30000 } = {}) {
  const t0 = Date.now();
  const dir = String(ordem).toLowerCase();
  if (dir !== 'asc' && dir !== 'desc') throw new Error(`its: ordenarGrid — ordem "${ordem}" não existe (é 'asc' ou 'desc')`);
  const g = escolherGrid(sessao, alvo, 'ordenarGrid');
  const pedidas = Array.isArray(coluna) ? coluna : [coluna];
  if (!pedidas.length) throw new Error('its: ordenarGrid — sem coluna nenhuma o ALV abre o diálogo "Ordenação" em vez de ordenar');
  const indices = pedidas.map((c) => indiceDaColuna(g.colunas ?? [], c));
  const b = botaoDeOrdenacao(controlesDoDelta(sessao.delta), dir);
  if (!b) throw new Error(`its: ordenarGrid — esta tela não tem o botão de ordenação ${dir === 'desc' ? 'decrescente' : 'crescente'} (ícone ${ICONE_SORT[dir]}) na barra`);
  const antes = janelaAtiva(sessao.sids);
  const r = await postar(sessao, [...batchOrdenar(g.sid, indices, b.sid), ESTADO], { tetoMs });
  const depois = janelaAtiva(sessao.sids);
  if (depois !== antes) {
    const modal = popupDaSessao(sessao);
    const cancelar = modal?.botoes?.find((x) => /\/tbar\[0\]\/btn\[12\]$/.test(x.sid));
    if (cancelar) await acionar(sessao, { sid: cancelar.sid }, { tetoMs });
    throw new Error(`its: ordenarGrid — o ALV abriu "${modal?.titulo ?? depois}" em vez de ordenar: a marca `
      + `columns=;${indices.join(';')}; não vale neste grid (a coluna 0 e a que não existe caem aqui). `
      + `${cancelar ? 'O diálogo foi cancelado; a lista continua na ordem anterior.' : 'O diálogo continua aberto.'}`);
  }
  if (!r.pegou) throw new Error(`its: ordenarGrid — o POST não pegou: ${r.motivo}`);
  const total = Number(escolherGrid(sessao, alvo, 'ordenarGrid').linhas ?? 0);
  const nomes = indices.map((i) => (g.colunas ?? [])[i - 1] ?? null);
  detalhe(`its: ordenarGrid ${g.id} — coluna(s) ${indices.join(', ')} (${nomes.join(', ')}) em ${dir}, ${total} linha(s)`);
  return { id: g.id, sid: g.sid, colunas: indices, nomes, ordem: dir, botao: b.sid, tecla: b.tecla, total, ms: Date.now() - t0 };
}

// ---------- ESCREVER em LOTE no ALV: colar um bloco (item 125) ----------
//
// Medido no s4h 758/250 em 06/09/2026 (fila `adt-client`, item 125; bruto e leitura em
// `sap-accelerate/work/POC_webgui_grid_paste/medicoes/item125-lote-http.md`), no laboratório do
// item 47 (`ZJBV_ALV47_EDIT`: ALV editável que PERSISTE, `FC01` grava).
//
// O item 79 capturou no navegador o batch que o renderer manda ao COLAR um bloco no ALV. Aqui a
// pergunta era outra: esse batch, montado À MÃO e postado por esta via, é ACEITO? (compor não é
// funcionar — o item 50 mediu `action/1` e `action/74` declarados no `lsevents` e inexistentes no
// protocolo, e o próprio `action/25` do `ClipboardTablePaste` é uma dessas mentiras.) **É aceito**,
// e sem navegador nenhum:
//
//   action/53/<SID do grid>   row_index=<linha 1-based>&column_index=<coluna 1-based>   ← a ÂNCORA
//   action/770/<SID>          c0=<v>&c1=<v>…&curColIdx=<coluna>&curRowIdx=<0-based RELATIVO>
//   … um `action/770` por linha …
//   get state/ur
//
// tudo num POST, `content` URL-encoded. **20 linhas × 2 colunas = 40 células em 129 ms, um POST**
// (fase H2); 3 linhas × 2 em 78 ms (fase G). O `colarBloco` do navegador gasta ~2,6 s nas mesmas
// 6 células, e 6 × `escreverCelula` gastam 9,7 s (item 79, fase D).
//
// O que esta via NÃO precisa, e o navegador manda:
//   • **`action/50`** (a área selecionada) é dispensável — sem ele o efeito é o mesmo (fases E–I);
//   • **`focus/<SID>`** idem;
//   • **`action/53`** só é preciso para MOVER a âncora: sem ele a corrente é a `(1,1)` e o
//     `curRowIdx`/`curColIdx` endereçam sozinhos a partir dela (fase F1: `curRowIdx=2` sem `53`
//     escreveu na linha 3). A lib manda o `53` sempre — é ele que torna `linha`/`coluna` um
//     endereço ABSOLUTO em vez de um deslocamento da corrente, que ninguém sabe onde está.
//
// ⚠️ **Estouro embaixo: sem o `action/771` o batch é RECUSADO NO MEIO, e o que passou fica**
// (fase F3). Ancorado na última linha, dois `770` voltaram `multipart -133 failed to fire action:
// argument value out of range` — e a PRIMEIRA linha já estava escrita no grid. É o modo de falha
// mais feio deste protocolo: a resposta diz "não pegou" e metade pegou. Por isso `colarBloco`
// conta as linhas ele mesmo e intercala `action/771 curRowIdx=0&pasteOption=Append` ANTES de cada
// linha que passa do fim — medido (fases F4/H1) que depois do Append a corrente vira a linha nova,
// e por isso o `770` seguinte volta a `curRowIdx=0`. A linha anexada nasce VAZIA fora do bloco: a
// coluna que não veio no bloco fica em branco (é o `anexadas` do retorno).
//
// ⚠️ **Coluna que estoura à direita some SEM AVISO** (fase F5, igual ao navegador): ancorado na
// última coluna, `c0=917&c1=SOBRA` foi aceito, o `917` aplicado e o `SOBRA` descartado calado.
// Por isso a recusa é AQUI, antes do POST.
//
// ⚠️ **A tela depois do paste NÃO é prova, e colar NÃO grava** — as duas regras do item 79 valem
// igual nesta via, e a contra-prova pareada refez as duas (fase G): o mesmo bloco 3×2 sem `FC01`
// deixou `ZJBV_ALV47` intacta em outra LUW; com `comandar(s, 'FC01')` ("ITEM47 GRAVOU subrc=0
// n=4") a tabela veio `POSA/921`, `POSB/922`, `POSC/923`. **O ABAP recebe igual ao gesto do
// navegador.**
//
// ⚠️ Duas restrições do `colarBloco` do webgui.mjs NÃO valem aqui, porque nascem do renderer em
// JavaScript e não do protocolo — pela via HTTP não há renderer:
//   • **bloco de UMA célula funciona** (fases I1/I2): o `770` com um `c0` só escreveu a célula. No
//     navegador o mesmo gesto é ignorado em silêncio (sem TAB não é "colagem de tabela");
//   • **`&`, `=`, `;`, `%`, `+` e acento chegam íntegros** (fase I3) — o `encodeURIComponent` do
//     `content` dá conta.
// E uma que vale por DECISÃO, não por medida: TAB e quebra dentro de um valor. Medido (fase I4)
// que pela via HTTP o TAB chega íntegro ao grid e a quebra é ENGOLIDA em silêncio (`p\nq` virou
// `pq`); na via do navegador os dois partiriam a célula. Como o mesmo bloco não pode significar
// coisas diferentes em cada via, os dois são recusados aqui.

/**
 * PURO: o bloco vira MATRIZ de strings. Aceita `[['a', 1], ['b', 2]]` ou o TSV pronto (o `\r\n` do
 * Excel é normalizado), como o `tsvDoBloco` do webgui.mjs — mas aqui o bloco de UMA célula é
 * VÁLIDO (medido: o protocolo o aceita; quem o ignorava era o renderer).
 * Devolve `{ matriz, linhas, colunas, celulas }`.
 */
export function matrizDoBloco(valores) {
  const bruta = typeof valores === 'string'
    ? String(valores).replace(/\r\n?/g, '\n').split('\n').map((l) => l.split('\t'))
    : valores;
  if (!Array.isArray(bruta) || !bruta.length) {
    throw new Error('its: colarBloco — `valores` é o bloco: array de linhas (cada uma array de células) ou o TSV pronto; '
      + `veio ${Array.isArray(bruta) ? 'um array vazio' : JSON.stringify(valores)}`);
  }
  const matriz = bruta.map((l, i) => {
    const cels = Array.isArray(l) ? l : [l];
    if (!cels.length) throw new Error(`its: colarBloco — a linha ${i + 1} do bloco não tem célula nenhuma`);
    return cels.map((v, j) => {
      const s = v === null || v === undefined ? '' : String(v);
      if (/[\t\r\n]/.test(s)) {
        throw new Error(`its: colarBloco — o valor da linha ${i + 1}, coluna ${j + 1} tem TAB ou quebra `
          + `(${JSON.stringify(s)}): medido que por HTTP o TAB chega íntegro e a quebra é engolida em silêncio, `
          + 'e que na via do navegador os dois partiriam a célula em duas — o mesmo bloco não pode significar duas coisas');
      }
      return s;
    });
  });
  return { matriz, linhas: matriz.length, colunas: Math.max(...matriz.map((l) => l.length)),
    celulas: matriz.reduce((n, l) => n + l.length, 0) };
}

/**
 * PURO: os passos do paste — a âncora (`action/53`) e um `action/770` por linha, com o
 * `action/771 Append` intercalado antes de cada linha que passa do fim do ALV (`total`).
 * `linha`/`coluna` são 1-based e ABSOLUTOS; o `curRowIdx` relativo sai daqui.
 * Devolve `{ passos, anexadas }`.
 */
export function batchColar(sid, { linha, coluna, matriz, total }) {
  const passos = [{ post: `action/53/${sid}`, content: `row_index=${linha}&column_index=${coluna}` }];
  let anexadas = 0;
  matriz.forEach((cels, i) => {
    if (linha + i > Number(total)) {           // passou do fim: o ALV só cria a linha se a PEDIREM
      passos.push({ post: `action/771/${sid}`, content: 'curRowIdx=0&pasteOption=Append' });
      anexadas++;
    }
    const conteudo = cels.map((v, j) => `c${j}=${encodeURIComponent(v)}`).join('&');
    // depois de um Append a corrente é a linha NOVA — daí o `curRowIdx` voltar a 0 (medido)
    passos.push({ post: `action/770/${sid}`, content: `${conteudo}&curColIdx=${coluna}&curRowIdx=${anexadas ? 0 : i}` });
  });
  return { passos, anexadas };
}

/**
 * Cola um BLOCO no ALV desta tela a partir da célula (`linha`, `coluna`) — **N células num POST
 * só, sem navegador**. É o par HTTP puro do `colarBloco` do webgui.mjs, e o único jeito desta via
 * ESCREVER no grid (até aqui ela só lia).
 *
 * `alvo` escolhe o grid como no `lerGrid`; `linha` é o índice ABSOLUTO (o `_linha` do `lerGrid`),
 * `coluna` é o nome do `ColumnIDs` ou o índice 1-based; `valores` é `[['a', 1], ['b', 2]]` ou o
 * TSV pronto (o do Excel serve direto).
 *
 * ```js
 * const s = await abrirTransacao(cfg, 'SA38', { parametros: { 'RS38M-PROGRAMM': 'Z…' }, okcode: 'STRT' });
 * await colarBloco(s, null, { linha: 1, coluna: 'NOME', valores: [['AA', 10], ['BB', 20]] });
 * await comandar(s, 'FC01');   // ← quem GRAVA é o programa ABAP, no fcode seguinte
 * ```
 *
 * ⚠️ **Mandar não é gravar** e **a tela depois não é prova**: a prova é ler em outra LUW (§ acima).
 *
 * Devolve `{ id, sid, linha, coluna, nomeColuna, nLinhas, nColunas, celulas, passos, total,
 * anexadas, conferidas, divergentes, pendente: false, ms }`. `anexadas` > 0 = o bloco passou do fim
 * e o ALV criou linha (vazia fora do bloco); `divergentes` lista o que a tela NÃO devolveu como
 * pedido — só das linhas que voltaram no delta (`conferidas`), que são as da janela visível.
 */
export async function colarBloco(sessao, alvo = null, { linha, coluna, valores, tetoMs = 30000 } = {}) {
  const t0 = Date.now();
  const bloco = matrizDoBloco(valores);
  const g = escolherGrid(sessao, alvo, 'colarBloco');
  if (g.editavel !== true) {
    throw new Error(`its: colarBloco — o grid ${g.id} não é editável (o lsdata dele diz editable=${g.editavel}). `
      + 'ALV somente-leitura não aceita o paste: o `action/770` cairia em célula protegida.');
  }
  const total = Number(g.linhas ?? 0);
  const n = Number(linha);
  if (!Number.isInteger(n) || n < 1 || n > total) {
    throw new Error(`its: colarBloco — a linha âncora ${linha} está fora do ALV (ele tem ${total} linha(s), 1-based). `
      + 'A âncora tem de ser uma linha que existe; o bloco pode passar do fim (o ALV anexa).');
  }
  const c = indiceDaColuna(g.colunas ?? [], coluna);
  const nCols = g.colunas?.length ?? 0;
  if (nCols && c + bloco.colunas - 1 > nCols) {
    throw new Error(`its: colarBloco — o bloco tem ${bloco.colunas} coluna(s) a partir de `
      + `${g.colunas[c - 1]} (${c}) e o grid só tem ${nCols}: as ${c + bloco.colunas - 1 - nCols} que sobram seriam `
      + 'DESCARTADAS em silêncio (medido). Ancore mais à esquerda ou corte o bloco.');
  }
  const { passos, anexadas } = batchColar(g.sid, { linha: n, coluna: c, matriz: bloco.matriz, total });
  const r = await postar(sessao, [...passos, ESTADO], { tetoMs });
  if (!r.pegou) {
    throw new Error(`its: colarBloco — o POST não pegou (${r.motivo}). ⚠ O batch é aplicado passo a passo e o que `
      + 'passou ANTES da recusa FICOU no grid: leia com `lerGrid` antes de tentar de novo, e não mande o fcode de '
      + 'gravar às cegas.');
  }
  // As células que voltaram no delta — a janela visível do grid. Dá para conferir sem outra viagem.
  const vistas = celulasDoGrid(r.corpo, g.id);
  const divergentes = [];
  let conferidas = 0;
  bloco.matriz.forEach((cels, i) => cels.forEach((v, j) => {
    const lin = n + i, col = c + j;
    const ficou = vistas.get(lin)?.[col];
    if (ficou === undefined) return;
    conferidas++;
    if (String(ficou).trim() !== v.trim()) {
      divergentes.push({ linha: lin, coluna: col, nomeColuna: g.colunas?.[col - 1] ?? null, pedi: v, ficou });
    }
  }));
  const depois = Number(escolherGrid(sessao, alvo, 'colarBloco').linhas ?? 0);
  detalhe(`its: colarBloco ${g.id} — ${bloco.linhas}×${bloco.colunas} (${bloco.celulas} células) a partir de `
    + `${n},${g.colunas?.[c - 1] ?? c} num POST de ${passos.length} passo(s)`
    + (anexadas > 0 ? `; ${anexadas} linha(s) ANEXADA(s) pelo ALV, vazias fora do bloco` : '')
    + (divergentes.length ? `; ⚠ ${divergentes.length} célula(s) NÃO ficaram como pedido: ${divergentes.map((x) => `${x.linha},${x.nomeColuna ?? x.coluna} "${x.pedi}"→"${x.ficou}"`).join(', ')}` : ''));
  return { id: g.id, sid: g.sid, linha: n, coluna: c, nomeColuna: g.colunas?.[c - 1] ?? null,
    nLinhas: bloco.linhas, nColunas: bloco.colunas, celulas: bloco.celulas, passos: passos.length,
    total: depois, anexadas, conferidas, divergentes, pendente: false, ms: Date.now() - t0 };
}

// ---------- o ITSDoc: a via de ARQUIVO, nas duas direções (exportar e importar) ----------

/**
 * PURO: o `sap.its.arrITSDocParams` que o delta trouxe — ou `null` quando o delta não pede nada ao
 * "frontend". É por ele que o WebGUI faz o que no SAP GUI seria `gui_download`: a dynpro `SAPLSIT1`
 * devolve um pedido (`ITSDocMethod`) e ESPERA que o cliente o atenda numa URL própria, fora do
 * batch. O objeto é JS, não JSON (chave sem aspas, valor em aspas simples) — daí a normalização.
 */
export function itsdocDoDelta(corpo) {
  const m = /sap\.its\.arrITSDocParams\s*=\s*(\{[\s\S]*?\});/.exec(String(corpo ?? ''));
  if (!m) return null;
  const bruto = m[1];
  try {
    return JSON.parse(bruto.replace(/([{,])\s*([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/'/g, '"'));
  } catch { return { bruto }; }
}

/**
 * O batch que DEVOLVE o controle à dynpro depois de atender o ITSDoc — o renderer manda exatamente
 * estes três (`updown_send_okcode`, em `lsgui/js/webgui_min.js`). Sem ele o programa fica parado
 * esperando o frontend.
 */
export const OK_ITSDOC = [
  { post: 'okcode/ses[0]', content: '=OK' },
  { post: 'vkey/0/ses[0]' },
  { get: 'state/ur' },
];

/** Os formatos do popup "Gravar lista em file..." — o índice é o do radio `SPOPLI-SELFLAG[n,0]`. */
export const FORMATOS = {
  'nao-convertido': 0, tabuladores: 1, planilha: 2, 'rich-text': 3, html: 4, clipboard: 5,
};

/** A raiz do filesystem VIRTUAL que o renderer inventa para o browser (`nfstosfs`) — não é disco de ninguém. */
const RAIZ_NFS = 'Z:\\';
const ecodificar = (s) => encodeURIComponent(String(s ?? '')).replace(/%20/g, '+');

/**
 * O "diretório temporário do frontend", tal como o renderer o inventa: `updown_temp_path` é a
 * CONSTANTE `"/temp"` no `webgui_min.js`, que `sfstonfs` mostra como `Z:\temp` no Windows. Não é
 * `%TEMP%` de ninguém — é uma pasta do FS virtual (IndexedDB). Medido no item 113.
 */
export const TEMP_NFS = `${RAIZ_NFS}temp`;

/**
 * PURO: o verbo REAL de um `arrITSDocParams`. **`GuiSapInfo` é um ENVELOPE**: quando o
 * `ITSDocMethod` é `GuiSapInfo`, o método verdadeiro está em `Method` — é o que o despacho do
 * renderer faz (`"GuiSapInfo"===K.ITSDocMethod ? R[K.Method] : R[K.ITSDocMethod]`).
 *
 * Medido na TEST_FRONT_SERVICES (s4h 758/250, 06/09/2026): `GetTempPath`, `ClipboardExport`,
 * `ClipboardImport`, `DirectoryCreate` e `DirectoryRemove` chegam TODOS como
 * `ITSDocMethod:'GuiSapInfo'`, com o nome no `Method`. Olhar só o `ITSDocMethod` (o que a lib
 * fazia até aqui) manda cinco métodos diferentes para o mesmo galho do `switch`.
 */
export const verboDoItsdoc = (doc) => (doc?.ITSDocMethod === 'GuiSapInfo' && doc?.Method
  ? doc.Method
  : doc?.ITSDocMethod) ?? null;

/**
 * PURO: o `Filter` do pedido virado RegExp, como o renderer o traduz (função `h` do
 * `invoke_itsdoc`): `*.*` é tudo, o `.` é literal, `*` vira `.*`, `?` vira `.?`, e a comparação é
 * ancorada e sem caixa.
 */
export function filtroDoItsdoc(filtro) {
  let f = String(filtro ?? '*');
  if (f === '*.*' || f === '') f = '*';
  f = f.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.?');
  return new RegExp(`^${f}$`, 'i');
}

/**
 * PURO: o CORPO do `directorylistfiles` — a listagem de arquivos no formato do renderer.
 *
 * `arquivos` são `{ nome, tamanho, dir }`. Os outros doze campos por entrada (`ishidden`,
 * `issystem`, `isreadonly`, `isarchived`, `isnormal`, `iscompress`, `create*`, `access*`,
 * `write*`) o RENDERER TAMBÉM manda zerados — o FS virtual do browser não tem esses atributos, e
 * a lib não inventa o que ele não tem. `RetLong` falso corta o tamanho em 2³¹−1, como lá.
 */
export function corpoDaListaDeArquivos(arquivos = [], { filtro = '*', retLong = false } = {}) {
  const re = filtroDoItsdoc(filtro);
  const TETO = 2 ** 31 - 1;
  let n = 0, campos = '';
  for (const a of arquivos) {
    const nome = String(a?.nome ?? '');
    if (!re.test(nome)) continue;
    let tam = Number.parseInt(a?.tamanho, 10);
    if (!Number.isFinite(tam)) tam = 0;
    if (!retLong && tam > TETO) tam = TETO;
    campos += `&filename${n}=${ecodificar(nome)}&filelength${n}=${tam}&isdir${n}=${a?.dir ? '1' : '0'}`
      + `&ishidden${n}=0&issystem${n}=0&isreadonly${n}=0&isarchived${n}=0&isnormal${n}=0&iscompress${n}=0`
      + `&createdate${n}=00000000&createtime${n}=000000&accessdate${n}=00000000&accesstime${n}=000000`
      + `&writedate${n}=00000000&writetime${n}=000000`;
    n++;
  }
  return `count=${n}${campos}`;
}

/**
 * PURO: o CORPO do `clipboardimport` — o texto do clipboard do "frontend" linha a linha, como o
 * renderer o monta (função `G` do fsmutil). Clipboard vazio é `ImpClpbrdLength=-1&count=0`, que é
 * o que a lib responde quando ninguém lhe deu texto.
 */
export function corpoDoClipboard(texto = null) {
  const linhas = texto === null || texto === undefined || texto === ''
    ? [] : String(texto).replace(/\r\n/g, '\n').split('\n');
  const campos = linhas.map((l, i) => `&ImpClpbrdText${i + 1}=${ecodificar(l)}`).join('');
  return `ImpClpbrdLength=${linhas.length > 0 ? linhas.length : -1}&count=${linhas.length}${campos}`;
}

/**
 * PURO: o pedido que ATENDE um `arrITSDocParams` — `{ caminho, corpo, conteudo, envia }`, onde
 * `conteudo: true` diz que a RESPOSTA desse POST é o dado (e não um simples "ok") e `envia: true`
 * diz que o POST leva o ARQUIVO (multipart). É a tradução do despacho do renderer
 * (`invoke_itsdoc`), método a método:
 *
 * | `ITSDocMethod`                 | pedido                                       | leva | a resposta é |
 * |---|---|---|---|
 * | `Query` (`CD`)                 | `query?RetQuery=<caminho>`                   | — | vazia |
 * | `Query` (`FL`/`FE`/`DE`)       | `query?RetQuery=<tamanho|1|0>`               | — | vazia |
 * | `FileSaveDialog`               | `filesavedialog?FileName=…&FileEncoding=…`   | — | vazia |
 * | `FileOpenDialog`               | `fileopendialog?` + `FileName0=…` no CORPO   | — | vazia |
 * | `Export`                       | `get`                                        | — | **o arquivo** |
 * | `Execute`                      | **nada** — só devolve o controle             | — | — |
 * | `Import`                       | `post`                                       | **o arquivo** | vazia |
 * | `ClipboardExport`              | `clipboardexport`                            | — | **o texto** |
 * | `ClipboardImport`              | `clipboardimport?` + o texto no CORPO        | — | vazia |
 * | `GetTempPath`                  | `gettemppath?RetGetTempPath=Z%3A%5Ctemp`     | — | vazia |
 * | `DirectoryListFiles`           | `directorylistfiles?` + a lista no CORPO     | — | vazia |
 * | `Directory` / `FileBrowser`    | `cancel` — são DIÁLOGOS, e não há usuário    | — | vazia |
 * | `DirectoryCreate`              | `directorycreate?RetDirectoryCreate=5`       | — | vazia |
 * | `DirectoryRemove`              | `directoryremove?RetDirectoryRemove=2`       | — | vazia |
 * | `Delete`                       | `delete?RetDelete=2`                         | — | vazia |
 * | `FileCopy`                     | `filecopy?RetFileCopy=5`                     | — | vazia |
 * | `ShowDocument`                 | `showdocument?RetString=3;`                  | — | vazia |
 * | `DpUrlCopy`                    | `dpurlcopy?RetDpUrlCopy=-1`                  | — | vazia |
 * | `DpGetStreamFromUrl`           | `exception`                                  | — | vazia |
 * | qualquer outro                 | **`exception`** (é o que o renderer faz)     | — | vazia |
 *
 * ⚠️ **`GuiSapInfo` é ENVELOPE, não método** — quem decide é `verboDoItsdoc`. Cinco dos verbos
 * acima só chegam assim (`GetTempPath`, `ClipboardExport/Import`, `DirectoryCreate/Remove`).
 *
 * ⚠️ **O default NÃO é `cancel`, é `exception`** — foi o que o renderer sempre fez
 * (`T ? g(T,K) : updown_sendexception(K)`), e o que a lib fazia até o item 113 era MENTIR: `cancel`
 * é "o usuário fechou o diálogo", e a dynpro segue por esse ramo. `cancel` só sobra para os
 * verbos que SÃO diálogo (`Directory`, `FileBrowser`, e um `FileOpenDialog`/`FileSaveDialog` que
 * ninguém queira atender).
 *
 * ⚠️ **A lib não tem filesystem, e isto aqui é a decisão de que não vai ter** (ver
 * `docs/receita-webgui.md`, "o ITSDoc como superfície de ataque"). Os verbos que MODIFICAM
 * (`Delete`, `DirectoryCreate/Remove`, `FileCopy`, `DpUrlCopy`) respondem o código de FALHA do
 * próprio renderer — o mesmo que um browser daria sobre um caminho que não existe — e `Execute`
 * não POSTa nada. Nenhum deles toca disco: um servidor SAP não manda no disco de quem o chama.
 *
 * ⚠️ O `Query` tem QUATRO sub-verbos e a resposta é DIFERENTE em cada um (`Query` no renderer):
 * `CD` = diretório corrente (o caminho), `FL` = o TAMANHO do arquivo em bytes, `FE` = o arquivo
 * existe? (`1`/`0`), `DE` = o diretório existe? (`1`/`0`). Responder `CD` para todos DERRUBA o
 * programa: medido em 06/09/2026 que a CG3Y pergunta `Query:'FE'` e recebendo `Z:\` deu **dump**
 * (`work/POC_webgui_import/medicoes/item72-import.md`). O `dado` é quem decide o `FL`/`FE`: com
 * arquivo em mãos o frontend "tem" o arquivo (`FE=1`, `FL=<bytes>`); sem, não tem (`0`/`0`).
 * ⚠️ O `CD` do renderer responde `sfstonfs("")`, que em Windows é a própria raiz `Z:\` — medido no
 * item 45 que responder VAZIO faz o servidor repetir o `CD`.
 * ⚠️ `caminho: null` é "não POSTe nada, só devolva o controle" — é o `default` do switch do `Query`.
 */
export function pedidoDoItsdoc(doc, { caminho = RAIZ_NFS, arquivo = `${RAIZ_NFS}lista.txt`, encoding = '4110',
  dado = null, arquivos = [], texto = null, temp = TEMP_NFS } = {}) {
  const url = doc?.URL ?? '';
  const metodo = verboDoItsdoc(doc);
  const pedido = (p, extra = {}) => ({ caminho: p, corpo: '', conteudo: false, envia: false, ...extra });
  if (metodo === 'Query') {
    const resposta = {
      CD: ecodificar(caminho),
      FL: String(dado ? dado.length : 0),
      FE: dado ? '1' : '0',
      DE: '1',
    }[doc?.Query];
    if (resposta === undefined) return pedido(null);
    return pedido(`${url}query?RetQuery=${resposta}`);
  }
  if (metodo === 'FileSaveDialog') return pedido(`${url}filesavedialog?FileName=${ecodificar(arquivo)}&FileEncoding=${encoding}`);
  // O renderer manda os parâmetros do FileOpenDialog no CORPO, não na URL (função `g` do fsmutil) —
  // e `count`/`FileName<n>` são a multisseleção. `FileEncoding` só vai quando o pedido a pede.
  if (metodo === 'FileOpenDialog') {
    return pedido(`${url}fileopendialog?`, {
      corpo: `FileEncoding=${doc?.WithEncoding ? encoding : ''}&count=1&FileName0=${ecodificar(arquivo)}`,
    });
  }
  // `Execute` é "abra no frontend o arquivo que acabou de baixar" — e NÃO tem POST: no renderer
  // (`R.Execute = m` → `y(K, updown_send_okcode, …)`, webgui_min.js) ele só chama o okcode de volta.
  // Vem depois do `Export` do XLSX (item 73). Medido nos dois lados: responder `cancel` aqui também
  // conclui (mesma mensagem, mesmo arquivo), mas o fiel ao renderer é não postar nada.
  if (metodo === 'Execute') return pedido(null);
  if (metodo === 'Export') return pedido(`${url}get`, { conteudo: true });
  if (metodo === 'Import') return pedido(`${url}post`, { envia: true });
  if (metodo === 'ClipboardExport') return pedido(`${url}clipboardexport`, { conteudo: true });
  if (metodo === 'ClipboardImport') return pedido(`${url}clipboardimport?`, { corpo: corpoDoClipboard(texto) });
  // Os dois INOFENSIVOS, e os únicos que a lib responde com um "sim": o temp é a constante do
  // renderer, e a listagem é a que o chamador entregou (vazia, se não entregou nada).
  if (metodo === 'GetTempPath') return pedido(`${url}gettemppath?RetGetTempPath=${ecodificar(temp)}`);
  if (metodo === 'DirectoryListFiles') {
    return pedido(`${url}directorylistfiles?`, {
      corpo: corpoDaListaDeArquivos(arquivos, { filtro: doc?.Filter ?? '*', retLong: !!doc?.RetLong }),
    });
  }
  // Diálogos: sem usuário para escolher, "cancelar" é a resposta VERDADEIRA (é o que o renderer
  // manda quando alguém fecha a janela) — e é a única sobrevivente do antigo default `cancel`.
  if (metodo === 'Directory' || metodo === 'FileBrowser') return pedido(`${url}cancel`);
  // Os que MODIFICAM o frontend: a lib não tem filesystem, então responde a FALHA que o renderer
  // daria sobre um caminho inexistente. Os códigos são os do próprio `webgui_min.js`:
  //   Delete           0 removido · 2 não existe · 5 é diretório · 32 remove falhou
  //   DirectoryRemove  0 removido · 1 erro · 2 não existe · 5 remove falhou
  //   DirectoryCreate  0 criado · 3 caminho não encontrado · 5 erro · 183 já existe
  //   FileCopy         0 copiado · 5 cópia falhou
  //   DpUrlCopy        0 copiado · -1 erro
  if (metodo === 'Delete') return pedido(`${url}delete?RetDelete=2`);
  if (metodo === 'DirectoryRemove') return pedido(`${url}directoryremove?RetDirectoryRemove=2`);
  if (metodo === 'DirectoryCreate') return pedido(`${url}directorycreate?RetDirectoryCreate=5`);
  if (metodo === 'FileCopy') return pedido(`${url}filecopy?RetFileCopy=5`);
  if (metodo === 'DpUrlCopy') return pedido(`${url}dpurlcopy?RetDpUrlCopy=-1`);
  // ShowDocument é "abra este documento no frontend": sem janela para abrir, o `RetString` de erro.
  if (metodo === 'ShowDocument') return pedido(`${url}showdocument?RetString=3;`);
  // O `DpGetStreamFromUrl` só aceita `file:` — e um frontend sem filesystem não tem `file:` nenhum.
  // É exatamente o galho em que o renderer manda exception ("only file urls supported").
  return pedido(`${url}exception`);
}

/** O campo do multipart que o renderer usa para entregar o arquivo no `Import`. */
const CAMPO_IMPORT = 'LOCALFILE1';

/** O que o multipart do `FormData` custa por cima do arquivo — 186 B, constante (boundary de tamanho fixo). */
export const MULTIPART_IMPORT = 186;

/**
 * O TETO de um `Import`, em bytes de ARQUIVO. Medido no s4h 758/250 em 06/09/2026 (item 112,
 * `work/POC_webgui_import/medicoes/item112-teto.md`).
 *
 * Quem corta NÃO é o renderer: o `maximum file size` dele é `Math.pow(2,31)-1` (2 GiB−1), constante
 * literal no `webgui_min.js` — não é parâmetro de sistema, e não existe nenhum `updown*` no perfil.
 * Quem corta é o **ICM**, pelo `icm/HTTP/max_request_size_KB`, e a conta é sobre o CORPO inteiro da
 * requisição: passa enquanto `floor(corpo/1024) <= max_request_size_KB`. Medido ao byte com esse
 * parâmetro em 102400: 104 858 623 B de corpo passam, 104 858 624 B levam **413**.
 *
 * ⚠️ Acima do teto o erro pode NÃO chegar como 413: medido que o ICM também fecha a conexão no meio
 * do envio (`ECONNRESET` / `UND_ERR_SOCKET`). Recusa é recusa — só não conte com o código.
 */
export const tetoDoImport = (maxRequestSizeKB = 102400) => (maxRequestSizeKB + 1) * 1024 - 1 - MULTIPART_IMPORT;

/**
 * O POST do ITSDoc: fora do `batch/json`, na URL que o próprio pedido trouxe — é o XHR que o
 * renderer faz (`UpDownSendRequest`). Devolve o corpo como `Buffer` (o arquivo pode ser binário).
 *
 * Duas formas, e a diferença é o terceiro argumento do renderer:
 *   • sem arquivo — `x-www-form-urlencoded` + `X-Requested-With`, corpo vazio ou o `corpo` do pedido;
 *   • com arquivo (`Import`) — `UpDownSendRequest(…, "X", …)`, e o `"X"` DESLIGA os dois headers:
 *     quem manda é o `FormData` (campo `LOCALFILE1`, `Blob` de `application/octet-stream`), com o
 *     `multipart/form-data; boundary=…` que o próprio `fetch` monta.
 */
async function updown(sessao, { caminho, corpo = '', envia = false } = {}, { dado = null, tetoMs = 180000 } = {}) {
  const url = `${sessao.cfg.base}${caminho}`;
  const headers = { Authorization: autorizacao(sessao.cfg), Cookie: cookieDoJar(sessao.jar) };
  let body = corpo;
  if (envia) {
    if (!dado) throw new Error('its: o ITSDoc pediu Import e não há arquivo para entregar — passe `dado` (Buffer)');
    body = new FormData();
    body.append(CAMPO_IMPORT, new Blob([dado], { type: 'application/octet-stream' }));
  } else {
    headers['Content-type'] = 'application/x-www-form-urlencoded';
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }
  const t0 = Date.now();
  let res, buf;
  try {
    res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(tetoMs) });
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    // Acima do teto o ICM pode FECHAR a conexão em vez de responder 413 — o erro de rede é a recusa.
    const alem = envia && dado.length > tetoDoImport() ? `, ACIMA do teto medido de ${tetoDoImport()} B` : '';
    const quanto = envia ? ` (entregando ${dado.length} B${alem})` : '';
    throw new Error(`its: o ITSDoc falhou${quanto} — ${e.cause?.code || e.name}: ${e.message}`);
  }
  const ms = Date.now() - t0;
  logHttp('POST', urlNoLog(url), res.status, ms, buf.length);
  // O renderer trata `200 !== status` como erro, e o **413** à parte (`UpDownFSResponseError413`):
  // ele não vem da aplicação, vem do ICM. Antes do item 112 isto passava CALADO — um 413 virava
  // "0 B, tudo bem" e o laço seguia devolvendo o controle à dynpro com o arquivo pela metade.
  if (res.status !== 200) {
    const porque = res.status === 413
      ? `o ICM recusou o TAMANHO (413) — o corpo tem ${envia ? dado.length + MULTIPART_IMPORT : String(corpo).length} B, e o teto é o icm/HTTP/max_request_size_KB (com 102400, dá ${tetoDoImport()} B de arquivo)`
      : `HTTP ${res.status}`;
    throw new Error(`its: o ITSDoc recusou o POST — ${porque}`);
  }
  return { status: res.status, tipo: res.headers.get('content-type'), bytes: buf.length, ms, corpo: buf };
}

/**
 * ATENDE o diálogo do ITSDoc até o servidor parar de pedir — o laço do renderer, nas DUAS direções.
 *
 * A dynpro que quer arquivo (ler ou gravar) não fala pelo batch: ela publica um `arrITSDocParams` e
 * PARA, esperando o frontend. Aqui esse frontend é o Node: para cada pedido, `pedidoDoItsdoc`
 * diz o verbo, `updown` o POSTa fora do batch, e `OK_ITSDOC` devolve o controle à dynpro. Repete
 * enquanto vier pedido.
 *
 * `dado` (Buffer) é o arquivo a ENTREGAR — é ele que atende o `Import` e que responde o `Query FL/FE`.
 * Sem `dado`, o laço só recebe (`Export`, `clipboardexport`) e um `Import` estoura com o motivo.
 *
 * Devolve `{ conteudo (Buffer concatenado do que veio), partes, voltas, pedidos, metodos, ultima }` —
 * `ultima` é a resposta do último `OK_ITSDOC`, já com a mensagem da dynpro ("File … foi transferido
 * para …").
 *
 * ⚠️ **As duas direções NÃO são simétricas** (medido no item 112, até 64 MB):
 *   • a SAÍDA fatia, em pedaços de 5 120 000 B — 64 MB desceram em 14 `Export` (15 voltas), daí
 *     acumular PARTES em vez de tomar a primeira resposta pelo arquivo;
 *   • a ENTRADA **não fatia**: 64 MB subiram num `Import` só, 1 volta, sha256 idêntico.
 * É por causa da saída que o `voltasMax` padrão é 40 e não 12 — e que estourá-lo agora ESTOURA, em
 * vez de devolver o arquivo truncado calado. Conta grosseira: `voltas ≈ bytes / 5 120 000 + 2`.
 */
export async function atenderItsdoc(sessao, resposta, { dado = null, arquivo = `${RAIZ_NFS}lista.txt`, encoding = '4110', caminho = RAIZ_NFS,
  arquivos = [], texto = null, temp = TEMP_NFS, voltasMax = 40, tetoMs = 180000 } = {}) {
  const partes = [], metodos = [];
  let r = resposta, voltas = 0, pedidos = 0;
  for (; voltas < voltasMax; voltas++) {
    const doc = itsdocDoDelta(r.corpo ?? '');
    if (!doc) break;
    // o nome REAL do verbo — `GuiSapInfo` é envelope, e um log de cinco `GuiSapInfo` iguais foi o
    // que escondeu o `GetTempPath` até o item 113
    metodos.push(doc.Query ? `${verboDoItsdoc(doc)}(${doc.Query})` : verboDoItsdoc(doc));
    const pedido = pedidoDoItsdoc(doc, { caminho, arquivo, encoding, dado, arquivos, texto, temp });
    if (pedido.caminho) {
      const q = await updown(sessao, pedido, { dado, tetoMs });
      pedidos++;
      if (pedido.conteudo && q.bytes) partes.push(q.corpo);
    }
    r = await postar(sessao, OK_ITSDOC, { tetoMs });
  }
  // O laço acabar POR TETO com o servidor AINDA pedindo é arquivo TRUNCADO — e antes do item 112
  // ele voltava calado, com o `conteudo` pela metade. 64 MB descem em 15 voltas; o teto era 12.
  if (voltas === voltasMax && itsdocDoDelta(r.corpo ?? '')) {
    throw new Error(`its: atenderItsdoc parou em ${voltasMax} volta(s) e o servidor AINDA está pedindo (${metodos.at(-1)}) — o que veio até aqui (${partes.reduce((a, p) => a + p.length, 0)} B em ${partes.length} parte(s)) está TRUNCADO; suba o voltasMax`);
  }
  const conteudo = Buffer.concat(partes);
  detalhe(`its: atenderItsdoc — ${voltas} volta(s) [${metodos.join(' → ') || '—'}], ${pedidos} pedido(s), ${conteudo.length} B recebido(s)`);
  return { conteudo, partes: partes.length, voltas, pedidos, metodos, ultima: r };
}

/**
 * EXPORTA a lista da tela pelo gesto do próprio ALV — *Exportar → File local...* (`btn[45]`,
 * `CTRL_SHIFT_F9`) — e devolve o ARQUIVO, sem navegador e sem disco de frontend nenhum.
 *
 * O canal TEM via de saída (era a dúvida da fila 45): não pelo batch, mas pelo **ITSDoc**, um
 * diálogo à parte em `…/bc/gui/sap/its/webgui/<n>/data/<id>~<verbo>`. O laço aqui é o do renderer:
 * ler o `arrITSDocParams` do delta, POSTar o verbo correspondente (`pedidoDoItsdoc`), devolver o
 * controle com `OK_ITSDOC`, repetir enquanto o servidor pedir.
 *
 * Devolve `{ formato, arquivo, conteudo (Buffer), bytes, partes, voltas, pedidos, ms }`.
 *
 * Medido no s4h 758/250 em 05/09/2026 sobre a lista do RSPARAM (1617 linhas × 5 colunas),
 * `work/POC_webgui_export/medicoes/item45-exportar.md`:
 *
 * | formato | saída | bytes | download |
 * |---|---|---:|---:|
 * | `nao-convertido` | texto de largura fixa, 1617 linhas + cabeçalho | 1,08 MB | 77 ms |
 * | `tabuladores` | **TSV** — uma coluna por `\t`, com cabeçalho | 182 KB | 62 ms |
 * | `html` | HTML, em **2 partes** de `Export` | 6,76 MB | 251 ms |
 * | `clipboard` | texto, num POST só (`clipboardexport`, sem arquivo) | 1,07 MB | 100 ms |
 *
 * O `tabuladores` custa **68× menos** que ler o mesmo ALV por `lerGrid` (182 KB contra 12,4 MB) e
 * já vem estruturado — mas é a lista FORMATADA pelo ALV (cabeçalho traduzido, valor com máscara),
 * não o dado cru que o `lerGrid` devolve.
 *
 * ⚠️ `planilha` tem uma etapa A MAIS: o Avançar abre o popup **Export As** e quem dispara o ITSDoc
 * é o "Exportar para..." de lá (tratado aqui desde o item 73). O XLSX que sai por este caminho é a
 * LISTA espalhada em células (1620 × 32, coluna de margem, 206 650 B) — para o GRID limpo
 * (1618 × 5, 88 061 B) o gesto é outro: `exportarPlanilha` (`btn[43]`).
 * ⚠️ Arquivo grande vem FATIADO: o HTML veio em dois `Export` (5.120.000 B + 1.643.878 B), daí
 * `partes` e a concatenação.
 */
export async function exportarLista(sessao, { formato = 'tabuladores', arquivo = `${RAIZ_NFS}lista.txt`, encoding = '4110', alvo = null, voltasMax = 40, tetoMs = 180000 } = {}) {
  const idx = typeof formato === 'number' ? formato : FORMATOS[formato];
  if (idx === undefined) throw new Error(`its: exportarLista — formato desconhecido "${formato}" (tem: ${Object.keys(FORMATOS).join(', ')})`);
  const t0 = Date.now();
  const botao = alvo ?? { sid: 'wnd[0]/tbar[1]/btn[45]' };
  if (!alvo && !sessao.sids.some((x) => x.sid === botao.sid)) {
    throw new Error('its: exportarLista — a tela não tem o botão "File local..." (wnd[0]/tbar[1]/btn[45]); é uma lista ALV?');
  }
  await acionar(sessao, botao, { tetoMs });
  const radios = (popupDaSessao(sessao)?.campos ?? [])
    .filter((c) => /radSPOPLI-SELFLAG\[\d+,0\]$/.test(c.sid));
  const radio = radios[idx];
  if (!radio) throw new Error(`its: exportarLista — o popup de formato tem ${radios.length} opção(ões), não a de índice ${idx}`);
  await postar(sessao, [{ post: `action/4/${radio.sid}` }, ESTADO], { tetoMs });
  let r = await postar(sessao, [ENTER, ESTADO], { tetoMs });
  // o formato PLANILHA não vai ao ITSDoc pelo Avançar: ele abre o popup "Export As", e quem
  // dispara é o "Exportar para..." de lá (item 73).
  if (exportAsDoPopup(popupDaSessao(sessao))) {
    ({ r } = await dispararExportAs(sessao, { nome: nomeDoArquivo(arquivo), tetoMs, de: 'exportarLista' }));
  }

  const { conteudo, partes, voltas, pedidos } = await atenderItsdoc(sessao, r, { arquivo, encoding, voltasMax, tetoMs });
  detalhe(`its: exportarLista ${formato} — ${conteudo.length} B em ${partes} parte(s), ${voltas} volta(s) do ITSDoc`);
  return { formato, arquivo, conteudo, bytes: conteudo.length, partes, voltas, pedidos, ms: Date.now() - t0 };
}

/**
 * PURO: o popup **Export As** do ALV (`SAPLSALV_GUI_CUL_EXPORT_AS`) — `{ sid, titulo, nome,
 * formato, destino, botao, valores }`, ou `null` se a modal aberta é outra coisa.
 *
 * É o desvio do formato PLANILHA: ele não é um popup de confirmação, é a segunda etapa do gesto.
 * O `nome` é o campo do nome do arquivo (SEM extensão — quem põe é o `DefExt` do ITSDoc), `formato`
 * e `destino` são os dois combos, e `botao` é o "Exportar para..." (`wnd[1]/tbar[0]/btn[20]`,
 * `SHIFT_F8`) — é ele, não o Enter, que dispara o ITSDoc.
 *
 * Medido no s4h 758/250 em 06/09/2026 (item 73): os dois combos tinham UMA opção cada
 * (`xlsx-CUSTOM` "Microsoft Excel (*.xlsx)" e `L` "Local"), daí `valores` vir junto — quem
 * encontrar mais de uma sabe que aqui há escolha a fazer, e que ela ainda não está medida.
 */
export function exportAsDoPopup(popup) {
  if (!popup) return null;
  const ache = (re) => popup.campos?.find((c) => re.test(c.sid))?.sid ?? null;
  const nome = ache(/txtGS_EXPORT-FILE_NAME$/);
  const botao = popup.botoes?.find((b) => /tbar\[0\]\/btn\[20\]$/.test(b.sid))?.sid ?? null;
  if (!nome || !botao) return null;
  const formato = ache(/cmbGS_EXPORT-FORMAT$/), destino = ache(/cmbGS_EXPORT-DESTINATION$/);
  const valor = (sid) => popup.campos.find((c) => c.sid === sid)?.valor ?? null;
  return { sid: popup.sid, titulo: popup.titulo, nome, formato, destino, botao,
           valores: { nome: valor(nome), formato: valor(formato), destino: valor(destino) } };
}

/** Preenche o nome e aciona o "Exportar para..." do Export As — a segunda etapa do gesto planilha. */
async function dispararExportAs(sessao, { nome = null, tetoMs = 180000, de = 'exportar' } = {}) {
  const cx = exportAsDoPopup(popupDaSessao(sessao));
  if (!cx) throw new Error(`its: ${de} — a tela não abriu o popup "Export As" (GS_EXPORT-FILE_NAME + btn[20]); o formato planilha passa por ele`);
  if (nome) preencher(sessao, { sid: cx.nome }, nome);
  const r = await acionar(sessao, { sid: cx.botao }, { tetoMs });
  return { r, cx };
}

/** O nome NU de um caminho virtual (`Z:\lista.txt` → `lista`) — é o que o Export As quer no
 * `GS_EXPORT-FILE_NAME`: sem pasta e sem extensão (a extensão vem do `DefExt` do ITSDoc). */
const nomeDoArquivo = (caminho) => String(caminho ?? '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '') || null;

/** O nome que o Export As traz por padrão tem carimbo de hora; este é o nosso, para o arquivo virtual. */
const nomePadrao = () => `EXPORT_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

/**
 * EXPORTA o ALV em **XLSX** — o caminho que o usuário final usa para planilha, e o único formato
 * que NÃO sai pelo popup de 6 radios do `exportarLista`.
 *
 * O gesto é o `wnd[0]/tbar[1]/btn[43]` da barra do ALV ("Planilha eletrônica...", `CTRL_SHIFT_F7`).
 * Ele abre o popup **Export As** (`exportAsDoPopup`); quem dispara o ITSDoc é o "Exportar para..."
 * do popup, não o Enter. Daí o laço é o de sempre (`atenderItsdoc`), com uma volta a mais:
 * `FileSaveDialog` → `Export` → `Execute`.
 *
 * Devolve `{ nome, arquivo, conteudo (Buffer do XLSX), bytes, partes, voltas, pedidos, metodos,
 * mensagem, ms }`.
 *
 * Medido no s4h 758/250 em 06/09/2026 sobre a lista do RSPARAM (1617 linhas × 5 colunas),
 * `work/POC_webgui_planilha/medicoes/item73-planilha.md`: **88 061 B** de XLSX real (assinatura
 * `PK\x03\x04`, 9 partes OOXML), 1618 linhas × 5 colunas na `sheet1` — cabeçalho na linha 1 e
 * **uma coluna por coluna do ALV**.
 *
 * ⚠️ **`btn[43]` e `btn[45]`→radio `planilha` NÃO dão o mesmo arquivo.** As duas vias abrem o MESMO
 * popup e o MESMO ITSDoc, e os 1617 parâmetros batem 1617 de 1617 — mas o `btn[45]` exporta a
 * LISTA (o layout de impressão espalhado em células: 1620 linhas × 32 colunas, coluna A de margem,
 * cabeçalho na linha 2, texto com padding de espaços, 206 650 B) e o `btn[43]` exporta o GRID
 * (5 colunas limpas, 88 061 B). Para planilha que alguém vai usar, `btn[43]` — é este o default aqui.
 * ⚠️ O `formato` e o `destino` do popup são combos; no sistema medido tinham UMA opção cada
 * (XLSX / Local). Sistema com mais de uma não está medido — o `exportAsDoPopup` devolve os
 * `valores` justamente para isso aparecer.
 */
export async function exportarPlanilha(sessao, { nome = nomePadrao(), arquivo = null, encoding = '4110', alvo = null, voltasMax = 40, tetoMs = 180000 } = {}) {
  const t0 = Date.now();
  const botao = alvo ?? { sid: 'wnd[0]/tbar[1]/btn[43]' };
  if (!alvo && !sessao.sids.some((x) => x.sid === botao.sid)) {
    throw new Error('its: exportarPlanilha — a tela não tem o botão "Planilha eletrônica..." (wnd[0]/tbar[1]/btn[43]); é uma lista ALV?');
  }
  await acionar(sessao, botao, { tetoMs });
  const { r, cx } = await dispararExportAs(sessao, { nome, tetoMs, de: 'exportarPlanilha' });
  const virtual = arquivo ?? `${RAIZ_NFS}${nome}.xlsx`;
  const a = await atenderItsdoc(sessao, r, { arquivo: virtual, encoding, voltasMax, tetoMs });
  detalhe(`its: exportarPlanilha ${nome} — ${a.conteudo.length} B [${a.metodos.join(' → ')}], formato ${cx.valores.formato}/${cx.valores.destino}`);
  return { nome, arquivo: virtual, conteudo: a.conteudo, bytes: a.conteudo.length, partes: a.partes,
           voltas: a.voltas, pedidos: a.pedidos, metodos: a.metodos, mensagem: a.ultima?.mensagem ?? null,
           formato: cx.valores.formato, destino: cx.valores.destino, ms: Date.now() - t0 };
}

// ---------- dirigir ----------

/**
 * Escreve num campo. NÃO fala com o servidor: enfileira `focus`+`value` para ir NO MESMO batch da
 * próxima ação (`acionar`, `enter`, `enviar`) — é assim que o renderer manda, e é a forma medida
 * (`value/txtMAX_SEL` + `action/3/…/btn[8]` no mesmo POST → "2 acertos"). O alvo é resolvido AGORA
 * contra a tela atual (nome errado estoura aqui, não como `-101` depois). Devolve `{ sid, valor, pendentes }`.
 * `{ janela: 'wnd[0]' }` escopa o alvo quando há popup aberto (por padrão vale a janela ativa).
 *
 * **Num COMBO (`GuiComboBox`) o que vai postado é a CHAVE** — o `data-itemkey` da opção —, e não o
 * que a tela mostra: medido (item 114) que o servidor recusa o TEXTO com `-107 failed to set value:
 * invalid value`, igual a lixo. Por isso o valor passa antes pelo `chaveDaOpcao` do combo, que
 * aceita a chave, o texto ou o índice e traduz; opção inexistente estoura AQUI, com o cardápio.
 * O `valor` devolvido é o que REALMENTE foi enfileirado (a chave), e vem com `combo` junto.
 * `{ cru: true }` desliga a tradução — para MEDIR combo que a lista do delta não descreve.
 */
export function preencher(sessao, alvo, valor, { janela = null, cru = false } = {}) {
  const sid = sidDoAlvo(sessao.sids, typeof alvo === 'string' && !/^wnd\[/.test(alvo) ? { campo: alvo } : alvo, { janela });
  const combo = cru ? null : comboDaSessao(sessao, sid);
  const conteudo = combo ? chaveDaOpcao(combo, valor) : valor;
  sessao.fila.push(...batchPreencher(sid, conteudo));
  return { sid, valor: String(conteudo ?? ''), pendentes: sessao.fila.length / 2, ...(combo ? { combo: combo.sid } : {}) };
}

/** O combo da tela ATUAL que responde por um SID — `null` quando aquele SID não é `GuiComboBox`
 * (o caso comum: não há por que varrer o delta atrás de lista para um campo de texto). */
function comboDaSessao(sessao, sid) {
  if (sessao?.sids?.find((x) => x.sid === sid)?.tipo !== 'GuiComboBox') return null;
  return comboDoSid(combosDoDelta(sessao.delta ?? ''), sid);
}

/**
 * O CARDÁPIO de um combo da tela atual — `{ sid, chave, texto, opcoes: [{ indice, chave, texto }] }`,
 * do último `delta`, sem tocar a rede. É o que se lê ANTES de escolher; `opcoes: null` = o delta não
 * trouxe a lista daquele combo, e aí só o `texto` corrente é conhecido.
 */
export function opcoes(sessao, alvo, { janela = null } = {}) {
  const sid = sidDoAlvo(sessao.sids, typeof alvo === 'string' && !/^wnd\[/.test(alvo) ? { campo: alvo } : alvo, { janela });
  const combo = comboDaSessao(sessao, sid);
  if (!combo) throw new Error(`its: ${sid} não é um combo (GuiComboBox) — os combos da tela são `
    + (combosDoDelta(sessao.delta ?? '').map((c) => c.sid).filter(Boolean).join(', ') || '(nenhum)'));
  return combo;
}

/** Manda o que está enfileirado, sem ação nenhuma (só `ESTADO`). Devolve o `lerResposta`. */
export const enviar = (sessao, opts) => despachar(sessao, [], opts);

/**
 * Aciona um botão pelo OK-code (`'btn[8]'`, `8`, `'Executar'`) ou pelo SID inteiro, levando junto o
 * que foi `preencher`-ido. `pegou: false` é INFORMAÇÃO: veio `multipart`, e `motivo` traz o
 * `X-Code`/`X-Status` — a ação não pegou, e o protocolo disse por quê.
 *
 * ⚠ O botão é resolvido NA JANELA ATIVA: com popup aberto o delta traz também a barra da `wnd[0]`,
 * e `btn[0]` existe nas duas (medido, `d2-o.txt`). Para acionar a barra de trás do modal é preciso
 * dizê-lo — `acionar(s, 'btn[15]', { janela: 'wnd[0]' })` — ou passar o SID inteiro.
 *
 * **`{ evento }` aciona pelo que a tela DECLARA** (item 71), em vez do `action/3` fixo: o batch sai
 * do `lsevents` daquele controle, composto por família (§ o DISPARO que a tela DECLARA). É assim
 * que se aciona o que não é botão — `acionar(s, { sid: 'wnd[0]/mbar/menu[0]' }, { evento: 'Select' })`
 * dá o `action/4/<SID>` que o item 49 mediu, e `{ evento: 'FieldHelpPress' }` num campo com match
 * code dá o `focus/<SID>` + `vkey/4/ses[0]` do item 22 — não o `vkey/4/<SID>` que a concatenação
 * ingênua produziria. `{ valor }` alimenta os comandos que levam conteúdo (`value`, `okcode`).
 * ⚠ O comando vem do último `delta`; a composição de `action/1|2|25|64`–`68` é presumida pela
 * família, não medida (a contra-prova de execução é o item 43).
 */
export async function acionar(sessao, alvo, opts) {
  // objeto ({ sid }/{ okcode }) e SID cru passam como estão; o resto ('btn[8]', 8, 'Executar') é OK-code
  const alvoBotao = typeof alvo === 'object' || /^wnd\[/.test(String(alvo)) ? alvo : { okcode: alvo };
  const sid = sidDoAlvo(sessao.sids, alvoBotao, { janela: opts?.janela ?? null });
  const { evento = null, valor = null, content = null, ...resto } = opts ?? {};
  const batch = evento
    ? batchDoEvento(controleDaSessao(sessao, sid), evento, { valor, content, sid })
    : batchAcionar(sid);
  const r = await despachar(sessao, batch, resto);
  return { ...r, sid };
}

/** O controle da tela ATUAL que responde por um SID — a fonte do `lsevents` do `{ evento }`. */
function controleDaSessao(sessao, sid) {
  if (!sessao?.delta) throw new Error('its: sem delta para ler o disparo declarado — abra a sessão (o boot traz a primeira tela)');
  const c = controleDoSid(controlesDoDelta(sessao.delta), sid);
  if (!c) throw new Error(`its: nenhum controle da tela carrega o SID ${sid} — o lsevents é do CONTROLE, não do SID solto`);
  return c;
}

/** Os eventos POSTÁVEIS de um alvo da tela atual — o cardápio antes de escolher o `{ evento }`. */
export function eventosDoAlvo(sessao, alvo, { janela = null } = {}) {
  const sid = sidDoAlvo(sessao.sids, typeof alvo === 'object' || /^wnd\[/.test(String(alvo)) ? alvo : { okcode: alvo }, { janela });
  return { sid, eventos: eventosDoControle(controleDaSessao(sessao, sid)) };
}

/** O Enter da dynpro (`vkey/0/ses[0]`), levando junto o que foi preenchido. Medido: `T000` no
 * campo + Enter → tela de seleção da T000. */
export const enter = (sessao, opts) => despachar(sessao, [ENTER], opts);

/** Tecla virtual pelo NÚMERO cru (`vkey/<n>/ses[0]`) — a via de MEDIR uma tecla fora do `VKEYS`. */
export const vkey = (sessao, n, opts) => despachar(sessao, batchVkey(n), opts);

/**
 * A TECLA pelo nome — o mesmo gesto do `tecla` do webgui.mjs, e o endereço mais estável do canal:
 * `tecla(s, 'F8')`, `'F3'`, `'Shift+F3'`, `'F12'`, `'F11'`, `'F4'`, `'Enter'` (ou o apelido:
 * `'Executar'`, `'Voltar'`, `'Sair'`, `'Cancelar'`, `'Gravar'`). Ao contrário do OK-code, a tecla
 * LEVA o que foi preenchido no mesmo POST — medido: `MAX_SEL=2` + `tecla('F8')` deu "2 acertos".
 */
export const tecla = (sessao, nome, opts) => despachar(sessao, batchVkey(numeroDaTecla(nome)), opts);

/**
 * Manda um OK-code pela caixa de comando: `/nSE16` (de qualquer tela), `/nSMEN` (o menu),
 * `ONLI`/`/8` (fcode e tecla da dynpro), `/nex` (encerra). LEVA o que foi `preencher`-ido, no
 * mesmo POST.
 *
 * ⚠ `/n` (e `/3`) **encerra a transação**, não vai ao menu: medido no s4h 758/250 em 05/09/2026
 * (item 37) que ele cai na tela de fundo da sessão — o SAP Easy Access (`SMEN`) só quando a
 * sessão já carregou o menu alguma vez, e `S000`/`SAPMSYST` (0 campos, 1 botão) quando não,
 * inclusive numa sessão nascida no menu que dá `/n` estando NELE. Para ir ao menu: `/nSMEN`.
 *
 * Isto ANTES recusava valores pendentes ("o OK-code levar valor não está medido"). Medido no s4h
 * 758/250 em 04/09/2026 (item 31, `sap-accelerate/work/POC_webgui_okcode_valores/`, fase H): na
 * tela de seleção da SE16 sobre a T000, o POST
 *   `value/wnd[0]/usr/txtI1-LOW` = "Neduca" · `value/wnd[0]/tbar[0]/okcd` = "ONLI" · `vkey/0/ses[0]`
 * devolveu **"1 acertos"** em 113 ms — o filtro foi aplicado E o fcode executou. Contrafactuais da
 * mesma rodada: o mesmo OK-code SEM o valor traz a tabela inteira ("5 acertos"), e o valor sem
 * fcode nenhum não executa (fica na tela de seleção). Aqui o `okcd` é campo como outro qualquer —
 * quem submete é o Enter, e ele carrega a dynpro toda.
 *
 * ⚠ **ATRAVESSA POPUP, inclusive o modal duro** — e aqui a via HTTP DIVERGE do navegador. Medido no
 * s4h 758/250 em 05/09/2026 (item 58, `POC_webgui_popup/medicoes/spop-comandar.md`): com o **SPOP**
 * de `/nend` aberto (11 SIDs na `wnd[1]`, **zero `btn[n]`** — só `usr/btnSPOP-OPTION1|2`),
 * `comandar(s, '/nSE38')` voltou `delta`/`pegou: true` em 170 ms, `tcode` SE38, popup sumido; a
 * repetição SE38→SE16 fez o mesmo em 86 ms. O SPOP era o de **logoff** e a sessão continuou aberta
 * (o "Sim" devolveria `forma: 'logoff'`, item 23 passo I): o modal foi **descartado**, não
 * respondido. No NAVEGADOR o mesmo gesto trava — o `okcd` da `wnd[0]` para de postar assim que
 * `getPopupCount()` vai a 1 (item 13). Logo: **não é preciso fechar o popup antes de comandar**.
 * Não medido: SPOP com campo obrigatório, ou popup de erro que a dynpro reponha.
 */
export async function comandar(sessao, okcode, opts) {
  const r = await despachar(sessao, batchComandar(okcode), opts);
  return { ...r, okcode: String(okcode).trim() };
}

// ---------- o MENU pela via HTTP pura (item 49) ----------
//
// ⚠ A via HTTP NÃO precisa abrir o menu — e é aí que ela diverge do navegador. No DOM o menu não
// existe antes do clique em `cua2sapmenu_btn` (item 26); no delta-update a árvore INTEIRA da barra
// já vem no BOOT. Medido no s4h 758/250 em 05/09/2026, SE38: **146** `POMNI` de `wnd[0]/mbar/…`,
// três níveis, no primeiro POST — sem clique nenhum. E o `id` do controle É o SID É o caminho
// (`wnd[0]/mbar/menu[5]/menu[3]/menu[0]`), igual ao DOM.
//
// O comando é o `action/4` que o `POMN` (o container do submenu) publica no `Select` — o `POMNI`
// não publica `lsevents` nenhum (null, confirmado nas duas vias). Ele LEVA o SID do item:
//
//   POST [{"post":"action/4/wnd[0]/mbar/menu[5]/menu[3]/menu[0]"},{"get":"state/ur"}]
//   → delta, 76 ms: SE38/SAPLWBABAP "Editor ABAP: 1ª tela" → SA38/SAPMS38M "ABAP: execução do programa"
//
// Contra-provas da mesma rodada (`POC_webgui_menu/medicoes/item49-menu-http.md`):
//   · `action/3` (o Press de botão) no MESMO SID → `-101 not supported`: a família é a do `4`;
//   · `action/4` num nó COM submenu ("Sistema") → `delta` aceito, tela IGUAL, 146 menus antes e
//     depois: "abrir" é gesto de UI, não de protocolo — não há cascata a percorrer aqui;
//   · `action/3/wnd[0]/tbar[0]/[0]` (clicar o botão de menu) → `-102 control not found`.
//
// Um POST, sem Chrome, contra os três a nove do `navegarMenu` do CDP.

/** PURO: os itens da barra de menu que um `delta-update` declara — `id` é o caminho e o SID. */
export const itensDeMenuDoDelta = (corpo) => controlesDoDelta(corpo)
  .filter((c) => c.ct === 'POMNI' && daBarraDeMenu(c.id))
  .map(interpretarItemDeMenu);

/**
 * Os itens de menu da tela atual, do último delta — SEM tocar a rede. Com `{ sob }` só os filhos
 * DIRETOS daquele SID; sem nada, a árvore inteira (`nivel: 0` são os da barra).
 */
export function itensDeMenu(sessao, { sob = null } = {}) {
  if (!sessao?.delta) throw new Error('its: sem delta para ler o menu — abra a sessão (o boot traz a árvore)');
  const itens = itensDeMenuDoDelta(sessao.delta);
  if (sob === null) return itens;
  return itens.filter((i) => filhoDiretoDeMenu(String(sob), i.id));
}

// O percurso por rótulo é o MESMO das duas vias e o código é UM só: `acharCaminhoDeMenu` mora no
// `webgui.mjs`, ao lado dos outros puros do menu, e é reexportado aqui (item 82). Lá ele desce a
// árvore lida dos `<xmp>` do DOM; aqui, a lida do delta — mesmo modelo de item, mesmo erro.
export { acharCaminhoDeMenu };

/**
 * Vai a uma tela pelo CAMINHO de menu, sem saber o tcode e sem navegador:
 *
 * ```js
 * await navegarMenu(s, 'Sistema > Serviços > Reporting');   // da SE38 chega na SA38
 * ```
 *
 * Ao contrário da via do navegador, aqui **não há cascata**: o caminho inteiro é resolvido no
 * delta que já está em mãos e só a FOLHA vira POST (`action/4/<SID>`). Devolve
 * `{ caminho, passos, folha, mudou, popup, ...lerResposta }`; `mudou: false` é INFORMAÇÃO — o
 * comando pegou e a tela ficou igual.
 *
 * ⚠ **`mudou` não diz O QUE mudou, e é aí que uma folha de menu engana.** Medido no s4h 758/250 em
 * 06/09/2026 (item 83, `POC_webgui_menu/medicoes/item83-menu-popup.md`), de uma SE38 limpa:
 *
 * | caminho | `mudou` | dynpro | `popup` |
 * |---|---|---|---|
 * | `Sistema > Status...`            | `true` | SE38/SAPLWBABAP **igual** | `wnd[1]` "Sistema: status" |
 * | `Ajuda > Configurações...`       | `true` | **igual**                 | `wnd[1]` "Configurações individuais…" |
 * | `Utilitários > Configurações...` | `true` | **igual**                 | `wnd[1]` "Configurações específicas…" |
 * | `Sistema > Serviços > Reporting` | `true` | SE38 → **SA38/SAPMS38M**  | `null` |
 *
 * As quatro linhas são `forma: 'delta'`, `pegou: true`, `mudou: true` — **o `mudou` sozinho não
 * separa "abriu modal" de "trocou de tela"**. Quem separa é o `popup`: não-nulo, a tela pediu
 * resposta e a `wnd[0]/usr` está atrás dele; nulo com `mudou: true`, a navegação aconteceu.
 * (O veredito ANTIGO, de só título + dynpro, dava `false` nas três primeiras — o carimbo do item 59
 * já as pegava por causa da `janelaAtiva`; o que faltava era DIZER qual das duas coisas foi.)
 *
 * ⚠ **Com uma modal já aberta o menu MENTE**: os 146 itens continuam no delta e `navegarMenu` os
 * resolve sem reclamar, mas o `action/4` volta `multipart`/`pegou: false` — o modal engole o gesto
 * (medido no mesmo item 83, passo 3). Leia `popup` ANTES de navegar; responda a modal primeiro.
 *
 * Com `{ acionar: false }` nada é postado: devolve `{ filhos }` do último nó — é como se DESCOBRE
 * o menu de uma tela (a árvore inteira já está no delta, custo zero de rede).
 *
 * ⚠ Item DESABILITADO (`lsdata[5] === false`, item 48) **lança** — o `action/4` nele seria a falha
 * mais silenciosa deste canal. Medido na SE38: 11 dos 146 itens vêm assim.
 */
export async function navegarMenu(sessao, caminho, { acionar: aciona = true, ...opts } = {}) {
  const { caminho: partes, passos, alvo, filhos } = acharCaminhoDeMenu(itensDeMenu(sessao), caminho);
  if (!alvo.habilitado) throw new Error(`its: navegarMenu — "${alvo.rotulo}" está DESABILITADO nesta tela (${alvo.sid ?? alvo.id}); o action/4 não faria nada`);
  if (!aciona || alvo.submenu) return { caminho: partes, passos, folha: null, filhos, mudou: false, popup: popupDaSessao(sessao) };
  // o `mudou` vem do `postar` — carimbo ANTES × DEPOIS, não só título e dynpro (item 59)
  const r = await despachar(sessao, [{ post: `action/4/${alvo.sid ?? alvo.id}` }], opts);
  // ...e o `popup` diz O QUE mudou: modal na frente, ou a tela nova. Sai da TELA (não do corpo da
  // resposta), então continua certo mesmo quando o POST volta `multipart` com a modal ainda aberta.
  return { ...r, caminho: partes, passos, folha: alvo, popup: popupDaSessao(sessao) };
}

// ---------- a ÁRVORE do SAP Easy Access (item 50) ----------
//
// O outro caminho de menu — o que o usuário final descreve, e o único que enxerga os FAVORITOS.
// Medido no s4h 758/250 em 05/09/2026 (`sap-accelerate/work/POC_webgui_arvore/`).
//
// ⚠ O `lsevents` da árvore MENTE sobre o protocolo. O `TV` publica `DoubleClick → action/74` e o
// `L` publica `Activate → action/1` (o que o item 9 tinha visto); postar qualquer um deles no id
// do nó devolve **`-102 control not found`** — `tree#C105#6#1#1#i` é endereço do RENDERER, o
// servidor não o conhece. E `action/74` no SID do container devolve `-101 not supported`.
// Capturado do próprio Chrome (`Network.requestWillBeSent`), o gesto REAL endereça o CONTAINER
// pelo SID e nomeia o nó por CHAVE — a mesma forma do `action/710` do ALV:
//
//   {"post":"action/41/<SID>","content":"type=node&node_key=0000000004"}            (a seleção)
//   {"post":"action/2/<SID>", "content":"type=OnNodeDoubleClick&node_key=F00003"}   (o duplo clique)
//
// A chave sai do `nodeindexes` que o container publica no `lsdata` (`ct="STCS"`, o objeto com
// `Type: 'GuiTree'`): a árvore visível INTEIRA numa lista, `[chave, categoria, índiceDoPai]`,
// 1-based, `-1` = sem pai. Os três controles de cada nó (`MG` o rótulo, `L` o ícone, `TV` o texto)
// carregam esse índice NO ID — `tree#C105#<n>#1#1#i` ⟺ `nodeindexes[n]` —, e é assim que rótulo e
// chave se encontram. ⚠ O índice é POSICIONAL: expandir um nó reindexa tudo abaixo dele. Só a
// **chave** é estável, e é por ela que o percurso se refaz a cada passo.
//
// Os quatro braços medidos (uma sessão cada, SMEN do s4h 758/250):
//
// | POST | resposta | efeito |
// |---|---|---|
// | `action/2` `OnNodeDoubleClick` na FOLHA `F00003` (favorito) | `delta` **15,5 s** | SMEN → **CO01/SAPLCOKO1** |
// | `action/2` `OnNodeDoubleClick` em `0000000004` ("Escritório", com filhos) | `delta` 108 ms | EXPANDE — 15 → 22 nós |
// | `action/8` (o `CellExpand` que o container publica) com o mesmo content | `delta` 129 ms | EXPANDE, igual |
// | `action/2` `type=OnNodeExpand` (contra-prova) | `multipart` **`-132`** invalid argument value | nada |
//
// Leitura: o `type` é vocabulário FECHADO (`OnNodeExpand` não existe; `node` e `OnNodeDoubleClick`
// existem), "abrir" e "acionar" são o MESMO gesto — quem decide é o nó ter filhos ou não —, e o
// `action/41` da seleção é dispensável (o duplo clique sozinho navegou).
//
// **COLAPSAR é o `action/9`** (`CellCollapse`, o que o container declara ao lado do `8`), com o
// MESMO content. Medido (item 85, SMEN do s4h 758/250, 06/09/2026, `g-colapsar.json`) numa sessão,
// seis POSTs sobre "Favoritos" (`Favo`, `EXPANDED` com 2 filhos no boot):
//
// | POST | resposta | efeito |
// |---|---|---|
// | `action/9` num nó `EXPANDED` | `delta` 84 ms | **COLAPSA** — 15 → 13 nós, `EXPANDED` → `COLLAPSED` |
// | `action/9` no MESMO nó, já `COLLAPSED` | `delta` 79 ms | **nada** — 13 → 13 nós, estado igual |
// | `action/9` numa FOLHA (`INDENT`) | `delta` 75 ms | nada |
// | `action/9` num `COLLAPSED` que nunca abriu | `delta` 70 ms | nada |
// | `action/8` no mesmo nó `COLLAPSED` | `delta` 77 ms | reabre — 13 → 15 nós |
// | `action/8` no mesmo nó `EXPANDED` | `delta` 68 ms | **COLAPSA** — 15 → 13 nós |
//
// A assimetria é o achado: **o `9` é IDEMPOTENTE e o `8` é TOGGLE.** `action/9` num nó já fechado
// (ou numa folha) é aceito e não faz nada; `action/8` num nó já aberto FECHA — quem quisesse
// "garantir aberto" repetindo o `8` fecharia. Por isso `expandirNo` só posta em nó fechado e
// `colapsarNo` só posta em nó aberto: os dois viraram operações de ESTADO, não de gesto.
//
// ⚠ **O acionamento é LENTO** — a folha do favorito levou 15,5 s, e o primeiro tiro estourou o teto
// de 30 s do `postar`. Por isso `acionarNo`/`navegarArvore` sobem o teto para `TETO_ARVORE`.
//
// ⚠⚠ **Depois de uma IDA-E-VOLTA ao menu, o primeiro POST de ação na árvore é SEMPRE recusado** —
// `multipart` **`-103 failed to fire action: not available`**. Medido no item 91 (s4h 758/250,
// 06/09/2026, `sap-accelerate/work/POC_webgui_sid_smen/medicoes/item91-sid-arvore-smen.md`), com a
// ida-e-volta mais barata que existe (`comandar('/nSE38')` + `comandar('/nSMEN')`, sem tocar na
// árvore). Vale para `action/41` (seleção), `action/8` (expandir) e `action/2` (acionar).
//
// **O SID NÃO mudou e o delta NÃO vem incompleto** — as duas explicações naturais estão medidas e
// mortas: o container volta com o mesmo `wnd[0]/usr/cntlIMAGE_CONTAINER/…/shell` (id `tree#C105`),
// o mesmo `nodeindexes` de 16, os mesmos 30 `TV`, as mesmas 15 chaves, `parcial: false`. A resposta
// da volta **pinta** a árvore mas o ITS ainda não a registrou como acionável.
//
// | sonda | resultado |
// |---|---|
// | `/nSMEN` de SMEN para SMEN (o okcode sem ida-e-volta) | árvore VIVA — não é o okcode, é ter SAÍDO |
// | `action/41` recusado três vezes seguidas | `-103` nas três — **o POST recusado não aquece** |
// | um `postar(s, [ESTADO])` sozinho (`get state/ur`, ~78 ms) | **CURA** — o action seguinte vem `delta` |
// | `enter(s)` | cura também, mas dispara a tela |
// | `comandar('/nSE16')` depois do `-103` | `delta` — o resto da tela obedece; só a ÁRVORE fica surda |
//
// **A cura é um `ESTADO` sozinho.** `arvore()` continua correta (o SID é legítimo, os nós são
// reais); quem paga é o gesto no primeiro tiro. Ver a fila `adt-client` para o conserto de
// `acionarNo`/`expandirNo`/`colapsarNo`.

// As PURAS da árvore (`TETO_ARVORE`, `indiceDoNo`, `containerDaArvore`, `arvoreDosBrutos`,
// `acharNoDaArvore`) moram no `webgui.mjs` e são REEXPORTADAS aqui (item 86): elas cruzam o
// `nodeindexes` do container com os `TV` e o estado de expansão, e isso é o mesmo nas duas vias —
// o que muda é de onde vêm os brutos (do delta HTTP aqui, do DOM lá) e o GESTO (POST aqui, duplo
// clique lá). Só o `expansaoDoHtml` é daqui: no navegador o estado sai do DOM, não de regex.

/**
 * PURO: o ESTADO HIERÁRQUICO de cada linha da árvore — `Map n → 'EXPANDED' | 'COLLAPSED' |
 * 'INDENT'`. É a flag de "tem filhos" que faltava (item 84), e ela **não** está em nenhum dos `ct`
 * da árvore: mora no `lsdata[5]` de um `<td subct="HIC">` (`tree#C105#<n>#1`), que o despejo por
 * `[ct]` não vê. `INDENT` é FOLHA; `COLLAPSED`/`EXPANDED` é nó expansível, fechado ou aberto.
 *
 * ⚠ Varre a tela inteira e ignora QUAL árvore — como o `containerDaArvore`, isto assume **uma**
 * `GuiTree` por tela (é o caso do SMEN; duas árvores na mesma tela não foram medidas).
 */
export function expansaoDoHtml(corpo) {
  const out = new Map();
  const re = /<td\s+id="tree#[^#"]+#(\d+)#1"\s+subct="HIC"([^>]*)>/g;
  let m;
  while ((m = re.exec(String(corpo ?? '')))) {
    const estado = jsonDoAtributo(/lsdata='([^']*)'/.exec(m[2])?.[1] ?? null)?.['5'];
    if (typeof estado === 'string') out.set(Number(m[1]), estado);
  }
  return out;
}

/** A árvore da tela atual, do último delta (com o `temFilhos` de cada nó) — SEM tocar a rede. */
export function arvore(sessao) {
  if (!sessao?.delta) throw new Error('its: sem delta para ler a árvore — abra a sessão (o boot do SMEN já a traz)');
  return arvoreDosBrutos(controlesDoDelta(sessao.delta), expansaoDoHtml(sessao.delta));
}

/**
 * PURO: expandir um nó — o `CellExpand` que o container publica, endereçado por CHAVE.
 *
 * ⚠ **É um TOGGLE, não um "abrir"** (medido no item 84): postado num nó já `EXPANDED`, ele
 * **COLAPSA** — "Menu SAP" aberto com 11 filhos voltou a 2 nós num POST de 80 ms. Quem chama isto
 * cru precisa olhar o `temFilhos`/`expansao` do nó antes; `expandirNo` já olha.
 */
export const batchExpandirNo = (sid, chave) => [{ post: `action/8/${sid}`, content: `type=node&node_key=${chave}` }];

/**
 * PURO: colapsar um nó — o `CellCollapse` do container, mesmo content do `batchExpandirNo`.
 *
 * Ao contrário do irmão, este é **IDEMPOTENTE** (item 85): num nó já `COLLAPSED`, ou numa folha, o
 * servidor aceita e não muda nada. Repetir é seguro.
 */
export const batchColapsarNo = (sid, chave) => [{ post: `action/9/${sid}`, content: `type=node&node_key=${chave}` }];

/** PURO: o duplo clique — abre o nó que tem filhos, ACIONA o que não tem. */
export const batchAcionarNo = (sid, chave) => [{ post: `action/2/${sid}`, content: `type=OnNodeDoubleClick&node_key=${chave}` }];

/**
 * EXPANDE um nó e devolve `{ ...lerResposta, no, abriu, filhos }`. `abriu: false` é INFORMAÇÃO —
 * o comando pegou e a árvore ficou igual (o nó é uma pasta VAZIA; § `temFilhos`).
 *
 * **Numa FOLHA não posta nada** (item 84): `temFilhos === false` devolve `{ pulou: true, forma:
 * null, abriu: false, filhos: [] }` sem tocar a rede — é o POST inócuo que o percurso poupa. Sem a
 * flag na tela (`temFilhos === null`) o POST sai como antes.
 *
 * **Num nó JÁ `EXPANDED` também não posta** (item 85), e aqui não é economia, é CORREÇÃO: o
 * `action/8` é toggle e postá-lo num nó aberto o FECHARIA (§ `batchExpandirNo`). O `pulou` sai com
 * os filhos que já estão visíveis — o resultado que quem pediu "abre isso" queria.
 */
export async function expandirNo(sessao, alvo, opts) {
  const antes = arvore(sessao);
  if (!antes.sid) throw new Error('its: esta tela não tem árvore (nenhum GuiTree no delta)');
  const no = acharNoDaArvore(antes.nos, alvo);
  if (no.temFilhos === false) return { forma: null, pulou: true, no, abriu: false, filhos: [] };
  if (no.expansao === 'EXPANDED') {
    return { forma: null, pulou: true, no, abriu: false, filhos: antes.nos.filter((x) => x.pai === no.n) };
  }
  const r = await despachar(sessao, batchExpandirNo(antes.sid, no.chave), opts);
  // ⚠ o índice `n` é posicional e a expansão reindexa: reachar o nó pela CHAVE, sempre
  const depois = r.forma === 'delta' ? arvore(sessao) : { nos: [] };
  const agora = depois.nos.find((x) => x.chave === no.chave) ?? null;
  return { ...r, no, abriu: depois.nos.length > antes.nos.length, filhos: agora ? depois.nos.filter((x) => x.pai === agora.n) : [] };
}

/**
 * COLAPSA um nó e devolve `{ ...lerResposta, no, fechou, nosAntes, nosDepois }` — o `CellCollapse`
 * (`action/9`), medido no item 85: 84 ms, e a subárvore some do `nodeindexes` ("Favoritos" aberto
 * com 2 filhos → 15 nós viram 13). É a forma de encolher a árvore antes de reler: quanto mais nó
 * aberto, maior o `nodeindexes` e o delta de cada POST seguinte.
 *
 * **Num nó que já está fechado não posta nada** — `{ pulou: true, fechou: false }` sem tocar a
 * rede. O servidor aceitaria (o `action/9` é idempotente, medido em folha e em `COLLAPSED`), mas o
 * POST não faria nada, e é o mesmo POST inócuo que o item 84 tirou do percurso.
 *
 * ⚠ `fechou: false` com `pulou: false` é INFORMAÇÃO, não erro: o comando pegou e a árvore ficou do
 * mesmo tamanho.
 */
export async function colapsarNo(sessao, alvo, opts) {
  const antes = arvore(sessao);
  if (!antes.sid) throw new Error('its: esta tela não tem árvore (nenhum GuiTree no delta)');
  const no = acharNoDaArvore(antes.nos, alvo);
  // `INDENT` (folha) e `COLLAPSED` já estão fechados; `null` é "não sei" — aí o POST sai
  if (no.expansao === 'INDENT' || no.expansao === 'COLLAPSED') {
    return { forma: null, pulou: true, no, fechou: false, nosAntes: antes.nos.length, nosDepois: antes.nos.length };
  }
  const r = await despachar(sessao, batchColapsarNo(antes.sid, no.chave), opts);
  const depois = r.forma === 'delta' ? arvore(sessao) : { nos: antes.nos };
  return { ...r, no, fechou: depois.nos.length < antes.nos.length, nosAntes: antes.nos.length, nosDepois: depois.nos.length };
}

/**
 * O duplo clique num nó: `{ ...lerResposta, no, mudou }`. Numa folha ele aciona — foi assim que o
 * favorito "Produção → … → Com material" levou o SMEN à CO01; num nó com filhos ele EXPANDE, e aí
 * `mudou` é `true` (a árvore ganhou nós), não `false` como o veredito antigo — só de título e
 * dynpro — dizia. O teto sobe para `TETO_ARVORE`: 30 s não bastaram na medição.
 */
export async function acionarNo(sessao, alvo, opts) {
  const a = arvore(sessao);
  if (!a.sid) throw new Error('its: esta tela não tem árvore (nenhum GuiTree no delta)');
  const no = acharNoDaArvore(a.nos, alvo);
  // o `mudou` vem do `postar` — carimbo ANTES × DEPOIS, não só título e dynpro (item 59)
  const r = await despachar(sessao, batchAcionarNo(a.sid, no.chave), { tetoMs: TETO_ARVORE, ...opts });
  return { ...r, no };
}

/**
 * Vai a uma tela pelo CAMINHO da árvore do SAP Easy Access — o caminho que o usuário funcional
 * descreve, e o único que enxerga os FAVORITOS:
 *
 * ```js
 * await navegarArvore(s, 'Favoritos > Produção -> Controle de produção -> Ordem -> Criar -> Com material');
 * await navegarArvore(s, 'Menu SAP > Escritório', { acionar: false });   // só DESCOBRE os filhos
 * ```
 *
 * Ao contrário do menu da barra (`navegarMenu`, item 49), aqui a árvore **não vem inteira**: cada
 * nível fechado custa um POST de expansão. O percurso se refaz por CHAVE a cada passo — o índice
 * `n` é posicional e a expansão reindexa tudo abaixo.
 *
 * Devolve `{ caminho, passos, folha, expandidos, mudou, ...lerResposta }`; com `{ acionar: false }`
 * devolve `{ filhos }` do último nó, expandindo-o se ele ainda não tiver filhos visíveis.
 *
 * ⚠ **O que o `mudou` responde depende do ramo** (item 99). Com `acionar` (o padrão) ele é o
 * veredito do DUPLO CLIQUE — o carimbo ANTES × DEPOIS daquele POST —, e é isso que se quer saber;
 * as expansões do caminho ficam em `expandidos`. Com `{ acionar: false }` não há acionamento
 * nenhum, e aí o campo agrega as EXPANSÕES (`agregarMudou`): `true` se alguma delas mexeu na tela,
 * `null` se nenhuma mexeu mas alguma foi inconclusiva, `false` quando nada postou. Enquanto era
 * `false` fixo, `expandidos.length > 0` com `mudou: false` era mentira — cada expansão é um POST
 * `action/8` que muda a árvore, e quem lesse o campo para decidir "preciso reler?" releria de menos.
 */
export async function navegarArvore(sessao, caminho, { acionar: aciona = true, ...opts } = {}) {
  const partes = partirCaminhoDeMenu(caminho);
  const passos = [];
  const expandidos = [];
  const vereditos = [];                       // o `mudou` de CADA expansão que POSTOU (item 99)
  const filhosDe = (a, pai) => (pai ? a.nos.filter((x) => x.pai === pai.n) : a.nos.filter((x) => x.pai === -1));
  let chave = null;
  for (const rotulo of partes) {
    let a = arvore(sessao);
    if (!a.sid) throw new Error('its: esta tela não tem árvore (nenhum GuiTree no delta) — o SAP Easy Access é o `/nSMEN`');
    let pai = chave === null ? null : a.nos.find((x) => x.chave === chave);
    let irmaos = filhosDe(a, pai);
    let alvo = acharItemDeMenu(irmaos, rotulo);
    if (!alvo && pai) {                       // o nó pode estar fechado: abrir UMA vez e reler
      const e = await expandirNo(sessao, { chave: pai.chave }, opts);
      if (!e.pulou) { expandidos.push(pai.chave); vereditos.push(e.mudou); }
      a = arvore(sessao);
      pai = a.nos.find((x) => x.chave === chave);
      irmaos = filhosDe(a, pai);
      alvo = acharItemDeMenu(irmaos, rotulo);
    }
    if (!alvo) throw new Error(`its: navegarArvore — "${rotulo}" não está sob ${chave ?? 'a raiz'}. Tenho: ${irmaos.map((x) => x.rotulo).join(' | ')}`);
    passos.push(alvo);
    chave = alvo.chave;
  }
  if (!aciona) {
    let a = arvore(sessao);
    let folha = a.nos.find((x) => x.chave === chave);
    let filhos = filhosDe(a, folha);
    if (!filhos.length && folha?.temFilhos !== false) {   // um POST — e a FOLHA não paga nenhum (item 84)
      const e = await expandirNo(sessao, { chave }, opts);
      if (!e.pulou) { expandidos.push(chave); vereditos.push(e.mudou); }
      a = arvore(sessao);
      folha = a.nos.find((x) => x.chave === chave);
      filhos = folha ? filhosDe(a, folha) : [];
    }
    return { caminho: partes, passos, folha, filhos, expandidos, mudou: agregarMudou(vereditos) };
  }
  const r = await acionarNo(sessao, { chave }, opts);
  return { ...r, caminho: partes, passos, folha: r.no, expandidos };
}

/**
 * Encerra: `/nex` (medido: 200 `text/html` "logoff", e o POST seguinte 400). Se a sessão não
 * aceitar o comando, cai no logoff do ICF pelo cookie (`encerrarSessao`), o mesmo da sonda.
 *
 * ⚠ **A ORDEM importa e não é negociável, como no navegador** (fila `adt-client` item 66): a pilha
 * `sessao.desfazer` corre ANTES do `/nex`, porque nesta via o descarte é um POST na MESMA sessão
 * ITS — depois do logoff o POST seguinte volta 400 `Session Timed Out` e não há mais o que clicar.
 * `/nex` não é rollback pelo mesmo motivo que matar o Chrome não é: o que o servidor gravou ao
 * ABRIR o formulário fica lá.
 *
 * ⚠ E aqui há um modo de falha que o navegador não tem: a sessão do ITS morre **sozinha** (timeout
 * do servidor, um `/nex` adiantado) e `postar` recusa. Com a sessão já encerrada e pendências na
 * pilha, o `fechar` **não** as executa — executar destruiria a pilha gesto a gesto sem nenhuma
 * chance de sucesso. Ele AVISA alto, com os rótulos, e devolve `pendentes`: o lixo tem nome, e a
 * pilha continua de pé para quem abrir outra sessão e limpar.
 *
 * ⚠⚠ E a morte tem DUAS caras — a segunda mediu-se no item 106, e ela mentia. Quando a sessão morre
 * **por trás** (timeout do servidor, logoff ICF pelo cookie), `sessao.aberta` continua `true`: só o
 * PRÓXIMO POST descobre. Sem a sonda abaixo, esse próximo POST era o do DESCARTE — ele volta
 * `sem-sessao` (400 `Session Timed Out`) **sem estourar**, o gesto resolve, e a pilha o marcava
 * `ok: true` e consumia o rótulo. Medido no s4h 758/250 em 06/09/2026: `fechar` devolveu
 * `desfeito: [{ ok: true }]`, `pendentes: []` — e o rascunho continuava no banco, agora sem nome.
 * Por isso, quando há pendência, o `fechar` gasta um POST de `BOOT` só para saber se a sessão está
 * viva (63 ms viva, 92 ms morta) ANTES de correr a pilha; e passa uma `guarda` que a interrompe se
 * ela morrer no meio, deixando o que não rodou de pé.
 *
 * Devolve `{ encerrada, via, desfeito, pendentes? }`.
 */
export async function fechar(sessao) {
  // A sonda de vida só se paga quando há o que desfazer — sessão sem pilha fecha pelo `/nex` direto.
  let morreuPorTras = false;
  if (sessao?.aberta && (sessao.desfazer?.pendentes?.().length ?? 0) > 0) {
    try {
      const v = await postar(sessao, BOOT);
      if (v.forma !== 'delta') detalhe(`its: a sonda de vida veio ${v.forma} — a sessão morreu por trás`);
    } catch (e) {
      detalhe(`its: a sonda de vida falhou (${e.message}) — trato a sessão como morta`);
      sessao.aberta = false;
    }
    morreuPorTras = !sessao.aberta;
  }
  if (!sessao?.aberta) {
    const pendentes = sessao?.desfazer?.pendentes?.() ?? [];
    const como = morreuPorTras ? 'tinha morrido por trás (a sonda de vida descobriu)' : 'já estava encerrada';
    for (const rotulo of pendentes) {
      aviso(`its: NÃO consegui desfazer "${rotulo}" — a sessão do ITS ${como}, sobrou no sistema`);
    }
    return { encerrada: false, motivo: como, desfeito: [], ...(pendentes.length ? { pendentes } : {}) };
  }
  sessao.fila = [];
  const desfeito = sessao.desfazer
    // a guarda: um descarte que só "passou" porque a sessão morreu não pode levar o próximo consigo
    ? await sessao.desfazer.executar({ guarda: () => { if (!sessao.aberta) throw new Error('sessão morta'); } })
    : [];
  for (const { rotulo, erro } of desfeito.filter((d) => !d.ok)) {
    aviso(`its: NÃO consegui desfazer "${rotulo}" — sobrou no sistema (${erro})`);
  }
  const restaram = sessao.desfazer?.pendentes?.() ?? [];
  for (const rotulo of restaram) {
    aviso(`its: NÃO consegui desfazer "${rotulo}" — a sessão do ITS morreu no meio do fechar, sobrou no sistema`);
  }
  const sobrou = restaram.length ? { pendentes: restaram } : {};
  if (!sessao.aberta) {  // um descarte que mandou /nex por engano, ou a sessão caiu no meio
    return { encerrada: true, via: 'desfazer', desfeito, ...sobrou };
  }
  sessao.fila = [];      // de novo: um descarte pode ter enfileirado `preencher` sem despachar
  try {
    const r = await comandar(sessao, '/nex');
    if (r.forma === 'logoff') return { encerrada: true, via: '/nex', ms: r.ms, desfeito, ...sobrou };
    detalhe(`its: /nex devolveu ${r.forma} — caindo no logoff do ICF`);
  } catch (e) {
    detalhe(`its: /nex falhou (${e.message}) — caindo no logoff do ICF`);
  }
  const r = await encerrarSessao({ cfg: sessao.cfg, cookie: cookieDoJar(sessao.jar) });
  sessao.aberta = false;
  return { encerrada: r.encerrada, via: 'icf-logoff', status: r.status, desfeito, ...sobrou };
}
