// cts.mjs — change request (CTS): leitura pelas DUAS vias e, desde o item 24, o ciclo de vida da
// TR modificável (criar · destravar · apagar) — e, desde o item 74, LIBERAR (`liberarRequest`),
// que continua sendo decisão de gente: exige confirm, só TR própria, e é irreversível de verdade
// (TR liberada não se apaga por nenhuma via). Desde o item 75, a TR de entrega também se MONTA a
// partir de lista (`inserirObjetosNaRequest`, SOAP puro) — o objeto pronto entra sem deploy. E
// desde o item 76 o resto do vocabulário do dispatcher está coberto: criarTarefa, moverObjetos,
// reatribuirTarefa, trocarDonoRequest, fundirRequests, compactarRequest, verificarConsistencia —
// e, desde o item 77, o fim dele: travarObjetosNaRequest (lockobject), prepararRelease (gCTS) e o
// ciclo release→interrupção→retomada (`liberarRequest` devolve `retomar`; `retomarLiberacao` segue).
// Desde o item 78, o EDITOR de TR (o OUTRO handler, PUT no próprio recurso): editarRequest (save —
// descrição curta e longa), trocarAlvoRequest, trocarProjetoRequest, mudarAtributoRequest,
// protegerRequest, mudarTipoTarefa, removerObjetosDaRequest (a remoção que o item 24 deu como
// inexistente) e lerActionLog/lerTransportLog.
//
// Uma change request é o inventário do que mudou: PGMID/OBJECT/OBJ_NAME por objeto e, para os
// tipos que transportam por CHAVE (conteúdo de tabela, visão de customizing), a chave concatenada
// da linha. Para tipo sem coleção ADT própria, esse inventário é a única descrição formal que o
// SAP publica do objeto — daí este módulo ser a sonda de "anatomia de objeto".
//
// ---------------------------------------------------------------------------------------------
// AS DUAS VIAS, E POR QUE AS DUAS EXISTEM (medido 2026-08-29, S4H 758, mandante 250)
//
//   via ADT     GET /sap/bc/adt/cts/transportrequests/<TRKORR>
//               • CONSOLIDA as tarefas na ordem (`tm:all_objects`) — a TR mostra o objeto mesmo
//                 quando a E071 dela está vazia;
//               • ENRIQUECE: `wbtype` (CLAS/OM, DEVC/K…), `obj_info` (texto do tipo no idioma de
//                 logon), `status_text`;
//               • NÃO enxerga entrada de CHAVE. Para `R3TR VDAT V460A` o ADT diz "Atualização de
//                 visão: dados" e para: qual linha de qual tabela, ele não conta.
//
//   via tabelas E070 (cabeçalho) · E07T (texto) · E071 (objetos) · E071K (chaves), por SOAP RFC
//               • é a ÚNICA via com as entradas de chave (`TABKEY`);
//               • é literal: mostra em QUEM a entrada mora. Enquanto a TR não é liberada, as
//                 entradas moram nas TAREFAS e a E071 da TR fica VAZIA (medido na S4HK912769:
//                 E071 da TR = 0 linhas, E071 da tarefa S4HK912770 = o pacote `YJBV_POC_PKGT`).
//                 A liberação é que consolida — e acrescenta uma entrada `CORR RELE` por tarefa
//                 liberada, com número, data, hora e usuário no `OBJ_NAME`.
//
// Nenhuma das duas dispensa a outra. `lerRequest` é a via ADT; `lerRequestPorTabelas` é a via
// tabelas; `anatomia` roda as duas e cruza. Desde o item 71 existe a TERCEIRA via, SOAP puro sem
// sessão ADT (`lerRequestPorRfc`/`listarRequestsPorRfc`, TR_READ_COMM/TR_EXT_GET_REQUESTS) — o
// plano B quando o ADT está fora, e a única listagem de TR LIBERADA da lib.
// Receita: docs/receita-change-request.md.
// ---------------------------------------------------------------------------------------------

import { call } from './sap-connection.mjs';
import { readTable, callFunction, xmlItems, xmlField, xmlStruct } from './rfc-soap.mjs';
import { passo, detalhe } from './log.mjs';
import { getObject, deleteObject, assertZY, dataPreview } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { TIPOS } from './tipos/index.mjs';

const ACCEPT_REQUEST = 'application/vnd.sap.adt.transportorganizer.v1+xml';
const ACCEPT_ARVORE = 'application/vnd.sap.adt.transportorganizertree.v1+xml';

// ---------- parsers (testáveis sem SAP) ----------

const attr = (bloco, nome) => bloco.match(new RegExp(`${nome}="([^"]*)"`))?.[1] ?? '';
const desescapar = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Um `<tm:abap_object …/>` — a entrada de objeto como o ADT a descreve. */
function objetoDoXml(bloco) {
  return {
    pgmid: attr(bloco, 'tm:pgmid'),
    tipo: attr(bloco, 'tm:type'),
    nome: desescapar(attr(bloco, 'tm:name')),
    wbtype: attr(bloco, 'tm:wbtype'),           // CLAS/OM, DEVC/K — vazio para CORR/RELE e TABU/VDAT
    descricaoTipo: desescapar(attr(bloco, 'tm:obj_info')),
    posicao: attr(bloco, 'tm:position'),
    lock: attr(bloco, 'tm:lock_status'),        // 'X' = travado nesta TR; '3' = TR liberada
  };
}

const objetosDe = (trecho) =>
  [...trecho.matchAll(/<tm:abap_object\s([^>]*?)\/?>/g)].map(([, a]) => objetoDoXml(a));

function cabecalhoDoXml(bloco, tag) {
  return {
    numero: attr(bloco, 'tm:number'),
    pai: attr(bloco, 'tm:parent'),
    dono: attr(bloco, 'tm:owner'),
    descricao: desescapar(attr(bloco, 'tm:desc')),
    tipo: attr(bloco, 'tm:type'),
    status: attr(bloco, 'tm:status'),
    statusTexto: desescapar(attr(bloco, 'tm:status_text')),
    alvo: attr(bloco, 'tm:target'),
    mandanteOrigem: attr(bloco, 'tm:source_client'),
    alteradoEm: attr(bloco, 'tm:lastchanged_timestamp'),
    uri: attr(bloco, 'tm:uri'),
    ehTarefa: tag === 'tm:task',
  };
}

/**
 * Resposta do `GET cts/transportrequests/<TRKORR>`.
 *
 * O XML tem TRÊS lugares onde uma entrada de objeto aparece, e eles não são o mesmo (medido na
 * S4HK911417: 12 + 11 + 11 `tm:abap_object` no mesmo documento):
 *
 *   `<tm:abap_object>` filho direto de `<tm:request>` → as entradas PRÓPRIAS da request (a E071
 *                                                       dela; inclui a marca `CORR RELE`) → `proprios`
 *   `<tm:all_objects>`                                → a lista CONSOLIDADA, request + tarefas → `objetos`
 *   `<tm:abap_object>` dentro de `<tm:task>`          → as entradas daquela tarefa → `tarefas[].objetos`
 *
 * `objetos` é o consolidado porque é a resposta a "o que esta TR carrega". Quando `tm:all_objects`
 * não vem — é o caso ao pedir uma TAREFA direto — cai para próprias + tarefas, sem repetir.
 */
export function parseRequest(xml) {
  const req = xml.match(/<tm:request\s([^>]*)>([\s\S]*?)<\/tm:request>/);
  if (!req) return null;
  const [, atributos, corpo] = req;

  const tarefas = [...corpo.matchAll(/<tm:task\s([^>]*?)(?:\/>|>([\s\S]*?)<\/tm:task>)/g)]
    .map(([, a, interno = '']) => ({ ...cabecalhoDoXml(a, 'tm:task'), objetos: objetosDe(interno) }));

  const bloco = corpo.match(/<tm:all_objects>([\s\S]*?)<\/tm:all_objects>/);
  // O que sobra depois de tirar os blocos aninhados são as entradas PRÓPRIAS da request.
  const proprios = objetosDe(corpo
    .replace(/<tm:all_objects>[\s\S]*?<\/tm:all_objects>/g, '')
    .replace(/<tm:task\s[^>]*?>[\s\S]*?<\/tm:task>/g, ''));

  const objetos = bloco
    ? objetosDe(bloco[1])
    : [...new Map([...proprios, ...tarefas.flatMap((t) => t.objetos)]
        .map((o) => [`${o.pgmid}/${o.tipo}/${o.nome}`, o])).values()];

  return { ...cabecalhoDoXml(atributos, 'tm:request'), objetos, proprios, tarefas };
}

/** Resposta da árvore do Transport Organizer — lista plana de requests, cada uma com suas tarefas. */
export function parseArvore(xml) {
  return [...xml.matchAll(/<tm:request\s([^>]*?)(?:\/>|>([\s\S]*?)<\/tm:request>)/g)]
    .map(([, a, corpo = '']) => ({
      ...cabecalhoDoXml(a, 'tm:request'),
      tarefas: [...corpo.matchAll(/<tm:task\s([^>]*?)(?:\/>|>[\s\S]*?<\/tm:task>)/g)]
        .map(([, at]) => cabecalhoDoXml(at, 'tm:task')),
    }));
}

// ---------- via ADT ----------

// Leitura é STATELESS: com senha, um logon novo sem contexto no servidor (nada fica vivo depois da
// resposta); sem senha, a sessão do connect. Medido 2026-08-30 (S4H 758): com o ADT stateful no estado
// "Session not found", a leitura stateful da TR volta sem <tm:request> e o logoff dá 400 — e cada
// tentativa deixa mais uma órfã; a stateless responde 200. Quem já tem uma sessão passa `{ sessao }`.
async function sessaoDeLeitura(conexao, sessao) {
  if (sessao) return sessao;
  return conexao.podeAbrirLogon() ? conexao.sessaoStateless() : conexao.sessao();
}

/** A TR como o Transport Organizer a mostra: tarefas consolidadas, tipo com texto, sem chaves. */
export async function lerRequest(conexao, trkorr, { sessao } = {}) {
  const numero = String(trkorr).toUpperCase();
  passo(`cts: ler ${numero}`);
  const s = await sessaoDeLeitura(conexao, sessao);
  const { text } = await call(s, {
    path: `/sap/bc/adt/cts/transportrequests/${encodeURIComponent(numero)}`,
    accept: ACCEPT_REQUEST,
  });
  const req = parseRequest(text);
  if (!req) throw new Error(`cts: ${numero} não devolveu <tm:request> (a TR existe neste sistema?)`);
  detalhe(`${numero}: ${req.objetos.length} objeto(s), ${req.tarefas.length} tarefa(s)`);
  return req;
}

/**
 * A árvore do Transport Organizer.
 *
 * `status` é OBRIGATÓRIO na prática: sem `requestStatus` na query o recurso devolve **HTTP 200 com
 * a árvore VAZIA** — falha silenciosa, não erro (medido: `?user=X` → 300 bytes, nenhuma request;
 * `?user=X&requestStatus=D` → 8 requests). Medido também: `requestStatus=R` devolve vazio neste
 * release — a árvore serve as modificáveis.
 */
export async function listarRequests(conexao, { usuario, status = 'D', sessao } = {}) {
  const user = String(usuario ?? conexao.cfg.user).toUpperCase();
  passo(`cts: árvore de ${user} (status ${status})`);
  const s = await sessaoDeLeitura(conexao, sessao);
  const q = `?user=${encodeURIComponent(user)}&requestStatus=${encodeURIComponent(status)}`;
  const { text } = await call(s, { path: `/sap/bc/adt/cts/transportrequests${q}`, accept: ACCEPT_ARVORE });
  const requests = parseArvore(text);
  detalhe(`árvore: ${requests.length} request(s)`);
  return requests;
}

// ---------- via tabelas (SOAP RFC) ----------

// Sem `campos`, o RFC_READ_TABLE devolve a linha inteira e os nomes vêm da própria resposta — é de
// propósito: pedir um campo que não existe faz o FM levantar TABLE_WITHOUT_DATA, mensagem que não
// tem nada a ver com a causa (medido: `GENFLAG`, que na E071 se chama `GENNUM`).
const linhasDe = (cfg, tabela, trkorr, linhas = 500) =>
  readTable(cfg, tabela, { where: [`TRKORR = '${trkorr}'`], linhas });

async function corpoDe(cfg, trkorr, { chaves }) {
  const [cabecalho] = await linhasDe(cfg, 'E070', trkorr, 1);
  const textos = await linhasDe(cfg, 'E07T', trkorr, 20);
  return {
    numero: trkorr,
    cabecalho: cabecalho ?? null,
    descricao: textos[0]?.AS4TEXT ?? '',
    textos,
    objetos: await linhasDe(cfg, 'E071', trkorr),
    chaves: chaves ? await linhasDe(cfg, 'E071K', trkorr) : [],
  };
}

/**
 * A TR pelas tabelas do CTS — a única via que enxerga as ENTRADAS DE CHAVE (`E071K.TABKEY`).
 *
 * `TABKEY` é a chave CONCATENADA e posicional da linha transportada, começando pelo mandante
 * quando a tabela é dependente dele, com `*` de curinga: `250FSSA`, `300P1411Z0` (mandante +
 * idioma + chave, numa tabela de texto), `0000AAAB040000FFFFFFFFFFFFFFFFFF*`. O par
 * `MASTERTYPE`/`MASTERNAME` diz de quem a entrada depende — `VDAT` + a visão de manutenção, ou
 * `TABU` + a própria tabela.
 *
 * Traz as TAREFAS junto (`E070.STRKORR = <TR>`), porque é nelas que as entradas moram antes da
 * liberação. `consolidado` é a união TR + tarefas, sem repetição — o que a via ADT mostraria.
 */
export async function lerRequestPorTabelas(cfg, trkorr, { chaves = true, tarefas = true, fatiar = false } = {}) {
  const numero = String(trkorr).toUpperCase();
  passo(`cts: ler ${numero} pelas tabelas`);
  const req = await corpoDe(cfg, numero, { chaves });
  req.tarefas = [];
  if (tarefas) {
    const filhas = await readTable(cfg, 'E070', {
      campos: ['TRKORR'], where: [`STRKORR = '${numero}'`], linhas: 100,
    });
    for (const f of filhas) req.tarefas.push(await corpoDe(cfg, f.TRKORR, { chaves }));
  }
  req.consolidado = consolidar([req, ...req.tarefas]);
  // `fatiar`: cada entrada de chave ganha `campos` (o TABKEY cortado pelo layout da tabela) — um
  // DDIF_FIELDINFO_GET por tabela distinta, com cache.
  if (fatiar && chaves) req.consolidado.chaves = await fatiarChaves(cfg, req.consolidado.chaves);
  detalhe(`${numero}: ${req.consolidado.objetos.length} objeto(s), `
    + `${req.consolidado.chaves.length} chave(s), ${req.tarefas.length} tarefa(s)`);
  return req;
}

/** União TR + tarefas, sem repetir a mesma entrada. Exportado porque o `anatomia` também o usa. */
export function consolidar(requests) {
  const unico = (linhas, chave) => [...new Map(linhas.map((l) => [chave(l), l])).values()];
  return {
    objetos: unico(requests.flatMap((r) => r.objetos), (o) => `${o.PGMID}/${o.OBJECT}/${o.OBJ_NAME}`),
    chaves: unico(requests.flatMap((r) => r.chaves), (k) => `${k.OBJECT}/${k.OBJNAME}/${k.TABKEY}`),
  };
}

// ---------- as duas juntas ----------

/**
 * Roda as duas vias e cruza. `soNasTabelas` costuma vir vazio (a via ADT consolida tudo o que a
 * E071 tem); `chaves` é o que só as tabelas enxergam — e é aí que mora a anatomia dos tipos que
 * transportam por chave.
 */
export async function anatomia(conexao, trkorr, { fatiar = false, sessao } = {}) {
  const numero = String(trkorr).toUpperCase();
  const adt = await lerRequest(conexao, numero, { sessao });
  const tabelas = await lerRequestPorTabelas(conexao.cfg, numero, { fatiar });
  // A união dos três lugares do XML — senão a marca `CORR RELE`, que só está nas entradas próprias,
  // apareceria como "só nas tabelas" e mentiria sobre a diferença entre as vias.
  const noAdt = new Set([...adt.objetos, ...adt.proprios, ...adt.tarefas.flatMap((t) => t.objetos)]
    .map((o) => `${o.pgmid}/${o.tipo}/${o.nome.trim()}`));
  const nasTabelas = new Set(tabelas.consolidado.objetos.map((o) => `${o.PGMID}/${o.OBJECT}/${o.OBJ_NAME.trim()}`));
  return {
    numero,
    adt,
    tabelas,
    soNoAdt: [...noAdt].filter((k) => !nasTabelas.has(k)),
    soNasTabelas: [...nasTabelas].filter((k) => !noAdt.has(k)),
    chaves: tabelas.consolidado.chaves,
  };
}

// ---------- a entrada de chave, fatiada (item 21 da fila — medido 2026-08-30, S4H 758) ----------
//
// `TABKEY` é a concatenação dos campos-CHAVE da tabela, na ordem do dicionário, cada um com a sua
// largura EXTERNA em caracteres (`DFIES-LENG`) — não o `OFFSET`/`INTLEN`, que são bytes Unicode
// (2 por caractere). Medido: T460T `000E000310` = MANDT(3) SPRAS(1) WERKS(4) SOBSL(2); a soma dos
// LENG dos campos-chave bate com o comprimento do TABKEY em todas as 17 amostras. O layout vem de
// `DDIF_FIELDINFO_GET` (RFC-enabled): já expandido (includes) e ordenado por POSITION — a DD03L crua
// vem fora de ordem e obriga a resolver includes à mão.
//
// Regras do curinga `*` (medidas): `250ZFPV…_0001         *` = mandante + SERVICE_ID, o resto livre;
// `000*` numa VDAT = todas as linhas do mandante 000; `*` sozinho = a tabela inteira. Depois do `*`
// nenhum campo tem valor (`null`). `TABKEY` é CHAR 120 — chave mais longa que isso sai truncada
// (`truncado: true`, sem amostra no s4h). Valores CHAR vêm com o padding à direita (`APPROVE   `):
// `whereDaChave` faz o trim. O mandante do TABKEY é o de ORIGEM (000 nas entregas SAP) — a leitura
// pelo `RFC_READ_TABLE` roda no mandante do logon, por isso o WHERE não leva o CLNT por default.
//
// Limite medido: no s4h não há entrada de chave sobre tabela com campo-chave RAW/DATS/INT4/DEC/TIMS
// (todas as chaves transportadas são CHAR/NUMC/LANG/CLNT; o "GUID" das FDT_* é CHAR 32). Como o
// TABKEY representa esses tipos NÃO foi medido.

const TABKEY_MAX = 120;
const layouts = new Map();

/**
 * Os campos-chave da tabela, na ordem e com a largura que o TABKEY usa: [{ campo, tipo, leng, pos }].
 * Por `DDIF_FIELDINFO_GET` (SOAP RFC), com cache por sistema+tabela.
 */
export async function layoutChave(cfg, tabela) {
  const T = String(tabela).toUpperCase().trim();
  const k = `${cfg.base}|${cfg.client}|${T}`;
  if (layouts.has(k)) return layouts.get(k);
  const { xml } = await callFunction(cfg, 'DDIF_FIELDINFO_GET', { TABNAME: T, ALL_TYPES: 'X', LANGU: cfg.lang || 'E', DFIES_TAB: [] });
  const chave = xmlItems(xml, 'DFIES_TAB')
    .filter((c) => c.KEYFLAG === 'X')
    .sort((a, b) => Number(a.POSITION) - Number(b.POSITION))
    .map((c) => ({ campo: c.FIELDNAME, tipo: c.DATATYPE, leng: Number(c.LENG), pos: Number(c.POSITION) }));
  if (!chave.length) throw new Error(`layoutChave: ${T} sem campos-chave no dicionário (tabela inexistente ou sem chave)`);
  layouts.set(k, chave);
  return chave;
}

/**
 * Corta o TABKEY pelo layout. Puro. Devolve { campos: { CAMPO: valor | null }, curinga, consumido,
 * truncado, completo } — `null` = campo depois do `*` (qualquer valor); `completo` = todos os campos
 * com valor e nada sobrando.
 */
export function fatiarTabkey(layout, tabkey) {
  const tk = String(tabkey ?? '');
  const campos = {}; let off = 0; let curinga = false;
  for (const c of layout) {
    if (curinga) { campos[c.campo] = null; continue; }
    const pedaco = tk.slice(off, off + c.leng);
    const estrela = pedaco.indexOf('*');
    if (estrela >= 0) { curinga = true; campos[c.campo] = estrela > 0 ? pedaco.slice(0, estrela) : null; continue; }
    campos[c.campo] = pedaco; off += c.leng;
  }
  const soma = layout.reduce((s, c) => s + c.leng, 0);
  const truncado = !curinga && tk.length >= TABKEY_MAX && soma > TABKEY_MAX;
  return { campos, curinga, consumido: Math.min(off, tk.length), sobra: tk.length > off ? tk.slice(off).replace(/^\*/, '') : '', truncado, completo: !curinga && !truncado && off >= Math.min(soma, tk.length) };
}

/**
 * MONTA o TABKEY pelo layout — o inverso de `fatiarTabkey` (a metade que faltava do item 21:
 * fatiar já existia; montar não — item 79). Puro. `campos` = { CAMPO: valor }; `'*'` encerra a
 * chave como curinga — sozinho (`SPRAS: '*'`, campo inteiro em aberto) ou como sufixo de prefixo
 * (`NAME: 'ZJBV_*'`), a mesma forma que o fatiar aceita em `'000E00*'`.
 * NUMC completa com zeros à esquerda, o resto com espaço à direita; valor mais largo que o campo
 * é recusado (o TABKEY é posicional — truncar calado mudaria a chave de linha). Campo sem valor e
 * sem curinga é recusado; campo que o layout não conhece também (typo viraria chave errada em
 * silêncio). Espaços finais saem (o SAP guarda '250BR', não '250BR ' — medido no item 79).
 */
