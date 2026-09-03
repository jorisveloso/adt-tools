// tipos/_registro.test.mjs — o registro com módulos FALSOS: validação do esquema, duplicatas,
// derivação de TYPES/TIPOS/sinônimos e resolução. Sem I/O, sem SAP.

import { test, expect } from 'vitest';
import { validarModulo, montarRegistro, criarResolucao, normalizar, dicaDeErro } from './_registro.mjs';
import { CAMPOS_OBRIGATORIOS } from './_esquema.mjs';

const base = (over = {}) => ({
  libKey: 'table', codigo: 'TABL', adtType: 'TABL/DT', descricao: 'tabela', sinonimos: ['tabela', 'tab'],
  coll: '/sap/bc/adt/ddic/tables', ct: 'application/vnd.sap.adt.tables.v2+xml', source: true, forma: 'source',
  oQueFaz: 'tabela transparente', comoTrata: 'source-based',
  spike: { data: '2026-07-19', sistema: 'DEV', release: '758' }, releases: { medidos: ['758'] }, guardRails: [],
  canais: ['adt'], origem: ['teste'], dependencias: [],
  exemplo: { opts: { name: 'ZX_EX' } },
  testes: [{ canal: 'classrun', descricao: 'd', assert: 'a', medido: [] }],
  erros: [],
  desmentidos: [],
  prova: (name) => ({ tabela: 'DD02L', campos: ['TABNAME'], where: [`TABNAME = '${name}'`], espera: '1', medido: false }),
  createBody: () => '<x/>',
  ...over,
});

test('desmentido sem medição não entra', () => {
  expect(() => validarModulo(base({ desmentidos: [{ crenca: 'c', fato: 'f' }] }), 'table.mjs')).toThrow(/folclore/);
  expect(() => validarModulo(base({ desmentidos: [{ crenca: 'c', fato: 'f', medido: { data: '2026-08-05', sistema: 'DEV' } }] }), 'table.mjs')).not.toThrow();
  expect(() => validarModulo(base({ desmentidos: [{ crenca: 'c', medido: { data: '2026-08-05', sistema: 'DEV' } }] }), 'table.mjs')).toThrow(/crenca e fato/);
});

test('conhecimento medido: exemplo Z/Y, canais/testes/erros/prova bem formados, nomeação respeitada', () => {
  expect(() => validarModulo(base({ exemplo: { opts: { name: 'SAPX' } } }), 'table.mjs')).toThrow(/exemplo.opts.name/);
  expect(() => validarModulo(base({ canais: ['fax'] }), 'table.mjs')).toThrow(/canais contém "fax"/);
  expect(() => validarModulo(base({ testes: [{ canal: 'telefone', descricao: 'd', assert: 'a', medido: [] }] }), 'table.mjs')).toThrow(/canal "telefone"/);
  expect(() => validarModulo(base({ testes: [{ canal: 'classrun', descricao: 'd', assert: 'a', medido: [{ data: 'ontem', sistema: 'X' }] }] }), 'table.mjs')).toThrow(/medido\[\]/);
  expect(() => validarModulo(base({ erros: [{ causa: 'c', correcao: 'x' }] }), 'table.mjs')).toThrow(/status ou contem/);
  expect(() => validarModulo(base({ erros: [{ status: 400, causa: 'c' }] }), 'table.mjs')).toThrow(/causa e correcao/);
  expect(() => validarModulo(base({ dependencias: [{ tipo: 'x' }] }), 'table.mjs')).toThrow(/dependencias\[0\]/);
  expect(() => validarModulo(base({ prova: () => ({}) }), 'table.mjs')).toThrow(/prova\(name\)/);
  expect(() => validarModulo(base({ nomeacao: { max: 3, fonte: 'doc' } }), 'table.mjs')).toThrow(/estoura nomeacao.max/);
  expect(() => validarModulo(base({ nomeacao: { max: 16, fonte: 'doc' } }), 'table.mjs')).not.toThrow();
});

