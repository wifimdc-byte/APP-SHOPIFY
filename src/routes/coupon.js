const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const pool = require('../database/connection');

// Campanha: limite de 20 cupons por cliente, válida por 3 meses a partir de 28/02
// Uso anterior a 28/02 não entra na contagem
const CAMPAIGN_START_DATE = '2026-02-28'; // YYYY-MM-DD (Brasília)
const CAMPAIGN_LIMIT = 20;
const CAMPAIGN_DURATION_MONTHS = 3;
const CAMPAIGN_END_DATE = '2026-05-28'; // 28/02 + 3 meses

// Função auxiliar para converter uma Date para data (YYYY-MM-DD)
// considerando horário de Brasília (UTC-3). A ideia é pegar a data
// "vista" em Brasília, independente do timezone do servidor.
const getBrazilDateString = (date) => {
  // Brasília é UTC-3 → para obter a data local de Brasília a partir de um
  // Date em UTC, precisamos SUBTRAIR 3 horas.
  const brazilTime = new Date(date.getTime() - (3 * 60 * 60 * 1000));

  const year = brazilTime.getUTCFullYear();
  const month = String(brazilTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(brazilTime.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// Função auxiliar para obter data atual do servidor (sem hora) no horário do Brasil
const getServerDate = () => {
  const now = new Date();
  return getBrazilDateString(now);
};

// Função auxiliar para calcular próximo reset (00:00 do próximo dia no horário do Brasil - UTC-3)
// Meia-noite no Brasil (00:00 BRT) = 03:00 UTC do mesmo dia
const getNextReset = () => {
  const now = new Date();
  
  // Obter timestamp atual
  const nowMs = now.getTime();
  
  // Converter para horário do Brasil: subtrair 3 horas (UTC-3)
  const brazilNow = new Date(nowMs - (3 * 60 * 60 * 1000));
  
  // Obter componentes da data no horário do Brasil
  const brazilYear = brazilNow.getUTCFullYear();
  const brazilMonth = brazilNow.getUTCMonth();
  const brazilDate = brazilNow.getUTCDate();
  
  // Criar data da meia-noite do próximo dia no horário do Brasil
  // Meia-noite no Brasil = 03:00 UTC, então meia-noite do próximo dia = 03:00 UTC do próximo dia
  const tomorrowMidnightBrazil = new Date(Date.UTC(brazilYear, brazilMonth, brazilDate + 1, 3, 0, 0, 0));
  
  return tomorrowMidnightBrazil.toISOString();
};

// GET /api/coupon/status - Obter status do cupom do usuário
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = getServerDate();
    const serverTime = new Date().toISOString();
    const nextReset = getNextReset();

    console.log(`🎫 [coupon/status] Verificando cupom para usuário ${userId} na data ${today}`);

    // Buscar cupom de hoje
    const result = await pool.query(
      `SELECT id, used, used_at, discount_value 
       FROM melhor_casas_daily_coupons 
       WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );

    let status = 'available';
    let usedAt = null;

    if (result.rows.length > 0) {
      const coupon = result.rows[0];
      if (coupon.used) {
        status = 'used';
        usedAt = coupon.used_at ? new Date(coupon.used_at).toISOString() : null;
      }
    }

    // Contagem na campanha: apenas usos com date >= CAMPAIGN_START_DATE e date <= CAMPAIGN_END_DATE
    const campaignCountResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM melhor_casas_daily_coupons
       WHERE user_id = $1 AND used = true AND date >= $2 AND date <= $3`,
      [userId, CAMPAIGN_START_DATE, CAMPAIGN_END_DATE]
    );
    const usedInCampaign = parseInt(campaignCountResult.rows[0]?.total || 0, 10);
    const remainingInCampaign = Math.max(0, CAMPAIGN_LIMIT - usedInCampaign);
    const campaignActive = today <= CAMPAIGN_END_DATE;
    const canUseInCampaign = campaignActive && remainingInCampaign > 0;

    console.log(`🎫 [coupon/status] Status: ${status} | Campanha: ${usedInCampaign}/${CAMPAIGN_LIMIT} | Ativa: ${campaignActive}`);

    res.json({
      status,
      serverTime,
      nextReset,
      usedAt,
      campaign: {
        startDate: CAMPAIGN_START_DATE,
        endDate: CAMPAIGN_END_DATE,
        limit: CAMPAIGN_LIMIT,
        usedInCampaign,
        remainingInCampaign,
        campaignActive,
        canUseInCampaign,
      },
    });
  } catch (error) {
    console.error('❌ [coupon/status] Erro:', error);
    res.status(500).json({ error: 'Erro ao verificar status do cupom' });
  }
});

