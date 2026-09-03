// tipos/applicationJobCatalog.mjs — SAJC, a entrada do catálogo de Application Job (o que a SJOBREPO
// mantém e a app "Application Jobs" oferece). Forma `json`, `ativacaoJson: 'sessaoNova'`.
// (SPIKE 2026-09-01, S4H 758 — fila 47; forma genérica extraída na fila 60/I56, depois de comparar
// com APLO e NROB — ver tipos/_esquema.mjs § FORMAS.json)
//
// É o TERCEIRO tipo "blue" (ABAP File Formats) da lib, depois do APLO (fila 29) e do NROB (fila 44) —
// e o primeiro em que a família cobra `blues.**v2**+xml`: com o `v1` o create devolve 415.
//
// O QUE ELE É, DO LADO DO DADO: a linha da **APJ_W_JCE_ROOT** (tabela de repositório, sem mandante),
// onde o `className` do fonte cai em **REPORT_NAME** com `JOB_TYPE_C = 'A'` (class based). Junto dela,
// a **APJ_W_JCE_PAR** recebe UMA LINHA POR PARÂMETRO — e esses parâmetros não vêm do fonte: o SAP os
// lê da classe executora, chamando `IF_APJ_DT_EXEC_OBJECT~GET_PARAMETERS` na hora do PUT.
//
// DOIS DESVIOS que custaram spike:
//   1. **o ACTIVATE não passa na sessão que fez o create/PUT.** Ele responde 200 com
//      `activationExecuted="false"` e duas mensagens E que apontam para o lugar errado —
//      *"Report ou classe  inválida"* / *"O report ou classe  não existe"*, com o nome VAZIO: o check
//      lê a versão ATIVA (ainda inexistente), não a inativa que acabou de ser gravada. Em sessão NOVA
//      o mesmo activate devolve `activationExecuted="true"` e o objeto fica `active`. Medido nos dois
//      sentidos, com duas cobaias, inclusive repetindo na mesma sessão (falha de novo).
//   2. **o PUT já grava a APJ_W_JCE_ROOT** (como o APLO, ao contrário do NROB, em que só a ativação
//      grava a TNRO). O activate é o que dá a versão ativa — a linha de dados já está lá antes.
//
// O TEMPLATE (SAJT) NÃO SAI POR AQUI: o POST da coleção `applicationjob/templates` responde **500
// "Anular referência da referência NULL"** e não cria nada (TADIR vazia), em toda variante de
// `version`/media type/`relatedObjectUri`. A via medida do template é o driver
// `CL_APJ_DT_CREATE_CONTENT` — `job.mjs` (`deployJobTemplate`). Ver docs/receita-application-job.md.

import { XML_PREF, pkgRef, esc } from './_xml.mjs';

const CT_CREATE = 'application/vnd.sap.adt.blues.v2+xml';

/**
 * O fonte JSON da entrada de catálogo (puro), na forma do `sajc-v1.json` do AFF.
 * `classe` é a classe que implementa `IF_APJ_DT_EXEC_OBJECT` + `IF_APJ_RT_EXEC_OBJECT`.
 * `originalLanguage` é minúsculo (o schema exige `^[a-z]+$`), como no APLO e no NROB.
 */
