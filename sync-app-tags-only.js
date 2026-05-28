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

// Mapeamento de tags com "APP" para categorias (cada tag é uma categoria separada)
const appTagMapping = {
  'Beleza APP': 'Beleza',
  'Papelaria APP': 'Papelaria', 
  'Casa APP': 'Casa',
  'Brinquedos APP': 'Brinquedos',
  'Tecnologia APP': 'Tecnologia',
  'Pets APP': 'Pets',
  'Cameba APP': 'Cameba',
  'Led APP': 'Led',
  'Utensílios APP': 'Utensílios',
  'Utilidades APP': 'Utilidades',
  'Variedades APP': 'Variedades',
  'Eletrônicos APP': 'Eletrônicos',
  'Decoração APP': 'Decoração',
  'Conveniência APP': 'Conveniência',
  'Bijuteria APP': 'Bijuteria'
};

// Função para detectar tags "SO" (Super Oferta) e extrair o desconto
function detectSuperOferta(tags) {
  if (!tags) return { isSuperOferta: false, desconto: 0 };
  
  const tagsLower = tags.toLowerCase();
  
  // Buscar por padrões SO 30, SO 20, etc.
  const soMatch = tagsLower.match(/so\s*(\d+)/);
  if (soMatch) {
    const desconto = parseInt(soMatch[1]);
    return { isSuperOferta: true, desconto: desconto };
  }
  
  return { isSuperOferta: false, desconto: 0 };
}

// Função para inserir ou atualizar produto
async function insertOrUpdateProduct(mappedProduct, pool) {
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
  }
}

async function syncAppTagsOnly() {
  try {
    console.log('🧹 Limpando banco de dados...');
    
    // Limpar todos os produtos existentes
    await pool.query('DELETE FROM melhor_casas_products');
    console.log('✅ Banco de dados limpo');
    
    console.log('🔄 Buscando produtos com tags "APP"...');
    
    // Buscar todos os produtos
    const allProducts = await shopifyService.getAllProductsDirect();
    console.log(`📦 Total de produtos encontrados: ${allProducts.length}`);
    
    if (allProducts.length === 0) {
      console.log('⚠️  Nenhum produto encontrado');
      return;
    }
    
    // Filtrar apenas produtos com tags que contenham "APP"
    const appProducts = allProducts.filter(product => {
      if (!product.tags) return false;
      
      const tags = product.tags.toLowerCase();
      return tags.includes('app');
    });
    
    console.log(`🎯 Produtos com tags "APP": ${appProducts.length}`);
    
    if (appProducts.length === 0) {
      console.log('⚠️  Nenhum produto com tags "APP" encontrado');
      console.log('💡 Adicione tags como "Beleza - APP", "Casa - APP", etc. nos produtos do Shopify');
      return;
    }
    
    let syncedCount = 0;
    let updatedCount = 0;
    const categoryStats = {};
    
    // Processar cada produto com tag APP
    for (const shopifyProduct of appProducts) {
      const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
      
      // Detectar Super Oferta
      const superOferta = detectSuperOferta(shopifyProduct.tags);
      
      // Determinar categoria baseada na tag APP
      const category = determineCategoryFromAppTag(shopifyProduct.tags);
      mappedProduct.categoria = category;
      
      // Contar por categoria
      categoryStats[category] = (categoryStats[category] || 0) + 1;
      
      console.log(`📦 ${shopifyProduct.title}`);
      console.log(`   Tags: ${shopifyProduct.tags}`);
      console.log(`   Categoria: ${category}`);
      console.log(`   Preço: R$ ${mappedProduct.preco_varejo}`);
      
      if (superOferta.isSuperOferta) {
        console.log(`   🔥 SUPER OFERTA: ${superOferta.desconto}% de desconto!`);
        // Adicionar à categoria Oferta também
        categoryStats['Oferta'] = (categoryStats['Oferta'] || 0) + 1;
      }
      console.log('');
      
      // Inserir produto na categoria original
      await insertOrUpdateProduct(mappedProduct, pool);
      syncedCount++;
      
      // Se for Super Oferta, criar produto duplicado na categoria Oferta
      if (superOferta.isSuperOferta) {
        const ofertaProduct = { ...mappedProduct };
        ofertaProduct.categoria = 'Oferta';
        ofertaProduct.codigo = `${mappedProduct.codigo}_OFERTA`; // Código único para oferta
        ofertaProduct.nome = mappedProduct.nome; // Nome sem foguinho
        ofertaProduct.preco_exclusivo = mappedProduct.preco_varejo * (1 - superOferta.desconto / 100); // Aplicar desconto da SO
        
        console.log(`   🔥 Criando Super Oferta: ${ofertaProduct.nome}`);
        console.log(`   🔥 Preço com ${superOferta.desconto}% desconto: R$ ${ofertaProduct.preco_exclusivo.toFixed(2)}`);
        
        await insertOrUpdateProduct(ofertaProduct, pool);
        syncedCount++;
      }
    }
    
    console.log(`\n🎉 Sincronização concluída!`);
    console.log(`📊 Total de produtos processados: ${appProducts.length}`);
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
    const allCategories = Object.values(appTagMapping);
    const emptyCategories = allCategories.filter(cat => !categoryStats[cat]);
    if (emptyCategories.length > 0) {
      console.log('\n❌ Categorias vazias:');
      emptyCategories.forEach(cat => {
        console.log(`   ${cat}: 0 produtos`);
      });
    }
    
    // Mostrar exemplos de tags encontradas
    console.log('\n🏷️ Exemplos de tags "APP" encontradas:');
    const uniqueTags = [...new Set(appProducts.map(p => p.tags))];
    uniqueTags.forEach(tag => {
      console.log(`   "${tag}"`);
    });
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
  } finally {
    await pool.end();
  }
}

