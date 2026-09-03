// nrob.test.mjs — parte pura do canal de INTERVALOS: validação, fonte dos drivers e parse da saída.
// Os snapshots são do que rodou no S4H 758 em 2026-09-01 (docs/receita-nrob.md).
import { test, expect } from 'vitest';
import {
  ACOES, validarIntervalo, buildIntervalosSource, buildApagarIntervalosSource,
  buildLerIntervalosSource, parseIntervalosOutput,
} from './nrob.mjs';

test('nrob: as ações são o INRIV-PROCIND medido — e é ele que faz o UPDATE surtir efeito', () => {
  expect(ACOES).toEqual({ inserir: 'I', alterar: 'U', apagar: 'D' });
  expect(validarIntervalo({ nr: '01', de: '1', ate: '9' })).toBe('I');
  expect(validarIntervalo({ nr: '01', de: '1', ate: '9', nivel: 0, acao: 'alterar' })).toBe('U');
  expect(validarIntervalo({ nr: '01', acao: 'apagar' })).toBe('D');
});

test('nrob: guard-rails do intervalo, antes da rede', () => {
  expect(() => validarIntervalo({})).toThrow(/exige \{ nr \}/);
  expect(() => validarIntervalo({ nr: '001', de: '1', ate: '9' })).toThrow(/2 caracteres/);
  expect(() => validarIntervalo({ nr: '01' })).toThrow(/exige \{ de, ate \}/);
  expect(() => validarIntervalo({ nr: '01', de: '1', ate: '9', acao: 'zerar' })).toThrow(/desconhecida/);
  expect(() => validarIntervalo({ nr: '01', de: '1'.repeat(21), ate: '9' })).toThrow(/20 caracteres/);
  expect(() => validarIntervalo({ nr: '01', de: '1', ate: '9', ateAno: '20261' })).toThrow(/NUMC 4/);
});

test('nrob: `alterar` sem nivel é RECUSADO — omitir o nível zera o contador em silêncio', () => {
  expect(() => validarIntervalo({ nr: '02', de: '1', ate: '9', acao: 'alterar' })).toThrow(/exige \{ nivel \}/);
  expect(() => validarIntervalo({ nr: '02', de: '1', ate: '9', nivel: 10000, acao: 'alterar' })).not.toThrow();
});

test('nrob: o driver de gravação leva PROCIND, o ciclo inteiro e o NUMBER_GET_NEXT opcional', () => {
  const s = buildIntervalosSource('y_nriv_x', 'YJBV_POC_A', [{ nr: '01', de: '0000000001', ate: '0000009999' }], { proximoDe: '01' });
  expect(s).toContain('CLASS y_nriv_x DEFINITION');
  expect(s).toContain("nrrangenr = '01' toyear = '0000'");
  expect(s).toContain("fromnumber = '0000000001' tonumber = '0000009999'");
  expect(s).toContain("procind = 'I'");
  // o ciclo completo — pular o INIT faz o CLOSE devolver OBJECT_NOT_INITIALIZED
  for (const fm of ['NUMBER_RANGE_ENQUEUE', 'NUMBER_RANGE_UPDATE_INIT', 'NUMBER_RANGE_INTERVAL_UPDATE', 'NUMBER_RANGE_UPDATE_CLOSE', 'NUMBER_RANGE_DEQUEUE']) {
    expect(s, fm).toContain(`CALL FUNCTION '${fm}'`);
  }
  expect(s).toContain("EXPORTING nr_range_nr = '01' object = 'YJBV_POC_A'");
  expect(s).toContain('commit = abap_true');
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
});

test('nrob: sem `proximoDe` o driver não chama NUMBER_GET_NEXT (o assert é opcional)', () => {
  const s = buildIntervalosSource('y_nriv_x', 'YJBV_POC_A', [{ nr: '01', de: '1', ate: '9' }]);
  expect(s).not.toContain('NUMBER_GET_NEXT');
});

