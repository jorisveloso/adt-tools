// its.test.mjs — a parte PURA da via HTTP do WebGUI: o shell, a leitura da resposta (delta ×
// multipart × logoff × 400), os SIDs tirados do lsdata, a resolução de alvo e os batches. Nada aqui
// toca a rede; o E2E é a POC do item 20 (sap-accelerate/work/POC_webgui_its_lib).
// Todo trecho bruto é COPIADO das respostas do s4h 758/250 de 04/09/2026
// (sap-accelerate/work/POC_webgui_okcode/medicoes/raw/*).
import { test, expect } from 'vitest';
import {
  OKCD, ESTADO, BOOT, ENTER, batchPreencher, batchAcionar, batchComandar, batchVkey,
  decodificarEntidades, cabecalhoDoShell, paramDe, passosDoMultipart, sidsDaResposta, lerResposta,
  sidDoAlvo, preencher, campos, botoes, sids, VKEYS, numeroDaTecla,
  atributosDe, controlesDoHtml, controlesDoDelta, popupDaTela, telaDoDelta, lerTela, parametrosDaTela,
  batchFragmento, celulasDoGrid, linhasDoGrid, faltaNaFaixa,
} from './its.mjs';

const SHELL = `<html><head><script>var moin = "FF671392BF705DEF";</script></head><body>
<form ct="FOR" lsdata='{"x":0,"2":{"SID":"wnd[0]","Type":"GuiMainWindow"}}' id="webguiform0" name="webguiform0" action="/sap(cz1TSUQlM2FBTk9OJTNhbmRjLXM0aGFuYV9TNEhfMDAlM2FvWVhuY3hHSFgwQlJBenRGa0hoT3NBWGh3TVFkeTdWTjhMMTNaOXkzLUFUVA==)/bc/gui/sap/its/webgui/" target="_self"></form></body></html>`;

// um delta-update reduzido: aParams + arrSystemParams + o campo MAX_SEL, dois botões, um rótulo e a barra
const DELTA = `<?xml version="1.0" encoding="utf-8" ?>
<updates><delta-update><start-script><![CDATA[sap.its.arrSystemParams = {user:'MVJVELOSO','d-num':'1000',fiori:1,sysid:'S4H',client:'250',dynpro:'/1BCDWB/DBT000','t-code':'SE16',taMode:'internal'};]]></start-script><start-script><![CDATA[sap.its.aParams = {wp:'1',isA9:0,moin:'C7F627FE0F462E80',sound:'smsg',ScreenId:'M0:46',cuastyle:3,cuatitle:'Data Browser: tabela T000: tela de seleção',fiori_vh:'true'};]]></start-script>
<control-update id="cuaarea"><content><![CDATA[<div draggable="false" id="M0:56::btn[3]" ct="B" lsdata='{"x":0,"2":"TRANSPARENT","4":"Voltar","18":"F3","21":true,"22":"BACK","27":{"SID":"wnd[0]/tbar[0]/btn[3]","Type":"GuiButton"}}' title="Voltar"></div>
<div draggable="false" id="M0:50::btn[8]" ct="B" lsdata='{"0":"Executar","2":"EMPHASIZED","4":"Executar","17":"E","18":"F8","21":true,"25":"TOGGLE","27":{"SID":"wnd[0]/tbar[1]/btn[8]","Type":"GuiButton","SubType":"toolbar"}}' title="Executar"></div>]]></content></control-update>
<control-update id="steploop0"><content><![CDATA[<label ct="L" lsdata='{"x":0,"1":"M0:46:::20:34","3":"N&#xba; m&#xe1;ximo","19":{"SID":"wnd[0]/usr/lblMAX_SEL","Type":"GuiLabel","ctmenu":true,"focusable":"X"}}' id="M0:46:::20:2" for="M0:46:::20:34"></label>
<input id="M0:46:::20:34" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","5":"200 ","11":"NUMERIC","21":{"SID":"wnd[0]/usr/txtMAX_SEL","Type":"GuiTextField","value":"200 ","halign":"r","maxlen":11,"focusable":"X"},"22":"pstxt"}' type="text" title="N&#xba;&#x20;m&#xe1;ximo&#x20;de&#x20;entradas&#x20;selecionadas" value="200&#x20;"/>
<input id="M0:46:::2:34" ct="CBS" lsdata='{"21":{"SID":"wnd[0]/usr/ctxtI1-LOW","Type":"GuiCTextField","maxlen":3}}' type="text"/>
<input id="ToolbarOkCode" ct="CBS" lsdata='{"1":"FREETEXT","21":{"SID":"wnd[0]/tbar[0]/okcd","Type":"GuiOKCodeField","display":"X"}}'/>
<div ct="STCS" lsdata='{"10":"MULTI","34":{"id":"C102","SID":"wnd[0]/usr/cntlGRID1/shellcont/shell","Type":"GuiGridView","editable":false,"ColumnIDs":["NAME","USER_VALUE"],"totalRows":1617}}'></div>]]></content></control-update>
<control-update id="msgarea"><content><![CDATA[<div id="wnd[0]/sbar_msg" ct="MB" lsdata='{"0":"Para tabela T000 existe uma visão de atualização","1":"OK","11":{"SID":"wnd[0]/sbar_msg","Type":"MESSAGEBAR","visibility":0,"messageType":"OK","applicationText":"Para tabela T000 existe uma visão de atualização"}}'></div>
<div id="M0:56::btn[3]-x" ct="B" lsdata='{"27":{"SID":"wnd[0]/tbar[0]/btn[3]","Type":"GuiButton"}}'></div>]]></content></control-update></delta-update></updates>`;

const MULTIPART = `\r\n--SAP_RESTGUI_BATCH_STEPFCjUbuLUMUYDA9OXDKzI6A==\r\nX-Order: 1\r\nX-Code: 0\r\nX-Status: OK\r\n\r\n--SAP_RESTGUI_BATCH_STEPFCjUbuLUMUYDA9OXDKzI6A==\r\nX-Order: 2\r\nX-Code: -101\r\nX-Status: failed to fire action: not supported\r\n\r\n--SAP_RESTGUI_BATCH_STEPFCjUbuLUMUYDA9OXDKzI6A==--\r\n`;

test('its: o vocabulário do protocolo é o MEDIDO — focus+value, action/3, okcd+vkey/0, state/ur fechando', () => {
  expect(OKCD).toBe('wnd[0]/tbar[0]/okcd');
  expect(BOOT).toEqual([{ get: 'state/ur' }]);
  expect(ENTER).toEqual({ post: 'vkey/0/ses[0]' });
  expect(batchPreencher('wnd[0]/usr/txtMAX_SEL', 2)).toEqual([
    { post: 'focus/wnd[0]/usr/txtMAX_SEL', logic: 'ignore' },
    { post: 'value/wnd[0]/usr/txtMAX_SEL', content: '2' },
  ]);
  expect(batchAcionar('wnd[0]/tbar[1]/btn[8]')).toEqual([{ post: 'action/3/wnd[0]/tbar[1]/btn[8]' }]);
  // o OK-code: escrever no okcd e disparar o Enter — NÃO action/3 (-101 not supported), NÃO okcode/ses[0] (dispensável)
  expect(batchComandar(' /nSE16 ')).toEqual([{ post: 'value/wnd[0]/tbar[0]/okcd', content: '/nSE16' }, ENTER]);
  expect(batchComandar('ONLI')[0].content).toBe('ONLI');
  expect(() => batchComandar('')).toThrow(/informe o OK-code/);
  expect(batchVkey(0)).toEqual([ENTER]);
  expect(ESTADO).toEqual({ get: 'state/ur' });
});

