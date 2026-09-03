// wdio.conf.js — harness wdi5 contra um app Fiori/UI5 **já deployado** no ABAP (BSP repository).
// Validado 2026-08-31 no s4h 758 (fila 33); receita e gotchas: docs/receita-wdi5-fiori.md § 7.
//
// Diferença para o preview `feap` (examples/wdi5): **só a URL**. Auth (injeção de cookie), injeção
// manual do wdi5 e os asserts são os mesmos.
//
// Config por env: SAP_BASE_URL, SAP_CLIENT, SAP_USER, SAP_PASSWORD, SAP_APP (nome da BSP
// application = OBJ_NAME do WAPA na TADIR — `listarAppsUi5` do módulo `adt-client/ui5` lista).
// ⚠️ senha com '#': NÃO use --env-file (o parser do Node trunca ali).

export function urlApp() {
  const { SAP_BASE_URL, SAP_CLIENT, SAP_APP } = process.env;
  if (!SAP_BASE_URL || !SAP_APP) throw new Error('defina SAP_BASE_URL e SAP_APP (nome da BSP application).');
  // sap-language=EN mantém estável o texto do botão Go do Fiori Elements.
  return `${SAP_BASE_URL}/sap/bc/ui5_ui5/sap/${SAP_APP.toLowerCase()}/index.html` +
    `?sap-client=${SAP_CLIENT}&sap-language=EN`;
}

export const config = {
  runner: 'local',
  specs: ['./test/specs/**/*.test.js'],
  maxInstances: 1,
  capabilities: [{
    browserName: 'chrome',
    // ⚠️ O PAR browser+driver é o gotcha nº 1 deste harness (medido 2026-08-31):
    //  • sem nada, o wdio dirige o Chrome INSTALADO com o ChromeDriver que ele baixou — e quando o
    //    driver adianta uma major o run morre em "session not created ... only supports Chrome
    //    version N" (Chrome 151 do sistema × ChromeDriver 152);
    //  • com `browserVersion`, o wdio baixa o par Chrome-for-Testing casado — a sessão sobe, mas o
    //    `injectUI5` do wdi5 PENDURA (5 tentativas, 151 e 152, timeout de 180 s; o `execute/sync`
    //    chega a parar de responder). Com o Chrome do sistema + driver da mesma versão, passa.
    // Por isso: binário do sistema + driver apontado à mão (`CHROMEDRIVER_BIN`, o do cache do wdio
    // que casa com o Chrome instalado).
    'goog:chromeOptions': {
      ...(process.env.CHROME_BIN ? { binary: process.env.CHROME_BIN } : {}),
      args: ['--headless=new', '--window-size=1600,1000', '--disable-gpu'],
    },
    ...(process.env.CHROMEDRIVER_BIN ? { 'wdio:chromedriverOptions': { binary: process.env.CHROMEDRIVER_BIN } } : {}),
  }],
  logLevel: 'warn',
  baseUrl: urlApp(),
  waitforTimeout: 30000,
  connectionRetryTimeout: 120000,
  services: ['ui5'],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 180000 },
  wdi5: {
    logLevel: 'error',
    waitForUI5Timeout: 60000,
    // Auth por cookie: o start() navegaria sem cookie e a injeção automática falharia.
    skipInjectUI5OnStart: true,
  },
};
