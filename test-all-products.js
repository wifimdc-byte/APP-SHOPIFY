const shopifyService = require('./src/services/shopifyService');

async function testAllProducts() {
  try {
    console.log('🔄 Testando busca completa de produtos do Shopify...');
    console.log('📦 Domínio:', shopifyService.domain);
    
    // Buscar todos os produtos
    const products = await shopifyService.getAllProducts();
    
    console.log(`\n🎉 Total de produtos encontrados: ${products.length}`);
    
    if (products.length > 0) {
      console.log('\n📋 Primeiros 5 produtos:');
      products.slice(0, 5).forEach((product, index) => {
        console.log(`${index + 1}. ${product.title} (ID: ${product.id})`);
        console.log(`   Preço: R$ ${product.variants[0].price}`);
        console.log(`   Status: ${product.status}`);
        console.log(`   Tags: ${product.tags || 'Nenhuma'}`);
        console.log('');
      });
      
      // Estatísticas por status
      const activeProducts = products.filter(p => p.status === 'active');
      const draftProducts = products.filter(p => p.status === 'draft');
      const archivedProducts = products.filter(p => p.status === 'archived');
      
      console.log('📊 Estatísticas por status:');
      console.log(`   ✅ Ativos: ${activeProducts.length}`);
      console.log(`   📝 Rascunho: ${draftProducts.length}`);
      console.log(`   🗄️  Arquivados: ${archivedProducts.length}`);
      
      // Testar mapeamento de alguns produtos
      console.log('\n🔄 Testando mapeamento de categorias:');
      const sampleProducts = products.slice(0, 10);
      
      for (const product of sampleProducts) {
        const mappedProduct = shopifyService.mapProductToApp(product);
        console.log(`   ${product.title} → ${mappedProduct.categoria}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
    console.error('🔍 Detalhes:', error);
  }
}

// Executar teste
testAllProducts();




