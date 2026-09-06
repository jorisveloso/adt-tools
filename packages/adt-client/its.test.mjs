// its.test.mjs — a parte PURA da via HTTP do WebGUI: o shell, a leitura da resposta (delta ×
// multipart × logoff × 400), os SIDs tirados do lsdata, a resolução de alvo e os batches. Nada aqui
// toca a rede; o E2E é a POC do item 20 (sap-accelerate/work/POC_webgui_its_lib).
// Todo trecho bruto é COPIADO das respostas do s4h 758/250 de 04/09/2026
// (sap-accelerate/work/POC_webgui_okcode/medicoes/raw/*).
import { test, expect } from 'vitest';
import { sidDoLsdata } from './webgui.mjs';
import {
  OKCD, ESTADO, BOOT, ENTER, batchPreencher, batchAcionar, batchComandar, batchVkey,
  decodificarEntidades, cabecalhoDoShell, paramDe, passosDoMultipart, sidsDaResposta, lerResposta,
  sidDoAlvo, preencher, campos, botoes, sids, VKEYS, numeroDaTecla, janelaAtiva, janelaDoSid, ativa,
  atributosDe, controlesDoHtml, controlesDoDelta, popupDaTela, popupDaSessao, popupsDaTela, telaDoDelta, lerTela, parametrosDaTela,
  batchFragmento, celulasDoGrid, linhasDoGrid, faltaNaFaixa, botaoDeOrdenacao, batchOrdenar, indiceDaColuna,
  itsdocDoDelta, pedidoDoItsdoc, atenderItsdoc, MULTIPART_IMPORT, tetoDoImport, OK_ITSDOC, FORMATOS, exportAsDoPopup,
  verboDoItsdoc, filtroDoItsdoc, corpoDaListaDeArquivos, corpoDoClipboard, TEMP_NFS,
  itensDeMenuDoDelta, itensDeMenu, acharCaminhoDeMenu, navegarMenu,
  indiceDoNo, arvoreDosBrutos, arvore, expansaoDoHtml, expandirNo, colapsarNo, batchExpandirNo, batchColapsarNo, batchAcionarNo, acharNoDaArvore,
  navegarArvore, agregarMudou,
  sidDoControle, controleDoSid, eventosDoControle, batchDoEvento, eventosDoAlvo,
  mensagemDosSids, carimboDosSids, carimboDoDelta, mudouDaTela,
  opcoesDaLista, combosDoDelta, comboDoSid, chaveDaOpcao, opcoes,
  criarPilhaDeDesfazer, transacional, fechar, prefixoDaRecusa,
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

test('its: o OK-code LEVA os valores pendentes — um POST só com value do campo, value do okcd e Enter (item 31)', () => {
  // Medido no s4h 758/250 em 04/09/2026 (POC_webgui_okcode_valores, fase H): este batch exato, na
  // tela de seleção da SE16 sobre a T000, devolveu "1 acertos" em 113 ms — filtro aplicado E fcode
  // executado. Sem o `value` do campo o mesmo OK-code traz a tabela inteira ("5 acertos").
  // `comandar` ANTES recusava fila pendente; hoje ela vai junto (é o `despachar` que a concatena).
  const batch = [...batchPreencher('wnd[0]/usr/txtI1-LOW', 'Neduca'), ...batchComandar('ONLI'), ESTADO];
  expect(batch).toEqual([
    { post: 'focus/wnd[0]/usr/txtI1-LOW', logic: 'ignore' },
    { post: 'value/wnd[0]/usr/txtI1-LOW', content: 'Neduca' },
    { post: 'value/wnd[0]/tbar[0]/okcd', content: 'ONLI' },
    ENTER,
    ESTADO,
  ]);
  // o okcd é campo como outro qualquer: quem submete é o Enter, e ele carrega a dynpro inteira
  expect(batch.filter((c) => String(c.post).startsWith('value/'))).toHaveLength(2);
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
    screenId: 'M0:46', dynpro: '/1BCDWB/DBT000', tcode: 'SE16', dnum: '1000', moin: 'C7F627FE0F462E80', temPopup: false, motivo: null });
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
  expect(lerResposta({ status: 200, tipo: 'text/xml', corpo: comPopup }).temPopup).toBe(true);
  // ⚠ o farejador é do CORPO, não da tela: o multipart não declara SID nenhum, e mesmo com a modal
  // aberta ele volta `false` (item 83, passo 3). Quem quer a TELA lê `popupDaSessao`/`lerTela`.
  expect(lerResposta({ status: 200, tipo: 'multipart/mixed', corpo: '--x\nX-Code: -101\n' }).temPopup).toBe(false);
  // e o nome antigo (`popup`, colidindo com o OBJETO do lerTela) não volta pela porta dos fundos
  expect(lerResposta({ status: 200, tipo: 'text/xml', corpo: comPopup }).popup).toBeUndefined();
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
    lsevents: null,       // este rótulo não publica evento — e o fixture está sem o atributo
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

// ---------------------------------------------------------------------------------------------
// O `lsevents` — o mapa de DISPARO (fila 44). Os dois trechos abaixo são COPIADOS INTEIROS do bruto
// do s4h 758/250 (POC_webgui_its_lib/medicoes/raw/a-boot.xml), COM o atributo que os fixtures acima
// tiveram cortado: o `lsdata` diz o que o controle é, o `lsevents` diz que comando do protocolo o
// aciona. Medido nos 4 raws daquela POC: 334 de 1532 controles publicam `lsevents`, e a contagem
// bate 1:1 com o `grep` do atributo no bruto (119/119, 48/48, 119/119, 48/48).
// ---------------------------------------------------------------------------------------------

const BTN3_COM_EVENTOS = `<div draggable="false" id="M0:56::btn[3]" ct="B" lsdata='{"x":0,"2":"TRANSPARENT","4":"Voltar","18":"F3","21":true,"22":"BACK","27":{"SID":"wnd[0]/tbar[0]/btn[3]","Type":"GuiButton"}}' lsevents='{"Press":[{},{"1":"action/3","2":true,"3":true}]}' role="button" title="Voltar" tabindex="0" ti="0" class="lsButton lsButton--base urNoUserSelect urBtnRadius  lsButton--active  lsButton--focusable  lsButton--up lsButton--type lsButton--typeBack lsButton--design-transparent ">`;
const OKCD_COM_EVENTOS = `<input id="ToolbarOkCode" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","3":"ToolbarOkCode_TALB","6":"NONE","13":"o","14":"SERVER","21":{"SID":"wnd[0]/tbar[0]/okcd","Type":"GuiOKCodeField","display":"X"}}' lsevents='{"Enter":[{},{"1":"vkey/0/ses[0]","2":true}],"Change":[{},{"1":"okcode/ses[0]"}],"Select":[{},{"1":"value","3":true}],"DeleteItem":[{},{"3":true}],"ListAccess":[{},{"3":true,"8":"typeahead"}],"FieldHelpPress":[{},{"1":"value","3":true}],"ActionItemActivate":[{},{"1":"vkey/0/ses[0]","2":true}]}' type="text" data-sap-ls-accesskey="o" accesskey="o" autocomplete="off" maxlength="200" tabindex="0" ti="0" title="Inserir&#x20;c&#xf3;digo&#x20;de&#x20;transa&#xe7;&#xe3;o" class="lsField__input" role="combobox" aria-haspopup="true" aria-controls="ToolbarOkCode_TALB" aria-expanded="false"/>`;

test('its: controlesDoHtml expõe o lsevents — o COMANDO que cada evento dispara, no índice 1', () => {
  const [btn] = controlesDoHtml(BTN3_COM_EVENTOS);
  // a forma é sempre `{ <Evento>: [ <opções de transporte>, <parâmetros> ] }`, e o índice 1 é o comando
  expect(btn.lsevents).toEqual({ Press: [{}, { 1: 'action/3', 2: true, 3: true }] });
  expect(sidDoLsdata(btn.lsdata).SID).toBe('wnd[0]/tbar[0]/btn[3]');   // o ONDE segue vindo do lsdata

  const [okcd] = controlesDoHtml(OKCD_COM_EVENTOS);
  // é daqui que saiu o disparo do OK-code: quem submete é o vkey/0/ses[0], não um action
  expect(okcd.lsevents.Enter).toEqual([{}, { 1: 'vkey/0/ses[0]', 2: true }]);
  expect(okcd.lsevents.Change).toEqual([{}, { 1: 'okcode/ses[0]' }]);
  expect(Object.keys(okcd.lsevents)).toEqual(
    ['Enter', 'Change', 'Select', 'DeleteItem', 'ListAccess', 'FieldHelpPress', 'ActionItemActivate']);

  // o JSON do lsevents tem aspas DUPLAS dentro de aspas simples: o scanner de tag não pode cortar no
  // primeiro `>`, e o atributo tem de sobreviver ao CDATA do delta-update
  const brutos = controlesDoDelta(cdata('cuaarea', `<div id="cuaarea" ct="CO">${BTN3_COM_EVENTOS}${OKCD_COM_EVENTOS}</div>`));
  expect(brutos.map((b) => b.lsevents?.Press?.[1]?.['1'] ?? b.lsevents?.Enter?.[1]?.['1'] ?? null))
    .toEqual([null, 'action/3', 'vkey/0/ses[0]']);   // o CO não publica evento; o botão e o okcd sim
});

// lsevents ilegível não derruba a leitura — é o mesmo tratamento do lsdata
test('its: lsevents ausente ou quebrado vira null, e o resto do controle continua lido', () => {
  expect(controlesDoHtml(`<div ct="B" lsevents='{quebrado'>x</div>`)[0]).toMatchObject({ ct: 'B', lsevents: null, texto: 'x' });
  expect(controlesDoHtml(`<div ct="B">x</div>`)[0].lsevents).toBeNull();
});

// ---------------------------------------------------------------------------------------------
// A COMPOSIÇÃO do disparo declarado (fila 71) — `lsevents` + evento → passos do batch.
// Mais quatro trechos COPIADOS INTEIROS do bruto, escolhidos porque cada um quebra a regra ingênua
// "comando + / + SID" de um jeito diferente: a barra de mensagens traz comando JÁ ENDEREÇADO a
// OUTRO SID, o menu-raiz traz JScript em vez de comando, o campo da SE38 traz `vkey/4` sem sufixo,
// e o `sysInfoAreaToggle` não traz SID nenhum.
//   `wnd[0]/sbar_msg` e `mnu0_*` — POC_webgui_its_lib/medicoes/raw/a-boot.xml
//   `M0:46:::2:14` e `M0:46:::5:1` — POC_webgui_okcode/medicoes/raw/c4-nse38.txt (a SE38)
// ---------------------------------------------------------------------------------------------

const MB_COM_EVENTOS = `<div tabindex="0" ti="0" title="Para&#x20;tabela&#x20;T000&#x20;existe&#x20;uma&#x20;vis&#xe3;o&#x20;de&#x20;atualiza&#xe7;&#xe3;o" class="lsMessageBar lsMessageBar--nowrapping lsMessageBar--width-default lsMessageBar--ruleBottom lsMessageBar--transparent" id="wnd[0]/sbar_msg" ct="MB" lsdata='{"0":"Para tabela T000 existe uma visão de atualização","1":"OK","5":"Para tabela T000 existe uma visão de atualização","6":true,"7":"Exibir detalhes","11":{"SID":"wnd[0]/sbar_msg","Type":"MESSAGEBAR","visibility":0,"messageType":"OK","applicationText":"Para tabela T000 existe uma visão de atualização"},"12":false,"13":true}' lsevents='{"ActivateHelp":[{},{"1":"action/1/wnd[0]/sbar","2":true}]}' aria-label="Com&#x20;&#xea;xito&#x20;Barra&#x20;de&#x20;mensagens" role="note" aria-live="assertive">`;
const POMN_RAIZ = `<table border="0" cellpadding="0" cellspacing="0" id="mnu0_531" ct="POMN" lsdata='{"x":0,"5":{"SID":"wnd[0]/mbar","Type":"GuiMenu","ModalNo":0}}' lsevents='{"Select":[{},{"JScript":"sap.g4h.doWguMenuSelect(oCfg);"}]}' class="lsMnuTable" role="menu" data-sap-ls-style=";width:100%">`;
const POMN_MENU0 = `<table border="0" cellpadding="0" cellspacing="0" id="mnu0_513" ct="POMN" lsdata='{"x":0,"5":{"SID":"wnd[0]/mbar/menu[0]","Type":"GuiMenu","ModalNo":0}}' lsevents='{"Select":[{},{"1":"action/4","2":true}]}' class="lsMnuTable" role="menu" data-sap-ls-style=";width:100%">`;
const POMNI_MENU0 = `<tr ct="POMNI" lsdata='{"x":0,"1":"Programa","6":true,"7":"mnu0_513","18":{"SID":"wnd[0]/mbar/menu[0]","Type":"GuiMenu"},"19":"Programa"}' id="wnd[0]/mbar/menu[0]" title="Programa" role="menuitem"><td class="urMnuTxt"><span>Programa</span></td></tr>`;
const CAMPO_SE38_COM_EVENTOS = `<input id="M0:46:::2:14" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","3":"M0:46:::2:14_TALB","7":true,"12":true,"13":"P","14":"SERVER","16":true,"20":false,"21":{"SID":"wnd[0]/usr/ctxtRS38M-PROGRAMM","Type":"GuiCTextField","value":"","maxlen":40,"focusable":"X","showTypeAhead":"true"},"22":"pstxt","29":"M0:46:::2:0"}' lsevents='{"Change":[{},{"1":"value","3":true,"7":true}],"Select":[{},{"1":"value","3":true,"7":true}],"Validate":[{},{}],"DeleteItem":[{},{"3":true}],"ListAccess":[{"ResponseData":"delta","TransportMethod":"full","EnqueueCardinality":"none"},{"3":true,"8":"typeahead","maxlen":0,"parentid":"USRAREA"}],"FieldHelpPress":[{},{"1":"vkey/4","2":true,"5":true}],"ActionItemActivate":[{},{"1":"vkey/0/ses[0]","2":true}],"ClipboardTablePaste":[{},{"0":"GuiTextField","1":"action/25","2":true,"3":true}]}' type="text" data-sap-ls-accesskey="P" accesskey="P" tabindex="0" ti="0" title="Nome&#x20;do&#x20;programa&#x20;ABAP" class="lsField__input" role="textbox" name="InputField"/>`;
const RADIO_SE38_COM_EVENTOS = `<span ct="R_standards" lsdata='{"0":"%RBG0257","1":true,"4":"Texto fonte","5":"Editor","10":"T","13":{"SID":"wnd[0]/usr/radRS38M-FUNC_EDIT","Type":"GuiRadioButton","group":"%RBG0257","focusable":"X"},"15":true}' lsevents='{"Enter":[{},{"1":"vkey/0/ses[0]","2":true}],"Change":[{},{"1":"action/4","3":true,"7":true}]}' accessPoint="ROOT" title="Editor" name="&#x25;RBG0257" id="M0:46:::5:1" class="lsRadioButton lsRadioButton--checked " role="radio" aria-checked="true"></span>`;
const SYSINFO_TOGGLE = `<div draggable="false" id="sysInfoAreaToggle" ct="B" lsdata='{"x":0,"2":"TRANSPARENT","4":"Abrir informações do sistema","9":true,"11":"/sap/public/icmandir/its/ls/theming/Base/baseLib/sap_fiori_3/svg/libs/SAPGUI-icons.svg#s_b_colr"}' lsevents='{"Press":[{},{"0":"GuiToggle","link":"sysInfoArea","invers":true}]}' role="button" title="Abrir&#x20;informa&#xe7;&#xf5;es&#x20;do&#x20;sistema" tabindex="0" ti="0" class="lsButton lsButton--onlyImage">`;

const um = (html) => controlesDoHtml(html)[0];

test('its: o SID do controle mora ANINHADO no lsdata — índice por tipo, um só, e o id NÃO serve (item 71)', () => {
  // medido nos 5 raws: 387 de 392 controles com lsevents trazem UM par { SID, Type }; nenhum traz dois
  expect(sidDoControle(um(BTN3_COM_EVENTOS))).toBe('wnd[0]/tbar[0]/btn[3]');    // ct=B  → índice 27
  expect(sidDoControle(um(OKCD_COM_EVENTOS))).toBe('wnd[0]/tbar[0]/okcd');      // ct=CBS → índice 21
  expect(sidDoControle(um(POMN_MENU0))).toBe('wnd[0]/mbar/menu[0]');            // ct=POMN → índice 5
  expect(sidDoControle(um(MB_COM_EVENTOS))).toBe('wnd[0]/sbar_msg');            // ct=MB  → índice 11
  expect(sidDoControle(um(RADIO_SE38_COM_EVENTOS))).toBe('wnd[0]/usr/radRS38M-FUNC_EDIT');  // R_standards → 13
  // o id do markup não é o SID — dos 392, só 1 coincidia (justamente a barra de mensagens)
  expect(um(BTN3_COM_EVENTOS).id).toBe('M0:56::btn[3]');
  expect(um(MB_COM_EVENTOS).id).toBe('wnd[0]/sbar_msg');
  // e o único sem SID dos 5 raws é o toggle de UI — que também não publica comando de POST
  expect(sidDoControle(um(SYSINFO_TOGGLE))).toBeNull();
  expect(eventosDoControle(um(SYSINFO_TOGGLE))).toEqual([]);
});

test('its: SID repetido existe (POMNI × POMN do menu), e quem responde é o que declara o disparo (item 71)', () => {
  const brutos = controlesDoDelta(cdata('backpackCUA', `${POMNI_MENU0}${POMN_MENU0}`));
  expect(brutos.map((b) => `${b.ct}:${sidDoControle(b)}`))
    .toEqual(['POMNI:wnd[0]/mbar/menu[0]', 'POMN:wnd[0]/mbar/menu[0]']);   // o MESMO SID nos dois
  expect(controleDoSid(brutos, 'wnd[0]/mbar/menu[0]').ct).toBe('POMN');    // e o POMNI não publica nada
  expect(controleDoSid(brutos, 'wnd[0]/mbar/menu[9]')).toBeNull();
});

test('its: batchDoEvento compõe por FAMÍLIA — action leva SID, value leva focus+content, vkey sem sufixo vai à SESSÃO (itens 22, 24, 71)', () => {
  // action/<n> + SID do controle — o mesmo batch que `batchAcionar` produz, agora vindo da TELA
  expect(batchDoEvento(um(BTN3_COM_EVENTOS), 'Press')).toEqual([{ post: 'action/3/wnd[0]/tbar[0]/btn[3]' }]);
  expect(batchDoEvento(um(BTN3_COM_EVENTOS), 'Press')).toEqual(batchAcionar('wnd[0]/tbar[0]/btn[3]'));
  // o menu: `action/4/<SID do submenu>` — exatamente o POST que o item 49 mediu (SE38 → SA38)
  expect(batchDoEvento(um(POMN_MENU0), 'Select')).toEqual([{ post: 'action/4/wnd[0]/mbar/menu[0]' }]);
  // o radio: `action/4` também, mas com o SID do radio
  expect(batchDoEvento(um(RADIO_SE38_COM_EVENTOS), 'Change')).toEqual([{ post: 'action/4/wnd[0]/usr/radRS38M-FUNC_EDIT' }]);

  // value: focus + value + content — o MESMO batch do `batchPreencher` (item 7)
  expect(batchDoEvento(um(CAMPO_SE38_COM_EVENTOS), 'Change', { valor: 'RSPARAM' }))
    .toEqual(batchPreencher('wnd[0]/usr/ctxtRS38M-PROGRAMM', 'RSPARAM'));

  // ⚠ o ponto onde a derivação ingênua QUEBRA: `vkey/4` NÃO vira `vkey/4/<SID>` (item 22: `-1002
  // <control-id> is expected`) — o alvo do teclado é a sessão, e o campo entra pelo focus anterior
  expect(batchDoEvento(um(CAMPO_SE38_COM_EVENTOS), 'FieldHelpPress')).toEqual([
    { post: 'focus/wnd[0]/usr/ctxtRS38M-PROGRAMM', logic: 'ignore' },
    { post: 'vkey/4/ses[0]' },
  ]);
  // já auto-endereçado à sessão: posta como está, SEM focus e SEM SID
  expect(batchDoEvento(um(CAMPO_SE38_COM_EVENTOS), 'ActionItemActivate')).toEqual([{ post: 'vkey/0/ses[0]' }]);
  expect(batchDoEvento(um(OKCD_COM_EVENTOS), 'Enter')).toEqual([ENTER]);
  // okcode/ses[0]: já endereçado E leva conteúdo
  expect(batchDoEvento(um(OKCD_COM_EVENTOS), 'Change', { valor: '/nSE38' })).toEqual([{ post: 'okcode/ses[0]', content: '/nSE38' }]);

  // ⚠ o achado do item 44: comando que já vem endereçado ao SID de OUTRO controle — `wnd[0]/sbar`,
  // não o `wnd[0]/sbar_msg` do próprio elemento. Concatenar aqui daria `action/1/wnd[0]/sbar/wnd[0]/sbar_msg`
  expect(batchDoEvento(um(MB_COM_EVENTOS), 'ActivateHelp')).toEqual([{ post: 'action/1/wnd[0]/sbar' }]);

  // content cru (o `type=node&node_key=…` da árvore) e SID sobreposto passam adiante
  expect(batchDoEvento(um(BTN3_COM_EVENTOS), 'Press', { content: 'x=1', sid: 'wnd[1]/usr/btnX' }))
    .toEqual([{ post: 'action/3/wnd[1]/usr/btnX', content: 'x=1' }]);
});

test('its: batchDoEvento recusa o que NÃO posta — e a recusa diz o que a tela declara (item 71)', () => {
  const campo = um(CAMPO_SE38_COM_EVENTOS);
  // evento que o controle não declara: a mensagem lista os declarados E os que postam
  expect(() => batchDoEvento(campo, 'DoubleClick')).toThrow(/não declara o evento "DoubleClick"/);
  expect(() => batchDoEvento(campo, 'DoubleClick')).toThrow(/postam: Change \(value\)/);
  // evento declarado que o renderer trata sozinho — sem índice 1
  expect(() => batchDoEvento(campo, 'Validate')).toThrow(/não posta nada.*índice 1/s);
  expect(() => batchDoEvento(campo, 'ListAccess')).toThrow(/não posta nada/);
  // o menu-raiz publica JScript, não comando de protocolo
  expect(() => batchDoEvento(um(POMN_RAIZ), 'Select')).toThrow(/JScript: sap\.g4h\.doWguMenuSelect/);
  // value sem valor: recusa AQUI, em vez de postar content vazio
  expect(() => batchDoEvento(campo, 'Change')).toThrow(/leva conteúdo — informe o valor/);
  // controle sem lsevents nenhum, e evento vazio
  expect(() => batchDoEvento(um(POMNI_MENU0), 'Select')).toThrow(/não declara lsevents/);
  expect(() => batchDoEvento(campo, '')).toThrow(/informe o evento/);
  // o toggle: publica Press, mas o parâmetro não tem comando — e não tem SID para concatenar
  expect(() => batchDoEvento(um(SYSINFO_TOGGLE), 'Press')).toThrow(/não posta nada/);
});

test('its: eventosDoControle é o cardápio POSTÁVEL — fora o que o renderer trata sozinho (item 71)', () => {
  expect(eventosDoControle(um(CAMPO_SE38_COM_EVENTOS))).toEqual([
    { evento: 'Change', comando: 'value' },
    { evento: 'Select', comando: 'value' },
    { evento: 'FieldHelpPress', comando: 'vkey/4' },
    { evento: 'ActionItemActivate', comando: 'vkey/0/ses[0]' },
    { evento: 'ClipboardTablePaste', comando: 'action/25' },
  ]);   // Validate, DeleteItem e ListAccess ficam de fora — declarados, sem comando
  expect(eventosDoControle(um(POMN_RAIZ))).toEqual([]);            // só JScript
  expect(eventosDoControle(um(BTN3_COM_EVENTOS))).toEqual([{ evento: 'Press', comando: 'action/3' }]);
  expect(eventosDoControle(null)).toEqual([]);
});

test('its: acionar({ evento }) resolve o alvo, acha o controle no delta e compõe dali (item 71)', () => {
  // sem rede: a sessão é só `{ sids, delta }`, e o que se checa é o batch que o despachar receberia
  const delta = `<updates><delta-update>${cdata('cuaarea', `<div id="cuaarea" ct="CO">${BTN3_COM_EVENTOS}${OKCD_COM_EVENTOS}</div>`)}`
    + `${cdata('steploop0', `<div id="steploop0" ct="PLP">${CAMPO_SE38_COM_EVENTOS}</div>`)}</delta-update></updates>`;
  const sessao = { sids: sidsDaResposta(delta), delta };
  expect(eventosDoAlvo(sessao, { campo: 'RS38M-PROGRAMM' })).toEqual({
    sid: 'wnd[0]/usr/ctxtRS38M-PROGRAMM',
    eventos: eventosDoControle(um(CAMPO_SE38_COM_EVENTOS)),
  });
  expect(eventosDoAlvo(sessao, 'btn[3]').sid).toBe('wnd[0]/tbar[0]/btn[3]');
  // SID que a tela tem mas nenhum controle carrega, e sessão sem delta: erro que diz o que falta
  expect(() => eventosDoAlvo({ sids: sessao.sids, delta: cdata('x', '<div ct="CO"></div>') }, 'btn[3]'))
    .toThrow(/nenhum controle da tela carrega o SID wnd\[0\]\/tbar\[0\]\/btn\[3\]/);
  expect(() => eventosDoAlvo({ sids: sessao.sids, delta: null }, 'btn[3]')).toThrow(/sem delta para ler o disparo/);
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

test('its: com POPUP aberto o delta traz a wnd[1] — o modelo diz isso, e os botões do popup são por SID', () => {
  const tela = telaDoDelta(DELTA_POPUP);
  expect(tela.janela).toMatchObject({ sid: 'wnd[1]', principal: false });
  // ⚠ este delta é o do SMEN: `campos` vazio é do MENU (não tem dynpro), não do popup — ver o teste
  // do item 98 abaixo, em que a MESMA modal convive com o campo da SE38
  expect(tela.campos).toEqual([]);
  expect(tela.aviso).toBe('popup wnd[1] aberto — campos e botoes são a wnd[0] ATRÁS do modal;'
    + ' o conteúdo da modal está em popup');
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
    atras: [],                                                      // modal sozinha: nada embaixo
  });
  // ⚠ Sim/Não NÃO são btn[n]: entram em tela.botoes como PUSHBUTTON DA DYNPRO (`wnd[n]/usr/…`, sem
  // okcode — o filtro do item 81), e por isso `acionar(s, 'Sim')` não os acha: o endereço é { sid }
  expect(tela.botoes.map((b) => [b.sid, b.okcode])).toEqual([
    ['wnd[1]/usr/btnSPOP-OPTION1', null],
    ['wnd[1]/usr/btnSPOP-OPTION2', null],
    ['wnd[0]/tbar[0]/btn[3]', 'btn[3]'],
  ]);
  const sidsDaTela = sidsDaResposta(DELTA_POPUP);
  expect(() => sidDoAlvo(sidsDaTela, { campo: 'SPOP-OPTION1' })).toThrow(/não está na tela/);
  expect(sidDoAlvo(sidsDaTela, { sid: tela.popup.botoes[0].sid })).toBe('wnd[1]/usr/btnSPOP-OPTION1');
  expect(popupDaTela(controlesDoDelta(DELTA_SE38))).toBe(null);
  expect(popupDaTela([])).toBe(null);
});

// Item 98 (06/09/2026): a MESMA modal do `/nend`, mas sobre a SE38 — a estrutura de blocos do
// `POC_webgui_popup/medicoes/raw/f0-nend.txt`, com o `steploop0` casca vazia (é assim nos 12 brutos
// varridos, com e sem popup) e a dynpro no `userpanel`.
const DELTA_POPUP_SE38 = `<updates><delta-update><start-script><![CDATA[sap.its.arrSystemParams = {'d-num':'0100',dynpro:'SAPLWBABAP','t-code':'SE38'};]]></start-script><start-script><![CDATA[sap.its.aParams = {moin:'A',ScreenId:'M0:46',cuatitle:'Editor ABAP: 1ª tela'};]]></start-script>
${cdata('webguiPopups', `<div id="webguiPopups" ct="CO">${POPUP_NEND}</div>`)}
${cdata('steploop0', `<div id="steploop0" ct="PLP" class="lsPagelayout__panel lsPagelayout__panel--end"></div>`)}
${cdata('cuaarea', `<div id="cuaarea" ct="CO">${OKCD_HTML}${BTN3_VOLTAR}${BTN8_SE38}</div>`)}
${cdata('userpanel', `<div id="userpanel" ct="PLP"><div id="M0:46" ct="RL" lsdata='{"0":4.00,"4":{"SID":"wnd[0]/usr","Type":"GuiUserArea"}}'>${LABEL_SE38}${CAMPO_SE38}${RADIO_SE38}</div></div>`)}
</delta-update></updates>`;

test('its: o POPUP não tira a wnd[0]/usr do delta — a tela de trás continua legível, e o steploop0 é casca vazia dos dois lados (item 98)', () => {
  const semPopup = telaDoDelta(DELTA_SE38);
  const comPopup = telaDoDelta(DELTA_POPUP_SE38);

  // a MESMA tela, com e sem a modal na frente: os campos da wnd[0] são os mesmos
  expect(comPopup.popup).toMatchObject({ sid: 'wnd[1]', titulo: 'Efetuar logoff' });
  expect(comPopup.campos).toEqual(semPopup.campos);
  expect(comPopup.campos.map((c) => c.sid)).toEqual(['wnd[0]/usr/ctxtRS38M-PROGRAMM']);
  expect(comPopup.radios.map((r) => r.campo)).toEqual(['RS38M-FUNC_EDIT']);
  expect(comPopup.tcode).toBe('SE38');

  // e o `steploop0` NÃO é o que muda: ele é a mesma casca vazia nos dois — a dynpro mora no `userpanel`
  const casca = /<control-update id="steploop0"><content><!\[CDATA\[<div id="steploop0" ct="PLP"[^>]*><\/div>\]\]>/;
  expect(DELTA_POPUP_SE38).toMatch(casca);
  expect(DELTA_SE38).not.toMatch(casca);              // o fixture antigo põe os campos NO steploop0…
  const usr = (d) => sidsDaResposta(d).filter((x) => x.sid.startsWith('wnd[0]/usr/')).length;
  expect(usr(DELTA_POPUP_SE38)).toBe(usr(DELTA_SE38)); // …e o total de SIDs da wnd[0]/usr é o mesmo

  // o aviso é de ENDEREÇAMENTO: campos/botoes são a de trás, o conteúdo da modal está em `popup`
  expect(comPopup.aviso).toBe('popup wnd[1] aberto — campos e botoes são a wnd[0] ATRÁS do modal;'
    + ' o conteúdo da modal está em popup');
  expect(semPopup.aviso).toBe(null);

  // o SMEN é o contraexemplo do item 21: 0 campos SEM popup nenhum — o menu não tem dynpro
  expect(telaDoDelta(DELTA_ARVORE).popup).toBe(null);
  expect(telaDoDelta(DELTA_ARVORE).campos).toEqual([]);
});

test('its: popupDaSessao lê a TELA (não o corpo) e só paga o parse quando os SIDs já dizem que há modal', () => {
  const comModal = { sids: sidsDaResposta(DELTA_POPUP), delta: DELTA_POPUP };
  expect(popupDaSessao(comModal)).toMatchObject({ sid: 'wnd[1]', titulo: 'Efetuar logoff' });

  // sem modal declarada, `janelaAtiva` é wnd[0] e o delta nem é parseado — a resposta é null
  expect(popupDaSessao({ sids: sidsDaResposta(DELTA_SE38), delta: DELTA_SE38 })).toBe(null);
  expect(popupDaSessao({ sids: [], delta: '' })).toBe(null);
  expect(popupDaSessao(undefined)).toBe(null);

  // ⚠ o caso do item 83, passo 3: o POST voltou `multipart` e o `postar` NÃO troca `sids`/`delta`.
  // O farejador do corpo diria "sem popup"; a TELA continua com a modal na frente, e é ela que vale.
  expect(lerResposta({ status: 200, tipo: 'multipart/mixed', corpo: '--x\nX-Code: -101\n' }).temPopup).toBe(false);
  expect(popupDaSessao(comModal)?.sid).toBe('wnd[1]');
});

// ---- a JANELA do alvo (item 42) ----------------------------------------------------------
// Trechos COPIADOS da resposta do s4h 758/250 ao `/o` em 04/09/2026
// (POC_webgui_okcode/medicoes/raw/d2-o.txt), com o `lsevents`, o `<svg>` do ícone e o `style` do
// header tirados: a modal `wnd[1]` ("Sessões ABAP") e a barra DELA. No bruto o `/o` traz 17
// botões — 13 da `wnd[0]`, que CONTINUA no delta atrás do modal, e 4 da `wnd[1]` — e `btn[0]`
// existe nas duas (`wnd[1]/tbar[0]/btn[0]` e `wnd[0]/tbar[0]/btn[0]`). A ordem dos blocos é a do
// bruto: `webguiPopups` ANTES do `cuaarea`.
const MODAL_O = `<div ct="PW_standards" lsdata='{"0":false,"4":"663px","5":"208px","8":"webguiKeys","13":{"SID":"wnd[1]","Type":"GuiModalWindow","ModalNo":1,"focusable":"X"},"16":true}' id="RSM04000_ALV_NEW2000_1" role="dialog" aria-labelledby="RSM04000_ALV_NEW2000_1-header-title-txt" class="lsPWNew lsPWNewMaxWidthAutoX lsPWNewMaxWidthAutoY"><header class="lsPWNewHeader" id="RSM04000_ALV_NEW2000_1-header"><div id="RSM04000_ALV_NEW2000_1-header-title" tabindex="0" ti="0" class="lsPWNewHeaderDivMiddle" drag="move" role="heading" aria-level="1"><span id="RSM04000_ALV_NEW2000_1-header-title-txt" class="lsResponsivePaddingLeft " drag="move">Sessões ABAP</span></div></header></div>`;
const BTN0_WND1 = `<div draggable="false" id="M1:50::btn[0]" ct="B" lsdata='{"x":0,"2":"TRANSPARENT","4":"Avançar","9":true,"18":"ENTER","21":true,"25":"TOGGLE","27":{"SID":"wnd[1]/tbar[0]/btn[0]","Type":"GuiButton","SubType":"toolbar"}}' role="button" title="Avan&#xe7;ar" aria-label="Avan&#xe7;ar" tabindex="0" ti="0" class="lsButton lsButton--base lsButton--onlyImage lsButton--useintoolbar lsButton--design-transparent "></div>`;
const BTN12_WND1 = `<div draggable="false" id="M1:54::btn[12]" ct="B" lsdata='{"x":0,"2":"TRANSPARENT","4":"Cancelar","9":true,"18":"ESCAPE","21":true,"25":"TOGGLE","27":{"SID":"wnd[1]/tbar[0]/btn[12]","Type":"GuiButton","SubType":"toolbar"}}' role="button" title="Cancelar" aria-label="Cancelar" tabindex="0" ti="0" class="lsButton lsButton--base lsButton--onlyImage lsButton--useintoolbar lsButton--design-transparent "></div>`;
const DELTA_DUAS_BARRAS = `<updates><delta-update><start-script><![CDATA[sap.its.aParams = {moin:'A',cuatitle:'Editor ABAP: 1ª tela'};]]></start-script>
${cdata('webguiPopups', `<div id="webguiPopups" ct="CO">${MODAL_O}${BTN0_WND1}${BTN12_WND1}</div>`)}
${cdata('steploop0', `<div id="steploop0" ct="PLP"></div>`)}
${cdata('cuaarea', `<div id="cuaarea" ct="CO">${OKCD_HTML}${BTN3_VOLTAR}${BTN0_DESTACADO}${BTN8_SE38}</div>`)}
</delta-update></updates>`;

test('its: a janela ativa é a modal MAIS ALTA que o delta declara — sem modal, a wnd[0]', () => {
  expect(janelaAtiva(sidsDaResposta(DELTA_SE38))).toBe('wnd[0]');   // nenhuma janela se declara no delta
  expect(janelaAtiva(sidsDaResposta(DELTA_DUAS_BARRAS))).toBe('wnd[1]');
  expect(janelaAtiva([])).toBe('wnd[0]');
  // duas modais EMPILHADAS: medido em d2-ose16.txt (`/o` e, sobre ele, o popup da SE16) — vence a de cima
  expect(janelaAtiva([{ sid: 'wnd[1]', tipo: 'GuiModalWindow' }, { sid: 'wnd[2]', tipo: 'GuiModalWindow' }])).toBe('wnd[2]');
  expect(janelaAtiva([{ sid: 'wnd[2]', tipo: 'GuiModalWindow' }, { sid: 'wnd[1]', tipo: 'GuiModalWindow' }])).toBe('wnd[2]');
  expect(janelaDoSid('wnd[1]/tbar[0]/btn[0]')).toBe('wnd[1]');
  expect(janelaDoSid('grid#C102#1,1')).toBe(null);
});

// ---- DUAS modais EMPILHADAS (item 70) --------------------------------------------------------
// Trechos COPIADOS da resposta do s4h 758/250 em 05/09/2026 ao `/o` e, com ele aberto, ao `/ose16`
// (POC_webgui_okcode/medicoes/raw/d2-ose16.txt): sobre a "Sessões ABAP" (`wnd[1]`, a MODAL_O acima)
// o SAP abriu a "Informação — Nº máximo de janelas GUI atingido" (`wnd[2]`). Tirados daqui o
// `lsevents`, o `<svg>` do ícone, o `<style>` e o botão de fechar do header. ⚠ A ordem é a do
// bruto: a `wnd[1]` vem ANTES da `wnd[2]` no markup — e era ela que o `popupDaTela` devolvia.
const MODAL_OSE16 = `<div ct="PW_standards" lsdata='{"0":false,"4":"673px","5":"144px","8":"webguiKeys","13":{"SID":"wnd[2]","Type":"GuiModalWindow","ModalNo":2,"focusable":"X"},"16":true}' id="SAPMSDYP10_2" role="dialog" aria-labelledby="SAPMSDYP10_2-header-title-txt" class="lsPWNew lsPWNewMaxWidthAutoX lsPWNewMaxWidthAutoY"><header class="lsPWNewHeader" id="SAPMSDYP10_2-header"><div id="SAPMSDYP10_2-header-title" tabindex="0" ti="0" class="lsPWNewHeaderDivMiddle" drag="move" role="heading" aria-level="1"><span id="SAPMSDYP10_2-header-title-txt" class="lsResponsivePaddingLeft " drag="move">Informação</span></div></header></div>`;
const LBL_IK1_WND2 = `<span ct="L" lsdata='{"0":"Mensagem informativa","6":"LIGHT","7":"100%","8":true,"13":"BEGINOFLINE","16":"ACTIVATE","19":{"SID":"wnd[2]/usr/txtIK1","Type":"GuiLabel","focusable":"X"}}' id="M2:46:::0:0" title="Mensagem&#x20;informativa" tabindex="0" ti="0" role="button" class="lsLabel lsLabel--text"></span>`;
const LBL_MESSTXT1_WND2 = `<span ct="L" lsdata='{"x":0,"3":"Número máximo de janelas GUI atingido","6":"LIGHT","7":"100%","13":"BEGINOFLINE","14":true,"16":"ACTIVATE","19":{"SID":"wnd[2]/usr/txtMESSTXT1","Type":"GuiLabel","focusable":"X"}}' id="M2:46:::0:5" tabindex="0" ti="0" role="button" class="lsLabel lsLabel--text"><span id="M2:46:::0:5-text" class="lsLabel__text">Número máximo de janelas GUI atingido</span></span>`;
const BTN0_WND2 = `<div draggable="false" id="M2:50::btn[0]" ct="B" lsdata='{"0":"Avançar","2":"TRANSPARENT","4":"Avançar","17":"A","18":"ENTER","21":true,"25":"TOGGLE","27":{"SID":"wnd[2]/tbar[0]/btn[0]","Type":"GuiButton","SubType":"toolbar"}}' role="button" title="Avan&#xe7;ar" data-sap-ls-accesskey="A" accesskey="A" tabindex="0" ti="0" class="lsButton lsButton--useintoolbar"></div>`;
const BTN1_WND2 = `<div draggable="false" id="M2:50::btn[1]" ct="B" lsdata='{"0":"Ajuda","2":"TRANSPARENT","4":"Ajuda","17":"A","18":"F1","21":true,"25":"TOGGLE","27":{"SID":"wnd[2]/tbar[0]/btn[1]","Type":"GuiButton","SubType":"toolbar"}}' role="button" title="Ajuda" data-sap-ls-accesskey="A" accesskey="A" tabindex="0" ti="0" class="lsButton lsButton--useintoolbar"></div>`;
const DELTA_DUAS_MODAIS = `<updates><delta-update><start-script><![CDATA[sap.its.aParams = {moin:'A',cuatitle:'Sessões ABAP'};]]></start-script>
${cdata('webguiPopups', `<div id="webguiPopups" ct="CO">${MODAL_O}${BTN0_WND1}${BTN12_WND1}${MODAL_OSE16}${LBL_IK1_WND2}${LBL_MESSTXT1_WND2}${BTN0_WND2}${BTN1_WND2}</div>`)}
</delta-update></updates>`;

test('its: com DUAS modais empilhadas o popup é a de CIMA — a de baixo fica na pilha, não no lugar dela', () => {
  const brutos = controlesDoDelta(DELTA_DUAS_MODAIS);
  const pilha = popupsDaTela(brutos);
  expect(pilha.map((p) => [p.sid, p.titulo])).toEqual([['wnd[1]', 'Sessões ABAP'], ['wnd[2]', 'Informação']]);

  const popup = popupDaTela(brutos);
  expect(popup.sid).toBe('wnd[2]');                                  // ⚠ era wnd[1] (a 1ª do markup)
  expect(popup.atras).toEqual(['wnd[1]']);
  expect(popup.botoes.map((b) => [b.sid, b.rotulo])).toEqual([
    ['wnd[2]/tbar[0]/btn[0]', 'Avançar'],
    ['wnd[2]/tbar[0]/btn[1]', 'Ajuda'],
  ]);
  expect(popup.textos.map((t) => t.texto)).toEqual(['Mensagem informativa', 'Número máximo de janelas GUI atingido']);
  // a de baixo continua legível — mas por popupsDaTela, e sabendo que não é ela que responde
  expect(pilha[0].atras).toEqual([]);
  expect(pilha[0].botoes.map((b) => b.rotulo)).toEqual(['Avançar', 'Cancelar']);

  const tela = telaDoDelta(DELTA_DUAS_MODAIS);
  expect(tela.popup.sid).toBe('wnd[2]');
  expect(tela.aviso).toBe('popup wnd[2] aberto (sobre wnd[1] — é a de cima que responde)'
    + ' — campos e botoes são a wnd[0] ATRÁS do modal; o conteúdo da modal está em popup');
  expect(janelaAtiva(sidsDaResposta(DELTA_DUAS_MODAIS))).toBe('wnd[2]');
});

test('its: com popup aberto o alvo resolve na JANELA ATIVA — btn[0] está nas duas, e a de trás só por escopo explícito', () => {
  const lista = sidsDaResposta(DELTA_DUAS_BARRAS);
  // o achado do item 23: o MESMO btn[0] nas duas janelas, e a `wnd[1]` só vinha primeiro por ordem de markup
  expect(lista.filter((x) => x.okcode === 'btn[0]').map((x) => x.sid)).toEqual(['wnd[1]/tbar[0]/btn[0]', 'wnd[0]/tbar[0]/btn[0]']);
  expect(sidDoAlvo(lista, 'btn[0]')).toBe('wnd[1]/tbar[0]/btn[0]');                       // agora por REGRA: a janela ativa
  expect(sidDoAlvo(lista, 'btn[0]', { janela: 'wnd[0]' })).toBe('wnd[0]/tbar[0]/btn[0]'); // a de trás, dita
  expect(sidDoAlvo(lista, 'btn[12]')).toBe('wnd[1]/tbar[0]/btn[12]');
  expect(sidDoAlvo(lista, 'wnd[0]/tbar[0]/btn[0]')).toBe('wnd[0]/tbar[0]/btn[0]');        // o SID inteiro passa direto
  // o botão que só a janela de trás tem NÃO é clicado por baixo do modal — o erro mostra as duas janelas
  expect(() => sidDoAlvo(lista, 'Executar')).toThrow(
    /botão btn\[8\] não está em wnd\[1\] \(a janela ativa\) — está em wnd\[0\]\/tbar\[1\]\/btn\[8\]; wnd\[1\] tem btn\[0\]=Enter, btn\[12\]=Cancelar\. Se é a outra janela mesmo, peça \{ janela: 'wnd\[0\]' \}/);
  expect(sidDoAlvo(lista, 'Executar', { janela: 'wnd[0]' })).toBe('wnd[0]/tbar[1]/btn[8]');
  // janela pedida que não tem o alvo é erro, mesmo o alvo existindo na ativa
  expect(() => sidDoAlvo(lista, 'btn[12]', { janela: 'wnd[0]' })).toThrow(/botão btn\[12\] não está em wnd\[0\] — está em wnd\[1\]\/tbar\[0\]\/btn\[12\]/);
  // e o que não está em janela nenhuma diz o que a ativa tem E o que as outras têm
  expect(() => sidDoAlvo(lista, { okcode: 'btn[11]' })).toThrow(
    /botão btn\[11\] não está na tela — tenho btn\[0\]=Enter, btn\[12\]=Cancelar em wnd\[1\], e btn\[3\]=Voltar, btn\[0\]=Enter, btn\[8\]=Executar nas outras janelas \(wnd\[0\]\)/);
});

test('its: o mesmo okcode DUAS vezes na mesma janela não se resolve no escuro — o erro pede o SID', () => {
  // sintético: nenhum bruto medido repete o okcode dentro de uma janela (varridos os raw/*.txt das POCs)
  const duas = [
    { sid: 'wnd[0]/tbar[0]/btn[0]', tipo: 'GuiButton', okcode: 'btn[0]', janela: 'wnd[0]' },
    { sid: 'wnd[0]/tbar[1]/btn[0]', tipo: 'GuiButton', okcode: 'btn[0]', janela: 'wnd[0]' },
  ];
  expect(() => sidDoAlvo(duas, 'btn[0]')).toThrow(/botão btn\[0\] está 2× em wnd\[0\] — wnd\[0\]\/tbar\[0\]\/btn\[0\], wnd\[0\]\/tbar\[1\]\/btn\[0\]; enderece pelo SID inteiro/);
  expect(sidDoAlvo(duas, 'wnd[0]/tbar[1]/btn[0]')).toBe('wnd[0]/tbar[1]/btn[0]');
});

test('its: sids/botoes/campos carregam a janela dona, e recortam por ela quando pedido', () => {
  const sessao = { sids: sidsDaResposta(DELTA_DUAS_BARRAS), fila: [] };
  expect(ativa(sessao)).toBe('wnd[1]');
  expect(botoes(sessao).map((b) => [b.janela, b.okcode])).toEqual([
    ['wnd[1]', 'btn[0]'], ['wnd[1]', 'btn[12]'], ['wnd[0]', 'btn[3]'], ['wnd[0]', 'btn[0]'], ['wnd[0]', 'btn[8]'],
  ]);
  expect(botoes(sessao, ativa(sessao)).map((b) => b.sid)).toEqual(['wnd[1]/tbar[0]/btn[0]', 'wnd[1]/tbar[0]/btn[12]']);
  expect(botoes(sessao, 'wnd[0]')).toHaveLength(3);
  // o preencher escopa igual: com popup aberto o campo da wnd[0] não vem no delta, e o da wnd[1] vem
  const comCampos = { sids: sidsDaResposta(DELTA_SE38), fila: [] };
  expect(campos(comCampos, 'wnd[0]').map((c) => c.campo)).toEqual(['RS38M-PROGRAMM', 'RS38M-FUNC_EDIT']);
  expect(campos(comCampos, 'wnd[1]')).toEqual([]);
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

// ---------- o ITSDoc: a via de SAÍDA (item 45) ----------
// Os três `<script-call>` são COPIADOS das respostas do s4h 758/250 de 05/09/2026, exportando a
// lista do RSPARAM (POC_webgui_export/medicoes/raw/f-volta*.txt, h5-volta1.txt). O do
// `FileSaveDialog` veio cortado: os 50 pares de encoding (`E1`…`E50`) não mudam nada aqui.
const ITSDOC_URL = "/sap(cz1TSUQlM2FBTk9O…LUFUVA==)/bc/gui/sap/its/webgui/121/data/A8A20154B44A2737~";
const ITSDOC_QUERY = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {URL:'${ITSDOC_URL}',Query:'CD',Title:'',action:'invoke_itsdoc',RetLong:0,FileName:'',Environment:'',ITSDocMethod:'Query'};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;
const ITSDOC_SALVAR = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {E46:'UTF8|4110|Unicode (UTF-8)',URL:'${ITSDOC_URL}',Title:'',DefExt:'txt',Filter:'Arquivos de texto (*.TXT)|*.TXT|Todos os arquivos (*.*)|*.*|||',action:'invoke_itsdoc',DefFile:'',DefPath:'Z:\\\\',POnOWrite:'X',NoCodLines:'50',ITSDocMethod:'FileSaveDialog',WithEncoding:'X'};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;
const ITSDOC_EXPORT = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {URL:'${ITSDOC_URL}',Append:'false',action:'invoke_itsdoc',FileName:'Z:\\\\rsparam.txt',FileType:'BIN',ITSDocMethod:'Export'};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;
const ITSDOC_CLIPBOARD = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {URL:'${ITSDOC_URL}',Mode:'',Title:'',Method:'ClipboardExport',action:'invoke_itsdoc',DefPath:'',DestUrl:'',DestFile:'',MimeType:'',Variable:'',SourceUrl:'',SourceFile:'',MimeSubType:'',ITSDocMethod:'GuiSapInfo'};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;

test('its: itsdocDoDelta lê o pedido do frontend — objeto JS (chave sem aspas, valor em aspas simples)', () => {
  expect(itsdocDoDelta(ITSDOC_QUERY)).toMatchObject({ ITSDocMethod: 'Query', Query: 'CD', URL: ITSDOC_URL });
  // o `\\` do JS vira uma barra só depois de parseado — é o caminho do filesystem virtual
  expect(itsdocDoDelta(ITSDOC_EXPORT)).toMatchObject({ ITSDocMethod: 'Export', FileName: 'Z:\\rsparam.txt', FileType: 'BIN' });
  expect(itsdocDoDelta(ITSDOC_CLIPBOARD)).toMatchObject({ ITSDocMethod: 'GuiSapInfo', Method: 'ClipboardExport' });
  expect(itsdocDoDelta(ITSDOC_SALVAR)).toMatchObject({ ITSDocMethod: 'FileSaveDialog', DefPath: 'Z:\\' });
  // delta comum não pede nada ao frontend, e o vazio não estoura
  expect(itsdocDoDelta(DELTA)).toBe(null);
  expect(itsdocDoDelta(FRAGMENTO)).toBe(null);
  expect(itsdocDoDelta(null)).toBe(null);
  // valor com aspas simples derruba o JSON.parse — devolve o `bruto`, e o pedido cai no `cancel`
  const torto = itsdocDoDelta(`sap.its.arrITSDocParams = {Title:'d'Água',ITSDocMethod:'Export'};`);
  expect(torto.bruto).toBeTruthy();
  // pedido ilegível é método desconhecido — e para desconhecido o renderer manda `exception` (item 113)
  expect(pedidoDoItsdoc(torto).caminho).toBe('exception');
});

test('its: pedidoDoItsdoc traduz cada método do ITSDoc no verbo que o renderer POSTa', () => {
  const doc = (corpo) => itsdocDoDelta(corpo);
  const so = (p) => ({ corpo: '', conteudo: false, envia: false, ...p });
  expect(pedidoDoItsdoc(doc(ITSDOC_QUERY))).toEqual(so({ caminho: `${ITSDOC_URL}query?RetQuery=Z%3A%5C` }));
  expect(pedidoDoItsdoc(doc(ITSDOC_SALVAR), { arquivo: 'Z:\\rsparam.txt' })).toEqual(
    so({ caminho: `${ITSDOC_URL}filesavedialog?FileName=Z%3A%5Crsparam.txt&FileEncoding=4110` }));
  // só estes dois trazem DADO na resposta — é neles que a exportação sai
  expect(pedidoDoItsdoc(doc(ITSDOC_EXPORT))).toEqual(so({ caminho: `${ITSDOC_URL}get`, conteudo: true }));
  expect(pedidoDoItsdoc(doc(ITSDOC_CLIPBOARD))).toEqual(so({ caminho: `${ITSDOC_URL}clipboardexport`, conteudo: true }));
  // DIÁLOGO sem usuário é cancelamento de verdade — e é o único `cancel` que sobrou (item 113)
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'FileBrowser' })).toEqual(so({ caminho: 'u/cancel' }));
  // o GuiSapInfo de OUTRO Method É outro método — o clipboard de ENTRADA, com o texto no corpo
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'GuiSapInfo', Method: 'ClipboardImport' })).toEqual(
    so({ caminho: 'u/clipboardimport?', corpo: 'ImpClpbrdLength=-1&count=0' }));
});

