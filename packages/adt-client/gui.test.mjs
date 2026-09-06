// gui.test.mjs — parte pura do canal GUI Scripting: guard-rails, VBS gerado e parse da saída.
// Nada aqui abre SAP GUI; o E2E é o do item 34 (docs/receita-gui-scripting.md).
import { test, expect } from 'vitest';
import {
  ACOES, PARAMETROS_SCRIPTING, escVbs, validarPasso, vbsDoPasso, montarVbs,
  interpretarSaidaGui, resultadoDoPasso, interpretarTasklist, linhaTasklist, diagnosticarRot,
  interpretarJanelas, lerJanelas, sessaoLogada, CLASSE_SESSAO, psJanelas, ehPopupAutorizacao,
  psCancelarDialogos, interpretarCancelamentos, IDCANCEL, vbsFecharConexao,
} from './gui.mjs';

const SEP = '\u0001';

test('gui: guard-rails recusam antes de gerar VBS nenhum', () => {
  expect(() => validarPasso({ acao: 'inventada' }, 0)).toThrow(/ação "inventada" desconhecida/);
  expect(() => validarPasso('texto', 0)).toThrow(/informe \{ acao/);
  expect(() => validarPasso({ acao: 'texto', valor: 'x' }, 3)).toThrow(/passo 3 \(texto\): exige \{ id \}/);
  expect(() => validarPasso({ acao: 'transacao' }, 0)).toThrow(/exige \{ valor \}/);
  expect(() => validarPasso({ acao: 'celulaGrid', id: 'g', valor: 'x' }, 1)).toThrow(/exige \{ linha, coluna, valor \}/);
  expect(() => validarPasso({ acao: 'linhaGrid', id: 'g' }, 2)).toThrow(/exige \{ linha \}/);
  // `tecla` sem id vale: cai em wnd[0], que é onde SendVKey funciona
  expect(validarPasso({ acao: 'tecla', valor: 0 }, 0)).toBe(true);
  expect(() => montarVbs([{ acao: 'texto', valor: 'x' }], 'saida.txt')).toThrow(/exige \{ id \}/);
});

test('gui: escVbs dobra a aspa e mata quebra de linha (literal VBScript não tem escape)', () => {
  expect(escVbs('Ordem "8"')).toBe('Ordem ""8""');
  expect(escVbs('a\r\nb')).toBe('a b');
  expect(escVbs(undefined)).toBe('');
});

test('gui: VBS de cada ação — os gotchas medidos ficam no código gerado', () => {
  // ElementAt, nunca índice cru: `Children(i)` devolve "Bad index type for collection access"
  expect(vbsDoPasso({ acao: 'janelas' }, 0)).toContain('sess.Children.ElementAt(jj)');
  // SendVKey é da JANELA; sem id, wnd[0]
  expect(vbsDoPasso({ acao: 'tecla', valor: 4 }, 1)).toContain('sess.FindById("wnd[0]").SendVKey 4');
  // o DEL_LINE age na SELEÇÃO, não no cursor
  const lg = vbsDoPasso({ acao: 'linhaGrid', id: 'g', linha: 2 }, 2);
  expect(lg).toContain('g.CurrentCellRow = 2');
  expect(lg).toContain('g.SelectedRows = "2"');
  // grid lê por NOME de coluna (ColumnOrder), com teto de linhas/colunas
  const grid = vbsDoPasso({ acao: 'lerGrid', id: 'g', linhas: 3, colunas: 2 }, 3);
  expect(grid).toContain('Set ordem = g.ColumnOrder');
  expect(grid).toContain('If nl > 2 Then nl = 2');
  expect(grid).toContain('If nc > 1 Then nc = 1');
  expect(grid).toContain('g.GetCellValue(li, ordem.ElementAt(co))');
  // table control lê por ÍNDICE de coluna (GetCell) e tolera célula ausente
  const tab = vbsDoPasso({ acao: 'lerTabela', id: 't', linhas: 1, colunas: 6 }, 4);
  expect(tab).toContain('tc.GetCell(li, co).Text');
  expect(tab).toContain('On Error Resume Next');
  expect(vbsDoPasso({ acao: 'fechar' }, 5)).toContain('sess.FindById("wnd[1]").SendVKey 12');
});

test('gui: o VBS completo abre pelo GetObject, checa conexão e grava em arquivo UTF-16', () => {
  const vbs = montarVbs([{ acao: 'transacao', valor: 'VA03' }, { acao: 'lerStatus' }], 'C:\\tmp\\saida.txt');
  expect(vbs).toContain('Set app = GetObject("SAPGUI").GetScriptingEngine');       // PowerShell devolve objeto MUDO
  expect(vbs).toContain('CreateTextFile("C:\\tmp\\saida.txt", True, True)');       // True,True = UTF-16
  expect(vbs).toContain('S = Chr(1)');
  expect(vbs).toContain('nenhuma conexao no SAP GUI');
  expect(vbs).toContain('sess.StartTransaction "VA03"');
  expect(vbs).toContain('Emitir "1|lerStatus"');
  expect(vbs).toContain('Emitir "@fim", passo');
  // a varredura por TIPO existe sempre: o id literal muda por tela e release
  expect(vbs).toContain('Sub Busca(ctrl, tipo, nivel)');
  expect(vbs).toContain('If InStr(ctrl.Type, tipo) > 0');
});

test('gui: um passo que falha não deixa os seguintes rodar (Err não some sozinho no VBS)', () => {
  const vbs = montarVbs([{ acao: 'lerStatus' }, { acao: 'lerTela' }, { acao: 'janelas' }], 'x.txt');
  // cada passo só executa se o Err do anterior ainda estiver limpo — sem isso um erro no passo 0
  // ficaria pendurado e o passo 1/2 rodariam do mesmo jeito, com o erro final atribuído ao passo 2
  const ocorrencias = vbs.match(/If Err\.Number = 0 Then\n {4}passo = \d/g) ?? [];
  expect(ocorrencias.length).toBe(3);
  expect(vbs).toContain('  If Err.Number = 0 Then\n    passo = 0');
  expect(vbs).toContain('  If Err.Number = 0 Then\n    passo = 1');
  expect(vbs).toContain('  If Err.Number = 0 Then\n    passo = 2');
});

test('gui: a conexão/sessão do GUI entram no VBS por índice, não por texto', () => {
  const vbs = montarVbs([{ acao: 'lerTela' }], 'x.txt').replace('${CONEXAO}', '1').replace('${SESSAO}', '2');
  expect(vbs).toContain('Set conn = app.Children.ElementAt(1)');
  expect(vbs).toContain('Set sess = conn.Children.ElementAt(2)');
});

test('gui: parse da saída — sessão, erro e um resultado por passo', () => {
  const texto = [
    `@sessao${SEP}/app/con[0]/ses[0]${SEP}S4H${SEP}250${SEP}MVJVELOSO${SEP}PT`,
    `0|transacao${SEP}VA03${SEP}SAPMV45A${SEP}102`,
    `1|lerStatus${SEP}E${SEP}V1${SEP}302${SEP}O documento SD 9999999999 não existe`,
    `2|janela${SEP}/app/con[0]/ses[0]/wnd[0]${SEP}GuiMainWindow${SEP}Exibir documentos`,
    `2|janela${SEP}/app/con[0]/ses[0]/wnd[1]${SEP}GuiModalWindow${SEP}Restringir intervalo`,
    `@fim${SEP}2`,
  ].join('\r\n');

  const s = interpretarSaidaGui(texto);
  expect(s.sessao).toEqual({ id: '/app/con[0]/ses[0]', sistema: 'S4H', mandante: '250', usuario: 'MVJVELOSO', idioma: 'PT' });
  expect(s.erro).toBe(null);
  expect(s.fim).toBe(2);

  expect(resultadoDoPasso(s, 0)).toEqual({ tipo: 'transacao', tcode: 'VA03', programa: 'SAPMV45A', dynpro: '102' });
  expect(resultadoDoPasso(s, 1)).toEqual({
    tipo: 'lerStatus', msgTipo: 'E', msgId: 'V1', numero: '302',
    texto: 'O documento SD 9999999999 não existe',
  });
  expect(resultadoDoPasso(s, 2).janelas).toHaveLength(2);
  expect(resultadoDoPasso(s, 2).janelas[1].tipo).toBe('GuiModalWindow');
  expect(resultadoDoPasso(s, 9)).toBe(null);
});

test('gui: parse do grid e do table control — células viram { linha: { coluna: valor } }', () => {
  const grid = interpretarSaidaGui([
    `0|grid${SEP}GridView${SEP}5${SEP}17`,
    `0|celula${SEP}0${SEP}MANDT${SEP}000`,
    `0|celula${SEP}0${SEP}MTEXT${SEP}SAP AG`,
    `0|celula${SEP}1${SEP}MANDT${SEP}250`,
    `0|celula${SEP}1${SEP}MTEXT${SEP}Neduca`,
  ].join('\n'));
  expect(resultadoDoPasso(grid, 0)).toEqual({
    tipo: 'grid', subType: 'GridView', linhas: 5, colunas: 17,
    dados: { 0: { MANDT: '000', MTEXT: 'SAP AG' }, 1: { MANDT: '250', MTEXT: 'Neduca' } },
  });

  const tab = interpretarSaidaGui([
    `0|tabela${SEP}16${SEP}16${SEP}25`,
    `0|celula${SEP}0${SEP}0${SEP}10`,
    `0|celula${SEP}0${SEP}1${SEP}EWMS4-21`,
  ].join('\n'));
  const r = resultadoDoPasso(tab, 0);
  expect(r.linhas).toBe(16);
  expect(r.visiveis).toBe(16);
  expect(r.colunas).toBe(25);
  expect(r.dados['0']).toEqual({ 0: '10', 1: 'EWMS4-21' });
});

test('gui: @erro vira o erro do passo que estourou', () => {
  const s = interpretarSaidaGui(`@sessao${SEP}x${SEP}S4H${SEP}250${SEP}U${SEP}PT\n@erro${SEP}passo 2: The control could not be found by id.`);
  expect(s.erro).toMatch(/passo 2: The control could not be found by id/);
});

test('gui: catálogo de ações e de parâmetros de perfil — o que o item 34 mediu', () => {
  expect(ACOES).toContain('celulaGrid');
  expect(ACOES).toContain('toolbarGrid');
  expect(new Set(ACOES).size).toBe(ACOES.length);
  expect(PARAMETROS_SCRIPTING[0]).toBe('sapgui/user_scripting');
  expect(PARAMETROS_SCRIPTING).toHaveLength(5);
});

test('gui: interpretarTasklist lê SAPgui.exe E saplogon.exe e descarta a janela de infraestrutura', () => {
  const csv = [
    '"SAPgui.exe","44840","Console","1","72.140 K","Running","DOM\joris","0:00:01","GDI+ Window (sapgui.exe)"',
    '"SAPgui.exe","3364","Console","1","91.208 K","Running","DOM\joris","0:00:02","Entrada do nome do usuário"',
    '"SAPgui.exe","7556","Console","1","64.000 K","Running","DOM\joris","0:00:00","N/A"',
    'INFO: No tasks are running which match the specified criteria.',
    // medido 04/09/2026: o pad com 'SAP Easy Access' logada ABERTA — e o tasklist diz N/A
    '"saplogon.exe","37016","Console","1","94.756 K","Running","DIR\joris","0:02:30","N/A"',
    '"cscript.exe","100","Console","1","1 K","Running","DIR\joris","0:00:00","N/A"',
  ].join('\r\n');
  const p = interpretarTasklist(csv);
  expect(p).toHaveLength(4);
  // o processo nasceu, mas "GDI+ Window" e "N/A" NÃO são janela de usuário — senão o ROT
  // (15 s sem sessão) seria consultado à toa
  expect(p[0]).toEqual({ pid: 44840, imagem: 'SAPgui.exe', titulo: '' });
  expect(p[1]).toEqual({ pid: 3364, imagem: 'SAPgui.exe', titulo: 'Entrada do nome do usuário' });
  expect(p[2].titulo).toBe('');
  expect(p[3]).toEqual({ pid: 37016, imagem: 'saplogon.exe', titulo: '' });
  expect(interpretarTasklist('')).toEqual([]);
});

test('gui: linhaTasklist força UTF-8 — sem chcp 65001 o título acentuado chega com U+FFFD (medido 04/09/2026)', () => {
  const linha = linhaTasklist('SAPgui.exe');
  // o tasklist escreve na codepage OEM (850); cmd /U, TextDecoder do Node e WMI não resolvem — só o chcp
  expect(linha.startsWith('chcp 65001>nul && tasklist ')).toBe(true);
  // o filtro tem espaço e vai verbatim ao cmd: as aspas têm de estar NA linha, não no quoting do Node
  expect(linha).toContain('/FI "IMAGENAME eq SAPgui.exe"');
  expect(linha).toContain('/FO CSV /NH /V');
  // dois /FI no mesmo tasklist são E, não OU — uma linha por imagem
  expect(linhaTasklist('saplogon.exe')).not.toContain('SAPgui.exe');
});

test('gui: psJanelas blinda o encoding nos DOIS eixos — stdout UTF-8 e P/Invoke Unicode (medido 05/09/2026)', () => {
  const ps = psJanelas();
  // 1) a codepage da SAÍDA: sem isto o PowerShell escreve em OEM 850 e 'usuário' chega 'usu�rio'
  //    (mesmo mal do tasklist, item 17) — e tem de vir ANTES da primeira escrita
  expect(ps.trimStart().startsWith('[Console]::OutputEncoding = [Text.Encoding]::UTF8')).toBe(true);
  expect(ps.indexOf('OutputEncoding')).toBeLessThan(ps.indexOf('Add-Type'));
  // 2) a codepage da LEITURA: sem CharSet.Unicode o P/Invoke liga em GetWindowTextA, que faz
  //    best-fit silencioso (ĄŻ → AZ, — → -) e troca por '?' o que não tem mapa em 1252 (テスト → ???)
  for (const api of ['GetWindowText', 'GetClassName']) {
    expect(ps.split('\n').find((l) => l.includes(`extern int ${api}(`))).toContain('CharSet=CharSet.Unicode');
  }
  // o alvo default continua o par de processos do SAP GUI (o pad vive no saplogon.exe)
  expect(ps).toContain('Get-Process -Name SAPgui,saplogon');
  expect(psJanelas(['powershell'])).toContain('Get-Process -Name powershell');
  // e o formato que interpretarJanelas lê: campos por TAB
  expect(ps).toContain('+"\\t"+pid+"\\t"');
  // 3) o texto MULTILINHA de um Static (medido 05/09/2026, item 63: a caixa 'SAP GUI' traz as três
  //    linhas da mensagem num Static só). Sem quebrar por \n, a linha emitida ganha quebras no meio
  //    e interpretarJanelas — que lê UMA janela por linha — descarta tudo depois da primeira.
  expect(ps).toContain("Split('\\n')");
  expect(ps).toContain('static string Uma(string s)');
  expect(ps).toContain('Uma(Txt(h))'); // o título também passa pela limpeza: o TAB é o separador
});

// Janelas medidas em 04/09/2026 (SAP GUI 8.00 PT, S4H 758/250), no formato que o PowerShell emite.
const J = {
  pad: 'saplogon.exe\t42432\t#32770\tSAP Logon 800\tConnections | Footer\t591234',
  logada: 'saplogon.exe\t42432\tSAP_FRONTEND_SESSION\tSAP Easy Access\t',
  telaLogon: 'saplogon.exe\t42432\tSAP_FRONTEND_SESSION\tSAP\t',
  pedeSenha: 'saplogon.exe\t37016\t#32770\tLigação SAP GUI - logon (S4H, 250, PT, )\tEntrar o nome de usuário e a senha | Nome do usuário: | Senha:',
  mensagem: 'SAPgui.exe\t48000\t#32770\tSAP GUI\tNem todos os dados estão disponíveis p/ligação a SAP GUI: | ID sistema desconhecido | Entrar os dados em falta',
  // o pedágio (medido 05/09/2026, item 60): MESMO pid do pad, título 'SAP Logon' SEM a versão
  pedagio: 'saplogon.exe\t42432\t#32770\tSAP Logon\tUm script está tentando acessar SAP GUI\t3868398',
};

test('gui: interpretarJanelas lê a saída TAB do PowerShell, com os textos do diálogo', () => {
  const js = interpretarJanelas([J.pad, J.mensagem, ''].join('\r\n'));
  expect(js).toHaveLength(2);
  expect(js[0]).toEqual({ imagem: 'saplogon.exe', pid: 42432, classe: '#32770', titulo: 'SAP Logon 800', textos: ['Connections', 'Footer'], hwnd: 591234 });
  // o hwnd é o ENDEREÇO para agir (cancelarPedagio); linha antiga sem ele continua lida, com null
  expect(js[1].hwnd).toBe(null);
  expect(js[1].imagem).toBe('SAPgui.exe');
  expect(js[1].textos).toEqual(['Nem todos os dados estão disponíveis p/ligação a SAP GUI:', 'ID sistema desconhecido', 'Entrar os dados em falta']);
  expect(interpretarJanelas('')).toEqual([]);
});

test('gui: lerJanelas — a sessão vive no saplogon.exe e se reconhece pela CLASSE, não pelo título', () => {
  expect(CLASSE_SESSAO).toBe('SAP_FRONTEND_SESSION');
  const de = (...linhas) => lerJanelas(interpretarJanelas(linhas.join('\n')));
  // logada e tela de logon do servidor têm a MESMA classe — quem separa é o ROT
  expect(de(J.pad, J.logada).estado).toBe('sessao');
  expect(de(J.pad, J.telaLogon).estado).toBe('sessao');
  expect(de(J.pad, J.logada).janelas.map((j) => j.titulo)).toEqual(['SAP Easy Access']);
  // sem -pw: o pad pede a senha (diálogo, não sessão)
  expect(de(J.pad, J.pedeSenha).estado).toBe('pede-senha');
  // -conn=/H/… sem -sysname=: caixa de mensagem com o texto
  const m = de(J.mensagem);
  expect(m.estado).toBe('mensagem');
  expect(m.janelas[0].textos).toContain('ID sistema desconhecido');
  // só o pad de pé: não é sessão, não é erro
  expect(de(J.pad).estado).toBe('so-pad');
  expect(de().estado).toBe('nenhuma');
});

test('gui: o pedágio é estado próprio e vence a sessão — o popup convive com o SAP Easy Access visível (item 34)', () => {
  const de = (...linhas) => lerJanelas(interpretarJanelas(linhas.join('\n')));
  // o critério medido é o título SEM versão: o pad ('SAP Logon 800') NÃO é o popup
  expect(ehPopupAutorizacao({ classe: '#32770', titulo: 'SAP Logon', textos: [] })).toBe(true);
  expect(ehPopupAutorizacao({ classe: '#32770', titulo: 'SAP Logon 800', textos: ['Connections'] })).toBe(false);
  // reforço pelo texto, para o caso de outro idioma mudar o título ('Skript')
  expect(ehPopupAutorizacao({ classe: '#32770', titulo: 'SAP GUI Security', textos: ['A script is trying to attach'] })).toBe(true);
  expect(ehPopupAutorizacao({ classe: CLASSE_SESSAO, titulo: 'SAP Logon' })).toBe(false);

  // ⚠ o retrato do item 34: popup + sessão LOGADA visível ao mesmo tempo. Quem responder `sessao`
  // faz o diagnóstico dizer "é a TELA DE LOGON" — e a sessão está logada, o que falta é o OK.
  expect(de(J.pad, J.logada, J.pedagio).estado).toBe('autorizacao');
  expect(de(J.pad, J.logada, J.pedagio).janelas.map((j) => j.titulo)).toEqual(['SAP Logon']);
  expect(de(J.pad, J.logada).estado).toBe('sessao');
  // e o pedágio não engole o diálogo de senha, que também casa /logon/i
  expect(de(J.pad, J.pedeSenha).estado).toBe('pede-senha');
});

test('gui: cancelar o órfão do pedágio NEGA o acesso — o OK é intocável (item 101)', () => {
  // o gesto é por ID de controle, não por rótulo: 'Cancelar'/'Cancel'/'Abbrechen' mudam, o 2 não
  expect(IDCANCEL).toBe(2);
  const ps = psCancelarDialogos([3868398, 12345]);
  expect(ps).toContain('GetDlgItem(h, 2)');
  expect(ps).toContain('[CSap]::Cancelar(3868398)');
  expect(ps).toContain('[CSap]::Cancelar(12345)');
  // BM_CLICK por PostMessage: o diálogo roda o laço modal na thread do pad, e um Send penduraria
  // o PowerShell junto — o que já é o defeito que este item ataca
  expect(ps).toContain('PostMessage(b, 0x00F5');
  expect(ps).not.toContain('SendMessage');
  // ⚠ a trava dura: clicar OK AUTORIZARIA o script — é o aviso de segurança do cliente
  expect(ps).toContain('if(rot.ToUpperInvariant() == "OK") return');
  expect(ps).not.toContain('GetDlgItem(h, 1)');
  // e só toca em #32770: se a janela virou outra coisa entre o sensor e o gesto, não clica
  expect(ps).toContain('if(Cls(h) != "#32770")');
  expect(ps).toContain('if(!IsWindow(h))');
  // o hwnd é numérico na geração — nada de string do chamador virando código PowerShell
  expect(psCancelarDialogos(['9; Remove-Item x'])).toContain('[CSap]::Cancelar(NaN)');
});

test('gui: interpretarCancelamentos lê o que aconteceu com cada órfão', () => {
  const r = interpretarCancelamentos([
    '3868398\tcancelado\tCancelar\tSAP Logon',
    '12345\tsumiu\t\t',
    '999\trecusado-ok\tOK\tSAP Logon',
    '',
  ].join('\r\n'));
  expect(r).toHaveLength(3);
  expect(r[0]).toEqual({ hwnd: 3868398, resultado: 'cancelado', botao: 'Cancelar', titulo: 'SAP Logon' });
  expect(r[1].resultado).toBe('sumiu');
  expect(r[2]).toMatchObject({ resultado: 'recusado-ok', botao: 'OK' });
  expect(interpretarCancelamentos('')).toEqual([]);
});

test('gui: o VBS de fecharSapGui separa "Err no GetObject" de "engine com 0 conexões" (item 101)', () => {
  const vbs = vbsFecharConexao(0);
  // os dois vazios eram um "@nada sem conexao" só — e pedem reações opostas
  expect(vbs).toContain('"@erro"');
  expect(vbs).toContain('"@sem-conexao"');
  expect(vbs).not.toContain('"@nada"');
  // o Children.Count também pode LANÇAR (engine mudo): terceiro caminho, não silêncio
  expect(vbs).toContain('engine sem Children.Count');
  // e o fechamento continua o mesmo gesto, na conexão pedida
  expect(vbsFecharConexao(2)).toContain('app.Children.ElementAt(2)');
  expect(vbs).toContain('conn.CloseSession "ses[0]"');
  expect(vbs).toContain('conn.CloseConnection');
});

test('gui: diagnosticarRot — com o popup de pé o veredito é pede-autorizacao, não logon-pendente (item 34/61)', () => {
  const pad = [{ pid: 42432, imagem: 'saplogon.exe', titulo: '' }];
  const js = (...linhas) => interpretarJanelas(linhas.join('\n'));

  // ROT expirou, popup de pé, sessão logada visível: a versão anterior dizia `logon-pendente`
  const d = diagnosticarRot({ expirou: true, processos: pad, janelas: js(J.pad, J.logada, J.pedagio) });
  expect(d.estado).toBe('pede-autorizacao');
  expect(d.explicacao).toMatch(/o cliente está pedindo autorização/);
  expect(d.explicacao).toMatch(/WarnOnAttach/);
  expect(d.explicacao).not.toMatch(/TELA DE LOGON/);

  // o popup vence até a conexão sem usuário no ROT (a tela de logon hospedada pelo pad)
  const comRot = diagnosticarRot({
    sessoes: [{ id: '/app/con[1]/ses[0]', sistema: 'S4H', mandante: '000', usuario: '', tcode: 'S000' }],
    processos: pad, janelas: js(J.pad, J.pedagio),
  });
  expect(comRot.estado).toBe('pede-autorizacao');

  // ... e vence o Err do GetObject: um popup órfão de chamada anterior explica melhor que o Err
  expect(diagnosticarRot({ erroVbs: 'The remote server machine does not exist', processos: pad, janelas: js(J.pad, J.pedagio) }).estado)
    .toBe('pede-autorizacao');

  // mas NÃO vence uma sessão logada que o ROT devolveu: aí a chamada respondeu, não há o que explicar
  expect(diagnosticarRot({ sessoes: [{ usuario: 'MVJVELOSO' }], processos: pad, janelas: js(J.pad, J.pedagio) }).estado)
    .toBe('com-sessao');
});

test('gui: sessaoLogada — a tela de logon entra no ROT com usuário vazio (medido 04/09/2026)', () => {
  expect(sessaoLogada({ id: '/app/con[0]/ses[0]', sistema: 'S4H', mandante: '250', usuario: 'MVJVELOSO', tcode: 'SESSION_MANAGER' })).toBe(true);
  expect(sessaoLogada({ id: '/app/con[1]/ses[0]', sistema: 'S4H', mandante: '000', usuario: '', tcode: 'S000' })).toBe(false);
  expect(sessaoLogada(undefined)).toBe(false);
});

test('gui: diagnosticarRot separa os vazios do ROT pelo tasklist, não pelo prazo (medido 04/09/2026)', () => {
  // com sessão: nada a explicar
  expect(diagnosticarRot({ sessoes: [{ id: '/app/con[0]/ses[0]', usuario: 'MVJVELOSO' }] }))
    .toEqual({ estado: 'com-sessao', explicacao: null });

  // ⚠ os DOIS casos abaixo expiram IGUAL (medido: 15669 ms com o GUI fechado, 15663 ms com a janela
  // parada no logon) — o `expirou` não separa nada; quem separa é haver SAPgui.exe com janela
  const fechado = diagnosticarRot({ expirou: true, processos: [] });
  expect(fechado.estado).toBe('gui-fechado');
  expect(fechado.explicacao).toMatch(/nenhum SAPgui\.exe nem saplogon\.exe está rodando/);
  expect(fechado.explicacao).toMatch(/^o GetObject\("SAPGUI"\) não respondeu no prazo/);

  // era este que mandava a investigação para RZ11/registro, por vir mudo
  const logon = diagnosticarRot({ expirou: true, processos: [{ pid: 46708, imagem: 'SAPgui.exe', titulo: 'Entrada do nome do usuário' }] });
  expect(logon.estado).toBe('logon-pendente');
  expect(logon.explicacao).toMatch(/TELA DE LOGON/);
  expect(logon.explicacao).toMatch(/46708:Entrada do nome do usuário/);
  expect(logon.explicacao).toMatch(/não mexa em RZ11/);

  // processo de pé sem janela de sessão: pad aberto sem sessão, ou GUI subindo
  const subindo = diagnosticarRot({ expirou: true, processos: [{ pid: 44840, imagem: 'SAPgui.exe', titulo: '' }] });
  expect(subindo.estado).toBe('sem-janela');
  expect(subindo.explicacao).toMatch(/nenhuma janela de sessão/);
  const soPad = diagnosticarRot({ expirou: true, processos: [{ pid: 42432, imagem: 'saplogon.exe', titulo: '' }], janelas: interpretarJanelas(J.pad) });
  expect(soPad.estado).toBe('sem-janela');
  expect(soPad.explicacao).toMatch(/saplogon\.exe:42432/);

  // sem expirar, o mesmo tasklist decide — só muda a frase de abertura
  const vazio = diagnosticarRot({ processos: [{ pid: 7556, imagem: 'SAPgui.exe', titulo: 'S4H' }] });
  expect(vazio.estado).toBe('logon-pendente');
  expect(vazio.explicacao).toMatch(/^o ROT respondeu vazio/);

  // Err do próprio GetObject é o ÚNICO caso que aponta para cliente/servidor
  expect(diagnosticarRot({ erroVbs: 'ActiveX component cant create object' }).estado).toBe('erro-scripting');
});

test('gui: diagnosticarRot enxerga o pad — sessão no ROT sem usuário, janela de sessão, senha pedida, mensagem (medido 04/09/2026)', () => {
  const pad = [{ pid: 42432, imagem: 'saplogon.exe', titulo: '' }];
  // a tela de logon ENTRA no ROT (usuário vazio, mandante 000, S000) — não é sessão logada
  const telaNoRot = diagnosticarRot({ sessoes: [{ id: '/app/con[1]/ses[0]', sistema: 'S4H', mandante: '000', usuario: '', tcode: 'S000' }], processos: pad });
  expect(telaNoRot.estado).toBe('logon-pendente');
  expect(telaNoRot.explicacao).toMatch(/con\[1\]\/ses\[0\] S4H\/000 S000/);
  expect(telaNoRot.explicacao).toMatch(/credencial não passou/);
  // uma logada entre as conexões basta
  expect(diagnosticarRot({ sessoes: [{ usuario: '' }, { usuario: 'MVJVELOSO' }] }).estado).toBe('com-sessao');

  // ROT vazio, mas há janela SAP_FRONTEND_SESSION no pad: tela de logon
  const janelaSessao = diagnosticarRot({ expirou: true, processos: pad, janelas: interpretarJanelas([J.pad, J.telaLogon].join('\n')) });
  expect(janelaSessao.estado).toBe('logon-pendente');
  expect(janelaSessao.explicacao).toMatch(/saplogon\.exe:42432 'SAP'/);

  // o pad pediu a senha (atalho sem -pw)
  const senha = diagnosticarRot({ expirou: true, processos: pad, janelas: interpretarJanelas([J.pad, J.pedeSenha].join('\n')) });
  expect(senha.estado).toBe('pede-senha');
  expect(senha.explicacao).toMatch(/Ligação SAP GUI - logon/);

  // caixa de mensagem: o texto vai na explicação
  const msg = diagnosticarRot({ processos: [{ pid: 48000, imagem: 'SAPgui.exe', titulo: 'SAP GUI' }], janelas: interpretarJanelas(J.mensagem) });
  expect(msg.estado).toBe('mensagem');
  expect(msg.explicacao).toMatch(/ID sistema desconhecido/);
});
