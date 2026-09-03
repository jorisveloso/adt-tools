// sm30.mjs — diálogo de atualização de tabela (SM30) gerado SEM GUI: OBJ_GENERATE + o gerador da SE54
// (FORM start_gen_viewmaint_tool do SAPMSVIM) chamados de um driver classrun.
//
// Medido 2026-08-29, S4H 758 (docs/receita-tobj-sm30.md):
//   • ADT não gera — `transportobject/objects` (TOBJ/TOB) é só leitura no 758 (POST → 400 SCTS_SOBJ 011);
//     VIEW_MAINTENANCE_GENERATE só chama a SE55 (diálogo). O gerador de verdade é FORM de module pool.
//   • O FORM lê GLOBAIS do SAPMSVIM além dos parâmetros: FUNCTION_POOL_CREATE recebe `tvdir-area` global —
//     vazio dá "E FL 019 Function group name must be at least 4 characters" (levantado como exceção no
//     classrun: "cannot be processed in plugin mode HTTP"). Por isso o driver carrega o programa
//     (PERFORM init_const_tabs) e preenche (SAPMSVIM)TVDIR/DEVCLASS/TDDAT por ASSIGN antes de chamar.
//   • O FUGR criado pelo gerador NÃO ganha TADIR (no SE54 é o call_corr que a cria). Por isso
//     `deployTableMaintenance` cria o FUGR pela lib ANTES (TADIR no pacote certo); o gerador acha o pool
//     (name_already_exists → "já existe") e gera dentro dele.
//   • Prova de uso: BDC de SM30 (SAPMSVMA 0100 =UPD → SAPL<fg> 0001 =NEWL → campos (01) → =SAVE) gravou
//     e o readTable em outra LUW achou a linha.

import { deploy } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';
import { readTable } from './rfc-soap.mjs';

