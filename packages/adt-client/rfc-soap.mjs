// rfc-soap.mjs — canal SOAP RFC: chamar FM remote-enabled por HTTP puro (/sap/bc/soap/rfc).
//
// POR QUE ESTE CANAL EXISTE: node-rfc/PyRFC foram arquivados pela SAP (05/2026) e dependem do
// NW RFC SDK, de download restrito por S-user. O ICF expõe o mesmo poder por HTTP: qualquer FM
// remote-enabled vira um POST com envelope SOAP e Basic Auth — o MESMO `cfg` do resto da lib
// ({ base, user, pass, client }). Sem SDK, sem sessão ADT, sem CSRF. Alcança sistemas antigos
// (ICF existe desde Web AS ~6.20), desde que o nó esteja ativo na SICF.
//
// Validado por spike no S4H rel. 758 em 2026-08-26 — ver docs/canal-soap-rfc.md. A gramática:
//   • o elemento do Body é o NOME DO FM; import viram elementos filhos;
//   • tabela vira <NOME><item>…</item></NOME>; estrutura vira elemento com filhos;
//   • a resposta vem em <urn:NOME.Response>; erro vem como SOAP Fault (HTTP 500).
// Restrições: tRFC/qRFC não passam por aqui; o usuário precisa de S_RFC no function group.
//
// ⚠️ A senha viaja em Basic a cada chamada. Nunca logar o header — só o nome.
//
// ⚠️ CADA POST É UMA LUW PRÓPRIA, e isso NÃO muda por reusar a sessão (medido no item 90): BAPI de
// escrita numa chamada + COMMIT em outra continua não persistindo. Ver docs/canal-soap-rfc.md.

import { passo, detalhe, http as logHttp } from './log.mjs';

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Um parâmetro do FM → XML. A forma segue o TIPO do valor:
// escalar → <NOME>v</NOME> · array (tabela) → <NOME><item>…</item></NOME> · objeto (estrutura) → filhos.
function paramXml(nome, valor) {
  const N = nome.toUpperCase();
  if (valor === null || valor === undefined) return `<${N}></${N}>`;
  if (Array.isArray(valor)) return `<${N}>${valor.map((i) => `<item>${filhos(i)}</item>`).join('')}</${N}>`;
  if (typeof valor === 'object') return `<${N}>${filhos(valor)}</${N}>`;
  return `<${N}>${esc(valor)}</${N}>`;
}
const filhos = (v) => (typeof v === 'object' && v !== null)
  ? Object.entries(v).map(([k, x]) => `<${k.toUpperCase()}>${esc(x ?? '')}</${k.toUpperCase()}>`).join('')
  : esc(v);

