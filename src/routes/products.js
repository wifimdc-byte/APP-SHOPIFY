const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const axios = require('axios');
const sharp = require('sharp');
const laireviewsService = require('../services/laireviewsService');
const shopifyService = require('../services/shopifyService');
const cacheService = require('../services/cacheService');

const router = express.Router();
const fsPromises = fs.promises;
const MAX_REVIEW_PHOTOS = 5;
const REVIEW_PHOTO_DIR = path.resolve(__dirname, '../../uploads/reviews');
const REVIEW_TABLES = ['melhor_casas_customer_reviews', 'customer_reviews'];
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://melhordascasas.com.br').replace(/\/$/, '');
const DEFAULT_REVIEW_COUNTRY = process.env.DEFAULT_REVIEW_COUNTRY || 'BR';

// Configurar multer para upload de arquivos
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos CSV são permitidos'), false);
    }
  }
});

// IDs das coleções principais (featured e secondary) - devem retornar TODOS os produtos
const MAIN_COLLECTIONS = {
  featured: 501821276465,  // Black Aniversário
  secondary: 522590126385  // Ofertas
};

const extractPhotosFromReview = (review) => {
  if (!review || typeof review !== 'object') return [];
  const urls = new Set();
  const isValidUrl = (value) => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image');
  };

  const tryParseJson = (value) => {
    const trimmed = value.trim();
    if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return false;
    try {
      const parsed = JSON.parse(trimmed);
      pushValue(parsed);
      return true;
    } catch (error) {
      return false;
    }
  };

  const pushValue = (value) => {
    if (!value && value !== 0) return;
    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }
    if (typeof value === 'string') {
      if (tryParseJson(value)) return;

      if (value.includes(',')) {
        value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach(pushValue);
        return;
      }

      if (isValidUrl(value)) {
        urls.add(value.trim());
      }
      return;
    }
    if (typeof value === 'object') {
      const objectKeys = [
        'url',
        'image',
        'image_url',
        'imageUrl',
        'photo',
        'photo_url',
        'photoUrl',
        'original',
        'thumbnail',
        'thumb',
        'src',
        'large',
        'medium',
        'small',
      ];
      objectKeys.forEach((key) => {
        if (value[key]) {
          pushValue(value[key]);
        }
      });
    }
  };

  const candidateKeys = [
    'photos',
    'photos_url',
    'photosUrl',
    'photoUrls',
    'photosArray',
    'photos_array',
    'pictures',
    'pictures_url',
    'images',
    'images_url',
    'imagesUrl',
    'imagesArray',
    'media',
    'media_urls',
    'mediaUrls',
    'attachments',
    'uploadImages',
    'upload_images',
    'photosOriginal',
    'photosThumb',
    'photosLarge',
    'photos_original',
    'photos_thumb',
    'photos_large',
    'photo_original',
    'photo_thumb',
    'photo_large',
    'image_original',
    'image_thumb',
    'image_large',
    'reviewPhotos',
    'review_photos',
    'photo',
    'photo_url',
    'image',
    'image_url',
    'imageUrl',
    'picture',
    'picture_url',
  ];

  candidateKeys.forEach((key) => {
    if (review[key]) {
      pushValue(review[key]);
    }
  });

  return Array.from(urls);
};

const convertPhotoBuffer = async (buffer) => {
  if (!buffer) {
    return { buffer, extension: 'jpg' };
  }

  try {
    const jpgBuffer = await sharp(buffer).rotate().jpeg({ quality: 85 }).toBuffer();
    return { buffer: jpgBuffer, extension: 'jpg' };
  } catch (jpegError) {
    console.warn('[products] Falha ao converter foto para JPG:', jpegError.message);
  }

  try {
    const webpBuffer = await sharp(buffer).rotate().webp({ quality: 80 }).toBuffer();
    return { buffer: webpBuffer, extension: 'webp' };
  } catch (webpError) {
    console.warn('[products] Falha ao converter foto para WEBP:', webpError.message);
  }

  return { buffer, extension: 'jpg' };
};

const saveBase64ReviewPhoto = async (dataUrl) => {
  if (typeof dataUrl !== 'string') return null;

  const matches = dataUrl.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) return null;

  const base64Data = matches[2];
  const originalBuffer = Buffer.from(base64Data, 'base64');

  const { buffer: convertedBuffer, extension } = await convertPhotoBuffer(originalBuffer);
  const fileExtension = extension || 'jpg';
  const fileName = `review-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExtension}`;

  await fsPromises.mkdir(REVIEW_PHOTO_DIR, { recursive: true });
  const filePath = path.join(REVIEW_PHOTO_DIR, fileName);
  const finalBuffer = convertedBuffer || originalBuffer;
  await fsPromises.writeFile(filePath, finalBuffer);

  return {
    path: `/uploads/reviews/${fileName}`,
    buffer: finalBuffer,
    base64: finalBuffer.toString('base64'),
    mimeType: fileExtension === 'jpg' ? 'image/jpeg' : `image/${fileExtension}`,
  };
};

const processIncomingReviewPhotos = async (photos = [], options = {}) => {
  if (!Array.isArray(photos)) return { local: [], remote: [] };
  const savedPhotos = [];
  const remotePhotos = [];
  const { productShopifyId = null } = options;

  for (const rawPhoto of photos.slice(0, MAX_REVIEW_PHOTOS)) {
    if (typeof rawPhoto !== 'string') continue;
    const trimmed = rawPhoto.trim();

    if (trimmed.startsWith('data:image')) {
      try {
        const savedPhoto = await saveBase64ReviewPhoto(trimmed);
        if (savedPhoto?.path) {
          savedPhotos.push(savedPhoto.path);
        }

        if (productShopifyId) {
          const remoteUrl = await laireviewsService.uploadReviewPhoto(
            productShopifyId,
            savedPhoto?.base64
          );
          if (remoteUrl) {
            remotePhotos.push(remoteUrl);
          }
        }
      } catch (error) {
        console.error('[products] Erro ao salvar foto da avaliação:', error.message);
      }
    } else if (trimmed.startsWith('http')) {
      savedPhotos.push(trimmed);
    }
  }

  return { local: savedPhotos, remote: remotePhotos };
};

const ensureAbsoluteUrl = (value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const sanitizedBase = APP_BASE_URL.endsWith('/')
    ? APP_BASE_URL.slice(0, -1)
    : APP_BASE_URL;

  const sanitizedPath = value.startsWith('/') ? value : `/${value}`;
  return `${sanitizedBase}${sanitizedPath}`;
};

const buildPublicPhotoUrls = (photos = []) =>
  photos
    .map((photoPath) => ensureAbsoluteUrl(photoPath))
    .filter(Boolean);

const resolveShopifyProductId = async (productCode) => {
  if (!productCode) return null;

  const codeAsString = productCode.toString();
  try {
    const variantResponse = await shopifyService.client.get(
      `/variants/${codeAsString}.json`
    );
    const variantId = variantResponse?.data?.variant?.product_id;
    if (variantId) {
      return variantId.toString();
    }
  } catch (variantError) {
    console.warn(
      `[products] Não foi possível obter product_id via variante ${codeAsString}:`,
      variantError.message
    );
  }

  try {
    const productResponse = await shopifyService.client.get(
      `/products/${codeAsString}.json`
    );
    const productId = productResponse?.data?.product?.id;
    if (productId) {
      return productId.toString();
    }
  } catch (productError) {
    console.warn(
      `[products] Não foi possível obter product_id diretamente ${codeAsString}:`,
      productError.message
    );
  }

  return codeAsString;
};

