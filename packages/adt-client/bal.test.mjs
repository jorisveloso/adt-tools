// bal.test.mjs — as partes puras do assert por log de aplicação, contra a saída REAL do driver
// (S4H 758, 2026-08-31). Não "corrija" as fixtures para o teste passar: elas são a medição.
import { test, expect } from 'vitest';
import {
  linhaParaLog, fonteDriverLeitura, fonteDriverGravacao, fonteDriverExclusao,
  parseSaidaLeitura, parseSaidaGravacao, formatarLogs, avaliar, MARCA_ZERO,
} from './bal.mjs';

// Linha real da BALHDR (dataPreview), do log gravado pela POC.
const LINHA = {
  LOGNUMBER: '00000000000048985068', OBJECT: 'YJBV_POC_LOG29', SUBOBJECT: 'POC',
  EXTNUMBER: 'FILA29-GRAVA', ALDATE: '20260831', ALTIME: '135034', ALUSER: 'MVJVELOSO',
  ALTCODE: '', ALPROG: 'YJBV_POC_CL_BAL29W============CP', PROBCLASS: '1',
  MSG_CNT_AL: '000004', MSG_CNT_A: '000000', MSG_CNT_E: '000001',
  MSG_CNT_W: '000001', MSG_CNT_I: '000001', MSG_CNT_S: '000001',
};

// Saída real do driver de leitura (TAB entre os campos).
const SAIDA_LEITURA = [
  'LOAD\t0\t1\t4',
  'MSG\t00000000000048985068\t000001\tE\t00\t398\t1\tPOC29 erro',
  'MSG\t00000000000048985068\t000002\tW\t00\t398\t2\tPOC29 aviso',
  'MSG\t00000000000048985068\t000003\tI\t00\t398\t4\tPOC29 info',
  'MSG\t00000000000048985068\t000004\tS\t00\t398\t4\tPOC29 sucesso',
  '',
].join('\n');

const SAIDA_GRAVACAO = ['CREATE\t0', 'ADD\tS\t0', 'ADD\tW\t0', 'SAVE\t0\t1', 'LOGNUMBER\t00000000000048985214', ''].join('\n');

test('bal: a linha da BALHDR vira log com os contadores por tipo separados', () => {
  const g = linhaParaLog(LINHA);
  expect(g.lognumber).toBe('00000000000048985068');
  expect(g.quando).toBe('2026-08-31 13:50:34');
  expect(g.total).toBe(4);
  expect(g.tipos).toEqual({ A: 0, E: 1, W: 1, I: 1, S: 1 });
  // o texto NÃO vem do cabeçalho: a BALM está vazia e as mensagens moram comprimidas na BALDAT.
  expect(g.mensagens).toBeNull();
});

test('bal: parse da saída do driver de leitura (LOAD + MSG por TAB)', () => {
  const { load, mensagens } = parseSaidaLeitura(SAIDA_LEITURA);
  expect(load).toEqual({ subrc: 0, logs: 1, mensagens: 4 });
  expect(mensagens).toHaveLength(4);
  expect(mensagens[0]).toEqual({
    lognumber: '00000000000048985068', numero: '000001', tipo: 'E',
    msgid: '00', msgno: '398', probclass: '1', texto: 'POC29 erro',
  });
  expect(mensagens[3].texto).toBe('POC29 sucesso');
});

test('bal: parse da saída do driver de gravação', () => {
  expect(parseSaidaGravacao(SAIDA_GRAVACAO)).toEqual({
    create: 0, adds: [{ tipo: 'S', subrc: 0 }, { tipo: 'W', subrc: 0 }],
    save: 0, gravadas: 1, lognumbers: ['00000000000048985214'],
  });
});

test('bal: o driver de leitura carrega UMA vez, sem trancar, com os números normalizados', () => {
  const src = fonteDriverLeitura('YJBV_BAL_LEITURA', ['48985068', '00000000000048985068', '48985069']);
  // duplicata some, e o NUMC 20 é preenchido com zeros à esquerda
  expect(src).toContain("VALUE #( ( '00000000000048985068' ) ( '00000000000048985069' ) )");
  expect(src).toContain('i_lock_handling               = 0');           // leitura não tranca
  expect(src).toContain('i_exception_if_already_loaded = abap_false');
  expect(src.match(/BAL_DB_LOAD/g)).toHaveLength(1);                    // um LOAD por execução
  expect(() => fonteDriverLeitura('X', ['nao-numerico'])).toThrow(/NUMC 20/);
  expect(() => fonteDriverLeitura('X', [])).toThrow(/sem lognumber/);
});

