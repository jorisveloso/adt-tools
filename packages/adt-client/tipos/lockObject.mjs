// tipos/lockObject.mjs — ENQU/DL, lock object (objeto de bloqueio, SE11). Forma `xml`. (SPIKE 2026-08-29, S4H 758)
// Coleção `ddic/lockobjects/sources`, lida no discovery do s4h (accept `lockobjects.v1+xml`, categoria
// `enqudl`; ao lado, `lockmodes`, `tables`, `adjustment`, `validation`). XML `enqu:lockobject`, sem
// /source/main (404). Molde do GET de EMMARAE, E_TABLE, EVVBAKE e /ACCGO/E_DPQS (este com duas
// tabelas secundárias e parâmetros vindos delas). Fluxo `deployBody` genérico.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

// Modos de bloqueio que o s4h 758 lista em ddic/lockobjects/lockmodes (medido): E escrita, S leitura,
// X escrita ampliada, O otimista, R promoção O→E, U/V/W/C só verificação de colisão, T/+ reservados.
export const MODOS = Object.freeze(['E', 'S', 'X', 'O', 'R', 'U', 'V', 'W', 'C']);

// def: { table: 'YJBV_POC_LK_T' (tabela primária), lockMode?: 'E',
//        parameters: ['MANDT', 'ID'] — campos de CHAVE da tabela primária que viram parâmetros do
//          ENQUEUE_/DEQUEUE_; ou { name, table?, field?, wanted? } para parâmetro vindo de secundária,
//        allowRFC?: false (true → os dois FMs nascem remote-enabled, TFDIR FMODE='R'),
//        secondaryTables?: [{ table: 'YJBV_POC_LK_T2', lockMode?: 'E' }] — SÓ persistem quando a
//          secundária tem CHAVE ESTRANGEIRA para a primária (sem FK o SAP as descarta em silêncio) }
export function buildLockObjectBody(name, pkg, description, def = {}) {
  const N = String(name).toUpperCase();
  const T = String(def.table || '').toUpperCase();
  const modo = (m) => esc(String(m || 'E').toUpperCase());
  const sec = (def.secondaryTables || []).map((t) => `<enqu:secondaryTable><enqu:tableName>${esc(String(t.table).toUpperCase())}</enqu:tableName><enqu:lockMode>${modo(t.lockMode)}</enqu:lockMode></enqu:secondaryTable>`).join('');
  const params = (def.parameters || []).map((p) => {
    const o = typeof p === 'string' ? { name: p } : p;
    const campo = String(o.field || o.name).toUpperCase();
    return `<enqu:lockParameter><enqu:parameterWanted>${o.wanted === false ? 'false' : 'true'}</enqu:parameterWanted><enqu:parameterName>${esc(String(o.name).toUpperCase())}</enqu:parameterName><enqu:tableName>${esc(String(o.table || T).toUpperCase())}</enqu:tableName><enqu:fieldName>${esc(campo)}</enqu:fieldName></enqu:lockParameter>`;
  }).join('');
  return `${XML_PREF}<enqu:lockobject xmlns:enqu="http://www.sap.com/adt/ddic/enqu" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="ENQU/DL" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}<enqu:content><enqu:allowRFC>${def.allowRFC ? 'true' : 'false'}</enqu:allowRFC><enqu:primaryTable><enqu:tableName>${esc(T)}</enqu:tableName><enqu:lockMode>${modo(def.lockMode)}</enqu:lockMode></enqu:primaryTable><enqu:secondaryTables>${sec}</enqu:secondaryTables><enqu:lockParameters>${params}</enqu:lockParameters></enqu:content></enqu:lockobject>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'lockObject', codigo: 'ENQU', adtType: 'ENQU/DL',
  descricao: 'lock object',
  sinonimos: ['lockobject', 'lock object', 'objeto de bloqueio', 'objetodebloqueio', 'enqu', 'enqueue'],
  coll: '/sap/bc/adt/ddic/lockobjects/sources',
  ct: 'application/vnd.sap.adt.lockobjects.v1+xml',
  source: false,
  forma: 'xml',
  // O nome de lock object COMEÇA POR E — regra do SAP, não nossa: sem o E o create devolve 409
  // "Não é possível criar objetos de teste em conjuntos de nomes externos" (medido). O Z/Y da lib
  // roda DEPOIS do prefixo (EY…/EZ… é nosso; EMMARAE não é). 16 = OBJNAME_MAXLENGTH do typestructure.
  nomeacao: { max: 16, prefixo: 'E', fonte: 'typestructure do s4h 758 (OBJNAME_MAXLENGTH 16); prefixo E medido por 409 no create de YJBV_POC_L1' },
  oQueFaz: 'Objeto de bloqueio do dicionário (ENQU, SE11): a partir de uma tabela primária, modo e parâmetros (campos de chave), a ativação GERA os function modules ENQUEUE_<nome>/DEQUEUE_<nome> no grupo /1BCDWBEN/*. É o que um programa chama para travar uma chave no servidor de enqueue (SM12) antes de escrever.',
  comoTrata: 'XML puro `enqu:lockobject`, sem /source/main (404): create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody genérico). Nasce INATIVO e é a ativação que gera os FMs (TFDIR). Alterar modo, RFC ou tabelas de um objeto ATIVO é o mesmo deploy; a alteração da tabela-base deixa uma versão L na DD25L até a próxima ativação.',
  spike: { data: '2026-08-29', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    'o nome começa por E (EY…/EZ…): sem o E o create devolve 409 "objetos de teste em conjuntos de nomes externos" — o guard-rail recusa antes da rede',
    '`def.table` e `def.parameters` são obrigatórios: os parâmetros são campos de CHAVE da tabela primária (MANDT inclusive quando a tabela depende de mandante) e viram a assinatura do ENQUEUE_/DEQUEUE_',
    'o create NÃO valida a tabela: com tabela inexistente o POST devolve 201 (inativo) e só a ATIVAÇÃO falha, com "Tabela de base … do objeto de bloqueio não existente ativa" (D0 408) — medido',
    'tabela secundária SEM chave estrangeira para a primária é DESCARTADA EM SILÊNCIO: PUT 200, ativação 200, e a DD26S só tem a primária. Com FK (`with foreign key` no DDL da secundária — que exige campo com data element, E2 181) ela persiste (TABPOS 0002, ENQMODE na DD27S) — medido',
    '`allowRFC: true` é o que torna os FMs remote-enabled (TFDIR FMODE=\'R\'): é pré-requisito para chamá-los por SOAP RFC ou por `DESTINATION \'NONE\'` no driver',
    'mudar o TIPO de um campo da tabela primária com o lock object ativo deixa uma versão AS4LOCAL=\'L\' na DD25L ao lado da ativa — o próximo deploy do lock object a resolve',
    'lock tomado num driver classrun por DESTINATION \'NONE\' ou com _scope=2 SOBREVIVE ao fim do main (a sessão ADT stateful continua viva) e ao DELETE do lock object — a execução seguinte acha FOREIGN_LOCK numa chave que ninguém usa. O driver termina com DEQUEUE_ALL nos dois contextos; lock que ficou se solta com classrun.liberarLocks(cx, "<garg>") — medido',
  ],
  canais: ['adt', 'classrun', 'soapRfc'],
  origem: [
    'spike 2026-08-29 (fila item 12): discovery do s4h + GET de EMMARAE/E_TABLE/EVVBAKE//ACCGO/E_DPQS com accept lockobjects.v1+xml',
    'docs/pesquisa-tipos-adt-nao-cobertos.md § ENQU',
    'docs/ideias.md I2',
  ],
  dependencias: [{ tipo: 'table', papel: 'tabela primária (e secundárias) — precisam estar ATIVAS na ativação do lock object', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'EYJBV_POC_LK', pkg: '$TMP', description: 'POC lock object',
      def: { table: 'YJBV_POC_LK_T', lockMode: 'E', parameters: ['MANDT', 'ID'], allowRFC: true },
    },
    nota: 'YJBV_POC_LK_T (key mandt, key id numc10) criada antes pelo módulo table. Variante com secundária: def.secondaryTables: [{ table: "YJBV_POC_LK_T2", lockMode: "S" }] — só persiste se T2 tem FK para T.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o lock object está ativo e gerou os FMs? readTable em DD25L (AGGTYPE E) e TFDIR (ENQUEUE_/DEQUEUE_, FMODE R quando allowRFC)',
      assert: { readTable: { tabela: 'TFDIR', campos: ['FUNCNAME', 'PNAME', 'FMODE'], where: ["FUNCNAME LIKE '%EYJBV_POC_LK'"] }, espera: "2 linhas, ENQUEUE_EYJBV_POC_LK e DEQUEUE_EYJBV_POC_LK, PNAME /1BCDWBEN/SAPLTEN0000, FMODE='R' com allowRFC (vazio sem) — medido. DD25L: VIEWNAME, AS4LOCAL='A', AGGTYPE='E', ROOTTAB = a tabela; DD26S: uma linha por tabela (TABPOS); DD27S: parâmetros com KEYFLAG X e uma linha FIELDNAME='*' por tabela com o ENQMODE" },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'o bloqueio EXCLUI outra sessão? driver trava a chave, tenta a mesma chave por DESTINATION NONE (outro contexto/owner) e lê FOREIGN_LOCK; outra chave passa; depois do DEQUEUE a mesma chave passa — o contrafactual é o que prova',
      abap: [
        'CLASS yjbv_poc_cl_lk DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_lk IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    DATA lt TYPE STANDARD TABLE OF seqg3.',
        "    DATA(lv_id) = CONV numc10( '0000000007' ).",
        "    CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' EXPORTING mandt = sy-mandt id = lv_id",
        '      EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.',
        '    out->write( |1 enqueue local subrc={ sy-subrc }| ).',
        "    CALL FUNCTION 'ENQUEUE_READ' EXPORTING gclient = sy-mandt guname = sy-uname TABLES enq = lt EXCEPTIONS OTHERS = 1.",
        "    LOOP AT lt INTO DATA(ls) WHERE gname = 'YJBV_POC_LK_T'.",
        '      out->write( |2 sm12 garg={ ls-garg } gmode={ ls-gmode }| ).',
        '    ENDLOOP.',
        "    CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = lv_id",
        '      EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.',
        '    out->write( |3 mesma chave, outro contexto subrc={ sy-subrc }| ).',
        "    CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = CONV numc10( '0000000008' )",
        '      EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.',
        '    out->write( |4 outra chave, outro contexto subrc={ sy-subrc }| ).',
        "    CALL FUNCTION 'DEQUEUE_EYJBV_POC_LK' EXPORTING mandt = sy-mandt id = lv_id.",
        "    CALL FUNCTION 'ENQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = lv_id",
        '      EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.',
        '    out->write( |5 mesma chave apos dequeue subrc={ sy-subrc }| ).',
        "    \" os locks do contexto NONE (e de _scope=2) SOBREVIVEM ao fim do main — a sessão ADT continua viva.",
        "    \" Sem isto a próxima execução acha FOREIGN_LOCK numa chave que ninguém mais usa (medido).",
        "    \" DEQUEUE_ALL não é RFC (DESTINATION NONE dumpa): solta-se pelo DEQUEUE_ gerado, chave a chave.",
        "    CALL FUNCTION 'DEQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = lv_id.",
        "    CALL FUNCTION 'DEQUEUE_EYJBV_POC_LK' DESTINATION 'NONE' EXPORTING mandt = sy-mandt id = CONV numc10( '0000000008' ).",
        "    CALL FUNCTION 'DEQUEUE_ALL'.",
        '    CLEAR lt.',
        "    CALL FUNCTION 'ENQUEUE_READ' EXPORTING gclient = sy-mandt guname = sy-uname TABLES enq = lt EXCEPTIONS OTHERS = 1.",
        "    DELETE lt WHERE gname <> 'YJBV_POC_LK_T'.",
        '    out->write( |6 sm12 apos dequeue_all locks={ lines( lt ) }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: '1 enqueue local subrc=0 · 2 sm12 garg=250<id> gmode=E · 3 mesma chave, outro contexto subrc=1 · 4 outra chave, outro contexto subrc=0 · 5 mesma chave apos dequeue subrc=0 · 6 sm12 apos dequeue_all locks=0', espera: 'a chave travada bate em FOREIGN_LOCK (1) de outro contexto e só ela; liberada, passa (0); e o driver deixa a SM12 limpa. Exige allowRFC (DESTINATION NONE só chama FM remote-enabled)' },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'soapRfc',
      descricao: 'com allowRFC o ENQUEUE_ é chamável de fora: callFunction(cfg, "ENQUEUE_EYJBV_POC_LK", { MANDT, ID }) responde sem SOAP Fault (o lock morre com a LUW da chamada)',
      assert: { http: 'ENQUEUE_EYJBV_POC_LK.Response sem Fault', espera: 'resposta vazia sem fault = FM RFC gerado e executável; sem allowRFC a chamada falha (FM não é remote-enabled)' },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 409, contem: 'conjuntos de nomes externos', causa: 'nome sem o E inicial (YJBV_…): para o SAP, lock object fora do prefixo E é "conjunto de nomes externo"', correcao: 'nomear EY…/EZ… (a lib recusa antes da rede pelo nomeacao.prefixo)' },
    { contem: 'não existente ativa', causa: 'a tabela primária (ou secundária) não existe/não está ativa — o create aceitou (201) e a ativação recusou (D0 408)', correcao: 'criar/ativar a tabela antes (dependencias: table); depois repetir o deploy' },
  ],
  desmentidos: [
    {
      crenca: 'ENQU não é criável por ADT REST — só aparece sob o wrapper /vit/ e o vscode_abap_remote_fs o marca unsupported',
      fato: 'o s4h 758 tem a coleção nativa /sap/bc/adt/ddic/lockobjects/sources (accept lockobjects.v1+xml, categoria enqudl): POST 201, PUT altera o ativo, activate gera os FMs, DELETE 200',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
    {
      crenca: 'PUT 200 + ativação sem mensagem = a definição inteira foi gravada',
      fato: 'a tabela secundária sem chave estrangeira para a primária sai do XML gravado sem erro nenhum (secondaryTables vazio no GET, DD26S só com a primária); o assert é a DD26S, não o status',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
    {
      crenca: 'dois ENQUEUE do mesmo usuário na mesma sessão com owners diferentes (_scope 1 e 2) colidem',
      fato: 'não colidem: ENQUEUE com _scope=2 sobre a chave já travada pelo owner de diálogo devolveu subrc=0; a colisão (FOREIGN_LOCK) só apareceu de OUTRO contexto (DESTINATION NONE)',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
  ],
  prova: (name) => ({
    tabela: 'DD25L', campos: ['VIEWNAME', 'AS4LOCAL', 'AGGTYPE', 'ROOTTAB'], where: [`VIEWNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha AS4LOCAL='A', AGGTYPE='E', ROOTTAB = def.table. Os FMs gerados estão na TFDIR (ENQUEUE_<nome>, DEQUEUE_<nome>; FMODE='R' se allowRFC); as tabelas na DD26S e os parâmetros na DD27S.",
    medido: true,
  }),
  validar: (opts) => {
    const def = opts?.def || {};
    if (!def.table) throw new Error('GUARD-RAIL: lockObject exige def.table (tabela primária, ativa).');
    if (!Array.isArray(def.parameters) || !def.parameters.length) throw new Error('GUARD-RAIL: lockObject exige def.parameters (campos de chave da tabela primária — são a assinatura do ENQUEUE_/DEQUEUE_).');
    const ruim = [def.lockMode, ...(def.secondaryTables || []).map((t) => t.lockMode)].filter((m) => m !== undefined).find((m) => !MODOS.includes(String(m).toUpperCase()));
    if (ruim !== undefined) throw new Error(`GUARD-RAIL: lockMode "${ruim}" não está em ddic/lockobjects/lockmodes (${MODOS.join(', ')}).`);
    const semTabela = (def.secondaryTables || []).find((t) => !t || !t.table);
    if (semTabela !== undefined) throw new Error('GUARD-RAIL: cada secondaryTables[] precisa de { table } — e a tabela precisa ter chave estrangeira para a primária, senão o SAP a descarta em silêncio.');
  },
  body: buildLockObjectBody,
};