// Função para determinar categoria baseada na tag APP
function determineCategoryFromAppTag(tags) {
  if (!tags) return 'Casa'; // Categoria padrão
  
  const tagsLower = tags.toLowerCase();
  
  // Buscar por mapeamento de tags APP (cada tag é uma categoria separada)
  for (const [appTag, category] of Object.entries(appTagMapping)) {
    if (tagsLower.includes(appTag.toLowerCase())) {
      return category;
    }
  }
  
  // Fallback: buscar por palavras-chave específicas
  if (tagsLower.includes('beleza') && tagsLower.includes('app')) return 'Beleza';
  if (tagsLower.includes('papelaria') && tagsLower.includes('app')) return 'Papelaria';
  if (tagsLower.includes('casa') && tagsLower.includes('app')) return 'Casa';
  if (tagsLower.includes('brinquedos') && tagsLower.includes('app')) return 'Brinquedos';
  if (tagsLower.includes('tecnologia') && tagsLower.includes('app')) return 'Tecnologia';
  if (tagsLower.includes('pets') && tagsLower.includes('app')) return 'Pets';
  if (tagsLower.includes('cameba') && tagsLower.includes('app')) return 'Cameba';
  if (tagsLower.includes('led') && tagsLower.includes('app')) return 'Led';
  if (tagsLower.includes('utensílios') && tagsLower.includes('app')) return 'Utensílios';
  if (tagsLower.includes('utilidades') && tagsLower.includes('app')) return 'Utilidades';
  if (tagsLower.includes('variedades') && tagsLower.includes('app')) return 'Variedades';
  if (tagsLower.includes('eletrônicos') && tagsLower.includes('app')) return 'Eletrônicos';
  if (tagsLower.includes('decoração') && tagsLower.includes('app')) return 'Decoração';
  if (tagsLower.includes('conveniência') && tagsLower.includes('app')) return 'Conveniência';
  if (tagsLower.includes('bijuteria') && tagsLower.includes('app')) return 'Bijuteria';
  
  // Categoria padrão
  return 'Casa';
}

// Executar sincronização
syncAppTagsOnly();