export function montarTabkey(layout, campos = {}) {
  const vals = Object.fromEntries(Object.entries(campos ?? {}).map(([k, v]) => [String(k).toUpperCase().trim(), v]));
  const sobrando = new Set(Object.keys(vals));
  let tk = '';
  for (const c of layout) {
    const v = vals[c.campo];
    sobrando.delete(c.campo);
    if (v === undefined || v === null) {
      throw new Error(`montarTabkey: falta o campo ${c.campo} — para chave parcial (prefixo), ponha '*' no primeiro campo em aberto.`);
    }
    const s = String(v);
    const estrela = s.indexOf('*');
    if (estrela >= 0) {
      if (estrela !== s.length - 1) throw new Error(`montarTabkey: ${c.campo}="${s}" — o '*' só vale no FIM do valor (curinga é prefixo, como no TABKEY).`);
      if (estrela > c.leng) throw new Error(`montarTabkey: ${c.campo}="${s}" passa da largura ${c.leng} do TABKEY.`);
      tk += s; break;
    }
    if (s.length > c.leng) throw new Error(`montarTabkey: ${c.campo}="${s}" passa da largura ${c.leng} do TABKEY.`);
    tk += c.tipo === 'NUMC' ? s.padStart(c.leng, '0') : s.padEnd(c.leng, ' ');
  }
  if (sobrando.size) {
    throw new Error(`montarTabkey: campo(s) fora do layout ou depois do curinga: ${[...sobrando].join(', ')} — a chave é ${layout.map((c) => c.campo).join('+')}.`);
  }
  return tk.replace(/ +$/, '');
}

/**
 * A tabela transporta chave STRING (E071K_STR)? Critério lido no fonte do TR_NAMETAB_GET e medido
 * no item 81: existe campo-CHAVE de DATATYPE 'SSTR' — NÃO é o comprimento total da chave. Puro.
 */
export function ehTabelaString(layout) {
  return (layout ?? []).some((c) => c.tipo === 'SSTR');
}

/**
 * MONTA a chave de tabela STRING — o par do `montarTabkey` para o ramo E071K_STR (item 81). Puro.
 * O TABKEY string é concatenação SEM largura fixa, e quem diz onde cada campo termina é o
 * KEY_LENS: números de 5 dígitos concatenados, um por campo informado (formato lido no fonte de
 * TR_CONVERT_STRING_TO_FIELDS e provado por PUT + E071K_STR). Cada campo entra com o comprimento
 * REAL do valor — a forma que a medição provou de ponta a ponta (CHAR padeado até o LENG não foi
 * medido, e o KEY_LENS torna o padding desnecessário); só NUMC ganha zeros à esquerda, porque sem
 * eles '2' e '02' virariam chaves diferentes da mesma linha. `'*'` no fim encerra a chave
 * como curinga (o '*' conta no comprimento — medido). Valor mais largo que o LENG do dicionário é
 * recusado AQUI: no servidor essa chave é **500 sem dump que derruba a sessão ADT** (medido).
 * Devolve { tabkey, lens }.
 */
export function montarTabkeyString(layout, campos = {}) {
  const vals = Object.fromEntries(Object.entries(campos ?? {}).map(([k, v]) => [String(k).toUpperCase().trim(), v]));
  const sobrando = new Set(Object.keys(vals));
  let tabkey = '';
  const larguras = [];
  let curinga = false;
  for (const c of layout) {
    const v = vals[c.campo];
    if (curinga) {
      if (v !== undefined && v !== null) {
        throw new Error(`montarTabkeyString: ${c.campo} vem depois do curinga — depois do '*' nenhum campo tem valor.`);
      }
      continue;
    }
    sobrando.delete(c.campo);
    if (v === undefined || v === null) {
      throw new Error(`montarTabkeyString: falta o campo ${c.campo} — para chave parcial (prefixo), ponha '*' no primeiro campo em aberto.`);
    }
    let s = String(v);
    const estrela = s.indexOf('*');
    if (estrela >= 0) {
      if (estrela !== s.length - 1) throw new Error(`montarTabkeyString: ${c.campo}="${s}" — o '*' só vale no FIM do valor (curinga é prefixo).`);
      if (estrela > c.leng) throw new Error(`montarTabkeyString: ${c.campo}="${s}" passa da largura ${c.leng} do dicionário.`);
      curinga = true;
    } else {
      if (c.tipo === 'NUMC') s = s.padStart(c.leng, '0');
      if (s.length > c.leng) {
        throw new Error(`montarTabkeyString: ${c.campo}="${String(v)}" passa da largura ${c.leng} do dicionário — no servidor essa chave é 500 SEM dump que DERRUBA a sessão ADT (medido, item 81).`);
      }
    }
    tabkey += s;
    larguras.push(s.length);
  }
  if (sobrando.size) {
    throw new Error(`montarTabkeyString: campo(s) fora do layout ou depois do curinga: ${[...sobrando].join(', ')} — a chave é ${layout.map((c) => c.campo).join('+')}.`);
  }
  return { tabkey, lens: larguras.map((n) => String(n).padStart(5, '0')).join('') };
}

/** As linhas de WHERE (≤ 72 chars cada, regra do RFC_READ_TABLE) para reler a linha da chave. Puro. */
export function whereDaChave(layout, campos, { mandante = false } = {}) {
  const linhas = [];
  for (const c of layout) {
    if (c.tipo === 'CLNT' && !mandante) continue;
    const v = campos[c.campo];
    if (v == null) continue;
    const val = String(v).replace(/\s+$/, '');
    const cond = `${c.campo} = '${val.replace(/'/g, "''")}'`;
    if (cond.length > 72) throw new Error(`whereDaChave: condição de ${c.campo} passa de 72 caracteres — o RFC_READ_TABLE não aceita`);
    linhas.push(linhas.length ? `AND ${cond}` : cond);
  }
  return linhas;
}

/** Cada entrada de chave (E071K) ganha `tabela`, `layout`, `campos`, `curinga`, `completo`. Layout com cache. */
export async function fatiarChaves(cfg, chaves) {
  const out = [];
  for (const k of chaves) {
    const tabela = String(k.OBJNAME ?? k.tabela ?? '').trim();
    try {
      const layout = await layoutChave(cfg, tabela);
      out.push({ ...k, tabela, layout, ...fatiarTabkey(layout, k.TABKEY ?? k.tabkey) });
    } catch (e) {
      out.push({ ...k, tabela, layout: null, campos: null, curinga: false, completo: false, erro: e.message });
    }
  }
  return out;
}

/**
 * Relê no sistema (mandante do logon) a linha que a entrada de chave descreve. Devolve
 * { existe, linhas, where }. Chave com curinga devolve as linhas que casam com o prefixo (até `max`).
 */
export async function lerLinhaDaChave(cfg, chave, { max = 10, mandante = false } = {}) {
  const tabela = String(chave.tabela ?? chave.OBJNAME).trim();
  const layout = chave.layout ?? await layoutChave(cfg, tabela);
  const campos = chave.campos ?? fatiarTabkey(layout, chave.TABKEY ?? chave.tabkey).campos;
  const where = whereDaChave(layout, campos, { mandante });
  const linhas = await readTable(cfg, tabela, { campos: layout.map((c) => c.campo), where, linhas: max });
  return { existe: linhas.length > 0, linhas, where };
}

// ---------- diff "TR × sistema" (item 22 da fila — medido 2026-08-30, S4H 758) ----------
//
// A pergunta: "o que esta TR diz que carrega ainda corresponde ao que está no sistema?" Três fontes,
// nenhuma dispensa a outra (medido na S4HK911417, liberada 2026-06-19, e na família ZCL_ALV_REPORTER):
//
//   VRSD   a base de versões — uma linha por PARTE (grão LIMU: METH, CLSD, CPUB, CINC, REPS…), com o
//          número da TR que gerou a versão (`KORRNUM`) e o carimbo. A versão da TR nasce NA LIBERAÇÃO
//          (medido: tarefa liberada 00:17:03, versão 00:17:09, ordem liberada 00:17:14) — TR modificável
//          não tem versão própria ainda. `VERSNO 00000` é a versão ATIVA e o seu `KORRNUM` é a última
//          TR liberada que a tocou — ele NÃO muda quando outra ordem só trava o objeto. Versão NUMERADA
//          só nasce quando o conteúdo difere da última (medido: o transporte de cópias S4HK911429 levou
//          ZCL_TRANSPORT_READER inteira e só re-carimbou o 00000; ZCL_ALV_REPORTER ganhou 00004 porque
//          tinha mudado). Por isso: versão numerada posterior = ALTERADO; só o 00000 re-carimbado ou a
//          família noutra TR liberada = TRANSPORTADO de novo, sem prova de mudança.
//   E071   as outras ordens que carregam a mesma FAMÍLIA (o objeto inteiro `R3TR` e as suas partes
//          `LIMU`). Cruzar só pela entrada exata perde: a TR seguinte pode levar `R3TR CLAS` inteiro
//          enquanto esta levou `LIMU METH` (medido: S4HK911429). `LOCKFLAG = 'X'` numa ordem
//          modificável = o objeto está em EDIÇÃO por outra ordem AGORA (medido: S4HK911451).
//   TADIR  existência do objeto inteiro (`R3TR`). Parte (`LIMU`) não tem linha própria — a existência
//          é a do pai. Conteúdo de tabela/visão (`TABU`/`VDAT`/`CDAT`) também não: o que existe é a
//          tabela/visão (`TABL`/`VIEW`/`VCLS`) e, pela E071K, a LINHA (`lerLinhaDaChave`).
//   ADT    `adtcore:changedAt` do objeto inteiro — a última ativação, em UTC, para os tipos que a lib
//          conhece. O CTS carimba em hora LOCAL do sistema (`TTZCU-TZONESYS`; medido: CET, UTC+2 no
//          verão — REPOSRC 18:32:30 ↔ changedAt 16:32:30Z). Comparar exige converter.
//
// Não serve: `cts/transportrequests/reference` (o `tm:dummy_uri`) é o "ir para o objeto" do Eclipse —
// sem `tr_number` dá 400 ExceptionParameterNotFound; com ele, "Service nicht erreichbar". `TADIR` não
// tem data de alteração (CHECK_DATE é do ATC); `SEOCLASSDF-CHANGEDON` vem zerado.

// Parte (LIMU) → o objeto inteiro (R3TR) de que ela é parte. O nome da parte de classe é posicional:
// classe em 30 posições (ou até o `=` das includes geradas `ZCL_X==============CCAU`), depois a parte.
const PARTES = {
  METH: 'CLAS', CLSD: 'CLAS', CPUB: 'CLAS', CPRI: 'CLAS', CPRO: 'CLAS', CINC: 'CLAS', CLSI: 'CLAS',
  INTD: 'INTF',
  REPS: 'PROG', REPT: 'PROG', VARI: 'PROG', VARX: 'PROG', DYNP: 'PROG', CUAD: 'PROG',
  TABD: 'TABL', TABT: 'TABL', INDX: 'TABL', DOMD: 'DOMA', DTED: 'DTEL', VIED: 'VIEW', VIET: 'VIEW', TYPD: 'TTYP',
};
// Conteúdo transportado por chave → o objeto de dicionário que precisa existir.
const CONTEUDO = { TABU: 'TABL', VDAT: 'VIEW', CDAT: 'VCLS' };
const nomeDaClasse = (n) => String(n).slice(0, 30).replace(/=+$/, '').trim();

/**
 * A família de uma entrada: { codigo, nome } do objeto INTEIRO a que ela pertence. Puro.
 * `R3TR X` é a própria; `LIMU METH "ZCL_A<30 pos>M"` → CLAS ZCL_A; `TABU T001` → TABL T001 (o que
 * existe é a tabela; a linha é assunto da E071K). `null` quando não há objeto (CORR RELE) ou a parte
 * não revela o pai (LIMU FUNC: o grupo de funções não está no nome).
 */
export function familiaDe({ PGMID, OBJECT, OBJ_NAME }) {
  const nome = String(OBJ_NAME ?? '').trim();
  if (PGMID === 'R3TR') return { codigo: CONTEUDO[OBJECT] ?? OBJECT, nome, conteudo: Boolean(CONTEUDO[OBJECT]) };
  if (PGMID === 'LIMU') {
    const pai = PARTES[OBJECT];
    if (!pai) return null;
    return { codigo: pai, nome: pai === 'CLAS' || pai === 'INTF' ? nomeDaClasse(OBJ_NAME) : nome, conteudo: false };
  }
  return null;
}
const mesmaFamilia = (f, linha) => { const g = familiaDe(linha); return Boolean(g && f && g.codigo === f.codigo && g.nome === f.nome); };

// Fuso do sistema: `TTZCU-TZONESYS` (código SAP) → IANA, para converter o `changedAt` UTC do ADT.
const FUSOS = { CET: 'Europe/Berlin', UTC: 'UTC', GMTUK: 'Europe/London', BRAZIL: 'America/Sao_Paulo', EST: 'America/New_York', CST: 'America/Chicago', MST: 'America/Denver', PST: 'America/Los_Angeles', INDIA: 'Asia/Kolkata', JAPAN: 'Asia/Tokyo', CHINA: 'Asia/Shanghai', AUSNSW: 'Australia/Sydney', SAST: 'Africa/Johannesburg' };
const fusos = new Map();
export async function fusoDoSistema(cfg) {
  const k = `${cfg.base}|${cfg.client}`;
  if (!fusos.has(k)) {
    const [t] = await readTable(cfg, 'TTZCU', { campos: ['TZONESYS'], linhas: 1 }).catch(() => []);
    const sap = t?.TZONESYS ?? '';
    fusos.set(k, { sap, iana: FUSOS[sap] ?? null });
  }
  return fusos.get(k);
}
/** ISO UTC (`2026-06-29T16:32:30Z`) → carimbo local `AAAAMMDDHHMMSS` no fuso IANA. Puro. */
export function paraHoraLocal(isoUtc, iana) {
  if (!isoUtc || !iana) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(isoUtc)).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}
const carimbo = (l, d = 'AS4DATE', h = 'AS4TIME') => (l?.[d] && l[d] !== '00000000' ? `${l[d]}${l[h] ?? ''}` : null);

