const shopifyService = require('./src/services/shopifyService');
const db = require('./src/database/connection');

async function syncAll() {
  try {
    console.log('🚀 Iniciando sincronização completa de TODOS os produtos do Shopify...\n');
    
    const result = await shopifyService.syncAllProducts(db);
    
    console.log('\n✅ Sincronização concluída com sucesso!');
    console.log(`📊 Resultado:`);
    console.log(`   - Total de produtos no Shopify: ${result.total}`);
    console.log(`   - Novos produtos adicionados: ${result.synced}`);
    console.log(`   - Produtos atualizados: ${result.updated}`);
    console.log(`\n🎉 ${result.synced + result.updated} produtos processados!`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro na sincronização:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

syncAll();


