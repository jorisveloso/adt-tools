// cobertura.mjs — a cobertura de teste como ARTEFATO legível, não como um número solto.
//
// `runUnitTestsWithCoverage` (adt-client) responde "75%". Isso passa num gate e não ajuda ninguém a
// escrever o teste que falta. O que o Eclipse mostra — e o que este módulo devolve — é a ÁRVORE:
// programa → método, cada um com statement/branch/procedure, executados e totais. Um método com
// `procedure 0/1` é uma linha de trabalho; "75%" não é.
//
// ---------------------------------------------------------------------------------------------
// O QUE O SAP DEVOLVE (medido 2026-08-31, S4H 758, mandante 250)
//
// O `POST` na medição (`runtime/traces/coverage/measurements/<id>`) devolve `cov:result`: uma
// árvore de `<node>`, cada um com um `adtcore:objectReference` e três `<coverage type=… total=…
// executed=…>`. Três níveis medidos numa classe:
//
//   ADT_ROOT_NODE                          statement 12/6   ← a raiz
//     └ CLAS/OCI  YJBV_…=====CP            statement 12/6   ← o programa (o pool da classe)
//         └ CLAS/OM  CLASSIFICAR           statement  6/4
//           CLAS/OM  NUNCA_CHAMADO         statement  4/0   ← o que o relatório precisa mostrar
//           CLAS/OM  SOMAR                 statement  2/2
//
// A URI de cada nó traz `#start=<linha>,<coluna>` — o método com o ponto no fonte.
//
// ⚠️ **BUG QUE ISTO CORRIGE:** o `parseCoverage` antigo somava `<coverage>` do XML inteiro com um
// `matchAll` chapado — ou seja, contava o MESMO statement uma vez por nível (12 + 12 + 12 = 36).
// O percentual saía certo por acaso (a árvore é proporcional), mas `total`/`executed` mentiam por
// 3×. Aqui a agregação é do nó RAIZ, e a árvore fica disponível inteira.
//
// ---------------------------------------------------------------------------------------------
// LINHA A LINHA: NÃO (ainda)
//
// O `cov:result` anuncia dois links para statements — um por nó
// (`…/results/<id>/statements/<ROOT>/<PROGRAMA>/<NÓ>`) e um `bulkstatements` na raiz. Medido: o GET
// do primeiro dá **404** em toda variante testada (com e sem `%3d` do `===CP`, com `?type=`), e o
// `bulkstatements` só aceita **POST** com `<cov:statementsBulkRequest/>` **vazio** e Accept
// `application/xml` (com filho, 400 "Fim de elemento esperado"; com `application/xml+scov`, 406
// dizendo que o permitido é `application/xml`) — e responde **200 com `<cov:statementsBulkResponse/>`
// vazio**. Como abrir esse recurso ficou em aberto (ideia I47); o handler ABAP é
// `if_scv_stmnt_results_builder`. Por isso o grão deste módulo é o MÉTODO, que é o que se mede hoje.

import { call } from './sap-connection.mjs';
import { objPath, buildUnitRunBody, buildCoverageQuery, parseUnitResult } from './adt-client.mjs';
import { passo, detalhe } from './log.mjs';

const AUNIT_CT = 'application/vnd.sap.adt.abapunit.testruns.config.v4+xml';
const AUNIT_ACCEPT = 'application/vnd.sap.adt.abapunit.testruns.result.v2+xml';
export const TIPOS_COBERTURA = ['statement', 'branch', 'procedure'];

// ---------- puros ----------

const pct = (executed, total) => (total ? Number(((executed / total) * 100).toFixed(2)) : null);

function coberturasDe(trecho) {
  const out = {};
  for (const c of trecho.matchAll(/<coverage type="([^"]*)" total="(\d+)" executed="(\d+)"\s*\/>/g)) {
    const [, type, total, executed] = c;
    out[type] = { total: Number(total), executed: Number(executed), percent: pct(Number(executed), Number(total)) };
  }
  return out;
}

/**
 * A ÁRVORE do `cov:result`, com aninhamento preservado (puro).
 *
 * Cada nó: `{ nome, tipo, uri, linha, coluna, cobertura: { statement, branch, procedure }, filhos }`.
 * `tipo` é o `adtcore:type` (`CLAS/OCI` para o pool, `CLAS/OM` para o método).
 */
