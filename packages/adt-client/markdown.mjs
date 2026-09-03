// markdown.mjs — Markdown → documento SAP imprimível (item 46 da fila).
//
// O item 42 provou a metade de baixo: copiar um Smart Form, podar até um bloco de texto, trocar o
// texto, gerar o FM, renderizar e OLHAR o PDF. Faltava a metade de cima — quem lê o documento e
// decide os nós. É isto.
//
// ---------------------------------------------------------------------------------------------
// POR QUE EXISTE UMA AST NO MEIO, E NÃO UM CONVERSOR DIRETO
//
//   markdown → parseMarkdown() → AST → emitirSmartForm() → [{ formato, linha }] → trocarTextoSmartForm
//                                   ↘ (item 43) emitirXfa() → XDP/XFA, pelo ADS
//
// Um conversor que cuspisse XML de Smart Form direto faria o item 43 (Adobe) recomeçar do zero. A
// AST é o contrato entre "o que o documento DIZ" e "como este backend IMPRIME": o parser não sabe
// o que é TDFORMAT, o emissor não sabe o que é `##`. É a razão de o Joris ter pedido este item
// ANTES do Adobe.
//
// ---------------------------------------------------------------------------------------------
// O VOCABULÁRIO É FECHADO — E QUEM O FECHA É O SMART STYLE
//
// `TDFORMAT` é o parágrafo do Smart Style, não um estilo inventável: o emissor só pode usar o que
// o estilo do form já tem. Medido no `SF_STYLE_01` (STXSPARA/STXSCHAR, s4h 758, 2026-09-01):
//
//   parágrafos   AS  corpo, COURIER 12, entrelinha 1 LN     TH  título, negrito+itálico, recuo 2 MM
//                C   centralizado                           N1  lista NUMERADA (TDNUMBERIN='A'),
//                TB  recuo de 2 MM — quase nada                  recuo 2 CM, entrelinha 12 PT
//                UL  COURIER 12, entrelinha 0,5 LN ⚠ SOBREPÕE a linha anterior — inútil para bloco
//   caractere    B   negrito        I  itálico        S  HELVE 8 (pequeno)
//
// Duas consequências que decidiram o desenho:
//   • ênfase inline e lista numerada JÁ EXISTEM — não é preciso criar Smart Style (o que bateria
//     no SSST "só GUI" da cobertura). Medido no PDF: `<B>x</>` sai negrito, `<I>` itálico, `<S>`
//     menor, e as TAGS SOMEM do texto — o Smart Form as interpreta, não as imprime;
//   • (tudo isto é o teto do MOLDE — o item 52 o desfez com um Smart Style próprio; ver adiante)
//   • NÃO existe parágrafo de bullet nem de citação: bullet é emulado com `TB` + marcador no
//     texto, e sai RENTE À MARGEM — o recuo do `TB` é de 2 MM (não 2 cm: a UNIDADE do TDPLEFT
//     decide, e ler o número sem ela engana), e espaço à esquerda do `TDLINE` é comido. As duas
//     vias de recuo foram tentadas e nenhuma vale. A ordenada (`N1`) indenta 2 CM e numera sozinha.
//   • bloco de código usa `AS`, não `UL`: os dois são COURIER 12, mas o `UL` tem entrelinha de
//     MEIA linha e a primeira linha do bloco SOBREPÕE a anterior no papel. Só o PDF olhado pegou
//     isso — o `contemTexto` passou verde com o texto por cima do outro.
//
// ⚠ O DEVICE É LATIN-1, E O QUE PASSA DISSO VIRA `#` EM SILÊNCIO (medido, 13 caracteres num PDF):
//   passam   - * o + . = _ > e o meio-ponto `·` (U+00B7)
//   viram #  • (U+2022) · ─ (U+2500) · — (U+2014) · ◆ (U+25C6) — tudo acima de U+00FF
// É a mesma armadilha que o item 42 viu no travessão, agora com a regra isolada. Por isso o
// marcador e a régua daqui são ASCII, e por isso `parseMarkdown` RECUSA caractere fora de
// Latin-1 no texto do autor: sair `#` no papel sem aviso é o pior desfecho possível.
//
// Peça fora do vocabulário é **erro duro**, nunca "melhor esforço": um documento que imprime
// diferente do que o autor viu é pior que um documento que recusa. Ver `ESTILO_PADRAO`.
//
// ---------------------------------------------------------------------------------------------
// TABELA — o degrau 2 (item 49), e por que ele mudou o formato de saída
//
// `| a | b |` deixou de ser recusa: a **tabela estática** existe no SSFO (medido — o loop mora em
// campos opcionais do nó `SE`, ver `xmlTabelaSmartForm` em forms.mjs). Mas ela é outro TIPO DE NÓ,
// e não linha de TDLINE — por isso o emissor passou a devolver BLOCOS (`emitirBlocosSmartForm`):
// texto contíguo vira um nó `TI`, cada tabela vira um nó `SE`, e `publicarMarkdown` os pendura na
// janela MAIN na ordem do documento. `emitirSmartForm` continua valendo para documento sem tabela.
//
// O que o Markdown decide e o que a lib decide:
//   • o AUTOR dá as colunas e o alinhamento (`| --- | :---: |`); a LARGURA sai do conteúdo
//     (`larguraDasColunas`, proporcional ao texto impresso, somando `larguraTabela` = 16 cm);
//   • alinhamento CENTRO existe (parágrafo `C`, que centraliza dentro da célula — medido);
//     **DIREITA não**: nenhum parágrafo do `SF_STYLE_01` tem `TDPJUSTIFY = RIGHT` (medido na
//     STXSPARA: AS/N1/TB/TH/UL = LEFT, C = CENTER), então `| ---: |` é erro duro até o item 52;
//   • célula com mais texto que a coluna QUEBRA dentro dela e a linha cresce (medido); acima de
//     132 caracteres ganha uma quebra dura a mais (o teto do TDLINE).
//
// ---------------------------------------------------------------------------------------------
// PÁGINAS — o degrau 3 (item 50), e a linha que faltava para o documento longo existir
//
// Até aqui o documento cabia numa página porque nunca transbordou. Quando transborda, **o
// documento não sai**: `subrc 2, "Nenhuma página seguinte definida"`, zero PDF (medido). O molde
// manda `FIRST → NEXT` e a poda leva a `NEXT` embora, deixando a página apontando para o vazio.
//
// A correção é uma linha e vale para TODO documento, curto ou longo: a página aponta para si mesma
// (`apontarProximaPagina`). O SAP então repete a mesma página quantas vezes precisar, com as
// janelas que ela tem — foi assim que cabeçalho e rodapé saíram nas duas páginas do teste.
//
// O front-matter (`---` no topo) é o que dá IDENTIDADE ao documento: título, cabeçalho, rodapé,
// formato do papel e margem. `{{PAGINA}}` e `{{PAGINAS}}` no cabeçalho/rodapé viram `&SFSY-PAGE&`
// e `&SFSY-FORMPAGES&` — campos que o SAP preenche sozinho, SEM parâmetro de interface (medido:
// "Pagina 1 de 2" / "Pagina 2 de 2").
//
// ⚠️ Ambiguidade real do Markdown: `---` é front-matter E régua horizontal. Só a posição não
// resolve — um documento pode começar por uma régua. A regra tem três partes: primeira linha,
// bloco FECHADO, e forma `chave: valor` lá dentro. Faltando qualquer uma, é régua.
//
// ⚠️ Mudança de comportamento visível: a janela MAIN deixa de ficar onde o molde de carta do IDES
// a pôs (10 cm do topo) e passa a ocupar a área útil da página — o documento começa no topo. Os
// PDFs dos degraus 0–2 mudam de aparência por isso.
//
// ---------------------------------------------------------------------------------------------
// IMAGEM — o degrau 4 (item 51), e por que o `src` NÃO é um arquivo
//
// `![logo](ZLOGO_ACME)` deixou de ser erro: vira um nó `GR`, irmão do texto. O que muda em relação
// ao HTML é o SIGNIFICADO do `src` — **o Smart Form não busca imagem de fora**: o nó guarda a CHAVE
// de um gráfico já gravado no sistema (SE78/BDS). Quem põe a imagem lá é `subirGrafico`, ou a opção
// `imagens` do `publicarMarkdown`, que sobe e referencia no mesmo passo. Caminho ou URL no `src` é
// erro duro, com a explicação — é o engano mais provável de quem escreve o documento.
//
// Três decisões que o papel impôs:
//   • a imagem ocupa a LINHA INTEIRA. `GR` é nó, não trecho de texto: `![a](X)` no meio de uma frase
//     é erro duro (a primeira das RECUSAS);
//   • **não há tamanho no documento.** O nó `GR` não tem `sf:OUTATTR` — quem decide o tamanho
//     impresso é o DPI gravado na imagem (medido: o mesmo BMP a 100 dpi sai três vezes maior que a
//     300 dpi). Redimensionar é reprocessar o arquivo, não escrever Markdown;
//   • o título entre aspas do Markdown (`![alt](X "centro")`) é o ALINHAMENTO (esquerda/centro/
//     direita), não legenda — o Smart Form não tem legenda de gráfico, e inventar uma seria imprimir
//     o que o autor não escreveu.
//
// ⚠️ Gráfico que não existe só reclama no RENDER (`subrc 1`, "A saída de gráfico não é possível"),
// e a mensagem não diz qual nome falhou. Por isso `publicarMarkdown` confere cada gráfico na
// STXBITMAPS antes de criar o form.
//
// ---------------------------------------------------------------------------------------------
// O ESTILO — o degrau 5 (item 52), e o teto que ele desfaz
//
// Tudo acima estava preso a UMA frase: "o emissor só pode usar o que o estilo do form já tem". O
// `SF_STYLE_01` foi generoso, mas fecha o teto — um parágrafo de título só, nenhum de citação ou
// código, nenhum alinhado à direita, e um `TB` que recua 2 MM (nada). O degrau 5 desfaz isso
// criando o Smart Style: `ESTILO_MARKDOWN` (forms.mjs) é o SSST, `publicarSmartStyle` o põe no
// sistema sem GUI, e `ESTILO_JBV` (aqui) é o vocabulário que fala com ele.
//
//   ESTILO_PADRAO  → SF_STYLE_01, o molde: `#`/`##`/`###` → TH · sem citação · sem RIGHT
//   ESTILO_JBV     → Y_SF_MD, nosso:      H1/H2/H3 · QU · CO · LI pendurado · R
//
// **A citação mudou de lado, e a mudança é o desenho.** `>` deixou de ser recusa do PARSER: ele
// vira um bloco `citacao` na AST sempre, e quem recusa é o EMISSOR, quando o estilo não tem
// parágrafo para ela. É a divisão que a AST existe para manter — o documento diz o que É, o
// backend diz o que sabe imprimir —, e é o que deixa o emissor XFA do item 43 herdar a citação
// sem herdar o teto do `SF_STYLE_01`.
//
// ⚠️ **Estilo que não existe NÃO dá erro**: o Smart Form imprime tudo com o parágrafo default do
// device, calado — o quarto erro mudo deste caminho. `publicarMarkdown` confere na STXSADM antes
// de criar o form, e confere também que todo `TDFORMAT` do vocabulário existe no estilo ATIVO.
// ---------------------------------------------------------------------------------------------

