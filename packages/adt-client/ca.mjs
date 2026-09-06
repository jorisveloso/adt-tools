// ca.mjs — fazer o `fetch` do Node aceitar a CA INTERNA de um cliente, SEM desligar a validação.
//
// O problema (medido em 05/09/2026, item 41): num ICM com certificado de CA interna, o `fetch` do
// Node recusa ANTES de qualquer HTTP — o canal ADT inteiro (sap-connection, its, icm, probe,
// rfc-soap) morre no handshake, com um destes três códigos:
//
//   DEPTH_ZERO_SELF_SIGNED_CERT     o certificado do host é a própria raiz
//   UNABLE_TO_VERIFY_LEAF_SIGNATURE assinado por uma CA que esta máquina não conhece
//   ERR_TLS_CERT_ALTNAME_INVALID    a CA confia, mas o nome do certificado não é o do host
//
// ⚠ A opção `certificado` do `sistemas.json` NÃO resolve isto: ela é do CHROME (bandeira de pino,
// canal webgui). São dois validadores diferentes — o do Chrome e o do Node. Esta é a do Node.
//
// ---------- o que foi medido (POC_https_cert/medicoes/item69-ca-fetch.md, Node v24.14.0) ----------
//
// | via                                                  | o ICM interno | uma raiz NÃO declarada |
// |------------------------------------------------------|---------------|------------------------|
// | default do Node                                       | barra         | barra                  |
// | `tls.setDefaultCACertificates([...default, ca.pem])`  | **passa**     | **barra**  ← é esta    |
// | `NODE_EXTRA_CA_CERTS=ca.pem` (env, só na partida)     | passa         | barra                  |
// | `--use-system-ca` (CA precisa estar no store do SO)   | barra*        | barra                  |
// | `NODE_TLS_REJECT_UNAUTHORIZED=0`                      | passa         | **passa** ← o veneno   |
//
// (*) barrou porque a CA do laboratório não está no store do Windows; com ela instalada, a fonte
// `"sistema"` daqui faz o mesmo por API, sem bandeira de linha de comando.
//
// A linha que importa é a última: `NODE_TLS_REJECT_UNAUTHORIZED=0` faz passar TUDO, inclusive um
// man-in-the-middle. Declarar a CA faz passar só quem ELA assinou — foi medido com uma raiz de
// controle, que continuou barrada em todos os cenários. Por isso a lib não tem, e não vai ter,
// um "aceita qualquer certificado" no canal do Node.
//
// ---------- dois gotchas de uso, também medidos ----------
//
//   • **declare ANTES do primeiro fetch daquele host.** Somar a CA vale a quente para conexões
//     NOVAS, mas o `fetch` mantém keep-alive por origem: uma conexão já aberta segue com o veredito
//     que tinha. (Na medição, tirar a CA depois NÃO derrubou a conexão que já passava.)
//   • o efeito é do PROCESSO, não da chamada. Fazer por chamada exigiria um dispatcher do undici,
//     que este Node não expõe (`import('undici')` → ERR_MODULE_NOT_FOUND) e que só entraria como
//     dependência nova. Como o que se declara é uma CA nomeada — e não "ignorar" — o alcance de
//     processo é aceitável: some com quem aquela CA assina, e nada mais.

import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { passo, detalhe, aviso } from './log.mjs';

const INICIO_PEM = '-----BEGIN CERTIFICATE-----';
const FIM_PEM = '-----END CERTIFICATE-----';

/**
 * PURO: quebra um texto PEM em certificados individuais.
 * Arquivo de CA de cliente costuma vir com a cadeia inteira (raiz + intermediárias) num arquivo só.
 */
export function separarPems(texto) {
  const achados = [];
  let resto = String(texto);
  for (;;) {
    const i = resto.indexOf(INICIO_PEM);
    if (i < 0) break;
    const f = resto.indexOf(FIM_PEM, i);
    if (f < 0) break;
    achados.push(resto.slice(i, f + FIM_PEM.length) + '\n');
    resto = resto.slice(f + FIM_PEM.length);
  }
  return achados;
}

/** PURO: o que um humano precisa ver para conferir a CA com a infra do cliente antes de confiar. */
export function descreverCA(pem) {
  const c = new X509Certificate(pem);
  const umaLinha = (s) => String(s || '').replace(/\s*\n\s*/g, ', ');
  return {
    subject: umaLinha(c.subject),
    issuer: umaLinha(c.issuer),
    validoDe: c.validFrom,
    validoAte: c.validTo,
    ca: c.ca,
    expirado: new Date(c.validTo) < new Date(),
    autoAssinado: c.subject === c.issuer,
  };
}

// ---------- estado do processo ----------
// `base` é o bundle que o Node trouxe, lido UMA vez: cada `confiarNaCA` recalcula base + tudo que já
// foi declarado, senão a segunda chamada apagaria a primeira (setDefaultCACertificates SUBSTITUI).
let base = null;
const declarados = new Map(); // pem normalizado → { origem, ...descrição }

const normalizar = (pem) => pem.replace(/\s+/g, '');

/** O que ESTE processo já declarou como confiável, em ordem de declaração. */
export const caDeclaradas = () => [...declarados.values()];

