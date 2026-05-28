const shopifyService = require('./src/services/shopifyService');
const db = require('./src/database/connection');

async function syncProductsBulk() {
  try {
    console.log('🚀 Iniciando sincronização de produtos usando Bulk Operations...\n');
    
    const result = await shopifyService.syncAllProductsBulk(db);
    
    console.log('\n✅ Sincronização concluída!');
    console.log(`📊 Resultado:`);
    console.log(`   - Total de produtos: ${result.total}`);
    console.log(`   - Bulk Operation ID: ${result.bulkOperationId}`);
    console.log(`   - URL dos resultados: ${result.url}`);
    console.log(`\n💡 Para processar os resultados, use:`);
    console.log(`   node process-bulk-results.js ${result.url}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro na sincronização:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

syncProductsBulk();
