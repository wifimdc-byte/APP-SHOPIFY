const newProductsSyncService = require('./src/services/newProductsSyncService');

async function main() {
  try {
    console.log('Iniciando sincronização manual...');
    await newProductsSyncService.forceSync();
    console.log('Sincronização concluída!');
    console.log('Status:', newProductsSyncService.getStatus());
    process.exit(0);
  } catch (error) {
    console.error('Erro:', error);
    process.exit(1);
  }
}

main();