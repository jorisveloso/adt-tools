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
//  2. ⚠️ SOZINHO, O RESULTADO CHEGA PELA METADE, e nada no status diz isso. Nó com
//     `canHaveChildren="true"` vem COLAPSADO: o servidor sabe que há usos ali dentro e não os manda.
//     Por isso o `numberOfResults` do cabeçalho não bate com o número de `isResult="true"` — no
//     J_1BNFNUM_UTILITIES foram 12 anunciados contra 5 expandidos, com 11 nós colapsados. É a mesma
//     armadilha do teto do `buscar`: lista incompleta é indistinguível de lista completa.
//     ✅ RESOLVIDO em 05/09/2026 (s4h 250): a segunda metade é o `usageSnippets` — ver `expandirUsos`
//     no fim deste arquivo e `whereUsed(session, uri, { expandir: true })`, que fecha os dois casos
//     medidos (`completo: true`, com arquivo e linha de cada uso).
//
//  2b. E "colapsado" não é uma coisa só: ou o nó traz um `<objectIdentifier>` (uso em CÓDIGO sem
//     localização — é ele que expande), ou é um CONTAINER (pacote, grupo de função) cujos filhos
//     vieram na MESMA árvore, e aí não falta nada. Medido em 4 objetos, até 13.710 nós: zero
//     colapsados sem identifier e sem filho presente. Contar container como buraco é alarme falso —
//     no J_1B_NF_OBJECT_CHECK dava 11 "buracos" onde havia 6.
//
//  3. Sem expandir, o que a função responde é **QUEM usa, não ONDE**. O uso em CÓDIGO chega quase
//     sempre como nó colapsado — nomeado (o FM, o include, a classe, com tipo e pacote), mas sem a
//     ocorrência dentro dele. Medido no s4h 758: `CL_SALV_TABLE` deu 6.282 anunciados com **38**
//     expandidos e 12.232 colapsados; `MATNR`, 41.226 anunciados com 30.221 expandidos e 26.473
//     colapsados. Para ELEMENTO DE DADOS o pouco que vem localizado são DECLARAÇÕES (`TABL/DSF` — o
//     campo na estrutura). O ONDE vem do `expandir`: o snippet dá arquivo, linha, coluna e o trecho.
//     ✅/⚠️ RESOLVIDO PELA METADE em 06/09/2026 (s4h 250, item 96): `accessWrite` EXISTE — mas quem
//     o traz é o where-used da TABELA (ou da CLASSE) dona do campo, e NUNCA o do ELEMENTO DE DADOS.
//     Medido em laboratório Z onde a escrita era certa: o where-used do DE devolveu só as duas
//     DECLARAÇÕES (`TYPE zpoc_wu_de`), ambas `accessUnknown` — as linhas que gravam sequer aparecem
//     na lista, porque ali quem é referenciado é o TIPO, não o valor. Logo o aviso continua valendo
//     PARA O DE, por outro motivo: não é o `matches` que falta, são as ocorrências.
//     Ver o ponto 5 de `expandirUsos` para o que o `accessWrite` responde e o que ele não responde.
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
      // A chave da expansão (ver `expandirUsos`): o `<objectIdentifier>` SEM prefixo que só os nós
      // de uso em código trazem. Container (pacote, grupo de função) não tem.
      id: (trecho.match(/<objectIdentifier>([^<]*)<\/objectIdentifier>/) || [])[1] || '',
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
 * @param {{expandir?: boolean, maxExpandir?: number, lote?: number, acesso?: 'escrita'|'leitura'}} opts
 *        `expandir` chama o `usageSnippets` nos nós expansíveis e traz arquivo/linha/coluna de cada
 *        uso em código (ver `expandirUsos`); `maxExpandir` (default 500) é o teto que evita disparar
 *        milhares de chamadas sem querer — acima dele NÃO expande e diz isso; `acesso` filtra os
 *        `usos` por modo de acesso — e o que ele responde tem fronteira medida, ver `filtrarPorAcesso`.
 * @returns `{ total, descricao, escopo, refs, ocorrencias, colapsados, expansiveis, containers,
 *          completo, usos?, usosAntesDoFiltro?, expandido }` — `ocorrencias` são os usos que já
 *          vieram localizados, `expansiveis` os nós de uso em código que só o `usageSnippets`
 *          localiza, `containers` os nós colapsados que são só pai (esses não escondem nada: os
 *          filhos vêm na mesma árvore), e `usos` (só com `expandir`) as ocorrências linha a linha.
 */
