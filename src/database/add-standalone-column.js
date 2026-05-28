const pool = require('./connection');

async function addStandaloneColumn() {
  try {
    console.log('🔄 Verificando se a coluna is_standalone existe...');
    
    // Verificar se a coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'push_subscriptions' 
      AND column_name = 'is_standalone'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna is_standalone já existe');
      return;
    }
    
    console.log('📋 Adicionando coluna is_standalone...');
    await pool.query(`
      ALTER TABLE push_subscriptions 
      ADD COLUMN is_standalone BOOLEAN DEFAULT false
    `);
    
    console.log('✅ Coluna is_standalone adicionada com sucesso!');
    
    // Atualizar registros existentes: se não tiver is_standalone, assumir false (não standalone)
    const updateResult = await pool.query(`
      UPDATE push_subscriptions 
      SET is_standalone = false 
      WHERE is_standalone IS NULL
    `);
    console.log(`✅ ${updateResult.rowCount} registros atualizados`);
    
  } catch (error) {
    console.error('❌ Erro ao adicionar coluna is_standalone:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  addStandaloneColumn()
    .then(() => {
      console.log('✅ Migração concluída');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na migração:', error);
      process.exit(1);
    });
}

module.exports = addStandaloneColumn;














