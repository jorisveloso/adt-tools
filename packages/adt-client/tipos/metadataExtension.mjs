// tipos/metadataExtension.mjs — DDLX/EX, metadata extension. Forma `source`. (2026-08-05)
// Coleção e media type vieram do /sap/bc/adt/discovery do próprio sistema de dev, não de memória:
// <app:collection href=".../ddic/ddlx/sources"> com <app:accept>application/vnd.sap.adt.ddic.ddlx.v1+xml</app:accept>.
// Source-based; o `annotate entity` vai no /source/main. É ela que dá a cara de SM30: o @UI.facet
// LINEITEM_REFERENCE embute a lista do filho dentro da object page do singleton.
// Shell conferido contra o GET de uma DDLX ativa no sistema de dev.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'metadataExtension', codigo: 'DDLX', adtType: 'DDLX/EX',
  nomeacao: { max: 40, fonte: 'typestructure do s4h 758 (OBJNAME_MAXLENGTH 40, fila 26); não medido por rejeição' },
  descricao: 'metadata extension',
  sinonimos: ['metadata extension', 'extensao de metadados'],
  coll: '/sap/bc/adt/ddic/ddlx/sources',
  ct: 'application/vnd.sap.adt.ddic.ddlx.v1+xml',
  source: true,
  forma: 'source',
  oQueFaz: 'Metadata extension (DDLX): anotações @UI sobre uma CDS (`annotate entity …`), separadas da view. É o que desenha o app Fiori Elements.',
  comoTrata: 'Shell `ddlx:ddlxSource type="DDLX/EX"` → lock → PUT /source/main com o `annotate entity` → unlock → activate (deploySource).',
  spike: { data: '2026-08-05', sistema: 'DEV' },
  releases: { medidos: [] },
  guardRails: ['a CDS anotada precisa de @Metadata.allowExtensions: true'],
  canais: ['adt', 'odata', 'wdi5'],
  origem: ['skill adt-objetos § DDLX/EX — metadata extension', 'skill adt-objetos § App de manutenção tipo SM30'],
  dependencias: [{ tipo: 'cds', papel: 'a entidade anotada (com @Metadata.allowExtensions: true)', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_WDI5_X', pkg: '$TMP', description: 'POC anotações UI',
      source: [
        '@Metadata.layer: #CUSTOMER',
        'annotate entity YJBV_POC_WDI5_C with {',
        "  @UI.lineItem: [{ position: 10 }] @UI.selectionField: [{ position: 10 }]",
        '  TableName;',
        '  @UI.lineItem: [{ position: 20 }]',
        '  TableClass;',
        '}',
      ].join('\n'),
    },
    nota: 'Ilustrativo sobre a CDS do spike wdi5. Anotações @UI só têm efeito num app (categoria 0) — o assert é visual/wdi5, não por tabela.',
  },
  testes: [
    {
      canal: 'wdi5',
      descricao: 'não tem teste isolado: prova-se pelo app — no preview FE (…/odatav4/feap) as colunas anotadas aparecem na tabela e o campo de seleção no FilterBar (harness em examples/wdi5)',
      assert: { wdi5: 'FilterBar com o campo anotado; tabela com as colunas na ordem das positions', espera: 'as anotações chegaram ao app' },
      medido: [],
    },
    {
      canal: 'odata',
      descricao: 'o $metadata da SRVB traz as anotações UI da DDLX no bloco <Annotations>',
      assert: { http: 'GET $metadata → contém UI.LineItem para a entidade', espera: 'anotação presente' },
      medido: [],
    },
  ],
  erros: [],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'DDLX'", `OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (existe). Estado ativo: getObject → adtcore:version="active". Efeito: $metadata / app.',
    medido: false,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<ddlx:ddlxSource xmlns:ddlx="http://www.sap.com/adt/ddic/ddlxsources" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="DDLX/EX" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</ddlx:ddlxSource>`;
  },
};
