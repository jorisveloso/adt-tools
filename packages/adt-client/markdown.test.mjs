// markdown.test.mjs — o conversor sem SAP. O vocabulário medido está em markdown.mjs (SF_STYLE_01,
// s4h 758, 2026-09-01); estes testes fixam o CONTRATO: o que vira o quê, e o que é recusado.
//
//   npm test

import { test, expect } from 'vitest';
import { parseMarkdown, parseInline, inlineParaTdline, emitirSmartForm, emitirBlocosSmartForm, markdownParaSmartForm, paraLatin1, variaveisDoMarkdown, textoDoInline, larguraDasColunas, prepararVariaveis, parseFrontMatter, geometriaDoDocumento, graficosDoMarkdown, nomeDeGrafico, alinhamentoDaImagem, formatoDeVariavel, variavelDeInline, ESTILO_PADRAO, ESTILO_JBV } from './markdown.mjs';
import { ESTILO_MARKDOWN } from './forms.mjs';

// ---------- parser: blocos ----------

test('blocos: título, parágrafo, listas, código e regra', () => {
  const ast = parseMarkdown(`# Título

Primeiro parágrafo,
com duas linhas.

## Seção

- um
- dois

1. primeiro
2. segundo

\`\`\`abap
WRITE 'oi'.
\`\`\`

---
`);
  expect(ast.map((b) => b.tipo)).toEqual(['titulo', 'paragrafo', 'titulo', 'lista', 'lista', 'codigo', 'regra']);
  expect(ast[0].nivel).toBe(1);
  // linhas seguidas viram UM parágrafo (o wrap do autor não é quebra do documento)
  expect(ast[1].filhos[0].valor).toBe('Primeiro parágrafo, com duas linhas.');
  expect(ast[3].ordenada).toBe(false);
  expect(ast[3].itens).toHaveLength(2);
  expect(ast[4].ordenada).toBe(true);
  expect(ast[5].linguagem).toBe('abap');
  expect(ast[5].linhas).toEqual(["WRITE 'oi'."]);
});

test('lista muda de tipo sem linha em branco: viram duas listas', () => {
  const ast = parseMarkdown('- um\n1. dois\n');
  expect(ast.map((b) => b.ordenada)).toEqual([false, true]);
});

test('bloco de código não fechado é erro, não best-effort', () => {
  expect(() => parseMarkdown('```\nWRITE 1.\n')).toThrow(/nunca fechado/);
});

// ---------- parser: inline ----------

test('inline: forte, ênfase e código, aninhados', () => {
  expect(parseInline('a **b** c').map((n) => n.tipo)).toEqual(['texto', 'forte', 'texto']);
  expect(parseInline('_i_').map((n) => n.tipo)).toEqual(['enfase']);
  expect(parseInline('`x`')[0]).toEqual({ tipo: 'codigo', valor: 'x' });
  // `**` tem de ganhar de `*`, senão o forte vira duas ênfases vazias
  const forte = parseInline('**negrito**');
  expect(forte).toHaveLength(1);
  expect(forte[0].tipo).toBe('forte');
  expect(forte[0].filhos[0].valor).toBe('negrito');
  // ênfase dentro de forte
  const misto = parseInline('**a _b_**');
  expect(misto[0].filhos.map((n) => n.tipo)).toEqual(['texto', 'enfase']);
});

test('inline vira tags de formatação de caractere do SAPscript', () => {
  expect(inlineParaTdline(parseInline('a **b** _c_ `d`')))
    .toBe('a <B>b</> <I>c</> <S>d</>');
  // texto puro passa intacto — nada de tag onde não foi pedida
  expect(inlineParaTdline(parseInline('sem formato'))).toBe('sem formato');
});

// ---------- emissor: o vocabulário medido ----------

