// fila.mjs — a fila de trabalho local (markdown), um item por projeto.
//
// Formato (herdado da fila do jbv-adt-client, ver skill /todo):
//   - [ ] N. Título — detalhe (ponteiros)
//   > bloqueado: <motivo>              notinha sob o item, indentada com > (bloqueio manual)
//   > bloqueado até <data [hora]>: <motivo>   bloqueio que REABRE sozinho quando a data passa
//   > em andamento: <estado + próx passo>
//   - [x] N. Título — detalhe          item concluído (resultado em notinha `>`)
//
// A ORDEM no arquivo é a de execução; o NÚMERO é identidade (nunca muda; commits apontam "fila N").
// O alvo do `next` é o PRIMEIRO item aberto sem `> bloqueado:`; item com `> em andamento:` tem
// prioridade (retomar do estado descrito). Um `bloqueado até <momento>` cujo momento JÁ PASSOU
// deixa de bloquear (reabre sozinho, fuso local da máquina). Se todos os abertos estão bloqueados,
// não há próximo.
//
// O PARSER é puro (string → estrutura): sem disco, sem rede, testável offline. O I/O com o disco
// fica nas funções `*Arquivo`, que leem/escrevem o arquivo e delegam às puras.

// ---------- estruturas ----------
// Um item: { n, titulo, detalhe, feito, notas: [{ tipo, texto }] }.
//   · n      número (identidade)
//   · titulo texto sem o número nem os ponteiros
//   · detalhe o trecho "— ..." depurado de ponteiros "(...)" — na prática guardamos o raw
//   · feito  bool
//   · notas  as linhas `>` sob o item

// Linha de item. `[ ]`/`[x]` + número + resto. Captura também a bolinha markdown opcional.
const ITEM_RE = /^[\s-]*\[([ xX])\]\s+(\d+)\.\s+(.+)$/;
// Notinha sob o item: indentação opcional + `>` + o que veio.
const NOTA_RE = /^\s*>\s*(.+)$/;

