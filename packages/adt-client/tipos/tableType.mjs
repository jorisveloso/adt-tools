// tipos/tableType.mjs — TTYP/DA, table type (tipo de tabela do dicionário). Forma `xml`. (SPIKE 2026-08-28, S4H 758)
// XML puro, sem /source/main (medido: GET …/source/main → 404). O molde veio do GET de objetos padrão
// (STRING_TABLE, BAPIRET2_T, FINST_PRED_VBAK1, ZEXAME_T_CUST) com Accept application/vnd.sap.adt.tabletype.v1+xml —
// o único que responde (tabletypes.v1/v2 dão 406; é "tabletype", singular). Fluxo `deployBody` genérico.
import { XML_PREF, pkgRef, esc, pad0 } from './_xml.mjs';

// def: { rowType?: 'YJBV_POC_ST' (estrutura/tabela/DE do dicionário) | dataType?: 'STRING'|'CHAR'|… (tipo ABAP predefinido),
//        length?, decimals?, accessType?: 'standard'|'sorted'|'hashed'|'index',
//        keyComponents?: ['ID', …] (chave por componentes) — sem isso a chave é a padrão (standard, nonUnique),
//        unique?: boolean (default: true quando há keyComponents fora do standard; false no standard) }
export function buildTableTypeBody(name, pkg, description, def = {}) {
  const N = String(name).toUpperCase();
  const dict = Boolean(def.rowType);
  const typeKind = dict ? 'dictionaryType' : 'predefinedAbapType';
  const typeName = dict ? esc(String(def.rowType).toUpperCase()) : '';
  const dataType = esc(dict ? (def.dataType || 'STRU') : (def.dataType || 'STRING'));
  const len = pad0(def.length ?? 0, 6), dec = pad0(def.decimals ?? 0, 6);
  const access = esc(def.accessType || 'standard');
  const comps = def.keyComponents || [];
  const unique = def.unique ?? (comps.length > 0 && access !== 'standard');
  const kind = unique ? 'unique' : 'nonUnique';
  const pk = comps.length
    ? `<ttyp:definition>keyComponents</ttyp:definition><ttyp:kind>${kind}</ttyp:kind><ttyp:components>${comps.map((c) => `<ttyp:component ttyp:name="${esc(String(c).toUpperCase())}"/>`).join('')}</ttyp:components><ttyp:alias/>`
    : `<ttyp:definition>standard</ttyp:definition><ttyp:kind>${kind}</ttyp:kind><ttyp:components/><ttyp:alias/>`;
  return `${XML_PREF}<ttyp:tableType xmlns:ttyp="http://www.sap.com/dictionary/tabletype" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="TTYP/DA" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}<ttyp:rowType><ttyp:typeKind>${typeKind}</ttyp:typeKind><ttyp:typeName>${typeName}</ttyp:typeName><ttyp:builtInType><ttyp:dataType>${dataType}</ttyp:dataType><ttyp:length>${len}</ttyp:length><ttyp:decimals>${dec}</ttyp:decimals></ttyp:builtInType><ttyp:rangeType/></ttyp:rowType><ttyp:initialRowCount>00000</ttyp:initialRowCount><ttyp:accessType>${access}</ttyp:accessType><ttyp:primaryKey>${pk}</ttyp:primaryKey><ttyp:secondaryKeys><ttyp:allowed>notSpecified</ttyp:allowed></ttyp:secondaryKeys></ttyp:tableType>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'tableType', codigo: 'TTYP', adtType: 'TTYP/DA',
  descricao: 'table type',
  sinonimos: ['tabletype', 'table type', 'tipo de tabela', 'tipotabela', 'ttyp'],
  coll: '/sap/bc/adt/ddic/tabletypes',
  ct: 'application/vnd.sap.adt.tabletype.v1+xml',
  source: false,
  forma: 'xml',
  nomeacao: { max: 30, fonte: 'documentação SAP (DDIC); não medido' },
  oQueFaz: 'Tipo de tabela do dicionário (TTYP): tabela interna tipada — linha (estrutura/DE ou tipo predefinido), acesso (standard/sorted/hashed) e chave. É o que assinaturas de FM/classe e parâmetros TABLES tipados referenciam.',
  comoTrata: 'XML puro `ttyp:tableType`: create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody). Linha de dicionário = typeKind dictionaryType + typeName + dataType STRU; tipo predefinido = predefinedAbapType + dataType (STRING…); chave por componentes = definition keyComponents + lista de ttyp:component.',
  spike: { data: '2026-08-28', sistema: 'S4H', release: '758' },  // create + PUT de alteração + activate + delete, 9/9 PASS
  releases: { medidos: ['758'] },
  guardRails: [
    'Accept/Content-Type é application/vnd.sap.adt.tabletype.v1+xml (SINGULAR) — o plural "tabletypes" dá 406 e parece objeto inexistente',
    'não tem /source/main (404): a definição é o XML; PUT do body roda sempre, como nos outros XML-body',
    'comprimentos zero-padded: 6 dígitos (length/decimals), 5 no initialRowCount',
    'alterar acesso/chave de um table type ATIVO funciona pelo mesmo deploy (PUT sobre o existente): standard → sorted + keyComponents ativou sem mensagem — medido 2026-08-28',
  ],
  canais: ['adt', 'classrun', 'soapRfc'],
  origem: ['spike 2026-08-28 (fila item 8): discovery do s4h + GET de STRING_TABLE/BAPIRET2_T/FINST_PRED_VBAK1/ZEXAME_T_CUST', 'docs/pesquisa-tipos-adt-nao-cobertos.md § TTYP (nenhum cliente open source cria TTYP)'],
  dependencias: [{ tipo: 'structure', papel: 'tipo de linha, quando é estrutura do dicionário', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_TT', pkg: '$TMP', description: 'POC table type',
      def: { rowType: 'YJBV_POC_TT_LINHA', accessType: 'standard' },
    },
    nota: 'Linha = estrutura YJBV_POC_TT_LINHA (id numc(10), texto char(80)) criada antes pelo módulo structure. Variante sorted com chave: def { rowType, accessType: "sorted", keyComponents: ["ID"] }.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o table type está ativo com a linha e o acesso pedidos? readTable em DD40L (ROWTYPE, ACCESSMODE, KEYDEF, KEYKIND)',
      assert: { readTable: { tabela: 'DD40L', campos: ['TYPENAME', 'AS4LOCAL', 'ROWTYPE', 'ROWKIND', 'ACCESSMODE', 'KEYDEF', 'KEYKIND'], where: ["TYPENAME = 'YJBV_POC_TT'"] }, espera: "1 linha, AS4LOCAL='A', ROWTYPE='YJBV_POC_TT_LINHA', ROWKIND='S', ACCESSMODE='T', KEYDEF='D', KEYKIND='N' (medido). Depois de alterar para sorted+keyComponents: ACCESSMODE='S', KEYDEF='K', KEYKIND='U', e DD42S traz KEYFDPOS='0001' KEYFIELD='ID'" },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'driver declara uma tabela interna do tipo (prova ativação em compile), faz APPEND e escreve lines()',
      abap: [
        'CLASS yjbv_poc_cl_tt DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_tt IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    DATA lt TYPE yjbv_poc_tt.',
        "    APPEND VALUE #( id = '0000000001' texto = 'um' ) TO lt.",
        "    APPEND VALUE #( id = '0000000002' texto = 'dois' ) TO lt.",
        '    out->write( |TT lines={ lines( lt ) } first={ lt[ 1 ]-texto }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'TT lines=2 first=um', espera: 'driver ativa (o table type existe, está ativo e a linha é a estrutura) e escreve a contagem' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'variante sorted com chave: READ TABLE … WITH TABLE KEY só compila se a chave declarada existe no tipo — é o assert de que keyComponents chegou',
      abap: [
        'CLASS yjbv_poc_cl_tt2 DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_tt2 IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    DATA lt TYPE yjbv_poc_tt.',
        "    INSERT VALUE #( id = '0000000002' texto = 'dois' ) INTO TABLE lt.",
        "    INSERT VALUE #( id = '0000000001' texto = 'um' ) INTO TABLE lt.",
        "    READ TABLE lt INTO DATA(ls) WITH TABLE KEY id = '0000000002'.",
        '    out->write( |TT2 lines={ lines( lt ) } primeiro={ lt[ 1 ]-id } achado={ ls-texto } subrc={ sy-subrc }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'TT2 lines=2 primeiro=0000000001 achado=dois subrc=0', espera: 'sorted ordena por ID no INSERT (primeiro=0000000001) e a chave única acha a linha — medido' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 406, causa: 'Accept "tabletypes" (plural) ou v2 — o media type real é application/vnd.sap.adt.tabletype.v1+xml', correcao: 'usar o ct do módulo; ler o discovery (coleção ddic/tabletypes, accept tabletype.v1+xml)' },
  ],
  desmentidos: [
    {
      crenca: 'TTYP não é criável por ADT REST — só aparece sob o wrapper /vit/ nos clientes open source',
      fato: 'o s4h 758 tem a coleção nativa /sap/bc/adt/ddic/tabletypes (+ /validation), category ttypda, e o GET devolve ttyp:tableType — os clientes open source é que nunca a implementaram',
      medido: { data: '2026-08-28', sistema: 'S4H' },
    },
  ],
  prova: (name) => ({
    tabela: 'DD40L', campos: ['TYPENAME', 'AS4LOCAL', 'ROWTYPE', 'ROWKIND', 'ACCESSMODE', 'KEYDEF', 'KEYKIND'], where: [`TYPENAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, AS4LOCAL = 'A', ROWTYPE = a estrutura (ROWKIND 'S') e ACCESSMODE do def: standard = 'T', sorted = 'S', hashed = 'H'. Linha de tipo predefinido: ROWTYPE/ROWKIND VAZIOS e DATATYPE com o código curto ('STRG' para STRING).",
    medido: true,
  }),
  body: buildTableTypeBody,
};
