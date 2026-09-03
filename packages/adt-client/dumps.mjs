// dumps.mjs — o assert "não dumpou": ler a ST22 depois do act, por usuário e janela.
//
// Um dump (ABAP runtime error) NÃO chega ao chamador na maioria dos canais do arsenal. Ele fica na
// ST22 — tabela `SNAP` — e o canal responde qualquer coisa: 500 mudo, ou 200 feliz. Por isso um E2E
// "verde" pode estar escondendo um dump, e por isso este módulo existe.
//
// ---------------------------------------------------------------------------------------------
// O QUE CADA CANAL MOSTRA QUANDO O CÓDIGO DUMPA (medido 2026-08-31, S4H 758, mandante 250)
//
//   | canal                                   | o que o chamador vê            | dump na SNAP |
//   |-----------------------------------------|--------------------------------|--------------|
//   | classrun, dump direto                   | HTTP 500 + HTML genérico       | sim          |
//   | classrun, `SUBMIT` (o 500 do item 7)    | HTTP 500 + HTML genérico       | sim          |
//   | `CALL FUNCTION … STARTING NEW TASK`     | **HTTP 200, saída normal**     | sim          |
//
// O HTML do 500 é a página "Application Server Error" do ICM — 10 KB que não dizem NADA sobre o
// erro (nem o nome, nem o programa). A terceira linha é a pior: o driver termina, escreve no
// console, o classrun devolve 200 e o teste passa — com um dump no sistema.
//
// ---------------------------------------------------------------------------------------------
// DUAS VIAS, E SÓ UMA SERVE DE ASSERT — ⚠ O FEED DO ADT PERDE DUMPS
//
//   • SNAP por `dataPreview` — **imediata e completa**. Medido: o dump estava lá na PRIMEIRA
//     leitura, 992 ms depois do act.
//   • feed ADT `/sap/bc/adt/runtime/dumps` — o que o Eclipse mostra, e **não é a ST22**.
//
// Medido no s4h em 2026-08-31, mesmo dia e mesmo mandante: a SNAP tinha **10** dumps, o feed
// mostrava **6**. Os quatro ausentes eram meus, criados minutos antes — dois deles seguiam fora
// **7 minutos** depois (`from=<hoje>000000`, o feed dizendo-se `updated` naquele instante). E não
// é só atraso: um dump das 13:16:27 está ausente enquanto o das 13:16:31 é listado, e o `self` do
// feed declara `from=…111631` — ele congelou num ponto e ignorou o que veio depois. Na primeira
// medição do dia um dump levou ~4 min para entrar; noutra entrou em 11 s. **Causa não isolada.**
//
// Consequência prática: um assert lido pelo feed dá VERDE FALSO — silencioso, e sem padrão que dê
// para contornar com espera. `semDump` lê a SNAP; `feed()` existe para panorama, com este aviso.
// Um dump fora do feed continua legível por `lerDump` (a chave vem da SNAP) — medido.
//
// ---------------------------------------------------------------------------------------------
// A JANELA É HORA DO SERVIDOR — NUNCA O RELÓGIO LOCAL
//
// A SNAP grava `DATUM`/`UZEIT` na hora do SO do app server. O s4h roda em BRT (medido: dump criado
// às 16:07:34Z ficou gravado como 130734) enquanto a `TTZCU` declara `CET` — e o recurso ADT
// converte pela TTZCU, de modo que o `datetime` do feed e do `<dump:dump>` sai **5 h errado**
// (`systemTime="13:07:34"` vira `datetime="2026-08-31T11:07:34Z"`). Fato do sistema, não da lib.
//
// Por isso a marca d'água NÃO vem do relógio de ninguém: é o `MAX(DATUM||UZEIT)` da própria SNAP,
// lido imediatamente antes do act. Compara-se a SNAP com ela mesma, e nenhum fuso entra na conta.
//
// ---------------------------------------------------------------------------------------------
// O CABEÇALHO DO DUMP MORA NO `FLIST` (e é decodificável sem ler o dump inteiro)
//
// A linha `SEQNO = '000'` da SNAP é o cabeçalho; os campos `FLIST`…`FLIST08` são um fluxo de
// `TAG(2) + LEN(3) + valor`, com os que interessam logo no começo (medido):
//
//   FC = erro (`COMPUTE_INT_ZERODIVIDE`) · AP = programa terminado · AI = include ·
//   AL = linha · XC = classe de exceção (`CX_SY_ZERODIVIDE`)
//
// Conferido contra o `<dump:dump>` do recurso ADT (`error`/`exception`/`terminatedProgram`): as
// duas vias concordam. Ler o FLIST é uma consulta; ler o dump é uma requisição por dump.

