const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const shopifyService = require('../services/shopifyService');
const cartService = require('../services/cartService');

const router = express.Router();

// Registrar sessão de checkout aberta
router.post('/checkout-session', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { sessionId, deviceId, checkoutUrl } = req.body;

    if (!checkoutUrl) {
      return res.status(400).json({ error: 'checkoutUrl é obrigatório' });
    }

    const result = await pool.query(
      `INSERT INTO checkout_sessions (user_id, session_id, device_id, checkout_url, status, opened_at)
       VALUES ($1, $2, $3, $4, 'opened', CURRENT_TIMESTAMP)
       RETURNING id, opened_at`,
      [userId || null, sessionId || null, deviceId || null, checkoutUrl]
    );

    res.json({ 
      success: true, 
      sessionId: result.rows[0].id,
      openedAt: result.rows[0].opened_at
    });
  } catch (error) {
    console.error('Erro ao registrar sessão de checkout:', error);
    res.status(500).json({ error: 'Erro ao registrar sessão de checkout' });
  }
});

const mapShopifyStatus = async (order, shopifyService) => {
  if (order.cancelled_at) {
    return 'cancelado';
  }
  
  // Verificar se algum fulfillment tem shipment_status === 'ready_for_pickup'
  let fulfillments = order.fulfillments;
  
  // Se não vierem fulfillments completos, buscar do Shopify
  if ((!fulfillments || fulfillments.length === 0) && order.id && shopifyService) {
    try {
      const orderResponse = await shopifyService.client.get(`/orders/${order.id}.json`);
      fulfillments = orderResponse.data?.order?.fulfillments || [];
      console.log(`🔍 [mapShopifyStatus] Buscou fulfillments do Shopify para pedido ${order.id}:`, fulfillments.length);
    } catch (error) {
      console.error(`❌ [mapShopifyStatus] Erro ao buscar fulfillments:`, error.message);
    }
  }
  
  if (fulfillments && Array.isArray(fulfillments) && fulfillments.length > 0) {
    // Verificar shipment_status em diferentes formatos
    const readyForPickup = fulfillments.some(f => {
      const shipmentStatus = f.shipment_status || f.shipmentStatus || (f.shipment && f.shipment.status);
      return shipmentStatus === 'ready_for_pickup' || 
             shipmentStatus === 'ready-for-pickup' ||
             shipmentStatus === 'READY_FOR_PICKUP';
    });
    
    if (readyForPickup) {
      console.log(`✅ [mapShopifyStatus] Pedido ${order.id || order.name} detectado como "pronto_retirada"`);
      return 'pronto_retirada';
    }
    
    // Verificar se é pickup sem tracking (pode indicar pronto para retirada)
    const isPickup = fulfillments.some(f => {
      const hasNoTracking = !f.tracking_number && !f.tracking_company;
      const isSuccess = f.status === 'success';
      return isSuccess && hasNoTracking;
    });
    
    // Se for pickup e não tiver tracking, pode estar pronto para retirada
    // Mas só se o fulfillment_status não for "fulfilled" (que seria concluído)
    if (isPickup && order.fulfillment_status !== 'fulfilled') {
      // Verificar se é realmente pickup (frete zero ou shipping line indica pickup)
      const isPickupOrder = order.total_shipping_price_set?.shop_money?.amount === '0.00' ||
                           order.total_shipping_price === 0 ||
                           (order.shipping_lines && order.shipping_lines.some(sl => {
                             const title = (sl.title || '').toLowerCase();
                             return title.includes('retira') || title.includes('pickup');
                           }));
      
      if (isPickupOrder) {
        console.log(`✅ [mapShopifyStatus] Pedido ${order.id || order.name} detectado como "pronto_retirada" (pickup sem tracking)`);
        return 'pronto_retirada';
      }
    }
  }
  
  if (order.fulfillment_status === 'fulfilled') {
    return 'concluido';
  }
  if (order.financial_status === 'paid' || order.financial_status === 'partially_paid') {
    return 'processando';
  }
  return 'pendente';
};

