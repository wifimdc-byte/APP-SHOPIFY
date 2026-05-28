const { Pool } = require('pg');
require('dotenv').config();

// Suportar DATABASE_URL (Internal Database URL do Render) ou configuração individual
let poolConfig;

if (process.env.DATABASE_URL) {
  // Usar DATABASE_URL se disponível (Internal Database URL do Render)
  console.log('📊 Usando DATABASE_URL para conexão com banco de dados');
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
  };
} else {
  // Fallback para configuração individual
  console.log('📊 Usando configuração individual (DB_HOST, DB_PORT, etc.)');
  poolConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool({
  ...poolConfig,
  // Aumentar pool para suportar mais requisições simultâneas
  max: parseInt(process.env.DB_POOL_MAX) || 50, // Aumentado de 20 para 50
  min: parseInt(process.env.DB_POOL_MIN) || 10, // Aumentado de 5 para 10
  idleTimeoutMillis: 30000, // Fechar conexões idle após 30s
  connectionTimeoutMillis: 10000, // Aumentado para 10s para evitar timeouts
  statement_timeout: 30000, // Timeout de queries em 30s
  query_timeout: 30000,
  allowExitOnIdle: false, // Não fechar pool quando não há conexões ativas
  // Configurações adicionais para melhor performance
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Test connection
pool.on('connect', () => {
  console.log('📊 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Monitorar uso do pool (para debug)
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    console.log(`📊 [DB Pool] Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
  }, 30000); // A cada 30 segundos
}

// Wrapper para queries com retry automático em caso de pool esgotado
const queryWithRetry = async (text, params, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      // Se for erro de pool esgotado, aguardar e tentar novamente
      if (error.code === '57P01' || error.message.includes('timeout') || error.message.includes('connection')) {
        if (i < retries - 1) {
          const waitTime = (i + 1) * 100; // 100ms, 200ms, 300ms
          console.warn(`⚠️ [DB Pool] Erro de conexão, tentando novamente em ${waitTime}ms... (tentativa ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      throw error;
    }
  }
};

// Exportar pool como padrão, mas também adicionar queryWithRetry
const exportedPool = pool;
exportedPool.queryWithRetry = queryWithRetry;
module.exports = exportedPool;
// Também exportar queryWithRetry diretamente para facilitar importação
module.exports.queryWithRetry = queryWithRetry;
