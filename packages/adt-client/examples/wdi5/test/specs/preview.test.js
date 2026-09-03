// preview.test.js — dirige o preview Fiori Elements de um serviço RAP OData V4.
// Auth por INJEÇÃO DE COOKIE (logon em Node com Basic → setCookies no Chrome → navegar SEM
// credenciais). O browser nunca manda Authorization: Basic-no-browser pendura as XHRs no
// headless e invalida o CSRF do $batch — medido, ver docs/receita-wdi5-fiori.md §3.
import Service from 'wdio-ui5-service';
import { urlPreview } from '../../wdio.conf.js';

describe('preview Fiori Elements do serviço RAP', () => {
  before(async () => {
    const { SAP_BASE_URL, SAP_USER, SAP_PASSWORD } = process.env;

    // 1) logon em Node — colhe SAP_SESSIONID + sap-usercontext do set-cookie
    const r = await fetch(urlPreview(), {
      headers: { Authorization: 'Basic ' + Buffer.from(`${SAP_USER}:${SAP_PASSWORD}`).toString('base64') },
    });
    if (r.status !== 200) throw new Error(`logon falhou: HTTP ${r.status}`);
    const cookies = (r.headers.getSetCookie?.() ?? []).map((linha) => {
      const [par] = linha.split(';');
      const i = par.indexOf('=');
      return { name: par.slice(0, i), value: par.slice(i + 1) };
    });
    if (!cookies.some((c) => c.name.startsWith('SAP_SESSIONID'))) {
      throw new Error('logon não devolveu SAP_SESSIONID — cookies: ' + cookies.map((c) => c.name).join(','));
    }

    // 2) para setar cookie é preciso ESTAR no domínio; página pública do UI5 serve
    await browser.url(`${SAP_BASE_URL}/sap/public/bc/ui5_ui5/resources/sap-ui-version.json`);
    await browser.setCookies(cookies);

    // 3) o app, autenticado só por cookie
    await browser.url(urlPreview());

    // 4) injeção manual do wdi5 (skipInjectUI5OnStart na config).
    //    ⚠️ Qualquer browser.url() posterior APAGA a bridge — reinjete depois de navegar.
    await new Service().injectUI5();
  });

  it('carrega o app e o wdi5 enxerga a FilterBar', async () => {
    const filterBar = await browser.asControl({
      selector: { controlType: 'sap.ui.mdc.FilterBar' },
    });
    expect(await filterBar.getVisible()).toBe(true);
  });

  it('aperta Go, a tabela recebe linhas e o screenshot registra', async () => {
    // FE ListReport não carrega dados sozinho — o Go da FilterBar dispara o $batch.
    // sap-language=EN na URL mantém o texto do botão estável.
    const go = await browser.asControl({
      selector: { controlType: 'sap.m.Button', properties: { text: 'Go' } },
    });
    await go.press();

    // A tabela do FE V4 é sap.ui.mdc.Table com sap.m.Table interna — as linhas saem do inner.
    const contagem = await browser.executeAsync((done) => {
      let tentativas = 0;
      const laco = setInterval(() => {
        const els = sap.ui.core.Element.registry.filter((e) => e.isA('sap.m.Table'));
        const n = els.reduce((s, t) => s + t.getItems().length, 0);
        tentativas += 1;
        if (n > 0 || tentativas > 40) { clearInterval(laco); done(n); }
      }, 500);
    });

    // Assert visual: o PNG mostra o app renderizado (título com contagem, colunas @UI.lineItem,
    // dados) — e o agente consegue LER a imagem. Depois do poll, senão fotografa tabela vazia.
    await browser.saveScreenshot('./app.png');
    expect(contagem).toBeGreaterThan(0);
  });

  it('a primeira linha traz conteúdo do serviço', async () => {
    const primeira = await browser.execute(() => {
      const t = sap.ui.core.Element.registry.filter((e) => e.isA('sap.m.Table'))
        .find((x) => x.getItems().length > 0);
      return t ? t.getItems()[0].getBindingContext().getObject() : null;
    });
    // as propriedades são os elementos do CDS, como sempre no OData V4
    expect(primeira).not.toBe(null);
  });
});