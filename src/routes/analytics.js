const express = require('express');
const { body, validationResult, query } = require('express-validator');
const analyticsService = require('../services/analyticsService');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../database/connection');

const router = express.Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return next();
};

router.post(
  '/events',
  body('eventName').notEmpty().withMessage('eventName é obrigatório'),
  body('metadata').optional().isObject().withMessage('metadata deve ser um objeto'),
  handleValidation,
  async (req, res, next) => {
    try {
      // Processar cartValue
      // Para cart_add: usar price (valor do produto) do metadata se cartValue não estiver disponível
      // Para checkout_proceed_click: usar cartValue (valor total do carrinho)
      let cartValue = null;
      if (req.body.cartValue !== null && req.body.cartValue !== undefined && req.body.cartValue !== '') {
        const parsed = parseFloat(req.body.cartValue);
        if (!isNaN(parsed) && parsed >= 0) {
          cartValue = parsed;
        }
      }
      
      // Para cart_add, se cartValue não foi fornecido, usar price do metadata
      if (!cartValue && req.body.eventName === 'cart_add') {
        if (req.body.metadata?.price !== null && req.body.metadata?.price !== undefined) {
          const priceParsed = parseFloat(req.body.metadata.price);
          if (!isNaN(priceParsed) && priceParsed >= 0) {
            cartValue = priceParsed;
            console.log('[analytics] Usando price do metadata para cart_add:', cartValue);
          }
        }
      }
      
      // Processar checkoutId - apenas para checkout_proceed_click, não para cart_add
      let checkoutId = null;
      if (req.body.eventName === 'checkout_proceed_click') {
        checkoutId = req.body.checkoutId || req.body.cartId || null;
        if (!checkoutId && (req.body.userId || req.user?.id)) {
          checkoutId = String(req.body.userId || req.user.id);
        }
      }
      
      const payload = {
        eventName: req.body.eventName,
        userId: req.body.userId || req.user?.id,
        userEmail: req.body.userEmail || req.user?.email,
        userName: req.body.userName || req.user?.nome,
        sessionId: req.body.sessionId,
        deviceId: req.body.deviceId,
        source: req.body.source || 'app',
        metadata: req.body.metadata,
        cartValue: cartValue,
        productQuantity: req.body.productQuantity,
        productId: req.body.productId,
        checkoutId: checkoutId,
      };
      
      console.log('[analytics] Evento recebido (raw):', JSON.stringify(req.body, null, 2));
      console.log('[analytics] Evento processado:', {
        eventName: payload.eventName,
        userId: payload.userId,
        userName: payload.userName,
        cartValue: payload.cartValue,
        cartValueType: typeof payload.cartValue,
        checkoutId: payload.checkoutId,
        checkoutIdType: typeof payload.checkoutId,
        productQuantity: payload.productQuantity,
      });
      const event = await analyticsService.logEvent(payload);
      console.log('[analytics] Evento salvo no banco:', {
        id: event.id,
        cart_value: event.cart_value,
        checkout_id: event.checkout_id,
      });
      res.status(201).json({ eventId: event.id });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/live',
  authenticateToken,
  async (req, res) => {
    try {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      let activeCount = 0;
      
      if (global.activeUsers) {
        for (const [key, lastActive] of global.activeUsers.entries()) {
          if (lastActive > fiveMinutesAgo) {
            activeCount++;
          }
        }
      }
      
      res.json({ activeUsers: activeCount });
    } catch (error) {
      console.error('Erro ao buscar usuários ativos:', error);
      res.status(500).json({ error: 'Erro ao buscar métricas em tempo real' });
    }
  }
);

router.get(
  '/summary',
  authenticateToken,
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  handleValidation,
  async (req, res, next) => {
    try {
      const summary = await analyticsService.getSummary({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
      res.json({ summary });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/daily',
  authenticateToken,
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('eventNames').optional().isString(),
  handleValidation,
  async (req, res, next) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
      
      // Calcular visitantes únicos e sessões por dia a partir dos eventos
      // Visitantes únicos: usar user_id quando disponível, senão device_id, senão session_id
      const result = await pool.query(
        `
        SELECT 
          DATE(created_at) as metric_date,
          COUNT(DISTINCT 
            CASE 
              WHEN user_id IS NOT NULL THEN 'user_' || user_id::text
              WHEN device_id IS NOT NULL THEN 'device_' || device_id
              WHEN session_id IS NOT NULL THEN 'session_' || session_id
              ELSE NULL
            END
          ) as unique_visitors,
          COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) as total_sessions,
          COUNT(*) as page_views
        FROM analytics_events
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY DATE(created_at)
        ORDER BY metric_date ASC
        `,
        [startDate, endDate]
      );

      // Calcular downloads por dia e plataforma (baseado na data de criação dos tokens de push notification)
      // Cada token novo representa uma instalação/download do app
      // O created_at não é alterado em UPDATEs, então podemos contar diretamente pela data de criação
      const downloadsResult = await pool.query(
        `
        SELECT 
          DATE(created_at) as metric_date,
          platform,
          COUNT(*) as downloads
        FROM push_subscriptions
        WHERE created_at >= $1 
          AND created_at <= $2
        GROUP BY DATE(created_at), platform
        ORDER BY metric_date ASC, platform ASC
        `,
        [startDate, endDate]
      );
      
      console.log('[analytics/daily] Downloads encontrados:', {
        totalRows: downloadsResult.rows.length,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalDownloads: downloadsResult.rows.reduce((sum, r) => sum + parseInt(r.downloads || 0), 0),
        downloads: downloadsResult.rows.map(r => ({
          date: r.metric_date,
          platform: r.platform,
          count: r.downloads
        }))
      });
      
      console.log('[analytics/daily] Resultado da query:', {
        totalRows: result.rows.length,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        sampleRow: result.rows[0] || null,
        allRows: result.rows.map(r => ({
          date: r.metric_date,
          unique_visitors: r.unique_visitors,
          total_sessions: r.total_sessions,
          page_views: r.page_views
        }))
      });
      
      // Criar mapa de downloads por data e plataforma
      const downloadsMap = new Map();
      downloadsResult.rows.forEach(row => {
        let dateValue = row.metric_date;
        if (dateValue instanceof Date) {
          dateValue = dateValue.toISOString().split('T')[0];
        } else if (typeof dateValue === 'string') {
          dateValue = dateValue.split('T')[0].split(' ')[0];
        }
        if (dateValue) {
          const key = `${dateValue}_${row.platform || 'unknown'}`;
          downloadsMap.set(key, parseInt(row.downloads || 0));
        }
      });

      const daily = result.rows.map(row => {
        // Converter a data para string ISO
        let dateValue = row.metric_date;
        
        // PostgreSQL DATE retorna como string no formato YYYY-MM-DD ou como Date object
        if (dateValue instanceof Date) {
          dateValue = dateValue.toISOString().split('T')[0];
        } else if (typeof dateValue === 'string') {
          // Se já for string, garantir formato ISO (YYYY-MM-DD)
          dateValue = dateValue.split('T')[0].split(' ')[0];
        } else if (dateValue) {
          // Tentar converter qualquer outro formato
          const dateObj = new Date(dateValue);
          if (!isNaN(dateObj.getTime())) {
            dateValue = dateObj.toISOString().split('T')[0];
          } else {
            console.warn('[analytics/daily] Data inválida no banco:', dateValue);
            dateValue = null;
          }
        }
        
        const uniqueVisitors = parseInt(row.unique_visitors || 0);
        
        // Calcular downloads por plataforma para esta data
        const downloadsAndroid = downloadsMap.get(`${dateValue}_Android`) || downloadsMap.get(`${dateValue}_android`) || 0;
        const downloadsIOS = downloadsMap.get(`${dateValue}_iOS`) || downloadsMap.get(`${dateValue}_ios`) || 0;
        const downloadsOther = Array.from(downloadsMap.entries())
          .filter(([key]) => key.startsWith(`${dateValue}_`) && !key.includes('Android') && !key.includes('iOS') && !key.includes('android') && !key.includes('ios'))
          .reduce((sum, [, value]) => sum + value, 0);
        const downloadsTotal = downloadsAndroid + downloadsIOS + downloadsOther;
        
        return {
          date: dateValue,
          unique_visitors: uniqueVisitors,
          total_sessions: parseInt(row.total_sessions || 0),
          page_views: parseInt(row.page_views || 0),
          downloads: downloadsTotal,
          downloadsAndroid: downloadsAndroid,
          downloadsIOS: downloadsIOS,
          downloadsOther: downloadsOther,
          total_orders: 0 // Não disponível aqui
        };
      }).filter(item => item.date !== null); // Remover itens com data inválida
      
      console.log('[analytics/daily] Daily formatado:', {
        total: daily.length,
        sample: daily[0] || null,
        allDays: daily.map(d => ({
          date: d.date,
          unique_visitors: d.unique_visitors,
          total_sessions: d.total_sessions
        }))
      });
      
      res.json({ daily });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/events',
  authenticateToken,
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('eventName').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('offset').optional().isInt({ min: 0 }),
  handleValidation,
  async (req, res, next) => {
    try {
      console.log('[analytics] GET /events - Parâmetros:', {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        eventName: req.query.eventName,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      const data = await analyticsService.getDetailedEvents({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        eventName: req.query.eventName,
        limit: req.query.limit ? Number(req.query.limit) : 100,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      });
      console.log('[analytics] Eventos retornados:', data.events?.length || 0, 'de', data.total);
      res.json(data);
    } catch (error) {
      console.error('[analytics] Erro ao buscar eventos detalhados:', error);
      next(error);
    }
  }
);

router.get(
  '/active-users',
  authenticateToken,
  query('days').optional().isIn(['15', '30']).withMessage('days deve ser 15 ou 30'),
  handleValidation,
  async (req, res, next) => {
    try {
      const days = parseInt(req.query.days || '30');
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      // Contar pessoas únicas que tiveram pelo menos um evento no período
      // Usar a mesma lógica de visitantes únicos: user_id > device_id > session_id
      const result = await pool.query(
        `
        SELECT COUNT(DISTINCT 
          CASE 
            WHEN user_id IS NOT NULL THEN 'user_' || user_id::text
            WHEN device_id IS NOT NULL THEN 'device_' || device_id
            WHEN session_id IS NOT NULL THEN 'session_' || session_id
            ELSE NULL
          END
        ) as active_users
        FROM analytics_events
        WHERE created_at >= $1 AND created_at <= $2
        `,
        [startDate, endDate]
      );

      const activeUsers = parseInt(result.rows[0]?.active_users || 0);

      console.log('[analytics/active-users] Pessoas ativas:', {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        activeUsers
      });

      res.json({ 
        days,
        activeUsers,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
    } catch (error) {
      console.error('[analytics] Erro ao buscar pessoas ativas:', error);
      next(error);
    }
  }
);

module.exports = router;


