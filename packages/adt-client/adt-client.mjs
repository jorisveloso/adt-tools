// adt-client.mjs — cliente ADT REST para consultar/criar/alterar objetos ABAP (sem Eclipse).
//
// ESTE ARQUIVO É O FLUXO ADT, NÃO O TRANSPORTE NEM O CONHECIMENTO POR TIPO:
//   • transporte (sessão, cookie, token CSRF, Authorization, `sap-client`) mora em `sap-connection.mjs`;
//   • o que a lib sabe de CADA tipo de objeto (coleção, media types, shell de create, gotchas, spike,
//     fluxo próprio quando o genérico não serve) mora em `tipos/<libKey>.mjs`, um arquivo por tipo,
//     descoberto por pasta em `tipos/index.mjs`. Adicionar um tipo = adicionar um arquivo lá.
//   Aqui ficam as primitivas (lock, source, activate…), os fluxos genéricos (`deploySource`,
//   `deployBody`), o despachante `deploy` e os guard-rails transversais.
//
// DUAS MOEDAS, e a diferença importa:
//   • `session` — as primitivas (`getObject`, `getSource`, `lock`, `setSource`, `call`) recebem uma
//     sessão viva. É o que o CLI de leitura usa, com a sessão que o `connect` cacheou.
//   • `conexao` — os orquestradores (`deploy*`, `activate*`, `dataPreview`, `runUnitTests`, …) recebem
//     a CONEXÃO e pedem a sessão a ela. Antes eles faziam `newSession(cfg)` por dentro, o que abria
//     um logon anônimo e batia em 401 sempre que a senha não estava no `cfg` — que é o caso aqui,
//     sempre. Ver o cabeçalho de `sap-connection.mjs`.
//   Monte a conexão com `conexaoAtual()` (de `session.mjs`) ou `criarConexao(cfg)`.
//
// CORREÇÕES herdadas do maestro (o original estava errado nas duas):
//   • `parseUnitResult` usa `[^>]*?` LAZY. Com o guloso, um `<testMethod/>` auto-fechado (método que
//     passou) engolia o `/` e fundia com o `</testMethod>` seguinte — SUBCONTANDO os testes.
//   • `activateMany` olha `hasError`. `activationExecuted="true"` NÃO significa sucesso: convive
//     com mensagens type="E" ("Aktivierung wurde abgebrochen"). Antes isso passava como ativado.
//
// Guard-rails inegociáveis (transversais — nenhum módulo de tipo os contorna):
//   • só objetos Z/Y (assertZY);   • activate depois do unlock;   • sempre unlock (try/finally);
//   • dataPreview é SOMENTE LEITURA (assertReadOnly);
//   • DELETE só via deleteObject() — exige objeto Z/Y + confirm:true. É destrutivo e irreversível.
//     ⚠️ NENHUM comando do CLI (`connect`/`list`/`checkout`) chama deleteObject, nem deve chamar.
//
// Fluxos por `forma` do módulo de tipo (ver tipos/_esquema.mjs):
//   source — create shell → lock → PUT /source/main → unlock → activate            (deploySource)
//   xml    — a definição É o XML: create(body) → lock → PUT(body) SEMPRE → unlock → activate (deployBody)
//   custom — o módulo traz `deploy(ctx, conexao, opts)` e executa só com primitivas do `ctx`.
//   json   — família "blue"/AFF: create shell → lock → PUT /source/main em application/json SEMPRE →
//            unlock → ativa conforme `ativacaoJson` do módulo                       (deployJson)
//
// O CLI de hoje usa só a metade de LEITURA: getObject, getSource, e o `call` do `search`.

import { call, encerrarSessao } from './sap-connection.mjs';
import { MODULOS, TYPES, moduloDe } from './tipos/index.mjs';
import { dicaDeErro, semPrefixo } from './tipos/_registro.mjs';

// Reexportados por conveniência: quem já tem um `adt-client` na mão raramente quer um segundo import
// só para abrir a sessão. A implementação é a de `sap-connection.mjs`, sempre.
export { call, newSession, fetchToken, criarConexao } from './sap-connection.mjs';

// O registro de tipos, derivado de tipos/*.mjs. `TYPES[libKey]` = { coll, ct, accept?, source } —
// a mesma projeção de sempre; `MODULOS[libKey]` é o módulo inteiro (descrição, spike, guard-rails…).
export { TYPES, MODULOS, moduloDe, dicaDeErro };

// Erro de um fluxo deste tipo sai com a dica do módulo anexada (`erros` do tipo + transversais):
// "create X falhou (400): Falta a descrição…\n→ causa provável: … \n→ correção: …". A mensagem
// original fica intacta no começo; `err.dica` guarda só a dica.
function comDica(mod, err) {
  const dica = dicaDeErro(mod, err);
  if (dica && err instanceof Error && !err.dica) { err.message += dica; err.dica = dica; }
  return err;
}

const LOCK_ACCEPT = 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.Result';

// Path ADT do objeto. Tipo aninhado (FM dentro do FUGR) define o próprio `path(name, extra)`;
// os demais são coll/<name>. `extra` carrega o contêiner ({ group }) quando o tipo exige.
export function objPath(type, name, extra = {}) {
  const mod = moduloDe(type);
  return mod.path ? mod.path(name, extra) : `${mod.coll}/${String(name).toLowerCase()}`;
}