test('emissor usa os TDFORMAT que o SF_STYLE_01 REALMENTE tem', () => {
  const linhas = markdownParaSmartForm('# T\n\ntexto\n\n- a\n\n1. b\n\n```\ncod\n```\n');
  expect(linhas).toEqual([
    { formato: 'TH', linha: 'T' },
    { formato: 'AS', linha: 'texto' },
    { formato: 'TB', linha: '- a' },      // sem parágrafo de bullet; e o recuo não sai (nem TB, nem espaço)
    { formato: 'N1', linha: 'b' },       // N1 numera sozinho (TDNUMBERIN='A')
    { formato: 'AS', linha: 'cod' },     // COURIER; o UL sobrepõe (entrelinha 0,5 LN)
  ]);
});

test('cada linha do bloco de código é uma linha própria (o parágrafo não junta)', () => {
  const linhas = markdownParaSmartForm('```\num\ndois\n```\n');
  expect(linhas).toEqual([{ formato: 'AS', linha: 'um' }, { formato: 'AS', linha: 'dois' }]);
});

test('regra horizontal é emulada com ASCII — o estilo não tem linha, e o device não tem ─', () => {
  const [r] = markdownParaSmartForm('---\n');
  expect(r.formato).toBe('AS');
  expect(r.linha).toBe('-'.repeat(ESTILO_PADRAO.larguraRegra));
});

// ---------- o device é Latin-1 (medido: acima de U+00FF o PDF sai com `#`) ----------

test('caractere fora de Latin-1 sem equivalente é recusado, com o code point', () => {
  expect(() => paraLatin1('sinal ◆ aqui')).toThrow(/U\+25C6/);
  expect(() => paraLatin1('sinal ◆ aqui')).toThrow(/sairia como "#"/);
});

test('os trocáveis comuns de editor moderno são transliterados, não recusados', () => {
  expect(paraLatin1('travessão — aspas “x” e reticências…'))
    .toBe('travessão - aspas "x" e reticências...');
  // acentuado É Latin-1: passa intacto, nada de virar ASCII
  expect(paraLatin1('ação, coração, ÊNFASE')).toBe('ação, coração, ÊNFASE');
  // transliterar:false recusa tudo — para quem quer byte a byte ou nada
  expect(() => paraLatin1('a — b', { transliterar: false })).toThrow(/U\+2014/);
});

test('o guard-rail de Latin-1 vale para o texto do autor, não só para os marcadores', () => {
  expect(markdownParaSmartForm('seta → fim\n')[0].linha).toBe('seta -> fim');
  expect(() => markdownParaSmartForm('seta → fim\n', ESTILO_PADRAO, { transliterar: false }))
    .toThrow(/U\+2192/);
  // e dentro do bloco de código também, que não passa por inline
  expect(markdownParaSmartForm('```\na — b\n```\n')[0].linha).toBe('a - b');
});

test('estilo é parâmetro: trocar de Smart Style é trocar o mapa, não o emissor', () => {
  const outro = { ...ESTILO_PADRAO, titulo: ['H1'], paragrafo: 'P', forte: 'BO' };
  expect(markdownParaSmartForm('# T\n\n**x**\n', outro)).toEqual([
    { formato: 'H1', linha: 'T' },
    { formato: 'P', linha: '<BO>x</>' },
  ]);
});

// ---------- o contrato: vocabulário FECHADO ----------

test('o que o vocabulário não tem é ERRO DURO, com a linha e o porquê', () => {
  for (const [md, esperado] of [
    ['o logo ![alt](ZL) fica no meio', /imagem no meio da linha/],
    ['veja [aqui](http://x)', /link/],
    ['<b>html</b>', /HTML/],
  ]) {
    expect(() => parseMarkdown(md), md).toThrow(esperado);
    expect(() => parseMarkdown(md), md).toThrow(/FORA do vocabulário/);
  }
});

test('a recusa diz em QUE linha — documento longo não vira caça ao erro', () => {
  expect(() => parseMarkdown('# ok\n\ntexto\n\nveja [aqui](http://x)\n')).toThrow(/linha 5/);
  expect(() => parseMarkdown('# ok\n\ntexto\n\n![x](./y.bmp)\n')).toThrow(/linha 5/);
});

// ---------- degrau 1: campo com dado (item 48) ----------

