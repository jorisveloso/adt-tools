// ui5.mjs — os apps UI5 que o sistema JÁ SERVE (BSP repository), a URL de cada um e o que o
// manifest declara. SOMENTE LEITURA: nada aqui cria, altera ou apaga.
//
// Por que existe (medido 2026-08-31, fila 33): dirigir um app Fiori CUSTOM por wdi5 é "só trocar a
// URL" — mas ACHAR a URL é metade do trabalho. No s4h 758 há 278 apps custom na TADIR (`WAPA`), dos
// quais 242 respondem `manifest.json` pelo ICM e 35 estão na TADIR SEM conteúdo servido (404) — a
// TADIR não prova que o app existe no repositório BSP, só que alguém registrou o nome. E é o
// manifest que diz o que o teste vai encontrar na tela: template (List Report do Fiori Elements ou
// freestyle), serviço OData, entity set e — o detalhe que muda o seletor do spec — o TIPO de tabela
// (`ResponsiveTable` → `sap.m.Table`; `AnalyticalTable`/`GridTable` → `sap.ui.table.Table`).
//
// O deploy de app UI5 é outro canal (OData `/UI5/ABAP_REPOSITORY_SRV`, ideia I36) e não mora aqui.

import { call } from './sap-connection.mjs';
import { dataPreview } from './adt-client.mjs';

/** PURO: a URL pela qual o ICM serve um arquivo do app (o nome da BSP application vai em minúsculas). */
export function urlDoApp(cfg, app, { arquivo = 'index.html', lang } = {}) {
  if (!cfg?.base) throw new Error('urlDoApp: cfg sem `base` (a URL do ICM).');
  if (!app) throw new Error('urlDoApp: informe o nome da BSP application (TADIR WAPA).');
  const q = [];
  if (cfg.client) q.push(`sap-client=${cfg.client}`);
  if (lang) q.push(`sap-language=${String(lang).toUpperCase()}`);
  return `${String(cfg.base).replace(/\/+$/, '')}/sap/bc/ui5_ui5/sap/${String(app).toLowerCase()}/${arquivo}` +
    (q.length ? `?${q.join('&')}` : '');
}

/**
 * PURO: o resumo do `manifest.json` que decide como testar o app.
 * `template` distingue os dois mundos que o wdi5 encontra: `fiori-elements-v2` (o app é gerado pelo
 * `sap.suite.ui.generic.template`, tem SmartFilterBar + botão Go) e `freestyle` (o dev escreveu as
 * views — não há Go, e o seletor é do app).
 */
export function resumoDoManifest(manifest) {
  const app = manifest?.['sap.app'] || {};
  const ui5 = manifest?.['sap.ui5'] || {};
  const generic = manifest?.['sap.ui.generic.app'] || null;
  const fontes = app.dataSources || {};
  const principal = fontes.mainService || Object.values(fontes).find((d) => d?.type === 'OData') || null;

  // A primeira página do FE V2 é o List Report: dela saem entity set e tipo de tabela.
  const paginas = generic?.pages ? Object.entries(generic.pages) : [];
  const [chavePagina, pagina] = paginas[0] || [];
  const settings = pagina?.component?.settings || {};

  return {
    id: app.id || null,
    titulo: app.title || null,
    tipo: app.type || null,
    template: generic ? 'fiori-elements-v2' : 'freestyle',
    origem: app.sourceTemplate?.id || null,
    servico: principal?.uri || null,
    odataVersion: principal?.settings?.odataVersion || null,
    entitySet: pagina?.entitySet || null,
    pagina: chavePagina || null,
    componente: pagina?.component?.name || null,
    tabela: settings.tableSettings?.type || null,
    minUI5: ui5.dependencies?.minUI5Version || null,
    libs: Object.keys(ui5.dependencies?.libs || {}),
  };
}

/**
 * PURO: qual controle de tabela o spec vai encontrar, dado o `tabela` do resumo.
 * Medido no s4h 758: `ResponsiveTable` renderiza `sap.m.Table` (linhas em `getItems()`);
 * `AnalyticalTable`/`GridTable`/`TreeTable` renderizam `sap.ui.table.Table` (linhas em `getRows()`,
 * e só contam as que TÊM binding context). Sem `tableSettings` o FE V2 decide sozinho — daí o `null`.
 */
