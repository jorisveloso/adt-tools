// fiori.test.mjs — parte pura do canal UI5: o id do controle, o endereço do item, a diferença de
// campos e a expressão do disparo por API (rodada aqui contra um `sap` de mentira, para provar a
// SEQUÊNCIA de eventos sem abrir navegador). O E2E é a POC do item 39
// (`sap-accelerate/work/POC_ui5_combobox/`, s4h 758/250, UI5 1.114.0, 05/09/2026).
import { test, expect } from 'vitest';
import {
  SUFIXOS_DE_DOM, idDoControle, jsControle, jsInventario, escolherItem,
  jsSelecionarPorPrograma, diferencaDeCampos,
} from './fiori.mjs';

const ITENS = [
  { id: '__item0', chave: 'URL', texto: 'URL' },
  { id: '__item1', chave: 'TR', texto: 'Transação' },
  { id: '__item2', chave: 'SO', texto: 'Semantic Object' },
];

test('fiori: o id do CONTROLE é o do DOM sem o sufixo que o UI5 renderiza', () => {
  expect(idDoControle('__xmlview9--targetTypeInput-inner')).toBe('__xmlview9--targetTypeInput');
  expect(idDoControle('__xmlview9--targetTypeInput-arrow')).toBe('__xmlview9--targetTypeInput');
  expect(idDoControle({ id: 'tipoInput-label' })).toBe('tipoInput');
  // sem sufixo conhecido, o id passa inteiro — inclusive o que TEM hífen no meio
  expect(idDoControle('AdminPage--CatalogConfiguration--TMTab')).toBe('AdminPage--CatalogConfiguration--TMTab');
  expect(SUFIXOS_DE_DOM).toContain('-inner');
  expect(() => idDoControle({})).toThrow(/informe o id do controle UI5/);
  expect(() => idDoControle('')).toThrow(/informe o id do controle UI5/);
});

test('fiori: achar o controle tem as DUAS vias — o UI5 2.x não tem getCore, o 1.114 não tem Element.getElementById', () => {
  const js = jsControle('tipoInput');
  expect(js).toContain(`sap.ui.require('sap/ui/core/Element')`);
  expect(js).toContain('getElementById("tipoInput")');
  expect(js).toContain('sap.ui.getCore ? sap.ui.getCore().byId("tipoInput")');
  // id com aspas não quebra a expressão
  expect(jsControle(`x"y`)).toContain('"x\\"y"');
});

test('fiori: o inventário lê o controle E os campos visíveis — é a comparação deles que prova a rerenderização', () => {
  const js = jsInventario('tipoInput');
  expect(js).toContain('getSelectedKey');
  expect(js).toContain('temSelectionChange');
  expect(js).toContain('c.getItems');
  expect(js).toContain('input, textarea, select, [contenteditable="true"]');
  expect(js).toContain('offsetWidth || e.offsetHeight'); // campo invisível não conta
});

test('fiori: o item se endereça pela CHAVE (estável) e pelo texto (muda com o idioma)', () => {
  expect(escolherItem(ITENS, 'TR').id).toBe('__item1');
  expect(escolherItem(ITENS, { chave: 'TR' }).id).toBe('__item1');
  expect(escolherItem(ITENS, { texto: 'Transação' }).id).toBe('__item1');
  expect(escolherItem(ITENS, { texto: '  Transação ' }).id).toBe('__item1');
  // string sem qualificar tenta a chave primeiro; se nenhuma chave bate, cai no texto
  expect(escolherItem(ITENS, 'Semantic Object').chave).toBe('SO');
  // { chave } NÃO aceita texto: quem disse "chave" quer chave
  expect(() => escolherItem(ITENS, { chave: 'Transação' })).toThrow(/não está na lista/);
});

