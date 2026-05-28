const orderNotificationService = require('./orderNotificationService');

let intervalId = null;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos por padrão

const start = () => {
  if (intervalId) {
    console.log('⚠️ [OrderNotificationScheduler] Já está rodando');
    return;
  }

  const intervalMs = parseInt(process.env.ORDER_NOTIFICATION_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  
  console.log(`🔔 [OrderNotificationScheduler] Iniciando scheduler de notificações de pedidos`);
  console.log(`⏰ [OrderNotificationScheduler] Intervalo: ${intervalMs / 1000} segundos`);
  
  // Executar imediatamente na primeira vez
  orderNotificationService.processOrderNotifications().catch(err => {
    console.error('❌ [OrderNotificationScheduler] Erro na execução inicial:', err.message);
  });
  
  // Agendar execuções periódicas
  intervalId = setInterval(() => {
    console.log('🔔 [OrderNotificationScheduler] Executando verificação de notificações...');
    orderNotificationService.processOrderNotifications().catch(err => {
      console.error('❌ [OrderNotificationScheduler] Erro na execução:', err.message);
    });
  }, intervalMs);
};

const stop = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 [OrderNotificationScheduler] Scheduler parado');
  }
};

const runOnce = async () => {
  console.log('🔔 [OrderNotificationScheduler] Executando verificação única...');
  return await orderNotificationService.processOrderNotifications();
};

module.exports = {
  start,
  stop,
  runOnce
};

