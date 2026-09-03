// spike-crud.mjs — DESCARTÁVEL. Prova que o serviço OData do ZSPIKE_SB_ADTF responde e que o CRUD
// funciona de ponta a ponta, pelo protocolo — não pelo "ativou, então deve estar bom".
//
//   node abapgit.mjs connect <alias>:100:pt
//   node spike-crud.mjs
//
// SESSÃO — a causa real, depois de eu errar o diagnóstico três vezes:
// o runtime OData ROTACIONA o cookie de sessão a cada resposta. Não é o header stateful, como eu
// suspeitei no começo. Quem guardar o cookie antigo (o `.sessao.json`, ou uma segunda cópia dentro do
// processo) leva "400 Session Timed Out or Not Found" na chamada seguinte. Com o cookie novo gravado
// de volta a cada resposta, a sessão do ADT sobrevive à bateria inteira — verificado no sistema de dev.
//
// O CICLO DE DRAFT, que é o que torna isto diferente de um CRUD comum:
//   O RAP com `with draft` NÃO aceita POST/PATCH/DELETE na instância ATIVA. Tudo passa por rascunho:
//     Edit (ativa → rascunho) → mexe no rascunho → Activate (rascunho → ativa)
//   A chave carrega esse estado: (Codigo='X',IsActiveEntity=false) é o rascunho, true é o ativo.
//   As ações vêm no namespace `SAP__self` (alias que o SAP publica no $metadata) — o nome completo é
//   `com.sap.gateway.srvd.<srvd>.v0001.<Ação>`, e aparece no corpo do GET Singleton.
//
// Dois requisitos do protocolo que só apareceram batendo no serviço:
//   • `Edit` tem parâmetro OBRIGATÓRIO `PreserveChanges` — sem ele, 400.
//   • PATCH/DELETE exigem `If-Match` (428), porque o BDEF declara `etag master LocalLastChangedAt`.

import fs from 'node:fs';
import path from 'node:path';
import { conexaoAtual } from './lib/session.mjs';
import { call } from './lib/adt-client.mjs';
import { RAIZ } from './lib/config.mjs';

const BINDING = 'ZSPIKE_SB_ADTF';
const SRVD = 'ZSPIKE_SD_ADTF';
const CODIGO = 'CRUD01';

const { session, cfg } = conexaoAtual();
const cliente = cfg.client;

// O runtime OData ROTACIONA o cookie de sessão. Sem gravar o novo de volta, o `.sessao.json` fica com
// o cookie velho e a rodada SEGUINTE morre em "400 Session Timed Out" — foi assim que eu queimei três
// conexões seguidas. Agora cada resposta atualiza o arquivo, e a sessão sobrevive entre execuções.
const ARQ = path.join(RAIZ, '.sessao.json');
function salvarCookie(c) {
  try {
    const d = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
    if (d.cookie === c) return;
    d.cookie = c;
    fs.writeFileSync(ARQ, JSON.stringify(d, null, 2));
  } catch { /* melhor esforço: não vale derrubar o teste por causa do cache */ }
}

// ---------------------------------------------------------------------------------------------
// Descobrir a URL de runtime. O helper `odataV4RuntimeUrl` da lib fixa `srvd_a2x`, que é o
// repositório de WEB API (categoria 1). Este binding é categoria 0 (UI) e o segmento é outro.
// Em vez de chutar: pergunta ao ADT e, se não vier, SONDA as variantes e usa a que responder 200.
// ---------------------------------------------------------------------------------------------
// ⚠️ USA `od()`, NUNCA o `call()` do adt-client. O runtime OData ROTACIONA o cookie de sessão a cada
// resposta; se dois potes de cookie coexistirem no mesmo processo, o segundo fica velho na primeira
// chamada e todo o resto volta "400 Session Timed Out". Um pote só, e é o do `od()`.
// (E o cookie que está no .sessao.json fica velho assim que a primeira chamada OData sai — por isso
// tudo aqui tem que caber num único processo.)
async function descobrirUrl() {
  for (const repo of ['srvd', 'srvd_a2x']) {
    const u = `/sap/opu/odata4/sap/${BINDING.toLowerCase()}/${repo}/sap/${SRVD.toLowerCase()}/0001/`;
    // $metadata é XML — com Accept: application/json o serviço devolve 406 e a sonda dá falso negativo.
    // $metadata é XML — com Accept: application/json o serviço devolve 406 e a sonda dá falso negativo.
    const r = await od('GET', `${u}$metadata`, undefined, { Accept: 'application/xml' });
    console.log(`  sonda ${repo.padEnd(9)} → HTTP ${r.status}${r.status === 200 ? '' : `  ${r.txt.replace(/\s+/g, ' ').slice(0, 110)}`}`);
    if (r.status === 200) return u;
  }
  throw new Error('nenhuma variante de URL respondeu 200 no $metadata');
}

