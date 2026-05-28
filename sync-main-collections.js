const shopifyService = require('./src/services/shopifyService');
const { Pool } = require('pg');
require('dotenv').config();

// IDs das coleções principais (featured e secondary)
const MAIN_COLLECTIONS = {
  featured: 501821276465,  // Black Aniversário
  secondary: 522590126385  // Ofertas
};

// Configuração do banco de dados
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function syncMainCollections() {
  try {
    console.log('🔄 Iniciando sincronização das coleções principais...');
    console.log(`📋 Coleções: Featured (${MAIN_COLLECTIONS.featured}), Secondary (${MAIN_COLLECTIONS.secondary})`);
    
    let totalSynced = 0;
    let totalUpdated = 0;
    const stats = {
      featured: { synced: 0, updated: 0, total: 0 },
      secondary: { synced: 0, updated: 0, total: 0 }
    };

    // Sincronizar cada coleção principal
    for (const [collectionName, collectionId] of Object.entries(MAIN_COLLECTIONS)) {
      console.log(`\n📦 Sincronizando coleção: ${collectionName} (ID: ${collectionId})...`);
      
      try {
        // Buscar TODOS os produtos da coleção (sem limite)
        const collectionProducts = await shopifyService.getProductsByCollection(collectionId);
        stats[collectionName].total = collectionProducts.length;
        
        console.log(`✅ ${collectionProducts.length} produtos encontrados na coleção ${collectionName}`);
        
        if (collectionProducts.length === 0) {
          console.log(`⚠️  Nenhum produto encontrado na coleção ${collectionName}`);
          continue;
        }

        // Processar em lotes
        const batchSize = 50;
        const batches = [];
        
        for (let i = 0; i < collectionProducts.length; i += batchSize) {
          batches.push(collectionProducts.slice(i, i + batchSize));
        }
        
        console.log(`📦 Processando ${batches.length} lotes de até ${batchSize} produtos...`);
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          const progress = ((batchIndex + 1) / batches.length * 100).toFixed(1);
          console.log(`🔄 [${progress}%] Processando lote ${batchIndex + 1}/${batches.length} (${batch.length} produtos)...`);
          
          // Buscar códigos existentes do lote
          const codigos = batch.map(p => p.id.toString());
          const existingProducts = await pool.query(
            'SELECT codigo FROM melhor_casas_products WHERE codigo = ANY($1)',
            [codigos]
          );
          const existingCodigos = new Set(existingProducts.rows.map(r => r.codigo));
          
          const toInsert = [];
          const toUpdate = [];
          
          for (const shopifyProduct of batch) {
            try {
              // Verificar se o produto tem variantes antes de mapear
              if (!shopifyProduct.variants || shopifyProduct.variants.length === 0) {
                console.warn(`⚠️ Produto ${shopifyProduct.id} não tem variantes, pulando...`);
                continue;
              }
              
              const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
              
              if (existingCodigos.has(mappedProduct.codigo)) {
                toUpdate.push(mappedProduct);
              } else {
                toInsert.push(mappedProduct);
              }
            } catch (error) {
              console.error(`❌ Erro ao processar produto ${shopifyProduct.id}:`, error.message);
              continue;
            }
          }
          
          // Inserir novos produtos em batch
          if (toInsert.length > 0) {
            const insertBatchSize = 20;
            for (let i = 0; i < toInsert.length; i += insertBatchSize) {
              const insertBatch = toInsert.slice(i, i + insertBatchSize);
              const values = insertBatch.map((p, idx) => {
                const baseIdx = idx * 13;
                return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13})`;
              }).join(', ');
              
              const params = insertBatch.flatMap(p => [
                p.codigo,
                p.nome,
                p.categoria,
                p.preco_varejo,
                p.preco_atacado,
                p.preco_exclusivo,
                p.descricao,
                p.imagem_url,
                p.estoque,
                p.disponivel,
                JSON.stringify(p.tags),
                p.created_at,
                p.updated_at
              ]);
              
              await pool.query(`
                INSERT INTO melhor_casas_products 
                (codigo, nome, categoria, preco_varejo, preco_atacado, 
                 preco_exclusivo, descricao, imagem_url, estoque, 
                 disponivel, tags, created_at, updated_at)
                VALUES ${values}
                ON CONFLICT (codigo) DO NOTHING
              `, params);
            }
            stats[collectionName].synced += toInsert.length;
            totalSynced += toInsert.length;
          }
          
          // Atualizar produtos existentes
          for (const mappedProduct of toUpdate) {
            await pool.query(`
              UPDATE melhor_casas_products 
              SET nome = $1, categoria = $2, preco_varejo = $3, 
                  preco_atacado = $4, preco_exclusivo = $5, 
                  descricao = $6, imagem_url = $7, estoque = $8, 
                  disponivel = $9, tags = $10, updated_at = $11
              WHERE codigo = $12
            `, [
              mappedProduct.nome,
              mappedProduct.categoria,
              mappedProduct.preco_varejo,
              mappedProduct.preco_atacado,
              mappedProduct.preco_exclusivo,
              mappedProduct.descricao,
              mappedProduct.imagem_url,
              mappedProduct.estoque,
              mappedProduct.disponivel,
              JSON.stringify(mappedProduct.tags),
              mappedProduct.updated_at,
              mappedProduct.codigo
            ]);
          }
          stats[collectionName].updated += toUpdate.length;
          totalUpdated += toUpdate.length;
          
          console.log(`✅ Lote ${batchIndex + 1} concluído: +${toInsert.length} novos, ~${toUpdate.length} atualizados`);
        }
        
        console.log(`✅ Coleção ${collectionName} sincronizada!`);
        console.log(`   📊 Total: ${stats[collectionName].total} produtos`);
        console.log(`   ➕ Novos: ${stats[collectionName].synced}`);
        console.log(`   🔄 Atualizados: ${stats[collectionName].updated}`);
        
      } catch (error) {
        console.error(`❌ Erro ao sincronizar coleção ${collectionName}:`, error.message);
        console.error(error.stack);
      }
    }
    
    // Verificar total de produtos no banco
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM melhor_casas_products WHERE disponivel = true');
    const totalInDb = parseInt(totalResult.rows[0].total);
    
    console.log(`\n🎉 Sincronização concluída!`);
    console.log(`📊 Estatísticas:`);
    console.log(`   Featured Collection: ${stats.featured.total} produtos (${stats.featured.synced} novos, ${stats.featured.updated} atualizados)`);
    console.log(`   Secondary Collection: ${stats.secondary.total} produtos (${stats.secondary.synced} novos, ${stats.secondary.updated} atualizados)`);
    console.log(`   Total sincronizado: ${totalSynced} novos, ${totalUpdated} atualizados`);
    console.log(`   Total de produtos no banco: ${totalInDb}`);
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Executar sincronização
syncMainCollections();

