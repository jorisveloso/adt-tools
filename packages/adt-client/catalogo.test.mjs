// catalogo.test.mjs — docs/tipos.md (o catálogo) tem de ser exatamente o que scripts/catalogo.mjs
// gera dos módulos de hoje. Falhou aqui = alguém mudou um módulo e não rodou `npm run catalogo`.

import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderCatalogo } from './scripts/catalogo.mjs';
import { MODULOS } from './tipos/index.mjs';

const norm = (s) => String(s).replace(/\r\n/g, '\n');

test('docs/tipos.md está em dia com tipos/*.mjs', () => {
  const atual = norm(readFileSync(new URL('./docs/tipos.md', import.meta.url), 'utf8'));
  expect(atual).toBe(norm(renderCatalogo(MODULOS)));
});

test('catálogo lista todos os tipos e a tabela de campos do esquema', () => {
  const md = renderCatalogo(MODULOS);
  for (const k of Object.keys(MODULOS)) expect(md).toContain(`### \`${k}\``);
  expect(md).toContain('| `libKey` | sim | string |');
  expect(md).toContain('| `deploy` | não | function |');
  expect(md).toMatch(new RegExp(`^${Object.keys(MODULOS).length} tipos de objeto tratados`, 'm'));
});
