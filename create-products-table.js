const pool = require('./src/database/connection');

async function createProductsTable() {
  try {
    console.log('🔄 Verificando/criando tabela melhor_casas_products...');
    
    // Verificar se a tabela existe
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'melhor_casas_products'
    `);
    
    if (tableCheck.rows.length > 0) {
      console.log('✅ Tabela melhor_casas_products já existe');
      
      // Verificar se tem a coluna disponivel
      const colCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'melhor_casas_products' 
        AND column_name = 'disponivel'
      `);
      
      if (colCheck.rows.length === 0) {
        console.log('📋 Adicionando coluna "disponivel"...');
        await pool.query(`
          ALTER TABLE melhor_casas_products 
          ADD COLUMN disponivel BOOLEAN DEFAULT true
        `);
        console.log('✅ Coluna "disponivel" adicionada!');
      }
      
      return;
    }
    
    // Criar tabela se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_products (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE NOT NULL,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        preco_varejo DECIMAL(10,2) NOT NULL,
        preco_atacado DECIMAL(10,2) NOT NULL,
        preco_exclusivo DECIMAL(10,2),
        quantidade_minima_atacado INTEGER DEFAULT 2,
        categoria VARCHAR(100),
        estoque INTEGER DEFAULT 0,
        imagem_url VARCHAR(500),
        disponivel BOOLEAN DEFAULT true,
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Tabela melhor_casas_products criada com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

createProductsTable();


