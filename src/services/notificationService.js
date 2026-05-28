const { Expo } = require('expo-server-sdk');
const pool = require('../database/connection');

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

const registerToken = async ({ token, userId, deviceId, platform, locale, appVersion, isStandalone = false }) => {
  console.log('[notificationService] registerToken chamado:', { 
    token: token?.substring(0, 20) + '...', 
    userId, 
    platform,
    deviceId,
    locale,
    appVersion,
    isStandalone 
  });

  if (!Expo.isExpoPushToken(token)) {
    throw new Error('Token push inválido');
  }

  // userId é obrigatório, mas pode vir do JWT (já extraído no middleware)
  // Se não tiver userId aqui, significa que o middleware não extraiu corretamente
  if (!userId) {
    console.error('[notificationService] ❌ userId não fornecido - token não pode ser registrado');
    throw new Error('userId é obrigatório para registrar token');
  }

  // Garantir que a coluna is_standalone existe
  await ensureStandaloneColumn();

  // Inserir ou atualizar token
  // Reatribuir o token para o novo usuário quando fizer login/registro no mesmo dispositivo
  console.log('[notificationService] 💾 Salvando token no banco:', {
    userId,
    token: token?.substring(0, 20) + '...',
    platform,
    isStandalone
  });
  
  const { rows } = await pool.query(
    `
      INSERT INTO push_subscriptions (user_id, device_id, expo_push_token, platform, locale, app_version, is_standalone, last_used_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (expo_push_token)
      DO UPDATE SET
        -- Sempre associar o token ao usuário logado (permite reuso no mesmo aparelho)
        user_id = EXCLUDED.user_id,
        device_id = EXCLUDED.device_id,
        platform = EXCLUDED.platform,
        locale = EXCLUDED.locale,
        app_version = EXCLUDED.app_version,
        is_standalone = CASE
          WHEN EXCLUDED.is_standalone = true THEN true
          WHEN push_subscriptions.is_standalone = false AND EXCLUDED.is_standalone = true THEN true
          ELSE COALESCE(push_subscriptions.is_standalone, EXCLUDED.is_standalone, false)
        END,
        last_used_at = NOW()
      RETURNING *
    `,
    [userId, deviceId || null, token, platform || null, locale || null, appVersion || null, isStandalone || false]
  );
  
  console.log('[notificationService] 💾 Token salvo no banco:', {
    id: rows[0]?.id,
    user_id: rows[0]?.user_id,
    platform: rows[0]?.platform
  });

  console.log('[notificationService] ✅ Token registrado com sucesso:', { 
    id: rows[0].id, 
    platform: rows[0].platform,
    isStandalone: rows[0].is_standalone,
    userId: rows[0].user_id
  });

  return rows[0];
};

