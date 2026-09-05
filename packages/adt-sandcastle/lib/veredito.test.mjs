// veredito.test.mjs — o veredito do runner é PURO: item parseado → ação. Sem disco, sem sandcastle.
import { test, expect } from 'vitest';
import { parseFila } from 'adt-todo';
import { veredito, escolherFilas, lerArgs, resumoCurto, tituloBreve } from './veredito.mjs';

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
