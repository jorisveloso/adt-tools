// fila.test.mjs — o parser e a lógica pura da fila markdown. Sem disco, sem rede.
//
// Cobre: parse, próximo (regras de bloqueado/em andamento), numeração, add, marcar feito, anotar,
// status. As funções com DISCO (index.mjs) não são testadas aqui de propósito — o parser puro é o
// que concentra a regra.

import { test, expect } from 'vitest';
import {
  parseFila, proximo, proximoNumero, addItem, marcarFeito, anotar, statusDaFila, adiarItem, estadoDoItem,
} from './fila.mjs';

const FILA_EXEMPLO = `# Fila de exemplo

- [ ] 1. Primeiro — um detalhe
> em andamento: meio do caminho
- [ ] 2. Segundo
> bloqueado: depende do SXD
- [x] 3. Terceiro — fechado
> resultado: entregue
- [ ] 4. Quarto
`;

test('parseFila lê itens e notinhas na ordem', () => {
  const { itens } = parseFila(FILA_EXEMPLO);
  expect(itens.map((i) => i.n)).toEqual([1, 2, 3, 4]);
  expect(itens[0].feito).toBe(false);
  expect(itens[2].feito).toBe(true);
  expect(itens[0].notas[0].texto).toBe('em andamento: meio do caminho');
});

test('proximo: item com em andamento tem prioridade', () => {
  const { itens } = parseFila(FILA_EXEMPLO);
  // item 2 está bloqueado; item 1 tem em andamento → é o alvo, mesmo não sendo o 1º aberto não-bloqueado
  expect(proximo({ itens }).n).toBe(1);
});

test('proximo: sem bloqueados, é o primeiro aberto', () => {
  const mk = `- [x] 1. feito\n- [ ] 2. aberto\n- [ ] 3. aberto\n`;
  expect(proximo(parseFila(mk)).n).toBe(2);
});

test('proximo: todos bloqueados → null', () => {
  const mk = `- [ ] 1. a\n> bloqueado: x\n- [ ] 2. b\n> bloqueado: y\n`;
  expect(proximo(parseFila(mk))).toBeNull();
});

test('proximo: ignora feitos mesmo que tenham nota', () => {
  const mk = `- [x] 1. feito\n> em andamento: não importa\n- [ ] 2. aberto\n`;
  expect(proximo(parseFila(mk)).n).toBe(2);
});

test('proximoNumero: max + 1, ignora lacunas', () => {
  expect(proximoNumero(parseFila(`- [ ] 5. a\n- [ ] 9. b\n`))).toBe(10);
  expect(proximoNumero(parseFila(''))).toBe(1);
});

test('addItem: numera e preserva o cabeçalho', () => {
  const base = `# Fila\ncomentário\n\n- [ ] 2. bis\n`;
  const { n, markdown } = addItem(base, 'novo item');
  expect(n).toBe(3);
  expect(markdown).toContain('- [ ] 3. novo item');
  expect(markdown).toContain('# Fila');
});

test('addItem com bloqueado anexa a notinha', () => {
  const { markdown } = addItem('', 'x', { bloqueado: 'sem VPN' });
  expect(markdown).toContain('- [ ] 1. x');
  expect(markdown).toContain('> bloqueado: sem VPN');
});

test('marcarFeito troca a caixa e anexa resultado', () => {
  const novo = marcarFeito('- [ ] 1. algo\n', 1, 'entregue no 758');
  expect(novo).toContain('- [x] 1. algo');
  expect(novo).toContain('> entregue no 758');
});

test('marcarFeito em item que não existe lança', () => {
  expect(() => marcarFeito('- [ ] 1. a\n', 9, '')).toThrow(/não existe/);
});

test('anotar: adiciona bloqueado', () => {
  expect(anotar('- [ ] 1. a\n', 1, 'bloqueado', 'sem tenant')).toContain('> bloqueado: sem tenant');
});

test('anotar: substitui notinha do mesmo rótulo, não duplica', () => {
  const passou = anotar('- [ ] 1. a\n> bloqueado: velho\n', 1, 'bloqueado', 'novo');
  expect(passou).not.toContain('velho');
  expect(passou).toContain('> bloqueado: novo');
  const depois = anotar(passou, 1, 'em andamento', 'retomando');
  expect(depois).toContain('> bloqueado: novo');
  expect(depois).toContain('> em andamento: retomando');
});

test('statusDaFila conta feito/bloqueado e aponta o próximo', () => {
  const s = statusDaFila(parseFila(FILA_EXEMPLO));
  expect(s.total).toBe(4);
  expect(s.concluidos).toBe(1);
  expect(s.abertos).toBe(3);
  expect(s.bloqueados).toBe(1);
  expect(s.proximo.n).toBe(1);
});

// ---------- reabertura por data (bloqueado até <momento>) ----------
// `agora` é passado em ms; o parse do bloqueio é LOCAL (mesmo fuso do `agora`).

// 2026-09-03 09:00 no fuso local da máquina.
const AGORA = new Date(2026, 8, 3, 9, 0).getTime();

test('proximo: bloqueado até o futuro ainda bloqueia', () => {
  const mk = `- [ ] 1. a\n> bloqueado até 2026-09-03 12:00: sem VPN\n- [ ] 2. b\n`;
  // antes das 12:00 → item 1 segue bloqueado; o alvo é o 2
  expect(proximo(parseFila(mk), { agora: AGORA }).n).toBe(2);
});