test('its: a tecla vira vkey/<n>/ses[0] — o mapa MEDIDO por nome e apelido, número cru livre, nome inventado estoura', () => {
  // fila 22, s4h 758/250 04/09/2026: o n do vkey é o MESMO número de tecla de função do SAP GUI
  expect(numeroDaTecla('F8')).toBe(8);
  expect(numeroDaTecla('Shift+F3')).toBe(15);
  expect(numeroDaTecla('shift + f3')).toBe(15);      // caixa e espaço não contam
  expect(numeroDaTecla('Sair')).toBe(15);            // apelido
  expect(numeroDaTecla('Executar')).toBe(8);
  expect(numeroDaTecla('Ctrl+S')).toBe(11);          // o Gravar do SAP GUI é o F11
  expect(numeroDaTecla('Enter')).toBe(0);
  expect(numeroDaTecla(21)).toBe(21);                // número cru: a via de MEDIR o não medido
  expect(numeroDaTecla('7')).toBe(7);
  expect(() => numeroDaTecla('F9')).toThrow(/tecla desconhecida "F9"/);
  expect(VKEYS.F12.n).toBe(12);
  // o sufixo /ses[0] é OBRIGATÓRIO — sem ele o ITS volta -1002 <control-id> is expected
  expect(batchVkey(numeroDaTecla('F8'))).toEqual([{ post: 'vkey/8/ses[0]' }]);
  expect(batchVkey(numeroDaTecla('Enter'))).toEqual([ENTER]);
});

test('its: o shell entrega o action (com o token de sessão) e o moin; a página de logon não tem action', () => {
  const c = cabecalhoDoShell(SHELL);
  expect(c.action).toMatch(/^\/sap\(cz1TSUQ.*\)\/bc\/gui\/sap\/its\/webgui\/$/);
  expect(c.moin).toBe('FF671392BF705DEF');
  expect(cabecalhoDoShell('<title>Logon</title><form id="logonForm" action="/sap/bc/gui/sap/its/webgui">')).toEqual({ action: null, moin: null });
  expect(cabecalhoDoShell(null)).toEqual({ action: null, moin: null });
});

test('its: as entidades dos atributos do ITS viram texto', () => {
  expect(decodificarEntidades('N&#xba;&#x20;m&#xe1;ximo&#x20;de&#x20;entradas')).toBe('Nº máximo de entradas');
  expect(decodificarEntidades('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;')).toBe('a & b <c> "d" \'e\'');
  expect(decodificarEntidades('&naoexiste;')).toBe('&naoexiste;');
});

test('its: os aParams saem por nome — chave nua (cuatitle) e chave com aspas (t-code, d-num)', () => {
  expect(paramDe(DELTA, 'cuatitle')).toBe('Data Browser: tabela T000: tela de seleção');
  expect(paramDe(DELTA, 'ScreenId')).toBe('M0:46');
  expect(paramDe(DELTA, 'dynpro')).toBe('/1BCDWB/DBT000');
  expect(paramDe(DELTA, 't-code')).toBe('SE16');
  expect(paramDe(DELTA, 'd-num')).toBe('1000');
  expect(paramDe(DELTA, 'moin')).toBe('C7F627FE0F462E80');
  expect(paramDe(DELTA, 'naoexiste')).toBe(null);
  // apóstrofo escapado dentro do valor não fecha a string
  expect(paramDe("{cuatitle:'Editor d\\'ABAP',x:1}", 'cuatitle')).toBe("Editor d'ABAP");
});

test('its: lerResposta — delta = pegou; multipart = NÃO pegou e diz por quê; o status HTTP é 200 nos dois', () => {
  const d = lerResposta({ status: 200, tipo: 'text/xml; charset=utf-8', corpo: DELTA });
  expect(d).toMatchObject({ forma: 'delta', pegou: true, tipo: 'text/xml', titulo: 'Data Browser: tabela T000: tela de seleção',
    screenId: 'M0:46', dynpro: '/1BCDWB/DBT000', tcode: 'SE16', dnum: '1000', moin: 'C7F627FE0F462E80', popup: false, motivo: null });
  expect(d.erros).toEqual([]);

  const m = lerResposta({ status: 200, tipo: 'multipart/mixed; boundary=SAP_RESTGUI_BATCH_STEP', corpo: MULTIPART });
  expect(m.forma).toBe('multipart');
  expect(m.pegou).toBe(false);
  expect(m.passos).toEqual([{ ordem: 1, codigo: 0, status: 'OK' }, { ordem: 2, codigo: -101, status: 'failed to fire action: not supported' }]);
  expect(m.erros).toHaveLength(1);
  expect(m.motivo).toBe('-101 failed to fire action: not supported');
  expect(m.titulo).toBe(null);

  // multipart com X-Code 0 em tudo (o `value/okcd` sem disparo): nada mudou, e ele diz isso
  const zero = lerResposta({ status: 200, tipo: 'multipart/mixed', corpo: MULTIPART.split('X-Order: 2')[0] });
  expect(zero).toMatchObject({ forma: 'multipart', pegou: false, motivo: /X-Code 0 em tudo/ });
});

test('its: logoff e sessão morta têm forma própria', () => {
  const l = lerResposta({ status: 200, tipo: 'text/html; charset=utf-8', corpo: '<html><head><title> Efetuar logoff </title></head><body>Adeus</body></html>' });
  expect(l).toMatchObject({ forma: 'logoff', pegou: false, motivo: /encerrada/ });
  const s = lerResposta({ status: 400, tipo: 'text/plain', corpo: '400 Session Timed Out\n\n 2026-09-04 06:53:14' });
  expect(s).toMatchObject({ forma: 'sem-sessao', pegou: false });
  expect(s.motivo).toMatch(/400 Session Timed Out/);
  expect(lerResposta({ status: 500, tipo: 'text/html', corpo: 'x' }).forma).toBe('outra');
  // popup (wnd[1]) vem no MESMO delta-update — medido com /o e /nend
  const comPopup = DELTA.replace('"SID":"wnd[0]/sbar_msg"', '"SID":"wnd[1]"');
  expect(lerResposta({ status: 200, tipo: 'text/xml', corpo: comPopup }).popup).toBe(true);
});

