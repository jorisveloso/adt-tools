// brf.mjs — BRF+ (FDT) criado, executado e apagado SEM workbench: driver classrun pela API oficial
// `cl_fdt_factory` (a Web Dynpro workbench não tem coleção ADT; escrever nas tabelas FDT_* à mão
// corrompe — ver docs/receita-brfplus.md). Item 37 da fila (ideia I33).
//
// Medido 2026-08-30, S4H 758 (POC + E2E deste módulo):
//   • Fonte modelado nos demos que a SAP entrega no próprio sistema (FDT_DEMO_REPORT_DECISION_TABLE,
//     FDT_DEMO_REPORT_APPLICATION, FDT_DEMO_QUERY_OBJECTS) — a cobaia que garante a assinatura da API
//     no release.
//   • Fluxo: app LOCAL (create_local_application → activate → save → dequeue) → elementos por
//     cl_fdt_convenience=>create_element (iv_activate=false) → decision table
//     (get_expression(gc_exty_decision_table) → enqueue(true) → set_columns → set_table_data) →
//     função (get_function → set_context_data_objects → set_expression) → activate DEEP na função
//     (ativa DT e elementos junto) → save deep → dequeue deep → process.
//   • Célula de condição = ranges (sign include, option equal no que este módulo gera); célula sem
//     range = SEMPRE VERDADEIRA (curinga — o demo pula o INSERT quando '*'). Entrada sem regra que
//     case levanta cx_fdt "Não foram encontradas concordâncias" — é o comportamento, não erro.
//   • Delete: if_fdt_application->delete_incl_assigned_object(gc_delete_option_del_or_mark) apaga a
//     app COM tudo dentro — em app local com versões o resultado é delete LÓGICO (DELETED='X' na
//     FDT_ADMN_0000); físico é outra opção/relatório, fora daqui.
//   • Descrição da classe driver ≤ 60 caracteres (create do ADT recusa acima).
//
// Tudo local ($TMP + app local, sem TR). Só elementos TEXT e condição de IGUALDADE — é o que foi
// medido; outros tipos/operadores ficam para quando houver caso real.

import { deployAndRun } from './classrun.mjs';
import { deleteObject, assertZY } from './adt-client.mjs';
import { passo, detalhe } from './log.mjs';

const up = (v) => String(v ?? '').toUpperCase();
const esc = (v) => String(v).replace(/'/g, "''");
const driverDe = (prefixo, nome) => `${prefixo}${up(nome).replace(/[^A-Z0-9_]/g, '_').slice(0, 30 - prefixo.length)}`;

const HEAD = (name) => `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.`;
const TAIL = `  ENDMETHOD.
ENDCLASS.`;

// Nome BRF+ (aplicação, elemento, expressão, função): identificador simples; o guard-rail Z/Y vale
// para o que criamos, como em todo objeto da lib.
function assertNomeFdt(nome, oQue) {
  if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(up(nome))) throw new Error(`${oQue} "${nome}": use A-Z, 0-9 e _ (máx. 30, começando por letra)`);
}

/** Confere a especificação da decision table. Puro; lança com a razão. */
export function validarDecisionTable({ app, contexto, resultado, regras, testes = [] }) {
  assertZY(app); assertNomeFdt(app, 'aplicação');
  if (!Array.isArray(contexto) || !contexto.length) throw new Error('contexto: informe ao menos um elemento (ex.: ["TIPO"])');
  for (const c of contexto) assertNomeFdt(c, 'elemento de contexto');
  assertNomeFdt(resultado, 'elemento de resultado');
  if (!Array.isArray(regras) || !regras.length) throw new Error('regras: informe ao menos uma ({ quando: { ELEM: "valor" }, entao: "valor" })');
  for (const [i, r] of regras.entries()) {
    if (typeof r?.entao !== 'string') throw new Error(`regra ${i + 1}: falta "entao" (valor de resultado, string)`);
    for (const k of Object.keys(r.quando ?? {})) {
      if (!contexto.map(up).includes(up(k))) throw new Error(`regra ${i + 1}: "${k}" não está no contexto [${contexto.join(', ')}]`);
    }
  }
  for (const [i, t] of testes.entries()) {
    for (const k of Object.keys(t ?? {})) if (!contexto.map(up).includes(up(k))) throw new Error(`teste ${i + 1}: "${k}" não está no contexto`);
  }
}

