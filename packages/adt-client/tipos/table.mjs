// tipos/table.mjs — TABL/DT, tabela transparente. Forma `source`.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'table', codigo: 'TABL', adtType: 'TABL/DT',
  descricao: 'tabela',
  sinonimos: ['tabela', 'tab'],
  coll: '/sap/bc/adt/ddic/tables',
  ct: 'application/vnd.sap.adt.tables.v2+xml',
  source: true,
  forma: 'source',
  nomeacao: { max: 16, fonte: 'medido: 422 ExceptionUnprocessableEntity / AD(102) ao estourar — só a tabela transparente tem esse teto (nome físico no banco); inclui o namespace' },
  oQueFaz: 'Tabela transparente do dicionário ABAP (SE11). A lib cria/altera pelo DDL `define table { … }` e ativa.',
  comoTrata: 'Shell `blue:blueSource type="TABL/DT"` no create → lock → PUT /source/main com o DDL → unlock → activate. Fluxo source-based genérico (deploySource).',
  spike: { data: null, sistema: 'DEV', revalidacoes: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758', '816'] },
  guardRails: [
    'nome ≤ 16 caracteres com namespace (estrutura, DE, classe… aceitam mais — o erro parece incoerente)',
    'palavra reservada em nome de campo falha a ativação com DT(205): IS, DATA, DATE, MESSAGE (confirmados); TABLE, TYPE, VALUE, LINE, KEY, TIME (prováveis)',
    'CURR/QUAN exigem campo de referência (WAERS/MEINS) + @Semantics.amount.currencyCode',
    'deploySource sobrescreve sem avisar: script antigo com DDL velho REVERTE a tabela e derruba as classes dependentes',
  ],
  canais: ['adt', 'classrun', 'soapRfc'],
  origem: ['docs/receita-ciclo-escrita-verificacao.md', 'skill adt-objetos § TABL/DT — tabela'],
  dependencias: [{ tipo: 'dataElement', papel: 'tipos dos campos, quando não são built-in (abap.char…)', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_TB_LOG', pkg: '$TMP', description: 'POC log — ciclo arrange→act→assert',
      source: [
        "@EndUserText.label : 'POC log do agente'",
        '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
        '@AbapCatalog.tableCategory : #TRANSPARENT',
        '@AbapCatalog.deliveryClass : #A',
        '@AbapCatalog.dataMaintenance : #RESTRICTED',
        'define table yjbv_poc_tb_log {',
        '  key mandt : mandt not null;',
        '  key id    : abap.numc(10) not null;',
        '  texto     : abap.char(80);',
        '  datum     : abap.dats;',
        '  uzeit     : abap.tims;',
        '}',
      ].join('\n'),
    },
    nota: 'Objeto da POC do ciclo (S4H 758 e SXD 816, 2026-08-26). Campos ID/TEXTO/DATUM/UZEIT são os medidos; o texto exato do DDL não foi preservado na receita — este é reconstituído.',
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'ARRANGE deploySource da tabela → ACT driver classrun faz INSERT + COMMIT WORK AND WAIT e escreve subrc + chave → ASSERT readTable em OUTRA LUW acha a linha exata',
      abap: [
        'CLASS yjbv_poc_cl_write DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_write IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        "    DATA(ls_linha) = VALUE yjbv_poc_tb_log( mandt = sy-mandt id = '0000000001'",
        "                                            texto = 'escrito pelo agente via classrun' datum = sy-datum uzeit = sy-uzeit ).",
        '    INSERT yjbv_poc_tb_log FROM @ls_linha.',
        '    DATA(lv_subrc) = sy-subrc.',
        '    COMMIT WORK AND WAIT.',
        '    out->write( |WRITE_RESULT subrc={ lv_subrc } id={ ls_linha-id }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'WRITE_RESULT subrc=0 id=<id>', readTable: { tabela: 'YJBV_POC_TB_LOG', where: ["ID = '<id>'"] }, espera: '1 linha com TEXTO/DATUM/UZEIT do driver — em outra requisição/LUW, senão o SELECT veria a linha não comitada' },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 422, contem: 'AD(102)', causa: 'nome da tabela acima de 16 caracteres (com namespace)', correcao: 'encurtar o descritor, nunca o namespace; fechar o nome no desenho — renomear depois cascateia' },
    { contem: 'DT(205)', causa: 'palavra reservada em nome de campo (IS, DATA, DATE, MESSAGE…)', correcao: 'renomear o campo e validar por deploy — o "conserto" também pode ser reservado (DATA → DATE)' },
    { status: 400, contem: 'Kein Sichern wegen Fehler in Quelle', causa: 'erro de sintaxe no DDL (a exceção ExceptionResourceAlreadyExists engana)', correcao: 'ler o corpo inteiro do erro e corrigir o DDL' },
    { contem: 'does not have component', causa: 'a tabela foi REVERTIDA por um deploy com DDL antigo e as classes dependentes quebraram', correcao: 'rodar o script autoritativo (DDL mais recente) e reativar as classes dependentes' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'DD02L', campos: ['TABNAME', 'AS4LOCAL', 'TABCLASS'], where: [`TABNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, AS4LOCAL = 'A' (ativa), TABCLASS = 'TRANSP'. Conteúdo: readTable na própria tabela (medido no ciclo).",
    medido: true,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="TABL/DT" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</blue:blueSource>`;
  },
};