import { passo } from './log.mjs';
// só a tabela de medidas do papel e o estilo criável — as funções de rede seguem sob demanda
import { FORMATOS_PAGINA, ESTILO_MARKDOWN } from './forms.mjs';

/** O mapa do vocabulário para um estilo. Trocar de estilo é trocar este objeto, não o emissor. */
export const ESTILO_PADRAO = {
  nome: 'SF_STYLE_01',
  titulo: ['TH', 'TH', 'TH'],   // h1, h2, h3 — o SF_STYLE_01 só tem UM parágrafo de título
  paragrafo: 'AS',
  listaOrdenada: 'N1',
  listaItem: 'TB',              // não há parágrafo de bullet, e o TB não indenta: só o marcador
  codigo: 'AS',                 // COURIER 12; o UL tem entrelinha 0,5 LN e sobrepõe (medido)
  citacao: null,                // o SF_STYLE_01 não tem parágrafo de citação — `>` é erro duro nele
  cabecalho: 'TH',              // a janela do cabeçalho tem 1,2 cm: texto maior é cortado sem aviso
  rodape: 'AS',
  regra: 'AS',
  continuacao: '*',             // TDFORMAT que continua o parágrafo anterior
  quebra: '/',                  // TDFORMAT de nova linha — é o que empurra o cursor antes do gráfico
  forte: 'B',                   // formato de CARACTERE, aplicado como <B>…</>
  enfase: 'I',
  codigoInline: 'S',
  // ASCII, e não `•`: acima de U+00FF o device troca por `#` sem avisar (medido). Sem recuo: o
  // parágrafo TB não indentou no PDF, E espaço à esquerda do TDLINE é comido — a lista com
  // marcador sai rente à margem, e não há como recuá-la por texto (medido nas duas tentativas).
  marcador: '- ',
  regra_char: '-',
  larguraRegra: 60,
  // TABELA (item 49). O alinhamento é o parágrafo do estilo aplicado DENTRO da célula: o `C` do
  // SF_STYLE_01 centraliza na coluna (medido). **Não há parágrafo alinhado à direita** — por isso
  // `direita: null`, e `| ---: |` é erro duro até o item 52 criar um Smart Style próprio.
  celula: 'AS',
  celulaCabecalho: 'TH',
  alinhamentoCelula: { esquerda: null, centro: 'C', direita: null },
  larguraTabela: 16,        // CM — a janela MAIN do molde mede 16 (item 42)
  larguraMinimaColuna: 1.5, // CM — abaixo disso a coluna vira uma letra por linha
  bordaTabela: 'baixo',     // a borda de TOPO da 1ª linha invade o parágrafo anterior (medido)
};

/**
 * O vocabulário do Smart Style PRÓPRIO (item 52) — o teto do `SF_STYLE_01` desfeito.
 *
 * Os códigos daqui são os `TDPARGRAPH`/`TDSTRING` de `ESTILO_MARKDOWN` (forms.mjs), que é quem os
 * cria no sistema com `publicarSmartStyle`. **Os dois andam juntos**: um código citado aqui que não
 * exista lá imprimiria com o parágrafo default, calado — há teste puro amarrando os dois.
 *
 * O que ele destrava, e o `SF_STYLE_01` não dava:
 *   • `#`/`##`/`###` em TAMANHOS distintos (H1 18pt · H2 14pt · H3 12pt itálico), não os três em `TH`
 *   • bullet com recuo de VERDADE (`LI`: parágrafo a 0,8 cm com a 1ª linha voltando 0,4 — pendurado)
 *   • parágrafo de CÓDIGO (`CO`, COURIER 9 recuado) e de CITAÇÃO (`QU`, itálico entre margens)
 *   • alinhamento à DIREITA na tabela (`R`) — o `| ---: |` que o item 49 tinha de recusar
 */
export const ESTILO_JBV = {
  nome: ESTILO_MARKDOWN.nome,
  titulo: ['H1', 'H2', 'H3'],
  paragrafo: 'AS',
  listaOrdenada: 'N1',
  listaItem: 'LI',
  codigo: 'CO',
  citacao: 'QU',
  // NÃO é o `titulo[0]`: com H1 = 18 pt o cabeçalho estourava a janela de 1,2 cm (medido no papel)
  cabecalho: 'AS',
  rodape: 'AS',
  regra: 'AS',
  continuacao: '*',
  quebra: '/',
  forte: 'B',
  enfase: 'I',
  codigoInline: 'S',
  marcador: '- ',
  regra_char: '-',
  larguraRegra: 60,
  celula: 'TB',
  celulaCabecalho: 'TH',
  alinhamentoCelula: { esquerda: null, centro: 'C', direita: 'R' },
  larguraTabela: 16,
  larguraMinimaColuna: 1.5,
  bordaTabela: 'baixo',
};

/**
 * O layout da PÁGINA (item 50). Medidas em CM; a página vem de `FORMATOS_PAGINA` (forms.mjs).
 *
 * A margem padrão é 2,5 cm porque em A4 ela deixa a área útil em **exatamente 16 cm** — a mesma
 * `larguraTabela` do estilo, que é a janela MAIN do molde. Trocar a margem sem trocar a tabela faz
 * a tabela desencostar de uma das bordas.
 */
export const LAYOUT_PADRAO = {
  formato: 'DINA4',
  orientacao: 'P',          // P retrato · L paisagem
  margem: 2.5,              // CM nas quatro bordas
  alturaCabecalho: 1.2,     // CM — só existe quando há `cabecalho`
  alturaRodape: 1.2,
  folga: 0.3,               // CM entre o cabeçalho/rodapé e o corpo
};