/**
 * Fonte do driver que cria app local + elementos + decision table + função, ativa DEEP, salva e roda
 * os `testes` (cada um vira uma linha `RESULT_<n>=`). Puro — o fluxo medido do item 37.
 */
export function buildDecisionTableSource(name, { app, tabela, funcao, contexto, resultado, regras, testes = [] }) {
  validarDecisionTable({ app, contexto, resultado, regras, testes });
  const APP = up(app), DT = up(tabela || `${APP}_DT`.slice(0, 30)), FN = up(funcao || `${APP}_FN`.slice(0, 30));
  const ctx = contexto.map(up), RES = up(resultado);
  const idVar = (e) => `lv_id_${e.toLowerCase()}`;

  const criaElementos = [...ctx.map((e) => `
        cl_fdt_convenience=>create_element( EXPORTING iv_name = '${e}' iv_application_id = lv_app_id
          iv_element_type = if_fdt_constants=>gc_element_type_text iv_activate = abap_false
          IMPORTING ev_element_id = ${idVar(e)} ).
        INSERT ${idVar(e)} INTO TABLE lts_ctx.`),
  `
        cl_fdt_convenience=>create_element( EXPORTING iv_name = '${RES}' iv_application_id = lv_app_id
          iv_element_type = if_fdt_constants=>gc_element_type_text iv_activate = abap_false
          IMPORTING ev_element_id = ${idVar(RES)} ).`].join('');

  const colunas = [...ctx.map((e, i) => `
        ls_col-col_no = ${i + 1}. ls_col-object_id = ${idVar(e)}. ls_col-is_result = abap_false. INSERT ls_col INTO TABLE lts_col.`),
  `
        ls_col-col_no = ${ctx.length + 1}. ls_col-object_id = ${idVar(RES)}. ls_col-is_result = abap_true. INSERT ls_col INTO TABLE lts_col.`].join('');

  const celulas = regras.map((r, ri) => {
    const linhas = ctx.map((e, ci) => {
      const v = Object.entries(r.quando ?? {}).find(([k]) => up(k) === e)?.[1];
      const range = v == null ? '' : `
        ls_range-position = 1. ls_range-sign = if_fdt_range=>gc_sign_include. ls_range-option = if_fdt_range=>gc_option_equal.
        CREATE DATA ls_range-r_low_value TYPE if_fdt_types=>element_text. ASSIGN ls_range-r_low_value->* TO <lv>. <lv> = '${esc(v)}'.
        INSERT ls_range INTO TABLE ls_data-ts_range. CLEAR ls_range.`;
      return `
        ls_data-row_no = ${ri + 1}. ls_data-col_no = ${ci + 1}.${range}
        INSERT ls_data INTO TABLE lts_data. CLEAR ls_data.`;
    }).join('');
    return `${linhas}
        ls_data-row_no = ${ri + 1}. ls_data-col_no = ${ctx.length + 1}.
        CREATE DATA ls_data-r_value TYPE if_fdt_types=>element_text. ASSIGN ls_data-r_value->* TO <lv>. <lv> = '${esc(r.entao)}'.
        INSERT ls_data INTO TABLE lts_data. CLEAR ls_data.`;
  }).join('');

  const roda = testes.map((t, i) => `
        rodar( io_function = lo_function iv_rotulo = '${i + 1}' io_out = out
               it_valores = VALUE ty_t_par(${ctx.map((e) => ` ( id = ${idVar(e)} valor = '${esc(Object.entries(t).find(([k]) => up(k) === e)?.[1] ?? '')}' )`).join('')} ) ).`).join('');

  return `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    TYPES: BEGIN OF ty_par, id TYPE if_fdt_types=>id, valor TYPE string, END OF ty_par,
           ty_t_par TYPE STANDARD TABLE OF ty_par WITH EMPTY KEY.
  PRIVATE SECTION.
    METHODS rodar IMPORTING io_function TYPE REF TO if_fdt_function it_valores TYPE ty_t_par
                            iv_rotulo TYPE string io_out TYPE REF TO if_oo_adt_classrun_out.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA: ${[...ctx, RES].map((e) => `${idVar(e)} TYPE if_fdt_types=>id`).join(', ')}.
    DATA: lts_ctx  TYPE if_fdt_types=>ts_object_id,
          lts_col  TYPE if_fdt_decision_table=>ts_column,
          ls_col   LIKE LINE OF lts_col,
          lts_data TYPE if_fdt_decision_table=>ts_table_data,
          ls_data  TYPE if_fdt_decision_table=>s_table_data,
          ls_range TYPE if_fdt_decision_table=>s_range,
          lt_msg   TYPE if_fdt_types=>t_message,
          lv_failed TYPE abap_bool.
    FIELD-SYMBOLS <lv> TYPE any.
    TRY.
        DATA(lo_app) = cl_fdt_factory=>if_fdt_factory~get_instance( )->get_application( ).
        lo_app->if_fdt_transaction~enqueue( ).
        lo_app->if_fdt_admin_data~set_name( '${APP}' ).
        lo_app->create_local_application( ).
        lo_app->if_fdt_transaction~activate( IMPORTING et_message = lt_msg ev_activation_failed = lv_failed ).
        IF lv_failed = abap_true.
          out->write( |Error: activate da aplicacao falhou| ).
          LOOP AT lt_msg INTO DATA(ls_msg). out->write( ls_msg-text ). ENDLOOP.
          lo_app->if_fdt_transaction~dequeue( ). RETURN.
        ENDIF.
        lo_app->if_fdt_transaction~save( ).
        lo_app->if_fdt_transaction~dequeue( ).
        DATA(lv_app_id) = lo_app->mv_id.
        out->write( |APP_ID={ lv_app_id }| ).

        DATA(lo_factory) = cl_fdt_factory=>if_fdt_factory~get_instance( lv_app_id ).${criaElementos}

        DATA(lo_dt) = CAST if_fdt_decision_table( lo_factory->get_expression( iv_expression_type_id = if_fdt_constants=>gc_exty_decision_table ) ).
        lo_dt->if_fdt_transaction~enqueue( abap_true ).
        lo_dt->if_fdt_admin_data~set_name( '${DT}' ).${colunas}
        lo_dt->set_columns( its_column = lts_col ).

        DATA(lo_function) = lo_factory->get_function( ).
        lo_function->if_fdt_transaction~enqueue( ).
        lo_function->set_context_data_objects( lts_ctx ).
        lo_function->if_fdt_admin_data~set_name( '${FN}' ).
        lo_function->set_expression( lo_dt->mv_id ).${celulas}
        lo_dt->set_table_data( its_data = lts_data ).

        lo_function->if_fdt_transaction~activate( EXPORTING iv_deep = abap_true
                                                  IMPORTING et_message = lt_msg ev_activation_failed = lv_failed ).
        IF lv_failed = abap_true.
          out->write( |Error: activate deep falhou| ).
          LOOP AT lt_msg INTO ls_msg. out->write( ls_msg-text ). ENDLOOP.
          lo_function->if_fdt_transaction~dequeue( iv_deep = abap_true ). RETURN.
        ENDIF.
        lo_function->if_fdt_transaction~save( iv_deep = abap_true ).
        lo_function->if_fdt_transaction~dequeue( iv_deep = abap_true ).
        out->write( |DT_ID={ lo_dt->mv_id }| ).
        out->write( |FUNC_ID={ lo_function->mv_id }| ).${roda}
        out->write( 'FIM_OK' ).
      CATCH cx_fdt INTO DATA(lx).
        out->write( |Error: cx_fdt| ).
        LOOP AT lx->mt_message INTO DATA(ls_m2). out->write( ls_m2-text ). ENDLOOP.
    ENDTRY.
  ENDMETHOD.
  METHOD rodar.
    DATA lo_result TYPE REF TO if_fdt_result.
    DATA lr_data TYPE REF TO data.
    FIELD-SYMBOLS <lv_res> TYPE any.
    TRY.
        DATA(lo_ctx) = io_function->get_process_context( ).
        LOOP AT it_valores INTO DATA(ls_par).
          lo_ctx->set_value( iv_id = ls_par-id ia_value = ls_par-valor ).
        ENDLOOP.
        io_function->process( EXPORTING io_context = lo_ctx IMPORTING eo_result = lo_result ).
        IF lo_result IS BOUND.
          DATA(lo_do) = lo_result->get_data_object( ).
          lo_do->create_data_reference( IMPORTING er_data = lr_data ).
          ASSIGN lr_data->* TO <lv_res>.
          lo_result->get_value( IMPORTING ea_value = <lv_res> ).
          io_out->write( |RESULT_{ iv_rotulo }={ <lv_res> }| ).
        ELSE.
          io_out->write( |RESULT_{ iv_rotulo }=SEM_RESULTADO| ).
        ENDIF.
      CATCH cx_fdt INTO DATA(lx).
        io_out->write( |RESULT_{ iv_rotulo }=SEM_CONCORDANCIA| ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.`;
}

