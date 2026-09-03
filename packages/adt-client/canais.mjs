// canais.mjs — o REGISTRO do que o `probe` mediu, por sistema, com data. E o mapa do landscape.
//
// ⚠️ ISTO NÃO É CACHE. Nada aqui é lido para DECIDIR canal: quem decide é o `probe`, sondando na
// hora. A distinção não é preciosismo — é medição:
//
//   • release, sysid e as coleções do discovery são fatos DO SISTEMA: mudam em upgrade/SP, e
//     envelhecem bem (meses).
//   • `adt.ok` / `soapRfc.ok` / `classrun.ok` são fatos DO MOMENTO — dependem de VPN, do nó SICF,
//     da credencial e da autorização. Envelhecem em minutos, e do pior jeito: em 2026-08-30 13:36
//     o ADT stateful do s4h passou a responder 400 a tudo enquanto o stateless seguia 200
//     (fila 21), e o SXD fica inalcançável sem VPN (fila 15). Um `adt: true` cacheado mandaria o
//     consumidor num canal morto — trocando o `motivo` claro do probe por um erro obscuro; um
//     `adt: false` cacheado esconderia o sistema que voltou.
//   • `mandante` e `usuario` são da CREDENCIAL, não do sistema.
//
// Sondar custa ~150 ms (dois GETs paralelos, medido no s4h em 2026-08-31). Não vale trocar isso
// por um mapa que mente. O que o registro serve:
//
//   • ver o landscape inteiro de uma vez — release, canais e tipos de cada sistema;
//   • EXPLICAR uma falha ("em 30/08 o ADT deste sistema respondia; hoje não") — histórico, não decisão.
//
// O arquivo (`canais.json`) fica ao lado do `sistemas.json`, na pasta da lib, e é gitignored pelo
// mesmo motivo que ele: host e mandante de cliente não entram em repositório.

import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './config.mjs';
import { detalhe } from './log.mjs';

export const ARQ_CANAIS = path.join(RAIZ, 'canais.json');

const LEIA = [
  'Registro das medições do probe (adt-client/canais). NÃO é cache: nada aqui decide canal.',
  'Serve para ver o landscape de uma vez e para explicar falha ("quando este canal respondia?").',
  'Regravado por: node scripts/canais.mjs [alias…] [--tipos]',
];

/** PURO: a chave de uma medição é o par sistema+mandante — o mesmo host em dois mandantes é outro alvo. */
export function chaveDe(cfg) {
  return `${String(cfg.alias || '?').toLowerCase()}:${cfg.client || '(default)'}`;
}

/**
 * PURO: a entrada do registro a partir do `cfg` e do resultado do `probe`.
 * `tipos` (opcional) é o retorno de `tiposDisponiveis` — só entra quando foi medido de fato.
 * Os motivos só são gravados para os canais que FALHARAM: é o que explica, e o resto é ruído.
 */
export function entradaDaMedicao(cfg, resultado, { tipos = null, agora = new Date() } = {}) {
  const motivos = {};
  for (const canal of ['adt', 'soapRfc', 'classrun']) {
    if (!resultado[canal]?.ok && resultado[canal]?.motivo) motivos[canal] = resultado[canal].motivo;
  }
  const e = {
    alias: String(cfg.alias || '?').toLowerCase(),
    mandante: cfg.client || null,
    base: cfg.base || null,
    cliente: cfg.cliente || null,
    descricao: cfg.descricao || '',
    medidoEm: agora.toISOString(),
    medidoPor: resultado.usuario || cfg.user || null,
    sysid: resultado.sysid || null,
    release: resultado.release || null,
    canais: {
      adt: resultado.adt?.ok === true,
      soapRfc: resultado.soapRfc?.ok === true,
      classrun: resultado.classrun?.ok === true,
    },
  };
  if (Object.keys(motivos).length) e.motivos = motivos;
  if (tipos) {
    const faltando = Object.entries(tipos).filter(([, v]) => !v.ok).map(([k]) => k).sort();
    e.tipos = { medidos: Object.keys(tipos).length, comColecao: Object.keys(tipos).length - faltando.length, faltando };
  }
  return e;
}