export async function whereUsed(session, uri, { expandir = false, maxExpandir = 500, lote = 200, acesso } = {}) {
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
  // Nem todo colapsado é buraco. Medido em 05/09/2026 no s4h 250, em 4 objetos (até 13.710 nós):
  // TODO nó `canHaveChildren="true"` ou tem `objectIdentifier` — uso em código sem localização, e é
  // esse que o `usageSnippets` expande — ou é um CONTAINER (pacote, grupo de função) cujos filhos
  // vieram na mesma árvore. Zero casos de colapsado sem id e sem filho presente. Por isso o alarme
  // de parcial olha os EXPANSÍVEIS: contar container como buraco é alarme falso (no
  // J_1B_NF_OBJECT_CHECK seriam 11 "buracos" onde há 6).
  const expansiveis = res.refs.filter((x) => x.id);
  const uris = new Set(res.refs.map((x) => x.uri));
  const containers = colapsados.filter((x) => !x.id && res.refs.some((y) => y.uriPai === x.uri && uris.has(y.uri)));
  const vazio = res.total > 0 && res.refs.length === 0;

  detalhe(`${res.total} usos anunciados · ${ocorrencias.length} localizados · ${expansiveis.length} expansíveis · ${res.refs.length} nós na árvore`);
  if (vazio) {
    // 200 com o corpo cheio e a lista vazia = o XML veio num formato que o parser não reconhece
    // (foi assim que o prefixo camelCase do s4h se revelou). Não é "não há usos".
    detalhe(`⚠️ o servidor anuncia ${res.total} usos e o parser não leu NENHUM — formato inesperado, não ausência de uso`);
  }

  let usos;
  let expandido = false;
  if (expandir && expansiveis.length) {
    if (expansiveis.length > maxExpandir) {
      detalhe(`⚠️ ${expansiveis.length} nós expansíveis passam do teto de ${maxExpandir} — NÃO expandi; suba \`maxExpandir\` para ir até o fim`);
    } else {
      usos = await expandirUsos(session, expansiveis.map((x) => x.id), { lote });
      expandido = true;
    }
  }

  // Sem expandir, todo expansível é uso em código que se sabe existir e não se sabe onde.
  // Com expansão, só continua buraco o nó que não devolveu snippet nenhum.
  const semSnippet = expandido
    ? expansiveis.filter((x) => !usos.some((u) => u.id === x.id)).length
    : expansiveis.length;
  const completo = !vazio && semSnippet === 0;
  if (!completo && !vazio) {
    detalhe(`⚠️ resultado PARCIAL — ${semSnippet} nó(s) de uso em código sem localização` +
      (expandido ? '' : ' (passe `{ expandir: true }` para trazer arquivo e linha)'));
    for (const x of expansiveis.slice(0, 10)) if (!expandido || !usos.some((u) => u.id === x.id)) detalhe(`   sem localização: ${x.uri}`);
  }

  let usosAntesDoFiltro;
  if (acesso && usos) {
    usosAntesDoFiltro = usos;
    usos = filtrarPorAcesso(usos, acesso);
    detalhe(`filtro de acesso "${acesso}": ${usos.length} de ${usosAntesDoFiltro.length} ocorrência(s)`);
  }

  return {
    ...res, ocorrencias, colapsados, expansiveis, containers, completo, expandido,
    ...(usos ? { usos } : {}), ...(usosAntesDoFiltro ? { usosAntesDoFiltro } : {}),
  };
}

/**
 * Filtra ocorrências do `expandirUsos` por modo de acesso. PURO.
 * ⚠️ **Isto responde sobre a VARIÁVEL, não sobre o BANCO** — ver o ponto 5 de `expandirUsos`.
 * `escrita` = alguma posição do `matches` é `accessWrite`; `leitura` = alguma é `accessRead` e
 * nenhuma é `accessWrite` (linha que lê e escreve conta como escrita, que é a pergunta cara).
 * O `accessUnknown` fica de fora dos dois: não é ausência de uso, é ausência de resposta.
 */
