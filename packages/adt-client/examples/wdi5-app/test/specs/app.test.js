// app.test.js — dirige um app Fiori/UI5 CUSTOM já deployado no ABAP (BSP repository).
// Auth por INJEÇÃO DE COOKIE, idêntica ao preview feap (docs/receita-wdi5-fiori.md § 3).
// Validado 2026-08-31 no s4h 758 contra `ZBSP_VENDAS` (ResponsiveTable) e `ZNFMRP02` (GridTable).
import Service from 'wdio-ui5-service';
import { urlApp } from '../../wdio.conf.js';

// Conta linhas nas DUAS famílias de tabela — qual delas o app usa é escolha do manifest
// (`tableSettings.type`), não do template: ResponsiveTable → sap.m.Table (getItems), Analytical/
// Grid/Tree → sap.ui.table.Table (getRows, e só as linhas COM binding context contam).
const contarLinhas = (done) => {
  let tentativas = 0;
  const laco = setInterval(() => {
    const reg = sap.ui.core.Element.registry;
    let n = 0;
    reg.filter((e) => e.isA('sap.m.Table')).forEach((t) => { n += t.getItems().length; });
    reg.filter((e) => e.isA('sap.ui.table.Table')).forEach((t) => {
      n += t.getRows().filter((r) => r.getBindingContext()).length;
    });
    tentativas += 1;
    if (n > 0 || tentativas > 40) { clearInterval(laco); done(n); }
  }, 500);
};

// "Tem linha" não é "tem dado": a view do cliente pode devolver registro em branco — medido, a
// primeira linha do ZDD_VENDAS vem toda vazia e um assert de `!== null` passaria com ela.
const linhasComConteudo = () => {
  const reg = sap.ui.core.Element.registry;
  const objetos = [];
  reg.filter((e) => e.isA('sap.m.Table')).forEach((t) => {
    t.getItems().forEach((i) => { const c = i.getBindingContext(); if (c) objetos.push(c.getObject()); });
  });
  reg.filter((e) => e.isA('sap.ui.table.Table')).forEach((t) => {
    t.getRows().forEach((r) => { const c = r.getBindingContext(); if (c) objetos.push(c.getObject()); });
  });
  const preenchido = (o) => Object.entries(o)
    .filter(([k]) => k !== '__metadata')
    .some(([, v]) => typeof v === 'string' && v.trim() && !/^0+$/.test(v.trim()));
  const uteis = objetos.filter(preenchido);
  return { total: objetos.length, comConteudo: uteis.length, amostra: uteis[0] || null };
};

