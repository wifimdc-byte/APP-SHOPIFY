const pool = require('./src/database/connection');

async function checkTables() {
  try {
    console.log('🔍 Verificando tabelas no banco de dados...\n');
    
    // Verificar se a tabela melhor_casas_users existe
    const usersTable = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'melhor_casas_users'
    `);
    
    if (usersTable.rows.length === 0) {
      console.log('❌ Tabela melhor_casas_users NÃO existe!');
      console.log('📋 Criando tabela...\n');
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS melhor_casas_users (
          id SERIAL PRIMARY KEY,
          cpf_cnpj VARCHAR(20) UNIQUE NOT NULL,
          nome VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          telefone VARCHAR(20),
          senha_hash VARCHAR(255) NOT NULL,
          tipo_documento VARCHAR(10) NOT NULL CHECK (tipo_documento IN ('CPF', 'CNPJ')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('✅ Tabela melhor_casas_users criada com sucesso!');
    } else {
      console.log('✅ Tabela melhor_casas_users existe');
    }
    
    // Verificar outras tabelas importantes
    const tables = ['melhor_casas_products', 'melhor_casas_orders', 'melhor_casas_order_items'];
    
    for (const tableName of tables) {
      const result = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      `, [tableName]);
      
      if (result.rows.length > 0) {
        console.log(`✅ Tabela ${tableName} existe`);
      } else {
        console.log(`⚠️  Tabela ${tableName} NÃO existe`);
      }
    }
    
    console.log('\n🎉 Verificação concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

checkTables();


