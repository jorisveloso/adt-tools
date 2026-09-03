// tipos/applicationJobCatalog.test.mjs — teste irmão: contrato comum + o XML e o JSON PROVADOS por
// spike (S4H 758, 2026-09-01). Não "corrija" o snapshot para o teste passar.
import { test, expect } from 'vitest';
import mod, { buildSajcSource } from './applicationJobCatalog.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('applicationJobCatalog: o shell é o que o POST 201 aceitou — blues.v2 e version="inactive"', () => {
  expect(mod.createBody(N, P, D)).toBe(
    '<?xml version="1.0" encoding="UTF-8"?>\n<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" '
    + 'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZX_SNAP" adtcore:type="SAJC" '
    + 'adtcore:description="Desc &amp; &lt;x&gt; &quot;y&quot;" adtcore:masterLanguage="PT" '
    + 'adtcore:version="inactive"><adtcore:packageRef adtcore:name="$TMP"/></blue:blueSource>',
  );
});

test('applicationJobCatalog: é o primeiro "blue" em v2 — o v1 do APLO/NROB dá 415', () => {
  expect(mod.ct).toBe('application/vnd.sap.adt.blues.v2+xml');
  expect(mod.forma).toBe('json');
  expect(mod.ativacaoJson).toBe('sessaoNova');   // ao contrário do APLO (nenhuma) e do NROB (mesmaSessao)
});

test('applicationJobCatalog: o fonte é JSON AFF (sajc-v1.json), idioma em MINÚSCULAS', () => {
  const fonte = buildSajcSource('POC fila 47', { classe: 'yjbv_poc_cl_job' });
  expect(JSON.parse(fonte)).toEqual({
    formatVersion: '1',
    header: { description: 'POC fila 47', originalLanguage: 'pt' },
    generalInformation: { className: 'YJBV_POC_CL_JOB' },
  });
  expect(fonte.endsWith('\n')).toBe(true);
});

test('applicationJobCatalog: exitClasses e programName só entram quando informados', () => {
  const base = JSON.parse(buildSajcSource('x', { classe: 'CL_X' }));
  expect(base.exitClasses).toBeUndefined();
  expect(base.generalInformation.programName).toBeUndefined();
  const cheio = JSON.parse(buildSajcSource('x', { classe: 'CL_X', exitCheck: 'cl_chk', programa: 'rprog' }));
  expect(cheio.exitClasses).toEqual({ check: 'CL_CHK' });
  expect(cheio.generalInformation.programName).toBe('RPROG');
});

test('applicationJobCatalog: guard-rails antes da rede', () => {
  expect(mod.nomeacao.max).toBe(40);
  expect(() => mod.validar({ name: 'YJBV_POC_JOBC' })).toThrow(/exige \{ source \}/);
  expect(() => mod.validar({ name: 'YJBV_POC_JOBC', classe: 'Y'.repeat(31) })).toThrow(/30 caracteres/);
  expect(() => mod.validar(mod.exemplo.opts)).not.toThrow();
  expect(() => mod.validar({ name: 'YJBV_POC_JOBC', source: '{}' })).not.toThrow();
});

test('applicationJobCatalog: a prova é a APJ_W_JCE_ROOT, com a classe em REPORT_NAME', () => {
  const p = mod.prova('yjbv_poc_jobc');
  expect(p.tabela).toBe('APJ_W_JCE_ROOT');
  expect(p.where).toEqual(["JOB_CATALOG_ENTRY_NAME = 'YJBV_POC_JOBC'"]);
  expect(p.campos).toContain('REPORT_NAME');
  expect(p.espera).toMatch(/REPORT_NAME/);
});

test('applicationJobCatalog: o gotcha da sessão e o 500 do SAJT estão registrados', () => {
  expect(mod.guardRails.join(' ')).toMatch(/SESSÃO NOVA/);
  expect(mod.erros.some((e) => e.status === 500 && /template/i.test(e.correcao))).toBe(true);
  expect(mod.desmentidos.some((d) => /SAJT/.test(d.fato))).toBe(true);
});
