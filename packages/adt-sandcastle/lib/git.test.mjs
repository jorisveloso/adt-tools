// git.test.mjs — o fecho no git contra um repositório TEMPORÁRIO real (init, commit, sujeira),
// sem remote (push = 'sem remote'). A regra "só o que mudou na sessão" é testada pura.
import { test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fecharNoGit, mudadosNaSessao, ehRepo, sujos, repoDaFila } from './git.mjs';

// uma pasta NOVA por teste — o afterEach apaga, e um `git init` na pasta apagada falha
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adt-sandcastle-git-')); });
const g = (...a) => execFileSync('git', ['-C', tmp, ...a], { encoding: 'utf8' }).trim();
const escreve = (nome, txt, mtimeMs) => {
  const p = path.join(tmp, nome);
  fs.writeFileSync(p, txt);
  if (mtimeMs !== undefined) fs.utimesSync(p, new Date(mtimeMs), new Date(mtimeMs));
};

afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* já limpo */ } });

test('mudadosNaSessao: mtime desde o início, ou sujeira que não existia antes (apagado)', () => {
  const r = mudadosNaSessao({
    sujosAgora: ['velho.md', 'novo.md', 'apagado.md'],
    sujosAntes: ['velho.md'],
    inicioMs: 1000,
    mtimeDe: (p) => ({ 'velho.md': 500, 'novo.md': 2000 }[p] ?? null),
  });
  expect(r).toEqual(['novo.md', 'apagado.md']);
});

test('fecharNoGit: commita só o que mudou na sessão, sem remote não faz push', async () => {
  g('init', '-q');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  escreve('base.md', 'base');
  g('add', '-A'); g('commit', '-q', '-m', 'base');

  // sujeira ANTERIOR à tarefa (mtime no passado) — não é da tarefa
  escreve('antes.md', 'sujo antes', Date.now() - 60_000);
  const sujosAntes = await sujos(tmp);
  expect(sujosAntes).toEqual(['antes.md']);

  const inicioMs = Date.now() - 1000; // margem para relógio/mtime
  escreve('durante.md', 'feito na sessão');
  escreve('base.md', 'alterado na sessão');

  const r = await fecharNoGit(tmp, { inicioMs, sujosAntes, mensagem: 'chore(fila): teste' });
  expect(r.erro).toBeNull();
  expect(r.arquivos.sort()).toEqual(['base.md', 'durante.md']);
  expect(r.commit).toMatch(/^[0-9a-f]{7,}$/);
  expect(r.push).toBe('sem remote');
  expect(g('log', '--oneline', '-1')).toContain('chore(fila): teste');
  expect(await sujos(tmp)).toEqual(['antes.md']); // a sujeira anterior ficou como estava
});

test('fecharNoGit: nada mudou → sem commit; pasta sem git → erro explicado', async () => {
  g('init', '-q');
  expect(await ehRepo(tmp)).toBe(true);
  const r = await fecharNoGit(tmp, { inicioMs: Date.now(), mensagem: 'x' });
  expect(r.commit).toBeNull();
  expect(r.arquivos).toEqual([]);
  const semGit = fs.mkdtempSync(path.join(os.tmpdir(), 'adt-sandcastle-nogit-'));
  try {
    expect((await fecharNoGit(semGit, { inicioMs: 0, mensagem: 'x' })).erro).toMatch(/não é repositório/);
  } finally { fs.rmSync(semGit, { recursive: true, force: true }); }
});

test('repoDaFila: sap-accelerate tem pasta própria; as demais caem na raiz', () => {
  expect(repoDaFila('adt-client', 'RAIZ')).toBe('RAIZ');
  expect(repoDaFila('sap-accelerate', 'RAIZ')).toMatch(/sap-accelerate$/);
});
