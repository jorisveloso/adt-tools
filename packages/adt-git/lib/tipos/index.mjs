// tipos/index.mjs — o REGISTRO de tipos de objeto, descoberto por pasta.
//
// Lê `tipos/*.mjs` UMA vez por processo (top-level await), importa cada módulo, valida contra o
// esquema (_esquema.mjs) e deriva o que o resto da lib e o CLI sempre consumiram: `TYPES[libKey]`,
// `TIPOS[codigo]`, `resolverTipo` & cia. Nada é gravado em disco — o catálogo legível
// (`docs/tipos.md`) é gerado à parte por `npm run catalogo`.
//
// Adicionar um tipo = criar `tipos/<libKey>.mjs` com o esquema completo. Não há índice a editar.
// Um módulo inválido (campo faltando, adtType duplicado, sinônimo ambíguo) DERRUBA o import da lib
// inteira, com a mensagem dizendo qual arquivo e o quê — falha alta, no load, de propósito.
//
// Ignorados: `index.mjs`, `_*.mjs` (helpers/esquema/registro) e `*.test.mjs`.
// Regra inegociável: um módulo de tipo NUNCA importa `../adt-client.mjs` — o ciclo com este
// top-level await travaria o carregamento. Só `../sap-connection.mjs`, `./_xml.mjs` e outros módulos.

import { readdir } from 'node:fs/promises';
import { montarRegistro, criarResolucao, normalizar } from './_registro.mjs';

const AQUI = new URL('./', import.meta.url); // URL, não path: funciona no Windows e em file://

const arquivos = (await readdir(AQUI))
  .filter((f) => f.endsWith('.mjs') && f !== 'index.mjs' && !f.startsWith('_') && !f.endsWith('.test.mjs'))
  .sort();

const modulos = [];
for (const f of arquivos) {
  const m = await import(new URL(f, AQUI));
  if (!m.default) throw new Error(`módulo de tipo ${f}: falta o default export (o objeto do esquema)`);
  modulos.push(m.default);
}

const registro = montarRegistro(modulos, arquivos);

/** Os módulos inteiros, por libKey. */
export const MODULOS = registro.MODULOS;
/** Projeção { coll, ct, accept?, source } por libKey — o `TYPES` que o adt-client sempre expôs. */
export const TYPES = registro.TYPES;
/** Código TADIR → { descricao, alvos: [{ libKey, adtType }] }. */
export const TIPOS = registro.TIPOS;
/** Sinônimo normalizado → { codigo, libKeys }. Exposto para o catálogo e para mensagens de ajuda. */
export const SINONIMOS = registro.SINONIMOS;

export const { resolverTipo, resolverTipoOpcional, alvoDoAdtType, codigoDaLibKey, todasAsLibKeys } = criarResolucao(registro);
export { normalizar };

/** Módulo por libKey, ou erro listando os conhecidos — nunca `undefined` silencioso. */
export function moduloDe(libKey) {
  const m = MODULOS[libKey];
  if (!m) throw new Error(`tipo "${libKey}" desconhecido; conhecidos: ${Object.keys(MODULOS).join(', ')}`);
  return m;
}