/** A saída do driver → { appId, dtId, funcId, resultados: { rotulo: valor }, fim }. Puro. */
export function parseSaidaBrf(saida) {
  const s = String(saida ?? '');
  const pega = (re) => (s.match(re) || [])[1] ?? null;
  const resultados = {};
  for (const [, rotulo, valor] of s.matchAll(/^RESULT_([A-Z0-9_]+)=(.*)$/gm)) resultados[rotulo] = valor.trim();
  return { appId: pega(/^APP_ID=(\w+)/m), dtId: pega(/^DT_ID=(\w+)/m), funcId: pega(/^FUNC_ID=(\w+)/m), resultados, fim: /^FIM_OK$/m.test(s) };
}

// ---------- achar por nome / executar função existente ----------

/** Fonte: acha a FUNÇÃO por nome (if_fdt_query), monta o contexto por NOME dos elementos e processa. Puro. */
export function buildRunFunctionSource(name, { funcao, valores }) {
  assertNomeFdt(funcao, 'função');
  const F = up(funcao);
  const pares = Object.entries(valores ?? {});
  if (!pares.length) throw new Error('valores: informe { NOME_ELEMENTO: "valor", … }');
  const setValores = pares.map(([k, v]) => `
        seta( io_ctx = lo_ctx it_ctx = lt_ctx iv_nome = '${up(k)}' iv_valor = '${esc(v)}' io_out = out ).`).join('');
  return `CLASS ${String(name).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
    METHODS seta IMPORTING io_ctx TYPE REF TO if_fdt_context it_ctx TYPE if_fdt_types=>ts_object_id
                           iv_nome TYPE if_fdt_types=>name iv_valor TYPE string io_out TYPE REF TO if_oo_adt_classrun_out.
ENDCLASS.
CLASS ${String(name).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA: lts_sel TYPE if_fdt_query=>ts_selection, ls_sel LIKE LINE OF lts_sel,
          ls_cat  TYPE if_fdt_query=>s_object_category_sel,
          lts_nome TYPE if_fdt_query=>ts_name,
          lr_data TYPE REF TO data.
    DATA lo_result TYPE REF TO if_fdt_result.
    FIELD-SYMBOLS <lv_res> TYPE any.
    TRY.
        DATA(lo_query) = cl_fdt_factory=>if_fdt_factory~get_instance( )->get_query( iv_object_type = if_fdt_constants=>gc_object_type_function ).
        ls_sel-queryfield = if_fdt_admin_data_query=>gc_fn_name. ls_sel-sign = 'I'. ls_sel-option = 'EQ'. ls_sel-low = '${F}'.
        INSERT ls_sel INTO TABLE lts_sel.
        ls_cat-system_objects = abap_true. ls_cat-customizing_objects = abap_true. ls_cat-masterdata_objects = abap_true.
        lo_query->select_data( EXPORTING is_object_category_sel = ls_cat its_selection = lts_sel IMPORTING eta_data = lts_nome ).
        IF lines( lts_nome ) <> 1.
          out->write( |Error: funcao ${F} — { lines( lts_nome ) } resultado(s) na query| ). RETURN.
        ENDIF.
        DATA(lo_function) = CAST if_fdt_function( cl_fdt_factory=>if_fdt_factory~get_instance( )->get_function( lts_nome[ 1 ]-id ) ).
        out->write( |FUNC_ID={ lo_function->mv_id }| ).
        DATA(lt_ctx) = lo_function->get_context_data_objects( ).
        DATA(lo_ctx) = lo_function->get_process_context( ).${setValores}
        lo_function->process( EXPORTING io_context = lo_ctx IMPORTING eo_result = lo_result ).
        IF lo_result IS BOUND.
          DATA(lo_do) = lo_result->get_data_object( ).
          lo_do->create_data_reference( IMPORTING er_data = lr_data ).
          ASSIGN lr_data->* TO <lv_res>.
          lo_result->get_value( IMPORTING ea_value = <lv_res> ).
          out->write( |RESULT_X={ <lv_res> }| ).
        ELSE.
          out->write( |RESULT_X=SEM_RESULTADO| ).
        ENDIF.
        out->write( 'FIM_OK' ).
      CATCH cx_fdt INTO DATA(lx).
        out->write( |Error: cx_fdt { lx->get_text( ) }| ).
    ENDTRY.
  ENDMETHOD.
  METHOD seta.
    LOOP AT it_ctx INTO DATA(lv_id).
      IF cl_fdt_convenience=>get_name( iv_id = lv_id ) = iv_nome.
        io_ctx->set_value( iv_id = lv_id ia_value = iv_valor ).
        RETURN.
      ENDIF.
    ENDLOOP.
    io_out->write( |Error: elemento { iv_nome } nao esta no contexto da funcao| ).
  ENDMETHOD.
ENDCLASS.`;
}