const syncShopifyOrdersForUser = async (user) => {
  if (!user?.email) {
    return;
  }

  try {
    const shopifyOrders = await shopifyService.getOrdersByEmail(user.email);
    if (!shopifyOrders.length) {
      return;
    }

    const existing = await pool.query(
      `SELECT shopify_order_id, id FROM melhor_casas_orders 
       WHERE user_id = $1 AND shopify_order_id IS NOT NULL`,
      [user.id]
    );
    const existingIds = new Set(existing.rows.map((row) => row.shopify_order_id));
    const existingOrdersMap = new Map(existing.rows.map((row) => [row.shopify_order_id, row.id]));

    for (const order of shopifyOrders) {
      const shopifyOrderId = order.id ? order.id.toString() : null;
      if (!shopifyOrderId) {
        continue;
      }
      
      // Se pedido já existe, atualizar status
      // IMPORTANTE: Não sobrescrever se o status já é "pronto_retirada" no banco
      // O webhook já atualizou corretamente, não queremos perder essa informação
      if (existingIds.has(shopifyOrderId)) {
        // Verificar o status atual no banco antes de atualizar
        const currentOrder = await pool.query(
          `SELECT status FROM melhor_casas_orders WHERE shopify_order_id = $1 LIMIT 1`,
          [shopifyOrderId]
        );
        
        const currentStatus = currentOrder.rows[0]?.status;
        
        // Mapear status do Shopify (agora é async)
        const shopifyStatus = await mapShopifyStatus(order, shopifyService);
        
        // Se o pedido já está "pronto_retirada", não sobrescrever
        // Apenas atualizar se o Shopify mostrar um status mais avançado (ex: concluído)
        if (currentStatus === 'pronto_retirada') {
          console.log(`ℹ️ [syncShopifyOrdersForUser] Pedido ${shopifyOrderId} já está "pronto_retirada", mantendo status`);
          // Ainda assim, verificar se o Shopify mostra como concluído (cliente retirou)
          if (shopifyStatus === 'concluido') {
            await pool.query(
              `UPDATE melhor_casas_orders 
               SET status = $1, updated_at = NOW() 
               WHERE shopify_order_id = $2`,
              [shopifyStatus, shopifyOrderId]
            );
            console.log(`✅ [syncShopifyOrdersForUser] Pedido ${shopifyOrderId} atualizado para "concluido" (cliente retirou)`);
          }
          continue;
        }
        
        // Se o Shopify mostra "pronto_retirada" mas o banco não, atualizar
        if (shopifyStatus === 'pronto_retirada' && currentStatus !== 'pronto_retirada') {
          console.log(`✅ [syncShopifyOrdersForUser] Pedido ${shopifyOrderId} atualizado para "pronto_retirada" (detectado no Shopify)`);
        }
        
        // Para outros status, atualizar normalmente
        await pool.query(
          `UPDATE melhor_casas_orders 
           SET status = $1, updated_at = NOW() 
           WHERE shopify_order_id = $2`,
          [shopifyStatus, shopifyOrderId]
        );
        continue;
      }

      const total = parseFloat(order.total_price || order.subtotal_price || '0') || 0;
      const createdAt = order.processed_at || order.created_at || new Date().toISOString();
      const status = await mapShopifyStatus(order, shopifyService);

      const inserted = await pool.query(
        `INSERT INTO melhor_casas_orders 
         (user_id, total, status, tipo_preco_aplicado, shopify_order_id, shopify_order_number, shopify_order_name, currency, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         RETURNING id`,
        [
          user.id,
          total,
          status,
          'varejo',
          shopifyOrderId,
          order.order_number ? order.order_number.toString() : null,
          order.name || null,
          order.currency || 'BRL',
          createdAt,
        ]
      );

      const localOrderId = inserted.rows[0].id;
      const lineItems = order.line_items || [];
      const discountApplications = order.discount_applications || [];

      for (const item of lineItems) {
        const unitPrice = parseFloat(item.price || '0') || 0;
        const quantity = item.quantity || 0;
        const subtotal = unitPrice * quantity;

        let productId = null;
        if (item.product_id) {
          const productLookup = await pool.query(
            'SELECT id FROM melhor_casas_products WHERE codigo = $1',
            [item.product_id.toString()]
          );
          productId = productLookup.rows[0]?.id || null;
        }

        if (!productId && item.sku) {
          const productLookup = await pool.query(
            'SELECT id FROM melhor_casas_products WHERE codigo = $1',
            [item.sku]
          );
          productId = productLookup.rows[0]?.id || null;
        }

        let discountAmount = 0;
        let discountLabel = null;
        if (Array.isArray(item.discount_allocations) && item.discount_allocations.length > 0) {
          for (const allocation of item.discount_allocations) {
            const amount = parseFloat(allocation.amount || '0') || 0;
            discountAmount += amount;
            if (
              allocation.discount_application_index !== undefined &&
              discountApplications[allocation.discount_application_index]
            ) {
              const app = discountApplications[allocation.discount_application_index];
              discountLabel = app.title || app.code || app.target_type || discountLabel;
            }
          }
        }

        if (!discountLabel && discountAmount > 0) {
          discountLabel = 'Desconto';
        }

        const normalizedDiscountAmount =
          discountAmount > 0 ? parseFloat(discountAmount.toFixed(2)) : null;

        let imageUrl = null;
        if (Array.isArray(item.properties)) {
          const imageProp = item.properties.find((prop) => prop?.name === 'image');
          if (imageProp?.value) {
            imageUrl = imageProp.value;
          }
        }

        await pool.query(
          `INSERT INTO melhor_casas_order_items 
           (order_id, product_id, quantidade, preco_unitario, subtotal, product_name, product_sku, imagem_url, discount_label, discount_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            localOrderId,
            productId,
            quantity,
            unitPrice,
            subtotal,
            item.name || item.title || null,
            item.sku || null,
            imageUrl,
            discountLabel,
            normalizedDiscountAmount,
          ]
        );
      }
    }
  } catch (error) {
    console.error('Erro ao sincronizar pedidos com o Shopify:', error);
  }
};

// Criar pedido (simulado - apenas para histórico)
router.post('/', authenticateToken, [
  body('items').isArray({ min: 1 }).withMessage('Pelo menos um item é obrigatório'),
  body('items.*.product_id').isInt().withMessage('ID do produto deve ser um número'),
  body('items.*.quantidade').isInt({ min: 1 }).withMessage('Quantidade deve ser maior que 0')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { items } = req.body;

    // Verificar se todos os produtos existem e estão ativos
    const productIds = items.map(item => item.product_id);
    const productsResult = await pool.query(
      'SELECT id, preco_varejo, preco_atacado, quantidade_minima_atacado FROM melhor_casas_products WHERE id = ANY($1) AND ativo = true',
      [productIds]
    );

    if (productsResult.rows.length !== productIds.length) {
      return res.status(400).json({ error: 'Um ou mais produtos não foram encontrados' });
    }

    const melhor_casas_products = productsResult.rows;
    let total = 0;
    let tipoPrecoAplicado = 'varejo';
    const orderItems = [];

    // Calcular preços e total
    for (const item of items) {
      const product = melhor_casas_products.find(p => p.id === item.product_id);
      const quantidade = item.quantidade;
      
      // Determinar preço baseado na quantidade
      const precoUnitario = quantidade >= product.quantidade_minima_atacado 
        ? product.preco_atacado 
        : product.preco_varejo;
      
      const subtotal = precoUnitario * quantidade;
      total += subtotal;

      // Se pelo menos um item tem preço atacado, marcar pedido como atacado
      if (quantidade >= product.quantidade_minima_atacado) {
        tipoPrecoAplicado = 'atacado';
      }

      orderItems.push({
        product_id: item.product_id,
        quantidade,
        preco_unitario: precoUnitario,
        subtotal
      });
    }

    // Criar pedido
    const orderResult = await pool.query(
      'INSERT INTO melhor_casas_orders (user_id, total, tipo_preco_aplicado) VALUES ($1, $2, $3) RETURNING *',
      [userId, total, tipoPrecoAplicado]
    );

    const order = orderResult.rows[0];

    // Criar itens do pedido
    for (const item of orderItems) {
      await pool.query(
        'INSERT INTO melhor_casas_order_items (order_id, product_id, quantidade, preco_unitario, subtotal) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.product_id, item.quantidade, item.preco_unitario, item.subtotal]
      );
    }

    res.status(201).json({
      message: 'Pedido criado com sucesso',
      order: {
        id: order.id,
        total: order.total,
        tipo_preco_aplicado: order.tipo_preco_aplicado,
        status: order.status,
        created_at: order.created_at
      }
    });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar pedidos do usuário
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await syncShopifyOrdersForUser(req.user);
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT o.id, o.total, o.status, o.tipo_preco_aplicado, o.created_at,
              o.shopify_order_id, o.shopify_order_number, o.shopify_order_name,
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'quantidade', oi.quantidade,
                  'preco_unitario', oi.preco_unitario,
                  'subtotal', oi.subtotal,
                  'discount_label', oi.discount_label,
                  'discount_amount', oi.discount_amount,
                  'produto', json_build_object(
                    'nome', COALESCE(p.nome, oi.product_name),
                    'codigo', COALESCE(p.codigo, oi.product_sku),
                    'imagem_url', COALESCE(p.imagem_url, oi.imagem_url)
                  )
                )
              ) as items
       FROM melhor_casas_orders o
       LEFT JOIN melhor_casas_order_items oi ON o.id = oi.order_id
       LEFT JOIN melhor_casas_products p ON oi.product_id = p.id
       WHERE o.user_id = $1
       GROUP BY o.id, o.total, o.status, o.tipo_preco_aplicado, o.created_at, o.shopify_order_id, o.shopify_order_number, o.shopify_order_name
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    // Contar total
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM melhor_casas_orders WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      melhor_casas_orders: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar locais de retirada disponíveis
router.get('/pickup-locations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    let selectedProductIds = [];
    
    // Tratar selectedProductIds que pode vir como string ou array
    if (req.query.selectedProductIds) {
      if (Array.isArray(req.query.selectedProductIds)) {
        selectedProductIds = req.query.selectedProductIds.map(id => parseInt(id));
      } else if (typeof req.query.selectedProductIds === 'string') {
        selectedProductIds = req.query.selectedProductIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      }
    }
    
    // Buscar itens do carrinho em memória (cartService)
    let cart = cartService.getCart(userId) || { items: [] };
    let cartItems = cart.items || [];

    // Filtrar por selectedProductIds se enviado
    if (selectedProductIds.length > 0) {
      const selectedSet = new Set(selectedProductIds.map((id) => parseInt(id)));
      cartItems = cartItems.filter((item) => selectedSet.has(item.product_id));
    }

    // Se ainda vazio, tentar buscar produtos diretamente pelos IDs informados (quantidade padrão = 1)
    if (cartItems.length === 0 && selectedProductIds.length > 0) {
      const productsResult = await pool.query(
        `SELECT id, codigo as codigo_shopify 
         FROM melhor_casas_products 
         WHERE id = ANY($1)`,
        [selectedProductIds.map((id) => parseInt(id))]
      );
      cartItems = productsResult.rows.map((row) => ({
        product_id: row.id,
        quantidade: 1,
        codigo_shopify: row.codigo_shopify,
      }));
    } else {
      // Enriquecer com codigo_shopify a partir do banco
      const productIds = cartItems.map((item) => item.product_id);
      if (productIds.length > 0) {
        const productsResult = await pool.query(
          `SELECT id, codigo as codigo_shopify 
           FROM melhor_casas_products 
           WHERE id = ANY($1)`,
          [productIds]
        );
        const codeMap = new Map(productsResult.rows.map((r) => [r.id, r.codigo_shopify]));
        cartItems = cartItems.map((item) => ({
          ...item,
          codigo_shopify: item.codigo_shopify || codeMap.get(item.product_id),
        }));
      }
    }

    // Buscar variantes dos produtos no Shopify
    const lineItems = [];
    const variantCache = new Map(); // Cache para evitar buscar o mesmo produto múltiplas vezes
    
    for (const item of cartItems) {
      if (!item.codigo_shopify) continue;
      try {
        // Verificar cache primeiro
        let variantGid = variantCache.get(item.codigo_shopify);
        
        if (!variantGid) {
          // O codigo é o ID do produto, precisamos buscar a primeira variante
          console.log(`🔍 [pickup-locations] Buscando variante do produto ${item.codigo_shopify}...`);
          
          // Buscar produto no Shopify para obter a variante
          const shopifyProduct = await shopifyService.getProduct(item.codigo_shopify);
          
          if (!shopifyProduct || !shopifyProduct.variants || shopifyProduct.variants.length === 0) {
            console.warn(`⚠️ [pickup-locations] Produto ${item.codigo_shopify} sem variantes`);
            continue;
          }

          // Usar a primeira variante (ou a variante padrão)
          const variant = shopifyProduct.variants[0];
          // O ID da variante já vem como número do Shopify Admin API
          // Garantir apenas números para evitar problemas
          const variantId = String(variant.id).replace(/\D/g, '');
          variantGid = `gid://shopify/ProductVariant/${variantId}`;
          
          // Armazenar no cache
          variantCache.set(item.codigo_shopify, variantGid);
          console.log(`✅ [pickup-locations] Variante encontrada: ${variantGid}`);
        }
        
        lineItems.push({
          merchandiseId: variantGid,
          quantity: parseInt(item.quantidade || 1),
        });
      } catch (error) {
        console.warn(`⚠️ [pickup-locations] Erro ao buscar variante ${item.codigo_shopify}:`, error.message);
      }
    }

    // Buscar shopify_customer_token para tentar obter opções de pickup vinculadas ao cliente
    let customerAccessToken = null;
    try {
      const userResult = await pool.query(
        `SELECT shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1`,
        [userId]
      );
      if (userResult.rows.length > 0 && userResult.rows[0].shopify_customer_token) {
        const expiresAt = userResult.rows[0].shopify_customer_token_expires;
        if (!expiresAt || new Date(expiresAt) > new Date()) {
          customerAccessToken = userResult.rows[0].shopify_customer_token;
          console.log('✅ [pickup-locations] Customer Access Token encontrado');
        } else {
          console.warn('⚠️ [pickup-locations] Customer Access Token expirado:', expiresAt);
        }
      }
    } catch (e) {
      console.warn('⚠️ [pickup-locations] Não foi possível obter shopify_customer_token:', e.message);
    }

    // Buscar locais de retirada do Shopify
    const pickupLocations = await shopifyService.getPickupLocations(lineItems, customerAccessToken);

    res.json({
      success: true,
      locations: pickupLocations
    });
  } catch (error) {
    console.error('Erro ao buscar locais de retirada:', error);
    res.status(500).json({
      error: 'Erro ao buscar locais de retirada',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Gerar URL do checkout do Shopify
// Criar checkout via Storefront API com todos os dados pré-configurados
router.post('/shopify-checkout-url', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      selectedProductIds,
      discountCodes = [],
      deliveryType = 'shipping', // 'shipping' ou 'pickup'
      pickupHandle = null
    } = req.body;
    
    // Não usar cartId - sempre criar cart novo para evitar endereço preenchido
    console.log('📦 [orders/checkout] Tipo de entrega:', deliveryType);
    
    console.log('🛒 [orders/checkout] Criando checkout via Storefront API...');

    // Buscar dados completos do usuário e customerAccessToken do banco
    let customerAccessToken = null;
    let user = null;
    try {
      // Buscar campos que existem na tabela (cpf_cnpj ao invés de cpf ou documento)
      const userResult = await pool.query(
        'SELECT id, nome, email, telefone, cpf_cnpj, shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1',
        [userId]
      );
      if (userResult.rows.length > 0) {
        user = userResult.rows[0];
        // Mapear cpf_cnpj para cpf/documento para compatibilidade
        if (user.cpf_cnpj) {
          user.cpf = user.cpf_cnpj;
          user.documento = user.cpf_cnpj;
        }
        
        if (user.shopify_customer_token) {
          const expiresAt = user.shopify_customer_token_expires;
          if (!expiresAt || new Date(expiresAt) > new Date()) {
            customerAccessToken = user.shopify_customer_token;
            console.log('✅ [orders/checkout] Customer Access Token encontrado');
          } else {
            console.warn('⚠️ [orders/checkout] Customer Access Token expirado:', expiresAt);
          }
        } else {
          console.warn('⚠️ [orders/checkout] Usuário não possui shopify_customer_token');
        }
        console.log('✅ [orders/checkout] Dados do usuário carregados:', {
          nome: user.nome,
          email: user.email,
          telefone: user.telefone ? '***' : 'não informado',
          hasToken: !!customerAccessToken
        });
      } else {
        console.warn('⚠️ [orders/checkout] Usuário não encontrado no banco');
      }
    } catch (tokenError) {
      console.error('❌ [orders/checkout] Erro ao buscar dados do usuário:', tokenError.message);
      console.error('❌ [orders/checkout] Stack:', tokenError.stack);
      // Tentar buscar pelo menos o token se possível
      try {
        const tokenResult = await pool.query(
          'SELECT shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1',
          [userId]
        );
        if (tokenResult.rows.length > 0 && tokenResult.rows[0].shopify_customer_token) {
          const expiresAt = tokenResult.rows[0].shopify_customer_token_expires;
          if (!expiresAt || new Date(expiresAt) > new Date()) {
            customerAccessToken = tokenResult.rows[0].shopify_customer_token;
            console.log('✅ [orders/checkout] Customer Access Token recuperado após erro');
            // Tentar buscar dados básicos do usuário também
            try {
              const userDataResult = await pool.query(
                'SELECT id, nome, email, telefone FROM melhor_casas_users WHERE id = $1',
                [userId]
              );
              if (userDataResult.rows.length > 0) {
                user = userDataResult.rows[0];
                console.log('✅ [orders/checkout] Dados básicos do usuário recuperados após erro na query inicial');
              }
            } catch (userDataError) {
              console.warn('⚠️ [orders/checkout] Não foi possível buscar dados básicos do usuário:', userDataError.message);
            }
          }
        }
      } catch (fallbackError) {
        console.error('❌ [orders/checkout] Erro ao buscar token como fallback:', fallbackError.message);
      }
    }

    // Preparar dados do buyer para o checkout
    let buyerData = null;
    if (user) {
      // Separar nome em firstName e lastName
      const nameParts = (user.nome || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Formatar telefone: remover caracteres não numéricos e adicionar código do país
      let phone = null;
      if (user.telefone) {
        const phoneDigits = user.telefone.replace(/\D/g, '');
        if (phoneDigits.length > 0) {
          // Se já começar com 55, manter; senão adicionar +55
          phone = phoneDigits.startsWith('55') ? `+${phoneDigits}` : `+55${phoneDigits}`;
        }
      }

      buyerData = {
        email: user.email || undefined,
        phone: phone || undefined,
        countryCode: 'BR',
        firstName: firstName || undefined,
        lastName: lastName || undefined
      };
      
      console.log('✅ [orders/checkout] buyerData preparado:', {
        hasEmail: !!buyerData.email,
        hasPhone: !!buyerData.phone,
        firstName: buyerData.firstName || 'não informado',
        lastName: buyerData.lastName || 'não informado',
        countryCode: buyerData.countryCode
      });
    } else {
      console.warn('⚠️ [orders/checkout] Usuário não encontrado - buyerData não será preparado');
    }

    let cart;
    
    // PASSO 1: Sempre criar um novo cart limpo para o checkout
    // NÃO reutilizar cartId do cálculo de frete, pois pode ter endereço aplicado
    console.log('🛒 [orders/checkout] Criando novo cart limpo (sem endereço)...');
    
    // Criar novo cart a partir do carrinho do usuário
    const userCart = cartService.getCart(userId);

    if (!userCart || !userCart.items || userCart.items.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }

    // Se selectedProductIds for fornecido, usar apenas esses itens
    let itemsToCheckout = userCart.items;
    if (selectedProductIds && Array.isArray(selectedProductIds) && selectedProductIds.length > 0) {
      itemsToCheckout = userCart.items.filter(item => selectedProductIds.includes(item.product_id));
      
      if (itemsToCheckout.length === 0) {
        return res.status(400).json({ error: 'Nenhum item selecionado encontrado no carrinho' });
      }
    }

    // Verificar se há itens de lista de casamento e coletar informações
    let weddingListInfo = null;
    const weddingListIds = new Set();
    
    console.log('🔍 [shopify-checkout-url] Verificando itens do carrinho para listas de casamento...');
    console.log('🔍 [shopify-checkout-url] Total de itens:', itemsToCheckout.length);
    
    for (const cartItem of itemsToCheckout) {
      console.log('🔍 [shopify-checkout-url] Item do carrinho:', {
        product_id: cartItem.product_id,
        quantidade: cartItem.quantidade,
        wedding_list_id: cartItem.wedding_list_id,
        list_item_id: cartItem.list_item_id
      });
      
      if (cartItem.wedding_list_id) {
        weddingListIds.add(parseInt(cartItem.wedding_list_id));
        console.log(`🎁 [shopify-checkout-url] Item pertence à lista de casamento: ${cartItem.wedding_list_id}`);
      }
    }
    
    console.log('🔍 [shopify-checkout-url] Listas de casamento encontradas:', Array.from(weddingListIds));
    
    // Se houver itens de lista de casamento, buscar informações da lista
    if (weddingListIds.size > 0) {
      try {
        const listId = Array.from(weddingListIds)[0]; // Pegar primeira lista (geralmente só uma)
        console.log(`🔍 [shopify-checkout-url] Buscando informações da lista ${listId}...`);
        
        const listResult = await pool.query(
          'SELECT id, nome, codigo_compartilhamento FROM melhor_casas_wedding_lists WHERE id = $1',
          [listId]
        );
        
        if (listResult.rows.length > 0) {
          const list = listResult.rows[0];
          weddingListInfo = {
            listId: list.id,
            listName: list.nome,
            shareCode: list.codigo_compartilhamento
          };
          console.log(`🎁 [shopify-checkout-url] Pedido contém itens da lista de casamento: ${list.nome} (ID: ${list.id})`);
        } else {
          console.warn(`⚠️ [shopify-checkout-url] Lista ${listId} não encontrada no banco de dados`);
        }
      } catch (listError) {
        console.error('❌ [shopify-checkout-url] Erro ao buscar informações da lista de casamento:', listError);
        // Continuar mesmo se houver erro
      }
    } else {
      console.log('⚠️ [shopify-checkout-url] Nenhum item de lista de casamento encontrado no carrinho');
    }

    // Buscar produtos do carrinho com seus códigos Shopify
    const productIds = itemsToCheckout.map(item => item.product_id);
    const productsResult = await pool.query(
      `SELECT id, codigo FROM melhor_casas_products WHERE id = ANY($1)`,
      [productIds]
    );

    const productsMap = new Map(productsResult.rows.map(p => [p.id, p]));

    // Preparar line items para criar cart na Storefront API
    // Cada item do carrinho vira uma linha; se tiver variant_id, usar essa variante (assim 2 variantes = 2 linhas)
    const cartLines = [];
    const variantCache = new Map(); // chave: codigo ou codigo_variantId
    for (const item of itemsToCheckout) {
      const product = productsMap.get(item.product_id);
      if (!product) {
        console.warn(`⚠️ [orders/checkout] Produto ${item.product_id} não encontrado no banco`);
        continue;
      }
      const itemVariantId = item.variant_id != null && item.variant_id !== '' ? String(item.variant_id) : null;
      const cacheKey = itemVariantId ? `${product.codigo}_${itemVariantId}` : product.codigo;

      let variantGid = variantCache.get(cacheKey);
      if (!variantGid) {
        try {
          console.log(`🔍 [orders/checkout] Buscando variante do produto ${product.codigo}${itemVariantId ? ` (variant_id: ${itemVariantId})` : ''}...`);
          const shopifyProduct = await shopifyService.getProduct(product.codigo);
          if (!shopifyProduct || !shopifyProduct.variants || shopifyProduct.variants.length === 0) {
            console.error(`❌ [orders/checkout] Produto ${product.codigo} sem variantes`);
            continue;
          }
          let variant;
          if (itemVariantId) {
            variant = shopifyProduct.variants.find(v => String(v.id) === itemVariantId || String(v.id).replace(/\D/g, '') === String(itemVariantId).replace(/\D/g, ''));
            if (!variant) {
              console.warn(`⚠️ [orders/checkout] Variante ${itemVariantId} não encontrada no produto ${product.codigo}, usando primeira variante`);
              variant = shopifyProduct.variants[0];
            }
          } else {
            variant = shopifyProduct.variants[0];
          }
          const variantIdNum = String(variant.id).replace(/\D/g, '');
          variantGid = `gid://shopify/ProductVariant/${variantIdNum}`;
          variantCache.set(cacheKey, variantGid);
          console.log(`✅ [orders/checkout] Variante encontrada: ${variantGid}`);
        } catch (variantError) {
          console.error(`❌ [orders/checkout] Erro ao buscar variante do produto ${product.codigo}:`, variantError.message);
          continue;
        }
      }
      cartLines.push({
        merchandiseId: variantGid,
        quantity: item.quantidade
      });
    }

    if (cartLines.length === 0) {
      return res.status(400).json({ error: 'Não foi possível encontrar produtos válidos no Shopify' });
    }

    // Preparar deliveryPreferences baseado no tipo de entrega
    let deliveryPreferences = null;
    if (deliveryType === 'pickup') {
      // Para retirada, usar PICK_UP (deve ser array na API 2025-01)
      deliveryPreferences = {
        deliveryMethod: ['PICK_UP'],
        pickupHandle: pickupHandle || undefined
      };
      console.log('📍 [orders/checkout] Configurando cart para retirada (PICK_UP)');
    } else {
      // Para envio, usar SHIPPING (deve ser array na API 2025-01)
      deliveryPreferences = {
        deliveryMethod: ['SHIPPING']
      };
      console.log('🚚 [orders/checkout] Configurando cart para envio (SHIPPING)');
    }

    // Criar cart na Storefront API com preferências de entrega
    cart = await shopifyService.createCart(cartLines, customerAccessToken, deliveryPreferences);

    if (!cart || !cart.id) {
      return res.status(500).json({ error: 'Não foi possível criar ou obter cart' });
    }

    // PASSO 2: Atualizar buyer identity com dados completos do usuário
    // IMPORTANTE: Se houver customerAccessToken, SEMPRE atualizar buyer identity, mesmo sem buyerData completo
    // Isso garante que o cart esteja vinculado à conta do cliente antes de gerar o checkout URL
    // Se buyerIdentity não estiver configurado corretamente, Shopify redireciona para página de preenchimento
    if (buyerData || customerAccessToken) {
      try {
        console.log('👤 [orders/checkout] Atualizando buyer identity...');
        if (buyerData) {
          console.log('👤 [orders/checkout] buyerData disponível:', {
            email: buyerData.email ? '***' : 'não informado',
            phone: buyerData.phone ? '***' : 'não informado',
            firstName: buyerData.firstName || 'não informado',
            lastName: buyerData.lastName || 'não informado',
            countryCode: buyerData.countryCode
          });
        } else {
          console.log('⚠️ [orders/checkout] buyerData não disponível, mas há customerAccessToken');
        }
        if (customerAccessToken) {
          console.log('✅ [orders/checkout] customerAccessToken disponível - vinculando cart à conta do cliente');
        }
        
        // Não enviar endereço - deixar o usuário preencher no checkout da Shopify

        // Se não tiver buyerData mas tiver customerAccessToken, criar buyerData mínimo
        // IMPORTANTE: buyerData pode ser null/undefined, mas se tiver customerAccessToken,
        // devemos passar pelo menos um objeto com countryCode para a função funcionar
        let buyerDataToUse = buyerData;
        if (!buyerDataToUse) {
          // Sempre criar buyerData mínimo se não houver
          buyerDataToUse = {
            countryCode: 'BR'
          };
          if (customerAccessToken) {
            console.log('📝 [orders/checkout] Criando buyerData mínimo com customerAccessToken');
          } else {
            console.log('📝 [orders/checkout] Criando buyerData mínimo sem customerAccessToken');
          }
        }

        const updatedCart = await shopifyService.updateCartBuyerIdentityWithData(
          cart.id,
          buyerDataToUse,
          customerAccessToken,
          null // Não enviar endereço - deixar usuário preencher no checkout
        );
        // Usar cart atualizado retornado pela função
        if (updatedCart) {
          cart = updatedCart;
        } else {
          // Buscar cart atualizado se não foi retornado
          cart = await shopifyService.getCart(cart.id);
        }
        
        // Verificar se buyerIdentity foi aplicado corretamente
        if (cart?.buyerIdentity) {
          console.log('✅ [orders/checkout] Buyer identity atualizado:', {
            email: cart.buyerIdentity.email ? '***' : 'não definido',
            firstName: cart.buyerIdentity.firstName || 'não definido',
            lastName: cart.buyerIdentity.lastName || 'não definido',
            phone: cart.buyerIdentity.phone ? '***' : 'não definido'
          });
        } else {
          console.warn('⚠️ [orders/checkout] Buyer identity não encontrado no cart após atualização');
        }
      } catch (buyerError) {
        console.error('⚠️ [orders/checkout] Erro ao atualizar buyer identity:', buyerError.message);
        console.error('⚠️ [orders/checkout] Stack:', buyerError.stack);
        // Continuar mesmo se falhar (não crítico)
      }
    } else {
      // Mesmo sem buyerData, se tiver customerAccessToken, tentar vincular o cart
      if (customerAccessToken) {
        try {
          console.log('🔗 [orders/checkout] Vinculando cart com customerAccessToken (sem buyerData completo)...');
          await shopifyService.updateCartBuyerIdentity(cart.id, customerAccessToken);
          cart = await shopifyService.getCart(cart.id);
          console.log('✅ [orders/checkout] Cart vinculado via customerAccessToken');
        } catch (linkError) {
          console.error('⚠️ [orders/checkout] Erro ao vincular cart:', linkError.message);
        }
      } else {
        console.warn('⚠️ [orders/checkout] buyerData não foi preparado e não há customerAccessToken. Checkout pode pedir login.');
      }
    }

    // PASSO 3: Aplicar cupons de desconto (se houver)
    if (discountCodes && Array.isArray(discountCodes) && discountCodes.length > 0) {
      try {
        console.log('🎟️ [orders/checkout] Aplicando cupons:', discountCodes.join(', '));
        await shopifyService.applyDiscountCode(cart.id, discountCodes);
        cart = await shopifyService.getCart(cart.id);
      } catch (discountError) {
        console.error('⚠️ [orders/checkout] Erro ao aplicar cupons:', discountError.message);
        // Continuar mesmo se falhar (cupons opcionais)
      }
    }

    // PASSO 4: Buscar cart final com checkoutUrl
    const fullCart = await shopifyService.getCart(cart.id);
    
    if (!fullCart || !fullCart.checkoutUrl) {
      return res.status(500).json({ error: 'Não foi possível gerar URL de checkout' });
    }

    console.log('✅ [orders/checkout] Checkout criado com sucesso');

    // Armazenar informações de lista de casamento vinculadas ao cartId para atualizar depois
    if (weddingListInfo && fullCart.id) {
      try {
        // Criar tabela temporária se não existir
        await pool.query(`
          CREATE TABLE IF NOT EXISTS melhor_casas_pending_checkouts (
            id SERIAL PRIMARY KEY,
            cart_id VARCHAR(255) UNIQUE NOT NULL,
            cart_token VARCHAR(255), -- Token do cart (sem GID)
            user_id INTEGER NOT NULL REFERENCES melhor_casas_users(id),
            wedding_list_id INTEGER REFERENCES melhor_casas_wedding_lists(id),
            wedding_list_name VARCHAR(255),
            wedding_list_code VARCHAR(50),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        
        // Extrair cart_token do cart_id (GID completo)
        // Formato: gid://shopify/Cart/hWN7b89e9TukCFZQziYHdc1K?key=...
        // Precisamos apenas: hWN7b89e9TukCFZQziYHdc1K
        let cartToken = null;
        if (fullCart.id && fullCart.id.includes('/Cart/')) {
          const match = fullCart.id.match(/\/Cart\/([^?]+)/);
          if (match) {
            cartToken = match[1];
          }
        }
        
        console.log(`🎁 [shopify-checkout-url] Armazenando informações:`, {
          cart_id: fullCart.id,
          cart_token: cartToken,
          list_id: weddingListInfo.listId
        });
        
        // Armazenar informações (com cart_id completo e cart_token separado)
        await pool.query(
          `INSERT INTO melhor_casas_pending_checkouts (cart_id, cart_token, user_id, wedding_list_id, wedding_list_name, wedding_list_code, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (cart_id) DO UPDATE SET
             cart_token = EXCLUDED.cart_token,
             wedding_list_id = EXCLUDED.wedding_list_id,
             wedding_list_name = EXCLUDED.wedding_list_name,
             wedding_list_code = EXCLUDED.wedding_list_code,
             updated_at = NOW()`,
          [
            fullCart.id,
            cartToken,
            userId,
            weddingListInfo.listId,
            weddingListInfo.listName,
            weddingListInfo.shareCode
          ]
        );
        console.log(`✅ [shopify-checkout-url] Informações de lista de casamento armazenadas para cart ${fullCart.id} (token: ${cartToken})`);
      } catch (storageError) {
        console.error('❌ [shopify-checkout-url] Erro ao armazenar informações de lista de casamento:', storageError.message);
        // Não bloquear o checkout se falhar
      }
    }

    // PASSO 5: Retornar checkoutUrl
    // Separar nome em firstName e lastName
    const nameParts = user && user.nome ? (user.nome || '').trim().split(/\s+/) : [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Formatar telefone
    let phone = null;
    if (user && user.telefone) {
      const phoneDigits = user.telefone.replace(/\D/g, '');
      if (phoneDigits.length > 0) {
        phone = phoneDigits.startsWith('55') ? `+${phoneDigits}` : `+55${phoneDigits}`;
      }
    }
    
    res.json({
      success: true,
      checkout_url: fullCart.checkoutUrl,
      cartId: fullCart.id,
      buyerIdentity: fullCart?.buyerIdentity || null,
      shippingRates: fullCart?.shippingRates || [],
      discountCodes: fullCart?.discountCodes || [],
      cost: fullCart?.cost || null,
      userData: user ? {
        firstName: firstName,
        lastName: lastName,
        phone: phone || user.telefone || '',
        cpf: user.cpf || user.documento || '' // Verificar qual campo existe no banco
      } : null
    });
  } catch (error) {
    console.error('❌ [orders/checkout] Erro ao gerar checkout:', error);
    res.status(500).json({ 
      error: 'Erro ao gerar checkout',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Aplicar cupom de desconto ao cart
router.post('/apply-discount', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { cartId, discountCode } = req.body;
    
    if (!cartId) {
      return res.status(400).json({ error: 'cartId é obrigatório' });
    }
    
    // Se discountCode estiver vazio, remover todos os cupons
    const codes = discountCode && discountCode.trim() ? [discountCode.trim()] : [];
    
    console.log('🎟️ [orders/apply-discount] Aplicando cupom(es):', codes.length > 0 ? codes.join(', ') : 'removendo todos');
    
    try {
      const updatedCart = await shopifyService.applyDiscountCode(cartId, codes);
      
      console.log('✅ [orders/apply-discount] Cupom aplicado com sucesso');
      
      res.json({
        success: true,
        cart: updatedCart,
        discountCodes: updatedCart.discountCodes || [],
        discountAllocations: updatedCart.discountAllocations || [],
        cost: updatedCart.cost || null
      });
    } catch (discountError) {
      console.error('❌ [orders/apply-discount] Erro ao aplicar cupom:', discountError);
      res.status(400).json({
        error: 'Erro ao aplicar cupom',
        details: discountError.message
      });
    }
  } catch (error) {
    console.error('❌ [orders/apply-discount] Erro:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Calcular opções de frete via Storefront API (deve vir antes de /:id para evitar conflito)
router.post('/shipping-rates', authenticateToken, [
  body('shipping_address').isObject().withMessage('Endereço de entrega é obrigatório'),
  body('shipping_address.zip').notEmpty().withMessage('CEP é obrigatório'),
  body('shipping_address.city').notEmpty().withMessage('Cidade é obrigatória'),
  body('shipping_address.province').notEmpty().withMessage('Estado é obrigatório'),
  body('items').isArray().withMessage('Itens são obrigatórios')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { shipping_address, items } = req.body;
    const userId = req.user.id;

    console.log('🚚 [orders/shipping-rates] Calculando frete via Storefront API...');

    // Buscar customerAccessToken do banco (opcional)
    let customerAccessToken = null;
    try {
      const userResult = await pool.query(
        'SELECT shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1',
        [userId]
      );
      if (userResult.rows.length > 0 && userResult.rows[0].shopify_customer_token) {
        const expiresAt = userResult.rows[0].shopify_customer_token_expires;
        if (!expiresAt || new Date(expiresAt) > new Date()) {
          customerAccessToken = userResult.rows[0].shopify_customer_token;
          console.log('✅ [orders/shipping-rates] Customer Access Token encontrado');
        }
      }
    } catch (tokenError) {
      console.log('⚠️ [orders/shipping-rates] Não foi possível buscar token:', tokenError.message);
    }

    // Buscar produtos e suas variantes no Shopify
    const productIds = items.map(item => item.product_id);
    const productsResult = await pool.query(
      `SELECT id, codigo FROM melhor_casas_products WHERE id = ANY($1)`,
      [productIds]
    );

    const productsMap = new Map(productsResult.rows.map(p => [p.id, p]));
    
    // Armazenar productsMap para uso no fallback
    let productsMapForFallback = productsMap;

    // Preparar line items para criar cart
    // Precisamos buscar a variante de cada produto no Shopify
    const cartLines = [];
    const variantCache = new Map(); // Cache para evitar buscar o mesmo produto múltiplas vezes
    
    for (const item of items) {
      const product = productsMap.get(item.product_id);
      if (!product) {
        console.warn(`⚠️ [orders/shipping-rates] Produto ${item.product_id} não encontrado no banco`);
        continue;
      }

      // Verificar cache primeiro
      let variantGid = variantCache.get(product.codigo);
      
      if (!variantGid) {
        // O codigo é o ID do produto, precisamos buscar a primeira variante
        try {
          console.log(`🔍 [orders/shipping-rates] Buscando variante do produto ${product.codigo}...`);
          
          // Buscar produto no Shopify para obter a variante
          const shopifyProduct = await shopifyService.getProduct(product.codigo);
          
          if (!shopifyProduct || !shopifyProduct.variants || shopifyProduct.variants.length === 0) {
            console.error(`❌ [orders/shipping-rates] Produto ${product.codigo} sem variantes`);
            continue;
          }

          // Usar a primeira variante (ou a variante padrão)
          const variant = shopifyProduct.variants[0];
          // O ID da variante já vem como número do Shopify Admin API
          // Garantir apenas números para evitar problemas
          const variantId = String(variant.id).replace(/\D/g, '');
          variantGid = `gid://shopify/ProductVariant/${variantId}`;
          
          // Armazenar no cache
          variantCache.set(product.codigo, variantGid);
          console.log(`✅ [orders/shipping-rates] Variante encontrada: ${variantGid}`);
        } catch (variantError) {
          console.error(`❌ [orders/shipping-rates] Erro ao buscar variante do produto ${product.codigo}:`, variantError);
          console.error(`❌ [orders/shipping-rates] Erro detalhado:`, variantError.message);
          continue; // Não adicionar item se não conseguir buscar variante
        }
      }
      
      cartLines.push({
        merchandiseId: variantGid,
        quantity: item.quantidade
      });
    }

    if (cartLines.length === 0) {
      return res.status(400).json({ error: 'Nenhum item válido encontrado' });
    }

    // Validar endereço obrigatório
    if (!shipping_address.address1 || !shipping_address.city || !shipping_address.province || !shipping_address.zip) {
      return res.status(400).json({ 
        error: 'Endereço incompleto. Campos obrigatórios: address1, city, province, zip' 
      });
    }

    // Criar cart na Storefront API
    console.log('🛒 [orders/shipping-rates] Criando cart na Storefront API...');
    let cart;
    try {
      cart = await shopifyService.createCart(cartLines, customerAccessToken);
      console.log('✅ [orders/shipping-rates] Cart criado:', cart.id);
    } catch (cartError) {
      console.error('❌ [orders/shipping-rates] Erro ao criar cart:', cartError);
      return res.status(500).json({ 
        error: 'Erro ao criar carrinho',
        details: process.env.NODE_ENV === 'development' ? cartError.message : undefined
      });
    }

    // Calcular frete usando Storefront API primeiro
    console.log('🚚 [orders/shipping-rates] Calculando opções de frete...');
    console.log('📍 [orders/shipping-rates] Endereço:', {
      address1: shipping_address.address1,
      city: shipping_address.city,
      province: shipping_address.province,
      zip: shipping_address.zip
    });
    
    let shippingRates = [];
    
    // Tentar Storefront API primeiro
    try {
      shippingRates = await shopifyService.calculateShippingRatesStorefront(
        cart.id,
        {
          address1: shipping_address.address1 || shipping_address.street || '',
          address2: shipping_address.address2 || '',
          city: shipping_address.city,
          province: shipping_address.province,
          countryCode: shipping_address.countryCode || 'BR',
          zip: shipping_address.zip
        },
        customerAccessToken
      );
      console.log('✅ [orders/shipping-rates] Fretes da Storefront API:', shippingRates.length);
    } catch (shippingError) {
      console.warn('⚠️ [orders/shipping-rates] Storefront API não retornou fretes:', shippingError.message);
    }
    
    // Se não retornou fretes (ex: Frenet não disponível na Storefront), usar Admin API
    if (shippingRates.length === 0) {
      console.log('🔄 [orders/shipping-rates] Storefront não retornou fretes, usando Admin API (Frenet)...');
      try {
        // Preparar lineItems para Admin API (formato esperado por getShippingRatesFromZones)
        const adminLineItems = [];
        for (const item of items) {
          const product = productsMapForFallback.get(item.product_id);
          if (!product) continue;
          
          // Buscar produto no Shopify para obter peso e variant_id
          try {
            const shopifyProduct = await shopifyService.getProduct(product.codigo);
            if (shopifyProduct && shopifyProduct.variants && shopifyProduct.variants.length > 0) {
              const variant = shopifyProduct.variants[0];
              adminLineItems.push({
                variant_id: variant.id,
                quantity: item.quantidade,
                weight: variant.weight || 0,
                weight_unit: variant.weight_unit || 'kg',
                price: parseFloat(variant.price || 0)
              });
            }
          } catch (variantError) {
            console.warn(`⚠️ [orders/shipping-rates] Erro ao buscar variante ${product.codigo}:`, variantError.message);
          }
        }
        
        if (adminLineItems.length === 0) {
          throw new Error('Não foi possível preparar itens para cálculo de frete');
        }
        
        console.log('📦 [orders/shipping-rates] Usando Admin API para obter taxas do Frenet...');
        console.log('📦 [orders/shipping-rates] LineItems preparados:', adminLineItems.length);
        
        // Usar método Admin API que busca Frenet
        const adminRates = await shopifyService.getShippingRatesFromZones(
          {
            address1: shipping_address.address1 || shipping_address.street || '',
            address2: shipping_address.address2 || '',
            city: shipping_address.city,
            province: shipping_address.province,
            country: shipping_address.countryCode || 'BR',
            zip: shipping_address.zip
          },
          adminLineItems
        );
        
        console.log('📦 [orders/shipping-rates] Fretes do Frenet (Admin API):', adminRates.length);
        console.log('📦 [orders/shipping-rates] Detalhes dos fretes:', adminRates.map(r => ({
          title: r.title,
          price: r.price,
          code: r.code
        })));
        
        // Converter formato Admin API para formato Storefront API
        shippingRates = adminRates
          .filter(rate => {
            const price = parseFloat(rate.price || 0);
            const isValid = price > 0 && rate.title && rate.title !== 'Frete';
            if (!isValid) {
              console.warn(`⚠️ [orders/shipping-rates] Rate inválido ignorado:`, rate);
            }
            return isValid;
          })
          .map(rate => {
            const normalized = shopifyService.normalizeRate(rate);
            return {
              handle: rate.code || normalized.service?.toLowerCase().replace(/\s+/g, '_') || 'shipping',
              title: normalized.service || rate.title,
              cost: parseFloat(normalized.price || rate.price || 0),
              currencyCode: 'BRL',
              estimatedDays: rate.delivery_days ? {
                min: rate.delivery_days,
                max: rate.delivery_days
              } : null
            };
          });
        
        console.log('✅ [orders/shipping-rates] Fretes da Admin API (Frenet):', shippingRates.length);
      } catch (adminError) {
        console.error('❌ [orders/shipping-rates] Erro ao calcular frete via Admin API:', adminError);
        return res.status(500).json({ 
          error: 'Erro ao calcular frete',
          details: process.env.NODE_ENV === 'development' ? adminError.message : undefined
        });
      }
    }
    
    if (shippingRates.length === 0) {
      return res.status(400).json({ 
        error: 'Nenhuma opção de frete disponível para este endereço' 
      });
    }

    res.json({
      success: true,
      rates: shippingRates.map(rate => ({
        handle: rate.handle,
        title: rate.title,
        cost: rate.cost,
        currencyCode: rate.currencyCode,
        estimatedDays: rate.estimatedDays
      })),
      cartId: cart.id // Retornar cartId para uso posterior no checkout
    });
  } catch (error) {
    console.error('❌ [orders/shipping-rates] Erro ao calcular frete:', error);
    res.status(500).json({ 
      error: 'Erro ao calcular frete',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Detalhes do pedido
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await syncShopifyOrdersForUser(req.user);

    const result = await pool.query(
      `SELECT o.id, o.total, o.status, o.tipo_preco_aplicado, o.created_at,
              o.shopify_order_id, o.shopify_order_number, o.shopify_order_name,
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'quantidade', oi.quantidade,
                  'preco_unitario', oi.preco_unitario,
                  'subtotal', oi.subtotal,
                  'discount_label', oi.discount_label,
                  'discount_amount', oi.discount_amount,
                  'produto', json_build_object(
                    'nome', COALESCE(p.nome, oi.product_name),
                    'codigo', COALESCE(p.codigo, oi.product_sku),
                    'descricao', p.descricao,
                    'imagem_url', COALESCE(p.imagem_url, oi.imagem_url)
                  )
                )
              ) as items
       FROM melhor_casas_orders o
       LEFT JOIN melhor_casas_order_items oi ON o.id = oi.order_id
       LEFT JOIN melhor_casas_products p ON oi.product_id = p.id
       WHERE o.id = $1 AND o.user_id = $2
       GROUP BY o.id, o.total, o.status, o.tipo_preco_aplicado, o.created_at, o.shopify_order_id, o.shopify_order_number, o.shopify_order_name`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.json({ order: result.rows[0] });
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Calcular preço de uma lista de produtos (para simulação)
router.post('/calculate', authenticateToken, [
  body('items').isArray({ min: 1 }).withMessage('Pelo menos um item é obrigatório'),
  body('items.*.product_id').isInt().withMessage('ID do produto deve ser um número'),
  body('items.*.quantidade').isInt({ min: 1 }).withMessage('Quantidade deve ser maior que 0')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items } = req.body;

    // Verificar se todos os produtos existem
    const productIds = items.map(item => item.product_id);
    const productsResult = await pool.query(
      'SELECT id, nome, preco_varejo, preco_atacado, quantidade_minima_atacado FROM melhor_casas_products WHERE id = ANY($1) AND ativo = true',
      [productIds]
    );

    if (productsResult.rows.length !== productIds.length) {
      return res.status(400).json({ error: 'Um ou mais produtos não foram encontrados' });
    }

    const melhor_casas_products = productsResult.rows;
    let totalVarejo = 0;
    let totalAtacado = 0;
    let economia = 0;
    const calculatedItems = [];

    // Calcular preços
    for (const item of items) {
      const product = melhor_casas_products.find(p => p.id === item.product_id);
      const quantidade = item.quantidade;
      
      const precoVarejo = product.preco_varejo * quantidade;
      const precoAtacado = quantidade >= product.quantidade_minima_atacado 
        ? product.preco_atacado * quantidade 
        : precoVarejo;
      
      totalVarejo += precoVarejo;
      totalAtacado += precoAtacado;

      calculatedItems.push({
        product_id: product.id,
        nome: product.nome,
        quantidade,
        preco_varejo: product.preco_varejo,
        preco_atacado: product.preco_atacado,
        preco_aplicado: quantidade >= product.quantidade_minima_atacado ? 'atacado' : 'varejo',
        subtotal_varejo: precoVarejo,
        subtotal_atacado: precoAtacado,
        economia_item: precoVarejo - precoAtacado
      });
    }

    economia = totalVarejo - totalAtacado;
    const percentualEconomia = totalVarejo > 0 ? (economia / totalVarejo) * 100 : 0;

    res.json({
      items: calculatedItems,
      resumo: {
        total_varejo: totalVarejo,
        total_atacado: totalAtacado,
        economia: economia,
        percentual_economia: percentualEconomia
      }
    });
  } catch (error) {
    console.error('Erro ao calcular preços:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar checkout integrado com Shopify
router.post('/checkout', authenticateToken, [
  body('shipping_address').isObject().withMessage('Endereço de entrega é obrigatório'),
  body('shipping_address.first_name').notEmpty().withMessage('Nome é obrigatório'),
  body('shipping_address.last_name').notEmpty().withMessage('Sobrenome é obrigatório'),
  body('shipping_address.address1').notEmpty().withMessage('Endereço é obrigatório'),
  body('shipping_address.city').notEmpty().withMessage('Cidade é obrigatória'),
  body('shipping_address.zip').notEmpty().withMessage('CEP é obrigatório'),
  body('billing_address').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { shipping_address, billing_address, use_cart = true, items = null, delivery_type = 'delivery', shipping_rate = null } = req.body;

    // Obter carrinho do usuário ou usar items fornecidos
    let cartItems = [];
    if (use_cart) {
      const cart = cartService.getCart(userId);
      if (!cart || !cart.items || cart.items.length === 0) {
        return res.status(400).json({ error: 'Carrinho vazio' });
      }
      cartItems = cart.items;
    } else if (items && Array.isArray(items)) {
      cartItems = items;
    } else {
      return res.status(400).json({ error: 'Nenhum item fornecido para checkout' });
    }

    // Validar tipo de entrega
    if (delivery_type === 'delivery' && !shipping_address) {
      return res.status(400).json({ error: 'Endereço de entrega é obrigatório para entrega' });
    }

    if (delivery_type === 'delivery' && !shipping_rate) {
      return res.status(400).json({ error: 'Opção de frete é obrigatória para entrega' });
    }

    // Buscar dados completos dos produtos e variantes do Shopify
    const productIds = cartItems.map(item => item.product_id);
    const productsResult = await pool.query(
      `SELECT id, codigo, nome, preco_varejo, preco_atacado, preco_exclusivo, 
              quantidade_minima_atacado, estoque, disponivel
       FROM melhor_casas_products 
       WHERE id = ANY($1) AND disponivel = true`,
      [productIds]
    );

    if (productsResult.rows.length !== productIds.length) {
      return res.status(400).json({ error: 'Um ou mais produtos não foram encontrados ou estão indisponíveis' });
    }

    const productsMap = new Map(productsResult.rows.map(p => [p.id, p]));

    // Buscar informações do usuário
    const userResult = await pool.query(
      'SELECT id, nome, email, telefone FROM melhor_casas_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    // Preparar items para o Shopify
    const shopifyLineItems = [];
    let totalLocal = 0;
    const orderItems = [];
    
    // Verificar se há itens de lista de casamento e coletar informações
    let weddingListInfo = null;
    const weddingListIds = new Set();
    
    console.log('🔍 [checkout] Verificando itens do carrinho para listas de casamento...');
    console.log('🔍 [checkout] Total de itens:', cartItems.length);
    
    for (const cartItem of cartItems) {
      console.log('🔍 [checkout] Item do carrinho:', {
        product_id: cartItem.product_id,
        quantidade: cartItem.quantidade,
        wedding_list_id: cartItem.wedding_list_id,
        list_item_id: cartItem.list_item_id
      });
      
      if (cartItem.wedding_list_id) {
        weddingListIds.add(parseInt(cartItem.wedding_list_id));
        console.log(`🎁 [checkout] Item pertence à lista de casamento: ${cartItem.wedding_list_id}`);
      }
    }
    
    console.log('🔍 [checkout] Listas de casamento encontradas:', Array.from(weddingListIds));
    
    // Se houver itens de lista de casamento, buscar informações da lista
    if (weddingListIds.size > 0) {
      try {
        const listId = Array.from(weddingListIds)[0]; // Pegar primeira lista (geralmente só uma)
        console.log(`🔍 [checkout] Buscando informações da lista ${listId}...`);
        
        const listResult = await pool.query(
          'SELECT id, nome, codigo_compartilhamento FROM melhor_casas_wedding_lists WHERE id = $1',
          [listId]
        );
        
        if (listResult.rows.length > 0) {
          const list = listResult.rows[0];
          weddingListInfo = {
            listId: list.id,
            listName: list.nome,
            shareCode: list.codigo_compartilhamento
          };
          console.log(`🎁 [checkout] Pedido contém itens da lista de casamento: ${list.nome} (ID: ${list.id})`);
        } else {
          console.warn(`⚠️ [checkout] Lista ${listId} não encontrada no banco de dados`);
        }
      } catch (listError) {
        console.error('❌ [checkout] Erro ao buscar informações da lista de casamento:', listError);
        // Continuar mesmo se houver erro
      }
    } else {
      console.log('⚠️ [checkout] Nenhum item de lista de casamento encontrado no carrinho');
    }

    for (const cartItem of cartItems) {
      const product = productsMap.get(cartItem.product_id);
      if (!product) continue;

      // Verificar estoque
      if (product.estoque < cartItem.quantidade) {
        return res.status(400).json({ 
          error: `Estoque insuficiente para ${product.nome}`,
          produto: product.nome,
          estoque_disponivel: product.estoque
        });
      }

      // Determinar preço
      let precoUnitario = product.preco_varejo;
      if (cartItem.quantidade >= product.quantidade_minima_atacado) {
        precoUnitario = product.preco_atacado;
      }

      const subtotal = precoUnitario * cartItem.quantidade;
      totalLocal += subtotal;

      // Buscar variante do produto no Shopify
      const variant = await shopifyService.getProductVariant(product.codigo);
      if (!variant) {
        return res.status(400).json({ 
          error: `Variante não encontrada no Shopify para ${product.nome}` 
        });
      }

      shopifyLineItems.push({
        variant_id: variant.id,
        quantity: cartItem.quantidade
      });

      orderItems.push({
        product_id: product.id,
        quantidade: cartItem.quantidade,
        preco_unitario: precoUnitario,
        subtotal,
        nome: product.nome,
        sku: product.codigo,
        imagem_url: product.imagem_url
      });
    }

    // Adicionar frete ao total se for entrega
    if (delivery_type === 'delivery' && shipping_rate) {
      totalLocal += parseFloat(shipping_rate.price || 0);
    }

    if (shopifyLineItems.length === 0) {
      return res.status(400).json({ error: 'Nenhum item válido para checkout' });
    }

    // Preparar informações do cliente
    const customerInfo = {
      email: user.email,
      phone: user.telefone || (shipping_address ? shipping_address.phone : ''),
      first_name: shipping_address ? shipping_address.first_name : user.nome?.split(' ')[0] || '',
      last_name: shipping_address ? shipping_address.last_name : user.nome?.split(' ').slice(1).join(' ') || ''
    };

    // Criar order no Shopify
    let shopifyOrder;
    try {
      // Se for retirada, não enviar endereço de entrega
      const finalShippingAddress = delivery_type === 'delivery' ? shipping_address : null;
      const finalBillingAddress = billing_address || finalShippingAddress;

      shopifyOrder = await shopifyService.createOrder(
        shopifyLineItems,
        customerInfo,
        finalShippingAddress,
        finalBillingAddress,
        delivery_type === 'pickup' ? 'pickup' : null,
        shipping_rate,
        weddingListInfo // Passar informações da lista de casamento
      );
    } catch (shopifyError) {
      console.error('Erro ao criar order no Shopify:', shopifyError);
      return res.status(500).json({ 
        error: 'Erro ao processar pedido no Shopify',
        details: shopifyError.message 
      });
    }

    // Criar order local no banco de dados
    const orderResult = await pool.query(
      `INSERT INTO melhor_casas_orders 
       (user_id, total, tipo_preco_aplicado, status, shopify_order_id, shopify_order_number, shopify_order_name, currency) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        userId,
        totalLocal,
        'varejo',
        'processando',
        shopifyOrder.id.toString(),
        shopifyOrder.order_number ? shopifyOrder.order_number.toString() : null,
        shopifyOrder.name || null,
        shopifyOrder.currency || 'BRL',
      ]
    );

    const localOrder = orderResult.rows[0];

    // Criar itens do pedido local e processar compras de listas de casamento
    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const cartItem = cartItems[i];
      
      await pool.query(
        `INSERT INTO melhor_casas_order_items 
         (order_id, product_id, quantidade, preco_unitario, subtotal, product_name, product_sku, imagem_url) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          localOrder.id,
          item.product_id,
          item.quantidade,
          item.preco_unitario,
          item.subtotal,
          item.nome || null,
          item.sku || null,
          item.imagem_url || null,
        ]
      );

      // Verificar se item vem de uma lista de casamento
      console.log(`🔍 [checkout] Verificando item ${i}:`, {
        product_id: item.product_id,
        cartItem_wedding_list_id: cartItem?.wedding_list_id,
        cartItem_list_item_id: cartItem?.list_item_id,
        has_wedding_list_id: !!(cartItem && cartItem.wedding_list_id),
        has_list_item_id: !!(cartItem && cartItem.list_item_id)
      });
      
      if (cartItem && cartItem.wedding_list_id && cartItem.list_item_id) {
        try {
          const listId = parseInt(cartItem.wedding_list_id);
          const listItemId = parseInt(cartItem.list_item_id);
          const quantidadeComprada = item.quantidade;
          
          console.log(`🎁 [checkout] Processando compra de item de lista: lista ${listId}, item ${listItemId}, quantidade ${quantidadeComprada}`);

          // Verificar se item da lista existe e se quantidade não excede o desejado
          const listItemResult = await pool.query(
            `SELECT quantidade_desejada, quantidade_comprada 
             FROM melhor_casas_wedding_list_items 
             WHERE id = $1 AND list_id = $2`,
            [listItemId, listId]
          );

          if (listItemResult.rows.length > 0) {
            const listItem = listItemResult.rows[0];
            const quantidadeDesejada = parseInt(listItem.quantidade_desejada);
            const quantidadeJaComprada = parseInt(listItem.quantidade_comprada || 0);
            const quantidadeDisponivel = quantidadeDesejada - quantidadeJaComprada;

            // Validar quantidade
            if (quantidadeComprada > quantidadeDisponivel) {
              console.warn(`⚠️ [checkout] Quantidade comprada (${quantidadeComprada}) excede disponível (${quantidadeDisponivel}) para item ${listItemId}`);
              // Ajustar para quantidade disponível
              const quantidadeAjustada = Math.max(0, quantidadeDisponivel);
              
              if (quantidadeAjustada > 0) {
                // Atualizar quantidade comprada
                await pool.query(
                  `UPDATE melhor_casas_wedding_list_items 
                   SET quantidade_comprada = quantidade_comprada + $1, updated_at = CURRENT_TIMESTAMP
                   WHERE id = $2`,
                  [quantidadeAjustada, listItemId]
                );

                // Registrar compra
                await pool.query(
                  `INSERT INTO melhor_casas_wedding_list_purchases 
                   (list_id, list_item_id, order_id, user_id, quantidade_comprada, mensagem_comprador)
                   VALUES ($1, $2, $3, $4, $5, $6)`,
                  [listId, listItemId, localOrder.id, userId, quantidadeAjustada, cartItem.mensagem_comprador || null]
                );
              }
            } else {
              // Atualizar quantidade comprada
              await pool.query(
                `UPDATE melhor_casas_wedding_list_items 
                 SET quantidade_comprada = quantidade_comprada + $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [quantidadeComprada, listItemId]
              );

              // Registrar compra
              await pool.query(
                `INSERT INTO melhor_casas_wedding_list_purchases 
                 (list_id, list_item_id, order_id, user_id, quantidade_comprada, mensagem_comprador)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [listId, listItemId, localOrder.id, userId, quantidadeComprada, cartItem.mensagem_comprador || null]
              );

              console.log(`✅ [checkout] Item de lista ${listItemId} marcado como comprado (quantidade: ${quantidadeComprada})`);
            }
          } else {
            console.warn(`⚠️ [checkout] Item de lista ${listItemId} não encontrado na lista ${listId}`);
          }
        } catch (listError) {
          console.error('❌ [checkout] Erro ao processar compra de item de lista:', listError);
          // Não bloquear o checkout se houver erro ao processar lista
        }
      }
    }

    // Limpar carrinho após checkout bem-sucedido
    if (use_cart) {
      cartService.deleteCart(userId);
    }

    // Enviar notificação imediatamente após criar pedido
    // Executar em background sem bloquear a resposta
    const orderNotificationService = require('../services/orderNotificationService');
    const totalShippingPrice = delivery_type === 'delivery' && shipping_rate 
      ? parseFloat(shipping_rate.price || 0) 
      : 0;
    
    console.log('🔔 [orders/checkout] Iniciando envio de notificação para pedido:', {
      userId,
      orderId: shopifyOrder.id.toString(),
      orderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
      deliveryType: delivery_type,
      totalShippingPrice
    });
    
    // Executar notificação em background (não bloquear resposta)
    orderNotificationService.sendOrderCreatedNotification({
      userId: userId,
      orderId: shopifyOrder.id.toString(),
      orderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
      deliveryType: delivery_type,
      totalShippingPrice: totalShippingPrice
    }).then(() => {
      console.log('✅ [orders/checkout] Notificação enviada com sucesso');
    }).catch((notificationError) => {
      console.error('❌ [orders/checkout] Erro ao enviar notificação:', notificationError.message);
      console.error('❌ [orders/checkout] Stack:', notificationError.stack);
      // Não bloquear resposta do pedido se houver erro nas notificações
    });

    res.status(201).json({
      success: true,
      message: 'Pedido criado com sucesso',
      order: {
        id: localOrder.id,
        shopify_order_id: shopifyOrder.id,
        shopify_order_number: shopifyOrder.order_number,
        total: localOrder.total,
        status: localOrder.status,
        created_at: localOrder.created_at,
        shopify_order_url: `https://${shopifyService.domain}/admin/orders/${shopifyOrder.id}`
      }
    });
  } catch (error) {
    console.error('Erro ao processar checkout:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;