/**
 * As quatro janelas em centímetros, a partir do formato do papel e do que o documento tem.
 * PURA — é a conta que decide onde o corpo começa e onde ele termina.
 *
 * `logoAlturaCm` (item 67, I70): quando o cabeçalho leva um gráfico (`front-matter: logo`), a altura
 * da janela deixa de ser a fixa de 1,2 cm e passa a incorporar a altura REAL do gráfico — medido
 * (S4H 758, `Y_SF_I70*`): a `WHEIGHT` da janela **não recorta nem redimensiona** o nó `GR` (ele
 * imprime no tamanho do DPI, igual dentro da MAIN — item 51); o que evita o gráfico invadir o corpo
 * é a MAIN nascer mais abaixo, não a janela "cortar" por cima. Com texto e logo juntos (empilhados,
 * o texto em cima) a altura do texto continua a mesma medida do item 50 (1,2 cm — segura para uma
 * linha `TH`) somada à do logo, com uma folga entre os dois.
 */
export function geometriaDoDocumento(layout = {}, { cabecalho = false, rodape = false, logoAlturaCm = null } = {}) {
  const L = { ...LAYOUT_PADRAO, ...layout };
  const medida = FORMATOS_PAGINA[String(L.formato).toUpperCase()];
  if (!medida) throw new Error(`markdown: formato de página "${L.formato}" desconhecido — conhecidos: ${Object.keys(FORMATOS_PAGINA).join(', ')}.`);
  const paisagem = String(L.orientacao).toUpperCase() === 'L';
  const [largura, altura] = paisagem ? [medida[1], medida[0]] : medida;
  const m = Number(L.margem);
  const util = largura - 2 * m;
  if (!(util > 0)) throw new Error(`markdown: margem de ${m} cm não cabe numa página de ${largura} cm — sobraria ${util.toFixed(2)} cm de área útil.`);
  const temTexto = Boolean(cabecalho);
  const temLogo = Number(logoAlturaCm) > 0;
  const temCabecalho = temTexto || temLogo;
  const alturaCabecalhoEfetiva = temLogo
    ? (temTexto ? L.alturaCabecalho + L.folga : 0) + Number(logoAlturaCm)
    : L.alturaCabecalho;
  const topoCorpo = m + (temCabecalho ? alturaCabecalhoEfetiva + L.folga : 0);
  const baseCorpo = altura - m - (rodape ? L.alturaRodape + L.folga : 0);
  const arred = (v) => Math.round(v * 100) / 100;
  return {
    pagina: { largura: arred(largura), altura: arred(altura) },
    main: { left: arred(m), top: arred(topoCorpo), width: arred(util), height: arred(baseCorpo - topoCorpo) },
    cabecalho: temCabecalho ? { left: arred(m), top: arred(m), width: arred(util), height: arred(alturaCabecalhoEfetiva) } : null,
    rodape: rodape ? { left: arred(m), top: arred(altura - m - L.alturaRodape), width: arred(util), height: L.alturaRodape } : null,
  };
}

/**
 * Os nomes de `{{…}}` que o SAP preenche SOZINHO — não são parâmetro de interface, e por isso não
 * entram na conta do `prepararVariaveis`. Medido no item 50: `&SFSY-PAGE&`/`&SFSY-FORMPAGES&` num
 * `TDLINE` de janela construída imprimiram "Pagina 1 de 2" sem interface nenhuma.
 */
export const CAMPOS_SISTEMA = {
  PAGINA: 'SFSY-PAGE',
  PAGINAS: 'SFSY-FORMPAGES',
  DATA: 'SY-DATUM',
  HORA: 'SY-UZEIT',
};

/** As chaves que o front-matter aceita — o resto é erro duro, como todo o resto do vocabulário. */
const CHAVES_FRONT_MATTER = {
  titulo: 'a descrição do form (o CAPTION que a SMARTFORMS mostra)',
  cabecalho: 'o texto da janela de cabeçalho, repetida em toda página',
  rodape: 'o texto da janela de rodapé — é onde {{PAGINA}} e {{PAGINAS}} servem',
  logo: 'o timbre no cabeçalho: "NOME" ou "NOME alinhamento" (NOME é o gráfico na SE78/BDS — como em `imagens`)',
  formato: `o papel: ${Object.keys(FORMATOS_PAGINA).join(', ')}`,
  orientacao: '"retrato" (padrão) ou "paisagem"',
  margem: 'a margem em centímetros (padrão 2,5 — a que deixa 16 cm úteis em A4)',
};

const ORIENTACOES = { retrato: 'P', paisagem: 'L', p: 'P', l: 'L' };

/**
 * Separa o front-matter do corpo. PURO.
 *
 * ```
 * ---
 * titulo: Relatório de vendas
 * rodape: Página {{PAGINA}} de {{PAGINAS}}
 * ---
 * # Vendas do mês
 * ```
 *
 * ⚠️ `---` é front-matter E régua horizontal — a ambiguidade é real, e a regra que a desfaz tem
 * DUAS partes, porque só a posição não bastava (um documento pode começar por uma régua): o bloco
 * abre na **primeira linha**, **fecha** com outro `---`, e a primeira linha de dentro tem a **forma**
 * `chave: valor`. Falhando qualquer uma, aquilo é uma régua e o documento segue inteiro. Depois de
 * reconhecido, o bloco é lido com rigor: chave desconhecida ou linha torta é erro duro.
 */
export function parseFrontMatter(md) {
  const texto = String(md ?? '').replace(/\r\n/g, '\n');
  const linhas = texto.split('\n');
  if (linhas[0]?.trim() !== '---') return { meta: {}, corpo: texto };
  const fim = linhas.findIndex((l, i) => i > 0 && l.trim() === '---');
  const primeira = linhas.slice(1, fim < 0 ? linhas.length : fim).find((l) => l.trim());
  if (fim < 0 || !/^\s*[A-Za-z_][A-Za-z0-9_]*\s*:/.test(primeira ?? '')) return { meta: {}, corpo: texto };
  const meta = {};
  for (let i = 1; i < fim; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) throw new Error(`markdown: a linha ${i + 1} do front-matter não é "chave: valor" — ${linha.trim()}`);
    const chave = m[1].toLowerCase();
    if (!(chave in CHAVES_FRONT_MATTER)) {
      throw new Error(`markdown: "${m[1]}" não é chave de front-matter. As que existem:\n  ${Object.entries(CHAVES_FRONT_MATTER).map(([k, v]) => `${k} — ${v}`).join('\n  ')}`);
    }
    if (chave in meta) throw new Error(`markdown: "${chave}" aparece duas vezes no front-matter (linha ${i + 1}).`);
    meta[chave] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  if (meta.margem !== undefined) {
    const v = Number(String(meta.margem).replace(',', '.'));
    if (!(v >= 0)) throw new Error(`markdown: margem "${meta.margem}" não é um número de centímetros.`);
    meta.margem = v;
  }
  if (meta.orientacao !== undefined) {
    const o = ORIENTACOES[String(meta.orientacao).toLowerCase()];
    if (!o) throw new Error(`markdown: orientação "${meta.orientacao}" não existe — use "retrato" ou "paisagem".`);
    meta.orientacao = o;
  }
  if (meta.formato !== undefined) {
    const f = String(meta.formato).toUpperCase();
    if (!FORMATOS_PAGINA[f]) throw new Error(`markdown: formato "${meta.formato}" desconhecido — conhecidos: ${Object.keys(FORMATOS_PAGINA).join(', ')}.`);
    meta.formato = f;
  }
  if (meta.logo !== undefined) {
    const partes = String(meta.logo).trim().split(/\s+/).filter(Boolean);
    if (partes.length < 1 || partes.length > 2) {
      throw new Error(`markdown: "logo: ${meta.logo}" não é "NOME" nem "NOME alinhamento" — ${Object.keys(ALINHAMENTOS_IMAGEM).join('/')}.`);
    }
    meta.logo = { nome: nomeDeGrafico(partes[0]), alinhamento: partes[1] ? alinhamentoDaImagem(partes[1]) : 'esquerda' };
  }
  return { meta, corpo: linhas.slice(fim + 1).join('\n') };
}

// O device do Smart Form é Latin-1: acima de U+00FF sai `#`. Os trocáveis mais comuns num texto
// escrito em editor moderno — o resto é recusado com a posição.
const TRANSLITERACOES = new Map(Object.entries({
  '—': '-', '–': '-', '‘': "'", '’': "'", '“': '"', '”': '"',
  '…': '...', '•': '-', ' ': ' ', '─': '-', '→': '->', '←': '<-',
}));

