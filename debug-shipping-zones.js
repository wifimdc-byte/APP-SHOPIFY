const shopifyService = require('./src/services/shopifyService');

async function debugShippingZones() {
  try {
    console.log('🔍 Buscando shipping zones...');
    
    const zonesResponse = await shopifyService.client.get('/shipping_zones.json');
    const zones = zonesResponse.data.shipping_zones || [];
    
    console.log(`\n📦 Total de zonas encontradas: ${zones.length}\n`);
    
    zones.forEach((zone, index) => {
      console.log(`\n=== Zona ${index + 1}: ${zone.name} ===`);
      console.log('Países:', zone.countries?.map(c => c.code).join(', ') || 'N/A');
      console.log('Estados:', zone.provinces?.map(p => p.code).join(', ') || 'Todos');
      
      // Carrier rates
      if (zone.carrier_shipping_rate_providers && zone.carrier_shipping_rate_providers.length > 0) {
        console.log('\n🚚 Carrier Rates:');
        zone.carrier_shipping_rate_providers.forEach(rate => {
          console.log(`  - ${rate.name || rate.carrier_service_type || 'N/A'}`);
          console.log(`    Tipo: ${rate.carrier_service_type || 'N/A'}`);
          console.log(`    Ativo: ${rate.active || false}`);
        });
      }
      
      // Weight-based rates
      if (zone.weight_based_shipping_rates && zone.weight_based_shipping_rates.length > 0) {
        console.log('\n⚖️ Weight-based Rates:');
        zone.weight_based_shipping_rates.forEach(rate => {
          console.log(`  - ${rate.name || 'N/A'}`);
          console.log(`    Preço: R$ ${rate.price || '0.00'}`);
          console.log(`    Código: ${rate.code || 'N/A'}`);
        });
      }
      
      // Price-based rates
      if (zone.price_based_shipping_rates && zone.price_based_shipping_rates.length > 0) {
        console.log('\n💰 Price-based Rates:');
        zone.price_based_shipping_rates.forEach(rate => {
          console.log(`  - ${rate.name || 'N/A'}`);
          console.log(`    Preço: R$ ${rate.price || '0.00'}`);
          console.log(`    Código: ${rate.code || 'N/A'}`);
        });
      }
    });
    
    // Testar com um endereço
    console.log('\n\n🧪 Testando cálculo de frete...');
    const testAddress = {
      first_name: 'Test',
      last_name: 'User',
      address1: 'Rua Teste',
      city: 'Rio de Janeiro',
      province: 'RJ',
      country: 'BR',
      zip: '20000-000'
    };
    
    const testLineItems = [{
      variant_id: 123456789, // ID de exemplo
      quantity: 1
    }];
    
    const rates = await shopifyService.calculateShippingRates(testLineItems, testAddress);
    console.log('\n📊 Rates retornados:');
    console.log(JSON.stringify(rates, null, 2));
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
    console.error('Stack:', error.stack);
  }
  
  process.exit(0);
}

debugShippingZones();


