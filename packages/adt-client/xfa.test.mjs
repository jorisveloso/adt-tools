// xfa.test.mjs — testes PUROS do emissor XFA da AST (item 58). Nada de rede.
// Os valores esperados são FIXTURES DA MEDIÇÃO (s4h 758:250, 2026-09-01): o CSS e as contagens
// vieram do gabarito que a MIGRAÇÃO escreveu para o mesmo documento — não são invenção do teste.
import { describe, it, expect } from 'vitest';
import {
  astParaXfa, buildAstXfaSource, cssDoCaractere, cssDoParagrafo, inlineParaXhtml, mmDeTwips,
  planoXfa, twipsDe, xhtmlDoDraw,
} from './xfa.mjs';
import { ESTILO_JBV } from './markdown.mjs';

const DOC = `---
cabecalho: Documento de POC
rodape: Pagina {{PAGINA}} de {{PAGINAS}}
---
# Relatorio {{CLIENTE}}

Paragrafo com **negrito**, _italico_ e \`codigo\`.

- primeiro item
- segundo item

| Coluna A | Coluna B | Coluna C |
| --- | :---: | ---: |
| a1 | b1 | c1 |
| a2 | b2 | c2 |

> uma citacao para o QU
`;

describe('medidas — twips inteiros, como a SAP arredonda', () => {
  it('0,80 cm NÃO vira 8.00mm — vira 8.01mm (453,54 tw → 454)', () => {
    expect(mmDeTwips(twipsDe('0.80', 'CM'))).toBe('8.01mm');
  });
  it('as âncoras do gabarito: 8pt → 2.82mm · 3pt → 1.06mm · 1 LN a 6 LPI → 4.23mm · 1 cm → 10.00mm', () => {
    expect(mmDeTwips(twipsDe('8.00', 'PT'))).toBe('2.82mm');
    expect(mmDeTwips(twipsDe('3.00', 'PT'))).toBe('1.06mm');
    expect(mmDeTwips(twipsDe('1.00', 'LN', { lpi: 6 }))).toBe('4.23mm');
    expect(mmDeTwips(twipsDe('1.00', 'CM'))).toBe('10.00mm');
  });
  it('unidade sem tradução é erro duro', () => {
    expect(() => twipsDe('1', 'CH')).toThrow(/unidade "CH"/);
  });
});

describe('cssDoParagrafo — a Pedra de Roseta aplicada ao STXSPARA', () => {
  it('H1 sai byte a byte como a migração escreveu (fixture do gabarito)', () => {
    expect(cssDoParagrafo('H1')).toBe(
      " font-family : 'Arial' ; font-size : 18pt ; font-weight : bold ; line-height : 4.23mm ; "
      + 'text-decoration : none ; text-align : left ; margin-top : 2.82mm ; margin-bottom : 1.41mm ; clear : both ;',
    );
  });
  it('QU carrega itálico e as margens laterais de 1 cm', () => {
    const css = cssDoParagrafo('QU');
    expect(css).toContain('font-style : italic');
    expect(css).toContain('margin-left : 10.00mm ; margin-right : 10.00mm');
  });
  it('LI recua os 0,80 cm — e o twip inteiro dá 8.01mm, não 8.00', () => {
    expect(cssDoParagrafo('LI')).toContain('margin-left : 8.01mm');
  });
  it('parágrafo que o estilo não tem é erro duro, com a lista', () => {
    expect(() => cssDoParagrafo('ZZ')).toThrow(/"ZZ" não existe no estilo Y_SF_MD/);
  });
});

describe('cssDoCaractere — o <span> do inline', () => {
  it('B leva a cauda que a migração põe em todo span', () => {
    expect(cssDoCaractere('B')).toBe(' font-weight : bold ; vertical-align : baseline ; visibility : visible ;');
  });
  it('S troca família e tamanho (o código inline)', () => {
    expect(cssDoCaractere('S')).toBe(" font-family : 'Courier New' ; font-size : 8pt ; vertical-align : baseline ; visibility : visible ;");
  });
});

