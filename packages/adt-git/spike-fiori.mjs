// spike-fiori.mjs — DESCARTÁVEL. App Fiori tipo SM30 (manutenção de tabela) com singleton root,
// construído inteiro via ADT REST, sem Eclipse.
//
//   node abapgit.mjs connect <alias>:100:pt     (pré-requisito — a sessão vale 30min)
//   node spike-fiori.mjs                     cria e ativa os 14 objetos
//   node spike-fiori.mjs --limpar            desfaz tudo
//
// O PADRÃO NÃO FOI INVENTADO: foi lido de objetos que ja vivem no sistema de dev,
// que são uma implementação funcionando do mesmo padrão. Fonte de cada decisão fica nos comentários.
//
// POR QUE SINGLETON: uma object page precisa de UMA instância raiz para ancorar a lista editável.
// A tabela de manutenção não tem raiz natural, então se inventa uma: `key 1 as SingletonID` sobre
// I_Language (que sempre devolve linha), com a tabela pendurada por `left outer join ... on 0 = 0` só
// para o `max( last_changed_at )` do etag total. O filho é uma composition — e é a lista que o
// usuário edita, com create/update/delete inline. É isso que dá o comportamento de SM30.

import { conexaoAtual, perguntar } from './lib/session.mjs';
import { buscar } from './lib/search.mjs';
import * as adt from './lib/adt-client.mjs';

const PKG = '$TMP';
const LIMPAR = process.argv.includes('--limpar');

// ---------------------------------------------------------------------------------------------
// TABELAS
// ---------------------------------------------------------------------------------------------

// Os 3 campos pedidos (mandt, codigo, descricao) MAIS os 5 de administração. Estes não são enfeite:
// o draft exige `local_last_changed_at` (etag da instância) e `last_changed_at` (etag total), e sem
// eles o BDEF não ativa. Tipos copiados de uma tabela de draft que ja existia.
const TABELA = `@EndUserText.label : 'Tabela teste ADT - Fiori'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zspike_t_adtf {

  key mandt             : mandt not null;
  key codigo            : abap.char(10) not null;
  descricao             : abap.char(60);
  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;

}`;

// Draft tables: espelham a entidade + o include `sych_bdl_draft_admin_inc` (estado do rascunho).
// Nomes de campo SEM underscore — seguem o nome do ELEMENTO do CDS, não o da tabela base.
const DRAFT_SGL = `@EndUserText.label : 'Draft table for entity ZSPIKE_CE_ADTF_SGL'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zspike_dadtf_sgl {

  key mandt        : mandt not null;
  key singletonid  : abap.int1 not null;
  lastchangedatmax : abp_lastchange_tstmpl;
  "%admin"         : include sych_bdl_draft_admin_inc;

}`;

const DRAFT_MST = `@EndUserText.label : 'Draft table for entity ZSPIKE_CE_ADTF_MST'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zspike_dadtf_mst {

  key mandt          : mandt not null;
  key codigo         : abap.char(10) not null;
  singletonid        : abap.int1;
  descricao          : abap.char(60);
  localcreatedby     : abp_creation_user;
  localcreatedat     : abp_creation_tstmpl;
  locallastchangedby : abp_locinst_lastchange_user;
  locallastchangedat : abp_locinst_lastchange_tstmpl;
  lastchangedat      : abp_lastchange_tstmpl;
  "%admin"           : include sych_bdl_draft_admin_inc;

}`;

// ---------------------------------------------------------------------------------------------
// CAMADA BÁSICA (CE_) — os dois se referenciam, então ativam JUNTOS
// ---------------------------------------------------------------------------------------------

const CE_SGL = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Teste ADT Fiori - Singleton Root'
define root view entity ZSPIKE_CE_ADTF_SGL
  as select from    i_language
    left outer join zspike_t_adtf as tab on 0 = 0
  composition [0..*] of ZSPIKE_CE_ADTF_MST as _MasterData
{
  key 1                          as SingletonID,
      max( tab.last_changed_at ) as LastChangedAtMax,
      _MasterData
}
where i_language.language = $session.system_language`;

const CE_MST = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Teste ADT Fiori - Master Data'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZSPIKE_CE_ADTF_MST
  as select from zspike_t_adtf as tab
  association to parent ZSPIKE_CE_ADTF_SGL as _Singleton on $projection.SingletonID = _Singleton.SingletonID
{
  key tab.codigo    as Codigo,
      1             as SingletonID,
      tab.descricao as Descricao,
      @Semantics.user.createdBy: true
      tab.local_created_by      as LocalCreatedBy,
      @Semantics.systemDateTime.createdAt: true
      tab.local_created_at      as LocalCreatedAt,
      @Semantics.user.lastChangedBy: true
      tab.local_last_changed_by as LocalLastChangedBy,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      tab.local_last_changed_at as LocalLastChangedAt,
      @Semantics.systemDateTime.lastChangedAt: true
      tab.last_changed_at       as LastChangedAt,
      _Singleton
}`;

