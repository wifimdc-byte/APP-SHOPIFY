const shopifyService = require('./src/services/shopifyService');
const pool = require('./src/database/connection');

async function syncProductImages(codigo) {
  try {
    console.log(`🔄 Re-sincronizando imagens do produto ${codigo}...`);
    
    // Buscar produto do Shopify
    const shopifyProduct = await shopifyService.getProduct(codigo);
    
    if (!shopifyProduct) {
      console.error('❌ Produto não encontrado no Shopify');
      process.exit(1);
    }
    
    console.log(`📦 Produto encontrado: ${shopifyProduct.title}`);
    console.log(`🖼️ Imagens no Shopify: ${shopifyProduct.images?.length || 0}`);
    
    if (shopifyProduct.images && shopifyProduct.images.length > 0) {
      shopifyProduct.images.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.src.substring(0, 80)}...`);
      });
    }
    
    // Mapear produto
    const mappedProduct = shopifyService.mapProductToApp(shopifyProduct);
    
    if (!mappedProduct) {
      console.error('❌ Erro ao mapear produto');
      process.exit(1);
    }
    
    console.log(`🖼️ Imagens mapeadas: ${mappedProduct.imagens?.length || 0}`);
    
    // Atualizar no banco
    const result = await pool.query(`
      UPDATE melhor_casas_products 
      SET imagens = $1::jsonb, imagem_url = $2, updated_at = $3
      WHERE codigo = $4
      RETURNING id, nome, imagens
    `, [
      JSON.stringify(mappedProduct.imagens || []),
      mappedProduct.imagem_url,
      new Date(),
      mappedProduct.codigo
    ]);
    
    if (result.rows.length > 0) {
      const updated = result.rows[0];
      const imagensParsed = typeof updated.imagens === 'string' 
        ? JSON.parse(updated.imagens) 
        : updated.imagens;
      
      console.log(`✅ Produto atualizado!`);
      console.log(`   Nome: ${updated.nome}`);
      console.log(`   Imagens salvas: ${imagensParsed.length}`);
      imagensParsed.forEach((img, index) => {
        console.log(`   ${index + 1}. ${img.substring(0, 80)}...`);
      });
    } else {
      console.error('❌ Produto não encontrado no banco de dados');
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

const codigo = process.argv[2];
if (!codigo) {
  console.error('❌ Uso: node sync-product-images.js <codigo_shopify>');
  process.exit(1);
}

syncProductImages(codigo);