/** Fonte: acha a APLICAÇÃO por nome e apaga com tudo dentro (delete_incl_assigned_object). Puro. */
export function buildDeleteAppSource(name, { app }) {
  assertZY(app); assertNomeFdt(app, 'aplicação');
  const APP = up(app);
  return `${HEAD(name)}
    DATA: lts_sel TYPE if_fdt_query=>ts_selection, ls_sel LIKE LINE OF lts_sel,
          ls_cat  TYPE if_fdt_query=>s_object_category_sel,
          lts_nome TYPE if_fdt_query=>ts_name,
          lt_msg  TYPE if_fdt_types=>t_message,
          lv_failed TYPE abap_bool.
    TRY.
        DATA(lo_query) = cl_fdt_factory=>if_fdt_factory~get_instance( )->get_query( iv_object_type = if_fdt_constants=>gc_object_type_application ).
        ls_sel-queryfield = if_fdt_admin_data_query=>gc_fn_name. ls_sel-sign = 'I'. ls_sel-option = 'EQ'. ls_sel-low = '${APP}'.
        INSERT ls_sel INTO TABLE lts_sel.
        ls_cat-system_objects = abap_true. ls_cat-customizing_objects = abap_true. ls_cat-masterdata_objects = abap_true.
        lo_query->select_data( EXPORTING is_object_category_sel = ls_cat its_selection = lts_sel IMPORTING eta_data = lts_nome ).
        IF lines( lts_nome ) <> 1.
          out->write( |Error: app ${APP} — { lines( lts_nome ) } resultado(s) na query| ). RETURN.
        ENDIF.
        DATA(lo_app) = CAST if_fdt_application( cl_fdt_factory=>if_fdt_factory~get_instance( )->get_application( lts_nome[ 1 ]-id ) ).
        lo_app->if_fdt_transaction~enqueue( ).
        lo_app->delete_incl_assigned_object(
          EXPORTING iv_delete_option = if_fdt_application=>gc_delete_option_del_or_mark
          IMPORTING et_message = lt_msg ev_failure = lv_failed ).
        IF lv_failed = abap_true.
          out->write( |Error: delete falhou| ).
          LOOP AT lt_msg INTO DATA(ls_m). out->write( ls_m-text ). ENDLOOP.
          lo_app->if_fdt_transaction~dequeue( ). RETURN.
        ENDIF.
        out->write( |DELETE_OK={ lo_app->mv_id }| ).
      CATCH cx_fdt INTO DATA(lx).
        out->write( |Error: cx_fdt { lx->get_text( ) }| ).
    ENDTRY.
${TAIL}`;
}

