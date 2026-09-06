// vitest.config.mjs — os testes deste pacote.
//
// Existe também para ser a FRONTEIRA do projeto: sem um config aqui, o vitest rodado de dentro do
// pacote sobe a árvore, acha o `vitest.config.mjs` da raiz (que define `projects`) e morre no
// startup com "No projects were found" — medido em 06/09/2026 rodando `pnpm -r test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['*.test.mjs'] },
});
