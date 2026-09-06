// tran.test.mjs — parte pura do módulo de transação: validação, fonte dos drivers e parse da saída.
import { test, expect } from 'vitest';
import { buildTransactionDriverSource, buildTransactionDeleteSource, parseTransactionOutput, validarTransacao, conferirGui, GUI_TSTCC, TIPOS_TRANSACAO } from './tran.mjs';

test('tran: tipos medidos no s4h (ststc_c_type_*) e a validação por tipo', () => {
  expect(TIPOS_TRANSACAO).toEqual({ dialog: 'D', report: 'R', parameter: 'P', variant: 'V' });
  expect(validarTransacao({ tcode: 'YJBV_POC_TR', type: 'report', program: 'RSPARAM' })).toBe('R');
  expect(() => validarTransacao({ tcode: 'YJBV_POC_TR', type: 'report' })).toThrow(/exige \{ program \}/);
  expect(() => validarTransacao({ tcode: 'YJBV_POC_TD', type: 'dialog', program: 'SAPMSVMA' })).toThrow(/dynpro/);
  expect(() => validarTransacao({ tcode: 'YJBV_POC_TP', type: 'parameter' })).toThrow(/called/);
  expect(() => validarTransacao({ tcode: 'YJBV_POC_TV', type: 'variant', called: 'SE38' })).toThrow(/variant/);
  expect(() => validarTransacao({ tcode: 'YJBV_POC_TX', type: 'oo' })).toThrow(/desconhecido/);
  expect(() => validarTransacao({ tcode: 'SE93X', type: 'report', program: 'X' })).toThrow(/GUARD-RAIL/);
  expect(() => validarTransacao({ tcode: 'Y'.repeat(21), type: 'report', program: 'X' })).toThrow(/20 caracteres/);
});

test('tran: driver de transação de parâmetro sobre SM30 (o padrão da moovi) — INSERT + READ, linhas ≤ 255', () => {
  const s = buildTransactionDriverSource('y_tran_x', { tcode: 'yjbv_poc_tp', text: "POC d'água", type: 'parameter', called: 'sm30',
    params: [{ field: 'viewname', value: 'V_T001' }, { field: 'UPDATE', value: 'X' }] });
  expect(s).toContain('CLASS y_tran_x DEFINITION');
  expect(s).toContain("ls_p-field = 'VIEWNAME'. ls_p-value = 'V_T001'. APPEND ls_p TO lt_p. ls_p-field = 'UPDATE'. ls_p-value = 'X'. APPEND ls_p TO lt_p.");
  expect(s).toContain("transaction = 'YJBV_POC_TP' shorttext = 'POC d''água' transaction_type = 'P'");
  expect(s).toContain("called_transaction = 'SM30' called_transaction_skip = 'X'");
  expect(s).toContain("development_class = '$TMP'");
  expect(s).toContain("html_enabled = 'X' wingui_enabled = 'X' java_enabled = ''");
  expect(s).toContain("CALL FUNCTION 'RPY_TRANSACTION_READ' EXPORTING transaction = 'YJBV_POC_TP'");
  expect(s).not.toContain('RPY_TRANSACTION_DELETE');
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
});

test('tran: report com replace apaga antes; dialog leva program+dynpro; language explícito', () => {
  const r = buildTransactionDriverSource('y_tran_r', { tcode: 'YJBV_POC_TR', type: 'report', program: 'rsparam', replace: true, language: 'e' });
  expect(r.indexOf("RPY_TRANSACTION_DELETE' EXPORTING transaction = 'YJBV_POC_TR'")).toBeLessThan(r.indexOf("'RPY_TRANSACTION_INSERT'"));
  expect(r).toContain("transaction_type = 'R'");
  expect(r).toContain("program = 'RSPARAM' dynpro = ''");
  expect(r).toContain("language = 'E'");
  const d = buildTransactionDriverSource('y_tran_d', { tcode: 'YJBV_POC_TD', type: 'dialog', program: 'SAPMSVMA', dynpro: '0100' });
  expect(d).toContain("transaction_type = 'D'");
  expect(d).toContain("program = 'SAPMSVMA' dynpro = '0100'");
  expect(d).not.toContain('language =');
});

