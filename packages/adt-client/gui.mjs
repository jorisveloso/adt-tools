// gui.mjs — SAP GUI Scripting: dirigir o SAP GUI local por COM, do Node, sem GUI "manual".
//
// É o canal de ÚLTIMO RECURSO: popup modal, ALV Grid (shell), table control, toolbar — e a SAÍDA de
// uma transação. O BDC (docs/receita-bdc-classrun.md) preenche campos de dynpro e não vê nada disso;
// aqui LÊ-SE a tela. O preço: exige SAP GUI instalado, uma sessão de diálogo ABERTA e VISÍVEL na
// máquina, e o servidor com `sapgui/user_scripting = TRUE`.
//
// ⚠ Antes deste, tente o WebGUI (webgui.mjs): desde 2026-09-04 ele também enxerga e dirige a dynpro,
// sem SAP GUI instalado e sem ninguém na frente da tela. A ordem é ADT → SOAP RFC → classrun → BDC →
// WebGUI → GUI Scripting; aqui é o que o WebGUI não alcança.
//
// Medido 2026-08-31, S4H 758 mandante 250, SAP GUI 8.00 (8000.257.4.1) — docs/receita-gui-scripting.md:
//   • Servidor: `sapgui/user_scripting=TRUE` (lido por `cl_spfl_profile_parameter=>get_value` num
//     driver classrun — `verificarScriptingNoServidor`). Cliente: `UserScripting=1` em
//     HKLM\SOFTWARE\WOW6432Node\SAP\SAPGUI Front\SAP Frontend Server\Security.
//   • ⚠ O PowerShell MENTE aqui. `New-Object -ComObject SapROTWr.SapROTWrapper` instancia, o
//     `GetROTEntry("SAPGUI")` devolve objeto, e TODA propriedade vem VAZIA (Children=0, Name='',
//     MajorVersion='') — sem erro nenhum, nos dois bitness. `InvokeMember` estoura
//     TYPE_E_CANTLOADLIBRARY. Quem confia no PS conclui "scripting desligado" e está errado: o
//     `GetObject("SAPGUI")` do VBScript, na MESMA máquina e no mesmo instante, devolve o engine
//     completo. Por isso este módulo gera VBS e roda por `cscript.exe`.
//   • O VBS gerado grava o resultado num ARQUIVO UTF-16 (`CreateTextFile(…, True, True)`): o stdout
//     do cscript sai na codepage do console e come os acentos das mensagens do SAP.
//   • ⚠ A tela pode aceitar tudo e não gravar nada, MUDA: na SU3 o grid aceitou um PARID inexistente
//     na TPARA, o Enter o manteve na célula, o save não reclamou e a USR05 ficou vazia. Statusbar
//     não é assert — o assert é `readTable` em outra LUW (docs/receita-ciclo-escrita-verificacao.md).
//   • ⚠ `SendVKey 11` (Ctrl+S) não gravou na SU3; o botão `wnd[0]/tbar[0]/btn[11]` gravou
//     (`S 01 039 Usuário … foi modificado`). Quando o save silencia, pressione o botão.
//   • O id literal do controle muda por tela e release — `acharPorTipo` varre a árvore por TIPO. O
//     ALV do SE16N mora em `wnd[0]/shellcont/shell`, FORA do `usr` (o caminho "de manual" não acha).
//   • Coleção do GUI Scripting não aceita índice cru: é `.Children.ElementAt(i)` (`Children(i)` →
//     "Bad index type for collection access"). E `Children.Count` em folha (GuiTextField) LANÇA.

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deployAndRun } from './classrun.mjs';

const exec = promisify(execFile);

const SAPGUI_DIR = 'C:\\Program Files (x86)\\SAP\\FrontEnd\\SAPgui';
const CSCRIPT = `${process.env.WINDIR || 'C:\\Windows'}\\System32\\cscript.exe`;
const SEP = '\u0001'; // separador de campo na saída do VBS — não aparece em texto de tela

/** Os parâmetros de perfil que decidem se o SERVIDOR aceita GUI Scripting (medidos no s4h). */
export const PARAMETROS_SCRIPTING = [
  'sapgui/user_scripting',
  'sapgui/user_scripting_disable_recording',
  'sapgui/user_scripting_force_notification',
  'sapgui/user_scripting_set_readonly',
  'sapgui/user_scripting_per_user',
];

/** As ações que um passo pode pedir. Ver `montarVbs` para o VBS que cada uma vira. */
export const ACOES = [
  'transacao',   // { valor } — StartTransaction
  'texto',       // { id, valor } — .Text de campo
  'tecla',       // { id?, valor } — SendVKey (0=Enter, 4=F4, 8=F8, 11=Ctrl+S, 12=F12)
  'pressionar',  // { id } — .Press de botão
  'selecionar',  // { id } — .Select de aba/nó
  'foco',        // { id } — .SetFocus
  'lerCampo',    // { id } — devolve .Text
  'lerTela',     // { } — tcode, programa, dynpro, título, janelas
  'lerStatus',   // { } — statusbar: tipo, id, número, texto
  'achar',       // { valor: tipo, id?: raiz } — ids dos controles daquele Type
  'lerGrid',     // { id, linhas?, colunas? } — GuiShell/GridView: RowCount, colunas, células
  'celulaGrid',  // { id, linha, coluna, valor } — ModifyCell (exige Enter depois)
  'linhaGrid',   // { id, linha } — CurrentCellRow + SelectedRows (o DEL_LINE age na SELEÇÃO)
  'botaoGrid',   // { id, valor } — PressToolbarButton (ex. 'DEL_LINE')
  'toolbarGrid', // { id } — lista os botões da toolbar do próprio ALV
  'lerTabela',   // { id, linhas?, colunas? } — GuiTableControl: GetCell
  'janelas',     // { } — as janelas abertas (wnd[1] = popup modal)
  'fechar',      // { id? } — SendVKey 12 na janela (fecha popup)
];

/** PURO: escapa uma string para literal VBScript (aspas duplicadas; sem quebra de linha). */
export function escVbs(v) {
  return String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
}

/** PURO: valida um passo antes de gerar VBS nenhum — erro de digitação não vira tela aberta à toa. */
export function validarPasso(p, i) {
  if (!p || typeof p !== 'object') throw new Error(`passo ${i}: informe { acao, … }`);
  if (!ACOES.includes(p.acao)) throw new Error(`passo ${i}: ação "${p.acao}" desconhecida — use ${ACOES.join('|')}`);
  const exigeId = ['texto', 'pressionar', 'selecionar', 'foco', 'lerCampo', 'lerGrid', 'celulaGrid', 'linhaGrid', 'botaoGrid', 'toolbarGrid', 'lerTabela'];
  if (exigeId.includes(p.acao) && !p.id) throw new Error(`passo ${i} (${p.acao}): exige { id } do controle`);
  const exigeValor = ['transacao', 'tecla', 'achar', 'botaoGrid'];
  if (exigeValor.includes(p.acao) && (p.valor === undefined || p.valor === '')) {
    throw new Error(`passo ${i} (${p.acao}): exige { valor }`);
  }
  if (p.acao === 'linhaGrid' && p.linha === undefined) throw new Error(`passo ${i} (linhaGrid): exige { linha }`);
  if (p.acao === 'celulaGrid' && (p.linha === undefined || !p.coluna)) {
    throw new Error(`passo ${i} (celulaGrid): exige { linha, coluna, valor }`);
  }
  return true;
}

const linhaVbs = (rotulo, expr) => `  Emitir "${rotulo}", ${expr}`;