export function buildEnvelope(fm, params = {}) {
  const corpo = Object.entries(params).map(([k, v]) => paramXml(k, v)).join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>
    <urn:${fm.toUpperCase()} xmlns:urn="urn:sap-com:document:sap:rfc:functions">
      ${corpo}
    </urn:${fm.toUpperCase()}>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

// ---------- parse da resposta ----------
// De propósito por regex, como os demais parsers da lib: o XML do ICF é raso e previsível,
// e um parser DOM inteiro não paga o próprio peso aqui.

// O ICF escapa os valores como entidade XML — '&' num campo da E07T chega como `&#38;` (medido
// 2026-09-02, item 71: a MESMA descrição via ADT vinha 'SOAP & RFC' e via SOAP 'SOAP &#38; RFC').
// Todo parser daqui desfaz o escape: o valor devolvido é o que está no banco, não o do fio.
const desescapar = (s) => (s.includes('&') ? s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&') : s);

/** Valor do primeiro elemento <TAG>…</TAG>. */
export const xmlField = (xml, tag) => {
  const v = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
  return v == null ? null : desescapar(v);
};

/** Os <item> de uma tabela <NOME>…</NOME>, cada um como objeto {CAMPO: valor}. */
export function xmlItems(xml, tabela) {
  const secao = xml.match(new RegExp(`<${tabela}>([\\s\\S]*?)</${tabela}>`))?.[1] ?? '';
  return [...secao.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) =>
    Object.fromEntries([...item.matchAll(/<([A-Z0-9_]+)>([^<]*)<\/\1>/g)].map(([, k, v]) => [k, desescapar(v)])));
}

/** Uma ESTRUTURA exportada <NOME><CAMPO>…</CAMPO>…</NOME>, como objeto {CAMPO: valor}. */
export function xmlStruct(xml, tag) {
  const secao = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
  return Object.fromEntries([...secao.matchAll(/<([A-Z0-9_]+)>([^<]*)<\/\1>/g)].map(([, k, v]) => [k, desescapar(v)]));
}

// ---------- a sessão de segurança deste canal ----------
//
// POR QUE ISTO EXISTE: uma requisição autenticada que chega SEM cookie faz o ICF criar uma sessão
// de segurança HTTP "não usada" (`SECURITY_CONTEXT` com `TIMEOUT_CHECK=2`) que o logoff NÃO remove
// e que só morre no EOL FIXO de `start + http/security_session_timeout` (1800 s). Contra o teto por
// usuário (default declarado 100 em `CL_HTTP_SECURITY_SESSION=>CO_SESSION_LIMIT_UNUSED_DFLT`),
// ~100 chamadas em 30 min derrubam o canal STATEFUL do próprio usuário — o ADT passa a nascer sem
// `SAP_SESSIONID` e toda requisição com esse cookie dá 400 (itens 28/53 da fila).
//
// O REMÉDIO: guardar o `SAP_SESSIONID` da primeira resposta e reenviá-lo. A segunda requisição USA
// a sessão (`CL_HTTP_SECURITY_SESSION_ICF::_update_context_timestamp`), ela entra no cache do ICM,
// `TIMEOUT_CHECK` vira 1 e passa a valer o timeout DESLIZANTE — e nenhuma outra nasce.
// Medido no S4H 758/250 em 2026-09-06 (item 90): 10 chamadas SEM cookie = +10 não usadas;
// 10 chamadas COM cookie = +0 não usadas e +1 usada, e ainda 38% mais rápidas.
//
// É transparente de propósito: são ~150 call sites na lib, e o certo é o default. `cfg` não guarda
// o cookie (ele é reconstruído a cada processo em vários caminhos) — a chave é o ALVO+USUÁRIO.
const jars = new Map();
const chaveDaSessao = (cfg) => `${cfg.base}|${cfg.client ?? ''}|${cfg.user ?? ''}`;

/**
 * PURO: aplica os `Set-Cookie` de uma resposta sobre o cookie guardado, como um navegador faria.
 * Valor vazio = cookie apagado pelo servidor, então some do jar em vez de virar `NOME=`.
 */
export function absorverSetCookie(cookieAtual, setCookie = []) {
  const mapa = new Map((cookieAtual || '').split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]));
  for (const bruto of setCookie) {
    const par = bruto.split(';')[0];
    const i = par.indexOf('=');
    if (i < 1) continue;
    if (par.slice(i + 1) === '') mapa.delete(par.slice(0, i));
    else mapa.set(par.slice(0, i), par);
  }
  return [...mapa.values()].join('; ');
}

/** Esquece o cookie guardado deste alvo — sem falar com o servidor. */
export function esquecerSessaoSoap(cfg) { return jars.delete(chaveDaSessao(cfg)); }

/**
 * Devolve a sessão ao servidor ao fim do trabalho — melhor esforço, e por isso nunca lança.
 * Só faz sentido depois de um laço: o que fica sem isto é UMA sessão *usada*, com timeout
 * deslizante, que é o custo normal de qualquer cliente HTTP — não é o que estoura o teto.
 * ⚠️ Medido em 2026-09-06 no S4H: `/sap/public/bc/icf/logoff` responde 500 neste sistema mesmo SEM
 * cookie (o nó, não a sessão). Daí `encerrada:false` não ser erro de quem chama.
 */
export async function encerrarSessaoSoap(cfg) {
  const jar = jars.get(chaveDaSessao(cfg));
  esquecerSessaoSoap(cfg);
  if (!jar?.cookie) return { status: null, encerrada: false };
  const url = `${cfg.base}/sap/public/bc/icf/logoff${cfg.client ? `?sap-client=${cfg.client}` : ''}`;
  const res = await fetch(url, { headers: { Cookie: jar.cookie } }).catch(() => null);
  await res?.text();
  return { status: res?.status ?? null, encerrada: res?.status === 200 };
}

// ---------- a chamada ----------
/**
 * `reusarSessao: false` volta ao comportamento antigo (uma sessão de segurança nova por chamada) —
 * é o que uma MEDIÇÃO de sessões precisa, para a sonda não mexer no que está medindo.
 */
