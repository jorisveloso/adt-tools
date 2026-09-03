// tipos/numberRangeObject.test.mjs — teste irmão: contrato comum + o XML e o JSON PROVADOS por
// spike (S4H 758, 2026-09-01). Não "corrija" o snapshot para o teste passar.
import { test, expect } from 'vitest';
import mod, { buildNrobSource } from './numberRangeObject.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('numberRangeObject: o shell é byte-idêntico ao que o POST 201 aceitou — version="inactive"', () => {
  expect(mod.createBody(N, P, D)).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<blue:blueSource xmlns:blue=\"http://www.sap.com/wbobj/blue\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"NROB/NRO\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\" adtcore:version=\"active\"><adtcore:packageRef adtcore:name=\"$TMP\"/></blue:blueSource>".replace('adtcore:version="active"', 'adtcore:version="inactive"'));
});

test('numberRangeObject: o `version="active"` do APLO é justamente o que quebra aqui', () => {
  // 400 NR 870 "O objeto não existe" — e o objeto é criado assim mesmo. Ver `erros`/`desmentidos`.
  expect(mod.createBody(N, P, D)).toContain('adtcore:version="inactive"');
  expect(mod.ct).toBe('application/vnd.sap.adt.blues.v1+xml');   // plural, como o APLO
  expect(mod.forma).toBe('json');
  expect(mod.ativacaoJson).toBe('mesmaSessao');                  // ao contrário do APLO (nenhuma) e do SAJC (sessaoNova)
});

test('numberRangeObject: o fonte é JSON no formato AFF (nrob-v1.json), idioma em MINÚSCULAS', () => {
  const fonte = buildNrobSource('POC fila 44', { dominio: 'num10', percentual: 10.0 });
  expect(JSON.parse(fonte)).toEqual({
    formatVersion: '1',
    header: { description: 'POC fila 44', originalLanguage: 'pt' },
    interval: { numberLengthDomain: 'NUM10', percentWarning: 10, subType: '', untilYear: false, rolling: false, prefix: false },
    configuration: { buffering: 'none', bufferedNumbers: 0 },
  });
  expect(fonte.endsWith('\n')).toBe(true);
});

test('numberRangeObject: `transactionId` só entra quando informado (o schema não o exige)', () => {
  expect(JSON.parse(buildNrobSource('x', { dominio: 'NUM10' })).configuration.transactionId).toBeUndefined();
  expect(JSON.parse(buildNrobSource('x', { dominio: 'NUM10', transacao: 'snum' })).configuration.transactionId).toBe('SNUM');
});

test('numberRangeObject: guard-rails do schema, antes da rede', () => {
  expect(mod.nomeacao.max).toBe(10);   // TNRO-OBJECT CHAR 10
  expect(() => mod.validar({ name: 'YJBV_POC_A' })).toThrow(/exige \{ source \}/);
  expect(() => mod.validar({ name: 'YJBV_POC_A', dominio: 'NUM10', percentual: 150 })).toThrow(/0\.1\.\.99\.9/);
  expect(() => mod.validar({ name: 'YJBV_POC_A', dominio: 'NUM10', percentual: 0 })).toThrow(/0\.1\.\.99\.9/);
  expect(() => mod.validar({ name: 'YJBV_POC_A', dominio: 'NUM10', buffering: 'turbo' })).toThrow(/mainBuffer \| parallel \| none/);
  expect(() => mod.validar(mod.exemplo.opts)).not.toThrow();
  expect(() => mod.validar({ name: 'YJBV_POC_A', source: '{}' })).not.toThrow();
});

test('numberRangeObject: a prova é a TNRO, e só existe DEPOIS do activate', () => {
  const p = mod.prova('yjbv_poc_a');
  expect(p.tabela).toBe('TNRO');
  expect(p.where).toEqual(["OBJECT = 'YJBV_POC_A'"]);
  expect(p.espera).toMatch(/DEPOIS do activate/);
});
