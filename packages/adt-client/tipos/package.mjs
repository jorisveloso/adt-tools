// tipos/package.mjs — DEVC/K, pacote de desenvolvimento. Forma `custom`. (SPIKE 2026-08-28, S4H 758)
// A coleção nativa é `/sap/bc/adt/packages` (lida no discovery); o molde veio do GET de $TMP e
// SABAPDEMOS. Duas particularidades que tiram o pacote das formas genéricas:
//   • NASCE ATIVO — o POST devolve 201 com version="active"; o /activation responde 200 com
//     activationExecuted="false" (no-op). Chamar `activate` reportaria falso negativo.
//   • O NOME DECIDE O REGIME — `$…` é local (DLVUNIT LOCAL, sem TADIR); sem `$` é transportável, e
//     o create GERA UMA TR nova no sistema. Não é opção do chamador: é o que o SAP faz.
import { call } from '../sap-connection.mjs';
import { XML_PREF, esc } from './_xml.mjs';

const CT = 'application/vnd.sap.adt.packages.v2+xml';   // no create, o v1 dá 415 (medido)
const ACCEPT = 'application/*';

/** Um pacote cujo nome começa com `$` é local: nunca transportável, software component LOCAL. */
export const ehLocal = (name) => String(name).startsWith('$');

// UMA MODIFICAÇÃO DE PACOTE POR SESSÃO (medido 2026-08-28, S4H 758): na MESMA sessão stateful, o
// segundo lock devolve o MESMO lockHandle e o PUT sai 400 "O pacote … já está bloqueado" — o unlock
// não solta o pacote dentro da sessão que o modificou. Com sessão nova a cada modificação, 200/200.
// Sem senha em mãos (conexão só-cookie do `connect`) não há sessão nova: cai na cacheada, onde a
// PRIMEIRA modificação passa — também medido.
async function sessaoLimpa(conexao, { stateless = false } = {}) {
  try { return { s: stateless ? await conexao.sessaoStateless() : await conexao.sessaoNova(), propria: true }; }
  catch { return { s: await conexao.sessao(), propria: false }; }
}

/**
 * XML completo do pacote. PURO.
 * A ordem dos elementos é a do schema e o servidor a exige inteira: attributes, superPackage,
 * applicationComponent, transport, useAccesses, packageInterfaces, subPackages — faltando um, 400
 * "Elem.'…' esperado", um por vez (medido).
 */