/**
 * Troca por equivalente Latin-1 o que o device não imprime, e RECUSA o que não tem equivalente.
 * `transliterar: false` recusa tudo — para quem quer o texto byte a byte ou nada. PURO.
 */
export function paraLatin1(texto, { transliterar = true, onde = '' } = {}) {
  const s = String(texto ?? '');
  let saida = '';
  for (const ch of s) {
    if (ch.codePointAt(0) <= 0xff) { saida += ch; continue; }
    const alt = transliterar ? TRANSLITERACOES.get(ch) : undefined;
    if (alt === undefined) {
      const hex = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      throw new Error(`markdown: o caractere "${ch}" (U+${hex})${onde ? ` em ${onde}` : ''} NÃO existe no device do Smart Form — ele sairia como "#" no papel, sem erro nenhum (medido). Troque por um equivalente Latin-1.`);
    }
    saida += alt;
  }
  return saida;
}

const RE_TITULO = /^(#{1,6})\s+(.*)$/;
const RE_LISTA_NAO_ORD = /^\s*[-*+]\s+(.*)$/;
const RE_LISTA_ORD = /^\s*(\d+)[.)]\s+(.*)$/;
const RE_CERCA = /^\s*```(.*)$/;
const RE_REGRA = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RE_CITACAO = /^\s*>\s?(.*)$/;
const RE_LINHA_TABELA = /^\s*\|.*\|\s*$/;
// o separador é o que distingue tabela de um parágrafo que por acaso tem `|`
const RE_SEP_TABELA = /^\s*\|(?:\s*:?-{1,}:?\s*\|)+\s*$/;

// `![alt](GRAFICO)` ou `![alt](GRAFICO "centro")` — sozinha na linha (ver RECUSAS).
const RE_IMAGEM = /^\s*!\[([^\]]*)\]\(\s*([^)\s"]+)\s*(?:"([^"]*)")?\s*\)\s*$/;

// O que o vocabulário NÃO tem. Recusar é o contrato — ver o cabeçalho.
const RECUSAS = [
  [/!\[[^\]]*\]\([^)]*\)/, 'imagem no meio da linha', 'o gráfico é um NÓ do Smart Form (GR), não um trecho de texto — ponha `![alt](GRAFICO)` sozinha numa linha'],
  [/\[[^\]]*\]\([^)]*\)/, 'link', 'não há formato de caractere de link no SF_STYLE_01, e papel não navega'],
  [/<[a-zA-Z][^>]*>/, 'HTML embutido', 'o TDLINE trata < > como texto; tag de formatação é gerada pelo emissor, não escrita à mão'],
];

/** As células de uma linha `| a | b |` — sem as pontas vazias, com `\|` valendo um `|` literal. */
const celulasDaLinha = (linha) => String(linha).trim()
  .replace(/^\|/, '').replace(/\|$/, '')
  .split(/(?<!\\)\|/)
  .map((c) => c.replace(/\\\|/g, '|').trim());

/** `:---` esquerda · `:---:` centro · `---:` direita. Puro. */
const alinhamentoDe = (marca) => {
  const m = String(marca).trim();
  if (m.startsWith(':') && m.endsWith(':')) return 'centro';
  if (m.endsWith(':')) return 'direita';
  return 'esquerda';
};

/**
 * O nome do gráfico dentro de `![alt](…)`: é a chave da SE78/BDS (STXBITMAPS-TDNAME, CHAR 70), não um
 * caminho de arquivo. Quem sobe a imagem é `subirGrafico` (ou a opção `imagens` do
 * `publicarMarkdown`) — o documento só a REFERENCIA, porque é isso que o nó `GR` guarda. PURO.
 */
export function nomeDeGrafico(bruto, linha) {
  const N = String(bruto ?? '').trim().toUpperCase();
  const onde = linha ? ` (linha ${linha})` : '';
  if (/^(https?:|file:|\.{0,2}\/)/i.test(String(bruto ?? '').trim())) {
    throw new Error(`markdown: "${String(bruto).trim()}"${onde} parece um caminho/URL, e o Smart Form não busca imagem de fora — o nó GR aponta um gráfico JÁ GRAVADO no sistema (SE78/BDS). Suba a imagem com \`subirGrafico\` (ou a opção \`imagens\`) e escreva o NOME dela aqui.`);
  }
  if (!/^[A-Z0-9_/\-.]{1,70}$/.test(N)) {
    throw new Error(`markdown: "${String(bruto ?? '').trim()}"${onde} não é nome de gráfico — o TDNAME da SE78 tem até 70 caracteres e aqui aceita A-Z, 0-9, _ / - e ponto (sem espaço).`);
  }
  return N;
}

/** O título entre aspas de `![alt](G "centro")` é o ALINHAMENTO — o vocabulário fechado, não legenda. PURO. */
export function alinhamentoDaImagem(bruto, linha) {
  if (bruto === undefined || bruto === null || !String(bruto).trim()) return 'esquerda';
  const A = String(bruto).trim().toLowerCase();
  if (!(A in ALINHAMENTOS_IMAGEM)) {
    throw new Error(`markdown: "${String(bruto).trim()}"${linha ? ` (linha ${linha})` : ''} não é alinhamento de imagem. O texto entre aspas de \`![alt](G "…")\` diz o ALINHAMENTO — ${Object.keys(ALINHAMENTOS_IMAGEM).join(', ')} —, e não uma legenda: o Smart Form não tem legenda de gráfico.`);
  }
  return A;
}

/** Os alinhamentos que o nó `GR` conhece (`ALIGNMENT` L/C/R). */
export const ALINHAMENTOS_IMAGEM = { esquerda: 'L', centro: 'C', direita: 'R' };

/**
 * Markdown → AST. PURO, sem SAP nenhum.
 *
 * Blocos: `titulo` (nivel 1–6) · `paragrafo` · `lista` (ordenada?) · `codigo` · `regra` · `imagem`.
 * Inline: `texto` · `forte` · `enfase` · `codigo`.
 *
 * Lança em construção fora do vocabulário, com a LINHA e o porquê — o "erro duro" do contrato.
 */
