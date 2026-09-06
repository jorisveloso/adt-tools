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

/**
 * Data e hora no fuso da MÁQUINA — quem lê o log e a fila é o Joris, em America/Sao_Paulo.
 * O `toISOString()` que estava aqui saía em UTC: as linhas ▶/■ e a data do `adiado:` na fila
 * ficavam 3 h à frente do relógio dele, no mesmo arquivo em que a pausa já vinha em hora local.
 * → { data: 'AAAA-MM-DD', hora: 'HH:MM:SS', carimbo: 'AAAA-MM-DD HH:MM' }
 */
export function agoraLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return { data, hora, carimbo: `${data} ${hora.slice(0, 5)}` };
}

/** Uma mensagem de erro em UMA linha — a nota da fila é uma linha; o que vem depois da quebra
 * virava linha solta no markdown e o motivo ficava truncado (medido em 05/09/2026). */
export function umaLinha(s) {
  return String(s ?? '').replace(/\s*\r?\n\s*/g, ' · ').replace(/\s+/g, ' ').trim();
}

/**
 * O ÚLTIMO `rate_limit_event` do log verboso da fila — a fonte AUTORITATIVA do reset: carimbo em
 * epoch (segundos), sem fuso nem inglês pelo meio. Cada sessão grava um; o texto do erro
 * ("resets 10:50am") é a mesma informação já traduzida e ambígua (dia? fuso?).
 * → { rejeitado, janela, utilizacao, resetsAtMs } | null (nenhum evento no texto).
 */
export function ultimoLimite(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).filter((l) => l.includes('"rate_limit_event"'));
  for (let i = linhas.length - 1; i >= 0; i--) {
    let ev;
    try { ev = JSON.parse(linhas[i]); } catch { continue; }
    const info = ev?.rate_limit_info;
    if (!info) continue;
    const janela = info.rateLimitType ?? 'five_hour';
    const w = info.unifiedWindows?.[janela] ?? info;
    const seg = Number(w.resetsAt ?? info.resetsAt);
    if (!Number.isFinite(seg)) continue;
    return {
      rejeitado: info.status === 'rejected' || info.overageStatus === 'rejected',
      janela,
      utilizacao: Number(w.utilization ?? info.utilization ?? 0),
      resetsAtMs: seg * 1000,
    };
  }
  return null;
}

/**
 * Quanto esperar segundo o EVENTO (+1 min de folga), ou null se ele não diz para esperar.
 * Só o evento `rejected` manda parar: `allowed_warning` com utilização alta ainda passa.
 * Reset JÁ PASSADO devolve null — o evento é VELHO (ficou no log de uma sessão anterior) e
 * honrá-lo faria o runner esperar sem motivo, ou repetir um item que falha por outra causa.
 */
export function esperaDoEvento(evento, { agora = Date.now() } = {}) {
  if (!evento?.rejeitado) return null;
  if (evento.resetsAtMs <= agora) return null;
  return evento.resetsAtMs - agora + 60_000;
}

/**
 * A sessão morreu no LIMITE de uso do Claude ("You've hit your session limit · resets 7:50pm")?
 * Então o item NÃO falhou — nem pode ser adiado: adiar em cascata esvazia a fila em minutos sem
 * fazer nada (05/09/2026: 47 itens adiados em 15 min). Devolve quantos ms esperar até o reset
 * (+1 min de folga), ou null se o erro não é de limite. Sem hora legível, espera `padraoMs`.
 */
export function esperaDoLimite(erro, { agora = Date.now(), padraoMs = 10 * 60_000 } = {}) {
  const txt = String(erro ?? '');
  if (!/(session|usage|rate)[ -]?limit|hit your .*limit|rate_limit/i.test(txt)) return null;
  const m = txt.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return padraoMs;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = (m[3] ?? '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  const alvo = new Date(agora);
  alvo.setHours(h, min, 0, 0);
  if (alvo.getTime() <= agora) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime() - agora + 60_000;
}

/**
 * Quais filas rodar, na ordem alfabética (a mesma da fila "ativa"). Sem `nome`, todas. Com `nome`:
 * um nome, uma LISTA separada por vírgula, ou um PREFIXO terminado em `*` — `adt*` pega as três
 * filas da lib e deixa a do cliente de fora, para outro runner tocá-la em paralelo.
 * Pedido que não casa com nada é erro: silenciar viraria "rodei tudo" sem rodar nada.
 */
export function escolherFilas(todas, nome) {
  const nomes = todas.map((f) => f.nome);
  if (!nome) return nomes;
  const escolhidas = [];
  for (const pedido of String(nome).split(',').map((s) => s.trim()).filter(Boolean)) {
    if (pedido.endsWith('*')) {
      const prefixo = pedido.slice(0, -1);
      const casam = nomes.filter((n) => n.startsWith(prefixo));
      if (!casam.length) throw new Error(`nenhuma fila começa com "${prefixo}" — há: ${nomes.join(', ') || '(nenhuma)'}`);
      escolhidas.push(...casam);
    } else {
      if (!nomes.includes(pedido)) throw new Error(`fila "${pedido}" não existe — há: ${nomes.join(', ') || '(nenhuma)'}`);
      escolhidas.push(pedido);
    }
  }
  return [...new Set(escolhidas)];
}

/** Os argumentos da linha de comando → opções. `--fila x --max 3 --modelo m --idle 1800 --dry`.
 * Sem `--max` (null) o runner roda até a fila acabar ou alguém mandar parar (Ctrl+C). */
export function lerArgs(argv, padrao = {}) {
  const o = { fila: null, max: null, modelo: 'claude-opus-5', idle: 1800, dry: false, ...padrao };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--') continue; // `pnpm start -- --dry` repassa o `--` literal
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
