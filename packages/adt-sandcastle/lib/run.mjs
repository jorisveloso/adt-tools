#!/usr/bin/env node
// run.mjs — roda as filas do adt-todo com o sandcastle: um item por sessão LIMPA do Claude Code.
//
// Cada item é UMA chamada `run({ maxIterations: 1 })` do sandcastle = um `claude --print` novo,
// sem `--resume` — o equivalente programado de "/next → /clear → /next". O loop é daqui, não do
// `maxIterations` do sandcastle, porque entre uma sessão e outra o runner precisa olhar a FILA:
//   · item `[x]`            → entregue, próximo;
//   · item `> bloqueado:`   → o agente tirou da rotação de propósito, próximo;
//   · qualquer outra coisa  → `adiar` (vai para o fim da fila, `em andamento` vira `adiado`),
//                             para um item que não consegue ser executado não segurar os outros.
// Depois do veredito, o runner COMMITA o que mudou durante a sessão e faz PUSH (se há remote) no
// repositório da fila e no monorepo (onde a fila vive) — git.mjs. Cada item é tentado no máximo
// UMA vez por execução; `--max` é o teto de sessões por fila.
//
// Saída pensada para acompanhar pelo celular: uma linha ao iniciar cada tarefa e, ao final, o
// status + um resumo de até 3 linhas (o bloco <resumo> que o prompt pede ao agente).
//
// uso:  node lib/run.mjs [--fila <nome>] [--max <n>] [--modelo claude-opus-5] [--idle 1800] [--dry]
//       sem --fila roda TODAS as filas de packages/adt-todo/docs/filas, em ordem alfabética;
//       sem --max roda até a fila acabar ou até o Ctrl+C (termina a tarefa corrente e para).
// log:  packages/adt-sandcastle/logs/<fila>.log (verbose: cada linha crua do agente)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, claudeCode } from '@ai-hero/sandcastle';
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox';
import { listarFilas, next, itemDaFila, adiar, status, FILAS_DIR } from 'adt-todo';
import { veredito, escolherFilas, lerArgs, resumoCurto, tituloBreve } from './veredito.mjs';
import { repoDaFila, sujos, fecharNoGit } from './git.mjs';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url)); // raiz do monorepo adt-tools
const PROMPT = fileURLToPath(new URL('../prompts/item.md', import.meta.url));
const LOGS = fileURLToPath(new URL('../logs/', import.meta.url));

const opts = lerArgs(process.argv.slice(2));
const filas = escolherFilas(listarFilas(FILAS_DIR), opts.fila);
const hora = () => new Date().toISOString().slice(11, 19);
const carimbo = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const resumo = { filas: {} };
const STATUS = { fechado: 'sucesso', bloqueado: 'bloqueio (aguarda o Joris)', adiar: 'adiamento', sumiu: 'item sumiu da fila' };

// Ctrl+C: termina a tarefa corrente (o console já mandou o sinal ao claude; se ele morreu, o
// veredito adia o item com o erro) e NÃO começa outra. Segundo Ctrl+C sai na hora.
let parar = false;
process.on('SIGINT', () => {
  if (parar) process.exit(130);
  parar = true;
  console.log(`\n${hora()} ⏹ parada pedida — termino a tarefa corrente e não começo outra (Ctrl+C de novo sai já)`);
});

