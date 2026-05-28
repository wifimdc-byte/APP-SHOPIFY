# 🔄 Sincronização Automática de Produtos

## 📋 Visão Geral

O sistema agora possui **sincronização automática** de produtos do Shopify para o banco de dados. Isso garante que os produtos sempre estejam atualizados no app, mesmo quando alterados diretamente no Shopify.

## ⚙️ Como Funciona

### 1. **Sincronização Automática Periódica**
- A sincronização roda automaticamente a cada **60 minutos** (configurável)
- Executa quando o servidor inicia
- Sincroniza **todos os produtos** do Shopify para o banco de dados

### 2. **Configuração**

#### Variáveis de Ambiente:
```env
# Habilitar/desabilitar sincronização automática (padrão: habilitado)
AUTO_SYNC_ENABLED=true

# Intervalo entre sincronizações em minutos (padrão: 60 minutos)
AUTO_SYNC_INTERVAL_MINUTES=60
```

#### Exemplos:
```env
# Sincronizar a cada 30 minutos
AUTO_SYNC_INTERVAL_MINUTES=30

# Sincronizar a cada 2 horas
AUTO_SYNC_INTERVAL_MINUTES=120

# Desabilitar sincronização automática
AUTO_SYNC_ENABLED=false
```

## 🚀 Endpoints da API

### 1. **Verificar Status da Sincronização**
```http
GET /api/shopify/sync/status
```

**Resposta:**
```json
{
  "success": true,
  "status": {
    "isRunning": true,
    "isSyncing": false,
    "lastSyncTime": "2025-12-03T14:00:00.000Z",
    "syncIntervalMinutes": 60,
    "nextSyncTime": "2025-12-03T15:00:00.000Z"
  }
}
```

### 2. **Forçar Sincronização Imediata**
```http
POST /api/shopify/sync/force
```

**Resposta:**
```json
{
  "success": true,
  "message": "Sincronização forçada concluída",
  "status": {
    "isRunning": true,
    "isSyncing": false,
    "lastSyncTime": "2025-12-03T14:05:00.000Z",
    "syncIntervalMinutes": 60,
    "nextSyncTime": "2025-12-03T15:05:00.000Z"
  }
}
```

### 3. **Sincronização Manual (Original)**
```http
POST /api/shopify/sync
```

## 📊 Logs

O sistema gera logs detalhados sobre a sincronização:

```
🔄 [AutoSync] Iniciando sincronização automática de produtos...
✅ [AutoSync] Sincronização concluída em 45s
📊 [AutoSync] Produtos processados: 1977
➕ [AutoSync] Novos produtos: 0
🔄 [AutoSync] Produtos atualizados: 15
⏰ [AutoSync] Próxima sincronização em 60 minutos
```

## 🔍 Monitoramento

### Verificar se está funcionando:
1. Acesse os logs do Render
2. Procure por mensagens `[AutoSync]`
3. Verifique se há sincronizações periódicas

### Verificar status via API:
```bash
curl https://app-shopify-hayo.onrender.com/api/shopify/sync/status
```

## ⚠️ Observações Importantes

1. **Primeira Execução**: A sincronização roda imediatamente quando o servidor inicia
2. **Evita Duplicação**: Se uma sincronização já estiver em andamento, novas execuções são ignoradas
3. **Performance**: A sincronização processa produtos em lotes de 100 para melhor performance
4. **Webhooks**: Os webhooks do Shopify continuam funcionando para atualizações em tempo real

## 🛠️ Troubleshooting

### Sincronização não está rodando:
1. Verifique se `AUTO_SYNC_ENABLED` não está definido como `false`
2. Verifique os logs do servidor para erros
3. Tente forçar uma sincronização manual via API

### Produtos não estão atualizando:
1. Verifique se a sincronização está rodando (`GET /api/shopify/sync/status`)
2. Verifique os logs para ver se há erros
3. Force uma sincronização manual (`POST /api/shopify/sync/force`)

## 📝 Notas

- A sincronização automática **não substitui** os webhooks do Shopify
- Webhooks são mais rápidos (tempo real)
- Sincronização automática garante que nada seja perdido mesmo se webhooks falharem
- Recomendado: manter ambos habilitados para máxima confiabilidade







