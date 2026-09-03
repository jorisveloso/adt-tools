// tipos/behaviorDefinition.mjs — BDEF/BDO, behavior definition RAP. Forma `source`. (SPIKE 2026-07-27, POC validada no $TMP)
// Formato "blues" (media type descoberto via /sap/bc/adt/discovery): shell <blue:blueSource type="BDEF/BDO">
// + PUT /source/main com o DSL de behavior. Ativa JUNTO da behavior pool class (CLASS ... FOR BEHAVIOR OF
// <root>); managed non-strict ativa com pool vazia. `strict(2)` exige authorization master (→ métodos na pool).
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'behaviorDefinition', codigo: 'BDEF', adtType: 'BDEF/BDO',
  descricao: 'behavior definition',
  sinonimos: ['behavior definition', 'behavior', 'comportamento'],
  coll: '/sap/bc/adt/bo/behaviordefinitions',
  ct: 'application/vnd.sap.adt.blues.v1+xml',
  source: true,
  forma: 'source',
  oQueFaz: 'Behavior definition RAP (BDEF): o DSL `managed implementation in class … define behavior for …` que torna uma CDS transacional.',
  comoTrata: 'Shell `blue:blueSource type="BDEF/BDO"` (formato blues) → lock → PUT /source/main com o DSL → unlock → activate (deploySource). Ativa junto da behavior pool class.',
  spike: { data: '2026-07-27', sistema: 'DEV', revalidacoes: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'o nome do BDEF É o nome da root view entity (DDLS e BDEF coexistem com o mesmo nome)',
    'ativa junto da behavior pool class (CLASS … FOR BEHAVIOR OF) — na mesma requisição (activateMany); managed non-strict ativa com pool vazia',
    'strict(2) exige authorization master em toda entidade; com ( global ) o método de autorização tem de CONCEDER, vazio dumpa UNCAUGHT_EXCEPTION',
    'chave gravável no create precisa de field ( readonly : update ) — com readonly puro o create grava 0',
  ],
  canais: ['adt', 'classrun', 'odata'],
  origem: ['skill adt-objetos § BDEF/BDO — behavior definition', 'skill adt-objetos § RAP — a cadeia inteira'],
  dependencias: [
    { tipo: 'cds', papel: 'root view entity com o MESMO nome do BDEF', ativarJunto: false },
    { tipo: 'class', papel: 'behavior pool (CLASS … FOR BEHAVIOR OF <root>) — BDEF sozinho não ativa, pool sozinha não ativa', ativarJunto: true },
  ],
  exemplo: {
    opts: {
      name: 'YJBV_POC_BO_ROOT', pkg: '$TMP', description: 'POC behavior managed',
      source: [
        'managed implementation in class ybp_jbv_poc_bo_root unique;',
        'define behavior for YJBV_POC_BO_ROOT alias Root',
        '  persistent table yjbv_poc_tb_log',
        '  lock master',
        '{',
        '  create; update; delete;',
        '  field ( readonly : update ) Id;',
        '}',
      ].join('\n'),
    },
    nota: 'Nome = nome da root view entity (regra medida). Managed não-estrito ativa com pool vazia (aviso "should be flagged as strict"); `strict(2)` exigiria authorization master. Com nomes de campo diferentes da tabela, `mapping for <tabela> { … }` é obrigatório. BDEF e pool são UMA unidade de ativação — deployMany medido 2026-08-28 S4H 758 (uma ativação, EML create+commit, linha vista em outra LUW): use deployMany(conexao, [{ type: "behaviorDefinition", name, source, dependeDe: ["class:YBP_JBV_POC_BO_ROOT"] }, { type: "class", name: "YBP_JBV_POC_BO_ROOT", source: "CLASS ybp_jbv_poc_bo_root DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF yjbv_poc_bo_root. ENDCLASS. CLASS ybp_jbv_poc_bo_root IMPLEMENTATION. ENDCLASS." }]).',
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'driver com EML: MODIFY ENTITIES … CREATE + COMMIT ENTITIES, depois READ; prova BDEF + pool ativos e o BO respondendo — o assert de persistência é readTable na tabela persistente, em outra LUW',
      abap: [
        'CLASS yjbv_poc_cl_bo DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_bo IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    MODIFY ENTITIES OF yjbv_poc_bo_root',
        "      ENTITY Root CREATE FIELDS ( Id Texto ) WITH VALUE #( ( %cid = 'c1' Id = '0000000002' Texto = 'via EML' ) )",
        '      MAPPED DATA(mapped) FAILED DATA(failed) REPORTED DATA(reported).',
        '    COMMIT ENTITIES RESPONSE OF yjbv_poc_bo_root FAILED DATA(cf) REPORTED DATA(cr).',
        '    out->write( |EML failed={ lines( failed-root ) } commit_failed={ lines( cf-root ) }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'EML failed=0 commit_failed=0', readTable: { tabela: 'YJBV_POC_TB_LOG', where: ["ID = '0000000002'"] }, espera: '1 linha na tabela persistente, em outra LUW' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 415, causa: 'media type específico (vnd.sap.adt.behaviordefinitions.*)', correcao: 'usar o genérico blues.v1+xml' },
    { contem: 'There is no behavior definition for', causa: 'o BDEF tem nome diferente da root view entity', correcao: 'o BDEF se chama exatamente como a root view' },
    { contem: 'Type', causa: 'BDEF ativado sozinho (falta a pool) ou pool sozinha (falta o BDEF)', correcao: 'activateMany([bdef, classe pool]) na mesma requisição' },
    { contem: 'UNCAUGHT_EXCEPTION', causa: 'authorization master ( global ) com método de autorização vazio', correcao: 'conceder: result-%create/%update/%delete = if_abap_behv=>auth-allowed; ou usar ( instance )' },
    { contem: 'use create', causa: 'BDEF de projeção: dentro de use association escreve-se create;, não use create;', correcao: 'trocar por create;' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'BDEF'", `OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (existe). Estado ativo: getObject → adtcore:version="active". Comportamento: EML no driver + readTable na tabela persistente.',
    medido: false,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="BDEF/BDO" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</blue:blueSource>`;
  },
};
