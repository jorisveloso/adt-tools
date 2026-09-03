// job.test.mjs — testes PUROS do Application Job (template por API DT + runtime). Nada de rede.
import { describe, it, expect } from 'vitest';
import {
  validarParametro, buildTemplateSource, buildApagarSource, buildExisteSource, parseSaidaDt,
  buildAgendarSource, buildStatusSource, buildCancelarSource, buildJobLogSource, parseSaidaRuntime,
  STATUS, STATUS_FINAL,
  buildVarianteJobSource, buildJobClassicoSource, parseSaidaJobClassico,
  buildApagarJobClassicoSource, parseSaidaApagarJobClassico,
} from './job.mjs';

const P = { nome: 'P_FATOR', valor: '7' };

describe('parâmetro do job', () => {
  it('exige o selname e respeita os limites da ty_templ_val', () => {
    expect(() => validarParametro({})).toThrow(/exige \{ nome \}/);
    expect(() => validarParametro({ nome: 'P_MUITOLONGO' })).toThrow(/8 caracteres/);
    expect(() => validarParametro({ nome: 'P_X', tipo: 'Z' })).toThrow(/P \(parameter\) ou S/);
    expect(() => validarParametro({ nome: 'P_X', sinal: 'Z' })).toThrow(/I \(include\) ou E/);
    expect(() => validarParametro({ nome: 'P_X', valor: 'x'.repeat(256) })).toThrow(/255/);
  });

  it('normaliza para a forma que o ABAP espera (maiúsculas, defaults I/EQ/P)', () => {
    expect(validarParametro({ nome: 'p_fator', valor: '7' })).toEqual({
      nome: 'P_FATOR', valor: '7', ate: '', sinal: 'I', operador: 'EQ', tipo: 'P',
    });
  });
});

describe('design time — o template, que NÃO sai por ADT REST', () => {
  const src = buildTemplateSource('Y_JOB_DT_X', {
    template: 'YJBV_POC_JOBTM', catalogo: 'YJBV_POC_JOBC', texto: 'POC fila 47', parametros: [P],
  });

  it('chama a API que a própria SAP documenta, com transporte vazio para objeto local', () => {
    expect(src).toContain('cl_apj_dt_create_content=>get_instance( )');
    expect(src).toContain("iv_template_name     = 'YJBV_POC_JOBTM'");
    expect(src).toContain("iv_catalog_name      = 'YJBV_POC_JOBC'");
    expect(src).toContain("iv_transport_request = ''");
    expect(src).toContain("iv_package           = '$TMP'");
  });

  it('o parâmetro vai como TT_TEMPL_VAL (selname/kind/sign/option/low/high), não como par nome=valor', () => {
    expect(src).toContain("( selname = 'P_FATOR' kind = 'P' sign = 'I' option = 'EQ' low = '7' high = '' )");
  });

  it('imprime a existência ANTES e DEPOIS — é o assert do driver', () => {
    expect(src).toContain("exists_job_cat_entry( 'YJBV_POC_JOBC' )");
    expect(src).toContain("exists_job_template_entry( 'YJBV_POC_JOBTM' )");
  });

  it('apagar exige um alvo, e o template vem antes do catálogo', () => {
    expect(() => buildApagarSource('Y_JOB_DEL_X', {})).toThrow(/informe \{ template \}/);
    const del = buildApagarSource('Y_JOB_DEL_X', { template: 'YJBV_POC_JOBTM', catalogo: 'YJBV_POC_JOBC' });
    expect(del.indexOf('delete_job_template_entry')).toBeLessThan(del.indexOf('delete_job_cat_entry'));
  });

  it('o create grava a TADIR que a API DT não grava — e o delete a remove depois', () => {
    expect(src).toContain("wi_tadir_object = 'SAJT'");
    expect(src).toContain("wi_tadir_devclass = '$TMP'");
    const del = buildApagarSource('Y_JOB_DEL_X', { template: 'T', catalogo: 'C' });
    expect(del).toContain("wi_delete_tadir_entry = 'X'");
    expect(del.indexOf('delete_job_template_entry')).toBeLessThan(del.indexOf("wi_tadir_object = 'SAJT'"));
  });

  it('`substituir` apaga antes de criar — o create não é idempotente', () => {
    expect(src).not.toContain('lo->delete_job_template_entry');
    const sub = buildTemplateSource('Y_JOB_DT_X', { template: 'T', catalogo: 'C', texto: 'x', substituir: true });
    expect(sub).toContain("exists_job_template_entry( 'T' ) <> 'N'");
    expect(sub.indexOf('lo->delete_job_template_entry')).toBeLessThan(sub.indexOf('lo->create_job_template_entry'));
  });

  it('a consulta de existência é só leitura', () => {
    const q = buildExisteSource('Y_JOB_EX_X', { catalogo: 'YJBV_POC_JOBC' });
    expect(q).toContain('exists_job_cat_entry');
    expect(q).not.toMatch(/create_job|delete_job/);
  });
});