/** PURO: o VBS de um passo. Separado de `montarVbs` para o teste irmão conferir passo a passo. */
export function vbsDoPasso(p, i) {
  const id = escVbs(p.id);
  const n = i;
  switch (p.acao) {
    case 'transacao':
      return `  sess.StartTransaction "${escVbs(p.valor)}"\n` + linhaVbs(`${n}|transacao`, `sess.Info.Transaction & S & sess.Info.Program & S & sess.Info.ScreenNumber`);
    case 'texto':
      return `  sess.FindById("${id}").Text = "${escVbs(p.valor)}"\n` + linhaVbs(`${n}|texto`, `"${escVbs(p.valor)}"`);
    case 'tecla':
      return `  sess.FindById("${escVbs(p.id || 'wnd[0]')}").SendVKey ${Number(p.valor)}\n` + linhaVbs(`${n}|tecla`, `"${Number(p.valor)}"`);
    case 'pressionar':
      return `  sess.FindById("${id}").Press\n` + linhaVbs(`${n}|pressionar`, `"${id}"`);
    case 'selecionar':
      return `  sess.FindById("${id}").Select\n` + linhaVbs(`${n}|selecionar`, `"${id}"`);
    case 'foco':
      return `  sess.FindById("${id}").SetFocus\n` + linhaVbs(`${n}|foco`, `"${id}"`);
    case 'lerCampo':
      return linhaVbs(`${n}|lerCampo`, `sess.FindById("${id}").Text`);
    case 'lerTela':
      return linhaVbs(`${n}|lerTela`, `sess.Info.Transaction & S & sess.Info.Program & S & sess.Info.ScreenNumber & S & sess.ActiveWindow.Text & S & sess.Children.Count`);
    case 'lerStatus':
      return `  Set sb = sess.FindById("wnd[0]/sbar")\n` + linhaVbs(`${n}|lerStatus`, `sb.MessageType & S & Trim(sb.MessageId) & S & sb.MessageNumber & S & sb.Text`);
    case 'janelas':
      return `  For jj = 0 To sess.Children.Count - 1\n` +
             `    Set ww = sess.Children.ElementAt(jj)\n` +
             linhaVbs(`${n}|janela`, `ww.Id & S & ww.Type & S & ww.Text`) + `\n  Next`;
    case 'fechar':
      return `  sess.FindById("${escVbs(p.id || 'wnd[1]')}").SendVKey 12\n` + linhaVbs(`${n}|fechar`, `sess.Children.Count`);
    case 'achar':
      return `  achados = ""\n  Busca sess.FindById("${escVbs(p.id || 'wnd[0]')}"), "${escVbs(p.valor)}", 0\n` +
             `  For Each ac In Split(achados, vbLf)\n    If ac <> "" Then ${linhaVbs(`${n}|achar`, 'ac').trim()}\n  Next`;
    case 'lerGrid':
      return `  Set g = sess.FindById("${id}")\n` +
             linhaVbs(`${n}|grid`, `g.SubType & S & g.RowCount & S & g.ColumnCount`) + `\n` +
             `  Set ordem = g.ColumnOrder\n` +
             `  nc = ordem.Count - 1\n  If nc > ${Number(p.colunas ?? 20) - 1} Then nc = ${Number(p.colunas ?? 20) - 1}\n` +
             `  nl = g.RowCount - 1\n  If nl > ${Number(p.linhas ?? 10) - 1} Then nl = ${Number(p.linhas ?? 10) - 1}\n` +
             `  For li = 0 To nl\n    For co = 0 To nc\n` +
             linhaVbs(`${n}|celula`, `li & S & ordem.ElementAt(co) & S & g.GetCellValue(li, ordem.ElementAt(co))`) + `\n` +
             `    Next\n  Next`;
    case 'celulaGrid':
      return `  Set g = sess.FindById("${id}")\n  g.CurrentCellRow = ${Number(p.linha)}\n` +
             `  g.ModifyCell ${Number(p.linha)}, "${escVbs(p.coluna)}", "${escVbs(p.valor)}"\n` +
             linhaVbs(`${n}|celulaGrid`, `${Number(p.linha)} & S & "${escVbs(p.coluna)}" & S & g.GetCellValue(${Number(p.linha)}, "${escVbs(p.coluna)}")`);
    case 'linhaGrid':
      return `  Set g = sess.FindById("${id}")\n  g.CurrentCellRow = ${Number(p.linha)}\n  g.SelectedRows = "${Number(p.linha)}"\n` +
             linhaVbs(`${n}|linhaGrid`, `g.CurrentCellRow & S & g.SelectedRows`);
    case 'botaoGrid':
      return `  Set g = sess.FindById("${id}")\n  g.PressToolbarButton "${escVbs(p.valor)}"\n` + linhaVbs(`${n}|botaoGrid`, `"${escVbs(p.valor)}" & S & g.RowCount`);
    case 'toolbarGrid':
      return `  Set g = sess.FindById("${id}")\n  For bi = 0 To g.ToolbarButtonCount - 1\n` +
             linhaVbs(`${n}|botao`, `g.GetToolbarButtonId(bi) & S & g.GetToolbarButtonType(bi) & S & g.GetToolbarButtonTooltip(bi)`) + `\n  Next`;
    case 'lerTabela':
      return `  Set tc = sess.FindById("${id}")\n` +
             linhaVbs(`${n}|tabela`, `tc.RowCount & S & tc.VisibleRowCount & S & tc.Columns.Count`) + `\n` +
             `  nl = tc.VisibleRowCount - 1\n  If nl > ${Number(p.linhas ?? 5) - 1} Then nl = ${Number(p.linhas ?? 5) - 1}\n` +
             `  nc = tc.Columns.Count - 1\n  If nc > ${Number(p.colunas ?? 10) - 1} Then nc = ${Number(p.colunas ?? 10) - 1}\n` +
             `  For li = 0 To nl\n    For co = 0 To nc\n      cel = ""\n      On Error Resume Next\n` +
             `      cel = tc.GetCell(li, co).Text\n      Err.Clear\n      On Error Goto 0\n` +
             linhaVbs(`${n}|celula`, `li & S & co & S & cel`) + `\n    Next\n  Next`;
    default:
      throw new Error(`passo ${i}: ação "${p.acao}" sem VBS (bug do módulo)`);
  }
}

/**
 * PURO: o VBS completo de uma lista de passos. Cada passo vira uma linha `rotulo\u0001campos` no
 * arquivo de saída; um passo que estoura interrompe e grava `@erro`. Testado byte a byte.
 */
export function montarVbs(passos, arquivoSaida) {
  passos.forEach(validarPasso);
  // Cada passo só roda se o anterior não tiver estourado — sem isso, um erro no passo N fica
  // pendurado no Err global (o VBS não limpa sozinho) e os passos N+1, N+2… continuam rodando
  // OS SEUS EFEITOS COLATERAIS de verdade no SAP GUI, e o erro relatado no fim é atribuído ao
  // ÚLTIMO passo executado, não ao que falhou (medido no item 30 — custou várias rodadas).
  const corpo = passos.map((p, i) => `  If Err.Number = 0 Then\n    passo = ${i}\n${vbsDoPasso(p, i)}\n  End If`).join('\n');
  return `' gerado por adt-client/gui.mjs — não editar à mão
Option Explicit
Dim app, conn, sess, fso, saida, passo, achados, ac, g, tc, sb, ordem, S
Dim li, co, nl, nc, cel, jj, ww, bi
passo = -1
S = Chr(1)

Set fso = CreateObject("Scripting.FileSystemObject")
' True, True = cria/sobrescreve em UNICODE (UTF-16LE): o stdout do cscript come os acentos do SAP
Set saida = fso.CreateTextFile("${escVbs(arquivoSaida)}", True, True)

Sub Emitir(rotulo, valor)
  saida.WriteLine rotulo & S & valor
End Sub

Function Container(ctrl)
  Dim v
  Container = False
  On Error Resume Next
  v = ctrl.ContainerType
  If Err.Number = 0 Then Container = v
  Err.Clear
  On Error Goto 0
End Function

' Varre a árvore por TIPO: o id literal muda por tela e por release; o Type, não.
Sub Busca(ctrl, tipo, nivel)
  Dim i, n, f
  If nivel > 12 Then Exit Sub
  On Error Resume Next
  If InStr(ctrl.Type, tipo) > 0 Then achados = achados & ctrl.Id & vbLf
  Err.Clear
  On Error Goto 0
  If Not Container(ctrl) Then Exit Sub
  n = -1
  On Error Resume Next
  n = ctrl.Children.Count
  Err.Clear
  On Error Goto 0
  If n < 1 Then Exit Sub
  For i = 0 To n - 1
    On Error Resume Next
    Set f = Nothing
    Set f = ctrl.Children.ElementAt(i)
    Err.Clear
    On Error Goto 0
    If Not (f Is Nothing) Then Busca f, tipo, nivel + 1
  Next
End Sub

On Error Resume Next
Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then
  Emitir "@erro", "GetObject(SAPGUI) falhou: " & Err.Description
  saida.Close
  WScript.Quit 1
End If
If app.Children.Count = 0 Then
  Emitir "@erro", "nenhuma conexao no SAP GUI — abra uma sessao (abrirSapGui) antes"
  saida.Close
  WScript.Quit 2
End If
Err.Clear
On Error Goto 0

Set conn = app.Children.ElementAt(${'${CONEXAO}'})
Set sess = conn.Children.ElementAt(${'${SESSAO}'})
Emitir "@sessao", sess.Id & S & sess.Info.SystemName & S & sess.Info.Client & S & sess.Info.User & S & sess.Info.Language

On Error Resume Next
${corpo}
If Err.Number <> 0 Then Emitir "@erro", "passo " & passo & ": " & Err.Description
On Error Goto 0

Emitir "@fim", passo
saida.Close
`;
}

