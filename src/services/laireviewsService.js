const axios = require('axios');
const FormData = require('form-data');
const { URLSearchParams } = require('url');
const cacheService = require('./cacheService');

/**
 * Serviço para buscar avaliações do Laireviews (mesmo sistema usado pela Shopify)
 * Baseado na análise do iframe em backend/pagina.html
 */
class LaireviewsService {
  constructor() {
    this.hostServer = 'https://store.laireviews.com';
    this.cdn = 'https://d1bu6z2uxfnay3.cloudfront.net';
    this.shopName = 'e4ec7f-f5'; // Nome da loja no sistema Laireviews
    
    // Rate limiting: máximo 3 requisições simultâneas, delay de 200ms entre requisições
    this.maxConcurrentRequests = 3;
    this.requestDelay = 200; // ms
    this.activeRequests = 0;
    this.requestQueue = [];
  }

  /**
   * Processa a fila de requisições com rate limiting
   */
  async processQueue() {
    if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
      return;
    }

    const { resolve, reject, fn } = this.requestQueue.shift();
    this.activeRequests++;

    try {
      // Delay entre requisições para evitar sobrecarga
      if (this.activeRequests > 1) {
        await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      }

      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      // Processar próxima requisição na fila
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Adiciona requisição à fila com rate limiting
   */
  async queueRequest(fn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, fn });
      this.processQueue();
    });
  }

  /**
   * Busca avaliações de um produto diretamente da API do Laireviews
   * @param {string} productShopifyId - ID do produto no Shopify
   * @param {number} page - Página atual (padrão: 1)
   * @param {number} perPage - Itens por página (padrão: 10)
   * @param {string} sourceKey - Chave da fonte (padrão: 'homePage')
   * @returns {Promise<Object>} Dados das avaliações
   */
  async getReviews(productShopifyId, page = 1, perPage = 10, sourceKey = 'homePage') {
    // Verificar cache primeiro (TTL de 10 minutos)
    const cacheKey = `laireviews:${productShopifyId}:${page}:${perPage}:${sourceKey}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      console.log(`[laireviews] ✅ Reviews encontradas no cache para produto ${productShopifyId}`);
      return cached;
    }

    // Usar queue para rate limiting
    return this.queueRequest(async () => {
      const result = await this._fetchReviews(productShopifyId, page, perPage, sourceKey);
      // Cachear resultado após buscar
      if (result) {
        cacheService.set(cacheKey, result, 600); // 10 minutos
      }
      return result;
    });
  }

  /**
   * Método interno para buscar reviews (sem cache/queue)
   */
  async _fetchReviews(productShopifyId, page = 1, perPage = 10, sourceKey = 'homePage') {
    try {
      console.log('[laireviews] Buscando avaliações para produto:', productShopifyId);
      
      const url = `${this.hostServer}/api/load-more`;
      
      // Tentar diferentes formatos de parâmetros (baseado no HTML do iframe)
      // No HTML: data-shopname="e4ec7f-f5" data-productidshopify="10467404972337" data-pagecurrent="1" data-reviewperpage="10" data-sourceKey="homePage"
      const paramsOptions = [
        // Opção 1: formato exato do HTML (data-* attributes)
        {
          shopname: this.shopName,
          productidshopify: productShopifyId,
          pagecurrent: page,
          reviewperpage: perPage,
          sourceKey: sourceKey,
          type: 'product'
        },
        // Opção 2: formato com underscore
        {
          shop_name: this.shopName,
          product_id_shopify: productShopifyId,
          page_current: page,
          review_per_page: perPage,
          source_key: sourceKey,
          type: 'product'
        },
        // Opção 3: formato padrão REST
        {
          shop: this.shopName,
          product_id: productShopifyId,
          page: page,
          per_page: perPage,
          source: sourceKey,
          type: 'product'
        },
        // Opção 4: formato camelCase
        {
          shopName: this.shopName,
          productShopifyId: productShopifyId,
          pageCurrent: page,
          reviewPerPage: perPage,
          sourceKey: sourceKey,
          type: 'product'
        }
      ];

      let lastError = null;
      
      // Tentar cada formato até um funcionar
      for (let i = 0; i < paramsOptions.length; i++) {
        const params = paramsOptions[i];
        console.log(`[laireviews] Tentativa ${i + 1}/${paramsOptions.length} - Parâmetros:`, JSON.stringify(params, null, 2));
        const queryString = Object.keys(params).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join('&');
        console.log(`[laireviews] URL completa: ${url}?${queryString}`);

        try {
          // A API só aceita GET, não POST!
          console.log('[laireviews] Fazendo requisição GET...');
          
          const response = await axios.get(url, {
            params: params,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
              'Referer': 'https://melhordascasas.com.br/',
              'Origin': 'https://melhordascasas.com.br',
              'X-Requested-With': 'XMLHttpRequest',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            timeout: 20000
          });
          
          console.log('[laireviews] GET retornou status:', response.status);

          console.log('[laireviews] ========================================');
          console.log('[laireviews] RESPOSTA DA API:');
          console.log('[laireviews] Status:', response.status);
          console.log('[laireviews] Headers:', JSON.stringify(response.headers, null, 2));
          console.log('[laireviews] Data type:', typeof response.data);
          console.log('[laireviews] Data completo:', JSON.stringify(response.data, null, 2));
          console.log('[laireviews] ========================================');
          
          if (response.data) {
            const hasErrors = response.data.errors === true;
            const hasReviews = response.data.reviews && Array.isArray(response.data.reviews);
            const reviewsCount = hasReviews ? response.data.reviews.length : 0;
            const hasTotal = response.data.total !== undefined && response.data.total !== null;
            const hasReviewCountInfo = !!response.data.reviewCountInfo;
            
            console.log('[laireviews] Análise da resposta:');
            console.log('[laireviews]   - errors:', hasErrors);
            console.log('[laireviews]   - reviews array:', hasReviews);
            console.log('[laireviews]   - reviews count:', reviewsCount);
            console.log('[laireviews]   - total:', response.data.total);
            console.log('[laireviews]   - reviewCountInfo:', hasReviewCountInfo);
            
            if (hasReviewCountInfo) {
              console.log('[laireviews]   - reviewCountInfo.total:', response.data.reviewCountInfo.total);
              console.log('[laireviews]   - reviewCountInfo.average:', response.data.reviewCountInfo.average);
            }
            
            // Se a resposta contém "errors": true, significa que os parâmetros estão errados
            if (hasErrors) {
              console.log('[laireviews] ⚠️ API retornou errors: true, tentando próximo formato...');
              lastError = new Error('API retornou errors: true');
              continue; // Tentar próximo formato
            }
            
            // Verificar se tem blockReviews (base64)
            if (response.data.blockReviews) {
              console.log('[laireviews] ✅ Resposta contém blockReviews (base64)!');
              try {
                // Decodificar base64
                const decodedJson = Buffer.from(response.data.blockReviews, 'base64').toString('utf-8');
                const blockReviewsData = JSON.parse(decodedJson);
                console.log(`[laireviews] ✅ blockReviews decodificado: ${blockReviewsData.length} reviews`);
                
                // Retornar no formato esperado
                return {
                  reviews: blockReviewsData,
                  total: response.data.total || blockReviewsData.length,
                  loadMore: response.data.loadMore || 0,
                  reviewCountInfo: null // Será calculado depois se necessário
                };
              } catch (decodeError) {
                console.error('[laireviews] ❌ Erro ao decodificar blockReviews:', decodeError.message);
              }
            }
            
            // Se tem reviews ou reviewCountInfo, usar esta resposta
            if (hasReviews && reviewsCount > 0) {
              console.log('[laireviews] ✅ Resposta válida com reviews!');
              return response.data;
            }
            
            if (hasReviewCountInfo && response.data.reviewCountInfo.total > 0) {
              console.log('[laireviews] ✅ Resposta válida com reviewCountInfo!');
              return response.data;
            }
            
            if (hasTotal && response.data.total > 0) {
              console.log('[laireviews] ✅ Resposta válida com total!');
              // Se tem total mas não tem reviews, retornar mesmo assim (pode ter blockReviews)
              return response.data;
            }
            
            // Se chegou aqui, a resposta não tem dados válidos
            console.log('[laireviews] ⚠️ Resposta não contém dados válidos, tentando próximo formato...');
          } else {
            console.log('[laireviews] ⚠️ Resposta sem data, tentando próximo formato...');
          }
        } catch (error) {
          console.error(`[laireviews] ❌ Erro na tentativa ${i + 1}:`, error.message);
          if (error.response) {
            console.error('[laireviews] Status:', error.response.status);
            console.error('[laireviews] Data:', error.response.data);
          }
          lastError = error;
          
          // Se não for o último formato, continuar tentando
          if (i < paramsOptions.length - 1) {
            continue;
          }
        }
      }
      
      // Se todas as tentativas falharam, lançar o último erro
      throw lastError || new Error('Todas as tentativas falharam');
    } catch (error) {
      console.error('[laireviews] Erro ao buscar avaliações:', error.message);
      throw error;
    }
  }

  /**
   * Busca informações agregadas de avaliações (header)
   * @param {string} productShopifyId - ID do produto no Shopify
   * @returns {Promise<Object>} Informações agregadas (total, average, rate1-5)
   */
  async getReviewStats(productShopifyId) {
    try {
      // Buscar primeira página para obter reviewCountInfo
      const data = await this.getReviews(productShopifyId, 1, 1);
      
      if (data && data.reviewCountInfo) {
        return {
          total: data.reviewCountInfo.total || 0,
          average: data.reviewCountInfo.average || 0,
          rate1: data.reviewCountInfo.rate1 || 0,
          rate2: data.reviewCountInfo.rate2 || 0,
          rate3: data.reviewCountInfo.rate3 || 0,
          rate4: data.reviewCountInfo.rate4 || 0,
          rate5: data.reviewCountInfo.rate5 || 0,
          product_shopify_id: productShopifyId
        };
      }

      // Fallback: calcular a partir das reviews
      if (data && data.reviews && data.reviews.length > 0) {
        const total = data.total || data.reviews.length;
        const sum = data.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
        const average = sum / data.reviews.length;
        
        const rateCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        data.reviews.forEach(r => {
          const rating = r.rating || 5;
          if (rating >= 1 && rating <= 5) {
            rateCounts[Math.floor(rating)]++;
          }
        });

        return {
          total,
          average,
          rate1: rateCounts[1],
          rate2: rateCounts[2],
          rate3: rateCounts[3],
          rate4: rateCounts[4],
          rate5: rateCounts[5],
          product_shopify_id: productShopifyId
        };
      }

      return null;
    } catch (error) {
      console.error('[laireviews] Erro ao buscar estatísticas:', error.message);
      return null;
    }
  }

  /**
   * Decodifica o blockReviewFirst (JSON base64) do HTML do iframe
   * @param {string} base64Json - String base64 com o JSON das reviews
   * @returns {Object} Dados decodificados
   */
  decodeBlockReviewFirst(base64Json) {
    try {
      const jsonString = Buffer.from(base64Json, 'base64').toString('utf-8');
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[laireviews] Erro ao decodificar blockReviewFirst:', error.message);
      throw error;
    }
  }

  buildSubmitFormData(payload) {
    const formData = new FormData();

    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }

      const serializedValue =
        typeof value === 'object' && !(value instanceof Buffer)
          ? JSON.stringify(value)
          : value;

      formData.append(key, serializedValue);
    });

    return formData;
  }

  async postSubmitShopify(payload) {
    const formData = this.buildSubmitFormData(payload);
    const headers = {
      ...formData.getHeaders(),
      'User-Agent': 'MelhorDasCasasApp/1.0',
      Origin: 'https://melhordascasas.com.br',
      Referer: 'https://melhordascasas.com.br/',
      Accept: '*/*',
    };

    const response = await axios.post(
      `${this.hostServer}/api/reviews/submit-shopify`,
      formData,
      {
        headers,
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  }

  async submitReview(payload) {
    return this.postSubmitShopify(payload);
  }

  async postSubmitShopifyImage(payload) {
    const params = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      params.append(key, value);
    });

    const headers = {
      Accept: '*/*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: 'https://melhordascasas.com.br',
      Referer: 'https://melhordascasas.com.br/',
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    const response = await axios.post(
      `${this.hostServer}/api/reviews/submit-shopify/image`,
      params.toString(),
      {
        headers,
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  }

  async uploadReviewPhoto(productShopifyId, base64Image) {
    if (!productShopifyId || !base64Image) return null;

    try {
      const response = await this.postSubmitShopifyImage({
        product_shopify: productShopifyId,
        shop_name: this.shopName,
        shop: this.shopName,
        image: base64Image,
      });

      return response?.image || response?.data?.image || response?.url || null;
    } catch (error) {
      console.error(
        '[laireviews] Erro ao enviar foto para submit-shopify:',
        error.response?.data || error.message
      );
      return null;
    }
  }
}

module.exports = new LaireviewsService();

