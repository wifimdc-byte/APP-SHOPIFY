# 🛒 Sistema de Compras Integrado com Shopify

## ✅ **Status: IMPLEMENTADO**

Sistema completo de compras integrado com a API do Shopify, permitindo que usuários do app façam compras diretamente através do Shopify.

## 🎯 **Funcionalidades Implementadas**

### 1. **Sistema de Carrinho**
- ✅ Adicionar produtos ao carrinho
- ✅ Atualizar quantidade de itens
- ✅ Remover itens do carrinho
- ✅ Visualizar carrinho completo
- ✅ Limpar carrinho
- ✅ Validação de estoque em tempo real
- ✅ Cálculo automático de preços (varejo/atacado)

### 2. **Checkout Integrado com Shopify**
- ✅ Criar pedidos diretamente no Shopify
- ✅ Sincronização com banco de dados local
- ✅ Validação de produtos e estoque
- ✅ Suporte a endereços de entrega e cobrança
- ✅ Rastreamento de pedidos via `shopify_order_id`

## 📡 **Endpoints da API**

### **Carrinho**

#### `GET /api/cart`
Obter carrinho do usuário autenticado

**Resposta:**
```json
{
  "success": true,
  "cart": {
    "items": [
      {
        "product_id": 1,
        "quantidade": 2,
        "produto": {
          "id": 1,
          "codigo": "10176508690737",
          "nome": "Produto Exemplo",
          "imagem_url": "https://...",
          "estoque": 10,
          "disponivel": true
        },
        "preco_unitario": 4.99,
        "subtotal": 9.98
      }
    ],
    "total": 9.98
  }
}
```

#### `POST /api/cart/items`
Adicionar item ao carrinho

**Body:**
```json
{
  "product_id": 1,
  "quantidade": 2
}
```

#### `PUT /api/cart/items/:product_id`
Atualizar quantidade de um item

**Body:**
```json
{
  "quantidade": 3
}
```

#### `DELETE /api/cart/items/:product_id`
Remover item do carrinho

#### `DELETE /api/cart`
Limpar carrinho completamente

### **Checkout**

#### `POST /api/orders/checkout`
Criar pedido integrado com Shopify

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "shipping_address": {
    "first_name": "João",
    "last_name": "Silva",
    "address1": "Rua Exemplo, 123",
    "address2": "Apto 45",
    "city": "São Paulo",
    "province": "SP",
    "country": "BR",
    "zip": "01234-567",
    "phone": "11999999999"
  },
  "billing_address": {
    // Opcional, se não fornecido usa shipping_address
    "first_name": "João",
    "last_name": "Silva",
    "address1": "Rua Exemplo, 123",
    "city": "São Paulo",
    "province": "SP",
    "country": "BR",
    "zip": "01234-567"
  },
  "use_cart": true,  // Usar carrinho do usuário (padrão: true)
  "items": null       // Se use_cart=false, fornecer array de items
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Pedido criado com sucesso",
  "order": {
    "id": 1,
    "shopify_order_id": "5678901234",
    "shopify_order_number": 1001,
    "total": 29.97,
    "status": "processando",
    "created_at": "2024-01-01T00:00:00Z",
    "shopify_order_url": "https://e4ec7f-f5.myshopify.com/admin/orders/5678901234"
  }
}
```

## 🔧 **Métodos do ShopifyService**

### `createOrder(items, customerInfo, shippingAddress, billingAddress)`
Cria um pedido diretamente no Shopify

### `createCheckout(items, customerInfo)`
Cria um Draft Order no Shopify (para checkout customizado)

### `completeDraftOrder(draftOrderId)`
Converte um Draft Order em Order completo

### `getProductVariant(productId)`
Busca a variante de um produto no Shopify pelo ID

### `getCheckoutURL(draftOrderId)`
Gera URL de checkout para um Draft Order

## 📊 **Estrutura do Banco de Dados**

### Tabela `melhor_casas_orders`
```sql
ALTER TABLE melhor_casas_orders 
ADD COLUMN shopify_order_id VARCHAR(50) UNIQUE;
```

A coluna `shopify_order_id` armazena o ID do pedido criado no Shopify para rastreamento.

## 🔄 **Fluxo de Compra**

1. **Usuário adiciona produtos ao carrinho**
   - `POST /api/cart/items`
   - Validação de estoque
   - Cálculo de preços

2. **Usuário visualiza carrinho**
   - `GET /api/cart`
   - Produtos enriquecidos com dados completos

3. **Usuário finaliza compra**
   - `POST /api/orders/checkout`
   - Validação de produtos e estoque
   - Busca variantes no Shopify
   - Cria order no Shopify
   - Salva order local no banco
   - Limpa carrinho

4. **Rastreamento**
   - Order local vinculado ao Shopify via `shopify_order_id`
   - Acesso ao pedido no admin do Shopify

## ⚠️ **Importante**

1. **Carrinho em Memória**: Atualmente o carrinho é armazenado em memória. Para produção, considere usar Redis ou banco de dados.

2. **Variantes do Produto**: O sistema busca automaticamente a primeira variante do produto no Shopify. Se seus produtos têm múltiplas variantes, você pode precisar ajustar a lógica.

3. **Estoque**: O sistema valida estoque antes de criar o pedido, mas recomenda-se também validar no Shopify.

4. **Pagamento**: Os pedidos são criados com `financial_status: 'pending'`. Você precisará integrar um gateway de pagamento ou processar pagamentos manualmente no Shopify.

## 🚀 **Próximos Passos (Opcional)**

- [ ] Integração com gateway de pagamento
- [ ] Webhooks do Shopify para atualizar status de pedidos
- [ ] Notificações por email/SMS
- [ ] Rastreamento de entrega
- [ ] Sistema de cupons/descontos
- [ ] Histórico de compras no app

## 📝 **Exemplo de Uso Completo**

```javascript
// 1. Adicionar produto ao carrinho
POST /api/cart/items
{
  "product_id": 1,
  "quantidade": 2
}

// 2. Ver carrinho
GET /api/cart

// 3. Finalizar compra
POST /api/orders/checkout
{
  "shipping_address": {
    "first_name": "João",
    "last_name": "Silva",
    "address1": "Rua Exemplo, 123",
    "city": "São Paulo",
    "province": "SP",
    "country": "BR",
    "zip": "01234-567",
    "phone": "11999999999"
  }
}
```

## ✅ **Testes**

Para testar o sistema:

1. Certifique-se de que as tabelas existem no banco
2. Execute a migração: `node src/database/migrate-shopify-orders.js`
3. Inicie o servidor: `npm start`
4. Teste os endpoints usando Postman ou similar

---

**Sistema de compras integrado com Shopify implementado com sucesso!** 🎉