test('{{VAR}} vira nó `variavel` na AST e `&VAR&` no TDLINE — em qualquer bloco', () => {
  const ast = parseMarkdown('# Fatura {{NUMERO}}\n\nPrezado **{{CLIENTE}}**.\n\n- item {{ITEM}}\n');
  expect(ast[0].filhos.map((n) => n.tipo)).toEqual(['texto', 'variavel']);
  expect(ast[0].filhos[1].nome).toBe('NUMERO');
  // dentro de ênfase/forte a variável continua sendo variável, e a tag embrulha o campo
  expect(markdownParaSmartForm('# Fatura {{NUMERO}}\n\nPrezado **{{CLIENTE}}**.\n\n- item {{ITEM}}\n')).toEqual([
    { formato: 'TH', linha: 'Fatura &NUMERO&' },
    { formato: 'AS', linha: 'Prezado <B>&CLIENTE&</>.' },
    { formato: 'TB', linha: '- item &ITEM&' },
  ]);
  // o nome é normalizado para maiúsculas (é parâmetro de INTERFACE, não texto)
  expect(parseInline('{{ numero_da_nota }}')[0]).toEqual({ tipo: 'variavel', nome: 'NUMERO_DA_NOTA' });
});

test('variaveisDoMarkdown lista na ordem de aparição, sem repetir — inclusive dentro de lista', () => {
  const ast = parseMarkdown('# {{A}}\n\ntexto {{B}} e {{A}}\n\n1. item {{C}}\n');
  expect(variaveisDoMarkdown(ast)).toEqual(['A', 'B', 'C']);
});

test('nome de variável segue a regra do parâmetro ABAP — o resto é erro duro', () => {
  for (const ruim of ['{{1NOTA}}', '{{nota-fiscal}}', '{{}}', `{{${'X'.repeat(31)}}}`]) {
    expect(() => parseMarkdown(ruim), ruim).toThrow(/não é nome de variável/);
  }
});

test('prepararVariaveis: o documento manda, e a divergência é erro ANTES da rede', () => {
  const v = prepararVariaveis(['NUMERO', 'TOTAL'], { numero: '4711', TOTAL: { valor: 'R$ 9,90', tipo: 'STRING' } });
  expect(v.parametros).toEqual([{ nome: 'NUMERO', tipo: 'STRING' }, { nome: 'TOTAL', tipo: 'STRING' }]);
  expect(v.exporting).toEqual({ NUMERO: 'lv_v_numero', TOTAL: 'lv_v_total' });
  expect(v.declaracoes).toContain('DATA lv_v_numero TYPE STRING.');
  expect(v.preparo).toContain("lv_v_total = 'R$ 9,90'.");
  // {{X}} sem valor: o form geraria um campo sem dono — a lib recusa antes de criar objeto no SAP
  expect(() => prepararVariaveis(['NUMERO'], {})).toThrow(/{{NUMERO}}/);
  // valor sem campo no texto é engano, não decoração
  expect(() => prepararVariaveis([], { NUMERO: '1' })).toThrow(/não usa/);
  // a linha do fonte ABAP corta em 255 — valor longo é recusado com o número
  expect(() => prepararVariaveis(['X'], { X: 'a'.repeat(201) })).toThrow(/acima de 200/);
  // o valor também passa pelo device Latin-1
  expect(prepararVariaveis(['X'], { X: 'a — b' }).preparo).toContain("lv_v_x = 'a - b'.");
  expect(() => prepararVariaveis(['X'], { X: 'sinal ◆' })).toThrow(/U\+25C6/);
  // aspa simples no valor é dobrada: o literal ABAP não se quebra
  expect(prepararVariaveis(['X'], { X: "O'Brien" }).preparo).toContain("lv_v_x = 'O''Brien'.");
});

