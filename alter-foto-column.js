const pool = require('./src/database/connection');

async function alterFotoUrlColumn() {
  try {
    console.log('🔄 Alterando coluna foto_url para TEXT...');
    
    // Alterar tipo da coluna para TEXT para suportar Base64
    await pool.query(`
      ALTER TABLE melhor_casas_users 
      ALTER COLUMN foto_url TYPE TEXT;
    `);
    
    console.log('✅ Coluna foto_url alterada para TEXT com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao alterar coluna:', error.message);
  } finally {
    process.exit();
  }
}

alterFotoUrlColumn();
