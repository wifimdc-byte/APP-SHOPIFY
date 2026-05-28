// Deep debug para investigar 401 mesmo com admin
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const ISSUER = process.env.APPLE_ISSUER_ID;
const KEY_ID = process.env.APPLE_KEY_ID;
const P8_PATH = process.env.APPLE_P8_PATH;

async function deepDebug() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         INVESTIGAÇÃO PROFUNDA - ERROR 401 PERSISTENTE           ║
╚════════════════════════════════════════════════════════════════╝\n`);

  // ===== 1. VALIDAR ARQUIVOS E CREDENCIAIS =====
  console.log('=== 1. VALIDAÇÃO DE ARQUIVOS ===\n');
  
  const p8Resolved = path.resolve(__dirname, P8_PATH);
  console.log(`Procurando .p8 em: ${p8Resolved}`);
  
  if (!fs.existsSync(p8Resolved)) {
    console.error(`❌ Arquivo NÃO encontrado!`);
    process.exit(1);
  }
  
  const p8Content = fs.readFileSync(p8Resolved, 'utf8');
  const p8Stats = fs.statSync(p8Resolved);
  
  console.log(`✅ Arquivo encontrado`);
  console.log(`   Tamanho: ${p8Stats.size} bytes`);
  console.log(`   Primeira linha: ${p8Content.split('\n')[0]}`);
  console.log(`   Última linha: ${p8Content.trim().split('\n').pop()}\n`);
  
  // ===== 2. EXTRAIR CHAVE PÚBLICA DO .p8 =====
  console.log('=== 2. EXTRAÇÃO DE INFORMAÇÕES ===\n');
  
  try {
    const keyObject = crypto.createPrivateKey({ key: p8Content, format: 'pem' });
    const publicKey = crypto.createPublicKey(keyObject);
    const publicKeyPEM = publicKey.export({ format: 'pem', type: 'spki' });
    
    console.log(`✅ Chave privada válida (ES256)`);
    console.log(`   Tipo de algoritmo: ${keyObject.asymmetricKeyType}`);
    console.log(`   Tamanho: ${keyObject.asymmetricKeySize * 8} bits\n`);
  } catch (err) {
    console.error(`❌ Erro ao processar .p8: ${err.message}\n`);
  }
  
  // ===== 3. VALIDAR CREDENCIAIS =====
  console.log('=== 3. VERIFICAÇÃO DE CREDENCIAIS ===\n');
  
  console.log(`APPLE_ISSUER_ID: ${ISSUER}`);
  console.log(`APPLE_KEY_ID: ${KEY_ID}`);
  console.log(`APPLE_P8_PATH: ${P8_PATH}`);
  
  // Validação básica UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  console.log(`\n✅ ISSUER é UUID válido: ${uuidRegex.test(ISSUER)}`);
  console.log(`✅ KEY_ID é formato válido: ${KEY_ID.length === 10}\n`);
  
  // ===== 4. GERAR JWT E DECODIFICAR =====
  console.log('=== 4. GERAÇÃO E VALIDAÇÃO JWT ===\n');
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
  };
  
  const token = jwt.sign(payload, p8Content, { 
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' }
  });
  
  const decoded = jwt.decode(token, { complete: true });
  console.log(`Token gerado: ${token.substring(0, 50)}...`);
  console.log(`Comprimento: ${token.length} chars\n`);
  console.log(`Header:`);
  console.log(JSON.stringify(decoded.header, null, 2));
  console.log(`\nPayload:`);
  console.log(JSON.stringify(decoded.payload, null, 2));
  console.log();
  
  // ===== 5. TESTAR DIFERENTES ENDPOINTS =====
  console.log('=== 5. TESTES DE ENDPOINTS ===\n');
  
  const endpoints = [
    {
      name: 'Sales Reports (atual)',
      url: 'https://api.appstoreconnect.apple.com/v1/salesReports',
      params: { 'filter[reportDate]': new Date().toISOString().split('T')[0] }
    },
    {
      name: 'Apps',
      url: 'https://api.appstoreconnect.apple.com/v1/apps',
      params: {}
    },
    {
      name: 'Finance Reports',
      url: 'https://api.appstoreconnect.apple.com/v1/financeReports',
      params: { 'filter[reportDate]': new Date().toISOString().split('T')[0] }
    },
    {
      name: 'Reports (generic)',
      url: 'https://api.appstoreconnect.apple.com/v1/reports',
      params: {}
    }
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`🧪 Testando: ${endpoint.name}`);
      const response = await axios.get(endpoint.url, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        params: endpoint.params,
        timeout: 5000,
      });
      
      console.log(`   ✅ ${response.status} - Funcionou!\n`);
    } catch (err) {
      const status = err.response?.status || 'ERRO';
      const message = err.response?.data?.errors?.[0]?.detail || err.message;
      console.log(`   ❌ ${status} - ${message}\n`);
    }
  }
  
  // ===== 6. INVESTIGAÇÃO AVANÇADA =====
  console.log('=== 6. PRÓXIMOS PASSOS ===\n');
  
  console.log(`Se TODOS os endpoints retornam 401:`);
  console.log(`  1. Verifique se a chave está no status "Active"`);
  console.log(`     App Store Connect → Users and Access → Keys`);
  console.log(`     Procure por "${KEY_ID}" - status deve ser "Active"\n`);
  
  console.log(`  2. Verifique a data do servidor vs local`);
  console.log(`     Servidor time: ${new Date(now * 1000).toISOString()}`);
  console.log(`     Local time: ${new Date().toISOString()}`);
  console.log(`     Diferença > 5 min causa erro\n`);
  
  console.log(`  3. Pode ser um problema de IP restrito`);
  console.log(`     App Store Connect algumas vezes bloqueia por IP\n`);
  
  console.log(`  4. Tente criar chave com TODOS os acessos`);
  console.log(`     - Finance`);
  console.log(`     - Sales`);
  console.log(`     - Reports (se disponível)\n`);
  
  console.log(`  5. Último recurso: contate Apple Support`);
  console.log(`     - Forneça o KEY_ID: ${KEY_ID}`);
  console.log(`     - Forneça o ISSUER: ${ISSUER}`);
}

deepDebug().catch(e => {
  console.error('❌ Erro fatal:', e.message);
  process.exit(1);
});
