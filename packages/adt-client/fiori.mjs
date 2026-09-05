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

import { passo, detalhe, aviso } from './log.mjs';
import { avaliar, clicar } from './webgui.mjs';

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

/** O estado do controle e da tela agora — o mesmo modelo que o `selecionar` compara. */
export async function inventario(sessao, alvo) {
  const id = idDoControle(alvo);
  const r = await avaliar(sessao, jsInventario(id));
  if (!r?.ui5) throw new Error(`fiori: esta página não tem UI5 carregado (procurando ${id}) — o canal certo pode ser o webgui`);
  if (!r.achou) throw new Error(`fiori: nenhum controle UI5 com id "${id}" na página`);
  return { id, ...r };
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
 */
export async function selecionar(sessao, alvo, valor, { tetoMs = 15000, esperaCampoMs = 4000, viaPrograma = false } = {}) {
  const antes = await inventario(sessao, alvo);
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
