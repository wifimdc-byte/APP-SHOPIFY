const shopifyService = require('./src/services/shopifyService');

async function debugCollections() {
  try {
    console.log('🔍 Debugando acesso às collections...');
    console.log('📦 Domínio:', shopifyService.domain);
    
    // Teste 1: Buscar collections básicas
    console.log('\n1️⃣ Testando busca básica de collections...');
    try {
      const response = await shopifyService.client.get('/collections.json');
      console.log('✅ Resposta recebida');
      console.log('📊 Status:', response.status);
      console.log('📋 Collections encontradas:', response.data.collections?.length || 0);
      
      if (response.data.collections && response.data.collections.length > 0) {
        console.log('\n📋 Collections disponíveis:');
        response.data.collections.forEach((collection, index) => {
          console.log(`${index + 1}. "${collection.title}" (ID: ${collection.id})`);
          console.log(`   Handle: ${collection.handle}`);
          console.log(`   Status: ${collection.published_at ? 'Publicada' : 'Rascunho'}`);
        });
      }
    } catch (error) {
      console.log('❌ Erro na busca básica:', error.response?.data || error.message);
    }
    
    // Teste 2: Buscar collections com parâmetros específicos
    console.log('\n2️⃣ Testando busca com parâmetros...');
    try {
      const response = await shopifyService.client.get('/collections.json?limit=50');
      console.log('✅ Busca com limit=50 funcionou');
      console.log('📋 Collections:', response.data.collections?.length || 0);
    } catch (error) {
      console.log('❌ Erro com parâmetros:', error.response?.data || error.message);
    }
    
    // Teste 3: Buscar collections publicadas
    console.log('\n3️⃣ Testando busca de collections publicadas...');
    try {
      const response = await shopifyService.client.get('/collections.json?published_status=published');
      console.log('✅ Busca de publicadas funcionou');
      console.log('📋 Collections publicadas:', response.data.collections?.length || 0);
    } catch (error) {
      console.log('❌ Erro com published_status:', error.response?.data || error.message);
    }
    
    // Teste 4: Buscar collections por título específico
    console.log('\n4️⃣ Testando busca por título específico...');
    const testTitles = ['Beleza - APP', 'Papelaria - APP', 'Casa - APP'];
    
    for (const title of testTitles) {
      try {
        const response = await shopifyService.client.get(`/collections.json?title=${encodeURIComponent(title)}`);
        console.log(`✅ Busca por "${title}": ${response.data.collections?.length || 0} encontradas`);
        
        if (response.data.collections && response.data.collections.length > 0) {
          response.data.collections.forEach(collection => {
            console.log(`   - "${collection.title}" (ID: ${collection.id})`);
          });
        }
      } catch (error) {
        console.log(`❌ Erro ao buscar "${title}":`, error.response?.data || error.message);
      }
    }
    
    // Teste 5: Buscar collections por handle
    console.log('\n5️⃣ Testando busca por handle...');
    const testHandles = ['beleza-app', 'papelaria-app', 'casa-app'];
    
    for (const handle of testHandles) {
      try {
        const response = await shopifyService.client.get(`/collections.json?handle=${handle}`);
        console.log(`✅ Busca por handle "${handle}": ${response.data.collections?.length || 0} encontradas`);
      } catch (error) {
        console.log(`❌ Erro ao buscar handle "${handle}":`, error.response?.data || error.message);
      }
    }
    
    // Teste 6: Buscar collections com paginação
    console.log('\n6️⃣ Testando busca com paginação...');
    try {
      const response = await shopifyService.client.get('/collections.json?limit=250');
      console.log('✅ Busca com limit=250 funcionou');
      console.log('📋 Total de collections:', response.data.collections?.length || 0);
      
      if (response.data.collections && response.data.collections.length > 0) {
        const appCollections = response.data.collections.filter(collection => 
          collection.title && collection.title.includes('- APP')
        );
        console.log(`🎯 Collections com "- APP": ${appCollections.length}`);
        
        appCollections.forEach(collection => {
          console.log(`   - "${collection.title}" (ID: ${collection.id})`);
        });
      }
    } catch (error) {
      console.log('❌ Erro com paginação:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar debug
debugCollections();