test('its: os SIDs saem do lsdata, com tipo, campo e okcode — e sem repetir o mesmo endereço', () => {
  const lista = sidsDaResposta(DELTA);
  const porSid = Object.fromEntries(lista.map((x) => [x.sid, x]));
  expect(porSid['wnd[0]/usr/txtMAX_SEL']).toMatchObject({ tipo: 'GuiTextField', campo: 'MAX_SEL', okcode: null, value: '200 ', maxlen: 11 });
  expect(porSid['wnd[0]/tbar[1]/btn[8]']).toMatchObject({ tipo: 'GuiButton', okcode: 'btn[8]', SubType: 'toolbar' });
  expect(porSid['wnd[0]/tbar[0]/btn[3]']).toMatchObject({ tipo: 'GuiButton', okcode: 'btn[3]' });
  expect(porSid['wnd[0]/usr/lblMAX_SEL']).toMatchObject({ tipo: 'GuiLabel', campo: 'MAX_SEL', okcode: null });
  expect(porSid['wnd[0]/tbar[0]/okcd'].tipo).toBe('GuiOKCodeField');
  expect(porSid['wnd[0]/usr/cntlGRID1/shellcont/shell']).toMatchObject({ tipo: 'GuiGridView', ColumnIDs: ['NAME', 'USER_VALUE'], totalRows: 1617 });
  expect(porSid['wnd[0]/sbar_msg']).toMatchObject({ tipo: 'MESSAGEBAR', applicationText: 'Para tabela T000 existe uma visão de atualização' });
  // btn[3] aparece duas vezes no bruto — fica uma vez só, e a ordem é a do documento
  expect(lista.filter((x) => x.sid === 'wnd[0]/tbar[0]/btn[3]')).toHaveLength(1);
  expect(lista[0].sid).toBe('wnd[0]/tbar[0]/btn[3]');
  expect(sidsDaResposta('')).toEqual([]);
  expect(sidsDaResposta(MULTIPART)).toEqual([]);
});

test('its: o alvo resolve pelo que a tela TEM — campo, btn[n], número, apelido, SID cru — e estoura com a lista', () => {
  const lista = sidsDaResposta(DELTA);
  expect(sidDoAlvo(lista, 'wnd[0]/usr/txtMAX_SEL')).toBe('wnd[0]/usr/txtMAX_SEL');
  expect(sidDoAlvo(lista, { sid: 'wnd[9]/x' })).toBe('wnd[9]/x');           // SID explícito passa como está
  expect(sidDoAlvo(lista, { campo: 'MAX_SEL' })).toBe('wnd[0]/usr/txtMAX_SEL'); // o campo, não o LABEL do mesmo nome
  expect(sidDoAlvo(lista, 'MAX_SEL')).toBe('wnd[0]/usr/txtMAX_SEL');
  expect(sidDoAlvo(lista, { campo: 'I1-LOW' })).toBe('wnd[0]/usr/ctxtI1-LOW');
  // o botão: a barra (tbar[0] × tbar[1]) NÃO se adivinha — sai da tela
  expect(sidDoAlvo(lista, { okcode: 'btn[8]' })).toBe('wnd[0]/tbar[1]/btn[8]');
  expect(sidDoAlvo(lista, 'btn[8]')).toBe('wnd[0]/tbar[1]/btn[8]');
  expect(sidDoAlvo(lista, 8)).toBe('wnd[0]/tbar[1]/btn[8]');
  expect(sidDoAlvo(lista, 'Executar')).toBe('wnd[0]/tbar[1]/btn[8]');
  expect(sidDoAlvo(lista, 'Voltar')).toBe('wnd[0]/tbar[0]/btn[3]');
  expect(() => sidDoAlvo(lista, { okcode: 'btn[11]' })).toThrow(/botão btn\[11\] não está na tela — tenho btn\[3\]=Voltar, btn\[8\]=Executar/);
  expect(() => sidDoAlvo(lista, { campo: 'NAOEXISTE' })).toThrow(/campo "NAOEXISTE" não está na tela — tenho MAX_SEL, I1-LOW/);
  expect(() => sidDoAlvo(lista, 'Salvar')).toThrow(/campo "Salvar" não está na tela/);
  expect(() => sidDoAlvo(lista, '')).toThrow(/informe o alvo/);
});

test('its: preencher ENFILEIRA (não posta) e resolve o alvo agora; campos/botoes recortam os sids', () => {
  const sessao = { sids: sidsDaResposta(DELTA), fila: [] };
  expect(preencher(sessao, 'MAX_SEL', 2)).toEqual({ sid: 'wnd[0]/usr/txtMAX_SEL', valor: '2', pendentes: 1 });
  expect(preencher(sessao, { campo: 'I1-LOW' }, '001')).toMatchObject({ sid: 'wnd[0]/usr/ctxtI1-LOW', pendentes: 2 });
  expect(sessao.fila).toEqual([
    { post: 'focus/wnd[0]/usr/txtMAX_SEL', logic: 'ignore' }, { post: 'value/wnd[0]/usr/txtMAX_SEL', content: '2' },
    { post: 'focus/wnd[0]/usr/ctxtI1-LOW', logic: 'ignore' }, { post: 'value/wnd[0]/usr/ctxtI1-LOW', content: '001' },
  ]);
  expect(() => preencher(sessao, 'ZZZ', 1)).toThrow(/campo "ZZZ" não está na tela/);
  expect(campos(sessao).map((c) => c.campo)).toEqual(['MAX_SEL', 'I1-LOW']);   // o okcd e o rótulo ficam de fora
  expect(botoes(sessao)).toEqual([
    expect.objectContaining({ okcode: 'btn[3]', nome: 'Voltar' }),
    expect.objectContaining({ okcode: 'btn[8]', nome: 'Executar' }),
  ]);
  expect(sids(sessao)).toBe(sessao.sids);
});


// ---------------------------------------------------------------------------------------------
// A TELA lida do delta-update (fila 21). Cada trecho de HTML abaixo é COPIADO do bruto do s4h
// 758/250 de 04/09/2026 — SE38 por `/nSE38` (POC_webgui_okcode/raw/c4-nse38.txt), a barra de
// mensagens da SE16 (POC_webgui_its_lib/raw/a-boot.xml) e o popup do `/nend` (raw/d3-nend.txt).
// O `lsevents` foi tirado por ser irrelevante à leitura. Cruzado contra o despejo DOM da MESMA
// SE38 em POC_webgui_its_lib/medicoes/lertela-xml-x-dom.md.
// ---------------------------------------------------------------------------------------------

