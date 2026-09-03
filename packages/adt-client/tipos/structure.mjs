// tipos/structure.mjs — TABL/DS, estrutura. Forma `source`. (SPIKE 2026-07-27, POC validada no $TMP)
// Source-based IGUAL tabela: shell <blue:blueSource type="TABL/DS"> + PUT /source/main com DDL
// `define structure { campo : tipo; }`. Mesmo código TADIR da tabela (TABL), coleção e subtipo próprios.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'structure', codigo: 'TABL', adtType: 'TABL/DS',
  descricao: 'estrutura',
  sinonimos: ['estrutura', 'struct'],
  coll: '/sap/bc/adt/ddic/structures',
  ct: 'application/vnd.sap.adt.structures.v2+xml',
  source: true,
  forma: 'source',
  nomeacao: { max: 30, fonte: 'documentação SAP (DDIC); não medido — estrutura de 21 caracteres passou no mesmo deploy em que a tabela de 19 foi recusada' },
  oQueFaz: 'Estrutura do dicionário ABAP (TABL/DS) — tipo de linha sem tabela de banco. A lib cria/altera pelo DDL `define structure { … }`.',
  comoTrata: 'Mesmo shell `blue:blueSource` da tabela, com type="TABL/DS"; create → lock → PUT /source/main → unlock → activate (deploySource).',
  spike: { data: '2026-07-27', sistema: 'DEV', revalidacoes: [{ data: '2026-08-27', sistema: 'DEV' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    '@AbapCatalog.enhancement.category é OBRIGATÓRIA no DDL — sem ela o PUT dá 400 enganoso (ExceptionResourceAlreadyExists = erro de sintaxe)',
    'comentário // dentro do define structure derruba o PUT com o mesmo 400 (o editor blue source não aceita; o de CDS aceita)',
  ],
  canais: ['adt', 'classrun'],
  origem: ['skill adt-objetos § TABL/DS — estrutura'],
  dependencias: [{ tipo: 'dataElement', papel: 'tipos dos campos, quando não são built-in', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_ST_LINHA', pkg: '$TMP', description: 'POC estrutura',
      source: [
        "@EndUserText.label : 'POC estrutura'",
        '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
        'define structure yjbv_poc_st_linha {',
        '  id    : abap.numc(10);',
        '  texto : abap.char(80);',
        '}',
      ].join('\n'),
    },
    nota: 'Nome e DDL ilustrativos no padrão da POC; a anotação obrigatória e a ausência de // são os pontos medidos.',
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'driver declara uma variável do tipo da estrutura (prova ativação em compile) e escreve os componentes',
      abap: [
        'CLASS yjbv_poc_cl_st DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_st IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        "    DATA(ls) = VALUE yjbv_poc_st_linha( id = '0000000001' texto = 'estrutura ativa' ).",
        '    out->write( |ST id={ ls-id } texto={ ls-texto }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'ST id=0000000001 texto=estrutura ativa', espera: 'driver ativa (a estrutura existe e está ativa) e escreve os componentes' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 400, contem: 'ExceptionResourceAlreadyExists', causa: 'NÃO é objeto duplicado: erro de sintaxe no DDL — falta @AbapCatalog.enhancement.category ou há comentário // no corpo', correcao: 'acrescentar a anotação; remover os //; ler "Kein Sichern wegen Fehler in Quelle" no corpo' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'DD02L', campos: ['TABNAME', 'AS4LOCAL', 'TABCLASS'], where: [`TABNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, AS4LOCAL = 'A', TABCLASS = 'INTTAB' (estrutura)",
    medido: true,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="TABL/DS" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</blue:blueSource>`;
  },
};
