const axios = require('axios');

class ShopifyService {
  constructor() {
    this.domain = 'e4ec7f-f5.myshopify.com';
    this.adminToken = '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';
    this.apiKey = '849e78f3802772c741977838421e5c27';
    this.baseURL = `https://${this.domain}/admin/api/2024-01`;
    // Atualizado para versão que suporta CartDeliveryPreferenceInput
    this.storefrontURL = `https://${this.domain}/api/2025-01/graphql.json`;
    this.storefrontBaseUrl =
      process.env.SHOPIFY_STOREFRONT_BASE_URL || 'https://melhordascasas.com.br';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Shopify-Access-Token': this.adminToken,
        'Content-Type': 'application/json',
      },
    });

    // Storefront API client (precisa de token diferente)
    this.storefrontToken = process.env.SHOPIFY_STOREFRONT_TOKEN || 'cb843267aa41777a39afcfd2a1579ac3';
    this.storefrontClient = axios.create({
      baseURL: this.storefrontURL,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': this.storefrontToken,
      },
    });
    console.log('✅ [ShopifyService] Storefront API client configurado');
  }

  // Buscar produtos apenas das collections com "- APP"
  async getAllProducts() {
    try {
      console.log('🔄 Buscando collections com "- APP"...');
      
      // Buscar todas as collections
      const collections = await this.getAllCollections();
      console.log(`📋 Total de collections encontradas: ${collections.length}`);
      
      // Filtrar apenas as que contêm "- APP"
      const appCollections = collections.filter(collection => 
        collection.title && collection.title.includes('- APP')
      );
      
      console.log(`🎯 Collections com "- APP": ${appCollections.length}`);
      
      if (appCollections.length === 0) {
        console.log('⚠️  Nenhuma collection com "- APP" encontrada');
        return [];
      }
      
      let allProducts = [];
      
      // Buscar produtos de cada collection
      for (const collection of appCollections) {
        console.log(`📦 Buscando produtos da collection: ${collection.title}`);
        
        try {
          const products = await this.getProductsByCollection(collection.id);
          console.log(`✅ ${collection.title}: ${products.length} produtos encontrados`);
          
          // Adicionar categoria baseada no nome da collection
          const categoryName = collection.title.replace(' - APP', '').trim();
          products.forEach(product => {
            product._app_category = categoryName;
          });
          
          allProducts = allProducts.concat(products);
        } catch (error) {
          console.error(`❌ Erro ao buscar produtos de ${collection.title}:`, error.message);
        }
      }
      
      console.log(`🎉 Total de produtos encontrados: ${allProducts.length}`);
      return allProducts;
    } catch (error) {
      console.error('Erro ao buscar produtos do Shopify:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar produtos por tag (otimizado para coleções grandes)
  async getProductsByTag(tag, collectionId = null, maxProducts = 3000) {
    try {
      console.log(`🔍 Buscando produtos com tag "${tag}"...`);
      
      const allProducts = [];
      let pageInfo = null;
      let hasMore = true;
      let pageCount = 0;
      const limit = 250;
      
      // Buscar produtos diretamente por tag usando a API de produtos
      let sinceId = null;
      while (hasMore && allProducts.length < maxProducts) {
        pageCount++;
        const params = { 
          limit
        };
        
        if (pageInfo) {
          // Quando usa page_info, não pode passar published_status
          params.page_info = pageInfo;
          delete params.since_id; // Não usar since_id com page_info
          delete params.published_status; // Não usar published_status com page_info
        } else if (sinceId) {
          params.since_id = sinceId;
          params.published_status = 'published'; // Só usar published_status quando não usa page_info
          delete params.page_info; // Não usar page_info com since_id
        } else {
          // Primeira página: usar published_status
          params.published_status = 'published';
        }
        
        try {
          console.log(`🔍 Buscando página ${pageCount} com params:`, JSON.stringify(params));
          const response = await this.client.get('/products.json', { params });
          const products = response.data.products || [];
          
          console.log(`📦 Página ${pageCount}: ${products.length} produtos retornados pela API`);
          
          if (products.length === 0) {
            console.log(`⚠️ Nenhum produto retornado na página ${pageCount}, parando busca.`);
            hasMore = false;
            break;
          }
          
          // Debug: mostrar primeiros produtos e suas tags
          if (pageCount === 1 && products.length > 0) {
            console.log(`🔍 [Debug] Primeiros 3 produtos e suas tags:`);
            products.slice(0, 3).forEach((p, idx) => {
              console.log(`   ${idx + 1}. ID: ${p.id}, Título: ${p.title?.substring(0, 50)}, Tags: ${p.tags || 'N/A'}`);
            });
          }
          
          // Filtrar produtos com a tag especificada
          const filteredProducts = products.filter(p => {
            if (!p.tags) {
              return false;
            }
            
            let tags = [];
            if (typeof p.tags === 'string') {
              tags = p.tags.split(',').map(t => t.trim());
            } else if (Array.isArray(p.tags)) {
              tags = p.tags.map(t => String(t).trim());
            }
            
            const hasTag = tags.some(t => t.toLowerCase() === tag.toLowerCase());
            
            if (hasTag) {
              return true;
            }
            
            return false;
          });
          
          console.log(`🏷️ Página ${pageCount}: ${filteredProducts.length} produtos com tag "${tag}" encontrados`);
          
          allProducts.push(...filteredProducts.map(p => p.id));
          
          console.log(`📄 Página ${pageCount}: ${filteredProducts.length}/${products.length} produtos com tag "${tag}" (Total: ${allProducts.length})`);
          
          if (allProducts.length >= maxProducts) {
            console.log(`✅ Limite de ${maxProducts} produtos com tag "${tag}" atingido.`);
            hasMore = false;
            break;
          }
          
          // Se não encontrou nenhum produto com tag nesta página, mas ainda há mais produtos, continuar
          if (filteredProducts.length === 0 && products.length === limit) {
            console.log(`ℹ️ Nenhum produto com tag "${tag}" nesta página, mas há mais produtos. Continuando busca...`);
          }
          
          // Atualizar since_id para próxima iteração (se não usar page_info)
          if (!pageInfo && products.length > 0) {
            sinceId = products[products.length - 1].id;
          }
          
          // Se não encontrou nenhum produto com tag na coleção nesta página, mas ainda há mais produtos, continuar
          if (filteredProducts.length === 0 && products.length === limit) {
            console.log(`ℹ️ Nenhum produto com tag "${tag}" na coleção nesta página, mas há mais produtos. Continuando busca...`);
          }
          
          // Verificar paginação
          const linkHeader = response.headers.link;
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const nextMatch = linkHeader.match(/page_info=([^&>]+)/);
            if (nextMatch) {
              pageInfo = nextMatch[1];
              sinceId = null; // Limpar since_id se usar page_info
              hasMore = true;
              console.log(`➡️ Usando page_info para próxima página: ${pageInfo.substring(0, 20)}...`);
            } else {
              // Tentar usar since_id se não houver page_info
              if (products.length === limit) {
                sinceId = products[products.length - 1].id;
                hasMore = true;
                console.log(`➡️ Usando since_id para próxima página: ${sinceId}`);
              } else {
                hasMore = false;
                console.log(`⏹️ Sem mais produtos (menos de ${limit} retornados)`);
              }
            }
          } else if (products.length === limit) {
            // Se retornou o limite máximo, pode haver mais produtos
            // Usar since_id como fallback
            sinceId = products[products.length - 1].id;
            hasMore = true;
            console.log(`➡️ Sem linkHeader, usando since_id para próxima página: ${sinceId}`);
          } else {
            hasMore = false;
            console.log(`⏹️ Sem mais produtos (menos de ${limit} retornados, sem linkHeader)`);
          }
          
          // Limite de segurança
          if (pageCount > 200) {
            console.log('⚠️ Limite de 200 páginas atingido');
            hasMore = false;
          }
          
          // Log de progresso a cada 10 páginas
          if (pageCount % 10 === 0) {
            console.log(`📊 Progresso: ${pageCount} páginas processadas, ${allProducts.length} produtos encontrados na coleção`);
          }
          
          // Log de estado do loop
          console.log(`🔄 Estado do loop: hasMore=${hasMore}, allProducts.length=${allProducts.length}, maxProducts=${maxProducts}, pageCount=${pageCount}`);
          
          if (hasMore && allProducts.length < maxProducts) {
            console.log(`⏳ Aguardando 600ms antes da próxima página...`);
            await new Promise(resolve => setTimeout(resolve, 600));
            console.log(`➡️ Continuando para próxima página...`);
          } else {
            console.log(`⏹️ Parando loop: hasMore=${hasMore}, allProducts.length=${allProducts.length}, maxProducts=${maxProducts}`);
            break; // Sair explicitamente do loop
          }
        } catch (pageError) {
          console.error(`❌ Erro ao buscar página ${pageCount}:`, pageError.response?.data || pageError.message);
          // Se for erro 429 (rate limit), aguardar mais tempo e tentar novamente a mesma página
          if (pageError.response?.status === 429 || (pageError.response?.data?.errors && typeof pageError.response.data.errors === 'string' && pageError.response.data.errors.includes('Exceeded'))) {
            console.log('⏳ Rate limit, aguardando 2 segundos...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            pageCount--; // Decrementar para tentar a mesma página novamente
            continue;
          } else {
            console.log(`⏹️ Erro na página ${pageCount}, parando busca.`);
            hasMore = false;
            break;
          }
        }
      }
      
      console.log(`🔄 Loop finalizado. Total de páginas processadas: ${pageCount}, Total de produtos encontrados: ${allProducts.length}`);
      
      // Limitar aos primeiros maxProducts IDs
      const productIds = allProducts.slice(0, maxProducts);
      console.log(`✅ Total de ${productIds.length} IDs de produtos com tag "${tag}" encontrados`);
      
      // Agora buscar produtos completos em batches
      console.log(`🔄 Buscando produtos completos em batch...`);
      const finalProducts = [];
      const batchSize = 250;
      
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batchIds = productIds.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(productIds.length / batchSize);
        
        try {
          const idsParam = batchIds.join(',');
          const response = await this.client.get(`/products.json`, {
            params: { ids: idsParam, limit: batchSize }
          });
          
          let products = response.data.products || [];
          
          // Filtrar produtos com variantes válidas
          products = products.filter(p => {
            return p.variants && Array.isArray(p.variants) && p.variants.length > 0;
          });
          
          finalProducts.push(...products);
          console.log(`✅ Batch ${batchNum}/${totalBatches}: ${products.length} produtos válidos`);
          
          if (i + batchSize < productIds.length) {
            await new Promise(resolve => setTimeout(resolve, 600));
          }
        } catch (batchError) {
          if (batchError.response?.status === 429) {
            console.log(`⏳ Rate limit no batch ${batchNum}, aguardando 2 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.error(`❌ Erro ao buscar batch ${batchNum}:`, batchError.response?.data || batchError.message);
          }
        }
      }
      
      console.log(`✅ Total de ${finalProducts.length} produtos válidos obtidos com tag "${tag}"`);
      return finalProducts;
    } catch (error) {
      console.error('❌ Erro ao buscar produtos por tag:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar todos os produtos diretamente (sem collections)
  async getAllProductsDirect() {
    try {
      let allProducts = [];
      let pageInfo = null;
      let hasMore = true;
      let pageCount = 0;
      
      console.log('🔄 Buscando todos os produtos do Shopify diretamente...');
      
      while (hasMore) {
        pageCount++;
        console.log(`📄 Buscando página ${pageCount}...`);
        
        const params = {
          limit: 250 // Máximo por página da API
        };
        
        // Usar page_info para paginação mais confiável (se disponível)
        if (pageInfo) {
          params.page_info = pageInfo;
        }
        
        try {
          const response = await this.client.get('/products.json', { params });
          const products = response.data.products || [];
          
          allProducts = allProducts.concat(products);
          
          console.log(`✅ Página ${pageCount}: ${products.length} produtos encontrados (Total acumulado: ${allProducts.length})`);
          
          // Verificar se há mais páginas usando Link header ou quantidade de produtos
          const linkHeader = response.headers.link;
          
          if (linkHeader && linkHeader.includes('rel="next"')) {
            // Extrair page_info do próximo link
            const nextMatch = linkHeader.match(/page_info=([^&>]+)/);
            if (nextMatch) {
              pageInfo = nextMatch[1];
              hasMore = true;
            } else {
              hasMore = false;
            }
          } else if (products.length === 250) {
            // Se não houver Link header, usar since_id como fallback
            const lastProductId = products[products.length - 1].id;
            // Não usar page_info e since_id juntos
            pageInfo = null;
            // Usar since_id na próxima iteração
            params.since_id = lastProductId;
            // Continuar apenas se realmente houver mais produtos
            hasMore = true;
          } else {
            hasMore = false;
          }
          
          // Se não houver page_info mas houver since_id, usar since_id na próxima iteração
          if (!pageInfo && params.since_id) {
            // since_id já está definido, continuar
          } else if (!pageInfo && !params.since_id && products.length === 250) {
            // Primeira vez sem page_info, usar since_id
            const lastProductId = products[products.length - 1].id;
            params.since_id = lastProductId;
          }
          
          // Limite de segurança aumentado para evitar loop infinito
          if (pageCount > 200) {
            console.log('⚠️  Limite de 200 páginas atingido, parando busca');
            break;
          }
          
          // Pequeno delay para evitar rate limiting
          if (hasMore && pageCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (pageError) {
          console.error(`❌ Erro ao buscar página ${pageCount}:`, pageError.response?.data || pageError.message);
          // Se for erro 429 (rate limit), aguardar mais tempo e tentar novamente a mesma página
          if (pageError.response?.status === 429 || (pageError.response?.data?.errors && pageError.response.data.errors.includes('Exceeded'))) {
            console.log('⏳ Rate limit atingido, aguardando 2 segundos...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            pageCount--; // Decrementar para tentar a mesma página novamente
            continue; // Tentar novamente a mesma página
          } else {
            // Para outros erros, continuar com próxima página se possível
            hasMore = false;
          }
        }
      }
      
      console.log(`🎉 Total de produtos encontrados: ${allProducts.length}`);
      return allProducts;
    } catch (error) {
      console.error('Erro ao buscar produtos do Shopify:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar produto específico por ID
  async getProduct(productId) {
    try {
      const response = await this.client.get(`/products/${productId}.json`);
      return response.data.product;
    } catch (error) {
      console.error('Erro ao buscar produto do Shopify:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar apenas IDs dos produtos de uma coleção (método leve para queries rápidas)
  async getCollectionProductIds(collectionId) {
    try {
      let allProductIds = [];
      let pageInfo = null;
      let hasMore = true;
      let pageCount = 0;
      const limit = 250; // Máximo por página da API
      
      console.log(`🔍 Buscando IDs dos produtos da collection ${collectionId}...`);
      
      while (hasMore) {
        pageCount++;
        const params = { limit, fields: 'id' }; // Buscar apenas IDs para ser mais rápido
        
        // Usar page_info se disponível (paginação mais confiável)
        if (pageInfo) {
          params.page_info = pageInfo;
        }
        
        try {
          const response = await this.client.get(`/collections/${collectionId}/products.json`, { params });
          const products = response.data.products || [];
          const productIds = products.map(p => p.id.toString());
          allProductIds = allProductIds.concat(productIds);
          
          console.log(`📄 Página ${pageCount}: ${products.length} IDs encontrados (Total: ${allProductIds.length})`);
          
          // Verificar se há mais páginas usando Link header
          const linkHeader = response.headers.link;
          
          if (linkHeader && linkHeader.includes('rel="next"')) {
            // Extrair page_info do próximo link
            const nextMatch = linkHeader.match(/page_info=([^&>]+)/);
            if (nextMatch) {
              pageInfo = nextMatch[1];
              hasMore = true;
            } else {
              hasMore = false;
            }
          } else if (products.length === limit) {
            // Se retornou o limite máximo, pode haver mais produtos
            const lastProductId = products[products.length - 1]?.id;
            if (lastProductId && !pageInfo) {
              params.since_id = lastProductId;
              hasMore = true;
            } else {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
          
          // Limite de segurança
          if (pageCount > 50) {
            console.log('⚠️ Limite de 50 páginas atingido para collection');
            break;
          }
          
          // Pequeno delay entre páginas para evitar rate limit
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (pageError) {
          console.error(`❌ Erro ao buscar página ${pageCount} da collection:`, pageError.response?.data || pageError.message);
          // Se for erro 429 (rate limit), aguardar mais tempo e tentar novamente a mesma página
          if (pageError.response?.status === 429 || (pageError.response?.data?.errors && typeof pageError.response.data.errors === 'string' && pageError.response.data.errors.includes('Exceeded'))) {
            console.log('⏳ Rate limit atingido, aguardando 5 segundos...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            pageCount--; // Decrementar para tentar a mesma página novamente
            continue; // Tentar novamente a mesma página
          } else {
            hasMore = false;
          }
        }
      }
      
      console.log(`✅ Total de ${allProductIds.length} IDs de produtos encontrados na collection`);
      return allProductIds;
    } catch (error) {
      console.error('Erro ao buscar IDs dos produtos da coleção:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar produtos por coleção (otimizado - busca IDs primeiro, depois produtos completos em batch)
  async getProductsByCollection(collectionId, options = {}) {
    try {
      const { maxProducts = null, filterByTag = null } = options || {};
      
      // NOTA: Mesmo com filterByTag, vamos buscar produtos da collection primeiro
      // e depois filtrar por tag. Isso garante que todos os produtos da collection
      // sejam considerados, não apenas os que têm a tag.
      
      // Passo 1: Buscar apenas IDs dos produtos da coleção (rápido)
      let allProductIds = [];
      let pageInfo = null;
      let hasMore = true;
      let pageCount = 0;
      const limit = 250;
      
      console.log(`🔍 Passo 1: Buscando IDs dos produtos da collection ${collectionId}...`);
      
      // Limite máximo de produtos para evitar buscar toda a loja
      // Se não especificado, usar limite padrão de 20000
      const MAX_PRODUCTS = maxProducts || 20000;
      
      while (hasMore && allProductIds.length < MAX_PRODUCTS) {
        pageCount++;
        const params = { limit, fields: 'id' }; // Buscar apenas IDs
        
        if (pageInfo) {
          params.page_info = pageInfo;
        }
        
        try {
          const response = await this.client.get(`/collections/${collectionId}/products.json`, { params });
          const products = response.data.products || [];
          const productIds = products.map(p => p.id);
          allProductIds = allProductIds.concat(productIds);
          
          console.log(`📄 Página ${pageCount}: ${products.length} IDs encontrados (Total: ${allProductIds.length})`);
          
          // Se atingiu o limite E não tem filtro por tag, parar
          // Se tem filtro por tag, continuar buscando todos os IDs para filtrar depois
          if (!filterByTag && allProductIds.length >= MAX_PRODUCTS) {
            console.log(`⚠️ Limite de segurança atingido (${MAX_PRODUCTS} produtos). Parando busca.`);
            console.log(`💡 Se sua coleção tem mais produtos, ajuste MAX_PRODUCTS ou verifique se a coleção está correta.`);
            hasMore = false;
            break;
          }
          
          // Verificar paginação
          const linkHeader = response.headers.link;
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const nextMatch = linkHeader.match(/page_info=([^&>]+)/);
            if (nextMatch) {
              pageInfo = nextMatch[1];
              hasMore = true;
            } else {
              hasMore = false;
            }
          } else if (products.length === limit) {
            const lastProductId = products[products.length - 1]?.id;
            if (lastProductId && !pageInfo) {
              params.since_id = lastProductId;
              hasMore = true;
            } else {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
          
          // Delay entre páginas
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 600));
          }
          
          // Limite de páginas de segurança
          if (pageCount > 200) {
            console.log('⚠️ Limite de 200 páginas atingido');
            break;
          }
        } catch (pageError) {
          console.error(`❌ Erro ao buscar página ${pageCount} da collection:`, pageError.response?.data || pageError.message);
          // Se for erro 429 (rate limit), aguardar mais tempo e tentar novamente a mesma página
          if (pageError.response?.status === 429 || (pageError.response?.data?.errors && typeof pageError.response.data.errors === 'string' && pageError.response.data.errors.includes('Exceeded'))) {
            console.log('⏳ Rate limit, aguardando 2 segundos...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            pageCount--; // Decrementar para tentar a mesma página novamente
            continue;
          } else {
            hasMore = false;
          }
        }
      }
      
      console.log(`✅ Total de ${allProductIds.length} IDs encontrados`);
      
      // Se tem filtro por tag, precisamos buscar produtos completos para filtrar
      // Caso contrário, podemos otimizar buscando apenas os que precisamos
      if (filterByTag && allProductIds.length > 0) {
        console.log(`🔄 Passo 2: Buscando produtos completos e filtrando por tag "${filterByTag}"...`);
      } else {
        console.log(`🔄 Passo 2: Buscando produtos completos em batch...`);
      }
      
      // Passo 2: Buscar produtos completos em batch usando endpoint /products.json?ids=...
      // Shopify permite até 250 IDs por requisição
      const allProducts = [];
      const batchSize = 250; // Máximo permitido pelo Shopify
      
      // Se tem filtro por tag, parar quando atingir o limite de produtos válidos
      let productsFoundWithTag = 0;
      
      for (let i = 0; i < allProductIds.length; i += batchSize) {
        // Se já atingiu o limite de produtos com tag, parar
        if (filterByTag && productsFoundWithTag >= MAX_PRODUCTS) {
          console.log(`✅ Limite de ${MAX_PRODUCTS} produtos com tag "${filterByTag}" atingido. Parando busca.`);
          break;
        }
        const batchIds = allProductIds.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(allProductIds.length / batchSize);
        const progress = ((i + batchIds.length) / allProductIds.length * 100).toFixed(1);
        
        console.log(`📦 [${progress}%] Buscando batch ${batchNum}/${totalBatches} (${batchIds.length} produtos)...`);
        
        try {
          // Buscar múltiplos produtos de uma vez usando ids
          const idsParam = batchIds.join(',');
          const response = await this.client.get(`/products.json`, {
            params: { ids: idsParam, limit: batchSize }
          });
          
          const products = response.data.products || [];
          
          // Filtrar produtos com variantes válidas
          let validProducts = products.filter(p => {
            return p.variants && Array.isArray(p.variants) && p.variants.length > 0;
          });
          
          // Se tem filtro por tag, aplicar filtro adicional
          if (filterByTag && validProducts.length > 0) {
            const beforeFilter = validProducts.length;
            validProducts = validProducts.filter(p => {
              if (!p.tags) {
                return false;
              }
              
              // Normalizar tags
              let tags = [];
              if (typeof p.tags === 'string') {
                tags = p.tags.split(',').map(t => t.trim());
              } else if (Array.isArray(p.tags)) {
                tags = p.tags.map(t => String(t).trim());
              }
              
              // Verificar se tem a tag (case insensitive)
              const hasTag = tags.some(tag => tag.toLowerCase() === filterByTag.toLowerCase());
              
              return hasTag;
            });
            
            productsFoundWithTag += validProducts.length;
            
            if (beforeFilter !== validProducts.length) {
              console.log(`🏷️ Batch ${batchNum}: ${validProducts.length}/${beforeFilter} produtos com tag "${filterByTag}" (Total com tag: ${productsFoundWithTag})`);
            }
          }
          
          allProducts.push(...validProducts);
          console.log(`✅ Batch ${batchNum}: ${validProducts.length}/${products.length} produtos válidos`);
          
          // Se atingiu o limite com filtro por tag, parar
          if (filterByTag && productsFoundWithTag >= MAX_PRODUCTS) {
            console.log(`✅ Limite de ${MAX_PRODUCTS} produtos com tag "${filterByTag}" atingido após batch ${batchNum}.`);
            break;
          }
          
          // Delay entre batches para respeitar rate limit
          if (i + batchSize < allProductIds.length) {
            await new Promise(resolve => setTimeout(resolve, 600));
          }
        } catch (batchError) {
          if (batchError.response?.status === 429) {
            console.log(`⏳ Rate limit no batch ${batchNum}, aguardando 2 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Tentar novamente
            i -= batchSize; // Voltar para tentar novamente
            continue;
          } else {
            console.error(`❌ Erro no batch ${batchNum}:`, batchError.message);
          }
        }
      }
      
      // Limitar resultado final se necessário
      const finalProducts = filterByTag && allProducts.length > MAX_PRODUCTS 
        ? allProducts.slice(0, MAX_PRODUCTS)
        : allProducts;
      
      console.log(`✅ Total de ${finalProducts.length} produtos válidos obtidos da collection${filterByTag ? ` (filtrados por tag "${filterByTag}")` : ''}`);
      return finalProducts;
    } catch (error) {
      console.error('Erro ao buscar produtos da coleção:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar todas as coleções
  async getAllCollections() {
    try {
      const response = await this.client.get('/collections.json');
      return response.data.collections || [];
    } catch (error) {
      console.error('Erro ao buscar coleções do Shopify:', error.response?.data || error.message);
      // Retornar array vazio se não houver coleções
      return [];
    }
  }

  // Buscar menu específico "collections-bar" da Shopify usando GraphQL
  async getCollectionsBarMenu() {
    try {
      const menuId = 302213955889;
      const graphqlQuery = `
        query {
          menu(id: "gid://shopify/Menu/${menuId}") {
            id
            title
            handle
            items {
              id
              title
              url
              type
              resourceId
              items {
                id
                title
                url
                type
                resourceId
                items {
                  id
                  title
                  url
                  type
                  resourceId
                }
              }
            }
          }
        }
      `;
      
      const response = await axios.post(
        `${this.baseURL}/graphql.json`,
        { query: graphqlQuery },
        {
          headers: {
            'X-Shopify-Access-Token': this.adminToken,
            'Content-Type': 'application/json',
          }
        }
      );

      if (response.data.errors) {
        console.error('Erros GraphQL:', response.data.errors);
        throw new Error('Erro ao buscar menu via GraphQL');
      }

      const menu = response.data.data?.menu;
      
      if (!menu || !menu.items || menu.items.length === 0) {
        console.log('⚠️ Menu collections-bar não encontrado ou sem itens, usando todas as collections como fallback');
        return await this.getAllCollections();
      }

      console.log(`✅ Menu collections-bar encontrado: "${menu.title}" com ${menu.items.length} itens`);
      
      // Log detalhado da estrutura do menu
      console.log('🔍 [getCollectionsBarMenu] Estrutura completa do menu:');
      menu.items.forEach((item, index) => {
        console.log(`  Item ${index + 1}: ${item.title}`, {
          type: item.type,
          resourceId: item.resourceId,
          url: item.url,
          hasItems: !!(item.items && item.items.length > 0),
          itemsCount: item.items?.length || 0
        });
        if (item.items && item.items.length > 0) {
          item.items.forEach((subItem, subIndex) => {
            console.log(`    Subitem ${subIndex + 1}: ${subItem.title}`, {
              type: subItem.type,
              resourceId: subItem.resourceId,
              url: subItem.url
            });
          });
        }
      });

      // Função recursiva para extrair collections de itens e subitens com estrutura hierárquica
      const extractCollectionsFromItems = async (items, parentCollection = null) => {
        const collections = [];
        
        for (const item of items) {
          let currentCollection = null;
          
          // Processar item atual se for collection
          if (item.type === 'COLLECTION' && item.resourceId) {
            try {
              // resourceId vem como "gid://shopify/Collection/123456", extrair o ID numérico
              const collectionId = item.resourceId.split('/').pop();
              // Buscar detalhes da collection
              const collectionResponse = await this.client.get(`/collections/${collectionId}.json`);
              const collection = collectionResponse.data.collection;
              if (collection) {
                currentCollection = {
                  id: collection.id,
                  title: collection.title,
                  handle: collection.handle,
                  subsections: []
                };
              }
            } catch (error) {
              console.error(`Erro ao buscar collection ${item.resourceId}:`, error.message);
            }
          } else if (item.url && item.url.includes('/collections/')) {
            // Se o item tem URL com /collections/, extrair o handle
            const handleMatch = item.url.match(/\/collections\/([^\/\?]+)/);
            if (handleMatch) {
              const handle = handleMatch[1];
              console.log(`🔍 Buscando collection principal por handle: ${handle}`);
              try {
                // Buscar collection pelo handle
                const allCollections = await this.getAllCollections();
                const collection = allCollections.find(c => c.handle === handle);
                if (collection) {
                  currentCollection = {
                    id: collection.id,
                    title: collection.title,
                    handle: collection.handle,
                    subsections: []
                  };
                  console.log(`✅ Collection principal encontrada: ${currentCollection.title} (${currentCollection.id})`);
                } else {
                  console.warn(`⚠️ Collection principal não encontrada com handle: ${handle}`);
                }
              } catch (error) {
                console.error(`❌ Erro ao buscar collection pelo handle ${handle}:`, error.message);
              }
            }
          }
          
          // Log para debug
          if (item.items && item.items.length > 0) {
            console.log(`🔍 Item "${item.title}" tem ${item.items.length} subitens. currentCollection:`, currentCollection ? `${currentCollection.title} (${currentCollection.id})` : 'null');
          }
          
          // Processar subitens recursivamente ANTES de adicionar a collection atual
          if (item.items && item.items.length > 0 && currentCollection) {
            console.log(`🔍 Processando ${item.items.length} subitens para collection "${currentCollection.title}" (${currentCollection.id})`);
            console.log(`📋 Subitens recebidos:`, item.items.map(si => ({
              title: si.title,
              type: si.type,
              resourceId: si.resourceId,
              url: si.url
            })));
            
            // Garantir que o array de subsections existe
            if (!currentCollection.subsections) {
              currentCollection.subsections = [];
            }
            
            // Buscar todas as collections uma vez para reutilizar
            let allCollectionsCache = null;
            const getAllCollectionsCached = async () => {
              if (!allCollectionsCache) {
                allCollectionsCache = await this.getAllCollections();
                console.log(`📦 Total de collections disponíveis para busca: ${allCollectionsCache.length}`);
              }
              return allCollectionsCache;
            };
            
            // ✅ OTIMIZAÇÃO: Processar subitens em paralelo para reduzir tempo de resposta
            // Buscar todas as collections de uma vez em vez de sequencialmente
            const processSubItem = async (subItem) => {
              console.log(`  📦 Processando subitem:`, {
                title: subItem.title,
                type: subItem.type,
                resourceId: subItem.resourceId,
                url: subItem.url,
                hasItems: !!(subItem.items && subItem.items.length > 0)
              });
              
              let subCollection = null;
              
              // PRIMEIRO tentar por resourceId se disponível (mais confiável)
              if (subItem.type === 'COLLECTION' && subItem.resourceId) {
                try {
                  const subCollectionId = subItem.resourceId.split('/').pop();
                  console.log(`    🔍 Buscando collection por resourceId: ${subCollectionId}`);
                  
                  // ✅ OTIMIZAÇÃO: Removido delay de 500ms - buscar em paralelo é mais rápido
                  // Rate limiting será gerenciado pelo próprio axios se necessário
                  
                  const subCollectionResponse = await this.client.get(`/collections/${subCollectionId}.json`);
                  const subCollectionData = subCollectionResponse.data.collection;
                  if (subCollectionData) {
                    // Verificar se o ID retornado corresponde ao ID solicitado
                    const returnedId = subCollectionData.id.toString();
                    if (returnedId === subCollectionId) {
                      subCollection = {
                        id: subCollectionData.id,
                        title: subCollectionData.title,
                        handle: subCollectionData.handle,
                        subsections: []
                      };
                      console.log(`    ✅ Collection encontrada por resourceId: ${subCollection.title} (${subCollection.id})`);
                    } else {
                      console.warn(`    ⚠️ ID não corresponde! Solicitado: ${subCollectionId}, Retornado: ${returnedId} (${subCollectionData.title})`);
                      // Não usar dados incorretos
                    }
                  }
                } catch (error) {
                  if (error.response?.status === 429) {
                    console.warn(`    ⚠️ Rate limit atingido ao buscar collection ${subItem.resourceId}, aguardando...`);
                    // Aguardar mais tempo em caso de rate limit
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    // Tentar novamente uma vez
                    try {
                      const subCollectionId = subItem.resourceId.split('/').pop();
                      const subCollectionResponse = await this.client.get(`/collections/${subCollectionId}.json`);
                      const subCollectionData = subCollectionResponse.data.collection;
                      if (subCollectionData) {
                        const returnedId = subCollectionData.id.toString();
                        if (returnedId === subCollectionId) {
                          subCollection = {
                            id: subCollectionData.id,
                            title: subCollectionData.title,
                            handle: subCollectionData.handle,
                            subsections: []
                          };
                          console.log(`    ✅ Collection encontrada por resourceId (retry): ${subCollection.title} (${subCollection.id})`);
                        }
                      }
                    } catch (retryError) {
                      console.error(`    ❌ Erro ao buscar subcollection ${subItem.resourceId} (retry):`, retryError.message);
                    }
                  } else {
                    console.error(`    ❌ Erro ao buscar subcollection ${subItem.resourceId}:`, error.message);
                  }
                }
              }
              
              // Segundo tentar por URL (pode ser um link para collection mesmo que type não seja COLLECTION)
              if (!subCollection && subItem.url && subItem.url.includes('/collections/')) {
                const handleMatch = subItem.url.match(/\/collections\/([^\/\?]+)/);
                if (handleMatch) {
                  const handle = handleMatch[1];
                  console.log(`    🔍 Buscando collection por handle: ${handle}`);
                  try {
                    const allCollections = await getAllCollectionsCached();
                    const subCollectionData = allCollections.find(c => c.handle === handle);
                    if (subCollectionData) {
                      subCollection = {
                        id: subCollectionData.id,
                        title: subCollectionData.title,
                        handle: subCollectionData.handle,
                        subsections: []
                      };
                      console.log(`    ✅ Collection encontrada por handle: ${subCollection.title} (${subCollection.id})`);
                    } else {
                      console.warn(`    ⚠️ Collection não encontrada com handle: ${handle}`);
                    }
                  } catch (error) {
                    console.error(`    ❌ Erro ao buscar subcollection pelo handle ${handle}:`, error.message);
                  }
                }
              }
              
              // SEMPRE tentar buscar pelo título como fallback, mesmo se já tentou por URL ou resourceId
              // Isso garante que encontramos collections mesmo quando não têm type ou resourceId explícito
              if (!subCollection && subItem.title) {
                console.log(`    🔍 Tentando buscar collection pelo título (fallback): "${subItem.title}"`);
                try {
                  const allCollections = await getAllCollectionsCached();
                  // Tentar encontrar por título exato, handle, ou parcial
                  const searchTitle = subItem.title.toLowerCase().trim();
                  const subCollectionData = allCollections.find(c => {
                    const cTitle = c.title.toLowerCase().trim();
                    const cHandle = c.handle.toLowerCase().trim();
                    const searchHandle = searchTitle.replace(/\s+/g, '-');
                    
                    // Busca mais flexível: exato, handle, parcial, ou similar
                    return cTitle === searchTitle ||
                           cHandle === searchTitle ||
                           cHandle === searchHandle ||
                           cTitle.includes(searchTitle) ||
                           searchTitle.includes(cTitle) ||
                           cTitle.replace(/\s+/g, '') === searchTitle.replace(/\s+/g, '') ||
                           cHandle.replace(/-/g, '') === searchTitle.replace(/\s+/g, '');
                  });
                  if (subCollectionData) {
                    subCollection = {
                      id: subCollectionData.id,
                      title: subCollectionData.title,
                      handle: subCollectionData.handle,
                      subsections: []
                    };
                    console.log(`    ✅ Collection encontrada por título (fallback): ${subCollection.title} (${subCollection.id})`);
                  } else {
                    console.warn(`    ⚠️ Collection não encontrada com título: "${subItem.title}"`);
                    // Log todas as collections disponíveis para debug
                    console.log(`    📋 Collections disponíveis:`, allCollections.map(c => `${c.title} (${c.handle})`).join(', '));
                  }
                } catch (error) {
                  console.error(`    ❌ Erro ao buscar collection pelo título "${subItem.title}":`, error.message);
                }
              }
              
              // Se ainda não encontrou e não tem título, logar aviso
              if (!subCollection) {
                console.warn(`    ⚠️ Subitem não pôde ser processado como collection:`, {
                  title: subItem.title,
                  type: subItem.type,
                  hasResourceId: !!subItem.resourceId,
                  hasUrl: !!subItem.url
                });
              }
              
              return subCollection;
            };
            
            // ✅ OTIMIZAÇÃO: Processar todos os subitens em paralelo
            const subCollectionsPromises = item.items.map((subItem, index) => 
              processSubItem(subItem).then(result => ({ subItem, subCollection: result, index }))
            );
            const subCollectionsResults = await Promise.all(subCollectionsPromises);
            
            // Adicionar apenas as collections encontradas como subsections
            for (const { subItem, subCollection } of subCollectionsResults) {
              if (subCollection) {
                currentCollection.subsections = currentCollection.subsections || [];
                currentCollection.subsections.push(subCollection);
                console.log(`    ✅ Adicionando subsection "${subCollection.title}" (${subCollection.id}) à collection "${currentCollection.title}"`);
              } else {
                console.warn(`    ⚠️ Não foi possível processar subitem "${subItem?.title}" como collection`);
              }
            }
            
            console.log(`✅ Total de subsections adicionadas à "${currentCollection.title}": ${currentCollection.subsections?.length || 0}`);
            if (currentCollection.subsections && currentCollection.subsections.length > 0) {
              console.log(`📋 Subsections de "${currentCollection.title}":`, currentCollection.subsections.map(s => `${s.title} (${s.id})`).join(', '));
            } else {
              console.warn(`⚠️ NENHUMA subsection foi adicionada à "${currentCollection.title}" - verifique os logs acima para ver por quê`);
            }
          } else if (item.items && item.items.length > 0) {
            // Se o item atual não é collection mas tem subitens, processar recursivamente
            const subCollections = await extractCollectionsFromItems(item.items, parentCollection);
            if (parentCollection) {
              parentCollection.subsections = parentCollection.subsections || [];
              parentCollection.subsections.push(...subCollections);
            } else {
              collections.push(...subCollections);
            }
          }
          
          if (currentCollection) {
            // Garantir que subsections sempre exista como array
            if (!currentCollection.subsections) {
              currentCollection.subsections = [];
            }
            
            // Log antes de adicionar ao array
            console.log(`📝 Adicionando collection "${currentCollection.title}" (${currentCollection.id}) ao array:`, {
              hasSubsections: !!(currentCollection.subsections && currentCollection.subsections.length > 0),
              subsectionsCount: currentCollection.subsections?.length || 0,
              subsections: currentCollection.subsections?.map(s => `${s.title} (${s.id})`).join(', ') || 'nenhuma'
            });
            
            // Adicionar collection ao array (com subsections já processadas)
            if (parentCollection) {
              // Se tem parent, adicionar como subsection do parent
              parentCollection.subsections = parentCollection.subsections || [];
              parentCollection.subsections.push(currentCollection);
            } else {
              // Se não tem parent, adicionar como collection principal
              collections.push(currentCollection);
              console.log(`✅ Collection "${currentCollection.title}" adicionada ao array principal com ${currentCollection.subsections.length} subsections`);
            }
          }
        }
        
        return collections;
      };

      // Log da estrutura do menu antes de processar
      console.log('🔍 [getCollectionsBarMenu] Estrutura do menu:', JSON.stringify(menu.items.map(item => ({
        title: item.title,
        type: item.type,
        resourceId: item.resourceId,
        url: item.url,
        hasItems: !!(item.items && item.items.length > 0),
        itemsCount: item.items?.length || 0,
        items: item.items?.map(subItem => ({
          title: subItem.title,
          type: subItem.type,
          resourceId: subItem.resourceId,
          url: subItem.url
        })) || []
      })), null, 2));
      
      // Extrair collections dos itens do menu (incluindo submenus)
      const collections = await extractCollectionsFromItems(menu.items);

      if (collections.length === 0) {
        console.log('⚠️ Nenhuma collection encontrada no menu, usando todas as collections como fallback');
        return await this.getAllCollections();
      }

      console.log(`✅ ${collections.length} collections extraídas do menu collections-bar`);
      
      // Log collections com subsections
      const collectionsWithSubsections = collections.filter(c => c.subsections && c.subsections.length > 0);
      if (collectionsWithSubsections.length > 0) {
        console.log(`📋 Collections com subsections encontradas: ${collectionsWithSubsections.length}`);
        collectionsWithSubsections.forEach(c => {
          console.log(`  - ${c.title} (${c.id}): ${c.subsections.length} subsections`);
          c.subsections.forEach(sub => {
            console.log(`    └─ ${sub.title} (${sub.id})`);
          });
        });
      } else {
        console.warn('⚠️ NENHUMA collection com subsections encontrada no menu!');
        // Log todas as collections para debug
        collections.forEach(c => {
          console.log(`  - ${c.title} (${c.id}): subsections = ${c.subsections?.length || 0}`);
        });
      }
      
      return collections;
    } catch (error) {
      console.error('Erro ao buscar menu collections-bar:', error.response?.data || error.message);
      // Fallback: buscar todas as collections se o menu não for encontrado
      console.log('⚠️ Tentando fallback: buscar todas as collections');
      return await this.getAllCollections();
    }
  }

  // Buscar ratings de um produto via scraping da página
  async getProductRatings(shopifyProductId) {
    try {
      // Primeiro, buscar o produto para obter o handle (slug)
      const product = await this.getProduct(shopifyProductId);
      if (!product || !product.handle) {
        console.log(`⚠️ Produto ${shopifyProductId} não encontrado ou sem handle`);
        return null;
      }

      // Construir URL da página do produto
      const productUrl = `https://${this.domain}/products/${product.handle}`;
      
      console.log(`🔍 Buscando ratings do produto ${shopifyProductId} em: ${productUrl}`);

      // Fazer requisição HTTP para a página do produto
      const response = await axios.get(productUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        },
        timeout: 15000
      });

      const html = response.data;
      
      // Estratégias múltiplas para encontrar os ratings
      let ratingData = null;

      // Estratégia 1: Buscar data-rate-version2 em atributos HTML
      const patterns = [
        /data-rate-version2=['"]([^'"]+)['"]/,
        /data-rate-version2=\\{['"]([^'"]+)['"]\\}/,
        /data-rate=['"]([^'"]+)['"]/,
        /data-rating=['"]([^'"]+)['"]/
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          try {
            let ratingDataStr = match[1];
            // Decodificar entidades HTML
            ratingDataStr = ratingDataStr.replace(/&quot;/g, '"')
                                         .replace(/&#39;/g, "'")
                                         .replace(/&amp;/g, '&')
                                         .replace(/\\\//g, '/')
                                         .replace(/\\n/g, '')
                                         .replace(/\\t/g, '');
            
            // Tentar fazer parse direto
            try {
              ratingData = JSON.parse(ratingDataStr);
            } catch (e) {
              // Se falhar, tentar decodificar URL encoding
              ratingDataStr = decodeURIComponent(ratingDataStr);
              ratingData = JSON.parse(ratingDataStr);
            }
            
            if (ratingData && (ratingData.average || ratingData.total)) {
              console.log(`✅ Ratings encontrados via padrão: ${pattern}`);
              break;
            }
          } catch (e) {
            // Continuar tentando outros padrões
            continue;
          }
        }
      }

      // Estratégia 2: Buscar em scripts JSON embutidos (window.__INITIAL_STATE__, etc)
      if (!ratingData) {
        const scriptPatterns = [
          /window\.__INITIAL_STATE__\s*=\s*({[^<]*?product[^<]*?reviews[^<]*?})/i,
          /reviews.*?:\s*({[^<]*?"average"[^<]*?})/i,
          /"reviews?":\s*({[^<]*?"average"[^<]*?"total"[^<]*?})/i
        ];

        for (const pattern of scriptPatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            try {
              ratingData = JSON.parse(match[1]);
              if (ratingData && (ratingData.average || ratingData.total)) {
                console.log(`✅ Ratings encontrados em script JSON`);
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      // Estratégia 3: Buscar elemento com class relacionada a reviews e extrair data-attributes
      if (!ratingData) {
        // Buscar divs com classes relacionadas a reviews/ratings
        const reviewDivPattern = /<div[^>]*class="[^"]*(?:review|rating|rate)[^"]*"[^>]*data-[^=]*="([^"]*)"[^>]*>/i;
        const match = html.match(reviewDivPattern);
        if (match) {
          // Tentar extrair informações de todos os data-attributes
          const allDataAttrs = html.match(/data-[^=]*="[^"]*"/g);
          if (allDataAttrs) {
            for (const attr of allDataAttrs) {
              if (attr.includes('rate') || attr.includes('rating') || attr.includes('review')) {
                try {
                  const value = attr.match(/="([^"]*)"/)[1];
                  const parsed = JSON.parse(value);
                  if (parsed && (parsed.average || parsed.total)) {
                    ratingData = parsed;
                    console.log(`✅ Ratings encontrados em data-attribute`);
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }
            }
          }
        }
      }

      // Estratégia 4: Buscar por product_shopify_id específico no HTML
      if (!ratingData) {
        // Buscar qualquer JSON que contenha o product_shopify_id
        const productIdPattern = new RegExp(`"product_shopify_id"\\s*:\\s*"${shopifyProductId}"[^}]*?}([^}]*?})`, 'i');
        const match = html.match(productIdPattern);
        if (match) {
          try {
            // Tentar extrair um objeto maior que contenha essas informações
            const jsonPattern = new RegExp(`{[^}]*?"product_shopify_id"\\s*:\\s*"${shopifyProductId}"[^}]*?}([^}]*?)"average"[^}]*?}`, 'is');
            const jsonMatch = html.match(jsonPattern);
            if (jsonMatch) {
              ratingData = JSON.parse('{' + jsonMatch[1] + '}');
            }
          } catch (e) {
            // Continuar
          }
        }
      }

      // Processar os dados encontrados
      if (ratingData) {
        // Extrair average e total (pode estar em diferentes formatos)
        let average = null;
        let total = 0;

        if (ratingData.average !== undefined) {
          average = parseFloat(ratingData.average);
        } else if (ratingData.avg !== undefined) {
          average = parseFloat(ratingData.avg);
        } else if (ratingData.rating !== undefined) {
          average = parseFloat(ratingData.rating);
        } else if (ratingData.rate !== undefined) {
          average = parseFloat(ratingData.rate);
        }

        if (ratingData.total !== undefined) {
          total = parseInt(ratingData.total);
        } else if (ratingData.count !== undefined) {
          total = parseInt(ratingData.count);
        } else if (ratingData.reviews_count !== undefined) {
          total = parseInt(ratingData.reviews_count);
        }

        // Se temos rate1, rate2, etc, calcular average
        if (!average && (ratingData.rate1 || ratingData.rate2 || ratingData.rate3 || ratingData.rate4 || ratingData.rate5)) {
          const rates = {
            1: parseInt(ratingData.rate1) || 0,
            2: parseInt(ratingData.rate2) || 0,
            3: parseInt(ratingData.rate3) || 0,
            4: parseInt(ratingData.rate4) || 0,
            5: parseInt(ratingData.rate5) || 0
          };
          
          total = rates[1] + rates[2] + rates[3] + rates[4] + rates[5];
          
          if (total > 0) {
            const weightedSum = (rates[1] * 1) + (rates[2] * 2) + (rates[3] * 3) + (rates[4] * 4) + (rates[5] * 5);
            average = weightedSum / total;
          }
        }

        if (average && average > 0) {
          console.log(`✅ Ratings encontrados para ${shopifyProductId}: ${average.toFixed(2)} estrelas (${total} avaliações)`);
          return {
            average: parseFloat(average.toFixed(2)),
            total: total,
            rate1: parseInt(ratingData.rate1) || 0,
            rate2: parseInt(ratingData.rate2) || 0,
            rate3: parseInt(ratingData.rate3) || 0,
            rate4: parseInt(ratingData.rate4) || 0,
            rate5: parseInt(ratingData.rate5) || 0,
          };
        }
      }

      // Se não encontrou nada, logar um pedaço do HTML para debug (primeiras 5000 chars)
      console.log(`⚠️ Ratings não encontrados para o produto ${shopifyProductId}`);
      console.log(`🔍 Primeiros 5000 caracteres do HTML para debug:`);
      console.log(html.substring(0, 5000));
      
      return null;
    } catch (error) {
      console.error(`❌ Erro ao buscar ratings do produto ${shopifyProductId}:`, error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   URL: ${error.response.config?.url}`);
      }
      return null;
    }
  }

  // Mapear produto do Shopify para formato do app
  mapProductToApp(shopifyProduct, ratings = null) {
    if (!shopifyProduct.variants || shopifyProduct.variants.length === 0) {
      return null; // Produto sem variantes, pular
    }
    
    const variant = shopifyProduct.variants[0]; // Usar primeira variante
    const tags = shopifyProduct.tags ? shopifyProduct.tags.split(',').map(tag => tag.trim()) : [];
    
    // Usar categoria da collection se disponível, senão usar mapeamento por palavras-chave
    let categoria;
    if (shopifyProduct._app_category) {
      categoria = shopifyProduct._app_category;
    } else {
      categoria = this.mapCategory(shopifyProduct.product_type, tags, shopifyProduct.title);
    }
    
    // Extrair todas as URLs de imagens
    const imagens = shopifyProduct.images && shopifyProduct.images.length > 0
      ? shopifyProduct.images.map(img => img.src)
      : [];
    
    // Log para debug
    if (shopifyProduct.id) {
      console.log(`🖼️ [mapProductToApp] Produto ${shopifyProduct.id} (${shopifyProduct.title}): ${imagens.length} imagens encontradas`);
      if (imagens.length > 0) {
        console.log(`   Imagens: ${imagens.slice(0, 3).map(img => img.substring(0, 60) + '...').join(', ')}${imagens.length > 3 ? ` (+${imagens.length - 3} mais)` : ''}`);
      }
    }
    
    const mappedProduct = {
      codigo: shopifyProduct.id.toString(),
      nome: shopifyProduct.title,
      categoria: categoria,
      preco_varejo: parseFloat(variant.price),
      preco_atacado: parseFloat(variant.price) * 0.90, // 10% desconto
      preco_exclusivo: parseFloat(variant.price) * 0.85, // 15% desconto
      descricao: shopifyProduct.body_html ? 
        shopifyProduct.body_html.replace(/<[^>]*>/g, '') : '', // Remove HTML tags
      imagem_url: imagens.length > 0 ? imagens[0] : null, // Manter compatibilidade
      imagens: imagens, // Array com todas as imagens
      estoque: variant.inventory_quantity || 0,
      disponivel: shopifyProduct.status === 'active',
      tags: shopifyProduct.tags,
      sku: variant.sku || null, // SKU do produto
      barcode: variant.barcode || null, // Código de barras (EAN/UPC)
      created_at: new Date(),
      updated_at: new Date()
    };

    // Adicionar ratings se disponíveis
    if (ratings) {
      mappedProduct.rating_average = ratings.average || null;
      mappedProduct.rating_total = ratings.total || 0;
    } else if (shopifyProduct.rating_average !== undefined) {
      // Se ratings vierem direto do produto (futuro)
      mappedProduct.rating_average = shopifyProduct.rating_average;
      mappedProduct.rating_total = shopifyProduct.rating_total || 0;
    }

    return mappedProduct;
  }

  // Mapear categoria do Shopify para categoria do app
  mapCategory(productType, tags = [], title = '') {
    const productTypeLower = (productType || '').toLowerCase();
    const tagsLower = tags.map(tag => tag.toLowerCase());
    const titleLower = (title || '').toLowerCase();
    
    // 1. PRIORIDADE: Mapear por TAGS (mais confiável)
    const tagCategoryMap = {
      'utilidades': 'Casa',
      'utensilios': 'Casa', 
      'utensílios': 'Casa',
      'casa': 'Casa',
      'cozinha': 'Casa',
      'limpeza': 'Casa',
      'organizacao': 'Casa',
      'organização': 'Casa',
      'ferramentas': 'Casa',
      'decoracao': 'Casa',
      'decoração': 'Casa',
      'cama': 'Casa',
      'mesa': 'Casa',
      'banho': 'Casa',
      'toalha': 'Casa',
      'lençol': 'Casa',
      'travesseiro': 'Casa',
      'cortina': 'Casa',
      'tapete': 'Casa',
      'luminarias': 'Casa',
      'luminárias': 'Casa',
      'led': 'Casa',
      'eletro': 'Casa',
      'eletrodomesticos': 'Casa',
      'eletrodomésticos': 'Casa',
      'variedades': 'Casa',
      'vidro': 'Casa',
      'cristal': 'Casa',
      'porcelana': 'Casa',
      'ceramica': 'Casa',
      'cerâmica': 'Casa',
      
      'beleza': 'Beleza',
      'cosmeticos': 'Beleza',
      'cosméticos': 'Beleza',
      'perfumes': 'Beleza',
      'higiene': 'Beleza',
      'cuidados': 'Beleza',
      'maquiagem': 'Beleza',
      'shampoo': 'Beleza',
      'condicionador': 'Beleza',
      
      'papelaria': 'Papelaria',
      'escolar': 'Papelaria',
      'caderno': 'Papelaria',
      'caneta': 'Papelaria',
      'lapis': 'Papelaria',
      'lápis': 'Papelaria',
      'mochila': 'Papelaria',
      'livro': 'Papelaria',
      'material': 'Papelaria',
      'escritorio': 'Papelaria',
      'escritório': 'Papelaria',
      
      'brinquedos': 'Brinquedos',
      'brinquedo': 'Brinquedos',
      'jogos': 'Brinquedos',
      'bonecos': 'Brinquedos',
      'carrinhos': 'Brinquedos',
      'infantil': 'Brinquedos',
      'puzzles': 'Brinquedos',
      'pelucias': 'Brinquedos',
      'pelúcias': 'Brinquedos',
      
      'tecnologia': 'Tecnologia',
      'eletronicos': 'Tecnologia',
      'eletrônicos': 'Tecnologia',
      'celular': 'Tecnologia',
      'smartphone': 'Tecnologia',
      'fone': 'Tecnologia',
      'carregador': 'Tecnologia',
      'cabo': 'Tecnologia',
      'tablet': 'Tecnologia',
      'notebook': 'Tecnologia',
      'computador': 'Tecnologia',
      
      'pet': 'Pets',
      'animais': 'Pets',
      'cachorro': 'Pets',
      'gato': 'Pets',
      'racao': 'Pets',
      'ração': 'Pets',
      'coleira': 'Pets',
      'casinha': 'Pets'
    };
    
    // Buscar por tags primeiro
    for (const tag of tagsLower) {
      for (const [keyword, category] of Object.entries(tagCategoryMap)) {
        if (tag.includes(keyword)) {
          return category;
        }
      }
    }
    
    // 2. FALLBACK: Mapear por título do produto
    const titleKeywords = {
      'Beleza': ['beleza', 'cosmeticos', 'perfumes', 'higiene', 'cuidados', 'maquiagem', 'shampoo', 'condicionador'],
      'Papelaria': ['papelaria', 'escolar', 'caderno', 'caneta', 'lapis', 'mochila', 'livro', 'material'],
      'Casa': ['casa', 'cozinha', 'limpeza', 'organizacao', 'utilidades', 'utensilios', 'decoracao', 'cama', 'mesa', 'banho', 'panela', 'abajur', 'lampada', 'acendedor', 'fogao'],
      'Brinquedos': ['brinquedos', 'brinquedo', 'jogos', 'bonecos', 'carrinhos', 'infantil', 'puzzles', 'pelucias'],
      'Tecnologia': ['tecnologia', 'eletronicos', 'celular', 'smartphone', 'fone', 'carregador', 'cabo', 'tablet', 'notebook'],
      'Pets': ['pet', 'animais', 'cachorro', 'gato', 'racao', 'coleira', 'brinquedos pet', 'casinha']
    };
    
    for (const [category, keywords] of Object.entries(titleKeywords)) {
      for (const keyword of keywords) {
        if (titleLower.includes(keyword)) {
          return category;
        }
      }
    }
    
    // 3. FALLBACK: Mapear por tipo de produto
    for (const [keyword, category] of Object.entries(tagCategoryMap)) {
      if (productTypeLower.includes(keyword)) {
        return category;
      }
    }
    
    // Categoria padrão
    return 'Casa';
  }

  // Sincronizar todos os produtos (sempre todos, sem filtro de coleções)
  async syncAllProducts(db, collectionId = null, options = {}) {
    try {
      let shopifyProducts;
      
      if (collectionId) {
        console.log('🔄 Iniciando sincronização com Shopify...');
        console.log(`📋 Modo: Coleção específica (ID: ${collectionId})`);
        
        // Buscar produtos apenas da coleção especificada
        shopifyProducts = await this.getProductsByCollection(collectionId, options);
        console.log(`📦 Total de produtos encontrados na coleção: ${shopifyProducts.length}`);
      } else {
        console.log('🔄 Iniciando sincronização com Shopify...');
        console.log('📋 Modo: Todos os produtos (sem filtro de coleções)');
        
        // Buscar todos os produtos diretamente, sem filtrar por coleção
        shopifyProducts = await this.getAllProductsDirect();
        console.log(`📦 Total de produtos encontrados: ${shopifyProducts.length}`);
      }
      
      let syncedCount = 0;
      let updatedCount = 0;
      
      // Processar em lotes para melhor performance
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < shopifyProducts.length; i += batchSize) {
        batches.push(shopifyProducts.slice(i, i + batchSize));
      }
      
      console.log(`📦 Processando ${batches.length} lotes de até ${batchSize} produtos cada...`);
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const progress = ((batchIndex + 1) / batches.length * 100).toFixed(1);
        console.log(`🔄 [${progress}%] Processando lote ${batchIndex + 1}/${batches.length} (${batch.length} produtos)...`);
        
        // Buscar todos os códigos do lote de uma vez
        const codigos = batch.map(p => this.mapProductToApp(p).codigo);
        const existingProducts = await db.query(
          'SELECT codigo FROM melhor_casas_products WHERE codigo = ANY($1)',
          [codigos]
        );
        const existingCodigos = new Set(existingProducts.rows.map(r => r.codigo));
        
        const toInsert = [];
        const toUpdate = [];
        
        for (const shopifyProduct of batch) {
          const mappedProduct = this.mapProductToApp(shopifyProduct);
          
          if (!mappedProduct) {
            continue;
          }
          
          // Log detalhado para produtos com múltiplas imagens
          if (mappedProduct.imagens && mappedProduct.imagens.length > 1) {
            console.log(`🖼️ [syncAllProducts] Produto ${mappedProduct.codigo} (${mappedProduct.nome}): ${mappedProduct.imagens.length} imagens serão salvas`);
          }
          
          if (existingCodigos.has(mappedProduct.codigo)) {
            toUpdate.push(mappedProduct);
          } else {
            toInsert.push(mappedProduct);
          }
        }
        
        // Inserir novos produtos em batch usando INSERT múltiplo
        if (toInsert.length > 0) {
          // Inserir em grupos menores para evitar query muito grande
          const insertBatchSize = 20;
          for (let i = 0; i < toInsert.length; i += insertBatchSize) {
            const insertBatch = toInsert.slice(i, i + insertBatchSize);
            const values = insertBatch.map((p, idx) => {
              const baseIdx = idx * 16;
              return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13}, $${baseIdx + 14}, $${baseIdx + 15}, $${baseIdx + 16})`;
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
              JSON.stringify(p.imagens || []), // Array de imagens
              p.estoque,
              p.disponivel,
              JSON.stringify(p.tags),
              p.created_at,
              p.updated_at,
              p.sku || null,
              p.barcode || null
            ]);
            
            await db.query(`
              INSERT INTO melhor_casas_products 
              (codigo, nome, categoria, preco_varejo, preco_atacado, 
               preco_exclusivo, descricao, imagem_url, imagens, estoque, 
               disponivel, tags, created_at, updated_at, sku, barcode)
              VALUES ${values}
              ON CONFLICT (codigo) DO NOTHING
            `, params);
          }
        }
        syncedCount += toInsert.length;
        
        // Atualizar produtos existentes em batch
        if (toUpdate.length > 0) {
          for (const mappedProduct of toUpdate) {
            await db.query(`
              UPDATE melhor_casas_products 
              SET nome = $1, categoria = $2, preco_varejo = $3, 
                  preco_atacado = $4, preco_exclusivo = $5, 
                  descricao = $6, imagem_url = $7, imagens = $8, estoque = $9, 
                  disponivel = $10, tags = $11, updated_at = $12, sku = $13, barcode = $14
              WHERE codigo = $15
            `, [
              mappedProduct.nome,
              mappedProduct.categoria,
              mappedProduct.preco_varejo,
              mappedProduct.preco_atacado,
              mappedProduct.preco_exclusivo,
              mappedProduct.descricao,
              mappedProduct.imagem_url,
              JSON.stringify(mappedProduct.imagens || []), // Array de imagens
              mappedProduct.estoque,
              mappedProduct.disponivel,
              JSON.stringify(mappedProduct.tags),
              mappedProduct.updated_at,
              mappedProduct.sku || null,
              mappedProduct.barcode || null,
              mappedProduct.codigo
            ]);
          }
        }
        updatedCount += toUpdate.length;
        
        console.log(`✅ Lote ${batchIndex + 1} concluído: +${toInsert.length} novos, ~${toUpdate.length} atualizados`);
      }
      
      console.log(`✅ Sincronização concluída!`);
      console.log(`📊 Novos produtos: ${syncedCount}`);
      console.log(`🔄 Produtos atualizados: ${updatedCount}`);
      
      return {
        success: true,
        total: shopifyProducts.length,
        synced: syncedCount,
        updated: updatedCount
      };
      
    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
      throw error;
    }
  }

  // Processar webhook de produto
  async processProductWebhook(webhookData, db) {
    try {
      const { id, title, body_html, product_type, status, variants, images, tags } = webhookData;
      const variant = variants[0];
      
      // Extrair todas as URLs de imagens
      const imagens = images && images.length > 0
        ? images.map(img => img.src)
        : [];
      
      const mappedProduct = {
        codigo: id.toString(),
        nome: title,
        categoria: this.mapCategory(product_type),
        preco_varejo: parseFloat(variant.price),
        preco_atacado: parseFloat(variant.price) * 0.90,
        preco_exclusivo: parseFloat(variant.price) * 0.85,
        descricao: body_html ? body_html.replace(/<[^>]*>/g, '') : '',
        imagem_url: imagens.length > 0 ? imagens[0] : null, // Manter compatibilidade
        imagens: imagens, // Array com todas as imagens
        estoque: variant.inventory_quantity || 0,
        disponivel: status === 'active',
        tags: tags,
        updated_at: new Date()
      };

      // Verificar se produto existe
      const existingProduct = await db.query(
        'SELECT id FROM melhor_casas_products WHERE codigo = $1',
        [mappedProduct.codigo]
      );

      if (existingProduct.rows.length > 0) {
        // Atualizar produto existente
        await db.query(`
          UPDATE melhor_casas_products 
          SET nome = $1, categoria = $2, preco_varejo = $3, 
              preco_atacado = $4, preco_exclusivo = $5, 
              descricao = $6, imagem_url = $7, imagens = $8, estoque = $9, 
              disponivel = $10, tags = $11, updated_at = $12
          WHERE codigo = $13
        `, [
          mappedProduct.nome,
          mappedProduct.categoria,
          mappedProduct.preco_varejo,
          mappedProduct.preco_atacado,
          mappedProduct.preco_exclusivo,
          mappedProduct.descricao,
          mappedProduct.imagem_url,
          JSON.stringify(mappedProduct.imagens || []), // Array de imagens
          mappedProduct.estoque,
          mappedProduct.disponivel,
          JSON.stringify(mappedProduct.tags),
          mappedProduct.updated_at,
          mappedProduct.codigo
        ]);
        console.log(`🔄 Produto atualizado via webhook: ${mappedProduct.nome}`);
      } else {
        // Inserir novo produto
        await db.query(`
          INSERT INTO melhor_casas_products 
          (codigo, nome, categoria, preco_varejo, preco_atacado, 
           preco_exclusivo, descricao, imagem_url, imagens, estoque, 
           disponivel, tags, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          mappedProduct.codigo,
          mappedProduct.nome,
          mappedProduct.categoria,
          mappedProduct.preco_varejo,
          mappedProduct.preco_atacado,
          mappedProduct.preco_exclusivo,
          mappedProduct.descricao,
          mappedProduct.imagem_url,
          JSON.stringify(mappedProduct.imagens || []), // Array de imagens
          mappedProduct.estoque,
          mappedProduct.disponivel,
          JSON.stringify(mappedProduct.tags),
          new Date(),
          mappedProduct.updated_at
        ]);
        console.log(`➕ Novo produto adicionado via webhook: ${mappedProduct.nome}`);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error);
      throw error;
    }
  }

  // Criar checkout/carrinho no Shopify
  async createCheckout(items, customerInfo = null) {
    try {
      // Criar um Draft Order no Shopify (mais flexível para apps)
      const lineItems = items.map(item => ({
        variant_id: item.variant_id || item.product_id, // ID da variante do produto
        quantity: item.quantity,
        price: item.price || undefined, // Preço customizado se necessário
        title: item.title || undefined,
        product_id: item.shopify_product_id || undefined
      }));

      const draftOrderData = {
        draft_order: {
          line_items: lineItems,
          use_customer_default_address: true
        }
      };

      // Se tiver informações do cliente, adicionar
      if (customerInfo) {
        if (customerInfo.email) {
          draftOrderData.draft_order.email = customerInfo.email;
        }
        if (customerInfo.phone) {
          draftOrderData.draft_order.phone = customerInfo.phone;
        }
        if (customerInfo.first_name || customerInfo.last_name) {
          draftOrderData.draft_order.shipping_address = {
            first_name: customerInfo.first_name || '',
            last_name: customerInfo.last_name || '',
            address1: customerInfo.address1 || '',
            city: customerInfo.city || '',
            province: customerInfo.province || '',
            country: customerInfo.country || 'BR',
            zip: customerInfo.zip || ''
          };
        }
      }

      const response = await this.client.post('/draft_orders.json', draftOrderData);
      const draftOrder = response.data.draft_order;

      console.log('✅ Draft Order criado no Shopify:', draftOrder.id);
      return draftOrder;
    } catch (error) {
      console.error('❌ Erro ao criar checkout no Shopify:', error.response?.data || error.message);
      throw error;
    }
  }

  // Converter Draft Order em Order completo
  async completeDraftOrder(draftOrderId) {
    try {
      // Primeiro, completar o draft order
      const completeResponse = await this.client.put(
        `/draft_orders/${draftOrderId}/complete.json`,
        { draft_order: { id: draftOrderId } }
      );

      const completedDraft = completeResponse.data.draft_order;
      
      // Se o draft order foi convertido em order, retornar o order_id
      if (completedDraft.order_id) {
        // Buscar o order completo
        const orderResponse = await this.client.get(`/orders/${completedDraft.order_id}.json`);
        return orderResponse.data.order;
      }

      return completedDraft;
    } catch (error) {
      console.error('❌ Erro ao completar draft order:', error.response?.data || error.message);
      throw error;
    }
  }

  // Criar order diretamente no Shopify
  // Calcular opções de frete usando API do Shopify
  async calculateShippingRates(lineItems, shippingAddress) {
    try {
      if (shippingAddress?.delivery_type === 'pickup') {
        return [
          {
            title: 'Retirada na loja',
            service: 'Retirada na loja',
            price: '0.00',
            code: 'pickup',
            source: 'store_pickup',
            delivery_days: 2,
            description: 'Melhor das Casas - Centro (disponível em 2-4 dias)',
            deadline: '2 a 4 dias úteis',
          },
        ].map((rate) => this.normalizeRate(rate));
      }

      try {
        const checkoutRates = await this.getShippingRatesFromCheckout(
          lineItems,
          shippingAddress
        );
        if (
          checkoutRates &&
          checkoutRates.length > 0 &&
          checkoutRates.some((r) => parseFloat(r.price) > 0)
        ) {
          console.log(`✅ ${checkoutRates.length} opções de frete via checkout público`);
          return checkoutRates.map((rate) => this.normalizeRate(rate));
        }
      } catch (checkoutError) {
        // Se for rate limit (429), pular direto para fallback sem tentar retry
        if (checkoutError.response?.status === 429) {
          console.warn('⚠️ Rate limit da API pública do Shopify, usando fallback (shipping zones)');
        } else {
          console.error(
            '⚠️ Erro ao obter frete via checkout público:',
            checkoutError.message
          );
        }
      }

      console.log('📦 Calculando frete usando shipping zones...');
      const rates = await this.getShippingRatesFromZones(shippingAddress, lineItems);

      if (rates.length > 0 && rates.some((r) => parseFloat(r.price) > 0)) {
        console.log(`✅ ${rates.length} opções de frete encontradas`);
        return rates.map((rate) => this.normalizeRate(rate));
      }

      console.log('⚠️ Nenhum rate válido encontrado');
      return [];
    } catch (error) {
      console.error('❌ Erro ao calcular frete:', error.message);
      return [];
    }
  }

  async getShippingRatesFromCheckout(lineItems, shippingAddress) {
    try {
      if (!lineItems?.length) {
        throw new Error('Nenhum item informado para calcular frete');
      }

      const zip = (shippingAddress.zip || '').replace(/\D/g, '');
      if (!zip) {
        throw new Error('CEP inválido para cálculo de frete');
      }

      const client = axios.create({
        baseURL: this.storefrontBaseUrl,
        timeout: 20000,
        headers: {
          'User-Agent': 'MelhorDasCasasAppBot/1.0',
          Accept: 'application/json',
        },
      });

      const cookies = {};
      const storeCookies = (cookieHeaders = []) => {
        cookieHeaders.forEach((cookieStr) => {
          if (!cookieStr) return;
          const [pair] = cookieStr.split(';');
          if (!pair) return;
          const [name, ...rest] = pair.split('=');
          if (!name) return;
          cookies[name.trim()] = rest.join('=');
        });
      };
      const getCookieHeader = () =>
        Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');

      try {
        const initial = await client.get('/', {
          headers: { Cookie: getCookieHeader() },
        });
        storeCookies(initial.headers['set-cookie']);
      } catch (err) {
        console.warn('⚠️ Não foi possível obter cookies iniciais:', err.message);
      }

      // Não limpar o carrinho para evitar rate limiting (429)
      // O Shopify vai gerenciar os itens automaticamente

      for (const item of lineItems) {
        const params = new URLSearchParams();
        params.append('id', item.variant_id);
        params.append('quantity', item.quantity);

        try {
          const addResponse = await client.post('/cart/add.js', params, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Accept: 'application/json',
              Cookie: getCookieHeader(),
            },
          });
          storeCookies(addResponse.headers['set-cookie']);
          
          // Delay entre requisições para evitar rate limiting
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
          // Se der 429, lançar erro para pular para fallback
          if (err.response?.status === 429) {
            throw new Error('Rate limit atingido ao adicionar itens ao carrinho');
          }
          // Outros erros podem ser ignorados, o carrinho pode já ter os itens
          console.warn('⚠️ Erro ao adicionar item ao carrinho:', err.message);
        }
      }

      const query = new URLSearchParams();
      query.append('shipping_address[zip]', zip);
      query.append('shipping_address[country]', shippingAddress.country || 'BR');
      query.append('shipping_address[province]', shippingAddress.province || '');
      query.append('shipping_address[city]', shippingAddress.city || '');
      query.append('shipping_address[address1]', shippingAddress.address1 || '');
      query.append('shipping_address[address2]', shippingAddress.address2 || '');

      // Aguardar um pouco antes de buscar os rates para garantir que o carrinho foi atualizado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const ratesResponse = await client.get(
        `/cart/shipping_rates.json?${query.toString()}`,
        {
          headers: {
            Accept: 'application/json',
            Cookie: getCookieHeader(),
          },
        }
      );

      const shippingRates = ratesResponse.data?.shipping_rates || [];

      if (!shippingRates.length) {
        return [];
      }

      return shippingRates.map((rate) => {
        const serviceName = rate.name || rate.presentment_name || 'Frete';
        const priceValue =
          typeof rate.price === 'string'
            ? parseFloat(rate.price.replace(',', '.'))
            : rate.price || rate.price_in_cents / 100 || 0;
        const deliveryText =
          this.extractDeadlineFromText(
            `${rate.presentment_name || ''} ${serviceName}`
          ) || this.formatDeliveryRange(rate.delivery_range);

        return this.normalizeRate({
          title: serviceName,
          service: serviceName,
          price: Number(priceValue || 0)
            .toFixed(2)
            .toString(),
          code: rate.code || '',
          source: 'checkout_public',
          delivery_days: rate.delivery_range
            ? rate.delivery_range.max
            : this.estimateDeliveryDays(serviceName),
          description: rate.description || rate.phone || '',
          deadline: deliveryText,
        });
      });
      } catch (error) {
        // Deixar o erro propagar para ser tratado no catch externo
        throw error;
      }
  }

  formatDeliveryRange(range) {
    if (!range) return null;
    if (Array.isArray(range) && range.length >= 1) {
      const [start, end] = range;
      const startDate = start ? new Date(start) : null;
      const endDate = end ? new Date(end) : null;
      if (startDate && endDate) {
        const diffDays = Math.ceil(
          Math.abs(endDate - startDate) / (1000 * 60 * 60 * 24)
        );
        if (diffDays > 0) {
          return diffDays === 1 ? '1 dia útil' : `${diffDays} dias úteis`;
        }
      }
    } else if (typeof range === 'object') {
      const min = range.min ? Number(range.min) : null;
      const max = range.max ? Number(range.max) : null;
      if (min && max) {
        return min === max
          ? `${max} dias úteis`
          : `${min} - ${max} dias úteis`;
      }
      if (max) return `${max} dias úteis`;
      if (min) return `${min} dias úteis`;
    }
    return null;
  }

  extractDeadlineFromText(text = '') {
    const regexes = [
      /(\d+\s*(?:a\s*\d+\s*)?dias?\s+úteis?)/i,
      /(\d+\s*dia\s+útil)/i,
      /(\d+\s*(?:a\s*\d+\s*)?dias?)/i,
    ];
    for (const regex of regexes) {
      const match = text.match(regex);
      if (match) {
        let extracted = match[0].trim();
        if (!/útil/i.test(extracted)) {
          if (/dia/i.test(extracted) && !/dias/i.test(extracted)) {
            extracted = `${extracted} útil`;
          } else {
            extracted = `${extracted} úteis`;
          }
        }
        return extracted.replace(/\s+/g, ' ');
      }
    }
    return null;
  }

  normalizeRate(rate) {
    const serviceName = rate.service || rate.title || rate.name || 'Frete';
    let priceValue =
      typeof rate.price === 'string'
        ? parseFloat(rate.price.replace(',', '.'))
        : parseFloat(rate.price);
    if (!Number.isFinite(priceValue)) {
      priceValue = 0;
    }
    const deadlineText =
      rate.deadline ||
      (rate.delivery_days ? `${rate.delivery_days} dias úteis` : null);

    return {
      ...rate,
      title: serviceName,
      service: serviceName,
      price: priceValue.toFixed(2),
      description: deadlineText || rate.description || '',
      deadline: deadlineText || '',
    };
  }

  // Método antigo (removido - usando apenas API)
  async calculateShippingRatesOld(lineItems, shippingAddress) {
    try {
      // Criar um draft order temporário para calcular frete
      const draftOrderData = {
        draft_order: {
          line_items: lineItems.map(item => ({
            variant_id: item.variant_id,
            quantity: item.quantity
          })),
          shipping_address: {
            first_name: shippingAddress.first_name || 'Test',
            last_name: shippingAddress.last_name || 'User',
            address1: shippingAddress.address1 || '',
            address2: shippingAddress.address2 || '',
            city: shippingAddress.city || '',
            province: shippingAddress.province || '',
            country: shippingAddress.country || 'BR',
            zip: shippingAddress.zip || '',
            phone: shippingAddress.phone || ''
          },
          use_customer_default_address: false
        }
      };

      // Buscar shipping rates das zonas de frete
      const rates = await this.getShippingRatesFromZones(shippingAddress, lineItems);
      
      // Se não encontrou, calcular por peso
      if (rates.length === 0) {
        return await this.calculateShippingRatesByWeight(lineItems, shippingAddress);
      }
      
      return rates;
    } catch (error) {
      console.error('❌ Erro ao calcular frete:', error.response?.data || error.message);
      throw error;
    }
  }

  // Calcular frete baseado em peso e valor usando shipping zones
  async calculateShippingRatesByWeight(lineItems, shippingAddress) {
    try {
      // Buscar informações dos produtos para calcular peso total e valor
      let totalWeight = 0;
      let totalValue = 0;
      const variantWeights = {};

      for (const item of lineItems) {
        try {
          // Buscar variante no Shopify para obter peso
          const variantResponse = await this.client.get(`/variants/${item.variant_id}.json`);
          const variant = variantResponse.data.variant;
          
          const weight = parseFloat(variant.weight || 0) / 1000; // Converter para kg
          const price = parseFloat(variant.price || 0);
          
          totalWeight += weight * item.quantity;
          totalValue += price * item.quantity;
          variantWeights[item.variant_id] = { weight, price };
        } catch (error) {
          console.error(`Erro ao buscar variante ${item.variant_id}:`, error.message);
          // Usar valores padrão se não conseguir buscar
          totalWeight += 0.5 * item.quantity; // 500g por item padrão
        }
      }

      // Buscar shipping zones e calcular rates
      const zonesResponse = await this.client.get('/shipping_zones.json');
      const zones = zonesResponse.data.shipping_zones || [];
      let rates = [];

      for (const zone of zones) {
        const isInZone = this.checkAddressInZone(shippingAddress, zone);
        if (!isInZone) continue;

        // Processar carrier-calculated rates (SEDEX, PAC, etc.)
        for (const rate of zone.carrier_shipping_rate_providers || []) {
          // Pular se não estiver ativo
          if (!rate.active && rate.active !== undefined) continue;
          
          // Identificar tipo de frete pelo nome ou tipo
          const rateName = rate.name || rate.carrier_service_type || '';
          let title = 'Frete';
          let estimatedPrice = '0.00';
          
          // Mapear tipos conhecidos
          if (rateName.toLowerCase().includes('sedex') || rate.carrier_service_type?.toLowerCase().includes('sedex')) {
            title = 'SEDEX';
            estimatedPrice = '39.74'; // Valor aproximado
          } else if (rateName.toLowerCase().includes('pac') || rate.carrier_service_type?.toLowerCase().includes('pac')) {
            title = 'PAC';
            estimatedPrice = '47.17'; // Valor aproximado
          } else if (rateName.toLowerCase().includes('expresso') || rateName.toLowerCase().includes('express')) {
            title = 'Frete Expresso';
            estimatedPrice = '50.00';
          } else if (rateName) {
            title = rateName;
          }
          
          rates.push({
            title: title,
            price: estimatedPrice,
            code: rate.carrier_service_type || rate.code || '',
            source: 'shopify_carrier',
            delivery_days: this.estimateDeliveryDays(shippingAddress, title),
            requires_calculation: true,
            carrier_type: rate.carrier_service_type
          });
        }

        // Processar weight-based rates
        for (const rate of zone.weight_based_shipping_rates || []) {
          let ratePrice = parseFloat(rate.price || 0);
          
          // Se tem weight_range, calcular baseado no peso
          if (rate.weight_range && totalWeight > 0) {
            // Calcular preço baseado no peso
            const minWeight = parseFloat(rate.weight_range.min || 0);
            const maxWeight = parseFloat(rate.weight_range.max || 999999);
            
            if (totalWeight >= minWeight && totalWeight <= maxWeight) {
              ratePrice = parseFloat(rate.price || 0);
            }
          }

          rates.push({
            title: rate.name || 'Frete',
            price: ratePrice.toFixed(2),
            code: rate.code || '',
            source: 'shopify_weight',
            delivery_days: this.estimateDeliveryDays(shippingAddress)
          });
        }

        // Processar price-based rates
        for (const rate of zone.price_based_shipping_rates || []) {
          let ratePrice = parseFloat(rate.price || 0);
          
          // Se tem min_order_subtotal, verificar se aplica
          if (rate.min_order_subtotal && totalValue < parseFloat(rate.min_order_subtotal)) {
            continue;
          }

          rates.push({
            title: rate.name || 'Frete',
            price: ratePrice.toFixed(2),
            code: rate.code || '',
            source: 'shopify_price',
            delivery_days: this.estimateDeliveryDays(shippingAddress)
          });
        }
      }

      return rates.length > 0 ? rates : this.getDefaultShippingRates();
    } catch (error) {
      console.error('Erro ao calcular frete por peso:', error.response?.data || error.message);
      return this.getDefaultShippingRates();
    }
  }

  // Retornar opções padrão de frete
  getDefaultShippingRates() {
    return [
      {
        title: 'Frete Padrão',
        price: '15.00',
        code: 'standard',
        source: 'default',
        delivery_days: 5
      }
    ];
  }

  // Buscar shipping rates das zonas de frete configuradas
  async getShippingRatesFromZones(shippingAddress, lineItems = []) {
    try {
      // Buscar shipping zones da loja
      const zonesResponse = await this.client.get('/shipping_zones.json');
      const zones = zonesResponse.data.shipping_zones || [];

      let rates = [];

      for (const zone of zones) {
        // Verificar se o endereço está na zona
        const isInZone = this.checkAddressInZone(shippingAddress, zone);
        
        if (isInZone) {
          // Buscar carrier-calculated rates primeiro (SEDEX, PAC, etc.)
          // O Frenet retorna múltiplos serviços, precisamos buscar todos
          for (const rate of zone.carrier_shipping_rate_providers || []) {
            if (!rate.active && rate.active !== undefined) continue;
            
            // O Frenet pode ter múltiplos serviços em um provider
            // Verificar se tem serviços específicos
            const services = rate.services || [];
            
            if (services.length > 0) {
              // Frenet retorna serviços individuais (SEDEX, PAC, etc.)
              for (const service of services) {
                const serviceName = (service.name || service.code || '').trim();
                if (!serviceName) continue;
                
                let title = serviceName;
                // Padronizar nomes conhecidos
                if (serviceName.toLowerCase().includes('sedex')) {
                  title = 'SEDEX';
                } else if (serviceName.toLowerCase().includes('pac') && !serviceName.toLowerCase().includes('pack')) {
                  title = 'PAC';
                }
                
                console.log(`🔍 Serviço Frenet encontrado: ${title} (original: ${serviceName})`);
                
                rates.push({
                  title: title,
                  price: '0.00', // Será calculado abaixo
                  code: service.code || serviceName.toLowerCase(),
                  source: 'frenet',
                  delivery_days: this.estimateDeliveryDays(shippingAddress, title),
                  requires_calculation: true,
                  carrier_type: 'frenet',
                  service_code: service.code
                });
              }
            } else {
              // Se não tem serviços específicos, usar o nome do provider
              const rateName = (rate.name || rate.carrier_service_type || 'Frenet').trim();
              let title = rateName;
              
              // Identificar se é Frenet
              if (rateName.toLowerCase().includes('frenet') || rate.carrier_service_type?.toLowerCase().includes('frenet')) {
                // Frenet geralmente retorna SEDEX e PAC, mas precisamos calcular
                // Por enquanto, vamos adicionar ambos
                rates.push({
                  title: 'SEDEX',
                  price: '0.00',
                  code: 'sedex',
                  source: 'frenet',
                  delivery_days: this.estimateDeliveryDays(shippingAddress, 'SEDEX'),
                  requires_calculation: true,
                  carrier_type: 'frenet'
                });
                rates.push({
                  title: 'PAC',
                  price: '0.00',
                  code: 'pac',
                  source: 'frenet',
                  delivery_days: this.estimateDeliveryDays(shippingAddress, 'PAC'),
                  requires_calculation: true,
                  carrier_type: 'frenet'
                });
              } else {
                // Outros carriers
                const rateNameLower = rateName.toLowerCase();
                if (rateNameLower.includes('sedex')) {
                  title = 'SEDEX';
                } else if (rateNameLower.includes('pac') && !rateNameLower.includes('pack')) {
                  title = 'PAC';
                }
                
                console.log(`🔍 Carrier rate encontrado: ${title} (original: ${rateName}, tipo: ${rate.carrier_service_type})`);
                
                rates.push({
                  title: title,
                  price: '0.00',
                  code: rate.carrier_service_type || rate.code || '',
                  source: 'shopify_carrier',
                  delivery_days: this.estimateDeliveryDays(shippingAddress, title),
                  requires_calculation: true,
                  carrier_type: rate.carrier_service_type
                });
              }
            }
          }
          
          // Calcular preços para carrier rates se temos lineItems
          if (lineItems.length > 0) {
            const carrierRates = rates.filter(r => r.requires_calculation);
            if (carrierRates.length > 0) {
              const calculated = await this.calculateCarrierRates(lineItems, shippingAddress, carrierRates);
              // Substituir rates com requires_calculation
              const fixedRates = rates.filter(r => !r.requires_calculation);
              rates = [...fixedRates, ...calculated];
            }
          }

          // Não incluir weight-based e price-based rates
          // Apenas carrier rates (SEDEX, PAC) são calculados dinamicamente
        }
      }

      // Remover duplicatas e garantir que todos tenham preço calculado
      const uniqueRates = [];
      const seen = new Set();
      
      for (const rate of rates) {
        const key = rate.title;
        if (!seen.has(key) && rate.title !== 'Frete' && parseFloat(rate.price) > 0) {
          seen.add(key);
          uniqueRates.push(rate);
        }
      }

      // Se não encontrou rates válidos, retornar vazio
      if (uniqueRates.length === 0) {
        console.log('⚠️ Nenhum rate válido encontrado');
        return [];
      }

      return uniqueRates;
    } catch (error) {
      console.error('Erro ao buscar shipping zones:', error);
      // Retornar opções padrão em caso de erro
      return this.getDefaultShippingRates();
    }
  }

  // Verificar se endereço está na zona de frete
  checkAddressInZone(address, zone) {
    // Verificar países
    const countryMatch = zone.countries.some(country => 
      country.code === address.country || country.code === 'BR'
    );
    
    if (!countryMatch) return false;

    // Verificar províncias/estados
    if (zone.provinces && zone.provinces.length > 0) {
      const provinceMatch = zone.provinces.some(province => 
        province.code === address.province
      );
      if (!provinceMatch) return false;
    }

    return true;
  }

  // Calcular preços para carrier rates (SEDEX, PAC)
  async calculateCarrierRates(lineItems, shippingAddress, carrierRates) {
    try {
      console.log(`📊 Calculando preços REAIS do Frenet para ${carrierRates.length} carrier rates...`);
      
      // Método 1: Usar AJAX API assíncrona (recomendado para Frenet)
      try {
        const ajaxRates = await this.getShippingRatesFromAjaxAPI(lineItems, shippingAddress);
        
        if (ajaxRates && ajaxRates.length > 0) {
          console.log(`✅ AJAX API retornou ${ajaxRates.length} taxas do Frenet`);
          
          // Retornar TODAS as taxas do Frenet, não apenas as que correspondem aos carrier rates
          // Isso garante que todas as opções (Sedex, Jadlog, PAC, Total Points, Loggi) sejam retornadas
          const allRates = ajaxRates.map(shipping => {
            const price = parseFloat(shipping.price || 0).toFixed(2);
            const title = shipping.title || shipping.service || 'Frete';
            
            console.log(`💰 ${title}: R$ ${price} (valor real do Frenet via AJAX API)`);
            
            return {
              title: title,
              price: price,
              code: shipping.code || title.toLowerCase().replace(/\s+/g, '_'),
              source: 'frenet_ajax_api',
              delivery_days: shipping.delivery_days || null,
              requires_calculation: false
            };
          });
          
          return allRates;
        }
      } catch (ajaxError) {
        console.error('❌ Erro ao usar AJAX API:', ajaxError.message);
        console.log('🔄 Tentando Draft Order como fallback...');
      }
      
      // Método 2: Usar Draft Order como fallback
      try {
        const draftOrder = await this.createDraftOrderForShipping(lineItems, shippingAddress);
        
        if (draftOrder && draftOrder.shipping_lines && draftOrder.shipping_lines.length > 0) {
          console.log(`✅ Draft Order criado, ${draftOrder.shipping_lines.length} opções de frete encontradas`);
          
          // Mapear as taxas do draft order para os carrier rates
          const calculatedRates = carrierRates.map(rate => {
            // Procurar uma taxa correspondente no draft order
            const matchingShipping = draftOrder.shipping_lines.find(shipping => {
              const shippingTitle = (shipping.title || '').toLowerCase();
              const shippingCode = (shipping.code || '').toLowerCase();
              const rateTitle = (rate.title || '').toLowerCase();
              const rateCode = (rate.code || '').toLowerCase();
              
              // Verificar se o título ou código corresponde (SEDEX, PAC, etc.)
              return shippingTitle.includes(rateTitle) || 
                     rateTitle.includes(shippingTitle) ||
                     shippingCode.includes(rateCode) ||
                     rateCode.includes(shippingCode);
            });
            
            if (matchingShipping) {
              const price = parseFloat(matchingShipping.price || 0).toFixed(2);
              console.log(`💰 ${rate.title}: R$ ${price} (valor real do Frenet via Draft Order)`);
              
              return {
                ...rate,
                price: price,
                requires_calculation: false
              };
            } else {
              // Se não encontrou correspondência, manter como requires_calculation
              console.warn(`⚠️ Não encontrou taxa correspondente para ${rate.title}`);
              return rate;
            }
          });
          
          // Deletar o draft order após usar
          if (draftOrder.id) {
            try {
              await this.client.delete(`/draft_orders/${draftOrder.id}.json`);
              console.log(`🗑️ Draft Order ${draftOrder.id} deletado`);
            } catch (deleteError) {
              console.warn(`⚠️ Erro ao deletar draft order:`, deleteError.message);
            }
          }
          
          return calculatedRates;
        }
      } catch (draftError) {
        console.error('❌ Erro ao criar draft order:', draftError.message);
      }
      
      throw new Error('Não foi possível calcular taxas do Frenet');
      
    } catch (error) {
      console.error('❌ Erro ao calcular carrier rates:', error);
      throw error; // Não retornar valores genéricos, deixar o erro propagar
    }
  }

  /**
   * Obtém taxas de frete do Frenet usando AJAX API assíncrona
   * Usa /cart/prepare_shipping_rates.json e /cart/async_shipping_rates.json
   */
  async getShippingRatesFromAjaxAPI(lineItems, shippingAddress) {
    try {
      console.log('📦 Usando AJAX API para obter taxas do Frenet...');
      
      const client = axios.create({
        baseURL: this.storefrontBaseUrl,
        timeout: 30000,
        headers: {
          'User-Agent': 'MelhorDasCasasAppBot/1.0',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      });

      const cookies = {};
      const storeCookies = (cookieHeaders = []) => {
        cookieHeaders.forEach((cookieStr) => {
          if (!cookieStr) return;
          const [pair] = cookieStr.split(';');
          if (!pair) return;
          const [name, ...rest] = pair.split('=');
          if (!name) return;
          cookies[name.trim()] = rest.join('=');
        });
      };
      const getCookieHeader = () =>
        Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');

      // 1. Obter cookies iniciais
      try {
        const initial = await client.get('/', {
          headers: { Cookie: getCookieHeader() },
        });
        storeCookies(initial.headers['set-cookie']);
      } catch (err) {
        console.warn('⚠️ Não foi possível obter cookies iniciais:', err.message);
      }

      // 2. Adicionar itens ao carrinho
      for (const item of lineItems) {
        const params = new URLSearchParams();
        params.append('id', item.variant_id);
        params.append('quantity', item.quantity);

        try {
          const addResponse = await client.post('/cart/add.js', params, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Accept: 'application/json',
              Cookie: getCookieHeader(),
            },
          });
          storeCookies(addResponse.headers['set-cookie']);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.warn('⚠️ Erro ao adicionar item ao carrinho:', err.message);
        }
      }

      // 3. Preparar cálculo de frete (inicia cálculo assíncrono do Frenet)
      const prepareResponse = await client.post('/cart/prepare_shipping_rates.json', {
        shipping_address: {
          zip: shippingAddress.zip?.replace(/\D/g, '') || '',
          country: shippingAddress.country || shippingAddress.countryCode || 'BR',
          province: shippingAddress.province || '',
          city: shippingAddress.city || '',
          address1: shippingAddress.address1 || shippingAddress.street || '',
          address2: shippingAddress.address2 || '',
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
          Cookie: getCookieHeader(),
        },
      });
      
      storeCookies(prepareResponse.headers['set-cookie']);
      console.log('✅ Preparação de frete iniciada');

      // 4. Polling para obter taxas assíncronas (Frenet pode demorar alguns segundos)
      const maxAttempts = 10;
      const delayMs = 1500;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        try {
          const asyncResponse = await client.get('/cart/async_shipping_rates.json', {
            headers: {
              Accept: 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              Cookie: getCookieHeader(),
            },
          });
          
          const data = asyncResponse.data;
          
          if (data.shipping_rates && data.shipping_rates.length > 0) {
            console.log(`✅ Taxas do Frenet obtidas (tentativa ${attempt}/${maxAttempts})`);
            
            // Converter para formato esperado
            return data.shipping_rates.map((rate) => {
              const serviceName = rate.name || rate.presentment_name || 'Frete';
              const priceValue =
                typeof rate.price === 'string'
                  ? parseFloat(rate.price.replace(',', '.'))
                  : rate.price || (rate.price_in_cents / 100) || 0;
              
              // Extrair prazo de entrega
              let deliveryDays = null;
              if (rate.delivery_range) {
                if (rate.delivery_range.max) {
                  deliveryDays = rate.delivery_range.max;
                } else if (Array.isArray(rate.delivery_range) && rate.delivery_range.length > 0) {
                  deliveryDays = rate.delivery_range[rate.delivery_range.length - 1];
                }
              }
              
              // Tentar extrair de description ou outros campos
              if (!deliveryDays && rate.description) {
                const daysMatch = rate.description.match(/(\d+)\s*dia/i);
                if (daysMatch) {
                  deliveryDays = parseInt(daysMatch[1]);
                }
              }
              
              return {
                title: serviceName,
                service: serviceName,
                price: Number(priceValue || 0).toFixed(2),
                code: rate.code || '',
                source: 'frenet_ajax_api',
                delivery_days: deliveryDays,
                description: rate.description || '',
              };
            });
          } else if (data.status === 'calculating') {
            console.log(`⏳ Frenet ainda calculando... (tentativa ${attempt}/${maxAttempts})`);
            continue;
          } else {
            console.log(`⚠️ Status: ${data.status || 'unknown'}`);
            break;
          }
        } catch (pollError) {
          console.warn(`⚠️ Erro ao buscar taxas (tentativa ${attempt}):`, pollError.message);
          if (attempt === maxAttempts) {
            throw pollError;
          }
        }
      }
      
      throw new Error('Timeout ao aguardar cálculo do Frenet');
      
    } catch (error) {
      console.error('❌ Erro ao usar AJAX API:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Processa resposta multipart do GraphQL (@defer directive)
   */
  parseMultipartGraphQLResponse(multipartData) {
    try {
      console.log('🔍 Processando resposta multipart...');
      const parts = multipartData.split('--graphql');
      let mainData = null;
      let incrementalData = null;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part.trim()) continue;
        
        // Extrair JSON do part (pode estar após headers)
        const jsonMatch = part.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        
        try {
          const json = JSON.parse(jsonMatch[0]);
          
          // Primeira parte: dados principais
          if (json.data && !mainData) {
            mainData = json.data;
            console.log('✅ Dados principais extraídos');
          }
          
          // Segunda parte: dados incrementais (defer)
          if (json.incremental && json.incremental.length > 0) {
            incrementalData = json.incremental[0];
            console.log('✅ Dados incrementais extraídos:', JSON.stringify(incrementalData.path));
          }
        } catch (parseError) {
          console.warn(`⚠️ Erro ao parsear part ${i}:`, parseError.message);
        }
      }
      
      // Mesclar dados incrementais com dados principais
      if (mainData && incrementalData) {
        const path = incrementalData.path || [];
        const incremental = incrementalData.data || {};
        
        console.log('🔗 Mesclando dados incrementais...');
        console.log('📍 Path:', path);
        console.log('📦 Dados incrementais:', JSON.stringify(incremental, null, 2));
        
        // Mesclar deliveryGroups para cartBuyerIdentityUpdate
        if (path.includes('cartBuyerIdentityUpdate') && path.includes('cart')) {
          if (mainData.cartBuyerIdentityUpdate?.cart) {
            mainData.cartBuyerIdentityUpdate.cart.deliveryGroups = incremental.deliveryGroups || {};
            console.log('✅ deliveryGroups mesclados com sucesso');
          }
        }
        
        // Mesclar deliveryGroups para getCart (path direto no cart)
        if (path.length === 1 && path[0] === 'cart') {
          if (mainData.cart) {
            mainData.cart.deliveryGroups = incremental.deliveryGroups || {};
            console.log('✅ deliveryGroups mesclados no cart');
          }
        }
        
        // Se incremental tem cart diretamente, mesclar
        if (incremental.cart) {
          if (mainData.cart) {
            Object.assign(mainData.cart, incremental.cart);
            console.log('✅ Dados incrementais mesclados no cart');
          } else {
            mainData.cart = incremental.cart;
            console.log('✅ Cart criado a partir de dados incrementais');
          }
        }
      }
      
      // IMPORTANTE: Retornar estrutura correta
      // Se mainData já tem estrutura aninhada desnecessária (ex: mainData.data.cart),
      // desembrulhar um nível
      if (mainData?.data) {
        // Se mainData já está no formato { data: {...} }, retornar diretamente
        return mainData;
      }
      
      // Caso contrário, retornar { data: mainData } para compatibilidade
      return {
        data: mainData || {},
        errors: null
      };
    } catch (error) {
      console.error('❌ Erro ao processar resposta multipart:', error.message);
      console.error('❌ Stack:', error.stack);
      return null;
    }
  }

  /**
   * Cria um Draft Order temporário para calcular taxas de frete do Frenet
   */
  async createDraftOrderForShipping(lineItems, shippingAddress) {
    try {
      console.log('📦 Criando Draft Order para calcular frete do Frenet...');
      
      // Preparar line items para o draft order
      const draftLineItems = [];
      for (const item of lineItems) {
        try {
          // Buscar variante completa
          const variantResponse = await this.client.get(`/variants/${item.variant_id}.json`);
          const variant = variantResponse.data.variant;
          
          draftLineItems.push({
            variant_id: variant.id,
            quantity: item.quantity,
            price: variant.price
          });
        } catch (e) {
          console.error(`⚠️ Erro ao buscar variante ${item.variant_id}:`, e.message);
        }
      }
      
      if (draftLineItems.length === 0) {
        throw new Error('Nenhum item válido para criar draft order');
      }
      
      // Criar draft order com endereço de entrega
      const draftOrderData = {
        draft_order: {
          line_items: draftLineItems,
          shipping_address: {
            address1: shippingAddress.address1 || shippingAddress.street || '',
            address2: shippingAddress.address2 || '',
            city: shippingAddress.city,
            province: shippingAddress.province,
            country: shippingAddress.country || shippingAddress.countryCode || 'BR',
            zip: shippingAddress.zip,
            phone: shippingAddress.phone || ''
          },
          use_customer_default_address: false
        }
      };
      
      const response = await this.client.post('/draft_orders.json', draftOrderData);
      const draftOrder = response.data.draft_order;
      
      console.log(`✅ Draft Order criado: ${draftOrder.id}`);
      console.log(`📦 Shipping lines encontradas: ${draftOrder.shipping_lines?.length || 0}`);
      
      // Se não retornou shipping_lines, tentar buscar novamente após um delay
      // (o Frenet pode precisar de tempo para calcular)
      if (!draftOrder.shipping_lines || draftOrder.shipping_lines.length === 0) {
        console.log('⏳ Aguardando cálculo do Frenet...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Buscar draft order atualizado
        const updatedResponse = await this.client.get(`/draft_orders/${draftOrder.id}.json`);
        const updatedDraftOrder = updatedResponse.data.draft_order;
        
        console.log(`📦 Shipping lines após delay: ${updatedDraftOrder.shipping_lines?.length || 0}`);
        
        if (updatedDraftOrder.shipping_lines && updatedDraftOrder.shipping_lines.length > 0) {
          return updatedDraftOrder;
        }
      }
      
      return draftOrder;
    } catch (error) {
      console.error('❌ Erro ao criar draft order:', error.response?.data || error.message);
      throw error;
    }
  }

  // Estimar dias de entrega baseado no endereço e tipo de frete
  estimateDeliveryDays(address, shippingType = '') {
    const shippingTypeLower = (shippingType || '').toLowerCase();
    
    // SEDEX é mais rápido
    if (shippingTypeLower.includes('sedex')) {
      const fastStates = ['RJ', 'SP', 'MG', 'ES'];
      return fastStates.includes(address.province) ? 1 : 3;
    }
    
    // PAC é mais lento
    if (shippingTypeLower.includes('pac')) {
      const fastStates = ['RJ', 'SP', 'MG', 'ES'];
      return fastStates.includes(address.province) ? 5 : 10;
    }
    
    // Lógica simples: estados próximos = menos dias
    const fastStates = ['RJ', 'SP', 'MG', 'ES'];
    if (fastStates.includes(address.province)) {
      return 3;
    }
    return 7;
  }

  async createOrder(items, customerInfo, shippingAddress, billingAddress = null, deliveryType = 'delivery', shippingRate = null, weddingListInfo = null) {
    try {
      const lineItems = items.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity
      }));

      const orderData = {
        order: {
          line_items: lineItems,
          financial_status: 'pending', // Será atualizado quando o pagamento for processado
          send_receipt: true,
          send_fulfillment_receipt: true
        }
      };

      // Adicionar informações do cliente
      if (customerInfo) {
        orderData.order.email = customerInfo.email;
        orderData.order.phone = customerInfo.phone;
        if (customerInfo.first_name || customerInfo.last_name) {
          orderData.order.customer = {
            first_name: customerInfo.first_name || '',
            last_name: customerInfo.last_name || '',
            email: customerInfo.email || ''
          };
        }
      }

      // Adicionar endereço de entrega (apenas se for entrega)
      if (deliveryType === 'delivery' && shippingAddress) {
        orderData.order.shipping_address = {
          first_name: shippingAddress.first_name || '',
          last_name: shippingAddress.last_name || '',
          address1: shippingAddress.address1 || '',
          address2: shippingAddress.address2 || '',
          city: shippingAddress.city || '',
          province: shippingAddress.province || '',
          country: shippingAddress.country || 'BR',
          zip: shippingAddress.zip || '',
          phone: shippingAddress.phone || ''
        };
      } else if (deliveryType === 'pickup') {
        // Para retirada, marcar como pickup
        orderData.order.fulfillment_status = 'unfulfilled';
        // Preservar nota existente (se houver informações de lista de casamento)
        if (!orderData.order.note) {
          orderData.order.note = 'Retirada na loja';
        } else {
          orderData.order.note = `${orderData.order.note}\n\nRetirada na loja`;
        }
      }

      // Adicionar shipping line (frete) se fornecido
      if (deliveryType === 'delivery' && shippingRate) {
        orderData.order.shipping_lines = [{
          title: shippingRate.title || 'Frete',
          price: shippingRate.price || '0.00',
          code: shippingRate.code || 'standard'
        }];
      }

      // Adicionar endereço de cobrança (se diferente)
      if (billingAddress) {
        orderData.order.billing_address = {
          first_name: billingAddress.first_name || '',
          last_name: billingAddress.last_name || '',
          address1: billingAddress.address1 || '',
          address2: billingAddress.address2 || '',
          city: billingAddress.city || '',
          province: billingAddress.province || '',
          country: billingAddress.country || 'BR',
          zip: billingAddress.zip || '',
          phone: billingAddress.phone || ''
        };
      }

      // Adicionar tags e note_attributes para listas de casamento (DEPOIS de todas as outras configurações)
      if (weddingListInfo) {
        console.log('🎁 [createOrder] Adicionando informações de lista de casamento ao pedido:', weddingListInfo);
        
        // Adicionar tag para fácil identificação no painel do Shopify
        orderData.order.tags = 'Lista de Casamento';
        
        // Adicionar note_attributes com informações detalhadas
        orderData.order.note_attributes = [
          {
            name: 'Lista de Casamento',
            value: 'Sim'
          },
          {
            name: 'ID da Lista',
            value: weddingListInfo.listId.toString()
          },
          {
            name: 'Nome da Lista',
            value: weddingListInfo.listName || 'N/A'
          },
          {
            name: 'Código de Compartilhamento',
            value: weddingListInfo.shareCode || 'N/A'
          }
        ];

        // Adicionar nota no pedido (preservar nota existente se houver)
        const existingNote = orderData.order.note || '';
        const weddingNote = `--- LISTA DE CASAMENTO ---\nLista: ${weddingListInfo.listName || 'N/A'}\nCódigo: ${weddingListInfo.shareCode || 'N/A'}`;
        orderData.order.note = existingNote 
          ? `${existingNote}\n\n${weddingNote}`
          : weddingNote;
        
        console.log('🎁 [createOrder] Dados do pedido com lista de casamento:', JSON.stringify(orderData, null, 2));
      } else {
        console.log('⚠️ [createOrder] Nenhuma informação de lista de casamento fornecida');
      }

      console.log('📤 [createOrder] Enviando pedido para Shopify:', JSON.stringify(orderData, null, 2));
      
      const response = await this.client.post('/orders.json', orderData);
      const order = response.data.order;

      console.log('✅ [createOrder] Order criado no Shopify:', {
        id: order.id,
        name: order.name,
        tags: order.tags,
        note_attributes: order.note_attributes,
        note: order.note
      });
      return order;
    } catch (error) {
      console.error('❌ Erro ao criar order no Shopify:', error.response?.data || error.message);
      throw error;
    }
  }

  // Atualizar pedido existente no Shopify com tags e note_attributes de lista de casamento
  async updateOrderWithWeddingListInfo(orderId, weddingListInfo) {
    try {
      console.log(`🎁 [updateOrder] Atualizando pedido ${orderId} com informações de lista de casamento:`, weddingListInfo);
      
      // Buscar pedido atual para preservar tags existentes
      const currentOrderResponse = await this.client.get(`/orders/${orderId}.json`);
      const currentOrder = currentOrderResponse.data.order;
      
      const updateData = {
        order: {
          id: orderId,
          tags: currentOrder.tags || '',
          note_attributes: currentOrder.note_attributes || [],
          note: currentOrder.note || ''
        }
      };

      // Adicionar tag se não existir
      if (weddingListInfo) {
        const existingTags = (currentOrder.tags || '').split(',').map(t => t.trim()).filter(t => t);
        if (!existingTags.includes('Lista de Casamento')) {
          existingTags.push('Lista de Casamento');
          updateData.order.tags = existingTags.join(',');
        }

        // Adicionar note_attributes
        const existingNoteAttributes = currentOrder.note_attributes || [];
        const newNoteAttributes = [
          {
            name: 'Lista de Casamento',
            value: 'Sim'
          },
          {
            name: 'ID da Lista',
            value: weddingListInfo.listId.toString()
          },
          {
            name: 'Nome da Lista',
            value: weddingListInfo.listName || 'N/A'
          },
          {
            name: 'Código de Compartilhamento',
            value: weddingListInfo.shareCode || 'N/A'
          }
        ];

        // Combinar note_attributes existentes com novos (evitar duplicatas)
        const noteAttributesMap = new Map();
        existingNoteAttributes.forEach(attr => {
          noteAttributesMap.set(attr.name, attr.value);
        });
        newNoteAttributes.forEach(attr => {
          noteAttributesMap.set(attr.name, attr.value);
        });
        
        updateData.order.note_attributes = Array.from(noteAttributesMap.entries()).map(([name, value]) => ({ name, value }));

        // Adicionar nota (só se ainda não existir)
        const existingNote = currentOrder.note || '';
        const weddingNote = `--- LISTA DE CASAMENTO ---\nLista: ${weddingListInfo.listName || 'N/A'}\nCódigo: ${weddingListInfo.shareCode || 'N/A'}`;
        
        // Verificar se a nota já contém informações da lista de casamento com o mesmo código
        const shareCode = weddingListInfo.shareCode || 'N/A';
        const hasWeddingNote = existingNote.includes('--- LISTA DE CASAMENTO ---') && 
                               existingNote.includes(shareCode);
        
        console.log(`🔍 [updateOrder] Verificando nota existente:`, {
          temNota: !!existingNote,
          tamanhoNota: existingNote.length,
          temMarcador: existingNote.includes('--- LISTA DE CASAMENTO ---'),
          temCodigo: existingNote.includes(shareCode),
          jaTemNota: hasWeddingNote,
          codigoProcurado: shareCode
        });
        
        if (!hasWeddingNote) {
          // Se não tem a nota, adicionar apenas uma vez
          updateData.order.note = existingNote 
            ? `${existingNote}\n\n${weddingNote}`
            : weddingNote;
          console.log(`📝 [updateOrder] Adicionando nota de lista de casamento ao pedido`);
        } else {
          // Manter a nota existente se já tiver as informações (evitar duplicação)
          updateData.order.note = existingNote;
          console.log(`✅ [updateOrder] Nota de lista de casamento já existe, mantendo existente (evitando duplicação)`);
        }
      }

      console.log('📤 [updateOrder] Enviando atualização para Shopify:', JSON.stringify(updateData, null, 2));
      
      const response = await this.client.put(`/orders/${orderId}.json`, updateData);
      const updatedOrder = response.data.order;

      console.log('✅ [updateOrder] Pedido atualizado no Shopify:', {
        id: updatedOrder.id,
        name: updatedOrder.name,
        tags: updatedOrder.tags,
        note_attributes: updatedOrder.note_attributes,
        note: updatedOrder.note
      });
      
      return updatedOrder;
    } catch (error) {
      console.error('❌ Erro ao atualizar pedido no Shopify:', error.response?.data || error.message);
      throw error;
    }
  }

  // Buscar variante do produto pelo ID do produto (codigo)
  async getProductVariant(productId) {
    try {
      const product = await this.getProduct(productId);
      if (product && product.variants && product.variants.length > 0) {
        return product.variants[0]; // Retornar primeira variante
      }
      return null;
    } catch (error) {
      console.error('❌ Erro ao buscar variante do produto:', error);
      return null;
    }
  }

  // Gerar link de checkout para Draft Order
  async getCheckoutURL(draftOrderId) {
    try {
      const response = await this.client.get(`/draft_orders/${draftOrderId}.json`);
      const draftOrder = response.data.draft_order;
      
      // O Shopify gera automaticamente uma URL de checkout para draft orders
      // Você pode usar a Storefront API ou gerar um link customizado
      return `https://${this.domain}/checkouts/${draftOrder.invoice_url}`;
    } catch (error) {
      console.error('❌ Erro ao buscar URL de checkout:', error);
      throw error;
    }
  }

  async getCustomerByEmail(email) {
    if (!email) return null;
    try {
      const response = await this.client.get('/customers/search.json', {
        params: {
          query: `email:${email}`
        }
      });
      const customers = response.data?.customers || [];
      return customers[0] || null;
    } catch (error) {
      console.error('❌ Erro ao buscar cliente do Shopify por email:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Verifica se o email do customer foi verificado
   * @param {string} email - Email do customer
   * @returns {Promise<Object>} - { verified: boolean, customerId: string|null }
   */
  async checkEmailVerificationStatus(email) {
    try {
      console.log('📧 [checkEmailVerificationStatus] Verificando status de verificação para:', email);
      const customer = await this.getCustomerByEmail(email);
      
      if (!customer) {
        console.warn('⚠️ [checkEmailVerificationStatus] Customer não encontrado');
        return { verified: false, customerId: null };
      }

      const verified = customer.verified_email === true;
      console.log('📧 [checkEmailVerificationStatus] Status:', {
        email,
        customerId: customer.id,
        verified
      });

      return {
        verified,
        customerId: customer.id?.toString() || null
      };
    } catch (error) {
      console.error('❌ [checkEmailVerificationStatus] Erro:', error.response?.data || error.message);
      return { verified: false, customerId: null, error: error.message };
    }
  }

  async verifyCustomerCredentials(email, password) {
    if (!email || !password) {
      return { success: false, error: 'Email e senha são obrigatórios' };
    }

    const mutation = `
      mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
        customerAccessTokenCreate(input: $input) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `;

    try {
      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          input: {
            email,
            password
          }
        }
      });

      if (response.data?.errors?.length) {
        return { success: false, errors: response.data.errors };
      }

      const result = response.data?.data?.customerAccessTokenCreate;

      if (result?.customerAccessToken) {
        const customer = await this.getCustomerByEmail(email);
        return {
          success: true,
          accessToken: result.customerAccessToken.accessToken,
          expiresAt: result.customerAccessToken.expiresAt,
          customer
        };
      }

      return {
        success: false,
        errors: result?.customerUserErrors || [{ message: 'Credenciais inválidas' }]
      };
    } catch (error) {
      console.error('❌ Erro ao validar credenciais no Shopify:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async getOrdersByEmail(email) {
    if (!email) return [];

    try {
      const response = await this.client.get('/orders.json', {
        params: {
          email,
          status: 'any',
          limit: 250,
        },
      });

      return response.data?.orders || [];
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos por email no Shopify:', error.response?.data || error.message);
      return [];
    }
  }

  // ==========================================
  // STOREFRONT API - Verificação de Estoque
  // ==========================================

  /**
   * Verifica estoque de um produto usando Storefront API GraphQL
   * @param {string} productId - ID do produto no formato gid://shopify/Product/...
   * @returns {Promise<Object>} - Objeto com informações de estoque das variantes
   */
  async getProductInventoryStorefront(productId) {
    try {
      // Converter ID local para formato GraphQL se necessário
      let graphqlProductId = productId;
      if (!productId.startsWith('gid://')) {
        graphqlProductId = `gid://shopify/Product/${productId}`;
      }

      const query = `
        query getProductInventory($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  quantityAvailable
                  availableForSale
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query,
        variables: {
          id: graphqlProductId
        }
      });

      if (response.data.errors) {
        console.error('❌ [Storefront] Erros na query:', response.data.errors);
        throw new Error(response.data.errors[0].message);
      }

      const product = response.data.data?.product;
      if (!product) {
        console.warn(`⚠️ [Storefront] Produto não encontrado: ${productId}`);
        return null;
      }

      // Mapear variantes para formato mais simples
      const inventory = {
        productId: product.id,
        title: product.title,
        handle: product.handle,
        variants: product.variants.edges.map(edge => ({
          id: edge.node.id,
          title: edge.node.title,
          sku: edge.node.sku,
          quantityAvailable: edge.node.quantityAvailable,
          availableForSale: edge.node.availableForSale
        }))
      };

      console.log(`✅ [Storefront] Estoque verificado para produto: ${product.title}`);
      return inventory;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao verificar estoque:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Verifica estoque de múltiplos produtos usando Storefront API
   * @param {Array<string>} productIds - Array de IDs de produtos
   * @returns {Promise<Array>} - Array com informações de estoque
   */
  async getMultipleProductsInventoryStorefront(productIds) {
    try {
      const results = [];
      
      // Processar em lotes de 10 para evitar sobrecarga
      const batchSize = 10;
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        const batchPromises = batch.map(id => 
          this.getProductInventoryStorefront(id).catch(err => {
            console.error(`❌ [Storefront] Erro ao verificar produto ${id}:`, err.message);
            return null;
          })
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(r => r !== null));
        
        // Delay entre lotes para evitar rate limiting
        if (i + batchSize < productIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return results;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao verificar estoque de múltiplos produtos:', error);
      throw error;
    }
  }

  /**
   * Busca produto por código (variant ID) e retorna estoque
   * @param {string} variantCode - Código da variante (usado como codigo no banco)
   * @returns {Promise<Object|null>} - Informações de estoque ou null
   */
  async getInventoryByVariantCode(variantCode) {
    try {
      // Converter código para ID GraphQL
      const variantId = `gid://shopify/ProductVariant/${variantCode}`;
      
      const query = `
        query getVariantInventory($id: ID!) {
          productVariant(id: $id) {
            id
            title
            sku
            quantityAvailable
            availableForSale
            product {
              id
              title
              handle
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query,
        variables: {
          id: variantId
        }
      });

      if (response.data.errors) {
        console.error('❌ [Storefront] Erros na query:', response.data.errors);
        return null;
      }

      const variant = response.data.data?.productVariant;
      if (!variant) {
        return null;
      }

      return {
        variantId: variant.id,
        title: variant.title,
        sku: variant.sku,
        quantityAvailable: variant.quantityAvailable,
        availableForSale: variant.availableForSale,
        product: {
          id: variant.product.id,
          title: variant.product.title,
          handle: variant.product.handle
        }
      };
    } catch (error) {
      console.error('❌ [Storefront] Erro ao verificar estoque por código:', error.response?.data || error.message);
      return null;
    }
  }

  // ==========================================
  // ADMIN API - Bulk Operations
  // ==========================================

  /**
   * Inicia uma bulk operation para buscar todos os produtos
   * @param {string} query - Query GraphQL para a bulk operation
   * @returns {Promise<string>} - ID da bulk operation
   */
  async startBulkOperation(query) {
    try {
      const mutation = `
        mutation bulkOperationRunQuery($query: String!) {
          bulkOperationRunQuery(query: $query) {
            bulkOperation {
              id
              status
              query
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await axios.post(
        `https://${this.domain}/admin/api/2024-01/graphql.json`,
        {
          query: mutation,
          variables: {
            query: query
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': this.adminToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.errors) {
        console.error('❌ [BulkOperation] Erros:', response.data.errors);
        throw new Error(response.data.errors[0].message);
      }

      const bulkOp = response.data.data?.bulkOperationRunQuery?.bulkOperation;
      if (!bulkOp) {
        const userErrors = response.data.data?.bulkOperationRunQuery?.userErrors;
        if (userErrors && userErrors.length > 0) {
          throw new Error(userErrors.map(e => e.message).join(', '));
        }
        throw new Error('Bulk operation não foi criada');
      }

      console.log(`✅ [BulkOperation] Operação iniciada: ${bulkOp.id}`);
      return bulkOp.id;
    } catch (error) {
      console.error('❌ [BulkOperation] Erro ao iniciar:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Verifica status de uma bulk operation
   * @returns {Promise<Object>} - Status da bulk operation atual
   */
  async getBulkOperationStatus() {
    try {
      const query = `
        query {
          currentBulkOperation {
            id
            status
            errorCode
            createdAt
            completedAt
            objectCount
            fileSize
            url
            partialDataUrl
            query
          }
        }
      `;

      const response = await axios.post(
        `https://${this.domain}/admin/api/2024-01/graphql.json`,
        { query },
        {
          headers: {
            'X-Shopify-Access-Token': this.adminToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.errors) {
        console.error('❌ [BulkOperation] Erros:', response.data.errors);
        throw new Error(response.data.errors[0].message);
      }

      return response.data.data?.currentBulkOperation || null;
    } catch (error) {
      console.error('❌ [BulkOperation] Erro ao verificar status:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Aguarda conclusão de uma bulk operation
   * @param {number} maxWaitTime - Tempo máximo de espera em ms (padrão: 5 minutos)
   * @param {number} pollInterval - Intervalo entre verificações em ms (padrão: 2 segundos)
   * @returns {Promise<Object>} - Resultado da bulk operation
   */
  async waitForBulkOperation(maxWaitTime = 300000, pollInterval = 2000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getBulkOperationStatus();
      
      if (!status) {
        throw new Error('Nenhuma bulk operation encontrada');
      }

      console.log(`⏳ [BulkOperation] Status: ${status.status} (${status.objectCount || 0} objetos)`);

      if (status.status === 'COMPLETED') {
        console.log(`✅ [BulkOperation] Concluída! URL: ${status.url}`);
        return status;
      }

      if (status.status === 'FAILED' || status.status === 'CANCELED') {
        throw new Error(`Bulk operation falhou: ${status.status} - ${status.errorCode || 'Erro desconhecido'}`);
      }

      // Aguardar antes da próxima verificação
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Timeout aguardando bulk operation');
  }

  /**
   * Baixa e processa resultados de uma bulk operation
   * @param {string} url - URL do arquivo JSONL
   * @returns {Promise<Array>} - Array de objetos processados
   */
  async downloadBulkOperationResults(url) {
    try {
      console.log('📥 [BulkOperation] Baixando resultados...');
      const response = await axios.get(url, {
        responseType: 'text',
      });

      // Processar JSONL (cada linha é um JSON)
      const lines = response.data.trim().split('\n');
      const results = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.error('❌ [BulkOperation] Erro ao parsear linha:', line);
          return null;
        }
      }).filter(r => r !== null);

      console.log(`✅ [BulkOperation] ${results.length} objetos processados`);
      return results;
    } catch (error) {
      console.error('❌ [BulkOperation] Erro ao baixar resultados:', error.message);
      throw error;
    }
  }

  /**
   * Converte produto do formato GraphQL (bulk operation) para formato REST
   * que o mapProductToApp espera
   */
  convertGraphQLToREST(graphQLProduct) {
    // Extrair ID numérico do GID
    const extractId = (gid) => {
      if (!gid) return null;
      if (typeof gid === 'string' && gid.startsWith('gid://')) {
        return gid.split('/').pop();
      }
      return gid.toString();
    };

    const productId = extractId(graphQLProduct.id);
    
    // Converter variantes
    const variants = graphQLProduct.variants?.edges?.map(edge => {
      const variant = edge.node;
      return {
        id: extractId(variant.id),
        title: variant.title || 'Default Title',
        price: variant.price || '0.00',
        compare_at_price: variant.compareAtPrice || null,
        inventory_quantity: variant.inventoryQuantity || 0,
        inventory_policy: variant.inventoryPolicy || 'deny',
        available: variant.availableForSale !== false,
        sku: variant.sku || '',
        barcode: variant.barcode || ''
      };
    }) || [];

    // Converter imagens
    const images = graphQLProduct.images?.edges?.map(edge => {
      const image = edge.node;
      return {
        id: extractId(image.id),
        src: image.url || '',
        alt: image.altText || ''
      };
    }) || [];

    // Converter tags (array para string)
    const tags = Array.isArray(graphQLProduct.tags) 
      ? graphQLProduct.tags.join(', ')
      : (graphQLProduct.tags || '');

    // Converter status
    const status = graphQLProduct.status?.toLowerCase() || 'active';

    return {
      id: productId,
      title: graphQLProduct.title || '',
      handle: graphQLProduct.handle || '',
      body_html: graphQLProduct.description || '',
      vendor: graphQLProduct.vendor || '',
      product_type: graphQLProduct.productType || '',
      tags: tags,
      status: status,
      variants: variants,
      images: images,
      created_at: graphQLProduct.createdAt || new Date().toISOString(),
      updated_at: graphQLProduct.updatedAt || new Date().toISOString()
    };
  }

  /**
   * Sincroniza todos os produtos usando bulk operations e processa automaticamente
   * @param {Object} db - Conexão com banco de dados
   * @param {boolean} processResults - Se true, processa resultados automaticamente (padrão: true)
   * @returns {Promise<Object>} - Resultado da sincronização
   */
  async syncAllProductsBulk(db, processResults = true) {
    try {
      console.log('🚀 [BulkOperation] Iniciando sincronização em lote...');

      // Query para buscar todos os produtos com informações essenciais
      // Nota: Alguns campos não estão disponíveis em bulk operations (ex: weight, weightUnit, inventoryManagement)
      const bulkQuery = `
        {
          products {
            edges {
              node {
                id
                title
                handle
                description
                vendor
                productType
                tags
                status
                createdAt
                updatedAt
                variants {
                  edges {
                    node {
                      id
                      title
                      sku
                      barcode
                      price
                      compareAtPrice
                      inventoryQuantity
                      inventoryPolicy
                      availableForSale
                    }
                  }
                }
                images {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      `;

      // Iniciar bulk operation
      const bulkOpId = await this.startBulkOperation(bulkQuery);
      
      // Aguardar conclusão
      const result = await this.waitForBulkOperation();
      
      // Baixar resultados
      const graphQLProducts = await this.downloadBulkOperationResults(result.url);
      
      console.log(`📦 [BulkOperation] ${graphQLProducts.length} produtos recebidos do Shopify`);

      if (!processResults) {
        // Retornar URL para processamento posterior
        return {
          success: true,
          total: graphQLProducts.length,
          bulkOperationId: bulkOpId,
          url: result.url,
          message: 'Bulk operation concluída. Use a URL para baixar e processar os resultados.'
        };
      }

      // Processar resultados automaticamente
      console.log('🔄 [BulkOperation] Processando e sincronizando produtos no banco...');
      
      // Converter GraphQL para REST
      const products = [];
      for (const graphQLProduct of graphQLProducts) {
        try {
          const restProduct = this.convertGraphQLToREST(graphQLProduct);
          
          // Validar produto
          if (!restProduct.id || !restProduct.variants || restProduct.variants.length === 0) {
            continue;
          }

          products.push(restProduct);
        } catch (convertError) {
          console.error(`❌ [BulkOperation] Erro ao converter produto:`, convertError.message);
          continue;
        }
      }

      console.log(`✅ [BulkOperation] ${products.length} produtos válidos para sincronizar\n`);

      // Processar em lotes
      const batchSize = 100;
      let syncedCount = 0;
      let updatedCount = 0;
      let insertedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(products.length / batchSize);
        const progress = ((i + batch.length) / products.length * 100).toFixed(1);

        console.log(`📦 [BulkOperation] [${progress}%] Processando lote ${batchNum}/${totalBatches} (${batch.length} produtos)...`);

        // Buscar códigos existentes
        const codigos = batch.map(p => p.id.toString());
        const existingResult = await db.query(
          'SELECT codigo FROM melhor_casas_products WHERE codigo = ANY($1)',
          [codigos]
        );
        const existingCodigos = new Set(existingResult.rows.map(r => r.codigo));

        const toInsert = [];
        const toUpdate = [];

        // Mapear produtos
        for (const shopifyProduct of batch) {
          try {
            const mappedProduct = this.mapProductToApp(shopifyProduct);
            
            if (!mappedProduct) {
              continue;
            }

            if (existingCodigos.has(mappedProduct.codigo)) {
              toUpdate.push(mappedProduct);
            } else {
              toInsert.push(mappedProduct);
            }
          } catch (mapError) {
            console.error(`❌ [BulkOperation] Erro ao mapear produto ${shopifyProduct.id}:`, mapError.message);
            errorCount++;
          }
        }

        // Inserir novos produtos
        if (toInsert.length > 0) {
          const insertBatchSize = 20;
          for (let j = 0; j < toInsert.length; j += insertBatchSize) {
            const insertBatch = toInsert.slice(j, j + insertBatchSize);
            const values = insertBatch.map((p, idx) => {
              const baseIdx = idx * 14;
              return `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, $${baseIdx + 9}, $${baseIdx + 10}, $${baseIdx + 11}, $${baseIdx + 12}, $${baseIdx + 13}, $${baseIdx + 14})`;
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
              JSON.stringify(p.imagens || []),
              p.estoque,
              p.disponivel,
              JSON.stringify(p.tags || []),
              p.created_at,
              p.updated_at
            ]);

            try {
              await db.query(`
                INSERT INTO melhor_casas_products 
                (codigo, nome, categoria, preco_varejo, preco_atacado, 
                 preco_exclusivo, descricao, imagem_url, imagens, estoque, 
                 disponivel, tags, created_at, updated_at)
                VALUES ${values}
                ON CONFLICT (codigo) DO NOTHING
              `, params);

              insertedCount += insertBatch.length;
            } catch (insertError) {
              console.error(`❌ [BulkOperation] Erro ao inserir lote:`, insertError.message);
              errorCount += insertBatch.length;
            }
          }
        }

        // Atualizar produtos existentes
        if (toUpdate.length > 0) {
          for (const product of toUpdate) {
            try {
              await db.query(`
                UPDATE melhor_casas_products SET
                  nome = $1,
                  categoria = $2,
                  preco_varejo = $3,
                  preco_atacado = $4,
                  preco_exclusivo = $5,
                  descricao = $6,
                  imagem_url = $7,
                  imagens = $8,
                  estoque = $9,
                  disponivel = $10,
                  tags = $11,
                  updated_at = $12
                WHERE codigo = $13
              `, [
                product.nome,
                product.categoria,
                product.preco_varejo,
                product.preco_atacado,
                product.preco_exclusivo,
                product.descricao,
                product.imagem_url,
                JSON.stringify(product.imagens || []),
                product.estoque,
                product.disponivel,
                JSON.stringify(product.tags || []),
                product.updated_at,
                product.codigo
              ]);

              updatedCount++;
            } catch (updateError) {
              console.error(`❌ [BulkOperation] Erro ao atualizar produto ${product.codigo}:`, updateError.message);
              errorCount++;
            }
          }
        }

        syncedCount += batch.length;
      }

      // Marcar produtos que não estão mais na API do Shopify como indisponíveis
      console.log(`\n🔄 [BulkOperation] Verificando produtos deletados no Shopify...`);
      const allShopifyCodes = products.map(p => p.id.toString());
      let unavailableCount = 0;
      
      if (allShopifyCodes.length > 0) {
        try {
          // Marcar todos os produtos que não estão na lista da API como indisponíveis
          // Usar NOT IN para ser mais claro e compatível
          const unavailableResult = await db.query(`
            UPDATE melhor_casas_products 
            SET disponivel = false, updated_at = CURRENT_TIMESTAMP
            WHERE codigo NOT IN (SELECT unnest($1::text[]))
              AND disponivel = true
            RETURNING codigo
          `, [allShopifyCodes]);
          
          unavailableCount = unavailableResult.rowCount || 0;
          
          if (unavailableCount > 0) {
            console.log(`⚠️ [BulkOperation] ${unavailableCount} produtos marcados como indisponíveis (não encontrados no Shopify)`);
          } else {
            console.log(`✅ [BulkOperation] Todos os produtos do banco estão presentes no Shopify`);
          }
        } catch (unavailableError) {
          console.error(`❌ [BulkOperation] Erro ao marcar produtos indisponíveis:`, unavailableError.message);
        }
      }

      console.log(`\n✅ [BulkOperation] Sincronização concluída!`);
      console.log(`📊 Estatísticas:`);
      console.log(`   - Total processado: ${syncedCount}`);
      console.log(`   - Novos produtos: ${insertedCount}`);
      console.log(`   - Produtos atualizados: ${updatedCount}`);
      console.log(`   - Produtos marcados como indisponíveis: ${unavailableCount}`);
      console.log(`   - Erros: ${errorCount}`);

      return {
        success: true,
        total: syncedCount,
        synced: insertedCount,
        updated: updatedCount,
        unavailable: unavailableCount,
        errors: errorCount,
        bulkOperationId: bulkOpId
      };
    } catch (error) {
      console.error('❌ [BulkOperation] Erro na sincronização:', error);
      throw error;
    }
  }

  // ==========================================
  // STOREFRONT API - Customer Management
  // ==========================================

  /**
   * Dispara email de recuperação de senha (esqueci minha senha)
   * Usa a mutation customerRecover da Storefront API.
   * @param {string} email - Email do cliente
   * @returns {Promise<{success: boolean, errors: Array}>}
   */
  async customerRecover(email) {
    try {
      const mutation = `
        mutation customerRecover($email: String!) {
          customerRecover(email: $email) {
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: { email },
      });

      if (response.data?.errors?.length) {
        console.error('❌ [Storefront] Erros em customerRecover (raiz):', response.data.errors);
        return {
          success: false,
          errors: response.data.errors,
        };
      }

      const result = response.data?.data?.customerRecover;
      const userErrors = result?.userErrors || [];

      if (userErrors.length > 0) {
        console.warn('⚠️ [Storefront] customerRecover retornou userErrors:', userErrors);
        return {
          success: false,
          errors: userErrors,
        };
      }

      return {
        success: true,
        errors: [],
      };
    } catch (error) {
      console.error('❌ [Storefront] Erro em customerRecover:', error.response?.data || error.message);
      return {
        success: false,
        errors: [{ message: error.message }],
      };
    }
  }

  /**
   * Cria Customer Access Token (login do cliente)
   * @param {string} email - Email do cliente
   * @param {string} password - Senha do cliente
   * @returns {Promise<Object>} - Token e dados do cliente
   */
  async createCustomerAccessToken(email, password) {
    try {
      const mutation = `
        mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
          customerAccessTokenCreate(input: $input) {
            customerAccessToken {
              accessToken
              expiresAt
            }
            customerUserErrors {
              field
              message
              code
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          input: {
            email,
            password
          }
        }
      });

      if (response.data?.errors?.length) {
        return { 
          success: false, 
          errors: response.data.errors,
          customerAccessToken: null
        };
      }

      const result = response.data?.data?.customerAccessTokenCreate;

      if (result?.customerAccessToken) {
        return {
          success: true,
          customerAccessToken: {
            accessToken: result.customerAccessToken.accessToken,
            expiresAt: result.customerAccessToken.expiresAt
          },
          errors: []
        };
      }

      return {
        success: false,
        customerAccessToken: null,
        errors: result?.customerUserErrors || [{ message: 'Credenciais inválidas' }]
      };
    } catch (error) {
      console.error('❌ [Storefront] Erro ao criar customer access token:', error.response?.data || error.message);
      return {
        success: false,
        customerAccessToken: null,
        errors: [{ message: error.message }]
      };
    }
  }

  /**
   * Cria um novo customer na Shopify via Admin API REST
   * NOTA: A Storefront API não suporta criar customers, apenas Admin API
   * @param {Object} customerData - Dados do cliente
   * @param {string} customerData.firstName - Primeiro nome
   * @param {string} customerData.lastName - Sobrenome
   * @param {string} customerData.email - Email
   * @param {string} customerData.password - Senha
   * @param {string} customerData.phone - Telefone (opcional)
   * @returns {Promise<Object>} - Resultado da criação
   */
  async createCustomer(customerData) {
    try {
      const { firstName, lastName, email, password, phone } = customerData;
      
      console.log('👤 [createCustomer] ========== INÍCIO ==========');
      console.log('👤 [createCustomer] Dados recebidos:', {
        firstName: firstName?.substring(0, 10) + '...',
        lastName: lastName?.substring(0, 10) + '...',
        email: email,
        phone: phone || 'não fornecido',
        passwordLength: password?.length || 0
      });
      
      // Validar dados obrigatórios
      if (!firstName || !lastName || !email || !password) {
        console.error('❌ [createCustomer] Dados obrigatórios faltando:', {
          hasFirstName: !!firstName,
          hasLastName: !!lastName,
          hasEmail: !!email,
          hasPassword: !!password
        });
        return {
          success: false,
          customer: null,
          errors: [{ message: 'Dados obrigatórios faltando (firstName, lastName, email, password)' }]
        };
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        console.error('❌ [createCustomer] Email inválido:', email);
        return {
          success: false,
          customer: null,
          errors: [{ message: 'Email inválido' }]
        };
      }

      // Validar senha (mínimo 6 caracteres)
      if (password.length < 6) {
        console.error('❌ [createCustomer] Senha muito curta:', password.length);
        return {
          success: false,
          customer: null,
          errors: [{ message: 'Senha deve ter pelo menos 6 caracteres' }]
        };
      }
      
      console.log('👤 [createCustomer] Dados validados, criando payload...');
      
      // Usar Admin API REST para criar customer (Storefront API não suporta)
      // IMPORTANTE: Para não enviar email automático da Shopify, manter send_email_invite: false
      const customerPayload = {
        customer: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          password: password,
          password_confirmation: password,
          send_email_welcome: false, // Não enviar email de boas-vindas automático
          send_email_invite: false, // Não enviar email de convite/verificação automático
          accepts_marketing: false, // Não aceitar marketing por padrão
        }
      };

      // Adicionar telefone se fornecido
      if (phone && phone.trim()) {
        customerPayload.customer.phone = phone.trim();
        console.log('👤 [createCustomer] Telefone adicionado ao payload');
      }

      console.log('👤 [createCustomer] Payload criado (sem senha):', {
        first_name: customerPayload.customer.first_name,
        last_name: customerPayload.customer.last_name,
        email: customerPayload.customer.email,
        phone: customerPayload.customer.phone || 'não fornecido',
        send_email_welcome: customerPayload.customer.send_email_welcome,
        send_email_invite: customerPayload.customer.send_email_invite
      });

      console.log('👤 [createCustomer] Enviando requisição para Shopify Admin API...');
      console.log('👤 [createCustomer] URL:', `${this.baseURL}/customers.json`);
      
      const response = await this.client.post('/customers.json', customerPayload);

      console.log('👤 [createCustomer] Resposta recebida - Status:', response.status);
      console.log('👤 [createCustomer] Resposta recebida - Headers:', JSON.stringify(response.headers, null, 2));
      
      if (response.data?.customer) {
        const customer = response.data.customer;
        console.log('✅ [createCustomer] Customer criado com sucesso!');
        console.log('✅ [createCustomer] Customer ID:', customer.id);
        console.log('✅ [createCustomer] Customer Email:', customer.email);
        console.log('✅ [createCustomer] Customer Nome:', `${customer.first_name} ${customer.last_name}`);
        console.log('✅ [createCustomer] Customer verificado?', customer.verified_email);
        console.log('✅ [createCustomer] Customer aceita marketing?', customer.accepts_marketing);
        console.log('📧 [createCustomer] Email de verificação será enviado pela Shopify');
        
        // Converter ID numérico para GID (formato Storefront API)
        const customerGid = `gid://shopify/Customer/${customer.id}`;
        
        return {
          success: true,
          customer: {
            id: customerGid,
            email: customer.email,
            firstName: customer.first_name,
            lastName: customer.last_name,
            phone: customer.phone,
            verifiedEmail: customer.verified_email || false
          },
          errors: []
        };
      }

      console.warn('⚠️ [createCustomer] Resposta inválida da Shopify - sem customer no response.data');
      console.warn('⚠️ [createCustomer] Response.data completo:', JSON.stringify(response.data, null, 2));

      return {
        success: false,
        customer: null,
        errors: [{ message: 'Resposta inválida da Shopify' }]
      };
    } catch (error) {
      console.error('❌ [createCustomer] ========== ERRO ==========');
      console.error('❌ [createCustomer] Tipo do erro:', error.constructor.name);
      console.error('❌ [createCustomer] Mensagem:', error.message);
      console.error('❌ [createCustomer] Stack:', error.stack);
      
      if (error.response) {
        console.error('❌ [createCustomer] Status HTTP:', error.response.status);
        console.error('❌ [createCustomer] Status Text:', error.response.statusText);
        console.error('❌ [createCustomer] Headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('❌ [createCustomer] Response Data:', JSON.stringify(error.response.data, null, 2));
        
        // Tratar erros específicos da Shopify
        let errorMessage = 'Erro ao criar customer na Shopify';
        let errorDetails = [];
        
        if (error.response.data?.errors) {
          const shopifyErrors = error.response.data.errors;
          console.error('❌ [createCustomer] Erros da Shopify:', JSON.stringify(shopifyErrors, null, 2));
          
          if (shopifyErrors.email) {
            errorMessage = `Email já está em uso`;
            errorDetails = shopifyErrors.email;
          } else if (shopifyErrors.password) {
            errorMessage = `Erro na senha`;
            errorDetails = shopifyErrors.password;
          } else if (shopifyErrors.phone) {
            errorMessage = `Erro no telefone`;
            errorDetails = shopifyErrors.phone;
          } else {
            // Pegar todos os erros
            const allErrors = Object.entries(shopifyErrors).map(([field, messages]) => {
              return `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`;
            });
            errorMessage = `Erros de validação: ${allErrors.join('; ')}`;
            errorDetails = allErrors;
          }
        } else if (error.response.data?.error) {
          errorMessage = error.response.data.error;
          console.error('❌ [createCustomer] Erro da Shopify:', errorMessage);
        } else if (error.response.status === 422) {
          errorMessage = 'Dados inválidos (422)';
          console.error('❌ [createCustomer] Erro 422 - Unprocessable Entity');
        } else if (error.response.status === 401) {
          errorMessage = 'Não autorizado - verifique as credenciais da Admin API';
          console.error('❌ [createCustomer] Erro 401 - Unauthorized');
        } else if (error.response.status === 403) {
          errorMessage = 'Acesso negado - verifique as permissões da Admin API';
          console.error('❌ [createCustomer] Erro 403 - Forbidden');
        }
        
        return {
          success: false,
          customer: null,
          errors: [{ 
            message: errorMessage,
            details: errorDetails,
            status: error.response.status
          }]
        };
      } else if (error.request) {
        console.error('❌ [createCustomer] Erro na requisição (sem resposta):', error.request);
        return {
          success: false,
          customer: null,
          errors: [{ message: 'Erro de conexão com a Shopify' }]
        };
      } else {
        console.error('❌ [createCustomer] Erro desconhecido:', error.message);
        return {
          success: false,
          customer: null,
          errors: [{ message: error.message || 'Erro desconhecido ao criar customer na Shopify' }]
        };
      }
    }
  }

  /**
   * Busca dados completos do cliente (incluindo pedidos)
   * @param {string} customerAccessToken - Token do cliente
   * @returns {Promise<Object>} - Dados do cliente
   */
  async getCustomer(customerAccessToken) {
    console.log('🔍 [getCustomer] ========== INÍCIO ==========');
    console.log('🔍 [getCustomer] Token recebido (primeiros 20 chars):', customerAccessToken?.substring(0, 20) + '...');
    
    try {
      console.log('🔍 [getCustomer] Construindo query GraphQL...');
      const query = `
        query getCustomer($customerAccessToken: String!) {
          customer(customerAccessToken: $customerAccessToken) {
            id
            firstName
            lastName
            email
            phone
            defaultAddress {
              id
              address1
              address2
              city
              province
              countryCodeV2
              zip
              phone
            }
            addresses(first: 10) {
              edges {
                node {
                  id
                  firstName
                  lastName
                  address1
                  address2
                  city
                  province
                  countryCodeV2
                  zip
                  phone
                }
              }
            }
            orders(first: 50, reverse: true) {
              edges {
                node {
                  id
                  orderNumber
                  name
                  email
                  phone
                  processedAt
                  totalPrice {
                    amount
                    currencyCode
                  }
                  subtotalPrice {
                    amount
                    currencyCode
                  }
                  totalShippingPrice {
                    amount
                    currencyCode
                  }
                  totalTax {
                    amount
                    currencyCode
                  }
                  fulfillmentStatus
                  financialStatus
                  statusUrl
                  shippingAddress {
                    address1
                    address2
                    city
                    province
                    countryCodeV2
                    zip
                    phone
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        title
                        quantity
                        variant {
                          id
                          title
                          price {
                            amount
                            currencyCode
                          }
                          image {
                            url
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      console.log('🔍 [getCustomer] Fazendo requisição para Storefront API...');
      console.log('🔍 [getCustomer] URL:', this.storefrontURL);
      console.log('🔍 [getCustomer] Headers:', {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': this.storefrontToken ? '***' : 'MISSING'
      });
      
      // Log da query para debug
      console.log('🔍 [getCustomer] Query GraphQL (verificando lineItems):');
      const lineItemsMatch = query.match(/lineItems\(first: 50\)[\s\S]{0,100}/);
      if (lineItemsMatch) {
        console.log('🔍 [getCustomer] lineItems section:', lineItemsMatch[0]);
      }
      
      const response = await this.storefrontClient.post('', {
        query,
        variables: {
          customerAccessToken
        }
      });

      console.log('🔍 [getCustomer] Resposta recebida. Status:', response.status);
      console.log('🔍 [getCustomer] Resposta tem data?', !!response.data);
      console.log('🔍 [getCustomer] Resposta tem errors?', !!response.data?.errors);
      console.log('🔍 [getCustomer] Resposta tem data.customer?', !!response.data?.data?.customer);

      if (response.data?.errors?.length) {
        console.error('❌ [getCustomer] Erros na resposta GraphQL:', JSON.stringify(response.data.errors, null, 2));
        throw new Error(response.data.errors[0].message);
      }

      const customer = response.data?.data?.customer;
      
      if (!customer) {
        console.log('⚠️ [getCustomer] Customer não encontrado na resposta');
        console.log('⚠️ [getCustomer] Estrutura da resposta:', {
          hasData: !!response.data,
          hasDataData: !!response.data?.data,
          dataKeys: response.data?.data ? Object.keys(response.data.data) : []
        });
        return null;
      }

      console.log(`✅ [getCustomer] Customer encontrado: ${customer.email || 'sem email'}`);
      console.log(`📦 [getCustomer] Total de pedidos (edges): ${customer.orders?.edges?.length || 0}`);
      console.log('🔍 [getCustomer] Estrutura do customer:', {
        hasId: !!customer.id,
        hasEmail: !!customer.email,
        hasOrders: !!customer.orders,
        ordersType: typeof customer.orders,
        hasEdges: !!customer.orders?.edges,
        edgesLength: customer.orders?.edges?.length
      });

      // Formatar dados
      console.log('🔍 [getCustomer] Iniciando formatação de dados...');
      try {
        console.log('🔍 [getCustomer] Formatando addresses...');
        const addresses = customer.addresses?.edges ? customer.addresses.edges.map(edge => edge.node) : [];
        console.log('🔍 [getCustomer] Addresses formatados:', addresses.length);
        
        console.log('🔍 [getCustomer] Formatando orders...');
        console.log('🔍 [getCustomer] Orders edges length:', customer.orders?.edges?.length || 0);
        
        const formattedOrders = customer.orders?.edges?.map((edge, index) => {
          console.log(`🔍 [getCustomer] Processando pedido ${index + 1}...`);
          const order = edge.node;
          
          console.log(`🔍 [getCustomer] Pedido ${index + 1} - ID:`, order.id);
          console.log(`🔍 [getCustomer] Pedido ${index + 1} - OrderNumber:`, order.orderNumber);
          console.log(`🔍 [getCustomer] Pedido ${index + 1} - TotalPrice:`, order.totalPrice);
          console.log(`🔍 [getCustomer] Pedido ${index + 1} - Fulfillments:`, order.fulfillments ? (Array.isArray(order.fulfillments) ? order.fulfillments.length : 'não é array') : 'null');
          
          try {
            // Determinar tipo de entrega (retirada ou envio)
            const deliveryType = order.totalShippingPrice?.amount === '0.00' || 
                                parseFloat(order.totalShippingPrice?.amount || 0) === 0
              ? 'pickup' 
              : 'shipping';
            
          // Nota: A Storefront API não expõe fulfillments diretamente no Order
          // O tracking pode estar disponível através de outros campos ou precisar ser buscado via Admin API
          // Por enquanto, deixamos trackingInfo como null
          let trackingInfo = null;
            
            return {
              id: order.id,
              orderNumber: order.orderNumber,
              name: order.name,
              email: order.email,
              phone: order.phone,
              processedAt: order.processedAt,
              totalPrice: parseFloat(order.totalPrice.amount),
              subtotalPrice: parseFloat(order.subtotalPrice.amount),
              totalShippingPrice: parseFloat(order.totalShippingPrice?.amount || 0),
              totalTax: parseFloat(order.totalTax?.amount || 0),
              fulfillmentStatus: order.fulfillmentStatus,
              financialStatus: order.financialStatus,
              statusUrl: order.statusUrl,
              deliveryType: deliveryType,
              shippingAddress: order.shippingAddress ? {
                address1: order.shippingAddress.address1,
                address2: order.shippingAddress.address2,
                city: order.shippingAddress.city,
                province: order.shippingAddress.province,
                countryCode: order.shippingAddress.countryCodeV2,
                zip: order.shippingAddress.zip,
                phone: order.shippingAddress.phone
              } : null,
              tracking: trackingInfo ? {
                number: trackingInfo.number,
                url: trackingInfo.url,
                company: trackingInfo.company
              } : null,
              fulfillments: [], // Storefront API não expõe fulfillments diretamente
              lineItems: order.lineItems?.edges?.map((item, itemIndex) => ({
                id: `line-item-${itemIndex}`, // Gerar ID único já que não existe no GraphQL
                title: item.node.title,
                quantity: item.node.quantity,
                variant: {
                  id: item.node.variant?.id || null,
                  title: item.node.variant?.title || null,
                  price: item.node.variant?.price?.amount ? parseFloat(item.node.variant.price.amount) : 0,
                  image: item.node.variant?.image?.url || null
                }
              })) || []
            };
          } catch (orderError) {
            console.error(`❌ [getCustomer] Erro ao processar pedido ${index + 1}:`, orderError);
            console.error(`❌ [getCustomer] Stack do pedido ${index + 1}:`, orderError.stack);
            // Retornar pedido básico em caso de erro
            return {
              id: order?.id || `error-${index}`,
              orderNumber: order?.orderNumber || null,
              name: order?.name || null,
              email: order?.email || null,
              phone: order?.phone || null,
              processedAt: order?.processedAt || null,
              totalPrice: order?.totalPrice?.amount ? parseFloat(order.totalPrice.amount) : 0,
              subtotalPrice: order?.subtotalPrice?.amount ? parseFloat(order.subtotalPrice.amount) : 0,
              totalShippingPrice: order?.totalShippingPrice?.amount ? parseFloat(order.totalShippingPrice.amount) : 0,
              totalTax: order?.totalTax?.amount ? parseFloat(order.totalTax.amount) : 0,
              fulfillmentStatus: order?.fulfillmentStatus || null,
              financialStatus: order?.financialStatus || null,
              statusUrl: order?.statusUrl || null,
              deliveryType: 'shipping',
              shippingAddress: null,
              tracking: null,
              fulfillments: [],
              lineItems: []
            };
          }
        }) || [];
        
        console.log('🔍 [getCustomer] Pedidos formatados:', formattedOrders.length);
        
        const result = {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          defaultAddress: customer.defaultAddress,
          addresses: addresses,
          orders: formattedOrders
        };
        
        console.log('✅ [getCustomer] Dados formatados com sucesso');
        console.log('🔍 [getCustomer] ========== SUCESSO ==========');
        return result;
      } catch (formatError) {
        console.error('❌ [getCustomer] Erro ao formatar dados:', formatError);
        console.error('❌ [getCustomer] Erro name:', formatError.name);
        console.error('❌ [getCustomer] Erro message:', formatError.message);
        console.error('❌ [getCustomer] Stack:', formatError.stack);
        throw formatError;
      }
    } catch (error) {
      console.error('❌ [getCustomer] ========== ERRO ==========');
      console.error('❌ [getCustomer] Erro ao buscar dados do cliente:', error);
      console.error('❌ [getCustomer] Erro name:', error.name);
      console.error('❌ [getCustomer] Erro message:', error.message);
      console.error('❌ [getCustomer] Erro stack:', error.stack);
      console.error('❌ [getCustomer] Response status:', error.response?.status);
      console.error('❌ [getCustomer] Response data:', JSON.stringify(error.response?.data, null, 2));
      console.error('❌ [getCustomer] Response headers:', error.response?.headers);
      console.error('❌ [getCustomer] ========== FIM ERRO ==========');
      throw error;
    }
  }

  /**
   * Busca apenas endereços do cliente (sem pedidos) - versão leve e rápida
   * @param {string} customerAccessToken - Token de acesso do cliente
   * @returns {Promise<Object>} - Objeto com addresses array
   */
  async getCustomerAddressesOnly(customerAccessToken) {
    console.log('🔍 [getCustomerAddressesOnly] Buscando apenas endereços (sem pedidos)...');
    
    try {
      const query = `
        query getCustomerAddresses($customerAccessToken: String!) {
          customer(customerAccessToken: $customerAccessToken) {
            id
            firstName
            lastName
            email
            phone
            defaultAddress {
              id
              address1
              address2
              city
              province
              countryCodeV2
              zip
              phone
            }
            addresses(first: 10) {
              edges {
                node {
                  id
                  firstName
                  lastName
                  address1
                  address2
                  city
                  province
                  countryCodeV2
                  zip
                  phone
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query,
        variables: {
          customerAccessToken
        }
      });

      if (response.data?.errors?.length) {
        console.error('❌ [getCustomerAddressesOnly] Erros na resposta GraphQL:', JSON.stringify(response.data.errors, null, 2));
        throw new Error(response.data.errors[0].message);
      }

      const customer = response.data?.data?.customer;
      
      if (!customer) {
        console.log('⚠️ [getCustomerAddressesOnly] Customer não encontrado');
        return { addresses: [] };
      }

      const addresses = customer.addresses?.edges ? customer.addresses.edges.map(edge => edge.node) : [];
      
      console.log(`✅ [getCustomerAddressesOnly] Encontrados ${addresses.length} endereços (sem processar pedidos)`);
      
      return {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        defaultAddress: customer.defaultAddress,
        addresses: addresses
      };
    } catch (error) {
      console.error('❌ [getCustomerAddressesOnly] Erro ao buscar endereços:', error.message);
      throw error;
    }
  }

  // ==========================================
  // STOREFRONT API - Cart Management
  // ==========================================

  /**
   * Cria um cart na Storefront API
   * @param {Array} lines - Array de { merchandiseId, quantity }
   * @param {string} customerAccessToken - Token do cliente (opcional)
   * @param {Object} deliveryPreferences - Preferências de entrega { deliveryMethod: 'SHIPPING' | 'PICK_UP', pickupHandle?: string }
   * @returns {Promise<Object>} - Dados do cart criado
   */
  async createCart(lines, customerAccessToken = null, deliveryPreferences = null) {
    console.log('🛒 [createCart] Iniciando criação de cart...');
    console.log('🛒 [createCart] Lines:', JSON.stringify(lines, null, 2));
      console.log('🛒 [createCart] CustomerAccessToken:', customerAccessToken ? 'presente' : 'não fornecido');
      console.log('🛒 [createCart] DeliveryPreferences:', JSON.stringify(deliveryPreferences, null, 2));
    
    try {
      const mutation = `
        mutation cartCreate($input: CartInput!) {
          cartCreate(input: $input) {
            cart {
              id
              checkoutUrl
              lines(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        price {
                          amount
                          currencyCode
                        }
                        product {
                          id
                          title
                        }
                      }
                    }
                  }
                }
              }
              cost {
                totalAmount {
                  amount
                  currencyCode
                }
                subtotalAmount {
                  amount
                  currencyCode
                }
                totalTaxAmount {
                  amount
                  currencyCode
                }
              }
              buyerIdentity {
                email
                customer {
                  id
                  email
                }
                preferences {
                  delivery {
                    deliveryMethod
                    pickupHandle
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const input = {
        lines: lines.map(line => ({
          merchandiseId: line.merchandiseId,
          quantity: line.quantity
        })),
        buyerIdentity: {
          countryCode: 'BR' // Garantir país para cálculo de entrega/pickup
        }
      };

      // Configurar buyerIdentity
      if (customerAccessToken) {
        input.buyerIdentity.customerAccessToken = customerAccessToken;
      }

      // Não enviar deliveryPreferences no CartInput (Storefront 2025-01)

      // Configurar preferências de entrega (Storefront 2025-01)
      if (deliveryPreferences) {
        input.buyerIdentity.preferences = {
          delivery: {}
        };

        if (deliveryPreferences.deliveryMethod) {
          // deliveryMethod deve ser array ou string; manter conforme recebido
          input.buyerIdentity.preferences.delivery.deliveryMethod = deliveryPreferences.deliveryMethod;
        }

        if (deliveryPreferences.pickupHandle) {
          input.buyerIdentity.preferences.delivery.pickupHandle = deliveryPreferences.pickupHandle;
        }
      }

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: { input }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const result = response.data?.data?.cartCreate;

      console.log('🛒 [createCart] Resposta recebida:', {
        hasCart: !!result?.cart,
        hasUserErrors: !!result?.userErrors,
        userErrorsCount: result?.userErrors?.length || 0
      });

      if (result?.userErrors?.length > 0) {
        console.error('❌ [createCart] Erros do usuário:', result.userErrors);
        throw new Error(result.userErrors[0].message);
      }
      
      if (!result?.cart) {
        console.error('❌ [createCart] Cart não retornado na resposta');
        throw new Error('Cart não foi criado');
      }
      
      console.log('✅ [createCart] Cart criado com sucesso:', result.cart.id);

      if (!result?.cart) {
        throw new Error('Cart não foi criado');
      }

      // Log para confirmar preferências de entrega retornadas
      if (result.cart.buyerIdentity?.preferences?.delivery) {
        console.log('✅ [createCart] Preferências de entrega aplicadas:', result.cart.buyerIdentity.preferences.delivery);
      } else if (deliveryPreferences) {
        console.warn('⚠️ [createCart] Preferências enviadas mas não retornadas no buyerIdentity');
      }

      return {
        id: result.cart.id,
        checkoutUrl: result.cart.checkoutUrl,
        lines: result.cart.lines.edges.map(edge => ({
          id: edge.node.id,
          quantity: edge.node.quantity,
          merchandise: edge.node.merchandise
        })),
        cost: {
          totalAmount: parseFloat(result.cart.cost.totalAmount.amount),
          subtotalAmount: parseFloat(result.cart.cost.subtotalAmount.amount),
          totalTaxAmount: parseFloat(result.cart.cost.totalTaxAmount?.amount || 0),
          currencyCode: result.cart.cost.totalAmount.currencyCode
        },
        buyerIdentity: result.cart.buyerIdentity,
        deliveryGroups: result.cart.deliveryGroups || null
      };
    } catch (error) {
      console.error('❌ [Storefront] Erro ao criar cart:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Adiciona itens a um cart existente
   * @param {string} cartId - ID do cart (GID)
   * @param {Array} lines - Array de { merchandiseId, quantity }
   * @returns {Promise<Object>} - Cart atualizado
   */
  async addCartLines(cartId, lines) {
    try {
      const mutation = `
        mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
          cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart {
              id
              lines(first: 100) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        price {
                          amount
                        }
                      }
                    }
                  }
                }
              }
              cost {
                totalAmount {
                  amount
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          cartId,
          lines: lines.map(line => ({
            merchandiseId: line.merchandiseId,
            quantity: line.quantity
          }))
        }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const result = response.data?.data?.cartLinesAdd;

      if (result?.userErrors?.length > 0) {
        throw new Error(result.userErrors[0].message);
      }

      return result.cart;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao adicionar itens ao cart:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Atualiza buyer identity do cart (vincula à conta do cliente)
   * @param {string} cartId - ID do cart (GID)
   * @param {string} customerAccessToken - Token do cliente
   * @returns {Promise<Object>} - Cart atualizado
   */
  async updateCartBuyerIdentity(cartId, customerAccessToken) {
    try {
      const mutation = `
        mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
          cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
            cart {
              id
              buyerIdentity {
                email
                customer {
                  id
                  email
                }
              }
              ...DeliveryGroups @defer
            }
            userErrors {
              field
              message
            }
          }
        }
        
        fragment DeliveryGroups on Cart {
          deliveryGroups(first: 10, withCarrierRates: true) {
            edges {
              node {
                deliveryOptions {
                  handle
                  title
                  estimatedCost {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          cartId,
          buyerIdentity: {
            customerAccessToken: customerAccessToken
          }
        }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const result = response.data?.data?.cartBuyerIdentityUpdate;

      if (result?.userErrors?.length > 0) {
        throw new Error(result.userErrors[0].message);
      }

      return result.cart;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao atualizar buyer identity:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Atualiza buyer identity do cart com dados completos do usuário
   * @param {string} cartId - ID do cart (GID)
   * @param {Object} buyerData - Dados do comprador { email, phone, countryCode, firstName, lastName }
   * @param {string} customerAccessToken - Token de acesso do cliente (opcional)
   * @param {Object} deliveryAddress - Endereço de entrega (opcional)
   * @returns {Promise<Object>} - Cart atualizado
   */
  async updateCartBuyerIdentityWithData(cartId, buyerData, customerAccessToken = null, deliveryAddress = null) {
    try {
      console.log('👤 [updateCartBuyerIdentityWithData] Atualizando buyer identity com dados completos...');
      if (buyerData) {
        console.log('📧 Email:', buyerData.email || 'não informado');
        console.log('📱 Phone:', buyerData.phone ? '***' : 'não informado');
        console.log('👤 Nome:', `${buyerData.firstName || ''} ${buyerData.lastName || ''}`.trim() || 'não informado');
      } else {
        console.log('⚠️ [updateCartBuyerIdentityWithData] buyerData não fornecido');
      }

      const mutation = `
        mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
          cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
            cart {
              id
              buyerIdentity {
                email
                phone
                countryCode
                customer {
                  id
                  email
                  firstName
                  lastName
                }
              }
              ...DeliveryGroups @defer
            }
            userErrors {
              field
              message
            }
          }
        }
        
        fragment DeliveryGroups on Cart {
          deliveryGroups(first: 10, withCarrierRates: true) {
            edges {
              node {
                deliveryOptions {
                  handle
                  title
                  estimatedCost {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;

      // Construir buyerIdentity
      // NOTA: A Storefront API não suporta firstName/lastName diretamente em CartBuyerIdentityInput
      // Quando usamos customerAccessToken, a Shopify busca automaticamente os dados do perfil do cliente
      // Se não tiver customerAccessToken, podemos enviar apenas email, phone e countryCode
      const buyerIdentity = {};

      if (customerAccessToken) {
        // Com customerAccessToken, a Shopify pré-preenche automaticamente com dados do perfil do cliente
        buyerIdentity.customerAccessToken = customerAccessToken;
        console.log('🔗 [updateCartBuyerIdentityWithData] Usando customerAccessToken - dados serão buscados do perfil do cliente');
        
        // IMPORTANTE: A Shopify não aceita firstName/lastName quando há customerAccessToken
        // Mas podemos enviar email/phone para garantir (serão mesclados com dados do perfil)
        if (buyerData.email) {
          buyerIdentity.email = buyerData.email;
          console.log('📧 [updateCartBuyerIdentityWithData] Email definido:', buyerData.email);
        }
        if (buyerData.phone) {
          buyerIdentity.phone = buyerData.phone;
          console.log('📱 [updateCartBuyerIdentityWithData] Phone definido');
        }
        if (buyerData && buyerData.countryCode) {
          buyerIdentity.countryCode = buyerData.countryCode;
        } else {
          buyerIdentity.countryCode = 'BR';
        }
      } else {
        // Sem customerAccessToken, podemos enviar dados básicos
        // Mas firstName/lastName NÃO são suportados diretamente pela API
        // Apenas email, phone e countryCode são suportados
        if (buyerData) {
          if (buyerData.email) buyerIdentity.email = buyerData.email;
          if (buyerData.phone) buyerIdentity.phone = buyerData.phone;
          buyerIdentity.countryCode = buyerData.countryCode || 'BR';
        } else {
          // Se não houver buyerData, pelo menos definir countryCode
          buyerIdentity.countryCode = 'BR';
        }
        
        console.log('⚠️ [updateCartBuyerIdentityWithData] Sem customerAccessToken - firstName/lastName não podem ser enviados diretamente via API');
        console.log('⚠️ [updateCartBuyerIdentityWithData] Para pré-preencher nome/sobrenome, é necessário usar customerAccessToken OU injetar JS no checkout');
      }

      // Se tiver endereço de entrega, adicionar
      if (deliveryAddress) {
        buyerIdentity.deliveryAddressPreferences = {
          deliveryAddress: {
            address1: deliveryAddress.address1 || '',
            address2: deliveryAddress.address2 || null,
            city: deliveryAddress.city || '',
            province: deliveryAddress.province || '',
            country: deliveryAddress.country || 'Brazil',
            zip: deliveryAddress.zip || ''
          }
        };
      }

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          cartId,
          buyerIdentity
        }
      }, {
        responseType: 'text',
        headers: {
          'Accept': 'multipart/mixed; boundary=graphql'
        }
      });

      // Processar resposta (pode ser multipart ou JSON normal)
      let responseData = response.data;
      
      // Se for string (multipart), processar
      let parsedResponse = null;
      if (typeof responseData === 'string') {
        if (responseData.includes('--graphql')) {
          console.log('📦 [updateCartBuyerIdentityWithData] Resposta multipart detectada, processando...');
          parsedResponse = this.parseMultipartGraphQLResponse(responseData);
          
          // parsedResponse agora tem estrutura { data: {...}, errors: null }
          responseData = parsedResponse;
        } else {
          // Tentar parsear como JSON
          try {
            responseData = JSON.parse(responseData);
          } catch (e) {
            console.error('❌ [updateCartBuyerIdentityWithData] Erro ao parsear resposta:', e.message);
            throw new Error('Erro ao processar resposta da API');
          }
        }
      }

      if (responseData?.errors?.length) {
        throw new Error(responseData.errors[0].message);
      }

      // Tentar acessar cartBuyerIdentityUpdate em diferentes estruturas possíveis
      let result = responseData?.data?.cartBuyerIdentityUpdate;
      
      // Se não encontrou, tentar acesso direto (caso parser tenha retornado estrutura diferente)
      if (!result && responseData?.data?.cart) {
        // Parser pode ter retornado apenas o cart mesclado
        result = {
          cart: responseData.data.cart,
          userErrors: []
        };
      }
      
      // Última tentativa: verificar se está diretamente em data
      if (!result && parsedResponse?.data?.cartBuyerIdentityUpdate) {
        result = parsedResponse.data.cartBuyerIdentityUpdate;
      }

      if (!result) {
        console.error('❌ [updateCartBuyerIdentityWithData] Resposta inválida:', JSON.stringify(responseData, null, 2));
        throw new Error('Resposta inválida da API - cartBuyerIdentityUpdate não encontrado');
      }

      if (result?.userErrors?.length > 0) {
        throw new Error(result.userErrors[0].message);
      }

      console.log('✅ [updateCartBuyerIdentityWithData] Buyer identity atualizado com sucesso');
      
      // Verificar se os dados foram aplicados
      if (result.cart?.buyerIdentity) {
        console.log('✅ [updateCartBuyerIdentityWithData] Buyer identity confirmado:', {
          email: result.cart.buyerIdentity.email ? '***' : 'não definido',
          phone: result.cart.buyerIdentity.phone ? '***' : 'não definido',
          countryCode: result.cart.buyerIdentity.countryCode || 'não definido',
          hasCustomer: !!result.cart.buyerIdentity.customer,
          // NOTA: firstName/lastName podem não aparecer aqui mesmo que estejam no checkout
          // porque a Shopify busca esses dados do perfil do cliente quando há customerAccessToken
        });
        
        if (customerAccessToken && result.cart.buyerIdentity.customer) {
          console.log('✅ [updateCartBuyerIdentityWithData] Cliente vinculado - dados de nome/sobrenome serão buscados do perfil automaticamente no checkout');
        }
      }

      return result.cart;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao atualizar buyer identity com dados:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Atualiza o endereço de entrega do cart usando um endereço salvo do cliente
   * @param {string} cartId - ID do cart (GID)
   * @param {string} customerAddressId - ID do endereço salvo do cliente (GID)
   * @returns {Promise<Object>} - Cart atualizado
   */
  async updateCartDeliveryAddressWithSavedAddress(cartId, customerAddressId, customerAccessToken = null) {
    try {
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Atualizando endereço de entrega com endereço salvo...');
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Cart ID:', cartId);
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Customer Address ID:', customerAddressId);
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Customer Access Token:', customerAccessToken ? 'presente' : 'ausente');
      
      // IMPORTANTE: Validar que o customerAddressId está no formato correto e limpo
      let cleanAddressId = customerAddressId;
      if (cleanAddressId.includes('?')) {
        cleanAddressId = cleanAddressId.split('?')[0];
      }
      
      // Validar formato do GID
      if (!cleanAddressId.startsWith('gid://shopify/MailingAddress/')) {
        const errorMsg = `Formato de ID de endereço inválido: ${cleanAddressId}. Esperado: gid://shopify/MailingAddress/{id}`;
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress]', errorMsg);
        throw new Error(errorMsg);
      }
      
      // Extrair apenas o número do ID (sem o prefixo gid://shopify/MailingAddress/)
      const idMatch = cleanAddressId.match(/gid:\/\/shopify\/MailingAddress\/(\d+)/);
      if (!idMatch || !idMatch[1]) {
        const errorMsg = `Não foi possível extrair o ID numérico do endereço: ${cleanAddressId}`;
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress]', errorMsg);
        throw new Error(errorMsg);
      }
      
      const numericId = idMatch[1];
      const finalAddressId = `gid://shopify/MailingAddress/${numericId}`;
      
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] ID limpo e validado:', finalAddressId);
      
      // CRÍTICO: Verificar se o endereço pertence ao cliente antes de usar
      // A Shopify retornará "Invalid id" se o endereço não pertencer ao cliente do customerAccessToken
      if (!customerAccessToken) {
        throw new Error('customerAccessToken é obrigatório para usar endereço salvo do cliente');
      }
      
      console.log('🔍 [updateCartDeliveryAddressWithSavedAddress] ========== INICIANDO VERIFICAÇÃO DE ENDEREÇO ==========');
      console.log('🔍 [updateCartDeliveryAddressWithSavedAddress] Verificando se endereço pertence ao cliente...');
      console.log('🔍 [updateCartDeliveryAddressWithSavedAddress] Endereço a verificar:', finalAddressId);
      
      // Buscar endereços do cliente para verificar se o endereço existe
      // IMPORTANTE: Buscar TODOS os dados do endereço para usar como fallback se copyFromCustomerAddressId falhar
      const customerQuery = `
        query getCustomerAddresses($customerAccessToken: String!) {
          customer(customerAccessToken: $customerAccessToken) {
            id
            email
            addresses(first: 10) {
              edges {
                node {
                  id
                  firstName
                  lastName
                  company
                  address1
                  address2
                  city
                  province
                  provinceCode
                  zip
                  country
                  countryCode
                  phone
                }
              }
            }
          }
        }
      `;
      
      console.log('🔍 [updateCartDeliveryAddressWithSavedAddress] Executando query GraphQL para buscar endereços...');
      const customerResponse = await this.storefrontClient.post('', {
        query: customerQuery,
        variables: { customerAccessToken }
      });
      
      console.log('🔍 [updateCartDeliveryAddressWithSavedAddress] Query executada. Processando resposta...');
      
      if (customerResponse.data?.errors?.length) {
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Erro na query GraphQL:', customerResponse.data.errors);
        throw new Error(`Erro ao buscar endereços do cliente: ${customerResponse.data.errors[0].message}`);
      }
      
      const customer = customerResponse.data?.data?.customer;
      if (!customer) {
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Cliente não encontrado na resposta');
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Resposta completa:', JSON.stringify(customerResponse.data, null, 2));
        throw new Error('Cliente não encontrado com o customerAccessToken fornecido');
      }
      
      console.log(`✅ [updateCartDeliveryAddressWithSavedAddress] Cliente encontrado: ${customer.email} (ID: ${customer.id})`);
      
      const addresses = customer.addresses?.edges || [];
      const addressIds = addresses.map(edge => {
        const cleanId = edge.node.id.includes('?') ? edge.node.id.split('?')[0] : edge.node.id;
        return {
          fullId: edge.node.id,
          cleanId: cleanId,
          firstName: edge.node.firstName,
          lastName: edge.node.lastName,
          company: edge.node.company,
          address1: edge.node.address1,
          address2: edge.node.address2,
          city: edge.node.city,
          province: edge.node.province,
          provinceCode: edge.node.provinceCode,
          zip: edge.node.zip,
          country: edge.node.country,
          countryCode: edge.node.countryCode,
          phone: edge.node.phone
        };
      });
      
      console.log(`📦 [updateCartDeliveryAddressWithSavedAddress] Cliente: ${customer.email}, Total de endereços: ${addressIds.length}`);
      console.log(`📦 [updateCartDeliveryAddressWithSavedAddress] Lista de endereços do cliente:`);
      addressIds.forEach((addr, idx) => {
        console.log(`  ${idx + 1}. ID: ${addr.cleanId}`);
        console.log(`     Nome: ${addr.firstName} ${addr.lastName}`);
        console.log(`     Endereço: ${addr.address1}`);
      });
      
      console.log(`🔍 [updateCartDeliveryAddressWithSavedAddress] Procurando endereço: ${finalAddressId}`);
      console.log(`🔍 [updateCartDeliveryAddressWithSavedAddress] Comparando com IDs limpos dos endereços do cliente...`);
      
      // Verificar se o endereço está na lista do cliente
      // IMPORTANTE: Comparar usando tanto o cleanId quanto o fullId para garantir que encontramos
      const matchingAddress = addressIds.find(addr => {
        const matchesClean = addr.cleanId === finalAddressId;
        const matchesFull = addr.fullId === finalAddressId || addr.fullId.includes(finalAddressId.replace('gid://shopify/MailingAddress/', ''));
        if (matchesClean || matchesFull) {
          console.log(`✅ [updateCartDeliveryAddressWithSavedAddress] Match encontrado: cleanId=${matchesClean}, fullId=${matchesFull}`);
        }
        return matchesClean || matchesFull;
      });
      
      if (!matchingAddress) {
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress] ========== ERRO: ENDEREÇO NÃO ENCONTRADO ==========');
        console.error('📦 [updateCartDeliveryAddressWithSavedAddress] Endereço buscado:', finalAddressId);
        console.error('📦 [updateCartDeliveryAddressWithSavedAddress] Endereços disponíveis do cliente:', addressIds.map(a => ({
          id: a.cleanId,
          nome: `${a.firstName} ${a.lastName}`,
          endereco: a.address1
        })));
        
        throw new Error(
          `O endereço ${finalAddressId} não pertence ao cliente autenticado (${customer.email}). ` +
          `Endereços disponíveis: ${addressIds.length}. ` +
          `Este endereço não pode ser usado com o customerAccessToken fornecido.`
        );
      }
      
      console.log(`✅ [updateCartDeliveryAddressWithSavedAddress] ========== ENDEREÇO CONFIRMADO ==========`);
      console.log(`✅ [updateCartDeliveryAddressWithSavedAddress] Endereço confirmado: ${matchingAddress.firstName} ${matchingAddress.lastName}, ${matchingAddress.address1}`);
      console.log(`✅ [updateCartDeliveryAddressWithSavedAddress] ID limpo do endereço: ${finalAddressId}`);
      console.log(`✅ [updateCartDeliveryAddressWithSavedAddress] ID completo do endereço (da query): ${matchingAddress.fullId}`);
      
      // IMPORTANTE: Armazenar os dados completos do endereço para usar como fallback se copyFromCustomerAddressId falhar
      const fullAddressData = matchingAddress;

      // IMPORTANTE: A verificação de endereço já foi feita acima
      // Agora vamos buscar o cart para ver se há endereços selecionáveis existentes
      
      // Primeiro, precisamos buscar o cart para obter os IDs dos endereços selecionáveis
      const cartQuery = `
        query getCartDeliveryAddresses($id: ID!) {
          cart(id: $id) {
            id
            delivery {
              addresses {
                id
                selected
                oneTimeUse
              }
            }
          }
        }
      `;

      const cartResponse = await this.storefrontClient.post('', {
        query: cartQuery,
        variables: { id: cartId }
      }, {
        responseType: 'text',
        headers: {
          'Accept': 'multipart/mixed; boundary=graphql'
        }
      });

      // Processar resposta (pode ser multipart ou JSON normal)
      let cartData = cartResponse.data;
      
      if (typeof cartData === 'string') {
        if (cartData.includes('--graphql')) {
          cartData = this.parseMultipartGraphQLResponse(cartData);
        } else {
          try {
            cartData = JSON.parse(cartData);
          } catch (e) {
            throw new Error('Erro ao processar resposta ao buscar cart');
          }
        }
      }

      if (cartData?.errors?.length) {
        throw new Error(cartData.errors[0].message);
      }
      

      const cart = cartData?.data?.cart;
      if (!cart) {
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Cart não encontrado na resposta');
        throw new Error('Cart não encontrado');
      }

      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Cart encontrado:', {
        hasDelivery: !!cart.delivery,
        addressesCount: cart.delivery?.addresses?.length || 0
      });

      // IMPORTANTE: Segundo a documentação oficial e testes práticos:
      // - Se não houver endereços no cart: usar cartDeliveryAddressesAdd
      // - Se já houver endereços no cart: remover todos e adicionar novo com copyFromCustomerAddressId
      //   (evita problemas com endereços criados automaticamente que não podem ser atualizados)
      const shouldAddNewAddress = !cart.delivery?.addresses || cart.delivery.addresses.length === 0;
      
      if (shouldAddNewAddress) {
        // CASO 1: Não há endereços no cart - adicionar novo endereço usando copyFromCustomerAddressId
        console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Nenhum endereço selecionável encontrado - adicionando endereço primeiro...');
        
        // Usar cartDeliveryAddressesAdd para adicionar o primeiro endereço
        const addMutation = `
          mutation cartDeliveryAddressesAdd($cartId: ID!, $addresses: [CartSelectableAddressInput!]!) {
            cartDeliveryAddressesAdd(cartId: $cartId, addresses: $addresses) {
              cart {
                id
                delivery {
                  addresses {
                    id
                    selected
                    oneTimeUse
                    address {
                      ... on CartDeliveryAddress {
                        firstName
                        lastName
                        address1
                        city
                      }
                    }
                  }
                }
              }
              userErrors {
                message
                code
                field
              }
            }
          }
        `;

        // Usar o ID já validado acima (finalAddressId)
        console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Adicionando endereço com ID validado:', finalAddressId);
        
        const addVariables = {
          cartId: cartId,
          addresses: [
            {
              selected: true,
              oneTimeUse: false,
              address: {
                copyFromCustomerAddressId: finalAddressId
              }
            }
          ]
        };
        
        console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Variables para cartDeliveryAddressesAdd:', JSON.stringify(addVariables, null, 2));

        const addResponse = await this.storefrontClient.post('', {
          query: addMutation,
          variables: addVariables
        }, {
          responseType: 'text',
          headers: {
            'Accept': 'multipart/mixed; boundary=graphql',
            'Content-Type': 'application/json'
          }
        });

        // Processar resposta (pode ser multipart)
        let addData = addResponse.data;
        console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Resposta bruta recebida (tipo):', typeof addData);
        console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Resposta bruta (primeiros 500 chars):', typeof addData === 'string' ? addData.substring(0, 500) : 'objeto');
        
        if (typeof addData === 'string') {
          if (addData.includes('--graphql')) {
            console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Processando resposta multipart...');
            addData = this.parseMultipartGraphQLResponse(addData);
          } else {
            try {
              addData = JSON.parse(addData);
            } catch (e) {
              console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Erro ao parsear JSON:', e.message);
              throw new Error('Erro ao processar resposta ao adicionar endereço');
            }
          }
        }

        console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Dados processados (keys):', Object.keys(addData || {}));

        if (addData?.errors?.length) {
          const errorDetail = addData.errors[0];
          console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Erro da API ao adicionar:', {
            message: errorDetail.message,
            extensions: errorDetail.extensions,
            path: errorDetail.path
          });
          throw new Error(errorDetail.message);
        }

        const addResult = addData?.data?.cartDeliveryAddressesAdd;
        console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Resultado de cartDeliveryAddressesAdd:', {
          hasResult: !!addResult,
          hasCart: !!addResult?.cart,
          hasUserErrors: !!addResult?.userErrors?.length,
          userErrors: addResult?.userErrors
        });
        
        if (addResult?.userErrors?.length > 0) {
          const userError = addResult.userErrors[0];
          console.error('❌ [updateCartDeliveryAddressWithSavedAddress] UserError ao adicionar:', {
            message: userError.message,
            code: userError.code,
            field: userError.field,
            customerAddressId: finalAddressId
          });
          throw new Error(userError.message);
        }

        if (addResult?.cart?.delivery?.addresses?.length > 0) {
          // Buscar cart atualizado
          const updatedCart = await this.getCart(cartId);
          console.log('✅ [updateCartDeliveryAddressWithSavedAddress] Endereço adicionado e selecionado com sucesso');
          return updatedCart;
        } else {
          throw new Error('Endereço não foi adicionado ao cart');
        }
      }

      // CASO 2: Já há endereços no cart
      // Segundo a documentação e melhores práticas, quando há um endereço existente criado automaticamente
      // pela atualização do buyer identity, é melhor removê-lo e adicionar um novo com copyFromCustomerAddressId
      // Isso evita problemas com endereços que não estão vinculados corretamente ao endereço salvo do cliente
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Endereços existentes encontrados...');
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Removendo endereços existentes antes de adicionar o endereço salvo...');
      
      // Remover todos os endereços existentes primeiro
      const addressIdsToRemove = cart.delivery.addresses.map(addr => addr.id);
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] IDs de endereços a remover:', addressIdsToRemove);
      
      const removeMutation = `
        mutation cartDeliveryAddressesRemove($cartId: ID!, $addressIds: [ID!]!) {
          cartDeliveryAddressesRemove(cartId: $cartId, addressIds: $addressIds) {
            cart {
              id
              delivery {
                addresses {
                  id
                }
              }
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;
      
      try {
        const removeResponse = await this.storefrontClient.post('', {
          query: removeMutation,
          variables: {
            cartId: cartId,
            addressIds: addressIdsToRemove
          }
        }, {
          responseType: 'text',
          headers: {
            'Accept': 'multipart/mixed; boundary=graphql',
            'Content-Type': 'application/json'
          }
        });
        
        let removeData = removeResponse.data;
        if (typeof removeData === 'string') {
          if (removeData.includes('--graphql')) {
            removeData = this.parseMultipartGraphQLResponse(removeData);
          } else {
            try {
              removeData = JSON.parse(removeData);
            } catch (e) {
              console.warn('⚠️ [updateCartDeliveryAddressWithSavedAddress] Erro ao parsear resposta de remoção:', e.message);
            }
          }
        }
        
        if (removeData?.errors?.length) {
          console.warn('⚠️ [updateCartDeliveryAddressWithSavedAddress] Erro ao remover endereços:', removeData.errors[0].message);
        } else if (removeData?.data?.cartDeliveryAddressesRemove?.userErrors?.length > 0) {
          console.warn('⚠️ [updateCartDeliveryAddressWithSavedAddress] UserErrors ao remover:', removeData.data.cartDeliveryAddressesRemove.userErrors);
        } else {
          console.log('✅ [updateCartDeliveryAddressWithSavedAddress] Endereços existentes removidos com sucesso');
        }
      } catch (removeError) {
        console.warn('⚠️ [updateCartDeliveryAddressWithSavedAddress] Exceção ao remover endereços existentes:', removeError.message);
        // Continuar mesmo se a remoção falhar - tentaremos adicionar o novo endereço
      }
      
      // CRÍTICO: Buscar o cart novamente após remover endereços para garantir que está sincronizado
      // Isso garante que a Shopify processou a remoção antes de tentar adicionar
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Buscando cart atualizado após remoção...');
      let updatedCartAfterRemove = await this.getCart(cartId);
      
      // Verificar se cart ainda está vinculado ao customer (necessário para copyFromCustomerAddressId)
      if (updatedCartAfterRemove?.buyerIdentity?.customer) {
        console.log('✅ [updateCartDeliveryAddressWithSavedAddress] Cart confirmado vinculado ao customer após remoção');
      } else {
        console.warn('⚠️ [updateCartDeliveryAddressWithSavedAddress] Cart pode não estar vinculado ao customer após remoção');
      }
      
      if (updatedCartAfterRemove?.delivery?.addresses?.length > 0) {
        console.warn('⚠️ [updateCartDeliveryAddressWithSavedAddress] Ainda há endereços no cart após remoção:', updatedCartAfterRemove.delivery.addresses.length);
      } else {
        console.log('✅ [updateCartDeliveryAddressWithSavedAddress] Cart confirmado sem endereços, pronto para adicionar novo');
      }
      
      // Agora adicionar o endereço salvo usando cartDeliveryAddressesAdd
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Adicionando endereço salvo do cliente...');
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Usando ID validado e confirmado:', finalAddressId);
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Customer Access Token:', customerAccessToken ? 'presente' : 'ausente');

      // Usar cartDeliveryAddressesAdd para adicionar o endereço salvo
      const addMutation = `
        mutation cartDeliveryAddressesAdd($cartId: ID!, $addresses: [CartSelectableAddressInput!]!) {
          cartDeliveryAddressesAdd(cartId: $cartId, addresses: $addresses) {
            cart {
              id
              delivery {
                addresses {
                  id
                  selected
                  oneTimeUse
                  address {
                    ... on CartDeliveryAddress {
                      firstName
                      lastName
                      company
                      address1
                      address2
                      city
                      provinceCode
                      zip
                      countryCode
                    }
                  }
                }
              }
            }
            userErrors {
              message
              code
              field
            }
            warnings {
              message
              code
              target
            }
          }
        }
      `;

      const variables = {
        cartId: cartId,
        addresses: [
          {
            selected: true,
            oneTimeUse: false,
            address: {
              copyFromCustomerAddressId: finalAddressId
            }
          }
        ]
      };
      
      console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Mutation variables:', JSON.stringify(variables, null, 2));

      const response = await this.storefrontClient.post('', {
        query: addMutation,
        variables
      }, {
        responseType: 'text',
        headers: {
          'Accept': 'multipart/mixed; boundary=graphql',
          'Content-Type': 'application/json'
        }
      });

      // Processar resposta (pode ser multipart ou JSON normal)
      let responseData = response.data;
      let parsedResponse = null;
      
      // Se for string (multipart), processar
      if (typeof responseData === 'string') {
        if (responseData.includes('--graphql')) {
          console.log('📦 [updateCartDeliveryAddressWithSavedAddress] Resposta multipart detectada, processando...');
          parsedResponse = this.parseMultipartGraphQLResponse(responseData);
          // parsedResponse agora tem estrutura { data: {...}, errors: null }
          responseData = parsedResponse;
        } else {
          try {
            responseData = JSON.parse(responseData);
          } catch (e) {
            console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Erro ao parsear resposta:', e.message);
            throw new Error('Erro ao processar resposta da API');
          }
        }
      }

      if (responseData?.errors?.length) {
        const errorDetail = responseData.errors[0];
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Erro da API ao adicionar endereço:', {
          message: errorDetail.message,
          extensions: errorDetail.extensions,
          path: errorDetail.path
        });
        throw new Error(errorDetail.message);
      }

      const result = responseData?.data?.cartDeliveryAddressesAdd;

      if (result?.userErrors?.length > 0) {
        const userError = result.userErrors[0];
        console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Erro ao adicionar endereço:', {
          message: userError.message,
          code: userError.code,
          field: userError.field,
          customerAddressId: finalAddressId
        });
        throw new Error(`Erro ao adicionar endereço: ${userError.message}`);
      }

      if (result?.warnings?.length > 0) {
        console.warn('⚠️ [updateCartDeliveryAddressWithSavedAddress] Warnings:', result.warnings);
      }

      if (!result?.cart?.delivery?.addresses || result.cart.delivery.addresses.length === 0) {
        throw new Error('Endereço não foi adicionado ao cart');
      }

      console.log('✅ [updateCartDeliveryAddressWithSavedAddress] Endereço salvo adicionado com sucesso ao cart');

      // Buscar cart completo atualizado
      const updatedCart = await this.getCart(cartId);
      return updatedCart;
    } catch (error) {
      console.error('❌ [updateCartDeliveryAddressWithSavedAddress] Erro:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Busca opções de frete de um cart
   * @param {string} cartId - ID do cart (GID)
   * @returns {Promise<Array>} - Array de opções de frete
   */
  async getCartShippingRates(cartId) {
    try {
      const query = `
        query getCart($id: ID!) {
          cart(id: $id) {
            id
            checkoutUrl
            buyerIdentity {
              email
              customer {
                id
                email
              }
            }
            discountCodes {
              code
              applicable
            }
            cost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
              totalTaxAmount {
                amount
                currencyCode
              }
              totalDutyAmount {
                amount
                currencyCode
              }
            }
              discountAllocations {
                discountedAmount {
                  amount
                  currencyCode
                }
              }
            ...DeliveryGroups @defer
          }
        }
        
        fragment DeliveryGroups on Cart {
          deliveryGroups(first: 10, withCarrierRates: true) {
            edges {
              node {
                deliveryOptions {
                  handle
                  title
                  estimatedCost {
                    amount
                    currencyCode
                  }
                }
                groupType
                deliveryAddress {
                  address1
                  city
                  province
                  countryCodeV2
                  zip
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query,
        variables: { id: cartId }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const cart = response.data?.data?.cart;

      if (!cart || !cart.deliveryGroups) {
        return [];
      }

      // Extrair todas as opções de frete
      const shippingRates = [];
      const deliveryGroups = cart.deliveryGroups || {};
      const groups = deliveryGroups.edges || [];
      
      for (const groupEdge of groups) {
        const group = groupEdge?.node;
        if (!group) continue;
        
        const options = group?.deliveryOptions || [];
        for (const option of options) {
          if (option && option.handle && option.title) {
            shippingRates.push({
              handle: option.handle,
              title: option.title,
              cost: parseFloat(option.estimatedCost?.amount || 0),
              currencyCode: option.estimatedCost?.currencyCode || 'BRL',
              estimatedDays: null // Campo não disponível na API
            });
          }
        }
      }

      return shippingRates;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao buscar opções de frete:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Atualiza endereço de entrega no cart e retorna opções de frete
   * @param {string} cartId - ID do cart (GID)
   * @param {Object} address - Endereço de entrega
   * @param {string} customerAccessToken - Token do cliente (opcional)
   * @returns {Promise<Array>} - Array de opções de frete
   */
  async calculateShippingRatesStorefront(cartId, address, customerAccessToken = null) {
    try {
      // Primeiro, atualizar buyer identity com endereço
      // MailingAddressInput usa 'country' (nome completo) ou 'countryCode' (ISO 3166-1 alpha-2)
      const buyerIdentity = {
        deliveryAddressPreferences: {
          deliveryAddress: {
            address1: address.address1,
            address2: address.address2 || null,
            city: address.city,
            province: address.province,
            country: 'Brazil', // Nome completo do país
            zip: address.zip
          }
        }
      };

      // Se tiver customerAccessToken, incluir
      if (customerAccessToken) {
        buyerIdentity.customerAccessToken = customerAccessToken;
      }

      const mutation = `
        mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
          cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
            cart {
              id
              ...DeliveryGroups @defer
            }
            userErrors {
              field
              message
            }
          }
        }
        
        fragment DeliveryGroups on Cart {
          deliveryGroups(first: 10, withCarrierRates: true) {
            edges {
              node {
                deliveryOptions {
                  handle
                  title
                  estimatedCost {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          cartId,
          buyerIdentity
        }
      }, {
        responseType: 'text', // Receber como texto para processar multipart
        headers: {
          'Accept': 'multipart/mixed; boundary=graphql'
        }
      });

      // Processar resposta (pode ser multipart ou JSON normal)
      let responseData = response.data;
      
      // Se for string (multipart), processar
      if (typeof responseData === 'string') {
        if (responseData.includes('--graphql')) {
          console.log('📦 Resposta multipart detectada, processando...');
          const parsed = this.parseMultipartGraphQLResponse(responseData);
          if (parsed) {
            // parsed já retorna { data: {...} }, então usar diretamente
            if (parsed.data?.cartBuyerIdentityUpdate) {
              responseData = parsed;
            } else if (parsed.data) {
              // Se parsed.data existe mas não tem cartBuyerIdentityUpdate, pode estar aninhado
              responseData = parsed;
            } else {
              // parsed pode ser o cartBuyerIdentityUpdate diretamente
              responseData = { data: { cartBuyerIdentityUpdate: parsed } };
            }
          } else {
            // Tentar parsear como JSON
            try {
              responseData = JSON.parse(responseData);
            } catch (e) {
              console.error('❌ Erro ao parsear resposta:', e.message);
            }
          }
        } else {
          // Tentar parsear como JSON
          try {
            responseData = JSON.parse(responseData);
          } catch (e) {
            // Manter como string
          }
        }
      }

      if (responseData?.errors?.length) {
        throw new Error(responseData.errors[0].message);
      }

      const result = responseData?.data?.cartBuyerIdentityUpdate || responseData?.cartBuyerIdentityUpdate;

      if (result?.userErrors?.length > 0) {
        throw new Error(result.userErrors[0].message);
      }

      if (!result || !result.cart) {
        console.error('❌ [calculateShippingRatesStorefront] Resposta inválida:', JSON.stringify(responseData, null, 2));
        throw new Error('Resposta inválida da Storefront API');
      }

      // Extrair opções de frete
      const shippingRates = [];
      const deliveryGroupsData = result.cart?.deliveryGroups || {};
      
      console.log('🔍 [calculateShippingRatesStorefront] DeliveryGroups recebidos');
      console.log('🔍 [calculateShippingRatesStorefront] Estrutura:', JSON.stringify(deliveryGroupsData, null, 2));
      
      // deliveryGroups é uma conexão com edges
      const groups = deliveryGroupsData.edges || [];
      console.log('🔍 [calculateShippingRatesStorefront] Total de grupos:', groups.length);
      
      for (const groupEdge of groups) {
        const group = groupEdge?.node;
        if (!group) continue;
        
        const options = group?.deliveryOptions || [];
        console.log(`🔍 [calculateShippingRatesStorefront] Grupo com ${options.length} opções`);
        
        for (const option of options) {
          if (option && option.handle && option.title) {
            shippingRates.push({
              handle: option.handle,
              title: option.title,
              cost: parseFloat(option.estimatedCost?.amount || 0),
              currencyCode: option.estimatedCost?.currencyCode || 'BRL',
              estimatedDays: null // Campo não disponível na API
            });
          }
        }
      }
      
      console.log(`✅ [calculateShippingRatesStorefront] Total de opções de frete: ${shippingRates.length}`);

      return shippingRates;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao calcular frete:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Busca deliveryGroups do cart para obter deliveryGroupId
   * @param {string} cartId - ID do cart (GID)
   * @returns {Promise<Array>} - Array de deliveryGroups com id e opções
   */
  async getDeliveryGroups(cartId) {
    try {
      console.log(`🔍 [getDeliveryGroups] Buscando deliveryGroups do cart: ${cartId}`);

      const query = `
        query getDeliveryGroups($cartId: ID!) {
          cart(id: $cartId) {
            deliveryGroups(first: 10) {
              nodes {
                id
                deliveryOptions {
                  handle
                  title
                  estimatedCost {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query,
        variables: { cartId }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const deliveryGroups = response.data?.data?.cart?.deliveryGroups?.nodes || [];

      if (deliveryGroups.length === 0) {
        console.warn('⚠️ [getDeliveryGroups] Nenhum deliveryGroup encontrado');
        return [];
      }

      console.log(`✅ [getDeliveryGroups] ${deliveryGroups.length} deliveryGroup(s) encontrado(s)`);

      return deliveryGroups.map(group => ({
        id: group.id,
        options: group.deliveryOptions || []
      }));
    } catch (error) {
      console.error('❌ [getDeliveryGroups] Erro ao buscar deliveryGroups:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Busca locais de retirada disponíveis do Shopify
   * @param {Array} lineItems - Itens do carrinho para criar cart temporário
   * @returns {Promise<Array>} - Array de locais de retirada disponíveis
   */
  async getPickupLocations(lineItems = [], customerAccessToken = null) {
    try {
      console.log('📍 [getPickupLocations] Buscando locais de retirada disponíveis...');
      
      // Se não houver lineItems, não é possível buscar disponibilidade
      if (lineItems.length === 0) {
        console.warn('⚠️ [getPickupLocations] Nenhum item fornecido para buscar storeAvailability');
        return [];
      }

      // Apenas storeAvailability direto no variant (evitar cart/deliveryGroups)
      const locationsMap = new Map();
      for (const line of lineItems) {
        const variantId = line?.merchandiseId;
        if (!variantId) continue;
        const availability = await this.getStoreAvailabilityByVariant(variantId);
        for (const loc of availability) {
          // usar handle como chave para deduplicar
          const key = loc.handle || loc.title || loc.pickupPoint?.id || Math.random().toString();
          if (!locationsMap.has(key)) {
            locationsMap.set(key, loc);
          }
        }
      }

      const pickupLocations = Array.from(locationsMap.values());
      console.log(`✅ [getPickupLocations] storeAvailability retornou ${pickupLocations.length} local(is)`);
      return pickupLocations;
    } catch (error) {
      console.error('❌ [getPickupLocations] Erro ao buscar locais de retirada:', error.response?.data || error.message);
      // Retornar array vazio em caso de erro para não quebrar o fluxo
      return [];
    }
  }

  /**
   * Buscar storeAvailability direto pelo variant (Storefront API)
   * @param {string} variantGid - GID da variante
   * @returns {Promise<Array>} Locais de retirada disponíveis
   */
  async getStoreAvailabilityByVariant(variantGid) {
    try {
      const query = `
        query getVariantAvailability($variantId: ID!) {
          node(id: $variantId) {
            ... on ProductVariant {
              storeAvailability(first: 20) {
                edges {
                  node {
                    available
                    pickUpTime
                    location {
                      id
                      name
                      address {
                        formatted
                        address1
                        address2
                        city
                        province
                        country
                        zip
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query,
        variables: { variantId: variantGid }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const edges = response.data?.data?.node?.storeAvailability?.edges || [];
      const locations = edges
        .map((edge) => edge?.node)
        .filter((node) => node) // manter nós existentes, mesmo sem estoque
        .map((node) => {
          const addr = node.location?.address;
          const formattedAddress = addr
            ? `${addr.address1}, ${addr.city} - ${addr.province}`
            : 'Endereço não disponível';
          const prazoTexto = this.translatePickUpTime(node.pickUpTime, node.available);
          return {
            handle: node.location?.id || node.location?.name || 'pickup',
            title: node.location?.name || 'Retirada',
            price: 0,
            currency: 'BRL',
            description: formattedAddress,
            deadline: prazoTexto,
            pickUpTime: node.pickUpTime || null,
            available: node.available,
            pickupPoint: {
              id: node.location?.id || null,
              name: node.location?.name || null,
              address: node.location?.address?.formatted || formattedAddress,
              address1: node.location?.address?.address1 || null,
              address2: node.location?.address?.address2 || null,
              city: node.location?.address?.city || null,
              province: node.location?.address?.province || null,
              country: node.location?.address?.country || null,
              zip: node.location?.address?.zip || null,
              pickUpTime: node.pickUpTime || null,
            },
          };
        });

      // Fallback: se vier menos de 5 locais, completar com lojas conhecidas (sem distância)
      if (locations.length < 5) {
        const fallbackStores = [
          {
            handle: 'loja-centro',
            title: 'Melhor das Casas - Centro',
            description: 'Avenida Almirante Barroso, 25, Rio de Janeiro RJ',
            deadline: 'Normalmente pronto entre 2 e 4 dias'
          },
          {
            handle: 'loja-bonsucesso',
            title: 'Melhor das Casas - Bonsucesso',
            description: 'Praça das Nações, 88, A, Rio de Janeiro RJ',
            deadline: 'Normalmente pronto entre 2 e 4 dias'
          },
          {
            handle: 'loja-madureira',
            title: 'Melhor das Casas - Madureira',
            description: 'Rua Dagmar da Fonseca, 54, Rio de Janeiro RJ',
            deadline: 'Normalmente pronto entre 2 e 4 dias'
          },
          {
            handle: 'loja-nilopolis',
            title: 'Melhor das Casas - Nilópolis',
            description: 'Avenida Getúlio Vargas, 1496, Nilópolis RJ',
            deadline: 'Normalmente pronto entre 2 e 4 dias'
          },
          {
            handle: 'loja-santa-cruz',
            title: 'Melhor das Casas - Santa Cruz',
            description: 'Rua Felipe Cardoso, 615, Rio de Janeiro RJ',
            deadline: 'Normalmente pronto entre 2 e 4 dias'
          }
        ];

        const existingKeys = new Set(locations.map((l) => l.handle));
        for (const store of fallbackStores) {
          if (existingKeys.has(store.handle)) continue;
          locations.push({
            handle: store.handle,
            title: store.title,
            price: 0,
            currency: 'BRL',
            description: store.description,
            deadline: store.deadline,
            pickUpTime: null,
            available: true,
            pickupPoint: {
              id: null,
              name: store.title,
              address: store.description,
              pickUpTime: null,
            },
          });
        }
      }

      return locations;
    } catch (error) {
      console.error('❌ [getStoreAvailabilityByVariant] Erro:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Converte pickUpTime da Shopify para texto em português
   */
  translatePickUpTime(pickUpTime, available) {
    if (!pickUpTime) {
      return available ? 'Normalmente pronto entre 2 e 4 dias' : 'Sujeito a envio para loja';
    }

    const value = pickUpTime.toLowerCase().replace(/_/g, ' ');
    if (value.includes('2') && value.includes('4')) return 'Normalmente pronto entre 2 e 4 dias';
    if (value.includes('1') && value.includes('2')) return 'Normalmente pronto entre 1 e 2 dias';
    return available ? `Pronto em: ${value}` : 'Sujeito a envio para loja';
  }

  /**
   * Seleciona opção de frete no cart
   * @param {string} cartId - ID do cart (GID)
   * @param {string} deliveryGroupId - ID do deliveryGroup (GID)
   * @param {string} deliveryOptionHandle - Handle da opção de frete escolhida
   * @returns {Promise<Object>} - Cart atualizado
   */
  async selectDeliveryOption(cartId, deliveryGroupId, deliveryOptionHandle) {
    try {
      console.log(`🚚 [selectDeliveryOption] Selecionando opção de frete:`);
      console.log(`   Cart: ${cartId}`);
      console.log(`   DeliveryGroup: ${deliveryGroupId}`);
      console.log(`   Handle: ${deliveryOptionHandle}`);

      const mutation = `
        mutation cartSelectedDeliveryOptionsUpdate(
          $cartId: ID!
          $selectedDeliveryOptions: [CartSelectedDeliveryOptionInput!]!
        ) {
          cartSelectedDeliveryOptionsUpdate(
            cartId: $cartId
            selectedDeliveryOptions: $selectedDeliveryOptions
          ) {
            cart {
              id
              checkoutUrl
            }
            userErrors {
              field
              message
            }
            warnings {
              message
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          cartId,
          selectedDeliveryOptions: [{
            deliveryGroupId,
            deliveryOptionHandle
          }]
        }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const result = response.data?.data?.cartSelectedDeliveryOptionsUpdate;

      if (result?.userErrors?.length > 0) {
        const errorMessage = result.userErrors.map(e => e.message).join(', ');
        throw new Error(errorMessage);
      }

      if (result?.warnings?.length > 0) {
        console.warn('⚠️ [selectDeliveryOption] Avisos:', result.warnings.map(w => w.message).join(', '));
      }

      console.log(`✅ [selectDeliveryOption] Opção de frete selecionada com sucesso`);

      return result.cart;
    } catch (error) {
      console.error('❌ [selectDeliveryOption] Erro ao selecionar opção de frete:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Aplica cupom de desconto ao cart
   * @param {string} cartId - ID do cart (GID)
   * @param {string|Array<string>} discountCodes - Código(s) de desconto
   * @returns {Promise<Object>} - Cart atualizado com desconto aplicado
   */
  async applyDiscountCode(cartId, discountCodes) {
    try {
      // Garantir que discountCodes seja um array
      const codes = Array.isArray(discountCodes) ? discountCodes : [discountCodes];
      
      // Validar limite de cupons (5 de produto/pedido + 1 de frete = máximo 6 total)
      // Para simplificar, vamos limitar a 5 cupons de produto/pedido
      if (codes.length > 5) {
        console.warn(`⚠️ [applyDiscountCode] Mais de 5 cupons fornecidos, limitando a 5`);
        codes.splice(5);
      }
      
      // Filtrar códigos vazios
      const validCodes = codes.filter(code => code && code.trim().length > 0);
      
      if (validCodes.length === 0) {
        console.log('ℹ️ [applyDiscountCode] Nenhum código válido fornecido');
        // Retornar cart atual (sem alterações)
        return await this.getCart(cartId);
      }
      
      console.log(`🎟️ [applyDiscountCode] Aplicando cupom(es): ${validCodes.join(', ')}`);
      
      const mutation = `
        mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
          cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
            cart {
              id
              discountCodes {
                code
                applicable
              }
              cost {
                totalAmount {
                  amount
                  currencyCode
                }
                subtotalAmount {
                  amount
                  currencyCode
                }
                totalTaxAmount {
                  amount
                  currencyCode
                }
                totalDutyAmount {
                  amount
                  currencyCode
                }
              }
              discountAllocations {
                discountedAmount {
                  amount
                  currencyCode
                }
              }
            }
            userErrors {
              field
              message
            }
            warnings {
              message
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          cartId,
          discountCodes: validCodes
        }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const result = response.data?.data?.cartDiscountCodesUpdate;

      if (result?.userErrors?.length > 0) {
        const errorMessage = result.userErrors.map(e => e.message).join(', ');
        throw new Error(errorMessage);
      }

      if (result?.warnings?.length > 0) {
        console.warn('⚠️ [applyDiscountCode] Avisos:', result.warnings.map(w => w.message).join(', '));
      }

      console.log(`✅ [applyDiscountCode] Cupom aplicado com sucesso`);
      
      return result.cart;
    } catch (error) {
      console.error('❌ [Storefront] Erro ao aplicar cupom:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Busca cart completo
   * @param {string} cartId - ID do cart (GID)
   * @returns {Promise<Object>} - Dados completos do cart
   */
  async getCart(cartId) {
    try {
      const query = `
        query getCart($id: ID!) {
          cart(id: $id) {
            id
            checkoutUrl
            lines(first: 100) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      price {
                        amount
                        currencyCode
                      }
                      product {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
            cost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
              totalTaxAmount {
                amount
                currencyCode
              }
            }
            buyerIdentity {
              email
              customer {
                id
                email
              }
            }
            discountCodes {
              code
              applicable
            }
              discountAllocations {
                discountedAmount {
                  amount
                  currencyCode
                }
              }
            ...DeliveryGroups @defer
          }
        }
        
        fragment DeliveryGroups on Cart {
          deliveryGroups(first: 10, withCarrierRates: true) {
            edges {
              node {
                deliveryOptions {
                  handle
                  title
                  estimatedCost {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `;

      const response = await this.storefrontClient.post('', {
        query,
        variables: { id: cartId }
      }, {
        responseType: 'text', // Receber como texto para processar multipart
        headers: {
          'Accept': 'multipart/mixed; boundary=graphql'
        }
      });

      // Processar resposta (pode ser multipart ou JSON normal)
      let responseData = response.data;
      
      // Se for string (multipart), processar
      if (typeof responseData === 'string') {
        if (responseData.includes('--graphql')) {
          console.log('📦 [getCart] Resposta multipart detectada, processando...');
          const parsed = this.parseMultipartGraphQLResponse(responseData);
          if (parsed) {
            // parsed já retorna { data: {...} }, então acessar diretamente
            if (parsed.data?.cart) {
              responseData = parsed;
            } else if (parsed.data) {
              // Se parsed.data existe mas não tem cart, pode ser que o cart esteja diretamente
              responseData = { data: { cart: parsed.data } };
            } else {
              // parsed pode ser o cart diretamente
              responseData = { data: { cart: parsed } };
            }
          } else {
            // Tentar parsear como JSON
            try {
              responseData = JSON.parse(responseData);
            } catch (e) {
              console.error('❌ [getCart] Erro ao parsear resposta:', e.message);
            }
          }
        } else {
          // Tentar parsear como JSON
          try {
            responseData = JSON.parse(responseData);
          } catch (e) {
            // Manter como string
          }
        }
      }

      if (responseData?.errors?.length) {
        throw new Error(responseData.errors[0].message);
      }

      let cart = responseData?.data?.cart || responseData?.cart;
      
      // Se ainda não encontrou, verificar se está dentro de outro objeto (aninhamento duplo)
      if (!cart && responseData?.data?.data?.cart) {
        cart = responseData.data.data.cart;
      }
      
      // Última tentativa: verificar se data.data existe (aninhamento do parser)
      if (!cart && responseData?.data?.data) {
        // Se responseData.data.data é o cart diretamente
        if (responseData.data.data.id) {
          cart = responseData.data.data;
        } else if (responseData.data.data.cart) {
          cart = responseData.data.data.cart;
        }
      }

      if (!cart || !cart.id) {
        console.error('❌ [getCart] Cart não encontrado na resposta');
        console.error('❌ [getCart] responseData keys:', Object.keys(responseData || {}));
        console.error('❌ [getCart] responseData.data keys:', Object.keys(responseData?.data || {}));
        if (responseData?.data) {
          console.error('❌ [getCart] responseData.data:', JSON.stringify(responseData.data, null, 2).substring(0, 500));
        }
        return null;
      }

      return {
        id: cart.id,
        checkoutUrl: cart.checkoutUrl,
        lines: cart.lines?.edges?.map(edge => ({
          id: edge.node.id,
          quantity: edge.node.quantity,
          merchandise: edge.node.merchandise
        })) || [],
        cost: cart.cost ? {
          totalAmount: parseFloat(cart.cost.totalAmount?.amount || 0),
          subtotalAmount: parseFloat(cart.cost.subtotalAmount?.amount || 0),
          totalTaxAmount: parseFloat(cart.cost.totalTaxAmount?.amount || 0),
          totalDutyAmount: parseFloat(cart.cost.totalDutyAmount?.amount || 0),
          currencyCode: cart.cost.totalAmount?.currencyCode || 'BRL'
        } : null,
        buyerIdentity: cart.buyerIdentity || null,
        discountCodes: cart.discountCodes || [],
        discountAllocations: cart.discountAllocations || [],
        shippingRates: (() => {
          const rates = [];
          const deliveryGroups = cart.deliveryGroups || {};
          const groups = deliveryGroups.edges || [];
          
          for (const groupEdge of groups) {
            const group = groupEdge?.node;
            if (!group) continue;
            
            const options = group?.deliveryOptions || [];
            for (const option of options) {
              if (option && option.handle) {
                rates.push({
                  handle: option.handle,
                  title: option.title,
                  cost: parseFloat(option.estimatedCost?.amount || 0),
                  currencyCode: option.estimatedCost?.currencyCode || 'BRL',
              estimatedDays: null
                });
              }
            }
          }
          return rates;
        })()
      };
    } catch (error) {
      console.error('❌ [Storefront] Erro ao buscar cart:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Criar endereço para cliente na Shopify
   * @param {string} customerAccessToken - Token de acesso do cliente
   * @param {Object} addressData - Dados do endereço
   * @returns {Promise<Object>} - Endereço criado
   */
  async createCustomerAddress(customerAccessToken, addressData) {
    try {
      console.log('📍 [createCustomerAddress] Criando endereço na Shopify...');
      
      const mutation = `
        mutation customerAddressCreate($customerAccessToken: String!, $address: MailingAddressInput!) {
          customerAddressCreate(customerAccessToken: $customerAccessToken, address: $address) {
            customerAddress {
              id
              address1
              address2
              city
              province
              countryCodeV2
              zip
              firstName
              lastName
              phone
            }
            customerUserErrors {
              field
              message
            }
          }
        }
      `;

      // Separar nome completo em firstName e lastName
      const nameParts = (addressData.nome || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Concatenar endereço e número para address1
      let address1 = addressData.endereco || '';
      if (addressData.numero) {
        address1 = address1.trim();
        // Se já tiver vírgula ou número no endereço, adicionar espaço, senão adicionar vírgula
        if (address1 && !address1.match(/,\s*\d/)) {
          address1 = address1.includes(',') ? `${address1} ${addressData.numero}` : `${address1}, ${addressData.numero}`;
        } else if (!address1) {
          address1 = addressData.numero;
        }
      }

      const addressInput = {
        firstName: firstName,
        lastName: lastName,
        address1: address1,
        address2: addressData.complemento || null,
        city: addressData.cidade || '',
        province: addressData.estado || '',
        country: 'Brazil', // MailingAddressInput requer nome completo do país
        zip: (addressData.cep || '').replace(/\D/g, ''),
        phone: addressData.telefone || null
      };

      const response = await this.storefrontClient.post('', {
        query: mutation,
        variables: {
          customerAccessToken,
          address: addressInput
        }
      });

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const result = response.data?.data?.customerAddressCreate;

      if (result?.customerUserErrors?.length > 0) {
        throw new Error(result.customerUserErrors[0].message);
      }

      console.log('✅ [createCustomerAddress] Endereço criado com sucesso');
      return result.customerAddress;
    } catch (error) {
      console.error('❌ [createCustomerAddress] Erro:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Atualizar endereço de cliente na Shopify
   * @param {string} customerAccessToken - Token de acesso do cliente
   * @param {string} addressId - ID do endereço na Shopify (GID)
   * @param {Object} addressData - Dados atualizados do endereço
   * @returns {Promise<Object>} - Endereço atualizado
   */
  async updateCustomerAddress(customerAccessToken, addressId, addressData) {
    try {
      console.log('📍 [updateCustomerAddress] Atualizando endereço na Shopify:', addressId);
      
      const mutation = `
        mutation customerAddressUpdate($customerAccessToken: String!, $id: ID!, $address: MailingAddressInput!) {
          customerAddressUpdate(customerAccessToken: $customerAccessToken, id: $id, address: $address) {
            customerAddress {
              id
              address1
              address2
              city
              province
              countryCodeV2
              zip
              firstName
              lastName
              phone
            }
            customerUserErrors {
              field
              message
            }
          }
        }
      `;

      // Separar nome completo em firstName e lastName
      const nameParts = (addressData.nome || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Concatenar endereço e número para address1
      let address1 = addressData.endereco || '';
      if (addressData.numero) {
        address1 = address1.trim();
        // Se já tiver vírgula ou número no endereço, adicionar espaço, senão adicionar vírgula
        if (address1 && !address1.match(/,\s*\d/)) {
          address1 = address1.includes(',') ? `${address1} ${addressData.numero}` : `${address1}, ${addressData.numero}`;
        } else if (!address1) {
          address1 = addressData.numero;
        }
      }

      const addressInput = {
        firstName: firstName,
        lastName: lastName,
        address1: address1,
        address2: addressData.complemento || null,
        city: addressData.cidade || '',
        province: addressData.estado || '',
        country: 'Brazil', // MailingAddressInput requer nome completo do país
        zip: (addressData.cep || '').replace(/\D/g, ''),
        phone: addressData.telefone || null
      };

      // A Shopify Storefront API pode aceitar o ID completo (com query string) ou apenas o GID base
      // Vamos tentar primeiro com o ID completo (incluindo customer_access_token)
      let idToTry = addressId;
      
      if (!idToTry || !idToTry.startsWith('gid://')) {
        console.error('❌ [updateCustomerAddress] ID inválido - deve começar com gid://:', idToTry);
        throw new Error(`ID de endereço inválido: ${idToTry}`);
      }
      
      // Usar o ID completo como recebido (incluindo query string se tiver)
      let cleanId = idToTry;
      if (idToTry.includes('?')) {
        console.log('🔧 [updateCustomerAddress] Usando ID completo (inclui query string)');
      } else {
        console.log('🔧 [updateCustomerAddress] Usando ID sem query string');
      }
      
      console.log('🔍 [updateCustomerAddress] Atualizando com ID:', cleanId.substring(0, 100) + (cleanId.length > 100 ? '...' : ''));

      let response;
      let attemptWithFullId = cleanId.includes('?');
      
      // Tentar primeiro com o ID completo (se tiver query string)
      try {
        response = await this.storefrontClient.post('', {
          query: mutation,
          variables: {
            customerAccessToken,
            id: cleanId,
            address: addressInput
          }
        });
        
        // Se tiver erros, verificar se devemos tentar sem query string
        if (response.data?.errors?.length && attemptWithFullId) {
          const error = response.data.errors[0];
          if (error.extensions?.code === 'RESOURCE_NOT_FOUND' || error.message?.toLowerCase().includes('invalid id')) {
            console.warn('⚠️ [updateCustomerAddress] Falhou com ID completo, tentando sem query string...');
            // Extrair apenas o número do ID e reconstruir
            const idMatch = cleanId.match(/gid:\/\/shopify\/MailingAddress\/(\d+)/);
            if (idMatch && idMatch[1]) {
              cleanId = `gid://shopify/MailingAddress/${idMatch[1]}`;
              console.log('🔧 [updateCustomerAddress] Tentando com ID limpo:', cleanId);
              response = await this.storefrontClient.post('', {
                query: mutation,
                variables: {
                  customerAccessToken,
                  id: cleanId,
                  address: addressInput
                }
              });
            }
          }
        }
      } catch (err) {
        console.error('❌ [updateCustomerAddress] Erro na requisição:', err.message);
        throw err;
      }

      if (response.data?.errors?.length) {
        throw new Error(response.data.errors[0].message);
      }

      const result = response.data?.data?.customerAddressUpdate;

      if (result?.customerUserErrors?.length > 0) {
        const userError = result.customerUserErrors[0];
        console.error('❌ [updateCustomerAddress] Erro do usuário:', JSON.stringify(result.customerUserErrors, null, 2));
        throw new Error(userError.message);
      }

      console.log('✅ [updateCustomerAddress] Endereço atualizado com sucesso');
      return result.customerAddress;
    } catch (error) {
      console.error('❌ [updateCustomerAddress] Erro:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Deletar endereço de cliente na Shopify
   * @param {string} customerAccessToken - Token de acesso do cliente
   * @param {string} addressId - ID do endereço na Shopify (GID)
   * @returns {Promise<string>} - ID do endereço deletado
   */
  async deleteCustomerAddress(customerAccessToken, addressId) {
    try {
      console.log('📍 [deleteCustomerAddress] Deletando endereço na Shopify:', addressId);
      
      const mutation = `
        mutation customerAddressDelete($customerAccessToken: String!, $id: ID!) {
          customerAddressDelete(customerAccessToken: $customerAccessToken, id: $id) {
            deletedCustomerAddressId
            customerUserErrors {
              field
              message
            }
          }
        }
      `;

      // A Shopify Storefront API pode aceitar o ID completo (com query string) ou apenas o GID base
      // Vamos tentar primeiro com o ID completo (incluindo customer_access_token), depois sem
      let idToTry = addressId;
      
      if (!idToTry || !idToTry.startsWith('gid://')) {
        console.error('❌ [deleteCustomerAddress] ID inválido - deve começar com gid://:', idToTry);
        throw new Error(`ID de endereço inválido: ${idToTry}`);
      }
      
      console.log('🔍 [deleteCustomerAddress] Tentando deletar com ID completo:', idToTry.substring(0, 100) + '...');
      
      // Tentar primeiro com o ID completo (se tiver query string)
      let cleanId = idToTry;
      let attemptWithFullId = idToTry.includes('?');
      if (attemptWithFullId) {
        console.log('🔧 [deleteCustomerAddress] Tentando com ID completo (inclui query string)');
      }

      let response;
      try {
        response = await this.storefrontClient.post('', {
          query: mutation,
          variables: {
            customerAccessToken,
            id: cleanId
          }
        });
        
        // Se tiver erros e tentamos com ID completo, tentar sem query string
        if (response.data?.errors?.length && attemptWithFullId) {
          const error = response.data.errors[0];
          if (error.extensions?.code === 'RESOURCE_NOT_FOUND' || error.message?.toLowerCase().includes('invalid id')) {
            console.warn('⚠️ [deleteCustomerAddress] Falhou com ID completo, tentando sem query string...');
            // Extrair apenas o número do ID e reconstruir
            const idMatch = cleanId.match(/gid:\/\/shopify\/MailingAddress\/(\d+)/);
            if (idMatch && idMatch[1]) {
              cleanId = `gid://shopify/MailingAddress/${idMatch[1]}`;
              console.log('🔧 [deleteCustomerAddress] Tentando com ID limpo:', cleanId);
              response = await this.storefrontClient.post('', {
                query: mutation,
                variables: {
                  customerAccessToken,
                  id: cleanId
                }
              });
            }
          }
        }
      } catch (err) {
        console.error('❌ [deleteCustomerAddress] Erro na requisição:', err.message);
        throw err;
      }

      if (response.data?.errors?.length) {
        const error = response.data.errors[0];
        console.error('❌ [deleteCustomerAddress] Erro da API:', JSON.stringify(response.data.errors, null, 2));
        
        // Se for RESOURCE_NOT_FOUND, pode ser que o endereço já foi deletado ou não existe
        // Nesse caso, não tratar como erro crítico
        if (error.extensions?.code === 'RESOURCE_NOT_FOUND' || error.message === 'invalid id') {
          console.warn('⚠️ [deleteCustomerAddress] Endereço não encontrado na Shopify (pode já ter sido deletado)');
          // Retornar null para indicar que o endereço não existe mais na Shopify
          return null;
        }
        
        throw new Error(error.message);
      }

      const result = response.data?.data?.customerAddressDelete;

      if (result?.customerUserErrors?.length > 0) {
        const userError = result.customerUserErrors[0];
        console.error('❌ [deleteCustomerAddress] Erro do usuário:', JSON.stringify(result.customerUserErrors, null, 2));
        throw new Error(userError.message);
      }

      console.log('✅ [deleteCustomerAddress] Endereço deletado com sucesso');
      return result.deletedCustomerAddressId;
    } catch (error) {
      console.error('❌ [deleteCustomerAddress] Erro:', error.response?.data || error.message);
      throw error;
    }
  }

  // Adicionar tag ao cliente (Admin API)
  async addCustomerTag(shopifyCustomerId, tag) {
    try {
      // Garantir que ID é numérico para Admin API REST
      // Se vier como GID, extrair o número
      let customerId = shopifyCustomerId;
      if (customerId.includes('gid://shopify/Customer/')) {
        customerId = customerId.replace('gid://shopify/Customer/', '').split('?')[0];
      }
      
      console.log(`🏷️ [ShopifyService] Adicionando tag "${tag}" ao cliente ${customerId}`);

      // Buscar cliente primeiro
      const response = await this.client.get(`/customers/${customerId}.json`);
      const customer = response.data.customer;
      const currentTags = customer.tags || '';
      
      if (currentTags.includes(tag)) {
        console.log('✅ [ShopifyService] Tag já existe');
        return true;
      }

      const newTags = currentTags ? `${currentTags},${tag}` : tag;

      // Atualizar tags
      await this.client.put(`/customers/${customerId}.json`, {
        customer: {
          id: customerId,
          tags: newTags
        }
      });

      console.log('✅ [ShopifyService] Tag adicionada com sucesso');
      return true;
    } catch (error) {
      console.error('❌ [ShopifyService] Erro ao adicionar tag:', error.response?.data || error.message);
      throw error;
    }
  }

  // Remover tag do cliente (Admin API)
  async removeCustomerTag(shopifyCustomerId, tag) {
    try {
      let customerId = shopifyCustomerId;
      if (customerId.includes('gid://shopify/Customer/')) {
        customerId = customerId.replace('gid://shopify/Customer/', '').split('?')[0];
      }
      
      console.log(`🏷️ [ShopifyService] Removendo tag "${tag}" do cliente ${customerId}`);

      const response = await this.client.get(`/customers/${customerId}.json`);
      const customer = response.data.customer;
      const currentTags = customer.tags || '';
      
      if (!currentTags.includes(tag)) {
        console.log('✅ [ShopifyService] Tag não estava presente');
        return true;
      }

      // Remover tag da string (tratar vírgulas e espaços)
      const tagsArray = currentTags.split(',').map(t => t.trim());
      const newTagsArray = tagsArray.filter(t => t !== tag);
      const newTags = newTagsArray.join(',');

      await this.client.put(`/customers/${customerId}.json`, {
        customer: {
          id: customerId,
          tags: newTags
        }
      });

      console.log('✅ [ShopifyService] Tag removida com sucesso');
      return true;
    } catch (error) {
      console.error('❌ [ShopifyService] Erro ao remover tag:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new ShopifyService();
