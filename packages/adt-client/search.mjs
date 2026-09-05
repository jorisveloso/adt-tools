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

// ---------- where-used (usage references) ----------
// Endpoint: POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=<uri do objeto>
// É o "Verwendungsnachweis"/Where-Used do Eclipse (Ctrl+Shift+G), e o INVERSO do `deps.mjs`: o deps
// lê o fonte e adivinha o que o objeto usa; este PERGUNTA AO SERVIDOR quem usa o objeto. Onde o
// deps é heurística sobre texto, aqui é o índice do RIS respondendo.
//
// Medido em 04/09/2026 no SXD 816 (POC 4029823-J1B1N, item 10) — cinco elementos de dados do J1B*,
// status 200 em todos. Quatro coisas que a resposta ensina, e que mudam como se lê o resultado:
//
//  1. A resposta é uma ÁRVORE ACHATADA. Cada `referencedObject` traz `parentUri`; os nós com
//     `isResult="false"` são só o CONTAINER (a estrutura, o grupo de função, o pacote) e os com
//     `isResult="true"` são a ocorrência de verdade (o campo, a linha). Contar `referencedObject`
//     conta pai e filho junto — foi o erro do script da POC, que viu 41 "refs" onde havia 15 usos.
//
//  2. ⚠️ O RESULTADO CHEGA PELA METADE, e nada no status diz isso. Nó com `canHaveChildren="true"`
//     vem COLAPSADO: o servidor sabe que há usos ali dentro e não os manda. Por isso o
//     `numberOfResults` do cabeçalho não bate com o número de `isResult="true"` — no
//     J_1BNFNUM_UTILITIES foram 12 anunciados contra 5 expandidos, com 11 nós colapsados. É a mesma
//     armadilha do teto do `buscar`: lista incompleta é indistinguível de lista completa. Por isso
//     `colapsados` sai no retorno — quem chama TEM que dizer isso a quem lê. Expandir um nó pede
//     outra chamada, ainda NÃO MEDIDA (fila do adt-client).
//
//  3. O que a função responde é **QUEM usa, não ONDE**. O uso em CÓDIGO chega quase sempre como nó
//     colapsado — nomeado (o FM, o include, a classe, com tipo e pacote), mas sem a ocorrência
//     dentro dele. Medido no s4h 758: `CL_SALV_TABLE` deu 6.282 anunciados com **38** expandidos e
//     12.232 colapsados; `MATNR`, 41.226 anunciados com 30.221 expandidos e 26.473 colapsados.
//     Para ELEMENTO DE DADOS o pouco que vem expandido são DECLARAÇÕES (`TABL/DSF` — o campo na
//     estrutura), não escritas: quem GRAVA o campo em runtime está nos colapsados. Logo
//     **where-used de DE não responde "quem escreve neste campo"** — essa pergunta continua sendo
//     do canal de fonte/debug.
//
//  4. O nome/tipo/pacote NÃO estão no `referencedObject` — estão no filho `adtObject`
//     (e o pacote no `adtcore:packageRef` dentro dele). Ler só os atributos da tag de fora devolve
//     uma lista de URIs sem nome.
//
//  5. ⚠️ O PREFIXO DO NAMESPACE MUDA POR SISTEMA — e é o pior dos silêncios, porque tem cara de
//     "não há usos": o SXD 816 responde `usagereferences:` (tudo minúsculo) e o s4h 758 responde
//     `usageReferences:` (camelCase), no MESMO endpoint e com o mesmo corpo. Um parser preso ao
//     prefixo do primeiro sistema lê os 41.226 usos de MATNR no s4h como ZERO, com status 200.
//     Por isso todo regex daqui casa pelo nome LOCAL (`<[\w.-]+:tag`), e por isso `completo` é
//     falso também quando o servidor anuncia usos e a lista sai vazia. (medido 04/09/2026 nos dois)
//

const CAMINHO_USOS = '/sap/bc/adt/repository/informationsystem/usageReferences';

const CT_USOS = 'application/vnd.sap.adt.repository.usagereferences.request.v1+xml';
const ACCEPT_USOS = 'application/vnd.sap.adt.repository.usagereferences.result.v1+xml';

// `affectedObjects` vazio = "o objeto inteiro". Foi o corpo medido; o `grade` (definitions,
// elements, indirectReferences) aparece no ECO do scope na resposta, mas mandá-lo não foi medido —
// e opção não medida não entra na lib.
const BODY_USOS =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
  '<usagereferences:affectedObjects/>' +
  '</usagereferences:usageReferenceRequest>';

/**
 * Extrai a árvore de usos do XML do usageReferences. PURO (sem rede).
 * Cada item: `{ uri, uriPai, nome, tipo, pacote, responsavel, ocorrencia, temFilhos, uso }` —
 * `ocorrencia` é o `isResult` (é um uso, não o container) e `temFilhos` é o `canHaveChildren`
 * (o nó veio colapsado; há uso ali que o servidor não mandou).
 */
