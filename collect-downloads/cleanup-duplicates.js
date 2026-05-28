const { Client } = require('pg');

async function cleanupAndAddConstraint() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('🚀 Conectado ao banco de dados.');

    // --- Passo 1: Verificar se a constraint já existe ---
    const constraintCheck = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conname = 'uk_store_date_country'
    `);

    if (constraintCheck.rowCount > 0) {
      console.log('✅ A constraint de unicidade "uk_store_date_country" já existe. Nenhuma ação necessária.');
      return;
    }

    console.log('⚠️ A constraint de unicidade não foi encontrada. Iniciando limpeza de duplicatas...');

    // --- Passo 2: Limpar duplicatas ---
    // Usamos uma CTE (Common Table Expression) para identificar e deletar as duplicatas.
    // Mantemos a linha com o `created_at` mais recente para cada combinação de (store, report_date, country).
    const deleteResult = await client.query(`
      DELETE FROM app_store_installs a
      USING (
          SELECT
              ctid,
              row_number() OVER (
                  PARTITION BY store, report_date, country
                  ORDER BY created_at DESC
              ) as rn
          FROM app_store_installs
      ) b
      WHERE a.ctid = b.ctid AND b.rn > 1;
    `);

    if (deleteResult.rowCount > 0) {
      console.log(`🧹 ${deleteResult.rowCount} registro(s) duplicado(s) foram removidos.`);
    } else {
      console.log('✅ Nenhum registro duplicado encontrado.');
    }

    // --- Passo 3: Adicionar a constraint de unicidade ---
    console.log('➕ Adicionando a constraint UNIQUE (uk_store_date_country)...');
    await client.query(`
      ALTER TABLE app_store_installs
      ADD CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)
    `);
    console.log('🎉 Constraint adicionada com sucesso!');

  } catch (err) {
    console.error('❌ Erro durante o processo:', err);
  } finally {
    await client.end();
    console.log('🔌 Conexão com o banco de dados fechada.');
  }
}

// Carrega variáveis de ambiente
try {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (e) {
  // ignore
}

cleanupAndAddConstraint();