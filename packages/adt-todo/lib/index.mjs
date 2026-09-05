// index.mjs — ponto de entrada do adt-todo: fila de trabalho local, multi-projeto.
//
// Verbo principal: `next` (pega o próximo item a executar). A skill /next consome isto.
// As funções herdadas puramente ficam em fila.mjs; daqui saem as versões com DISCO (ler/gravar
// arquivos markdown) e a enumeração das filas pelas pastas.

import fs from 'node:fs';
import path from 'node:path';
import {
  parseFila, proximo, proximoNumero, linhasDoItem, addItem, marcarFeito, anotar, statusDaFila,
  adiarItem, estadoDoItem,
} from './fila.mjs';
import { FILAS_DIR } from './config.mjs';

export {
  parseFila, proximo, proximoNumero, linhasDoItem, addItem, marcarFeito, anotar, statusDaFila,
  adiarItem, estadoDoItem,
} from './fila.mjs';
export { FILAS_DIR } from './config.mjs';

function validarNome(nome) {
  const n = String(nome ?? '').trim();
  if (!n || /[\\/:*?"<>|]/.test(n)) {
    throw new Error(`nome de fila inválido: "${nome}" — informe um nome de projeto simples (ex.: "adt-tools").`);
  }
  return n;
}

/** A primeira fila em ordem alfabética de uma pasta — a "ativa" quando nenhum nome é dado. */
export function filaAtiva(pasta = FILAS_DIR) {
  const filas = listarFilas(pasta);
  if (!filas.length) throw new Error(`nenhuma fila em ${pasta} — crie uma com add(pasta, nome, texto).`);
  return filas[0].nome;
}

export function arquivoDaFila(pasta, nome) {
  const n = validarNome(nome);
  return path.join(pasta, `${n.replace(/\.md$/i, '')}.md`);
}

/** Lista as filas (arquivos .md) de uma pasta. Devolve [{ nome, caminho }] em ordem alfabética. */
export function listarFilas(pasta = FILAS_DIR) {
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta)
    .filter((f) => /\.md$/i.test(f) && !/^_/.test(f))
    .sort()
    .map((f) => ({ nome: f.replace(/\.md$/i, ''), caminho: path.join(pasta, f) }));
}

function ler(pasta, nome) {
  const caminho = arquivoDaFila(pasta, nome);
  if (!fs.existsSync(caminho)) return null;
  return fs.readFileSync(caminho, 'utf8');
}

function gravar(pasta, nome, markdown) {
  const caminho = arquivoDaFila(pasta, nome);
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, markdown);
  return caminho;
}

/** Garante que a fila existe (cria com um cabeçalho mínimo se faltar) e devolve o markdown. */
function lerOuCriar(pasta, nome) {
  const existente = ler(pasta, nome);
  if (existente !== null) return existente;
  const inicial = `# Fila ${nome}\n\n`;
  gravar(pasta, nome, inicial);
  return inicial;
}

// Resolve o nome da fila: usa `nome` quando é dado, senão a fila ativa (primeira alfabética).
function nomeDaFila(pasta, nome) {
  if (nome !== undefined && nome !== null && String(nome).trim() !== '') return validarNome(nome);
  return filaAtiva(pasta);
}

/** O próximo item a executar de uma fila (null se não houver). Não grava nada. */
export function next(pasta = FILAS_DIR, nome) {
  const markdown = ler(pasta, nomeDaFila(pasta, nome));
  return markdown !== null ? (proximo(parseFila(markdown)) ?? null) : null;
}

/** Adiciona um item e grava. Devolve { n, caminho } e o markdown atualizado. */
export function add(pasta = FILAS_DIR, nome, texto, { bloqueado } = {}) {
  const nFila = nomeDaFila(pasta, nome);
  const markdown = lerOuCriar(pasta, nFila);
  const { n, markdown: novo } = addItem(markdown, texto, { bloqueado });
  const caminho = gravar(pasta, nFila, novo);
  return { n, caminho, markdown: novo };
}

/** Marca um item como feito e grava. Devolve o caminho gravado. */
export function fechar(pasta = FILAS_DIR, nome, n, resultado) {
  const markdown = lerOuCriar(pasta, nomeDaFila(pasta, nome));
  const novo = marcarFeito(markdown, n, resultado);
  const caminho = gravar(pasta, nomeDaFila(pasta, nome), novo);
  return { caminho, markdown: novo };
}

/** Anota um item (`bloqueado:` / `em andamento:` / livre) e grava. */
export function anotarItem(pasta = FILAS_DIR, nome, n, rotulo, texto) {
  const markdown = lerOuCriar(pasta, nomeDaFila(pasta, nome));
  const novo = anotar(markdown, n, rotulo, texto);
  const caminho = gravar(pasta, nomeDaFila(pasta, nome), novo);
  return { caminho, markdown: novo };
}

/** Adia um item para o FIM da fila (perde a prioridade de `em andamento`) e grava. */
export function adiar(pasta = FILAS_DIR, nome, n, motivo) {
  const nFila = nomeDaFila(pasta, nome);
  const markdown = lerOuCriar(pasta, nFila);
  const novo = adiarItem(markdown, n, motivo);
  const caminho = gravar(pasta, nFila, novo);
  return { caminho, markdown: novo };
}

/** Um item da fila, como está no ARQUIVO agora (null se não existe). Não grava nada. */
export function itemDaFila(pasta = FILAS_DIR, nome, n) {
  const markdown = ler(pasta, nomeDaFila(pasta, nome));
  if (markdown === null) return null;
  return parseFila(markdown).itens.find((i) => i.n === Number(n)) ?? null;
}

/** Resumo do estado de uma fila. */
export function status(pasta = FILAS_DIR, nome) {
  const markdown = ler(pasta, nomeDaFila(pasta, nome));
  const parsed = parseFila(markdown ?? '');
  return statusDaFila(parsed);
}

/** Resumo detalhado de uma fila (tudo de uma fila só). */
export function resumoFila(pasta = FILAS_DIR, nome) {
  const nFila = nomeDaFila(pasta, nome);
  const markdown = ler(pasta, nFila) ?? '';
  const parsed = parseFila(markdown);
  const s = statusDaFila(parsed);
  const alvo = proximo(parsed);
  return { nome: nFila, status: s, alvo: alvo ? { n: alvo.n, titulo: alvo.titulo } : null, abertos: parsed.itens.filter((i) => !i.feito) };
}