import { call } from './sap-connection.mjs';
import { dataPreview } from './adt-client.mjs';
import { passo, detalhe } from './log.mjs';

const ACCEPT_FEED = 'application/atom+xml;type=feed';
const ACCEPT_DUMP = 'application/*';
export const RAIZ_DUMP = '/sap/bc/adt/runtime/dump';

// ---------- puros (testáveis sem SAP) ----------

/**
 * Decodifica o `FLIST` do cabeçalho da SNAP: `TAG(2) + LEN(3) + valor`, repetido.
 * Devolve `{ FC, AP, AI, AL, XC, … }` — o primeiro valor de cada tag (o que vale é o topo da pilha).
 */
export function parseFlist(flist) {
  const s = String(flist ?? '');
  const out = {};
  let i = 0;
  while (i + 5 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 5));
    // Tag fora do alfabeto ou comprimento não numérico = fim útil do fluxo (o resto é o stack C).
    if (!/^[A-Z0-9]{2}$/.test(tag) || !Number.isInteger(len)) break;
    const valor = s.slice(i + 5, i + 5 + len);
    if (!(tag in out)) out[tag] = valor;
    i += 5 + len;
  }
  return out;
}

/** A chave do dump no recurso ADT: DATUM+UZEIT + AHOST(32) + UNAME(12) + MANDT(3) + MODNO à direita em 9. */
export function chaveDoDump(linha) {
  const pad = (v, n) => String(v ?? '').trim().padEnd(n, ' ');
  return `${String(linha.DATUM ?? linha.data).trim()}${String(linha.UZEIT ?? linha.hora).trim()}` +
    `${pad(linha.AHOST ?? linha.host, 32)}${pad(linha.UNAME ?? linha.usuario, 12)}` +
    `${pad(linha.MANDT ?? linha.mandante, 3)}${String(linha.MODNO ?? linha.modno ?? '').trim().padStart(9, ' ')}`;
}

/** Uma linha da SNAP (SEQNO 000) vira o dump com o cabeçalho já decodificado. */
export function linhaParaDump(r) {
  const f = parseFlist(`${r.FLIST ?? ''}${r.FLIST02 ?? ''}${r.FLIST03 ?? ''}`);
  const data = String(r.DATUM).trim(); const hora = String(r.UZEIT).trim();
  return {
    data, hora,
    quando: `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)} ${hora.slice(0, 2)}:${hora.slice(2, 4)}:${hora.slice(4, 6)}`,
    usuario: String(r.UNAME).trim(),
    mandante: String(r.MANDT ?? '').trim(),
    host: String(r.AHOST ?? '').trim(),
    modno: String(r.MODNO ?? '').trim(),
    erro: f.FC ?? '',
    excecao: f.XC ?? '',
    programa: f.AP ?? '',
    include: f.AI ?? '',
    linha: f.AL ? Number(f.AL) || null : null,
    chave: chaveDoDump(r),
  };
}

/** Uma linha por dump, para log de pipeline ou comentário de ticket. */
export function formatarDumps(dumps) {
  return dumps.map((d) => `  ${d.quando} ${d.usuario} — ${d.erro}${d.excecao ? ` (${d.excecao})` : ''}` +
    ` em ${d.programa}${d.linha ? `, ${d.include}:${d.linha}` : ''}`).join('\n');
}

/** O `<dump:dump>` do recurso ADT — os mesmos campos, pela via oficial. */
export function parseDumpXml(xml) {
  const a = (n) => String(xml).match(new RegExp(`${n}="([^"]*)"`))?.[1] ?? '';
  return {
    erro: a('error'), excecao: a('exception'), programa: a('terminatedProgram'),
    usuario: a('author'), host: a('serverInstance'),
    // `datetime` sai convertido pela TTZCU e pode estar errado (ver o cabeçalho); `systemDate`/
    // `systemTime` são a hora do servidor, a mesma da SNAP — é essa que bate com a janela.
    quando: `${a('systemDate')} ${a('systemTime')}`, datetimeAdt: a('datetime'),
    titulo: a('title'), idioma: a('language'),
  };
}

