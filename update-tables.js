const fs = require('fs');
const path = require('path');

// Mapeamento de tabelas antigas para novas
const tableMapping = {
  'users': 'melhor_casas_users',
  'products': 'melhor_casas_products',
  'orders': 'melhor_casas_orders',
  'order_items': 'melhor_casas_order_items',
  'user_favorites': 'melhor_casas_user_favorites'
};

// Arquivos para atualizar
const filesToUpdate = [
  'src/routes/auth.js',
  'src/routes/products.js',
  'src/routes/users.js',
  'src/routes/orders.js',
  'src/middleware/auth.js'
];

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Substituir referências de tabelas
    Object.entries(tableMapping).forEach(([oldTable, newTable]) => {
      const regex = new RegExp(`\\b${oldTable}\\b`, 'g');
      content = content.replace(regex, newTable);
    });
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Atualizado: ${filePath}`);
  } catch (error) {
    console.error(`❌ Erro ao atualizar ${filePath}:`, error.message);
  }
}

console.log('🔄 Atualizando referências de tabelas...');

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    updateFile(filePath);
  } else {
    console.log(`⚠️ Arquivo não encontrado: ${file}`);
  }
});

console.log('🎉 Atualização concluída!');





