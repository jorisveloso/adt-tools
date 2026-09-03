# Harness wdi5 — esqueleto executável

Cópia funcional do harness validado em 2026-08-26 (receita completa e gotchas:
`docs/receita-wdi5-fiori.md`). Dirige o preview Fiori Elements de um serviço RAP OData V4
(ou qualquer app UI5 acessível por HTTP) em Chrome headless, com autenticação on-premise
por **injeção de cookie** — o browser nunca manda `Authorization` (Basic no browser pendura
XHR no headless e invalida o CSRF do `$batch`; medido, ver receita §3).

## Uso

```bash
npm init -y
npm i -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter wdio-ui5-service
# "type": "module" no package.json
```

Copie `wdio.conf.js` e `test/specs/preview.test.js`, exporte as variáveis e rode:

```bash
# NUNCA via --env-file se a senha tiver '#' — o parser do Node trunca ali
export SAP_BASE_URL=http://host:porta
export SAP_CLIENT=999
export SAP_USER=usuario
export SAP_PASSWORD=senha
export SAP_SRVB=ZMEU_BINDING        # service binding OData V4 categoria 0 (UI), publicado
export SAP_ENTITY_SET=MinhaEntidade # alias exposto na SRVD
npx wdio run wdio.conf.js
```

O spec: injeta cookie, abre o preview `feap`, acha a FilterBar, aperta o Go, espera as linhas,
confere o conteúdo da primeira e salva `app.png` (assert visual — o agente lê o PNG).

Validado com wdio 9.31 + wdio-ui5-service 3.0.11 + Chrome gerenciado pelo próprio wdio,
contra S/4 release 758.
