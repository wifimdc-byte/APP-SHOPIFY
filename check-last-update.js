const pool = require('./src/database/connection');

async function checkLastUpdate() {
  try {
    console.log('🔍 Verificando última atualização dos produtos...\n');
    
    // Buscar a última data de atualização
    const lastUpdateResult = await pool.query(`
      SELECT 
        MAX(updated_at) as last_update,
        COUNT(*) as total_products,
        COUNT(CASE WHEN updated_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as updated_last_24h,
        COUNT(CASE WHEN updated_at >= NOW() - INTERVAL '7 days' THEN 1 END) as updated_last_7d
      FROM melhor_casas_products
      WHERE disponivel = true
    `);
    
    const stats = lastUpdateResult.rows[0];
    
    console.log('📊 Estatísticas de Atualização:');
    console.log('─'.repeat(50));
    console.log(`📅 Última atualização: ${stats.last_update ? new Date(stats.last_update).toLocaleString('pt-BR') : 'Nunca'}`);
    console.log(`📦 Total de produtos: ${stats.total_products}`);
    console.log(`🕐 Atualizados nas últimas 24h: ${stats.updated_last_24h}`);
    console.log(`📆 Atualizados nos últimos 7 dias: ${stats.updated_last_7d}`);
    console.log('─'.repeat(50));
    
    // Buscar os 5 produtos mais recentemente atualizados
    const recentProducts = await pool.query(`
      SELECT 
        codigo,
        nome,
        categoria,
        updated_at,
        created_at
      FROM melhor_casas_products
      WHERE disponivel = true
      ORDER BY updated_at DESC
      LIMIT 5
    `);
    
    if (recentProducts.rows.length > 0) {
      console.log('\n📋 Últimos 5 produtos atualizados:');
      recentProducts.rows.forEach((product, index) => {
        const updatedDate = new Date(product.updated_at).toLocaleString('pt-BR');
        const createdDate = new Date(product.created_at).toLocaleString('pt-BR');
        console.log(`\n${index + 1}. ${product.nome}`);
        console.log(`   Código: ${product.codigo}`);
        console.log(`   Categoria: ${product.categoria || 'N/A'}`);
        console.log(`   Atualizado em: ${updatedDate}`);
        console.log(`   Criado em: ${createdDate}`);
      });
    }
    
    // Calcular tempo desde a última atualização
    if (stats.last_update) {
      const lastUpdate = new Date(stats.last_update);
      const now = new Date();
      const diffMs = now - lastUpdate;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      
      console.log('\n⏰ Tempo desde a última atualização:');
      if (diffDays > 0) {
        console.log(`   ${diffDays} dia(s) e ${diffHours % 24} hora(s)`);
      } else if (diffHours > 0) {
        console.log(`   ${diffHours} hora(s) e ${Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))} minuto(s)`);
      } else {
        console.log(`   ${Math.floor(diffMs / (1000 * 60))} minuto(s)`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao verificar atualizações:', error);
    process.exit(1);
  }
}

checkLastUpdate();