test('nrob: o driver de exclusão lê pelo INTERVAL_LIST e ZERA o NRLEVEL (senão INRER msgnr 210)', () => {
  const s = buildApagarIntervalosSource('y_nrivd_x', 'YJBV_POC_A');
  expect(s).toContain("CALL FUNCTION 'NUMBER_RANGE_INTERVAL_LIST'");
  expect(s).toContain('<i>-nrlevel = 0.');
  expect(s).toContain("<i>-procind = 'D'.");
  expect(s).toContain('SEM INTERVALO');      // objeto sem NRIV sai antes de tentar o ciclo
  for (const l of s.split('\n')) expect(l.length, l).toBeLessThanOrEqual(255);
});

test('nrob: o driver de leitura não altera nada', () => {
  const s = buildLerIntervalosSource('y_nrivr_x', 'YJBV_POC_A');
  expect(s).toContain("CALL FUNCTION 'NUMBER_RANGE_INTERVAL_LIST'");
  for (const fm of ['NUMBER_RANGE_INTERVAL_UPDATE', 'NUMBER_RANGE_UPDATE_CLOSE', 'NUMBER_RANGE_ENQUEUE']) {
    expect(s, fm).not.toContain(fm);
  }
});

test('nrob: o parse do sucesso — saída real do s4h 758', () => {
  const p = parseIntervalosOutput([
    'ENQ subrc=0', 'INIT subrc=0',
    'UPDATE subrc=0 erro= msgnr= tab= fld= tabix=0 recusados=0',
    'CLOSE subrc=0', 'DEQ subrc=0',
    'NEXT subrc=0 num=0000000001',
  ].join('\n'));
  expect(p.ok).toBe(true);
  expect(p.ciclos).toEqual([{ updateSubrc: 0, erroFm: false, msgnr: null, tabela: null, campo: null, tabix: 0, recusados: 0, closeSubrc: 0 }]);
  expect(p.proximo).toEqual({ subrc: 0, numero: '0000000001' });
});

test('nrob: `CLOSE subrc=1` (NO_CHANGES_MADE) NÃO é sucesso — é o silêncio do PROCIND faltando', () => {
  const p = parseIntervalosOutput([
    'INIT subrc=0',
    'UPDATE subrc=0 erro= msgnr= tab= fld= tabix=0 recusados=0',
    'CLOSE subrc=1',
  ].join('\n'));
  expect(p.ok).toBe(false);
  expect(p.ciclos[0].closeSubrc).toBe(1);
});

test('nrob: o INRER do delete sem zerar o nível (msgnr 210 em INTERVAL-NRLEVEL)', () => {
  const p = parseIntervalosOutput([
    'LIST subrc=0 n=1',
    'IV [01] from=0000000001 to=0000009999 lvl=00000000000000000002 ext=',
    'ENQ subrc=0', 'INIT subrc=0',
    'UPDATE subrc=0 erro=X msgnr=210 tab=INTERVAL fld=NRLEVEL tabix=1 recusados=0',
    'CLOSE subrc=1', 'DEQ subrc=0',
  ].join('\n'));
  expect(p.ok).toBe(false);
  expect(p.ciclos[0]).toMatchObject({ erroFm: true, msgnr: '210', tabela: 'INTERVAL', campo: 'NRLEVEL', tabix: 1 });
  expect(p.intervalos).toEqual([{ nr: '01', de: '0000000001', ate: '0000009999', nivel: '00000000000000000002', externo: false }]);
});

test('nrob: objeto sem intervalo — o parse reconhece e não inventa ciclo', () => {
  const p = parseIntervalosOutput('LIST subrc=0 n=0\nSEM INTERVALO');
  expect(p.semIntervalo).toBe(true);
  expect(p.ciclos).toEqual([]);
  expect(p.ok).toBe(false);   // quem trata "sem intervalo" como ok é o `apagarIntervalos`
});
