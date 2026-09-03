// scripts/cobertura-tadir.mjs — SOMENTE LEITURA. Quantos objetos de cada tipo o sistema-alvo TEM,
// cruzado com o que tipos/*.mjs já cobre. É o que troca "qual tipo vem a seguir" de palpite por número.
//
//   node scripts/cobertura-tadir.mjs <sid>[:<mandante>]            # recorte custom (Z/Y fora do $TMP, sem gerados)
//   node scripts/cobertura-tadir.mjs <sid> --tudo                  # + a TADIR inteira (top 60) — o que a SAP entrega
//   node scripts/cobertura-tadir.mjs <sid> --json <arquivo>        # grava as contagens brutas
//   node scripts/cobertura-tadir.mjs <sid> --pacote P1[,P2…]       # recorte por PACOTE: composição de uma solução
//   node scripts/cobertura-tadir.mjs <sid> --pacote P1 --sub       # … incluindo subpacotes (TDEVC, até 5 níveis)
//
// Credenciais: `SAP_<SID>_USER` / `SAP_<SID>_PASSWORD` no ambiente, se existirem; senão pede no terminal.
// (⛔ não use `--env-file` do Node com senha que contenha `#` — ele trunca ali; exporte à mão.)
//
// Medido no S4H 758 em 2026-08-29 (docs/cobertura-tadir.md):
//   • `dataPreview` AGREGA: COUNT(*) + GROUP BY + ORDER BY + JOIN passam pelo freestyle — não precisa de
//     driver classrun, e nada é criado no sistema. `readTable` (RFC_READ_TABLE) não agrega.
//   • A descrição legível do tipo mora em EUOBJALL (ID = código TADIR, STEXT por SPRAS — 264 tipos, PT
//     incluído) e em WBOBJECTTYPES_T; o que sobra vem do RIS (`repository/informationsystem/objecttypes`).
//     KO100 é ESTRUTURA (o que TR_OBJECT_TABLE devolve — e ele não é RFC); TROBJT não existe.
//   • O recorte Z/Y esconde o lock object (nome começa por E: EZ…/EY…) — por isso ele entra à parte.
//   • TADIR mede quantos objetos EXISTEM, não uso em runtime; e o que nasce Z/Y de gerador (SEGW, SU22,
//     proxies) conta como custom. Vale mais no sistema do CLIENTE que no laboratório.

import { writeFileSync } from 'node:fs';
import { conectar, conexaoAtual, encerrarSessao as apagarCacheDeSessao } from '../session.mjs';
import { resolverAlvo } from '../config.mjs';
import { call, encerrarSessao } from '../sap-connection.mjs';
import { dataPreview } from '../adt-client.mjs';
import { MODULOS } from '../tipos/index.mjs';

const args = process.argv.slice(2);
const sid = args.find((a) => !a.startsWith('--'));
if (!sid) { console.error('uso: node scripts/cobertura-tadir.mjs <sid>[:<mandante>] [--tudo] [--json <arquivo>]'); process.exit(2); }
const querTudo = args.includes('--tudo');
const arqJson = args[args.indexOf('--json') + 1];
const pacotes = args.includes('--pacote') ? String(args[args.indexOf('--pacote') + 1] || '').split(',').filter(Boolean).map((p) => p.toUpperCase()) : null;
const querSub = args.includes('--sub');

// ---------- conexão: sessão cacheada do mesmo alias, ou env, ou terminal ----------
const alias = String(sid).split(':')[0].toLowerCase();
let cx;
let abriuSessao = false; // quando o script fez o `conectar`, o script encerra (deixou 1 órfã no SXD em 2026-09-01)
try {
  const atual = conexaoAtual();
  if (atual.cfg.alias !== alias) throw new Error('sessão de outro sistema');
  cx = atual.conexao;
} catch {
  const cfg = resolverAlvo(sid);
  const ENV = alias.toUpperCase();
  await conectar(cfg, { usuario: process.env[`SAP_${ENV}_USER`], senha: process.env[`SAP_${ENV}_PASSWORD`] });
  cx = conexaoAtual().conexao;
  abriuSessao = true;
}

// A sessão que ESTE script abriu, este script fecha — a do CLI (connect) fica de fora. O cache é
// apagado junto: cookie morto no `.sessao.json` viraria um 401 mudo no próximo comando.
async function despedir() {
  if (!abriuSessao) return;
  await encerrarSessao(await cx.sessao()).catch(() => {});
  apagarCacheDeSessao();
}

