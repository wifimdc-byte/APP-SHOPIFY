const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
  host: 'dpg-d3sh31qli9vc73fqt6t0-a.virginia-postgres.render.com',
  port: 5432,
  database: 'estoqueapp_7p6x',
  user: 'estoqueapp_7p6x_user',
  password: 'Bhd10ADnSHGEsdJlA4kWVkBPryLg3Fqx',
  ssl: { rejectUnauthorized: false }
});

async function checkAppCategories() {
  try {
    console.log('📊 Verificando distribuição de categorias APP...');
    
    // Verificar distribuição por categoria
    const result = await pool.query(`
      SELECT categoria, COUNT(*) as quantidade 
      FROM melhor_casas_products 
      GROUP BY categoria 
      ORDER BY quantidade DESC
    `);
    
    console.log('\n📋 Distribuição de produtos por categoria:');
    console.log('==========================================');
    
    if (result.rows.length === 0) {
      console.log('❌ Nenhum produto encontrado');
      return;
    }
    
    const totalProducts = result.rows.reduce((sum, row) => sum + parseInt(row.quantidade), 0);
    console.log(`📊 Total de produtos: ${totalProducts}`);
    
    result.rows.forEach(row => {
      const emoji = parseInt(row.quantidade) > 0 ? '✅' : '❌';
      console.log(`${emoji} ${row.categoria}: ${row.quantidade} produtos`);
    });
    
    // Mostrar exemplos de produtos por categoria
    console.log('\n🔍 Exemplos de produtos por categoria:');
    
    for (const row of result.rows) {
      if (parseInt(row.quantidade) > 0) {
        console.log(`\n${row.categoria}:`);
        
        const examples = await pool.query(`
          SELECT nome, preco_varejo, preco_exclusivo, tags
          FROM melhor_casas_products 
          WHERE categoria = $1 
          LIMIT 3
        `, [row.categoria]);
        
        examples.rows.forEach(product => {
          const economy = (parseFloat(product.preco_varejo) - parseFloat(product.preco_exclusivo)).toFixed(2);
          console.log(`   - ${product.nome} (R$ ${product.preco_varejo} → R$ ${product.preco_exclusivo}) - Economia: R$ ${economy}`);
          console.log(`     Tags: ${product.tags}`);
        });
      }
    }
    
    // Verificar tags únicas
    console.log('\n🏷️ Tags únicas encontradas:');
    const tagsResult = await pool.query(`
      SELECT DISTINCT tags 
      FROM melhor_casas_products 
      WHERE tags IS NOT NULL AND tags != ''
      ORDER BY tags
    `);
    
    tagsResult.rows.forEach(row => {
      console.log(`   "${row.tags}"`);
    });
    
    // Verificar se há produtos sem tags
    const noTagsResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM melhor_casas_products 
      WHERE tags IS NULL OR tags = ''
    `);
    
    if (parseInt(noTagsResult.rows[0].count) > 0) {
      console.log(`\n⚠️  Produtos sem tags: ${noTagsResult.rows[0].count}`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar categorias:', error);
  } finally {
    await pool.end();
  }
}

// Executar verificação
checkAppCategories();




