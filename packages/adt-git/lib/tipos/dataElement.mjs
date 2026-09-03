// tipos/dataElement.mjs — DTEL/DE, elemento de dados. Forma `xml` (a definição É o body; sem /source/main).
//
// ⚠️ O POST de create grava só a parte TÉCNICA (tipo/tamanho) e DESCARTA os textos (adtcore:description
// e os 4 *FieldLabel). Só o PUT com lock persiste texto — por isso o PUT é SEMPRE executado, inclusive
// logo após o create. Sem ele, o DE nasce sem descrição e sem labels (que são os cabeçalhos de coluna
// no ALV). Falha silenciosa: create devolve 201 e o objeto ativa. É o fluxo `deployBody` genérico.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

// def do DE: { kind:'predefined'|'domain', dataType?, length?, decimals?, domain?, labels?{short,medium,long,heading} }
export function buildDataElementBody(name, pkg, description, def = {}) {
  const N = String(name).toUpperCase();
  const kind = def.kind === 'domain' ? 'domain' : 'predefinedAbapType';
  const typeName = def.kind === 'domain' ? esc(def.domain || '') : '';
  const dataType = def.kind === 'domain' ? '' : esc(def.dataType || 'CHAR');
  const len = String(def.length ?? 0).padStart(6, '0');
  const dec = String(def.decimals ?? 0).padStart(6, '0');
  const L = def.labels || {};
  const lbl = (v) => esc(v || description || N);
  return `${XML_PREF}<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="DTEL/DE" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}<dtel:dataElement xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements"><dtel:typeKind>${kind}</dtel:typeKind><dtel:typeName>${typeName}</dtel:typeName><dtel:dataType>${dataType}</dtel:dataType><dtel:dataTypeLength>${len}</dtel:dataTypeLength><dtel:dataTypeDecimals>${dec}</dtel:dataTypeDecimals><dtel:shortFieldLabel>${lbl(L.short)}</dtel:shortFieldLabel><dtel:shortFieldLength>10</dtel:shortFieldLength><dtel:shortFieldMaxLength>10</dtel:shortFieldMaxLength><dtel:mediumFieldLabel>${lbl(L.medium)}</dtel:mediumFieldLabel><dtel:mediumFieldLength>20</dtel:mediumFieldLength><dtel:mediumFieldMaxLength>20</dtel:mediumFieldMaxLength><dtel:longFieldLabel>${lbl(L.long)}</dtel:longFieldLabel><dtel:longFieldLength>40</dtel:longFieldLength><dtel:longFieldMaxLength>40</dtel:longFieldMaxLength><dtel:headingFieldLabel>${lbl(L.heading)}</dtel:headingFieldLabel><dtel:headingFieldLength>55</dtel:headingFieldLength><dtel:headingFieldMaxLength>55</dtel:headingFieldMaxLength><dtel:searchHelp/><dtel:searchHelpParameter/><dtel:setGetParameter/><dtel:defaultComponentName/><dtel:deactivateInputHistory>false</dtel:deactivateInputHistory><dtel:changeDocument>false</dtel:changeDocument><dtel:leftToRightDirection>false</dtel:leftToRightDirection><dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering></dtel:dataElement></blue:wbobj>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'dataElement', codigo: 'DTEL', adtType: 'DTEL/DE',
  descricao: 'data element',
  sinonimos: ['elemento de dados', 'data element', 'de'],
  coll: '/sap/bc/adt/ddic/dataelements',
  ct: 'application/vnd.sap.adt.dataelements.v2+xml',
  source: false,
  forma: 'xml',
  nomeacao: { max: 30, fonte: 'documentação SAP (DDIC); não medido' },
  oQueFaz: 'Elemento de dados do dicionário (DTEL): tipo técnico (predefinido ou por domínio) + os 4 field labels que viram cabeçalho de coluna no ALV.',
  comoTrata: 'Não tem /source/main — o XML é a definição. create(body) se faltar → lock → PUT(body) sempre → unlock → activate (deployBody). O porquê do PUT sempre está em guardRails.',
  spike: { data: null, sistema: 'DEV', revalidacoes: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'PUT do body roda sempre, inclusive logo após o create — senão o DE nasce sem descrição e sem labels (falha silenciosa: 201 e ativa; já contaminou 16 DEs)',
    'alterar DE usado como campo-CHAVE de tabela ativa exige conversão (EU(899)/EU(886)) — feche tipo e tamanho ANTES de criar as tabelas',
  ],
  canais: ['adt', 'classrun', 'soapRfc'],
  origem: ['skill adt-objetos § DTEL/DE — data element', 'skill adt-objetos § O POST de create grava só a parte TÉCNICA'],
  dependencias: [{ tipo: 'domain', papel: 'quando kind = domain', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_DE_STATUS', pkg: '$TMP', description: 'Status POC',
      def: { kind: 'predefined', dataType: 'CHAR', length: 2, labels: { short: 'Status', medium: 'Status POC', long: 'Status do registro POC', heading: 'Status' } },
    },
    nota: 'Os labels são a parte que o create descarta — o teste deles (DD04T) é o que pega a falha silenciosa.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'os 4 labels persistiram? readTable em DD04T (textos do DE) no idioma da sessão — é o assert que pega o create-sem-PUT',
      assert: { readTable: { tabela: 'DD04T', campos: ['ROLLNAME', 'DDLANGUAGE', 'SCRTEXT_S', 'SCRTEXT_M', 'SCRTEXT_L', 'REPTEXT'], where: ["ROLLNAME = 'YJBV_POC_DE_STATUS'"] }, espera: "SCRTEXT_S/M/L e REPTEXT preenchidos com os labels do exemplo, DDLANGUAGE = 'P' (medido — o idioma da sessão chegou ao DE, ao contrário da MSAG)" },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'classrun',
      descricao: 'driver declara variável do tipo do DE e descreve tipo/tamanho (prova ativação e a parte técnica)',
      abap: [
        'CLASS yjbv_poc_cl_de DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_de IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        '    DATA lv TYPE yjbv_poc_de_status.',
        '    DESCRIBE FIELD lv TYPE DATA(lv_tipo) LENGTH DATA(lv_len) IN CHARACTER MODE.',
        '    out->write( |DE tipo={ lv_tipo } len={ lv_len }| ).',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'DE tipo=C len=2', espera: 'tipo e tamanho do exemplo' },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { contem: 'EU(899)', causa: 'DE usado como campo-chave de tabela ativa mudou de tamanho/tipo — exige conversão da tabela', correcao: 'quickfix "Activate and adjust dependent objects" (Eclipse/SE14); por ADT, POST /refactorings exige o parâmetro step. Evitar: fechar o DE antes das tabelas' },
    { contem: 'must be converted', causa: 'idem EU(886): tabela dependente precisa de conversão', correcao: 'idem' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'DD04L', campos: ['ROLLNAME', 'AS4LOCAL', 'DATATYPE', 'LENG', 'DOMNAME'], where: [`ROLLNAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, AS4LOCAL = 'A', DATATYPE/LENG do exemplo. Labels: DD04T (ver testes).",
    medido: true,
  }),
  body: buildDataElementBody,
};
