// xfa.mjs — o emissor XFA da AST (item 58): Markdown → Adobe Form SEM o Smart Form no meio.
//
// Até o item 55 o caminho MD→Adobe era MD→SF (`markdown.mjs`) → `migrarSmartFormParaAdobe` — dois
// objetos intermediários (SSFO + Smart Style) e as perdas da Pedra de Roseta. O item 57 provou que
// o próprio migrador não escreve XML: ele monta uma árvore `CL_SXFT_*` e chama `render( )`. Este
// módulo pendura o emissor NA MESMA API: a AST do `markdown.mjs` vira chamadas `create_*` num
// driver classrun, e o render devolve um XDP com a MESMA assinatura da migração.
//
// ---------------------------------------------------------------------------------------------
// O GABARITO É A MIGRAÇÃO — não uma spec inventada
//
// Cada construto daqui foi copiado de um XDP que a MIGRAÇÃO da SAP escreveu (s4h 758:250,
// 2026-09-01, mesmo documento pelas duas vias — ver docs/receita-forms.md § O emissor da AST):
//
//   texto      → UM <draw> por bloco de texto contíguo, exData text/html, um <div style=CSS> por
//                linha — o CSS vem do PARÁGRAFO do Smart Style (a tradução da Pedra de Roseta)
//   {{VAR}}    → <field presence="hidden"> + bind $record.MAIN.<DRAW>.<VAR> + <span xfa:embed>
//   tabela     → subform tb + break overflowLeader=#<hdr> + use do cabeçalho (PROTO, repete na
//                quebra de página) + table_body (occur 0/-1) + um subform layout="table" POR LINHA
//                + layout_row + célula lr-tb com o draw dentro
//   imagem     → subform -pad (tb) > subform -hAlign > field nonInteractive com <image href=ICF>
//                — o tamanho vem do TW da STXBITMAPS (o DPI do arquivo decide, item 51)
//   cabeçalho/ → subform PROTO (insert_as_prototype na RAIZ) + append_child(as_ref) no pageArea
//   rodapé       — e {{PAGINA}}/{{PAGINAS}} viram campos SFSY com script `xfa.layout.page(this)`.
//                ⚠ Isso DESMENTE a Pedra de Roseta ("campo de sistema não vira campo"): em janela
//                construída com text_binding a migração cria os campos — medido no gabarito.
//
// As MEDIDAS em CSS passam por TWIPS INTEIROS (o arredondamento da SAP): 0,80 cm não vira 8.00mm,
// vira 8.01mm (453,54 tw → 454 → 8,0088). `mmDeTwips` reproduz isso — é o que deixa o CSS do
// emissor byte a byte igual ao da migração.
//
// ---------------------------------------------------------------------------------------------
// O QUE O EMISSOR FAZ DIFERENTE DA MIGRAÇÃO — de propósito, e documentado
//
//   • largura de célula REAL (a migração escreve w="0"; a lib escreve a conta de
//     `larguraDasColunas` — mesma contagem de nós, documento melhor para o ADS);
//   • SEM transliteração Latin-1: o exData é XML UTF-8 — o `#` mudo é armadilha do DEVICE do
//     Smart Form, não do XFA. O documento daqui aceita o que o Markdown trouxer;
//   • o texto vive NO XDP, não em tabela por idioma: o documento emitido não tem o problema do nó
//     monolíngue (I77) — a FPLAYOUTT continua por idioma, mas o conteúdo viaja inteiro no layout;
//   • lista numerada sai como a migração: número LITERAL + <span style="xfa-tab-count : 1 ;"/> —
//     numerar de verdade seria inventar construto não medido.
//
// LIMITES (v1, medidos ou herdados): {{DATA}}/{{HORA}} não têm equivalente XFA medido → erro duro;
// o recuo pendurado do LI (TDPENTRY) fica de fora como na migração; TIF não medido (BMP é o que a
// escada sobe); o RENDER em PDF é a fila 43 (ADS). O objeto gravado por `gravarEm` nasce INATIVO —
// ativar exige ADS (receita-forms § A migração como operação).

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { assertZY, deleteObject } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { passo } from './log.mjs';
import { ESTILO_MARKDOWN, anatomiaXfa, graficoInfo, juntarBase64 } from './forms.mjs';
import {
  CAMPOS_SISTEMA, ESTILO_JBV, geometriaDoDocumento, graficosDoMarkdown, larguraDasColunas,
  parseFrontMatter, parseInline, parseMarkdown,
} from './markdown.mjs';

// ---------------------------------------------------------------------------------------------
// medidas — twips inteiros, como a SAP arredonda

/** Twips → "N.NNmm", arredondando o twip para inteiro ANTES (é o que a migração faz). Puro. */
export function mmDeTwips(tw) {
  return `${(Math.round(tw) * 25.4 / 1440).toFixed(2)}mm`;
}

/** Valor + unidade do SAPscript → twips. `LN` depende do LPI do header do estilo. Puro. */
export function twipsDe(valor, unidade, { lpi = 6 } = {}) {
  const v = Number(String(valor).replace(',', '.'));
  const u = String(unidade ?? '').toUpperCase();
  const conta = {
    CM: () => (v * 1440) / 2.54, MM: () => (v * 1440) / 25.4, PT: () => v * 20,
    IN: () => v * 1440, TW: () => v, LN: () => (1440 * v) / lpi,
  }[u];
  if (!conta) throw new Error(`xfa: unidade "${unidade}" não tem tradução para o CSS do exData (CM, MM, PT, IN, TW, LN).`);
  return conta();
}

