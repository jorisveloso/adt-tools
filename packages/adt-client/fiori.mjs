// fiori.mjs — dirigir app UI5 (FLP, FLP Designer, Fiori Elements) pela MESMA sessão de navegador
// do `webgui.mjs`. É o mundo em que quem manda na tela é o UI5, não o Unified Renderer.
//
// Por que módulo PRÓPRIO e não mais uma função no `webgui.mjs`: lá o endereço é o SID do SAP GUI
// (`wnd[0]/usr/txtMAX_SEL`) e quem reage ao gesto é o renderer do ITS; aqui o endereço é o id do
// CONTROLE UI5 (`__xmlview9--targetTypeInput`) e quem reage é o próprio framework — o estado vive
// no controle e no model, e a tela se repinta sozinha. O que os dois compartilham é a SESSÃO: o
// Chrome headless autenticado do `abrirNavegador`, o `avaliar` e o gesto de mouse do `clicar`.
//
// ⚠️ **Mexer no controle por API NÃO é selecionar.** Medido em 05/09/2026 no s4h 758/250, UI5
// 1.114.0, num laboratório que repete o formulário do FLP Designer (um combo de tipo; os campos
// "transação" e "alias do sistema" só existem para o tipo TR) —
// `sap-accelerate/work/POC_ui5_combobox/medicoes/item39-gestos.md`:
//
//   gesto                                           | eventos                | campos do tipo TR
//   ------------------------------------------------|------------------------|------------------
//   setSelectedKey                                  | (nenhum)               | NÃO apareceram
//   setSelectedKey + fireChange                     | change                 | NÃO apareceram
//   setSelectedKey + fireSelectionChange            | selectionChange        | apareceram
//   setSelectedKey + fireSelectionChange + fireChange| selectionChange,change | apareceram
//   **clique na lista (gesto real)**                | selectionChange,change | apareceram
//   digitar o texto + Enter                         | selectionChange,change | apareceram
//
// É exatamente o sintoma do SXD 816/100 de 04/09/2026 (fila adt-client, item 39): `setSelectedKey`
// escreve a chave e o TEXTO na tela — "Transação" aparecia no campo — e o formulário continua com
// os campos do tipo antigo, porque nenhum handler rodou. Três consequências, todas medidas:
//   • `fireChange` sozinho NÃO basta num `sap.m.ComboBox` (o handler do Designer está no
//     `selectionChange`); num `sap.m.Select`, que não TEM `selectionChange`, o `change` é que vale;
//   • quando a tela reage por BINDING (`selectedKey` two-way + `visible` por expressão), o
//     `setSelectedKey` sozinho já repinta — por isso "funcionou uma vez" não prova nada: o gesto
//     certo é o que serve aos dois desenhos;
//   • o gesto REAL dispara os dois eventos e não depende de saber qual deles a app escuta. Daí
//     `selecionar` abrir a lista e CLICAR no item, e só cair no disparo programático (avisando
//     `gesto: 'programa'`) quando a lista não abre.

// ⚠️ **"A página não carregou" é um diagnóstico, e ele tem que ser MEDIDO.** O modo de falha do
// item 67 (ver o cabeçalho do `icm.mjs`) entrega a página com o `sap-ui-core.js` respondendo 200
// com corpo VAZIO: o `onload` do script dispara, não há erro nem status ruim, e a página fica sem
// `window.sap`. Quem dirige o app lê isso como timing e espera mais — e não há timing que cure.
//
// POR QUE A CURA ENTRA AQUI, e não no `abrirNavegador` (decidido na fila adt-client #108):
//   • no `abrirNavegador` **não há o que medir** — a aba é `about:blank`, nenhum recurso foi
//     pedido ainda, e não se sabe quais o app vai pedir; medir na sorte custaria 3 GETs de ~775 KB
//     por sessão;
//   • aquele mesmo `abrirNavegador` é a sessão do canal WebGUI/dynpro, que **não usa UI5** —
//     pagar diagnóstico de UI5 lá seria custo puro no caminho que não tem o problema;
//   • aqui, no `inventario`, a página JÁ disse o que pediu (Resource Timing) e já falhou o teste
//     `window.sap` — é o único ponto que tem o sintoma e a evidência ao mesmo tempo. É exatamente
//     a linha que hoje chuta "o canal certo pode ser o webgui".
// A cura é `curarRecursoVazio` (invalidação no ICM) + recarregar com `ignoreCache`. **Carimbar a
// URL com `?ts=` está proibido**: cria entrada nova no cache do ICM a cada carga e não cura nada.

