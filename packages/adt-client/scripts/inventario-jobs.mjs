// scripts/inventario-jobs.mjs — SOMENTE LEITURA. "O que está agendado neste sistema, por quem, com
// que parâmetros e quando rodou pela última vez" — para Application Job (SAJC/SAJT), numa passada só
// de leitura, do jeito que cobertura-tadir.mjs faz para a TADIR.
//
//   node scripts/inventario-jobs.mjs <sid>[:<mandante>]
//
// Credenciais: `SAP_<SID>_USER` / `SAP_<SID>_PASSWORD` no ambiente, se existirem; senão pede no terminal.
// (⛔ não use `--env-file` do Node com senha que contenha `#` — ele trunca ali; exporte à mão.)
//
// Medido no S4H 758 em 2026-09-02 (item 70, I73), docs/receita-application-job.md:
//   • as QUATRO tabelas (APJ_W_JT_ROOT repositório · APJ_X_JT_ROOT dado de mandante ·
//     APJ_D_JOB_EXE execução · APJ_W_JCE_ROOT catálogo) leem por `dataPreview` (SELECT simples,
//     sem classrun); só o CATÁLOGO (APJ_W_JCE_ROOT) tem linha larga demais para o
//     `RFC_READ_TABLE`/`readTable` (`DATA_BUFFER_EXCEEDED`) — por isso este script usa `dataPreview`
//     para as quatro, e não mistura canal;
//   • `dataPreview` **não aceita alias de tabela nem JOIN** neste sistema — toda variação testada
//     (`AS e`, `e` sem `AS`, `.` completo, `INNER`/`LEFT OUTER JOIN`) devolve o MESMO erro genérico
//     ("Só é permitida uma instrução SELECT"), inclusive sem JOIN nenhum (só `FROM tab AS x`) — o
//     erro não descreve a causa real. O cruzamento com a TBTCO sai por SELECT único + filtro `IN`
//     client-side (uma chamada por job, não um `JOIN`);
//   • `APJ_D_JOB_EXE` guarda a EXECUÇÃO mesmo depois do catálogo/template ser apagado (medido: 12
//     execuções da POC do item 47, `YJBV_POC_JOBC`/`YJBV_JOB68_*`, aparecem aqui embora os objetos
//     tenham sido apagados) — é o log durável; a `TBTCO` NÃO (2 de 5 amostrados no s4h não tinham
//     mais linha lá) — cruzar só com TBTCO subestima "quando rodou pela última vez".

import { conectar, conexaoAtual, encerrarSessao as apagarCacheDeSessao } from '../session.mjs';
import { resolverAlvo } from '../config.mjs';
import { encerrarSessao } from '../sap-connection.mjs';
import { dataPreview } from '../adt-client.mjs';

const args = process.argv.slice(2);
const sid = args[0];
if (!sid) { console.error('uso: node scripts/inventario-jobs.mjs <sid>[:<mandante>]'); process.exit(2); }

// ---------- conexão: sessão cacheada do mesmo alias, ou env, ou terminal (mesmo padrão do cobertura-tadir.mjs) ----------
const alias = String(sid).split(':')[0].toLowerCase();
let cx;
let abriuSessao = false;
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

async function despedir() {
  if (!abriuSessao) return;
  await encerrarSessao(await cx.sessao()).catch(() => {});
  apagarCacheDeSessao();
}

