const pool = require('../src/database/connection');

async function resetTable() {
  try {
    console.log('🔧 [Reset] Limpando e recriando tabela app_store_installs...\n');
    
    // 1. Dropar a tabela antiga (remove tudo)
    console.log('📋 Deletando tabela antiga...');
    await pool.query('DROP TABLE IF EXISTS app_store_installs CASCADE');
    console.log('✅ Tabela deletada.\n');
    
    // 2. Recriar com constraint UNIQUE
    console.log('📋 Recriando tabela com constraint UNIQUE...');
    await pool.query(`
      CREATE TABLE app_store_installs (
        id serial PRIMARY KEY,
        store varchar NOT NULL,
        report_date date NOT NULL,
        country varchar,
        installs integer,
        raw jsonb,
        created_at timestamptz DEFAULT now(),
        CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)
      );
      
      CREATE INDEX IF NOT EXISTS idx_app_store_installs_store_date 
      ON app_store_installs (store, report_date);
    `);
    console.log('✅ Tabela recriada com constraint UNIQUE!\n');
    
    // 3. Confirmar
    const check = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'app_store_installs' 
      AND constraint_type = 'UNIQUE'
    `);
    
    console.log('✅ Constraints UNIQUE na tabela:');
    check.rows.forEach(r => console.log(`   - ${r.constraint_name}`));
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
  } finally {
    await pool.end();
    console.log('\n✅ Reset concluído!');
    console.log('Agora rode: node run-all.js');
    process.exit(0);
  }
}

resetTable();
