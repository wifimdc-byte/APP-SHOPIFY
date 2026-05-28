const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setup() {
  console.log("Conectando ao banco...");
  
  // Usa a mesma configuração de SSL necessária para o Render
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false 
    }
  });

  try {
    await client.connect();
    
    // Lê o arquivo schema.sql
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log("Rodando schema.sql...");
    await client.query(sql);
    
    console.log("✅ Sucesso! Tabela 'app_store_installs' criada/verificada.");
  } catch (err) {
    console.error("❌ Erro:", err.message);
  } finally {
    await client.end();
  }
}

setup();