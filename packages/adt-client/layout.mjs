// layout.mjs — onde cada objeto cai no disco, e o que vai junto dele.
//
//   <raiz-do-cliente>/<SID>_<MANDANTE>/<PACOTE>/
//   ├── _origem.json               de onde veio: sistema, mandante, idioma, url, usuário, quando
//   └── <CODIGO-TADIR>/
//       ├── <NOME>.abap            o /source/main, exatamente como veio
//       └── <NOME>.meta.json       metadado normalizado
//
// Procedência fica no CAMINHO, não só no metadado: `D01_100` e `Q01_100` convivem lado a lado, e
// clonar o segundo nunca sobrescreve o primeiro.

import fs from 'node:fs';
import path from 'node:path';

export function pastaDoPacote(destinoRaiz, sid, mandante, pacote) {
  return path.join(destinoRaiz, `${String(sid).toUpperCase()}_${mandante}`, String(pacote || '$SEM_PACOTE').toUpperCase());
}

export function gravarOrigem(pastaPacote, info) {
  fs.mkdirSync(pastaPacote, { recursive: true });
  const arquivo = path.join(pastaPacote, '_origem.json');
  const dados = {
    sistema: String(info.alias || '').toUpperCase(),
    descricao: info.descricao || '',
    url: info.base,
    mandante: info.client,
    idioma: info.lang,
    usuario: info.user,
    baixadoEm: new Date().toISOString(),
  };
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2) + '\n');
  return arquivo;
}

/**
 * Grava um objeto: fonte (quando existe) + metadado.
 * Objetos sem /source/main — DTEL, MSAG — gravam só o `.meta.json`, com o XML do ADT dentro.
 */
export function gravarObjeto(pastaPacote, codigo, nome, { source, meta }) {
  const pasta = path.join(pastaPacote, codigo);
  fs.mkdirSync(pasta, { recursive: true });

  const escritos = [];
  const NOME = String(nome).toUpperCase();

  if (source != null && source !== '') {
    const arq = path.join(pasta, `${NOME}.abap`);
    fs.writeFileSync(arq, source);
    escritos.push(arq);
  }

  const arqMeta = path.join(pasta, `${NOME}.meta.json`);
  fs.writeFileSync(arqMeta, JSON.stringify(meta, null, 2) + '\n');
  escritos.push(arqMeta);

  return escritos;
}

// Metadado normalizado. Os atributos vêm do XML que o ADT devolve no GET do objeto.
//
// ⚠️ PONTO EM ABERTO, a decidir olhando resposta real (não agora): se algum campo necessário para
// RECRIAR o objeto na fase 2 não estiver aqui, a saída é guardar também o XML cru (`<NOME>.adt.xml`).
// Por isso `xmlAdt` é preservado quando o objeto não tem fonte — é o único registro que sobra dele.
export function montarMeta({ nome, codigo, adtType, libKey, xml, pacote, sistema, temFonte = false }) {
  const s = String(xml);
  // Atributos da RAIZ (adtcore:description, :version, :masterLanguage, :responsible, :createdAt…).
  // A primeira ocorrência é sempre a do elemento raiz, que vem antes dos filhos.
  const at = (n) => (s.match(new RegExp(`adtcore:${n}="([^"]*)"`)) || [])[1] || null;
  // O pacote NÃO é atributo da raiz: vem no filho <adtcore:packageRef adtcore:name="ZFOO"/>.
  const pacoteDoXml = (s.match(/<adtcore:packageRef\b[^>]*adtcore:name="([^"]*)"/) || [])[1] || null;

  return {
    nome: String(nome).toUpperCase(),
    codigo,
    adtType: adtType || at('type'),
    libKey,
    pacote: pacote || pacoteDoXml,
    descricao: at('description'),
    masterLanguage: at('masterLanguage'),
    responsavel: at('responsible'),
    versao: at('version'),
    criadoEm: at('createdAt'),
    criadoPor: at('createdBy'),
    alteradoEm: at('changedAt'),
    alteradoPor: at('changedBy'),
    origem: sistema,
    ...(temFonte ? {} : { xmlAdt: xml }),
  };
}
