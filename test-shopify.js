const shopifyService = require('./src/services/shopifyService');

async function testShopifyConnection() {
  try {
    console.log('🔄 Testando conexão com Shopify...');
    console.log('📦 Domínio:', shopifyService.domain);
    
    // Testar busca de produtos
    const products = await shopifyService.getAllProducts();
    console.log(`✅ Conexão estabelecida! Encontrados ${products.length} produtos`);
    
    if (products.length > 0) {
      const sampleProduct = products[0];
      console.log('\n📋 Produto de exemplo:');
      console.log(`   ID: ${sampleProduct.id}`);
      console.log(`   Nome: ${sampleProduct.title}`);
      console.log(`   Preço: R$ ${sampleProduct.variants[0].price}`);
      console.log(`   Status: ${sampleProduct.status}`);
      console.log(`   Imagens: ${sampleProduct.images.length}`);
      
      // Testar mapeamento
      const mappedProduct = shopifyService.mapProductToApp(sampleProduct);
      console.log('\n🔄 Produto mapeado:');
      console.log(`   Código: ${mappedProduct.codigo}`);
      console.log(`   Nome: ${mappedProduct.nome}`);
      console.log(`   Categoria: ${mappedProduct.categoria}`);
      console.log(`   Preço Normal: R$ ${mappedProduct.preco_varejo}`);
      console.log(`   Preço Atacado: R$ ${mappedProduct.preco_atacado}`);
      console.log(`   Preço Exclusivo: R$ ${mappedProduct.preco_exclusivo}`);
    }
    
    // Testar busca de coleções
    console.log('\n📂 Testando busca de coleções...');
    const collections = await shopifyService.getAllCollections();
    console.log(`✅ Encontradas ${collections.length} coleções`);
    
    if (collections.length > 0) {
      console.log('\n📋 Coleções encontradas:');
      collections.forEach(collection => {
        console.log(`   - ${collection.title} (${collection.id})`);
      });
    }
    
    console.log('\n🎉 Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
    console.error('🔍 Detalhes:', error);
  }
}

// Executar teste
testShopifyConnection();