export function buildPackageBody(name, { description = '', responsible, superPackage = '', applicationComponent = '', packageType = 'development', softwareComponent, transportLayer = '' } = {}) {
  const N = String(name).toUpperCase();
  const local = ehLocal(N);
  const swc = softwareComponent ?? (local ? 'LOCAL' : 'HOME');
  const layer = local ? '' : transportLayer;
  const sup = superPackage ? `<pak:superPackage adtcore:name="${esc(String(superPackage).toUpperCase())}"/>` : '<pak:superPackage/>';
  const ac = applicationComponent ? `<pak:applicationComponent pak:name="${esc(String(applicationComponent).toUpperCase())}"/>` : '<pak:applicationComponent/>';
  return `${XML_PREF}<pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${esc(N)}" adtcore:type="DEVC/K" adtcore:description="${esc(description)}" adtcore:masterLanguage="PT" adtcore:responsible="${esc(String(responsible ?? '').toUpperCase())}"><adtcore:packageRef adtcore:name="${esc(N)}"/><pak:attributes pak:packageType="${esc(packageType)}"/>${sup}${ac}<pak:transport><pak:softwareComponent pak:name="${esc(swc)}"/><pak:transportLayer pak:name="${esc(layer)}"/></pak:transport><pak:useAccesses/><pak:packageInterfaces/><pak:subPackages/></pak:package>`;
}

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'package', codigo: 'DEVC', adtType: 'DEVC/K',
  descricao: 'pacote',
  sinonimos: ['pacote', 'devc', 'pacote de desenvolvimento', 'development package'],
  coll: '/sap/bc/adt/packages',
  ct: CT,
  source: false,
  forma: 'custom',
  nomeacao: { max: 30, fonte: 'TDEVC-DEVCLASS é CHAR30; não medido por rejeição' },
  oQueFaz: 'Pacote de desenvolvimento (DEVC, SE21/SE80): o contêiner onde todo objeto ABAP nasce e o que decide se ele é transportável. Para a lib é o que faltava para um objeto nascer com NOME DEFINITIVO no lugar certo — a regra "tudo em $TMP" existia porque o ADT não move objeto de pacote.',
  comoTrata: 'create: POST no body completo (v2+xml) → 201 já ATIVO, sem activate. Alterar: lock → PUT(body) → unlock, também sem activate. O `$` do nome decide o regime (local vs transportável) e `responsible` é obrigatório em MAIÚSCULAS.',
  spike: { data: '2026-08-28', sistema: 'S4H', release: '758' },
  releases: { medidos: ['758'] },
  guardRails: [
    '`adtcore:responsible` é OBRIGATÓRIO e em MAIÚSCULAS — em minúsculas dá 400 PAK 049 "Indicar um usuário válido"; o módulo usa `conexao.cfg.user` quando o chamador não informa',
    'NÃO chamar activate: o pacote nasce ativo (ver desmentidos)',
    'nome com `$` = LOCAL (DLVUNIT LOCAL, KORRFLAG vazio, sem linha na TADIR); nome sem `$` = TRANSPORTÁVEL. SEM `corrNr` o create gera uma TR de workbench + tarefa NOVAS no sistema (medido: S4HK912769/770); COM `corrNr` a ordem informada é honrada — a tarefa do usuário nasce NELA no primeiro uso (medido 2026-08-31, fila 24; `cts.criarRequest` fornece o número). Desfazer o ciclo inteiro tem via medida: `cts.destravarRequest`/`desmancharRequest` + `removerTadirOrfa` (receita-change-request § Ciclo de vida). Pacote transportável segue decisão de gente',
    'pacote transportável exige `transportLayer` que exista — ler /sap/bc/adt/packages/valuehelps/transportlayers (layer inventada dá 400 TR 609)',
    'depois de criar um pacote TRANSPORTÁVEL, todo deploy dentro dele exige `corrNr` (400 ExceptionParameterNotFound "Parameter corrNr") — o pacote local não exige nada',
    'create só com Content-Type v2+xml (o v1+xml dá 415)',
    'UMA modificação por sessão: o unlock não solta o pacote dentro da sessão que o modificou (2º lock devolve o mesmo handle e o PUT dá 400 "já está bloqueado"). O `deploy` já abre sessão própria; quem chamar as primitivas à mão precisa fazer o mesmo',
  ],
  canais: ['adt'],
  origem: [
    'spike 2026-08-28 (fila item 10): discovery do s4h + GET de $TMP e SABAPDEMOS',
    'docs/pesquisa-tipos-adt-nao-cobertos.md § DEVC',
    'docs/ideias.md I15',
  ],
  dependencias: [{ tipo: 'package', papel: 'o `superPackage`, quando houver — precisa existir antes (vira TDEVC-PARENTCL)', ativarJunto: false }],
  exemplo: {
    opts: { name: '$YJBV_POC_PKG', description: 'POC pacote local' },
    nota: 'Pacote LOCAL do spike (S4H 758, 2026-08-28): sem `transportLayer`, sem TR, e a tabela YJBV_POC_PKG_T criada com `pkg: \'$YJBV_POC_PKG\'` nasceu com TADIR-DEVCLASS = $YJBV_POC_PKG. O transportável é o mesmo deploy sem o `$` e com `transportLayer` (ex.: { name: \'YJBV_POC_PKGT\', transportLayer: \'ZS4H\' }) — mas gera TR no sistema.',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o pacote existe no diretório de pacotes, visto de outra LUW (SOAP RFC) — e os campos dizem o regime',
      assert: {
        readTable: { tabela: 'TDEVC', campos: ['DEVCLASS', 'PARENTCL', 'DLVUNIT', 'KORRFLAG', 'PDEVCLASS'], where: ["DEVCLASS = '$YJBV_POC_PKG'"] },
        espera: "1 linha. LOCAL: DLVUNIT='LOCAL', KORRFLAG='' (medido). TRANSPORTÁVEL (YJBV_POC_PKGT): DLVUNIT='HOME', KORRFLAG='X', PDEVCLASS=<transportLayer> (medido). Sub-pacote: PARENTCL = o superPackage (medido).",
      },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'readTable',
      descricao: 'a prova que interessa: um objeto com nome definitivo NASCE dentro do pacote — é o que o `$TMP` obrigatório impedia',
      assert: {
        readTable: { tabela: 'TADIR', campos: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'], where: ["OBJECT = 'TABL'", "AND OBJ_NAME = 'YJBV_POC_PKG_T'"] },
        espera: "1 linha com DEVCLASS = '$YJBV_POC_PKG' (medido: deploy de table com pkg = o pacote novo, created+activated, DD02L AS4LOCAL='A').",
      },
      medido: [{ data: '2026-08-28', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    {
      status: 400, contem: 'responsável',
      causa: '`adtcore:responsible` vazio ou em minúsculas (PAK 049 "Indicar um usuário válido como responsável pelo pacote em vez de <user>")',
      correcao: 'passar `responsible` em MAIÚSCULAS — ou deixar o módulo usar `conexao.cfg.user` (que ele já sobe para maiúsculas)',
    },
    {
      status: 400, contem: 'esperado',
      causa: 'o body não traz todos os elementos do schema, na ordem (attributes, superPackage, applicationComponent, transport, useAccesses, packageInterfaces, subPackages) — o servidor reclama de um por vez',
      correcao: 'usar `buildPackageBody` (monta os sete, vazios quando não há conteúdo)',
    },
    {
      status: 400, contem: 'Nível de transporte',
      causa: 'o `transportLayer` do pacote transportável não existe no sistema (TR 609)',
      correcao: 'ler GET /sap/bc/adt/packages/valuehelps/transportlayers e usar um dos nomes de lá (no s4h 758: SAP, ZS4H)',
    },
    {
      status: 400, contem: 'corrNr',
      causa: 'não é o pacote que falhou: é um objeto sendo criado DENTRO de um pacote transportável sem `corrNr` (ExceptionParameterNotFound "Parameter corrNr wurde nicht gefunden")',
      correcao: 'passar `corrNr` no deploy do objeto (`cts.criarRequest` cria a ordem) — ou usar um pacote LOCAL (`$…`), que não exige TR',
    },
    {
      status: 415,
      causa: 'create com Content-Type application/vnd.sap.adt.packages.v1+xml — só o v2 é aceito na criação (o GET aceita os dois)',
      correcao: 'usar v2+xml (o `ct` do módulo)',
    },
    {
      status: 409, contem: 'já está bloqueado na ordem',
      causa: 'DELETE de pacote transportável com o corrNr da TAREFA — o lock CTS aponta a ORDEM pai. A entrada do pacote nasce na E071 da TAREFA, não na da ordem (medido 2026-08-29: E071 de S4HK912769 = 0 linhas, E071 de S4HK912770 = R3TR DEVC YJBV_POC_PKGT com LOCKFLAG=X) — `cts.lerRequestPorTabelas` mostra os dois lados',
      correcao: 'usar como corrNr a ordem PAI (E070-STRKORR da tarefa): com ela o DELETE saiu 200 (medido). Depois disso a TR fica com a entrada e o DELETE da própria TR sai 400 "contém objetos bloqueados" — desde a fila 24 a limpeza tem via medida: `cts.desmancharRequest` (unlock + TR_DELETE_COMM por driver) e `removerTadirOrfa` para a linha TADIR DELFLAG=X (receita-change-request § Ciclo de vida)',
    },
    {
      status: 400, contem: 'já está bloqueado',
      causa: 'segunda modificação do MESMO pacote na MESMA sessão: o create/PUT anterior prendeu o objeto e o unlock não o soltou (o lock seguinte devolve o mesmo handle). Não confundir com o 500 "já está bloqueado na ORDEM", que é lock de CTS',
      correcao: 'abrir sessão nova para cada modificação (é o que o `deploy` do módulo faz); sem senha em mãos, só a primeira modificação da sessão passa',
    },
  ],
  desmentidos: [
    {
      crenca: 'pacote ativa como todo objeto: create → activate',
      fato: 'nasce ativo. O POST devolve 201 e o GET já traz adtcore:version="active"; o POST em /sap/bc/adt/activation com a URI do pacote responde HTTP 200 com activationExecuted="false" e generationExecuted="true" — no-op. Aqui `activationExecuted="false"` NÃO é o erro transversal de "ativei a URI errada"',
      medido: { data: '2026-08-28', sistema: 'S4H' },
    },
    {
      crenca: 'o ADT REST só cria pacote não-transportável (é o que o sapcli documenta)',
      fato: 'cria transportável: o POST de YJBV_POC_PKGT com softwareComponent HOME + transportLayer ZS4H devolveu 201 com recordChanges="true", KORRFLAG=\'X\'. E sem `corrNr`: o próprio SAP gerou a TR de workbench e a tarefa ("Ordem gerada p/registro de modificações") — o pacote entrou NA TAREFA sozinho (`cts.lerRequest` mostra a ordem já com o objeto consolidado; `cts.lerRequestPorTabelas` mostra que a E071 da ordem está vazia)',
      medido: { data: '2026-08-28', sistema: 'S4H' },
    },
    {
      crenca: 'todo objeto criado prova-se pela TADIR',
      fato: 'pacote LOCAL não tem linha na TADIR (readTable OBJECT=\'DEVC\' devolveu 0 linhas para $YJBV_POC_PKG, enquanto o transportável YJBV_POC_PKGT devolveu 1). A prova de pacote é a TDEVC — que também diz o regime',
      medido: { data: '2026-08-28', sistema: 'S4H' },
    },
  ],
  validar({ name, transportLayer }) {
    const N = String(name ?? '').toUpperCase();
    if (!ehLocal(N) && !transportLayer) {
      throw new Error(`GUARD-RAIL: "${N}" não começa com "$", logo é pacote TRANSPORTÁVEL e exige transportLayer (ler /sap/bc/adt/packages/valuehelps/transportlayers). Para um pacote local, use "$${N}".`);
    }
  },
  prova: (name) => ({
    tabela: 'TDEVC', campos: ['DEVCLASS', 'PARENTCL', 'DLVUNIT', 'KORRFLAG', 'PDEVCLASS'],
    where: [`DEVCLASS = '${String(name).toUpperCase()}'`],
    espera: "1 linha. Local: DLVUNIT='LOCAL', KORRFLAG=''. Transportável: DLVUNIT='HOME', KORRFLAG='X', PDEVCLASS=<transportLayer>. PARENTCL = superPackage. Efeito: um objeto deployado com `pkg` = este nome sai com TADIR-DEVCLASS igual a ele.",
    medido: true,
  }),
  /**
   * create (nasce ativo) ou lock → PUT → unlock. Nunca ativa.
   * `responsible` cai no usuário da conexão — o SAP recusa vazio e recusa minúsculas.
   * UMA MODIFICAÇÃO POR SESSÃO (medido): daí o `sessaoLimpa` em cada ramo.
   */
  async deploy(ctx, conexao, opts) {
    const { name, description = '', corrNr } = opts;
    const body = buildPackageBody(name, { ...opts, responsible: opts.responsible ?? conexao.cfg?.user });
    const existing = await ctx.getObject(await conexao.sessao(), 'package', name);
    if (!existing.exists) {
      const { s, propria } = await sessaoLimpa(conexao, { stateless: true });
      await ctx.createShell(s, 'package', name, { description, corrNr, body, stateless: propria });
    } else {
      const { s } = await sessaoLimpa(conexao);
      const h = await ctx.lock(s, 'package', name);
      try {
        let p = `${ctx.objPath('package', name)}?lockHandle=${h}`; if (corrNr) p += `&corrNr=${corrNr}`;
        const r = await call(s, { method: 'PUT', path: p, accept: ACCEPT, contentType: CT, body });
        if (r.status >= 400) throw new Error(`PUT pacote ${name} falhou (${r.status}): ${(r.text.match(/<message lang="EN">([^<]*)/) || [])[1] || r.text.slice(0, 200)}`);
      } finally { await ctx.unlock(s, 'package', name, h); }
    }
    const final = await ctx.getObject(await conexao.sessao(), 'package', name);
    return {
      created: !existing.exists,
      activated: true,                       // nasce ativo — não há activate para DEVC (ver desmentidos)
      version: final.version,
      local: ehLocal(name),
    };
  },
};
