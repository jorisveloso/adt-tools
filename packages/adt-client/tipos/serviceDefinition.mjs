// tipos/serviceDefinition.mjs — SRVD/SRV, service definition RAP. Forma `source`. (SPIKE 2026-07-27, POC validada no $TMP)
// Media type ddic.srvd.v1+xml; shell <srvd:srvdSource srvd:srvdSourceType="S"> — o "S" (=Definition) é
// OBRIGATÓRIO (senão 400 "Service-Definitionstyp vazio") + PUT /source/main com `define service X { expose <entity>; }`.
import { XML_PREF, pkgRef, esc } from './_xml.mjs';

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'serviceDefinition', codigo: 'SRVD', adtType: 'SRVD/SRV',
  nomeacao: { max: 40, fonte: 'typestructure do s4h 758 (OBJNAME_MAXLENGTH 40, fila 26); não medido por rejeição' },
  descricao: 'service definition',
  sinonimos: ['service definition', 'definicao de servico'],
  coll: '/sap/bc/adt/ddic/srvd/sources',
  ct: 'application/vnd.sap.adt.ddic.srvd.v1+xml',
  source: true,
  forma: 'source',
  oQueFaz: 'Service definition RAP (SRVD): `define service X { expose <cds>; }` — o que o service binding publica como OData.',
  comoTrata: 'Shell `srvd:srvdSource srvdSourceType="S"` → lock → PUT /source/main → unlock → activate (deploySource).',
  spike: { data: '2026-07-27', sistema: 'DEV', revalidacoes: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }] },
  releases: { medidos: ['758'] },
  guardRails: [
    'srvd:srvdSourceType="S" é obrigatório no shell (senão 400 "Service-Definitionstyp vazio")',
    'write (CRUD) expõe as projections; read-only expõe a interface view entity direto — sem projection, sem BDEF',
  ],
  canais: ['adt', 'odata'],
  origem: ['skill adt-objetos § SRVD/SRV — service definition', 'docs/receita-wdi5-fiori.md'],
  dependencias: [{ tipo: 'cds', papel: 'a(s) entidade(s) expostas', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_WDI5_S', pkg: '$TMP', description: 'POC service definition read-only',
      source: [
        "@EndUserText.label: 'POC tabelas do dicionário'",
        'define service YJBV_POC_WDI5_S {',
        '  expose YJBV_POC_WDI5_C as Tables;',
        '}',
      ].join('\n'),
    },
    nota: 'Reconstituído do spike wdi5 (S4H 758, 2026-08-26): SRVD read-only sobre a CDS, publicada por SRVB categoria 0. Sufixos exatos não preservados.',
  },
  testes: [
    {
      canal: 'odata',
      descricao: 'não tem teste isolado: prova-se pelo consumidor — SRVB publicada sobre ela responde $metadata com a entidade exposta (Tables)',
      assert: { http: 'GET <odataV4RuntimeUrl>/$metadata → 200 com EntityType Tables', espera: 'a entidade exposta aparece no modelo' },
      medido: [{ data: '2026-08-26', sistema: 'S4H', release: '758' }, { data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 400, contem: 'Service-Definitionstyp', causa: 'shell sem srvd:srvdSourceType="S"', correcao: 'o createBody do módulo já manda o "S"; conferir se um body customizado o omitiu' },
  ],
  desmentidos: [],
  prova: (name) => ({
    tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'SRVD'", `OBJ_NAME = '${String(name).toUpperCase()}'`],
    espera: '1 linha (existe). Estado ativo: getObject → adtcore:version="active". Função: $metadata pela SRVB.',
    medido: false,
  }),
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    return `${XML_PREF}<srvd:srvdSource xmlns:srvd="http://www.sap.com/adt/ddic/srvdsources" xmlns:adtcore="http://www.sap.com/adt/core" srvd:srvdSourceType="S" adtcore:name="${N}" adtcore:type="SRVD/SRV" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT">${pkgRef(pkg)}</srvd:srvdSource>`;
  },
};
