# Harness wdi5 — app Fiori **deployado** no ABAP

Dirige por wdi5 um app UI5 que já está no sistema (BSP repository), não o preview gerado pelo ADT.
É o irmão de [`examples/wdi5`](../wdi5) (preview `feap` de serviço RAP): **a única diferença é a
URL** — auth por injeção de cookie, injeção manual do wdi5 e asserts são os mesmos.

Validado 2026-08-31 no s4h 758 contra dois apps custom do cliente (fila 33); a receita, com todos os
gotchas, está em [`docs/receita-wdi5-fiori.md`](../../docs/receita-wdi5-fiori.md) § 7.

## 1. Achar o app

O nome que vai em `SAP_APP` é o da **BSP application** (`OBJ_NAME` do `WAPA` na TADIR). O módulo
[`adt-client/ui5`](../../ui5.mjs) lista os que existem e diz quais o ICM realmente serve:

```js
import { listarAppsUi5, sondarApp } from 'adt-client/ui5';

const apps = await listarAppsUi5(conexao);              // 278 no s4h 758 (custom Z/Y)
const alvo = await sondarApp(conexao, 'ZBSP_VENDAS');
// { servido: true, url, template: 'fiori-elements-v2', entitySet: 'ZDD_VENDAS',
//   servico: '/sap/opu/odata/sap/ZDD_VENDAS_CDS/', tabela: 'ResponsiveTable', … }
```

⚠️ Estar na TADIR **não** é estar servido: 35 dos 278 devolvem 404 no `manifest.json`.

## 2. Rodar

```bash
npm init -y      # "type": "module"
npm i -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter wdio-ui5-service
```

```bash
# NUNCA via --env-file se a senha tiver '#' — o parser do Node trunca ali
export SAP_BASE_URL=http://host:porta
export SAP_CLIENT=250
export SAP_USER=usuario
export SAP_PASSWORD=senha
export SAP_APP=ZBSP_VENDAS          # nome da BSP application
# o par browser+driver (ver § 3): caminho do Chrome e do chromedriver da MESMA versão
export CHROME_BIN="C:\Program Files\Google\Chrome\Application\chrome.exe"
export CHROMEDRIVER_BIN="…\chromedriver\win64-<mesma versão>\chromedriver-win64\chromedriver.exe"
npx wdio run wdio.conf.js
```

O spec: injeta cookie, abre o app, acha a SmartFilterBar, aperta o **Go**, espera as linhas, confere
que elas têm **conteúdo** (não só que existem), clica numa linha e prova a navegação para a Object
Page — com `app-lista.png` e `app-objeto.png` como assert visual.

## 3. O gotcha que custa a tarde: o par Chrome × ChromeDriver

Medido 2026-08-31, 7 execuções:

| Configuração | Resultado |
|---|---|
| Chrome do sistema + driver que o wdio baixou (versões iguais) | ✅ passa |
| Chrome do sistema + driver uma major à frente | ❌ `session not created: This version of ChromeDriver only supports Chrome version N` |
| `browserVersion` (Chrome-for-Testing gerenciado pelo wdio), 151 e 152 | ❌ a sessão sobe, a página carrega — e o **`injectUI5` pendura** até o timeout (180 s); depois o próprio `execute/sync` para de responder |

Por isso o `wdio.conf.js` aponta os dois binários por env em vez de deixar o wdio escolher. Sintoma
de browser órfão: processos `chrome.exe` sob `…\Temp\chrome\win64-*` sobrando depois de um run
travado — mate-os antes da próxima tentativa (o acúmulo trava as execuções seguintes).
