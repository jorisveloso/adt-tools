#!/usr/bin/env node
// Script para testar conexão ADT com SXD 100
// Uso: node test-adt-connection.mjs <alias> <mandante>
// Exemplo: node test-adt-connection.mjs SXD 100

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { criarConexao } from '../sap-connection.mjs';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Uso: node test-adt-connection.mjs <alias> <mandante>');
  console.error('Exemplo: node test-adt-connection.mjs SXD 100');
  process.exit(1);
}

const [alias, mandante] = args;

// Ler configuração de sistemas
const sistemasPath = '.lib/adt/sistemas.json';
if (!fs.existsSync(sistemasPath)) {
  console.error(`❌ Arquivo não encontrado: ${sistemasPath}`);
  console.error('Copie .lib/adt/sistemas.exemplo.json para .lib/adt/sistemas.json');
  process.exit(1);
}

const sistemas = JSON.parse(fs.readFileSync(sistemasPath, 'utf8'));
const config = sistemas[alias];

if (!config) {
  console.error(`❌ Sistema "${alias}" não encontrado em sistemas.json`);
  console.error(`Sistemas disponíveis: ${Object.keys(sistemas).filter(k => k !== '_leia').join(', ')}`);
  process.exit(1);
}

// Validar configuração
if (!config.url) {
  console.error(`❌ URL do ADT não configurada para ${alias}`);
  console.error('Verifique .lib/adt/sistemas.json > "url"');
  process.exit(1);
}

console.log(`\n🔗 Testando conexão ADT\n`);
console.log(`Sistema (alias): ${alias}`);
console.log(`URL ADT: ${config.url}`);
console.log(`Mandante: ${mandante}`);
console.log(`Cliente: ${config.cliente || '(não configurado)'}\n`);

// Pedir senha (interativamente)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Usuário SAP: ', async (user) => {
  rl.question('Senha SAP: ', async (pass) => {
    rl.close();

    const cfg = {
      base: config.url,
      user: user.trim(),
      pass: pass.trim(),
      client: mandante,
      lang: config.idioma || 'PT'
    };

    try {
      console.log('\n⏳ Conectando...\n');
      const conexao = await criarConexao(cfg);

      console.log('✅ Conexão estabelecida com sucesso!');
      console.log(`Sessão criada: ${conexao.sessionId || '(dados de sessão carregados)'}`);
      console.log(`\n💾 Próximos passos:`);
      console.log(`1. Configure destinos.json com a pasta de destino para seus objetos`);
      console.log(`2. Use: npm run task -- list ${alias} ${mandante}`);
      console.log(`3. Ou: node test-adt-connection.mjs ${alias} ${mandante} (novamente para reconectar)`);

      process.exit(0);
    } catch (err) {
      console.error(`\n❌ Erro ao conectar:\n`);
      console.error(`${err.message}`);

      // Dica de troubleshooting
      if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
        console.error(`\n💡 Dica: Verifique se a URL está correta e o host é acessível`);
      } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        console.error(`\n💡 Dica: Verifique usuário e senha SAP`);
      }

      process.exit(1);
    }
  });
});
