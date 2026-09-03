#!/usr/bin/env node
// adt-git.mjs — CLI. Traz objetos ABAP de um sistema SAP para o disco, via ADT REST.
//
//   node adt-git.mjs connect  <alias>:<mandante>:<idioma>   abre a sessão (pede a senha)
//   node adt-git.mjs list     [TIPO] <padrão>               busca objetos no sistema conectado
//   node adt-git.mjs checkout <objeto>                      grava UM objeto no disco
//   node adt-git.mjs status                                 mostra a sessão atual
//   node adt-git.mjs logout                                 encerra a sessão
//
// `--debug` em qualquer posição liga o rastro (stderr + .abapgit.log) — ver lib/log.mjs.
//
// Só leitura do SAP. Nada é criado, alterado ou apagado no servidor — nem por acidente: as funções
// de escrita existem em lib/adt-client.mjs (são a fase 2) mas nenhum comando daqui as chama.

import { resolverAlvo, destinoDoCliente, carregarSistemas } from '../lib/config.mjs';
import { conectar, sessaoAtual, encerrarSessao } from '../lib/session.mjs';
import { resolverTipo, resolverTipoOpcional, alvoDoAdtType, codigoDaLibKey, todasAsLibKeys, TIPOS } from '../lib/tipos/index.mjs';
import { buscar } from '../lib/search.mjs';
import { getObject, getSource, assertZY, TYPES } from '../lib/adt-client.mjs';
import { pastaDoPacote, gravarOrigem, gravarObjeto, montarMeta } from '../lib/layout.mjs';
import { passo, detalhe, logAtivo, caminhoDoLog, FLAGS } from '../lib/log.mjs';

const USO = `
adt-git — objetos ABAP do SAP para o disco (ADT REST, sem instalar nada no servidor)

  sistemas                               sistemas do SAP GUI e o que falta em cada um
  connect  <alias>:<mandante>:<idioma>   ex: connect d01:100:pt
  list     [TIPO] <padrão>               ex: list TABL Z*   ·   list ZPKG_*  (sem tipo = todos)
                                         tipos: ${Object.keys(TIPOS).join(', ')}
  checkout <objeto> [tipo]               ex: checkout ztb_pedido
  status                                 sessão atual
  logout                                 encerra a sessão

  --debug (-v)                           mostra cada requisição ADT; grava também em .abapgit.log
`;

// Erro de uso/execução previsto. Quem chama `morrer` PARA aqui — o dispatcher imprime e sai com 1.
// Não usa `process.exit()`: matar o processo com socket keep-alive ainda vivo derruba o Node no
// Windows com "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" — o erro real vira um crash.
class ErroDeUso extends Error {}
const morrer = (msg) => { throw new ErroDeUso(msg); };

// ---------- connect ----------
async function cmdConnect(spec) {
  if (!spec) morrer('falta o alvo. Ex.: connect d01:100:pt');
  const cfg = resolverAlvo(spec);
  console.log(`Conectando em ${cfg.alias.toUpperCase()} (${cfg.descricao})`);
  console.log(`  ${cfg.base}  mandante ${cfg.client}  idioma ${cfg.lang}`);
  const d = await conectar(cfg);
  console.log(`\n✓ conectado como ${d.user}. Sessão válida até ${new Date(d.expiraEm).toLocaleTimeString()}.`);
}

// ---------- list ----------
// Duas formas, e a segunda existe porque é a que se usa quando ainda não se sabe o tipo:
//   list TABL Z*   → tipo + padrão, filtro no servidor
//   list ZPKG_*    → só padrão, busca em TODOS os tipos (inclusive os que o checkout não baixa)
async function cmdList(a, b) {
  if (!a) morrer(`falta o padrão. Ex.: list TABL Z*  ou  list Z*  (tipos: ${Object.keys(TIPOS).join(', ')})`);

  let tipoEntrada = null;
  let padrao = a;
  if (b !== undefined) {
    tipoEntrada = a;
    padrao = b;
  } else if (resolverTipoOpcional(a)) {
    // `list TABL` sozinho é tipo sem padrão — dizer "falta o padrão" só faz sentido AQUI.
    morrer(`"${a}" é um tipo, mas falta o padrão de nome. Ex.: list ${a} Z*`);
  }

  const alvo = tipoEntrada ? resolverTipo(tipoEntrada) : null;
  passo(`list: padrão "${padrao}" · tipo ${alvo ? `${alvo.codigo} (${alvo.alvos.map((x) => x.adtType).join(', ')})` : 'nenhum → todos'}`);

  const { session, info } = sessaoAtual();
  const { itens, filtrado, truncado, max } = await buscar(session, padrao, alvo ? alvo.alvos.map((x) => x.adtType) : []);

  if (!itens.length) {
    console.log(`nenhum ${alvo ? alvo.codigo : 'objeto'} casando com "${padrao}" em ${info.alias.toUpperCase()} (mandante ${info.client}).`);
    if (!padrao.includes('*')) console.log(`Dica: o padrão é literal — para prefixo use "${padrao}*".`);
    return;
  }

  const larguraNome = Math.max(4, ...itens.map((i) => i.nome.length));
  const larguraTipo = Math.max(4, ...itens.map((i) => i.tipo.length));
  for (const i of itens) {
    // Sem tipo informado vem de tudo, e o que o `checkout` sabe baixar é um subconjunto: marcar isso
    // aqui evita a viagem "achei no list, mas o checkout diz que não existe".
    const marca = alvo ? '' : `${alvoDoAdtType(i.tipo) ? '✓' : '·'} `;
    console.log(`${marca}${i.nome.padEnd(larguraNome)}  ${i.tipo.padEnd(larguraTipo)}  ${(i.pacote || '-').padEnd(20)}  ${i.descricao || ''}`);
  }

  const rodape = `\n${itens.length} ${alvo ? alvo.codigo : 'objeto(s)'} em ${info.alias.toUpperCase()}${filtrado ? ` (${filtrado} de outros tipos descartados)` : ''}`;
  console.log(alvo ? rodape : `${rodape}  ·  ✓ = o checkout sabe baixar`);

  // Lista cortada tem que DIZER que foi cortada: senão "não apareceu" vira "não existe".
  if (truncado) {
    console.log(`\n⚠️  O servidor cortou em ${max} resultados — ISTO NÃO É A LISTA COMPLETA.`);
    console.log(`   Refine o padrão (ex.: "${padrao.replace(/\*$/, '')}T*") ou informe o tipo para filtrar no servidor.`);
  }
}

