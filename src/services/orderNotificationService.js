const pool = require('../database/connection');
const shopifyService = require('./shopifyService');
const notificationService = require('./notificationService');

// Templates de mensagens para cada tipo de notificação
const MESSAGE_TEMPLATES = {
  // Retirada + Processando
  pickup_processing: [
    '📦 Pedido confirmado! 🎉 Acompanhe seu e-mail — avisaremos quando estiver disponível para retirada.',
    '🎊 Tudo certo com o seu pedido! Agora é só aguardar o e-mail com mais informações.',
    '✔️ Compra concluída com sucesso! Em breve você receberá nosso e-mail com os próximos passos.'
  ],
  
  // Retirada + Pronto para Retirada
  pickup_ready: [
    '✅ Seu pedido está pronto para retirada! 🎉 Você já pode buscar na loja.',
    '📦 Ótimas notícias! Seu pedido está disponível para retirada na loja.',
    '🎊 Seu pedido está pronto! Venha retirar na loja quando quiser.'
  ],
  
  // Retirada/Envio + Concluído
  completed: [
    '⭐ Pedido finalizado! Que tal nos avaliar e contar como foi sua experiência?',
    '😍 Ficou feliz com seu pedido? Deixe sua avaliação e nos ajude a melhorar!',
    '⭐ Sua opinião vale muito! Avalie seu pedido e nos diga o que achou.'
  ],
  
  // Envio + Processando
  shipping_processing: [
    '📦 Pedido confirmado! Estamos preparando seu pedido. Enviaremos o código de rastreio assim que for despachado.',
    '✅ Compra realizada! Seu pedido está sendo preparado. Em breve você receberá o código de rastreio.',
    '🎉 Tudo certo! Estamos preparando sua encomenda. O código de rastreio será enviado assim que sair para entrega.'
  ],
  
  // Envio + Código de Rastreio
  shipping_tracking: [
    '📦 Seu pedido foi enviado! Código de rastreio: {tracking_number}',
    '🚚 Encomenda em trânsito! Rastreie pelo código: {tracking_number}',
    '📬 Pedido despachado! Acompanhe: {tracking_number}'
  ],
  
  // Entrega Local - Saiu para entrega
  local_delivery: [
    '🚴 Seu pedido saiu para entrega! Em breve estará com você.',
    '📦 Ótimas notícias! Seu pedido está a caminho.',
    '🛵 Pedido em rota de entrega! Aguarde, já estamos chegando.'
  ]
};

// Função para selecionar mensagem aleatória
const getRandomMessage = (type) => {
  const messages = MESSAGE_TEMPLATES[type];
  if (!messages || messages.length === 0) return null;
  return messages[Math.floor(Math.random() * messages.length)];
};

// Criar tabela para rastrear notificações enviadas
const ensureNotificationTrackingTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_notification_logs (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL,
        order_number VARCHAR(100),
        user_id INTEGER NOT NULL REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        notification_type VARCHAR(50) NOT NULL,
        fulfillment_status VARCHAR(50),
        financial_status VARCHAR(50),
        delivery_type VARCHAR(20),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        message TEXT,
        UNIQUE(order_id, notification_type)
      )
    `);
    
    // Criar índices para melhor performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_order_notification_user_id ON order_notification_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_order_notification_order_id ON order_notification_logs(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_notification_sent_at ON order_notification_logs(sent_at);
    `);
  } catch (error) {
    console.error('❌ [orderNotificationService] Erro ao criar tabela:', error.message);
  }
};

