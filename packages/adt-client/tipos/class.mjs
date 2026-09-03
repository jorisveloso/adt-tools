// tipos/class.mjs — CLAS/OC, classe ABAP (+ includes e classe de teste). Forma `custom`.
//
// Classe + test class são UMA unidade: duas gravações, uma ativação. Ver @abap-test-class.
// O include de teste (CINC / `<CLASSE>…CCAU`) é um OBJETO próprio e **só pode nascer junto com a classe**:
// declarado no body do POST de create. Não existe caminho para acrescentá-lo a uma classe já criada — o PUT
// só ATUALIZA um include existente e responde 500 "Não existem versões inativas …CCAU" quando ele não existe.
// Por isso classe e test class são uma unidade desde a criação. (Provado no $TMP, 2026-07-19.)
import { call } from '../sap-connection.mjs';
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

const COLL = '/sap/bc/adt/oo/classes';

// Declaração do include de teste no body de create da classe — é o que faz o objeto CINC nascer.
const TESTCLASS_INCLUDE = '<class:include class:includeType="testclasses" abapsource:sourceUri="includes/testclasses" adtcore:name="" adtcore:type="CLAS/I"/>';

export function createBody(name, pkg, description) {
  const N = String(name).toUpperCase();
  return `${XML_PREF}<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" class:final="true" class:visibility="public" class:category="generalObjectType" adtcore:name="${N}" adtcore:type="CLAS/OC" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</class:abapClass>`;
}

// Shell com o include de teste declarado — a ÚNICA forma de o CCAU existir.
export function createBodyComTestes(name, pkg, description) {
  return createBody(name, pkg, description)
    .replace('</class:abapClass>', `${TESTCLASS_INCLUDE}</class:abapClass>`)
    .replace('xmlns:adtcore=', 'xmlns:abapsource="http://www.sap.com/adt/abapsource" xmlns:adtcore=');
}

export const includePath = (name, includeType) => `${COLL}/${String(name).toLowerCase()}/includes/${includeType}`;

// Grava um include da classe. `lockHandle` é o lock da CLASSE (o include não trava sozinho).
// includeType: 'definitions' (CCDEF) · 'implementations' (CCIMP) · 'macros' (CCMAC) · 'testclasses' (CCAU).
// Os três primeiros nascem com a classe; `testclasses` só existe se declarado no create (ver acima).
export async function setInclude(session, name, includeType, source, lockHandle, corrNr) {
  let p = `${includePath(name, includeType)}?lockHandle=${lockHandle}`;
  if (corrNr) p += `&corrNr=${corrNr}`;
  const r = await call(session, { method: 'PUT', path: p, accept: 'text/plain', contentType: 'text/plain; charset=utf-8', body: source });
  if (r.status >= 400) throw new Error(`setInclude ${name}/${includeType} falhou (${r.status}): ${r.text.slice(0, 300)}`);
  return r;
}

export const setTestClasses = (session, name, source, lockHandle, corrNr) =>
  setInclude(session, name, 'testclasses', source, lockHandle, corrNr);