const FAMILIAS = { HELVE: "'Arial'", COURIER: "'Courier New'", TIMES: "'Times New Roman'" };

const familiaCss = (tdfamily) => {
  const f = FAMILIAS[String(tdfamily ?? '').toUpperCase()];
  if (!f) throw new Error(`xfa: a família de fonte "${tdfamily}" não tem tradução medida (${Object.keys(FAMILIAS).join(', ')}) — o CSS do exData nomeia a fonte do PDF, não a do SAPscript.`);
  return f;
};

// ---------------------------------------------------------------------------------------------
// CSS — a Pedra de Roseta aplicada ao Smart Style (STXSPARA → style inline, campo a campo)

/**
 * O CSS de um PARÁGRAFO do estilo, no formato exato que a migração escreve (espaços, ordem e
 * arredondamento por twips conferidos contra o gabarito). Puro; código desconhecido é erro duro.
 */
export function cssDoParagrafo(codigo, definicao = ESTILO_MARKDOWN) {
  const C = String(codigo ?? '').toUpperCase();
  const p = (definicao.paragrafos ?? []).find((x) => String(x.tdpargraph).toUpperCase() === C);
  if (!p) {
    throw new Error(`xfa: o parágrafo "${codigo}" não existe no estilo ${definicao.nome} (${(definicao.paragrafos ?? []).map((x) => x.tdpargraph).join(', ')}) — sem ele não há CSS para o <div>.`);
  }
  const lpi = Number(definicao.header?.lpi ?? 6);
  const partes = [
    `font-family : ${familiaCss(p.tdfamily || definicao.header?.tdfamily)}`,
    `font-size : ${Number(p.tdheight || definicao.header?.tdheight) / 10}pt`,
    `font-weight : ${p.tdbold === 'X' ? 'bold' : 'normal'}`,
    ...(p.tditalic === 'X' ? ['font-style : italic'] : []),
    `line-height : ${mmDeTwips(twipsDe(p.tdpldist ?? '1.00', p.tdpldistu ?? 'LN', { lpi }))}`,
    'text-decoration : none',
    `text-align : ${String(p.tdpjustify ?? 'LEFT').toLowerCase()}`,
    ...(p.tdpleft ? [`margin-left : ${mmDeTwips(twipsDe(p.tdpleft, p.tdpleftu ?? 'CM', { lpi }))}`] : []),
    ...(p.tdpright ? [`margin-right : ${mmDeTwips(twipsDe(p.tdpright, p.tdprightu ?? 'CM', { lpi }))}`] : []),
    ...(p.tdptop ? [`margin-top : ${mmDeTwips(twipsDe(p.tdptop, p.tdptopu ?? 'PT', { lpi }))}`] : []),
    ...(p.tdpbot ? [`margin-bottom : ${mmDeTwips(twipsDe(p.tdpbot, p.tdpbotu ?? 'PT', { lpi }))}`] : []),
    'clear : both',
  ];
  return ` ${partes.join(' ; ')} ;`;
}

/** O CSS de um formato de CARACTERE (o <span> do inline), com a cauda que a migração põe. Puro. */
export function cssDoCaractere(codigo, definicao = ESTILO_MARKDOWN) {
  const C = String(codigo ?? '').toUpperCase();
  const c = (definicao.caracteres ?? []).find((x) => String(x.tdstring).toUpperCase() === C);
  if (!c) {
    throw new Error(`xfa: o formato de caractere "${codigo}" não existe no estilo ${definicao.nome} (${(definicao.caracteres ?? []).map((x) => x.tdstring).join(', ')}).`);
  }
  const partes = [
    ...(c.tdfamily && c.tdfamily !== '*' ? [`font-family : ${familiaCss(c.tdfamily)}`] : []),
    ...(c.tdheight && c.tdheight !== '000' ? [`font-size : ${Number(c.tdheight) / 10}pt`] : []),
    ...(c.tdbold === 'X' ? ['font-weight : bold'] : []),
    ...(c.tditalic === 'X' ? ['font-style : italic'] : []),
    'vertical-align : baseline',
    'visibility : visible',
  ];
  return ` ${partes.join(' ; ')} ;`;
}

// ---------------------------------------------------------------------------------------------
// XHTML — o conteúdo dos exData (Node monta a string; o driver só parseia e pendura no DOM)

const escXml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Inline da AST → XHTML de uma linha. Variável comum vira `<span xfa:embed>` e entra em
 * `variaveis` (é o chamador quem cria o field oculto); `{{PAGINA}}`/`{{PAGINAS}}` viram os campos
 * SFSY (`usaSfsy`); `{{DATA}}`/`{{HORA}}` não têm equivalente XFA medido — erro duro. Puro.
 */
