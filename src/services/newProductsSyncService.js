const shopifyService = require('./shopifyService');
const db = require('../database/connection');
const syncLock = require('./syncLock');

/**
 * Serviço de sincronização de NOVOS produtos apenas
 * Busca produtos do Shopify e adiciona apenas os que ainda não existem no banco
 * Roda a cada 30 minutos
 */
class NewProductsSyncService {
  constructor() {
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncIntervalMinutes = 30; // 30 minutos
    this.collectionId = process.env.NEW_PRODUCTS_SYNC_COLLECTION_ID || null; // ID da coleção (opcional)
    this.filterByTag = process.env.NEW_PRODUCTS_SYNC_FILTER_TAG || null; // Tag para filtrar (opcional)
    this.maxProducts = parseInt(process.env.NEW_PRODUCTS_SYNC_MAX_PRODUCTS || '10000'); // Limite máximo aumentado para 10000
    
    console.log(`✅ [NewProductsSync] Configurado para rodar a cada ${this.syncIntervalMinutes} minutos`);
    if (this.collectionId) {
      console.log(`📋 [NewProductsSync] Buscando produtos da coleção: ${this.collectionId}`);
    } else {
      console.log(`📋 [NewProductsSync] Buscando TODOS os produtos (sem filtro de coleção)`);
    }
    if (this.filterByTag) {
      console.log(`🏷️ [NewProductsSync] Filtrando por tag: ${this.filterByTag}`);
    }
    console.log(`📊 [NewProductsSync] Limite máximo de produtos: ${this.maxProducts}`);
  }

  /**
   * Inicia a sincronização automática de novos produtos
   */
  start() {
    // Não iniciar se já estiver rodando
    if (this.syncInterval) {
      console.log('⚠️ [NewProductsSync] Sincronização já está rodando');
      return;
    }

    console.log(`🔄 [NewProductsSync] Iniciando sincronização automática de novos produtos (intervalo: ${this.syncIntervalMinutes} minutos)`);
    
    // Executar sincronização imediatamente na primeira vez
    this.sync();
    
    // Agendar sincronização periódica
    this.syncInterval = setInterval(() => {
      this.sync();
    }, this.syncIntervalMinutes * 60 * 1000);

    console.log(`✅ [NewProductsSync] Sincronização automática iniciada (próxima execução em ${this.syncIntervalMinutes} minutos)`);
  }