// ---------- checkout ----------
async function cmdCheckout(nome, tipoEntrada) {
  if (!nome) morrer('falta o objeto. Ex.: checkout ztb_pedido');
  assertZY(nome); // guard-rail herdado: só Z/Y

  const { session, info } = sessaoAtual();

  // Destino ANTES da rede. Ele não depende do servidor, e resolver depois significava sondar oito
  // tipos, baixar a fonte e só então descobrir que não havia onde gravar — o erro chegava caro.
  const destino = destinoDoCliente(info.cliente);

  // Com tipo informado, sonda só ele. Sem tipo, sonda todos até achar — é uma chamada por tipo,
  // barata o bastante para um objeto só (o `clone` nunca vai poder fazer isso).
  const candidatos = tipoEntrada ? resolverTipo(tipoEntrada).alvos.map((a) => a.libKey) : todasAsLibKeys();
  passo(`checkout: ${String(nome).toUpperCase()} · sondando ${candidatos.length} tipo(s): ${candidatos.join(', ')}`);

  let achado = null;
  for (const libKey of candidatos) {
    const o = await getObject(session, libKey, nome);
    detalhe(`sonda ${libKey}: HTTP ${o.status}${o.exists ? ' ← É ESTE' : ''}`);
    if (o.exists) { achado = { libKey, obj: o }; break; }
  }
  if (!achado) morrer(await porQueNaoAchou(session, info, nome, candidatos));

  const { libKey, obj } = achado;
  const codigo = codigoDaLibKey(libKey);
  const temFonte = !!TYPES[libKey]?.source;

  let source = null;
  if (temFonte) {
    const s = await getSource(session, libKey, nome);
    if (s.status >= 400) morrer(`fonte de ${nome} falhou (${s.status}): ${s.source.slice(0, 200)}`);
    source = s.source;
  }

  const meta = montarMeta({
    nome, codigo, libKey, xml: obj.text, temFonte,
    adtType: null, pacote: null,
    sistema: { alias: info.alias.toUpperCase(), mandante: info.client, url: info.base },
  });

  const pasta = pastaDoPacote(destino.raiz, info.alias, info.client, meta.pacote);
  passo(`gravando em ${pasta}`);
  gravarOrigem(pasta, info);
  const escritos = gravarObjeto(pasta, codigo, nome, { source, meta });

  console.log(`✓ ${meta.nome}  ${codigo}  pacote ${meta.pacote || '(desconhecido)'}`);
  for (const a of escritos) console.log(`  ${a}`);
  if (!temFonte) console.log(`  (${codigo} não tem /source/main — a definição está no .meta.json)`);
}