// POST /api/coupon/use - Marcar cupom como usado
router.post('/use', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = getServerDate();
    const serverTime = new Date();

    console.log(`🎫 [coupon/use] Tentando usar cupom para usuário ${userId} na data ${today}`);

    // Regras da campanha: só conta a partir de 28/02; limite 10; válida 3 meses
    if (today > CAMPAIGN_END_DATE) {
      const endFormatted = CAMPAIGN_END_DATE.split('-').reverse().join('/');
      return res.status(400).json({
        error: `Esta campanha encerrou em ${endFormatted}. Você não pode mais utilizar cupons desta campanha.`,
        status: 'used',
        code: 'CAMPAIGN_ENDED',
      });
    }

    const campaignCountResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM melhor_casas_daily_coupons
       WHERE user_id = $1 AND used = true AND date >= $2 AND date <= $3`,
      [userId, CAMPAIGN_START_DATE, CAMPAIGN_END_DATE]
    );
    const usedInCampaign = parseInt(campaignCountResult.rows[0]?.total || 0, 10);
    if (usedInCampaign >= CAMPAIGN_LIMIT) {
      return res.status(400).json({
        error: `Você já utilizou os ${CAMPAIGN_LIMIT} cupons desta campanha. A campanha permite até ${CAMPAIGN_LIMIT} usos por cliente.`,
        status: 'used',
        code: 'CAMPAIGN_LIMIT_REACHED',
      });
    }

    // Verificar se já existe cupom para hoje
    const existingResult = await pool.query(
      `SELECT id, used, used_at 
       FROM melhor_casas_daily_coupons 
       WHERE user_id = $1 AND date = $2`,
      [userId, today]
    );

    if (existingResult.rows.length > 0) {
      const existingCoupon = existingResult.rows[0];
      
      if (existingCoupon.used) {
        console.log(`⚠️ [coupon/use] Cupom já foi usado hoje para usuário ${userId}`);
        return res.status(400).json({ 
          error: 'Cupom já foi utilizado hoje',
          status: 'used'
        });
      }

      // Atualizar cupom existente
      await pool.query(
        `UPDATE melhor_casas_daily_coupons 
         SET used = true, used_at = $1, updated_at = $1 
         WHERE id = $2`,
        [serverTime, existingCoupon.id]
      );

      console.log(`✅ [coupon/use] Cupom atualizado para usado (ID: ${existingCoupon.id})`);
    } else {
      // Criar novo registro de cupom usado
      await pool.query(
        `INSERT INTO melhor_casas_daily_coupons (user_id, date, used, used_at, created_at, updated_at)
         VALUES ($1, $2, true, $3, $3, $3)`,
        [userId, today, serverTime]
      );

      console.log(`✅ [coupon/use] Novo cupom criado e marcado como usado`);
    }

    const nextReset = getNextReset();
    const usedAt = serverTime.toISOString();

    // Contagem atualizada após este uso (usedInCampaign + 1 para hoje)
    const newUsedInCampaign = usedInCampaign + 1;
    const remainingInCampaign = Math.max(0, CAMPAIGN_LIMIT - newUsedInCampaign);

    res.json({
      success: true,
      message: 'Cupom utilizado com sucesso',
      status: 'used',
      serverTime: usedAt,
      nextReset,
      usedAt,
      campaign: {
        startDate: CAMPAIGN_START_DATE,
        endDate: CAMPAIGN_END_DATE,
        limit: CAMPAIGN_LIMIT,
        usedInCampaign: newUsedInCampaign,
        remainingInCampaign,
        campaignActive: today <= CAMPAIGN_END_DATE,
        canUseInCampaign: remainingInCampaign > 0 && today <= CAMPAIGN_END_DATE,
      },
    });
  } catch (error) {
    console.error('❌ [coupon/use] Erro:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({ 
        error: 'Cupom já foi utilizado hoje',
        status: 'used'
      });
    }

    res.status(500).json({ error: 'Erro ao utilizar cupom' });
  }
});

// POST /api/coupon/reset - Resetar todos os cupons (apenas admin)
router.post('/reset', authenticateAdmin, async (req, res) => {
  try {
    console.log(`🎫 [coupon/reset] Admin ${req.user.id} (${req.user.email}) resetando todos os cupons`);

    // Resetar todos os cupons: marcar como não usados e limpar used_at
    const result = await pool.query(
      `UPDATE melhor_casas_daily_coupons 
       SET used = false, 
           used_at = NULL, 
           updated_at = NOW()
       WHERE used = true`
    );

    const resetCount = result.rowCount;

    console.log(`✅ [coupon/reset] ${resetCount} cupom(ns) resetado(s) com sucesso`);

    res.json({
      success: true,
      message: `${resetCount} cupom(ns) resetado(s) com sucesso`,
      resetCount
    });
  } catch (error) {
    console.error('❌ [coupon/reset] Erro:', error);
    res.status(500).json({ error: 'Erro ao resetar cupons' });
  }
});

// GET /api/coupon/config - Obter configuração de cupons (público para o app)
router.get('/config', async (req, res) => {
  try {
    // Garantir que as colunas novas existam (pré-divulgação e agendamento do FAB)
    try {
      await pool.query(`
        ALTER TABLE melhor_casas_coupon_config 
        ADD COLUMN IF NOT EXISTS pre_launch_enabled BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS pre_launch_image_url TEXT,
        ADD COLUMN IF NOT EXISTS fab_schedule_enabled BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS fab_schedule_datetime TIMESTAMPTZ
      `);
    } catch (e) {
      // Se falhar (por exemplo, por permissões), apenas logar e seguir com SELECT
      console.warn('⚠️ [coupon/config] Não foi possível garantir colunas de pré-divulgação/agendamento:', e.message);
    }

    const result = await pool.query(
      `SELECT 
        fab_enabled,
        fab_icon_url,
        how_to_step1,
        how_to_step2,
        how_to_step3,
        coupon_title,
        coupon_discount_text,
        coupon_bottom_text,
        coupon_bottom_subtext,
        note_text,
        pre_launch_enabled,
        pre_launch_image_url,
        fab_schedule_enabled,
        fab_schedule_datetime
       FROM melhor_casas_coupon_config 
       ORDER BY id DESC 
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Retornar valores padrão se não houver configuração
      return res.json({
        fabEnabled: true,
        fabIconUrl: null,
        howTo: [
          'Vá até a loja mais próxima',
          'Mostre essa tela para o caixa na hora da compra',
          'Ganhe 10% de desconto 🎉'
        ],
        couponTitle: 'CUPOM DIÁRIO',
        couponDiscountText: '10% OFF',
        couponBottomText: 'Mostre para o caixa',
        couponBottomSubtext: 'Válido apenas hoje',
        noteText: 'Limite de 1 uso por dia • Desconto máximo de R$ 20',
        preLaunchEnabled: false,
        preLaunchImageUrl: null,
        fabScheduleEnabled: false,
        fabScheduleDateTime: null
      });
    }

    const config = result.rows[0];
    res.json({
      fabEnabled: config.fab_enabled,
      fabIconUrl: config.fab_icon_url,
      howTo: [
        config.how_to_step1,
        config.how_to_step2,
        config.how_to_step3
      ],
      couponTitle: config.coupon_title,
      couponDiscountText: config.coupon_discount_text,
      couponBottomText: config.coupon_bottom_text,
      couponBottomSubtext: config.coupon_bottom_subtext,
      noteText: config.note_text,
      preLaunchEnabled: config.pre_launch_enabled ?? false,
      preLaunchImageUrl: config.pre_launch_image_url || null,
      fabScheduleEnabled: config.fab_schedule_enabled ?? false,
      fabScheduleDateTime: config.fab_schedule_datetime ? config.fab_schedule_datetime.toISOString() : null
    });
  } catch (error) {
    console.error('❌ [coupon/config] Erro:', error);
    res.status(500).json({ error: 'Erro ao obter configuração de cupons' });
  }
});

