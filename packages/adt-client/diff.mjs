// diff.mjs — o MESMO objeto em DOIS sistemas: igual, diferente, ou só num deles.
//
// A pergunta é "o QA é o DEV?", e a via é ler o objeto nos dois pelo ADT e comparar. Nada é escrito
// em sistema nenhum: este módulo só faz GET (é o único da lib que não tem caminho de escrita).
//
// Medido 2026-09-01, s4h 758 (moovi) × sxd 816 (KART) — `docs/receita-diff-entre-sistemas.md`:
//
//   • **A leitura é estável**: o mesmo objeto lido duas vezes no mesmo sistema volta byte a byte
//     igual, e o `/source/main` vem com CRLF em ABAP (classe/interface) e LF puro no DDL de tabela
//     — no MESMO sistema. Comparar sem normalizar a quebra de linha compararia o formato, não o
//     conteúdo.
//   • **`getSource` sozinho MENTE em três situações**, e as três dão "igual":
//     (1) tipo forma `xml` (DTEL, DOMA, TTYP…) NÃO tem `/source/main` — responde 404 com o texto
//         "Nenhum recurso adequado encontrado" nos DOIS sistemas, e dois corpos de erro iguais
//         comparam iguais;
//     (2) parte de classe ausente (`includes/testclasses` de uma classe sem teste) responde 404 nos
//         dois, com o mesmo XML de exceção;
//     (3) o `/source/main` da CLASSE não traz os includes locais — duas classes com `main` idêntico e
//         classes de teste diferentes comparam iguais.
//     Daí o guard-rail: **só compara o que veio 200 dos dois lados**; o resto é `ausente`, nunca `igual`.
//   • **O XML do objeto não é comparável cru.** Para o MESMO objeto padrão (DTEL BUKRS, DOMA BUKRS,
//     DTEL MATNR) o XML difere sempre em duas coisas, nenhuma delas conteúdo: o `adtcore:changedAt`
//     (o s4h devolve 11:33:42Z e o sxd 14:33:42Z para a MESMA alteração de 2018 — é o fuso do
//     servidor, o mesmo torto dos itens 22/28) e a lista de `<atom:link>` do ADT, que cresce com o
//     release (4 links no 758, 5–6 no 816). Limpados os dois, os três objetos ficam IDÊNTICOS.
//   • **Carimbo de data não responde a pergunta, e não dá para corrigir por deslocamento fixo.** No
//     mesmo par de sistemas o mesmo objeto sai com 3 h de diferença (`IF_OO_ADT_CLASSRUN`, alterado
//     em 2018-01) e com 4 h (`TADIR`, 2019-11; `DOMA BUKRS`, 1998-02) — o deslocamento depende da
//     data gravada. "Mudou depois" entre dois sistemas é indecidível por ele; quem responde é o
//     conteúdo. Por isso o carimbo sai como AVISO e nunca como veredito.
//   • **Caixa e espaço são ruído real, e não em todo objeto.** Em `CL_SALV_TABLE` (758 × 816) a
//     divergência crua é 197/175 linhas e cai para 74/52 ignorando espaço e caixa — 62% do "difere"
//     era pretty-print (`CLASS cl_salv_table DEFINITION` × `class CL_SALV_TABLE definition`). Nos
//     outros cinco objetos do corpus a normalização não mudou nada. Por isso ela é OPCIONAL e
//     declarada: o default só normaliza quebra de linha e espaço no fim da linha.
//   • `ignorarCaixa` NUNCA toca literal (`'…'`, `` `…` ``, `|…|`) nem comentário (`*` na coluna 1,
//     `"` até o fim): ABAP é case-insensitive no código e case-SENSITIVE no texto.
//
// Onde isto mora, e por que aqui (decisão do item 35): o motor fica na lib, não no `jbv-abapgit`.
// O CLI compara CHECKOUTS — precisa de destino em disco, de um tipo que ele saiba baixar e de duas
// passadas completas; aqui a comparação é de leitura direta, objeto a objeto, e alcança todo tipo do
// registro (inclusive os de forma `xml`, que o checkout não escreve). Quem quiser o diff em disco
// versiona o checkout; quem quer a resposta ("o QA é o DEV?") chama `compararObjetos`.

import { call, encerrarSessao } from './sap-connection.mjs';
import { objPath, TYPES } from './adt-client.mjs';
import { moduloDe } from './tipos/index.mjs';
import { passo, detalhe } from './log.mjs';