test('proximo: bloqueado até o passado reabre sozinho', () => {
  const mk = `- [ ] 1. a\n> bloqueado até 2026-09-03 08:00: sem VPN\n- [ ] 2. b\n`;
  // 08:00 já passou (é 09:00) → item 1 reabriu e, por ser o 1º aberto, é o alvo
  expect(proximo(parseFila(mk), { agora: AGORA }).n).toBe(1);
});

test('proximo: reaberto por data e com em andamento retoma ele', () => {
  // bloqueio vencido + em andamento → o em andamento reaberto tem prioridade
  const mk = `- [ ] 2. b\n- [ ] 1. a\n> em andamento: retomando\n> bloqueado até 2026-09-03 08:00: janela\n`;
  expect(proximo(parseFila(mk), { agora: AGORA }).n).toBe(1);
});

test('proximo: sem agora usa tempo real (bloqueio passado reabre)', () => {
  // sem `agora` o próximo injeta Date.now(); com a data real já em 2026-09, um bloqueio
  // do passado (`2026-01-01`) reabre sozinho.
  const mk = `- [ ] 1. a\n> bloqueado até 2026-01-01: velho\n`;
  expect(proximo(parseFila(mk)).n).toBe(1);
});

test('proximo: bloqueio futuro sem agora segue bloqueado', () => {
  const mk = `- [ ] 1. a\n> bloqueado até 2999-12-31: muito à frente\n`;
  expect(proximo(parseFila(mk))).toBeNull();
});

test('statusDaFila: bloqueado vencido não conta como bloqueado', () => {
  const mk = `- [ ] 1. a\n> bloqueado até 2026-09-03 08:00: janela\n`;
  const s = statusDaFila(parseFila(mk), { agora: AGORA });
  expect(s.bloqueados).toBe(0);
  expect(s.proximo.n).toBe(1);
});

test('anotar: bloqueado "até …" produz o formato com reabertura', () => {
  const novo = anotar('- [ ] 1. a\n', 1, 'bloqueado', 'até 2026-09-03 09:00: sem VPN');
  expect(novo).toContain('> bloqueado até 2026-09-03 09:00: sem VPN');
  expect(novo).not.toContain('> bloqueado: até');
});

test('anotar: bloqueado substitui as duas formas (não duplica)', () => {
  const passou = anotar('- [ ] 1. a\n> bloqueado até 2026-09-03 09:00: velho\n', 1, 'bloqueado', 'até 2026-09-03 10:00: novo');
  expect(passou).toContain('> bloqueado até 2026-09-03 10:00: novo');
  expect(passou).not.toContain('velho');
  const manual = anotar(passou, 1, 'bloqueado', 'sem data');
  expect(manual).toContain('> bloqueado: sem data');
  expect(manual).not.toContain('até 2026-09-03');
});

test('addItem: bloqueado com "até …" grava o formato de reabertura', () => {
  const { markdown } = addItem('', 'x', { bloqueado: 'até 2026-09-03 20:00: janela SP' });
  expect(markdown).toContain('> bloqueado até 2026-09-03 20:00: janela SP');
});

// ---------- adiar (o runner do adt-sandcastle) ----------

test('adiarItem move o item para o fim, mantém o número e anota o motivo', () => {
  const mk = `# Fila\n\n- [ ] 1. A\n- [ ] 2. B\n- [ ] 3. C\n`;
  const novo = adiarItem(mk, 1, 'sessão estourou');
  const { itens } = parseFila(novo);
  expect(itens.map((i) => i.n)).toEqual([2, 3, 1]);
  expect(itens[2].notas.map((x) => x.texto)).toEqual(['adiado: sessão estourou']);
  expect(proximo({ itens }).n).toBe(2);
});

test('adiarItem rebaixa "em andamento" para "adiado" — o item perde a prioridade de retomada', () => {
  const mk = `- [ ] 1. A\n> em andamento: parou no passo 2\n- [ ] 2. B\n`;
  expect(proximo(parseFila(mk)).n).toBe(1);
  const { itens } = parseFila(adiarItem(mk, 1, 'sem fechar'));
  expect(itens.map((i) => i.n)).toEqual([2, 1]);
  expect(itens[1].notas.map((x) => x.texto)).toEqual(['adiado: parou no passo 2', 'adiado: sem fechar']);
  expect(proximo({ itens }).n).toBe(2);
});

test('adiarItem preserva bloqueio e recusa item feito ou inexistente', () => {
  const mk = `- [ ] 1. A\n> bloqueado: sem VPN\n- [x] 2. B\n- [ ] 3. C\n`;
  const { itens } = parseFila(adiarItem(mk, 1));
  expect(itens.map((i) => i.n)).toEqual([2, 3, 1]);
  expect(itens[2].notas.map((x) => x.texto)).toEqual(['bloqueado: sem VPN']);
  expect(() => adiarItem(mk, 2, 'x')).toThrow(/já está fechado/);
  expect(() => adiarItem(mk, 9, 'x')).toThrow(/não existe/);
});

test('estadoDoItem expõe o estado derivado', () => {
  const { itens } = parseFila(`- [x] 1. a\n- [ ] 2. b\n> bloqueado: x\n- [ ] 3. c\n> em andamento: y\n- [ ] 4. d\n`);
  expect(itens.map((i) => estadoDoItem(i))).toEqual(['feito', 'bloqueado', 'emAndamento', 'aberto']);
});
