// deps.test.mjs — o scanner de dependências Z/Y do `clone`.
//
// Costura: (fonte ABAP em string) → (lista de objetos Z/Y referenciados) → (o que desce, o que é
// cortado e por quê). Puro: sem rede, sem disco.

import { test, expect } from 'vitest';
import { extrairRefs, aplicarTravas } from './deps.mjs';

test('acha um objeto Z chamado no corpo', () => {
  const fonte = `
    METHOD processar.
      CALL METHOD zcl_util=>formatar.
    ENDMETHOD.`;
  expect(extrairRefs(fonte)).toEqual(['ZCL_UTIL']);
});

// `zeile` (linha) e `zaehler` (contador) são nomes ALEMÃES corriqueiros em ABAP e casam com o regex
// de candidato. O que os desqualifica não é o formato do nome: é terem sido DECLARADOS ali mesmo.
test('ignora variável declarada no próprio fonte', () => {
  const fonte = `
    DATA zeile TYPE i.
    DATA: zaehler TYPE i,
          zbuffer TYPE string.
    CONSTANTS zc_max TYPE i VALUE 10.
    FIELD-SYMBOLS <zfs> TYPE any.
      CALL METHOD zcl_util=>formatar.
    `;
  expect(extrairRefs(fonte)).toEqual(['ZCL_UTIL']);
});

test('ignora comentário — de linha inteira (*) e de fim de linha (")', () => {
  const fonte = `
* antes usava ZCL_ANTIGO
      CALL METHOD zcl_util=>formatar.   " ver também ZCL_LOG
    `;
  expect(extrairRefs(fonte)).toEqual(['ZCL_UTIL']);
});

// --- travas: onde a descida para ---

test('só desce no que está na allowlist de prefixos; o resto é cortado COM motivo', () => {
  const r = aplicarTravas(['ZACME_CL_UTIL', 'ZCL_LOG', 'YACME_TB_X'], {
    prefixos: ['ZACME', 'YACME'],
    profundidadeMaxima: 2,
    nivelAtual: 0,
  });
  expect(r.desce).toEqual(['ZACME_CL_UTIL', 'YACME_TB_X']);
  expect(r.cortados).toEqual([{ objeto: 'ZCL_LOG', motivo: 'prefixo não liberado' }]);
});

test('na profundidade máxima, corta tudo — mesmo o que o prefixo liberaria', () => {
  const r = aplicarTravas(['ZACME_CL_UTIL'], {
    prefixos: ['ZACME'],
    profundidadeMaxima: 2,
    nivelAtual: 2,
  });
  expect(r.desce).toEqual([]);
  expect(r.cortados).toEqual([{ objeto: 'ZACME_CL_UTIL', motivo: 'profundidade máxima (2) atingida' }]);
});

test('o próprio objeto não é dependência de si mesmo', () => {
  const fonte = `
    CLASS zcl_util DEFINITION PUBLIC.
      PUBLIC SECTION.
        METHODS formatar.
    ENDCLASS.
    CLASS zcl_util IMPLEMENTATION.
      METHOD formatar.
        DATA(x) = zcl_log=>get( ).
      ENDMETHOD.
    ENDCLASS.`;
  expect(extrairRefs(fonte)).toEqual(['ZCL_LOG']);
});