/** PURO: transforma a saída do VBS (linhas `rotulo\u0001campos`) em { sessao, erro, passos[] }. */
export function interpretarSaidaGui(texto) {
  const out = { sessao: null, erro: null, fim: null, passos: [], linhas: [] };
  for (const bruta of String(texto).split(/\r?\n/)) {
    const linha = bruta.replace(/^\uFEFF/, '');
    if (!linha.trim()) continue;
    const [rotulo, ...resto] = linha.split(SEP);
    const campos = resto;
    out.linhas.push({ rotulo, campos });
    if (rotulo === '@erro') { out.erro = campos.join(' '); continue; }
    if (rotulo === '@fim') { out.fim = Number(campos[0]); continue; }
    if (rotulo === '@sessao') {
      const [id, sistema, mandante, usuario, idioma] = campos;
      out.sessao = { id, sistema, mandante, usuario, idioma };
      continue;
    }
    const [i, tipo] = rotulo.split('|');
    out.passos.push({ passo: Number(i), tipo, campos });
  }
  return out;
}

/** PURO: os resultados de um passo, já em forma de objeto — o que o chamador quer ler. */
export function resultadoDoPasso(saida, i) {
  const meus = saida.passos.filter((p) => p.passo === i);
  if (!meus.length) return null;
  const tipo = meus[0].tipo;
  if (tipo === 'lerTela') {
    const [tcode, programa, dynpro, titulo, janelas] = meus[0].campos;
    return { tipo, tcode, programa, dynpro, titulo, janelas: Number(janelas) };
  }
  if (tipo === 'lerStatus') {
    const [msgTipo, msgId, numero, texto] = meus[0].campos;
    return { tipo, msgTipo, msgId, numero, texto };
  }
  if (tipo === 'transacao') {
    const [tcode, programa, dynpro] = meus[0].campos;
    return { tipo, tcode, programa, dynpro };
  }
  if (tipo === 'achar') return { tipo, ids: meus.map((m) => m.campos[0]) };
  if (tipo === 'janela') return { tipo, janelas: meus.map((m) => ({ id: m.campos[0], tipo: m.campos[1], texto: m.campos[2] })) };
  if (tipo === 'botao') return { tipo, botoes: meus.map((m) => ({ id: m.campos[0], tipoBotao: m.campos[1], dica: m.campos[2] })) };
  if (tipo === 'grid' || tipo === 'tabela') {
    const celulas = saida.passos.filter((p) => p.passo === i && p.tipo === 'celula');
    const cab = meus.find((m) => m.tipo === tipo).campos;
    const linhas = {};
    for (const c of celulas) {
      const [li, col, val] = c.campos;
      (linhas[li] ??= {})[col] = val;
    }
    return tipo === 'grid'
      ? { tipo, subType: cab[0], linhas: Number(cab[1]), colunas: Number(cab[2]), dados: linhas }
      : { tipo, linhas: Number(cab[0]), visiveis: Number(cab[1]), colunas: Number(cab[2]), dados: linhas };
  }
  return { tipo, campos: meus.map((m) => m.campos) };
}

/** O SAP GUI está instalado nesta máquina, e o cliente permite scripting? Só olha o disco/registro. */
export function guiInstalado({ dir = SAPGUI_DIR } = {}) {
  const saplogon = path.join(dir, 'saplogon.exe');
  const sapshcut = path.join(dir, 'sapshcut.exe');
  return {
    dir,
    saplogon: fs.existsSync(saplogon),
    sapshcut: fs.existsSync(sapshcut),
    scriptingDlls: fs.existsSync(path.join(dir, 'Scripting')),
    sapfewse: fs.existsSync(path.join(dir, 'sapfewse.ocx')),
  };
}

/**
 * O SERVIDOR aceita GUI Scripting? Roda um driver classrun que lê os parâmetros de perfil.
 * `sapgui/user_scripting = TRUE` é a condição; os outros dizem o REGIME (readonly, notificação).
 */
