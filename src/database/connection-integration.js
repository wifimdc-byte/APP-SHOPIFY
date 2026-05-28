const { Pool } = require('pg');
require('dotenv').config();

// Configuração para integração com banco existente
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'seu_banco_existente', // Nome do seu banco atual
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('📊 Conectado ao PostgreSQL existente');
});

pool.on('error', (err) => {
  console.error('❌ Erro de conexão com o banco:', err);
});

module.exports = pool;