export function filtrarPorAcesso(usos, acesso) {
  if (acesso !== 'escrita' && acesso !== 'leitura') {
    throw new Error(`filtro de acesso inválido: ${JSON.stringify(acesso)} — use 'escrita' ou 'leitura'`);
  }
  const tem = (u, modo) => (u.acessos || []).some((a) => a.acesso === modo);
  return (usos || []).filter((u) => (acesso === 'escrita' ? tem(u, 'accessWrite') : tem(u, 'accessRead') && !tem(u, 'accessWrite')));
}

// ---------- expandir o nó colapsado (usage snippets) ----------
// Endpoint: POST /sap/bc/adt/repository/informationsystem/usageSnippets (sem query string).
// É a SEGUNDA metade do where-used, e a que resolve o ponto 2/3 acima: o `usageReferences` diz QUEM
// usa e deixa o uso em código colapsado; o `usageSnippets` diz ONDE, linha e coluna, com o trecho.
// Medido em 05/09/2026 no s4h 250 (POC_whereused_expandir), status 200 em todos os casos.
//
//  1. A CHAVE NÃO É A URI DO NÓ — é o `<objectIdentifier>` que vem DENTRO do nó colapsado
//     (`ABAPFullName;SAPLJ1BB2;LJ1BB2F02;\FU:J_1B_NF_OBJECT_CHECK;2`). Ele identifica o par
//     (quem usa, o que é usado) de uma vez; a URI do nó sozinha só perguntaria "quem usa o include".
//     Só nó de uso em CÓDIGO traz esse identifier — pacote e grupo de função vêm sem, e não expandem.
//
//  2. ⚠️ O IDENTIFIER VAI LITERAL, E A CONTRABARRA IMPORTA — mais um silêncio da família: mandar
//     `…;FU:J_1B_NF_OBJECT_CHECK;2` (sem a `\`) responde **200 com a lista de snippets VAZIA**,
//     indistinguível de "não há uso aqui". Medida a contraprova nos dois sentidos, mesmo id.
//
//  3. Um identifier rende N snippets — é um por OCORRÊNCIA, não por objeto. No J_1BNFNUM_UTILITIES,
//     12 identifiers renderam 22 snippets (um include com 5 linhas de uso conta 5).
//     Consequência: `numberOfResults` do usageReferences NÃO é o número de linhas de uso; expandido
//     pode passar do anunciado. (No mesmo objeto: 14 anunciados, 22 snippets.)
//
//  4. A URI do snippet aponta o FONTE onde se lê o uso, já resolvido — o include `LJ1BB2U02` sai
//     como `/sap/bc/adt/functions/groups/j1bb2/fmodules/j_1b_nf_object_edit_new/source/main#start=
//     436,19;end=436,39`. É a URI que o `getSource` lê e o fragmento diz a linha.
//
//  5. `matches` é uma LISTA, não um valor — `<ini>-<fim>,access<Modo>,grade<Tipo>` separados por
//     `;`, um por TOKEN casado na linha, com os offsets dentro do `content` (0-based, fim exclusivo).
//     Medido em 06/09/2026 no s4h 250 (item 96), em laboratório Z com escrita certa:
//     • **`accessWrite` EXISTE**, e vem sempre com `gradeComponent` — é do COMPONENTE, não do
//       objeto. `ls_reg-valor = 'X'` → `9-14,accessWrite,gradeComponent`;
//       `zcl_x=>gv_valor = 'X'` → `2-16,accessUnknown,gradeDirect;18-26,accessWrite,gradeComponent`.
//     • ⚠️ **Ler o primeiro `access\w+` da string devolve o token ERRADO** e esconde a escrita — era
//       o que o parser fazia até aqui. Hoje há `acessos` (a lista com o `trecho` de cada offset) e
//       `acesso` é o primeiro token que não é `accessUnknown`.
//     • ⚠️ **E o acesso é sobre a VARIÁVEL EM MEMÓRIA, não sobre o BANCO.** Medido no mesmo fonte:
//       `INSERT zpoc_wu_t FROM ls_reg` saiu **`accessRead`** no nome da tabela, e
//       `UPDATE zpoc_wu_t SET valor = …` saiu **`accessUnknown`** nos três tokens. Escrita no banco
//       NÃO é `accessWrite`. Quem quiser "quem grava a tabela" segue no canal de fonte/debug — o que
//       o filtro `acesso: 'escrita'` entrega é a atribuição em work area/atributo/variável, que é um
//       PROXY do padrão comum (`ls-campo = v.` … `INSERT`), nunca a resposta completa.
//
//  6. A CHAMADA É CARA, e o preço é por CHAMADA, não por id — daí o lote grande. Medido com os
//     9.321 identifiers do CL_SALV_TABLE: 10 ids → 35 s, 25 → 36 s, 50 → 32 s, 100 → 71 s,
//     200 → 48 s, 500 → 142 s, e **2000 → `fetch failed` depois de 308 s**. Por isso `lote` = 200
//     (o melhor custo/benefício medido, com folga para o teto que quebra) e por isso `whereUsed`
//     só expande até `maxExpandir` nós: expandir um CL_SALV_TABLE inteiro é dezenas de minutos, e
//     tem de ser pedido de propósito.

