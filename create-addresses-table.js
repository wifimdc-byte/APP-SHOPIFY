const pool = require('./src/database/connection');

async function createAddressesTable() {
  try {
    console.log('🔄 Criando tabela de endereços...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        nome VARCHAR(255) NOT NULL,
        telefone VARCHAR(20),
        cep VARCHAR(10) NOT NULL,
        endereco VARCHAR(255) NOT NULL,
        numero VARCHAR(20) NOT NULL,
        complemento VARCHAR(255),
        bairro VARCHAR(100) NOT NULL,
        cidade VARCHAR(100) NOT NULL,
        estado VARCHAR(2) NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON melhor_casas_user_addresses(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON melhor_casas_user_addresses(user_id, is_default)');
    
    console.log('✅ Tabela melhor_casas_user_addresses criada com sucesso!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

createAddressesTable();