const esc = (v) => String(v).replace(/'/g, "''");

/**
 * Fonte do driver classrun que cria o objeto de atualização (OBJ_GENERATE, tipo S) e gera o diálogo
 * (start_gen_viewmaint_tool). Puro. `listScreen` é a dynpro de visão geral; `authGroup` vai para TDDAT.
 */
export function buildSm30GeneratorSource(name, { table, group, pkg = '$TMP', authGroup = '&NC&', listScreen = '0001', description = '' }) {
  const T = String(table).toUpperCase(); const G = String(group).toUpperCase();
  return `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA: ls_tvdir TYPE tvdir, ls_gencb TYPE vimgencb, lv_mode TYPE c LENGTH 1, lv_trace TYPE i VALUE 0,
          lv_sim TYPE c LENGTH 1, lv_msg TYPE string, ls_tddat TYPE tddat.
    FIELD-SYMBOLS: <tvdir> TYPE tvdir, <devclass> TYPE any, <tddat> TYPE tddat.
    " 1. objeto de atualização (OBJH/OBJS + TADIR TOBJ <tabela>S) — a peça que a SE54 chama em object_list
    CALL FUNCTION 'OBJ_GENERATE'
      EXPORTING iv_objectname = '${T}' iv_objecttype = 'S' iv_maint_mode = 'I'
                iv_objecttext = '${esc(description).slice(0, 60)}' iv_devclass = '${esc(pkg)}'
      EXCEPTIONS illegal_call = 1 object_not_found = 2 generate_error = 3 transport_error = 4 object_enqueue_failed = 5 OTHERS = 6.
    IF sy-subrc <> 0.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg.
    ENDIF.
    out->write( |OBJ_GENERATE subrc={ sy-subrc } { lv_msg }| ).
    COMMIT WORK AND WAIT.
    " 2. diálogo (TVDIR + FUGR + dynpro + TABLEFRAME_/TABLEPROC_) — o gerador da SE54, com os globais preenchidos
    ls_tvdir-tabname = '${T}'. ls_tvdir-area = '${G}'. ls_tvdir-devclass = '${esc(pkg)}'.
    ls_tvdir-type = '1'. ls_tvdir-liste = '${listScreen}'. ls_tvdir-bastab = 'X'.
    ls_gencb-viewname = ls_tvdir-tabname. ls_gencb-area = ls_tvdir-area.
    ls_gencb-creffunc = 'X'. ls_gencb-crepfunc = 'X'.
    TRY.
        PERFORM init_const_tabs IN PROGRAM sapmsvim.
        ASSIGN ('(SAPMSVIM)TVDIR') TO <tvdir>.
        ASSIGN ('(SAPMSVIM)DEVCLASS') TO <devclass>.
        ASSIGN ('(SAPMSVIM)TDDAT') TO <tddat>.
        IF <tvdir> IS ASSIGNED. <tvdir> = ls_tvdir. ENDIF.
        IF <devclass> IS ASSIGNED. <devclass> = '${esc(pkg)}'. ENDIF.
        IF <tddat> IS ASSIGNED. <tddat>-tabname = ls_tvdir-tabname. <tddat>-cclass = '${esc(authGroup)}'. ENDIF.
        " grupo de autorização (S_TABU_DIS): na SE54 é o submit_generation que grava a TDDAT, não o gerador
        ls_tddat-tabname = ls_tvdir-tabname. ls_tddat-cclass = '${esc(authGroup)}'.
        MODIFY tddat FROM ls_tddat.
        out->write( |TDDAT subrc={ sy-subrc }| ).
        PERFORM start_gen_viewmaint_tool IN PROGRAM sapmsvim USING ls_tvdir ls_gencb lv_mode lv_trace lv_sim.
        out->write( |GEN_RESULT tvdir={ ls_gencb-tvdir } pool={ ls_gencb-pool } ffunc={ ls_gencb-ffunc } pfunc={ ls_gencb-pfunc } dynp1={ ls_gencb-dynp1 }| ).
      CATCH cx_root INTO DATA(lx).
        out->write( |GEN_ERROR { lx->get_text( ) }| ).
    ENDTRY.
    COMMIT WORK AND WAIT.
  ENDMETHOD.
ENDCLASS.`;
}

/** Interpreta a saída do driver. Puro. Letras do VIMGENCB: C = criado, M = modificado, A = já existia. */
export function parseSm30Output(saida) {
  const s = String(saida);
  const gen = s.match(/GEN_RESULT tvdir=(\S*) pool=(\S*) ffunc=(\S*) pfunc=(\S*) dynp1=(\S*)/);
  const erro = s.match(/GEN_ERROR (.*)/)?.[1] ?? null;
  const obj = s.match(/OBJ_GENERATE subrc=(\d+)[ \t]*([^\n]*)/);
  return {
    ok: !!gen && !erro && obj?.[1] === '0',
    objGenerate: obj ? { subrc: Number(obj[1]), msg: obj[2].trim() } : null,
    gencb: gen ? { tvdir: gen[1], pool: gen[2], ffunc: gen[3], pfunc: gen[4], dynp1: gen[5] } : null,
    erro,
  };
}

/**
 * Gera o diálogo SM30 de uma tabela Z já ativa: cria o FUGR pela lib (TADIR no pacote), sobe e roda o
 * driver, e prova por readTable (TVDIR) em outra LUW. Devolve { ok, tvdir, gencb, objGenerate, erro, saida }.
 * O driver fica em `pkg` (apague com deleteObject quando não for o produto). Exige senha no cfg.
 */
export async function deployTableMaintenance(conexao, { table, group, pkg = '$TMP', authGroup = '&NC&', listScreen = '0001', description = '', driver = `Y_SM30_${String(table).toUpperCase().slice(0, 23)}` }) {
  const T = String(table).toUpperCase(); const G = String(group).toUpperCase();
  await deploy(conexao, 'functionGroup', { name: G, pkg, description: description || `Atualização de ${T} (gerado)` });
  const r = await deployAndRun(conexao, { name: driver, pkg, description: `driver: gera SM30 de ${T}`,
    source: buildSm30GeneratorSource(driver, { table: T, group: G, pkg, authGroup, listScreen, description }) });
  const p = r.ok ? parseSm30Output(r.saida) : { ok: false, erro: r.erro, gencb: null, objGenerate: null };
  const tvdir = await readTable(conexao.cfg, 'TVDIR', { where: [`TABNAME = '${T}'`] }).catch(() => []);
  return { ...p, ok: p.ok && tvdir.length === 1 && tvdir[0].AREA === G && tvdir[0].GENDATE !== '00000000', tvdir: tvdir[0] ?? null, saida: r.saida };
}
