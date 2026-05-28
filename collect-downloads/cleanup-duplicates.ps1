# Script para adicionar constraint UNIQUE e remover registros duplicados
# Execute no PowerShell: .\cleanup-duplicates.ps1

Write-Host "🔧 [Cleanup] Adicionando constraint UNIQUE na tabela..." -ForegroundColor Cyan

# Executar Node.js para adicionar a constraint
node -e @"
const pool = require('../src/database/connection');

async function fixDuplicates() {
  try {
    // 1. Tentar adicionar constraint (pode já existir)
    console.log('📋 Tentando adicionar constraint UNIQUE...');
    await pool.query('ALTER TABLE app_store_installs ADD CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)');
    console.log('✅ Constraint criada com sucesso!');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('ℹ️  Constraint já existe.');
    } else if (err.message.includes('violates unique constraint')) {
      console.log('⚠️  Constraint não pode ser criada - existem duplicados.');
      console.log('Limpando duplicados...');
      
      // 2. Remover duplicados mantendo o mais recente
      try {
        const result = await pool.query(\`
          DELETE FROM app_store_installs a 
          WHERE a.id NOT IN (
            SELECT DISTINCT ON (store, report_date, country) id 
            FROM app_store_installs 
            ORDER BY store, report_date, country, created_at DESC
          )
        \`);
        console.log('✅ Duplicados removidos! Deletadas ' + result.rowCount + ' linhas.');
        
        // Tentar adicionar constraint novamente
        await pool.query('ALTER TABLE app_store_installs ADD CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)');
        console.log('✅ Constraint criada após limpeza!');
      } catch (delErr) {
        console.error('❌ Erro ao limpar duplicados:', delErr.message);
      }
    } else {
      console.error('❌ Erro:', err.message);
    }
  } finally {
    await pool.end();
  }
}

fixDuplicates();
"@

Write-Host ""
Write-Host "✅ Cleanup concluído!" -ForegroundColor Green
Write-Host "Agora rode: node run-all.js" -ForegroundColor Yellow