const LABEL_SE38 = `<label ct="L" lsdata='{"x":0,"1":"M0:46:::2:14","3":"Programa","7":"100%","9":false,"12":"P","13":"ENDOFLINE","14":true,"19":{"SID":"wnd[0]/usr/lblRS38M-PROGRAMM","Type":"GuiLabel","focusable":"X"}}' id="M0:46:::2:0" bHasTabStop="false" data-interactionBehavior="REDIRECT_FOCUS" for="M0:46:::2:14" class="lsLabel lsLabel--valign lsControl--endaligned  lsLabel--standalone lsControl--fullwidth lsLabel--designbar-colon"><span id="M0:46:::2:0-text" class="lsLabel__text lsLabel__text--overflow"><span class="urAccessKey" >P</span>rograma</span></label>`;
const CAMPO_SE38 = `<input id="M0:46:::2:14" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","3":"M0:46:::2:14_TALB","7":true,"12":true,"13":"P","14":"SERVER","16":true,"20":false,"21":{"SID":"wnd[0]/usr/ctxtRS38M-PROGRAMM","Type":"GuiCTextField","value":"","maxlen":40,"focusable":"X","showTypeAhead":"true"},"22":"pstxt","29":"M0:46:::2:0"}' type="text" data-sap-ls-accesskey="P" accesskey="P" autocomplete="off" tabindex="0" ti="0" title="Nome&#x20;do&#x20;programa&#x20;ABAP" class="lsField__input" role="textbox" aria-haspopup="true" aria-labelledby="M0&#x3a;46&#x3a;&#x3a;&#x3a;2&#x3a;0" name="InputField"/>`;
const RADIO_SE38 = `<span ct="R_standards" lsdata='{"0":"%RBG0257","1":true,"4":"Texto fonte","5":"Editor","10":"T","13":{"SID":"wnd[0]/usr/radRS38M-FUNC_EDIT","Type":"GuiRadioButton","group":"%RBG0257","focusable":"X"},"15":true}' accessPoint="ROOT" title="Editor" data-sap-ls-accesskey="T" accesskey="T" name="&#x25;RBG0257" id="M0:46:::5:1" class="lsSelector--generic lsSelector--text lsRadioButton lsRadioButton--checked " role="radio" aria-checked="true" aria-disabled="false" aria-label="Texto&#x20;fonte" tabindex="-1" ti="-1"><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="presentation" class="lsRadioButton--svg"><circle id="M0:46:::5:1-button" class="lsRadioButton--svg-button" r="50%"></circle></svg><span id="M0:46:::5:1-txt" class=" lsSelector--ellipsis"><span class="urAccessKey" >T</span>exto fonte</span><span tabindex="0" ti="0" role="none" accessPoint="NAV_HELPER" id="M0:46:::5:1-NAV_HELPER"></span></span>`;
const BTN8_SE38 = `<div draggable="false" id="M0:48::btn[8]" ct="B" lsdata='{"0":"Executar","4":"Executar","17":"E","18":"F8","21":true,"25":"TOGGLE","27":{"SID":"wnd[0]/tbar[1]/btn[8]","Type":"GuiButton","SubType":"toolbar"}}' role="button" title="Executar" data-sap-ls-accesskey="E" accesskey="E" tabindex="0" ti="0" class="lsButton lsButton--base urNoUserSelect urBtnRadius  lsButton--useintoolbar  lsButton--active  lsButton--focusable  lsButton--up lsButton--behaviour-toggle lsButton--design-standard "><span id="M0:48::btn[8]-cnt" class="urNoUserSelect lsButton--content lsControl--centeraligned" role="presentation"><span class="lsButton__text  lsControl--noWrapping" id="M0:48::btn[8]-caption"><span class="urAccessKey" >E</span>xecutar</span></span></div>`;
// o btn[0] da tbar[0]: o texto de leitor de tela " Destacado" vem num span pseudoHidden DENTRO do botão
const BTN0_DESTACADO = `<div draggable="false" id="M0:50::btn[0]" ct="B" lsdata='{"0":"Executar","2":"EMPHASIZED","4":"Executar","17":"E","21":true,"27":{"SID":"wnd[0]/tbar[0]/btn[0]","Type":"GuiButton"}}' role="button" title="Executar" class="lsButton lsButton--base lsButton--design-emphasized"><span id="M0:50::btn[0]-cnt" class="urNoUserSelect lsButton--content lsControl--centeraligned lsButton--content-design" role="presentation"><span class="lsButton__text  lsControl--noWrapping" id="M0:50::btn[0]-caption"><span class="urAccessKey" >E</span>xecutar</span><span class="lsControl--pseudoHidden" id="M0:50::btn[0]-ariadescribedby">&nbsp;Destacado</span></span></div>`;
const BTN3_VOLTAR = `<div draggable="false" id="M0:56::btn[3]" ct="B" lsdata='{"x":0,"2":"TRANSPARENT","4":"Voltar","18":"F3","21":true,"22":"BACK","27":{"SID":"wnd[0]/tbar[0]/btn[3]","Type":"GuiButton"}}' role="button" title="Voltar" class="lsButton"><span id="M0:56::btn[3]-cnt" class="lsButton--content" role="presentation"><span class="lsButton__icon"></span></span></div>`;
const OKCD_HTML = `<input id="ToolbarOkCode" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","3":"ToolbarOkCode_TALB","6":"NONE","13":"o","14":"SERVER","21":{"SID":"wnd[0]/tbar[0]/okcd","Type":"GuiOKCodeField","display":"X"}}' type="text" title="Inserir&#x20;c&#xf3;digo&#x20;de&#x20;transa&#xe7;&#xe3;o" class="lsField__input" role="combobox"/>`;
const MB_SE16 = `<div tabindex="0" ti="0" title="Para&#x20;tabela&#x20;T000&#x20;existe&#x20;uma&#x20;vis&#xe3;o&#x20;de&#x20;atualiza&#xe7;&#xe3;o" class="lsMessageBar lsMessageBar--nowrapping" id="wnd[0]/sbar_msg" ct="MB" lsdata='{"0":"Para tabela T000 existe uma visão de atualização","1":"OK","5":"Para tabela T000 existe uma visão de atualização","6":true,"7":"Exibir detalhes","11":{"SID":"wnd[0]/sbar_msg","Type":"MESSAGEBAR","visibility":0,"messageType":"OK","applicationText":"Para tabela T000 existe uma visão de atualização"},"12":false,"13":true}' role="note" aria-live="assertive"><span class="lsMessageBar__text">Para tabela T000 existe uma visão de atualização</span></div>`;
// o menu vem embrulhado num <xmp class="lsControl--invisible"> — não é tela
const MENU_INVISIVEL = `<span class="urNoUserSelect lsMnu-root-initstyles" id="mnu0_531-r"><xmp class="lsControl--invisible"><div id="mnu0_531-container" class="urMnu"><table border="0" id="mnu0_531" ct="POMN" lsdata='{"x":0,"5":{"SID":"wnd[0]/mbar","Type":"GuiMenu","ModalNo":0}}' class="lsMnuTable" role="menu"><tbody><tr ct="POMNI" lsdata='{"x":0,"1":"Programa","6":true,"7":"mnu0_513","18":{"SID":"wnd[0]/mbar/menu[0]","Type":"GuiMenu"},"19":"Programa"}' id="wnd[0]/mbar/menu[0]" title="Programa" role="menuitem"><td class="urMnuTxt"><span>Programa</span></td></tr></tbody></table></div></xmp></span>`;
const POPUP_NEND = `<div ct="PW_standards" lsdata='{"0":false,"1":false,"4":"553px","5":"176px","8":"webguiKeys","13":{"SID":"wnd[1]","Type":"GuiModalWindow","ModalNo":1},"16":true}' id="SAPLSPO1100_1" role="dialog" aria-labelledby="SAPLSPO1100_1-header-title-txt" class="lsPWNew lsPopupWindow--message"><header class="lsPWNewHeader" id="SAPLSPO1100_1-header"><div id="SAPLSPO1100_1-header-title" tabindex="0" ti="0" class="lsPWNewHeaderDivMiddle" drag="move" role="heading" aria-level="1"><span id="SAPLSPO1100_1-header-title-txt" class="lsResponsivePaddingLeft " drag="move">Efetuar logoff</span></div></header><div id="M1:46" ct="RL" lsdata='{"0":4.00,"2":1.25,"4":{"SID":"wnd[1]/usr","Type":"GuiUserArea"}}' bNoPosRefContainer="X" role="presentation" class="lsRasterLayout"><span ct="L" lsdata='{"x":0,"3":"Os dados não gravados serão perdidos.","6":"LIGHT","7":"100%","13":"BEGINOFLINE","14":true,"16":"ACTIVATE","19":{"SID":"wnd[1]/usr/txtSPOP-TEXTLINE1","Type":"GuiLabel","focusable":"X"}}' id="M1:46:::0:6" bHasTabStop="true" tabindex="0" ti="0" role="button" class="lsLabel lsLabel--text"><span id="M1:46:::0:6-text" class="lsLabel__text">Os dados não gravados serão perdidos.</span></span><span ct="L" lsdata='{"0":"Pergunta","6":"LIGHT","7":"100%","8":true,"13":"BEGINOFLINE","16":"ACTIVATE","19":{"SID":"wnd[1]/usr/lbl%_AUTOTEXT001","Type":"GuiLabel","focusable":"X"}}' id="M1:46:::1:0" title="Pergunta" role="button" class="lsLabel lsLabel--onlyimage"><span class="lsLabel__icon"></span></span><span ct="L" lsdata='{"x":0,"3":"Efetuar o logoff?","6":"LIGHT","7":"100%","13":"BEGINOFLINE","14":true,"16":"ACTIVATE","19":{"SID":"wnd[1]/usr/txtSPOP-TEXTLINE2","Type":"GuiLabel","focusable":"X"}}' id="M1:46:::1:6" role="button" class="lsLabel lsLabel--text"><span id="M1:46:::1:6-text" class="lsLabel__text">Efetuar o logoff?</span></span><div draggable="false" id="M1:46:::3:6" ct="B" lsdata='{"0":"Sim","3":"100%","4":"Sim","17":"S","20":true,"21":true,"27":{"SID":"wnd[1]/usr/btnSPOP-OPTION1","Type":"GuiButton"}}' role="button" title="Sim" data-sap-ls-accesskey="S" accesskey="S" tabindex="0" ti="0" class="lsButton lsButton--design-standard "><span id="M1:46:::3:6-cnt" class="lsButton--content" role="presentation"><span class="lsButton__text" id="M1:46:::3:6-caption"><span class="urAccessKey" >S</span>im</span></span></div><div draggable="false" id="M1:46:::3:18" ct="B" lsdata='{"0":"Não","3":"100%","4":"Não","17":"N","20":true,"21":true,"27":{"SID":"wnd[1]/usr/btnSPOP-OPTION2","Type":"GuiButton"}}' role="button" title="N&#xe3;o" data-sap-ls-accesskey="N" accesskey="N" tabindex="0" ti="0" class="lsButton lsButton--design-standard "><span id="M1:46:::3:18-cnt" class="lsButton--content" role="presentation"><span class="lsButton__text" id="M1:46:::3:18-caption"><span class="urAccessKey" >N</span>ão</span></span></div></div></div>`;

