// icm.mjs — o HTTP server cache do ICM: ler as entradas, invalidar uma URL, diagnosticar recurso
// que volta VAZIO. É a cura de um modo de falha que não dá erro nenhum — o servidor responde
// 200 com Content-Length 0 e o navegador segue como se tivesse carregado.
//
// POR QUE EXISTE (medido no S4H 758/250 em 05/09/2026 — POC_icm_static_cache, fila adt-client #67):
// o GET de `/sap/public/bc/ui5_ui5/resources/sap-ui-core.js` voltava 200 com CORPO VAZIO em toda
// requisição, e a página UI5 ficava sem `window.sap` — sem erro, sem status ruim, o `onload` do
// script dispara igual. O que a medição mostrou:
//
//   • A CHAVE do cache do ICM inclui o CONTENT-ENCODING: as entradas aparecem como
//     `<path>&&&GZ=<enc>&<mandante>&<hash da query>&`, com `GZ=0` identity, `GZ=1` gzip, `GZ=B` br.
//     Só a variante `GZ=1` da URL estava envenenada — `identity` e `br` da MESMA URL vinham
//     completas (774.788 bytes), e nenhum outro recurso do mesmo diretório (inclusive
//     library-preload.js de 3 MB) tinha o problema. Não é tamanho, não é o handler, não é o navegador.
//   • NÃO SE DIAGNOSTICA PELA LISTAGEM — só pelo GET. Medido em 06/09/2026 (item 107):
//     `get_cache_entries()` devolveu 9.952 linhas em duas medições distintas enquanto o contador
//     real (`CENTRIES` de `get_cache_statistics()`) ia de 6.336 a 6.204 — 9.952 é teto da API,
//     não a contagem. E entradas recém-invalidadas seguem listadas, com o mesmo `crea_time`.
//     Por isso a entrada envenenada "não aparecia": a lista mente, não é que a entrada fosse
//     especial. Quem responde a verdade é o GET — é o que `medirRecurso` faz.
//   • CONTRA-PROVA: depois de `ICM_CACHE_INVALIDATE_ONE` na URL, o MESMO GET gzip voltou com
//     774.788 bytes. É o cache do ICM, e a invalidação é a cura.
//   • A resposta boa carrega o header `sap-isc-etag`; a vazia não carrega nenhum ETag.
//   • O GATILHO (o que envenena) NÃO foi reproduzido: download abortado no meio, 10 GETs gzip
//     concorrentes e mistura de encodings em paralelo, todos partindo do cache limpo, não
//     produziram entrada vazia. Segue aberto — ver fila adt-client.
//   • Duas hipóteses a mais caíram em 06/09/2026 (item 107), por contador:
//     — CACHE CHEIO / EVICTION: `NOSWAPS = 0` num cache com 45 dias de entradas vivas (do
//       `crea_time` mais antigo ao mais novo), `CENTRIES` 6.204 de 10.000 e `CUSED` 179 MB de
//       419 MB. O ICM nunca evictou nada — o veneno não veio de eviction.
//     — LIMITE DE MEMÓRIA POR ENTRADA: a maior entrada do cache tem 3.069.030 bytes
//       (`sap/m/library-preload.js` GZ=0) e está íntegra — 14× a entrada envenenada de 213 KB.
//     Sobra a gravação interrompida do lado do SERVIDOR (os testes anteriores abortaram do lado
//     do CLIENTE), que precisa de um handler ICF controlado para ser medida.
//   • Duplicata na MESMA chave é NORMAL, não é sintoma: 1.159 chaves duplicadas no cache, 265
//     delas com `dsize` divergente entre as cópias. O "único sinal próximo" do item 67 (duas
//     entradas GZ=1 com a mesma chave) não era sinal de nada.
//
// ⚠️ Carimbar a URL com `?jbv=<timestamp>` também restaura, mas NÃO é a defesa: cada carimbo
// distinto cria uma ENTRADA NOVA no cache do ICM (medidas 8 entradas de ~213 KB, expiração de
// 7 dias, uma por timestamp). O cache medido NÃO estava cheio (`CENTRIES` 6.204 de 10.000 — o
// "9.952 de 10.000" do item 67 era o teto da API lido como contagem), mas o carimbo segue não
// sendo a defesa: ele não CURA a entrada ruim, só desvia dela, e deixa lixo de 7 dias para trás
// a cada carga de página. Curar > disfarçar.

import { deployAndRun } from './classrun.mjs';
import { deleteObject } from './adt-client.mjs';
import { passo, detalhe } from './log.mjs';

