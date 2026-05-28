const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const ISSUER = process.env.APPLE_ISSUER_ID;
const KEY_ID = process.env.APPLE_KEY_ID;
const P8_PATH = process.env.APPLE_P8_PATH;

async function debugAppStore() {
  console.log('🔍 [Debug] Investigando problema App Store 401...\n');
  
  const p8Resolved = path.resolve(__dirname, P8_PATH);
  const privateKey = fs.readFileSync(p8Resolved, 'utf8');
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
  };
  
  console.log('=== TESTE 1: JWT com header customizado (atual) ===\n');
  try {
    const token1 = jwt.sign(payload, privateKey, { 
      algorithm: 'ES256', 
      header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' } 
    });
    
    console.log(`Token (primeiros 100 chars): ${token1.substring(0, 100)}...`);
    console.log(`Token length: ${token1.length}\n`);
    
    // Tentar requisição
    const res1 = await axios.get('https://api.appstoreconnect.apple.com/v1/salesReports', {
      headers: { Authorization: `Bearer ${token1}` },
      params: { 'filter[reportDate]': new Date().toISOString().split('T')[0] },
      timeout: 5000,
    }).catch(e => ({ status: e.response?.status, error: e.message }));
    
    console.log(`Resultado: ${res1.status === 200 ? '✅ OK' : `❌ ${res1.status}`}\n`);
  } catch (err) {
    console.error(`❌ Erro: ${err.message}\n`);
  }
  
  console.log('=== TESTE 2: JWT SEM header customizado ===\n');
  try {
    const token2 = jwt.sign(payload, privateKey, { algorithm: 'ES256' });
    
    console.log(`Token (primeiros 100 chars): ${token2.substring(0, 100)}...`);
    console.log(`Token length: ${token2.length}\n`);
    
    const res2 = await axios.get('https://api.appstoreconnect.apple.com/v1/salesReports', {
      headers: { Authorization: `Bearer ${token2}` },
      params: { 'filter[reportDate]': new Date().toISOString().split('T')[0] },
      timeout: 5000,
    }).catch(e => ({ status: e.response?.status, error: e.message }));
    
    console.log(`Resultado: ${res2.status === 200 ? '✅ OK' : `❌ ${res2.status}`}\n`);
  } catch (err) {
    console.error(`❌ Erro: ${err.message}\n`);
  }
  
  console.log('=== TESTE 3: Decodificar token para validar estrutura ===\n');
  try {
    const testToken = jwt.sign(payload, privateKey, { algorithm: 'ES256' });
    const decoded = jwt.decode(testToken, { complete: true });
    
    console.log('Header:', JSON.stringify(decoded.header, null, 2));
    console.log('Payload:', JSON.stringify(decoded.payload, null, 2));
  } catch (err) {
    console.error(`❌ Erro: ${err.message}\n`);
  }
  
  console.log('=== RESUMO ===\n');
  console.log('Se ambos testes retornarem 401:');
  console.log('1. API Key `' + KEY_ID + '` pode não ter permissão Sales/Trends');
  console.log('2. Verificar se a API Key está ATIVA (não expirada)');
  console.log('3. Tentar criar NOVA API Key com acesso explícito Finance\n');
  
  console.log('Próximos passos:');
  console.log('- App Store Connect → Users and Access → Keys');
  console.log('- Verifique se `' + KEY_ID + '` tem status "Active"');
  console.log('- Clique na chave e confirme "Sales & Trends" está marcado\n');
  
  process.exit(0);
}

debugAppStore().catch(e => {
  console.error('Erro fatal:', e.message);
  process.exit(1);
});
