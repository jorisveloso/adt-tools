// diff.test.mjs — testes PUROS do diff entre sistemas. Nada de rede.
// As fixtures de XML são recortes REAIS da medição de 2026-09-01 (s4h 758 × sxd 816).
import { describe, it, expect } from 'vitest';
import {
  partesDoTipo, minusculasForaDeLiteral, normalizarFonte, limparXmlVolatil, atributosDoXml,
  diffAtributos, diffLinhas, resumirOps, formatarUnificado, metaDoXml, compararLeituras,
} from './diff.mjs';

// ---------- fixtures ----------

// DTEL BUKRS lido nos dois sistemas: o MESMO objeto. Difere só no carimbo (fuso) e nos atom:link
// (que crescem com o release) — medido 2026-09-01.
const DTEL_S4H = '<?xml version="1.0" encoding="utf-8"?><blue:wbobj adtcore:responsible="SAP" adtcore:masterLanguage="DE"'
  + ' adtcore:name="BUKRS" adtcore:type="DTEL/DE" adtcore:changedAt="2018-01-26T11:33:42Z" adtcore:version="active"'
  + ' adtcore:changedBy="SAP" adtcore:description="Buchungskreis" xmlns:atom="http://www.w3.org/2005/Atom">'
  + '<atom:link href="versions" rel="http://www.sap.com/adt/relations/versions"/>'
  + '<atom:link href="source/main" rel="http://www.sap.com/adt/relations/source"/></blue:wbobj>';
const DTEL_SXD = '<?xml version="1.0" encoding="utf-8"?><blue:wbobj adtcore:responsible="SAP" adtcore:masterLanguage="DE"'
  + ' adtcore:name="BUKRS" adtcore:type="DTEL/DE" adtcore:changedAt="2018-01-26T14:33:42Z" adtcore:version="active"'
  + ' adtcore:changedBy="SAP" adtcore:description="Buchungskreis" xmlns:atom="http://www.w3.org/2005/Atom">'
  + '<atom:link href="versions" rel="http://www.sap.com/adt/relations/versions"/>'
  + '<atom:link href="source/main" rel="http://www.sap.com/adt/relations/source"/>'
  + '<atom:link href="objectstructure" rel="http://www.sap.com/adt/relations/objectstructure"/></blue:wbobj>';

const leitura = (over = {}) => ({
  tipo: 'class', codigo: 'CLAS', nome: 'YJBV_POC_DIFF', existe: true, status: 200,
  xml: DTEL_S4H, meta: metaDoXml(DTEL_S4H), partes: [], ...over,
});
const parte = (nome, texto, status = 200) => ({ parte: nome, existe: status === 200, status, texto });

// ---------- partes ----------

describe('partesDoTipo — o que a comparação tem de ler', () => {
  it('classe tem main + os quatro includes locais (o main sozinho esconde a classe de teste)', () => {
    expect(partesDoTipo('class')).toEqual(['main', 'definitions', 'implementations', 'macros', 'testclasses']);
  });
  it('tipo de fonte comum tem só o main', () => {
    expect(partesDoTipo('table')).toEqual(['main']);
    expect(partesDoTipo('cds')).toEqual(['main']);
  });
  it('tipo de forma `xml` não tem fonte nenhuma — o /source/main dele dá 404', () => {
    expect(partesDoTipo('dataElement')).toEqual([]);
    expect(partesDoTipo('domain')).toEqual([]);
    expect(partesDoTipo('tableType')).toEqual([]);
  });
});

// ---------- normalização ----------