export function parseMarkdown(md) {
  const linhas = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocos = [];
  let paragrafo = [];
  let lista = null;

  const fechaParagrafo = () => {
    if (paragrafo.length) blocos.push({ tipo: 'paragrafo', filhos: parseInline(paragrafo.join(' ')) });
    paragrafo = [];
  };
  const fechaLista = () => { if (lista) blocos.push(lista); lista = null; };
  const fecha = () => { fechaParagrafo(); fechaLista(); };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    const cerca = linha.match(RE_CERCA);
    if (cerca) {
      fecha();
      const corpo = [];
      let j = i + 1;
      for (; j < linhas.length && !RE_CERCA.test(linhas[j]); j++) corpo.push(linhas[j]);
      if (j >= linhas.length) throw new Error(`markdown: bloco de código aberto na linha ${i + 1} e nunca fechado (falta a cerca \`\`\`).`);
      blocos.push({ tipo: 'codigo', linguagem: cerca[1].trim(), linhas: corpo });
      i = j;
      continue;
    }

    // IMAGEM: só vale a linha INTEIRA — o `GR` é um nó irmão do texto, não um pedaço dele. Vem antes
    // das RECUSAS de propósito: a primeira delas é justamente a imagem que NÃO está sozinha.
    const img = linha.match(RE_IMAGEM);
    if (img) {
      fecha();
      blocos.push({
        tipo: 'imagem',
        alt: img[1].trim(),
        grafico: nomeDeGrafico(img[2], i + 1),
        alinhamento: alinhamentoDaImagem(img[3], i + 1),
      });
      continue;
    }

    for (const [re, nome, porque] of RECUSAS) {
      if (re.test(linha)) {
        throw new Error(`markdown: ${nome} na linha ${i + 1} está FORA do vocabulário — ${porque}.\n  ${linha.trim()}\n  O vocabulário é fechado de propósito: um documento que imprime diferente do que o autor viu é pior que um que recusa.`);
      }
    }

    // TABELA: cabeçalho + separador + linhas. É o separador que decide — sem ele, `| a | b |` é
    // parágrafo. Uma linha de `|` solta segue sendo texto, e não erro.
    if (RE_LINHA_TABELA.test(linha) && RE_SEP_TABELA.test(linhas[i + 1] ?? '')) {
      fecha();
      const cabecalho = celulasDaLinha(linha);
      const alinhamentos = celulasDaLinha(linhas[i + 1]).map(alinhamentoDe);
      if (alinhamentos.length !== cabecalho.length) {
        throw new Error(`markdown: a tabela da linha ${i + 1} tem ${cabecalho.length} coluna(s) no cabeçalho e ${alinhamentos.length} no separador — as duas contagens têm de bater.`);
      }
      const corpo = [];
      let j = i + 2;
      for (; j < linhas.length && RE_LINHA_TABELA.test(linhas[j]); j++) {
        const cels = celulasDaLinha(linhas[j]);
        if (cels.length > cabecalho.length) {
          throw new Error(`markdown: a linha ${j + 1} da tabela tem ${cels.length} células e a tabela tem ${cabecalho.length} colunas — a coluna é a POSIÇÃO da célula, então a que sobra não tem onde entrar.\n  ${linhas[j].trim()}`);
        }
        corpo.push(cels.map(parseInline));
      }
      blocos.push({
        tipo: 'tabela',
        alinhamentos,
        cabecalho: cabecalho.map(parseInline),
        linhas: corpo,
      });
      i = j - 1;
      continue;
    }

    // CITAÇÃO (item 52): linhas `>` contíguas viram UM bloco. O parser aceita sempre — quem recusa
    // é o EMISSOR, quando o Smart Style não tem parágrafo de citação. É a divisão da AST: o
    // documento diz o que é, o estilo diz se sabe imprimir.
    const cit = linha.match(RE_CITACAO);
    if (cit) {
      fecha();
      const partes = [];
      let j = i;
      for (; j < linhas.length; j++) {
        const m = linhas[j].match(RE_CITACAO);
        if (!m) break;
        if (m[1].trim()) partes.push(m[1].trim());
      }
      blocos.push({ tipo: 'citacao', filhos: parseInline(partes.join(' ')) });
      i = j - 1;
      continue;
    }

    if (!linha.trim()) { fecha(); continue; }

    if (RE_REGRA.test(linha)) { fecha(); blocos.push({ tipo: 'regra' }); continue; }

    const tit = linha.match(RE_TITULO);
    if (tit) { fecha(); blocos.push({ tipo: 'titulo', nivel: tit[1].length, filhos: parseInline(tit[2].trim()) }); continue; }

    const ord = linha.match(RE_LISTA_ORD);
    const nao = linha.match(RE_LISTA_NAO_ORD);
    if (ord || nao) {
      fechaParagrafo();
      const ordenada = Boolean(ord);
      if (lista && lista.ordenada !== ordenada) fechaLista();
      if (!lista) lista = { tipo: 'lista', ordenada, itens: [] };
      lista.itens.push(parseInline((ord ? ord[2] : nao[1]).trim()));
      continue;
    }

    fechaLista();
    paragrafo.push(linha.trim());
  }
  fecha();
  return blocos;
}

/** Inline → nós. PURO. `**forte**` · `_ênfase_`/`*ênfase*` · `` `código` `` · `{{VARIAVEL}}`. */
export function parseInline(texto) {
  const s = String(texto ?? '');
  const nos = [];
  // ordem importa: `**` antes de `*`, senão o forte vira duas ênfases vazias
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\{\{([^}]*)\}\}/g;
  let ultimo = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > ultimo) nos.push({ tipo: 'texto', valor: s.slice(ultimo, m.index) });
    if (m[2] !== undefined) nos.push({ tipo: 'forte', filhos: parseInline(m[2]) });
    else if (m[4] !== undefined) nos.push({ tipo: 'enfase', filhos: parseInline(m[4]) });
    else if (m[5] !== undefined) nos.push({ tipo: 'codigo', valor: m[5] });
    else nos.push({ tipo: 'variavel', ...variavelDeInline(m[6]) });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < s.length) nos.push({ tipo: 'texto', valor: s.slice(ultimo) });
  return nos.length ? nos : [{ tipo: 'texto', valor: '' }];
}

/**
 * O nome dentro de `{{…}}` é o do parâmetro da INTERFACE, e ele nasce com as regras do ABAP: letra
 * inicial, `A-Z 0-9 _`, até 30 — o mesmo teto do `acrescentarInterfaceSmartForm`. PURO.
 */
export function nomeDeVariavel(bruto) {
  const N = String(bruto ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(N)) {
    throw new Error(`markdown: "{{${String(bruto ?? '').trim()}}}" não é nome de variável — o parâmetro da INTERFACE começa com letra e aceita A-Z, 0-9 e _, até 30 caracteres.`);
  }
  return N;
}

/**
 * O `LARGURA[.CASAS][opções]` de `{{NOME:10CR}}` — a forma de campo do SAPscript (`&VAR(10CR)&`),
 * medida no `SF_EXAMPLE_01` (item 48): `C` comprime espaços, `R` alinha à direita, `T` tira o
 * separador de milhar, `Z` tira os zeros à esquerda, e `.N` dá as casas decimais. PURO.
 */
const RE_FORMATO_VARIAVEL = /^(\d{1,3})(\.\d{1,2})?([CRTZ]{0,4})$/i;
export function formatoDeVariavel(bruto, nome) {
  const F = String(bruto ?? '').trim().toUpperCase();
  if (!RE_FORMATO_VARIAVEL.test(F)) {
    throw new Error(`markdown: "{{${nome}:${String(bruto ?? '').trim()}}}" não é formato de campo do SAPscript — a forma é LARGURA[.CASAS][opções], as opções vindas de C R T Z, como em "10CR" (largura 10, comprime e alinha à direita). Medido no SF_EXAMPLE_01.`);
  }
  return F;
}

/**
 * `{{NOME}}` ou `{{NOME:FORMATO}}` → `{ nome, formato? }`. O `:` separa o nome do formato — é o
 * `formatoDeVariavel` quem valida o que vem depois. Sem `:`, não há chave `formato` (o nó fica
 * idêntico ao de antes do item 66). PURO.
 */
export function variavelDeInline(bruto) {
  const s = String(bruto ?? '');
  const i = s.indexOf(':');
  if (i < 0) return { nome: nomeDeVariavel(s) };
  const nome = nomeDeVariavel(s.slice(0, i));
  return { nome, formato: formatoDeVariavel(s.slice(i + 1), nome) };
}

/**
 * Os nomes das variáveis que o documento declara, na ordem de aparição e sem repetir. PURO.
 * Os `CAMPOS_SISTEMA` (`{{PAGINA}}`, `{{DATA}}`…) ficam de fora: quem os preenche é o SAP, e pedir
 * valor para eles seria pedir o que ninguém tem como dar.
 */
export function variaveisDoMarkdown(ast) {
  const nomes = [];
  const anda = (ns) => {
    for (const n of ns ?? []) {
      if (n.tipo === 'variavel' && !(n.nome in CAMPOS_SISTEMA) && !nomes.includes(n.nome)) nomes.push(n.nome);
      anda(n.filhos);
      if (n.itens) n.itens.forEach(anda);
      if (n.cabecalho) n.cabecalho.forEach(anda);
      if (n.tipo === 'tabela') n.linhas.forEach((l) => l.forEach(anda));
    }
  };
  anda(ast);
  return nomes;
}

/** O texto que uma sequência inline imprime, sem tag nenhuma — é a régua da largura de coluna. PURO. */
export function textoDoInline(nos) {
  return (nos ?? []).map((n) => {
    if (n.tipo === 'texto') return String(n.valor ?? '');
    if (n.tipo === 'variavel') return `&${CAMPOS_SISTEMA[n.nome] ?? n.nome}${n.formato ? `(${n.formato})` : ''}&`;
    if (n.tipo === 'codigo') return String(n.valor ?? '');
    return textoDoInline(n.filhos);
  }).join('');
}

/**
 * As larguras (CM) das colunas de uma tabela, proporcionais ao conteúdo mais largo de cada uma e
 * somando `total`. O Markdown não diz largura nenhuma — quem decide é isto, e a régua é o texto
 * impresso (não o fonte). Coluna nenhuma fica abaixo de `minimo`. PURO.
 */
export function larguraDasColunas(cabecalho, linhas, { total = 16, minimo = 1.5 } = {}) {
  const n = cabecalho?.length ?? (linhas[0]?.length ?? 0);
  if (!n) return [];
  const maior = Array.from({ length: n }, (_, i) => Math.max(
    1,
    cabecalho ? textoDoInline(cabecalho[i]).length : 1,
    ...linhas.map((l) => textoDoInline(l[i]).length || 1),
  ));
  if (minimo * n > total) throw new Error(`markdown: ${n} colunas não cabem em ${total} cm com o mínimo de ${minimo} cm cada — reduza as colunas ou aumente \`larguraTabela\`.`);
  // reparte o que sobra depois do mínimo, na proporção do conteúdo
  const sobra = total - minimo * n;
  const soma = maior.reduce((a, b) => a + b, 0);
  const larguras = maior.map((m) => minimo + (sobra * m) / soma);
  // arredonda em 0,05 cm e joga a diferença na última coluna, para a soma bater com `total`
  const arred = larguras.map((w) => Math.round(w * 20) / 20);
  arred[n - 1] = Math.round((total - arred.slice(0, -1).reduce((a, b) => a + b, 0)) * 20) / 20;
  return arred;
}

