const axios = require('axios');

async function analyzeProduct() {
  try {
    console.log('🔍 Analisando produto específico do Shopify...');
    
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
    
    // Buscar alguns produtos para análise
    console.log('📦 Buscando produtos para análise...');
    const response = await client.get('/products.json?limit=5');
    
    if (response.data.products.length === 0) {
      console.log('❌ Nenhum produto encontrado');
      return;
    }
    
    // Analisar cada produto
    for (let i = 0; i < response.data.products.length; i++) {
      const product = response.data.products[i];
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 PRODUTO ${i + 1}: ${product.title}`);
      console.log(`${'='.repeat(80)}`);
      
      // Informações básicas
      console.log('\n📋 INFORMAÇÕES BÁSICAS:');
      console.log(`   ID: ${product.id}`);
      console.log(`   Título: ${product.title}`);
      console.log(`   Handle: ${product.handle}`);
      console.log(`   Status: ${product.status}`);
      console.log(`   Published At: ${product.published_at}`);
      console.log(`   Created At: ${product.created_at}`);
      console.log(`   Updated At: ${product.updated_at}`);
      console.log(`   Vendor: ${product.vendor}`);
      console.log(`   Product Type: ${product.product_type}`);
      console.log(`   Tags: ${product.tags || 'Nenhuma'}`);
      
      // Informações de SEO
      console.log('\n🔍 INFORMAÇÕES DE SEO:');
      console.log(`   SEO Title: ${product.seo_title || 'Nenhuma'}`);
      console.log(`   SEO Description: ${product.seo_description || 'Nenhuma'}`);
      
      // Informações de vendas
      console.log('\n💰 INFORMAÇÕES DE VENDAS:');
      console.log(`   Published Scope: ${product.published_scope}`);
      console.log(`   Template Suffix: ${product.template_suffix || 'Nenhuma'}`);
      console.log(`   Gift Card: ${product.gift_card}`);
      
      // Variantes
      console.log('\n🔄 VARIANTES:');
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant, index) => {
          console.log(`   Variante ${index + 1}:`);
          console.log(`     ID: ${variant.id}`);
          console.log(`     Título: ${variant.title}`);
          console.log(`     Preço: R$ ${variant.price}`);
          console.log(`     SKU: ${variant.sku || 'Nenhuma'}`);
          console.log(`     Barcode: ${variant.barcode || 'Nenhuma'}`);
          console.log(`     Inventory Quantity: ${variant.inventory_quantity}`);
          console.log(`     Weight: ${variant.weight} ${variant.weight_unit}`);
          console.log(`     Requires Shipping: ${variant.requires_shipping}`);
          console.log(`     Taxable: ${variant.taxable}`);
          console.log(`     Position: ${variant.position}`);
          console.log(`     Created At: ${variant.created_at}`);
          console.log(`     Updated At: ${variant.updated_at}`);
        });
      }
      
      // Imagens
      console.log('\n🖼️ IMAGENS:');
      if (product.images && product.images.length > 0) {
        product.images.forEach((image, index) => {
          console.log(`   Imagem ${index + 1}:`);
          console.log(`     ID: ${image.id}`);
          console.log(`     URL: ${image.src}`);
          console.log(`     Alt Text: ${image.alt || 'Nenhuma'}`);
          console.log(`     Position: ${image.position}`);
          console.log(`     Created At: ${image.created_at}`);
          console.log(`     Updated At: ${image.updated_at}`);
        });
      } else {
        console.log('   Nenhuma imagem');
      }
      
      // Opções
      console.log('\n⚙️ OPÇÕES:');
      if (product.options && product.options.length > 0) {
        product.options.forEach((option, index) => {
          console.log(`   Opção ${index + 1}:`);
          console.log(`     ID: ${option.id}`);
          console.log(`     Nome: ${option.name}`);
          console.log(`     Posição: ${option.position}`);
          console.log(`     Valores: ${option.values.join(', ')}`);
        });
      } else {
        console.log('   Nenhuma opção');
      }
      
      // Metafields
      console.log('\n🏷️ METAFIELDS:');
      if (product.metafields && product.metafields.length > 0) {
        product.metafields.forEach((metafield, index) => {
          console.log(`   Metafield ${index + 1}:`);
          console.log(`     ID: ${metafield.id}`);
          console.log(`     Namespace: ${metafield.namespace}`);
          console.log(`     Key: ${metafield.key}`);
          console.log(`     Value: ${metafield.value}`);
          console.log(`     Type: ${metafield.type}`);
        });
      } else {
        console.log('   Nenhum metafield');
      }
      
      // Collections (se disponível)
      console.log('\n📚 COLLECTIONS:');
      if (product.collections && product.collections.length > 0) {
        product.collections.forEach((collection, index) => {
          console.log(`   Collection ${index + 1}:`);
          console.log(`     ID: ${collection.id}`);
          console.log(`     Título: ${collection.title}`);
          console.log(`     Handle: ${collection.handle}`);
        });
      } else {
        console.log('   Nenhuma collection associada');
      }
      
      // Análise de categorização
      console.log('\n🎯 ANÁLISE DE CATEGORIZAÇÃO:');
      const text = `${product.title} ${product.product_type} ${product.tags || ''}`.toLowerCase();
      console.log(`   Texto completo: ${text}`);
      
      // Palavras-chave para categorização
      const keywords = {
        'Beleza': ['beleza', 'cosmeticos', 'perfumes', 'higiene', 'cuidados', 'maquiagem', 'shampoo', 'condicionador'],
        'Papelaria': ['papelaria', 'escolar', 'caderno', 'caneta', 'lapis', 'mochila', 'livro', 'material'],
        'Casa': ['casa', 'cozinha', 'limpeza', 'organizacao', 'utilidades', 'utensilios', 'decoracao', 'cama', 'mesa', 'banho'],
        'Brinquedos': ['brinquedos', 'brinquedo', 'jogos', 'bonecos', 'carrinhos', 'infantil', 'puzzles', 'pelucias'],
        'Tecnologia': ['tecnologia', 'eletronicos', 'celular', 'smartphone', 'fone', 'carregador', 'cabo', 'tablet', 'notebook'],
        'Pets': ['pet', 'animais', 'cachorro', 'gato', 'racao', 'coleira', 'brinquedos pet', 'casinha']
      };
      
      console.log('   Palavras-chave encontradas:');
      for (const [category, words] of Object.entries(keywords)) {
        const foundWords = words.filter(word => text.includes(word));
        if (foundWords.length > 0) {
          console.log(`     ${category}: ${foundWords.join(', ')}`);
        }
      }
      
      // Parar após o primeiro produto para análise detalhada
      if (i === 0) {
        console.log('\n🔍 ANÁLISE DETALHADA DO PRIMEIRO PRODUTO:');
        console.log(JSON.stringify(product, null, 2));
      }
    }
    
  } catch (error) {
    console.error('❌ Erro na análise:', error.response?.data || error.message);
  }
}

// Executar análise
analyzeProduct();




