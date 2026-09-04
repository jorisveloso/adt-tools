// its.test.mjs — a parte PURA da via HTTP do WebGUI: o shell, a leitura da resposta (delta ×
// multipart × logoff × 400), os SIDs tirados do lsdata, a resolução de alvo e os batches. Nada aqui
// toca a rede; o E2E é a POC do item 20 (sap-accelerate/work/POC_webgui_its_lib).
// Todo trecho bruto é COPIADO das respostas do s4h 758/250 de 04/09/2026
// (sap-accelerate/work/POC_webgui_okcode/medicoes/raw/*).
import { test, expect } from 'vitest';
import {
  OKCD, ESTADO, BOOT, ENTER, batchPreencher, batchAcionar, batchComandar, batchVkey,
  decodificarEntidades, cabecalhoDoShell, paramDe, passosDoMultipart, sidsDaResposta, lerResposta,
  sidDoAlvo, preencher, campos, botoes, sids,
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