import { passo, detalhe, aviso } from './log.mjs';
import { avaliar, clicar } from './webgui.mjs';
import { medirRecurso, curarRecursoVazio, ENCODINGS_MEDIDOS } from './icm.mjs';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * PURO: o id do CONTROLE a partir de um id de DOM. O UI5 sufixa os pedaços renderizados
 * (`-inner` o `<input>`, `-arrow` a seta, `-label` o texto do `Select`, `-hiddenInput` o campo de
 * acessibilidade) — quem responde `setSelectedKey` é o id SEM sufixo. Aceita string ou `{ id }`,
 * que é como o resto do canal navegador endereça.
 */
export const SUFIXOS_DE_DOM = ['-inner', '-arrow', '-label', '-labelText', '-hiddenInput', '-icon', '-content'];
export function idDoControle(alvo) {
  const bruto = typeof alvo === 'string' ? alvo : alvo?.id;
  if (!bruto) throw new Error('fiori: informe o id do controle UI5 (ex. "__xmlview9--targetTypeInput") ou { id }');
  const sufixo = SUFIXOS_DE_DOM.find((s) => bruto.endsWith(s));
  return sufixo ? bruto.slice(0, -sufixo.length) : bruto;
}

/**
 * PURO: a expressão que ACHA o controle. `sap.ui.getCore().byId` morreu no UI5 2.x e
 * `Element.getElementById` não existe antes do 1.119 — daí as duas vias, nesta ordem.
 */
export function jsControle(id) {
  return `(() => {
    if (!(window.sap && sap.ui)) return null;
    try {
      const E = sap.ui.require && sap.ui.require('sap/ui/core/Element');
      if (E && E.getElementById) { const c = E.getElementById(${JSON.stringify(id)}); if (c) return c; }
    } catch (e) { /* UI5 antigo: cai no getCore */ }
    return (sap.ui.getCore ? sap.ui.getCore().byId(${JSON.stringify(id)}) : null) || null;
  })()`;
}

/**
 * PURO: a expressão que descreve a tela ANTES e DEPOIS do gesto — o controle (tipo, chave, texto,
 * itens) e o INVENTÁRIO dos campos de entrada visíveis. É a comparação dos campos que prova a
 * rerenderização: no SXD o combo dizia "Transação" com os campos do tipo genérico ainda na tela.
 */
export function jsInventario(id) {
  return `(() => {
    const c = ${jsControle(id)};
    if (!c) return { achou: false, ui5: !!(window.sap && sap.ui), campos: [] };
    const item = c.getSelectedItem && c.getSelectedItem();
    return {
      achou: true,
      ui5: true,
      tipo: c.getMetadata().getName(),
      temSelectionChange: typeof c.fireSelectionChange === 'function',
      chave: c.getSelectedKey ? c.getSelectedKey() : null,
      texto: item && item.getText ? item.getText() : null,
      itens: (c.getItems ? c.getItems() : []).map((i) => ({
        id: i.getId(), chave: i.getKey ? i.getKey() : null, texto: i.getText ? i.getText() : null })),
      aberto: c.isOpen ? !!c.isOpen() : false,
      campos: [...document.querySelectorAll('input, textarea, select, [contenteditable="true"]')]
        .filter((e) => (e.offsetWidth || e.offsetHeight) && e.id).map((e) => e.id).sort(),
    };
  })()`;
}