test('{{NOME:FMT}} carrega o formato de campo do SAPscript — `&NOME(FMT)&` no TDLINE (item 66)', () => {
  expect(variavelDeInline('TOTAL:10CR')).toEqual({ nome: 'TOTAL', formato: '10CR' });
  expect(variavelDeInline(' total : 15.2cr ')).toEqual({ nome: 'TOTAL', formato: '15.2CR' });
  // sem `:`, o nó continua idêntico ao de antes do item 66 — sem chave `formato`
  expect(variavelDeInline('NOME')).toEqual({ nome: 'NOME' });

  const ast = parseMarkdown('Total: {{TOTAL:10CR}}\n');
  expect(ast[0].filhos[1]).toEqual({ tipo: 'variavel', nome: 'TOTAL', formato: '10CR' });
  expect(markdownParaSmartForm('Total: {{TOTAL:10CR}}\n')).toEqual([
    { formato: 'AS', linha: 'Total: &TOTAL(10CR)&' },
  ]);
  // campo de sistema também aceita formato — mesma sintaxe, mesmo emissor
  expect(textoDoInline(parseInline('{{PAGINA:3Z}}'))).toBe('&SFSY-PAGE(3Z)&');
});

test('formato de campo é erro duro fora da gramática — LARGURA[.CASAS][C R T Z]', () => {
  expect(() => formatoDeVariavel('', 'X')).toThrow(/não é formato de campo/);
  expect(() => formatoDeVariavel('abc', 'X')).toThrow(/não é formato de campo/);
  expect(() => formatoDeVariavel('10CRQ', 'X')).toThrow(/não é formato de campo/);
  expect(() => formatoDeVariavel('1234', 'X')).toThrow(/não é formato de campo/); // largura até 3 dígitos
  expect(formatoDeVariavel('10CR', 'X')).toBe('10CR');
  expect(formatoDeVariavel('15.2', 'X')).toBe('15.2');
  expect(() => parseMarkdown('{{TOTAL:}}\n')).toThrow(/não é formato de campo/);
});

// ---------- degrau 2: TABELA (item 49) ----------

test('tabela: cabeçalho + separador + linhas viram bloco `tabela` na AST', () => {
  const ast = parseMarkdown(`Antes.

| Item | Descrição | Valor |
| --- | :---: | --- |
| 1 | Parafuso | 10,00 |
| 2 | Porca | 2,50 |

Depois.
`);
  expect(ast.map((b) => b.tipo)).toEqual(['paragrafo', 'tabela', 'paragrafo']);
  const t = ast[1];
  expect(t.alinhamentos).toEqual(['esquerda', 'centro', 'esquerda']);
  expect(t.cabecalho.map(textoDoInline)).toEqual(['Item', 'Descrição', 'Valor']);
  expect(t.linhas).toHaveLength(2);
  expect(t.linhas[1].map(textoDoInline)).toEqual(['2', 'Porca', '2,50']);
});

test('sem separador não é tabela — `| a | b |` solto continua sendo parágrafo', () => {
  const ast = parseMarkdown('| a | b |\n');
  expect(ast[0].tipo).toBe('paragrafo');
});

test('a célula aceita o inline inteiro, `\|` escapado incluído', () => {
  const t = parseMarkdown('| a | b |\n| --- | --- |\n| **x** | ou a\\|b |\n')[0];
  expect(t.linhas[0][0][0].tipo).toBe('forte');
  expect(textoDoInline(t.linhas[0][1])).toBe('ou a|b');
});

