const axios = require('axios');

async function testApiPermissions() {
  try {
    console.log('🔍 Testando permissões da API...');
    
    const domain = 'e4ec7f-f5.myshopify.com';
    const adminToken = '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';
    
    // Testar diferentes versões da API
    const apiVersions = ['2024-01', '2023-10', '2023-07', '2023-04'];
    
    for (const version of apiVersions) {
      console.log(`\n📡 Testando API versão ${version}...`);
      
      try {
        const baseURL = `https://${domain}/admin/api/${version}`;
        const client = axios.create({
          baseURL: baseURL,
          headers: {
            'X-Shopify-Access-Token': adminToken,
            'Content-Type': 'application/json',
          },
        });
        
        // Testar shop
        const shopResponse = await client.get('/shop.json');
        console.log(`✅ Shop OK: ${shopResponse.data.shop.name}`);
        
        // Testar collections
        const collectionsResponse = await client.get('/collections.json');
        console.log(`✅ Collections OK: ${collectionsResponse.data.collections?.length || 0} encontradas`);
        
        if (collectionsResponse.data.collections && collectionsResponse.data.collections.length > 0) {
          console.log('📋 Collections disponíveis:');
          collectionsResponse.data.collections.forEach((collection, index) => {
            console.log(`   ${index + 1}. "${collection.title}" (ID: ${collection.id})`);
          });
          
          // Verificar collections com "- APP"
          const appCollections = collectionsResponse.data.collections.filter(collection => 
            collection.title && collection.title.includes('- APP')
          );
          console.log(`🎯 Collections com "- APP": ${appCollections.length}`);
          
          if (appCollections.length > 0) {
            console.log('✅ Encontradas collections com "- APP"!');
            appCollections.forEach(collection => {
              console.log(`   - "${collection.title}" (ID: ${collection.id})`);
            });
            break; // Parar no primeiro sucesso
          }
        }
        
      } catch (error) {
        console.log(`❌ Erro na versão ${version}:`, error.response?.data || error.message);
      }
    }
    
    // Testar permissões específicas
    console.log('\n🔐 Testando permissões específicas...');
    
    try {
      const baseURL = `https://${domain}/admin/api/2024-01`;
      const client = axios.create({
        baseURL: baseURL,
        headers: {
          'X-Shopify-Access-Token': adminToken,
          'Content-Type': 'application/json',
        },
      });
      
      // Testar diferentes endpoints
      const endpoints = [
        '/shop.json',
        '/products.json?limit=1',
        '/collections.json',
        '/collections.json?limit=1',
        '/collections.json?published_status=published',
        '/collections.json?published_status=any'
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await client.get(endpoint);
          console.log(`✅ ${endpoint}: OK (${response.status})`);
        } catch (error) {
          console.log(`❌ ${endpoint}: ${error.response?.status} - ${error.response?.data?.errors || error.message}`);
        }
      }
      
    } catch (error) {
      console.log('❌ Erro geral:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar teste
testApiPermissions();