const cdata = (id, html) => `<control-update id="${id}"><content><![CDATA[${html}]]></content></control-update>`;
const DELTA_SE38 = `<?xml version="1.0" encoding="utf-8" ?>
<updates><delta-update><start-script><![CDATA[sap.its.arrSystemParams = {user:'MVJVELOSO','d-num':'0100',sysid:'S4H',client:'250',dynpro:'SAPLWBABAP','t-code':'SE38'};]]></start-script><start-script><![CDATA[sap.its.aParams = {wp:'1',moin:'2E7D0A4A2ABF2B0F',ScreenId:'M0:46',cuatitle:'Editor ABAP: 1ª tela'};]]></start-script>
${cdata('backpackCUA', `<div id="backpackCUA" ct="CO">${MENU_INVISIVEL}</div>`)}
${cdata('cuaarea', `<div id="cuaarea" ct="CO">${OKCD_HTML}${BTN3_VOLTAR}${BTN0_DESTACADO}${BTN8_SE38}</div>`)}
${cdata('steploop0', `<div id="steploop0" ct="PLP"><div ct="RLI" lsdata='{"0":16,"1":112}' id="u1CFF4">${LABEL_SE38}</div><div ct="RLI" lsdata='{"0":16,"1":112}' id="u1CFF5">${CAMPO_SE38}</div><div ct="RLI" lsdata='{"0":8}' id="u1CFEF">${RADIO_SE38}</div></div>`)}
${cdata('msgarea', `<div id="msgarea" ct="CO"><div id="wnd[0]/sbar_msg" ct="MB" lsdata='{"x":0,"1":"TEXT","3":"NONE","11":{"SID":"wnd[0]/sbar_msg","Type":"MESSAGEBAR","visibility":2,"messageType":"","applicationText":""},"12":false,"13":true}' class="lsMessageBar lsControl--hidden"></div></div>`)}
</delta-update></updates>`;
const DELTA_POPUP = `<updates><delta-update><start-script><![CDATA[sap.its.arrSystemParams = {'d-num':'1000',dynpro:'SAPLSMTR_NAVIGATION','t-code':'SMEN'};]]></start-script><start-script><![CDATA[sap.its.aParams = {moin:'A',cuatitle:'SAP Easy Access'};]]></start-script>
${cdata('webguiPopups', `<div id="webguiPopups" ct="CO">${POPUP_NEND}</div>`)}
${cdata('steploop0', `<div id="steploop0" ct="PLP" class="lsPagelayout__panel lsPagelayout__panel--end"></div>`)}
${cdata('cuaarea', `<div id="cuaarea" ct="CO">${OKCD_HTML}${BTN3_VOLTAR}</div>`)}
</delta-update></updates>`;