export async function verificarScriptingNoServidor(conexao, { name = 'YJBV_POC_CL_GS_PARAM' } = {}) {
  const cls = name.toLowerCase();
  const source = `CLASS ${cls} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
    METHODS param IMPORTING nome TYPE string out TYPE REF TO if_oo_adt_classrun_out.
ENDCLASS.
CLASS ${cls} IMPLEMENTATION.
  METHOD param.
    DATA valor TYPE string.
    TRY.
        cl_spfl_profile_parameter=>get_value( EXPORTING name = nome IMPORTING value = valor ).
        out->write( |{ nome }={ valor }| ).
      CATCH cx_root INTO DATA(erro).
        out->write( |{ nome }=<erro> { erro->get_text( ) }| ).
    ENDTRY.
  ENDMETHOD.
  METHOD if_oo_adt_classrun~main.
${PARAMETROS_SCRIPTING.map((p) => `    param( nome = |${p}| out = out ).`).join('\n')}
  ENDMETHOD.
ENDCLASS.`;

  const r = await deployAndRun(conexao, { name, source, description: 'le sapgui/user_scripting' });
  const params = {};
  for (const linha of String(r.saida || '').split('\n')) {
    const i = linha.indexOf('=');
    if (i > 0) params[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return {
    ok: params['sapgui/user_scripting'] === 'TRUE',
    somenteLeitura: params['sapgui/user_scripting_set_readonly'] === 'TRUE',
    notifica: params['sapgui/user_scripting_force_notification'] === 'TRUE',
    params,
    saida: r.saida,
  };
}

/** Os dois processos do SAP GUI que importam: o lançador do atalho e o pad, que HOSPEDA a sessão. */
const IMAGENS_SAPGUI = ['SAPgui.exe', 'saplogon.exe'];

/**
 * PURO: a saída CSV do `tasklist /V` vira `[{ pid, imagem, titulo }]` — o sensor barato de
 * "há processo?". Aceita SAPgui.exe E saplogon.exe: no GUI 8.00 a sessão vive no saplogon.exe
 * (medido 04/09/2026, ver § "A sessão vive no saplogon.exe" da receita).
 *
 * ⚠ O `titulo` do tasklist só presta para o SAPgui.exe. Para o saplogon.exe ele vem `N/A` MESMO com
 * sessão logada de pé (medido 04/09/2026: `"saplogon.exe","37016",...,"N/A"` com 'SAP Easy Access'
 * aberta). Janela do pad se enxerga com `janelasSapGui()`, não aqui.
 *
 * Espera o CSV já em UTF-8 — quem garante isso é `linhaTasklist` (o `chcp 65001`), não este parser.
 */
export function interpretarTasklist(csv) {
  const procs = [];
  for (const linha of String(csv).split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const campos = [...linha.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]);
    if (campos.length < 2) continue;
    const imagem = IMAGENS_SAPGUI.find((i) => i.toLowerCase() === campos[0].toLowerCase());
    if (!imagem) continue;
    const bruto = campos.at(-1) ?? '';
    // ⚠ "GDI+ Window (sapgui.exe)" é janela de INFRAESTRUTURA — o processo a cria antes (e sem)
    // qualquer tela de usuário. Tomá-la por janela real manda consultar o ROT à toa (medido).
    // ⚠ Para o saplogon.exe o título do tasklist não diz nada: 'N/A' COM sessão logada, 'SAP Logon'
    // SEM sessão (medido 04/09/2026) — tomá-lo por janela de usuário virava 'logon-pendente' falso.
    const titulo = /^N\/A$/i.test(bruto) || /^GDI\+ Window/i.test(bruto) || /^saplogon\.exe$/i.test(imagem) ? '' : bruto;
    procs.push({ pid: Number(campos[1]), imagem, titulo });
  }
  return procs;
}

/**
 * PURO: a linha de `cmd /c` que lista UMA imagem pelo `tasklist /V`, em UTF-8.
 *
 * ⚠ O `tasklist` escreve na codepage OEM do console (850 nesta máquina) e o Node decodifica o stdout
 * como UTF-8: 'usuário' chegava 'usu\uFFFDrio' (byte A0 = 'á' em cp850). Medido 04/09/2026 contra um
 * cmd com título 'Entrada do nome do usuário': `cmd /U` NÃO muda nada (só vale para comando interno),
 * o `TextDecoder` do Node NÃO tem cp850 (ibm866 devolve cirílico), WMI `Win32_Process` NÃO tem título
 * de janela — e `chcp 65001` antes do `tasklist` faz o título sair `c3 a1` (UTF-8) e chegar inteiro.
 * A linha vai a `cmd /c` com `windowsVerbatimArguments` (o `&&` e as aspas do filtro não podem passar
 * pelo quoting do Node). Dois `/FI` no mesmo tasklist são E, não OU — daí uma linha por imagem.
 */
export const linhaTasklist = (imagem) => `chcp 65001>nul && tasklist /FI "IMAGENAME eq ${imagem}" /FO CSV /NH /V`;

/** Os SAPgui.exe e saplogon.exe vivos agora. Barato — ao contrário do ROT, que custa 15 s sem sessão. */
export async function processosSapGui() {
  const cmd = `${process.env.WINDIR || 'C:\\Windows'}\\System32\\cmd.exe`;
  const saidas = await Promise.all(IMAGENS_SAPGUI.map((imagem) =>
    exec(cmd, ['/c', linhaTasklist(imagem)], { windowsHide: true, windowsVerbatimArguments: true, timeout: 10000 })
      .then((r) => r.stdout, (e) => e.stdout || '')));
  return interpretarTasklist(saidas.join('\n'));
}

/** Classe Win32 da janela de sessão do SAP GUI — tela de logon do servidor OU sessão logada (medido 04/09/2026). */
export const CLASSE_SESSAO = 'SAP_FRONTEND_SESSION';

/**
 * PURO: a saída do PowerShell de `janelasSapGui` (uma janela por linha, campos separados por TAB:
 * imagem, pid, classe, título, textos dos Static de um diálogo) vira `[{ imagem, pid, classe, titulo, textos }]`.
 */
export function interpretarJanelas(texto) {
  const janelas = [];
  for (const linha of String(texto).split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const [imagem, pid, classe, titulo, textos = ''] = linha.split('\t');
    if (!imagem || !pid || !classe) continue;
    janelas.push({ imagem, pid: Number(pid), classe, titulo: titulo ?? '', textos: textos ? textos.split(' | ') : [] });
  }
  return janelas;
}

/**
 * PURO: esta janela é o popup do PEDÁGIO — "Um script está tentando acessar SAP GUI" (OK/Cancelar)?
 *
 * Medido 05/09/2026 (item 60, bruto `sap-accelerate/work/POC_rot_sapgui/medicoes/raw/item60-warnonattach.json`):
 * o pedágio é um `#32770` de título **`SAP Logon` sem versão** — o pad é `SAP Logon 800`, e os dois
 * aparecem lado a lado no mesmo instante (`"SAP Logon" aos 1325ms; "SAP Logon 800" aos 1326ms`).
 * O título é o critério MEDIDO; o `Static` com "script" (o texto que a captura de tela do item 34
 * mostrou, ainda não colhido campo a campo) entra como reforço, para o caso de outro idioma
 * ("Skript") mudar o título.
 */
export const ehPopupAutorizacao = (j) =>
  j?.classe === '#32770' &&
  (/^SAP Logon$/i.test(String(j.titulo ?? '').trim()) || (j.textos ?? []).some((t) => /s[ck]ript/i.test(t)));

/**
 * PURO: o que as janelas visíveis do SAP GUI dizem — o sensor que o tasklist NÃO tem para o pad.
 * Estados (medidos em 04-05/09/2026, SAP GUI 8.00 PT, S4H 758/250):
 *   `autorizacao` — o popup do pedágio (`ehPopupAutorizacao`). ⚠ Vem ANTES de `sessao`: com o popup
 *                   de pé a janela 'SAP Easy Access' da sessão LOGADA está visível ao mesmo tempo, e
 *                   quem responder `sessao` faz o `diagnosticarRot` concluir "é a TELA DE LOGON" —
 *                   errado, a sessão está logada e o que falta é o OK (item 34/61 da fila).
 *   `sessao`      — há janela `SAP_FRONTEND_SESSION` (título 'SAP Easy Access' logado; 'SAP' na tela
 *                   de logon do servidor, com credencial rejeitada). Quem separa os dois é o ROT.
 *   `pede-senha`  — diálogo `#32770` 'Ligação SAP GUI - logon (S4H, 250, PT, )': o pad quer a senha
 *                   (aconteceu SEM -pw; com -pw o logon passou direto).
 *   `mensagem`    — caixa `#32770` 'SAP GUI' com texto (ex.: 'ID sistema desconhecido', que é o
 *                   `-conn=/H/…` sem `-sysname=`). `textos` traz o conteúdo.
 *   `so-pad`      — só a janela do pad ('SAP Logon 800').
 *   `nenhuma`     — nada visível.
 */
export function lerJanelas(janelas = []) {
  const pedagio = janelas.filter(ehPopupAutorizacao);
  if (pedagio.length) return { estado: 'autorizacao', janelas: pedagio };
  const sessao = janelas.filter((j) => j.classe === CLASSE_SESSAO);
  if (sessao.length) return { estado: 'sessao', janelas: sessao };
  const dialogos = janelas.filter((j) => j.classe === '#32770');
  const pedeSenha = dialogos.filter((j) => /logon/i.test(j.titulo) && !/^SAP Logon \d+$/i.test(j.titulo));
  if (pedeSenha.length) return { estado: 'pede-senha', janelas: pedeSenha };
  const mensagem = dialogos.filter((j) => /^SAP GUI$/i.test(j.titulo) || j.textos.length && !/^SAP Logon \d+$/i.test(j.titulo));
  if (mensagem.length) return { estado: 'mensagem', janelas: mensagem };
  if (dialogos.some((j) => /^SAP Logon \d+$/i.test(j.titulo))) return { estado: 'so-pad', janelas: [] };
  return { estado: 'nenhuma', janelas: [] };
}

/**
 * O PowerShell que lista as janelas VISÍVEIS com título dos processos dados (uma por linha, campos
 * separados por TAB, no formato que `interpretarJanelas` lê).
 *
 * ⚠ Duas defesas de encoding, ambas NECESSÁRIAS — medidas em 05/09/2026 (item 35 da fila, bruto em
 * `sap-accelerate/work/POC_rot_sapgui/medicoes/raw/item35-mojibake.json`) contra uma janela de
 * título conhecido `Entrada do nome do usuário — ĄŻ テスト`:
 *   • `[Console]::OutputEncoding = UTF8` ANTES da primeira escrita: sem ele o PowerShell escreve o
 *     stdout na codepage OEM do console (850 aqui) e o Node, que decodifica UTF-8, recebe
 *     `usu�rio` — o mesmo mal do `tasklist` (§ item 17, resolvido lá com `chcp 65001`).
 *   • `CharSet=CharSet.Unicode` nos `DllImport` de `GetWindowText`/`GetClassName`: sem ele o
 *     P/Invoke liga em `GetWindowTextA` e a perda acontece ANTES de qualquer stdout — o ANSI 1252
 *     faz *best-fit* silencioso (`ĄŻ` → `AZ`, `—` → `-`) e troca por `?` o que não tem mapa
 *     (`テスト` → `???`). É perda que nenhuma codepage de saída recupera.
 * Sem o `OutputEncoding` o eixo do `CharSet` nem se observa: a codepage 850 da escrita já achata
 * tudo (as duas variantes `utf8=false` deram byte a byte o mesmo texto corrompido).
 *
 * ⚠ Terceira defesa, `Uma()` — o texto de um `Static` do SAP GUI é MULTILINHA. Medido 05/09/2026
 * (item 63, bruto `raw/item63-janelas-reais.json` + foto `raw/item63-fotos/mensagem-1-tela.png`):
 * a caixa 'SAP GUI' tem UM único `Static` cujo texto é `"Nem todos os dados estão disponíveis
 * p/ligação a SAP GUI:\r\n\r\nID sistema desconhecido\r\n\r\nEntrar os dados em falta"`. Sem
 * quebrar por `\n`, a linha emitida ganhava quebras no meio e `interpretarJanelas` — que lê UMA
 * janela por linha — descartava o resto: `textos` chegava com só a PRIMEIRA das três linhas que a
 * tela mostra. Cada linha vira agora um item de `textos[]`, e `Uma()` tira `\r`/`\n`/TAB de
 * qualquer campo (o TAB é o separador; um título com TAB deslocaria todos os campos).
 * O buffer subiu 512→1024: o texto dessa caixa tem 111 caracteres, mas é o mesmo `Static` que
 * cresce com a mensagem do servidor.
 */
export const psJanelas = (processos = ['SAPgui', 'saplogon']) => `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class JSap { public delegate bool EnumProc(IntPtr h, IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc p, IntPtr l);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 static string Txt(IntPtr h){ var t=new StringBuilder(1024); GetWindowText(h,t,1024); return t.ToString(); }
 static string Cls(IntPtr h){ var c=new StringBuilder(256); GetClassName(h,c,256); return c.ToString(); }
 static string Uma(string s){ return s.Replace("\\r"," ").Replace("\\n"," ").Replace("\\t"," ").Trim(); }
 public static List<string> List(Dictionary<uint,string> pids){ var r=new List<string>(); EnumWindows((h,l)=>{ uint pid; GetWindowThreadProcessId(h,out pid);
   if(pids.ContainsKey(pid) && IsWindowVisible(h)){ string t=Uma(Txt(h)); if(t.Length==0) return true; string c=Cls(h); var st=new List<string>();
     if(c=="#32770"){ EnumChildWindows(h,(ch,l2)=>{ if(Cls(ch)=="Static"){ foreach(string ln in Txt(ch).Split('\\n')){ string s=Uma(ln); if(s.Length>0) st.Add(s); } } return true; }, IntPtr.Zero); }
     r.Add(pids[pid]+"\\t"+pid+"\\t"+c+"\\t"+t+"\\t"+string.Join(" | ",st)); } return true; }, IntPtr.Zero); return r; } }
'@
$pids = New-Object 'System.Collections.Generic.Dictionary[uint32,string]'
Get-Process -Name ${processos.join(',')} -ErrorAction SilentlyContinue | % { $pids[[uint32]$_.Id] = "$($_.ProcessName).exe" }
[JSap]::List($pids)`;

/**
 * As janelas VISÍVEIS com título dos processos SAPgui.exe/saplogon.exe: `{ imagem, pid, classe, titulo, textos }`.
 * É o sensor certo para o pad — o tasklist devolve `N/A` para ele mesmo com sessão logada de pé.
 * Custa ~0,8 s (PowerShell + Add-Type; medido 04/09/2026: 753 ms).
 */
export async function janelasSapGui() {
  const r = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psJanelas()],
    { windowsHide: true, timeout: 20000 }).catch((e) => ({ stdout: e.stdout || '' }));
  return interpretarJanelas(r.stdout);
}

