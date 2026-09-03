// tipos/include.mjs — PROG/I, include de programa. Forma `source`. (SPIKE 2026-07-19)
// Mesmo fluxo source-based do report; o include pode ser referenciado por um programa via INCLUDE.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'include', codigo: 'PROG', adtType: 'PROG/I',
  descricao: 'include',
  sinonimos: ['inc'],
  coll: '/sap/bc/adt/programs/includes',
  ct: 'application/vnd.sap.adt.programs.includes.v2+xml',
  source: true,
  forma: 'source',
  nomeacao: { max: 40, fonte: 'documentação SAP (nome de programa); não medido' },
  oQueFaz: 'Include de programa ABAP (PROG/I). Código reutilizável que um report puxa com INCLUDE.',
  comoTrata: 'Shell `progInclude:abapInclude type="PROG/I"` → lock → PUT /source/main → unlock → activate (deploySource). Include de um programa EXISTENTE exige `context=` (URI do programa) e `corrNr=` no PUT — o setSource genérico não manda.',
  spike: { data: '2026-07-19', sistema: 'DEV', revalidacoes: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'alterar include de programa existente exige context=<uri do report> e corrNr= no PUT (400 ExceptionParameterNotFound / "Parameter corrNr" sem eles)',
    'a ativação tem de referenciar o INCLUDE — ativar só o report é no-op silencioso (activationExecuted="false")',
  ],
  canais: ['adt', 'classrun'],
  origem: ['skill adt-objetos § PROG/P e PROG/I — programa e include'],
  dependencias: [{ tipo: 'prog', papel: 'programa mestre (context= no PUT); ativar o par [include, programa] juntos', ativarJunto: true }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_INC', pkg: '$TMP', description: 'POC include',
      source: [
        '*&---- include YJBV_POC_INC ----*',
        'FORM yjbv_poc_escreve USING iv_txt TYPE csequence.',
        '  WRITE: / iv_txt.',
        'ENDFORM.',
      ].join('\n'),
    },
    nota: 'Include avulso (sem programa mestre) cria e ativa pelo fluxo genérico; o caso com mestre exige context=/corrNr= — ver guardRails.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o include prova-se pelo report que o INCLUDE: com o report YJBV_POC_REPORT (INCLUDE yjbv_poc_inc + PERFORM) criado e ATIVO depois do include, o par existe na TRDIR — se a FORM não resolvesse, o report não ativaria. (SUBMIT de dentro de um driver classrun devolve HTTP 500 — ver guardRails do prog)',
      assert: { readTable: { tabela: 'TRDIR', campos: ['NAME', 'SUBC'], where: ["NAME IN ('YJBV_POC_REPORT','YJBV_POC_INC')"] }, espera: "2 linhas: include SUBC = 'I', report SUBC = '1'" },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 400, contem: 'ExceptionParameterNotFound', causa: 'PUT de include de programa existente sem context=', correcao: 'context=/sap/bc/adt/programs/programs/<report> no PUT' },
    { status: 400, contem: 'corrNr', causa: 'PUT de include de programa existente sem corrNr=', correcao: 'informar a transport request no PUT' },
    { contem: 'activationExecuted="false"', causa: 'ativou o report em vez do include que recebeu o PUT', correcao: 'ativar a URI do include (ou o par na mesma requisição)' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TRDIR', campos: ['NAME', 'SUBC'], where: [`NAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, SUBC = 'I' (include). Estado ativo: getObject → adtcore:version=\"active\".",
    medido: true,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<progInclude:abapInclude xmlns:progInclude="http://www.sap.com/adt/programs/includes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:type="PROG/I" adtcore:name="${N}" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</progInclude:abapInclude>`;
  },
};
