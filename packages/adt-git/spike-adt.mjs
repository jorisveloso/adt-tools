// spike-adt.mjs — DESCARTÁVEL. Cria um objeto de cada tipo da lib em $TMP no DEV:100 e lista.
//
//   node spike-adt.mjs            cria tudo e lista
//   node spike-adt.mjs --limpar   APAGA tudo que este spike criou (pede confirmação)
//
// Roda sobre a sessão do `connect` — NÃO pede senha. Isso só é possível porque foi medido no
// DEV:100 (2026-08-05) que o `activate` funciona na mesma sessão depois do `unlock`; a exigência de
// "sessão nova" que veio do maestro não vale aqui. Ver sap-connection.mjs.
//
// Pré-requisito:  node abapgit.mjs connect <alias>:100:pt
//
// Apague este arquivo quando o spike tiver respondido o que precisava responder.

import { conexaoAtual, perguntar } from './lib/session.mjs';
import { buscar } from './lib/search.mjs';
import * as adt from './lib/adt-client.mjs';

const PKG = '$TMP';
const LIMPAR = process.argv.includes('--limpar');

// ---------------------------------------------------------------------------------------------
// Os objetos, NA ORDEM DE DEPENDÊNCIA. Domínio → elemento de dados → tabela → CDS.
// Interface antes da classe (a classe a implementa). Sintaxe conferida contra objetos que já vivem
// no sistema de dev — `define view entity` sem sqlViewName, e o formato de `define table` de uma tabela de draft que ja existia.
// ---------------------------------------------------------------------------------------------

const TABELA = `@EndUserText.label : 'Spike ADT - tabela'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table zspike_adt_tab {
  key mandt : mandt not null;
  key id    : abap.char(10) not null;
  codigo    : zspike_adt_de;
  descricao : abap.char(40);
}`;

// @AbapCatalog.enhancement.category é OBRIGATÓRIA na estrutura. Sem ela o PUT devolve 400 com o tipo
// `ExceptionResourceAlreadyExists` — que é ENGANOSO: a mensagem real é "Kein Sichern wegen Fehler in
// Quelle" (erro de sintaxe no fonte). Descoberto comparando com o template que o próprio create gera.
const ESTRUTURA = `@EndUserText.label : 'Spike ADT - estrutura'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
define structure zspike_adt_str {
  id        : abap.char(10);
  descricao : abap.char(40);
}`;

const CDS = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Spike ADT - CDS'
define view entity ZSPIKE_ADT_CDS
  as select from zspike_adt_tab
{
  key id        as Id,
      codigo    as Codigo,
      descricao as Descricao
}`;

const INTERFACE = `INTERFACE zspike_adt_if
  PUBLIC.

  METHODS dobro
    IMPORTING n             TYPE i
    RETURNING VALUE(result) TYPE i.

ENDINTERFACE.`;

const CLASSE = `CLASS zspike_adt_cl DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zspike_adt_if.

ENDCLASS.

CLASS zspike_adt_cl IMPLEMENTATION.

  METHOD zspike_adt_if~dobro.
    result = n * 2.
  ENDMETHOD.

ENDCLASS.`;

// DOIS métodos de teste, os dois passando. Serve de prova em campo da correção do parseUnitResult:
// com o regex guloso antigo, dois <testMethod/> auto-fechados seriam contados como UM.
const TESTES = `CLASS ltc_dobro DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    METHODS dobra_positivo FOR TESTING.
    METHODS dobra_zero     FOR TESTING.

ENDCLASS.

CLASS ltc_dobro IMPLEMENTATION.

  METHOD dobra_positivo.
    DATA(cut) = NEW zspike_adt_cl( ).
    cl_abap_unit_assert=>assert_equals( act = cut->zspike_adt_if~dobro( 21 ) exp = 42 ).
  ENDMETHOD.

  METHOD dobra_zero.
    DATA(cut) = NEW zspike_adt_cl( ).
    cl_abap_unit_assert=>assert_equals( act = cut->zspike_adt_if~dobro( 0 ) exp = 0 ).
  ENDMETHOD.

ENDCLASS.`;

const PROGRAMA = `REPORT zspike_adt_p.

