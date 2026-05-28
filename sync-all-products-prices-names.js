const shopifyService = require('./src/services/shopifyService');
const pool = require('./src/database/connection');

async function syncAllProductsPricesAndNames() {
  try {
    console.log('🔄 Iniciando sincronização de nomes e preços para TODOS os produtos...\n');
    
    // Buscar todos os produtos do banco
    const result = await pool.query(`
      SELECT id, codigo, nome, preco_varejo, preco_atacado, preco_exclusivo
      FROM melhor_casas_products 
      ORDER BY id
    `);
    
    const products = result.rows;
    const total = products.length;
    
    console.log(`📦 Encontrados ${total} produtos no banco de dados\n`);
    
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    
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
        
        if (!mappedProduct) {
          console.log(`   ⚠️ Erro ao mapear produto, pulando...\n`);
          skippedCount++;
          continue;
        }
        
        // Verificar se houve mudanças
        const nomeMudou = mappedProduct.nome !== product.nome;
        const precoVarejoMudou = parseFloat(mappedProduct.preco_varejo) !== parseFloat(product.preco_varejo);
        const precoAtacadoMudou = parseFloat(mappedProduct.preco_atacado) !== parseFloat(product.preco_atacado);
        const precoExclusivoMudou = parseFloat(mappedProduct.preco_exclusivo) !== parseFloat(product.preco_exclusivo);
        
        const temMudancas = nomeMudou || precoVarejoMudou || precoAtacadoMudou || precoExclusivoMudou;
        
        if (!temMudancas) {
          console.log(`   ✓ Sem mudanças\n`);
          unchangedCount++;
          successCount++;
          // Pequeno delay mesmo sem mudanças
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // Atualizar no banco
        const updateResult = await pool.query(`
          UPDATE melhor_casas_products 
          SET nome = $1, 
              preco_varejo = $2, 
              preco_atacado = $3, 
              preco_exclusivo = $4, 
              updated_at = $5
          WHERE codigo = $6
          RETURNING id
        `, [
          mappedProduct.nome,
          mappedProduct.preco_varejo,
          mappedProduct.preco_atacado,
          mappedProduct.preco_exclusivo,
          new Date(),
          mappedProduct.codigo
        ]);
        
        if (updateResult.rows.length > 0) {
          const mudancas = [];
          if (nomeMudou) mudancas.push(`nome: "${product.nome}" → "${mappedProduct.nome}"`);
          if (precoVarejoMudou) mudancas.push(`preço varejo: ${product.preco_varejo} → ${mappedProduct.preco_varejo}`);
          if (precoAtacadoMudou) mudancas.push(`preço atacado: ${product.preco_atacado} → ${mappedProduct.preco_atacado}`);
          if (precoExclusivoMudou) mudancas.push(`preço exclusivo: ${product.preco_exclusivo} → ${mappedProduct.preco_exclusivo}`);
          
          console.log(`   ✅ Atualizado: ${mudancas.join(', ')}\n`);
          updatedCount++;
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
    console.log(`🔄 Atualizados: ${updatedCount} produtos`);
    console.log(`✓ Sem mudanças: ${unchangedCount} produtos`);
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
syncAllProductsPricesAndNames();







