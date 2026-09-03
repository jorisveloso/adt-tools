// tipos/functionModule.mjs — FUGR/FF, function module (RFC). Forma `custom`, tipo ANINHADO no FUGR.
// (SPIKE 2026-08-26, POC no $TMP)
//
// POR QUE ISTO EXISTE: é o canal de ESCRITA para sistemas SEM classrun (basis < 7.52). Um FM
// remote-enabled criado aqui vira chamável por `rfc-soap.callFunction` — HTTP puro, sem SDK. O caso
// que motivou: wrapper de BDC (CALL TRANSACTION) dirigido pelo agente onde o classrun não existe.
//
// O path do FM é ANINHADO (`/functions/groups/<fg>/fmodules/<fm>`), então NÃO usa coll/<name>:
// `path(name, { group })` é obrigatório, e `objPath`/`lock`/`getObject` genéricos passam por ele.
// Três gotchas, todos de FALHA SILENCIOSA (receita 2026-07-30 + medição 2026-08-26):
//   1. RFC não é o `processingType` do create shell — o POST grava "normal" e DESCARTA o "rfc" (fica
//      FMODE vazio na TFDIR, e a chamada SOAP dá 500 "kernel rc=9", o MESMO erro de FM não-RFC).
//      Só um PUT do METADATA com lock (antes do PUT do source) persiste o RFC. Igual ao DE/domínio.
//   2. Assinatura source-based SEM ponto após o nome: `FUNCTION nome` seguido de IMPORTING/EXPORTING/
//      TABLES e o ponto só depois do ÚLTIMO parâmetro. Com `FUNCTION nome.` os params não registram
//      (só quebra em runtime: CX_SY_DYN_CALL_PARAM_NOT_FOUND). Parâmetro TABLES usa `LIKE <estrut>`.
//      Um `STRUCTURE bdcdata` no PUT dá 400 "deklariert keinen Typen".
//   3. Ativar pela URI do FM, não do FUGR (FUGR → activationExecuted="false", no-op silencioso).
import { call } from '../sap-connection.mjs';
import { XML_PREF, esc } from './_xml.mjs';
import functionGroup from './functionGroup.mjs';

const CT = 'application/vnd.sap.adt.functions.fmodules.v3+xml';
const fugrPath = (fg) => `${functionGroup.coll}/${String(fg).toLowerCase()}`;

// Metadata do FM — é o body do create E do PUT que persiste o processingType (gotcha 1).
export function buildFunctionModuleBody(name, group, description, { rfc = true } = {}) {
  const N = String(name).toUpperCase(), G = String(group).toUpperCase();
  const processingType = rfc ? 'rfc' : 'normal';
  return XML_PREF
    + `<fmodule:abapFunctionModule xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core" fmodule:processingType="${processingType}" adtcore:name="${N}" adtcore:type="FUGR/FF" adtcore:description="${esc(description)}"><adtcore:containerRef adtcore:uri="${fugrPath(group)}" adtcore:type="FUGR/F" adtcore:name="${G}"/></fmodule:abapFunctionModule>`;
}