describe('parseSaidaDt', () => {
  it('lê existência, criação e erro da saída do driver', () => {
    const r = parseSaidaDt([
      'EXISTS cat=YJBV_POC_JOBC Y',
      'CREATE tmpl ok=X',
      'EXISTS tmpl=YJBV_POC_JOBTM Y',
    ].join('\n'));
    expect(r.ok).toBe(true);
    expect(r.existe.cat).toEqual({ nome: 'YJBV_POC_JOBC', estado: 'Y' });
    expect(r.existe.tmpl.estado).toBe('Y');
    expect(r.criados).toEqual([{ o: 'tmpl', ok: true }]);
  });

  it('o Error: do driver derruba o ok (o classrun devolve HTTP 200 mesmo assim)', () => {
    const r = parseSaidaDt('EXISTS cat=X N\nError: Job catalog entry does not exist');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/does not exist/);
  });
});

describe('runtime — agendar, esperar, cancelar', () => {
  it('agendamento imediato usa start_immediately; com timestamp, a hora', () => {
    const ja = buildAgendarSource('Y_JOB_RUN_X', { template: 'YJBV_POC_JOBTM', texto: 'POC' });
    expect(ja).toContain('ls_start-start_immediately = abap_true');
    const depois = buildAgendarSource('Y_JOB_RUN_X', { template: 'YJBV_POC_JOBTM', timestamp: '20260901180000' });
    expect(depois).toContain("ls_start-timestamp = '20260901180000'");
  });

  it('o parâmetro do agendamento é ranges (t_value), não o TT_TEMPL_VAL do template', () => {
    const src = buildAgendarSource('Y_JOB_RUN_X', { template: 'T', parametros: [P] });
    expect(src).toContain("( name = 'P_FATOR' t_value = VALUE #( ( sign = 'I' option = 'EQ' low = '7' high = '' ) ) )");
  });

  it('sem espera, o driver só consulta; com espera, o poll roda DENTRO do ABAP', () => {
    const so = buildStatusSource('Y_JOB_ST_X', { jobname: 'J', jobcount: 'C' });
    expect(so).not.toContain('WAIT UP TO');
    const esperando = buildStatusSource('Y_JOB_WT_X', { jobname: 'J', jobcount: 'C', esperarAte: 30, intervalo: 3 });
    expect(esperando).toContain('WAIT UP TO 3 SECONDS');
    expect(esperando).toContain('DO lv_tentativas TIMES');
    expect(esperando).toContain("IF lv_status = 'F' OR lv_status = 'A'");
    expect(esperando).toContain('DATA(lv_tentativas) = 10.');
  });

  it('status e cancelamento exigem a chave inteira (jobname + jobcount)', () => {
    expect(() => buildStatusSource('D', { jobname: 'J' })).toThrow(/jobname, jobcount/);
    expect(() => buildCancelarSource('D', { jobcount: 'C' })).toThrow(/jobname, jobcount/);
  });
});

describe('runtime — job PERIÓDICO (item 69, I72)', () => {
  const alvo = { template: 'YJBV_JOB69_TM', imediato: false, timestamp: '20260902100000' };

  it('periodicidade exige imediato:false + timestamp — a SAP ignora em silêncio se start_immediately = X', () => {
    expect(() => buildAgendarSource('D', { template: 'T', periodicidade: { granularidade: 'minutos', valor: 1 } }))
      .toThrow(/exige \{ imediato: false, timestamp \}/);
    expect(() => buildAgendarSource('D', { template: 'T', imediato: false, periodicidade: { granularidade: 'minutos', valor: 1 } }))
      .toThrow(/exige \{ imediato: false, timestamp \}/);
  });

  it('granularidade fora de minutos/horas/dias é recusada — pede weekday_info/month_info não medido', () => {
    expect(() => buildAgendarSource('D', { ...alvo, periodicidade: { granularidade: 'semanas', valor: 1 } }))
      .toThrow(/minutos\/horas\/dias/);
  });

  it('valor da periodicidade tem de ser > 0', () => {
    expect(() => buildAgendarSource('D', { ...alvo, periodicidade: { granularidade: 'dias', valor: 0 } }))
      .toThrow(/valor.*> 0/);
  });

  it('monta ls_sched com o código de domínio (MI/H/D) e o timezone opcional', () => {
    const src = buildAgendarSource('D', { ...alvo, periodicidade: { granularidade: 'minutos', valor: 1, timezone: 'UTC' } });
    expect(src).toContain('ls_sched-periodic_granularity = \'MI\'.');
    expect(src).toContain('ls_sched-periodic_value = 1.');
    expect(src).toContain("ls_sched-timezone = 'UTC'.");
    expect(src).toContain('is_scheduling_info   = ls_sched');
  });

  it('fim aceita quantidade (NUM) OU ate (DATE), nunca os dois', () => {
    const porQtd = buildAgendarSource('D', { ...alvo, fim: { quantidade: 2 } });
    expect(porQtd).toContain("ls_end-type = 'NUM'.");
    expect(porQtd).toContain('ls_end-max_iterations = 2.');
    expect(porQtd).toContain('is_end_info          = ls_end');

    const porData = buildAgendarSource('D', { ...alvo, fim: { ate: '20260903000000' } });
    expect(porData).toContain("ls_end-type = 'DATE'.");
    expect(porData).toContain("ls_end-timestamp = '20260903000000'.");

    expect(() => buildAgendarSource('D', { ...alvo, fim: { quantidade: 2, ate: '20260903000000' } }))
      .toThrow(/OU \{ ate \}, não os dois/);
    expect(() => buildAgendarSource('D', { ...alvo, fim: {} }))
      .toThrow(/informe \{ quantidade \}/);
  });
});