  /**
   * Para a sincronização automática
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 [NewProductsSync] Sincronização automática parada');
    }
  }

  /**
   * Executa a sincronização de novos produtos apenas
   */
  async sync() {
    // Evitar execuções simultâneas (local)
    if (this.isSyncing) {
      console.log('⏳ [NewProductsSync] Sincronização já em andamento, pulando...');
      return;
    }

    // Verificar lock global (evitar conflito com outros serviços de sync)
    if (!syncLock.tryLock('NewProductsSync')) {
      console.log('⏳ [NewProductsSync] Outra sincronização em andamento, aguardando próxima execução...');
      return;
    }

    try {
      this.isSyncing = true;
      const startTime = Date.now();
      
      console.log(`🔄 [NewProductsSync] Iniciando busca de novos produtos...`);
      
      let shopifyProducts;
      
      // Buscar produtos do Shopify
      if (this.collectionId) {
        shopifyProducts = await shopifyService.getProductsByCollection(this.collectionId, {
          filterByTag: this.filterByTag,
          maxProducts: this.maxProducts
        });
      } else {
        // Buscar todos os produtos (sem limite, ou limitado pelo maxProducts se muito grande)
        console.log(`🔄 [NewProductsSync] Buscando TODOS os produtos do Shopify (sem filtro de coleção)...`);
        shopifyProducts = await shopifyService.getAllProductsDirect();
        console.log(`📦 [NewProductsSync] ${shopifyProducts.length} produtos retornados pela API`);
        
        // Aplicar limite apenas se necessário (para evitar sobrecarga)
        if (shopifyProducts.length > this.maxProducts) {
          console.log(`⚠️ [NewProductsSync] Limite de ${this.maxProducts} produtos atingido. Processando apenas os primeiros ${this.maxProducts}.`);
          shopifyProducts = shopifyProducts.slice(0, this.maxProducts);
        }
      }
      
      console.log(`📦 [NewProductsSync] ${shopifyProducts.length} produtos encontrados no Shopify`);
      
      // Buscar todos os códigos existentes no banco de uma vez
      const allExistingProducts = await db.query(
        'SELECT codigo FROM melhor_casas_products'
      );
      // Garantir que todos os códigos sejam strings para comparação correta
      const existingCodigos = new Set(allExistingProducts.rows.map(r => String(r.codigo)));
      
      console.log(`📊 [NewProductsSync] ${existingCodigos.size} produtos já existem no banco`);
      
      // Filtrar apenas produtos novos
      const newProducts = [];
      let skippedNoVariants = 0;
      let skippedAlreadyExists = 0;
      
      for (const shopifyProduct of shopifyProducts) {
        const mappedProduct = shopifyService.mapProductToApp(shopifyProduct, null);
        
        if (!mappedProduct) {
          skippedNoVariants++;
          console.log(`⚠️ [NewProductsSync] Produto ${shopifyProduct.id} (${shopifyProduct.title}) pulado: sem variantes`);
          continue;
        }
        
        // Garantir que codigo seja string para comparação
        const codigoStr = String(mappedProduct.codigo);
        
        // Se o produto não existe no banco, adicionar à lista de novos
        if (!existingCodigos.has(codigoStr)) {
          newProducts.push(mappedProduct);
        } else {
          skippedAlreadyExists++;
        }
      }
      
      if (skippedNoVariants > 0) {
        console.log(`⚠️ [NewProductsSync] ${skippedNoVariants} produtos pulados por não terem variantes`);
      }
      if (skippedAlreadyExists > 0) {
        console.log(`ℹ️ [NewProductsSync] ${skippedAlreadyExists} produtos já existem no banco`);
      }
      
      console.log(`🆕 [NewProductsSync] ${newProducts.length} produtos novos encontrados`);
      
      if (newProducts.length === 0) {
        console.log(`✅ [NewProductsSync] Nenhum produto novo para adicionar`);
        this.lastSyncTime = new Date();
        return;
      }
      
      // Inserir novos produtos em batch
      const batchSize = 20;
      let insertedCount = 0;
      
      for (let i = 0; i < newProducts.length; i += batchSize) {
        const batch = newProducts.slice(i, i + batchSize);
        const progress = ((i + batch.length) / newProducts.length * 100).toFixed(1);
        console.log(`🔄 [NewProductsSync] [${progress}%] Inserindo lote de ${batch.length} produtos novos...`);
        
        const values = batch.map((p, idx) => {
          const baseIdx = idx * 14;
          return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13}, $${baseIdx + 14})`;
        }).join(', ');
        
        const params = batch.flatMap(p => [
          p.codigo,
          p.nome,
          p.categoria,
          p.preco_varejo,
          p.preco_atacado,
          p.preco_exclusivo,
          p.descricao,
          p.imagem_url,
          JSON.stringify(p.imagens || []),
          p.estoque,
          p.disponivel,
          JSON.stringify(p.tags),
          p.created_at,
          p.updated_at
        ]);
        
        try {
          const result = await db.query(`
            INSERT INTO melhor_casas_products 
            (codigo, nome, categoria, preco_varejo, preco_atacado, 
             preco_exclusivo, descricao, imagem_url, imagens, estoque, 
             disponivel, tags, created_at, updated_at)
            VALUES ${values}
            ON CONFLICT (codigo) DO NOTHING
          `, params);
          
          insertedCount += batch.length;
          console.log(`✅ [NewProductsSync] Lote inserido: ${batch.length} produtos novos`);
        } catch (error) {
          console.error(`❌ [NewProductsSync] Erro ao inserir lote:`, error.message);
          // Continuar com próximo lote mesmo se houver erro
        }
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      this.lastSyncTime = new Date();
      
      console.log(`✅ [NewProductsSync] Sincronização concluída em ${duration}s`);
      console.log(`📊 [NewProductsSync] ${insertedCount} produtos novos adicionados ao banco`);
      
    } catch (error) {
      console.error('❌ [NewProductsSync] Erro na sincronização:', error);
      console.error('❌ [NewProductsSync] Stack:', error.stack);
    } finally {
      this.isSyncing = false;
      syncLock.release('NewProductsSync');
    }
  }

  /**
   * Retorna o status da sincronização
   */
  getStatus() {
    return {
      isRunning: !!this.syncInterval,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      syncIntervalMinutes: this.syncIntervalMinutes,
      collectionId: this.collectionId,
      nextSyncTime: this.lastSyncTime 
        ? new Date(this.lastSyncTime.getTime() + this.syncIntervalMinutes * 60 * 1000)
        : null
    };
  }

  /**
   * Força uma sincronização imediata
   */
  async forceSync() {
    console.log('🚀 [NewProductsSync] Forçando sincronização imediata...');
    await this.sync();
  }
}

// Singleton
const newProductsSyncService = new NewProductsSyncService();

module.exports = newProductsSyncService;
