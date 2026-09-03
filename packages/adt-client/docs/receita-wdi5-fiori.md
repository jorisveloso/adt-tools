# Receita — wdi5 dirigindo o preview Fiori Elements de um serviço RAP

**Medido 2026-08-26** no laboratório (S/4 release 758, mandante de POC, objetos `YJBV_POC_*` em
`$TMP`). Prova completa: superfície RAP criada por ADT REST → preview Fiori Elements servido pelo
próprio ADT → wdi5 (WebdriverIO + wdio-ui5-service) acha controles UI5, aperta o Go e a tabela
recebe linhas do OData V4. Nenhum Eclipse, nenhum BAS, nenhum app deployado.

**Piso:** browser Chromium na máquina do agente + Node ≥ 18; no SAP, os mesmos pisos do RAP OData
V4 (SRVB publicável) e serviços ADT ativos. O preview `feap` existe onde o ADT de service binding
OData V4 existe (S/4; não conte com ele em ECC).

## 1. A superfície-alvo mínima (arrange, por ADT REST)

Read-only já basta para o preview: CDS com `@UI` **inline** (dispensa DDLX), SRVD, SRVB
**categoria 0 (UI)** + publish — receitas de cada tipo na skill `adt-objetos`.

```
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'POC wdi5'
@UI.headerInfo: { typeName: 'Tabela', typeNamePlural: 'Tabelas' }
define view entity <CE> as select from dd02l
{
      @UI.lineItem: [{ position: 10, importance: #HIGH }]
  key tabname  as Tabela,
      @UI.lineItem: [{ position: 20, importance: #HIGH }]
      tabclass as Classe,
      @UI.lineItem: [{ position: 30 }]
      as4user  as Autor
}
where as4local = 'A'
```

Dois gotchas de modelo V4 pagos aqui (ambos silenciosos até o runtime — detalhe na `adt-objetos`):

- **View cuja única chave é o campo de mandante (T000: `key mandt`) → `Metadata_Error` 500** na
  raiz do serviço e no `$metadata`. O runtime A2X remove o campo cliente do modelo e a entidade
  fica sem chave. Fonte com chave de verdade (DD02L: `tabname`) resolve.
- **Campo CHAR1 pode virar `Edm.Boolean`** (ex.: `contflag` da DD02L): a linha que carrega `'C'`
  quebra a serialização com `CX_PARAMETER_INVALID_RANGE` "o parâmetro <VALUE> tem o valor
  inválido C" — o serviço responde, a query sem essa linha funciona, e só o filtro que a alcança
  estoura. Não exponha CHAR1 "flag" que não seja X/vazio.

## 2. A URL do preview Fiori Elements (o que o botão do Eclipse abre)

`GET /sap/bc/adt/businessservices/odatav4/feap?feapParams=<blob>` devolve uma página HTML com um
app `sap.fe.templates.ListReport` completo, bootstrapado do UI5 público do próprio servidor.

O `feapParams` (lido de `CL_ADT_ODATAV4_FEAP=>GET_SERVICE_INFO`, confirmado por execução):

1. String plana de **7 campos separados por `##`**:
   `serviceUrl##entitySet##navProperty##secondaryEntitySet##serviceName##serviceVersion##serviceGroupName`
   - `serviceUrl`: a URL de runtime do serviço (obrigatória não-vazia, mas o servidor **re-deriva**
     a efetiva do registro do binding);
   - `entitySet`: o alias exposto na SRVD;
   - campos 3–4 podem ficar vazios (sem navegação);
   - **campos 5 e 7 = o nome do SRVB** (⚠️ não o SRVD — com o SRVD o app nasce com
     `mainService.uri` VAZIO e morre calado), campo 6 = `0001`.
2. Cada caractere da string é deslocado **+20 no codepoint Unicode** (o servidor subtrai 20);
3. URL-encode do resultado.

```js
const encodeFeap = (s) => [...s].map((c) => String.fromCodePoint(c.codePointAt(0) + 20)).join('');
const plano = `${serviceUrl}##${entitySet}######${SRVB}##0001##${SRVB}`;
const url = `${base}/sap/bc/adt/businessservices/odatav4/feap` +
  `?feapParams=${encodeURIComponent(encodeFeap(plano))}&sap-client=${client}&sap-language=EN`;
```

Erros de formato despistam: params em texto plano → `500 "Uma linha com o índice 2 não está
contida na tabela"` (o decode produziu lixo sem `##`).