test('its: os atributos saem da tag como estão — aspas duplas, simples (o lsdata) e booleanos', () => {
  expect(atributosDe(` id="a:b" lsdata='{"x":"y"}' disabled title="N&#xba;"`)).toEqual({ id: 'a:b', lsdata: '{"x":"y"}', disabled: '', title: 'N&#xba;' });
  expect(atributosDe(' draggable="false" ct=B')).toEqual({ draggable: 'false', ct: 'B' });
  expect(atributosDe('')).toEqual({});
});

test('its: controlesDoHtml despeja o MESMO formato do JS_DESPEJO_CONTROLES — e o texto é o innerText, sem quebrar na letra de atalho', () => {
  const [rotulo] = controlesDoHtml(LABEL_SE38);
  expect(rotulo).toEqual({
    id: 'M0:46:::2:0', ct: 'L', lsdata: expect.objectContaining({ 1: 'M0:46:::2:14', 3: 'Programa' }),
    title: null, aria: null, accesskey: null, valor: null, desabilitado: false, somenteLeitura: false,
    texto: 'Programa',     // <span class="urAccessKey">P</span>rograma — inline cola; "P\nrograma" seria o bug
    visivel: true,
  });
  const [campo] = controlesDoHtml(CAMPO_SE38);
  expect(campo).toMatchObject({ id: 'M0:46:::2:14', ct: 'CBS', title: 'Nome do programa ABAP', valor: '', accesskey: 'P', texto: null });
  expect(campo.lsdata['21']).toMatchObject({ SID: 'wnd[0]/usr/ctxtRS38M-PROGRAMM', Type: 'GuiCTextField', maxlen: 40 });
  // radio: a marcação vem do aria-checked do markup; o svg e o NAV_HELPER não somam texto
  const [radio] = controlesDoHtml(RADIO_SE38);
  expect(radio).toMatchObject({ id: 'M0:46:::5:1', ct: 'R_standards', aria: 'true', title: 'Editor', accesskey: 'T', texto: 'Texto fonte' });
  // botão: "Executar" — a dica de leitor de tela " Destacado" (pseudoHidden) fica de fora do texto
  expect(controlesDoHtml(BTN8_SE38)[0]).toMatchObject({ id: 'M0:48::btn[8]', texto: 'Executar', title: 'Executar', accesskey: 'E' });
  expect(controlesDoHtml(BTN0_DESTACADO)[0]).toMatchObject({ id: 'M0:50::btn[0]', texto: 'Executar' });
  expect(controlesDoHtml(BTN3_VOLTAR)[0]).toMatchObject({ id: 'M0:56::btn[3]', texto: null, title: 'Voltar' });
  // valor com entidade, e input sem value = '' (como el.value no DOM)
  expect(controlesDoHtml(`<input ct="CBS" id="x" value="200&#x20;"/>`)[0].valor).toBe('200 ');
  expect(controlesDoHtml(`<input ct="CBS" id="x"/>`)[0].valor).toBe('');
  expect(controlesDoHtml(`<input ct="CBS" id="x" disabled readonly/>`)[0]).toMatchObject({ desabilitado: true, somenteLeitura: true });
});

test('its: o que está marcado invisível no markup (xmp do menu, lsControl--hidden, display:none) sai visivel: false — e o texto dele não vaza', () => {
  const menu = controlesDoHtml(MENU_INVISIVEL);
  expect(menu.map((c) => [c.ct, c.visivel])).toEqual([['POMN', false], ['POMNI', false]]);
  expect(menu[1].texto).toBe(null);   // "Programa" do menu invisível não é texto de tela
  expect(controlesDoHtml(`<div ct="MB" id="m" class="lsMessageBar lsControl--hidden"><span>x</span></div>`)[0]).toMatchObject({ visivel: false, texto: null });
  expect(controlesDoHtml(`<div data-sap-ls-style="display:none"><div ct="B" id="b">Oculto</div></div><div ct="B" id="c">Visto</div>`).map((c) => [c.id, c.visivel, c.texto]))
    .toEqual([['b', false, null], ['c', true, 'Visto']]);
  // bloco quebra linha (é como o innerText do checkbox chega: ":\\nExibir…"); inline não
  expect(controlesDoHtml(`<span ct="C_standards" id="k"><div>:</div><span>Exibir <b>também</b></span></span>`)[0].texto).toBe(':\nExibir também');
  // script/style e comentário não são texto
  expect(controlesDoHtml(`<div ct="L" id="l"><!-- c --><script>var x = "<b>";</script>Só isto</div>`)[0].texto).toBe('Só isto');
  expect(controlesDoHtml('')).toEqual([]);
  expect(controlesDoHtml(null)).toEqual([]);
});

test('its: controlesDoDelta varre só os CDATA dos control-update, na ordem do documento', () => {
  const lista = controlesDoDelta(DELTA_SE38);
  expect(lista.map((c) => c.id)).toEqual([
    'backpackCUA', 'mnu0_531', 'wnd[0]/mbar/menu[0]',
    'cuaarea', 'ToolbarOkCode', 'M0:56::btn[3]', 'M0:50::btn[0]', 'M0:48::btn[8]',
    'steploop0', 'u1CFF4', 'M0:46:::2:0', 'u1CFF5', 'M0:46:::2:14', 'u1CFEF', 'M0:46:::5:1',
    'msgarea', 'wnd[0]/sbar_msg',
  ]);
  expect(controlesDoDelta(MULTIPART)).toEqual([]);
  expect(controlesDoDelta('')).toEqual([]);
});

test('its: telaDoDelta é o MESMO modelo do lerTela do navegador — rótulo costurado pelo label, dica do data element, radio pelo aria, botões com tecla', () => {
  const tela = telaDoDelta(DELTA_SE38);
  expect(tela).toMatchObject({ titulo: 'Editor ABAP: 1ª tela', screenId: 'M0:46', dynpro: 'SAPLWBABAP', tcode: 'SE38', dnum: '0100', popup: null, aviso: null });
  expect(tela.campos).toHaveLength(1);
  expect(tela.campos[0]).toMatchObject({ sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM', campo: 'RS38M-PROGRAMM', rotulo: 'Programa',
    dica: 'Nome do programa ABAP', valor: '', maxlen: 40, editavel: true, visivel: true });
  expect(tela.radios).toEqual([expect.objectContaining({ campo: 'RS38M-FUNC_EDIT', grupo: '%RBG0257', rotulo: 'Texto fonte', selecionado: true })]);
  expect(tela.botoes.map((b) => [b.okcode, b.rotulo, b.tecla])).toEqual([['btn[3]', 'Voltar', 'F3'], ['btn[0]', 'Executar', null], ['btn[8]', 'Executar', 'F8']]);
  expect(tela.rotulos.map((r) => r.texto)).toEqual(['Programa']);
  expect(tela.okcode.sid).toBe('wnd[0]/tbar[0]/okcd');
  expect(tela.mensagem).toBe(null);
  expect(tela.statusbar).toEqual([]);
  expect(tela.checkboxes).toEqual([]);
  expect(tela.grids).toEqual([]);
  // a wnd[0] (GuiMainWindow) mora no SHELL do GET, não no delta: sem popup, `janela` é null por esta via
  expect(tela.janela).toBe(null);
  // multipart/logoff não têm tela
  expect(telaDoDelta(MULTIPART)).toBe(null);
  expect(telaDoDelta('')).toBe(null);
});

