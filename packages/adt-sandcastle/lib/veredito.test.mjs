// veredito.test.mjs — o veredito do runner é PURO: item parseado → ação. Sem disco, sem sandcastle.
import { test, expect } from 'vitest';
import { parseFila } from 'adt-todo';
import { veredito, escolherFilas, lerArgs, resumoCurto, tituloBreve, umaLinha, esperaDoLimite, ultimoLimite, esperaDoEvento, agoraLocal } from './veredito.mjs';

test('tituloBreve corta no "— detalhe" e no tamanho', () => {
  expect(tituloBreve('Anomalia do ROT — medido em 04/09: ~40 s depois')).toBe('Anomalia do ROT');
  expect(tituloBreve('IDEIA (POC X): listar includes. Medido em 04/09/2026 que o GET devolve')).toBe('IDEIA (POC X): listar includes');
  expect(tituloBreve('a'.repeat(150), 20)).toHaveLength(20);
});

test('resumoCurto: prefere o ÚLTIMO bloco <resumo> do agente, até 3 linhas, sem marcadores', () => {
  const out = 'blá\n<resumo>\n- primeiro\n</resumo>\n…\n<resumo>\n- um\n- dois\n- três\n- quatro\n</resumo>\n';
  expect(resumoCurto(out, 'nota', 'motivo')).toEqual(['um', 'dois', 'três']);
});

test('resumoCurto: sem bloco, usa a nota da fila; sem nota, o motivo; linhas longas são cortadas', () => {
  expect(resumoCurto('', 'resultado: fechado com POC', 'x')).toEqual(['resultado: fechado com POC']);
  expect(resumoCurto('', '', 'a sessão falhou')).toEqual(['a sessão falhou']);
  expect(resumoCurto('', 'y'.repeat(200), '', { largura: 50 })[0]).toHaveLength(50);
  expect(resumoCurto('', '', '')).toEqual([]);
});

const item = (md) => parseFila(md).itens[0];

test('veredito: item [x] → fechado', () => {
  expect(veredito(item('- [x] 7. feito\n> resultado: ok\n'))).toEqual({ acao: 'fechado' });
});

test('veredito: item bloqueado pelo agente → bloqueado (fica onde está)', () => {
  expect(veredito(item('- [ ] 7. aberto\n> bloqueado: pergunta ao Joris\n')).acao).toBe('bloqueado');
});

test('veredito: bloqueado até data futura ainda é bloqueado', () => {
  expect(veredito(item('- [ ] 7. aberto\n> bloqueado até 2999-01-01: janela fechada\n')).acao).toBe('bloqueado');
});

test('veredito: item aberto sem nada → adiar, com o estado no motivo', () => {
  const v = veredito(item('- [ ] 7. aberto\n'));
  expect(v.acao).toBe('adiar');
  expect(v.motivo).toContain('sem fechar nem bloquear');
  expect(v.motivo).toContain('aberto');
});

test('veredito: em andamento (handoff registrado) → adiar mesmo assim', () => {
  const v = veredito(item('- [ ] 7. aberto\n> em andamento: parou no passo 2\n'));
  expect(v.acao).toBe('adiar');
  expect(v.motivo).toContain('emAndamento');
});

test('veredito: sessão que estourou → adiar com o erro no motivo', () => {
  const v = veredito(item('- [ ] 7. aberto\n'), { erro: 'AgentIdleTimeoutError' });
  expect(v.acao).toBe('adiar');
  expect(v.motivo).toContain('AgentIdleTimeoutError');
});

test('veredito: item que sumiu da fila → sumiu, não adia', () => {
  expect(veredito(null).acao).toBe('sumiu');
});

test('escolherFilas: sem nome roda todas, na ordem; com nome só ela; nome inexistente estoura', () => {
  const todas = [{ nome: 'adt-client' }, { nome: 'adt-query' }];
  expect(escolherFilas(todas)).toEqual(['adt-client', 'adt-query']);
  expect(escolherFilas(todas, 'adt-query')).toEqual(['adt-query']);
  expect(() => escolherFilas(todas, 'nada')).toThrow(/não existe/);
});

test('lerArgs: padrões e sobrescrita', () => {
  expect(lerArgs([])).toMatchObject({ fila: null, max: null, modelo: 'claude-opus-5', idle: 1800, dry: false });
  expect(lerArgs(['--max', '5']).max).toBe(5);
  expect(lerArgs(['--fila', 'adt-query', '--max', '1', '--dry'])).toMatchObject({ fila: 'adt-query', max: 1, dry: true });
  expect(() => lerArgs(['--max', '0'])).toThrow(/--max/);
  expect(() => lerArgs(['--x'])).toThrow(/desconhecido/);
});

