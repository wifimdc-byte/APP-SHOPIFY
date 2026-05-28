const axios = require('axios');

class ShopifyWebhookSetup {
  constructor() {
    this.domain = 'e4ec7f-f5.myshopify.com';
    this.adminToken = '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';
    this.baseURL = `https://${this.domain}/admin/api/2024-01`;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Shopify-Access-Token': this.adminToken,
        'Content-Type': 'application/json',
      },
    });
  }

  // URL do webhook (substitua pelo seu domínio)
  getWebhookURL() {
    // Para desenvolvimento local, você pode usar ngrok ou similar
    return 'https://seu-dominio.com/api/shopify/webhook';
  }

  // Configurar webhooks
  async setupWebhooks() {
    const webhooks = [
      {
        topic: 'products/create',
        address: `${this.getWebhookURL()}/products/create`,
        format: 'json'
      },
      {
        topic: 'products/update',
        address: `${this.getWebhookURL()}/products/update`,
        format: 'json'
      },
      {
        topic: 'products/delete',
        address: `${this.getWebhookURL()}/products/delete`,
        format: 'json'
      },
      {
        topic: 'orders/create',
        address: `${this.getWebhookURL()}/orders/create`,
        format: 'json'
      },
      {
        topic: 'orders/update',
        address: `${this.getWebhookURL()}/orders/update`,
        format: 'json'
      },
      {
        topic: 'fulfillments/create',
        address: `${this.getWebhookURL()}/fulfillments/create`,
        format: 'json'
      },
      {
        topic: 'fulfillments/update',
        address: `${this.getWebhookURL()}/fulfillments/update`,
        format: 'json'
      },
      {
        topic: 'fulfillment_orders/line_items_prepared_for_pickup',
        address: `${this.getWebhookURL()}/fulfillment_orders/line_items_prepared_for_pickup`,
        format: 'json'
      },
      {
        topic: 'fulfillment_orders/line_items_prepared_for_local_delivery',
        address: `${this.getWebhookURL()}/fulfillment_orders/line_items_prepared_for_local_delivery`,
        format: 'json'
      }
    ];

    console.log('🔄 Configurando webhooks do Shopify...');
    console.log('📡 URL base dos webhooks:', this.getWebhookURL());

    for (const webhook of webhooks) {
      try {
        // Verificar se webhook já existe
        const existingWebhooks = await this.client.get('/webhooks.json');
        const existing = existingWebhooks.data.webhooks.find(
          w => w.topic === webhook.topic && w.address.includes('api/shopify/webhook')
        );

        if (existing) {
          console.log(`⚠️  Webhook ${webhook.topic} já existe (ID: ${existing.id})`);
          continue;
        }

        // Criar webhook
        const response = await this.client.post('/webhooks.json', { webhook });
        console.log(`✅ Webhook ${webhook.topic} criado com sucesso (ID: ${response.data.webhook.id})`);
        
      } catch (error) {
        console.error(`❌ Erro ao criar webhook ${webhook.topic}:`, error.response?.data || error.message);
      }
    }
  }

  // Listar webhooks existentes
  async listWebhooks() {
    try {
      const response = await this.client.get('/webhooks.json');
      console.log('\n📋 Webhooks existentes:');
      
      if (response.data.webhooks.length === 0) {
        console.log('   Nenhum webhook configurado');
        return;
      }

      response.data.webhooks.forEach(webhook => {
        console.log(`   ${webhook.topic} -> ${webhook.address} (ID: ${webhook.id})`);
      });
      
    } catch (error) {
      console.error('❌ Erro ao listar webhooks:', error.response?.data || error.message);
    }
  }

  // Deletar webhooks
  async deleteWebhooks() {
    try {
      const response = await this.client.get('/webhooks.json');
      
      for (const webhook of response.data.webhooks) {
        if (webhook.address.includes('api/shopify/webhook')) {
          await this.client.delete(`/webhooks/${webhook.id}.json`);
          console.log(`🗑️  Webhook ${webhook.topic} deletado (ID: ${webhook.id})`);
        }
      }
      
    } catch (error) {
      console.error('❌ Erro ao deletar webhooks:', error.response?.data || error.message);
    }
  }
}

// Executar setup
async function main() {
  const setup = new ShopifyWebhookSetup();
  
  console.log('🛍️  Configuração de Webhooks Shopify');
  console.log('=====================================');
  
  // Listar webhooks existentes
  await setup.listWebhooks();
  
  console.log('\n⚠️  IMPORTANTE:');
  console.log('1. Substitua a URL do webhook no código pelo seu domínio real');
  console.log('2. Para desenvolvimento local, use ngrok: npx ngrok http 3001');
  console.log('3. Atualize a URL no método getWebhookURL()');
  
  // Descomente a linha abaixo para configurar webhooks
  // await setup.setupWebhooks();
}

main();