A URL de runtime registrada usa o **nome do binding nos dois lugares**:
`/sap/opu/odata4/sap/<srvb>/srvd/sap/<srvb>/0001/` (não o nome da SRVD — ambos respondem, mas o
registro é esse).

## 3. Autenticação do browser — o que funciona e o que pendura

| Caminho | Resultado medido |
|---|---|
| `sap-user`/`sap-password` na query | Autentica **só o documento**. As XHRs do app (lrep, odata4) levam **401 de desafio e ficam PENDENTES para sempre** no headless (não há diálogo). Sintoma no wdi5: timeout do autowaiter com "2 open XHRs". |
| Provider `BasicAuth` do wdi5 (cache de credenciais do Chrome) | App carrega, mas o **`$batch` morre com 403 "CSRF token is invalid"** (e o retry idem). No Node, Basic+cookie+token dá 200 — o defeito é do fluxo Basic-no-browser; não perca tempo caçando: use cookie. **Confirmado também com humano no Edge** (popup de logon Basic, sem automação): mesmo par de erros "Token CSRF inválido" + "$batch failed" — não é quirk de headless nem do wdi5. |
| **Injeção de cookie** (logon em Node com Basic, `setCookies` no browser, navegar SEM credenciais) | ✅ Tudo funciona: documento, lrep, `$metadata`, `$batch` com CSRF. O browser nunca manda `Authorization`; cookie é o mesmo território já medido na receita de consumo OData. |

O passo-a-passo da injeção (no `before()` do spec):

```js
// 1) logon em Node — colhe SAP_SESSIONID + sap-usercontext do set-cookie
const r = await fetch(urlPreview, { headers: { Authorization: 'Basic ' + btoa(user + ':' + pass) } });
const cookies = r.headers.getSetCookie().map(parseNomeValor);
// 2) para setar cookie é preciso ESTAR no domínio: página pública serve
await browser.url(`${base}/sap/public/bc/ui5_ui5/resources/sap-ui-version.json`);
await browser.setCookies(cookies);
// 3) o app, autenticado só por cookie
await browser.url(urlPreview);
// 4) injeção manual do wdi5
await new Service().injectUI5();
```

## 4. O projeto wdi5

```
npm i -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter wdio-ui5-service
```
(validado com wdio 9.31 + wdio-ui5-service 3.0.11, Chrome headless gerenciado pelo próprio wdio.)

`wdio.conf.js` essencial:

```js
export const config = {
  runner: 'local',
  specs: ['./test/specs/**/*.test.js'],
  capabilities: [{ browserName: 'chrome',
    'goog:chromeOptions': { args: ['--headless=new', '--window-size=1600,1000'] } }],
  baseUrl: urlPreview,            // o serviço navega para cá no start()
  services: ['ui5'],
  framework: 'mocha',
  mochaOpts: { ui: 'bdd', timeout: 180000 },
  wdi5: { waitForUI5Timeout: 60000, skipInjectUI5OnStart: true }, // injeção manual (auth por cookie)
};
```

Gotchas do harness, todos pagos:

- **`browser.url()` APAGA a bridge injetada** — "WDI5 is not available in the browser context".
  Navegou de novo → `await new Service().injectUI5()` de novo. (Por isso `skipInjectUI5OnStart`
  no fluxo de cookie: o `start()` do serviço navega sem cookie e a injeção automática falharia.)
- **Credenciais do BasicAuthenticator** (se um dia for usado) vêm das envs `wdi5_username` /
  `wdi5_password` — setar em JS no `wdio.conf` (senha com `#` não passa pelo `--env-file`).
- **FE ListReport não carrega dados sozinho**: apertar o **Go** da FilterBar
  (`sap.m.Button` com `text: 'Go'` — fixe `sap-language=EN` na URL para o texto ser estável).
- A tabela do FE V4 é `sap.ui.mdc.Table` com uma **`sap.m.Table` interna** (`…-innerTable`);
  contagem de linhas sai do inner (`getItems()`), não do mdc.

O spec que prova o ciclo (asControl → press → assert em linhas):

```js
it('aperta Go e a tabela recebe linhas do OData', async () => {
  const go = await browser.asControl({
    selector: { controlType: 'sap.m.Button', properties: { text: 'Go' } } });
  await go.press();
  const contagem = await browser.executeAsync((done) => { /* poll no registry:
    sap.m.Table → getItems().length; sap.ui.table.Table → getRows() com contexto */ });
  expect(contagem).toBeGreaterThan(0);
});
```

