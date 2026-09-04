// scripts/canais.mjs — SOMENTE LEITURA: sonda os canais de N sistemas e mostra o mapa do landscape.
//
//   node scripts/canais.mjs                       # todos os sistemas com URL de ADT em sistemas.json
//   node scripts/canais.mjs s4h sxd:100           # só esses alvos (alias[:mandante])
//   node scripts/canais.mjs s4h --tipos           # + quais tipos do catálogo têm coleção no discovery
//   node scripts/canais.mjs --tabela              # NÃO sonda: só mostra o que já está registrado
//
// Credenciais: `SAP_<ALIAS>_USER` / `SAP_<ALIAS>_PASSWORD` no ambiente; senão pergunta no terminal.
// (⛔ não use `--env-file` do Node com senha que contenha `#` — ele trunca ali; exporte à mão.)
//
// Sessões: cada GET com Basic abre uma sessão de segurança no servidor — o probe faz logoff dela
// (despedirCookie, desde 2026-09-01: uma sonda deixou sessão 202 viva no SXD; no s4h ela morre
// sozinha — o timeout é configuração do alvo, e quem abre fecha).
// O `--tipos` custa o discovery COMPLETO (~300 KB, ~300 ms por sistema — medido no s4h em 2026-08-31);
// sem ele, cada sistema custa três GETs paralelos: discovery + eco (~150 ms) e o nó do WebGUI
// (~420 ms com logon aceito — a sonda encerra a sessão que abriu; medido no s4h em 2026-09-04).
//
// O que este script grava (`canais.json`, ao lado do sistemas.json) é REGISTRO, não cache — ver o
// cabeçalho de canais.mjs. Nenhum código da lib lê esse arquivo para escolher canal.

import { probe, tiposDisponiveis } from '../probe.mjs';
import { carregarSistemas, resolverAlvo } from '../config.mjs';
import { perguntarUsuario, perguntarSenha } from '../session.mjs';
import { gravarMedicao, lerRegistro, tabelaMarkdown } from '../canais.mjs';

const args = process.argv.slice(2);
const querTipos = args.includes('--tipos');
const soTabela = args.includes('--tabela');
const alvos = args.filter((a) => !a.startsWith('--'));

if (soTabela) {
  console.log(tabelaMarkdown(lerRegistro()));
  process.exit(0);
}

// Sem alvo explícito: todo sistema que tem URL de ADT (o landscape do SAP GUI só sabe o dispatcher).
const specs = alvos.length
  ? alvos
  : Object.values(carregarSistemas()).filter((s) => s.url).map((s) => s.alias);

if (!specs.length) {
  console.error('nenhum sistema com URL de ADT em sistemas.json — cadastre a url e o cliente lá.');
  process.exit(2);
}

for (const spec of specs) {
  let cfg;
  try {
    cfg = resolverAlvo(spec);
  } catch (e) {
    console.error(`⏭  ${spec}: ${e.message.split('\n')[0]}`);
    continue;
  }

  const ENV = cfg.alias.toUpperCase();
  cfg.user = process.env[`SAP_${ENV}_USER`] || (process.stdin.isTTY ? await perguntarUsuario(cfg.alias) : null);
  cfg.pass = process.env[`SAP_${ENV}_PASSWORD`] ?? (process.stdin.isTTY ? await perguntarSenha(`Senha de ${cfg.user} em ${ENV}: `) : null);
  if (!cfg.user || cfg.pass === null) {
    console.error(`⏭  ${spec}: sem credencial (defina SAP_${ENV}_USER / SAP_${ENV}_PASSWORD ou rode num terminal).`);
    continue;
  }

  const resultado = await probe(cfg);

  // Tipos só quando pedido: são ~300 KB de discovery, e só mudam em upgrade.
  let tipos = null;
  if (querTipos && resultado.adt.ok) {
    try {
      tipos = await tiposDisponiveis(cfg);
    } catch (e) {
      console.error(`   tipos: falhou (${e.message.split('\n')[0]})`);
    }
  }

  gravarMedicao(cfg, resultado, { tipos });
  cfg.pass = null; // some da memória, como no connect
}

console.log('');
console.log(tabelaMarkdown(lerRegistro()));