// ---------- orquestradores ----------

async function rodarDriver(conexao, { driver, source, descricao, keepDriver }) {
  let r;
  try {
    r = await deployAndRun(conexao, { name: driver, source, description: descricao });
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
  if (!r.ok) throw new Error(`driver ${driver}: ${r.erro?.slice(0, 600)}`);
  return r;
}

/**
 * Cria aplicação LOCAL + decision table + função no sistema e roda os `testes`. Sem TR, sem workbench.
 * Devolve { appId, dtId, funcId, resultados } — `resultados` indexado pelo número do teste (1, 2…),
 * `SEM_CONCORDANCIA` quando nenhuma linha casa.
 */
export async function deployDecisionTable(conexao, { app, driver = driverDe('Y_BRF_', app), keepDriver = false, ...spec }) {
  passo(`brf: decision table em ${up(app)}`);
  const source = buildDecisionTableSource(driver, { app, ...spec });
  const r = await rodarDriver(conexao, { driver, source, descricao: `driver: BRF+ DT ${up(app)}`.slice(0, 60), keepDriver });
  const p = parseSaidaBrf(r.saida);
  if (!p.fim || !p.appId) throw new Error(`brf ${up(app)}: driver terminou sem FIM_OK/APP_ID — saída: ${r.saida.slice(0, 400)}`);
  detalhe(`app ${p.appId} · dt ${p.dtId} · função ${p.funcId} · ${Object.keys(p.resultados).length} teste(s)`);
  return p;
}

/** Executa uma função BRF+ EXISTENTE (por nome) com `valores` por nome de elemento. Devolve { funcId, resultado }. */
export async function executarFuncao(conexao, { funcao, valores, driver = driverDe('Y_BRFX_', funcao), keepDriver = false }) {
  passo(`brf: executar ${up(funcao)}`);
  const source = buildRunFunctionSource(driver, { funcao, valores });
  const r = await rodarDriver(conexao, { driver, source, descricao: `driver: executa BRF+ ${up(funcao)}`.slice(0, 60), keepDriver });
  const p = parseSaidaBrf(r.saida);
  if (!p.fim) throw new Error(`brf ${up(funcao)}: driver terminou sem FIM_OK — saída: ${r.saida.slice(0, 400)}`);
  return { funcId: p.funcId, resultado: p.resultados.X ?? null };
}

/**
 * Apaga a aplicação (por nome) COM tudo dentro. Destrutivo: exige `confirm: true`.
 * Em app local com versões o delete é LÓGICO (DELETED='X') — devolve { deletado: 'logico', appId }.
 */
export async function deleteAplicacao(conexao, { app, confirm = false, driver = driverDe('Y_BRFD_', app), keepDriver = false }) {
  if (!confirm) throw new Error(`deleteAplicacao ${up(app)}: destrutivo — chame com { confirm: true }`);
  passo(`brf: apagar aplicação ${up(app)}`);
  const source = buildDeleteAppSource(driver, { app });
  const r = await rodarDriver(conexao, { driver, source, descricao: `driver: apaga BRF+ ${up(app)}`.slice(0, 60), keepDriver });
  const appId = (r.saida.match(/^DELETE_OK=(\w+)/m) || [])[1];
  if (!appId) throw new Error(`brf ${up(app)}: delete sem DELETE_OK — saída: ${r.saida.slice(0, 400)}`);
  return { deletado: 'logico', appId };
}
