const pool = require('../src/database/connection');

async function fixConstraint() {
  try {
    console.log('🔧 Verificando constraint da tabela app_store_installs...\n');
    
    // Verificar se a constraint existe
    const checkConstraint = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'app_store_installs' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'uk_store_date_country'
    `);
    
    if (checkConstraint.rows.length > 0) {
      console.log('✅ Constraint uk_store_date_country já existe!');
      return;
    }
    
    // Verificar se há duplicatas antes de adicionar constraint
    console.log('🔍 Verificando duplicatas...');
    const duplicates = await pool.query(`
      SELECT store, report_date, country, COUNT(*) as count
      FROM app_store_installs
      GROUP BY store, report_date, country
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.rows.length > 0) {
      console.log(`⚠️ Encontradas ${duplicates.rows.length} combinações duplicadas!`);
      console.log('💡 Removendo duplicatas (mantendo apenas o registro mais recente)...');
      
      // Remover duplicatas mantendo apenas o mais recente
      await pool.query(`
        DELETE FROM app_store_installs a
        USING app_store_installs b
        WHERE a.id < b.id
        AND a.store = b.store
        AND a.report_date = b.report_date
        AND (a.country = b.country OR (a.country IS NULL AND b.country IS NULL))
      `);
      
      console.log('✅ Duplicatas removidas!');
    }
    
    // Adicionar constraint
    console.log('🔄 Adicionando constraint uk_store_date_country...');
    await pool.query(`
      ALTER TABLE app_store_installs 
      ADD CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)
    `);
    
    console.log('✅ Constraint adicionada com sucesso!');
    
    // Verificar novamente
    const verify = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'app_store_installs' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'uk_store_date_country'
    `);
    
    if (verify.rows.length > 0) {
      console.log('✅ Constraint verificada e funcionando!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

fixConstraint();
