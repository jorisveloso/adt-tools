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
import { run } from '@ai-hero/sandcastle';
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox';
import { claudeCodeHost } from './agente.mjs';
import { listarFilas, next, itemDaFila, adiar, status, FILAS_DIR } from 'adt-todo';
import { veredito, escolherFilas, lerArgs, resumoCurto, tituloBreve, umaLinha, esperaDoLimite, ultimoLimite, esperaDoEvento, agoraLocal } from './veredito.mjs';
import { repoDaFila, sujos, fecharNoGit } from './git.mjs';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url)); // raiz do monorepo adt-tools
const PROMPT = fileURLToPath(new URL('../prompts/item.md', import.meta.url));
const LOGS = fileURLToPath(new URL('../logs/', import.meta.url));

/** Os últimos `bytes` de um arquivo (o log da fila passa de 20 MB — ler inteiro é desperdício).
 *  A primeira linha sai cortada ao meio; quem lê o log descarta o que não faz JSON. */
function lerCauda(caminho, bytes = 512 * 1024) {
  let fd;
  try {
    const tam = fs.statSync(caminho).size;
    const inicio = Math.max(tam - bytes, 0);
    const buf = Buffer.alloc(Math.min(bytes, tam));
    fd = fs.openSync(caminho, 'r');
    fs.readSync(fd, buf, 0, buf.length, inicio);
    return buf.toString('utf8');
  } catch {
    return ''; // log ainda não existe, ou sumiu no meio do caminho
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

const opts = lerArgs(process.argv.slice(2));
const filas = escolherFilas(listarFilas(FILAS_DIR), opts.fila);
const hora = () => agoraLocal().hora;
const carimbo = () => agoraLocal().carimbo;
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
        // `claudeCodeHost` conserta as aspas do --model para o cmd.exe (agente.mjs).
        agent: claudeCodeHost(opts.modelo, { permissionMode: 'auto' }),
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
      erro = umaLinha(e?.message ?? String(e));
    }

    // 0. Limite de uso do Claude: o item não falhou — espera o reset e tenta O MESMO item de novo.
    //    Adiar aqui esvaziaria a fila em cascata sem fazer nada (05/09/2026: 47 adiados em 15 min).
    //    O reset vem PRIMEIRO do `rate_limit_event` do log (epoch, sem fuso); a frase em inglês
    //    do erro é a reserva, para o caso de o evento não ter sido gravado.
    //    Só se a sessão FALHOU: numa sessão que terminou bem o evento no log é de outra sessão.
    const evento = erro ? ultimoLimite(lerCauda(path.join(LOGS, `${fila}.log`))) : null;
    const espera = erro ? (esperaDoEvento(evento) ?? esperaDoLimite(erro)) : null;
    if (espera !== null) {
      tentados.delete(alvo.n);
      r.sessoes--;
      const ate = agoraLocal(new Date(Date.now() + espera)).hora.slice(0, 5);
      const fonte = esperaDoEvento(evento) !== null
        ? `evento ${evento.janela} (uso ${Math.round(evento.utilizacao * 100)}%)`
        : 'texto do erro';
      console.log(`${hora()} ⏸ limite de uso do Claude — espero até ${ate} e retomo o item ${alvo.n} · fonte: ${fonte}: ${erro}`);
      await new Promise((ok) => setTimeout(ok, espera));
      continue;
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
      const pushTxt = g.push === 'ok' ? 'push ok' : g.push === 'sem remote' ? '(sem remote)' : 'PUSH FALHOU';
      if (g.commit) git.push(`${nome} ${g.commit} ${pushTxt}`);
      else if (g.aFrente > 0) git.push(`${nome} ${pushTxt} (${g.aFrente} commit(s) do agente)`);
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
