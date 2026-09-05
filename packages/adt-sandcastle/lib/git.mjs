// git.mjs — o fecho de cada item: commit e push no repositório associado à fila, se houver git.
//
// O agente já commita o que entrega (a skill manda). O runner cobre o que SOBRA depois da sessão —
// a fila que ele mesmo mexeu (`adiar`), um arquivo que o agente esqueceu — e publica. Regras:
//   · só entra no commit o que MUDOU DURANTE a sessão (mtime >= início, ou sujeira que não existia
//     antes): sujeira que já estava no repo antes da tarefa não é da tarefa e fica como está;
//   · "conectado no git" = há remote; sem remote, commita e não faz push;
//   · push que falha (sem rede, sem upstream) NÃO derruba o loop — vira `erro` no resultado.
// Tudo por `execFile('git', …)`, sem shell.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);

/** Fila → repositório. As filas da lib e da fila vivem no monorepo; a do cliente, na pasta dele. */
export const REPOS_POR_FILA = {
  'sap-accelerate': 'C:/repositorio/jorisveloso/sap-accelerate',
};
export const repoDaFila = (fila, raiz) => REPOS_POR_FILA[fila] ?? raiz;

// `out` vem CRU: o porcelain do status começa com espaço (` M path`) e um trim comeria a coluna.
async function git(repo, args) {
  try {
    const { stdout } = await exec('git', ['-C', repo, ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, out: stdout };
  } catch (e) {
    return { ok: false, out: e.stdout || '', erro: (e.stderr || e.message || '').trim() };
  }
}

/** É um repositório git? (a pasta pode nem existir) */
export async function ehRepo(repo) {
  if (!fs.existsSync(repo)) return false;
  return (await git(repo, ['rev-parse', '--is-inside-work-tree'])).out.trim() === 'true';
}

/** Caminhos sujos (`git status --porcelain`: `XY path`), relativos à raiz do repo. */
export async function sujos(repo) {
  const r = await git(repo, ['status', '--porcelain', '--untracked-files=all']);
  if (!r.ok) return [];
  return r.out.split(/\r?\n/).filter((l) => l.length > 3).map((l) => l.slice(3).replace(/^"(.*)"$/, '$1'));
}

/**
 * PURO sobre os dados que recebe: quais dos sujos de agora são DA TAREFA — mudaram desde `inicioMs`
 * (mtime), ou não estavam sujos antes (`sujosAntes`, ex.: arquivo apagado durante a sessão).
 */
export function mudadosNaSessao({ sujosAgora, sujosAntes, inicioMs, mtimeDe }) {
  const antes = new Set(sujosAntes);
  return sujosAgora.filter((p) => {
    const m = mtimeDe(p);
    if (m !== null) return m >= inicioMs;
    return !antes.has(p);
  });
}

/**
 * Commita o que mudou durante a sessão e publica. Sem nada a commitar, ainda publica o que o
 * agente commitou e deixou local (`aFrente` > 0). Devolve
 * { repo, arquivos, commit: sha|null, aFrente, push: 'ok'|'sem remote'|'falhou'|null, erro? }.
 */
export async function fecharNoGit(repo, { inicioMs, sujosAntes = [], mensagem }) {
  const res = { repo, arquivos: [], commit: null, aFrente: 0, push: null, erro: null };
  if (!(await ehRepo(repo))) { res.erro = 'não é repositório git'; return res; }

  const mtimeDe = (p) => { try { return fs.statSync(path.join(repo, p)).mtimeMs; } catch { return null; } };
  res.arquivos = mudadosNaSessao({ sujosAgora: await sujos(repo), sujosAntes, inicioMs, mtimeDe });
  if (!res.arquivos.length) {
    // Nada sobrou para o runner — mas o agente pode ter commitado tudo (inclusive a fila) e
    // deixado os commits SÓ locais. Medido em 05/09/2026: 12 dos 27 itens ficaram sem push assim.
    res.aFrente = await commitsAFrente(repo);
    return res.aFrente > 0 ? publicar(repo, res) : res;
  }

  const add = await git(repo, ['add', '-A', '--', ...res.arquivos]);
  if (!add.ok) { res.erro = `git add: ${add.erro}`; return res; }
  const commit = await git(repo, ['commit', '-q', '-m', mensagem]);
  if (!commit.ok) { res.erro = `git commit: ${commit.erro || commit.out}`; return res; }
  res.commit = (await git(repo, ['rev-parse', '--short', 'HEAD'])).out.trim();
  return publicar(repo, res);
}

/** Quantos commits locais o upstream ainda não tem (0 se não há upstream). */
export async function commitsAFrente(repo) {
  const r = await git(repo, ['rev-list', '--count', '@{u}..HEAD']);
  return r.ok ? Number(r.out.trim()) || 0 : 0;
}

async function publicar(repo, res) {
  const remotes = (await git(repo, ['remote'])).out.trim();
  if (!remotes) { res.push = 'sem remote'; return res; }
  const push = await git(repo, ['push']);
  res.push = push.ok ? 'ok' : 'falhou';
  if (!push.ok) res.erro = `git push: ${push.erro}`;
  return res;
}