test('umaLinha: a quebra de linha vira separador — a nota da fila é uma linha só', () => {
  expect(umaLinha('claude-code exited with code 1:\nYou\'ve hit your session limit')).toBe(
    "claude-code exited with code 1: · You've hit your session limit",
  );
});

test('esperaDoLimite: só erro de limite espera; a hora do reset vem da mensagem, com 1 min de folga', () => {
  expect(esperaDoLimite(null)).toBeNull();
  expect(esperaDoLimite('idle timeout after 1800s')).toBeNull();
  const agora = new Date(2026, 8, 5, 19, 32, 0).getTime(); // 05/09/2026 19:32 local
  const e = esperaDoLimite("claude-code exited with code 1: · You've hit your session limit · resets 7:50pm (America/Sao_Paulo)", { agora });
  expect(e).toBe(18 * 60_000 + 60_000);
  // hora do reset já passou hoje → amanhã
  const madrugada = esperaDoLimite('rate limit · resets 7:50pm', { agora: new Date(2026, 8, 5, 20, 0, 0).getTime() });
  expect(madrugada).toBe((23 * 60 + 50) * 60_000 + 60_000);
  // sem hora legível → padrão
  expect(esperaDoLimite('rate_limit rejected', { padraoMs: 5 })).toBe(5);
});

test('lerArgs: o `--` que o pnpm repassa é ignorado', () => {
  expect(lerArgs(['--', '--dry']).dry).toBe(true);
});

test('ultimoLimite: pega o ÚLTIMO evento, usa a janela que rejeitou e ignora linha quebrada', () => {
  const log = [
    'Agent started',
    '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":1789228800,"rateLimitType":"seven_day","utilization":0.34,"unifiedWindows":{"five_hour":{"utilization":0.1,"resetsAt":1788720600},"seven_day":{"utilization":0.34,"resetsAt":1789228800}}}}',
    '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1788648600,"rateLimitType":"five_hour","utilization":1,"unifiedWindows":{"five_hour":{"utilization":1,"resetsAt":1788648600}}}}',
    '{"type":"rate_limit_event","rate_limit_i',           // linha cortada pela cauda
  ].join('\n');
  const e = ultimoLimite(log);
  expect(e).toEqual({ rejeitado: true, janela: 'five_hour', utilizacao: 1, resetsAtMs: 1788648600_000 });
  expect(ultimoLimite('nenhum evento aqui')).toBeNull();
});

test('esperaDoEvento: só `rejected` espera; o passado vira só a folga de 1 min', () => {
  const rej = { rejeitado: true, janela: 'five_hour', utilizacao: 1, resetsAtMs: 2_000_000 };
  expect(esperaDoEvento(rej, { agora: 1_000_000 })).toBe(1_000_000 + 60_000);
  expect(esperaDoEvento(rej, { agora: 9_000_000 })).toBeNull(); // reset já passou: evento VELHO
  expect(esperaDoEvento({ ...rej, rejeitado: false }, { agora: 1 })).toBeNull();
  expect(esperaDoEvento(null)).toBeNull();
});

test('agoraLocal: data e hora do FUSO DA MÁQUINA, não UTC', () => {
  const d = new Date(2026, 8, 6, 9, 5, 3); // 06/09/2026 09:05:03 local
  expect(agoraLocal(d)).toEqual({ data: '2026-09-06', hora: '09:05:03', carimbo: '2026-09-06 09:05' });
  // o UTC do toISOString saía adiantado em America/Sao_Paulo (-03:00) — era a origem do desencontro
  expect(agoraLocal(d).hora).not.toBe(d.toISOString().slice(11, 19));
});

test('escolherFilas: prefixo com *, lista por vírgula, sem duplicata e sem casar é erro', () => {
  const todas = [{ nome: 'adt-client' }, { nome: 'adt-query' }, { nome: 'adt-tools' }, { nome: 'sap-accelerate' }];
  expect(escolherFilas(todas)).toEqual(['adt-client', 'adt-query', 'adt-tools', 'sap-accelerate']);
  expect(escolherFilas(todas, 'adt*')).toEqual(['adt-client', 'adt-query', 'adt-tools']);
  expect(escolherFilas(todas, 'adt-query, sap-accelerate')).toEqual(['adt-query', 'sap-accelerate']);
  expect(escolherFilas(todas, 'adt*,adt-query')).toEqual(['adt-client', 'adt-query', 'adt-tools']);
  expect(() => escolherFilas(todas, 'zz*')).toThrow(/nenhuma fila começa com "zz"/);
  expect(() => escolherFilas(todas, 'inexistente')).toThrow(/não existe/);
});