export function parseCoverageTree(xml) {
  const s = String(xml);
  const raizes = [];
  const pilha = [];
  // Percorre as tags de <node> na ordem: cada abertura empilha, cada fechamento desempilha.
  const re = /<node>|<\/node>|<adtcore:objectReference\b[^>]*\/>|<coverage type="[^"]*" total="\d+" executed="\d+"\s*\/>/g;
  let m;
  while ((m = re.exec(s))) {
    const t = m[0];
    if (t === '<node>') {
      const no = { nome: '', tipo: '', uri: '', linha: null, coluna: null, cobertura: {}, filhos: [] };
      if (pilha.length) pilha.at(-1).filhos.push(no); else raizes.push(no);
      pilha.push(no);
    } else if (t === '</node>') {
      pilha.pop();
    } else if (!pilha.length) {
      continue;
    } else if (t.startsWith('<adtcore:objectReference')) {
      const no = pilha.at(-1);
      // o primeiro objectReference do nó é o dele; os de dentro pertencem aos filhos (já empilhados)
      if (no.nome) continue;
      no.nome = (t.match(/adtcore:name="([^"]*)"/) || [])[1] || '';
      no.tipo = (t.match(/adtcore:type="([^"]*)"/) || [])[1] || '';
      no.uri = (t.match(/adtcore:uri="([^"]*)"/) || [])[1] || '';
      const pos = no.uri.match(/#start=(\d+)(?:,(\d+))?/);
      if (pos) { no.linha = Number(pos[1]); no.coluna = pos[2] ? Number(pos[2]) : null; }
    } else {
      const no = pilha.at(-1);
      Object.assign(no.cobertura, coberturasDe(t));
    }
  }
  return raizes;
}