test('its: a barra de mensagens sai com a constante do tipo e o texto (o mesmo DELTA do lerResposta)', () => {
  const tela = telaDoDelta(DELTA);
  expect(tela.mensagem).toEqual({ tipo: 'OK', texto: 'Para tabela T000 existe uma visão de atualização' });
  expect(tela.statusbar).toEqual(['Para tabela T000 existe uma visão de atualização']);
  // o DELTA reduzido tem o <label> VAZIO (o texto só está no lsdata): o rótulo é o innerText do label, como no
  // DOM — por isso null aqui; a costura de verdade está no DELTA_SE38 ("Programa")
  expect(tela.campos.map((c) => [c.campo, c.rotulo, c.valor])).toEqual([['MAX_SEL', null, '200 '], ['I1-LOW', null, '']]);
  expect(tela.grids).toEqual([expect.objectContaining({ sid: 'wnd[0]/usr/cntlGRID1/shellcont/shell', colunas: ['NAME', 'USER_VALUE'], linhas: 1617 })]);
  expect(telaDoDelta(`<updates><delta-update>${cdata('msgarea', MB_SE16)}</delta-update></updates>`).mensagem)
    .toEqual({ tipo: 'OK', texto: 'Para tabela T000 existe uma visão de atualização' });
});

test('its: com POPUP aberto o delta traz a wnd[1] e ESVAZIA a wnd[0]/usr — o modelo diz isso, e os botões do popup são por SID', () => {
  const tela = telaDoDelta(DELTA_POPUP);
  expect(tela.janela).toMatchObject({ sid: 'wnd[1]', principal: false });
  expect(tela.campos).toEqual([]);
  expect(tela.aviso).toMatch(/popup wnd\[1\] aberto — a wnd\[0\]\/usr não vem/);
  expect(tela.popup).toEqual({
    sid: 'wnd[1]', id: 'SAPLSPO1100_1', titulo: 'Efetuar logoff',
    textos: [
      { sid: 'wnd[1]/usr/txtSPOP-TEXTLINE1', texto: 'Os dados não gravados serão perdidos.' },
      { sid: 'wnd[1]/usr/lbl%_AUTOTEXT001', texto: 'Pergunta' },   // só ícone: o texto é o title
      { sid: 'wnd[1]/usr/txtSPOP-TEXTLINE2', texto: 'Efetuar o logoff?' },
    ],
    botoes: [
      { sid: 'wnd[1]/usr/btnSPOP-OPTION1', rotulo: 'Sim', tecla: null, accesskey: 'S' },
      { sid: 'wnd[1]/usr/btnSPOP-OPTION2', rotulo: 'Não', tecla: null, accesskey: 'N' },
    ],
    campos: [],
  });
  // ⚠ Sim/Não NÃO são btn[n]: não entram em tela.botoes, e acionar(s, 'Sim') não os acha — é { sid }
  expect(tela.botoes.map((b) => b.okcode)).toEqual(['btn[3]']);
  const sidsDaTela = sidsDaResposta(DELTA_POPUP);
  expect(() => sidDoAlvo(sidsDaTela, { campo: 'SPOP-OPTION1' })).toThrow(/não está na tela/);
  expect(sidDoAlvo(sidsDaTela, { sid: tela.popup.botoes[0].sid })).toBe('wnd[1]/usr/btnSPOP-OPTION1');
  expect(popupDaTela(controlesDoDelta(DELTA_SE38))).toBe(null);
  expect(popupDaTela([])).toBe(null);
});