// ---------- partes de um objeto ----------

// A classe é o único tipo cujo fonte mora em MAIS DE UM recurso: o `main` e os quatro includes
// locais. `definitions/implementations/macros` existem sempre (mesmo vazios); `testclasses` só
// quando a classe nasceu com o include declarado (ver tipos/class.mjs).
export const INCLUDES_DE_CLASSE = ['definitions', 'implementations', 'macros', 'testclasses'];

/** PURO: quais recursos de fonte um tipo tem. Vazio = o tipo não tem `/source/main` (forma `xml`). */
export function partesDoTipo(tipo) {
  const mod = moduloDe(tipo);
  if (!mod.source) return [];
  return mod.libKey === 'class' ? ['main', ...INCLUDES_DE_CLASSE] : ['main'];
}

// ---------- normalização (PURA) ----------

/**
 * PURO: minúsculas FORA de literal e de comentário. ABAP é case-insensitive no código e
 * case-sensitive no texto — `WRITE 'abc'` e `WRITE 'ABC'` são programas diferentes.
 */
export function minusculasForaDeLiteral(linha) {
  const s = String(linha ?? '');
  if (/^\s*\*/.test(s)) return s;                 // comentário de linha inteira: intocado
  let fora = '', i = 0, aspas = null;
  while (i < s.length) {
    const c = s[i];
    if (aspas) { fora += c; if (c === aspas) aspas = null; i++; continue; }
    if (c === "'" || c === '`' || c === '|') { aspas = c; fora += c; i++; continue; }
    if (c === '"') { fora += s.slice(i); break; } // comentário até o fim da linha
    fora += c.toLowerCase(); i++;
  }
  return fora;
}

/**
 * PURO: o texto virado em linhas de comparação. O default é conservador — quebra de linha e espaço
 * no fim, que são formato de transporte, não conteúdo. `ignorarEspaco` e `ignorarCaixa` são
 * decisões de quem compara (ver a medição do CL_SALV_TABLE no cabeçalho).
 */
export function normalizarFonte(texto, { ignorarEspaco = false, ignorarCaixa = false, ignorarVazias = false } = {}) {
  let linhas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  if (ignorarEspaco || ignorarCaixa) linhas = linhas.map((l) => l.replace(/[ \t]+/g, ' ').trim());
  if (ignorarCaixa) linhas = linhas.map(minusculasForaDeLiteral);
  if (ignorarVazias) linhas = linhas.filter((l) => l !== '');
  return linhas;
}

// O que o ADT acrescenta ao XML e NÃO é do objeto: os links de navegação (variam com o release) e os
// carimbos (variam com o fuso do servidor). Ver a medição no cabeçalho.
const ATRIBUTOS_VOLATEIS = ['adtcore:changedAt', 'adtcore:createdAt', 'adtcore:version', 'adtcore:etag'];

/** PURO: o XML sem o que é do ADT/servidor — o que sobra é comparável entre sistemas. */
export function limparXmlVolatil(xml) {
  let s = String(xml ?? '').replace(/<atom:link\b[^>]*\/>/g, '').replace(/\s+xmlns:atom="[^"]*"/g, '');
  for (const a of ATRIBUTOS_VOLATEIS) s = s.replace(new RegExp(`\\s${a}="[^"]*"`, 'g'), '');
  return s;
}

/** PURO: os atributos `ns:nome="valor"` de um XML, na ordem em que aparecem (repetidos viram lista). */
export function atributosDoXml(xml) {
  const m = {};
  for (const [, k, v] of String(xml ?? '').matchAll(/([\w.-]+:[\w.-]+)="([^"]*)"/g)) (m[k] ??= []).push(v);
  return m;
}

/**
 * PURO: a diferença ATRIBUTO A ATRIBUTO entre dois XML já limpos — a forma legível de comparar tipo
 * de forma `xml`, onde a definição é o próprio XML e um diff de texto só diria "a linha 1 mudou".
 */
export function diffAtributos(xmlA, xmlB) {
  const A = atributosDoXml(xmlA), B = atributosDoXml(xmlB);
  const dif = [];
  for (const k of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()) {
    const a = (A[k] || []).join(' | '), b = (B[k] || []).join(' | ');
    if (a !== b) dif.push({ atributo: k, a, b });
  }
  return dif;
}

