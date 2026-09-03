// scripts/catalogo.mjs — gera docs/tipos.md, o CATÁLOGO de tipos de objeto, a partir dos módulos
// em tipos/*.mjs. É a lista legível (para o agente e para pessoas) do que a lib trata e como.
//
//   npm run catalogo          # regrava docs/tipos.md
//   npm run catalogo:check    # sai 1 se docs/tipos.md estiver desatualizado (o teste faz o mesmo)
//
// Registro ≠ catálogo (CONTEXT.md): o registro é o que a lib carrega em memória, a cada processo;
// o catálogo é este arquivo, gerado sob demanda por quem adiciona um tipo — NUNCA pela lib em runtime.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MODULOS, SINONIMOS } from '../tipos/index.mjs';
import { ESQUEMA, FORMAS, ERROS_TRANSVERSAIS, DESMENTIDOS_TRANSVERSAIS } from '../tipos/_esquema.mjs';

const ARQUIVO = new URL('../docs/tipos.md', import.meta.url);

const cel = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (v) => (v === undefined || v === '' ? '' : `\`${cel(v)}\``);
const medicao = (m) => `${m.data ?? 's/ data'} · ${m.sistema}${m.release ? ` ${m.release}` : ''}`;
const medicoes = (lista) => (lista?.length ? lista.map(medicao).join('; ') : '');
// Objeto JS legível: chaves sem aspas, strings multi-linha como template literal (copiável).
function jsLiteral(v, ind = '') {
  const i2 = ind + '  ';
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => i2 + jsLiteral(x, i2)).join(',\n')}\n${ind}]` : '[]';
  if (v && typeof v === 'object') {
    const ents = Object.entries(v).filter(([, x]) => x !== undefined);
    return ents.length ? `{\n${ents.map(([k, x]) => `${i2}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${jsLiteral(x, i2)}`).join(',\n')}\n${ind}}` : '{}';
  }
  if (typeof v === 'string' && v.includes('\n')) return '`' + v.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
  return JSON.stringify(v);
}

function sinonimosDe(libKey, codigo) {
  const so = [], doCodigo = [];
  for (const [k, v] of Object.entries(SINONIMOS)) {
    if (v.codigo !== codigo) continue;
    if (v.libKeys.length === 1 && v.libKeys[0] === libKey) so.push(k);
    else if (v.libKeys.includes(libKey) && v.libKeys.length > 1) doCodigo.push(k);
  }
  return { so, doCodigo };
}