export async function callFunction(cfg, fm, params = {}, { reusarSessao = true } = {}) {
  const FM = String(fm).toUpperCase();
  passo(`soap-rfc: ${FM}`);
  const url = `${cfg.base}/sap/bc/soap/rfc${cfg.client ? `?sap-client=${cfg.client}` : ''}`;
  const headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: '',
    Authorization: 'Basic ' + Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64'),
  };
  const chave = chaveDaSessao(cfg);
  const jar = reusarSessao ? (jars.get(chave) ?? { cookie: '' }) : null;
  if (jar?.cookie) headers.Cookie = jar.cookie;
  const t = Date.now();
  const res = await fetch(url, { method: 'POST', headers, body: buildEnvelope(FM, params) });
  const xml = await res.text();
  logHttp('POST', url, res.status, Date.now() - t, xml.length);
  // Cookie morto NÃO derruba a chamada: o Basic vai junto sempre, então o ICF re-autentica e manda
  // um `SAP_SESSIONID` novo (medido no item 90 com cookie-lixo, vazio e de outro SID: 200 nos três).
  // Por isso não há retry aqui — só absorver o que voltou.
  if (jar) {
    jar.cookie = absorverSetCookie(jar.cookie, res.headers.getSetCookie?.() ?? []);
    if (jar.cookie) jars.set(chave, jar);
  }
  // Fault chega como HTTP 500 com <faultstring> — é o "exceção do FM" deste canal.
  const fault = xml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/)?.[1];
  if (fault) throw new Error(`RFC ${FM} falhou (SOAP Fault): ${fault}`);
  if (res.status >= 400) throw new Error(`RFC ${FM} falhou (HTTP ${res.status}): ${xml.slice(0, 200)}`);
  return { status: res.status, xml };
}

// ---------- operações ----------

/** Eco + identidade do sistema. O RESPTEXT do STFC_CONNECTION traz release/SID/logon de brinde. */
export async function ping(cfg, { texto = 'ping adt-client', reusarSessao = true } = {}) {
  const { xml } = await callFunction(cfg, 'STFC_CONNECTION', { REQUTEXT: texto }, { reusarSessao });
  const resptext = xmlField(xml, 'RESPTEXT') ?? '';
  const m = resptext.match(/Rel\.\s+(\S+)\s+Sysid:\s+(\S+)\s+Date:\s+(\S+)\s+Time:\s+(\S+)\s+Logon_Data:\s+(\S+)/);
  const [mandante, usuario, idioma] = (m?.[5] ?? '').split('/');
  return {
    ok: xmlField(xml, 'ECHOTEXT') === texto,
    release: m?.[1] ?? null, sysid: m?.[2] ?? null, data: m?.[3] ?? null, hora: m?.[4] ?? null,
    mandante: mandante || null, usuario: usuario || null, idioma: idioma || null,
    resptext,
  };
}

/**
 * A exceção do RFC_READ_TABLE não aponta a causa quando o erro é de CAMPO: pedir um campo que a
 * tabela não tem faz o FM levantar `TABLE_WITHOUT_DATA` — que se lê como "a tabela não tem dados"
 * e manda procurar no lugar errado. Medido 2026-08-29 no S4H 758: `E071` com o campo `GENFLAG`
 * (o nome certo é `GENNUM`) e com um campo inventado levantam a MESMA exceção; com `GENNUM`, lê.
 * Quando não se sabe o nome exato, o jeito seguro é chamar SEM `campos` — os nomes vêm na resposta.
 */
export function dicaDeLeitura(erro, tabela, campos) {
  if (!/TABLE_WITHOUT_DATA/.test(erro.message) || !campos.length) return erro;
  erro.message += `\n  dica: TABLE_WITHOUT_DATA também é o que o FM levanta quando um dos campos`
    + ` pedidos NÃO EXISTE em ${String(tabela).toUpperCase()} (${campos.join(', ')}).`
    + ` Confira os nomes, ou chame sem \`campos\` — a resposta traz a lista.`;
  return erro;
}

/**
 * Leitura de tabela via RFC_READ_TABLE — a verificação universal de estado.
 * `where` é uma lista de linhas de WHERE (máx. 72 chars cada, regra do próprio FM).
 * Limites conhecidos do FM: linha de resultado ≤ 512 chars, sem campos float/string longos.
 */