// ---------- contagens (dataPreview agrega — medido) ----------
// O freestyle corta a linha em ~72 colunas (medido: "DESCENDIN" is not allowed here) — quebrar a
// instrução antes de cada cláusula resolve.
const q = async (sql, rows = 1000) => (await dataPreview(cx, String(sql).replace(/ (WHERE|AND|OR|GROUP BY|ORDER BY) /g, '\n  $1 '), { rows })).rows;
const n = (r) => Number(String(r.N).trim());
// custom = nome Z/Y (ou EZ/EY para lock object), fora do $TMP, não gerado
const CUSTOM = "( obj_name LIKE 'Z%' OR obj_name LIKE 'Y%' OR ( object = 'ENQU' AND ( obj_name LIKE 'EZ%' OR obj_name LIKE 'EY%' ) ) ) AND devclass <> '$TMP' AND genflag = ''";

const sistema = pacotes ? null : (await q('SELECT COUNT(*) AS n FROM tadir', 1))[0];
const custom = pacotes ? [] : await q(`SELECT pgmid, object, COUNT(*) AS n FROM tadir WHERE ${CUSTOM} GROUP BY pgmid, object ORDER BY n DESCENDING`);
const tmp = pacotes ? [] : await q("SELECT object, COUNT(*) AS n FROM tadir WHERE ( obj_name LIKE 'Z%' OR obj_name LIKE 'Y%' ) AND devclass = '$TMP' GROUP BY object ORDER BY n DESCENDING", 15);
const gerados = pacotes ? [] : await q("SELECT object, COUNT(*) AS n FROM tadir WHERE ( obj_name LIKE 'Z%' OR obj_name LIKE 'Y%' ) AND genflag <> '' GROUP BY object ORDER BY n DESCENDING", 15);
const devclass = pacotes ? [] : await q(`SELECT devclass, COUNT(*) AS n FROM tadir WHERE ${CUSTOM} GROUP BY devclass ORDER BY n DESCENDING`, 15);
const author = pacotes ? [] : await q(`SELECT author, COUNT(*) AS n FROM tadir WHERE ${CUSTOM} GROUP BY author ORDER BY n DESCENDING`, 15);
const tudo = querTudo && !pacotes ? await q('SELECT pgmid, object, COUNT(*) AS n FROM tadir GROUP BY pgmid, object ORDER BY n DESCENDING', 3000) : [];

// ---------- descrição do tipo: EUOBJALL → WBOBJECTTYPES_T → RIS ----------
const lang = (cx.cfg.lang || 'PT')[0].toUpperCase();
const eu = await q(`SELECT id, spras, stext FROM euobjall WHERE spras IN ('${lang}','E')`, 2000);
const wb = await q(`SELECT objecttype, language, uiname_singular FROM wbobjecttypes_t WHERE language IN ('${lang}','E')`, 2000);
const ris = {};
{
  const s = await cx.sessao();
  const r = await call(s, { path: '/sap/bc/adt/repository/informationsystem/objecttypes?maxItemCount=999&name=*&data=usedByProvider', accept: 'application/*' });
  if (r.status === 200) {
    for (const it of r.text.split('<nameditem:namedItem>').slice(1)) {
      const g = (tag) => { const a = it.indexOf(`<nameditem:${tag}>`); const b = it.indexOf(`</nameditem:${tag}>`); return a < 0 ? '' : it.slice(a + tag.length + 12, b); };
      const type = (g('data').match(/type:([^;]+)/) || [])[1] || '';
      if (!type || type === 'WGRP') continue;
      (ris[type.split('/')[0]] ??= []).push({ type, desc: g('description').split('\n')[0].trim() });
    }
  }
}
const catalogo = {};
for (const [libKey, m] of Object.entries(MODULOS)) (catalogo[m.codigo] ??= []).push({ libKey, adtType: m.adtType });
const texto = (code) => {
  const e = (l) => eu.find((r) => r.ID === code && r.SPRAS === l)?.STEXT?.trim();
  const w = (l) => wb.find((r) => r.OBJECTTYPE === code && r.LANGUAGE === l)?.UINAME_SINGULAR?.trim();
  const adt = catalogo[code]?.map((c) => c.adtType) ?? [];
  const r = ris[code]?.find((x) => adt.includes(x.type)) ?? ris[code]?.[0];
  return e(lang) || w(lang) || r?.desc || e('E') || w('E') || '';
};

