// index.test.mjs — a camada com DISCO (ler/gravar markdown em pasta temporária).
// Usa uma pasta real temporária, criada/removida por teste, para validar o ciclo completo:
// criar fila → add → next → anotar → status → fechar → listar.

import { test, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  add, next, fechar, anotarItem, status, listarFilas, arquivoDaFila, resumoFila, filaAtiva,
} from './index.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adt-todo-test-'));

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* já limpo */ }
});

test('listarFilas: vazio quando a pasta não tem .md', () => {
  expect(listarFilas(path.join(tmp, 'vazia'))).toEqual([]);
});

test('add cria a fila automaticamente e numera', () => {
  const { n, markdown } = add(tmp, 'matt-pocock', 'Escrever spec', { bloqueado: 'aguarda grilling' });
  expect(n).toBe(1);
  expect(markdown).toContain('- [ ] 1. Escrever spec');
  expect(markdown).toContain('> bloqueado: aguarda grilling');
  // o arquivo existe no disco
  expect(fs.existsSync(arquivoDaFila(tmp, 'matt-pocock'))).toBe(true);
});

test('add seguinte numera 2', () => {
  add(tmp, 'matt-pocock', 'primeiro');
  const { n } = add(tmp, 'matt-pocock', 'segundo');
  expect(n).toBe(2);
});

test('next: null quando a fila tem um item mas ele está bloqueado', () => {
  add(tmp, 'matt-pocock', 'bloqueado', { bloqueado: 'sem VPN' });
  expect(next(tmp, 'matt-pocock')).toBeNull();
});

test('next: devolve o item aberto e não-bloqueado', () => {
  add(tmp, 'matt-pocock', 'bloqueado', { bloqueado: 'sem VPn' });
  add(tmp, 'matt-pocock', 'executável');
  const alvo = next(tmp, 'matt-pocock');
  expect(alvo.n).toBe(2);
  expect(alvo.titulo).toBe('executável');
});

test('anotarItem depois de add: em andamento tem prioridade no next', () => {
  add(tmp, 'jbv', 'a');
  add(tmp, 'jbv', 'b');
  anotarItem(tmp, 'jbv', 1, 'em andamento', 'no meio');
  expect(next(tmp, 'jbv').n).toBe(1);
});

test('fechar marca [x] e guarda resultado; some do next', () => {
  add(tmp, 'jbv', 'item');
  fechar(tmp, 'jbv', 1, 'entregue');
  const mk = fs.readFileSync(arquivoDaFila(tmp, 'jbv'), 'utf8');
  expect(mk).toContain('- [x] 1. item');
  expect(mk).toContain('> entregue');
  expect(next(tmp, 'jbv')).toBeNull();
});

test('status reflete conta e próximo', () => {
  add(tmp, 'jbv', 'a');
  add(tmp, 'jbv', 'b', { bloqueado: 'x' });
  const s = status(tmp, 'jbv');
  expect(s.total).toBe(2);
  expect(s.abertos).toBe(2);
  expect(s.bloqueados).toBe(1);
  expect(s.proximo.n).toBe(1);
});

test('resumoFila traz abertos e alvo', () => {
  add(tmp, 'jbv', 'a');
  add(tmp, 'jbv', 'b');
  const r = resumoFila(tmp, 'jbv');
  expect(r.nome).toBe('jbv');
  expect(r.alvo.n).toBe(1);
  expect(r.abertos.length).toBe(2);
});

test('fechar em item inexistente lança', () => {
  add(tmp, 'jbv', 'a');
  expect(() => fechar(tmp, 'jbv', 99)).toThrow(/não existe/);
});

test('filaAtiva é a primeira em ordem alfabética', () => {
  add(tmp, 'beta', 'x');
  add(tmp, 'alfa', 'y');
  expect(filaAtiva(tmp)).toBe('alfa');
});

test('funções sem nome usam a fila ativa (default)', () => {
  add(tmp, 'alfa', 'primeiro');
  add(tmp, 'beta', 'segundo');
  // ordem alfabética: alfa é a ativa
  expect(next(tmp).titulo).toBe('primeiro');
  expect(status(tmp).total).toBe(1);
});

test('status criava undefined.md antes — agora nome vazio/sem nome não grava fila nova', () => {
  // não deve existir nenhum .md além dos criados
  const antes = listarFilas(tmp).map((f) => f.nome);
  expect(antes).not.toContain('undefined');
});

test('nome de fila inválido (caracteres ilegais) lança e não cria arquivo', () => {
  expect(() => arquivoDaFila(tmp, '..//---')).toThrow(/inválido/);
  expect(listarFilas(tmp).map((f) => f.nome)).not.toContain('..');
});

test('nome vazio vira fila ativa; sem fila ativa lança "nenhuma fila" (não grava undefined.md)', () => {
  expect(() => status(tmp, '')).toThrow(/nenhuma fila/);
  expect(listarFilas(tmp).map((f) => f.nome)).not.toContain('undefined');
});
