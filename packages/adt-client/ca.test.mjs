// ca.test.mjs — a CA interna declarada por sistema.
//
// Os PEMs usados aqui saem do BUNDLE do próprio Node (`tls.getCACertificates('bundled')`): são
// certificados reais, então `descreverCA` e o `setDefaultCACertificates` de verdade são exercidos —
// e declará-los não amplia confiança nenhuma, porque o processo já confiava neles.
//
// O que é comportamento de REDE (a CA interna fazendo o `fetch` passar, a raiz de controle
// continuando barrada) foi medido em laboratório, não aqui:
// sap-accelerate/work/POC_https_cert/{scripts/medir-ca-no-fetch.mjs,medicoes/item69-ca-fetch.md}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { expect, test } from 'vitest';
import { caDeclaradas, confiarNaCA, descreverCA, resolverFonteDeCA, separarPems } from './ca.mjs';

const bundle = tls.getCACertificates('bundled');
const [pemA, pemB] = bundle;

test('ca: um arquivo com a cadeia inteira vira um certificado por vez', () => {
  expect(separarPems(pemA)).toHaveLength(1);
  expect(separarPems(`${pemA}\n${pemB}`)).toHaveLength(2);

  // texto ao redor (comentário do OpenSSL, cabeçalho de e-mail da infra) não atrapalha
  expect(separarPems(`# CA do cliente\n${pemA}\nfim`)).toHaveLength(1);
  // e um PEM cortado no meio não vira certificado pela metade
  expect(separarPems(pemA.slice(0, 80))).toHaveLength(0);
  expect(separarPems('')).toEqual([]);
});

test('ca: a descrição mostra o que o humano confere com a infra do cliente', () => {
  const d = descreverCA(pemA);
  expect(d.subject).toMatch(/\S/);
  expect(d.issuer).toMatch(/\S/);
  expect(d.ca).toBe(true);          // raiz do bundle é CA
  expect(d.autoAssinado).toBe(true); // e é auto-assinada, como toda raiz
  expect(d.expirado).toBe(false);
  expect(d.subject).not.toMatch(/\n/); // uma linha, para caber no log
});

test('ca: "aceitar qualquer certificado" não existe neste canal, e a recusa ensina a saída', () => {
  expect(() => resolverFonteDeCA(true)).toThrow(/CA nomeada/);
  expect(() => resolverFonteDeCA(true)).toThrow(/NODE_TLS_REJECT_UNAUTHORIZED=0/);
  expect(() => resolverFonteDeCA('')).toThrow(/esperava "sistema"/);
});

test('ca: arquivo que não existe (ou que não é PEM) dá o passo seguinte, não só o erro', () => {
  const inexistente = path.join(os.tmpdir(), 'nao-existe-ca-jbv.pem');
  expect(() => resolverFonteDeCA(inexistente)).toThrow(/infra do cliente/);
  expect(() => resolverFonteDeCA(inexistente)).toThrow(/sistemas\.json/);

  const binario = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jbv-ca-')), 'ca.cer');
  fs.writeFileSync(binario, Buffer.from([0x30, 0x82, 0x03, 0x01]));
  expect(() => resolverFonteDeCA(binario)).toThrow(/openssl x509 -inform der/);
});

test('ca: as três fontes — arquivo, PEM colado e o store do SO', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbv-ca-'));
  const arquivo = path.join(dir, 'cadeia.pem');
  fs.writeFileSync(arquivo, `${pemA}\n${pemB}`);

  expect(resolverFonteDeCA(arquivo).pems).toHaveLength(2);
  expect(resolverFonteDeCA('cadeia.pem', { raiz: dir }).pems).toHaveLength(2); // relativo à raiz da lib
  expect(resolverFonteDeCA(pemA)).toMatchObject({ origem: /sistemas\.json/ });
  expect(resolverFonteDeCA('sistema').pems.length).toBeGreaterThan(0);
});

test('ca: declarar é idempotente e ACUMULA — a segunda CA não apaga a primeira', () => {
  expect(confiarNaCA(null)).toEqual({ novas: [], jaValiam: 0 });

  const primeira = confiarNaCA(pemA, { rotulo: 'TST' });
  expect(primeira.novas).toHaveLength(1);

  const denovo = confiarNaCA(pemA, { rotulo: 'TST' });
  expect(denovo).toMatchObject({ novas: [], jaValiam: 1 });

  const segunda = confiarNaCA([pemB], { rotulo: 'TST' });
  expect(segunda.novas).toHaveLength(1);

  const declaradas = caDeclaradas().map((d) => d.subject);
  expect(declaradas).toContain(descreverCA(pemA).subject);
  expect(declaradas).toContain(descreverCA(pemB).subject);

  // e o bundle do Node continua valendo: declarar uma CA SOMA, não substitui
  expect(tls.getCACertificates('default').length).toBeGreaterThanOrEqual(bundle.length);
});
