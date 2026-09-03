// tipos/_xml.mjs — helpers PUROS para montar os XML de create/body. Sem I/O.
// (Arquivos `_*` nesta pasta NÃO são módulos de tipo — o índice os ignora.)

/** Escapa texto para atributo/conteúdo XML. É o mesmo `esc` que vivia em adt-client.mjs. */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const XML_PREF = `<?xml version="1.0" encoding="UTF-8"?>\n`;

export const pkgRef = (pkg) => `<adtcore:packageRef adtcore:name="${esc(pkg)}"/>`;

export const pad0 = (n, w) => String(n).padStart(w, '0');