WRITE / 'Spike ADT: programa criado via ADT REST, sem Eclipse.'.`;

const INCLUDE = `*&---------------------------------------------------------------------*
*& Include ZSPIKE_ADT_I
*&---------------------------------------------------------------------*
CONSTANTS c_spike_adt TYPE string VALUE 'spike-adt'.`;

// ---------------------------------------------------------------------------------------------
// CADEIA RAP. Aqui não existe "objeto simples": os quatro só fazem sentido juntos, e nesta ordem.
//   root view entity → (BDEF + behavior pool, ativados JUNTOS) → service definition → binding.
// `managed` sem `strict`: o strict(2) exigiria authorization master com métodos na pool.
// ---------------------------------------------------------------------------------------------

const RAP_ROOT = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Spike ADT - root view entity'
define root view entity ZSPIKE_ADT_R_TAB
  as select from zspike_adt_tab
{
  key id        as Id,
      codigo    as Codigo,
      descricao as Descricao
}`;

const RAP_BDEF = `managed implementation in class zspike_adt_bp unique;

define behavior for ZSPIKE_ADT_R_TAB alias Registro
persistent table zspike_adt_tab
lock master
{
  create;
  update;
  delete;

  mapping for zspike_adt_tab
  {
    Id        = id;
    Codigo    = codigo;
    Descricao = descricao;
  }
}`;

// Pool VAZIA: com `managed` non-strict o SAP não exige nenhum método implementado.
const RAP_POOL = `CLASS zspike_adt_bp DEFINITION
  PUBLIC
  ABSTRACT
  FINAL
  FOR BEHAVIOR OF ZSPIKE_ADT_R_TAB.
ENDCLASS.

CLASS zspike_adt_bp IMPLEMENTATION.
ENDCLASS.`;

const RAP_SRVD = `@EndUserText.label: 'Spike ADT - service definition'
define service ZSPIKE_ADT_SRVD {
  expose ZSPIKE_ADT_R_TAB as Registro;
}`;

