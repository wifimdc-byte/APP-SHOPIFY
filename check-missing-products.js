const shopifyService = require('./src/services/shopifyService');
const db = require('./src/database/connection');

// IDs do Shopify que não foram adicionados
const missingProductIds = [
  '10477049250097',
  '10477049184561',
  '10477049151793'
];

async function checkMissingProducts() {
  try {
    console.log('🔍 Verificando produtos que não foram adicionados...\n');
    
    for (const productId of missingProductIds) {
      console.log(`\n📦 Verificando produto ID: ${productId}`);
      
      // 1. Verificar se está no banco
      const dbResult = await db.query(
        'SELECT codigo, nome FROM melhor_casas_products WHERE codigo = $1',
        [productId]
      );
      
      if (dbResult.rows.length > 0) {
        console.log(`   ✅ JÁ ESTÁ NO BANCO: ${dbResult.rows[0].nome}`);
        continue;
      }
      
      console.log(`   ❌ NÃO ESTÁ NO BANCO`);
      
      // 2. Tentar buscar do Shopify
      try {
        const shopifyProduct = await shopifyService.getProduct(productId);
        
        if (!shopifyProduct) {
          console.log(`   ❌ Produto não encontrado no Shopify`);
          continue;
        }
        
        console.log(`   ✅ Encontrado no Shopify: ${shopifyProduct.title}`);
        console.log(`   📊 Variantes: ${shopifyProduct.variants?.length || 0}`);
        console.log(`   🏷️ Status: ${shopifyProduct.status}`);
        console.log(`   🏷️ Tags: ${shopifyProduct.tags || 'N/A'}`);
        
        // 3. Verificar se pode ser mapeado
        const mappedProduct = shopifyService.mapProductToApp(shopifyProduct, null);
        
        if (!mappedProduct) {
          console.log(`   ❌ NÃO PODE SER MAPEADO (provavelmente sem variantes)`);
          continue;
        }
        
        console.log(`   ✅ PODE SER MAPEADO`);
        console.log(`   📝 Código gerado: ${mappedProduct.codigo}`);
        console.log(`   📝 Nome: ${mappedProduct.nome}`);
        console.log(`   💰 Preço: R$ ${mappedProduct.preco_varejo}`);
        
        // 4. Tentar inserir manualmente
        try {
          await db.query(`
            INSERT INTO melhor_casas_products 
            (codigo, nome, categoria, preco_varejo, preco_atacado, 
             preco_exclusivo, descricao, imagem_url, imagens, estoque, 
             disponivel, tags, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (codigo) DO NOTHING
          `, [
            mappedProduct.codigo,
            mappedProduct.nome,
            mappedProduct.categoria,
            mappedProduct.preco_varejo,
            mappedProduct.preco_atacado,
            mappedProduct.preco_exclusivo,
            mappedProduct.descricao,
            mappedProduct.imagem_url,
            JSON.stringify(mappedProduct.imagens || []),
            mappedProduct.estoque,
            mappedProduct.disponivel,
            JSON.stringify(mappedProduct.tags),
            mappedProduct.created_at,
            mappedProduct.updated_at
          ]);
          
          console.log(`   ✅ PRODUTO INSERIDO COM SUCESSO!`);
        } catch (insertError) {
          console.log(`   ❌ Erro ao inserir: ${insertError.message}`);
        }
        
      } catch (shopifyError) {
        console.log(`   ❌ Erro ao buscar do Shopify: ${shopifyError.message}`);
      }
    }
    
    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro geral:', error);
    process.exit(1);
  }
}

checkMissingProducts();
