// nrob.mjs — os INTERVALOS de um objeto de numeração (a segunda tela da SNRO), por driver classrun.
//
// A divisão é a do próprio SAP, e é o que justifica dois arquivos:
//   • o OBJETO (R3TR NROB, a linha da TNRO) é objeto de repositório e sai por ADT REST —
//     `tipos/numberRangeObject.mjs`, `deploy(conexao, 'numberRangeObject', …)`;
//   • o INTERVALO (NRIV) é DADO DE MANDANTE. Não tem TADIR, não entra em versão, e nenhum
//     `NUMBER_RANGE_*` é RFC (medido na fila 38) — então a via é driver classrun, aqui.
//
// Medido 2026-09-01, S4H 758 (docs/receita-nrob.md):
//   • o ciclo é ENQUEUE → UPDATE_INIT → INTERVAL_UPDATE → UPDATE_CLOSE(commit) → DEQUEUE. Pular o
//     INIT faz o CLOSE devolver `OBJECT_NOT_INITIALIZED`.
//   • **`INRIV-PROCIND` é obrigatório** ('I' inserir, 'U' alterar, 'D' eliminar). Sem ele o
//     INTERVAL_UPDATE devolve subrc=0 e NADA acontece — quem denuncia é o CLOSE, com
//     `NO_CHANGES_MADE` (subrc 1). É a falha mais cara deste canal: os dois FMs "passam".
//   • **o INTERVAL_UPDATE grava a LINHA INTEIRA** — em `acao: 'alterar'`, omitir o `nrlevel` zera o
//     contador em silêncio (medido: NRLEVEL 10000 → 0, sem erro nenhum). Por isso `alterar` exige
//     `nivel` explícito aqui: quem quer preservar lê antes com `lerIntervalos`.
//   • **para APAGAR, o NRLEVEL tem de ir ZERADO** no payload: com o nível gravado o UPDATE volta
//     com `error_occured='X'` e `INRER` = msgnr 210, tablename INTERVAL, fieldname NRLEVEL
//     ("ao eliminar, o status do número deve ser inicial"), e o CLOSE volta a NO_CHANGES_MADE.
//   • e é por isso que isto existe ao lado do tipo: **o DELETE do NROB pelo ADT dá 400 `NR 874`
//     ("Existem intervalos para o objeto") enquanto houver NRIV** — apagar o intervalo é
//     pré-requisito de apagar o objeto.
//   • `INRER` (a estrutura de erro) NÃO tem `ERRORNUMBER`: é MSGNR/TABLENAME/FIELDNAME/TABIX.
//     `INRIV` não tem `OBJECT` — o objeto vai só no EXPORTING (tem SUBOBJECT, esse sim).

import { deleteObject } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';

