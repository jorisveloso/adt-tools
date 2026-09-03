// cts.test.mjs — os parsers de change request, sem SAP.
//
// As fixtures são RESPOSTAS REAIS capturadas no S4H rel. 758 em 2026-08-29 (S4HK912769, a TR que o
// item 10 da fila deixou no sistema, e S4HK911417, uma TR liberada de classe), recortadas nos
// atributos que a lib lê. Ver docs/receita-change-request.md.
//
//   npm test

import { test, expect } from 'vitest';
import { parseRelease, liberarRequest, parseRequest, parseArvore, consolidar, fatiarTabkey, whereDaChave, familiaDe, paraHoraLocal, veredito, buildNovaRequestBody, buildDestravarSource, buildDesmancharSource, parseSaidaCts, buildCriarComTarefasSource, parseSaidaCriarRequest, requestDaListagemRfc, parseTrReadComm, listarRequestsPorRfc, inserirObjetosNaRequest, buildAcaoBody, mensagemDeAcao, parseChecklist, moverObjetos, reatribuirTarefa, trocarDonoRequest, fundirRequests, buildResumeBody, retomarLiberacao, travarObjetosNaRequest, buildEditorBody, parseLogAdt, editarRequest, trocarAlvoRequest, mudarTipoTarefa, removerObjetosDaRequest, mudarAtributoRequest, montarTabkey, buildObjectKeysBody, mensagensDoCheckrun, gravarChavesNaRequest, verificarChavesNaRequest, montarTabkeyString, ehTabelaString } from './cts.mjs';
import { dicaDeLeitura } from './rfc-soap.mjs';

// TR modificável: E071 da request VAZIA (nenhum `tm:abap_object` filho direto), o objeto mora na
// tarefa, e `tm:all_objects` é quem consolida.
const XML_MODIFICAVEL = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:object_type="R" adtcore:name="S4HK912769" adtcore:type="RQRQ" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"><tm:request tm:number="S4HK912769" tm:parent="" tm:owner="MVJVELOSO" tm:desc="Ordem gerada p/registro de modificações" tm:type="K" tm:status="D" tm:status_text="Modificável" tm:target="VSS" tm:cts_project="" tm:source_client="250" tm:lastchanged_timestamp="20260828233310" tm:uri="/sap/bc/adt/cts/transportrequests/S4HK912769"><tm:long_desc/><tm:all_objects><tm:abap_object tm:pgmid="R3TR" tm:type="DEVC" tm:name="YJBV_POC_PKGT" tm:wbtype="DEVC/K" tm:dummy_uri="/sap/bc/adt/cts/transportrequests/reference?obj_name=YJBV_POC_PKGT&amp;obj_wbtype=DEVC&amp;pgmid=R3TR" tm:obj_info="Pacote" tm:position="000001" tm:lock_status="X" tm:img_activity=""></tm:abap_object></tm:all_objects><tm:task tm:number="S4HK912770" tm:parent="S4HK912769" tm:owner="MVJVELOSO" tm:desc="Ordem gerada p/registro de modificações" tm:type="Entwicklung/Korrektur" tm:status="D" tm:status_text="Modificável" tm:target="" tm:source_client="250" tm:uri="/sap/bc/adt/cts/transportrequests/S4HK912770"><tm:long_desc/><tm:abap_object tm:pgmid="R3TR" tm:type="DEVC" tm:name="YJBV_POC_PKGT" tm:wbtype="DEVC/K" tm:obj_info="Pacote" tm:position="000001" tm:lock_status="X" tm:img_activity=""></tm:abap_object></tm:task></tm:request></tm:root>`;

// TR liberada: entradas PRÓPRIAS (com a marca CORR/RELE) + `tm:all_objects` + a tarefa. Os três
// lugares existem no mesmo documento e não têm o mesmo conteúdo.
const XML_LIBERADA = `<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"><tm:request tm:number="S4HK911417" tm:parent="" tm:owner="MVACOELHOMED" tm:desc="AGCM" tm:type="K" tm:status="R" tm:status_text="Liberado" tm:target="VSS" tm:source_client="250"><tm:long_desc/><tm:attributes tm:attribute="SAPCOMPONENT" tm:description="Componente"/><tm:abap_object tm:pgmid="CORR" tm:type="RELE" tm:name="S4HK911418 20260619 001703 MVACOELHOMED" tm:wbtype="" tm:obj_info="Entrada de comentário: liberação efetuada" tm:position="000001" tm:lock_status="3"></tm:abap_object><tm:abap_object tm:pgmid="LIMU" tm:type="METH" tm:name="ZCL_ALV_REPORTER              PREPARE_ALV_DATA" tm:wbtype="CLAS/OM" tm:obj_info="Método (objetos ABAP)" tm:position="000005" tm:lock_status="3"></tm:abap_object><tm:all_objects><tm:abap_object tm:pgmid="LIMU" tm:type="CLSD" tm:name="ZCL_ALV_REPORTER" tm:wbtype="CLAS/OC" tm:obj_info="Definição de classes" tm:position="000002" tm:lock_status="3"></tm:abap_object><tm:abap_object tm:pgmid="LIMU" tm:type="METH" tm:name="ZCL_ALV_REPORTER              PREPARE_ALV_DATA" tm:wbtype="CLAS/OM" tm:obj_info="Método (objetos ABAP)" tm:position="000005" tm:lock_status="3"></tm:abap_object></tm:all_objects><tm:task tm:number="S4HK911418" tm:parent="S4HK911417" tm:owner="MVACOELHOMED" tm:desc="AGCM" tm:type="Entwicklung/Korrektur" tm:status="R"><tm:long_desc/><tm:abap_object tm:pgmid="LIMU" tm:type="CLSD" tm:name="ZCL_ALV_REPORTER" tm:wbtype="CLAS/OC" tm:obj_info="Definição de classes" tm:position="000001" tm:lock_status="3"></tm:abap_object></tm:task></tm:request></tm:root>`;

const XML_ARVORE = `<?xml version="1.0" encoding="utf-8"?><tm:root adtcore:name="MVJVELOSO" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"><tm:workbench tm:category="Workbench"><tm:modifiable tm:status="Modificável"><tm:request tm:number="S4HK912769" tm:parent="" tm:owner="MVJVELOSO" tm:desc="Ordem gerada" tm:type="K" tm:status="D" tm:target="" tm:uri="/sap/bc/adt/vit/wb/object_type/rq/object_name/S4HK912769"><tm:long_desc/><tm:task tm:number="S4HK912770" tm:parent="S4HK912769" tm:owner="MVJVELOSO" tm:desc="Ordem gerada" tm:type="Entwicklung/Korrektur" tm:status="D"><tm:long_desc/></tm:task></tm:request><tm:request tm:number="S4HK912767" tm:parent="" tm:owner="MVJVELOSO" tm:desc="Outra" tm:type="K" tm:status="D"/></tm:modifiable></tm:workbench></tm:root>`;

const XML_ARVORE_VAZIA = `<?xml version="1.0" encoding="utf-8"?><tm:root adtcore:name="MVJVELOSO" xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:adtcore="http://www.sap.com/adt/core"/>`;

// ---------- request ----------

test('request modificável: o objeto vem do consolidado, não das entradas próprias', () => {
  const r = parseRequest(XML_MODIFICAVEL);
  expect(r.numero).toBe('S4HK912769');
  expect(r.tipo).toBe('K');
  expect(r.status).toBe('D');
  expect(r.statusTexto).toBe('Modificável');
  expect(r.dono).toBe('MVJVELOSO');
  expect(r.alvo).toBe('VSS');
  expect(r.mandanteOrigem).toBe('250');
  expect(r.descricao).toBe('Ordem gerada p/registro de modificações');
  expect(r.proprios).toEqual([]);           // a E071 da TR está vazia — é o estado antes da liberação
  expect(r.objetos).toEqual([{
    pgmid: 'R3TR', tipo: 'DEVC', nome: 'YJBV_POC_PKGT', wbtype: 'DEVC/K',
    descricaoTipo: 'Pacote', posicao: '000001', lock: 'X',
  }]);
  expect(r.tarefas.length).toBe(1);
  expect(r.tarefas[0].numero).toBe('S4HK912770');
  expect(r.tarefas[0].ehTarefa).toBe(true);
  expect(r.tarefas[0].pai).toBe('S4HK912769');
  expect(r.tarefas[0].objetos[0].nome).toBe('YJBV_POC_PKGT');
});

