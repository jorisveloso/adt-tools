// tipos/_registro.mjs — monta o REGISTRO a partir dos módulos de tipo. PURO (sem I/O): recebe os
// objetos já importados, valida contra o esquema e deriva TYPES / TIPOS / sinônimos / resolução.
// Quem faz o readdir + import() é o index.mjs; separar os dois é o que deixa isto testável com
// módulos falsos.
//
// Regra do projeto (mantida do tipos.mjs antigo): o termo canônico de SAÍDA é o código TADIR de
// 4 letras — nome de pasta, `.meta.json`, mensagens. Sinônimo é conveniência de ENTRADA.

import { ESQUEMA, CAMPOS_OBRIGATORIOS, FORMAS, GANCHO_DA_FORMA, CANAIS, CANAIS_DE_TESTE, ERROS_TRANSVERSAIS } from './_esquema.mjs';

/**
 * Dica para um erro que aconteceu num fluxo deste tipo: procura em `mod.erros` (primeiro) e nos
 * ERROS_TRANSVERSAIS por `status` (o "(NNN)" da mensagem) e/ou `contem` (trecho, sem caixa).
 * PURO. Devolve a string a anexar, ou '' se nada casou.
 */
export function dicaDeErro(mod, err) {
  const msg = String(err?.message ?? err ?? '');
  const status = Number((msg.match(/\((\d{3})\)/) || [])[1]) || undefined;
  const baixo = msg.toLowerCase();
  const casa = (e) => {
    const porStatus = e.status === undefined || e.status === status;
    const porTrecho = !e.contem || baixo.includes(String(e.contem).toLowerCase());
    // regra com só status casa por status; com só contem casa por trecho; com os dois, exige os dois
    return porStatus && porTrecho && (e.status !== undefined ? status !== undefined : true);
  };
  const hit = [...(mod?.erros ?? []), ...ERROS_TRANSVERSAIS].find(casa);
  return hit ? `\n→ causa provável: ${hit.causa}\n→ correção: ${hit.correcao}` : '';
}