// ---------- diff de linhas (PURO) ----------

// Âncoras do "patience diff": linhas que aparecem UMA vez de cada lado. São o esqueleto que impede o
// diff de casar linhas repetidas (`ENDIF.`, `ENDMETHOD.`) e produzir hunks sem sentido.
function ancoras(a, b) {
  const unico = (linhas) => {
    const m = new Map();
    linhas.forEach((l, i) => m.set(l, m.has(l) ? -1 : i));
    return m;
  };
  const ua = unico(a), ub = unico(b);
  const pares = [];
  for (const [linha, ia] of ua) {
    if (ia < 0) continue;
    const ib = ub.get(linha);
    if (ib === undefined || ib < 0) continue;
    pares.push([ia, ib]);
  }
  pares.sort((x, y) => x[0] - y[0]);

  // maior subsequência crescente em `ib` (paciência, com back-pointers)
  const pilhas = [], anterior = [];
  for (let k = 0; k < pares.length; k++) {
    const v = pares[k][1];
    let lo = 0, hi = pilhas.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pares[pilhas[mid]][1] < v) lo = mid + 1; else hi = mid; }
    anterior[k] = lo > 0 ? pilhas[lo - 1] : -1;
    pilhas[lo] = k;
  }
  const saida = [];
  for (let k = pilhas.length ? pilhas[pilhas.length - 1] : -1; k >= 0; k = anterior[k]) saida.unshift(pares[k]);
  return saida;
}

/**
 * PURO: o diff de duas listas de linhas. Devolve operações `=` (comum), `-` (só em A) e `+` (só em B),
 * cada uma com o número de linha de origem (1-based). Estratégia: prefixo/sufixo comum, âncoras
 * únicas, recursão nos vãos; sem âncora, o vão sai como bloco removido + bloco acrescentado.
 */
export function diffLinhas(a, b, { profundidadeMaxima = 12 } = {}) {
  const ops = [];
  rec(a, b, 0, 0, 0);
  return ops;

  function rec(A, B, offA, offB, prof) {
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    for (let k = 0; k < i; k++) ops.push({ op: '=', texto: A[k], a: offA + k + 1, b: offB + k + 1 });

    let j = 0;
    while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;

    const meioA = A.slice(i, A.length - j), meioB = B.slice(i, B.length - j);
    if (meioA.length || meioB.length) {
      const anc = prof < profundidadeMaxima && meioA.length && meioB.length ? ancoras(meioA, meioB) : [];
      if (!anc.length) {
        for (let k = 0; k < meioA.length; k++) ops.push({ op: '-', texto: meioA[k], a: offA + i + k + 1, b: null });
        for (let k = 0; k < meioB.length; k++) ops.push({ op: '+', texto: meioB[k], a: null, b: offB + i + k + 1 });
      } else {
        let pa = 0, pb = 0;
        for (const [ia, ib] of anc) {
          rec(meioA.slice(pa, ia), meioB.slice(pb, ib), offA + i + pa, offB + i + pb, prof + 1);
          ops.push({ op: '=', texto: meioA[ia], a: offA + i + ia + 1, b: offB + i + ib + 1 });
          pa = ia + 1; pb = ib + 1;
        }
        rec(meioA.slice(pa), meioB.slice(pb), offA + i + pa, offB + i + pb, prof + 1);
      }
    }

    const nA = A.length - j, nB = B.length - j;
    for (let k = 0; k < j; k++) ops.push({ op: '=', texto: A[nA + k], a: offA + nA + k + 1, b: offB + nB + k + 1 });
  }
}

/** PURO: quantas linhas divergem (`-` e `+`) e quantas são comuns. */
export function resumirOps(ops) {
  const r = { comuns: 0, soEmA: 0, soEmB: 0 };
  for (const o of ops) r[o.op === '=' ? 'comuns' : o.op === '-' ? 'soEmA' : 'soEmB']++;
  return { ...r, iguais: r.soEmA === 0 && r.soEmB === 0 };
}

/**
 * PURO: o diff em formato unificado (o do `git diff`), com N linhas de contexto. `originaisA/B`
 * permitem mostrar a linha COMO ELA É no sistema quando a comparação rodou sobre linha normalizada.
 */