// Sondagem sem resultado tem três causas MUITO diferentes — nome errado, tipo não suportado, ou o
// objeto existe e a leitura falhou. Uma consulta ao RIS separa as três; sem ela as três davam a
// mesma frase e mandavam o usuário procurar no lugar errado.
async function porQueNaoAchou(session, info, nome, candidatos) {
  const N = String(nome).toUpperCase();
  const SID = info.alias.toUpperCase();
  const cabeca = `${N} não encontrado em ${SID} (sondados: ${candidatos.join(', ')}).`;

  let veredito;
  try {
    passo(`checkout: perguntando ao RIS o que existe com o nome ${N}`);
    const { itens, truncado } = await buscar(session, `${N}*`, []);
    const exato = itens.find((i) => i.nome.toUpperCase() === N);
    const ressalva = truncado && !exato ? '\n(⚠️ a busca de diagnóstico foi truncada pelo servidor — pode haver mais)' : '';

    if (exato && alvoDoAdtType(exato.tipo)) {
      veredito =
        `O RIS ACHA ${exato.nome} como ${exato.tipo} (pacote ${exato.pacote || '?'}), e esse tipo É suportado —\n` +
        `então a leitura falhou por outro motivo (autorização, Accept, mandante). Rode com --debug e olhe o status HTTP.`;
    } else if (exato) {
      veredito =
        `Existe em ${SID}: ${exato.nome}  ${exato.tipo}  pacote ${exato.pacote || '?'}  ${exato.descricao || ''}\n` +
        `Mas ${exato.tipo} ainda NÃO é um dos tipos que o checkout baixa — é limitação daqui, não nome errado.`;
    } else if (itens.length) {
      const amostra = itens.slice(0, 10).map((i) => `  ${i.nome}  ${i.tipo}  ${i.descricao || ''}`).join('\n');
      veredito = `Nada com esse nome exato. Começando com ${N}, o RIS tem:\n${amostra}` +
        (itens.length > 10 ? `\n  … e mais ${itens.length - 10}` : '');
    } else {
      veredito = `O RIS também não conhece nada começando com ${N} no mandante ${info.client} — confira o nome e o sistema.`;
    }
    veredito += ressalva;
  } catch (e) {
    veredito = `(a busca de diagnóstico também falhou: ${e.message})`;
  }
  return `${cabeca}\n${veredito}`;
}

// ---------- sistemas ----------
// Mostra o que veio do SAP GUI e o que ainda falta para cada um ficar utilizável.
function cmdSistemas() {
  const sistemas = Object.values(carregarSistemas());
  if (!sistemas.length) {
    morrer('nenhum sistema encontrado — o SAPUILandscape.xml não existe e sistemas.json está vazio.');
  }
  const larg = Math.max(5, ...sistemas.map((s) => s.alias.length));
  for (const s of sistemas) {
    const pronto = s.url && s.cliente;
    const falta = [!s.url && 'url do ADT', !s.cliente && 'cliente'].filter(Boolean).join(' + ');
    console.log(
      `${pronto ? '✓' : '·'} ${s.alias.toUpperCase().padEnd(larg)}  ` +
      `${(s.url || s.urlSugerida ? `${s.url || s.urlSugerida}${s.url ? '' : '  (palpite)'}` : '—').padEnd(42)}  ` +
      `${(s.cliente || '—').padEnd(10)}  ${s.descricao}`,
    );
    if (!pronto) console.log(`${' '.repeat(larg + 4)}falta: ${falta} → sistemas.json`);
  }
  console.log(`\n${sistemas.filter((s) => s.url && s.cliente).length}/${sistemas.length} prontos para conectar.`);
}

// ---------- status / logout ----------
function cmdStatus() {
  const { info } = sessaoAtual();
  console.log(`${info.alias.toUpperCase()}  ${info.base}`);
  console.log(`mandante ${info.client}  idioma ${info.lang}  usuário ${info.user}  cliente ${info.cliente}`);
  console.log(`sessão válida até ${new Date(info.expiraEm).toLocaleString()}`);
}

const cmdLogout = () => console.log(encerrarSessao() ? 'sessão encerrada.' : 'nenhuma sessão aberta.');

// ---------- dispatcher ----------
// As flags saem dos argumentos posicionais: `list Z* --debug` tem que continuar sendo um `list` de
// um argumento só, senão a flag vira o padrão de busca.
const argv = process.argv.slice(2).filter((a) => !FLAGS.includes(a));
const [comando, ...args] = argv;
passo(`adt-git ${argv.join(' ')} · node ${process.version} · log em ${caminhoDoLog()}`);

try {
  switch (comando) {
    case 'connect':  await cmdConnect(args[0]); break;
    case 'list':     await cmdList(args[0], args[1]); break;
    case 'checkout': await cmdCheckout(args[0], args[1]); break;
    case 'sistemas': cmdSistemas(); break;
    case 'status':   cmdStatus(); break;
    case 'logout':   cmdLogout(); break;
    case undefined:
    case '-h': case '--help': case 'help': console.log(USO); break;
    default: morrer(`comando desconhecido: ${comando}\n${USO}`);
  }
  passo('fim (ok)');
} catch (e) {
  console.error(`[ERRO] ${e.message}`);
  // Erro previsto já vem explicado; o que interessa no imprevisto é a pilha — e só com --debug.
  // Erro de uso é auto-explicativo; sugerir --debug ali é ruído. No imprevisto a dica é o caminho.
  if (!(e instanceof ErroDeUso)) {
    if (logAtivo()) console.error(e.stack);
    else console.error('Para ver o que aconteceu por baixo, repita o comando com --debug.');
  }
  passo(`fim (erro: ${e.constructor.name})`);
  // `exitCode` em vez de `exit()`: ver a nota em ErroDeUso. O processo sai sozinho quando o loop
  // esvazia, e aí não há handle sendo fechado no meio de uma notificação.
  process.exitCode = 1;
}
