const pool = require('./src/database/connection');

const createTables = async () => {
  try {
    console.log('🔄 Criando tabelas principais usando configuração atual do banco...');

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_products (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE NOT NULL,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        preco_varejo DECIMAL(10,2) NOT NULL DEFAULT 0,
        preco_atacado DECIMAL(10,2) NOT NULL DEFAULT 0,
        preco_exclusivo DECIMAL(10,2),
        quantidade_minima_atacado INTEGER DEFAULT 2,
        categoria VARCHAR(100),
        estoque INTEGER DEFAULT 0,
        imagem_url VARCHAR(500),
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pendente',
        tipo_preco_aplicado VARCHAR(20) DEFAULT 'varejo',
        shopify_order_id VARCHAR(64),
        shopify_order_number VARCHAR(64),
        shopify_order_name VARCHAR(64),
        currency VARCHAR(10) DEFAULT 'BRL',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES melhor_casas_orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES melhor_casas_products(id) ON DELETE CASCADE,
        quantidade INTEGER NOT NULL,
        preco_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        product_name TEXT,
        product_sku VARCHAR(100),
        imagem_url TEXT,
        discount_label TEXT,
        discount_amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE melhor_casas_orders
      ADD COLUMN IF NOT EXISTS shopify_order_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS shopify_order_number VARCHAR(64),
      ADD COLUMN IF NOT EXISTS shopify_order_name VARCHAR(64),
      ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'BRL'
    `);

    await pool.query(`
      ALTER TABLE melhor_casas_order_items
      ADD COLUMN IF NOT EXISTS product_name TEXT,
      ADD COLUMN IF NOT EXISTS product_sku VARCHAR(100),
      ADD COLUMN IF NOT EXISTS imagem_url TEXT,
      ADD COLUMN IF NOT EXISTS discount_label TEXT,
      ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES melhor_casas_products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

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

    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_customer_reviews_status ON melhor_casas_customer_reviews(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_customer_reviews_product ON melhor_casas_customer_reviews(product_id)');

    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_users_cpf_cnpj ON melhor_casas_users(cpf_cnpj)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_products_codigo ON melhor_casas_products(codigo)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_melhor_casas_orders_user_id ON melhor_casas_orders(user_id)');

    console.log('🎉 Tabelas criadas/garantidas com sucesso no banco configurado!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar tabelas no banco configurado:', error);
    process.exit(1);
  }
};

createTables();