// ---------- saída: markdown ----------
const linha = (r) => `| ${r.PGMID ? r.PGMID + ' ' : ''}${r.OBJECT} | ${texto(r.OBJECT)} | ${n(r)} | ${catalogo[r.OBJECT] ? catalogo[r.OBJECT].map((c) => '`' + c.libKey + '`').join(', ') : '—'} |`;
const tabela = (rows) => '| tipo | descrição | quantos | catálogo |\n|---|---|---|---|\n' + rows.map(linha).join('\n');
const soma = (rows) => rows.reduce((a, r) => a + n(r), 0);
const cobertos = custom.filter((r) => catalogo[r.OBJECT]);

// ---------- recorte por pacote: composição de uma solução (item 25) ----------
if (pacotes) {
  for (const raiz of pacotes) {
    // subpacotes por TDEVC (BFS, até 5 níveis) — só com --sub
    let familia = [raiz];
    if (querSub) {
      let borda = [raiz];
      for (let nivel = 0; nivel < 5 && borda.length; nivel++) {
        const filhos = [];
        for (const p of borda) {
          const f = await q(`SELECT devclass FROM tdevc WHERE parentcl = '${p}' ORDER BY devclass`, 500);
          filhos.push(...f.map((r) => r.DEVCLASS.trim()));
        }
        familia.push(...filhos);
        borda = filhos;
      }
    }
    // composição: GROUP BY object, somando os pacotes da família (consulta por pacote — IN longo estoura a linha)
    const contagem = {};
    let total = 0;
    for (const p of familia) {
      const comp = await q(`SELECT object, COUNT(*) AS n FROM tadir WHERE devclass = '${p}' GROUP BY object ORDER BY n DESCENDING`, 200);
      for (const r of comp) { contagem[r.OBJECT] = (contagem[r.OBJECT] ?? 0) + n(r); total += n(r); }
    }
    const rows = Object.entries(contagem).map(([OBJECT, N]) => ({ OBJECT, N })).sort((a, b) => n(b) - n(a));
    const cob = rows.filter((r) => catalogo[r.OBJECT]);
    console.log(`\n## Composição de ${raiz}${querSub ? ` (+${familia.length - 1} subpacotes)` : ''} — ${alias.toUpperCase()} mandante ${cx.cfg.client}, ${new Date().toISOString().slice(0, 10)}\n`);
    console.log(`**${total} objetos em ${rows.length} tipos**; o catálogo cobre ${cob.length} tipos = ${soma(cob)} objetos (${total ? Math.round((100 * soma(cob)) / total) : 0}%).\n`);
    console.log(tabela(rows));
  }
  await despedir();
  process.exit(0);
}

console.log(`# Cobertura pela TADIR — ${alias.toUpperCase()} mandante ${cx.cfg.client}, ${new Date().toISOString().slice(0, 10)}\n`);
console.log(`TADIR inteira: ${n(sistema)} objetos. Recorte custom (Z/Y + EZ/EY de ENQU, fora do \`$TMP\`, \`GENFLAG\` vazio): **${soma(custom)} objetos em ${custom.length} tipos**; o catálogo (${Object.keys(MODULOS).length} módulos, ${Object.keys(catalogo).length} códigos) cobre ${cobertos.length} tipos = **${soma(cobertos)} objetos (${Math.round((100 * soma(cobertos)) / soma(custom))}%)**.\n`);
console.log('## Custom — por tipo\n');
console.log(tabela(custom));
console.log('\n## Custom — onde e de quem\n');
console.log('pacotes: ' + devclass.map((r) => `${r.DEVCLASS.trim() || '(vazio)'} ${n(r)}`).join(' · '));
console.log('\nautores: ' + author.map((r) => `${r.AUTHOR.trim()} ${n(r)}`).join(' · '));
console.log('\n`$TMP` (Z/Y): ' + tmp.map((r) => `${r.OBJECT} ${n(r)}`).join(' · '));
console.log('\ngerados (`GENFLAG`, Z/Y): ' + (gerados.map((r) => `${r.OBJECT} ${n(r)}`).join(' · ') || 'nenhum'));
if (querTudo) {
  console.log(`\n## TADIR inteira — top 60 de ${tudo.length} tipos\n`);
  console.log(tabela(tudo.slice(0, 60)));
}
if (arqJson) {
  writeFileSync(arqJson, JSON.stringify({ sid: alias, mandante: cx.cfg.client, data: new Date().toISOString(), total: n(sistema), custom, tmp, gerados, devclass, author, tudo }, null, 1));
  console.log(`\n(contagens brutas em ${arqJson})`);
}
await despedir();