// ---------- o ITSDoc: a via de ENTRADA (item 72) ----------
// Copiados das respostas do s4h 758/250 de 06/09/2026, subindo arquivo pela CG3Z e conferindo pela
// CG3Y (POC_webgui_import/medicoes/raw/e-2-carregar.txt, i-1-f4.txt, g-volta1.txt).
const ITSDOC_IMPORT = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {URL:'${ITSDOC_URL}',action:'invoke_itsdoc',FileName:'Z:\\\\item72.txt',ITSDocMethod:'Import'};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;
const ITSDOC_ABRIR = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {URL:'${ITSDOC_URL}',Title:'File origem em frontend',DefExt:'',Filter:'Files importação/exportação (*.dat)|*.dat|Tds.os files (*.*)|*.*||',action:'invoke_itsdoc',DefFile:'substanc.dat',DefPath:'%LOCALAPPDATA%\\\\',ITSDocMethod:'FileOpenDialog',WithEncoding:'',MultiSelection:''};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;
const ITSDOC_QUERY_FE = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {URL:'${ITSDOC_URL}',Query:'FE',Title:'',action:'invoke_itsdoc',RetLong:0,FileName:'Z:\\\\item72_volta.txt',Environment:'',ITSDocMethod:'Query'};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;

test('its: pedidoDoItsdoc — o Import POSTa o ARQUIVO, e o FileOpenDialog leva os parâmetros no CORPO', () => {
  // o Import é o único pedido que LEVA dado; a resposta dele é vazia
  expect(pedidoDoItsdoc(itsdocDoDelta(ITSDOC_IMPORT), { dado: Buffer.from('oi') })).toEqual({
    caminho: `${ITSDOC_URL}post`, corpo: '', conteudo: false, envia: true });
  // o FileOpenDialog manda `count`/`FileName0` no corpo (função `g` do fsmutil), não na URL
  expect(pedidoDoItsdoc(itsdocDoDelta(ITSDOC_ABRIR), { arquivo: 'Z:\\item72.txt' })).toEqual({
    caminho: `${ITSDOC_URL}fileopendialog?`,
    corpo: 'FileEncoding=&count=1&FileName0=Z%3A%5Citem72.txt', conteudo: false, envia: false });
  // `WithEncoding` ligado leva o encoding (presumido pelo renderer, não medido)
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'FileOpenDialog', WithEncoding: 'X' }, { arquivo: 'Z:\\a.txt', encoding: '4110' }).corpo)
    .toBe('FileEncoding=4110&count=1&FileName0=Z%3A%5Ca.txt');
});

