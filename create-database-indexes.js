// Script para criar índices no banco de dados
// Índices melhoram drasticamente a performance das queries

const pool = require('./src/database/connection');

async function createIndexes() {
  try {
    console.log('🔄 Criando índices para melhorar performance...');

    // Índices para a tabela melhor_casas_products
    const indexes = [
      // Índice para busca por código (já existe como UNIQUE, mas vamos garantir)
      {
        name: 'idx_products_codigo',
        query: `CREATE INDEX IF NOT EXISTS idx_products_codigo ON melhor_casas_products(codigo) WHERE disponivel = true;`
      },
      
      // Índice para busca por categoria (muito usado)
      {
        name: 'idx_products_categoria',
        query: `CREATE INDEX IF NOT EXISTS idx_products_categoria ON melhor_casas_products(categoria) WHERE disponivel = true;`
      },
      
      // Índice para busca por nome (busca de texto)
      {
        name: 'idx_products_nome',
        query: `CREATE INDEX IF NOT EXISTS idx_products_nome ON melhor_casas_products USING gin(to_tsvector('portuguese', nome));`
      },
      
      // Índice composto para disponível + categoria (otimiza query mais comum)
      {
        name: 'idx_products_disponivel_categoria',
        query: `CREATE INDEX IF NOT EXISTS idx_products_disponivel_categoria ON melhor_casas_products(disponivel, categoria) WHERE disponivel = true;`
      },
      
      // Índice composto para código + disponível (otimiza buscas por código)
      {
        name: 'idx_products_codigo_disponivel',
        query: `CREATE INDEX IF NOT EXISTS idx_products_codigo_disponivel ON melhor_casas_products(codigo, disponivel) WHERE disponivel = true;`
      },
      
      // Índice composto para categoria + disponível + id (otimiza buscas por categoria com ordenação)
      {
        name: 'idx_products_categoria_disponivel_id',
        query: `CREATE INDEX IF NOT EXISTS idx_products_categoria_disponivel_id ON melhor_casas_products(categoria, disponivel, id) WHERE disponivel = true;`
      },
      
      // Índice para ordenação por nome
      {
        name: 'idx_products_nome_order',
        query: `CREATE INDEX IF NOT EXISTS idx_products_nome_order ON melhor_casas_products(nome) WHERE disponivel = true;`
      },
      
      // Índice para buscas com IN (codigo IN (...)) usado em collections
      {
        name: 'idx_products_codigo_in',
        query: `CREATE INDEX IF NOT EXISTS idx_products_codigo_in ON melhor_casas_products(codigo) WHERE disponivel = true;`
      },
      
      // Índices para melhor_casas_orders
      {
        name: 'idx_orders_user_id',
        query: `CREATE INDEX IF NOT EXISTS idx_orders_user_id ON melhor_casas_orders(user_id, created_at DESC);`
      },
      
      {
        name: 'idx_orders_shopify_order_id',
        query: `CREATE INDEX IF NOT EXISTS idx_orders_shopify_order_id ON melhor_casas_orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL;`
      },
      
      // Índices para melhor_casas_order_items
      {
        name: 'idx_order_items_order_id',
        query: `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON melhor_casas_order_items(order_id);`
      },
      
      {
        name: 'idx_order_items_product_id',
        query: `CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON melhor_casas_order_items(product_id);`
      },
      
      // Índices para melhor_casas_user_favorites
      {
        name: 'idx_favorites_user_id',
        query: `CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON melhor_casas_user_favorites(user_id);`
      },
      
      {
        name: 'idx_favorites_product_id',
        query: `CREATE INDEX IF NOT EXISTS idx_favorites_product_id ON melhor_casas_user_favorites(product_id);`
      },
      
      // Índices para melhor_casas_customer_reviews
      {
        name: 'idx_reviews_product_id',
        query: `CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON melhor_casas_customer_reviews(product_id) WHERE status = 'aprovado';`
      },
      
      {
        name: 'idx_reviews_product_code',
        query: `CREATE INDEX IF NOT EXISTS idx_reviews_product_code ON melhor_casas_customer_reviews(product_code) WHERE status = 'aprovado';`
      },
    ];

    for (const index of indexes) {
      try {
        await pool.query(index.query);
        console.log(`✅ Índice criado/verificado: ${index.name}`);
      } catch (error) {
        if (error.code === '42710') {
          console.log(`ℹ️  Índice já existe: ${index.name}`);
        } else {
          console.error(`❌ Erro ao criar índice ${index.name}:`, error.message);
        }
      }
    }

    console.log('\n✅ Índices criados com sucesso!');
    console.log('💡 Os índices melhorarão a performance das queries no banco de dados.');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar índices:', error);
    process.exit(1);
  }
}

createIndexes();


