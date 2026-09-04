// webgui.test.mjs — parte pura do canal WebGUI: URL de transação, alvo, sinal de tela pronta e
// o polyfill que faz a tela deixar de ser um cadáver bonito. Nada aqui abre navegador; o E2E é o
// do item 1 da fila (docs/receita-webgui.md).
import { test, expect } from 'vitest';
import {
  CAMINHOS_CHROME, POLYFILL_RANDOMUUID, TECLAS, JS_CARIMBO,
  expressaoTransacao, urlWebgui, jsDoAlvo, nomeDoAlvo, jsTelaPronta, JS_DYNPRO_PRESENTE, RE_SID_DA_DYNPRO,
  autorizacao, acharNavegador,
  OKCODES, okcodeDe, anotarBotoes,
  sidDoLsdata, campoDoSid, teclaDoBotao, rotuloLimpo, interpretarControle, montarTela, sidsDaTela,
  interpretarSonda, jsComando,
  filhoDiretoDeMenu, daBarraDeMenu, interpretarItemDeMenu, partirCaminhoDeMenu, acharItemDeMenu,
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

test('webgui: tela pronta NÃO olha document.title nem exige input — olha [ct] e a DYNPRO presente', () => {
  const js = jsTelaPronta();
  expect(js).not.toContain('document.title');            // medido: monta inteira com o título VAZIO
  expect(js).toContain("document.querySelectorAll('[ct]').length > 5");
  expect(js).toContain("(document.body.innerText || '').length >= 200");
  // fila 19: seleção do RSPARAM, lista ALV e menu têm ZERO input visível — o piso default é 0 e é `>=`
  expect(js).toContain('e.offsetWidth || e.offsetHeight).length >= 0');
  expect(jsTelaPronta({ minimoTexto: 10, minimoControles: 0, minimoCampos: 2 })).toContain('.length >= 2');
  // o casco (menu + barra) chega antes da dynpro e já tem 47 [ct]: quem prova a dynpro é o SID em usr/tbar[1]
  expect(js).toContain(JS_DYNPRO_PRESENTE);
  const re = RE_SID_DA_DYNPRO;
  expect(re.test('{"27":{"SID":"wnd[0]/tbar[1]/btn[8]","Type":"GuiButton"}}')).toBe(true);
  expect(re.test('{"14":{"SID":"wnd[0]/usr/chkALSOUSUB","Type":"GuiCheckBox"}}')).toBe(true);
  expect(re.test('{"27":{"SID":"wnd[0]/tbar[0]/btn[3]","Type":"GuiButton"}}')).toBe(false);  // casco
  expect(re.test('{"1":{"SID":"wnd[0]","Type":"GuiMainWindow"}}')).toBe(false);              // casco
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

test('webgui: o btn[n] é o endereço ESTÁVEL — e o mapa só carrega o que foi medido', () => {
  // o prefixo M0:nn muda por tela; o sufixo ::btn[n] não — é o que o mapa e o alvo exploram
  expect(OKCODES['btn[11]'].nome).toBe('Gravar');
  expect(OKCODES['btn[8]'].tecla).toBe('F8');
  expect(OKCODES['btn[15]'].apelidos).toContain('Sair');
  // toda entrada carrega a MEDIÇÃO que a pôs aqui (sistema + data): mapa não é palpite
  for (const [k, v] of Object.entries(OKCODES)) {
    expect(k).toMatch(/^btn\[\d+\]$/);
    expect(v.medido).toMatch(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
  }
});

test('webgui: okcodeDe aceita btn[n], número e apelido — e recusa apelido inventado', () => {
  expect(okcodeDe('btn[11]')).toBe('btn[11]');
  expect(okcodeDe('BTN[11]')).toBe('btn[11]');
  expect(okcodeDe(11)).toBe('btn[11]');
  expect(okcodeDe('11')).toBe('btn[11]');
  expect(okcodeDe('Gravar')).toBe('btn[11]');
  expect(okcodeDe(' gravar ')).toBe('btn[11]');
  expect(okcodeDe('Sair')).toBe('btn[15]');       // apelido do "Encerrar" lido na tela
  expect(okcodeDe('Executar')).toBe('btn[8]');
  // btn[n] fora do mapa PASSA: o mapa é apelido, não whitelist
  expect(okcodeDe('btn[42]')).toBe('btn[42]');
  expect(okcodeDe(42)).toBe('btn[42]');
  // apelido errado estoura AQUI, com a lista — não vira "não está na tela" 20 s depois
  expect(() => okcodeDe('Salvar')).toThrow(/não é btn\[n\] nem apelido conhecido — tenho .*Gravar=btn\[11\]/);
  expect(() => okcodeDe('')).toThrow(/informe o btn\[n\]/);
});

test('webgui: o alvo por okcode aceita o apelido, e a mensagem de erro mostra o btn[n] resolvido', () => {
  expect(jsDoAlvo({ okcode: 'Gravar' })).toBe(jsDoAlvo({ okcode: 'btn[11]' }));
  expect(jsDoAlvo({ okcode: 8 })).toContain('e.id.endsWith("::btn[8]")');
  expect(nomeDoAlvo({ okcode: 'Gravar' })).toBe('okcode btn[11]');
  expect(nomeDoAlvo({ okcode: 'Salvar' })).toBe('okcode Salvar');   // não resolveu: mostra o que veio
});

test('webgui: botoes vem anotado com o apelido medido, e botão fora do mapa não vira erro', () => {
  expect(anotarBotoes([{ okcode: 'btn[11]', title: 'Gravar (Ctrl+S)' }])).toEqual([
    { okcode: 'btn[11]', title: 'Gravar (Ctrl+S)', nome: 'Gravar', tecla: 'Ctrl+S' },
  ]);
  expect(anotarBotoes([{ okcode: 'btn[42]', title: 'X' }])[0]).toMatchObject({ nome: null, tecla: null });
  expect(anotarBotoes()).toEqual([]);
});


// ---------------------------------------------------------------------------------------------
// Leitura ESTRUTURADA da tela (lsdata). Todo `lsdata` daqui para baixo é COPIADO do bruto medido
// no s4h 758/250 em 04/09/2026 — `sap-accelerate/work/POC_webgui_lsdata/medicoes/raw/*.json`.
// ---------------------------------------------------------------------------------------------

// Um campo da SE38, o rótulo dele, dois botões da barra, um radio, um checkbox e a barra de
// mensagem — cada um com o índice de SID que ele DE FATO usa.
const CAMPO_SE38 = {
  id: 'M0:46:::2:14', ct: 'CBS', title: 'Nome do programa ABAP', valor: 'RSPARAM', visivel: true,
  lsdata: { 1: 'FREETEXT', 3: 'M0:46:::2:14_TALB', 7: true, 13: 'P', 14: 'SERVER',
    21: { SID: 'wnd[0]/usr/ctxtRS38M-PROGRAMM', Type: 'GuiCTextField', value: '', maxlen: 40 },
    22: 'pstxt', 29: 'M0:46:::2:0' },
};
const ROTULO_SE38 = {
  id: 'M0:46:::2:0', ct: 'L', texto: 'Programa', visivel: true,
  lsdata: { 1: 'M0:46:::2:14', 3: 'Programa', 7: '100%', 12: 'P', 13: 'ENDOFLINE',
    19: { SID: 'wnd[0]/usr/lblRS38M-PROGRAMM', Type: 'GuiLabel' } },
};
const BOTAO_VOLTAR = {
  id: 'M0:56::btn[3]', ct: 'B', title: 'Voltar (F3)', texto: null, visivel: true,
  lsdata: { 2: 'TRANSPARENT', 4: 'Voltar (F3)', 18: 'F3', 21: true, 22: 'BACK',
    27: { SID: 'wnd[0]/tbar[0]/btn[3]', Type: 'GuiButton' } },
};
const BOTAO_EXECUTAR = {
  id: 'M0:48::btn[8]', ct: 'B', title: 'Executar (F8)', texto: 'Executar\n Destacado',
  accesskey: 'E', visivel: true,
  lsdata: { 0: 'Executar', 4: 'Executar (F8)', 17: 'E', 18: 'F8', 21: true, 25: 'TOGGLE',
    27: { SID: 'wnd[0]/tbar[1]/btn[8]', Type: 'GuiButton', SubType: 'toolbar' } },
};
const RADIO_MARCADO = {
  id: 'M0:46:::5:1', ct: 'R_standards', title: 'Editor', texto: 'Texto fonte', aria: 'true', visivel: true,
  lsdata: { 0: '%RBG0257', 1: true, 4: 'Texto fonte', 5: 'Editor', 10: 'T',
    13: { SID: 'wnd[0]/usr/radRS38M-FUNC_EDIT', Type: 'GuiRadioButton', group: '%RBG0257' }, 15: true },
};
const CHECKBOX = {
  id: 'M0:46:::0:3', ct: 'C_standards', texto: ':\nExibir também não substituído?', aria: 'false', visivel: true,
  lsdata: { 0: 'CheckBox', 4: 'Exibir também não substituído?', 9: 'E', 10: 'CHECKBOXLAST',
    14: { SID: 'wnd[0]/usr/chkALSOUSUB', Type: 'GuiCheckBox' }, 16: true, 18: true },
};
const BARRA_LIMPA = {
  id: 'wnd[0]/sbar_msg', ct: 'MB', visivel: false,
  lsdata: { 1: 'TEXT', 3: 'NONE',
    11: { SID: 'wnd[0]/sbar_msg', Type: 'MESSAGEBAR', visibility: 2, messageType: '', applicationText: '' },
    12: false, 13: true },
};
const BARRA_ERRO = {
  id: 'wnd[0]/sbar_msg', ct: 'MB', visivel: true, texto: 'O programa ZZNAOEXISTE9 não existe',
  lsdata: { 0: 'O programa ZZNAOEXISTE9 não existe', 1: 'ERROR', 5: 'O programa ZZNAOEXISTE9 não existe',
    6: true, 7: 'Exibir detalhes',
    11: { SID: 'wnd[0]/sbar_msg', Type: 'MESSAGEBAR', visibility: 0, messageType: 'Erro',
      applicationText: 'O programa ZZNAOEXISTE9 não existe' } },
};
const GRID_ALV = {
  id: 'C102', ct: 'STCS', visivel: true,
  lsdata: { 10: 'MULTI', 13: 0,
    34: { id: 'C102', SID: 'wnd[0]/usr/cntlGRID1/shellcont/shell', Type: 'GuiGridView', editable: false,
      ColumnIDs: ['NAME', 'USER_VALUE', 'DEFAULT_VALUE', 'DEFAULT_USUBS_VALUE', 'DESCR'], totalRows: 1617 } },
};
const JANELA = {
  id: 'webguiPageLayout0', ct: 'PL', visivel: true,
  lsdata: { 1: { SID: 'wnd[0]', Type: 'GuiMainWindow' }, 2: 'pswnd0up' },
};
const OKCODE = {
  id: 'ToolbarOkCode', ct: 'CBS', title: 'Inserir código de transação', valor: '', visivel: false,
  lsdata: { 1: 'FREETEXT', 6: 'NONE', 13: 'o', 14: 'SERVER',
    21: { SID: 'wnd[0]/tbar[0]/okcd', Type: 'GuiOKCodeField', display: 'X' } },
};

test('webgui: o SID sai pelo VALOR, porque o índice muda de um tipo de controle para outro', () => {
  // é O achado do item 9: hard-codear lsdata['21'] acerta o campo e mente para todo o resto
  expect(sidDoLsdata(CAMPO_SE38.lsdata).indice).toBe('21');
  expect(sidDoLsdata(BOTAO_VOLTAR.lsdata).indice).toBe('27');
  expect(sidDoLsdata(ROTULO_SE38.lsdata).indice).toBe('19');
  expect(sidDoLsdata(RADIO_MARCADO.lsdata).indice).toBe('13');
  expect(sidDoLsdata(CHECKBOX.lsdata).indice).toBe('14');
  expect(sidDoLsdata(BARRA_ERRO.lsdata).indice).toBe('11');
  expect(sidDoLsdata(GRID_ALV.lsdata).indice).toBe('34');
  expect(sidDoLsdata(JANELA.lsdata).indice).toBe('1');
  // e o SID em si é o mesmo em todos
  expect(sidDoLsdata(CAMPO_SE38.lsdata).SID).toBe('wnd[0]/usr/ctxtRS38M-PROGRAMM');
  expect(sidDoLsdata(null)).toBe(null);
  expect(sidDoLsdata({ 0: 'Executar', 2: 'TRANSPARENT' })).toBe(null);
});

test('webgui: o nome do campo da URL ~transaction sai do SID, sem o prefixo de tipo', () => {
  expect(campoDoSid('wnd[0]/usr/ctxtRS38M-PROGRAMM')).toBe('RS38M-PROGRAMM');
  expect(campoDoSid('wnd[0]/usr/radRS38M-FUNC_EDIT')).toBe('RS38M-FUNC_EDIT');
  expect(campoDoSid('wnd[0]/usr/chkALSOUSUB')).toBe('ALSOUSUB');
  expect(campoDoSid('wnd[0]/usr/lblRS38M-PROGRAMM')).toBe('RS38M-PROGRAMM');
  expect(campoDoSid('wnd[0]')).toBe('wnd[0]');
  expect(campoDoSid(null)).toBe(null);
});

test('webgui: a tecla do botão é a CONSTANTE do lsdata, não o "(F8)" do tooltip', () => {
  expect(teclaDoBotao(BOTAO_EXECUTAR.lsdata)).toBe('F8');
  expect(teclaDoBotao({ 4: 'Verificar (Ctrl+F2)', 18: 'CTRL_F2' })).toBe('CTRL_F2');
  expect(teclaDoBotao({ 18: 'CTRL_SHIFT_F3' })).toBe('CTRL_SHIFT_F3');
  expect(teclaDoBotao({ 18: 'CTRL_S' })).toBe('CTRL_S');
  expect(teclaDoBotao({ 0: 'Menu', 2: 'TRANSPARENT' })).toBe(null);  // TRANSPARENT não é tecla
});

test('webgui: o rótulo é a 1ª linha do texto; sem texto, o tooltip SEM a tecla', () => {
  // o innerText do botão traz texto oculto do tema colado por \n
  expect(rotuloLimpo('Executar\n Destacado', 'Executar (F8)')).toBe('Executar');
  // botão da tbar[0] não tem texto — e o 1º valor do lsdata seria "TRANSPARENT", a constante de design
  expect(rotuloLimpo(null, 'Voltar (F3)')).toBe('Voltar');
  expect(rotuloLimpo('', 'Gravar (Ctrl+S)')).toBe('Gravar');
  expect(rotuloLimpo('', 'Lista de utilizações (Ctrl+Shift+F3)')).toBe('Lista de utilizações');
  expect(rotuloLimpo('', '')).toBe(null);
});

test('webgui: cada controle vira a peça que ele é — pelo Type que o próprio SAP põe no SID', () => {
  const campo = interpretarControle(CAMPO_SE38);
  expect(campo).toMatchObject({ papel: 'campo', campo: 'RS38M-PROGRAMM', valor: 'RSPARAM',
    maxlen: 40, editavel: true, dica: 'Nome do programa ABAP' });

  const botao = interpretarControle(BOTAO_EXECUTAR);
  expect(botao).toMatchObject({ papel: 'botao', okcode: 'btn[8]', rotulo: 'Executar', tecla: 'F8', accesskey: 'E' });

  // ⚠ a marcação vem do ARIA, NÃO do lsdata: medido que clicar no checkbox não mexe o lsdata
  expect(interpretarControle(RADIO_MARCADO)).toMatchObject({ papel: 'radio', campo: 'RS38M-FUNC_EDIT',
    grupo: '%RBG0257', selecionado: true, rotulo: 'Texto fonte' });
  expect(interpretarControle({ ...RADIO_MARCADO, aria: 'false' }).selecionado).toBe(false);
  expect(interpretarControle(CHECKBOX)).toMatchObject({ papel: 'checkbox', campo: 'ALSOUSUB',
    marcado: false, rotulo: 'Exibir também não substituído?' });

  expect(interpretarControle(GRID_ALV)).toMatchObject({ papel: 'grid', linhas: 1617, editavel: false,
    colunas: ['NAME', 'USER_VALUE', 'DEFAULT_VALUE', 'DEFAULT_USUBS_VALUE', 'DESCR'] });
  expect(interpretarControle(JANELA)).toMatchObject({ papel: 'janela', sid: 'wnd[0]', principal: true });
  expect(interpretarControle(OKCODE)).toMatchObject({ papel: 'okcode', sid: 'wnd[0]/tbar[0]/okcd', visivel: false });

  // a mensagem: o `messageType` do SID vem TRADUZIDO ("Erro") — a chave é a constante ("ERROR")
  expect(interpretarControle(BARRA_ERRO)).toMatchObject({ papel: 'mensagem', tipo: 'ERROR',
    texto: 'O programa ZZNAOEXISTE9 não existe' });
  expect(interpretarControle(BARRA_LIMPA)).toMatchObject({ papel: 'mensagem', tipo: null, texto: null });

  // controle sem SID (layout, container) não vira peça de tela — fica com papel null
  expect(interpretarControle({ id: 'u3F31C', ct: 'RLI', lsdata: { 0: 16, 2: 112 } }).papel).toBe(null);
});

test('webgui: a tela montada é o MODELO — e o rótulo do campo é costurado pelo LABEL ao lado', () => {
  const tela = montarTela(
    [JANELA, OKCODE, CAMPO_SE38, ROTULO_SE38, RADIO_MARCADO, BOTAO_VOLTAR, BOTAO_EXECUTAR, BARRA_ERRO],
    { titulo: 'Editor ABAP: 1ª tela' });

  expect(tela.titulo).toBe('Editor ABAP: 1ª tela');
  expect(tela.janela).toMatchObject({ sid: 'wnd[0]', principal: true });
  expect(tela.mensagem).toEqual({ tipo: 'ERROR', texto: 'O programa ZZNAOEXISTE9 não existe' });
  expect(tela.statusbar).toEqual(['O programa ZZNAOEXISTE9 não existe']);  // compat com o lerTela antigo

  // ⚠ o `title` do campo é do DATA ELEMENT ("Nome do programa ABAP"); o rótulo DA TELA é "Programa",
  // e quem o tem é o LABEL — que aponta o campo por um id guardado em índice qualquer do lsdata
  expect(tela.campos).toHaveLength(1);
  expect(tela.campos[0]).toMatchObject({ campo: 'RS38M-PROGRAMM', rotulo: 'Programa',
    dica: 'Nome do programa ABAP' });

  expect(tela.radios.map((r) => r.campo)).toEqual(['RS38M-FUNC_EDIT']);
  expect(tela.botoes.map((b) => b.okcode)).toEqual(['btn[3]', 'btn[8]']);
  expect(tela.okcode.sid).toBe('wnd[0]/tbar[0]/okcd');   // invisível, mas está lá
  expect(tela.checkboxes).toEqual([]);
});

test('webgui: sem mensagem a statusbar é vazia, e controle invisível não entra na tela', () => {
  const tela = montarTela([JANELA, OKCODE, BARRA_LIMPA, { ...CAMPO_SE38, visivel: false }]);
  expect(tela.mensagem).toBe(null);
  expect(tela.statusbar).toEqual([]);
  expect(tela.campos).toEqual([]);          // o campo invisível some
  expect(tela.okcode).not.toBe(null);       // o okcd NÃO: ele é sempre invisível e sempre serve
});

test('webgui: sids responde "qual o parâmetro da URL ~transaction" — o okcd fica de fora', () => {
  const tela = montarTela([JANELA, OKCODE, CAMPO_SE38, ROTULO_SE38, BOTAO_EXECUTAR], { titulo: 'SE38' });
  expect(sidsDaTela(tela)).toEqual([{
    id: 'M0:46:::2:14', title: 'Nome do programa ABAP', sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM',
    campo: 'RS38M-PROGRAMM', rotulo: 'Programa',
  }]);
  // o `campo` é o que abrirTransacao quer — a contra-prova do item 6 (RS38M-PROGRAMMA cala)
  expect(expressaoTransacao('SE38', { parametros: { [sidsDaTela(tela)[0].campo]: 'RSPARAM' } }))
    .toContain('RS38M-PROGRAMM=RSPARAM');
  expect(sidsDaTela(null)).toEqual([]);
  expect(sidsDaTela(montarTela([JANELA, OKCODE]))).toEqual([]);
});

test('webgui: a sonda não acredita no status — quem prova o canal é o cookie de sessão', () => {
  // caso medido no s4h 758/250 (04/09/2026): nó ativo + credencial aceita
  const ok = interpretarSonda({
    status: 200, statusText: 'OK', corpo: 'x'.repeat(35216),
    cookies: ['saplbS4H=3532650; path=/', 'SAP_SESSIONID_S4H_250=abc; path=/; secure; HttpOnly'],
  });
  expect(ok).toMatchObject({ ok: true, causa: 'ok', sid: 'S4H', mandante: '250', cookieSeguro: true });

  // MESMO status 200 — e o canal NÃO existe: é a página de logon. Este é o caso que uma sonda
  // ingênua erraria, subindo o Chrome para encalhar numa tela de logon.
  const errada = interpretarSonda({
    status: 200, statusText: 'OK', corpo: '<title>Logon</title>' + 'x'.repeat(23226),
    cookies: ['sap-login-XSRF_S4H=1; secure', 'sap-usercontext=sap-client=250'],
  });
  expect(errada).toMatchObject({ ok: false, causa: 'credencial' });
  expect(errada.motivo).toMatch(/PÁGINA DE LOGON/);
});

test('webgui: ausente e desativado são o MESMO 404 — a sonda não promete qual dos dois', () => {
  const r = interpretarSonda({ status: 404, statusText: 'Not found', corpo: '<title>Service cannot be reached</title>' });
  expect(r).toMatchObject({ ok: false, causa: 'sem-no' });
  expect(r.motivo).toMatch(/ausente OU desativado/);
});

test('webgui: cada recusa tem causa própria — nada de empilhar tudo em "não deu"', () => {
  // 403 do nó que só atende HTTPS (medido em /sap/bc/ui2/start_up)
  expect(interpretarSonda({ status: 403, statusText: 'Forbidden - SSL required' }))
    .toMatchObject({ ok: false, causa: 'ssl' });
  expect(interpretarSonda({ status: 403, statusText: 'Forbidden', corpo: '403 Forbidden' }))
    .toMatchObject({ ok: false, causa: 'proibido' });
  // 401 do nó que DESAFIA em vez de mostrar formulário (medido em /sap/bc/srt/lsc)
  expect(interpretarSonda({ status: 401, statusText: 'Unauthorized' }))
    .toMatchObject({ ok: false, causa: 'credencial' });
  expect(interpretarSonda({ status: 500, statusText: 'Internal Server Error' }))
    .toMatchObject({ ok: false, causa: 'erro-servidor' });
  // ICM fora do ar: não há status nenhum para interpretar
  expect(interpretarSonda({ erro: 'ENOTFOUND' }))
    .toMatchObject({ ok: false, causa: 'sem-icm', status: null });
  expect(interpretarSonda({ erro: 'TimeoutError' }).motivo).toMatch(/sem resposta do ICM/);
});

test('webgui: o OK-code do navegador escreve por JS e dispara o Enter NO PRÓPRIO campo invisível', () => {
  // medido no s4h 758/250 em 04/09/2026: `value` + `Enter` despachado no elemento produz o batch
  // `okcode/ses[0]` + `vkey/0/ses[0]` + `state/ur` — o mesmo da via HTTP pura. O campo é 0×0, então
  // nada aqui pode depender de clique, foco nativo ou digitação (que caem no campo com o cursor).
  const js = jsComando('/nSE16');
  expect(js).toContain("document.getElementById('ToolbarOkCode')");
  expect(js).toContain('el.value = "/nSE16"');
  expect(js).toContain('KeyboardEvent');
  expect(js).toContain("'keydown', 'keypress', 'keyup'");
  expect(js).not.toContain('click');    // clique no campo 0×0 é recusado por actionability
  expect(js).not.toContain('.focus()'); // foco por JS não move o cursor do renderer

  // contra-prova de forma: fcode da dynpro e tecla entram do mesmo jeito, sem tratamento especial
  expect(jsComando('ONLI')).toContain('el.value = "ONLI"');
  expect(jsComando(' /3 ')).toContain('el.value = "/3"');
  expect(() => jsComando('')).toThrow(/informe o OK-code/);
  expect(() => jsComando(null)).toThrow(/informe o OK-code/);
});

// ── O MENU DA BARRA (item 26) ────────────────────────────────────────────────
// Todo `lsdata` daqui é BRUTO da medição do s4h 758/250 em 2026-09-04
// (`sap-accelerate/work/POC_webgui_menu/medicoes/raw/se38-varredura.json`), não inventado.

test('menu: o id do item É o caminho — filho DIRETO, e só ele', () => {
  const raiz = 'wnd[0]/mbar';
  expect(filhoDiretoDeMenu(raiz, 'wnd[0]/mbar/menu[5]')).toBe(true);
  // neto NÃO é filho direto — é isto que impede a cascata de pular um nível
  expect(filhoDiretoDeMenu(raiz, 'wnd[0]/mbar/menu[5]/menu[3]')).toBe(false);
  expect(filhoDiretoDeMenu('wnd[0]/mbar/menu[5]', 'wnd[0]/mbar/menu[5]/menu[3]')).toBe(true);
  // o item do ITS (`wnd[0]/mbar/[1]`, "Browser de arquivo") não é `menu[n]` e fica de fora
  expect(filhoDiretoDeMenu(raiz, 'wnd[0]/mbar/[1]')).toBe(false);
  expect(filhoDiretoDeMenu(raiz, null)).toBe(false);
});

test('menu: o menu de INFORMAÇÃO DO SISTEMA também tem um "Sistema" — separar pelo id', () => {
  // medido: os dois existem na MESMA tela, com o MESMO rótulo. Casar por rótulo pega o errado.
  expect(daBarraDeMenu('wnd[0]/mbar/menu[5]')).toBe(true);
  expect(daBarraDeMenu('sysInfoAreaMenuItemSAPITS_MBAR_SYSTEM')).toBe(false);
  expect(daBarraDeMenu('wnd[0]/mbar/[2]')).toBe(false); // "Configurações..." é do ITS
  expect(daBarraDeMenu(undefined)).toBe(false);
});

test('menu: o vocabulário lsdata do POMNI — rótulo, atalho, submenu e início de grupo', () => {
  // "Sistema": tem submenu (índice 6) e o id do popup filho (7)
  const sistema = interpretarItemDeMenu({
    id: 'wnd[0]/mbar/menu[5]',
    lsdata: { 1: 'Sistema', 6: true, 7: 'mnu0_61', 18: { SID: 'wnd[0]/mbar/menu[5]', Type: 'GuiMenu' }, 19: 'Sistema', x: 0 },
    desabilitado: null,
  });
  expect(sistema).toMatchObject({ rotulo: 'Sistema', submenu: true, nivel: 0, sid: 'wnd[0]/mbar/menu[5]' });
  expect(sistema.atalho).toBe(null);

  // "Criar": FOLHA com atalho — sem 6, sem 7
  const criar = interpretarItemDeMenu({
    id: 'wnd[0]/mbar/menu[0]/menu[0]',
    lsdata: { 1: 'Criar', 15: 'F5', 18: { SID: 'wnd[0]/mbar/menu[0]/menu[0]', Type: 'GuiMenu' }, 19: 'Criar', x: 0 },
    desabilitado: 'false',
  });
  expect(criar).toMatchObject({ rotulo: 'Criar', atalho: 'F5', submenu: false, nivel: 1, habilitado: true });

  // "Cancelar": índice 4 = há SEPARADOR logo acima (medido pela posição y no DOM)
  const cancelar = interpretarItemDeMenu({
    id: 'wnd[0]/mbar/menu[1]/menu[2]',
    lsdata: { 1: 'Cancelar', 4: true, 15: 'ESCAPE', 18: { SID: 'wnd[0]/mbar/menu[1]/menu[2]', Type: 'GuiMenu' }, 19: 'Cancelar', x: 0 },
    desabilitado: null,
  });
  expect(cancelar.inicioDeGrupo).toBe(true);
  // ⚠️ e é este `ESCAPE` que explica por que Escape NÃO fecha o menu: ele CANCELA a transação
  expect(cancelar.atalho).toBe('ESCAPE');
  expect(criar.inicioDeGrupo).toBe(false);
});

test('menu: habilitação sai do ARIA, e "a tela não disse" NÃO é "habilitado"', () => {
  // medido: aria-disabled="false" em 20 dos 121 itens, AUSENTE nos outros 101. Ausente é null.
  const semAria = interpretarItemDeMenu({ id: 'wnd[0]/mbar/menu[0]', lsdata: { 1: 'Programa' }, desabilitado: null });
  expect(semAria.habilitado).toBe(null);
  expect(interpretarItemDeMenu({ id: 'x', lsdata: {}, desabilitado: 'false' }).habilitado).toBe(true);
  expect(interpretarItemDeMenu({ id: 'x', lsdata: {}, desabilitado: 'true' }).habilitado).toBe(false);
});

test('menu: o caminho aceita string com ">" ou lista, e recusa vazio', () => {
  expect(partirCaminhoDeMenu('Sistema > Serviços > Reporting')).toEqual(['Sistema', 'Serviços', 'Reporting']);
  expect(partirCaminhoDeMenu(['Sistema', ' Serviços '])).toEqual(['Sistema', 'Serviços']);
  expect(() => partirCaminhoDeMenu('   ')).toThrow(/informe o caminho/);
  expect(() => partirCaminhoDeMenu(null)).toThrow(/informe o caminho/);
});

test('menu: achar o item ignora acento e caixa, e o exato ganha do prefixo', () => {
  const irmaos = [
    { id: 'wnd[0]/mbar/menu[5]/menu[3]', rotulo: 'Serviços' },
    { id: 'wnd[0]/mbar/menu[5]/menu[4]', rotulo: 'Utilitários' },
    { id: 'wnd[0]/mbar/menu[5]/menu[6]', rotulo: 'Meus objetos' },
  ];
  expect(acharItemDeMenu(irmaos, 'servicos').rotulo).toBe('Serviços');
  expect(acharItemDeMenu(irmaos, 'SERVIÇOS').rotulo).toBe('Serviços');
  expect(acharItemDeMenu(irmaos, 'Meus').rotulo).toBe('Meus objetos'); // por prefixo
  expect(acharItemDeMenu(irmaos, 'Reporting')).toBe(null);
  expect(acharItemDeMenu([], 'x')).toBe(null);
});

test('menu: o exato ganha do prefixo mesmo quando um rótulo é prefixo do outro', () => {
  const irmaos = [{ id: 'a/menu[0]', rotulo: 'Teste unitário' }, { id: 'a/menu[1]', rotulo: 'Teste' }];
  expect(acharItemDeMenu(irmaos, 'Teste').rotulo).toBe('Teste');
});
