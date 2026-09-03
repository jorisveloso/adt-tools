// tipos/applicationLogObject.test.mjs — teste irmão: contrato comum + o XML e o JSON PROVADOS por
// spike (S4H 758, 2026-08-31). Não "corrija" o snapshot para o teste passar.
import { test, expect } from 'vitest';
import mod, { buildAploSource } from './applicationLogObject.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('applicationLogObject: o shell é byte-idêntico ao que o POST 201 aceitou', () => {
  expect(mod.createBody(N, P, D)).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<blue:blueSource xmlns:blue=\"http://www.sap.com/wbobj/blue\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"APLO/TYP\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\" adtcore:version=\"active\"><adtcore:packageRef adtcore:name=\"$TMP\"/></blue:blueSource>");
});

test('applicationLogObject: o create é `blues.v1+xml` (plural) — os outros dão 415', () => {
  expect(mod.ct).toBe('application/vnd.sap.adt.blues.v1+xml');
  expect(mod.forma).toBe('json');
  expect(mod.ativacaoJson).toBe('nenhuma');   // nasce ativo e o PUT persiste: não há activate
});

test('applicationLogObject: o fonte é JSON no formato AFF, com idioma em MINÚSCULAS', () => {
  const fonte = buildAploSource('POC fila 29', [{ nome: 'poc', descricao: 'Sub' }, 'POC2']);
  expect(JSON.parse(fonte)).toEqual({
    formatVersion: '1',
    header: { description: 'POC fila 29', originalLanguage: 'pt' },
    subobjects: [{ name: 'POC', description: 'Sub' }, { name: 'POC2', description: '' }],
  });
  expect(fonte.endsWith('\n')).toBe(true);
});

test('applicationLogObject: guard-rails de nome e de subobjeto, antes da rede', () => {
  expect(mod.nomeacao.max).toBe(20);   // OBJNAME_MAXLENGTH do typestructure = BALOBJ-OBJECT CHAR 20
  expect(() => mod.validar({ name: 'YJBV_POC_LOG29' })).toThrow(/exige \{ source \}/);
  expect(() => mod.validar({ name: 'YJBV_POC_LOG29', subobjetos: ['X'.repeat(21)] })).toThrow(/BALSUBOBJ aceita 20/);
  expect(() => mod.validar(mod.exemplo.opts)).not.toThrow();
  expect(() => mod.validar({ name: 'YJBV_POC_LOG29', source: '{}' })).not.toThrow();
});

test('applicationLogObject: a prova é a BALOBJ (o objeto só é real se o BAL o aceitar)', () => {
  const p = mod.prova('YJBV_POC_LOG29');
  expect(p.tabela).toBe('BALOBJ');
  expect(p.where).toEqual(["OBJECT = 'YJBV_POC_LOG29'"]);
  expect(mod.testes[0].assert.console).toBe('CREATE subrc=0');
});