test('tran: driver de delete recusa nome fora de Z/Y e apaga vários', () => {
  const s = buildTransactionDeleteSource('y_trand', ['yjbv_poc_tr', 'YJBV_POC_TD']);
  expect(s.match(/RPY_TRANSACTION_DELETE/g)).toHaveLength(2);
  expect(s).toContain("transaction = 'YJBV_POC_TR'");
  expect(() => buildTransactionDeleteSource('y_trand', 'SE93')).toThrow(/GUARD-RAIL/);
});

test('tran: parse da saída medida no s4h — criada, já existia, e falha de leitura', () => {
  const ok = parseTransactionOutput('TRAN_INSERT YJBV_POC_TR subrc=0 \nTRAN_READ pgmna=RSPARAM dypno=1000 cinfo=80\nTRAN_GUI webgui=1 win32=X platin=\nTRAN_READ YJBV_POC_TR subrc=0 \n');
  expect(ok).toEqual({ ok: true, subrc: 0, existed: false, msg: '', tstc: { pgmna: 'RSPARAM', dypno: '1000', cinfo: '80' }, gui: { webgui: '1', win32: 'X', platin: '' }, deletes: [] });
  const ja = parseTransactionOutput('TRAN_INSERT YJBV_POC_TR subrc=2 O código de transação YJBV_POC_TR já foi criado\nTRAN_READ pgmna=RSPARAM dypno=1000 cinfo=80\nTRAN_READ YJBV_POC_TR subrc=0 \n');
  expect(ja.ok).toBe(true); expect(ja.existed).toBe(true); expect(ja.msg).toMatch(/já foi criado/);
  const falha = parseTransactionOutput('TRAN_INSERT YJBV_POC_TR subrc=3 Sem autorização\nTRAN_READ YJBV_POC_TR subrc=2 \n');
  expect(falha.ok).toBe(false); expect(falha.subrc).toBe(3); expect(falha.tstc).toBeNull();
  const del = parseTransactionOutput('TRAN_DELETE YJBV_POC_TR subrc=0 \nTRAN_DELETE YJBV_POC_TD subrc=2 não existe\n');
  expect(del.deletes).toEqual([{ tcode: 'YJBV_POC_TR', subrc: 0, msg: '' }, { tcode: 'YJBV_POC_TD', subrc: 2, msg: 'não existe' }]);
});

test('tran: gui pedido × TSTCC lida em outra LUW (valores medidos no s4h: S_WEBGUI "1", S_WIN32/S_PLATIN "X")', () => {
  expect(GUI_TSTCC).toEqual({ html: ['S_WEBGUI', '1'], win: ['S_WIN32', 'X'], java: ['S_PLATIN', 'X'] });
  const linha = (webgui, win32, platin) => ({ TCODE: 'YJBV_TC', S_WEBGUI: webgui, S_WIN32: win32, S_PLATIN: platin });
  // default da lib (html+win, sem java) — é o que a FM gravou
  expect(conferirGui(undefined, linha('1', 'X', ''))).toEqual({ ok: true, banco: { html: true, win: true, java: false }, divergencias: [] });
  expect(conferirGui({ html: true, win: true, java: true }, linha('1', 'X', 'X')).ok).toBe(true);
  expect(conferirGui({ html: false, win: false, java: false }, linha('', '', '')).ok).toBe(true);
  // 'X' em S_WEBGUI não é o valor que a FM grava — só '1' conta como ligado
  expect(conferirGui({ html: true }, linha('X', 'X', '')).divergencias).toEqual([{ flag: 'html', esperado: true, lido: false }]);
  // divergência de verdade: pediu só WebGUI, o banco tem WinGUI também
  expect(conferirGui({ html: true, win: false }, linha('1', 'X', ''))).toEqual({
    ok: false, banco: { html: true, win: true, java: false }, divergencias: [{ flag: 'win', esperado: false, lido: true }] });
  // sem linha na TSTCC: tudo que foi pedido diverge (lido null)
  expect(conferirGui({ html: true }, null).divergencias).toEqual([
    { flag: 'html', esperado: true, lido: null }, { flag: 'win', esperado: true, lido: null }, { flag: 'java', esperado: false, lido: null }]);
  // ALREADY_EXIST: a FM não tocou na transação, então só o que o chamador pediu explicitamente vale
  expect(conferirGui({}, linha('', 'X', ''), { flags: [] })).toEqual({ ok: true, banco: { html: false, win: true, java: false }, divergencias: [] });
  expect(conferirGui({ html: true }, linha('', 'X', ''), { flags: ['html'] }).divergencias).toEqual([{ flag: 'html', esperado: true, lido: false }]);
});
