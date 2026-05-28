const express = require('express');
const { body, validationResult, query } = require('express-validator');
const notificationService = require('../services/notificationService');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
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
  '/register',
  authenticateToken, // 🔒 AUTENTICAÇÃO OBRIGATÓRIA
  body('token').notEmpty().withMessage('token é obrigatório'),
  body('platform').optional().isString(),
  handleValidation,
  async (req, res, next) => {
    try {
      console.log('🚀🚀🚀 [notifications/register] 📥 RECEBENDO REGISTRO DE TOKEN 🚀🚀🚀');
      console.log('[notifications/register] 📥 Recebendo registro de token:', {
        hasToken: !!req.body.token,
        platform: req.body.platform,
        isStandalone: req.body.isStandalone,
        deviceId: req.body.deviceId,
        userFromJWT: {
          id: req.user?.id,
          userId: req.user?.userId,
          email: req.user?.email,
          hasUser: !!req.user,
        },
      });
      
      // 🔒 Usar userId do token JWT, não do body (segurança)
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        console.error('[notifications/register] ❌ userId não encontrado em req.user:', {
          user: req.user,
          userKeys: req.user ? Object.keys(req.user) : 'no user',
        });
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      console.log('[notifications/register] ✅ userId encontrado:', userId);
      console.log('[notifications/register] 📋 req.user completo:', JSON.stringify(req.user, null, 2));

      const record = await notificationService.registerToken({
        token: req.body.token,
        userId, // ✅ Vem do JWT, não do body
        deviceId: req.body.deviceId,
        platform: req.body.platform,
        locale: req.body.locale,
        appVersion: req.body.appVersion,
        isStandalone: req.body.isStandalone || false,
      });
      
      console.log('[notifications/register] ✅ Token registrado com sucesso:', {
        subscriptionId: record.id,
        userId: record.user_id,
        isStandalone: record.is_standalone,
        platform: record.platform,
      });
      
      res.status(201).json({ subscriptionId: record.id });
    } catch (error) {
      console.error('[notifications/register] ❌ Erro ao registrar token:', {
        message: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }
);

router.post(
  '/send',
  authenticateAdmin, // 🔒 Apenas admins podem enviar notificações
  body('title').notEmpty().withMessage('title é obrigatório'),
  body('body').notEmpty().withMessage('body é obrigatório'),
  body('data').optional().isObject(),
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await notificationService.sendNotification({
        title: req.body.title,
        body: req.body.body,
        data: req.body.data, // pode conter imageUrl, emoji, type, orderId, orderNumber, target
        userIds: req.body.userIds,
        tokens: req.body.tokens,
        createdBy: req.user?.email || req.user?.nome || 'dashboard',
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/logs',
  authenticateAdmin, // 🔒 Apenas admins podem ver logs
  query('limit').optional().isInt({ min: 1, max: 200 }),
  handleValidation,
  async (req, res, next) => {
    try {
      const logs = await notificationService.listLogs(parseInt(req.query.limit, 10) || 50);
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  }
);

// Rota para obter contagem de downloads (tokens) - sem limite
router.get(
  '/tokens/count',
  authenticateAdmin, // 🔒 Apenas admins podem ver contagens
  async (req, res, next) => {
    try {
      // Contagem total de tokens
      const totalResult = await pool.query(`
        SELECT COUNT(*) as total
        FROM push_subscriptions
      `);
      
      // Contagem por plataforma
      const platformResult = await pool.query(`
        SELECT 
          platform,
          COUNT(*) as count
        FROM push_subscriptions
        WHERE platform IS NOT NULL
        GROUP BY platform
      `);
      
      const platformCounts = {};
      platformResult.rows.forEach(row => {
        platformCounts[row.platform] = parseInt(row.count);
      });

      // Inscrições hoje: de meia-noite até agora no horário do Brasil (America/Sao_Paulo)
      const todayResult = await pool.query(`
        SELECT COUNT(*) AS total
        FROM push_subscriptions
        WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
      `);
      const todayTotal = parseInt(todayResult.rows[0]?.total || 0);
      
      res.json({
        total: parseInt(totalResult.rows[0].total),
        today: todayTotal,
        byPlatform: {
          ios: platformCounts['iOS'] || platformCounts['ios'] || 0,
          android: platformCounts['Android'] || platformCounts['android'] || 0,
        },
        platformCounts: platformCounts
      });
    } catch (error) {
      next(error);
    }
  }
);

// Rota de debug para listar tokens registrados
router.get(
  '/tokens',
  authenticateAdmin, // 🔒 Apenas admins podem ver tokens
  query('limit').optional().isInt({ min: 1, max: 200 }),
  handleValidation,
  async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      
      // Garantir que a coluna existe
      try {
        const checkResult = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'push_subscriptions' 
          AND column_name = 'is_standalone'
        `);
        
        if (checkResult.rows.length === 0) {
          await pool.query(`
            ALTER TABLE push_subscriptions 
            ADD COLUMN is_standalone BOOLEAN DEFAULT false
          `);
        }
      } catch (error) {
        // Ignorar se já existir
        console.log('[notifications/tokens] Coluna is_standalone:', error.message);
      }
      
      const result = await pool.query(`
        SELECT 
          ps.id,
          ps.user_id,
          ps.device_id,
          ps.expo_push_token,
          ps.platform,
          ps.is_standalone,
          ps.app_version,
          ps.last_used_at,
          ps.created_at,
          u.email,
          u.nome,
          u.cpf_cnpj
        FROM push_subscriptions ps
        LEFT JOIN melhor_casas_users u ON ps.user_id = u.id
        ORDER BY ps.last_used_at DESC
        LIMIT $1
      `, [limit]);
      
      res.json({
        total: result.rows.length,
        tokens: result.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          userEmail: row.email,
          userName: row.nome,
          userCpfCnpj: row.cpf_cnpj,
          deviceId: row.device_id,
          token: row.expo_push_token?.substring(0, 30) + '...',
          platform: row.platform,
          isStandalone: row.is_standalone,
          appVersion: row.app_version,
          lastUsedAt: row.last_used_at,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Rota para atualizar manualmente o status standalone de um token
router.patch(
  '/tokens/:id/standalone',
  authenticateAdmin,
  body('isStandalone').isBoolean().withMessage('isStandalone deve ser true ou false'),
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { isStandalone } = req.body;
      
      const result = await pool.query(
        'UPDATE push_subscriptions SET is_standalone = $1 WHERE id = $2 RETURNING *',
        [isStandalone, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Token não encontrado' });
      }
      
      res.json({
        message: 'Status standalone atualizado',
        token: {
          id: result.rows[0].id,
          isStandalone: result.rows[0].is_standalone,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Rota para executar manualmente o processamento de notificações de pedidos
router.post(
  '/orders/process',
  authenticateAdmin, // 🔒 Apenas admins podem executar manualmente
  async (req, res, next) => {
    try {
      const orderNotificationService = require('../services/orderNotificationService');
      const result = await orderNotificationService.processOrderNotifications();
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