// minúsculas, sem acento, espaços colapsados — para "Relatório" casar com "relatorio".
export function normalizar(txt) {
  return String(txt).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

const tipoDe = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida UM módulo contra o esquema. Lança com o nome do arquivo e o que falta — a falha é alta,
 * no carregamento, para um módulo mal escrito nunca entrar em silêncio.
 * @param {object} mod  default export do arquivo
 * @param {string} arquivo  nome do arquivo (`table.mjs`), para a mensagem e para o check libKey===basename
 */
export function validarModulo(mod, arquivo = '?') {
  const erro = (msg) => { throw new Error(`módulo de tipo ${arquivo}: ${msg}`); };
  if (!mod || typeof mod !== 'object') erro('default export precisa ser um objeto');
  for (const c of CAMPOS_OBRIGATORIOS) if (!(c in mod) || mod[c] === undefined) erro(`campo obrigatório ausente: ${c}`);
  for (const [c, v] of Object.entries(mod)) {
    const def = ESQUEMA[c];
    if (!def) erro(`campo desconhecido: ${c} (campos: ${Object.keys(ESQUEMA).join(', ')})`);
    if (v === undefined) continue;
    if (tipoDe(v) !== def.tipo) erro(`campo ${c} deveria ser ${def.tipo}, veio ${tipoDe(v)}`);
  }
  const base = String(arquivo).replace(/\.mjs$/, '');
  if (arquivo !== '?' && mod.libKey !== base) erro(`libKey "${mod.libKey}" ≠ nome do arquivo "${base}"`);
  if (!/^[A-Z]{4}$/.test(mod.codigo)) erro(`codigo "${mod.codigo}" não é um código TADIR de 4 letras maiúsculas`);
  if (!/^[A-Z]{4}\/[A-Z0-9]+$/.test(mod.adtType)) erro(`adtType "${mod.adtType}" não tem a forma TIPO/SUB`);
  if (!mod.adtType.startsWith(mod.codigo + '/')) erro(`adtType "${mod.adtType}" não começa pelo codigo "${mod.codigo}"`);
  if (!(mod.forma in FORMAS)) erro(`forma "${mod.forma}" desconhecida (${Object.keys(FORMAS).join(' | ')})`);
  const gancho = GANCHO_DA_FORMA[mod.forma];
  if (typeof mod[gancho] !== 'function') erro(`forma "${mod.forma}" exige o gancho ${gancho}()`);
  if (mod.container) {
    if (typeof mod.container.libKey !== 'string' || typeof mod.container.param !== 'string') erro('container precisa de { libKey, param }');
    if (typeof mod.path !== 'function') erro('tipo com container exige o gancho path()');
  }
  const sp = mod.spike;
  if (!(sp.data === null || DATA_RE.test(sp.data))) erro(`spike.data "${sp.data}" não é YYYY-MM-DD nem null`);
  if (typeof sp.sistema !== 'string' || !sp.sistema) erro('spike.sistema é obrigatório');
  for (const r of sp.revalidacoes ?? []) {
    if (!DATA_RE.test(r.data) || !r.sistema) erro('spike.revalidacoes[] precisa de { data: YYYY-MM-DD, sistema }');
  }
  if (!Array.isArray(mod.releases.medidos)) erro('releases.medidos precisa ser array');
  const conhecidos = new Set([sp.release, ...(sp.revalidacoes ?? []).map((r) => r.release)].filter(Boolean).map(String));
  for (const r of mod.releases.medidos) {
    if (!conhecidos.has(String(r))) erro(`releases.medidos contém "${r}", que não consta em spike/revalidacoes — não inventar release`);
  }
  for (const s of [...mod.sinonimos, ...(mod.sinonimosDoCodigo ?? [])]) if (typeof s !== 'string' || !s.trim()) erro('sinonimos só aceitam strings não vazias');
  // ---- conhecimento medido: exemplo, testes, erros, prova, dependências, canais, nomeação ----
  for (const c of mod.canais) if (!CANAIS.includes(c)) erro(`canais contém "${c}" — aceitos: ${CANAIS.join(', ')}`);
  for (const o of mod.origem) if (typeof o !== 'string' || !o.trim()) erro('origem só aceita strings não vazias');
  if (!mod.exemplo.opts || typeof mod.exemplo.opts !== 'object') erro('exemplo.opts é obrigatório (as opções de um deploy real)');
  if (!/^[ZY]/i.test(String(mod.exemplo.opts.name ?? ''))) erro(`exemplo.opts.name "${mod.exemplo.opts.name}" precisa ser objeto Z/Y (o guard-rail vale para o exemplo)`);
  if (mod.nomeacao) {
    if (!Number.isInteger(mod.nomeacao.max) || mod.nomeacao.max <= 0 || typeof mod.nomeacao.fonte !== 'string') erro('nomeacao precisa de { max: inteiro > 0, fonte }');
    if (String(mod.exemplo.opts.name).length > mod.nomeacao.max) erro(`exemplo.opts.name estoura nomeacao.max (${mod.nomeacao.max})`);
  }
  mod.testes.forEach((t, i) => {
    if (!CANAIS_DE_TESTE.includes(t.canal)) erro(`testes[${i}].canal "${t.canal}" — aceitos: ${CANAIS_DE_TESTE.join(', ')}`);
    if (typeof t.descricao !== 'string' || !t.descricao) erro(`testes[${i}].descricao é obrigatória`);
    if (t.abap !== undefined && typeof t.abap !== 'string') erro(`testes[${i}].abap precisa ser string`);
    if (t.assert === undefined) erro(`testes[${i}].assert é obrigatório (o que se procura)`);
    if (!Array.isArray(t.medido)) erro(`testes[${i}].medido precisa ser array (vazio = ainda não provado)`);
    for (const m of t.medido) if (!DATA_RE.test(m.data) || !m.sistema) erro(`testes[${i}].medido[] precisa de { data: YYYY-MM-DD, sistema }`);
  });
  mod.erros.forEach((e, i) => {
    if (e.status === undefined && !e.contem) erro(`erros[${i}] precisa de status ou contem`);
    if (e.status !== undefined && !Number.isInteger(e.status)) erro(`erros[${i}].status precisa ser inteiro`);
    if (!e.causa || !e.correcao) erro(`erros[${i}] precisa de causa e correcao`);
  });
  mod.desmentidos.forEach((d, i) => {
    if (!d.crenca || !d.fato) erro(`desmentidos[${i}] precisa de crenca e fato`);
    if (!d.medido || !(d.medido.data === null || DATA_RE.test(d.medido.data)) || !d.medido.sistema) erro(`desmentidos[${i}].medido precisa de { data: YYYY-MM-DD|null, sistema } — desmentido sem medição é folclore ao contrário`);
  });
  mod.dependencias.forEach((d, i) => {
    if (typeof d.tipo !== 'string' || typeof d.papel !== 'string' || typeof d.ativarJunto !== 'boolean') erro(`dependencias[${i}] precisa de { tipo, papel, ativarJunto }`);
  });
  const p = mod.prova(mod.exemplo.opts.name, mod.exemplo.opts);
  if (!p || typeof p.tabela !== 'string' || !Array.isArray(p.campos) || !Array.isArray(p.where) || typeof p.espera !== 'string' || typeof p.medido !== 'boolean') {
    erro('prova(name) precisa devolver { tabela, campos[], where[], espera, medido }');
  }
  return mod;
}

/**
 * Deriva o registro a partir dos módulos (valida cada um de novo — é barato).
 * @returns {{ MODULOS, TYPES, TIPOS, SINONIMOS }}
 *   MODULOS[libKey]  = o módulo inteiro
 *   TYPES[libKey]    = { coll, ct, accept?, source }   — a projeção que o adt-client sempre expôs
 *   TIPOS[codigo]    = { descricao, alvos: [{ libKey, adtType }] }
 *   SINONIMOS[chave] = { codigo, libKeys }              — chave já normalizada
 */
export function montarRegistro(modulos, nomes = []) {
  const MODULOS = {}, TYPES = {}, TIPOS = {}, SINONIMOS = {};
  const porAdtType = {};
  modulos.forEach((mod, i) => {
    validarModulo(mod, nomes[i] ?? `${mod?.libKey}.mjs`);
    if (MODULOS[mod.libKey]) throw new Error(`libKey duplicado: ${mod.libKey}`);
    if (porAdtType[mod.adtType]) throw new Error(`adtType duplicado: ${mod.adtType} (${porAdtType[mod.adtType]} e ${mod.libKey})`);
    MODULOS[mod.libKey] = mod;
    porAdtType[mod.adtType] = mod.libKey;
    const t = { coll: mod.coll, ct: mod.ct, source: mod.source };
    if (mod.accept !== undefined) t.accept = mod.accept;
    TYPES[mod.libKey] = Object.freeze(t);
    const tipo = (TIPOS[mod.codigo] ??= { descricao: '', alvos: [] });
    tipo.alvos.push(Object.freeze({ libKey: mod.libKey, adtType: mod.adtType }));
  });
  for (const t of Object.values(TIPOS)) t.descricao = t.alvos.map((a) => MODULOS[a.libKey].descricao).join(' · ');

  // Sinônimos em duas passadas. (1) nível de código: o código e os `sinonimosDoCodigo` resolvem para
  // TODOS os alvos daquele código. (2) específicos: `sinonimos` + o próprio libKey resolvem para um
  // alvo só. Conflito (mesma chave, alvos diferentes) é erro — EXCETO a auto-chave do libKey quando
  // já está ocupada pelo nível de código do MESMO código: é o caso `prog` (libKey) vs `PROG`
  // (código), que mantém o comportamento antigo de resolver para report + include.
  const registrar = (chave, codigo, libKeys, origem) => {
    const k = normalizar(chave);
    const ja = SINONIMOS[k];
    if (!ja) { SINONIMOS[k] = Object.freeze({ codigo, libKeys: Object.freeze(libKeys) }); return; }
    const igual = ja.codigo === codigo && ja.libKeys.length === libKeys.length && ja.libKeys.every((l) => libKeys.includes(l));
    if (igual) return;
    if (origem === 'auto' && ja.codigo === codigo) return; // libKey == código (prog): vence o nível de código
    throw new Error(`sinônimo "${chave}" ambíguo: já resolve para ${ja.codigo}[${ja.libKeys}] e agora ${codigo}[${libKeys}]`);
  };
  for (const [codigo, t] of Object.entries(TIPOS)) {
    const todos = t.alvos.map((a) => a.libKey);
    registrar(codigo, codigo, todos, 'codigo');
    for (const m of Object.values(MODULOS)) if (m.codigo === codigo) for (const s of m.sinonimosDoCodigo ?? []) registrar(s, codigo, todos, 'codigo');
  }
  for (const m of Object.values(MODULOS)) {
    registrar(m.libKey, m.codigo, [m.libKey], 'auto');
    for (const s of m.sinonimos) registrar(s, m.codigo, [m.libKey], 'sinonimo');
  }
  for (const t of Object.values(TIPOS)) { Object.freeze(t.alvos); Object.freeze(t); }
  return { MODULOS: Object.freeze(MODULOS), TYPES: Object.freeze(TYPES), TIPOS: Object.freeze(TIPOS), SINONIMOS: Object.freeze(SINONIMOS) };
}

/** As funções de resolução, fechadas sobre um registro. Mesmos nomes e contratos do tipos.mjs antigo. */
export function criarResolucao({ MODULOS, TIPOS, SINONIMOS }) {
  /**
   * Igual ao `resolverTipo`, mas devolve `null` em vez de lançar. É o que permite ao `list` distinguir
   * `list TABL` (falta o padrão) de `list Z*` (padrão sem tipo).
   * @returns {{ codigo: string, alvos: Array<{libKey:string, adtType:string}> } | null}
   */
  function resolverTipoOpcional(entrada) {
    const n = normalizar(entrada);
    // Plural é como se fala ("lista as tabelas Z"): tirar o `s` final resolve todos de uma vez.
    for (const chave of n.endsWith('s') ? [n, n.slice(0, -1)] : [n]) {
      const hit = SINONIMOS[chave];
      if (hit) return { codigo: hit.codigo, alvos: TIPOS[hit.codigo].alvos.filter((a) => hit.libKeys.includes(a.libKey)) };
    }
    return null;
  }
  /** Resolve entrada do usuário no vocabulário canônico; lança listando o que é aceito (nunca busca no escuro). */
  function resolverTipo(entrada) {
    const r = resolverTipoOpcional(entrada);
    if (!r) {
      throw new Error(
        `tipo "${entrada}" não reconhecido.\n` +
        `Códigos aceitos: ${Object.keys(TIPOS).join(', ')}\n` +
        `Sinônimos: ${Object.keys(SINONIMOS).join(', ')} (plural também vale)`,
      );
    }
    return r;
  }
  /** adtType do RIS (`TABL/DT`) → o alvo correspondente, ou null se o `checkout` não sabe baixar. */
  function alvoDoAdtType(adtType) {
    for (const [codigo, t] of Object.entries(TIPOS)) {
      const alvo = t.alvos.find((a) => a.adtType === adtType);
      if (alvo) return { codigo, ...alvo };
    }
    return null;
  }
  /** Caminho inverso: libKey → código canônico (nome da pasta no checkout). */
  const codigoDaLibKey = (libKey) => MODULOS[libKey]?.codigo ?? null;
  /** libKeys que o `checkout` sonda para um objeto sem tipo — tipos aninhados ficam de fora (o path exige o contêiner). */
  const todasAsLibKeys = () => Object.values(MODULOS).filter((m) => !m.container).map((m) => m.libKey);
  return { resolverTipo, resolverTipoOpcional, alvoDoAdtType, codigoDaLibKey, todasAsLibKeys };
}