test('bal: o driver de gravação parte o texto nos quatro & da mensagem 00/398 e salva só o handle dele', () => {
  const src = fonteDriverGravacao('YJBV_BAL_GRAVA', {
    objeto: 'YJBV_POC_LOG29', subobjeto: 'POC', extnumber: 'E2E',
    mensagens: [{ tipo: 'e', texto: 'x'.repeat(60) }, { tipo: 'S', texto: 'ok' }],
  });
  expect(src).toContain(`msgty = 'E' msgid = '00' msgno = '398' probclass = '1' msgv1 = '${'x'.repeat(50)}' msgv2 = '${'x'.repeat(10)}'`);
  expect(src).toContain("msgty = 'S' msgid = '00' msgno = '398' probclass = '4' msgv1 = 'ok'");
  // save_all = false: com true o SAP salva TODO log em memória, inclusive o de outro ponto (medido)
  expect(src).toContain('i_save_all       = abap_false');
  // handle vazio faria o MSG_ADD escrever em outro log com subrc 0 (medido) — o driver para antes
  expect(src).toContain('IF sy-subrc <> 0 OR lv_handle IS INITIAL.');
});

test('bal: gravar log sem objeto ou sem mensagem é recusado antes da rede', () => {
  expect(() => fonteDriverGravacao('X', { objeto: '', mensagens: [{ tipo: 'I', texto: 'a' }] })).toThrow(/exige `objeto`/);
  expect(() => fonteDriverGravacao('X', { objeto: 'YJBV_X', mensagens: [] })).toThrow(/sem mensagens/);
});

test('bal: o driver de exclusão pede commit e recusa número inválido', () => {
  const src = fonteDriverExclusao('YJBV_BAL_APAGA', ['48985068']);
  expect(src).toContain('BAL_DB_DELETE');
  expect(src).toContain('i_with_commit_work = abap_true');
  expect(() => fonteDriverExclusao('X', ['xyz'])).toThrow(/NUMC 20/);
});

test('bal: avaliar — semErro, tipos e minimo, tudo sobre o cabeçalho (sem driver)', () => {
  const g = linhaParaLog(LINHA);
  expect(avaliar([g], { semErro: true }).falhas).toEqual(['log com erro: E=1 A=0']);
  expect(avaliar([g], { tipos: { S: 1, W: 1 } }).ok).toBe(true);
  expect(avaliar([g], { tipos: { S: 2 } }).falhas).toEqual(['esperava 2 mensagem(ns) do tipo S, veio 1']);
  expect(avaliar([], { minimo: 1 }).falhas).toEqual(['esperava ao menos 1 log(s), veio 0']);
  expect(avaliar([], { minimo: 0, semErro: true }).ok).toBe(true);
});

test('bal: avaliar — `contem` cobra o TEXTO, e avisa quando as mensagens não foram lidas', () => {
  const g = linhaParaLog(LINHA);
  expect(avaliar([g], { contem: 'POC29' }).falhas[0]).toMatch(/exige as mensagens lidas/);
  g.mensagens = parseSaidaLeitura(SAIDA_LEITURA).mensagens;
  expect(avaliar([g], { contem: ['POC29 erro', 'POC29 sucesso'] }).ok).toBe(true);
  expect(avaliar([g], { contem: 'não gravei isso' }).falhas).toEqual(['nenhuma mensagem contém "não gravei isso"']);
});

test('bal: formatarLogs imprime cabeçalho e mensagens em uma linha cada', () => {
  const g = linhaParaLog(LINHA);
  g.mensagens = parseSaidaLeitura(SAIDA_LEITURA).mensagens;
  const txt = formatarLogs([g]);
  expect(txt).toContain('2026-08-31 13:50:34 YJBV_POC_LOG29/POC "FILA29-GRAVA" MVJVELOSO — 4 msg (E:1 W:1 I:1 S:1)');
  expect(txt).toContain('E 00/398 POC29 erro');
  expect(formatarLogs([linhaParaLog({ ...LINHA, MSG_CNT_AL: '0', MSG_CNT_E: '0', MSG_CNT_W: '0', MSG_CNT_I: '0', MSG_CNT_S: '0' })])).toContain('sem mensagem');
});

test('bal: a marca zero é NUMC 20 de zeros — BALHDR vazia faz todo log ser novo', () => {
  expect(MARCA_ZERO).toBe('00000000000000000000');
  expect(MARCA_ZERO).toHaveLength(20);
});