// `OPTIONS` do RFC_READ_TABLE: ≤ 72 chars por linha. Nome longo (LIMU METH pode ter 60) não cabe num
// `=`; vai como LIKE pelo prefixo e o filtro exato fica do lado do cliente.
const aspas = (v) => String(v).replace(/'/g, "''");
function condNome(campo, valor) {
  const exata = `${campo} = '${aspas(valor)}'`;
  if (exata.length <= 72) return { where: exata, exato: true };
  const prefixo = String(valor).slice(0, 72 - campo.length - 10);
  return { where: `${campo} LIKE '${aspas(prefixo)}%'`, exato: false };
}

/**
 * Veredito de uma entrada a partir dos sinais. Puro.
 *   inexistente      não está na TADIR (ou marcado para apagar)
 *   em-edicao        travado (`LOCKFLAG X`) por outra ordem modificável agora
 *   alterado-depois  versão NUMERADA posterior à desta TR, ou `changedAt` do ADT depois da referência
 *   noutra-tr-depois a família saiu noutra TR liberada depois (ou só o ponteiro 00000 foi re-carimbado)
 *                    — transporte de cópias, ou liberação sem mudança; o conteúdo não provou ter mudado
 *   por-chave        conteúdo de tabela/visão (TABU/VDAT/CDAT): a tabela existe; o juízo é linha a
 *                    linha, em `chaves` — outra ordem de customizing aberta com a mesma visão não é
 *                    "edição" desta entrada (medido: 16 de 18 visões da S4HK910129 estão em ordens abertas)
 *   igual            existe e nenhum sinal
 *   sem-medida       nada mensurável (CORR RELE, parte sem pai conhecido)
 */
export function veredito(e) {
  if (e.existe === false) return 'inexistente';
  if (e.familia?.conteudo) return e.existe ? 'por-chave' : 'sem-medida';
  if (e.abertas?.length) return 'em-edicao';
  if (e.versoes?.depois?.length || e.adt?.alteradoDepois) return 'alterado-depois';
  if (e.depois?.length || e.versoes?.ativaDeOutra) return 'noutra-tr-depois';
  if (e.existe == null && !e.versoes?.total && !e.outrasTrs?.length) return 'sem-medida';
  return 'igual';
}

/**
 * Diff "TR × sistema": cada entrada da TR (objetos R3TR/LIMU e, com `chaves`, as linhas da E071K)
 * confrontada com o que existe HOJE no sistema do logon. Somente leitura.
 *
 * Por entrada de objeto: `existe` (TADIR do objeto inteiro; `null` = sem como medir), `versoes` (VRSD
 * da entrada: `naTr`, `depois`, `ativa`), `outrasTrs` (E071 da família noutras ordens, com `depois` e
 * `abertas` recortadas), `adt` (changedAt convertido para hora local, quando o tipo é conhecido) e
 * `veredito`: igual · alterado-depois · em-edicao · inexistente · sem-medida.
 * `referencia` é o carimbo da TR (liberação, ou última alteração se modificável) — "depois" é depois dele.
 */
export async function diff(conexao, trkorr, { chaves = true, adt = true } = {}) {
  const cfg = conexao.cfg;
  const numero = String(trkorr).toUpperCase();
  passo(`cts: diff ${numero} × ${cfg.alias ?? cfg.base}`);
  const sessao = await sessaoDeLeitura(conexao);   // uma só, stateless, para a TR e os getObject
  const a = await anatomia(conexao, numero, { fatiar: chaves, sessao });
  const minhas = new Set([numero, ...a.tabelas.tarefas.map((t) => t.numero)]);
  const cab = a.tabelas.cabecalho;
  const liberada = cab?.TRSTATUS === 'R';
  const referencia = carimbo(cab);
  const fuso = adt ? await fusoDoSistema(cfg) : null;
  const wbtypes = new Map([...a.adt.objetos, ...a.adt.proprios, ...a.adt.tarefas.flatMap((t) => t.objetos)]
    .map((o) => [`${o.pgmid}/${o.tipo}/${o.nome.trim()}`, o.wbtype]));

  const e070 = new Map();
  const cabecalhoDe = async (tr) => {
    if (!e070.has(tr)) e070.set(tr, (await readTable(cfg, 'E070', { campos: ['TRKORR', 'TRFUNCTION', 'TRSTATUS', 'STRKORR', 'AS4USER', 'AS4DATE', 'AS4TIME'], where: [`TRKORR = '${tr}'`], linhas: 1 }))[0] ?? null);
    return e070.get(tr);
  };
  // E071 e VRSD por FAMÍLIA (uma leitura por família, com cache): LIKE pelo nome-base, filtro exato aqui.
  const famE071 = new Map(); const famVrsd = new Map(); const tadir = new Map(); const adtCache = new Map();
  const chaveFam = (f) => `${f.codigo}/${f.nome}`;
  const lerFamilia = async (f) => {
    const k = chaveFam(f);
    if (!famE071.has(k)) {
      const like = `LIKE '${aspas(f.nome.slice(0, 50))}%'`;
      const e = await readTable(cfg, 'E071', { campos: ['TRKORR', 'PGMID', 'OBJECT', 'OBJ_NAME', 'LOCKFLAG'], where: [`OBJ_NAME ${like}`], linhas: 500 });
      famE071.set(k, e.filter((l) => mesmaFamilia(f, l)));
      const v = f.conteudo ? [] : await readTable(cfg, 'VRSD', { campos: ['OBJTYPE', 'OBJNAME', 'VERSNO', 'KORRNUM', 'AUTHOR', 'DATUM', 'ZEIT'], where: [`OBJNAME ${like}`], linhas: 500 });
      famVrsd.set(k, v.filter((l) => mesmaFamilia(f, { PGMID: l.OBJTYPE === f.codigo ? 'R3TR' : 'LIMU', OBJECT: l.OBJTYPE, OBJ_NAME: l.OBJNAME })));
    }
    return { e071: famE071.get(k), vrsd: famVrsd.get(k) };
  };
  const existenciaDe = async (f) => {
    const k = chaveFam(f);
    if (!tadir.has(k)) {
      const c = condNome('OBJ_NAME', f.nome);
      const linhas = await readTable(cfg, 'TADIR', { campos: ['OBJ_NAME', 'DEVCLASS', 'AUTHOR', 'SRCSYSTEM', 'GENFLAG', 'DELFLAG', 'CREATED_ON'], where: [`PGMID = 'R3TR' AND OBJECT = '${f.codigo}'`, `AND ${c.where}`], linhas: 5 });
      const t = linhas.find((l) => l.OBJ_NAME.trim() === f.nome) ?? null;
      tadir.set(k, t ? { existe: t.DELFLAG !== 'X', pacote: t.DEVCLASS, autor: t.AUTHOR, origem: t.SRCSYSTEM, gerado: t.GENFLAG === 'X', marcadoParaApagar: t.DELFLAG === 'X', criadoEm: t.CREATED_ON } : { existe: false });
    }
    return tadir.get(k);
  };
  const adtDe = async (f, wbtype) => {
    const alvos = TIPOS[f.codigo]?.alvos ?? [];
    const alvo = alvos.find((x) => x.adtType === wbtype) ?? alvos[0];
    if (!alvo) return null;
    const k = `${alvo.libKey}/${f.nome}`;
    if (!adtCache.has(k)) {
      try {
        const g = await getObject(sessao, alvo.libKey, f.nome);
        const at = (n) => (g.text?.match(new RegExp(`adtcore:${n}="([^"]*)"`)) || [])[1] ?? null;
        const changedAt = at('changedAt');
        const local = paraHoraLocal(changedAt, fuso?.iana);
        adtCache.set(k, { libKey: alvo.libKey, status: g.status, existe: g.exists, versao: g.version ?? null, changedAt, changedBy: at('changedBy'), changedAtLocal: local, fuso: fuso?.sap ?? null, alteradoDepois: local && referencia ? local > referencia : null });
      } catch (err) { adtCache.set(k, { libKey: alvo.libKey, erro: err.message.slice(0, 200) }); }
    }
    return adtCache.get(k);
  };

  const entradas = [];
  for (const o of a.tabelas.consolidado.objetos) {
    const base = { pgmid: o.PGMID, object: o.OBJECT, nome: o.OBJ_NAME.trim(), familia: familiaDe(o) };
    if (!base.familia) { entradas.push({ ...base, existe: null, versoes: null, outrasTrs: [], depois: [], abertas: [], adt: null, veredito: 'sem-medida' }); continue; }
    const f = base.familia;
    const { e071, vrsd } = await lerFamilia(f);
    const ex = await existenciaDe(f);
    // versões DESTA entrada (parte exata) — para R3TR, as de todas as partes da família
    const minhasVersoes = (o.PGMID === 'R3TR' ? vrsd : vrsd.filter((v) => v.OBJTYPE === o.OBJECT && v.OBJNAME.trim() === base.nome))
      .map((v) => ({ parte: `${v.OBJTYPE} ${v.OBJNAME.trim()}`, versno: v.VERSNO, trkorr: v.KORRNUM, autor: v.AUTHOR, quando: carimbo(v, 'DATUM', 'ZEIT') }));
    const naTr = minhasVersoes.filter((v) => minhas.has(v.trkorr) && v.versno !== '00000');
    const marco = naTr.map((v) => v.quando).sort().at(-1) ?? referencia;
    // só versão NUMERADA prova mudança de conteúdo; o 00000 re-carimbado por outra TR é sinal fraco
    const depoisV = minhasVersoes.filter((v) => v.versno !== '00000' && !minhas.has(v.trkorr) && v.quando && marco && v.quando > marco);
    const ativa = minhasVersoes.filter((v) => v.versno === '00000');
    const ativaDeOutra = ativa.some((v) => !minhas.has(v.trkorr) && v.quando && marco && v.quando > marco);
    // outras ordens da família, agrupadas pela ORDEM (tarefa → mãe)
    const porOrdem = new Map();
    for (const l of e071.filter((l) => !minhas.has(l.TRKORR))) {
      const h = await cabecalhoDe(l.TRKORR);
      const mae = h?.STRKORR || l.TRKORR;
      const hm = mae === l.TRKORR ? h : await cabecalhoDe(mae);
      if (!porOrdem.has(mae)) porOrdem.set(mae, { trkorr: mae, funcao: hm?.TRFUNCTION ?? null, status: hm?.TRSTATUS ?? null, dono: hm?.AS4USER ?? null, quando: carimbo(hm), tarefas: new Set(), entradas: [], emEdicao: false });
      const g = porOrdem.get(mae);
      if (mae !== l.TRKORR) g.tarefas.add(l.TRKORR);
      g.entradas.push(`${l.PGMID} ${l.OBJECT} ${l.OBJ_NAME.trim()}`);
      if (l.LOCKFLAG === 'X') g.emEdicao = true;
    }
    const outrasTrs = [...porOrdem.values()].map((g) => ({ ...g, tarefas: [...g.tarefas], entradas: [...new Set(g.entradas)] })).sort((x, y) => String(x.quando).localeCompare(String(y.quando)));
    const depoisT = outrasTrs.filter((g) => g.status === 'R' && g.quando && referencia && g.quando > referencia);
    const abertas = outrasTrs.filter((g) => g.emEdicao || g.status === 'D');
    const wb = wbtypes.get(`${o.PGMID}/${o.OBJECT}/${base.nome}`) ?? '';
    const ad = adt && !f.conteudo && ex.existe ? await adtDe(f, wb) : null;
    const e = { ...base, existe: f.conteudo && !ex.existe ? null : ex.existe, tadir: ex, versoes: { total: minhasVersoes.length, naTr, depois: depoisV, trsDepois: [...new Set(depoisV.map((v) => v.trkorr))], partesAlteradas: [...new Set(depoisV.map((v) => v.parte))], ativa, ativaDeOutra, marco }, outrasTrs, depois: depoisT, abertas, adt: ad };
    e.veredito = veredito(e);
    entradas.push(e);
  }

  const linhas = [];
  if (chaves) {
    for (const k of a.chaves) {
      const l = { tabela: k.tabela, tabkey: k.TABKEY, master: `${k.MASTERTYPE ?? ''} ${k.MASTERNAME ?? ''}`.trim(), campos: k.campos ?? null, curinga: Boolean(k.curinga), existe: null, mandante: null, mandanteDiferente: false, outrasTrs: [], erro: k.erro ?? null };
      if (k.layout) {
        const clnt = k.layout.find((c) => c.tipo === 'CLNT');
        l.mandante = clnt ? k.campos[clnt.campo] : null;
        l.mandanteDiferente = Boolean(clnt && l.mandante && l.mandante !== String(cfg.client));
        try { const r = await lerLinhaDaChave(cfg, k); l.existe = r.existe; l.linhas = r.linhas.length; } catch (err) { l.erro = err.message.slice(0, 160); }
      }
      const c = condNome('TABKEY', k.TABKEY);
      const out = await readTable(cfg, 'E071K', { campos: ['TRKORR', 'TABKEY'], where: [`OBJNAME = '${aspas(k.tabela)}'`, `AND ${c.where}`], linhas: 200 }).catch(() => []);
      l.outrasTrs = [...new Set(out.filter((x) => x.TABKEY === k.TABKEY && !minhas.has(x.TRKORR)).map((x) => x.TRKORR))];
      l.veredito = l.existe === false ? (l.mandanteDiferente ? 'outro-mandante' : 'inexistente') : l.existe ? 'existe' : 'sem-medida';
      linhas.push(l);
    }
  }
  const contar = (xs) => xs.reduce((m, x) => ({ ...m, [x.veredito]: (m[x.veredito] ?? 0) + 1 }), {});
  const r = { numero, status: cab?.TRSTATUS ?? a.adt.status, liberada, referencia, fuso: fuso?.sap ?? null, entradas, chaves: linhas, resumo: { objetos: contar(entradas), chaves: contar(linhas) } };
  detalhe(`diff ${numero}: ${JSON.stringify(r.resumo)}`);
  return r;
}

// ---------- ciclo de vida da TR modificável (item 24 da fila — medido 2026-08-31, S4H 758) ----------
//
// CRIAR: POST na própria coleção com `tm:root tm:useraction="newrequest"` — o mesmo vocabulário do
// GET — e Content-Type text/plain (o que o Eclipse manda; foi o medido). Medido:
//   • 201 + o `tm:request` completo no corpo (`tm:number` = a ordem). Nasce SÓ a ordem, SEM tarefa —
//     a tarefa nasce sozinha no PRIMEIRO uso do número como `corrNr` (medido: o deploy de um pacote
//     transportável com corrNr criou a tarefa do usuário NA MINHA ordem e a entrada E071 caiu nela;
//     nenhuma TR paralela foi gerada — o corrNr é honrado).
//   • `tm:target` vazio ganha o default do sistema (TARSYSTEM 'VSS' no s4h).
//   • Corpo vazio → 400 "Elem.'{…tm}root' esperado", e NADA é criado (E070 conferida antes/depois).
//   • Só tipo 'K' (workbench) foi medido. O caminho da URL depois do número é uma "Benutzeraktion"
//     (POST …/<nr>/removeobject → SCTS_ADT_MSG 005 "não suportada"; POST …/<nr> sem ação e sem corpo
//     → 200 no-op, E070/E071 idênticas).
//
// APAGAR: DELETE na coleção remove ordem/tarefa MODIFICÁVEL e VAZIA (200, a linha some da E070).
// Com entradas travadas → 400 SCTS_ADT_MSG 009 "contém objetos bloqueados", e no 758 NÃO há
// useraction de remoção de entrada. O caminho medido para TR com entradas é driver classrun:
//   • TRINT_UNLOCK_COMM por tarefa (subrc 0) solta os locks das entradas SEM apagar a TR — é isso
//     que também destrava o TR_TADIR_INTERFACE: a linha TADIR DELFLAG='X' que o delete transportável
//     deixa só sai DEPOIS do unlock (antes, subrc 1; depois, subrc 0 — medido nas duas ordens).
//   • TR_DELETE_COMM com WI_DIALOG=' ' é o delete da SE09: apaga ordem + tarefas + entradas e solta
//     o que restou (subrc 0, msg SD 832; E070/E071 da ordem e da tarefa AUSENTES depois).
// A limpeza completa de um ciclo transportável (medida, docs/receita-change-request.md):
//   deleteObject com corrNr → destravarRequest → removerTadirOrfa (enho.mjs) das linhas DELFLAG='X'
//   → deleteObject do pacote com corrNr → desmancharRequest → removerTadirOrfa do DEVC.
//
// LIBERAR: desde o item 74 existe `liberarRequest` (via ADT, `newreleasejobs`) — com confirm
// obrigatório, só TR própria e modificável. Ver a seção "liberar" adiante.

const RE_TRKORR = /^[A-Z][A-Z0-9]{2}K[A-Z0-9]{6}$/;
const escXml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function assertTrkorr(numero) {
  const n = String(numero ?? '').toUpperCase().trim();
  if (!RE_TRKORR.test(n)) throw new Error(`GUARD-RAIL: "${numero}" não tem forma de TRKORR (<SID>K<6>) — o número entra em literal ABAP/URL e não vai adivinhado.`);
  return n;
}

/**
 * Body do create de TR — `tm:root useraction="newrequest"`. Puro. Só tipo 'K' foi medido.
 * `usuarios` vira `<tm:task tm:owner>` (fila 72): o handler do POST lê os owners e os passa como
 * `it_users` ao `TR_INSERT_REQUEST_WITH_TASKS` — a TR nasce COM as tarefas, sem driver. Medido
 * (S4H 758, 2026-09-02): owner duplicado deduplica (1 tarefa), owner inexistente é recusado pelo
 * servidor (400 com mensagem limpa), e `tm:attributes` no corpo é IGNORADO pelo create (o fonte de
 * CL_CTS_ADT_TM_RES_COLL_CONT só monta atributo a partir do cts_project) — atributo é com
 * `gravarAtributo`/driver.
 */
export function buildNovaRequestBody({ descricao, tipo = 'K', alvo = '', projeto = '', usuarios = [] } = {}) {
  const d = String(descricao ?? '').trim();
  if (!d) throw new Error('GUARD-RAIL: criarRequest exige `descricao` — TR sem texto vira lixo anônimo na SE09.');
  if (tipo !== 'K') throw new Error(`GUARD-RAIL: só tipo 'K' (ordem de workbench) foi medido (S4H 758, 2026-08-31); '${tipo}' exige POC antes.`);
  const tasks = usuarios.map((u) => `<tm:task tm:owner="${escXml(String(u).toUpperCase())}"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">'
    + `<tm:request tm:desc="${escXml(d)}" tm:type="${escXml(tipo)}" tm:target="${escXml(String(alvo).toUpperCase())}" tm:cts_project="${escXml(projeto)}"${tasks ? `>${tasks}</tm:request>` : '/>'}`
    + '</tm:root>';
}

/**
 * Cria uma ordem de workbench modificável. Devolve o `parseRequest` da resposta (201) — `numero`,
 * `descricao`, `alvo` (defaultado pelo sistema quando `alvo` vai vazio). Sessão stateless, como
 * toda leitura daqui. Sem `usuarios`, `tarefas: []` (a tarefa nasce no primeiro deploy com
 * `corrNr` = este número); com `usuarios`, a TR nasce com uma tarefa por usuário (fila 72) — mas a
 * RESPOSTA do POST não as traz (medido): `tarefas` vem vazio aqui, quem quiser vê-las lê depois
 * (`lerRequest`/`lerRequestPorRfc`). O dono da ordem é sempre o usuário logado — dono alheio,
 * atributo ou simulação é `criarRequestComTarefas`.
 */
export async function criarRequest(conexao, { descricao, tipo = 'K', alvo = '', projeto = '', usuarios = [], sessao } = {}) {
  const body = buildNovaRequestBody({ descricao, tipo, alvo, projeto, usuarios });
  passo(`cts: criar TR "${descricao}"${usuarios.length ? ` (${usuarios.length} tarefa(s) no POST)` : ''}`);
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, {
    method: 'POST', path: '/sap/bc/adt/cts/transportrequests',
    accept: ACCEPT_REQUEST, contentType: 'text/plain', body,
  });
  if (r.status !== 201) throw new Error(`cts: criar TR falhou (${r.status}): ${r.text.slice(0, 300)}`);
  const req = parseRequest(r.text);
  if (!req?.numero) throw new Error(`cts: 201 sem tm:number na resposta: ${r.text.slice(0, 300)}`);
  detalhe(`TR criada: ${req.numero} (alvo ${req.alvo || '(default)'})`);
  return req;
}

/**
 * Apaga uma ordem/tarefa modificável e VAZIA pelo DELETE da coleção (medido: 200 e a linha some da
 * E070). Com entradas travadas o SAP recusa (400 SCTS_ADT_MSG 009) — para essa, `desmancharRequest`.
 */
export async function deletarRequest(conexao, numero, { confirm = false, sessao } = {}) {
  const n = assertTrkorr(numero);
  if (confirm !== true) throw new Error(`GUARD-RAIL: deletarRequest exige confirm:true (remoção de ${n} é irreversível).`);
  passo(`cts: deletar TR ${n}`);
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, { method: 'DELETE', path: `/sap/bc/adt/cts/transportrequests/${n}`, accept: 'application/*' });
  if (r.status >= 400) {
    const msg = (r.text.match(/<message lang="EN">([^<]*)/) || [])[1] || r.text.slice(0, 200);
    const dica = /bloqueado|locked/i.test(msg) ? ' (TR com entradas travadas: usar desmancharRequest — o DELETE só remove TR vazia, medido)' : '';
    throw new Error(`cts: DELETE ${n} falhou (${r.status}): ${msg}${dica}`);
  }
  const resta = await readTable(conexao.cfg, 'E070', { campos: ['TRKORR'], where: [`TRKORR = '${n}'`], linhas: 1 }).catch(() => null);
  return { deleted: true, status: r.status, confirmadoAusente: resta ? resta.length === 0 : null };
}

// O miolo ABAP dos drivers de CTS. O unlock roda nas TAREFAS e na PRÓPRIA ordem — medido no item
// 77: o lock do `lockobject` (TLOCK) numa ordem SEM tarefa só sai pelo unlock NA ordem; só por
// tarefa, a TLOCK fica presa e o TR_DELETE_COMM recusa (a B da POC ficou 'D' com a TLOCK cheia).
// O unlock na ordem limpa a TLOCK inteira, inclusive lock de objeto SEM entrada na E071.
const abapUnlock = (numero) => `    DATA: ls_e070 TYPE e070, ls_e070c TYPE e070c.
    SELECT trkorr FROM e070 WHERE strkorr = '${numero}' INTO TABLE @DATA(lt_tarefas).
    APPEND VALUE #( trkorr = '${numero}' ) TO lt_tarefas.
    LOOP AT lt_tarefas INTO DATA(lv_t).
      CALL FUNCTION 'TRINT_UNLOCK_COMM' EXPORTING wi_trkorr = lv_t-trkorr
        IMPORTING we_e070 = ls_e070 we_e070c = ls_e070c
        EXCEPTIONS OTHERS = 9.
      out->write( |UNLOCK { lv_t-trkorr } subrc={ sy-subrc }| ).
    ENDLOOP.`;

const cabecaDriver = (n) => `CLASS ${String(n).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(n).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.`;
const caudaDriver = `    COMMIT WORK AND WAIT.
  ENDMETHOD.
ENDCLASS.`;

/** Fonte do driver que SÓ solta os locks das tarefas (TRINT_UNLOCK_COMM), mantendo a TR. Puro. */
export function buildDestravarSource(nomeClasse, numero) {
  const n = assertTrkorr(numero);
  return `${cabecaDriver(nomeClasse)}\n${abapUnlock(n)}\n${caudaDriver}`;
}

/** Fonte do driver que desmancha a ordem: unlock das tarefas + TR_DELETE_COMM (o delete da SE09). Puro. */
export function buildDesmancharSource(nomeClasse, numero) {
  const n = assertTrkorr(numero);
  return `${cabecaDriver(nomeClasse)}
${abapUnlock(n)}
    DATA lt_del TYPE cts_trkorrs.
    CALL FUNCTION 'TR_DELETE_COMM'
      EXPORTING wi_dialog = ' ' wi_trkorr = '${n}'
      IMPORTING et_deleted_tasks = lt_del
      EXCEPTIONS order_contains_locked_entries = 1 order_already_released = 2 user_not_owner = 3
                 objects_free_but_still_locks = 4 order_lock_failed = 5 tr_enqueue_failed = 6 OTHERS = 9.
    out->write( |TR_DELETE subrc={ sy-subrc } { sy-msgid } { sy-msgno } { sy-msgv1 } tarefas={ lines( lt_del ) }| ).
${caudaDriver}`;
}

/** Saída dos drivers de CTS. Puro. */
export function parseSaidaCts(saida) {
  const s = String(saida ?? '');
  return {
    unlocks: [...s.matchAll(/UNLOCK (\S+) subrc=(\d+)/g)].map((m) => ({ tarefa: m[1], subrc: Number(m[2]) })),
    trDelete: ((m) => (m ? { subrc: Number(m[1]), msg: m[2].trim(), tarefas: Number(m[3]) } : null))(s.match(/TR_DELETE subrc=(\d+) (.*?) tarefas=(\d+)/)),
  };
}

// A TR alvo dos drivers tem de ser MINHA, MODIFICÁVEL e ORDEM (não tarefa) — os FMs recusariam no
// servidor (USER_NOT_OWNER etc.), mas a recusa daqui vem ANTES de a rede criar o driver.
async function assertMinhaOrdem(cfg, n, quem) {
  const [cab] = await readTable(cfg, 'E070', { campos: ['TRKORR', 'TRSTATUS', 'STRKORR', 'AS4USER'], where: [`TRKORR = '${n}'`], linhas: 1 });
  if (!cab) throw new Error(`${quem}: ${n} não existe na E070 deste sistema.`);
  if (cab.TRSTATUS !== 'D') throw new Error(`${quem}: ${n} não é modificável (TRSTATUS='${cab.TRSTATUS}') — TR liberada não se desfaz.`);
  if (cab.STRKORR) throw new Error(`${quem}: ${n} é TAREFA da ordem ${cab.STRKORR} — o alvo é a ordem.`);
  const eu = String(cfg.user ?? '').toUpperCase();
  if (cab.AS4USER !== eu) throw new Error(`${quem}: ${n} é de ${cab.AS4USER}, não de ${eu} — TR alheia não se mexe.`);
}

async function rodarDriverCts(conexao, numero, { fonte, descricao, keepDriver = false }) {
  const driver = `Y_CTSD_${numero}`.slice(0, 30);
  let r;
  try { r = await deployAndRun(conexao, { name: driver, pkg: '$TMP', description: descricao, source: fonte(driver, numero) }); }
  finally { if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {}); }
  return { ...parseSaidaCts(r.saida), saida: r.saida, okDriver: r.ok };
}

/**
 * Solta os locks das entradas (TRINT_UNLOCK_COMM por tarefa), MANTENDO a TR — é o que permite o
 * `removerTadirOrfa` das linhas TADIR DELFLAG='X' e o deploy seguinte com o mesmo corrNr.
 */
export async function destravarRequest(conexao, numero, { confirm = false, keepDriver = false } = {}) {
  const n = assertTrkorr(numero);
  if (confirm !== true) throw new Error(`GUARD-RAIL: destravarRequest exige confirm:true (soltar os locks de ${n} libera os objetos para outras ordens).`);
  await assertMinhaOrdem(conexao.cfg, n, 'destravarRequest');
  passo(`cts: destravar ${n}`);
  const r = await rodarDriverCts(conexao, n, { fonte: buildDestravarSource, descricao: `driver: unlock das tarefas de ${n}`, keepDriver });
  return { ok: r.okDriver && r.unlocks.every((u) => u.subrc === 0), ...r };
}

/**
 * Desmancha a ordem modificável INTEIRA — unlock das tarefas + TR_DELETE_COMM (ordem, tarefas e
 * entradas somem; medido: E070/E071 ausentes depois). Não toca TADIR: linha DELFLAG='X' de objeto
 * apagado sai por `removerTadirOrfa` (enho.mjs) DEPOIS daqui.
 */
export async function desmancharRequest(conexao, numero, { confirm = false, keepDriver = false } = {}) {
  const n = assertTrkorr(numero);
  if (confirm !== true) throw new Error(`GUARD-RAIL: desmancharRequest exige confirm:true (apaga ${n} com tarefas e entradas, irreversível).`);
  await assertMinhaOrdem(conexao.cfg, n, 'desmancharRequest');
  passo(`cts: desmanchar ${n}`);
  const r = await rodarDriverCts(conexao, n, { fonte: buildDesmancharSource, descricao: `driver: TR_DELETE_COMM de ${n}`, keepDriver });
  const resta = await readTable(conexao.cfg, 'E070', { campos: ['TRKORR'], where: [`TRKORR = '${n}'`], linhas: 1 }).catch(() => null);
  const ok = r.trDelete?.subrc === 0 && (resta ? resta.length === 0 : true);
  detalhe(`desmanchar ${n}: subrc=${r.trDelete?.subrc ?? '?'} E070=${resta?.length === 0 ? 'ausente' : 'AINDA EXISTE'}`);
  return { ok, confirmadoAusente: resta ? resta.length === 0 : null, ...r };
}

// ---------- liberar (item 74 da fila — medido 2026-09-02, S4H 758, mandante 250) ----------
//
// `POST /sap/bc/adt/cts/transportrequests/<nr>/newreleasejobs` — SEM corpo. É a ação do Eclipse
// (CL_CTS_ADT_TM_REST_RES_CONT->post → do_release → if_cts_rest_api->release, lido no fonte);
// `releasejobs` (sem "new") é o caminho LEGADO e NÃO libera — devolve 200 com a URI da tela do
// SAP GUI (`/sap/bc/adt/vit/tm/releasejobs/…`) e a E070 não muda (medido).
//
// ⚠ HTTP 200 NÃO é sucesso — TODA resposta é 200 (sucesso, TR inexistente, já liberada, tarefa
//   vazia). O veredito vem no `<chkrun:checkReport>`: status `released` × `abortrel…`, com as
//   mensagens tipo E dentro (`TR 768` já liberada, `TK 494` tarefa não classificada, "não existe").
// ⚠ E até o `released` do corpo MENTE na simulação: `?release_simulation=X` responde `released`
//   com timestamp preenchido e NÃO libera (E070 segue 'D') — o assert é a E070, nunca o corpo.
// ⚠ `?release_simulation=true` NÃO simula: o handler lê o valor num abap_bool e só 'X' é
//   verdadeiro; com 'true' a TR foi LIBERADA de verdade (medido — custou uma TR permanente).
// ⚠ O servidor NÃO recusou dono alheio: a ordem de OUTRO usuário foi liberada sem erro nenhum
//   (perfil largo do laboratório). O guard-rail de dono é DAQUI, não do SAP.
// ⚠ A liberação é ASSÍNCRONA — o statusText do sucesso diz "foi INICIADA": a E070 passa por 'O'
//   (export rodando) antes de 'R'. Por isso o poll na E070 (`esperar`).
// ⚠ Tarefa VAZIA não se libera sozinha (TK 494 "não classificada") — mas a ordem com tarefa vazia
//   libera E APAGA a tarefa vazia (paridade com a SE09). Tarefa COM objeto libera sozinha; a
//   liberação da ORDEM consolida as entradas na E071 dela + grava a marca CORR RELE (lock '3').
// ⚠ IRREVERSÍVEL de verdade: TR liberada não se apaga por NENHUMA via da lib
//   (CTS_WBO_DELETE_REQUEST → INVALID_REQUEST "already released"). Toda liberação é permanente.
// ⚠ INTERRUPÇÃO RETOMÁVEL (item 77): objeto travado noutra TR não aborta — o chkrun responde
//   status `relwithignlock` com a PERGUNTA no statusText e o user_action a reenviar
//   (releasetimestamp + releaseobjlock='yes'); a E070 fica 'D' (nada liberado). O retorno traz
//   `retomar` preenchido — reenviar em `retomarLiberacao` libera ignorando os locks (e o lock da
//   outra TR sobrevive intacto, medido).

// As ações de retomada do release (item 77): o servidor interrompe respondendo o chkrun com uma
// DESTAS como status ("posso continuar?"), e o POST na ação retoma. `relObjigchkatc` é camelCase
// NA URL (medido: minúsculo → 400 "não suportada"); `relobjchkobs` como STATUS significa
// "verificações obsoletas — recomece do newreleasejobs" (e como ação roda um release comum).
const ACOES_RESUME = ['relwithignlock', 'relObjigchkatc', 'relobjchkobs', 'relwithignwarning'];

/** Resposta do POST de release — o veredito mora no chkrun, não no HTTP. Puro. */
export function parseRelease(xml) {
  const s = String(xml ?? '');
  const relatorios = [...s.matchAll(/<chkrun:checkReport\s([^>]*?)(?:\/>|>([\s\S]*?)<\/chkrun:checkReport>)/g)]
    .map(([, a, corpo = '']) => ({
      status: attr(a, 'chkrun:status'),
      statusTexto: desescapar(attr(a, 'chkrun:statusText')),
      mensagens: [...corpo.matchAll(/<chkrun:checkMessage\s([^>]*?)\/?>/g)]
        .map(([, m]) => ({ tipo: attr(m, 'chkrun:type'), texto: desescapar(attr(m, 'chkrun:shortText')) })),
    }));
  const timestamp = attr(s, 'tm:releasetimestamp').trim();   // '0' quando não liberou
  const releaseObjLock = attr(s, 'tm:releaseobjlock');
  const interrompido = relatorios.find((r) => ACOES_RESUME.includes(r.status));
  return {
    numero: attr(s, 'tm:number'),
    acao: attr(s, 'tm:useraction'),
    timestamp,
    releaseObjLock,                                          // 'yes' na interrupção por lock
    relatorios,
    liberado: relatorios.some((r) => r.status === 'released'),
    // A interrupção retomável (medida no item 77): o status do chkrun nomeia a AÇÃO do resume, e o
    // tm:root da resposta traz o user_action a reenviar (releasetimestamp + releaseobjlock).
    retomar: interrompido
      ? { acao: interrompido.status, releasetimestamp: timestamp, releaseobjlock: releaseObjLock, pergunta: interrompido.statusTexto }
      : null,
    erros: relatorios.flatMap((r) => r.mensagens.filter((m) => m.tipo === 'E').map((m) => m.texto)),
  };
}

// Ordem OU tarefa: as duas se liberam. O alvo tem de existir, ser modificável e MEU — o SAP não
// recusa dono alheio (medido: liberou), então a recusa é daqui, antes da rede.
async function assertMinhaModificavel(cfg, n, quem) {
  const [cab] = await readTable(cfg, 'E070', { campos: ['TRKORR', 'TRSTATUS', 'STRKORR', 'AS4USER'], where: [`TRKORR = '${n}'`], linhas: 1 });
  if (!cab) throw new Error(`${quem}: ${n} não existe na E070 deste sistema.`);
  if (cab.TRSTATUS !== 'D') throw new Error(`${quem}: ${n} não é modificável (TRSTATUS='${cab.TRSTATUS}') — já liberada ou em liberação.`);
  const eu = String(cfg.user ?? '').toUpperCase();
  if (cab.AS4USER !== eu) throw new Error(`${quem}: ${n} é de ${cab.AS4USER}, não de ${eu} — o SAP NÃO recusa liberar TR alheia (medido), por isso a recusa é daqui.`);
  return cab;
}

/**
 * Libera uma ordem ou tarefa modificável — o último verbo do ciclo da TR (`newreleasejobs`, a
 * mesma ação do Eclipse). IRREVERSÍVEL: TR liberada não se edita nem se apaga por via nenhuma.
 *
 * `simular: true` roda `?release_simulation=X` — o SAP valida e responde como se tivesse liberado
 * (o corpo diz `released` MESMO na simulação, medido), mas a E070 fica 'D'; o retorno confere isso
 * (`statusFinal`). `esperar` (default) faz o poll na E070 até 'R'/'N' — a liberação é assíncrona e
 * passa por 'O' enquanto o export roda.
 *
 * Devolve { ok, simulado, numero, timestamp, statusFinal, relatorios, erros }: `ok` = o chkrun
 * disse `released` E a E070 confirmou ('R'/'N' no real; 'D' intacta na simulação).
 */
export async function liberarRequest(conexao, numero, { confirm = false, simular = false, esperar = true, timeoutMs = 60000, sessao } = {}) {
  const n = assertTrkorr(numero);
  if (!simular && confirm !== true) {
    throw new Error(`GUARD-RAIL: liberarRequest exige confirm:true — liberar ${n} é PERMANENTE (TR liberada não se edita nem se apaga; medido: CTS_WBO_DELETE_REQUEST recusa com INVALID_REQUEST). Para o dry-run do servidor, simular:true.`);
  }
  await assertMinhaModificavel(conexao.cfg, n, 'liberarRequest');
  passo(`cts: liberar ${n}${simular ? ' (SIMULAÇÃO)' : ''}`);
  return postRelease(conexao, n, 'newreleasejobs', { simular, esperar, timeoutMs, sessao });
}

// O miolo comum do release e da retomada: POST na ação, parse do chkrun, poll na E070. A resposta
// pode ser sucesso, aborto OU uma INTERRUPÇÃO retomável (`retomar` preenchido) — quem chama decide.
async function postRelease(conexao, n, acao, { body, simular = false, esperar = true, timeoutMs = 60000, sessao } = {}) {
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, {
    method: 'POST',
    path: `/sap/bc/adt/cts/transportrequests/${n}/${acao}${simular ? '?release_simulation=X' : ''}`,
    accept: 'application/*', ...(body ? { contentType: 'text/plain', body } : {}),
  });
  if (r.status >= 400) throw new Error(`cts: ${acao} de ${n} falhou (${r.status}): ${mensagemDeAcao(r.text)}`);
  const parsed = parseRelease(r.text);

  const statusDe = async () => {
    const [l] = await readTable(conexao.cfg, 'E070', { campos: ['TRSTATUS'], where: [`TRKORR = '${n}'`], linhas: 1 });
    return l?.TRSTATUS ?? 'AUSENTE';
  };
  let statusFinal = await statusDe();
  if (!simular && parsed.liberado && esperar) {
    const fim = Date.now() + timeoutMs;
    while (statusFinal === 'D' || statusFinal === 'O') {
      if (Date.now() > fim) break;
      await new Promise((x) => setTimeout(x, 3000));
      statusFinal = await statusDe();
    }
  }
  const ok = parsed.liberado && (simular ? statusFinal === 'D' : (statusFinal === 'R' || statusFinal === 'N'));
  detalhe(`${acao} ${n}: chkrun=${parsed.relatorios[0]?.status ?? '?'} E070=${statusFinal}${parsed.retomar ? ` · retomável: ${parsed.retomar.acao}` : ''}${parsed.erros.length ? ` · ${parsed.erros[0]}` : ''}`);
  return { ok, simulado: simular, numero: n, timestamp: parsed.timestamp, statusFinal, retomar: parsed.retomar, relatorios: parsed.relatorios, erros: parsed.erros };
}

/** Corpo tm:root de uma retomada de release — o user_action da resposta anterior, reenviado. Puro. */
export function buildResumeBody(acao, numero, { releasetimestamp = '', releaseobjlock = '' } = {}) {
  const ts = String(releasetimestamp).trim();
  return `<?xml version="1.0" encoding="UTF-8"?><tm:root ${TM_NS} tm:useraction="${escXml(acao)}" tm:number="${escXml(String(numero).toUpperCase())}"` +
    (releaseobjlock ? ` tm:releaseobjlock="${escXml(releaseobjlock)}"` : '') +
    (ts && ts !== '0' ? ` tm:releasetimestamp="${escXml(ts)}"` : '') + '/>';
}

/**
 * RETOMA um release interrompido (`relwithignlock` · `relObjigchkatc` · `relwithignwarning` —
 * o "continuar mesmo assim" do Eclipse). O fluxo medido (item 77): `liberarRequest` devolve
 * `retomar` preenchido quando o servidor pergunta; reenviar aqui esse mesmo objeto retoma e
 * LIBERA (permanente — confirm obrigatório; `simular: true` roda o dry-run do servidor, que
 * também vale para retomadas).
 *
 * ⚠ `relObjigchkatc` é camelCase NA URL (minúsculo → 400 "não suportada", medido) e exige o
 *   `releasetimestamp` devolvido na interrupção — sem ele o servidor responde status
 *   `relobjchkobs` ("verificações obsoletas") mandando recomeçar do `liberarRequest`.
 * ⚠ O lock ignorado NÃO é roubado nem limpo: a TLOCK da outra TR sobrevive intacta (medido).
 */
export async function retomarLiberacao(conexao, numero, { acao, releasetimestamp = '', releaseobjlock = '', confirm = false, simular = false, esperar = true, timeoutMs = 60000, sessao } = {}) {
  const n = assertTrkorr(numero);
  if (!ACOES_RESUME.includes(acao)) {
    throw new Error(`GUARD-RAIL: retomarLiberacao: ação "${acao}" não é retomada de release (válidas: ${ACOES_RESUME.join(', ')} — a CAIXA importa: relObjigchkatc é camelCase, medido: minúsculo → 400).`);
  }
  if (!simular && confirm !== true) {
    throw new Error(`GUARD-RAIL: retomarLiberacao exige confirm:true — a retomada LIBERA ${n} de verdade (permanente). Para o dry-run do servidor, simular:true.`);
  }
  await assertMinhaModificavel(conexao.cfg, n, 'retomarLiberacao');
  passo(`cts: retomar release de ${n} (${acao})${simular ? ' (SIMULAÇÃO)' : ''}`);
  return postRelease(conexao, n, acao, { body: buildResumeBody(acao, n, { releasetimestamp, releaseobjlock }), simular, esperar, timeoutMs, sessao });
}

// ---------- as demais useractions do dispatcher (item 76 — medido 2026-09-02, S4H 758, 250) ----------
//
// O MESMO `CL_CTS_ADT_TM_REST_RES_CONT->post` do release roteia pelo segmento da URL. Os nomes
// REAIS vêm de IF_CTS_ADT_TM_CONSTANTS — e três diferiam do que o fonte do switch sugeria (a
// hipótese da I95 errou os nomes; medido com 400 "Benutzeraktion … nicht unterstützt" no chute):
//
//   tasks              POST <ordem>/tasks         corpo tm:root @tm:targetuser  → tarefa nova
//   moveobjects        POST <origem>/moveobjects  corpo tm:root @tm:number=destino + <tm:request>
//                                                 com <tm:abap_object> por entrada
//   reassign  (≠"reassigntask")  POST <tarefa>/reassign   corpo tm:root @tm:number=nova ordem
//   merge     (≠"mergerequests") POST <origem>/merge      corpo tm:root @tm:number=destino
//   sortandcompress    POST <nr>/sortandcompress  SEM corpo
//   consistencychecks  POST <nr>/consistencychecks SEM corpo → chkl:messages (o check da SE01)
//   changeowner        PUT  <nr>/changeowner?targetuser=U  SEM corpo (PUT sem o segmento → 400
//                                                 "Elem.'{…tm}root' esperado" — não é a via)
//
// O contrato do corpo é a ST_CTS_ADT_TM_MAIN: user_action.user → @tm:targetuser, user_action.number
// → @tm:number, objetos → <tm:abap_object tm:pgmid/tm:type/tm:name> filhos de <tm:request>.
//
// MEDIDO (cada linha custou uma rodada, contrafactuais incluídos):
//   • `tasks` cria tarefa também para OUTRO usuário, e o MESMO usuário pode ter N tarefas na mesma
//     ordem (3 criadas, zero dedup — ao contrário do create, que deduplica owners). Usuário
//     inexistente: 400 limpo, nada gravado. TR inexistente: 400.
//   • `moveobjects` move a entrada E071 ORDEM→ORDEM (saiu de A, entrou em B, outra LUW). O servidor
//     recusa ordem→TAREFA — da própria ordem ou de outra — com "O objeto só pode ser deslocado em
//     uma ordem do mesmo tipo" (400); objeto que NÃO está na origem idem (400, nada muda).
//     Tarefa→tarefa e tarefa→ordem não foram medidos.
//   • `reassign` muda o STRKORR da TAREFA (a tarefa muda de mãe, com as entradas dela); numa ORDEM
//     responde 400 "Entrar uma tarefa".
//   • `merge` FUNDE: entradas e tarefas da origem passam ao destino e A ORIGEM SOME da E070 —
//     irreversível na prática; fica uma entrada-marca na E071 do destino (número+data+hora+usuário
//     no OBJ_NAME, como o CORR RELE da liberação).
//   • `changeowner` troca o AS4USER — e o servidor NÃO recusa TR de OUTRO dono (trocou nos dois
//     sentidos, perfil largo do laboratório): o guard de dono é DAQUI, como no liberar.
//   • `consistencychecks` devolve chkl:messages de verdade (flagrou objeto travado noutra TR).
//   • (item 77) `lockobject` trava as entradas — e o lock mora na TLOCK (LOKEY por objeto), NÃO no
//     E071.LOCKFLAG (que ficou vazio na medição); o servidor trava até objeto SEM entrada na E071
//     (lock "fantasma" que bloqueia o delete do objeto com 409 — por isso o guard daqui exige a
//     entrada). Já travado noutra TR: 400 limpo. Corpo sem objetos: 200 no-op.
//   • (item 77) `preparerelease` é o gancho do code review do gCTS (if_cts_rest_api->prepare_release
//     → pull_request_url): sem gCTS responde 200 com request_data SEM <tm:review> — não é erro.
//   • (item 77) os resumes de release (relwithignlock · relObjigchkatc · relobjchkobs ·
//     relwithignwarning) estão em `retomarLiberacao` — ver os comentários lá e no parseRelease.

const TM_NS = 'xmlns:tm="http://www.sap.com/cts/adt/tm"';

/**
 * Corpo tm:root de uma useraction — o contrato da ST_CTS_ADT_TM_MAIN. Puro.
 * `usuario` vira @tm:targetuser, `numero` vira @tm:number, `objetos` viram <tm:abap_object>.
 */
export function buildAcaoBody(acao, { usuario, numero, objetos } = {}) {
  const attrs = [`tm:useraction="${escXml(acao)}"`];
  if (usuario) attrs.push(`tm:targetuser="${escXml(String(usuario).toUpperCase())}"`);
  if (numero) attrs.push(`tm:number="${escXml(String(numero).toUpperCase())}"`);
  const objs = (objetos ?? []).map((o) =>
    `<tm:abap_object tm:pgmid="${escXml(String(o.pgmid ?? 'R3TR').toUpperCase())}" tm:type="${escXml(String(o.tipo).toUpperCase())}" tm:name="${escXml(String(o.nome).toUpperCase())}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><tm:root ${TM_NS} ${attrs.join(' ')}${objs ? `><tm:request>${objs}</tm:request></tm:root>` : '/>'}`;
}

/** Mensagem legível de um erro do dispatcher (exc:exception) — ou o começo do corpo cru. Puro. */
export function mensagemDeAcao(xml) {
  const m = String(xml ?? '').match(/<message[^>]*>([\s\S]*?)<\/message>/);
  return desescapar((m?.[1] ?? String(xml ?? '').slice(0, 200)).replace(/\s+/g, ' ').trim());
}

/** As mensagens do chkl:messages do consistencychecks. Puro. */
export function parseChecklist(xml) {
  return [...String(xml ?? '').matchAll(/<msg\s([^>]*)>([\s\S]*?)<\/msg>/g)].map(([, a, corpo]) => ({
    tipo: attr(a, 'type'),
    objeto: desescapar(attr(a, 'objDescr')).trim(),
    texto: desescapar((corpo.match(/<txt>([\s\S]*?)<\/txt>/) || [, ''])[1]).trim(),
  }));
}

async function postAcao(conexao, numero, acao, { body, sessao } = {}) {
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, {
    method: 'POST', path: `/sap/bc/adt/cts/transportrequests/${numero}/${acao}`,
    accept: 'application/*', ...(body ? { contentType: 'text/plain', body } : {}),
  });
  if (r.status >= 400) throw new Error(`cts: ${acao} em ${numero} falhou (${r.status}): ${mensagemDeAcao(r.text)}`);
  return r;
}

/**
 * Cria uma tarefa AVULSA numa ordem modificável existente (`tasks` — o "criar tarefa" da SE09).
 * `usuario` default: o logado; outro usuário vale (medido), inexistente o servidor recusa limpo.
 * O mesmo usuário pode ter N tarefas na mesma ordem (medido: zero dedup — diferente do create).
 * Devolve { ok, ordem, tarefa, dono } com a tarefa conferida na E070 em outra LUW.
 */
export async function criarTarefa(conexao, ordem, { usuario, sessao } = {}) {
  const n = assertTrkorr(ordem);
  const dono = String(usuario ?? conexao.cfg.user).toUpperCase();
  const cab = await assertMinhaModificavel(conexao.cfg, n, 'criarTarefa');
  if (cab.STRKORR) throw new Error(`criarTarefa: ${n} é TAREFA (da ordem ${cab.STRKORR}) — tarefa se cria na ORDEM.`);
  passo(`cts: criar tarefa de ${dono} em ${n}`);
  const r = await postAcao(conexao, n, 'tasks', { body: buildAcaoBody('tasks', { usuario: dono }), sessao });
  const tarefa = (r.text.match(/tm:number="([^"]*)"/) || [])[1] || '';
  const [e] = tarefa ? await readTable(conexao.cfg, 'E070', { campos: ['TRKORR', 'STRKORR', 'AS4USER'], where: [`TRKORR = '${tarefa}'`], linhas: 1 }) : [];
  const ok = Boolean(e && e.STRKORR === n && e.AS4USER === dono);
  detalhe(`criarTarefa ${n}: tarefa=${tarefa || '?'} E070=${ok ? 'confirmada' : 'NÃO confirmada'}`);
  return { ok, ordem: n, tarefa, dono };
}

/**
 * Move entradas E071 de uma ordem para OUTRA ordem (`moveobjects` — o "mover" da SE01), sem tocar
 * os objetos. Só ORDEM→ORDEM foi medido e é o que o guard permite: o servidor recusa ordem→tarefa
 * ("mesmo tipo", 400) e objeto ausente da origem (400, nada muda). As duas ordens têm de ser MINHAS
 * e modificáveis. Devolve { ok, movidos, aindaNaOrigem } conferidos na E071 em outra LUW.
 */
export async function moverObjetos(conexao, origem, destino, objetos = [], { sessao } = {}) {
  const de = assertTrkorr(origem);
  const para = assertTrkorr(destino);
  if (de === para) throw new Error('GUARD-RAIL: moverObjetos: origem e destino são a mesma TR.');
  const lista = (Array.isArray(objetos) ? objetos : [objetos]).map((o, i) => {
    const tipo = String(o?.tipo ?? '').toUpperCase().trim();
    const nome = String(o?.nome ?? '').toUpperCase().trim();
    if (!tipo || !nome) throw new Error(`GUARD-RAIL: moverObjetos: objetos[${i}] precisa de { tipo, nome } (pgmid default R3TR).`);
    return { pgmid: String(o?.pgmid ?? 'R3TR').toUpperCase().trim(), tipo, nome };
  });
  if (!lista.length) throw new Error('GUARD-RAIL: moverObjetos: a lista de objetos está vazia.');
  for (const [nr, quem] of [[de, 'origem'], [para, 'destino']]) {
    const cab = await assertMinhaModificavel(conexao.cfg, nr, `moverObjetos (${quem})`);
    if (cab.STRKORR) throw new Error(`moverObjetos: ${nr} (${quem}) é TAREFA — só ordem→ordem foi medido (o servidor recusa tarefa: "mesmo tipo").`);
  }
  passo(`cts: mover ${lista.length} objeto(s) de ${de} para ${para}`);
  await postAcao(conexao, de, 'moveobjects', { body: buildAcaoBody('moveobjects', { numero: para, objetos: lista }), sessao });
  const e071Para = await readTable(conexao.cfg, 'E071', { campos: ['PGMID', 'OBJECT', 'OBJ_NAME'], where: [`TRKORR = '${para}'`], linhas: 999 });
  const e071De = await readTable(conexao.cfg, 'E071', { campos: ['PGMID', 'OBJECT', 'OBJ_NAME'], where: [`TRKORR = '${de}'`], linhas: 999 });
  const em = (tab, o) => tab.some((l) => l.PGMID === o.pgmid && l.OBJECT === o.tipo && l.OBJ_NAME === o.nome);
  const movidos = lista.filter((o) => em(e071Para, o) && !em(e071De, o));
  const aindaNaOrigem = lista.filter((o) => em(e071De, o));
  detalhe(`moverObjetos ${de}→${para}: ${movidos.length}/${lista.length} confirmado(s)`);
  return { ok: movidos.length === lista.length, origem: de, destino: para, movidos, aindaNaOrigem };
}

/**
 * Muda uma TAREFA de ordem (`reassign` — o STRKORR muda, as entradas viajam com ela). O nome real
 * da ação é `reassign`; "reassigntask" (o nome do método ABAP) responde 400 "não suportada" —
 * medido. A tarefa tem de ser tarefa (ordem → 400 "Entrar uma tarefa"), e a mãe atual e a nova
 * ordem têm de ser MINHAS e modificáveis. Devolve { ok, tarefa, de, para } (E070 em outra LUW).
 */
export async function reatribuirTarefa(conexao, tarefa, novaOrdem, { sessao } = {}) {
  const t = assertTrkorr(tarefa);
  const para = assertTrkorr(novaOrdem);
  const [cabT] = await readTable(conexao.cfg, 'E070', { campos: ['TRKORR', 'TRSTATUS', 'STRKORR'], where: [`TRKORR = '${t}'`], linhas: 1 });
  if (!cabT) throw new Error(`reatribuirTarefa: ${t} não existe na E070 deste sistema.`);
  if (!cabT.STRKORR) throw new Error(`reatribuirTarefa: ${t} é ORDEM — o reassign é de TAREFA (o servidor responde "Entrar uma tarefa").`);
  if (cabT.TRSTATUS !== 'D') throw new Error(`reatribuirTarefa: ${t} não é modificável (TRSTATUS='${cabT.TRSTATUS}').`);
  const de = cabT.STRKORR;
  await assertMinhaModificavel(conexao.cfg, de, 'reatribuirTarefa (ordem atual)');
  const cabPara = await assertMinhaModificavel(conexao.cfg, para, 'reatribuirTarefa (nova ordem)');
  if (cabPara.STRKORR) throw new Error(`reatribuirTarefa: ${para} é TAREFA — o destino é uma ORDEM.`);
  passo(`cts: reatribuir tarefa ${t} de ${de} para ${para}`);
  await postAcao(conexao, t, 'reassign', { body: buildAcaoBody('reassign', { numero: para }), sessao });
  const [depois] = await readTable(conexao.cfg, 'E070', { campos: ['STRKORR'], where: [`TRKORR = '${t}'`], linhas: 1 });
  const ok = depois?.STRKORR === para;
  detalhe(`reatribuirTarefa ${t}: STRKORR=${depois?.STRKORR ?? '?'} (${ok ? 'confirmado' : 'NÃO mudou'})`);
  return { ok, tarefa: t, de, para };
}

/**
 * Troca o DONO de uma ordem/tarefa modificável (`PUT <nr>/changeowner?targetuser=` — SEM corpo;
 * o PUT sem o segmento `/changeowner` dá 400 "Elem.'{…tm}root' esperado" e NÃO é a via, medido).
 * ⚠ O servidor NÃO recusa trocar o dono de TR ALHEIA (medido nos dois sentidos) — o guard de dono
 * é daqui. `confirm` obrigatório: dono trocado, a TR sai do meu controle (a lib recusa mexer em TR
 * de outro). O usuário-alvo é conferido na USR02 antes da rede. Devolve { ok, numero, dono }.
 */
export async function trocarDonoRequest(conexao, numero, usuario, { confirm = false, sessao } = {}) {
  const n = assertTrkorr(numero);
  const dono = String(usuario ?? '').toUpperCase().trim();
  if (!dono) throw new Error('GUARD-RAIL: trocarDonoRequest exige `usuario` (o novo dono).');
  if (confirm !== true) throw new Error(`GUARD-RAIL: trocarDonoRequest exige confirm:true — com outro dono, ${n} sai do alcance da lib (toda escrita daqui recusa TR alheia).`);
  await assertMinhaModificavel(conexao.cfg, n, 'trocarDonoRequest');
  const [u] = await readTable(conexao.cfg, 'USR02', { campos: ['BNAME'], where: [`BNAME = '${dono}'`], linhas: 1 });
  if (!u) throw new Error(`trocarDonoRequest: usuário ${dono} não existe na USR02 deste sistema.`);
  passo(`cts: trocar dono de ${n} para ${dono}`);
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, { method: 'PUT', path: `/sap/bc/adt/cts/transportrequests/${n}/changeowner?targetuser=${dono}`, accept: 'application/*' });
  if (r.status >= 400) throw new Error(`cts: changeowner de ${n} falhou (${r.status}): ${mensagemDeAcao(r.text)}`);
  const [depois] = await readTable(conexao.cfg, 'E070', { campos: ['AS4USER'], where: [`TRKORR = '${n}'`], linhas: 1 });
  const ok = depois?.AS4USER === dono;
  detalhe(`trocarDonoRequest ${n}: AS4USER=${depois?.AS4USER ?? '?'} (${ok ? 'confirmado' : 'NÃO mudou'})`);
  return { ok, numero: n, dono };
}

/**
 * FUNDE duas ordens (`merge`): entradas e tarefas da origem passam ao destino e A ORIGEM SOME da
 * E070 (medido) — irreversível na prática, daí confirm obrigatório. Fica uma entrada-marca na E071
 * do destino (número+data+hora+usuário, como o CORR RELE). As duas MINHAS, modificáveis, ordens.
 * Devolve { ok, origemAusente, entradasNoDestino } conferidos em outra LUW.
 */
export async function fundirRequests(conexao, origem, destino, { confirm = false, sessao } = {}) {
  const de = assertTrkorr(origem);
  const para = assertTrkorr(destino);
  if (de === para) throw new Error('GUARD-RAIL: fundirRequests: origem e destino são a mesma TR.');
  if (confirm !== true) throw new Error(`GUARD-RAIL: fundirRequests exige confirm:true — a fusão APAGA a ordem ${de} (a origem some da E070, medido).`);
  for (const [nr, quem] of [[de, 'origem'], [para, 'destino']]) {
    const cab = await assertMinhaModificavel(conexao.cfg, nr, `fundirRequests (${quem})`);
    if (cab.STRKORR) throw new Error(`fundirRequests: ${nr} (${quem}) é TAREFA — a fusão é entre ORDENS.`);
  }
  passo(`cts: fundir ${de} em ${para}`);
  await postAcao(conexao, de, 'merge', { body: buildAcaoBody('merge', { numero: para }), sessao });
  const resta = await readTable(conexao.cfg, 'E070', { campos: ['TRKORR'], where: [`TRKORR = '${de}'`], linhas: 1 });
  const entradas = await readTable(conexao.cfg, 'E071', { campos: ['PGMID', 'OBJECT', 'OBJ_NAME'], where: [`TRKORR = '${para}'`], linhas: 999 });
  const origemAusente = resta.length === 0;
  detalhe(`fundirRequests ${de}→${para}: origem ${origemAusente ? 'ausente' : 'AINDA EXISTE'}, destino com ${entradas.length} entrada(s)`);
  return { ok: origemAusente, origem: de, destino: para, origemAusente, entradasNoDestino: entradas };
}

/** Ordena e compacta as entradas da ordem (`sortandcompress` — o da SE09). Minha e modificável. */
export async function compactarRequest(conexao, numero, { sessao } = {}) {
  const n = assertTrkorr(numero);
  await assertMinhaModificavel(conexao.cfg, n, 'compactarRequest');
  passo(`cts: sort and compress de ${n}`);
  await postAcao(conexao, n, 'sortandcompress', { sessao });
  return { ok: true, numero: n };
}

/**
 * O check de consistência da SE01 (`consistencychecks`) — só leitura no conteúdo da TR. Devolve
 * { ok, mensagens }: `ok` = nenhuma mensagem tipo E (medido: flagra objeto travado noutra TR).
 */
export async function verificarConsistencia(conexao, numero, { sessao } = {}) {
  const n = assertTrkorr(numero);
  const [cab] = await readTable(conexao.cfg, 'E070', { campos: ['TRKORR'], where: [`TRKORR = '${n}'`], linhas: 1 });
  if (!cab) throw new Error(`verificarConsistencia: ${n} não existe na E070 deste sistema.`);
  passo(`cts: consistency check de ${n}`);
  const r = await postAcao(conexao, n, 'consistencychecks', { sessao });
  const mensagens = parseChecklist(r.text);
  detalhe(`verificarConsistencia ${n}: ${mensagens.length} mensagem(ns), ${mensagens.filter((m) => m.tipo === 'E').length} erro(s)`);
  return { ok: !mensagens.some((m) => m.tipo === 'E'), numero: n, mensagens };
}

/**
 * TRAVA entradas da ordem/tarefa aos seus objetos (`lockobject` — o lock do CTS). O efeito mora na
 * TLOCK (uma linha OBJECT/LOKEY por objeto), NÃO no E071.LOCKFLAG — medido no item 77: o LOCKFLAG
 * ficou vazio e mesmo assim outra TR foi recusada ("bloqueado em ordem/na tarefa …", 400 limpo).
 *
 * ⚠ O servidor trava até objeto que NEM ESTÁ na E071 da TR (lock "fantasma", que bloqueia o delete
 *   do objeto com 409 sem rastro visível na TR) — o guard daqui recusa antes, exigindo a entrada.
 * ⚠ Desfazer é `destravarRequest` (o unlock roda também NA ordem desde o item 77 — só por tarefa a
 *   TLOCK de ordem sem tarefa ficava presa e o TR_DELETE_COMM recusava).
 *
 * Devolve { ok, travados } conferidos na TLOCK em outra LUW.
 */
export async function travarObjetosNaRequest(conexao, numero, objetos = [], { sessao } = {}) {
  const n = assertTrkorr(numero);
  const lista = (Array.isArray(objetos) ? objetos : [objetos]).map((o, i) => {
    const tipo = String(o?.tipo ?? '').toUpperCase().trim();
    const nome = String(o?.nome ?? '').toUpperCase().trim();
    if (!tipo || !nome) throw new Error(`GUARD-RAIL: travarObjetosNaRequest: objetos[${i}] precisa de { tipo, nome } (pgmid default R3TR).`);
    return { pgmid: String(o?.pgmid ?? 'R3TR').toUpperCase().trim(), tipo, nome };
  });
  if (!lista.length) throw new Error('GUARD-RAIL: travarObjetosNaRequest: a lista de objetos está vazia.');
  await assertMinhaModificavel(conexao.cfg, n, 'travarObjetosNaRequest');
  const e = await readTable(conexao.cfg, 'E071', { campos: ['PGMID', 'OBJECT', 'OBJ_NAME'], where: [`TRKORR = '${n}'`], linhas: 999 });
  for (const o of lista) {
    if (!e.some((l) => l.PGMID === o.pgmid && l.OBJECT === o.tipo && l.OBJ_NAME === o.nome)) {
      throw new Error(`GUARD-RAIL: travarObjetosNaRequest: ${o.pgmid} ${o.tipo} ${o.nome} não está na E071 de ${n} — o servidor travaria mesmo assim (lock fantasma, medido: bloqueia o delete do objeto sem rastro na TR), por isso a recusa é daqui.`);
    }
  }
  passo(`cts: travar ${lista.length} objeto(s) em ${n}`);
  await postAcao(conexao, n, 'lockobject', { body: buildAcaoBody('lockobject', { numero: n, objetos: lista }), sessao });
  const tl = await readTable(conexao.cfg, 'TLOCK', { where: [`TRKORR = '${n}'`], linhas: 999 });
  const travados = lista.filter((o) => tl.some((l) => l.OBJECT === o.tipo && l.LOKEY === o.nome));
  detalhe(`travarObjetosNaRequest ${n}: ${travados.length}/${lista.length} na TLOCK`);
  return { ok: travados.length === lista.length, numero: n, travados };
}

/**
 * `preparerelease` — o gancho do code review do gCTS (`if_cts_rest_api->prepare_release`, que
 * devolve a URL do pull request). Em sistema SEM gCTS responde 200 com request_data sem
 * <tm:review> (medido no s4h): `pullRequestUrl` volta vazio, e isso não é erro.
 */
export async function prepararRelease(conexao, numero, { sessao } = {}) {
  const n = assertTrkorr(numero);
  await assertMinhaModificavel(conexao.cfg, n, 'prepararRelease');
  passo(`cts: preparerelease de ${n}`);
  const r = await postAcao(conexao, n, 'preparerelease', { sessao });
  return { numero: n, pullRequestUrl: (r.text.match(/tm:pull_request_url="([^"]*)"/) || [])[1] ?? '' };
}

// =================================================================================================
// O EDITOR DE TR — o OUTRO handler do CTS ADT (item 78 / I97, medido 2026-09-02 no S4H 758)
//
// O dispatcher dos itens 74–77 (`CL_CTS_ADT_TM_REST_RES_CONT`) atende `…/<nr>/<ação>`. O EDITOR é
// outro handler no MESMO recurso: `PUT /sap/bc/adt/cts/transportrequests/<nr>` cai em
// `CL_CTS_ADT_TM_RES_REQUEST_CONT->put`, que roteia pelo `tm:useraction` DO CORPO (não da URL):
// changetarget · changeproject · addattribute/removeattribute/modifyattribute · addobject(+from…)
// · removeobject · protect/unprotect/setstatusmodifiable · changetasktype · changeowner — e
// QUALQUER useraction desconhecida (inclusive nenhuma) cai no `save( )`, o "salvar" do editor do
// Eclipse, que grava descrição curta, descrição longa (a docu da TR), alvo e projeto DE UMA VEZ.
//
// MEDIDO, cada um com contra-prova:
//   • ⚠ O SAVE APAGA O QUE O CORPO NÃO TRAZ: `update_target` compara alvo do corpo × E070 e grava
//     a diferença — corpo só com desc LIMPOU o TARSYSTEM (medido); `update_cts_project` idem (o
//     fonte remove o atributo quando o corpo vem sem projeto). Por isso `editarRequest` daqui LÊ
//     alvo+projeto antes e os reenvia. (É também a ÚNICA via de TIRAR o projeto: `changeproject`
//     com valor vazio é 400 "ExceptionInvalidData".)
//   • ⚠ `removeobject` é MUDO: position errada OU ausente respondem 200 com o tm:root ecoado e NÃO
//     removem nada (o `else` do fonte está vazio). A position é a AS4POS da E071 — daqui ela é
//     resolvida por leitura e o resultado conferido na E071 depois.
//   • `addobject` NÃO valida posse nem lock: aceitou objeto SAP (SAPMV45A) e objeto travado noutra
//     ordem (LOCKFLAG da entrada nova fica vazio — como o FM do item 75). Inexistente é 400 limpo
//     ("necessita de entrada no diretório"). Redundante com `inserirObjetosNaRequest` (RFC), que
//     continua sendo a via daqui — com guard Z/Y.
//   • `changetarget` recusa alvo inexistente (400 "sintaxe") E alvo vazio (400) — limpar alvo só
//     pela armadilha do save. `protect` põe TRSTATUS='L', `unprotect` devolve 'D'.
//   • `changetasktype` muda E070.TRFUNCTION da TAREFA (X→R→S medidos); o tipo vai em
//     `<tm:task tm:type="…">` (o código de 1 letra, não o texto).
//   • `modifyattribute` exige a POS da E070A e passa por `TRINT_CHECK_ATTR_CHANGEABLE` (atributo
//     imutável é recusado com mensagem limpa — diferente do remove+add por RFC, que não checa).
//   • `setstatusmodifiable` em TR 'D' é 400 ("já modificável") — o caso de sucesso não foi isolado.
//   • Leituras vizinhas (handlers próprios): GET `…/actionlogs` e `…/transportlogs` respondem 200
//     em `log:log` (`lerActionLog`/`lerTransportLog`); `…/objectkeys` deu 400 "I::000" sem query
//     que o destrave (fora); `…/transportchecks` GET devolve chkrun de status (POST 405).
// Receita: docs/receita-change-request.md § O editor de TR.
// =================================================================================================

/** Corpo do editor (`ST_CTS_ADT_TM_MAIN`). Sem `acao` é o SAVE — e aí o número vai no request; nas
 *  ações vai no root (`user_action.number`). Puro. */
export function buildEditorBody(acao, { numero, descricao, descricaoLonga, alvo, projeto, atributo, objetos, tipoTarefa } = {}) {
  const n = String(numero ?? '').toUpperCase();
  const rootAttrs = [TM_NS];
  if (acao) rootAttrs.push(`tm:useraction="${escXml(acao)}"`, `tm:number="${n}"`);
  const reqAttrs = [];
  if (!acao) reqAttrs.push(`tm:number="${n}"`);
  if (descricao !== undefined) reqAttrs.push(`tm:desc="${escXml(descricao)}"`);
  if (alvo !== undefined) reqAttrs.push(`tm:target="${escXml(String(alvo).toUpperCase())}"`);
  if (projeto !== undefined) reqAttrs.push(`tm:cts_project="${escXml(String(projeto).toUpperCase())}"`);
  const filhos = [];
  if (descricaoLonga !== undefined) {
    const linhas = Array.isArray(descricaoLonga) ? descricaoLonga : String(descricaoLonga).split('\n');
    filhos.push(`<tm:long_desc>${linhas.map((l) => `<tm:long_desc_line tm:long_desc_text="${escXml(l)}"/>`).join('')}</tm:long_desc>`);
  }
  if (atributo) {
    const at = [`tm:attribute="${escXml(String(atributo.nome).toUpperCase())}"`, `tm:value="${escXml(atributo.valor ?? '')}"`];
    if (atributo.posicao) at.push(`tm:position="${escXml(atributo.posicao)}"`);
    filhos.push(`<tm:attributes ${at.join(' ')}/>`);
  }
  for (const o of objetos ?? []) {
    const at = [`tm:pgmid="${escXml(String(o.pgmid ?? 'R3TR').toUpperCase())}"`, `tm:type="${escXml(String(o.tipo).toUpperCase())}"`, `tm:name="${escXml(String(o.nome).toUpperCase())}"`];
    if (o.position) at.push(`tm:position="${escXml(o.position)}"`);
    filhos.push(`<tm:abap_object ${at.join(' ')}/>`);
  }
  const request = (reqAttrs.length || filhos.length)
    ? `<tm:request${reqAttrs.length ? ` ${reqAttrs.join(' ')}` : ''}${filhos.length ? `>${filhos.join('')}</tm:request>` : '/>'}`
    : '';
  const task = tipoTarefa !== undefined ? `<tm:task tm:type="${escXml(String(tipoTarefa).toUpperCase())}"/>` : '';
  const miolo = `${request}${task}`;
  return `<?xml version="1.0" encoding="UTF-8"?><tm:root ${rootAttrs.join(' ')}${miolo ? `>${miolo}</tm:root>` : '/>'}`;
}

async function putEditor(conexao, numero, body, sessao) {
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, {
    method: 'PUT', path: `/sap/bc/adt/cts/transportrequests/${numero}`,
    accept: 'application/*', contentType: 'application/vnd.sap.adt.transportorganizer.v1+xml', body,
  });
  if (r.status >= 400) throw new Error(`cts: editor em ${numero} falhou (${r.status}): ${mensagemDeAcao(r.text)}`);
  return r;
}

/** O projeto CTS atual da TR (E070A `SAP_CTS_PROJECT`), '' se não houver. */
const projetoDaRequest = async (cfg, n) =>
  (await lerAtributos(cfg, n)).find((a) => a.atributo === 'SAP_CTS_PROJECT')?.valor ?? '';

/**
 * O SAVE do editor: muda a descrição curta e/ou a descrição LONGA (a docu da TR — que nenhuma
 * outra via da lib escrevia). ⚠ O save do SAP grava o documento INTEIRO: o que o corpo não traz
 * ele APAGA (alvo e projeto — medido). Por isso daqui o alvo e o projeto atuais são LIDOS antes e
 * reenviados intactos. Devolve { ok, numero, descricao } com a E07T conferida em outra LUW.
 */
export async function editarRequest(conexao, numero, { descricao, descricaoLonga, sessao } = {}) {
  const n = assertTrkorr(numero);
  if (descricao === undefined && descricaoLonga === undefined) {
    throw new Error('GUARD-RAIL: editarRequest sem nada para editar — passe `descricao` e/ou `descricaoLonga`.');
  }
  const cab = await assertMinhaModificavel(conexao.cfg, n, 'editarRequest');
  const [linha] = await readTable(conexao.cfg, 'E070', { campos: ['TRKORR', 'TARSYSTEM'], where: [`TRKORR = '${n}'`], linhas: 1 });
  const projeto = cab.STRKORR ? undefined : await projetoDaRequest(conexao.cfg, n);
  const [t0] = await readTable(conexao.cfg, 'E07T', { campos: ['AS4TEXT'], where: [`TRKORR = '${n}'`], linhas: 1 });
  const desc = descricao !== undefined ? String(descricao) : (t0?.AS4TEXT ?? '');
  passo(`cts: editar ${n} (save do editor)`);
  await putEditor(conexao, n, buildEditorBody(undefined, {
    numero: n, descricao: desc, descricaoLonga,
    ...(cab.STRKORR ? {} : { alvo: linha?.TARSYSTEM ?? '', projeto }),
  }), sessao);
  const [t1] = await readTable(conexao.cfg, 'E07T', { campos: ['AS4TEXT'], where: [`TRKORR = '${n}'`], linhas: 1 });
  const ok = descricao === undefined || t1?.AS4TEXT === String(descricao);
  detalhe(`editarRequest ${n}: E07T="${t1?.AS4TEXT ?? ''}" ${ok ? 'confirmada' : 'NÃO confirmada'}`);
  return { ok, numero: n, descricao: t1?.AS4TEXT ?? '' };
}

/**
 * Muda o ALVO da ordem (`changetarget`). Alvo vazio o servidor recusa (400, medido) — e alvo
 * inexistente também (400 "sintaxe incorreta"), sem gravar. Devolve { ok } com a E070 conferida.
 */
export async function trocarAlvoRequest(conexao, numero, alvo, { sessao } = {}) {
  const n = assertTrkorr(numero);
  const a = String(alvo ?? '').toUpperCase().trim();
  if (!a) throw new Error('GUARD-RAIL: trocarAlvoRequest: alvo vazio o servidor recusa (400, medido). Não há via de LIMPAR o alvo além do save cru — se precisar disso, é decisão consciente fora da lib.');
  await assertMinhaModificavel(conexao.cfg, n, 'trocarAlvoRequest');
  passo(`cts: alvo de ${n} → ${a}`);
  await putEditor(conexao, n, buildEditorBody('changetarget', { numero: n, alvo: a }), sessao);
  const [h] = await readTable(conexao.cfg, 'E070', { campos: ['TARSYSTEM'], where: [`TRKORR = '${n}'`], linhas: 1 });
  return { ok: h?.TARSYSTEM === a, numero: n, alvo: h?.TARSYSTEM ?? '' };
}

/**
 * Liga a ordem a um projeto CTS (`changeproject` — grava `SAP_CTS_PROJECT` na E070A) ou a DESLIGA
 * (`projeto` vazio → via save, porque o changeproject recusa valor vazio; medido). O `projeto` é o
 * TRKORR do projeto (`S4H_P00005`), não o id externo — ver `criarProjeto`/`listarProjetos`.
 */
export async function trocarProjetoRequest(conexao, numero, projeto, { sessao } = {}) {
  const n = assertTrkorr(numero);
  const p = String(projeto ?? '').toUpperCase().trim();
  await assertMinhaModificavel(conexao.cfg, n, 'trocarProjetoRequest');
  passo(`cts: projeto de ${n} → ${p || '(remover)'}`);
  if (p) {
    await putEditor(conexao, n, buildEditorBody('changeproject', { numero: n, projeto: p }), sessao);
  } else {
    // tirar o projeto: só o save faz — reenviando desc e alvo atuais para não os perder (medido).
    const [t] = await readTable(conexao.cfg, 'E07T', { campos: ['AS4TEXT'], where: [`TRKORR = '${n}'`], linhas: 1 });
    const [h] = await readTable(conexao.cfg, 'E070', { campos: ['TARSYSTEM'], where: [`TRKORR = '${n}'`], linhas: 1 });
    await putEditor(conexao, n, buildEditorBody(undefined, { numero: n, descricao: t?.AS4TEXT ?? '', alvo: h?.TARSYSTEM ?? '', projeto: '' }), sessao);
  }
  const atual = await projetoDaRequest(conexao.cfg, n);
  return { ok: atual === p, numero: n, projeto: atual };
}

/**
 * MODIFICA o valor de um atributo existente (`modifyattribute` — delete+add atômico do servidor,
 * atrás de `TRINT_CHECK_ATTR_CHANGEABLE`: atributo imutável é recusado com mensagem limpa, o que o
 * remove+add por RFC não checa). A POS é resolvida da E070A; atributo ausente é recusado daqui.
 */
export async function mudarAtributoRequest(conexao, numero, { atributo, valor, sessao } = {}) {
  const n = assertTrkorr(numero);
  const a = assertAtributo({ atributo, valor }, 'mudarAtributoRequest');
  await assertMinhaModificavel(conexao.cfg, n, 'mudarAtributoRequest');
  const atual = (await lerAtributos(conexao.cfg, n)).find((x) => x.atributo === a.atributo);
  if (!atual) throw new Error(`mudarAtributoRequest: ${n} não tem o atributo ${a.atributo} — para criar, gravarAtributo.`);
  passo(`cts: atributo ${a.atributo} de ${n} → "${a.valor}"`);
  await putEditor(conexao, n, buildEditorBody('modifyattribute', { numero: n, atributo: { nome: a.atributo, valor: a.valor, posicao: atual.posicao } }), sessao);
  const depois = (await lerAtributos(conexao.cfg, n)).find((x) => x.atributo === a.atributo);
  return { ok: depois?.valor === a.valor, numero: n, atributo: a.atributo, valor: depois?.valor ?? '' };
}

/**
 * PROTEGE a ordem (`protect` — E070.TRSTATUS 'D'→'L': continua modificável para o dono, mas o
 * sistema barra release/merge de terceiros) ou desprotege (`unprotect`, 'L'→'D'). Medido nos dois
 * sentidos. Devolve { ok, status } com a E070 conferida em outra LUW.
 */
export async function protegerRequest(conexao, numero, { desfazer = false, sessao } = {}) {
  const n = assertTrkorr(numero);
  const [cab] = await readTable(conexao.cfg, 'E070', { campos: ['TRKORR', 'TRSTATUS', 'AS4USER', 'STRKORR'], where: [`TRKORR = '${n}'`], linhas: 1 });
  if (!cab) throw new Error(`protegerRequest: ${n} não existe na E070 deste sistema.`);
  const eu = String(conexao.cfg.user ?? '').toUpperCase();
  if (cab.AS4USER !== eu) throw new Error(`protegerRequest: ${n} é de ${cab.AS4USER}, não de ${eu} — a recusa é daqui, como no release.`);
  const esperado = desfazer ? 'D' : 'L';
  passo(`cts: ${desfazer ? 'desproteger' : 'proteger'} ${n}`);
  await putEditor(conexao, n, buildEditorBody(desfazer ? 'unprotect' : 'protect', { numero: n }), sessao);
  const [h] = await readTable(conexao.cfg, 'E070', { campos: ['TRSTATUS'], where: [`TRKORR = '${n}'`], linhas: 1 });
  return { ok: h?.TRSTATUS === esperado, numero: n, status: h?.TRSTATUS ?? '' };
}

const TIPOS_TAREFA = { S: 'desenvolvimento/correção', R: 'reparo', X: 'não classificada', Q: 'customizing' };

/**
 * Muda o TIPO da tarefa (`changetasktype` — E070.TRFUNCTION; X→R→S medidos). O tipo vai como
 * código de 1 letra em `<tm:task tm:type>`, não como o texto que o GET devolve.
 */
export async function mudarTipoTarefa(conexao, tarefa, tipo, { sessao } = {}) {
  const n = assertTrkorr(tarefa);
  const t = String(tipo ?? '').toUpperCase();
  if (!TIPOS_TAREFA[t]) throw new Error(`GUARD-RAIL: mudarTipoTarefa: tipo '${tipo}' — os conhecidos são ${Object.entries(TIPOS_TAREFA).map(([k, v]) => `${k} (${v})`).join(', ')}.`);
  const cab = await assertMinhaModificavel(conexao.cfg, n, 'mudarTipoTarefa');
  if (!cab.STRKORR) throw new Error(`mudarTipoTarefa: ${n} é ORDEM — tipo de tarefa se muda na TAREFA.`);
  passo(`cts: tipo da tarefa ${n} → ${t}`);
  await putEditor(conexao, n, buildEditorBody('changetasktype', { numero: n, tipoTarefa: t }), sessao);
  const [h] = await readTable(conexao.cfg, 'E070', { campos: ['TRFUNCTION'], where: [`TRKORR = '${n}'`], linhas: 1 });
  return { ok: h?.TRFUNCTION === t, tarefa: n, tipo: h?.TRFUNCTION ?? '' };
}

/**
 * REMOVE entradas da ordem/tarefa (`removeobject` — a lacuna que o item 24 deu como inexistente
 * no 758; existe, neste handler). ⚠ O servidor é MUDO: position errada ou ausente respondem 200
 * sem remover nada — por isso a AS4POS é resolvida da E071 aqui, entrada ausente é recusada antes,
 * e o resultado é conferido na E071 em outra LUW. Remover entrada NÃO apaga o objeto (só o tira do
 * transporte) e o lock E071.LOCKFLAG some junto com a linha.
 */
export async function removerObjetosDaRequest(conexao, numero, objetos = [], { sessao } = {}) {
  const n = assertTrkorr(numero);
  const lista = (Array.isArray(objetos) ? objetos : [objetos]).map((o, i) => {
    const tipo = String(o?.tipo ?? '').toUpperCase().trim();
    const nome = String(o?.nome ?? '').toUpperCase().trim();
    if (!tipo || !nome) throw new Error(`GUARD-RAIL: removerObjetosDaRequest: objetos[${i}] precisa de { tipo, nome } (pgmid default R3TR).`);
    return { pgmid: String(o?.pgmid ?? 'R3TR').toUpperCase().trim(), tipo, nome };
  });
  if (!lista.length) throw new Error('GUARD-RAIL: removerObjetosDaRequest: a lista de objetos está vazia.');
  await assertMinhaModificavel(conexao.cfg, n, 'removerObjetosDaRequest');
  const e = await readTable(conexao.cfg, 'E071', { campos: ['AS4POS', 'PGMID', 'OBJECT', 'OBJ_NAME'], where: [`TRKORR = '${n}'`], linhas: 999 });
  const comPos = lista.map((o) => {
    const linha = e.find((l) => l.PGMID === o.pgmid && l.OBJECT === o.tipo && l.OBJ_NAME === o.nome);
    if (!linha) throw new Error(`removerObjetosDaRequest: ${o.pgmid} ${o.tipo} ${o.nome} não está na E071 de ${n} — e o servidor responderia 200 sem remover nada (mudo, medido).`);
    return { ...o, position: linha.AS4POS };
  });
  passo(`cts: remover ${comPos.length} entrada(s) de ${n}`);
  await putEditor(conexao, n, buildEditorBody('removeobject', { numero: n, objetos: comPos }), sessao);
  const depois = await readTable(conexao.cfg, 'E071', { campos: ['PGMID', 'OBJECT', 'OBJ_NAME'], where: [`TRKORR = '${n}'`], linhas: 999 });
  const restantes = comPos.filter((o) => depois.some((l) => l.PGMID === o.pgmid && l.OBJECT === o.tipo && l.OBJ_NAME === o.nome));
  detalhe(`removerObjetosDaRequest ${n}: ${comPos.length - restantes.length}/${comPos.length} removida(s)`);
  return { ok: restantes.length === 0, numero: n, removidos: comPos.length - restantes.length, restantes };
}

/** As entradas de um log ADT (`log:log` — actionlogs/transportlogs). Puro. Além das entidades
 *  nomeadas, decodifica as NUMÉRICAS (`&#231;` — o ICF escapa assim, medido no item 71). */
export function parseLogAdt(xml) {
  const texto = (s) => desescapar(s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))));
  return [...String(xml ?? '').matchAll(/<log:entry id="([^"]*)" severity="([^"]*)">([\s\S]*?)(?=<log:entry |<\/log:log>)/g)].map(([, id, severidade, corpo]) => ({
    id, severidade,
    chave: (corpo.match(/key="([^"]*)"/) || [])[1] ?? '',
    texto: texto((corpo.match(/<log:messageText[^>]*>([\s\S]*?)<\/log:messageText>/) || [, ''])[1]).trim(),
  }));
}

