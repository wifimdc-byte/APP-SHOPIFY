const pool = require('./src/database/connection');

async function testEvents() {
  try {
    console.log('🔍 Verificando eventos no banco...\n');
    
    // Verificar todos os eventos
    const allEvents = await pool.query(`
      SELECT 
        id, event_name, user_id, user_email, cart_value, product_quantity, product_id,
        created_at
      FROM analytics_events
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`📊 Total de eventos encontrados (últimos 10): ${allEvents.rows.length}`);
    allEvents.rows.forEach((event, i) => {
      console.log(`\n${i + 1}. Evento:`);
      console.log(`   ID: ${event.id}`);
      console.log(`   Nome: ${event.event_name}`);
      console.log(`   User ID: ${event.user_id || 'null'}`);
      console.log(`   User Email: ${event.user_email || 'null'}`);
      console.log(`   User Name: ${event.user_name || 'null'}`);
      console.log(`   Cart Value: ${event.cart_value || 'null'}`);
      console.log(`   Product Quantity: ${event.product_quantity || 'null'}`);
      console.log(`   Product ID: ${event.product_id || 'null'}`);
      console.log(`   Checkout ID: ${event.checkout_id || 'null'}`);
      console.log(`   Created At: ${event.created_at}`);
    });
    
    // Testar a query que o getDetailedEvents usa
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date();
    
    console.log(`\n🔍 Testando query de eventos detalhados (últimos 7 dias):`);
    console.log(`   Start: ${start}`);
    console.log(`   End: ${end}`);
    
    const testQuery = await pool.query(`
      SELECT 
        id, event_name, user_id, user_email, cart_value, product_quantity, product_id,
        created_at
      FROM analytics_events
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at DESC
      LIMIT 50 OFFSET 0
    `, [start, end]);
    
    console.log(`\n📋 Eventos encontrados pela query: ${testQuery.rows.length}`);
    testQuery.rows.forEach((event, i) => {
      console.log(`   ${i + 1}. ${event.event_name} - ${event.created_at}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

testEvents();