/** PURO: a sessão do ROT tem alguém logado? A tela de logon do servidor TAMBÉM entra no ROT — com
 * usuário vazio, mandante 000 e tcode S000 (medido 04/09/2026, hospedada no saplogon.exe). */
export const sessaoLogada = (s) => Boolean(s?.usuario);

/** PURO: as janelas de um estado, em uma linha legível — `saplogon.exe:42432 'SAP Logon' [texto]`. */
const lista = (js) => js.map((j) => `${j.imagem}:${j.pid} '${j.titulo}'${j.textos?.length ? ` [${j.textos.join(' | ')}]` : ''}`).join(', ');

/**
 * PURO: por que o ROT veio VAZIO (ou só com tela de logon). O ROT sozinho não distingue "GUI fechado"
 * de "GUI aberto na tela de logon", e o segundo manda a investigação para RZ11/registro à toa. Quem
 * separa é o par tasklist (há processo?) + janelas (`lerJanelas`: que janela é?).
 *
 * ⚠ O `expirou` NÃO distingue nada — medido 04/09/2026 (SAP GUI 8.00, máquina do Joris, alvo S4H):
 *   GUI fechado, `sessoesAbertas()`: `expirou`, 15669 ms; janela parada no logon: `expirou`, 15663 ms.
 *
 * Estados: `com-sessao` · `pede-autorizacao` (o popup do pedágio de pé — § O pedágio do cliente) ·
 * `logon-pendente` (tela de logon de pé — no ROT com usuário vazio, ou janela
 * `SAP_FRONTEND_SESSION`/título de logon sem sessão) · `pede-senha` (o pad abriu o diálogo de senha)
 * · `mensagem` (caixa de mensagem do GUI, com o texto) · `sem-janela` (processo de pé, nenhuma janela
 * de sessão — pad aberto sem sessão, ou GUI subindo) · `gui-fechado` (nenhum SAPgui.exe nem
 * saplogon.exe) · `erro-scripting` (o `GetObject` levantou Err — o ÚNICO que aponta para cliente/servidor).
 *
 * ⚠ `pede-autorizacao` é lido ANTES de tudo que não seja `com-sessao` — inclusive antes do `erroVbs`
 * e das sessões sem usuário. Medido 05/09/2026 (item 34): com o popup de pé o ROT expira E a janela
 * 'SAP Easy Access' da sessão LOGADA continua visível; a versão anterior concluía `logon-pendente`
 * ("é a TELA DE LOGON") e mandava investigar credencial — a sessão estava logada, faltava o OK.
 */
