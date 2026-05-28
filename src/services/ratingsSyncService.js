const shopifyService = require('./shopifyService');
const laireviewsService = require('./laireviewsService');
const db = require('../database/connection');
const syncLock = require('./syncLock');

/**
 * Serviço de sincronização automática de ratings do Laireviews
 * Atualiza rating_average e rating_total no banco periodicamente
 * para evitar chamadas à API do Laireviews em tempo real
 */
class RatingsSyncService {
  constructor() {
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncIntervalHours = parseInt(process.env.RATINGS_SYNC_INTERVAL_HOURS || '6'); // Padrão: 6 horas
    this.maxProducts = parseInt(process.env.RATINGS_SYNC_MAX_PRODUCTS || '5000'); // Limite de produtos por sincronização
    this.batchSize = 50; // Processar em lotes de 50 produtos
    this.delayBetweenBatches = 1000; // 1 segundo entre lotes para evitar rate limit
    
    console.log(`✅ [RatingsSync] Configurado para rodar a cada ${this.syncIntervalHours} horas`);
    console.log(`📊 [RatingsSync] Limite máximo de produtos: ${this.maxProducts}`);
  }

  /**
   * Inicia a sincronização automática de ratings
   */
  start() {
    // Não iniciar se já estiver rodando
    if (this.syncInterval) {
      console.log('⚠️ [RatingsSync] Sincronização automática já está rodando');
      return;
    }

    const intervalMs = this.syncIntervalHours * 60 * 60 * 1000;
    console.log(`🔄 [RatingsSync] Iniciando sincronização automática de ratings (intervalo: ${this.syncIntervalHours} horas)`);
    
    // Executar sincronização imediatamente na primeira vez
    this.sync();
    
    // Agendar sincronização periódica
    this.syncInterval = setInterval(() => {
      this.sync();
    }, intervalMs);

    console.log(`✅ [RatingsSync] Sincronização automática iniciada (próxima execução em ${this.syncIntervalHours} horas)`);
  }

