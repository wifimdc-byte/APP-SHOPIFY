# 🛒 Storefront API para Checkout - Guia Completo

## 📋 **Situação Atual vs. Storefront API**

### ❌ **Checkout Atual (WebView)**

**Como funciona:**
1. Backend gera URL: `https://shop.myshopify.com/cart/{variant_id}:{quantity}`
2. App abre WebView com essa URL
3. Usuário preenche formulário HTML do Shopify
4. JavaScript injetado tenta automatizar preenchimento
5. Navegação complexa entre checkout → Mercado Pago → confirmação

**Problemas:**
- ⚠️ **Lento**: Carrega página HTML completa
- ⚠️ **Fragil**: Depende de scraping/injeção de JavaScript
- ⚠️ **Complexo**: Múltiplas telas, navegação difícil
- ⚠️ **Sem controle**: Não controla o fluxo completamente
- ⚠️ **Cálculo de frete**: Precisa fazer scraping da página
- ⚠️ **UX ruim**: WebView não é nativo

---

### ✅ **Checkout com Storefront API (GraphQL)**

**Como funciona:**
1. Backend cria **Cart** via GraphQL
2. Adiciona produtos ao cart
3. Define endereço de entrega
4. **Calcula frete automaticamente** via API
5. Cria checkout e processa pagamento
6. Tudo via API, sem WebView!

**Vantagens:**
- ✅ **Rápido**: Apenas chamadas API (sem HTML)
- ✅ **Nativo**: UI completamente customizada no app
- ✅ **Controle total**: Você controla todo o fluxo
- ✅ **Frete automático**: API calcula opções de frete
- ✅ **Melhor UX**: Experiência nativa, não WebView
- ✅ **Mais confiável**: Não depende de scraping

---

## 🎯 **O que a Storefront API oferece para Checkout**

### 1. **Cart Management (Gerenciamento de Carrinho)**

#### Criar Carrinho
```graphql
mutation cartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      id
      checkoutUrl
      lines(first: 100) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
      cost {
        totalAmount {
          amount
          currencyCode
        }
        subtotalAmount {
          amount
          currencyCode
        }
        totalTaxAmount {
          amount
          currencyCode
        }
      }
    }
  }
}
```

#### Adicionar Produtos
```graphql
mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart {
      id
      lines(first: 100) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                price {
                  amount
                }
              }
            }
          }
        }
      }
    }
  }
}
```

#### Atualizar Quantidade
```graphql
mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
  cartLinesUpdate(cartId: $cartId, lines: $lines) {
    cart {
      id
      lines(first: 100) {
        edges {
          node {
            id
            quantity
          }
        }
      }
    }
  }
}
```

#### Remover Produtos
```graphql
mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
    cart {
      id
      lines(first: 100) {
        edges {
          node {
            id
          }
        }
      }
    }
  }
}
```

---

### 2. **Shipping Rates (Cálculo de Frete)**

#### Definir Endereço de Entrega
```graphql
mutation cartBuyerIdentityUpdate(
  $cartId: ID!
  $buyerIdentity: CartBuyerIdentityInput!
) {
  cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
    cart {
      id
      deliveryGroups {
        deliveryOptions {
          handle
          title
          cost {
            amount
            currencyCode
          }
        }
      }
    }
  }
}
```

#### Buscar Opções de Frete
```graphql
query getCart($id: ID!) {
  cart(id: $id) {
    id
    deliveryGroups {
      deliveryOptions {
        handle
        title
        cost {
          amount
          currencyCode
        }
        estimatedTimeRange {
          min
          max
        }
      }
      groupType
      deliveryAddress {
        address1
        city
        province
        countryCodeV2
        zip
      }
    }
  }
}
```

**Vantagens:**
- ✅ **Automático**: Shopify calcula todas as opções
- ✅ **Em tempo real**: Baseado no endereço exato
- ✅ **Suporte a transportadoras**: Se você tiver Shopify Advanced/Plus
- ✅ **Sem scraping**: Tudo via API

---

### 3. **Checkout Creation (Criação de Checkout)**

#### Criar Checkout
```graphql
mutation checkoutCreate($input: CheckoutCreateInput!) {
  checkoutCreate(input: $input) {
    checkout {
      id
      webUrl
      email
      shippingAddress {
        address1
        city
        province
        countryCodeV2
        zip
      }
      shippingLine {
        title
        price {
          amount
        }
      }
      lineItems(first: 100) {
        edges {
          node {
            id
            title
            quantity
            variant {
              id
              title
              price {
                amount
              }
            }
          }
        }
      }
      totalPrice {
        amount
        currencyCode
      }
      subtotalPrice {
        amount
        currencyCode
      }
      totalTax {
        amount
        currencyCode
      }
    }
  }
}
```

#### Atualizar Checkout
```graphql
mutation checkoutShippingAddressUpdateV2(
  $checkoutId: ID!
  $shippingAddress: MailingAddressInput!
) {
  checkoutShippingAddressUpdateV2(
    checkoutId: $checkoutId
    shippingAddress: $shippingAddress
  ) {
    checkout {
      id
      shippingAddress {
        address1
        city
        province
        zip
      }
      availableShippingRates {
        handle
        title
        price {
          amount
        }
      }
    }
  }
}
```

---

### 4. **Discount Codes (Cupons)**