const esc = (v) => String(v ?? '').replace(/'/g, "''");

/** Os encodings como o ICM os escreve na chave da entrada. */
export const ENCODING_DA_CHAVE = { 0: 'identity', 1: 'gzip', B: 'br' };

/** Os `accept-encoding` que `medirRecurso` testa — um por variante de chave do cache. */
export const ENCODINGS_MEDIDOS = ['gzip', 'identity', 'br'];

// ---------- partes puras ----------

/**
 * PURO: driver que lista as entradas do cache cujo nome contém `filtro` (vazio = todas).
 * `CL_ICM_API->get_cache_entries()` por baixo (o mesmo que a SMICM mostra em HTTP Server Cache).
 */
export function buildLerCacheSource(driver, filtro = '') {
  const onde = filtro ? ` WHERE name CS '${esc(filtro)}'` : '';
  return `CLASS ${driver.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${driver.toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA(entries) = NEW cl_icm_api( )->get_cache_entries( ).
    out->write( |TOTAL { lines( entries ) }| ).
    LOOP AT entries INTO DATA(e)${onde}.
      out->write( |ENTRADA dsize={ e-dsize } exp={ e-exp_time } crea={ e-crea_time } acc={ e-last_acc } name={ e-name }| ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * PURO: driver que invalida as entradas de cada URL e depois relista o que sobrou.
 * `coption` é opaco (parâmetro do kernel): as duas variantes medidas (0 e 1) foram disparadas
 * juntas na contra-prova, e não dá para dizer qual delas surtiu efeito — por isso as duas ficam.
 * `global: true` propaga para os outros servidores de aplicação (RFC assíncrona); default é local.
 */
export function buildInvalidarCacheSource(driver, urls, { global = false } = {}) {
  const g = global ? 1 : 0;
  const chamadas = urls.map((url) => [0, 1].map((coption) => `    CALL FUNCTION 'ICM_CACHE_INVALIDATE_ONE'
      EXPORTING name = '${esc(url)}' coption = ${coption} global = ${g}
      EXCEPTIONS icm_op_failed = 1 icm_get_serv_failed = 2 icm_no_http_service = 3
                 icm_not_authorized = 4 OTHERS = 5.
    out->write( |INVAL url=${esc(url)} coption=${coption} subrc={ sy-subrc }| ).`).join('\n')).join('\n');
  const listagens = urls.map((url, i) => `    LOOP AT entries INTO DATA(e_${i}) WHERE name CS '${esc(url)}'.
      out->write( |ENTRADA dsize={ e_${i}-dsize } exp={ e_${i}-exp_time } crea={ e_${i}-crea_time } acc={ e_${i}-last_acc } name={ e_${i}-name }| ).
    ENDLOOP.`).join('\n');
  return `CLASS ${driver.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${driver.toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
${chamadas}
    DATA(entries) = NEW cl_icm_api( )->get_cache_entries( ).
    out->write( |TOTAL { lines( entries ) }| ).
${listagens}
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * PURO: as linhas `ENTRADA …`/`INVAL …` do driver viram objetos.
 * O `out->write` escapa os `&` da chave como `&amp;` — desescapar aqui é o que faz `url` e
 * `encoding` saírem legíveis (foi o que confundiu a leitura crua na POC).
 */
export function parseCacheOutput(saida) {
  const txt = String(saida ?? '').replace(/&amp;/g, '&');
  const total = txt.match(/^TOTAL (\d+)/m);
  const entradas = [...txt.matchAll(/^ENTRADA dsize=(-?\d+) exp=(-?\d+) crea=(-?\d+) acc=(-?\d+) name=(.*)$/gm)]
    .map((m) => {
      const chave = m[5].trim();
      const gz = chave.match(/&GZ=([^&]*)&/);
      return {
        dsize: Number(m[1]), expiraEm: Number(m[2]), criadaEm: Number(m[3]), acessadaEm: Number(m[4]),
        chave,
        url: chave.split('&')[0],
        encoding: ENCODING_DA_CHAVE[gz?.[1]] ?? (gz ? gz[1] : null),
      };
    });
  const invalidacoes = [...txt.matchAll(/^INVAL url=(\S+) coption=(\d+) subrc=(\d+)$/gm)]
    .map((m) => ({ url: m[1], coption: Number(m[2]), subrc: Number(m[3]) }));
  return {
    total: total ? Number(total[1]) : null,
    entradas,
    invalidacoes,
    ok: invalidacoes.length === 0 || invalidacoes.every((i) => i.subrc === 0),
  };
}

/**
 * PURO: o veredito sobre um recurso, a partir das respostas por encoding.
 * Envenenado = alguma variante devolve 200 com corpo VAZIO enquanto outra devolve corpo.
 * (200 com 0 byte sozinho não basta: há recursos legitimamente vazios.)
 */
export function diagnosticar(respostas) {
  const vivas = respostas.filter((r) => r.status === 200);
  const vazias = vivas.filter((r) => r.bytes === 0).map((r) => r.encoding);
  const cheias = vivas.filter((r) => r.bytes > 0);
  return {
    envenenado: vazias.length > 0 && cheias.length > 0,
    encodingsVazios: vazias,
    tamanho: cheias.length ? Math.max(...cheias.map((r) => r.bytes)) : 0,
    respostas,
  };
}

// ---------- com rede ----------

/**
 * Pede o recurso uma vez por `accept-encoding` e diz se ele está envenenado no cache.
 * Não usa sessão ADT: é HTTP puro contra o ICM (o recurso pode até ser público).
 */
export async function medirRecurso(cfg, url, { encodings = ENCODINGS_MEDIDOS } = {}) {
  const base = String(cfg?.base ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('medirRecurso: cfg sem `base` (a URL do ICM).');
  const respostas = [];
  for (const encoding of encodings) {
    const r = await fetch(base + url, { headers: { 'accept-encoding': encoding }, redirect: 'manual' });
    const buf = Buffer.from(await r.arrayBuffer());
    respostas.push({
      encoding, status: r.status, bytes: buf.length,
      contentLength: r.headers.get('content-length'),
      contentEncoding: r.headers.get('content-encoding'),
      iscEtag: r.headers.get('sap-isc-etag'),
    });
  }
  const d = diagnosticar(respostas);
  detalhe(`icm: ${url} → ${respostas.map((r) => `${r.encoding}=${r.status}/${r.bytes}`).join(' ')}${d.envenenado ? ' ⚠️ VAZIO no cache' : ''}`);
  return { url, ...d };
}

/** Lista as entradas do cache do ICM (filtro = trecho do nome). Só leitura. */
export async function lerCacheEstatico(conexao, { filtro = '', driver = 'Y_ICMCACHE_R', keepDriver = false } = {}) {
  passo(`icm: lendo o cache${filtro ? ` (filtro "${filtro}")` : ''}`);
  const source = buildLerCacheSource(driver, filtro);
  try {
    const r = await deployAndRun(conexao, { name: driver, source, description: 'lê o HTTP server cache do ICM' });
    return { ...parseCacheOutput(r.saida), saida: r.saida, erro: r.erro ?? null };
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
}

/**
 * Invalida no cache do ICM as entradas de uma ou mais URLs (todas as variantes de encoding).
 * O que se perde: essas entradas voltam a ser buscadas do backend na próxima requisição — custo
 * de latência, nenhum dado. `global: true` propaga para os demais servidores de aplicação.
 */
export async function invalidarCacheEstatico(conexao, { urls, global = false, driver = 'Y_ICMCACHE_I', keepDriver = false }) {
  const lista = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!lista.length) throw new Error('invalidarCacheEstatico: informe ao menos uma URL (o caminho, sem host).');
  passo(`icm: invalidando ${lista.length} URL(s) no cache${global ? ' (global)' : ''}`);
  const source = buildInvalidarCacheSource(driver, lista, { global });
  try {
    const r = await deployAndRun(conexao, { name: driver, source, description: 'invalida entrada do cache do ICM' });
    return { ...parseCacheOutput(r.saida), saida: r.saida, erro: r.erro ?? null };
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
}

/**
 * Mede o recurso; se estiver vazio no cache, invalida e mede de novo. Devolve o que aconteceu —
 * `{ curado, antes, depois }` — e não toca em nada quando o recurso está saudável.
 *
 * É a defesa recomendada para dirigir app UI5: chamar isto UMA vez sobre os recursos que a página
 * precisa, em vez de carimbar `?ts=` em toda URL (o carimbo entope o cache do ICM — ver cabeçalho).
 */
export async function curarRecursoVazio(conexao, url, { encodings = ENCODINGS_MEDIDOS, global = false } = {}) {
  const antes = await medirRecurso(conexao.cfg, url, { encodings });
  if (!antes.envenenado) return { curado: false, motivo: 'recurso saudável — nada a fazer', antes, depois: null };
  passo(`icm: ${url} está vazio no cache (${antes.encodingsVazios.join(', ')}) — invalidando`);
  const inval = await invalidarCacheEstatico(conexao, { urls: [url], global });
  const depois = await medirRecurso(conexao.cfg, url, { encodings });
  return { curado: !depois.envenenado, antes, depois, invalidacao: inval };
}
