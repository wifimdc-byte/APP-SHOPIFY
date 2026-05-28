const pool = require('./connection-integration');

const createTablesWithPrefix = async () => {
  try {
    // Usar prefixo para evitar conflitos com tabelas existentes
    const prefix = 'melhor_casas_';

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}users (
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

    // Products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}products (
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

    // Orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES ${prefix}users(id) ON DELETE CASCADE,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pendente',
        tipo_preco_aplicado VARCHAR(20) DEFAULT 'varejo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Order items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES ${prefix}orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES ${prefix}products(id) ON DELETE CASCADE,
        quantidade INTEGER NOT NULL,
        preco_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User favorites table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES ${prefix}users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES ${prefix}products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${prefix}customer_reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES ${prefix}products(id) ON DELETE SET NULL,
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

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${prefix}users_cpf_cnpj ON ${prefix}users(cpf_cnpj)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${prefix}products_codigo ON ${prefix}products(codigo)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${prefix}products_categoria ON ${prefix}products(categoria)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${prefix}orders_user_id ON ${prefix}orders(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${prefix}customer_reviews_status ON ${prefix}customer_reviews(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${prefix}customer_reviews_product ON ${prefix}customer_reviews(product_id)`);

    console.log('✅ Tabelas do Melhor das Casas criadas com sucesso');
    console.log(`📋 Prefixo usado: ${prefix}`);
    console.log('📋 Tabelas criadas:');
    console.log(`   - ${prefix}users`);
    console.log(`   - ${prefix}products`);
    console.log(`   - ${prefix}orders`);
    console.log(`   - ${prefix}order_items`);
    console.log(`   - ${prefix}user_favorites`);
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  }
};

const runMigrations = async () => {
  try {
    await createTablesWithPrefix();
    console.log('🎉 Migração de integração concluída com sucesso');
    process.exit(0);
  } catch (error) {
    console.error('💥 Migração falhou:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  runMigrations();
}

module.exports = { createTablesWithPrefix };






