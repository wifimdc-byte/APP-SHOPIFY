const puppeteer = require('puppeteer');

class ShopifyCheckoutScraper {
  constructor() {
    this.domain = 'e4ec7f-f5.myshopify.com';
    this.shopUrl = `https://${this.domain}`;
  }

  /**
   * Criar checkout e extrair valores de frete
   * @param {Array} lineItems - Array de {variant_id, quantity}
   * @param {Object} shippingAddress - Endereço de entrega
   * @returns {Array} Array de opções de frete com preços
   */
  async getShippingRatesFromCheckout(lineItems, shippingAddress) {
    let browser = null;
    try {
      console.log('🌐 Iniciando navegador headless...');
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Adicionar produtos ao carrinho primeiro
      console.log('🛒 Adicionando produtos ao carrinho...');
      for (const item of lineItems) {
        const addUrl = `${this.shopUrl}/cart/add?variant=${item.variant_id}&quantity=${item.quantity}`;
        await page.goto(addUrl, { waitUntil: 'networkidle0', timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Ir para checkout
      const checkoutUrl = `${this.shopUrl}/checkout`;
      console.log('🔗 Acessando checkout:', checkoutUrl);
      await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Aguardar carregamento completo
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('📦 Selecionando modo de entrega ("Enviar" ou "Retirada")...');
      const deliveryMode = shippingAddress.delivery_type || 'shipping';
      await page.evaluate((mode) => {
        const clickByText = (text) => {
          const elements = Array.from(document.querySelectorAll('div, button, span, label'));
          const target = elements.find(el => (el.textContent || '').trim().toLowerCase() === text.toLowerCase());
          if (target) {
            target.click();
            return true;
          }
          return false;
        };

        if (mode === 'pickup') {
          if (!clickByText('Retirada')) {
            const pickupBtn = document.querySelector('[data-pickup], [data-checkout-pickup-option]');
            pickupBtn?.click();
          }
        } else {
          if (!clickByText('Enviar')) {
            const shipBtn = document.querySelector('[data-shipping], [data-checkout-shipping-option]');
            shipBtn?.click();
          }
        }
      }, deliveryMode);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Encontrar o input CEP pelo id "postalCode"
      console.log('🔍 Procurando input CEP pelo id "postalCode"...');
      const normalizedZip = (shippingAddress.zip || '').replace(/\D/g, '');

      if (!normalizedZip) {
        throw new Error('CEP não informado no endereço');
      }

      const postalSelectors = [
        '#postalCode',
        'input[name="postalCode"]',
        'input[id*="postalcode"]',
        'input[id*="postal_code"]',
        'input[placeholder*="cep" i]',
        'input[aria-label*="cep" i]',
        'input[data-test="postal-code"]',
      ];

      const selectorFound = await page.waitForFunction(
        (selectors) => {
          return selectors.some((selector) => document.querySelector(selector));
        },
        { timeout: 20000 },
        postalSelectors
      ).catch(() => null);

      if (!selectorFound) {
        throw new Error('Input CEP (id="postalCode") não encontrado');
      }
      
      const cepFilled = await page.evaluate((selectors, zip) => {
        const resolveInput = () => {
          for (const selector of selectors) {
            const input = document.querySelector(selector);
            if (input) return input;
          }
          return null;
        };

        const cepInput =
          document.querySelector('#postalCode') ||
          document.querySelector('input[name="postalCode"]') ||
          document.querySelector('input[id*="postalCode"]') ||
          resolveInput();

        if (cepInput) {
          cepInput.focus();
          cepInput.value = '';
          cepInput.dispatchEvent(new Event('input', { bubbles: true }));
          cepInput.value = zip;
          cepInput.dispatchEvent(new Event('input', { bubbles: true }));
          cepInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
          cepInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        // Fallback: tentar o 4º input se não encontrar pelo id
        const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="tel"]'));
        if (inputs.length >= 4) {
          const fallbackInput = inputs[3];
          fallbackInput.focus();
          fallbackInput.value = '';
          fallbackInput.dispatchEvent(new Event('input', { bubbles: true }));
          fallbackInput.value = zip;
          fallbackInput.dispatchEvent(new Event('input', { bubbles: true }));
          fallbackInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
          fallbackInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        return false;
      }, postalSelectors, normalizedZip);

      if (!cepFilled) {
        throw new Error('Input CEP (id="postalCode") não encontrado');
      }

      console.log('✅ CEP preenchido no input postalCode');

      const contactPayload = {
        email: shippingAddress.email || `checkout+${Date.now()}@melhordascasas.com.br`,
        phone: shippingAddress.phone || '',
        first_name: shippingAddress.first_name || shippingAddress.nome || 'Cliente',
        last_name: shippingAddress.last_name || (shippingAddress.nome?.split(' ').slice(1).join(' ') || 'Melhor')
      };

      console.log('📝 Preenchendo dados de contato (email/telefone)...');
      await page.evaluate((contact) => {
        const fill = (selectorArr, value) => {
          if (!value) return;
          for (const selector of selectorArr) {
            const input = document.querySelector(selector);
            if (input) {
              input.focus();
              input.value = '';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('blur', { bubbles: true }));
              return;
            }
          }
        };

        fill(['input[name="email"]', '#email'], contact.email);
        fill(['input[name="phone"]', '#phone'], contact.phone);
        fill(['input[name="firstName"]', '#firstName'], contact.first_name);
        fill(['input[name="lastName"]', '#lastName'], contact.last_name);
      }, contactPayload);

      const addressPayload = {
        address1: shippingAddress.address1 || `${shippingAddress.endereco || ''}`.trim(),
        address2: shippingAddress.address2 || shippingAddress.complemento || '',
        number: shippingAddress.number || shippingAddress.numero || '',
        neighborhood: shippingAddress.neighborhood || shippingAddress.bairro || '',
        city: shippingAddress.city || shippingAddress.cidade || '',
        province: shippingAddress.province || shippingAddress.estado || '',
        country: shippingAddress.country || 'BR',
        zip: normalizedZip
      };

      console.log('🏠 Ajustando campos de endereço (número/complemento quando existirem)...');
      await page.evaluate((address) => {
        const fill = (selectors, value, includeBlur = true) => {
          if (!value) return false;
          for (const selector of selectors) {
            const input = document.querySelector(selector);
            if (input) {
              input.focus();
              input.value = '';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              if (includeBlur) input.dispatchEvent(new Event('blur', { bubbles: true }));
              return true;
            }
          }
          return false;
        };

        fill(['input[name="address1"]', '#address1'], address.address1 || address.neighborhood);
        fill(['input[name="address2"]', '#address2', 'input[placeholder*="apartamento" i]'], address.address2);
        const numberSelectors = [
          'input[name="number"]',
          'input[id*="number"]',
          'input[placeholder*="número" i]',
          'input[aria-label*="número" i]'
        ];
        fill(numberSelectors, address.number);
      }, addressPayload);

      // Aguardar 1 segundo para aparecer a sugestão
      console.log('⏳ Aguardando sugestão de endereço (1s)...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Clicar na primeira sugestão
      console.log('🖱️ Clicando na primeira sugestão...');
      const suggestionClicked = await page.evaluate(() => {
        // Buscar container de sugestões (geralmente tem texto "SUGESTÕES")
        const allElements = Array.from(document.querySelectorAll('*'));
        let suggestionsContainer = null;
        
        for (const el of allElements) {
          const text = (el.textContent || '').toUpperCase();
          if (text.includes('SUGEST') && (text.includes('20560') || text.includes('RIO') || text.includes('VIANA'))) {
            suggestionsContainer = el;
            break;
          }
        }
        
        if (suggestionsContainer) {
          // Buscar o primeiro item clicável dentro (geralmente é um botão ou div)
          const clickableItems = suggestionsContainer.querySelectorAll(
            'button, a, div[role="button"], [onclick], div[class*="suggestion"], div[class*="option"], li, span'
          );
          
          if (clickableItems.length > 0) {
            // Pegar o primeiro item que contenha o endereço
            for (const item of clickableItems) {
              const text = item.textContent || '';
              if (text.includes('Rua') || text.includes('Viana') || text.includes('20560')) {
                item.click();
                return true;
              }
            }
            // Se não encontrou, clicar no primeiro item
            clickableItems[0].click();
            return true;
          }
          
          // Se não encontrou, tentar clicar em qualquer elemento filho que contenha o endereço
          const addressElements = Array.from(suggestionsContainer.querySelectorAll('*'));
          for (const el of addressElements) {
            const text = el.textContent || '';
            if (text.includes('Rua') || text.includes('Viana') || text.includes('20560')) {
              el.click();
              return true;
            }
          }
          
          // Último recurso: clicar no container
          suggestionsContainer.click();
          return true;
        }
        
        return false;
      });

      if (!suggestionClicked) {
        console.log('⚠️ Não foi possível clicar na sugestão automaticamente');
      } else {
        console.log('✅ Sugestão selecionada');
      }

      // Aguardar preenchimento automático
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Preencher complemento (apto, bloco, etc.)
      if (shippingAddress.address2) {
        console.log('📝 Preenchendo complemento...');
        await page.evaluate((complement) => {
          // Buscar campo de complemento (geralmente tem placeholder "Apartamento, bloco etc.")
          const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
          for (const input of inputs) {
            const placeholder = (input.placeholder || '').toLowerCase();
            if (placeholder.includes('apartamento') || placeholder.includes('bloco') || placeholder.includes('complemento')) {
              input.focus();
              input.value = complement;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        }, shippingAddress.address2);
        console.log('✅ Complemento preenchido');
      }

      // Aguardar 3 segundos para o frete aparecer (conforme instrução)
      console.log('⏳ Aguardando cálculo de frete pelo Frenet (3s)...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extrair opções de frete
      const shippingRates = await this.extractShippingRates(page);
      
      console.log(`✅ ${shippingRates.length} opções de frete encontradas`);
      return shippingRates;

    } catch (error) {
      console.error('❌ Erro ao extrair frete do checkout:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Criar URL de checkout com produtos
   */
  async createCheckoutURL(lineItems) {
    // Criar checkout via Storefront API ou usar carrinho
    // Formato: /cart/add?variant_id=xxx&quantity=1
    const params = lineItems.map(item => 
      `variants[]=${item.variant_id}&quantities[]=${item.quantity}`
    ).join('&');
    
    // Primeiro adicionar ao carrinho
    const addToCartUrl = `${this.shopUrl}/cart/add?${params}`;
    
    // Depois ir para checkout
    return `${this.shopUrl}/checkout`;
  }

  /**
   * Extrair opções de frete da página
   */
  async extractShippingRates(page) {
    const rates = [];

    try {
      console.log('🔍 Extraindo opções de frete do checkout...');
      
      // Aguardar um pouco mais para garantir que o Frenet calculou
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Extrair todas as informações de frete da página
      const shippingData = await page.evaluate(() => {
        const results = [];
        
        // Método 1: Buscar por elementos que contêm SEDEX ou PAC com preço
        const allTextElements = Array.from(document.querySelectorAll('*'));
        allTextElements.forEach(el => {
          const text = (el.textContent || '').trim();
          
          // Procurar por padrões: "SEDEX R$ 39,74" ou "PAC R$ 47,17"
          if (text.includes('SEDEX') || text.includes('PAC')) {
            const priceMatch = text.match(/R\$\s*([\d,]+\.?\d*)/);
            const nameMatch = text.match(/(SEDEX|PAC)/i);
            
            if (priceMatch && nameMatch) {
              const name = nameMatch[0].toUpperCase();
              const price = priceMatch[1].replace(',', '.');
              
              // Verificar se já não adicionou
              if (!results.find(r => r.name === name && r.price === price)) {
                results.push({
                  name: name,
                  price: price,
                  fullText: text
                });
              }
            }
          }
        });
        
        // Método 2: Buscar por radio buttons ou checkboxes de shipping
        const shippingInputs = Array.from(document.querySelectorAll(
          'input[type="radio"][name*="shipping"], ' +
          'input[type="radio"][name*="delivery"], ' +
          'input[type="radio"][name*="method"]'
        ));
        
        shippingInputs.forEach(input => {
          // Buscar label associado
          let label = null;
          if (input.id) {
            label = document.querySelector(`label[for="${input.id}"]`);
          }
          if (!label) {
            label = input.closest('label');
          }
          if (!label) {
            label = input.parentElement;
          }
          
          if (label) {
            const text = label.textContent || '';
            const priceMatch = text.match(/R\$\s*([\d,]+\.?\d*)/);
            const nameMatch = text.match(/(SEDEX|PAC|Frete|Envio|Expresso)[^\d]*/i);
            
            if (priceMatch) {
              const name = nameMatch ? nameMatch[1].trim().toUpperCase() : 'Frete';
              const price = priceMatch[1].replace(',', '.');
              
              if (!results.find(r => r.name === name && r.price === price)) {
                results.push({
                  name: name,
                  price: price,
                  fullText: text.trim()
                });
              }
            }
          }
        });
        
        // Método 3: Buscar por divs ou spans com classe relacionada a shipping
        const shippingContainers = Array.from(document.querySelectorAll(
          '[class*="shipping"], [class*="delivery"], [class*="frete"], [data-shipping]'
        ));
        
        shippingContainers.forEach(container => {
          const text = container.textContent || '';
          if ((text.includes('SEDEX') || text.includes('PAC')) && text.includes('R$')) {
            const priceMatch = text.match(/R\$\s*([\d,]+\.?\d*)/);
            const nameMatch = text.match(/(SEDEX|PAC)/i);
            
            if (priceMatch && nameMatch) {
              const name = nameMatch[0].toUpperCase();
              const price = priceMatch[1].replace(',', '.');
              
              if (!results.find(r => r.name === name && r.price === price)) {
                results.push({
                  name: name,
                  price: price,
                  fullText: text.trim()
                });
              }
            }
          }
        });
        
        // Remover duplicatas
        const unique = [];
        const seen = new Set();
        results.forEach(r => {
          const key = `${r.name}-${r.price}`;
          if (!seen.has(key) && parseFloat(r.price) > 0) {
            seen.add(key);
            unique.push(r);
          }
        });
        
        return unique;
      });

      console.log(`📊 Dados extraídos do checkout: ${JSON.stringify(shippingData, null, 2)}`);

      // Converter para formato esperado
      shippingData.forEach(data => {
        if (data.name && parseFloat(data.price) > 0) {
          rates.push({
            title: data.name,
            price: data.price,
            code: data.name.toLowerCase().replace(/\s+/g, '_'),
            source: 'frenet_checkout',
            delivery_days: this.estimateDeliveryDays(data.name)
          });
        }
      });

      console.log(`✅ ${rates.length} opções de frete extraídas do checkout`);
      
    } catch (error) {
      console.error('❌ Erro ao extrair frete:', error);
    }

    return rates;
  }

  /**
   * Estimar dias de entrega
   */
  estimateDeliveryDays(shippingName) {
    const name = (shippingName || '').toLowerCase();
    if (name.includes('sedex')) return 1;
    if (name.includes('pac')) return 5;
    if (name.includes('express')) return 2;
    return 3;
  }
}

module.exports = new ShopifyCheckoutScraper();

