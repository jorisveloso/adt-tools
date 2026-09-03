// bal.mjs — o assert por LOG DE APLICAÇÃO (BAL / SLG1): o que o código DISSE que fez.
//
// O dump (`dumps.mjs`) prova que o act não morreu. O readTable prova que o dado mudou. Falta o
// terceiro: processos SAP de verdade — carga, interface, job, BAdI — não devolvem erro ao chamador;
// eles **escrevem no log de aplicação** e seguem em frente com HTTP 200 e `subrc = 0`. Este módulo
// lê esse log e o transforma em assert.
//
// ---------------------------------------------------------------------------------------------
// POR QUE UM MÓDULO, E NÃO UM readTable (medido 2026-08-31, S4H 758, mandante 250)
//
//   • **Nenhum FM `BAL_*` é RFC.** Os 100+ do grupo (BAL_DB_SEARCH, BAL_DB_LOAD, BAL_LOG_MSG_READ,
//     BAL_DB_SAVE…) têm `TFDIR-FMODE` VAZIO — o canal SOAP RFC não alcança nenhum. Sobra classrun.
//   • **O cabeçalho é SQL; a mensagem NÃO é.** A `BALHDR` é transparente e o `dataPreview` a lê
//     inteira. As mensagens deveriam estar na `BALM` — e a BALM tem **0 linhas** neste sistema:
//     elas moram comprimidas na **`BALDAT`** (`CLUSTD`, LRAW 512 — um cluster INDX), 683.289 linhas
//     que o `dataPreview` recusa (400) e o `RFC_READ_TABLE` não decodifica. Só o BAL lê o BAL.
//
// Daí a divisão deste módulo, que é a economia dele: **cabeçalho e contadores por SQL (barato,
// stateless, sem driver); texto de mensagem por driver classrun (uma classe, uma execução)**.
// A BALHDR já traz `MSG_CNT_E/W/I/S/A` — "gravou 2 erros?" se responde sem ABAP nenhum.
//
// ---------------------------------------------------------------------------------------------
// TRÊS FORMAS DE "LOGOU" SEM LOG — os verdes falsos, todos medidos
//
//   1. **log sem objeto**: `BAL_LOG_CREATE` com `object` vazio devolve subrc **0** (aceita!), o
//      `MSG_ADD` devolve **0**, e só o `BAL_DB_SAVE` recusa — `save_not_allowed`, subrc 2. O log
//      existiu em memória, ninguém viu erro, e nada persistiu.
//   2. **handle vazio**: `BAL_LOG_MSG_ADD` com `i_log_handle` inicial devolve subrc **0** e escreve
//      a mensagem em OUTRO log (o que estiver em memória). Medido: duas mensagens de dois casos
//      distintos foram parar no log de um terceiro.
//   3. **sem `BAL_DB_SAVE`**: o log fica só em memória. ⚠ E o contrário também morde: um
//      `BAL_DB_SAVE` com `i_save_all = abap_true` feito por OUTRO ponto do programa salva TODOS os
//      logs em memória, inclusive os que ninguém mandou salvar (medido: 2 lognumbers de uma
//      chamada só).
//
// Objeto ou subobjeto INEXISTENTE, ao contrário, é recusado na porta: `BAL_LOG_CREATE` devolve
// subrc 1 (`log_header_inconsistent`). Criar objeto de log é `tipos/applicationLogObject.mjs`.
//
// `COMMIT WORK` não é o que decide: no classrun, um log salvo SEM commit explícito no driver
// apareceu em outra LUW mesmo assim (o commit implícito do fim do request ICF). Não confie nisso
// para asserts de LUW — para isso o ciclo é o da `receita-ciclo-escrita-verificacao.md`.
//
// ---------------------------------------------------------------------------------------------
// A JANELA É O LOGNUMBER, NÃO O RELÓGIO
//
// `BALHDR-LOGNUMBER` é NUMC 20 atribuído no SAVE por number range, crescente (medido). Por isso a
// marca d'água é `MAX(lognumber)` lido imediatamente antes do act — nenhum fuso entra na conta, e o
// s4h tem fuso torto (ver `dumps.mjs` e o item 22 da fila).
//
// ⚠ LIMITE MEDIDO: log **acrescentado** (BAL_DB_LOAD + MSG_ADD + SAVE sobre um log que já existe)
// mantém o lognumber — a marca d'água NÃO o vê como novo. Para esse caso, filtre por `extnumber` e
// compare o `total` do cabeçalho antes e depois (`logsDesde(cx, '0')` com o filtro).

