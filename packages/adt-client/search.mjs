// search.mjs — busca no Repository Information System do ADT. É o motor do `list`.
//
// Endpoint: /sap/bc/adt/repository/informationsystem/search — o mesmo serviço por trás do
// Ctrl+Shift+A do Eclipse ("Open ABAP Development Object").
//
// ⚠️ NUNCA foi chamado a partir desta lib. É o risco que o `list` compra — barato, porque é só
// leitura. Se o servidor ignorar o filtro `objectType`, o filtro do lado do cliente ainda vale:
// por isso os dois existem, e não é redundância acidental.

import { call } from './sap-connection.mjs';
import { passo, detalhe } from './log.mjs';

const CAMINHO = '/sap/bc/adt/repository/informationsystem/search';

// Extrai os atributos de cada <adtcore:objectReference .../>, sem depender da ordem em que vêm.
export function parseObjectReferences(xml) {
  const itens = [];
  for (const [, attrs] of String(xml).matchAll(/<adtcore:objectReference\b([^>]*)\/?>/g)) {
    const at = (nome) => (attrs.match(new RegExp(`adtcore:${nome}="([^"]*)"`)) || [])[1] || '';
    itens.push({
      nome: at('name'),
      tipo: at('type'),
      pacote: at('packageName'),
      descricao: at('description'),
      uri: at('uri'),
    });
  }
  return itens;
}

/**
 * Busca objetos por padrão de nome, opcionalmente restrita a tipos ADT.
 * @param session sessão viva (cookie + token)
 * @param {string} padrao       ex.: 'Z*'
 * @param {string[]} adtTypes   ex.: ['TABL/DT'] — vazio = todos
 * @param {number} max
 */
export async function buscar(session, padrao, adtTypes = [], max = 200) {
  const params = new URLSearchParams({ operation: 'quickSearch', query: padrao, maxResults: String(max) });
  // Um só tipo vai como filtro de servidor. Vários (caso do PROG) ficam só no filtro do cliente,
  // porque o endpoint aceita um `objectType` por chamada.
  if (adtTypes.length === 1) params.set('objectType', adtTypes[0]);
  passo(`busca: query "${padrao}" · tipos [${adtTypes.join(', ') || 'todos'}] · filtro de servidor ${adtTypes.length === 1 ? adtTypes[0] : 'nenhum (só filtro do cliente)'}`);

  const r = await call(session, { path: `${CAMINHO}?${params}`, accept: 'application/xml' });

  if (r.status === 404) {
    throw new Error(
      `o serviço de busca do ADT respondeu 404 em ${CAMINHO}.\n` +
      'O nó SICF pode estar inativo, ou a versão do NetWeaver é anterior à que expõe este endpoint.',
    );
  }
  if (r.status >= 400) {
    throw new Error(`busca falhou (${r.status}): ${r.text.slice(0, 300)}`);
  }

  const todos = parseObjectReferences(r.text);
  // Filtro do cliente: garante o resultado mesmo se o servidor ignorou `objectType`, e é o único
  // filtro possível quando são vários tipos.
  const itens = adtTypes.length ? todos.filter((i) => adtTypes.includes(i.tipo)) : todos;

  detalhe(`servidor devolveu ${todos.length}, sobraram ${itens.length} após o filtro do cliente`);
  // Os tipos que vieram: é o que mostra que o `objectType` foi ignorado (ou que o objeto procurado
  // existe, mas com um tipo que o checkout ainda não sabe baixar).
  if (todos.length) detalhe(`tipos vistos: ${[...new Set(todos.map((i) => i.tipo))].join(', ')}`);

  // Bateu o teto = o servidor CORTOU. Quem chama TEM que dizer isso ao usuário: uma lista truncada é
  // indistinguível de uma lista completa, e "não está na lista" vira "não existe" — foi assim que a
  // busca por ZPKG_T_EVENT em ZPKG_* não achou nada (200 resultados, cortados antes do T).
  const truncado = todos.length >= max;
  if (truncado) detalhe(`⚠️ bateu o teto de ${max} resultados — o servidor cortou o resto`);

  return { itens, totalBruto: todos.length, filtrado: todos.length - itens.length, truncado, max };
}
