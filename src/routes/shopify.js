const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopifyService');
const db = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const orderNotificationService = require('../services/orderNotificationService');
const autoSyncService = require('../services/autoSyncService');
const newProductsSyncService = require('../services/newProductsSyncService');
const ratingsSyncService = require('../services/ratingsSyncService');
const bulkSyncService = require('../services/bulkSyncService');

// Rota para sincronização manual (sempre sincroniza todos os produtos usando bulk operations)
router.post('/sync', async (req, res) => {
  try {
    console.log('🔄 Iniciando sincronização manual com Shopify...');
    console.log('📋 Sincronizando TODOS os produtos usando Bulk Operations');
    
    // Usar bulk operations por padrão (muito mais rápido)
    const useBulk = req.query.useBulk !== 'false'; // Padrão: true
    
    let result;
    if (useBulk) {
      result = await shopifyService.syncAllProductsBulk(db, true);
    } else {
      // Fallback para método antigo se especificado
      result = await shopifyService.syncAllProducts(db);
    }
    
    res.json({
      success: true,
      message: 'Sincronização concluída com sucesso',
      data: result
    });
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao sincronizar produtos com Shopify',
      details: error.message
    });
  }
});

// ==========================================
// BACKFILL - Pronto para Retirada (Bulk GraphQL)
// ==========================================
router.post('/backfill-ready-for-pickup', authenticateToken, async (req, res) => {
  try {
    // Opcional: restringir para admin (id 1)
    if (req.user?.id !== 1) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    const queryFilter = req.body?.query || 'status:open';
    const maxWaitTime = req.body?.maxWaitTime || 10 * 60 * 1000; // 10 min
    const pollInterval = req.body?.pollInterval || 3000;

    console.log('🔄 [backfill-ready-for-pickup] Iniciando bulk operation...');
    console.log('🔄 [backfill-ready-for-pickup] Query filter:', queryFilter);

    const bulkQuery = `
      {
        orders(query: "${queryFilter}", first: 250) {
          edges {
            node {
              id
              name
              legacyResourceId
              email
              currentTotalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              fulfillmentOrders(first: 10) {
                edges {
                  node {
                    id
                    status
                    deliveryMethod {
                      methodType
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Verificar se já existe bulk em andamento
    const currentStatus = await shopifyService.getBulkOperationStatus();
    if (currentStatus && currentStatus.status === 'RUNNING') {
      return res.status(409).json({
        success: false,
        error: 'Já existe uma bulk operation em andamento',
        status: currentStatus
      });
    }

    const bulkId = await shopifyService.startBulkOperation(bulkQuery);
    const bulkStatus = await shopifyService.waitForBulkOperation(maxWaitTime, pollInterval);
    const results = await shopifyService.downloadBulkOperationResults(bulkStatus.url);

    // Processar resultados (Bulk retorna JSONL com __parentId)
    const ordersById = new Map();
    for (const item of results) {
      if (!item || !item.id) continue;

      const isOrder = item.id.includes('gid://shopify/Order/') && !item.__parentId;
      if (isOrder) {
        ordersById.set(item.id, { ...item, fulfillmentOrders: [] });
        continue;
      }

      // FulfillmentOrder: vem com __parentId apontando para Order
      if (item.__parentId && (item.status || item.deliveryMethod)) {
        const parent = ordersById.get(item.__parentId);
        if (parent) {
          parent.fulfillmentOrders.push(item);
        }
      }
    }

    const readyOrders = [];
    for (const order of ordersById.values()) {
      const hasReady = (order.fulfillmentOrders || []).some((fo) => {
        const status = fo.status?.toUpperCase?.() || fo.status;
        const methodType = fo.deliveryMethod?.methodType?.toUpperCase?.();
        return status === 'READY_FOR_PICKUP' && (methodType === 'LOCAL' || methodType === 'PICK_UP' || methodType === 'PICKUP');
      });

      if (hasReady) {
        readyOrders.push(order);
      }
    }

    console.log(`✅ [backfill-ready-for-pickup] Pedidos READY_FOR_PICKUP encontrados: ${readyOrders.length}`);

    let updated = 0;
    let skipped = 0;
    for (const order of readyOrders) {
      const orderId = order.legacyResourceId?.toString() || order.id?.match(/Order\/(\d+)/)?.[1] || null;
      const orderNumber = order.name?.replace('#', '') || null;
      const email = order.email;

      if (!orderId || !email) {
        skipped++;
        continue;
      }

      const userResult = await db.query(
        'SELECT id FROM melhor_casas_users WHERE email = $1',
        [email]
      );
      if (userResult.rows.length === 0) {
        skipped++;
        continue;
      }

      const userId = userResult.rows[0].id;
      
      // Primeiro tenta atualizar, se não existir, insere
      const updateResult = await db.query(
        `UPDATE melhor_casas_orders
         SET status = 'pronto_retirada',
             shopify_order_number = COALESCE($2, shopify_order_number),
             updated_at = NOW()
         WHERE shopify_order_id = $1
         RETURNING id`,
        [orderId, orderNumber]
      );
      
      if (updateResult.rowCount === 0) {
        await db.query(
          `INSERT INTO melhor_casas_orders
           (user_id, total, status, shopify_order_id, shopify_order_number, shopify_order_name, currency, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          [
            userId,
            parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || 0),
            'pronto_retirada',
            orderId,
            orderNumber,
            order.name || null,
            order.currentTotalPriceSet?.shopMoney?.currencyCode || 'BRL'
          ]
        );
      }
      updated++;
    }

    res.json({
      success: true,
      bulkId,
      totalOrders: ordersById.size,
      readyOrders: readyOrders.length,
      updated,
      skipped
    });
  } catch (error) {
    console.error('❌ [backfill-ready-for-pickup] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para buscar produtos do Shopify
router.get('/products', async (req, res) => {
  try {
    const products = await shopifyService.getAllProducts();
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('❌ Erro ao buscar produtos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar produtos do Shopify',
      details: error.message
    });
  }
});

// Rota para buscar coleções do Shopify
router.get('/collections', async (req, res) => {
  try {
    const collections = await shopifyService.getAllCollections();
    res.json({
      success: true,
      data: collections
    });
  } catch (error) {
    console.error('❌ Erro ao buscar coleções:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar coleções do Shopify',
      details: error.message
    });
  }
});