test('fiori: o erro de item LISTA o que havia — "não achei" sozinho não diz o que fazer', () => {
  expect(() => escolherItem(ITENS, 'XX'))
    .toThrow('fiori: item "XX" não está na lista — tenho URL=URL | TR=Transação | SO=Semantic Object');
  expect(() => escolherItem([], 'TR')).toThrow(/\(lista vazia\)/);
  expect(() => escolherItem(ITENS)).toThrow(/informe o item/);
  expect(() => escolherItem(ITENS, '')).toThrow(/informe o item/);
});

// ─── o disparo por API, rodado contra um `sap` de mentira ────────────────────
// O que estes testes guardam está medido no s4h 758/250 em 05/09/2026 (UI5 1.114.0): `setSelectedKey`
// sozinho não dispara evento nenhum, `fireChange` sozinho não acorda o handler de um ComboBox, e o
// `sap.m.Select` não TEM `fireSelectionChange`. Daí a expressão disparar os dois e tolerar a falta.

const rodar = (js, sap) => new Function('window', 'sap', `return ${js}`)({ sap }, sap);

const controleFalso = ({ comSelectionChange = true } = {}) => {
  const registro = [];
  const c = {
    registro,
    setSelectedKey: (k) => { registro.push(`setSelectedKey(${k})`); c.chave = k; },
    getSelectedItem: () => ({ getText: () => 'Transação' }),
    getValue: () => 'Transação',
    fireChange: (p) => registro.push(`fireChange(${p.value})`),
  };
  if (comSelectionChange) c.fireSelectionChange = (p) => registro.push(`fireSelectionChange(${p.selectedItem.getText()})`);
  return c;
};

const sapFalso = (controle) => ({
  ui: {
    require: () => ({ getElementById: (id) => (id === 'tipoInput' ? controle : null) }),
    getCore: () => ({ byId: (id) => (id === 'tipoInput' ? controle : null), applyChanges: () => controle?.registro.push('applyChanges') }),
  },
});

test('fiori: o disparo por API faz a sequência INTEIRA — chave, selectionChange, change, repintura', () => {
  const c = controleFalso();
  expect(rodar(jsSelecionarPorPrograma('tipoInput', 'TR'), sapFalso(c))).toEqual({ ok: true });
  expect(c.registro).toEqual(['setSelectedKey(TR)', 'fireSelectionChange(Transação)', 'fireChange(Transação)', 'applyChanges']);
});

test('fiori: Select não tem selectionChange — o disparo continua, com o change que ele escuta', () => {
  const c = controleFalso({ comSelectionChange: false });
  expect(rodar(jsSelecionarPorPrograma('tipoInput', 'TR'), sapFalso(c))).toEqual({ ok: true });
  expect(c.registro).toEqual(['setSelectedKey(TR)', 'fireChange(Transação)', 'applyChanges']);
});

test('fiori: controle que não está na página dá motivo, não TypeError', () => {
  expect(rodar(jsSelecionarPorPrograma('sumiu', 'TR'), sapFalso(controleFalso())))
    .toEqual({ ok: false, motivo: 'controle não está na página' });
  // página sem UI5 nenhum: a expressão não estoura
  expect(rodar(jsSelecionarPorPrograma('tipoInput', 'TR'), undefined)).toEqual({ ok: false, motivo: 'controle não está na página' });
});

test('fiori: a rerenderização se mede pelos campos que entraram e saíram da tela', () => {
  const antes = ['targetTypeInput-inner', 'urlInput-inner'];
  const depois = ['targetTypeInput-inner', 'target_transactionInput-inner', 'target_system_aliasInput-inner'];
  expect(diferencaDeCampos(antes, depois)).toEqual({
    apareceram: ['target_transactionInput-inner', 'target_system_aliasInput-inner'],
    sumiram: ['urlInput-inner'],
    mudou: true,
  });
  // o sintoma do item 39: a chave mudou e o formulário ficou IGUAL — `mudou: false` é informação
  expect(diferencaDeCampos(antes, antes)).toEqual({ apareceram: [], sumiram: [], mudou: false });
  expect(diferencaDeCampos()).toEqual({ apareceram: [], sumiram: [], mudou: false });
});