/**
 * PURO-ish (só lê disco): resolve uma fonte declarada no `sistemas.json` em PEMs.
 *
 * Uma fonte é:
 *   • `"sistema"`  — as CAs do store do SO (o mesmo que `--use-system-ca` faria, por API);
 *   • um caminho   — arquivo .pem/.crt, absoluto ou relativo a `raiz`. Pode conter a cadeia toda;
 *   • um PEM inline (o `-----BEGIN CERTIFICATE-----` colado no JSON).
 */
export function resolverFonteDeCA(fonte, { raiz = process.cwd() } = {}) {
  if (fonte === true || fonte === false) {
    throw new Error(
      'ca: não existe "aceitar qualquer certificado" neste canal — o que se declara aqui é uma CA nomeada.\n' +
      'Foi medido que ignorar tudo (NODE_TLS_REJECT_UNAUTHORIZED=0) aceita também uma raiz desconhecida.\n' +
      'Declare o arquivo da CA do cliente:  { "ca": "C:/caminho/ca-interna.pem" }  — ou "sistema", para\n' +
      'usar as CAs já instaladas no store do Windows.',
    );
  }
  const texto = String(fonte ?? '').trim();
  if (!texto) throw new Error('ca: fonte vazia — esperava "sistema", um caminho de arquivo .pem, ou o PEM colado.');

  if (texto.toLowerCase() === 'sistema') {
    const doSO = tls.getCACertificates('system');
    if (!doSO.length) {
      throw new Error('ca: "sistema" foi pedido, mas o store de CAs do SO veio vazio — declare o arquivo .pem da CA.');
    }
    return { origem: `store do SO (${doSO.length} CAs)`, pems: doSO };
  }

  if (texto.includes(INICIO_PEM)) {
    const pems = separarPems(texto);
    if (!pems.length) throw new Error('ca: o PEM colado não tem um certificado completo (falta o -----END CERTIFICATE-----).');
    return { origem: 'PEM declarado no sistemas.json', pems };
  }

  const arquivo = path.isAbsolute(texto) ? texto : path.resolve(raiz, texto);
  if (!fs.existsSync(arquivo)) {
    throw new Error(
      `ca: arquivo de CA não encontrado: ${arquivo}\n` +
      'Peça à infra do cliente o certificado da CA que assina o ICM (formato PEM/Base64, extensão .pem ou .crt)\n' +
      'e aponte para ele em sistemas.json:  { "<alias>": { "ca": "C:/caminho/ca-interna.pem" } }',
    );
  }
  const pems = separarPems(fs.readFileSync(arquivo, 'utf8'));
  if (!pems.length) {
    throw new Error(
      `ca: ${arquivo} não contém certificado em PEM. Um .cer/.crt binário (DER) não serve como está —\n` +
      `converta:  openssl x509 -inform der -in "${arquivo}" -out ca.pem`,
    );
  }
  return { origem: arquivo, pems };
}

/**
 * Soma as CAs declaradas às que o Node já confia, para o resto DESTE processo.
 *
 * Idempotente: chamar de novo com a mesma CA não duplica nem apaga o que já foi declarado antes.
 * Devolve o que entrou (para o log e para o humano conferir subject/issuer com a infra do cliente).
 */
export function confiarNaCA(fontes, { rotulo = '', raiz = process.cwd() } = {}) {
  const lista = (Array.isArray(fontes) ? fontes : [fontes]).filter((f) => f !== null && f !== undefined && f !== '');
  if (!lista.length) return { novas: [], jaValiam: 0 };

  if (typeof tls.setDefaultCACertificates !== 'function') {
    throw new Error(
      `ca: este Node (${process.version}) não tem tls.setDefaultCACertificates — não dá para somar a CA em runtime.\n` +
      'Ou atualize para o Node 24, ou rode o comando com a variável de ambiente:\n' +
      '  NODE_EXTRA_CA_CERTS=<caminho do .pem>   (medida: funciona, mas só vale a partir da partida do processo)',
    );
  }

  passo(`ca: declarando autoridade confiável${rotulo ? ` de ${rotulo}` : ''}`);
  if (base === null) base = tls.getCACertificates('default');

  const novas = [];
  let jaValiam = 0;
  for (const fonte of lista) {
    const { origem, pems } = resolverFonteDeCA(fonte, { raiz });
    for (const pem of pems) {
      const chave = normalizar(pem);
      if (declarados.has(chave)) { jaValiam += 1; continue; }
      let d;
      try { d = descreverCA(pem); } catch (e) { throw new Error(`ca: certificado ilegível em ${origem}: ${e.message}`); }
      const registro = { pem, origem, ...d };
      declarados.set(chave, registro);
      novas.push(registro);
    }
  }

  if (novas.length) {
    tls.setDefaultCACertificates([...base, ...[...declarados.values()].map((d) => d.pem)]);
    for (const n of novas) {
      // subject/issuer no log porque pinar/confiar no que o host mostrou é decisão do humano, e ele
      // só consegue conferir com a infra do cliente se enxergar o que entrou.
      detalhe(`ca: + ${n.subject} (emissor ${n.issuer}, vale até ${n.validoAte}) — ${n.origem}`);
      if (n.expirado) aviso(`ca: ${n.subject} está EXPIRADO desde ${n.validoAte} — o handshake vai continuar falhando.`);
      if (!n.ca) aviso(`ca: ${n.subject} não é um certificado de CA (basicConstraints CA:FALSE) — provável que seja o cert do host, não o da autoridade.`);
    }
  }
  detalhe(`ca: ${novas.length} nova(s), ${jaValiam} já valia(m), ${base.length} do bundle do Node`);
  return { novas, jaValiam };
}