const SOURCE_EXEMPLO = [
  'CLASS yjbv_poc_cl_write DEFINITION PUBLIC FINAL CREATE PUBLIC.',
  '  PUBLIC SECTION.',
  '    INTERFACES if_oo_adt_classrun.',
  '    METHODS gravar IMPORTING iv_texto TYPE csequence RETURNING VALUE(rv_id) TYPE numc10.',
  'ENDCLASS.',
  'CLASS yjbv_poc_cl_write IMPLEMENTATION.',
  '  METHOD gravar.',
  '    SELECT MAX( id ) FROM yjbv_poc_tb_log INTO @DATA(lv_max).',
  '    rv_id = lv_max + 1.',
  '    INSERT yjbv_poc_tb_log FROM @( VALUE #( mandt = sy-mandt id = rv_id texto = iv_texto datum = sy-datum uzeit = sy-uzeit ) ).',
  '  ENDMETHOD.',
  '  METHOD if_oo_adt_classrun~main.',
  "    DATA(lv_id) = gravar( 'escrito pelo agente via classrun' ).",
  '    COMMIT WORK AND WAIT.',
  '    out->write( |WRITE_RESULT subrc={ sy-subrc } id={ lv_id }| ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

const TEST_EXEMPLO = [
  '*"* use this source file for your ABAP unit test classes',
  'CLASS ltc_yjbv_poc_cl_write DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
  '  PRIVATE SECTION.',
  '    METHODS gravar_devolve_id FOR TESTING RAISING cx_static_check.',
  'ENDCLASS.',
  'CLASS ltc_yjbv_poc_cl_write IMPLEMENTATION.',
  '  METHOD gravar_devolve_id.',
  '    DATA(lo) = NEW yjbv_poc_cl_write( ).',
  "    DATA(lv_id) = lo->gravar( 'unit' ).",
  '    ROLLBACK WORK.',
  '    cl_abap_unit_assert=>assert_differs( act = lv_id exp = 0 ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'class', codigo: 'CLAS', adtType: 'CLAS/OC',
  descricao: 'classe',
  sinonimos: ['classe', 'cl'],
  coll: COLL,
  ct: 'application/vnd.sap.adt.oo.classes.v4+xml',
  source: true,
  forma: 'custom',
  nomeacao: { max: 30, fonte: 'documentação SAP (nome de objeto OO); não medido' },
  oQueFaz: 'Classe ABAP OO global (CLAS), com os includes locais (definitions/implementations/macros) e a classe de teste ABAP Unit. É o driver dos canais classrun e do BDC dirigido pelo agente.',
  comoTrata: 'create com o include de teste DECLARADO no shell (o CCAU só nasce junto) → lock → PUT dos includes locais (definitions antes do main) → PUT /source/main → PUT testclasses → unlock → activate. `deploySource` continua servindo para classe sem testes.',
  spike: { data: '2026-07-19', sistema: 'DEV', revalidacoes: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758', '816'] },
  guardRails: [
    'o include testclasses (CCAU) só nasce declarado no create — não dá para acrescentar depois (PUT responde 500 "Não existem versões inativas")',
    'PUT de include exige Content-Type text/plain; charset=utf-8',
    'ordem: definitions → implementations → macros → main → testclasses, todos com o lockHandle da CLASSE',
    'ABAP que só falha na ATIVAÇÃO: RETURNING com tipo de tabela genérico; CHANGING com resultado de método; constante CHAR de tamanho ≠ do parâmetro; método dentro de Open SQL',
    'classrun: executar em sessão NOVA depois do deploy (deployAndRun já faz — ver desmentidos)',
  ],
  canais: ['adt', 'classrun', 'aunit'],
  origem: ['docs/canal-classrun.md', 'docs/receita-ciclo-escrita-verificacao.md', 'docs/receita-e2e-classe-entregue.md', 'skill adt-objetos § CLAS/OC — classe (e o include de teste)'],
  dependencias: [{ tipo: 'interface', papel: 'interfaces implementadas (opcional) — criar ANTES da classe', ativarJunto: false }, { tipo: 'table', papel: 'tabelas que a classe usa (opcional)', ativarJunto: false }],
  exemplo: {
    opts: { name: 'YJBV_POC_CL_WRITE', pkg: '$TMP', description: 'POC driver de escrita', source: SOURCE_EXEMPLO, testSource: TEST_EXEMPLO },
    nota: 'YJBV_POC_CL_WRITE é o driver da POC do ciclo (S4H 758 + SXD 816, 2026-08-26). O source aqui é reconstituído da receita (INSERT + COMMIT WORK AND WAIT + WRITE_RESULT); o teste ABAP Unit é ilustrativo.',
  },
  testes: [
    {
      canal: 'aunit',
      descricao: 'runUnitTestsWithCoverage: a classe de teste (include testclasses) roda pelo ADT; executed=0 NUNCA é sucesso',
      abap: TEST_EXEMPLO,
      assert: { unit: 'executed > 0 && failed === 0; statement coverage ≥ threshold', espera: 'testes verdes com cobertura medida (2026-08-28: executed=1, failed=0, statement=50%)' },
      medido: [{ data: '2026-07-19', sistema: 'DEV' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'a própria classe implementa if_oo_adt_classrun: deployAndRun executa em sessão nova e lê WRITE_RESULT; assert por readTable em outra LUW',
      abap: SOURCE_EXEMPLO,
      assert: { console: 'WRITE_RESULT subrc=0 id=<id>', readTable: { tabela: 'YJBV_POC_TB_LOG', where: ["ID = '<id>'"] }, espera: 'linha gravada, vista de outra LUW' },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 500, contem: 'CCAU', causa: 'PUT em includes/testclasses de uma classe que nasceu SEM o include declarado — o PUT só atualiza', correcao: 'não há caminho REST: deletar e recriar com deployClassWithTests (include declarado no create)' },
    { status: 404, contem: 'testclasses', causa: 'a classe existe sem o include de teste', correcao: 'idem — recriar com o include declarado' },
    { contem: 'does not implement if_oo_adt_classrun', causa: 'classrun rodando o load ANTIGO, preso à sessão do deploy (ou a classe não implementa a interface)', correcao: 'executar em sessão nova (deployAndRun / runClass novaSessao); conferir INTERFACES if_oo_adt_classrun' },
    { contem: 'must be separated using commas', causa: 'chamada de método dentro de Open SQL fora do modo estrito', correcao: 'pré-calcular numa variável' },
  ],
  desmentidos: [
    {
      crenca: 'o 500 ao gravar o include testclasses é problema de charset, ou de ordem de ativação',
      fato: 'nem um nem outro (as duas hipóteses custaram 7 tentativas). A causa é o <class:include> de testclasses FALTANDO no create — a classe já existia sem ele, e o PUT só atualiza include que existe. Não há caminho REST para acrescentá-lo depois.',
      medido: { data: '2026-07-19', sistema: 'DEV' },
    },
    {
      crenca: 'depois do activate, o classrun executa o código novo — é só esperar/repetir',
      fato: 'o load antigo fica preso à sessão STATEFUL que fez o deploy: 5 retries de 3s na mesma sessão não convergiram; uma sessão NOVA executou o load novo de primeira. Não é questão de tempo.',
      medido: { data: '2026-08-26', sistema: 'S4H', release: '758' },
    },
  ],
  prova: (name) => ({
    tabela: 'SEOCLASS', campos: ['CLSNAME', 'CLSTYPE'], where: [`CLSNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, CLSTYPE = '0' (classe). Estado ativo: getObject → adtcore:version=\"active\". Comportamento: aunit / classrun.",
    medido: false,
  }),
  createBody,

  // `includes` = { definitions, implementations, macros } opcionais (classes locais auxiliares).
  async deploy(ctx, conexao, { name, source, testSource, includes = {}, pkg = '$TMP', description = '', corrNr }) {
    const s = await conexao.sessao();
    const existing = await ctx.getObject(s, 'class', name);
    if (!existing.exists) {
      await ctx.createShell(s, 'class', name, { pkg, description, corrNr, body: createBodyComTestes(name, pkg, description) });
    }
    const h = await ctx.lock(s, 'class', name);
    try {
      // definitions ANTES do main: a classe global enxerga as classes locais declaradas ali.
      for (const t of ['definitions', 'implementations', 'macros'])
        if (includes[t]) await setInclude(s, name, t, includes[t], h, corrNr);
      await ctx.setSource(s, 'class', name, source, h, corrNr);
      if (testSource) await setTestClasses(s, name, testSource, h, corrNr);
    } finally { await ctx.unlock(s, 'class', name, h); }
    const act = await ctx.activate(conexao, 'class', name);
    return { created: !existing.exists, activated: act.ok, tests: !!testSource, activate: act };
  },
};
