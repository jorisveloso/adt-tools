// scripts/spike-discovery.mjs — SOMENTE LEITURA. O primeiro passo de qualquer tipo novo: o que o
// sistema-alvo oferece de verdade, e como é o XML de um objeto padrão que já funciona.
//
//   node scripts/spike-discovery.mjs <sid>                       # coleções do discovery ainda NÃO cobertas por tipos/*.mjs
//   node scripts/spike-discovery.mjs <sid> <adtType> <objeto>    # GET de um objeto padrão desse tipo: media type que respondeu + XML
//   node scripts/spike-discovery.mjs s4h TTYP/DT   STRING_TABLE
//   node scripts/spike-discovery.mjs s4h SHLP/DH   MATNR
//   node scripts/spike-discovery.mjs <sid> --tipos               # POST repository/typestructure: cruza OBJNAME_MAXLENGTH
//                                                                #   com o nomeacao.max dos módulos (fila 26)
//   node scripts/spike-discovery.mjs <sid> --tipos SFPF          # …e lista os descritores que casam com o filtro
//
// Regras do projeto que este script encarna (skill adt-objetos):
//   • "Não invente o media type — leia o /sap/bc/adt/discovery."
//   • "O schema de um objeto se descobre lendo um objeto PADRÃO que já funciona."
//   • 404 ≠ 406: o GET tenta os Accepts que o discovery declara para aquela coleção, e application/*.
// Nada aqui escreve no SAP. A senha é pedida no terminal (session.mjs); nada fica em arquivo.

import { existsSync } from 'node:fs';
import { conectar, conexaoAtual } from '../session.mjs';
import { resolverAlvo } from '../config.mjs';
import { call } from '../sap-connection.mjs';
import { MODULOS } from '../tipos/index.mjs';

const argv = process.argv.slice(2);
const querTipos = argv.includes('--tipos');
const [sid, adtType, objeto] = argv.filter((a) => !a.startsWith('--'));
if (!sid) { console.error('uso: node scripts/spike-discovery.mjs <sid>[:<mandante>[:<idioma>]] [<adtType> <objeto>] [--tipos [filtro]]'); process.exit(2); }

// Reaproveita a sessão cacheada (.sessao.json) se for do mesmo alias; senão abre uma —
// com `SAP_<SID>_USER`/`SAP_<SID>_PASSWORD` do ambiente se existirem (como o cobertura-tadir.mjs),
// senão pedindo no terminal. (⛔ não use `--env-file` do Node com senha que contenha `#`.)
let cx;
try {
  const atual = conexaoAtual();
  if (atual.cfg.alias !== String(sid).split(':')[0].toLowerCase()) throw new Error('sessão de outro sistema');
  cx = atual.conexao;
} catch {
  const cfg = resolverAlvo(sid);
  const ENV = String(sid).split(':')[0].toUpperCase();
  await conectar(cfg, { usuario: process.env[`SAP_${ENV}_USER`], senha: process.env[`SAP_${ENV}_PASSWORD`] });
  cx = conexaoAtual().conexao;
}
const s = await cx.sessao();

