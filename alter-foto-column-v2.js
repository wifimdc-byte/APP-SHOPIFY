const pool = require('./src/database/connection');

async function alterFotoUrlColumn() {
  try {
    console.log('🔄 Verificando tipo da coluna foto_url...');
    
    const check = await pool.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_users' AND column_name = 'foto_url'
    `);
    
    if (check.rows.length > 0) {
      console.log('📊 Tipo atual:', check.rows[0].data_type);
    } else {
      console.log('⚠️ Coluna não encontrada!');
    }

    console.log('🔄 Tentando alterar para TEXT...');
    await pool.query(`
      ALTER TABLE melhor_casas_users 
      ALTER COLUMN foto_url TYPE TEXT;
    `);
    
    console.log('✅ SUCESSO: Coluna foto_url alterada para TEXT!');
  } catch (error) {
    console.error('❌ ERRO FATAL:', error);
  } finally {
    // Forçar exit
    setTimeout(() => process.exit(), 1000);
  }
}

alterFotoUrlColumn();
