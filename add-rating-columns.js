const db = require('./src/database/connection');

async function addRatingColumns() {
  try {
    console.log('🔄 Adicionando colunas de rating...');
    
    // Adicionar colunas de rating
    const alterQueries = [
      `ALTER TABLE melhor_casas_products ADD COLUMN IF NOT EXISTS rating_average DECIMAL(3,2) DEFAULT NULL`,
      `ALTER TABLE melhor_casas_products ADD COLUMN IF NOT EXISTS rating_total INTEGER DEFAULT 0`
    ];
    
    for (const query of alterQueries) {
      try {
        await db.query(query);
        console.log(`✅ Query executada`);
      } catch (error) {
        if (error.code === '42701') {
          console.log(`⚠️  Coluna já existe`);
        } else {
          console.error(`❌ Erro na query: ${error.message}`);
        }
      }
    }
    
    console.log('✅ Colunas de rating adicionadas com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao adicionar colunas de rating:', error);
    process.exit(1);
  }
}

addRatingColumns();


