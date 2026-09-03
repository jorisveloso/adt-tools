#!/usr/bin/env node
import fs from 'fs';
import readline from 'readline';
import { criarConexao } from '../sap-connection.mjs';
import { createObject } from '../adt-client.mjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🔗 Testando criação de objeto no SXD 100...\n');

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
      
      // Tentar criar uma classe de teste
      console.log('🔨 Criando classe ZTEST_CONEXAO...\n');
      
      const classXml = `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
    <CLSKEY>
      <CLSNAME>ZTEST_CONEXAO</CLSNAME>
      <LANGU>PT</LANGU>
      <EXPOSURE>0</EXPOSURE>
      <STATE>1</STATE>
      <INSTP>1</INSTP>
      <ABSTRCT>0</ABSTRCT>
      <FINAL>0</FINAL>
      <PUBSEC>0</PUBSEC>
    </CLSKEY>
    <DESCRIPTIONS>
      <SEOCOMPOTX>
        <CLSNAME>ZTEST_CONEXAO</CLSNAME>
        <CMPNAME>GLOBAL</CMPNAME>
        <LANGU>PT</LANGU>
        <DESCRIPT>Teste de conexão ADT</DESCRIPT>
      </SEOCOMPOTX>
    </DESCRIPTIONS>
  </asx:values>
</asx:abap>`;

      try {
        const result = await createObject(sess, 'ZTEST_CONEXAO', 'CLAS/OC', classXml);
        console.log('✅ Classe criada com sucesso!');
        console.log(`   Nome: ZTEST_CONEXAO`);
        console.log(`   Tipo: CLAS/OC (Classe ABAP)`);
        console.log(`\n💡 Próximo: Ativar com npm run task -- activate SXD 100 ZTEST_CONEXAO`);
      } catch (createErr) {
        console.error('❌ Erro ao criar:', createErr.message);
      }
      
      process.exit(0);
    } catch (err) {
      console.error('\n❌ Erro:', err.message, '\n');
      process.exit(1);
    }
  });
});