export function parseUsageReferences(xml) {
  const texto = String(xml);
  const raiz = (texto.match(/<[\w.-]+:usageReferenceResult\b([^>]*)>/) || [])[1] || '';
  const na = (fonte, chave) => (fonte.match(new RegExp(`${chave}="([^"]*)"`)) || [])[1] || '';
  // Aqui o prefixo é OBRIGATÓRIO: no s4h cada referencedObject carrega um `<objectIdentifier>` SEM
  // prefixo (`BlueAUTH;/ACCGO/MAT;…`), e casar com ele daria um escopo inventado.
  const escopo = (texto.match(/<[\w.-]+:objectIdentifier\b([^>]*)\/?>/) || [])[1] || '';

  // Os nós ANINHAM (`canHaveChildren`), então casar `<referencedObject>…</referencedObject>` com
  // regex não-guloso corta no fechamento errado. Varrer só as ABERTURAS, em ordem, e ler o miolo
  // até a próxima abertura resolve: o `adtObject` do nó é sempre o primeiro filho.
  const aberturas = [...texto.matchAll(/<[\w.-]+:referencedObject\b([^>]*?)\/?>/g)];
  const refs = aberturas.map((m, i) => {
    const attrs = m[1];
    const ate = i + 1 < aberturas.length ? aberturas[i + 1].index : texto.length;
    const trecho = texto.slice(m.index, ate);
    const objeto = (trecho.match(/<[\w.-]+:adtObject\b([^>]*)>/) || [])[1] || '';
    return {
      uri: na(attrs, 'uri'),
      uriPai: na(attrs, 'parentUri'),
      nome: na(objeto, 'adtcore:name'),
      tipo: na(objeto, 'adtcore:type'),
      pacote: (trecho.match(/<adtcore:packageRef\b[^>]*adtcore:name="([^"]*)"/) || [])[1] || '',
      responsavel: na(objeto, 'adtcore:responsible'),
      ocorrencia: na(attrs, 'isResult') === 'true',
      temFilhos: na(attrs, 'canHaveChildren') === 'true',
      uso: na(attrs, 'usageInformation'),
    };
  });

  return {
    // O que o SERVIDOR diz que existe — não o que veio na lista (ver ponto 2 acima).
    total: Number(na(raiz, 'numberOfResults') || 0),
    descricao: na(raiz, 'resultDescription'),
    escopo: { nome: na(escopo, 'displayName'), globalType: na(escopo, 'globalType') },
    refs,
  };
}

/**
 * Quem usa este objeto — where-used pelo índice do RIS.
 * @param session sessão viva (cookie + token)
 * @param {string} uri  URI ADT do objeto, ex.: '/sap/bc/adt/oo/classes/zcl_x',
 *                      '/sap/bc/adt/ddic/dataelements/j_1bnfe_utrib'
 * @returns `{ total, descricao, escopo, refs, ocorrencias, colapsados, completo }` — `ocorrencias`
 *          são os usos que vieram nomeados, `colapsados` os nós que o servidor não expandiu, e
 *          `completo` é `false` quando há colapsado ou quando o `total` anunciado não bate com o
 *          que veio: resultado parcial que quem chama precisa repassar ao usuário.
 */
export async function whereUsed(session, uri) {
  passo(`where-used: ${uri}`);
  const r = await call(session, {
    method: 'POST',
    path: `${CAMINHO_USOS}?uri=${encodeURIComponent(uri)}`,
    accept: ACCEPT_USOS,
    contentType: CT_USOS,
    body: BODY_USOS,
  });

  if (r.status === 404) {
    throw new Error(
      `where-used respondeu 404 em ${CAMINHO_USOS}.\n` +
      'Ou a URI do objeto não existe, ou o nó SICF do information system está inativo.',
    );
  }
  if (r.status >= 400) {
    throw new Error(`where-used falhou (${r.status}): ${r.text.slice(0, 300)}`);
  }

  const res = parseUsageReferences(r.text);
  const ocorrencias = res.refs.filter((x) => x.ocorrencia);
  const colapsados = res.refs.filter((x) => x.temFilhos);
  const completo = colapsados.length === 0 && ocorrencias.length >= res.total && !(res.total > 0 && res.refs.length === 0);

  detalhe(`${res.total} usos anunciados · ${ocorrencias.length} expandidos · ${res.refs.length} nós na árvore`);
  if (!completo) {
    if (res.total > 0 && res.refs.length === 0) {
      // 200 com o corpo cheio e a lista vazia = o XML veio num formato que o parser não reconhece
      // (foi assim que o prefixo camelCase do s4h se revelou). Não é "não há usos".
      detalhe(`⚠️ o servidor anuncia ${res.total} usos e o parser não leu NENHUM — formato inesperado, não ausência de uso`);
    }
    if (colapsados.length) {
      detalhe(`⚠️ resultado PARCIAL — ${colapsados.length} nó(s) colapsado(s) que o servidor não expandiu`);
      for (const x of colapsados.slice(0, 10)) detalhe(`   colapsado: ${x.uri}`);
    }
  }

  return { ...res, ocorrencias, colapsados, completo };
}