export function formatarUnificado(ops, { contexto = 3, rotuloA = 'A', rotuloB = 'B', originaisA = null, originaisB = null, maxLinhas = 400 } = {}) {
  const texto = (o) => {
    if (o.op !== '+' && originaisA && o.a) return originaisA[o.a - 1] ?? o.texto;
    if (o.op === '+' && originaisB && o.b) return originaisB[o.b - 1] ?? o.texto;
    return o.texto;
  };
  const marcado = ops.map((o, i) => ({ o, i, perto: false }));
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].op === '=') continue;
    for (let k = Math.max(0, i - contexto); k <= Math.min(ops.length - 1, i + contexto); k++) marcado[k].perto = true;
  }
  const linhas = [];
  let bloco = null;
  for (const m of marcado) {
    if (!m.perto) { bloco = null; continue; }
    if (!bloco) {
      bloco = { a: m.o.a ?? 0, b: m.o.b ?? 0 };
      linhas.push(`@@ ${rotuloA} ${bloco.a || '-'} · ${rotuloB} ${bloco.b || '-'} @@`);
    }
    linhas.push(`${m.o.op === '=' ? ' ' : m.o.op}${texto(m.o)}`);
  }
  if (linhas.length > maxLinhas) return [...linhas.slice(0, maxLinhas), `… (${linhas.length - maxLinhas} linhas a mais)`].join('\n');
  return linhas.join('\n');
}

// ---------- leitura (I/O) ----------

/** PURO: os metadados que o XML do objeto carrega. `changedAt` vem no FUSO DO SERVIDOR (ver cabeçalho). */
export function metaDoXml(xml) {
  const p = (n) => (String(xml ?? '').match(new RegExp(`${n}="([^"]*)"`)) || [])[1] ?? null;
  return {
    nome: p('adtcore:name'), tipo: p('adtcore:type'), descricao: p('adtcore:description'),
    versao: p('adtcore:version'), responsavel: p('adtcore:responsible'),
    idiomaMestre: p('adtcore:masterLanguage'), sistemaMestre: p('adtcore:masterSystem'),
    alteradoEm: p('adtcore:changedAt'), alteradoPor: p('adtcore:changedBy'),
    criadoEm: p('adtcore:createdAt'), criadoPor: p('adtcore:createdBy'),
  };
}

/**
 * Lê um objeto INTEIRO para comparação: o XML do objeto e cada parte de fonte que o tipo tem.
 * Somente GET. Uma parte que responde 404 fica com `existe: false` — e nunca entra como texto.
 */
export async function lerObjeto(session, { tipo, nome, extra = {} }) {
  const mod = moduloDe(tipo);
  const caminho = objPath(tipo, nome, extra);
  const r = await call(session, { path: caminho, accept: mod.accept || mod.ct || TYPES[mod.libKey]?.ct || 'application/*' });
  const objeto = {
    tipo: mod.libKey, codigo: mod.codigo, nome: String(nome).toUpperCase(), caminho,
    existe: r.status === 200, status: r.status,
    xml: r.status === 200 ? r.text : null,
    meta: r.status === 200 ? metaDoXml(r.text) : null,
    partes: [],
  };
  if (!objeto.existe) return objeto;

  for (const parte of partesDoTipo(tipo)) {
    const p = parte === 'main' ? `${caminho}/source/main` : `${caminho}/includes/${parte}`;
    const s = await call(session, { path: p, accept: 'text/plain' });
    objeto.partes.push({ parte, existe: s.status === 200, status: s.status, texto: s.status === 200 ? s.text : null });
  }
  return objeto;
}

// ---------- comparação ----------

const VEREDITOS = { igual: 'igual', difere: 'difere', soEmA: 'soEmA', soEmB: 'soEmB', ausente: 'ausente' };

/**
 * PURO: compara duas leituras de `lerObjeto`. Nenhuma rede — é aqui que mora a regra, e por isso ela
 * é testável sem SAP.
 *
 * Guard-rail medido: parte que NÃO veio 200 dos dois lados nunca vira "igual". Dois 404 comparam
 * iguais como texto (o corpo de erro é o mesmo nos dois sistemas) e diriam que uma classe sem teste
 * "tem a mesma classe de teste".
 */