// ---------- guard-rails ----------
// `$` + Z/Y é o pacote LOCAL ($YJBV_POC_PKG) — nome de usuário tanto quanto ZCL_X. `$TMP` e qualquer
// outro `$<standard>` continuam recusados, como todo objeto que não é nosso.
export function assertZY(name) {
  if (!/^\$?[ZY]/i.test(String(name))) throw new Error(`GUARD-RAIL: "${name}" não é objeto Z/Y — recusado (só criamos/alteramos Z ou Y, ou o pacote local $Z…/$Y…).`);
}
// O mesmo guard-rail, ciente do tipo: quando o SAP impõe um prefixo ao nome (`nomeacao.prefixo` —
// lock object começa por E, medido 2026-08-29 S4H 758: sem o E o create dá 409), o Z/Y é o que vem
// depois dele. EYJBV_POC_LK é nosso; EMMARAE não. Exige o prefixo presente.
export function assertZYDoTipo(mod, name) {
  const p = mod?.nomeacao?.prefixo;
  if (p && !String(name).toUpperCase().startsWith(p)) throw new Error(`GUARD-RAIL: "${name}" precisa começar por ${p} — o SAP impõe esse prefixo a ${mod.descricao} (${mod.nomeacao.fonte}).`);
  assertZY(semPrefixo(mod, name));
}

// dataPreview é SOMENTE LEITURA: aceita só SELECT/WITH e recusa qualquer verbo de escrita/DDL.
const READONLY_RE = /^\s*(SELECT|WITH)\b/i;
const FORBIDDEN_RE = /\b(INSERT|UPDATE|DELETE|MODIFY|DROP|ALTER|CREATE|TRUNCATE|COMMIT|ROLLBACK|GRANT|REVOKE|CALL)\b/i;
export function assertReadOnly(sql) {
  const s = String(sql ?? '').trim();
  if (!READONLY_RE.test(s)) throw new Error('GUARD-RAIL: SQL não começa com SELECT/WITH — recusado (dataPreview é só leitura).');
  if (FORBIDDEN_RE.test(s)) throw new Error('GUARD-RAIL: SQL contém comando de escrita/DDL — recusado (dataPreview é só leitura).');
  return s;
}

// ---------- consultas (recebem `session`) ----------
export async function getObject(session, type, name, extra = {}) {
  const r = await call(session, { path: objPath(type, name, extra), accept: TYPES[type].accept || TYPES[type].ct });
  if (r.status === 404) return { exists: false, status: 404 };
  const pick = (re) => (r.text.match(re) || [])[1];
  return {
    exists: r.status === 200, status: r.status,
    version: pick(/adtcore:version="([^"]*)"/),
    description: pick(/adtcore:description="([^"]*)"/),
    text: r.text,
  };
}

export async function getSource(session, type, name, extra = {}) {
  const r = await call(session, { path: `${objPath(type, name, extra)}/source/main`, accept: 'text/plain' });
  return { status: r.status, source: r.text };
}

// ---------- leitura SQL (datapreview/freestyle) ----------
// `POST /datapreview/freestyle?rowNumber=<n>` com o SELECT em text/plain devolve os dados, mas SÓ com
// Accept: application/vnd.sap.adt.datapreview.table.v1+xml (com application/xml dá 406). Resposta
// column-oriented: cada <dataPreview:columns> traz <metadata name="COL"/> + N <data>célula</data>.
const DATAPREVIEW_ACCEPT = 'application/vnd.sap.adt.datapreview.table.v1+xml';

const decodeXml = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// PURO: transpõe o XML column-oriented do datapreview em { columns:[...], rows:[{COL:val}] }. Testável offline.
export function parseDataPreview(xml) {
  const s = String(xml);
  const cols = [];
  for (const block of s.matchAll(/<dataPreview:columns\b[\s\S]*?<\/dataPreview:columns>/g)) {
    const b = block[0];
    const name = (b.match(/<dataPreview:metadata[^>]*dataPreview:name="([^"]*)"/) || [])[1] || '';
    const cells = [...b.matchAll(/<dataPreview:data\b[^>]*?(?:\/>|>([\s\S]*?)<\/dataPreview:data>)/g)]
      .map((m) => (m[1] === undefined ? '' : decodeXml(m[1])));
    cols.push({ name, cells });
  }
  const columns = cols.map((c) => c.name);
  const nrows = cols.reduce((max, c) => Math.max(max, c.cells.length), 0);
  const rows = [];
  for (let i = 0; i < nrows; i++) {
    const row = {};
    for (const c of cols) row[c.name] = c.cells[i] ?? null;
    rows.push(row);
  }
  return { columns, rows };
}

// Roda um SELECT read-only e devolve { columns, rows }. Nunca escreve (assertReadOnly).
export async function dataPreview(conexao, sql, { rows = 100 } = {}) {
  const query = assertReadOnly(sql);
  const s = await conexao.sessao();
  const r = await call(s, {
    method: 'POST',
    path: `/sap/bc/adt/datapreview/freestyle?rowNumber=${Number(rows) || 100}`,
    accept: DATAPREVIEW_ACCEPT, contentType: 'text/plain', body: query,
  });
  if (r.status !== 200) throw new Error(`dataPreview falhou (${r.status}): ${r.text.slice(0, 300)}`);
  return { ...parseDataPreview(r.text), status: r.status };
}

