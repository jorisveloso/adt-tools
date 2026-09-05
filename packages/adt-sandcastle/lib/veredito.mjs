// veredito.mjs — PURO: o que o runner faz com um item depois de uma sessão, lendo o ARQUIVO da fila.
//
// A sessão do agente não devolve status confiável (ela pode dizer "fechei" sem gravar). O veredito
// sai do estado do item no markdown: `[x]` = entregue; `bloqueado` = o agente tirou o item da
// rotação de propósito; qualquer outro = o item NÃO conseguiu ser executado e vai para o fim da
// fila, para não segurar os demais. Sem disco, sem rede — testado em veredito.test.mjs.

import { estadoDoItem } from 'adt-todo';

/**
 * item: o item parseado como está na fila AGORA (null se sumiu); erro: mensagem da sessão que
 * estourou (idle timeout, crash), se houve.
 * → { acao: 'fechado' | 'bloqueado' | 'adiar' | 'sumiu', motivo? }
 */
export function veredito(item, { erro } = {}) {
  if (!item) return { acao: 'sumiu', motivo: 'o item não está mais na fila' };
  const estado = estadoDoItem(item);
  if (estado === 'feito') return { acao: 'fechado' };
  if (estado === 'bloqueado') return { acao: 'bloqueado' };
  return {
    acao: 'adiar',
    motivo: erro
      ? `a sessão falhou (${erro})`
      : `a sessão terminou sem fechar nem bloquear o item (estado no arquivo: ${estado})`,
  };
}

/** Quais filas rodar: uma pelo nome, ou todas (ordem alfabética — a mesma da fila "ativa"). */
export function escolherFilas(todas, nome) {
  const nomes = todas.map((f) => f.nome);
  if (!nome) return nomes;
  if (!nomes.includes(nome)) throw new Error(`fila "${nome}" não existe — há: ${nomes.join(', ') || '(nenhuma)'}`);
  return [nome];
}

/** Os argumentos da linha de comando → opções. `--fila x --max 3 --modelo m --idle 1800 --dry`.
 * Sem `--max` (null) o runner roda até a fila acabar ou alguém mandar parar (Ctrl+C). */
export function lerArgs(argv, padrao = {}) {
  const o = { fila: null, max: null, modelo: 'claude-opus-5', idle: 1800, dry: false, ...padrao };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--fila') o.fila = v();
    else if (a === '--max') o.max = Number(v());
    else if (a === '--modelo') o.modelo = v();
    else if (a === '--idle') o.idle = Number(v());
    else if (a === '--dry') o.dry = true;
    else throw new Error(`argumento desconhecido: ${a} (use --fila <nome> --max <n> --modelo <id> --idle <s> --dry)`);
  }
  if (o.max !== null && (!Number.isInteger(o.max) || o.max < 1)) throw new Error('--max precisa ser inteiro >= 1');
  return o;
}

/** O título de um item sem o "— detalhe" e sem ponteiros, curto o bastante para uma linha. */
export function tituloBreve(titulo, max = 100) {
  const t = String(titulo ?? '').split(/\s[—–]\s|\.\s+[A-ZÁ-Ú]/)[0].replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * O resumo de até 3 linhas para o celular. Fonte, nesta ordem: o bloco <resumo>…</resumo> que o
 * prompt pede ao agente no fim da resposta; senão a última notinha do item na fila (o resultado
 * do `fechar`, o handoff, o bloqueio); senão o motivo do veredito. Linhas de no máximo `largura`.
 */
export function resumoCurto(stdout, notaFila, motivo, { linhas = 3, largura = 120 } = {}) {
  const blocos = [...String(stdout ?? '').matchAll(/<resumo>([\s\S]*?)<\/resumo>/gi)];
  const bruto = blocos.length ? blocos[blocos.length - 1][1] : (notaFila || motivo || '');
  const corta = (l) => (l.length > largura ? `${l.slice(0, largura - 1).trimEnd()}…` : l);
  const saida = bruto.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).map(corta);
  return saida.slice(0, linhas);
}
