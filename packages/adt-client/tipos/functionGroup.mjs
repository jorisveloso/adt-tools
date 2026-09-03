// tipos/functionGroup.mjs — FUGR/F, grupo de funções. Forma `custom`. (SPIKE 2026-08-26, POC no $TMP)
// Contêiner do FM. Media type do create: functions.groups.v3+xml. Existência sondada por status 200
// (não por getObject), POST cru com Accept application/*, SEM ativação — é assim que foi medido.
import { call } from '../sap-connection.mjs';
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

const COLL = '/sap/bc/adt/functions/groups';
const CT = 'application/vnd.sap.adt.functions.groups.v3+xml';

export function createBody(name, pkg, description) {
  const N = String(name).toUpperCase();
  return XML_PREF
    + `<group:abapFunctionGroup xmlns:group="http://www.sap.com/adt/functions/groups" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="FUGR/F" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</group:abapFunctionGroup>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'functionGroup', codigo: 'FUGR', adtType: 'FUGR/F',
  descricao: 'grupo de funções',
  sinonimos: ['grupo de funcoes', 'grupo de funcao', 'function group', 'fg'],
  coll: COLL,
  ct: CT,
  source: false,
  forma: 'custom',
  nomeacao: { max: 26, fonte: 'documentação SAP (nome de grupo de funções); não medido' },
  oQueFaz: 'Grupo de funções (FUGR, SE80): o contêiner dos function modules. A lib só o cria quando falta, como pré-requisito do FM.',
  comoTrata: 'GET coll/<fg>: 200 = já existe, nada a fazer. Senão POST do shell com Accept application/*. Sem lock, sem activate. Idempotente.',
  spike: { data: '2026-08-26', sistema: 'S4H', release: '758', revalidacoes: [{ data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758', '816'] },
  guardRails: [
    'não ativa — o FUGR nasce ativo; ativar pela URI do FUGR é no-op silencioso (activationExecuted="false")',
    'deleteObject do FUGR logo após o delete do FM pode dar 403 "já está processando" (ENQUEUE no SAPL<fg> na TRDIR) — medido 2026-08-28; liberarLocks (classrun) resolve',
  ],
  canais: ['adt', 'soapRfc'],
  origem: ['docs/receita-fm-rfc-wrapper.md', 'skill adt-objetos § FUGR/FF — function module (RFC)'],
  dependencias: [],
  exemplo: {
    opts: { name: 'YJBV_POC_FG', pkg: '$TMP', description: 'POC grupo do wrapper BDC' },
    nota: 'Grupo da POC do wrapper RFC (S4H 758 + SXD 816, 2026-08-26). Normalmente não se chama direto: deploy do functionModule cria o grupo se faltar.',
  },
  testes: [
    {
      canal: 'soapRfc',
      descricao: 'o grupo prova-se pelo FM dentro dele: deployFunctionModule({ group: "YJBV_POC_FG", … }) + callFunction por SOAP RFC (ver functionModule)',
      assert: { readTable: { tabela: 'TFDIR', campos: ['FUNCNAME', 'FMODE', 'PNAME'], where: ["PNAME = 'SAPLYJBV_POC_FG'"] }, espera: 'os FMs do grupo listados (PNAME = SAPL<grupo>)' },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-26', sistema: 'SXD', release: '816' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { contem: 'activationExecuted="false"', causa: 'ativação referenciando o FUGR em vez do FM', correcao: 'ativar pela URI do FM (deploy do functionModule já faz)' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'FUGR'", `OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (existe). FMs do grupo: TFDIR por PNAME = SAPL<grupo>.',
    medido: false,
  }),
  createBody,

  // Cria o grupo de funções em $TMP se faltar. Idempotente. Nunca deleta.
  async deploy(ctx, conexao, { name, pkg = '$TMP', description = '', corrNr }) {
    const s = await conexao.sessao();
    const N = String(name).toUpperCase();
    const existing = await call(s, { path: `${COLL}/${String(name).toLowerCase()}`, accept: 'application/*' });
    if (existing.status === 200) return { created: false };
    const body = createBody(N, pkg, description);
    const p = COLL + (corrNr ? `?corrNr=${corrNr}` : '');
    const r = await call(s, { method: 'POST', path: p, accept: 'application/*', contentType: CT, body });
    if (r.status !== 200 && r.status !== 201) throw new Error(`create FUGR ${N} falhou (${r.status}): ${r.text.slice(0, 300)}`);
    return { created: true };
  },
};