/**
 * Inline → uma string de TDLINE, com as tags de formatação de caractere do SAPscript.
 * `<B>negrito</>` é a forma do SAPscript: abre com o código do formato, fecha com `</>`. PURO.
 */
export function inlineParaTdline(nos, estilo = ESTILO_PADRAO, opcoes = {}) {
  const tag = (cod, dentro) => (cod ? `<${cod}>${dentro}</>` : dentro);
  const txt = (v) => paraLatin1(v, opcoes);
  return nos.map((n) => {
    if (n.tipo === 'texto') return txt(n.valor);
    // `&NOME&` é o símbolo do SAPscript — o Smart Form o troca pelo valor do parâmetro na hora de
    // imprimir. No XML ele vai escapado (`&amp;NOME&amp;`), e quem escapa é o `trocarTextoSmartForm`.
    // `{{PAGINA}}` e companhia viram o campo de sistema correspondente (`&SFSY-PAGE&`).
    if (n.tipo === 'variavel') return `&${CAMPOS_SISTEMA[n.nome] ?? n.nome}${n.formato ? `(${n.formato})` : ''}&`;
    if (n.tipo === 'codigo') return tag(estilo.codigoInline, txt(n.valor));
    if (n.tipo === 'forte') return tag(estilo.forte, inlineParaTdline(n.filhos, estilo, opcoes));
    if (n.tipo === 'enfase') return tag(estilo.enfase, inlineParaTdline(n.filhos, estilo, opcoes));
    throw new Error(`markdown: nó inline desconhecido "${n.tipo}"`);
  }).join('');
}

/**
 * AST → BLOCOS DE SAÍDA, que é o que o Smart Form realmente tem: um nó por bloco.
 *
 *   { tipo: 'texto',  linhas: [{ formato, linha }] }        → um nó TI
 *   { tipo: 'tabela', colunas, cabecalho, linhas, … }       → um nó SE (SECTTYPE C)
 *
 * Até o item 48 o documento inteiro cabia num nó de texto só, e `emitirSmartForm` bastava. A tabela
 * é outro TIPO de nó — não dá para emiti-la como linha de TDLINE —, então o emissor passou a
 * devolver a sequência de nós, e é `publicarMarkdown` quem os pendura na janela MAIN, em ordem.
 * Texto contíguo continua sendo UM nó só. PURO.
 */
export function emitirBlocosSmartForm(ast, estilo = ESTILO_PADRAO, opcoes = {}) {
  const blocos = [];
  let texto = null;
  const push = (l) => { if (!texto) blocos.push(texto = { tipo: 'texto', linhas: [] }); texto.linhas.push(l); };
  for (const b of ast) {
    if (b.tipo === 'tabela') { texto = null; blocos.push(emitirTabela(b, estilo, opcoes)); continue; }
    // imagem é nó `GR`, e o `GR` não carrega texto: vai inteira, sem passar pelo emissor de linhas.
    // ⚠️ O `GR` **não avança a linha**: sem uma quebra explícita ele começa na posição corrente e
    // SOBE sobre a última linha do parágrafo anterior (medido no PDF — o texto sai cortado ao meio,
    // com qualquer alinhamento). Uma linha de `TDFORMAT /` no fim do texto anterior resolve.
    if (b.tipo === 'imagem') {
      if (texto) texto.linhas.push({ formato: estilo.quebra, linha: '' });
      texto = null;
      blocos.push({ tipo: 'imagem', grafico: b.grafico, alinhamento: b.alinhamento ?? 'esquerda', alt: b.alt ?? '' });
      continue;
    }
    emitirSmartForm([b], estilo, opcoes).forEach(push);
  }
  return blocos;
}

/** Os gráficos que o documento referencia, na ordem e sem repetir. PURO. */
export function graficosDoMarkdown(ast) {
  const nomes = [];
  for (const b of ast ?? []) if (b.tipo === 'imagem' && !nomes.includes(b.grafico)) nomes.push(b.grafico);
  return nomes;
}

/** Um bloco `tabela` da AST → o que `xmlTabelaSmartForm` pede. PURO. */
export function emitirTabela(b, estilo = ESTILO_PADRAO, opcoes = {}) {
  const inline = (nos) => inlineParaTdline(nos, estilo, opcoes);
  const formatoDe = (col, padrao) => {
    const al = b.alinhamentos?.[col] ?? 'esquerda';
    const fmt = estilo.alinhamentoCelula?.[al];
    if (al !== 'esquerda' && !fmt) {
      throw new Error(`markdown: a coluna ${col + 1} da tabela pede alinhamento à ${al}, e o Smart Style "${estilo.nome}" não tem parágrafo desse alinhamento — sairia alinhado à esquerda, calado. Tire o \`:\` do separador, ou troque de estilo (item 52).`);
    }
    return fmt ?? padrao;
  };
  const larguras = larguraDasColunas(b.cabecalho, b.linhas, { total: estilo.larguraTabela, minimo: estilo.larguraMinimaColuna });
  return {
    tipo: 'tabela',
    colunas: larguras.map((largura) => ({ largura })),
    cabecalho: b.cabecalho ? b.cabecalho.map((c, i) => ({ formato: formatoDe(i, estilo.celulaCabecalho), linha: inline(c) })) : null,
    linhas: b.linhas.map((l) => l.map((c, i) => ({ formato: formatoDe(i, estilo.celula), linha: inline(c) }))),
    borda: estilo.bordaTabela,
  };
}

/**
 * AST → as linhas que `trocarTextoSmartForm` consome: `[{ formato, linha }]`.
 * PURO. Não fatia em 132 caracteres — quem faz isso é o `fatiarTdline` do `forms.mjs`, na hora
 * de escrever (e ele já põe a continuação `*` nos pedaços seguintes).
 *
 * Só serve para documento SEM tabela — ela não é linha de texto, é nó. Com tabela, use
 * `emitirBlocosSmartForm` (é o que `publicarMarkdown` faz).
 */
export function emitirSmartForm(ast, estilo = ESTILO_PADRAO, opcoes = {}) {
  const linhas = [];
  const inline = (nos) => inlineParaTdline(nos, estilo, opcoes);
  for (const b of ast) {
    if (b.tipo === 'tabela' || b.tipo === 'imagem') {
      throw new Error(`markdown: o documento tem uma ${b.tipo === 'tabela' ? 'TABELA' : 'IMAGEM'}, e ela não cabe num nó de texto — use \`emitirBlocosSmartForm\` (ou \`publicarMarkdown\`, que já faz isso).`);
    }
    if (b.tipo === 'titulo') {
      const fmt = estilo.titulo[Math.min(b.nivel, estilo.titulo.length) - 1];
      linhas.push({ formato: fmt, linha: inline(b.filhos) });
    } else if (b.tipo === 'paragrafo') {
      linhas.push({ formato: estilo.paragrafo, linha: inline(b.filhos) });
    } else if (b.tipo === 'citacao') {
      // o estilo é quem decide se o documento pode ter citação — sem parágrafo dela, a linha sairia
      // idêntica a um parágrafo comum, e o autor nunca saberia que a citação não existiu
      if (!estilo.citacao) {
        throw new Error(`markdown: o documento tem uma citação (\`>\`) e o Smart Style "${estilo.nome}" não tem parágrafo de citação — ela sairia como parágrafo comum, calada. Tire o \`>\`, ou publique com \`ESTILO_JBV\` (o estilo próprio do item 52).`);
      }
      linhas.push({ formato: estilo.citacao, linha: inline(b.filhos) });
    } else if (b.tipo === 'lista') {
      for (const item of b.itens) {
        // ordenada: o parágrafo N1 numera sozinho (TDNUMBERIN='A'); não-ordenada: marcador no
        // texto, com o recuo em espaços — o TB não indentou no PDF, apesar do TDPLEFT
        const texto = inline(item);
        linhas.push(b.ordenada
          ? { formato: estilo.listaOrdenada, linha: texto }
          : { formato: estilo.listaItem, linha: estilo.marcador + texto });
      }
    } else if (b.tipo === 'codigo') {
      // cada linha do bloco é uma linha própria: o parágrafo de código NÃO junta
      for (const l of b.linhas) linhas.push({ formato: estilo.codigo, linha: paraLatin1(l, opcoes) });
    } else if (b.tipo === 'regra') {
      linhas.push({ formato: estilo.regra, linha: estilo.regra_char.repeat(estilo.larguraRegra) });
    } else {
      throw new Error(`markdown: bloco desconhecido "${b.tipo}"`);
    }
  }
  return linhas;
}