test('its: pedidoDoItsdoc — cada sub-verbo do Query tem a SUA resposta (responder CD a todos dá dump)', () => {
  const q = (Query) => ({ URL: 'u/', ITSDocMethod: 'Query', Query });
  const dado = Buffer.alloc(57);
  // CD: o diretório corrente. FL: o tamanho. FE: existe? DE: o diretório existe?
  expect(pedidoDoItsdoc(q('CD')).caminho).toBe('u/query?RetQuery=Z%3A%5C');
  expect(pedidoDoItsdoc(q('FL'), { dado }).caminho).toBe('u/query?RetQuery=57');
  expect(pedidoDoItsdoc(q('FE'), { dado }).caminho).toBe('u/query?RetQuery=1');
  expect(pedidoDoItsdoc(q('DE')).caminho).toBe('u/query?RetQuery=1');
  // sem arquivo em mãos, o frontend não tem o que oferecer
  expect(pedidoDoItsdoc(q('FL')).caminho).toBe('u/query?RetQuery=0');
  expect(pedidoDoItsdoc(itsdocDoDelta(ITSDOC_QUERY_FE)).caminho).toBe(`${ITSDOC_URL}query?RetQuery=0`);
  // sub-verbo desconhecido: o renderer não POSTa nada, só devolve o controle
  expect(pedidoDoItsdoc(q('XX')).caminho).toBe(null);
});

