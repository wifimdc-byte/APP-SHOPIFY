# 🔐 Storefront API - Autenticação de Clientes e Checkout Vinculado

## 📋 **Como Funciona a Autenticação na Storefront API**

### **1. Customer Access Token**

A Storefront API usa **Customer Access Token** para autenticar clientes. É diferente do Admin API token.

**Fluxo:**
1. Cliente faz login com email + senha
2. Backend chama `customerAccessTokenCreate` mutation
3. Shopify retorna um `customerAccessToken`
4. Esse token é usado em todas as requisições subsequentes
5. Token expira (geralmente 1 ano)

---

## 🔑 **Login com Storefront API**

### **Mutation: customerAccessTokenCreate**

```graphql
mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
  customerAccessTokenCreate(input: $input) {
    customerAccessToken {
      accessToken
      expiresAt
    }
    customerUserErrors {
      field
      message
      code
    }
  }
}
```

**Variáveis:**
```json
{
  "input": {
    "email": "user@example.com",
    "password": "senha123"
  }
}
```

**Resposta de Sucesso:**
```json
{
  "data": {
    "customerAccessTokenCreate": {
      "customerAccessToken": {
        "accessToken": "cpt_abc123xyz...",
        "expiresAt": "2026-12-06T12:00:00Z"
      },
      "customerUserErrors": []
    }
  }
}
```

**Resposta de Erro:**
```json
{
  "data": {
    "customerAccessTokenCreate": {
      "customerAccessToken": null,
      "customerUserErrors": [
        {
          "field": ["email"],
          "message": "Unidentified customer",
          "code": "UNIDENTIFIED_CUSTOMER"
        }
      ]
    }
  }
}
```

---

## 📦 **Buscar Pedidos do Cliente**

### **Query: customer (com Access Token)**

