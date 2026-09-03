// atc.mjs — ATC (ABAP Test Cockpit) por ADT REST: rodar a verificação e ler os findings.
//
// É o mesmo gate que o Eclipse aplica no "Run As → ABAP Test Cockpit", pela mesma via REST.
// Só leitura no que importa: o ATC não altera o objeto verificado. O que ele grava é a WORKLIST
// (um resultado com id GUID, do usuário), e é dela que os findings são lidos.
//
// ---------------------------------------------------------------------------------------------
// O CICLO (medido 2026-08-31, S4H 758, mandante 250)
//
//   1. POST /sap/bc/adt/atc/worklists?checkVariant=<V>   → 200, corpo = o worklistId (texto puro)
//   2. POST /sap/bc/adt/atc/runs?worklistId=<id>         → 200, <atcworklist:worklistRun> com
//                                                          FINDING_STATS = "p1,p2,p3"
//   3. GET  /sap/bc/adt/atc/worklists/<id>               → 200, os findings, um <atcobject:object>
//        Accept: application/atc.worklist.v1+xml           por objeto verificado
//
// O passo 2 é SÍNCRONO e não é barato: 5 a 10 s por classe no s4h, ~90 s para um pacote inteiro.
//
// ---------------------------------------------------------------------------------------------
// OS TRÊS VERDES QUE NÃO SÃO SUCESSO (o motivo desta camada existir)
//
// O ATC responde **200 com zero findings** em três situações completamente diferentes, e a REST
// não distingue nenhuma delas por status. Medido no s4h com a mesma classe suja de propósito:
//
//   | situação                        | HTTP | FINDING_STATS | objetos na worklist |
//   |---------------------------------|------|---------------|---------------------|
//   | limpo de verdade                | 200  | 0,0,0         | 1 (com <findings/>) |
//   | variante que NÃO EXISTE          | 200  | 0,0,1 *       | 1                   |
//   | objeto que NÃO EXISTE            | 200  | 0,0,0         | **0**               |
//
//   * a variante inexistente (e a vazia) NÃO dá erro: o ATC cai num conjunto de checks default e
//     devolve o mesmo que a variante `DEFAULT` — 6 findings de prioridade 1 viram zero em silêncio.
//
// Daí os dois guard-rails desta camada, ambos ANTES de chamar "verde":
//   • a variante é conferida contra a SCICHKV_HD antes da rede (o SAP não confere);
//   • `checados === 0` (nenhum objeto na worklist) LANÇA — é o `executed === 0` do ABAP Unit.
//
// ---------------------------------------------------------------------------------------------
// A VARIANTE É A VERIFICAÇÃO INTEIRA
//
// "Rodar o ATC" não quer dizer nada sem dizer QUAL variante. Na mesma classe suja, no mesmo
// sistema, no mesmo minuto (medido):
//
//   ABAP_CLOUD_READINESS   → 6 findings P1     (Open SQL fora do escopo restrito, API não liberada)
//   PERFORMANCE_DB         → ver receita       (SELECT dentro de LOOP)
//   DEFAULT                → 1 finding P3      — e é do AMBIENTE, não do código (ver abaixo)
//   ZATC_PROXY_MIGRATION   → 0                 — e essa é a variante configurada NESTE sistema
//
// A variante do sistema (`customizing().variante`) é a que o Eclipse usa por default. No s4h ela
// está apontando para uma variante de migração de proxy que não pega nada — descobrir isso é
// metade do valor de rodar o ATC por aqui. `variantes()` lista o que o sistema tem de verdade.
//
// FINDING DE AMBIENTE: no s4h a variante DEFAULT devolve, em TODA classe (a limpa inclusive), um
// P3 "Pré-requisitos para a atualização ampliada de tabelas (SLIN)" que fala de inconsistência de
// fusos na TTZCU do sistema — não do código verificado. Por isso `ok` reprova até P2 por default
// (`reprovaAte`), e por isso o contrafactual (rodar na classe limpa) é o que separa achado de
// código de ruído de sistema.

import { call } from './sap-connection.mjs';
import { passo, detalhe } from './log.mjs';
import { objPath, dataPreview } from './adt-client.mjs';

const ACCEPT_WORKLIST = 'application/atc.worklist.v1+xml';
const ACCEPT_DOCU = 'application/vnd.sap.adt.docu.v1+html';

// ---------- puros (testáveis sem SAP) ----------

const attr = (bloco, nome) => bloco.match(new RegExp(`${nome}="([^"]*)"`))?.[1] ?? '';