describe('minusculasForaDeLiteral — ABAP é case-insensitive no código, não no texto', () => {
  it('baixa o código', () => {
    expect(minusculasForaDeLiteral('CLASS cl_x DEFINITION.')).toBe('class cl_x definition.');
  });
  it('NÃO toca literal entre aspas simples', () => {
    expect(minusculasForaDeLiteral("WRITE 'ABC'.")).toBe("write 'ABC'.");
  });
  it('NÃO toca template string nem literal de string', () => {
    expect(minusculasForaDeLiteral('DATA(x) = |Olá MUNDO|.')).toBe('data(x) = |Olá MUNDO|.');
    expect(minusculasForaDeLiteral('DATA(y) = `TEXTO`.')).toBe('data(y) = `TEXTO`.');
  });
  it('NÃO toca comentário de fim de linha nem de linha inteira', () => {
    expect(minusculasForaDeLiteral('MOVE a TO b. " NÃO MEXER')).toBe('move a to b. " NÃO MEXER');
    expect(minusculasForaDeLiteral('* COMENTÁRIO INTEIRO')).toBe('* COMENTÁRIO INTEIRO');
  });
});

describe('normalizarFonte', () => {
  it('o default só normaliza quebra de linha e espaço no fim', () => {
    expect(normalizarFonte('a  \r\nb\t\nc')).toEqual(['a', 'b', 'c']);
    expect(normalizarFonte('IF  x = 1.')).toEqual(['IF  x = 1.']);
  });
  it('ignorarEspaco colapsa o espaço interno', () => {
    expect(normalizarFonte('  IF   x = 1.', { ignorarEspaco: true })).toEqual(['IF x = 1.']);
  });
  it('ignorarCaixa implica ignorar espaço e preserva literal', () => {
    expect(normalizarFonte("  WRITE   'ABC'.", { ignorarCaixa: true })).toEqual(["write 'ABC'."]);
  });
  it('ignorarVazias tira a linha em branco', () => {
    expect(normalizarFonte('a\n\nb', { ignorarVazias: true })).toEqual(['a', 'b']);
  });
});

// ---------- XML ----------

describe('limparXmlVolatil — o mesmo objeto nos dois sistemas', () => {
  it('o XML cru DIFERE (carimbo + atom:link do release)', () => {
    expect(DTEL_S4H).not.toBe(DTEL_SXD);
  });
  it('limpo, fica idêntico', () => {
    expect(limparXmlVolatil(DTEL_S4H)).toBe(limparXmlVolatil(DTEL_SXD));
  });
  it('tira os atom:link e o changedAt, e mantém o que é do objeto', () => {
    const limpo = limparXmlVolatil(DTEL_S4H);
    expect(limpo).not.toMatch(/atom:link/);
    expect(limpo).not.toMatch(/changedAt/);
    expect(limpo).toMatch(/adtcore:description="Buchungskreis"/);
    expect(limpo).toMatch(/adtcore:masterLanguage="DE"/);
  });
});

describe('atributosDoXml / diffAtributos', () => {
  it('lê os atributos com namespace', () => {
    expect(atributosDoXml(DTEL_S4H)['adtcore:name']).toEqual(['BUKRS']);
  });
  it('nada diverge entre os dois XML limpos', () => {
    expect(diffAtributos(limparXmlVolatil(DTEL_S4H), limparXmlVolatil(DTEL_SXD))).toEqual([]);
  });
  it('uma descrição diferente aparece nomeada', () => {
    const outro = DTEL_S4H.replace('Buchungskreis', 'Empresa');
    expect(diffAtributos(limparXmlVolatil(DTEL_S4H), limparXmlVolatil(outro)))
      .toEqual([{ atributo: 'adtcore:description', a: 'Buchungskreis', b: 'Empresa' }]);
  });
});

describe('metaDoXml', () => {
  it('lê nome, descrição e carimbo', () => {
    const m = metaDoXml(DTEL_S4H);
    expect(m.nome).toBe('BUKRS');
    expect(m.tipo).toBe('DTEL/DE');
    expect(m.alteradoEm).toBe('2018-01-26T11:33:42Z');
  });
});

// ---------- diff de linhas ----------

