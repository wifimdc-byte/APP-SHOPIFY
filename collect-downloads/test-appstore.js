const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function testAppStore() {
  console.log('🧪 [Test] Testando App Store Connect API...\n');
  
  const ISSUER = process.env.APPLE_ISSUER_ID;
  const KEY_ID = process.env.APPLE_KEY_ID;
  const P8_PATH = process.env.APPLE_P8_PATH;
  
  console.log('📋 Variáveis carregadas:');
  console.log(`   ISSUER_ID: ${ISSUER || 'VAZIO'}`);
  console.log(`   KEY_ID: ${KEY_ID || 'VAZIO'}`);
  console.log(`   P8_PATH: ${P8_PATH || 'VAZIO'}\n`);
  
  if (!ISSUER || !KEY_ID) {
    console.error('❌ Variáveis ISSUER_ID ou KEY_ID não definidas no .env');
    process.exit(1);
  }
  
  if (!P8_PATH) {
    console.error('❌ Variável APPLE_P8_PATH não definida no .env');
    process.exit(1);
  }
  
  // Tentar ler o arquivo .p8
  const p8Resolved = path.resolve(__dirname, P8_PATH);
  console.log(`📂 Tentando ler .p8 de: ${p8Resolved}`);
  
  let privateKey;
  try {
    privateKey = fs.readFileSync(p8Resolved, 'utf8');
    console.log(`✅ Arquivo .p8 lido com sucesso (${privateKey.length} bytes)\n`);
  } catch (err) {
    console.error(`❌ Erro ao ler .p8: ${err.message}`);
    process.exit(1);
  }
  
  // Validar formato da chave
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    console.error('❌ Arquivo .p8 não tem o formato esperado (não contém "BEGIN PRIVATE KEY")');
    process.exit(1);
  }
  console.log('✅ Formato da chave válido\n');
  
  // Gerar JWT
  console.log('🔐 Gerando JWT...');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    iat: now,
    exp: now + 20 * 60, // 20 minutos
    aud: 'appstoreconnect-v1',
  };
  
  let token;
  try {
    token = jwt.sign(payload, privateKey, { 
      algorithm: 'ES256', 
      header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' } 
    });
    console.log(`✅ JWT gerado com sucesso (${token.length} chars)\n`);
    
    // Teste rápido de decodificação
    const decoded = jwt.verify(token, privateKey, { algorithms: ['ES256'] });
    console.log('✅ JWT decodificado com sucesso');
    console.log(`   iss: ${decoded.iss}`);
    console.log(`   aud: ${decoded.aud}\n`);
  } catch (err) {
    console.error(`❌ Erro ao gerar/validar JWT: ${err.message}`);
    process.exit(1);
  }
  
  // Fazer uma requisição de teste à API
  console.log('🌐 Testando requisição à API (/v1/apps)...');
    try {
    // REMOVIDO: params: { ... } - Não envie filtros de vendas para rota de apps!
    const response = await axios.get('https://api.appstoreconnect.apple.com/v1/apps?limit=1', {
        headers: { 
        Authorization: `Bearer ${token}`
        },
        timeout: 5000,
    });
    
    console.log(`✅ Requisição bem-sucedida! Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data).substring(0, 100)}...\n`);
  } catch (err) {
    if (err.response) {
      console.error(`❌ Erro HTTP ${err.response.status}`);
      console.error(`   Mensagem: ${err.response.statusText}`);
      console.error(`   Body: ${JSON.stringify(err.response.data).substring(0, 200)}\n`);
      
      if (err.response.status === 401) {
        console.error('⚠️  401 = Não autorizado. Possíveis causas:');
        console.log('   - ISSUER_ID ou KEY_ID incorretos');
        console.log('   - Arquivo .p8 não corresponde ao KEY_ID');
        console.log('   - API Key sem permissão para Sales/Reports');
        console.log('   - Relógio do sistema desincronizado\n');
      }
    } else if (err.code === 'ECONNREFUSED') {
      console.error('❌ Erro de conexão - não conseguiu conectar à API (verifique internet)');
    } else {
      console.error(`❌ Erro: ${err.message}`);
    }
  } finally {
    console.log('✅ Teste concluído');
    process.exit(0);
  }
}

testAppStore();
