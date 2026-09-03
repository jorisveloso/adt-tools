#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import { criarConexao } from '../sap-connection.mjs';
import { buscar, parseObjectReferences } from '../search.mjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🔗 Conectando ao SXD 100...\n');

rl.question('Usuário SAP: ', (user) => {
  rl.question('Senha SAP: ', async (pass) => {
    rl.close();
    
    try {
      const sistemas = JSON.parse(fs.readFileSync('.lib/adt/sistemas.json', 'utf8'));
      const config = sistemas['SXD'];
      
      console.log(`\n⏳ Conectando...\n`);
      
      const cfg = {
        base: config.url,
        user: user.trim(),
        pass: pass.trim(),
        client: '100',
        lang: 'PT'
      };
      
      const sess = await criarConexao(cfg);
      console.log('✅ Autenticado!\n');
      
      // Tentar buscar objetos no pacote $TMP
      console.log(`🔍 Procurando objetos no pacote $TMP...\n`);
      
      try {
        const resultadoXML = await buscar(sess, '*', [], 200);
        const objetos = parseObjectReferences(resultadoXML);
        
        if (objetos.length === 0) {
          console.log('ℹ️  Nenhum objeto encontrado\n');
        } else {
          console.log(`📋 Primeiros 50 objetos encontrados:\n`);
          console.log('┌─ Nome                   ─ Tipo        ─ Pacote');
          console.log('├' + '─'.repeat(70));
          
          objetos.slice(0, 50).forEach((obj) => {
            const nome = (obj.nome || '?').padEnd(22);
            const tipo = (obj.tipo || '?').padEnd(11);
            const pkg = obj.pacote || '?';
            console.log(`│ ${nome} │ ${tipo} │ ${pkg}`);
          });
          
          console.log('└' + '─'.repeat(70));
          console.log(`\n✅ Total encontrado: ${objetos.length} objetos\n`);
        }
      } catch (searchErr) {
        console.error('Erro na busca:', searchErr.message);
        console.log('\n💡 Dica: O serviço de busca do ADT pode estar inativo');
        console.log('   Verifique no SAP: Transaction SICF > sap/bc/adt/repository/informationsystem');
      }
      
      process.exit(0);
    } catch (err) {
      console.error('\n❌ Erro:', err.message, '\n');
      process.exit(1);
    }
  });
});
