// probe.mjs — que canais do arsenal um sistema oferece? A primeira pergunta antes de qualquer teste.
//
// A seleção de canal é POR SISTEMA: classrun exige ABAP ≥ 7.52, SOAP RFC depende do nó SICF ativo,
// ADT depende dos serviços ADT. Em vez de o consumidor decorar a matriz, ele pergunta:
//
//   const p = await probe(cfg);   // { adt, soapRfc, classrun, release, sysid, mandante, usuario }
//
// Cada sonda é INDEPENDENTE e falha macia (false + motivo) — um sistema sem SOAP RFC ainda
// responde ADT, e vice-versa. Nada aqui altera o sistema: são um GET de discovery e um eco.

import { ping } from './rfc-soap.mjs';
import { passo, detalhe, http as logHttp } from './log.mjs';
import { MODULOS } from './tipos/index.mjs';

// Um GET com Basic abre uma sessão de segurança no servidor (cookie no set-cookie) — e sonda que
// não faz logoff pode deixá-la viva até o timeout do sistema-alvo (2 sessões 202 ficaram no SXD em
// 2026-09-01; no s4h a stateless morre sozinha, medido no mesmo dia — o timeout é configuração de
// cada sistema). Regra da lib: quem abre fecha. O logoff responde 500 ao encerrar com sucesso.
async function despedirCookie(cfg, res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookie = sc.map((l) => l.split(';')[0]).join('; ');
  if (!cookie) return;
  const url = `${cfg.base}/sap/public/bc/icf/logoff${cfg.client ? `?sap-client=${cfg.client}` : ''}`;
  await fetch(url, { headers: { Cookie: cookie } }).then((r) => r.text()).catch(() => {});
}

/**
 * PURO: quais tipos de objeto o discovery ADT deste sistema oferece. Casa o `coll` de cada módulo
 * com os `href` das `<app:collection>` do `/sap/bc/adt/discovery` (os hrefs são o path completo ou
 * relativo a /sap/bc/adt — conferido para DDLX em 2026-08-05; os demais seguem a mesma estrutura,
 * por inferência). Tipo aninhado (FM) responde pelo contêiner. Devolve { libKey: { ok, href? } }.
 * É o que mede, POR SISTEMA, o que `releases.minimo` não sabe: em ECC não há DDLX/BDEF/SRVD/SRVB.
 */
export function tiposNoDiscovery(xml, modulos = MODULOS) {
  const hrefs = [...String(xml).matchAll(/<app:collection\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
  const out = {};
  for (const [k, m] of Object.entries(modulos)) {
    const coll = m.coll.replace(/^\/sap\/bc\/adt/, '');
    const href = hrefs.find((h) => h === m.coll || h.replace(/^\/sap\/bc\/adt/, '') === coll || h.endsWith(coll));
    out[k] = href ? { ok: true, href } : { ok: false, motivo: `sem coleção ${m.coll} no discovery` };
  }
  return out;
}

/** GET do discovery completo + `tiposNoDiscovery`. Nada altera o sistema. */
export async function tiposDisponiveis(cfg) {
  const url = `${cfg.base}/sap/bc/adt/discovery${cfg.client ? `?sap-client=${cfg.client}` : ''}`;
  const t = Date.now();
  const res = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64'), Accept: 'application/atomsvc+xml' } });
  const xml = await res.text();
  logHttp('GET', url, res.status, Date.now() - t, xml.length);
  await despedirCookie(cfg, res);
  if (res.status !== 200) throw new Error(`discovery falhou (${res.status}): ${xml.slice(0, 200)}`);
  return tiposNoDiscovery(xml);
}

/** classrun existe a partir do ABAP 7.52 (if_oo_adt_classrun). Release vem como "758", "751"… */
export function classrunDisponivel(release) {
  const n = parseInt(String(release ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 752;
}

/** Sonda o discovery ADT com Basic Auth. 200 = ADT utilizável; 401/403/404 explicam o porquê. */
async function sondarAdt(cfg) {
  const url = `${cfg.base}/sap/bc/adt/core/discovery${cfg.client ? `?sap-client=${cfg.client}` : ''}`;
  const t = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64') },
    });
    logHttp('GET', url, res.status, Date.now() - t, 0);
    await despedirCookie(cfg, res);
    if (res.status === 200) return { ok: true };
    return { ok: false, motivo: `HTTP ${res.status} no discovery` };
  } catch (e) {
    return { ok: false, motivo: `sem resposta: ${e.message}` };
  }
}

/**
 * Mapeia os canais disponíveis no sistema do `cfg` ({ base, user, pass, client }).
 * `classrun` aqui é INFERÊNCIA por release (≥ 7.52) + ADT ok — a prova definitiva é executar
 * uma classe; para a decisão de roteamento, o release basta.
 */
export async function probe(cfg) {
  passo(`probe: ${cfg.base} mandante ${cfg.client ?? '(default)'}`);
  const [adt, eco] = await Promise.all([
    sondarAdt(cfg),
    ping(cfg).catch((e) => ({ ok: false, motivo: e.message })),
  ]);
  const resultado = montarResumo(adt, eco);
  detalhe(`adt=${resultado.adt.ok} soapRfc=${resultado.soapRfc.ok} classrun=${resultado.classrun.ok} release=${resultado.release ?? '?'}`);
  return resultado;
}

/** Separado do probe() para ser testável offline: decide o mapa a partir das duas sondas. */
export function montarResumo(adt, eco) {
  const soapOk = eco.ok === true;
  return {
    adt,
    soapRfc: soapOk ? { ok: true } : { ok: false, motivo: eco.motivo ?? 'eco falhou' },
    classrun: adt.ok && soapOk && classrunDisponivel(eco.release)
      ? { ok: true }
      : { ok: false, motivo: !adt.ok ? 'sem ADT' : (soapOk ? `release ${eco.release ?? '?'} < 7.52 (ou desconhecido)` : 'release desconhecido (sem eco)') },
    release: soapOk ? eco.release : null,
    sysid: soapOk ? eco.sysid : null,
    mandante: soapOk ? eco.mandante : null,
    usuario: soapOk ? eco.usuario : null,
  };
}