// Webhook para produtos criados
router.post('/webhook/products/create', async (req, res) => {
  try {
    console.log('📦 Webhook: Produto criado');
    await shopifyService.processProductWebhook(req.body, db);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro no webhook de criação:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook para produtos atualizados
router.post('/webhook/products/update', async (req, res) => {
  try {
    console.log('🔄 Webhook: Produto atualizado');
    await shopifyService.processProductWebhook(req.body, db);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro no webhook de atualização:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook para produtos deletados
router.post('/webhook/products/delete', async (req, res) => {
  try {
    console.log('🗑️ Webhook: Produto deletado');
    const productId = req.body.id;
    
    await db.query(
      'UPDATE melhor_casas_products SET disponivel = false WHERE codigo = $1',
      [productId.toString()]
    );
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro no webhook de exclusão:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook para pedidos criados
router.post('/webhook/orders/create', async (req, res) => {
  try {
    console.log('📦 Webhook: Pedido criado');
    console.log('📦 [webhook/orders/create] ========== INÍCIO ==========');
    const order = req.body;
    const orderId = order.id;
    const cartToken = order.cart_token;
    const customerEmail = order.email || (order.customer && order.customer.email);
    
    console.log(`🔍 [webhook/orders/create] Pedido ${orderId} criado:`, {
      email: customerEmail ? '***' : 'não informado',
      name: order.name,
      cart_token: cartToken || 'não informado',
      hasNoteAttributes: !!(order.note_attributes && order.note_attributes.length > 0),
      noteAttributesCount: order.note_attributes ? order.note_attributes.length : 0
    });

    const pool = require('../database/connection');
    let listInfo = null;
    let pendingCheckoutResult = null;

    // PRIMEIRO: Tentar buscar pelo cart_token (método mais confiável para pedidos novos)
    // Isso é o que funcionava no commit 890c044
    if (cartToken) {
      console.log(`🔍 [webhook/orders/create] Buscando por cart_token: ${cartToken}`);
      
      // Tentar buscar por cart_token primeiro (campo separado)
      pendingCheckoutResult = await pool.query(
        `SELECT wedding_list_id, wedding_list_name, wedding_list_code, user_id, cart_id, cart_token
         FROM melhor_casas_pending_checkouts 
         WHERE cart_token = $1 OR cart_id LIKE $2`,
        [cartToken, `%/${cartToken}%`]
      );
      
      console.log(`🔍 [webhook/orders/create] Resultado da busca por cart_token:`, {
        encontrados: pendingCheckoutResult.rows.length,
        resultados: pendingCheckoutResult.rows.map(r => ({
          cart_id: r.cart_id,
          cart_token: r.cart_token,
          list_id: r.wedding_list_id
        }))
      });
      
      if (pendingCheckoutResult.rows.length === 0) {
        // Tentar buscar pelo cart_id completo também
        pendingCheckoutResult = await pool.query(
          `SELECT wedding_list_id, wedding_list_name, wedding_list_code, user_id, cart_id, cart_token
           FROM melhor_casas_pending_checkouts 
           WHERE cart_id = $1`,
          [cartToken]
        );
        console.log(`🔍 [webhook/orders/create] Resultado da busca por cart_id completo:`, {
          encontrados: pendingCheckoutResult.rows.length
        });
      }

      if (pendingCheckoutResult && pendingCheckoutResult.rows.length > 0) {
        const checkoutInfo = pendingCheckoutResult.rows[0];
        listInfo = {
          listId: checkoutInfo.wedding_list_id,
          listName: checkoutInfo.wedding_list_name,
          shareCode: checkoutInfo.wedding_list_code,
          listOwnerId: checkoutInfo.user_id
        };
        console.log(`✅ [webhook/orders/create] Lista encontrada via cart_token:`, {
          listId: listInfo.listId,
          listName: listInfo.listName
        });
      }
    }

    // SEGUNDO: Se não encontrou pelo cart_token, tentar pelos note_attributes (para pedidos já atualizados)
    if (!listInfo && order.note_attributes && Array.isArray(order.note_attributes) && order.note_attributes.length > 0) {
      console.log(`🔍 [webhook/orders/create] Verificando note_attributes:`, {
        noteAttributesCount: order.note_attributes.length,
        noteAttributes: order.note_attributes.map(attr => ({ name: attr.name, value: attr.value }))
      });
      
      const shareCodeAttr = order.note_attributes.find(attr => attr.name === 'Código de Compartilhamento');
      const listIdAttr = order.note_attributes.find(attr => attr.name === 'ID da Lista');
      
      if (shareCodeAttr && shareCodeAttr.value) {
        console.log(`🎁 [webhook/orders/create] Encontrado código de compartilhamento nos note_attributes: ${shareCodeAttr.value}`);
        
        const listResult = await pool.query(
          `SELECT id, nome, codigo_compartilhamento, user_id 
           FROM melhor_casas_wedding_lists 
           WHERE codigo_compartilhamento = $1`,
          [shareCodeAttr.value]
        );

        if (listResult.rows.length > 0) {
          const list = listResult.rows[0];
          listInfo = {
            listId: list.id,
            listName: list.nome,
            shareCode: list.codigo_compartilhamento,
            listOwnerId: list.user_id
          };
          console.log(`✅ [webhook/orders/create] Lista encontrada pelos note_attributes: ${list.nome}`);
        }
      } else if (listIdAttr && listIdAttr.value) {
        const listResult = await pool.query(
          `SELECT id, nome, codigo_compartilhamento, user_id 
           FROM melhor_casas_wedding_lists 
           WHERE id = $1`,
          [parseInt(listIdAttr.value)]
        );

        if (listResult.rows.length > 0) {
          const list = listResult.rows[0];
          listInfo = {
            listId: list.id,
            listName: list.nome,
            shareCode: list.codigo_compartilhamento,
            listOwnerId: list.user_id
          };
          console.log(`✅ [webhook/orders/create] Lista encontrada pelo ID nos note_attributes: ${list.nome}`);
        }
      }
    }

    // TERCEIRO: Se ainda não encontrou, tentar por email do usuário (fallback)
    if (!listInfo && customerEmail) {
      console.log(`🔍 [webhook/orders/create] Tentando buscar por email: ${customerEmail}`);
      const userResult = await pool.query(
        `SELECT id FROM melhor_casas_users WHERE email = $1`,
        [customerEmail]
      );
      
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;
        pendingCheckoutResult = await pool.query(
          `SELECT wedding_list_id, wedding_list_name, wedding_list_code, user_id
           FROM melhor_casas_pending_checkouts 
           WHERE user_id = $1 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [userId]
        );

        if (pendingCheckoutResult && pendingCheckoutResult.rows.length > 0) {
          const checkoutInfo = pendingCheckoutResult.rows[0];
          listInfo = {
            listId: checkoutInfo.wedding_list_id,
            listName: checkoutInfo.wedding_list_name,
            shareCode: checkoutInfo.wedding_list_code,
            listOwnerId: checkoutInfo.user_id
          };
          console.log(`✅ [webhook/orders/create] Lista encontrada via email:`, {
            listId: listInfo.listId,
            listName: listInfo.listName
          });
        }
      }
    }

    if (!listInfo) {
      console.log(`⚠️ [webhook/orders/create] Nenhuma lista encontrada por nenhum método`);
    }

    if (listInfo) {
      console.log(`🎁 [webhook/orders/create] ========== PROCESSANDO LISTA ==========`);
      const listId = listInfo.listId;
      const listOwnerId = listInfo.listOwnerId;
      
      console.log(`🎁 [webhook/orders/create] Processando lista de casamento para pedido ${orderId}:`, {
        listId: listId,
        listName: listInfo.listName,
        listOwnerId: listOwnerId
      });

      // IMPORTANTE: Atualizar pedido no Shopify com tags e note_attributes
      // Isso deve ser feito ANTES de processar os itens para garantir que o pedido tenha as informações corretas
      try {
        const shopifyService = require('../services/shopifyService');
        const weddingListInfoForShopify = {
          listId: listInfo.listId,
          listName: listInfo.listName,
          shareCode: listInfo.shareCode
        };
        
        console.log(`🔄 [webhook/orders/create] Atualizando pedido ${orderId} no Shopify com informações de lista...`);
        await shopifyService.updateOrderWithWeddingListInfo(orderId, weddingListInfoForShopify);
        console.log(`✅ [webhook/orders/create] Pedido ${orderId} atualizado com tags e note_attributes`);
      } catch (updateError) {
        console.error(`❌ [webhook/orders/create] Erro ao atualizar pedido ${orderId} no Shopify:`, updateError.message);
        // Continuar mesmo se falhar (não bloquear processamento)
      }

      // Processar itens do pedido para atualizar progresso da lista
      if (order.line_items && Array.isArray(order.line_items) && order.line_items.length > 0) {
        console.log(`🔍 [webhook/orders/create] Processando ${order.line_items.length} itens do pedido...`);
        
        // Buscar ID do comprador pelo email
        let buyerUserId = null;
        if (customerEmail) {
          const buyerResult = await pool.query(
            `SELECT id FROM melhor_casas_users WHERE email = $1`,
            [customerEmail]
          );
          if (buyerResult.rows.length > 0) {
            buyerUserId = buyerResult.rows[0].id;
          }
        }

        // Criar pedido local se não existir (para registrar compras)
        let localOrderId = null;
        try {
          const existingOrderResult = await pool.query(
            `SELECT id FROM melhor_casas_orders WHERE shopify_order_id = $1`,
            [orderId.toString()]
          );
          
          if (existingOrderResult.rows.length > 0) {
            localOrderId = existingOrderResult.rows[0].id;
          } else {
            // Criar pedido local básico
            const newOrderResult = await pool.query(
              `INSERT INTO melhor_casas_orders 
               (user_id, total, status, shopify_order_id, shopify_order_number, shopify_order_name, currency, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
               RETURNING id`,
              [
                buyerUserId,
                parseFloat(order.total_price || 0),
                'processando',
                orderId.toString(),
                order.order_number ? order.order_number.toString() : null,
                order.name || null,
                order.currency || 'BRL'
              ]
            );
            localOrderId = newOrderResult.rows[0].id;
          }
        } catch (orderError) {
          console.error(`❌ [webhook/orders/create] Erro ao criar/buscar pedido local:`, orderError.message);
        }

        // Flag para indicar se algum item foi atualizado
        let algumItemAtualizado = false;

        // Processar cada item do pedido
        for (const lineItem of order.line_items) {
                 const sku = lineItem.sku;
                 const productIdShopify = lineItem.product_id;
                 const variantIdShopify = lineItem.variant_id;
                 const quantity = parseInt(lineItem.quantity || 1);
                 
                 console.log(`🔍 [webhook/orders/create] Processando item:`, {
                   sku: sku || 'não informado',
                   product_id: productIdShopify || 'não informado',
                   variant_id: variantIdShopify || 'não informado',
                   title: lineItem.title || 'não informado',
                   quantity: quantity
                 });

                 let productId = null;

                 // Tentar buscar produto pelo SKU primeiro
                 if (sku) {
                   const productResult = await pool.query(
                     `SELECT id FROM melhor_casas_products WHERE codigo = $1`,
                     [sku]
                   );
                   if (productResult.rows.length > 0) {
                     productId = productResult.rows[0].id;
                     console.log(`✅ [webhook/orders/create] Produto encontrado pelo SKU: ${sku} -> produto ID ${productId}`);
                   }
                 }

                 // Se não encontrou pelo SKU, tentar pelo product_id do Shopify
                 if (!productId && productIdShopify) {
                   const productResult = await pool.query(
                     `SELECT id FROM melhor_casas_products WHERE codigo = $1`,
                     [productIdShopify.toString()]
                   );
                   if (productResult.rows.length > 0) {
                     productId = productResult.rows[0].id;
                     console.log(`✅ [webhook/orders/create] Produto encontrado pelo product_id: ${productIdShopify} -> produto ID ${productId}`);
                   }
                 }

                 // Se ainda não encontrou, tentar pelo variant_id do Shopify
                 if (!productId && variantIdShopify) {
                   const productResult = await pool.query(
                     `SELECT id FROM melhor_casas_products WHERE codigo = $1`,
                     [variantIdShopify.toString()]
                   );
                   if (productResult.rows.length > 0) {
                     productId = productResult.rows[0].id;
                     console.log(`✅ [webhook/orders/create] Produto encontrado pelo variant_id: ${variantIdShopify} -> produto ID ${productId}`);
                   }
                 }

                 if (!productId) {
                   console.warn(`⚠️ [webhook/orders/create] Produto não encontrado no banco. SKU: ${sku || 'não informado'}, product_id: ${productIdShopify || 'não informado'}, variant_id: ${variantIdShopify || 'não informado'}`);
                   continue;
                 }

          // Buscar TODOS os itens da lista de casamento para este produto (pode haver múltiplos)
          const listItemsResult = await pool.query(
            `SELECT id, quantidade_desejada, quantidade_comprada 
             FROM melhor_casas_wedding_list_items 
             WHERE list_id = $1 AND product_id = $2
             ORDER BY id ASC`,
            [listId, productId]
          );

          // Verificar se este produto já foi processado para este pedido nesta lista (evitar duplicação)
          const existingPurchaseCheck = await pool.query(
            `SELECT SUM(quantidade_comprada) as total_ja_processado
             FROM melhor_casas_wedding_list_purchases 
             WHERE order_id = $1 AND list_id = $2 AND list_item_id IN (
               SELECT id FROM melhor_casas_wedding_list_items WHERE list_id = $2 AND product_id = $3
             )`,
            [localOrderId, listId, productId]
          );
          
          const totalJaProcessado = parseInt(existingPurchaseCheck.rows[0]?.total_ja_processado || 0);
          const quantidadeDisponivelParaProcessar = Math.max(0, quantity - totalJaProcessado);
          
          console.log(`🔍 [webhook/orders/create] Verificando duplicação para produto ${productId}:`, {
            quantidadePedido: quantity,
            totalJaProcessado: totalJaProcessado,
            quantidadeDisponivelParaProcessar: quantidadeDisponivelParaProcessar
          });
          
          if (quantidadeDisponivelParaProcessar <= 0) {
            console.log(`⚠️ [webhook/orders/create] Produto ${productId} já foi totalmente processado para este pedido (${totalJaProcessado}/${quantity}), pulando...`);
            continue;
          }

          if (listItemsResult.rows.length > 0) {
            let quantidadeRestante = quantidadeDisponivelParaProcessar; // Usar apenas a quantidade disponível
            
            // Distribuir a quantidade comprada entre os itens da lista (se houver múltiplos)
            for (const listItem of listItemsResult.rows) {
              if (quantidadeRestante <= 0) break;
              
              const listItemId = listItem.id;
              const quantidadeDesejada = parseInt(listItem.quantidade_desejada || 0);
              const quantidadeJaComprada = parseInt(listItem.quantidade_comprada || 0);
              const quantidadeDisponivel = quantidadeDesejada - quantidadeJaComprada;
              
              // Calcular quantidade a adicionar (não pode exceder o disponível)
              const quantidadeAAdicionar = Math.min(quantidadeRestante, Math.max(0, quantidadeDisponivel));

              if (quantidadeAAdicionar > 0) {
                // Atualizar quantidade comprada
                await pool.query(
                  `UPDATE melhor_casas_wedding_list_items 
                   SET quantidade_comprada = quantidade_comprada + $1, updated_at = NOW()
                   WHERE id = $2`,
                  [quantidadeAAdicionar, listItemId]
                );

                // Registrar compra (só se tiver order_id e user_id)
                if (localOrderId && buyerUserId) {
                  try {
                    await pool.query(
                      `INSERT INTO melhor_casas_wedding_list_purchases 
                       (list_id, list_item_id, order_id, user_id, quantidade_comprada, comprado_em)
                       VALUES ($1, $2, $3, $4, $5, NOW())`,
                      [listId, listItemId, localOrderId, buyerUserId, quantidadeAAdicionar]
                    );
                  } catch (purchaseError) {
                    console.error(`❌ [webhook/orders/create] Erro ao registrar compra:`, purchaseError.message);
                  }
                }

                quantidadeRestante -= quantidadeAAdicionar;
                algumItemAtualizado = true; // Marcar que pelo menos um item foi atualizado
                console.log(`✅ [webhook/orders/create] Item ${listItemId} atualizado: +${quantidadeAAdicionar} unidades compradas`);
              }
            }
            
            if (quantidadeRestante > 0) {
              console.log(`⚠️ [webhook/orders/create] ${quantidadeRestante} unidades não puderam ser atribuídas (quantidade desejada esgotada)`);
            }
          } else {
            console.log(`⚠️ [webhook/orders/create] Produto ${productId} não encontrado na lista ${listId}`);
          }
        }

        console.log(`🔔 [webhook/orders/create] Verificando necessidade de notificação:`, {
          algumItemAtualizado: algumItemAtualizado,
          listOwnerId: listOwnerId,
          buyerUserId: buyerUserId,
          saoDiferentes: listOwnerId !== buyerUserId
        });

        // Enviar notificação para o dono da lista (apenas se algum item foi atualizado)
        // Nota: Envia mesmo quando o comprador é o dono da lista (útil para listas pessoais de compras)
        if (algumItemAtualizado && listOwnerId && buyerUserId) {
          try {
            // Buscar nome do comprador
            let buyerName = 'Alguém';
            if (buyerUserId) {
              const buyerResult = await pool.query(
                `SELECT nome FROM melhor_casas_users WHERE id = $1`,
                [buyerUserId]
              );
              if (buyerResult.rows.length > 0 && buyerResult.rows[0].nome) {
                buyerName = buyerResult.rows[0].nome;
              }
            } else if (customerEmail) {
              // Tentar buscar pelo email se não tiver userId
              const buyerResult = await pool.query(
                `SELECT nome FROM melhor_casas_users WHERE email = $1`,
                [customerEmail]
              );
              if (buyerResult.rows.length > 0 && buyerResult.rows[0].nome) {
                buyerName = buyerResult.rows[0].nome;
              }
            }

            const notificationService = require('../services/notificationService');
            const isOwnerBuying = listOwnerId === buyerUserId;
            const notificationBody = isOwnerBuying 
              ? `Você comprou um item da sua lista "${listInfo.listName}"`
              : `${buyerName} comprou um item da sua lista "${listInfo.listName}"`;
            
            await notificationService.sendNotification({
              title: '🎁 Novo presente na sua lista!',
              body: notificationBody,
              userIds: [listOwnerId],
              data: {
                type: 'wedding_list_purchase',
                listId: listId,
                orderId: orderId.toString(),
                orderNumber: order.order_number?.toString() || order.name
              }
            });
            console.log(`✅ [webhook/orders/create] Notificação enviada para dono da lista (user ${listOwnerId}): "${notificationBody}"`);
          } catch (notificationError) {
            console.error(`❌ [webhook/orders/create] Erro ao enviar notificação:`, notificationError.message);
          }
        } else {
          console.log(`ℹ️ [webhook/orders/create] Notificação não enviada:`, {
            motivo: !algumItemAtualizado ? 'nenhum item foi atualizado' :
                    !listOwnerId ? 'listOwnerId não disponível' : 
                    !buyerUserId ? 'buyerUserId não disponível' : 
                    'condições não atendidas'
          });
        }
      }
    } else {
      console.log(`⚠️ [webhook/orders/create] ========== LISTA NÃO ENCONTRADA ==========`);
      console.log(`⚠️ [webhook/orders/create] Nenhuma informação de lista de casamento encontrada para pedido ${orderId}`);
      console.log(`⚠️ [webhook/orders/create] Dados disponíveis:`, {
        cart_token: order.cart_token || 'não informado',
        email: customerEmail ? '***' : 'não informado',
        hasNoteAttributes: !!(order.note_attributes && order.note_attributes.length > 0),
        noteAttributes: order.note_attributes || []
      });
    }

    console.log('📦 [webhook/orders/create] ========== FIM ==========');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro no webhook de criação de pedido:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para re-sincronizar um produto específico pelo código do Shopify
router.post('/products/:codigo/sync', async (req, res) => {
  try {
    const { codigo } = req.params;
    console.log(`🔄 Re-sincronizando produto ${codigo} do Shopify...`);
    
    // Buscar produto do Shopify
    const shopifyProduct = await shopifyService.getProduct(codigo);
    
    if (!shopifyProduct) {
      return res.status(404).json({
        success: false,
        error: 'Produto não encontrado no Shopify'
      });
    }
    
    console.log(`📦 Produto encontrado no Shopify: ${shopifyProduct.title}`);
    console.log(`🖼️ Imagens no Shopify: ${shopifyProduct.images?.length || 0}`);
    if (shopifyProduct.images && shopifyProduct.images.length > 0) {
      console.log(`   URLs: ${shopifyProduct.images.slice(0, 3).map(img => img.src.substring(0, 60) + '...').join(', ')}${shopifyProduct.images.length > 3 ? ` (+${shopifyProduct.images.length - 3} mais)` : ''}`);
    }
    
    // Mapear produto
    const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
    
    if (!mappedProduct) {
      return res.status(400).json({
        success: false,
        error: 'Produto sem variantes válidas'
      });
    }
    
    console.log(`🖼️ Imagens mapeadas: ${mappedProduct.imagens?.length || 0}`);
    
    // Verificar se produto existe no banco
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
            descricao = $6, imagem_url = $7, imagens = $8::jsonb, estoque = $9, 
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
        JSON.stringify(mappedProduct.imagens || []),
        mappedProduct.estoque,
        mappedProduct.disponivel,
        JSON.stringify(mappedProduct.tags),
        mappedProduct.updated_at,
        mappedProduct.codigo
      ]);
      
      console.log(`✅ Produto ${codigo} atualizado com ${mappedProduct.imagens?.length || 0} imagens`);
    } else {
      // Inserir novo produto
      await db.query(`
        INSERT INTO melhor_casas_products 
        (codigo, nome, categoria, preco_varejo, preco_atacado, 
         preco_exclusivo, descricao, imagem_url, imagens, estoque, 
         disponivel, tags, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14)
      `, [
        mappedProduct.codigo,
        mappedProduct.nome,
        mappedProduct.categoria,
        mappedProduct.preco_varejo,
        mappedProduct.preco_atacado,
        mappedProduct.preco_exclusivo,
        mappedProduct.descricao,
        mappedProduct.imagem_url,
        JSON.stringify(mappedProduct.imagens || []),
        mappedProduct.estoque,
        mappedProduct.disponivel,
        JSON.stringify(mappedProduct.tags),
        mappedProduct.created_at,
        mappedProduct.updated_at
      ]);
      
      console.log(`✅ Produto ${codigo} inserido com ${mappedProduct.imagens?.length || 0} imagens`);
    }
    
    res.json({
      success: true,
      message: 'Produto re-sincronizado com sucesso',
      data: {
        codigo: mappedProduct.codigo,
        nome: mappedProduct.nome,
        imagens_count: mappedProduct.imagens?.length || 0,
        imagens: mappedProduct.imagens
      }
    });
  } catch (error) {
    console.error('❌ Erro ao re-sincronizar produto:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao re-sincronizar produto',
      details: error.message
    });
  }
});

// Rota para testar conexão com Shopify
router.get('/test', async (req, res) => {
  try {
    const products = await shopifyService.getAllProducts();
    res.json({
      success: true,
      message: 'Conexão com Shopify estabelecida com sucesso',
      totalProducts: products.length,
      sampleProduct: products[0] ? {
        id: products[0].id,
        title: products[0].title,
        price: products[0].variants[0].price
      } : null
    });
  } catch (error) {
    console.error('❌ Erro no teste de conexão:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao conectar com Shopify',
      details: error.message
    });
  }
});

// Rota para forçar sincronização imediata
router.post('/sync/force', async (req, res) => {
  try {
    console.log('🚀 Sincronização forçada solicitada via API...');
    await autoSyncService.forceSync();
    res.json({
      success: true,
      message: 'Sincronização forçada concluída',
      status: autoSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ Erro na sincronização forçada:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao forçar sincronização',
      details: error.message
    });
  }
});

// Rota para verificar status da sincronização automática
router.get('/sync/status', async (req, res) => {
  try {
    res.json({
      success: true,
      status: autoSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ Erro ao buscar status:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar status',
      details: error.message
    });
  }
});

// Rota para forçar sincronização de NOVOS produtos apenas
router.post('/sync/new-products/force', async (req, res) => {
  try {
    console.log('🚀 Sincronização de novos produtos forçada solicitada via API...');
    await newProductsSyncService.forceSync();
    res.json({
      success: true,
      message: 'Sincronização de novos produtos concluída',
      status: newProductsSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ Erro na sincronização de novos produtos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao forçar sincronização de novos produtos',
      details: error.message
    });
  }
});

// Rota para verificar status da sincronização de novos produtos
router.get('/sync/new-products/status', async (req, res) => {
  try {
    res.json({
      success: true,
      status: newProductsSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ Erro ao buscar status de novos produtos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar status',
      details: error.message
    });
  }
});

// ==========================================
// STOREFRONT API - Verificação de Estoque
// ==========================================

// Rota para verificar estoque de um produto específico
router.get('/inventory/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    console.log(`🔍 [shopify/inventory] Verificando estoque para produto: ${codigo}`);
    
    const inventory = await shopifyService.getInventoryByVariantCode(codigo);
    
    if (!inventory) {
      return res.status(404).json({ 
        success: false,
        error: 'Produto não encontrado ou sem estoque disponível' 
      });
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
    console.error('❌ [shopify/inventory] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar estoque',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rota para verificar estoque de múltiplos produtos
router.post('/inventory/batch', async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'productIds deve ser um array não vazio'
      });
    }

    console.log(`🔍 [shopify/inventory] Verificando estoque para ${productIds.length} produtos`);
    
    const inventories = await shopifyService.getMultipleProductsInventoryStorefront(productIds);
    
    res.json({
      success: true,
      count: inventories.length,
      inventories
    });
  } catch (error) {
    console.error('❌ [shopify/inventory] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar estoque em lote',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==========================================
// ADMIN API - Bulk Operations
// ==========================================

// Rota para iniciar sincronização usando bulk operations
router.post('/sync/bulk', async (req, res) => {
  try {
    console.log('🚀 [shopify/sync/bulk] Iniciando sincronização usando Bulk Operations...');
    
    const result = await shopifyService.syncAllProductsBulk(db);
    
    res.json({
      success: true,
      message: 'Sincronização em lote iniciada',
      data: {
        bulkOperationId: result.bulkOperationId,
        url: result.url,
        total: result.total
      }
    });
  } catch (error) {
    console.error('❌ [shopify/sync/bulk] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao iniciar sincronização em lote',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rota para verificar status de bulk operation (Shopify)
router.get('/sync/bulk/operation/status', async (req, res) => {
  try {
    const status = await shopifyService.getBulkOperationStatus();
    
    if (!status) {
      return res.json({
        success: true,
        message: 'Nenhuma bulk operation em andamento',
        status: null
      });
    }

    res.json({
      success: true,
      status: {
        id: status.id,
        status: status.status,
        errorCode: status.errorCode,
        createdAt: status.createdAt,
        completedAt: status.completedAt,
        objectCount: status.objectCount,
        fileSize: status.fileSize,
        url: status.url,
        partialDataUrl: status.partialDataUrl
      }
    });
  } catch (error) {
    console.error('❌ [shopify/sync/bulk/operation/status] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status da bulk operation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==========================================
// RATINGS SYNC - Sincronização de Ratings
// ==========================================

// Rota para forçar sincronização de ratings
router.post('/sync/ratings/force', async (req, res) => {
  try {
    console.log('🚀 [shopify/sync/ratings] Forçando sincronização de ratings...');
    await ratingsSyncService.forceSync();
    res.json({
      success: true,
      message: 'Sincronização de ratings concluída',
      status: ratingsSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ [shopify/sync/ratings] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao sincronizar ratings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rota para verificar status da sincronização de ratings
router.get('/sync/ratings/status', async (req, res) => {
  try {
    res.json({
      success: true,
      status: ratingsSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ [shopify/sync/ratings/status] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status da sincronização de ratings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==========================================
// BULK SYNC - Sincronização Bulk Completa
// ==========================================

// Rota para forçar sincronização bulk completa
router.post('/sync/bulk/force', async (req, res) => {
  try {
    console.log('🚀 [shopify/sync/bulk] Forçando sincronização bulk completa...');
    await bulkSyncService.forceSync();
    res.json({
      success: true,
      message: 'Sincronização bulk concluída',
      status: bulkSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ [shopify/sync/bulk] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao sincronizar produtos via bulk operations',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rota para verificar status da sincronização bulk automática
router.get('/sync/bulk/status', async (req, res) => {
  try {
    res.json({
      success: true,
      status: bulkSyncService.getStatus()
    });
  } catch (error) {
    console.error('❌ [shopify/sync/bulk/status] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status da sincronização bulk',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rota para debug: comparar produto do Shopify com banco
router.get('/debug/product/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    console.log(`🔍 [Debug] Buscando produto ${codigo}...`);
    
    // Buscar do Shopify
    let shopifyData = null;
    let mappedFromShopify = null;
    try {
      const shopifyProduct = await shopifyService.client.get(`/products/${codigo}.json`);
      shopifyData = shopifyProduct.data.product;
      mappedFromShopify = shopifyService.mapProductToApp(shopifyData);
      console.log(`✅ [Debug] Produto encontrado no Shopify: ${shopifyData.title}`);
    } catch (shopifyError) {
      console.error(`❌ [Debug] Erro ao buscar do Shopify:`, shopifyError.message);
    }
    
    // Buscar do banco
    let dbData = null;
    try {
      const dbProduct = await db.query(
        'SELECT * FROM melhor_casas_products WHERE codigo = $1',
        [codigo]
      );
      dbData = dbProduct.rows[0];
      if (dbData) {
        console.log(`✅ [Debug] Produto encontrado no banco: ${dbData.nome}`);
      } else {
        console.log(`⚠️ [Debug] Produto não encontrado no banco`);
      }
    } catch (dbError) {
      console.error(`❌ [Debug] Erro ao buscar do banco:`, dbError.message);
    }
    
    // Calcular diferenças
    const differences = {};
    if (dbData && mappedFromShopify) {
      if (String(dbData.preco_varejo) !== String(mappedFromShopify.preco_varejo)) {
        differences.preco_varejo = {
          db: dbData.preco_varejo,
          shopify: mappedFromShopify.preco_varejo
        };
      }
      if (String(dbData.preco_atacado) !== String(mappedFromShopify.preco_atacado)) {
        differences.preco_atacado = {
          db: dbData.preco_atacado,
          shopify: mappedFromShopify.preco_atacado
        };
      }
      if (dbData.imagem_url !== mappedFromShopify.imagem_url) {
        differences.imagem_url = {
          db: dbData.imagem_url,
          shopify: mappedFromShopify.imagem_url
        };
      }
      if (dbData.nome !== mappedFromShopify.nome) {
        differences.nome = {
          db: dbData.nome,
          shopify: mappedFromShopify.nome
        };
      }
    }
    
    // Verificar diferenças nas imagens
    if (dbData && mappedFromShopify) {
      const dbImagens = dbData.imagens ? (typeof dbData.imagens === 'string' ? JSON.parse(dbData.imagens) : dbData.imagens) : [];
      const shopifyImagens = mappedFromShopify.imagens || [];
      
      if (JSON.stringify(dbImagens) !== JSON.stringify(shopifyImagens)) {
        differences.imagens = {
          db: dbImagens,
          db_count: dbImagens.length,
          shopify: shopifyImagens,
          shopify_count: shopifyImagens.length
        };
      }
    }
    
    res.json({
      success: true,
      codigo: codigo,
      shopify: shopifyData ? {
        id: shopifyData.id,
        title: shopifyData.title,
        price: shopifyData.variants[0]?.price,
        image: shopifyData.images[0]?.src,
        images_count: shopifyData.images?.length || 0,
        images: shopifyData.images?.map(img => img.src) || [],
        mapped: mappedFromShopify
      } : null,
      database: dbData ? {
        ...dbData,
        imagens_parsed: dbData.imagens ? (typeof dbData.imagens === 'string' ? JSON.parse(dbData.imagens) : dbData.imagens) : [],
        imagens_count: dbData.imagens ? (typeof dbData.imagens === 'string' ? JSON.parse(dbData.imagens).length : dbData.imagens.length) : 0
      } : null,
      differences: Object.keys(differences).length > 0 ? differences : null,
      needsSync: Object.keys(differences).length > 0
    });
  } catch (error) {
    console.error('❌ Erro no debug:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar dados',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Webhook para pedido atualizado
router.post('/webhook/orders/update', async (req, res) => {
  try {
    console.log('🔄 Webhook: Pedido atualizado');
    const order = req.body;
    const orderId = order.id;
    const cartToken = order.cart_token;
    const customerEmail = order.email || (order.customer && order.customer.email);
    
    // IMPORTANTE: Definir pool no início para estar disponível em todos os blocos
    const pool = require('../database/connection');
    
    console.log(`🔍 [webhook/orders/update] Pedido ${orderId} atualizado:`, {
      cart_token: cartToken || 'não informado',
      email: customerEmail ? '***' : 'não informado',
      name: order.name,
      tags: order.tags,
      fulfillment_status: order.fulfillment_status,
      has_fulfillments: !!(order.fulfillments && Array.isArray(order.fulfillments)),
      fulfillments_count: order.fulfillments ? order.fulfillments.length : 0
    });
    
    // Log completo dos fulfillments para debug
    if (order.fulfillments && Array.isArray(order.fulfillments)) {
      console.log(`📦 [webhook/orders/update] Fulfillments do pedido ${orderId}:`, 
        JSON.stringify(order.fulfillments.map(f => ({
          id: f.id,
          status: f.status,
          shipment_status: f.shipment_status,
          tracking_number: f.tracking_number,
          tracking_company: f.tracking_company
        })), null, 2)
      );
    }

    // Verificar se precisa atualizar com informações de lista de casamento
    // (se o pedido ainda não tiver as tags E os note_attributes) - COMO NO COMMIT 890c044
    const hasWeddingListTag = order.tags && order.tags.includes('Lista de Casamento');
    const hasWeddingListNoteAttributes = order.note_attributes && Array.isArray(order.note_attributes) &&
      order.note_attributes.some(attr => attr.name === 'Código de Compartilhamento' && attr.value && attr.value !== 'N/A');
    
    console.log(`🔍 [webhook/orders/update] Verificação de atualização:`, {
      hasTag: hasWeddingListTag,
      hasNoteAttributes: hasWeddingListNoteAttributes,
      precisaAtualizar: !hasWeddingListTag || !hasWeddingListNoteAttributes
    });
    
    if (!hasWeddingListTag || !hasWeddingListNoteAttributes) {
      console.log(`🔍 [webhook/orders/update] Pedido não tem tag "Lista de Casamento" ou note_attributes completos, buscando informações...`);
      let pendingCheckoutResult = null;

      // Tentar buscar por cart_token primeiro (COMO NO COMMIT 890c044)
      if (cartToken) {
        console.log(`🔍 [webhook/orders/update] Buscando por cart_token: ${cartToken}`);
        pendingCheckoutResult = await pool.query(
          `SELECT wedding_list_id, wedding_list_name, wedding_list_code, user_id, cart_id, cart_token
           FROM melhor_casas_pending_checkouts 
           WHERE cart_token = $1 OR cart_id LIKE $2`,
          [cartToken, `%/${cartToken}%`]
        );
        
        console.log(`🔍 [webhook/orders/update] Resultado da busca por cart_token:`, {
          encontrados: pendingCheckoutResult.rows.length
        });
        
        if (pendingCheckoutResult.rows.length === 0) {
          // Tentar buscar pelo cart_id completo também
          pendingCheckoutResult = await pool.query(
            `SELECT wedding_list_id, wedding_list_name, wedding_list_code, user_id, cart_id, cart_token
             FROM melhor_casas_pending_checkouts 
             WHERE cart_id = $1`,
            [cartToken]
          );
        }
      }

      // Se não encontrou por cart_token, tentar por email do usuário
      if ((!pendingCheckoutResult || pendingCheckoutResult.rows.length === 0) && customerEmail) {
        console.log(`🔍 [webhook/orders/update] Tentando buscar por email: ${customerEmail}`);
        const userResult = await pool.query(
          `SELECT id FROM melhor_casas_users WHERE email = $1`,
          [customerEmail]
        );
        
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id;
          pendingCheckoutResult = await pool.query(
            `SELECT wedding_list_id, wedding_list_name, wedding_list_code, user_id
             FROM melhor_casas_pending_checkouts 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userId]
          );
        }
      }

      if (pendingCheckoutResult && pendingCheckoutResult.rows.length > 0) {
        const checkoutInfo = pendingCheckoutResult.rows[0];
        console.log(`🎁 [webhook/orders/update] Encontradas informações de lista de casamento para pedido ${orderId}:`, {
          listId: checkoutInfo.wedding_list_id,
          listName: checkoutInfo.wedding_list_name
        });
        
        const weddingListInfo = {
          listId: checkoutInfo.wedding_list_id,
          listName: checkoutInfo.wedding_list_name,
          shareCode: checkoutInfo.wedding_list_code
        };

        // Atualizar pedido no Shopify com tags e note_attributes (COMO NO COMMIT 890c044)
        try {
          const shopifyService = require('../services/shopifyService');
          await shopifyService.updateOrderWithWeddingListInfo(orderId, weddingListInfo);
          console.log(`✅ [webhook/orders/update] Pedido ${orderId} atualizado com informações de lista de casamento`);
        } catch (updateError) {
          console.error(`❌ [webhook/orders/update] Erro ao atualizar pedido ${orderId}:`, updateError.message);
          // Não falhar o webhook se a atualização falhar
        }
    } else {
      console.log(`⚠️ [webhook/orders/update] Nenhuma informação de lista de casamento encontrada para pedido ${orderId}`);
      console.log(`🔍 [webhook/orders/update] Verificando note_attributes do pedido:`, {
        hasNoteAttributes: !!(order.note_attributes && Array.isArray(order.note_attributes)),
        noteAttributesCount: order.note_attributes ? order.note_attributes.length : 0,
        noteAttributes: order.note_attributes ? order.note_attributes.map(attr => ({ name: attr.name, value: attr.value })) : []
      });
    }
    } else {
      console.log(`✅ [webhook/orders/update] Pedido ${orderId} já tem tag "Lista de Casamento" e note_attributes, não precisa atualizar`);
    }

    // Buscar informações da lista para processar itens (se necessário)
    let listInfo = null;

    // Buscar pelos note_attributes (se o pedido já foi atualizado)
    if (order.note_attributes && Array.isArray(order.note_attributes) && order.note_attributes.length > 0) {
      const shareCodeAttr = order.note_attributes.find(attr => attr.name === 'Código de Compartilhamento');
      const listIdAttr = order.note_attributes.find(attr => attr.name === 'ID da Lista');
      
      if (shareCodeAttr && shareCodeAttr.value) {
        const listResult = await pool.query(
          `SELECT id, nome, codigo_compartilhamento, user_id 
           FROM melhor_casas_wedding_lists 
           WHERE codigo_compartilhamento = $1`,
          [shareCodeAttr.value]
        );

        if (listResult.rows.length > 0) {
          const list = listResult.rows[0];
          listInfo = {
            listId: list.id,
            listName: list.nome,
            shareCode: list.codigo_compartilhamento,
            listOwnerId: list.user_id
          };
        }
      } else if (listIdAttr && listIdAttr.value) {
        const listResult = await pool.query(
          `SELECT id, nome, codigo_compartilhamento, user_id 
           FROM melhor_casas_wedding_lists 
           WHERE id = $1`,
          [parseInt(listIdAttr.value)]
        );

        if (listResult.rows.length > 0) {
          const list = listResult.rows[0];
          listInfo = {
            listId: list.id,
            listName: list.nome,
            shareCode: list.codigo_compartilhamento,
            listOwnerId: list.user_id
          };
        }
      }
    }

    // Se encontrou a lista, processar atualização do progresso e notificação
    if (listInfo) {
      console.log(`🎁 [webhook/orders/update] ========== PROCESSANDO LISTA ==========`);
      console.log(`🎁 [webhook/orders/update] listInfo encontrado:`, {
        listId: listInfo.listId,
        listName: listInfo.listName,
        shareCode: listInfo.shareCode,
        listOwnerId: listInfo.listOwnerId
      });
      const listId = listInfo.listId;
      const listOwnerId = listInfo.listOwnerId;
      
      console.log(`🎁 [webhook/orders/update] Processando lista de casamento para pedido ${orderId}:`, {
        listId: listId,
        listName: listInfo.listName,
        listOwnerId: listOwnerId
      });

      // NÃO atualizar novamente aqui - já foi atualizado acima se necessário

      // Processar itens do pedido para atualizar progresso da lista
      if (order.line_items && Array.isArray(order.line_items) && order.line_items.length > 0) {
        console.log(`🔍 [webhook/orders/update] Processando ${order.line_items.length} itens do pedido...`);
        
        // Buscar ID do comprador pelo email
        let buyerUserId = null;
        if (customerEmail) {
          const buyerResult = await pool.query(
            `SELECT id FROM melhor_casas_users WHERE email = $1`,
            [customerEmail]
          );
          if (buyerResult.rows.length > 0) {
            buyerUserId = buyerResult.rows[0].id;
          }
        }

        // Criar pedido local se não existir
        let localOrderId = null;
        try {
          const existingOrderResult = await pool.query(
            `SELECT id FROM melhor_casas_orders WHERE shopify_order_id = $1`,
            [orderId.toString()]
          );
          
          if (existingOrderResult.rows.length > 0) {
            localOrderId = existingOrderResult.rows[0].id;
          } else {
            const newOrderResult = await pool.query(
              `INSERT INTO melhor_casas_orders 
               (user_id, total, status, shopify_order_id, shopify_order_number, shopify_order_name, currency, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
               RETURNING id`,
              [
                buyerUserId,
                parseFloat(order.total_price || 0),
                'processando',
                orderId.toString(),
                order.order_number ? order.order_number.toString() : null,
                order.name || null,
                order.currency || 'BRL'
              ]
            );
            localOrderId = newOrderResult.rows[0].id;
          }
        } catch (orderError) {
          console.error(`❌ [webhook/orders/update] Erro ao criar/buscar pedido local:`, orderError.message);
        }

        // Flag para indicar se algum item foi atualizado
        let algumItemAtualizado = false;

        // Processar cada item do pedido
        for (const lineItem of order.line_items) {
          const sku = lineItem.sku;
          const productIdShopify = lineItem.product_id;
          const variantIdShopify = lineItem.variant_id;
          const quantity = parseInt(lineItem.quantity || 1);
          
          console.log(`🔍 [webhook/orders/update] Processando item:`, {
            sku: sku || 'não informado',
            product_id: productIdShopify || 'não informado',
            variant_id: variantIdShopify || 'não informado',
            title: lineItem.title || 'não informado',
            quantity: quantity
          });

          let productId = null;

          // Tentar buscar produto pelo SKU primeiro
          if (sku) {
            const productResult = await pool.query(
              `SELECT id FROM melhor_casas_products WHERE codigo = $1`,
              [sku]
            );
            if (productResult.rows.length > 0) {
              productId = productResult.rows[0].id;
              console.log(`✅ [webhook/orders/update] Produto encontrado pelo SKU: ${sku} -> produto ID ${productId}`);
            }
          }

          // Se não encontrou pelo SKU, tentar pelo product_id do Shopify
          if (!productId && productIdShopify) {
            const productResult = await pool.query(
              `SELECT id FROM melhor_casas_products WHERE codigo = $1`,
              [productIdShopify.toString()]
            );
            if (productResult.rows.length > 0) {
              productId = productResult.rows[0].id;
              console.log(`✅ [webhook/orders/update] Produto encontrado pelo product_id: ${productIdShopify} -> produto ID ${productId}`);
            }
          }

          // Se ainda não encontrou, tentar pelo variant_id do Shopify
          if (!productId && variantIdShopify) {
            const productResult = await pool.query(
              `SELECT id FROM melhor_casas_products WHERE codigo = $1`,
              [variantIdShopify.toString()]
            );
            if (productResult.rows.length > 0) {
              productId = productResult.rows[0].id;
              console.log(`✅ [webhook/orders/update] Produto encontrado pelo variant_id: ${variantIdShopify} -> produto ID ${productId}`);
            }
          }

          if (!productId) {
            console.warn(`⚠️ [webhook/orders/update] Produto não encontrado no banco. SKU: ${sku || 'não informado'}, product_id: ${productIdShopify || 'não informado'}, variant_id: ${variantIdShopify || 'não informado'}`);
            continue;
          }

          // Verificar se este produto já foi processado para este pedido nesta lista (evitar duplicação)
          // Só verificar se tiver localOrderId (pedido local criado)
          let totalJaProcessado = 0;
          let quantidadeDisponivelParaProcessar = quantity;
          
          if (localOrderId) {
            const existingPurchaseCheck = await pool.query(
              `SELECT SUM(quantidade_comprada) as total_ja_processado
               FROM melhor_casas_wedding_list_purchases 
               WHERE order_id = $1 AND list_id = $2 AND list_item_id IN (
                 SELECT id FROM melhor_casas_wedding_list_items WHERE list_id = $2 AND product_id = $3
               )`,
              [localOrderId, listId, productId]
            );
            
            totalJaProcessado = parseInt(existingPurchaseCheck.rows[0]?.total_ja_processado || 0);
            quantidadeDisponivelParaProcessar = Math.max(0, quantity - totalJaProcessado);
            
            console.log(`🔍 [webhook/orders/update] Verificando duplicação para produto ${productId}:`, {
              localOrderId: localOrderId,
              quantidadePedido: quantity,
              totalJaProcessado: totalJaProcessado,
              quantidadeDisponivelParaProcessar: quantidadeDisponivelParaProcessar
            });
            
            if (quantidadeDisponivelParaProcessar <= 0) {
              console.log(`⚠️ [webhook/orders/update] Produto ${productId} já foi totalmente processado para este pedido (${totalJaProcessado}/${quantity}), pulando...`);
              continue;
            }
          } else {
            console.log(`⚠️ [webhook/orders/update] localOrderId não disponível para produto ${productId}, processando sem verificação de duplicação`);
          }

          // Buscar TODOS os itens da lista para este produto
          const listItemsResult = await pool.query(
            `SELECT id, quantidade_desejada, quantidade_comprada 
             FROM melhor_casas_wedding_list_items 
             WHERE list_id = $1 AND product_id = $2
             ORDER BY id ASC`,
            [listId, productId]
          );

          if (listItemsResult.rows.length > 0) {
            let quantidadeRestante = quantidadeDisponivelParaProcessar; // Usar apenas a quantidade disponível
            
            // Distribuir a quantidade comprada entre os itens da lista
            for (const listItem of listItemsResult.rows) {
              if (quantidadeRestante <= 0) break;
              
              const listItemId = listItem.id;
              const quantidadeDesejada = parseInt(listItem.quantidade_desejada || 0);
              const quantidadeJaComprada = parseInt(listItem.quantidade_comprada || 0);
              const quantidadeDisponivel = quantidadeDesejada - quantidadeJaComprada;
              
              const quantidadeAAdicionar = Math.min(quantidadeRestante, Math.max(0, quantidadeDisponivel));

              if (quantidadeAAdicionar > 0) {
                // Atualizar quantidade comprada
                await pool.query(
                  `UPDATE melhor_casas_wedding_list_items 
                   SET quantidade_comprada = quantidade_comprada + $1, updated_at = NOW()
                   WHERE id = $2`,
                  [quantidadeAAdicionar, listItemId]
                );

                // Registrar compra (só se tiver buyerUserId - order_id pode ser null se pedido local não foi criado)
                if (buyerUserId) {
                  try {
                    await pool.query(
                      `INSERT INTO melhor_casas_wedding_list_purchases 
                       (list_id, list_item_id, order_id, user_id, quantidade_comprada, comprado_em)
                       VALUES ($1, $2, $3, $4, $5, NOW())`,
                      [listId, listItemId, localOrderId, buyerUserId, quantidadeAAdicionar]
                    );
                    console.log(`✅ [webhook/orders/update] Compra registrada: lista ${listId}, item ${listItemId}, quantidade ${quantidadeAAdicionar}`);
                  } catch (purchaseError) {
                    console.error(`❌ [webhook/orders/update] Erro ao registrar compra:`, purchaseError.message);
                  }
                } else {
                  console.warn(`⚠️ [webhook/orders/update] buyerUserId não disponível, não registrando compra no histórico`);
                }

                quantidadeRestante -= quantidadeAAdicionar;
                algumItemAtualizado = true; // Marcar que pelo menos um item foi atualizado
                console.log(`✅ [webhook/orders/update] Item ${listItemId} atualizado: +${quantidadeAAdicionar} unidades compradas`);
              }
            }
            
            if (quantidadeRestante > 0) {
              console.log(`⚠️ [webhook/orders/update] ${quantidadeRestante} unidades não puderam ser atribuídas`);
            }
          }
        }

        // Enviar notificação para o dono da lista (apenas se algum item foi atualizado)
        console.log(`🔔 [webhook/orders/update] Verificando necessidade de notificação:`, {
          algumItemAtualizado: algumItemAtualizado,
          listOwnerId: listOwnerId,
          buyerUserId: buyerUserId,
          saoDiferentes: listOwnerId !== buyerUserId
        });

        if (algumItemAtualizado && listOwnerId && buyerUserId) {
          try {
            // Buscar nome do comprador
            let buyerName = 'Alguém';
            if (buyerUserId) {
              const buyerResult = await pool.query(
                `SELECT nome FROM melhor_casas_users WHERE id = $1`,
                [buyerUserId]
              );
              if (buyerResult.rows.length > 0 && buyerResult.rows[0].nome) {
                buyerName = buyerResult.rows[0].nome;
              }
            } else if (customerEmail) {
              // Tentar buscar pelo email se não tiver userId
              const buyerResult = await pool.query(
                `SELECT nome FROM melhor_casas_users WHERE email = $1`,
                [customerEmail]
              );
              if (buyerResult.rows.length > 0 && buyerResult.rows[0].nome) {
                buyerName = buyerResult.rows[0].nome;
              }
            }

            const notificationService = require('../services/notificationService');
            const isOwnerBuying = listOwnerId === buyerUserId;
            const notificationBody = isOwnerBuying 
              ? `Você comprou um item da sua lista "${listInfo.listName}"`
              : `${buyerName} comprou um item da sua lista "${listInfo.listName}"`;
            
            await notificationService.sendNotification({
              title: '🎁 Novo presente na sua lista!',
              body: notificationBody,
              userIds: [listOwnerId],
              data: {
                type: 'wedding_list_purchase',
                listId: listId,
                orderId: orderId.toString(),
                orderNumber: order.order_number?.toString() || order.name
              }
            });
            console.log(`✅ [webhook/orders/update] Notificação enviada para dono da lista (user ${listOwnerId}): "${notificationBody}"`);
          } catch (notificationError) {
            console.error(`❌ [webhook/orders/update] Erro ao enviar notificação:`, notificationError.message);
          }
        } else {
          console.log(`ℹ️ [webhook/orders/update] Notificação não enviada:`, {
            motivo: !algumItemAtualizado ? 'nenhum item foi atualizado' :
                    !listOwnerId ? 'listOwnerId não disponível' : 
                    !buyerUserId ? 'buyerUserId não disponível' : 
                    'condições não atendidas'
          });
        }
      }
    }
    
    // IMPORTANTE: Não verificar fulfillments aqui no orders/update
    // Os webhooks específicos de "pronto para retirada" serão tratados separadamente
    // Isso evita conflito entre "pronto para retirada" e "pedido finalizado"
    console.log(`ℹ️ [webhook/orders/update] Verificação de fulfillments removida - usar webhooks específicos de fulfillment_orders`);
    
    // Processar notificação do pedido (se o serviço existir)
    try {
      await orderNotificationService.processWebhookOrder(req.body);
    } catch (notificationError) {
      console.warn('⚠️ [webhook/orders/update] Erro ao processar notificação (não crítico):', notificationError.message);
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Erro no webhook de atualização de pedido:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook para fulfillment criado
router.post('/webhook/fulfillments/create', async (req, res) => {
  // Log imediato para garantir que a rota foi chamada
  console.log('🔔 [webhook/fulfillments/create] ========== WEBHOOK RECEBIDO ==========');
  console.log('🔔 [webhook/fulfillments/create] Timestamp:', new Date().toISOString());
  console.log('🔔 [webhook/fulfillments/create] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('🔔 [webhook/fulfillments/create] Body completo:', JSON.stringify(req.body, null, 2));
  
  try {
    const fulfillment = req.body;
    
    if (!fulfillment) {
      console.error('❌ [webhook/fulfillments/create] Body vazio ou inválido');
      return res.status(400).json({ success: false, error: 'Body vazio' });
    }
    
    console.log('📦 [webhook/fulfillments/create] Dados extraídos:', {
      id: fulfillment.id,
      order_id: fulfillment.order_id,
      status: fulfillment.status,
      shipment_status: fulfillment.shipment_status,
      tracking_number: fulfillment.tracking_number,
      tracking_company: fulfillment.tracking_company
    });
    
    // Processar notificações de pronto para retirada e rastreio
    await orderNotificationService.processFulfillmentWebhook(fulfillment);
    
    console.log('✅ [webhook/fulfillments/create] Processamento concluído');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ [webhook/fulfillments/create] Erro:', error);
    console.error('❌ [webhook/fulfillments/create] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook para fulfillment atualizado
router.post('/webhook/fulfillments/update', async (req, res) => {
  // Log imediato para garantir que a rota foi chamada
  console.log('🔔 [webhook/fulfillments/update] ========== WEBHOOK RECEBIDO ==========');
  console.log('🔔 [webhook/fulfillments/update] Timestamp:', new Date().toISOString());
  console.log('🔔 [webhook/fulfillments/update] Headers:', JSON.stringify(req.headers, null, 2));
  console.log('🔔 [webhook/fulfillments/update] Body completo:', JSON.stringify(req.body, null, 2));
  
  try {
    const fulfillment = req.body;
    
    if (!fulfillment) {
      console.error('❌ [webhook/fulfillments/update] Body vazio ou inválido');
      return res.status(400).json({ success: false, error: 'Body vazio' });
    }
    
    console.log('🔄 [webhook/fulfillments/update] Dados extraídos:', {
      id: fulfillment.id,
      order_id: fulfillment.order_id,
      status: fulfillment.status,
      shipment_status: fulfillment.shipment_status,
      tracking_number: fulfillment.tracking_number,
      tracking_company: fulfillment.tracking_company
    });
    
    // Processar notificações de pronto para retirada e rastreio
    await orderNotificationService.processFulfillmentWebhook(fulfillment);
    
    console.log('✅ [webhook/fulfillments/update] Processamento concluído');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ [webhook/fulfillments/update] Erro:', error);
    console.error('❌ [webhook/fulfillments/update] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de teste para verificar se webhooks estão funcionando
// Rotas GET para webhooks de fulfillment (Shopify testa URLs com GET)
router.get('/webhook/fulfillments/create', async (req, res) => {
  console.log('🧪 [webhook/fulfillments/create] GET request recebido (teste do Shopify)');
  res.status(200).json({ 
    success: true, 
    message: 'Endpoint de webhook está acessível',
    method: 'POST esperado para webhooks reais'
  });
});

router.get('/webhook/fulfillments/update', async (req, res) => {
  console.log('🧪 [webhook/fulfillments/update] GET request recebido (teste do Shopify)');
  res.status(200).json({ 
    success: true, 
    message: 'Endpoint de webhook está acessível',
    method: 'POST esperado para webhooks reais'
  });
});

router.post('/webhook/test', async (req, res) => {
  try {
    console.log('🧪 [webhook/test] Teste de webhook recebido');
    console.log('🧪 [webhook/test] Headers:', req.headers);
    console.log('🧪 [webhook/test] Body:', JSON.stringify(req.body, null, 2));
    res.status(200).json({ success: true, message: 'Webhook recebido com sucesso' });
  } catch (error) {
    console.error('❌ [webhook/test] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook para itens preparados para retirada (fulfillment_orders/line_items_prepared_for_pickup)
router.post('/webhook/fulfillment_orders/line_items_prepared_for_pickup', async (req, res) => {
  // Log imediato para garantir que a rota foi chamada
  console.log('🔔 [webhook/fulfillment_orders/line_items_prepared_for_pickup] ========== WEBHOOK RECEBIDO ==========');
  console.log('🔔 [webhook/fulfillment_orders/line_items_prepared_for_pickup] Timestamp:', new Date().toISOString());
  console.log('🔔 [webhook/fulfillment_orders/line_items_prepared_for_pickup] Body completo:', JSON.stringify(req.body, null, 2));
  
  try {
    const webhookData = req.body;
    const fulfillmentOrder = webhookData.fulfillment_order || webhookData;
    
    if (!fulfillmentOrder) {
      console.error('❌ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Body vazio ou inválido');
      return res.status(400).json({ success: false, error: 'Body vazio' });
    }
    
    // Extrair fulfillment_order_id (pode vir como GraphQL ID: gid://shopify/FulfillmentOrder/8088166105393)
    let fulfillmentOrderId = null;
    if (fulfillmentOrder.id) {
      // Se for GraphQL ID, extrair o número
      const idMatch = fulfillmentOrder.id.toString().match(/\/(\d+)$/);
      if (idMatch) {
        fulfillmentOrderId = idMatch[1];
      } else {
        fulfillmentOrderId = fulfillmentOrder.id.toString();
      }
    }
    
    console.log(`🔍 [webhook/fulfillment_orders/line_items_prepared_for_pickup] Fulfillment Order ID: ${fulfillmentOrderId}`);
    
    // Buscar o pedido no Shopify usando GraphQL Admin API para obter o order_id do fulfillment_order
    let orderId = null;
    try {
      const shopifyService = require('../services/shopifyService');
      const axios = require('axios');
      
      // Usar GraphQL Admin API para buscar o order_id do fulfillment_order
      const graphqlQuery = `
        query getFulfillmentOrder($id: ID!) {
          fulfillmentOrder(id: $id) {
            id
            order {
              id
              legacyResourceId
            }
          }
        }
      `;
      
      const graphqlResponse = await axios.post(
        `https://${shopifyService.domain}/admin/api/2024-01/graphql.json`,
        {
          query: graphqlQuery,
          variables: {
            id: fulfillmentOrder.id // Usar o ID GraphQL completo: gid://shopify/FulfillmentOrder/8088166105393
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': shopifyService.adminToken,
            'Content-Type': 'application/json',
          }
        }
      );
      
      if (graphqlResponse.data?.data?.fulfillmentOrder?.order) {
        const order = graphqlResponse.data.data.fulfillmentOrder.order;
        // legacyResourceId é o ID numérico do pedido
        orderId = order.legacyResourceId?.toString() || order.id?.toString().match(/\/(\d+)$/)?.[1];
        console.log(`✅ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Pedido encontrado via GraphQL: ${orderId}`);
      } else if (graphqlResponse.data?.errors) {
        console.error(`❌ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Erros GraphQL:`, graphqlResponse.data.errors);
      }
    } catch (graphqlError) {
      console.error(`❌ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Erro ao buscar via GraphQL:`, graphqlError.message);
      
      // Fallback: buscar pedidos recentes e verificar fulfillments
      try {
        const shopifyService = require('../services/shopifyService');
        const recentOrders = await shopifyService.client.get(`/orders.json`, {
          params: {
            limit: 50,
            status: 'any',
            fulfillment_status: 'any'
          }
        });
        
        // Procurar pedidos com fulfillments recentes
        for (const order of recentOrders.data.orders || []) {
          if (order.fulfillments && order.fulfillments.length > 0) {
            // Verificar se algum fulfillment corresponde ao fulfillment_order_id
            for (const fulfillment of order.fulfillments) {
              // O fulfillment pode ter referência ao fulfillment_order
              if (fulfillment.fulfillment_order_id?.toString() === fulfillmentOrderId ||
                  fulfillment.id?.toString().includes(fulfillmentOrderId)) {
                orderId = order.id.toString();
                console.log(`✅ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Pedido encontrado via fallback: ${orderId}`);
                break;
              }
            }
          }
          if (orderId) break;
        }
      } catch (fallbackError) {
        console.error(`❌ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Erro no fallback:`, fallbackError.message);
      }
    }
    
    if (!orderId) {
      console.log('⚠️ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Não foi possível encontrar order_id');
      // Retornar sucesso mesmo assim para não bloquear o webhook
      return res.status(200).json({ 
        success: true, 
        warning: 'order_id não encontrado, mas webhook processado' 
      });
    }
    
    console.log(`✅ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Pedido ${orderId} está pronto para retirada!`);
    
    // Buscar dados completos do pedido no Shopify para garantir que temos order_number
    let shopifyOrderData = null;
    try {
      const shopifyResponse = await shopifyService.client.get(`/orders/${orderId}.json`);
      shopifyOrderData = shopifyResponse.data?.order;
      console.log(`📦 [webhook/fulfillment_orders/line_items_prepared_for_pickup] Dados do pedido no Shopify:`, {
        orderId: orderId,
        orderNumber: shopifyOrderData?.order_number,
        name: shopifyOrderData?.name,
        email: shopifyOrderData?.email
      });
    } catch (shopifyError) {
      console.error(`❌ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Erro ao buscar pedido no Shopify:`, shopifyError.message);
    }
    
    // Processar como se fosse um fulfillment com shipment_status = ready_for_pickup
    const mockFulfillment = {
      id: fulfillmentOrderId,
      order_id: orderId,
      status: 'success',
      shipment_status: 'ready_for_pickup',
      tracking_number: null,
      tracking_company: null,
      // Adicionar dados do pedido para facilitar a criação no banco
      shopifyOrder: shopifyOrderData
    };
    
    await orderNotificationService.processFulfillmentWebhook(mockFulfillment);
    
    console.log('✅ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Processamento concluído');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Erro:', error);
    console.error('❌ [webhook/fulfillment_orders/line_items_prepared_for_pickup] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook para itens preparados para entrega local (fulfillment_orders/line_items_prepared_for_local_delivery)
router.post('/webhook/fulfillment_orders/line_items_prepared_for_local_delivery', async (req, res) => {
  // Log imediato para garantir que a rota foi chamada
  console.log('🔔 [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] ========== WEBHOOK RECEBIDO ==========');
  console.log('🔔 [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Timestamp:', new Date().toISOString());
  console.log('🔔 [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Body completo:', JSON.stringify(req.body, null, 2));
  
  try {
    const webhookData = req.body;
    const fulfillmentOrder = webhookData.fulfillment_order || webhookData;
    
    if (!fulfillmentOrder) {
      console.error('❌ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Body vazio ou inválido');
      return res.status(400).json({ success: false, error: 'Body vazio' });
    }
    
    // Extrair fulfillment_order_id (pode vir como GraphQL ID: gid://shopify/FulfillmentOrder/8088166105393)
    let fulfillmentOrderId = null;
    if (fulfillmentOrder.id) {
      // Se for GraphQL ID, extrair o número
      const idMatch = fulfillmentOrder.id.toString().match(/\/(\d+)$/);
      if (idMatch) {
        fulfillmentOrderId = idMatch[1];
      } else {
        fulfillmentOrderId = fulfillmentOrder.id.toString();
      }
    }
    
    console.log(`🔍 [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Fulfillment Order ID: ${fulfillmentOrderId}`);
    
    // Buscar o pedido no Shopify usando GraphQL Admin API para obter o order_id do fulfillment_order
    let orderId = null;
    try {
      const shopifyService = require('../services/shopifyService');
      const axios = require('axios');
      
      // Usar GraphQL Admin API para buscar o order_id do fulfillment_order
      const graphqlQuery = `
        query getFulfillmentOrder($id: ID!) {
          fulfillmentOrder(id: $id) {
            id
            order {
              id
              legacyResourceId
            }
          }
        }
      `;
      
      const graphqlResponse = await axios.post(
        `https://${shopifyService.domain}/admin/api/2024-01/graphql.json`,
        {
          query: graphqlQuery,
          variables: {
            id: fulfillmentOrder.id // Usar o ID GraphQL completo
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': shopifyService.adminToken,
            'Content-Type': 'application/json',
          }
        }
      );
      
      if (graphqlResponse.data?.data?.fulfillmentOrder?.order) {
        const order = graphqlResponse.data.data.fulfillmentOrder.order;
        orderId = order.legacyResourceId?.toString() || order.id?.toString().match(/\/(\d+)$/)?.[1];
        console.log(`✅ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Pedido encontrado via GraphQL: ${orderId}`);
      }
    } catch (graphqlError) {
      console.error(`❌ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Erro ao buscar via GraphQL:`, graphqlError.message);
    }
    
    if (!orderId) {
      console.log('⚠️ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Não foi possível encontrar order_id');
      return res.status(200).json({ 
        success: true, 
        warning: 'order_id não encontrado, mas webhook processado' 
      });
    }
    
    console.log(`✅ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Pedido ${orderId} está pronto para entrega local!`);
    
    // Buscar dados completos do pedido no Shopify
    let shopifyOrderData = null;
    try {
      const shopifyResponse = await shopifyService.client.get(`/orders/${orderId}.json`);
      shopifyOrderData = shopifyResponse.data?.order;
      console.log(`📦 [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Dados do pedido no Shopify:`, {
        orderId: orderId,
        orderNumber: shopifyOrderData?.order_number,
        name: shopifyOrderData?.name,
        email: shopifyOrderData?.email
      });
    } catch (shopifyError) {
      console.error(`❌ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Erro ao buscar pedido no Shopify:`, shopifyError.message);
    }
    
    // Processar como entrega local (status diferente de retirada)
    const mockFulfillment = {
      id: fulfillmentOrderId,
      order_id: orderId,
      status: 'success',
      shipment_status: 'local_delivery', // Status específico para entrega local
      tracking_number: null,
      tracking_company: null,
      shopifyOrder: shopifyOrderData
    };
    
    await orderNotificationService.processFulfillmentWebhook(mockFulfillment);
    
    console.log('✅ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Processamento concluído');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Erro:', error);
    console.error('❌ [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rotas GET para os novos webhooks (Shopify testa URLs com GET)
router.get('/webhook/fulfillment_orders/line_items_prepared_for_pickup', async (req, res) => {
  console.log('🧪 [webhook/fulfillment_orders/line_items_prepared_for_pickup] GET request recebido (teste do Shopify)');
  res.status(200).json({ 
    success: true, 
    message: 'Endpoint de webhook está acessível',
    method: 'POST esperado para webhooks reais'
  });
});

router.get('/webhook/fulfillment_orders/line_items_prepared_for_local_delivery', async (req, res) => {
  console.log('🧪 [webhook/fulfillment_orders/line_items_prepared_for_local_delivery] GET request recebido (teste do Shopify)');
  res.status(200).json({ 
    success: true, 
    message: 'Endpoint de webhook está acessível',
    method: 'POST esperado para webhooks reais'
  });
});

// Endpoint para verificar manualmente pedidos prontos para retirada
// Útil quando o Shopify não envia webhooks automaticamente
router.post('/check-ready-for-pickup', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'orderId é obrigatório' 
      });
    }
    
    console.log(`🔍 [check-ready-for-pickup] Verificando pedido ${orderId}...`);
    
    const shopifyService = require('../services/shopifyService');
    const orderNotificationService = require('../services/orderNotificationService');
    
    // Buscar pedido no Shopify
    const response = await shopifyService.client.get(`/orders/${orderId}.json`);
    const shopifyOrder = response.data?.order;
    
    if (!shopifyOrder) {
      return res.status(404).json({ 
        success: false, 
        error: 'Pedido não encontrado no Shopify' 
      });
    }
    
    // Verificar fulfillments
    if (shopifyOrder.fulfillments && Array.isArray(shopifyOrder.fulfillments)) {
      let foundReadyForPickup = false;
      
      for (const fulfillment of shopifyOrder.fulfillments) {
        const shipmentStatus = fulfillment.shipment_status;
        console.log(`🔍 [check-ready-for-pickup] Fulfillment ${fulfillment.id}: shipment_status = ${shipmentStatus}`);
        
        if (shipmentStatus === 'ready_for_pickup' || shipmentStatus === 'ready-for-pickup') {
          console.log(`✅ [check-ready-for-pickup] Pedido ${orderId} está pronto para retirada!`);
          foundReadyForPickup = true;
          
          // Processar o fulfillment
          await orderNotificationService.processFulfillmentWebhook(fulfillment);
        }
      }
      
      if (!foundReadyForPickup) {
        return res.json({ 
          success: true, 
          message: 'Pedido não está pronto para retirada',
          fulfillments: shopifyOrder.fulfillments.map(f => ({
            id: f.id,
            status: f.status,
            shipment_status: f.shipment_status
          }))
        });
      }
      
      return res.json({ 
        success: true, 
        message: 'Pedido pronto para retirada detectado e notificação enviada'
      });
    }
    
    return res.json({ 
      success: true, 
      message: 'Pedido não tem fulfillments'
    });
    
  } catch (error) {
    console.error('❌ [check-ready-for-pickup] Erro:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;




