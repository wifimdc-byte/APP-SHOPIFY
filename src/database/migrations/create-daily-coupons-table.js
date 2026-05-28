const pool = require('../connection');

const createDailyCouponsTable = async () => {
  try {
    console.log('🔄 Criando tabela melhor_casas_daily_coupons...');

    // Criar tabela de cupons diários
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_daily_coupons (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        used BOOLEAN DEFAULT false,
        used_at TIMESTAMP,
        discount_value DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )
    `);

    // Criar índice para melhor performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_coupons_user_date 
      ON melhor_casas_daily_coupons(user_id, date)
    `);

    console.log('✅ Tabela melhor_casas_daily_coupons criada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao criar tabela melhor_casas_daily_coupons:', error);
    throw error;
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  createDailyCouponsTable()
    .then(() => {
      console.log('✅ Migration concluída!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na migration:', error);
      process.exit(1);
    });
}

module.exports = createDailyCouponsTable;