// Bloqueio com reabertura por data: `bloqueado até YYYY-MM-DD HH:MM: <motivo>` (fuso local).
// Sem a cláusula "até", o bloqueado é manual (para sempre). A hora é opcional (meia-noite).
const BLOQUEIO_ATE_RE = /^bloqueado\s+até\s+(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/i;

/**
 * Momento local de um `bloqueado até <data> [<hora>]`. Para usar no `agora` (Date em ms) e decidir
 * se o item já reabriu. `2026-09-03 09:00` → 03/09 09:00 no fuso da máquina. PURO.
 */
function momentoDoBloqueio(texto) {
  const m = String(texto).match(BLOQUEIO_ATE_RE);
  if (!m) return null;
  const ano = Number(m[1]), mes = Number(m[2]) - 1, dia = Number(m[3]);
  const hora = m[4] !== undefined ? Number(m[4]) : 0;
  const min = m[5] !== undefined ? Number(m[5]) : 0;
  return new Date(ano, mes, dia, hora, min).getTime();
}

/**
 * PARTIR/PARSE puro: markdown da fila → { itens }.
 * `itens` na ordem do arquivo. Notinhas `>` logo após um item penduram nele.
 */
export function parseFila(markdown) {
  const itens = [];
  let corrente = null;
  for (const linha of String(markdown).split(/\r?\n/)) {
    const m = linha.match(ITEM_RE);
    if (m) {
      corrente = {
        n: Number(m[2]),
        titulo: (m[3] || '').trim(),
        feito: m[1].toLowerCase() === 'x',
        notas: [],
        linhas: [linha],
      };
      itens.push(corrente);
    } else {
      const nota = linha.match(NOTA_RE);
      if (nota && corrente) {
        corrente.notas.push({ texto: nota[1] });
        corrente.linhas.push(linha);
      } else if (nota && !corrente) {
        // notinha no cabeçalho da fila (antes de qualquer item) — ignorada para o modelo.
      } else if (corrente) {
        corrente = null; // linha em branco/parágrafo separa o item das notas que o seguem
      }
    }
  }
  return { itens };
}

/**
 * Estado derivado de um item.
 * `agora` (ms) decide a reabertura por data: um `bloqueado até <momento>` cujo momento JÁ PASSOU
 * vira não-bloqueado (reabre sozinho, sem desbloqueio manual). Sem `agora` a divisão não é feita
 * aqui — quem chama (`proximo`/`status`) injeta `Date.now()` por padrão.
 */
function estadoDe(item, agora) {
  if (item.feito) return 'feito';
  const textos = item.notas.map((x) => x.texto);
  for (const t of textos) {
    if (/^bloqueado:/i.test(t)) return 'bloqueado';
    if (/^bloqueado\s+até/i.test(t)) {
      // reabre sozinho quando o momento passa
      if (agora !== undefined) {
        const momento = momentoDoBloqueio(t);
        if (momento !== null && agora >= momento) continue; // vencido → não é mais bloqueio
      }
      return 'bloqueado';
    }
  }
  if (textos.some((t) => /^em andamento:/i.test(t))) return 'emAndamento';
  return 'aberto';
}

/**
 * PURO: qual item rodar. Regras da skill:
 *   · alvo = PRIMEIRO aberto sem `> bloqueado:`;
 *   · item com `> em andamento:` tem prioridade (retomar do estado descrito);
 *   · se todos os abertos estão bloqueados → null (não há o que rodar).
 * `agora` (ms, opcional) reabre `bloqueado até <momento>` cujo momento já passou (fuso local).
 */
export function proximo({ itens }, { agora } = {}) {
  const agoraMs = agora ?? Date.now();
  const abertos = itens.filter((i) => !i.feito);
  const candidatos = abertos.filter((i) => estadoDe(i, agoraMs) !== 'bloqueado');
  if (!candidatos.length) return null;
  const retomar = candidatos.find((i) => estadoDe(i, agoraMs) === 'emAndamento');
  return retomar ?? candidatos[0];
}

/**
 * PURO: próximo número livre — max(existentes, 0) + 1.
 */
export function proximoNumero({ itens }) {
  return itens.reduce((m, i) => Math.max(m, i.n), 0) + 1;
}

/**
 * Cria a linha markdown de um item novo.
 */
export function linhasDoItem(n, texto, { bloqueado } = {}) {
  const linhas = [`- [ ] ${n}. ${texto}`];
  if (bloqueado) linhas.push(`> ${linhaDeBloqueio(bloqueado)}`);
  return linhas;
}

// ---------- tabs ----------
// IMPORTANTE: estas funções SÓ manipulam a lista de itens em memória (puro). Quem persiste é o
// disco (seriaArquivo). O `addItem`, `marcarFeito`, `nota` retornam o markdown NOVO da fila inteira
// para o chamador gravar — ou gravam quando recebem o caminho (formas *Arquivo).

function recompor(markdownAtual, listaNova) {
  // Nó simples: mantém o prefixo (cabeçalhos) e substitui o bloco de itens.
  // Como não queremos reescrever comentários/instruções que o Joris digita no topo, preservamos
  // tudo ANTES do primeiro item e ANAD a representação nova dos itens.
  const m = String(markdownAtual).match(/^([\s\S]*?)(?=^[\s-]*\[[ xX]\]|\s*$)/m);
  const cabecalho = m ? m[1].replace(/\s+$/, '') : '';
  const corpo = listaNova.map((i) => i.linhas.join('\n')).join('\n\n');
  return `${cabecalho}\n\n${corpo}\n`;
}

/**
 * PURO: adiciona um item ao fim da fila (em memória) e devolve o markdown resultado.
 */
export function addItem(markdown, texto, { bloqueado } = {}) {
  const { itens } = parseFila(markdown);
  const n = proximoNumero({ itens });
  itens.push({
    n, titulo: texto, feito: false,
    notas: bloqueado ? [{ texto: linhaDeBloqueio(bloqueado) }] : [],
    linhas: linhasDoItem(n, texto, { bloqueado }),
  });
  return { n, markdown: recompor(markdown, itens) };
}

/**
 * PURO: marca um item como feito, com resultado opcional (notinha `>`). Devolve o markdown novo.
 */
export function marcarFeito(markdown, n, resultado) {
  const { itens } = parseFila(markdown);
  const it = itens.find((i) => i.n === n);
  if (!it) throw new Error(`item ${n} não existe na fila`);
  it.feito = true;
  it.linhas[0] = it.linhas[0].replace(/^[\s-]*\[[ xX]\]/, '- [x]');
  if (resultado) {
    it.notas.push({ texto: resultado });
    it.linhas.push(`> ${resultado}`);
  }
  return recompor(markdown, itens);
}

// Re-serializa as notinhas de um item para as linhas `>` logo após a linha do item.
function serializarNotas(item) {
  const cabec = [item.linhas[0]];
  for (const n of item.notas) cabec.push(`> ${n.texto}`);
  item.linhas = cabec;
}

/**
 * Indicador de uma notinha de bloqueio — nas duas formas:
 *   · `bloqueado: <motivo>`                      (manual, para sempre)
 *   · `bloqueado até <data hora>: <motivo>`      (reabre sozinho quando a data passa)
 * `anotar(..., 'bloqueado', 'até 2026-09-03 09:00: sem VPN')` produz a segunda forma.
 */
const NOTA_BLOQUEIO_RE = /^bloqueado\b/i;
const isNotaBloqueio = (t) => NOTA_BLOQUEIO_RE.test(String(t));

/** Monta a linha de bloqueio a partir da parte após o rótulo (vem do `texto` do anotar/add). */
const linhaDeBloqueio = (texto) => {
  const t = String(texto ?? '').trim();
  // `até <data>…` → forma com reabertura por data; senão, bloqueio manual.
  // ⚠ `/?=é` é caractere acentuado: o `\b` do JS sem flag `u` NÃO vê `é` como word (boundary falha),
  //    então casamos "até" pelo espaço que segue em vez de boundary.
  return /^até\s/i.test(t) ? `bloqueado ${t}` : `bloqueado: ${t}`;
};

/**
 * PURO: anexa/substitui uma notinha `> <rotulo>: <texto>` a um item.
 * `rotulo` é ex.: 'bloqueado' | 'em andamento'. Substitui notinha existente do mesmo rótulo.
 * Para reabertura por data, passe `texto` começando com `até <data hora>` — o formato
 * `bloqueado até …` é montado aqui (e reconhecido na substituição nas duas formas).
 */
export function anotar(markdown, n, rotulo, texto) {
  const { itens } = parseFila(markdown);
  const it = itens.find((i) => i.n === n);
  if (!it) throw new Error(`item ${n} não existe na fila`);
  const entrada = rotulo === 'bloqueado' ? linhaDeBloqueio(texto) : `${rotulo}: ${texto}`;
  // substitui notinha de mesmo rótulo, senão anexa — bloqueio casa nas duas formas
  const casa = (x) => (rotulo === 'bloqueado' ? isNotaBloqueio(x.texto) : x.texto.startsWith(`${rotulo}:`));
  const idx = it.notas.findIndex(casa);
  if (idx >= 0) it.notas[idx] = { texto: entrada };
  else it.notas.push({ texto: entrada });
  serializarNotas(it);
  return recompor(markdown, itens);
}

// ---------- resumo (status) ----------
export function statusDaFila({ itens }, { agora } = {}) {
  const agoraMs = agora ?? Date.now();
  const feito = itens.filter((i) => i.feito);
  const abertos = itens.filter((i) => !i.feito);
  const bloqueados = abertos.filter((i) => estadoDe(i, agoraMs) === 'bloqueado');
  const proximoAlvo = proximo({ itens }, { agora: agoraMs });
  return {
    total: itens.length,
    concluidos: feito.length,
    abertos: abertos.length,
    bloqueados: bloqueados.length,
    proximo: proximoAlvo ? { n: proximoAlvo.n, titulo: proximoAlvo.titulo } : null,
  };
}
