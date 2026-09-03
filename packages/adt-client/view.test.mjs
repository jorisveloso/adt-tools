// view.test.mjs — testes PUROS do módulo de view clássica. Nada de rede.
import { describe, it, expect } from 'vitest';
import { validarView, buildViewDriverSource, parseViewOutput, CLASSES_VIEW } from './view.mjs';

const banco = {
  name: 'YJBV_POC_V45_V',
  description: 'POC 45 view de banco A x B',
  viewClass: 'database',
  tables: ['YJBV_POC_V45_A', 'YJBV_POC_V45_B'],
  fields: [
    { name: 'MANDT', table: 'YJBV_POC_V45_A', field: 'MANDT', key: true },
    { name: 'ID', table: 'YJBV_POC_V45_A', field: 'ID', key: true },
    { name: 'SEQ', table: 'YJBV_POC_V45_B', field: 'SEQ', key: true },
    { name: 'TITULO', table: 'YJBV_POC_V45_A', field: 'TITULO' },
    { name: 'VALOR', table: 'YJBV_POC_V45_B', field: 'VALOR' },
  ],
  joins: [
    { leftTable: 'YJBV_POC_V45_A', leftField: 'MANDT', rightTable: 'YJBV_POC_V45_B', rightField: 'MANDT' },
    { leftTable: 'YJBV_POC_V45_A', leftField: 'ID', rightTable: 'YJBV_POC_V45_B', rightField: 'ID' },
  ],
  viewGrant: 'R',
};

const manutencao = {
  name: 'YJBV_POC_V45_M',
  description: 'POC 45 view de manutencao',
  viewClass: 'maintenance',
  tables: ['YJBV_POC_V45_A'],
  fields: [
    { name: 'MANDT', table: 'YJBV_POC_V45_A', field: 'MANDT', key: true },
    { name: 'ID', table: 'YJBV_POC_V45_A', field: 'ID', key: true },
    { name: 'TITULO', table: 'YJBV_POC_V45_A', field: 'TITULO' },
  ],
};

describe('validarView — guard-rails antes da rede', () => {
  it('aceita a view de banco medida', () => {
    expect(validarView(banco)).toEqual({ C: 'D', raiz: 'YJBV_POC_V45_A' });
  });

  it('aceita a view de manutenção de uma tabela só, sem join', () => {
    expect(validarView(manutencao)).toEqual({ C: 'C', raiz: 'YJBV_POC_V45_A' });
  });

  it('recusa nome fora do namespace Z/Y', () => {
    expect(() => validarView({ ...banco, name: 'V_T001' })).toThrow();
  });

  it('recusa viewClass desconhecido', () => {
    expect(() => validarView({ ...banco, viewClass: 'projection' })).toThrow(/viewClass "projection"/);
  });

  it('recusa view sem tabela e sem campo', () => {
    expect(() => validarView({ ...banco, tables: [] })).toThrow(/ao menos uma tabela/);
    expect(() => validarView({ ...banco, fields: [] })).toThrow(/ao menos um campo/);
  });

  it('recusa campo que aponta para tabela fora de { tables }', () => {
    const f = [...banco.fields, { name: 'X', table: 'T000', field: 'MANDT' }];
    expect(() => validarView({ ...banco, fields: f })).toThrow(/T000.*não está em/);
  });

  it('recusa rootTable que não está em { tables }', () => {
    expect(() => validarView({ ...banco, rootTable: 'T000' })).toThrow(/rootTable "T000"/);
  });

  it('recusa duas tabelas sem join — o produto cartesiano nunca é o pedido', () => {
    expect(() => validarView({ ...banco, joins: [] })).toThrow(/nenhum join/);
  });

  it('recusa join incompleto', () => {
    expect(() => validarView({ ...banco, joins: [{ leftTable: 'A', leftField: 'ID' }] })).toThrow(/joins são/);
  });
});