// ---------- primitivas de escrita ----------
// lock/unlock por PATH ADT — a mecânica é uma só: POST _action=LOCK&accessMode=MODIFY, LOCK_HANDLE no corpo.
// `lock`/`unlock` por tipo+nome são atalhos sobre estas; tipo aninhado (FM) passa pelo `path` do módulo.
export async function lockPath(session, path) {
  const r = await call(session, { method: 'POST', path: `${path}?_action=LOCK&accessMode=MODIFY`, accept: LOCK_ACCEPT });
  const h = (r.text.match(/<LOCK_HANDLE>([^<]+)/) || [])[1];
  if (!h) throw new Error(`lock ${path} falhou (${r.status}): ${r.text.slice(0, 200)}`);
  return h;
}
export const unlockPath = (session, path, h) =>
  call(session, { method: 'POST', path: `${path}?_action=UNLOCK&lockHandle=${h}`, accept: LOCK_ACCEPT });

// lock → fn(lockHandle) → unlock no finally. É a forma estrutural de um fluxo não esquecer o unlock.
export async function withLockPath(session, path, fn) {
  const h = await lockPath(session, path);
  try { return await fn(h); }
  finally { await unlockPath(session, path, h); }
}

export const lock = (session, type, name, extra = {}) => lockPath(session, objPath(type, name, extra));
export const unlock = (session, type, name, h, extra = {}) => unlockPath(session, objPath(type, name, extra), h);

// DELETE guard-railed: só Z/Y, EXIGE confirm:true (destrutivo/irreversível). lock → DELETE → (sem activate).
// Devolve { deleted, status, verificado }. Se o objeto não existe (404 EXPLÍCITO), deleted:false.
// Uso típico: limpar engano em $TMP.
// ⚠️ Nenhum comando do CLI chama isto. É a única função da lib que APAGA algo no servidor.
// `extra` carrega o contêiner de tipo aninhado ({ group } para o FM).
//
// "Apagado" aqui é PROVADO, não presumido (item 80/I99 — medido 2026-09-02, S4H 758):
//   • Só 404 no GET inicial significa "não existe". Com o ADT stateful caído, TODO GET responde
//     400 HTML ("Service nicht erreichbar") — a versão antiga lia isso como "não existe" e devolvia
//     deleted:false com status FORJADO 404, sem lançar; o teardown do item 78 pagou para ver.
//   • Depois do DELETE, a AUSÊNCIA é conferida por um GET STATELESS (leitura stateless segue viva
//     mesmo com o stateful caído — medido 2026-08-30): 404 = apagado (52–66 ms medidos em domain,
//     classe e pacote); 200 = o DELETE mentiu — lança; outro status = inconclusivo — lança também.
//     `verificar:false` pula a conferência (aí `verificado:false` diz que ninguém provou nada).
export async function deleteObject(conexao, { type, name, corrNr, confirm = false, verificar = true, ...extra } = {}) {
  assertZYDoTipo(moduloDe(type), name);
  if (confirm !== true) throw new Error(`GUARD-RAIL: deleteObject exige confirm:true (remoção de "${name}" é irreversível).`);
  const s = await conexao.sessao();
  const existing = await getObject(s, type, name, extra);
  if (existing.status === 404) return { deleted: false, status: 404, reason: 'não existe' };
  if (!existing.exists) {
    throw new Error(`delete ${name}: não deu para confirmar a existência — GET respondeu ${existing.status}, não 200/404 ` +
      `(stateful caído responde 400 a tudo; nada foi apagado): ${String(existing.text).slice(0, 160)}`);
  }
  // O que o tipo exige antes do DELETE (SRVB: unpublish — binding publicado não pode ser removido).
  const mod = moduloDe(type);
  if (mod.antesDeApagar) await mod.antesDeApagar(CTX, conexao, { type, name, corrNr, ...extra });
  const h = await lock(s, type, name, extra);
  let p = `${objPath(type, name, extra)}?lockHandle=${h}`; if (corrNr) p += `&corrNr=${corrNr}`;
  const r = await call(s, { method: 'DELETE', path: p, accept: 'application/*' });
  if (r.status >= 400) {
    try { await unlock(s, type, name, h, extra); } catch { /* ignora */ }
    throw new Error(`delete ${name} falhou (${r.status}): ${r.text.slice(0, 200)}`);
  }
  // objeto removido — não há o que destravar.
  if (!verificar) return { deleted: true, status: r.status, verificado: false };
  const pos = await call(s, { path: objPath(type, name, extra), accept: TYPES[type].accept || TYPES[type].ct, stateless: true });
  if (pos.status === 200) throw new Error(`delete ${name}: o DELETE respondeu ${r.status} mas o objeto AINDA EXISTE (GET pós-delete 200) — nada foi apagado.`);
  if (pos.status !== 404) throw new Error(`delete ${name}: DELETE ${r.status}, mas a conferência de ausência foi inconclusiva (GET pós-delete ${pos.status}): ${pos.text.slice(0, 160)}`);
  return { deleted: true, status: r.status, verificado: true };
}

// Shell de create do tipo — vem do módulo (`createBody`). Tipos sem shell (a definição é o body, ou
// o create é feito pelo próprio `deploy` do módulo) lançam, como sempre lançaram.
export function defaultCreateBody(type, name, pkg, description) {
  const mod = moduloDe(type);
  if (typeof mod.createBody !== 'function') throw new Error(`sem body default para tipo ${type}`);
  return mod.createBody(name, pkg, description);
}