// ---------- o ITSDoc que NÃO é arquivo (item 113) ----------
// Os `arrITSDocParams` abaixo são os MEDIDOS na TEST_FRONT_SERVICES do s4h 758/250 em 06/09/2026
// (POC_webgui_itsdoc/medicoes/raw/d-cancel-voltas.json) — a transação padrão da SAP que exercita
// os frontend services. É deles que veio o achado: `GuiSapInfo` é ENVELOPE, e o método real
// está no `Method`.
const ENVELOPE = (Method, extra = {}) => ({
  URL: 'u/', Mode: '', Title: '', Method, action: 'invoke_itsdoc', DefPath: '', DestUrl: '',
  DestFile: '', MimeType: '', Variable: '', SourceUrl: '', SourceFile: '', MimeSubType: '',
  ITSDocMethod: 'GuiSapInfo', ...extra,
});

test('its: verboDoItsdoc — GuiSapInfo é envelope; o método real está no `Method`', () => {
  expect(verboDoItsdoc(ENVELOPE('GetTempPath'))).toBe('GetTempPath');
  expect(verboDoItsdoc(ENVELOPE('DirectoryCreate', { DefPath: '\\temp_dir_created' }))).toBe('DirectoryCreate');
  expect(verboDoItsdoc({ URL: 'u/', ITSDocMethod: 'Export' })).toBe('Export');
  // sem `Method`, o envelope não some — o `ITSDocMethod` vale
  expect(verboDoItsdoc({ ITSDocMethod: 'GuiSapInfo' })).toBe('GuiSapInfo');
  expect(verboDoItsdoc(null)).toBe(null);
});

test('its: pedidoDoItsdoc — os dois INOFENSIVOS: GetTempPath e DirectoryListFiles', () => {
  // o temp é a CONSTANTE do renderer (`updown_temp_path` = "/temp" → `Z:\temp`), não %TEMP% de ninguém
  expect(pedidoDoItsdoc(ENVELOPE('GetTempPath')).caminho).toBe('u/gettemppath?RetGetTempPath=Z%3A%5Ctemp');
  expect(pedidoDoItsdoc(ENVELOPE('GetTempPath'), { temp: 'Z:\\outro' }).caminho).toBe('u/gettemppath?RetGetTempPath=Z%3A%5Coutro');
  // sem lista em mãos, o frontend não tem arquivo nenhum — e isso é `count=0`, não um erro
  const vazio = pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'DirectoryListFiles', DefPath: 'Z:\\', Filter: '*.*' });
  expect(vazio).toMatchObject({ caminho: 'u/directorylistfiles?', corpo: 'count=0' });
  // com lista, o formato é o do renderer — e os doze atributos vão ZERADOS, como lá
  const um = pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'DirectoryListFiles', Filter: '*.txt' },
    { arquivos: [{ nome: 'a.txt', tamanho: 57 }, { nome: 'b.bin', tamanho: 9 }, { nome: 'sub', dir: true }] });
  expect(um.corpo).toBe('count=1&filename0=a.txt&filelength0=57&isdir0=0'
    + '&ishidden0=0&issystem0=0&isreadonly0=0&isarchived0=0&isnormal0=0&iscompress0=0'
    + '&createdate0=00000000&createtime0=000000&accessdate0=00000000&accesstime0=000000'
    + '&writedate0=00000000&writetime0=000000');
});