describe('inlineParaXhtml — embed, SFSY e os limites medidos', () => {
  it('variável comum vira <span xfa:embed> e entra na coleção', () => {
    const variaveis = [];
    const x = inlineParaXhtml([{ tipo: 'texto', valor: 'Oi ' }, { tipo: 'variavel', nome: 'CLIENTE' }], { variaveis });
    expect(x).toBe('Oi <span xfa:embed="CLIENTE"/>');
    expect(variaveis).toEqual(['CLIENTE']);
  });
  it('{{PAGINA}}/{{PAGINAS}} viram os campos SFSY (o desmentido da Pedra de Roseta)', () => {
    const usaSfsy = [];
    const x = inlineParaXhtml([{ tipo: 'variavel', nome: 'PAGINA' }, { tipo: 'variavel', nome: 'PAGINAS' }], { usaSfsy });
    expect(x).toBe('<span xfa:embed="SFSY.PAGE"/><span xfa:embed="SFSY.FORMPAGES"/>');
    expect(usaSfsy).toEqual(['PAGE', 'FORMPAGES']);
  });
  it('{{DATA}} não tem equivalente XFA medido — erro duro, não silêncio', () => {
    expect(() => inlineParaXhtml([{ tipo: 'variavel', nome: 'DATA' }], {})).toThrow(/não tem equivalente XFA/);
  });
  it('texto escapa XML (o & de verdade não quebra o exData)', () => {
    expect(inlineParaXhtml([{ tipo: 'texto', valor: 'a & b < c' }], {})).toBe('a &amp; b &lt; c');
  });
});