/**
 * PURO: qual item o pedido quer. Aceita `'TR'`, `{ chave: 'TR' }` e `{ texto: 'Transação' }` — a
 * chave é o endereço estável (o texto muda com o idioma do logon), então uma string é lida como
 * chave primeiro e só depois como texto. O erro LISTA o que havia: sem isso, "não achei" numa
 * lista de dez itens não diz o que fazer em seguida.
 */
export function escolherItem(itens = [], valor) {
  const pedido = typeof valor === 'object' && valor !== null ? valor : { valor };
  const { chave = null, texto = null } = pedido;
  const alvo = chave ?? texto ?? pedido.valor;
  if (alvo === undefined || alvo === null || alvo === '') {
    throw new Error('fiori: informe o item — "TR", { chave: "TR" } ou { texto: "Transação" }');
  }
  const porChave = itens.find((i) => i.chave === alvo) ?? null;
  const porTexto = itens.find((i) => (i.texto ?? '').trim() === String(alvo).trim()) ?? null;
  const achado = (chave !== null ? porChave : texto !== null ? porTexto : (porChave || porTexto));
  if (!achado) {
    const catalogo = itens.map((i) => `${i.chave ?? '(sem chave)'}=${i.texto ?? ''}`).join(' | ') || '(lista vazia)';
    throw new Error(`fiori: item "${alvo}" não está na lista — tenho ${catalogo}`);
  }
  return achado;
}

/**
 * PURO: o disparo por API — a SAÍDA DE EMERGÊNCIA, para quando a lista não abre (popover em
 * `sap.m.Dialog` no modo phone, controle fora da viewport). Dispara os DOIS eventos porque a app
 * pode escutar qualquer um dos dois, e `applyChanges` força a repintura no mesmo tick.
 */
export function jsSelecionarPorPrograma(id, chave) {
  return `(() => {
    const c = ${jsControle(id)};
    if (!c) return { ok: false, motivo: 'controle não está na página' };
    c.setSelectedKey(${JSON.stringify(chave)});
    const item = c.getSelectedItem && c.getSelectedItem();
    if (typeof c.fireSelectionChange === 'function') c.fireSelectionChange({ selectedItem: item });
    c.fireChange({ selectedItem: item, value: c.getValue ? c.getValue() : (item && item.getText ? item.getText() : null) });
    if (sap.ui.getCore && sap.ui.getCore().applyChanges) sap.ui.getCore().applyChanges();
    return { ok: true };
  })()`;
}

/** PURO: o que a rerenderização fez com os campos da tela. `mudou: false` é INFORMAÇÃO — a
 * seleção pegou e o formulário continuou igual (é o sintoma do item 39). */
export function diferencaDeCampos(antes = [], depois = []) {
  const a = new Set(antes);
  const d = new Set(depois);
  return {
    apareceram: depois.filter((id) => !a.has(id)),
    sumiram: antes.filter((id) => !d.has(id)),
    mudou: depois.some((id) => !a.has(id)) || antes.some((id) => !d.has(id)),
  };
}

// ---------- a página que ficou sem UI5: MEDIR antes de culpar o timing ----------

/**
 * PURO: o que a própria página sabe dizer sobre o carregamento — se o UI5 subiu, e QUAIS recursos
 * de mesma origem ela pediu, com quantos bytes cada um chegou (Resource Timing).
 *
 * ⚠️ O caminho vem **sem a query**: a chave do cache do ICM inclui o hash da query, então medir a
 * URL carimbada (`?jbv=…`) mediria OUTRA entrada — não a que envenenou a página.
 */
