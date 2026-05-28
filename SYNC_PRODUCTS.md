# Sincronização de Produtos

Este documento explica como funciona a sincronização de produtos do Shopify para o banco de dados.

## Sincronização Automática

A sincronização automática está configurada no arquivo `src/services/autoSyncService.js` e é iniciada automaticamente quando o servidor inicia.

### O que é sincronizado automaticamente:

- ✅ **Nome do produto** (`nome`)
- ✅ **Preços** (`preco_varejo`, `preco_atacado`, `preco_exclusivo`)
- ✅ **Categoria** (`categoria`)
- ✅ **Descrição** (`descricao`)
- ✅ **Imagens** (`imagem_url`, `imagens`)
- ✅ **Estoque** (`estoque`)
- ✅ **Disponibilidade** (`disponivel`)
- ✅ **Tags** (`tags`)

### Configuração

A sincronização automática pode ser configurada através de variáveis de ambiente:

- `AUTO_SYNC_INTERVAL_MINUTES`: Intervalo em minutos entre sincronizações (padrão: 60 minutos)
- `AUTO_SYNC_COLLECTION_ID`: ID da coleção do Shopify para sincronizar (opcional)
- `AUTO_SYNC_FILTER_TAG`: Tag para filtrar produtos (padrão: 'APP')
- `AUTO_SYNC_MAX_PRODUCTS`: Limite máximo de produtos a sincronizar (padrão: 3000)

### Exemplo de configuração (.env):

```env
AUTO_SYNC_INTERVAL_MINUTES=30
AUTO_SYNC_COLLECTION_ID=493837648177
AUTO_SYNC_FILTER_TAG=APP
AUTO_SYNC_MAX_PRODUCTS=3000
```

## Scripts Manuais

### 1. Sincronizar todas as imagens

Atualiza apenas as imagens de todos os produtos:

```bash
node backend/sync-all-products-images.js
```

### 2. Sincronizar nomes e preços

Atualiza apenas nomes e preços de todos os produtos:

```bash
node backend/sync-all-products-prices-names.js
```

### 3. Sincronizar um produto específico

Atualiza todas as informações de um produto específico:

```bash
node backend/sync-product-images.js <codigo_shopify>
```

Exemplo:
```bash
node backend/sync-product-images.js 10459007090993
```

## Endpoints da API

### Forçar sincronização completa

```http
POST /api/shopify/sync/force
```

Força uma sincronização completa imediata (ignora o intervalo configurado).

### Status da sincronização

```http
GET /api/shopify/sync/status
```

Retorna o status atual da sincronização automática.

## Notas Importantes

1. **Rate Limiting**: A API do Shopify tem limites de requisições. Os scripts incluem delays para evitar exceder esses limites.

2. **Performance**: A sincronização completa pode levar vários minutos dependendo da quantidade de produtos.

3. **Logs**: Todos os scripts e a sincronização automática geram logs detalhados para acompanhamento.

4. **Erros**: Se um produto não for encontrado no Shopify ou houver erro na API, ele será pulado e o processo continuará.