// ---------------------------------------------------------------------------------------------
// COMPORTAMENTO (BDEF base + pool). Nome do BDEF = nome da root entity.
// ---------------------------------------------------------------------------------------------

// `with unmanaged save` no singleton porque ele NÃO tem tabela por trás (é derivado). O filho é
// `persistent table`, e é o framework que grava. `strict ( 2 )` exige authorization master — daí o
// get_global_authorizations vazio na pool.
const BDEF_CE = `managed implementation in class zbp_spike_ce_adtf_sgl unique;
strict ( 2 );
with draft;
define behavior for ZSPIKE_CE_ADTF_SGL alias Singleton
with unmanaged save
draft table zspike_dadtf_sgl
lock master
total etag LastChangedAtMax
authorization master ( global )
{
  association _MasterData { create; with draft; }
  field ( readonly ) SingletonID, LastChangedAtMax;
  draft action Edit;
  draft action Activate optimized;
  draft action Discard;
  draft action Resume;
  draft determine action Prepare;
}
define behavior for ZSPIKE_CE_ADTF_MST alias MasterData
persistent table zspike_t_adtf
draft table zspike_dadtf_mst
lock dependent by _Singleton
authorization dependent by _Singleton
etag master LocalLastChangedAt
{
  update;
  delete;
  field ( readonly ) SingletonID, LocalCreatedBy, LocalCreatedAt, LocalLastChangedBy, LocalLastChangedAt, LastChangedAt;
  field ( mandatory : create, readonly : update ) Codigo;
  field ( mandatory ) Descricao;
  association _Singleton { with draft; }
  mapping for zspike_t_adtf
  {
    Codigo = codigo;
    Descricao = descricao;
    LocalCreatedBy = local_created_by;
    LocalCreatedAt = local_created_at;
    LocalLastChangedBy = local_last_changed_by;
    LocalLastChangedAt = local_last_changed_at;
    LastChangedAt = last_changed_at;
  }
}`;

const POOL = `CLASS zbp_spike_ce_adtf_sgl DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF zspike_ce_adtf_sgl.
ENDCLASS.

CLASS zbp_spike_ce_adtf_sgl IMPLEMENTATION.
ENDCLASS.`;

// Vai no include CCIMP (implementations). Os dois métodos são vazios de propósito: a autorização é
// global e liberada, e o save do singleton não tem o que gravar.
const POOL_IMPL = `CLASS lhc_singleton DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR Singleton RESULT result.
ENDCLASS.

CLASS lhc_singleton IMPLEMENTATION.
  METHOD get_global_authorizations.
  ENDMETHOD.
ENDCLASS.

CLASS lsc_zspike_ce_adtf_sgl DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
ENDCLASS.

CLASS lsc_zspike_ce_adtf_sgl IMPLEMENTATION.
  METHOD save_modified.
  ENDMETHOD.
ENDCLASS.`;

// ---------------------------------------------------------------------------------------------
// CAMADA DE CONSUMO (CP_) — é aqui que moram as anotações de UI
// ---------------------------------------------------------------------------------------------

const CP_SGL = `@EndUserText.label: 'Teste ADT Fiori - Singleton Projection'
@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@ObjectModel.semanticKey: ['SingletonID']
define root view entity ZSPIKE_CP_ADTF_SGL
  provider contract transactional_query
  as projection on ZSPIKE_CE_ADTF_SGL
{
  key SingletonID,
      @Consumption.hidden: true
      LastChangedAtMax,
      _MasterData : redirected to composition child ZSPIKE_CP_ADTF_MST
}`;