#### Aplicar Cupom
```graphql
mutation checkoutDiscountCodeApplyV2(
  $checkoutId: ID!
  $discountCode: String!
) {
  checkoutDiscountCodeApplyV2(
    checkoutId: $checkoutId
    discountCode: $discountCode
  ) {
    checkout {
      id
      discountApplications(first: 10) {
        edges {
          node {
            ... on DiscountCodeApplication {
              code
              applicable
            }
          }
        }
      }
      totalPrice {
        amount
      }
    }
    checkoutUserErrors {
      field
      message
    }
  }
}
```

---

## 🔄 **Fluxo Completo com Storefront API**

### **Passo 1: Criar Carrinho**
```javascript
// Backend cria cart
const cart = await createCart([
  { variantId: "gid://shopify/ProductVariant/123", quantity: 2 },
  { variantId: "gid://shopify/ProductVariant/456", quantity: 1 }
]);

// Retorna: { cartId: "gid://shopify/Cart/abc123" }
```

### **Passo 2: Definir Endereço de Entrega**
```javascript
// Backend atualiza endereço no cart
await updateCartAddress(cartId, {
  address1: "Rua Exemplo, 123",
  city: "São Paulo",
  province: "SP",
  countryCode: "BR",
  zip: "01234-567"
});
```

### **Passo 3: Buscar Opções de Frete**
```javascript
// Backend busca opções de frete
const shippingRates = await getShippingRates(cartId);

// Retorna:
// [
//   { handle: "standard", title: "Padrão", cost: { amount: "15.00" } },
//   { handle: "express", title: "Expresso", cost: { amount: "25.00" } }
// ]
```

### **Passo 4: Selecionar Frete**
```javascript
// Backend atualiza frete selecionado
await selectShippingRate(cartId, "standard");
```

### **Passo 5: Criar Checkout**
```javascript
// Backend cria checkout
const checkout = await createCheckout(cartId, {
  email: "user@example.com",
  shippingAddress: { ... },
  shippingRateHandle: "standard"
});

// Retorna: { checkoutId: "...", webUrl: "..." }
```

### **Passo 6: Processar Pagamento**
```javascript
// Opção A: Redirecionar para webUrl (mais simples)
// Opção B: Integrar gateway de pagamento diretamente (mais complexo)
```

---

## 📊 **Comparação: WebView vs. Storefront API**

| Aspecto | WebView (Atual) | Storefront API |
|---------|----------------|----------------|
| **Velocidade** | ⚠️ Lento (carrega HTML) | ✅ Rápido (só API) |
| **UX** | ⚠️ WebView (não nativo) | ✅ UI nativa customizada |
| **Cálculo de Frete** | ⚠️ Scraping da página | ✅ API retorna opções |
| **Controle** | ⚠️ Limitado (depende do HTML) | ✅ Controle total |
| **Confiabilidade** | ⚠️ Frágil (muda com HTML) | ✅ Estável (API oficial) |
| **Manutenção** | ⚠️ Alta (scraping quebra) | ✅ Baixa (API estável) |
| **Cupons** | ⚠️ Difícil (scraping) | ✅ Fácil (mutation) |
| **Estoque** | ⚠️ Precisa verificar manualmente | ✅ API valida automaticamente |

---

## 🚀 **Implementação Proposta**

### **Fase 1: Cálculo de Frete (Mais Simples)**
- Substituir scraping por Storefront API
- Endpoint: `POST /api/orders/shipping-rates`
- Usar `cartBuyerIdentityUpdate` + `deliveryGroups`

### **Fase 2: Gerenciamento de Cart**
- Criar/atualizar cart via Storefront API
- Sincronizar com carrinho local do app
- Endpoint: `POST /api/cart/storefront`

### **Fase 3: Checkout Completo**
- Criar checkout via Storefront API
- Processar pagamento (opcional: gateway direto)
- Endpoint: `POST /api/checkout/create`

---

## ⚠️ **Limitações da Storefront API**

1. **Checkout API Deprecada**: A antiga Checkout API foi descontinuada
2. **Cart API**: Agora usa Cart API (parte da Storefront API)
3. **Pagamento**: Ainda precisa redirecionar para `webUrl` ou integrar gateway
4. **Shopify Plus**: Algumas funcionalidades requerem plano Plus

---

## 💡 **Recomendação**

**Começar pela Fase 1 (Cálculo de Frete)**:
- Impacto imediato na UX
- Reduz complexidade do código
- Não precisa mudar o app mobile ainda
- Pode manter WebView por enquanto, mas com frete via API

**Depois Fase 2 e 3**:
- Migrar completamente para Storefront API
- Remover WebView
- UI nativa customizada

---

## 📚 **Documentação Oficial**

- [Storefront API - Cart](https://shopify.dev/docs/api/storefront/latest/objects/Cart)
- [Storefront API - Checkout](https://shopify.dev/docs/api/storefront/latest/objects/Checkout)
- [Cart API Guide](https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate)

---

## ❓ **Próximos Passos**

Quer que eu implemente:
1. **Fase 1**: Cálculo de frete via Storefront API (substituir scraping)
2. **Fase 2**: Gerenciamento de cart via Storefront API
3. **Fase 3**: Checkout completo sem WebView

Ou prefere que eu explique mais detalhes sobre alguma parte específica?