export function inlineParaXhtml(nos, { vocabulario = ESTILO_JBV, definicao = ESTILO_MARKDOWN, variaveis = [], usaSfsy = [] } = {}) {
  const ctx = { vocabulario, definicao, variaveis, usaSfsy };
  return (nos ?? []).map((n) => {
    if (n.tipo === 'texto') return escXml(n.valor);
    if (n.tipo === 'variavel') {
      if (n.nome === 'PAGINA' || n.nome === 'PAGINAS') {
        const campo = n.nome === 'PAGINA' ? 'PAGE' : 'FORMPAGES';
        if (!usaSfsy.includes(campo)) usaSfsy.push(campo);
        return `<span xfa:embed="SFSY.${campo}"/>`;
      }
      if (n.nome in CAMPOS_SISTEMA) {
        throw new Error(`xfa: {{${n.nome}}} não tem equivalente XFA medido — no Smart Form ele é o campo de sistema ${CAMPOS_SISTEMA[n.nome]}, e o XFA não tem script conhecido para isso. Passe o valor como variável comum.`);
      }
      if (!variaveis.includes(n.nome)) variaveis.push(n.nome);
      return `<span xfa:embed="${n.nome}"/>`;
    }
    if (n.tipo === 'codigo') return `<span style="${cssDoCaractere(vocabulario.codigoInline, definicao)}">${escXml(n.valor)}</span>`;
    if (n.tipo === 'forte') return `<span style="${cssDoCaractere(vocabulario.forte, definicao)}">${inlineParaXhtml(n.filhos, ctx)}</span>`;
    if (n.tipo === 'enfase') return `<span style="${cssDoCaractere(vocabulario.enfase, definicao)}">${inlineParaXhtml(n.filhos, ctx)}</span>`;
    throw new Error(`xfa: nó inline desconhecido "${n.tipo}"`);
  }).join('');
}

/** As linhas `{ css, conteudo }` de um draw → o documento XHTML do exData (um <div> por linha). Puro. */
export function xhtmlDoDraw(linhas) {
  const divs = linhas.map((l) => `<div style="${l.css}">${l.conteudo}</div>`).join('');
  return `<div xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-template/2.2/">${divs}</div>`;
}

// ---------------------------------------------------------------------------------------------
// o PLANO — a AST agrupada em nós XFA, com XHTML pronto (puro, é a parte testável sem SAP)

/**
 * Markdown → o plano do documento XFA: a lista de nós (texto/tabela/imagem) com nome, XHTML e
 * variáveis, mais cabeçalho/rodapé e a geometria. Texto contíguo vira UM draw (como um nó TI);
 * tabela e imagem quebram o agrupamento — o espelho de `emitirBlocosSmartForm`, no vocabulário
 * do XFA. PURO, sem SAP nenhum.
 */
export function planoXfa(markdown, { vocabulario = ESTILO_JBV, definicao = ESTILO_MARKDOWN, layout = {} } = {}) {
  if (vocabulario.nome && definicao.nome && vocabulario.nome !== definicao.nome) {
    throw new Error(`xfa: o vocabulário aponta o estilo "${vocabulario.nome}" e a definição é de "${definicao.nome}" — o CSS sairia de um estilo e o TDFORMAT de outro.`);
  }
  const { meta, corpo } = parseFrontMatter(markdown);
  const ast = parseMarkdown(corpo);
  const geo = geometriaDoDocumento({ ...layout, ...meta }, { cabecalho: Boolean(meta.cabecalho), rodape: Boolean(meta.rodape) });
  const css = (cod) => cssDoParagrafo(cod, definicao);
  const blocos = [];
  let texto = null;
  const linhaDe = (formato, conteudo) => ({ css: css(formato), conteudo });
  const abre = () => { if (!texto) blocos.push(texto = { tipo: 'texto', nome: `MDTXT${blocos.length}`, linhas: [], variaveis: [] }); return texto; };
  const inline = (nos, variaveis) => inlineParaXhtml(nos, { vocabulario, definicao, variaveis });

  for (const b of ast) {
    if (b.tipo === 'tabela') { texto = null; blocos.push(planoTabela(b, blocos.length, { vocabulario, definicao, css })); continue; }
    if (b.tipo === 'imagem') {
      // no XFA a imagem não sobe sobre o texto (o GR do Smart Form sim) — nenhuma linha de quebra
      texto = null;
      blocos.push({ tipo: 'imagem', nome: `MDIMG${blocos.length}`, grafico: b.grafico, alinhamento: b.alinhamento ?? 'esquerda', alt: b.alt ?? '' });
      continue;
    }
    const t = abre();
    if (b.tipo === 'titulo') {
      t.linhas.push(linhaDe(vocabulario.titulo[Math.min(b.nivel, vocabulario.titulo.length) - 1], inline(b.filhos, t.variaveis)));
    } else if (b.tipo === 'paragrafo') {
      t.linhas.push(linhaDe(vocabulario.paragrafo, inline(b.filhos, t.variaveis)));
    } else if (b.tipo === 'citacao') {
      if (!vocabulario.citacao) throw new Error(`xfa: o documento tem uma citação (\`>\`) e o vocabulário "${vocabulario.nome}" não tem parágrafo de citação — ela sairia como parágrafo comum, calada.`);
      t.linhas.push(linhaDe(vocabulario.citacao, inline(b.filhos, t.variaveis)));
    } else if (b.tipo === 'lista') {
      b.itens.forEach((item, i) => {
        // ordenada: número LITERAL + tab, como a migração escreve (numerar de verdade não é medido)
        t.linhas.push(b.ordenada
          ? linhaDe(vocabulario.listaOrdenada, `${i + 1}<span style=" xfa-tab-count : 1 ;"/>${inline(item, t.variaveis)}`)
          : linhaDe(vocabulario.listaItem, escXml(vocabulario.marcador) + inline(item, t.variaveis)));
      });
    } else if (b.tipo === 'codigo') {
      for (const l of b.linhas) t.linhas.push(linhaDe(vocabulario.codigo, escXml(l)));
    } else if (b.tipo === 'regra') {
      t.linhas.push(linhaDe(vocabulario.regra, vocabulario.regra_char.repeat(vocabulario.larguraRegra)));
    } else {
      throw new Error(`xfa: bloco desconhecido "${b.tipo}"`);
    }
  }
  for (const t of blocos) if (t.tipo === 'texto') t.xhtml = xhtmlDoDraw(t.linhas);

  // cabeçalho/rodapé: janelas PROTO — {{PAGINA}}/{{PAGINAS}} viram campos SFSY com script
  const janela = (chave, formato) => {
    if (!meta[chave]) return null;
    const usaSfsy = []; const variaveis = [];
    const conteudo = inlineParaXhtml(parseInline(meta[chave]), { vocabulario, definicao, variaveis, usaSfsy });
    if (variaveis.length) throw new Error(`xfa: {{${variaveis[0]}}} no ${chave} — variável comum em janela de página não é medida (o bind aponta a MAIN); use PAGINA/PAGINAS ou texto fixo.`);
    return { xhtml: xhtmlDoDraw([{ css: css(formato), conteudo }]), usaSfsy };
  };
  const cabecalho = janela('cabecalho', vocabulario.cabecalho ?? vocabulario.titulo[0]);
  const rodape = janela('rodape', vocabulario.rodape ?? vocabulario.paragrafo);

  return {
    meta, geo, blocos, cabecalho, rodape,
    formato: String(meta.formato ?? layout.formato ?? 'DINA4').toUpperCase(),
    variaveis: [...new Set(blocos.filter((b) => b.tipo === 'texto' || b.tipo === 'tabela').flatMap((b) => b.variaveis))],
    graficos: graficosDoMarkdown(ast),
  };
}

