// vitest.config.mjs (raiz) — rodar a suíte DA RAIZ do monorepo.
//
//   npx vitest run                     # os 7 pacotes
//   npx vitest run --project adt-client
//
// Sem este arquivo, o vitest invocado na raiz ignorava o `vitest.config.mjs` de cada pacote e
// varria o monorepo com o include default: os specs do wdio em `packages/adt-client/examples/wdi5*`
// (outro runner, dependência `wdio-ui5-service` que não está instalada) entravam na varredura e
// faziam a suíte falhar — medido em 05-06/09/2026. Com `projects`, cada pacote entra com o SEU
// config, e a decisão que já estava lá ("só os testes da lib") passa a valer também da raiz:
// examples NÃO entram no vitest, são do wdio (`examples/wdi5*/wdio.conf.js`).
//
// O glob é `packages/adt-*` e não `packages/*` de propósito: `packages/` também guarda o
// `.abapgit.log` (log de runtime, fora do git), e um glob que casa arquivo solto derruba o vitest
// no startup com "projects glob matched a file".
//
// `pnpm test` continua sendo `pnpm -r test`: cada pacote roda o próprio `vitest run`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { projects: ['packages/adt-*'] },
});