  /**
   * Para a sincronização automática
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 [RatingsSync] Sincronização automática parada');
    }
  }

  /**
   * Executa a sincronização de ratings
   */
  async sync() {
    // Evitar execuções simultâneas (local)
    if (this.isSyncing) {
      console.log('⏳ [RatingsSync] Sincronização já em andamento, pulando...');
      return;
    }

    // Verificar lock global (evitar conflito com outros serviços de sync)
    if (!syncLock.tryLock('RatingsSync')) {
      console.log('⏳ [RatingsSync] Outra sincronização em andamento, aguardando próxima execução...');
      return;
    }

    try {
      this.isSyncing = true;
      const startTime = Date.now();
      
      console.log(`🔄 [RatingsSync] Iniciando sincronização de ratings...`);
      
      // Buscar produtos do banco que precisam de atualização de ratings
      // Priorizar produtos sem ratings ou com ratings antigos
      const productsResult = await db.query(`
        SELECT id, codigo, nome, rating_average, rating_total, updated_at
        FROM melhor_casas_products
        WHERE disponivel = true
        ORDER BY 
          CASE 
            WHEN rating_average IS NULL THEN 0
            WHEN rating_total = 0 THEN 1
            ELSE 2
          END,
          updated_at ASC
        LIMIT $1
      `, [this.maxProducts]);

      const products = productsResult.rows;
      console.log(`📦 [RatingsSync] ${products.length} produtos encontrados para atualizar ratings`);

      if (products.length === 0) {
        console.log('✅ [RatingsSync] Nenhum produto precisa de atualização');
        this.lastSyncTime = new Date();
        return;
      }

      let updatedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      // Processar em lotes
      const batches = [];
      for (let i = 0; i < products.length; i += this.batchSize) {
        batches.push(products.slice(i, i + this.batchSize));
      }

      console.log(`📦 [RatingsSync] Processando ${batches.length} lotes de até ${this.batchSize} produtos...`);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const progress = ((batchIndex + 1) / batches.length * 100).toFixed(1);

        console.log(`📦 [RatingsSync] [${progress}%] Processando lote ${batchIndex + 1}/${batches.length} (${batch.length} produtos)...`);

        // Processar produtos do lote em paralelo (mas com rate limiting do Laireviews)
        const batchPromises = batch.map(async (product) => {
          try {
            // Buscar product_id do Shopify (variant_id → product_id)
            let shopifyProductId = null;
            
            try {
              // Tentar buscar via variant
              const variantResponse = await shopifyService.client.get(`/variants/${product.codigo}.json`);
              if (variantResponse.data?.variant?.product_id) {
                shopifyProductId = variantResponse.data.variant.product_id.toString();
              }
            } catch (variantError) {
              // Se falhar, usar código diretamente (pode ser que já seja product_id)
              shopifyProductId = product.codigo.toString();
            }

            if (!shopifyProductId) {
              console.log(`⚠️ [RatingsSync] Não foi possível obter product_id para produto ${product.codigo}`);
              skippedCount++;
              return;
            }

            // Buscar ratings do Laireviews
            const reviewStats = await laireviewsService.getReviewStats(shopifyProductId);

            if (reviewStats && reviewStats.total > 0) {
              // Atualizar ratings no banco
              await db.query(`
                UPDATE melhor_casas_products
                SET rating_average = $1,
                    rating_total = $2,
                    updated_at = NOW()
                WHERE id = $3
              `, [
                reviewStats.average || 0,
                reviewStats.total || 0,
                product.id
              ]);

              updatedCount++;
              console.log(`✅ [RatingsSync] Produto ${product.nome}: ${reviewStats.average} estrelas (${reviewStats.total} avaliações)`);
            } else {
              // Se não tem reviews, manter ou definir como 0
              if (product.rating_average === null || product.rating_total === null) {
                await db.query(`
                  UPDATE melhor_casas_products
                  SET rating_average = 0,
                      rating_total = 0,
                      updated_at = NOW()
                  WHERE id = $1
                `, [product.id]);
                updatedCount++;
              }
              skippedCount++;
            }
          } catch (error) {
            console.error(`❌ [RatingsSync] Erro ao processar produto ${product.codigo} (${product.nome}):`, error.message);
            errorCount++;
          }
        });

        // Aguardar lote completo (com rate limiting do Laireviews já implementado)
        await Promise.all(batchPromises);

        // Delay entre lotes para evitar sobrecarga
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.lastSyncTime = new Date();

      console.log(`✅ [RatingsSync] Sincronização concluída em ${duration}s`);
      console.log(`📊 [RatingsSync] Estatísticas:`);
      console.log(`   - Produtos atualizados: ${updatedCount}`);
      console.log(`   - Produtos sem reviews: ${skippedCount}`);
      console.log(`   - Erros: ${errorCount}`);
      
    } catch (error) {
      console.error('❌ [RatingsSync] Erro na sincronização automática:', error);
      console.error('❌ [RatingsSync] Stack:', error.stack);
    } finally {
      this.isSyncing = false;
      syncLock.release('RatingsSync');
    }
  }

  /**
   * Retorna o status da sincronização automática
   */
  getStatus() {
    return {
      isRunning: !!this.syncInterval,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      syncIntervalHours: this.syncIntervalHours,
      nextSyncTime: this.lastSyncTime 
        ? new Date(this.lastSyncTime.getTime() + this.syncIntervalHours * 60 * 60 * 1000)
        : null
    };
  }

  /**
   * Força uma sincronização imediata (ignora o intervalo)
   */
  async forceSync() {
    console.log('🚀 [RatingsSync] Forçando sincronização imediata...');
    await this.sync();
  }
}

// Singleton
const ratingsSyncService = new RatingsSyncService();

module.exports = ratingsSyncService;
