// tipos/domain.mjs — DOMA/DD, domínio. Forma `xml`. (SPIKE 2026-07-27, POC validada no $TMP)
// XML puro (sem /source/main): a definição técnica + valores fixos vão no body. Igual ao DE, o create
// grava só a parte técnica — o PUT com lock é que persiste texto e VALORES FIXOS; por isso o PUT roda
// sempre, inclusive após o create. Fluxo `deployBody` genérico.
import { XML_PREF, pkgRef, esc, pad0 } from './_xml.mjs';

// def: { dataType:'CHAR'|'NUMC'|…, length, decimals?, outputLength?, lowercase?, fixValues?:[{low,high?,text}] }
export function buildDomainBody(name, pkg, description, def = {}) {
  const N = String(name).toUpperCase();
  const dt = esc(def.dataType || 'CHAR');
  const len = pad0(def.length ?? 1, 6), dec = pad0(def.decimals ?? 0, 6);
  const olen = pad0(def.outputLength ?? def.length ?? 1, 6);
  const fix = (def.fixValues || []).map((v, i) =>
    `<doma:fixValue><doma:position>${pad0(i + 1, 4)}</doma:position><doma:low>${esc(v.low)}</doma:low><doma:high>${esc(v.high || '')}</doma:high><doma:text>${esc(v.text || '')}</doma:text></doma:fixValue>`).join('');
  return `${XML_PREF}<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="DOMA/DD" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}<doma:content><doma:typeInformation><doma:datatype>${dt}</doma:datatype><doma:length>${len}</doma:length><doma:decimals>${dec}</doma:decimals></doma:typeInformation><doma:outputInformation><doma:length>${olen}</doma:length><doma:style>00</doma:style><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>${def.lowercase ? 'true' : 'false'}</doma:lowercase><doma:ampmFormat>false</doma:ampmFormat></doma:outputInformation><doma:valueInformation><doma:valueTableRef/><doma:appendExists>false</doma:appendExists><doma:fixValues>${fix}</doma:fixValues></doma:valueInformation></doma:content></doma:domain>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'domain', codigo: 'DOMA', adtType: 'DOMA/DD',
  descricao: 'domínio',
  sinonimos: ['dominio', 'dom'],
  coll: '/sap/bc/adt/ddic/domains',
  ct: 'application/vnd.sap.adt.domains.v2+xml',
  source: false,
  forma: 'xml',
  nomeacao: { max: 30, fonte: 'documentação SAP (DDIC); não medido' },
  oQueFaz: 'Domínio do dicionário (DOMA): tipo técnico, tamanho, saída e valores fixos — o que um data element referencia.',
  comoTrata: 'XML puro: create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody). O porquê do PUT sempre está em guardRails.',
  spike: { data: '2026-07-27', sistema: 'DEV', revalidacoes: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: ['PUT do body roda sempre — o create descarta descrição e valores fixos', 'comprimentos zero-padded: 6 dígitos (length/decimals/output), 4 na position dos valores fixos'],
  canais: ['adt', 'classrun', 'soapRfc'],
  origem: ['skill adt-objetos § DOMA/DD — domínio'],
  dependencias: [],
  exemplo: {
    opts: {
      name: 'YJBV_POC_DO_STATUS', pkg: '$TMP', description: 'Status POC',
      def: { dataType: 'CHAR', length: 2, fixValues: [{ low: 'AB', text: 'Aberto' }, { low: 'FE', text: 'Fechado' }] },
    },
    nota: 'Os valores fixos são a parte que o create descarta — o teste deles (DD07L/DD07T) pega a falha silenciosa.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'os valores fixos persistiram? readTable em DD07L (valores) — pega o create-sem-PUT',
      assert: { readTable: { tabela: 'DD07L', campos: ['DOMNAME', 'VALPOS', 'DOMVALUE_L', 'DOMVALUE_H'], where: ["DOMNAME = 'YJBV_POC_DO_STATUS'"] }, espera: '2 linhas: AB e FE' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'driver lê os textos dos valores fixos (DD07T) no idioma da sessão e escreve',
      abap: [
        'CLASS yjbv_poc_cl_do DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_do IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        "    SELECT domvalue_l, ddtext FROM dd07t WHERE domname = 'YJBV_POC_DO_STATUS' AND ddlanguage = @sy-langu",
        '      INTO TABLE @DATA(lt).',
        '    LOOP AT lt INTO DATA(ls). out->write( |DO { ls-domvalue_l }={ ls-ddtext }| ). ENDLOOP.',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'DO AB=Aberto / DO FE=Fechado', espera: 'textos dos valores fixos no idioma da sessão (medido: os textos dos valores fixos chegaram em sy-langu=P)' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'DD01L', campos: ['DOMNAME', 'AS4LOCAL', 'DATATYPE', 'LENG'], where: [`DOMNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, AS4LOCAL = 'A', DATATYPE/LENG do exemplo. Valores fixos: DD07L (ver testes).",
    medido: true,
  }),
  body: buildDomainBody,
};
