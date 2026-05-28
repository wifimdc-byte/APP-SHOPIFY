const shopifyService = require('./src/services/shopifyService');

// Script para testar verificação de estoque
async function checkInventory() {
  try {
    const productCode = process.argv[2];
    
    if (!productCode) {
      console.error('❌ Uso: node check-inventory.js <codigo_produto>');
      console.error('   Exemplo: node check-inventory.js 10459007090993');
      process.exit(1);
    }

    console.log(`🔍 Verificando estoque para produto: ${productCode}\n`);
    
    const inventory = await shopifyService.getInventoryByVariantCode(productCode);
    
    if (!inventory) {
      console.log('❌ Produto não encontrado ou sem estoque disponível');
      process.exit(1);
    }

    console.log('✅ Estoque encontrado:');
    console.log(`   Produto: ${inventory.product.title}`);
    console.log(`   Variante: ${inventory.title}`);
    console.log(`   SKU: ${inventory.sku || 'N/A'}`);
    console.log(`   Quantidade Disponível: ${inventory.quantityAvailable}`);
    console.log(`   Disponível para Venda: ${inventory.availableForSale ? 'Sim' : 'Não'}`);
    console.log(`   ID Variante: ${inventory.variantId}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

checkInventory();