export function jsEstadoUi5() {
  return `(() => {
    const org = location.origin;
    const doCaminho = (u) => {
      try { const x = new URL(u, location.href); return x.origin === org ? x.pathname : null; }
      catch (e) { return null; }
    };
    const recursos = (performance.getEntriesByType ? performance.getEntriesByType('resource') : [])
      .map((e) => ({ caminho: doCaminho(e.name), tipo: e.initiatorType,
                     bytes: e.decodedBodySize, transferidos: e.transferSize }))
      .filter((r) => r.caminho);
    const scripts = [...document.querySelectorAll('script[src]')]
      .map((e) => doCaminho(e.getAttribute('src'))).filter(Boolean);
    return {
      ui5: !!(window.sap && sap.ui),
      versao: (window.sap && sap.ui && sap.ui.version) || null,
      url: location.href, recursos, scripts,
    };
  })()`;
}

/** PURO: um recurso do UI5? O bootstrap e os módulos moram sob um diretório `resources/` — é a
 * convenção do framework (`/sap/public/bc/ui5_ui5/resources/…`, `/sap/bc/ui5_ui5/sap/<app>/resources/…`). */
export const ehRecursoUi5 = (caminho) =>
  /\/resources\//i.test(String(caminho ?? '')) && /\.js$/i.test(String(caminho ?? ''));

/** PURO: o `sap-ui-core.js` na frente — é o script cuja ausência apaga o `window.sap` inteiro. */
const pesoDoSuspeito = (c) => (/sap-ui-core[^/]*\.js$/i.test(c) ? 0 : 1);

/**
 * PURO: o que vale medir por HTTP, e em que ordem.
 *
 * Quando a PRÓPRIA página já denuncia script de mesma origem com **0 byte**, só esses vão — é o
 * alvo, e medir o resto seria baixar megabytes à toa. Sem denúncia (sem Resource Timing, ou o
 * corpo veio do cache do navegador), vai a lista dos scripts UI5 declarados, até o `teto`.
 */
export function recursosSuspeitos(estado, { teto = 6 } = {}) {
  const recursos = estado?.recursos ?? [];
  const vazios = recursos.filter((r) => r.tipo === 'script' && r.bytes === 0).map((r) => r.caminho);
  if (vazios.length) return [...new Set(vazios)].slice(0, teto);
  const declarados = new Set([
    ...(estado?.scripts ?? []),
    ...recursos.filter((r) => r.tipo === 'script').map((r) => r.caminho),
  ]);
  return [...declarados].filter(ehRecursoUi5)
    .sort((a, b) => pesoDoSuspeito(a) - pesoDoSuspeito(b)).slice(0, teto);
}

/**
 * PURO: o veredito, do estado da página mais as medições HTTP. É aqui que "a página não carregou"
 * vira uma CAUSA:
 *
 *   `null`              — o UI5 está de pé, não há o que explicar;
 *   `'recurso-vazio'`   — algum recurso volta 200 com corpo VAZIO do cache do ICM (curável);
 *   `'nao-e-o-cache'`   — os recursos estão inteiros no servidor; a página está sem UI5 por outra
 *                         causa (bootstrap que não rodou, erro de JS, contexto inseguro, tela errada);
 *   `'sem-o-que-medir'` — a página não declarou recurso UI5 nenhum (provavelmente não é app UI5).
 */
export function diagnosticoDaPagina(estado, medidos = []) {
  if (estado?.ui5) return { ui5: true, causa: null, envenenados: [] };
  const envenenados = medidos.filter((m) => m?.envenenado).map((m) => m.url);
  if (envenenados.length) return { ui5: false, causa: 'recurso-vazio', envenenados };
  return { ui5: false, causa: medidos.length ? 'nao-e-o-cache' : 'sem-o-que-medir', envenenados: [] };
}

