// tipos/numberRangeObject.mjs — NROB/NRO, o objeto de numeração (o que a SNRO mantém).
// Forma `json`, `ativacaoJson: 'mesmaSessao'`. (SPIKE 2026-09-01, S4H 758 — fila 44; forma genérica
// extraída na fila 60/I56, depois de comparar com APLO e SAJC — ver tipos/_esquema.mjs § FORMAS.json)
//
// É o SEGUNDO tipo "blue" (ABAP File Formats) da lib, depois do APLO da fila 29: o fonte é JSON,
// validado pelo `nrob-v1.json` que o próprio sistema serve em `…/objects/$schema`.
//
// O fluxo é PARECIDO com o do APLO, e os dois desvios que o diferenciam custaram spike:
//   1. **o shell do create vai `adtcore:version="inactive"`**. Com `"active"` — que é o que o APLO
//      pede — o create devolve **400 `NR 870 "O objeto não existe"`** E CRIA O OBJETO ASSIM MESMO
//      (TADIR gravada, GET 200 `inactive`, lock/PUT/activate seguem funcionando). O 400 é do
//      handler tentando ler a versão ATIVA, que só nasce na ativação; quem trata o 400 como falha
//      deixa objeto órfão para trás. Medido nos dois sentidos: `inactive` (e o body sem `version`)
//      → 201 limpo.
//   2. **ele ATIVA, e é a ativação que grava a TNRO.** O APLO nasce ativo e o PUT do fonte já
//      persiste; aqui o PUT devolve 200 com o JSON e a TNRO segue VAZIA até o activate.
//
// Comum ao APLO (a parte que é da família AFF, não deste tipo): create em
// `application/vnd.sap.adt.blues.v1+xml` (plural — e o 415 do ct errado NÃO nomeia o suportado) e
// PUT de `/source/main` em `application/json`.
//
// O QUE ELE É, DO LADO DO DADO: a linha da TNRO — o catálogo que `NUMBER_RANGE_INTERVAL_UPDATE`
// exige para aceitar intervalos e que `NUMBER_GET_NEXT` consulta para tirar o próximo número.
// O objeto NÃO traz intervalo: intervalo é dado de mandante (NRIV), e vai por driver (ver `testes`).

import { XML_PREF, pkgRef, esc } from './_xml.mjs';

const CT_CREATE = 'application/vnd.sap.adt.blues.v1+xml';

const BUFFERING = ['mainBuffer', 'parallel', 'none'];

/**
 * O fonte JSON do objeto de numeração (puro), na forma do `nrob-v1.json` do AFF.
 * `dominio` é o **domínio** que dá o comprimento do número (NUMC/CHAR, 1 a 20) — não um data element.
 * `originalLanguage` é minúsculo (o schema exige `^[a-z]+$`), como no APLO.
 */
