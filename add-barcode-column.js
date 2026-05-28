/**
 * Migração para adicionar coluna barcode na tabela de produtos
 * Execute: node add-barcode-column.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function addBarcodeColumn() {
  try {
    console.log('🚀 Adicionando coluna barcode na tabela melhor_casas_products...');
    
    // Verificar se a coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_products' 
      AND column_name = 'barcode'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna barcode já existe!');
    } else {
      // Adicionar coluna barcode
      await pool.query(`
        ALTER TABLE melhor_casas_products 
        ADD COLUMN barcode VARCHAR(100)
      `);
      console.log('✅ Coluna barcode adicionada com sucesso!');
      
      // Criar índice para melhorar busca por barcode
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_products_barcode 
        ON melhor_casas_products(barcode)
      `);
      console.log('✅ Índice para barcode criado!');
    }
    
    // Adicionar coluna sku também se não existir
    const checkSku = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_products' 
      AND column_name = 'sku'
    `);
    
    if (checkSku.rows.length === 0) {
      await pool.query(`
        ALTER TABLE melhor_casas_products 
        ADD COLUMN sku VARCHAR(100)
      `);
      console.log('✅ Coluna sku adicionada!');
      
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_products_sku 
        ON melhor_casas_products(sku)
      `);
      console.log('✅ Índice para sku criado!');
    } else {
      console.log('✅ Coluna sku já existe!');
    }
    
    console.log('\n✅ Migração concluída!');
    console.log('⚠️ Agora você precisa rodar a sincronização de produtos para popular os barcodes.');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
  } finally {
    await pool.end();
  }
}

addBarcodeColumn();
