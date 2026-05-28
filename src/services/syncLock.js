/**
 * Lock global para evitar execuções simultâneas de sincronização
 * Garante que apenas uma sincronização rode por vez
 */
class SyncLock {
  constructor() {
    this.isLocked = false;
    this.lockedBy = null;
    this.lockTime = null;
  }

  /**
   * Tenta adquirir o lock
   * @param {string} serviceName - Nome do serviço tentando adquirir o lock
   * @returns {boolean} - true se conseguiu adquirir, false se já está em uso
   */
  tryLock(serviceName) {
    if (this.isLocked) {
      const lockDuration = Math.round((Date.now() - this.lockTime) / 1000);
      console.log(`🔒 [SyncLock] Lock já está em uso por ${this.lockedBy} (há ${lockDuration}s). ${serviceName} aguardando...`);
      return false;
    }

    this.isLocked = true;
    this.lockedBy = serviceName;
    this.lockTime = Date.now();
    console.log(`🔒 [SyncLock] Lock adquirido por ${serviceName}`);
    return true;
  }

  /**
   * Libera o lock
   * @param {string} serviceName - Nome do serviço liberando o lock
   */
  release(serviceName) {
    if (!this.isLocked) {
      console.log(`⚠️ [SyncLock] Tentativa de liberar lock que não está em uso (por ${serviceName})`);
      return;
    }

    if (this.lockedBy !== serviceName) {
      console.log(`⚠️ [SyncLock] Tentativa de liberar lock de outro serviço (${this.lockedBy} vs ${serviceName})`);
      return;
    }

    const lockDuration = Math.round((Date.now() - this.lockTime) / 1000);
    console.log(`🔓 [SyncLock] Lock liberado por ${serviceName} (usado por ${lockDuration}s)`);
    
    this.isLocked = false;
    this.lockedBy = null;
    this.lockTime = null;
  }

  /**
   * Verifica se o lock está em uso
   */
  isInUse() {
    return this.isLocked;
  }

  /**
   * Retorna informações sobre o lock
   */
  getStatus() {
    if (!this.isLocked) {
      return { isLocked: false };
    }

    const lockDuration = Math.round((Date.now() - this.lockTime) / 1000);
    return {
      isLocked: true,
      lockedBy: this.lockedBy,
      lockDuration: lockDuration
    };
  }
}

// Singleton
const syncLock = new SyncLock();

module.exports = syncLock;
