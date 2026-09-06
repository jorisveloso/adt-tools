// icm.test.mjs — partes puras do canal do cache do ICM. Os textos e números são os que rodaram no
// S4H 758/250 em 05/09/2026 (POC_icm_static_cache, fila adt-client #67).
import { test, expect } from 'vitest';
import {
  ENCODING_DA_CHAVE, buildLerCacheSource, buildInvalidarCacheSource, parseCacheOutput, diagnosticar,
} from './icm.mjs';

const ALVO = '/sap/public/bc/ui5_ui5/resources/sap-ui-core.js';

test('icm: a chave do cache é por ENCODING — é isso que explica gzip vazio e identity cheio', () => {
  expect(ENCODING_DA_CHAVE).toEqual({ 0: 'identity', 1: 'gzip', B: 'br' });
  // Saída real do classrun: o out->write escapa os `&` da chave como `&amp;`.
  const saida = `TOTAL 9952
ENTRADA dsize=196338 exp=604800 crea=1788651897 acc=1788651949 name=${ALVO}&amp;&amp;&amp;GZ=B&amp;000&amp;A6E90000&amp;
ENTRADA dsize=775145 exp=604800 crea=1788651896 acc=1788651948 name=${ALVO}&amp;&amp;&amp;GZ=0&amp;000&amp;A6E90000&amp;
ENTRADA dsize=213037 exp=604800 crea=1788651862 acc=1788651862 name=${ALVO}&amp;&amp;&amp;GZ=1&amp;000&amp;5FC258E7&amp;`;
  const r = parseCacheOutput(saida);
  expect(r.total).toBe(9952);
  expect(r.entradas.map((e) => e.encoding)).toEqual(['br', 'identity', 'gzip']);
  expect(r.entradas.every((e) => e.url === ALVO)).toBe(true);
  expect(r.entradas[1]).toMatchObject({ dsize: 775145, expiraEm: 604800 });
  // O último campo da chave é o hash da QUERY: A6E90000 é a query vazia; o 5FC258E7 nasceu de um
  // `?jbv=<ts>` — cada carimbo distinto vira uma entrada NOVA de ~213 KB no cache.
  expect(r.entradas[2].chave).toMatch(/&GZ=1&000&5FC258E7&$/);
});

test('icm: o parse lê o subrc de cada invalidação e só diz ok quando todos vieram 0', () => {
  const bom = parseCacheOutput(`INVAL url=${ALVO} coption=0 subrc=0\nINVAL url=${ALVO} coption=1 subrc=0\nTOTAL 9952`);
  expect(bom.ok).toBe(true);
  expect(bom.invalidacoes).toHaveLength(2);
  const ruim = parseCacheOutput(`INVAL url=${ALVO} coption=0 subrc=0\nINVAL url=${ALVO} coption=1 subrc=4`);
  expect(ruim.ok).toBe(false);
});

test('icm: envenenado é VAZIO em uma variante E cheio em outra — 200 com 0 byte sozinho não basta', () => {
  const medido = [ // o que o S4H devolveu antes da cura
    { encoding: 'gzip', status: 200, bytes: 0 },
    { encoding: 'identity', status: 200, bytes: 774788 },
    { encoding: 'br', status: 200, bytes: 774788 },
  ];
  expect(diagnosticar(medido)).toMatchObject({ envenenado: true, encodingsVazios: ['gzip'], tamanho: 774788 });
  // depois da cura
  expect(diagnosticar(medido.map((r) => ({ ...r, bytes: 774788 }))).envenenado).toBe(false);
  // recurso legitimamente vazio (todas as variantes 0) não é falso positivo
  expect(diagnosticar(medido.map((r) => ({ ...r, bytes: 0 }))).envenenado).toBe(false);
  // 404 não conta como variante viva
  expect(diagnosticar([{ encoding: 'gzip', status: 404, bytes: 0 }, { encoding: 'identity', status: 404, bytes: 1064 }]).envenenado).toBe(false);
});

test('icm: o driver de invalidação dispara as DUAS coptions por URL e depois relista', () => {
  const src = buildInvalidarCacheSource('Y_ICMCACHE_I', [ALVO, ALVO], { global: true });
  expect(src.match(/ICM_CACHE_INVALIDATE_ONE/g)).toHaveLength(4); // 2 URLs × coption 0 e 1
  expect(src).toContain(`name = '${ALVO}' coption = 0 global = 1`);
  expect(src).toContain(`name = '${ALVO}' coption = 1 global = 1`);
  // URLs repetidas não podem colidir no nome da variável do LOOP
  expect(src).toContain('DATA(e_0)');
  expect(src).toContain('DATA(e_1)');
  expect(buildInvalidarCacheSource('Y_X', [ALVO])).toContain('global = 0');
});

test('icm: o driver de leitura filtra por trecho do nome, e sem filtro lista tudo', () => {
  expect(buildLerCacheSource('Y_ICMCACHE_R', 'sap-ui-core')).toContain("WHERE name CS 'sap-ui-core'");
  expect(buildLerCacheSource('Y_ICMCACHE_R')).toContain('LOOP AT entries INTO DATA(e).');
  expect(buildLerCacheSource('Y_ICMCACHE_R', "o'brien")).toContain("CS 'o''brien'");
});
