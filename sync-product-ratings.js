const db = require('./src/database/connection');
const shopifyService = require('./src/services/shopifyService');

// ID da coleção Black Aniversário
const COLLECTION_ID = 501821276465;

async function syncProductRatings() {
  try {
    console.log('🔄 Iniciando sincronização de ratings...');
    console.log(`📦 Coleção: Black Aniversário (${COLLECTION_ID})`);

    // Primeiro, buscar os IDs dos produtos da coleção no Shopify
    console.log('\n🔍 Buscando produtos da coleção no Shopify...');
    const productIds = await shopifyService.getCollectionProductIds(COLLECTION_ID);
    console.log(`✅ Encontrados ${productIds.length} produtos na coleção`);

    if (productIds.length === 0) {
      console.log('⚠️ Nenhum produto encontrado na coleção');
      process.exit(0);
    }

    // Buscar os produtos no banco de dados que estão na coleção
    const result = await db.query(`
      SELECT id, codigo, nome 
      FROM melhor_casas_products 
      WHERE codigo = ANY($1::text[])
        AND disponivel = true
        AND (rating_average IS NULL OR rating_average = 0)
      ORDER BY id
    `, [productIds]);

    const products = result.rows;
    console.log(`📦 Encontrados ${products.length} produtos para atualizar ratings`);

    if (products.length === 0) {
      console.log('✅ Nenhum produto precisa de atualização de ratings');
      process.exit(0);
    }

    let updatedCount = 0;
    let errorCount = 0;

    // Processar cada produto
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const progress = ((i + 1) / products.length * 100).toFixed(1);
      
      console.log(`\n[${progress}%] Processando ${i + 1}/${products.length}: ${product.nome}`);

      try {
        // Buscar ratings do produto
        const ratings = await shopifyService.getProductRatings(product.codigo);

        if (ratings && ratings.average > 0) {
          // Atualizar ratings no banco de dados
          await db.query(`
            UPDATE melhor_casas_products 
            SET rating_average = $1, rating_total = $2, updated_at = NOW()
            WHERE id = $3
          `, [ratings.average, ratings.total, product.id]);

          console.log(`✅ Ratings atualizados: ${ratings.average} estrelas (${ratings.total} avaliações)`);
          updatedCount++;
        } else {
          console.log(`⚠️ Nenhum rating encontrado para este produto`);
        }

        // Delay entre requisições para evitar rate limit (2 segundos)
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Erro ao processar produto ${product.nome}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Sincronização concluída!`);
    console.log(`📊 Produtos atualizados: ${updatedCount}`);
    console.log(`❌ Erros: ${errorCount}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro na sincronização de ratings:', error);
    process.exit(1);
  }
}

// Executar sincronização
syncProductRatings();