describe('parseSaidaRuntime', () => {
  it('lê a chave do job agendado (jobname é o GUID de 32, não o texto do job)', () => {
    const r = parseSaidaRuntime('AGENDADO jobname=0050569773121EDEBE9DFA79C778DE2E jobcount=zesklWRM');
    expect(r.jobname).toBe('0050569773121EDEBE9DFA79C778DE2E');
    expect(r.jobcount).toBe('zesklWRM');
    expect(r.ok).toBe(true);
  });

  it('lê o joblog da SM37 — onde aparece a exceção que abortou o executor', () => {
    const src = buildJobLogSource('Y_JOB_JL_X', { jobname: 'J', jobcount: 'C' });
    expect(src).toContain("CALL FUNCTION 'BP_JOBLOG_READ'");
    const r = parseSaidaRuntime([
      'JOBLOG subrc=0 linhas=5',
      'LOG 00516 Job X iniciado',
      'LOG BT570 Erro ao instanciar (Ocorreu uma exceção)',
      'LOG 00564 Job cancelado após System-Exception ERROR_MESSAGE',
    ].join('\n'));
    expect(r.joblog).toHaveLength(3);
    expect(r.joblog[1]).toEqual({ msg: 'BT570', texto: 'Erro ao instanciar (Ocorreu uma exceção)' });
  });

  it('traduz o status e sabe se é final', () => {
    const r = parseSaidaRuntime('STATUS F texto=Terminado\nDETALHE cat=C tmpl=T log=S inicio=1 fim=2');
    expect(r.status).toBe('F');
    expect(r.estado).toBe(STATUS.F);
    expect(r.final).toBe(true);
    expect(r.detalhe).toEqual({ catalogo: 'C', template: 'T', logStatus: 'S', inicio: '1', fim: '2' });
    expect(parseSaidaRuntime('STATUS R texto=Em execucao').final).toBe(false);
    expect(STATUS_FINAL).toEqual(['F', 'A']);
  });
});

// item 68 (I71) — job CLÁSSICO: JOB_OPEN / SUBMIT … VIA JOB / JOB_CLOSE

describe('variante do job — RS_CREATE_VARIANT, não RS_VARIANT_CREATE', () => {
  it('exige report e variante, e chama a FM certa (a antiga não existe no s4h 758)', () => {
    expect(() => buildVarianteJobSource('D', {})).toThrow(/exige \{ report, variante \}/);
    const src = buildVarianteJobSource('D', { report: 'YJBV_JOB68_REP', variante: 'YJBV_JOB68_VAR', texto: 'POC' });
    expect(src).toContain("CALL FUNCTION 'RS_CREATE_VARIANT'");
    expect(src).not.toContain('RS_VARIANT_CREATE');
    expect(src).toContain("ls_desc-report = 'YJBV_JOB68_REP'");
    expect(src).toContain("ls_desc-variant = 'YJBV_JOB68_VAR'");
  });

  it('os valores da variante são TABLES (vari_contents/vari_text), um APPEND por parâmetro', () => {
    const src = buildVarianteJobSource('D', { report: 'R', variante: 'V', parametros: [P] });
    expect(src).toContain("APPEND VALUE #( selname = 'P_FATOR' kind = 'P' sign = 'I' option = 'EQ' low = '7' high = '' ) TO lt_contents.");
    expect(src).toContain('TABLES vari_contents = lt_contents vari_text = lt_text');
  });
});

