const { Pool } = require('pg');

// Configurações diretas
const pool = new Pool({
  host: 'dpg-d3sh31qli9vc73fqt6t0-a.virginia-postgres.render.com',
  port: 5432,
  database: 'estoqueapp_7p6x',
  user: 'estoqueapp_7p6x_user',
  password: 'Bhd10ADnSHGEsdJlA4kWVkBPryLg3Fqx',
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const createTables = async () => {
  try {
    console.log('🔄 Criando tabelas do Melhor das Casas com prefixo...');
    
    // Users table com prefixo
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
    console.log('✅ Tabela melhor_casas_users criada');

    // Products table com prefixo
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_products (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE NOT NULL,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        preco_varejo DECIMAL(10,2) NOT NULL,
        preco_atacado DECIMAL(10,2) NOT NULL,
        quantidade_minima_atacado INTEGER DEFAULT 2,
        categoria VARCHAR(100),
        estoque INTEGER DEFAULT 0,
        imagem_url VARCHAR(500),
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela melhor_casas_products criada');

    // Orders table com prefixo
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pendente',
        tipo_preco_aplicado VARCHAR(20) DEFAULT 'varejo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela melhor_casas_orders criada');

    // Order items table com prefixo
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES melhor_casas_orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES melhor_casas_products(id) ON DELETE CASCADE,
        quantidade INTEGER NOT NULL,
        preco_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela melhor_casas_order_items criada');

    // User favorites table com prefixo
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES melhor_casas_products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);
    console.log('✅ Tabela melhor_casas_user_favorites criada');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_customer_reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES melhor_casas_products(id) ON DELETE SET NULL,
        product_code VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        feedback TEXT,
        photos JSONB NOT NULL DEFAULT '[]'::JSONB,
        status VARCHAR(50) NOT NULL DEFAULT 'pendente',
        source VARCHAR(50) NOT NULL DEFAULT 'app',
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela melhor_casas_customer_reviews criada');

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_users_cpf_cnpj ON melhor_casas_users(cpf_cnpj)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_products_codigo ON melhor_casas_products(codigo)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_products_categoria ON melhor_casas_products(categoria)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_orders_user_id ON melhor_casas_orders(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_customer_reviews_status ON melhor_casas_customer_reviews(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_customer_reviews_product ON melhor_casas_customer_reviews(product_id)');
    console.log('✅ Índices criados');

    console.log('🎉 Todas as tabelas foram criadas com sucesso!');
    console.log('📋 Tabelas criadas:');
    console.log('   - melhor_casas_users');
    console.log('   - melhor_casas_products');
    console.log('   - melhor_casas_orders');
    console.log('   - melhor_casas_order_items');
    console.log('   - melhor_casas_user_favorites');
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  }
};

const runMigrations = async () => {
  try {
    await createTables();
    console.log('🎉 Migração concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Migração falhou:', error);
    process.exit(1);
  }
};

runMigrations();





