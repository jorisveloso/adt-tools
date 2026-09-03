// cobertura.test.mjs — as partes puras do relatório, sobre o XML REAL da medição
// (S4H 758, 2026-08-31, YJBV_POC_CL_COV31: 3 métodos, 2 exercitados). Não "corrija" a fixture.
import { test, expect } from 'vitest';
import { parseCoverageTree, metodosDaArvore, totaisDaArvore, relatorioMarkdown, TIPOS_COBERTURA } from './cobertura.mjs';
import { COV_ARVORE } from './parsers.test.mjs';

const arvore = parseCoverageTree(COV_ARVORE);
const metodos = metodosDaArvore(arvore);
const totais = totaisDaArvore(arvore);

test('cobertura: a árvore vem com os três níveis e o método traz a LINHA do fonte', () => {
  expect(arvore).toHaveLength(1);
  const programa = arvore[0];
  expect(programa.nome).toBe('YJBV_POC_CL_COV31=============CP');
  expect(programa.tipo).toBe('CLAS/OCI');
  expect(programa.cobertura.statement).toEqual({ total: 12, executed: 6, percent: 50 });
  // raiz → classe → 3 métodos
  expect(programa.filhos).toHaveLength(1);
  expect(programa.filhos[0].filhos.map((n) => n.nome)).toEqual(['CLASSIFICAR', 'NUNCA_CHAMADO', 'SOMAR']);
  expect(programa.filhos[0].filhos[1].linha).toBe(23);
  expect(programa.filhos[0].filhos[1].coluna).toBe(9);
});

test('cobertura: os métodos são as FOLHAS, ordenadas, com o programa a que pertencem', () => {
  expect(metodos.map((m) => m.nome)).toEqual(['CLASSIFICAR', 'NUNCA_CHAMADO', 'SOMAR']);
  expect(metodos[0].programa).toBe('YJBV_POC_CL_COV31');
  expect(metodos[0].tipo).toBe('CLAS/OM');
  expect(metodos[1].cobertura.statement).toEqual({ total: 4, executed: 0, percent: 0 });
  expect(metodos[2].cobertura.statement.percent).toBe(100);
});

test('cobertura: os totais são os da RAIZ — a árvore não se soma nível a nível', () => {
  // 12, não 36: o mesmo statement aparece na raiz, no programa e nos métodos.
  expect(totais.statement).toEqual({ total: 12, executed: 6, percent: 50 });
  expect(totais.branch).toEqual({ total: 7, executed: 4, percent: 57.14 });
  expect(totais.procedure).toEqual({ total: 3, executed: 2, percent: 66.67 });
  expect(Object.keys(totais).sort()).toEqual([...TIPOS_COBERTURA].sort());
});

test('cobertura: o markdown mostra o método sem cobertura, com linha e semáforo', () => {
  const md = relatorioMarkdown({ objeto: 'YJBV_POC_CL_COV31', totais, metodos, testes: { executed: 2, passed: 2, failed: 0 } });
  expect(md).toContain('# Cobertura — YJBV_POC_CL_COV31');
  expect(md).toContain('**Testes:** 2/2 passaram');
  expect(md).toContain('**Statement:** 50% (6/12)');
  expect(md).toContain('| 🔴 | `NUNCA_CHAMADO` | 23 | 0% (0/4)');   // nada coberto
  expect(md).toContain('| 🟢 | `SOMAR` | 9 | 100% (2/2)');
  expect(md).toContain('**Nunca executados (1):** `NUNCA_CHAMADO`');
});

test('cobertura: `soFalhas` deixa só o que está abaixo do limiar', () => {
  const dados = { objeto: 'X', totais, metodos };
  expect(relatorioMarkdown(dados, { limiar: 90, soFalhas: true })).not.toContain('`SOMAR`');
  expect(relatorioMarkdown(dados, { limiar: 90, soFalhas: true })).toContain('`CLASSIFICAR`');
  expect(relatorioMarkdown(dados, { limiar: 0, soFalhas: true })).toContain('Nenhum método abaixo de 0%');
});

test('cobertura: XML vazio não quebra o relatório', () => {
  expect(parseCoverageTree('<cov:result/>')).toEqual([]);
  expect(totaisDaArvore([])).toEqual({});
  expect(relatorioMarkdown({ objeto: 'X' })).toContain('Nenhum método medido');
});
