const shopifyService = require('./src/services/shopifyService');

async function checkCollections() {
  try {
    console.log('🔄 Verificando collections do Shopify...');
    
    // Buscar todas as collections
    const collections = await shopifyService.getAllCollections();
    
    console.log(`\n📋 Total de collections encontradas: ${collections.length}`);
    
    // Filtrar apenas as que contêm "- APP"
    const appCollections = collections.filter(collection => 
      collection.title && collection.title.includes('- APP')
    );
    
    console.log(`\n🎯 Collections com "- APP": ${appCollections.length}`);
    
    appCollections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.title} (ID: ${collection.id})`);
      console.log(`   Handle: ${collection.handle}`);
      console.log(`   Status: ${collection.published_at ? 'Publicada' : 'Rascunho'}`);
      console.log('');
    });
    
    // Verificar produtos em cada collection
    console.log('🔍 Verificando produtos em cada collection...');
    
    for (const collection of appCollections) {
      try {
        const products = await shopifyService.client.get(`/collections/${collection.id}/products.json`);
        console.log(`📦 ${collection.title}: ${products.data.products.length} produtos`);
      } catch (error) {
        console.log(`❌ Erro ao buscar produtos de ${collection.title}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar collections:', error.response?.data || error.message);
  }
}

// Executar verificação
checkCollections();