async function getLog(conexao, numero, recurso, sessao) {
  const n = assertTrkorr(numero);
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, { method: 'GET', path: `/sap/bc/adt/cts/transportrequests/${n}/${recurso}`, accept: 'application/*' });
  if (r.status >= 400) throw new Error(`cts: ${recurso} de ${n} falhou (${r.status}): ${mensagemDeAcao(r.text)}`);
  return { numero: n, entradas: parseLogAdt(r.text) };
}

/** O ACTION LOG da TR (a SE03 "Display Action Log") — quem fez o quê e quando, sem GUI. Só leitura. */
export const lerActionLog = (conexao, numero, { sessao } = {}) => getLog(conexao, numero, 'actionlogs', sessao);

/** O TRANSPORT LOG da TR (síntese de export/import). Só leitura. */
export const lerTransportLog = (conexao, numero, { sessao } = {}) => getLog(conexao, numero, 'transportlogs', sessao);

// =================================================================================================
// O OBJECT KEY EDITOR — `objectkeys` (item 79, medido 2026-09-02 no S4H 758, mandante 250)
//
// O TERCEIRO handler do CTS ADT: `…/transportrequests/<nr>/objectkeys`, servido por
// CL_CTS_ADT_TM_OBJECT_KEY_RES (rota registrada em CL_CTS_ADT_RES_APP) — o editor das ENTRADAS DE
// CHAVE (E071K), a metade que faltava do TABKEY do item 21 (fatiar existia; MONTAR não). Media
// type `application/vnd.sap.adt.transportorganizer.objectkeys.v1+xml`, ST ST_CTS_ADT_TM_OBJECT_KEY
// (raiz TK_OBJ_KEYS, namespace tk = http://www.sap.com/cts/adt/tk).
//
// O GET exige `objName`+`objType` de objeto que ESTÁ na lista da TR — sem os dois, ou com objeto
// fora da lista, é o 400 "I::000" que o item 78 mediu (a causa era essa, não corpo faltando).
//
// O PUT (`?lockHandle=` VAZIO funciona) é DOCUMENTO POR OBJETO: o corpo SUBSTITUI o conjunto de
// chaves do objeto selecionado — 1 chave no corpo → só ela fica; zero → apaga todas — e PRESERVA
// as chaves dos OUTROS objetos da TR (medido: as da T005 sobreviveram ao PUT da TVARVC).
//
// AS ARMADILHAS, cada uma com contra-prova (POCs do item 79):
//   • corpo SEM a seção <tk:tables> → HTTP 200 MUDO que grava ZERO e APAGA as chaves que o objeto
//     tinha (fill_table_key_details itera obj_key_tables; sem a seção, o update_request recebe
//     tabela de chaves vazia). O builder daqui manda tk:tables SEMPRE.
//   • objeto fora da lista → 400 limpo ("Valores não permitidos de uma chave de objeto"), sem
//     varrer a E071 (a lista sobreviveu — medido).
//   • só objType TABU é gravável (msg 038 para o resto) e a tabela passa por whitelist
//     (cl_ars_object_check — TVARVC e T005 passam no s4h). "System objects" (T000, T100, TRDIR…)
//     nem entram na LISTA: o TR_EXT_INSERT_IN_REQUEST os recusa com mensagem limpa.
//   • POST …/objectkeys/checkruns valida SEM gravar (tabela inexistente → checkMessage type E);
//     chave boa volta com relatório vazio. É o ensaio barato antes do PUT.
//
// O RAMO STRING (E071K_STR, isStringTable=true) — item 81, medido 2026-09-02 no S4H 758:
//   • quem decide é o dicionário: campo-CHAVE de DATATYPE 'SSTR' (critério lido no fonte do
//     TR_NAMETAB_GET — NÃO é o comprimento total da chave). O GET declara
//     tk:isStringTable="true" e serve o layout (tk:keyField type 'g' = string).
//   • o TABKEY string é concatenação SEM largura fixa; cada tk:tableKey leva tk:length = o
//     KEY_LENS (números de 5 dígitos concatenados, um por campo informado, dizendo quantos
//     caracteres do TABKEY aquele campo ocupa — formato lido no fonte de
//     TR_CONVERT_STRING_TO_FIELDS e provado por PUT + E071K_STR em outra LUW).
//   • PUT SEM tk:length → 400 limpo mas ENGANOSO (TK318 "não estão definidos campos-chave");
//     as chaves que existiam ficam. Valor mais largo que o LENG do dicionário → **500 SEM dump
//     que DERRUBA a sessão de segurança ADT** (as chamadas seguintes respondem "Session Timed
//     Out") — daí montarTabkeyString recusar ANTES da rede. Curinga '*' no fim vale (o '*'
//     conta no comprimento). Chave string vai SÓ para a E071K_STR (a E071K fica vazia).
//   • entrada TABU de tabela classe A (DEMO_CLOB_TABLE, STWD_BO_TOPIC): o TR_EXT_INSERT recusou
//     genérico (CALL_FUNCTION_ERROR) em ordem W e aceitou em ordem K — medido nas duas tabelas.
// =================================================================================================

