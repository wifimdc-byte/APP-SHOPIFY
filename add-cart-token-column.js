const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Usar a mesma configuração de conexão do código principal
let poolConfig;

if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool(poolConfig);

async function addCartTokenColumn() {
  try {
    console.log('🔄 Adicionando coluna cart_token à tabela melhor_casas_pending_checkouts...');
    
    // Verificar se a coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_pending_checkouts' 
      AND column_name = 'cart_token'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna cart_token já existe');
      return;
    }
    
    // Adicionar coluna cart_token
    await pool.query(`
      ALTER TABLE melhor_casas_pending_checkouts 
      ADD COLUMN cart_token VARCHAR(255)
    `);
    
    console.log('✅ Coluna cart_token adicionada com sucesso');
    
    // Criar índice para melhor performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_checkouts_cart_token 
      ON melhor_casas_pending_checkouts(cart_token)
    `);
    
    console.log('✅ Índice criado para cart_token');
    
    // Extrair cart_token dos cart_id existentes e atualizar
    console.log('🔄 Atualizando cart_token dos registros existentes...');
    const updateResult = await pool.query(`
      UPDATE melhor_casas_pending_checkouts
      SET cart_token = SUBSTRING(cart_id FROM '/Cart/([^?]+)')
      WHERE cart_token IS NULL 
      AND cart_id LIKE '%/Cart/%'
    `);
    
    console.log(`✅ ${updateResult.rowCount} registros atualizados`);
    
  } catch (error) {
    console.error('❌ Erro ao adicionar coluna cart_token:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addCartTokenColumn()
  .then(() => {
    console.log('✅ Migração concluída');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  });
