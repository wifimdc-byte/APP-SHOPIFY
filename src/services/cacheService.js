// Serviço de cache simples para melhorar performance
// Em produção, considerar usar Redis para cache distribuído

const NodeCache = require('node-cache');

class CacheService {
  constructor() {
    // Cache com TTL de 5 minutos por padrão
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minutos
      checkperiod: 60, // Verificar itens expirados a cada 60 segundos
      useClones: false, // Não clonar objetos (melhor performance)
    });
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value, ttl = null) {
    if (ttl) {
      return this.cache.set(key, value, ttl);
    }
    return this.cache.set(key, value);
  }

  delete(key) {
    return this.cache.del(key);
  }

  clear() {
    return this.cache.flushAll();
  }

  keys() {
    return this.cache.keys();
  }

  // Cache para produtos (TTL de 10 minutos)
  getProduct(key) {
    return this.get(`product:${key}`);
  }

  setProduct(key, value) {
    return this.set(`product:${key}`, value, 600); // 10 minutos
  }

  // Cache para lista de produtos (TTL de 5 minutos)
  getProductsList(key) {
    return this.get(`products:list:${key}`);
  }

  setProductsList(key, value) {
    return this.set(`products:list:${key}`, value, 300); // 5 minutos
  }

  // Cache para categorias (TTL de 30 minutos)
  getCategories(key = 'all') {
    return this.get(`categories:${key}`);
  }

  setCategories(key, value) {
    return this.set(`categories:${key}`, value, 1800); // 30 minutos
  }

  // Invalidar cache de produtos quando um produto for atualizado
  invalidateProduct(productId) {
    this.delete(`product:${productId}`);
    // Invalidar todas as listas de produtos também
    const keys = this.cache.keys();
    keys.forEach(key => {
      if (key.startsWith('products:list:')) {
        this.delete(key);
      }
    });
  }

  // Cache para mapeamento variant_id → product_id (TTL de 1 hora)
  getVariantToProduct(variantId) {
    return this.get(`variant:product:${variantId}`);
  }

  setVariantToProduct(variantId, productId) {
    return this.set(`variant:product:${variantId}`, productId, 3600); // 1 hora
  }
}

module.exports = new CacheService();