for (const fila of filas) {
  if (parar) break;
  const tentados = new Set();
  const r = (resumo.filas[fila] = { sessoes: 0, fechados: [], bloqueados: [], adiados: [] });
  const s = status(FILAS_DIR, fila);
  const executaveis = Math.max(s.abertos - s.bloqueados, 0);
  const total = opts.max === null ? executaveis : Math.min(opts.max, executaveis);
  console.log(`\n=== fila ${fila}: ${s.abertos} aberto(s), ${s.bloqueados} bloqueado(s) — até ${total} nesta execução${opts.max === null ? ' (sem teto: até acabar ou Ctrl+C)' : ''} ===`);

  while (!parar && (opts.max === null || r.sessoes < opts.max)) {
    const alvo = next(FILAS_DIR, fila);
    if (!alvo) { console.log(`${hora()} sem candidato (fila vazia ou todos bloqueados)`); break; }
    if (tentados.has(alvo.n)) { console.log(`${hora()} item ${alvo.n} já foi tentado nesta execução — fila esgotada`); break; }
    tentados.add(alvo.n);
    r.sessoes++;
    console.log(`\n${hora()} ▶ Executando tarefa ${r.sessoes} de ${total} — [${fila} #${alvo.n}] ${tituloBreve(alvo.titulo)}`);
    if (opts.dry) break; // no dry o next() devolveria o mesmo item — um por fila basta

    // snapshot do git ANTES: sujeira anterior à tarefa não é da tarefa
    const repos = [...new Set([repoDaFila(fila, RAIZ), RAIZ])];
    const inicioMs = Date.now();
    const sujosAntes = Object.fromEntries(await Promise.all(repos.map(async (p) => [p, await sujos(p)])));

    let erro = null;
    let sessao = null;
    let stdout = '';
    try {
      fs.mkdirSync(LOGS, { recursive: true });
      const res = await run({
        name: `${fila}#${alvo.n}`,
        // `auto`: o classificador aprova/nega cada ferramenta. Sem permissionMode o sandcastle
        // passa --dangerously-skip-permissions. Decisão do Joris em 05/09/2026.
        agent: claudeCode(opts.modelo, { permissionMode: 'auto' }),
        // No host, sem contêiner: SAP GUI (ROT), o .env do sap-accelerate e a rede do cliente só
        // existem aqui; o provider trata Windows (cmd.exe + spawn com shell).
        sandbox: noSandbox(),
        cwd: RAIZ,
        // Sem worktree: a fila e as POCs ficam onde estão, commits vão direto no HEAD.
        branchStrategy: { type: 'head' },
        promptFile: PROMPT,
        promptArgs: { FILA: fila, ITEM_N: String(alvo.n), ITEM: alvo.titulo },
        maxIterations: 1,
        // Medição longa fica muda por minutos (fase A do item 34: ~3 min amostrando).
        idleTimeoutSeconds: opts.idle,
        logging: { type: 'file', path: path.join(LOGS, `${fila}.log`), verbose: true },
      });
      sessao = res.iterations[0]?.sessionId ?? null;
      stdout = res.stdout ?? '';
    } catch (e) {
      erro = e?.message ?? String(e);
    }

    // 1. O veredito sai do ARQUIVO, não do que o agente disse.
    const depois = itemDaFila(FILAS_DIR, fila, alvo.n);
    const v = veredito(depois, { erro });
    const ref = sessao ? ` (sessão ${sessao})` : '';
    if (v.acao === 'fechado') r.fechados.push(alvo.n);
    else if (v.acao === 'bloqueado') r.bloqueados.push(alvo.n);
    else if (v.acao === 'adiar') {
      adiar(FILAS_DIR, fila, alvo.n, `${carimbo()} — ${v.motivo}${ref}`);
      r.adiados.push(alvo.n);
    }

    // 2. Commit + push do que mudou na sessão, no repo da fila e no monorepo (a fila vive aqui).
    const git = [];
    for (const repo of repos) {
      const g = await fecharNoGit(repo, {
        inicioMs, sujosAntes: sujosAntes[repo],
        mensagem: `chore(fila): ${fila} #${alvo.n} ${v.acao} — ${tituloBreve(alvo.titulo, 60)}\n\nadt-sandcastle${ref}`,
      });
      const nome = path.basename(repo.replace(/[\\/]+$/, ''));
      if (g.commit) git.push(`${nome} ${g.commit}${g.push === 'ok' ? ' push ok' : g.push === 'sem remote' ? ' (sem remote)' : ' PUSH FALHOU'}`);
      else if (g.erro) git.push(`${nome}: ${g.erro}`);
    }

    // 3. As duas linhas do celular.
    const notaFila = depois?.notas?.length ? depois.notas[depois.notas.length - 1].texto : '';
    console.log(`${hora()} ■ Tarefa concluída com ${STATUS[v.acao] ?? v.acao}${git.length ? ` · git: ${git.join('; ')}` : ' · git: nada a commitar'}${ref}`);
    for (const linha of resumoCurto(stdout, notaFila, v.motivo)) console.log(`   ${linha}`);
  }
}

console.log('\n=== resumo ===');
for (const [fila, r] of Object.entries(resumo.filas)) {
  console.log(`${fila}: ${r.sessoes} sessão(ões) · fechados [${r.fechados}] · bloqueados [${r.bloqueados}] · adiados [${r.adiados}]`);
}
