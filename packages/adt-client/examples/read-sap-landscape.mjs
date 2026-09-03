#!/usr/bin/env node
// Lê SAPUILandscape.xml do SAP GUI e extrai configuração para sistemas.json
// Uso: node read-sap-landscape.mjs [filtro]
// Exemplo: node read-sap-landscape.mjs SXD

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const args = process.argv.slice(2);
const filtro = args[0]?.toUpperCase() || '';

// Procura o arquivo SAPUILandscape.xml em locais padrão
function encontrarLandscape() {
  const usuario = os.userInfo().username;
  const caminhos = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'SAP', 'Common', 'SAPUILandscape.xml'),
    `C:\\Users\\${usuario}\\AppData\\Roaming\\SAP\\Common\\SAPUILandscape.xml`,
    'C:\\Program Files\\SAP\\SAP GUI\\SAPUILandscape.xml',
    'C:\\Program Files (x86)\\SAP\\SAP GUI\\SAPUILandscape.xml',
  ];

  for (const caminho of caminhos) {
    if (fs.existsSync(caminho)) {
      return caminho;
    }
  }

  return null;
}

function parseLandscapeXML(xml) {
  const sistemas = {};

  // Novo formato: <Service type="SAPGUI" ... systemid="SID" name="..." server="host:port" .../>
  const serviceRegex = /<Service[^>]*>/g;
  const matches = xml.match(serviceRegex) || [];

  matches.forEach((service) => {
    // Extrair informações do sistema
    const sidMatch = service.match(/systemid="([^"]+)"/);
    const nameMatch = service.match(/name="([^"]+)"/);
    const serverMatch = service.match(/server="([^"]+):(\d+)"/);

    if (!sidMatch || !serverMatch) return;

    const sid = sidMatch[1];
    const desc = nameMatch ? nameMatch[1] : sid;
    const host = serverMatch[1];
    const dispatcherPort = parseInt(serverMatch[2]);

    // Calcular porta do ADT a partir da porta do dispatcher
    // Padrão SAP: porta dispatcher = 32xx, ADT = 8xxx (onde xx é número de instância)
    // Exemplo: dispatcher 3200 → ADT 8000, dispatcher 3210 → ADT 8010, dispatcher 3220 → ADT 8020
    const instanceNum = (dispatcherPort - 3200) % 100;
    const adtPort = 8000 + instanceNum;
    const adtUrl = `http://${host}:${adtPort}`;

    // Mandante padrão (será pedido na conexão)
    const cliente = '100';

    sistemas[sid] = {
      desc,
      host,
      dispatcherPort,
      adtPort,
      cliente,
      adtUrl,
    };
  });

  return sistemas;
}

// ────────────────────────────────────────────────────────────

const landscapePath = encontrarLandscape();

if (!landscapePath) {
  console.error('❌ Não encontrei SAPUILandscape.xml');
  console.error('Procurei em:');
  console.error('  - %APPDATA%\\SAP\\Common\\SAPUILandscape.xml');
  console.error('  - C:\\Program Files\\SAP\\SAP GUI\\');
  console.error('\nVerifique se o SAP GUI está instalado.');
  process.exit(1);
}

console.log(`📂 Lendo: ${landscapePath}\n`);

try {
  const xml = fs.readFileSync(landscapePath, 'utf8');
  const sistemas = parseLandscapeXML(xml);

  // Filtrar por SID se fornecido
  let sistemasExibir = sistemas;
  if (filtro) {
    sistemasExibir = Object.fromEntries(
      Object.entries(sistemas).filter(([sid]) => sid.includes(filtro))
    );
  }

  if (Object.keys(sistemasExibir).length === 0) {
    console.error(`❌ Nenhum sistema encontrado com filtro "${filtro}"`);
    console.log('\nSistemas disponíveis:');
    Object.entries(sistemas).forEach(([sid, info]) => {
      console.log(`  ${sid}: ${info.desc}`);
    });
    process.exit(1);
  }

  console.log(`✅ Encontrados ${Object.keys(sistemasExibir).length} sistema(s):\n`);

  // Exibir em formato legível
  Object.entries(sistemasExibir).forEach(([sid, info]) => {
    console.log(`📌 SID: ${sid}`);
    console.log(`   Descrição: ${info.desc}`);
    console.log(`   Host: ${info.host}`);
    console.log(`   Porta Dispatcher: ${info.dispatcherPort}`);
    console.log(`   Porta ADT (HTTP): ${info.adtPort}`);
    console.log(`   Cliente (mandante): ${info.cliente}`);
    console.log(`   🔗 URL ADT: ${info.adtUrl}`);
    console.log('');
  });

  // Gerar template sistemas.json
  console.log('📋 Template para .lib/adt/sistemas.json:\n');
  const template = {};
  Object.entries(sistemasExibir).forEach(([sid, info]) => {
    template[sid] = {
      cliente: `cliente-${sid.toLowerCase()}`,
      url: info.adtUrl || `http://${info.host || 'host-do-sistema'}:8000`,
      mandante: info.cliente || '100',
      idioma: 'PT',
    };
  });

  console.log(JSON.stringify(template, null, 2));

  console.log('\n📝 Para usar este template:');
  console.log('1. Copie o JSON acima');
  console.log('2. Edite .lib/adt/sistemas.json');
  console.log('3. Substitua "cliente-*" pelo seu nome de cliente');
  console.log('4. Verifique/corrija a URL do ADT se necessário');
  console.log('5. Rode: node test-adt-connection.mjs <SID> <mandante>');

  // Se for SXD 100, dar dica especial
  if (filtro === 'SXD' && sistemasExibir.SXD) {
    console.log('\n🎯 Para SXD 100:');
    const sxd = sistemasExibir.SXD;
    console.log(`   Recomendação:`);
    console.log(`   "SXD": {`);
    console.log(`     "cliente": "seu-cliente",`);
    console.log(`     "url": "${sxd.adtUrl || `http://${sxd.host}:8000`}",`);
    console.log(`     "mandante": "${sxd.cliente || '100'}",`);
    console.log(`     "idioma": "PT"`);
    console.log(`   }`);
  }

} catch (err) {
  console.error(`❌ Erro ao ler XML: ${err.message}`);
  process.exit(1);
}