const ACCEPT_OBJECTKEYS = 'application/vnd.sap.adt.transportorganizer.objectkeys.v1+xml';

/**
 * Body do objectkeys (`tk:objectKeys`). Puro. A seção `tk:tables` vai SEMPRE — sem ela o PUT é o
 * 200 mudo que apaga (ver o bloco acima). `chaves`: TABKEY pronto (string, ramo convencional) ou
 * `{ valor, lens }` (ramo string — o `tk:length` leva o KEY_LENS; sem ele o servidor recusa com a
 * TK318 enganosa "não estão definidos campos-chave" — medido, item 81).
 */
export function buildObjectKeysBody(tabela, chaves = [], { stringTable = false } = {}) {
  const t = String(tabela).toUpperCase().trim();
  const keys = (chaves ?? []).map((c, i) => {
    const { valor, lens } = typeof c === 'string' ? { valor: c, lens: '' } : (c ?? {});
    return `<tk:tableKey tk:tableName="${escXml(t)}" tk:value="${escXml(valor)}"` +
      `${lens ? ` tk:length="${escXml(lens)}"` : ''} tk:position="${String(i + 1).padStart(4, '0')}"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<tk:objectKeys xmlns:tk="http://www.sap.com/cts/adt/tk" tk:objName="${escXml(t)}" tk:objType="TABU" tk:objPgmId="R3TR">` +
    `<tk:tableKeys tk:isReadOnly="false">${keys}</tk:tableKeys>` +
    `<tk:tables><tk:table tk:isStringTable="${stringTable ? 'true' : 'false'}" tk:name="${escXml(t)}"/></tk:tables>` +
    `</tk:objectKeys>`;
}

/** As mensagens de um checkrun (`chkrun:checkMessage`). Puro. */
export function mensagensDoCheckrun(xml) {
  return [...String(xml ?? '').matchAll(/<chkrun:checkMessage\s([^>]*?)\/?>/g)].map(([, a]) => ({
    tipo: attr(a, 'chkrun:type'),
    texto: desescapar(attr(a, 'chkrun:shortText')),
    categoria: attr(a, 'chkrun:category'),
  }));
}

/**
 * String pronta passa cru; objeto { CAMPO: valor } vira TABKEY pelo layout (CLNT = mandante do
 * logon). Devolve { stringTable, chaves } — tabela STRING (campo-chave SSTR) sai `{ valor, lens }`
 * por `montarTabkeyString`, e TABKEY pronto é recusado nela (sem o KEY_LENS o servidor não sabe
 * onde cada campo termina; a recusa dele é a TK318 enganosa — medido, item 81).
 */
async function chavesEmTabkey(cfg, tabela, chaves) {
  const lista = Array.isArray(chaves) ? chaves : [chaves];
  // TABKEY cru acima de 120 é inválido nos DOIS ramos (convencional: CHAR 120; string: cru é
  // recusado de toda forma) — recusa ANTES da rede.
  for (const ch of lista) {
    if (typeof ch === 'string' && ch.length > TABKEY_MAX) {
      throw new Error(`chave "${ch.slice(0, 40)}…" passa de ${TABKEY_MAX} chars — o TABKEY convencional é CHAR ${TABKEY_MAX}; se a tabela transporta chave STRING (E071K_STR), passe { CAMPO: valor } para a lib montar o KEY_LENS (item 81).`);
    }
  }
  const layout = await layoutChave(cfg, tabela);
  const stringTable = ehTabelaString(layout);
  const out = [];
  for (const ch of lista) {
    if (typeof ch === 'string') {
      if (stringTable) {
        throw new Error(`GUARD-RAIL: ${tabela} transporta chave STRING (E071K_STR) — passe { CAMPO: valor } para a lib montar o KEY_LENS; TABKEY pronto não diz onde cada campo termina.`);
      }
      out.push(ch); continue;
    }
    const vals = Object.fromEntries(Object.entries(ch ?? {}).map(([k, v]) => [String(k).toUpperCase().trim(), v]));
    const clnt = layout.find((c) => c.tipo === 'CLNT');
    if (clnt && vals[clnt.campo] === undefined) vals[clnt.campo] = cfg.client;
    if (stringTable) {
      const { tabkey, lens } = montarTabkeyString(layout, vals);
      out.push({ valor: tabkey, lens });
    } else {
      out.push(montarTabkey(layout, vals));
    }
  }
  if (!stringTable) {
    for (const tk of out) {
      if (tk.length > TABKEY_MAX) throw new Error(`chave "${tk.slice(0, 40)}…" passa de ${TABKEY_MAX} chars e ${tabela} NÃO transporta chave string (nenhum campo-chave SSTR) — o TABKEY convencional é CHAR ${TABKEY_MAX} (item 21).`);
    }
  }
  return { stringTable, chaves: out };
}

/**
 * ENSAIA as chaves sem gravar — `POST …/objectkeys/checkruns`. `chaves`: TABKEY pronto (string) ou
 * `{ CAMPO: valor }` montado pelo layout do dicionário. Devolve { ok, mensagens } — `ok` = nenhum
 * E/A no relatório (tabela inexistente/inativa é E, medido).
 */
export async function verificarChavesNaRequest(conexao, numero, { tabela, chaves = [], sessao } = {}) {
  const n = assertTrkorr(numero);
  const t = String(tabela ?? '').toUpperCase().trim();
  if (!t) throw new Error('GUARD-RAIL: verificarChavesNaRequest exige `tabela`.');
  const { stringTable, chaves: tks } = await chavesEmTabkey(conexao.cfg, t, chaves);
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, {
    method: 'POST', path: `/sap/bc/adt/cts/transportrequests/${n}/objectkeys/checkruns`,
    accept: 'application/*', contentType: ACCEPT_OBJECTKEYS, body: buildObjectKeysBody(t, tks, { stringTable }),
  });
  if (r.status >= 400) throw new Error(`cts: checkrun de chaves em ${n} falhou (${r.status}): ${mensagemDeAcao(r.text)}`);
  const mensagens = mensagensDoCheckrun(r.text);
  return { ok: !mensagens.some((m) => m.tipo === 'E' || m.tipo === 'A'), numero: n, tabela: t, stringTable, chaves: tks, mensagens };
}

/**
 * GRAVA o conjunto de chaves (E071K) de UMA tabela na ordem — o "Chaves" da SE01 sem GUI, e o par
 * de escrita do `lerRequestPorTabelas`. ⚠ É SUBSTITUIÇÃO: o conjunto do objeto passa a ser
 * exatamente `chaves` (as de outros objetos ficam); lista vazia APAGA todas as do objeto e por
 * isso exige `confirm: true`. `chaves`: TABKEY pronto (string, `*` de curinga vale) ou
 * `{ CAMPO: valor }` montado pelo layout — CLNT entra sozinho com o mandante do logon.
 *
 * A entrada `R3TR TABU <tabela>` precisa existir na LISTA da TR (regra do handler) — se faltar,
 * entra daqui pelo TR_EXT_INSERT_IN_REQUEST (tabela standard de customizing é o caso de uso
 * normal; "system objects" o FM recusa limpo). Só ORDEM foi medida — tarefa é recusada.
 * Devolve { ok, chaves, faltando, sobrando } com a E071K conferida em OUTRA LUW.
 */
export async function gravarChavesNaRequest(conexao, numero, { tabela, chaves = [], confirm = false, sessao } = {}) {
  const n = assertTrkorr(numero);
  const t = String(tabela ?? '').toUpperCase().trim();
  if (!t) throw new Error('GUARD-RAIL: gravarChavesNaRequest exige `tabela`.');
  if (!(Array.isArray(chaves) ? chaves : [chaves]).length && confirm !== true) {
    throw new Error(`GUARD-RAIL: gravarChavesNaRequest com ZERO chaves APAGA todas as entradas de ${t} em ${n} (o PUT é documento — medido). Para isso, passe confirm:true.`);
  }
  const { stringTable, chaves: tks } = await chavesEmTabkey(conexao.cfg, t, chaves);
  const cab = await assertMinhaModificavel(conexao.cfg, n, 'gravarChavesNaRequest');
  if (cab.STRKORR) throw new Error(`gravarChavesNaRequest: ${n} é TAREFA (da ordem ${cab.STRKORR}) — só a ORDEM foi medida (item 79); passe a ordem.`);
  const [entrada] = await readTable(conexao.cfg, 'E071', { campos: ['OBJ_NAME'], where: [`TRKORR = '${n}'`, `AND OBJECT = 'TABU'`, `AND OBJ_NAME = '${t}'`], linhas: 1 });
  if (!entrada) {
    passo(`cts: entrada R3TR TABU ${t} em ${n} (o objectkeys exige o objeto na lista)`);
    const { xml } = await callFunction(conexao.cfg, 'TR_EXT_INSERT_IN_REQUEST', { IV_REQ_ID: n, IT_OBJECTS: [{ PGMID: 'R3TR', OBJECT: 'TABU', OBJ_NAME: t }] });
    const excecao = xmlField(xml, 'EV_EXCEPTION') || '';
    if (excecao) throw new Error(`gravarChavesNaRequest: ${t} não entrou na lista de ${n} (${excecao}): ${xmlField(xml, 'ES_MSG') || ''}`);
  }
  passo(`cts: gravar ${tks.length} chave(s) de ${t} em ${n}${stringTable ? ' (chave STRING — E071K_STR)' : ''}`);
  const s = await sessaoDeLeitura(conexao, sessao);
  const r = await call(s, {
    method: 'PUT', path: `/sap/bc/adt/cts/transportrequests/${n}/objectkeys?lockHandle=`,
    accept: 'application/*', contentType: ACCEPT_OBJECTKEYS, body: buildObjectKeysBody(t, tks, { stringTable }),
  });
  if (r.status >= 400) throw new Error(`cts: gravar chaves de ${t} em ${n} falhou (${r.status}): ${mensagemDeAcao(r.text)}`);
  // assert em OUTRA LUW: o conjunto do objeto é exatamente o pedido. Chave string mora SÓ na
  // E071K_STR (a E071K fica vazia — medido); TABKEY/KEY_LENS lá são string → dataPreview, não
  // RFC_READ_TABLE. A comparação da string leva o KEY_LENS junto (valor igual com fatia diferente
  // é OUTRA chave).
  let gravadas, pedidas, chavesGravadas;
  if (stringTable) {
    const { rows } = await dataPreview(conexao, `SELECT tabkey, key_lens FROM e071k_str WHERE trkorr = '${n}'\n  AND objname = '${t}'`, { rows: 999 });
    gravadas = rows.map((l) => `${l.TABKEY ?? ''} (lens ${String(l.KEY_LENS ?? '').trim()})`);
    pedidas = tks.map((c) => `${c.valor} (lens ${c.lens})`);
    chavesGravadas = rows.map((l) => String(l.TABKEY ?? ''));
  } else {
    const linhas = await readTable(conexao.cfg, 'E071K', { campos: ['TABKEY'], where: [`TRKORR = '${n}'`, `AND OBJNAME = '${t}'`], linhas: 999 });
    gravadas = linhas.map((l) => String(l.TABKEY ?? '').replace(/ +$/, ''));
    pedidas = tks.map((v) => v.replace(/ +$/, ''));
    chavesGravadas = gravadas;
  }
  const faltando = pedidas.filter((v) => !gravadas.includes(v));
  const sobrando = gravadas.filter((v) => !pedidas.includes(v));
  detalhe(`gravarChaves ${n}/${t}: ${gravadas.length} na ${stringTable ? 'E071K_STR' : 'E071K'} (${faltando.length} faltando, ${sobrando.length} sobrando)`);
  return { ok: !faltando.length && !sobrando.length, numero: n, tabela: t, stringTable, chaves: chavesGravadas, faltando, sobrando };
}

// =================================================================================================
// A VIA DA SE09 — paridade de CRIAÇÃO sem GUI (item 39, medido 2026-09-01 no S4H 758, mandante 250)
//
// A engenharia reversa não achou lógica nenhuma dentro da SE09: `TRINT_POPUP_TO_CREATE_REQUEST`
// (SAPLSCTSREQ) é só a tela — `CALL SCREEN 200`, colhe tipo/texto/usuários/pacote/camada/alvo/
// projeto e devolve. Quem cria é sempre `TR_INSERT_REQUEST_WITH_TASKS` (SAPLSTR8), e é o MESMO FM
// que a API REST do CTS chama (`CL_CTS_REST_API_IMPL~create_request`, com `it_users` e
// `it_attributes` preenchidos). A diferença entre as portas não está no motor: está no que cada
// uma preenche. O `criarRequest` daqui (via ADT, item 24) manda só descrição/tipo/alvo/projeto —
// por isso a TR nasce sem tarefa.
//
// TRÊS PORTAS, medidas lado a lado:
//
//   ADT  `criarRequest`             ordem só · texto no idioma de LOGON (E07T LANGU='P')
//   RFC  `criarRequestPorRfc`       ordem só · `TR_EXT_CREATE_REQUEST` é FMODE='R' — SOAP PURO, sem
//                                   sessão e sem driver; texto em EN (o canal SOAP não manda idioma)
//   FM   `criarRequestComTarefas`   TUDO: tarefa por usuário (inclusive de OUTRO), atributos, alvo,
//                                   simulação — driver classrun, porque o FM não é RFC
//
// O que as três produzem é a MESMA TR (E070/E070C idênticas; só o LANGU da E07T muda).
//
// MEDIDO, e cada um custou uma rodada:
//   • o TIPO DA TAREFA sai do tipo da ORDEM, não da lista de usuários: ordem 'K' → tarefa 'X',
//     ordem 'W' → tarefa 'Q' (o FM sobrescreve o `type` do `scts_user`).
//   • `iv_simulation = 'X'` devolve subrc 0 com `es_request_header-trkorr` VAZIO e não grava nada —
//     é o dry-run barato.
//   • USUÁRIO INEXISTENTE derruba a criação (subrc 1, TR 809) **depois** de a ordem já estar
//     gravada, e o `ROLLBACK WORK` do FM NÃO a desfaz: sobra uma ordem órfã sem tarefa. Por isso
//     `criarRequestComTarefas` confere os usuários na USR02 ANTES da rede.
//   • `iv_devclass`/`iv_tardevcl` em ordem 'K' NÃO geram linha na E070M — silêncio, não erro.
//   • o PROJETO CTS não mora na `E070C-REPOID` (fica vazio nas três portas): mora na E070A, como
//     atributo `SAP_CTS_PROJECT` = o TRKORR do projeto (`S4H_P00002`), não o id externo. O
//     `tm:cts_project` do ADT grava exatamente isso.
//   • `SAPCORR` IMUNIZA a TR: com ele a TR não se edita, não se apaga, e o próprio atributo não
//     sai ("Request … cannot be edited", TO 086). É guard-rail daqui — ver `ATRIBUTOS_IMUNIZANTES`.
//   • `TR_EXT_ADD_REQ_ATTR` com `IV_DEL_FLAG='X'` e REFERENCE ERRADO devolve SUCESSO e não apaga
//     nada. O `removerAtributo` daqui exige o valor e confere a E070A depois.
// =================================================================================================

const TIPOS_TR = { K: 'workbench', W: 'customizing', T: 'transporte de cópias' };
/** Atributo que trava a TR contra edição e contra o próprio delete — medido no SAPCORR (TO 086). */
const ATRIBUTOS_IMUNIZANTES = ['SAPCORR'];

const abapStr = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;

function assertTipoTr(tipo, quem) {
  const t = String(tipo ?? '').toUpperCase();
  if (!TIPOS_TR[t]) throw new Error(`GUARD-RAIL: ${quem}: tipo '${tipo}' não existe — o FM só aceita ${Object.entries(TIPOS_TR).map(([k, v]) => `${k} (${v})`).join(', ')}.`);
  return t;
}

function assertAtributo({ atributo, valor }, quem) {
  const a = String(atributo ?? '').toUpperCase().trim();
  if (!a) throw new Error(`GUARD-RAIL: ${quem}: atributo sem nome.`);
  if (ATRIBUTOS_IMUNIZANTES.includes(a)) {
    throw new Error(`GUARD-RAIL: ${quem}: '${a}' IMUNIZA a request — medido no S4H 758: com ele a TR não se edita, não se apaga e o próprio atributo não sai (TO 086 "cannot be edited"). A TR ficaria no sistema para sempre.`);
  }
  return { atributo: a, valor: String(valor ?? '') };
}

/** Os usuários existem? O FM só descobre DEPOIS de gravar a ordem, e o rollback dele não a desfaz. */
async function assertUsuarios(cfg, usuarios, quem) {
  const nomes = [...new Set(usuarios.map((u) => String(u ?? '').toUpperCase().trim()).filter(Boolean))];
  for (const u of nomes) {
    if (u.length > 12) throw new Error(`GUARD-RAIL: ${quem}: "${u}" não cabe em AS4USER (CHAR 12).`);
  }
  for (const u of nomes) {
    const [existe] = await readTable(cfg, 'USR02', { campos: ['BNAME'], where: [`BNAME = '${u}'`], linhas: 1 });
    if (!existe) throw new Error(`GUARD-RAIL: ${quem}: usuário ${u} não existe na USR02 — o FM aceitaria a chamada, gravaria a ORDEM, falharia na tarefa (TR 809) e o ROLLBACK dele NÃO desfaz a ordem (medido: sobrou a S4HK912800).`);
  }
  return nomes;
}

/**
 * Fonte do driver que cria a request pela via completa da SE09. PURO.
 * A saída é uma linha `CTS39 REQ=…` mais uma `CTS39 TASK=…` por tarefa.
 */
export function buildCriarComTarefasSource(nomeClasse, { descricao, tipo = 'K', dono, usuarios = [], atributos = [], alvo = '', simular = false } = {}) {
  const d = String(descricao ?? '').trim();
  if (!d) throw new Error('GUARD-RAIL: criarRequestComTarefas exige `descricao` — TR sem texto vira lixo anônimo na SE09.');
  const t = assertTipoTr(tipo, 'criarRequestComTarefas');
  const attrs = atributos.map((a) => assertAtributo(a, 'criarRequestComTarefas'));
  const linhasUsuarios = usuarios.length
    ? `    lt_users = VALUE #( ${usuarios.map((u) => `( user = ${abapStr(String(u).toUpperCase())} )`).join(' ')} ).`
    : '';
  const linhasAttrs = attrs.length
    ? `    lt_attr = VALUE #( ${attrs.map((a) => `( attribute = ${abapStr(a.atributo)} value = ${abapStr(a.valor)} )`).join(' ')} ).`
    : '';
  return `${cabecaDriver(nomeClasse)}
    DATA: ls_hdr   TYPE trwbo_request_header,
          lt_tasks TYPE trwbo_request_headers,
          ls_task  TYPE trwbo_request_header,
          lt_users TYPE scts_users,
          lt_attr  TYPE scts_attrs.
${linhasUsuarios}
${linhasAttrs}
    CALL FUNCTION 'TR_INSERT_REQUEST_WITH_TASKS'
      EXPORTING iv_type = ${abapStr(t)} iv_text = ${abapStr(d)} iv_owner = ${abapStr(String(dono ?? '').toUpperCase())}
                iv_target = ${abapStr(String(alvo ?? '').toUpperCase())} it_users = lt_users it_attributes = lt_attr
                iv_simulation = ${abapStr(simular ? 'X' : '')}
      IMPORTING es_request_header = ls_hdr et_task_headers = lt_tasks
      EXCEPTIONS insert_failed = 1 enqueue_failed = 2 OTHERS = 3.
    out->write( |CTS39 REQ={ ls_hdr-trkorr } SUBRC={ sy-subrc } MSG={ sy-msgid }{ sy-msgno } { sy-msgv1 } TASKS={ lines( lt_tasks ) }| ).
    LOOP AT lt_tasks INTO ls_task.
      out->write( |CTS39 TASK={ ls_task-trkorr } FUNC={ ls_task-trfunction } USER={ ls_task-as4user }| ).
    ENDLOOP.
${caudaDriver}`;
}

/** Saída do driver de criação. PURO. */
export function parseSaidaCriarRequest(saida) {
  const s = String(saida ?? '');
  const m = s.match(/CTS39 REQ=(\S*) SUBRC=(\d+) MSG=(\S*) (.*?) TASKS=(\d+)/);
  return {
    numero: m?.[1] || '',
    subrc: m ? Number(m[2]) : null,
    mensagem: m ? `${m[3]} ${m[4]}`.trim() : '',
    tarefas: [...s.matchAll(/CTS39 TASK=(\S+) FUNC=(\S*) USER=(\S*)/g)]
      .map((t) => ({ numero: t[1], tipo: t[2], usuario: t[3] })),
  };
}

/**
 * Cria a request COM tarefas, atributos e alvo — a paridade com a SE09.
 *
 * Desde a fila 72 o caso comum NÃO paga driver: o POST de `cts/transportrequests` aceita
 * `<tm:task tm:owner>` (mesma via do `criarRequest`), e é por ela que esta função vai quando o
 * pedido cabe nela — sem atributo, sem simulação e com o dono sendo o usuário logado (o handler
 * não tem onde receber outro dono). O driver classrun fica só para o que o HTTP não alcança:
 * `dono` alheio, `atributos` e `simular` (`TR_INSERT_REQUEST_WITH_TASKS` não é RFC).
 * O retorno diz a rota em `via: 'http' | 'driver'`.
 *
 * `simular: true` é o dry-run do próprio FM: devolve `numero` vazio e não grava nada.
 */
export async function criarRequestComTarefas(conexao, { descricao, tipo = 'K', dono, usuarios = [], atributos = [], alvo = '', simular = false, keepDriver = false } = {}) {
  const owner = String(dono || conexao.cfg.user || '').toUpperCase();
  if (!owner) throw new Error('GUARD-RAIL: criarRequestComTarefas exige `dono` (ou `cfg.user`) — a ordem precisa de um responsável.');
  const viaHttp = !simular && !atributos.length && owner === String(conexao.cfg.user || '').toUpperCase();
  if (viaHttp) {
    // Usuário inexistente o servidor recusa inteiro (400 com mensagem limpa, nada criado — medido
    // 2026-09-02), então a validação local do driver não é necessária aqui.
    const req = await criarRequest(conexao, { descricao, tipo, alvo, usuarios });
    const linhas = await readTable(conexao.cfg, 'E070', {
      campos: ['TRKORR', 'TRFUNCTION', 'AS4USER'], where: [`STRKORR = '${req.numero}'`], linhas: 20,
    });
    const tarefas = linhas.map((l) => ({ numero: l.TRKORR, tipo: l.TRFUNCTION, usuario: l.AS4USER }));
    detalhe(`TR ${req.numero} por HTTP: ${tarefas.length} tarefa(s), sem driver`);
    return { ok: Boolean(req.numero), via: 'http', numero: req.numero, subrc: 0, mensagem: '', tarefas };
  }
  await assertUsuarios(conexao.cfg, [owner, ...usuarios], 'criarRequestComTarefas');
  const driver = 'Y_CTS39_CRIAR';
  // O build roda os guard-rails de descrição/tipo/atributo — antes de a rede ver qualquer coisa.
  const source = buildCriarComTarefasSource(driver, { descricao, tipo, dono: owner, usuarios, atributos, alvo, simular });
  passo(`cts: criar TR "${descricao}" (${usuarios.length} tarefa(s)${simular ? ', SIMULAÇÃO' : ''})`);
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg: '$TMP', description: 'driver: TR_INSERT_REQUEST_WITH_TASKS', source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  const saida = parseSaidaCriarRequest(r.saida);
  const ok = saida.subrc === 0 && (simular ? !saida.numero : Boolean(saida.numero));
  detalhe(`TR ${saida.numero || '(simulação)'}: subrc=${saida.subrc} tarefas=${saida.tarefas.length}`);
  return { ok, via: 'driver', ...saida, saida: r.saida };
}

// ---------- as portas de SOAP PURO (sem sessão, sem driver) ----------

/**
 * Cria a ordem por `TR_EXT_CREATE_REQUEST` — FMODE='R', logo SOAP puro: nenhuma sessão ADT é
 * aberta e nenhum objeto é criado no sistema. Não faz tarefa (o wrapper não passa `it_users`).
 * O texto nasce no idioma do canal SOAP (EN), não no de logon — medido.
 */
export async function criarRequestPorRfc(cfg, { descricao, tipo = 'K', dono, alvo = '', atributo } = {}) {
  const d = String(descricao ?? '').trim();
  if (!d) throw new Error('GUARD-RAIL: criarRequestPorRfc exige `descricao`.');
  const t = assertTipoTr(tipo, 'criarRequestPorRfc');
  const a = atributo ? assertAtributo(atributo, 'criarRequestPorRfc') : null;
  passo(`cts: criar TR por RFC "${d}"`);
  const { xml } = await callFunction(cfg, 'TR_EXT_CREATE_REQUEST', {
    IV_REQUEST_TYPE: t, IV_AUTHOR: String(dono || cfg.user || '').toUpperCase(), IV_TEXT: d,
    IV_TARGET: String(alvo ?? '').toUpperCase(),
    ...(a ? { IV_REQ_ATTR: a.atributo, IV_ATTR_REF: a.valor } : {}),
  });
  const numero = xmlField(xml, 'ES_REQ_ID') || '';
  const excecao = xmlField(xml, 'EV_EXCEPTION') || '';
  const mensagem = xmlField(xml, 'ES_MSG') || '';
  if (!numero) throw new Error(`cts: TR_EXT_CREATE_REQUEST não criou (${excecao || 'sem exceção'}): ${mensagem}`);
  detalhe(`TR criada por RFC: ${numero}`);
  return { numero, excecao, mensagem };
}

/**
 * Apaga a request por `CTS_WBO_DELETE_REQUEST` — FMODE='R', SOAP puro. Ao contrário do
 * `desmancharRequest`, não custa driver: leva ordem, tarefas e entradas juntas
 * (`initialtask_only = false` por dentro).
 */
export async function apagarRequestPorRfc(cfg, numero, { confirm = false } = {}) {
  const n = assertTrkorr(numero);
  if (confirm !== true) throw new Error(`GUARD-RAIL: apagarRequestPorRfc exige confirm:true (apaga ${n} com tarefas e entradas, irreversível).`);
  passo(`cts: apagar ${n} por RFC`);
  const { xml } = await callFunction(cfg, 'CTS_WBO_DELETE_REQUEST', { REQUEST: n });
  const excecao = xmlField(xml, 'EXCEPTION') || '';
  const detalheErro = (xmlField(xml, 'ERRORDETAIL') || '').trim();
  const resta = await readTable(cfg, 'E070', { campos: ['TRKORR'], where: [`TRKORR = '${n}'`], linhas: 1 }).catch(() => null);
  const confirmadoAusente = resta ? resta.length === 0 : null;
  detalhe(`apagar ${n}: exceção=${excecao || '(nenhuma)'} E070=${confirmadoAusente ? 'ausente' : 'AINDA EXISTE'}`);
  return { ok: !excecao && confirmadoAusente !== false, excecao, detalhe: detalheErro, confirmadoAusente };
}

/** Os atributos da request (E070A), em ordem de posição. */
export const lerAtributos = (cfg, numero) =>
  readTable(cfg, 'E070A', { campos: ['TRKORR', 'POS', 'ATTRIBUTE', 'REFERENCE'], where: [`TRKORR = '${assertTrkorr(numero)}'`], linhas: 50 })
    .then((r) => r.map((l) => ({ posicao: l.POS, atributo: l.ATTRIBUTE, valor: l.REFERENCE })))
    .catch(() => []);

/** Põe um atributo na request (`TR_EXT_ADD_REQ_ATTR`, RFC). É assim que se liga a TR ao projeto CTS. */
export async function gravarAtributo(cfg, numero, { atributo, valor } = {}) {
  const n = assertTrkorr(numero);
  const a = assertAtributo({ atributo, valor }, 'gravarAtributo');
  const { xml } = await callFunction(cfg, 'TR_EXT_ADD_REQ_ATTR', { IV_REQ_ID: n, IV_REQ_ATTR: a.atributo, IV_ATTR_REF: a.valor });
  const excecao = xmlField(xml, 'EV_EXCEPTION') || '';
  const gravado = (await lerAtributos(cfg, n)).some((x) => x.atributo === a.atributo && x.valor === a.valor);
  return { ok: !excecao && gravado, excecao, mensagem: xmlField(xml, 'ES_MSG') || '', gravado };
}

/**
 * Tira um atributo da request. O `valor` é OBRIGATÓRIO: com REFERENCE errado o FM devolve sucesso
 * e não apaga nada (medido) — por isso o resultado é conferido na E070A antes de voltar.
 */
export async function removerAtributo(cfg, numero, { atributo, valor } = {}) {
  const n = assertTrkorr(numero);
  const a = assertAtributo({ atributo, valor }, 'removerAtributo');
  if (valor === undefined || valor === null) throw new Error(`GUARD-RAIL: removerAtributo exige o \`valor\` exato — com REFERENCE errado o FM devolve SUCESSO e não apaga nada (medido).`);
  const { xml } = await callFunction(cfg, 'TR_EXT_ADD_REQ_ATTR', { IV_REQ_ID: n, IV_REQ_ATTR: a.atributo, IV_ATTR_REF: a.valor, IV_DEL_FLAG: 'X' });
  const excecao = xmlField(xml, 'EV_EXCEPTION') || '';
  const aindaLa = (await lerAtributos(cfg, n)).some((x) => x.atributo === a.atributo);
  return { ok: !excecao && !aindaLa, excecao, mensagem: xmlField(xml, 'ES_MSG') || '', confirmadoAusente: !aindaLa };
}

/**
 * Insere objetos JÁ PRONTOS numa ordem modificável — `TR_EXT_INSERT_IN_REQUEST` (FMODE='R', SOAP
 * puro, sem sessão ADT): o "Incluir objetos" da SE01 sem GUI. É a outra metade do pipeline do item
 * 74: com ela a TR de entrega se monta a partir de uma LISTA (o objeto já existe e está ativo) e se
 * libera — sem o deploy com `corrNr`, que era a única via da lib para pôr objeto em TR.
 *
 * Medido 2026-09-02 (S4H 758, mandante 250 — POC do item 75):
 *   • a entrada cai na E071 da ORDEM (`iv_append_at_order = 'X'` no fonte), sem criar tarefa;
 *   • NÃO TRAVA o objeto: LOCKFLAG fica VAZIO — o deploy com `corrNr` é que trava (`'X'`). Por
 *     isso o mesmo objeto pôde entrar em DUAS ordens sem colisão, e a hipótese da I64 ("conferir
 *     LOCKFLAG='X'") caiu;
 *   • duplicado na MESMA ordem é deduplicado em silêncio (sem erro, E071 continua com 1 linha);
 *   • objeto sem TADIR é recusado limpo ("requires a directory entry" — o FM valida existência);
 *   • TAREFA e tipo fora de K/T/W o FM recusa (TR 054 "Only types K, T or W"); liberada idem
 *     ("already released") — mas a recusa daqui vem antes, com mensagem em contexto;
 *   • dono alheio o FM ACEITA (`iv_no_owner_check = 'X'` quando `as4user <> sy-uname`, só loga no
 *     actionlog) — a recusa é daqui, como no `liberarRequest`.
 *
 * `objetos`: `[{ tipo, nome, pgmid? }]` — `pgmid` default `R3TR` (o único medido). Só objeto Z/Y.
 * O retorno confere a E071 em OUTRA LUW: `ok` = sem exceção E todos os pedidos presentes.
 */
export async function inserirObjetosNaRequest(cfg, numero, objetos = []) {
  const n = assertTrkorr(numero);
  const lista = (Array.isArray(objetos) ? objetos : [objetos]).map((o, i) => {
    const tipo = String(o?.tipo ?? '').toUpperCase().trim();
    const nome = String(o?.nome ?? '').toUpperCase().trim();
    if (!tipo || !nome) throw new Error(`GUARD-RAIL: inserirObjetosNaRequest: objetos[${i}] precisa de { tipo, nome } (pgmid default R3TR).`);
    assertZY(nome);
    return { PGMID: String(o?.pgmid ?? 'R3TR').toUpperCase().trim(), OBJECT: tipo, OBJ_NAME: nome };
  });
  if (!lista.length) throw new Error('GUARD-RAIL: inserirObjetosNaRequest: a lista de objetos está vazia.');
  const cab = await assertMinhaModificavel(cfg, n, 'inserirObjetosNaRequest');
  if (cab.STRKORR) throw new Error(`inserirObjetosNaRequest: ${n} é TAREFA (da ordem ${cab.STRKORR}) — o FM insere na E071 da ORDEM (iv_append_at_order); passe a ordem.`);
  passo(`cts: inserir ${lista.length} objeto(s) em ${n} por RFC`);
  const { xml } = await callFunction(cfg, 'TR_EXT_INSERT_IN_REQUEST', { IV_REQ_ID: n, IT_OBJECTS: lista });
  const excecao = xmlField(xml, 'EV_EXCEPTION') || '';
  const mensagem = xmlField(xml, 'ES_MSG') || '';
  if (excecao) {
    detalhe(`inserir em ${n}: ${excecao} — ${mensagem}`);
    return { ok: false, numero: n, excecao, mensagem, entradas: [], faltando: lista };
  }
  // assert em outra LUW: cada objeto pedido tem linha na E071 da ordem
  const e071 = await readTable(cfg, 'E071', { campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'LOCKFLAG'], where: [`TRKORR = '${n}'`], linhas: 999 });
  const acha = (o) => e071.find((l) => l.PGMID === o.PGMID && l.OBJECT === o.OBJECT && l.OBJ_NAME === o.OBJ_NAME);
  const faltando = lista.filter((o) => !acha(o));
  const entradas = lista.map((o) => acha(o)).filter(Boolean);
  detalhe(`inserir em ${n}: ${entradas.length}/${lista.length} confirmado(s) na E071`);
  return { ok: faltando.length === 0, numero: n, excecao, mensagem, entradas, faltando };
}

