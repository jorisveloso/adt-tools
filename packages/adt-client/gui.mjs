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

/** PURO: a saída CSV do `tasklist /V` vira `[{ pid, titulo }]` — o sensor barato de "o GUI subiu?". */
export function interpretarTasklist(csv) {
  const procs = [];
  for (const linha of String(csv).split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const campos = [...linha.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]);
    if (campos.length < 2 || !/^SAPgui\.exe$/i.test(campos[0])) continue;
    const bruto = campos.at(-1) ?? '';
    // ⚠ "GDI+ Window (sapgui.exe)" é janela de INFRAESTRUTURA — o processo a cria antes (e sem)
    // qualquer tela de usuário. Tomá-la por janela real manda consultar o ROT à toa (medido).
    const titulo = /^N\/A$/i.test(bruto) || /^GDI\+ Window/i.test(bruto) ? '' : bruto;
    procs.push({ pid: Number(campos[1]), titulo });
  }
  return procs;
}

/** Os processos SAPgui.exe vivos agora. Barato — ao contrário do ROT, que custa 120 s sem sessão. */
export async function processosSapGui() {
  const tasklist = `${process.env.WINDIR || 'C:\\Windows'}\\System32\\tasklist.exe`;
  const r = await exec(tasklist, ['/FI', 'IMAGENAME eq SAPgui.exe', '/FO', 'CSV', '/NH', '/V'],
    { windowsHide: true, timeout: 10000 }).catch((e) => ({ stdout: e.stdout || '' }));
  return interpretarTasklist(r.stdout);
}

/**
 * Abre uma sessão de diálogo no SAP GUI pelo `sapshcut` e espera ela aparecer no ROT.
 *
 * ⚠ A senha vai na LINHA DE COMANDO do sapshcut — visível na lista de processos enquanto ele sobe.
 * Aceitável em laboratório com credencial de POC; não use com credencial de produção.
 * `sistema` é o systemid do SAPUILandscape.xml (o SID de 3 letras que o SAP GUI mostra).
 *
 * ⚠ O ROT NÃO serve para pilotar a espera: sem sessão, `sessoesAbertas()` custa 120 s (medido
 * 04/09/2026 — três chamadas seguidas: 120157/120186/120142 ms; é o `cscript` batendo no próprio
 * timeout, e o erro era engolido). Quem amostra é o `tasklist`; o ROT só é consultado quando já
 * existe um SAPgui.exe COM janela. Ver docs/receita-gui-scripting.md § Quando não abre sessão.
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

  const trilha = [];    // o que o tasklist mostrou, sem repetir estado igual
  let nasceu = false;   // um SAPgui.exe NOVO chegou a existir
  let ultimoRot = null;
  while (Date.now() < inicio + esperaMs) {
    const novos = (await processosSapGui()).filter((p) => !antes.has(p.pid));
    const estado = novos.length
      ? novos.map((p) => `${p.pid}:${p.titulo || '(ainda sem janela)'}`).join(', ')
      : '(nenhum SAPgui.exe novo)';
    if (!trilha.at(-1)?.endsWith(estado)) trilha.push(`+${((Date.now() - inicio) / 1000).toFixed(1)}s ${estado}`);
    if (novos.length) {
      nasceu = true;
      // Só agora vale pagar o ROT: sem processo com janela, a consulta seria espera cega de 120 s.
      if (novos.some((p) => p.titulo)) {
        ultimoRot = await sessoesAbertas().catch((e) => ({ erro: e.message, sessoes: [] }));
        if (ultimoRot.sessoes?.length) return ultimoRot;
      }
    } else if (nasceu) {
      throw new Error(
        'abrirSapGui: o SAP GUI subiu e ENCERROU sem abrir sessão — o logon automático não completou.\n' +
        `Trilha: ${trilha.join(' | ')}\n` +
        'Medido em 04/09/2026 (SAP GUI 8.00, sapshcut 8000.1.4.10, S4H 758): isto acontece com ' +
        'usuário que EXISTE no sistema, com ou sem -pw e com senha certa ou errada — o -pw não é ' +
        'a causa. Ver docs/receita-gui-scripting.md § Quando o sapshcut não abre sessão.',
      );
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(
    `abrirSapGui: nenhuma sessão no ROT em ${esperaMs} ms.\n` +
    `Trilha do SAPgui.exe: ${trilha.join(' | ')}\n` +
    (!nasceu
      ? 'Nenhum SAPgui.exe chegou a nascer — confira o -system contra o systemid do ' +
        'SAPUILandscape.xml e se o dispatcher responde.'
      : trilha.some((t) => !/ainda sem janela|nenhum SAPgui/.test(t))
        ? 'O processo está de pé COM janela mas não expõe sessão — se a janela é a tela de logon, ' +
          'o logon automático não passou (confira -system/-client/-user).'
        : 'O processo está de pé mas NUNCA abriu janela de usuário — é o quadro medido em ' +
          '04/09/2026 com usuário que existe no sistema, e o -pw não é a causa (medido: sem -pw ' +
          'dá o mesmo). Ver docs/receita-gui-scripting.md § Quando o sapshcut não abre sessão.') +
    (ultimoRot ? `\nÚltimo ROT: ${JSON.stringify(ultimoRot)}` : ''),
  );
}

/**
 * As conexões/sessões que o SAP GUI local expõe agora. Vazio = GUI fechado ou ainda logando.
 *
 * ⚠ SEM sessão de diálogo aberta, o `GetObject("SAPGUI")` do VBS NÃO volta: a chamada consome o
 * timeout inteiro (medido 04/09/2026: 120157/120186/120142 ms em três chamadas seguidas). Por isso
 * o prazo padrão aqui é curto e o estouro vira `erro` — não `{ sessoes: [] }`, que mentia.
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
  let erro = expirou
    ? `o GetObject("SAPGUI") não respondeu em ${timeout} ms — é o que acontece quando NÃO há sessão `
      + 'de diálogo aberta (não conclua "scripting desligado" a partir disto)'
    : null;
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.replace(/^\uFEFF/, '');
    if (!l.trim()) continue;
    const [rotulo, ...c] = l.split(SEP);
    if (rotulo === '@erro') { erro = c.join(' '); continue; }
    if (rotulo === '@ses') {
      sessoes.push({ conexao: Number(c[0]), sessao: Number(c[1]), id: c[2], sistema: c[3], mandante: c[4], usuario: c[5], tcode: c[6] });
    }
  }
  return { sessoes, erro };
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
