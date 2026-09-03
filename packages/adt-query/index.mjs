// adt-query — fundação (item 1 da fila). Ferramenta de consultas READ-ONLY sobre o motor adt-client.
//
// Escopo: ver docs/consulta.md. Toda consulta é leitura — nada de escrita.
// A interface aqui DELEGA ao motor (adt-client) — o adt-query normaliza, não reinventa a rede.
//
// TRANSPARÊNCIA de canal (medido 2026-09-03, s4h 758/moovi):
//   quem consulta informa o NOME (tabela ou CDS view) e os parâmetros; o adt-query decide o canal:
//   tabela → readTable (RFC_READ_TABLE) · CDS view → dataPreview (SQL). O tipo é descoberto na
//   DD02L (tabclass): TRANSP/APPLn/SLASH = tabela, VIEW = view, INTABT = estrutura interna (não
//   queryable).

import { readTable } from 'adt-client/rfc-soap';
import { dataPreview } from 'adt-client';

export const PACOTE = 'adt-query';

/** O catálogo de consultas que o adt-query expõe hoje (read-only). */
export const CONSULTAS = {
  consulta: {
    descricao: 'Linhas de uma tabela OU CDS view — o nome decide o canal (readTable ou dataPreview). Transparente.',
    args: { nome: 'string', campos: 'string[]', where: 'string[]', linhas: 'number' },
  },
  tabela: {
    descricao: 'Linhas de uma tabela via readTable (RFC_READ_TABLE) — a verificação universal.',
    args: { tabela: 'string', campos: 'string[]', where: 'string[]', linhas: 'number' },
  },
  sql: {
    descricao: 'Resultado de um SELECT read-only via dataPreview (ADT /datapreview/freestyle).',
    args: { sql: 'string', rows: 'number' },
  },
};

/** tabclass de Tabela (consulta por readTable) vs View (consulta por dataPreview). */
const TABCLASS_TABELA = new Set(['TRANSP', 'SLASH', 'APPL0', 'APPL1', 'APPL2', 'APPL3', 'CLUSTER', 'POOL']);

/**
 * PURO: decide o tipo a partir dos dois probes (DD02L e TADIR). Sem rede — testável offline.
 * @param {{ dd02lTabClass?: string, tadirDdls: boolean }} probes
 * @returns {'tabela'|'view'|'naoQueryable'|'naoExiste'}
 */
export function decidirTipo({ dd02lTabClass, tadirDdls }) {
  if (dd02lTabClass) {
    if (TABCLASS_TABELA.has(dd02lTabClass)) return 'tabela';
    if (dd02lTabClass === 'VIEW') return 'view';
    return 'naoQueryable'; // INTTAB etc. — estrutura interna, sem consulta direta
  }
  // não está na DD02L: pode ser CDS view analítica — na TADIR como DDLS
  return tadirDdls ? 'view' : 'naoExiste';
}

/**
 * Classifica o tipo de um objeto de dicionário numa conexão (medido 2026-09-03, s4h 758):
 *   tabela → DD02L tabclass TRANSP/APPLn/SLASH/CLUSTER/POOL (readTable).
 *   view   → DD02L tabclass VIEW (view clássica), OU na TADIR como DDLS (CDS view analítica, que
 *            NÃO tem entrada na DD02L — ex.: I_CUSTOMER). Ambas consultam por dataPreview.
 *   naoExiste → ausente das duas (nem DD02L nem TADIR DDLS).
 * @param {object} conexao conexão logada do adt-client
 * @param {string} nome nome do objeto (tabela ou view)
 * @returns {Promise<'tabela'|'view'|'naoExiste'|'naoQueryable'>}
 */
