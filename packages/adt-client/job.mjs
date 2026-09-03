// job.mjs — Application Job (SAJC + SAJT): o TEMPLATE e o CICLO DE EXECUÇÃO, por driver classrun.
//
// A divisão é a que o próprio SAP impõe, e é o que justifica este arquivo ao lado do tipo:
//   • a ENTRADA DE CATÁLOGO (R3TR SAJC, a linha da APJ_W_JCE_ROOT) é objeto de repositório e sai por
//     ADT REST — `tipos/applicationJobCatalog.mjs`, `deploy(conexao, 'applicationJobCatalog', …)`;
//   • o TEMPLATE (R3TR SAJT) **não sai por ADT REST**: o POST da coleção `applicationjob/templates`
//     responde 500 "Anular referência da referência NULL" (sem dump ST22) e não cria nada — em v1 e
//     v2, com version inactive/active/ausente e com `relatedObjectUri`. A via é a API de design time
//     que a própria SAP documenta no cabeçalho de `CL_APJ_DT_CREATE_CONTENT` (com exemplo em
//     classrun, inclusive) — `create_job_template_entry` / `delete_job_*` / `exists_job_*`;
//   • o AGENDAMENTO e o STATUS são runtime, não repositório: `CL_APJ_RT_API` (`SCHEDULE_JOB`,
//     `GET_JOB_STATUS`, `GET_JOB_DETAILS`, `CANCEL_JOB`). Nenhuma das duas classes é RFC — o canal
//     é classrun.
//
// Medido 2026-09-01, S4H 758 (docs/receita-application-job.md):
//   • `create_job_template_entry` aceita `iv_transport_request = ''` com `iv_package = '$TMP'` — o
//     objeto local não pede ordem;
//   • o parâmetro do template é `IF_APJ_DT_EXEC_OBJECT=>TT_TEMPL_VAL` (selname/kind/sign/option/
//     low/high) — o mesmo tipo que a classe executora declara em GET_PARAMETERS, e não um par
//     nome/valor solto;
//   • `SCHEDULE_JOB` devolve a chave (jobname, jobcount) e o job roda em OUTRA LUW: a prova é
//     readTable do que o executor gravou + o log de aplicação (bal.mjs);
//   • o job só termina depois; por isso `esperarJob` faz o poll DENTRO de um driver (WAIT UP TO),
//     em vez de criar e apagar uma classe por sondagem.

import { deleteObject } from './adt-client.mjs';
import { deployAndRun } from './classrun.mjs';