describe('buildViewDriverSource — a forma medida do driver', () => {
  const src = buildViewDriverSource('Y_VIEW_DRV', banco);

  it('monta DD25V com aggtype V, a classe e a tabela raiz', () => {
    expect(src).toContain("aggtype = 'V'");
    expect(src).toContain("viewclass = 'D'");
    expect(src).toContain("roottab = 'YJBV_POC_V45_A'");
    expect(src).toContain("authclass = '00'");
  });

  it('marca fortabname só na tabela raiz', () => {
    expect(src).toContain("( tabname = 'YJBV_POC_V45_A' tabpos = '0001' fortabname = 'YJBV_POC_V45_A' )");
    expect(src).toContain("( tabname = 'YJBV_POC_V45_B' tabpos = '0002' )");
  });

  it('numera os campos por objpos e carrega o keyflag', () => {
    expect(src).toContain("objpos = '0001' viewfield = 'MANDT'");
    expect(src).toContain("objpos = '0005' viewfield = 'VALOR'");
    expect(src).toMatch(/viewfield = 'ID'[^\n]*keyflag = 'X'/);
    expect(src).toMatch(/viewfield = 'TITULO'[^\n]*keyflag = ''/);
  });

  it('põe o join na DD28J com source S — não na DD28V', () => {
    expect(src).toContain("lt_28j = VALUE #( viewname = 'YJBV_POC_V45_V' source = 'S'");
    expect(src).toContain("( ltab = 'YJBV_POC_V45_A' lfield = 'ID' rtab = 'YJBV_POC_V45_B' rfield = 'ID' operator = 'EQ' )");
  });

  it('passa dd28j E dd28v juntas — sozinha, o PUT dá view_inconsistent (medido)', () => {
    expect(src).toContain('dd28j_tab = lt_28j dd28v_tab = lt_28');
  });

  it('sem join não declara nenhuma das duas tabelas de condição', () => {
    const m = buildViewDriverSource('Y_VIEW_M', manutencao);
    expect(m).not.toContain('dd28j_tab');
    expect(m).not.toContain('dd28v_tab');
    expect(m).toContain("viewclass = 'C'");
  });

  it('escreve a TADIR pelo TR_TADIR_INTERFACE, que o PUT não faz', () => {
    expect(src).toContain("wi_tadir_object = 'VIEW'");
    expect(src).toContain("wi_tadir_devclass = '$TMP'");
    expect(src).toContain("wi_test_modus = space");
  });

  it('ativa por DDIF_VIEW_ACTIVATE e NÃO lê a view na mesma sessão (o load antigo dumpa)', () => {
    expect(src).toContain("CALL FUNCTION 'DDIF_VIEW_ACTIVATE'");
    expect(src).not.toMatch(/SELECT[\s\S]*FROM yjbv_poc_v45_v/i);
  });

  it('leva o pacote e a ordem informados', () => {
    const t = buildViewDriverSource('Y_V', { ...banco, pkg: '$YJBV', transport: 'S4HK912345' });
    expect(t).toContain("wi_tadir_devclass = '$YJBV'");
    expect(t).toContain("wi_tadir_korrnum = 'S4HK912345'");
  });

  it('corta a descrição em 60 caracteres (DD25T-DDTEXT)', () => {
    const t = buildViewDriverSource('Y_V', { ...banco, description: 'x'.repeat(80) });
    expect(t).toContain(`ddtext = '${'x'.repeat(60)}'`);
  });
});

describe('parseViewOutput', () => {
  it('lê o ciclo completo bem-sucedido', () => {
    const r = parseViewOutput([
      'VIEW_PUT YJBV_POC_V45_V subrc=0 ',
      'VIEW_TADIR YJBV_POC_V45_V subrc=0 ',
      'VIEW_ACTIVATE YJBV_POC_V45_V subrc=0 rc=0 ',
    ].join('\n'));
    expect(r.ok).toBe(true);
    expect(r.aviso).toBe(false);
    expect(r.ativacao).toEqual({ subrc: 0, rc: 0, msg: '' });
  });

  it('rc=4 é ativação COM AVISO — ainda ok (medido na view de manutenção)', () => {
    const r = parseViewOutput([
      'VIEW_PUT YJBV_POC_V45_M subrc=0 ',
      'VIEW_TADIR YJBV_POC_V45_M subrc=0 ',
      'VIEW_ACTIVATE YJBV_POC_V45_M subrc=0 rc=4 End phase 014',
    ].join('\n'));
    expect(r.ok).toBe(true);
    expect(r.aviso).toBe(true);
    expect(r.ativacao.msg).toBe('End phase 014');
  });

  it('subrc 3 do PUT (view_inconsistent) reprova', () => {
    const r = parseViewOutput('VIEW_PUT Y_V subrc=3 \nVIEW_TADIR Y_V subrc=0 \nVIEW_ACTIVATE Y_V subrc=0 rc=0 ');
    expect(r.ok).toBe(false);
    expect(r.put.subrc).toBe(3);
  });

  it('rc >= 8 reprova mesmo com subrc 0', () => {
    const r = parseViewOutput('VIEW_PUT Y_V subrc=0 \nVIEW_TADIR Y_V subrc=0 \nVIEW_ACTIVATE Y_V subrc=0 rc=8 ');
    expect(r.ok).toBe(false);
  });

  it('saída vazia não vira sucesso', () => {
    expect(parseViewOutput('').ok).toBe(false);
  });
});

describe('CLASSES_VIEW', () => {
  it('traz só os dois VIEWCLASS medidos', () => {
    expect(CLASSES_VIEW).toEqual({ database: 'D', maintenance: 'C' });
  });
});