const CAMINHO_SNIPPETS = '/sap/bc/adt/repository/informationsystem/usageSnippets';
const CT_SNIPPETS = 'application/vnd.sap.adt.repository.usagesnippets.request.v1+xml';
const ACCEPT_SNIPPETS = 'application/vnd.sap.adt.repository.usagesnippets.result.v1+xml';

const corpoSnippets = (ids) =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<usagereferences:usageSnippetRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">' +
  '<usagereferences:objectIdentifiers>' +
  ids.map((id) => `<usagereferences:objectIdentifier>${escapeXml(id)}</usagereferences:objectIdentifier>`).join('') +
  '</usagereferences:objectIdentifiers>' +
  '</usagereferences:usageSnippetRequest>';

// O identifier tem `&` em nomes de objeto raros e `<`/`>` nunca — mas ele vai LITERAL (ponto 2),
// então o único tratamento é o mínimo de XML, sem tocar na contrabarra.
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Um `matches` é uma LISTA — `<ini>-<fim>,access<Modo>,grade<Tipo>` separados por `;`, um por TOKEN
 * casado na linha, com os offsets dentro do `conteudo` (0-based, fim exclusivo). PURO.
 * Medido em 06/09/2026 no s4h 250 (item 96): numa linha com vários tokens só o do COMPONENTE traz o
 * acesso de verdade — `zcl_x=>gv_valor = 'A'` casa `zcl_x` (accessUnknown, gradeDirect) E `gv_valor`
 * (accessWrite, gradeComponent). Ler o primeiro `access\w+` da string, como se fazia até aqui,
 * devolve o token errado e ESCONDE a escrita.
 */
export function parseMatches(matches) {
  const saida = [];
  for (const parte of String(matches || '').split(';')) {
    const m = parte.match(/^(\d+)-(\d+),(access\w*),(grade\w*)$/);
    if (m) saida.push({ inicio: Number(m[1]), fim: Number(m[2]), acesso: m[3], grade: m[4] });
  }
  return saida;
}

/**
 * Extrai os snippets do XML do usageSnippets. PURO (sem rede).
 * Cada item: `{ id, uri, fonte, linha, coluna, acesso, grade, acessos, matches, conteudo, descricao }`.
 * `acessos` é o `matches` já quebrado por token (com `trecho`, o texto que cada offset cobre);
 * `acesso`/`grade` são os do primeiro token DECISIVO — o primeiro que não é `accessUnknown` —, e
 * caem no primeiro token quando todos são desconhecidos. Nas 14 linhas medidas nunca houve dois
 * tokens não-`Unknown` na mesma linha; `acessos` fica para quem precisar do caso não medido.
 */