/** Só os métodos (`CLAS/OM` e afins — nós FOLHA da árvore), achatados e ordenados por nome. */
export function metodosDaArvore(nos) {
  const out = [];
  const anda = (lista, pai) => {
    for (const n of lista) {
      if (!n.filhos.length) out.push({ ...n, programa: pai });
      else anda(n.filhos, n.nome);
    }
  };
  anda(nos, '');
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Os percentuais do objeto, agregados **do nó raiz** — não somando a árvore (ver o bug no cabeçalho).
 * Devolve `{ statement, branch, procedure }`, cada um `{ total, executed, percent }`.
 */
export function totaisDaArvore(nos) {
  const out = {};
  for (const t of TIPOS_COBERTURA) {
    let total = 0; let executed = 0; let achou = false;
    for (const n of nos) {
      const c = n.cobertura[t];
      if (!c) continue;
      achou = true; total += c.total; executed += c.executed;
    }
    if (achou) out[t] = { total, executed, percent: pct(executed, total) };
  }
  return out;
}

/**
 * O relatório em Markdown — o artefato que se anexa no ticket (puro).
 *
 * @param {object} dados  o resultado de `coberturaDe` (ou `{ objeto, totais, metodos, testes }`)
 * @param {number} opts.limiar   percentual de statement abaixo do qual o método é marcado (default 90)
 * @param {boolean} opts.soFalhas  lista só os métodos abaixo do limiar
 */
export function relatorioMarkdown(dados, { limiar = 90, soFalhas = false } = {}) {
  const { objeto = '', totais = {}, metodos = [], testes } = dados ?? {};
  const n = (c) => (c ? `${c.executed}/${c.total}` : '—');
  const p = (c) => (c && c.percent !== null ? `${c.percent}%` : '—');
  const linhas = [`# Cobertura — ${objeto}`, ''];

  if (testes) {
    linhas.push(`**Testes:** ${testes.passed}/${testes.executed} passaram`
      + (testes.failed ? ` · **${testes.failed} falharam**` : '') + '  ');
  }
  linhas.push(`**Statement:** ${p(totais.statement)} (${n(totais.statement)}) · `
    + `**Branch:** ${p(totais.branch)} (${n(totais.branch)}) · `
    + `**Procedure:** ${p(totais.procedure)} (${n(totais.procedure)})`, '');

  const abaixo = (m) => (m.cobertura.statement?.percent ?? 100) < limiar;
  const lista = soFalhas ? metodos.filter(abaixo) : metodos;
  if (!lista.length) {
    linhas.push(soFalhas ? `Nenhum método abaixo de ${limiar}%.` : 'Nenhum método medido.');
    return linhas.join('\n');
  }

  linhas.push('| | método | linha | statement | branch | procedure |', '|---|---|---|---|---|---|');
  for (const m of lista) {
    const st = m.cobertura.statement;
    const marca = (st?.executed ?? 0) === 0 && (st?.total ?? 0) > 0 ? '🔴' : abaixo(m) ? '🟡' : '🟢';
    linhas.push(`| ${marca} | \`${m.nome}\` | ${m.linha ?? '—'} | ${p(st)} (${n(st)}) `
      + `| ${p(m.cobertura.branch)} (${n(m.cobertura.branch)}) | ${n(m.cobertura.procedure)} |`);
  }
  const nunca = metodos.filter((m) => (m.cobertura.procedure?.executed ?? 1) === 0);
  if (nunca.length) {
    linhas.push('', `**Nunca executados (${nunca.length}):** ` + nunca.map((m) => `\`${m.nome}\``).join(', '));
  }
  linhas.push('', `🔴 nada coberto · 🟡 abaixo de ${limiar}% · 🟢 ok`);
  return linhas.join('\n');
}

// ---------- a chamada ----------

/**
 * Roda o ABAP Unit COM cobertura e devolve a árvore, os métodos e os totais — mais o markdown.
 *
 * ```js
 * const c = await coberturaDe(cx, { name: 'ZCL_PEDIDO' });
 * console.log(c.markdown);            // o artefato do ticket
 * c.metodos.filter((m) => !m.cobertura.procedure.executed);   // o que nenhum teste chamou
 * ```
 *
 * ⚠️ `testes.executed === 0` não é sucesso — é filtro ou objeto errado (a regra do ABAP Unit); aqui
 * ele também zera a cobertura, e o relatório sairia "0%" como se fosse código sem teste.
 */
export async function coberturaDe(conexao, { type = 'class', name, limiar = 90 }) {
  passo(`cobertura: ${type} ${name}`);
  const s = await conexao.sessao();
  const uri = objPath(type, name);
  const body = buildUnitRunBody(uri).replace('<coverage active="false"/>', '<coverage active="true"/>');
  const run = await call(s, { method: 'POST', path: '/sap/bc/adt/abapunit/testruns', accept: AUNIT_ACCEPT, contentType: AUNIT_CT, body });
  if (run.status !== 200) throw new Error(`cobertura: o test run de ${name} falhou (${run.status}): ${run.text.slice(0, 300)}`);
  const testes = parseUnitResult(run.text);
  if (testes.executed === 0) {
    throw new Error(`cobertura: ZERO testes executados em ${name} — sem teste não há cobertura, e "0%" aqui seria mentira (objeto sem classe de teste, ou filtro errado).`);
  }

  const measureUri = (String(run.text).match(/coverage adtcore:uri="([^"]+)"/) || [])[1];
  if (!measureUri) throw new Error(`cobertura: o run de ${name} não devolveu a URI da medição (coverage active?).`);
  const r = await call(s, { method: 'POST', path: measureUri, accept: 'application/xml', contentType: 'application/xml', body: buildCoverageQuery(uri) });
  if (r.status !== 200) throw new Error(`cobertura: a medição de ${name} falhou (${r.status}): ${r.text.slice(0, 300)}`);

  const arvore = parseCoverageTree(r.text);
  const metodos = metodosDaArvore(arvore);
  const totais = totaisDaArvore(arvore);
  detalhe(`cobertura: ${metodos.length} método(s), statement ${totais.statement?.percent ?? '—'}%`);
  const dados = {
    objeto: String(name).toUpperCase(), tipo: type, testes, arvore, metodos, totais,
    statement: totais.statement?.percent ?? null,
    atendeLimiar: totais.statement?.percent == null ? null : totais.statement.percent >= limiar,
    xml: r.text,
  };
  return { ...dados, markdown: relatorioMarkdown(dados, { limiar }) };
}