test('request liberada: os três lugares do XML são lidos separados', () => {
  const r = parseRequest(XML_LIBERADA);
  expect(r.proprios.map((o) => `${o.pgmid}/${o.tipo}`)).toEqual(['CORR/RELE', 'LIMU/METH']);
  expect(r.objetos.map((o) => `${o.pgmid}/${o.tipo}`)).toEqual(['LIMU/CLSD', 'LIMU/METH']);
  expect(r.tarefas[0].objetos.map((o) => o.tipo)).toEqual(['CLSD']);
  // a marca de liberação NÃO está no consolidado — só nas entradas próprias
  expect(r.objetos.some((o) => o.pgmid === 'CORR')).toBe(false);
  // `tm:attributes` não é entrada de objeto
  expect(r.proprios.length + r.objetos.length + r.tarefas[0].objetos.length).toBe(5);
});

test('LIMU/METH: o nome é a classe em 30 posições fixas + o método', () => {
  const meth = parseRequest(XML_LIBERADA).objetos.find((o) => o.tipo === 'METH');
  expect(meth.wbtype).toBe('CLAS/OM');
  expect(meth.nome.slice(0, 30).trimEnd()).toBe('ZCL_ALV_REPORTER');
  expect(meth.nome.slice(30)).toBe('PREPARE_ALV_DATA');
});

test('request sem <tm:request> devolve null (não estoura)', () => {
  expect(parseRequest('<?xml version="1.0"?><tm:root/>')).toBe(null);
});

// ---------- árvore ----------

test('árvore: requests planas, cada uma com suas tarefas', () => {
  const rs = parseArvore(XML_ARVORE);
  expect(rs.map((r) => r.numero)).toEqual(['S4HK912769', 'S4HK912767']);
  expect(rs[0].tarefas.map((t) => t.numero)).toEqual(['S4HK912770']);
  expect(rs[1].tarefas).toEqual([]);        // request sem tarefa vem auto-fechada
});

// Sem `requestStatus` na query o recurso devolve 200 com esta árvore — falha SILENCIOSA. O parser
// não pode inventar erro; quem avisa é a doc de `listarRequests`.
test('árvore vazia é lista vazia', () => {
  expect(parseArvore(XML_ARVORE_VAZIA)).toEqual([]);
});

// ---------- consolidação das tabelas ----------

test('consolidar: TR + tarefas sem repetir a mesma entrada', () => {
  const tr = { objetos: [], chaves: [] };
  const t1 = {
    objetos: [{ PGMID: 'R3TR', OBJECT: 'DEVC', OBJ_NAME: 'YJBV_POC_PKGT' }],
    chaves: [{ OBJECT: 'TABU', OBJNAME: 'T460T', TABKEY: '300D1411Z0' }],
  };
  const t2 = {
    objetos: [{ PGMID: 'R3TR', OBJECT: 'DEVC', OBJ_NAME: 'YJBV_POC_PKGT' }],
    chaves: [{ OBJECT: 'TABU', OBJNAME: 'T460T', TABKEY: '300E1411Z0' }],
  };
  const c = consolidar([tr, t1, t2]);
  expect(c.objetos.length).toBe(1);
  expect(c.chaves.map((k) => k.TABKEY)).toEqual(['300D1411Z0', '300E1411Z0']);
});

// ---------- a dica do RFC_READ_TABLE ----------

test('TABLE_WITHOUT_DATA com campos pedidos ganha a dica de nome de campo', () => {
  const e = dicaDeLeitura(new Error('RFC RFC_READ_TABLE falhou (SOAP Fault): TABLE_WITHOUT_DATA'), 'e071', ['TRKORR', 'GENFLAG']);
  expect(e.message).toContain('NÃO EXISTE em E071');
  expect(e.message).toContain('GENFLAG');
});

test('sem campos pedidos, TABLE_WITHOUT_DATA fica como está — aí a causa é outra', () => {
  const original = 'RFC RFC_READ_TABLE falhou (SOAP Fault): TABLE_WITHOUT_DATA';
  expect(dicaDeLeitura(new Error(original), 'E071', []).message).toBe(original);
});

// ---------- TABKEY fatiado (item 21) — layouts e TABKEYs REAIS do S4H 758, 2026-08-30 ----------

const T460T = [{ campo: 'MANDT', tipo: 'CLNT', leng: 3, pos: 1 }, { campo: 'SPRAS', tipo: 'LANG', leng: 1, pos: 2 }, { campo: 'WERKS', tipo: 'CHAR', leng: 4, pos: 3 }, { campo: 'SOBSL', tipo: 'CHAR', leng: 2, pos: 4 }];
const STLRES = [{ campo: 'MANDT', tipo: 'CLNT', leng: 3, pos: 1 }, { campo: 'REASON_TYPE', tipo: 'CHAR', leng: 10, pos: 2 }, { campo: 'REASON_CODE', tipo: 'NUMC', leng: 2, pos: 3 }];
const MGDEAM = [{ campo: 'MANDT', tipo: 'CLNT', leng: 3, pos: 1 }, { campo: 'SERVICE_ID', tipo: 'CHAR', leng: 40, pos: 2 }, { campo: 'USER_ROLE', tipo: 'CHAR', leng: 30, pos: 3 }, { campo: 'HOST_NAME', tipo: 'CHAR', leng: 120, pos: 4 }, { campo: 'SYSTEM_ALIAS', tipo: 'CHAR', leng: 16, pos: 5 }];
const FDT = [{ campo: 'ID', tipo: 'CHAR', leng: 32, pos: 1 }, { campo: 'VERSION', tipo: 'NUMC', leng: 6, pos: 2 }, { campo: 'LANGU', tipo: 'LANG', leng: 1, pos: 3 }];

