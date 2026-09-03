#!/usr/bin/env node
// notas.mjs — validação de aplicação de notas SAP no sistema-alvo (só leitura).
//
// Não APLICA passos manuais (SAP as applied); apenas PROVA por medição que a
// nota já foi aplicada, usando os canais de leitura do adt-client
// (readTable / adobeFormInfo). Ver `PLANO-v1.md` → etapa 5.
//
// Gotchas embutidos (pagos em produção — não "simplificar"):
//   - A senha NUNCA toca o disco: vem de variável de ambiente (SAP_<ALIAS>_USER /
//     SAP_<ALIAS>_PASSWORD) ou do `.env` local; melhor ainda: sessão cacheada via `connect`.
//   - O veredito é por assert de LADO DA LEITURA (ADT/RFC) com saída do sistema —
//     nada mais conta como "aplicada".
//   - Validação SEM XDP local de referência prova só existência/estado/atividade —
//     não comparação byte a byte (ver PLANO-APLICACAO-3751960-v0.md).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirNotas = path.join(ROOT, 'notas');

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function loadEnv() {
  const file = path.join(ROOT, '.env');
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0 && !line.trimStart().startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  for (const k of Object.keys(process.env)) {
    if (!/^SAP_[A-Z0-9_]+$/.test(k) || !process.env[k]) continue;
    env[k] = process.env[k];
  }
  return env;
}

const help = `uso:  node tools/notas.mjs validar <nota> --sistema <alias>

  validar  prova por leitura que a nota já foi aplicada no sistema-alvo.
           <nota> é o número (ex.: 3751960) — busca NOTA_<nota>_*.pdf / .md em notas/.
           Conexão: sessão cacheada (.sessao.json da lib) ou, sem sessão,
           variáveis de ambiente SAP_<ALIAS>_USER / SAP_<ALIAS>_PASSWORD.
  --sistema  alias no sistemas.json (default: sxd).`;

function parseArgs(argv) {
  const cmd = argv[0];
  const rest = argv.slice(1);
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--sistema') opts.sistema = rest[++i];
    else if (!opts.nota && rest[i] !== '--sistema') opts.nota = rest[i];
  }
  return { cmd, opts };
}

async function conectarAo(alias, env) {
  const { resolverAlvo } = await import('adt-client/config');
  const { conectar, conexaoAtual } = await import('adt-client/session');
  const user = env[`SAP_${alias.toUpperCase()}_USER`];
  const pass = env[`SAP_${alias.toUpperCase()}_PASSWORD`];
  const manda = env[`SAP_${alias.toUpperCase()}_MANDANTE`];
  const lang = env[`SAP_${alias.toUpperCase()}_LANGUAGE`];
  let cfg;
  try {
    ({ cfg } = conexaoAtual());
    if (cfg.alias !== alias) die(`sessão cacheada é de ${cfg.alias.toUpperCase()}, não ${alias.toUpperCase()}. Rode connect de novo.`);
    // readTable/Adobe lectura via RFC SOAP precisa de senha no cfg (Basic Auth);
    // a sessão cacheada não guarda senha por design. Se não houver no .env, morre aqui.
    if (!pass) die(`validação usa RFC SOAP (readTable), que exige senha — falta SAP_${alias.toUpperCase()}_PASSWORD no .env/env.`);
    cfg.pass = pass;
    return cfg;
  } catch { /* sem sessão válida — cai para .env / ambiente */ }
  if (!user || !pass) die(`sem sessão válida e sem SAP_${alias.toUpperCase()}_USER/_PASSWORD no .env/env. Abra uma sessão pela lib (connect ${alias}) ou preencha o .env.`);
  cfg = resolverAlvo(alias);
  if (manda) cfg.client = manda;
  if (lang) cfg.lang = lang;
  await conectar(cfg, { usuario: user, senha: pass });
  // conectar zera cfg.pass ao sair; o RFC SOAP roda com a mesma senha que acabamos de usar.
  cfg.pass = pass;
  return cfg;
}

