# 🔄 Configuração de Sincronização por Coleção

## 📋 Problema Resolvido

A sincronização automática estava buscando **todos os produtos** do Shopify (48250 produtos) quando deveria sincronizar apenas os produtos de uma coleção específica (~1400 produtos).

## ✅ Solução

Agora a sincronização pode ser configurada para sincronizar apenas produtos de uma coleção específica usando a variável de ambiente `AUTO_SYNC_COLLECTION_ID`.

## ⚙️ Configuração no Render

### 1. Acesse o Dashboard do Render
- Vá para https://dashboard.render.com
- Selecione seu serviço backend

### 2. Configure a Variável de Ambiente

1. Vá em **Environment**
2. Clique em **Add Environment Variable**
3. Adicione:
   - **Key**: `AUTO_SYNC_COLLECTION_ID`
   - **Value**: `493837648177` (ID da sua coleção)
4. Clique em **Save Changes**

### 3. Reinicie o Serviço

Após adicionar a variável, o Render reiniciará automaticamente o serviço.

## 📊 Como Funciona

- **Com `AUTO_SYNC_COLLECTION_ID` configurado**: Sincroniza apenas produtos da coleção especificada
- **Sem `AUTO_SYNC_COLLECTION_ID`**: Sincroniza todos os produtos (comportamento antigo)

## 🔍 Verificar se Está Funcionando

Após configurar, verifique os logs do Render. Você deve ver:

```
🔄 [AutoSync] Iniciando sincronização automática da coleção 493837648177...
🔄 Iniciando sincronização com Shopify...
📋 Modo: Coleção específica (ID: 493837648177)
📦 Total de produtos encontrados na coleção: ~1400
```

Ao invés de:

```
📦 Total de produtos encontrados: 48250
```

## 🚀 Endpoints Disponíveis

### Verificar Status
```bash
GET /api/shopify/sync/status
```

Retorna:
```json
{
  "success": true,
  "status": {
    "isRunning": true,
    "collectionId": "493837648177",
    "lastSyncTime": "...",
    "syncIntervalMinutes": 60
  }
}
```

### Forçar Sincronização
```bash
POST /api/shopify/sync/force
```

## 📝 Notas

- A coleção ID `493837648177` corresponde à coleção que você especificou
- A sincronização continua rodando automaticamente a cada 60 minutos (ou intervalo configurado)
- Apenas produtos dessa coleção serão sincronizados







