// Script para adicionar coluna foto_url na tabela de usuários
const pool = require('./src/database/connection');

async function addProfilePhotoColumn() {
  try {
    console.log('🔄 Adicionando coluna foto_url na tabela melhor_casas_users...');
    
    // Verificar se a coluna já existe
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_users' 
      AND column_name = 'foto_url'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ Coluna foto_url já existe na tabela melhor_casas_users');
      await pool.end();
      process.exit(0);
    }
    
    // Adicionar coluna foto_url
    await pool.query(`
      ALTER TABLE melhor_casas_users 
      ADD COLUMN foto_url VARCHAR(500) NULL
    `);
    
    console.log('✅ Coluna foto_url adicionada com sucesso!');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao adicionar coluna:', error);
    process.exit(1);
  }
}

addProfilePhotoColumn();





