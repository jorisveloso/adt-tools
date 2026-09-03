#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import { criarConexao } from '../sap-connection.mjs';
import { buscar, parseObjectReferences } from '../search.mjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔗 Conectando ao SXD 100\n');

rl.question('Usuário SAP: ', (user) => {
  rl.question('Senha SAP: ', async (pass) => {
    rl.close();
    
    try {
      const sistemas = JSON.parse(fs.readFileSync('.lib/adt/sistemas.json', 'utf8'));
      const config = sistemas['SXD'];
      
      console.log(`\n⏳ Conectando em ${config.url}...\n`);
      
      const cfg = {
        base: config.url,
        user: user.trim(),
        pass: pass.trim(),
        client: config.mandante,
        lang: config.idioma
      };
      
      const sess = await criarConexao(cfg);
      
      console.log('✅ Conectado!\n');
      console.log('🔍 Buscando objetos ABAP com prefixo Z...\n');
      
      const resultadoXML = await buscar(sess, 'Z*', [], 20);
      const objetos = parseObjectReferences(resultadoXML);
      
      if (objetos.length === 0) {
        console.log('ℹ️  Nenhum objeto Z encontrado no SXD 100');
        console.log('   (Sistema novo ou sem custom code com prefixo Z)\n');
      } else {
        console.log(`📋 ${objetos.length} objeto(s) encontrado(s):\n`);
        objetos.forEach((obj, i) => {
          console.log(`${i + 1}. ${obj.nome} (${obj.tipo})`);
          if (obj.descricao) console.log(`   └─ ${obj.descricao}`);
        });
        console.log('');
      }
      
      console.log('✅ ADT Client conectado ao SXD 100 e funcionando!\n');
      console.log('💡 Próximos passos:');
      console.log('   • npm run task -- list SXD 100');
      console.log('   • npm run task -- checkout SXD 100 <nome-objeto>');
      
      process.exit(0);
    } catch (err) {
      console.error('\n❌ Erro:', err.message, '\n');
      process.exit(1);
    }
  });
});