Assert de conteúdo: `getItems()[0].getBindingContext().getObject()` devolve a entidade JSON — os
nomes das propriedades são os elementos do CDS, como sempre no V4.

## 5. Limites conhecidos

- O preview `feap` é um app **gerado** (ListReport/ObjectPage padrão): serve para provar serviço,
  anotações `@UI` e o canal wdi5 — não para testar um app Fiori custom. Esse é deployado no próprio
  sistema, e o wdi5 aponta para a URL dele: **medido em 2026-08-31, § 7** — a auth e o harness são
  os mesmos, o que muda são os SELETORES (FE V2 × FE V4) e o par Chrome × ChromeDriver.
- Diagnóstico de "app não carrega": `performance.getEntriesByType('resource')` +
  `sap.ui.core.Element.registry` via `browser.execute` mostram o que travou (request com
  `responseStatus: 0` = desafio de auth pendurado) — antes de culpar o wdi5.
- BTP/SAML é outro provider de auth do wdi5 (não medido aqui; on-premise Basic → cookie).

## 6. Esqueleto executável e assert visual

- **`examples/wdi5/`** tem o harness completo parametrizado por env (`wdio.conf.js` +
  `preview.test.js`): copiar e rodar, não reconstruir de memória.
- **Screenshot como assert visual:** `browser.saveScreenshot('./app.png')` **depois** do poll de
  linhas (antes fotografa a tabela vazia). O agente lê o PNG e vê o app renderizado — validado
  2026-08-26; é a prova visual sem depender de login manual no browser, que com Basic morre no
  CSRF (§3).

## 7. App Fiori CUSTOM já deployado (BSP repository)

**Medido 2026-08-31** no s4h 758, mandante 250, **só leitura — nada foi criado, alterado ou apagado
no sistema**: os alvos são apps do cliente que já estavam lá. Harness executável:
**`examples/wdi5-app/`**. A promessa do item ("só a URL muda") **se confirmou**, com três desvios
que custam a tarde de quem não sabe: os seletores (FE V2 ≠ FE V4), o gesto de navegar (muda com o
tipo de tabela) e o par Chrome × ChromeDriver.

### 7.1 Achar o app — a TADIR não basta

O nome que entra na URL é o da **BSP application** (`OBJ_NAME` do `WAPA` na TADIR). Módulo
`adt-client/ui5` (só leitura, sem driver — `dataPreview` + GET pelo ICM):

```js
import { listarAppsUi5, sondarApp, urlDoApp } from 'adt-client/ui5';
const apps = await listarAppsUi5(conexao);                 // { app, pacote, autor }
const alvo = await sondarApp(conexao, 'ZBSP_VENDAS');      // servido? template? entitySet? tabela?
```

Números do s4h 758: **278 apps custom na TADIR, 242 servem `manifest.json`, 35 devolvem 404** (linha
na TADIR sem conteúdo no repositório BSP) e 1 dá 403. Dos 239 com `mainService` OData, 213 têm
`$metadata` 200 e **155 têm dados**. Ou seja: escolher o alvo por nome bonito é loteria — sonde.

A URL é `/sap/bc/ui5_ui5/sap/<app em minúsculas>/index.html?sap-client=<mandante>&sap-language=EN`
(o `index.html` do app deployado bootstrapa o componente direto: não depende do launchpad). O FLP,
quando for preciso, é `/sap/bc/ui5_ui5/**ui2**/ushell/shells/abap/FioriLaunchpad.html` — o caminho
sem `ui2` é 404 no 758.

### 7.2 O que muda no spec

| | preview `feap` (§ 2–4) | app deployado do cliente |
|---|---|---|
| Template | Fiori Elements **V4** | Fiori Elements **V2** (`@sap/generator-fiori:lrop`) |
| Filtro | `sap.ui.mdc.FilterBar` | `sap.ui.comp.smartfilterbar.SmartFilterBar` |
| Tabela | `sap.ui.mdc.Table` + `sap.m.Table` interna | o `manifest` decide: `tableSettings.type` |
| Linhas | `getItems()` da interna | `sap.m.Table` → `getItems()`; `sap.ui.table.Table` → `getRows()` com contexto |
| Botão Go | igual (`sap.m.Button` text `Go`) | igual |

`controleDaTabela(resumo.tabela)` do módulo `ui5` faz essa tradução: `ResponsiveTable` →
`sap.m.Table`; `AnalyticalTable`/`GridTable`/`TreeTable` → `sap.ui.table.Table`. Um poll que só olha
`sap.m.Table` conta **zero** num app GridTable e o teste "falha" sem que nada esteja errado.