// ---------- leitura por SOAP PURO (item 71 — medido 2026-09-02, S4H 758, mandante 250) ----------
//
// O motivo: o ADT stateful do s4h caiu três vezes só neste mês, e TODA leitura de TR da lib exigia
// sessão ADT (`lerRequest`/`listarRequests`) ou uma salva de readTable (`lerRequestPorTabelas`,
// 5-6 chamadas por TR). Os dois FMs abaixo são FMODE='R' — leitura de TR sem sessão nenhuma:
//
//   TR_READ_COMM (SAPLSTRI)                  UMA ordem/tarefa: E070 + E07T + E070C + E071 + E071K +
//                                            E070A numa chamada só
//   TR_EXT_GET_REQUESTS (SAPLTRWB_REQUESTS)  a LISTAGEM — e mais que fallback: com status 'R' ela
//                                            lista as LIBERADAS (123 no s4h), que a árvore ADT NÃO
//                                            serve (`requestStatus=R` devolve vazio — item 24)
//
// ⚠ O GOTCHA DO CANAL, medido com contra-prova dupla: parâmetro TABLES que NÃO vai no envelope
//   SOAP não volta na resposta — o FM roda, preenche, e o resultado é 0 linhas SEM ERRO. As mesmas
//   9 TRs: com `<ET_REQUESTS></ET_REQUESTS>` no request, 9; sem, 0. Idem ET_E070A: o SAPCORR da
//   S4HK912799 só aparece com a tabela no envelope. Toda chamada daqui manda as tabelas vazias.
// ⚠ WI_DIALOG default é 'X' — daqui vai sempre ' ' (canal sem GUI).
// ⚠ IV_REQ_STATUS NÃO é TRSTATUS: o fonte valida `NA 'ACR'` — 'A' todas, 'C' modificáveis,
//   'R' liberadas; 'D' → CALL_FUNCTION_ERROR "Invalid value for parameter IV_REQ_STATUS".
// ⚠ TR inexistente no TR_READ_COMM → SOAP Fault NOT_EXIST_E070 (exceção limpa, não silêncio).
// ⚠ WE_E07T é UMA linha (WI_LANGU); a via tabelas traz todas. E o canal SOAP serializa DATS/TIMS
//   com separadores ('2026-08-28', '23:33:10') — o readTable devolve cru ('20260828').
//
// O que a via RFC NÃO traz (a hipótese da I65, confirmada campo a campo contra o `parseRequest`):
// `wbtype`, `obj_info` e `status_text` são enriquecimento do ADT; e a CONSOLIDAÇÃO ordem+tarefas é
// da lib (o FM lê UMA ordem por vez — as tarefas saem da E070.STRKORR, uma chamada cada). Fora
// isso, cabeçalho, descrição, objetos (E071 crua, com LOCKFLAG), chaves (E071K/TABKEY — que o ADT
// nem enxerga) e atributos vêm inteiros. Por isso as funções são via própria, não troca silenciosa
// do `lerRequest`: quem precisa do texto do tipo continua no ADT.