test('coluna a mais é ERRO DURO — a coluna é a POSIÇÃO da célula, e o que sobra não tem onde entrar', () => {
  expect(() => parseMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 | 3 |\n')).toThrow(/3 células e a tabela tem 2 colunas/);
  expect(() => parseMarkdown('| a | b |\n| --- |\n| 1 | 2 |\n')).toThrow(/têm de bater/);
});

test('emitirBlocosSmartForm: texto contíguo é UM nó; a tabela é outro', () => {
  const blocos = emitirBlocosSmartForm(parseMarkdown('# T\n\ntexto\n\n| a |\n| --- |\n| 1 |\n\nfim\n'));
  expect(blocos.map((b) => b.tipo)).toEqual(['texto', 'tabela', 'texto']);
  expect(blocos[0].linhas).toEqual([{ formato: 'TH', linha: 'T' }, { formato: 'AS', linha: 'texto' }]);
  expect(blocos[1].cabecalho).toEqual([{ formato: 'TH', linha: 'a' }]);
  expect(blocos[1].linhas).toEqual([[{ formato: 'AS', linha: '1' }]]);
  expect(blocos[2].linhas).toEqual([{ formato: 'AS', linha: 'fim' }]);
});

test('alinhamento: centro vira o parágrafo C; direita NÃO existe no SF_STYLE_01 e é erro duro', () => {
  const centro = emitirBlocosSmartForm(parseMarkdown('| a |\n| :---: |\n| 1 |\n'))[0];
  expect(centro.cabecalho[0].formato).toBe('C');
  expect(centro.linhas[0][0].formato).toBe('C');
  expect(() => emitirBlocosSmartForm(parseMarkdown('| a |\n| ---: |\n| 1 |\n')))
    .toThrow(/alinhamento à direita.*não tem parágrafo/s);
});

test('emitirSmartForm sozinho não dá conta de tabela — ela é nó, não linha', () => {
  expect(() => markdownParaSmartForm('| a |\n| --- |\n| 1 |\n')).toThrow(/emitirBlocosSmartForm/);
});

test('larguraDasColunas: proporcional ao conteúdo, com mínimo, e a soma bate com o total', () => {
  const cab = [parseInline('n'), parseInline('descrição bem mais longa')];
  const linhas = [[parseInline('1'), parseInline('parafuso sextavado M8')]];
  const w = larguraDasColunas(cab, linhas, { total: 16, minimo: 1.5 });
  expect(w).toHaveLength(2);
  expect(w[0]).toBeGreaterThanOrEqual(1.5);
  expect(w[1]).toBeGreaterThan(w[0]);
  expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(16, 5);
  // coluna demais para a largura é recusado com a conta na mensagem
  expect(() => larguraDasColunas(Array.from({ length: 12 }, () => parseInline('x')), [], { total: 16, minimo: 1.5 }))
    .toThrow(/não cabem em 16 cm/);
});

test('variável dentro de célula conta como variável do documento', () => {
  const ast = parseMarkdown('| a | b |\n| --- | --- |\n| {{NUM}} | {{CLI}} |\n');
  expect(variaveisDoMarkdown(ast)).toEqual(['NUM', 'CLI']);
  expect(emitirBlocosSmartForm(ast)[0].linhas[0][0].linha).toBe('&NUM&');
});

// ---------- degrau 3: front-matter, campos de sistema e geometria (item 50) ----------

test('front-matter: chaves conhecidas viram meta, e o corpo sai sem elas', () => {
  const { meta, corpo } = parseFrontMatter('---\ntitulo: Relatório\nrodape: Página {{PAGINA}}\nmargem: 3\n---\n# Vendas\n');
  expect(meta).toEqual({ titulo: 'Relatório', rodape: 'Página {{PAGINA}}', margem: 3 });
  expect(corpo).toBe('# Vendas\n');
  expect(parseMarkdown(corpo)[0].tipo).toBe('titulo');
});

test('front-matter: aspas em volta do valor saem, e a orientação vira o código do SAP', () => {
  const { meta } = parseFrontMatter('---\ncabecalho: "Confidencial"\norientacao: paisagem\nformato: letter\n---\ntexto\n');
  expect(meta).toEqual({ cabecalho: 'Confidencial', orientacao: 'L', formato: 'LETTER' });
});

// a ambiguidade que o item 50 mandou resolver: `---` é front-matter E régua horizontal
test('`---` sozinho continua sendo régua — o bloco que não fecha não é front-matter', () => {
  expect(parseFrontMatter('---\n').meta).toEqual({});
  expect(parseFrontMatter('---\n').corpo).toBe('---\n');
  expect(markdownParaSmartForm('---\n')[0].linha).toBe('-'.repeat(ESTILO_PADRAO.larguraRegra));
});

test('duas réguas com texto no meio não viram front-matter — falta a forma `chave: valor`', () => {
  const md = '---\num texto qualquer\n---\nfim\n';
  expect(parseFrontMatter(md).corpo).toBe(md);
  expect(parseMarkdown(md).map((b) => b.tipo)).toEqual(['regra', 'paragrafo', 'regra', 'paragrafo']);
});

test('front-matter reconhecido é lido com rigor: chave desconhecida e linha torta são erro duro', () => {
  expect(() => parseFrontMatter('---\ntitulo: x\nautor: eu\n---\n')).toThrow(/"autor" não é chave de front-matter/);
  expect(() => parseFrontMatter('---\ntitulo: x\nsó texto\n---\n')).toThrow(/não é "chave: valor"/);
  expect(() => parseFrontMatter('---\ntitulo: x\ntitulo: y\n---\n')).toThrow(/aparece duas vezes/);
  expect(() => parseFrontMatter('---\nmargem: muito\n---\n')).toThrow(/não é um número de centímetros/);
  expect(() => parseFrontMatter('---\nformato: A4\n---\n')).toThrow(/formato "A4" desconhecido/);
});

// item 67 (I70): o timbre — gráfico dentro da janela de cabeçalho
test('front-matter: "logo" vira { nome, alinhamento } — só o nome usa "esquerda" (padrão)', () => {
  expect(parseFrontMatter('---\nlogo: ZLOGO_ACME\n---\ntexto\n').meta).toEqual({ logo: { nome: 'ZLOGO_ACME', alinhamento: 'esquerda' } });
  expect(parseFrontMatter('---\nlogo: zlogo_acme centro\n---\ntexto\n').meta).toEqual({ logo: { nome: 'ZLOGO_ACME', alinhamento: 'centro' } });
});

test('front-matter: "logo" recusa nome inválido, alinhamento inválido e mais de dois tokens', () => {
  expect(() => parseFrontMatter('---\nlogo: ./logo.png\n---\n')).toThrow(/parece um caminho\/URL/);
  expect(() => parseFrontMatter('---\nlogo: ZLOGO topo\n---\n')).toThrow(/não é alinhamento de imagem/);
  expect(() => parseFrontMatter('---\nlogo: ZLOGO centro demais\n---\n')).toThrow(/não é "NOME" nem "NOME alinhamento"/);
});

test('{{PAGINA}} e companhia viram campo de sistema e NÃO pedem parâmetro de interface', () => {
  const nos = parseInline('Página {{PAGINA}} de {{PAGINAS}} — {{CLIENTE}}');
  expect(inlineParaTdline(nos)).toBe('Página &SFSY-PAGE& de &SFSY-FORMPAGES& - &CLIENTE&');
  expect(variaveisDoMarkdown([{ tipo: 'paragrafo', filhos: nos }])).toEqual(['CLIENTE']);
});

test('geometria: A4 com margem 2,5 deixa exatamente os 16 cm da tabela', () => {
  const g = geometriaDoDocumento();
  expect(g.pagina).toEqual({ largura: 21, altura: 29.7 });
  expect(g.main).toEqual({ left: 2.5, top: 2.5, width: 16, height: 24.7 });
  expect(g.cabecalho).toBeNull();
  expect(g.main.width).toBe(ESTILO_PADRAO.larguraTabela);
});

test('geometria: cabeçalho e rodapé comem do corpo, e nunca se sobrepõem a ele', () => {
  const g = geometriaDoDocumento({}, { cabecalho: true, rodape: true });
  expect(g.cabecalho).toEqual({ left: 2.5, top: 2.5, width: 16, height: 1.2 });
  expect(g.rodape).toEqual({ left: 2.5, top: 26, width: 16, height: 1.2 });
  expect(g.main.top).toBeGreaterThanOrEqual(g.cabecalho.top + g.cabecalho.height);
  expect(g.main.top + g.main.height).toBeLessThanOrEqual(g.rodape.top);
});

test('geometria: paisagem troca largura por altura, e margem que não cabe é erro duro', () => {
  const g = geometriaDoDocumento({ orientacao: 'L' });
  expect(g.pagina).toEqual({ largura: 29.7, altura: 21 });
  expect(g.main.width).toBe(24.7);
  expect(() => geometriaDoDocumento({ margem: 11 })).toThrow(/não cabe numa página de 21 cm/);
});

// item 67 (I70): medido no s4h que a WHEIGHT da janela não recorta o `GR` — quem evita o gráfico
// invadir o corpo é a altura do cabeçalho (e por tabela o top da MAIN) saírem do tamanho do gráfico.
test('geometria: logo sozinho — a altura do cabeçalho é a do gráfico, não a fixa de 1,2cm', () => {
  const g = geometriaDoDocumento({}, { cabecalho: false, logoAlturaCm: 4.57 });
  expect(g.cabecalho).toEqual({ left: 2.5, top: 2.5, width: 16, height: 4.57 });
  expect(g.main.top).toBeGreaterThanOrEqual(g.cabecalho.top + g.cabecalho.height);
});

test('geometria: texto + logo empilhados — a altura soma o texto (1,2cm) + folga + o gráfico', () => {
  const g = geometriaDoDocumento({}, { cabecalho: true, logoAlturaCm: 1.02 });
  expect(g.cabecalho.height).toBeCloseTo(1.2 + 0.3 + 1.02, 5);
  expect(g.main.top).toBeGreaterThanOrEqual(g.cabecalho.top + g.cabecalho.height);
});

test('geometria: sem logo o cabeçalho continua com a altura fixa do item 50 (retrocompatível)', () => {
  const g = geometriaDoDocumento({}, { cabecalho: true });
  expect(g.cabecalho.height).toBe(1.2);
});

// ---------- degrau 4: imagem (item 51) ----------

test('imagem sozinha na linha vira bloco, com nome de gráfico e alinhamento padrão', () => {
  const ast = parseMarkdown('texto antes\n\n![Logo da ACME](ZLOGO_ACME)\n\ntexto depois\n');
  expect(ast.map((b) => b.tipo)).toEqual(['paragrafo', 'imagem', 'paragrafo']);
  expect(ast[1]).toEqual({ tipo: 'imagem', alt: 'Logo da ACME', grafico: 'ZLOGO_ACME', alinhamento: 'esquerda' });
  expect(graficosDoMarkdown(ast)).toEqual(['ZLOGO_ACME']);
});

test('o título entre aspas é o ALINHAMENTO — e o que não for alinhamento é erro duro', () => {
  expect(parseMarkdown('![x](ZL "centro")\n')[0].alinhamento).toBe('centro');
  expect(parseMarkdown('![x](ZL "direita")\n')[0].alinhamento).toBe('direita');
  expect(() => parseMarkdown('![x](ZL "o logo da empresa")\n')).toThrow(/não é alinhamento de imagem/);
  expect(alinhamentoDaImagem()).toBe('esquerda');
});

// o engano mais provável de quem escreve o documento: o Smart Form não busca imagem de fora
test('caminho ou URL no lugar do nome do gráfico é erro duro, e a mensagem diz o que fazer', () => {
  expect(() => parseMarkdown('![x](./logo.png)\n')).toThrow(/parece um caminho\/URL/);
  expect(() => parseMarkdown('![x](https://acme/logo.png)\n')).toThrow(/subirGrafico/);
  expect(() => nomeDeGrafico('nome com espaço')).toThrow(/não é nome de gráfico/);
  expect(nomeDeGrafico('zlogo_acme')).toBe('ZLOGO_ACME');
});

test('imagem no MEIO de uma linha é recusada — o GR é nó, não trecho de texto', () => {
  expect(() => parseMarkdown('o logo ![x](ZL) fica aqui\n')).toThrow(/imagem no meio da linha/);
});

test('a imagem vira bloco próprio no emissor, e quebra o nó de texto em dois', () => {
  const blocos = emitirBlocosSmartForm(parseMarkdown('antes\n\n![L](ZL "centro")\n\ndepois\n'));
  expect(blocos.map((b) => b.tipo)).toEqual(['texto', 'imagem', 'texto']);
  expect(blocos[1]).toEqual({ tipo: 'imagem', grafico: 'ZL', alinhamento: 'centro', alt: 'L' });
  expect(() => emitirSmartForm(parseMarkdown('![L](ZL)\n'))).toThrow(/IMAGEM/);
});

// o achado que só o PDF pegou: sem a quebra o gráfico SOBE sobre a última linha do texto anterior
test('o texto que vem antes da imagem termina com a quebra `/` — senão a imagem corta a linha', () => {
  const blocos = emitirBlocosSmartForm(parseMarkdown('antes\n\n![L](ZL)\n'));
  expect(blocos[0].linhas.at(-1)).toEqual({ formato: ESTILO_PADRAO.quebra, linha: '' });
  // imagem no começo do documento não ganha quebra nenhuma: não há linha para empurrar
  expect(emitirBlocosSmartForm(parseMarkdown('![L](ZL)\n\ndepois\n')).map((b) => b.tipo)).toEqual(['imagem', 'texto']);
});

// ---------- degrau 5: Smart Style próprio (item 52) ----------

test('citação é do PARSER, mas quem a recusa é o ESTILO — a divisão da AST', () => {
  const ast = parseMarkdown('> uma citação\n> na mesma frase\n\ntexto\n');
  expect(ast[0]).toMatchObject({ tipo: 'citacao' });
  expect(textoDoInline(ast[0].filhos)).toBe('uma citação na mesma frase');
  expect(ast[1].tipo).toBe('paragrafo');
  // o SF_STYLE_01 não tem parágrafo de citação: o erro é do emissor, não do parser
  expect(() => emitirSmartForm(ast, ESTILO_PADRAO)).toThrow(/não tem parágrafo de citação/);
  expect(emitirSmartForm([ast[0]], ESTILO_JBV)).toEqual([{ formato: 'QU', linha: 'uma citação na mesma frase' }]);
});

test('o estilo próprio dá NÍVEL ao título, recuo ao bullet e parágrafo ao código', () => {
  const md = '# Um\n\n## Dois\n\n### Três\n\n- item\n\n```\ncodigo\n```\n';
  expect(markdownParaSmartForm(md, ESTILO_JBV)).toEqual([
    { formato: 'H1', linha: 'Um' },
    { formato: 'H2', linha: 'Dois' },
    { formato: 'H3', linha: 'Três' },
    { formato: 'LI', linha: '- item' },
    { formato: 'CO', linha: 'codigo' },
  ]);
  // no SF_STYLE_01 os três títulos caíam no MESMO parágrafo — é o teto que o item 52 desfaz
  expect(markdownParaSmartForm('# Um\n\n## Dois\n\n### Três\n').map((l) => l.formato)).toEqual(['TH', 'TH', 'TH']);
});

test('`| ---: |` deixa de ser erro duro — o estilo próprio tem parágrafo alinhado à direita', () => {
  const md = '| item | valor |\n| --- | ---: |\n| café | 9,90 |\n';
  const [t] = emitirBlocosSmartForm(parseMarkdown(md), ESTILO_JBV);
  expect(t.linhas[0].map((c) => c.formato)).toEqual(['TB', 'R']);
  expect(t.cabecalho.map((c) => c.formato)).toEqual(['TH', 'R']);
  // e no SF_STYLE_01 continua sendo erro duro, com a razão
  expect(() => emitirBlocosSmartForm(parseMarkdown(md), ESTILO_PADRAO)).toThrow(/alinhamento à direita/);
});

test('o vocabulário e o Smart Style andam juntos: todo TDFORMAT citado existe no SSST', () => {
  const paragrafos = ESTILO_MARKDOWN.paragrafos.map((p) => p.tdpargraph);
  const caracteres = ESTILO_MARKDOWN.caracteres.map((c) => c.tdstring);
  const usados = [...ESTILO_JBV.titulo, ESTILO_JBV.paragrafo, ESTILO_JBV.listaOrdenada, ESTILO_JBV.listaItem,
    ESTILO_JBV.codigo, ESTILO_JBV.citacao, ESTILO_JBV.regra, ESTILO_JBV.celula, ESTILO_JBV.celulaCabecalho,
    ...Object.values(ESTILO_JBV.alinhamentoCelula).filter(Boolean)];
  for (const p of usados) expect(paragrafos, `parágrafo ${p}`).toContain(p);
  for (const c of [ESTILO_JBV.forte, ESTILO_JBV.enfase, ESTILO_JBV.codigoInline]) expect(caracteres, `caractere ${c}`).toContain(c);
  expect(ESTILO_JBV.nome).toBe(ESTILO_MARKDOWN.nome);
});
