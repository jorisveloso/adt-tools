// config.mjs — de onde vêm os sistemas e para onde vão os arquivos.
//
// A LISTA de sistemas vem do próprio SAP GUI (SAPUILandscape.xml) — não se mantém host à mão.
// Sobre ela, dois arquivos:
//   • sistemas.json  — LOCAL (gitignored). SÓ O QUE O LANDSCAPE NÃO SABE: a url do ADT e o cliente.
//                      Também serve para cadastrar sistema que não está no SAP GUI. Não versiona:
//                      host e mandante de cliente não entram em repositório. Modelo: sistemas.exemplo.json.
//   • destinos.json  — LOCAL (gitignored). Onde cada cliente grava, e as travas do `clone`.
//
// Senha NÃO mora em nenhum dos dois: é perguntada na hora (ver session.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerLandscape, caminhoPadraoLandscape } from './landscape.mjs';
import { passo, detalhe } from './log.mjs';

// Estado local (sistemas.json, destinos.json, .sessao.json) fica NA PASTA DESTA LIB — assim tudo que é
// específico do ambiente mora em um lugar só (`.lib/adt/`), gitignored, e o cwd não importa.
export const RAIZ = path.dirname(fileURLToPath(import.meta.url));

function lerJson(arquivo, opcional = false) {
  if (!fs.existsSync(arquivo)) {
    detalhe(`${path.basename(arquivo)}: não existe (${arquivo})`);
    if (opcional) return null;
    throw new Error(`arquivo não encontrado: ${arquivo}`);
  }
  detalhe(`${path.basename(arquivo)}: lido de ${arquivo}`);
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    throw new Error(`${path.basename(arquivo)} não é JSON válido: ${e.message}`);
  }
}

const lerOverrides = () => lerJson(path.join(RAIZ, 'sistemas.json'), true) || {};

/**
 * Sistemas = landscape do SAP GUI  +  overrides do sistemas.json.
 * O landscape entra com sid, descrição, host e instância. O override entra com o que ele não sabe:
 * `url` do ADT, `cliente`, `mandante`, `idioma`. Alias que só existe no override também vale — dá
 * para usar um sistema que não está cadastrado no SAP Logon.
 */
export function carregarSistemas() {
  passo('config: carregando sistemas (landscape + sistemas.json)');
  const overrides = lerOverrides();
  const mapa = {};

  for (const s of lerLandscape()) {
    mapa[s.alias] = {
      alias: s.alias,
      descricao: s.descricao,
      url: null,
      urlSugerida: s.urlSugerida,
      host: s.host,
      instancia: s.instancia,
      saprouter: s.saprouter,
      mandante: null,
      idioma: 'PT',
      cliente: null,
      origem: 'SAPUILandscape.xml',
    };
  }

  for (const [aliasBruto, o] of Object.entries(overrides)) {
    if (aliasBruto.startsWith('_')) continue; // chaves de comentário
    const alias = aliasBruto.toLowerCase();
    const base = mapa[alias] || { alias, idioma: 'PT', origem: 'sistemas.json' };
    mapa[alias] = {
      ...base,
      ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)),
      alias,
      origem: mapa[alias] ? 'SAPUILandscape.xml + sistemas.json' : 'sistemas.json',
    };
  }

  detalhe(`${Object.keys(mapa).length} sistema(s): ${Object.keys(mapa).join(', ') || '(nenhum)'}`);
  return mapa;
}

export function carregarDestinos() {
  const d = lerJson(path.join(RAIZ, 'destinos.json'), true);
  if (d) return d;
  throw new Error(
    'destinos.json não existe.\n' +
    `Copie ${path.join(RAIZ, 'destinos.exemplo.json')} para ${path.join(RAIZ, 'destinos.json')} ` +
    'e ajuste a pasta raiz de cada cliente.',
  );
}

/**
 * Resolve `d01:100:pt` (mandante e idioma opcionais — caem no default do sistema).
 * Devolve o `cfg` no MESMO formato que o adt-client espera, com `pass` ainda vazio.
 */
export function resolverAlvo(spec) {
  const [alias, mandante, idioma] = String(spec).split(':');
  const sistemas = carregarSistemas();
  const s = sistemas[String(alias).toLowerCase()];

  if (!s) {
    throw new Error(
      `sistema "${alias}" não encontrado.\n` +
      `Conhecidos: ${Object.keys(sistemas).join(', ') || '(nenhum)'}\n` +
      `Lidos de: ${caminhoPadraoLandscape()} + sistemas.json`,
    );
  }
  if (!s.url) {
    throw new Error(
      `"${alias}" (${s.descricao || ''}) está no SAP GUI, mas sem URL de ADT.\n\n` +
      'O SAPUILandscape.xml só guarda o dispatcher do SAP GUI ' +
      `(${s.host || '?'}:${s.instancia ? `32${s.instancia}` : '?'}). O ADT vive no ICM, e o host pode ser OUTRO ` +
      '— é comum o SAP GUI apontar para um IP e o ADT para um nome DNS diferente.\n\n' +
      (s.urlSugerida ? `Palpite por convenção (CONFIRME antes de confiar): ${s.urlSugerida}\n` : '') +
      `Teste:  curl -i <url>/sap/bc/adt/core/discovery\n` +
      `Depois fixe em sistemas.json:  { "${alias}": { "url": "...", "cliente": "..." } }`,
    );
  }
  if (!s.cliente) {
    throw new Error(
      `"${alias}" não tem "cliente" definido — é ele que diz em qual pasta os objetos caem.\n` +
      `Adicione em sistemas.json:  { "${alias}": { "cliente": "<nome>" } }`,
    );
  }

  const cfg = {
    alias: String(alias).toLowerCase(),
    cliente: s.cliente,
    descricao: s.descricao || '',
    base: String(s.url).replace(/\/+$/, ''),
    client: mandante || s.mandante,
    lang: (idioma || s.idioma || 'PT').toUpperCase(),
    user: null,
    pass: null,
    // ICM que só atende HTTPS com certificado de CA INTERNA: o pino `sha256/…` que o Chrome aceita
    // (leia-o uma vez com `spkiDoHost(base)`), ou `true` para não validar nada na sessão do
    // navegador. Ausente = validação normal — não se ignora certificado por default.
    certificado: s.certificado ?? null,
  };
  detalhe(`alvo: ${cfg.alias} → ${cfg.base} mandante ${cfg.client} idioma ${cfg.lang} cliente "${cfg.cliente}" (origem: ${s.origem})`);
  return cfg;
}

/** Pasta raiz onde os objetos daquele cliente são gravados, mais as travas do `clone`. */
export function destinoDoCliente(cliente) {
  passo(`config: destino do cliente "${cliente}"`);
  const destinos = carregarDestinos();
  const d = destinos[cliente];
  if (!d?.raiz) {
    throw new Error(
      `cliente "${cliente}" não tem destino em destinos.json.\n` +
      `Configurados: ${Object.keys(destinos).join(', ') || '(nenhum)'}`,
    );
  }
  detalhe(`raiz: ${d.raiz}`);
  return {
    raiz: d.raiz,
    prefixos: d.prefixos || [],
    profundidadeMaxima: d.profundidadeMaxima ?? 1,
  };
}
