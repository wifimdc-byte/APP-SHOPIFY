# 🚀 Deploy no Render - Passo a Passo

Guia completo para fazer deploy do backend no Render.

## 📋 Pré-requisitos

1. Conta no Render (gratuita): [render.com](https://render.com)
2. Repositório no GitHub já configurado
3. Arquivo `.env` com todas as variáveis de ambiente

---

## 🔧 Passo 1: Criar Banco de Dados PostgreSQL

1. Acesse [dashboard.render.com](https://dashboard.render.com)
2. Clique em **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name:** `melhor-das-casas-db`
   - **Database:** `melhor_das_casas` (ou deixe padrão)
   - **User:** `melhor_das_casas_user` (ou deixe padrão)
   - **Region:** Escolha mais próximo (ex: `Oregon (US West)`)
   - **PostgreSQL Version:** `16` (ou mais recente)
   - **Plan:** `Free` (para começar)
4. Clique em **"Create Database"**
5. ⚠️ **IMPORTANTE:** Anote as credenciais que aparecem:
   - **Internal Database URL** (use esta no backend)
   - **Host, Port, Database, User, Password**

---

## 🌐 Passo 2: Criar Web Service (Backend)

1. No dashboard do Render, clique em **"New +"** → **"Web Service"**
2. Conecte seu repositório GitHub:
   - Se ainda não conectou, clique em **"Connect account"**
   - Autorize o Render a acessar seus repositórios
   - Selecione o repositório `GhuntterDev/APP-SHOPIFY`
3. Configure o serviço:

### Configurações Básicas:
- **Name:** `melhor-das-casas-backend`
- **Region:** Mesma do banco de dados
- **Branch:** `master` (ou `main`)
- **Root Directory:** `backend` ⚠️ **IMPORTANTE!**
- **Runtime:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Plan:** `Free` (para começar)

### Variáveis de Ambiente:

Clique em **"Advanced"** → **"Add Environment Variable"** e adicione:

```env
# Node
NODE_ENV=production
PORT=10000

# Database (use os valores do PostgreSQL criado)
DB_HOST=<host-do-postgres>
DB_PORT=5432
DB_NAME=<nome-do-banco>
DB_USER=<usuario-do-banco>
DB_PASSWORD=<senha-do-banco>
DB_SSL=true

# Shopify
SHOPIFY_STORE_URL=sua-loja.myshopify.com
SHOPIFY_API_KEY=sua-api-key
SHOPIFY_API_SECRET=sua-api-secret
SHOPIFY_API_VERSION=2024-01

# JWT
JWT_SECRET=seu-jwt-secret-super-seguro-aqui

# App
APP_BASE_URL=https://melhor-das-casas-backend.onrender.com
DEFAULT_REVIEW_COUNTRY=BR
DEFAULT_REVIEW_EMAIL=avaliacao@melhordascasas.com.br
```

⚠️ **Dica:** Para pegar as credenciais do PostgreSQL:
- Vá no dashboard do banco de dados
- Na aba **"Connections"**, você verá:
  - **Internal Database URL** (use esta, ou extraia host/port/user/password)
  - **Hostname, Port, Database, Username, Password**

### Health Check:
- **Health Check Path:** `/api/health`

4. Clique em **"Create Web Service"**

---

## 🔄 Passo 3: Rodar Migrations

Após o primeiro deploy, você precisa rodar as migrations:

1. No dashboard do serviço, vá em **"Shell"**
2. Execute:
   ```bash
   npm run migrate
   ```

Ou configure um script de build que rode migrations automaticamente.

---

## 📝 Passo 4: Atualizar URL no App Mobile

1. Após o deploy, Render fornece uma URL tipo:
   `https://melhor-das-casas-backend.onrender.com`

2. Atualize `mobile-v54/app.json`:
   ```json
   "extra": {
     "apiUrl": "https://melhor-das-casas-backend.onrender.com/api"
   }
   ```

3. Gere novo APK:
   ```bash
   cd mobile-v54
   eas build -p android --profile preview
   ```

---

## ⚙️ Configurações Adicionais

### Auto-Deploy:
- Render faz deploy automático a cada push no GitHub
- Você pode desabilitar em **Settings** → **Auto-Deploy**

### Custom Domain (Opcional):
- Em **Settings** → **Custom Domains**
- Adicione seu domínio (ex: `api.melhordascasas.com.br`)

### Logs:
- Veja logs em tempo real em **"Logs"** no dashboard
- Útil para debug

---

## ⚠️ Limitações do Plano Gratuito

- **Sleep após inatividade:** Servidor "dorme" após 15min sem requisições
- **Primeira requisição:** Pode demorar ~30-60s para "acordar"
- **Limite de recursos:** CPU/RAM limitados (suficiente para testes)

**Solução:** Para produção, considere o plano **Starter ($7/mês)** que não dorme.

---

## 🐛 Troubleshooting

### Erro: "Cannot connect to database"
- Verifique se `DB_HOST` está usando o **Internal Database URL** ou hostname interno
- No Render, serviços na mesma região podem usar **Internal Database URL**
- Verifique se `DB_SSL=true` está configurado

### Erro: "Port already in use"
- Render define `PORT` automaticamente via variável de ambiente
- Não precisa definir `PORT` manualmente (mas pode definir como fallback)

### Build falha
- Verifique logs em **"Logs"** → **"Build Logs"**
- Certifique-se que `Root Directory` está como `backend`
- Verifique se todas as dependências estão em `package.json`

### Uploads não funcionam
- No plano gratuito, arquivos são temporários
- Considere usar **AWS S3**, **Cloudflare R2**, ou **Cloudinary** para uploads persistentes

---

## ✅ Checklist Final

- [ ] PostgreSQL criado e credenciais anotadas
- [ ] Web Service criado com `Root Directory: backend`
- [ ] Todas as variáveis de ambiente configuradas
- [ ] Deploy concluído com sucesso
- [ ] Migrations rodadas (`npm run migrate`)
- [ ] Health check funcionando (`/api/health`)
- [ ] URL atualizada no `app.json`
- [ ] Novo APK gerado e testado

---

## 🎉 Pronto!

Seu backend está rodando 24/7 no Render! 🚀

A URL será algo como: `https://melhor-das-casas-backend.onrender.com`

Precisa de ajuda? Me avise!