test('its: corpoDaListaDeArquivos e filtroDoItsdoc — o filtro é aplicado no CLIENTE, como no renderer', () => {
  expect(filtroDoItsdoc('*.*').test('x.txt')).toBe(true);
  expect(filtroDoItsdoc('*.txt').test('X.TXT')).toBe(true);          // sem caixa
  expect(filtroDoItsdoc('*.txt').test('x.txtx')).toBe(false);        // ancorado
  expect(filtroDoItsdoc('a?.dat').test('a1.dat')).toBe(true);
  const arqs = [{ nome: 'g.bin', tamanho: 2 ** 31 }];
  expect(corpoDaListaDeArquivos(arqs)).toContain('filelength0=2147483647');   // RetLong falso corta em 2³¹−1
  expect(corpoDaListaDeArquivos(arqs, { retLong: true })).toContain('filelength0=2147483648');
  expect(corpoDaListaDeArquivos([{ nome: 'sub', dir: true }])).toContain('isdir0=1');
  expect(corpoDaListaDeArquivos([])).toBe('count=0');
});

test('its: corpoDoClipboard — o texto linha a linha; vazio é ImpClpbrdLength=-1', () => {
  expect(corpoDoClipboard(null)).toBe('ImpClpbrdLength=-1&count=0');
  expect(corpoDoClipboard('uma só')).toBe('ImpClpbrdLength=1&count=1&ImpClpbrdText1=uma+s%C3%B3');
  expect(corpoDoClipboard('a\r\nb')).toBe('ImpClpbrdLength=2&count=2&ImpClpbrdText1=a&ImpClpbrdText2=b');
});

test('its: pedidoDoItsdoc — quem MODIFICA o frontend recebe a falha do renderer, e o desconhecido recebe exception', () => {
  // a lib não tem filesystem: nenhum destes toca disco, e nenhum deles mente dizendo "cancelei"
  expect(pedidoDoItsdoc(ENVELOPE('DirectoryCreate', { DefPath: '\\temp_dir_created' })).caminho).toBe('u/directorycreate?RetDirectoryCreate=5');
  expect(pedidoDoItsdoc(ENVELOPE('DirectoryRemove', { DefPath: '\\temp_dir_created' })).caminho).toBe('u/directoryremove?RetDirectoryRemove=2');
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'Delete', FileName: 'Z:\\x.txt' }).caminho).toBe('u/delete?RetDelete=2');
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'FileCopy', SourceFile: 'a', DestFile: 'b' }).caminho).toBe('u/filecopy?RetFileCopy=5');
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'DpUrlCopy' }).caminho).toBe('u/dpurlcopy?RetDpUrlCopy=-1');
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'ShowDocument', MimeType: '', KeepFile: '' }).caminho).toBe('u/showdocument?RetString=3;');
  // Execute NÃO POSTa — o renderer só devolve o okcode, e a lib não executa nada
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'Execute', CommandLine: 'cmd.exe /c del *' }).caminho).toBe(null);
  // e o que ninguém previu: `exception`, como o `T ? g(T,K) : updown_sendexception(K)` do renderer
  expect(pedidoDoItsdoc({ URL: 'u/', ITSDocMethod: 'DpGetStreamFromUrl' }).caminho).toBe('u/exception');
  expect(pedidoDoItsdoc(ENVELOPE('MetodoQueNaoExiste')).caminho).toBe('u/exception');
});

test('its: OK_ITSDOC devolve o controle à dynpro — o mesmo trio do updown_send_okcode', () => {
  expect(OK_ITSDOC).toEqual([
    { post: 'okcode/ses[0]', content: '=OK' },
    { post: 'vkey/0/ses[0]' },
    { get: 'state/ur' },
  ]);
  expect(FORMATOS.tabuladores).toBe(1);
  expect(FORMATOS.clipboard).toBe(5);
});

// ---------- o MENU pela via HTTP (item 49) ----------
// Os `<tr ct="POMNI">` abaixo são COPIADOS do boot da SE38 no s4h 758/250 (05/09/2026,
// POC_webgui_menu/medicoes/raw/http-a-boot.xml). ⚠ Na via HTTP a árvore INTEIRA vem no boot —
// não há menu a abrir, ao contrário do DOM.
const DELTA_MENU = `<updates><delta-update><start-script><![CDATA[sap.its.arrSystemParams = {'d-num':'0100',dynpro:'SAPLWBABAP','t-code':'SE38'};]]></start-script><start-script><![CDATA[sap.its.aParams = {moin:'A',cuatitle:'Editor ABAP: 1ª tela'};]]></start-script>
<control-update id="cuaarea"><content><![CDATA[<tr ct="POMNI" lsdata='{"x":0,"1":"Programa","6":true,"7":"mnu0_122","18":{"SID":"wnd[0]/mbar/menu[0]","Type":"GuiMenu"},"19":"Programa"}' id="wnd[0]/mbar/menu[0]" title="Programa" role="menuitem" aria-haspopup="true"></tr>
<tr ct="POMNI" lsdata='{"x":0,"1":"Sistema","6":true,"7":"mnu0_143","18":{"SID":"wnd[0]/mbar/menu[5]","Type":"GuiMenu"},"19":"Sistema"}' id="wnd[0]/mbar/menu[5]" title="Sistema" role="menuitem" aria-haspopup="true"></tr>
<tr ct="POMNI" lsdata='{"x":0,"1":"Serviços","6":true,"7":"mnu0_138","18":{"SID":"wnd[0]/mbar/menu[5]/menu[3]","Type":"GuiMenu"},"19":"Serviços"}' id="wnd[0]/mbar/menu[5]/menu[3]" title="Servi&#xe7;os" role="menuitem" aria-haspopup="true"></tr>
<tr ct="POMNI" lsdata='{"x":0,"1":"Reporting","18":{"SID":"wnd[0]/mbar/menu[5]/menu[3]/menu[0]","Type":"GuiMenu"},"19":"Reporting"}' id="wnd[0]/mbar/menu[5]/menu[3]/menu[0]" title="Reporting" role="menuitem"></tr>
<tr ct="POMNI" lsdata='{"x":0,"1":"Batch input","6":true,"7":"mnu0_135","18":{"SID":"wnd[0]/mbar/menu[5]/menu[3]/menu[4]","Type":"GuiMenu"},"19":"Batch input"}' id="wnd[0]/mbar/menu[5]/menu[3]/menu[4]" title="Batch&#x20;input" role="menuitem" aria-haspopup="true"></tr>
<tr ct="POMNI" lsdata='{"x":0,"1":"Reiniciar transação","5":false,"18":{"SID":"wnd[0]/mbar/menu[5]/menu[3]/menu[4]/menu[3]","Type":"GuiMenu"},"19":"Reiniciar transação"}' id="wnd[0]/mbar/menu[5]/menu[3]/menu[4]/menu[3]" title="Reiniciar&#x20;transa&#xe7;&#xe3;o" role="menuitem" aria-disabled="true" class="urMnuRowDsbl"></tr>
<tr ct="POMNI" lsdata='{"x":0,"1":"Sistema","18":{"SID":"sysInfoAreaMenuItem3","Type":"GuiMenu"},"19":"Sistema"}' id="sysInfoAreaMenuItem3" role="menuitem"></tr>]]></content></control-update>
</delta-update></updates>`;

test('its: itensDeMenuDoDelta lê a árvore do delta e deixa fora o menu de informação do sistema', () => {
  const itens = itensDeMenuDoDelta(DELTA_MENU);
  expect(itens.map((i) => i.rotulo)).toEqual(['Programa', 'Sistema', 'Serviços', 'Reporting', 'Batch input', 'Reiniciar transação']);
  // o `id` do controle É o SID É o caminho — 121/121 no s4h, nas duas vias
  expect(itens.every((i) => i.sid === i.id)).toBe(true);
  expect(itens.find((i) => i.rotulo === 'Reporting')).toMatchObject({ sid: 'wnd[0]/mbar/menu[5]/menu[3]/menu[0]', submenu: false, nivel: 2, habilitado: true });
  expect(itens.find((i) => i.rotulo === 'Reiniciar transação').habilitado).toBe(false);
});

test('its: itensDeMenu lê do último delta sem tocar a rede, e { sob } dá só os filhos DIRETOS', () => {
  const sessao = { delta: DELTA_MENU };
  expect(itensDeMenu(sessao).length).toBe(6);
  expect(itensDeMenu(sessao, { sob: 'wnd[0]/mbar/menu[5]/menu[3]' }).map((i) => i.rotulo)).toEqual(['Reporting', 'Batch input']);
  expect(() => itensDeMenu({})).toThrow(/sem delta/);
});

test('its: acharCaminhoDeMenu desce por rótulo pelos filhos diretos — acento e caixa não importam', () => {
  const itens = itensDeMenuDoDelta(DELTA_MENU);
  const r = acharCaminhoDeMenu(itens, 'sistema > servicos > Reporting');
  expect(r.alvo.sid).toBe('wnd[0]/mbar/menu[5]/menu[3]/menu[0]');
  expect(r.passos.map((p) => p.sid)).toEqual(['wnd[0]/mbar/menu[5]', 'wnd[0]/mbar/menu[5]/menu[3]', 'wnd[0]/mbar/menu[5]/menu[3]/menu[0]']);
  // parar num nó dá os filhos dele — é como se DESCOBRE o menu, custo zero de rede
  expect(acharCaminhoDeMenu(itens, 'Sistema > Serviços').filhos.map((f) => f.rotulo)).toEqual(['Reporting', 'Batch input']);
  // rótulo que existe em OUTRO ramo não vale: os candidatos são só os filhos diretos
  expect(() => acharCaminhoDeMenu(itens, 'Programa > Reporting')).toThrow(/"Reporting" não está sob wnd\[0\]\/mbar\/menu\[0\]/);
});

// A modal ENGOLE o action/4 (item 131). Medido no s4h 758/250 em 06/09/2026 (item 83, passo 3 de
// `item83-com-modal-aberta.mjs`): com a `wnd[1]` na frente os 146 itens do menu CONTINUAM no delta,
// o caminho resolve, e o POST volta `multipart`/`pegou: false`/`mudou: false` — nada acontece e
// ninguém avisa. A guarda lança ANTES de postar; é a irmã da do item DESABILITADO (item 48).
const DELTA_MENU_COM_MODAL = DELTA_MENU.replace('</delta-update>',
  `${cdata('webguiPopups', `<div id="webguiPopups" ct="CO">${POPUP_NEND}</div>`)}</delta-update>`);

