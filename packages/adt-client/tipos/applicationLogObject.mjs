// tipos/applicationLogObject.mjs — APLO/TYP, o objeto do log de aplicação (o que a SLG0 mantém).
// Forma `json`, `ativacaoJson: 'nenhuma'`. (SPIKE 2026-08-31, S4H 758 — fila 29; forma genérica
// extraída na fila 60/I56, depois de comparar com NROB e SAJC — ver tipos/_esquema.mjs § FORMAS.json)
//
// É o primeiro tipo "blue" (ABAP File Formats) da lib: o fonte NÃO é ABAP nem XML — é **JSON**,
// validado por um JSON Schema que o próprio sistema serve em `…/objects/$schema`
// (`aplo-v1.json`, o mesmo do github.com/SAP/abap-file-formats).
//
// TRÊS DESVIOS do fluxo `source` genérico, todos medidos:
//   1. o create é `application/vnd.sap.adt.blues.v1+xml` — PLURAL "blues", e é o que o discovery
//      declara na coleção. Os palpites óbvios (`…applicationlog.objects.v1+xml`, `…aplo.v1+xml`,
//      `…blue.v1+xml`, `application/xml`) dão 415 — e o corpo do 415 NÃO nomeia o suportado.
//   2. o PUT de `/source/main` é `application/json` (o `setSource` genérico manda `text/plain`).
//   3. **não ativa**: nasce `version="active"` e o PUT do fonte já grava a BALOBJ/BALSUB. Como o
//      pacote (DEVC), por isso a forma é `custom`.
//
// O QUE ELE É, DO LADO DO DADO: o objeto e seus subobjetos são as CHAVES que a BALHDR aceita —
// `BAL_LOG_CREATE` recusa (`log_header_inconsistent`, subrc 1) objeto ou subobjeto que não existe
// nessas tabelas. Sem este tipo, criar objeto de log era SLG0 (GUI). Ver `bal.mjs` para gravar e
// LER o log; aqui só se cria o objeto.

import { XML_PREF, pkgRef, esc } from './_xml.mjs';

const CT_CREATE = 'application/vnd.sap.adt.blues.v1+xml';

/**
 * O fonte JSON do objeto de log (puro). `subobjetos`: `[{ nome, descricao }]` ou `['POC']`.
 * `originalLanguage` é **minúsculo** no formato AFF (o schema exige `^[a-z]+$`).
 */
