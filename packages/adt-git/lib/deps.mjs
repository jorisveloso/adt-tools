// deps.mjs — quais objetos Z/Y um fonte ABAP referencia. PURO (sem rede, sem disco).
//
// É o motor da descida do `clone`. O detector é HEURÍSTICO por natureza: só há o texto do fonte,
// e o SAP não expõe "o que este objeto usa" de forma direta. Por isso o par extrair→travar existe:
// o extrator é permissivo, e as travas é que fecham a fronteira.

const CANDIDATO = /\b[zy]\w{3,}\b/gi;

// ABAP tem duas formas de comentário: `*` na COLUNA 1 comenta a linha inteira; `"` comenta daí até o
// fim da linha. Nome citado em comentário não é dependência — é história.
function tirarComentarios(fonte) {
  return String(fonte)
    .split(/\r?\n/)
    .map((linha) => (linha.startsWith('*') ? '' : linha.split('"')[0]))
    .join('\n');
}

// Nomes DECLARADOS no próprio fonte. Este é o filtro que separa `zeile` (variável local alemã, e
// nome corriqueiro em ABAP) de `ZCL_UTIL` (objeto do repositório): não é o formato do nome, é o
// fato de ter sido declarado ali.
//
// Cobre as formas encadeadas (`DATA: a TYPE i, b TYPE string.`), em que só a primeira linha traz a
// palavra-chave e as seguintes são só `nome TYPE ...`.
const DECLARACAO = /^\s*(?:CLASS-)?(?:DATA|CONSTANTS|TYPES|FIELD-SYMBOLS|PARAMETERS|STATICS|RANGES|SELECT-OPTIONS)\s*:?/i;

// O próprio objeto se declara no fonte: `CLASS zcl_util DEFINITION`, `INTERFACE zif_x PUBLIC`,
// `REPORT zprog`, `FUNCTION-POOL zfg`. Ele não é dependência de si mesmo.
const AUTODECLARACAO = /^\s*(?:CLASS|INTERFACE|REPORT|PROGRAM|FUNCTION-POOL|TYPE-POOL)\s+(\w+)/gim;

function declaradosLocalmente(fonteSemComentario) {
  const nomes = new Set();
  let dentroDeEncadeada = false;

  for (const [, nome] of fonteSemComentario.matchAll(AUTODECLARACAO)) nomes.add(nome.toUpperCase());

  for (const linha of fonteSemComentario.split(/\r?\n/)) {
    const abre = DECLARACAO.test(linha);
    if (!abre && !dentroDeEncadeada) continue;

    const corpo = abre ? linha.replace(DECLARACAO, '') : linha;
    // primeiro identificador de cada item declarado (aceita <fs> de field-symbol)
    for (const item of corpo.split(',')) {
      const m = item.match(/^\s*<?(\w+)>?/);
      if (m) nomes.add(m[1].toUpperCase());
    }
    // `:` abre encadeamento; `.` fecha o comando
    dentroDeEncadeada = (abre ? /:/.test(linha) : dentroDeEncadeada) && !/\.\s*$/.test(linha);
  }
  return nomes;
}

/** Objetos Z/Y citados no fonte, em maiúsculas, sem repetição. */
export function extrairRefs(fonte) {
  const limpo = tirarComentarios(fonte);
  const locais = declaradosLocalmente(limpo);

  const achados = new Set();
  for (const token of limpo.match(CANDIDATO) || []) {
    const NOME = token.toUpperCase();
    if (!locais.has(NOME)) achados.add(NOME);
  }
  return [...achados];
}

// --- travas ---
//
// A descida em dependências Z/Y não tem fronteira natural: ZCL_A usa ZCL_B, que usa ZCL_C, e o grafo
// só termina no padrão SAP. Duas travas fecham essa fronteira, e o que elas cortam é SEMPRE relatado
// — corte silencioso é pior que corte, porque você acha que clonou tudo.

/**
 * Decide, para uma lista de referências, o que desce e o que é cortado.
 * @returns {{ desce: string[], cortados: Array<{objeto:string, motivo:string}> }}
 */
export function aplicarTravas(refs, { prefixos = [], profundidadeMaxima = 1, nivelAtual = 0 } = {}) {
  const desce = [];
  const cortados = [];

  // A profundidade vence o prefixo: chegou no limite, nada mais desce, por mais liberado que esteja.
  if (nivelAtual >= profundidadeMaxima) {
    for (const objeto of refs) {
      cortados.push({ objeto, motivo: `profundidade máxima (${profundidadeMaxima}) atingida` });
    }
    return { desce, cortados };
  }

  for (const objeto of refs) {
    const liberado = prefixos.some((p) => objeto.toUpperCase().startsWith(String(p).toUpperCase()));
    if (liberado) desce.push(objeto);
    else cortados.push({ objeto, motivo: 'prefixo não liberado' });
  }

  return { desce, cortados };
}
