// fiori.test.mjs — parte pura do canal UI5: o id do controle, o endereço do item, a diferença de
// campos e a expressão do disparo por API (rodada aqui contra um `sap` de mentira, para provar a
// SEQUÊNCIA de eventos sem abrir navegador). O E2E é a POC do item 39
// (`sap-accelerate/work/POC_ui5_combobox/`, s4h 758/250, UI5 1.114.0, 05/09/2026).
import { test, expect } from 'vitest';
import {
  SUFIXOS_DE_DOM, idDoControle, jsControle, jsInventario, escolherItem,
  jsSelecionarPorPrograma, diferencaDeCampos,
  ehRecursoUi5, recursosSuspeitos, diagnosticoDaPagina, explicarSemUi5,
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

// ---------- a página sem UI5: escolher o que medir, e o veredito ----------

const CORE = '/sap/public/bc/ui5_ui5/resources/sap-ui-core.js';
const PRELOAD = '/sap/public/bc/ui5_ui5/resources/sap/m/library-preload.js';

test('fiori: recurso do UI5 é .js sob um diretório resources/', () => {
  expect(ehRecursoUi5(CORE)).toBe(true);
  expect(ehRecursoUi5(PRELOAD)).toBe(true);
  expect(ehRecursoUi5('/sap/bc/ui5_ui5/sap/zapp/resources/Component.js')).toBe(true);
  expect(ehRecursoUi5('/sap/public/bc/ui5_ui5/resources/sap/ui/core/themes/base/library.css')).toBe(false);
  expect(ehRecursoUi5('/sap/bc/gui/sap/its/webgui/script.js')).toBe(false);
  expect(ehRecursoUi5(undefined)).toBe(false);
});

test('fiori: quando a página denuncia script com 0 byte, só ele é medido', () => {
  const estado = {
    ui5: false,
    scripts: [CORE, PRELOAD],
    recursos: [
      { caminho: CORE, tipo: 'script', bytes: 0, transferidos: 220 },
      { caminho: PRELOAD, tipo: 'script', bytes: 3069030, transferidos: 800000 },
    ],
  };
  // baixar o preload de 3 MB para "conferir" seria custo puro: o alvo já está denunciado
  expect(recursosSuspeitos(estado)).toEqual([CORE]);
});

test('fiori: sem denúncia da página, vão os scripts UI5 declarados, com o sap-ui-core na frente', () => {
  const estado = {
    ui5: false,
    scripts: [PRELOAD, '/sap/bc/gui/sap/its/webgui/x.js', CORE],
    recursos: [{ caminho: '/sap/public/ping', tipo: 'navigation', bytes: 100 }],
  };
  expect(recursosSuspeitos(estado)).toEqual([CORE, PRELOAD]);
  expect(recursosSuspeitos(estado, { teto: 1 })).toEqual([CORE]);
  // página que não pediu recurso UI5 nenhum não tem o que medir
  expect(recursosSuspeitos({ ui5: false, scripts: [], recursos: [] })).toEqual([]);
  expect(recursosSuspeitos(undefined)).toEqual([]);
});

test('fiori: o veredito separa "é o cache" de "não é o cache"', () => {
  // UI5 de pé: nem se olha a medição
  expect(diagnosticoDaPagina({ ui5: true }, [])).toEqual({ ui5: true, causa: null, envenenados: [] });

  // o modo de falha do item 67: gzip vazio, identity cheio
  const envenenado = { url: CORE, envenenado: true, encodingsVazios: ['gzip'], tamanho: 774788 };
  expect(diagnosticoDaPagina({ ui5: false }, [envenenado]))
    .toEqual({ ui5: false, causa: 'recurso-vazio', envenenados: [CORE] });

  // medido e inteiro: a página está sem UI5 por OUTRA causa — não invalidar nada
  const inteiro = { url: CORE, envenenado: false, encodingsVazios: [], tamanho: 774788 };
  expect(diagnosticoDaPagina({ ui5: false }, [inteiro]))
    .toEqual({ ui5: false, causa: 'nao-e-o-cache', envenenados: [] });

  // nada medido (nem havia o que medir)
  expect(diagnosticoDaPagina({ ui5: false }, []))
    .toEqual({ ui5: false, causa: 'sem-o-que-medir', envenenados: [] });
});

test('fiori: a explicação diz a causa medida, não "não carregou"', () => {
  expect(explicarSemUi5({ causa: 'recurso-vazio', envenenados: [CORE], recarregou: false }))
    .toContain('corpo VAZIO do cache do ICM');
  // curou, recarregou e ainda assim não subiu: a mensagem não pode insistir no cache
  expect(explicarSemUi5({ causa: 'recurso-vazio', envenenados: [CORE], recarregou: true }))
    .toContain('outra causa além do cache');
  expect(explicarSemUi5({ causa: 'nao-e-o-cache', medidos: [1, 2] })).toContain('INTEIROS');
  expect(explicarSemUi5({ causa: 'sem-o-que-medir' })).toContain('webgui');
});