/** Um bloco `tabela` da AST → o plano da tabela XFA (larguras, células como XHTML). Puro. */
function planoTabela(b, indice, { vocabulario, definicao, css }) {
  const formatoDe = (col, padrao) => {
    const al = b.alinhamentos?.[col] ?? 'esquerda';
    const fmt = vocabulario.alinhamentoCelula?.[al];
    if (al !== 'esquerda' && !fmt) {
      throw new Error(`xfa: a coluna ${col + 1} da tabela pede alinhamento à ${al}, e o vocabulário "${vocabulario.nome}" não tem parágrafo desse alinhamento.`);
    }
    return fmt ?? padrao;
  };
  const variaveis = [];
  const inline = (nos) => inlineParaXhtml(nos, { vocabulario, definicao, variaveis });
  const larguras = larguraDasColunas(b.cabecalho, b.linhas, { total: vocabulario.larguraTabela, minimo: vocabulario.larguraMinimaColuna });
  const celula = (nos, col, padrao) => ({ xhtml: xhtmlDoDraw([{ css: css(formatoDe(col, padrao)), conteudo: inline(nos) }]) });
  return {
    tipo: 'tabela', nome: `MDTAB${indice}`, larguras, variaveis,
    cabecalho: b.cabecalho.map((c, i) => celula(c, i, vocabulario.celulaCabecalho)),
    linhas: b.linhas.map((l) => l.map((c, i) => celula(c, i, vocabulario.celula))),
  };
}

// ---------------------------------------------------------------------------------------------
// o DRIVER — a árvore CL_SXFT_* gerada por documento (o XHTML viaja em base64, sem escape ABAP)

