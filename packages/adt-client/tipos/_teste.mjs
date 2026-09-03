// tipos/_teste.mjs — os testes que TODO módulo de tipo tem (chamados de cada <libKey>.test.mjs).
// O que é específico do tipo — o snapshot do XML provado, o path aninhado, o body com variantes —
// fica no arquivo irmão, ao lado do módulo. Aqui só o que se repete.
import { test, expect } from 'vitest';
import { validarModulo, semPrefixo } from './_registro.mjs';

export const N = 'ZX_SNAP', P = '$TMP', D = 'Desc & <x> "y"';

export function testesComuns(mod) {
  const k = mod.libKey;
  test(`${k}: cumpre o esquema (validarModulo)`, () => {
    expect(() => validarModulo(mod, `${k}.mjs`)).not.toThrow();
  });
  test(`${k}: o exemplo passa pela parte pura do deploy sem tocar a rede`, () => {
    const o = mod.exemplo.opts;
    // `$` + Z/Y = pacote local (ver assertZY). Com `zyPeloContainer`, quem é Z/Y é o contêiner:
    // o nome do include de FUGR é imposto pelo SAP (L<GRUPO><SUFIXO>) e nunca começa com Z/Y.
    // Com `nomeacao.prefixo` (lock object: E), o Z/Y é o que vem depois do prefixo.
    expect(semPrefixo(mod, o[mod.zyPeloContainer ? mod.container.param : 'name'])).toMatch(/^\$?[YZ]/i);
    expect(() => mod.validar?.(o)).not.toThrow();
    if (mod.nomeacao) expect(String(o.name).length).toBeLessThanOrEqual(mod.nomeacao.max);
  });
  test(`${k}: os testes ABAP referenciam o objeto do exemplo, e a prova sai do nome`, () => {
    expect(mod.testes.length).toBeGreaterThan(0);
    const nome = String(mod.exemplo.opts.name).toLowerCase();
    for (const t of mod.testes) if (t.abap) expect(t.abap.toLowerCase(), t.descricao).toContain(nome);
    const p = mod.prova(mod.exemplo.opts.name, mod.exemplo.opts);
    expect(p.where.join(' ').toUpperCase()).toContain(nome.toUpperCase());
    expect(p.campos.length).toBeGreaterThan(0);
  });
  test(`${k}: conhecimento tem fonte (origem), cada erro tem conserto, cada desmentido tem medição`, () => {
    expect(mod.origem.length).toBeGreaterThan(0);
    for (const e of mod.erros) { expect(e.causa).toBeTruthy(); expect(e.correcao).toBeTruthy(); }
    for (const d of mod.desmentidos) { expect(d.crenca).toBeTruthy(); expect(d.fato).toBeTruthy(); expect(d.medido.sistema).toBeTruthy(); }
  });
}