// Garantir que as colunas de rastreio existam na tabela de pedidos
const ensureTrackingColumns = async () => {
  try {
    // Verificar e adicionar coluna tracking_number
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'melhor_casas_orders' AND column_name = 'tracking_number') THEN
          ALTER TABLE melhor_casas_orders ADD COLUMN tracking_number VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'melhor_casas_orders' AND column_name = 'tracking_company') THEN
          ALTER TABLE melhor_casas_orders ADD COLUMN tracking_company VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'melhor_casas_orders' AND column_name = 'tracking_url') THEN
          ALTER TABLE melhor_casas_orders ADD COLUMN tracking_url TEXT;
        END IF;
      END $$;
    `);
    console.log('✅ [orderNotificationService] Colunas de rastreio verificadas/criadas');
  } catch (error) {
    console.error('❌ [orderNotificationService] Erro ao criar colunas de rastreio:', error.message);
  }
};

// Executar ao iniciar o serviço
(async () => {
  await ensureTrackingColumns();
})();

// Verificar se notificação já foi enviada
const hasNotificationBeenSent = async (orderId, notificationType) => {
  try {
    const result = await pool.query(
      'SELECT id FROM order_notification_logs WHERE order_id = $1 AND notification_type = $2',
      [orderId, notificationType]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ [orderNotificationService] Erro ao verificar notificação:', error.message);
    return false;
  }
};

// Registrar notificação enviada
const logNotificationSent = async (orderId, orderNumber, userId, notificationType, fulfillmentStatus, financialStatus, deliveryType, message) => {
  try {
    await pool.query(
      `INSERT INTO order_notification_logs 
       (order_id, order_number, user_id, notification_type, fulfillment_status, financial_status, delivery_type, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (order_id, notification_type) DO NOTHING`,
      [orderId, orderNumber, userId, notificationType, fulfillmentStatus, financialStatus, deliveryType, message]
    );
  } catch (error) {
    console.error('❌ [orderNotificationService] Erro ao registrar notificação:', error.message);
  }
};

// Mapear status do pedido
const mapOrderStatus = (fulfillmentStatus, financialStatus, deliveryType) => {
  // Normalização para lidar com diferentes formatos (Admin API vs Storefront API)
  const normFulfillment = (fulfillmentStatus || 'UNFULFILLED').toUpperCase();
  const normFinancial = (financialStatus || 'PENDING').toUpperCase();

  const isPickup = deliveryType === 'pickup';
  const isShipping = deliveryType === 'shipping';
  
  // Cancelado
  if (normFinancial === 'REFUNDED' || normFinancial === 'VOIDED') {
    return 'cancelado';
  }
  
  // Concluído
  if (normFulfillment === 'FULFILLED') {
    return 'concluido';
  }
  
  // Processando
  if (normFinancial === 'PAID' || normFinancial === 'PARTIALLY_PAID') {
    return 'processando';
  }
  
  return 'pendente';
};

// Enviar notificação imediatamente após criar um pedido
const sendOrderCreatedNotification = async (orderData) => {
  console.log('🔔 [orderNotificationService] ===== INICIANDO sendOrderCreatedNotification =====');
  
  const { userId, orderId, orderNumber, deliveryType, totalShippingPrice } = orderData;
  
  if (!userId || !orderId) {
    console.error('❌ [orderNotificationService] Dados inválidos:', { userId, orderId });
    throw new Error('userId e orderId são obrigatórios');
  }
  
  try {
    await ensureNotificationTrackingTable();
    
    const isPickup = deliveryType === 'pickup' || (totalShippingPrice === 0);
    const notificationType = isPickup ? 'pickup_processing' : 'shipping_processing';
    
    if (await hasNotificationBeenSent(orderId, notificationType)) {
      console.log(`⚠️ [orderNotificationService] Notificação ${notificationType} já foi enviada para pedido ${orderNumber}`);
      return;
    }
    
    const message = getRandomMessage(notificationType);
    if (!message) return;
    
    const result = await notificationService.sendNotification({
      title: 'Pedido Confirmado',
      body: message,
      userIds: [userId],
      data: {
        type: 'order',
        orderId: orderId,
        orderNumber: orderNumber,
        screen: 'OrderDetail',
        params: { orderId: orderNumber || orderId },
        target: {
          screen: 'OrderDetail',
          orderId: orderNumber || orderId,
          orderNumber: orderNumber
        }
      },
      createdBy: 'order-automation',
      standaloneOnly: false 
    });
    
    await logNotificationSent(
      orderId,
      orderNumber,
      userId,
      notificationType,
      'UNFULFILLED', 
      'PENDING', 
      deliveryType,
      message
    );
    
    console.log(`✅ [orderNotificationService] Notificação enviada: ${notificationType} para pedido ${orderNumber}`);
  } catch (error) {
    console.error('❌ [orderNotificationService] Erro ao enviar notificação de pedido criado:', error);
  }
};

// Processar webhook de pedido (Create ou Update)
const processWebhookOrder = async (orderData) => {
  console.log(`🔔 [orderNotificationService] Processando webhook para pedido ${orderData.id || orderData.name}`);

  try {
    await ensureNotificationTrackingTable();

    // 1. Extrair email para identificar usuário
    const email = orderData.email || orderData.customer?.email;
    if (!email) {
      console.log('⚠️ [orderNotificationService] Webhook sem email, impossível identificar usuário.');
      return;
    }

    // 2. Buscar usuário no banco
    const userResult = await pool.query('SELECT id FROM melhor_casas_users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      console.log(`⚠️ [orderNotificationService] Usuário ${email} não encontrado no app.`);
      return;
    }
    const userId = userResult.rows[0].id;
    
    // 3. Mapear dados do webhook (Admin API)
    const orderId = orderData.id.toString(); 
    const orderNumber = (orderData.order_number || orderData.name || '').toString();
    
    // Status
    const fulfillmentStatus = orderData.fulfillment_status || 'unfulfilled'; 
    const financialStatus = orderData.financial_status || 'pending';
    
    // Delivery Type
    let deliveryType = 'shipping';
    const totalShippingPrice = parseFloat(orderData.total_shipping_price_set?.shop_money?.amount || orderData.total_shipping_price || 0);
    
    // Verificar se o pedido já está marcado como "pronto para retirada" no banco
    // Se estiver, não enviar notificação de "concluído" ainda
    const orderCheck = await pool.query(
      `SELECT status FROM melhor_casas_orders WHERE shopify_order_id = $1 LIMIT 1`,
      [orderId]
    );
    const currentOrderStatus = orderCheck.rows[0]?.status;
    const isReadyForPickup = currentOrderStatus === 'pronto_retirada';
    
    // Tentar inferir se é Pickup
    if (orderData.shipping_lines && orderData.shipping_lines.length > 0) {
       const shipping = orderData.shipping_lines[0];
       const title = (shipping.title || '').toLowerCase();
       const code = (shipping.code || '').toLowerCase();
       if (title.includes('retira') || title.includes('pickup') || code.includes('pickup')) {
          deliveryType = 'pickup';
       }
    }
    // Fallback: se frete é 0, assume pickup
    if (deliveryType === 'shipping' && totalShippingPrice === 0) {
       deliveryType = 'pickup'; 
    }

    const status = mapOrderStatus(fulfillmentStatus, financialStatus, deliveryType);
    console.log(`🔍 [orderNotificationService] Status mapeado: ${status} (Fulfillment: ${fulfillmentStatus}, Financial: ${financialStatus}, Delivery: ${deliveryType}, CurrentStatus: ${currentOrderStatus})`);

    // 4. Verificar e enviar notificação
    let notificationType = null;

    // IMPORTANTE: NÃO atualizar para "concluido" se o status atual for "enviado" ou "pronto_retirada"
    // O status "enviado" e "pronto_retirada" são etapas intermediárias que devem ser mantidas
    // Só atualizar para "concluido" se vier de "processando" ou se ainda não tiver status
    const statusesQuePodeIrParaConcluido = ['processando', null, undefined, ''];
    const podeAtualizarParaConcluido = statusesQuePodeIrParaConcluido.includes(currentOrderStatus);
    
    if (status === 'concluido' && currentOrderStatus !== 'concluido' && podeAtualizarParaConcluido) {
      try {
        await pool.query(
          `UPDATE melhor_casas_orders SET status = 'concluido', updated_at = NOW() WHERE shopify_order_id = $1`,
          [orderId]
        );
        console.log(`✅ [orderNotificationService] Pedido ${orderNumber} atualizado para 'concluido' no banco`);
      } catch (updateError) {
        console.error(`❌ [orderNotificationService] Erro ao atualizar status para concluido:`, updateError.message);
      }
    } else if (status === 'concluido' && !podeAtualizarParaConcluido) {
      console.log(`ℹ️ [orderNotificationService] Pedido ${orderNumber} está como "${currentOrderStatus}", não atualizando para "concluido" automaticamente`);
    }

    if (deliveryType === 'pickup' && status === 'processando') {
      notificationType = 'pickup_processing';
    } else if (status === 'concluido' && podeAtualizarParaConcluido) {
      // Só enviar notificação de concluído se realmente atualizou o status
      notificationType = 'completed';
    } else if (deliveryType === 'shipping' && status === 'processando') {
      notificationType = 'shipping_processing';
    }

    if (notificationType) {
      if (!(await hasNotificationBeenSent(orderId, notificationType))) {
        const message = getRandomMessage(notificationType);
        if (message) {
          await notificationService.sendNotification({
            title: notificationType === 'completed' ? 'Pedido Finalizado' : 'Pedido Confirmado',
            body: message,
            userIds: [userId],
            data: {
              type: 'order',
              orderId: orderId,
              orderNumber: orderNumber,
              screen: 'OrderDetail',
              params: { orderId: orderNumber || orderId },
              target: {
                screen: 'OrderDetail',
                orderId: orderNumber || orderId,
                orderNumber: orderNumber
              }
            },
            createdBy: 'order-webhook',
            standaloneOnly: false
          });
          
          await logNotificationSent(
            orderId,
            orderNumber,
            userId,
            notificationType,
            fulfillmentStatus,
            financialStatus,
            deliveryType,
            message
          );
          
          console.log(`✅ [orderNotificationService] Notificação enviada via Webhook: ${notificationType} para pedido ${orderNumber}`);
        }
      } else {
        console.log(`ℹ️ [orderNotificationService] Notificação ${notificationType} já enviada para pedido ${orderNumber}`);
      }
    }

  } catch (error) {
    console.error('❌ [orderNotificationService] Erro ao processar webhook:', error.message);
    console.error(error.stack);
  }
};

// Processar webhook de fulfillment (create ou update)
const processFulfillmentWebhook = async (fulfillmentData) => {
  console.log(`📦 [orderNotificationService] ===== PROCESSANDO WEBHOOK DE FULFILLMENT =====`);
  console.log(`📦 [orderNotificationService] Fulfillment ID: ${fulfillmentData.id}`);
  
  try {
    await ensureNotificationTrackingTable();
    
    const orderId = fulfillmentData.order_id?.toString();
    if (!orderId) {
      console.log('⚠️ [orderNotificationService] Fulfillment sem order_id');
      return;
    }
    
    console.log(`🔍 [orderNotificationService] Processando fulfillment para pedido Shopify ID: ${orderId}`);
    
    // PASSO 1: Usar o shopifyOrder que já veio do webhook se disponível
    let shopifyOrder = fulfillmentData.shopifyOrder || null;
    let userId = null;
    let orderNumber = null;
    
    // Se temos o shopifyOrder do webhook, usá-lo diretamente
    if (shopifyOrder) {
      console.log(`✅ [orderNotificationService] Dados do pedido recebidos do webhook:`, {
        id: shopifyOrder.id,
        order_number: shopifyOrder.order_number,
        name: shopifyOrder.name,
        email: shopifyOrder.email
      });
      orderNumber = shopifyOrder.order_number?.toString() || shopifyOrder.name?.replace('#', '') || orderId;
      
      // Buscar userId pelo email
      if (shopifyOrder.email) {
        const userResult = await pool.query(
          'SELECT id FROM melhor_casas_users WHERE email = $1',
          [shopifyOrder.email]
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
          console.log(`✅ [orderNotificationService] Usuário encontrado pelo email ${shopifyOrder.email}: ${userId}`);
        } else {
          console.log(`⚠️ [orderNotificationService] Email ${shopifyOrder.email} não encontrado no banco de usuários`);
        }
      }
    }
    
    // PASSO 2: Se não temos shopifyOrder ou userId, buscar no banco local
    if (!userId) {
      const orderResult = await pool.query(
        `SELECT user_id, shopify_order_id, shopify_order_number 
         FROM melhor_casas_orders 
         WHERE shopify_order_id = $1 
         LIMIT 1`,
        [orderId]
      );
      
      if (orderResult.rows.length > 0) {
        userId = orderResult.rows[0].user_id;
        orderNumber = orderResult.rows[0].shopify_order_number || orderNumber || orderId;
        console.log(`✅ [orderNotificationService] Pedido encontrado no banco local. userId: ${userId}, orderNumber: ${orderNumber}`);
      }
    }
    
    // PASSO 3: Se ainda não temos shopifyOrder, buscar no Shopify
    if (!shopifyOrder) {
      console.log(`🔍 [orderNotificationService] Buscando dados do pedido ${orderId} no Shopify...`);
      try {
        const response = await shopifyService.client.get(`/orders/${orderId}.json`);
        shopifyOrder = response.data?.order;
        
        if (shopifyOrder) {
          console.log(`✅ [orderNotificationService] Pedido encontrado no Shopify:`, {
            id: shopifyOrder.id,
            order_number: shopifyOrder.order_number,
            name: shopifyOrder.name,
            email: shopifyOrder.email
          });
          orderNumber = shopifyOrder.order_number?.toString() || shopifyOrder.name?.replace('#', '') || orderNumber || orderId;
          
          // Se ainda não temos userId, buscar pelo email
          if (!userId && shopifyOrder.email) {
            const userResult = await pool.query(
              'SELECT id FROM melhor_casas_users WHERE email = $1',
              [shopifyOrder.email]
            );
            if (userResult.rows.length > 0) {
              userId = userResult.rows[0].id;
              console.log(`✅ [orderNotificationService] Usuário encontrado pelo email ${shopifyOrder.email}: ${userId}`);
            }
          }
        }
      } catch (shopifyError) {
        if (shopifyError.response?.status === 404) {
          console.log(`⚠️ [orderNotificationService] Pedido ${orderId} não encontrado no Shopify`);
        } else {
          console.error(`❌ [orderNotificationService] Erro ao buscar pedido no Shopify:`, shopifyError.message);
        }
      }
    }
    
    // PASSO 4: Verificar se conseguimos identificar o usuário
    if (!userId) {
      console.log(`❌ [orderNotificationService] Não foi possível identificar usuário para pedido ${orderId}`);
      return;
    }
    
    if (!orderNumber) {
      orderNumber = orderId;
    }
    
    console.log(`✅ [orderNotificationService] Dados finais: userId=${userId}, orderId=${orderId}, orderNumber=${orderNumber}`);
    
    // PASSO 5: Verificar se é "Pronto para Retirada"
    const shipmentStatus = fulfillmentData.shipment_status || 
                          fulfillmentData.shipmentStatus || 
                          (fulfillmentData.shipment && fulfillmentData.shipment.status);
    
    const fulfillmentStatus = fulfillmentData.status;
    
    console.log(`🔍 [orderNotificationService] Status do fulfillment:`, {
      shipment_status: shipmentStatus,
      status: fulfillmentStatus,
      tracking_number: fulfillmentData.tracking_number,
      tracking_company: fulfillmentData.tracking_company
    });
    
    // Verificar se é "Pronto para Retirada"
    const isReadyForPickup = shipmentStatus === 'ready_for_pickup' || 
                             shipmentStatus === 'ready-for-pickup' ||
                             shipmentStatus === 'READY_FOR_PICKUP';
    
    console.log(`🔍 [orderNotificationService] isReadyForPickup: ${isReadyForPickup}`);
    
    if (isReadyForPickup) {
      const notificationType = 'pickup_ready';
      
      // CRIAR OU ATUALIZAR o pedido no banco com status 'pronto_retirada'
      console.log(`📝 [orderNotificationService] Criando/Atualizando pedido ${orderId} no banco com status 'pronto_retirada'...`);
      
      try {
        // Primeiro, tentar atualizar se já existe
        const updateResult = await pool.query(
          `UPDATE melhor_casas_orders 
           SET status = 'pronto_retirada',
               shopify_order_number = COALESCE($2, shopify_order_number),
               shopify_order_name = COALESCE($3, shopify_order_name),
               updated_at = NOW()
           WHERE shopify_order_id = $1
           RETURNING id, status`,
          [orderId, orderNumber, shopifyOrder?.name || null]
        );
        
        if (updateResult.rowCount > 0) {
          console.log(`✅ [orderNotificationService] Pedido ${orderId} atualizado para 'pronto_retirada'. DB ID: ${updateResult.rows[0]?.id}`);
        } else {
          // Se não existe, criar novo registro
          const insertResult = await pool.query(
            `INSERT INTO melhor_casas_orders 
             (user_id, total, status, shopify_order_id, shopify_order_number, shopify_order_name, currency, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             RETURNING id, status`,
            [
              userId,
              parseFloat(shopifyOrder?.total_price || 0),
              'pronto_retirada',
              orderId,
              orderNumber,
              shopifyOrder?.name || null,
              shopifyOrder?.currency || 'BRL'
            ]
          );
          console.log(`✅ [orderNotificationService] Pedido ${orderId} criado com status 'pronto_retirada'. DB ID: ${insertResult.rows[0]?.id}`);
        }
      } catch (dbError) {
        console.error(`❌ [orderNotificationService] Erro ao criar/atualizar pedido:`, dbError.message);
        console.error(`❌ [orderNotificationService] Stack:`, dbError.stack);
      }
      
      // Verificar se a notificação já foi enviada
      if (await hasNotificationBeenSent(orderId, notificationType)) {
        console.log(`⚠️ [orderNotificationService] Notificação ${notificationType} já enviada para pedido ${orderNumber}`);
        return;
      }
      
      // Enviar notificação
      const message = getRandomMessage(notificationType);
      if (message) {
        await notificationService.sendNotification({
          title: 'Pedido Pronto para Retirada',
          body: message,
          userIds: [userId],
          data: {
            type: 'order',
            orderId: orderId,
            orderNumber: orderNumber,
            screen: 'OrderDetail',
            params: { orderId: orderNumber || orderId },
            target: {
              screen: 'OrderDetail',
              orderId: orderNumber || orderId,
              orderNumber: orderNumber
            }
          },
          createdBy: 'fulfillment-webhook',
          standaloneOnly: false
        });
        
        await logNotificationSent(
          orderId,
          orderNumber,
          userId,
          notificationType,
          shipmentStatus,
          null,
          'pickup',
          message
        );
        
        console.log(`✅ [orderNotificationService] Notificação de pronto para retirada enviada para pedido ${orderNumber}`);
      }
    }
    
    // Verificar se é "Entrega Local" (saiu para entrega)
    const isLocalDelivery = shipmentStatus === 'local_delivery' || 
                            shipmentStatus === 'LOCAL_DELIVERY';
    
    if (isLocalDelivery) {
      const notificationType = 'local_delivery';
      
      // CRIAR OU ATUALIZAR o pedido no banco com status 'enviado'
      console.log(`📝 [orderNotificationService] Criando/Atualizando pedido ${orderId} no banco com status 'enviado'...`);
      
      try {
        // Primeiro, tentar atualizar se já existe
        const updateResult = await pool.query(
          `UPDATE melhor_casas_orders 
           SET status = 'enviado',
               shopify_order_number = COALESCE($2, shopify_order_number),
               shopify_order_name = COALESCE($3, shopify_order_name),
               updated_at = NOW()
           WHERE shopify_order_id = $1
           RETURNING id, status`,
          [orderId, orderNumber, shopifyOrder?.name || null]
        );
        
        if (updateResult.rowCount > 0) {
          console.log(`✅ [orderNotificationService] Pedido ${orderId} atualizado para 'enviado'. DB ID: ${updateResult.rows[0]?.id}`);
        } else {
          // Se não existe, criar novo registro
          const insertResult = await pool.query(
            `INSERT INTO melhor_casas_orders 
             (user_id, total, status, shopify_order_id, shopify_order_number, shopify_order_name, currency, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             RETURNING id, status`,
            [
              userId,
              parseFloat(shopifyOrder?.total_price || 0),
              'enviado',
              orderId,
              orderNumber,
              shopifyOrder?.name || null,
              shopifyOrder?.currency || 'BRL'
            ]
          );
          console.log(`✅ [orderNotificationService] Pedido ${orderId} criado com status 'enviado'. DB ID: ${insertResult.rows[0]?.id}`);
        }
      } catch (dbError) {
        console.error(`❌ [orderNotificationService] Erro ao criar/atualizar pedido:`, dbError.message);
        console.error(`❌ [orderNotificationService] Stack:`, dbError.stack);
      }
      
      // Verificar se a notificação já foi enviada
      if (await hasNotificationBeenSent(orderId, notificationType)) {
        console.log(`⚠️ [orderNotificationService] Notificação ${notificationType} já enviada para pedido ${orderNumber}`);
        return;
      }
      
      // Enviar notificação
      const message = getRandomMessage(notificationType);
      if (message) {
        await notificationService.sendNotification({
          title: 'Pedido Saiu para Entrega',
          body: message,
          userIds: [userId],
          data: {
            type: 'order',
            orderId: orderId,
            orderNumber: orderNumber,
            screen: 'OrderDetail',
            params: { orderId: orderNumber || orderId },
            target: {
              screen: 'OrderDetail',
              orderId: orderNumber || orderId,
              orderNumber: orderNumber
            }
          },
          createdBy: 'fulfillment-webhook',
          standaloneOnly: false
        });
        
        await logNotificationSent(
          orderId,
          orderNumber,
          userId,
          notificationType,
          shipmentStatus,
          null,
          'local_delivery',
          message
        );
        
        console.log(`✅ [orderNotificationService] Notificação de entrega local enviada para pedido ${orderNumber}`);
      }
    }
    
    // Verificar se tem código de rastreio
    const trackingNumber = fulfillmentData.tracking_number;
    const trackingCompany = fulfillmentData.tracking_company;
    const trackingUrl = fulfillmentData.tracking_url;
    
    if (trackingNumber && trackingNumber.trim() !== '') {
      const notificationType = 'shipping_tracking';
      
      // ATUALIZAR STATUS PARA "ENVIADO" E SALVAR DADOS DE RASTREIO NO BANCO
      console.log(`📝 [orderNotificationService] Atualizando pedido ${orderId} para 'enviado' com dados de rastreio...`);
      
      try {
        // Primeiro, tentar atualizar se já existe
        const updateResult = await pool.query(
          `UPDATE melhor_casas_orders 
           SET status = 'enviado',
               tracking_number = $2,
               tracking_company = $3,
               tracking_url = $4,
               shopify_order_number = COALESCE($5, shopify_order_number),
               updated_at = NOW()
           WHERE shopify_order_id = $1
           RETURNING id, status`,
          [orderId, trackingNumber, trackingCompany || null, trackingUrl || null, orderNumber]
        );
        
        if (updateResult.rowCount > 0) {
          console.log(`✅ [orderNotificationService] Pedido ${orderId} atualizado para 'enviado' com rastreio: ${trackingNumber}`);
        } else {
          // Se não existe, criar novo registro
          const insertResult = await pool.query(
            `INSERT INTO melhor_casas_orders 
             (user_id, total, status, shopify_order_id, shopify_order_number, shopify_order_name, currency, tracking_number, tracking_company, tracking_url, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
             RETURNING id, status`,
            [
              userId,
              parseFloat(shopifyOrder?.total_price || 0),
              'enviado',
              orderId,
              orderNumber,
              shopifyOrder?.name || null,
              shopifyOrder?.currency || 'BRL',
              trackingNumber,
              trackingCompany || null,
              trackingUrl || null
            ]
          );
          console.log(`✅ [orderNotificationService] Pedido ${orderId} criado com status 'enviado' e rastreio: ${trackingNumber}`);
        }
      } catch (dbError) {
        console.error(`❌ [orderNotificationService] Erro ao atualizar pedido com rastreio:`, dbError.message);
        // Se der erro por causa das colunas não existirem, tentar sem elas
        if (dbError.message.includes('column') && dbError.message.includes('does not exist')) {
          console.log(`⚠️ [orderNotificationService] Colunas de rastreio não existem, atualizando apenas status...`);
          try {
            await pool.query(
              `UPDATE melhor_casas_orders SET status = 'enviado', updated_at = NOW() WHERE shopify_order_id = $1`,
              [orderId]
            );
            console.log(`✅ [orderNotificationService] Pedido ${orderId} atualizado para 'enviado' (sem dados de rastreio)`);
          } catch (fallbackError) {
            console.error(`❌ [orderNotificationService] Erro no fallback:`, fallbackError.message);
          }
        }
      }
      
      if (await hasNotificationBeenSent(orderId, notificationType)) {
        console.log(`⚠️ [orderNotificationService] Notificação ${notificationType} já enviada para pedido ${orderNumber}`);
        return;
      }
      
      // Buscar mensagem template e substituir {tracking_number}
      const messageTemplate = getRandomMessage(notificationType);
      if (messageTemplate) {
        const message = messageTemplate.replace('{tracking_number}', trackingNumber);
        
        // Montar corpo da mensagem com informações de rastreio
        let body = message;
        if (trackingCompany) {
          body += `\nTransportadora: ${trackingCompany}`;
        }
        if (trackingUrl) {
          body += `\nRastrear: ${trackingUrl}`;
        }
        
        await notificationService.sendNotification({
          title: 'Pedido Enviado',
          body: body,
          userIds: [userId],
          data: {
            type: 'order',
            orderId: orderId,
            orderNumber: orderNumber,
            trackingNumber: trackingNumber,
            trackingCompany: trackingCompany,
            trackingUrl: trackingUrl,
            screen: 'OrderDetail',
            params: { orderId: orderNumber || orderId },
            target: {
              screen: 'OrderDetail',
              orderId: orderNumber || orderId,
              orderNumber: orderNumber
            }
          },
          createdBy: 'fulfillment-webhook',
          standaloneOnly: false
        });
        
        await logNotificationSent(
          orderId,
          orderNumber,
          userId,
          notificationType,
          shipmentStatus || null,
          null,
          'shipping',
          body
        );
        
        console.log(`✅ [orderNotificationService] Notificação de rastreio enviada para pedido ${orderNumber}: ${trackingNumber}`);
      }
    }
    
  } catch (error) {
    console.error('❌ [orderNotificationService] Erro ao processar webhook de fulfillment:', error.message);
    console.error(error.stack);
  }
};

// Processar pedidos e enviar notificações (Legado)
const processOrderNotifications = async () => {
  console.log('⚠️ [orderNotificationService] processOrderNotifications (polling) foi chamado mas está deprecado.');
  // Retornar sucesso para não quebrar chamadas existentes, mas não fazer nada
  return { success: true, notificationsSent: 0 };
};

module.exports = {
  processOrderNotifications,
  processWebhookOrder,
  processFulfillmentWebhook,
  sendOrderCreatedNotification,
  ensureNotificationTrackingTable,
  hasNotificationBeenSent,
  logNotificationSent
};