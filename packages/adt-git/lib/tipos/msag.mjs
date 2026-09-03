// tipos/msag.mjs — MSAG/N, classe de mensagens. Forma `custom`. (SPIKE 2026-07-19)
// As mensagens são elementos INLINE <mc:messages mc:msgno mc:msgtext .../> no próprio body; não há
// /source/main. GET só aceita `application/*` (os vnd.sap.adt.messageclass.* dão 406).
// ⚠️ o create precisa ser STATELESS — com sessão stateful o POST segura o objeto em edição e o lock
// seguinte dá 403 "currently editing". Nasce ativo (não precisa activate). Nunca deleta.
import { call } from '../sap-connection.mjs';
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

const CT = 'application/xml';
const ACCEPT = 'application/*';

// `messages` = [{ no:'001', text:'Texto com &1', selfExplanatory:false }]
export function buildMessageClassBody(name, pkg, description, messages = []) {
  const N = String(name).toUpperCase();
  const msgs = messages.map((m) =>
    `<mc:messages mc:msgno="${esc(m.no)}" mc:msgtext="${esc(m.text)}" mc:selfexplainatory="${m.selfExplanatory ? 'true' : 'false'}" mc:documented="false" adtcore:name=""/>`).join('');
  return `${XML_PREF}<mc:messageClass xmlns:mc="http://www.sap.com/adt/MessageClass" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="MSAG/N" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}${msgs}</mc:messageClass>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'msag', codigo: 'MSAG', adtType: 'MSAG/N',
  descricao: 'classe de mensagens',
  sinonimos: ['classe de mensagens', 'message class', 'mensagens'],
  coll: '/sap/bc/adt/messageclass',
  ct: CT,
  accept: ACCEPT,
  source: false,
  forma: 'custom',
  nomeacao: { max: 20, fonte: 'documentação SAP (ARBGB, SE91); não medido' },
  oQueFaz: 'Classe de mensagens (MSAG, SE91): as mensagens numeradas que o código emite com MESSAGE … TYPE. As mensagens vão inline no XML.',
  comoTrata: 'create(body sem mensagens) numa sessão 100% STATELESS se faltar → lock → PUT(body com mensagens) → unlock → re-GET. Nasce ativo: não há activate. Devolve as mensagens gravadas.',
  spike: { data: '2026-07-19', sistema: 'DEV', revalidacoes: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'create exige sessão stateless (conexao.sessaoStateless()) — stateful prende o objeto e o lock dá 403 "currently editing"; o spike mediu que nem sempre basta (ponto aberto na skill)',
    'body do create é diferente do body do PUT (create sem mensagens) — o POST ignora as <mc:messages> inline',
    'não chamar activate: nasce ativo',
    'GET só com Accept application/*',
    'IDIOMA: a classe nasce com T100A.MASTERLANG vazio e as mensagens com T100.SPRSL vazio (o GET do ADT diz masterLanguage="PT", a tabela não) — MESSAGE … INTO em sy-langu=P devolve a forma técnica "I:CLASSE:001 4711", não o texto. Medido 2026-08-28 S4H 758. PONTO ABERTO: o body precisa declarar o idioma de outro jeito, ou o texto exige PUT em sessão com sap-language',
  ],
  canais: ['adt', 'classrun'],
  origem: ['skill adt-objetos § MSAG/N — classe de mensagens', 'skill adt-objetos § Pontos abertos (MSAG stateless)'],
  dependencias: [],
  exemplo: {
    opts: {
      name: 'YJBV_POC_MSG', pkg: '$TMP', description: 'Mensagens POC',
      messages: [{ no: '001', text: 'Registro &1 processado pelo agente' }, { no: '002', text: 'Nada a fazer', selfExplanatory: true }],
    },
    nota: 'As mensagens são a parte que o POST ignora — o teste (MESSAGE … INTO) pega o create-sem-PUT.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'as mensagens persistiram? T100 por ARBGB (sem filtrar SPRSL — hoje ele fica VAZIO) e T100A (MASTERLANG também vazio). É o assert do PUT-sem-o-qual-o-POST-descarta, e o que revelou o problema de idioma',
      assert: { readTable: { tabela: 'T100', campos: ['SPRSL', 'MSGNR', 'TEXT'], where: ["ARBGB = 'YJBV_POC_MSG'"] }, espera: "2 linhas com os textos; SPRSL = '' (ponto aberto de idioma)" },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'driver emite a mensagem com MESSAGE … INTO — HOJE devolve a forma técnica ("I:YJBV_POC_MSG:001 4711") porque o texto está em SPRSL vazio, não em sy-langu. Quando o idioma for resolvido, o assert passa a ser o texto',
      abap: [
        'CLASS yjbv_poc_cl_msg DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_msg IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        "    MESSAGE i001(yjbv_poc_msg) WITH '4711' INTO DATA(lv_txt).",
        '    out->write( |langu={ sy-langu } MSG 001={ lv_txt }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'langu=P MSG 001=I:YJBV_POC_MSG:001 4711 (medido; o desejado é "Registro 4711 processado pelo agente")', espera: 'a classe existe e a mensagem é referenciável; o TEXTO só resolve quando SPRSL for o da sessão' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { contem: ':001', causa: 'MESSAGE … INTO devolveu "I:CLASSE:001 …" (forma técnica): o texto não existe no idioma da sessão — a lib grava as mensagens com SPRSL vazio', correcao: 'ponto aberto (2026-08-28): conferir T100.SPRSL; enquanto isso, texto de mensagem criado pela lib não resolve em runtime' },
    { status: 403, contem: 'EU510', causa: 'o create prendeu o objeto em ENQUEUE (sessão stateful) e o lock seguinte é recusado', correcao: 'create em sessão stateless (o módulo já faz); se persistir, esperar o timeout / SM12 — ponto aberto medido' },
    { status: 406, causa: 'GET com media type vnd.sap.adt.messageclass.*', correcao: 'Accept application/*' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'T100A', campos: ['ARBGB', 'STEXT', 'MASTERLANG'], where: [`ARBGB = '${String(name).toUpperCase()}'`],
    espera: "1 linha (cabeçalho da classe) — MASTERLANG vem VAZIO (medido). Mensagens: T100 por ARBGB, SPRSL também vazio (ver testes).",
    medido: true,
  }),
  body: buildMessageClassBody,

  // classe de mensagens: cria (stateless) se faltar, lock+PUT(body), re-GET. Nunca deleta.
  async deploy(ctx, conexao, { name, pkg = '$TMP', description = '', corrNr, messages = [] }) {
    const body = buildMessageClassBody(name, pkg, description, messages);
    const probe = await conexao.sessao();
    const existing = await ctx.getObject(probe, 'msag', name);
    if (!existing.exists) {
      // casca numa sessão 100% STATELESS (token inclusive) — senão o servidor prende o objeto em edição
      // e o lock seguinte dá 403 "currently editing".
      const cs = await conexao.sessaoStateless();
      await ctx.createShell(cs, 'msag', name, { pkg, description, corrNr, stateless: true, body: buildMessageClassBody(name, pkg, description, []) });
    }
    // sessão stateful para lock → PUT → unlock
    const s = await conexao.sessao();
    const h = await ctx.lock(s, 'msag', name);
    try {
      let p = `${ctx.objPath('msag', name)}?lockHandle=${h}`; if (corrNr) p += `&corrNr=${corrNr}`;
      const r = await call(s, { method: 'PUT', path: p, accept: ACCEPT, contentType: CT, body });
      if (r.status >= 400) throw new Error(`PUT ${name} falhou (${r.status}): ${(r.text.match(/<message lang="EN">([^<]*)/) || [])[1] || r.text.slice(0, 200)}`);
    } finally { await ctx.unlock(s, 'msag', name, h); }
    const s2 = await conexao.sessao();
    const final = await ctx.getObject(s2, 'msag', name);
    return { created: !existing.exists, version: final.version, messages: [...final.text.matchAll(/<mc:messages mc:msgno="(\d+)" mc:msgtext="([^"]*)"/g)].map((x) => ({ no: x[1], text: x[2] })) };
  },
};