// type = chave do TYPES da lib. `passo` roda o deploy e devolve o resultado.
const OBJETOS = [
  { nome: 'ZSPIKE_ADT_DOM', type: 'domain', rotulo: 'DOMA/DD  domínio',
    passo: (cx) => adt.deployDomain(cx, {
      name: 'ZSPIKE_ADT_DOM', pkg: PKG, description: 'Spike ADT - dominio',
      def: { dataType: 'CHAR', length: 10, outputLength: 10,
             fixValues: [{ low: 'A', text: 'Alfa' }, { low: 'B', text: 'Beta' }] },
    }) },

  { nome: 'ZSPIKE_ADT_DE', type: 'dataElement', rotulo: 'DTEL/DE  elemento de dados',
    passo: (cx) => adt.deployDataElement(cx, {
      name: 'ZSPIKE_ADT_DE', pkg: PKG, description: 'Spike ADT - elemento de dados',
      def: { kind: 'domain', domain: 'ZSPIKE_ADT_DOM',
             labels: { short: 'Codigo', medium: 'Codigo', long: 'Codigo do spike', heading: 'Codigo' } },
    }) },

  { nome: 'ZSPIKE_ADT_TAB', type: 'table', rotulo: 'TABL/DT  tabela',
    passo: (cx) => adt.deploySource(cx, {
      type: 'table', name: 'ZSPIKE_ADT_TAB', pkg: PKG, description: 'Spike ADT - tabela', source: TABELA,
    }) },

  { nome: 'ZSPIKE_ADT_STR', type: 'structure', rotulo: 'TABL/DS  estrutura',
    passo: (cx) => adt.deploySource(cx, {
      type: 'structure', name: 'ZSPIKE_ADT_STR', pkg: PKG, description: 'Spike ADT - estrutura', source: ESTRUTURA,
    }) },

  { nome: 'ZSPIKE_ADT_CDS', type: 'cds', rotulo: 'DDLS/DF  CDS view entity',
    passo: (cx) => adt.deploySource(cx, {
      type: 'cds', name: 'ZSPIKE_ADT_CDS', pkg: PKG, description: 'Spike ADT - CDS', source: CDS,
    }) },

  { nome: 'ZSPIKE_ADT_IF', type: 'interface', rotulo: 'INTF/OI  interface',
    passo: (cx) => adt.deploySource(cx, {
      type: 'interface', name: 'ZSPIKE_ADT_IF', pkg: PKG, description: 'Spike ADT - interface', source: INTERFACE,
    }) },

  { nome: 'ZSPIKE_ADT_CL', type: 'class', rotulo: 'CLAS/OC  classe + test class (CCAU)',
    passo: (cx) => adt.deployClassWithTests(cx, {
      name: 'ZSPIKE_ADT_CL', pkg: PKG, description: 'Spike ADT - classe', source: CLASSE, testSource: TESTES,
    }) },

  // ⚠️ MEDIDO no sistema de dev: com a sessão do `connect` (só cookie) este passo NÃO fecha. O `createShell`
  // do MSAG prende o objeto num bloqueio ENQUEUE e não existe unlock para um create; o `lock` seguinte
  // volta 403 EU510 "Usuário X já está processando Y". `sessaoStateless()` não salva, porque clonar o
  // cookie mantém a MESMA sessão SAP (que é stateful). Só um LOGON NOVO resolve — ou seja, senha.
  // Aqui a regra do maestro se confirma; para o `activate`, não (ver sap-connection.mjs).
  { nome: 'ZSPIKE_ADT_MSG', type: 'msag', rotulo: 'MSAG/N   classe de mensagens',
    passo: (cx) => adt.deployMessageClass(cx, {
      name: 'ZSPIKE_ADT_MSG', pkg: PKG, description: 'Spike ADT - mensagens',
      messages: [{ no: '001', text: 'Spike ADT: &1 criado com sucesso' },
                 { no: '002', text: 'Spike ADT: falha ao criar &1' }],
    }) },

  { nome: 'ZSPIKE_ADT_P', type: 'prog', rotulo: 'PROG/P   programa',
    passo: (cx) => adt.deploySource(cx, {
      type: 'prog', name: 'ZSPIKE_ADT_P', pkg: PKG, description: 'Spike ADT - programa', source: PROGRAMA,
    }) },

  { nome: 'ZSPIKE_ADT_I', type: 'include', rotulo: 'PROG/I   include',
    passo: (cx) => adt.deploySource(cx, {
      type: 'include', name: 'ZSPIKE_ADT_I', pkg: PKG, description: 'Spike ADT - include', source: INCLUDE,
    }) },

  // ----- cadeia RAP -----
  { nome: 'ZSPIKE_ADT_R_TAB', type: 'cds', rotulo: 'DDLS/DF  root view entity (RAP)',
    passo: (cx) => adt.deploySource(cx, {
      type: 'cds', name: 'ZSPIKE_ADT_R_TAB', pkg: PKG, description: 'Spike ADT - root view entity', source: RAP_ROOT,
    }) },

  // Os dois numa linha só porque são UMA unidade de ativação: BDEF sozinho não ativa (falta a pool),
  // pool sozinha não ativa (falta o BDEF). Grava os dois, ativa na MESMA requisição.
  // ⚠️ O BDEF tem o MESMO NOME da root view entity — é por aí que o RAP amarra os dois. Um BDEF com
  // nome próprio ativa com "There is no behavior definition for <entity>" + "Type <bdef> is unknown".
  // Confirmado no sistema de dev: um par CDS+BDEF ja existente aparece como DDLS/DF e BDEF/BDO, mesmo nome.
  { nome: 'ZSPIKE_ADT_R_TAB', type: 'behaviorDefinition', rotulo: 'BDEF/BDO behavior + pool (juntos)',
    passo: async (cx) => {
      const a = await gravarSemAtivar(cx, 'behaviorDefinition', 'ZSPIKE_ADT_R_TAB', RAP_BDEF, 'Spike ADT - behavior');
      const b = await gravarSemAtivar(cx, 'class', 'ZSPIKE_ADT_BP', RAP_POOL, 'Spike ADT - behavior pool');
      const act = await adt.activateMany(cx, [
        { type: 'behaviorDefinition', name: 'ZSPIKE_ADT_R_TAB' },
        { type: 'class', name: 'ZSPIKE_ADT_BP' },
      ]);
      return { created: a.created || b.created, activated: act.ok, activate: act };
    } },

  { nome: 'ZSPIKE_ADT_SRVD', type: 'serviceDefinition', rotulo: 'SRVD/SRV service definition',
    passo: (cx) => adt.deploySource(cx, {
      type: 'serviceDefinition', name: 'ZSPIKE_ADT_SRVD', pkg: PKG,
      description: 'Spike ADT - service definition', source: RAP_SRVD,
    }) },

  // Não é source-based: é config. E depois de ativar, PUBLICA — vira um endpoint OData de verdade.
  { nome: 'ZSPIKE_ADT_SB', type: 'serviceBinding', rotulo: 'SRVB/SVB service binding + publish',
    passo: async (cx) => {
      const r = await adt.deployServiceBinding(cx, {
        name: 'ZSPIKE_ADT_SB', srvd: 'ZSPIKE_ADT_SRVD', category: '1', version: 'V4',
        pkg: PKG, description: 'Spike ADT - service binding',
      });
      const p = await adt.publishServiceBinding(cx, { name: 'ZSPIKE_ADT_SB', version: 'V4' });
      const url = adt.odataV4RuntimeUrl('ZSPIKE_ADT_SB', 'ZSPIKE_ADT_SRVD');
      return { ...r, publicado: p.ok, publishMsg: p.message, severity: p.severity, url };
    } },
];

