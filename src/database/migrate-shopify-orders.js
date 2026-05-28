const pool = require('./connection');

const addShopifyOrderId = async () => {
  try {
    // Verificar qual tabela de orders existe
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name = 'melhor_casas_orders' OR table_name = 'orders')
      ORDER BY table_name
    `);

    if (tablesResult.rows.length === 0) {
      console.log('⚠️  Nenhuma tabela de orders encontrada. Execute a migração de criação de tabelas primeiro.');
      return;
    }

    const tableName = tablesResult.rows[0].table_name;
    console.log(`🔄 Adicionando coluna shopify_order_id na tabela ${tableName}...`);
    
    // Verificar se a coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 
      AND column_name = 'shopify_order_id'
    `, [tableName]);

    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna shopify_order_id já existe');
      return;
    }

    // Adicionar coluna shopify_order_id
    await pool.query(`
      ALTER TABLE ${tableName} 
      ADD COLUMN shopify_order_id VARCHAR(50) UNIQUE
    `);

    // Adicionar índice para melhor performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_shopify_order_id 
      ON ${tableName}(shopify_order_id)
    `);

    console.log(`✅ Coluna shopify_order_id adicionada com sucesso na tabela ${tableName}!`);
  } catch (error) {
    console.error('❌ Erro ao adicionar coluna shopify_order_id:', error);
    throw error;
  }
};

const runMigration = async () => {
  try {
    await addShopifyOrderId();
    console.log('🎉 Migração concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  }
};

runMigration();

