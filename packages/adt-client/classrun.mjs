// classrun.mjs — canal classrun: executar uma classe if_oo_adt_classrun e ler a saída do console.
//
// POST /sap/bc/adt/oo/classrun/<classe> — o mesmo endpoint do F9 do Eclipse. ABAP ≥ 7.52.
// É o canal genérico "executar código ABAP e ler o resultado" pela sessão ADT que a lib já tem.
// Validado por spike no S4H rel. 758 em 2026-08-26 — ver docs/canal-classrun.md e
// docs/receita-bdc-classrun.md (BDC dirigido pelo agente usa exatamente este canal).
//
// GOTCHAS MEDIDOS (por isso este módulo existe, em vez de um call() solto):
//   • HTTP 200 NÃO significa sucesso: erro de execução vem com status 200 e "Error: …" no body.
//     Quem decide é o BODY — interpretarSaida() encapsula isso.
//   • Logo após o activate, a MESMA sessão stateful que fez o deploy executa o LOAD ANTIGO da
//     classe e responde "Error: Class does not implement …" com o fonte novo já ativo — e não é
//     questão de tempo: medido (S4H, 2026-08-26) que 5 retries de 3s na mesma sessão continuam no
//     load antigo, enquanto uma sessão NOVA executa o load novo DE PRIMEIRA. Por isso deployAndRun
//     roda numa sessão nova quando há senha; o retry na mesma sessão é só o fallback só-cookie.

import { call, deploySource } from './adt-client.mjs';
import { encerrarSessao } from './sap-connection.mjs';
import { passo, detalhe } from './log.mjs';

/** O contrato do canal: 200 com "Error:" no body é FALHA. */
export function interpretarSaida(body) {
  const erro = /^Error:/.test(String(body));
  return { ok: !erro, saida: String(body), erro: erro ? String(body) : null };
}

/**
 * Executa a classe (que deve implementar if_oo_adt_classrun) e devolve { ok, saida, erro }.
 * `novaSessao: true` abre um logon próprio (exige senha no cfg) — necessário logo após um
 * deploy, para não cair no load antigo da sessão que ativou (ver gotcha no cabeçalho).
 */
export async function runClass(conexao, nome, { novaSessao = false, stateless = novaSessao } = {}) {
  passo(`classrun: ${nome}${novaSessao ? ` (sessão nova${stateless ? ', stateless' : ''})` : ''}`);
  // Sessão nova STATELESS por default: o classrun não precisa de contexto (medido 2026-08-29, S4H 758,
  // 200 com a saída), e uma sessão stateful nova por execução fica ÓRFÃ no servidor (nunca há logoff) —
  // ~30 delas e o ICM passa a responder "400 Session not found" a TODA requisição stateful, inclusive
  // o discovery; só ping, SOAP RFC e stateless seguem vivos. Ver docs/receita-tobj-sm30.md.
  const s = novaSessao ? await conexao.sessaoNova({ stateless }) : await conexao.sessao();
  let r;
  try {
    r = await call(s, {
      method: 'POST',
      path: `/sap/bc/adt/oo/classrun/${String(nome).toLowerCase()}`,
      accept: 'text/plain',
      stateless,
    });
  } finally {
    // Sessão que este módulo abriu, este módulo fecha — sessão viva depois do uso é erro (regra 2026-08-29).
    if (novaSessao) await encerrarSessao(s).catch(() => {});
  }
  if (r.status >= 400) throw new Error(`classrun ${nome} falhou (HTTP ${r.status}): ${r.text.slice(0, 200)}`);
  return interpretarSaida(r.text);
}

/**
 * Deploy da classe + execução. O caminho padrão de POC: o agente escreve o fonte, isto
 * cria/ativa ($TMP por default) e roda, devolvendo a saída.
 *
 * Com senha no cfg, a execução vai numa SESSÃO NOVA — é o que garante o load novo da classe
 * (ver gotcha no cabeçalho). Sem senha (conexão só-cookie), resta o retry na mesma sessão,
 * que PODE não convergir; nesse caso o ok:false pode ser tanto load antigo quanto erro real
 * da classe — o chamador decide olhando `erro`.
 */