### 7.3 Navegar para a Object Page — sete formas medidas

O degrau que prova que é um app de verdade (não uma tabela solta) é o clique na linha. **O gesto
depende da família da tabela**, e a maioria das formas não faz nada — sem erro:

| Forma | `sap.m.Table` (ResponsiveTable) | `sap.ui.table.Table` (Grid/Analytical) |
|---|---|---|
| `press()` do wdi5 no item/linha | ✅ **navega** | ❌ nada |
| `firePress()` por `browser.execute` | ❌ estoura `Maximum call stack size exceeded` | ❌ a Row não tem `firePress` |
| `getDomRef().click()` | ❌ nada | ❌ nada |
| clique REAL do WebDriver (`$(#id).click()`) na linha ou na célula | — | ❌ nada |
| `fireCellClick` programático | — | ❌ nada |
| **`firePress` no `sap.ui.table.RowActionItem` `type: 'Navigation'`** (o chevron `>`) | — | ✅ **navega** |

Dois gotchas embutidos:

- **`browser.execute` que devolve um controle UI5 estoura** `Maximum call stack size exceeded` (o
  retorno de `firePress` é o próprio controle e o WebDriver tenta serializá-lo). Termine o corpo com
  `return null`. Com isso, o `firePress` do RowActionItem passou a funcionar.
- No GridTable o `selectionBehavior` é `RowSelector`: clicar na linha **não é** um gesto de
  navegação nesse app — o chevron é.

### 7.4 O assert de navegação que engana

`sap.uxap.ObjectPageLayout` **existe no registry antes de qualquer navegação** — o FE V2 instancia a
view da OP junto com o List Report. Um teste que só conta instâncias passa sem ter navegado (foi o
que aconteceu na primeira rodada: verde com a tela ainda no List Report). O que prova:

```js
const visivel = op.filter((p) => { const d = p.getDomRef(); return d && d.offsetHeight > 0; });
// + hash com a chave da entidade: #/ZDD_VENDAS(DocumentoVendas='1',ItemPedido='000010')
```

E o mesmo vale para os dados: **"tem linha" não é "tem dado"** — a primeira linha do `ZDD_VENDAS`
vem toda em branco (registro real da view), e um `expect(primeira).not.toBe(null)` passa com ela.
Conte as linhas cujo contexto tem ao menos um campo preenchido (20 linhas / 19 com conteúdo, medido).

### 7.5 O par Chrome × ChromeDriver (o que mais custou)

Sete execuções, três configurações:

| Configuração | Resultado |
|---|---|
| Chrome do sistema + ChromeDriver da mesma versão | ✅ passa (31 s de spec) |
| Chrome do sistema + driver uma major à frente (o wdio baixou 152 sozinho) | ❌ `session not created: This version of ChromeDriver only supports Chrome version 152` |
| `browserVersion` (Chrome-for-Testing gerenciado pelo wdio), 151 e 152 | ❌ sessão sobe, página carrega (`sap.ui.getCore` existe) e o **`injectUI5` pendura** até o timeout de 180 s; depois o próprio `execute/sync` deixa de responder |

Por isso o `wdio.conf.js` do exemplo aponta **os dois binários por env** (`CHROME_BIN`,
`CHROMEDRIVER_BIN`) em vez de deixar o wdio escolher. E: **run travado deixa Chrome órfão** (18
processos sob `…\Temp\chrome\win64-*` numa medição) — o acúmulo trava as execuções seguintes; mate
os do `Temp` (nunca o Chrome do usuário) antes de repetir.

### 7.6 O que rodou

Dois apps do cliente, mesmo harness, só a env `SAP_APP` mudando:

- **`ZBSP_VENDAS`** (pacote `ZDEV_AND`, "Listagem de Vendas", `ZDD_VENDAS_CDS`, ResponsiveTable):
  4/4 — SmartFilterBar, Go → **20 linhas** (19 com conteúdo) de 2.649, e clique → Object Page do
  documento 1/item 10 com os campos na tela (PNG conferido).
- **`ZNFMRP02`** (pacote `ZNFM`, "Usuários", `ZNFMRP02_CDS`, GridTable): lista com **1.067** linhas
  e navegação pelo chevron → `#/ZNFMRP02('MVAACQUESTA1')`.

Fora de escopo (não medido): app rodando **dentro do FLP** (tile, catálogo e papel são
customizing/segurança), Object Page com edição/draft, e BTP/SAML (§ 5).