const STATUS_LISTAGEM_RFC = { A: 'todas', C: 'modificáveis', R: 'liberadas' };

/** Linha do ET_REQUESTS (TREXREQHD) → o cabeçalho como a lib fala. Puro. */
export function requestDaListagemRfc(l = {}) {
  return {
    numero: l.REQ_ID ?? '', descricao: l.TEXT ?? '', tipo: l.TYPE ?? '', status: l.STATUS ?? '',
    alvo: l.TARGET ?? '', dono: l.AUTHOR ?? '', mandanteOrigem: l.SRC_CLIENT ?? '',
    alteradoEm: `${l.CHANGEDATE ?? ''} ${l.CHANGETIME ?? ''}`.trim(),
  };
}

/**
 * Lista requests por `TR_EXT_GET_REQUESTS` — SOAP puro, sem sessão ADT. `status`: 'C' modificáveis
 * (default do FM), 'R' liberadas, 'A' todas; `autor` vazio = de todo mundo. O FM filtra o TIPO com
 * igualdade estrita no fim (`WHERE trfunction = iv_req_type`) — tipo 'K' não traz 'W' nem 'T'.
 *
 * `comTarefasDoAutor: true` inclui as ordens de OUTROS donos onde o autor tem tarefa
 * (`IV_ALL_REQ_AND_ALL_OWN_TASK`) — é EXATAMENTE a lista da árvore ADT (medido: 10×10 com os
 * mesmos números; o default devolve só as ordens do autor, 9). A variante `IV_ALL_REQ_WITH_OWN_TASK`
 * do FM ficou de fora: ela PERDE as ordens do autor sem tarefa própria (medido: 8 de 10).
 */
