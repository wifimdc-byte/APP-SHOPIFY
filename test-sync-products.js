const shopifyService = require('./src/services/shopifyService');
const db = require('./src/database/connection');

async function testSync() {
  try {
    console.log('🧪 Testando sincronização de produtos...\n');
    
    // Primeiro, verificar quantos produtos existem no Shopify
    console.log('1️⃣ Testando busca de todos os produtos (direto)...');
    const allProducts = await shopifyService.getAllProductsDirect();
    console.log(`✅ Encontrados ${allProducts.length} produtos no Shopify\n`);
    
    // Verificar coleções APP
    console.log('2️⃣ Testando busca de produtos de coleções "- APP"...');
    const appProducts = await shopifyService.getAllProducts();
    console.log(`✅ Encontrados ${appProducts.length} produtos em coleções "- APP"\n`);
    
    if (appProducts.length === 0 && allProducts.length > 0) {
      console.log('⚠️  Nenhum produto em coleções "- APP", mas há produtos no Shopify!');
      console.log('💡 Vamos sincronizar todos os produtos...\n');
    }
    
    // Sincronizar todos os produtos (não apenas APP)
    console.log('3️⃣ Iniciando sincronização (todos os produtos)...');
    const result = await shopifyService.syncAllProducts(db, false);
    
    console.log('\n✅ Sincronização concluída!');
    console.log(`📊 Resultado:`);
    console.log(`   - Total no Shopify: ${result.total}`);
    console.log(`   - Novos produtos: ${result.synced}`);
    console.log(`   - Produtos atualizados: ${result.updated}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

testSync();


