const shopifyService = require('./src/services/shopifyService');

async function testShopifyAccess() {
  try {
    console.log('🔍 Testando acesso ao Shopify...');
    console.log('📦 Domínio:', shopifyService.domain);
    console.log('🔑 Token:', shopifyService.adminToken.substring(0, 10) + '...');
    
    // Testar conexão básica
    console.log('\n1️⃣ Testando conexão básica...');
    try {
      const response = await shopifyService.client.get('/shop.json');
      console.log('✅ Conexão OK');
      console.log('🏪 Loja:', response.data.shop.name);
    } catch (error) {
      console.log('❌ Erro na conexão:', error.response?.data || error.message);
    }
    
    // Testar collections
    console.log('\n2️⃣ Testando collections...');
    try {
      const collections = await shopifyService.getAllCollections();
      console.log(`✅ Collections encontradas: ${collections.length}`);
      
      if (collections.length > 0) {
        console.log('\n📋 Collections disponíveis:');
        collections.forEach((collection, index) => {
          console.log(`${index + 1}. ${collection.title} (ID: ${collection.id})`);
          console.log(`   Handle: ${collection.handle}`);
          console.log(`   Status: ${collection.published_at ? 'Publicada' : 'Rascunho'}`);
        });
      } else {
        console.log('⚠️  Nenhuma collection encontrada');
      }
    } catch (error) {
      console.log('❌ Erro ao buscar collections:', error.response?.data || error.message);
    }
    
    // Testar produtos
    console.log('\n3️⃣ Testando produtos...');
    try {
      const response = await shopifyService.client.get('/products.json?limit=5');
      console.log(`✅ Produtos encontrados: ${response.data.products.length}`);
      
      if (response.data.products.length > 0) {
        console.log('\n📦 Primeiros produtos:');
        response.data.products.forEach((product, index) => {
          console.log(`${index + 1}. ${product.title} (ID: ${product.id})`);
          console.log(`   Preço: R$ ${product.variants[0].price}`);
          console.log(`   Status: ${product.status}`);
        });
      }
    } catch (error) {
      console.log('❌ Erro ao buscar produtos:', error.response?.data || error.message);
    }
    
    // Testar collections específicas
    console.log('\n4️⃣ Testando collections específicas...');
    const testCollections = ['Beleza - APP', 'Papelaria - APP', 'Casa - APP', 'Brinquedos - APP', 'Tecnologia - APP', 'Pets - APP'];
    
    for (const collectionName of testCollections) {
      try {
        const response = await shopifyService.client.get(`/collections.json?title=${encodeURIComponent(collectionName)}`);
        if (response.data.collections.length > 0) {
          console.log(`✅ Collection "${collectionName}" encontrada`);
        } else {
          console.log(`❌ Collection "${collectionName}" não encontrada`);
        }
      } catch (error) {
        console.log(`❌ Erro ao buscar "${collectionName}":`, error.response?.data || error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar teste
testShopifyAccess();




