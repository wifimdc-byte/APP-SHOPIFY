const shopifyService = require('./src/services/shopifyService');
const pool = require('./src/database/connection');

async function syncAllProductsImages() {
  try {
    console.log('🔄 Iniciando sincronização de imagens para TODOS os produtos...\n');
    
    // Buscar todos os produtos do banco
    const result = await pool.query(`
      SELECT id, codigo, nome 
      FROM melhor_casas_products 
      ORDER BY id
    `);
    
    const products = result.rows;
    const total = products.length;
    
    console.log(`📦 Encontrados ${total} produtos no banco de dados\n`);
    
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // Processar cada produto
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const progress = ((i + 1) / total * 100).toFixed(1);
      
      console.log(`[${progress}%] (${i + 1}/${total}) Processando: ${product.nome} (${product.codigo})...`);
      
      try {
        // Buscar produto do Shopify
        const shopifyProduct = await shopifyService.getProduct(product.codigo);
        
        if (!shopifyProduct) {
          console.log(`   ⚠️ Produto não encontrado no Shopify, pulando...\n`);
          skippedCount++;
          continue;
        }
        
        // Mapear produto
        const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
        
        if (!mappedProduct || !mappedProduct.imagens) {
          console.log(`   ⚠️ Erro ao mapear produto, pulando...\n`);
          skippedCount++;
          continue;
        }
        
        const imagensCount = mappedProduct.imagens.length;
        
        // Atualizar no banco
        const updateResult = await pool.query(`
          UPDATE melhor_casas_products 
          SET imagens = $1::jsonb, imagem_url = $2, updated_at = $3
          WHERE codigo = $4
          RETURNING id
        `, [
          JSON.stringify(mappedProduct.imagens || []),
          mappedProduct.imagem_url,
          new Date(),
          mappedProduct.codigo
        ]);
        
        if (updateResult.rows.length > 0) {
          console.log(`   ✅ Atualizado com ${imagensCount} imagem${imagensCount !== 1 ? 'ns' : ''}\n`);
          successCount++;
        } else {
          console.log(`   ⚠️ Produto não encontrado no banco para atualizar\n`);
          skippedCount++;
        }
        
        // Pequeno delay para não sobrecarregar a API do Shopify
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`   ❌ Erro ao processar produto ${product.codigo}:`, error.message);
        errorCount++;
        console.log('');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA SINCRONIZAÇÃO:');
    console.log('='.repeat(60));
    console.log(`✅ Sucesso: ${successCount} produtos`);
    console.log(`❌ Erros: ${errorCount} produtos`);
    console.log(`⚠️ Pulados: ${skippedCount} produtos`);
    console.log(`📦 Total processado: ${total} produtos`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Executar
syncAllProductsImages();