// @UI.lineItem define as COLUNAS da lista editável — é a tela da "SM30".
const CP_MST = `@EndUserText.label: 'Teste ADT Fiori - Master Projection'
@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@ObjectModel.semanticKey: ['Codigo']
define view entity ZSPIKE_CP_ADTF_MST
  as projection on ZSPIKE_CE_ADTF_MST
{
      @UI.lineItem: [{ position: 10, label: 'Código' }]
  key Codigo,
      @Consumption.hidden: true
      SingletonID,
      @UI.lineItem: [{ position: 20, label: 'Descrição' }]
      Descricao,
      LocalLastChangedAt,
      _Singleton : redirected to parent ZSPIKE_CP_ADTF_SGL
}`;

const BDEF_CP = `projection;
strict ( 2 );
use draft;
define behavior for ZSPIKE_CP_ADTF_SGL alias Singleton
{
  use action Edit;
  use action Activate;
  use action Discard;
  use action Resume;
  use action Prepare;
  use association _MasterData { create; with draft; }
}
define behavior for ZSPIKE_CP_ADTF_MST alias MasterData
use etag
{
  use update;
  use delete;
  use association _Singleton { with draft; }
}`;

// O facet LINEITEM_REFERENCE é o que embute a lista do filho na object page do singleton — sem isto
// o app abre num registro raiz vazio e a manutenção não aparece.
const DDLX = `@Metadata.layer: #CORE
@UI: { headerInfo: { typeName: 'Manutenção', typeNamePlural: 'Manutenção' } }
annotate entity ZSPIKE_CP_ADTF_SGL with
{
  @UI.facet: [{ id: 'Master', purpose: #STANDARD, type: #LINEITEM_REFERENCE,
                label: 'Códigos', targetElement: '_MasterData' }]
  SingletonID;
}`;

const SRVD = `@EndUserText.label: 'Teste ADT Fiori - Service'
define service ZSPIKE_SD_ADTF {
  expose ZSPIKE_CP_ADTF_SGL as Singleton;
  expose ZSPIKE_CP_ADTF_MST as MasterData;
}`;

// ---------------------------------------------------------------------------------------------

/** Grava o fonte SEM ativar — para os casos em que ativar sozinho é o erro. */
async function gravar(cx, type, name, source, description, includes = {}) {
  adt.assertZY(name);
  const s = await cx.sessao();
  const ex = await adt.getObject(s, type, name);
  if (!ex.exists) await adt.createShell(s, type, name, { pkg: PKG, description });
  const h = await adt.lock(s, type, name);
  try {
    for (const [t, src] of Object.entries(includes)) await adt.setInclude(s, name, t, src, h);
    await adt.setSource(s, type, name, source, h);
  } finally { await adt.unlock(s, type, name, h); }
  return { created: !ex.exists };
}

