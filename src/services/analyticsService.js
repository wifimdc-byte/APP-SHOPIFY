const pool = require('../database/connection');

const normalizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  return metadata;
};

const logEvent = async ({ eventName, userId, userEmail, userName, sessionId, deviceId, source, metadata, cartValue, productQuantity, productId, checkoutId }) => {
  if (!eventName) {
    throw new Error('eventName é obrigatório');
  }

  const safeMetadata = normalizeMetadata(metadata);
  
  // Se tiver userId mas não tiver userName, buscar do banco
  let finalUserName = userName;
  if (userId && !userName) {
    try {
      const userResult = await pool.query(
        'SELECT nome FROM melhor_casas_users WHERE id = $1',
        [userId]
      );
      if (userResult.rows.length > 0) {
        finalUserName = userResult.rows[0].nome;
      }
    } catch (e) {
      console.error('[analyticsService] Erro ao buscar nome do usuário:', e);
    }
  }
  
  const { rows } = await pool.query(
    `
      INSERT INTO analytics_events (
        event_name, user_id, user_email, user_name, session_id, device_id, source, 
        metadata, cart_value, product_quantity, product_id, checkout_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
      RETURNING *
    `,
    [
      eventName,
      userId || null,
      userEmail || null,
      finalUserName || null,
      sessionId || null,
      deviceId || null,
      source || 'app',
      JSON.stringify(safeMetadata),
      cartValue !== null && cartValue !== undefined && !isNaN(parseFloat(cartValue)) ? parseFloat(cartValue) : null,
      productQuantity || null,
      productId || null,
      checkoutId ? String(checkoutId) : null,
    ]
  );
  
  console.log('[analyticsService] Evento salvo:', {
    eventName,
    userId,
    userEmail,
    userName: finalUserName,
    cartValue: cartValue ? parseFloat(cartValue) : null,
    productQuantity,
    checkoutId,
    created_at: rows[0].created_at,
    created_at_iso: rows[0].created_at ? new Date(rows[0].created_at).toISOString() : null,
  });

  // Upsert sem depender de UNIQUE: evita erro se a tabela não tiver constraint
  const metadataJson = JSON.stringify({ lastSource: source || 'app' });
  const existing = await pool.query(
    'SELECT id, total_count, metadata FROM analytics_daily_metrics WHERE metric_date = CURRENT_DATE AND event_name = $1',
    [eventName]
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const newCount = (row.total_count || 0) + 1;
    const mergedMeta = { ...(row.metadata || {}), ...{ lastSource: source || 'app' } };
    await pool.query(
      'UPDATE analytics_daily_metrics SET total_count = $1, metadata = $2::jsonb, updated_at = NOW() WHERE id = $3',
      [newCount, JSON.stringify(mergedMeta), row.id]
    );
  } else {
    await pool.query(
      'INSERT INTO analytics_daily_metrics (metric_date, event_name, total_count, metadata) VALUES (CURRENT_DATE, $1, 1, $2::jsonb)',
      [eventName, metadataJson]
    );
  }

  return rows[0];
};

const getSummary = async ({ startDate, endDate }) => {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  console.log('[analyticsService] getSummary chamado:', {
    startDateRaw: startDate,
    endDateRaw: endDate,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  });

  // Verificar quantos eventos existem no total e no período
  const totalEventsResult = await pool.query('SELECT COUNT(*) as total FROM analytics_events');
  const periodEventsResult = await pool.query(
    'SELECT COUNT(*) as total FROM analytics_events WHERE created_at >= $1 AND created_at <= $2',
    [start, end]
  );
  
  console.log('[analyticsService] Contagem de eventos:', {
    totalNoBanco: totalEventsResult.rows[0].total,
    totalNoPeriodo: periodEventsResult.rows[0].total,
  });

  // Usar >= e <= explicitamente para evitar problemas com BETWEEN e timezone
  const result = await pool.query(
    `
      SELECT event_name, COUNT(*) as total
      FROM analytics_events
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY event_name
      ORDER BY total DESC
    `,
    [start, end]
  );

  console.log('[analyticsService] getSummary resultado:', {
    totalRows: result.rows.length,
    events: result.rows.map(r => ({ eventName: r.event_name, total: Number(r.total) })),
  });
  
  // Buscar alguns eventos de exemplo para debug
  const sampleEvents = await pool.query(
    'SELECT event_name, created_at FROM analytics_events ORDER BY created_at DESC LIMIT 5'
  );
  console.log('[analyticsService] Últimos 5 eventos no banco:', sampleEvents.rows.map(r => ({
    eventName: r.event_name,
    created_at: r.created_at,
  })));

  return result.rows.map((row) => ({
    eventName: row.event_name,
    total: Number(row.total),
  }));
};