export async function deployAndRun(conexao, { name, source, pkg = '$TMP', description = '' },
  { tentativas = 5, esperaMs = 3000 } = {}) {
  const dep = await deploySource(conexao, { type: 'class', name, source, pkg, description });
  // `activated: false` SEM mensagem de erro é o no-op do servidor: fonte idêntico ao já ativo
  // não executa ativação (activationExecuted="false", zero mensagens) — e isso não é falha.
  if (!dep.activated && dep.activate.hasError) {
    throw new Error(`ativação de ${name} falhou: ${dep.activate.messages.map((m) => m.text).join(' · ')}`);
  }
  if (!dep.activated) detalhe(`classrun ${name}: ativação não executada (fonte inalterado) — seguindo`);
  if (conexao.cfg.pass) {
    const r = await runClass(conexao, name, { novaSessao: true });
    return { ...r, created: dep.created, tentativa: 1 };
  }
  let r;
  for (let i = 1; i <= tentativas; i++) {
    r = await runClass(conexao, name);
    if (r.ok) return { ...r, created: dep.created, tentativa: i };
    detalhe(`classrun ${name}: "Error:" no body (${i}/${tentativas}) — load antigo ou erro real`);
    if (i < tentativas) await new Promise((ok) => setTimeout(ok, esperaMs));
  }
  return { ...r, created: dep.created, tentativa: tentativas };
}

/**
 * Libera ENQUEUEs órfãos do usuário cujo argumento (GARG) contém `padrao` — por classrun, com
 * `ENQUEUE_READ` + `ENQUE_DELETE` LOCAIS (ENQUE_DELETE não é RFC-enabled; por SOAP dá kernel rc=9).
 *
 * POR QUE EXISTE: um `deleteObject` deixa ENQUEUE preso no NOME do objeto (TRDIR, T100/T100A, RSDEO,
 * WBS_ENQUEUE_STRU…), e o create seguinte do MESMO nome — mesmo em outro logon — devolve
 * 403 "Usuário X já está processando Y". Medido 2026-08-28 (S4H 758): 9 locks de uma rodada de
 * POC removidos com subrc=0 e o create voltou a funcionar. Também vale para o lock de um PUT que
 * morreu antes do unlock (receita do FM wrapper). Exige classrun (≥ 7.52) e senha no cfg
 * (roda em sessão nova). Cria e deixa a classe `nome` em $TMP — apague depois com deleteObject.
 * Devolve { removidos, saida }.
 */
export async function liberarLocks(conexao, padrao, { name = 'YJBV_POC_CL_UNLOCK' } = {}) {
  const p = String(padrao).toUpperCase().replace(/'/g, "''");
  const source = `CLASS ${name.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION. INTERFACES if_oo_adt_classrun.
ENDCLASS.
CLASS ${name.toLowerCase()} IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    DATA lt_enq TYPE STANDARD TABLE OF seqg3.
    DATA lt_one TYPE STANDARD TABLE OF seqg3.
    DATA lv_subrc TYPE sy-subrc.
    DATA lv_n TYPE i.
    CALL FUNCTION 'ENQUEUE_READ' EXPORTING gclient = sy-mandt guname = '' TABLES enq = lt_enq EXCEPTIONS OTHERS = 1.
    LOOP AT lt_enq INTO DATA(ls) WHERE garg CS '${p}'.
      CLEAR lt_one. APPEND ls TO lt_one.
      CALL FUNCTION 'ENQUE_DELETE' EXPORTING check_upd_requests = 0 IMPORTING subrc = lv_subrc TABLES enq = lt_one.
      out->write( |DEL { ls-gname } { ls-garg } subrc={ lv_subrc }| ).
      lv_n = lv_n + 1.
    ENDLOOP.
    out->write( |locks_removidos={ lv_n }| ).
  ENDMETHOD.
ENDCLASS.`;
  const r = await deployAndRun(conexao, { name, source, description: 'libera ENQUEUE órfão (adt-client)' });
  if (!r.ok) throw new Error(`liberarLocks: ${r.erro}`);
  const removidos = Number((r.saida.match(/locks_removidos=(\d+)/) || [])[1] ?? 0);
  return { removidos, saida: r.saida.trim() };
}