// ---------- --tipos: POST repository/typestructure (fila 26) ----------
// SEM corpo (medido no 758: 200 com body vazio; abap-adt-api faz igual). Devolve os 651 descritores
// SEU_ADT_OBJECT_TYPE_DESCRIPTOR: OBJECT_TYPE, rótulos, CATEGORY, URI_TEMPLATE, PARENT_OBJECT_TYPE,
// OBJNAME_MAXLENGTH, CAPABILITIES (o que o sistema oferece) e USER_AUTHORIZATIONS (o que ESTE usuário pode).
// Leitura com sal (medido 2026-08-31, e antes nos itens 12/13): TODA URI_TEMPLATE é a navegação /vit/
// do workbench, e CAPABILITIES descreve o workbench CLÁSSICO — nem necessário (BDEF/DDLS/SRVB/SRVD
// dizem "sem CREATE" e a lib cria por ADT REST) nem suficiente (VIEW/DV diz CREATE e é só SE11).
// O que vale aqui é o OBJNAME_MAXLENGTH — e mesmo ele é o limite do NOME no descritor, não o limite
// útil (AUTH: descritor/AUTHX 30, mas o TOBJ-FIEL* que consome o nome corta em 10).
if (querTipos) {
  const r = await call(s, { method: 'POST', path: '/sap/bc/adt/repository/typestructure', accept: 'application/*' });
  if (r.status !== 200) { console.error(`typestructure falhou (${r.status}): ${r.text.slice(0, 300)}`); process.exit(1); }
  const tag = (d, t) => (d.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1] ?? '';
  const acoes = (d, t) => [...(d.match(new RegExp(`<${t}>[\\s\\S]*?</${t}>`)) || [''])[0].matchAll(/<SEU_ACTION>([^<]*)<\/SEU_ACTION>/g)].map((m) => m[1]);
  const tipos = [...r.text.matchAll(/<SEU_ADT_OBJECT_TYPE_DESCRIPTOR>([\s\S]*?)<\/SEU_ADT_OBJECT_TYPE_DESCRIPTOR>/g)].map(([, d]) => ({
    tipo: tag(d, 'OBJECT_TYPE'), rotulo: tag(d, 'OBJECT_TYPE_LABEL'), categoria: tag(d, 'CATEGORY'),
    uri: tag(d, 'URI_TEMPLATE'), pai: tag(d, 'PARENT_OBJECT_TYPE'), max: Number(tag(d, 'OBJNAME_MAXLENGTH')) || 0,
    capacidades: acoes(d, 'CAPABILITIES'), autorizado: acoes(d, 'USER_AUTHORIZATIONS'),
  }));
  const porTipo = Object.fromEntries(tipos.map((t) => [t.tipo, t]));
  const criaveis = tipos.filter((t) => t.capacidades.includes('CREATE'));
  console.log(`typestructure de ${sid}: ${tipos.length} tipos; ${criaveis.length} com CAPABILITIES CREATE ` +
    `(capacidade do workbench clássico — não diz nada sobre create por ADT REST); ` +
    `${criaveis.filter((t) => !t.autorizado.includes('CREATE')).length} criáveis que ESTE usuário não pode criar.\n`);

  console.log('## nomeacao.max dos módulos × OBJNAME_MAXLENGTH do sistema\n');
  console.log('| módulo | adtType | lib | sistema | veredito |');
  console.log('|---|---|---|---|---|');
  for (const [libKey, m] of Object.entries(MODULOS).sort()) {
    const d = porTipo[m.adtType];
    if (!d) { console.log(`| \`${libKey}\` | ${m.adtType} | ${m.nomeacao?.max ?? '—'} | (sem descritor) | ? |`); continue; }
    const veredito = !m.nomeacao ? '(módulo sem nomeacao)' : m.nomeacao.max === d.max ? '=' : `≠ **${d.max}**`;
    console.log(`| \`${libKey}\` | ${m.adtType} | ${m.nomeacao?.max ?? '—'} | ${d.max} | ${veredito} |`);
  }

  const filtro = adtType?.toUpperCase();
  if (filtro) {
    console.log(`\n## descritores que casam com "${filtro}"\n`);
    for (const t of tipos.filter((t) => t.tipo.toUpperCase().includes(filtro) || t.rotulo.toUpperCase().includes(filtro))) {
      console.log(`${t.tipo}  "${t.rotulo}"  categoria=${t.categoria || '—'}  pai=${t.pai || '—'}  max=${t.max}` +
        `  capacidades=[${t.capacidades.join(',') || '—'}]  autorizado=[${t.autorizado.join(',') || '—'}]\n  uri: ${t.uri}`);
    }
  }
  process.exit(0);
}

// ---------- discovery: coleções + accepts ----------
const disc = await call(s, { path: '/sap/bc/adt/discovery', accept: 'application/atomsvc+xml' });
if (disc.status !== 200) { console.error(`discovery falhou (${disc.status}): ${disc.text.slice(0, 300)}`); process.exit(1); }