/** Confere que a sessão do ADT está viva ANTES de tocar no OData — erro claro em vez de sonda confusa. */
async function preVoo() {
  const r = await call(session, { path: '/sap/bc/adt/ddic/tables/zspike_t_adtf', accept: 'application/vnd.sap.adt.tables.v2+xml' });
  if (r.status === 200) { console.log('  sessão do ADT: viva ✓\n'); salvarCookie(session.cookie); cookie = session.cookie; return; }
  console.log(`  sessão do ADT: MORTA (HTTP ${r.status}) — ${r.text.replace(/\s+/g, ' ').slice(0, 90)}`);
  console.log('\n  Reconecte antes de rodar:  node abapgit.mjs connect <alias>:100:pt');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Cliente OData mínimo. Não reusa o `call` do adt-client porque precisa do token CSRF DO SERVIÇO
// (o do ADT não vale para /sap/opu/), e porque quero ver o corpo do erro sem filtro.
// ---------------------------------------------------------------------------------------------
let odataToken = '';
let cookie = session.cookie;

function comCliente(p) { return p + (p.includes('?') ? '&' : '?') + `sap-client=${cliente}`; }

async function od(method, path, body, extra = {}) {
  const headers = { Accept: 'application/json', Cookie: cookie, ...extra };
  if (odataToken && !extra['X-CSRF-Token']) headers['X-CSRF-Token'] = odataToken;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['Prefer'] = 'return=representation';
  const res = await fetch(`${cfg.base}${comCliente(path)}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (sc.length) {
    const jar = {};
    for (const c of cookie.split('; ')) { const i = c.indexOf('='); if (i > 0) jar[c.slice(0, i)] = c.slice(i + 1); }
    for (const l of sc) { const f = l.split(';')[0]; const i = f.indexOf('='); if (i > 0) jar[f.slice(0, i)] = f.slice(i + 1); }
    cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    salvarCookie(cookie);
  }
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch { /* nem toda resposta é JSON */ }
  return { status: res.status, json, txt, headers: res.headers };
}

// A ação Edit tem parâmetro OBRIGATÓRIO `PreserveChanges` — sem ele, 400 "Kein Wert für
// obligatorischen Parameter". false = descarta rascunho pendente de outra sessão.
const EDIT_BODY = { PreserveChanges: false };

// O BDEF declara `etag master LocalLastChangedAt`, e aí o OData EXIGE requisição condicional em
// PATCH/DELETE (428 "Die Datenserviceanforderung muss bedingt sein"). `*` = qualquer versão, que é o
// que se quer num teste; num cliente real vai o etag lido no GET.
const IF_MATCH = { 'If-Match': '*' };

const erro = (r) => r.json?.error?.message?.value || r.json?.error?.message || r.txt.slice(0, 220);

function passo(rotulo, r, ok) {
  const bom = ok ?? (r.status >= 200 && r.status < 300);
  console.log(`  ${bom ? '✓' : '✗'} ${rotulo.padEnd(46)} HTTP ${r.status}`);
  if (!bom) console.log(`      ${erro(r)}`);
  return bom;
}

// ---------------------------------------------------------------------------------------------

console.log(`Alvo: ${cfg.alias.toUpperCase()} mandante ${cliente} · ${cfg.base}\n`);
console.log('─'.repeat(78));
console.log('0. PRÉ-VOO');
console.log('─'.repeat(78));
await preVoo();

console.log('─'.repeat(78));
console.log('1. DESCOBRIR A URL DE RUNTIME');
console.log('─'.repeat(78));
const BASE = await descobrirUrl();
console.log(`  → ${BASE}\n`);

console.log('─'.repeat(78));
console.log('2. $metadata — o serviço existe e expõe o quê?');
console.log('─'.repeat(78));
const meta = await od('GET', `${BASE}$metadata`, undefined, { Accept: 'application/xml' });
passo('$metadata', meta);
if (meta.status === 200) {
  console.log(`      EntitySets:  ${[...meta.txt.matchAll(/<EntitySet Name="([^"]+)"/g)].map((x) => x[1]).join(', ')}`);
  console.log(`      Ações:       ${[...new Set([...meta.txt.matchAll(/<Action Name="([^"]+)"/g)].map((x) => x[1]))].join(', ')}`);
  const props = [...meta.txt.matchAll(/<EntityType Name="MasterData[^"]*"[\s\S]*?<\/EntityType>/g)][0] || '';
  console.log(`      MasterData:  ${[...String(props).matchAll(/<Property Name="([^"]+)"/g)].map((x) => x[1]).join(', ')}`);
} else {
  console.log('\nSem $metadata não há o que testar. Parando.');
  process.exit(1);
}

// token CSRF DO SERVIÇO — sem ele todo POST/PATCH/DELETE volta 403 "CSRF token validation failed".
// O do ADT não vale para /sap/opu/. Passa pelo mesmo pote de cookie que o resto.
const tk = await od('GET', BASE, undefined, { 'X-CSRF-Token': 'Fetch' });
odataToken = tk.headers.get('x-csrf-token') || '';
console.log(`\n  token CSRF do serviço: ${odataToken ? `obtido (${odataToken.length} chars)` : 'AUSENTE — os writes vão falhar'}`);

console.log('\n' + '─'.repeat(78));
console.log('3. READ — o singleton existe?');
console.log('─'.repeat(78));
const sgl = await od('GET', `${BASE}Singleton`);
passo('GET Singleton', sgl);
if (sgl.json?.value) console.log(`      ${sgl.json.value.length} instância(s): ${JSON.stringify(sgl.json.value[0] || {}).slice(0, 160)}`);
const antes = await od('GET', `${BASE}MasterData`);
passo('GET MasterData (antes)', antes);
console.log(`      ${antes.json?.value?.length ?? '?'} linha(s)`);

console.log('\n' + '─'.repeat(78));
console.log('4. CREATE — Edit → POST no rascunho → Activate');
console.log('─'.repeat(78));
const edit1 = await od('POST', `${BASE}Singleton(SingletonID=1,IsActiveEntity=true)/SAP__self.Edit`, EDIT_BODY);
passo('POST Edit (ativo → rascunho)', edit1);
const novo = await od('POST', `${BASE}Singleton(SingletonID=1,IsActiveEntity=false)/_MasterData`,
  { Codigo: CODIGO, Descricao: 'Criado via OData pelo spike' });
passo(`POST _MasterData (${CODIGO})`, novo);
const act1 = await od('POST', `${BASE}Singleton(SingletonID=1,IsActiveEntity=false)/SAP__self.Activate`, {});
passo('POST Activate (rascunho → ativo)', act1);

const lido = await od('GET', `${BASE}MasterData(Codigo='${CODIGO}',IsActiveEntity=true)`);
if (passo('GET do registro criado', lido)) {
  console.log(`      Codigo=${lido.json?.Codigo}  Descricao="${lido.json?.Descricao}"`);
}

console.log('\n' + '─'.repeat(78));
console.log('5. UPDATE — Edit → PATCH no rascunho → Activate');
console.log('─'.repeat(78));
const edit2 = await od('POST', `${BASE}Singleton(SingletonID=1,IsActiveEntity=true)/SAP__self.Edit`, EDIT_BODY);
passo('POST Edit', edit2);
const patch = await od('PATCH', `${BASE}MasterData(Codigo='${CODIGO}',IsActiveEntity=false)`,
  { Descricao: 'ALTERADO pelo spike' }, IF_MATCH);
passo('PATCH Descricao', patch);
const act2 = await od('POST', `${BASE}Singleton(SingletonID=1,IsActiveEntity=false)/SAP__self.Activate`, {});
passo('POST Activate', act2);
const relido = await od('GET', `${BASE}MasterData(Codigo='${CODIGO}',IsActiveEntity=true)`);
if (passo('GET confirmando a alteração', relido)) {
  const ok = relido.json?.Descricao === 'ALTERADO pelo spike';
  console.log(`      Descricao="${relido.json?.Descricao}"  ${ok ? '← persistiu ✓' : '← NÃO persistiu ✗'}`);
}

console.log('\n' + '─'.repeat(78));
console.log('6. DELETE — Edit → DELETE no rascunho → Activate');
console.log('─'.repeat(78));
const edit3 = await od('POST', `${BASE}Singleton(SingletonID=1,IsActiveEntity=true)/SAP__self.Edit`, EDIT_BODY);
passo('POST Edit', edit3);
const del = await od('DELETE', `${BASE}MasterData(Codigo='${CODIGO}',IsActiveEntity=false)`, undefined, IF_MATCH);
passo('DELETE no rascunho', del);
const act3 = await od('POST', `${BASE}Singleton(SingletonID=1,IsActiveEntity=false)/SAP__self.Activate`, {});
passo('POST Activate', act3);
const sumiu = await od('GET', `${BASE}MasterData(Codigo='${CODIGO}',IsActiveEntity=true)`);
passo('GET deve dar 404 (registro apagado)', sumiu, sumiu.status === 404);

console.log('\n' + '─'.repeat(78));
const depois = await od('GET', `${BASE}MasterData`);
console.log(`FIM · MasterData tem ${depois.json?.value?.length ?? '?'} linha(s) (começou com ${antes.json?.value?.length ?? '?'})`);
console.log('─'.repeat(78));
console.log('\nA sessão do ADT continua válida: o cookie rotacionado foi gravado no .sessao.json a cada resposta.');
