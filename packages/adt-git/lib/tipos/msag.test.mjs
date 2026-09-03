// tipos/msag.test.mjs — teste irmão de msag.mjs: contrato comum + o XML PROVADO por spike, byte a byte.
// Snapshot capturado do código anterior à migração para módulos (2026-08-28). Não "corrija" o snapshot
// para o teste passar — se o XML mudou, mudou a receita, e isso exige spike novo.
import { test, expect } from 'vitest';
import mod from './msag.mjs';
import { testesComuns, N, P, D } from './_teste.mjs';

testesComuns(mod);

test('msag: XML byte-idêntico ao snapshot do spike', () => {
  expect(mod.body(N, P, D, [{ no: '001', text: 'Texto com &1' }, { no: '002', text: 'Auto <x>', selfExplanatory: true }]), "body com 2 mensagens").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mc:messageClass xmlns:mc=\"http://www.sap.com/adt/MessageClass\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"MSAG/N\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/><mc:messages mc:msgno=\"001\" mc:msgtext=\"Texto com &amp;1\" mc:selfexplainatory=\"false\" mc:documented=\"false\" adtcore:name=\"\"/><mc:messages mc:msgno=\"002\" mc:msgtext=\"Auto &lt;x&gt;\" mc:selfexplainatory=\"true\" mc:documented=\"false\" adtcore:name=\"\"/></mc:messageClass>");
  expect(mod.body(N, P, D, []), "body do create (sem mensagens)").toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<mc:messageClass xmlns:mc=\"http://www.sap.com/adt/MessageClass\" xmlns:adtcore=\"http://www.sap.com/adt/core\" adtcore:name=\"ZX_SNAP\" adtcore:type=\"MSAG/N\" adtcore:description=\"Desc &amp; &lt;x&gt; &quot;y&quot;\" adtcore:masterLanguage=\"PT\"><adtcore:packageRef adtcore:name=\"$TMP\"/></mc:messageClass>");
});

test('msag: o body do exemplo carrega as mensagens; o do create vai vazio', () => {
  expect(mod.body(mod.exemplo.opts.name, P, D, mod.exemplo.opts.messages)).toContain('mc:msgno="001"');
  expect(mod.body(mod.exemplo.opts.name, P, D, [])).not.toContain('mc:msgno');
});