import { dataPreview } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { passo, detalhe } from './log.mjs';

export const MARCA_ZERO = '0'.repeat(20);
const TIPOS = ['A', 'E', 'W', 'I', 'S'];
/** Mensagem de texto livre: `00`/`398` é o `&1&2&3&4` do SAP — o que a POC usa para logar frase. */
export const MSG_TEXTO_LIVRE = { msgid: '00', msgno: '398' };

// ---------- puros (testáveis sem SAP) ----------

const lim = (s, n) => String(s ?? '').replace(/'/g, "''").slice(0, n);

/** Uma linha da BALHDR vira o cabeçalho do log, com os contadores por tipo já separados. */
export function linhaParaLog(r) {
  const data = String(r.ALDATE ?? '').trim(); const hora = String(r.ALTIME ?? '').trim();
  const num = (v) => Number(String(v ?? '0').trim()) || 0;
  return {
    lognumber: String(r.LOGNUMBER ?? '').trim(),
    objeto: String(r.OBJECT ?? '').trim(),
    subobjeto: String(r.SUBOBJECT ?? '').trim(),
    extnumber: String(r.EXTNUMBER ?? '').trim(),
    quando: `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)} ${hora.slice(0, 2)}:${hora.slice(2, 4)}:${hora.slice(4, 6)}`,
    data,
    hora,
    usuario: String(r.ALUSER ?? '').trim(),
    programa: String(r.ALPROG ?? '').trim(),
    transacao: String(r.ALTCODE ?? '').trim(),
    probclass: String(r.PROBCLASS ?? '').trim(),
    total: num(r.MSG_CNT_AL),
    tipos: Object.fromEntries(TIPOS.map((t) => [t, num(r[`MSG_CNT_${t}`])])),
    mensagens: null, // preenchido por `lerMensagens` — o texto exige driver
  };
}

/** O ABAP do driver de LEITURA: um `BAL_DB_LOAD` por execução (ver `erros` — o segundo volta vazio). */
export function fonteDriverLeitura(nome, lognumbers) {
  const n = String(nome).toLowerCase();
  const lista = [...new Set(lognumbers.map((l) => String(l).trim().padStart(20, '0')))];
  if (!lista.length) throw new Error('bal: fonteDriverLeitura sem lognumber.');
  for (const l of lista) if (!/^\d{20}$/.test(l)) throw new Error(`bal: lognumber inválido "${l}" (NUMC 20).`);
  return `CLASS ${n} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${n} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    CONSTANTS c_sep TYPE c LENGTH 1 VALUE cl_abap_char_utilities=>horizontal_tab.
    DATA lt_logn  TYPE bal_t_logn.
    DATA lt_logh  TYPE bal_t_logh.
    DATA lt_msgh  TYPE bal_t_msgh.
    DATA ls_msg   TYPE bal_s_msg.
    DATA lv_txt   TYPE c LENGTH 255.
    DATA lv_lognr TYPE balognr.

    lt_logn = VALUE #( ${lista.map((l) => `( '${l}' )`).join(' ')} ).
    " i_lock_handling = 0: leitura NÃO tranca o log (o default trancaria, e o DEQUEUE ficaria
    " pendurado na sessão). i_exception_if_already_loaded = abap_false: um LOAD por execução.
    CALL FUNCTION 'BAL_DB_LOAD'
      EXPORTING  i_t_lognumber                 = lt_logn
                 i_lock_handling               = 0
                 i_exception_if_already_loaded = abap_false
      IMPORTING  e_t_log_handle                = lt_logh
                 e_t_msg_handle                = lt_msgh
      EXCEPTIONS no_logs_specified = 1
                 log_not_found     = 2
                 OTHERS            = 3.
    out->write( |LOAD{ c_sep }{ sy-subrc }{ c_sep }{ lines( lt_logh ) }{ c_sep }{ lines( lt_msgh ) }| ).

    LOOP AT lt_msgh INTO DATA(ls_msgh).
      CLEAR lv_txt.
      CALL FUNCTION 'BAL_LOG_MSG_READ'
        EXPORTING  i_s_msg_handle = ls_msgh
                   i_langu        = sy-langu
        IMPORTING  e_s_msg        = ls_msg
                   e_txt_msg      = lv_txt
        EXCEPTIONS OTHERS         = 1.
      CALL FUNCTION 'BAL_LOG_HDR_READ'
        EXPORTING  i_log_handle = ls_msgh-log_handle
        IMPORTING  e_lognumber  = lv_lognr
        EXCEPTIONS OTHERS       = 1.
      out->write( |MSG{ c_sep }{ lv_lognr }{ c_sep }{ ls_msgh-msgnumber }{ c_sep }{ ls_msg-msgty }{ c_sep }{ ls_msg-msgid }{ c_sep }{ ls_msg-msgno }{ c_sep }{ ls_msg-probclass }{ c_sep }{ lv_txt }| ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * O ABAP do driver de GRAVAÇÃO — o "arrange" de um teste, e a única escrita deste módulo.
 * `mensagens`: `[{ tipo, texto }]` ou `[{ msgty, msgid, msgno, msgv1..4, probclass }]`.
 */
export function fonteDriverGravacao(nome, { objeto, subobjeto = '', extnumber = '', mensagens = [] }) {
  const n = String(nome).toLowerCase();
  if (!objeto) throw new Error('bal: gravarLog exige `objeto` — log sem objeto NÃO persiste (save_not_allowed, medido).');
  if (!mensagens.length) throw new Error('bal: gravarLog sem mensagens.');
  const linhas = mensagens.map((m) => {
    const t = String(m.tipo ?? m.msgty ?? 'I').toUpperCase().slice(0, 1);
    const id = lim(m.msgid ?? MSG_TEXTO_LIVRE.msgid, 20);
    const no = String(m.msgno ?? MSG_TEXTO_LIVRE.msgno).padStart(3, '0');
    // Texto livre vai partido nos quatro &: o `00`/`398` é `&1&2&3&4`, 50 caracteres cada.
    const v = m.texto !== undefined
      ? String(m.texto).match(/.{1,50}/g)?.slice(0, 4) ?? ['']
      : [m.msgv1, m.msgv2, m.msgv3, m.msgv4];
    const pc = String(m.probclass ?? (t === 'E' || t === 'A' ? '1' : t === 'W' ? '2' : '4')).slice(0, 1);
    return `      ( msgty = '${t}' msgid = '${id}' msgno = '${no}' probclass = '${pc}'` +
      v.map((x, i) => (x === undefined || x === null ? '' : ` msgv${i + 1} = '${lim(x, 50)}'`)).join('') + ' )';
  }).join('\n');
  return `CLASS ${n} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${n} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    CONSTANTS c_sep TYPE c LENGTH 1 VALUE cl_abap_char_utilities=>horizontal_tab.
    DATA ls_log       TYPE bal_s_log.
    DATA ls_msg       TYPE bal_s_msg.
    DATA lv_handle    TYPE balloghndl.
    DATA lt_handle    TYPE bal_t_logh.
    DATA lt_lognumber TYPE bal_t_lgnm.

    ls_log-object    = '${lim(objeto, 20)}'.
    ls_log-subobject = '${lim(subobjeto, 20)}'.
    ls_log-extnumber = '${lim(extnumber, 100)}'.
    ls_log-aluser    = sy-uname.
    ls_log-alprog    = sy-repid.

    CALL FUNCTION 'BAL_LOG_CREATE'
      EXPORTING  i_s_log      = ls_log
      IMPORTING  e_log_handle = lv_handle
      EXCEPTIONS log_header_inconsistent = 1
                 OTHERS                  = 2.
    out->write( |CREATE{ c_sep }{ sy-subrc }| ).
    IF sy-subrc <> 0 OR lv_handle IS INITIAL.
      " handle vazio faria o MSG_ADD escrever em OUTRO log, com subrc 0 (medido) — parar aqui.
      RETURN.
    ENDIF.

    DATA(lt_msg) = VALUE bal_t_msg(
${linhas} ).
    LOOP AT lt_msg INTO ls_msg.
      CALL FUNCTION 'BAL_LOG_MSG_ADD'
        EXPORTING  i_log_handle = lv_handle
                   i_s_msg      = ls_msg
        EXCEPTIONS OTHERS       = 1.
      out->write( |ADD{ c_sep }{ ls_msg-msgty }{ c_sep }{ sy-subrc }| ).
    ENDLOOP.

    " i_save_all = abap_false: salva SÓ este handle. Com abap_true o SAP salva todo log em memória,
    " inclusive os de outro ponto do programa (medido: 2 lognumbers de uma chamada só).
    APPEND lv_handle TO lt_handle.
    CALL FUNCTION 'BAL_DB_SAVE'
      EXPORTING  i_t_log_handle   = lt_handle
                 i_save_all       = abap_false
      IMPORTING  e_new_lognumbers = lt_lognumber
      EXCEPTIONS log_not_found    = 1
                 save_not_allowed = 2
                 numbering_error  = 3
                 OTHERS           = 4.
    out->write( |SAVE{ c_sep }{ sy-subrc }{ c_sep }{ lines( lt_lognumber ) }| ).
    COMMIT WORK AND WAIT.
    LOOP AT lt_lognumber INTO DATA(ls_num).
      out->write( |LOGNUMBER{ c_sep }{ ls_num-lognumber }| ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.`;
}

/** A saída do driver de leitura (linhas `LOAD`/`MSG` separadas por TAB) vira `{ load, mensagens }`. */
export function parseSaidaLeitura(saida) {
  const linhas = String(saida ?? '').split('\n').map((l) => l.replace(/\r$/, ''));
  const out = { load: null, mensagens: [] };
  for (const l of linhas) {
    const c = l.split('\t');
    if (c[0] === 'LOAD') out.load = { subrc: Number(c[1]), logs: Number(c[2]), mensagens: Number(c[3]) };
    else if (c[0] === 'MSG') {
      out.mensagens.push({
        lognumber: (c[1] ?? '').trim(),
        numero: (c[2] ?? '').trim(),
        tipo: (c[3] ?? '').trim(),
        msgid: (c[4] ?? '').trim(),
        msgno: (c[5] ?? '').trim(),
        probclass: (c[6] ?? '').trim(),
        texto: (c.slice(7).join('\t') ?? '').trim(),
      });
    }
  }
  return out;
}

/** A saída do driver de gravação vira `{ create, adds, save, lognumbers }`. */
export function parseSaidaGravacao(saida) {
  const out = { create: null, adds: [], save: null, gravadas: 0, lognumbers: [] };
  for (const l of String(saida ?? '').split('\n')) {
    const c = l.replace(/\r$/, '').split('\t');
    if (c[0] === 'CREATE') out.create = Number(c[1]);
    else if (c[0] === 'ADD') out.adds.push({ tipo: c[1], subrc: Number(c[2]) });
    else if (c[0] === 'SAVE') { out.save = Number(c[1]); out.gravadas = Number(c[2]); }
    else if (c[0] === 'LOGNUMBER') out.lognumbers.push((c[1] ?? '').trim());
  }
  return out;
}

/** Uma linha por log (e por mensagem, quando lidas) — para console, log de pipeline ou ticket. */
export function formatarLogs(logs) {
  return logs.map((g) => {
    const cnt = TIPOS.filter((t) => g.tipos[t]).map((t) => `${t}:${g.tipos[t]}`).join(' ') || 'sem mensagem';
    const cab = `  ${g.quando} ${g.objeto}/${g.subobjeto || '—'} "${g.extnumber}" ${g.usuario} — ${g.total} msg (${cnt}) [${g.lognumber}]`;
    const msgs = (g.mensagens ?? []).map((m) => `      ${m.tipo} ${m.msgid}/${m.msgno} ${m.texto}`);
    return [cab, ...msgs].join('\n');
  }).join('\n');
}

/**
 * O veredito, puro: os logs cumprem o esperado?
 *
 * `espera`:
 *   `minimo`  quantos logs no mínimo (default 1; `0` aceita nenhum)
 *   `semErro` true reprova qualquer mensagem A (abort) ou E (erro)
 *   `tipos`   `{ E: 0, W: 1 }` — contagem EXATA somada, por tipo (vem do cabeçalho, sem driver)
 *   `contem`  texto (ou lista) que precisa aparecer em alguma mensagem — EXIGE as mensagens lidas
 */
export function avaliar(logs, espera = {}) {
  const falhas = [];
  const minimo = espera.minimo ?? 1;
  if (logs.length < minimo) falhas.push(`esperava ao menos ${minimo} log(s), veio ${logs.length}`);
  const soma = (t) => logs.reduce((a, g) => a + (g.tipos[t] ?? 0), 0);
  if (espera.semErro && (soma('E') || soma('A'))) falhas.push(`log com erro: E=${soma('E')} A=${soma('A')}`);
  for (const [t, n] of Object.entries(espera.tipos ?? {})) {
    const T = t.toUpperCase();
    if (soma(T) !== n) falhas.push(`esperava ${n} mensagem(ns) do tipo ${T}, veio ${soma(T)}`);
  }
  const contem = espera.contem === undefined ? [] : [].concat(espera.contem);
  if (contem.length) {
    const lidas = logs.some((g) => g.mensagens !== null);
    if (!lidas) falhas.push('`contem` exige as mensagens lidas (comLog com { mensagens: true } ou `contem` já pede isso)');
    else {
      const txt = logs.flatMap((g) => g.mensagens ?? []).map((m) => m.texto).join('\n');
      for (const c of contem) if (!txt.includes(c)) falhas.push(`nenhuma mensagem contém "${c}"`);
    }
  }
  return { ok: falhas.length === 0, falhas };
}

// ---------- leitura do cabeçalho: SQL puro, sem driver ----------

const SEL = 'lognumber, object, subobject, extnumber, aldate, altime, aluser, altcode, alprog, probclass,'
  + ' msg_cnt_al, msg_cnt_a, msg_cnt_e, msg_cnt_w, msg_cnt_i, msg_cnt_s';

/**
 * A marca d'água: o maior LOGNUMBER que JÁ EXISTIA. Lida imediatamente antes do act.
 * BALHDR vazia (ou sem acesso) devolve zeros — aí todo log é novo, que é o correto.
 */
export async function marcaDagua(conexao) {
  const { rows } = await dataPreview(conexao, 'SELECT MAX( lognumber ) AS n FROM balhdr', { rows: 1 });
  const n = String(rows[0]?.N ?? '').trim();
  return /^\d+$/.test(n) ? n.padStart(20, '0') : MARCA_ZERO;
}

/**
 * Os logs com LOGNUMBER maior que a marca.
 *
 * @param {string} opts.objeto     filtro `LIKE` no objeto de log (ex. `'YJBV_POC%'`)
 * @param {string} opts.subobjeto  filtro `LIKE` no subobjeto
 * @param {string} opts.extnumber  filtro `LIKE` no número externo — o identificador do SEU caso
 * @param {string} opts.usuario    default: o do logon; `'*'` traz de todos (job roda com outro)
 * @param {string} opts.programa   filtro `LIKE` no programa
 *
 * Não há filtro de mandante: `BALHDR-MANDANT` é campo CLIENTE (CLNT) e o `dataPreview` o RECUSA no
 * WHERE ("The client field MANDANT cannot be specified…", 400) — ele já lê no mandante do logon.
 * (Na SNAP dos dumps o `MANDT` é campo comum e entra no WHERE; aqui não.)
 */
export async function logsDesde(conexao, marca, {
  objeto, subobjeto, extnumber, usuario, programa, limite = 50,
} = {}) {
  const m = String(marca ?? MARCA_ZERO).trim().padStart(20, '0');
  const quem = usuario === '*' ? null : String(usuario || conexao.cfg.user).toUpperCase();
  const like = (campo, v) => `${campo} LIKE '${lim(String(v).toUpperCase(), 100)}'`;
  const where = [
    `lognumber > '${m}'`,
    ...(objeto ? [like('object', objeto)] : []),
    ...(subobjeto ? [like('subobject', subobjeto)] : []),
    ...(extnumber ? [like('extnumber', extnumber)] : []),
    ...(programa ? [like('alprog', programa)] : []),
    ...(quem ? [`aluser = '${lim(quem, 12)}'`] : []),
  ];
  const { rows } = await dataPreview(conexao,
    `SELECT ${SEL} FROM balhdr\n  WHERE ${where.join('\n  AND ')}\n  ORDER BY lognumber`, { rows: limite });
  return rows.map(linhaParaLog);
}

// ---------- mensagens: driver classrun (o único caminho — a BALDAT é cluster) ----------

/**
 * Lê as MENSAGENS dos logs indicados e as devolve anexadas a cada cabeçalho.
 *
 * Deixa a classe `name` em `$TMP` (reutilizada a cada chamada, o fonte muda com os lognumbers).
 * ⚠ `BAL_DB_LOAD` é tudo-ou-nada: UM lognumber inexistente na lista devolve `log_not_found`
 * (subrc 2) e ZERO logs — os que existiam não vêm. Por isso a lista sai da própria BALHDR.
 */
export async function lerMensagens(conexao, logs, { name = 'YJBV_BAL_LEITURA' } = {}) {
  const lista = (Array.isArray(logs) ? logs : [logs]).map((l) => (typeof l === 'string' ? l : l.lognumber));
  if (!lista.length) return [];
  passo(`bal: lendo mensagens de ${lista.length} log(s) por classrun`);
  const r = await deployAndRun(conexao, {
    name, source: fonteDriverLeitura(name, lista), description: 'adt-client — leitura de log de aplicação',
  });
  if (!r.ok) throw new Error(`bal: driver de leitura falhou: ${r.erro?.slice(0, 400)}`);
  const { load, mensagens } = parseSaidaLeitura(r.saida);
  if (load?.subrc !== 0) {
    throw new Error(`bal: BAL_DB_LOAD devolveu subrc ${load?.subrc} (2 = log_not_found — basta UM número ausente para não vir nada).`);
  }
  detalhe(`bal: ${load.logs} log(s), ${load.mensagens} mensagem(ns)`);
  return mensagens;
}

/** Cabeçalhos + mensagens já anexadas (a via completa: SQL para o cabeçalho, driver para o texto). */
export async function lerLogs(conexao, marca, opts = {}) {
  const logs = await logsDesde(conexao, marca, opts);
  if (!logs.length) return logs;
  const msgs = await lerMensagens(conexao, logs, opts);
  for (const g of logs) g.mensagens = msgs.filter((m) => m.lognumber === g.lognumber);
  return logs;
}

// ---------- gravação (arrange de teste) ----------

/**
 * Grava um log conhecido — o "antes" de um teste, ou a prova de que um objeto de log funciona.
 * Deixa a classe `name` em `$TMP`. Devolve `{ ok, lognumbers, create, save, saida }`.
 */
export async function gravarLog(conexao, { objeto, subobjeto, extnumber, mensagens, name = 'YJBV_BAL_GRAVA' }) {
  passo(`bal: gravando log em ${objeto}/${subobjeto || '—'} ("${extnumber}")`);
  const r = await deployAndRun(conexao, {
    name,
    source: fonteDriverGravacao(name, { objeto, subobjeto, extnumber, mensagens }),
    description: 'adt-client — gravação de log de aplicação',
  });
  if (!r.ok) throw new Error(`bal: driver de gravação falhou: ${r.erro?.slice(0, 400)}`);
  const p = parseSaidaGravacao(r.saida);
  if (p.create !== 0) throw new Error(`bal: BAL_LOG_CREATE subrc ${p.create} — objeto "${objeto}"/subobjeto "${subobjeto}" não existe na BALOBJ/BALSUB (crie por deploy(cx, 'applicationLogObject', …)).`);
  if (p.save !== 0) throw new Error(`bal: BAL_DB_SAVE subrc ${p.save} (2 = save_not_allowed, típico de log sem objeto).`);
  return { ok: true, ...p, saida: r.saida };
}

/** O ABAP do driver que APAGA logs por lognumber (`BAL_DB_DELETE` — também não é RFC). */
export function fonteDriverExclusao(nome, lognumbers) {
  const n = String(nome).toLowerCase();
  const lista = [...new Set(lognumbers.map((l) => String(l).trim().padStart(20, '0')))];
  if (!lista.length) throw new Error('bal: apagarLogs sem lognumber.');
  for (const l of lista) if (!/^\d{20}$/.test(l)) throw new Error(`bal: lognumber inválido "${l}" (NUMC 20).`);
  return `CLASS ${n} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
ENDCLASS.

CLASS ${n} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    CONSTANTS c_sep TYPE c LENGTH 1 VALUE cl_abap_char_utilities=>horizontal_tab.
    DATA lt_logn TYPE bal_t_logn.
    lt_logn = VALUE #( ${lista.map((l) => `( '${l}' )`).join(' ')} ).
    CALL FUNCTION 'BAL_DB_DELETE'
      EXPORTING  i_t_lognumber      = lt_logn
                 i_in_update_task   = abap_false
                 i_with_commit_work = abap_true
      EXCEPTIONS no_logs_specified  = 1
                 OTHERS             = 2.
    out->write( |DELETE{ c_sep }{ sy-subrc }{ c_sep }{ lines( lt_logn ) }| ).
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * Apaga logs do banco (o que a SLG2 faz). Destrutivo — exige `confirm: true`.
 * Deixa a classe `name` em `$TMP`. Devolve `{ ok, subrc, pedidos, restantes }`.
 */
export async function apagarLogs(conexao, logs, { confirm = false, name = 'YJBV_BAL_APAGA' } = {}) {
  if (confirm !== true) throw new Error('GUARD-RAIL: apagarLogs exige confirm:true (remoção de log é irreversível).');
  const lista = (Array.isArray(logs) ? logs : [logs]).map((l) => (typeof l === 'string' ? l : l.lognumber));
  passo(`bal: apagando ${lista.length} log(s)`);
  const r = await deployAndRun(conexao, {
    name, source: fonteDriverExclusao(name, lista), description: 'adt-client — exclusão de log de aplicação',
  });
  if (!r.ok) throw new Error(`bal: driver de exclusão falhou: ${r.erro?.slice(0, 400)}`);
  const subrc = Number((r.saida.match(/DELETE\t(\d+)/) || [])[1]);
  const emAspas = lista.map((l) => `'${l}'`).join(', ');
  const { rows } = await dataPreview(conexao,
    `SELECT COUNT(*) AS n FROM balhdr\n  WHERE lognumber IN ( ${emAspas} )`, { rows: 1 });
  const restantes = Number(String(rows[0]?.N ?? '0').trim()) || 0;
  return { ok: subrc === 0 && restantes === 0, subrc, pedidos: lista.length, restantes };
}

// ---------- o assert ----------

export class ErroDeLog extends Error {
  constructor(logs, falhas, causa) {
    const cab = causa
      ? `${causa.message}\n→ e o log de aplicação diz:`
      : `o act "passou", mas o log de aplicação reprova (${falhas.length}):`;
    super(`${cab}\n${falhas.map((f) => `  ✗ ${f}`).join('\n')}${logs.length ? `\n${formatarLogs(logs)}` : ''}`);
    this.name = 'ErroDeLog';
    this.logs = logs;
    this.falhas = falhas;
    this.causa = causa ?? null;
  }
}

/**
 * Roda o act e cobra do LOG DE APLICAÇÃO o que o act disse ter feito.
 *
 * ```js
 * const r = await comLog(cx, () => runClass(cx, 'YCL_CARGA', { novaSessao: true }), {
 *   objeto: 'YJBV_POC_LOG29', espera: { semErro: true, tipos: { S: 1 } },
 * });
 * ```
 *
 * Os filtros (`objeto`, `subobjeto`, `extnumber`, `usuario`, `programa`) vão para `logsDesde`.
 * As mensagens só são lidas — e o driver só roda — quando `espera.contem` pede, ou
 * `mensagens: true`. Sem isso o assert inteiro é SQL, e não deixa classe nenhuma no sistema.
 *
 * @param {boolean} opts.lancar  false devolve `{ ok, logs, falhas }` em vez de lançar (default true)
 */
export async function comLog(conexao, acao, { espera = {}, lancar = true, mensagens = false, ...filtros } = {}) {
  const marca = await marcaDagua(conexao);
  detalhe(`bal: marca d'água lognumber ${marca}`);
  const precisaTexto = mensagens || espera.contem !== undefined;
  let resultado;
  try {
    resultado = await acao();
  } catch (causa) {
    const logs = await (precisaTexto ? lerLogs : logsDesde)(conexao, marca, filtros);
    if (!logs.length) throw causa;
    passo(`bal: o act falhou E deixou ${logs.length} log(s) — o porquê pode estar neles`);
    throw new ErroDeLog(logs, ['o act falhou'], causa);
  }
  const logs = await (precisaTexto ? lerLogs : logsDesde)(conexao, marca, filtros);
  const { ok, falhas } = avaliar(logs, espera);
  if (!ok) {
    passo(`bal: o act "passou" mas o log reprova (${falhas.length})`);
    if (lancar) throw new ErroDeLog(logs, falhas, null);
  }
  return { ok, resultado, logs, falhas, marca };
}

/** Atalho: reprova se o act deixou mensagem de erro (E) ou aborto (A) no log — sem exigir log algum. */
export const semErroNoLog = (conexao, acao, opts = {}) =>
  comLog(conexao, acao, { ...opts, espera: { minimo: 0, semErro: true, ...(opts.espera ?? {}) } });
