// tipos/functionGroupInclude.mjs — FUGR/I, include de grupo de funções. Forma `custom`, ANINHADO no FUGR.
// (POC 2026-08-29, item 11 da fila, S4H 758, objetos $TMP)
//
// POR QUE ISTO EXISTE: o corpo de um FM não comporta FORM nem declaração global — as duas moram em
// includes do grupo (L<GRUPO>TOP para dados, L<GRUPO>F01… para sub-rotinas). Sem isto, todo FM da lib
// é uma ilha; com isto, um grupo inteiro (dados globais + FORMs compartilhadas + N FMs) nasce pela lib.
//
// O nome é IMPOSTO pelo SAP: `L<GRUPO><SUFIXO>`. Quem passa pelo guard-rail Z/Y é o GRUPO — por isso
// o módulo declara `zyPeloContainer` (o include LYJBV_… não começa com Z/Y e seria recusado).
//
// Três gotchas, todos medidos em 2026-08-29 (S4H 758):
//   1. O create é `fincludes.v2+xml` — o v3 (que o FM usa) dá 415, e a resposta do 415 informa o
//      media type suportado. Ler o corpo do 415 economiza adivinhação.
//   2. O SAP escreve a linha `INCLUDE <inc>.` no pool `SAPL<GRUPO>` SOZINHO — mas só na versão
//      INATIVA. Ativar o include isolado deixa o pool ATIVO sem a linha, e aí qualquer FM que faça
//      PERFORM da FORM falha a ativação com "Programa SAPL<GRUPO> contém erros de sintaxe", sem
//      dizer o porquê. Por isso o deploy ativa `SAPL<GRUPO>` + include na MESMA requisição.
//   3. O ADT NÃO confere se o nome do include corresponde ao grupo: `LZOUTROGRUPOF01` foi aceito
//      dentro de YJBV_POC_I_FG (200). Só o `L` inicial é exigido (sem ele: 500 "Características para
//      programa … não gravadas"). A convenção é guard-rail NOSSO, antes da rede.
import { call } from '../sap-connection.mjs';
import { XML_PREF, esc } from './_xml.mjs';
import functionGroup from './functionGroup.mjs';

const CT = 'application/vnd.sap.adt.functions.fincludes.v2+xml';
const fugrPath = (fg) => `${functionGroup.coll}/${String(fg).toLowerCase()}`;
const incPath = (fg, inc) => `${fugrPath(fg)}/includes/${String(inc).toLowerCase()}`;

// Sufixo (o que se digita na SE80: TOP, F01, U01) ou nome completo? Uma regra só, usada pelo
// `nomeDoInclude` e pelo `validar` — senão o helper "consertaria" um include órfão em vez de recusá-lo.
// Nome completo é o que começa com L ou SAPL e passa de 4 caracteres; o resto é sufixo.
const ehNomeCompleto = (bruto) => /^(SAPL|L)/.test(bruto) && bruto.length > 4;

/** O nome que o SAP impõe: L<GRUPO><SUFIXO>. Aceita o sufixo ("F01") ou o nome já pronto. */
export const nomeDoInclude = (group, sufixoOuNome) => {
  const G = String(group).toUpperCase(), N = String(sufixoOuNome).toUpperCase();
  return ehNomeCompleto(N) ? N : `L${G}${N}`;
};
/** O programa principal do grupo — o pool que carrega os INCLUDEs (gotcha 2). */
export const nomeDoPool = (group) => `SAPL${String(group).toUpperCase()}`;

export function buildFunctionGroupIncludeBody(name, group, description) {
  const N = String(name).toUpperCase(), G = String(group).toUpperCase();
  return XML_PREF
    + `<finclude:abapFunctionGroupInclude xmlns:finclude="http://www.sap.com/adt/functions/fincludes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${N}" adtcore:type="FUGR/I" adtcore:description="${esc(description)}"><adtcore:containerRef adtcore:uri="${fugrPath(group)}" adtcore:type="FUGR/F" adtcore:name="${G}"/></finclude:abapFunctionGroupInclude>`;
}

const SOURCE_EXEMPLO = `FORM yjbv_poc_soma USING iv_a TYPE i iv_b TYPE i CHANGING cv_r TYPE i.
  cv_r = iv_a + iv_b.
ENDFORM.`;

