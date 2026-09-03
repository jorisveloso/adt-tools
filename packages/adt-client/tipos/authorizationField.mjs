// tipos/authorizationField.mjs — AUTH, campo de autorização (SU20). Forma `xml`. (SPIKE 2026-08-29, S4H 758)
// Coleção `aps/iam/auth`, lida no discovery do s4h (accept `blues.v1+xml`, com os templates
// `$authobjects`, `$authsearchhelp`, `$syncfieldsbuffer`). Molde do GET de BUKRS. Sem /source/main (404).
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

// def: { rollName: 'BUKRS' (data element — OBRIGATÓRIO, é ele que dá tipo e domínio ao campo),
//        checkTable?: 'T001', exitFB?: '' (FM de exit), search?: boolean, objexit?: boolean }
export function buildAuthorizationFieldBody(name, pkg, description, def = {}) {
  const N = String(name).toUpperCase();
  const up = (v) => esc(String(v || '').toUpperCase());
  const bool = (v) => (v ? 'true' : 'false');
  return `${XML_PREF}<auth:auth xmlns:auth="http://www.sap.com/iam/auth" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="AUTH" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}<auth:content><auth:fieldName>${N}</auth:fieldName><auth:rollName>${up(def.rollName)}</auth:rollName><auth:checkTable>${up(def.checkTable)}</auth:checkTable><auth:exitFB>${up(def.exitFB)}</auth:exitFB><auth:search>${bool(def.search)}</auth:search><auth:objexit>${bool(def.objexit)}</auth:objexit></auth:content></auth:auth>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'authorizationField', codigo: 'AUTH', adtType: 'AUTH',
  descricao: 'campo de autorização',
  sinonimos: ['auth', 'campo de autorizacao', 'campo de autorização', 'authorization field', 'authfield', 'su20'],
  coll: '/sap/bc/adt/aps/iam/auth',
  ct: 'application/vnd.sap.adt.blues.v1+xml',
  source: false,
  forma: 'xml',
  nomeacao: { max: 10, fonte: 'medido 2026-08-29 (S4H 758): AUTHX-FIELDNAME é CHAR 30 e o create ACEITA 11, mas TOBJ-FIEL* é XUFIELD CHAR 10 e o create do SUSO recusa o campo de 11 (400 ST SUSO) — 10 é o limite ÚTIL, não o do create' },
  oQueFaz: 'Campo de autorização (AUTH, SU20): o nome que aparece como `ID` num AUTHORITY-CHECK. Carrega o data element que lhe dá tipo e domínio e, opcionalmente, a tabela de verificação que alimenta o help de valores na PFCG. Sozinho não protege nada — só vale dentro de um objeto de autorização (authorizationObject).',
  comoTrata: 'XML puro `auth:auth`, sem /source/main (404): create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody genérico). A ativação é NO-OP (o campo nasce ativo, como o pacote); a chamada fica só para o fluxo ser o mesmo dos outros XML-body. A descrição do objeto é DERIVADA do data element do `rollName` — o `adtcore:description` que você manda é descartado.',
  spike: { data: '2026-08-29', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    '`def.rollName` é obrigatório: é o data element que dá tipo e domínio ao campo (sem ele o campo nasce sem tipo)',
    'nome com mais de 10 caracteres é ACEITO pelo create do AUTH e inutiliza o campo: o SUSO recusa (400 "erro na deserialização … ST SUSO") porque TOBJ-FIEL* é CHAR 10 — o guard-rail de nomeação corta antes da rede',
    'ativação é no-op (activationExecuted="false"): o campo nasce ativo — não espere mensagem de ativação',
    'a descrição vem do data element, não do `adtcore:description` — para mudar o texto, mude o data element',
    'ACTVT é o campo de atividade padrão do SAP e não se recria: use o nome nu na lista de campos do objeto',
  ],
  canais: ['adt', 'soapRfc'],
  origem: [
    'spike 2026-08-29 (fila item 13): discovery do s4h + GET de BUKRS com accept blues.v1+xml',
    'docs/pesquisa-tipos-adt-nao-cobertos.md § AUTH / SUSO',
    'docs/ideias.md I17',
  ],
  dependencias: [{ tipo: 'dataElement', papel: 'o `rollName` — dá tipo e domínio ao campo; pode ser um data element padrão', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_F', pkg: '$TMP', description: 'POC campo de autorizacao',
      def: { rollName: 'BUKRS', checkTable: 'T001' },
    },
    nota: 'Nome com 10 caracteres de propósito: 11 passa no create do AUTH e depois quebra o create do objeto. O par medido no spike é este campo + o objeto YJBV_POC_O (authorizationObject).',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o campo existe com o data element e a tabela de verificação pedidos? readTable em AUTHX',
      assert: { readTable: { tabela: 'AUTHX', campos: ['FIELDNAME', 'ROLLNAME', 'CHECKTABLE', 'EXIT_FB', 'ACTVT_FLAG'], where: ["FIELDNAME = 'YJBV_POC_F'"] }, espera: "1 linha, ROLLNAME='BUKRS', CHECKTABLE='T001' (medido). Depois de alterar pelo mesmo deploy para { rollName: 'WERKS_D', checkTable: 'T001W' }: ROLLNAME='WERKS_D', CHECKTABLE='T001W'" },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'readTable',
      descricao: 'o campo chegou ao objeto que o usa? readTable em TOBJ — é o elo que prova que o nome coube nos 10 chars do XUFIELD',
      assert: { readTable: { tabela: 'TOBJ', campos: ['OBJCT', 'FIEL1', 'FIEL2'], where: ["OBJCT = 'YJBV_POC_O'"] }, espera: "FIEL1='YJBV_POC_F' (medido). O mesmo elo pelo lado ADT: GET /sap/bc/adt/aps/iam/auth/$authobjects?name=YJBV_POC_F devolve <auth:objectName>YJBV_POC_O</auth:objectName>" },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 400, contem: 'deserializa', causa: 'no create do OBJETO: um nome de campo acima de 10 caracteres não cabe em TOBJ-FIEL* (XUFIELD)', correcao: 'renomear o campo para 10 caracteres ou menos — o AUTH aceita mais, o SUSO não' },
  ],
  desmentidos: [
    {
      crenca: 'campo de autorização não é alterável por ADT REST (o sapcli declara AUTH sem alteração)',
      fato: 'lock → PUT → unlock troca a definição de um campo ATIVO: rollName BUKRS→WERKS_D e checkTable T001→T001W chegaram à AUTHX pelo mesmo deploy da lib, HTTP 200',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
    {
      crenca: 'o nome de um campo de autorização tem no máximo 10 caracteres (maxLen 10 do abap-adt-api)',
      fato: 'AUTHX-FIELDNAME é CHAR 30 e o create de AUTH aceita 11 caracteres (201). O limite de 10 vem de OUTRA tabela — TOBJ-FIEL* (XUFIELD, CHAR 10) — e só aparece quando o campo é posto num objeto: 400 na deserialização do ST SUSO',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
  ],
  prova: (name) => ({
    tabela: 'AUTHX', campos: ['FIELDNAME', 'ROLLNAME', 'CHECKTABLE', 'EXIT_FB', 'ACTVT_FLAG'], where: [`FIELDNAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha, ROLLNAME = o data element do `def.rollName` e CHECKTABLE = `def.checkTable`. AUTHX não tem coluna de versão: o campo nasce ativo.',
    medido: true,
  }),
  validar: (opts) => {
    if (!opts?.def?.rollName) throw new Error('GUARD-RAIL: authorizationField exige def.rollName (o data element que dá tipo ao campo).');
  },
  body: buildAuthorizationFieldBody,
};
