// config.mjs — de onde vêm as filas.
//
// As filas do adt-todo são arquivos markdown, uma por projeto, na pasta `docs/` DESTE pacote
// (padrão da casa). Quem quiser reutilizar uma fila de outro lugar (ex.: a `docs/fila.md` do
// jbv-adt-client) passa o caminho explicitamente às funções da lib — nunca confundimos a fila
// do adt-todo com as de fora.
//
// A lista de filas conhecidas mora em `projetos.json` (opcional). Sem ele, toda `*.md` na pasta de
// filas é uma fila; a fila "default" é a primeira na ordem alfabética.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILAS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'filas');

export function carregarProjetos() {
  const p = path.join(FILAS_DIR, 'projetos.json');
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { /* ilegível — segue na ordem alfabética */ }
  }
  return {};
}
