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

// Categorias baseadas nos menus do site
const siteCategories = {
  'Beleza': ['beleza', 'cosmeticos', 'perfumes', 'higiene', 'cuidados', 'maquiagem', 'shampoo', 'condicionador'],
  'Papelaria': ['papelaria', 'escolar', 'caderno', 'caneta', 'lapis', 'mochila', 'livro', 'material'],
  'Casa': ['casa', 'cozinha', 'limpeza', 'organizacao', 'utilidades', 'utensilios', 'decoracao', 'cama', 'mesa', 'banho'],
  'Brinquedos': ['brinquedos', 'brinquedo', 'jogos', 'bonecos', 'carrinhos', 'infantil', 'puzzles', 'pelucias'],
  'Tecnologia': ['tecnologia', 'eletronicos', 'celular', 'smartphone', 'fone', 'carregador', 'cabo', 'tablet', 'notebook'],
  'Pets': ['pet', 'animais', 'cachorro', 'gato', 'racao', 'coleira', 'brinquedos pet', 'casinha']
};

async function syncWithoutCollections() {
  try {
    console.log('🧹 Limpando banco de dados...');
    
    // Limpar todos os produtos existentes
    await pool.query('DELETE FROM melhor_casas_products');
    console.log('✅ Banco de dados limpo');
    
    console.log('🔄 Buscando todos os produtos do Shopify...');
    
    // Buscar todos os produtos diretamente
    const allProducts = await shopifyService.getAllProductsDirect();
    console.log(`📦 Total de produtos encontrados: ${allProducts.length}`);
    
    if (allProducts.length === 0) {
      console.log('⚠️  Nenhum produto encontrado');
      return;
    }
    
    let syncedCount = 0;
    let updatedCount = 0;
    const categoryStats = {};
    
    // Processar cada produto
    for (const shopifyProduct of allProducts) {
      const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
      
      // Determinar categoria baseada nos menus do site
      const category = determineCategory(mappedProduct.nome, shopifyProduct.product_type, shopifyProduct.tags);
      mappedProduct.categoria = category;
      
      // Contar por categoria
      categoryStats[category] = (categoryStats[category] || 0) + 1;
      
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
    }
    
    console.log(`\n🎉 Sincronização concluída!`);
    console.log(`📊 Total de produtos processados: ${allProducts.length}`);
    console.log(`➕ Novos produtos: ${syncedCount}`);
    console.log(`🔄 Produtos atualizados: ${updatedCount}`);
    
    // Mostrar distribuição por categoria
    console.log('\n📊 Distribuição por categoria:');
    Object.entries(categoryStats)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        console.log(`   ${category}: ${count} produtos`);
      });
    
    // Verificar se há categorias vazias
    const emptyCategories = Object.keys(siteCategories).filter(cat => !categoryStats[cat]);
    if (emptyCategories.length > 0) {
      console.log('\n❌ Categorias vazias:');
      emptyCategories.forEach(cat => {
        console.log(`   ${cat}: 0 produtos`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
  } finally {
    await pool.end();
  }
}

// Função para determinar categoria baseada nos menus do site
function determineCategory(nome, productType, tags) {
  const text = `${nome} ${productType} ${tags || ''}`.toLowerCase();
  
  // Buscar por categoria
  for (const [category, keywords] of Object.entries(siteCategories)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }
  
  // Categoria padrão
  return 'Casa';
}

// Executar sincronização
syncWithoutCollections();