/** As entries do feed Atom (`atom:` prefixado — sem o prefixo o parse volta vazio). */
export function parseFeed(xml) {
  return [...String(xml).matchAll(/<atom:entry\b[^>]*>([\s\S]*?)<\/atom:entry>/g)].map(([, e]) => {
    const cats = [...e.matchAll(/<atom:category term="([^"]*)"[^>]*\/>/g)].map((m) => m[1]);
    return {
      usuario: (e.match(/<atom:name>([^<]*)</) || [])[1] ?? '',
      erro: cats[0] ?? '', programa: cats[1] ?? '',
      datetimeAdt: (e.match(/<atom:published>([^<]*)</) || [])[1] ?? '',
      chave: decodeURIComponent(((e.match(/<atom:link href="([^"]*)" rel="self"/) || [])[1] ?? '')
        .replace(/^adt:\/\/[^/]+/, '').replace(`${RAIZ_DUMP}/`, '')),
    };
  });
}

// ---------- leitura (stateless: nada fica vivo no servidor) ----------

const SEL = 'datum, uzeit, ahost, uname, mandt, modno, flist, flist02, flist03';

/**
 * A marca d'água: o instante do último dump que JÁ EXISTIA, na hora do servidor.
 *
 * Lida da SNAP inteira (não só do usuário) e imediatamente antes do act — assim nenhum relógio
 * local e nenhum fuso entram na conta. SNAP vazia devolve zeros: aí todo dump é novo, que é o
 * correto.
 */
export async function marcaDagua(conexao) {
  const { rows } = await dataPreview(conexao, 'SELECT MAX( datum ) AS d FROM snap', { rows: 1 });
  const dia = String(rows[0]?.D ?? '').trim();
  if (!dia || dia === '00000000') return '00000000000000';
  const { rows: r2 } = await dataPreview(conexao,
    `SELECT MAX( uzeit ) AS u FROM snap\n  WHERE datum = '${dia}'`, { rows: 1 });
  return dia + String(r2[0]?.U ?? '000000').trim().padStart(6, '0');
}

/**
 * Os dumps posteriores à marca d'água.
 *
 * @param {string}  marca      de `marcaDagua` — `AAAAMMDDHHMMSS` na hora do servidor
 * @param {string}  usuario    default: o usuário do logon. `'*'` traz de todos (o dump de um job
 *                             de background roda com o usuário do step, não com o seu).
 * @param {string}  programa   filtro `LIKE` no programa terminado (ex. `'YJBV_POC%'`)
 * @param {boolean} doMandante filtra pelo mandante da conexão (default true)
 */
export async function dumpsDesde(conexao, marca, { usuario, programa, doMandante = true, limite = 50 } = {}) {
  const m = String(marca ?? '').padEnd(14, '0');
  const dia = m.slice(0, 8); const hora = m.slice(8, 14);
  const quem = usuario === '*' ? null : String(usuario || conexao.cfg.user).toUpperCase();
  const where = [
    "seqno = '000'",
    `( datum > '${dia}' OR ( datum = '${dia}' AND uzeit > '${hora}' ) )`,
    ...(quem ? [`uname = '${quem.replace(/'/g, "''")}'`] : []),
    ...(doMandante && conexao.cfg.client ? [`mandt = '${conexao.cfg.client}'`] : []),
  ];
  const { rows } = await dataPreview(conexao,
    `SELECT ${SEL} FROM snap\n  WHERE ${where.join('\n  AND ')}\n  ORDER BY datum, uzeit`, { rows: limite });
  const lista = rows.map(linhaParaDump);
  return programa
    ? lista.filter((d) => new RegExp(`^${String(programa).toUpperCase().replace(/%/g, '.*')}`).test(d.programa))
    : lista;
}

/**
 * O dump inteiro. `formato`:
 *   `resumo` (default) — o `<dump:dump>`, um objeto com erro/exceção/programa
 *   `texto`            — `/formatted`, o texto que a ST22 mostra
 *   `html`             — a página que o Eclipse embute
 */
export async function lerDump(conexao, alvo, { formato = 'resumo', sessao } = {}) {
  const chave = typeof alvo === 'string' ? alvo : alvo?.chave;
  if (!chave) throw new Error('dumps: sem chave — passe o dump devolvido por `dumpsDesde` ou a chave.');
  const s = sessao ?? (conexao.podeAbrirLogon() ? await conexao.sessaoStateless() : await conexao.sessao());
  const sufixo = formato === 'texto' ? '/formatted' : '';
  const accept = formato === 'texto' ? 'text/plain' : formato === 'html' ? 'text/html' : ACCEPT_DUMP;
  const path = `${RAIZ_DUMP}/${encodeURIComponent(chave)}${sufixo}`;
  const { status, text } = await call(s, { path, accept });
  if (status !== 200) throw new Error(`dumps: leitura do dump falhou (${status}): ${text.slice(0, 300)}`);
  return formato === 'resumo' ? { ...parseDumpXml(text), chave, xml: text } : text;
}

/**
 * O feed que o Eclipse mostra — panorama do sistema, **nunca assert**: ele PERDE dumps, sem padrão
 * e sem aviso (ver o cabeçalho). `desde`/`ate` são `AAAAMMDDHHMMSS` na escala do ADT (a convertida
 * pela TTZCU), não a da SNAP — mais um motivo para não cruzar as duas por tempo, e sim por chave.
 */
export async function feed(conexao, { desde, ate, usuario, sessao } = {}) {
  const q = [desde ? `from=${desde}` : '', ate ? `to=${ate}` : ''].filter(Boolean).join('&');
  const s = sessao ?? (conexao.podeAbrirLogon() ? await conexao.sessaoStateless() : await conexao.sessao());
  const { status, text } = await call(s, { path: `${RAIZ_DUMP}s${q ? `?${q}` : ''}`, accept: ACCEPT_FEED });
  if (status !== 200) throw new Error(`dumps: feed falhou (${status}): ${text.slice(0, 300)}`);
  const lista = parseFeed(text);
  return usuario ? lista.filter((e) => e.usuario === String(usuario).toUpperCase()) : lista;
}

// ---------- o assert ----------

export class ErroDeDump extends Error {
  constructor(dumps, causa) {
    const cab = causa
      ? `${causa.message}\n→ e o act DUMPOU (${dumps.length}):`
      : `o act não falhou, mas DUMPOU (${dumps.length} na ST22) — 200 não é sucesso:`;
    super(`${cab}\n${formatarDumps(dumps)}`);
    this.name = 'ErroDeDump';
    this.dumps = dumps;
    this.causa = causa ?? null;
  }
}

/**
 * Roda o act e reprova se ele deixou dump na ST22.
 *
 * ```js
 * const r = await semDump(conexao, () => runClass(conexao, 'YJBV_POC_CL_X', { novaSessao: true }));
 * ```
 *
 * Duas coisas ao mesmo tempo:
 *   • act que devolve **200 feliz** e dumpou por baixo (`STARTING NEW TASK`, update task, job) →
 *     lança `ErroDeDump`;
 *   • act que **falhou mudo** (o 500 + HTML do classrun) → o erro original sai com o dump anexado,
 *     que é a causa que o HTTP não conta.
 *
 * @param {boolean} opts.lancar  false devolve `{ ok, dumps }` em vez de lançar (default true)
 * @param {string}  opts.usuario ver `dumpsDesde` (default: o do logon)
 */
export async function semDump(conexao, acao, { lancar = true, ...opts } = {}) {
  const marca = await marcaDagua(conexao);
  detalhe(`dumps: marca d'água ${marca} (hora do servidor)`);
  let resultado;
  try {
    resultado = await acao();
  } catch (causa) {
    const dumps = await dumpsDesde(conexao, marca, opts);
    if (!dumps.length) throw causa;
    passo(`dumps: o act falhou E dumpou (${dumps.length}) — a causa está na ST22`);
    throw new ErroDeDump(dumps, causa);
  }
  const dumps = await dumpsDesde(conexao, marca, opts);
  if (dumps.length) {
    passo(`dumps: o act "passou" mas deixou ${dumps.length} dump(s) na ST22`);
    if (lancar) throw new ErroDeDump(dumps, null);
  }
  return { ok: dumps.length === 0, resultado, dumps, marca };
}
