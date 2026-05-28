const pool = require('./src/database/connection');

async function checkTable() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_products'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Colunas da tabela melhor_casas_products:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    
    // Verificar se existe ativo ou disponivel
    const hasAtivo = result.rows.some(r => r.column_name === 'ativo');
    const hasDisponivel = result.rows.some(r => r.column_name === 'disponivel');
    
    console.log('\n✅ Coluna "ativo" existe:', hasAtivo);
    console.log('✅ Coluna "disponivel" existe:', hasDisponivel);
    
    if (!hasAtivo && !hasDisponivel) {
      console.log('\n⚠️  Nenhuma das colunas existe! Adicionando coluna "disponivel"...');
      await pool.query(`
        ALTER TABLE melhor_casas_products 
        ADD COLUMN IF NOT EXISTS disponivel BOOLEAN DEFAULT true
      `);
      console.log('✅ Coluna "disponivel" adicionada!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

checkTable();