/** PURO: acrescenta/substitui UMA medição sem perder as dos outros sistemas. */
export function mesclarRegistro(registro, entrada) {
  const base = registro && typeof registro === 'object' ? registro : {};
  return {
    _leia: LEIA,
    medicoes: { ...(base.medicoes || {}), [chaveDe({ alias: entrada.alias, client: entrada.mandante })]: entrada },
  };
}

/** PURO: quantos dias tem a medição. `null` quando a data não dá para ler. */
export function idadeEmDias(iso, agora = new Date()) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return Math.floor((agora.getTime() - t) / 86_400_000);
}

const idadeLegivel = (d) => (d === null ? '?' : d === 0 ? 'hoje' : d === 1 ? 'ontem' : `${d} d`);

/**
 * PURO: o mapa do landscape em markdown — uma linha por alvo medido, ordenada por alias.
 * A coluna "medido" é o que impede de ler a tabela como verdade de agora.
 */
export function tabelaMarkdown(registro, { agora = new Date() } = {}) {
  const entradas = Object.entries(registro?.medicoes || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entradas.length) return '_nenhuma medição registrada._';

  const temTipos = entradas.some(([, e]) => e.tipos);
  const cab = ['alvo', 'sysid', 'release', 'ADT', 'SOAP RFC', 'classrun', ...(temTipos ? ['tipos'] : []), 'medido'];
  const linhas = [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`];

  for (const [chave, e] of entradas) {
    const s = (ok) => (ok ? '✅' : '❌');
    const tipos = e.tipos ? `${e.tipos.comColecao}/${e.tipos.medidos}` : '—';
    linhas.push(`| ${chave}${e.cliente ? ` (${e.cliente})` : ''} | ${e.sysid || '?'} | ${e.release || '?'} | ` +
      `${s(e.canais?.adt)} | ${s(e.canais?.soapRfc)} | ${s(e.canais?.classrun)} | ` +
      `${temTipos ? `${tipos} | ` : ''}${idadeLegivel(idadeEmDias(e.medidoEm, agora))} |`);
  }

  const comMotivo = entradas.filter(([, e]) => e.motivos);
  if (comMotivo.length) {
    linhas.push('', 'Por que um canal não respondeu **na hora da medição** (não vale como estado de agora):');
    for (const [chave, e] of comMotivo) {
      for (const [canal, motivo] of Object.entries(e.motivos)) linhas.push(`- \`${chave}\` · ${canal}: ${motivo}`);
    }
  }
  const faltas = entradas.filter(([, e]) => e.tipos?.faltando?.length);
  if (faltas.length) {
    linhas.push('', 'Tipos do catálogo SEM coleção no discovery:');
    for (const [chave, e] of faltas) linhas.push(`- \`${chave}\`: ${e.tipos.faltando.join(', ')}`);
  }
  return linhas.join('\n');
}

// ---------- disco ----------

/** Lê o registro. Arquivo ausente ou ilegível → registro vazio (nunca derruba quem chamou). */
export function lerRegistro(arquivo = ARQ_CANAIS) {
  try {
    const r = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return { _leia: LEIA, medicoes: r.medicoes || {} };
  } catch {
    detalhe(`canais: sem registro anterior em ${arquivo}`);
    return { _leia: LEIA, medicoes: {} };
  }
}

/**
 * Grava UMA medição no registro. Chamada explícita: o `probe` não escreve em disco por conta
 * própria — quem quiser registrar, registra (é o que `scripts/canais.mjs` faz).
 */
export function gravarMedicao(cfg, resultado, { tipos = null, arquivo = ARQ_CANAIS, agora = new Date() } = {}) {
  const entrada = entradaDaMedicao(cfg, resultado, { tipos, agora });
  const registro = mesclarRegistro(lerRegistro(arquivo), entrada);
  fs.writeFileSync(arquivo, JSON.stringify(registro, null, 2));
  detalhe(`canais: ${chaveDe(cfg)} registrado em ${arquivo}`);
  return entrada;
}