// Ordem INVERSA da criação, para o `--limpar`. A pool entra junto do BDEF (não está em OBJETOS).
const PARA_LIMPAR = [
  { nome: 'ZSPIKE_ADT_SB', type: 'serviceBinding', despublicar: true },
  { nome: 'ZSPIKE_ADT_SRVD', type: 'serviceDefinition' },
  { nome: 'ZSPIKE_ADT_R_TAB', type: 'behaviorDefinition' }, // BDEF: mesmo nome da root entity
  { nome: 'ZSPIKE_ADT_BP', type: 'class' },
  { nome: 'ZSPIKE_ADT_R_TAB', type: 'cds' },
  { nome: 'ZSPIKE_ADT_I', type: 'include' },
  { nome: 'ZSPIKE_ADT_P', type: 'prog' },
  { nome: 'ZSPIKE_ADT_MSG', type: 'msag' },
  { nome: 'ZSPIKE_ADT_CL', type: 'class' },
  { nome: 'ZSPIKE_ADT_IF', type: 'interface' },
  { nome: 'ZSPIKE_ADT_CDS', type: 'cds' },
  { nome: 'ZSPIKE_ADT_STR', type: 'structure' },
  { nome: 'ZSPIKE_ADT_TAB', type: 'table' },
  { nome: 'ZSPIKE_ADT_DE', type: 'dataElement' },
  { nome: 'ZSPIKE_ADT_DOM', type: 'domain' },
];

/**
 * Grava o fonte SEM ativar. O `deploySource` sempre ativa, e há casos em que ativar sozinho é o
 * erro: BDEF e behavior pool só ativam na MESMA requisição (`activateMany`).
 */
async function gravarSemAtivar(conexao, type, name, source, description) {
  adt.assertZY(name);
  const s = await conexao.sessao();
  const existing = await adt.getObject(s, type, name);
  if (!existing.exists) await adt.createShell(s, type, name, { pkg: PKG, description });
  const h = await adt.lock(s, type, name);
  try { await adt.setSource(s, type, name, source, h); }
  finally { await adt.unlock(s, type, name, h); }
  return { created: !existing.exists };
}

// ---------------------------------------------------------------------------------------------

// Usa a sessão do `connect` — sem senha. Isto só é possível porque foi MEDIDO (DEV:100, 2026-08-05)
// que o `activate` funciona na mesma sessão depois do `unlock`; ver sap-connection.mjs.
async function abrirConexao() {
  const { conexao, cfg, info } = conexaoAtual();
  console.log(`Alvo: ${cfg.alias.toUpperCase()} mandante ${cfg.client} idioma ${cfg.lang} · pacote ${PKG}`);
  console.log(`      ${cfg.base}  usuário ${cfg.user}  · sessão até ${new Date(info.expiraEm).toLocaleTimeString('pt-BR')}\n`);
  return { conexao, cfg };
}

// Ativação pode voltar `ok:false` com mensagens — mostrar as de erro/aviso é metade do valor do spike.
function resumoAtivacao(r) {
  const msgs = r?.activate?.messages || [];
  const relevantes = msgs.filter((m) => m.type === 'E' || m.type === 'W');
  if (!relevantes.length) return '';
  return relevantes.map((m) => `\n         ${m.type}: ${m.text}`).join('');
}

async function criar(conexao) {
  console.log('─'.repeat(78));
  console.log('CRIANDO'.padEnd(78));
  console.log('─'.repeat(78));
  const falhas = [];
  for (const o of OBJETOS) {
    process.stdout.write(`  ${o.rotulo.padEnd(34)} ${o.nome.padEnd(16)} `);
    try {
      const r = await o.passo(conexao);
      const criado = r.created ? 'criado' : 'já existia';
      const ativo = r.activated === undefined ? 'nasce ativo' : (r.activated ? 'ativado' : 'NÃO ATIVOU');
      console.log(`${criado} · ${ativo}${resumoAtivacao(r)}`);
      if (r.publicado !== undefined) {
        console.log(`         publish: ${r.publicado ? 'OK' : `FALHOU (${r.severity}) ${r.publishMsg || ''}`}`);
        if (r.publicado) console.log(`         endpoint: ${r.url}`);
        else falhas.push(`${o.nome} (publish)`);
      }
      if (r.activated === false) falhas.push(o.nome);
    } catch (e) {
      console.log(`ERRO`);
      console.log(`         ${String(e.message).split('\n').join('\n         ')}`);
      falhas.push(o.nome);
    }
  }
  return falhas;
}