export function parseUsageSnippets(xml) {
  const texto = String(xml);
  const itens = [];
  // Os `codeSnippetObject` não aninham; cada um agrupa os snippets de um objectIdentifier.
  const aberturas = [...texto.matchAll(/<[\w.-]+:codeSnippetObject\b[^>]*>/g)];
  aberturas.forEach((m, i) => {
    const ate = i + 1 < aberturas.length ? aberturas[i + 1].index : texto.length;
    const bloco = texto.slice(m.index, ate);
    const id = (bloco.match(/<objectIdentifier>([^<]*)<\/objectIdentifier>/) || [])[1] || '';
    for (const [, attrs, miolo] of bloco.matchAll(/<[\w.-]+:codeSnippet\b([^>]*)>([\s\S]*?)<\/[\w.-]+:codeSnippet>/g)) {
      const na = (chave) => (attrs.match(new RegExp(`${chave}="([^"]*)"`)) || [])[1] || '';
      const uri = na('uri');
      const matches = na('matches');
      const pos = uri.match(/start=(\d+),(\d+)/) || [];
      const conteudo = destexto((miolo.match(/<content>([\s\S]*?)<\/content>/) || [])[1] || '');
      const acessos = parseMatches(matches).map((a) => ({ ...a, trecho: conteudo.slice(a.inicio, a.fim) }));
      const decisivo = acessos.find((a) => a.acesso !== 'accessUnknown') || acessos[0];
      itens.push({
        id,
        uri,
        fonte: uri.split('#')[0],
        linha: Number(pos[1] || 0),
        coluna: Number(pos[2] || 0),
        acesso: decisivo?.acesso || '',
        grade: decisivo?.grade || '',
        acessos,
        matches,
        conteudo,
        descricao: destexto((miolo.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || ''),
      });
    }
  });
  return itens;
}

const destexto = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

/**
 * Expande nós colapsados do where-used: dado o `id` (`objectIdentifier`) de cada nó, devolve as
 * OCORRÊNCIAS — arquivo, linha, coluna e o trecho de código.
 * @param session sessão viva
 * @param {string[]} ids  os `id` dos nós colapsados (`whereUsed(...).colapsados[].id`)
 * @param {{lote?: number}} opts  `lote` = ids por requisição (default 200 — ver ponto 6 acima)
 * @returns array de snippets (ver `parseUsageSnippets`)
 */
export async function expandirUsos(session, ids, { lote = 200 } = {}) {
  const alvos = [...new Set((ids || []).filter(Boolean))];
  if (!alvos.length) return [];
  passo(`expandir usos: ${alvos.length} nó(s) colapsado(s)`);

  const saida = [];
  for (let i = 0; i < alvos.length; i += lote) {
    const fatia = alvos.slice(i, i + lote);
    const r = await call(session, {
      method: 'POST',
      path: CAMINHO_SNIPPETS,
      accept: ACCEPT_SNIPPETS,
      contentType: CT_SNIPPETS,
      body: corpoSnippets(fatia),
    });
    if (r.status >= 400) {
      throw new Error(`expandir usos falhou (${r.status}) no lote ${i / lote + 1}: ${r.text.slice(0, 300)}`);
    }
    saida.push(...parseUsageSnippets(r.text));
  }

  // Nó que não devolveu snippet nenhum é o sintoma do ponto 2 (identifier alterado) ou de um uso
  // que o servidor não sabe localizar. Dizer isso é melhor do que somer com ele.
  const rendeu = new Set(saida.map((x) => x.id));
  const mudos = alvos.filter((id) => !rendeu.has(id));
  detalhe(`${saida.length} ocorrência(s) em ${rendeu.size} nó(s)${mudos.length ? ` · ⚠️ ${mudos.length} nó(s) sem snippet` : ''}`);
  for (const id of mudos.slice(0, 5)) detalhe(`   sem snippet: ${id}`);

  return saida;
}

// ---------- o TERCEIRO canal de where-used: /whereused (RIS clássico) — MEDIDO, não implementado ----------
// Endpoint: POST /sap/bc/adt/repository/informationsystem/whereused?RIS_REQUEST_TYPE=<ação>
// Medido em 06/09/2026 no s4h 250 (item 97, POC_whereused_endpoint/medicoes/item97-whereused.md).
// O discovery o anuncia ao lado do `usageReferences` e do `usageSnippets`, mas com `templateLinks`
// VAZIO — sem template de URI e sem `app:accept`. Não é uma variante dos outros dois: é o where-used
// do **RIS clássico** (o do SE84/SE11), com outra pergunta e outro custo. Está documentado aqui, e
// não implementado, porque quem já usa `whereUsed` não precisa dele — a decisão de adotá-lo é de
// quem tiver a pergunta estreita do ponto 4.
//
//  1. SÓ POST. GET responde 405 (`ExceptionMethodNotSupported`) em qualquer Accept, com ou sem
//     `?uri=`; OPTIONS responde 400 antes mesmo do ADT.
//
//  2. O QUE FALTA NO 500 É UM QUERY PARAMETER, NÃO O CORPO. POST sem `RIS_REQUEST_TYPE` responde
//     500 `Kein Service für ID gefunden` (namespace `com.sap.adt.ris`) — IDÊNTICO com corpo vazio e
//     com corpo cheio, porque o handler decide antes de ler o corpo. As três ações, do fonte de
//     `CL_RIS_ADT_RES_WHERE_USED`: `WHERE_USED`, `WHERE_USED_LAZY`, `CODE_LINES`.
//
//  3. O CORPO É `application/xml` PURO (nada de vendor type) e SEM NAMESPACE — o esquema é a ST
//     `RIS_ST_ADT_REQUEST`, lida no servidor:
//       <ris_request><object_type>trobjtype/subtype/legacy_type</object_type>
//                    <scope_object>… + object_name/encl_object_name</scope_object>
//                    <payload>… + object_name/encl_object_name/full_name</payload></ris_request>
//     Os códigos não precisam de chute: `POST /repository/informationsystem/fullnamemapping?
//     RIS_REQUEST_TYPE=MAP_URI_TO_RIS_REQUEST&uri=<uri ADT>` (Content-Type text/plain, corpo vazio)
//     traduz uma URI ADT no `ris_data_request` pronto; e `POST /repository/informationsystem/
//     metadata?RIS_REQUEST_TYPE=WUL_TYPES_COMPLETE` lista os escopos válidos daquele objeto (32
//     tipos para um DTEL: TABL/DTF, TABL/DSF, CLAS/OC, PROG/P, FUGR/FF, DDLS/DF, …).
//
//  4. ⚠️ `<object_type>` É O TIPO DO RESULTADO, NÃO O DO ALVO — e trocar os dois responde
//     **200 com ZERO BYTE**, sem erro e sem `numberOfResults`. É a pior versão do silêncio da
//     família (`buscar` truncado, prefixo de namespace do `usageReferences`): lista vazia é
//     indistinguível de "não há usos". Medido: `object_type=DTEL/DE` + `payload=DTEL/DE MATNR` —
//     um DTEL com 41.226 usos pelo outro canal — devolveu 0 bytes; com `object_type=TABL/DTF` o
//     mesmo payload responde. Quem chamar isto pergunta UM TIPO DE RESULTADO por vez.
//
//  5. O CUSTO É O INVERSO DO `usageReferences`, e é por isso que ele existe. Mesmo DTEL
//     (J_1BNFNUM_UTILITIES), mesma sessão: `usageReferences` 1 chamada, 913 ms, 29 refs com
//     containers e 12 nós que ainda pedem o `usageSnippets`; `/whereused` 10 chamadas (uma por
//     tipo), 4.884 ms, 18 usos JÁ resolvidos (`enclosing_object` + `object` + uri ADT), sem
//     colapsado. Os dois concordam nos objetos reais. Ou seja: para "que CLASSES usam este DE?"
//     são **54 ms contra 913 ms** (17x menos, sem segunda chamada); para varrer tudo é ~5x mais caro.
//
//  6. `WHERE_USED` devolve `<ris_generic_results>` (enxuto). `WHERE_USED_LAZY` devolve
//     `<ris_where_used_results>` com um `object_descriptor` gordo — o nome engana, "lazy" traz
//     MAIS: em `TABL T000` são 34,5 MB contra 7,6 MB. No fonte, o `LAZY` é o único que lê
//     `<scope_object>` e `<full_name>`; o `WHERE_USED` simples ignora os dois.
//
//  7. ⚠️ E ELE ESTOURA O `fetch` DO NODE: `object_type=TABL/DTF` + `payload=DTEL/DE MATNR` passou
//     dos 300 s do `headersTimeout` do undici (`UND_ERR_HEADERS_TIMEOUT`) — o cliente morre antes
//     de o SAP responder, e `call` não tem timeout próprio hoje.
//
//  Não medido: o corpo do `CODE_LINES` (400 `ExceptionResourceWrongData` com o `<ris_request>`); o
//  efeito real do `<scope_object>` (a única tentativa não mudou um byte); alvo que não seja DTEL/TABL.