```graphql
query getCustomer($customerAccessToken: String!) {
  customer(customerAccessToken: $customerAccessToken) {
    id
    firstName
    lastName
    email
    phone
    defaultAddress {
      address1
      city
      province
      countryCodeV2
      zip
    }
    addresses(first: 10) {
      edges {
        node {
          id
          address1
          address2
          city
          province
          countryCodeV2
          zip
          phone
        }
      }
    }
    orders(first: 20) {
      edges {
        node {
          id
          orderNumber
          name
          email
          phone
          processedAt
          totalPrice {
            amount
            currencyCode
          }
          subtotalPrice {
            amount
            currencyCode
          }
          totalShippingPrice {
            amount
            currencyCode
          }
          totalTax {
            amount
            currencyCode
          }
          fulfillmentStatus
          financialStatus
          statusUrl
          lineItems(first: 50) {
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
                  image {
                    url
                  }
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

**Variáveis:**
```json
{
  "customerAccessToken": "cpt_abc123xyz..."
}
```

---

## 🛒 **Checkout Vinculado à Conta do Cliente**

### **Como Vincular Cart ao Cliente**

Quando você cria um **Cart** e define o **Buyer Identity** com o `customerAccessToken`, o checkout fica vinculado à conta do cliente.

#### **1. Criar Cart com Buyer Identity**

```graphql
mutation cartCreate($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      id
      checkoutUrl
      buyerIdentity {
        email
        customer {
          id
          email
        }
      }
    }
  }
}
```

**Variáveis:**
```json
{
  "input": {
    "lines": [
      {
        "merchandiseId": "gid://shopify/ProductVariant/123",
        "quantity": 2
      }
    ],
    "buyerIdentity": {
      "customerAccessToken": "cpt_abc123xyz..."
    }
  }
}
```

#### **2. Atualizar Buyer Identity em Cart Existente**

```graphql
mutation cartBuyerIdentityUpdate(
  $cartId: ID!
  $buyerIdentity: CartBuyerIdentityInput!
) {
  cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
    cart {
      id
      buyerIdentity {
        email
        customer {
          id
          email
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variáveis:**
```json
{
  "cartId": "gid://shopify/Cart/abc123",
  "buyerIdentity": {
    "customerAccessToken": "cpt_abc123xyz..."
  }
}
```

---

## 🔄 **Fluxo Completo: Login → Checkout Vinculado**

### **Passo 1: Cliente faz Login**
```javascript
// Backend recebe email + senha
const { email, password } = req.body;

// Criar Customer Access Token via Storefront API
const tokenResponse = await shopifyService.createCustomerAccessToken(email, password);

if (tokenResponse.customerAccessToken) {
  const customerToken = tokenResponse.customerAccessToken.accessToken;
  const expiresAt = tokenResponse.customerAccessToken.expiresAt;
  
  // Salvar token no banco (associado ao usuário)
  await db.query(`
    UPDATE melhor_casas_users 
    SET shopify_customer_token = $1, 
        shopify_customer_token_expires = $2
    WHERE email = $3
  `, [customerToken, expiresAt, email]);
  
  // Retornar token para o app
  return res.json({
    success: true,
    customerAccessToken: customerToken,
    expiresAt: expiresAt
  });
}
```

### **Passo 2: Criar Cart Vinculado ao Cliente**
```javascript
// Quando cliente adiciona produtos ao carrinho
const cart = await shopifyService.createCartWithCustomer(
  lineItems,
  customerAccessToken // Token do cliente
);

// Cart agora está vinculado à conta do cliente
// checkoutUrl já terá os dados do cliente pré-preenchidos
```

### **Passo 3: Buscar Dados do Cliente**
```javascript
// Buscar informações completas do cliente
const customer = await shopifyService.getCustomer(customerAccessToken);

// Retorna:
// - Dados pessoais (nome, email, telefone)
// - Endereços salvos
// - Histórico de pedidos
```

### **Passo 4: Checkout com Dados Pré-preenchidos**
```javascript
// Quando criar checkout, o cart já tem buyerIdentity
// O checkoutUrl já terá:
// - Email do cliente
// - Endereços salvos disponíveis
// - Histórico de compras
// - Descontos aplicáveis ao cliente
```

---

## 📊 **Comparação: Checkout Anônimo vs. Autenticado**

| Aspecto | Checkout Anônimo | Checkout Autenticado |
|---------|------------------|----------------------|
| **Criação do Cart** | Sem `buyerIdentity` | Com `customerAccessToken` |
| **Email** | Precisa preencher | Já vem preenchido |
| **Endereços** | Precisa digitar | Pode escolher dos salvos |
| **Histórico** | Não vê pedidos anteriores | Vê histórico completo |
| **Descontos** | Apenas cupons públicos | Cupons + descontos do cliente |
| **Rastreamento** | Limitado | Completo (vinculado à conta) |

---

## 🎯 **Vantagens do Checkout Autenticado**

1. **Melhor UX**: Dados pré-preenchidos
2. **Endereços Salvos**: Cliente escolhe entre endereços já cadastrados
3. **Histórico**: Vê pedidos anteriores
4. **Descontos**: Aplica descontos específicos do cliente
5. **Rastreamento**: Pedidos vinculados à conta
6. **Abandono de Carrinho**: Shopify pode enviar emails de recuperação

---

## ⚠️ **Importante: Permissões Necessárias**

Para usar Customer Access Token, você precisa:

1. **Scope no App**: `unauthenticated_read_customers`
   - Permite criar customer access tokens
   - Permite buscar dados do cliente

2. **Verificar Permissões**:
   ```bash
   # Verificar se o app tem a permissão
   node check-token-permissions.js
   ```

3. **Se não tiver**: Precisa adicionar no Shopify Partners Dashboard

---

## 🔧 **Implementação Proposta**

### **1. Endpoint de Login com Storefront API**

```javascript
POST /api/auth/login-storefront
{
  "email": "user@example.com",
  "password": "senha123"
}

// Resposta:
{
  "success": true,
  "customerAccessToken": "cpt_abc123...",
  "expiresAt": "2026-12-06T12:00:00Z",
  "customer": {
    "id": "gid://shopify/Customer/123",
    "email": "user@example.com",
    "firstName": "João",
    "lastName": "Silva"
  }
}
```

### **2. Endpoint para Buscar Pedidos**

```javascript
GET /api/customer/orders
Headers: {
  "X-Customer-Access-Token": "cpt_abc123..."
}

// Resposta:
{
  "success": true,
  "orders": [
    {
      "id": "gid://shopify/Order/123",
      "orderNumber": 1001,
      "totalPrice": "29.97",
      "processedAt": "2025-12-01T10:00:00Z",
      "statusUrl": "https://...",
      "lineItems": [...]
    }
  ]
}
```

### **3. Criar Cart Vinculado**

```javascript
POST /api/cart/storefront/create
Headers: {
  "X-Customer-Access-Token": "cpt_abc123..." // Opcional
}
Body: {
  "items": [
    { "variantId": "gid://shopify/ProductVariant/123", "quantity": 2 }
  ]
}

// Se tiver customerAccessToken, cart fica vinculado
// Se não tiver, cart é anônimo
```

---

## 💡 **Recomendação de Implementação**

### **Opção A: Híbrida (Recomendada)**
- **Login**: Usar Storefront API para obter `customerAccessToken`
- **Salvar token**: No banco associado ao usuário
- **Cart**: Sempre criar com `customerAccessToken` se disponível
- **Checkout**: Automaticamente vinculado à conta

### **Opção B: Completa Storefront**
- Tudo via Storefront API
- Remover sistema de login atual
- Usar apenas Customer Access Token

---

## ❓ **Respostas às Suas Dúvidas**

### **1. "Como fica a parte do login?"**
- ✅ Pode usar Storefront API: `customerAccessTokenCreate`
- ✅ Ou manter login atual e obter token depois
- ✅ Token é salvo e usado em todas as requisições

### **2. "Dá pra pegar pedidos?"**
- ✅ Sim! Query `customer` retorna `orders`
- ✅ Inclui histórico completo, status, itens, etc.

### **3. "Checkout vinculado à conta?"**
- ✅ Sim! Passar `customerAccessToken` no `buyerIdentity` do cart
- ✅ Checkout fica automaticamente vinculado
- ✅ Dados pré-preenchidos, endereços salvos, etc.

---

## 🚀 **Próximos Passos**

Quer que eu implemente:
1. **Login via Storefront API** (obter customerAccessToken)
2. **Buscar pedidos do cliente** (query customer)
3. **Criar cart vinculado** (com customerAccessToken no buyerIdentity)

Ou prefere que eu explique mais detalhes sobre alguma parte específica?