export async function createShell(session, type, name, { pkg = '$TMP', description = '', corrNr, body, stateless = false } = {}) {
  const t = TYPES[type];
  const p = t.coll + (corrNr ? `?corrNr=${corrNr}` : '');
  const b = body ?? defaultCreateBody(type, name, pkg, description);
  const r = await call(session, { method: 'POST', path: p, accept: t.accept || t.ct, contentType: t.ct, body: b, stateless });
  if (r.status !== 200 && r.status !== 201) throw new Error(`create ${name} falhou (${r.status}): ${r.text.slice(0, 300)}`);
  return r;
}

export async function setSource(session, type, name, source, lockHandle, corrNr) {
  let p = `${objPath(type, name)}/source/main?lockHandle=${lockHandle}`;
  if (corrNr) p += `&corrNr=${corrNr}`;
  const r = await call(session, { method: 'PUT', path: p, accept: 'text/plain', contentType: 'text/plain', body: source });
  if (r.status >= 400) throw new Error(`setSource ${name} falhou (${r.status}): ${r.text.slice(0, 200)}`);
  return r;
}

// Extrai as mensagens de erro/aviso da resposta de ativação (chkl:messages).
export function activationMessages(xml) {
  return [...String(xml).matchAll(/<msg[^>]*type="([EWI])"[^>]*>\s*<shortText><txt>([^<]*)/g)]
    .map(([, type, text]) => ({ type, text }));
}