export function controleDaTabela(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'responsivetable') return 'sap.m.Table';
  if (t === 'analyticaltable' || t === 'gridtable' || t === 'treetable') return 'sap.ui.table.Table';
  return null;
}

/**
 * Os apps UI5 registrados na TADIR (`WAPA`). Só leitura, sem driver — o `dataPreview` basta.
 * `pacote` recorta por DEVCLASS; `prefixo` por nome (default: custom Z/Y).
 * ⚠️ Estar na TADIR não é estar servido: no s4h 758, 35 dos 278 devolvem 404 no `manifest.json`
 * (registro sem conteúdo no repositório BSP) — use `sondarApp` para separar.
 */
export async function listarAppsUi5(conexao, { pacote = null, prefixo = null, rows = 500 } = {}) {
  const onde = ["object = 'WAPA'"];
  if (pacote) onde.push(`devclass = '${String(pacote).toUpperCase()}'`);
  if (prefixo) onde.push(`obj_name LIKE '${String(prefixo).toUpperCase()}%'`);
  else if (!pacote) onde.push("( obj_name LIKE 'Z%' OR obj_name LIKE 'Y%' )");
  const sql = `SELECT obj_name, devclass, author FROM tadir\n  WHERE ${onde.join('\n  AND ')}\n  ORDER BY obj_name`;
  const { rows: linhas } = await dataPreview(conexao, sql, { rows });
  return linhas.map((r) => ({
    app: String(r.OBJ_NAME).trim(),
    pacote: String(r.DEVCLASS).trim(),
    autor: String(r.AUTHOR).trim(),
  }));
}

// Uma sessão de LEITURA por conexão: varrer 278 apps não pode virar 278 logons (o `sessaoStateless`
// com senha em mãos abre logon novo a cada chamada). Stateless não deixa contexto no servidor.
const leituraPorConexao = new WeakMap();
async function sessaoDeLeitura(conexao) {
  if (!leituraPorConexao.has(conexao)) leituraPorConexao.set(conexao, await conexao.sessaoStateless());
  return leituraPorConexao.get(conexao);
}

/** GET de um arquivo do app pelo ICM, com a sessão da conexão (sem senha, sem sessão nova). */
async function pegar(conexao, app, arquivo) {
  const s = await sessaoDeLeitura(conexao);
  return call(s, { path: `/sap/bc/ui5_ui5/sap/${String(app).toLowerCase()}/${arquivo}`, accept: 'application/*, text/html' });
}

/** O `manifest.json` do app, como objeto. Lança se o app não é servido ou o corpo não é JSON. */
export async function lerManifest(conexao, app) {
  const r = await pegar(conexao, app, 'manifest.json');
  if (r.status !== 200) {
    throw new Error(`app UI5 "${app}": manifest.json devolveu ${r.status}.\n` +
      '→ causa provável: linha na TADIR (WAPA) sem conteúdo no repositório BSP, ou nome errado.\n' +
      '→ confira com `listarAppsUi5` + `sondarApp` (no s4h 758, 35 de 278 estavam nesse estado).');
  }
  try {
    return JSON.parse(r.text);
  } catch {
    throw new Error(`app UI5 "${app}": manifest.json não é JSON (${r.text.slice(0, 80).replace(/\s+/g, ' ')}…).`);
  }
}

/**
 * O app está servido? Devolve `{ app, servido, status, url, ...resumoDoManifest }` — nunca lança,
 * para poder varrer o landscape de apps de uma vez.
 */
export async function sondarApp(conexao, app) {
  const url = urlDoApp(conexao.cfg, app);
  try {
    const r = await pegar(conexao, app, 'manifest.json');
    if (r.status !== 200) return { app, servido: false, status: r.status, url };
    const manifest = JSON.parse(r.text);
    return { app, servido: true, status: 200, url, ...resumoDoManifest(manifest) };
  } catch (e) {
    return { app, servido: false, status: null, url, erro: e.message.split('\n')[0] };
  }
}