describe('diffLinhas', () => {
  const t = (s) => s.split('\n');

  it('fontes idênticos: só operações `=`', () => {
    const ops = diffLinhas(t('a\nb\nc'), t('a\nb\nc'));
    expect(resumirOps(ops)).toEqual({ comuns: 3, soEmA: 0, soEmB: 0, iguais: true });
  });

  it('uma linha alterada vira -1/+1, com os números de linha certos', () => {
    const ops = diffLinhas(t('a\nb\nc'), t('a\nB!\nc'));
    expect(resumirOps(ops)).toMatchObject({ soEmA: 1, soEmB: 1, iguais: false });
    expect(ops.find((o) => o.op === '-')).toMatchObject({ texto: 'b', a: 2 });
    expect(ops.find((o) => o.op === '+')).toMatchObject({ texto: 'B!', b: 2 });
  });

  it('inserção no meio não mexe no resto', () => {
    const ops = diffLinhas(t('a\nb'), t('a\nx\nb'));
    expect(resumirOps(ops)).toMatchObject({ comuns: 2, soEmA: 0, soEmB: 1 });
  });

  it('remoção no fim', () => {
    expect(resumirOps(diffLinhas(t('a\nb\nc'), t('a\nb')))).toMatchObject({ comuns: 2, soEmA: 1, soEmB: 0 });
  });

  it('linhas repetidas (ENDIF.) não se casam ao acaso — a âncora única é que manda', () => {
    const a = t('IF x.\nfoo.\nENDIF.\nIF y.\nbar.\nENDIF.');
    const b = t('IF x.\nfoo2.\nENDIF.\nIF y.\nbar.\nENDIF.');
    const ops = diffLinhas(a, b);
    expect(resumirOps(ops)).toMatchObject({ soEmA: 1, soEmB: 1 });
    expect(ops.find((o) => o.op === '-').texto).toBe('foo.');
  });

  it('arquivos sem nada em comum saem como bloco removido + bloco acrescentado', () => {
    expect(resumirOps(diffLinhas(t('a\nb'), t('x\ny')))).toMatchObject({ comuns: 0, soEmA: 2, soEmB: 2 });
  });

  it('um dos lados vazio', () => {
    expect(resumirOps(diffLinhas([], t('a\nb')))).toMatchObject({ comuns: 0, soEmA: 0, soEmB: 2 });
  });
});

describe('formatarUnificado', () => {
  it('mostra contexto e marca as linhas', () => {
    const saida = formatarUnificado(diffLinhas('a\nb\nc'.split('\n'), 'a\nB\nc'.split('\n')), { rotuloA: 's4h', rotuloB: 'sxd' });
    expect(saida).toMatch(/@@ s4h 1 · sxd 1 @@/);
    expect(saida).toContain('-b');
    expect(saida).toContain('+B');
    expect(saida).toContain(' a');
  });

  it('quando a comparação rodou normalizada, o texto mostrado é o do sistema', () => {
    const A = ['class x', 'method m'], B = ['class x', 'method n'];
    const saida = formatarUnificado(diffLinhas(A, B), { originaisA: ['CLASS x', 'METHOD m'], originaisB: ['class X', 'method N'] });
    expect(saida).toContain('-METHOD m');
    expect(saida).toContain('+method N');
  });
});

// ---------- veredito ----------