const insertCustomerReviewRecord = async (payload) => {
  const columns = `
    product_id, product_code, name, email, rating, feedback, photos, status, source, metadata
  `;
  for (const table of REVIEW_TABLES) {
    const query = `
      INSERT INTO ${table} (${columns})
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)
      RETURNING id, status, photos, created_at
    `;

    const useProductId = table.includes('melhor_casas_') ? payload.productId : null;
    const params = [
      useProductId,
      payload.productCode,
      payload.name,
      payload.email,
      payload.rating,
      payload.feedback,
      JSON.stringify(payload.photos || []),
      payload.status || 'pendente',
      payload.source || 'app',
      JSON.stringify(payload.metadata || {}),
    ];

    try {
      const result = await pool.query(query, params);
      return result;
    } catch (error) {
      if (error.code === '42P01') {
        console.warn(`[products] Tabela ${table} não encontrada. Tentando próxima...`);
        continue;
      }
      throw error;
    }
  }

  const tableError = new Error('Tabela de avaliações de clientes não encontrada');
  tableError.code = 'TABLE_NOT_FOUND';
  throw tableError;
};

// Calcular frete por CEP e produto (público, para uso no app)
// IMPORTANTE: Esta rota deve vir ANTES de todas as outras para evitar conflito
// Usa código do Shopify (codigo) ao invés do ID do banco
router.post('/shipping/:codigo', async (req, res) => {
  console.log('🚚 [Shipping] ROTA CHAMADA - Requisição recebida:', { 
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    params: req.params, 
    body: req.body 
  });
  try {
    const { codigo } = req.params;
    const { cep } = req.body;

    if (!cep) {
      return res.status(400).json({ error: 'CEP é obrigatório' });
    }

    // Validar formato do CEP (aceita com ou sem hífen)
    const cepClean = cep.replace(/\D/g, '');
    if (cepClean.length !== 8) {
      return res.status(400).json({ error: 'CEP inválido' });
    }

    // Buscar produto pelo código do Shopify
    const productResult = await pool.query(
      `SELECT id, codigo, nome FROM melhor_casas_products WHERE codigo = $1 AND disponivel = true`,
      [codigo]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const product = productResult.rows[0];

    // Buscar variante do produto no Shopify usando o código diretamente
    const variant = await shopifyService.getProductVariant(codigo);
    
    if (!variant) {
      return res.status(400).json({ error: 'Variante do produto não encontrada no Shopify' });
    }

    // Buscar cidade e estado pelo CEP usando ViaCEP
    let city = '';
    let province = '';
    try {
      const viaCepResponse = await axios.get(`https://viacep.com.br/ws/${cepClean}/json/`);
      if (viaCepResponse.data && !viaCepResponse.data.erro) {
        city = viaCepResponse.data.localidade || '';
        province = viaCepResponse.data.uf || '';
      }
    } catch (viaCepError) {
      console.warn('Erro ao buscar CEP no ViaCEP:', viaCepError.message);
    }

    // Preparar endereço de entrega
    const shippingAddress = {
      zip: cepClean,
      city: city || 'Rio de Janeiro',
      province: province || 'RJ',
      country: 'BR',
      delivery_type: 'delivery'
    };

    // Preparar line items (1 unidade do produto)
    const lineItems = [{
      variant_id: variant.id,
      quantity: 1
    }];

    // Calcular frete
    const rates = await shopifyService.calculateShippingRates(lineItems, shippingAddress);

    // Adicionar opção de retirada na loja
    const pickupRate = {
      title: 'Retirar na loja',
      service: 'Retirada na loja',
      price: '0.00',
      code: 'pickup',
      source: 'store_pickup',
      delivery_days: 1,
      description: 'Melhor das Casas',
      deadline: '1-2 dias úteis',
    };

    const allRates = [pickupRate, ...rates];

    res.json({
      success: true,
      rates: allRates,
      cep: cepClean
    });
  } catch (error) {
    console.error('Erro ao calcular frete:', error);
    res.status(500).json({ 
      error: 'Erro ao calcular frete',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Listar produtos (público)
router.get('/', async (req, res) => {
  try {
    const { categoria, busca, collection_id, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    
    // Se for uma coleção principal e for a primeira página, retornar TODOS os produtos
    const isMainCollection = collection_id && (
      parseInt(collection_id) === MAIN_COLLECTIONS.featured || 
      parseInt(collection_id) === MAIN_COLLECTIONS.secondary
    );
    
    // Para coleções principais na página inicial, usar limite muito alto
    const limitNum = isMainCollection && pageNum === 1 ? 10000 : parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;
    
    // Criar chave de cache baseada nos parâmetros da query
    // Não usar cache para collections (dados dinâmicos) ou busca (resultados variam)
    const cacheKey = collection_id || busca 
      ? null 
      : `products:${categoria || 'all'}:${pageNum}:${limitNum}`;
    
    // Verificar cache (apenas para queries simples sem collection_id ou busca)
    if (cacheKey && pageNum === 1) {
      const cached = cacheService.getProductsList(cacheKey);
      if (cached) {
        console.log('✅ Retornando produtos do cache:', cacheKey);
        return res.json(cached);
      }
    }
    
    console.log('📦 Buscando produtos:', { 
      page: pageNum, 
      limit: limitNum, 
      categoria, 
      busca, 
      collection_id,
      isMainCollection,
      offset 
    });

    let query = `
      SELECT id, codigo, nome, descricao, 
             COALESCE(CAST(preco_varejo AS DECIMAL(10,2)), 0) as preco_varejo, 
             COALESCE(CAST(preco_exclusivo AS DECIMAL(10,2)), 0) as preco_exclusivo,
             COALESCE(CAST(preco_atacado AS DECIMAL(10,2)), 0) as preco_atacado, 
             COALESCE(quantidade_minima_atacado, 2) as quantidade_minima_atacado, 
             categoria, COALESCE(estoque, 0) as estoque, imagem_url, 
             COALESCE(imagens, '[]'::jsonb) as imagens, disponivel,
             CAST(rating_average AS DECIMAL(3,2)) as rating_average, 
             COALESCE(rating_total, 0) as rating_total,
             sku, barcode
      FROM melhor_casas_products 
      WHERE disponivel = true
    `;
    let params = [];
    let paramCount = 0;

    if (categoria) {
      paramCount++;
      query += ` AND categoria = $${paramCount}`;
      params.push(categoria);
    }

    // Se collection_id for fornecido, buscar IDs dos produtos dessa collection
    // IMPORTANTE: Usar método rápido que retorna apenas IDs, sem buscar produtos completos
    let productCodesFromCollection = null;
    if (collection_id) {
      try {
        const shopifyService = require('../services/shopifyService');
        
        // Verificar cache primeiro (TTL de 30 minutos)
        const cacheKey = `collection:ids:${collection_id}`;
        const cachedIds = cacheService.get(cacheKey);
        
        if (cachedIds) {
          console.log(`✅ IDs da collection ${collection_id} encontrados no cache (${cachedIds.length} produtos)`);
          productCodesFromCollection = cachedIds;
        } else {
          console.log(`🔍 Buscando IDs dos produtos da collection ${collection_id}...`);
          
          // Método otimizado: buscar apenas IDs da collection (sem produtos completos)
          productCodesFromCollection = await shopifyService.getCollectionProductIds(collection_id);
          
          console.log(`✅ ${productCodesFromCollection.length} IDs de produtos encontrados na collection`);
          
          // Cachear os IDs por 30 minutos
          cacheService.set(cacheKey, productCodesFromCollection, 1800);
          console.log(`💾 IDs da collection ${collection_id} cacheados por 30 minutos`);
        }
        
        if (productCodesFromCollection.length === 0) {
          console.log('⚠️ Collection vazia, retornando array vazio');
          return res.json({
            products: [],
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: 0,
              pages: 0
            }
          });
        }
        
        console.log(`📋 Códigos dos produtos: ${productCodesFromCollection.slice(0, 5).join(', ')}... (total: ${productCodesFromCollection.length})`);
        
        // Verificar quantos produtos dessa collection já estão no banco
        if (productCodesFromCollection.length > 0) {
          try {
            const sampleSize = Math.min(10, productCodesFromCollection.length);
            const sampleCodes = productCodesFromCollection.slice(0, sampleSize);
            const checkQuery = `SELECT COUNT(*) as count FROM melhor_casas_products WHERE codigo IN (${sampleCodes.map((_, i) => `$${i + 1}`).join(',')}) AND disponivel = true`;
            const checkResult = await pool.query(checkQuery, sampleCodes);
            const foundCount = parseInt(checkResult.rows[0]?.count || 0);
            const percentageFound = (foundCount / sampleSize * 100).toFixed(1);
            
            console.log(`📊 Verificação: ${foundCount} de ${sampleSize} produtos de amostra encontrados no banco (${percentageFound}%)`);
            
            // Se menos de 50% dos produtos estão no banco, sincronizar essa collection
            if (percentageFound < 50) {
              console.log(`🔄 Collection não está sincronizada (${percentageFound}% encontrados, ${productCodesFromCollection.length} produtos), sincronizando...`);
              
              // Para collections até 200 produtos, sincronizar síncrono ANTES da query para retornar todos os produtos
              // Para collections maiores, sincronizar em background (pode demorar muito tempo)
              const shouldSyncSynchronous = productCodesFromCollection.length <= 200;
              
              const syncFunction = async () => {
                try {
                  const collectionProducts = await shopifyService.getProductsByCollection(collection_id);
                  console.log(`📦 Sincronizando ${collectionProducts.length} produtos da collection ${collection_id}...`);
                  
                  let synced = 0;
                  let updated = 0;
                  
                  for (const shopifyProduct of collectionProducts) {
                    if (!shopifyProduct.variants || shopifyProduct.variants.length === 0) continue;
                    
                    const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
                    
                    // Verificar se produto existe
                    const existingProduct = await pool.query(
                      'SELECT id FROM melhor_casas_products WHERE codigo = $1',
                      [mappedProduct.codigo]
                    );
                    
                    if (existingProduct.rows.length > 0) {
                      // Atualizar - sempre marcar como disponível se está na API
                      await pool.query(`
                        UPDATE melhor_casas_products 
                        SET nome = $1, categoria = $2, preco_varejo = $3, 
                            preco_atacado = $4, preco_exclusivo = $5, 
                            descricao = $6, imagem_url = $7, estoque = $8, 
                            disponivel = true, tags = $9, updated_at = $10
                        WHERE codigo = $11
                      `, [
                        mappedProduct.nome,
                        mappedProduct.categoria,
                        mappedProduct.preco_varejo,
                        mappedProduct.preco_atacado,
                        mappedProduct.preco_exclusivo,
                        mappedProduct.descricao,
                        mappedProduct.imagem_url,
                        mappedProduct.estoque,
                        JSON.stringify(mappedProduct.tags),
                        mappedProduct.updated_at,
                        mappedProduct.codigo
                      ]);
                      updated++;
                    } else {
                      // Inserir
                      await pool.query(`
                        INSERT INTO melhor_casas_products 
                        (codigo, nome, categoria, preco_varejo, preco_atacado, 
                         preco_exclusivo, descricao, imagem_url, estoque, 
                         disponivel, tags, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                        ON CONFLICT (codigo) DO NOTHING
                      `, [
                        mappedProduct.codigo,
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
                        mappedProduct.created_at,
                        mappedProduct.updated_at
                      ]);
                      synced++;
                    }
                  }
                  
                  console.log(`✅ Collection ${collection_id} sincronizada: ${synced} novos, ${updated} atualizados`);
                  return { synced, updated };
                } catch (syncError) {
                  console.error(`❌ Erro ao sincronizar collection ${collection_id}:`, syncError.message);
                  throw syncError;
                }
              };
              
              // SEMPRE sincronizar em background para não bloquear a resposta
              // A resposta será enviada com os produtos já existentes no banco
              console.log(`📦 Collection (${productCodesFromCollection.length} produtos), sincronizando em background...`);
              setImmediate(async () => {
                try {
                  await syncFunction();
                  // Invalidar cache de IDs da collection após sincronização
                  cacheService.delete(`collection:ids:${collection_id}`);
                  // Invalidar cache de listas de produtos também
                  const keys = cacheService.cache.keys();
                  keys.forEach(key => {
                    if (key.startsWith('products:list:')) {
                      cacheService.delete(key);
                    }
                  });
                  console.log(`🔄 Cache invalidado para collection ${collection_id}`);
                } catch (syncError) {
                  console.error(`❌ Erro ao sincronizar collection ${collection_id} em background:`, syncError.message);
                }
              });
            }
          } catch (checkError) {
            console.error('Erro ao verificar produtos no banco:', checkError.message);
          }
        }
        
      } catch (error) {
        console.error('❌ Erro ao buscar IDs da collection:', error.message);
        console.error('Stack:', error.stack);
        // Continuar com busca normal se houver erro
        productCodesFromCollection = null;
      }
    }
    
    // Se temos códigos de produtos da collection, filtrar por eles
    if (productCodesFromCollection && productCodesFromCollection.length > 0) {
      // Limitar a quantidade de códigos para evitar query muito grande
      // PostgreSQL tem limite de ~65535 parâmetros, mas vamos limitar a 1000 para segurança
      const maxCodes = 1000;
      const codesToUse = productCodesFromCollection.slice(0, maxCodes);
      
      if (codesToUse.length < productCodesFromCollection.length) {
        console.log(`⚠️ Limitando a ${maxCodes} produtos (total: ${productCodesFromCollection.length})`);
      }
      
      const placeholders = codesToUse.map((_, i) => `$${paramCount + i + 1}`).join(',');
      query += ` AND codigo IN (${placeholders})`;
      params = params.concat(codesToUse);
      paramCount += codesToUse.length;
    }

    if (busca) {
      paramCount++;
      // Buscar por nome, descricao, barcode ou sku
      query += ` AND (nome ILIKE $${paramCount} OR descricao ILIKE $${paramCount} OR barcode = $${paramCount + 1} OR sku ILIKE $${paramCount})`;
      params.push(`%${busca}%`);
      paramCount++;
      params.push(busca); // Barcode é busca exata
    }

    const limitParam = paramCount + 1;
    const offsetParam = paramCount + 2;
    query += ` ORDER BY nome LIMIT $${limitParam} OFFSET $${offsetParam}`;
    params.push(parseInt(limit) || 20, parseInt(offset) || 0);

    console.log('🔍 Query:', query);
    console.log('📋 Params:', params);
    console.log('📊 Total de params:', params.length);
    
    // Adicionar campos de rating na query se as colunas existirem
    const result = await pool.query(query, params);
    console.log('✅ Produtos encontrados:', result.rows.length);
    
    // Log para debug se poucos produtos encontrados
    if (productCodesFromCollection && productCodesFromCollection.length > 0 && result.rows.length < productCodesFromCollection.length) {
      const percentageFound = (result.rows.length / productCodesFromCollection.length * 100).toFixed(1);
      console.log(`📊 ${result.rows.length} de ${productCodesFromCollection.length} produtos da collection encontrados no banco (${percentageFound}%)`);
      
      // Se nenhum produto encontrado, verificar formato dos códigos (para debug)
      if (result.rows.length === 0) {
        console.log(`⚠️ Nenhum produto encontrado no banco para os códigos da collection`);
        console.log(`📋 Primeiros códigos da collection: ${productCodesFromCollection.slice(0, 5).join(', ')}`);
        
      try {
        const sampleCodesCheck = productCodesFromCollection.slice(0, 5);
        const checkQuery = `SELECT codigo FROM melhor_casas_products WHERE codigo IN (${sampleCodesCheck.map((_, i) => `$${i + 1}`).join(',')}) LIMIT 5`;
        const checkResult = await pool.query(checkQuery, sampleCodesCheck);
          console.log(`📋 Verificação: ${checkResult.rows.length} de ${sampleCodesCheck.length} códigos de amostra encontrados no banco`);
        if (checkResult.rows.length > 0) {
            console.log(`✅ Códigos encontrados: ${checkResult.rows.map(r => r.codigo).join(', ')}`);
          }
        } catch (checkError) {
          console.error('Erro ao verificar códigos:', checkError.message);
        }
      }
    }

    // Contar total para paginação
    let countQuery = 'SELECT COUNT(*) FROM melhor_casas_products WHERE disponivel = true';
    let countParams = [];
    let countParamCount = 0;

    if (categoria) {
      countParamCount++;
      countQuery += ` AND categoria = $${countParamCount}`;
      countParams.push(categoria);
    }

    // Se temos códigos de produtos da collection, filtrar por eles na contagem também
    if (productCodesFromCollection && productCodesFromCollection.length > 0) {
      const maxCodes = 1000;
      const codesToUse = productCodesFromCollection.slice(0, maxCodes);
      const placeholders = codesToUse.map((_, i) => `$${countParamCount + i + 1}`).join(',');
      countQuery += ` AND codigo IN (${placeholders})`;
      countParams = countParams.concat(codesToUse);
      countParamCount += codesToUse.length;
    }

    if (busca) {
      countParamCount++;
      countQuery += ` AND (nome ILIKE $${countParamCount} OR descricao ILIKE $${countParamCount} OR barcode = $${countParamCount + 1} OR sku ILIKE $${countParamCount})`;
      countParams.push(`%${busca}%`);
      countParamCount++;
      countParams.push(busca); // Barcode é busca exata
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0]?.count || 0);
    console.log('📊 Total de produtos:', total);

    const response = {
      products: result.rows || [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: limitNum > 0 ? Math.ceil(total / limitNum) : 0
      }
    };
    
    // Salvar no cache (apenas para primeira página de queries simples)
    if (cacheKey && pageNum === 1) {
      cacheService.setProductsList(cacheKey, response);
      console.log('💾 Resposta salva no cache:', cacheKey);
    }
    
    console.log('📤 Enviando resposta:', { 
      productsCount: response.products.length, 
      pagination: response.pagination 
    });
    
    res.json(response);
  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Endpoint de teste para debug do menu
router.get('/collections/debug', async (req, res) => {
  try {
    const shopifyService = require('../services/shopifyService');
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
            }
          }
        }
      }
    `;
    
    const axios = require('axios');
    const response = await axios.post(
      `https://e4ec7f-f5.myshopify.com/admin/api/2024-01/graphql.json`,
      { query: graphqlQuery },
      {
        headers: {
          'X-Shopify-Access-Token': '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',
          'Content-Type': 'application/json',
        }
      }
    );
    
    res.json({
      success: true,
      menu: response.data.data?.menu,
      rawResponse: response.data
    });
  } catch (error) {
    console.error('Erro no debug do menu:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: error.message,
      stack: error.stack
    });
  }
});

// Buscar collections da Shopify (Collections Bar)
router.get('/collections', async (req, res) => {
  try {
    // Verificar cache primeiro (TTL de 30 minutos)
    const cacheKey = 'collections:bar:menu';
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
      console.log('✅ [products/collections] Retornando collections do cache');
      return res.json(cached);
    }
    
    const shopifyService = require('../services/shopifyService');
    // Buscar collections do menu "collections-bar"
    const collections = await shopifyService.getCollectionsBarMenu();
    
    // Log das collections brutas antes de formatar
    console.log('🔍 [products/collections] Collections brutas recebidas:', collections.length);
    collections.forEach(c => {
      console.log(`  - ${c.title} (${c.id}):`, {
        hasSubsections: !!(c.subsections && c.subsections.length > 0),
        subsectionsCount: c.subsections?.length || 0,
        subsections: c.subsections || []
      });
    });
    
    // Retornar collections formatadas com subseções
    const collectionsFormatted = collections.map((collection) => {
      const formatted = {
      id: collection.id,
      nome: collection.title,
      handle: collection.handle,
        temProdutos: true, // Collections da Shopify sempre têm produtos
        subsections: [] // Sempre inicializar como array vazio
      };
      
      // Adicionar subseções se existirem
      if (collection.subsections && collection.subsections.length > 0) {
        console.log(`📋 [products/collections] Collection "${formatted.nome}" (${formatted.id}) TEM ${collection.subsections.length} subsections:`);
        collection.subsections.forEach(sub => {
          console.log(`    └─ ${sub.title} (${sub.id})`);
        });
        formatted.subsections = collection.subsections.map((subsection) => ({
          id: subsection.id,
          nome: subsection.title,
          handle: subsection.handle,
          temProdutos: true
        }));
        console.log(`✅ [products/collections] Collection "${formatted.nome}" formatada com ${formatted.subsections.length} subsections`);
      } else {
        console.log(`⚠️ [products/collections] Collection "${formatted.nome}" (${formatted.id}) NÃO TEM subsections - collection.subsections =`, collection.subsections);
      }
      
      return formatted;
    });
    
    console.log(`✅ ${collectionsFormatted.length} collections encontradas no menu collections-bar`);
    
    // Log collections com subsections
    const collectionsWithSubsections = collectionsFormatted.filter(c => c.subsections && c.subsections.length > 0);
    if (collectionsWithSubsections.length > 0) {
      console.log(`📋 Total de collections com subsections: ${collectionsWithSubsections.length}`);
      collectionsWithSubsections.forEach(c => {
        console.log(`  - ${c.nome} (${c.id}): ${c.subsections.length} subsections`);
      });
    } else {
      console.log('⚠️ Nenhuma collection com subsections encontrada');
    }
    
    // Log final antes de retornar
    console.log('📤 [products/collections] Retornando collections formatadas:', collectionsFormatted.length);
    const finalCollectionsWithSubsections = collectionsFormatted.filter(c => c.subsections && c.subsections.length > 0);
    console.log(`📤 [products/collections] Collections com subsections no retorno: ${finalCollectionsWithSubsections.length}`);
    if (finalCollectionsWithSubsections.length > 0) {
      finalCollectionsWithSubsections.forEach(c => {
        console.log(`  ✅ ${c.nome} (${c.id}): ${c.subsections.length} subsections`);
      });
    }
    
    const response = {
      success: true,
      categories: collectionsFormatted
    };
    
    // Cachear resposta por 30 minutos (1800 segundos)
    cacheService.set(cacheKey, response, 1800);
    console.log('💾 [products/collections] Resposta cacheadada por 30 minutos');
    
    res.json(response);
  } catch (error) {
    console.error('Erro ao buscar collections:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Buscar categorias (mantido para compatibilidade)
router.get('/categories', async (req, res) => {
  try {
    // Verificar cache primeiro
    const cached = cacheService.getCategories('all');
    if (cached) {
      console.log('✅ Retornando categorias do cache');
      return res.json(cached);
    }
    
    // Definir as categorias fixas com "Oferta" em primeiro lugar
    const fixedCategories = [
      'Oferta', // Super Ofertas em primeiro lugar
      'Utilidades',
      'Bijuteria', 
      'Utensílios',
      'CaMeBa',
      'Conveniência',
      'Decoração',
      'Papelaria',
      'Variedades',
      'Led',
      'Eletrônicos',
      'Brinquedos',
      'Pet'
    ];
    
    // Buscar produtos por categoria
    const categoriesWithProducts = [];
    
    for (const category of fixedCategories) {
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM melhor_casas_products 
        WHERE categoria = $1 AND disponivel = true
      `, [category]);
      
      const productCount = parseInt(result.rows[0].count);
      
      categoriesWithProducts.push({
        nome: category,
        quantidade: productCount,
        temProdutos: productCount > 0
      });
    }
    
    const response = { 
      categories: categoriesWithProducts,
      total: fixedCategories.length
    };
    
    // Salvar no cache
    cacheService.setCategories('all', response);
    
    res.json(response);
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar HTML completo das reviews (reviewImporter)
router.get('/:id/reviews-full', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    // Remover limitador - carregar todas as reviews de uma vez (a API sempre retorna as mesmas 10, então vamos pegar todas)
    const perPage = 100; // Aumentar para tentar pegar todas de uma vez
    console.log('[products] Buscando reviews completas para produto ID:', id, 'página:', page);
    
    // Buscar código do produto
    const productResult = await pool.query(
      'SELECT codigo FROM melhor_casas_products WHERE id = $1',
      [id]
    );

    if (productResult.rows.length === 0) {
      console.log('[products] Produto não encontrado:', id);
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const productCode = productResult.rows[0].codigo;
    console.log('[products] Código do produto encontrado:', productCode);
    
    // Buscar product_id do Shopify através do variant_id
    // IMPORTANTE: A API do Laireviews precisa do product_id, não do variant_id
    let productShopifyId = null;
    
    // Verificar cache primeiro
    const cachedProductId = cacheService.getVariantToProduct(productCode);
    if (cachedProductId) {
      console.log('[products] ✅ Product ID encontrado no cache:', cachedProductId);
      productShopifyId = cachedProductId;
    } else {
      try {
        const shopifyService = require('../services/shopifyService');
        
        // Tentativa 1: Buscar variant (mais comum)
        try {
          const response = await shopifyService.client.get(`/variants/${productCode}.json`);
          
          if (response.data?.variant?.product_id) {
            productShopifyId = response.data.variant.product_id.toString();
            console.log('[products] ✅ Product ID encontrado via variant:', productShopifyId);
            // Cachear resultado
            cacheService.setVariantToProduct(productCode, productShopifyId);
          }
        } catch (variantError) {
          // Tentativa 2: Buscar produto diretamente (pode ser que o código já seja o product_id)
          try {
            const productResponse = await shopifyService.client.get(`/products/${productCode}.json`);
            
            if (productResponse.data?.product?.id) {
              productShopifyId = productResponse.data.product.id.toString();
              console.log('[products] ✅ Product ID encontrado diretamente:', productShopifyId);
              // Cachear resultado
              cacheService.setVariantToProduct(productCode, productShopifyId);
            }
          } catch (productError) {
            // Tentativa 3: Buscar pelo handle do produto
            try {
              const product = await shopifyService.getProduct(productCode);
              if (product?.id) {
                productShopifyId = product.id.toString();
                console.log('[products] ✅ Product ID encontrado via handle:', productShopifyId);
                // Cachear resultado
                cacheService.setVariantToProduct(productCode, productShopifyId);
              }
            } catch (handleError) {
              // Última tentativa: usar o código como product_id
              productShopifyId = productCode;
              console.log('[products] ⚠️ Usando código como product_id (última tentativa):', productShopifyId);
            }
          }
        }
      } catch (error) {
        console.log('[products] ⚠️ Erro ao buscar product_id:', error.message);
        productShopifyId = productCode;
      }
    }
    
    if (!productShopifyId) {
      return res.status(500).json({ error: 'Não foi possível determinar o product_id do Shopify' });
    }
    
    // Usar o serviço Laireviews para buscar reviews diretamente da API
    const laireviewsService = require('../services/laireviewsService');
    
    console.log('[products] ========================================');
    console.log('[products] BUSCANDO REVIEWS VIA API LAIREVIEWS');
    console.log('[products] Product ID:', productShopifyId);
    console.log('[products] Página:', page, 'Por página:', perPage);
    console.log('[products] ========================================');
    
    const reviewsData = await laireviewsService.getReviews(productShopifyId, page, perPage, 'homePage');
    
    console.log('[products] ========================================');
    console.log('[products] RESULTADO DA API LAIREVIEWS:');
    console.log('[products] Reviews encontradas:', reviewsData?.reviews?.length || 0);
    console.log('[products] Total:', reviewsData?.total || 0);
    console.log('[products] ReviewCountInfo:', reviewsData?.reviewCountInfo ? 'SIM' : 'NÃO');
    console.log('[products] ========================================');
    
    if (!reviewsData || (reviewsData.errors === true)) {
      console.log('[products] ⚠️ API retornou erro ou sem dados');
      return res.json({
        headerHtml: null,
        reviewsHtml: [],
        iframeContent: null,
        fullHtml: null
      });
    }
    
    // Processar reviews individuais em formato estruturado
    let reviewsArray = reviewsData.reviews || [];
    
    console.log(`[products] Reviews disponíveis: ${reviewsArray.length}`);
    console.log(`[products] Total da API: ${reviewsData.total || 0}`);
    
    // Processar reviews em formato estruturado para o app
    const processedReviews = reviewsArray.map((review, index) => {
      const reviewId = review.id || review.review_id || `review-${index}`;
      const author = review.author || 'Cliente Anônimo';
      const rating = review.rating || 5;
      // Função para corrigir formato de data (detectar e corrigir MM/DD/YYYY para DD/MM/YYYY)
      const fixDateFormat = (dateString) => {
        if (!dateString || dateString === 'Data Desconhecida') {
          return dateString;
        }
        
        // Remover horário se existir
        let date = dateString.split(' ')[0];
        
        // Verificar se está no formato MM/DD/YYYY (americano)
        const americanFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        const match = date.match(americanFormat);
        
        if (match) {
          const month = parseInt(match[1], 10);
          const day = parseInt(match[2], 10);
          const year = match[3];
          
          // Se o primeiro número é maior que 12, provavelmente já está em formato brasileiro
          // Se o segundo número é maior que 12, provavelmente está em formato americano
          if (month > 12 && day <= 12) {
            // Já está em formato brasileiro (DD/MM/YYYY), mas com dia > 12
            return date;
          } else if (day > 12 && month <= 12) {
            // Está em formato americano (MM/DD/YYYY), converter para brasileiro
            return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
          } else if (month <= 12 && day <= 12) {
            // Ambos são <= 12, verificar qual faz mais sentido
            // Se o primeiro número é <= 12 e o segundo também, assumir formato americano
            // e converter para brasileiro
            return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
          }
        }
        
        return date;
      };
      
      // Remover horário da data e corrigir formato se necessário
      let date = review.date || 'Data Desconhecida';
      if (date && date !== 'Data Desconhecida') {
        // Remover horário se existir
        if (date.includes(' ')) {
          date = date.split(' ')[0];
        }
        // Corrigir formato de data (MM/DD/YYYY -> DD/MM/YYYY)
        date = fixDateFormat(date);
        // Também tratar formato ISO se necessário
        if (date.includes('T')) {
          const dateObj = new Date(date);
          if (!isNaN(dateObj.getTime())) {
            date = dateObj.toLocaleDateString('pt-BR');
          }
        }
      }
      const reviewText = review.review || '';
      const country = review.country || 'br';
      const source = review.source || 'amazon';
      const photos = extractPhotosFromReview(review);
      
      console.log(`[products]   Review ${index + 1}: ID=${reviewId}, Author=${author}, Rating=${rating}, Date=${date}`);
      
      return {
        id: reviewId,
        author: author,
        rating: rating,
        date: date,
        review: reviewText,
        country: country,
        source: source,
        photos: photos
      };
    });
    
    // Calcular informações do header
    let headerData = null;
    if (reviewsData.reviewCountInfo) {
      const average = parseFloat(reviewsData.reviewCountInfo.average || 0);
      const total = parseInt(reviewsData.reviewCountInfo.total || 0);
      
      console.log(`[products] Header do reviewCountInfo: average=${average}, total=${total}`);
      
      if (average > 0 || total > 0) {
        headerData = {
          average: average,
          total: total,
          rate1: reviewsData.reviewCountInfo.rate1 || 0,
          rate2: reviewsData.reviewCountInfo.rate2 || 0,
          rate3: reviewsData.reviewCountInfo.rate3 || 0,
          rate4: reviewsData.reviewCountInfo.rate4 || 0,
          rate5: reviewsData.reviewCountInfo.rate5 || 0
        };
        console.log(`[products] ✅ Header criado: average=${average}, total=${total}`);
      }
    } else if (reviewsData.total) {
      // Fallback: calcular a partir das reviews
      const total = parseInt(reviewsData.total || 0);
      let average = 0;
      
      if (reviewsArray.length > 0) {
        const sum = reviewsArray.reduce((acc, r) => acc + (r.rating || 5), 0);
        average = sum / reviewsArray.length;
        console.log(`[products] Média calculada a partir de ${reviewsArray.length} reviews: ${average}`);
      } else if (total > 0) {
        // Se não temos reviews individuais mas temos total, assumir média 5 (todas são 5 estrelas baseado no HTML)
        average = 5;
        console.log(`[products] Média assumida como 5 (sem reviews individuais para calcular)`);
      }
      
      console.log(`[products] Header calculado: average=${average}, total=${total}`);
      
      if (average > 0 || total > 0) {
        // Calcular distribuição de ratings
        const rateCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviewsArray.forEach(r => {
          const rating = r.rating || 5;
          if (rating >= 1 && rating <= 5) {
            rateCounts[Math.floor(rating)]++;
          }
        });
        
        headerData = {
          average: average,
          total: total,
          rate1: rateCounts[1],
          rate2: rateCounts[2],
          rate3: rateCounts[3],
          rate4: rateCounts[4],
          rate5: rateCounts[5]
        };
        console.log(`[products] ✅ Header calculado e criado: average=${average}, total=${total}`);
      }
    } else {
      console.log('[products] ⚠️ Nenhuma informação de header disponível');
    }
    
    console.log('[products] ========================================');
    console.log('[products] RESPOSTA FINAL:');
    console.log('[products] Header Data:', headerData ? 'SIM' : 'NÃO');
    console.log('[products] Reviews Processadas:', processedReviews.length);
    console.log('[products] ========================================');
    
    // Se for primeira página, retornar todas as reviews de uma vez
    // Se for página 2+, retornar apenas as novas (mas a API sempre retorna as mesmas, então vamos retornar todas na primeira)
    if (page === 1) {
      // Primeira página: retornar todas as reviews disponíveis
      console.log('[products] ========================================');
      console.log('[products] RESPOSTA FINAL (PRIMEIRA PÁGINA):');
      console.log('[products] Header Data:', headerData ? 'SIM' : 'NÃO');
      console.log('[products] Reviews Processadas:', processedReviews.length);
      console.log('[products] Total de reviews:', reviewsData.total || processedReviews.length);
      console.log('[products] Has More: false (carregando todas de uma vez)');
      console.log('[products] ========================================');
      
      return res.json({ 
        header: headerData,
        reviews: processedReviews,
        hasMore: false, // Não tem mais porque já carregamos todas
        total: reviewsData.total || processedReviews.length
      });
    } else {
      // Páginas seguintes: a API sempre retorna as mesmas reviews, então retornar vazio
      console.log('[products] ⚠️ Página > 1: API sempre retorna as mesmas reviews, retornando vazio');
      return res.json({ 
        header: null, // Não retornar header novamente
        reviews: [], // Não retornar reviews duplicadas
        hasMore: false,
        total: reviewsData.total || 0
      });
    }
  } catch (error) {
    console.error('[products] Erro ao buscar HTML completo de reviews:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/:id/reviews', [
  body('name').trim().notEmpty().withMessage('Nome é obrigatório'),
  body('email').optional({ nullable: true }).isEmail().withMessage('E-mail inválido'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Avaliação deve ser entre 1 e 5'),
  body('feedback').trim().isLength({ min: 3 }).withMessage('Conte o que achou do produto com pelo menos 3 caracteres'),
  body('photos').optional().isArray({ max: MAX_REVIEW_PHOTOS }).withMessage(`Envie no máximo ${MAX_REVIEW_PHOTOS} fotos`)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const productId = parseInt(req.params.id, 10);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ error: 'Produto inválido' });
    }

    const productResult = await pool.query(
      'SELECT id, codigo, nome FROM melhor_casas_products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const product = productResult.rows[0];
    const { name, email, rating, feedback, photos = [], country } = req.body;
    const productShopifyId = await resolveShopifyProductId(product.codigo);

    const normalizedName = name.trim();
    const normalizedEmail = email ? email.trim() : null;
    const normalizedFeedback = feedback ? feedback.trim() : null;
    const ratingValue = Math.min(Math.max(parseInt(rating, 10) || 0, 1), 5);

    const { local: savedPhotos, remote: laireviewsPhotoUrls } =
      await processIncomingReviewPhotos(Array.isArray(photos) ? photos : [], {
        productShopifyId,
      });
    const publicPhotoUrls = buildPublicPhotoUrls(savedPhotos);

    const metadata = {
      user_agent: req.headers['user-agent'] || null,
      photos_count: savedPhotos.length,
      product_shopify_id: productShopifyId,
      public_photo_urls: publicPhotoUrls,
      laireviews_photo_urls: laireviewsPhotoUrls,
    };

    const insertPayload = {
      productId: product.id,
      productCode: product.codigo,
      name: normalizedName,
      email: normalizedEmail,
      rating: ratingValue,
      feedback: normalizedFeedback,
      photos: savedPhotos,
      status: 'pendente',
      source: 'app',
      metadata,
    };

    const insertResult = await insertCustomerReviewRecord(insertPayload);
    const reviewRecord = insertResult.rows[0];

    if (productShopifyId) {
      const laireviewsCountry =
        (country || DEFAULT_REVIEW_COUNTRY || 'BR').toString().slice(0, 2).toUpperCase();
      const submissionEmail =
        normalizedEmail || process.env.DEFAULT_REVIEW_EMAIL || 'avaliacao@app.melhordascasas.com.br';

      const photosForPayload =
        laireviewsPhotoUrls.length > 0 ? laireviewsPhotoUrls : publicPhotoUrls;

      const laireviewsPayload = {
        rating: ratingValue.toString(),
        country: laireviewsCountry,
        shop: laireviewsService.shopName,
        product_shopify: productShopifyId,
        author: normalizedName,
        email: submissionEmail,
        review: normalizedFeedback,
        scm_provider: 'shopify',
        email_attribute: submissionEmail,
        photos: photosForPayload,
        advanceInfo: { totalOrderHasProduct: null },
        cfData: {},
      };

      setImmediate(async () => {
        try {
          const response = await laireviewsService.submitReview(laireviewsPayload);
          console.log(
            `[products] Avaliação ${reviewRecord.id} enviada para Laireviews API.`,
            response
          );
        } catch (laireviewsError) {
          const laireviewsData = laireviewsError.response?.data || laireviewsError.message;
          console.error(
            `[products] Erro ao enviar avaliação ${reviewRecord.id} para Laireviews API:`,
            laireviewsData
          );
        }
      });
    } else {
      console.warn(
        `[products] Não foi possível determinar product_shopify_id para a avaliação ${reviewRecord.id}.`
      );
    }

    return res.status(201).json({
      success: true,
      review: reviewRecord,
    });
  } catch (error) {
    if (error.code === 'TABLE_NOT_FOUND') {
      return res.status(500).json({ error: 'Tabela de avaliações não encontrada no banco de dados' });
    }

    console.error('[products] Erro ao registrar avaliação do cliente:', error);
    res.status(500).json({ error: 'Erro interno ao salvar avaliação' });
  }
});

// Buscar avaliações do produto (DEVE VIR ANTES DA ROTA /:id)
router.get('/:id/reviews', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[products] Buscando avaliações para produto ID:', id);
    
    // Verificar cache primeiro (TTL de 10 minutos)
    const cacheKey = `product:reviews:${id}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      console.log(`[products] ✅ Reviews encontradas no cache para produto ${id}`);
      return res.json(cached);
    }
    
    // Buscar código do produto
    const productResult = await pool.query(
      'SELECT codigo FROM melhor_casas_products WHERE id = $1',
      [id]
    );

    if (productResult.rows.length === 0) {
      console.log('[products] Produto não encontrado:', id);
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const productCode = productResult.rows[0].codigo;
    console.log('[products] Código do produto encontrado:', productCode);
    
    // Usar ratings do banco de dados (sincronizados periodicamente)
    // Não chamar Laireviews em tempo real para evitar sobrecarga
    try {
      const productResult = await pool.query(
        'SELECT rating_average, rating_total FROM melhor_casas_products WHERE id = $1',
        [id]
      );

      if (productResult.rows.length > 0) {
        const product = productResult.rows[0];
        
        if (product.rating_total > 0 && product.rating_average > 0) {
          const result = {
            reviews: {
              total: product.rating_total,
              average: parseFloat(product.rating_average),
              product_shopify_id: productCode
            }
          };
          // Cachear resultado (30 minutos - dados do banco são mais estáveis)
          cacheService.set(cacheKey, result, 1800);
          console.log('[products] ✅ Ratings retornados do banco de dados');
          return res.json(result);
        }
      }
      
      // Se não tem ratings no banco, retornar null
      console.log('[products] ⚠️ Nenhuma avaliação encontrada no banco de dados');
      const result = { reviews: null };
      // Cachear resultado negativo (10 minutos)
      cacheService.set(cacheKey, result, 600);
      return res.json(result);
    } catch (error) {
      console.error('[products] Erro ao buscar avaliações:', error);
      console.error('[products] Stack:', error.stack);
      return res.json({ reviews: null });
    }
  } catch (error) {
    console.error('[products] Erro ao buscar avaliações:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Detalhes do produto
// Endpoint para verificar estoque em tempo real usando Storefront API
router.get('/:id/inventory', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    
    // Buscar código do produto no banco
    const productResult = await pool.query(
      'SELECT codigo FROM melhor_casas_products WHERE id = $1',
      [id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const productCode = productResult.rows[0].codigo;
    
    // Verificar estoque usando Storefront API
    const inventory = await shopifyService.getInventoryByVariantCode(productCode);
    
    if (!inventory) {
      return res.status(404).json({ error: 'Estoque não encontrado no Shopify' });
    }

    res.json({
      success: true,
      inventory: {
        variantId: inventory.variantId,
        title: inventory.title,
        sku: inventory.sku,
        quantityAvailable: inventory.quantityAvailable,
        availableForSale: inventory.availableForSale,
        product: inventory.product
      }
    });
  } catch (error) {
    console.error('❌ [products/inventory] Erro:', error);
    res.status(500).json({ 
      error: 'Erro ao verificar estoque',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar cache primeiro
    const cached = cacheService.getProduct(id);
    if (cached) {
      console.log('✅ Retornando produto do cache:', id);
      return res.json({ product: cached });
    }
    
    // Tentar buscar primeiro pelo ID interno (numérico)
    // Se não encontrar, tentar buscar pelo código (ID da Shopify)
    let result = await pool.query(
      `SELECT id, codigo, nome, descricao, 
              CAST(preco_varejo AS DECIMAL(10,2)) as preco_varejo, 
              CAST(preco_exclusivo AS DECIMAL(10,2)) as preco_exclusivo,
              CAST(preco_atacado AS DECIMAL(10,2)) as preco_atacado, 
              quantidade_minima_atacado, categoria, estoque, imagem_url, 
              COALESCE(imagens, '[]'::jsonb) as imagens, disponivel, 
              CAST(rating_average AS DECIMAL(3,2)) as rating_average, rating_total, 
              created_at, updated_at
       FROM melhor_casas_products WHERE id = $1 AND disponivel = true`,
      [id]
    );

    // Se não encontrou pelo ID interno, tentar buscar pelo código (ID da Shopify)
    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT id, codigo, nome, descricao, 
                CAST(preco_varejo AS DECIMAL(10,2)) as preco_varejo, 
                CAST(preco_exclusivo AS DECIMAL(10,2)) as preco_exclusivo,
                CAST(preco_atacado AS DECIMAL(10,2)) as preco_atacado, 
                quantidade_minima_atacado, categoria, estoque, imagem_url, 
                COALESCE(imagens, '[]'::jsonb) as imagens, disponivel, 
                CAST(rating_average AS DECIMAL(3,2)) as rating_average, rating_total, 
                created_at, updated_at
         FROM melhor_casas_products WHERE codigo = $1 AND disponivel = true`,
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const product = result.rows[0];
    
    // Buscar variantes do Shopify usando o codigo (ID do produto Shopify)
    if (req.query.includeVariants === 'true' || req.query.includeVariants === undefined) {
      try {
        const shopifyProduct = await shopifyService.getProduct(product.codigo);
        if (shopifyProduct && shopifyProduct.variants && shopifyProduct.variants.length > 0) {
          // Mapear variantes com informações relevantes
          product.variantes = shopifyProduct.variants.map((variant, index) => {
            // Encontrar imagem associada à variante (se houver)
            let variantImage = null;
            if (variant.image_id && shopifyProduct.images) {
              const matchingImage = shopifyProduct.images.find(img => img.id === variant.image_id);
              if (matchingImage) {
                variantImage = matchingImage.src;
              }
            }
            
            return {
              id: variant.id,
              title: variant.title || 'Padrão',
              price: parseFloat(variant.price || 0),
              compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
              sku: variant.sku || null,
              barcode: variant.barcode || null,
              inventory_quantity: variant.inventory_quantity || 0,
              available: variant.inventory_quantity > 0,
              option1: variant.option1 || null,
              option2: variant.option2 || null,
              option3: variant.option3 || null,
              image_url: variantImage,
              position: variant.position || index + 1
            };
          });
          
          // Extrair opções do produto (ex: Cor, Tamanho)
          if (shopifyProduct.options && shopifyProduct.options.length > 0) {
            product.opcoes = shopifyProduct.options.map(opt => ({
              name: opt.name,
              position: opt.position,
              values: opt.values || []
            }));
          }
          
          console.log(`✅ [products/:id] Variantes carregadas para produto ${product.codigo}: ${product.variantes.length} variantes`);
        }
      } catch (variantError) {
        console.error('⚠️ [products/:id] Erro ao buscar variantes do Shopify:', variantError.message);
        // Não falhar a requisição se variantes falhar
      }
    }
    
    // Verificar estoque em tempo real usando Storefront API (opcional, não bloqueia resposta)
    if (req.query.includeInventory === 'true') {
      try {
        const inventory = await shopifyService.getInventoryByVariantCode(product.codigo);
        if (inventory) {
          product.realTimeInventory = {
            quantityAvailable: inventory.quantityAvailable,
            availableForSale: inventory.availableForSale,
            lastChecked: new Date().toISOString()
          };
        }
      } catch (inventoryError) {
        console.error('⚠️ [products] Erro ao verificar estoque em tempo real:', inventoryError.message);
        // Não falhar a requisição se estoque falhar
      }
    }
    
    // Salvar no cache
    cacheService.setProduct(id, product);
    
    res.json({ product });
  } catch (error) {
    console.error('Erro ao buscar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar produto (admin)
router.post('/', authenticateToken, [
  body('codigo').notEmpty().withMessage('Código é obrigatório'),
  body('nome').notEmpty().withMessage('Nome é obrigatório'),
  body('preco_varejo').isNumeric().withMessage('Preço varejo deve ser numérico'),
  body('preco_atacado').isNumeric().withMessage('Preço atacado deve ser numérico'),
  body('categoria').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { codigo, nome, descricao, preco_varejo, preco_atacado, quantidade_minima_atacado, categoria, estoque, imagem_url } = req.body;

    // Verificar se código já existe
    const existingProduct = await pool.query(
      'SELECT id FROM melhor_casas_products WHERE codigo = $1',
      [codigo]
    );

    if (existingProduct.rows.length > 0) {
      return res.status(400).json({ error: 'Código do produto já existe' });
    }

    const result = await pool.query(
      `INSERT INTO melhor_casas_products (codigo, nome, descricao, preco_varejo, preco_atacado, 
       quantidade_minima_atacado, categoria, estoque, imagem_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [codigo, nome, descricao, preco_varejo, preco_atacado, quantidade_minima_atacado || 2, categoria, estoque || 0, imagem_url]
    );

    res.status(201).json({ product: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Upload de planilha CSV
router.post('/upload-csv', authenticateToken, upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo CSV é obrigatório' });
    }

    const melhor_casas_products = [];
    const errors = [];

    // Ler arquivo CSV
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        // Validar campos obrigatórios
        if (!row.codigo || !row.nome || !row.preco_varejo || !row.preco_atacado) {
          errors.push(`Linha com dados incompletos: ${JSON.stringify(row)}`);
          return;
        }

        melhor_casas_products.push({
          codigo: row.codigo.trim(),
          nome: row.nome.trim(),
          descricao: row.descricao?.trim() || '',
          preco_varejo: parseFloat(row.preco_varejo),
          preco_atacado: parseFloat(row.preco_atacado),
          quantidade_minima_atacado: parseInt(row.quantidade_minima_atacado) || 2,
          categoria: row.categoria?.trim() || null,
          estoque: parseInt(row.estoque) || 0,
          imagem_url: row.imagem_url?.trim() || null
        });
      })
      .on('end', async () => {
        try {
          // Limpar arquivo temporário
          fs.unlinkSync(req.file.path);

          if (errors.length > 0) {
            return res.status(400).json({ 
              error: 'Erros na planilha', 
              details: errors 
            });
          }

          // Inserir produtos no banco
          let inserted = 0;
          let updated = 0;

          for (const product of melhor_casas_products) {
            try {
              // Verificar se produto já existe
              const existing = await pool.query(
                'SELECT id FROM melhor_casas_products WHERE codigo = $1',
                [product.codigo]
              );

              if (existing.rows.length > 0) {
                // Atualizar produto existente
                await pool.query(
                  `UPDATE melhor_casas_products SET nome = $1, descricao = $2, preco_varejo = $3, 
                   preco_atacado = $4, quantidade_minima_atacado = $5, categoria = $6, 
                   estoque = $7, imagem_url = $8, updated_at = CURRENT_TIMESTAMP 
                   WHERE codigo = $9`,
                  [product.nome, product.descricao, product.preco_varejo, product.preco_atacado,
                   product.quantidade_minima_atacado, product.categoria, product.estoque, 
                   product.imagem_url, product.codigo]
                );
                updated++;
              } else {
                // Inserir novo produto
                await pool.query(
                  `INSERT INTO melhor_casas_products (codigo, nome, descricao, preco_varejo, preco_atacado, 
                   quantidade_minima_atacado, categoria, estoque, imagem_url) 
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                  [product.codigo, product.nome, product.descricao, product.preco_varejo, 
                   product.preco_atacado, product.quantidade_minima_atacado, product.categoria, 
                   product.estoque, product.imagem_url]
                );
                inserted++;
              }
            } catch (error) {
              console.error(`Erro ao processar produto ${product.codigo}:`, error);
              errors.push(`Erro ao processar produto ${product.codigo}: ${error.message}`);
            }
          }

          res.json({
            message: 'Planilha processada com sucesso',
            inserted,
            updated,
            errors: errors.length > 0 ? errors : null
          });
        } catch (error) {
          console.error('Erro ao processar planilha:', error);
          res.status(500).json({ error: 'Erro interno do servidor' });
        }
      });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar produto (admin)
router.put('/:id', authenticateToken, [
  body('nome').optional().isString(),
  body('preco_varejo').optional().isNumeric(),
  body('preco_atacado').optional().isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updates = req.body;
    
    // Construir query dinamicamente
    const fields = [];
    const values = [];
    let paramCount = 0;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    paramCount++;
    values.push(id);

    const query = `UPDATE melhor_casas_products SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json({ product: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deletar produto (admin)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE melhor_casas_products SET disponivel = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json({ message: 'Produto desativado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Endpoint para marcar produtos deletados no Shopify como indisponíveis
router.post('/mark-unavailable-deleted', authenticateAdmin, async (req, res) => {
  try {
    console.log('🔄 [mark-unavailable-deleted] Iniciando verificação de produtos deletados...');
    
    // Buscar total de produtos no banco primeiro (para progresso)
    const totalInDbResult = await pool.query(`
      SELECT COUNT(*) as total FROM melhor_casas_products WHERE disponivel = true
    `);
    const totalInDb = parseInt(totalInDbResult.rows[0]?.total || 0);
    
    console.log(`📊 [mark-unavailable-deleted] ${totalInDb} produtos disponíveis no banco`);
    
    // Buscar todos os produtos do Shopify via API
    console.log('📦 [mark-unavailable-deleted] Buscando produtos do Shopify...');
    const shopifyProducts = await shopifyService.getAllProductsDirect();
    const shopifyCodes = shopifyProducts.map(p => p.id.toString());
    
    console.log(`✅ [mark-unavailable-deleted] ${shopifyCodes.length} produtos encontrados no Shopify`);
    
    if (shopifyCodes.length === 0) {
      return res.status(400).json({ 
        error: 'Nenhum produto encontrado no Shopify. Verifique a conexão.' 
      });
    }
    
    // Marcar produtos que não estão na lista do Shopify como indisponíveis
    // Usar NOT IN para ser mais claro e compatível
    const unavailableResult = await pool.query(`
      UPDATE melhor_casas_products 
      SET disponivel = false, updated_at = CURRENT_TIMESTAMP
      WHERE codigo NOT IN (SELECT unnest($1::text[]))
        AND disponivel = true
      RETURNING id, codigo, nome
    `, [shopifyCodes]);
    
    const unavailableCount = unavailableResult.rowCount || 0;
    const unavailableProducts = unavailableResult.rows || [];
    
    console.log(`⚠️ [mark-unavailable-deleted] ${unavailableCount} produtos marcados como indisponíveis`);
    
    if (unavailableCount > 0) {
      console.log(`📋 [mark-unavailable-deleted] Primeiros produtos marcados:`, 
        unavailableProducts.slice(0, 10).map(p => `${p.nome} (${p.codigo})`).join(', ')
      );
    }
    
    res.json({
      success: true,
      message: `${unavailableCount} produtos marcados como indisponíveis`,
      unavailableCount,
      unavailableProducts: unavailableProducts.slice(0, 50), // Retornar apenas os primeiros 50 para não sobrecarregar
      totalShopifyProducts: shopifyCodes.length,
      totalInDb: totalInDb
    });
  } catch (error) {
    console.error('❌ [mark-unavailable-deleted] Erro:', error);
    res.status(500).json({ 
      error: 'Erro ao verificar produtos deletados',
      message: error.message 
    });
  }
});

module.exports = router;

