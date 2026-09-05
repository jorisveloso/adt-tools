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
  interpretarSonda, jsComando, JS_PUBLICAR_FOCO,
  filhoDiretoDeMenu, daBarraDeMenu, interpretarItemDeMenu, partirCaminhoDeMenu, acharItemDeMenu,
  criarPilhaDeDesfazer, transacional,
  SELETOR_ACIONAVEL, JS_ACIONAVEL, jsAlvoEfetivo,
  pinosDeCertificado, bandeirasDeCertificado, explicarErroDeNavegacao,
  jsBlocoDoGrid, linhasDoBloco,
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

test('webgui: o 404 não promete estado — ausente, sem handler e desativado saem iguais', () => {
  // medido no s4h 758/250 em 04/09/2026: /sap/bc/gui/sap/its/test está ATIVO (cl_icf_tree=>is_service_active
  // devolve X) e responde 404 porque não tem handler na ICFHANDLER — logo a sonda não pode dizer "desativado".
  const r = interpretarSonda({ status: 404, statusText: 'Not found', corpo: '<title>Service cannot be reached</title>' });
  expect(r).toMatchObject({ ok: false, causa: 'sem-no' });
  expect(r.motivo).toMatch(/ausente, sem handler .*ou desativado/);
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

test('webgui: o pino de certificado aceita as duas notações, e recusa o que não é pino', () => {
  const pino = 'MPQ1+wn6fdYV6CpNLlZhgnm1B4TVgBA5PwL1iIEfKpI=';
  // `sha256/…` é como openssl e navegador cospem; o base64 nu é o que a bandeira do Chrome quer
  expect(pinosDeCertificado(`sha256/${pino}`)).toEqual([pino]);
  expect(pinosDeCertificado(pino)).toEqual([pino]);
  expect(pinosDeCertificado([`sha256/${pino}`, pino])).toEqual([pino, pino]);
  expect(pinosDeCertificado(null)).toEqual([]);
  expect(pinosDeCertificado(true)).toEqual([]);

  expect(bandeirasDeCertificado(`sha256/${pino}`)).toEqual([`--ignore-certificate-errors-spki-list=${pino}`]);
  // `true` NÃO vira bandeira: ignorar tudo é comando de CDP, para passar pelo aviso do abrirNavegador
  expect(bandeirasDeCertificado(true)).toEqual([]);
  expect(bandeirasDeCertificado(null)).toEqual([]);
  // e o pino torto morre ANTES de subir Chrome nenhum, dizendo como ler o certo
  expect(() => bandeirasDeCertificado('sha256/nao-e-um-hash')).toThrow(/spkiDoHost/);
  expect(() => bandeirasDeCertificado('MPQ1+wn6fdYV6CpNLlZhgnm1B4TVgBA5PwL1iIEfKpI')).toThrow(/44 caracteres/);
});

test('webgui: erro de certificado na navegação vira instrução, e o resto não é sequestrado', () => {
  // medido em laboratório local (05/09/2026): Page.navigate devolve errorText e a tela vira
  // chrome-error:// — sem ler isso, o `ir` espera os 60 s do teto e culpa a tela
  const semOpcao = explicarErroDeNavegacao('net::ERR_CERT_AUTHORITY_INVALID', { base: 'https://icm:44300/' });
  expect(semOpcao).toMatch(/ERR_CERT_AUTHORITY_INVALID/);
  expect(semOpcao).toMatch(/spkiDoHost\("https:\/\/icm:44300\/"\)/);
  expect(semOpcao).toMatch(/Não se ignora certificado por default/);

  // já pinado e ainda barrou: a causa provável é OUTRA — o certificado do host mudou
  expect(explicarErroDeNavegacao('net::ERR_CERT_AUTHORITY_INVALID', { base: 'https://icm:44300/', certificado: 'sha256/MPQ1+wn6fdYV6CpNLlZhgnm1B4TVgBA5PwL1iIEfKpI=' }))
    .toMatch(/provavelmente mudou/);
  expect(explicarErroDeNavegacao('net::ERR_SSL_PROTOCOL_ERROR', { base: 'https://icm:44300/', certificado: true }))
    .toMatch(/não é de confiança na CA/);

  // o que NÃO é certificado sai daqui como null — quem chama avisa, não lança (ERR_ABORTED também
  // aparece em navegação simplesmente substituída)
  expect(explicarErroDeNavegacao('net::ERR_ABORTED', { base: 'http://host:8000' })).toBeNull();
  expect(explicarErroDeNavegacao(null, {})).toBeNull();
});

test('webgui: certificado recusado pelo Node não é "sem resposta do ICM"', () => {
  // medido em 05/09/2026 contra HTTPS com certificado auto-assinado: o fetch estoura
  // DEPTH_ZERO_SELF_SIGNED_CERT. O ICM está de pé — mandar procurar rede/host é a pista errada.
  const r = interpretarSonda({ erro: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  expect(r).toMatchObject({ ok: false, causa: 'certificado', status: null });
  expect(r.motivo).toMatch(/o ICM respondeu/);
  expect(r.motivo).toMatch(/NÃO cobre este `fetch`/);
  expect(interpretarSonda({ erro: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }).causa).toBe('certificado');
  expect(interpretarSonda({ erro: 'ERR_TLS_CERT_ALTNAME_INVALID' }).causa).toBe('certificado');
  // e o que continua sendo ICM fora do ar não mudou de causa
  expect(interpretarSonda({ erro: 'ENOTFOUND' }).causa).toBe('sem-icm');
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

test('webgui: o OK-code leva o que foi digitado porque o blur PUBLICA o valor (item 31)', () => {
  // Medido no s4h 758/250 em 04/09/2026 (POC_webgui_okcode_valores): na tela de seleção da SE16
  // sobre a T000, `preencher` + `comandar('ONLI')` deu "5 acertos" (valor perdido) e com o `blur`
  // no meio deu "1 acertos", com `value/…txtI1-LOW` e `okcode/ses[0]` no MESMO post.
  // Quem publica o valor é o `Change` do controle; `Input.insertText` não o dispara, `blur` sim —
  // e um `change` sintético SEM blur não bastou. Por isso o gesto aqui é o blur, e só ele.
  expect(JS_PUBLICAR_FOCO).toContain('document.activeElement');
  expect(JS_PUBLICAR_FOCO).toContain('e.blur()');
  expect(JS_PUBLICAR_FOCO).not.toContain('KeyboardEvent'); // publicar não é submeter
  // o próprio okcd nunca é o campo a publicar: quem o submete é o Enter do `jsComando`
  expect(JS_PUBLICAR_FOCO).toContain("e.id === 'ToolbarOkCode'");
  // sem campo em foco não há o que publicar — devolve null em vez de estourar
  expect(JS_PUBLICAR_FOCO).toContain('return null');
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

// ─── criar é mutação imediata: a pilha de desfazer e o `transacional` ─────────
// O que estes testes guardam está medido no SXD 816/100 em 04/09/2026 (fila `adt-client` item 38):
// abrir o formulário "Criar atribuição de destino" do FLP Designer já grava a linha, e fechar o
// navegador NÃO desfaz. Aqui nada abre navegador — o que se prova é a mecânica do descarte.

const sessaoFalsa = () => ({ desfazer: criarPilhaDeDesfazer() });

test('desfazer: LIFO — o que foi criado por último desfaz primeiro', async () => {
  const pilha = criarPilhaDeDesfazer();
  const ordem = [];
  pilha.registrar('catálogo', () => { ordem.push('catálogo'); });
  pilha.registrar('target mapping', async () => { ordem.push('target mapping'); });
  expect(pilha.tamanho()).toBe(2);
  expect(pilha.pendentes()).toEqual(['catálogo', 'target mapping']);

  expect(await pilha.executar()).toEqual([{ rotulo: 'target mapping', ok: true }, { rotulo: 'catálogo', ok: true }]);
  expect(ordem).toEqual(['target mapping', 'catálogo']);
  // esvazia sempre: executar de novo NÃO repete gesto destrutivo
  expect(await pilha.executar()).toEqual([]);
  expect(ordem).toEqual(['target mapping', 'catálogo']);
});

test('desfazer: a baixa tira da pilha (é o que "confirmar" faz), e só uma vez', () => {
  const pilha = criarPilhaDeDesfazer();
  const baixa = pilha.registrar('rascunho', () => {});
  expect(baixa()).toBe(true);
  expect(pilha.tamanho()).toBe(0);
  expect(baixa()).toBe(false);
  expect(() => pilha.registrar('x', 'não é função')).toThrow(/exige uma função/);
});

test('desfazer: ação que estoura NÃO impede as outras — sai no relatório, com o rótulo', async () => {
  const pilha = criarPilhaDeDesfazer();
  const feitos = [];
  pilha.registrar('mapping 1', () => { feitos.push(1); });
  pilha.registrar('mapping 2', () => { throw new Error('OK do popup não apareceu'); });
  pilha.registrar('mapping 3', () => { feitos.push(3); });

  expect(await pilha.executar()).toEqual([
    { rotulo: 'mapping 3', ok: true },
    { rotulo: 'mapping 2', ok: false, erro: 'OK do popup não apareceu' },
    { rotulo: 'mapping 1', ok: true },
  ]);
  expect(feitos).toEqual([3, 1]);
  expect(pilha.tamanho()).toBe(0);
});

test('transacional: corpo que NÃO confirma descarta o rascunho — o caso dos quatro mappings vazios', async () => {
  const s = sessaoFalsa();
  const gestos = [];
  await transacional(s, {
    rotulo: 'target mapping',
    abrir: () => { gestos.push('createNewTM'); return 'aberto'; },
    descartar: () => { gestos.push('cancelar'); },
    corpo: async ({ aberto }) => { gestos.push(`inspecionar(${aberto})`); },
  });
  expect(gestos).toEqual(['createNewTM', 'inspecionar(aberto)', 'cancelar']);
  expect(s.desfazer.tamanho()).toBe(0); // descartou: não sobra para o fechar
});

test('transacional: confirmado NÃO descarta — o Gravar tornou o rascunho registro de verdade', async () => {
  const s = sessaoFalsa();
  const gestos = [];
  const r = await transacional(s, {
    rotulo: 'target mapping',
    abrir: () => { gestos.push('createNewTM'); },
    descartar: () => { gestos.push('cancelar'); },
    corpo: async ({ confirmar }) => confirmar(() => { gestos.push('gravar'); return 'YJBVNotaFiscal-create'; }),
  });
  expect(gestos).toEqual(['createNewTM', 'gravar']);
  expect(r).toBe('YJBVNotaFiscal-create');
  expect(s.desfazer.tamanho()).toBe(0);
});

test('transacional: Gravar que ESTOURA não confirma — o descarte continua armado', async () => {
  const s = sessaoFalsa();
  const gestos = [];
  await expect(transacional(s, {
    rotulo: 'target mapping',
    abrir: () => {},
    descartar: () => { gestos.push('cancelar'); },
    corpo: ({ confirmar }) => confirmar(() => { throw new Error('saveTileDetailsButton não está na tela'); }),
  })).rejects.toThrow(/saveTileDetailsButton/);
  expect(gestos).toEqual(['cancelar']);
  expect(s.desfazer.tamanho()).toBe(0);
});

test('transacional: erro no meio do corpo descarta E propaga o erro original', async () => {
  const s = sessaoFalsa();
  const gestos = [];
  await expect(transacional(s, {
    abrir: () => {},
    descartar: () => { gestos.push('cancelar'); },
    corpo: () => { throw new Error('campo semantic_object não está na tela'); },
  })).rejects.toThrow(/semantic_object/); // o descarte não mascara o diagnóstico
  expect(gestos).toEqual(['cancelar']);
});

test('transacional: descarte que falha FICA na pilha — o fechar tenta de novo', async () => {
  const s = sessaoFalsa();
  let tentativas = 0;
  await transacional(s, {
    rotulo: 'target mapping',
    abrir: () => {},
    descartar: () => { if (++tentativas === 1) throw new Error('diálogo de confirmação não abriu'); },
    corpo: () => {},
  });
  expect(tentativas).toBe(1);
  expect(s.desfazer.pendentes()).toEqual(['target mapping']); // é o que o `fechar` vai executar

  expect(await s.desfazer.executar()).toEqual([{ rotulo: 'target mapping', ok: true }]);
  expect(tentativas).toBe(2);
});

test('transacional: sem { descartar } recusa ANTES de criar nada', async () => {
  const s = sessaoFalsa();
  let abriu = false;
  await expect(transacional(s, { rotulo: 'target mapping', abrir: () => { abriu = true; }, corpo: () => {} }))
    .rejects.toThrow(/criar é mutação imediata.*target mapping/s);
  expect(abriu).toBe(false);
  await expect(transacional(s, { descartar: () => {}, corpo: () => {} })).rejects.toThrow(/informe \{ abrir \}/);
  await expect(transacional(s, { abrir: () => {}, descartar: () => {} })).rejects.toThrow(/informe \{ corpo \}/);
  await expect(transacional({}, { abrir: () => {}, descartar: () => {}, corpo: () => {} }))
    .rejects.toThrow(/não tem pilha de desfazer/);
});

// ─── descer até quem ACIONA (item 40) ──────────────────────────────────────
// O DOM de mentira abaixo é o que o laboratório do s4h 758/250 mediu em 05/09/2026 (UI5 1.114.0,
// `sap-accelerate/work/POC_ui5_clicar_descendente/medicoes/item40-descida.md`): o `<li>` inerte do
// CustomListItem (`cursor: auto`, sem marcador) com o handler num ícone de 199 px², e o span de
// recheio do ícone HERDANDO o `cursor: pointer` com a MESMA caixa.

const criarNo = (spec, pai = null) => {
  const e = {
    id: spec.id ?? '', tagName: spec.tag ?? 'DIV', className: spec.classe ?? '', nodeType: 1,
    onclick: spec.onclick ?? null, cursor: spec.cursor ?? 'auto',
    offsetWidth: spec.invisivel ? 0 : 10, offsetHeight: spec.invisivel ? 0 : 10,
    matches: () => !!spec.marcador,
    getBoundingClientRect: () => ({ width: spec.area ?? 0, height: 1, x: 0, y: 0 }),
    parentElement: pai,
    querySelectorAll: () => descendentes(e),
  };
  e.filhos = (spec.filhos ?? []).map((f) => criarNo(f, e));
  return e;
};
const descendentes = (e) => e.filhos.flatMap((f) => [f, ...descendentes(f)]);
const acharNo = (raiz, id) => (raiz.id === id ? raiz : descendentes(raiz).find((e) => e.id === id));
const resolver = (raiz, opts) =>
  new Function('getComputedStyle', 'ALVO', `return ${jsAlvoEfetivo('ALVO', opts)}`)((e) => ({ cursor: e.cursor }), raiz);

const LI_INERTE = criarNo({
  id: 'liInerte', tag: 'LI', classe: 'sapMLIB sapMLIBTypeInactive', cursor: 'auto', area: 9500,
  filhos: [{ id: 'liInerte-content', area: 9000, filhos: [
    { id: '__text0', tag: 'SPAN', cursor: 'text', area: 2005 },
    { id: 'iconeAdd', tag: 'SPAN', classe: 'sapUiIcon sapUiIconTitle', cursor: 'pointer', area: 199,
      filhos: [{ tag: 'SPAN', classe: 'sapUiIconTitle', cursor: 'pointer', area: 199 }] },
  ] }],
});

test('webgui: o clique desce do contêiner inerte para o MENOR descendente que aciona', () => {
  // medido: o <li> do template estático não reagiu; o ícone de dentro adicionou o tile
  expect(resolver(LI_INERTE).id).toBe('iconeAdd');
  // `cursor: pointer` é HERDADO — o recheio do ícone tem a MESMA caixa e NÃO é o alvo
  expect(resolver(LI_INERTE).className).toBe('sapUiIcon sapUiIconTitle');
  // `{ descer: false }` é o contrafactual medido: fica no <li> e o gesto cai no vazio
  expect(resolver(LI_INERTE, { descer: false }).id).toBe('liInerte');
});

test('webgui: quem JÁ aciona não é rebaixado — nem o li ativo, nem o item de ComboBox', () => {
  // sapMLIBActionable: `cursor: pointer` no próprio <li> (medido no laboratório)
  const ativo = criarNo({ id: 'liAtivo', tag: 'LI', cursor: 'pointer', area: 24000,
    filhos: [{ id: 'liAtivo-titleText', tag: 'SPAN', cursor: 'pointer', area: 2000 }] });
  expect(resolver(ativo).id).toBe('liAtivo');
  // o item do popover do ComboBox tem role=option — é marcador, e foi ele que fechou o item 39
  const opcao = criarNo({ id: '__item13', tag: 'LI', marcador: true, area: 3000,
    filhos: [{ id: '__item13-content', tag: 'SPAN', area: 2800 }] });
  expect(resolver(opcao).id).toBe('__item13');
});

test('webgui: caixa sem nada acionável dentro NÃO inventa alvo — devolve o próprio nó', () => {
  const mudo = criarNo({ id: 'liMudo', tag: 'LI', cursor: 'auto', area: 9500,
    filhos: [{ id: '__text9', tag: 'SPAN', cursor: 'text', area: 2000 }] });
  expect(resolver(mudo).id).toBe('liMudo');
  // descendente que aciona mas está INVISÍVEL (ou com caixa zerada) não é candidato
  const escondido = criarNo({ id: 'liOculto', tag: 'LI', cursor: 'auto', area: 9500, filhos: [
    { id: 'botaoOculto', marcador: true, area: 200, invisivel: true },
    { id: 'botaoSemCaixa', marcador: true, area: 0 },
  ] });
  expect(resolver(escondido).id).toBe('liOculto');
  expect(resolver(null)).toBe(null);
});

test('webgui: a marca de ação se LÊ no DOM — e o Unified Renderer declara a dele', () => {
  // HTML/ARIA de comando
  for (const s of ['a[href]', 'button', 'input', '[onclick]', '[role=button]', '[role=option]']) {
    expect(SELETOR_ACIONAVEL).toContain(s);
  }
  // `ct`/`lsdata`/`lsevents` são o WebGUI declarando o controle: lá não há o que descer
  for (const s of ['[lsevents]', '[lsdata]', '[ct]']) expect(SELETOR_ACIONAVEL).toContain(s);
  const H = new Function('getComputedStyle', `return ${JS_ACIONAVEL}`)((e) => ({ cursor: e.cursor }));
  expect(H.motivo(acharNo(LI_INERTE, 'iconeAdd'))).toBe('cursor');
  expect(H.motivo(LI_INERTE)).toBe(null);
  expect(H.motivo(criarNo({ id: 'b', marcador: true, area: 10 }))).toBe('marcador');
  expect(H.motivo(criarNo({ id: 'c', onclick: () => {}, area: 10 }))).toBe('onclick');
  expect(H.motivo(criarNo({ id: 'd', marcador: true, area: 10, invisivel: true }))).toBe(null);
  // o relato precisa de um nome mesmo quando o nó não tem id — senão "desceu" não diz para onde
  expect(H.desc(acharNo(LI_INERTE, 'iconeAdd'))).toBe('iconeAdd');
  expect(H.desc(criarNo({ tag: 'SPAN', classe: 'sapUiIcon sapUiIconTitle x', area: 10 })))
    .toBe('span.sapUiIcon.sapUiIconTitle');
  expect(H.desc(null)).toBe(null);
});

// ---------- o ALV: o bloco que o DOM já tem (item 46) ----------
//
// Os spans são os REAIS da lista do RSPARAM no s4h 758/250 (05/09/2026,
// POC_webgui_grid/medicoes/raw/g-fixture-spans.txt) — inclusive o `<td>` da coluna 0
// (SAPTABLECSSELECTIONCELL), que é seleção de linha e NÃO é dado.
const LSDATA_GRID = JSON.stringify({ x: 0, 9: { SID: 'wnd[0]/usr/cntlGRID1/shellcont/shell',
  Type: 'GuiGridView', totalRows: 1617, visibleRows: 27, firstVisibleRow: 0, editable: false,
  ColumnIDs: ['NAME', 'USER_VALUE', 'DEFAULT_VALUE', 'DEFAULT_USUBS_VALUE', 'DESCR'] } });

const celulaReal = (r, c, valor) => ({
  id: `grid#C102#${r},${c}#if`, ct: 'CBS', texto: valor,
  lsdata: JSON.stringify({ x: 0, 1: 'FREETEXT', 3: 'x_TALB', 5: valor, 7: true, 14: 'SERVER',
    21: { value: valor, maxlen: 10, focusable: 'X' }, 25: 'FILL_FIXED_LAYOUT' }),
});

function domDoGrid(celulas, extras = []) {
  const nos = [
    ...celulas.map((c) => ({ ...c, get: (a) => (a === 'lsdata' ? c.lsdata : null) })),
    ...extras.map((c) => ({ ...c, get: (a) => (a === 'lsdata' ? c.lsdata ?? null : null) })),
  ].map((n) => ({ id: n.id, innerText: n.texto ?? '', getAttribute: n.get }));
  const grid = { id: 'C102', getAttribute: (a) => (a === 'lsdata' ? LSDATA_GRID : null) };
  return {
    getElementById: (id) => (id === 'C102' ? grid : null),
    querySelectorAll: (sel) => (sel === '[id^="grid#"]' ? nos : []),
  };
}

const rodarBloco = (documento, cid = 'C102') =>
  new Function('document', `return ${jsBlocoDoGrid(cid)}`)(documento);

test('webgui: o bloco sai do lsdata da célula — e a coluna 0 e o outro grid ficam de fora', () => {
  const doc = domDoGrid(
    [celulaReal(1, 1, 'Autostart'), celulaReal(1, 2, ''), celulaReal(1, 3, '0'),
     celulaReal(2, 1, 'CPU_CORES'), celulaReal(2, 3, '32')],
    [
      // a coluna 0 é a caixa de seleção da linha: `<td>`, id sem `#if`, e NÃO é dado
      { id: 'grid#C102#1,0', texto: 'Para selecionar uma linha, pressionar a barra de espaço.',
        lsdata: JSON.stringify({ 7: { SID: 'wnd[0]/usr/cntlGRID1/shellcont/shell/rowcol/row[1]/', Type: 'SAPTABLECSSELECTIONCELL' } }) },
      { id: 'grid#C102#1,0-ariatutor', texto: 'Para selecionar…' },   // o rótulo ARIA da caixa
      { id: 'grid#C102#0,1#cp1', texto: 'Nome do parâmetro' },        // o CABEÇALHO da coluna
      { id: 'grid#C102#1,1#if-r', texto: 'Autostart' },               // o wrapper do campo, sem lsdata
      { id: 'grid#C999#1,1#if', texto: 'de outro grid', lsdata: JSON.stringify({ 21: { value: 'de outro grid' } }) },
    ]);
  const b = rodarBloco(doc);
  expect(b.cid).toBe('C102');
  expect(b.sid).toBe('wnd[0]/usr/cntlGRID1/shellcont/shell');
  expect(b.total).toBe(1617);
  expect(b.visiveis).toBe(27);
  expect(b.editavel).toBe(false);
  expect(b.colunas).toEqual(['NAME', 'USER_VALUE', 'DEFAULT_VALUE', 'DEFAULT_USUBS_VALUE', 'DESCR']);
  // só as células de dado: 2 linhas, e a linha 1 com as 3 colunas que ela tem
  expect(Object.keys(b.celulas)).toEqual(['1', '2']);
  expect(b.celulas['1']).toEqual({ 1: 'Autostart', 2: '', 3: '0' });
  expect(b.celulas['2']).toEqual({ 1: 'CPU_CORES', 3: '32' });
  // grid que não está no DOM não estoura aqui — devolve null, e quem chama diz o que fazer
  expect(rodarBloco(doc, 'C999')).toBe(null);
});

test('webgui: sem lsdata a célula cai no innerText — e o cid entra no JS ESCAPADO', () => {
  const doc = domDoGrid([{ id: 'grid#C102#1,1#if', texto: 'só texto', lsdata: null }]);
  expect(rodarBloco(doc).celulas['1']).toEqual({ 1: 'só texto' });
  // o id do WebGUI tem `:` e `[]`; ele vai como literal JSON, não concatenado na unha
  expect(jsBlocoDoGrid('M0:48::x')).toContain('const cid = "M0:48::x";');
});

test('webgui: as células do bloco viram linhas com os ColumnIDs — e a faixa RECORTA o que já veio', () => {
  // as 3 linhas são as REAIS medidas (i-bloco.json): a 1ª, a 2ª e a última do bloco de 166
  const celulas = {
    1: { 1: 'Autostart', 2: '', 3: '0', 4: '0', 5: 'Automatic instance start on start service startup' },
    2: { 1: 'CPU_CORES', 2: '', 3: '32', 4: '32', 5: 'Processor cores used for system sizing.' },
    166: { 1: 'abap/dyn_abap_log', 2: '', 3: 'off', 4: 'off', 5: 'Dynamic ABAP: Mode for Logging' },
  };
  const cols = ['NAME', 'USER_VALUE', 'DEFAULT_VALUE', 'DEFAULT_USUBS_VALUE', 'DESCR'];
  const linhas = linhasDoBloco(celulas, cols);
  expect(linhas).toHaveLength(3);
  // `_linha` é o índice ABSOLUTO da tabela, não a posição no bloco
  expect(linhas.map((l) => l._linha)).toEqual([1, 2, 166]);
  expect(linhas[0]).toEqual({ _linha: 1, NAME: 'Autostart', USER_VALUE: '', DEFAULT_VALUE: '0',
    DEFAULT_USUBS_VALUE: '0', DESCR: 'Automatic instance start on start service startup' });
  expect(linhas[2].NAME).toBe('abap/dyn_abap_log');
  // a faixa recorta o bloco — ela não vai buscar linha nenhuma
  expect(linhasDoBloco(celulas, cols, { de: 2, ate: 100 }).map((l) => l._linha)).toEqual([2]);
  expect(linhasDoBloco(celulas, cols, { de: 500 })).toEqual([]);
  // coluna sem célula sai '' (e não `undefined`), e sem ColumnIDs a chave é o número da coluna
  expect(linhasDoBloco({ 7: { 1: 'x' } }, cols)[0]).toEqual({ _linha: 7, NAME: 'x', USER_VALUE: '',
    DEFAULT_VALUE: '', DEFAULT_USUBS_VALUE: '', DESCR: '' });
  expect(linhasDoBloco({ 7: { 1: 'x', 2: 'y' } }, [])[0]).toEqual({ _linha: 7, 1: 'x', 2: 'y' });
});
