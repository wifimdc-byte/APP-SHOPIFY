const pool = require('./src/database/connection');

async function addCPFColumn() {
  try {
    console.log('🔄 Adicionando coluna CPF na tabela de endereços...');
    
    // Verificar se a coluna já existe
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_user_addresses' 
      AND column_name = 'cpf'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Coluna CPF já existe na tabela');
      process.exit(0);
      return;
    }
    
    // Adicionar coluna CPF
    await pool.query(`
      ALTER TABLE melhor_casas_user_addresses 
      ADD COLUMN cpf VARCHAR(20)
    `);
    
    console.log('✅ Coluna CPF adicionada com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao adicionar coluna CPF:', error);
    process.exit(1);
  }
}

addCPFColumn();