// ---------- leitura ----------
// Sem alias, sem JOIN (medido acima) — e a mesma quebra de linha do cobertura-tadir.mjs antes de
// WHERE/AND/OR/GROUP BY/ORDER BY, pelo mesmo limite de ~72 colunas do freestyle.
const q = async (sql, rows = 999) => (await dataPreview(cx, String(sql).replace(/ (WHERE|AND|OR|GROUP BY|ORDER BY) /g, '\n  $1 '), { rows })).rows;
const contarPor = (rows, ...campos) => {
  const m = new Map();
  for (const r of rows) {
    const chave = campos.map((c) => (r[c] || '').trim() || '(vazio)').join(' / ');
    m.set(chave, (m.get(chave) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

try {
  const jt = await q('SELECT crea_user_acct FROM apj_w_jt_root');
  const xjt = await q('SELECT user_name, job_catalog_entry_name FROM apj_x_jt_root');
  const exe = await q('SELECT job_name, job_count, job_catalog_entry, created_by, created_at FROM apj_d_job_exe');
  const jce = await q('SELECT job_type_c FROM apj_w_jce_root');

  console.log(`# Inventário de Application Job — ${alias.toUpperCase()} mandante ${cx.cfg.client}, ${new Date().toISOString().slice(0, 10)}\n`);

  console.log(`## Catálogo (APJ_W_JCE_ROOT) — ${jce.length} entrada(s)\n`);
  console.log('por tipo: ' + contarPor(jce, 'JOB_TYPE_C').map(([k, n]) => `${k} ${n}`).join(' · '));

  console.log(`\n## Templates de repositório (APJ_W_JT_ROOT, sem mandante) — ${jt.length}\n`);
  console.log('por criador: ' + contarPor(jt, 'CREA_USER_ACCT').map(([k, n]) => `${k} ${n}`).join(' · '));

  console.log(`\n## Templates de mandante — criados pelo USUÁRIO via Fiori (APJ_X_JT_ROOT) — ${xjt.length}\n`);
  console.log(xjt.length
    ? contarPor(xjt, 'USER_NAME', 'JOB_CATALOG_ENTRY_NAME').map(([k, n]) => `- ${k}: ${n}`).join('\n')
    : '(nenhum)');

  console.log(`\n## Execuções (APJ_D_JOB_EXE) — ${exe.length}\n`);
  console.log('por catálogo: ' + contarPor(exe, 'JOB_CATALOG_ENTRY').map(([k, n]) => `${k} ${n}`).join(' · '));
  console.log('por criador: ' + contarPor(exe, 'CREATED_BY').map(([k, n]) => `${k} ${n}`).join(' · '));

  console.log('\n### Última situação na TBTCO (uma consulta por execução — JOIN não passa no freestyle, ver cabeçalho)\n');
  console.log('| catálogo | criado por | execução (job/count) | status TBTCO | início |');
  console.log('|---|---|---|---|---|');
  for (const e of exe) {
    const jobname = e.JOB_NAME.trim();
    const jobcount = e.JOB_COUNT.trim();
    // Medido 2026-09-02: dataPreview devolve 500 "Application Server Error" (HTML, sem exceção ADT)
    // depois de ~14 chamadas seguidas na mesma sessão — motivo não identificado (não é dado da linha:
    // reproduzido no MESMO índice em duas sessões novas). Retry único depois de uma pausa contorna.
    let tbtco;
    try {
      tbtco = await q(`SELECT status, sdlstrtdt, sdlstrttm FROM tbtco WHERE jobname = '${jobname}' AND jobcount = '${jobcount}'`, 1);
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
      tbtco = await q(`SELECT status, sdlstrtdt, sdlstrttm FROM tbtco WHERE jobname = '${jobname}' AND jobcount = '${jobcount}'`, 1).catch(() => null);
    }
    const linha = tbtco?.[0];
    const status = tbtco === null ? '(erro na consulta — ver acima)'
      : linha ? `${linha.STATUS} (${linha.SDLSTRTDT.trim()} ${linha.SDLSTRTTM.trim()})` : '**não achado** (apagado/arquivado da TBTCO)';
    console.log(`| ${e.JOB_CATALOG_ENTRY.trim()} | ${e.CREATED_BY.trim()} | ${jobname}/${jobcount} | ${status} | ${e.CREATED_AT.trim()} |`);
  }
} finally {
  await despedir();
}