/**
 * A página tem UI5 de pé? E, se NÃO tem, **por quê** — medido, não suposto.
 *
 * É o antídoto do modo de falha do item 67: o `sap-ui-core.js` volta 200 com corpo vazio do cache
 * do ICM, o `onload` do script dispara igual, não há erro em lugar nenhum e a página fica sem
 * `window.sap` — quem dirige o app vê "a página não terminou de carregar" e culpa o timing.
 *
 * Ordem: lê `window.sap` (de graça) → só se faltar, escolhe os suspeitos pelo que a página pediu →
 * mede por HTTP (`medirRecurso`) → cura o que estiver vazio (`curarRecursoVazio`) → recarrega e
 * confere. Página saudável **não custa requisição nenhuma** e não toca em nada.
 *
 * ⚠️ **Não carimba URL.** O `?jbv=<timestamp>` também "resolve", mas cria uma ENTRADA NOVA no
 * cache do ICM por carga de página (7 dias de validade cada) e não CURA a entrada ruim — ver o
 * cabeçalho do `icm.mjs`. O recarregamento vai com `ignoreCache` (que é header de requisição, não
 * chave de cache): tira o corpo vazio do cache do NAVEGADOR sem sujar o do ICM.
 *
 * `conexao` (a do `criarConexao`) é o que permite CURAR — a invalidação é um classrun. Sem ela a
 * função ainda MEDE e diz o que houve, com a instrução do que chamar.
 *
 * `{ recarregar: false }` para página montada por `Page.setDocumentContent` (o reload a perderia).
 */
export async function verificarUi5(sessao, {
  conexao = null, curar = true, recarregar = true, teto = 6,
  encodings = ENCODINGS_MEDIDOS, tetoMs = 30000,
} = {}) {
  const vazio = { medidos: [], envenenados: [], curados: [], recarregou: false };
  const estado = await avaliar(sessao, jsEstadoUi5());
  if (estado?.ui5) {
    detalhe(`fiori: UI5 ${estado.versao ?? '(sem versão)'} de pé — nada a medir`);
    return { ...vazio, ui5: true, versao: estado.versao ?? null, causa: null, estado };
  }

  passo('fiori: a página está sem window.sap — medindo os recursos antes de culpar o timing');
  const alvos = recursosSuspeitos(estado, { teto });
  const cfg = conexao?.cfg ?? sessao?.cfg;
  const medidos = [];
  if (cfg?.base) for (const url of alvos) medidos.push(await medirRecurso(cfg, url, { encodings }));
  const d = diagnosticoDaPagina(estado, medidos);

  if (d.causa === 'sem-o-que-medir') {
    aviso('fiori: a página está sem UI5 e não declarou recurso UI5 nenhum — pode não ser uma app UI5 (o canal certo talvez seja o webgui)');
    return { ...vazio, ui5: false, versao: null, causa: d.causa, medidos, estado };
  }
  if (d.causa === 'nao-e-o-cache') {
    aviso(`fiori: os ${medidos.length} recurso(s) medido(s) estão INTEIROS no servidor — a página está sem UI5 por outra causa, não é o cache do ICM`);
    return { ...vazio, ui5: false, versao: null, causa: d.causa, medidos, estado };
  }

  if (!curar || !conexao) {
    aviso(`fiori: ${d.envenenados.join(', ')} volta(m) VAZIO(s) do cache do ICM — cure com curarRecursoVazio(conexao, url) do icm.mjs (carimbar a URL só desvia, e entope o cache)`);
    return { ...vazio, ui5: false, versao: null, causa: d.causa, medidos, envenenados: d.envenenados, estado };
  }

  const curados = [];
  for (const url of d.envenenados) curados.push(await curarRecursoVazio(conexao, url, { encodings }));
  if (!recarregar) {
    return { ...vazio, ui5: false, versao: null, causa: d.causa, medidos, envenenados: d.envenenados, curados };
  }

  passo('fiori: recarregando a página com o cache do ICM curado');
  await sessao.cmd('Page.reload', { ignoreCache: true });
  const ate = Date.now() + tetoMs;
  let depois = null;
  while (Date.now() < ate) {
    await espera(300);
    depois = await avaliar(sessao, jsEstadoUi5()).catch(() => null);
    if (depois?.ui5) break;
  }
  const ok = !!depois?.ui5;
  (ok ? detalhe : aviso)(`fiori: depois de curar ${d.envenenados.length} recurso(s), a página ${ok ? `subiu com UI5 ${depois.versao ?? ''}` : 'CONTINUA sem window.sap — a causa não era só o cache'}`);
  return {
    ui5: ok, versao: depois?.versao ?? null, causa: d.causa,
    medidos, envenenados: d.envenenados, curados, recarregou: true, estado: depois ?? estado,
  };
}

