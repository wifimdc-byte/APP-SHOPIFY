const pool = require('./src/database/connection');

async function addColumn() {
  try {
    await pool.query(`
      ALTER TABLE melhor_casas_products 
      ADD COLUMN IF NOT EXISTS preco_exclusivo DECIMAL(10,2)
    `);
    console.log('✅ Coluna preco_exclusivo verificada/criada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

addColumn();