// O assert de uma nota: um objeto { tipo, onde, espera } por verificação.
// Para 3751960 (Adobe Form): form EDOC_BR_DACTE_OP existir e estar ATIVO.
function assertsDaNota(numero) {
  const md = path.join(dirNotas, `NOTA_${numero}.md`);
  if (!fs.existsSync(md)) die(`falta a nota estruturada: notas/NOTA_${numero}.md`);
  const txt = fs.readFileSync(md, 'utf8');
  const m = txt.match(/```asserts\s+([\s\S]+?)```/);
  if (!m) die(`NOTA_${numero}.md não tem bloco \`\`\`asserts\`\`\` com a validação.`);
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    die(`bloco asserts de NOTA_${numero}.md não é JSON válido: ${e.message}`);
  }
}

async function executarAssert(cfg, assert) {
  const { readTable } = await import('adt-client/rfc-soap');
  switch (assert.tipo) {
    case 'adobe_form': {
      const { adobeFormInfo } = await import('adt-client/forms');
      const info = await adobeFormInfo(cfg, assert.form);
      const temLinha = info.layout.length > 0;
      const ativa = info.active === true;
      const pass = (!assert.espera.exists || temLinha) && (!assert.espera.active || ativa);
      if (assert.detalhar !== false) {
        console.log(`  FPLAYOUT rows: ${info.layout.length}` +
          (info.layout.length ? ` | ${info.layout.map((l) => `${l.NAME}:${l.STATE}${l.LASTUSER ? ` (${l.LASTUSER})` : ''}`).join('; ')}` : ''));
        console.log(`  FPCONTEXT rows: ${info.context.length}` +
          (info.context.length ? ` | ${info.context.map((c) => `${c.NAME}:${c.STATE}->${c.INTERFACE ?? '-'}`).join('; ')}` : ''));
        console.log(`  FPINTERFACE: ${info.interfaceRows.length} rows (${info.interface ?? 'sem interface'})`);
      }
      return pass;
    }
    case 'readtable': {
      const linhas = await readTable(cfg, assert.tabela, { where: assert.where ?? [] });
      const pass = (!assert.espera.existe || linhas.length > 0) && (!assert.espera.linhas || linhas.length >= assert.espera.linhas);
      console.log(`  ${assert.tabela}: ${linhas.length} linha(s) → ${assert.rotulo}`);
      for (const l of linhas.slice(0, 10)) console.log('    ' + JSON.stringify(l));
      return pass;
    }
    default:
      die(`tipo de assert desconhecido: ${assert.tipo} (em NOTA_.md)`);
  }
}

async function cmdValidar({ nota, sistema }) {
  if (!nota) die('uso: node tools/notas.mjs validar <nota> --sistema <alias>');
  const alias = sistema ?? 'sxd';
  const cfg = await conectarAo(alias, loadEnv());
  console.log(`validando nota ${nota} em ${alias.toUpperCase()} (mandante ${cfg.client})…`);
  const asserts = assertsDaNota(nota);
  console.log(`  ${asserts.length} assert(s):`);
  for (const a of asserts) {
    const ok = await executarAssert(cfg, a).catch((e) => { console.error(`  ✗ assert falhou na execução: ${e.message.split('\n')[0]}`); return false; });
    console.log(`  ${ok ? '✓ PASS' : '✗ FAIL'}  ${a.rotulo}`);
    if (!ok) process.exitCode = 1;
  }
  if (process.exitCode === 1) die('pelo menos um assert NÃO passou — nota pode NÃO estar aplicada.');
  console.log('nota aplicada: TODOS os asserts passaram por medição.');
}

const { cmd, opts } = parseArgs(process.argv.slice(2));
if (['validar'].includes(cmd)) {
  await cmdValidar(opts);
} else {
  console.log(help);
  die(`comando desconhecido: ${cmd ?? '(nenhum)'}`);
}