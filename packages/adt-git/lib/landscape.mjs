// landscape.mjs — lê os sistemas do próprio SAP GUI (SAPUILandscape.xml).
//
// Evita manter host e descrição à mão: quem já cadastra sistema é o SAP Logon.
//
// ⚠️ O QUE O LANDSCAPE **NÃO** SABE: a URL do ADT. Ele só guarda o dispatcher do SAP GUI (32<nn>).
// O ADT vive no ICM (80<nn> / 443<nn>), e o host pode ser OUTRO — é comum o SAP GUI apontar para um
// IP e o ADT para um nome DNS completamente diferente. Derivar por convenção erraria o host.
// Por isso a URL derivada aqui é uma SUGESTÃO marcada como tal, e `sistemas.json` é quem manda.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function caminhoPadraoLandscape() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appdata, 'SAP', 'Common', 'SAPUILandscape.xml');
}

const attr = (tag, nome) => (tag.match(new RegExp(`\\b${nome}="([^"]*)"`)) || [])[1] || null;

function parseXml(xml) {
  const routers = {};
  for (const [, tag] of xml.matchAll(/<Router\b([^>]*)\/?>/g)) {
    const uuid = attr(tag, 'uuid');
    if (uuid) routers[uuid] = attr(tag, 'router');
  }

  const servicos = [];
  for (const [, tag] of xml.matchAll(/<Service\b([^>]*?)\/?>/g)) {
    const sid = attr(tag, 'systemid');
    if (!sid) continue; // entradas sem systemid não são sistema (workspace, atalho web…)
    const server = attr(tag, 'server') || '';
    const [host, porta] = server.split(':');
    // 3200 → instância 00 · 3240 → 40 · 3202 → 02
    const instancia = /^\d{4}$/.test(porta) ? String(porta).slice(2) : null;
    servicos.push({
      sid: sid.toUpperCase(),
      alias: sid.toLowerCase(),
      descricao: attr(tag, 'name') || '',
      host: host || null,
      portaSapgui: porta || null,
      instancia,
      saprouter: routers[attr(tag, 'routerid')] || null,
      // SUGESTÃO por convenção — não é fato. Só serve para a mensagem de erro ajudar.
      urlSugerida: host && instancia ? `http://${host}:80${instancia}` : null,
    });
  }
  return servicos;
}

/** Lê o landscape e os arquivos que ele inclui. Devolve [] se o arquivo não existir. */
export function lerLandscape(arquivo = caminhoPadraoLandscape()) {
  if (!fs.existsSync(arquivo)) return [];
  const xml = fs.readFileSync(arquivo, 'utf8');
  const servicos = parseXml(xml);

  for (const [, tag] of xml.matchAll(/<Include\b([^>]*)\/?>/g)) {
    const url = attr(tag, 'url');
    if (!url?.startsWith('file:///')) continue;
    try {
      const incluido = decodeURIComponent(url.replace('file:///', '')).replace(/\//g, path.sep);
      if (fs.existsSync(incluido)) servicos.push(...parseXml(fs.readFileSync(incluido, 'utf8')));
    } catch { /* include quebrado não derruba a leitura do principal */ }
  }

  const porAlias = {};
  for (const s of servicos) if (!porAlias[s.alias]) porAlias[s.alias] = s;
  return Object.values(porAlias);
}