// Ativa N objetos NA MESMA requisição — necessário quando há dependência DDIC
// (ex.: alterar um DE usado por tabela ativa exige ativar DE + tabela juntos: "activate and adjust
// dependent objects" do Eclipse; senão dá EU(899)/EU(886) — ver SPIKE-002).
// O maestro exigia sessão NOVA aqui ("senão currently editing"). MEDIDO no DEV:100 em 2026-08-05:
// não precisa. Na mesma sessão cacheada (só cookie) veio HTTP 200, activationExecuted="true", zero
// mensagens, e o objeto ficou `version: active`. O "currently editing" só vale enquanto o objeto está
// TRAVADO, e todo `deploy*` faz `unlock` no `finally` antes de chegar aqui.
// Cada objeto é { type, name, ...extra } — `extra` carrega o contêiner de tipo aninhado ({ group }).
export async function activateMany(conexao, objects, { sessao } = {}) {
  const s = sessao ?? await conexao.sessao();
  const refs = objects
    .map(({ type, name, ...extra }) => `<adtcore:objectReference adtcore:uri="${objPath(type, name, extra)}" adtcore:name="${String(name).toUpperCase()}"/>`)
    .join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${refs}</adtcore:objectReferences>`;
  const r = await call(s, { method: 'POST', path: '/sap/bc/adt/activation?method=activate&preauditRequests=false', accept: 'application/xml', contentType: 'application/xml', body });
  const messages = activationMessages(r.text);
  // ATENÇÃO: `activationExecuted="true"` NÃO significa sucesso — convive com erros type="E"
  // ("Aktivierung wurde abgebrochen"). Sucesso = executado E sem nenhum erro E. (SPIKE 2026-07-27)
  const hasError = messages.some((m) => m.type === 'E');
  return { status: r.status, ok: /activationExecuted="true"/.test(r.text) && !hasError, hasError, messages, text: r.text };
}

export const activate = (conexao, type, name, extra = {}) => activateMany(conexao, [{ type, name, ...extra }]);

// Ativa numa sessão NOVA, encerrada no finally — a estratégia `sessaoNova` da forma `json` (SAJC,
// fila 47: na sessão que fez o create/PUT o activate falha dizendo que a classe/objeto não existe;
// o check lê a versão ATIVA, ainda inexistente).
export async function activateEmSessaoNova(conexao, type, name, extra = {}) {
  const nova = await conexao.sessaoNova();
  try { return await activateMany(conexao, [{ type, name, ...extra }], { sessao: nova }); }
  finally { await encerrarSessao(nova).catch(() => {}); }
}

// ---------- orquestradores de alto nível (recebem `conexao`) ----------
// source-based (tabela/CDS/classe): cria se faltar, grava source, ativa. Idempotente. Nunca deleta.
// Serve para todo tipo com /source/main que NÃO seja aninhado — o FM tem `source:true` mas path
// próprio e PUT de metadata obrigatório: vai por `deploy(conexao, 'functionModule', …)`.
// `ativar` é a função de ativação — `activate` por padrão; `deployMany` passa uma que só ANOTA o
// objeto para ativar todos juntos no fim (unidade de ativação).
export async function deploySource(conexao, { type, name, source, pkg = '$TMP', description = '', corrNr }, ativar = activate) {
  const mod = moduloDe(type);
  assertZYDoTipo(mod, name);
  if (!mod.source || mod.container) throw new Error(`tipo ${type} não é source-based (use deploy(conexao, '${type}', …))`);
  assertNomeacao(mod, name);
  try {
    const s = await conexao.sessao();
    const existing = await getObject(s, type, name);
    if (!existing.exists) await createShell(s, type, name, { pkg, description, corrNr });
    const h = await lock(s, type, name);
    try { await setSource(s, type, name, source, h, corrNr); }
    finally { await unlock(s, type, name, h); }
    const act = await ativar(conexao, type, name);
    return { created: !existing.exists, activated: act.ok, activate: act };
  } catch (e) { throw comDica(mod, e); }
}

// Tamanho do nome — o que o módulo declara em `nomeacao` (tabela: 16, medido por 422). Antes da rede.
export function assertNomeacao(mod, name) {
  if (mod.nomeacao && String(name).length > mod.nomeacao.max) {
    throw new Error(`GUARD-RAIL: "${name}" tem ${String(name).length} caracteres; ${mod.libKey} aceita até ${mod.nomeacao.max} (${mod.nomeacao.fonte}).`);
  }
}

// XML-body (data element, domínio): a definição É o XML. Cria (body completo) se faltar; depois
// lock+PUT(body) SEMPRE — o POST de create grava só a parte técnica e DESCARTA textos/labels/valores
// fixos (falha silenciosa: 201 e ativa). Ativa. Nunca deleta. `def` é o que o `body` do módulo entende.
export async function deployBody(conexao, { type, name, pkg = '$TMP', description = '', corrNr, def }, ativar = activate) {
  const mod = moduloDe(type);
  assertZYDoTipo(mod, name);
  if (mod.forma !== 'xml') throw new Error(`tipo ${type} não é XML-body (forma ${mod.forma})`);
  assertNomeacao(mod, name);
  try {
    const body = mod.body(name, pkg, description, def);
    const s = await conexao.sessao();
    const existing = await getObject(s, type, name);
    if (!existing.exists) await createShell(s, type, name, { pkg, description, corrNr, body });
    const h = await lock(s, type, name);
    try {
      let p = `${objPath(type, name)}?lockHandle=${h}`; if (corrNr) p += `&corrNr=${corrNr}`;
      const r = await call(s, { method: 'PUT', path: p, accept: TYPES[type].ct, contentType: TYPES[type].ct, body });
      if (r.status >= 400) throw new Error(`PUT ${mod.descricao} ${name} falhou (${r.status}): ${r.text.slice(0, 200)}`);
    } finally { await unlock(s, type, name, h); }
    const act = await ativar(conexao, type, name);
    return { created: !existing.exists, activated: act.ok, activate: act };
  } catch (e) { throw comDica(mod, e); }
}

// json (I56): família "blue"/AFF (APLO, NROB, SAJC…). O único ponto que se repetiu nos três tipos
// medidos é o content-type do PUT — sempre `application/json`, nunca `text/plain`. A ativação NÃO
// se repete (nasce ativo · activate normal · activate só em sessão nova) — por isso é campo do
// módulo (`ativacaoJson`), nunca decidida aqui. `def` são as opções amigáveis que o `body` do
// módulo entende (o módulo decide se aceita `source` pronto por fora, olhando `def.source`).
const CT_JSON_SOURCE = 'application/json';
export async function deployJson(conexao, { type, name, pkg = '$TMP', description = '', corrNr, def = {} }, ativar = activate) {
  const mod = moduloDe(type);
  assertZYDoTipo(mod, name);
  if (mod.forma !== 'json') throw new Error(`tipo ${type} não é json-based (forma ${mod.forma})`);
  assertNomeacao(mod, name);
  try {
    const fonte = def.source ?? mod.body(name, pkg, description, def);
    const s = await conexao.sessao();
    const existing = await getObject(s, type, name);
    if (!existing.exists) await createShell(s, type, name, { pkg, description, corrNr });
    const h = await lock(s, type, name);
    try {
      let p = `${objPath(type, name)}/source/main?lockHandle=${h}`;
      if (corrNr) p += `&corrNr=${corrNr}`;
      const r = await call(s, { method: 'PUT', path: p, accept: 'application/*', contentType: CT_JSON_SOURCE, body: fonte });
      if (r.status >= 400) throw new Error(`PUT do fonte de ${name} falhou (${r.status}): ${r.text.slice(0, 200)}`);
    } finally { await unlock(s, type, name, h); }
    const act = mod.ativacaoJson === 'nenhuma' ? { ok: true, semAtivacao: true }
      : mod.ativacaoJson === 'sessaoNova' ? await activateEmSessaoNova(conexao, type, name)
      : await ativar(conexao, type, name);
    const final = await getObject(s, type, name);
    return { created: !existing.exists, activated: act.ok, activate: act, version: final.version, fonte };
  } catch (e) { throw comDica(mod, e); }
}

// O que um `deploy` de módulo (forma custom) recebe: as primitivas desta lib, e só elas. Congelado —
// um módulo não acrescenta nem troca primitiva. `withLockPath` é o jeito de não esquecer o unlock.
// `ctxCom(ativar)` troca só a ativação — é como `deployMany` adia a ativação de um módulo custom
// sem que o módulo saiba (ele chama `ctx.activate` como sempre e recebe { ok:true, diferido:true }).
const PRIMITIVAS = {
  call, getObject, createShell, setSource, lock, unlock, lockPath, unlockPath, withLockPath,
  activateMany, activationMessages, objPath, assertZY, LOCK_ACCEPT, encerrarSessao,
  deploy: (conexao, type, opts) => deploy(conexao, type, opts),
};
const ctxCom = (ativar) => Object.freeze({ ...PRIMITIVAS, activate: ativar });
const CTX = ctxCom(activate);

// Guard-rails de um objeto, todos ANTES de qualquer rede: Z/Y, tamanho do nome, `validar` do tipo.
function conferir(type, opts) {
  const mod = moduloDe(type);
  // Tipo cujo NOME é imposto pelo SAP a partir do contêiner (include de FUGR: L<GRUPO><SUFIXO>):
  // o dono do namespace é o contêiner, e é ele que passa pelo Z/Y. Medido 2026-08-29 (S4H 758).
  if (mod.zyPeloContainer) {
    const dono = opts[mod.container.param];
    if (!dono) throw new Error(`${type} exige { ${mod.container.param} } — é sobre ele que o guard-rail Z/Y roda`);
    assertZY(dono);
  } else assertZYDoTipo(mod, opts.name);
  assertNomeacao(mod, opts.name);
  mod.validar?.(opts);
  return mod;
}

// O fluxo pela `forma`, com a ativação que o chamador quiser (imediata ou diferida).
async function executar(conexao, mod, opts, ativar) {
  const type = mod.libKey;
  try {
    switch (mod.forma) {
      case 'source': return await deploySource(conexao, { type, ...opts }, ativar);
      case 'xml':    return await deployBody(conexao, { type, ...opts }, ativar);
      case 'json':   return await deployJson(conexao, { type, ...opts, def: opts }, ativar);
      case 'custom': return await mod.deploy(ctxCom(ativar), conexao, opts);
      default: throw new Error(`tipo ${type}: forma "${mod.forma}" sem fluxo`);
    }
  } catch (e) { throw comDica(mod, e); }
}

// Despachante: guard-rails transversais → `nomeacao` e `validar` do tipo → fluxo pela `forma`.
// Erro em qualquer ponto sai com a dica do módulo (`erros` + transversais) anexada.
export async function deploy(conexao, type, opts = {}) {
  const mod = conferir(type, opts);
  return executar(conexao, mod, opts, activate);
}

// ---------- unidade de ativação: objetos que só ativam JUNTOS ----------
// Casos medidos: BDEF + behavior pool (um não ativa sem o outro); include + programa (a versão
// inativa fica no include); DE de chave + tabela dependente (EU(899)/EU(886)). Ver skill adt-objetos
// § unidades de ativação e o campo `dependencias` dos módulos.
//
// Ordena os objetos por dependência e devolve a lista na ordem de gravação. Duas fontes:
//   • de INSTÂNCIA, nas opts: `dependeDe: ['class:YBP_X', 'cds:YJBV_ROOT']` ("libKey:NOME", caixa livre);
//   • de TIPO, no módulo: `dependencias[].tipo` — se há na unidade um objeto daquele tipo, ele vem antes.
// Dependência que aponta para fora da unidade é ignorada (já está no sistema, ou é problema do
// chamador). Ciclo lança. PURO — testável sem SAP.
export function ordenarUnidade(objetos) {
  const chave = (t, n) => `${t}:${String(n).toUpperCase()}`;
  const nos = objetos.map((o, i) => ({ i, o, k: chave(o.type, o.name), antes: new Set() }));
  const porChave = new Map(nos.map((n) => [n.k, n]));
  const porTipo = (t) => nos.filter((n) => n.o.type === t);
  for (const n of nos) {
    for (const d of n.o.dependeDe ?? []) {
      const [t, ...resto] = String(d).split(':');
      const alvo = porChave.get(chave(t, resto.join(':')));
      if (alvo && alvo !== n) n.antes.add(alvo);
    }
    for (const d of moduloDe(n.o.type).dependencias) for (const alvo of porTipo(d.tipo)) if (alvo !== n) n.antes.add(alvo);
  }
  const ordem = [], feitos = new Set();
  let restantes = [...nos];
  while (restantes.length) {
    const prontos = restantes.filter((n) => [...n.antes].every((a) => feitos.has(a)));
    if (!prontos.length) throw new Error(`unidade de ativação com dependência circular entre: ${restantes.map((n) => n.k).join(', ')}`);
    for (const n of prontos) { ordem.push(n.o); feitos.add(n); }
    restantes = restantes.filter((n) => !feitos.has(n));
  }
  return ordem;
}

// Grava TODOS os objetos (create/PUT/unlock, cada um pelo fluxo do seu tipo) SEM ativar, na ordem de
// dependência, e ativa todos numa única requisição no fim. Guard-rails de todos rodam antes da rede.
// Cada objeto: { type, name, …opts do deploy daquele tipo, dependeDe?: ['libKey:NOME'] }.
// Devolve { objetos: [{ type, name, created }], activated, activate } — `activate` é o resultado do
// activateMany (ok, hasError, messages). Tipos que nascem ativos (MSAG) só são gravados.
export async function deployMany(conexao, objetos) {
  if (!Array.isArray(objetos) || !objetos.length) throw new Error('deployMany: informe ao menos um objeto');
  const mods = objetos.map((o) => conferir(o.type, o));           // todos os guard-rails antes de qualquer rede
  const ordem = ordenarUnidade(objetos);
  const pendentes = [];
  const diferido = async (cx, type, name, extra = {}) => {
    const k = `${type}:${String(name).toUpperCase()}`;
    if (!pendentes.some((p) => `${p.type}:${String(p.name).toUpperCase()}` === k)) pendentes.push({ type, name, ...extra });
    return { status: 0, ok: true, hasError: false, messages: [], text: '', diferido: true };
  };
  const resultados = [];
  for (const o of ordem) {
    const { dependeDe, type, ...opts } = o;
    const mod = mods[objetos.indexOf(o)];
    const r = await executar(conexao, mod, { name: o.name, ...opts }, diferido);
    resultados.push({ type, name: o.name, created: !!r.created });
  }
  const act = pendentes.length
    ? await activateMany(conexao, pendentes)
    : { status: 0, ok: true, hasError: false, messages: [], text: '', vazio: true };
  return { objetos: resultados, activated: act.ok, activate: act };
}

// ---------- compatibilidade: os nomes de sempre, agora sobre o registro ----------
// data element: cria (body completo) se faltar, ou lock+PUT(body) se existir; ativa.
export const deployDataElement = (conexao, opts) => deployBody(conexao, { type: 'dataElement', ...opts });
// domínio (DOMA/DD). def: { dataType, length, decimals?, outputLength?, lowercase?, fixValues?:[{low,high?,text}] }
export const deployDomain = (conexao, opts) => deployBody(conexao, { type: 'domain', ...opts });
// classe de mensagens (MSAG/N): `messages` = [{ no:'001', text:'Texto com &1', selfExplanatory:false }]
export const deployMessageClass = (conexao, opts) => deploy(conexao, 'msag', opts);
// classe + test class (uma unidade). `includes` = { definitions, implementations, macros } opcionais.
export const deployClassWithTests = (conexao, opts) => deploy(conexao, 'class', opts);
// service binding RAP (description obrigatória); depois `publishServiceBinding`.
export const deployServiceBinding = (conexao, opts) => deploy(conexao, 'serviceBinding', opts);
// grupo de funções (cria se faltar) e function module RFC dentro dele ({ group, name, source, rfc }).
export const deployFunctionGroup = (conexao, opts) => deploy(conexao, 'functionGroup', opts);
export const deployFunctionModule = (conexao, opts) => deploy(conexao, 'functionModule', opts);

export { buildDataElementBody } from './tipos/dataElement.mjs';
export { buildDomainBody } from './tipos/domain.mjs';
export { buildMessageClassBody } from './tipos/msag.mjs';
export { buildFunctionModuleBody } from './tipos/functionModule.mjs';
export { setInclude, setTestClasses } from './tipos/class.mjs';
export { publish as publishServiceBinding, unpublish as unpublishServiceBinding, odataV4RuntimeUrl, odataV2RuntimeUrl } from './tipos/serviceBinding.mjs';

// ---------- ABAP Unit (SPIKE 2026-07-19, validado no $TMP) ----------
// Dois pontos que custam caro se esquecidos:
//   • o include `testclasses` (CCAU) NÃO nasce com a classe e o PUT exige `charset=utf-8` (ver tipos/class.mjs);
//   • sem o bloco <options> o testruns roda ZERO testes e devolve 200 vazio (verde por não-execução).

const AUNIT_CT = 'application/vnd.sap.adt.abapunit.testruns.config.v4+xml';
const AUNIT_ACCEPT = 'application/vnd.sap.adt.abapunit.testruns.result.v2+xml';

export function buildUnitRunBody(uri) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit">
  <external><coverage active="false"/></external>
  <options>
    <uriType value="semantic"/>
    <testDeterminationStrategy sameProgram="true" assignedTests="false" appendAssignedTestsPreview="true"/>
    <testRiskLevels harmless="true" dangerous="true" critical="true"/>
    <testDurations short="true" medium="true" long="true"/>
  </options>
  <adtcore:objectSets xmlns:adtcore="http://www.sap.com/adt/core">
    <objectSet kind="inclusive">
      <adtcore:objectReferences><adtcore:objectReference adtcore:uri="${uri}"/></adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</aunit:runConfiguration>`;
}