// Exercita o resto da lib nos objetos recém-criados — é o que prova que ela funciona de ponta a ponta.
async function exercitar(conexao) {
  console.log('\n' + '─'.repeat(78));
  console.log('EXERCITANDO A LIB');
  console.log('─'.repeat(78));

  try {
    const t = await adt.runUnitTests(conexao, { type: 'class', name: 'ZSPIKE_ADT_CL' });
    console.log(`  runUnitTests            executados ${t.executed} · passaram ${t.passed} · falharam ${t.failed}`);
    console.log(`                          ⚠ com o regex guloso antigo isto contaria 1, não ${t.executed}`);
    for (const f of t.failures) console.log(`     ✗ ${f.name}: ${f.alerts[0]?.title || ''}`);
  } catch (e) { console.log(`  runUnitTests            ERRO: ${e.message.split('\n')[0]}`); }

  try {
    const c = await adt.runUnitTestsWithCoverage(conexao, { type: 'class', name: 'ZSPIKE_ADT_CL' });
    console.log(`  cobertura (statement)   ${c.statement === null ? 'não veio' : c.statement + '%'}`);
  } catch (e) { console.log(`  cobertura               ERRO: ${e.message.split('\n')[0]}`); }

  try {
    const d = await adt.dataPreview(conexao, 'SELECT * FROM zspike_adt_tab', { rows: 5 });
    console.log(`  dataPreview             colunas [${d.columns.join(', ')}] · ${d.rows.length} linha(s)`);
  } catch (e) { console.log(`  dataPreview             ERRO: ${e.message.split('\n')[0]}`); }

  // O guard-rail tem que RECUSAR — se isto não lançar, o guard-rail está furado.
  try {
    await adt.dataPreview(conexao, 'DELETE FROM zspike_adt_tab');
    console.log(`  guard-rail SQL          ⚠️  NÃO RECUSOU — o guard-rail está furado`);
  } catch (e) { console.log(`  guard-rail SQL          recusou o DELETE ✓`); }
}

async function listar(conexao) {
  console.log('\n' + '─'.repeat(78));
  console.log('O QUE FICOU NO SISTEMA');
  console.log('─'.repeat(78));
  const s = await conexao.sessao();
  const { itens } = await buscar(s, 'ZSPIKE_ADT*', []);
  if (!itens.length) { console.log('  (nada encontrado)'); return; }
  for (const i of itens) {
    console.log(`  ${i.nome.padEnd(18)} ${i.tipo.padEnd(9)} ${(i.pacote || '').padEnd(10)} ${i.descricao || ''}`);
  }
  console.log(`\n  ${itens.length} objeto(s).`);
}

async function limpar(conexao) {
  console.log('\n⚠️  Isto APAGA no SISTEMA CONECTADO, mandante 100, e é IRREVERSÍVEL:');
  for (const o of PARA_LIMPAR) {
    console.log(`     ${o.nome.padEnd(18)} ${o.type}${o.despublicar ? '  (despublica o OData antes)' : ''}`);
  }
  const r = await perguntar('\nDigite APAGAR para confirmar: ');
  if (r !== 'APAGAR') { console.log('Cancelado — nada foi tocado.'); return; }

  for (const o of PARA_LIMPAR) {
    process.stdout.write(`  ${o.nome.padEnd(18)} `);
    try {
      // Um service binding PUBLICADO não pode ser apagado — despublica primeiro.
      if (o.despublicar) {
        const u = await adt.unpublishServiceBinding(conexao, { name: o.nome, version: 'V4' });
        process.stdout.write(`unpublish ${u.ok ? 'OK' : `(${u.severity || 'sem resposta'})`} · `);
      }
      const d = await adt.deleteObject(conexao, { type: o.type, name: o.nome, confirm: true });
      console.log(d.deleted ? 'apagado' : 'não existia');
    } catch (e) { console.log(`ERRO: ${e.message.split('\n')[0]}`); }
  }
}

const { conexao, cfg } = await abrirConexao();
try {
  if (LIMPAR) {
    await limpar(conexao);
    await listar(conexao);
  } else {
    const falhas = await criar(conexao);
    await exercitar(conexao);
    await listar(conexao);
    console.log(falhas.length
      ? `\n⚠️  ${falhas.length} com problema: ${falhas.join(', ')}`
      : `\n✓ os ${OBJETOS.length} passos passaram — todos os 13 tipos da lib criados e ativados.`);
    console.log('\nPara desfazer:  node spike-adt.mjs --limpar');
  }
} finally {
  cfg.pass = null; // some da memória
}