export async function listarRequestsPorRfc(cfg, { autor = '', status = 'C', tipo = 'K', atributo, valor, comTarefasDoAutor = false } = {}) {
  const st = String(status).toUpperCase();
  if (!STATUS_LISTAGEM_RFC[st]) {
    throw new Error(`GUARD-RAIL: listarRequestsPorRfc: status '${status}' — o FM só aceita 'C' (modificáveis), 'R' (liberadas) e 'A' (todas); TRSTATUS da E070 ('D' etc.) é outro vocabulário e dá CALL_FUNCTION_ERROR (medido).`);
  }
  const t = assertTipoTr(tipo, 'listarRequestsPorRfc');
  passo(`cts: listar ${STATUS_LISTAGEM_RFC[st]} por RFC${autor ? ` de ${String(autor).toUpperCase()}` : ''}`);
  const { xml } = await callFunction(cfg, 'TR_EXT_GET_REQUESTS', {
    IV_AUTHOR: String(autor ?? '').toUpperCase(), IV_REQ_STATUS: st, IV_REQ_TYPE: t,
    ...(atributo ? { IV_REQ_ATTR: String(atributo).toUpperCase(), IV_ATTR_REF: String(valor ?? '') } : {}),
    ...(comTarefasDoAutor ? { IV_ALL_REQ_AND_ALL_OWN_TASK: 'X' } : {}),
    ET_REQUESTS: [],   // sem a tabela no envelope a resposta vem VAZIA sem erro (o gotcha do canal)
  });
  const excecao = xmlField(xml, 'EV_EXCEPTION') || '';
  if (excecao) throw new Error(`cts: TR_EXT_GET_REQUESTS falhou (${excecao}): ${xmlField(xml, 'ES_MSG') || ''}`);
  const requests = xmlItems(xml, 'ET_REQUESTS').map(requestDaListagemRfc);
  detalhe(`listagem RFC: ${requests.length} request(s)`);
  return requests;
}

/** Resposta do TR_READ_COMM → o corpo de UMA ordem/tarefa, no shape da via tabelas. Puro. */
export function parseTrReadComm(xml) {
  const cabecalho = xmlStruct(xml, 'WE_E070');
  return {
    numero: cabecalho.TRKORR ?? '',
    cabecalho,
    descricao: xmlStruct(xml, 'WE_E07T').AS4TEXT ?? '',
    mandante: xmlStruct(xml, 'WE_E070C'),
    objetos: xmlItems(xml, 'WT_E071'),
    chaves: xmlItems(xml, 'WT_E071K'),
    atributos: xmlItems(xml, 'ET_E070A').map((l) => ({ posicao: l.POS, atributo: l.ATTRIBUTE, valor: l.REFERENCE })),
  };
}

async function lerUmaPorRfc(cfg, numero, { chaves }) {
  const { xml } = await callFunction(cfg, 'TR_READ_COMM', {
    WI_TRKORR: numero, WI_DIALOG: ' ',
    WI_SEL_E070: 'X', WI_SEL_E07T: 'X', WI_SEL_E070C: 'X', WI_SEL_E071: 'X',
    ...(chaves ? { WI_SEL_E071K: 'X' } : {}), IV_SEL_E070A: 'X',
    WT_E071: [], WT_E071K: [], ET_E070A: [],   // tabelas SEMPRE no envelope (o gotcha do canal)
  });
  return parseTrReadComm(xml);
}

/**
 * A TR por `TR_READ_COMM` — SOAP puro, sem sessão ADT: o plano B de leitura quando o ADT está fora
 * (o que já aconteceu e custou uma sessão inteira). Mesmo shape do `lerRequestPorTabelas`
 * (cabeçalho + descrição + objetos + chaves + tarefas + consolidado), mais `atributos` (E070A) de
 * brinde — e uma chamada por ordem/tarefa em vez de 5-6 readTable.
 */
export async function lerRequestPorRfc(cfg, trkorr, { chaves = true, tarefas = true, fatiar = false } = {}) {
  const numero = String(trkorr).toUpperCase();
  passo(`cts: ler ${numero} por RFC`);
  let req;
  try {
    req = await lerUmaPorRfc(cfg, numero, { chaves });
  } catch (e) {
    if (/NOT_EXIST_E070/.test(e.message)) throw new Error(`cts: ${numero} não existe na E070 deste sistema (TR_READ_COMM: NOT_EXIST_E070)`);
    throw e;
  }
  req.tarefas = [];
  if (tarefas) {
    const filhas = await readTable(cfg, 'E070', { campos: ['TRKORR'], where: [`STRKORR = '${numero}'`], linhas: 100 });
    for (const f of filhas) req.tarefas.push(await lerUmaPorRfc(cfg, f.TRKORR, { chaves }));
  }
  req.consolidado = consolidar([req, ...req.tarefas]);
  if (fatiar && chaves) req.consolidado.chaves = await fatiarChaves(cfg, req.consolidado.chaves);
  detalhe(`${numero} por RFC: ${req.consolidado.objetos.length} objeto(s), `
    + `${req.consolidado.chaves.length} chave(s), ${req.tarefas.length} tarefa(s)`);
  return req;
}

// ---------- projeto CTS (a coluna da SE09 que a via ADT preenche mas não cria) ----------

const CTSPROJECT_CAMPOS = ['TRKORR', 'EXTERNALPS', 'EXTERNALID', 'SRCSYSTEM', 'SRCCLIENT', 'DESCRIPTN'];
const projetoDaLinha = (l) => ({
  numero: l.TRKORR, sistema: l.EXTERNALPS, id: l.EXTERNALID,
  sistemaOrigem: l.SRCSYSTEM, mandanteOrigem: l.SRCCLIENT, descricao: l.DESCRIPTN,
});

/** Os "external project systems" cadastrados (CTS_EXT_PS) — sem um deles não há projeto. */
export const sistemasDeProjeto = (cfg) =>
  readTable(cfg, 'CTS_EXT_PS', { campos: ['EXTERNALPS'], linhas: 50 }).then((r) => r.map((l) => l.EXTERNALPS)).catch(() => []);

/** Os projetos CTS deste sistema (CTSPROJECT). */
export const listarProjetos = (cfg) =>
  readTable(cfg, 'CTSPROJECT', { campos: CTSPROJECT_CAMPOS, linhas: 200 }).then((r) => r.map(projetoDaLinha)).catch(() => []);

/**
 * Cria o projeto CTS por `TR_RFC_CREATE_PROJECT` (RFC — SOAP puro).
 * O projeto NASCE como uma entrada da E070 de tipo 'G' ("Generated Project Piece List"), com
 * número próprio (`S4H_P00002`), e é ESSE número que vai para a TR como `SAP_CTS_PROJECT`.
 * `sistema` (o external project system) é obrigatório e tem de existir — ver `sistemasDeProjeto`.
 */
export async function criarProjeto(cfg, { sistema, id, descricao } = {}) {
  for (const [k, v] of [['sistema', sistema], ['id', id], ['descricao', descricao]]) {
    if (!String(v ?? '').trim()) throw new Error(`GUARD-RAIL: criarProjeto exige \`${k}\` — o FM levanta INVALID_INPUT (TK 697) sem dizer qual faltou.`);
  }
  passo(`cts: criar projeto ${id} em ${sistema}`);
  const { xml } = await callFunction(cfg, 'TR_RFC_CREATE_PROJECT', {
    IV_EXTERNALPS: String(sistema).toUpperCase(), IV_EXTERNALID: String(id).toUpperCase(), IV_DESCRIPTION: descricao,
  });
  const numero = xmlField(xml, 'EV_TRKORR') || '';
  if (!numero) throw new Error(`cts: TR_RFC_CREATE_PROJECT não devolveu EV_TRKORR: ${xml.slice(0, 300)}`);
  detalhe(`projeto criado: ${numero}`);
  return { numero, sistema: String(sistema).toUpperCase(), id: String(id).toUpperCase(), descricao };
}

/** Lê o projeto pelo número (`TR_RFC_READ_PROJECT`, RFC). */
export async function lerProjeto(cfg, numero) {
  const { xml } = await callFunction(cfg, 'TR_RFC_READ_PROJECT', { IV_TRKORR_P: String(numero).toUpperCase() });
  const bloco = xml.match(/<ES_PROJECT>([\s\S]*?)<\/ES_PROJECT>/)?.[1] ?? '';
  const campo = (t) => bloco.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '';
  return {
    numero: campo('TRKORR'), sistema: campo('EXTERNALPS'), sistemaTexto: campo('PS_TEXT'),
    id: campo('EXTERNALID'), sistemaOrigem: campo('SRCSYSTEM'), mandanteOrigem: campo('SRCCLIENT'),
    descricao: campo('DESCRIPTN'), status: campo('TRSTATUS'), dono: campo('AS4USER'),
  };
}

/** Apaga o projeto CTS (`TR_RFC_DELETE_PROJECT`, RFC). Recusa se houver request presa nele. */
export async function apagarProjeto(cfg, { sistema, id, confirm = false } = {}) {
  if (confirm !== true) throw new Error(`GUARD-RAIL: apagarProjeto exige confirm:true (remoção de ${id} é irreversível).`);
  passo(`cts: apagar projeto ${id}`);
  await callFunction(cfg, 'TR_RFC_DELETE_PROJECT', { IV_EXTERNALPS: String(sistema).toUpperCase(), IV_EXTERNALID: String(id).toUpperCase() });
  const resta = (await listarProjetos(cfg)).filter((p) => p.id === String(id).toUpperCase() && p.sistema === String(sistema).toUpperCase());
  return { ok: resta.length === 0, confirmadoAusente: resta.length === 0 };
}