test('fatiarTabkey: corte por LENG (caracteres) — T460T 000E000310 e a tabela de texto com padding', () => {
  const t = fatiarTabkey(T460T, '000E000310');
  expect(t.campos).toEqual({ MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' });
  expect(t).toMatchObject({ curinga: false, consumido: 10, sobra: '', truncado: false, completo: true });
  const s = fatiarTabkey(STLRES, '000APPROVE   02');
  expect(s.campos).toEqual({ MANDT: '000', REASON_TYPE: 'APPROVE   ', REASON_CODE: '02' });
  expect(s.completo).toBe(true);
  // o RFC_READ_TABLE devolve o TABKEY sem os espaços finais: o último campo vem curto, e ainda é completo
  const curto = fatiarTabkey([{ campo: 'MANDT', tipo: 'CLNT', leng: 3 }, { campo: 'TAB_NAME', tipo: 'CHAR', leng: 5 }], '000PPMT');
  expect(curto.campos).toEqual({ MANDT: '000', TAB_NAME: 'PPMT' }); expect(curto.completo).toBe(true);
});

test('fatiarTabkey: curinga * — prefixo + resto livre (null), mandante só, tudo', () => {
  const m = fatiarTabkey(MGDEAM, '250ZFPVCDS_RPRT_BASE_CONH_CDS_0001         *');
  expect(m.campos).toEqual({ MANDT: '250', SERVICE_ID: 'ZFPVCDS_RPRT_BASE_CONH_CDS_0001         ', USER_ROLE: null, HOST_NAME: null, SYSTEM_ALIAS: null });
  expect(m).toMatchObject({ curinga: true, consumido: 43, completo: false });
  const f = fatiarTabkey(FDT, '0000AAAB040000FFFFFFFFFFFFFFFFFF000000*');
  expect(f.campos).toEqual({ ID: '0000AAAB040000FFFFFFFFFFFFFFFFFF', VERSION: '000000', LANGU: null });
  expect(fatiarTabkey(T460T, '000*').campos).toEqual({ MANDT: '000', SPRAS: null, WERKS: null, SOBSL: null });
  expect(fatiarTabkey(T460T, '*').campos).toEqual({ MANDT: null, SPRAS: null, WERKS: null, SOBSL: null });
  // '*' no meio de um campo: o que vem antes é prefixo desse campo
  expect(fatiarTabkey(T460T, '000E00*').campos).toEqual({ MANDT: '000', SPRAS: 'E', WERKS: '00', SOBSL: null });
});

test('fatiarTabkey: TABKEY é CHAR 120 — chave maior sai truncada', () => {
  const layout = [{ campo: 'A', tipo: 'CHAR', leng: 100 }, { campo: 'B', tipo: 'CHAR', leng: 40 }];
  const t = fatiarTabkey(layout, 'x'.repeat(120));
  expect(t.truncado).toBe(true); expect(t.completo).toBe(false); expect(t.campos.B).toBe('x'.repeat(20));
  expect(fatiarTabkey(layout, 'x'.repeat(50)).truncado).toBe(false);
});

test('whereDaChave: sem mandante por default, com trim, sem campos curinga, ≤ 72 chars por linha', () => {
  expect(whereDaChave(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' })).toEqual(["SPRAS = 'E'", "AND WERKS = '0003'", "AND SOBSL = '10'"]);
  expect(whereDaChave(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' }, { mandante: true })[0]).toBe("MANDT = '000'");
  expect(whereDaChave(STLRES, { MANDT: '000', REASON_TYPE: 'APPROVE   ', REASON_CODE: '02' })).toEqual(["REASON_TYPE = 'APPROVE'", "AND REASON_CODE = '02'"]);
  expect(whereDaChave(MGDEAM, fatiarTabkey(MGDEAM, '250ZFPVCDS_RPRT_BASE_CONH_CDS_0001         *').campos)).toEqual(["SERVICE_ID = 'ZFPVCDS_RPRT_BASE_CONH_CDS_0001'"]);
  expect(whereDaChave(T460T, { MANDT: '000', SPRAS: null, WERKS: null, SOBSL: null })).toEqual([]);
  expect(whereDaChave([{ campo: 'X', tipo: 'CHAR', leng: 5 }], { X: "d'agua" })).toEqual(["X = 'd''agua'"]);
  expect(() => whereDaChave([{ campo: 'HOST_NAME', tipo: 'CHAR', leng: 120 }], { HOST_NAME: 'h'.repeat(70) })).toThrow(/72 caracteres/);
});

// ---------- diff "TR × sistema" (item 22) — as partes puras, com valores MEDIDOS no S4H 758 em 2026-08-30 ----------

test('familiaDe: parte de classe → a classe (nome posicional em 30 colunas, includes geradas com =)', () => {
  expect(familiaDe({ PGMID: 'LIMU', OBJECT: 'METH', OBJ_NAME: 'ZCL_ALV_REPORTER              PREPARE_ALV_DATA' }))
    .toEqual({ codigo: 'CLAS', nome: 'ZCL_ALV_REPORTER', conteudo: false });
  expect(familiaDe({ PGMID: 'LIMU', OBJECT: 'CINC', OBJ_NAME: 'ZCL_ALV_REPORTER==============CCAU' }).nome).toBe('ZCL_ALV_REPORTER');
  expect(familiaDe({ PGMID: 'LIMU', OBJECT: 'CPUB', OBJ_NAME: 'ZCL_ALV_REPORTER' }).codigo).toBe('CLAS');
  expect(familiaDe({ PGMID: 'LIMU', OBJECT: 'REPS', OBJ_NAME: 'ZTR_VALIDATOR' })).toEqual({ codigo: 'PROG', nome: 'ZTR_VALIDATOR', conteudo: false });
});

test('familiaDe: R3TR é a própria; conteúdo aponta o objeto de dicionário; CORR e FUNC não têm família', () => {
  expect(familiaDe({ PGMID: 'R3TR', OBJECT: 'CLAS', OBJ_NAME: 'ZCL_ALV_REPORTER ' })).toEqual({ codigo: 'CLAS', nome: 'ZCL_ALV_REPORTER', conteudo: false });
  expect(familiaDe({ PGMID: 'R3TR', OBJECT: 'VDAT', OBJ_NAME: 'V460A' })).toEqual({ codigo: 'VIEW', nome: 'V460A', conteudo: true });
  expect(familiaDe({ PGMID: 'R3TR', OBJECT: 'TABU', OBJ_NAME: 'T16FV' }).codigo).toBe('TABL');
  expect(familiaDe({ PGMID: 'R3TR', OBJECT: 'CDAT', OBJ_NAME: 'VC_TQSS1' }).codigo).toBe('VCLS');
  expect(familiaDe({ PGMID: 'CORR', OBJECT: 'RELE', OBJ_NAME: 'S4HK911418 20260619 001703 MVACOELHOMED' })).toBeNull();
  expect(familiaDe({ PGMID: 'LIMU', OBJECT: 'FUNC', OBJ_NAME: 'Z_FM' })).toBeNull();
});

test('paraHoraLocal: changedAt UTC do ADT → carimbo local do CTS (CET; medido contra REPOSRC UDAT/UTIME)', () => {
  expect(paraHoraLocal('2026-06-29T16:32:30Z', 'Europe/Berlin')).toBe('20260629183230');
  expect(paraHoraLocal('2026-06-13T22:00:00Z', 'Europe/Berlin')).toBe('20260614000000');   // pacote: só data
  expect(paraHoraLocal('2026-06-29T16:32:30Z', 'UTC')).toBe('20260629163230');
  expect(paraHoraLocal(null, 'Europe/Berlin')).toBeNull();
  expect(paraHoraLocal('2026-06-29T16:32:30Z', null)).toBeNull();                          // fuso desconhecido: sem comparação
});

test('veredito: a ordem dos sinais', () => {
  const base = { existe: true, familia: { codigo: 'CLAS', nome: 'X', conteudo: false }, versoes: { total: 3, depois: [], ativaDeOutra: false }, outrasTrs: [], depois: [], abertas: [], adt: null };
  expect(veredito(base)).toBe('igual');
  expect(veredito({ ...base, existe: false })).toBe('inexistente');
  expect(veredito({ ...base, abertas: [{ trkorr: 'S4HK911451' }] })).toBe('em-edicao');
  // versão NUMERADA posterior prova mudança; só o 00000 re-carimbado (transporte de cópias) não
  expect(veredito({ ...base, versoes: { total: 4, depois: [{ versno: '00004' }], ativaDeOutra: true } })).toBe('alterado-depois');
  expect(veredito({ ...base, versoes: { total: 2, depois: [], ativaDeOutra: true } })).toBe('noutra-tr-depois');
  expect(veredito({ ...base, depois: [{ trkorr: 'S4HK911429' }] })).toBe('noutra-tr-depois');
  expect(veredito({ ...base, adt: { alteradoDepois: true } })).toBe('alterado-depois');
  // conteúdo: a tabela existe, o juízo é por chave — ordem de customizing aberta não é "edição"
  expect(veredito({ ...base, familia: { codigo: 'VIEW', nome: 'V460A', conteudo: true }, abertas: [{ trkorr: 'S4HK910200' }] })).toBe('por-chave');
  expect(veredito({ pgmid: 'CORR', familia: null, existe: null, versoes: null, outrasTrs: [], depois: [], abertas: [] })).toBe('sem-medida');
});

// ---------- ciclo de vida da TR (item 24 — fixtures reais do S4H 758, 2026-08-31) ----------

test('buildNovaRequestBody: tm:root newrequest, com guard-rails', () => {
  const b = buildNovaRequestBody({ descricao: 'YJBV POC fila 24 - "aspas" & <tags>' });
  expect(b).toContain('tm:useraction="newrequest"');
  expect(b).toContain('tm:type="K"');
  expect(b).toContain('tm:target=""');
  expect(b).toContain('&quot;aspas&quot; &amp; &lt;tags>');
  expect(() => buildNovaRequestBody({})).toThrow(/descricao/);
  expect(() => buildNovaRequestBody({ descricao: 'x', tipo: 'W' })).toThrow(/GUARD-RAIL/);
});

// fila 72 (I63): o POST aceita <tm:task tm:owner> — a TR nasce COM tarefas, sem driver.
test('buildNovaRequestBody com usuarios: tm:task por usuário, uppercase e escape', () => {
  const b = buildNovaRequestBody({ descricao: 'POC 72', usuarios: ['mvjveloso', 'ME00083'] });
  expect(b).toContain('<tm:task tm:owner="MVJVELOSO"/>');
  expect(b).toContain('<tm:task tm:owner="ME00083"/>');
  expect(b).toContain('></tm:request>'); // com tarefas o request tem filhos…
  const semTarefa = buildNovaRequestBody({ descricao: 'POC 72' });
  expect(semTarefa).not.toContain('tm:task'); // …sem elas, o body é o de sempre (self-closing)
  expect(semTarefa).toContain('"/></tm:root>');
});

// A resposta REAL do POST (201) — o create devolve o tm:request completo, SEM tarefa: ela nasce no
// primeiro deploy com corrNr (medido: pacote transportável criou a tarefa na minha ordem).
const XML_CRIADA = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:useraction="newrequest" xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:request tm:number="S4HK912780" tm:parent="" tm:desc="YJBV POC fila 24 - apagar" tm:type="K" tm:target="" tm:target_desc="" tm:cts_project="" tm:cts_project_desc="" tm:uri="/sap/bc/adt/vit/wb/object_type/%20%20%20%20rq/object_name/S4HK912780"><tm:long_desc/></tm:request></tm:root>`;

test('parseRequest lê a resposta do create: número, sem tarefa, sem objetos', () => {
  const r = parseRequest(XML_CRIADA);
  expect(r.numero).toBe('S4HK912780');
  expect(r.descricao).toBe('YJBV POC fila 24 - apagar');
  expect(r.tarefas).toEqual([]);
  expect(r.objetos).toEqual([]);
});

test('drivers de CTS: unlock por tarefa, TR_DELETE_COMM sem diálogo, TRKORR validado', () => {
  const d = buildDesmancharSource('y_ctsd_s4hk912781', 'S4HK912781');
  expect(d).toContain("strkorr = 'S4HK912781'");
  expect(d).toContain("'TRINT_UNLOCK_COMM'");
  expect(d).toContain("'TR_DELETE_COMM'");
  expect(d).toContain("wi_dialog = ' '");
  expect(d).toContain('order_contains_locked_entries = 1');
  const u = buildDestravarSource('y_ctsd_x', 's4hk912781');       // minúsculas: sobe
  expect(u).toContain("'TRINT_UNLOCK_COMM'");
  expect(u).not.toContain('TR_DELETE_COMM');
  // o número entra em literal ABAP — forma errada recusa antes da rede
  expect(() => buildDesmancharSource('y', "X' . DELETE FROM e070")).toThrow(/GUARD-RAIL/);
  expect(() => buildDestravarSource('y', 'S4HK9127')).toThrow(/TRKORR/);
});

test('parseSaidaCts: a saída real dos drivers', () => {
  const p = parseSaidaCts('UNLOCK S4HK912782 subrc=0\nTR_DELETE subrc=0 SD 832 S4HK912781 tarefas=1\n');
  expect(p.unlocks).toEqual([{ tarefa: 'S4HK912782', subrc: 0 }]);
  expect(p.trDelete).toEqual({ subrc: 0, msg: 'SD 832 S4HK912781', tarefas: 1 });
  expect(parseSaidaCts('UNLOCK S4HK912782 subrc=0').trDelete).toBeNull();
});

// ---------- a via da SE09 (item 39) ----------

test('driver de criação: tipo, dono, tarefas por usuário e atributos entram no fonte', () => {
  const s = buildCriarComTarefasSource('y_cts39_criar', {
    descricao: 'POC fila 39', tipo: 'K', dono: 'MVJVELOSO',
    usuarios: ['mvjveloso', 'MVJNETO'],
    atributos: [{ atributo: 'sapnote', valor: '0002345678' }],
    alvo: 'vss',
  });
  expect(s).toContain("'TR_INSERT_REQUEST_WITH_TASKS'");
  expect(s).toContain("iv_type = 'K'");
  expect(s).toContain("iv_owner = 'MVJVELOSO'");
  expect(s).toContain("iv_target = 'VSS'");
  expect(s).toContain("( user = 'MVJVELOSO' )");
  expect(s).toContain("( user = 'MVJNETO' )");
  expect(s).toContain("( attribute = 'SAPNOTE' value = '0002345678' )");
  expect(s).toContain("iv_simulation = ''");
  expect(s).toContain('CTS39 REQ=');
});

test('driver de criação: simulação liga o dry-run do próprio FM', () => {
  const s = buildCriarComTarefasSource('y', { descricao: 'x', simular: true });
  expect(s).toContain("iv_simulation = 'X'");
  expect(s).not.toContain('lt_users = VALUE');   // sem usuários, sem a linha
});

test('driver de criação: guard-rails antes da rede', () => {
  expect(() => buildCriarComTarefasSource('y', { descricao: '  ' })).toThrow(/descricao/);
  expect(() => buildCriarComTarefasSource('y', { descricao: 'x', tipo: 'Z' })).toThrow(/GUARD-RAIL/);
  // SAPCORR imuniza a TR: com ele a request não se apaga nunca mais
  expect(() => buildCriarComTarefasSource('y', { descricao: 'x', atributos: [{ atributo: 'SAPCORR', valor: 'a' }] }))
    .toThrow(/IMUNIZA/);
  // a descrição entra em literal ABAP — apóstrofo é dobrado, não escapa do literal
  const s = buildCriarComTarefasSource('y', { descricao: "d'Ordem" });
  expect(s).toContain("iv_text = 'd''Ordem'");
});

test('parseSaidaCriarRequest: a saída real do driver', () => {
  const p = parseSaidaCriarRequest(
    'CTS39 REQ=S4HK912796 SUBRC=0 MSG=000  TASKS=2\n'
    + 'CTS39 TASK=S4HK912797 FUNC=X USER=MVJNETO\n'
    + 'CTS39 TASK=S4HK912798 FUNC=X USER=MVJVELOSO\n');
  expect(p.numero).toBe('S4HK912796');
  expect(p.subrc).toBe(0);
  expect(p.tarefas).toEqual([
    { numero: 'S4HK912797', tipo: 'X', usuario: 'MVJNETO' },
    { numero: 'S4HK912798', tipo: 'X', usuario: 'MVJVELOSO' },
  ]);
  // simulação: subrc 0, número vazio, nada gravado
  const sim = parseSaidaCriarRequest('CTS39 REQ= SUBRC=0 MSG=000  TASKS=0');
  expect(sim.numero).toBe('');
  expect(sim.subrc).toBe(0);
  // usuário inexistente: o FM recusa com TR 809 (e deixa a ordem órfã — daí o guard-rail)
  const erro = parseSaidaCriarRequest('CTS39 REQ= SUBRC=1 MSG=TR809 YJBVFAKE39 TASKS=0');
  expect(erro.subrc).toBe(1);
  expect(erro.mensagem).toBe('TR809 YJBVFAKE39');
});

// ---------- leitura por SOAP puro (item 71 — fixtures do S4H 758, 2026-09-02) ----------

test('requestDaListagemRfc: a linha do ET_REQUESTS vira o cabeçalho da lib', () => {
  const r = requestDaListagemRfc({
    REQ_ID: 'S4HK912769', TEXT: 'Ordem gerada p/registro de modificações', TYPE: 'K', STATUS: 'D',
    TARGET: 'VSS', AUTHOR: 'MVJVELOSO', CHANGEDATE: '2026-08-28', CHANGETIME: '23:33:10', SRC_CLIENT: '250',
  });
  expect(r).toEqual({
    numero: 'S4HK912769', descricao: 'Ordem gerada p/registro de modificações', tipo: 'K', status: 'D',
    alvo: 'VSS', dono: 'MVJVELOSO', mandanteOrigem: '250', alteradoEm: '2026-08-28 23:33:10',
  });
  // linha vazia não explode — campos em branco
  expect(requestDaListagemRfc({}).numero).toBe('');
  expect(requestDaListagemRfc({}).alteradoEm).toBe('');
});

// resposta REAL do TR_READ_COMM (S4HK912728, recortada): estruturas exportadas + tabelas <item>
const XML_TR_READ_COMM = `<?xml version="1.0"?><SOAP-ENV:Envelope><SOAP-ENV:Body><urn:TR_READ_COMM.Response>
<WE_E070><TRKORR>S4HK912728</TRKORR><TRFUNCTION>K</TRFUNCTION><TRSTATUS>D</TRSTATUS><TARSYSTEM>VSS</TARSYSTEM><AS4USER>MVFPIVA</AS4USER><AS4DATE>2026-08-26</AS4DATE><AS4TIME>14:09:50</AS4TIME><STRKORR></STRKORR></WE_E070>
<WE_E07T><TRKORR>S4HK912728</TRKORR><LANGU></LANGU><AS4TEXT>Treinamento Fiori Elements</AS4TEXT></WE_E07T>
<WE_E070C><TRKORR>S4HK912728</TRKORR><CLIENT>250</CLIENT></WE_E070C>
<WT_E071><item><TRKORR>S4HK912728</TRKORR><PGMID>R3TR</PGMID><OBJECT>TABU</OBJECT><OBJ_NAME>/IWFND/C_MGDEAM</OBJ_NAME><LOCKFLAG></LOCKFLAG></item></WT_E071>
<WT_E071K><item><TRKORR>S4HK912728</TRKORR><PGMID>R3TR</PGMID><OBJECT>TABU</OBJECT><OBJNAME>/IWFND/C_MGDEAM</OBJNAME><TABKEY>250ZFPVCDS_RPRT_BASE_CONH_CDS_0001         *</TABKEY></item></WT_E071K>
<ET_E070A><item><TRKORR>S4HK912728</TRKORR><POS>000001</POS><ATTRIBUTE>SAPCORR</ATTRIBUTE><REFERENCE>POC39</REFERENCE></item></ET_E070A>
</urn:TR_READ_COMM.Response></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

test('parseTrReadComm: uma chamada traz cabeçalho, texto, objetos, chaves e atributos', () => {
  const r = parseTrReadComm(XML_TR_READ_COMM);
  expect(r.numero).toBe('S4HK912728');
  expect(r.cabecalho.TRSTATUS).toBe('D');
  expect(r.cabecalho.AS4USER).toBe('MVFPIVA');
  expect(r.descricao).toBe('Treinamento Fiori Elements');
  expect(r.mandante.CLIENT).toBe('250');
  expect(r.objetos).toHaveLength(1);
  expect(r.objetos[0].OBJ_NAME).toBe('/IWFND/C_MGDEAM');
  expect(r.chaves[0].TABKEY).toBe('250ZFPVCDS_RPRT_BASE_CONH_CDS_0001         *');
  expect(r.atributos).toEqual([{ posicao: '000001', atributo: 'SAPCORR', valor: 'POC39' }]);
  // o consolidar() da via tabelas aceita este shape sem tradução
  const c = consolidar([{ ...r, tarefas: [] }]);
  expect(c.objetos).toHaveLength(1);
  expect(c.chaves).toHaveLength(1);
});

test('parseTrReadComm: resposta sem as tabelas no envelope = vazio silencioso (o gotcha do canal)', () => {
  const semTabelas = XML_TR_READ_COMM.replace(/<WT_E071>[\s\S]*?<\/WT_E071>/, '')
    .replace(/<WT_E071K>[\s\S]*?<\/WT_E071K>/, '').replace(/<ET_E070A>[\s\S]*?<\/ET_E070A>/, '');
  const r = parseTrReadComm(semTabelas);
  expect(r.objetos).toEqual([]);      // por isso as chamadas da lib SEMPRE mandam as tabelas vazias
  expect(r.chaves).toEqual([]);
  expect(r.atributos).toEqual([]);
});

test('listarRequestsPorRfc: status fora de A/C/R é recusado ANTES da rede', async () => {
  await expect(listarRequestsPorRfc({}, { status: 'D' })).rejects.toThrow(/GUARD-RAIL.*'D'/s);
  await expect(listarRequestsPorRfc({}, { tipo: 'Z' })).rejects.toThrow(/GUARD-RAIL/);
});

// ---------- liberar (item 74 — fixtures REAIS do S4H 758, 2026-09-02) ----------

// Sucesso: chkrun 'released' + timestamp preenchido. O statusText diz "foi INICIADA" — assíncrono.
const XML_RELEASE_OK = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:useraction="newreleasejobs" tm:releasetimestamp="20260902145500 " tm:number="S4HK912859" xmlns:tm="http://www.sap.com/cts/adt/tm"><atom:link href="/sap/bc/adt/cts/transportrequests/S4HK912859/displayatcfindings" rel="http://www.sap.com/cts/relations/displayatcfindings" type="application/xml" title="Diplay ATC Findings" xmlns:atom="http://www.w3.org/2005/Atom"/><tm:releasereports><chkrun:checkReport chkrun:reporter="transportrelease" chkrun:triggeringUri="/sap/bc/adt/cts/transportrequests/S4HK912859" chkrun:status="released" chkrun:statusText="Liberação para ordem/tarefa S4HK912859 foi iniciada" xmlns:chkrun="http://www.sap.com/adt/checkrun"/></tm:releasereports></tm:root>`;

// Falha em HTTP 200: tarefa vazia (TK 494). O veredito mora no chkrun, nunca no status HTTP.
const XML_RELEASE_TAREFA_VAZIA = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:useraction="newreleasejobs" tm:releasetimestamp="0 " tm:number="S4HK912860" xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:releasereports><chkrun:checkReport chkrun:reporter="transportrelease" chkrun:triggeringUri="/sap/bc/adt/cts/transportrequests/S4HK912860" chkrun:status="abortrelapifail" chkrun:statusText="Transportauftrag/Aufgabe S4HK912860 konnte nicht freigegeben werden.. Siehe Problemansicht." xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkMessageList><chkrun:checkMessage chkrun:uri="/sap/bc/adt/cts/transportrequests/S4HK912860" chkrun:type="E" chkrun:shortText="Tarefa S4HK912860 é não classificada (liberação não é possível)"><atom:link href="/sap/bc/adt/messageclass/TK/messages/494/longtext?language=P&amp;msgv1=S4HK912860" rel="http://www.sap.com/adt/relations/longtext" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/></chkrun:checkMessage></chkrun:checkMessageList></chkrun:checkReport></tm:releasereports></tm:root>`;

// Legado `releasejobs`: NÃO libera — devolve a URI da tela do SAP GUI, sem releasereports.
const XML_RELEASE_LEGADO = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:useraction="releasejobs" tm:number="S4HK912857" tm:uri="/sap/bc/adt/vit/tm/releasejobs/S4HK912857?tmNavigationId=20260902175418" xmlns:tm="http://www.sap.com/cts/adt/tm"/>`;

test('parseRelease: sucesso — released com timestamp; o texto diz "iniciada" (assíncrono)', () => {
  const r = parseRelease(XML_RELEASE_OK);
  expect(r.numero).toBe('S4HK912859');
  expect(r.acao).toBe('newreleasejobs');
  expect(r.liberado).toBe(true);
  expect(r.timestamp).toBe('20260902145500');
  expect(r.relatorios).toHaveLength(1);
  expect(r.relatorios[0].status).toBe('released');
  expect(r.erros).toEqual([]);
});

test('parseRelease: falha vem em HTTP 200 — o chkrun decide (tarefa vazia, TK 494)', () => {
  const r = parseRelease(XML_RELEASE_TAREFA_VAZIA);
  expect(r.liberado).toBe(false);
  expect(r.timestamp).toBe('0');
  expect(r.relatorios[0].status).toBe('abortrelapifail');
  expect(r.erros).toEqual(['Tarefa S4HK912860 é não classificada (liberação não é possível)']);
});

test('parseRelease: releasejobs legado não tem releasereports — nunca conta como liberado', () => {
  const r = parseRelease(XML_RELEASE_LEGADO);
  expect(r.acao).toBe('releasejobs');
  expect(r.liberado).toBe(false);
  expect(r.relatorios).toEqual([]);
});

test('liberarRequest: guard-rails antes da rede — confirm e forma de TRKORR', async () => {
  await expect(liberarRequest({ cfg: {} }, 'S4HK912859')).rejects.toThrow(/GUARD-RAIL.*PERMANENTE/s);
  await expect(liberarRequest({ cfg: {} }, 'lixo', { confirm: true })).rejects.toThrow(/GUARD-RAIL.*TRKORR/s);
});

// ---------- interrupção e retomada do release (item 77 — fixtures REAIS do S4H 758, 2026-09-02) ----------

// Interrupção por lock: a TR-C continha um objeto travado noutra TR. HTTP 200, E070 segue 'D' — o
// chkrun responde a AÇÃO de retomada como status, e o tm:root traz o user_action a reenviar.
// (o checkMessageList real, com a message E do objeto, foi omitido da fixture.)
const XML_RELEASE_INTERROMPIDO = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:useraction="newreleasejobs" tm:releasetimestamp="20260902174117 " tm:releaseobjlock="yes" tm:number="S4HK912911" xmlns:tm="http://www.sap.com/cts/adt/tm"><atom:link href="/sap/bc/adt/cts/transportrequests/S4HK912911/displayatcfindings" rel="http://www.sap.com/cts/relations/displayatcfindings" type="application/xml" title="Diplay ATC Findings" xmlns:atom="http://www.w3.org/2005/Atom"/><tm:releasereports><chkrun:checkReport chkrun:reporter="transportrelease" chkrun:triggeringUri="/sap/bc/adt/cts/transportrequests/S4HK912911" chkrun:status="relwithignlock" chkrun:statusText="Nicht alle Objekte im Auftrag konnten gesperrt werden. Möchten Sie sie dennoch freigeben?" xmlns:chkrun="http://www.sap.com/adt/checkrun"/></tm:releasereports></tm:root>`;

// relObjigchkatc sem o releasetimestamp da interrupção: o servidor recusa com status `relobjchkobs`
// ("verificações obsoletas — recomece") — o timestamp é o lock otimista das verificações.
const XML_RELEASE_CHECKS_OBSOLETOS = `<?xml version="1.0" encoding="utf-8"?><tm:root tm:useraction="relObjigchkatc" tm:releasetimestamp="0 " tm:releaseobjlock="yes" tm:number="S4HK912910" xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:releasereports><chkrun:checkReport chkrun:reporter="transportrelease" chkrun:triggeringUri="/sap/bc/adt/cts/transportrequests/S4HK912910" chkrun:status="relobjchkobs" chkrun:statusText="Transportauftrag/Aufgabe S4HK912910 konnte nicht freigegeben werden. Grund: Veraltete Objektprüfungen. Starten Sie die Freigabe erneut." xmlns:chkrun="http://www.sap.com/adt/checkrun"/></tm:releasereports></tm:root>`;

test('parseRelease: interrupção por lock — `retomar` traz a ação e o user_action a reenviar', () => {
  const r = parseRelease(XML_RELEASE_INTERROMPIDO);
  expect(r.liberado).toBe(false);
  expect(r.retomar).toEqual({
    acao: 'relwithignlock',
    releasetimestamp: '20260902174117',
    releaseobjlock: 'yes',
    pergunta: 'Nicht alle Objekte im Auftrag konnten gesperrt werden. Möchten Sie sie dennoch freigeben?',
  });
  // o sucesso e o aborto NÃO são retomáveis
  expect(parseRelease(XML_RELEASE_OK).retomar).toBeNull();
  expect(parseRelease(XML_RELEASE_TAREFA_VAZIA).retomar).toBeNull();
});

test('parseRelease: relObjigchkatc sem timestamp → status relobjchkobs ("recomece"), retomável', () => {
  const r = parseRelease(XML_RELEASE_CHECKS_OBSOLETOS);
  expect(r.liberado).toBe(false);
  expect(r.retomar?.acao).toBe('relobjchkobs');
  expect(r.retomar?.pergunta).toContain('Veraltete Objektprüfungen');
});

test('buildResumeBody: o user_action reenviado — releaseobjlock e timestamp só quando existem', () => {
  expect(buildResumeBody('relwithignlock', 's4hk912911', { releasetimestamp: '20260902174117 ', releaseobjlock: 'yes' }))
    .toBe('<?xml version="1.0" encoding="UTF-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="relwithignlock" tm:number="S4HK912911" tm:releaseobjlock="yes" tm:releasetimestamp="20260902174117"/>');
  // timestamp '0' (o "não liberou" do servidor) não é reenviado
  expect(buildResumeBody('relwithignwarning', 'S4HK912910', { releasetimestamp: '0 ' }))
    .toBe('<?xml version="1.0" encoding="UTF-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="relwithignwarning" tm:number="S4HK912910"/>');
});

test('retomarLiberacao: guard-rails antes da rede — ação (a CAIXA importa) e confirm', async () => {
  // relObjigchkatc é camelCase na URL — minúsculo o servidor recusa com 400 (medido), a lib recusa antes
  await expect(retomarLiberacao({ cfg: {} }, 'S4HK912911', { acao: 'relobjigchkatc', confirm: true }))
    .rejects.toThrow(/GUARD-RAIL.*camelCase/s);
  await expect(retomarLiberacao({ cfg: {} }, 'S4HK912911', { acao: 'newreleasejobs', confirm: true }))
    .rejects.toThrow(/GUARD-RAIL.*não é retomada/s);
  await expect(retomarLiberacao({ cfg: {} }, 'S4HK912911', { acao: 'relwithignlock' }))
    .rejects.toThrow(/GUARD-RAIL.*confirm/s);
  await expect(retomarLiberacao({ cfg: {} }, 'lixo', { acao: 'relwithignlock', confirm: true }))
    .rejects.toThrow(/GUARD-RAIL.*TRKORR/s);
});

test('travarObjetosNaRequest: guard-rails antes da rede — forma do TRKORR, lista e { tipo, nome }', async () => {
  await expect(travarObjetosNaRequest({ cfg: {} }, 'lixo', [{ tipo: 'PROG', nome: 'YX' }])).rejects.toThrow(/GUARD-RAIL.*TRKORR/s);
  await expect(travarObjetosNaRequest({ cfg: {} }, 'S4HK912910', [])).rejects.toThrow(/GUARD-RAIL.*vazia/s);
  await expect(travarObjetosNaRequest({ cfg: {} }, 'S4HK912910', [{ tipo: 'PROG' }])).rejects.toThrow(/GUARD-RAIL.*tipo, nome/s);
});

// ---------- inserir objeto na ordem (item 75 — TR_EXT_INSERT_IN_REQUEST) ----------

test('inserirObjetosNaRequest: guard-rails antes da rede — forma do TRKORR, lista, objeto Z/Y', async () => {
  await expect(inserirObjetosNaRequest({}, 'lixo', [{ tipo: 'PROG', nome: 'YX' }])).rejects.toThrow(/GUARD-RAIL.*TRKORR/s);
  await expect(inserirObjetosNaRequest({}, 'S4HK912879', [])).rejects.toThrow(/GUARD-RAIL.*vazia/s);
  await expect(inserirObjetosNaRequest({}, 'S4HK912879', [{ tipo: 'PROG' }])).rejects.toThrow(/GUARD-RAIL.*tipo, nome/s);
  await expect(inserirObjetosNaRequest({}, 'S4HK912879', [{ nome: 'YX' }])).rejects.toThrow(/GUARD-RAIL.*tipo, nome/s);
  // efeito sobre terceiros: só objeto Z/Y entra numa ordem pela lib (risco nomeado na I64)
  await expect(inserirObjetosNaRequest({}, 'S4HK912879', [{ tipo: 'PROG', nome: 'RSUSR000' }])).rejects.toThrow(/GUARD-RAIL.*Z\/Y/s);
});

// ---------- as demais useractions (item 76 — fixtures REAIS do S4H 758, 2026-09-02) ----------

test('buildAcaoBody: os quatro formatos do contrato da ST_CTS_ADT_TM_MAIN', () => {
  // tasks: o usuário vai em @tm:targetuser (user_action.user na ST)
  expect(buildAcaoBody('tasks', { usuario: 'me00083' }))
    .toBe('<?xml version="1.0" encoding="UTF-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="tasks" tm:targetuser="ME00083"/>');
  // reassign/merge: o alvo vai em @tm:number (user_action.number)
  expect(buildAcaoBody('reassign', { numero: 's4hk912901' })).toContain('tm:useraction="reassign" tm:number="S4HK912901"');
  // moveobjects: alvo + <tm:abap_object> filhos de <tm:request>
  const move = buildAcaoBody('moveobjects', { numero: 'S4HK912901', objetos: [{ tipo: 'prog', nome: 'y_teste' }] });
  expect(move).toContain('tm:number="S4HK912901"><tm:request>');
  expect(move).toContain('<tm:abap_object tm:pgmid="R3TR" tm:type="PROG" tm:name="Y_TESTE"/></tm:request></tm:root>');
  // sem nada: tm:root vazio (o corpo do que não leva parâmetro)
  expect(buildAcaoBody('sortandcompress')).toMatch(/tm:useraction="sortandcompress"\/>$/);
});

test('mensagemDeAcao: extrai o <message> do exc:exception — os três erros medidos', () => {
  const excecao = (msg) => `<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><namespace id="com.sap.adt.tm"/><type id="ADT_TM_COMMON_EXCEPTION"/><message lang="PT">${msg}</message></exc:exception>`;
  // moveobjects ordem→tarefa (o servidor exige "mesmo tipo")
  expect(mensagemDeAcao(excecao('O objeto só pode ser deslocado em uma ordem do mesmo tipo')))
    .toBe('O objeto só pode ser deslocado em uma ordem do mesmo tipo');
  // o nome errado da ação (a hipótese da I95): "reassigntask" não existe, o certo é "reassign"
  expect(mensagemDeAcao(excecao('Benutzeraktion reassigntask wird nicht unterstützt')))
    .toContain('nicht unterstützt');
  // reassign de uma ORDEM (só tarefa se reatribui)
  expect(mensagemDeAcao(excecao('Entrar uma tarefa'))).toBe('Entrar uma tarefa');
});

// consistencychecks devolve chkl:messages — fixture real (flagrou objeto travado noutra TR)
const XML_CHECKLIST = `<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><msg objDescr=" (Programa)" type="E" line="2" href="" forceSupported="true"><shortText><txt>YDL_002_MVVMENDONCA está bloqueado em ordem/na tarefa S4HK912531</txt></shortText></msg></chkl:messages>`;

test('parseChecklist: as mensagens do consistencychecks, com tipo e texto', () => {
  const m = parseChecklist(XML_CHECKLIST);
  expect(m).toHaveLength(1);
  expect(m[0].tipo).toBe('E');
  expect(m[0].texto).toBe('YDL_002_MVVMENDONCA está bloqueado em ordem/na tarefa S4HK912531');
  expect(parseChecklist('<chkl:messages/>')).toEqual([]);
});

test('useractions: guard-rails antes da rede — forma, lista, mesma TR, confirm', async () => {
  await expect(moverObjetos({ cfg: {} }, 'lixo', 'S4HK912901', [{ tipo: 'PROG', nome: 'YX' }])).rejects.toThrow(/GUARD-RAIL.*TRKORR/s);
  await expect(moverObjetos({ cfg: {} }, 'S4HK912899', 'S4HK912899', [{ tipo: 'PROG', nome: 'YX' }])).rejects.toThrow(/GUARD-RAIL.*mesma TR/s);
  await expect(moverObjetos({ cfg: {} }, 'S4HK912899', 'S4HK912901', [])).rejects.toThrow(/GUARD-RAIL.*vazia/s);
  await expect(moverObjetos({ cfg: {} }, 'S4HK912899', 'S4HK912901', [{ tipo: 'PROG' }])).rejects.toThrow(/GUARD-RAIL.*tipo, nome/s);
  await expect(reatribuirTarefa({ cfg: {} }, 'lixo', 'S4HK912901')).rejects.toThrow(/GUARD-RAIL.*TRKORR/s);
  // dono trocado = TR fora do alcance da lib; fusão apaga a origem — os dois exigem confirm
  await expect(trocarDonoRequest({ cfg: {} }, 'S4HK912902', 'ME00083')).rejects.toThrow(/GUARD-RAIL.*confirm/s);
  await expect(trocarDonoRequest({ cfg: {} }, 'S4HK912902', '', { confirm: true })).rejects.toThrow(/GUARD-RAIL.*usuario/s);
  await expect(fundirRequests({ cfg: {} }, 'S4HK912899', 'S4HK912901')).rejects.toThrow(/GUARD-RAIL.*confirm/s);
  await expect(fundirRequests({ cfg: {} }, 'S4HK912899', 'S4HK912899', { confirm: true })).rejects.toThrow(/GUARD-RAIL.*mesma TR/s);
});

// ---------- o editor de TR (item 78 / I97) ----------

test('buildEditorBody: SAVE — número no request (não no root), desc + long_desc + alvo + projeto', () => {
  const b = buildEditorBody(undefined, { numero: 's4hk912922', descricao: 'Editada & <ok>', descricaoLonga: 'linha um\nlinha dois', alvo: 'vss', projeto: 'S4H_P00005' });
  expect(b).not.toContain('tm:useraction');
  expect(b).toContain('<tm:request tm:number="S4HK912922" tm:desc="Editada &amp; &lt;ok>" tm:target="VSS" tm:cts_project="S4H_P00005">');
  expect(b).toContain('<tm:long_desc><tm:long_desc_line tm:long_desc_text="linha um"/><tm:long_desc_line tm:long_desc_text="linha dois"/></tm:long_desc>');
  // remover projeto: o atributo vai VAZIO de propósito (o save do SAP apaga o que falta — medido)
  expect(buildEditorBody(undefined, { numero: 'S4HK912922', descricao: 'X', alvo: '', projeto: '' }))
    .toContain('tm:desc="X" tm:target="" tm:cts_project=""');
});

test('buildEditorBody: ações — número no ROOT (user_action.number), corpo conforme a ação', () => {
  expect(buildEditorBody('changetarget', { numero: 'S4HK912922', alvo: 'VSS' }))
    .toContain('tm:useraction="changetarget" tm:number="S4HK912922"><tm:request tm:target="VSS"/></tm:root>');
  expect(buildEditorBody('protect', { numero: 'S4HK912922' })).toMatch(/tm:useraction="protect" tm:number="S4HK912922"\/>$/);
  expect(buildEditorBody('changetasktype', { numero: 'S4HK912923', tipoTarefa: 'r' }))
    .toContain('><tm:task tm:type="R"/></tm:root>');
  expect(buildEditorBody('modifyattribute', { numero: 'S4HK912924', atributo: { nome: 'sapcomponent', valor: 'BC-CTS-ORG', posicao: '000001' } }))
    .toContain('<tm:attributes tm:attribute="SAPCOMPONENT" tm:value="BC-CTS-ORG" tm:position="000001"/>');
  // removeobject: a position é OBRIGATÓRIA de fato (sem ela o servidor responde 200 e não remove — medido)
  expect(buildEditorBody('removeobject', { numero: 'S4HK912926', objetos: [{ tipo: 'devc', nome: 'yjbv_poc78_pkg', position: '000001' }] }))
    .toContain('<tm:abap_object tm:pgmid="R3TR" tm:type="DEVC" tm:name="YJBV_POC78_PKG" tm:position="000001"/>');
});

// actionlogs real (recortado): log:log com entries aninháveis — o parser lê id/severity/key/texto
const XML_LOG = `<?xml version="1.0" encoding="utf-8"?><log:log xmlns:log="http://www.sap.com/adt/logs/"><log:type>LOG_TYPE_ACT_DDIC</log:type><log:name/><log:entry id="000001" severity="information"><log:message><log:messageText language="" key="TO(009)">====</log:messageText></log:message></log:entry><log:entry id="000002" severity="information"><log:message><log:messageText language="" key="TK(191)">02.09.2026 log de a&#231;&#227;o para ordem</log:messageText></log:message></log:entry></log:log>`;

test('parseLogAdt: entradas do actionlogs/transportlogs, com severidade e chave T100', () => {
  const e = parseLogAdt(XML_LOG);
  expect(e).toHaveLength(2);
  expect(e[0]).toEqual({ id: '000001', severidade: 'information', chave: 'TO(009)', texto: '====' });
  expect(e[1].chave).toBe('TK(191)');
  expect(e[1].texto).toContain('log de ação');
  expect(parseLogAdt('<log:log/>')).toEqual([]);
});

test('editor: guard-rails antes da rede — nada a editar, alvo vazio, tipo de tarefa, lista vazia', async () => {
  await expect(editarRequest({ cfg: {} }, 'S4HK912922')).rejects.toThrow(/GUARD-RAIL.*nada para editar/s);
  await expect(trocarAlvoRequest({ cfg: {} }, 'S4HK912922', '')).rejects.toThrow(/GUARD-RAIL.*alvo vazio/s);
  await expect(mudarTipoTarefa({ cfg: {} }, 'S4HK912923', 'Z')).rejects.toThrow(/GUARD-RAIL.*tipo/s);
  await expect(removerObjetosDaRequest({ cfg: {} }, 'S4HK912926', [])).rejects.toThrow(/GUARD-RAIL.*vazia/s);
  await expect(removerObjetosDaRequest({ cfg: {} }, 'S4HK912926', [{ tipo: 'DEVC' }])).rejects.toThrow(/GUARD-RAIL.*tipo, nome/s);
  // modifyattribute passa pelo mesmo guard de imunizantes do gravarAtributo
  await expect(mudarAtributoRequest({ cfg: {} }, 'S4HK912924', { atributo: 'SAPCORR', valor: 'X' })).rejects.toThrow(/GUARD-RAIL.*IMUNIZA/s);
});

// ---------- objectkeys — o Object Key Editor (item 79, S4H 758, 2026-09-02) ----------

test('montarTabkey: o inverso do fatiar — roundtrip nos layouts reais, NUMC com zeros, chave minúscula', () => {
  expect(montarTabkey(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' })).toBe('000E000310');
  expect(fatiarTabkey(T460T, montarTabkey(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' })).campos)
    .toEqual({ MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' });
  // NUMC completa com zeros à ESQUERDA; CHAR com espaço à direita (e o padding interno fica)
  expect(montarTabkey(STLRES, { mandt: '000', reason_type: 'APPROVE', reason_code: '2' })).toBe('000APPROVE   02');
  // espaços FINAIS saem (o SAP guarda '250BR', medido) — mas o padding interno não
  expect(montarTabkey([{ campo: 'MANDT', tipo: 'CLNT', leng: 3 }, { campo: 'LAND1', tipo: 'CHAR', leng: 3 }], { MANDT: '250', LAND1: 'BR' })).toBe('250BR');
});

test('montarTabkey: curinga * encerra a chave como prefixo — e o fatiar aceita de volta', () => {
  expect(montarTabkey(T460T, { MANDT: '000', SPRAS: '*' })).toBe('000*');
  expect(montarTabkey(T460T, { MANDT: '*' })).toBe('*');
  // prefixo DENTRO do campo — a mesma forma que o fatiar lê em '000E00*'
  expect(montarTabkey(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '00*' })).toBe('000E00*');
  expect(fatiarTabkey(T460T, montarTabkey(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '00*' })).campos).toEqual({ MANDT: '000', SPRAS: 'E', WERKS: '00', SOBSL: null });
  expect(() => montarTabkey(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '0*3' })).toThrow(/'\*' só vale no FIM/);
  const tk = montarTabkey(MGDEAM, { MANDT: '250', SERVICE_ID: 'ZFPVCDS_RPRT_BASE_CONH_CDS_0001', USER_ROLE: '*' });
  expect(fatiarTabkey(MGDEAM, tk).campos.SERVICE_ID).toBe('ZFPVCDS_RPRT_BASE_CONH_CDS_0001         ');
});

test('montarTabkey: recusas — campo faltando sem curinga, valor largo demais, campo fora do layout', () => {
  expect(() => montarTabkey(T460T, { MANDT: '000', SPRAS: 'E' })).toThrow(/falta o campo WERKS/);
  expect(() => montarTabkey(T460T, { MANDT: '0000', SPRAS: 'E', WERKS: '0003', SOBSL: '10' })).toThrow(/passa da largura 3/);
  expect(() => montarTabkey(T460T, { MANDT: '000', SPRAS: 'E', WERKS: '0003', SOBSL: '10', WERKX: 'x' })).toThrow(/fora do layout.*WERKX/s);
  // campo informado DEPOIS do curinga seria descartado em silêncio — recusa
  expect(() => montarTabkey(T460T, { MANDT: '000', SPRAS: '*', SOBSL: '10' })).toThrow(/fora do layout ou depois do curinga.*SOBSL/s);
});

test('buildObjectKeysBody: tk:tables vai SEMPRE (sem ela o PUT é 200 mudo que apaga — medido)', () => {
  const b = buildObjectKeysBody('tvarvc', ['250' + 'ZJBV_POC79_A'.padEnd(30) + 'P0000']);
  expect(b).toContain('<tk:objectKeys xmlns:tk="http://www.sap.com/cts/adt/tk" tk:objName="TVARVC" tk:objType="TABU" tk:objPgmId="R3TR">');
  expect(b).toContain('<tk:tableKey tk:tableName="TVARVC" tk:value="250ZJBV_POC79_A                  P0000" tk:position="0001"/>');
  expect(b).toContain('<tk:tables><tk:table tk:isStringTable="false" tk:name="TVARVC"/></tk:tables>');
  // zero chaves: tableKeys vazia, e a seção tables CONTINUA lá
  const vazio = buildObjectKeysBody('T005', []);
  expect(vazio).toContain('<tk:tableKeys tk:isReadOnly="false"></tk:tableKeys>');
  expect(vazio).toContain('<tk:tables><tk:table tk:isStringTable="false" tk:name="T005"/></tk:tables>');
});

test('mensagensDoCheckrun: a resposta REAL do checkrun (tabela inexistente → E; chave boa → vazio)', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun"><chkrun:checkReport chkrun:reporter="tkcheckrun" chkrun:triggeringUri="/sap/bc/adt/cts/transportrequests/S4HK912938" chkrun:status="Object table ke" chkrun:statusText="processed"><chkrun:checkMessageList><chkrun:checkMessage chkrun:uri="/sap/bc/adt/cts/transportrequests/S4HK912938" chkrun:type="E" chkrun:shortText="Tabela YJBV_NAO_EXISTE79 não existe ou não está ativa" chkrun:category="0001"/></chkrun:checkMessageList></chkrun:checkReport></chkrun:checkRunReports>`;
  expect(mensagensDoCheckrun(xml)).toEqual([{ tipo: 'E', texto: 'Tabela YJBV_NAO_EXISTE79 não existe ou não está ativa', categoria: '0001' }]);
  expect(mensagensDoCheckrun('<chkrun:checkRunReports><chkrun:checkReport chkrun:statusText="processed"/></chkrun:checkRunReports>')).toEqual([]);
});

// ---------- objectkeys — o ramo STRING (item 81, S4H 758, 2026-09-02) ----------
// Layouts reais da POC: DEMO_CLOB_TABLE (chave única SSTR) e STWD_BO_TOPIC (CLNT+CHAR+CHAR+SSTR).
const DEMO_CLOB = [{ campo: 'NAME', tipo: 'SSTR', leng: 30, pos: 1 }];
const STWD = [
  { campo: 'CLIENT', tipo: 'CLNT', leng: 3, pos: 1 },
  { campo: 'APPLICATION_ID', tipo: 'CHAR', leng: 50, pos: 2 },
  { campo: 'BO_ID', tipo: 'CHAR', leng: 90, pos: 3 },
  { campo: 'TOPIC_ID', tipo: 'SSTR', leng: 255, pos: 4 },
];

test('ehTabelaString: o critério é campo-CHAVE SSTR (fonte do TR_NAMETAB_GET), não o comprimento', () => {
  expect(ehTabelaString(DEMO_CLOB)).toBe(true);
  expect(ehTabelaString(STWD)).toBe(true);
  expect(ehTabelaString(T460T)).toBe(false);
  // chave ENORME mas sem SSTR continua convencional
  expect(ehTabelaString([{ campo: 'A', tipo: 'CHAR', leng: 200, pos: 1 }])).toBe(false);
});

test('montarTabkeyString: TABKEY sem largura fixa + KEY_LENS de 5 dígitos por campo — os valores da POC', () => {
  // a chave que a POC gravou e conferiu na E071K_STR em outra LUW
  expect(montarTabkeyString(DEMO_CLOB, { NAME: 'YJBV_POC81_A' })).toEqual({ tabkey: 'YJBV_POC81_A', lens: '00012' });
  expect(montarTabkeyString(STWD, { CLIENT: '250', APPLICATION_ID: 'YJBV_APP', BO_ID: 'YJBV_BO', TOPIC_ID: 'YJBV_TOPICO_81' }))
    .toEqual({ tabkey: '250YJBV_APPYJBV_BOYJBV_TOPICO_81', lens: '00003000080000700014' });
  // NUMC ganha zeros ('2' e '02' seriam chaves diferentes da mesma linha); os demais vão crus
  expect(montarTabkeyString([{ campo: 'SEQ', tipo: 'NUMC', leng: 4, pos: 1 }, { campo: 'TXT', tipo: 'SSTR', leng: 60, pos: 2 }], { SEQ: '7', TXT: 'abc' }))
    .toEqual({ tabkey: '0007abc', lens: '0000400003' });
});

test('montarTabkeyString: curinga * no fim (o * conta no comprimento — medido) e campos em aberto', () => {
  expect(montarTabkeyString(DEMO_CLOB, { NAME: 'YJBV_POC81_*' })).toEqual({ tabkey: 'YJBV_POC81_*', lens: '00012' });
  // prefixo: campos depois do '*' ficam de fora do KEY_LENS (spec_keynum = nº de campos informados)
  expect(montarTabkeyString(STWD, { CLIENT: '250', APPLICATION_ID: '*' })).toEqual({ tabkey: '250*', lens: '0000300001' });
  expect(() => montarTabkeyString(DEMO_CLOB, { NAME: 'A*B' })).toThrow(/'\*' só vale no FIM/);
  expect(() => montarTabkeyString(STWD, { CLIENT: '250', APPLICATION_ID: '*', BO_ID: 'X' })).toThrow(/depois do curinga/);
  expect(() => montarTabkeyString(STWD, { CLIENT: '250' })).toThrow(/falta o campo APPLICATION_ID/);
});

test('montarTabkeyString: valor > LENG é recusado ANTES da rede — no servidor é 500 sem dump que derruba a sessão', () => {
  expect(() => montarTabkeyString(DEMO_CLOB, { NAME: 'Y'.repeat(31) })).toThrow(/passa da largura 30.*derruba a sessão/i);
  expect(() => montarTabkeyString(DEMO_CLOB, { NAME: 'ok', EXTRA: 'x' })).toThrow(/fora do layout.*EXTRA/s);
});

test('buildObjectKeysBody: ramo string — tk:length no tableKey e isStringTable="true" na tables', () => {
  const b = buildObjectKeysBody('demo_clob_table', [{ valor: 'YJBV_POC81_A', lens: '00012' }], { stringTable: true });
  expect(b).toContain('<tk:tableKey tk:tableName="DEMO_CLOB_TABLE" tk:value="YJBV_POC81_A" tk:length="00012" tk:position="0001"/>');
  expect(b).toContain('<tk:tables><tk:table tk:isStringTable="true" tk:name="DEMO_CLOB_TABLE"/></tk:tables>');
  // sem opts, o body convencional continua byte a byte o do item 79
  const conv = buildObjectKeysBody('tvarvc', ['250X']);
  expect(conv).toContain('tk:value="250X" tk:position="0001"');
  expect(conv).not.toContain('tk:length');
  expect(conv).toContain('tk:isStringTable="false"');
});

test('gravarChavesNaRequest: guard-rails antes da rede — sem tabela, zero chaves sem confirm', async () => {
  await expect(gravarChavesNaRequest({ cfg: {} }, 'S4HK912942', { chaves: ['250X'] })).rejects.toThrow(/GUARD-RAIL.*exige `tabela`/s);
  await expect(gravarChavesNaRequest({ cfg: {} }, 'S4HK912942', { tabela: 'TVARVC', chaves: [] })).rejects.toThrow(/GUARD-RAIL.*ZERO chaves APAGA/s);
  await expect(verificarChavesNaRequest({ cfg: {} }, 'S4HK912942', { chaves: ['250X'] })).rejects.toThrow(/GUARD-RAIL.*exige `tabela`/s);
  // chave montada acima de 120 chars: string table (E071K_STR) não medida — recusa antes da rede
  await expect(gravarChavesNaRequest({ cfg: {} }, 'S4HK912942', { tabela: 'X', chaves: ['x'.repeat(121)] })).rejects.toThrow(/passa de 120/);
});