// Função auxiliar para garantir que a coluna is_standalone existe
let standaloneColumnChecked = false;
const ensureStandaloneColumn = async () => {
  if (standaloneColumnChecked) return;
  
  try {
    // Verificar se a coluna existe
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'push_subscriptions' 
      AND column_name = 'is_standalone'
    `);
    
    if (checkResult.rows.length === 0) {
      console.log('[notificationService] Criando coluna is_standalone...');
      await pool.query(`
        ALTER TABLE push_subscriptions 
        ADD COLUMN is_standalone BOOLEAN DEFAULT false
      `);
      console.log('[notificationService] ✅ Coluna is_standalone criada');
    } else {
      console.log('[notificationService] ✅ Coluna is_standalone já existe');
    }
    standaloneColumnChecked = true;
  } catch (error) {
    console.error('[notificationService] Erro ao verificar/criar coluna is_standalone:', error.message);
    // Continuar mesmo se houver erro (usaremos COALESCE nas queries)
  }
};

const fetchTokens = async ({ userIds, tokens, standaloneOnly = true }) => {
  console.log('[notificationService] fetchTokens chamado:', { userIds, tokensCount: tokens?.length, standaloneOnly });
  
  // Garantir que a coluna is_standalone existe
  await ensureStandaloneColumn();
  
  if (Array.isArray(tokens) && tokens.length > 0) {
    console.log('[notificationService] Usando tokens fornecidos:', tokens.length);
    return tokens;
  }
  if (Array.isArray(userIds) && userIds.length > 0) {
    console.log('[notificationService] Buscando tokens para userIds:', userIds);
    const result = await pool.query(
      `
        SELECT expo_push_token, COALESCE(is_standalone, false) as is_standalone, platform
        FROM push_subscriptions
        WHERE user_id = ANY($1)
        ${standaloneOnly ? "AND (is_standalone = true OR is_standalone IS NULL)" : ''}
      `,
      [userIds]
    );
    console.log('[notificationService] Tokens encontrados para userIds:', result.rows.length);
    result.rows.forEach((row, idx) => {
      console.log(`[notificationService] Token ${idx + 1}:`, {
        token: row.expo_push_token?.substring(0, 20) + '...',
        isStandalone: row.is_standalone,
        platform: row.platform
      });
    });
    const validTokens = result.rows
      .map((row) => row.expo_push_token)
      .filter(token => token && Expo.isExpoPushToken(token));
    console.log('[notificationService] Tokens válidos:', validTokens.length);
    return validTokens;
  }
  // Buscar todos os tokens (sem filtro de 90 dias) para alinhar com a contagem "Inscrições totais" do dashboard
  console.log('[notificationService] Buscando todos os tokens (todos os registros)');
  const result = await pool.query(
    `
      SELECT expo_push_token, COALESCE(is_standalone, false) as is_standalone, platform
      FROM push_subscriptions
      WHERE expo_push_token IS NOT NULL AND expo_push_token != ''
      ${standaloneOnly ? "AND (is_standalone = true OR (platform IN ('iOS', 'Android') AND (is_standalone IS NULL OR is_standalone != false)))" : ''}
    `
  );
  console.log('[notificationService] Total de tokens encontrados:', result.rows.length);
  result.rows.forEach((row, idx) => {
    if (idx < 5) { // Log apenas os primeiros 5 para não poluir
      console.log(`[notificationService] Token ${idx + 1}:`, {
        token: row.expo_push_token?.substring(0, 20) + '...',
        isStandalone: row.is_standalone,
        platform: row.platform
      });
    }
  });
  console.log('[notificationService] Total de tokens encontrados:', result.rows.length);
  const validTokens = result.rows
    .map((row) => row.expo_push_token)
    .filter(token => token && Expo.isExpoPushToken(token));
  console.log('[notificationService] Tokens válidos:', validTokens.length);
  return validTokens;
};

const sendNotification = async ({ title, body, data, userIds, tokens, createdBy, standaloneOnly = true }) => {
  console.log('[notificationService] sendNotification chamado:', { title, body, userIds, tokensCount: tokens?.length, standaloneOnly });
  
  const targetTokens = await fetchTokens({ userIds, tokens, standaloneOnly });
  console.log('[notificationService] Tokens alvo encontrados:', targetTokens.length);
  
  if (targetTokens.length === 0) {
    console.warn('[notificationService] ⚠️ Nenhum token encontrado para enviar notificação');
    return { 
      summary: { requested: 0, success: 0, errors: 0 },
      message: 'Nenhum token encontrado para enviar notificação'
    };
  }

  const validTokens = targetTokens.filter((token) => Expo.isExpoPushToken(token));
  console.log('[notificationService] Tokens válidos (Expo):', validTokens.length);
  
  if (validTokens.length === 0) {
    console.warn('[notificationService] ⚠️ Nenhum token válido do Expo encontrado');
    return {
      summary: { requested: targetTokens.length, success: 0, errors: targetTokens.length },
      message: 'Nenhum token válido do Expo encontrado'
    };
  }

  const messages = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: data || {},
    badge: 1,
    priority: 'high',
    channelId: 'default',
  }));

  console.log('[notificationService] Preparando', messages.length, 'mensagens para envio');

  const chunks = expo.chunkPushNotifications(messages);
  console.log('[notificationService] Mensagens divididas em', chunks.length, 'chunks');

  let successCount = 0;
  let errorCount = 0;
  const receipts = [];
  const errors = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[notificationService] Enviando chunk ${i + 1}/${chunks.length} com ${chunk.length} mensagens`);
    
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      receipts.push(...ticketChunk);
      
      ticketChunk.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          successCount++;
        } else if (ticket.status === 'error') {
          errorCount++;
          errors.push({
            token: chunk[idx].to,
            error: ticket.message || ticket.details?.error || 'Erro desconhecido',
            details: ticket.details
          });
          console.error(`[notificationService] ❌ Erro no ticket ${idx}:`, ticket.message || ticket.details);
        }
      });
      
      console.log(`[notificationService] Chunk ${i + 1} processado: ${ticketChunk.filter(t => t.status === 'ok').length} sucesso, ${ticketChunk.filter(t => t.status === 'error').length} erros`);
    } catch (error) {
      console.error(`[notificationService] ❌ Erro ao enviar push chunk ${i + 1}:`, error.message, error.stack);
      errorCount += chunk.length;
      errors.push({
        chunk: i + 1,
        error: error.message,
        stack: error.stack
      });
    }
  }

  console.log('[notificationService] Resumo final:', {
    requested: validTokens.length,
    success: successCount,
    errors: errorCount,
    errorsDetails: errors
  });

  await pool.query(
    `
      INSERT INTO notification_logs (title, body, data, target_count, success_count, error_count, created_by)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
    `,
    [title, body, JSON.stringify(data || {}), validTokens.length, successCount, errorCount, createdBy || 'dashboard']
  );

  return {
    summary: {
      requested: validTokens.length,
      success: successCount,
      errors: errorCount,
    },
    receipts,
    errors: errors.length > 0 ? errors : undefined,
  };
};

const listLogs = async (limit = 50) => {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM notification_logs
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return rows;
};

module.exports = {
  registerToken,
  sendNotification,
  listLogs,
};