export function diagnosticarRot({ sessoes = [], expirou = false, processos = [], erroVbs = null, janelas = [] } = {}) {
  const lidas = lerJanelas(janelas);
  if (sessoes.some(sessaoLogada)) return { estado: 'com-sessao', explicacao: null };
  if (lidas.estado === 'autorizacao') {
    return {
      estado: 'pede-autorizacao',
      explicacao:
        `o cliente está pedindo autorização: o SAP GUI abriu "Um script está tentando acessar SAP GUI" ` +
        `(${lista(lidas.janelas)}) e NÃO devolve o engine enquanto ninguém clicar OK. ` +
        'Não é scripting desligado: clique OK, ou desligue o aviso com ' +
        String.raw`reg add "HKCU\Software\SAP\SAPGUI Front\SAP Frontend Server\Security" /v WarnOnAttach /t REG_DWORD /d 0 /f ` +
        '(§ O pedágio do cliente).',
    };
  }
  if (erroVbs) return { estado: 'erro-scripting', explicacao: `o GetObject("SAPGUI") falhou — ${erroVbs}` };
  const naoMexer = 'Não é scripting desligado; não mexa em RZ11 nem no registro.';
  if (sessoes.length) {
    return {
      estado: 'logon-pendente',
      explicacao: `o ROT tem ${sessoes.length} conexão(ões) sem ninguém logado ` +
        `(${sessoes.map((s) => `${s.id} ${s.sistema}/${s.mandante} ${s.tcode}`).join(', ')}) — é a TELA DE LOGON do ` +
        `servidor: a credencial não passou. ${naoMexer}`,
    };
  }
  const mudo = expirou ? 'o GetObject("SAPGUI") não respondeu no prazo, e ' : 'o ROT respondeu vazio, e ';
  if (!processos.length) {
    return { estado: 'gui-fechado', explicacao: `${mudo}nenhum SAPgui.exe nem saplogon.exe está rodando — o SAP GUI está fechado` };
  }
  if (lidas.estado === 'sessao') {
    return { estado: 'logon-pendente', explicacao: `${mudo}há janela de sessão de pé (${lista(lidas.janelas)}) sem sessão logada — é a TELA DE LOGON. ${naoMexer}` };
  }
  if (lidas.estado === 'pede-senha') {
    return { estado: 'pede-senha', explicacao: `${mudo}o SAP Logon abriu o diálogo de senha (${lista(lidas.janelas)}) — o atalho chegou sem senha aceita` };
  }
  if (lidas.estado === 'mensagem') {
    return { estado: 'mensagem', explicacao: `${mudo}o SAP GUI está parado numa mensagem: ${lista(lidas.janelas)}` };
  }
  const comJanela = processos.filter((p) => p.titulo);
  if (comJanela.length) {
    return {
      estado: 'logon-pendente',
      explicacao: `${mudo}há janela de usuário de pé (${comJanela.map((p) => `${p.pid}:${p.titulo}`).join(', ')}) — ninguém logado, é a TELA DE LOGON. ${naoMexer}`,
    };
  }
  return {
    estado: 'sem-janela',
    explicacao: `${mudo}há ${processos.length} processo(s) de pé (${processos.map((p) => `${p.imagem || 'SAPgui.exe'}:${p.pid}`).join(', ')}), ` +
      'nenhuma janela de sessão — o SAP Logon está aberto sem sessão, ou o GUI está subindo. A sessão vive no saplogon.exe (§ A sessão vive no saplogon.exe)',
  };
}

/**
 * Abre uma sessão de diálogo no SAP GUI pelo `sapshcut` e espera ela aparecer no ROT, LOGADA.
 *
 * ⚠ A senha vai na LINHA DE COMANDO do sapshcut — visível na lista de processos enquanto ele sobe.
 * Aceitável em laboratório com credencial de POC; não use com credencial de produção.
 * `sistema` é o systemid do SAPUILandscape.xml (o SID de 3 letras que o SAP GUI mostra).
 *
 * Como o GUI 8.00 abre um atalho (medido 04/09/2026, sapshcut 8000.1.4.10, S4H 758/250):
 *   1. o sapshcut sai com 0 em ~0,3 s e lança um `SAPgui.exe /SHORTCUT="…"`;
 *   2. esse SAPgui.exe é só LANÇADOR: entrega o atalho ao `saplogon.exe` (o pad — se não houver,
 *      ele mesmo inicia um) e SAI com exit 0 em 0,6–1,8 s, sem janela e sem tocar a rede;
 *   3. a sessão nasce DENTRO do saplogon.exe, ~2–6 s depois — janela `SAP_FRONTEND_SESSION`
 *      ('SAP Easy Access' logado, 'SAP' se a credencial foi rejeitada) — e entra no ROT.
 * A versão anterior desta função tomava o passo 2 por "o GUI encerrou sem sessão" e desistia em ~2 s.
 * O sensor certo para o pad é `janelasSapGui()` (o tasklist devolve `N/A` para ele); o ROT só é
 * pago depois que uma janela de sessão existe, porque sem sessão o GetObject consome o prazo inteiro.
 */