/** @type {import('./_esquema.mjs').ModuloDeTipo} */
export default {
  libKey: 'functionGroupInclude', codigo: 'FUGR', adtType: 'FUGR/I',
  descricao: 'include de grupo de funções',
  sinonimos: ['include de grupo de funcoes', 'include de fugr', 'fugr include', 'finclude', 'include de funcao'],
  coll: functionGroup.coll,
  ct: CT,
  source: true,
  forma: 'custom',
  container: { libKey: 'functionGroup', param: 'group' },
  zyPeloContainer: true,
  nomeacao: { max: 30, fonte: 'typestructure do s4h 758 (OBJNAME_MAXLENGTH 30, fila 26) — mais restrito que o TRDIR-NAME 40 da doc; não medido por rejeição. O nome é derivado do grupo' },
  oQueFaz: 'Include de um grupo de funções (FUGR/I): onde moram as declarações globais (L<GRUPO>TOP) e as FORMs que os FMs do grupo chamam por PERFORM. É o que faz um FUGR virar um programa de verdade, e não uma coleção de FMs isolados.',
  comoTrata: 'Cria o FUGR se faltar → POST do metadata em groups/<fg>/includes (fincludes.v2) se o include não existe → lock por path → PUT /source/main → unlock → ativa o POOL SAPL<GRUPO> e o include na MESMA requisição (gotcha 2).',
  spike: { data: '2026-08-29', sistema: 'S4H', release: '758', revalidacoes: [] },
  releases: { medidos: ['758'] },
  guardRails: [
    'exige { group } — o path é aninhado (groups/<fg>/includes/<inc>); coll/<name> não existe',
    'o nome é L<GRUPO><SUFIXO> e quem passa pelo Z/Y é o GRUPO (zyPeloContainer) — o include LYJBV_… não começa com Z/Y',
    'o ADT aceita include cujo nome NÃO corresponde ao grupo (medido: LZOUTROGRUPOF01 dentro de YJBV_POC_I_FG → 200); a convenção é guard-rail nosso, antes da rede',
    'ativar o include SOZINHO não basta: a linha INCLUDE fica no pool INATIVO — o deploy ativa SAPL<GRUPO> + include juntos, senão o PERFORM de outro objeto falha com "contém erros de sintaxe"',
    'ativa na hora (activateMany com o pool): não participa da ativação diferida do deployMany',
    'não é source-based para deploySource (forma custom) — use deploy(conexao, "functionGroupInclude", …)',
  ],
  canais: ['adt', 'soapRfc'],
  origem: ['POC do item 11 da fila (2026-08-29, S4H 758)', 'docs/receita-fm-rfc-wrapper.md'],
  dependencias: [{ tipo: 'functionGroup', papel: 'contêiner (criado pelo deploy se faltar)', ativarJunto: false }],
  exemplo: {
    opts: { group: 'YJBV_POC_I_FG', name: 'F01', pkg: '$TMP', description: 'POC 11 include de FORM', source: SOURCE_EXEMPLO },
    nota: 'POC do item 11 (S4H 758, 2026-08-29): a FORM vive no include e o FM do grupo a chama por PERFORM — provado por SOAP RFC (EV_R = 42). `name` aceita o sufixo ("F01") ou o nome pronto ("LYJBV_POC_I_FGF01").',
  },
  testes: [
    {
      canal: 'readTable',
      descricao: 'o include existe como programa? TRDIR por NAME (o nome completo L<GRUPO><SUFIXO>)',
      assert: { readTable: { tabela: 'TRDIR', campos: ['NAME', 'SUBC'], where: ["NAME = 'LYJBV_POC_I_FGF01'"] }, espera: "1 linha; SUBC = 'I' (include)" },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
    {
      canal: 'soapRfc',
      descricao: 'a FORM do include resolve? FM RFC do mesmo grupo faz PERFORM dela e devolve o resultado — se o include não estivesse no pool ativo, o FM nem ativaria',
      assert: { callFunction: { fm: 'YJBV_POC_FM_INC', params: { IV_A: 17, IV_B: 25 } }, espera: 'EV_R = 42' },
      medido: [{ data: '2026-08-29', sistema: 'S4H', release: '758' }],
    },
  ],
  erros: [
    { status: 415, contem: 'fincludes', causa: 'create com fincludes.v3+xml (o media type do FM)', correcao: 'usar fincludes.v2+xml — a própria resposta do 415 lista o suportado' },
    { status: 500, contem: 'Características para programa', causa: 'nome do include sem o L inicial (ex.: YJBV_POC_I_FGX01)', correcao: 'nome L<GRUPO><SUFIXO> — o validar do módulo já recusa antes da rede' },
    { contem: 'contém erros de sintaxe', causa: 'o pool SAPL<GRUPO> ATIVO ainda não tem a linha INCLUDE (ela ficou na versão inativa) — quem faz PERFORM da FORM não ativa', correcao: 'ativar SAPL<GRUPO> junto do include (o deploy do módulo já faz); em objeto de terceiro, incluir o pool na unidade de ativação' },
  ],
  desmentidos: [
    {
      crenca: 'o nome do include de FUGR é um sufixo de 3 caracteres',
      fato: 'o sufixo é da SE80. No ADT o create e a URI usam o NOME COMPLETO (L<GRUPO><SUFIXO>): /functions/groups/<fg>/includes/lyjbv_poc_i_fgf01. A lib aceita o sufixo por conveniência e monta o nome.',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
    {
      crenca: 'o ADT garante que o include pertence ao grupo em que é criado',
      fato: 'não garante: LZOUTROGRUPOF01 foi criado dentro de YJBV_POC_I_FG com 200. O único filtro do servidor é o L inicial (sem ele, 500). Include órfão é problema de quem cria.',
      medido: { data: '2026-08-29', sistema: 'S4H' },
    },
  ],
  prova: (name, { group } = {}) => ({
    tabela: 'TRDIR', campos: ['NAME', 'SUBC'], where: [`NAME = '${nomeDoInclude(group ?? '', name)}'`],
    espera: "1 linha; SUBC = 'I' (include)",
    medido: true,
  }),
  validar({ group, name, source }) {
    if (!group) throw new Error('functionGroupInclude exige { group } — o path é aninhado (groups/<fg>/includes/<inc>)');
    if (!source) throw new Error('functionGroupInclude exige { source } — o include é source-based');
    const G = String(group).toUpperCase(), N = nomeDoInclude(group, name);
    if (N !== `SAPL${G}` && !N.startsWith(`L${G}`)) {
      throw new Error(`functionGroupInclude: "${name}" não é include do grupo ${group} — o nome tem de ser L${G}<SUFIXO> (o ADT aceitaria, e o include nasceria órfão)`);
    }
  },
  path(name, { group } = {}) {
    if (!group) throw new Error('functionGroupInclude: informe { group } — o path é aninhado (groups/<fg>/includes/<inc>)');
    return incPath(group, nomeDoInclude(group, name));
  },
  body: (name, _pkg, description, def = {}) => buildFunctionGroupIncludeBody(nomeDoInclude(def.group, name), def.group, description),

  // Cria/atualiza um include do grupo e ativa junto com o pool. `source` é o corpo ABAP do include
  // (FORMs, ou declarações globais no TOP). Cria o FUGR antes se faltar. Idempotente. Nunca deleta.
  async deploy(ctx, conexao, { group, name, source, pkg = '$TMP', description = '', corrNr }) {
    ctx.assertZY(group);
    await ctx.deploy(conexao, 'functionGroup', { name: group, pkg, description, corrNr });
    const s = await conexao.sessao();
    const N = nomeDoInclude(group, name);
    const p = ctx.objPath('functionGroupInclude', N, { group });
    const metaBody = buildFunctionGroupIncludeBody(N, group, description);

    const existing = await call(s, { path: p, accept: 'application/*' });
    if (existing.status === 404) {
      const criar = `${fugrPath(group)}/includes` + (corrNr ? `?corrNr=${corrNr}` : '');
      const r = await call(s, { method: 'POST', path: criar, accept: 'application/*', contentType: CT, body: metaBody });
      if (r.status !== 200 && r.status !== 201) throw new Error(`create include ${N} falhou (${r.status}): ${r.text.slice(0, 300)}`);
    }
    await ctx.withLockPath(s, p, async (h) => {
      let ps = `${p}/source/main?lockHandle=${h}`; if (corrNr) ps += `&corrNr=${corrNr}`;
      const rs = await call(s, { method: 'PUT', path: ps, accept: 'text/plain', contentType: 'text/plain; charset=utf-8', body: source });
      if (rs.status >= 400) throw new Error(`PUT source do include ${N} falhou (${rs.status}): ${rs.text.slice(0, 300)}`);
    });

    // Pool + include na MESMA ativação (gotcha 2): sozinho, o include ativa e o pool ATIVO fica sem
    // a linha INCLUDE — o erro só aparece depois, na ativação de quem usa a FORM.
    const act = await ctx.activateMany(conexao, [
      { type: 'functionGroupInclude', name: nomeDoPool(group), group },
      { type: 'functionGroupInclude', name: N, group },
    ]);
    if (act.hasError) throw new Error(`ativação do include ${N} falhou: ${act.messages.map((m) => m.text).join(' · ')}`);
    return { created: existing.status === 404, activated: act.ok, name: N, activate: act };
  },
};
