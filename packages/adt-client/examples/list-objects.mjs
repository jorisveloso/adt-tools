#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import { criarConexao } from '../sap-connection.mjs';
import { buscar, parseObjectReferences } from '../search.mjs';

const args = process.argv.slice(2);
const [alias, mandante, filtro] = args;

if (!alias || !mandante) {
  console.log('Uso: node list-objects.mjs <alias> <mandante> [filtro]');
  console.log('Exemplo: node list-objects.mjs SXD 100 Z*');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`\n🔗 Conectando ao ${alias} (mandante ${mandante})...\n`);

rl.question('Usuário SAP: ', (user) => {
  rl.question('Senha SAP: ', async (pass) => {
    rl.close();
    
    try {
      const sistemas = JSON.parse(fs.readFileSync('.lib/adt/sistemas.json', 'utf8'));
      const config = sistemas[alias];
      
      if (!config) {
        throw new Error(`Sistema ${alias} não encontrado em sistemas.json`);
      }
      
      console.log(`\n⏳ Conectando em ${config.url}...\n`);
      
      const cfg = {
        base: config.url,
        user: user.trim(),
        pass: pass.trim(),
        client: mandante,
        lang: config.idioma || 'PT'
      };
      
      const sess = await criarConexao(cfg);
      
      console.log('✅ Autenticado!\n');
      
      const pattern = filtro || 'Z*';
      console.log(`🔍 Procurando objetos com padrão: ${pattern}\n`);
      
      const resultadoXML = await buscar(sess, pattern, [], 100);
      const objetos = parseObjectReferences(resultadoXML);
      
      if (objetos.length === 0) {
        console.log(`ℹ️  Nenhum objeto encontrado com padrão "${pattern}"\n`);
      } else {
        console.log(`📋 ${objetos.length} objeto(s) encontrado(s):\n`);
        console.log('┌─ Nome                   ─ Tipo        ─ Descrição');
        console.log('├' + '─'.repeat(70));
        
        objetos.forEach((obj, i) => {
          const nome = (obj.nome || '?').padEnd(22);
          const tipo = (obj.tipo || '?').padEnd(11);
          const desc = obj.descricao || '(sem descrição)';
          console.log(`│ ${nome} │ ${tipo} │ ${desc}`);
        });
        
        console.log('└' + '─'.repeat(70));
        console.log(`\n✅ Total: ${objetos.length} objetos\n`);
      }
      
      process.exit(0);
    } catch (err) {
      console.error('\n❌ Erro:', err.message, '\n');
      if (err.message.includes('getaddrinfo')) {
        console.error('💡 Dica: Verifique se o host é acessível');
      } else if (err.message.includes('401')) {
        console.error('💡 Dica: Verifique usuário e senha SAP');
      }
      process.exit(1);
    }
  });
});