export function buildSajcSource(description, {
  classe, programa, exitCheck, exitValueHelp, exitNotification, idioma = 'pt', versaoAbap,
} = {}) {
  const header = { description: String(description ?? ''), originalLanguage: String(idioma).toLowerCase() };
  if (versaoAbap) header.abapLanguageVersion = versaoAbap;
  const generalInformation = { className: String(classe ?? '').toUpperCase() };
  if (programa) generalInformation.programName = String(programa).toUpperCase();
  const doc = { formatVersion: '1', header, generalInformation };
  const exits = {};
  if (exitCheck) exits.check = String(exitCheck).toUpperCase();
  if (exitValueHelp) exits.valueHelp = String(exitValueHelp).toUpperCase();
  if (exitNotification) exits.notification = String(exitNotification).toUpperCase();
  if (Object.keys(exits).length) doc.exitClasses = exits;
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'applicationJobCatalog', codigo: 'SAJC', adtType: 'SAJC',
  descricao: 'entrada do catálogo de application job',
  sinonimos: ['sajc', 'job catalog', 'catálogo de job', 'application job catalog', 'entrada de catálogo de job'],
  coll: '/sap/bc/adt/applicationjob/catalogs',
  ct: CT_CREATE,
  accept: 'application/*',
  source: true,
  forma: 'json',
  ativacaoJson: 'sessaoNova',
  nomeacao: { max: 40, fonte: 'APJ_JOB_CATALOG_ENTRY_NAME / CL_APJ_DT_CREATE_CONTENT=>TY_CATALOG_NAME (c length 40, medido 2026-09-01)' },
  oQueFaz: 'Cria/altera a entrada do catálogo de application job: a ligação entre a classe executora (IF_APJ_DT_EXEC_OBJECT + IF_APJ_RT_EXEC_OBJECT) e o framework de jobs. Sem ela, era SJOBREPO/GUI — e sem ela o template (SAJT) não tem a que se referir.',
  comoTrata: 'create `blue:blueSource` com ct `blues.v2+xml` e version="inactive" → lock → PUT /source/main em application/json (o fonte AFF; é ele que grava a APJ_W_JCE_ROOT e lê os parâmetros da classe) → unlock → ACTIVATE **em sessão NOVA** (na sessão do PUT o activate falha dizendo que a classe não existe).',
  spike: { data: '2026-09-01', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    'create só com `application/vnd.sap.adt.blues.v2+xml` — o v1 (o do APLO/NROB) dá 415',
    'ATIVE EM SESSÃO NOVA: na sessão que fez o create/PUT o activate devolve activationExecuted="false" e erra o diagnóstico ("Report ou classe  inválida", com o nome VAZIO)',
    'a classe executora tem de existir e estar ATIVA antes — ela implementa IF_APJ_DT_EXEC_OBJECT (parâmetros) e IF_APJ_RT_EXEC_OBJECT (execute)',
    'PUT do /source/main em `application/json`; `text/plain` não é o media type do fonte AFF',
    'os parâmetros do job NÃO vêm no fonte: o PUT chama GET_PARAMETERS da classe e grava a APJ_W_JCE_PAR. Mudou a assinatura na classe? Refaça catálogo e template (a própria SAP avisa isso em CL_APJ_DT_CREATE_CONTENT)',
    'o TEMPLATE (SAJT) não sai por ADT REST — o POST da coleção `applicationjob/templates` dá 500 e não cria nada; use `deployJobTemplate` do `adt-client/job`',
    'job abortado (status A) com o log de aplicação VAZIO e sem dump na ST22: leia o log do JOB (`lerJobLog`) — e desconfie do "Erro ao instanciar", que aparece mesmo depois de "Class successfully instantiated"',
  ],
  canais: ['adt', 'classrun'],
  origem: [
    'spike fila 47 (2026-09-01, S4H 758)',
    'discovery: workspace do Application Job → coleções applicationjob/catalogs e applicationjob/templates',
    '$schema servido pelo sistema (sajc-v1.json)',
    'moldes lidos no s4h: ZPFG_JOB_CATALOG, ZPRODUCTS_CATALOG_V5, SAP_CMD_MMPV',
    'docs/receita-application-job.md',
  ],
  dependencias: [{ tipo: 'class', papel: 'classe executora (IF_APJ_DT_EXEC_OBJECT + IF_APJ_RT_EXEC_OBJECT)', ativarJunto: false }],
  exemplo: {
    opts: {
      name: 'YJBV_POC_JOBC', pkg: '$TMP', description: 'POC fila 47 - job catalog entry',
      classe: 'YJBV_POC_CL_JOB',
    },
    nota: 'o fonte JSON pode vir pronto em `source`; `classe` é o atalho que o monta. O template que aponta para esta entrada sai por `deployJobTemplate` (job.mjs).',
  },
  testes: [
    {
      canal: 'classrun',
      descricao: 'o job agendado a partir do template desta entrada roda e deixa rastro em outra LUW (tabela + log de aplicação)',
      abap: [
        "// pela lib, não à mão — job.mjs monta os drivers com os gotchas dentro:",
        "import { deployJobTemplate, agendarJob, esperarJob } from 'adt-client/job';",
        "await deployJobTemplate(conexao, { template: 'YJBV_POC_JOBTM', catalogo: 'YJBV_POC_JOBC',",
        "  texto: 'POC fila 47', parametros: [{ nome: 'P_FATOR', valor: '7' }] });",
        "const j = await agendarJob(conexao, { template: 'YJBV_POC_JOBTM', texto: 'POC fila 47' });",
        'await esperarJob(conexao, j);   // poll de CL_APJ_RT_API=>GET_JOB_STATUS até F/A',
      ].join('\n'),
      assert: { console: 'AGENDADO jobname=… jobcount=… e depois status=F (finished)', espera: 'readTable da tabela que o executor grava, em outra LUW; e o log de aplicação pelo bal.mjs (comLog) desde a marca d’água. Contra-prova: parâmetro que o executor recusa → status A, log com E, nenhuma linha' },
      medido: [{ data: '2026-09-01', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 415, causa: 'content-type do create diferente de `blues.v2+xml` (o v1 do APLO/NROB não serve aqui)', correcao: 'use `application/vnd.sap.adt.blues.v2+xml` — o media type que o discovery declara na coleção' },
    { contem: 'Report ou classe', causa: 'activate rodado na MESMA sessão do create/PUT: o check lê a versão ativa (inexistente) e reclama de uma classe com nome VAZIO', correcao: 'ative em sessão nova (`conexao.sessaoNova()`) — é o que `ativacaoJson: "sessaoNova"` faz sozinho pelo `deployJson` genérico; chamando à mão, encerre a sessão no finally' },
    { status: 406, contem: 'source/main', causa: 'GET/PUT do fonte com text/plain ou com um vnd.sap.adt.* inventado', correcao: 'application/json (ou application/*) — o fonte é AFF/JSON' },
    { status: 500, contem: 'NULL', causa: 'POST na coleção `applicationjob/templates` (SAJT) — o handler do create do TEMPLATE derreferencia nulo e nada é criado', correcao: 'template não sai por ADT REST: `deployJobTemplate` do `adt-client/job` (driver com CL_APJ_DT_CREATE_CONTENT)' },
  ],
  desmentidos: [
    {
      crenca: 'os dois tipos do Application Job (SAJC e SAJT) saem por ADT REST, já que o discovery publica as DUAS coleções com $schema, $configuration e source/formatter',
      fato: 'só o SAJC sai. O create do SAJT responde 500 "Anular referência da referência NULL" (sem dump ST22) e não grava TADIR nem APJ_W_JT_ROOT — em v1 e v2, com version inactive/active/ausente e com relatedObjectUri. Coleção publicada não é create funcionando',
      medido: { data: '2026-09-01', sistema: 'S4H', release: '758' },
    },
    {
      crenca: 'os parâmetros do job são declarados no fonte do catálogo (é o que o $schema sugere: só className)',
      fato: 'o fonte não tem parâmetro nenhum — quem os declara é a CLASSE, em IF_APJ_DT_EXEC_OBJECT~GET_PARAMETERS, e o PUT do fonte é que os copia para a APJ_W_JCE_PAR (medido: P_FATOR com MANDATORY_IND=X apareceu lá sem nunca ter sido escrito no JSON)',
      medido: { data: '2026-09-01', sistema: 'S4H', release: '758' },
    },
  ],
  prova: (name) => ({
    tabela: 'APJ_W_JCE_ROOT',
    campos: ['JOB_CATALOG_ENTRY_NAME', 'JOB_CATALOG_ENTRY_VERSION', 'REPORT_NAME', 'JOB_TYPE_C'],
    where: [`JOB_CATALOG_ENTRY_NAME = '${String(name).toUpperCase()}'`],
    espera: "1 linha, REPORT_NAME = a classe executora e JOB_TYPE_C = 'A' (class based). A linha aparece já no PUT do fonte — o activate é o que dá a versão ativa. Os parâmetros da classe ficam na APJ_W_JCE_PAR.",
    medido: true,
  }),
  validar(opts) {
    if (!opts?.source && !opts?.classe) {
      throw new Error('applicationJobCatalog exige { source } (JSON AFF) ou { classe } (a classe com IF_APJ_DT_EXEC_OBJECT + IF_APJ_RT_EXEC_OBJECT).');
    }
    if (opts?.classe && String(opts.classe).length > 30) {
      throw new Error(`GUARD-RAIL: classe "${opts.classe}" tem mais de 30 caracteres (sajc-v1.json: className maxLength 30).`);
    }
  },
  createBody(name, pkg, description) {
    const N = String(name).toUpperCase();
    // version="inactive": é a versão inativa que o PUT preenche; a ativa nasce no activate.
    return `${XML_PREF}<blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="SAJC" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT" adtcore:version="inactive">${pkgRef(pkg)}</blue:blueSource>`;
  },
  // gancho da forma `json` — `def.classe`/… é o atalho amigável; `def.source` (JSON pronto) tem prioridade.
  // A ativação em sessão nova (`ativacaoJson: 'sessaoNova'`) é o `deployJson` genérico quem faz.
  body(name, pkg, description, def = {}) {
    return buildSajcSource(description, def);
  },
};