const colecoes = [];
for (const m of disc.text.matchAll(/<app:collection\b([^>]*)>([\s\S]*?)<\/app:collection>/g)) {
  const href = (m[1].match(/href="([^"]+)"/) || [])[1];
  const titulo = (m[2].match(/<atom:title>([^<]*)/) || m[2].match(/<title>([^<]*)/) || [])[1] ?? '';
  const accepts = [...m[2].matchAll(/<app:accept>([^<]*)<\/app:accept>/g)].map((a) => a[1]);
  const categorias = [...m[2].matchAll(/<atom:category\b[^>]*term="([^"]+)"/g)].map((a) => a[1]);
  const templates = [...m[2].matchAll(/<adtcomp:templateLink\b[^>]*template="([^"]+)"/g)].map((a) => a[1]);
  colecoes.push({ href, titulo, accepts, categorias, templates });
}

if (!adtType) {
  const cobertas = new Set(Object.values(MODULOS).map((m) => m.coll));
  const naoCobertas = colecoes.filter((c) => !cobertas.has(c.href) && ![...cobertas].some((k) => c.href.endsWith(k.replace(/^\/sap\/bc\/adt/, ''))));
  console.log(`discovery de ${sid}: ${colecoes.length} coleções; ${colecoes.length - naoCobertas.length} cobertas por tipos/*.mjs; ${naoCobertas.length} NÃO cobertas:\n`);
  for (const c of naoCobertas) {
    console.log(`${c.href}`);
    if (c.titulo) console.log(`    título:     ${c.titulo}`);
    if (c.categorias.length) console.log(`    categorias: ${c.categorias.join(', ')}`);
    if (c.accepts.length) console.log(`    accepts:    ${c.accepts.join(' | ')}`);
    if (c.templates.length) console.log(`    templates:  ${c.templates.join(' | ')}`);
  }
  console.log('\nPróximo passo: node scripts/spike-discovery.mjs', sid, '<adtType> <objeto padrão>  — para ver o XML de um que já funciona.');
  process.exit(0);
}

// ---------- GET de um objeto padrão: qual Accept responde, e o XML ----------
if (!objeto) { console.error('informe o nome de um objeto PADRÃO desse tipo (ex.: TTYP/DT STRING_TABLE)'); process.exit(2); }
const [codigo] = adtType.split('/');
// coleções cujo categoria/href sugere o tipo — o candidato a `coll` do módulo novo
const candidatas = colecoes.filter((c) => c.categorias.some((t) => t.toUpperCase().startsWith(codigo)) || c.href.toLowerCase().includes(codigo.toLowerCase()));
console.log(`coleções candidatas para ${adtType}:`);
for (const c of candidatas) console.log(`  ${c.href}  accepts: ${c.accepts.join(' | ') || '(nenhum declarado)'}  categorias: ${c.categorias.join(', ')}`);

const accepts = [...new Set([...candidatas.flatMap((c) => c.accepts), 'application/*'])];
for (const c of candidatas) {
  const path = `${c.href}/${String(objeto).toLowerCase()}`;
  for (const accept of accepts) {
    const r = await call(s, { path, accept });
    console.log(`GET ${path}  Accept: ${accept}  → ${r.status}`);
    if (r.status === 200) {
      const tipo = (r.text.match(/adtcore:type="([^"]*)"/) || [])[1];
      console.log(`  adtcore:type=${tipo}  (o adtType do módulo)`);
      console.log('  --- XML (é o molde do shell/body; compare com um objeto SEM o recurso para achar o que varia) ---');
      console.log(r.text.slice(0, 6000));
      const src = await call(s, { path: `${path}/source/main`, accept: 'text/plain' });
      console.log(`GET ${path}/source/main → ${src.status}  ${src.status === 200 ? '(source-based: forma `source`)' : '(sem /source/main: forma `xml` ou `custom`)'}`);
      if (src.status === 200) console.log(src.text.slice(0, 1500));
      process.exit(0);
    }
  }
}
console.log('\nNenhum GET respondeu 200. 406 em todos = Accept errado (tente outros do discovery); 404 = objeto/coleção errados.');