test('its: lerTela lê o ÚLTIMO delta da sessão (multipart não o substitui) e parametrosDaTela responde o ~transaction', () => {
  expect(() => lerTela({ delta: null })).toThrow(/sem delta para ler/);
  const sessao = { delta: DELTA_SE38, sids: sidsDaResposta(DELTA_SE38), fila: [] };
  expect(lerTela(sessao).campos[0].campo).toBe('RS38M-PROGRAMM');
  expect(parametrosDaTela(sessao)).toEqual([{ id: 'M0:46:::2:14', title: 'Nome do programa ABAP', sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM', campo: 'RS38M-PROGRAMM', rotulo: 'Programa' }]);
  // o okcd não é parâmetro de dynpro — fica de fora
  expect(parametrosDaTela(sessao).some((p) => p.sid.includes('okcd'))).toBe(false);
});

// ---- o ALV: o fragmento de linhas e a matriz (item 25) ----
// Trecho COPIADO da resposta do s4h 758/250 em 04/09/2026 ao POST
// `action/710/wnd[0]/usr/cntlGRID1/shellcont/shell` com `position=0&fragments=0,2;` na lista do
// RSPARAM (sap-accelerate/work/POC_webgui_grid/medicoes/raw/g-amostra-3-linhas.xml). Estão aqui a
// linha 1 inteira (5 colunas), a coluna de seleção que a precede, o `<span>` wrapper `#if-r` (que
// não tem `lsdata` e não pode virar célula) e duas colunas da linha 2. Os `lsevents` de cada
// célula, idênticos em todas, foram cortados; o `lsdata` está como veio.
const FRAGMENTO = `<?xml version="1.0" encoding="utf-8" ?>
<updates><delta-update><control-update id="C102" updateMethod="PARTIAL"><content><![CDATA[<table role="presentation" iFirstVisibleContentRowIndex="0" iContentRowCount="1617" iVisibleContentRowCount="25"><tbody iRowIndexOffset="0" iRowsFragmentLength="26" hpm="none">
<tr iIdx="0" rr="1" id="C102-mrss-cont-none-Row-0" sst="0" rt="1">
<td id="grid#C102#1,0" subct="SC" lsdata='{"x":0,"7":{"SID":"wnd[0]/usr/cntlGRID1/shellcont/shell/rowcol/row[1]/","Type":"SAPTABLECSSELECTIONCELL"}}' role="presentation" lsMatrixRowIndex="1" lsMatrixColIndex="0"></td>
<td id="grid#C102#1,1" subct="STC" lsdata='{"x":0,"1":true,"7":{"SID":"wnd[0]/usr/cntlGRID1/shellcont/shell/rowcol/row[1]/cell[0]","Type":"GuiGridViewCell"}}' role="gridcell" lsMatrixRowIndex="1" lsMatrixColIndex="1"><span id="grid#C102#1,1#if-r" class="lsField lsField--table"><span role="textbox" readonly id="grid#C102#1,1#if" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","3":"x_TALB","5":"Autostart","7":true,"14":"SERVER","17":false,"20":false,"21":{"value":"Autostart","maxlen":10,"focusable":"X"},"25":"FILL_FIXED_LAYOUT"}' name="InputField" maxlength="10" class="lsField__input">Autostart</span></span></td>
<td id="grid#C102#1,2" subct="STC" role="gridcell" lsMatrixRowIndex="1" lsMatrixColIndex="2"><span role="textbox" readonly id="grid#C102#1,2#if" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","3":"x_TALB","7":true,"14":"SERVER","17":false,"20":false,"21":{"value":"","maxlen":10,"focusable":"X"},"25":"FILL_FIXED_LAYOUT"}' name="InputField" maxlength="10" class="lsField__input"></span></td>
<td id="grid#C102#1,3" subct="STC" role="gridcell" lsMatrixRowIndex="1" lsMatrixColIndex="3"><span role="textbox" readonly id="grid#C102#1,3#if" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","5":"0","21":{"value":"0","maxlen":10,"focusable":"X"}}' name="InputField" maxlength="10" class="lsField__input">0</span></td>
<td id="grid#C102#1,4" subct="STC" role="gridcell" lsMatrixRowIndex="1" lsMatrixColIndex="4"><span role="textbox" readonly id="grid#C102#1,4#if" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","5":"0","21":{"value":"0","maxlen":10,"focusable":"X"}}' name="InputField" maxlength="10" class="lsField__input">0</span></td>
<td id="grid#C102#1,5" subct="STC" role="gridcell" lsMatrixRowIndex="1" lsMatrixColIndex="5"><span role="textbox" readonly id="grid#C102#1,5#if" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","5":"Automatic instance start on start service startup","21":{"value":"Automatic instance start on start service startup","maxlen":80,"focusable":"X"}}' name="InputField" maxlength="80" class="lsField__input">Automatic instance start on start service startup</span></td></tr>
<tr iIdx="1" rr="2" id="C102-mrss-cont-none-Row-1" sst="0" rt="1">
<td id="grid#C102#2,1" subct="STC" role="gridcell" lsMatrixRowIndex="2" lsMatrixColIndex="1"><span role="textbox" readonly id="grid#C102#2,1#if" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","5":"CPU_CORES","21":{"value":"CPU_CORES","maxlen":10,"focusable":"X"}}' name="InputField" maxlength="10" class="lsField__input">CPU_CORES</span></td>
<td id="grid#C102#2,5" subct="STC" role="gridcell" lsMatrixRowIndex="2" lsMatrixColIndex="5"><span role="textbox" readonly id="grid#C102#2,5#if" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","5":"N&#xba; de cores","21":{"value":"N&#xba; de cores","maxlen":80,"focusable":"X"}}' name="InputField" maxlength="80" class="lsField__input">N&#xba; de cores</span></td></tr></tbody></table>]]></content></control-update></delta-update></updates>`;

const COLUNAS = ['NAME', 'USER_VALUE', 'DEFAULT_VALUE', 'DEFAULT_USUBS_VALUE', 'DESCR'];

test('its: batchFragmento é o RequestData do renderer — 710 + state/ur, com position obrigatório', () => {
  const SID = 'wnd[0]/usr/cntlGRID1/shellcont/shell';
  expect(batchFragmento(SID, 0, 29)).toEqual([
    { post: `action/710/${SID}`, content: 'position=0&fragments=0,29;' },
    { get: `state/ur/${SID}` },
  ]);
  // a faixa é 0-based aqui e volta 1-based nas células: pedir 0,29 traz as linhas 1..30
  expect(batchFragmento(SID, 1580, 1616)[0].content).toBe('position=1580&fragments=1580,1616;');
});

test('its: celulasDoGrid indexa pela linha ABSOLUTA e deixa de fora a coluna de seleção e o wrapper', () => {
  const c = celulasDoGrid(FRAGMENTO, 'C102');
  expect([...c.keys()]).toEqual([1, 2]);
  expect(c.get(1)).toEqual({ 1: 'Autostart', 2: '', 3: '0', 4: '0', 5: 'Automatic instance start on start service startup' });
  // a coluna 0 é a de seleção da linha (`SAPTABLECSSELECTIONCELL`): não é dado
  expect(c.get(1)[0]).toBeUndefined();
  // o `#if-r` é só o wrapper do campo — não tem lsdata e não pode virar célula
  expect(Object.keys(c.get(2))).toEqual(['1', '5']);
  // entidade do atributo decodificada, como no resto da via
  expect(c.get(2)[5]).toBe('Nº de cores');
  // grid que não está na resposta devolve matriz vazia — não estoura
  expect(celulasDoGrid(FRAGMENTO, 'C999').size).toBe(0);
  expect(celulasDoGrid(null, 'C102').size).toBe(0);
});

test('its: linhasDoGrid casa as células com os ColumnIDs; coluna sem célula sai vazia', () => {
  const linhas = linhasDoGrid(celulasDoGrid(FRAGMENTO, 'C102'), COLUNAS);
  expect(linhas[0]).toEqual({ _linha: 1, NAME: 'Autostart', USER_VALUE: '', DEFAULT_VALUE: '0',
    DEFAULT_USUBS_VALUE: '0', DESCR: 'Automatic instance start on start service startup' });
  expect(linhas[1]).toEqual({ _linha: 2, NAME: 'CPU_CORES', USER_VALUE: '', DEFAULT_VALUE: '',
    DEFAULT_USUBS_VALUE: '', DESCR: 'Nº de cores' });
  // sem ColumnIDs sobra o índice absoluto — a linha continua endereçável
  expect(linhasDoGrid(celulasDoGrid(FRAGMENTO, 'C102'), [])).toEqual([{ _linha: 1 }, { _linha: 2 }]);
});

test('its: faltaNaFaixa aponta a próxima linha a pedir, e null quando a faixa está inteira', () => {
  const c = celulasDoGrid(FRAGMENTO, 'C102');
  expect(faltaNaFaixa(c, 1, 2)).toBe(null);
  expect(faltaNaFaixa(c, 1, 5)).toBe(3);
  expect(faltaNaFaixa(c, 10, 12)).toBe(10);
  expect(faltaNaFaixa(new Map(), 1, 1)).toBe(1);
});

test('its: delta PARCIAL (o fragmento do ALV) não é a tela — lerResposta o marca', () => {
  // o corpo do `action/710` não traz `sap.its.aParams`: sem a marca, `postar` o tomaria pela tela e
  // zeraria `sids`/`titulo`/`grids` para o resto da sessão (medido no s4h em 04/09/2026)
  const r = lerResposta({ status: 200, tipo: 'text/xml', corpo: FRAGMENTO });
  expect(r.forma).toBe('delta');
  expect(r.parcial).toBe(true);
  expect(r.titulo).toBe(null);
  // a tela inteira traz os aParams — e não é parcial
  expect(lerResposta({ status: 200, tipo: 'text/xml', corpo: DELTA }).parcial).toBe(false);
  expect(lerResposta({ status: 400, tipo: 'text/html', corpo: 'Session Timed Out' }).parcial).toBe(false);
});
