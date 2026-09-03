// tipos/accessControl.mjs — DCLS/DL, access control (DCL source). Forma `source`. (SPIKE 2026-08-28, S4H 758)
// A coleção é `acm/dcl/sources` (lida no discovery do s4h, com os templates de `{object_name}` e
// `/source/main`); o molde veio do GET de I_CADOCUMENTGLITEM e SHSM_DFKKOP. Fluxo idêntico ao da CDS.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'accessControl', codigo: 'DCLS', adtType: 'DCLS/DL',
  descricao: 'access control (DCL)',
  sinonimos: ['dcl', 'dcls', 'access control', 'controle de acesso', 'dcl source', 'role dcl'],
  coll: '/sap/bc/adt/acm/dcl/sources',
  ct: 'application/vnd.sap.adt.dclSource+xml',
  source: true,
  forma: 'source',
  nomeacao: { max: 40, fonte: 'typestructure do s4h 758 (OBJNAME_MAXLENGTH 40, fila 26) — o maxLen 30 do abap-adt-api estava a menor; não medido por rejeição' },
  oQueFaz: 'Access control (DCLS): a role DCL que restringe o SELECT numa CDS — `define role … grant select on <view> where …`, por literal ou por `aspect pfcg_auth`. É a peça que faltava para a lib montar uma superfície RAP com autorização de dados; o filtro vale para todo SELECT ABAP na view (e, por consequência, para o OData da SRVB — este não medido).',
  comoTrata: 'Shell `dcl:dclSource type="DCLS/DL"` → lock → PUT /source/main com o `define role` → unlock → activate (deploySource genérico, o mesmo fluxo da CDS). Alterar a role ATIVA é o mesmo deploy: o PUT + activate troca o filtro na hora (medido).',
  spike: { data: '2026-08-28', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    '`@MappingRole: true` é OBRIGATÓRIO: sem ele a ATIVAÇÃO falha (E ACM_SYNTAX 130) — não é "role ativa que não é aplicada"',
    'o nome da role no fonte tem de ser o nome do objeto DCLS (`define role <objeto>`)',
    'os campos da condição são os ELEMENTOS da view (alias do select), não os campos da tabela base',
    'DCL não cria dado nem autorização: quem prova o filtro é um SELECT no driver; `WITH PRIVILEGED ACCESS` é o contrafactual (ignora a role) — medido 2/3 filtrado vs 3/3 privilegiado',
  ],
  canais: ['adt', 'classrun'],
  origem: ['spike 2026-08-28 (fila item 9): discovery do s4h + GET de I_CADOCUMENTGLITEM/SHSM_DFKKOP', 'docs/pesquisa-tipos-adt-nao-cobertos.md § DCLS', 'docs/ideias.md I14'],
  dependencias: [{ tipo: 'cds', papel: 'a view do `grant select on` — precisa existir e estar ativa antes', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_DCL', pkg: '$TMP', description: 'POC access control',
      source: [
        "@EndUserText.label: 'POC access control'",
        '@MappingRole: true',
        'define role YJBV_POC_DCL {',
        '  grant select on YJBV_POC_DCL_C',
        "    where Kind = 'A';",
        '}',
      ].join('\n'),
    },
    nota: "Role do spike (S4H 758, 2026-08-28) sobre a CDS YJBV_POC_DCL_C (view entity sobre a tabela YJBV_POC_DCL_T, elementos Id/Kind/Texto; 3 linhas, 2 com kind=A). Condição por LITERAL — a forma `where ( CompanyCode ) = aspect pfcg_auth( F_KKKO_BUK, BUKRS, ACTVT = '03' )` é a dos objetos padrão e não foi medida aqui (exige perfil PFCG).",
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'driver lê a view três vezes — com a role, ignorando a role (WITH PRIVILEGED ACCESS) e na tabela base. A DIFERENÇA é o assert: o filtro veio da DCL, não do dado',
      abap: [
        'CLASS yjbv_poc_cl_dclr DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_dclr IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    SELECT FROM yjbv_poc_dcl_c FIELDS Id, Kind INTO TABLE @DATA(lt).',
        '    SELECT FROM yjbv_poc_dcl_c WITH PRIVILEGED ACCESS FIELDS Id INTO TABLE @DATA(lp).',
        '    SELECT FROM yjbv_poc_dcl_t FIELDS id INTO TABLE @DATA(lb).',
        '    out->write( |R dcl={ lines( lt ) } privileged={ lines( lp ) } base={ lines( lb ) }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'R dcl=2 privileged=3 base=3', espera: "com a role `where Kind = 'A'` ativa: 2 de 3. Trocando a role para `Kind = 'B'` pelo mesmo deploy: dcl=1 (medido). ANTES de existir DCL alguma, a mesma view #CHECK devolve dcl=3 — ausência de role não bloqueia." },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'readTable',
      descricao: 'a role existe no diretório de objetos, visto de outra LUW (SOAP RFC)',
      assert: { readTable: { tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'DCLS'", "AND OBJ_NAME = 'YJBV_POC_DCL'"] }, espera: '1 linha: PGMID=\'R3TR\', OBJECT=\'DCLS\', DEVCLASS=\'$TMP\' (medido). Estado ativo: getObject → adtcore:version="active".' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    {
      contem: 'MappingRole',
      causa: 'o fonte não tem `@MappingRole: true` — ACM_SYNTAX 130 "Zugriffsrollen müssen Annotation @MappingRole haben", com W EU 202 e activationExecuted="false"',
      correcao: 'anotar `@MappingRole: true` acima do `define role`. A versão ativa anterior continua valendo até a ativação passar (medido 2026-08-28)',
    },
    {
      contem: 'grant select on',
      causa: 'a view do `grant select on` não existe, não está ativa, ou o campo da condição não é elemento dela',
      correcao: 'ativar a CDS primeiro (dependência) e usar os nomes dos ELEMENTOS da view, não os campos da tabela base',
    },
  ],
  desmentidos: [
    {
      crenca: 'CDS com `@AccessControl.authorizationCheck: #CHECK` e nenhuma DCL não devolve linha nenhuma',
      fato: 'devolve TUDO: a view #CHECK sem role alguma leu 3 de 3 linhas (mesmo driver que, com a role, leu 2). Ausência de DCL não é negação — quem não tem role não é filtrado',
      medido: { data: '2026-08-28', sistema: 'S4H' },
    },
    {
      crenca: '`#NOT_REQUIRED` na CDS desliga a DCL',
      fato: 'não desliga: com a mesma role ativa, a view reativada como #NOT_REQUIRED continuou filtrando 2 de 3. O que a anotação muda é a exigência de haver role, não a aplicação de uma que exista',
      medido: { data: '2026-08-28', sistema: 'S4H' },
    },
  ],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'DCLS'", `AND OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (PGMID=\'R3TR\', DEVCLASS do pacote). Estado ativo: getObject → adtcore:version="active". Efeito: SELECT na view protegida pelo driver, contra WITH PRIVILEGED ACCESS.',
    medido: true,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<dcl:dclSource xmlns:dcl="http://www.sap.com/adt/acm/dclsources" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="DCLS/DL" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</dcl:dclSource>`;
  },
};