describe('compararLeituras — a regra, sem rede', () => {
  it('presente nos dois e igual', () => {
    const a = leitura({ partes: [parte('main', 'linha 1\nlinha 2')] });
    const b = leitura({ partes: [parte('main', 'linha 1\r\nlinha 2')] });
    const r = compararLeituras(a, b);
    expect(r.veredito).toBe('igual');
    expect(r.comparadoPor).toBe('fonte');
  });

  it('só em A / só em B / em nenhum — e o "em nenhum" NUNCA vira igual', () => {
    const existe = leitura({ partes: [parte('main', 'x')] });
    const nao = leitura({ existe: false, status: 404, xml: null, meta: null, partes: [] });
    expect(compararLeituras(existe, nao, { rotuloA: 's4h', rotuloB: 'sxd' }).veredito).toBe('soEmA');
    expect(compararLeituras(nao, existe).veredito).toBe('soEmB');
    expect(compararLeituras(nao, nao).veredito).toBe('ausente');
  });

  it('GUARD-RAIL: parte 404 dos dois lados é `ausente`, não `igual` — o corpo do erro é o mesmo nos dois sistemas', () => {
    const a = leitura({ partes: [parte('main', 'x'), parte('testclasses', null, 404)] });
    const b = leitura({ partes: [parte('main', 'x'), parte('testclasses', null, 404)] });
    const r = compararLeituras(a, b);
    expect(r.partes.find((p) => p.parte === 'testclasses').veredito).toBe('ausente');
    expect(r.veredito).toBe('igual'); // o objeto é igual; a parte inexistente não conta como conteúdo
  });

  it('o silêncio do /source/main: main idêntico e classe de teste diferente = DIFERE', () => {
    const a = leitura({ partes: [parte('main', 'igual'), parte('testclasses', 'exp = 2')] });
    const b = leitura({ partes: [parte('main', 'igual'), parte('testclasses', 'exp = 99')] });
    const r = compararLeituras(a, b);
    expect(r.veredito).toBe('difere');
    expect(r.partes.find((p) => p.parte === 'main').veredito).toBe('igual');
    expect(r.partes.find((p) => p.parte === 'testclasses').veredito).toBe('difere');
  });

  it('parte que existe num sistema só', () => {
    const a = leitura({ partes: [parte('main', 'x'), parte('testclasses', 't')] });
    const b = leitura({ partes: [parte('main', 'x'), parte('testclasses', null, 404)] });
    const r = compararLeituras(a, b);
    expect(r.partes.find((p) => p.parte === 'testclasses').veredito).toBe('soEmA');
    expect(r.veredito).toBe('difere');
  });

  it('tipo sem fonte: compara pelo XML limpo, e o carimbo divergente é AVISO, não veredito', () => {
    const a = leitura({ tipo: 'dataElement', nome: 'BUKRS', xml: DTEL_S4H, meta: metaDoXml(DTEL_S4H), partes: [] });
    const b = leitura({ tipo: 'dataElement', nome: 'BUKRS', xml: DTEL_SXD, meta: metaDoXml(DTEL_SXD), partes: [] });
    const r = compararLeituras(a, b);
    expect(r.comparadoPor).toBe('xml');
    expect(r.veredito).toBe('igual');
    expect(r.avisos.join(' ')).toMatch(/changedAt .* carimbo NÃO comparável/);
  });

  it('tipo sem fonte com atributo de conteúdo diferente: difere, nomeando o atributo', () => {
    const outro = DTEL_SXD.replace('Buchungskreis', 'Empresa');
    const r = compararLeituras(
      leitura({ tipo: 'dataElement', xml: DTEL_S4H, meta: metaDoXml(DTEL_S4H), partes: [] }),
      leitura({ tipo: 'dataElement', xml: outro, meta: metaDoXml(outro), partes: [] }),
    );
    expect(r.veredito).toBe('difere');
    expect(r.atributos.map((x) => x.atributo)).toEqual(['adtcore:description']);
  });

  it('ignorarCaixa muda o veredito de pretty-print (o caso CL_SALV_TABLE)', () => {
    const a = leitura({ partes: [parte('main', 'CLASS cl_salv_table DEFINITION')] });
    const b = leitura({ partes: [parte('main', 'class CL_SALV_TABLE definition')] });
    expect(compararLeituras(a, b).veredito).toBe('difere');
    expect(compararLeituras(a, b, { ignorarCaixa: true }).veredito).toBe('igual');
  });

  it('masterSystem diferente é aviso: o objeto não veio do mesmo lugar', () => {
    const xa = DTEL_S4H.replace('adtcore:responsible="SAP"', 'adtcore:responsible="SAP" adtcore:masterSystem="S4H"');
    const xb = DTEL_S4H.replace('adtcore:responsible="SAP"', 'adtcore:responsible="SAP" adtcore:masterSystem="SXD"');
    const r = compararLeituras(
      leitura({ xml: xa, meta: metaDoXml(xa), partes: [parte('main', 'x')] }),
      leitura({ xml: xb, meta: metaDoXml(xb), partes: [parte('main', 'x')] }),
    );
    expect(r.avisos.join(' ')).toMatch(/masterSystem S4H × SXD/);
  });
});