export async function abrirSapGui({ sistema, cliente, usuario, senha, idioma = 'PT', transacao, dir = SAPGUI_DIR, esperaMs = 30000 } = {}) {
  if (!sistema) throw new Error('abrirSapGui: informe { sistema } (o systemid do SAPUILandscape.xml)');
  if (!usuario || !senha) throw new Error('abrirSapGui: informe { usuario, senha } — o sapshcut faz o logon');
  const sapshcut = path.join(dir, 'sapshcut.exe');
  if (!fs.existsSync(sapshcut)) throw new Error(`abrirSapGui: sapshcut.exe não achado em ${dir} — SAP GUI instalado?`);

  const args = [`-system=${sistema}`, `-client=${cliente}`, `-user=${usuario}`, `-pw=${senha}`, `-language=${idioma}`];
  if (transacao) args.push(`-command=${transacao}`);
  args.push('-maxgui');
  const antes = new Set((await processosSapGui()).map((p) => p.pid));
  // ⚠ NÃO esperar pelo sapshcut: com sessão viva ele fica de pé (medido — `await execFile` pendura).
  const inicio = Date.now();
  const filho = spawn(sapshcut, args, { detached: true, stdio: 'ignore', windowsHide: false });
  filho.unref();

  const trilha = [];        // o que os sensores mostraram, sem repetir estado igual
  const anotar = (estado) => { if (!trilha.at(-1)?.endsWith(estado)) trilha.push(`+${((Date.now() - inicio) / 1000).toFixed(1)}s ${estado}`); };
  let lancadorNasceu = false;
  let ultimoRot = null;
  let ultimasJanelas = [];
  const usuarioAlvo = String(usuario).toUpperCase();
  while (Date.now() < inicio + esperaMs) {
    const procs = await processosSapGui();
    const novos = procs.filter((p) => !antes.has(p.pid));
    const lancador = novos.filter((p) => /^SAPgui\.exe$/i.test(p.imagem));
    const pad = procs.filter((p) => /^saplogon\.exe$/i.test(p.imagem));
    if (lancador.length) lancadorNasceu = true;
    anotar(`lançador ${lancador.length ? lancador.map((p) => p.pid).join(',') : lancadorNasceu ? 'saiu' : '(ainda não)'} · pad ${pad.length ? pad.map((p) => p.pid).join(',') : '(nenhum)'}`);

    // A sessão vive no pad: assim que o lançador saiu (ou 1,5 s depois de nascer) vale olhar as janelas.
    const horaDeOlhar = pad.length && (lancadorNasceu && !lancador.length || Date.now() - inicio > 1500);
    if (horaDeOlhar) {
      ultimasJanelas = await janelasSapGui();
      const lidas = lerJanelas(ultimasJanelas);
      anotar(`janelas: ${lidas.estado}${lidas.janelas.length ? ` (${lidas.janelas.map((j) => `'${j.titulo}'`).join(', ')})` : ''}`);
      if (lidas.estado === 'sessao') {
        ultimoRot = await sessoesAbertas().catch((e) => ({ erro: e.message, sessoes: [] }));
        const minha = ultimoRot.sessoes?.find((s) => sessaoLogada(s) && s.usuario.toUpperCase() === usuarioAlvo)
          ?? ultimoRot.sessoes?.find(sessaoLogada);
        if (minha) return { ...ultimoRot, conexaoGui: minha.conexao, sessaoGui: minha.sessao, sessao: minha };
        if (ultimoRot.sessoes?.length && ultimoRot.sessoes.every((s) => !sessaoLogada(s))) {
          throw new Error(
            'abrirSapGui: o SAP GUI abriu a TELA DE LOGON do servidor — a credencial não passou ' +
            `(ROT: ${ultimoRot.sessoes.map((s) => `${s.id} ${s.sistema}/${s.mandante} ${s.tcode}`).join(', ')}). ` +
            `Confira -client/-user/-pw. Trilha: ${trilha.join(' | ')}`,
          );
        }
      } else if (lidas.estado === 'pede-senha') {
        throw new Error(
          `abrirSapGui: o SAP Logon abriu o diálogo de senha (${lidas.janelas.map((j) => `'${j.titulo}'`).join(', ')}) — ` +
          `o atalho chegou sem senha aceita. Trilha: ${trilha.join(' | ')}`,
        );
      } else if (lidas.estado === 'mensagem') {
        throw new Error(
          `abrirSapGui: o SAP GUI parou numa mensagem: ${lidas.janelas.map((j) => `'${j.titulo}' [${j.textos.join(' | ')}]`).join(', ')}. ` +
          `Trilha: ${trilha.join(' | ')}`,
        );
      }
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(
    `abrirSapGui: nenhuma sessão logada no ROT em ${esperaMs} ms.\n` +
    `Trilha: ${trilha.join(' | ')}\n` +
    (!lancadorNasceu
      ? 'Nenhum SAPgui.exe chegou a nascer — confira o -system contra o systemid do SAPUILandscape.xml.'
      : 'O lançador saiu e o pad não abriu sessão no prazo — ver docs/receita-gui-scripting.md § A sessão vive no saplogon.exe.') +
    (ultimoRot ? `\nÚltimo ROT: ${JSON.stringify(ultimoRot)}` : '') +
    (ultimasJanelas.length ? `\nÚltimas janelas: ${JSON.stringify(ultimasJanelas)}` : ''),
  );
}

/**
 * As conexões/sessões que o SAP GUI local expõe agora — com o motivo, quando vier vazio.
 *
 * Devolve `{ sessoes, estado, erro, processos }`. Sem sessão LOGADA, `estado` diz QUAL vazio é
 * (`gui-fechado` · `pede-autorizacao` · `logon-pendente` · `pede-senha` · `mensagem` · `sem-janela`,
 * ver `diagnosticarRot`) e `erro` carrega a explicação: nunca mais `{ sessoes: [], erro: null }` mudo.
 *
 * ⚠ SEM sessão de diálogo aberta, o `GetObject("SAPGUI")` do VBS NÃO volta: a chamada consome o
 * timeout inteiro (medido 04/09/2026: 120157/120186/120142 ms em três chamadas seguidas). Por isso
 * o prazo padrão aqui é curto e o estouro vira `erro` — não `{ sessoes: [] }`, que mentia.
 *
 * ⚠ A TELA DE LOGON do servidor também entra no ROT quando o pad a hospeda — como conexão com
 * usuário VAZIO, mandante 000 e tcode S000 (medido 04/09/2026: `/app/con[1]/ses[0] S4H/000 '' S000`).
 * `sessoes` a lista, mas `estado` só é `com-sessao` com alguém logado (`sessaoLogada`).
 */
export async function sessoesAbertas({ timeout = 15000 } = {}) {
  const vbs = `Option Explicit
Dim app, i, j, conn, sess, fso, saida, S
S = Chr(1)
Set fso = CreateObject("Scripting.FileSystemObject")
Set saida = fso.CreateTextFile("${'${SAIDA}'}", True, True)
On Error Resume Next
Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Then
  saida.WriteLine "@erro" & S & Err.Description
  saida.Close
  WScript.Quit 1
End If
On Error Goto 0
For i = 0 To app.Children.Count - 1
  Set conn = app.Children.ElementAt(i)
  For j = 0 To conn.Children.Count - 1
    Set sess = conn.Children.ElementAt(j)
    saida.WriteLine "@ses" & S & i & S & j & S & sess.Id & S & sess.Info.SystemName & S & sess.Info.Client & S & sess.Info.User & S & sess.Info.Transaction
  Next
Next
saida.Close`;
  const { texto, expirou } = await rodarVbs(vbs, { timeout });
  const sessoes = [];
  let erroVbs = null;
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.replace(/^\uFEFF/, '');
    if (!l.trim()) continue;
    const [rotulo, ...c] = l.split(SEP);
    if (rotulo === '@erro') { erroVbs = c.join(' '); continue; }
    if (rotulo === '@ses') {
      sessoes.push({ conexao: Number(c[0]), sessao: Number(c[1]), id: c[2], sistema: c[3], mandante: c[4], usuario: c[5], tcode: c[6] });
    }
  }
  if (sessoes.some(sessaoLogada)) return { sessoes, estado: 'com-sessao', erro: erroVbs, processos: null };
  // Vazio (ou só tela de logon) nunca sai mudo: tasklist (há processo?) + janelas (que janela é?).
  const processos = await processosSapGui();
  // ⚠ As janelas são lidas SEMPRE que há processo — inclusive com sessão de logon no ROT. Antes o
  // `!sessoes.length` pulava a leitura, e o popup do pedágio (que convive com uma conexão no ROT)
  // ficava invisível para o diagnóstico, que respondia `logon-pendente` (item 34/61 da fila).
  const janelas = processos.length ? await janelasSapGui() : [];
  const { estado, explicacao } = diagnosticarRot({ sessoes, expirou, processos, erroVbs, janelas });
  const prazo = expirou ? ` — prazo de ${timeout} ms` : '';
  return { sessoes, estado, processos, erro: `sem sessão no ROT: ${explicacao}${prazo}` };
}

/** Escreve o VBS num arquivo temporário, roda por cscript e devolve o que o VBS gravou. */
async function rodarVbs(vbsTemplate, { timeout = 120000 } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'jbv-gui-'));
  const arqVbs = path.join(base, 'passos.vbs');
  const arqOut = path.join(base, 'saida.txt');
  const vbs = vbsTemplate.replaceAll('${SAIDA}', arqOut.replaceAll('\\', '\\'));
  fs.writeFileSync(arqVbs, vbs, 'latin1');
  let stdout = '';
  let stderr = '';
  let expirou = false;
  try {
    const r = await exec(CSCRIPT, ['//nologo', arqVbs], { timeout, windowsHide: true });
    stdout = r.stdout;
    stderr = r.stderr;
  } catch (e) {
    stdout = e.stdout || '';
    stderr = e.stderr || e.message;
    // ⚠ O timeout do execFile MATA o cscript e deixa o arquivo de saída VAZIO — que é
    // indistinguível de "rodou e não achou nada". Sem esta bandeira, `sessoesAbertas` devolvia
    // `{ sessoes: [], erro: null }` depois de 120 s de espera cega (medido 04/09/2026).
    expirou = e.killed === true || e.signal != null;
  }
  const texto = fs.existsSync(arqOut) ? fs.readFileSync(arqOut, 'utf16le') : '';
  return { texto, stdout, stderr, expirou, arqVbs, arqOut, pasta: base };
}

/**
 * Executa uma lista de passos contra a sessão do SAP GUI e devolve o que cada um leu.
 *
 * ⚠ Isto NÃO prova gravação. A tela pode aceitar tudo e não gravar nada, sem mensagem (medido na
 * SU3). Toda escrita por este canal fecha com `readTable` em OUTRA LUW.
 */
