const pool = require('./src/database/connection');

async function checkTables() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name = 'users' OR table_name = 'melhor_casas_users')
      ORDER BY table_name
    `);
    
    console.log('Tabelas de usuários encontradas:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    if (result.rows.length === 0) {
      console.log('  Nenhuma tabela de usuários encontrada!');
    }
    
    // Verificar se há usuários em alguma das tabelas
    if (result.rows.some(r => r.table_name === 'users')) {
      const usersCount = await pool.query('SELECT COUNT(*) as count FROM users');
      console.log(`\nUsuários na tabela 'users': ${usersCount.rows[0].count}`);
    }
    
    if (result.rows.some(r => r.table_name === 'melhor_casas_users')) {
      const melhorCasasCount = await pool.query('SELECT COUNT(*) as count FROM melhor_casas_users');
      console.log(`Usuários na tabela 'melhor_casas_users': ${melhorCasasCount.rows[0].count}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Erro:', error);
    process.exit(1);
  }
}

checkTables();

