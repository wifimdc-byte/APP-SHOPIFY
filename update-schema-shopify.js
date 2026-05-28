const db = require('./src/database/connection');

async function updateSchema() {
  try {
    console.log('🔄 Atualizando schema para integração com Shopify...');
    
    // Adicionar colunas necessárias
    const alterQueries = [
      // Adicionar coluna disponivel
      `ALTER TABLE melhor_casas_products ADD COLUMN IF NOT EXISTS disponivel BOOLEAN DEFAULT true`,
      
      // Adicionar coluna estoque
      `ALTER TABLE melhor_casas_products ADD COLUMN IF NOT EXISTS estoque INTEGER DEFAULT 0`,
      
      // Adicionar coluna tags
      `ALTER TABLE melhor_casas_products ADD COLUMN IF NOT EXISTS tags TEXT`,
      
      // Adicionar coluna updated_at
      `ALTER TABLE melhor_casas_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
      
      // Adicionar coluna created_at se não existir
      `ALTER TABLE melhor_casas_products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    ];
    
    for (const query of alterQueries) {
      try {
        await db.query(query);
        console.log(`✅ Query executada: ${query.split(' ')[2]} ${query.split(' ')[3]}`);
      } catch (error) {
        if (error.code === '42701') {
          console.log(`⚠️  Coluna já existe: ${query.split(' ')[2]} ${query.split(' ')[3]}`);
        } else {
          console.error(`❌ Erro na query: ${error.message}`);
        }
      }
    }
    
    // Verificar estrutura da tabela
    const tableInfo = await db.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_products' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Estrutura atual da tabela melhor_casas_products:');
    tableInfo.rows.forEach(column => {
      console.log(`   ${column.column_name} (${column.data_type}) - ${column.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    console.log('\n✅ Schema atualizado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao atualizar schema:', error);
  } finally {
    await db.end();
  }
}

updateSchema();