const getDailySeries = async ({ startDate, endDate, eventNames }) => {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  const params = [start, end];
  let eventFilter = '';
  if (Array.isArray(eventNames) && eventNames.length > 0) {
    params.push(eventNames);
    eventFilter = `AND event_name = ANY($3)`;
  }

  const result = await pool.query(
    `
      SELECT metric_date, event_name, total_count
      FROM analytics_daily_metrics
      WHERE metric_date BETWEEN $1 AND $2
      ${eventFilter}
      ORDER BY metric_date ASC
    `,
    params
  );

  return result.rows.map((row) => ({
    date: row.metric_date,
    eventName: row.event_name,
    total: Number(row.total_count),
  }));
};

const getDetailedEvents = async ({ startDate, endDate, eventName, limit = 100, offset = 0 }) => {
  // Usar data atual e subtrair 30 dias, garantindo que pegue eventos de hoje
  const now = new Date();
  let start, end;
  
  if (startDate) {
    start = new Date(startDate);
  } else {
    // Últimos 30 dias por padrão
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  if (endDate) {
    end = new Date(endDate);
  } else {
    // Até o final do dia de hoje (23:59:59.999)
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  }
  
  let queryParams = [start, end];
  let eventFilter = '';
  let limitOffsetIndex = 3;
  
  if (eventName) {
    queryParams.push(eventName);
    eventFilter = `AND event_name = $3`;
    limitOffsetIndex = 4;
  }
  
  queryParams.push(limit, offset);

  console.log('[getDetailedEvents] Buscando eventos:', {
    start: start.toISOString(),
    end: end.toISOString(),
    eventName,
    limit,
    offset,
  });

  const result = await pool.query(
    `
      SELECT 
        id, event_name, user_id, user_email, user_name, cart_value, product_quantity, product_id, checkout_id,
        session_id, device_id, source, metadata, created_at
      FROM analytics_events
      WHERE created_at >= $1 AND created_at <= $2
      ${eventFilter}
      ORDER BY created_at DESC
      LIMIT $${limitOffsetIndex} OFFSET $${limitOffsetIndex + 1}
    `,
    queryParams
  );
  
  console.log('[getDetailedEvents] Eventos encontrados:', result.rows.length);

  const countParams = eventName ? [start, end, eventName] : [start, end];
  const countFilter = eventName ? `AND event_name = $3` : '';
  
  const countResult = await pool.query(
    `
      SELECT COUNT(*) as total
      FROM analytics_events
      WHERE created_at BETWEEN $1 AND $2
      ${countFilter}
    `,
    countParams
  );

  return {
    events: result.rows.map((row) => ({
      id: row.id,
      eventName: row.event_name,
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_name,
      cartValue: row.cart_value ? Number(row.cart_value) : null,
      productQuantity: row.product_quantity,
      productId: row.product_id,
      checkoutId: row.checkout_id,
      sessionId: row.session_id,
      deviceId: row.device_id,
      source: row.source,
      metadata: row.metadata,
      createdAt: row.created_at,
    })),
    total: Number(countResult.rows[0].total),
    limit,
    offset,
  };
};

module.exports = {
  logEvent,
  getSummary,
  getDailySeries,
  getDetailedEvents,
};