// O ATC escapa os acentos como entidade NUMÉRICA (`Vers&#227;o`, `Pr&#252;flauf`) — sem isso o
// check volta ilegível no log do pipeline. As nomeadas vêm depois, e `&amp;` por último.
const desescapar = (s) => String(s)
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * O corpo do POST /atc/runs. Um objectSet inclusivo com uma objectReference por alvo.
 *
 * ⚠ `maximumVerdicts` está no corpo porque é o que o Eclipse manda — mas NÃO limita nada neste
 * release: com `maximumVerdicts="1"` a mesma classe devolveu os 6 findings (medido). Mantido
 * pelo formato; quem quiser cortar corta no consumidor.
 */
export function buildRunBody(uris, { maximumVerdicts = 100 } = {}) {
  const refs = uris.map((u) => `        <adtcore:objectReference adtcore:uri="${u}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<atc:run xmlns:atc="http://www.sap.com/adt/atc" maximumVerdicts="${maximumVerdicts}">
  <objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences>
${refs}
      </adtcore:objectReferences>
    </objectSet>
  </objectSets>
</atc:run>`;
}

/** O `FINDING_STATS` do worklistRun — a string "p1,p2,p3" vira contagem por prioridade. */
export function parseFindingStats(xml) {
  const bloco = String(xml).match(/<atcinfo:type>FINDING_STATS<\/atcinfo:type>\s*<atcinfo:description>([^<]*)</);
  const [p1, p2, p3] = (bloco?.[1] ?? '').split(',').map((n) => Number(String(n).trim()) || 0);
  return { 1: p1 || 0, 2: p2 || 0, 3: p3 || 0, total: (p1 || 0) + (p2 || 0) + (p3 || 0) };
}

/** O worklistId que o POST /atc/worklists devolve como texto puro (e que o run repete no XML). */
export const parseWorklistId = (texto) =>
  (String(texto).match(/<atcworklist:worklistId>([^<]+)</) || [])[1] ?? String(texto).trim();

/**
 * A worklist: um objeto por alvo VERIFICADO, com seus findings.
 *
 * Objeto sem finding aparece com `<atcobject:findings/>` — é o que separa "checado e limpo" de
 * "não checado" (aí o objeto não aparece). A LINHA sai do `atcfinding:location`, que vem em duas
 * formas medidas: `…/source/main#type=CLAS%2FOM;name=…;start=6` (dentro do método) e
 * `…/oo/classes/x#start=1,0` (no objeto).
 */
export function parseWorklist(xml) {
  const objetos = [];
  for (const m of String(xml).matchAll(/<atcobject:object\b([^>]*)>([\s\S]*?)<\/atcobject:object>/g)) {
    const a = m[1];
    const findings = [...m[2].matchAll(/<atcfinding:finding\b([^>]*?)(?:\/>|>)/g)].map(([, f]) => {
      const local = desescapar(attr(f, 'atcfinding:location'));
      return {
        prioridade: Number(attr(f, 'atcfinding:priority')) || null,
        check: desescapar(attr(f, 'atcfinding:checkTitle')),
        checkId: attr(f, 'atcfinding:checkId'),
        mensagem: desescapar(attr(f, 'atcfinding:messageTitle')),
        messageId: attr(f, 'atcfinding:messageId'),
        linha: Number((local.match(/[#;]start=(\d+)/) || [])[1]) || null,
        local,
        uri: attr(f, 'adtcore:uri'),          // a URI do finding — insumo de documentacaoDoFinding
        quickfix: attr(f, 'atcfinding:quickfixInfo'),
        isencao: attr(f, 'atcfinding:exemptionApproval'),
      };
    });
    objetos.push({
      tipo: attr(a, 'adtcore:type'),
      nome: desescapar(attr(a, 'adtcore:name')),
      pacote: attr(a, 'adtcore:packageName'),
      autor: attr(a, 'atcobject:author'),
      uri: attr(a, 'adtcore:uri'),
      findings,
    });
  }
  return objetos;
}

/** Resolve o alvo em URI ADT: `{ type, name }`, `{ pacote }` ou a URI crua. */
export function uriDoAlvo(alvo) {
  if (typeof alvo === 'string') return alvo;
  if (alvo?.pacote) return `/sap/bc/adt/packages/${encodeURIComponent(String(alvo.pacote).toLowerCase())}`;
  if (alvo?.type && alvo?.name) return objPath(alvo.type, alvo.name);
  throw new Error(`atc: alvo inválido ${JSON.stringify(alvo)} — informe { type, name }, { pacote } ou a URI ADT.`);
}

// ---------- leitura ----------

// Leitura é STATELESS (mesma regra do cts.mjs): nada fica vivo no servidor depois da resposta.
async function sessaoDeLeitura(conexao, sessao) {
  if (sessao) return sessao;
  return conexao.podeAbrirLogon() ? conexao.sessaoStateless() : conexao.sessao();
}

/**
 * O customizing do ATC deste sistema. O campo que interessa é `variante` — a `systemCheckVariant`,
 * a que o Eclipse usa quando ninguém escolhe outra.
 */
export async function customizing(conexao, { sessao } = {}) {
  const s = await sessaoDeLeitura(conexao, sessao);
  const { status, text } = await call(s, { path: '/sap/bc/adt/atc/customizing', accept: 'application/*' });
  if (status !== 200) throw new Error(`atc: customizing falhou (${status}): ${text.slice(0, 300)}`);
  const props = Object.fromEntries([...text.matchAll(/<property name="([^"]*)" value="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  return {
    variante: props.systemCheckVariant ?? '',
    propriedades: props,
    motivosDeIsencao: [...text.matchAll(/<reason id="([^"]*)"[^>]*title="([^"]*)"/g)].map((m) => ({ id: m[1], titulo: desescapar(m[2]) })),
  };
}

/**
 * As variantes de check do sistema — pela SCICHKV_HD, porque `GET /atc/variants` devolve
 * `totalItemCount 0` neste release (medido, com e sem `maxItemCount`/`data`).
 *
 * A chave é CHECKVNAME + CIUSER: `CIUSER` vazio = variante GLOBAL, preenchido = variante daquele
 * usuário. As `HIDDEN='X'` são fixtures internas do Code Inspector (as `VERI_*`) — fora por default.
 */
export async function variantes(conexao, { ocultas = false, prefixo } = {}) {
  const where = ["hidden = ''", "hidden <> ''"];
  const filtro = ocultas ? '' : `\n  WHERE ${where[0]}`;
  const sql = `SELECT checkvid, checkvname, ciuser, unam\n  FROM scichkv_hd${filtro}\n  ORDER BY checkvname`;
  const { rows } = await dataPreview(conexao, sql, { rows: 1000 });
  const lista = rows.map((r) => ({
    nome: String(r.CHECKVNAME).trim(),
    id: String(r.CHECKVID).trim(),
    usuario: String(r.CIUSER).trim(),
    escopo: String(r.CIUSER).trim() ? 'usuario' : 'global',
    autor: String(r.UNAM).trim(),
  }));
  return prefixo ? lista.filter((v) => v.nome.toUpperCase().startsWith(String(prefixo).toUpperCase())) : lista;
}

/**
 * A variante existe neste sistema? O SAP NÃO confere (medido: `checkVariant=NAO_EXISTE_XYZ` cria a
 * worklist com 200 e o run devolve verde), então quem confere é a lib.
 */
export async function varianteExiste(conexao, nome) {
  const alvo = String(nome).toUpperCase();
  const todas = await variantes(conexao, { ocultas: true });
  return todas.some((v) => v.nome.toUpperCase() === alvo);
}

/** Cria a worklist e devolve o id. `checkVariant` vazio cai no default do sistema — ver o cabeçalho. */
export async function criarWorklist(sessao, variante) {
  const q = variante ? `?checkVariant=${encodeURIComponent(variante)}` : '';
  const { status, text } = await call(sessao, { method: 'POST', path: `/sap/bc/adt/atc/worklists${q}`, accept: 'text/plain' });
  if (status !== 200) throw new Error(`atc: criar worklist falhou (${status}): ${text.slice(0, 300)}`);
  return text.trim();
}

/** O texto longo de um finding — componente, classe de check e a análise com o detalhe concreto. */
export async function documentacaoDoFinding(conexao, finding, { sessao } = {}) {
  const uri = typeof finding === 'string' ? finding : finding?.uri;
  if (!uri) throw new Error('atc: finding sem uri — passe o finding devolvido por `verificar`.');
  const path = uri.replace('/sap/bc/adt/atc/findings/', '/sap/bc/adt/documentation/atc/documents/');
  const s = await sessaoDeLeitura(conexao, sessao);
  // O Accept genérico dá 406 nomeando o único aceito (medido) — por isso ele é fixo aqui.
  const { status, text } = await call(s, { path, accept: ACCEPT_DOCU });
  if (status !== 200) throw new Error(`atc: documentação do finding falhou (${status}): ${text.slice(0, 300)}`);
  return { html: text, texto: text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() };
}

// ---------- verificação ----------

/**
 * Roda o ATC nos alvos e devolve os findings.
 *
 * @param conexao
 * @param {object}   opts
 * @param {Array}    opts.objetos    alvos: `{ type, name }`, `{ pacote }` ou URI ADT crua
 * @param {string}   opts.variante   nome da variante; omitida = a `systemCheckVariant` do sistema
 * @param {number}   opts.reprovaAte prioridade máxima que reprova (default 2 — ver o cabeçalho:
 *                                   no s4h a DEFAULT devolve um P3 de AMBIENTE em toda classe)
 * @param {boolean}  opts.conferirVariante  conferir na SCICHKV_HD antes da rede (default true)
 * @param {boolean}  opts.incluirIsentos    trazer findings já isentos (default false)
 *
 * Lança quando NENHUM objeto foi verificado — 200 com worklist sem objeto é objeto que não existe
 * (ou que o ATC não sabe verificar), não código limpo.
 */
export async function verificar(conexao, {
  objetos, variante, reprovaAte = 2, maximumVerdicts = 100,
  conferirVariante = true, incluirIsentos = false, sessao,
} = {}) {
  // --- guard-rails antes da rede ---
  const alvos = Array.isArray(objetos) ? objetos : objetos ? [objetos] : [];
  if (!alvos.length) throw new Error('atc: `objetos` vazio — informe ao menos um alvo { type, name }, { pacote } ou URI.');
  const uris = alvos.map(uriDoAlvo);

  let usada = variante;
  if (!usada) {
    usada = (await customizing(conexao, { sessao })).variante;
    if (!usada) throw new Error('atc: nenhuma variante informada e o customizing do sistema não declara `systemCheckVariant`.');
    detalhe(`atc: variante não informada — usando a do sistema (${usada})`);
  }
  if (conferirVariante && !(await varianteExiste(conexao, usada)))
    throw new Error(
      `atc: a variante "${usada}" não existe neste sistema — e o SAP NÃO recusa: ele devolveria 200 com ` +
      'zero findings (verde silencioso). Liste as reais com `variantes(conexao)`.');

  passo(`atc: ${usada} em ${uris.length} alvo(s)`);
  const s = await sessaoDeLeitura(conexao, sessao);
  const worklistId = await criarWorklist(s, usada);

  const run = await call(s, {
    method: 'POST', path: `/sap/bc/adt/atc/runs?worklistId=${encodeURIComponent(worklistId)}`,
    accept: 'application/xml', contentType: 'application/xml', body: buildRunBody(uris, { maximumVerdicts }),
  });
  if (run.status !== 200) throw new Error(`atc: run falhou (${run.status}): ${run.text.slice(0, 300)}`);
  const stats = parseFindingStats(run.text);

  const wl = await call(s, {
    path: `/sap/bc/adt/atc/worklists/${encodeURIComponent(worklistId)}?includeExemptedFindings=${incluirIsentos}`,
    accept: ACCEPT_WORKLIST,
  });
  if (wl.status !== 200) throw new Error(`atc: leitura da worklist falhou (${wl.status}): ${wl.text.slice(0, 300)}`);
  const verificados = parseWorklist(wl.text);

  // --- guard-rail depois: 200 sem objeto NÃO é verde ---
  if (!verificados.length)
    throw new Error(
      `atc: a verificação não checou NENHUM objeto (worklist ${worklistId} vazia) — zero findings aqui não é ` +
      `código limpo. Confira se os alvos existem: ${uris.join(', ')}`);

  const findings = verificados.flatMap((o) => o.findings.map((f) => ({ ...f, objeto: o.nome, tipoObjeto: o.tipo })));
  const reprovam = findings.filter((f) => f.prioridade !== null && f.prioridade <= reprovaAte);
  detalhe(`atc: ${verificados.length} objeto(s) checado(s), ${findings.length} finding(s) (P1 ${stats[1]} · P2 ${stats[2]} · P3 ${stats[3]})`);

  return {
    ok: reprovam.length === 0,
    variante: usada, worklistId, reprovaAte,
    checados: verificados.length,
    objetos: verificados,
    findings, reprovam,
    porPrioridade: stats,
    status: run.status,
  };
}

/** Uma linha por finding, ordenada por prioridade — para log de pipeline ou comentário de ticket. */
export function formatarFindings(resultado) {
  const cab = `ATC ${resultado.variante}: ${resultado.checados} objeto(s), ${resultado.findings.length} finding(s) ` +
    `(P1 ${resultado.porPrioridade[1]} · P2 ${resultado.porPrioridade[2]} · P3 ${resultado.porPrioridade[3]}) — ` +
    `${resultado.ok ? 'PASSOU' : `REPROVOU em ${resultado.reprovam.length} (até P${resultado.reprovaAte})`}`;
  const linhas = [...resultado.findings]
    .sort((a, b) => (a.prioridade ?? 9) - (b.prioridade ?? 9) || String(a.objeto).localeCompare(String(b.objeto)))
    .map((f) => `  P${f.prioridade} ${f.objeto}${f.linha ? `:${f.linha}` : ''} — ${f.check}: ${f.mensagem}`);
  return [cab, ...linhas].join('\n');
}
