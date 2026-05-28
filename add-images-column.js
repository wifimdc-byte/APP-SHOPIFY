const pool = require('./src/database/connection');

async function addImagesColumn() {
  try {
    console.log('🔄 Adicionando coluna imagens à tabela melhor_casas_products...');
    
    // Verificar se a coluna já existe
    const colCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_products' 
      AND column_name = 'imagens'
    `);
    
    if (colCheck.rows.length > 0) {
      console.log('✅ Coluna "imagens" já existe');
      return;
    }
    
    // Adicionar coluna imagens (JSONB para armazenar array de URLs)
    await pool.query(`
      ALTER TABLE melhor_casas_products 
      ADD COLUMN imagens JSONB DEFAULT '[]'::jsonb
    `);
    
    console.log('✅ Coluna "imagens" adicionada com sucesso!');
    
    // Migrar dados existentes: converter imagem_url para array em imagens
    console.log('🔄 Migrando imagem_url existente para imagens...');
    await pool.query(`
      UPDATE melhor_casas_products 
      SET imagens = CASE 
        WHEN imagem_url IS NOT NULL AND imagem_url != '' 
        THEN jsonb_build_array(imagem_url)
        ELSE '[]'::jsonb
      END
      WHERE imagens = '[]'::jsonb OR imagens IS NULL
    `);
    
    console.log('✅ Migração de dados concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao adicionar coluna imagens:', error);
    process.exit(1);
  }
}

addImagesColumn();







