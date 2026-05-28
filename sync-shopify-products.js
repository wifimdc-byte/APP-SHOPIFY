const shopifyService = require('./src/services/shopifyService');
const db = require('./src/database/connection');

async function syncProducts() {
  try {
    console.log('🔄 Iniciando sincronização de produtos do Shopify...');
    
    const result = await shopifyService.syncAllProducts(db);
    
    console.log('\n✅ Sincronização concluída!');
    console.log(`📊 Total de produtos processados: ${result.total}`);
    console.log(`➕ Novos produtos: ${result.synced}`);
    console.log(`🔄 Produtos atualizados: ${result.updated}`);
    
    // Verificar produtos sincronizados
    const syncedProducts = await db.query(`
      SELECT codigo, nome, categoria, preco_varejo, preco_atacado, preco_exclusivo 
      FROM melhor_casas_products 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('\n📋 Últimos produtos sincronizados:');
    syncedProducts.rows.forEach(product => {
      console.log(`   ${product.codigo} - ${product.nome}`);
      console.log(`     Categoria: ${product.categoria}`);
      console.log(`     Normal: R$ ${product.preco_varejo}`);
      console.log(`     Atacado: R$ ${product.preco_atacado}`);
      console.log(`     Exclusivo: R$ ${product.preco_exclusivo}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
  } finally {
    // Fechar conexão com o banco
    await db.end();
  }
}

// Executar sincronização
syncProducts();




