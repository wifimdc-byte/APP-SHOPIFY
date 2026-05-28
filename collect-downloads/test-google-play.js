const { fetchPlayInstalls } = require('./google-play-fetch');
const { parsePlayMetrics } = require('./parse');

async function testGooglePlay() {
  console.log('🧪 Testando Google Play fetch...\n');

  const playJson = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  const packageName = process.env.PLAY_PACKAGE_NAME;

  if (!playJson) {
    console.error('❌ PLAY_SERVICE_ACCOUNT_JSON não definida');
    process.exit(1);
  }

  if (!packageName) {
    console.error('❌ PLAY_PACKAGE_NAME não definida');
    process.exit(1);
  }

  console.log('✅ Variáveis de ambiente detectadas:');
  console.log(`   - PLAY_PACKAGE_NAME: ${packageName}`);
  console.log(`   - PLAY_SERVICE_ACCOUNT_JSON: ${playJson.substring(0, 50)}...\n`);

  try {
    // Parsear o JSON
    let serviceAccountJson;
    try {
      serviceAccountJson = JSON.parse(playJson);
      console.log('✅ Service Account JSON parseado com sucesso');
      console.log(`   - Project ID: ${serviceAccountJson.project_id}`);
      console.log(`   - Service Account: ${serviceAccountJson.client_email}\n`);
    } catch (e) {
      console.error('❌ Erro ao fazer parse do JSON:', e.message);
      process.exit(1);
    }

    // Testar com data de ontem
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const startDate = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

    console.log(`📅 Buscando dados para: ${startDate}\n`);

    const data = await fetchPlayInstalls(serviceAccountJson, packageName, startDate, startDate);
    console.log('📥 Resposta do Google Play Storage:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n');

    const parsed = parsePlayMetrics(data);
    console.log('📊 Dados parseados:');
    console.log(`   - Installs: ${parsed.installs}\n`);

    if (parsed.installs !== null && parsed.installs > 0) {
      console.log('✅ Teste bem-sucedido! Google Play está funcionando.\n');
      console.log('Próximas etapas:');
      console.log('1. Configurar DATABASE_URL no .env');
      console.log('2. Rodar: node run-all.js');
      console.log('3. Verificar dados na tabela app_store_installs');
      console.log('4. Dashboard vai mostrar os dados em "Instalações Reais"\n');
    } else {
      console.warn('⚠️  Nenhum install encontrado para essa data.');
      console.warn('   Tente com uma data com mais dados (ex: últimos 7 dias)');
      console.log('\n');
    }
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  testGooglePlay();
}

module.exports = { testGooglePlay };
