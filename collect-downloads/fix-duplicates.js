const { Client } = require('pg');

async function fixDuplicates() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('🚀 Conectado ao banco de dados.\n');

    // --- Passo 1: Remover duplicatas com NULL (mantendo apenas o mais recente para cada store+date) ---
    console.log('🧹 Consolidando múltiplos registros com country=NULL para a mesma store+date...');
    const consolidateNullResult = await client.query(`
      DELETE FROM app_store_installs a
      USING (
        SELECT 
          ctid,
          row_number() OVER (
            PARTITION BY store, report_date
            ORDER BY created_at DESC, id DESC
          ) as rn
        FROM app_store_installs
        WHERE country IS NULL
      ) b
      WHERE a.ctid = b.ctid AND b.rn > 1
    `);
    console.log(`✅ ${consolidateNullResult.rowCount} registro(s) com NULL duplicado(s) removido(s).\n`);

    // --- Passo 2: Remover registros com NULL quando já existe um com 'BR' para a mesma store+date ---
    console.log('🧹 Removendo registros com country=NULL quando já existe um com country=\'BR\'...');
    const removeNullDuplicatesResult = await client.query(`
      DELETE FROM app_store_installs a
      WHERE a.country IS NULL
      AND EXISTS (
        SELECT 1 FROM app_store_installs b
        WHERE b.store = a.store
        AND b.report_date = a.report_date
        AND b.country = 'BR'
      )
    `);
    console.log(`✅ ${removeNullDuplicatesResult.rowCount} registro(s) com NULL removido(s) (já existe com 'BR').\n`);

    // --- Passo 3: Converter os NULL restantes para 'BR' (agora não há mais conflito) ---
    console.log('🔄 Convertendo registros restantes com country=NULL para country=\'BR\'...');
    const updateNullResult = await client.query(`
      UPDATE app_store_installs
      SET country = 'BR'
      WHERE country IS NULL
    `);
    console.log(`✅ ${updateNullResult.rowCount} registro(s) atualizado(s) (NULL -> 'BR').\n`);

    // --- Passo 4: Remover duplicatas mantendo apenas o mais recente ---
    console.log('🧹 Removendo duplicatas (mantendo apenas o registro mais recente)...');
    const deleteResult = await client.query(`
      DELETE FROM app_store_installs a
      USING (
        SELECT 
          ctid,
          row_number() OVER (
            PARTITION BY store, report_date, country
            ORDER BY created_at DESC, id DESC
          ) as rn
        FROM app_store_installs
      ) b
      WHERE a.ctid = b.ctid AND b.rn > 1
    `);

    if (deleteResult.rowCount > 0) {
      console.log(`✅ ${deleteResult.rowCount} registro(s) duplicado(s) removido(s).\n`);
    } else {
      console.log('✅ Nenhum registro duplicado encontrado.\n');
    }

    // --- Passo 5: Verificar e adicionar constraint se não existir ---
    const constraintCheck = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conname = 'uk_store_date_country'
    `);

    if (constraintCheck.rowCount === 0) {
      console.log('➕ Adicionando constraint UNIQUE (uk_store_date_country)...');
      await client.query(`
        ALTER TABLE app_store_installs
        ADD CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)
      `);
      console.log('✅ Constraint adicionada com sucesso!\n');
    } else {
      console.log('✅ A constraint de unicidade "uk_store_date_country" já existe.\n');
    }

    // --- Passo 6: Verificar resultado final ---
    const finalCheck = await client.query(`
      SELECT store, report_date, country, COUNT(*) as count
      FROM app_store_installs
      GROUP BY store, report_date, country
      HAVING COUNT(*) > 1
    `);

    if (finalCheck.rowCount === 0) {
      console.log('🎉 Limpeza concluída! Não há mais duplicatas no banco de dados.');
    } else {
      console.log('⚠️ Ainda existem duplicatas:');
      finalCheck.rows.forEach(row => {
        console.log(`   - ${row.store} | ${row.report_date} | ${row.country || 'NULL'}: ${row.count} registros`);
      });
    }

    // Mostrar estatísticas finais
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT store) as stores,
        COUNT(DISTINCT report_date) as dates,
        SUM(installs) as total_installs
      FROM app_store_installs
    `);
    
    if (stats.rows.length > 0) {
      const s = stats.rows[0];
      console.log(`\n📊 Estatísticas finais:`);
      console.log(`   - Total de registros: ${s.total}`);
      console.log(`   - Lojas distintas: ${s.stores}`);
      console.log(`   - Datas distintas: ${s.dates}`);
      console.log(`   - Total de instalações: ${s.total_installs || 0}`);
    }

  } catch (err) {
    console.error('❌ Erro durante o processo:', err.message);
    if (err.detail) {
      console.error('   Detalhes:', err.detail);
    }
  } finally {
    await client.end();
    console.log('\n🔌 Conexão com o banco de dados fechada.');
  }
}

// Carrega variáveis de ambiente
try {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (e) {
  // ignore
}

fixDuplicates();
