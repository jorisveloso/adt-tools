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
  habilitadoDoBotao,
  interpretarSonda, jsComando, JS_PUBLICAR_FOCO, ehTelemetria, roundTrips,
  filhoDiretoDeMenu, daBarraDeMenu, interpretarItemDeMenu, partirCaminhoDeMenu, acharItemDeMenu,
  criarPilhaDeDesfazer, transacional,
  indiceDoNo, containerDaArvore, arvoreDosBrutos, acharNoDaArvore, assinaturaDaArvore, JS_ARVORE,
  SELETOR_ACIONAVEL, JS_ACIONAVEL, jsAlvoEfetivo,
  pinosDeCertificado, bandeirasDeCertificado, explicarErroDeNavegacao,
  jsBlocoDoGrid, linhasDoBloco, escolherGrid, indiceDaColuna,
  jsFragmentoDoGrid, faltaNaFaixaDoBloco,
  estadoDoScrollbar, miraDoScrollbar, naJanela, jsJanelaDoGrid,
  jsSelecaoDoGrid, interpretarSelectedRows, idDaCaixa, MOD,
  estadoDoCabecalho, idDoCabecalho, jsCabecalhoDoGrid, jsBotaoDaBarra,
  FCODES_DE_LINHA,
  tsvDoBloco, jsColarNoGrid,
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

// Os dois `lsdata` abaixo são os IRMÃOS REAIS do laboratório `ZJBV_BTN81` (s4h 758/250, 06/09/2026,
// item 81): mesma tela de seleção, mesmo estado, e a única diferença de conteúdo é o `SCREEN-INPUT`.
const PUSH_ON = {
  id: 'M0:46:::0:0', ct: 'B', texto: 'BTN ON', visivel: true, desabilitado: false,
  lsdata: { 0: 'BTN ON', 3: '100%', 17: 'B', 20: true, 21: true,
    27: { SID: 'wnd[0]/usr/btnBT_ON', Type: 'GuiButton' } },
};
const PUSH_OFF = {
  id: 'M0:46:::0:24', ct: 'B', texto: 'BTN OFF', visivel: true, desabilitado: false,
  ariaDesabilitado: 'true',
  lsdata: { 0: 'BTN OFF', 3: '100%', 5: false, 17: 'B', 20: true, 21: true,
    27: { SID: 'wnd[0]/usr/btnBT_OFF', Type: 'GuiButton' } },
};

test('webgui: o botão DESABILITADO é o `lsdata[5] === false` — o mesmo índice do item de menu', () => {
  expect(habilitadoDoBotao(PUSH_ON.lsdata)).toBe(true);
  expect(habilitadoDoBotao(PUSH_OFF.lsdata, 'true')).toBe(false);
  // ausente é habilitado: o lsdata só transporta o que difere do default (item 48)
  expect(habilitadoDoBotao({})).toBe(true);
  expect(habilitadoDoBotao(null)).toBe(true);
  // o ARIA sozinho basta, e o `5` sozinho também — nenhum dos dois precisa do outro
  expect(habilitadoDoBotao({ 5: false })).toBe(false);
  expect(habilitadoDoBotao({}, 'true')).toBe(false);
  // ⚠ o botão da barra traz `lsdata[5]` nenhum: `BOTAO_EXECUTAR` sai habilitado
  expect(interpretarControle(BOTAO_EXECUTAR).habilitado).toBe(true);

  expect(interpretarControle(PUSH_ON)).toMatchObject({ papel: 'botao', okcode: null,
    sid: 'wnd[0]/usr/btnBT_ON', rotulo: 'BTN ON', habilitado: true });
  expect(interpretarControle(PUSH_OFF)).toMatchObject({ papel: 'botao', okcode: null,
    sid: 'wnd[0]/usr/btnBT_OFF', rotulo: 'BTN OFF', habilitado: false });

  // ⚠ o `desabilitado` (`el.disabled`) é `false` NOS DOIS — o botão é um `<div>`, e a propriedade
  // DOM nem existe nele. Era o único campo de habilitação que o despejo tinha antes do item 81.
  expect(PUSH_ON.desabilitado).toBe(PUSH_OFF.desabilitado);
});

