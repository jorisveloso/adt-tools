// adt-query — fundação (item 1 da fila). Ferramenta de consultas READ-ONLY sobre o motor adt-client.
//
// Escopo: ver docs/consulta.md. Toda consulta é leitura — nada de escrita.
// A interface aqui DELEGA ao motor (adt-client) — o adt-query normaliza, não reinventa a rede.

import { readTable } from 'adt-client/rfc-soap';
import { dataPreview } from 'adt-client';

export const PACOTE = 'adt-query';

/** O catálogo de consultas que o adt-query expõe hoje (read-only). */
export const CONSULTAS = {
  tabela: {
    descricao: 'Linhas de uma tabela via readTable (RFC_READ_TABLE) — a verificação universal.',
    args: { tabela: 'string', campos: 'string[]', where: 'string[]', linhas: 'number' },
  },
  sql: {
    descricao: 'Resultado de um SELECT read-only via dataPreview (ADT /datapreview/freestyle).',
    args: { sql: 'string', rows: 'number' },
  },
};

/**
 * Consulta: linhas de uma tabela. Read-only. Delega ao readTable do motor.
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
