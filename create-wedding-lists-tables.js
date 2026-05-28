const pool = require('./src/database/connection');

const createWeddingListsTables = async () => {
  try {
    console.log('🔄 Criando tabelas de listas de casamento...');

    // Tabela principal de listas de casamento
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_wedding_lists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        foto_capa_url TEXT,
        data_evento DATE,
        codigo_compartilhamento VARCHAR(50) UNIQUE,
        publica BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de itens das listas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_wedding_list_items (
        id SERIAL PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES melhor_casas_wedding_lists(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES melhor_casas_products(id) ON DELETE CASCADE,
        quantidade_desejada INTEGER NOT NULL DEFAULT 1 CHECK (quantidade_desejada > 0),
        quantidade_comprada INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_comprada >= 0),
        prioridade VARCHAR(20) DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
        observacoes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(list_id, product_id)
      )
    `);

    // Tabela de compras registradas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_wedding_list_purchases (
        id SERIAL PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES melhor_casas_wedding_lists(id) ON DELETE CASCADE,
        list_item_id INTEGER NOT NULL REFERENCES melhor_casas_wedding_list_items(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES melhor_casas_orders(id) ON DELETE SET NULL,
        user_id INTEGER NOT NULL REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
        quantidade_comprada INTEGER NOT NULL CHECK (quantidade_comprada > 0),
        mensagem_comprador TEXT,
        comprado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de convidados (opcional - para controle futuro)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_wedding_list_guests (
        id SERIAL PRIMARY KEY,
        list_id INTEGER NOT NULL REFERENCES melhor_casas_wedding_lists(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE SET NULL,
        nome_convidado VARCHAR(255) NOT NULL,
        email_convidado VARCHAR(255),
        acesso_direto BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(list_id, email_convidado)
      )
    `);

    // Criar índices para melhor performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_lists_user_id ON melhor_casas_wedding_lists(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_lists_codigo ON melhor_casas_wedding_lists(codigo_compartilhamento)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_list_items_list_id ON melhor_casas_wedding_list_items(list_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_list_items_product_id ON melhor_casas_wedding_list_items(product_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_list_purchases_list_id ON melhor_casas_wedding_list_purchases(list_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_list_purchases_item_id ON melhor_casas_wedding_list_purchases(list_item_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_list_purchases_order_id ON melhor_casas_wedding_list_purchases(order_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_wedding_list_guests_list_id ON melhor_casas_wedding_list_guests(list_id)');

    console.log('✅ Tabelas de listas de casamento criadas com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar tabelas de listas de casamento:', error);
    process.exit(1);
  }
};

createWeddingListsTables();