export async function readTable(cfg, tabela, { campos = [], where = [], linhas = 100, delimitador = '|', reusarSessao = true } = {}) {
  const { xml } = await callFunction(cfg, 'RFC_READ_TABLE', {
    QUERY_TABLE: String(tabela).toUpperCase(),
    DELIMITER: delimitador,
    ROWCOUNT: linhas,
    FIELDS: campos.map((c) => ({ FIELDNAME: String(c).toUpperCase() })),
    OPTIONS: where.map((w) => ({ TEXT: w })),
    DATA: [],
  }, { reusarSessao }).catch((e) => { throw dicaDeLeitura(e, tabela, campos); });
  // A ordem/nomes dos campos vêm da PRÓPRIA resposta (tabela FIELDS) — vale também sem `campos`.
  const nomes = xmlItems(xml, 'FIELDS').map((f) => f.FIELDNAME);
  const linhasWa = xmlItems(xml, 'DATA').map((d) => d.WA ?? '');
  detalhe(`${tabela}: ${linhasWa.length} linha(s), campos ${nomes.join(',')}`);
  return linhasWa.map((wa) => {
    const partes = wa.split(delimitador);
    return Object.fromEntries(nomes.map((n, i) => [n, (partes[i] ?? '').trim()]));
  });
}

/**
 * Chama uma BAPI e NORMALIZA o RETURN (estrutura OU tabela BAPIRET2 → sempre array).
 * `ok` = nenhuma mensagem E/A. Para BAPI de escrita, encadear BAPI_TRANSACTION_COMMIT — este
 * helper NÃO comita sozinho, de propósito: commit é decisão de quem orquestra.
 */
export async function callBapi(cfg, bapi, params = {}, { reusarSessao = true } = {}) {
  const { xml } = await callFunction(cfg, bapi, params, { reusarSessao });
  const secao = xml.match(/<RETURN>[\s\S]*?<\/RETURN>/)?.[0] ?? '';
  const mensagens = secao.includes('<item>')
    ? xmlItems(xml, 'RETURN')
    : (xmlField(secao, 'TYPE') !== null ? [xmlStruct(secao, 'RETURN')] : []);
  const relevantes = mensagens.filter((m) => m.TYPE); // TYPE vazio = RETURN "em branco" = sucesso
  return {
    ok: !relevantes.some((m) => m.TYPE === 'E' || m.TYPE === 'A'),
    mensagens: relevantes,
    xml,
  };
}

/**
 * PURO: lê os contadores do wrapper de cura de sessões de segurança (`buildSecuritySessionCureSource`).
 * Separado da chamada para ser testável offline contra a resposta REAL do canal.
 */
export function parseCuraSessoes(xml) {
  const n = (t) => { const v = xmlField(xml, t); return v === null || v === '' ? null : Number(v); };
  const erros = n('EV_ERRO');
  return {
    antes: n('EV_ANTES'),
    antesNaoUsadas: n('EV_ANTES_NU'),
    alvos: n('EV_ALVOS'),
    abortadas: n('EV_OK'),
    erros,
    depois: n('EV_DEPOIS'),
    depoisNaoUsadas: n('EV_DEPOIS_NU'),
    corrente: xmlField(xml, 'EV_CORRENTE') || null,
    msg: xmlField(xml, 'EV_MSG') || null,
    ok: erros === 0,
  };
}

/**
 * Cura, por canal STATELESS, o esgotamento de sessões de segurança HTTP não usadas do próprio
 * usuário — o estado em que o canal stateful (ADT/classrun) passa a nascer sem `SAP_SESSIONID` e
 * toda requisição com esse cookie dá 400 (item 28 da fila). Exige o wrapper RFC criado por
 * `deployFunctionModule(conexao, { group, name, source: buildSecuritySessionCureSource(name) })`.
 *
 * É o único caminho de cura que atravessa a quebra: `ABORT_SECURITY_SESSION` por classrun não vale,
 * porque classrun É ADT, e ADT é justo o canal que morreu. Sem isto, curar custa esperar os 30 min
 * do `http/security_session_timeout`.
 *
 * `pouparCorrente: true` deixa viva a sessão desta própria chamada. O default é `false` porque
 * abortá-la foi medido inofensivo (S4H 758/250, 2026-09-06: HTTP 200, resposta completa, requisição
 * seguinte normal) e limpa 100%. `dryRun: true` só conta os alvos, sem abortar nada.
 */
export async function curarSessoesDeSeguranca(cfg, { fm, dryRun = false, pouparCorrente = false } = {}) {
  if (!fm) throw new Error('curarSessoesDeSeguranca exige { fm } — o nome do wrapper RFC criado com buildSecuritySessionCureSource');
  const { xml, status } = await callFunction(cfg, fm, {
    IV_DRY_RUN: dryRun ? 'X' : '',
    IV_POUPAR_CORRENTE: pouparCorrente ? 'X' : '',
  });
  return { ...parseCuraSessoes(xml), status, xml };
}