/**
 * Atalho: Markdown → `[{ formato, linha }]`, pronto para o `trocarTextoSmartForm`. PURO.
 * `transliterar: false` recusa qualquer caractere fora de Latin-1 em vez de trocar os comuns.
 */
export const markdownParaSmartForm = (md, estilo = ESTILO_PADRAO, opcoes = {}) =>
  emitirSmartForm(parseMarkdown(parseFrontMatter(md).corpo), estilo, opcoes);

/** Valor de variável mais longo que isto não cabe numa linha do fonte do driver (255 no ABAP). */
const VALOR_MAX = 200;

/**
 * As variáveis pedidas × as declaradas no documento: devolve `{ parametros, exporting, declaracoes,
 * preparo }` para o form e para o driver. **Erro duro antes da rede** quando o documento usa uma
 * variável que ninguém declarou, e quando um valor não cabe na linha do fonte. PURO.
 *
 * `variaveis` aceita `{ NUMERO: '4711' }` ou `{ NUMERO: { valor: '4711', tipo: 'STRING' } }`.
 */
export function prepararVariaveis(usadas, variaveis = {}, { transliterar = true } = {}) {
  const dec = new Map(Object.entries(variaveis ?? {}).map(([k, v]) => [String(k).toUpperCase(), (v && typeof v === 'object' && !Array.isArray(v)) ? v : { valor: v }]));
  const faltando = usadas.filter((n) => !dec.has(n));
  if (faltando.length) {
    throw new Error(`markdown: o documento usa {{${faltando.join('}}, {{')}}} mas nenhum valor foi passado em \`variaveis\` — o Smart Form geraria um campo sem dono e a GERAÇÃO do FM falharia no servidor. Declare: { variaveis: { ${faltando[0]}: '…' } }`);
  }
  const sobrando = [...dec.keys()].filter((n) => !usadas.includes(n));
  if (sobrando.length) throw new Error(`markdown: ${sobrando.join(', ')} foi passado em \`variaveis\` mas o documento não usa {{${sobrando[0]}}} — parâmetro sem campo no texto é engano, não decoração.`);

  const parametros = []; const exporting = {}; const declaracoes = []; const preparo = [];
  for (const nome of usadas) {
    const { valor, tipo = 'STRING' } = dec.get(nome);
    const v = paraLatin1(valor ?? '', { transliterar, onde: `valor de {{${nome}}}` });
    if (v.length > VALOR_MAX) throw new Error(`markdown: o valor de {{${nome}}} tem ${v.length} caracteres — acima de ${VALOR_MAX} ele não cabe na linha do fonte do driver (o ABAP corta em 255).`);
    const lv = `lv_v_${nome.toLowerCase()}`.slice(0, 30);
    parametros.push({ nome, tipo });
    declaracoes.push(`    DATA ${lv} TYPE ${tipo}.`);
    preparo.push(`      ${lv} = '${v.replace(/'/g, "''")}'.`);
    exporting[nome] = lv;
  }
  return { parametros, exporting, declaracoes: declaracoes.join('\n'), preparo: preparo.join('\n') };
}

/**
 * O caminho inteiro: um Markdown vira um Smart Form imprimível, e o PDF vem para o disco.
 *
 * ```js
 * const r = await publicarMarkdown(cx, {
 *   markdown: '# Fatura {{NUMERO}}\n\nPrezado **{{CLIENTE}}**…',
 *   form: 'Y_SF_FATURA',
 *   variaveis: { NUMERO: '4711', CLIENTE: 'ACME' },
 *   salvarPdfEm: 'fatura.pdf',
 * });
 * ```
 *
 * Compõe o que o item 42 já provou: copia um form-molde, poda até a janela MAIN com um nó de
 * texto, limpa a interface, escreve o documento nesse nó, sobe, gera o FM e renderiza.
 *
 * **Sem `variaveis` o form é ESTÁTICO** (renderiza sem o chamador preparar dado). **Com elas** a
 * interface ganha um parâmetro de import por `{{NOME}}` do documento e o texto ganha `&NOME&` — o
 * mesmo form imprime documentos diferentes conforme o valor, e é `imprimirMarkdown` que troca o
 * valor sem republicar nada (item 48).
 *
 * **Com TABELA** (item 49) o documento deixa de caber num nó só: cada bloco vira um nó pendurado na
 * janela MAIN, em ordem — o `no` do molde recebe o primeiro bloco de texto e os demais nascem
 * construídos (`xmlTextoSmartForm`/`xmlTabelaSmartForm`). Documento que COMEÇA por tabela deixa o
 * nó do molde com uma linha vazia no topo: ele é a âncora da inserção e não pode ser podado.
 *
 * **Com IMAGEM** (item 51) `![logo](ZLOGO)` vira um nó `GR` apontando um gráfico do sistema; `imagens`
 * sobe o arquivo antes (`{ imagens: { ZLOGO: 'logo.bmp' } }`, só BMP e TIFF) e todo gráfico usado é
 * conferido na STXBITMAPS ANTES de o form ser criado — o erro do runtime não diz qual nome falhou.
 *
 * **Com PÁGINAS** (item 50) o documento deixa de caber numa página: a página passa a apontar para
 * si mesma (sem isso o documento longo NÃO sai — `subrc 2`), a janela MAIN ocupa a área útil do
 * papel, e o front-matter pendura cabeçalho e rodapé como janelas próprias. `layout` sobrepõe o
 * `LAYOUT_PADRAO`; o front-matter sobrepõe os dois — quem escreve o documento decide por último.
 */
