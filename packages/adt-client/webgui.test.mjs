// webgui.test.mjs — parte pura do canal WebGUI: URL de transação, alvo, sinal de tela pronta e
// o polyfill que faz a tela deixar de ser um cadáver bonito. Nada aqui abre navegador; o E2E é o
// do item 1 da fila (docs/receita-webgui.md).
import { test, expect } from 'vitest';
import {
  CAMINHOS_CHROME, POLYFILL_RANDOMUUID, TECLAS, JS_CARIMBO,
  expressaoTransacao, urlWebgui, jsDoAlvo, nomeDoAlvo, jsTelaPronta, autorizacao, acharNavegador,
} from './webgui.mjs';

test('webgui: a expressão ~transaction abre a tela JÁ PREENCHIDA (o pulo da tela de entrada)', () => {
  // sem parâmetro é a transação crua — e aí o `*` não entra
  expect(expressaoTransacao('se16')).toBe('SE16');
  // com parâmetro+okcode é a forma medida no SXD: `*TCODE campo=valor;DYNP_OKCODE=ONLI`
  expect(expressaoTransacao('yjbv4029823', { parametros: { P_DOCNUM: 71 }, okcode: 'ONLI' }))
    .toBe('*YJBV4029823 P_DOCNUM=71;DYNP_OKCODE=ONLI');
  expect(expressaoTransacao('SA38', { parametros: { 'RS38M-PROGRAMMA': 'YJBV_R' } }))
    .toBe('*SA38 RS38M-PROGRAMMA=YJBV_R');
  expect(() => expressaoTransacao('')).toThrow(/informe o tcode/);
});

test('webgui: a URL sai do mesmo cfg do resto da lib, e o ~transaction vai escapado', () => {
  const cfg = { base: 'http://host:8000', client: '100', idioma: 'PT' };
  expect(urlWebgui(cfg)).toBe('http://host:8000/sap/bc/gui/sap/its/webgui?sap-client=100&sap-language=PT');

  const url = urlWebgui(cfg, { transacao: 'J1B1N', parametros: { P_DOCNUM: 71 }, okcode: 'ONLI' });
  // o espaço, o `=` e o `;` da expressão do ITS não podem sair crus na query (o `*` é sub-delim
  // e passa literal, como no `encodeURIComponent` do protótipo — foi assim que o SXD respondeu)
  expect(url).toContain('%7Etransaction=*J1B1N+P_DOCNUM%3D71%3BDYNP_OKCODE%3DONLI');
  expect(new URL(url).searchParams.get('~transaction')).toBe('*J1B1N P_DOCNUM=71;DYNP_OKCODE=ONLI');
  expect(new URL(url).pathname).toBe('/sap/bc/gui/sap/its/webgui');

  expect(() => urlWebgui({})).toThrow(/cfg sem \{ base \}/);
});

test('webgui: o alvo tem três formas — e o botão da barra casa pelo FIM do id, no filho -cnt', () => {
  // id: os ids do WebGUI têm ':' e '[]', que quebram seletor CSS — por isso getElementById
  expect(jsDoAlvo({ id: 'M0:50::btn[11]' })).toBe('document.getElementById("M0:50::btn[11]")');
  expect(jsDoAlvo('M0:50::btn[11]')).toBe(jsDoAlvo({ id: 'M0:50::btn[11]' }));
  expect(jsDoAlvo({ seletor: 'input#x' })).toBe('document.querySelector("input#x")');

  const js = jsDoAlvo({ okcode: 'btn[11]' });
  expect(js).toContain('e.id.endsWith("::btn[11]")');   // o prefixo muda por tela; o sufixo não
  expect(js).toContain("cont.id + '-cnt'");              // o container engloba texto oculto: o rect certo é o do -cnt
  expect(js).toContain('(e.offsetWidth || e.offsetHeight)');

  expect(() => jsDoAlvo({})).toThrow(/informe \{ id \}, \{ seletor \} ou \{ okcode \}/);
  expect(nomeDoAlvo({ okcode: 'btn[15]' })).toBe('okcode btn[15]');
  expect(nomeDoAlvo('X')).toBe('id X');
});

test('webgui: tela pronta NÃO olha document.title — olha controles [ct] e campos visíveis', () => {
  const js = jsTelaPronta();
  expect(js).not.toContain('document.title');            // medido: monta inteira com o título VAZIO
  expect(js).toContain("document.querySelectorAll('[ct]').length > 5");
  expect(js).toContain('e.offsetWidth || e.offsetHeight');
  expect(js).toContain("(document.body.innerText || '').length >= 200");
  expect(jsTelaPronta({ minimoTexto: 10, minimoControles: 0, minimoCampos: 0 })).toContain('.length >= 10');
  // o carimbo é o que prova a TROCA de tela (rede quieta não prova nada)
  expect(JS_CARIMBO).toContain('document.querySelectorAll(\'*\').length');
});

test('webgui: o polyfill de randomUUID é o que faz a tela deixar de ser inerte', () => {
  expect(POLYFILL_RANDOMUUID).toContain("typeof window.crypto.randomUUID !== 'function'");
  expect(POLYFILL_RANDOMUUID).toContain('getRandomValues');     // este existe em contexto inseguro
  expect(POLYFILL_RANDOMUUID).toContain('0x40');                // versão 4
  expect(POLYFILL_RANDOMUUID).toContain('0x80');                // variante
  // o polyfill roda como script de página: precisa ser uma expressão de JS válida por si só
  expect(() => new Function(POLYFILL_RANDOMUUID)).not.toThrow();
});

test('webgui: o Basic vai em todo request — e sem credencial se recusa antes de subir navegador', () => {
  expect(autorizacao({ user: 'U', pass: 'p' })).toBe('Basic ' + Buffer.from('U:p').toString('base64'));
  expect(() => autorizacao({ user: 'U' })).toThrow(/cfg sem \{ user, pass \}/);
  expect(() => autorizacao(null)).toThrow(/o ICF não desafia/);
});

test('webgui: navegador — candidatos conhecidos, e erro que diz onde procurou', () => {
  expect(CAMINHOS_CHROME[0]).toMatch(/chrome\.exe$/);
  expect(() => acharNavegador({ navegador: 'Z:/nao/existe/chrome.exe' })).toThrow(/não achado — procurei em Z:/);
  expect(Object.keys(TECLAS)).toContain('Enter');
  expect(TECLAS.F8.vk).toBe(119);
});