export function renderCatalogo(modulos = MODULOS) {
  const mods = Object.values(modulos);
  const L = [];
  const p = (...linhas) => L.push(...linhas);
  p('# Catálogo de tipos de objeto', '');
  p('> **GERADO** por `npm run catalogo` a partir de `tipos/*.mjs` — não editar à mão. Fonte de cada linha é o',
    '> módulo de tipo; mudou o módulo, rode o script (o teste `catalogo.test.mjs` falha se este arquivo ficar para trás).', '');
  p(`${mods.length} tipos de objeto tratados. Vocabulário em [CONTEXT.md](../CONTEXT.md); decisão de um arquivo por tipo em`,
    '[ADR 0001](adr/0001-modulo-por-tipo-descoberto-por-pasta.md).', '');
  p('**Legenda de medição.** *spike* = quando/onde o create+activate foi provado; *medido* num teste = o teste rodou',
    'contra aquele sistema. Vazio = escrito, ainda não provado — não é o mesmo que provado. Os nomes de exemplo',
    'são os objetos `$TMP` das POCs quando havia; os demais estão marcados como reconstituídos/ilustrativos na nota.', '');

  p('## Resumo', '');
  p('| libKey | TADIR | adtType | descrição | forma | source | nome ≤ | spike | releases medidos | canais | contêiner |');
  p('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of mods) {
    p(`| ${code(m.libKey)} | ${m.codigo} | ${code(m.adtType)} | ${cel(m.descricao)} | ${m.forma} | ${m.source ? 'sim' : 'não'} | ${m.nomeacao ? m.nomeacao.max : '?'} | ${cel(medicao(m.spike))} | ${m.releases.medidos.join(', ') || '—'} | ${m.canais.join(', ')} | ${m.container ? code(m.container.libKey) : ''} |`);
  }
  p('', 'Formas de deploy (o que a lib faz com cada uma):', '');
  for (const [f, doc] of Object.entries(FORMAS)) p(`- **${f}** — ${doc}`);
  p('', 'Entrada única: `deploy(conexao, \'<libKey>\', { name, … })` — os nomes antigos (`deploySource`, `deployDataElement`,',
    '`deployClassWithTests`, `deployFunctionModule`, …) continuam exportados como atalhos sobre ela. Um erro em qualquer',
    'fluxo sai com a dica do módulo anexada (`→ causa provável / → correção`), vinda dos `erros` do tipo e dos transversais.', '');

  p('## Por tipo', '');
  for (const m of mods) {
    const { so, doCodigo } = sinonimosDe(m.libKey, m.codigo);
    p(`### \`${m.libKey}\` — ${m.descricao} (${m.adtType})`, '');
    p(`**O que faz.** ${m.oQueFaz}`, '');
    p(`**Como a lib trata.** ${m.comoTrata}`, '');
    p(`- Forma: \`${m.forma}\`${m.container ? ` · aninhado em \`${m.container.libKey}\` (parâmetro \`${m.container.param}\`)` : ''}`);
    p(`- ADT: coleção \`${m.coll}\` · Content-Type \`${m.ct}\`${m.accept ? ` · Accept do GET \`${m.accept}\`` : ''} · /source/main: ${m.source ? 'sim' : 'não'}`);
    p(`- Nome: ${m.nomeacao ? `até ${m.nomeacao.max} caracteres (${m.nomeacao.fonte})` : 'limite não registrado'}`);
    p(`- Entrada aceita: ${so.map((s) => `\`${s}\``).join(', ') || '—'}${doCodigo.length ? ` · para todos os alvos de ${m.codigo}: ${doCodigo.map((s) => `\`${s}\``).join(', ')}` : ''} (plural com "s" também vale)`);
    p(`- Spike: ${medicao(m.spike)}${m.spike.revalidacoes?.length ? ` · revalidado: ${medicoes(m.spike.revalidacoes)}` : ''}`);
    p(`- Releases medidos: ${m.releases.medidos.join(', ') || 'nenhum registrado'}${m.releases.minimo ? ` · mínimo documentado: ${m.releases.minimo}` : ''}`);
    p(`- Canais: ${m.canais.map((c) => `\`${c}\``).join(', ')}`);
    p(`- Ganchos: ${['validar', 'createBody', 'body', 'path', 'deploy', 'antesDeApagar'].filter((g) => typeof m[g] === 'function').map((g) => `\`${g}\``).join(', ') || '—'}`);
    p(`- Origem: ${m.origem.join(' · ')}`);
    if (m.dependencias.length) {
      p('- Depende de:');
      for (const d of m.dependencias) p(`  - \`${d.tipo}\` — ${d.papel}${d.ativarJunto ? ' **(ativar na mesma requisição)**' : ''}`);
    }
    if (m.guardRails.length) {
      p('- Guard-rails do tipo (além dos transversais: só Z/Y, unlock em `finally`, activate depois do unlock):');
      for (const g of m.guardRails) p(`  - ${g}`);
    } else {
      p('- Guard-rails do tipo: nenhum além dos transversais (só Z/Y, unlock em `finally`, activate depois do unlock).');
    }
    p('', '**Exemplo de uso.**' + (m.exemplo.nota ? ` ${m.exemplo.nota}` : ''), '', '```js', `await deploy(conexao, '${m.libKey}', ${jsLiteral(m.exemplo.opts)});`, '```', '');
    const pr = m.prova(m.exemplo.opts.name, m.exemplo.opts);
    p(`**Prova de existência (outra LUW).** \`readTable(cfg, '${pr.tabela}', { campos: ${JSON.stringify(pr.campos)}, where: ${JSON.stringify(pr.where)} })\` → ${pr.espera}${pr.medido ? ' *(medido)*' : ' *(tabela por documentação; não medido)*'}`, '');
    p('**Como testar no ABAP.**', '');
    m.testes.forEach((t, i) => {
      p(`${i + 1}. **\`${t.canal}\`** — ${t.descricao}${t.medido.length ? ` *(medido: ${medicoes(t.medido)})*` : ' *(ainda não provado)*'}`);
      if (t.abap) p('', '   ```abap', ...t.abap.split('\n').map((l) => `   ${l}`), '   ```', '');
      p(`   Assert: ${typeof t.assert === 'string' ? t.assert : '`' + JSON.stringify(t.assert) + '`'}`, '');
    });
    if (m.erros.length) {
      p('**Quando falhar.**', '', '| Sintoma | Causa | Correção |', '|---|---|---|');
      for (const e of m.erros) p(`| ${[e.status ? `HTTP ${e.status}` : '', e.contem ? code(e.contem) : ''].filter(Boolean).join(' · ')} | ${cel(e.causa)} | ${cel(e.correcao)} |`);
      p('');
    }
    if (m.desmentidos.length) {
      p('**Não é assim** (parecia certo; medido o contrário).', '', '| Crença | Fato | Medido |', '|---|---|---|');
      for (const d of m.desmentidos) p(`| ${cel(d.crenca)} | ${cel(d.fato)} | ${cel(medicao(d.medido))} |`);
      p('');
    }
  }

  p('## Erros transversais (valem para todo tipo)', '', '| Sintoma | Causa | Correção |', '|---|---|---|');
  for (const e of ERROS_TRANSVERSAIS) p(`| ${[e.status ? `HTTP ${e.status}` : '', e.contem ? code(e.contem) : ''].filter(Boolean).join(' · ')} | ${cel(e.causa)} | ${cel(e.correcao)} |`);
  p('', '## Não é assim — transversais', '', 'Crenças que parecem certas para qualquer tipo e foram desmentidas por medição. Folclore se regenera sozinho; por isso cada uma leva a data.', '');
  p('| Crença | Fato | Medido |', '|---|---|---|');
  for (const d of DESMENTIDOS_TRANSVERSAIS) p(`| ${cel(d.crenca)} | ${cel(d.fato)} | ${cel(medicao(d.medido))} |`);
  p('');

  p('## Como adicionar um tipo', '');
  p('1. **Spike primeiro.** Prove o create/activate no `$TMP` de um sistema real (coleção e media type vêm do',
    '   `/sap/bc/adt/discovery` daquele sistema, não de memória). Sem spike, não entra.',
    '2. Crie `tipos/<libKey>.mjs` exportando (default) um objeto com **todos** os campos obrigatórios abaixo —',
    '   anote `/** @type {import(\'./_esquema.mjs\').ModuloDeTipo} */` para o editor completar e checar.',
    '   O `libKey` é o nome do arquivo. Não importe `adt-client.mjs` de dentro do módulo.',
    '3. Crie o teste irmão `tipos/<libKey>.test.mjs`: `testesComuns(mod)` de `_teste.mjs` + o snapshot do XML',
    '   que o spike provou. Sem teste irmão, `npm test` falha.',
    '4. Não há índice a editar: a pasta é lida no carregamento. Um módulo inválido derruba o import da lib',
    '   com a mensagem dizendo o arquivo e o campo — rode `npm test`.',
    '5. `npm run catalogo` para regravar este arquivo, e commite os três.', '');
  p('| Campo | Obrigatório | Tipo | O que é |', '|---|---|---|---|');
  for (const [c, d] of Object.entries(ESQUEMA)) p(`| \`${c}\` | ${d.obrigatorio ? 'sim' : 'não'} | ${d.tipo} | ${cel(d.doc)} |`);
  p('');
  return L.join('\n') + '\n';
}

const norm = (s) => String(s).replace(/\r\n/g, '\n');

function main() {
  const gerado = renderCatalogo();
  if (process.argv.includes('--check')) {
    let atual = '';
    try { atual = readFileSync(ARQUIVO, 'utf8'); } catch { /* ausente = desatualizado */ }
    if (norm(atual) !== norm(gerado)) {
      console.error('docs/tipos.md está desatualizado — rode `npm run catalogo`.');
      process.exit(1);
    }
    console.log('docs/tipos.md em dia.');
    return;
  }
  writeFileSync(ARQUIVO, gerado, 'utf8');
  console.log(`docs/tipos.md regravado (${Object.keys(MODULOS).length} tipos).`);
}

const chamadoDireto = process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase();
if (chamadoDireto) main();