export async function publicarMarkdown(conexao, {
  markdown, form, origem = 'SF_EXAMPLE_01', no = 'INTRODUCTION',
  manter = ['FIRST', 'MAIN', 'INTRODUCTION'], estilo = ESTILO_PADRAO,
  salvarPdfEm, transliterar = true, variaveis = null, layout = {}, pagina = 'FIRST',
  imagens = null,
} = {}) {
  const forms = await import('./forms.mjs');
  // o conversor roda ANTES da rede: documento inválido não chega a criar objeto no SAP
  const { meta, corpo } = parseFrontMatter(markdown);
  const ast = parseMarkdown(corpo);
  const blocos = emitirBlocosSmartForm(ast, estilo, { transliterar });
  const astCabecalho = meta.cabecalho ? parseInline(meta.cabecalho) : null;
  const astRodape = meta.rodape ? parseInline(meta.rodape) : null;
  const emParagrafo = (nos) => (nos ? [{ tipo: 'paragrafo', filhos: nos }] : []);
  const usadas = variaveisDoMarkdown([...ast, ...emParagrafo(astCabecalho), ...emParagrafo(astRodape)]);
  const v = (variaveis || usadas.length) ? prepararVariaveis(usadas, variaveis ?? {}, { transliterar }) : null;
  const tabelas = blocos.filter((b) => b.tipo === 'tabela').length;
  const linhas = blocos.filter((b) => b.tipo === 'texto').flatMap((b) => b.linhas);
  // o `logo` do front-matter é mais um gráfico referenciado — o mesmo upload/conferência do corpo cobre os dois
  const usados = [...new Set([...graficosDoMarkdown(ast), ...(meta.logo ? [meta.logo.nome] : [])])];
  passo(`markdown: publicar ${blocos.length} bloco(s) — ${linhas.length} linha(s) de texto, ${tabelas} tabela(s), ${usados.length} imagem(ns) — como ${form}${v?.parametros.length ? ` (${v.parametros.length} variável(is))` : ''}`);

  // IMAGEM (item 51): sobe o que o chamador mandou subir e CONFERE cada gráfico ANTES de criar o form
  // — gráfico ausente só reclama no render, e lá a mensagem não diz qual nome falhou.
  const graficos = {};
  for (const [nome, arquivo] of Object.entries(imagens ?? {})) {
    const N = nomeDeGrafico(nome);
    if (!usados.includes(N)) throw new Error(`markdown: a imagem ${N} foi passada em \`imagens\` mas o documento não usa ![…](${N}) nem \`logo: ${N}\` — gráfico sem nó no papel é engano, não decoração.`);
    await forms.subirGrafico(conexao, typeof arquivo === 'string' ? { nome: N, arquivo, substituir: true } : { nome: N, substituir: true, ...arquivo });
  }
  for (const nome of usados) {
    const info = await forms.graficoInfo(conexao.cfg, nome);
    if (!info.existe) {
      throw new Error(`markdown: o documento usa ${nome} (imagem ou \`logo\`) e esse gráfico NÃO está no sistema (STXBITMAPS vazia para ele). O form até seria gerado, mas o render devolveria "A saída de gráfico não é possível" sem dizer qual nome falhou. Suba a imagem: { imagens: { ${nome}: 'logo.bmp' } }.`);
    }
    graficos[nome] = info;
  }

  // GEOMETRIA (item 67, I70): com `logo`, a janela de cabeçalho passa a ter a altura do gráfico —
  // ver a nota em `geometriaDoDocumento`.
  const geo = geometriaDoDocumento({ ...layout, ...meta }, {
    cabecalho: Boolean(astCabecalho), rodape: Boolean(astRodape),
    logoAlturaCm: meta.logo ? graficos[meta.logo.nome]?.alturaCm : null,
  });

  // ESTILO (item 52): o `TDFORMAT` de todo bloco é um parágrafo do Smart Style do form, e um estilo
  // que não existe no sistema NÃO dá erro — o Smart Form imprime tudo com o parágrafo default,
  // calado. Por isso a conferência vem ANTES de criar o form, como a do gráfico.
  const info = await forms.smartStyleInfo(conexao.cfg, estilo.nome);
  if (!info.existe || !info.ativo) {
    throw new Error(`markdown: o Smart Style "${estilo.nome}" ${info.existe ? 'existe mas NÃO está ativo' : 'não está no sistema'}, e o form apontando para ele imprimiria TUDO com o parágrafo default, sem erro nenhum. Publique-o antes: \`await publicarSmartStyle(cx, { estilo: ESTILO_MARKDOWN })\`.`);
  }
  const faltando = [...new Set([...estilo.titulo, estilo.paragrafo, estilo.listaOrdenada, estilo.listaItem, estilo.codigo, estilo.regra, estilo.celula, estilo.celulaCabecalho, estilo.citacao, estilo.cabecalho, estilo.rodape, ...Object.values(estilo.alinhamentoCelula ?? {})].filter(Boolean))]
    .filter((p) => !info.paragrafos.includes(p));
  if (faltando.length) {
    throw new Error(`markdown: o vocabulário aponta ${faltando.join(', ')} e o Smart Style "${estilo.nome}" ativo só tem ${info.paragrafos.join(', ')} — TDFORMAT desconhecido imprime com o parágrafo default, sem avisar.`);
  }

  const copia = await forms.copiarSmartForm(conexao, { origem, form, substituir: true });
  const { xml } = await forms.baixarSmartFormXml(conexao, { form });
  let novo = forms.limparInterfaceSmartForm(forms.podarSmartForm(xml, { manter }));
  novo = forms.definirEstiloSmartForm(novo, estilo.nome);
  if (v?.parametros.length) novo = forms.acrescentarInterfaceSmartForm(novo, v.parametros);

  // PÁGINA: sem isto o documento que transborda não sai do servidor (medido, item 50)
  novo = forms.apontarProximaPagina(novo, { pagina, proxima: pagina });
  novo = forms.definirFormatoSmartForm(novo, { formato: meta.formato ?? layout.formato, orientacao: meta.orientacao ?? layout.orientacao });
  if (meta.titulo) novo = forms.trocarCampoSmartForm(novo, 'CAPTION', paraLatin1(meta.titulo, { transliterar, onde: 'titulo' }));
  novo = forms.posicionarJanelaSmartForm(novo, 'MAIN', geo.main);

  // o 1º bloco de texto vai no nó do molde (a âncora); os demais nascem construídos, em ordem
  const primeiro = blocos[0]?.tipo === 'texto' ? blocos[0] : null;
  novo = forms.trocarTextoSmartForm(novo, no, primeiro ? primeiro.linhas : []);
  let ancora = no;
  for (const [i, b] of blocos.entries()) {
    if (b === primeiro) continue;
    const iname = { tabela: `MDTAB${i}`, imagem: `MDIMG${i}` }[b.tipo] ?? `MDTXT${i}`;
    const xmlDoNo = b.tipo === 'tabela'
      ? forms.xmlTabelaSmartForm({ iname, ...b, caption: `tabela ${i}` })
      : b.tipo === 'imagem'
        // o `btype` é parte da chave do gráfico: quem sabe qual variante existe é a STXBITMAPS
        ? forms.xmlGraficoSmartForm({ iname, grafico: b.grafico, btype: graficos[b.grafico]?.btype ?? 'BCOL', alinhamento: b.alinhamento, caption: b.alt || b.grafico })
        : forms.xmlTextoSmartForm({ iname, linhas: b.linhas, caption: `texto ${i}` });
    novo = forms.inserirNoSmartForm(novo, { apos: ancora, no: xmlDoNo });
    ancora = iname;
  }

  // cabeçalho e rodapé: janelas IRMÃS da MAIN, que a página repete a cada quebra
  let irma = 'MAIN';
  // CABEÇALHO (item 67, I70): texto e/ou logo, EMPILHADOS na ordem em que entram — o texto primeiro,
  // com a mesma quebra que separa texto de gráfico no corpo (o `GR` não avança linha sozinho — item 51).
  if (astCabecalho || meta.logo) {
    const filhosCabecalho = [];
    if (astCabecalho) {
      filhosCabecalho.push(forms.xmlTextoSmartForm({
        iname: 'MDCABECT',
        linhas: [
          { formato: estilo.cabecalho ?? estilo.titulo[0], linha: inlineParaTdline(astCabecalho, estilo, { transliterar }) },
          ...(meta.logo ? [{ formato: estilo.quebra, linha: '' }] : []),
        ],
      }));
    }
    if (meta.logo) {
      filhosCabecalho.push(forms.xmlGraficoSmartForm({
        iname: 'MDCABECGR', grafico: meta.logo.nome,
        btype: graficos[meta.logo.nome]?.btype ?? 'BCOL',
        alinhamento: meta.logo.alinhamento, caption: meta.logo.nome,
      }));
    }
    novo = forms.inserirNoSmartForm(novo, {
      apos: irma,
      no: forms.xmlJanelaSmartForm({ iname: 'MDCABEC', caption: 'MDCABEC', ...geo.cabecalho, filhos: filhosCabecalho }),
    });
    irma = 'MDCABEC';
  }
  if (astRodape) {
    novo = forms.inserirNoSmartForm(novo, {
      apos: irma,
      no: forms.xmlJanelaSmartForm({
        iname: 'MDRODAPE', caption: 'MDRODAPE', ...geo.rodape,
        filhos: [forms.xmlTextoSmartForm({
          iname: 'MDRODAPET',
          linhas: [{ formato: estilo.rodape ?? estilo.paragrafo, linha: inlineParaTdline(astRodape, estilo, { transliterar }) }],
        })],
      }),
    });
    irma = 'MDRODAPE';
  }

  const up = await forms.subirSmartFormXml(conexao, { form, xml: novo, substituir: true });
  const render = await forms.renderSmartForm(conexao, {
    form, salvarPdfEm, ...(v ? { exporting: v.exporting, declaracoes: v.declaracoes, preparo: v.preparo } : {}),
  });
  return {
    ok: Boolean(up.ok && render.pdf), form, fm: up.fm ?? copia.fm,
    blocos, linhas, tabelas, imagens: usados, graficos, variaveis: usadas, meta, geometria: geo, render,
  };
}

/**
 * Imprime DE NOVO um form já publicado, com outros valores — sem tocar no form. É a prova do item
 * 48: o documento é o mesmo, o papel é outro. `variaveis` tem de trazer as mesmas do documento (as
 * que `publicarMarkdown` devolve em `variaveis`).
 */
export async function imprimirMarkdown(conexao, { form, variaveis = {}, salvarPdfEm, transliterar = true } = {}) {
  const forms = await import('./forms.mjs');
  const usadas = Object.keys(variaveis ?? {}).map((n) => n.toUpperCase());
  const v = prepararVariaveis(usadas, variaveis, { transliterar });
  passo(`markdown: reimprimir ${form} com ${usadas.length} variável(is)`);
  return forms.renderSmartForm(conexao, { form, salvarPdfEm, exporting: v.exporting, declaracoes: v.declaracoes, preparo: v.preparo });
}