test('dicaDeErro: casa por status, por trecho, pelo par, e cai nos transversais', () => {
  const mod = base({ erros: [
    { status: 422, contem: 'AD(102)', causa: 'nome longo', correcao: 'encurtar' },
    { contem: 'DT(205)', causa: 'reservada', correcao: 'renomear' },
  ] });
  expect(dicaDeErro(mod, new Error('create X falhou (422): AD(102) Selecionar um nome'))).toMatch(/nome longo[\s\S]*encurtar/);
  expect(dicaDeErro(mod, new Error('create X falhou (422): outra coisa'))).toBe('');            // status bate, trecho não
  expect(dicaDeErro(mod, new Error('ativação: dt(205) campo reservado'))).toMatch(/reservada/);   // sem caixa
  expect(dicaDeErro(mod, new Error('lock falhou (403): EU510 usuário já está processando'))).toMatch(/lock órfão/); // transversal
  expect(dicaDeErro(mod, new Error('GET falhou (406): x'))).toMatch(/Accept/);
  expect(dicaDeErro(mod, new Error('nada a ver'))).toBe('');
});

test('módulo válido passa; cada obrigatório ausente falha nomeando o campo', () => {
  expect(() => validarModulo(base(), 'table.mjs')).not.toThrow();
  for (const c of CAMPOS_OBRIGATORIOS) {
    const m = base(); delete m[c];
    expect(() => validarModulo(m, 'table.mjs'), c).toThrow(new RegExp(`ausente: ${c}`));
  }
});

test('libKey tem de ser o nome do arquivo', () => {
  expect(() => validarModulo(base(), 'tabela.mjs')).toThrow(/≠ nome do arquivo/);
});

test('forma exige o gancho correspondente; container exige path', () => {
  expect(() => validarModulo(base({ createBody: undefined }), 'table.mjs')).toThrow(/exige o gancho createBody/);
  expect(() => validarModulo(base({ forma: 'xml' }), 'table.mjs')).toThrow(/exige o gancho body/);
  expect(() => validarModulo(base({ forma: 'custom' }), 'table.mjs')).toThrow(/exige o gancho deploy/);
  expect(() => validarModulo(base({ forma: 'magica' }), 'table.mjs')).toThrow(/forma "magica"/);
  expect(() => validarModulo(base({ container: { libKey: 'x', param: 'group' } }), 'table.mjs')).toThrow(/exige o gancho path/);
});

test('campos desconhecidos e tipos errados falham', () => {
  expect(() => validarModulo(base({ bolacha: 1 }), 'table.mjs')).toThrow(/desconhecido: bolacha/);
  expect(() => validarModulo(base({ source: 'sim' }), 'table.mjs')).toThrow(/source deveria ser boolean/);
  expect(() => validarModulo(base({ codigo: 'tabl' }), 'table.mjs')).toThrow(/TADIR/);
  expect(() => validarModulo(base({ adtType: 'CLAS/OC' }), 'table.mjs')).toThrow(/não começa pelo codigo/);
});

test('release medido tem de constar no spike — não se inventa release', () => {
  expect(() => validarModulo(base({ releases: { medidos: ['816'] } }), 'table.mjs')).toThrow(/"816".*não consta/);
  expect(() => validarModulo(base({ spike: { data: null, sistema: 'DEV' }, releases: { medidos: [] } }), 'table.mjs')).not.toThrow();
  expect(() => validarModulo(base({ spike: { data: '19/07/2026', sistema: 'DEV' } }), 'table.mjs')).toThrow(/YYYY-MM-DD/);
});

const structure = (over = {}) => base({ libKey: 'structure', adtType: 'TABL/DS', descricao: 'estrutura', sinonimos: ['estrutura'], coll: '/sap/bc/adt/ddic/structures', ...over });
const prog = () => base({ libKey: 'prog', codigo: 'PROG', adtType: 'PROG/P', descricao: 'programa', sinonimos: ['report', 'relatorio'], sinonimosDoCodigo: ['programa'], coll: '/p' });
const include = () => base({ libKey: 'include', codigo: 'PROG', adtType: 'PROG/I', descricao: 'include', sinonimos: ['inc'], coll: '/i', accept: 'application/*' });
const fm = () => base({
  libKey: 'functionModule', codigo: 'FUGR', adtType: 'FUGR/FF', descricao: 'function module', sinonimos: ['fm'], coll: '/g', forma: 'custom',
  container: { libKey: 'functionGroup', param: 'group' }, path: (n, { group }) => `/g/${group}/fmodules/${n}`, deploy: async () => ({}), createBody: undefined,
});