const esc = (v) => String(v).replace(/'/g, "''");
const B64_CHUNK = 200;

/** `<var> = unb64( … )` com o texto em pedaços de base64 — literal ABAP sem escape. Trecho ABAP. */
const abapTexto = (texto) => {
  const b64 = Buffer.from(String(texto), 'utf8').toString('base64');
  const partes = [];
  for (let i = 0; i < b64.length; i += B64_CHUNK) partes.push(b64.slice(i, i + B64_CHUNK));
  return `    CLEAR lt_b64.
${partes.map((p) => `    APPEND '${p}' TO lt_b64.`).join('\n')}
    lv_html = unb64( lt_b64 ).`;
};

const cmAttr = (v) => `${v}cm`;

// o `stock` do <medium>, por formato da lib (só a4 conferido no gabarito; os demais seguem o nome)
const STOCK = { DINA3: 'a3', DINA4: 'a4', DINA5: 'a5', LETTER: 'letter', LEGAL: 'legal' };

/**
 * Fonte do driver que monta a árvore `CL_SXFT_*` do plano, renderiza e devolve o XDP em base64.
 * `gravarEm` acrescenta a via do item 57: migrate de um scaffold → `set_layout_data` → `save`,
 * com o sha1 do que a FPLAYOUTT gravou. Puro.
 */
export function buildAstXfaSource(name, { plano, nome = 'DOCUMENTO', graficos = {}, gravarEm = null } = {}) {
  const N = String(nome).toUpperCase();
  const g = plano.geo;
  const linhas = [];
  const w = (v) => `'${esc(v)}'`;

  // --- texto: campos ocultos das variáveis + o draw
  const blocoTexto = (b) => {
    const campos = b.variaveis.map((v) => `    lo_main->append_child( campo_oculto( iv_nome = '${esc(v)}' iv_ref = '$record.MAIN.${esc(b.nome)}.${esc(v)}' ) ).`).join('\n');
    return `${campos ? `${campos}\n` : ''}${abapTexto(b.xhtml)}
    lo_main->append_child( texto( iv_nome = '${esc(b.nome)}' iv_w = ${w(cmAttr(g.main.width))} iv_html = lv_html iv_desc = '${esc(b.nome)}' ) ).`;
  };

  // --- tabela: proto do cabeçalho + corpo com um subform layout="table" por linha
  const blocoTabela = (b) => {
    const W = cmAttr(g.main.width);
    const cel = (celula, largura, nomeCel, nomeDraw, alvo) => `${abapTexto(celula.xhtml)}
    lo_cel = f->create_subform( name = '${esc(nomeCel)}' ).
    lo_cel->set_layout( 'lr-tb' ). lo_cel->set_size( w = ${w(cmAttr(largura))} ).
    lo_cel->set_occurrence( min = '1' max = '1' ).
    lo_cel->append_child( texto( iv_nome = '${esc(nomeDraw)}' iv_w = ${w(cmAttr(largura))} iv_html = lv_html iv_desc = '${esc(nomeDraw)}' ) ).
    ${alvo}->append_child( lo_cel ).`;
    const linhaTabela = (cells, sufixo, alvo) => `    lo_lin = f->create_subform( name = '${esc(b.nome)}L${sufixo}' ).
    lo_lin->set_layout( 'table' ). lo_lin->set_size( w = ${w(W)} ).
    lo_lin->set_occurrence( min = '1' max = '1' ). lo_lin->set_keep( intact = 'contentArea' ).
    lo_row = f->create_subform( name = 'layout_row' ).
    lo_row->set_layout( 'row' ). lo_row->set_size( w = ${w(W)} ).
${cells.map((c, i) => cel(c, b.larguras[i], `${b.nome}L${sufixo}C${i + 1}`, `${b.nome}TL${sufixo}C${i + 1}`, 'lo_row')).join('\n')}
    lo_lin->append_child( lo_row ).
    ${alvo}->append_child( lo_lin ).`;
    return `    " tabela ${b.nome}: o cabeçalho é PROTO — o overflowLeader repete na quebra de página
    lo_hdr = f->create_subform( name = '${esc(b.nome)}EVH-header' id = '${esc(b.nome)}EVH' ).
    lo_hdr->set_layout( 'position' ). lo_hdr->set_size( w = ${w(W)} ).
    lo_hdr->set_occurrence( min = '1' max = '1' ). lo_hdr->set_keep( intact = 'contentArea' ).
${linhaTabela(b.cabecalho, 'H', 'lo_hdr')}
    lo_root->insert_as_prototype( lo_hdr ).
    " o lo_tab entra na árvore ANTES do append as_ref — fora dela a referência é engolida em silêncio
    lo_tab = f->create_subform( name = '${esc(b.nome)}' ).
    lo_tab->set_layout( 'tb' ).
    lo_main->append_child( lo_tab ).
    lo_tab->set_break( overflow_leader = lo_hdr ).
    lo_tab->append_child( new_child = lo_hdr as_ref = cxfa_true ).
    lo_bdy = f->create_subform( name = 'table_body' ).
    lo_bdy->set_layout( 'tb' ). lo_bdy->set_occurrence( min = '0' max = '-1' ).
    lo_bdy->set_break( start_new = '0' ).
${b.linhas.map((l, r) => linhaTabela(l, String(r + 1), 'lo_bdy')).join('\n')}
    lo_tab->append_child( lo_bdy ).`;
  };

  // --- imagem: -pad > -hAlign > field nonInteractive com <image href> (tamanho = TW da STXBITMAPS)
  const blocoImagem = (b) => {
    const info = graficos[b.grafico];
    if (!info) throw new Error(`xfa: o plano usa o gráfico ${b.grafico} e ele não veio em { graficos } — quem resolve STXBITMAPS é astParaXfa.`);
    const alinh = { esquerda: 'left', centro: 'center', direita: 'right' }[b.alinhamento] ?? 'left';
    return `    lo_pad = f->create_subform( name = '${esc(b.nome)}-pad' ).
    lo_pad->set_layout( 'tb' ). lo_pad->set_size( w = ${w(cmAttr(g.main.width))} ).
    lo_hal = f->create_subform( name = '${esc(b.nome)}-hAlign' ).
    lo_hal->set_halign( '${alinh}' ).
    lo_fld = f->create_field( name = '${esc(b.nome)}' ).
    lo_fld->set_access( 'nonInteractive' ).
    lo_fld->set_size( w = '${esc(info.larguraMm)}' h = '${esc(info.alturaMm)}' ).
    lo_fld->set_bind( ref = '$record.MAIN.${esc(b.nome)}' match = 'dataRef' ).
    lo_img = f->create_image( ).
    lo_img->set_content_type( '${esc(info.contentType)}' ).
    lo_img->set_href( '${esc(info.href)}' ).
    lo_fld->set_value( content = lo_img ).
    lo_hal->append_child( lo_fld ).
    lo_pad->append_child( lo_hal ).
    lo_main->append_child( lo_pad ).`;
  };

  // --- cabeçalho/rodapé: janela PROTO pendurada no pageArea por referência (use=)
  const blocoJanela = (jan, sufixo, medidas, drawNome) => {
    if (!jan) return '';
    const sfsy = jan.usaSfsy.length ? `    lo_sfy = f->create_subform( name = 'SFSY' ).
${jan.usaSfsy.map((c) => `    lo_sfy->append_child( campo_pagina( iv_nome = '${c}' iv_script = '${c === 'PAGE' ? 'this.rawValue = xfa.layout.page(this)' : 'this.rawValue = xfa.layout.pageCount()'}' ) ).`).join('\n')}
    lo_jan->append_child( lo_sfy ).\n` : '';
    return `    lo_jan = f->create_subform( name = 'FIRST_${sufixo}' id = 'FIRST_${sufixo}' ).
    lo_jan->set_layout( 'lr-tb' ).
    lo_jan->set_position( x = ${w(cmAttr(medidas.left))} y = ${w(cmAttr(medidas.top))} ).
    lo_jan->set_size( w = ${w(cmAttr(medidas.width))} h = ${w(cmAttr(medidas.height))} ).
    lo_jan->set_occurrence( min = '1' max = '1' ). lo_jan->set_keep( intact = 'contentArea' ).
${sfsy}${abapTexto(jan.xhtml)}
    lo_jan->append_child( texto( iv_nome = '${drawNome}' iv_w = ${w(cmAttr(medidas.width))} iv_html = lv_html iv_desc = '${drawNome}' ) ).
    lo_root->insert_as_prototype( lo_jan ).
    lo_pa->append_child( new_child = lo_jan as_ref = cxfa_true ).`;
  };

  for (const b of plano.blocos) {
    if (b.tipo === 'texto') linhas.push(blocoTexto(b));
    else if (b.tipo === 'tabela') linhas.push(blocoTabela(b));
    else if (b.tipo === 'imagem') linhas.push(blocoImagem(b));
  }

  const gravar = gravarEm ? `
    " gravar num SFPF real — a via do item 57: o migrate devolve o wb e o save aceita XDP arbitrário
    CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = ' ' wi_tadir_pgmid = 'R3TR'
      wi_tadir_object = 'SFPI' wi_tadir_obj_name = '${esc(gravarEm.interfaceNome)}'
      wi_tadir_devclass = '${esc(gravarEm.pkg ?? '$TMP')}' EXCEPTIONS OTHERS = 1.
    out->write( |XFA_TADIR_SFPI subrc={ sy-subrc }| ).
    CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = ' ' wi_tadir_pgmid = 'R3TR'
      wi_tadir_object = 'SFPF' wi_tadir_obj_name = '${esc(gravarEm.form)}'
      wi_tadir_devclass = '${esc(gravarEm.pkg ?? '$TMP')}' EXCEPTIONS OTHERS = 1.
    out->write( |XFA_TADIR_SFPF subrc={ sy-subrc }| ).
    DATA(ls_opt) = cl_ssf_migration=>set_default_migrating_options( ).
    DATA(lo_wb) = cl_ssf_migration=>migrate( sf_name = '${esc(gravarEm.scaffold)}'
      fp_form_name = '${esc(gravarEm.form)}' fp_interface_name = '${esc(gravarEm.interfaceNome)}'
      options = ls_opt ).
    out->write( |XFA_MIGRATE ok| ).
    DATA(lo_form) = CAST if_fp_form( lo_wb->get_object( ) ).
    lo_form->get_layout( )->set_layout_data( i_layout_data = lv_out i_set_xliff_ids = abap_false ).
    lo_wb->save( ).
    lo_wb->free( ).
    COMMIT WORK AND WAIT.
    SELECT SINGLE layout FROM fplayoutt
      WHERE name = '${esc(gravarEm.form)}' AND state = 'I' AND language = @sy-langu
      INTO @DATA(lv_gravado).
    DATA lv_hash TYPE string.
    cl_abap_message_digest=>calculate_hash_for_raw( EXPORTING if_data = lv_gravado IMPORTING ef_hashstring = lv_hash ).
    out->write( |XFA_SAVE subrc={ sy-subrc } len={ xstrlen( lv_gravado ) } igual={ xsdbool( lv_gravado = lv_out ) } hash={ lv_hash }| ).` : '';

  return `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
    DATA f TYPE REF TO if_sxft_factory.
    DATA ixml TYPE REF TO if_ixml.
    DATA sfx TYPE REF TO if_ixml_stream_factory.
    METHODS unb64 IMPORTING it_b64 TYPE string_table RETURNING VALUE(rv) TYPE string.
    METHODS exdata IMPORTING iv_html TYPE string RETURNING VALUE(ro) TYPE REF TO if_sxft_content_exdata RAISING cx_sxft.
    METHODS ui_texto IMPORTING iv_multi TYPE abap_bool RETURNING VALUE(ro) TYPE REF TO if_sxft_ui RAISING cx_sxft.
    METHODS campo_oculto IMPORTING iv_nome TYPE string iv_ref TYPE string RETURNING VALUE(ro) TYPE REF TO if_sxft_field RAISING cx_sxft.
    METHODS campo_pagina IMPORTING iv_nome TYPE string iv_script TYPE string RETURNING VALUE(ro) TYPE REF TO if_sxft_field RAISING cx_sxft.
    METHODS texto IMPORTING iv_nome TYPE string iv_w TYPE string iv_html TYPE string iv_desc TYPE string RETURNING VALUE(ro) TYPE REF TO if_sxft_draw RAISING cx_sxft.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD unb64.
    DATA lv_b64 TYPE string.
    CONCATENATE LINES OF it_b64 INTO lv_b64.
    rv = cl_abap_codepage=>convert_from( cl_web_http_utility=>decode_x_base64( lv_b64 ) ).
  ENDMETHOD.
  METHOD exdata.
    " o caminho VIVO do exData é set_content_as_dom — o set_content_as_xstring é stub TODO (item 57)
    ro = f->create_exdata( ).
    ro->set_content_type( 'text/html' ).
    DATA(lo_doc) = ixml->create_document( ).
    DATA(lo_ist) = sfx->create_istream_string( iv_html ).
    ixml->create_parser( document = lo_doc istream = lo_ist stream_factory = sfx )->parse( ).
    ro->set_content_as_dom( lo_doc->get_root_element( ) ).
  ENDMETHOD.
  METHOD ui_texto.
    DATA(lo_te) = f->create_ui_textedit( ).
    IF iv_multi = abap_true. lo_te->set_multiline( '1' ). ENDIF.
    ro = f->create_ui( ).
    ro->set_ui_element( i_ui_element = lo_te i_type = cxfa_elem_ui_textedit ).
  ENDMETHOD.
  METHOD campo_oculto.
    ro = f->create_field( name = iv_nome ).
    ro->set_presence( 'hidden' ).
    ro->set_bind( ref = iv_ref match = 'dataRef' ).
    ro->set_ui( ui_texto( abap_false ) ).
  ENDMETHOD.
  METHOD campo_pagina.
    ro = f->create_field( name = iv_nome ).
    ro->set_presence( 'hidden' ).
    ro->set_bind( match = 'none' ).
    DATA(lo_ev) = f->create_event( ).
    lo_ev->set_activity( 'ready' ).
    lo_ev->set_ref( '$layout' ).
    lo_ev->set_script( content_type = cxfa_content_type_javascript content = iv_script ).
    ro->append_child( lo_ev ).
    ro->set_ui( ui_texto( abap_false ) ).
  ENDMETHOD.
  METHOD texto.
    ro = f->create_draw( name = iv_nome ).
    ro->set_size( w = iv_w ).
    ro->set_value( content = exdata( iv_html ) ).
    ro->set_ui( ui_texto( abap_true ) ).
    DATA(lo_tx) = f->create_text( ).
    lo_tx->set_content( iv_desc ).
    ro->set_desc( content = lo_tx ).
  ENDMETHOD.
  METHOD if_oo_adt_classrun~main.
    DATA: lv_out TYPE xstring, lv_b64 TYPE string, lv_off TYPE i, lv_cut TYPE i,
          lt_b64 TYPE string_table, lv_html TYPE string.
    DATA: lo_tab TYPE REF TO if_sxft_subform, lo_hdr TYPE REF TO if_sxft_subform,
          lo_lin TYPE REF TO if_sxft_subform, lo_row TYPE REF TO if_sxft_subform,
          lo_cel TYPE REF TO if_sxft_subform, lo_bdy TYPE REF TO if_sxft_subform,
          lo_pad TYPE REF TO if_sxft_subform, lo_hal TYPE REF TO if_sxft_subform,
          lo_jan TYPE REF TO if_sxft_subform, lo_sfy TYPE REF TO if_sxft_subform,
          lo_fld TYPE REF TO if_sxft_field, lo_img TYPE REF TO if_sxft_content_image.
    TRY.
        ixml = cl_ixml=>create( ).
        sfx = ixml->create_stream_factory( ).
        DATA lr_t TYPE REF TO if_sxft_template.
        CREATE OBJECT lr_t TYPE cl_sxft_template.
        f = lr_t->get_factory( ).
        DATA(lo_root) = f->create_subform( name = '${esc(N)}' ).
        lr_t->append_child( lo_root ).
        DATA(lo_ps) = f->create_pageset( ).
        DATA(lo_pa) = f->create_pagearea( name = 'FIRST' ).
        lo_pa->set_occurrence( min = '0' max = '-1' ).
        lo_pa->set_medium( short = '${esc(Math.round(Math.min(g.pagina.largura, g.pagina.altura) * 10))}mm' long = '${esc(Math.round(Math.max(g.pagina.largura, g.pagina.altura) * 10))}mm' orientation = '${g.pagina.largura > g.pagina.altura ? 'landscape' : 'portrait'}' stock = '${STOCK[plano.formato] ?? 'a4'}' ).
        DATA(lo_ca) = f->create_contentarea( name = 'contentArea-FIRST-MAIN' id = 'contentArea-FIRST-MAIN' ).
        lo_ca->set_position( x = ${w(cmAttr(g.main.left))} y = ${w(cmAttr(g.main.top))} ).
        lo_ca->set_size( w = ${w(cmAttr(g.main.width))} h = ${w(cmAttr(g.main.height))} ).
        lo_pa->append_child( lo_ca ).
        lo_ps->append_child( lo_pa ).
        lo_root->set_pageset( lo_ps ).
        DATA(lo_main) = f->create_subform( name = 'MAIN' id = 'MAIN' ).
        lo_main->set_layout( 'lr-tb' ).
        lo_main->set_size( w = ${w(cmAttr(g.main.width))} ).
        lo_main->set_occurrence( min = '1' max = '1' ).
        lo_main->set_keep( intact = 'contentArea' ).
        lo_root->append_child( lo_main ).
${linhas.join('\n')}
${blocoJanela(plano.cabecalho, 'MDCABEC', g.cabecalho ?? {}, 'MDCABECT')}
${blocoJanela(plano.rodape, 'MDRODAPE', g.rodape ?? {}, 'MDRODAPET')}
        DATA(lo_os) = sfx->create_ostream_xstring( lv_out ).
        lr_t->render( lo_os ).
        out->write( |XFA_OK bytes={ xstrlen( lv_out ) }| ).
        lv_b64 = cl_web_http_utility=>encode_x_base64( lv_out ).
        out->write( |XFA_B64_LEN { strlen( lv_b64 ) }| ).
        CLEAR lv_off.
        WHILE lv_off < strlen( lv_b64 ).
          lv_cut = strlen( lv_b64 ) - lv_off.
          IF lv_cut > ${B64_CHUNK}. lv_cut = ${B64_CHUNK}. ENDIF.
          out->write( |XFA_B64 { lv_b64+lv_off(lv_cut) }| ).
          lv_off = lv_off + lv_cut.
        ENDWHILE.${gravar}
      CATCH cx_root INTO DATA(lx).
        out->write( |XFA_EXC { cl_abap_classdescr=>get_class_name( lx ) }: { lx->get_text( ) }| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.`;
}

// ---------------------------------------------------------------------------------------------
// a OPERAÇÃO

/**
 * Markdown → XDP/XFA pelo emissor da AST — **sem o Smart Form no meio** (item 58).
 *
 * ```js
 * import { astParaXfa } from 'adt-client/xfa';
 * const r = await astParaXfa(cx, { markdown, nome: 'Y_FP_DOC', salvarEm: 'doc.xdp' });
 * // r.xdp · r.anatomia · r.sha1 · r.variaveis · r.plano
 * ```
 *
 * O driver é GERADO por documento (o risco nomeado na I85, resolvido como `publicarMarkdown`
 * resolve o SF-XML: o documento viaja em base64 dentro do fonte). Com `gravarEm:
 * { scaffold, form, interfaceNome }` o MESMO driver grava o XDP num SFPF real pela via do item 57
 * (migrate do scaffold → set_layout_data → save) e devolve o sha1 do que a FPLAYOUTT guardou —
 * `r.gravacao.igual` é a prova de byte a byte. O par SFPF+SFPI nasce INATIVO (ativar exige ADS).
 */
export async function astParaXfa(conexao, {
  markdown, nome = 'DOCUMENTO', vocabulario = ESTILO_JBV, definicao = ESTILO_MARKDOWN,
  layout = {}, driver = 'YJBV_XFA_EMIT', keepDriver = false, salvarEm, gravarEm = null,
} = {}) {
  const plano = planoXfa(markdown, { vocabulario, definicao, layout });
  if (gravarEm) {
    for (const c of ['scaffold', 'form', 'interfaceNome']) {
      if (!gravarEm[c]) throw new Error(`xfa: gravarEm precisa de { scaffold, form, interfaceNome } — faltou ${c}. O scaffold é um Smart Form existente qualquer: a via medida de CRIAR o SFPF é o migrate (item 57).`);
    }
    assertZY(gravarEm.form); assertZY(gravarEm.interfaceNome);
  }

  // gráfico ausente no XFA é como no Smart Form: só falha lá na frente, sem dizer o nome — conferir antes
  const graficos = {};
  for (const nomeG of plano.graficos) {
    const info = await graficoInfo(conexao.cfg, nomeG);
    if (!info.existe) {
      throw new Error(`xfa: o documento usa ![…](${nomeG}) e esse gráfico não está no sistema (STXBITMAPS vazia). Suba antes com subirGrafico — o <image href> aponta a URL ICF do gráfico, e ela só existe com ele gravado.`);
    }
    graficos[nomeG] = {
      contentType: 'image/bmp', // BMP é o formato medido (gabarito); TIF fica em aberto
      href: `/sap/bc/fp/graphics/public/graphics/bmap/${String(info.btype).toLowerCase()}/${nomeG.toLowerCase()}.bmp`,
      larguraMm: mmDeTwips(Number(info.linha.WIDTHTW)), alturaMm: mmDeTwips(Number(info.linha.HEIGHTTW)),
    };
  }

  const source = buildAstXfaSource(driver, { plano, nome, graficos, gravarEm });
  passo(`xfa: emitir ${plano.blocos.length} bloco(s) como ${nome}${gravarEm ? ` e gravar em ${gravarEm.form}` : ''}`);
  assertZY(driver);
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, pkg: '$TMP', description: `driver: emissor XFA de ${nome}`, source });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  const exc = String(r.saida ?? '').match(/XFA_EXC ([^\n]*)/)?.[1] ?? null;
  if (!r.ok || exc) throw new Error(`xfa: o driver ${driver} falhou: ${exc ?? r.erro ?? r.saida}`);

  const b64 = juntarBase64(r.saida, 'XFA_B64');
  if (!b64) throw new Error(`xfa: o driver não devolveu XDP — saída: ${String(r.saida).slice(0, 300)}`);
  const xdp = Buffer.from(b64, 'base64').toString('utf8');
  const sha1 = createHash('sha1').update(Buffer.from(b64, 'base64')).digest('hex');

  let gravacao = null;
  if (gravarEm) {
    const save = String(r.saida).match(/XFA_SAVE subrc=(\d+) len=(\d+) igual=(\S+) hash=(\S+)/);
    if (!save) throw new Error(`xfa: gravarEm foi pedido e o driver não reportou XFA_SAVE — saída: ${String(r.saida).slice(0, 300)}`);
    gravacao = {
      form: gravarEm.form, interfaceNome: gravarEm.interfaceNome, state: 'I',
      subrc: Number(save[1]), len: Number(save[2]), igual: save[3] === 'X', hash: save[4].toLowerCase(),
    };
    if (!gravacao.igual || gravacao.hash !== sha1) {
      throw new Error(`xfa: o que a FPLAYOUTT guardou não é o render (igual=${save[3]}, hash ${save[4]} × ${sha1}) — não afirme a gravação.`);
    }
  }

  if (salvarEm) await writeFile(salvarEm, xdp, 'utf8');
  return {
    ok: true, nome, xdp, sha1, anatomia: anatomiaXfa(xdp), variaveis: plano.variaveis,
    graficos: plano.graficos, plano, gravacao, arquivo: salvarEm ?? null, saida: r.saida,
  };
}