/**
 * O estado do controle e da tela agora — o mesmo modelo que o `selecionar` compara.
 *
 * Quando a página vem **sem UI5**, ele não chuta mais "canal errado / não carregou": chama o
 * `verificarUi5`, e o erro sai com a CAUSA medida. Passe `{ conexao }` para que ele também CURE o
 * recurso vazio e recarregue — aí a leitura é refeita e o inventário volta normal.
 */
export async function inventario(sessao, alvo, { conexao = null, medirUi5 = true, ...opcoesUi5 } = {}) {
  const id = idDoControle(alvo);
  let r = await avaliar(sessao, jsInventario(id));
  if (!r?.ui5 && medirUi5) {
    const v = await verificarUi5(sessao, { conexao, ...opcoesUi5 });
    if (v.ui5) r = await avaliar(sessao, jsInventario(id));
    else throw new Error(`fiori: esta página não tem UI5 carregado (procurando ${id}) — ${explicarSemUi5(v)}`);
  }
  if (!r?.ui5) throw new Error(`fiori: esta página não tem UI5 carregado (procurando ${id}) — o canal certo pode ser o webgui`);
  if (!r.achou) throw new Error(`fiori: nenhum controle UI5 com id "${id}" na página`);
  return { id, ...r };
}

/** PURO: o que dizer a quem chamou, a partir do veredito do `verificarUi5`. */
export function explicarSemUi5(v) {
  if (v?.causa === 'recurso-vazio' && v.recarregou) {
    return `${v.envenenados.join(', ')} estava(m) VAZIO(s) no cache do ICM; curei e recarreguei, e a página CONTINUA sem window.sap — há outra causa além do cache`;
  }
  if (v?.causa === 'recurso-vazio') {
    return `${v.envenenados.join(', ')} volta(m) 200 com corpo VAZIO do cache do ICM (é isto, não timing) — passe { conexao } para curar, ou chame curarRecursoVazio(conexao, url) do icm.mjs`;
  }
  if (v?.causa === 'nao-e-o-cache') {
    return `medi ${v.medidos.length} recurso(s) UI5 e todos vieram INTEIROS do servidor — não é o cache do ICM; olhe o bootstrap, o console da página e o contexto seguro`;
  }
  return 'a página não declarou recurso UI5 nenhum — o canal certo pode ser o webgui';
}

/**
 * Seleciona um item de `sap.m.ComboBox`/`sap.m.Select` **como o usuário seleciona**: abre a lista e
 * clica no item, o que dispara `selectionChange` E `change` e deixa o formulário se repintar.
 *
 * `alvo` é o id do controle (o `-inner`/`-arrow` do DOM também serve); `valor` é `'TR'`,
 * `{ chave: 'TR' }` ou `{ texto: 'Transação' }`.
 *
 * Devolve o que mudou de fato: `{ gesto, chave, texto, mudou, apareceram, sumiram }`. ⚠️
 * `mudou: false` NÃO é erro — quer dizer que a seleção pegou (a chave é conferida, e a função
 * estoura se não pegou) e nenhum campo entrou ou saiu da tela.
 *
 * `{ viaPrograma: true }` pula o gesto real e dispara por API — para tela onde o popover não abre.
 * `{ conexao }` deixa o `inventario` CURAR um recurso vazio no cache do ICM antes de desistir da
 * página (ver `verificarUi5`).
 */
