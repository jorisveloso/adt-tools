// gui.test.mjs — parte pura do canal GUI Scripting: guard-rails, VBS gerado e parse da saída.
// Nada aqui abre SAP GUI; o E2E é o do item 34 (docs/receita-gui-scripting.md).
import { test, expect } from 'vitest';
import {
  ACOES, PARAMETROS_SCRIPTING, escVbs, validarPasso, vbsDoPasso, montarVbs,
  interpretarSaidaGui, resultadoDoPasso,
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