// PURO: extrai os métodos e seus alertas do runResult. Separado do I/O para ser testável.
export function parseUnitResult(xml) {
  const methods = [];
  // `[^>]*?` LAZY: sem isso, um <testMethod/> auto-fechado (método que passou) consome o `/` e funde
  // com o próximo </testMethod> — subcontando os testes. (Correção vinda do maestro/TASK-013.)
  for (const m of String(xml).matchAll(/<testMethod\b([^>]*?)(\/>|>([\s\S]*?)<\/testMethod>)/g)) {
    const attrs = m[1], inner = m[3] || '';
    const name = (attrs.match(/adtcore:name="([^"]*)"/) || [])[1] || '';
    const uri = (attrs.match(/adtcore:uri="([^"]*)"/) || [])[1] || '';
    const testClass = (uri.match(/testclass=([^;]*)/) || [])[1] || '';
    const alerts = [...inner.matchAll(/<alert kind="([^"]*)" severity="([^"]*)">([\s\S]*?)<\/alert>/g)].map((a) => ({
      kind: a[1], severity: a[2],
      title: (a[3].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '',
      details: [...a[3].matchAll(/<detail text="([^"]*)"/g)].map((d) => d[1]),
      at: (a[3].match(/#start=(\d+)/) || [])[1] || null,
    }));
    methods.push({ testClass, name, ok: alerts.length === 0, alerts });
  }
  const failed = methods.filter((x) => !x.ok);
  return { executed: methods.length, passed: methods.length - failed.length, failed: failed.length, methods, failures: failed };
}

// Executa o ABAP Unit da classe. ⚠️ `executed === 0` NUNCA é sucesso — é filtro/objeto errado.
export async function runUnitTests(conexao, { type = 'class', name }) {
  const s = await conexao.sessao();
  const uri = objPath(type, name);
  const r = await call(s, { method: 'POST', path: '/sap/bc/adt/abapunit/testruns', accept: AUNIT_ACCEPT, contentType: AUNIT_CT, body: buildUnitRunBody(uri) });
  if (r.status !== 200) throw new Error(`runUnitTests ${name} falhou (${r.status}): ${r.text.slice(0, 300)}`);
  const res = parseUnitResult(r.text);
  return { ...res, ok: res.executed > 0 && res.failed === 0, status: r.status };
}

// ---------- cobertura (SPIKE 2026-07-19) ----------
// A URI da medição responde a POST (não GET — GET dá 405), com um <cov:query> informando o alvo.
// Fonte da recipe: coleção Postman de CI (pacroy/abap-ci-postman); não está no discovery.
export function buildCoverageQuery(uri) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cov:query xmlns:cov="http://www.sap.com/adt/cov" xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectSets>
    <objectSet kind="inclusive">
      <adtcore:objectReferences><adtcore:objectReference adtcore:uri="${uri}"/></adtcore:objectReferences>
    </objectSet>
  </adtcore:objectSets>
</cov:query>`;
}

// PURO: os percentuais por tipo (statement/branch/procedure) do <cov:result>.
//
// ⚠️ O `cov:result` é uma ÁRVORE (raiz → programa → método) e cada nível REPETE os mesmos números
// (medido 2026-08-31, S4H 758: statement 12/6 na raiz, 12/6 no programa, 6/4 + 4/0 + 2/2 nos três
// métodos). Somar todo `<coverage>` do XML — o que esta função fazia — contava cada statement uma
// vez por nível: `total` e `executed` saíam 3× inflados. O percentual continuava certo (a árvore é
// proporcional), e foi por isso que o erro passou. Agora conta só a PROFUNDIDADE 0.
// Para a árvore inteira e o relatório por método: `cobertura.mjs`.
export function parseCoverage(xml) {
  const s = String(xml);
  const out = {};
  let nivel = -1;
  for (const m of s.matchAll(/<node>|<\/node>|<coverage type="([^"]*)" total="(\d+)" executed="(\d+)"\s*\/>/g)) {
    if (m[0] === '<node>') { nivel += 1; continue; }
    if (m[0] === '</node>') { nivel -= 1; continue; }
    if (nivel > 0) continue;   // só a raiz da árvore (nível -1 = XML sem <node>, contado inteiro)
    const [, type, total, executed] = m;
    if (!out[type]) out[type] = { total: 0, executed: 0 };
    out[type].total += Number(total); out[type].executed += Number(executed);
  }
  for (const k of Object.keys(out))
    out[k].percent = out[k].total ? Number(((out[k].executed / out[k].total) * 100).toFixed(2)) : null;
  return out;
}

// Roda ABAP Unit COM cobertura e devolve testes + percentuais. `threshold` só rotula o resultado.
export async function runUnitTestsWithCoverage(conexao, { type = 'class', name, threshold = 90 }) {
  const s = await conexao.sessao();
  const uri = objPath(type, name);
  const body = buildUnitRunBody(uri).replace('<coverage active="false"/>', '<coverage active="true"/>');
  const run = await call(s, { method: 'POST', path: '/sap/bc/adt/abapunit/testruns', accept: AUNIT_ACCEPT, contentType: AUNIT_CT, body });
  if (run.status !== 200) throw new Error(`runUnitTests ${name} falhou (${run.status}): ${run.text.slice(0, 300)}`);
  const tests = parseUnitResult(run.text);

  const measureUri = (String(run.text).match(/coverage adtcore:uri="([^"]+)"/) || [])[1];
  let coverage = null;
  if (measureUri) {
    const r = await call(s, { method: 'POST', path: measureUri, accept: 'application/xml', contentType: 'application/xml', body: buildCoverageQuery(uri) });
    if (r.status === 200) coverage = parseCoverage(r.text);
  }
  const statement = coverage?.statement?.percent ?? null;
  return {
    ...tests,
    ok: tests.executed > 0 && tests.failed === 0,
    coverage,
    statement,
    meetsThreshold: statement === null ? null : statement >= threshold,
  };
}

// ---------- wrapper RFC de BDC (receita do canal SOAP RFC — não é um tipo de objeto) ----------
// Gera o source de um wrapper RFC de BDC genérico: recebe tcode + tabela BDCDATA + modo, roda
// CALL TRANSACTION e devolve subrc + BDCMSGCOLL. É o wrapper VALIDADO na POC (S4H 758, 2026-08-26:
// VA03 com documento inexistente → EV_SUBRC=1001, msg de negócio E V1 302 de volta via SOAP RFC).
// Chame-o depois com `rfc-soap.callFunction(cfg, name, { IV_TCODE, IV_MODE, IT_BDCDATA:[…], ET_MSGS:[] })`.
// Assinatura SEM ponto após o nome (gotcha 2 de tipos/functionModule.mjs); TABLES com `LIKE`.
export function buildBdcWrapperSource(name) {
  const n = String(name).toLowerCase();
  return `FUNCTION ${n}
  IMPORTING
    VALUE(iv_tcode) TYPE tcode
    VALUE(iv_mode) TYPE char1 DEFAULT 'N'
  EXPORTING
    VALUE(ev_subrc) TYPE sysubrc
  TABLES
    it_bdcdata LIKE bdcdata
    et_msgs LIKE bdcmsgcoll.

  CALL TRANSACTION iv_tcode WITH AUTHORITY-CHECK
       USING it_bdcdata[] MODE iv_mode UPDATE 'S'
       MESSAGES INTO et_msgs[].
  ev_subrc = sy-subrc.

ENDFUNCTION.`;
}