// PUT /api/coupon/config - Atualizar configuração de cupons (apenas admin)
router.put('/config', authenticateAdmin, async (req, res) => {
  try {
    const {
      fabEnabled,
      fabIconUrl,
      howTo,
      couponTitle,
      couponDiscountText,
      couponBottomText,
      couponBottomSubtext,
      noteText,
      preLaunchEnabled,
      preLaunchImageUrl,
      fabScheduleEnabled,
      fabScheduleDateTime
    } = req.body;

    console.log(`🎫 [coupon/config] Admin ${req.user.id} atualizando configuração`);

    // Garantir colunas novas antes de inserir/atualizar
    try {
      await pool.query(`
        ALTER TABLE melhor_casas_coupon_config 
        ADD COLUMN IF NOT EXISTS pre_launch_enabled BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS pre_launch_image_url TEXT,
        ADD COLUMN IF NOT EXISTS fab_schedule_enabled BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS fab_schedule_datetime TIMESTAMPTZ
      `);
    } catch (e) {
      console.warn('⚠️ [coupon/config] Não foi possível garantir colunas de pré-divulgação/agendamento (PUT):', e.message);
    }

    // Verificar se já existe configuração
    const existing = await pool.query('SELECT id FROM melhor_casas_coupon_config LIMIT 1');

    if (existing.rows.length === 0) {
      // Criar nova configuração
      await pool.query(`
        INSERT INTO melhor_casas_coupon_config (
          fab_enabled,
          fab_icon_url,
          how_to_step1,
          how_to_step2,
          how_to_step3,
          coupon_title,
          coupon_discount_text,
          coupon_bottom_text,
          coupon_bottom_subtext,
          note_text,
          pre_launch_enabled,
          pre_launch_image_url,
          fab_schedule_enabled,
          fab_schedule_datetime
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        fabEnabled !== undefined ? fabEnabled : true,
        fabIconUrl || null,
        howTo && howTo[0] ? howTo[0] : 'Vá até a loja mais próxima',
        howTo && howTo[1] ? howTo[1] : 'Mostre essa tela para o caixa na hora da compra',
        howTo && howTo[2] ? howTo[2] : 'Ganhe 10% de desconto 🎉',
        couponTitle || 'CUPOM DIÁRIO',
        couponDiscountText || '10% OFF',
        couponBottomText || 'Mostre para o caixa',
        couponBottomSubtext || 'Válido apenas hoje',
        noteText || 'Limite de 1 uso por dia • Desconto máximo de R$ 20',
        preLaunchEnabled !== undefined ? preLaunchEnabled : false,
        preLaunchImageUrl || null,
        fabScheduleEnabled !== undefined ? fabScheduleEnabled : false,
        fabScheduleDateTime || null
      ]);
    } else {
      // Atualizar configuração existente
      await pool.query(`
        UPDATE melhor_casas_coupon_config 
        SET 
          fab_enabled = COALESCE($1, fab_enabled),
          fab_icon_url = COALESCE($2, fab_icon_url),
          how_to_step1 = COALESCE($3, how_to_step1),
          how_to_step2 = COALESCE($4, how_to_step2),
          how_to_step3 = COALESCE($5, how_to_step3),
          coupon_title = COALESCE($6, coupon_title),
          coupon_discount_text = COALESCE($7, coupon_discount_text),
          coupon_bottom_text = COALESCE($8, coupon_bottom_text),
          coupon_bottom_subtext = COALESCE($9, coupon_bottom_subtext),
          note_text = COALESCE($10, note_text),
          pre_launch_enabled = COALESCE($11, pre_launch_enabled),
          pre_launch_image_url = COALESCE($12, pre_launch_image_url),
          fab_schedule_enabled = COALESCE($13, fab_schedule_enabled),
          fab_schedule_datetime = COALESCE($14, fab_schedule_datetime),
          updated_at = NOW()
        WHERE id = $15
      `, [
        fabEnabled !== undefined ? fabEnabled : null,
        fabIconUrl !== undefined ? fabIconUrl : null,
        howTo && howTo[0] ? howTo[0] : null,
        howTo && howTo[1] ? howTo[1] : null,
        howTo && howTo[2] ? howTo[2] : null,
        couponTitle || null,
        couponDiscountText || null,
        couponBottomText || null,
        couponBottomSubtext || null,
        noteText || null,
        preLaunchEnabled !== undefined ? preLaunchEnabled : null,
        preLaunchImageUrl !== undefined ? preLaunchImageUrl : null,
        fabScheduleEnabled !== undefined ? fabScheduleEnabled : null,
        fabScheduleDateTime || null,
        existing.rows[0].id
      ]);
    }

    console.log(`✅ [coupon/config] Configuração atualizada com sucesso`);

    res.json({
      success: true,
      message: 'Configuração de cupons atualizada com sucesso'
    });
  } catch (error) {
    console.error('❌ [coupon/config] Erro:', error);
    res.status(500).json({ error: 'Erro ao atualizar configuração de cupons' });
  }
});

// GET /api/coupon/stats - Obter estatísticas de cupons (apenas admin)
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    console.log(`🎫 [coupon/stats] Admin ${req.user.id} buscando estatísticas de cupons`);

    // Contar total de cupons usados
    const totalUsedResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM melhor_casas_daily_coupons
      WHERE used = true
    `);

    // Contar cupons usados hoje
    const today = getServerDate();
    const todayUsedResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM melhor_casas_daily_coupons
      WHERE used = true AND date = $1
    `, [today]);

    // Contar cupons usados nos últimos 7 dias (no horário do Brasil)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const sevenDaysAgoDate = getBrazilDateString(sevenDaysAgo);
    
    const last7DaysResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM melhor_casas_daily_coupons
      WHERE used = true AND date >= $1
    `, [sevenDaysAgoDate]);

    // Contar cupons usados nos últimos 30 dias (no horário do Brasil)
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgoDate = getBrazilDateString(thirtyDaysAgo);
    
    const last30DaysResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM melhor_casas_daily_coupons
      WHERE used = true AND date >= $1
    `, [thirtyDaysAgoDate]);

    // Contar clientes que usaram o cupom mais de uma vez (em dias diferentes)
    const repeatUsersResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM (
        SELECT user_id
        FROM melhor_casas_daily_coupons
        WHERE used = true
        GROUP BY user_id
        HAVING COUNT(*) > 1
      ) t
    `);

    // Contar cliques no FAB dos últimos 30 dias (eventos 'fab_click' em analytics_events)
    const fabClicks30DaysResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM analytics_events
      WHERE event_name = 'fab_click'
        AND created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '30 days')
    `);

    res.json({
      totalUsed: parseInt(totalUsedResult.rows[0]?.total || 0),
      todayUsed: parseInt(todayUsedResult.rows[0]?.total || 0),
      last7DaysUsed: parseInt(last7DaysResult.rows[0]?.total || 0),
      last30DaysUsed: parseInt(last30DaysResult.rows[0]?.total || 0),
      repeatUsers: parseInt(repeatUsersResult.rows[0]?.total || 0),
      fabClicksLast30Days: parseInt(fabClicks30DaysResult.rows[0]?.total || 0),
    });
  } catch (error) {
    console.error('❌ [coupon/stats] Erro:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas de cupons' });
  }
});

// GET /api/coupon/daily - Estatísticas diárias de cupons usados (apenas admin)
router.get('/daily', authenticateAdmin, async (req, res) => {
  try {
    const daysParam = parseInt(req.query.days, 10);
    const days = Number.isNaN(daysParam) || daysParam <= 0 ? 30 : daysParam;

    const now = new Date();
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    const startDateBrazil = getBrazilDateString(startDate);

    const result = await pool.query(
      `
      SELECT date, COUNT(*) AS used
      FROM melhor_casas_daily_coupons
      WHERE used = true
        AND date >= $1
      GROUP BY date
      ORDER BY date ASC
      `,
      [startDateBrazil]
    );

    res.json({
      ok: true,
      days,
      daily: result.rows.map(row => ({
        date: row.date,
        used: parseInt(row.used || 0, 10),
      })),
    });
  } catch (error) {
    console.error('❌ [coupon/daily] Erro:', error);
    res.status(500).json({ error: 'Erro ao obter série diária de cupons' });
  }
});

module.exports = router;
