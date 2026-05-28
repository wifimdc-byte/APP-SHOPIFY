const { Pool } = require('pg');
require('dotenv').config();

console.log('🔍 Testando conexão com PostgreSQL...');
console.log('Host:', process.env.DB_HOST);
console.log('Port:', process.env.DB_PORT);
console.log('Database:', process.env.DB_NAME);
console.log('User:', process.env.DB_USER);
console.log('Password type:', typeof process.env.DB_PASSWORD);
console.log('Password length:', process.env.DB_PASSWORD?.length);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function testConnection() {
  try {
    console.log('🔄 Tentando conectar...');
    const client = await pool.connect();
    console.log('✅ Conexão bem-sucedida!');
    
    const result = await client.query('SELECT NOW()');
    console.log('⏰ Hora atual do servidor:', result.rows[0].now);
    
    client.release();
    await pool.end();
    console.log('🔚 Conexão encerrada com sucesso');
  } catch (error) {
    console.error('❌ Erro na conexão:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testConnection();






