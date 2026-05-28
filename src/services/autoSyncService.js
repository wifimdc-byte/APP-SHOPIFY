const shopifyService = require('./shopifyService');
const db = require('../database/connection');
const syncLock = require('./syncLock');

/**
 * Serviço de sincronização automática de produtos do Shopify
 * Sincroniza produtos automaticamente em intervalos configuráveis
 */
class AutoSyncService {
  constructor() {
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncIntervalMinutes = parseInt(process.env.AUTO_SYNC_INTERVAL_MINUTES || '60'); // Padrão: 1 hora
    this.collectionId = process.env.AUTO_SYNC_COLLECTION_ID || null; // ID da coleção para sincronizar
    this.filterByTag = process.env.AUTO_SYNC_FILTER_TAG || 'APP'; // Tag padrão: APP (pode ser sobrescrito)
    // Limite máximo de produtos (padrão: 20000)
    // Pode ser sobrescrito pela variável de ambiente AUTO_SYNC_MAX_PRODUCTS
    const envMaxProducts = process.env.AUTO_SYNC_MAX_PRODUCTS;
    this.maxProducts = parseInt(envMaxProducts || '20000');
    
    // Log da configuração ao iniciar
    if (this.collectionId) {
      console.log(`✅ [AutoSync] Configurado para sincronizar coleção: ${this.collectionId}`);
      console.log(`⚠️ [AutoSync] Filtro por tag IGNORADO - sincronizando TODOS os produtos`);
      if (envMaxProducts) {
        console.log(`📊 [AutoSync] Limite máximo de produtos: ${this.maxProducts} (definido via AUTO_SYNC_MAX_PRODUCTS=${envMaxProducts})`);
      } else {
        console.log(`📊 [AutoSync] Limite máximo de produtos: ${this.maxProducts} (padrão)`);
      }
    } else {
      console.log(`⚠️ [AutoSync] AUTO_SYNC_COLLECTION_ID não configurado - sincronizará TODOS os produtos`);
      console.log(`💡 Para sincronizar apenas uma coleção, configure AUTO_SYNC_COLLECTION_ID=493837648177`);
      if (envMaxProducts) {
        console.log(`📊 [AutoSync] Limite máximo de produtos: ${this.maxProducts} (definido via AUTO_SYNC_MAX_PRODUCTS=${envMaxProducts})`);
      } else {
        console.log(`📊 [AutoSync] Limite máximo de produtos: ${this.maxProducts} (padrão)`);
      }
    }
    
    // Aviso se o limite estiver muito baixo
    if (this.maxProducts < 10000) {
      console.log(`⚠️ [AutoSync] Limite de ${this.maxProducts} produtos pode ser muito baixo. Considere aumentar para 20000 ou mais.`);
    }
  }

  /**
   * Inicia a sincronização automática
   */
  start() {
    // Não iniciar se já estiver rodando
    if (this.syncInterval) {
      console.log('⚠️ [AutoSync] Sincronização automática já está rodando');
      return;
    }

    console.log(`🔄 [AutoSync] Iniciando sincronização automática (intervalo: ${this.syncIntervalMinutes} minutos)`);
    
    // Executar sincronização imediatamente na primeira vez
    this.sync();
    
    // Agendar sincronização periódica
    this.syncInterval = setInterval(() => {
      this.sync();
    }, this.syncIntervalMinutes * 60 * 1000);

    console.log(`✅ [AutoSync] Sincronização automática iniciada (próxima execução em ${this.syncIntervalMinutes} minutos)`);
  }

  /**
   * Para a sincronização automática
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 [AutoSync] Sincronização automática parada');
    }
  }

  /**
   * Executa a sincronização
   */
  async sync() {
    // Evitar execuções simultâneas (local)
    if (this.isSyncing) {
      console.log('⏳ [AutoSync] Sincronização já em andamento, pulando...');
      return;
    }

    // Verificar lock global (evitar conflito com outros serviços de sync)
    if (!syncLock.tryLock('AutoSync')) {
      console.log('⏳ [AutoSync] Outra sincronização em andamento, aguardando próxima execução...');
      return;
    }

    try {
      this.isSyncing = true;
      const startTime = Date.now();
      
      if (this.collectionId) {
        console.log(`🔄 [AutoSync] Iniciando sincronização automática da coleção ${this.collectionId}...`);
      } else {
        console.log('⚠️ [AutoSync] AUTO_SYNC_COLLECTION_ID não configurado!');
        console.log('🔄 [AutoSync] Iniciando sincronização de TODOS os produtos (pode ser lento)...');
        console.log(`💡 Configure AUTO_SYNC_COLLECTION_ID=493837648177 para sincronizar apenas a coleção específica`);
      }
      
      console.log(`📋 [AutoSync] Collection ID que será usado: ${this.collectionId || 'NENHUMA (todos os produtos)'}`);
      console.log(`⚠️ [AutoSync] Filtro por tag IGNORADO - sincronizando TODOS os produtos da collection`);
      
      // SEMPRE usar sincronização tradicional (REST) para collections
      // Bulk operations é gerenciado por um serviço separado (bulkSyncService)
      console.log('🔄 [AutoSync] Usando sincronização tradicional para collection...');
      
      // SEMPRE sincronizar TODOS os produtos da collection, ignorando filterByTag
      const syncOptions = {
        maxProducts: this.maxProducts
        // filterByTag NÃO é passado - todos os produtos serão sincronizados
      };
      
      // Passar opções para syncAllProducts (sem filterByTag)
      const result = await shopifyService.syncAllProducts(db, this.collectionId, syncOptions);
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      this.lastSyncTime = new Date();
      
      console.log(`✅ [AutoSync] Sincronização concluída em ${duration}s - ${result.total} produtos, ${result.synced} novos, ${result.updated} atualizados`);
      
    } catch (error) {
      console.error('❌ [AutoSync] Erro na sincronização automática:', error);
      console.error('❌ [AutoSync] Stack:', error.stack);
    } finally {
      this.isSyncing = false;
      syncLock.release('AutoSync');
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
      syncIntervalMinutes: this.syncIntervalMinutes,
      collectionId: this.collectionId,
      nextSyncTime: this.lastSyncTime 
        ? new Date(this.lastSyncTime.getTime() + this.syncIntervalMinutes * 60 * 1000)
        : null
    };
  }

  /**
   * Força uma sincronização imediata (ignora o intervalo)
   */
  async forceSync() {
    console.log('🚀 [AutoSync] Forçando sincronização imediata...');
    await this.sync();
  }
}

// Singleton
const autoSyncService = new AutoSyncService();

module.exports = autoSyncService;

