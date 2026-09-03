// tipos/prog.mjs — PROG/P, programa ABAP (report). Forma `source`. (SPIKE 2026-07-19)
// Report e include são ambos PROG na TADIR, mas coleções ADT distintas — por isso dois módulos com o
// mesmo `codigo`. `prog`/`programa` resolvem para os dois; `report`/`relatorio` só para este.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'prog', codigo: 'PROG', adtType: 'PROG/P',
  descricao: 'programa',
  sinonimos: ['report', 'relatorio', 'executavel'],
  sinonimosDoCodigo: ['programa', 'program'],
  coll: '/sap/bc/adt/programs/programs',
  ct: 'application/vnd.sap.adt.programs.programs.v2+xml',
  source: true,
  forma: 'source',
  nomeacao: { max: 40, fonte: 'documentação SAP (nome de programa); não medido' },
  oQueFaz: 'Programa executável ABAP (report, SE38). A lib cria/altera o source completo e ativa.',
  comoTrata: 'Shell `program:abapProgram type="PROG/P"` → lock → PUT /source/main → unlock → activate (deploySource).',
  spike: { data: '2026-07-19', sistema: 'DEV', revalidacoes: [{ data: '2026-08-17', sistema: 'DEV' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'SELECTION-SCREEN … WITH FRAME TITLE <var> já DECLARA <var>: um DATA <var> antes aborta a ativação ("was already declared") e o report fica criado e inativo — atribua o texto em INITIALIZATION',
    'o ADT não grava text elements: título/label em português saem por variável implícita e %_campo_%_app_%-text em INITIALIZATION',
    'NÃO testar report por SUBMIT dentro de um driver classrun: o endpoint responde HTTP 500 (página "Application Server Error") — medido 2026-08-28 S4H 758 com `SUBMIT … AND RETURN` e com `EXPORTING LIST TO MEMORY`; causa não lida (ST22). Prova de execução de report fica para aunit ou SA38',
  ],
  canais: ['adt', 'classrun', 'aunit'],
  origem: ['skill adt-objetos § PROG/P e PROG/I — programa e include'],
  dependencias: [{ tipo: 'include', papel: 'includes do report (opcional); ativar o par [include, programa] na mesma requisição', ativarJunto: true }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_REPORT', pkg: '$TMP', description: 'POC report',
      source: [
        'REPORT yjbv_poc_report.',
        'PARAMETERS p_txt TYPE char20 DEFAULT \'agente\'.',
        'START-OF-SELECTION.',
        '  WRITE: / |POC report { p_txt }|.',
      ].join('\n'),
    },
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'existência e tipo: TRDIR por NAME (report SUBC=1; include SUBC=I) — o report do exemplo, com INCLUDE yjbv_poc_inc e PERFORM, criou e ativou',
      assert: { readTable: { tabela: 'TRDIR', campos: ['NAME', 'SUBC'], where: ["NAME = 'YJBV_POC_REPORT'"] }, espera: "1 linha, SUBC = '1'" },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'aunit',
      descricao: 'runUnitTests({ type: "prog", name }) roda as classes de teste que ficam num include do próprio report',
      assert: { unit: 'executed > 0 && failed === 0', espera: 'executed=0 NUNCA é sucesso' },
      medido: [],
    },
  ],
  erros: [
    { contem: 'was already declared', causa: 'DATA de uma variável que SELECTION-SCREEN … TITLE já declara', correcao: 'remover o DATA; só atribuir em INITIALIZATION' },
    { contem: 'activationExecuted="false"', causa: 'ativou o programa, mas a versão inativa está no include que recebeu o PUT', correcao: 'ativar o include, ou o par [include, programa] na mesma requisição' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TRDIR', campos: ['NAME', 'SUBC'], where: [`NAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, SUBC = '1' (executável). Estado ativo: getObject → adtcore:version=\"active\".",
    medido: true,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:type="PROG/P" adtcore:name="${N}" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</program:abapProgram>`;
  },
};