test('its: navegarMenu LANÇA com a modal na frente — sem a guarda o action/4 sumia em silêncio (item 131)', async () => {
  const sessao = { ...sessaoIts(), delta: DELTA_MENU_COM_MODAL, sids: sidsDaResposta(DELTA_MENU_COM_MODAL) };
  expect(janelaAtiva(sessao.sids)).toBe('wnd[1]');
  expect(itensDeMenu(sessao).length).toBe(6);          // o menu segue INTEIRO — é ele que mente

  // a mensagem diz QUAL modal está na frente e por qual SID ela se responde
  await expect(navegarMenu(sessao, 'Sistema > Serviços > Reporting'))
    .rejects.toThrow(/modal wnd\[1\] "Efetuar logoff" está na frente.*wnd\[1\]\/usr\/btnSPOP-OPTION1/s);
  // …e nada foi postado: quem tentasse a rede aqui estouraria no fetch, não na guarda
  await expect(navegarMenu(sessao, 'Sistema > Serviços > Reporting')).rejects.toThrow(/navegarMenu/);

  // DESCOBRIR o menu não posta nada, e por isso continua valendo com a modal aberta
  expect((await navegarMenu(sessao, 'Sistema > Serviços', { acionar: false })).filhos.map((f) => f.rotulo))
    .toEqual(['Reporting', 'Batch input']);
  // sem modal, a guarda não atrapalha: o action/4 da FOLHA sai como sempre
  const limpa = { ...sessaoIts(), delta: DELTA_MENU, sids: sidsDaResposta(DELTA_MENU) };
  expect(janelaAtiva(limpa.sids)).toBe('wnd[0]');
  const fetchOriginal = globalThis.fetch;
  let corpoPostado = null;
  globalThis.fetch = async (_url, opcoes) => {
    corpoPostado = String(opcoes.body ?? '');
    return new Response(DELTA_MENU, { status: 200, headers: { 'content-type': 'text/xml' } });
  };
  try {
    const r = await navegarMenu(limpa, 'Sistema > Serviços > Reporting');
    expect(JSON.parse(corpoPostado)[0]).toEqual({ post: 'action/4/wnd[0]/mbar/menu[5]/menu[3]/menu[0]' });
    expect(r.popup).toBe(null);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

// ---------- a ÁRVORE do SAP Easy Access (item 50) ----------
// Copiado do delta do SMEN do s4h 758/250 de 05/09/2026, reduzido a 5 nós
// (POC_webgui_arvore/medicoes/raw/a-smen-boot.xml): o container `STCS` com o `nodeindexes`, e os
// três controles de cada nó — MG (rótulo), L (ícone) e TV (o texto, com o rótulo no `lsdata[0]`).
const NO_TV = (n, rotulo) => `<span ct="TV" lsdata='{"0":"${rotulo}","2":false,"7":"INHERIT","14":true,"15":true,"17":{"ctmenu":true,"focusable":"X"}}' id="tree#C105#${n}#1#1#i" role="button">${rotulo}</span>`;
const NO_MG = (n, rotulo) => `<table ct="MG" lsdata='{"1":true,"4":{"m":{"d":[0],"e":["n","1"]}},"x":0}' id="tree#C105#${n}#1#mg" role="group"><tbody><tr><td>${rotulo}</td></tr></tbody></table>`;
const NO_L = (n) => `<span ct="L" lsdata='{"6":"LIGHT","7":"100%","8":true,"14":true,"16":"ACTIVATE","19":{"focusable":"X"},"x":0}' id="tree#C105#${n}#ni" lsevents='{"Activate":[{},{"0":"GuiTree","1":"action/1","13":0}],"DoubleClick":[{},{"0":"GuiTree","1":"action/74","2":true,"3":true,"13":2}]}'></span>`;
// O `td subct="HIC"` é a flag de "tem filhos" (item 84) — e é o ÚNICO que a carrega: `INDENT` é
// folha, `COLLAPSED`/`EXPANDED` é pasta. Ele não tem `ct`, então não entra nos brutos.
const NO_HIC = (n, estado, nivel) => `<td id="tree#C105#${n}#1" subct="HIC" lsdata='{"x":0${nivel ? `,"4":${nivel}` : ''},"5":"${estado}"}' role="gridcell"${estado === 'INDENT' ? '' : ` altAction="${estado === 'EXPANDED' ? 'HICCOL' : 'HICEXP'}"`} st="${estado === 'EXPANDED' ? '+' : '-'}" lv="${nivel}"></td>`;
const ARVORE_NOS = [[1, 'Favoritos', 'EXPANDED', 0], [2, 'Produção -> Ordem -> Criar', 'INDENT', 1],
  [3, 'Menu SAP', 'EXPANDED', 0], [4, 'Escritório', 'EXPANDED', 1], [5, 'Agenda', 'COLLAPSED', 2]]
  .map(([n, r, e, lv]) => `${NO_HIC(n, e, lv)}${NO_MG(n, r)}${NO_L(n)}${NO_TV(n, r)}`).join('');
const ARVORE_CONT = `<span ct="STCS" lsdata='{"6":"tree#C105_hk","10":"SINGLE","11":"SERVER_WEB_SMART","34":{"SID":"wnd[0]/usr/cntlIMAGE_CONTAINER/shellcont/shell/shellcont[0]/shell","Type":"GuiTree","ctmenu":true,"nodeindexes":[0,["Favo",2,-1],["F00003",3,1],["Root",0,-1],["0000000004",1,3],["0000000009",1,4]]},"x":0}' id="tree#C105">${ARVORE_NOS}</span>`;
const DELTA_ARVORE = `<updates><delta-update><start-script><![CDATA[sap.its.arrSystemParams = {'d-num':'1000',dynpro:'SAPLSMTR_NAVIGATION','t-code':'SMEN'};]]></start-script><start-script><![CDATA[sap.its.aParams = {moin:'A',cuatitle:'SAP Easy Access'};]]></start-script>
${cdata('steploop0', `<div id="steploop0" ct="PLP">${ARVORE_CONT}</div>`)}
</delta-update></updates>`;

test('its: indiceDoNo só reconhece o nó da árvore — o ícone, o container e o filler não são nó', () => {
  expect(indiceDoNo('tree#C105#6#1#1#i')).toBe(6);
  expect(indiceDoNo('tree#C105#15#1#1#i')).toBe(15);
  expect([indiceDoNo('tree#C105#6#ni'), indiceDoNo('tree#C105#6#f'), indiceDoNo('tree#C105#6#1#mg'), indiceDoNo('tree#C105'), indiceDoNo(null)])
    .toEqual([null, null, null, null, null]);
});

test('its: arvoreDosBrutos cruza o nodeindexes do container com os TV — a CHAVE, o pai e o nível', () => {
  const a = arvoreDosBrutos(controlesDoDelta(DELTA_ARVORE));
  expect(a.sid).toBe('wnd[0]/usr/cntlIMAGE_CONTAINER/shellcont/shell/shellcont[0]/shell');
  expect(a.nos.map((n) => [n.rotulo, n.chave, n.pai, n.nivel])).toEqual([
    ['Favoritos', 'Favo', -1, 0],
    ['Produção -> Ordem -> Criar', 'F00003', 1, 1],
    ['Menu SAP', 'Root', -1, 0],
    ['Escritório', '0000000004', 3, 1],
    ['Agenda', '0000000009', 4, 2],
  ]);
  // o segundo campo do nodeindexes vem cru: 2 na raiz dos favoritos, 3 no favorito, 0 no Root, 1 no menu
  expect(a.nos.map((n) => n.categoria)).toEqual([2, 3, 0, 1, 1]);
  // SEM a expansão não se INVENTA a flag — `null` é "não sei", e é diferente de `false`
  expect(a.nos.map((n) => [n.expansao, n.temFilhos])).toEqual([[null, null], [null, null], [null, null], [null, null], [null, null]]);
  // tela sem árvore não estoura: devolve vazio
  expect(arvoreDosBrutos(controlesDoDelta(DELTA))).toEqual({ sid: null, id: null, nodeindexes: null, nos: [] });
});

test('its: expansaoDoHtml lê a flag de "tem filhos" do td subct=HIC — e o arvoreDosBrutos a cola em cada nó', () => {
  const e = expansaoDoHtml(DELTA_ARVORE);
  expect([...e.entries()]).toEqual([[1, 'EXPANDED'], [2, 'INDENT'], [3, 'EXPANDED'], [4, 'EXPANDED'], [5, 'COLLAPSED']]);
  // o `td` do HIC não tem `ct`: ele NÃO entra nos brutos, e por isso o despejo por `[ct]` não o vê
  expect(controlesDoDelta(DELTA_ARVORE).some((c) => c.id === 'tree#C105#1#1')).toBe(false);
  const { nos } = arvoreDosBrutos(controlesDoDelta(DELTA_ARVORE), e);
  expect(nos.map((n) => [n.chave, n.expansao, n.temFilhos])).toEqual([
    ['Favo', 'EXPANDED', true], ['F00003', 'INDENT', false], ['Root', 'EXPANDED', true],
    ['0000000004', 'EXPANDED', true], ['0000000009', 'COLLAPSED', true],
  ]);
  expect(expansaoDoHtml('').size).toBe(0);
  expect(expansaoDoHtml(null).size).toBe(0);
});

test('its: arvore lê do último delta sem tocar a rede — com a flag de filhos junto', () => {
  expect(arvore({ delta: DELTA_ARVORE }).nos.length).toBe(5);
  expect(arvore({ delta: DELTA_ARVORE }).nos.map((n) => n.temFilhos)).toEqual([true, false, true, true, true]);
  expect(() => arvore({})).toThrow(/sem delta/);
});

test('its: expandirNo numa FOLHA não posta nada — o POST inócuo do item 84', async () => {
  // sessão só com o delta: se ele POSTASSE, estouraria (não há para onde postar)
  const r = await expandirNo({ delta: DELTA_ARVORE }, 'F00003');
  expect(r).toEqual({ forma: null, pulou: true, no: expect.objectContaining({ chave: 'F00003' }), abriu: false, filhos: [] });
});

test('its: os batches da árvore endereçam o CONTAINER pelo SID e nomeiam o nó pela CHAVE', () => {
  const sid = 'wnd[0]/usr/cntlIMAGE_CONTAINER/shellcont/shell/shellcont[0]/shell';
  expect(batchExpandirNo(sid, '0000000004')).toEqual([{ post: `action/8/${sid}`, content: 'type=node&node_key=0000000004' }]);
  expect(batchColapsarNo(sid, '0000000004')).toEqual([{ post: `action/9/${sid}`, content: 'type=node&node_key=0000000004' }]);
  expect(batchAcionarNo(sid, 'F00003')).toEqual([{ post: `action/2/${sid}`, content: 'type=OnNodeDoubleClick&node_key=F00003' }]);
});

test('its: expandirNo num nó JÁ ABERTO não posta — o action/8 é toggle e fecharia (item 85)', async () => {
  // sessão só com o delta: qualquer POST estouraria
  const r = await expandirNo({ delta: DELTA_ARVORE }, 'Favo');
  expect(r.pulou).toBe(true);
  expect(r.abriu).toBe(false);
  // o pulo devolve os filhos que JÁ estão visíveis — é o que quem pediu "abre isso" queria
  expect(r.filhos.map((x) => x.chave)).toEqual(['F00003']);
});

test('its: colapsarNo só posta em nó ABERTO — folha e COLLAPSED pulam (item 85)', async () => {
  for (const chave of ['F00003', '0000000009']) {          // INDENT e COLLAPSED
    const r = await colapsarNo({ delta: DELTA_ARVORE }, chave);
    expect(r).toEqual({ forma: null, pulou: true, no: expect.objectContaining({ chave }), fechou: false, nosAntes: 5, nosDepois: 5 });
  }
});

// O delta DEPOIS do `action/8` em "Agenda" (0000000009): ela vira `EXPANDED` e ganha o filho
// "Próprio" — o mesmo delta do boot com um nó a mais, que é o que a expansão faz na tela.
const ARVORE_NOS_2 = [[1, 'Favoritos', 'EXPANDED', 0], [2, 'Produção -> Ordem -> Criar', 'INDENT', 1],
  [3, 'Menu SAP', 'EXPANDED', 0], [4, 'Escritório', 'EXPANDED', 1], [5, 'Agenda', 'EXPANDED', 2],
  [6, 'Próprio', 'INDENT', 3]]
  .map(([n, r, e, lv]) => `${NO_HIC(n, e, lv)}${NO_MG(n, r)}${NO_L(n)}${NO_TV(n, r)}`).join('');
const DELTA_ARVORE_2 = DELTA_ARVORE
  .replace(',["0000000009",1,4]]', () => ',["0000000009",1,4],["0000000012",1,5]]')
  .replace(ARVORE_NOS, () => ARVORE_NOS_2);

test('its: navegarArvore { acionar: false } propaga o `mudou` das EXPANSÕES — o `false` fixo era mentira (item 99)', async () => {
  // a agregação pura: um `true` basta; sem `true`, um "não sei" contamina; lista vazia = nada postou
  expect([agregarMudou([]), agregarMudou([false, true]), agregarMudou([false, null]), agregarMudou([false, false])])
    .toEqual([false, true, null, false]);

  // (a) o caminho JÁ está aberto: nenhum POST sai — e aí `mudou: false` é VERDADE
  const r0 = await navegarArvore({ delta: DELTA_ARVORE }, ['Menu SAP', 'Escritório'], { acionar: false });
  expect(r0.expandidos).toEqual([]);
  expect(r0.mudou).toBe(false);
  expect(r0.filhos.map((f) => f.rotulo)).toEqual(['Agenda']);

  // (b) "Agenda" está COLLAPSED: sai UM `action/8` e a árvore ganha "Próprio" — a tela MUDOU
  const s = sessaoIts({ delta: DELTA_ARVORE, carimbo: carimboDoDelta(DELTA_ARVORE) });
  const posts = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    posts.push(JSON.parse(opcoes.body).map((c) => c.post ?? `get ${c.get}`).join('|'));
    return new Response(DELTA_ARVORE_2, { status: 200, headers: { 'content-type': 'text/xml' } });
  };
  try {
    const r = await navegarArvore(s, ['Menu SAP', 'Escritório', 'Agenda'], { acionar: false });
    expect(posts).toEqual([`action/8/${arvore({ delta: DELTA_ARVORE }).sid}|get state/ur`]);
    expect(r.expandidos).toEqual(['0000000009']);
    expect(r.filhos.map((f) => f.rotulo)).toEqual(['Próprio']);
    expect(r.mudou).toBe(true);              // até o item 99 este campo vinha `false` fixo
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('its: acharNoDaArvore acha por chave e por rótulo (sem acento nem caixa), e o erro lista o que existe', () => {
  const { nos } = arvoreDosBrutos(controlesDoDelta(DELTA_ARVORE));
  expect(acharNoDaArvore(nos, '0000000004').rotulo).toBe('Escritório');
  expect(acharNoDaArvore(nos, 'escritorio').chave).toBe('0000000004');
  expect(acharNoDaArvore(nos, { chave: 'Favo' }).rotulo).toBe('Favoritos');
  // por objeto NÃO cai no rótulo — { chave } é endereço exato
  expect(() => acharNoDaArvore(nos, { chave: 'Escritório' })).toThrow(/a árvore não tem/);
  expect(() => acharNoDaArvore(nos, 'Contabilidade')).toThrow(/Escritório \(0000000004\)/);
});

test('its: mensagemDosSids — o tipo é a CONSTANTE do SAP, e ele NÃO é veredito (OK num texto de recusa)', () => {
  expect(mensagemDosSids(sidsDaResposta(DELTA)))
    .toEqual({ tipo: 'OK', texto: 'Para tabela T000 existe uma visão de atualização' });
  expect(mensagemDosSids([])).toBe(null);
  // a barra sem mensagem tem applicationText vazio — não é mensagem
  expect(mensagemDosSids([{ sid: 'wnd[0]/sbar_msg', tipo: 'MESSAGEBAR', messageType: '', applicationText: '' }])).toBe(null);
  // o falso positivo do item 59 (bruto h-vkey12.txt do s4h 758/250, 05/09/2026): tipo de SUCESSO,
  // texto de RECUSA — por isso o veredito de mudança é o carimbo, não a mensagem
  expect(mensagemDosSids([{ sid: 'wnd[0]/sbar_msg', tipo: 'MESSAGEBAR', messageType: 'OK',
    applicationText: 'Não se pode selecionar código de função' }]))
    .toEqual({ tipo: 'OK', texto: 'Não se pode selecionar código de função' });
});

test('its: carimboDosSids — a BARRA DE MENSAGEM fica de fora; janela ativa e valor de campo entram', () => {
  const base = carimboDoDelta(DELTA);
  expect(base).toMatch(/^SE16\/\/1BCDWB\/DBT000\/1000 wnd\[0\] "Data Browser: tabela T000: tela de seleção" #[0-9a-f]{16}$/);

  // MESMA tela, mensagem DIFERENTE → MESMO carimbo (é o caso do item 59)
  const outraMsg = DELTA.replace(/Para tabela T000 existe uma visão de atualização/g, 'Não se pode selecionar código de função')
    .replace(/"messageType":"OK"/, '"messageType":"ERROR"');
  expect(carimboDoDelta(outraMsg)).toBe(base);

  // valor de campo mudou → carimbo mudou
  expect(carimboDoDelta(DELTA.replace(/"value":"200 "/, '"value":"2 "'))).not.toBe(base);
  // popup abriu → carimbo mudou, e a janela ativa aparece no prefixo legível
  const comPopup = DELTA.replace('"SID":"wnd[0]/tbar[0]/btn[3]","Type":"GuiButton"}}\'></div>]]',
    '"SID":"wnd[1]","Type":"GuiModalWindow"}}\'></div>]]');
  expect(comPopup).not.toBe(DELTA);
  expect(carimboDoDelta(comPopup)).toContain('wnd[1]');
  expect(carimboDoDelta(comPopup)).not.toBe(base);

  // corpo sem delta-update não tem tela — não tem carimbo
  expect(carimboDoDelta(MULTIPART)).toBe(null);
});

test('its: mudouDaTela — pegou é o veredito do PROTOCOLO, mudou é o veredito da TELA', () => {
  const delta = { forma: 'delta', parcial: false };
  expect(mudouDaTela(delta, 'A', 'B')).toBe(true);
  expect(mudouDaTela(delta, 'A', 'A')).toBe(false);   // o falso positivo do item 59
  expect(mudouDaTela(delta, null, 'A')).toBe(null);   // o boot: não havia tela antes
  // o fragmento do ALV não é a tela; o multipart recusou; o logoff mudou tudo
  expect(mudouDaTela({ forma: 'delta', parcial: true }, 'A', 'A')).toBe(null);
  expect(mudouDaTela({ forma: 'multipart' }, 'A', 'A')).toBe(false);
  expect(mudouDaTela({ forma: 'logoff' }, 'A', 'A')).toBe(true);
  expect(mudouDaTela({ forma: 'sem-sessao' }, 'A', 'A')).toBe(null);
  expect(mudouDaTela({ forma: 'outra' }, 'A', 'A')).toBe(null);
});


// ─── criar é mutação imediata TAMBÉM por esta via (item 66) ───────────────────
// A pilha e o `transacional` são os MESMOS do webgui.mjs (mecânica provada lá). O que se prova
// aqui é o que só existe nesta via: a sessão do `abrir` nasce com pilha, e o `fechar` a roda ANTES
// do `/nex` — depois do logoff o POST seguinte volta 400 e não haveria como descartar nada.

const sessaoIts = (extra = {}) => ({
  via: 'http', aberta: true, action: '/sap(x)/bc/gui/sap/its/webgui/', cfg: { base: 'http://x:8000', user: 'u', pass: 'p' },
  jar: new Map([['SAP_SESSIONID_S4H_250', 'abc']]), moin: null, fila: [], sids: [], desfazer: criarPilhaDeDesfazer(), ...extra,
});

test('its: transacional aceita a sessão desta via — o descarte não sabe de CDP nem de HTTP', async () => {
  const s = sessaoIts();
  const gestos = [];
  await transacional(s, {
    rotulo: 'pedido de compra',
    abrir: () => { gestos.push('/nME21N'); },     // entrar na dynpro JÁ numera o rascunho
    descartar: () => { gestos.push('/n (descartar)'); },
    corpo: () => { gestos.push('lerTela'); },     // "só olhar" — o caso dos quatro mappings vazios
  });
  expect(gestos).toEqual(['/nME21N', 'lerTela', '/n (descartar)']);
  expect(s.desfazer.tamanho()).toBe(0);
});

// A resposta de uma sessão VIVA à sonda do `fechar`: delta com `sap.its.aParams` (sem ele o
// `lerResposta` a leria como delta PARCIAL, que não é tela).
const DELTA_VIVO = '<updates><delta-update><script>sap.its.aParams = {"cuatitle":"Tela"}</script></delta-update></updates>';

test('its: fechar roda o desfazer ANTES do /nex — com a sessão ITS ainda viva', async () => {
  const s = sessaoIts();
  const ordem = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    const batch = JSON.parse(opcoes.body);
    ordem.push(`POST ${batch.map((c) => c.post ?? `get ${c.get}`).join('|')}`);
    // a SONDA de vida do fechar (só `get state/ur`) responde tela; o `/nex` responde logoff
    return batch.length === 1 && batch[0].get
      ? new Response(DELTA_VIVO, { status: 200, headers: { 'content-type': 'text/xml' } })
      : new Response('<html>logoff</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  try {
    s.desfazer.registrar('rascunho da ME21N', () => {
      // só consegue rodar com a sessão de pé — é o análogo do "a página respondeu" do navegador
      ordem.push(`descartar (aberta=${s.aberta})`);
    });
    const r = await fechar(s);
    expect(r).toMatchObject({ encerrada: true, via: '/nex' });
    expect(r.desfeito).toEqual([{ rotulo: 'rascunho da ME21N', ok: true }]);
    expect(r.pendentes).toBeUndefined();
    expect(ordem).toEqual([
      'POST get state/ur',                       // a sonda de vida, ANTES da pilha (item 106)
      'descartar (aberta=true)',
      'POST value/wnd[0]/tbar[0]/okcd|vkey/0/ses[0]|get state/ur',
    ]);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

// ⚠ o item 106: a sessão morta POR TRÁS mentia. `aberta` seguia `true`, o POST do descarte voltava
// 400 `Session Timed Out` SEM estourar, e a pilha dava o gesto por bom — `ok: true`, `pendentes: []`
// e o rascunho no banco, sem nome. Medido no s4h 758/250 em 06/09/2026.
test('its: sessão morta POR TRÁS — a sonda de vida descobre e o descarte NÃO é dado por bom', async () => {
  const s = sessaoIts();
  const ordem = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    ordem.push(`POST ${JSON.parse(opcoes.body).map((c) => c.post ?? `get ${c.get}`).join('|')}`);
    return new Response('400 Session Timed Out', { status: 400, headers: { 'content-type': 'text/html' } });
  };
  try {
    s.desfazer.registrar('rascunho da YJBV106', () => { ordem.push('descartar'); });
    const r = await fechar(s);
    expect(r).toMatchObject({ encerrada: false, motivo: /morrido por trás/, pendentes: ['rascunho da YJBV106'] });
    expect(r.desfeito).toEqual([]);
    expect(ordem).toEqual(['POST get state/ur']);   // a sonda gastou UM post; o descarte não rodou
    expect(s.desfazer.tamanho()).toBe(1);           // o rótulo do lixo sobrevive para quem for limpar
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('its: sessão SEM pendência não paga a sonda de vida — fecha pelo /nex direto', async () => {
  const s = sessaoIts();
  const ordem = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_url, opcoes) => {
    ordem.push(`POST ${JSON.parse(opcoes.body).map((c) => c.post ?? `get ${c.get}`).join('|')}`);
    return new Response('<html>logoff</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  try {
    expect(await fechar(s)).toMatchObject({ encerrada: true, via: '/nex' });
    expect(ordem).toEqual(['POST value/wnd[0]/tbar[0]/okcd|vkey/0/ses[0]|get state/ur']);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('its: sessão JÁ encerrada não executa a pilha — avisa e PRESERVA os rótulos', async () => {
  const s = sessaoIts({ aberta: false });
  const gestos = [];
  s.desfazer.registrar('rascunho órfão', () => { gestos.push('descartou'); });
  const r = await fechar(s);
  expect(r).toMatchObject({ encerrada: false, motivo: 'já estava encerrada', pendentes: ['rascunho órfão'] });
  expect(gestos).toEqual([]);                  // sem sessão, o POST do descarte só estouraria
  expect(s.desfazer.tamanho()).toBe(1);        // a pilha fica de pé para quem abrir outra sessão
});

// ---------- o formato PLANILHA: o popup Export As e o Execute (item 73) ----------
// Copiados das respostas do s4h 758/250 de 06/09/2026, exportando o ALV do RSPARAM em XLSX pelo
// `btn[43]` (POC_webgui_planilha/medicoes/raw/d-01-btn43.txt, c-nada-doc2.json).
const EXPORT_AS = `<updates><delta-update><control-update id="popup"><content><![CDATA[
<div ct="PW_standards" lsdata='{"0":false,"4":"913px","5":"208px","8":"webguiKeys","13":{"SID":"wnd[1]","Type":"GuiModalWindow","ModalNo":1,"focusable":"X"},"16":true}' lsevents='{"Close":[{},{"1":"action/11","2":true,"3":true}],"Hotkey":[{},{"0":"GuiModalWindow","1":"vkey","2":true}],"PopupContextMenu":[{},{}]}' id="SAPLSALV_GUI_CUL_CONFIGURATION1500_1" role="dialog" aria-labelledby="SAPLSALV_GUI_CUL_CONFIGURATION1500_1-header-title-txt" class="lsPWNew lsPWNewMaxWidthAutoX lsPWNewMaxWidthAutoY">
<input id="M1:46:1::1:17" ct="CBS" lsdata='{"x":0,"1":"FREETEXT","3":"M1:46:1::1:17_TALB","5":"EXPORT_20260906_013033","7":true,"13":"N","14":"SERVER","17":false,"20":false,"21":{"SID":"wnd[1]/usr/ssubSUB_CONFIGURATION:SAPLSALV_GUI_CUL_EXPORT_AS:0512/txtGS_EXPORT-FILE_NAME","Type":"GuiTextField","value":"EXPORT_20260906_013033","maxlen":80,"focusable":"X"},"22":"pstxt","29":"M1:46:1::1:1"}' lsevents='{"Change":[{},{"1":"value","3":true,"7":true}],"Select":[{},{"1":"value","3":true,"7":true}],"Validate":[{},{}],"DeleteItem":[{},{"3":true}],"ListAccess":[{"ResponseData":"delta","TransportMethod":"full","EnqueueCardinality":"none"},{"3":true,"8":"history","limitlen":"X"}],"ClipboardTablePaste":[{},{"0":"GuiTextField","1":"action/25","2":true,"3":true}]}' type="text" data-sap-ls-accesskey="N" accesskey="N" autocomplete="off" maxlength="80" tabindex="0" ti="0" title="Char&#x20;80" class="lsField__input" value="EXPORT_20260906_013033" role="textbox" aria-labelledby="M1&#x3a;46&#x3a;1&#x3a;&#x3a;1&#x3a;1" name="InputField"/>
<input id="M1:46:1::2:17" ct="CB" lsdata='{"x":0,"3":"GS_EXPORT-FORMATSAPLSALV_GUI_CUL_EXPORT_AS","4":"xlsx-LEAN-STANDARD","5":"Microsoft Excel (*.xlsx)","7":true,"12":true,"13":"F","21":{"SID":"wnd[1]/usr/ssubSUB_CONFIGURATION:SAPLSALV_GUI_CUL_EXPORT_AS:0512/cmbGS_EXPORT-FORMAT","Type":"GuiComboBox","focusable":"X"},"29":"M1:46:1::2:1"}' lsevents='{"Select":[{},{"1":"value","2":true,"3":true}],"Validate":[{},{}]}' type="text" data-sap-ls-accesskey="F" accesskey="F" autocomplete="off" tabindex="0" ti="0" title="Caractere&#x20;40&#x20;posi&#xe7;&#xf5;es" class="lsField__input" readonly value="Microsoft&#x20;Excel&#x20;&#x28;&#x2a;.xlsx&#x29;" aria-roledescription="Caixa&#x20;de&#x20;listagem&#x20;drop-down" aria-controls="GS_EXPORT-FORMATSAPLSALV_GUI_CUL_EXPORT_AS" aria-haspopup="true" aria-labelledby="M1&#x3a;46&#x3a;1&#x3a;&#x3a;2&#x3a;1"/>
<input id="M1:46:1::3:17" ct="CB" lsdata='{"x":0,"3":"GS_EXPORT-DESTINATIONSAPLSALV_GUI_CUL_EXPORT_AS","4":"L","5":"Local","7":true,"12":true,"13":"D","21":{"SID":"wnd[1]/usr/ssubSUB_CONFIGURATION:SAPLSALV_GUI_CUL_EXPORT_AS:0512/cmbGS_EXPORT-DESTINATION","Type":"GuiComboBox","focusable":"X"},"29":"M1:46:1::3:1"}' lsevents='{"Select":[{},{"1":"value","2":true,"3":true}],"Validate":[{},{}]}' type="text" data-sap-ls-accesskey="D" accesskey="D" autocomplete="off" tabindex="0" ti="0" title="Caractere&#x20;40&#x20;posi&#xe7;&#xf5;es" class="lsField__input" readonly value="Local" aria-roledescription="Caixa&#x20;de&#x20;listagem&#x20;drop-down" aria-controls="GS_EXPORT-DESTINATIONSAPLSALV_GUI_CUL_EXPORT_AS" aria-readonly="true" aria-haspopup="true" aria-labelledby="M1&#x3a;46&#x3a;1&#x3a;&#x3a;3&#x3a;1"/>
<div draggable="false" id="M1:48::btn[20]" ct="B" lsdata='{"0":"Exportar para...","2":"TRANSPARENT","4":"Exportar dados","17":"E","18":"SHIFT_F8","21":true,"25":"TOGGLE","27":{"SID":"wnd[1]/tbar[0]/btn[20]","Type":"GuiButton","SubType":"toolbar"}}' lsevents='{"Press":[{},{"1":"action/3","2":true,"3":true}]}' role="button" title="Exportar&#x20;dados" data-sap-ls-accesskey="E" accesskey="E" tabindex="0" ti="0" class="lsButton lsButton--base urNoUserSelect urBtnRadius  lsButton--useintoolbar  lsButton--active  lsButton--focusable  lsButton--up lsButton--design-transparent ">
<div draggable="false" id="M1:54::btn[12]" ct="B" lsdata='{"0":"Cancelar","2":"TRANSPARENT","4":"Finalizar sem atualização das configurações","17":"C","18":"ESCAPE","21":true,"25":"TOGGLE","27":{"SID":"wnd[1]/tbar[0]/btn[12]","Type":"GuiButton","SubType":"toolbar"}}' lsevents='{"Press":[{},{"1":"action/3","2":true,"3":true}]}' role="button" title="Finalizar&#x20;sem&#x20;atualiza&#xe7;&#xe3;o&#x20;das&#x20;configura&#xe7;&#xf5;es" data-sap-ls-accesskey="C" accesskey="C" tabindex="0" ti="0" class="lsButton lsButton--base urNoUserSelect urBtnRadius  lsButton--useintoolbar  lsButton--active  lsButton--focusable  lsButton--up lsButton--design-transparent ">
<div id="GS_EXPORT-FORMATSAPLSALV_GUI_CUL_EXPORT_AS" ct="LIB_PS" lsdata='{"x":0,"7":true,"9":"NONE","10":"VISIBLE"}' class="lsListbox lsListbox--hasitems lsListbox--popup" role="listbox" aria-owns="u15540 u15541 " aria-activedescendant="u15540"><div id="GS_EXPORT-FORMATSAPLSALV_GUI_CUL_EXPORT_AS-scrl" class="lsListbox__items"><div class="lsListbox__values"><div id="u15540" class="lsListbox__value" data-itemid="u15540" ct="LIB_I" data-itemindex="0" data-itemkey="xlsx-LEAN-STANDARD" data-itemvalue1="xlsx-LEAN-STANDARD" data-itemvalue2="Microsoft&#x20;Excel&#x20;&#x28;&#x2a;.xlsx&#x29;" role="option">Microsoft Excel (*.xlsx)</div><div id="u15541" class="lsListbox__value" data-itemid="u15541" ct="LIB_I" data-itemindex="1" data-itemkey="csv-LEAN-STANDARD" data-itemvalue1="csv-LEAN-STANDARD" data-itemvalue2="File&#x20;separado&#x20;por&#x20;v&#xed;rgula&#x20;&#x28;&#x2a;.csv&#x29;" role="option">File separado por vírgula (*.csv)</div></div></div></div><div id="GS_EXPORT-DESTINATIONSAPLSALV_GUI_CUL_EXPORT_AS" ct="LIB_PS" lsdata='{"x":0,"7":true,"9":"NONE","10":"VISIBLE"}' class="lsListbox lsListbox--hasitems lsListbox--popup" role="listbox" aria-owns="u15543 " aria-activedescendant="u15543"><div id="GS_EXPORT-DESTINATIONSAPLSALV_GUI_CUL_EXPORT_AS-scrl" class="lsListbox__items"><div class="lsListbox__values"><div id="u15543" class="lsListbox__value" data-itemid="u15543" ct="LIB_I" data-itemindex="0" data-itemkey="L" data-itemvalue1="L" data-itemvalue2="Local" role="option">Local</div></div></div></div>
]]></content></control-update></delta-update></updates>`;

const ITSDOC_EXECUTE = `<updates><delta-update><script-call><![CDATA[sap.its.arrITSDocParams = {URL:'/sap(cz1TSUQlM2FBTk9OJTNhbmRjLXM0aGFuYV9TNEhfMDAlM2FvWVhuNmhpaU1RXzRNdHlOc0ZjcVZ6enVlcDhkeTdWZ19yMXpDVXFDLUFUVA==)/bc/gui/sap/its/webgui/145/data/682D70E7D2A8684C~',action:'invoke_itsdoc',Program:'',Operation:'OPEN',CommandLine:'Z:\\\\ITEM73.xlsx',ITSDocMethod:'Execute'};sap.its.updateITSDoc();]]></script-call></delta-update></updates>`;

test('its: exportAsDoPopup acha os campos do Export As — o desvio do formato PLANILHA (item 73)', () => {
  const pop = popupDaTela(controlesDoDelta(EXPORT_AS));
  expect(pop.sid).toBe('wnd[1]');   // o titulo ('Export As') vem do cabeçalho da modal, fora deste recorte
  const cx = exportAsDoPopup(pop);
  // quem dispara o ITSDoc é o "Exportar para..." (btn[20]), não o Enter da modal
  expect(cx.botao).toBe('wnd[1]/tbar[0]/btn[20]');
  expect(cx.nome).toMatch(/txtGS_EXPORT-FILE_NAME$/);
  expect(cx.formato).toMatch(/cmbGS_EXPORT-FORMAT$/);
  expect(cx.destino).toMatch(/cmbGS_EXPORT-DESTINATION$/);
  // os combos vêm com o valor de tela: no sistema medido, uma opção só em cada
  expect(cx.valores).toMatchObject({ formato: 'Microsoft Excel (*.xlsx)', destino: 'Local' });
  // outra modal qualquer não é o Export As — e o nulo não estoura
  expect(exportAsDoPopup(popupDaTela(controlesDoDelta(DELTA)))).toBe(null);
  expect(exportAsDoPopup(null)).toBe(null);
});

test('its: combosDoDelta lê o cardápio que a tela declara — o input `ct="CB"` + a lista `LIB_PS` (item 114)', () => {
  const combos = combosDoDelta(EXPORT_AS);
  expect(combos.map((c) => c.sid)).toEqual([
    'wnd[1]/usr/ssubSUB_CONFIGURATION:SAPLSALV_GUI_CUL_EXPORT_AS:0512/cmbGS_EXPORT-FORMAT',
    'wnd[1]/usr/ssubSUB_CONFIGURATION:SAPLSALV_GUI_CUL_EXPORT_AS:0512/cmbGS_EXPORT-DESTINATION',
  ]);
  const formato = comboDoSid(combos, combos[0].sid);
  // a CHAVE corrente sai do lsdata pelo CONTEÚDO (é `data-itemkey` de uma opção), não pelo índice;
  // o TEXTO é o que a caixa mostra
  expect(formato).toMatchObject({ chave: 'xlsx-LEAN-STANDARD', texto: 'Microsoft Excel (*.xlsx)' });
  expect(formato.opcoes).toEqual([
    { indice: 0, chave: 'xlsx-LEAN-STANDARD', texto: 'Microsoft Excel (*.xlsx)' },
    { indice: 1, chave: 'csv-LEAN-STANDARD', texto: 'File separado por vírgula (*.csv)' },
  ]);
  // a lista de cada combo é a SUA: o corte entre listas irmãs não vaza a opção da vizinha
  expect(combos[1].opcoes).toEqual([{ indice: 0, chave: 'L', texto: 'Local' }]);
  expect(opcoesDaLista(EXPORT_AS, 'NAO_EXISTE')).toBe(null);
  expect(comboDoSid(combos, 'wnd[0]/usr/txtMAX_SEL')).toBe(null);
  expect(combosDoDelta(DELTA)).toEqual([]);         // tela sem combo nenhum
});

test('its: chaveDaOpcao traduz texto/índice para a CHAVE — é ela que o servidor aceita (item 114)', () => {
  const combo = combosDoDelta(EXPORT_AS)[0];
  expect(chaveDaOpcao(combo, 'csv-LEAN-STANDARD')).toBe('csv-LEAN-STANDARD');          // a chave passa
  expect(chaveDaOpcao(combo, 'File separado por vírgula (*.csv)')).toBe('csv-LEAN-STANDARD');
  expect(chaveDaOpcao(combo, '  FILE SEPARADO   POR VÍRGULA (*.CSV) ')).toBe('csv-LEAN-STANDARD');
  expect(chaveDaOpcao(combo, 1)).toBe('csv-LEAN-STANDARD');                            // pelo índice
  expect(chaveDaOpcao(combo, 0)).toBe('xlsx-LEAN-STANDARD');
  // fora da lista estoura AQUI, com o cardápio — em vez do `-107 invalid value` mudo do servidor
  expect(() => chaveDaOpcao(combo, 'BANANA')).toThrow(/não é opção do combo .*csv-LEAN-STANDARD/s);
  // combo sem lista no delta: não há contra o que conferir, o valor passa cru
  expect(chaveDaOpcao({ sid: 'x', opcoes: null }, 'qualquer')).toBe('qualquer');
});

test('its: preencher num COMBO enfileira a CHAVE, mesmo quando se disse o texto (item 114)', () => {
  const sessao = { sids: sidsDaResposta(EXPORT_AS), fila: [], delta: EXPORT_AS };
  const cmb = 'wnd[1]/usr/ssubSUB_CONFIGURATION:SAPLSALV_GUI_CUL_EXPORT_AS:0512/cmbGS_EXPORT-FORMAT';
  expect(preencher(sessao, { sid: cmb }, 'File separado por vírgula (*.csv)'))
    .toMatchObject({ sid: cmb, valor: 'csv-LEAN-STANDARD', combo: cmb });
  expect(sessao.fila).toEqual([
    { post: `focus/${cmb}`, logic: 'ignore' }, { post: `value/${cmb}`, content: 'csv-LEAN-STANDARD' },
  ]);
  // o campo de TEXTO do mesmo popup continua indo como está — a tradução é só do combo
  sessao.fila = [];
  expect(preencher(sessao, { campo: 'GS_EXPORT-FILE_NAME' }, 'LISTA')).toMatchObject({ valor: 'LISTA' });
  expect(sessao.fila[1].content).toBe('LISTA');
  // opção inexistente estoura na hora de enfileirar, não no POST
  expect(() => preencher(sessao, { sid: cmb }, 'BANANA')).toThrow(/não é opção do combo/);
  // `{ cru: true }` desliga a tradução — para MEDIR o que o servidor faz com um valor qualquer
  sessao.fila = [];
  expect(preencher(sessao, { sid: cmb }, 'BANANA', { cru: true })).toMatchObject({ valor: 'BANANA' });
  expect(sessao.fila[1].content).toBe('BANANA');
});

test('its: opcoes(sessao, alvo) é o cardápio da tela atual; alvo que não é combo estoura com os que são', () => {
  const sessao = { sids: sidsDaResposta(EXPORT_AS), fila: [], delta: EXPORT_AS };
  expect(opcoes(sessao, { campo: 'GS_EXPORT-DESTINATION' })).toMatchObject({
    chave: 'L', texto: 'Local', opcoes: [{ indice: 0, chave: 'L', texto: 'Local' }],
  });
  expect(() => opcoes(sessao, { campo: 'GS_EXPORT-FILE_NAME' })).toThrow(/não é um combo .*cmbGS_EXPORT-FORMAT/s);
});

test('its: pedidoDoItsdoc — o Execute NÃO posta nada: o renderer só devolve o okcode (item 73)', () => {
  const doc = itsdocDoDelta(ITSDOC_EXECUTE);
  expect(doc).toMatchObject({ ITSDocMethod: 'Execute', Operation: 'OPEN', CommandLine: 'Z:\\ITEM73.xlsx' });
  // `caminho: null` = não POSTe nada; é o que o `atenderItsdoc` lê para pular direto ao OK_ITSDOC
  expect(pedidoDoItsdoc(doc).caminho).toBe(null);
});

test('its: a primeira linha da recusa aponta para onde o problema ESTÁ (item 88)', () => {
  // "canal WebGUI indisponível" manda procurar o nó na SICF — certo para as causas de canal…
  for (const c of ['sem-no', 'ssl', 'proibido', 'erro-servidor', 'sem-icm', 'certificado']) {
    expect(prefixoDaRecusa(c)).toBe('canal WebGUI indisponível');
  }
  // …e ERRADO quando o nó respondeu a tela e o que faltou foi a sessão nascer.
  expect(prefixoDaRecusa('sem-sessao-nova')).toMatch(/ATENDEU, mas a sessão não nasceu/);
  expect(prefixoDaRecusa('sem-sessao-nova')).not.toMatch(/indisponível/);
  expect(prefixoDaRecusa('credencial')).toMatch(/recusou a credencial/);
  expect(prefixoDaRecusa('inesperado')).toMatch(/não prevista/);
});

// ---------- o TETO do Import, e as duas falhas que ele expôs (item 112) ----------
// Medido no s4h 758/250 em 06/09/2026 (POC_webgui_import/medicoes/item112-teto.md): o corte não é
// do renderer (o `maximum file size` dele é 2^31-1, constante literal), é do ICM.

test('its: tetoDoImport sai do icm/HTTP/max_request_size_KB, descontado o multipart (item 112)', () => {
  // a conta do ICM é `floor(corpo/1024) <= max_request_size_KB` — medido AO BYTE contra o
  // /sap/public/ping: 104 858 623 B de corpo passam (200), 104 858 624 B levam 413.
  expect((102400 + 1) * 1024 - 1).toBe(104858623);
  expect(MULTIPART_IMPORT).toBe(186);                    // o FormData do undici, boundary fixo
  expect(tetoDoImport()).toBe(104858437);                // 104 858 623 − 186 de multipart
  // e o degrau seguinte foi RECUSADO no canal real do Import (CG3Z), não só no ping
  expect(tetoDoImport() + 1).toBe(104858438);
  // sistema com outro parâmetro tem outro teto — a fórmula é a mesma
  expect(tetoDoImport(10240)).toBe(10486597);
});

test('its: o ITSDoc que responde 413 ESTOURA — antes do item 112 virava "0 B, tudo bem"', async () => {
  const s = sessaoIts();
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>ICM error</html>', { status: 413, headers: { 'content-type': 'text/html' } });
  try {
    await expect(atenderItsdoc(s, { corpo: ITSDOC_IMPORT }, { dado: Buffer.alloc(9), arquivo: 'Z:\a.bin' }))
      .rejects.toThrow(/recusou o TAMANHO \(413\).*max_request_size_KB/s);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('its: atenderItsdoc estourando o voltasMax ACUSA o truncamento, não devolve meio arquivo', async () => {
  const s = sessaoIts();
  const fetchOriginal = globalThis.fetch;
  // um servidor que NUNCA para de pedir `Export` — é a forma do download grande: 64 MB desceram em
  // 14 partes de 5 120 000 B (15 voltas), acima do voltasMax que era 12 até aqui.
  globalThis.fetch = async (_url, opcoes) => (String(opcoes.body ?? '').startsWith('[')
    ? new Response(ITSDOC_EXPORT, { status: 200, headers: { 'content-type': 'text/xml' } })
    : new Response(Buffer.alloc(5120000), { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
  try {
    await expect(atenderItsdoc(s, { corpo: ITSDOC_EXPORT }, { voltasMax: 3, arquivo: 'Z:\a.bin' }))
      .rejects.toThrow(/parou em 3 volta\(s\).*TRUNCADO/s);
    // com folga, o mesmo laço junta as partes e devolve o arquivo inteiro
    let restantes = 2;
    globalThis.fetch = async (_url, opcoes) => {
      if (!String(opcoes.body ?? '').startsWith('[')) return new Response(Buffer.alloc(5120000), { status: 200 });
      return new Response(restantes-- > 0 ? ITSDOC_EXPORT : DELTA, { status: 200, headers: { 'content-type': 'text/xml' } });
    };
    const r = await atenderItsdoc(s, { corpo: ITSDOC_EXPORT }, { voltasMax: 40, arquivo: 'Z:\a.bin' });
    expect(r.partes).toBe(3);
    expect(r.conteudo.length).toBe(3 * 5120000);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

// ---------- ORDENAR o ALV (item 115) ----------
// Fixtures COPIADOS do delta da lista do RSPARAM no s4h 758/250, 06/09/2026
// (POC_webgui_btn40/medicoes/raw/a-00-lista.txt): os dois botões de sort da barra, com o ícone que
// os identifica (`s_b_srtu`/`s_b_srtd`) e o rótulo TRADUZIDO que não serve de âncora.
const BARRA_SORT = `<div draggable="false" id="M0:48::btn[28]" ct="B" lsdata='{"0":"Ordenar em ordem crescente","4":"Ordenar em ordem crescente","9":true,"11":"/sap/public/icmandir/its/ls/theming/Base/baseLib/sap_fiori_3/svg/libs/SAPGUI-icons.svg#s_b_srtu","17":"O","18":"CTRL_4","21":true,"25":"TOGGLE","27":{"SID":"wnd[0]/tbar[1]/btn[28]","Type":"GuiButton","SubType":"toolbar"},"30":"ICON"}' lsevents='{"Press":[{},{"1":"action/3","2":true,"3":true}]}' role="button" title="Ordenar&#x20;em&#x20;ordem&#x20;crescente" class="lsButton"></div>
<div draggable="false" id="M0:48::btn[40]" ct="B" lsdata='{"0":"Ordenar em ordem decrescente","4":"Ordenar em ordem decrescente","9":true,"11":"/sap/public/icmandir/its/ls/theming/Base/baseLib/sap_fiori_3/svg/libs/SAPGUI-icons.svg#s_b_srtd","17":"O","18":"CTRL_SHIFT_F4","21":true,"25":"TOGGLE","27":{"SID":"wnd[0]/tbar[1]/btn[40]","Type":"GuiButton","SubType":"toolbar"},"30":"ICON"}' lsevents='{"Press":[{},{"1":"action/3","2":true,"3":true}]}' role="button" title="Ordenar&#x20;em&#x20;ordem&#x20;decrescente" class="lsButton"></div>
<div draggable="false" id="M0:48::btn[43]" ct="B" lsdata='{"0":"Planilha eletrônica...","11":"/sap/public/icmandir/its/ls/theming/Base/baseLib/sap_fiori_3/svg/libs/SAPGUI-icons.svg#s_lisvie","18":"CTRL_SHIFT_F7","27":{"SID":"wnd[0]/tbar[1]/btn[43]","Type":"GuiButton","SubType":"toolbar"},"30":"ICON"}' role="button" title="Planilha&#x20;eletrônica..." class="lsButton"></div>`;

test('its: botaoDeOrdenacao acha o botão pelo ÍCONE, não pelo rótulo traduzido', () => {
  const brutos = controlesDoHtml(BARRA_SORT);
  expect(botaoDeOrdenacao(brutos, 'asc')).toEqual({
    sid: 'wnd[0]/tbar[1]/btn[28]', rotulo: 'Ordenar em ordem crescente', tecla: 'CTRL_4', icone: 's_b_srtu' });
  expect(botaoDeOrdenacao(brutos, 'desc')).toEqual({
    sid: 'wnd[0]/tbar[1]/btn[40]', rotulo: 'Ordenar em ordem decrescente', tecla: 'CTRL_SHIFT_F4', icone: 's_b_srtd' });
  // barra sem sort nenhum (só o botão de planilha) — informação, não erro
  expect(botaoDeOrdenacao(controlesDoHtml(BARRA_SORT.split('\n')[2]), 'asc')).toBe(null);
  expect(botaoDeOrdenacao([], 'asc')).toBe(null);
  expect(() => botaoDeOrdenacao(brutos, 'crescente')).toThrow(/'asc' ou 'desc'/);
});

test('its: batchOrdenar põe a MARCA da coluna e o botão no mesmo POST', () => {
  expect(batchOrdenar('wnd[0]/usr/cntlGRID1/shellcont/shell', [1], 'wnd[0]/tbar[1]/btn[40]')).toEqual([
    { post: 'action/46/wnd[0]/usr/cntlGRID1/shellcont/shell', content: 'columns=;1;' },
    { post: 'action/3/wnd[0]/tbar[1]/btn[40]' },
  ]);
  // vários critérios: a ordem da string não importa (é a das colunas na tela), mas o formato, sim
  expect(batchOrdenar('G', [2, 5], 'B')[0].content).toBe('columns=;2;5;');
});

test('its: indiceDaColuna aceita número 1-based e ColumnID, e recusa a coluna 0', () => {
  const cols = ['NAME', 'USER_VALUE', 'DEFAULT_VALUE', 'DEFAULT_USUBS_VALUE', 'DESCR'];
  expect(indiceDaColuna(cols, 1)).toBe(1);
  expect(indiceDaColuna(cols, 'DESCR')).toBe(5);
  expect(indiceDaColuna(cols, 'descr')).toBe(5);
  expect(() => indiceDaColuna(cols, 0)).toThrow(/1-based.*caixa de seleção/s);
  expect(() => indiceDaColuna(cols, 'BANANA')).toThrow(/não tem a coluna "BANANA".*NAME/s);
});