export function buildNrobSource(description, {
  dominio, percentual = 10.0, subType = '', ateAno = false, rolling = false, prefixo = false,
  buffering = 'none', numerosBufferizados = 0, transacao, idioma = 'pt',
} = {}) {
  const configuration = { buffering, bufferedNumbers: Number(numerosBufferizados) };
  if (transacao) configuration.transactionId = String(transacao).toUpperCase();
  return `${JSON.stringify({
    formatVersion: '1',
    header: { description: String(description ?? ''), originalLanguage: String(idioma).toLowerCase() },
    interval: {
      numberLengthDomain: String(dominio ?? '').toUpperCase(),
      percentWarning: Number(percentual),
      subType: String(subType ?? '').toUpperCase(),
      untilYear: Boolean(ateAno), rolling: Boolean(rolling), prefix: Boolean(prefixo),
    },
    configuration,
  }, null, 2)}\n`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'numberRangeObject', codigo: 'NROB', adtType: 'NROB/NRO',
  descricao: 'objeto de numeração (SNRO)',
  sinonimos: ['nrob', 'snro', 'objeto de numeração', 'number range', 'range de numeração'],
  coll: '/sap/bc/adt/numberranges/objects',
  ct: CT_CREATE,
  accept: 'application/*',
  source: true,
  forma: 'json',
  ativacaoJson: 'mesmaSessao',
  nomeacao: { max: 10, fonte: 'TNRO-OBJECT CHAR 10 (DD03L, medido 2026-09-01)' },
  oQueFaz: 'Cria/altera o objeto de numeração — a linha da TNRO que NUMBER_RANGE_INTERVAL_UPDATE exige para aceitar intervalos e que NUMBER_GET_NEXT consulta. Sem ele, era SNRO (GUI).',
  comoTrata: 'create `blue:blueSource` com ct `blues.v1+xml` e **version="inactive"** → lock → PUT /source/main em application/json (o fonte AFF) → unlock → ACTIVATE (é a ativação que grava a TNRO).',
  spike: { data: '2026-09-01', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    'o shell do create leva `adtcore:version="inactive"` — com "active" o create devolve 400 (NR 870 "O objeto não existe") e CRIA o objeto assim mesmo, deixando órfão para quem tratar o 400 como falha',
    'create só com `application/vnd.sap.adt.blues.v1+xml` (plural) — o 415 do ct errado NÃO nomeia o suportado',
    'PUT do /source/main em `application/json`; `text/plain` não é o media type do fonte AFF',
    'ATIVE: ao contrário do APLO, o PUT sozinho não grava a TNRO — só o activate',
    'nome máximo 10 (TNRO-OBJECT); `numberLengthDomain` é um DOMÍNIO (NUMC/CHAR, 1 a 20), não um data element',
    'intervalo NÃO vem no objeto: é dado de mandante (NRIV) e vai por driver — `nrob.mjs` (`deployIntervalos`/`apagarIntervalos`), porque nenhum NUMBER_RANGE_* é RFC',
    'antes de apagar o objeto, apague os intervalos (`apagarIntervalos`): com NRIV o DELETE dá 400 NR 874',
  ],
  canais: ['adt', 'classrun'],
  origem: ['spike fila 44 (2026-09-01, S4H 758)', 'discovery: workspace "Number Range Management" → coleção numberranges/objects', '$schema servido pelo sistema (nrob-v1.json)', 'item 38: o desmentido de "NROB não tem coleção no on-prem"'],
  dependencias: [{ tipo: 'domain', papel: 'numberLengthDomain — dá o comprimento do número', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_A', pkg: '$TMP', description: 'POC fila 44 - number range object',
      dominio: 'NUM10', percentual: 10.0, buffering: 'none',
    },
    nota: 'o fonte JSON pode vir pronto em `source`; `dominio`/`percentual`/`buffering` são o atalho que o monta.',
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'o intervalo 01 gravado por `deployIntervalos` (nrob.mjs) e dois números tirados — o objeto só é "real" se o NUMBER_GET_NEXT andar',
      abap: [
        "// pela lib, não à mão — `buildIntervalosSource` monta o driver com os gotchas dentro:",
        "import { deployIntervalos } from 'adt-client/nrob';",
        "await deployIntervalos(conexao, {",
        "  objeto: 'YJBV_POC_A',",
        "  intervalos: [{ nr: '01', de: '0000000001', ate: '0000009999' }],",
        "  proximoDe: '01',",
        '});',
        '// o ciclo do driver: ENQUEUE → UPDATE_INIT → INTERVAL_UPDATE (com INRIV-PROCIND!) →',
        '// UPDATE_CLOSE(commit) → DEQUEUE → NUMBER_GET_NEXT.',
      ].join('\n'),
      assert: { console: 'NEXT subrc=0 num=0000000001 (e 0000000002 na 2ª chamada)', espera: 'readTable NRIV em outra LUW: intervalo 01 com NRLEVEL andado. Com objeto inexistente o UPDATE_INIT devolve OBJECT_NOT_FOUND (subrc 1)' },
      medido: [{ data: '2026-09-01', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 400, contem: 'NR', causa: 'shell do create com `adtcore:version="active"` — o handler tenta ler a versão ativa (a TNRO), que só nasce na ativação', correcao: 'mande `version="inactive"` (ou omita). ATENÇÃO: o objeto FOI criado mesmo com o 400 — confira/limpe antes de recriar' },
    { status: 415, causa: 'content-type do create diferente de `blues.v1+xml`', correcao: 'use o media type que o discovery declara na coleção — o corpo do 415 não o nomeia' },
    { status: 406, contem: 'source/main', causa: 'GET/PUT do fonte com text/plain ou com um vnd.sap.adt.* inventado', correcao: 'application/json (ou application/*) — o fonte é AFF/JSON' },
    { status: 400, contem: '874', causa: 'DELETE do objeto que ainda tem intervalo na NRIV (NR 874 "Existem intervalos para o objeto")', correcao: 'apague os intervalos antes: `apagarIntervalos(conexao, { objeto, confirm: true })` do `adt-client/nrob`' },
  ],
  desmentidos: [
    {
      crenca: 'objeto de numeração só se cria na SNRO (GUI), ou por driver com `NUMBER_RANGE_OBJECT_*` (que a pesquisa dava como o caminho)',
      fato: 'o ADT REST cria: POST `blues.v1+xml` → 201 inativo, PUT do fonte JSON, activate → linha na TNRO. E nenhum `NUMBER_RANGE_*` é RFC (item 38), então a via antiga era pior do que se pensava',
      medido: { data: '2026-09-01', sistema: 'S4H', release: '758' },
    },
    {
      crenca: 'HTTP 400 no create quer dizer que nada foi criado',
      fato: 'com `version="active"` no shell o create devolve 400 NR 870 "O objeto não existe" E o objeto existe (TADIR gravada, GET 200 inactive, lock/PUT/activate funcionam). O 400 fala da versão ativa que ainda não há, não do create',
      medido: { data: '2026-09-01', sistema: 'S4H', release: '758' },
    },
  ],
  prova: (name) => ({
    tabela: 'TNRO', campos: ['OBJECT', 'DOMLEN', 'PERCENTAGE', 'BUFFER', 'NOIVBUFFER'],
    where: [`OBJECT = '${String(name).toUpperCase()}'`],
    espera: '1 linha, DOMLEN = o domínio do fonte. A linha só aparece DEPOIS do activate; a TADIR (R3TR NROB) já existe desde o create.',
    medido: true,
  }),
  validar(opts) {
    if (!opts?.source && !opts?.dominio) {
      throw new Error('numberRangeObject exige { source } (JSON AFF) ou { dominio } (o domínio que dá o comprimento do número).');
    }
    if (opts?.percentual !== undefined && (opts.percentual < 0.1 || opts.percentual > 99.9)) {
      throw new Error(`GUARD-RAIL: percentual ${opts.percentual} fora de 0.1..99.9 (nrob-v1.json).`);
    }
    if (opts?.buffering && !BUFFERING.includes(opts.buffering)) {
      throw new Error(`GUARD-RAIL: buffering "${opts.buffering}" inválido; use ${BUFFERING.join(' | ')}.`);
    }
  },
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    // version="inactive" é o ponto: com "active" o create devolve 400 (NR 870) e cria assim mesmo.
    return `${XML_PREF}<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="NROB/NRO" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT" adtcore:version="inactive">${pkgRef(pkg)}</blue:blueSource>`;
  },
  // gancho da forma `json` — `def.dominio`/`percentual`/… é o atalho amigável; `def.source` (JSON pronto) tem prioridade.
  body(name, pkg, description, def = {}) {
    return buildNrobSource(description, def);
  },
};