test('duplicata de libKey e de adtType falham no load', () => {
  expect(() => montarRegistro([base(), base()])).toThrow(/libKey duplicado: table/);
  expect(() => montarRegistro([base(), base({ libKey: 'tabela2' })], ['table.mjs', 'tabela2.mjs'])).toThrow(/adtType duplicado: TABL\/DT/);
});

test('sinônimo que aponta para dois módulos diferentes é ambíguo', () => {
  expect(() => montarRegistro([base(), structure({ sinonimos: ['tab'] })])).toThrow(/"tab" ambíguo/);
});

test('TYPES projeta só coll/ct/accept/source; accept só quando existe', () => {
  const { TYPES } = montarRegistro([base(), include()]);
  expect(TYPES.table).toEqual({ coll: '/sap/bc/adt/ddic/tables', ct: 'application/vnd.sap.adt.tables.v2+xml', source: true });
  expect(TYPES.include).toEqual({ coll: '/i', ct: 'application/vnd.sap.adt.tables.v2+xml', source: true, accept: 'application/*' });
  expect(Object.isFrozen(TYPES)).toBe(true);
});

test('código com dois módulos: TIPOS agrupa, código resolve para os dois, sinônimo específico recorta', () => {
  const reg = montarRegistro([base(), structure(), prog(), include()]);
  expect(reg.TIPOS.TABL.alvos.map((a) => a.libKey)).toEqual(['table', 'structure']);
  expect(reg.TIPOS.TABL.descricao).toBe('tabela · estrutura');
  const { resolverTipo, resolverTipoOpcional, alvoDoAdtType, codigoDaLibKey, todasAsLibKeys } = criarResolucao(reg);
  expect(resolverTipo('TABL').alvos.map((a) => a.libKey)).toEqual(['table', 'structure']);
  expect(resolverTipo('tabelas').alvos.map((a) => a.libKey)).toEqual(['table']);
  expect(resolverTipo('Estrutura').alvos.map((a) => a.libKey)).toEqual(['structure']);
  // prog: libKey == código → resolve para os dois (comportamento antigo); report/include recortam
  expect(resolverTipo('prog').alvos).toHaveLength(2);
  expect(resolverTipo('programas').alvos).toHaveLength(2);
  expect(resolverTipo('report').alvos).toEqual([{ libKey: 'prog', adtType: 'PROG/P' }]);
  expect(resolverTipo('Relatório').alvos).toEqual([{ libKey: 'prog', adtType: 'PROG/P' }]);
  expect(resolverTipo('includes').alvos).toEqual([{ libKey: 'include', adtType: 'PROG/I' }]);
  expect(resolverTipo('inc').codigo).toBe('PROG');
  expect(resolverTipoOpcional('bolacha')).toBeNull();
  expect(() => resolverTipo('bolacha')).toThrow(/não reconhecido[\s\S]*TABL/);
  expect(alvoDoAdtType('TABL/DS')).toEqual({ codigo: 'TABL', libKey: 'structure', adtType: 'TABL/DS' });
  expect(alvoDoAdtType('XXXX/X')).toBeNull();
  expect(codigoDaLibKey('include')).toBe('PROG');
  expect(codigoDaLibKey('inexistente')).toBeNull();
  expect(todasAsLibKeys()).toEqual(['table', 'structure', 'prog', 'include']);
});

test('tipo com container sai de todasAsLibKeys, mas resolve e tem path', () => {
  const reg = montarRegistro([base(), fm()]);
  const { todasAsLibKeys, resolverTipo } = criarResolucao(reg);
  expect(todasAsLibKeys()).toEqual(['table']);
  expect(resolverTipo('fm').alvos[0].libKey).toBe('functionModule');
  expect(reg.MODULOS.functionModule.path('z_x', { group: 'zg' })).toBe('/g/zg/fmodules/z_x');
});

test('normalizar: caixa, acento, hífen/underscore, espaços', () => {
  expect(normalizar('  Elemento-de_Dados ')).toBe('elemento de dados');
  expect(normalizar('Relatório')).toBe('relatorio');
});
