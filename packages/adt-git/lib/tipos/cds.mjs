// tipos/cds.mjs — DDLS/DF, CDS view (DDL source). Forma `source`.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'cds', codigo: 'DDLS', adtType: 'DDLS/DF',
  descricao: 'CDS view',
  sinonimos: ['cds view', 'view cds', 'ddl'],
  coll: '/sap/bc/adt/ddic/ddl/sources',
  ct: 'application/vnd.sap.adt.ddlSource+xml',
  source: true,
  forma: 'source',
  nomeacao: { max: 30, fonte: 'documentação SAP (nome de DDLS); não medido' },
  oQueFaz: 'CDS view entity / DDL source (DDLS). A lib cria/altera o DDL completo (`define view entity …`) e ativa; é a base das superfícies RAP (SRVD → SRVB).',
  comoTrata: 'Shell `ddl:ddlSource type="DDLS/DF"` → lock → PUT /source/main com o DDL → unlock → activate (deploySource).',
  spike: { data: null, sistema: 'DEV', revalidacoes: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'media type SEM versão: ddlSource.v1+xml dá 415',
    'define view entity não leva sqlViewName (isso é da sintaxe antiga define view)',
    'as projection on solto não ativa: crie o BDEF primeiro; read-only expõe a interface view direto na SRVD',
    'para OData V4 (A2X): sem conversion exit nos campos (cast para abap.char), chave não pode ser só o mandante, CHAR1 "flag" não-booleano estoura a serialização',
  ],
  canais: ['adt', 'classrun', 'odata'],
  origem: ['skill adt-objetos § DDLS/DF — CDS view', 'docs/receita-wdi5-fiori.md (superfície YJBV_POC_WDI5_*)', 'docs/fila.md item 6'],
  dependencias: [{ tipo: 'table', papel: 'fonte do select (tabela ou outra CDS)', ativarJunto: false }, { tipo: 'behaviorDefinition', papel: 'só para projeção transacional (as projection on) — o BDEF vem ANTES', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_WDI5_C', pkg: '$TMP', description: 'POC CDS read-only sobre DD02L',
      source: [
        '@AccessControl.authorizationCheck: #NOT_REQUIRED',
        "@EndUserText.label: 'POC tabelas do dicionário'",
        'define view entity YJBV_POC_WDI5_C as select from dd02l {',
        '  key tabname  as TableName,',
        '      tabclass as TableClass,',
        '      as4local as Status',
        '}',
      ].join('\n'),
    },
    nota: 'Reconstituído do spike wdi5 (S4H 758, 2026-08-26): CDS read-only sobre DD02L, exposta por SRVD + SRVB categoria 0. Os sufixos exatos YJBV_POC_WDI5_* não foram preservados na receita. Sem `key mandt` e sem CHAR1 flag: os dois quebram o modelo V4 (medido).',
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'driver faz SELECT na view (prova ativação e leitura) e escreve a contagem',
      abap: [
        'CLASS yjbv_poc_cl_cds DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_cds IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    SELECT FROM yjbv_poc_wdi5_c FIELDS TableName INTO TABLE @DATA(lt) UP TO 5 ROWS.',
        '    out->write( |CDS rows={ lines( lt ) }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'CDS rows=<n>', espera: 'o driver ativa contra a view (existe, está ativa) e o SELECT roda — medido com root view entity sobre tabela $TMP vazia: rows=0' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'odata',
      descricao: 'pela SRVB publicada: GET $metadata (200, entidade presente) e GET da entidade (linhas) — foi assim que o spike wdi5 provou a CDS',
      assert: { http: 'GET <odataV4RuntimeUrl>/$metadata → 200; GET <entidade>?$top=3 → 3 linhas', espera: 'entidade no $metadata e linhas no OData V4' },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 415, causa: 'media type com versão (ddlSource.v1+xml)', correcao: 'usar application/vnd.sap.adt.ddlSource+xml (sem versão)' },
    { contem: 'Transactional projection view must be part of a Business Object', causa: '`as projection on` sem BDEF', correcao: 'criar o BDEF da root primeiro; para read-only, expor a interface view direto na SRVD' },
    { contem: 'ROOT keyword missing', causa: 'interface é root view entity mas a projeção não', correcao: 'define root view entity na projeção também' },
    { contem: 'CX_SADL_GW_V4_MODEL_EXCEPTION', causa: 'campo com conversion exit (MATNR→MATN1, BELNR_D→ALPHA…) dumpa a geração do modelo V4', correcao: 'cast( campo as abap.char(n) ) na interface view — só para CHAR (UNIT/QUAN/CURR não podem)' },
    { status: 500, contem: 'Metadata_Error', causa: 'a única chave da view é o mandante — o runtime A2X remove o campo cliente e a entidade fica sem chave', correcao: 'usar fonte com chave de verdade (medido 2026-08-26)' },
    { contem: 'CX_PARAMETER_INVALID_RANGE', causa: 'CHAR1 mapeado como Edm.Boolean e uma linha tem valor fora de X/vazio', correcao: 'não expor CHAR1 flag não-booleano, ou fazer cast (medido 2026-08-26)' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'DDLS'", `OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (existe no diretório de objetos). Estado ativo: getObject → adtcore:version="active". Dados: SELECT no driver ou OData.',
    medido: false,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<ddl:ddlSource xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="DDLS/DF" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</ddl:ddlSource>`;
  },
};
