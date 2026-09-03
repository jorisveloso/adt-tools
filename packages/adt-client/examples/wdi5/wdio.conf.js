// wdio.conf.js — harness wdi5 validado 2026-08-26 (docs/receita-wdi5-fiori.md).
// Config via env: SAP_BASE_URL, SAP_CLIENT, SAP_USER, SAP_PASSWORD, SAP_SRVB, SAP_ENTITY_SET.
// ⚠️ Senha com '#': NÃO usar --env-file (o parser do Node trunca no '#') — exportar direto
//    ou ler o arquivo à mão num setup.

// feapParams do preview Fiori Elements: 7 campos '##', cada char +20 no codepoint.
// Campos 5 e 7 = o SRVB (não a SRVD — com a SRVD o app nasce com serviço vazio).
const encodeFeap = (s) => [...s].map((c) => String.fromCodePoint(c.codePointAt(0) + 20)).join('');

export function urlPreview() {
  const { SAP_BASE_URL, SAP_CLIENT, SAP_SRVB, SAP_ENTITY_SET } = process.env;
  const srvb = SAP_SRVB.toLowerCase();
  // URL de runtime REGISTRADA: o nome do binding aparece duas vezes.
  const serviceUrl = `/sap/opu/odata4/sap/${srvb}/srvd/sap/${srvb}/0001/`;
  const plano = `${serviceUrl}##${SAP_ENTITY_SET}######${SAP_SRVB}##0001##${SAP_SRVB}`;
  return `${SAP_BASE_URL}/sap/bc/adt/businessservices/odatav4/feap` +
    `?feapParams=${encodeURIComponent(encodeFeap(plano))}` +
    `&sap-client=${SAP_CLIENT}&sap-language=EN`;
}

export const config = {
  runner: 'local',
  specs: ['./test/specs/**/*.test.js'],
  maxInstances: 1,
  capabilities: [{
    browserName: 'chrome',
    'goog:chromeOptions': { args: ['--headless=new', '--window-size=1600,1000', '--disable-gpu'] },
  }],
  logLevel: 'warn',
  baseUrl: urlPreview(),
  waitforTimeout: 30000,
  connectionRetryTimeout: 120000,
  services: ['ui5'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 180000 },
  wdi5: {
    logLevel: 'error',
    waitForUI5Timeout: 60000,
    // O start() do serviço navega sem cookie (401): injeção automática falharia.
    // A auth (injeção de cookie) e o injectUI5() manual acontecem no before() do spec.
    skipInjectUI5OnStart: true,
  },
};