export async function selecionar(sessao, alvo, valor, { tetoMs = 15000, esperaCampoMs = 4000, viaPrograma = false, conexao = null } = {}) {
  const antes = await inventario(sessao, alvo, { conexao });
  const id = antes.id;
  const item = escolherItem(antes.itens, valor);
  passo(`fiori: selecionar ${item.chave ?? item.texto} em ${id}`);

  let gesto = 'programa';
  if (!viaPrograma) {
    const abriu = await abrirLista(sessao, id, { tetoMs });
    if (abriu) {
      const clicavel = await avaliar(sessao, `(() => {
        const e = document.getElementById(${JSON.stringify(item.id)});
        if (e && (e.offsetWidth || e.offsetHeight)) return e.id;
        const li = [...document.querySelectorAll('li')].filter((x) => x.offsetWidth || x.offsetHeight)
          .find((x) => (x.innerText || '').trim() === ${JSON.stringify((item.texto ?? '').trim())});
        return li ? li.id : null;
      })()`);
      if (clicavel) { await clicar(sessao, { id: clicavel }); gesto = 'lista'; }
      else aviso(`fiori: a lista de ${id} abriu mas o item "${item.texto ?? item.chave}" não estava nela — disparando por API`);
    } else {
      aviso(`fiori: a lista de ${id} não abriu — disparando por API (selectionChange + change)`);
    }
  }
  if (gesto === 'programa') {
    const r = await avaliar(sessao, jsSelecionarPorPrograma(id, item.chave));
    if (!r?.ok) throw new Error(`fiori: não consegui selecionar em ${id} — ${r?.motivo ?? 'sem motivo'}`);
  }

  const depois = await esperarRerenderizacao(sessao, id, antes.campos, { tetoMs: esperaCampoMs });
  if (depois.chave !== item.chave) {
    throw new Error(`fiori: ${id} ficou com a chave "${depois.chave}", não "${item.chave}" (gesto ${gesto})`);
  }
  const dif = diferencaDeCampos(antes.campos, depois.campos);
  detalhe(`fiori: ${id} = ${depois.chave} (${gesto}); campos +${dif.apareceram.length} -${dif.sumiram.length}`);
  return { id, gesto, chave: depois.chave, texto: depois.texto, ...dif };
}

/** Abre a lista do controle com o gesto do usuário: clique na seta (ComboBox) ou no corpo (Select).
 * Devolve `false` quando o popover não abriu dentro do teto — quem chama decide o que fazer. */
export async function abrirLista(sessao, alvo, { tetoMs = 15000 } = {}) {
  const id = idDoControle(alvo);
  const ondeClicar = await avaliar(sessao, `(() => {
    const seta = document.getElementById(${JSON.stringify(id + '-arrow')});
    if (seta && (seta.offsetWidth || seta.offsetHeight)) return seta.id;
    const e = document.getElementById(${JSON.stringify(id)});
    return e ? e.id : null;
  })()`);
  if (!ondeClicar) throw new Error(`fiori: ${id} não está renderizado na tela`);
  await clicar(sessao, { id: ondeClicar });
  const ate = Date.now() + tetoMs;
  while (Date.now() < ate) {
    await espera(200);
    if (await avaliar(sessao, `(() => { const c = ${jsControle(id)}; return !!(c && c.isOpen && c.isOpen()); })()`)) return true;
  }
  return false;
}

/** Espera a tela PARAR de mexer depois da seleção: volta assim que os campos mudam (e deixa
 * assentar) ou quando o teto vence — a tela que não muda é resposta, não falha. */
export async function esperarRerenderizacao(sessao, alvo, campos, { tetoMs = 4000, assentarMs = 400 } = {}) {
  const id = idDoControle(alvo);
  const ate = Date.now() + tetoMs;
  let atual = await avaliar(sessao, jsInventario(id));
  while (Date.now() < ate) {
    if (diferencaDeCampos(campos, atual.campos).mudou) { await espera(assentarMs); break; }
    await espera(250);
    atual = await avaliar(sessao, jsInventario(id));
  }
  return await avaliar(sessao, jsInventario(id));
}
