const shopifyService = require('./src/services/shopifyService');
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

async function cleanAndSyncApp() {
  try {
    console.log('🧹 Limpando banco de dados...');
    
    // Limpar todos os produtos existentes
    await pool.query('DELETE FROM melhor_casas_products');
    console.log('✅ Banco de dados limpo');
    
    console.log('🔄 Iniciando sincronização apenas com collections "- APP"...');
    
    // Buscar collections com "- APP"
    const collections = await shopifyService.getAllCollections();
    console.log(`📋 Total de collections encontradas: ${collections.length}`);
    
    const appCollections = collections.filter(collection => 
      collection.title && collection.title.includes('- APP')
    );
    
    console.log(`🎯 Collections com "- APP": ${appCollections.length}`);
    
    if (appCollections.length === 0) {
      console.log('⚠️  Nenhuma collection com "- APP" encontrada');
      console.log('💡 Crie collections no Shopify com o sufixo "- APP" para sincronizar produtos');
      return;
    }
    
    // Listar collections encontradas
    appCollections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.title} (ID: ${collection.id})`);
    });
    
    let totalProducts = 0;
    let syncedCount = 0;
    let updatedCount = 0;
    
    // Buscar produtos de cada collection
    for (const collection of appCollections) {
      console.log(`\n📦 Processando collection: ${collection.title}`);
      
      try {
        const products = await shopifyService.getProductsByCollection(collection.id);
        console.log(`✅ ${collection.title}: ${products.length} produtos encontrados`);
        
        // Adicionar categoria baseada no nome da collection
        const categoryName = collection.title.replace(' - APP', '').trim();
        
        for (const shopifyProduct of products) {
          const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
          mappedProduct.categoria = categoryName; // Forçar categoria da collection
          
          // Verificar se produto já existe
          const existingProduct = await pool.query(
            'SELECT id FROM melhor_casas_products WHERE codigo = $1',
            [mappedProduct.codigo]
          );
          
          if (existingProduct.rows.length > 0) {
            // Atualizar produto existente
            await pool.query(`
              UPDATE melhor_casas_products 
              SET nome = $1, categoria = $2, preco_varejo = $3, 
                  preco_atacado = $4, preco_exclusivo = $5, 
                  descricao = $6, imagem_url = $7, estoque = $8, 
                  disponivel = $9, tags = $10, updated_at = $11
              WHERE codigo = $12
            `, [
              mappedProduct.nome,
              mappedProduct.categoria,
              mappedProduct.preco_varejo,
              mappedProduct.preco_atacado,
              mappedProduct.preco_exclusivo,
              mappedProduct.descricao,
              mappedProduct.imagem_url,
              mappedProduct.estoque,
              mappedProduct.disponivel,
              JSON.stringify(mappedProduct.tags),
              mappedProduct.updated_at,
              mappedProduct.codigo
            ]);
            updatedCount++;
          } else {
            // Inserir novo produto
            await pool.query(`
              INSERT INTO melhor_casas_products 
              (codigo, nome, categoria, preco_varejo, preco_atacado, 
               preco_exclusivo, descricao, imagem_url, estoque, 
               disponivel, tags, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
              mappedProduct.codigo,
              mappedProduct.nome,
              mappedProduct.categoria,
              mappedProduct.preco_varejo,
              mappedProduct.preco_atacado,
              mappedProduct.preco_exclusivo,
              mappedProduct.descricao,
              mappedProduct.imagem_url,
              mappedProduct.estoque,
              mappedProduct.disponivel,
              JSON.stringify(mappedProduct.tags),
              mappedProduct.created_at,
              mappedProduct.updated_at
            ]);
            syncedCount++;
          }
          
          totalProducts++;
        }
        
      } catch (error) {
        console.error(`❌ Erro ao processar ${collection.title}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Sincronização concluída!`);
    console.log(`📊 Total de produtos processados: ${totalProducts}`);
    console.log(`➕ Novos produtos: ${syncedCount}`);
    console.log(`🔄 Produtos atualizados: ${updatedCount}`);
    
    // Verificar distribuição por categoria
    console.log('\n📊 Distribuição por categoria:');
    const result = await pool.query(`
      SELECT categoria, COUNT(*) as quantidade 
      FROM melhor_casas_products 
      GROUP BY categoria 
      ORDER BY quantidade DESC
    `);
    
    result.rows.forEach(row => {
      console.log(`   ${row.categoria}: ${row.quantidade} produtos`);
    });
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
  } finally {
    await pool.end();
  }
}

// Executar limpeza e sincronização
cleanAndSyncApp();




