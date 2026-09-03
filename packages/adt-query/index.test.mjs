import { describe, it, expect } from 'vitest';
import { decidirTipo, selecao, montarWhere } from './index.mjs';

describe('decidirTipo — DD02L × TADIR decide canal (medido no s4h)', () => {
  it('tabela pela DD02L TRANSP → readTable', () => {
    expect(decidirTipo({ dd02lTabClass: 'TRANSP', tadirDdls: false })).toBe('tabela');
  });
  it('tabela pela DD02L APPLn / SLASH / POOL / CLUSTER', () => {
    for (const c of ['APPL0', 'APPL1', 'APPL3', 'SLASH', 'POOL', 'CLUSTER']) {
      expect(decidirTipo({ dd02lTabClass: c, tadirDdls: false })).toBe('tabela');
    }
  });
  it('view clássica pela DD02L VIEW', () => {
    expect(decidirTipo({ dd02lTabClass: 'VIEW', tadirDdls: false })).toBe('view');
  });
  it('CDS view analítica só na TADIR (sem DD02L) → view', () => {
    // I_CUSTOMER medido: DD02L vazio, TADIR DDLS presente
    expect(decidirTipo({ dd02lTabClass: null, tadirDdls: true })).toBe('view');
  });
  it('inexistente: vazio na DD02L e sem DDLS na TADIR', () => {
    expect(decidirTipo({ dd02lTabClass: null, tadirDdls: false })).toBe('naoExiste');
  });
  it('estrutura interna (INTTAB) → naoQueryable', () => {
    expect(decidirTipo({ dd02lTabClass: 'INTTAB', tadirDdls: false })).toBe('naoQueryable');
  });
});

describe('selecao — campos do SELECT', () => {
  it('vazio → * (todas as colunas da view)', () => {
    expect(selecao([])).toBe('*');
  });
  it('normaliza para maiúsculo e junta', () => {
    expect(selecao(['customer', 'customerfullname'])).toBe('CUSTOMER, CUSTOMERFULLNAME');
  });
  it('undefined → *', () => {
    expect(selecao(undefined)).toBe('*');
  });
});

describe('montarWhere — linhas do WHERE', () => {
  it('vazio → sem WHERE', () => {
    expect(montarWhere([])).toBe('');
  });
  it('condição simples é a 1ª linha', () => {
    expect(montarWhere(["CUSTOMER = '0001'"])).toBe("\n  WHERE CUSTOMER = '0001'");
  });
  it('encadeia AND/OR e ignora em branco', () => {
    expect(montarWhere(["CUSTOMER = '1'", 'AND FULLNAME LIKE \'%A%\'', '']))
      .toBe("\n  WHERE CUSTOMER = '1' AND FULLNAME LIKE '%A%'");
  });
});