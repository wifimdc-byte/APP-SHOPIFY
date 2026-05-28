const axios = require('axios');

async function checkTokenPermissions() {
  try {
    console.log('🔍 Verificando permissões do token...');
    
    const domain = 'e4ec7f-f5.myshopify.com';
    const adminToken = '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';
    
    const baseURL = `https://${domain}/admin/api/2024-01`;
    const client = axios.create({
      baseURL: baseURL,
      headers: {
        'X-Shopify-Access-Token': adminToken,
        'Content-Type': 'application/json',
      },
    });
    
    // Testar diferentes endpoints para ver quais funcionam
    const endpoints = [
      { name: 'Shop Info', endpoint: '/shop.json' },
      { name: 'Products', endpoint: '/products.json?limit=1' },
      { name: 'Collections', endpoint: '/collections.json' },
      { name: 'Orders', endpoint: '/orders.json?limit=1' },
      { name: 'Customers', endpoint: '/customers.json?limit=1' },
      { name: 'Inventory', endpoint: '/inventory_levels.json?limit=1' },
      { name: 'Locations', endpoint: '/locations.json' },
      { name: 'Webhooks', endpoint: '/webhooks.json' }
    ];
    
    console.log('\n📊 Testando permissões por endpoint:');
    
    for (const { name, endpoint } of endpoints) {
      try {
        const response = await client.get(endpoint);
        console.log(`✅ ${name}: OK (${response.status})`);
      } catch (error) {
        const status = error.response?.status || 'Unknown';
        const message = error.response?.data?.errors || error.message;
        console.log(`❌ ${name}: ${status} - ${message}`);
      }
    }
    
    // Verificar se conseguimos acessar produtos com collections
    console.log('\n🔍 Testando produtos com informações de collections...');
    try {
      const response = await client.get('/products.json?limit=5');
      console.log(`✅ Produtos encontrados: ${response.data.products.length}`);
      
      if (response.data.products.length > 0) {
        console.log('\n📦 Primeiros produtos:');
        response.data.products.forEach((product, index) => {
          console.log(`${index + 1}. ${product.title}`);
          console.log(`   ID: ${product.id}`);
          console.log(`   Status: ${product.status}`);
          console.log(`   Product Type: ${product.product_type}`);
          console.log(`   Tags: ${product.tags || 'Nenhuma'}`);
          console.log(`   Collections: ${product.collections?.length || 0}`);
          if (product.collections && product.collections.length > 0) {
            product.collections.forEach(collection => {
              console.log(`     - ${collection.title} (ID: ${collection.id})`);
            });
          }
          console.log('');
        });
      }
    } catch (error) {
      console.log('❌ Erro ao buscar produtos:', error.response?.data || error.message);
    }
    
    // Verificar se conseguimos acessar collections via produtos
    console.log('\n🔍 Testando acesso a collections via produtos...');
    try {
      const response = await client.get('/products.json?limit=1');
      if (response.data.products.length > 0) {
        const product = response.data.products[0];
        console.log(`📦 Produto: ${product.title}`);
        
        // Tentar buscar collections do produto
        try {
          const collectionsResponse = await client.get(`/products/${product.id}/collections.json`);
          console.log(`✅ Collections do produto: ${collectionsResponse.data.collections?.length || 0}`);
        } catch (error) {
          console.log(`❌ Erro ao buscar collections do produto: ${error.response?.data || error.message}`);
        }
      }
    } catch (error) {
      console.log('❌ Erro ao buscar produto:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar verificação
checkTokenPermissions();