export function buildAploSource(description, subobjetos = [], { idioma = 'pt' } = {}) {
  return `${JSON.stringify({
    formatVersion: '1',
    header: { description: String(description ?? ''), originalLanguage: String(idioma).toLowerCase() },
    subobjects: subobjetos.map((s) => (typeof s === 'string'
      ? { name: String(s).toUpperCase(), description: '' }
      : { name: String(s.nome ?? s.name).toUpperCase(), description: String(s.descricao ?? s.description ?? '') })),
  }, null, 2)}\n`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'applicationLogObject', codigo: 'APLO', adtType: 'APLO/TYP',
  descricao: 'objeto do log de aplicação (SLG0)',
  sinonimos: ['aplo', 'slg0', 'objeto de log', 'log de aplicação'],
  coll: '/sap/bc/adt/applicationlog/objects',
  ct: CT_CREATE,
  accept: 'application/*',
  source: true,
  forma: 'json',
  ativacaoJson: 'nenhuma',
  nomeacao: { max: 20, fonte: 'OBJNAME_MAXLENGTH do repository/typestructure (medido 2026-08-31) = BALOBJ-OBJECT CHAR 20' },
  oQueFaz: 'Cria/altera o objeto de log de aplicação e seus subobjetos — as chaves que BAL_LOG_CREATE exige e que a SLG1 filtra. Sem ele, era SLG0 (GUI).',
  comoTrata: 'create `blue:blueSource` com ct `blues.v1+xml` → lock → PUT /source/main em application/json (o fonte AFF) → unlock. NÃO ativa: nasce ativo e o PUT já grava BALOBJ/BALSUB.',
  spike: { data: '2026-08-31', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    'create só com `application/vnd.sap.adt.blues.v1+xml` (plural) — os outros dão 415 sem nomear o suportado',
    'PUT do /source/main em `application/json`; `text/plain` não é o media type do fonte AFF',
    'não chame activate: o objeto nasce ativo e o PUT persiste direto (BALOBJ/BALSUB)',
    'subobjeto é NOME dentro do objeto, máx. 20 (BALSUBOBJ) — não é objeto de repositório e não tem TADIR própria',
  ],
  canais: ['adt', 'classrun'],
  origem: ['spike fila 29 (2026-08-31, S4H 758)', 'discovery: workspace "Others" → coleção applicationlog/objects', '$schema servido pelo sistema (aplo-v1.json)'],
  dependencias: [],
  exemplo: {
    opts: {
      name: 'YJBV_POC_LOG29', pkg: '$TMP', description: 'POC fila 29 — application log',
      subobjetos: [{ nome: 'POC', descricao: 'Subobjeto da POC do assert por SLG1' }],
    },
    nota: 'o fonte JSON pode vir pronto em `source`; `subobjetos` é o atalho que o monta.',
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'driver grava um log no objeto criado (BAL_LOG_CREATE + MSG_ADD + DB_SAVE) — o objeto só é "real" se o BAL o aceitar',
      abap: [
        'CLASS yjbv_poc_cl_bal29w DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_bal29w IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    DATA ls_log TYPE bal_s_log.',
        '    DATA lv_handle TYPE balloghndl.',
        "    ls_log-object = 'YJBV_POC_LOG29'. ls_log-subobject = 'POC'.",
        "    ls_log-extnumber = 'FILA29-GRAVA'.",
        "    CALL FUNCTION 'BAL_LOG_CREATE'",
        '      EXPORTING i_s_log = ls_log IMPORTING e_log_handle = lv_handle',
        '      EXCEPTIONS OTHERS = 1.',
        '    out->write( |CREATE subrc={ sy-subrc }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'CREATE subrc=0', espera: 'subrc 0 prova que objeto+subobjeto existem na BALOBJ/BALSUB; com nome inventado o subrc é 1 (log_header_inconsistent)' },
      medido: [{ data: '2026-08-31', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 415, causa: 'content-type do create diferente de `blues.v1+xml`', correcao: 'use o media type que o discovery declara na coleção — o corpo do 415 não o nomeia' },
    { status: 406, contem: 'source/main', causa: 'GET/PUT do fonte com text/plain ou com um vnd.sap.adt.* inventado', correcao: 'application/json (ou application/*) — o fonte é AFF/JSON' },
    { status: 400, contem: 'uriMappingError', causa: 'GET na coleção sem nome de objeto', correcao: 'a coleção só aceita POST; leitura é por objeto (…/objects/<nome>)' },
  ],
  desmentidos: [
    {
      crenca: 'objeto de log de aplicação só se cria na SLG0 (GUI) ou inserindo em BALOBJ/BALSUB à mão',
      fato: 'o ADT REST cria: POST `blues.v1+xml` → 201 já `version="active"`, e o PUT do fonte JSON grava objeto e subobjetos na BALOBJ/BALSUB',
      medido: { data: '2026-08-31', sistema: 'S4H', release: '758' },
    },
  ],
  prova: (name) => ({
    tabela: 'BALOBJ', campos: ['OBJECT'], where: [`OBJECT = '${String(name).toUpperCase()}'`],
    espera: '1 linha. Os subobjetos aparecem na BALSUB (OBJECT + SUBOBJECT); a TADIR tem R3TR APLO <nome>.',
    medido: true,
  }),
  validar(opts) {
    if (!opts?.source && !opts?.subobjetos) {
      throw new Error('applicationLogObject exige { source } (JSON AFF) ou { subobjetos: [{ nome, descricao }] }.');
    }
    for (const s of opts?.subobjetos ?? []) {
      const nome = String(typeof s === 'string' ? s : (s.nome ?? s.name ?? ''));
      if (!nome) throw new Error('subobjeto sem nome.');
      if (nome.length > 20) throw new Error(`GUARD-RAIL: subobjeto "${nome}" tem ${nome.length} caracteres; BALSUBOBJ aceita 20.`);
    }
  },
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="APLO/TYP" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT" adtcore:version="active">${pkgRef(pkg)}</blue:blueSource>`;
  },
  // gancho da forma `json` — `def.subobjetos` é o atalho amigável; `def.source` (JSON pronto) tem prioridade.
  body(name, pkg, description, def = {}) {
    return buildAploSource(description, def.subobjetos ?? []);
  },
};
