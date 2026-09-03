// tipos/transformation.mjs — XSLT/VT, transformação (XSLT program e Simple Transformation). Forma `custom`
// porque o CREATE carrega o subtipo (`trans:transformationType`) — a lib o deduz do fonte. (SPIKE 2026-08-30, S4H 758)
//
// A pesquisa (docs/pesquisa-tipos-adt-nao-cobertos.md § XSLT) só achou leitura/PUT via `sourceUri`; o s4h
// desmentiu: `POST /sap/bc/adt/xslt/transformations` com `trans:transformation` cria, `PUT /source/main`
// (text/plain) grava o XML, a ativação genérica ativa, e `CALL TRANSFORMATION` no driver executa —
// medido com `XSLTProgram` (`<POC>abc-JBV</POC>`) e `SimpleTransformation` (`<POC>abc</POC>`).
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

export const TIPOS_TRANSFORMACAO = Object.freeze(['XSLTProgram', 'SimpleTransformation']);

/** Deduz o subtipo pelo fonte: `<?sap.transform simple?>` é ST; o resto é XSLT. Puro. */
export const tipoDeTransformacao = (source) => (/<\?sap\.transform\s+simple\s*\?>/i.test(String(source ?? '')) ? 'SimpleTransformation' : 'XSLTProgram');