const esc = (v) => String(v).replace(/'/g, "''");
const up = (v) => String(v ?? '').toUpperCase();

/** 'I' inserir · 'U' alterar · 'D' eliminar — o `INRIV-PROCIND` que o INTERVAL_UPDATE exige. */
export const ACOES = { inserir: 'I', alterar: 'U', apagar: 'D' };

/**
 * PURO: confere um intervalo antes de qualquer rede. `nr` é CHAR 2 (NRIV-NRRANGENR).
 * Em `acao: 'alterar'`, `nivel` é OBRIGATÓRIO: o INTERVAL_UPDATE grava a linha inteira, então
 * omitir o nível ZERA o contador em silêncio (medido: NRLEVEL 10000 → 0). Quem quer preservar
 * lê antes com `lerIntervalos`; quem quer reiniciar passa `nivel: 0` de propósito.
 */
export function validarIntervalo({ nr, de, ate, ateAno = '0000', nivel, acao = 'inserir' } = {}) {
  if (!nr) throw new Error('intervalo exige { nr } (o número do intervalo, CHAR 2 — ex. "01")');
  if (String(nr).length > 2) throw new Error(`intervalo "${nr}": nr tem no máximo 2 caracteres (NRIV-NRRANGENR)`);
  if (!ACOES[acao]) throw new Error(`intervalo "${nr}": acao "${acao}" desconhecida — use ${Object.keys(ACOES).join('|')}`);
  if (acao !== 'apagar' && !(de && ate)) throw new Error(`intervalo "${nr}": exige { de, ate } (do número, até o número)`);
  if (acao === 'alterar' && nivel === undefined) {
    throw new Error(`GUARD-RAIL: intervalo "${nr}" com acao "alterar" exige { nivel } — o INTERVAL_UPDATE grava a linha inteira e omitir o nível ZERA o contador. Leia o atual com lerIntervalos(), ou passe nivel: 0 para reiniciar de propósito.`);
  }
  for (const [c, v] of [['de', de], ['ate', ate]]) {
    if (v !== undefined && String(v).length > 20) throw new Error(`intervalo "${nr}": ${c} tem no máximo 20 caracteres (NRIV-FROMNUMBER/TONUMBER)`);
  }
  if (String(ateAno).length > 4) throw new Error(`intervalo "${nr}": ateAno é NUMC 4`);
  return ACOES[acao];
}

const HEAD = (driver) => `CLASS ${String(driver).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(driver).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA lt_int TYPE TABLE OF inriv.
    DATA lt_err TYPE TABLE OF inriv.
    DATA ls_error TYPE inrer.
    DATA lv_err TYPE c LENGTH 1.
    DATA lv_num TYPE char20.`;

const CICLO = (objeto) => `    CALL FUNCTION 'NUMBER_RANGE_ENQUEUE' EXPORTING object = '${esc(objeto)}' EXCEPTIONS OTHERS = 1.
    out->write( |ENQ subrc={ sy-subrc }| ).
    CALL FUNCTION 'NUMBER_RANGE_UPDATE_INIT' EXPORTING object = '${esc(objeto)}' EXCEPTIONS object_not_found = 1 OTHERS = 2.
    out->write( |INIT subrc={ sy-subrc }| ).
    CALL FUNCTION 'NUMBER_RANGE_INTERVAL_UPDATE'
      EXPORTING object = '${esc(objeto)}'
      IMPORTING error = ls_error error_occured = lv_err
      TABLES interval = lt_int error_iv = lt_err
      EXCEPTIONS object_not_found = 1 OTHERS = 2.
    out->write( |UPDATE subrc={ sy-subrc } erro={ lv_err } msgnr={ ls_error-msgnr } tab={ ls_error-tablename } fld={ ls_error-fieldname } tabix={ ls_error-tabix } recusados={ lines( lt_err ) }| ).
    CALL FUNCTION 'NUMBER_RANGE_UPDATE_CLOSE'
      EXPORTING object = '${esc(objeto)}' commit = abap_true
      EXCEPTIONS no_changes_made = 1 object_not_initialized = 2 OTHERS = 3.
    out->write( |CLOSE subrc={ sy-subrc }| ).
    COMMIT WORK AND WAIT.
    CALL FUNCTION 'NUMBER_RANGE_DEQUEUE' EXPORTING object = '${esc(objeto)}' EXCEPTIONS OTHERS = 1.
    out->write( |DEQ subrc={ sy-subrc }| ).`;

/**
 * PURO: o driver que grava/altera intervalos. `intervalos`: [{ nr, de, ate, ateAno?, externo?, acao? }].
 * `PROCIND` vai SEMPRE preenchido — sem ele os dois FMs devolvem sucesso e nada muda (ver cabeçalho).
 */
export function buildIntervalosSource(driver, objeto, intervalos, { proximoDe = null } = {}) {
  const linhas = intervalos.map((iv) => {
    const P = validarIntervalo(iv);
    return `    CLEAR lt_int.
    APPEND VALUE inriv( nrrangenr = '${esc(up(iv.nr))}' toyear = '${esc(iv.ateAno ?? '0000')}'
                        fromnumber = '${esc(iv.de ?? '')}' tonumber = '${esc(iv.ate ?? '')}'
                        nrlevel = '${esc(iv.nivel ?? 0)}'
                        externind = '${iv.externo ? 'X' : ''}' procind = '${P}' ) TO lt_int.`;
  });
  // Um ciclo por intervalo: o INTERVAL_UPDATE valida a tabela inteira e recusa o lote todo no erro.
  const corpo = linhas.map((l) => `${l}\n${CICLO(objeto)}`).join('\n');
  const proximo = proximoDe ? `
    CALL FUNCTION 'NUMBER_GET_NEXT'
      EXPORTING nr_range_nr = '${esc(up(proximoDe))}' object = '${esc(objeto)}'
      IMPORTING number = lv_num
      EXCEPTIONS OTHERS = 1.
    out->write( |NEXT subrc={ sy-subrc } num={ lv_num }| ).` : '';
  return `${HEAD(driver)}\n${corpo}${proximo}\n  ENDMETHOD.\nENDCLASS.`;
}

/**
 * PURO: o driver que apaga TODOS os intervalos do objeto. Lê pelo `INTERVAL_LIST` (o formato que o
 * próprio SAP devolve) e zera o `NRLEVEL` — sem isso o UPDATE recusa com INRER msgnr 210.
 */
export function buildApagarIntervalosSource(driver, objeto) {
  return `${HEAD(driver)}
    CALL FUNCTION 'NUMBER_RANGE_INTERVAL_LIST' EXPORTING object = '${esc(objeto)}' TABLES interval = lt_int EXCEPTIONS OTHERS = 1.
    out->write( |LIST subrc={ sy-subrc } n={ lines( lt_int ) }| ).
    IF lt_int IS INITIAL.
      out->write( |SEM INTERVALO| ).
      RETURN.
    ENDIF.
    LOOP AT lt_int ASSIGNING FIELD-SYMBOL(<i>).
      out->write( |IV [{ <i>-nrrangenr }] from={ <i>-fromnumber } to={ <i>-tonumber } lvl={ <i>-nrlevel } ext={ <i>-externind }| ).
      <i>-nrlevel = 0.
      <i>-procind = 'D'.
    ENDLOOP.
${CICLO(objeto)}
  ENDMETHOD.
ENDCLASS.`;
}

/** PURO: o driver que só LÊ os intervalos (nada altera). */
export function buildLerIntervalosSource(driver, objeto) {
  return `${HEAD(driver)}
    CALL FUNCTION 'NUMBER_RANGE_INTERVAL_LIST' EXPORTING object = '${esc(objeto)}' TABLES interval = lt_int EXCEPTIONS OTHERS = 1.
    out->write( |LIST subrc={ sy-subrc } n={ lines( lt_int ) }| ).
    LOOP AT lt_int ASSIGNING FIELD-SYMBOL(<i>).
      out->write( |IV [{ <i>-nrrangenr }] from={ <i>-fromnumber } to={ <i>-tonumber } lvl={ <i>-nrlevel } ext={ <i>-externind }| ).
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * PURO: lê a saída do driver. `ok` só é true se o CLOSE gravou — `CLOSE subrc=1` é NO_CHANGES_MADE,
 * o silêncio que o INTERVAL_UPDATE não denuncia. `erro` traz o INRER quando o FM recusou.
 */
export function parseIntervalosOutput(saida) {
  const txt = String(saida ?? '');
  const ciclos = [...txt.matchAll(/UPDATE subrc=(\d+) erro=(\S?) msgnr=(\S*) tab=(\S*) fld=(\S*) tabix=(\d+) recusados=(\d+)[\s\S]*?CLOSE subrc=(\d+)/g)]
    .map((m) => ({
      updateSubrc: Number(m[1]), erroFm: m[2] === 'X', msgnr: m[3] || null, tabela: m[4] || null,
      campo: m[5] || null, tabix: Number(m[6]), recusados: Number(m[7]), closeSubrc: Number(m[8]),
    }));
  const intervalos = [...txt.matchAll(/IV \[(\S{1,2})\] from=(\S*) to=(\S*) lvl=(\S*) ext=(\S?)/g)]
    .map((m) => ({ nr: m[1], de: m[2], ate: m[3], nivel: m[4], externo: m[5] === 'X' }));
  const prox = txt.match(/NEXT subrc=(\d+) num=(\S*)/);
  return {
    ok: ciclos.length > 0 && ciclos.every((c) => c.updateSubrc === 0 && !c.erroFm && c.closeSubrc === 0),
    ciclos, intervalos,
    semIntervalo: /SEM INTERVALO/.test(txt),
    proximo: prox ? { subrc: Number(prox[1]), numero: prox[2] } : null,
  };
}

/**
 * Grava intervalos no objeto de numeração. `intervalos`: [{ nr, de, ate, ateAno?, externo?, acao? }].
 * `proximoDe: '01'` pede um NUMBER_GET_NEXT no fim — a prova de que o intervalo ficou usável.
 * Devolve o `parseIntervalosOutput` + `{ saida }`. O driver é apagado (a menos de `keepDriver`).
 */
export async function deployIntervalos(conexao, { objeto, intervalos, proximoDe = null,
  driver = `Y_NRIV_${up(objeto).slice(0, 23)}`, keepDriver = false }) {
  if (!intervalos?.length) throw new Error('deployIntervalos: informe ao menos um intervalo');
  const source = buildIntervalosSource(driver, up(objeto), intervalos, { proximoDe });
  try {
    const r = await deployAndRun(conexao, { name: driver, source, description: `intervalos de ${up(objeto)}` });
    return { ...parseIntervalosOutput(r.saida), saida: r.saida, erro: r.erro ?? null };
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
}

/** Lê os intervalos do objeto (só leitura, por driver — nenhum NUMBER_RANGE_* é RFC). */
export async function lerIntervalos(conexao, { objeto, driver = `Y_NRIVR_${up(objeto).slice(0, 22)}`, keepDriver = false }) {
  const source = buildLerIntervalosSource(driver, up(objeto));
  try {
    const r = await deployAndRun(conexao, { name: driver, source, description: `intervalos de ${up(objeto)} (leitura)` });
    return { ...parseIntervalosOutput(r.saida), saida: r.saida };
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
}

/**
 * Apaga TODOS os intervalos do objeto — pré-requisito para `deleteObject` do NROB, que enquanto
 * houver NRIV devolve 400 `NR 874` ("Existem intervalos para o objeto").
 */
export async function apagarIntervalos(conexao, { objeto, driver = `Y_NRIVD_${up(objeto).slice(0, 22)}`, keepDriver = false, confirm = false }) {
  if (confirm !== true) throw new Error(`GUARD-RAIL: apagarIntervalos exige confirm:true (o NRLEVEL de "${up(objeto)}" se perde).`);
  const source = buildApagarIntervalosSource(driver, up(objeto));
  try {
    const r = await deployAndRun(conexao, { name: driver, source, description: `apaga intervalos de ${up(objeto)}` });
    const p = parseIntervalosOutput(r.saida);
    return { ...p, ok: p.semIntervalo || p.ok, saida: r.saida };
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
}
