const { Pool } = require('pg');

// Configurações diretas
const pool = new Pool({
  host: 'dpg-d3sh31qli9vc73fqt6t0-a.virginia-postgres.render.com',
  port: 5432,
  database: 'estoqueapp_7p6x',
  user: 'estoqueapp_7p6x_user',
  password: 'Bhd10ADnSHGEsdJlA4kWVkBPryLg3Fqx',
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  try {
    console.log('🔄 Testando conexão direta...');
    const client = await pool.connect();
    console.log('✅ Conexão bem-sucedida!');
    
    const result = await client.query('SELECT NOW()');
    console.log('⏰ Hora atual:', result.rows[0].now);
    
    client.release();
    await pool.end();
    console.log('🔚 Teste concluído!');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

testConnection();





