// tipos/interface.mjs — INTF/OI, interface ABAP. Forma `source`. (SPIKE 2026-07-19)
// O create aceita `interfaces.v2+xml`, mas o GET com esse mesmo tipo dá 406 — a leitura exige `v5`
// (ou `application/*`). Create e leitura com media types diferentes, como no MSAG.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'interface', codigo: 'INTF', adtType: 'INTF/OI',
  descricao: 'interface',
  sinonimos: ['if'],
  coll: '/sap/bc/adt/oo/interfaces',
  ct: 'application/vnd.sap.adt.oo.interfaces.v2+xml',
  accept: 'application/*',
  source: true,
  forma: 'source',
  nomeacao: { max: 30, fonte: 'documentação SAP (nome de objeto OO); não medido' },
  oQueFaz: 'Interface ABAP OO (INTF). A lib cria/altera o source completo (`INTERFACE … PUBLIC. … ENDINTERFACE.`) e ativa.',
  comoTrata: 'Shell `intf:abapInterface` → lock → PUT /source/main → unlock → activate (deploySource). GET com Accept `application/*` — o media type do create devolve 406 na leitura.',
  spike: { data: '2026-07-19', sistema: 'DEV', revalidacoes: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'GET exige Accept application/* (ou v5); o ct do create dá 406 na leitura — o objeto "some" depois de criado',
    'interface não tem includes (…/includes/… dá 404); crie a interface ANTES da classe que a implementa',
  ],
  canais: ['adt', 'classrun'],
  origem: ['skill adt-objetos § INTF/OI — interface'],
  dependencias: [],
  exemplo: {
    opts: {
      name: 'YJBV_POC_IF_X', pkg: '$TMP', description: 'POC interface',
      source: [
        'INTERFACE yjbv_poc_if_x PUBLIC.',
        '  METHODS executar RETURNING VALUE(rv_ok) TYPE abap_bool.',
        'ENDINTERFACE.',
      ].join('\n'),
    },
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'driver com classe local que implementa a interface e chama o método (prova ativação + assinatura)',
      abap: [
        'CLASS yjbv_poc_cl_if DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS lcl_impl DEFINITION. PUBLIC SECTION. INTERFACES yjbv_poc_if_x. ENDCLASS.',
        'CLASS lcl_impl IMPLEMENTATION. METHOD yjbv_poc_if_x~executar. rv_ok = abap_true. ENDMETHOD. ENDCLASS.',
        'CLASS yjbv_poc_cl_if IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    DATA(lo) = NEW lcl_impl( ).',
        '    out->write( |IF ok={ lo->yjbv_poc_if_x~executar( ) }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'IF ok=X', espera: 'a classe local compila contra a interface e o método responde' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 406, causa: 'GET com o media type do create (interfaces.v2+xml)', correcao: 'Accept application/* (ou v5) — o módulo já usa; create OK não prova nada sobre o GET' },
    { status: 404, contem: 'includes', causa: 'interface não tem includes', correcao: 'não há o que gravar em …/includes/…' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'SEOCLASS', campos: ['CLSNAME', 'CLSTYPE'], where: [`CLSNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, CLSTYPE = '1' (interface). Estado ativo: getObject → adtcore:version=\"active\".",
    medido: true,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces" xmlns:adtcore="http://www.sap.com/adt/core" intf:modeled="false" adtcore:name="${N}" adtcore:type="INTF/OI" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</intf:abapInterface>`;
  },
};