export function compararLeituras(a, b, { ignorarEspaco = false, ignorarCaixa = false, contexto = 3, rotuloA = 'A', rotuloB = 'B' } = {}) {
  if (!a.existe && !b.existe) return { veredito: VEREDITOS.ausente, tipo: a.tipo, nome: a.nome, partes: [], atributos: [], avisos: [`não existe em ${rotuloA} (HTTP ${a.status}) nem em ${rotuloB} (HTTP ${b.status})`] };
  if (a.existe && !b.existe) return { veredito: VEREDITOS.soEmA, tipo: a.tipo, nome: a.nome, partes: [], atributos: [], avisos: [`só existe em ${rotuloA} — ${rotuloB} respondeu HTTP ${b.status}`] };
  if (!a.existe && b.existe) return { veredito: VEREDITOS.soEmB, tipo: b.tipo, nome: b.nome, partes: [], atributos: [], avisos: [`só existe em ${rotuloB} — ${rotuloA} respondeu HTTP ${a.status}`] };

  const opcoes = { ignorarEspaco, ignorarCaixa };
  const partes = [];
  const nomes = [...new Set([...a.partes.map((p) => p.parte), ...b.partes.map((p) => p.parte)])];
  for (const nome of nomes) {
    const pa = a.partes.find((p) => p.parte === nome) || { existe: false, status: null };
    const pb = b.partes.find((p) => p.parte === nome) || { existe: false, status: null };
    if (!pa.existe && !pb.existe) { partes.push({ parte: nome, veredito: VEREDITOS.ausente, statusA: pa.status, statusB: pb.status }); continue; }
    if (pa.existe !== pb.existe) {
      partes.push({ parte: nome, veredito: pa.existe ? VEREDITOS.soEmA : VEREDITOS.soEmB, statusA: pa.status, statusB: pb.status });
      continue;
    }
    const la = normalizarFonte(pa.texto, opcoes), lb = normalizarFonte(pb.texto, opcoes);
    const ops = diffLinhas(la, lb);
    const r = resumirOps(ops);
    partes.push({
      parte: nome, veredito: r.iguais ? VEREDITOS.igual : VEREDITOS.difere,
      statusA: pa.status, statusB: pb.status, linhas: { a: la.length, b: lb.length }, resumo: r,
      diff: r.iguais ? '' : formatarUnificado(ops, {
        contexto, rotuloA, rotuloB,
        originaisA: String(pa.texto).replace(/\r\n?/g, '\n').split('\n'),
        originaisB: String(pb.texto).replace(/\r\n?/g, '\n').split('\n'),
      }),
    });
  }

  // Tipo sem fonte (forma `xml`): a definição É o XML, e a comparação é atributo a atributo.
  const atributos = diffAtributos(limparXmlVolatil(a.xml), limparXmlVolatil(b.xml));
  const semFonte = partes.length === 0;

  const avisos = [];
  if (a.meta?.alteradoEm !== b.meta?.alteradoEm) {
    avisos.push(`changedAt ${a.meta?.alteradoEm} × ${b.meta?.alteradoEm} — carimbo NÃO comparável entre sistemas (sai no fuso de cada servidor, e o deslocamento varia com a data: medido 3 h e 4 h no mesmo par)`);
  }
  if (a.meta?.sistemaMestre !== b.meta?.sistemaMestre) avisos.push(`masterSystem ${a.meta?.sistemaMestre} × ${b.meta?.sistemaMestre} — o objeto não veio do mesmo lugar`);

  const difereFonte = partes.some((p) => p.veredito === VEREDITOS.difere || p.veredito === VEREDITOS.soEmA || p.veredito === VEREDITOS.soEmB);
  const difereXml = semFonte && atributos.length > 0;
  return {
    veredito: difereFonte || difereXml ? VEREDITOS.difere : VEREDITOS.igual,
    tipo: a.tipo, nome: a.nome, partes, atributos,
    meta: { a: a.meta, b: b.meta },
    comparadoPor: semFonte ? 'xml' : 'fonte',
    avisos,
  };
}

/**
 * Compara N objetos entre DOIS sistemas. `lista`: [{ tipo, nome, extra? }].
 * Abre uma sessão STATELESS por sistema e a ENCERRA no fim — leitura não precisa de stateful, e
 * sessão órfã derruba o ADT (ver o cabeçalho de sap-connection.mjs).
 */