// O source do wrapper de BDC validado na POC — o mesmo que `buildBdcWrapperSource` (adt-client.mjs) gera.
const SOURCE_EXEMPLO = `FUNCTION yjbv_poc_fm_bdc
  IMPORTING
    VALUE(iv_tcode) TYPE tcode
    VALUE(iv_mode) TYPE char1 DEFAULT 'N'
  EXPORTING
    VALUE(ev_subrc) TYPE sysubrc
  TABLES
    it_bdcdata LIKE bdcdata
    et_msgs LIKE bdcmsgcoll.

  CALL TRANSACTION iv_tcode WITH AUTHORITY-CHECK
       USING it_bdcdata[] MODE iv_mode UPDATE 'S'
       MESSAGES INTO et_msgs[].
  ev_subrc = sy-subrc.

ENDFUNCTION.`;

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'functionModule', codigo: 'FUGR', adtType: 'FUGR/FF',
  descricao: 'function module',
  sinonimos: ['function module', 'modulo de funcao', 'funcao', 'funcoes', 'fm'],
  coll: functionGroup.coll,
  ct: CT,
  source: true,
  forma: 'custom',
  container: { libKey: 'functionGroup', param: 'group' },
  nomeacao: { max: 30, fonte: 'documentação SAP (FUNCNAME); não medido' },
  oQueFaz: 'Function module (FUGR/FF), em especial remote-enabled (RFC): a porta de escrita por SOAP RFC em sistemas sem classrun — wrapper de BDC, chamada de BAPI + COMMIT na mesma LUW.',
  comoTrata: 'Cria o FUGR se faltar → POST do metadata em groups/<fg>/fmodules se o FM não existe → lock por path → PUT metadata (persiste RFC) → PUT /source/main → unlock → activate pela URI do FM (lança se hasError).',
  spike: { data: '2026-08-26', sistema: 'S4H', release: '758', revalidacoes: [{ data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758', '816'] },
  guardRails: [
    'exige { group } — o path é aninhado (groups/<fg>/fmodules/<fm>); coll/<name> não existe (deleteObject também recebe { group })',
    'RFC só persiste com PUT do metadata (com lock) ANTES do PUT do source — o create descarta processingType="rfc"',
    'assinatura sem ponto após o nome: `FUNCTION nome` … ponto só depois do último parâmetro; TABLES com LIKE',
    'ativar pela URI do FM, não do FUGR (FUGR → no-op silencioso)',
    'não é source-based para deploySource (forma custom) — use deploy(conexao, "functionModule", …) / deployFunctionModule',
    'antes de chamar uma FM padrão, conferir a interface na FUPARAREF (obrigatório = OPTIONAL e DEFAULTVAL em branco) — faltar dumpa CALL_FUNCTION_PARM_MISSING em runtime',
  ],
  canais: ['adt', 'soapRfc', 'aunit'],
  origem: ['docs/receita-fm-rfc-wrapper.md', 'docs/canal-soap-rfc.md', 'skill adt-objetos § FUGR/FF — function module (RFC)'],
  dependencias: [{ tipo: 'functionGroup', papel: 'contêiner (criado pelo deploy se faltar)', ativarJunto: false }],
  exemplo: {
    opts: { group: 'YJBV_POC_FG', name: 'YJBV_POC_FM_BDC', pkg: '$TMP', description: 'wrapper BDC', source: SOURCE_EXEMPLO, rfc: true },
    nota: 'Wrapper de BDC da POC (S4H 758 + SXD 816, 2026-08-26): igual a buildBdcWrapperSource("YJBV_POC_FM_BDC").',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o RFC persistiu? readTable TFDIR: FMODE = R — é o assert do gotcha 1 (create descarta o rfc)',
      assert: { readTable: { tabela: 'TFDIR', campos: ['FUNCNAME', 'FMODE'], where: ["FUNCNAME = 'YJBV_POC_FM_BDC'"] }, espera: "FMODE = 'R'" },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'soapRfc',
      descricao: 'callFunction por SOAP RFC com BDC de VA03 e documento inexistente: prova que o FM é chamável remoto e que a transação rodou (mensagem de negócio de volta)',
      assert: { callFunction: { fm: 'YJBV_POC_FM_BDC', params: { IV_TCODE: 'VA03', IV_MODE: 'N', IT_BDCDATA: [{ PROGRAM: 'SAPMV45A', DYNPRO: '0102', DYNBEGIN: 'X' }, { FNAM: 'VBAK-VBELN', FVAL: '9999999999' }, { FNAM: 'BDC_OKCODE', FVAL: '/00' }], ET_MSGS: [] } }, espera: "EV_SUBRC = '1001'; ET_MSGS com MSGTYP E, MSGID V1, MSGNR 302" },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'aunit',
      descricao: 'validar sem executar a transação: classe de teste com CALL FUNCTION local prova ativação + assinatura + parâmetros, sem efeito colateral',
      abap: [
        'CLASS ltc_yjbv_poc_fm_bdc DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
        '  PRIVATE SECTION. METHODS assinatura FOR TESTING RAISING cx_static_check.',
        'ENDCLASS.',
        'CLASS ltc_yjbv_poc_fm_bdc IMPLEMENTATION.',
        '  METHOD assinatura.',
        '    DATA lt_bdc TYPE STANDARD TABLE OF bdcdata. DATA lt_msg TYPE STANDARD TABLE OF bdcmsgcoll. DATA lv_subrc TYPE sysubrc.',
        "    CALL FUNCTION 'YJBV_POC_FM_BDC' EXPORTING iv_tcode = 'SESSION_MANAGER' iv_mode = 'N'",
        '      IMPORTING ev_subrc = lv_subrc TABLES it_bdcdata = lt_bdc et_msgs = lt_msg.',
        "    \" SESSION_MANAGER com BDCDATA vazio devolve subrc 0 (medido): o que se prova é que a chamada resolve a assinatura",
        '    cl_abap_unit_assert=>assert_equals( act = lv_subrc exp = 0 ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { unit: 'executed = 1, failed = 0 (CALL FUNCTION resolve os parâmetros — se a assinatura tiver o ponto errado, CX_SY_DYN_CALL_PARAM_NOT_FOUND)', espera: 'teste verde' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 500, contem: 'kernel rc=9', causa: 'o FM não é RFC (FMODE vazio): o create descartou processingType="rfc"', correcao: 'PUT do metadata com lock antes do source (o deploy do módulo já faz); confirmar TFDIR.FMODE = R' },
    { status: 400, contem: 'ExceptionInvalidData', causa: 'processingType inválido no create (ex.: "remoteEnabled")', correcao: 'usar "rfc" ou "normal"' },
    { status: 400, contem: 'deklariert keinen Typen', causa: 'parâmetro TABLES declarado com STRUCTURE', correcao: 'declarar com LIKE <estrutura>' },
    { contem: 'CX_SY_DYN_CALL_PARAM_NOT_FOUND', causa: 'assinatura com ponto logo após o nome (FUNCTION nome.) — os parâmetros não registraram', correcao: 'FUNCTION nome (sem ponto) … ponto só depois do último parâmetro' },
    { status: 403, contem: 'já está processando', causa: 'lock preso de um create/PUT que morreu antes do unlock', correcao: 'liberar por classrun com ENQUEUE_READ + ENQUE_DELETE locais (ENQUE_DELETE não é RFC), ou SM12' },
    { contem: 'CALL_FUNCTION_PARM_MISSING', causa: 'parâmetro obrigatório não informado na chamada', correcao: 'conferir FUPARAREF (OPTIONAL e DEFAULTVAL em branco = obrigatório)' },
    { contem: 'activationExecuted="false"', causa: 'ativação referenciando o FUGR', correcao: 'ativar pela URI do FM (o módulo já faz)' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TFDIR', campos: ['FUNCNAME', 'FMODE', 'PNAME'], where: [`FUNCNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha; FMODE = 'R' quando rfc: true (é o assert que pega o create-sem-PUT-de-metadata)",
    medido: true,
  }),
  validar({ group }) {
    if (!group) throw new Error('functionModule exige { group } — o path é aninhado (groups/<fg>/fmodules/<fm>)');
  },
  path(name, { group } = {}) {
    if (!group) throw new Error('functionModule: informe { group } — o path é aninhado (groups/<fg>/fmodules/<fm>)');
    return `${fugrPath(group)}/fmodules/${String(name).toLowerCase()}`;
  },
  body: (name, _pkg, description, def = {}) => buildFunctionModuleBody(name, def.group, description, def),

  // Cria/atualiza um function module RFC dentro do grupo e ativa. `source` é o corpo ABAP COMPLETO,
  // incluindo a linha de assinatura `FUNCTION <nome> IMPORTING … .` (ver gotcha 2). `rfc:false` cria
  // um FM local (processingType "normal"). Cria o FUGR antes se ele faltar. Idempotente. Nunca deleta.
  async deploy(ctx, conexao, { group, name, source, rfc = true, pkg = '$TMP', description = '', corrNr }) {
    ctx.assertZY(group);
    await ctx.deploy(conexao, 'functionGroup', { name: group, pkg, description, corrNr });
    const s = await conexao.sessao();
    const N = String(name).toUpperCase();
    const fmPath = ctx.objPath('functionModule', name, { group });
    const metaBody = buildFunctionModuleBody(name, group, description, { rfc });

    const existing = await call(s, { path: fmPath, accept: 'application/*' });
    if (existing.status === 404) {
      const p = `${fugrPath(group)}/fmodules` + (corrNr ? `?corrNr=${corrNr}` : '');
      const r = await call(s, { method: 'POST', path: p, accept: 'application/*', contentType: CT, body: metaBody });
      if (r.status !== 200 && r.status !== 201) throw new Error(`create FM ${N} falhou (${r.status}): ${r.text.slice(0, 300)}`);
    }
    await ctx.withLockPath(s, fmPath, async (h) => {
      // METADATA primeiro — é o PUT que persiste processingType="rfc" (o create o descarta). Gotcha 1.
      let pm = `${fmPath}?lockHandle=${h}`; if (corrNr) pm += `&corrNr=${corrNr}`;
      const rm = await call(s, { method: 'PUT', path: pm, accept: 'application/*', contentType: CT, body: metaBody });
      if (rm.status >= 400) throw new Error(`PUT metadata FM ${N} falhou (${rm.status}): ${rm.text.slice(0, 300)}`);
      let ps = `${fmPath}/source/main?lockHandle=${h}`; if (corrNr) ps += `&corrNr=${corrNr}`;
      const rs = await call(s, { method: 'PUT', path: ps, accept: 'text/plain', contentType: 'text/plain; charset=utf-8', body: source });
      if (rs.status >= 400) throw new Error(`PUT source FM ${N} falhou (${rs.status}): ${rs.text.slice(0, 300)}`);
    });

    // Ativa pela URI do FM (gotcha 3) — `activate` com { group } monta a referência pelo path aninhado.
    // `activateMany` já checa hasError; aqui a ativação com erro LANÇA (comportamento medido).
    const act = await ctx.activate(conexao, 'functionModule', name, { group });
    if (act.hasError) throw new Error(`ativação de ${N} falhou: ${act.messages.map((m) => m.text).join(' · ')}`);
    return { created: existing.status === 404, activated: act.ok, rfc, activate: act };
  },
};