// Cada etapa é uma UNIDADE DE ATIVAÇÃO: o que se referencia mutuamente tem que ativar na mesma
// requisição, senão cada metade reclama que falta a outra.
const ETAPAS = [
  { titulo: 'tabela de dados',
    grava: (cx) => [gravar(cx, 'table', 'ZSPIKE_T_ADTF', TABELA, 'Tabela teste ADT - Fiori')],
    ativa: [{ type: 'table', name: 'ZSPIKE_T_ADTF' }] },

  { titulo: 'draft tables',
    grava: (cx) => [
      gravar(cx, 'table', 'ZSPIKE_DADTF_SGL', DRAFT_SGL, 'Draft table for entity ZSPIKE_CE_ADTF_SGL'),
      gravar(cx, 'table', 'ZSPIKE_DADTF_MST', DRAFT_MST, 'Draft table for entity ZSPIKE_CE_ADTF_MST'),
    ],
    ativa: [{ type: 'table', name: 'ZSPIKE_DADTF_SGL' }, { type: 'table', name: 'ZSPIKE_DADTF_MST' }] },

  { titulo: 'views básicas (singleton + master)',
    grava: (cx) => [
      gravar(cx, 'cds', 'ZSPIKE_CE_ADTF_SGL', CE_SGL, 'Teste ADT Fiori - Singleton Root'),
      gravar(cx, 'cds', 'ZSPIKE_CE_ADTF_MST', CE_MST, 'Teste ADT Fiori - Master Data'),
    ],
    ativa: [{ type: 'cds', name: 'ZSPIKE_CE_ADTF_SGL' }, { type: 'cds', name: 'ZSPIKE_CE_ADTF_MST' }] },

  { titulo: 'behavior + pool class',
    grava: (cx) => [
      gravar(cx, 'behaviorDefinition', 'ZSPIKE_CE_ADTF_SGL', BDEF_CE, 'Teste ADT Fiori - Behavior'),
      gravar(cx, 'class', 'ZBP_SPIKE_CE_ADTF_SGL', POOL, 'Teste ADT Fiori - Behavior Pool',
             { implementations: POOL_IMPL }),
    ],
    ativa: [{ type: 'behaviorDefinition', name: 'ZSPIKE_CE_ADTF_SGL' },
            { type: 'class', name: 'ZBP_SPIKE_CE_ADTF_SGL' }] },

  { titulo: 'projeções (consumo)',
    grava: (cx) => [
      gravar(cx, 'cds', 'ZSPIKE_CP_ADTF_SGL', CP_SGL, 'Teste ADT Fiori - Singleton Projection'),
      gravar(cx, 'cds', 'ZSPIKE_CP_ADTF_MST', CP_MST, 'Teste ADT Fiori - Master Projection'),
    ],
    ativa: [{ type: 'cds', name: 'ZSPIKE_CP_ADTF_SGL' }, { type: 'cds', name: 'ZSPIKE_CP_ADTF_MST' }] },

  { titulo: 'behavior da projeção',
    grava: (cx) => [gravar(cx, 'behaviorDefinition', 'ZSPIKE_CP_ADTF_SGL', BDEF_CP, 'Teste ADT Fiori - Projection Behavior')],
    ativa: [{ type: 'behaviorDefinition', name: 'ZSPIKE_CP_ADTF_SGL' }] },

  { titulo: 'metadata extension (o facet da lista)',
    grava: (cx) => [gravar(cx, 'metadataExtension', 'ZSPIKE_CP_ADTF_SGL', DDLX, 'Teste ADT Fiori - Metadata Ext')],
    ativa: [{ type: 'metadataExtension', name: 'ZSPIKE_CP_ADTF_SGL' }] },

  { titulo: 'service definition',
    grava: (cx) => [gravar(cx, 'serviceDefinition', 'ZSPIKE_SD_ADTF', SRVD, 'Teste ADT Fiori - Service')],
    ativa: [{ type: 'serviceDefinition', name: 'ZSPIKE_SD_ADTF' }] },
];

const PARA_LIMPAR = [
  { nome: 'ZSPIKE_SB_ADTF', type: 'serviceBinding', despublicar: true },
  { nome: 'ZSPIKE_SD_ADTF', type: 'serviceDefinition' },
  { nome: 'ZSPIKE_CP_ADTF_SGL', type: 'metadataExtension' },
  { nome: 'ZSPIKE_CP_ADTF_SGL', type: 'behaviorDefinition' },
  { nome: 'ZSPIKE_CP_ADTF_MST', type: 'cds' },
  { nome: 'ZSPIKE_CP_ADTF_SGL', type: 'cds' },
  { nome: 'ZSPIKE_CE_ADTF_SGL', type: 'behaviorDefinition' },
  { nome: 'ZBP_SPIKE_CE_ADTF_SGL', type: 'class' },
  { nome: 'ZSPIKE_CE_ADTF_MST', type: 'cds' },
  { nome: 'ZSPIKE_CE_ADTF_SGL', type: 'cds' },
  { nome: 'ZSPIKE_DADTF_MST', type: 'table' },
  { nome: 'ZSPIKE_DADTF_SGL', type: 'table' },
  { nome: 'ZSPIKE_T_ADTF', type: 'table' },
];

async function construir(cx) {
  console.log('─'.repeat(78));
  console.log('CONSTRUINDO — cada etapa é uma unidade de ativação');
  console.log('─'.repeat(78));
  let parou = false;
  for (const e of ETAPAS) {
    process.stdout.write(`  ${e.titulo.padEnd(38)} `);
    try {
      const r = await Promise.all(e.grava(cx));
      const act = await adt.activateMany(cx, e.ativa);
      const novos = r.filter((x) => x.created).length;
      console.log(`${novos} novo(s) · ${act.ok ? 'ativado' : 'NÃO ATIVOU'}`);
      for (const m of act.messages) {
        if (m.type === 'E' || m.type === 'W') console.log(`      ${m.type}: ${m.text}`);
      }
      if (!act.ok) { parou = true; break; } // sem a etapa anterior ativa, a próxima não tem como dar certo
    } catch (err) {
      console.log('ERRO');
      console.log(`      ${String(err.message).split('\n')[0]}`);
      parou = true; break;
    }
  }
  return parou;
}

