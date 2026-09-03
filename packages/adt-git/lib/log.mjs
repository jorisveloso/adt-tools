// log.mjs — o rastro do que o CLI fez. Silencioso por padrão.
//
// Ligar:  `--debug` (ou `-v`) em qualquer posição da linha de comando, ou ABAPGIT_DEBUG=1.
//
// Sai em STDERR, nunca em stdout: o stdout é o RESULTADO (a tabela do `list`, os caminhos do
// `checkout`) e precisa continuar redirecionável sem log no meio. Quando ligado, o mesmo texto também
// se acumula em `.abapgit.log` na raiz — é o arquivo para colar numa conversa quando algo deu errado.
//
// ⚠️ NUNCA logar senha, cookie de sessão ou token CSRF. Header é logado por NOME, nunca por valor
// (ver `nomesDeHeader`) — o `.abapgit.log` não é gitignorado por acidente, é por isto.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVO = path.join(RAIZ, '.abapgit.log');

// Lido de process.argv direto: o log precisa estar de pé ANTES do dispatcher parsear qualquer coisa,
// senão perde-se justamente o que acontece na leitura de config.
let ligado = process.env.ABAPGIT_DEBUG === '1' || process.argv.includes('--debug') || process.argv.includes('-v');
export const FLAGS = ['--debug', '-v'];

const T0 = Date.now();
let arquivoQuebrado = false;

export const logAtivo = () => ligado;
export const ativarLog = (v = true) => { ligado = v; };

function escrever(linha) {
  if (!ligado) return;
  const ms = `${Date.now() - T0}ms`.padStart(7);
  process.stderr.write(`\x1b[90m${ms}  ${linha}\x1b[0m\n`);
  if (arquivoQuebrado) return;
  // Melhor esforço: log que não pode ser gravado não pode derrubar o comando.
  try { fs.appendFileSync(ARQUIVO, `${new Date().toISOString()} ${linha}\n`); }
  catch { arquivoQuebrado = true; }
}

/** Marco do fluxo: "resolvendo tipo", "sondando class"… */
export const passo = (msg) => escrever(msg);

/** Sub-linha de um passo — indentada, para o detalhe que só interessa quando se está caçando algo. */
export const detalhe = (msg) => escrever(`   ${msg}`);

/** Nomes dos headers enviados, SEM os valores (Authorization e Cookie carregam credencial). */
export const nomesDeHeader = (h) => Object.keys(h).join(',');

/** Uma requisição HTTP: o que foi pedido, o que voltou, em quanto tempo. */
export function http(method, url, status, ms, bytes) {
  escrever(`HTTP ${String(method).padEnd(4)} ${status} ${String(ms).padStart(5)}ms ${String(bytes).padStart(7)}B  ${url}`);
}

/** Corpo de resposta truncado — só vale a pena para erro; 200 de objeto grande só entope o log. */
export function corpo(texto, max = 400) {
  if (!ligado) return;
  const t = String(texto).replace(/\s+/g, ' ').trim();
  detalhe(`corpo: ${t.slice(0, max)}${t.length > max ? ` …(+${t.length - max}B)` : ''}`);
}

/** Caminho do arquivo de log, para o CLI poder dizer onde ele está. */
export const caminhoDoLog = () => ARQUIVO;