export async function compararObjetos(conexaoA, conexaoB, lista, opcoes = {}) {
  const rotuloA = opcoes.rotuloA || conexaoA.cfg?.alias || 'A';
  const rotuloB = opcoes.rotuloB || conexaoB.cfg?.alias || 'B';
  if (!Array.isArray(lista) || !lista.length) throw new Error('compararObjetos: informe ao menos um objeto ({ tipo, nome })');
  if (conexaoA.cfg?.base === conexaoB.cfg?.base) {
    throw new Error(
      `GUARD-RAIL: os dois lados apontam para ${conexaoA.cfg?.base} — o repositório ABAP é CROSS-CLIENT, ` +
      'então comparar dois mandantes do mesmo sistema devolve "igual" sempre e não prova nada.',
    );
  }
  passo(`diff: ${lista.length} objeto(s) · ${rotuloA} × ${rotuloB}`);

  const sa = await conexaoA.sessaoStateless();
  let sb = null;
  try {
    sb = await conexaoB.sessaoStateless();
    const itens = [];
    for (const alvo of lista) {
      const [a, b] = await Promise.all([lerObjeto(sa, alvo), lerObjeto(sb, alvo)]);
      const r = compararLeituras(a, b, { ...opcoes, rotuloA, rotuloB });
      detalhe(`diff ${r.tipo}:${r.nome} → ${r.veredito}`);
      itens.push(r);
    }
    const conta = (v) => itens.filter((i) => i.veredito === v).length;
    return {
      sistemas: { a: rotuloA, b: rotuloB },
      itens,
      resumo: { total: itens.length, igual: conta('igual'), difere: conta('difere'), soEmA: conta('soEmA'), soEmB: conta('soEmB'), ausente: conta('ausente') },
    };
  } finally {
    await encerrarSessao(sa).catch(() => {});
    if (sb) await encerrarSessao(sb).catch(() => {});
  }
}

/** Atalho de um objeto só. */
export async function compararObjeto(conexaoA, conexaoB, alvo, opcoes = {}) {
  const r = await compararObjetos(conexaoA, conexaoB, [alvo], opcoes);
  return r.itens[0];
}

/** PURO: o relatório legível de `compararObjetos` — é o que se cola num ticket. */
export function relatorioMarkdown(resultado) {
  const { a, b } = resultado.sistemas;
  const linhas = [`# Diff ${a} × ${b}`, '',
    `| objeto | veredito | comparado por | detalhe |`, `|---|---|---|---|`];
  for (const i of resultado.itens) {
    const det = i.veredito === 'difere'
      ? (i.comparadoPor === 'xml'
        ? i.atributos.map((x) => x.atributo).join(', ')
        : i.partes.filter((p) => p.veredito !== 'igual' && p.veredito !== 'ausente')
          .map((p) => `${p.parte} (${p.veredito === 'difere' ? `-${p.resumo.soEmA}/+${p.resumo.soEmB}` : p.veredito})`).join(', '))
      : (i.avisos[0] || '');
    linhas.push(`| \`${i.tipo}:${i.nome}\` | ${i.veredito} | ${i.comparadoPor || '—'} | ${det} |`);
  }
  const r = resultado.resumo;
  linhas.push('', `${r.total} objeto(s): ${r.igual} igual · ${r.difere} difere · ${r.soEmA} só em ${a} · ${r.soEmB} só em ${b} · ${r.ausente} em nenhum.`);
  // Os avisos de quem NÃO difere já estão na coluna "detalhe" — repeti-los aqui só encompridaria o
  // relatório. Aqui entram os de quem difere, que a coluna gastou com o resumo do diff.
  for (const i of resultado.itens.filter((x) => x.veredito === 'difere')) {
    for (const av of i.avisos) linhas.push(`- ⚠️ \`${i.tipo}:${i.nome}\`: ${av}`);
  }
  for (const i of resultado.itens.filter((x) => x.veredito === 'difere')) {
    if (i.comparadoPor === 'xml') {
      linhas.push('', `## ${i.tipo}:${i.nome} — atributos`, '', `| atributo | ${a} | ${b} |`, '|---|---|---|');
      for (const x of i.atributos) linhas.push(`| ${x.atributo} | ${x.a} | ${x.b} |`);
      continue;
    }
    for (const p of i.partes.filter((x) => x.diff)) {
      linhas.push('', `## ${i.tipo}:${i.nome} · ${p.parte}`, '', '```diff', p.diff, '```');
    }
  }
  return linhas.join('\n');
}