async function publicar(cx) {
  console.log('\n─'.repeat(78));
  console.log('SERVICE BINDING (categoria 0 = UI — é o que o Fiori consome)');
  console.log('─'.repeat(78));
  const r = await adt.deployServiceBinding(cx, {
    name: 'ZSPIKE_SB_ADTF', srvd: 'ZSPIKE_SD_ADTF', category: '0', version: 'V4',
    pkg: PKG, description: 'Teste ADT Fiori - Service Binding',
  });
  console.log(`  binding: ${r.created ? 'criado' : 'já existia'} · ${r.activated ? 'ativado' : 'NÃO ATIVOU'}`);
  const p = await adt.publishServiceBinding(cx, { name: 'ZSPIKE_SB_ADTF', version: 'V4' });
  console.log(`  publish: ${p.ok ? 'OK' : `FALHOU (${p.severity}) ${p.message}`}`);
  if (p.ok) {
    const url = adt.odataV4RuntimeUrl('ZSPIKE_SB_ADTF', 'ZSPIKE_SD_ADTF', { category: '0' });
    console.log(`\n  Serviço OData: ${url}`);
    console.log(`  Metadados:     ${url}$metadata`);
    console.log(`\n  No SAP, o app abre pelo preview do service binding (Eclipse: botão "Preview"),`);
    console.log(`  ou publicando um tile no Fiori Launchpad apontando para esse serviço.`);
  }
}

async function listar(cx) {
  console.log('\n' + '─'.repeat(78));
  console.log('O QUE FICOU NO SISTEMA');
  console.log('─'.repeat(78));
  const s = await cx.sessao();
  const vistos = new Set();
  for (const padrao of ['ZSPIKE_*ADTF*', 'ZBP_SPIKE_*ADTF*']) {
    const { itens } = await buscar(s, padrao, []);
    for (const i of itens) {
      const k = `${i.nome}|${i.tipo}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      console.log(`  ${i.nome.padEnd(22)} ${i.tipo.padEnd(9)} ${(i.pacote || '').padEnd(8)} ${i.descricao || ''}`);
    }
  }
  console.log(`\n  ${vistos.size} objeto(s).`);
}

async function limpar(cx) {
  console.log('\n⚠️  Isto APAGA no SISTEMA CONECTADO, mandante 100, e é IRREVERSÍVEL:');
  for (const o of PARA_LIMPAR) console.log(`     ${o.nome.padEnd(22)} ${o.type}`);
  if ((await perguntar('\nDigite APAGAR para confirmar: ')) !== 'APAGAR') {
    console.log('Cancelado — nada foi tocado.'); return;
  }
  for (const o of PARA_LIMPAR) {
    process.stdout.write(`  ${o.nome.padEnd(22)} ${o.type.padEnd(20)} `);
    try {
      if (o.despublicar) {
        const u = await adt.unpublishServiceBinding(cx, { name: o.nome, version: 'V4' });
        process.stdout.write(`unpublish ${u.ok ? 'OK' : `(${u.severity || '—'})`} · `);
      }
      const d = await adt.deleteObject(cx, { type: o.type, name: o.nome, confirm: true });
      console.log(d.deleted ? 'apagado' : 'não existia');
    } catch (e) { console.log(`ERRO: ${e.message.split('\n')[0]}`); }
  }
}

const { conexao, cfg, info } = conexaoAtual();
console.log(`Alvo: ${cfg.alias.toUpperCase()} mandante ${cfg.client} · pacote ${PKG}`);
console.log(`      ${cfg.base}  usuário ${cfg.user}  · sessão até ${new Date(info.expiraEm).toLocaleTimeString('pt-BR')}\n`);

if (LIMPAR) {
  await limpar(conexao);
} else {
  const parou = await construir(conexao);
  if (!parou) await publicar(conexao);
  else console.log('\n⚠️  Parei na primeira etapa que não ativou — as seguintes dependem dela.');
  await listar(conexao);
  console.log('\nPara desfazer:  node spike-fiori.mjs --limpar');
}
