// vitest.config.mjs — só os testes da lib. `examples/wdi5` tem specs do wdio (outro runner).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['*.test.mjs', 'tipos/*.test.mjs', 'scripts/*.test.mjs'] },
});