describe('app Fiori custom deployado', () => {
  before(async () => {
    const { SAP_BASE_URL, SAP_USER, SAP_PASSWORD } = process.env;
    const r = await fetch(urlApp(), {
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
    // Para setar cookie é preciso ESTAR no domínio; página pública do UI5 serve.
    await browser.url(`${SAP_BASE_URL}/sap/public/bc/ui5_ui5/resources/sap-ui-version.json`);
    await browser.setCookies(cookies);
    await browser.url(urlApp());
    // ⚠️ Qualquer browser.url() posterior APAGA a bridge — reinjete depois de navegar.
    await new Service().injectUI5();
  });

  it('o wdi5 enxerga a FilterBar do List Report', async () => {
    // FE **V2** (o que o @sap/generator-fiori deploya): sap.ui.comp.smartfilterbar.SmartFilterBar.
    // No preview FE V4 do ADT o controle é sap.ui.mdc.FilterBar — é a diferença de seletor entre
    // os dois mundos; o resto do harness é igual.
    const fb = await browser.asControl({ selector: { controlType: 'sap.ui.comp.smartfilterbar.SmartFilterBar' } });
    expect(await fb.getVisible()).toBe(true);
  });

  it('aperta Go, a tabela recebe linhas do OData e o screenshot registra', async () => {
    // O List Report não carrega dados sozinho; sap-language=EN mantém o texto do botão estável.
    const go = await browser.asControl({ selector: { controlType: 'sap.m.Button', properties: { text: 'Go' } } });
    await go.press();
    const contagem = await browser.executeAsync(contarLinhas);
    await browser.saveScreenshot('./app-lista.png'); // depois do poll, senão fotografa a tabela vazia
    console.log('== linhas:', contagem);
    expect(contagem).toBeGreaterThan(0);
  });

  it('as linhas trazem conteúdo do serviço', async () => {
    const r = await browser.execute(linhasComConteudo);
    console.log('== conteúdo:', JSON.stringify(r).slice(0, 300));
    expect(r.comConteudo).toBeGreaterThan(0);
  });

  it('clicar na linha navega para a Object Page', async function () {
    // O gesto de navegar é DIFERENTE por família de tabela (medido — sete formas testadas):
    //  • sap.m.Table (ResponsiveTable): press do wdi5 no `sap.m.ColumnListItem`;
    //  • sap.ui.table.Table (Grid/Analytical): a linha NÃO navega (nem clique real do WebDriver na
    //    linha ou na célula, nem `fireCellClick`; o `selectionBehavior` é `RowSelector`) — quem
    //    navega é o **chevron**, o `sap.ui.table.RowActionItem` de `type: 'Navigation'`.
    const alvo = await browser.execute(() => {
      const preenchido = (c) => c && Object.entries(c.getObject())
        .filter(([k]) => k !== '__metadata')
        .some(([, v]) => typeof v === 'string' && v.trim() && !/^0+$/.test(v.trim()));
      for (const t of sap.ui.core.Element.registry.filter((e) => e.isA('sap.m.Table'))) {
        const item = t.getItems().find((i) => preenchido(i.getBindingContext()));
        if (item) return { via: 'item', id: item.getId() };
      }
      for (const t of sap.ui.core.Element.registry.filter((e) => e.isA('sap.ui.table.Table'))) {
        const linha = t.getRows().find((r) => preenchido(r.getBindingContext()));
        const acao = linha?.getRowAction?.()?.getItems?.().find((i) => i.getType() === 'Navigation');
        if (acao) return { via: 'rowAction', id: acao.getId() };
      }
      return null;
    });
    if (!alvo) return this.skip(); // app sem Object Page (freestyle, ou List Report sem navegação)
    console.log('== navegação por:', JSON.stringify(alvo));

    if (alvo.via === 'item') {
      await (await browser.asControl({ selector: { id: alvo.id } })).press();
    } else {
      // ⚠️ `browser.execute` que devolve um controle UI5 estoura "Maximum call stack size exceeded"
      // (serialização circular) — termine o corpo com `return null`.
      await browser.execute((id) => { sap.ui.getCore().byId(id).firePress({ row: null }); return null; }, alvo.id);
    }

    // ⚠️ "existe ObjectPageLayout no registry" é FALSO POSITIVO: a view da OP é instanciada antes
    // da navegação. O que prova é o par DOM visível + hash com a chave da entidade.
    const r = await browser.executeAsync((done) => {
      let tentativas = 0;
      const laco = setInterval(() => {
        const visiveis = sap.ui.core.Element.registry.filter((e) => e.isA('sap.uxap.ObjectPageLayout'))
          .filter((p) => { const d = p.getDomRef(); return d && d.offsetHeight > 0; });
        tentativas += 1;
        if (visiveis.length || tentativas > 40) { clearInterval(laco); done({ visiveis: visiveis.length, hash: location.hash }); }
      }, 500);
    });
    await browser.saveScreenshot('./app-objeto.png');
    console.log('== object page:', JSON.stringify(r));
    expect(r.visiveis).toBeGreaterThan(0);
    expect(r.hash).toMatch(/\(.+\)/); // #/<EntitySet>(<chave>)
  });
});