const XSLT_POC = `<xsl:transform version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:strip-space elements="*"/>
  <xsl:template match="/">
    <POC><xsl:value-of select="//ROOT"/>-JBV</POC>
  </xsl:template>
</xsl:transform>`;

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'transformation', codigo: 'XSLT', adtType: 'XSLT/VT',
  descricao: 'transformação (XSLT / simple transformation)',
  sinonimos: ['xslt', 'transformação', 'transformacao', 'transformation', 'simple transformation', 'st', 'xslt program', 'xsl'],
  coll: '/sap/bc/adt/xslt/transformations',
  ct: 'application/vnd.sap.adt.transformations+xml',
  source: true,
  forma: 'custom',
  nomeacao: { max: 30, fonte: 'O2XSLTDESC-XSLTDESC CHAR 30; limite não medido por 4xx' },
  oQueFaz: 'Transformação (XSLT/VT, a STRANS): o programa XSLT ou a Simple Transformation que `CALL TRANSFORMATION` executa entre ABAP e XML — serialização, desserialização, mapeamento. Um objeto, dois subtipos, escolhidos no create.',
  comoTrata: 'Deduz o subtipo pelo fonte (`<?sap.transform simple?>` → SimpleTransformation; senão XSLTProgram) e o fixa no shell `trans:transformation` (`trans:transformationType`) → lock → PUT /source/main text/plain com o XML → unlock → activate. Idempotente: existente só recebe PUT + activate. A prova de uso é `CALL TRANSFORMATION <nome> SOURCE root = … RESULT XML …` num driver classrun.',
  spike: { data: '2026-08-30', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    'o subtipo mora no CREATE (`trans:transformationType`): passe `transformationType` para forçar, senão a lib deduz do fonte — um fonte ST num objeto criado como XSLTProgram é erro de ativação, não de create',
    'o fonte é o documento XML inteiro (PUT text/plain); ST precisa do prólogo `<?sap.transform simple?>`',
    'readTable de O2XSLTDESC SEM `campos` estoura o RFC_READ_TABLE (DATA_BUFFER_EXCEEDED) — a prova por tabela é a TADIR',
  ],
  canais: ['adt', 'classrun'],
  origem: ['spike 2026-08-30 (fila item 20): GET de ID (identity) no s4h 758 + create/PUT/activate/CALL TRANSFORMATION/delete de YJBV_POC_XSLT e YJBV_POC_ST', 'docs/receita-xslt-enho.md', 'docs/pesquisa-tipos-adt-nao-cobertos.md § XSLT (desmentida)', 'docs/ideias.md I19'],
  dependencias: [],
  exemplo: {
    opts: { name: 'YJBV_POC_XSLT', pkg: '$TMP', description: 'POC XSLTProgram', source: XSLT_POC },
    nota: "Transformação do spike (S4H 758, 2026-08-30): `CALL TRANSFORMATION yjbv_poc_xslt SOURCE root = 'abc' RESULT XML lv` → `<POC>abc-JBV</POC>`. A ST irmã (`<?sap.transform simple?>` + `tt:root name=\"ROOT\"` + `tt:value ref=\"ROOT\"`) devolveu `<POC>abc</POC>` pelo mesmo caminho.",
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'driver executa a transformação criada — o resultado XML é o assert; exceção de transformação vem capturada, sem dump',
      abap: [
        'CLASS yjbv_poc_cl_xslt DEFINITION PUBLIC FINAL CREATE PUBLIC.',
        '  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.',
        'ENDCLASS.',
        'CLASS yjbv_poc_cl_xslt IMPLEMENTATION.',
        '  METHOD if_oo_adt_classrun~main.',
        "    DATA: lv_in TYPE string VALUE 'abc', lv_x TYPE string.",
        '    TRY. CALL TRANSFORMATION yjbv_poc_xslt SOURCE root = lv_in RESULT XML lv_x. out->write( |XSLT_OUT { lv_x }| ).',
        '      CATCH cx_root INTO DATA(lx). out->write( |XSLT_EXC { lx->get_text( ) }| ). ENDTRY.',
        '  ENDMETHOD.',
        'ENDCLASS.',
      ].join('\n'),
      assert: { console: 'XSLT_OUT <?xml version="1.0" encoding="utf-16"?><POC>abc-JBV</POC>', espera: 'o RESULT XML string vem com prólogo utf-16 (e BOM) e o elemento gerado pelo template (medido)' },
      medido: [{ data: '2026-08-30', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'readTable',
      descricao: 'a transformação existe no diretório de objetos, vista de outra LUW',
      assert: { readTable: { tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'XSLT'", "AND OBJ_NAME = 'YJBV_POC_XSLT'"] }, espera: "1 linha R3TR XSLT em $TMP (medido); getObject → adtcore:version=\"active\" e trans:transformationType do create" },
      medido: [{ data: '2026-08-30', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { contem: 'DATA_BUFFER_EXCEEDED', causa: 'readTable de O2XSLTDESC sem `campos` — a linha passa dos 512 bytes do RFC_READ_TABLE', correcao: 'pedir campos (XSLTDESC, …) ou provar pela TADIR (OBJECT = XSLT)' },
    { contem: 'transformationType', causa: 'valor fora de XSLTProgram | SimpleTransformation no create', correcao: 'deixar a lib deduzir do fonte, ou passar um dos dois valores' },
  ],
  desmentidos: [
    {
      crenca: 'XSLT não é criável por ADT REST — só leitura/PUT pelo sourceUri do nodestructure (pesquisa 2026-08-28)',
      fato: 'POST em /sap/bc/adt/xslt/transformations com trans:transformation cria (200), nos dois subtipos; PUT do fonte, ativação genérica e CALL TRANSFORMATION funcionam; DELETE com lockHandle apaga (200, TADIR vazia)',
      medido: { data: '2026-08-30', sistema: 'S4H' },
    },
  ],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'XSLT'", `AND OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (R3TR XSLT, DEVCLASS do pacote). Estado ativo: getObject → adtcore:version="active". Efeito: CALL TRANSFORMATION no driver.',
    medido: true,
  }),
  validar({ name, source, transformationType }) {
    if (!source) throw new Error(`transformation "${name}": exige { source } — o XML da transformação`);
    if (transformationType && !TIPOS_TRANSFORMACAO.includes(transformationType)) throw new Error(`transformation "${name}": transformationType "${transformationType}" — use ${TIPOS_TRANSFORMACAO.join(' | ')}`);
  },
  createBody(name, pkg, description, { transformationType = 'XSLTProgram' } = {}) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<trans:transformation xmlns:trans="http://www.sap.com/adt/transformation" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="XSLT/VT" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT" trans:transformationType="${transformationType}">${pkgRef(pkg)}</trans:transformation>`;
  },
  async deploy(ctx, conexao, { name, source, transformationType, pkg = '$TMP', description = '', corrNr }) {
    const tipo = transformationType ?? tipoDeTransformacao(source);
    const s = await conexao.sessao();
    const existing = await ctx.getObject(s, 'transformation', name);
    if (!existing.exists) await ctx.createShell(s, 'transformation', name, { pkg, description, corrNr, body: this.createBody(name, pkg, description, { transformationType: tipo }) });
    const h = await ctx.lock(s, 'transformation', name);
    try { await ctx.setSource(s, 'transformation', name, source, h, corrNr); }
    finally { await ctx.unlock(s, 'transformation', name, h); }
    const act = await ctx.activate(conexao, 'transformation', name);
    return { created: !existing.exists, activated: act.ok, activate: act, transformationType: tipo };
  },
};