export async function classificarObjeto(conexao, nome) {
  const n = String(nome).toUpperCase();
  const { rows } = await dataPreview(
    conexao, `SELECT tabname, tabclass FROM dd02l\n  WHERE tabname = '${n}'`, { rows: 1 },
  );
  const dd02lTabClass = rows[0] ? rows[0].TABCLASS : null;
  let tadirDdls = false;
  if (!dd02lTabClass) {
    const { rows: ta } = await dataPreview(
      conexao, `SELECT object FROM tadir\n  WHERE obj_name = '${n}' AND object = 'DDLS'`, { rows: 1 },
    );
    tadirDdls = ta.length > 0;
  }
  return decidirTipo({ dd02lTabClass, tadirDdls });
}

/** Monta o corpo do SELECT a partir de campos ([] = *). PURO — testável offline. */
export function selecao(campos) {
  const cs = (campos ?? []).map((c) => String(c).toUpperCase());
  return cs.length ? cs.join(', ') : '*';
}

/**
 * Monta as linhas de WHERE a partir das condições do usuário. PURO — testável offline.
 * Cada `where` é uma linha inteira pronta (ex.: "CUSTOMER = '0001'", ou com AND/OR/() para
 * encadear). O freestyle valida a sintaxe — quem erra recebe o 400 do SAP.
 */
export function montarWhere(where) {
  const linhas = (where ?? []).map((w) => String(w).trim()).filter(Boolean);
  return linhas.length ? `\n  WHERE ${linhas.join(' ')}` : '';
}

/**
 * CONSULTA TRANSPARENTE: linhas de uma tabela ou CDS view, pelo nome. Read-only.
 * O tipo é descoberto na DD02L e o canal escolhido por ele — quem chama só informa o nome e
 * os parâmetros, como numa SE16N.
 *
 * @param {object} conexao conexão logada do adt-client ({ cfg, sessao })
 * @param {string} nome nome da tabela OU da CDS view
 * @param {{campos?: string[], where?: string[], linhas?: number}} [opts]
 * @returns {Promise<{ok: true, dados: object[], tipo: 'tabela'|'view'}>}
 */
export async function consultar(conexao, nome, { campos = [], where = [], linhas = 100 } = {}) {
  const tipo = await classificarObjeto(conexao, nome);
  const n = String(nome).toUpperCase();
  if (tipo === 'naoExiste') throw new Error(`consulta: "${n}" não existe no dicionário (nem na DD02L nem na TADIR como CDS).`);
  if (tipo === 'naoQueryable') throw new Error(`consulta: "${n}" é ${tipo} (estrutura interna, INTABT) — não é queryable.`);
  if (tipo === 'tabela') {
    const dados = await readTable(conexao.cfg, n, { campos, where, linhas });
    return { ok: true, dados, tipo };
  }
  // view → monta SELECT e vai por dataPreview
  const sql = `SELECT ${selecao(campos)} FROM ${n}${montarWhere(where)}`;
  const r = await dataPreview(conexao, sql, { rows: linhas });
  return { ok: true, dados: r.rows, tipo };
}

/**
 * Consulta: linhas de uma tabela. Read-only. Delega ao readTable do motor.
 * Mantido para uso explícito de tabela; `consultar` é o ponto transparente.
 * @param {object} conexao conexão logada do adt-client ({ cfg, sessao })
 * @param {string} tabela nome da tabela
 * @param {{campos?: string[], where?: string[], linhas?: number}} [opts]
 * @returns {Promise<{ok: true, dados: object[]}>}
 */
export async function consultarTabela(conexao, tabela, { campos = [], where = [], linhas = 100 } = {}) {
  const dados = await readTable(conexao.cfg, tabela, { campos, where, linhas });
  return { ok: true, dados };
}

/**
 * Consulta: SELECT read-only via dataPreview. O motor garante read-only (assertReadOnly).
 * @param {object} conexao conexão logada do adt-client ({ cfg, sessao })
 * @param {string} sql SELECT read-only
 * @param {{rows?: number}} [opts]
 * @returns {Promise<{ok: true, dados: {columns: string[], rows: object[]}}>}
 */
export async function consultarSql(conexao, sql, { rows = 100 } = {}) {
  const { columns, rows: linhas, ...resto } = await dataPreview(conexao, sql, { rows });
  return { ok: true, dados: { columns, rows: linhas, ...resto } };
}