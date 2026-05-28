const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const P8_PATH = process.env.APPLE_P8_PATH;

if (!P8_PATH) {
  console.error('❌ APPLE_P8_PATH não definido no .env');
  process.exit(1);
}

const p8Resolved = path.resolve(__dirname, P8_PATH);

console.log(`📂 Validando arquivo .p8: ${p8Resolved}\n`);

try {
  const stats = fs.statSync(p8Resolved);
  console.log(`📊 Tamanho do arquivo: ${stats.size} bytes`);
  console.log(`   (esperado: 1500+ bytes)\n`);
  
  if (stats.size < 200) {
    console.error('❌ ARQUIVO MUITO PEQUENO! Pode estar vazio ou corrompido.');
    console.error('   Verifique se você copiou corretamente o arquivo .p8 para secrets/');
  }
  
  const content = fs.readFileSync(p8Resolved, 'utf8');
  
  console.log('📋 Primeiras 3 linhas:');
  const lines = content.split('\n');
  lines.slice(0, 3).forEach((line, i) => {
    console.log(`   ${i+1}: ${line.substring(0, 80)}`);
  });
  
  console.log('\n📋 Últimas 3 linhas:');
  lines.slice(-3).forEach((line, i) => {
    console.log(`   ${lines.length-2+i}: ${line.substring(0, 80)}`);
  });
  
  console.log('\n✅ Validações:');
  console.log(`   BEGIN PRIVATE KEY: ${content.includes('BEGIN PRIVATE KEY') ? '✅' : '❌'}`);
  console.log(`   END PRIVATE KEY: ${content.includes('END PRIVATE KEY') ? '✅' : '❌'}`);
  console.log(`   Total de linhas: ${lines.length}`);
  
  // Contar linhas de base64 (entre BEGIN e END)
  const beginIdx = content.indexOf('BEGIN PRIVATE KEY');
  const endIdx = content.indexOf('END PRIVATE KEY');
  if (beginIdx > -1 && endIdx > -1) {
    const base64Content = content.substring(beginIdx + 18, endIdx).replace(/\s/g, '');
    console.log(`   Base64 length: ${base64Content.length} chars`);
  }
  
  if (stats.size > 200 && content.includes('BEGIN PRIVATE KEY') && content.includes('END PRIVATE KEY')) {
    console.log('\n✅ Arquivo .p8 parece estar OK!');
    console.log('Se continuar recebendo 401, o problema é permissão da API Key na App Store.');
  } else {
    console.log('\n❌ Arquivo .p8 parece estar corrompido ou vazio.');
    console.log('Passos:');
    console.log('1. Vá para App Store Connect → Users and Access → Keys');
    console.log('2. Clique na chave TT89HULZB3');
    console.log('3. Clique em "Download" para baixar o arquivo AuthKey_TT89HULZB3.p8');
    console.log('4. Copie para: backend/collect-downloads/secrets/AuthKey_TT89HULZB3.p8');
  }
  
} catch (err) {
  console.error(`❌ Erro: ${err.message}`);
  console.error('Verifique se o arquivo existe no caminho correto.');
}