test('webgui: o PUSHBUTTON da dynpro entra na tela mesmo sem okcode — é onde o cinza mora', () => {
  const tela = montarTela([JANELA, OKCODE, BOTAO_EXECUTAR, PUSH_ON, PUSH_OFF,
    { id: 'sysInfoAreaToggle', ct: 'B', visivel: true, lsdata: { 0: 'Fechar informações do sistema' } }]);
  // o do shell do ITS não tem SID e fica de fora; os dois pushbuttons de `usr` entram
  expect(tela.botoes.map((b) => b.sid)).toEqual(
    ['wnd[0]/tbar[1]/btn[8]', 'wnd[0]/usr/btnBT_ON', 'wnd[0]/usr/btnBT_OFF']);
  expect(tela.botoes.map((b) => b.habilitado)).toEqual([true, true, false]);
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

test('webgui: 200 com a TELA e sem Set-Cookie de sessão é causa PRÓPRIA — não é "canal indisponível"', () => {
  // medido no s4h 758/250 (06/09/2026, POC_webgui_sonda_causa): o 2º GET, feito DENTRO da sessão
  // já aberta, devolve os MESMOS 36 487 bytes de tela e o Set-Cookie sem SAP_SESSIONID. Canal
  // saudável, assinatura HTTP idêntica à do teto de sessões — por isso a causa não pode dizer "teto".
  const r = interpretarSonda({
    status: 200, statusText: 'OK', corpo: `<form name="webguiform0" action="/sap(cz1TSUQ)/bc/gui/">${'x'.repeat(36000)}`,
    cookies: ['saplbS4H=3532650; path=/', 'saplbS4H-options=; path=/'],
  });
  expect(r).toMatchObject({ ok: false, causa: 'sem-sessao-nova' });
  expect(r.motivo).toMatch(/DENTRO de uma sessão/);          // a leitura saudável
  expect(r.motivo).toMatch(/SessaoNasceuMorta/);             // a leitura doente
  expect(r.motivo).toMatch(/security_session_timeout/);      // e o MESMO texto acionável do erro nomeado
  expect(r.motivo).toMatch(/SM04 \/ TH_USER_LIST/);

  // sem o shell e sem logon continua sendo `inesperado` — o que a sonda não sabe ler, ela não batiza
  expect(interpretarSonda({ status: 200, statusText: 'OK', corpo: '{"algo":1}', cookies: [] }))
    .toMatchObject({ ok: false, causa: 'inesperado' });
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

test('webgui: o round-trip é o sinal que o carimbo não dá (item 80)', () => {
  // URLs BRUTAS do s4h 758/250, 06/09/2026 (POC_webgui_grid_edit/medicoes/raw/j-carimbo.json):
  // o gesto do FC03 disparou DOIS posts, e o segundo é telemetria.
  const dynpro = 'http://ndc-srvhana.opus-idc.com.br:8000/sap(cz1TSUQlM2FBTk9OJTNh)/bc/gui/sap/its/webgui';
  const fesr = 'http://ndc-srvhana.opus-idc.com.br:8000/sap/bc/gui/sap/its;sap-fesr-only/webgui';
  expect(ehTelemetria(fesr)).toBe(true);
  expect(ehTelemetria(dynpro)).toBe(false);
  expect(ehTelemetria(null)).toBe(false);

  const post = (id, url) => ({ method: 'Network.requestWillBeSent', params: { requestId: id, request: { method: 'POST', url } } });
  const get = (id, url) => ({ method: 'Network.requestWillBeSent', params: { requestId: id, request: { method: 'GET', url } } });
  const resp = (id) => ({ method: 'Network.responseReceived', params: { requestId: id } });

  // o gesto começa em `desde`: o que veio antes é de outro gesto e não conta
  const eventos = [post('velho', dynpro), resp('velho'), post('A', dynpro), get('img', dynpro), post('T', fesr), resp('T')];
  expect(roundTrips(eventos, 2)).toEqual({ enviados: 1, respondidos: 0 }); // só a telemetria voltou
  expect(roundTrips([...eventos, resp('A')], 2)).toEqual({ enviados: 1, respondidos: 1 });
  // sem `desde` o histórico inteiro conta — é o que faz a marca ser obrigatória em quem espera
  expect(roundTrips(eventos)).toEqual({ enviados: 2, respondidos: 1 });
  expect(roundTrips([], 0)).toEqual({ enviados: 0, respondidos: 0 });
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

test('menu: habilitação sai do lsdata[5] — ausente é HABILITADO, e o ARIA "false" é só o realce', () => {
  // Medido no item 48 (s4h 758/250, 05/09/2026), 279 itens de 5 telas: os 7 desabilitados trazem
  // `5: false`; os 272 habilitados omitem o `5`. Estes três `lsdata` são REAIS da medição.
  const gravar = interpretarItemDeMenu({ // SU01 > Usuário > Gravar — cinza
    id: 'wnd[0]/mbar/menu[0]/menu[4]',
    lsdata: { 1: 'Gravar', 5: false, 18: { SID: 'wnd[0]/mbar/menu[0]/menu[4]', Type: 'GuiMenu' }, 19: 'Gravar', x: 0 },
    desabilitado: 'true',
  });
  expect(gravar).toMatchObject({ rotulo: 'Gravar', habilitado: false });

  // ⚠️ ausência de `aria-disabled` é o caso NORMAL (101 dos 121 itens da SE38): habilitado.
  const semAria = interpretarItemDeMenu({ id: 'wnd[0]/mbar/menu[0]', lsdata: { 1: 'Programa' }, desabilitado: null });
  expect(semAria.habilitado).toBe(true);

  // ⚠️ `aria-disabled="false"` é o item REALÇADO do popup (`urMnuRowOn`), não uma habilitação —
  // ler habilitação daí era ler o realce. Aqui ele apenas não contradiz o `lsdata`.
  expect(interpretarItemDeMenu({ id: 'x', lsdata: {}, desabilitado: 'false' }).habilitado).toBe(true);

  // as duas fontes concordaram em 7/7; se um dia discordarem, DESABILITADO ganha.
  expect(interpretarItemDeMenu({ id: 'x', lsdata: {}, desabilitado: 'true' }).habilitado).toBe(false);
  expect(interpretarItemDeMenu({ id: 'x', lsdata: { 5: false }, desabilitado: null }).habilitado).toBe(false);
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
    getAttribute: (n) => spec.attrs?.[n] ?? null,
    innerText: spec.texto ?? '',
    contains: (o) => o === e || descendentes(e).includes(o),
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

// ─── VÁRIOS gestos no mesmo contêiner: endereçar por rótulo (item 68) ──────
// Medido no s4h 758/250 em 05/09/2026 (UI5 1.114.0, `medicoes/item68-dois-gestos.md`): o
// `sap.ui.core.Icon` com tooltip rende `aria-label` no controle e `title` no recheio; o
// `sap.m.Button` não tem nenhum dos dois — só o `innerText`, repetido em 4 nós encaixados
// (button > -inner > -content > -BDI-content), todos com `cursor: pointer`.

const ICONE = (id, rot, area = 224) => ({
  id, tag: 'SPAN', classe: 'sapUiIcon', cursor: 'pointer', area, attrs: { 'aria-label': rot },
  filhos: [{ tag: 'SPAN', classe: 'sapUiIconTitle', cursor: 'pointer', area, attrs: { title: rot } }],
});
const BOTAO = (id, rot) => ({
  id, tag: 'BUTTON', marcador: true, area: 4012, texto: rot, filhos: [
    { id: `${id}-inner`, tag: 'SPAN', cursor: 'pointer', area: 3343, texto: rot, filhos: [
      { id: `${id}-content`, tag: 'SPAN', cursor: 'pointer', area: 2188, texto: rot, filhos: [
        { id: `${id}-BDI-content`, tag: 'BDI', cursor: 'pointer', area: 921, texto: rot }] }] }],
});
const LI_CATALOGO = criarNo({ id: 'liCatalogo', tag: 'LI', cursor: 'auto', area: 9500, filhos: [
  { id: '__text0', tag: 'SPAN', cursor: 'text', area: 2005 },
  ICONE('iconeCatAdd', 'Adicionar'), ICONE('iconeCatDet', 'Detalhe')] });
const LI_MISTO = criarNo({ id: 'liMisto', tag: 'LI', cursor: 'auto', area: 9500, filhos: [
  { id: '__text1', tag: 'SPAN', cursor: 'text', area: 2005 },
  BOTAO('btnMistoAdd', 'Adicionar'), ICONE('iconeMistoDet', 'Detalhe')] });

test('webgui: com VÁRIOS gestos, o menor-por-área é chute — e no misto ele erra de verdade', () => {
  // duas caixas iguais: quem ganha é a ORDEM do DOM, não a intenção (medido: sempre iconeCatAdd)
  expect(resolver(LI_CATALOGO).id).toBe('iconeCatAdd');
  // botão largo + ícone pequeno: pedir a linha e receber "Detalhe" é acionar o gesto ERRADO calado
  expect(resolver(LI_MISTO).id).toBe('iconeMistoDet');
});

test('webgui: `{ dentro }` escolhe o gesto pelo RÓTULO, sem caixa nem acento', () => {
  expect(resolver(LI_CATALOGO, { dentro: 'Detalhe' }).id).toBe('iconeCatDet');
  expect(resolver(LI_CATALOGO, { dentro: 'adicionar' }).id).toBe('iconeCatAdd');
  // o rótulo do botão só existe no texto — e o alvo é o BUTTON, não o <bdi> de dentro
  expect(resolver(LI_MISTO, { dentro: 'Adicionar' }).id).toBe('btnMistoAdd');
  expect(resolver(LI_MISTO, { dentro: 'detalhe' }).id).toBe('iconeMistoDet');
  // acento não separa: "endereco" acha "Endereço"
  const li = criarNo({ id: 'li', tag: 'LI', cursor: 'auto', area: 9000,
    filhos: [ICONE('ico', 'Endereço'), ICONE('ico2', 'Outro')] });
  expect(resolver(li, { dentro: 'endereco' }).id).toBe('ico');
});

test('webgui: `{ dentro }` sem casamento ÚNICO devolve null — não sorteia alvo', () => {
  expect(resolver(LI_CATALOGO, { dentro: 'Excluir' })).toBe(null);
  // dois gestos com o mesmo rótulo: é ambíguo de verdade, e o chute é o que se quer evitar
  const dobrado = criarNo({ id: 'liDobrado', tag: 'LI', cursor: 'auto', area: 9500,
    filhos: [ICONE('a1', 'Adicionar'), ICONE('a2', 'Adicionar')] });
  expect(resolver(dobrado, { dentro: 'Adicionar' })).toBe(null);
  // e o rótulo VAZIO não casa com tudo — senão { dentro: '' } viraria o menor-por-área de novo
  const mudo = criarNo({ id: 'liSemRotulo', tag: 'LI', cursor: 'auto', area: 9500,
    filhos: [{ id: 'ico', tag: 'SPAN', cursor: 'pointer', area: 200 }] });
  expect(resolver(mudo, { dentro: 'x' })).toBe(null);
});

test('webgui: o rótulo é aria-label → title → texto, e a pilha do botão conta como UM gesto', () => {
  const H = new Function('getComputedStyle', `return ${JS_ACIONAVEL}`)((e) => ({ cursor: e.cursor }));
  expect(H.rotulo(acharNo(LI_CATALOGO, 'iconeCatAdd'))).toBe('Adicionar');
  expect(H.rotulo(acharNo(LI_MISTO, 'btnMistoAdd'))).toBe('Adicionar');
  // o recheio do ícone não tem aria-label; o title dele é a segunda via
  expect(H.rotulo(descendentes(acharNo(LI_CATALOGO, 'iconeCatDet'))[0])).toBe('Detalhe');
  // o nome do ícone (`sap-icon://add`) NÃO está no DOM — medido: só o char em data-sap-ui-icon-content
  expect(H.rotulo(criarNo({ tag: 'SPAN', classe: 'sapUiIcon' }))).toBe('');
  // 6 nós acionáveis no liMisto (button + 3 encaixados + ícone + recheio) → 2 gestos independentes
  const cand = descendentes(LI_MISTO).filter((e) => H.motivo(e) && H.area(e) > 0);
  expect(cand.length).toBe(6);
  expect(H.externos(cand).map((e) => e.id)).toEqual(['btnMistoAdd', 'iconeMistoDet']);
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
  ].map((n) => ({ id: n.id, innerText: n.texto ?? '', getAttribute: n.get,
    // só o nó em EDIÇÃO é `<input>`, e é a PRESENÇA de `value` que o distingue no despejo
    ...('value' in n ? { value: n.value } : {}) }));
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

// ---------- o ALV editável: escrever numa célula (item 47) ----------
//
// O `lsdata` é o REAL do `BCALV_EDIT_01` no s4h 758/250 (05/09/2026,
// POC_webgui_grid_edit/medicoes/raw/d-escrever-BCALV_EDIT_01.json): em repouso a célula é
// `<span ct="CBS">` com o `21` OBJETO; com o foco ela vira `<input>` de mesmo id e o `21` vira
// STRING JSON — a forma que fazia o `lerGrid` devolver `''` calado.
const celulaEmEdicao = (r, c, servidor, digitado) => ({
  id: `grid#C102#${r},${c}#if`, ct: 'CBS', texto: '', value: digitado,
  lsdata: JSON.stringify({ x: 0, 1: 'FREETEXT', 2: false, 3: 'x_TALB', 5: servidor, 7: true, 12: true,
    14: 'SERVER', 16: true, 20: false, 21: JSON.stringify({ value: servidor, halign: 'r', maxlen: 10, focusable: 'X' }),
    23: '', 25: 'FILL_FIXED_LAYOUT' }),
});

test('webgui: a célula EM EDIÇÃO vira <input> e o 21 vira string — o bloco lê o digitado, não vazio', () => {
  const doc = domDoGrid([celulaReal(1, 1, 'Autostart'), celulaEmEdicao(1, 3, '385', '333')]);
  const b = rodarBloco(doc);
  // sem o conserto esta célula saía '' (nenhum valor-objeto no lsdata + innerText de <input> vazio)
  expect(b.celulas['1']).toEqual({ 1: 'Autostart', 3: '333' });
  // e a leitura AVISA que aquilo ainda não foi publicado — o servidor tem outro valor
  expect(b.editando).toEqual({ linha: 1, coluna: 3, digitado: '333', servidor: '385' });
});

test('webgui: sem célula em edição, `editando` é null', () => {
  expect(rodarBloco(domDoGrid([celulaReal(1, 1, 'Autostart')])).editando).toBe(null);
});

test('webgui: o grid alvo se escolhe por índice, id ou sid — e o erro DIZ o que a tela tem', () => {
  const grids = [{ id: 'C102', sid: 'wnd[0]/usr/cntlGRID1/shellcont/shell' }, { id: 'C103', sid: 'wnd[1]/x' }];
  expect(escolherGrid(grids).id).toBe('C102');                       // sem alvo, o primeiro
  expect(escolherGrid(grids, 1).id).toBe('C103');
  expect(escolherGrid(grids, { id: 'C103' }).id).toBe('C103');
  expect(escolherGrid(grids, { sid: 'wnd[1]/x' }).id).toBe('C103');
  expect(() => escolherGrid(grids, { id: 'C999' }, 'escreverCelula'))
    .toThrow(/escreverCelula — a tela não tem esse grid \(tem 2: C102, C103\)/);
  expect(() => escolherGrid([], null, 'lerGrid')).toThrow(/tem 0: nenhum/);
});

test('webgui: a coluna se endereça pelo NOME do ColumnIDs (é como o action/622 a endereça)', () => {
  const cols = ['CARRID', 'CONNID', 'FLDATE', 'PRICE', 'CURRENCY', 'PLANETYPE', 'SEATSMAX'];
  expect(indiceDaColuna(cols, 'SEATSMAX')).toBe(7);
  expect(indiceDaColuna(cols, 'seatsmax')).toBe(7);                  // o nome não é case-sensitive
  expect(indiceDaColuna(cols, 3)).toBe(3);                           // o número passa direto
  expect(() => indiceDaColuna(cols, 'SEATS_MAX')).toThrow(/não tem a coluna "SEATS_MAX" \(tem 7: CARRID, CONNID/);
  // a coluna 0 é a caixa de seleção da linha, não é dado — pedir 0 é erro de quem chama
  expect(() => indiceDaColuna(cols, 0)).toThrow(/1-based/);
  expect(() => indiceDaColuna([], 'X')).toThrow(/tem 0: nenhuma/);
});

// ---------- o ALV inteiro pelo fetch da própria página (item 74) ----------

// o mesmo harness do bloco, mas a expressão é ASSÍNCRONA e precisa de `window`, `fetch` e do form
const rodarFragmento = (js, { form = { getAttribute: () => '/sap(TOK)/bc/gui/sap/its/webgui/' },
  moin = '9410E7BF9FDCCC03', resposta } = {}) => {
  const chamadas = [];
  const fetchFalso = async (url, opts) => { chamadas.push({ url, opts }); return resposta; };
  const documento = { getElementById: (id) => (id === 'webguiform0' ? form : null) };
  const janela = { moin };
  return new Function('document', 'window', 'fetch', `return ${js}`)(documento, janela, fetchFalso)
    .then((r) => ({ r, chamadas }));
};
const respostaDe = (corpo, { status = 200, tipo = 'text/xml; charset=utf-8' } = {}) =>
  ({ status, headers: { get: () => tipo }, text: async () => corpo });

test('webgui: o fragmento vai no MESMO batch do its.mjs, com o action e o moin DA PÁGINA', async () => {
  const { r, chamadas } = await rodarFragmento(
    jsFragmentoDoGrid('wnd[0]/usr/cntlGRID1/shellcont/shell', 'C102', 0, 499),
    { resposta: respostaDe('<delta-update></delta-update>') });
  expect(chamadas).toHaveLength(1);
  const [{ url, opts }] = chamadas;
  expect(url).toBe('/sap(TOK)/bc/gui/sap/its/webgui/batch/json?~RG_WEBGUI=X&');
  expect(opts.method).toBe('POST');
  expect(opts.credentials).toBe('same-origin');           // é o cookie HttpOnly da sessão da tela
  expect(opts.headers.moin).toBe('9410E7BF9FDCCC03');     // ⚠ sem ele o ITS devolve 500 e a sessão morre
  expect(JSON.parse(opts.body)).toEqual([
    { post: 'action/710/wnd[0]/usr/cntlGRID1/shellcont/shell', content: 'position=0&fragments=0,499;' },
    { get: 'state/ur/wnd[0]/usr/cntlGRID1/shellcont/shell' },
  ]);
  expect(r.status).toBe(200);
  expect(r.ehDelta).toBe(true);
});

test('webgui: as células saem do lsdata com a ENTIDADE decodificada (o XML cru não é o DOM)', async () => {
  // o corpo é o do delta de verdade: `&#39;` no valor, a coluna 0 sem `#if`, e outro grid junto
  const corpo = [
    '<delta-update>',
    `<span id="grid#C102#1,1#if" ct="CBS" lsdata='{"21":{"value":"Autostart"}}'>Autostart</span>`,
    `<span id="grid#C102#1,5#if" ct="CBS" lsdata='{"21":{"value":"Max num of unused seg&#39;s"}}'>x</span>`,
    `<span id="grid#C102#2,1#if" ct="CBS" lsdata='{"21":{"value":"CPU_CORES"}}'>CPU_CORES</span>`,
    `<td id="grid#C102#1,0" lsdata='{"7":{"SID":"…","Type":"SAPTABLECSSELECTIONCELL"}}'></td>`,
    `<span id="grid#C999#1,1#if" ct="CBS" lsdata='{"21":{"value":"de outro grid"}}'>y</span>`,
    '</delta-update>',
  ].join('');
  const { r } = await rodarFragmento(jsFragmentoDoGrid('wnd[0]/x', 'C102', 0, 1),
    { resposta: respostaDe(corpo) });
  expect(r.celulas).toEqual({ 1: { 1: 'Autostart', 5: "Max num of unused seg's" }, 2: { 1: 'CPU_CORES' } });
  expect(r.nLinhas).toBe(2);
  expect(r.primeira).toBe(1);
  expect(r.ultima).toBe(2);
});

test('webgui: sem form ou sem moin o fragmento NEM POSTA — falhar cedo é mais barato que ressuscitar sessão', async () => {
  const semForm = await rodarFragmento(jsFragmentoDoGrid('wnd[0]/x', 'C102', 0, 1), { form: null });
  expect(semForm.r.erro).toMatch(/webguiform0/);
  expect(semForm.chamadas).toHaveLength(0);
  const semMoin = await rodarFragmento(jsFragmentoDoGrid('wnd[0]/x', 'C102', 0, 1), { moin: null });
  expect(semMoin.r.erro).toMatch(/moin/);
  expect(semMoin.chamadas).toHaveLength(0);
});

test('webgui: resposta que não é delta volta com status e começo do corpo (é o 500 que mata a sessão)', async () => {
  const { r } = await rodarFragmento(jsFragmentoDoGrid('wnd[0]/x', 'C102', 0, 1),
    { resposta: respostaDe('<html><head><title>Application Server Error</title>', { status: 500, tipo: 'text/html; charset=utf-8' }) });
  expect(r.status).toBe(500);
  expect(r.ehDelta).toBe(false);
  expect(r.inicio).toContain('Application Server Error');
  expect(r.celulas).toEqual({});
});

test('webgui: o avanço do laço é pelo que FALTA (o servidor devolve no mínimo uma janela)', () => {
  expect(faltaNaFaixaDoBloco({ 1: {}, 2: {}, 3: {} }, 1, 3)).toBe(null);
  expect(faltaNaFaixaDoBloco({ 1: {}, 3: {} }, 1, 3)).toBe(2);
  expect(faltaNaFaixaDoBloco({}, 5, 10)).toBe(5);
  expect(faltaNaFaixaDoBloco({ 1: {} }, 1, 0)).toBe(null);          // faixa vazia
});

// ---------- posicionar numa linha distante (item 75) ----------

test('webgui: o lsdata do scrollbar vira nomes — e a posição dele NÃO é onde a janela está', () => {
  // o lsdata REAL do C102_vscroll na lista do RSPARAM (1617 linhas, janela de 27)
  const e = estadoDoScrollbar({ 0: 1, 1: 1591, 2: 1, 3: 27, 6: 'C102', 7: true, 10: 1617 });
  expect(e).toEqual({ posicao: 1, maximo: 1591, passo: 1, janela: 27, dono: 'C102', ativo: true, total: 1617 });
  expect(e.maximo).toBe(e.total - e.janela + 1);
  // ⚠ depois de rolar até a linha 1600 o servidor CONTINUA publicando posicao 1 — medido
  expect(estadoDoScrollbar({ 0: 1, 1: 1591, 3: 27, 10: 1617 }).posicao).toBe(1);
  expect(estadoDoScrollbar({}).total).toBe(null);
});

test('webgui: a mira põe a linha no MEIO da janela — mirar o topo deixa o alvo escapar por 1', () => {
  const scb = { 0: 1, 1: 1591, 2: 1, 3: 27, 6: 'C102', 7: true, 10: 1617 };
  const geo = { scb, bar: { topo: 146, h: 674 }, hdl: { h: 27, yc: 159 } };
  const m = miraDoScrollbar(900, geo);
  expect(m.desejada).toBe(887);                        // 900 − 13, para o alvo cair no centro
  expect(900 - m.desejada).toBe(13);                   // e o erro medido do arrasto (0..+3) cabe folgado
  expect(m.pxPorLinha).toBeCloseTo((674 - 27) / 1590, 5);
  // as bordas grudam no que o scrollbar permite, sem estourar
  expect(miraDoScrollbar(1, geo).desejada).toBe(1);
  expect(miraDoScrollbar(1, geo).y).toBeCloseTo(146 + 13.5, 5);
  expect(miraDoScrollbar(1617, geo).desejada).toBe(1591);
  expect(miraDoScrollbar(1617, geo).y).toBeCloseTo(146 + 13.5 + 647, 5);
});

test('webgui: naJanela decide pela janela PINTADA — janela vazia nunca contém linha', () => {
  expect(naJanela({ de: 888, ate: 914, n: 27 }, 900)).toBe(true);
  expect(naJanela({ de: 888, ate: 914, n: 27 }, 887)).toBe(false);   // o +1 que fazia o alvo escapar
  expect(naJanela({ de: 888, ate: 914, n: 27 }, 914)).toBe(true);
  expect(naJanela({ de: null, ate: null, n: 0 }, 900)).toBe(false);  // o repinte no meio do caminho
  expect(naJanela(null, 900)).toBe(false);
});

// O DOM mínimo que o `jsJanelaDoGrid` toca: o grid, o `_vscroll` com o lsdata, o thumb, o trilho e
// as `<tr iidx>` — as de altura 0 estão no DOM e NÃO estão na tela (é o bloco, não a janela).
const rodarJanela = (js, { lsdata = { 0: 1, 1: 1591, 3: 27, 10: 1617 }, linhas = [],
  grid = { left: 48, top: 112, width: 1470, height: 722 },
  hdl = { left: 1505, top: 146, width: 12, height: 27 },
  bar = { left: 1505, top: 146, width: 12, height: 674 }, innerHeight = 905 } = {}) => {
  const caixa = (r) => ({ getBoundingClientRect: () => r });
  const els = {
    C102: caixa(grid),
    C102_vscroll: { getAttribute: (a) => (a === 'lsdata' ? JSON.stringify(lsdata) : null) },
    'C102_vscroll-hdl': hdl && caixa(hdl),
    'C102_vscroll-bar': bar && caixa(bar),
  };
  const documento = {
    getElementById: (id) => els[id] ?? null,
    querySelectorAll: (sel) => (sel !== 'tr[iidx]' ? [] : linhas.map((l) => ({
      id: `C102-mrss-cont-none-${l.iidx}`, offsetHeight: l.h,
      getAttribute: () => String(l.iidx),
    }))),
  };
  return new Function('document', 'innerHeight', `return ${js}`)(documento, innerHeight);
};

test('webgui: a janela do grid sai do iidx das <tr> VISÍVEIS, 1-based — não do lsdata', () => {
  const r = rodarJanela(jsJanelaDoGrid('C102'),
    { linhas: [{ iidx: 899, h: 16 }, { iidx: 900, h: 16 }, { iidx: 901, h: 0 }] });
  expect(r.janela).toEqual({ de: 900, ate: 901, n: 2 });     // iidx 0-based → linha 1-based
  expect(estadoDoScrollbar(r.scb).total).toBe(1617);
  expect(r.hdl.yc).toBe(159.5);
  expect(r.bar.topo).toBe(146);
  expect(r.centro).toEqual({ x: 783, y: 473 });               // o centro do grid, para a roda
});

test('webgui: sem <tr> pintada a janela é VAZIA (e ninguém a confunde com a linha 1)', () => {
  const r = rodarJanela(jsJanelaDoGrid('C102'), { linhas: [{ iidx: 5, h: 0 }] });
  expect(r.janela).toEqual({ de: null, ate: null, n: 0 });
  expect(naJanela(r.janela, 6)).toBe(false);
});

test('webgui: grid sem scrollbar devolve hdl/bar nulos — é o que faz posicionarGrid estourar', () => {
  const r = rodarJanela(jsJanelaDoGrid('C102'), { hdl: null, bar: null, linhas: [{ iidx: 0, h: 16 }] });
  expect(r.hdl).toBe(null);
  expect(r.bar).toBe(null);
  expect(rodarJanela(jsJanelaDoGrid('C999'))).toBe(null);     // grid que não existe
});

// ---------- selecionar linha e célula no ALV (item 76) ----------

// o `lsdata` REAL do grid `C102` do laboratório ZJBV_ALV47_EDIT (s4h 758/250, 05/09/2026,
// `POC_webgui_grid_sel/medicoes/raw/a-anatomia.json`) — só as chaves que a seleção usa
const LSDATA_SEL = (extra = {}) => JSON.stringify({
  x: 0,
  34: {
    SID: 'wnd[0]/shellcont/shell', Type: 'GuiGridView', editable: true,
    ColumnIDs: ['ID', 'NOME', 'QTD'], totalRows: 3, visibleRows: 25,
    selectedRow: -1, selectedRows: ';', selectedCells: '', selectedColumns: ';',
    selectedBlock: { RefCol: -1, RefRow: -1, TopLeftCol: -1, TopLeftRow: -1, BottomRightCol: -1, BottomRightRow: -1 },
    selectionMode: { web: 0, rows: 2, type: 'rowscols', cells: 0, native: true, columns: 2 },
    currentCellRow: 1, currentCellColumn: 1, hasSelectionColumn: true,
    delayedChangedSelectionTimeout: 1500,
    ...extra,
  },
});

// a caixa da coluna 0: `<td subct="SC">` com um `<div role="gridcell">` cuja CLASSE diz o estado
const caixaReal = (linha, selecionada, cid = 'C102') => ({
  id: `grid#${cid}#${linha},0`,
  parentElement: { className: '' },
  querySelector: (sel) => (sel !== 'div[role="gridcell"]' ? null : {
    className: 'urBorderBox lsSapTable--expandWidth lsSTCellHeight100 urSTSCOuterDiv ' +
      (selecionada ? 'urSTRowSelIcon urST4LbSelIcon' : 'urSTRowUnSelIcon urST4LbUnselIcon'),
  }),
});

const rodarSelecao = (js, { caixas = [], lsdata = LSDATA_SEL(), cid = 'C102' } = {}) => {
  const documento = {
    getElementById: (id) => (id === cid ? { getAttribute: (a) => (a === 'lsdata' ? lsdata : null) } : null),
    querySelectorAll: (sel) => (sel === 'td[subct="SC"]' ? caixas : []),
  };
  return new Function('document', `return ${js}`)(documento);
};

test('webgui: quem diz a seleção é a CLASSE da caixa, não o lsdata (que fica um round-trip atrás)', () => {
  // a tela tem 1 e 3 pintadas; o servidor ainda publica a seleção ANTERIOR (só a 2)
  const r = rodarSelecao(jsSelecaoDoGrid('C102'), {
    caixas: [caixaReal(1, true), caixaReal(2, false), caixaReal(3, true)],
    lsdata: LSDATA_SEL({ selectedRows: ';2;', currentCellRow: 2, currentCellColumn: 3 }),
  });
  expect(r.pintadas).toEqual([1, 3]);
  expect(r.caixas).toEqual([1, 2, 3]);                       // o BLOCO: que linhas têm caixa
  expect(r.publicado.linhas).toBe(';2;');
  expect(r.celulaCorrente).toEqual({ linha: 2, coluna: 3 });
  expect(r.temColunaDeSelecao).toBe(true);
  expect(r.modo.type).toBe('rowscols');
  expect(r.total).toBe(3);
  expect(rodarSelecao(jsSelecaoDoGrid('C999'))).toBe(null);  // grid fora da tela
});

test('webgui: a caixa de OUTRO grid, o cabeçalho e a caixa sem div não entram na conta', () => {
  const r = rodarSelecao(jsSelecaoDoGrid('C102'), {
    caixas: [
      caixaReal(1, true),
      caixaReal(2, true, 'C999'),                            // outro grid
      { ...caixaReal(0, true), id: 'grid#C102#0,0' },         // o cabeçalho (SELECTION_TOGGLE)
      { id: 'grid#C102#3,0', parentElement: {}, querySelector: () => null },   // sem o div interno
    ],
  });
  expect(r.pintadas).toEqual([1]);
  expect(r.caixas).toEqual([1, 3]);                          // a 3 tem caixa, só não está pintada
});

test('webgui: o selectedRows COMPACTA faixa com "-" — split(";") perderia linhas', () => {
  expect(interpretarSelectedRows(';1-3;')).toEqual([1, 2, 3]);   // medido: 1,2,3 saem assim
  expect(interpretarSelectedRows(';1;3;')).toEqual([1, 3]);      // medido: ctrl+clique
  expect(interpretarSelectedRows(';2;')).toEqual([2]);           // medido: uma linha
  expect(interpretarSelectedRows(';')).toEqual([]);              // medido: nenhuma
  expect(interpretarSelectedRows('')).toEqual([]);
  expect(interpretarSelectedRows(null)).toEqual([]);
  expect(interpretarSelectedRows(';1-3;7;10-11;')).toEqual([1, 2, 3, 7, 10, 11]);
  expect(interpretarSelectedRows(';2;1;2;')).toEqual([1, 2]);    // sem repetido, ordenado
});

test('webgui: a caixa de seleção NÃO tem o sufixo #if da célula de dado', () => {
  expect(idDaCaixa('C102', 3)).toBe('grid#C102#3,0');
  expect(idDaCaixa('C102', 3)).not.toContain('#if');
});

test('webgui: os modificadores do clique são o mapa de bits do CDP', () => {
  expect(MOD).toEqual({ alt: 1, ctrl: 2, meta: 4, shift: 8 });
});

// ---------- ordenar e filtrar o ALV (item 77) ----------
// Os ícones e os SIDs abaixo são os MEDIDOS no laboratório ZJBV_ALV47_EDIT (s4h 758/250,
// 05-06/09/2026) — `POC_webgui_grid_ord/medicoes/raw/j-icones.json` e `a-anatomia.json`.

const th = (coluna, icone, { cid = 'C102', tag = 'TH' } = {}) => ({
  id: `grid#${cid}#0,${coluna}`,
  tagName: tag,
  querySelectorAll: () => (icone ? [{ getAttribute: (a) => (a === 'src' ? `/sap/public/icmandir/its/~cache-7930300/lsgui/themes/sap_fiori_3/images/gridview/${icone}` : null) }] : []),
});
const rodarCabecalho = (js, nos) => new Function('document', `return ${js}`)({
  querySelectorAll: (sel) => (sel === '[id^="grid#C102#0,"]' ? nos : []),
});
const rodarBotao = (js, botoes) => new Function('document', `return ${js}`)({
  querySelectorAll: (sel) => (sel === '[ct="B"]' ? botoes : []),
});
const botao = (id, sid, { largura = 20 } = {}) => ({
  id, title: 'x', offsetWidth: largura, offsetHeight: largura ? 20 : 0,
  getAttribute: (a) => (a === 'lsdata' ? `{"x":0,"27":{"SID":"${sid}","Type":"GuiButton","SubType":"toolbar"}}` : null),
});

test('webgui: o ícone do cabeçalho codifica ORDEM e FILTRO na mesma palavra', () => {
  // os cinco casos medidos na fase J, na ordem em que apareceram
  expect(estadoDoCabecalho(null)).toEqual({ ordem: null, filtrada: false });
  expect(estadoDoCabecalho('headaoo.png')).toEqual({ ordem: 'asc', filtrada: false });
  expect(estadoDoCabecalho('headdoo.png')).toEqual({ ordem: 'desc', filtrada: false });
  expect(estadoDoCabecalho('headoof.png')).toEqual({ ordem: null, filtrada: true });
  expect(estadoDoCabecalho('headaof.png')).toEqual({ ordem: 'asc', filtrada: true });
  expect(estadoDoCabecalho('headdof.png')).toEqual({ ordem: 'desc', filtrada: true });
});

test('webgui: o cabeçalho do grid sai coluna a coluna, com o ícone que ele mostra', () => {
  const r = rodarCabecalho(jsCabecalhoDoGrid('C102'), [
    th(0, null), th(1, null), th(2, 'headdof.png'), th(3, 'headaoo.png'),
    { ...th(9, 'headaoo.png'), tagName: 'TD' },              // não é <th>: é célula de dado
  ]);
  expect(r).toEqual([
    { coluna: 0, icone: null }, { coluna: 1, icone: null },
    { coluna: 2, icone: 'headdof.png' }, { coluna: 3, icone: 'headaoo.png' },
  ]);
});

test('webgui: o cabeçalho é a linha 0 do grid, sem o #if da célula de dado', () => {
  expect(idDoCabecalho('C102', 2)).toBe('grid#C102#0,2');
  expect(idDoCabecalho('C102', 2)).not.toContain('#if');
});

test('webgui: o botão da barra do ALV casa pelo SID do GRID, não pelo id posicional', () => {
  const barra = [
    botao('C102_toolbar_btn15', 'wnd[0]/shellcont/shell/tbar/btn&SORT_ASC'),
    botao('_MB_FILTER102', 'wnd[0]/shellcont/shell/tbar/dbtn&MB_FILTER'),
    botao('C900_toolbar_btn15', 'wnd[0]/shellcont/shell2/tbar/btn&SORT_ASC'),   // OUTRO ALV da tela
  ];
  const sid = 'wnd[0]/shellcont/shell';
  expect(rodarBotao(jsBotaoDaBarra(sid, 'SORT_ASC'), barra).id).toBe('C102_toolbar_btn15');
  expect(rodarBotao(jsBotaoDaBarra(sid, 'MB_FILTER'), barra).id).toBe('_MB_FILTER102');  // acha o dbtn&
  expect(rodarBotao(jsBotaoDaBarra('wnd[0]/shellcont/shell2', 'SORT_ASC'), barra).id).toBe('C900_toolbar_btn15');
  expect(rodarBotao(jsBotaoDaBarra(sid, 'SORT_DSC'), barra)).toBe(null);         // esta barra não tem
});

test('webgui: o botão escondido é achado, mas marcado como invisível (quem decide é quem chama)', () => {
  const r = rodarBotao(jsBotaoDaBarra('wnd[0]/shellcont/shell', 'SORT_ASC'),
    [botao('C102_toolbar_btn15', 'wnd[0]/shellcont/shell/tbar/btn&SORT_ASC', { largura: 0 })]);
  expect(r.visivel).toBe(false);
});

// Os quatro fcodes de linha, como saíram da barra REAL do ZJBV_ALV47_EDIT (s4h 758/250,
// 06/09/2026, `POC_webgui_grid_linha/medicoes/raw/a-barra.json`). O `&` no meio do nome é do ALV
// (`&LOCAL&APPEND`), e o SID já traz o primeiro — quem monta o seletor não pode pôr outro.
test('webgui: os fcodes de linha do ALV são os medidos, e o SID casa com eles', () => {
  expect(FCODES_DE_LINHA).toEqual({
    anexar: 'LOCAL&APPEND', inserir: 'LOCAL&INSERT_ROW',
    apagar: 'LOCAL&DELETE_ROW', duplicar: 'LOCAL&COPY_ROW',
  });
  const sid = 'wnd[0]/shellcont/shell';
  const barra = [
    botao('C102_toolbar_btn10', `${sid}/tbar/btn&LOCAL&APPEND`),
    botao('C102_toolbar_btn11', `${sid}/tbar/btn&LOCAL&INSERT_ROW`),
    botao('C102_toolbar_btn12', `${sid}/tbar/btn&LOCAL&DELETE_ROW`),
    botao('C102_toolbar_btn15', `${sid}/tbar/btn&SORT_ASC`),
  ];
  expect(rodarBotao(jsBotaoDaBarra(sid, FCODES_DE_LINHA.anexar), barra).id).toBe('C102_toolbar_btn10');
  expect(rodarBotao(jsBotaoDaBarra(sid, FCODES_DE_LINHA.inserir), barra).id).toBe('C102_toolbar_btn11');
  expect(rodarBotao(jsBotaoDaBarra(sid, FCODES_DE_LINHA.apagar), barra).id).toBe('C102_toolbar_btn12');
  // o ALV somente leitura não publica nenhum deles — e é assim que o erro sai com a lista certa
  expect(rodarBotao(jsBotaoDaBarra(sid, FCODES_DE_LINHA.duplicar), barra)).toBe(null);
});

// ---------- colar um BLOCO no ALV (item 79) ----------

test('webgui: a matriz vira o TSV do Excel — TAB entre colunas, quebra entre linhas', () => {
  const b = tsvDoBloco([['a', 1], ['b', 2]]);
  expect(b.tsv).toBe('a\t1\nb\t2');
  expect([b.linhas, b.colunas, b.celulas]).toEqual([2, 2, 4]);
  // o TSV pronto passa direto, e o `\r\n` do Excel é normalizado (medido: dá o MESMO batch)
  expect(tsvDoBloco('a\t1\r\nb\t2').tsv).toBe('a\t1\nb\t2');
  // null/undefined viram célula vazia; número vira texto
  expect(tsvDoBloco([['x', null], [undefined, 7]]).tsv).toBe('x\t\n\t7');
  // linha irregular é aceita — `colunas` é a maior, que é o que decide o estouro à direita
  expect(tsvDoBloco([['a'], ['b', 'c']]).colunas).toBe(2);
});

test('webgui: o TSV recusa o que o renderer partiria ou ignoraria em silêncio', () => {
  // TAB/quebra DENTRO do valor viraria célula a mais, sem aviso
  expect(() => tsvDoBloco([['a\tb', 'c'], ['d', 'e']])).toThrow(/linha 1, coluna 1 tem TAB ou quebra/);
  expect(() => tsvDoBloco([['a', 'b\nc'], ['d', 'e']])).toThrow(/linha 1, coluna 2 tem TAB ou quebra/);
  // uma célula só NÃO é colagem de tabela: medido que o renderer ignora o paste (0 requisição)
  expect(() => tsvDoBloco([['so-uma']])).toThrow(/UMA célula não é colagem de tabela.*escreverCelula/s);
  expect(() => tsvDoBloco('so-uma')).toThrow(/UMA célula não é colagem de tabela/);
  expect(() => tsvDoBloco([])).toThrow(/array vazio/);
  expect(() => tsvDoBloco(null)).toThrow(/veio null/);
});

test('webgui: o gesto de colar é um `paste` com DataTransfer — e o preventDefault é o recibo', () => {
  const eventos = [];
  const dados = {};
  class DataTransferFalso { setData(t, v) { dados[t] = v; } }
  class ClipboardEventFalso {
    constructor(tipo, init) { this.type = tipo; Object.assign(this, init); this.defaultPrevented = false; }
  }
  const elemento = (tratar) => ({
    id: 'grid#C102#2,3#if', tagName: 'INPUT',
    dispatchEvent(ev) { eventos.push(ev); if (tratar) ev.defaultPrevented = true; return !tratar; },
  });
  const rodar = (el) => new Function('document', 'DataTransfer', 'ClipboardEvent',
    `return ${jsColarNoGrid('grid#C102#2,3#if', 'a\t1\nb\t2')}`)(
    { getElementById: (id) => (id === 'grid#C102#2,3#if' ? el : null), activeElement: el },
    DataTransferFalso, ClipboardEventFalso);

  const tratado = rodar(elemento(true));
  expect(tratado).toEqual({ tag: 'INPUT', foco: true, tratado: true });
  expect(dados['text/plain']).toBe('a\t1\nb\t2');
  expect([eventos[0].type, eventos[0].bubbles, eventos[0].cancelable]).toEqual(['paste', true, true]);

  // sem `preventDefault` o renderer NÃO tratou: é o silêncio que o colarBloco transforma em erro
  expect(rodar(elemento(false)).tratado).toBe(false);
  // a célula que sumiu do DOM entre o clique e o paste sai como erro, não como `undefined`
  expect(rodar(null).erro).toMatch(/sumiu do DOM antes do paste/);
});

// ---------- a ÁRVORE do SAP Easy Access (item 86) ----------
//
// As puras são as MESMAS das duas vias (o `its.mjs` as importa daqui): o que muda é de onde vêm os
// brutos. Aqui elas são exercitadas no formato do DOM, que é o do `JS_ARVORE`.

/** O `nodeindexes` medido no boot do SMEN (s4h 758/250) — `[chave, categoria, índiceDoPai]`. */
const NODEINDEXES = [0, ['Favo', 2, -1], ['F00002', 3, 1], ['F00003', 3, 1], ['Root', 0, -1],
  ['0000000003', 1, 4], ['0000000004', 1, 4]];

const SID_ARVORE = 'wnd[0]/usr/cntlIMAGE_CONTAINER/shellcont/shell/shellcont[0]/shell';

const ROTULOS = { 1: 'Favoritos', 2: 'SAP Fiori Launchpad', 3: 'Produção -> Controle de produção',
  4: 'Menu SAP', 5: 'Conector para SAP Multi-Bank Connectivity', 6: 'Escritório' };

const BRUTOS_ARVORE = [
  { id: 'tree#C105', ct: 'STCS', lsdata: { 0: 'árvore', 34: { SID: SID_ARVORE, Type: 'GuiTree', nodeindexes: NODEINDEXES } } },
  // o filler de cada linha é `TV` também, e NÃO é nó — o `indiceDoNo` é quem separa
  { id: 'tree#C105#1#f', ct: 'TV', lsdata: { 14: true } },
  ...Object.entries(ROTULOS).map(([n, rotulo]) => ({ id: `tree#C105#${n}#1#1#i`, ct: 'TV', lsdata: { 0: rotulo } })),
];

const EXPANSAO_ARVORE = new Map([[1, 'EXPANDED'], [2, 'INDENT'], [3, 'INDENT'], [4, 'EXPANDED'],
  [5, 'COLLAPSED'], [6, 'COLLAPSED']]);

test('webgui: indiceDoNo só reconhece o nó da árvore — o ícone, o container e o filler não são nó', () => {
  expect(indiceDoNo('tree#C105#6#1#1#i')).toBe(6);
  expect(indiceDoNo('tree#C105#15#1#1#i')).toBe(15);
  expect([indiceDoNo('tree#C105#6#ni'), indiceDoNo('tree#C105#6#f'), indiceDoNo('tree#C105#6#1#mg'),
    indiceDoNo('tree#C105'), indiceDoNo(null)]).toEqual([null, null, null, null, null]);
});

test('webgui: containerDaArvore acha o GuiTree pelo VALOR do lsdata, não pelo índice', () => {
  expect(containerDaArvore(BRUTOS_ARVORE)).toEqual({ id: 'tree#C105', sid: SID_ARVORE, nodeindexes: NODEINDEXES });
  // um grid não é árvore: sem `nodeindexes` não há container
  expect(containerDaArvore([{ id: 'g', ct: 'STCS', lsdata: { 34: { SID: 'x', Type: 'GuiGridView' } } }])).toBe(null);
  expect(containerDaArvore([])).toBe(null);
});

test('webgui: arvoreDosBrutos cruza o nodeindexes com os TV — a CHAVE, o pai e o nível', () => {
  const a = arvoreDosBrutos(BRUTOS_ARVORE);
  expect(a.sid).toBe(SID_ARVORE);
  expect(a.nos.map((x) => [x.n, x.chave, x.pai, x.nivel, x.categoria])).toEqual([
    [1, 'Favo', -1, 0, 2], [2, 'F00002', 1, 1, 3], [3, 'F00003', 1, 1, 3],
    [4, 'Root', -1, 0, 0], [5, '0000000003', 4, 1, 1], [6, '0000000004', 4, 1, 1],
  ]);
  expect(a.nos.find((x) => x.n === 6).rotulo).toBe('Escritório');
  // sem `expansao` o `temFilhos` é `null` — "não sei", que NÃO é "não tem"
  expect(a.nos.every((x) => x.temFilhos === null && x.expansao === null)).toBe(true);
  // sem árvore na tela, nada — e não lança
  expect(arvoreDosBrutos([{ id: 'x', ct: 'B', lsdata: {} }])).toEqual({ sid: null, id: null, nodeindexes: null, nos: [] });
});

test('webgui: a expansão vira `temFilhos` — INDENT é FOLHA, COLLAPSED/EXPANDED é pasta', () => {
  const { nos } = arvoreDosBrutos(BRUTOS_ARVORE, EXPANSAO_ARVORE);
  expect(nos.map((x) => [x.chave, x.expansao, x.temFilhos])).toEqual([
    ['Favo', 'EXPANDED', true], ['F00002', 'INDENT', false], ['F00003', 'INDENT', false],
    ['Root', 'EXPANDED', true], ['0000000003', 'COLLAPSED', true], ['0000000004', 'COLLAPSED', true],
  ]);
});

test('webgui: acharNoDaArvore acha por chave e por rótulo (sem acento nem caixa), e o erro lista o que existe', () => {
  const { nos } = arvoreDosBrutos(BRUTOS_ARVORE);
  expect(acharNoDaArvore(nos, '0000000004').rotulo).toBe('Escritório');
  expect(acharNoDaArvore(nos, 'escritorio').chave).toBe('0000000004');
  expect(acharNoDaArvore(nos, { chave: 'Favo' }).rotulo).toBe('Favoritos');
  // `{ chave }` é EXATO: não cai no casamento por rótulo
  expect(() => acharNoDaArvore(nos, { chave: 'Escritório' })).toThrow(/a árvore não tem/);
  expect(() => acharNoDaArvore(nos, 'Contabilidade')).toThrow(/Escritório \(0000000004\)/);
});

test('webgui: assinaturaDaArvore vê o ESTADO, não só o tamanho — é o veredito do gesto', () => {
  const a = arvoreDosBrutos(BRUTOS_ARVORE, EXPANSAO_ARVORE);
  const fechada = arvoreDosBrutos(BRUTOS_ARVORE, new Map([...EXPANSAO_ARVORE, [1, 'COLLAPSED']]));
  // mesmos 6 nós, um estado diferente: o carimbo da tela não separaria isso
  expect(a.nos.length).toBe(fechada.nos.length);
  expect(assinaturaDaArvore(a)).not.toBe(assinaturaDaArvore(fechada));
  expect(assinaturaDaArvore(a)).toBe(assinaturaDaArvore(arvoreDosBrutos(BRUTOS_ARVORE, EXPANSAO_ARVORE)));
  expect(assinaturaDaArvore(null)).toBe('0|');
});

test('webgui: JS_ARVORE despeja o container, os TV e o `td subct="HIC"` que o despejo por [ct] não vê', () => {
  const el = (id, atributos, texto = '') => ({
    id, innerText: texto,
    getAttribute: (nome) => (nome in atributos ? atributos[nome] : null),
  });
  const controles = [
    el('tree#C105', { ct: 'STCS', lsdata: JSON.stringify({ 34: { SID: SID_ARVORE, Type: 'GuiTree', nodeindexes: NODEINDEXES } }) }),
    el('tree#C105#6#1#1#i', { ct: 'TV', lsdata: JSON.stringify({ 0: 'Escritório' }) }, 'Escritório'),
    el('tree#C105#6#f', { ct: 'TV', lsdata: 'lixo que não é JSON' }),
  ];
  const celulas = [
    el('tree#C105#6#1', { subct: 'HIC', lsdata: JSON.stringify({ x: 0, 4: 1, 5: 'COLLAPSED' }) }),
    el('tree#C105#2#1', { subct: 'HIC', lsdata: JSON.stringify({ 5: 'INDENT' }) }),
    el('tree#C105-mrss-cont-none', { subct: 'HIC', lsdata: null }),   // não é linha de nó
  ];
  const doc = { querySelectorAll: (seletor) => (seletor.includes('subct') ? celulas : controles) };
  const cru = new Function('document', `return ${JS_ARVORE}`)(doc);

  expect(cru.expansao).toEqual([[6, 'COLLAPSED'], [2, 'INDENT']]);
  expect(cru.brutos.map((b) => b.ct)).toEqual(['STCS', 'TV', 'TV']);
  expect(cru.brutos[2].lsdata).toBe(null);   // `lsdata` inválido não derruba o despejo
  // e o cru alimenta as puras sem tradução nenhuma — é o mesmo caminho da via HTTP
  const a = arvoreDosBrutos(cru.brutos, new Map(cru.expansao));
  expect(a.nos.map((x) => [x.chave, x.rotulo, x.expansao, x.temFilhos]))
    .toEqual([['0000000004', 'Escritório', 'COLLAPSED', true]]);
});
