const pool = require('./connection');

const createTables = async () => {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
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
      CREATE TABLE IF NOT EXISTS products (
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
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pendente',
        tipo_preco_aplicado VARCHAR(20) DEFAULT 'varejo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Order items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quantidade INTEGER NOT NULL,
        preco_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User favorites table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      )
    `);

    // Customer reviews table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_reviews (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
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

    // Home templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        active_version_id INTEGER,
        published_at TIMESTAMP,
        created_by VARCHAR(150),
        updated_by VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Home template versions table (stores draft/published payloads)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_template_versions (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES home_templates(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published')),
        payload JSONB NOT NULL DEFAULT '{}'::JSONB,
        notes TEXT,
        created_by VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(template_id, version)
      )
    `);

    // Tie active_version_id FK now that versions table exists (ignore if already exists)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_home_templates_active_version'
        ) THEN
          ALTER TABLE home_templates
            ADD CONSTRAINT fk_home_templates_active_version
            FOREIGN KEY (active_version_id)
            REFERENCES home_template_versions(id)
            ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    // Home sections table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_sections (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES home_templates(id) ON DELETE CASCADE,
        version_id INTEGER REFERENCES home_template_versions(id) ON DELETE CASCADE,
        title VARCHAR(150) NOT NULL,
        section_key VARCHAR(100) NOT NULL,
        section_type VARCHAR(50) NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::JSONB,
        position INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(template_id, section_key)
      )
    `);

    // Home banners table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_banners (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES home_templates(id) ON DELETE CASCADE,
        section_id INTEGER REFERENCES home_sections(id) ON DELETE SET NULL,
        version_id INTEGER REFERENCES home_template_versions(id) ON DELETE CASCADE,
        title VARCHAR(150),
        subtitle VARCHAR(255),
        image_url VARCHAR(500) NOT NULL,
        mobile_image_url VARCHAR(500),
        variant VARCHAR(50) DEFAULT 'default',
        cta_label VARCHAR(100),
        cta_link VARCHAR(500),
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        position INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Draft change log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS draft_changes (
        id SERIAL PRIMARY KEY,
        template_id INTEGER NOT NULL REFERENCES home_templates(id) ON DELETE CASCADE,
        version_id INTEGER REFERENCES home_template_versions(id) ON DELETE CASCADE,
        change_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_by VARCHAR(150),
        approved_by VARCHAR(150),
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Analytics events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGSERIAL PRIMARY KEY,
        event_name VARCHAR(100) NOT NULL,
        user_id INTEGER,
        session_id VARCHAR(120),
        device_id VARCHAR(120),
        source VARCHAR(50) DEFAULT 'app',
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Daily aggregated metrics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_daily_metrics (
        id SERIAL PRIMARY KEY,
        metric_date DATE NOT NULL,
        event_name VARCHAR(100) NOT NULL,
        total_count INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(metric_date, event_name)
      )
    `);

    // Push subscriptions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        device_id VARCHAR(120),
        expo_push_token VARCHAR(255) UNIQUE NOT NULL,
        platform VARCHAR(30),
        locale VARCHAR(10),
        app_version VARCHAR(30),
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notification logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        body TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::JSONB,
        target_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        created_by VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_cpf_cnpj ON users(cpf_cnpj)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_products_codigo ON products(codigo)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_products_categoria ON products(categoria)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_home_templates_status ON home_templates(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_home_sections_template ON home_sections(template_id, position)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_home_banners_template ON home_banners(template_id, position)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_draft_changes_template ON draft_changes(template_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_customer_reviews_status ON customer_reviews(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_customer_reviews_product ON customer_reviews(product_id)');

    // Adicionar campos detalhados na tabela analytics_events (migration)
    await pool.query(`
      DO $$
      BEGIN
        -- Adicionar user_email se não existir
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'analytics_events' AND column_name = 'user_email'
        ) THEN
          ALTER TABLE analytics_events ADD COLUMN user_email VARCHAR(255);
        END IF;

        -- Adicionar cart_value se não existir
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'analytics_events' AND column_name = 'cart_value'
        ) THEN
          ALTER TABLE analytics_events ADD COLUMN cart_value DECIMAL(10,2);
        END IF;

        -- Adicionar product_quantity se não existir
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'analytics_events' AND column_name = 'product_quantity'
        ) THEN
          ALTER TABLE analytics_events ADD COLUMN product_quantity INTEGER;
        END IF;

        -- Adicionar product_id se não existir
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'analytics_events' AND column_name = 'product_id'
        ) THEN
          ALTER TABLE analytics_events ADD COLUMN product_id INTEGER;
        END IF;

        -- Adicionar checkout_id se não existir
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'analytics_events' AND column_name = 'checkout_id'
        ) THEN
          ALTER TABLE analytics_events ADD COLUMN checkout_id VARCHAR(100);
        END IF;

        -- Adicionar user_name se não existir
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'analytics_events' AND column_name = 'user_name'
        ) THEN
          ALTER TABLE analytics_events ADD COLUMN user_name VARCHAR(255);
        END IF;
      END $$;
    `);

    // Tabela para rastrear sessões de checkout
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkout_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES melhor_casas_users(id) ON DELETE SET NULL,
        session_id VARCHAR(255),
        device_id VARCHAR(255),
        checkout_url TEXT,
        opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        shopify_order_id VARCHAR(255) NULL,
        shopify_order_number VARCHAR(100) NULL,
        status VARCHAR(50) DEFAULT 'opened' CHECK (status IN ('opened', 'completed', 'abandoned')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para checkout_sessions
    await pool.query('CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user_id ON checkout_sessions(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_checkout_sessions_session_id ON checkout_sessions(session_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_checkout_sessions_shopify_order_id ON checkout_sessions(shopify_order_id)');

    // Store hours table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_store_hours (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(50) UNIQUE NOT NULL,
        store_name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(2),
        hours JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_store_hours_store_id ON melhor_casas_store_hours(store_id)');

    console.log('✅ Database tables created successfully');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  }
};

const runMigrations = async () => {
  try {
    await createTables();
    console.log('🎉 Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  runMigrations();
}

module.exports = { createTables };


