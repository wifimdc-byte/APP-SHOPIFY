const pool = require('./src/database/connection');

async function createFavoritesTable() {
  try {
    console.log('🔧 Criando tabela melhor_casas_user_favorites...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES melhor_casas_products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Criar índices
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_melhor_casas_user_favorites_user_id 
      ON melhor_casas_user_favorites(user_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_melhor_casas_user_favorites_product_id 
      ON melhor_casas_user_favorites(product_id)
    `);

    console.log('✅ Tabela melhor_casas_user_favorites criada com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

createFavoritesTable();


