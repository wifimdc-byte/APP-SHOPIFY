const shopifyService = require('./shopifyService');
const db = require('../database/connection');
const syncLock = require('./syncLock');

/**
 * Serviço de sincronização automática usando Bulk Operations
 * Sincroniza TODOS os produtos da loja usando bulk operations (muito mais rápido)
 * Roda em intervalo separado da sincronização de collection
 */
class BulkSyncService {
  constructor() {
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncIntervalHours = parseInt(process.env.BULK_SYNC_INTERVAL_HOURS || '3'); // Padrão: 3 horas
    
    console.log(`✅ [BulkSync] Configurado para rodar a cada ${this.syncIntervalHours} horas`);
    console.log(`📊 [BulkSync] Sincronizará TODOS os produtos da loja usando Bulk Operations`);
  }

  /**
   * Inicia a sincronização automática
   */
  start() {
    // Não iniciar se já estiver rodando
    if (this.syncInterval) {
      console.log('⚠️ [BulkSync] Sincronização automática já está rodando');
      return;
    }

    const intervalMs = this.syncIntervalHours * 60 * 60 * 1000;
    console.log(`🔄 [BulkSync] Iniciando sincronização automática (intervalo: ${this.syncIntervalHours} horas)`);
    
    // Executar sincronização imediatamente na primeira vez
    this.sync();
    
    // Agendar sincronização periódica
    this.syncInterval = setInterval(() => {
      this.sync();
    }, intervalMs);

    console.log(`✅ [BulkSync] Sincronização automática iniciada (próxima execução em ${this.syncIntervalHours} horas)`);
  }

  /**
   * Para a sincronização automática
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 [BulkSync] Sincronização automática parada');
    }
  }

  /**
   * Executa a sincronização usando bulk operations
   */
  async sync() {
    // Evitar execuções simultâneas (local)
    if (this.isSyncing) {
      console.log('⏳ [BulkSync] Sincronização já em andamento, pulando...');
      return;
    }

    // Verificar lock global (evitar conflito com outros serviços de sync)
    if (!syncLock.tryLock('BulkSync')) {
      console.log('⏳ [BulkSync] Outra sincronização em andamento, aguardando próxima execução...');
      return;
    }

    try {
      this.isSyncing = true;
      const startTime = Date.now();
      
      console.log(`🚀 [BulkSync] Iniciando sincronização completa usando Bulk Operations...`);
      console.log(`📋 [BulkSync] Sincronizando TODOS os produtos da loja (sem filtro de collection)`);
      
      // Usar bulk operations para sincronização completa
      const result = await shopifyService.syncAllProductsBulk(db, true);
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      this.lastSyncTime = new Date();
      
      console.log(`✅ [BulkSync] Sincronização concluída em ${duration}s`);
      console.log(`📊 [BulkSync] Estatísticas:`);
      console.log(`   - Total processado: ${result.total || 0}`);
      console.log(`   - Novos produtos: ${result.synced || 0}`);
      console.log(`   - Produtos atualizados: ${result.updated || 0}`);
      console.log(`   - Erros: ${result.errors || 0}`);
      
    } catch (error) {
      console.error('❌ [BulkSync] Erro na sincronização automática:', error);
      console.error('❌ [BulkSync] Stack:', error.stack);
    } finally {
      this.isSyncing = false;
      syncLock.release('BulkSync');
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
    console.log('🚀 [BulkSync] Forçando sincronização imediata...');
    await this.sync();
  }
}

// Singleton
const bulkSyncService = new BulkSyncService();

module.exports = bulkSyncService;