describe('planoXfa — a AST agrupada em nós XFA', () => {
  const plano = planoXfa(DOC);

  it('texto contíguo vira UM draw; tabela quebra o agrupamento (4 blocos no documento da POC)', () => {
    expect(plano.blocos.map((b) => b.tipo)).toEqual(['texto', 'tabela', 'texto']);
    expect(plano.blocos[0].linhas).toHaveLength(4); // título + parágrafo + 2 itens
  });
  it('a variável do título pertence ao draw MDTXT0 e sobe para o plano', () => {
    expect(plano.blocos[0].variaveis).toEqual(['CLIENTE']);
    expect(plano.variaveis).toEqual(['CLIENTE']);
  });
  it('o rodapé pede os dois campos SFSY; o cabeçalho nenhum', () => {
    expect(plano.rodape.usaSfsy).toEqual(['PAGE', 'FORMPAGES']);
    expect(plano.cabecalho.usaSfsy).toEqual([]);
  });
  it('o XHTML do draw é um <div> wrapper com um <div style> por linha', () => {
    expect(plano.blocos[0].xhtml).toMatch(/^<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml" xmlns:xfa="http:\/\/www\.xfa\.org\/schema\/xfa-template\/2\.2\/">/);
    expect((plano.blocos[0].xhtml.match(/<div style="/g) ?? []).length).toBe(4);
  });
  it('lista numerada sai como a migração: número literal + xfa-tab-count', () => {
    const p = planoXfa('1. um\n2. dois\n');
    expect(p.blocos[0].linhas[0].conteudo).toBe('1<span style=" xfa-tab-count : 1 ;"/>um');
  });
  it('vocabulário de um estilo com definição de outro é erro duro', () => {
    expect(() => planoXfa(DOC, { vocabulario: { ...ESTILO_JBV, nome: 'SF_STYLE_01' } })).toThrow(/CSS sairia de um estilo/);
  });
  it('citação sem parágrafo de citação é erro duro (não sai como parágrafo comum, calada)', () => {
    expect(() => planoXfa('> oi\n', { vocabulario: { ...ESTILO_JBV, citacao: null } })).toThrow(/citação/);
  });
  it('variável comum em cabeçalho/rodapé é recusada (o bind aponta a MAIN)', () => {
    expect(() => planoXfa('---\nrodape: doc {{NUMERO}}\n---\noi\n')).toThrow(/janela de página/);
  });
});

describe('buildAstXfaSource — o driver gerado', () => {
  const plano = planoXfa(DOC);
  const src = buildAstXfaSource('yjbv_xfa_emit', { plano, nome: 'YJBV_POC_X58' });

  it('esqueleto: raiz com o nome do documento, pageArea com medium a4 e MAIN lr-tb', () => {
    expect(src).toContain("f->create_subform( name = 'YJBV_POC_X58' )");
    expect(src).toContain("set_medium( short = '210mm' long = '297mm' orientation = 'portrait' stock = 'a4' )");
    expect(src).toContain("lo_main->set_layout( 'lr-tb' )");
  });
  it('a variável vira campo oculto ANTES do draw, com o bind $record.MAIN.<draw>.<var>', () => {
    expect(src).toContain("campo_oculto( iv_nome = 'CLIENTE' iv_ref = '$record.MAIN.MDTXT0.CLIENTE' )");
    expect(src.indexOf('CLIENTE')).toBeLessThan(src.indexOf("iv_nome = 'MDTXT0'"));
  });
  it('REGRESSÃO: o lo_tab entra na árvore ANTES do append as_ref — fora dela o use= é engolido em silêncio (medido)', () => {
    const anexa = src.indexOf('lo_main->append_child( lo_tab )');
    const useRef = src.indexOf('lo_tab->append_child( new_child = lo_hdr as_ref = cxfa_true )');
    expect(anexa).toBeGreaterThan(-1);
    expect(useRef).toBeGreaterThan(-1);
    expect(anexa).toBeLessThan(useRef);
  });
  it('o cabeçalho da tabela é proto com overflowLeader, e as linhas são subform layout=table', () => {
    expect(src).toContain('lo_tab->set_break( overflow_leader = lo_hdr )');
    expect(src).toContain("lo_root->insert_as_prototype( lo_hdr )");
    expect(src).toContain("f->create_subform( name = 'MDTAB1L1' )");
    expect(src).toContain("lo_cel->set_size( w = '5.35cm' )"); // largura REAL, não o w="0" da migração
  });
  it('o rodapé ganha os campos SFSY com os scripts do $layout', () => {
    expect(src).toContain("campo_pagina( iv_nome = 'PAGE' iv_script = 'this.rawValue = xfa.layout.page(this)' )");
    expect(src).toContain("campo_pagina( iv_nome = 'FORMPAGES' iv_script = 'this.rawValue = xfa.layout.pageCount()' )");
    expect(src).toContain("lo_pa->append_child( new_child = lo_jan as_ref = cxfa_true )");
  });
  it('o exData vai por set_content_as_dom (o set_content_as_xstring é stub, item 57)', () => {
    expect(src).toContain('set_content_as_dom');
    expect(src).not.toContain('lo_ex->set_content_as_xstring');
  });
  it('gravarEm acrescenta a via do item 57: TADIR → migrate → set_layout_data → save + hash', () => {
    const comGravar = buildAstXfaSource('yjbv_xfa_emit', {
      plano, nome: 'YJBV_POC_X58',
      gravarEm: { scaffold: 'Y_SF_DOC', form: 'Y_FP_DOC', interfaceNome: 'Y_FP_DOC_IF' },
    });
    expect(comGravar).toContain("cl_ssf_migration=>migrate( sf_name = 'Y_SF_DOC'");
    expect(comGravar).toContain('set_layout_data( i_layout_data = lv_out i_set_xliff_ids = abap_false )');
    expect(comGravar).toContain('calculate_hash_for_raw');
  });
  it('DINA5 paisagem inverte o medium e troca o stock', () => {
    const p5 = planoXfa('---\nformato: DINA5\norientacao: paisagem\n---\noi\n');
    const s5 = buildAstXfaSource('x', { plano: p5 });
    expect(s5).toContain("short = '148mm' long = '210mm' orientation = 'landscape' stock = 'a5'");
  });
});

describe('astParaXfa — guard-rails antes da rede', () => {
  it('gravarEm incompleto é recusado antes de qualquer chamada', async () => {
    await expect(astParaXfa({ cfg: {} }, { markdown: 'oi', gravarEm: { form: 'Y_FP_X' } }))
      .rejects.toThrow(/faltou scaffold/);
  });
  it('form fora de Z/Y é recusado antes da rede', async () => {
    await expect(astParaXfa({ cfg: {} }, { markdown: 'oi', gravarEm: { scaffold: 'SF_EXAMPLE_01', form: 'XPTO', interfaceNome: 'Y_I' } }))
      .rejects.toThrow();
  });
});

describe('xhtmlDoDraw', () => {
  it('monta o wrapper com os dois namespaces do gabarito', () => {
    expect(xhtmlDoDraw([{ css: ' x ;', conteudo: 'oi' }]))
      .toBe('<div xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-template/2.2/"><div style=" x ;">oi</div></div>');
  });
});