const esc = (v) => String(v ?? '').replace(/'/g, "''");
const up = (v) => String(v ?? '').toUpperCase();

/** Status do job (BTCSTATUS), como o GET_JOB_STATUS devolve. */
export const STATUS = Object.freeze({
  P: 'planejado', S: 'liberado', Y: 'pronto', R: 'em execução', F: 'terminado', A: 'cancelado', X: 'suspenso',
});
/** Terminais: não adianta esperar mais. */
export const STATUS_FINAL = Object.freeze(['F', 'A']);

const HEAD = (driver) => `CLASS ${String(driver).toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${String(driver).toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.`;
const TAIL = '  ENDMETHOD.\nENDCLASS.';

/**
 * PURO: confere um parâmetro de template antes de qualquer rede.
 * `nome` é o `selname` da classe executora — CHAR 8 (IF_APJ_DT_EXEC_OBJECT=>ty_templ_val-selname).
 */
export function validarParametro({ nome, valor, ate, sinal = 'I', operador = 'EQ', tipo = 'P' } = {}) {
  if (!nome) throw new Error('parâmetro do job exige { nome } (o selname da classe executora, CHAR 8)');
  if (String(nome).length > 8) throw new Error(`parâmetro "${nome}": o selname tem no máximo 8 caracteres (ty_templ_val-selname)`);
  if (!['P', 'S'].includes(up(tipo))) throw new Error(`parâmetro "${nome}": tipo "${tipo}" inválido — P (parameter) ou S (select-option)`);
  if (!['I', 'E'].includes(up(sinal))) throw new Error(`parâmetro "${nome}": sinal "${sinal}" inválido — I (include) ou E (exclude)`);
  if (String(valor ?? '').length > 255 || String(ate ?? '').length > 255) {
    throw new Error(`parâmetro "${nome}": valor/ate têm no máximo 255 caracteres (RVARI_VAL_255)`);
  }
  return { nome: up(nome), valor: valor ?? '', ate: ate ?? '', sinal: up(sinal), operador: up(operador), tipo: up(tipo) };
}

const linhaTemplVal = (p) => {
  const v = validarParametro(p);
  return `( selname = '${esc(v.nome)}' kind = '${v.tipo}' sign = '${v.sinal}' option = '${esc(v.operador)}' low = '${esc(v.valor)}' high = '${esc(v.ate)}' )`;
};
const linhaJobParam = (p) => {
  const v = validarParametro(p);
  return `( name = '${esc(v.nome)}' t_value = VALUE #( ( sign = '${v.sinal}' option = '${esc(v.operador)}' low = '${esc(v.valor)}' high = '${esc(v.ate)}' ) ) )`;
};

// ---------------------------------------------------------------------------------------------
// design time: o template

/**
 * PURO: driver que cria o template pela API de design time da SAP (CL_APJ_DT_CREATE_CONTENT).
 * `substituir` apaga o template existente antes — o create NÃO é idempotente (devolve
 * "O objeto … já existe"), e a própria SAP manda recriar template e catálogo sempre que a
 * assinatura de `GET_PARAMETERS` muda na classe executora.
 */
export function buildTemplateSource(driver, { template, catalogo, texto, parametros = [], pacote = '$TMP', corrNr = '', substituir = false }) {
  const params = parametros.length ? `VALUE #( ${parametros.map(linhaTemplVal).join(' ')} )` : 'VALUE #( )';
  const antes = substituir ? `    IF cl_apj_dt_create_content=>exists_job_template_entry( '${esc(up(template))}' ) <> 'N'.
      TRY.
          DATA(lv_del) = lo->delete_job_template_entry( iv_template_name = '${esc(up(template))}' iv_transport_request = '${esc(corrNr)}' ).
          out->write( |DELETE template_name=${esc(up(template))} ok={ lv_del }| ).
        CATCH cx_apj_dt_content INTO DATA(lx_del).
          out->write( |PREVIO: { lx_del->get_text( ) }| ).
      ENDTRY.
      CALL FUNCTION 'TR_TADIR_INTERFACE'
        EXPORTING wi_delete_tadir_entry = 'X' wi_test_modus = space
                  wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'SAJT' wi_tadir_obj_name = '${esc(up(template))}'
        EXCEPTIONS OTHERS = 1.
      out->write( |TADIR_DELETE SAJT ${esc(up(template))} subrc={ sy-subrc }| ).
      COMMIT WORK AND WAIT.
    ENDIF.
` : '';
  return `${HEAD(driver)}
    DATA(lo) = cl_apj_dt_create_content=>get_instance( ).
${antes}
    out->write( |EXISTS cat=${esc(up(catalogo))} { cl_apj_dt_create_content=>exists_job_cat_entry( '${esc(up(catalogo))}' ) }| ).
    TRY.
        DATA(lv_ok) = lo->create_job_template_entry(
          iv_template_name     = '${esc(up(template))}'
          iv_catalog_name      = '${esc(up(catalogo))}'
          iv_text              = '${esc(texto)}'
          it_parameters        = ${params}
          iv_transport_request = '${esc(corrNr)}'
          iv_package           = '${esc(up(pacote))}' ).
        out->write( |CREATE tmpl ok={ lv_ok }| ).
      CATCH cx_apj_dt_content INTO DATA(lx).
        out->write( |Error: { lx->get_text( ) } / { lx->get_longtext( ) }| ).
    ENDTRY.
    " A TADIR o create NÃO grava — e sem ela o DELETE quebra: delete_job_template_entry chama
    " TR_TADIR_INTERFACE para descobrir a devclass e o FM responde "Indicar pacote para R3TR SAJT".
    DATA lv_msg TYPE string.
    CALL FUNCTION 'TR_TADIR_INTERFACE'
      EXPORTING wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'SAJT' wi_tadir_obj_name = '${esc(up(template))}'
                wi_tadir_devclass = '${esc(up(pacote))}' wi_tadir_korrnum = '${esc(corrNr)}' wi_test_modus = space
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0. MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg. ENDIF.
    out->write( |TADIR tmpl subrc={ sy-subrc } { lv_msg }| ).
    COMMIT WORK AND WAIT.
    out->write( |EXISTS tmpl=${esc(up(template))} { cl_apj_dt_create_content=>exists_job_template_entry( '${esc(up(template))}' ) }| ).
${TAIL}`;
}

/** PURO: driver que apaga template e/ou entrada de catálogo (nessa ordem — o template refere o catálogo). */
export function buildApagarSource(driver, { template = null, catalogo = null, corrNr = '' }) {
  if (!template && !catalogo) throw new Error('buildApagarSource: informe { template } e/ou { catalogo }');
  const bloco = (metodo, param, nome) => `    TRY.
        DATA(lv_${param}) = lo->${metodo}( iv_${param} = '${esc(up(nome))}' iv_transport_request = '${esc(corrNr)}' ).
        out->write( |DELETE ${param}=${esc(up(nome))} ok={ lv_${param} }| ).
      CATCH cx_apj_dt_content INTO DATA(lx_${param}).
        out->write( |Error: ${param}: { lx_${param}->get_text( ) }| ).
    ENDTRY.`;
  // Depois do delete, a linha da TADIR SOBRA (medido: o `exists_*` passa a devolver 'I',
  // inconsistente). Quem a criou foi o `deployJobTemplate`, porque sem ela o próprio delete quebra.
  const tadirFora = (obj, nome) => `    CALL FUNCTION 'TR_TADIR_INTERFACE'
      EXPORTING wi_delete_tadir_entry = 'X' wi_test_modus = space
                wi_tadir_pgmid = 'R3TR' wi_tadir_object = '${obj}' wi_tadir_obj_name = '${esc(up(nome))}'
      EXCEPTIONS OTHERS = 1.
    out->write( |TADIR_DELETE ${obj} ${esc(up(nome))} subrc={ sy-subrc }| ).
    COMMIT WORK AND WAIT.`;
  const partes = [];
  if (template) partes.push(bloco('delete_job_template_entry', 'template_name', template), tadirFora('SAJT', template));
  if (catalogo) partes.push(bloco('delete_job_cat_entry', 'catalog_name', catalogo), tadirFora('SAJC', catalogo));
  const existe = [
    template ? `    out->write( |EXISTS tmpl=${esc(up(template))} { cl_apj_dt_create_content=>exists_job_template_entry( '${esc(up(template))}' ) }| ).` : '',
    catalogo ? `    out->write( |EXISTS cat=${esc(up(catalogo))} { cl_apj_dt_create_content=>exists_job_cat_entry( '${esc(up(catalogo))}' ) }| ).` : '',
  ].filter(Boolean).join('\n');
  return `${HEAD(driver)}
    DATA(lo) = cl_apj_dt_create_content=>get_instance( ).
${partes.join('\n')}
${existe}
${TAIL}`;
}

/** PURO: driver só de consulta — existe o catálogo? existe o template? (Y/N/D/I) */
export function buildExisteSource(driver, { template = null, catalogo = null }) {
  const linhas = [
    catalogo ? `    out->write( |EXISTS cat=${esc(up(catalogo))} { cl_apj_dt_create_content=>exists_job_cat_entry( '${esc(up(catalogo))}' ) }| ).` : '',
    template ? `    out->write( |EXISTS tmpl=${esc(up(template))} { cl_apj_dt_create_content=>exists_job_template_entry( '${esc(up(template))}' ) }| ).` : '',
  ].filter(Boolean);
  if (!linhas.length) throw new Error('buildExisteSource: informe { template } e/ou { catalogo }');
  return `${HEAD(driver)}\n${linhas.join('\n')}\n${TAIL}`;
}

/**
 * PURO: lê a saída dos drivers de design time.
 * `EXISTS cat=X Y` → `existe.cat = 'Y'` (Y existe · N não · D apagado sem transporte · I inconsistente).
 */
export function parseSaidaDt(saida) {
  const txt = String(saida ?? '');
  const existe = {};
  for (const m of txt.matchAll(/EXISTS (cat|tmpl)=(\S+) (\w)/g)) existe[m[1]] = { nome: m[2], estado: m[3] };
  const criados = [...txt.matchAll(/CREATE (\w+) ok=(\S)/g)].map((m) => ({ o: m[1], ok: m[2] === 'X' }));
  const tadir = txt.match(/TADIR tmpl subrc=(\d+)/);
  const apagados = [...txt.matchAll(/DELETE (\w+)=(\S+) ok=(\S)/g)].map((m) => ({ o: m[1], nome: m[2], ok: m[3] === 'X' }));
  const tadirFora = [...txt.matchAll(/TADIR_DELETE (\w+) (\S+) subrc=(\d+)/g)].map((m) => ({ objeto: m[1], nome: m[2], subrc: Number(m[3]) }));
  const erro = txt.match(/Error:\s*(.+)/)?.[1]?.trim() ?? null;
  return { existe, criados, apagados, tadir: tadir ? { subrc: Number(tadir[1]) } : null, tadirFora, erro, ok: !erro };
}

// ---------------------------------------------------------------------------------------------
// runtime: agendar, esperar, cancelar

// Application Job PERIÓDICO — item 69, I72: o `is_scheduling_info`/`is_end_info` que o item 47
// deixou de fora (a POC mediu só `start_immediately`). Os tipos vêm de `CL_APJ_RT_API` (lidos por
// leitura de fonte no s4h, 2026-09-02): `ty_scheduling_info` tem `periodic_granularity` (domínio
// CHAR2: MI/H/D/W/MO/WM) + `periodic_value` (INT2) + `timezone`, e só W/MO/WM entram na lógica de
// calendário do `__adjust` (`weekday_info`/`month_info`/`exception`, com `ASSERT is_weekday_info IS
// NOT INITIAL` para W) — MI/H/D não tocam essa lógica: o horário de início já vem pronto de
// `is_start_info-timestamp`. Por isso o escopo aqui é só granularidade **plana** (minutos/horas/
// dias, o caso "roda toda madrugada"); semanas/meses ficam de fora até medir a exigência de
// calendário/weekday_info (I72 anotou como não medido). `ty_end_info` é `{ type: ''|NUM|DATE,
// timestamp, max_iterations }` — sem `fim`, o job repete para sempre.
//
// ⚠️ PONTO ABERTO medido 2026-09-02, S4H 758: o `timestamp` de `is_start_info` (agendamento não
// imediato — periódico OU único) **não é passthrough de UTC**, ao contrário do que o comentário
// original deste módulo assumia (herdado do item 47, que só mediu `start_immediately`).
// `SCHEDULE_JOB` chama `CL_APJ_FW_UTILITIES=>CONVERT_USER_TO_SYSTEM_TSTMP`, e o valor gravado em
// `TBTCO-SDLSTRTDT/SDLSTRTTM` é sempre o `timestamp` enviado **+2 horas** — o mesmo "fuso torto"
// que `dumps.mjs` já tinha medido para o `SNAP` (`systemTime` local ≠ `datetime` UTC por +2h),
// não o fuso da sessão interativa (`sy-zonlo = BRAZIL`, UTC-3). Três agendamentos comparados (um
// cru, um compensado em -2h, e um NÃO periódico isolando a periodicidade fora da equação) foram
// gravados de formas diferentes na TBTCO mas **nenhum saiu do status `S` (liberado) em até 4
// minutos de observação** — ou seja, o desvio de +2h na gravação não é, sozinho, o que explica
// quando o job dispara de verdade; o relógio que o DISPATCHER usa para comparar não foi
// identificado. Não dá para afirmar que o agendamento por `timestamp` (periódico ou não) funciona
// fim a fim neste sistema — só que a chamada é aceita sem erro e a granularidade/periodicidade
// É gravada corretamente (`PERIODIC='X'`, `PRDMINS` = `periodic_value`). Quem depender de disparo
// por horário tem de medir o atraso real neste sistema antes de confiar nele.
const GRANULARIDADE_PERIODICA = Object.freeze({ minutos: 'MI', horas: 'H', dias: 'D' });

/**
 * PURO: valida `periodicidade` e devolve as linhas ABAP que preenchem `ls_sched` antes do
 * `schedule_job`. Granularidade fora de minutos/horas/dias é recusada — precisa de weekday_info/
 * month_info/exception (calendário de fábrica), que não foram medidos ainda (I72).
 */
function linhasSchedulingInfo(p) {
  const codigo = GRANULARIDADE_PERIODICA[p?.granularidade];
  if (!codigo) throw new Error(`periodicidade.granularidade "${p?.granularidade}" inválida — use minutos/horas/dias (semanas/meses exigem weekday_info/month_info, não medido — I72)`);
  if (!(Number(p.valor) > 0)) throw new Error('periodicidade.valor deve ser um número > 0 (a cada quantas unidades da granularidade)');
  const linhas = [
    `    ls_sched-periodic_granularity = '${codigo}'.`,
    `    ls_sched-periodic_value = ${Number(p.valor)}.`,
  ];
  if (p.timezone) linhas.push(`    ls_sched-timezone = '${esc(up(p.timezone))}'.`);
  return linhas.join('\n');
}

/**
 * PURO: valida `fim` e devolve as linhas ABAP de `ls_end` — `quantidade` (NUM, `max_iterations`)
 * OU `ate` (DATE, `timestamp` AAAAMMDDHHMMSS UTC), nunca os dois.
 */
function linhasEndInfo(f) {
  if (f.quantidade != null && f.ate != null) throw new Error('fim: informe { quantidade } OU { ate }, não os dois — são os dois tipos de TY_END_INFO-TYPE (NUM/DATE).');
  if (f.quantidade != null) {
    if (!(Number(f.quantidade) > 0)) throw new Error('fim.quantidade deve ser um número > 0 (TY_END_INFO-MAX_ITERATIONS)');
    return `    ls_end-type = 'NUM'.\n    ls_end-max_iterations = ${Number(f.quantidade)}.`;
  }
  if (f.ate != null) return `    ls_end-type = 'DATE'.\n    ls_end-timestamp = '${esc(f.ate)}'.`;
  throw new Error('fim: informe { quantidade } (nº de execuções) ou { ate } (timestamp AAAAMMDDHHMMSS UTC)');
}

/**
 * PURO: driver que agenda o job a partir do template (CL_APJ_RT_API=>SCHEDULE_JOB).
 * `imediato` (default) roda já — é o ÚNICO modo com disparo confirmado de ponta a ponta.
 * `timestamp` (AAAAMMDDHHMMSS) agenda para depois, mas ⚠️ o valor real de disparo não é
 * confirmado neste sistema — ver o achado no bloco de comentário acima de `GRANULARIDADE_PERIODICA`
 * (a gravação em TBTCO soma +2h ao valor enviado, e mesmo assim o job não saiu de status `S` em
 * até 4 minutos de observação; o relógio do dispatcher não foi identificado).
 * `periodicidade` ({ granularidade: 'minutos'|'horas'|'dias', valor, timezone }) e `fim`
 * ({ quantidade } ou { ate }) pedem `imediato:false` + `timestamp` — a própria SAP ignora a
 * periodicidade em silêncio quando `start_immediately = 'X'` (medido no fonte de
 * `CL_APJ_RT_JOB_SCHEDULING_API`: o tipo vira sempre `immediately`), e aqui isso é recusado antes
 * da rede em vez de agendar um job único calado.
 */
export function buildAgendarSource(driver, { template, texto, parametros = [], imediato = true, timestamp = null, usuario = null, periodicidade = null, fim = null }) {
  if (!template) throw new Error('buildAgendarSource: exige { template }');
  if ((periodicidade || fim) && (imediato || !timestamp)) {
    throw new Error('buildAgendarSource: job periódico (periodicidade/fim) exige { imediato: false, timestamp } — a SAP ignora a periodicidade em silêncio se start_immediately = X.');
  }
  const params = parametros.length
    ? `        it_job_parameter_value = VALUE #( ${parametros.map(linhaJobParam).join(' ')} )\n`
    : '';
  const start = imediato && !timestamp
    ? '    ls_start-start_immediately = abap_true.'
    : `    ls_start-timestamp = '${esc(timestamp)}'.`;
  const sched = periodicidade ? `    DATA ls_sched TYPE cl_apj_rt_api=>ty_scheduling_info.\n${linhasSchedulingInfo(periodicidade)}\n` : '';
  const end = fim ? `    DATA ls_end TYPE cl_apj_rt_api=>ty_end_info.\n${linhasEndInfo(fim)}\n` : '';
  return `${HEAD(driver)}
    DATA lv_jobname TYPE btcjob.
    DATA lv_jobcount TYPE btcjobcnt.
    DATA ls_start TYPE cl_apj_rt_api=>ty_start_info.
${start}
${sched}${end}    TRY.
        cl_apj_rt_api=>schedule_job(
          EXPORTING
            iv_job_template_name = '${esc(up(template))}'
            iv_job_text          = '${esc(texto ?? up(template))}'
            is_start_info        = ls_start
${usuario ? `            iv_username          = '${esc(up(usuario))}'\n` : ''}${periodicidade ? '            is_scheduling_info   = ls_sched\n' : ''}${fim ? '            is_end_info          = ls_end\n' : ''}${params}          IMPORTING
            ev_jobname           = lv_jobname
            ev_jobcount          = lv_jobcount ).
        out->write( |AGENDADO jobname={ lv_jobname } jobcount={ lv_jobcount }| ).
      CATCH cx_apj_rt INTO DATA(lx).
        out->write( |Error: { lx->get_text( ) }| ).
    ENDTRY.
${TAIL}`;
}

/**
 * PURO: driver que consulta o status; com `esperarAte > 0`, faz o POLL DENTRO do ABAP
 * (WAIT UP TO … SECONDS) até um status final (F/A) ou o limite — uma classe, uma execução.
 */
export function buildStatusSource(driver, { jobname, jobcount, esperarAte = 0, intervalo = 2 }) {
  if (!jobname || !jobcount) throw new Error('buildStatusSource: exige { jobname, jobcount }');
  const corpo = `        cl_apj_rt_api=>get_job_status(
          EXPORTING iv_jobname = lv_jobname iv_jobcount = lv_jobcount
          IMPORTING ev_job_status = lv_status ev_job_status_text = lv_texto ).`;
  const laco = esperarAte > 0 ? `
    DATA(lv_tentativas) = ${Math.max(1, Math.ceil(esperarAte / Math.max(1, intervalo)))}.
    DO lv_tentativas TIMES.
      TRY.
${corpo}
        CATCH cx_apj_rt INTO DATA(lx1).
          out->write( |Error: { lx1->get_text( ) }| ).
          EXIT.
      ENDTRY.
      IF lv_status = 'F' OR lv_status = 'A'.
        EXIT.
      ENDIF.
      WAIT UP TO ${Math.max(1, intervalo)} SECONDS.
    ENDDO.` : `
    TRY.
${corpo}
      CATCH cx_apj_rt INTO DATA(lx1).
        out->write( |Error: { lx1->get_text( ) }| ).
    ENDTRY.`;
  return `${HEAD(driver)}
    DATA(lv_jobname) = CONV btcjob( '${esc(jobname)}' ).
    DATA(lv_jobcount) = CONV btcjobcnt( '${esc(jobcount)}' ).
    DATA lv_status TYPE btcstatus.
    DATA lv_texto TYPE char30.
${laco}
    out->write( |STATUS { lv_status } texto={ lv_texto }| ).
    TRY.
        DATA(ls_det) = cl_apj_rt_api=>get_job_details( iv_jobname = lv_jobname iv_jobcount = lv_jobcount ).
        out->write( |DETALHE cat={ ls_det-catalog } tmpl={ ls_det-template } log={ ls_det-logstatus } inicio={ ls_det-started_at } fim={ ls_det-ended_at }| ).
      CATCH cx_apj_rt INTO DATA(lx2).
        out->write( |Error: detalhe: { lx2->get_text( ) }| ).
    ENDTRY.
${TAIL}`;
}

/**
 * PURO: driver que lê o LOG DO JOB (o da SM37, não o de aplicação) por `BP_JOBLOG_READ`.
 * É o único lugar onde aparece a exceção que derrubou o executor: um job que aborta ANTES de
 * escrever no log de aplicação não deixa nada no BAL e nem sempre deixa dump na ST22.
 */
export function buildJobLogSource(driver, { jobname, jobcount }) {
  if (!jobname || !jobcount) throw new Error('buildJobLogSource: exige { jobname, jobcount }');
  return `${HEAD(driver)}
    DATA lt_log TYPE TABLE OF tbtc5.
    CALL FUNCTION 'BP_JOBLOG_READ'
      EXPORTING jobcount = '${esc(jobcount)}' jobname = '${esc(jobname)}'
      TABLES joblogtbl = lt_log
      EXCEPTIONS OTHERS = 1.
    out->write( |JOBLOG subrc={ sy-subrc } linhas={ lines( lt_log ) }| ).
    LOOP AT lt_log INTO DATA(ls).
      out->write( |LOG { ls-msgid }{ ls-msgno } { ls-text }| ).
    ENDLOOP.
${TAIL}`;
}

/** PURO: driver que cancela (ou apaga, conforme o status) o job. */
export function buildCancelarSource(driver, { jobname, jobcount }) {
  if (!jobname || !jobcount) throw new Error('buildCancelarSource: exige { jobname, jobcount }');
  return `${HEAD(driver)}
    TRY.
        cl_apj_rt_api=>cancel_job( iv_jobname = '${esc(jobname)}' iv_jobcount = '${esc(jobcount)}' ).
        out->write( |CANCELADO ${esc(jobname)}/${esc(jobcount)}| ).
      CATCH cx_apj_rt INTO DATA(lx).
        out->write( |Error: { lx->get_text( ) }| ).
    ENDTRY.
${TAIL}`;
}

/** PURO: lê a saída dos drivers de runtime. */
export function parseSaidaRuntime(saida) {
  const txt = String(saida ?? '');
  const joblog = [...txt.matchAll(/^LOG (\S+) (.*)$/gm)].map((m) => ({ msg: m[1], texto: m[2].trim() }));
  const ag = txt.match(/AGENDADO jobname=(\S+) jobcount=(\S+)/);
  const st = txt.match(/STATUS (\S?) texto=(.*)/);
  const det = txt.match(/DETALHE cat=(\S*) tmpl=(\S*) log=(\S*) inicio=(\S*) fim=(\S*)/);
  const erro = txt.match(/Error:\s*(.+)/)?.[1]?.trim() ?? null;
  return {
    jobname: ag?.[1] ?? null,
    jobcount: ag?.[2] ?? null,
    status: st?.[1] || null,
    statusTexto: st?.[2]?.trim() ?? null,
    estado: st?.[1] ? (STATUS[st[1]] ?? 'desconhecido') : null,
    final: st?.[1] ? STATUS_FINAL.includes(st[1]) : false,
    cancelado: /CANCELADO/.test(txt),
    detalhe: det ? { catalogo: det[1], template: det[2], logStatus: det[3], inicio: det[4], fim: det[5] } : null,
    joblog,
    erro, ok: !erro,
  };
}

// ---------------------------------------------------------------------------------------------
// job CLÁSSICO (SM36/SM37) — item 68, I71: a outra metade do agendamento
//
// O Application Job (acima) é a camada nova; por baixo, 99% do batch de cliente ainda é isto:
// `JOB_OPEN` → `SUBMIT <report> VIA JOB … AND RETURN` → `JOB_CLOSE`, agendando um REPORT existente
// (não uma classe `IF_APJ_RT_EXEC_OBJECT`). Medido 2026-09-02, S4H 758, mandante 250:
//
//   • **`SUBMIT … VIA JOB … AND RETURN` FUNCIONA dentro de um driver classrun** — o guard-rail do
//     `tipos/prog.mjs` ("NÃO testar report por SUBMIT dentro de classrun: HTTP 500") vale para o
//     `SUBMIT` SÍNCRONO (roda na hora, dentro da mesma requisição HTTP); `VIA JOB` só REGISTRA o
//     step para rodar depois, em background — é outro mecanismo, e não dispara o mesmo 500;
//   • **`RS_VARIANT_CREATE` não existe** no S4H 758 (não está na TFDIR) — o nome certo é
//     **`RS_CREATE_VARIANT`**, com assinatura diferente: `vari_desc` é a estrutura `VARID`
//     (`report`/`variant`, resto pode ficar vazio), e os valores vão em duas TABLES clássicas
//     (`vari_contents TYPE RSPARAMS`, `vari_text TYPE VARIT`), não em parâmetros simples;
//   • **`TBTCP-VARIANT` não é o nome da variante usada** — mesmo com uma `USING SELECTION-SET
//     '<variante>'` de verdade, o step grava um nome interno `&<contador>` (snapshot dos valores
//     no momento do agendamento; não vira linha na `VARID`). Não confie nesse campo para provar
//     "qual variante rodou" — a prova é o valor gravado pelo executor, em outra LUW;
//   • **periodicidade não tem flag própria**: `JOB_CLOSE` não tem parâmetro `PERIODIC` — basta
//     `PRDDAYS`/`PRDHOURS`/`PRDMINS`/`PRDWEEKS`/`PRDMONTHS` > 0 (com `SDLSTRTDT`/`SDLSTRTTM` no
//     futuro — não dá para ser `imediato` e periódico ao mesmo tempo) que o SAP marca
//     `TBTCO-PERIODIC = 'X'` sozinho;
//   • **`BP_JOB_DELETE` mente**: devolve `subrc = 1` (parece falha) e AGORA MESMO apaga o job — a
//     linha some da `TBTCO`. Mesma classe do `BT570` do item 47 (mensagem do framework que não
//     corresponde ao resultado real); o assert de verdade é reler a `TBTCO`, não o `subrc`;
//   • **`RS_VARIANT_DELETE` não é headless-safe**: dispara `DYNPRO_SEND_IN_BACKGROUND` em
//     `SAPLSVAR`/`LSVARU09` mesmo com `SUPPRESS_INPUT_DIALOG = 'X'` — não existe via de driver para
//     apagar só a variante. **Mas não bloqueia**: apagar o REPORT por ADT REST (`deleteObject`)
//     cascateia e leva a variante junto (medido: `VARID` fica vazia depois do delete do report).

/** `APPEND VALUE #( … ) TO <tabela>.` — uma linha por parâmetro, o padrão testado na POC (item 68). */
const appendRsparams = (tabela, parametros) => parametros.map((p) => {
  const v = validarParametro(p);
  return `    APPEND VALUE #( selname = '${esc(v.nome)}' kind = '${v.tipo}' sign = '${v.sinal}' option = '${esc(v.operador)}' low = '${esc(v.valor)}' high = '${esc(v.ate)}' ) TO ${tabela}.`;
}).join('\n');

/**
 * PURO: driver que cria uma variante do report via `RS_CREATE_VARIANT` (não `RS_VARIANT_CREATE`,
 * que não existe). `parametros` são os valores fixados na variante.
 */
export function buildVarianteJobSource(driver, { report, variante, texto = '', parametros = [] } = {}) {
  if (!report || !variante) throw new Error('buildVarianteJobSource: exige { report, variante }');
  return `${HEAD(driver)}
    DATA ls_desc TYPE varid.
    ls_desc-report = '${esc(up(report))}'.
    ls_desc-variant = '${esc(up(variante))}'.
    DATA lt_contents TYPE TABLE OF rsparams.
${parametros.length ? `${appendRsparams('lt_contents', parametros)}\n` : ''}    DATA lt_text TYPE TABLE OF varit.
    APPEND VALUE #( mandt = sy-mandt report = '${esc(up(report))}' variant = '${esc(up(variante))}'
                     langu = sy-langu vtext = '${esc(texto)}' ) TO lt_text.
    CALL FUNCTION 'RS_CREATE_VARIANT'
      EXPORTING curr_report = '${esc(up(report))}' curr_variant = '${esc(up(variante))}' vari_desc = ls_desc
      TABLES vari_contents = lt_contents vari_text = lt_text
      EXCEPTIONS
        illegal_report_or_variant = 1 illegal_variantname = 2 not_authorized = 3
        not_executed = 4 report_not_existent = 5 report_not_supplied = 6
        variant_exists = 7 variant_locked = 8 OTHERS = 9.
    out->write( |CREATE_VARIANT subrc={ sy-subrc }| ).
    COMMIT WORK AND WAIT.
${TAIL}`;
}

/**
 * PURO: driver que agenda um job CLÁSSICO — `JOB_OPEN` → `SUBMIT <report> … VIA JOB … AND RETURN`
 * → `JOB_CLOSE`. Um de três seletores, mutuamente exclusivos: `variante` (nomeada, `USING
 * SELECTION-SET`), `parametros` (ad-hoc, `WITH SELECTION-TABLE`) ou nenhum (roda com os defaults
 * do `PARAMETERS` do report). `data`/`hora` (`AAAAMMDD`/`HHMMSS`, calculados pelo CHAMADOR em JS —
 * nunca dentro do ABAP: `DATA(x) = sy-datum + 1` infere um tipo que não bate com `SDLSTRTDT` e
 * dumpa `CALL_FUNCTION_CONFLICT_TYPE`, medido) agendam para o futuro; sem eles, roda imediato.
 * `periodicidade` é `{ dias, semanas, meses, horas, minutos }` — qualquer valor > 0 marca o job
 * como periódico sozinho, e exige `data`/`hora` (não dá para ser imediato e periódico).
 */
export function buildJobClassicoSource(driver, {
  jobname, report, variante = null, parametros = [], imediato = true, data = null, hora = null, periodicidade = null,
} = {}) {
  if (!jobname || !report) throw new Error('buildJobClassicoSource: exige { jobname, report }');
  if (variante && parametros.length) throw new Error('buildJobClassicoSource: informe { variante } OU { parametros }, não os dois — são duas formas do mesmo SUBMIT.');
  if (periodicidade && (imediato || !data || !hora)) {
    throw new Error('buildJobClassicoSource: job periódico exige { data, hora } no futuro — não dá para ser imediato e periódico ao mesmo tempo.');
  }
  const seletor = variante
    ? `USING SELECTION-SET '${esc(up(variante))}'`
    : parametros.length
      ? `WITH SELECTION-TABLE lt_params`
      : '';
  const params = parametros.length
    ? `    DATA lt_params TYPE TABLE OF rsparams.\n${appendRsparams('lt_params', parametros)}\n`
    : '';
  const start = imediato ? `strtimmed = 'X'` : `sdlstrtdt = '${esc(data)}' sdlstrttm = '${esc(hora)}'`;
  const prd = periodicidade
    ? Object.entries({ dias: 'prddays', semanas: 'prdweeks', meses: 'prdmonths', horas: 'prdhours', minutos: 'prdmins' })
      .filter(([k]) => Number(periodicidade[k]) > 0)
      .map(([k, campo]) => `${campo} = '${Number(periodicidade[k])}'`).join(' ')
    : '';
  return `${HEAD(driver)}
    DATA lv_jobname TYPE btcjob VALUE '${esc(up(jobname))}'.
    DATA lv_jobcount TYPE btcjobcnt.
${params}    CALL FUNCTION 'JOB_OPEN'
      EXPORTING jobname = lv_jobname
      IMPORTING jobcount = lv_jobcount
      EXCEPTIONS OTHERS = 1.
    out->write( |JOB_OPEN subrc={ sy-subrc } jobcount={ lv_jobcount }| ).
    IF sy-subrc = 0.
      SUBMIT ${String(report).toLowerCase()} ${seletor}
        VIA JOB lv_jobname NUMBER lv_jobcount
        AND RETURN.
      out->write( |SUBMIT subrc={ sy-subrc }| ).
      CALL FUNCTION 'JOB_CLOSE'
        EXPORTING jobcount = lv_jobcount jobname = lv_jobname ${start}${prd ? ` ${prd}` : ''}
        EXCEPTIONS OTHERS = 1.
      out->write( |JOB_CLOSE subrc={ sy-subrc }| ).
    ENDIF.
    out->write( |CHAVE jobname={ lv_jobname } jobcount={ lv_jobcount }| ).
${TAIL}`;
}

/** PURO: lê a saída do driver de agendamento clássico. */
export function parseSaidaJobClassico(saida) {
  const txt = String(saida ?? '');
  const num = (re) => { const m = txt.match(re); return m ? Number(m[1]) : null; };
  const chave = txt.match(/CHAVE jobname=(\S+) jobcount=(\S+)/);
  const jobOpen = num(/JOB_OPEN subrc=(\d+)/);
  const submit = num(/SUBMIT subrc=(\d+)/);
  const jobClose = num(/JOB_CLOSE subrc=(\d+)/);
  return {
    jobname: chave?.[1] ?? null, jobcount: chave?.[2] ?? null,
    jobOpen, submit, jobClose,
    ok: [jobOpen, submit, jobClose].every((x) => x === 0),
  };
}

/**
 * PURO: driver que apaga um ou mais jobs clássicos (`BP_JOB_DELETE`). ⚠️ **`BP_JOB_DELETE` devolve
 * `subrc = 1` mesmo quando apaga** (medido) — por isso o driver relê a `TBTCO` na mesma passada e
 * devolve `aindaExiste`, que é o assert de verdade.
 */
export function buildApagarJobClassicoSource(driver, { jobs = [] } = {}) {
  if (!jobs.length) throw new Error('buildApagarJobClassicoSource: exige { jobs: [{ jobname, jobcount }, …] }');
  const blocos = jobs.map(({ jobname, jobcount }) => {
    if (!jobname || !jobcount) throw new Error('buildApagarJobClassicoSource: cada item exige { jobname, jobcount }');
    return `    CALL FUNCTION 'BP_JOB_DELETE'
      EXPORTING jobname = '${esc(up(jobname))}' jobcount = '${esc(jobcount)}' forcedmode = 'X'
      EXCEPTIONS OTHERS = 1.
    DATA(lv_subrc_${jobcount}) = sy-subrc.
    SELECT SINGLE COUNT(*) FROM tbtco WHERE jobname = '${esc(up(jobname))}' AND jobcount = '${esc(jobcount)}' INTO @DATA(lv_existe_${jobcount}).
    out->write( |DELETE_JOB ${esc(up(jobname))}/${esc(jobcount)} subrc={ lv_subrc_${jobcount} } aindaExiste={ lv_existe_${jobcount} }| ).`;
  }).join('\n');
  return `${HEAD(driver)}\n${blocos}\n${TAIL}`;
}

/** PURO: lê a saída do driver de apagar — `aindaExiste` é o assert (o `subrc` do BP_JOB_DELETE mente). */
export function parseSaidaApagarJobClassico(saida) {
  const txt = String(saida ?? '');
  const jobs = [...txt.matchAll(/DELETE_JOB (\S+)\/(\S+) subrc=(\d+) aindaExiste=(\d+)/g)]
    .map((m) => ({ jobname: m[1], jobcount: m[2], subrc: Number(m[3]), aindaExiste: Number(m[4]) > 0 }));
  return { jobs, ok: jobs.length > 0 && jobs.every((j) => !j.aindaExiste) };
}

// ---------------------------------------------------------------------------------------------
// as ações (driver descartável: cria, roda, apaga — como no nrob.mjs)

const nomeDriver = (prefixo, base) => `Y_JOB_${prefixo}_${up(base).replace(/[^A-Z0-9_]/g, '').slice(0, 20)}`;

async function rodar(conexao, driver, source, descricao, keepDriver, parse) {
  try {
    const r = await deployAndRun(conexao, { name: driver, source, description: descricao });
    return { ...parse(r.saida), saida: r.saida, erroDriver: r.erro ?? null };
  } finally {
    if (!keepDriver) await deleteObject(conexao, { type: 'class', name: driver, confirm: true }).catch(() => {});
  }
}

/**
 * Cria o TEMPLATE (R3TR SAJT) que aponta para uma entrada de catálogo já ativa.
 * Não sai por ADT REST (500 no handler do create) — a via é a API de design time da SAP.
 */
export const deployJobTemplate = (conexao, {
  template, catalogo, texto = '', parametros = [], pacote = '$TMP', corrNr = '', substituir = false,
  driver = nomeDriver('DT', template), keepDriver = false,
}) => {
  if (!template || !catalogo) throw new Error('deployJobTemplate: exige { template, catalogo }');
  if (String(template).length > 40) throw new Error(`deployJobTemplate: "${template}" passa de 40 caracteres (TY_TEMPLATE_NAME)`);
  if (String(texto).length > 40) throw new Error(`deployJobTemplate: o texto passa de 40 caracteres (TY_TEXT) — "${texto}"`);
  return rodar(conexao, driver, buildTemplateSource(driver, { template, catalogo, texto, parametros, pacote, corrNr, substituir }),
    `cria o job template ${up(template)}`, keepDriver, parseSaidaDt);
};

/** Apaga template e/ou entrada de catálogo (o template primeiro — ele refere o catálogo). */
export const apagarJob = (conexao, {
  template = null, catalogo = null, corrNr = '', confirm = false,
  driver = nomeDriver('DEL', template ?? catalogo), keepDriver = false,
}) => {
  if (confirm !== true) throw new Error('GUARD-RAIL: apagarJob exige confirm:true (apagar catálogo/template é irreversível).');
  return rodar(conexao, driver, buildApagarSource(driver, { template, catalogo, corrNr }),
    `apaga job ${up(template ?? '')} ${up(catalogo ?? '')}`.trim(), keepDriver, parseSaidaDt);
};

/** Só leitura: Y existe · N não existe · D apagado e não transportado · I inconsistente. */
export const existeJob = (conexao, {
  template = null, catalogo = null, driver = nomeDriver('EX', template ?? catalogo), keepDriver = false,
}) => rodar(conexao, driver, buildExisteSource(driver, { template, catalogo }),
  'consulta existência de job catalog/template', keepDriver, parseSaidaDt);

/**
 * Agenda o job a partir do template. Devolve { jobname, jobcount } — a chave do job.
 * `periodicidade`/`fim`: ver `buildAgendarSource` — exigem `imediato:false` + `timestamp`.
 */
export const agendarJob = (conexao, {
  template, texto = '', parametros = [], imediato = true, timestamp = null, usuario = null,
  periodicidade = null, fim = null,
  driver = nomeDriver('RUN', template), keepDriver = false,
}) => rodar(conexao, driver, buildAgendarSource(driver, { template, texto, parametros, imediato, timestamp, usuario, periodicidade, fim }),
  `agenda o job do template ${up(template)}`, keepDriver, parseSaidaRuntime);

/** Status agora, sem esperar. */
export const statusJob = (conexao, {
  jobname, jobcount, driver = nomeDriver('ST', jobcount), keepDriver = false,
}) => rodar(conexao, driver, buildStatusSource(driver, { jobname, jobcount }),
  `status do job ${jobname}`, keepDriver, parseSaidaRuntime);

/**
 * Espera o job chegar a um status final (F terminado · A cancelado), com o poll DENTRO do driver.
 * `segundos` é o teto da espera; o driver sonda a cada `intervalo` segundos.
 */
export const esperarJob = (conexao, {
  jobname, jobcount, segundos = 60, intervalo = 2, driver = nomeDriver('WT', jobcount), keepDriver = false,
}) => rodar(conexao, driver, buildStatusSource(driver, { jobname, jobcount, esperarAte: segundos, intervalo }),
  `espera o job ${jobname}`, keepDriver, parseSaidaRuntime);

/**
 * O log do JOB (SM37), por `BP_JOBLOG_READ`. É o que responder "por que abortou?" quando o
 * status é `A` e o log de aplicação está vazio — o executor morreu antes de escrever nele.
 */
export const lerJobLog = (conexao, {
  jobname, jobcount, driver = nomeDriver('JL', jobcount), keepDriver = false,
}) => rodar(conexao, driver, buildJobLogSource(driver, { jobname, jobcount }),
  `lê o joblog de ${jobname}`, keepDriver, parseSaidaRuntime);

/** Cancela (ou apaga, conforme o status) o job agendado. */
export const cancelarJob = (conexao, {
  jobname, jobcount, confirm = false, driver = nomeDriver('CN', jobcount), keepDriver = false,
}) => {
  if (confirm !== true) throw new Error('GUARD-RAIL: cancelarJob exige confirm:true (o job agendado some da lista).');
  return rodar(conexao, driver, buildCancelarSource(driver, { jobname, jobcount }),
    `cancela o job ${jobname}`, keepDriver, parseSaidaRuntime);
};

// ---------------------------------------------------------------------------------------------
// job CLÁSSICO (SM36/SM37) — item 68, ações

/** Cria uma variante do report via `RS_CREATE_VARIANT` (a API de design time — `RS_VARIANT_CREATE` não existe). */
export const criarVarianteJob = (conexao, {
  report, variante, texto = '', parametros = [], driver = nomeDriver('VC', variante), keepDriver = false,
}) => rodar(conexao, driver, buildVarianteJobSource(driver, { report, variante, texto, parametros }),
  `cria a variante ${up(variante)} de ${up(report)}`, keepDriver, (saida) => {
    const subrc = Number(String(saida).match(/CREATE_VARIANT subrc=(\d+)/)?.[1] ?? -1);
    return { subrc, ok: subrc === 0 };
  });

/**
 * Agenda um job CLÁSSICO — `JOB_OPEN` → `SUBMIT <report> … VIA JOB … AND RETURN` → `JOB_CLOSE`.
 * Devolve `{ jobname, jobcount, ok }` — a chave é quem prova (readTable em outra LUW).
 */
export const agendarJobClassico = (conexao, {
  jobname, report, variante = null, parametros = [], imediato = true, data = null, hora = null, periodicidade = null,
  driver = nomeDriver('CR', jobname), keepDriver = false,
}) => rodar(conexao, driver,
  buildJobClassicoSource(driver, { jobname, report, variante, parametros, imediato, data, hora, periodicidade }),
  `agenda o job clássico ${up(jobname)} (${up(report)})`, keepDriver, parseSaidaJobClassico);

/**
 * Apaga um ou mais jobs clássicos (`BP_JOB_DELETE`). ⚠️ O `subrc` do FM **mente** (devolve 1 mesmo
 * apagando) — por isso o `ok` daqui vem de reler a `TBTCO`, não do `subrc`.
 */
export const apagarJobClassico = (conexao, {
  jobs, confirm = false, driver = nomeDriver('DELC', jobs?.[0]?.jobname ?? 'JOB'), keepDriver = false,
}) => {
  if (confirm !== true) throw new Error('GUARD-RAIL: apagarJobClassico exige confirm:true (apagar job é irreversível).');
  return rodar(conexao, driver, buildApagarJobClassicoSource(driver, { jobs }),
    `apaga ${jobs?.length ?? 0} job(s) clássico(s)`, keepDriver, parseSaidaApagarJobClassico);
};