describe('job clássico — JOB_OPEN / SUBMIT … VIA JOB / JOB_CLOSE', () => {
  it('exige jobname e report; variante e parametros são mutuamente exclusivos', () => {
    expect(() => buildJobClassicoSource('D', {})).toThrow(/exige \{ jobname, report \}/);
    expect(() => buildJobClassicoSource('D', { jobname: 'J', report: 'R', variante: 'V', parametros: [P] }))
      .toThrow(/não os dois/);
  });

  it('SUBMIT VIA JOB … AND RETURN — nunca o SUBMIT síncrono que dá 500 dentro do classrun', () => {
    const src = buildJobClassicoSource('D', { jobname: 'YJBV_JOB68', report: 'YJBV_JOB68_REP' });
    expect(src).toMatch(/SUBMIT yjbv_job68_rep\s+VIA JOB lv_jobname NUMBER lv_jobcount\s+AND RETURN/);
    expect(src).toContain("CALL FUNCTION 'JOB_OPEN'");
    expect(src).toContain("CALL FUNCTION 'JOB_CLOSE'");
  });

  it('com variante usa USING SELECTION-SET; com parametros, WITH SELECTION-TABLE', () => {
    const comVariante = buildJobClassicoSource('D', { jobname: 'J', report: 'R', variante: 'YJBV_JOB68_VAR' });
    expect(comVariante).toContain("USING SELECTION-SET 'YJBV_JOB68_VAR'");
    const comParams = buildJobClassicoSource('D', { jobname: 'J', report: 'R', parametros: [P] });
    expect(comParams).toContain('WITH SELECTION-TABLE lt_params');
    expect(comParams).toContain("APPEND VALUE #( selname = 'P_FATOR'");
  });

  it('imediato usa strtimmed; agendado usa data/hora prontas do chamador (sem aritmética no ABAP)', () => {
    const imediato = buildJobClassicoSource('D', { jobname: 'J', report: 'R' });
    expect(imediato).toContain("strtimmed = 'X'");
    const agendado = buildJobClassicoSource('D', { jobname: 'J', report: 'R', imediato: false, data: '20260903', hora: '030000' });
    expect(agendado).toContain("sdlstrtdt = '20260903' sdlstrttm = '030000'");
    expect(agendado).not.toContain('sy-datum +');
  });

  it('periodicidade exige data/hora (não dá para ser imediato e periódico) e não usa o parâmetro PERIODIC, que não existe', () => {
    expect(() => buildJobClassicoSource('D', { jobname: 'J', report: 'R', periodicidade: { dias: 1 } }))
      .toThrow(/job periódico exige \{ data, hora \}/);
    const src = buildJobClassicoSource('D', {
      jobname: 'J', report: 'R', imediato: false, data: '20260903', hora: '030000', periodicidade: { dias: 1 },
    });
    expect(src).toContain("prddays = '1'");
    expect(src).not.toMatch(/\bperiodic\s*=/);
  });
});

describe('parseSaidaJobClassico', () => {
  it('lê a chave e os três subrc — ok só quando os três são 0', () => {
    const r = parseSaidaJobClassico('JOB_OPEN subrc=0 jobcount=06291200\nSUBMIT subrc=0\nJOB_CLOSE subrc=0\nCHAVE jobname=YJBV_JOB68 jobcount=06291200');
    expect(r).toEqual({ jobname: 'YJBV_JOB68', jobcount: '06291200', jobOpen: 0, submit: 0, jobClose: 0, ok: true });
    const falhou = parseSaidaJobClassico('JOB_OPEN subrc=1 jobcount=\nCHAVE jobname=YJBV_JOB68 jobcount=');
    expect(falhou.ok).toBe(false);
  });
});

describe('apagar job clássico — BP_JOB_DELETE, cujo subrc mente', () => {
  it('exige a lista de jobs, e relê a TBTCO na mesma passada (o assert de verdade)', () => {
    expect(() => buildApagarJobClassicoSource('D', {})).toThrow(/exige \{ jobs/);
    const src = buildApagarJobClassicoSource('D', { jobs: [{ jobname: 'YJBV_JOB68', jobcount: '06291200' }] });
    expect(src).toContain("CALL FUNCTION 'BP_JOB_DELETE'");
    expect(src).toContain("jobname = 'YJBV_JOB68' jobcount = '06291200' forcedmode = 'X'");
    expect(src).toContain('SELECT SINGLE COUNT(*) FROM tbtco');
  });

  it('parseSaidaApagarJobClassico: ok vem de aindaExiste, não do subrc (que mente)', () => {
    const r = parseSaidaApagarJobClassico('DELETE_JOB YJBV_JOB68/06291200 subrc=1 aindaExiste=0');
    expect(r.jobs).toEqual([{ jobname: 'YJBV_JOB68', jobcount: '06291200', subrc: 1, aindaExiste: false }]);
    expect(r.ok).toBe(true); // subrc=1 "parece" falha, mas aindaExiste=0 prova que apagou
    const naoApagou = parseSaidaApagarJobClassico('DELETE_JOB J/C subrc=0 aindaExiste=1');
    expect(naoApagou.ok).toBe(false);
  });
});
