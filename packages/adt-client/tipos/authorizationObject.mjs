// tipos/authorizationObject.mjs — SUSO/B, objeto de autorização (SU21). Forma `xml`. (SPIKE 2026-08-29, S4H 758)
// Coleção `aps/iam/suso`, lida no discovery do s4h (accept `blues.v1+xml`, com uma dúzia de
// sub-coleções de value help: objectclass, activity, criticality, privileged, authObject/valueHelp…).
// Molde do GET de F_BKPF_BUK. Sem /source/main (404).
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

// Quantas colunas FIEL* a TOBJ tem (FIEL1..FIEL9 + FIEL0) — medido por DD03L em 2026-08-29.
export const MAX_CAMPOS = 10;

// def: { objectClass: 'TEST' (classe da TOBC — value help em aps/iam/suso/objectclass/listvalues),
//        fields: ['YJBV_POC_F', 'ACTVT'] (nomes de campo de autorização já existentes),
//        activities?: ['01','02','03'] (só faz sentido com ACTVT na lista de campos),
//        criticality?: 'N', privileged?: 'A', ownContext?: 'A' }
export function buildAuthorizationObjectBody(name, pkg, description, def = {}) {
  const N = String(name).toUpperCase();
  const campos = (def.fields || []).map((c) => `<suso:authField><suso:name>${esc(String(c).toUpperCase())}</suso:name></suso:authField>`).join('');
  const ativs = (def.activities || []).map((a) => `<suso:activity><suso:code>${esc(String(a).toUpperCase())}</suso:code></suso:activity>`).join('');
  return `${XML_PREF}<suso:suso xmlns:suso="http://www.sap.com/iam/suso" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="SUSO/B" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}<suso:content><suso:objectClassName>${esc(String(def.objectClass || '').toUpperCase())}</suso:objectClassName><suso:criticality>${esc(def.criticality || 'N')}</suso:criticality><suso:privileged>${esc(def.privileged || 'A')}</suso:privileged><suso:ownContext>${esc(def.ownContext || 'A')}</suso:ownContext><suso:authFields>${campos}</suso:authFields><suso:activities>${ativs}</suso:activities></suso:content></suso:suso>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'authorizationObject', codigo: 'SUSO', adtType: 'SUSO/B',
  descricao: 'objeto de autorização',
  sinonimos: ['suso', 'objeto de autorizacao', 'objeto de autorização', 'authorization object', 'authobject', 'su21'],
  coll: '/sap/bc/adt/aps/iam/suso',
  ct: 'application/vnd.sap.adt.blues.v1+xml',
  source: false,
  forma: 'xml',
  nomeacao: { max: 10, fonte: 'medido 2026-08-29 (S4H 758): TOBJ-OBJCT é XUOBJECT CHAR 10 e um nome de 11 é recusado no create com 400 "erro na deserialização … ST SUSO"' },
  oQueFaz: 'Objeto de autorização (SUSO, SU21): o par (classe, lista de campos) que o AUTHORITY-CHECK cita. É o que a PFCG oferece para preencher com valores e o que o kernel avalia em tempo de execução. Sem ele, um campo de autorização (authorizationField) não protege nada.',
  comoTrata: 'XML puro `suso:suso`, sem /source/main (404): create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody genérico). A ativação é NO-OP (o objeto nasce ativo: a linha da TOBJ já existe depois do 201). Alterar campos, atividades ou descrição de um objeto ATIVO é o mesmo deploy.',
  spike: { data: '2026-08-29', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    '`def.objectClass` e `def.fields` são obrigatórios: a classe tem de existir na TOBC (value help em /sap/bc/adt/aps/iam/suso/objectclass/listvalues) e os campos têm de existir na AUTHX ANTES do create',
    'no máximo 10 campos, cada um com no máximo 10 caracteres: a TOBJ guarda os campos em FIEL1..FIEL9+FIEL0, todos XUFIELD CHAR 10 (medido por DD03L) — nome de campo maior derruba o create com 400 na deserialização do ST SUSO',
    'ativação é no-op (activationExecuted="false"): o objeto nasce ativo — a prova é a TOBJ, não uma mensagem de ativação',
    'AUTHORITY-CHECK NÃO prova que o objeto existe: sem autorização no usuário, objeto existente e objeto inexistente devolvem os dois sy-subrc=12 (medido). Para provar pelo efeito é preciso um usuário com perfil que contenha o objeto — e aí subrc=0',
    'no `AUTHORITY-CHECK … FOR USER`, um literal de usuário tem de ter os 12 caracteres do SY-UNAME: literal mais curto é ERRO DE SINTAXE ("must be compatible with the type(s) of SY-UNAME") — use uma variável tipada',
  ],
  canais: ['adt', 'classrun', 'soapRfc'],
  origem: [
    'spike 2026-08-29 (fila item 13): discovery do s4h + GET de F_BKPF_BUK com accept blues.v1+xml',
    'docs/pesquisa-tipos-adt-nao-cobertos.md § AUTH / SUSO',
    'docs/ideias.md I17',
  ],
  dependencias: [{ tipo: 'authorizationField', papel: 'cada nome de `def.fields` — o campo precisa existir na AUTHX antes do create do objeto', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_O', pkg: '$TMP', description: 'POC objeto de autorizacao',
      def: { objectClass: 'TEST', fields: ['YJBV_POC_F', 'ACTVT'], activities: ['01', '02', '03'] },
    },
    nota: 'YJBV_POC_F é criado antes pelo módulo authorizationField; ACTVT é o campo de atividade padrão do SAP. Classe TEST existe na TOBC do s4h.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o objeto existe com a classe e os campos pedidos? readTable em TOBJ (os campos são colunas, não linhas)',
      assert: { readTable: { tabela: 'TOBJ', campos: ['OBJCT', 'FIEL1', 'FIEL2', 'OCLSS', 'BNAME'], where: ["OBJCT = 'YJBV_POC_O'"] }, espera: "1 linha, FIEL1='YJBV_POC_F', FIEL2='ACTVT', OCLSS='TEST', BNAME = o usuário do create (medido)" },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'o objeto GOVERNA acesso? driver faz AUTHORITY-CHECK FOR USER contra um usuário de referência que tem perfil com a autorização (YJBV_POC_F=1000, ACTVT=03) e escreve o sy-subrc de quatro variantes',
      abap: [
        'CLASS yjbv_poc_cl_ck DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_ck IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        "    AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'",
        "      ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '03'.",
        '    out->write( |1 permitido      subrc={ sy-subrc }| ).',
        "    AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'",
        "      ID 'YJBV_POC_F' FIELD '2000' ID 'ACTVT' FIELD '03'.",
        '    out->write( |2 valor fora     subrc={ sy-subrc }| ).',
        "    AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'",
        "      ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '01'.",
        '    out->write( |3 atividade fora subrc={ sy-subrc }| ).',
        "    AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'",
        "      ID 'YJBV_POC_F' FIELD '1000'.",
        '    out->write( |4 campo omitido  subrc={ sy-subrc }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: '1 permitido subrc=0 · 2 valor fora subrc=4 · 3 atividade fora subrc=4 · 4 campo omitido subrc=0', espera: 'o valor autorizado passa (0), valor e atividade fora do autorizado batem (4) e um campo NÃO citado no check simplesmente não é checado (0) — medido' },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'contrafactual: o MESMO check contra objeto inexistente e contra usuário sem o perfil — é o que mostra que sy-subrc sozinho não prova existência',
      abap: [
        'CLASS yjbv_poc_cl_ck2 DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_ck2 IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        "    DATA(lv_eu) = CONV sy-uname( 'MVJVELOSO' ).",
        "    AUTHORITY-CHECK OBJECT 'YJBV_POC_N' FOR USER 'YJBV_POC_USR'",
        "      ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '03'.",
        '    out->write( |5 objeto inexistente subrc={ sy-subrc }| ).',
        "    AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER lv_eu",
        "      ID 'YJBV_POC_F' FIELD '1000' ID 'ACTVT' FIELD '03'.",
        '    out->write( |6 usuario sem perfil subrc={ sy-subrc }| ).',
        "    AUTHORITY-CHECK OBJECT 'YJBV_POC_O' FOR USER 'YJBV_POC_USR'",
        "      ID 'ZZ_NAO_EX' FIELD '1000' ID 'ACTVT' FIELD '03'.",
        '    out->write( |7 ID inexistente     subrc={ sy-subrc }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: '5 objeto inexistente subrc=12 · 6 usuario sem perfil subrc=12 · 7 ID inexistente subrc=4', espera: 'objeto inexistente e usuário sem perfil são INDISTINGUÍVEIS (12); um ID que não existe no objeto cai em 4, não em erro — medido' },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 400, contem: 'deserializa', causa: 'nome do objeto ou de um campo acima de 10 caracteres — não cabe em TOBJ-OBJCT/FIEL* (a mensagem é "Ocorreu um erro na deserialização em o programa ST SUSO" e não diz qual campo)', correcao: 'encurtar para 10 caracteres; se o objeto tem 10 e ainda falha, o excesso está num nome de campo' },
  ],
  desmentidos: [
    {
      crenca: 'o check de sintaxe do ABAP valida o AUTHORITY-CHECK contra a TOBJ — objeto ou ID inexistente dá erro de sintaxe',
      fato: 'não valida nada: driver com objeto inexistente e driver com ID inexistente ATIVARAM sem mensagem, e só divergiram no sy-subrc de execução (12 e 4)',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
    {
      crenca: 'sy-subrc do AUTHORITY-CHECK serve de prova de que o objeto de autorização foi criado',
      fato: 'sem autorização no usuário, o objeto RECÉM-CRIADO e um nome que nunca existiu devolvem os dois 12. A discriminação só aparece com um usuário que tenha perfil com a autorização: 0 no valor autorizado, 4 fora dele',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
    {
      crenca: 'o AUTHORITY-CHECK precisa citar todos os campos do objeto, senão falha',
      fato: 'campo não citado simplesmente não é checado: o check com só um dos dois campos devolveu 0 para o usuário autorizado',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
  ],
  prova: (name) => ({
    tabela: 'TOBJ', campos: ['OBJCT', 'FIEL1', 'FIEL2', 'OCLSS', 'BNAME'], where: [`OBJCT = '${String(name).toUpperCase()}'`],
    espera: '1 linha, OCLSS = a classe do `def.objectClass` e FIEL1..FIEL0 = os campos na ordem de `def.fields`. TOBJ não tem coluna de versão: o objeto nasce ativo.',
    medido: true,
  }),
  validar: (opts) => {
    const def = opts?.def || {};
    if (!def.objectClass) throw new Error('GUARD-RAIL: authorizationObject exige def.objectClass (classe da TOBC).');
    const campos = def.fields || [];
    if (!campos.length) throw new Error('GUARD-RAIL: authorizationObject exige def.fields (ao menos um campo de autorização já existente).');
    if (campos.length > MAX_CAMPOS) throw new Error(`GUARD-RAIL: ${campos.length} campos; a TOBJ tem só ${MAX_CAMPOS} colunas FIEL* (medido 2026-08-29).`);
    const grande = campos.find((c) => String(c).length > 10);
    if (grande) throw new Error(`GUARD-RAIL: campo "${grande}" tem ${String(grande).length} caracteres; TOBJ-FIEL* é CHAR 10 e o create devolveria 400 na deserialização do ST SUSO.`);
  },
  body: buildAuthorizationObjectBody,
};