export async function rodarGui(passos, { conexaoGui = 0, sessaoGui = 0, timeout = 120000, manterArquivos = false } = {}) {
  if (!Array.isArray(passos) || !passos.length) throw new Error('rodarGui: informe uma lista de passos (ver ACOES)');
  const vbs = montarVbs(passos, '${SAIDA}')
    .replace('${CONEXAO}', String(conexaoGui))
    .replace('${SESSAO}', String(sessaoGui));
  const r = await rodarVbs(vbs, { timeout });
  const saida = interpretarSaidaGui(r.texto);
  saida.resultados = passos.map((_, i) => resultadoDoPasso(saida, i));
  saida.vbs = r.arqVbs;
  if (!manterArquivos) fs.rmSync(r.pasta, { recursive: true, force: true });
  if (saida.erro) {
    const e = new Error(`GUI Scripting: ${saida.erro}`);
    e.saida = saida;
    throw e;
  }
  return saida;
}

/** Os ids dos controles de um TIPO na tela atual (o id literal muda; o Type, não). */
export async function acharPorTipo(tipo, { raiz = 'wnd[0]', ...opts } = {}) {
  const r = await rodarGui([{ acao: 'achar', valor: tipo, id: raiz }], opts);
  return r.resultados[0]?.ids ?? [];
}

/** A tela agora: transação, programa, dynpro, título, janelas e a statusbar. */
export async function lerTela(opts = {}) {
  const r = await rodarGui([{ acao: 'lerTela' }, { acao: 'lerStatus' }, { acao: 'janelas' }], opts);
  return { tela: r.resultados[0], status: r.resultados[1], janelas: r.resultados[2]?.janelas ?? [] };
}

// ---------- Runtime Analysis (SAT) — medir performance real, quando o ADT não mede ----------
//
// Medido 2026-09-02, S4H 758 mandante 250 (item 30 da fila): o workspace ADT
// `runtime/traces/abaptraces` e a API `cl_atrapi_main_service` chamados de DENTRO de um classrun
// nascem com o trace file completo (header) mas hitlist de 1 linha, `RUNTIME=0` — não medem nada.
// O SAT mede de verdade (4.225 linhas de hitlist, tempos reais, numa SE16N sobre T000): a diferença
// não é o sistema, é o CANAL — o SAT roda dentro da MESMA sessão de diálogo do alvo; o classrun é
// uma requisição HTTP à parte, fora da unidade de medição do kernel. `docs/receita-runtime-analysis-sat.md`.

const SAT_START = 'wnd[0]/usr/tabsTS_START/tabpMESSEN/ssubSTART_REF1:SAPLS_ABAP_TRACE_DATA:0101/';

/** Só `transacao` foi validado por E2E (SE16N); `programa`/`funcao` têm o radio+campo+botão
 * medidos na tela inicial do SAT, mas a navegação de saída pode diferir — sem E2E ainda. */
const SAT_TIPOS = {
  transacao: { radio: 'radSATRDYNPFIELDS-X_TRACE_T', campo: 'ctxtSATRDYNPFIELDS-TRAN_NAME', run: 'btnRUN_1' },
  programa: { radio: 'radSATRDYNPFIELDS-X_TRACE_R', campo: 'ctxtSATRDYNPFIELDS-REPO_NAME', run: 'btnRUN_2' },
  funcao: { radio: 'radSATRDYNPFIELDS-X_TRACE_F', campo: 'ctxtSATRDYNPFIELDS-FMOD_NAME', run: 'btnRUN_3' },
};

/** O hitlist do SAT sai em formato alemão: '311.509' (milhar) e '34,21' (decimal, vírgula). */
export const numeroSat = (v) => {
  if (v == null || v === '') return null;
  return Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/\./g, ''));
};

/**
 * Mede um alvo (transação, hoje; programa/função têm o caminho de entrada pronto mas sem E2E) pelo
 * SAT e devolve o hitlist agregado — a via que MEDE, quando `runtime/traces` do ADT não mede.
 *
 * `passosDentro` são passos (mesma linguagem de `ACOES`) que rodam DEPOIS que o alvo abre — é ali
 * que se dirige a tela do que está sendo medido (preencher campo, F8...). Ao sair, a medição NÃO é
 * salva no sistema (volta por `/n`, sem passar por popup de gravação).
 */
export async function medirComSat({ tipo, alvo, passosDentro = [] }, opts = {}) {
  const cfgTipo = SAT_TIPOS[tipo];
  if (!cfgTipo) throw new Error(`medirComSat: tipo deve ser um de ${Object.keys(SAT_TIPOS).join(', ')}`);
  if (!alvo) throw new Error('medirComSat: informe { alvo }');

  await rodarGui([
    { acao: 'transacao', valor: 'SAT' },
    { acao: 'selecionar', id: SAT_START + cfgTipo.radio }, // GuiRadioButton.Text é READONLY — precisa ser .Select
    { acao: 'texto', id: SAT_START + cfgTipo.campo, valor: alvo },
    { acao: 'pressionar', id: SAT_START + cfgTipo.run },
  ], opts);

  if (passosDentro.length) await rodarGui(passosDentro, opts);

  // volta ao SAT: F3 pode estar desabilitado numa tela (medido na lista de resultado da SE16N) —
  // por isso o botão "voltar" da toolbar padrão como fallback. Critério de parada é achar o
  // hitlist, não a tela — o dynpro do SAT varia (100 no resumo, 300 com o detalhe) mas o shell não.
  let idHit = null;
  for (let tentativa = 0; tentativa < 5 && !idHit; tentativa++) {
    const shells = await acharPorTipo('GuiShell', opts).catch(() => []);
    idHit = shells.find((h) => h.includes('HITLIST'));
    if (idHit) break;
    await rodarGui([{ acao: 'tecla', valor: 3 }], opts).catch(() =>
      rodarGui([{ acao: 'pressionar', id: 'wnd[0]/tbar[0]/btn[3]' }], opts).catch(() => {}));
  }
  if (!idHit) {
    await rodarGui([{ acao: 'transacao', valor: '/n' }], opts).catch(() => {});
    throw new Error('medirComSat: hitlist não encontrado — a medição não abriu ou passosDentro não terminou nela');
  }

  const idRelativo = idHit.replace(/^\/app\/con\[\d+\]\/ses\[\d+\]\//, '');
  const grid = (await rodarGui([{ acao: 'lerGrid', id: idRelativo, linhas: 50, colunas: 8 }], opts)).resultados[0];
  const amostra = Object.values(grid.dados ?? {}).map((l) => ({
    ...l,
    ANZAHL: Number(l.ANZAHL),
    BRUTTO: numeroSat(l.BRUTTO),
    NETTO: numeroSat(l.NETTO),
    PROZ_BRUTTO: numeroSat(l.PROZ_BRUTTO),
    PROZ_NETTO: numeroSat(l.PROZ_NETTO),
  }));

  await rodarGui([{ acao: 'transacao', valor: '/n' }], opts).catch(() => {});
  return { total: grid.linhas, amostra };
}

/** A medição tem dado real — não o hitlist de 1 linha e RUNTIME=0 que `runtime/traces` (ADT) e a
 * API instant trace devolvem quando chamadas de dentro do classrun. */
export const mediuDeVerdade = (resultado) => resultado.total > 1 && resultado.amostra.some((l) => l.NETTO > 0);

/** Fecha a conexão do SAP GUI (todas as sessões dela). Chamar no `finally` de quem abriu. */
export async function fecharSapGui({ conexaoGui = 0 } = {}) {
  const vbs = `Option Explicit
Dim app, conn, fso, saida, S
S = Chr(1)
Set fso = CreateObject("Scripting.FileSystemObject")
Set saida = fso.CreateTextFile("${'${SAIDA}'}", True, True)
On Error Resume Next
Set app = GetObject("SAPGUI").GetScriptingEngine
If Err.Number <> 0 Or app.Children.Count = 0 Then
  saida.WriteLine "@nada" & S & "sem conexao"
  saida.Close
  WScript.Quit 0
End If
Set conn = app.Children.ElementAt(${conexaoGui})
conn.CloseSession "ses[0]"
conn.CloseConnection
saida.WriteLine "@fechada" & S & Err.Number & S & Err.Description
saida.Close`;
  const { texto } = await rodarVbs(vbs);
  return { fechada: texto.includes('@fechada'), texto: texto.trim() };
}
